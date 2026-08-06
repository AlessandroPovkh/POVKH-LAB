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
const toolsRoot = path.resolve(here, "..");
const siteRoot = path.resolve(toolsRoot, "../..");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

  triangle(points, normals, uvs = [[0, 0], [1, 0], [0.5, 1]]) {
    const vertices = points.map((point, index) => this.vertex(point, Array.isArray(normals[0]) ? normals[index] : normals, uvs[index]));
    this.indices.push(...vertices);
  }

  quad(points, normal, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const vertices = points.map((point, index) => this.vertex(point, normal, uvs[index]));
    this.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
  }
}

const normalise = ([x, y, z]) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

const extrudePolygonZ = (points, depth) => {
  const geometry = new Geometry();
  const zFront = depth / 2;
  const zBack = -depth / 2;
  const centre = points.reduce((result, point) => [result[0] + point[0] / points.length, result[1] + point[1] / points.length], [0, 0]);
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const a = points[index];
    const b = points[next];
    geometry.triangle([[...centre, zFront], [...a, zFront], [...b, zFront]], [0, 0, 1]);
    geometry.triangle([[...centre, zBack], [...b, zBack], [...a, zBack]], [0, 0, -1]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const sideNormal = normalise([dy, -dx, 0]);
    geometry.quad([[...a, zBack], [...b, zBack], [...b, zFront], [...a, zFront]], sideNormal);
  }
  return geometry;
};

const mirrorPolygonX = (points) => points.map(([x, y]) => [-x, y]).reverse();

const loftedEllipticalBody = (rings, segments = 24) => {
  const geometry = new Geometry();
  const point = (ring, angle) => [
    ring.centreX + Math.cos(angle) * ring.halfWidth,
    ring.y,
    ring.centreZ + Math.sin(angle) * ring.halfDepth
  ];
  const pointNormal = (ring, angle) => normalise([
    Math.cos(angle) / ring.halfWidth,
    0,
    Math.sin(angle) / ring.halfDepth
  ]);
  for (let row = 0; row < rings.length - 1; row += 1) {
    const lower = rings[row];
    const upper = rings[row + 1];
    for (let column = 0; column < segments; column += 1) {
      const a0 = column / segments * Math.PI * 2;
      const a1 = (column + 1) / segments * Math.PI * 2;
      const points = [point(lower, a0), point(upper, a0), point(upper, a1), point(lower, a1)];
      const normals = [pointNormal(lower, a0), pointNormal(upper, a0), pointNormal(upper, a1), pointNormal(lower, a1)];
      const vertices = points.map((entry, index) => geometry.vertex(entry, normals[index], [[0, 0], [0, 1], [1, 1], [1, 0]][index]));
      geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
    }
  }
  const bottom = rings[0];
  const top = rings.at(-1);
  for (let column = 0; column < segments; column += 1) {
    const a0 = column / segments * Math.PI * 2;
    const a1 = (column + 1) / segments * Math.PI * 2;
    geometry.triangle([[bottom.centreX, bottom.y, bottom.centreZ], point(bottom, a0), point(bottom, a1)], [0, -1, 0]);
    geometry.triangle([[top.centreX, top.y, top.centreZ], point(top, a1), point(top, a0)], [0, 1, 0]);
  }
  return geometry;
};

const taperedTubeBetween = ({ start, end, startRadius, endRadius, startDepth, endDepth, segments = 20 }) => {
  const geometry = new Geometry();
  const direction = [end[0] - start[0], end[1] - start[1]];
  const length = Math.hypot(...direction);
  const perpendicular = [-direction[1] / length, direction[0] / length];
  const point = (centre, radius, depth, angle) => [
    centre[0] + perpendicular[0] * radius * Math.cos(angle),
    centre[1] + perpendicular[1] * radius * Math.cos(angle),
    depth * Math.sin(angle)
  ];
  const pointNormal = (angle) => normalise([perpendicular[0] * Math.cos(angle), perpendicular[1] * Math.cos(angle), Math.sin(angle)]);
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const points = [point(start, startRadius, startDepth, a0), point(start, startRadius, startDepth, a1), point(end, endRadius, endDepth, a1), point(end, endRadius, endDepth, a0)];
    const normals = [pointNormal(a0), pointNormal(a1), pointNormal(a1), pointNormal(a0)];
    const vertices = points.map((entry, pointIndex) => geometry.vertex(entry, normals[pointIndex], [[0, 0], [1, 0], [1, 1], [0, 1]][pointIndex]));
    geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
  }
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    geometry.triangle([[...start, 0], point(start, startRadius, startDepth, a1), point(start, startRadius, startDepth, a0)], normalise([-direction[0], -direction[1], 0]));
    geometry.triangle([[...end, 0], point(end, endRadius, endDepth, a0), point(end, endRadius, endDepth, a1)], normalise([direction[0], direction[1], 0]));
  }
  return geometry;
};

