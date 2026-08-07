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
const builderSource = await readFile(path.join(here, "lib/apparel-concept-builder.mjs"), "utf8");
const records = [
  {
    assetKey: "t-shirt-001",
    productId: "MRCH-005",
    requiredNodes: ["T_Shirt_Draped_Shell", "T_Shirt_Collar", "T_Shirt_Collar_Interior", "T_Shirt_Sleeve_Hems", "T_Shirt_Curved_Hem", "T_Shirt_Front_Artwork"],
    artworkNode: "T_Shirt_Front_Artwork",
    fabricMaterial: "MAT_T_SHIRT_BONE_FABRIC",
    artworkSurfaceMm: [300, 112.5],
    minimumBoundsMm: [800, 1000, 110],
    minimumFabricRgb: 0.70,
    fabricDoubleSided: true
  },
  {
    assetKey: "hoodie-001",
    productId: "MRCH-006",
    requiredNodes: ["Hoodie_Draped_Shell", "Hoodie_Shaped_Cuffs", "Hoodie_Waistband", "Hoodie_Open_Hood_Shell", "Hoodie_Hood_Interior_Cavity", "Hoodie_Hood_Centre_Seam", "Hoodie_Back_Artwork"],
    artworkNode: "Hoodie_Back_Artwork",
    fabricMaterial: "MAT_HOODIE_VOID_FABRIC",
    artworkSurfaceMm: [300, 112.5],
    minimumBoundsMm: [850, 1050, 140],
    minimumFabricRgb: 0.018,
    fabricDoubleSided: true
  },
  {
    assetKey: "cap-001",
    productId: "MRCH-007",
    requiredNodes: ["Cap_Panel_01", "Cap_Panel_02", "Cap_Panel_03", "Cap_Panel_04", "Cap_Panel_05", "Cap_Panel_06", "Cap_Crown_Seams", "Cap_Crown_Creases", "Cap_Eyelets", "Cap_Curved_Brim", "Cap_Bill_Edge_Stitching", "Cap_Crown_Bill_Transition", "Cap_Top_Button", "Cap_Rear_Aperture_Rim", "Cap_Adjustment_Strap", "Cap_Adjustment_Keeper", "Cap_Front_Patch", "Cap_Patch_Border", "Cap_Patch_Mark"],
    artworkNode: "Cap_Patch_Mark",
    fabricMaterial: "MAT_CAP_WASHED_VOID_TWILL",
    artworkSurfaceMm: [20, 20],
    minimumBoundsMm: [220, 250, 300],
    minimumFabricRgb: 0.020,
    fabricDoubleSided: false
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

const indexedTriangleComponents = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const indices = Array.from(primitive.getIndices().getArray());
  const vertexTriangles = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    for (const vertex of indices.slice(offset, offset + 3)) {
      if (!vertexTriangles.has(vertex)) vertexTriangles.set(vertex, []);
      vertexTriangles.get(vertex).push(offset / 3);
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
        for (const neighbour of vertexTriangles.get(vertex)) {
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

const boundaryEdgesInArmholes = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const positions = primitive.getAttribute("POSITION").getArray();
  const indices = primitive.getIndices().getArray();
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, { a, b, uses: (edges.get(key)?.uses || 0) + 1 });
    }
  }
  return Array.from(edges.values()).filter(({ a, b, uses }) => {
    if (uses !== 1) return false;
    const midpoint = [0, 1, 2].map((axis) => (positions[a * 3 + axis] + positions[b * 3 + axis]) / 2);
    return Math.abs(midpoint[0]) >= 0.20 && Math.abs(midpoint[0]) <= 0.46 && midpoint[1] >= 0.73 && midpoint[1] <= 1.035;
  }).length;
};

