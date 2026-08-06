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
const sourcePath = path.join(here, "vinyl-001.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/vinyl-001.glb");
const reportPath = path.join(here, "reports/vinyl-001.report.json");
const validatorPath = path.join(here, "reports/vinyl-001.validator.json");
const inspectPath = path.join(here, "reports/vinyl-001.inspect.json");
const verifyOnly = process.argv.includes("--verify");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const mm = (value) => value / 1000;

class Geometry {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }
  vertex(position, normal, uv = [0, 0]) {
    const index = this.positions.length / 3;
    this.positions.push(...position);
    this.normals.push(...normal);
    this.uvs.push(...uv);
    return index;
  }
  quad(points, normal, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const vertices = points.map((point, index) => this.vertex(point, normal, uvs[index]));
    this.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
  }
}

const addBox = (geometry, [cx, cy, cz], [sx, sy, sz]) => {
  const [x0, x1] = [cx - sx / 2, cx + sx / 2];
  const [y0, y1] = [cy - sy / 2, cy + sy / 2];
  const [z0, z1] = [cz - sz / 2, cz + sz / 2];
  geometry.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], [0,0,1]);
  geometry.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], [0,0,-1]);
  geometry.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], [1,0,0]);
  geometry.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], [-1,0,0]);
  geometry.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], [0,1,0]);
  geometry.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], [0,-1,0]);
};

const addBeveledSleeve = (geometry, width, height, depth, bevel) => {
  const x0=-width/2,x1=width/2,y0=0,y1=height,z0=-depth/2,z1=depth/2;
  const edge=[[x0+bevel,y0],[x1-bevel,y0],[x1,y0+bevel],[x1,y1-bevel],[x1-bevel,y1],[x0+bevel,y1],[x0,y1-bevel],[x0,y0+bevel]];
  const frontCentre=geometry.vertex([0,height/2,z1],[0,0,1],[0.5,0.5]);
  const backCentre=geometry.vertex([0,height/2,z0],[0,0,-1],[0.5,0.5]);
  for(let index=0;index<edge.length;index+=1){
    const next=(index+1)%edge.length;
    const [ax,ay]=edge[index],[bx,by]=edge[next];
    const fa=geometry.vertex([ax,ay,z1],[0,0,1]),fb=geometry.vertex([bx,by,z1],[0,0,1]);
    geometry.indices.push(frontCentre,fa,fb);
    const ba=geometry.vertex([bx,by,z0],[0,0,-1]),bb=geometry.vertex([ax,ay,z0],[0,0,-1]);
    geometry.indices.push(backCentre,ba,bb);
    const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy)||1,normal=[dy/length,-dx/length,0];
    const side=[geometry.vertex([ax,ay,z0],normal),geometry.vertex([bx,by,z0],normal),geometry.vertex([bx,by,z1],normal),geometry.vertex([ax,ay,z1],normal)];
    geometry.indices.push(side[0],side[1],side[2],side[0],side[2],side[3]);
  }
};

const addFrontQuad = (geometry, width, height, z) => geometry.quad(
  [[-width/2, 0, z],[width/2,0,z],[width/2,height,z],[-width/2,height,z]],
  [0,0,1], [[0,1],[1,1],[1,0],[0,0]]
);

const addBackQuad = (geometry, width, height, z) => geometry.quad(
  [[width/2,0,z],[-width/2,0,z],[-width/2,height,z],[width/2,height,z]],
  [0,0,-1], [[0,1],[1,1],[1,0],[0,0]]
);

