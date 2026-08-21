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
const sourcePath = path.join(here, "data-key-003.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/data-key-003.glb");
const reportPath = path.join(here, "reports/data-key-003.report.json");
const validatorPath = path.join(here, "reports/data-key-003.validator.json");
const inspectPath = path.join(here, "reports/data-key-003.inspect.json");
const verifyOnly = process.argv.includes("--verify");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const mm = (value) => value / 1000;

class Geometry {
  constructor() { this.positions=[]; this.normals=[]; this.uvs=[]; this.indices=[]; }
  vertex(position, normal, uv=[0,0]) { const index=this.positions.length/3; this.positions.push(...position); this.normals.push(...normal); this.uvs.push(...uv); return index; }
  quad(points, normal, uvs=[[0,0],[1,0],[1,1],[0,1]]) { const v=points.map((point,index)=>this.vertex(point,normal,uvs[index])); this.indices.push(v[0],v[1],v[2],v[0],v[2],v[3]); }
}

const addBox=(g,[cx,cy,cz],[sx,sy,sz])=>{
  const [x0,x1]=[cx-sx/2,cx+sx/2],[y0,y1]=[cy-sy/2,cy+sy/2],[z0,z1]=[cz-sz/2,cz+sz/2];
  g.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1]);
  g.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1]);
  g.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0]);
  g.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0]);
  g.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0]);
  g.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0]);
};

const roundedOutline=(width,height,radius,segments=7)=>{
  const points=[],hw=width/2,hh=height/2,r=Math.min(radius,hw,hh);
  for(const [cx,cy,start] of [[hw-r,-hh+r,-Math.PI/2],[hw-r,hh-r,0],[-hw+r,hh-r,Math.PI/2],[-hw+r,-hh+r,Math.PI]]){
    for(let step=0;step<segments;step+=1){const angle=start+(step/(segments-1))*Math.PI/2;points.push([cx+Math.cos(angle)*r,cy+Math.sin(angle)*r]);}
  }
  return points;
};

const addRoundedBeveledBox=(g,[cx,cy,cz],[width,height,depth],radius,bevel)=>{
  const frontInner=roundedOutline(width-2*bevel,height-2*bevel,Math.max(radius-bevel,bevel)),frontOuter=roundedOutline(width,height,radius);
  const ring=(outline,z,normal)=>outline.map(([x,y])=>g.vertex([cx+x,cy+y,cz+z],normal,[x/width+0.5,1-(y/height+0.5)]));
  const face=(outline,z,normal,reverse)=>{const center=g.vertex([cx,cy,cz+z],normal,[0.5,0.5]);const vertices=ring(outline,z,normal);for(let i=0;i<vertices.length;i+=1){const j=(i+1)%vertices.length;if(reverse)g.indices.push(center,vertices[j],vertices[i]);else g.indices.push(center,vertices[i],vertices[j]);}};
  face(frontInner,depth/2,[0,0,1],false);face(frontInner,-depth/2,[0,0,-1],true);
  const connect=(a,zA,b,zB,mode)=>{for(let i=0;i<a.length;i+=1){const j=(i+1)%a.length;const mx=(a[i][0]+a[j][0]+b[i][0]+b[j][0])/4,my=(a[i][1]+a[j][1]+b[i][1]+b[j][1])/4;const len=Math.hypot(mx,my)||1;const nz=mode==="front"?0.55:mode==="back"?-0.55:0;const nlen=Math.hypot(mx/len,my/len,nz);const normal=[mx/len/nlen,my/len/nlen,nz/nlen];const points=[[cx+a[i][0],cy+a[i][1],cz+zA],[cx+a[j][0],cy+a[j][1],cz+zA],[cx+b[j][0],cy+b[j][1],cz+zB],[cx+b[i][0],cy+b[i][1],cz+zB]];g.quad(points,normal);}};
  connect(frontOuter,depth/2-bevel,frontInner,depth/2,"front");
  connect(frontOuter,-depth/2+bevel,frontOuter,depth/2-bevel,"side");
  connect(frontInner,-depth/2,frontOuter,-depth/2+bevel,"back");
};

const addXFrame=(g,x,centreY,centreZ,widthY,heightZ,stroke,normal)=>{
  const y0=centreY-widthY/2,y1=centreY+widthY/2,z0=centreZ-heightZ/2,z1=centreZ+heightZ/2;
  const quad=(ya,za,yb,zb)=>normal[0]>0
    ? [[x,ya,za],[x,yb,za],[x,yb,zb],[x,ya,zb]]
    : [[x,yb,za],[x,ya,za],[x,ya,zb],[x,yb,zb]];
  g.quad(quad(y0,z0,y1,z0+stroke),normal);
  g.quad(quad(y0,z1-stroke,y1,z1),normal);
  g.quad(quad(y0,z0+stroke,y0+stroke,z1-stroke),normal);
  g.quad(quad(y1-stroke,z0+stroke,y1,z1-stroke),normal);
};

