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
const sourcePath = path.join(here, "cassette-002.source.json");
const outputPath = path.join(siteRoot, "assets/merch-3d/cassette-002.glb");
const reportPath = path.join(here, "reports/cassette-002.report.json");
const validatorPath = path.join(here, "reports/cassette-002.validator.json");
const unoptimizedInspectPath = path.join(here, "reports/cassette-002.inspect-unoptimized.json");
const optimizedInspectPath = path.join(here, "reports/cassette-002.inspect-optimized.json");
const verifyOnly = process.argv.includes("--verify");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const mm = (value) => value / 1000;

class GeometryGroup {
  constructor(name) {
    this.name = name;
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

  quad(a, b, c, d, normal, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const base = [a, b, c, d].map((position, index) => this.vertex(position, normal, uvs[index]));
    this.indices.push(base[0], base[1], base[2], base[0], base[2], base[3]);
  }
}

const addBox = (group, [cx, cy, cz], [sx, sy, sz]) => {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  group.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  group.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  group.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  group.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  group.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  group.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
};

const addCylinderZ = (group, [cx, cy, cz], radius, depth, segments = 20, innerRadius = 0) => {
  const z0 = cz - depth / 2;
  const z1 = cz + depth / 2;
  for (let index = 0; index < segments; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius];
    const p1 = [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius];
    const n0 = [Math.cos(a0), Math.sin(a0), 0];
    const n1 = [Math.cos(a1), Math.sin(a1), 0];
    const outer = [
      group.vertex([p0[0], p0[1], z0], n0, [index / segments, 0]),
      group.vertex([p1[0], p1[1], z0], n1, [(index + 1) / segments, 0]),
      group.vertex([p1[0], p1[1], z1], n1, [(index + 1) / segments, 1]),
      group.vertex([p0[0], p0[1], z1], n0, [index / segments, 1])
    ];
    group.indices.push(outer[0], outer[1], outer[2], outer[0], outer[2], outer[3]);

    if (innerRadius > 0) {
      const q0 = [cx + Math.cos(a0) * innerRadius, cy + Math.sin(a0) * innerRadius];
      const q1 = [cx + Math.cos(a1) * innerRadius, cy + Math.sin(a1) * innerRadius];
      const front = [
        group.vertex([p0[0], p0[1], z1], [0, 0, 1]),
        group.vertex([p1[0], p1[1], z1], [0, 0, 1]),
        group.vertex([q1[0], q1[1], z1], [0, 0, 1]),
        group.vertex([q0[0], q0[1], z1], [0, 0, 1])
      ];
      group.indices.push(front[0], front[1], front[2], front[0], front[2], front[3]);
      const back = [
        group.vertex([p1[0], p1[1], z0], [0, 0, -1]),
        group.vertex([p0[0], p0[1], z0], [0, 0, -1]),
        group.vertex([q0[0], q0[1], z0], [0, 0, -1]),
        group.vertex([q1[0], q1[1], z0], [0, 0, -1])
      ];
      group.indices.push(back[0], back[1], back[2], back[0], back[2], back[3]);
      const inner = [
        group.vertex([q1[0], q1[1], z0], [-Math.cos(a1), -Math.sin(a1), 0]),
        group.vertex([q0[0], q0[1], z0], [-Math.cos(a0), -Math.sin(a0), 0]),
        group.vertex([q0[0], q0[1], z1], [-Math.cos(a0), -Math.sin(a0), 0]),
        group.vertex([q1[0], q1[1], z1], [-Math.cos(a1), -Math.sin(a1), 0])
      ];
      group.indices.push(inner[0], inner[1], inner[2], inner[0], inner[2], inner[3]);
    } else {
      const frontCenter = group.vertex([cx, cy, z1], [0, 0, 1], [0.5, 0.5]);
      const frontA = group.vertex([p0[0], p0[1], z1], [0, 0, 1]);
      const frontB = group.vertex([p1[0], p1[1], z1], [0, 0, 1]);
      group.indices.push(frontCenter, frontA, frontB);
      const backCenter = group.vertex([cx, cy, z0], [0, 0, -1], [0.5, 0.5]);
      const backA = group.vertex([p1[0], p1[1], z0], [0, 0, -1]);
      const backB = group.vertex([p0[0], p0[1], z0], [0, 0, -1]);
      group.indices.push(backCenter, backA, backB);
    }
  }
};

