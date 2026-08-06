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
    requiredNodes: ["T_Shirt_Draped_Shell", "T_Shirt_Collar", "T_Shirt_Seam_Cues", "T_Shirt_Front_Artwork"],
    artworkNode: "T_Shirt_Front_Artwork",
    fabricMaterial: "MAT_T_SHIRT_BONE_FABRIC",
    artworkSurfaceMm: [300, 112.5],
    minimumBoundsMm: [800, 1000, 60]
  },
  {
    assetKey: "hoodie-001",
    productId: "MRCH-006",
    requiredNodes: ["Hoodie_Draped_Shell", "Hoodie_Integrated_Rib_Trim", "Hoodie_Open_Hood_Shell", "Hoodie_Hood_Centre_Seam", "Hoodie_Back_Artwork"],
    artworkNode: "Hoodie_Back_Artwork",
    fabricMaterial: "MAT_HOODIE_VOID_FABRIC",
    artworkSurfaceMm: [300, 112.5],
    minimumBoundsMm: [850, 1100, 100]
  },
  {
    assetKey: "cap-001",
    productId: "MRCH-007",
    requiredNodes: ["Cap_Panel_01", "Cap_Panel_02", "Cap_Panel_03", "Cap_Panel_04", "Cap_Panel_05", "Cap_Panel_06", "Cap_Curved_Brim", "Cap_Top_Button", "Cap_Rear_Aperture_Rim", "Cap_Adjustment_Strap", "Cap_Adjustment_Keeper", "Cap_Front_Patch", "Cap_Patch_Mark"],
    artworkNode: "Cap_Patch_Mark",
    fabricMaterial: "MAT_CAP_WASHED_VOID_TWILL",
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

const connectedTriangleComponents = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const indices = Array.from(primitive.getIndices().getArray());
  const positions = primitive.getAttribute("POSITION").getArray();
  const vertexTriangles = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    for (const vertex of indices.slice(offset, offset + 3)) {
      const base = vertex * 3;
      const key = `${positions[base].toFixed(6)}:${positions[base + 1].toFixed(6)}:${positions[base + 2].toFixed(6)}`;
      if (!vertexTriangles.has(key)) vertexTriangles.set(key, []);
      vertexTriangles.get(key).push(offset / 3);
    }
  }
  const unseen = new Set(Array.from({ length: indices.length / 3 }, (_, index) => index));
  let components = 0;
  while (unseen.size) {
    components += 1;
    const queue = [unseen.values().next().value];
    unseen.delete(queue[0]);
    while (queue.length) {
      const triangle = queue.pop();
      for (const vertex of indices.slice(triangle * 3, triangle * 3 + 3)) {
        const base = vertex * 3;
        const key = `${positions[base].toFixed(6)}:${positions[base + 1].toFixed(6)}:${positions[base + 2].toFixed(6)}`;
        for (const neighbour of vertexTriangles.get(key)) {
          if (unseen.delete(neighbour)) queue.push(neighbour);
        }
      }
    }
  }
  return components;
};

const boundaryEdgeCount = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const indices = primitive.getIndices().getArray();
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return Array.from(edges.values()).filter((uses) => uses === 1).length;
};