const addTopQuad=(g,width,depth,y)=>g.quad([[-width/2,y,-depth/2],[width/2,y,-depth/2],[width/2,y,depth/2],[-width/2,y,depth/2]],[0,1,0],[[0,1],[1,1],[1,0],[0,0]]);

const createMaterial=(doc,name,preset)=>doc.createMaterial(name).setBaseColorFactor(preset.baseColor).setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness).setDoubleSided(true);
const primitiveFor=(doc,buffer,name,g,material)=>doc.createPrimitive()
  .setAttribute("POSITION",doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(g.positions)).setBuffer(buffer))
  .setAttribute("NORMAL",doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(g.normals)).setBuffer(buffer))
  .setAttribute("TEXCOORD_0",doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(g.uvs)).setBuffer(buffer))
  .setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint32Array(g.indices)).setBuffer(buffer))
  .setMaterial(material);
const addMeshNode=(doc,parent,buffer,name,g,material,translation=[0,0,0],extras={})=>{const node=doc.createNode(name).setTranslation(translation).setExtras(extras).setMesh(doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc,buffer,name,g,material)));parent.addChild(node);return node;};

const verifySources=async(source)=>{
  const authority={};
  for(const [key,entry] of Object.entries(source.canonicalSource)){const bytes=await readFile(path.join(here,entry.fixturePath));assert.equal(sha256(bytes),entry.fixtureSha256,`${key} fixture drift`);const fixture=JSON.parse(bytes);assert.equal(fixture.authorityType,"governed-minimal-copy");assert.equal(fixture.canonicalPath,entry.path);assert.equal(fixture.canonicalSha256,entry.sha256);authority[key]={fixturePath:entry.fixturePath,fixtureSha256:entry.fixtureSha256,canonicalPath:entry.path,canonicalSha256:entry.sha256};}
  const identity={};
  for(const [key,entry] of Object.entries(source.identity)){const bytes=await readFile(path.join(here,entry.path));assert.equal(sha256(bytes),entry.sha256,`${key} identity drift`);identity[key]={path:entry.path,sha256:entry.sha256,application:entry.application,bytes:bytes.byteLength};}
  return {authority,identity};
};

const buildDocument=async(source)=>{
  const doc=new Document(),scene=doc.createScene("Data_Key_003_Closed_Neutral_Display");doc.getRoot().setDefaultScene(scene);
  const buffer=doc.createBuffer("Data_Key_003_Buffer"),assembly=doc.createNode("Data_Key_003_Centred_Grounded_Pivot").setExtras({groundY:0,pivotPolicy:"device-centred",releasedState:"closed-both-retracted"});scene.addChild(assembly);
  const anodized=createMaterial(doc,"MAT_BLACK_ANODIZED_ALUMINIUM",source.materials.anodized),polymer=createMaterial(doc,"MAT_BLACK_POLYMER_SLIDER",source.materials.polymer),connector=createMaterial(doc,"MAT_BRUSHED_CONNECTOR_ENVELOPE",source.materials.connector);
  const identityBytes=await readFile(path.join(here,source.identity.compactReverse.path));
  const identityTexture=doc.createTexture("Data_Key_003_Compact_Exact_Texture").setImage(identityBytes).setMimeType("image/png").setExtras({canonicalSourceSha256:source.identity.compactReverse.sha256,application:source.identity.compactReverse.application});
  const identityMaterial=createMaterial(doc,"MAT_RECESSED_COMPACT_EXACT",source.materials.identity).setBaseColorTexture(identityTexture).setAlphaMode("BLEND");

  const body=new Geometry();addRoundedBeveledBox(body,[0,mm(10),0],[mm(86),mm(20),mm(9)],mm(2.4),mm(0.65));
  addMeshNode(doc,assembly,buffer,"Data_Key_Device",body,anodized,[0,0,0],{state:"closed-both-retracted",nominalDimensionsMm:[86,20,9],dimensionAuthority:source.dimensions.authority,machinable:false,selectedCandidate:source.selectedCandidate});

  const slider=new Geometry();addBox(slider,[0,mm(5.1),mm(4.525)],[mm(57),mm(0.72),mm(0.05)]);addRoundedBeveledBox(slider,[0,mm(5.1),mm(4.54)],[mm(14),mm(5.2),mm(0.92)],mm(1.2),mm(0.18));
  addMeshNode(doc,assembly,buffer,"Data_Key_Polymer_Slider",slider,polymer,[0,0,0],{mechanism:"captive-three-position-slider",detent:"closed-centre",travelValidatedAgainstProvisionalEnvelope:true,workingAnimation:false});

  const usbA=new Geometry();addXFrame(usbA,mm(-43.001),mm(10),0,mm(13.8),mm(6.2),mm(0.75),[-1,0,0]);
  addMeshNode(doc,assembly,buffer,"Data_Key_USB_A_Interface_Envelope",usbA,connector,[0,0,0],{interface:"USB-A",exposed:false,state:"retracted",geometryScope:"clearance-envelope-not-vendor-connector"});
  const usbC=new Geometry();addXFrame(usbC,mm(43.001),mm(10),0,mm(7.8),mm(3.4),mm(0.5),[1,0,0]);
  addMeshNode(doc,assembly,buffer,"Data_Key_USB_C_Interface_Envelope",usbC,connector,[0,0,0],{interface:"USB-C",exposed:false,state:"retracted",geometryScope:"clearance-envelope-not-vendor-connector"});

  const mark=new Geometry();addTopQuad(mark,mm(7.6),mm(7.6),mm(20.006));
  addMeshNode(doc,assembly,buffer,"Data_Key_Compact_Identity",mark,identityMaterial,[mm(27),0,mm(-0.2)],{canonicalSourceSha256:source.identity.compactReverse.sha256,placementAuthority:"deviceMarks.closed",treatment:"restrained-natural-aluminium-laser-mark",signalRed:false,warped:false});
  await doc.transform(dedup(),prune({keepExtras:true}));return doc;
};