const loftedTubeAlongPath = (rings, { segments = 28, capStart = true, capEnd = true } = {}) => {
  const geometry = new Geometry();
  const frames = rings.map((ring, index) => {
    const previous = rings[Math.max(0, index - 1)].centre;
    const next = rings[Math.min(rings.length - 1, index + 1)].centre;
    const tangent = normalise([next[0] - previous[0], next[1] - previous[1], 0]);
    return { ...ring, tangent, perpendicular: [-tangent[1], tangent[0]] };
  });
  const point = (frame, angle) => [
    frame.centre[0] + frame.perpendicular[0] * frame.radius * Math.cos(angle),
    frame.centre[1] + frame.perpendicular[1] * frame.radius * Math.cos(angle),
    frame.depth * Math.sin(angle)
  ];
  const pointNormal = (frame, angle) => normalise([
    frame.perpendicular[0] * Math.cos(angle),
    frame.perpendicular[1] * Math.cos(angle),
    Math.sin(angle)
  ]);
  for (let row = 0; row < frames.length - 1; row += 1) {
    const start = frames[row];
    const end = frames[row + 1];
    for (let index = 0; index < segments; index += 1) {
      const a0 = index / segments * Math.PI * 2;
      const a1 = (index + 1) / segments * Math.PI * 2;
      const points = [point(start, a0), point(start, a1), point(end, a1), point(end, a0)];
      const normals = [pointNormal(start, a0), pointNormal(start, a1), pointNormal(end, a1), pointNormal(end, a0)];
      const vertices = points.map((entry, pointIndex) => geometry.vertex(entry, normals[pointIndex], [[0, 0], [1, 0], [1, 1], [0, 1]][pointIndex]));
      geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
    }
  }
  const start = frames[0];
  const end = frames.at(-1);
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    if (capStart) geometry.triangle([[...start.centre, 0], point(start, a1), point(start, a0)], start.tangent.map((value) => -value));
    if (capEnd) geometry.triangle([[...end.centre, 0], point(end, a0), point(end, a1)], end.tangent);
  }
  return geometry;
};

const smoothSleeveRings = ({ start, control, end, startRadius, endRadius, radiusBulge, startDepth, endDepth, samples }) => Array.from({ length: samples }, (_, index) => {
  const t = index / (samples - 1);
  const inverse = 1 - t;
  return {
    centre: [
      inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
      inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1]
    ],
    radius: startRadius + (endRadius - startRadius) * t + radiusBulge * Math.sin(Math.PI * t),
    depth: startDepth + (endDepth - startDepth) * t
  };
});

const hoodRearSeam = (rings, { width = 0.006, offset = 0.0015 } = {}) => {
  const geometry = new Geometry();
  const point = (ring, x) => [x, ring.y, ring.centreZ - ring.halfDepth - offset];
  for (let index = 0; index < rings.length - 1; index += 1) {
    const lower = rings[index];
    const upper = rings[index + 1];
    geometry.quad([
      point(lower, width / 2), point(lower, -width / 2),
      point(upper, -width / 2), point(upper, width / 2)
    ], [0, 0, -1]);
  }
  return geometry;
};

const curvedArtworkSurface = ({ centre, size, bodyHalfWidth, bodyHalfDepth, side, surfaceOffset = 0.0015, widthSegments = 12, heightSegments = 4 }) => {
  const geometry = new Geometry();
  const [cx, cy] = centre;
  const [width, height] = size;
  const sideSign = side === "back" ? -1 : 1;
  const point = (column, row) => {
    const u = column / widthSegments;
    const v = row / heightSegments;
    const x = cx - width / 2 + width * u;
    const ellipse = Math.sqrt(Math.max(0, 1 - (x / bodyHalfWidth) ** 2));
    return {
      position: [x, cy - height / 2 + height * v, sideSign * (bodyHalfDepth * ellipse + surfaceOffset)],
      normal: normalise([x / bodyHalfWidth ** 2, 0, sideSign * ellipse / bodyHalfDepth]),
      uv: [side === "back" ? 1 - u : u, 1 - v]
    };
  };
  for (let row = 0; row < heightSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const corners = side === "back"
        ? [point(column + 1, row), point(column, row), point(column, row + 1), point(column + 1, row + 1)]
        : [point(column, row), point(column + 1, row), point(column + 1, row + 1), point(column, row + 1)];
      const vertices = corners.map((corner) => geometry.vertex(corner.position, corner.normal, corner.uv));
      geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
    }
  }
  return geometry;
};

