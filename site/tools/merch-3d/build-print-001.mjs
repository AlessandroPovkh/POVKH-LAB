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
const sourcePath = path.join(here, "print-001.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/print-001.glb");
const reportPath = path.join(here, "reports/print-001.report.json");
const validatorPath = path.join(here, "reports/print-001.validator.json");
const inspectPath = path.join(here, "reports/print-001.inspect.json");
const verifyOnly = process.argv.includes("--verify");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mm = (value) => value / 1000;

class Geometry {
  constructor() { this.positions = []; this.normals = []; this.uvs = []; this.indices = []; }
  vertex(position, normal, uv = [0, 0]) {
    const index = this.positions.length / 3;
    this.positions.push(...position); this.normals.push(...normal); this.uvs.push(...uv);
    return index;
  }
  quad(points, normal, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const v = points.map((point, index) => this.vertex(point, normal, uvs[index]));
    this.indices.push(v[0], v[1], v[2], v[0], v[2], v[3]);
  }
}

const bowedSheet = ({ width, height, thickness, bow, segments }) => {
  const paper = new Geometry();
  const art = new Geometry();
  const frontZ = (x) => thickness / 2 + bow * (1 - (2 * x / width) ** 2);
  const backZ = (x) => frontZ(x) - thickness;
  for (let segment = 0; segment < segments; segment += 1) {
    const x0 = -width / 2 + width * segment / segments;
    const x1 = -width / 2 + width * (segment + 1) / segments;
    const u0 = segment / segments;
    const u1 = (segment + 1) / segments;
    art.quad([[x0, 0, frontZ(x0)], [x1, 0, frontZ(x1)], [x1, height, frontZ(x1)], [x0, height, frontZ(x0)]], [0, 0, 1], [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]);
    paper.quad([[x1, 0, backZ(x1)], [x0, 0, backZ(x0)], [x0, height, backZ(x0)], [x1, height, backZ(x1)]], [0, 0, -1]);
    paper.quad([[x0, height, frontZ(x0)], [x1, height, frontZ(x1)], [x1, height, backZ(x1)], [x0, height, backZ(x0)]], [0, 1, 0]);
    paper.quad([[x0, 0, backZ(x0)], [x1, 0, backZ(x1)], [x1, 0, frontZ(x1)], [x0, 0, frontZ(x0)]], [0, -1, 0]);
  }
  paper.quad([[-width / 2, 0, backZ(-width / 2)], [-width / 2, 0, frontZ(-width / 2)], [-width / 2, height, frontZ(-width / 2)], [-width / 2, height, backZ(-width / 2)]], [-1, 0, 0]);
  paper.quad([[width / 2, 0, frontZ(width / 2)], [width / 2, 0, backZ(width / 2)], [width / 2, height, backZ(width / 2)], [width / 2, height, frontZ(width / 2)]], [1, 0, 0]);
  return { paper, art };
};

const materialFor = (doc, preset) => doc.createMaterial(preset.name)
  .setBaseColorFactor(preset.baseColor)
  .setMetallicFactor(preset.metallic)
  .setRoughnessFactor(preset.roughness);

const textureMaterial = async (doc, entry, preset) => {
  const sourceBytes = await readFile(path.join(here, entry.path));
  assert.equal(sha256(sourceBytes), entry.sha256, `${preset.name} source drift`);
  const metadata = await sharp(sourceBytes).metadata();
  assert.deepEqual([metadata.width, metadata.height], entry.resolutionPx, `${preset.name} source resolution drift`);
  assert.equal(entry.texture.sourceUse, "full-image-no-crop");
  assert.deepEqual(entry.texture.cropPx, [0, 0, ...entry.resolutionPx]);
  assert.equal(entry.texture.mimeType, "image/png");
  const image = await sharp(sourceBytes).resize(...entry.texture.resolutionPx, { fit: entry.texture.fit, kernel: "lanczos3" })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: true, colours: 256, effort: 10 })
    .toBuffer();
  assert.equal(sha256(image), entry.texture.derivedSha256, `${preset.name} derived texture drift`);
  const texture = doc.createTexture(`${preset.name}_Texture`).setImage(image).setMimeType(entry.texture.mimeType)
    .setExtras({ canonicalSourceSha256: entry.sha256, derivedRasterSha256: sha256(image) });
  const material = doc.createMaterial(preset.name).setBaseColorTexture(texture).setBaseColorFactor(preset.baseColor)
    .setMetallicFactor(preset.metallic).setRoughnessFactor(preset.roughness);
  return { material, sourceBytes, image };
};

const primitiveFor = (doc, buffer, name, geometry, material) => doc.createPrimitive()
  .setAttribute("POSITION", doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer))
  .setAttribute("NORMAL", doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer))
  .setAttribute("TEXCOORD_0", doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(geometry.uvs)).setBuffer(buffer))
  .setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint16Array(geometry.indices)).setBuffer(buffer))
  .setMaterial(material);

