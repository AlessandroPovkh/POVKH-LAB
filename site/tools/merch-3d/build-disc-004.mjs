import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, inspect, prune } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const sourcePath = path.join(here, "disc-004.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/disc-004.glb");
const reportPath = path.join(here, "reports/disc-004.report.json");
const validatorPath = path.join(here, "reports/disc-004.validator.json");
const inspectPath = path.join(here, "reports/disc-004.inspect.json");
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

const addBox = (g,[cx,cy,cz],[sx,sy,sz]) => {
  const [x0,x1]=[cx-sx/2,cx+sx/2], [y0,y1]=[cy-sy/2,cy+sy/2], [z0,z1]=[cz-sz/2,cz+sz/2];
  g.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1]);
  g.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1]);
  g.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0]);
  g.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0]);
  g.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0]);
  g.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0]);
};

const addCylinderY=(g,[cx,cy,cz],radius,length,segments=24)=>{
  const y0=cy-length/2,y1=cy+length/2;
  for(let index=0;index<segments;index+=1){
    const a0=index/segments*Math.PI*2,a1=(index+1)/segments*Math.PI*2;
    const p=(angle,y)=>[cx+Math.cos(angle)*radius,y,cz+Math.sin(angle)*radius],n0=[Math.cos(a0),0,Math.sin(a0)],n1=[Math.cos(a1),0,Math.sin(a1)];
    const side=[g.vertex(p(a0,y0),n0),g.vertex(p(a1,y0),n1),g.vertex(p(a1,y1),n1),g.vertex(p(a0,y1),n0)];g.indices.push(side[0],side[1],side[2],side[0],side[2],side[3]);
    const bottom=[g.vertex([cx,y0,cz],[0,-1,0]),g.vertex(p(a1,y0),[0,-1,0]),g.vertex(p(a0,y0),[0,-1,0])];g.indices.push(...bottom);
    const top=[g.vertex([cx,y1,cz],[0,1,0]),g.vertex(p(a0,y1),[0,1,0]),g.vertex(p(a1,y1),[0,1,0])];g.indices.push(...top);
  }
};

const addFrontQuad = (g,width,height,cy,z) => g.quad(
  [[-width/2,cy-height/2,z],[width/2,cy-height/2,z],[width/2,cy+height/2,z],[-width/2,cy+height/2,z]],
  [0,0,1], [[0,1],[1,1],[1,0],[0,0]]
);

const addAnnulus = (g,outerRadius,innerRadius,depth,segments,{grooves=0}={}) => {
  const z0=-depth/2,z1=depth/2;
  const point=(angle,radius,z)=>[Math.cos(angle)*radius,Math.sin(angle)*radius+outerRadius,z];
  const uv=(angle,radius)=>[0.5+Math.cos(angle)*radius/(outerRadius*2),0.5-Math.sin(angle)*radius/(outerRadius*2)];
  for(let index=0;index<segments;index+=1){
    const a0=index/segments*Math.PI*2,a1=(index+1)/segments*Math.PI*2;
    const f=[g.vertex(point(a0,outerRadius,z1),[0,0,1],uv(a0,outerRadius)),g.vertex(point(a1,outerRadius,z1),[0,0,1],uv(a1,outerRadius)),g.vertex(point(a1,innerRadius,z1),[0,0,1],uv(a1,innerRadius)),g.vertex(point(a0,innerRadius,z1),[0,0,1],uv(a0,innerRadius))];
    g.indices.push(f[0],f[1],f[2],f[0],f[2],f[3]);
    const b=[g.vertex(point(a1,outerRadius,z0),[0,0,-1],uv(a1,outerRadius)),g.vertex(point(a0,outerRadius,z0),[0,0,-1],uv(a0,outerRadius)),g.vertex(point(a0,innerRadius,z0),[0,0,-1],uv(a0,innerRadius)),g.vertex(point(a1,innerRadius,z0),[0,0,-1],uv(a1,innerRadius))];
    g.indices.push(b[0],b[1],b[2],b[0],b[2],b[3]);
    const n0=[Math.cos(a0),Math.sin(a0),0],n1=[Math.cos(a1),Math.sin(a1),0];
    const o=[g.vertex(point(a0,outerRadius,z0),n0),g.vertex(point(a1,outerRadius,z0),n1),g.vertex(point(a1,outerRadius,z1),n1),g.vertex(point(a0,outerRadius,z1),n0)];
    g.indices.push(o[0],o[1],o[2],o[0],o[2],o[3]);
    const h=[g.vertex(point(a1,innerRadius,z0),[-n1[0],-n1[1],0]),g.vertex(point(a0,innerRadius,z0),[-n0[0],-n0[1],0]),g.vertex(point(a0,innerRadius,z1),[-n0[0],-n0[1],0]),g.vertex(point(a1,innerRadius,z1),[-n1[0],-n1[1],0])];
    g.indices.push(h[0],h[1],h[2],h[0],h[2],h[3]);
  }
  for(let groove=0;groove<grooves;groove+=1){
    const radius=innerRadius+mm(5)+groove*(outerRadius-innerRadius-mm(9))/Math.max(grooves-1,1),width=mm(0.10);
    for(let index=0;index<segments;index+=1){
      const a0=index/segments*Math.PI*2,a1=(index+1)/segments*Math.PI*2,tilt=groove%2?0.16:-0.16;
      const normal=(angle)=>[Math.cos(angle)*tilt,Math.sin(angle)*tilt,Math.sqrt(1-tilt*tilt)];
      const vertices=[g.vertex(point(a0,radius+width,z1),normal(a0)),g.vertex(point(a1,radius+width,z1),normal(a1)),g.vertex(point(a1,radius-width,z1),normal(a1)),g.vertex(point(a0,radius-width,z1),normal(a0))];
      g.indices.push(vertices[0],vertices[1],vertices[2],vertices[0],vertices[2],vertices[3]);
    }
  }
};

