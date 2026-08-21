import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, getBounds, inspect, prune } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } = require("@zxing/library");
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const sourcePath = path.join(here, "signal-kit-001.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/signal-kit-001.glb");
const reportPath = path.join(here, "reports/signal-kit-001.report.json");
const validatorPath = path.join(here, "reports/signal-kit-001.validator.json");
const inspectPath = path.join(here, "reports/signal-kit-001.inspect.json");
const verifyOnly = process.argv.includes("--verify");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mm = (value) => value / 1000;

class Geometry {
  constructor() { this.positions = []; this.normals = []; this.uvs = []; this.indices = []; }
  vertex(position, normal, uv = [0, 0]) { const index = this.positions.length / 3; this.positions.push(...position); this.normals.push(...normal); this.uvs.push(...uv); return index; }
  quad(points, normal, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) { const v = points.map((point, index) => this.vertex(point, normal, uvs[index])); this.indices.push(v[0], v[1], v[2], v[0], v[2], v[3]); }
  face(points, uvs, normal = [0, 0, 1]) {
    const centre = points.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / points.length), [0, 0, 0]);
    const centreUv = uvs.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / uvs.length), [0, 0]);
    const c = this.vertex(centre, normal, centreUv);
    const ring = points.map((point, index) => this.vertex(point, normal, uvs[index]));
    for (let index = 0; index < ring.length; index += 1) this.indices.push(c, ring[index], ring[(index + 1) % ring.length]);
  }
}

const addBox = (geometry, [cx, cy, cz], [sx, sy, sz]) => {
  const [x0, x1] = [cx - sx / 2, cx + sx / 2], [y0, y1] = [cy - sy / 2, cy + sy / 2], [z0, z1] = [cz - sz / 2, cz + sz / 2];
  geometry.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1]); geometry.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1]);
  geometry.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0]); geometry.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0]);
  geometry.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0]); geometry.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0]);
};

const islandPolygon = (island) => {
  const x0 = island.x, x1 = island.x + island.width, y0 = island.y, y1 = island.y + island.height;
  const radius = island.radius || island.chamfer || 0;
  if (island.shape === "rounded-rect") {
    const points = [];
    const corners = [[x0 + radius, y1 - radius, 180, 90], [x1 - radius, y1 - radius, 90, 0], [x1 - radius, y0 + radius, 0, -90], [x0 + radius, y0 + radius, -90, -180]];
    for (const [cx, cy, start, end] of corners) for (let step = 0; step <= 3; step += 1) {
      const angle = (start + (end - start) * step / 3) * Math.PI / 180;
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    return points;
  }
  return [[x0 + radius, y1], [x1 - radius, y1], [x1, y1 - radius], [x1, y0 + radius], [x1 - radius, y0], [x0 + radius, y0], [x0, y0 + radius], [x0, y1 - radius]];
};

const pointFor = ([x, y], z) => [mm(x / 6 - 74), mm(210 - y / 6), z];
const uvFor = ([x, y]) => [x / 888, y / 1260];

const addIsland = (paper, art, island, baseFront, rise) => {
  const polygon = islandPolygon(island);
  art.face(polygon.map((point) => pointFor(point, baseFront + rise)), polygon.map(uvFor));
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index], next = polygon[(index + 1) % polygon.length];
    const a = pointFor(current, baseFront), b = pointFor(next, baseFront), c = pointFor(next, baseFront + rise), d = pointFor(current, baseFront + rise);
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
    paper.quad([a, b, c, d], [dy / length, -dx / length, 0]);
  }
};