const addSheet = async (doc, assembly, buffer, source, { key, name, x, paperMaterial, artworkMaterial }) => {
  const [widthMm, heightMm, thicknessMm] = source.dimensionsMm.sheet;
  const geometry = bowedSheet({ width: mm(widthMm), height: mm(heightMm), thickness: mm(thicknessMm), bow: mm(source.dimensionsMm.bow), segments: source.geometry.segmentsPerSheet });
  const textured = await textureMaterial(doc, source.identity[key], artworkMaterial);
  const mesh = doc.createMesh(`${name}_Mesh`)
    .addPrimitive(primitiveFor(doc, buffer, `${name}_Paper`, geometry.paper, paperMaterial))
    .addPrimitive(primitiveFor(doc, buffer, `${name}_Artwork`, geometry.art, textured.material));
  const node = doc.createNode(name).setMesh(mesh).setTranslation([mm(x), 0, mm(-source.dimensionsMm.bow / 2)])
    .setExtras({ artworkRole: key, nominalDimensionsMm: source.dimensionsMm.sheet, bowMm: source.dimensionsMm.bow });
  assembly.addChild(node);
  return { node, sourceBytes: textured.sourceBytes, raster: textured.image };
};

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((result, mesh) => {
  for (const primitive of mesh.listPrimitives()) { result.triangles += primitive.getIndices().getCount() / 3; result.drawCalls += 1; }
  return result;
}, { triangles: 0, drawCalls: 0 });

const inventoryFor = (doc, declared) => {
  const nodes = doc.getRoot().listNodes().map((node) => node.getName());
  const meshes = doc.getRoot().listMeshes().map((mesh) => mesh.getName());
  const primitives = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial().getName();
      const entry = declared.primitives.find((candidate) => candidate.node === node.getName() && candidate.material === material);
      assert.ok(entry, `undeclared PRINT primitive ${node.getName()} / ${material}`);
      primitives.push(entry);
    }
  }
  return { nodes, meshes, primitives };
};