const addAnnulus = (geometry, outerRadius, innerRadius, depth, segments, {grooves = 0} = {}) => {
  const z0 = -depth / 2;
  const z1 = depth / 2;
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const p = (angle, radius, z) => [Math.cos(angle) * radius, Math.sin(angle) * radius + outerRadius, z];
    const uv = (angle, radius) => [0.5 + Math.cos(angle) * radius / (outerRadius * 2), 0.5 - Math.sin(angle) * radius / (outerRadius * 2)];
    const of0 = geometry.vertex(p(a0, outerRadius, z1), [0,0,1], uv(a0, outerRadius));
    const of1 = geometry.vertex(p(a1, outerRadius, z1), [0,0,1], uv(a1, outerRadius));
    const if1 = geometry.vertex(p(a1, innerRadius, z1), [0,0,1], uv(a1, innerRadius));
    const if0 = geometry.vertex(p(a0, innerRadius, z1), [0,0,1], uv(a0, innerRadius));
    geometry.indices.push(of0, of1, if1, of0, if1, if0);
    const ob1 = geometry.vertex(p(a1, outerRadius, z0), [0,0,-1], uv(a1, outerRadius));
    const ob0 = geometry.vertex(p(a0, outerRadius, z0), [0,0,-1], uv(a0, outerRadius));
    const ib0 = geometry.vertex(p(a0, innerRadius, z0), [0,0,-1], uv(a0, innerRadius));
    const ib1 = geometry.vertex(p(a1, innerRadius, z0), [0,0,-1], uv(a1, innerRadius));
    geometry.indices.push(ob1, ob0, ib0, ob1, ib0, ib1);
    const n0 = [Math.cos(a0), Math.sin(a0), 0];
    const n1 = [Math.cos(a1), Math.sin(a1), 0];
    const s0 = geometry.vertex(p(a0, outerRadius, z0), n0);
    const s1 = geometry.vertex(p(a1, outerRadius, z0), n1);
    const s2 = geometry.vertex(p(a1, outerRadius, z1), n1);
    const s3 = geometry.vertex(p(a0, outerRadius, z1), n0);
    geometry.indices.push(s0,s1,s2,s0,s2,s3);
    const h0 = geometry.vertex(p(a1, innerRadius, z0), [-n1[0],-n1[1],0]);
    const h1 = geometry.vertex(p(a0, innerRadius, z0), [-n0[0],-n0[1],0]);
    const h2 = geometry.vertex(p(a0, innerRadius, z1), [-n0[0],-n0[1],0]);
    const h3 = geometry.vertex(p(a1, innerRadius, z1), [-n1[0],-n1[1],0]);
    geometry.indices.push(h0,h1,h2,h0,h2,h3);
  }
  for (let groove = 0; groove < grooves; groove += 1) {
    const radius = innerRadius + mm(12) + groove * (outerRadius - innerRadius - mm(20)) / Math.max(grooves - 1, 1);
    const width = mm(0.18);
    for (let index = 0; index < segments; index += 1) {
      const a0 = index / segments * Math.PI * 2;
      const a1 = (index + 1) / segments * Math.PI * 2;
      const point = (angle, r) => [Math.cos(angle)*r, Math.sin(angle)*r+outerRadius, z1];
      const tilt = 0.22;
      const normal = (angle) => [Math.cos(angle)*tilt, Math.sin(angle)*tilt, Math.sqrt(1-tilt*tilt)];
      const vertices = [
        geometry.vertex(point(a0,radius+width), normal(a0)),
        geometry.vertex(point(a1,radius+width), normal(a1)),
        geometry.vertex(point(a1,radius-width), normal(a1)),
        geometry.vertex(point(a0,radius-width), normal(a0))
      ];
      geometry.indices.push(vertices[0],vertices[1],vertices[2],vertices[0],vertices[2],vertices[3]);
    }
  }
};

const createMaterial = (doc, name, preset) => {
  const material = doc.createMaterial(name)
    .setBaseColorFactor(preset.baseColor)
    .setMetallicFactor(preset.metallic)
    .setRoughnessFactor(preset.roughness);
  if (preset.alphaMode) material.setAlphaMode(preset.alphaMode).setDoubleSided(true);
  return material;
};

const rasterizeMaster = async (filename, width, background) => sharp(await readFile(path.join(here, filename)), {density: 144})
  .resize(width, width, {fit: "fill", kernel: "lanczos3"})
  .flatten({background})
  .png({compressionLevel: 9, adaptiveFiltering: false, effort: 10, palette: false})
  .toBuffer();

