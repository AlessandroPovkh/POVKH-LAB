import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const execFile = promisify(execFileCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const glbPath = path.join(siteRoot, "assets/merch-3d/cassette-002.glb");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const boundsForAccessor = (accessor) => {
  const values = accessor.getArray();
  const itemSize = accessor.getElementSize();
  const min = Array(itemSize).fill(Infinity);
  const max = Array(itemSize).fill(-Infinity);
  for (let offset = 0; offset < values.length; offset += itemSize) {
    for (let axis = 0; axis < itemSize; axis += 1) {
      min[axis] = Math.min(min[axis], values[offset + axis]);
      max[axis] = Math.max(max[axis], values[offset + axis]);
    }
  }
  return {min, max, centre: min.map((value, axis) => (value + max[axis]) / 2), size: min.map((value, axis) => max[axis] - value)};
};

const transformPoint = (point, matrix) => [
  matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
  matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
  matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14]
];

const primitiveRegistrationFromGlb = (doc, source) => {
  const meshNodes = doc.getRoot().listNodes().filter((node) => node.getMesh());
  const assembly = doc.getRoot().listNodes().find((node) => node.getName() === "Cassette_002_Centred_Pivot");
  assert.equal(assembly.getName(), "Cassette_002_Centred_Pivot");
  return Object.fromEntries(Object.entries(source.registration).map(([key, target]) => {
    const meshNode = meshNodes.find((node) => node.getMesh().listPrimitives().some((entry) => entry.getMaterial().getName() === target.material));
    assert.ok(meshNode, `${key} coordinate node missing`);
    const primitive = meshNode.getMesh().listPrimitives().find((entry) => entry.getMaterial().getName() === target.material);
    assert.ok(primitive, `${key} material primitive missing`);
    const position = boundsForAccessor(primitive.getAttribute("POSITION"));
    const uvAccessor = primitive.getAttribute("TEXCOORD_0");
    assert.equal(Boolean(uvAccessor), Boolean(target.uvRequired), `${key} UV authority mismatch`);
    const worldCentreM = transformPoint(position.centre, meshNode.getWorldMatrix());
    const assemblyWorldM = assembly.getWorldTranslation();
    return [key, {
      material: target.material,
      localCentreMm: position.centre.slice(0, 2).map((value) => value * 1000),
      localSizeMm: position.size.slice(0, 2).map((value) => value * 1000),
      worldCentreMm: worldCentreM.slice(0, 2).map((value) => value * 1000),
      coordinateNode: meshNode.getName(),
      coordinateTranslationMm: meshNode.getWorldTranslation().slice(0, 2).map((value) => value * 1000),
      assemblyTranslationMm: assemblyWorldM.slice(0, 2).map((value) => value * 1000),
      uvBounds: uvAccessor ? (() => {
        const uv = boundsForAccessor(uvAccessor);
        return [...uv.min, ...uv.max];
      })() : null
    }];
  }));
};

const componentMeasurements = (primitive, epsilon = 1e-7, {weld = true} = {}) => {
  const position = primitive.getAttribute("POSITION");
  const positions = position.getArray();
  const indices = primitive.getIndices().getArray();
  const vertexToCanonical = [];
  const canonicalByPosition = new Map();
  const points = [];
  for (let vertex = 0; vertex < position.getCount(); vertex += 1) {
    const point = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
    const key = weld ? point.map((value) => Math.round(value / epsilon)).join(":") : `vertex:${vertex}`;
    if (!canonicalByPosition.has(key)) {
      canonicalByPosition.set(key, points.length);
      points.push(point);
    }
    vertexToCanonical[vertex] = canonicalByPosition.get(key);
  }
  const adjacency = points.map(() => new Set());
  const used = new Set();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]].map((vertex) => vertexToCanonical[vertex]);
    triangle.forEach((vertex) => used.add(vertex));
    for (let edge = 0; edge < 3; edge += 1) {
      adjacency[triangle[edge]].add(triangle[(edge + 1) % 3]);
      adjacency[triangle[(edge + 1) % 3]].add(triangle[edge]);
    }
  }
  const remaining = new Set(used);
  const components = [];
  while (remaining.size) {
    const queue = [remaining.values().next().value];
    const members = [];
    remaining.delete(queue[0]);
    while (queue.length) {
      const current = queue.pop();
      members.push(current);
      for (const next of adjacency[current]) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        queue.push(next);
      }
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    members.forEach((member) => points[member].forEach((value, axis) => {
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }));
    components.push({
      minMm: min.map((value) => value * 1000),
      maxMm: max.map((value) => value * 1000),
      centreMm: min.map((value, axis) => (value + max[axis]) / 2 * 1000),
      sizeMm: min.map((value, axis) => (max[axis] - value) * 1000),
      vertices: members.length
    });
  }
  return components;
};