const createMaterial=(doc,name,preset)=>{const material=doc.createMaterial(name).setBaseColorFactor(preset.baseColor).setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness);if(preset.alphaMode)material.setAlphaMode(preset.alphaMode).setDoubleSided(true);return material;};

const createSilverMaterial=async(doc,preset)=>{
  const size=512,channels=4,pixels=Buffer.alloc(size*size*channels);
  for(let y=0;y<size;y+=1){for(let x=0;x<size;x+=1){const nx=(x+0.5)/size*2-1,ny=(y+0.5)/size*2-1,r=Math.hypot(nx,ny),angle=Math.atan2(ny,nx);const sweep=0.5+0.5*Math.cos(angle*3.1+r*5.8+Math.sin(angle*2)*0.8);const fine=0.94+0.06*Math.sin(r*620);const sheen=(0.68+sweep*0.28)*fine;const offset=(y*size+x)*channels;pixels[offset]=Math.round(255*sheen);pixels[offset+1]=Math.round(255*Math.min(1,sheen*1.025));pixels[offset+2]=Math.round(255*Math.min(1,sheen*1.06));pixels[offset+3]=r<=1?255:0;}}
  const image=await sharp(pixels,{raw:{width:size,height:size,channels}}).png({compressionLevel:9,adaptiveFiltering:false,effort:10}).toBuffer();
  const texture=doc.createTexture("Disc_004_Controlled_Radial_Silver_Texture").setImage(image).setMimeType("image/png").setExtras({proceduralRecipe:"pvkh-clean-silver-radial-v1",derivedRasterSha256:sha256(image),containsIdentity:false});
  const material=doc.createMaterial("MAT_CLEAN_SILVER_DISC").setBaseColorTexture(texture).setBaseColorFactor(preset.baseColor).setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness);
  return {material,image};
};

const uint16IndicesFor=(g,name)=>{
  let maximumIndex=0;
  for(const index of g.indices)maximumIndex=Math.max(maximumIndex,index);
  assert.ok(maximumIndex<=65_535,`${name} exceeds u16 index range`);
  return new Uint16Array(g.indices);
};

const primitiveFor=(doc,buffer,name,g,material)=>doc.createPrimitive()
  .setAttribute("POSITION",doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(g.positions)).setBuffer(buffer))
  .setAttribute("NORMAL",doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(g.normals)).setBuffer(buffer))
  .setAttribute("TEXCOORD_0",doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(g.uvs)).setBuffer(buffer))
  .setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(uint16IndicesFor(g,name)).setBuffer(buffer))
  .setMaterial(material);

const addMeshNode=(doc,parent,buffer,name,g,material,translation=[0,0,0],extras={})=>{const node=doc.createNode(name).setTranslation(translation).setExtras(extras).setMesh(doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc,buffer,name,g,material)));parent.addChild(node);return node;};

const verifySources=async(source)=>{
  const identity={};
  for(const [key,entry] of Object.entries(source.identity)){const bytes=await readFile(path.join(here,entry.path));assert.equal(sha256(bytes),entry.sha256,`${key} identity drift`);identity[key]={path:entry.path,sha256:entry.sha256,bytes:bytes.byteLength,application:entry.application};}
  const authority={};
  for(const [key,entry] of Object.entries(source.canonicalSource)){const bytes=await readFile(path.join(here,entry.fixturePath));assert.equal(sha256(bytes),entry.fixtureSha256,`${key} fixture drift`);const fixture=JSON.parse(bytes);assert.equal(fixture.authorityType,"governed-minimal-copy");assert.equal(fixture.canonicalPath,entry.path);assert.equal(fixture.canonicalSha256,entry.sha256);authority[key]={fixturePath:entry.fixturePath,fixtureSha256:entry.fixtureSha256,canonicalPath:entry.path,canonicalSha256:entry.sha256};}
  return {identity,authority};
};