const sharedPositionCount = (firstNode, secondNode) => {
  const keys = (node) => {
    const positions = node.getMesh().listPrimitives()[0].getAttribute("POSITION").getArray();
    const result = new Set();
    for (let offset = 0; offset < positions.length; offset += 3) {
      result.add(`${positions[offset].toFixed(6)}:${positions[offset + 1].toFixed(6)}:${positions[offset + 2].toFixed(6)}`);
    }
    return result;
  };
  const first = keys(firstNode);
  return Array.from(keys(secondNode)).filter((key) => first.has(key)).length;
};

const minimumShoulderNormalDot = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const positions = primitive.getAttribute("POSITION").getArray();
  const normals = primitive.getAttribute("NORMAL").getArray();
  const indices = primitive.getIndices().getArray();
  let minimum = 1;
  let inspected = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const midpointX = (positions[a * 3] + positions[b * 3]) / 2;
      const midpointY = (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2;
      if (Math.abs(midpointX) < 0.20 || midpointY < 0.72 || midpointY > 1.04) continue;
      const dot = normals[a * 3] * normals[b * 3]
        + normals[a * 3 + 1] * normals[b * 3 + 1]
        + normals[a * 3 + 2] * normals[b * 3 + 2];
      minimum = Math.min(minimum, dot);
      inspected += 1;
    }
  }
  assert.ok(inspected >= 100, "shoulder continuity test must inspect a substantial stitched region");
  return minimum;
};

const maximumGlobalUvDeviation = (node) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const positions = primitive.getAttribute("POSITION").getArray();
  const uvs = primitive.getAttribute("TEXCOORD_0").getArray();
  const mapping = node.getExtras().garmentUvMapping;
  assert.equal(mapping?.type, "global-xy-projection");
  const [minX, minY, maxX, maxY] = mapping.boundsM;
  let maximum = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const expectedU = (positions[vertex * 3] - minX) / (maxX - minX);
    const expectedV = (positions[vertex * 3 + 1] - minY) / (maxY - minY);
    maximum = Math.max(maximum, Math.abs(uvs[vertex * 2] - expectedU), Math.abs(uvs[vertex * 2 + 1] - expectedV));
  }
  return maximum;
};

const maximumRearNecklineY = (node) => {
  const positions = node.getMesh().listPrimitives()[0].getAttribute("POSITION").getArray();
  let maximum = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const [x, y, z] = positions.slice(offset, offset + 3);
    if (Math.abs(x) <= 0.15 && z <= -0.045 && y >= 0.90) maximum = Math.max(maximum, y);
  }
  return maximum;
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

