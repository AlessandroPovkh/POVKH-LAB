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
const createMaterial=(doc,name,preset)=>doc.createMaterial(name).setBaseColorFactor(preset.baseColor).setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness).setDoubleSided(true);
const primitiveFor=(doc,buffer,name,g,material)=>doc.createPrimitive().setAttribute("POSITION",doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(g.positions)).setBuffer(buffer)).setAttribute("NORMAL",doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(g.normals)).setBuffer(buffer)).setAttribute("TANGENT",doc.createAccessor(`${name}_TANGENT`).setType("VEC4").setArray(new Float32Array(g.tangents)).setBuffer(buffer)).setAttribute("TEXCOORD_0",doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(g.uvs)).setBuffer(buffer)).setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint32Array(g.indices)).setBuffer(buffer)).setMaterial(material);
const addMeshNode=(doc,parent,buffer,name,g,material,translation=[0,0,0],extras={})=>{const node=doc.createNode(name).setTranslation(translation).setExtras(extras).setMesh(doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc,buffer,name,g,material)));parent.addChild(node);return node;};

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
  const doc=new Document(),scene=doc.createScene("Collector_Box_001_Closed_Archive_Clamshell");doc.getRoot().setDefaultScene(scene);
  const buffer=doc.createBuffer("Collector_Box_001_Buffer"),assembly=doc.createNode("Collector_Box_001_Centred_Grounded_Pivot").setExtras({groundY:0,pivotPolicy:"closed-box-centred",releasedState:"closed-only"});scene.addChild(assembly);
  const clothBytes=await createBookclothNormal(source),clothTexture=doc.createTexture("Collector_Box_001_Bookcloth_Normal").setImage(clothBytes).setMimeType("image/png").setExtras({proceduralRecipe:"pvkh-bookcloth-normal-v1",containsIdentity:false,derivedRasterSha256:sha256(clothBytes)});
  const board=createMaterial(doc,"MAT_VOID_PAPER_WRAPPED_BOARD",source.materials.board).setNormalTexture(clothTexture);
  const lid=createMaterial(doc,"MAT_VOID_BOOKCLOTH_LID",source.materials.lid).setNormalTexture(clothTexture);
  const seam=createMaterial(doc,"MAT_VOID_LID_SEAM",source.materials.seam),signal=createMaterial(doc,"MAT_SIGNAL_RED_PULL_TAB",source.materials.signal);
  const identityBytes=await readFile(path.join(here,source.identity.lid.path)),identityTexture=doc.createTexture("Collector_Box_001_Lid_Identity_Exact").setImage(identityBytes).setMimeType("image/png").setExtras({canonicalSourceSha256:source.identity.lid.sha256,application:source.identity.lid.application});
  const identityMaterial=createMaterial(doc,"MAT_EXACT_REVERSE_LID_IDENTITY",{baseColor:[1,1,1,1],metallic:0,roughness:0.68}).setBaseColorTexture(identityTexture).setAlphaMode("BLEND");

  const envelope=new Geometry();
  addBox(envelope,[0,mm(157.5),mm(-26)],[mm(250),mm(315),mm(3)]);
  addBox(envelope,[mm(-123),mm(157.5),0],[mm(4),mm(315),mm(55)]);addBox(envelope,[mm(123),mm(157.5),0],[mm(4),mm(315),mm(55)]);
  addBox(envelope,[0,mm(2),0],[mm(242),mm(4),mm(55)]);addBox(envelope,[0,mm(313),0],[mm(242),mm(4),mm(55)]);
  addMeshNode(doc,assembly,buffer,"Collector_Box_Closed_Envelope",envelope,board,[0,0,0],{state:"closed-only",nominalDimensionsMm:[250,315,55],dimensionAuthority:source.dimensions.authority,machinable:false,selectedForm:source.selectedForm});

  const lidGeometry=new Geometry();addRoundedBeveledBox(lidGeometry,[0,mm(157.5),mm(25.15)],[mm(242),mm(303),mm(4.7)],mm(2.8),mm(0.72));
  addMeshNode(doc,assembly,buffer,"Collector_Box_Closed_Lid",lidGeometry,lid,[0,0,0],{part:"closed-clamshell-lid",openStateIncluded:false,workingHinge:false});

  const seamGeometry=new Geometry();addBox(seamGeometry,[mm(-121.7),mm(157.5),mm(27.46)],[mm(1.1),mm(303),mm(0.07)]);addBox(seamGeometry,[mm(121.7),mm(157.5),mm(27.46)],[mm(1.1),mm(303),mm(0.07)]);addBox(seamGeometry,[0,mm(5.3),mm(27.46)],[mm(242),mm(1.1),mm(0.07)]);addBox(seamGeometry,[0,mm(309.7),mm(27.46)],[mm(242),mm(1.1),mm(0.07)]);
  addMeshNode(doc,assembly,buffer,"Collector_Box_Lid_Seam",seamGeometry,seam,[0,0,0],{part:"visible-lid-seam",clearanceClaim:false,zeroIntersectionReview:"visual-only-provisional"});

  const tabGeometry=new Geometry();addRoundedBeveledBox(tabGeometry,[0,mm(6),mm(26.75)],[mm(16),mm(12),mm(1.5)],mm(1.2),mm(0.28));
  addMeshNode(doc,assembly,buffer,"Collector_Box_Signal_Red_Tab",tabGeometry,signal,[0,0,0],{part:"exposed-pull-tab-edge",materialAuthority:"Signal Red textile or paper provisional"});

  const art=new Geometry();addFrontQuad(art,mm(source.identity.lid.uvRecord.surfaceMm.width),mm(source.identity.lid.uvRecord.surfaceMm.height),mm(source.identity.lid.uvRecord.surfaceMm.centreY),mm(27.53));
  addMeshNode(doc,assembly,buffer,"Collector_Box_Lid_Identity",art,identityMaterial,[mm(source.identity.lid.uvRecord.surfaceMm.centreX),0,0],{canonicalSourceSha256:source.identity.lid.sha256,uvRecord:source.identity.lid.uvRecord,lowerLid:true,horizontal:true,warped:false,generatedByImageModel:false});
  await doc.transform(dedup(),prune({keepExtras:true}));return doc;
};