const near = (actual, expected, tolerance = 0.03) => Math.abs(actual - expected) <= tolerance;
const matchesSize = (component, expected, tolerance = 0.03) => expected.every((value, axis) => near(component.sizeMm[axis], value, tolerance));
const overlapsWindow = (component, window) => component.maxMm.every((value, axis) => value >= window.minMm[axis]) && component.minMm.every((value, axis) => value <= window.maxMm[axis]);

test("source identity attachments remain byte-identical and poster follows the merch registry", async () => {
  const source = await readJson(path.join(here, "cassette-002.source.json"));
  const merch = await readJson(path.join(siteRoot, "data/merch.json"));
  const product = merch.objects.find((entry) => entry.id === "MRCH-002");

  assert.equal(source.camera.poster, product.gallery.find((image) => image.role === "hero").path);
  assert.equal(source.camera.poster, product.viewer.poster);
  for (const identity of Object.values(source.identity)) {
    const bytes = await readFile(path.join(here, identity.path));
    assert.equal(sha256(bytes), identity.sha256);
  }
});

test("immutable source fixtures pin canonical placements and provenance path plus SHA", async () => {
  const [source, report] = await Promise.all([
    readJson(path.join(here, "cassette-002.source.json")),
    readJson(path.join(here, "reports/cassette-002.report.json"))
  ]);
  const expected = {
    placements: {
      path: "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/placements.json",
      sha256: "398cf719dc099c785858baab7876ff95aead00763b000db46c899f90c6f0b783"
    },
    provenance: {
      path: "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/provenance.json",
      sha256: "e274081bc3844843edc5b533f3d26085c40dc55a6646571c5f23c39eaf7242bb"
    }
  };
  for (const [key, authority] of Object.entries(expected)) {
    assert.equal(source.canonicalSource[key].path, authority.path);
    assert.equal(source.canonicalSource[key].sha256, authority.sha256);
    assert.match(source.canonicalSource[key].fixturePath, /^sources\/cassette-002\/authority\/.+\.json$/);
    assert.match(source.canonicalSource[key].fixtureSha256, /^[a-f0-9]{64}$/);
    const fixtureBytes = await readFile(path.join(here, source.canonicalSource[key].fixturePath));
    const fixture = JSON.parse(fixtureBytes);
    assert.equal(sha256(fixtureBytes), source.canonicalSource[key].fixtureSha256);
    assert.equal(fixture.canonicalPath, authority.path);
    assert.equal(fixture.canonicalSha256, authority.sha256);
    assert.equal(fixture.authorityType, "governed-minimal-copy");
    assert.deepEqual(report.authorityIntegrity[key], {
      fixturePath: source.canonicalSource[key].fixturePath,
      fixtureSha256: source.canonicalSource[key].fixtureSha256,
      canonicalPath: authority.path,
      canonicalSha256: authority.sha256
    });
  }
  const placements = await readJson(path.join(here, source.canonicalSource.placements.fixturePath));
  assert.deepEqual(placements.payload, {
    canvas: {width: 1536, height: 1024},
    front: {compactSeal: {x: 1148, y: 202, width: 50, height: 50}, signalRule: {x: 846, y: 225, width: 250, height: 4}},
    open: {ascii: {x: 230, y: 225, width: 520, height: 195}, signalRule: {x: 230, y: 431, width: 520, height: 4}, metadata: {x: 230, y: 443, fontSize: 10, lineSpacing: 3}},
    shell: {reverseCompact: {x: 1090, y: 318, width: 64, height: 64}},
    rear: {ascii: {x: 376, y: 286, width: 784, height: 294}, signalRule: {x: 376, y: 626, width: 784, height: 4}, metadata: {x: 376, y: 666, fontSize: 15, lineSpacing: 9}},
    detail: {reverseCompact: {x: 820, y: 620, width: 84, height: 84}}
  });
  const provenance = await readJson(path.join(here, source.canonicalSource.provenance.fixturePath));
  assert.equal(provenance.payload.stage, "IDENTITY_PACKET_USER_APPROVED");
  assert.equal(provenance.payload.identity.method, "Deterministic placement of exact governed identity attachments.");
  assert.deepEqual(provenance.payload.identityFiles.map((entry) => entry.sha256), [source.identity.ascii.sha256, source.identity.compactDark.sha256, source.identity.compactReverse.sha256]);
});