const metricsFor=(doc)=>doc.getRoot().listMeshes().reduce((totals,mesh)=>{for(const primitive of mesh.listPrimitives()){totals.triangles+=primitive.getIndices().getCount()/3;totals.drawCalls+=1;}return totals;},{triangles:0,drawCalls:0});
const validationSummary=(validation)=>({errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints});

const buildArtifact=async()=>{
  const source=await readJson(sourcePath),integrity=await verifySources(source),doc=await buildDocument(source),io=new NodeIO(),bytes=Buffer.from(await io.writeBinary(doc)),reopened=await io.readBinary(bytes),metrics=metricsFor(reopened);
  const validation=await validateBytes(new Uint8Array(bytes),{uri:"data-key-003.glb",format:"glb",writeTimestamp:false,maxIssues:100}),summary=validationSummary(validation);
  assert.equal(summary.errors,0,"Khronos validator errors");assert.equal(summary.warnings,0,"Khronos validator warnings");assert.ok(bytes.byteLength<=source.budgets.maxBytes);assert.ok(metrics.triangles<=source.budgets.maxTriangles);assert.ok(metrics.drawCalls<=source.budgets.maxDrawCalls);
  const report={schemaVersion:1,assetKey:source.assetKey,sourceIntegrity:integrity.identity,authorityIntegrity:integrity.authority,physicalEvidence:{method:"reopened-glb-accessor-bounds",viewerEnvelopeMm:source.dimensions.viewerEnvelopeMm,dimensionAuthority:source.dimensions.authority,state:"closed-both-retracted",interfaces:["USB-A","USB-C"],packagingModeled:false,machinabilityClaim:false},cameraRecommendations:source.camera,validation:summary,budget:{...metrics,bytes:bytes.byteLength,ceilings:source.budgets},output:{path:"assets/merch-3d/data-key-003.glb",sha256:sha256(bytes)},deterministic:{verifiedBySecondInMemoryBuild:false},visualComparison:{canonicalSelected:[source.visualReference.path,...source.visualReference.additional.map(entry=>entry.path)],reviewStatus:"captured-six-views-readability-source-compare",browserQa:"tools/merch-3d/reports/data-key-003.browser-qa.json"}};
  return {source,bytes,report,validation,inspection:inspect(reopened)};
};

const main=async()=>{
  const artifact=await buildArtifact(),second=await buildArtifact();assert.equal(sha256(artifact.bytes),sha256(second.bytes),"data key build is not byte-deterministic");artifact.report.deterministic.verifiedBySecondInMemoryBuild=true;
  if(verifyOnly){const [existingBytes,existingReport]=await Promise.all([readFile(outputPath),readJson(reportPath)]);assert.equal(sha256(existingBytes),sha256(artifact.bytes),"checked-in GLB is stale");assert.deepEqual(existingReport,artifact.report,"checked-in report is stale");assert.equal((await stat(outputPath)).size,artifact.report.budget.bytes);process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);return;}
  await Promise.all([writeFile(outputPath,artifact.bytes),writeFile(reportPath,stableJson(artifact.report)),writeFile(validatorPath,stableJson(artifact.validation)),writeFile(inspectPath,stableJson(artifact.inspection))]);process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};

await main();