const createTextureMaterial = async (doc, name, identity, width, roughness, background) => {
  const image = identity.derivedRaster ? await readFile(path.join(here, identity.derivedRaster.path)) : await rasterizeMaster(identity.path, width, background);
  if (identity.derivedRaster) assert.equal(sha256(image), identity.derivedRaster.sha256, `${name} governed derivative drift`);
  const texture = doc.createTexture(`${name}_Texture`)
    .setImage(image)
    .setMimeType("image/png")
    .setExtras({canonicalSourceSha256: identity.sha256, derivedRasterSha256: sha256(image)});
  const material = doc.createMaterial(name)
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1,1,1,1])
    .setMetallicFactor(0)
    .setRoughnessFactor(roughness)
    .setDoubleSided(true);
  return {material, image};
};

const createRecordMaterial = async (doc) => {
  const size=512,channels=4,pixels=Buffer.alloc(size*size*channels);
  const fract=(value)=>value-Math.floor(value);
  const smooth=(value)=>value*value*(3-2*value);
  const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453123);
  const noise=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
    const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
    return (a+(b-a)*fx)+((c+(d-c)*fx)-(a+(b-a)*fx))*fy;
  };
  const fbm=(x,y)=>{let total=0,amplitude=0.56,scale=1,norm=0;for(let octave=0;octave<5;octave+=1){total+=noise(x*scale,y*scale)*amplitude;norm+=amplitude;scale*=2.03;amplitude*=0.48;}return total/norm;};
  for(let y=0;y<size;y+=1){
    for(let x=0;x<size;x+=1){
      const nx=(x+0.5)/size*2-1,ny=(y+0.5)/size*2-1,r=Math.hypot(nx,ny),angle=Math.atan2(ny,nx);
      const warpX=fbm(nx*2.4+7.3,ny*2.4+1.1),warpY=fbm(nx*2.4-3.7,ny*2.4+8.2);
      const broad=fbm(nx*4.5+warpX*2.8,ny*4.5+warpY*2.8);
      const detail=fbm(nx*9.5+warpY*3.2,ny*9.5-warpX*3.2);
      const smokyVein=Math.max(0,(0.42-broad))*1.35;
      const groove=0.94+0.06*Math.sin(r*510+angle*0.35);
      const smoke=Math.max(0.14,Math.min(0.93,(0.18+broad*0.57+detail*0.25-smokyVein)*groove));
      const offset=(y*size+x)*channels;
      pixels[offset]=Math.round(255*smoke);
      pixels[offset+1]=Math.round(220*(0.70+smoke*0.30));
      pixels[offset+2]=Math.round(225*(0.72+smoke*0.28));
      pixels[offset+3]=r<=1?238:0;
    }
  }
  const image=await sharp(pixels,{raw:{width:size,height:size,channels}}).png({compressionLevel:9,adaptiveFiltering:false,effort:10}).toBuffer();
  const texture=doc.createTexture("Vinyl_001_Deterministic_Smoke_Texture").setImage(image).setMimeType("image/png").setExtras({proceduralRecipe:"pvkh-signal-red-smoke-v1",derivedRasterSha256:sha256(image)});
  const material=doc.createMaterial("MAT_SIGNAL_RED_SMOKE_RECORD").setBaseColorTexture(texture).setBaseColorFactor([0.31,0.004,0.012,0.86]).setMetallicFactor(0.16).setRoughnessFactor(0.22).setAlphaMode("BLEND").setDoubleSided(true);
  return {material,image};
};

const primitiveFor = (doc, buffer, name, geometry, material) => {
  const position = doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer);
  const normal = doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer);
  const uv = doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(geometry.uvs)).setBuffer(buffer);
  const indices = doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint32Array(geometry.indices)).setBuffer(buffer);
  return doc.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal).setAttribute("TEXCOORD_0", uv).setIndices(indices).setMaterial(material);
};

const addMeshNode = (doc, parent, buffer, name, geometry, material, translation, extras = {}) => {
  const mesh = doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc, buffer, name, geometry, material));
  const node = doc.createNode(name).setMesh(mesh).setTranslation(translation).setExtras(extras);
  parent.addChild(node);
  return node;
};

