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

const appendGeometry = (target, source) => {
  const offset = target.positions.length / 3;
  target.positions.push(...source.positions);
  target.normals.push(...source.normals);
  target.uvs.push(...source.uvs);
  target.indices.push(...source.indices.map((index) => index + offset));
  return target;
};

const chaikinClosed = (points, iterations = 2) => {
  let result = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [];
    for (let index = 0; index < result.length; index += 1) {
      const a = result[index];
      const b = result[(index + 1) % result.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    result = next;
  }
  return result;
};

const fittedGarmentOutline = (anchors, { width, height }) => {
  const smoothed = chaikinClosed(anchors);
  const bounds = smoothed.reduce((result, [x, y]) => ({
    minX: Math.min(result.minX, x), maxX: Math.max(result.maxX, x),
    minY: Math.min(result.minY, y), maxY: Math.max(result.maxY, y)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const centreX = (bounds.minX + bounds.maxX) / 2;
  return smoothed.map(([x, y]) => [
    (x - centreX) / (bounds.maxX - bounds.minX) * width,
    (y - bounds.minY) / (bounds.maxY - bounds.minY) * height
  ]);
};

const triangulateOutline = (points) => {
  const remaining = Array.from({ length: points.length }, (_, index) => index);
  const triangles = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (point, a, b, c) => {
    const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
    return signs.every((value) => value >= -1e-10);
  };
  let guard = points.length * points.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previous = remaining[(cursor - 1 + remaining.length) % remaining.length];
      const current = remaining[cursor];
      const next = remaining[(cursor + 1) % remaining.length];
      if (cross(points[previous], points[current], points[next]) <= 1e-10) continue;
      if (remaining.some((candidate) => candidate !== previous && candidate !== current && candidate !== next
        && inside(points[candidate], points[previous], points[current], points[next]))) continue;
      triangles.push([previous, current, next]);
      remaining.splice(cursor, 1);
      clipped = true;
      break;
    }
    assert.ok(clipped, "garment silhouette must remain a simple counter-clockwise polygon");
  }
  assert.equal(remaining.length, 3, "garment silhouette triangulation did not complete");
  triangles.push(remaining);
  return triangles;
};

const drapedShell = (outline, { halfDepth, foldScale = 0.006 }) => {
  const geometry = new Geometry();
  const maxX = Math.max(...outline.map(([x]) => Math.abs(x)));
  const maxY = Math.max(...outline.map(([, y]) => y));
  const depthAt = ([x, y]) => halfDepth * (
    0.72
    + 0.22 * Math.cos(x / maxX * Math.PI / 2)
    + 0.06 * Math.sin(y / maxY * Math.PI)
  ) + foldScale * Math.cos(x / maxX * Math.PI * 3) * Math.sin(y / maxY * Math.PI);
  const frontNormal = ([x, y]) => normalise([-0.08 * x / maxX, -0.025 * Math.sin(y / maxY * Math.PI * 2), 1]);
  const backNormal = ([x, y]) => normalise([-0.08 * x / maxX, -0.025 * Math.sin(y / maxY * Math.PI * 2), -1]);
  const frontUv = ([x, y]) => [(x + maxX) / (maxX * 2), 1 - y / maxY];
  const backUv = ([x, y]) => [1 - (x + maxX) / (maxX * 2), 1 - y / maxY];
  const perimeter = outline.map((point, index) => {
    const previous = outline[(index - 1 + outline.length) % outline.length];
    return index === 0 ? 0 : Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  for (let index = 1; index < perimeter.length; index += 1) perimeter[index] += perimeter[index - 1];
  const perimeterLength = perimeter.at(-1) + Math.hypot(outline[0][0] - outline.at(-1)[0], outline[0][1] - outline.at(-1)[1]);
  for (const triangle of triangulateOutline(outline)) {
    const points = triangle.map((index) => outline[index]);
    geometry.triangle(points.map((point) => [...point, depthAt(point)]), points.map(frontNormal), points.map(frontUv));
    const reversed = points.toReversed();
    geometry.triangle(reversed.map((point) => [...point, -depthAt(point)]), reversed.map(backNormal), reversed.map(backUv));
  }
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    const a = outline[index];
    const b = outline[next];
    const aFront = [...a, depthAt(a)];
    const bFront = [...b, depthAt(b)];
    const aBack = [...a, -depthAt(a)];
    const bBack = [...b, -depthAt(b)];
    const sideNormal = normalise([b[1] - a[1], a[0] - b[0], 0]);
    const u0 = perimeter[index] / perimeterLength;
    const u1 = next === 0 ? 1 : perimeter[next] / perimeterLength;
    geometry.quad([aBack, bBack, bFront, aFront], sideNormal, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  }
  return geometry;
};

const frontBackPatch = (outline, halfDepth) => {
  const geometry = new Geometry();
  for (const triangle of triangulateOutline(outline)) {
    const points = triangle.map((index) => outline[index]);
    geometry.triangle(points.map((point) => [...point, halfDepth]), [0, 0, 1]);
    geometry.triangle(points.toReversed().map((point) => [...point, -halfDepth]), [0, 0, -1]);
  }
  return geometry;
};

const curvedHemSeam = ({ width, y, curve, halfDepth, thickness = 0.008, segments = 18 }) => {
  const geometry = new Geometry();
  const point = (index, side, upper) => {
    const x = -width / 2 + width * index / segments;
    const normalizedX = x / (width / 2);
    const centreDrop = curve * (1 - normalizedX ** 2);
    return [x, y + centreDrop + (upper ? thickness : 0), side * halfDepth];
  };
  for (const side of [-1, 1]) {
    for (let index = 0; index < segments; index += 1) {
      const corners = side > 0
        ? [point(index, side, false), point(index + 1, side, false), point(index + 1, side, true), point(index, side, true)]
        : [point(index + 1, side, false), point(index, side, false), point(index, side, true), point(index + 1, side, true)];
      geometry.quad(corners, [0, 0, side]);
    }
  }
  return geometry;
};

const openHoodShell = ({ centre = [0, 1.155], outer = [0.245, 0.185], inner = [0.130, 0.145] } = {}) => {
  const geometry = new Geometry();
  const outerPoints = fittedGarmentOutline([
    [-0.18, 0], [0, -0.015], [0.18, 0], [0.235, 0.07], [0.25, 0.18], [0.205, 0.30],
    [0.10, 0.365], [0, 0.38], [-0.10, 0.365], [-0.205, 0.30], [-0.25, 0.18], [-0.235, 0.07]
  ], { width: outer[0] * 2, height: outer[1] * 2 }).map(([x, y]) => [x + centre[0], y + centre[1] - outer[1]]);
  const segments = outerPoints.length;
  const innerPoints = fittedGarmentOutline([
    [-0.08, 0], [0, -0.02], [0.08, 0], [0.135, 0.06], [0.145, 0.14], [0.115, 0.23],
    [0.06, 0.27], [0, 0.28], [-0.06, 0.27], [-0.115, 0.23], [-0.145, 0.14], [-0.135, 0.06]
  ], { width: inner[0] * 2, height: inner[1] * 2 }).map(([x, y]) => [x + centre[0], y + centre[1] - inner[1]]);
  const backPoint = ([x, y]) => [x, y, -0.085 - 0.020 * Math.cos(Math.max(-1, Math.min(1, (y - centre[1]) / outer[1])) * Math.PI / 2)];
  const backCentre = [centre[0], centre[1], -0.112];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const backA = backPoint(outerPoints[index]);
    const backB = backPoint(outerPoints[next]);
    const frontA = [...outerPoints[index], 0.082];
    const frontB = [...outerPoints[next], 0.082];
    const innerA = [...innerPoints[index], 0.086];
    const innerB = [...innerPoints[next], 0.086];
    geometry.triangle([backCentre, backB, backA], [0, 0, -1]);
    const sideNormal = normalise([outerPoints[next][1] - outerPoints[index][1], outerPoints[index][0] - outerPoints[next][0], 0]);
    geometry.quad([backA, backB, frontB, frontA], sideNormal);
    for (const points of [[frontA, frontB, innerB], [frontA, innerB, innerA]]) {
      const crossZ = (points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
        - (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]);
      geometry.triangle(crossZ >= 0 ? points : [points[0], points[2], points[1]], [0, 0, 1]);
    }
  }
  return geometry;
};

const hoodCentreSeam = ({ centreY = 1.155, radiusY = 0.185, segments = 12 } = {}) => {
  const geometry = new Geometry();
  const point = (y, x) => [x, y, -0.108 + 0.023 * ((y - centreY) / radiusY) ** 2];
  for (let index = 0; index < segments; index += 1) {
    const y0 = centreY - radiusY + index / segments * radiusY * 2;
    const y1 = centreY - radiusY + (index + 1) / segments * radiusY * 2;
    geometry.quad([point(y0, 0.004), point(y0, -0.004), point(y1, -0.004), point(y1, 0.004)], [0, 0, -1]);
  }
  return geometry;
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

const crownPanel = (panelIndex, { panels = 6, azimuthSegments = 14, verticalSegments = 12 } = {}) => {
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
      const centroid = points.reduce((result, entry) => result.map((value, axis) => value + entry[axis] / points.length), [0, 0, 0]);
      const rearAperture = centroid[2] < -0.075
        && (centroid[0] / 0.052) ** 2 + ((centroid[1] - 0.115) / 0.042) ** 2 < 1;
      if (rearAperture) continue;
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

const proceduralSurfaceTextures = async (doc, preset) => {
  if (!preset.surface) return null;
  const size = 64;
  const normalPixels = Buffer.alloc(size * size * 4);
  const roughnessPixels = Buffer.alloc(size * size * 4);
  const seed = [...preset.surface].reduce((value, character) => (value * 33 + character.charCodeAt(0)) >>> 0, 5381);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const twill = Math.sin((x + y) * Math.PI / 3) * 0.55 + Math.sin((x - y) * Math.PI / 5) * 0.25;
      const washed = (((x * 73856093) ^ (y * 19349663) ^ seed) >>> 8 & 255) / 255 - 0.5;
      normalPixels[offset] = Math.round(128 + twill * 16 + washed * 5);
      normalPixels[offset + 1] = Math.round(128 - twill * 12 + washed * 5);
      normalPixels[offset + 2] = 250;
      normalPixels[offset + 3] = 255;
      roughnessPixels[offset] = 0;
      roughnessPixels[offset + 1] = Math.round(232 + twill * 7 + washed * 8);
      roughnessPixels[offset + 2] = 0;
      roughnessPixels[offset + 3] = 255;
    }
  }
  const [normalBytes, roughnessBytes] = await Promise.all([
    sharp(normalPixels, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer(),
    sharp(roughnessPixels, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer()
  ]);
  return {
    normal: doc.createTexture(`${preset.name}_Woven_Normal`).setImage(normalBytes).setMimeType("image/png").setExtras({ deterministicSurface: preset.surface, role: "cloth-normal" }),
    roughness: doc.createTexture(`${preset.name}_Woven_Roughness`).setImage(roughnessBytes).setMimeType("image/png").setExtras({ deterministicSurface: preset.surface, role: "cloth-roughness" })
  };
};

const materialFor = async (doc, preset) => {
  const material = doc.createMaterial(preset.name)
    .setBaseColorFactor(preset.baseColor)
    .setMetallicFactor(preset.metallic)
    .setRoughnessFactor(preset.roughness)
    .setExtras(preset.surface ? { surfaceResponse: "deterministic-woven-normal-and-roughness", surfacePreset: preset.surface } : {});
  const textures = await proceduralSurfaceTextures(doc, preset);
  if (textures) material.setNormalTexture(textures.normal).setNormalScale(0.025).setMetallicRoughnessTexture(textures.roughness);
  return material;
};

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
  const material = (await materialFor(doc, source.materials.artwork))
    .setBaseColorTexture(texture)
    .setAlphaMode("BLEND")
    .setDoubleSided(true);
  return { material, bytes, decodedPixelSha256: sha256(decoded) };
};

const primitiveFor = (doc, buffer, name, geometry, material) => {
  assert.ok(geometry.indices.length > 0, `${name} geometry is empty`);
  const tangents = [];
  for (let offset = 0; offset < geometry.normals.length; offset += 3) {
    const normal = geometry.normals.slice(offset, offset + 3);
    const reference = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tangent = normalise([
      reference[1] * normal[2] - reference[2] * normal[1],
      reference[2] * normal[0] - reference[0] * normal[2],
      reference[0] * normal[1] - reference[1] * normal[0]
    ]);
    tangents.push(...tangent, 1);
  }
  return doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor(`${name}_POSITION`).setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor(`${name}_NORMAL`).setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer))
    .setAttribute("TANGENT", doc.createAccessor(`${name}_TANGENT`).setType("VEC4").setArray(new Float32Array(tangents)).setBuffer(buffer))
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
  const outline = fittedGarmentOutline([
    [-0.31, 0.015], [0, 0], [0.31, 0.015], [0.32, 0.20], [0.34, 0.67],
    [0.43, 0.70], [0.54, 0.74], [0.51, 0.84], [0.36, 0.94], [0.30, 1.00], [0.12, 1.04],
    [0, 1.025], [-0.12, 1.04], [-0.30, 1.00], [-0.36, 0.94], [-0.51, 0.84], [-0.54, 0.74],
    [-0.43, 0.70], [-0.34, 0.67], [-0.32, 0.20]
  ], { width: 1.06, height: 1.02 });
  addNode(doc, assembly, buffer, "T_Shirt_Draped_Shell", drapedShell(outline, { halfDepth: 0.050, foldScale: 0.004 }), materials.fabric, {
    role: "continuous-garment-shell",
    construction: "unified-draped-front-back-shell",
    shoulderSleeveContinuity: true,
    frontBackReadable: true,
    dimensionsAuthority: source.dimensions.authority
  });
  addNode(doc, assembly, buffer, "T_Shirt_Collar", ellipticalRingZ({ centre: [0, 0.975, 0], outer: [0.125, 0.065], inner: [0.085, 0.040], depth: 0.090 }), materials.collar, { role: "dimensional-collar", constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "T_Shirt_Seam_Cues", curvedHemSeam({ width: 0.50, y: 0.020, curve: -0.008, halfDepth: 0.052 }), materials.collar, { role: "curved-hem-seam-cue", integratedByOverlap: true });
  addNode(doc, assembly, buffer, "T_Shirt_Front_Artwork", curvedArtworkSurface({ centre: [0, 0.655], size: [0.300, 0.1125], bodyHalfWidth: 0.34, bodyHalfDepth: 0.055, side: "front" }), materials.artwork, { role: "exact-front-artwork", surfaceMm: source.artwork.registration.surfaceMm, sourceSha256: source.artwork.sha256 });
};

const buildHoodie = (doc, assembly, buffer, source, materials) => {
  const outline = fittedGarmentOutline([
    [-0.34, 0.015], [0, 0], [0.34, 0.015], [0.35, 0.19], [0.37, 0.71],
    [0.44, 0.62], [0.51, 0.27], [0.60, 0.24], [0.57, 0.60], [0.51, 0.86], [0.34, 1.03],
    [0.14, 1.08], [0, 1.06], [-0.14, 1.08], [-0.34, 1.03], [-0.51, 0.86],
    [-0.57, 0.60], [-0.60, 0.24], [-0.51, 0.27], [-0.44, 0.62], [-0.37, 0.71], [-0.35, 0.19]
  ], { width: 1.17, height: 1.08 });
  addNode(doc, assembly, buffer, "Hoodie_Draped_Shell", drapedShell(outline, { halfDepth: 0.068, foldScale: 0.006 }), materials.fabric, {
    role: "continuous-garment-shell",
    construction: "unified-draped-front-back-shell",
    shoulderSleeveContinuity: true,
    frontBackReadable: true,
    dimensionsAuthority: source.dimensions.authority
  });
  const integratedTrim = new Geometry();
  appendGeometry(integratedTrim, frontBackPatch([[-0.30, 0.008], [0.30, 0.008], [0.32, 0.095], [-0.32, 0.095]], 0.070));
  appendGeometry(integratedTrim, frontBackPatch([[0.505, 0.245], [0.59, 0.225], [0.585, 0.305], [0.495, 0.325]], 0.055));
  appendGeometry(integratedTrim, frontBackPatch(mirrorPolygonX([[0.505, 0.245], [0.59, 0.225], [0.585, 0.305], [0.495, 0.325]]), 0.055));
  addNode(doc, assembly, buffer, "Hoodie_Integrated_Rib_Trim", integratedTrim, materials.rib, { role: "gapless-hem-and-cuff-trim", integratedByOverlap: true });
  addNode(doc, assembly, buffer, "Hoodie_Open_Hood_Shell", openHoodShell(), materials.fabric, {
    role: "open-attached-hood-shell",
    opening: "unfilled-face-cavity",
    attachedAtNecklineY: 1.0,
    containsHeadForm: false,
    constructionAccuracyClaim: false
  });
  addNode(doc, assembly, buffer, "Hoodie_Hood_Centre_Seam", hoodCentreSeam(), materials.rib, { role: "hood-rear-centre-seam", constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "Hoodie_Back_Artwork", curvedArtworkSurface({ centre: [0, 0.690], size: [0.300, 0.1125], bodyHalfWidth: 0.38, bodyHalfDepth: 0.076, side: "back" }), materials.artwork, { role: "exact-back-artwork", surfaceMm: source.artwork.registration.surfaceMm, sourceSha256: source.artwork.sha256 });
};

const buildCap = (doc, assembly, buffer, source, materials) => {
  for (let index = 0; index < 6; index += 1) {
    addNode(doc, assembly, buffer, `Cap_Panel_${String(index + 1).padStart(2, "0")}`, crownPanel(index), materials.crown, { role: "crown-panel", panel: index + 1, panelCount: 6, constructionAccuracyClaim: false });
  }
  addNode(doc, assembly, buffer, "Cap_Curved_Brim", curvedBrim(), materials.crown, { role: "curved-dimensional-brim", productionDimensionsClaim: false });
  addNode(doc, assembly, buffer, "Cap_Top_Button", cylinderY({ centre: [0, 0.263, 0], radius: 0.008, height: 0.006 }), materials.seam, { role: "top-button" });
  addNode(doc, assembly, buffer, "Cap_Rear_Aperture_Rim", ellipticalRingZ({ centre: [0, 0.115, -0.108], outer: [0.065, 0.057], inner: [0.052, 0.043], depth: 0.008, segments: 40 }), materials.seam, { role: "rear-aperture-boundary", opening: "unfilled-through-aperture", crownGeometryRemoved: true });
  addNode(doc, assembly, buffer, "Cap_Adjustment_Strap", boxGeometry([0, 0.076, -0.118], [0.142, 0.014, 0.008]), materials.seam, { role: "single-rear-adjustment-strap", bridgesAperture: true, mechanismMeasured: false });
  addNode(doc, assembly, buffer, "Cap_Adjustment_Keeper", boxGeometry([0.040, 0.076, -0.126], [0.014, 0.024, 0.006]), materials.hardware, { role: "small-adjustment-keeper", mechanismMeasured: false });
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
  const materials = {};
  for (const [key, preset] of Object.entries(source.materials)) {
    materials[key] = key === "artwork" ? artwork.material : await materialFor(doc, preset);
  }
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
  assert.equal(validationSummary.warnings, 0, `${assetKey} validator warnings: ${JSON.stringify(validation.issues.messages.filter((message) => message.severity === 1))}`);
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