const addRibbon = (group, points, width, z) => {
  const left = [];
  const right = [];
  points.forEach(([x, y], index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    const offset = [(-dy / length) * width / 2, (dx / length) * width / 2];
    left.push(group.vertex([x + offset[0], y + offset[1], z], [0, 0, 1], [0, index / (points.length - 1)]));
    right.push(group.vertex([x - offset[0], y - offset[1], z], [0, 0, 1], [1, index / (points.length - 1)]));
  });
  for (let index = 0; index < points.length - 1; index += 1) {
    group.indices.push(left[index], right[index], right[index + 1], left[index], right[index + 1], left[index + 1]);
  }
};

const addFrontQuad = (group, [cx, cy, z], [width, height], {flipV = false} = {}) => {
  const uvs = flipV ? [[0, 1], [1, 1], [1, 0], [0, 0]] : undefined;
  group.quad(
    [cx - width / 2, cy - height / 2, z],
    [cx + width / 2, cy - height / 2, z],
    [cx + width / 2, cy + height / 2, z],
    [cx - width / 2, cy + height / 2, z],
    [0, 0, 1],
    uvs
  );
};

const addTrapezoidPrism = (group, [cx, cy, cz], [topWidth, bottomWidth, height, depth]) => {
  const z0 = cz - depth / 2;
  const z1 = cz + depth / 2;
  const front = [
    [cx - bottomWidth / 2, cy - height / 2, z1], [cx + bottomWidth / 2, cy - height / 2, z1],
    [cx + topWidth / 2, cy + height / 2, z1], [cx - topWidth / 2, cy + height / 2, z1]
  ];
  const back = front.map(([x, y]) => [x, y, z0]);
  group.quad(front[0], front[1], front[2], front[3], [0, 0, 1]);
  group.quad(back[1], back[0], back[3], back[2], [0, 0, -1]);
  group.quad(back[0], front[0], front[3], back[3], [-1, 0, 0]);
  group.quad(front[1], back[1], back[2], front[2], [1, 0, 0]);
  group.quad(front[3], front[2], back[2], back[3], [0, 1, 0]);
  group.quad(back[0], back[1], front[1], front[0], [0, -1, 0]);
};

const createMaterial = (doc, name, preset) => {
  const material = doc.createMaterial(name)
    .setBaseColorFactor(preset.baseColor)
    .setMetallicFactor(preset.metallic)
    .setRoughnessFactor(preset.roughness)
    .setDoubleSided(Boolean(preset.alphaMode));
  if (preset.alphaMode) material.setAlphaMode(preset.alphaMode);
  return material;
};

const createTextureMaterial = async (doc, name, filename) => {
  const image = await readFile(path.join(here, filename));
  const texture = doc.createTexture(`${name}_Texture`).setImage(image).setMimeType("image/png");
  return doc.createMaterial(name)
    .setBaseColorFactor([1, 1, 1, 1])
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.72)
    .setAlphaMode("BLEND")
    .setDoubleSided(true);
};

const addAnchor = (doc, scene, name, translation, extras = {}) => {
  const node = doc.createNode(name).setTranslation(translation).setExtras(extras);
  scene.addChild(node);
  return node;
};