test("optimized GLB contains exact mechanics, embedded identity and a centred grounded pivot", async () => {
  const [bytes, report] = await Promise.all([
    readFile(glbPath),
    readJson(path.join(here, "reports/cassette-002.report.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const nodes = doc.getRoot().listNodes();
  const names = nodes.map((node) => node.getName());
  const textures = doc.getRoot().listTextures();
  const bounds = getBounds(doc.getRoot().getDefaultScene());

  assert.equal(names.filter((name) => /^Screw_\d{2}$/.test(name)).length, 5);
  assert.deepEqual(names.filter((name) => /^Hub_/.test(name)).sort(), ["Hub_Left", "Hub_Right"]);
  assert.deepEqual(names.filter((name) => /^Guide_Roller_/.test(name)).sort(), ["Guide_Roller_Left", "Guide_Roller_Right"]);
  assert.deepEqual(names.filter((name) => /^Spindle_/.test(name)).sort(), ["Spindle_Left", "Spindle_Right"]);
  assert.equal(nodes.find((node) => node.getName() === "Pressure_Pad").getExtras().touchesTapeInProjection, true);
  assert.deepEqual(nodes.find((node) => node.getName() === "Tape_Path").getExtras().orderedRoute, ["left-reel", "left-guide", "pressure-pad", "right-guide", "right-reel"]);
  assert.equal(nodes.find((node) => node.getName() === "Empty_Window").getExtras().containsGeometry, false);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(textures.length, 2);
  assert.deepEqual(textures.map((texture) => sha256(texture.getImage())).sort(), [report.sourceIntegrity.ascii.sha256, report.sourceIntegrity.compactReverse.sha256].sort());
  assert.ok(Math.abs(bounds.min[1]) < 1e-7, `ground drift: ${bounds.min[1]}`);
  assert.ok(Math.abs(bounds.min[0] + bounds.max[0]) < 1e-7, "X pivot is not centred");
  assert.ok(Math.abs(bounds.min[2] + bounds.max[2]) < 1e-7, "Z pivot is not centred");
});

test("registration is measured from authored texture primitives in assembly-local coordinates", async () => {
  const [source, bytes, report] = await Promise.all([
    readJson(path.join(here, "cassette-002.source.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/cassette-002.report.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const measured = primitiveRegistrationFromGlb(doc, source);

  for (const [key, target] of Object.entries(source.registration)) {
    assert.equal("actualMm" in target, false, `${key} must not self-enter actual dimensions`);
    assert.equal("actualCentreMm" in target, false, `${key} must not self-enter actual centre`);
    assert.deepEqual(measured[key].localCentreMm.map((value) => Number(value.toFixed(4))), target.centreMm);
    assert.deepEqual(measured[key].localSizeMm.map((value) => Number(value.toFixed(4))), target.surfaceMm);
    if (target.uvRequired) assert.deepEqual(measured[key].uvBounds.map((value) => Number(value.toFixed(4))), [0, 0, 1, 1]);
    else assert.equal(measured[key].uvBounds, null);
    assert.deepEqual(measured[key].worldCentreMm.map((value) => Number(value.toFixed(4))), target.centreMm.map((value, axis) => Number((value + measured[key].coordinateTranslationMm[axis]).toFixed(4))));
  }
  assert.deepEqual(report.registration.entries.map((entry) => [entry.key, entry.actualCentreMm, entry.actualSizeMm]), Object.entries(measured).map(([key, entry]) => [key, entry.localCentreMm, entry.localSizeMm]));
});

test("open-state identity scale and material response follow the approved visual references", async () => {
  const [source, bytes, report] = await Promise.all([
    readJson(path.join(here, "cassette-002.source.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/cassette-002.report.json"))
  ]);
  assert.equal(source.registration.asciiJCard.surfaceMm[0] >= 80, true, "ASCII identity must dominate the open J-card");
  assert.deepEqual(source.registration.compactReverseShell.centreMm, [81, 54]);
  assert.equal(source.materials.clear.baseColor[3] <= 0.12, true);
  assert.equal(source.materials.smoke.baseColor[3] <= 0.35, true);
  assert.match(source.camera.fieldOfView, /^(22|23|24|25|26)deg$/);
  const desktopTheta = Number.parseFloat(source.camera.orbit);
  const desktopFov = Number.parseFloat(source.camera.fieldOfView);
  const mobileFov = Number.parseFloat(source.camera.mobileFieldOfView);
  assert.equal(desktopTheta >= 12 && desktopTheta <= 24, true, "default camera must be a light three-quarter view");
  assert.equal(Number.isFinite(mobileFov) && mobileFov <= desktopFov - 3, true, "mobile framing must be tighter than desktop");
  assert.match(source.camera.mobileTarget, /^auto 0\.0(?:7[6-9]|8[0-2])m auto$/);
  assert.deepEqual(source.readabilityAnchors.asciiJCard, {asciiSide: "left", labelSide: "right", signalRuleRelation: "above-label", expectedText: "POVKH_LAB::SIGNAL"});
  const doc = await new NodeIO().readBinary(bytes);
  const primitives = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const byMaterial = (name) => primitives.find((primitive) => primitive.getMaterial().getName() === name);
  assert.equal(byMaterial("MAT_IDENTITY_COMPACT_DARK"), undefined, "compact-dark seal is not authorized on the OPEN_SET J-card");
  assert.ok(byMaterial("MAT_SIGNAL_RED"), "governed OPEN_SET signal rule must remain visible");
  assert.equal(doc.getRoot().listNodes().some((node) => node.getName() === "Identity_Compact_Dark_JCard"), false);
  for (const materialName of ["MAT_IDENTITY_ASCII_DARK", "MAT_IDENTITY_COMPACT_REVERSE"]) {
    const primitive = byMaterial(materialName);
    const positions = primitive.getAttribute("POSITION").getArray();
    const uvs = primitive.getAttribute("TEXCOORD_0").getArray();
    const xs = Array.from({length: positions.length / 3}, (_, index) => positions[index * 3]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const averageU = (targetX) => {
      const values = xs.flatMap((x, index) => Math.abs(x - targetX) < 1e-7 ? [uvs[index * 2]] : []);
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const ys = Array.from({length: positions.length / 3}, (_, index) => positions[index * 3 + 1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const averageV = (targetY) => {
      const values = ys.flatMap((y, index) => Math.abs(y - targetY) < 1e-7 ? [uvs[index * 2 + 1]] : []);
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    assert.equal(averageU(minX) < averageU(maxX), true, `${materialName} must preserve governed left-to-right texture readability`);
    assert.equal(averageV(minY) > averageV(maxY), true, `${materialName} must preserve governed top-to-bottom raster orientation`);
  }
  assert.deepEqual(report.camera, source.camera);
});

test("mechanics are proven by connected geometry components and spatial landmarks", async () => {
  const [bytes, report] = await Promise.all([
    readFile(glbPath),
    readJson(path.join(here, "reports/cassette-002.report.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const primitives = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const byMaterial = (name) => primitives.find((primitive) => primitive.getMaterial().getName() === name);
  const hardware = componentMeasurements(byMaterial("MAT_BLACK_HARDWARE"));
  const felt = componentMeasurements(byMaterial("MAT_PRESSURE_FELT"));
  const tape = componentMeasurements(byMaterial("MAT_MAGNETIC_TAPE"));
  const identity = ["MAT_IDENTITY_ASCII_DARK", "MAT_IDENTITY_COMPACT_REVERSE"].flatMap((name) => componentMeasurements(byMaterial(name)));

  const screws = hardware.filter((component) => matchesSize(component, [2.9, 2.9, 0.8]));
  const hubs = hardware.filter((component) => matchesSize(component, [16, 16, 2]));
  const spindles = hardware.filter((component) => matchesSize(component, [6, 6, 1.4]));
  const rollers = hardware.filter((component) => matchesSize(component, [6.2, 6.2, 1.6]));
  const ribbons = tape.filter((component) => component.sizeMm[0] > 60 && component.sizeMm[1] < 25 && component.sizeMm[2] < 0.01);
  const transportPorts = hardware.filter((component) => matchesSize(component, [3.4, 3.4, 0.6], 0.08) || matchesSize(component, [4.8, 4.8, 0.6], 0.08));
  assert.equal(hardware.length, 18, "hardware topology drift");
  assert.equal(screws.length, 5);
  assert.equal(hubs.length, 2);
  assert.equal(spindles.length, 2);
  assert.equal(rollers.length, 2);
  assert.equal(transportPorts.length, 6, "lower transport panel needs six visible ports");
  const pressurePads = felt.filter((component) => matchesSize(component, [8, 4, 1.2]));
  assert.equal(felt.length, 27);
  assert.equal(pressurePads.length, 1);
  assert.equal(ribbons.length, 1);
  const ribbon = ribbons[0];
  for (const landmark of [[10, 13], [45, 11.2], [80, 13]]) {
    const nearest = Math.min(...[
      [ribbon.minMm[0], ribbon.minMm[1]], [ribbon.maxMm[0], ribbon.minMm[1]],
      [ribbon.minMm[0], ribbon.maxMm[1]], [ribbon.maxMm[0], ribbon.maxMm[1]]
    ].map(([x, y]) => Math.hypot(x - landmark[0], y - landmark[1])));
    assert.equal(ribbon.minMm[0] <= landmark[0] && ribbon.maxMm[0] >= landmark[0], true);
    assert.equal(ribbon.minMm[1] <= landmark[1] && ribbon.maxMm[1] >= landmark[1], true);
    assert.equal(Number.isFinite(nearest), true);
  }
  const emptyWindow = {minMm: [37.5, 30, 6], maxMm: [52.5, 44, 8]};
  assert.equal([...hardware, ...identity].some((component) => overlapsWindow(component, emptyWindow)), false);
  assert.equal(report.mechanics.evidence, "reopened-glb-topology-spatial");
  assert.deepEqual(report.mechanics.componentCounts, {hardware: 18, feltAndScrewHighlights: 27, tape: 3});
});

test("open Norelco case has two full halves joined at one continuous hinge", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const primitives = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const clear = primitives.filter((primitive) => ["MAT_CLEAR_POLYMER", "MAT_CLEAR_EDGE"].includes(primitive.getMaterial().getName()));
  const components = clear.flatMap((primitive) => componentMeasurements(primitive));
  const panelSheets = clear.flatMap((primitive) => componentMeasurements(primitive, 1e-7, {weld: false}))
    .filter((component) => matchesSize(component, [109, 70, 0]));
  const hinges = components.filter((component) => matchesSize(component, [109, 2, 17]));
  assert.equal(panelSheets.length, 4, "base and lid each need full front and rear 109 x 70 mm panel sheets");
  assert.deepEqual(panelSheets.map((component) => Number(component.centreMm[1].toFixed(2))).sort((a, b) => a - b), [35, 35, 105, 105]);
  assert.equal(hinges.length, 1);
  assert.equal(Number(hinges[0].centreMm[1].toFixed(2)), 70);
  assert.equal(Number(Math.min(...components.map((component) => component.minMm[1])).toFixed(2)), 0);
  assert.equal(Number(Math.max(...components.map((component) => component.maxMm[1])).toFixed(2)), 140);
  assert.equal(hinges[0].minMm[1] <= 70 && hinges[0].maxMm[1] >= 70, true);
  const jCard = doc.getRoot().listNodes().find((node) => node.getName() === "J_Card_Bone");
  const lid = doc.getRoot().listNodes().find((node) => node.getName() === "Case_Open_Lid");
  assert.equal(Number(jCard.getTranslation()[1].toFixed(3)), 0.105);
  assert.equal(Number(lid.getTranslation()[1].toFixed(3)), 0.105);
});

test("product-scale detail geometry reads beyond simplistic slabs and dots", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const primitives = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const allByMaterial = (name) => primitives.filter((primitive) => primitive.getMaterial().getName() === name).flatMap((primitive) => componentMeasurements(primitive));
  const clear = [...allByMaterial("MAT_CLEAR_POLYMER"), ...allByMaterial("MAT_CLEAR_EDGE")];
  const smoke = allByMaterial("MAT_SMOKE_POLYMER");
  const feltAndHighlights = allByMaterial("MAT_PRESSURE_FELT");
  const highlights = feltAndHighlights.filter((component) => matchesSize(component, [2, 0.35, 0.12], 0.05) || matchesSize(component, [0.35, 2, 0.12], 0.05));

  const retainingPosts = clear.filter((component) => matchesSize(component, [4.8, 4.8, 8], 0.08));
  const clearHubRings = clear.filter((component) => matchesSize(component, [18.4, 18.4, 0.8], 0.08));
  const hingeKnuckles = clear.filter((component) => matchesSize(component, [14, 2.4, 4], 0.08));
  const hubTeeth = feltAndHighlights.filter((component) => matchesSize(component, [1.8, 1.8, 1], 0.05));
  const sideRails = smoke.filter((component) => matchesSize(component, [1.6, 56, 12.4], 0.08));
  const windowFrames = smoke.filter((component) => matchesSize(component, [18, 16, 0.8], 0.05));
  const lowerPanel = smoke.find((component) => matchesSize(component, [50, 16, 1.2], 0.05));
  assert.equal(retainingPosts.length, 3);
  assert.equal(clearHubRings.length, 2);
  assert.equal(hingeKnuckles.length, 5);
  assert.equal(hubTeeth.length, 16);
  assert.equal(sideRails.length, 2);
  assert.equal(highlights.length, 10, "five screws each need a two-stroke Phillips read");
  assert.equal(windowFrames.length, 1, "central window frame must be one connected moulded recess");
  assert.ok(lowerPanel, "lower trapezoid/pad panel missing");
  const screwCentres = [[2, 57], [88, 57], [2, 7], [88, 7], [45, 6.5]];
  screwCentres.forEach(([x, y]) => {
    assert.equal(highlights.filter((component) => Math.hypot(component.centreMm[0] - x, component.centreMm[1] - y) < 0.05).length, 2);
  });
});

test("centred-pivot metadata cannot use model-viewer's reserved pivot field", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const assembly = doc.getRoot().listNodes().find((node) => node.getName() === "Cassette_002_Centred_Pivot");
  const extras = assembly.getExtras();
  assert.equal("pivot" in extras, false);
  assert.equal(extras.pivotPolicy, "centred-overall-display");
  const bounds = getBounds(doc.getRoot().getDefaultScene());
  assert.equal([...bounds.min, ...bounds.max].every(Number.isFinite), true);
  assert.equal(bounds.max.every((value, axis) => value > bounds.min[axis]), true);
});

test("actual artifact independently satisfies validation and hard budgets", async () => {
  const bytes = await readFile(glbPath);
  const report = await readJson(path.join(here, "reports/cassette-002.report.json"));
  const result = await validateBytes(new Uint8Array(bytes), {uri: "cassette-002.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  const file = await stat(glbPath);

  assert.equal(result.issues.numErrors, 0);
  assert.equal(result.issues.numWarnings, 0);
  assert.equal(file.size, report.budget.bytes);
  assert.equal(sha256(bytes), report.output.sha256);
  assert.ok(report.budget.bytes <= 2_500_000);
  assert.ok(report.budget.triangles <= 50_000);
  assert.ok(report.budget.drawCalls <= 12);
  assert.equal(report.deterministic.verifiedBySecondInMemoryBuild, true);
});

test("browser QA evidence is hash-pinned and matches the governed camera", async () => {
  const [source, report, browserQa] = await Promise.all([
    readJson(path.join(here, "cassette-002.source.json")),
    readJson(path.join(here, "reports/cassette-002.report.json")),
    readJson(path.join(here, "reports/cassette-002.browser-qa.json"))
  ]);
  assert.equal(browserQa.assetKey, source.assetKey);
  assert.equal(browserQa.structuralGeometryReview.status, "pass");
  assert.equal(browserQa.browserIntegration.status, "pass");
  assert.equal(browserQa.browserIntegration.consoleErrors, 0);
  assert.equal(browserQa.browserIntegration.modelViewerSemantics.allFinite, true);
  assert.equal(browserQa.browserIntegration.modelViewerSemantics.positiveDimensions, true);
  assert.equal(browserQa.browserIntegration.modelViewerSemantics.fieldOfViewDeg, Number.parseFloat(source.camera.fieldOfView));
  assert.equal(browserQa.screenshotDiff.status, "manual-poc-pass");
  assert.equal(browserQa.screenshots.length, 7);
  for (const screenshot of browserQa.screenshots) {
    const bytes = await readFile(path.join(siteRoot, screenshot.path));
    assert.equal(sha256(bytes), screenshot.sha256, `${screenshot.view} evidence hash drift`);
  }
  assert.equal(report.camera.fieldOfView, source.camera.fieldOfView);
  assert.deepEqual(browserQa.browserIntegration.governedCameraEvidence, {
    captureMode: "source metadata applied programmatically for asset QA; production runtime contract remains a separate integration gate",
    desktop: {orbit: source.camera.orbit, fieldOfView: source.camera.fieldOfView},
    mobile: {orbit: source.camera.mobileOrbit, fieldOfView: source.camera.mobileFieldOfView, cameraTarget: source.camera.mobileTarget}
  });
  assert.equal(browserQa.structuralGeometryReview.evidence.some((line) => line.includes(`${report.budget.triangles} triangles`)), true);
});

test("checked-in GLB and reports reproduce from canonical inputs", async () => {
  const {stdout, stderr} = await execFile(process.execPath, [path.join(here, "build-cassette-002.mjs"), "--verify"], {cwd: siteRoot});
  assert.match(stdout, /verified [a-f0-9]{64}/);
  assert.doesNotMatch(`${stdout}\n${stderr}`, /\/Users\/|\\Users\\|20\d\d-\d\d-\d\dT/);
});