const boxGeometry = ([cx, cy, cz], [sx, sy, sz]) => {
  const geometry = new Geometry();
  const x0 = cx - sx / 2; const x1 = cx + sx / 2;
  const y0 = cy - sy / 2; const y1 = cy + sy / 2;
  const z0 = cz - sz / 2; const z1 = cz + sz / 2;
  geometry.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
  geometry.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
  geometry.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
  geometry.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
  geometry.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
  geometry.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  return geometry;
};

const planeZ = ({ centre, size, side }) => {
  const geometry = new Geometry();
  const [cx, cy, z] = centre;
  const [width, height] = size;
  const left = cx - width / 2; const right = cx + width / 2;
  const bottom = cy - height / 2; const top = cy + height / 2;
  if (side === "back") {
    geometry.quad([[right, bottom, z], [left, bottom, z], [left, top, z], [right, top, z]], [0, 0, -1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  } else {
    geometry.quad([[left, bottom, z], [right, bottom, z], [right, top, z], [left, top, z]], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  }
  return geometry;
};

const ellipticalRingZ = ({ centre, outer, inner, depth, segments = 32 }) => {
  const geometry = new Geometry();
  const [cx, cy, cz] = centre;
  const z0 = cz - depth / 2;
  const z1 = cz + depth / 2;
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const outer0 = [cx + Math.cos(a0) * outer[0], cy + Math.sin(a0) * outer[1]];
    const outer1 = [cx + Math.cos(a1) * outer[0], cy + Math.sin(a1) * outer[1]];
    const inner0 = [cx + Math.cos(a0) * inner[0], cy + Math.sin(a0) * inner[1]];
    const inner1 = [cx + Math.cos(a1) * inner[0], cy + Math.sin(a1) * inner[1]];
    geometry.quad([[...outer0, z1], [...outer1, z1], [...inner1, z1], [...inner0, z1]], [0, 0, 1]);
    geometry.quad([[...outer1, z0], [...outer0, z0], [...inner0, z0], [...inner1, z0]], [0, 0, -1]);
    geometry.quad([[...outer0, z0], [...outer1, z0], [...outer1, z1], [...outer0, z1]], normalise([Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0]));
    geometry.quad([[...inner1, z0], [...inner0, z0], [...inner0, z1], [...inner1, z1]], normalise([-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0]));
  }
  return geometry;
};

const ellipsePlaneZ = ({ centre, radii, side = "front", segments = 32 }) => {
  const geometry = new Geometry();
  const [cx, cy, z] = centre;
  const normal = side === "back" ? [0, 0, -1] : [0, 0, 1];
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radii[0], cy + Math.sin(a0) * radii[1], z];
    const p1 = [cx + Math.cos(a1) * radii[0], cy + Math.sin(a1) * radii[1], z];
    geometry.triangle(side === "back" ? [[cx, cy, z], p1, p0] : [[cx, cy, z], p0, p1], normal);
  }
  return geometry;
};

const cylinderY = ({ centre, radius, height, segments = 24 }) => {
  const geometry = new Geometry();
  const [cx, cy, cz] = centre;
  const y0 = cy - height / 2;
  const y1 = cy + height / 2;
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radius, cz + Math.sin(a0) * radius];
    const p1 = [cx + Math.cos(a1) * radius, cz + Math.sin(a1) * radius];
    const normal = normalise([Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    geometry.quad([[p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [p1[0], y0, p1[1]]], normal);
    geometry.triangle([[cx, y1, cz], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]], [0, 1, 0]);
    geometry.triangle([[cx, y0, cz], [p0[0], y0, p0[1]], [p1[0], y0, p1[1]]], [0, -1, 0]);
  }
  return geometry;
};