const buildDocument = async (source) => {
  const doc = new Document();
  const scene = doc.createScene("Cassette_002_Open_Display");
  doc.getRoot().setDefaultScene(scene);
  const buffer = doc.createBuffer("Cassette_002_Buffer");
  // Re-centres the authored display envelope in X/Z while retaining Y=0 ground.
  const assembly = doc.createNode("Cassette_002_Centred_Pivot")
    .setTranslation([mm(12.15), 0, mm(4.4)])
    .setExtras({pivotPolicy: "centred-overall-display", groundY: 0});
  scene.addChild(assembly);

  const clearMaterial = createMaterial(doc, "MAT_CLEAR_POLYMER", source.materials.clear);
  const materials = {
    clearPanel: clearMaterial,
    clearEdge: createMaterial(doc, "MAT_CLEAR_EDGE", source.materials.clearEdge),
    smoke: createMaterial(doc, "MAT_SMOKE_POLYMER", source.materials.smoke),
    bone: createMaterial(doc, "MAT_PAPER_BONE", source.materials.bone),
    black: createMaterial(doc, "MAT_BLACK_HARDWARE", source.materials.black),
    tape: createMaterial(doc, "MAT_MAGNETIC_TAPE", source.materials.tape),
    felt: createMaterial(doc, "MAT_PRESSURE_FELT", source.materials.felt),
    signalRed: createMaterial(doc, "MAT_SIGNAL_RED", {baseColor: [0.95, 0.012, 0.025, 1], metallic: 0, roughness: 0.7}),
    ascii: await createTextureMaterial(doc, "MAT_IDENTITY_ASCII_DARK", source.identity.ascii.path),
    compactReverse: await createTextureMaterial(doc, "MAT_IDENTITY_COMPACT_REVERSE", source.identity.compactReverse.path)
  };

  const groups = Object.fromEntries(Object.keys(materials).map((name) => [name, new GeometryGroup(name)]));

  // Open Norelco display case and insert, arranged left of the cassette with no intersections.
  const caseX = mm(-65);
  const caseY = mm(35);
  const caseLidY = mm(105);
  const caseHingeY = mm(70);
  const caseZ = mm(-10);
  // Lower 109 x 70 mm tray.
  addBox(groups.clearPanel, [caseX, caseY, caseZ], [mm(109), mm(70), mm(2)]);
  addBox(groups.clearEdge, [caseX, mm(0.9), caseZ + mm(2)], [mm(109), mm(1.8), mm(17)]);
  addBox(groups.clearEdge, [caseX, mm(69.1), caseZ + mm(2)], [mm(109), mm(1.8), mm(17)]);
  addBox(groups.clearEdge, [mm(-118.6), caseY, caseZ + mm(2)], [mm(1.8), mm(70), mm(17)]);
  addBox(groups.clearEdge, [mm(-11.4), caseY, caseZ + mm(2)], [mm(1.8), mm(70), mm(17)]);
  for (const [x, y] of [[-95, 45], [-35, 45], [-65, 18]]) {
    addCylinderZ(groups.clearEdge, [mm(x), mm(y), mm(-5)], mm(2.4), mm(8), 20);
  }
  // Upper 109 x 70 mm lid and insert, joined edge-to-edge at the full-width hinge.
  addBox(groups.clearPanel, [caseX, caseLidY, caseZ], [mm(109), mm(70), mm(2)]);
  addBox(groups.clearEdge, [caseX, mm(70.9), caseZ + mm(2)], [mm(109), mm(1.8), mm(17)]);
  addBox(groups.clearEdge, [caseX, mm(139.1), caseZ + mm(2)], [mm(109), mm(1.8), mm(17)]);
  addBox(groups.clearEdge, [mm(-118.6), caseLidY, caseZ + mm(2)], [mm(1.8), mm(70), mm(17)]);
  addBox(groups.clearEdge, [mm(-11.4), caseLidY, caseZ + mm(2)], [mm(1.8), mm(70), mm(17)]);
  addBox(groups.clearEdge, [caseX, caseHingeY, caseZ + mm(2)], [mm(109), mm(2), mm(17)]);
  for (const x of [-105, -85, -65, -45, -25]) addBox(groups.clearEdge, [mm(x), caseHingeY, mm(-1.5)], [mm(14), mm(2.4), mm(4)]);
  // Insert and governed marks remain authored in upper-half-local coordinates.
  addBox(groups.bone, [caseX, caseY, mm(-7.8)], [mm(98), mm(58), mm(0.45)]);
  addFrontQuad(groups.ascii, [...source.registration.asciiJCard.centreMm.map(mm), mm(-7.5)], source.registration.asciiJCard.surfaceMm.map(mm), {flipV: true});
  addFrontQuad(groups.signalRed, [...source.registration.signalRuleJCard.centreMm.map(mm), mm(-7.49)], source.registration.signalRuleJCard.surfaceMm.map(mm));

  // Nominal compact cassette shell, centred on its own local origin at X=45 mm.
  const shellX = mm(45);
  addBox(groups.smoke, [shellX, mm(31.9), 0], [mm(100.4), mm(63.8), mm(12)]);
  // Moulded top/bottom rails give the transparent silhouette a manufactured read.
  addBox(groups.smoke, [shellX, mm(61.7), mm(0.3)], [mm(94), mm(1.6), mm(12.4)]);
  addBox(groups.smoke, [shellX, mm(2.1), mm(0.3)], [mm(94), mm(1.6), mm(12.4)]);
  addBox(groups.smoke, [mm(-3.6), mm(31.9), mm(0.3)], [mm(1.6), mm(56), mm(12.4)]);
  addBox(groups.smoke, [mm(93.6), mm(31.9), mm(0.3)], [mm(1.6), mm(56), mm(12.4)]);
  // Moulded front recesses: a clear central window frame and lower trapezoid transport panel.
  addBox(groups.smoke, [mm(36.6), mm(37), mm(6.5)], [mm(1.2), mm(16), mm(0.8)]);
  addBox(groups.smoke, [mm(53.4), mm(37), mm(6.5)], [mm(1.2), mm(16), mm(0.8)]);
  addBox(groups.smoke, [mm(45), mm(29.6), mm(6.5)], [mm(18), mm(1.2), mm(0.8)]);
  addBox(groups.smoke, [mm(45), mm(44.4), mm(6.5)], [mm(18), mm(1.2), mm(0.8)]);
  addBox(groups.smoke, [mm(45), mm(37), mm(5.65)], [mm(72), mm(28), mm(0.7)]);
  addTrapezoidPrism(groups.smoke, [mm(45), mm(14), mm(6.4)], [mm(50), mm(38), mm(16), mm(1.2)]);

  const hubCentres = [[mm(24), mm(37)], [mm(66), mm(37)]];
  for (const [x, y] of hubCentres) {
    addCylinderZ(groups.tape, [x, y, mm(4.5)], mm(13.2), mm(1.6), 32, mm(8));
    addCylinderZ(groups.black, [x, y, mm(5.6)], mm(8), mm(2), 20, mm(3.2));
    addCylinderZ(groups.black, [x, y, mm(5.9)], mm(3), mm(1.4), 16, mm(1.7));
    addCylinderZ(groups.clearEdge, [x, y, mm(6.9)], mm(9.2), mm(0.8), 32, mm(5.5));
    for (let tooth = 0; tooth < 8; tooth += 1) {
      const angle = tooth / 8 * Math.PI * 2;
      addBox(groups.felt, [x + Math.cos(angle) * mm(8.3), y + Math.sin(angle) * mm(8.3), mm(6.2)], [mm(1.8), mm(1.8), mm(1)]);
    }
  }

  const screwCentres = [
    [mm(2), mm(57)], [mm(88), mm(57)], [mm(2), mm(7)], [mm(88), mm(7)], [mm(45), mm(6.5)]
  ];
  for (const [x, y] of screwCentres) {
    addCylinderZ(groups.black, [x, y, mm(6.5)], mm(1.45), mm(0.8), 12);
    addBox(groups.felt, [x, y, mm(6.96)], [mm(2), mm(0.35), mm(0.12)]);
    addBox(groups.felt, [x, y, mm(6.96)], [mm(0.35), mm(2), mm(0.12)]);
  }

  const rollerCentres = [[mm(10), mm(13)], [mm(80), mm(13)]];
  for (const [x, y] of rollerCentres) addCylinderZ(groups.black, [x, y, mm(6.2)], mm(3.1), mm(1.6), 16, mm(1));
  for (const x of [31, 39, 51, 59]) addCylinderZ(groups.black, [mm(x), mm(9.5), mm(7.4)], mm(1.7), mm(0.6), 16);
  for (const x of [20, 70]) addCylinderZ(groups.black, [mm(x), mm(9.5), mm(7.4)], mm(2.4), mm(0.6), 20);
  addBox(groups.felt, [mm(45), mm(11.2), mm(6.45)], [mm(8), mm(4), mm(1.2)]);
  addBox(groups.black, [mm(45), mm(9), mm(5.8)], [mm(12), mm(0.7), mm(0.8)]);

  const tapeRoute = [
    [mm(18), mm(28)], [mm(13), mm(20)], [mm(10), mm(13)], [mm(27), mm(11.2)],
    [mm(45), mm(11.2)], [mm(63), mm(11.2)], [mm(80), mm(13)], [mm(77), mm(20)], [mm(72), mm(28)]
  ];
  addRibbon(groups.tape, tapeRoute, mm(1.6), mm(7.1));

  // Exact governed identity raster, overlaid without warping on the shell front.
  for (const y of [53.5, 56.5]) {
    for (let x = 3; x <= 87; x += 4) addCylinderZ(groups.clearEdge, [mm(x), mm(y), mm(6.65)], mm(0.35), mm(0.35), 8);
  }

  addFrontQuad(groups.compactReverse, [...source.registration.compactReverseShell.centreMm.map(mm), mm(6.35)], source.registration.compactReverseShell.surfaceMm.map(mm), {flipV: true});

  const mesh = doc.createMesh("Cassette_002_Physical_Geometry");
  const upperCaseMesh = doc.createMesh("Cassette_002_Upper_Case_Insert");
  const upperCaseMaterials = new Set(["bone", "signalRed", "ascii"]);
  for (const [name, group] of Object.entries(groups)) {
    assert.ok(group.indices.length > 0, `${name} geometry must not be empty`);
    const position = doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(group.positions)).setBuffer(buffer);
    const normal = doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(group.normals)).setBuffer(buffer);
    const uv = doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(group.uvs)).setBuffer(buffer);
    const indices = doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint32Array(group.indices)).setBuffer(buffer);
    const primitive = doc.createPrimitive()
      .setAttribute("POSITION", position)
      .setAttribute("NORMAL", normal)
      .setAttribute("TEXCOORD_0", uv)
      .setIndices(indices)
      .setMaterial(materials[name])
      .setExtras({role: name});
    (upperCaseMaterials.has(name) ? upperCaseMesh : mesh).addPrimitive(primitive);
  }
  assembly.addChild(doc.createNode("Cassette_002_Display_Geometry").setMesh(mesh));
  const upperCaseNode = doc.createNode("Cassette_002_Upper_Case_Coordinates")
    .setTranslation([0, mm(70), 0])
    .setExtras({coordinateSpace: "upper-case-local-mm", hingeYmm: 70})
    .setMesh(upperCaseMesh);
  assembly.addChild(upperCaseNode);

  const unoptimized = inspect(doc);
  await doc.transform(dedup(), prune({keepExtras: true}));

  addAnchor(doc, assembly, "Case_Base", [caseX, caseY, caseZ], {nominalDimensionsMm: source.dimensionsMm.case, authority: source.dimensionsAuthority.status});
  addAnchor(doc, assembly, "Case_Open_Lid", [caseX, caseLidY, caseZ], {state: "open", fullHalf: true, intersectsCassette: false});
  addAnchor(doc, assembly, "Case_Hinge", [caseX, caseHingeY, caseZ + mm(2)], {continuous: true, joins: ["Case_Base", "Case_Open_Lid"]});
  addAnchor(doc, assembly, "J_Card_Bone", [caseX, caseLidY, mm(-7.8)], {material: "MAT_PAPER_BONE"});
  addAnchor(doc, assembly, "Cassette_Shell", [shellX, mm(31.9), 0], {nominalDimensionsMm: source.dimensionsMm.cassette, authority: source.dimensionsAuthority.status});
  screwCentres.forEach(([x, y], index) => addAnchor(doc, assembly, `Screw_${String(index + 1).padStart(2, "0")}`, [x, y, mm(6.5)], {part: "screw"}));
  hubCentres.forEach(([x, y], index) => {
    const side = index === 0 ? "Left" : "Right";
    addAnchor(doc, assembly, `Hub_${side}`, [x, y, mm(5.6)], {part: "hub"});
    addAnchor(doc, assembly, `Spindle_${side}`, [x, y, mm(5.9)], {part: "spindle"});
  });
  rollerCentres.forEach(([x, y], index) => addAnchor(doc, assembly, `Guide_Roller_${index === 0 ? "Left" : "Right"}`, [x, y, mm(6.2)], {part: "guide-roller"}));
  addAnchor(doc, assembly, "Pressure_Pad", [mm(45), mm(11.2), mm(6.45)], {part: "pressure-pad", touchesTapeInProjection: true});
  addAnchor(doc, assembly, "Tape_Path", [mm(45), mm(11.2), mm(7.1)], {part: "tape-path", continuous: true, orderedRoute: ["left-reel", "left-guide", "pressure-pad", "right-guide", "right-reel"]});
  addAnchor(doc, assembly, "Empty_Window", [mm(45), mm(37), mm(6.2)], {part: "empty-window", betweenHubs: true, containsGeometry: false});
  addAnchor(doc, upperCaseNode, "Identity_ASCII_JCard", [...source.registration.asciiJCard.centreMm.map(mm), mm(-7.5)], {sha256: source.identity.ascii.sha256, registrationKey: "asciiJCard"});
  addAnchor(doc, upperCaseNode, "Signal_Rule_JCard", [...source.registration.signalRuleJCard.centreMm.map(mm), mm(-7.49)], {registrationKey: "signalRuleJCard", governedPlacement: "open.signalRule"});
  addAnchor(doc, assembly, "Identity_Compact_Reverse_Shell", [...source.registration.compactReverseShell.centreMm.map(mm), mm(6.35)], {sha256: source.identity.compactReverse.sha256, registrationKey: "compactReverseShell"});

  return {doc, unoptimized, optimized: inspect(doc)};
};

