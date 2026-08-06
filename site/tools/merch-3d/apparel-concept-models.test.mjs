import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import sharp from "sharp";

const execFile = promisify(execFileCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const records = [
  {
    assetKey: "t-shirt-001",
    productId: "MRCH-005",
    requiredNodes: ["T_Shirt_Relaxed_Body", "T_Shirt_Sleeve_Left", "T_Shirt_Sleeve_Right", "T_Shirt_Collar", "T_Shirt_Front_Artwork"],
    artworkNode: "T_Shirt_Front_Artwork",
    artworkSurfaceMm: [300, 112.5],
    minimumBoundsMm: [800, 1000, 60]
  },
  {
    assetKey: "hoodie-001",
    productId: "MRCH-006",
    requiredNodes: ["Hoodie_Body", "Hoodie_Sleeve_Left", "Hoodie_Sleeve_Right", "Hoodie_Rib_Hem", "Hoodie_Cuff_Left", "Hoodie_Cuff_Right", "Hoodie_Dimensional_Hood", "Hoodie_Hood_Centre_Seam", "Hoodie_Back_Artwork"],
    artworkNode: "Hoodie_Back_Artwork",
    artworkSurfaceMm: [300, 112.5],
    minimumBoundsMm: [850, 1100, 100]
  },
  {
    assetKey: "cap-001",
    productId: "MRCH-007",
    requiredNodes: ["Cap_Panel_01", "Cap_Panel_02", "Cap_Panel_03", "Cap_Panel_04", "Cap_Panel_05", "Cap_Panel_06", "Cap_Curved_Brim", "Cap_Top_Button", "Cap_Rear_Opening", "Cap_Adjustment_Strap", "Cap_Front_Patch", "Cap_Patch_Mark"],
    artworkNode: "Cap_Patch_Mark",
    artworkSurfaceMm: [20, 20],
    minimumBoundsMm: [220, 250, 300]
  }
];

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((result, mesh) => {
  for (const primitive of mesh.listPrimitives()) {
    result.triangles += primitive.getIndices().getCount() / 3;
    result.drawCalls += 1;
  }
  return result;
}, { triangles: 0, drawCalls: 0 });

const distinctAxisValues = (node, axis) => {
  const positions = node.getMesh().listPrimitives()[0].getAttribute("POSITION").getArray();
  const values = new Set();
  for (let index = axis; index < positions.length; index += 3) values.add(positions[index].toFixed(4));
  return values.size;
};

const triangleCount = (node) => node.getMesh().listPrimitives().reduce((total, primitive) => total + primitive.getIndices().getCount() / 3, 0);

const faceNormalAgreement = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const positions = primitive.getAttribute("POSITION").getArray();
  const normals = primitive.getAttribute("NORMAL").getArray();
  const indices = primitive.getIndices().getArray();
  let disagreeing = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const averageNormal = [
      normals[a] + normals[b] + normals[c],
      normals[a + 1] + normals[b + 1] + normals[c + 1],
      normals[a + 2] + normals[b + 2] + normals[c + 2]
    ];
    if (face[0] * averageNormal[0] + face[1] * averageNormal[1] + face[2] * averageNormal[2] <= 0) disagreeing += 1;
  }
  return disagreeing;
};

