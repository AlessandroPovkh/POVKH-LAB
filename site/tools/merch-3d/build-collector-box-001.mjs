import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, inspect, prune } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const sourcePath = path.join(here, "collector-box-001.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/collector-box-001.glb");
const reportPath = path.join(here, "reports/collector-box-001.report.json");
const validatorPath = path.join(here, "reports/collector-box-001.validator.json");
const inspectPath = path.join(here, "reports/collector-box-001.inspect.json");
const verifyOnly = process.argv.includes("--verify");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const mm = (value) => value / 1000;

class Geometry {
  constructor() { this.positions=[]; this.normals=[]; this.tangents=[]; this.uvs=[]; this.indices=[]; }
  vertex(position, normal, uv=[0,0]) { const index=this.positions.length/3;const projected=[1-normal[0]*normal[0],-normal[0]*normal[1],-normal[0]*normal[2]],length=Math.hypot(...projected);const tangent=length>1e-6?projected.map(value=>value/length):[0,1,0];this.positions.push(...position);this.normals.push(...normal);this.tangents.push(...tangent,1);this.uvs.push(...uv);return index; }
  quad(points, normal, uvs=[[0,0],[1,0],[1,1],[0,1]]) { const v=points.map((point,index)=>this.vertex(point,normal,uvs[index])); this.indices.push(v[0],v[1],v[2],v[0],v[2],v[3]); }
}

const addBox=(g,[cx,cy,cz],[sx,sy,sz])=>{
  const [x0,x1]=[cx-sx/2,cx+sx/2],[y0,y1]=[cy-sy/2,cy+sy/2],[z0,z1]=[cz-sz/2,cz+sz/2];
  g.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1]);g.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1]);
  g.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0]);g.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0]);
  g.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0]);g.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0]);
};

const roundedOutline=(width,height,radius,segments=9)=>{const points=[],hw=width/2,hh=height/2,r=Math.min(radius,hw,hh);for(const [cx,cy,start] of [[hw-r,-hh+r,-Math.PI/2],[hw-r,hh-r,0],[-hw+r,hh-r,Math.PI/2],[-hw+r,-hh+r,Math.PI]])for(let step=0;step<segments;step+=1){const angle=start+(step/(segments-1))*Math.PI/2;points.push([cx+Math.cos(angle)*r,cy+Math.sin(angle)*r]);}return points;};
const addRoundedBeveledBox=(g,[cx,cy,cz],[width,height,depth],radius,bevel)=>{
  const inner=roundedOutline(width-2*bevel,height-2*bevel,Math.max(radius-bevel,bevel)),outer=roundedOutline(width,height,radius);
  const ring=(outline,z,normal)=>outline.map(([x,y])=>g.vertex([cx+x,cy+y,cz+z],normal,[x/width+0.5,1-(y/height+0.5)]));
  const face=(outline,z,normal,reverse)=>{const centre=g.vertex([cx,cy,cz+z],normal,[0.5,0.5]),vertices=ring(outline,z,normal);for(let i=0;i<vertices.length;i+=1){const j=(i+1)%vertices.length;if(reverse)g.indices.push(centre,vertices[j],vertices[i]);else g.indices.push(centre,vertices[i],vertices[j]);}};
  face(inner,depth/2,[0,0,1],false);face(inner,-depth/2,[0,0,-1],true);
  const connect=(a,zA,b,zB,nz)=>{for(let i=0;i<a.length;i+=1){const j=(i+1)%a.length,mx=(a[i][0]+a[j][0]+b[i][0]+b[j][0])/4,my=(a[i][1]+a[j][1]+b[i][1]+b[j][1])/4,len=Math.hypot(mx,my)||1,nlen=Math.hypot(mx/len,my/len,nz),normal=[mx/len/nlen,my/len/nlen,nz/nlen];g.quad([[cx+a[i][0],cy+a[i][1],cz+zA],[cx+a[j][0],cy+a[j][1],cz+zA],[cx+b[j][0],cy+b[j][1],cz+zB],[cx+b[i][0],cy+b[i][1],cz+zB]],normal);}};
  connect(outer,depth/2-bevel,inner,depth/2,0.5);connect(outer,-depth/2+bevel,outer,depth/2-bevel,0);connect(inner,-depth/2,outer,-depth/2+bevel,-0.5);
};