const componentMeasurements = (primitive, epsilon = 1e-7) => {
  const position = primitive.getAttribute("POSITION");
  const positions = position.getArray();
  const indices = primitive.getIndices().getArray();
  const vertexToCanonical = [];
  const canonicalByPosition = new Map();
  const points = [];
  for (let vertex = 0; vertex < position.getCount(); vertex += 1) {
    const point = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
    const key = point.map((value) => Math.round(value / epsilon)).join(":");
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
      pointsMm: members.map((member) => points[member].map((value) => value * 1000)),
      vertices: members.length
    });
  }
  return components;
};

const near = (actual, expected, tolerance = 0.03) => Math.abs(actual - expected) <= tolerance;
const matchesSize = (component, expected, tolerance = 0.03) => expected.every((value, axis) => near(component.sizeMm[axis], value, tolerance));
const overlapsWindow = (component, window) => component.maxMm.every((value, axis) => value >= window.minMm[axis]) && component.minMm.every((value, axis) => value <= window.maxMm[axis]);
const nearestXyDistance = (component, [x, y]) => Math.min(...component.pointsMm.map((point) => Math.hypot(point[0] - x, point[1] - y)));
const roundedVector = (values) => values.map((value) => Number(value.toFixed(4)));

const deriveMetrics = (doc) => {
  let triangles = 0;
  let drawCalls = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const vertices = primitive.getAttribute("POSITION");
      triangles += (indices ? indices.getCount() : vertices.getCount()) / 3;
      drawCalls += 1;
    }
  }
  const primitives = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const byMaterial = (name) => {
    const primitive = primitives.find((entry) => entry.getMaterial()?.getName() === name);
    assert.ok(primitive, `${name} primitive missing`);
    return primitive;
  };
  const hardware = componentMeasurements(byMaterial("MAT_BLACK_HARDWARE"));
  const felt = componentMeasurements(byMaterial("MAT_PRESSURE_FELT"));
  const tape = componentMeasurements(byMaterial("MAT_MAGNETIC_TAPE"));
  const identity = ["MAT_IDENTITY_ASCII_DARK", "MAT_IDENTITY_COMPACT_REVERSE"].flatMap((name) => componentMeasurements(byMaterial(name)));
  const screws = hardware.filter((component) => matchesSize(component, [2.9, 2.9, 0.8]));
  const hubs = hardware.filter((component) => matchesSize(component, [16, 16, 2]));
  const spindles = hardware.filter((component) => matchesSize(component, [6, 6, 1.4]));
  const rollers = hardware.filter((component) => matchesSize(component, [6.2, 6.2, 1.6]));
  const pressurePads = felt.filter((component) => matchesSize(component, [8, 4, 1.2]));
  const ribbons = tape.filter((component) => component.sizeMm[0] > 60 && component.sizeMm[1] < 25 && component.sizeMm[2] < 0.01);
  const ribbon = ribbons.length === 1 ? ribbons[0] : null;
  const landmarks = {leftGuide: [10, 13], pressurePad: [45, 11.2], rightGuide: [80, 13]};
  const landmarkDistanceMm = Object.fromEntries(Object.entries(landmarks).map(([key, point]) => [key, ribbon ? nearestXyDistance(ribbon, point) : Infinity]));
  const emptyWindow = {minMm: [37.5, 30, 6], maxMm: [52.5, 44, 8]};
  const emptyWindowClear = ![...hardware, ...identity].some((component) => overlapsWindow(component, emptyWindow));
  return {
    triangles,
    drawCalls,
    mechanics: {
      evidence: "reopened-glb-topology-spatial",
      componentCounts: {hardware: hardware.length, feltAndScrewHighlights: felt.length, tape: tape.length},
      screws: screws.length,
      hubs: hubs.length,
      guideRollers: rollers.length,
      spindles: spindles.length,
      continuousTapePath: Boolean(ribbon) && Object.values(landmarkDistanceMm).every((distance) => distance <= 1),
      pressurePad: pressurePads.length === 1,
      emptyWindowBetweenHubs: emptyWindowClear,
      measurements: {
        screwCentresMm: screws.map((component) => roundedVector(component.centreMm)),
        hubCentresMm: hubs.map((component) => roundedVector(component.centreMm)),
        spindleCentresMm: spindles.map((component) => roundedVector(component.centreMm)),
        guideRollerCentresMm: rollers.map((component) => roundedVector(component.centreMm)),
        pressurePadBoundsMm: pressurePads.length === 1 ? {min: roundedVector(pressurePads[0].minMm), max: roundedVector(pressurePads[0].maxMm)} : null,
        tapeRibbonBoundsMm: ribbon ? {min: roundedVector(ribbon.minMm), max: roundedVector(ribbon.maxMm)} : null,
        tapeLandmarkDistanceMm: Object.fromEntries(Object.entries(landmarkDistanceMm).map(([key, value]) => [key, Number(value.toFixed(4))])),
        emptyWindowMm: emptyWindow
      }
    }
  };
};

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