const buildArtifact = async () => {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const posterBytes = await readFile(path.join(siteRoot, source.poster.path));
  assert.equal(sha256(posterBytes), source.poster.sha256, "PRINT poster reference drift");
  const doc = new Document();
  const scene = doc.createScene(source.geometry.scene);
  doc.getRoot().setDefaultScene(scene);
  const buffer = doc.createBuffer("Print_001_Buffer");
  const assembly = doc.createNode(source.geometry.nodes[0]).setExtras({ gapMm: source.dimensionsMm.gap, groundY: 0 });
  scene.addChild(assembly);
  const bonePaper = materialFor(doc, source.materials.bonePaper);
  const voidPaper = materialFor(doc, source.materials.voidPaper);
  const sheetCentreMm = (source.dimensionsMm.sheet[0] + source.dimensionsMm.gap) / 2;
  const left = await addSheet(doc, assembly, buffer, source, { key: "boneLeft", name: source.geometry.nodes[1], x: -sheetCentreMm, paperMaterial: bonePaper, artworkMaterial: source.materials.boneArtwork });
  const right = await addSheet(doc, assembly, buffer, source, { key: "voidRight", name: source.geometry.nodes[2], x: sheetCentreMm, paperMaterial: voidPaper, artworkMaterial: source.materials.voidArtwork });
  const io = new NodeIO();
  const unoptimizedBytes = Buffer.from(await io.writeBinary(doc));
  const unoptimized = await io.readBinary(unoptimizedBytes);
  const unoptimizedInspection = inspect(unoptimized);
  const unoptimizedMetrics = metricsFor(unoptimized);
  await doc.transform(dedup(), prune({ keepExtras: true }));
  const bytes = Buffer.from(await io.writeBinary(doc));
  const reopened = await io.readBinary(bytes);
  const optimizedInspection = inspect(reopened);
  const bounds = getBounds(reopened.getRoot().getDefaultScene());
  const nodeBounds = Object.fromEntries(reopened.getRoot().listNodes().filter((node) => /^Print_001_(Bone|Void)_/.test(node.getName())).map((node) => [node.getName(), getBounds(node)]));
  const metrics = metricsFor(reopened);
  const actualInventory = inventoryFor(reopened, source.geometry);
  assert.deepEqual(actualInventory.nodes, source.geometry.nodes, "PRINT node inventory drift");
  assert.deepEqual(actualInventory.meshes, source.geometry.meshes, "PRINT mesh inventory drift");
  assert.deepEqual(actualInventory.primitives, source.geometry.primitives, "PRINT primitive inventory drift");
  assert.equal(reopened.getRoot().listAnimations().length, source.geometry.animations, "PRINT animation inventory drift");
  const validation = await validateBytes(new Uint8Array(bytes), { uri: "print-001.glb", format: "glb", writeTimestamp: false, maxIssues: 100 });
  const validationSummary = { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, hints: validation.issues.numHints };
  assert.equal(validationSummary.errors, 0); assert.equal(validationSummary.warnings, 0);
  assert.ok(bytes.byteLength <= source.budgets.maxBytes); assert.ok(metrics.triangles <= source.budgets.maxTriangles); assert.ok(metrics.drawCalls <= source.budgets.maxDrawCalls);
  const toMm = (values) => values.map((value) => value * 1000);
  return {
    bytes,
    validation,
    inspections: {
      schemaVersion: 1,
      assetKey: source.assetKey,
      unoptimized: unoptimizedInspection,
      optimized: optimizedInspection
    },
    report: {
      schemaVersion: 1,
      assetKey: source.assetKey,
      sourceIntegrity: {
        boneLeft: { path: source.identity.boneLeft.path, canonicalPath: source.identity.boneLeft.canonicalPath, sha256: sha256(left.sourceBytes), bytes: left.sourceBytes.byteLength, resolutionPx: source.identity.boneLeft.resolutionPx, colourSpace: source.identity.boneLeft.colourSpace, derivedRasterSha256: sha256(left.raster) },
        voidRight: { path: source.identity.voidRight.path, canonicalPath: source.identity.voidRight.canonicalPath, sha256: sha256(right.sourceBytes), bytes: right.sourceBytes.byteLength, resolutionPx: source.identity.voidRight.resolutionPx, colourSpace: source.identity.voidRight.colourSpace, derivedRasterSha256: sha256(right.raster) }
      },
      governedBuildRecord: {
        productId: source.productId,
        dimensionAuthority: source.dimensionAuthority,
        geometry: { declared: source.geometry, actual: actualInventory },
        materials: source.materials,
        textures: Object.fromEntries(Object.entries(source.identity).map(([key, entry]) => [key, {
          sourcePath: entry.path,
          canonicalPath: entry.canonicalPath,
          sourceSha256: entry.sha256,
          sourceResolutionPx: entry.resolutionPx,
          colourSpace: entry.colourSpace,
          derivation: entry.texture,
          registration: entry.registration
        }])),
        camera: source.camera,
        poster: source.poster,
        inspections: {
          unoptimized: { stage: source.inspectionPolicy.unoptimized.stage, reportPath: `${source.inspectionPolicy.reportPath}#/unoptimized`, ...unoptimizedMetrics },
          optimized: { stage: source.inspectionPolicy.optimized.stage, reportPath: `${source.inspectionPolicy.reportPath}#/optimized`, ...metrics, bytes: bytes.byteLength }
        }
      },
      physicalEvidence: { method: "reopened-glb-bounds-and-node-registration", boundsMm: { min: toMm(bounds.min), max: toMm(bounds.max) }, nodeBoundsMm: Object.fromEntries(Object.entries(nodeBounds).map(([key, value]) => [key, { min: toMm(value.min), max: toMm(value.max) }])), sheetMm: source.dimensionsMm.sheet, gapMm: source.dimensionsMm.gap, bowMm: source.dimensionsMm.bow, leftArtwork: "boneLeft", rightArtwork: "voidRight" },
      excludedPresentation: ["frames", "tape", "shadows"],
      cameraRecommendations: source.camera,
      validation: validationSummary,
      budget: { ...metrics, bytes: bytes.byteLength, ceilings: source.budgets },
      output: { path: "assets/merch-3d/print-001.glb", sha256: sha256(bytes) },
      deterministic: { verifiedBySecondInMemoryBuild: false }
    }
  };
};

const main = async () => {
  const artifact = await buildArtifact();
  const second = await buildArtifact();
  assert.equal(sha256(artifact.bytes), sha256(second.bytes), "PRINT build is not byte-deterministic");
  artifact.report.deterministic.verifiedBySecondInMemoryBuild = true;
  if (verifyOnly) {
    const [existingBytes, existingReport, existingValidator, existingInspections] = await Promise.all([
      readFile(outputPath),
      readFile(reportPath, "utf8").then(JSON.parse),
      readFile(validatorPath, "utf8").then(JSON.parse),
      readFile(inspectPath, "utf8").then(JSON.parse)
    ]);
    assert.equal(sha256(existingBytes), sha256(artifact.bytes), "checked-in PRINT GLB is stale");
    assert.deepEqual(existingReport, artifact.report, "checked-in PRINT report is stale");
    assert.deepEqual(existingValidator, artifact.validation, "checked-in PRINT validator report is stale");
    assert.deepEqual(existingInspections, artifact.inspections, "checked-in PRINT inspection report is stale");
    assert.equal((await stat(outputPath)).size, artifact.report.budget.bytes);
    process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
    return;
  }
  await Promise.all([
    writeFile(outputPath, artifact.bytes),
    writeFile(reportPath, stableJson(artifact.report)),
    writeFile(validatorPath, stableJson(artifact.validation)),
    writeFile(inspectPath, stableJson(artifact.inspections))
  ]);
  process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};

await main();