const decodeQr = async (pngBytes, crop) => {
  let image = sharp(pngBytes);
  if (crop) image = image.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] }).resize(crop[2] * 4, crop[3] * 4, { kernel: "nearest" });
  const { data, info } = await image.flatten({ background: "#f2efe7" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const source = new RGBLuminanceSource(Uint8ClampedArray.from(data), info.width, info.height);
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
};

const primitiveFor = (doc, buffer, name, geometry, material) => doc.createPrimitive()
  .setAttribute("POSITION", doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer))
  .setAttribute("NORMAL", doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer))
  .setAttribute("TEXCOORD_0", doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(geometry.uvs)).setBuffer(buffer))
  .setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint16Array(geometry.indices)).setBuffer(buffer)).setMaterial(material);

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((result, mesh) => { for (const primitive of mesh.listPrimitives()) { result.triangles += primitive.getIndices().getCount() / 3; result.drawCalls += 1; } return result; }, { triangles: 0, drawCalls: 0 });

const buildArtifact = async () => {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const integrity = {};
  for (const [key, entry] of Object.entries(source.canonicalSource)) {
    const bytes = await readFile(path.join(here, entry.fixturePath));
    assert.equal(sha256(bytes), entry.sha256, `${key} source drift`);
    integrity[key] = { canonicalPath: entry.canonicalPath, fixturePath: entry.fixturePath, sha256: entry.sha256, bytes: bytes.byteLength };
  }
  assert.equal(await decodeQr(await readFile(path.join(here, source.canonicalSource.productionQr.fixturePath))), source.qr.targetUrl, "production QR authority payload drift");
  const masterBytes = await readFile(path.join(here, source.canonicalSource.master.fixturePath));
  const raster = await sharp(masterBytes, { density: 72 }).resize(888, 1260, { fit: "fill" }).png({ compressionLevel: 9, adaptiveFiltering: false, palette: true, colours: 256, effort: 10 }).toBuffer();
  const embeddedDecodedUrl = await decodeQr(raster, source.qr.textureCropPx);
  assert.equal(embeddedDecodedUrl, source.qr.targetUrl, "optimized embedded master QR does not decode to production target");

  const doc = new Document();
  const scene = doc.createScene("Signal_Kit_001_A5_Attached_Sheet"); doc.getRoot().setDefaultScene(scene);
  const buffer = doc.createBuffer("Signal_Kit_001_Buffer");
  const assembly = doc.createNode("Signal_Kit_001_Centred_Grounded_Pivot").setTranslation([0, 0, mm(-0.06)]).setExtras({ carrier: "A5", attached: true, peeled: false }); scene.addChild(assembly);
  const paperMaterial = doc.createMaterial("MAT_SIGNAL_KIT_BONE_CARRIER").setBaseColorFactor(source.materials.bone.baseColor).setMetallicFactor(0).setRoughnessFactor(source.materials.bone.roughness);
  const texture = doc.createTexture("Signal_Kit_001_V06_Master_Texture").setImage(raster).setMimeType("image/png").setExtras({ canonicalSourceSha256: source.canonicalSource.master.sha256, productionQrSha256: source.canonicalSource.productionQr.sha256, decodedUrl: embeddedDecodedUrl });
  const artMaterial = doc.createMaterial("MAT_SIGNAL_KIT_V06_MASTER").setBaseColorTexture(texture).setBaseColorFactor([1,1,1,1]).setMetallicFactor(0).setRoughnessFactor(0.92).setAlphaMode("BLEND").setDoubleSided(true);
  const paper = new Geometry(), art = new Geometry();
  const carrierThickness = mm(0.25), baseFront = carrierThickness / 2, rise = mm(0.12);
  addBox(paper, [0, mm(105), 0], [mm(148), mm(210), carrierThickness]);
  art.quad([[-mm(74),0,baseFront],[mm(74),0,baseFront],[mm(74),mm(210),baseFront],[-mm(74),mm(210),baseFront]],[0,0,1],[[0,1],[1,1],[1,0],[0,0]]);
  for (const island of source.islands) {
    addIsland(paper, art, island, baseFront, rise);
    const centreX = mm((island.x + island.width / 2) / 6 - 74), centreY = mm(210 - (island.y + island.height / 2) / 6);
    assembly.addChild(doc.createNode(`Signal_Island_${island.role}`).setTranslation([centreX, centreY, baseFront]).setExtras({ role: island.role, shape: island.shape, attached: true, peeled: false, shallowRiseMm: 0.12, geometryAuthority: "placements-v05-only" }));
  }
  const mesh = doc.createMesh("Signal_Kit_001_Carrier_And_Islands_Mesh").addPrimitive(primitiveFor(doc, buffer, "Signal_Paper", paper, paperMaterial)).addPrimitive(primitiveFor(doc, buffer, "Signal_Art", art, artMaterial));
  assembly.addChild(doc.createNode("Signal_Kit_001_Carrier_And_Attached_Islands").setMesh(mesh));
  await doc.transform(dedup(), prune({ keepExtras: true }));
  const io = new NodeIO(), bytes = Buffer.from(await io.writeBinary(doc)), reopened = await io.readBinary(bytes);
  const bounds = getBounds(reopened.getRoot().getDefaultScene()), metrics = metricsFor(reopened);
  const validation = await validateBytes(new Uint8Array(bytes), { uri: "signal-kit-001.glb", format: "glb", writeTimestamp: false, maxIssues: 100 });
  const summary = { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, hints: validation.issues.numHints };
  assert.equal(summary.errors, 0); assert.equal(summary.warnings, 0); assert.ok(bytes.byteLength <= source.budgets.maxBytes); assert.ok(metrics.triangles <= source.budgets.maxTriangles); assert.ok(metrics.drawCalls <= source.budgets.maxDrawCalls);
  const toMm = (values) => values.map((value) => value * 1000);
  return { bytes, validation, inspection: inspect(reopened), report: { schemaVersion: 1, assetKey: source.assetKey, sourceIntegrity: integrity, derivedRaster: { sha256: sha256(raster), bytes: raster.byteLength, dimensionsPx: [888,1260], canonicalMasterSha256: source.canonicalSource.master.sha256 }, qrEvidence: { productionQrSha256: source.canonicalSource.productionQr.sha256, exactTargetUrl: source.qr.targetUrl, embeddedTextureDecodedUrl: embeddedDecodedUrl, cropPx: source.qr.textureCropPx }, physicalEvidence: { method: "reopened-glb-bounds-and-island-registration", boundsMm: { min: toMm(bounds.min), max: toMm(bounds.max) }, carrierMm: source.dimensionsMm.carrier, islandRiseMm: source.dimensionsMm.islandRise, attachedUnpeeledIslandRoles: source.islands.map((entry) => entry.role) }, cameraRecommendations: source.camera, validation: summary, budget: { ...metrics, bytes: bytes.byteLength, ceilings: source.budgets }, output: { path: "assets/merch-3d/signal-kit-001.glb", sha256: sha256(bytes) }, deterministic: { verifiedBySecondInMemoryBuild: false } } };
};

const main = async () => {
  const artifact = await buildArtifact(), second = await buildArtifact();
  assert.equal(sha256(artifact.bytes), sha256(second.bytes), "SIGNAL build is not byte-deterministic"); artifact.report.deterministic.verifiedBySecondInMemoryBuild = true;
  if (verifyOnly) {
    const [existingBytes, existingReport] = await Promise.all([readFile(outputPath), readFile(reportPath, "utf8").then(JSON.parse)]);
    assert.equal(sha256(existingBytes), sha256(artifact.bytes)); assert.deepEqual(existingReport, artifact.report); assert.equal((await stat(outputPath)).size, artifact.report.budget.bytes);
    process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`); return;
  }
  await Promise.all([writeFile(outputPath, artifact.bytes), writeFile(reportPath, stableJson(artifact.report)), writeFile(validatorPath, stableJson(artifact.validation)), writeFile(inspectPath, stableJson(artifact.inspection))]);
  process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};
await main();