for (const record of records) {
  test(`${record.assetKey} is a deterministic validator-clean volumetric concept model`, async () => {
    const [source, bytes, report, validator] = await Promise.all([
      readJson(path.join(here, `${record.assetKey}.source.json`)),
      readFile(path.join(siteRoot, `assets/merch-3d/${record.assetKey}.glb`)),
      readJson(path.join(here, `reports/${record.assetKey}.report.json`)),
      readJson(path.join(here, `reports/${record.assetKey}.validator.json`))
    ]);
    const doc = await new NodeIO().readBinary(bytes);
    const scene = doc.getRoot().getDefaultScene();
    const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
    const bounds = getBounds(scene);
    const sizeMm = bounds.min.map((value, axis) => Number(((bounds.max[axis] - value) * 1000).toFixed(3)));
    const metrics = metricsFor(doc);
    const validation = await validateBytes(new Uint8Array(bytes), { uri: `${record.assetKey}.glb`, format: "glb", writeTimestamp: false, maxIssues: 100 });

    assert.equal(source.assetKey, record.assetKey);
    assert.equal(source.productId, record.productId);
    assert.deepEqual(source.geometry.requiredNodes, record.requiredNodes);
    for (const name of record.requiredNodes) assert.ok(nodes.get(name)?.getMesh(), `${name} must have volumetric/readable geometry`);
    assert.deepEqual(nodes.get(record.artworkNode).getExtras().surfaceMm, record.artworkSurfaceMm);
    assert.deepEqual(source.artwork.registration.surfaceMm, record.artworkSurfaceMm);
    assert.equal(source.artwork.registration.sourceUse, "full-image-no-crop-no-redraw");
    const artworkBytes = await readFile(path.join(here, source.artwork.path));
    assert.equal(sha256(artworkBytes), source.artwork.sha256);
    const artworkPixels = await sharp(artworkBytes).ensureAlpha().raw().toBuffer();
    assert.ok(Array.from(artworkPixels).filter((_, index) => index % 4 === 3).some((alpha) => alpha < 255), `${record.assetKey} exact art must preserve transparency`);
    assert.ok(doc.getRoot().listTextures().some((texture) => texture.getExtras().canonicalSourceSha256 === source.artwork.sha256));
    const artworkMaterial = nodes.get(record.artworkNode).getMesh().listPrimitives()[0].getMaterial();
    assert.equal(artworkMaterial.getAlphaMode(), "BLEND", `${record.assetKey} artwork must composite without an opaque texture card`);
    if (record.assetKey !== "cap-001") assert.ok(distinctAxisValues(nodes.get(record.artworkNode), 2) >= 5, `${record.assetKey} artwork must conform to a curved surface`);
    sizeMm.forEach((value, axis) => assert.ok(value >= record.minimumBoundsMm[axis], `${record.assetKey} axis ${axis} is not meaningfully volumetric: ${value} mm`));
    sizeMm.forEach((value, axis) => {
      const envelope = source.dimensions.viewerEnvelopeMm[axis];
      assert.ok(envelope >= value, `${record.assetKey} viewer envelope axis ${axis} must contain the reopened GLB bounds`);
      assert.ok(envelope - value <= 20, `${record.assetKey} viewer envelope axis ${axis} must describe the GLB rather than a production-size claim`);
    });
    assert.ok(Math.abs(bounds.min[1]) < 1e-6, `${record.assetKey} must be grounded`);
    assert.deepEqual(scene.getExtras().truthBoundary, source.truthBoundary);
    assert.equal(source.truthBoundary.status, "concept-visualization");
    assert.equal(source.truthBoundary.manufacturingReference, false);
    assert.equal(source.truthBoundary.productionDimensionsClaim, false);
    assert.equal(doc.getRoot().listAnimations().length, 0);
    assert.equal(doc.getRoot().listExtensionsUsed().length, 0);
    assert.equal(validation.issues.numErrors, 0);
    assert.equal(validation.issues.numWarnings, 0);
    assert.equal(validator.issues.numErrors, 0);
    assert.equal(validator.issues.numWarnings, 0);
    assert.deepEqual(report.validation, { errors: 0, warnings: 0, infos: validation.issues.numInfos, hints: validation.issues.numHints });
    assert.deepEqual(report.budget, { ...metrics, bytes: bytes.byteLength, ceilings: source.budgets });
    assert.equal(report.output.sha256, sha256(bytes));
    assert.equal(report.deterministic.verifiedBySecondInMemoryBuild, true);
    assert.ok(bytes.byteLength <= source.budgets.maxBytes);
    assert.ok(metrics.triangles <= source.budgets.maxTriangles);
    assert.ok(metrics.drawCalls <= source.budgets.maxDrawCalls);

    if (record.assetKey === "t-shirt-001") {
      assert.ok(distinctAxisValues(nodes.get("T_Shirt_Relaxed_Body"), 2) >= 12, "t-shirt torso must have a rounded front/back volume");
      assert.ok(distinctAxisValues(nodes.get("T_Shirt_Sleeve_Left"), 2) >= 8, "t-shirt sleeve must have a rounded volume");
      assert.ok(triangleCount(nodes.get("T_Shirt_Sleeve_Left")) >= 600, "t-shirt sleeve path must have enough sections for a smooth shoulder transition");
      assert.equal(nodes.get("T_Shirt_Sleeve_Left").getExtras().shoulderJoin, "uncapped-body-overlap");
      for (const name of ["T_Shirt_Relaxed_Body", "T_Shirt_Sleeve_Left", "T_Shirt_Sleeve_Right"]) assert.equal(faceNormalAgreement(nodes.get(name)), 0, `${name} winding must agree with its vertex normals`);
    }
    if (record.assetKey === "hoodie-001") {
      assert.ok(distinctAxisValues(nodes.get("Hoodie_Body"), 2) >= 12, "hoodie torso must have a rounded front/back volume");
      assert.ok(distinctAxisValues(nodes.get("Hoodie_Sleeve_Left"), 2) >= 8, "hoodie sleeve must have a rounded volume");
      assert.ok(distinctAxisValues(nodes.get("Hoodie_Dimensional_Hood"), 2) >= 12, "hood must be dimensional rather than an extruded silhouette");
      assert.ok(distinctAxisValues(nodes.get("Hoodie_Dimensional_Hood"), 1) >= 8, "hood profile must have enough vertical sections for a smooth silhouette");
      assert.ok(distinctAxisValues(nodes.get("Hoodie_Rib_Hem"), 2) >= 12, "hoodie hem must wrap the rounded body");
      assert.ok(distinctAxisValues(nodes.get("Hoodie_Cuff_Left"), 2) >= 8, "hoodie cuff must wrap the rounded sleeve");
      assert.ok(triangleCount(nodes.get("Hoodie_Sleeve_Left")) >= 800, "hoodie sleeve path must have enough sections for a smooth shoulder transition");
      assert.equal(nodes.get("Hoodie_Sleeve_Left").getExtras().shoulderJoin, "uncapped-body-overlap");
      const hoodBounds = getBounds(nodes.get("Hoodie_Dimensional_Hood"));
      assert.ok((hoodBounds.max[0] - hoodBounds.min[0]) / (hoodBounds.max[1] - hoodBounds.min[1]) >= 1.55, "hood silhouette must read as a draped hood rather than a sphere");
      for (const name of ["Hoodie_Body", "Hoodie_Sleeve_Left", "Hoodie_Sleeve_Right", "Hoodie_Dimensional_Hood"]) assert.equal(faceNormalAgreement(nodes.get(name)), 0, `${name} winding must agree with its vertex normals`);
    }
    if (record.assetKey === "cap-001") {
      assert.equal(faceNormalAgreement(nodes.get("Cap_Curved_Brim")), 0, "cap brim winding must agree with its vertex normals");
      assert.equal(faceNormalAgreement(nodes.get("Cap_Top_Button")), 0, "cap button winding must agree with its vertex normals");
      assert.ok(distinctAxisValues(nodes.get("Cap_Panel_01"), 1) >= 9, "cap crown must have enough vertical sections for a smooth low-profile silhouette");
      assert.ok(metrics.triangles >= 2000, "cap crown and brim must have enough tessellation to avoid a faceted viewer silhouette");
      const buttonBounds = getBounds(nodes.get("Cap_Top_Button"));
      assert.ok(buttonBounds.max[0] - buttonBounds.min[0] <= 0.020, "cap button diameter must remain visually plausible");
      assert.ok(buttonBounds.max[1] - buttonBounds.min[1] <= 0.010, "cap button height must remain visually plausible");
      const patchBounds = getBounds(nodes.get("Cap_Front_Patch"));
      const markBounds = getBounds(nodes.get("Cap_Patch_Mark"));
      assert.ok(distinctAxisValues(nodes.get("Cap_Front_Patch"), 2) >= 5, "cap patch must conform to the crown instead of remaining a flat box");
      assert.ok(patchBounds.min[2] >= 0.112, "cap patch must stand proud of the crown instead of being occluded by it");
      assert.ok(markBounds.min[2] - patchBounds.max[2] >= 0.001, "cap mark must clear the patch surface without z-fighting");
    }

    const { stdout } = await execFile(process.execPath, [path.join(here, `build-${record.assetKey}.mjs`), "--verify"], { cwd: siteRoot });
    assert.match(stdout, /verified [a-f0-9]{64}/);
  });
}