const buildDocument=async(source)=>{
  assert.equal(source.geometryPolicy.indexComponent,"UNSIGNED_SHORT");
  assert.equal(source.geometryPolicy.indexBits,16);
  assert.equal(source.geometryPolicy.decoderPolicy,"uncompressed-only");
  const doc=new Document();
  const scene=doc.createScene("Disc_004_Closed_Jewel_Display");doc.getRoot().setDefaultScene(scene);
  const buffer=doc.createBuffer("Disc_004_Buffer");
  const assembly=doc.createNode("Disc_004_Centred_Grounded_Pivot").setExtras({groundY:0,pivotPolicy:"case-centred"});scene.addChild(assembly);
  const clear=createMaterial(doc,"MAT_CLEAR_JEWEL_POLYMER",source.materials.clear);
  const tray=createMaterial(doc,"MAT_BLACK_JEWEL_TRAY",source.materials.tray);
  const bone=createMaterial(doc,"MAT_BONE_INSERT",source.materials.bone);
  const silverResult=await createSilverMaterial(doc,source.materials.silver),silver=silverResult.material;
  const asciiBytes=await readFile(path.join(here,source.identity.ascii.path));
  const asciiTexture=doc.createTexture("Disc_004_ASCII_Exact_Texture").setImage(asciiBytes).setMimeType("image/png").setExtras({canonicalSourceSha256:source.identity.ascii.sha256});
  const asciiMaterial=doc.createMaterial("MAT_INSERT_ASCII_EXACT").setBaseColorTexture(asciiTexture).setBaseColorFactor([1,1,1,1]).setMetallicFactor(0).setRoughnessFactor(0.74).setDoubleSided(true);

  const jewel=new Geometry();
  addBox(jewel,[mm(1.5),mm(62.5),mm(4.74)],[mm(137),mm(120),mm(0.92)]);
  addBox(jewel,[0,mm(62.5),mm(-4.76)],[mm(140),mm(121),mm(0.88)]);
  addBox(jewel,[0,mm(1.2),0],[mm(142),mm(2.4),mm(10.4)]);
  addBox(jewel,[0,mm(123.8),0],[mm(142),mm(2.4),mm(10.4)]);
  addBox(jewel,[mm(-69),mm(62.5),0],[mm(4),mm(120.2),mm(10.4)]);
  addBox(jewel,[mm(70),mm(62.5),0],[mm(2),mm(120.2),mm(10.4)]);
  for(const y of [18,62.5,107])addCylinderY(jewel,[mm(-68.8),mm(y),mm(0.1)],mm(1.75),mm(20),24);
  for(const y of [28,97])addBox(jewel,[mm(66.8),mm(y),mm(4.9)],[mm(6),mm(9),mm(0.6)]);
  addMeshNode(doc,assembly,buffer,"Disc_Jewel_Case",jewel,clear,[0,0,0],{nominalDimensionsMm:source.dimensionsMm.jewelCase,state:"closed",selectedForm:"BALANCED_CLEAR"});
  const trayGeometry=new Geometry();addBox(trayGeometry,[0,mm(62.5),0],[mm(136),mm(119),mm(2)]);
  addMeshNode(doc,assembly,buffer,"Disc_Black_Tray",trayGeometry,tray,[0,0,mm(-0.2)],{part:"black-tray"});
  const insert=new Geometry();addBox(insert,[0,mm(60),0],[mm(120),mm(120),mm(0.25)]);
  addMeshNode(doc,assembly,buffer,"Disc_Bone_Insert",insert,bone,[mm(4),mm(2.5),mm(4.15)],{nominalDimensionsMm:source.dimensionsMm.frontInsert,copyPolicy:"exact-attachment-only-no-retyped-metadata"});
  const ascii=new Geometry();addFrontQuad(ascii,mm(104),mm(39),mm(76),mm(0.001));
  addMeshNode(doc,assembly,buffer,"Disc_Insert_ASCII_Identity",ascii,asciiMaterial,[mm(4),0,mm(4.285)],{canonicalSourceSha256:source.identity.ascii.sha256,warped:false});
  const discDimensions=source.dimensionsMm.disc;
  const carrier=new Geometry();addAnnulus(carrier,mm(discDimensions.diameter/2),mm(discDimensions.centreHoleDiameter/2),mm(discDimensions.depth),source.geometryPolicy.carrierRadialSegments,{grooves:source.geometryPolicy.carrierGrooveCount});
  addMeshNode(doc,assembly,buffer,"Disc_Carrier",carrier,silver,[0,mm(2.5),mm(-2.45)],{diameterMm:discDimensions.diameter,depthMm:discDimensions.depth,centreHoleDiameterMm:discDimensions.centreHoleDiameter,radialSegments:source.geometryPolicy.carrierRadialSegments,grooveCount:source.geometryPolicy.carrierGrooveCount,indexComponent:source.geometryPolicy.indexComponent,printedMark:false,treatment:source.discTreatment});
  const hub=new Geometry();addAnnulus(hub,mm(7.25),mm(2.1),mm(1.4),96);
  addMeshNode(doc,assembly,buffer,"Disc_Clear_Hub",hub,clear,[0,mm(55.25),mm(-3.0)],{part:"tray-hub",doesNotAlterDiscHole:true});

  await doc.transform(dedup(),prune({keepExtras:true}));
  return doc;
};