const deriveRegistration = (doc, source) => {
  const meshNodes = doc.getRoot().listNodes().filter((node) => node.getMesh());
  const assembly = doc.getRoot().listNodes().find((node) => node.getName() === "Cassette_002_Centred_Pivot");
  assert.ok(assembly, "centred cassette assembly missing");
  const assemblyTranslationMm = assembly.getWorldTranslation().slice(0, 2).map((value) => value * 1000);
  const entries = Object.entries(source.registration).map(([key, target]) => {
    const meshNode = meshNodes.find((node) => node.getMesh().listPrimitives().some((entry) => entry.getMaterial()?.getName() === target.material));
    assert.ok(meshNode, `${key} coordinate node missing`);
    const primitive = meshNode.getMesh().listPrimitives().find((entry) => entry.getMaterial()?.getName() === target.material);
    assert.ok(primitive, `${key} material primitive missing`);
    const position = boundsForAccessor(primitive.getAttribute("POSITION"));
    const uvAccessor = primitive.getAttribute("TEXCOORD_0");
    assert.equal(Boolean(uvAccessor), Boolean(target.uvRequired), `${key} UV authority mismatch`);
    const actualCentreMm = position.centre.slice(0, 2).map((value) => value * 1000);
    const actualSizeMm = position.size.slice(0, 2).map((value) => value * 1000);
    const actualWorldCentreMm = transformPoint(position.centre, meshNode.getWorldMatrix()).slice(0, 2).map((value) => value * 1000);
    const dimensionErrors = target.surfaceMm.map((value, index) => Math.abs(actualSizeMm[index] - value) / value * 100);
    const centreScale = Math.max(...target.surfaceMm);
    const centreErrors = target.centreMm.map((value, index) => Math.abs(actualCentreMm[index] - value) / centreScale * 100);
    const uvBounds = uvAccessor ? (() => {
      const uv = boundsForAccessor(uvAccessor);
      return [...uv.min, ...uv.max];
    })() : null;
    const uvError = uvBounds ? Math.max(...uvBounds.map((value, index) => Math.abs(value - [0, 0, 1, 1][index]) * 100)) : 0;
    return {
      key,
      material: target.material,
      coordinateSpace: target.coordinateSpace,
      coordinateNode: meshNode.getName(),
      coordinateTranslationMm: meshNode.getWorldTranslation().slice(0, 2).map((value) => value * 1000),
      targetCentreMm: target.centreMm,
      actualCentreMm,
      actualWorldCentreMm,
      assemblyTranslationMm,
      targetSizeMm: target.surfaceMm,
      actualSizeMm,
      uvBounds,
      maxErrorPercent: Math.max(...dimensionErrors, ...centreErrors, uvError)
    };
  });
  return {maxErrorPercent: Math.max(...entries.map((entry) => entry.maxErrorPercent)), entries};
};