const metricsFor=(doc)=>doc.getRoot().listMeshes().reduce((totals,mesh)=>{for(const primitive of mesh.listPrimitives()){totals.triangles+=primitive.getIndices().getCount()/3;totals.drawCalls+=1;}return totals;},{triangles:0,drawCalls:0});
const validationSummary=(validation)=>({errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints});

const buildArtifact=async()=>{
  const source=await readJson(sourcePath),integrity=await verifySources(source),doc=await buildDocument(source),io=new NodeIO(),bytes=Buffer.from(await io.writeBinary(doc)),reopened=await io.readBinary(bytes),metrics=metricsFor(reopened);
  const validation=await validateBytes(new Uint8Array(bytes),{uri:"collector-box-001.glb",format:"glb",writeTimestamp:false,maxIssues:100}),summary=validationSummary(validation);if(summary.errors||summary.warnings)process.stderr.write(`${JSON.stringify(validation.issues.messages,null,2)}\n`);assert.equal(summary.errors,0,"Khronos validator errors");assert.equal(summary.warnings,0,"Khronos validator warnings");assert.ok(bytes.byteLength<=source.budgets.maxBytes);assert.ok(metrics.triangles<=source.budgets.maxTriangles);assert.ok(metrics.drawCalls<=source.budgets.maxDrawCalls);
  const cloth=reopened.getRoot().listTextures().find(texture=>texture.getExtras().proceduralRecipe==="pvkh-bookcloth-normal-v1");
  const report={schemaVersion:1,assetKey:source.assetKey,sourceIntegrity:integrity.identity,authorityIntegrity:integrity.authority,derivedMaterialIntegrity:integrity.derivedMaterials,derivedMaterialSha256:{bookclothNormal:sha256(cloth.getImage())},physicalEvidence:{method:"reopened-glb-accessor-bounds",viewerEnvelopeMm:source.dimensions.viewerEnvelopeMm,dimensionAuthority:source.dimensions.authority,state:"closed-only",selectedForm:source.selectedForm,lidUvRecord:source.identity.lid.uvRecord,excluded:["drawer","open state","interior","contents","working hinge","machinability claim"]},cameraRecommendations:source.camera,validation:summary,budget:{...metrics,bytes:bytes.byteLength,ceilings:source.budgets},output:{path:"assets/merch-3d/collector-box-001.glb",sha256:sha256(bytes)},deterministic:{verifiedBySecondInMemoryBuild:false},visualComparison:{canonicalSelected:[source.visualReference.path],reviewStatus:"captured-six-views-readability-source-compare",browserQa:"tools/merch-3d/reports/collector-box-001.browser-qa.json"}};
  return {source,bytes,report,validation,inspection:inspect(reopened)};
};

const main=async()=>{const artifact=await buildArtifact(),second=await buildArtifact();assert.equal(sha256(artifact.bytes),sha256(second.bytes),"collector build is not byte-deterministic");artifact.report.deterministic.verifiedBySecondInMemoryBuild=true;if(verifyOnly){const [existingBytes,existingReport]=await Promise.all([readFile(outputPath),readJson(reportPath)]);assert.equal(sha256(existingBytes),sha256(artifact.bytes),"checked-in GLB is stale");assert.deepEqual(existingReport,artifact.report,"checked-in report is stale");assert.equal((await stat(outputPath)).size,artifact.report.budget.bytes);process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);return;}await Promise.all([writeFile(outputPath,artifact.bytes),writeFile(reportPath,stableJson(artifact.report)),writeFile(validatorPath,stableJson(artifact.validation)),writeFile(inspectPath,stableJson(artifact.inspection))]);process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);};

await main();