const crownTrianglesInRearAperture = (nodes) => {
  let intrusions = 0;
  for (const name of ["Cap_Panel_01", "Cap_Panel_02", "Cap_Panel_03", "Cap_Panel_04", "Cap_Panel_05", "Cap_Panel_06"]) {
    const primitive = nodes.get(name).getMesh().listPrimitives()[0];
    const positions = primitive.getAttribute("POSITION").getArray();
    const indices = primitive.getIndices().getArray();
    for (let offset = 0; offset < indices.length; offset += 3) {
      const centroid = [0, 0, 0];
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indices[offset + corner] * 3;
        centroid[0] += positions[vertex] / 3;
        centroid[1] += positions[vertex + 1] / 3;
        centroid[2] += positions[vertex + 2] / 3;
      }
      const ellipse = (centroid[0] / 0.052) ** 2 + ((centroid[1] - 0.115) / 0.042) ** 2;
      if (centroid[2] < -0.075 && ellipse < 1) intrusions += 1;
    }
  }
  return intrusions;
};

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
    const fabricMaterial = doc.getRoot().listMaterials().find((material) => material.getName() === record.fabricMaterial);
    assert.equal(fabricMaterial.getExtras().surfaceResponse, "deterministic-woven-normal-and-roughness");
    assert.ok(fabricMaterial.getNormalTexture(), `${record.assetKey} fabric must include deterministic cloth normal response`);
    assert.ok(fabricMaterial.getMetallicRoughnessTexture(), `${record.assetKey} fabric must include deterministic roughness variation`);
    assert.ok(fabricMaterial.getNormalScale() <= 0.03, `${record.assetKey} cloth normal must remain subtle at full-garment framing`);
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
      const shell = nodes.get("T_Shirt_Draped_Shell");
      const shellBounds = getBounds(shell);
      assert.equal(connectedTriangleComponents(shell), 1, "t-shirt body, shoulders and sleeves must be one connected shell");
      assert.ok(distinctAxisValues(shell, 2) >= 8, "t-shirt shell must carry shaped cloth depth");
      assert.ok((shellBounds.max[2] - shellBounds.min[2]) / (shellBounds.max[0] - shellBounds.min[0]) < 0.15, "t-shirt must read as flattened hanging cloth rather than assembled tubes");
      assert.equal(shell.getExtras().construction, "unified-draped-front-back-shell");
      assert.equal(faceNormalAgreement(shell), 0, "t-shirt shell winding must agree with its vertex normals");
    }
    if (record.assetKey === "hoodie-001") {
      const shell = nodes.get("Hoodie_Draped_Shell");
      const hood = nodes.get("Hoodie_Open_Hood_Shell");
      assert.equal(connectedTriangleComponents(shell), 1, "hoodie body, shoulders and sleeves must be one connected shell");
      assert.equal(shell.getExtras().construction, "unified-draped-front-back-shell");
      assert.ok(boundaryEdgeCount(hood) >= 24, "hood must preserve a real open face cavity");
      assert.equal(hood.getExtras().opening, "unfilled-face-cavity");
      assert.equal(connectedTriangleComponents(hood), 1, "hood back, side walls and opening rim must remain attached");
      const hoodBounds = getBounds(hood);
      const hoodAspect = (hoodBounds.max[0] - hoodBounds.min[0]) / (hoodBounds.max[1] - hoodBounds.min[1]);
      assert.ok(hoodAspect >= 1.25 && hoodAspect <= 1.45, "hood silhouette must be taller and garment-like rather than a horizontal halo or sphere");
      assert.ok(hoodBounds.min[1] <= 0.98, "hood must drape into and overlap the body neckline rather than float above it");
      for (const name of ["Hoodie_Draped_Shell", "Hoodie_Open_Hood_Shell"]) assert.equal(faceNormalAgreement(nodes.get(name)), 0, `${name} winding must agree with its vertex normals`);
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
      assert.equal(nodes.has("Cap_Rear_Opening"), false, "a filled dark rear-opening ellipse must never masquerade as topology");
      assert.equal(crownTrianglesInRearAperture(nodes), 0, "cap crown geometry must be removed inside the rear aperture");
      assert.equal(nodes.get("Cap_Rear_Aperture_Rim").getExtras().opening, "unfilled-through-aperture");
      const apertureBounds = getBounds(nodes.get("Cap_Rear_Aperture_Rim"));
      const strapBounds = getBounds(nodes.get("Cap_Adjustment_Strap"));
      assert.ok(strapBounds.min[0] <= apertureBounds.min[0] && strapBounds.max[0] >= apertureBounds.max[0], "adjustment strap must bridge the real crown aperture");
      assert.ok(strapBounds.max[1] <= 0.090, "single adjustment strap must remain in the aperture's lower third");
      const keeperBounds = getBounds(nodes.get("Cap_Adjustment_Keeper"));
      assert.ok(keeperBounds.max[0] - keeperBounds.min[0] <= 0.020, "adjustment keeper must remain a small hardware cue rather than a second strap");
    }

    const { stdout } = await execFile(process.execPath, [path.join(here, `build-${record.assetKey}.mjs`), "--verify"], { cwd: siteRoot });
    assert.match(stdout, /verified [a-f0-9]{64}/);
  });
}