const crownPanel = (panelIndex, { panels = 6, azimuthSegments = 7, verticalSegments = 8 } = {}) => {
  const geometry = new Geometry();
  const radiusX = 0.125;
  const radiusZ = 0.120;
  const baseY = 0.055;
  const height = 0.205;
  const start = -Math.PI / panels + panelIndex * Math.PI * 2 / panels;
  const end = start + Math.PI * 2 / panels;
  const point = (azimuth, elevation) => {
    const radial = Math.cos(elevation) ** 0.62;
    return [radiusX * Math.sin(azimuth) * radial, baseY + height * Math.sin(elevation), radiusZ * Math.cos(azimuth) * radial];
  };
  const pointNormal = ([x, y, z]) => normalise([x / radiusX ** 2, (y - baseY) / height ** 2, z / radiusZ ** 2]);
  const topElevation = Math.PI / 2 * 0.94;
  for (let row = 0; row < verticalSegments; row += 1) {
    const e0 = row / verticalSegments * topElevation;
    const e1 = (row + 1) / verticalSegments * topElevation;
    for (let column = 0; column < azimuthSegments; column += 1) {
      const a0 = start + (end - start) * column / azimuthSegments;
      const a1 = start + (end - start) * (column + 1) / azimuthSegments;
      const points = [point(a0, e0), point(a1, e0), point(a1, e1), point(a0, e1)];
      const vertices = points.map((entry, index) => geometry.vertex(entry, pointNormal(entry), [[0, 0], [1, 0], [1, 1], [0, 1]][index]));
      geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
    }
  }
  const top = [0, baseY + height, 0];
  for (let column = 0; column < azimuthSegments; column += 1) {
    const a0 = start + (end - start) * column / azimuthSegments;
    const a1 = start + (end - start) * (column + 1) / azimuthSegments;
    const p0 = point(a0, topElevation);
    const p1 = point(a1, topElevation);
    geometry.triangle([p0, p1, top], [pointNormal(p0), pointNormal(p1), [0, 1, 0]]);
  }
  return geometry;
};

const curvedBrim = ({ widthSegments = 24, lengthSegments = 16 } = {}) => {
  const geometry = new Geometry();
  const point = (u, v, bottom = false) => {
    const halfWidth = 0.100 + 0.035 * Math.sin(Math.PI * v * 0.8);
    const x = u * halfWidth;
    const z = 0.075 + 0.180 * v - 0.012 * u * u;
    const yTop = 0.014 + 0.010 * Math.abs(u) + 0.036 * (1 - v);
    return [x, yTop - (bottom ? 0.014 : 0), z];
  };
  for (let row = 0; row < lengthSegments; row += 1) {
    const v0 = row / lengthSegments;
    const v1 = (row + 1) / lengthSegments;
    for (let column = 0; column < widthSegments; column += 1) {
      const u0 = -1 + column / widthSegments * 2;
      const u1 = -1 + (column + 1) / widthSegments * 2;
      geometry.quad([point(u0, v0), point(u0, v1), point(u1, v1), point(u1, v0)], [0, 1, 0]);
      geometry.quad([point(u0, v0, true), point(u1, v0, true), point(u1, v1, true), point(u0, v1, true)], [0, -1, 0]);
    }
  }
  for (const u of [-1, 1]) {
    const normal = [u, 0, 0];
    for (let row = 0; row < lengthSegments; row += 1) {
      const v0 = row / lengthSegments;
      const v1 = (row + 1) / lengthSegments;
      const points = u < 0
        ? [point(u, v0, true), point(u, v1, true), point(u, v1), point(u, v0)]
        : [point(u, v1, true), point(u, v0, true), point(u, v0), point(u, v1)];
      geometry.quad(points, normal);
    }
  }
  for (const v of [0, 1]) {
    const normal = [0, 0, v === 0 ? -1 : 1];
    for (let column = 0; column < widthSegments; column += 1) {
      const u0 = -1 + column / widthSegments * 2;
      const u1 = -1 + (column + 1) / widthSegments * 2;
      const points = v === 0
        ? [point(u1, v, true), point(u0, v, true), point(u0, v), point(u1, v)]
        : [point(u0, v, true), point(u1, v, true), point(u1, v), point(u0, v)];
      geometry.quad(points, normal);
    }
  }
  return geometry;
};

const materialFor = (doc, preset) => doc.createMaterial(preset.name)
  .setBaseColorFactor(preset.baseColor)
  .setMetallicFactor(preset.metallic)
  .setRoughnessFactor(preset.roughness);

const artworkMaterialFor = async (doc, source) => {
  const bytes = await readFile(path.join(toolsRoot, source.artwork.path));
  assert.equal(sha256(bytes), source.artwork.sha256, `${source.assetKey} artwork source drift`);
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual([metadata.width, metadata.height], source.artwork.resolutionPx, `${source.assetKey} artwork resolution drift`);
  const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
  const texture = doc.createTexture(`${source.assetKey}_Exact_Artwork_Texture`)
    .setImage(bytes)
    .setMimeType("image/png")
    .setExtras({
      canonicalSourcePath: source.artwork.canonicalPath,
      canonicalSourceSha256: source.artwork.sha256,
      decodedPixelSha256: sha256(decoded),
      sourceUse: source.artwork.registration.sourceUse
    });
  const material = materialFor(doc, source.materials.artwork)
    .setBaseColorTexture(texture)
    .setAlphaMode("BLEND")
    .setDoubleSided(true);
  return { material, bytes, decodedPixelSha256: sha256(decoded) };
};