const addFrontQuad=(g,width,height,centreY,z)=>g.quad([[-width/2,centreY-height/2,z],[width/2,centreY-height/2,z],[width/2,centreY+height/2,z],[-width/2,centreY+height/2,z]],[0,0,1],[[0,1],[1,1],[1,0],[0,0]]);
const addTopQuad=(g)=>g.quad([[-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5],[-0.5,0,0.5]],[0,1,0],[[0,1],[1,1],[1,0],[0,0]]);
const addCylinderY=(g,[cx,cy,cz],radius,height,segments=40)=>{const y0=cy-height/2,y1=cy+height/2,top=g.vertex([cx,y1,cz],[0,1,0],[0.5,0.5]),bottom=g.vertex([cx,y0,cz],[0,-1,0],[0.5,0.5]);for(let step=0;step<segments;step+=1){const next=(step+1)%segments,a=step/segments*Math.PI*2,b=next/segments*Math.PI*2,p0=[cx+Math.cos(a)*radius,y0,cz+Math.sin(a)*radius],p1=[cx+Math.cos(b)*radius,y0,cz+Math.sin(b)*radius],p2=[cx+Math.cos(b)*radius,y1,cz+Math.sin(b)*radius],p3=[cx+Math.cos(a)*radius,y1,cz+Math.sin(a)*radius],n0=[Math.cos(a),0,Math.sin(a)],n1=[Math.cos(b),0,Math.sin(b)],v0=g.vertex(p0,n0),v1=g.vertex(p1,n1),v2=g.vertex(p2,n1),v3=g.vertex(p3,n0),tb0=g.vertex(p0,[0,-1,0]),tb1=g.vertex(p1,[0,-1,0]),tt0=g.vertex(p3,[0,1,0]),tt1=g.vertex(p2,[0,1,0]);g.indices.push(v0,v1,v2,v0,v2,v3,bottom,tb1,tb0,top,tt0,tt1);}};
const createMaterial=(doc,name,preset)=>doc.createMaterial(name).setBaseColorFactor(preset.baseColor).setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness).setDoubleSided(true);
const primitiveFor=(doc,buffer,name,g,material)=>doc.createPrimitive().setAttribute("POSITION",doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(g.positions)).setBuffer(buffer)).setAttribute("NORMAL",doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(g.normals)).setBuffer(buffer)).setAttribute("TANGENT",doc.createAccessor(`${name}_TANGENT`).setType("VEC4").setArray(new Float32Array(g.tangents)).setBuffer(buffer)).setAttribute("TEXCOORD_0",doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(g.uvs)).setBuffer(buffer)).setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint32Array(g.indices)).setBuffer(buffer)).setMaterial(material);
const addMeshNode=(doc,parent,buffer,name,g,material,translation=[0,0,0],extras={})=>{const node=doc.createNode(name).setTranslation(translation).setExtras(extras).setMesh(doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc,buffer,name,g,material)));parent.addChild(node);return node;};
const meshFor=(doc,buffer,name,g,material)=>doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc,buffer,name,g,material));
const addInstance=(doc,parent,name,mesh,{translation=[0,0,0],scale=[1,1,1],rotation=[0,0,0,1],extras={}}={})=>{const node=doc.createNode(name).setTranslation(translation).setScale(scale).setRotation(rotation).setExtras(extras).setMesh(mesh);parent.addChild(node);return node;};

const createBookclothNormal=async(source)=>{
  const reference=source.derivedMaterials.bookclothNormal,bytes=await readFile(path.join(here,reference.path));
  assert.equal(sha256(bytes),reference.sha256,"bookcloth normal fixture drift");
  return bytes;
};