const rearFacingDetailTrianglesInAperture = (nodes, names) => {
  let intrusions = 0;
  for (const name of names) {
    const primitive = nodes.get(name).getMesh().listPrimitives()[0];
    const positions = primitive.getAttribute("POSITION").getArray();
    const indices = primitive.getIndices().getArray();
    for (let offset = 0; offset < indices.length; offset += 3) {
      const points = [0, 1, 2].map((corner) => {
        const vertex = indices[offset + corner] * 3;
        return [positions[vertex], positions[vertex + 1], positions[vertex + 2]];
      });
      const centroid = points.reduce((result, point) => result.map((value, axis) => value + point[axis] / 3), [0, 0, 0]);
      const ab = points[1].map((value, axis) => value - points[0][axis]);
      const ac = points[2].map((value, axis) => value - points[0][axis]);
      const faceZ = ab[0] * ac[1] - ab[1] * ac[0];
      const inOpening = (centroid[0] / 0.057) ** 2 + ((centroid[1] - 0.115) / 0.049) ** 2 < 1;
      if (centroid[2] > -0.060 && inOpening && faceZ < -1e-8) intrusions += 1;
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

const projectedFrontCoverage = (node, samples) => {
  const primitive = node.getMesh().listPrimitives()[0];
  const positions = primitive.getAttribute("POSITION").getArray();
  const indices = primitive.getIndices().getArray();
  const insideTriangle = ([x, y], triangle) => {
    const [[x1, y1], [x2, y2], [x3, y3]] = triangle;
    const denominator = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(denominator) < 1e-9) return false;
    const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denominator;
    const b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denominator;
    const c = 1 - a - b;
    return a >= -0.001 && b >= -0.001 && c >= -0.001;
  };
  return samples.map((sample) => {
    for (let offset = 0; offset < indices.length; offset += 3) {
      const triangle = [0, 1, 2].map((corner) => {
        const vertex = indices[offset + corner] * 3;
        return [positions[vertex], positions[vertex + 1]];
      });
      if (insideTriangle(sample, triangle)) return true;
    }
    return false;
  });
};

const minimumProjectedClearance = (surfaceNode, garmentNode, side = "front") => {
  const surfacePositions = surfaceNode.getMesh().listPrimitives()[0].getAttribute("POSITION").getArray();
  const garmentPrimitive = garmentNode.getMesh().listPrimitives()[0];
  const garmentPositions = garmentPrimitive.getAttribute("POSITION").getArray();
  const garmentIndices = garmentPrimitive.getIndices().getArray();
  let minimum = Infinity;
  for (let surfaceOffset = 0; surfaceOffset < surfacePositions.length; surfaceOffset += 3) {
    const point = [surfacePositions[surfaceOffset], surfacePositions[surfaceOffset + 1], surfacePositions[surfaceOffset + 2]];
    const projectedDepths = [];
    for (let indexOffset = 0; indexOffset < garmentIndices.length; indexOffset += 3) {
      const triangle = [0, 1, 2].map((corner) => {
        const vertex = garmentIndices[indexOffset + corner] * 3;
        return [garmentPositions[vertex], garmentPositions[vertex + 1], garmentPositions[vertex + 2]];
      });
      const [[x1, y1], [x2, y2], [x3, y3]] = triangle;
      const denominator = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      if (Math.abs(denominator) < 1e-9) continue;
      const a = ((y2 - y3) * (point[0] - x3) + (x3 - x2) * (point[1] - y3)) / denominator;
      const b = ((y3 - y1) * (point[0] - x3) + (x1 - x3) * (point[1] - y3)) / denominator;
      const c = 1 - a - b;
      if (a < -0.0001 || b < -0.0001 || c < -0.0001) continue;
      projectedDepths.push(a * triangle[0][2] + b * triangle[1][2] + c * triangle[2][2]);
    }
    assert.ok(projectedDepths.length, "artwork vertex must project onto the garment shell");
    const garmentDepth = side === "front" ? Math.max(...projectedDepths) : Math.min(...projectedDepths);
    const clearance = side === "front" ? point[2] - garmentDepth : garmentDepth - point[2];
    minimum = Math.min(minimum, clearance);
  }
  return minimum;
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
    const artworkUvs = Array.from(nodes.get(record.artworkNode).getMesh().listPrimitives()[0].getAttribute("TEXCOORD_0").getArray());
    const uValues = artworkUvs.filter((_, index) => index % 2 === 0);
    const vValues = artworkUvs.filter((_, index) => index % 2 === 1);
    assert.equal(artworkMaterial.getAlphaMode(), "BLEND", `${record.assetKey} artwork must composite without an opaque texture card`);
    assert.deepEqual([Math.min(...uValues), Math.max(...uValues), Math.min(...vValues), Math.max(...vValues)], [0, 1, 0, 1], `${record.assetKey} artwork surface must map the complete approved source bbox without cropping`);
    assert.ok(nodes.get(record.artworkNode).getExtras().normalOffsetMm >= 4, `${record.assetKey} artwork must clear the garment consistently along surface normals`);
    const fabricMaterial = doc.getRoot().listMaterials().find((material) => material.getName() === record.fabricMaterial);
    assert.equal(fabricMaterial.getExtras().surfaceResponse, "deterministic-woven-normal-and-roughness");
    assert.ok(fabricMaterial.getNormalTexture(), `${record.assetKey} fabric must include deterministic cloth normal response`);
    assert.ok(fabricMaterial.getMetallicRoughnessTexture(), `${record.assetKey} fabric must include deterministic roughness variation`);
    assert.ok(fabricMaterial.getNormalScale() <= 0.03, `${record.assetKey} cloth normal must remain subtle at full-garment framing`);
    assert.equal(fabricMaterial.getDoubleSided(), record.fabricDoubleSided, `${record.assetKey} cloth sidedness must preserve garment interiors without filling the cap aperture`);
    assert.ok(fabricMaterial.getBaseColorFactor().slice(0, 3).every((value) => value >= record.minimumFabricRgb), `${record.assetKey} fabric must retain readable dark-on-dark tonal separation`);
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
      for (const attribute of ["NORMAL", "TANGENT"]) {
        const values = shell.getMesh().listPrimitives()[0].getAttribute(attribute).getArray();
        assert.equal(Array.from(values).filter((value) => value !== 0 && Math.abs(value) < 1e-12).length, 0, `t-shirt ${attribute} must canonicalize platform-dependent near-zero components`);
      }
      assert.equal(connectedTriangleComponents(shell), 1, "t-shirt body, shoulders and sleeves must be one connected shell");
      assert.ok(distinctAxisValues(shell, 2) >= 8, "t-shirt shell must carry shaped cloth depth");
      const depthRatio = (shellBounds.max[2] - shellBounds.min[2]) / (shellBounds.max[0] - shellBounds.min[0]);
      assert.ok(depthRatio >= 0.11 && depthRatio <= 0.20, "t-shirt must carry relaxed torso and sleeve depth without becoming a rigid tube");
      assert.equal(shell.getExtras().construction, "tailored-torso-attached-sleeves");
      assert.ok(shell.getExtras().shoulderDropM >= 0.06, "t-shirt must preserve a natural oversized shoulder drop");
      assert.doesNotMatch(builderSource, /shoulderBridge/, "standalone shoulder repair patches must not exist in the builder");
      assert.equal(shell.getExtras().sleeveAttachment, "shared-armhole-rings");
      assert.equal(shell.getExtras().armholeCoverage, "torso-holes-stitched-to-matching-sleeve-root-rings");
      assert.equal(shell.getExtras().sleeveRootCaps, 0);
      assert.equal(shell.getExtras().armholeRingVertexCount, 28);
      assert.equal(shell.getExtras().stitchFacesPerSide, 28);
      assert.equal(indexedTriangleComponents(shell), 1, "t-shirt shell must share real indices across torso, stitch bands and sleeves");
      assert.equal(boundaryEdgesInArmholes(shell), 0, "t-shirt armhole loops must be fully stitched without open repair gaps");
      assert.ok(minimumShoulderNormalDot(shell) >= 0.70, "t-shirt shoulder normals must transition smoothly across the armhole seam");
      assert.ok(maximumGlobalUvDeviation(shell) <= 1e-6, "t-shirt torso and sleeves must use one documented garment-space UV projection");
      assert.ok(projectedFrontCoverage(shell, [[0.275, 0.970], [0.305, 0.958], [0.345, 0.945], [-0.275, 0.970], [-0.305, 0.958], [-0.345, 0.945]]).every(Boolean), "t-shirt front shoulder projection must not expose triangular armhole gaps");
      assert.ok(triangleCount(shell) >= 1200, "t-shirt tailored shell must have enough sections for shaped torso and sleeve transitions");
      assert.equal(nodes.get("T_Shirt_Collar").getExtras().opening, "unfilled-neckline");
      assert.ok(nodes.get("T_Shirt_Collar").getExtras().frontDropM >= 0.03, "t-shirt collar must expose a readable dropped front opening");
      assert.ok(nodes.get("T_Shirt_Collar").getExtras().innerDepthM >= 0.045, "t-shirt collar cavity must not collapse to a flat lip");
      assert.equal(nodes.get("T_Shirt_Collar_Interior").getExtras().opening, "unfilled-dark-cavity");
      assert.equal(nodes.get("T_Shirt_Sleeve_Hems").getExtras().opening, "unfilled-cuff-rims");
      assert.equal(nodes.get("T_Shirt_Curved_Hem").getExtras().profile, "level-curved-drape");
      const artworkClearance = minimumProjectedClearance(nodes.get("T_Shirt_Front_Artwork"), shell, "front");
      assert.ok(artworkClearance >= 0.006, `every artwork mesh section spanning the approved source mask must clear the torso by at least 6 mm; got ${(artworkClearance * 1000).toFixed(3)} mm`);
      assert.equal(faceNormalAgreement(shell), 0, "t-shirt shell winding must agree with its vertex normals");
    }
    if (record.assetKey === "hoodie-001") {
      const shell = nodes.get("Hoodie_Draped_Shell");
      const hood = nodes.get("Hoodie_Open_Hood_Shell");
      const hoodInterior = nodes.get("Hoodie_Hood_Interior_Cavity");
      assert.equal(connectedTriangleComponents(shell), 1, "hoodie body, shoulders and sleeves must be one connected shell");
      assert.equal(shell.getExtras().construction, "tailored-torso-attached-sleeves");
      assert.doesNotMatch(builderSource, /shoulderBridge/, "standalone shoulder repair patches must not exist in the builder");
      assert.equal(shell.getExtras().sleeveAttachment, "shared-armhole-rings");
      assert.equal(shell.getExtras().armholeCoverage, "torso-holes-stitched-to-matching-sleeve-root-rings");
      assert.equal(shell.getExtras().sleeveRootCaps, 0);
      assert.equal(shell.getExtras().armholeRingVertexCount, 28);
      assert.equal(shell.getExtras().stitchFacesPerSide, 28);
      assert.ok(shell.getExtras().armholeTransitionRows >= 8, "hoodie armholes must distribute the body-to-sleeve transition across the upper-arm frame span");
      assert.ok(shell.getExtras().transitionFrameSpan >= 8, "hoodie armhole transition positions must advance through sleeve frames instead of stacking concentric root rings");
      assert.ok(shell.getExtras().maximumTransitionOffsetM <= 0.004, "hoodie armhole transition bias must remain too subtle to form a visible ridge band");
      assert.equal(shell.getExtras().transitionInterpolation, "smoothstep-body-to-progressive-sleeve-frames");
      assert.equal(shell.getExtras().normalRelaxation, "area-weighted-shared-indexed-surface", "shared armhole normals must be relaxed from actual triangle area instead of preserving a circular lighting rail");
      assert.equal(indexedTriangleComponents(shell), 1, "hoodie shell must share real indices across torso, stitch bands and sleeves");
      assert.equal(boundaryEdgesInArmholes(shell), 0, "hoodie armhole loops must be fully stitched without open repair gaps");
      assert.ok(minimumShoulderNormalDot(shell) >= 0.68, "hoodie shoulder normals must transition smoothly across the armhole seam");
      assert.ok(maximumGlobalUvDeviation(shell) <= 1e-6, "hoodie torso and sleeves must use one documented garment-space UV projection");
      assert.ok(projectedFrontCoverage(shell, [[0.270, 0.995], [0.320, 0.970], [0.350, 0.940], [-0.270, 0.995], [-0.320, 0.970], [-0.350, 0.940]]).every(Boolean), "hoodie front shoulder projection must not expose triangular armhole gaps");
      assert.ok(triangleCount(shell) >= 1800, "hoodie shell must have enough shaped sections for body, sleeves and shoulders");
      assert.ok(boundaryEdgeCount(hood) >= 24, "hood must preserve a real open face cavity");
      assert.equal(hood.getExtras().opening, "unfilled-face-cavity");
      assert.equal(hood.getExtras().construction, "attached-two-panel-down-hood");
      assert.equal(hood.getExtras().panelCount, 2);
      assert.equal(hood.getExtras().orientation, "down-resting-on-upper-back");
      assert.equal(hood.getExtras().openingPlane, "upward-forward-neckline");
      assert.ok(hood.getExtras().openingForwardPitchDegrees >= 18, "rear product cameras must see the solid hood exterior rather than looking into the face opening");
      assert.equal(hood.getExtras().rearViewOcclusion, "solid-exterior-shell-behind-cavity");
      assert.equal(hood.getExtras().rearExterior, "solid-two-lobe-panel");
      assert.equal(hood.getExtras().openingLipClosed, false, "hood opening edge must remain an irregular partial fold rather than a complete annulus");
      assert.ok(hood.getExtras().openingLipArcDegrees < 240, "hood opening fold must leave the rear silhouette integrated into the lobes");
      assert.deepEqual(hood.getExtras().openingLipThicknessRangeM, [0.006, 0.021], "hood fold thickness must vary like soft cloth rather than a uniform tube");
      assert.ok(hood.getExtras().openingLipVerticalVariationM >= 0.030, "hood face edge must rise and fall like a folded cloth edge instead of reading as a flat bright rail");
      assert.equal(hood.getExtras().openingLipMaterial, "shared-shell-fabric");
      assert.equal(hood.getExtras().openingLipNormalMode, "area-weighted-fold-surface");
      assert.equal(hood.getExtras().torsoNecklineOcclusion, "rear-neckline-tucked-below-hood-lobes");
      assert.equal(hood.getExtras().foldPanelSurface, "filled-between-rear-lobes-and-partial-face-edge", "rear arch and face edge must bound a filled hood pouch surface");
      assert.ok(hood.getExtras().foldPanelRearDropM >= 0.090, "filled hood panel must drape down the upper back instead of presenting as a horizontal rear band");
      assert.ok(hood.getExtras().foldPanelRearwardDrapeM >= 0.025, "filled hood panel must deepen rearward into broad fabric lobes");
      assert.equal(hood.getExtras().foldPanelProjection, "rear-exterior-outside-aperture");
      assert.equal(hood.getExtras().detachedPerimeterBand, false, "hood exterior must not preserve an unsupported arch or strap");
      assert.equal(hood.getExtras().archEndpoints, "rounded-below-opening-lip", "rear fold endpoints must remain buried below the face opening silhouette");
      assert.ok(maximumRearNecklineY(shell) <= 1.005, "rear torso neckline must be tucked below the hood overlap instead of forming a second visible oval");
      assert.ok(hood.getExtras().necklineOverlapM >= 0.08, "hood must visibly drape into the neckline and shoulders");
      assert.ok(hood.getExtras().shoulderDrapeWidthM >= 0.50, "down hood must spread as two fabric lobes across the upper back");
      assert.equal(connectedTriangleComponents(hood), 1, "hood back, side walls and opening rim must remain attached");
      assert.equal(hoodInterior.getMesh().listPrimitives()[0].getMaterial().getName(), "MAT_HOODIE_HOOD_INTERIOR", "hood interior material must be assigned to actual cavity geometry");
      assert.equal(indexedTriangleComponents(hoodInterior), 1, "hood inner throat must be one connected surface");
      assert.equal(boundaryEdgeCount(hoodInterior), 80, "uncapped hood interior must preserve open entrance and throat boundary loops");
      assert.equal(hoodInterior.getExtras().entranceJoinPositions, 26, "partial fold and cavity must document their exact positional join");
      assert.ok(sharedPositionCount(hood, hoodInterior) >= 26, "hood interior entrance must join the partial folded opening edge positionally");
      const interiorBounds = getBounds(hoodInterior);
      assert.ok(interiorBounds.max[1] - interiorBounds.min[1] >= 0.10, "hood cavity must have visible vertical depth");
      assert.ok(interiorBounds.max[2] - interiorBounds.min[2] >= 0.06, "hood cavity must deepen rearward instead of collapsing to a slit");
      assert.equal(hoodInterior.getExtras().opening, "uncapped-entrance-and-throat");
      assert.equal(faceNormalAgreement(hoodInterior), 0, "hood interior winding must agree with inward-facing vertex normals");
      const hoodBounds = getBounds(hood);
      const hoodAspect = (hoodBounds.max[0] - hoodBounds.min[0]) / (hoodBounds.max[1] - hoodBounds.min[1]);
      assert.ok(hoodAspect >= 1.45 && hoodAspect <= 1.95, "down hood must read as a broad folded garment lobe rather than an upright halo or sphere");
      assert.ok(hoodBounds.min[1] <= 0.80, "down hood must rest low enough on the upper back to read as attached drape");
      assert.equal(nodes.has("Hoodie_Hood_Throat_Overlap"), false, "hood must not stack a second rigid neckline ring beneath its opening lip");
      assert.ok(getBounds(nodes.get("Hoodie_Hood_Centre_Seam")).max[1] <= 0.94, "rear centre seam must stop below the face aperture instead of crossing the open void");
      assert.equal(nodes.get("Hoodie_Shaped_Cuffs").getExtras().opening, "unfilled-cuff-rims");
      assert.equal(nodes.get("Hoodie_Waistband").getExtras().integration, "conforming-body-overlap");
      for (const name of ["Hoodie_Draped_Shell", "Hoodie_Open_Hood_Shell"]) assert.equal(faceNormalAgreement(nodes.get(name)), 0, `${name} winding must agree with its vertex normals`);
    }
    if (record.assetKey === "cap-001") {
      assert.ok(bytes.byteLength <= 1_250_000, `cap-001 must stay within the 1.25 MB Fast-4G delivery budget; got ${bytes.byteLength} bytes`);
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
      assert.deepEqual(nodes.get("Cap_Crown_Seams").getExtras(), { role: "raised-tonal-panel-seams", panelCount: 6 });
      assert.equal(nodes.get("Cap_Crown_Creases").getExtras().role, "subtle-panel-form-creases");
      assert.equal(nodes.get("Cap_Eyelets").getExtras().count, 4);
      assert.equal(nodes.get("Cap_Curved_Brim").getExtras().curvatureAxes, 2);
      assert.equal(nodes.get("Cap_Bill_Edge_Stitching").getExtras().rows, 2);
      assert.equal(nodes.get("Cap_Crown_Bill_Transition").getExtras().role, "front-crown-bill-join");
      assert.equal(nodes.get("Cap_Patch_Border").getExtras().integration, "stitched-conforming-border");
      assert.equal(nodes.has("Cap_Rear_Opening"), false, "a filled dark rear-opening ellipse must never masquerade as topology");
      assert.equal(crownTrianglesInRearAperture(nodes), 0, "cap crown geometry must be removed inside the rear aperture");
      assert.equal(nodes.get("Cap_Rear_Aperture_Rim").getExtras().opening, "unfilled-through-aperture");
      assert.equal(rearFacingDetailTrianglesInAperture(nodes, ["Cap_Crown_Seams", "Cap_Crown_Creases", "Cap_Eyelets", "Cap_Crown_Bill_Transition", "Cap_Front_Patch", "Cap_Patch_Border", "Cap_Patch_Mark"]), 0, "no front detail may render as a rear-facing fragment inside the clear aperture projection");
      for (const name of ["Cap_Front_Patch", "Cap_Patch_Border", "Cap_Patch_Mark"]) assert.equal(nodes.get(name).getMesh().listPrimitives()[0].getMaterial().getDoubleSided(), false, `${name} must be culled from the rear opening`);
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