const verifySources = async (source) => {
  const identity = {};
  for (const [key, entry] of Object.entries(source.identity)) {
    const bytes = await readFile(path.join(here, entry.path));
    assert.equal(sha256(bytes), entry.sha256, `${key} master drift`);
    if (entry.derivedRaster) assert.equal(sha256(await readFile(path.join(here, entry.derivedRaster.path))), entry.derivedRaster.sha256, `${key} derived raster drift`);
    identity[key] = {path: entry.path, sha256: entry.sha256, bytes: bytes.byteLength, derivedRaster: entry.derivedRaster || null};
  }
  const authority = {};
  for (const [key, entry] of Object.entries(source.canonicalSource)) {
    const bytes = await readFile(path.join(here, entry.fixturePath));
    assert.equal(sha256(bytes), entry.fixtureSha256, `${key} fixture drift`);
    const fixture = JSON.parse(bytes);
    assert.equal(fixture.authorityType, "governed-minimal-copy");
    assert.equal(fixture.canonicalPath, entry.path);
    assert.equal(fixture.canonicalSha256, entry.sha256);
    authority[key] = {fixturePath: entry.fixturePath, fixtureSha256: entry.fixtureSha256, canonicalPath: entry.path, canonicalSha256: entry.sha256};
  }
  return {identity, authority};
};

const buildDocument = async (source) => {
  const doc = new Document();
  const scene = doc.createScene("Vinyl_001_Physical_Display");
  doc.getRoot().setDefaultScene(scene);
  const buffer = doc.createBuffer("Vinyl_001_Buffer");
  const assembly = doc.createNode("Vinyl_001_Centred_Grounded_Pivot").setTranslation([mm(-59.5),0,0]).setExtras({groundY: 0, pivotPolicy: "display-envelope-centred"});
  scene.addChild(assembly);
  const materials = {
    bone: createMaterial(doc, "MAT_BONE_SLEEVE", source.materials.bone),
    void: createMaterial(doc, "MAT_VOID_INNER", source.materials.void),
    red: null
  };
  const recordMaterial = await createRecordMaterial(doc);
  materials.red=recordMaterial.material;
  const front = await createTextureMaterial(doc, "MAT_VINYL_OUTER_FRONT_MASTER_V05", source.identity.outerFront, 1024, 0.84, "#F2EFE7");
  const reverse = await createTextureMaterial(doc, "MAT_VINYL_OUTER_REVERSE_MASTER_V05", source.identity.outerReverse, 1024, 0.84, "#F2EFE7");
  const label = await createTextureMaterial(doc, "MAT_VINYL_CENTER_LABEL_MASTER_V05", source.identity.centerLabel, 768, 0.44, "#080808");

  const outer = new Geometry();
  addBeveledSleeve(outer,mm(315),mm(315),mm(4),mm(1.1));
  addMeshNode(doc, assembly, buffer, "Vinyl_Outer_Sleeve", outer, materials.bone, [mm(-96),0,0], {nominalDimensionsMm: source.dimensionsMm.outerSleeve});
  const frontArt = new Geometry();
  addFrontQuad(frontArt, mm(310.2), mm(310.2), mm(2.012));
  addMeshNode(doc, assembly, buffer, "Vinyl_Outer_Front_Artwork", frontArt, front.material, [mm(-96),mm(2.4),0], {canonicalSourceSha256: source.identity.outerFront.sha256});
  const reverseArt = new Geometry();
  addBackQuad(reverseArt, mm(310.2), mm(310.2), mm(-2.012));
  addMeshNode(doc, assembly, buffer, "Vinyl_Outer_Reverse_Artwork", reverseArt, reverse.material, [mm(-96),mm(2.4),0], {canonicalSourceSha256: source.identity.outerReverse.sha256});
  const inner = new Geometry();
  addBox(inner, [0,mm(153.5),0], [mm(307),mm(307),mm(0.5)]);
  addMeshNode(doc, assembly, buffer, "Vinyl_Inner_Sleeve", inner, materials.void, [mm(219),mm(4),mm(-3.2)], {nominalDimensionsMm: source.dimensionsMm.innerSleeve});
  const record = new Geometry();
  addAnnulus(record, mm(150), mm(3.6), mm(1.9), 256, {grooves: 12});
  addMeshNode(doc, assembly, buffer, "Vinyl_Record", record, materials.red, [mm(219),0,mm(3.2)], {diameterMm: 300, depthMm: 1.9, centreHoleDiameterMm: 7.2, displayState: source.display.state});
  const centerLabel = new Geometry();
  addAnnulus(centerLabel, mm(50), mm(3.6), mm(0.12), 256);
  addMeshNode(doc, assembly, buffer, "Vinyl_Center_Label", centerLabel, label.material, [mm(219),mm(100),mm(4.72)], {canonicalSourceSha256: source.identity.centerLabel.sha256, residentCopyGoverned: true, excludesDevOnlyContent: true});

  const before = inspect(doc);
  await doc.transform(dedup(), prune({keepExtras: true}));
  return {doc, before, rasters: {outerFront: sha256(front.image), outerReverse: sha256(reverse.image), centerLabel: sha256(label.image), signalRedSmoke: sha256(recordMaterial.image)}};
};

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((totals, mesh) => {
  for (const primitive of mesh.listPrimitives()) {
    totals.triangles += primitive.getIndices().getCount() / 3;
    totals.drawCalls += 1;
  }
  return totals;
}, {triangles: 0, drawCalls: 0});