const verifySources=async(source)=>{
  const authority={};for(const [key,entry] of Object.entries(source.canonicalSource)){const bytes=await readFile(path.join(here,entry.fixturePath));assert.equal(sha256(bytes),entry.fixtureSha256,`${key} fixture drift`);const fixture=JSON.parse(bytes);assert.equal(fixture.authorityType,"governed-minimal-copy");assert.equal(fixture.canonicalPath,entry.path);assert.equal(fixture.canonicalSha256,entry.sha256);authority[key]={fixturePath:entry.fixturePath,fixtureSha256:entry.fixtureSha256,canonicalPath:entry.path,canonicalSha256:entry.sha256,...(entry.application?{application:entry.application}:{})};}
  const identity={};for(const [key,entry] of Object.entries(source.identity)){const bytes=await readFile(path.join(here,entry.path));assert.equal(sha256(bytes),entry.sha256,`${key} identity drift`);identity[key]={path:entry.path,sha256:entry.sha256,application:entry.application,bytes:bytes.byteLength};}
  const derivedMaterials={};for(const [key,entry] of Object.entries(source.derivedMaterials)){const bytes=await readFile(path.join(here,entry.path));assert.equal(sha256(bytes),entry.sha256,`${key} derived material drift`);derivedMaterials[key]={path:entry.path,sha256:entry.sha256,method:entry.method,bytes:bytes.byteLength};}return {authority,identity,derivedMaterials};
};