const verifyIdentity = async (source) => {
  const records = {};
  for (const [key, entry] of Object.entries(source.identity)) {
    const bytes = await readFile(path.join(here, entry.path));
    const actual = sha256(bytes);
    assert.equal(actual, entry.sha256, `${key} identity hash drift`);
    records[key] = {path: entry.path, sha256: actual, bytes: bytes.byteLength};
  }
  return records;
};

const verifyAuthorityFixtures = async (source) => {
  const records = {};
  for (const [key, entry] of Object.entries(source.canonicalSource)) {
    const bytes = await readFile(path.join(here, entry.fixturePath));
    const actual = sha256(bytes);
    assert.equal(actual, entry.fixtureSha256, `${key} authority fixture hash drift`);
    const fixture = JSON.parse(bytes);
    assert.equal(fixture.authorityType, "governed-minimal-copy", `${key} authority fixture type drift`);
    assert.equal(fixture.canonicalPath, entry.path, `${key} canonical path drift`);
    assert.equal(fixture.canonicalSha256, entry.sha256, `${key} canonical SHA drift`);
    records[key] = {
      fixturePath: entry.fixturePath,
      fixtureSha256: actual,
      canonicalPath: fixture.canonicalPath,
      canonicalSha256: fixture.canonicalSha256
    };
  }
  return records;
};