const primitiveFor = (doc, buffer, name, geometry, material) => {
  assert.ok(geometry.indices.length > 0, `${name} geometry is empty`);
  return doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor(`${name}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(geometry.uvs)).setBuffer(buffer))
    .setIndices(doc.createAccessor(`${name}_INDICES`).setType("SCALAR").setArray(new Uint32Array(geometry.indices)).setBuffer(buffer))
    .setMaterial(material);
};

const addNode = (doc, parent, buffer, name, geometry, material, extras = {}) => {
  const mesh = doc.createMesh(`${name}_Mesh`).addPrimitive(primitiveFor(doc, buffer, name, geometry, material));
  const node = doc.createNode(name).setMesh(mesh).setExtras(extras);
  parent.addChild(node);
  return node;
};

const buildTShirt = (doc, assembly, buffer, source, materials) => {
  const body = [
    { y: 0, halfWidth: 0.31, halfDepth: 0.038, centreX: 0, centreZ: 0 },
    { y: 0.18, halfWidth: 0.32, halfDepth: 0.046, centreX: 0, centreZ: 0 },
    { y: 0.58, halfWidth: 0.34, halfDepth: 0.055, centreX: 0, centreZ: 0 },
    { y: 0.82, halfWidth: 0.35, halfDepth: 0.054, centreX: 0, centreZ: 0 },
    { y: 0.90, halfWidth: 0.34, halfDepth: 0.051, centreX: 0, centreZ: 0 },
    { y: 0.96, halfWidth: 0.32, halfDepth: 0.047, centreX: 0, centreZ: 0 },
    { y: 1.00, halfWidth: 0.29, halfDepth: 0.043, centreX: 0, centreZ: 0 }
  ];
  const leftSleeve = smoothSleeveRings({
    start: [-0.25, 0.88], control: [-0.37, 0.83], end: [-0.47, 0.71],
    startRadius: 0.09, endRadius: 0.085, radiusBulge: 0.018,
    startDepth: 0.045, endDepth: 0.041, samples: 12
  });
  const rightSleeve = leftSleeve.map((ring) => ({ ...ring, centre: [-ring.centre[0], ring.centre[1]] }));
  addNode(doc, assembly, buffer, "T_Shirt_Relaxed_Body", loftedEllipticalBody(body), materials.fabric, { role: "relaxed-body", frontBackReadable: true, dimensionsAuthority: source.dimensions.authority });
  addNode(doc, assembly, buffer, "T_Shirt_Sleeve_Left", loftedTubeAlongPath(leftSleeve, { capStart: false }), materials.fabric, { role: "short-sleeve", side: "left", shoulderJoin: "uncapped-body-overlap" });
  addNode(doc, assembly, buffer, "T_Shirt_Sleeve_Right", loftedTubeAlongPath(rightSleeve, { capStart: false }), materials.fabric, { role: "short-sleeve", side: "right", shoulderJoin: "uncapped-body-overlap" });
  addNode(doc, assembly, buffer, "T_Shirt_Collar", ellipticalRingZ({ centre: [0, 0.975, 0], outer: [0.125, 0.065], inner: [0.085, 0.040], depth: 0.090 }), materials.collar, { role: "dimensional-collar", constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "T_Shirt_Front_Artwork", curvedArtworkSurface({ centre: [0, 0.655], size: [0.300, 0.1125], bodyHalfWidth: 0.34, bodyHalfDepth: 0.055, side: "front" }), materials.artwork, { role: "exact-front-artwork", surfaceMm: source.artwork.registration.surfaceMm, sourceSha256: source.artwork.sha256 });
};

const buildHoodie = (doc, assembly, buffer, source, materials) => {
  const body = [
    { y: 0.06, halfWidth: 0.34, halfDepth: 0.058, centreX: 0, centreZ: 0 },
    { y: 0.24, halfWidth: 0.35, halfDepth: 0.066, centreX: 0, centreZ: 0 },
    { y: 0.62, halfWidth: 0.38, halfDepth: 0.076, centreX: 0, centreZ: 0 },
    { y: 0.84, halfWidth: 0.38, halfDepth: 0.072, centreX: 0, centreZ: 0 },
    { y: 0.92, halfWidth: 0.36, halfDepth: 0.066, centreX: 0, centreZ: 0 },
    { y: 1.00, halfWidth: 0.33, halfDepth: 0.060, centreX: 0, centreZ: 0 },
    { y: 1.05, halfWidth: 0.31, halfDepth: 0.056, centreX: 0, centreZ: 0 }
  ];
  const hood = [
    { y: 1.00, halfWidth: 0.22, halfDepth: 0.075, centreX: 0, centreZ: -0.005 },
    { y: 1.04, halfWidth: 0.27, halfDepth: 0.090, centreX: 0, centreZ: -0.005 },
    { y: 1.09, halfWidth: 0.29, halfDepth: 0.108, centreX: 0, centreZ: -0.008 },
    { y: 1.15, halfWidth: 0.30, halfDepth: 0.122, centreX: 0, centreZ: -0.012 },
    { y: 1.21, halfWidth: 0.295, halfDepth: 0.128, centreX: 0, centreZ: -0.016 },
    { y: 1.26, halfWidth: 0.27, halfDepth: 0.125, centreX: 0, centreZ: -0.020 },
    { y: 1.30, halfWidth: 0.22, halfDepth: 0.108, centreX: 0, centreZ: -0.023 },
    { y: 1.325, halfWidth: 0.15, halfDepth: 0.080, centreX: 0, centreZ: -0.025 },
    { y: 1.345, halfWidth: 0.075, halfDepth: 0.052, centreX: 0, centreZ: -0.025 },
    { y: 1.35, halfWidth: 0.040, halfDepth: 0.035, centreX: 0, centreZ: -0.025 }
  ];
  const leftSleeve = smoothSleeveRings({
    start: [-0.28, 0.86], control: [-0.42, 0.68], end: [-0.49, 0.30],
    startRadius: 0.10, endRadius: 0.085, radiusBulge: 0.018,
    startDepth: 0.058, endDepth: 0.048, samples: 16
  });
  const rightSleeve = leftSleeve.map((ring) => ({ ...ring, centre: [-ring.centre[0], ring.centre[1]] }));
  addNode(doc, assembly, buffer, "Hoodie_Body", loftedEllipticalBody(body), materials.fabric, { role: "hoodie-body", frontBackReadable: true, dimensionsAuthority: source.dimensions.authority });
  addNode(doc, assembly, buffer, "Hoodie_Sleeve_Left", loftedTubeAlongPath(leftSleeve, { capStart: false }), materials.fabric, { role: "long-sleeve", side: "left", shoulderJoin: "uncapped-body-overlap" });
  addNode(doc, assembly, buffer, "Hoodie_Sleeve_Right", loftedTubeAlongPath(rightSleeve, { capStart: false }), materials.fabric, { role: "long-sleeve", side: "right", shoulderJoin: "uncapped-body-overlap" });
  addNode(doc, assembly, buffer, "Hoodie_Rib_Hem", loftedEllipticalBody([
    { y: 0, halfWidth: 0.35, halfDepth: 0.063, centreX: 0, centreZ: 0 },
    { y: 0.10, halfWidth: 0.35, halfDepth: 0.064, centreX: 0, centreZ: 0 }
  ]), materials.rib, { role: "rib-hem" });
  addNode(doc, assembly, buffer, "Hoodie_Cuff_Left", taperedTubeBetween({ start: [-0.49, 0.28], end: [-0.505, 0.17], startRadius: 0.096, endRadius: 0.088, startDepth: 0.052, endDepth: 0.048 }), materials.rib, { role: "rib-cuff", side: "left" });
  addNode(doc, assembly, buffer, "Hoodie_Cuff_Right", taperedTubeBetween({ start: [0.49, 0.28], end: [0.505, 0.17], startRadius: 0.096, endRadius: 0.088, startDepth: 0.052, endDepth: 0.048 }), materials.rib, { role: "rib-cuff", side: "right" });
  addNode(doc, assembly, buffer, "Hoodie_Dimensional_Hood", loftedEllipticalBody(hood, 40), materials.fabric, { role: "dimensional-hood", constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "Hoodie_Hood_Centre_Seam", hoodRearSeam(hood), materials.rib, { role: "hood-rear-centre-seam", constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "Hoodie_Hood_Opening", ellipsePlaneZ({ centre: [0, 1.165, 0.116], radii: [0.205, 0.120] }), materials.hoodInterior, { role: "hood-opening", containsHeadForm: false });
  addNode(doc, assembly, buffer, "Hoodie_Back_Artwork", curvedArtworkSurface({ centre: [0, 0.690], size: [0.300, 0.1125], bodyHalfWidth: 0.38, bodyHalfDepth: 0.076, side: "back" }), materials.artwork, { role: "exact-back-artwork", surfaceMm: source.artwork.registration.surfaceMm, sourceSha256: source.artwork.sha256 });
};

const buildCap = (doc, assembly, buffer, source, materials) => {
  for (let index = 0; index < 6; index += 1) {
    addNode(doc, assembly, buffer, `Cap_Panel_${String(index + 1).padStart(2, "0")}`, crownPanel(index), materials.crown, { role: "crown-panel", panel: index + 1, panelCount: 6, constructionAccuracyClaim: false });
  }
  addNode(doc, assembly, buffer, "Cap_Curved_Brim", curvedBrim(), materials.crown, { role: "curved-dimensional-brim", productionDimensionsClaim: false });
  addNode(doc, assembly, buffer, "Cap_Top_Button", cylinderY({ centre: [0, 0.263, 0], radius: 0.008, height: 0.006 }), materials.seam, { role: "top-button" });
  addNode(doc, assembly, buffer, "Cap_Rear_Opening", ellipsePlaneZ({ centre: [0, 0.115, -0.108], radii: [0.058, 0.050], side: "back" }), materials.opening, { role: "rear-opening", opening: true });
  addNode(doc, assembly, buffer, "Cap_Adjustment_Strap", boxGeometry([0, 0.072, -0.115], [0.125, 0.020, 0.014]), materials.hardware, { role: "rear-adjustment-strap", mechanismMeasured: false });
  addNode(doc, assembly, buffer, "Cap_Front_Patch", curvedArtworkSurface({ centre: [0, 0.150], size: [0.055, 0.028], bodyHalfWidth: 0.125, bodyHalfDepth: 0.115, side: "front", surfaceOffset: 0.004 }), materials.patch, { role: "bone-woven-patch", nominalMm: source.artwork.registration.patchMm, standOffMm: 4, vendorProofRequired: true });
  addNode(doc, assembly, buffer, "Cap_Patch_Mark", curvedArtworkSurface({ centre: [0, 0.150], size: [0.020, 0.020], bodyHalfWidth: 0.125, bodyHalfDepth: 0.115, side: "front", surfaceOffset: 0.0055, widthSegments: 8, heightSegments: 4 }), materials.artwork, { role: "exact-compact-mark", surfaceMm: source.artwork.registration.surfaceMm, sourceSha256: source.artwork.sha256 });
};

const builders = {
  "t-shirt-001": buildTShirt,
  "hoodie-001": buildHoodie,
  "cap-001": buildCap
};

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((result, mesh) => {
  for (const primitive of mesh.listPrimitives()) {
    result.triangles += primitive.getIndices().getCount() / 3;
    result.drawCalls += 1;
  }
  return result;
}, { triangles: 0, drawCalls: 0 });

const inventoryFor = (doc) => ({
  nodes: doc.getRoot().listNodes().map((node) => node.getName()),
  meshes: doc.getRoot().listMeshes().map((mesh) => mesh.getName()),
  materials: doc.getRoot().listMaterials().map((material) => material.getName()),
  textures: doc.getRoot().listTextures().map((texture) => texture.getName()),
  animations: doc.getRoot().listAnimations().length,
  extensionsUsed: doc.getRoot().listExtensionsUsed().map((extension) => extension.extensionName)
});

const buildArtifact = async (assetKey) => {
  const sourcePath = path.join(toolsRoot, `${assetKey}.source.json`);
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  assert.equal(source.assetKey, assetKey);
  const posterBytes = await readFile(path.join(siteRoot, source.poster.path));
  assert.equal(sha256(posterBytes), source.poster.sha256, `${assetKey} poster drift`);

  const doc = new Document();
  const scene = doc.createScene(source.geometry.scene).setExtras({
    assetKey,
    productId: source.productId,
    truthBoundary: source.truthBoundary,
    disclosure: "Concept visualization only; not a manufacturing reference."
  });
  doc.getRoot().setDefaultScene(scene);
  const buffer = doc.createBuffer(`${assetKey}_Buffer`);
  const assembly = doc.createNode(source.geometry.pivot).setExtras({
    groundY: source.coordinateSystem.groundY,
    pivotPolicy: source.coordinateSystem.pivot,
    truthBoundary: source.truthBoundary
  });
  scene.addChild(assembly);
  const artwork = await artworkMaterialFor(doc, source);
  const materials = Object.fromEntries(Object.entries(source.materials).map(([key, preset]) => [key, key === "artwork" ? artwork.material : materialFor(doc, preset)]));
  builders[assetKey](doc, assembly, buffer, source, materials);

  const io = new NodeIO();
  await doc.transform(dedup(), prune({ keepExtras: true }));
  const bytes = Buffer.from(await io.writeBinary(doc));
  const reopened = await io.readBinary(bytes);
  const sceneBounds = getBounds(reopened.getRoot().getDefaultScene());
  const metrics = metricsFor(reopened);
  const inventory = inventoryFor(reopened);
  const validation = await validateBytes(new Uint8Array(bytes), { uri: `${assetKey}.glb`, format: "glb", writeTimestamp: false, maxIssues: 100 });
  const validationSummary = {
    errors: validation.issues.numErrors,
    warnings: validation.issues.numWarnings,
    infos: validation.issues.numInfos,
    hints: validation.issues.numHints
  };
  assert.equal(validationSummary.errors, 0, `${assetKey} validator errors`);
  assert.equal(validationSummary.warnings, 0, `${assetKey} validator warnings`);
  assert.ok(bytes.byteLength <= source.budgets.maxBytes, `${assetKey} byte budget exceeded`);
  assert.ok(metrics.triangles <= source.budgets.maxTriangles, `${assetKey} triangle budget exceeded`);
  assert.ok(metrics.drawCalls <= source.budgets.maxDrawCalls, `${assetKey} draw-call budget exceeded`);
  for (const required of source.geometry.requiredNodes) assert.ok(inventory.nodes.includes(required), `${assetKey} missing ${required}`);

  const boundsMm = {
    min: sceneBounds.min.map((value) => value * 1000),
    max: sceneBounds.max.map((value) => value * 1000),
    size: sceneBounds.min.map((value, axis) => (sceneBounds.max[axis] - value) * 1000)
  };
  assert.ok(Math.abs(boundsMm.min[1]) < 0.001, `${assetKey} must be grounded`);
  return {
    bytes,
    validation,
    inspection: { schemaVersion: 1, assetKey, optimized: inspect(reopened) },
    report: {
      schemaVersion: 1,
      assetKey,
      sourceIntegrity: {
        artwork: {
          path: source.artwork.path,
          canonicalPath: source.artwork.canonicalPath,
          sha256: sha256(artwork.bytes),
          bytes: artwork.bytes.byteLength,
          resolutionPx: source.artwork.resolutionPx,
          decodedPixelSha256: artwork.decodedPixelSha256,
          sourceUse: source.artwork.registration.sourceUse
        },
        poster: { path: source.poster.path, sha256: sha256(posterBytes), bytes: posterBytes.byteLength }
      },
      governedBuildRecord: {
        productId: source.productId,
        truthBoundary: source.truthBoundary,
        dimensions: source.dimensions,
        geometry: source.geometry,
        artwork: source.artwork,
        materials: source.materials,
        camera: source.camera,
        poster: source.poster,
        inventory
      },
      physicalEvidence: {
        method: "reopened-glb-bounds-node-and-texture-metadata",
        boundsMm,
        geometryPurpose: "volumetric placement and front/back readability",
        manufacturingReference: false
      },
      cameraRecommendations: source.camera,
      validation: validationSummary,
      budget: { ...metrics, bytes: bytes.byteLength, ceilings: source.budgets },
      output: { path: `assets/merch-3d/${assetKey}.glb`, sha256: sha256(bytes) },
      deterministic: { verifiedBySecondInMemoryBuild: false }
    }
  };
};

export const runApparelConceptBuild = async (assetKey, { verifyOnly = process.argv.includes("--verify") } = {}) => {
  assert.ok(builders[assetKey], `unsupported apparel concept asset: ${assetKey}`);
  const outputPath = path.join(siteRoot, `assets/merch-3d/${assetKey}.glb`);
  const reportPath = path.join(toolsRoot, `reports/${assetKey}.report.json`);
  const validatorPath = path.join(toolsRoot, `reports/${assetKey}.validator.json`);
  const inspectPath = path.join(toolsRoot, `reports/${assetKey}.inspect.json`);
  const artifact = await buildArtifact(assetKey);
  const second = await buildArtifact(assetKey);
  assert.equal(sha256(artifact.bytes), sha256(second.bytes), `${assetKey} build is not byte-deterministic`);
  artifact.report.deterministic.verifiedBySecondInMemoryBuild = true;

  if (verifyOnly) {
    const [existingBytes, existingReport, existingValidator, existingInspection] = await Promise.all([
      readFile(outputPath),
      readFile(reportPath, "utf8").then(JSON.parse),
      readFile(validatorPath, "utf8").then(JSON.parse),
      readFile(inspectPath, "utf8").then(JSON.parse)
    ]);
    assert.equal(sha256(existingBytes), sha256(artifact.bytes), `checked-in ${assetKey} GLB is stale`);
    assert.deepEqual(existingReport, artifact.report, `checked-in ${assetKey} report is stale`);
    assert.deepEqual(existingValidator, artifact.validation, `checked-in ${assetKey} validator report is stale`);
    assert.deepEqual(existingInspection, artifact.inspection, `checked-in ${assetKey} inspection report is stale`);
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