const buildDocument=async(source)=>{
  const doc=new Document(),scene=doc.createScene("Collector_Box_001_Default_Open_Archive_Set");doc.getRoot().setDefaultScene(scene);
  const buffer=doc.createBuffer("Collector_Box_001_Buffer"),assembly=doc.createNode("Collector_Box_001_Centred_Grounded_Pivot").setExtras({groundY:0,pivotPolicy:"open-assembly-centred",releasedState:"default-open-archive-set",conceptStatus:"visual-concept-not-manufacturing-reference",machinable:false});scene.addChild(assembly);
  const clothBytes=await createBookclothNormal(source),clothTexture=doc.createTexture("Collector_Box_001_Bookcloth_Normal").setImage(clothBytes).setMimeType("image/png").setExtras({proceduralRecipe:"pvkh-bookcloth-normal-v1",containsIdentity:false,derivedRasterSha256:sha256(clothBytes)});
  const board=createMaterial(doc,"MAT_VOID_PAPER_WRAPPED_BOARD",source.materials.board).setNormalTexture(clothTexture);
  const bone=createMaterial(doc,"MAT_BONE_LINING_AND_PAPER",source.materials.bone),tray=createMaterial(doc,"MAT_DARK_MODULAR_TRAY",source.materials.tray),zine=createMaterial(doc,"MAT_VOID_ZINE",source.materials.zine),cassette=createMaterial(doc,"MAT_SMOKE_CASSETTE",source.materials.cassette).setAlphaMode("BLEND"),disc=createMaterial(doc,"MAT_OPTICAL_DISC",source.materials.disc),dataKey=createMaterial(doc,"MAT_DATA_KEY",source.materials.dataKey),signal=createMaterial(doc,"MAT_SIGNAL_RED_PULL_TAB",source.materials.signal);
  const identityBytes=await readFile(path.join(here,source.identity.lid.path)),identityTexture=doc.createTexture("Collector_Box_001_Lid_Identity_Exact").setImage(identityBytes).setMimeType("image/png").setExtras({canonicalSourceSha256:source.identity.lid.sha256,application:source.identity.lid.application});
  const identityMaterial=createMaterial(doc,"MAT_EXACT_REVERSE_LID_IDENTITY",{baseColor:[1,1,1,1],metallic:0,roughness:0.68}).setBaseColorTexture(identityTexture).setEmissiveFactor([0.85,0.85,0.85]).setEmissiveTexture(identityTexture).setAlphaMode("BLEND");

  const unitBoxGeometry=new Geometry();addBox(unitBoxGeometry,[0,0,0],[1,1,1]);
  const boardBox=meshFor(doc,buffer,"Collector_Box_Board_Unit",unitBoxGeometry,board),boneBox=meshFor(doc,buffer,"Collector_Box_Bone_Unit",unitBoxGeometry,bone),trayBox=meshFor(doc,buffer,"Collector_Box_Tray_Unit",unitBoxGeometry,tray),zineBox=meshFor(doc,buffer,"Collector_Box_Zine_Unit",unitBoxGeometry,zine),dataKeyBox=meshFor(doc,buffer,"Collector_Box_Data_Key_Unit",unitBoxGeometry,dataKey),signalBox=meshFor(doc,buffer,"Collector_Box_Signal_Unit",unitBoxGeometry,signal);
  const identityGeometry=new Geometry();addTopQuad(identityGeometry);const identityMesh=meshFor(doc,buffer,"Collector_Box_Exact_Identity_Plane",identityGeometry,identityMaterial);
  const cassetteGeometry=new Geometry();addBox(cassetteGeometry,[0,0,0],[mm(62),mm(9),mm(38)]);addCylinderY(cassetteGeometry,[mm(-16),mm(5.2),0],mm(7),mm(1.4),28);addCylinderY(cassetteGeometry,[mm(16),mm(5.2),0],mm(7),mm(1.4),28);const cassetteMesh=meshFor(doc,buffer,"Collector_Box_Cassette_Concept",cassetteGeometry,cassette);
  const discCaseGeometry=new Geometry();addBox(discCaseGeometry,[0,0,0],[mm(70),mm(5),mm(68)]);const discCaseMesh=meshFor(doc,buffer,"Collector_Box_CD_Case_Concept",discCaseGeometry,cassette);
  const discGeometry=new Geometry();addCylinderY(discGeometry,[0,0,0],mm(29),mm(1.4),48);addCylinderY(discGeometry,[0,mm(0.9),0],mm(6),mm(1.8),28);const discMesh=meshFor(doc,buffer,"Collector_Box_CD_Disc_Concept",discGeometry,disc);

  addInstance(doc,assembly,"Collector_Box_Open_Base",boardBox,{translation:[0,mm(18),mm(30)],scale:[mm(250),mm(36),mm(190)],extras:{state:"default-open-archive-set",nominalClosedEnvelopeMm:source.dimensions.viewerEnvelopeMm,dimensionAuthority:source.dimensions.authority,machinable:false,selectedForm:source.selectedForm}});
  addInstance(doc,assembly,"Collector_Box_Modular_Tray",trayBox,{translation:[0,mm(40),mm(30)],scale:[mm(232),mm(9),mm(172)],extras:{part:"dark-modular-tray",conceptOnly:true,manufacturingInternals:false}});
  for(const [name,translation,scale,contentType] of [
    ["Collector_Box_Zine_Recess",[mm(-50),mm(46),mm(-15)],[mm(119),mm(5),mm(83)],"zine"],
    ["Collector_Box_Vinyl_Recess",[mm(57),mm(46),mm(-15)],[mm(83),mm(5),mm(83)],"vinyl-archive-sleeve"],
    ["Collector_Box_Cassette_Recess",[mm(-74),mm(46),mm(76)],[mm(72),mm(5),mm(49)],"cassette"],
    ["Collector_Box_CD_Recess",[mm(4),mm(46),mm(76)],[mm(77),mm(5),mm(77)],"cd"],
    ["Collector_Box_Data_Key_Recess",[mm(91),mm(46),mm(76)],[mm(30),mm(5),mm(75)],"data-key"]
  ])addInstance(doc,assembly,name,trayBox,{translation,scale,extras:{part:"individual-recess",contentType,conceptOnly:true,clearanceClaim:false}});

  addInstance(doc,assembly,"Collector_Box_Vinyl_Archive_Sleeve",boneBox,{translation:[mm(57),mm(50),mm(-15)],scale:[mm(73),mm(4),mm(73)],extras:{contentType:"vinyl-archive-sleeve",conceptOnly:true,sourceAuthority:source.openAssembly.contentsAuthority}});
  addInstance(doc,assembly,"Collector_Box_Upper_Zine",zineBox,{translation:[mm(-50),mm(54),mm(-15)],scale:[mm(109),mm(6),mm(67)],extras:{contentType:"zine",compartment:"upper",conceptOnly:true,sourceAuthority:source.openAssembly.contentsAuthority}});
  addInstance(doc,assembly,"Collector_Box_Zine_Page_Block",boneBox,{translation:[mm(-50),mm(57.2),mm(17)],scale:[mm(103),mm(1.2),mm(3)],extras:{part:"zine-page-block",conceptOnly:true}});
  addInstance(doc,assembly,"Collector_Box_Zine_Identity_Exact",identityMesh,{translation:[mm(-50),mm(57.8),mm(-15)],scale:[mm(78),1,mm(29.25)],extras:{part:"governed-zine-cover-mark",contentType:"zine",conceptOnly:true,canonicalSourceSha256:source.identity.lid.sha256,warped:false,generatedByImageModel:false}});
  addInstance(doc,assembly,"Collector_Box_Cassette",cassetteMesh,{translation:[mm(-74),mm(54),mm(76)],extras:{contentType:"cassette",conceptOnly:true,sourceAuthority:source.openAssembly.contentsAuthority}});
  addInstance(doc,assembly,"Collector_Box_Cassette_Signal",signalBox,{translation:[mm(-74),mm(59),mm(76)],scale:[mm(28),mm(0.8),mm(2)],extras:{part:"cassette-signal-line",conceptOnly:true}});
  addInstance(doc,assembly,"Collector_Box_CD",discCaseMesh,{translation:[mm(4),mm(53),mm(76)],extras:{contentType:"cd",part:"smoke-jewel-case",conceptOnly:true,sourceAuthority:source.openAssembly.contentsAuthority}});
  addInstance(doc,assembly,"Collector_Box_CD_Disc",discMesh,{translation:[mm(4),mm(56.2),mm(76)],extras:{contentType:"cd",part:"silver-optical-disc",conceptOnly:true,sourceAuthority:source.openAssembly.contentsAuthority}});
  addInstance(doc,assembly,"Collector_Box_Data_Key",dataKeyBox,{translation:[mm(91),mm(56),mm(76)],scale:[mm(20),mm(10),mm(60)],extras:{contentType:"data-key",conceptOnly:true,connectorGeometry:"omitted",sourceAuthority:source.openAssembly.contentsAuthority}});
  addInstance(doc,assembly,"Collector_Box_Data_Key_Connector",boneBox,{translation:[mm(91),mm(61.5),mm(49)],scale:[mm(14),mm(1.2),mm(10)],extras:{contentType:"data-key",part:"connector-cue-not-dimensional",conceptOnly:true}});
  addInstance(doc,assembly,"Collector_Box_Vinyl_Archive_Signal",signalBox,{translation:[mm(57),mm(52.5),mm(-15)],scale:[mm(3),mm(1),mm(48)],extras:{contentType:"vinyl-archive-sleeve",part:"signal-red-registration-stripe",conceptOnly:true}});
  addInstance(doc,assembly,"Collector_Box_Signal_Red_Pull_Tab",signalBox,{translation:[0,mm(58),mm(31)],scale:[mm(18),mm(8),mm(22)],extras:{part:"exposed-pull-tab",conceptOnly:true,materialAuthority:"Signal Red textile or paper provisional"}});

  const lidAngleFromHorizontalDeg=180-source.openAssembly.lidAngleDeg,rotationRad=lidAngleFromHorizontalDeg*Math.PI/180,lidPivot=doc.createNode("Collector_Box_Lid_Pivot_Provisional").setTranslation([0,mm(36),mm(-65)]).setRotation([Math.sin(rotationRad/2),0,0,Math.cos(rotationRad/2)]).setExtras({openAngleDeg:source.openAssembly.lidAngleDeg,workingHinge:false,hingeAuthority:source.openAssembly.hingeAuthority,mechanicalMotion:false});assembly.addChild(lidPivot);
  addInstance(doc,lidPivot,"Collector_Box_Open_Lid",boardBox,{translation:[0,0,mm(-95)],scale:[mm(250),mm(12),mm(190)],extras:{part:"open-clamshell-lid",state:"default-open",openAngleDeg:source.openAssembly.lidAngleDeg,workingHinge:false,machinable:false}});
  addInstance(doc,lidPivot,"Collector_Box_Lid_Interior",boneBox,{translation:[0,mm(6.5),mm(-95)],scale:[mm(232),mm(2),mm(172)],extras:{part:"bone-lid-lining",conceptOnly:true,manufacturingInternals:false}});
  addInstance(doc,lidPivot,"Collector_Box_Lid_Identity_Backplate",trayBox,{translation:[mm(-12),mm(7.6),mm(-103)],scale:[mm(128),mm(1),mm(50)],extras:{part:"dark-identity-panel-backplate",conceptOnly:true,clearanceClaim:false}});
  addInstance(doc,lidPivot,"Collector_Box_Lid_Identity",identityMesh,{translation:[mm(-12),mm(8.2),mm(-103)],scale:[mm(120),1,mm(45)],extras:{canonicalSourceSha256:source.identity.lid.sha256,uvRecord:source.identity.lid.uvRecord,part:"exact-governed-identity-panel",horizontal:true,warped:false,generatedByImageModel:false}});
  addInstance(doc,lidPivot,"Collector_Box_Sticker_Identity_Insert",identityMesh,{translation:[mm(65),mm(7.7),mm(-57)],scale:[mm(60),1,mm(22.5)],extras:{contentType:"sticker-identity",conceptOnly:true,canonicalSourceSha256:source.identity.lid.sha256,warped:false,generatedByImageModel:false}});
  await doc.transform(dedup(),prune({keepExtras:true}));return doc;
};