const validationSummary = (validation) => ({
  errors: validation.issues.numErrors,
  warnings: validation.issues.numWarnings,
  infos: validation.issues.numInfos,
  hints: validation.issues.numHints
});

const buildArtifact = async () => {
  const source = await readJson(sourcePath);
  const [identity, authorityIntegrity] = await Promise.all([verifyIdentity(source), verifyAuthorityFixtures(source)]);
  const io = new NodeIO();
  const first = await buildDocument(source);
  const bytes = Buffer.from(await io.writeBinary(first.doc));
  const reopened = await io.readBinary(bytes);
  const metrics = deriveMetrics(reopened);
  const validation = await validateBytes(new Uint8Array(bytes), {
    uri: "cassette-002.glb",
    format: "glb",
    writeTimestamp: false,
    maxIssues: 100
  });
  const registration = deriveRegistration(reopened, source);
  const summary = validationSummary(validation);
  assert.equal(summary.errors, 0, "Khronos validator errors");
  assert.equal(summary.warnings, 0, "Khronos validator warnings");
  assert.equal(metrics.mechanics.evidence, "reopened-glb-topology-spatial");
  assert.deepEqual(metrics.mechanics.componentCounts, {hardware: 18, feltAndScrewHighlights: 27, tape: 3});
  assert.equal(metrics.mechanics.screws, 5);
  assert.equal(metrics.mechanics.hubs, 2);
  assert.equal(metrics.mechanics.guideRollers, 2);
  assert.equal(metrics.mechanics.spindles, 2);
  assert.equal(metrics.mechanics.continuousTapePath, true);
  assert.equal(metrics.mechanics.pressurePad, true);
  assert.equal(metrics.mechanics.emptyWindowBetweenHubs, true);
  assert.ok(registration.maxErrorPercent <= 1, "identity registration exceeds 1%");
  assert.ok(bytes.byteLength <= source.budgets.maxBytes, "GLB byte hard ceiling exceeded");
  assert.ok(metrics.triangles <= source.budgets.maxTriangles, "triangle hard ceiling exceeded");
  assert.ok(metrics.drawCalls <= source.budgets.maxDrawCalls, "draw-call hard ceiling exceeded");

  const report = {
    schemaVersion: 1,
    assetKey: source.assetKey,
    sourceIntegrity: identity,
    authorityIntegrity,
    dimensionsAuthority: source.dimensionsAuthority,
    coordinates: source.coordinateSystem,
    camera: source.camera,
    validation: summary,
    mechanics: metrics.mechanics,
    registration,
    budget: {
      bytes: bytes.byteLength,
      triangles: metrics.triangles,
      drawCalls: metrics.drawCalls,
      ceilings: {bytes: source.budgets.maxBytes, triangles: source.budgets.maxTriangles, drawCalls: source.budgets.maxDrawCalls}
    },
    output: {path: "assets/merch-3d/cassette-002.glb", sha256: sha256(bytes)},
    deterministic: {verifiedBySecondInMemoryBuild: false},
    inspection: {
      unoptimized: "tools/merch-3d/reports/cassette-002.inspect-unoptimized.json",
      optimized: "tools/merch-3d/reports/cassette-002.inspect-optimized.json",
      browserQa: "tools/merch-3d/reports/cassette-002.browser-qa.json"
    }
  };
  return {source, bytes, report, validation, unoptimized: first.unoptimized, optimized: first.optimized};
};