const metricsFor=(doc)=>doc.getRoot().listMeshes().reduce((totals,mesh)=>{for(const primitive of mesh.listPrimitives()){totals.triangles+=primitive.getIndices().getCount()/3;totals.drawCalls+=1;}return totals;},{triangles:0,drawCalls:0});
const validationSummary=(validation)=>({errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints});

const buildArtifact=async()=>{
  const source=await readJson(sourcePath);const integrity=await verifySources(source);const doc=await buildDocument(source);const io=new NodeIO();const bytes=Buffer.from(await io.writeBinary(doc));const reopened=await io.readBinary(bytes);const metrics=metricsFor(reopened);
  const validation=await validateBytes(new Uint8Array(bytes),{uri:"disc-004.glb",format:"glb",writeTimestamp:false,maxIssues:100});const summary=validationSummary(validation);
  assert.equal(summary.errors,0,"Khronos validator errors");assert.equal(summary.warnings,0,"Khronos validator warnings");assert.ok(bytes.byteLength<=source.budgets.maxBytes);assert.ok(metrics.triangles<=source.budgets.maxTriangles);assert.ok(metrics.drawCalls<=source.budgets.maxDrawCalls);
  const silverTexture=reopened.getRoot().listTextures().find(texture=>texture.getExtras().proceduralRecipe==="pvkh-clean-silver-radial-v1");
  const report={schemaVersion:1,assetKey:source.assetKey,geometryPolicy:source.geometryPolicy,sourceIntegrity:integrity.identity,authorityIntegrity:integrity.authority,derivedMaterialSha256:{cleanSilverRadial:sha256(silverTexture.getImage())},physicalEvidence:{method:"reopened-glb-accessor-bounds",dimensionsMm:source.dimensionsMm,centreHoleDiameterMm:source.dimensionsMm.disc.centreHoleDiameter,discTreatment:source.discTreatment,printedMark:false},cameraRecommendations:source.camera,validation:summary,budget:{...metrics,bytes:bytes.byteLength,ceilings:source.budgets},output:{path:"assets/merch-3d/disc-004.glb",sha256:sha256(bytes)},deterministic:{verifiedBySecondInMemoryBuild:false},visualComparison:{canonicalSelected:["PVKH_DROP001_DISC_004_CASE_HERO_CONCEPT_v01.png","PVKH_DROP001_DISC_004_OPEN_SET_CONCEPT_v01.png","PVKH_DROP001_DISC_004_MATERIAL_DETAIL_CONCEPT_v01.png"],reviewStatus:"captured-six-views-readability-selected-compare",browserQa:"tools/merch-3d/reports/disc-004.browser-qa.json"}};
  return {source,bytes,report,validation,inspection:inspect(reopened)};
};

const main=async()=>{
  const artifact=await buildArtifact(),second=await buildArtifact();assert.equal(sha256(artifact.bytes),sha256(second.bytes),"disc build is not byte-deterministic");artifact.report.deterministic.verifiedBySecondInMemoryBuild=true;
  if(verifyOnly){const [existingBytes,existingReport]=await Promise.all([readFile(outputPath),readJson(reportPath)]);assert.equal(sha256(existingBytes),sha256(artifact.bytes),"checked-in GLB is stale");assert.deepEqual(existingReport,artifact.report,"checked-in report is stale");assert.equal((await stat(outputPath)).size,artifact.report.budget.bytes);process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);return;}
  await Promise.all([writeFile(outputPath,artifact.bytes),writeFile(reportPath,stableJson(artifact.report)),writeFile(validatorPath,stableJson(artifact.validation)),writeFile(inspectPath,stableJson(artifact.inspection))]);process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};

await main();