const metricsFor=(doc)=>doc.getRoot().listMeshes().reduce((totals,mesh)=>{for(const primitive of mesh.listPrimitives()){totals.triangles+=primitive.getIndices().getCount()/3;totals.drawCalls+=1;}return totals;},{triangles:0,drawCalls:0});
const validationSummary=(validation)=>({errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints});

const buildArtifact=async()=>{
  const source=await readJson(sourcePath),integrity=await verifySources(source),doc=await buildDocument(source),io=new NodeIO(),bytes=Buffer.from(await io.writeBinary(doc)),reopened=await io.readBinary(bytes),metrics=metricsFor(reopened);
  const validation=await validateBytes(new Uint8Array(bytes),{uri:"collector-box-001.glb",format:"glb",writeTimestamp:false,maxIssues:100}),summary=validationSummary(validation);if(summary.errors||summary.warnings)process.stderr.write(`${JSON.stringify(validation.issues.messages,null,2)}\n`);assert.equal(summary.errors,0,"Khronos validator errors");assert.equal(summary.warnings,0,"Khronos validator warnings");assert.ok(bytes.byteLength<=source.budgets.maxBytes);assert.ok(metrics.triangles<=source.budgets.maxTriangles);assert.ok(metrics.drawCalls<=source.budgets.maxDrawCalls);
  const cloth=reopened.getRoot().listTextures().find(texture=>texture.getExtras().proceduralRecipe==="pvkh-bookcloth-normal-v1");
  const report={schemaVersion:1,assetKey:source.assetKey,sourceIntegrity:integrity.identity,authorityIntegrity:integrity.authority,derivedMaterialIntegrity:integrity.derivedMaterials,derivedMaterialSha256:{bookclothNormal:sha256(cloth.getImage())},physicalEvidence:{method:"reopened-glb-accessor-bounds",nominalClosedEnvelopeMm:source.dimensions.viewerEnvelopeMm,dimensionAuthority:source.dimensions.authority,state:"default-open-archive-set",selectedForm:source.selectedForm,openAngleDeg:source.openAssembly.lidAngleDeg,lidUvRecord:source.identity.lid.uvRecord,modeled:["open base and lid","bone lid lining","modular tray and recesses",...source.openAssembly.namedContents],excluded:["working hinge","vendor dieline","manufacturing internals","machinability claim"]},cameraRecommendations:source.camera,validation:summary,budget:{...metrics,bytes:bytes.byteLength,ceilings:source.budgets},output:{path:"assets/merch-3d/collector-box-001.glb",sha256:sha256(bytes)},deterministic:{verifiedBySecondInMemoryBuild:false},visualComparison:{canonicalSelected:[source.visualReference.path],reviewStatus:"captured-six-views-readability-source-compare",browserQa:"tools/merch-3d/reports/collector-box-001.browser-qa.json"}};
  return {source,bytes,report,validation,inspection:inspect(reopened)};
};

const main=async()=>{const artifact=await buildArtifact(),second=await buildArtifact();assert.equal(sha256(artifact.bytes),sha256(second.bytes),"collector build is not byte-deterministic");artifact.report.deterministic.verifiedBySecondInMemoryBuild=true;if(verifyOnly){const [existingBytes,existingReport]=await Promise.all([readFile(outputPath),readJson(reportPath)]);assert.equal(sha256(existingBytes),sha256(artifact.bytes),"checked-in GLB is stale");assert.deepEqual(existingReport,artifact.report,"checked-in report is stale");assert.equal((await stat(outputPath)).size,artifact.report.budget.bytes);process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);return;}await Promise.all([writeFile(outputPath,artifact.bytes),writeFile(reportPath,stableJson(artifact.report)),writeFile(validatorPath,stableJson(artifact.validation)),writeFile(inspectPath,stableJson(artifact.inspection))]);process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);};

await main();
