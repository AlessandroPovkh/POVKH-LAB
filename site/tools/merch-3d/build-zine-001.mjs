import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, getBounds, inspect, prune } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const sourcePath = path.join(here, "zine-001.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/zine-001.glb");
const reportPath = path.join(here, "reports/zine-001.report.json");
const validatorPath = path.join(here, "reports/zine-001.validator.json");
const inspectPath = path.join(here, "reports/zine-001.inspect.json");
const verifyOnly = process.argv.includes("--verify");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mm = (value) => value / 1000;

class Geometry {
  constructor() { this.positions = []; this.normals = []; this.uvs = []; this.indices = []; }
  vertex(position, normal, uv = [0, 0]) { const index = this.positions.length / 3; this.positions.push(...position); this.normals.push(...normal); this.uvs.push(...uv); return index; }
  quad(points, normal, uvs = [[0,0],[1,0],[1,1],[0,1]]) { const v = points.map((point, index) => this.vertex(point, normal, uvs[index])); this.indices.push(v[0],v[1],v[2],v[0],v[2],v[3]); }
}

const addBox = (geometry, [cx,cy,cz], [sx,sy,sz]) => {
  const [x0,x1]=[cx-sx/2,cx+sx/2],[y0,y1]=[cy-sy/2,cy+sy/2],[z0,z1]=[cz-sz/2,cz+sz/2];
  geometry.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1]); geometry.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1]);
  geometry.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0]); geometry.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0]);
  geometry.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0]); geometry.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0]);
};

const materialFor = (doc, name, preset) => doc.createMaterial(name).setBaseColorFactor(preset.baseColor).setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness);
const primitiveFor = (doc, buffer, name, geometry, material) => doc.createPrimitive()
  .setAttribute("POSITION", doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer))
  .setAttribute("NORMAL", doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer))
  .setAttribute("TEXCOORD_0", doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(geometry.uvs)).setBuffer(buffer))
  .setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint16Array(geometry.indices)).setBuffer(buffer)).setMaterial(material);
const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((result, mesh) => { for (const primitive of mesh.listPrimitives()) { result.triangles += primitive.getIndices().getCount()/3; result.drawCalls += 1; } return result; }, { triangles: 0, drawCalls: 0 });