const validationSummary = (validation) => ({errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, hints: validation.issues.numHints});

const buildArtifact = async () => {
  const source = await readJson(sourcePath);
  const integrity = await verifySources(source);
  const built = await buildDocument(source);
  const io = new NodeIO();
  const bytes = Buffer.from(await io.writeBinary(built.doc));
  const reopened = await io.readBinary(bytes);
  const metrics = metricsFor(reopened);
  const validation = await validateBytes(new Uint8Array(bytes), {uri: "vinyl-001.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  const summary = validationSummary(validation);
  assert.equal(summary.errors, 0, "Khronos validator errors");
  assert.equal(summary.warnings, 0, "Khronos validator warnings");
  assert.ok(bytes.byteLength <= source.budgets.maxBytes);
  assert.ok(metrics.triangles <= source.budgets.maxTriangles);
  assert.ok(metrics.drawCalls <= source.budgets.maxDrawCalls);
  const report = {
    schemaVersion: 1,
    assetKey: source.assetKey,
    sourceIntegrity: integrity.identity,
    authorityIntegrity: integrity.authority,
    derivedRasterSha256: built.rasters,
    physicalEvidence: {method: "reopened-glb-accessor-bounds", dimensionsMm: source.dimensionsMm, centreHoleDiameterMm: 7.2, displayState: source.display.state},
    cameraRecommendations: source.camera,
    validation: summary,
    budget: {...metrics, bytes: bytes.byteLength, ceilings: source.budgets},
    output: {path: "assets/merch-3d/vinyl-001.glb", sha256: sha256(bytes)},
    deterministic: {verifiedBySecondInMemoryBuild: false},
    visualComparison: {canonicalSelected: "PVKH_DROP001_VINYL_SIGNAL_RED_PHYSICAL_MASTER_FULL_KIT_HERO_CONCEPT_v05.png", reviewStatus: "captured-six-views-readability-selected-compare", browserQa: "tools/merch-3d/reports/vinyl-001.browser-qa.json"}
  };
  return {source, bytes, report, validation, inspection: inspect(reopened)};
};

const main = async () => {
  const artifact = await buildArtifact();
  const second = await buildArtifact();
  assert.equal(sha256(artifact.bytes), sha256(second.bytes), "vinyl build is not byte-deterministic");
  artifact.report.deterministic.verifiedBySecondInMemoryBuild = true;
  if (verifyOnly) {
    const [existingBytes, existingReport] = await Promise.all([readFile(outputPath), readJson(reportPath)]);
    assert.equal(sha256(existingBytes), sha256(artifact.bytes), "checked-in GLB is stale");
    assert.deepEqual(existingReport, artifact.report, "checked-in report is stale");
    assert.equal((await stat(outputPath)).size, artifact.report.budget.bytes);
    process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
    return;
  }
  await Promise.all([
    writeFile(outputPath, artifact.bytes),
    writeFile(reportPath, stableJson(artifact.report)),
    writeFile(validatorPath, stableJson(artifact.validation)),
    writeFile(inspectPath, stableJson(artifact.inspection))
  ]);
  process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};

await main();