const main = async () => {
  const artifact = await buildArtifact();
  const second = await buildArtifact();
  assert.equal(sha256(artifact.bytes), sha256(second.bytes), "cassette build is not byte-deterministic");
  artifact.report.deterministic.verifiedBySecondInMemoryBuild = true;

  if (verifyOnly) {
    const [existingBytes, existingReport] = await Promise.all([readFile(outputPath), readJson(reportPath)]);
    assert.equal(sha256(existingBytes), sha256(artifact.bytes), "checked-in GLB is stale");
    assert.deepEqual(existingReport, artifact.report, "checked-in report is stale");
    const existingSize = await stat(outputPath);
    assert.equal(existingSize.size, artifact.report.budget.bytes, "checked-in GLB byte report mismatch");
    process.stdout.write(`verified ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
    return;
  }

  await Promise.all([
    writeFile(outputPath, artifact.bytes),
    writeFile(reportPath, stableJson(artifact.report)),
    writeFile(validatorPath, stableJson(artifact.validation)),
    writeFile(unoptimizedInspectPath, stableJson(artifact.unoptimized)),
    writeFile(optimizedInspectPath, stableJson(artifact.optimized))
  ]);
  process.stdout.write(`built ${artifact.report.output.sha256} (${artifact.report.budget.bytes} bytes, ${artifact.report.budget.triangles} triangles, ${artifact.report.budget.drawCalls} draw calls)\n`);
};

await main();