const buildArtifact = async () => {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const integrity = {};
  for (const [key, entry] of Object.entries(source.canonicalSource)) {
    const bytes = await readFile(path.join(here, entry.fixturePath)); assert.equal(sha256(bytes), entry.sha256, `${key} source drift`);
    integrity[key] = { canonicalPath: entry.canonicalPath, fixturePath: entry.fixturePath, sha256: entry.sha256, bytes: bytes.byteLength };
  }
  const coverBytes = await readFile(path.join(here, source.canonicalSource.cover.fixturePath));
  const coverRaster = await sharp(coverBytes, { density: 72 }).resize(800, 1135, { fit: "fill" }).png({ compressionLevel: 9, adaptiveFiltering: false, palette: true, colours: 256, effort: 10 }).toBuffer();
  const doc = new Document(); const scene = doc.createScene("Zine_001_Static_Closed_A5"); doc.getRoot().setDefaultScene(scene); const buffer = doc.createBuffer("Zine_001_Buffer");
  const assembly = doc.createNode("Zine_001_Centred_Grounded_Pivot").setExtras({ displayState: "static-closed", groundY: 0, pageCount: 32 }); scene.addChild(assembly);
  const blackMaterial = materialFor(doc, "MAT_ZINE_BLACK_COVER", source.materials.blackCover);
  const pageMaterial = materialFor(doc, "MAT_ZINE_PAGE_BLOCK", source.materials.pageBlock);
  const stapleMaterial = materialFor(doc, "MAT_ZINE_STAPLES", source.materials.staple);
  const texture = doc.createTexture("Zine_001_V04_Cover_Texture").setImage(coverRaster).setMimeType("image/png").setExtras({ canonicalSourceSha256: source.canonicalSource.cover.sha256, authoritySha256: source.canonicalSource.authority.sha256 });
  const artMaterial = doc.createMaterial("MAT_ZINE_V04_FRONT_COVER").setBaseColorTexture(texture).setBaseColorFactor([1,1,1,1]).setMetallicFactor(0).setRoughnessFactor(0.92).setAlphaMode("BLEND").setDoubleSided(true);
  const black = new Geometry(), pages = new Geometry(), art = new Geometry(), staples = new Geometry();
  addBox(black, [0,mm(105),mm(1.095)], [mm(148),mm(210),mm(0.19)]);
  addBox(black, [0,mm(105),mm(-1.095)], [mm(148),mm(210),mm(0.19)]);
  addBox(black, [mm(-73.7),mm(105),0], [mm(0.6),mm(210),mm(2.4)]);
  addBox(pages, [mm(0.3),mm(105),0], [mm(147.4),mm(209),mm(2)]);
  art.quad([[-mm(74),0,mm(1.195)],[mm(74),0,mm(1.195)],[mm(74),mm(210),mm(1.195)],[-mm(74),mm(210),mm(1.195)]],[0,0,1],[[0,1],[1,1],[1,0],[0,0]]);
  for (const staple of source.staples) addBox(staples, staple.centreMm.map(mm), staple.sizeMm.map(mm));
  const mesh = doc.createMesh("Zine_001_Closed_Assembly_Mesh")
    .addPrimitive(primitiveFor(doc, buffer, "Zine_Black_Cover_And_Spine", black, blackMaterial))
    .addPrimitive(primitiveFor(doc, buffer, "Zine_Page_Block", pages, pageMaterial))
    .addPrimitive(primitiveFor(doc, buffer, "Zine_V04_Front_Artwork", art, artMaterial))
    .addPrimitive(primitiveFor(doc, buffer, "Zine_Two_Staples", staples, stapleMaterial));
  assembly.addChild(doc.createNode("Zine_001_Closed_Page_Block").setMesh(mesh).setExtras({ pageCount: 32, closed: true, interiorsModelled: false }));
  assembly.addChild(doc.createNode("Zine_001_Shallow_Spine").setTranslation([mm(-73.7),mm(105),0]).setExtras({ shallow: true, widthMm: 0.6 }));
  for (const staple of source.staples) assembly.addChild(doc.createNode(staple.name).setTranslation(staple.centreMm.map(mm)).setExtras({ visible: true, material: "metal staple", sizeMm: staple.sizeMm }));
  await doc.transform(dedup(), prune({ keepExtras: true }));
  const io = new NodeIO(), bytes = Buffer.from(await io.writeBinary(doc)), reopened = await io.readBinary(bytes), bounds = getBounds(reopened.getRoot().getDefaultScene()), metrics = metricsFor(reopened);
  const validation = await validateBytes(new Uint8Array(bytes), { uri: "zine-001.glb", format: "glb", writeTimestamp: false, maxIssues: 100 });
  const summary = { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, hints: validation.issues.numHints };
  assert.equal(summary.errors,0); assert.equal(summary.warnings,0); assert.ok(bytes.byteLength<=source.budgets.maxBytes); assert.ok(metrics.triangles<=source.budgets.maxTriangles); assert.ok(metrics.drawCalls<=source.budgets.maxDrawCalls);
  const actualSizeMm = bounds.min.map((value,axis)=>(bounds.max[axis]-value)*1000);
  assert.ok(actualSizeMm.every((value,axis)=>Math.abs(value-source.dimensionsMm.closed[axis])<0.02), `closed dimensions drift: ${actualSizeMm}`);
  return { bytes, validation, inspection: inspect(reopened), report: { schemaVersion:1, assetKey:source.assetKey, sourceIntegrity:integrity, derivedRaster:{sha256:sha256(coverRaster),bytes:coverRaster.byteLength,dimensionsPx:[800,1135],canonicalCoverSha256:source.canonicalSource.cover.sha256,authoritySha256:source.canonicalSource.authority.sha256}, physicalEvidence:{method:"reopened-glb-bounds-and-node-registration",closed:true,dimensionsMm:[148,210,2.4],pageCount:32,blackCover:true,shallowSpine:true,visibleStaples:2,interiors:0,pageTurnAnimations:0}, galleryPolicy:source.galleryPolicy, cameraRecommendations:source.camera, validation:summary, budget:{...metrics,bytes:bytes.byteLength,ceilings:source.budgets}, output:{path:"assets/merch-3d/zine-001.glb",sha256:sha256(bytes)}, deterministic:{verifiedBySecondInMemoryBuild:false} } };
};

const main = async () => {
  const artifact=await buildArtifact(), second=await buildArtifact(); assert.equal(sha256(artifact.bytes),sha256(second.bytes),"ZINE build is not byte-deterministic"); artifact.report.deterministic.verifiedBySecondInMemoryBuild=true;
  if(verifyOnly){const[existingBytes,existingReport]=await Promise.all([readFile(outputPath),readFile(reportPath,"utf8").then(JSON.parse)]);assert.equal(sha256(existingBytes),sha256(artifact.bytes));assert.deepEqual(existingReport,artifact.report);assert.equal((await stat(outputPath)).size,artifact.report.budget.bytes);process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);return;}
  await Promise.all([writeFile(outputPath,artifact.bytes),writeFile(reportPath,stableJson(artifact.report)),writeFile(validatorPath,stableJson(artifact.validation)),writeFile(inspectPath,stableJson(artifact.inspection))]);
  process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};
await main();
