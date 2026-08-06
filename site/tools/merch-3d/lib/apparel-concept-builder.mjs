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

  position(index) {
    return this.positions.slice(index * 3, index * 3 + 3);
  }

  normal(index) {
    return this.normals.slice(index * 3, index * 3 + 3);
  }

  setNormal(index, normal) {
    this.normals.splice(index * 3, 3, ...normal);
  }

  indexedTriangle(indices) {
    this.indices.push(...indices);
  }

  indexedQuad(indices) {
    this.indices.push(indices[0], indices[1], indices[2], indices[0], indices[2], indices[3]);
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

const orientedQuad = (geometry, points, normal, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) => {
  const ab = points[1].map((value, axis) => value - points[0][axis]);
  const ac = points[2].map((value, axis) => value - points[0][axis]);
  const face = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const ordered = face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2] >= 0
    ? { points, uvs }
    : { points: [points[0], points[3], points[2], points[1]], uvs: [uvs[0], uvs[3], uvs[2], uvs[1]] };
  geometry.quad(ordered.points, normalise(normal), ordered.uvs);
};

const smoothIndexedQuad = (geometry, indices) => {
  const faceNormalDot = ([a, b, c]) => {
    const points = [a, b, c].map((index) => geometry.position(index));
    const ab = points[1].map((value, axis) => value - points[0][axis]);
    const ac = points[2].map((value, axis) => value - points[0][axis]);
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const averageNormal = [a, b, c].reduce((result, index) => {
      const normal = geometry.normal(index);
      return result.map((value, axis) => value + normal[axis]);
    }, [0, 0, 0]);
    return face[0] * averageNormal[0] + face[1] * averageNormal[1] + face[2] * averageNormal[2];
  };
  const candidates = [
    [[indices[0], indices[1], indices[2]], [indices[0], indices[2], indices[3]]],
    [[indices[0], indices[1], indices[3]], [indices[1], indices[2], indices[3]]]
  ].flatMap((triangles) => [
    { triangles, score: Math.min(...triangles.map(faceNormalDot)) },
    { triangles: triangles.map(([a, b, c]) => [a, c, b]), score: Math.min(...triangles.map((triangle) => -faceNormalDot(triangle))) }
  ]);
  const best = candidates.reduce((selected, candidate) => candidate.score > selected.score ? candidate : selected);
  for (const triangle of best.triangles) geometry.indexedTriangle(triangle);
};

const applyAreaWeightedVertexNormals = (geometry, { biasNormal = null, biasWeight = 0 } = {}) => {
  const vertexCount = geometry.positions.length / 3;
  const accumulated = Array.from({ length: vertexCount }, () => [0, 0, 0]);
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const triangle = geometry.indices.slice(offset, offset + 3);
    const points = triangle.map((index) => geometry.position(index));
    const ab = points[1].map((value, axis) => value - points[0][axis]);
    const ac = points[2].map((value, axis) => value - points[0][axis]);
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    for (const vertex of triangle) {
      for (let axis = 0; axis < 3; axis += 1) accumulated[vertex][axis] += face[axis];
    }
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const weighted = [...accumulated[vertex]];
    const position = geometry.position(vertex);
    const localBiasWeight = typeof biasWeight === "function" ? biasWeight(position) : biasWeight;
    if (biasNormal && localBiasWeight > 0) {
      const bias = biasNormal(position);
      const scale = Math.hypot(...weighted) * localBiasWeight;
      for (let axis = 0; axis < 3; axis += 1) weighted[axis] += bias[axis] * scale;
    }
    if (Math.hypot(...weighted) > 1e-12) geometry.setNormal(vertex, normalise(weighted));
  }
  return geometry;
};

const finaliseSmoothIndexedShell = (geometry, { areaWeightedNormals = false } = {}) => {
  const vertexCount = geometry.positions.length / 3;
  const adjacency = Array.from({ length: vertexCount }, () => new Set());
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const [a, b, c] = geometry.indices.slice(offset, offset + 3);
    adjacency[a].add(b).add(c);
    adjacency[b].add(a).add(c);
    adjacency[c].add(a).add(b);
  }
  for (let pass = 0; pass < 8; pass += 1) {
    const previous = Array.from({ length: vertexCount }, (_, vertex) => geometry.normal(vertex));
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const position = geometry.position(vertex);
      if (Math.abs(position[0]) < 0.18 || position[1] < 0.70 || position[1] > 1.06) continue;
      const summed = previous[vertex].map((value) => value * 2);
      for (const neighbour of adjacency[vertex]) {
        for (let axis = 0; axis < 3; axis += 1) summed[axis] += previous[neighbour][axis];
      }
      if (Math.hypot(...summed) > 1e-12) geometry.setNormal(vertex, normalise(summed));
    }
  }
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const triangle = geometry.indices.slice(offset, offset + 3);
    const points = triangle.map((index) => geometry.position(index));
    const ab = points[1].map((value, axis) => value - points[0][axis]);
    const ac = points[2].map((value, axis) => value - points[0][axis]);
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const averageNormal = triangle.reduce((result, index) => {
      const normal = geometry.normal(index);
      return result.map((value, axis) => value + normal[axis]);
    }, [0, 0, 0]);
    if (face[0] * averageNormal[0] + face[1] * averageNormal[1] + face[2] * averageNormal[2] < 0) {
      [geometry.indices[offset + 1], geometry.indices[offset + 2]] = [geometry.indices[offset + 2], geometry.indices[offset + 1]];
    }
  }
  if (areaWeightedNormals) {
    applyAreaWeightedVertexNormals(geometry);
    for (let pass = 0; pass < 12; pass += 1) {
      const previous = Array.from({ length: vertexCount }, (_, vertex) => geometry.normal(vertex));
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const position = geometry.position(vertex);
        if (Math.abs(position[0]) < 0.18 || position[1] < 0.55 || position[1] > 1.07) continue;
        const summed = previous[vertex].map((value) => value * 2);
        for (const neighbour of adjacency[vertex]) {
          for (let axis = 0; axis < 3; axis += 1) summed[axis] += previous[neighbour][axis];
        }
        if (Math.hypot(...summed) > 1e-12) geometry.setNormal(vertex, normalise(summed));
      }
    }
    for (let offset = 0; offset < geometry.indices.length; offset += 3) {
      const triangle = geometry.indices.slice(offset, offset + 3);
      const points = triangle.map((index) => geometry.position(index));
      const ab = points[1].map((value, axis) => value - points[0][axis]);
      const ac = points[2].map((value, axis) => value - points[0][axis]);
      const face = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]
      ];
      const averageNormal = triangle.reduce((result, index) => {
        const normal = geometry.normal(index);
        return result.map((value, axis) => value + normal[axis]);
      }, [0, 0, 0]);
      if (face[0] * averageNormal[0] + face[1] * averageNormal[1] + face[2] * averageNormal[2] < 0) {
        [geometry.indices[offset + 1], geometry.indices[offset + 2]] = [geometry.indices[offset + 2], geometry.indices[offset + 1]];
      }
    }
  }
  return geometry;
};

const tailoredTorsoPoint = (rings, ringIndex, angle) => {
  const ring = rings[ringIndex];
  const xRatio = Math.cos(angle);
  const side = Math.sin(angle);
  const heightRatio = ringIndex / Math.max(1, rings.length - 1);
  const fold = (ring.fold || 0) * Math.sin(xRatio * Math.PI * 3) * Math.sin(heightRatio * Math.PI) * Math.abs(side);
  return [
    ring.centreX + xRatio * ring.halfWidth,
    ring.y + (ring.hemCurve || 0) * xRatio ** 2
      - (ring.frontDrop || 0) * Math.max(0, side)
      - (ring.rearDrop || 0) * Math.max(0, -side),
    ring.centreZ + side * (ring.halfDepth + fold)
  ];
};

const tailoredTorsoNormal = (rings, ringIndex, angle) => {
  const previous = tailoredTorsoPoint(rings, Math.max(0, ringIndex - 1), angle);
  const next = tailoredTorsoPoint(rings, Math.min(rings.length - 1, ringIndex + 1), angle);
  const before = tailoredTorsoPoint(rings, ringIndex, angle - 0.002);
  const after = tailoredTorsoPoint(rings, ringIndex, angle + 0.002);
  const height = next.map((value, axis) => value - previous[axis]);
  const around = after.map((value, axis) => value - before[axis]);
  return normalise([
    height[1] * around[2] - height[2] * around[1],
    height[2] * around[0] - height[0] * around[2],
    height[0] * around[1] - height[1] * around[0]
  ]);
};

const tailoredTorso = (rings, { segments = 36, capStart = false, capEnd = false } = {}) => {
  const geometry = new Geometry();
  const point = (ringIndex, angle) => tailoredTorsoPoint(rings, ringIndex, angle);
  const pointNormal = (ringIndex, angle) => tailoredTorsoNormal(rings, ringIndex, angle);
  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a0 = column / segments * Math.PI * 2;
      const a1 = (column + 1) / segments * Math.PI * 2;
      const corners = [point(row, a0), point(row + 1, a0), point(row + 1, a1), point(row, a1)];
      const normals = [pointNormal(row, a0), pointNormal(row + 1, a0), pointNormal(row + 1, a1), pointNormal(row, a1)];
      const vertices = corners.map((entry, index) => geometry.vertex(entry, normals[index], [column / segments, (row + [0, 1, 1, 0][index]) / (rings.length - 1)]));
      geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
    }
  }
  const addCap = (ringIndex, normal, reverse) => {
    const ring = rings[ringIndex];
    for (let column = 0; column < segments; column += 1) {
      const a0 = column / segments * Math.PI * 2;
      const a1 = (column + 1) / segments * Math.PI * 2;
      const triangle = [[ring.centreX, ring.y, ring.centreZ], point(ringIndex, a0), point(ringIndex, a1)];
      geometry.triangle(reverse ? [triangle[0], triangle[2], triangle[1]] : triangle, normal);
    }
  };
  if (capStart) addCap(0, [0, -1, 0], true);
  if (capEnd) addCap(rings.length - 1, [0, 1, 0], false);
  return { geometry, point, rings };
};

const sleeveFrames = (rings) => rings.map((ring, index) => {
  const previous = rings[Math.max(0, index - 1)].centre;
  const next = rings[Math.min(rings.length - 1, index + 1)].centre;
  const tangent = normalise([next[0] - previous[0], next[1] - previous[1], 0]);
  return { ...ring, tangent, perpendicular: [-tangent[1], tangent[0]] };
});

const sleevePoint = (frame, angle) => [
  frame.centre[0] + frame.perpendicular[0] * frame.radius * Math.cos(angle),
  frame.centre[1] + frame.perpendicular[1] * frame.radius * Math.cos(angle),
  (frame.centre[2] || 0) + frame.depth * Math.sin(angle)
];

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

const hoodFoldStart = -0.16;
const hoodFoldEnd = Math.PI + 0.12;
const hoodFoldSegments = 25;
const hoodEntranceAngles = [
  ...Array.from({ length: hoodFoldSegments + 1 }, (_, index) => hoodFoldStart + index / hoodFoldSegments * (hoodFoldEnd - hoodFoldStart)),
  ...Array.from({ length: 14 }, (_, index) => hoodFoldEnd + (index + 1) / 15 * (hoodFoldStart + Math.PI * 2 - hoodFoldEnd))
];

const hoodOpeningPoint = (angle, edge = "inner") => {
  const sine = Math.sin(angle);
  const frontDepth = 0.064;
  const backDepth = 0.043;
  const zOffset = sine >= 0 ? sine * frontDepth : sine * backDepth;
  const widthTaper = 0.88 + 0.12 * ((zOffset + backDepth) / (frontDepth + backDepth));
  const outer = [
    Math.cos(angle) * 0.158 * widthTaper * (1 + Math.sin(angle * 3) * 0.025),
    1.018 - 0.036 * Math.max(0, sine) + Math.sin(angle * 2) * 0.0045 + Math.sin(angle * 3) * 0.0025,
    -0.115 + zOffset + Math.cos(angle * 3) * 0.0015
  ];
  if (edge === "outer") return outer;
  const thickness = 0.006 + 0.015 * Math.max(0, sine);
  return [
    outer[0] - Math.cos(angle) * thickness * 0.72,
    outer[1] - 0.006 - thickness * 0.65,
    outer[2] - Math.sin(angle) * thickness
  ];
};

const hoodOpeningFoldEdge = () => {
  const geometry = new Geometry();
  const provisionalNormal = normalise([0, 0.55, -0.84]);
  const outerVertices = [];
  const innerVertices = [];
  for (let index = 0; index <= hoodFoldSegments; index += 1) {
    const t = index / hoodFoldSegments;
    const angle = hoodFoldStart + t * (hoodFoldEnd - hoodFoldStart);
    outerVertices.push(geometry.vertex(hoodOpeningPoint(angle, "outer"), provisionalNormal, [t, 0]));
    innerVertices.push(geometry.vertex(hoodOpeningPoint(angle, "inner"), provisionalNormal, [t, 1]));
  }
  for (let index = 0; index < hoodFoldSegments; index += 1) {
    geometry.indices.push(
      outerVertices[index], innerVertices[index + 1], outerVertices[index + 1],
      outerVertices[index], innerVertices[index], innerVertices[index + 1]
    );
  }
  applyAreaWeightedVertexNormals(geometry, {
    biasNormal: ([x]) => normalise([x * 1.8, 0.25, -1]),
    biasWeight: 0.35
  });
  return geometry;
};

const openHoodShell = () => {
  const geometry = new Geometry();
  const outer = chaikinClosed([
    [-0.19, 0.755], [0, 0.730], [0.19, 0.755], [0.28, 0.855], [0.25, 0.975],
    [0.14, 1.035], [0, 0.995], [-0.14, 1.035], [-0.25, 0.975], [-0.28, 0.855]
  ], 2);
  const outerFront = ([x, y]) => [x, y, -0.096 - 0.003 * (1 - y / 1.050)];
  const outerBack = ([x, y]) => [x, y, -0.166 - 0.008 * (1 - Math.abs(x) / 0.28)];
  const backCentre = [0, 0.875, -0.175];
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    const outerNormal = [outer[next][1] - outer[index][1], outer[index][0] - outer[next][0], 0];
    if (Math.max(outer[index][1], outer[next][1]) < 0.995) {
      orientedQuad(geometry, [outerFront(outer[index]), outerFront(outer[next]), outerBack(outer[next]), outerBack(outer[index])], outerNormal);
    }
    geometry.triangle([backCentre, outerBack(outer[next]), outerBack(outer[index])], [0, 0, -1]);
  }
  appendGeometry(geometry, hoodOpeningFoldEdge());
  const topLeft = outer.reduce((selected, point) => Math.hypot(point[0] + 0.21, point[1] - 0.965) < Math.hypot(selected[0] + 0.21, selected[1] - 0.965) ? point : selected, outer[0]);
  const topRight = outer.reduce((selected, point) => Math.hypot(point[0] - 0.21, point[1] - 0.965) < Math.hypot(selected[0] - 0.21, selected[1] - 0.965) ? point : selected, outer[0]);
  const foldPanel = new Geometry();
  const rearRight = outerBack(topRight);
  const rearLeft = outerBack(topLeft);
  const rearCentre = [0, 0.875, -0.175];
  const rearPoint = (t) => {
    const inverse = 1 - t;
    return rearRight.map((value, axis) => inverse * inverse * value + 2 * inverse * t * rearCentre[axis] + t * t * rearLeft[axis]);
  };
  const foldNormal = normalise([0, 1, 0.18]);
  const rearVertices = [];
  const faceVertices = [];
  for (let index = 0; index <= hoodFoldSegments; index += 1) {
    const t = index / hoodFoldSegments;
    const angle = hoodFoldStart + t * (hoodFoldEnd - hoodFoldStart);
    rearVertices.push(foldPanel.vertex(rearPoint(t), foldNormal, [t, 0]));
    faceVertices.push(foldPanel.vertex(hoodOpeningPoint(angle, "outer"), foldNormal, [t, 1]));
  }
  for (let index = 0; index < hoodFoldSegments; index += 1) {
    foldPanel.indices.push(
      rearVertices[index], rearVertices[index + 1], faceVertices[index + 1],
      rearVertices[index], faceVertices[index + 1], faceVertices[index]
    );
  }
  applyAreaWeightedVertexNormals(foldPanel);
  for (let offset = 0; offset < foldPanel.indices.length; offset += 3) {
    const triangle = foldPanel.indices.slice(offset, offset + 3);
    const points = triangle.map((vertex) => foldPanel.position(vertex));
    const ab = points[1].map((value, axis) => value - points[0][axis]);
    const ac = points[2].map((value, axis) => value - points[0][axis]);
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const averageNormal = triangle.reduce((result, vertex) => {
      const normal = foldPanel.normal(vertex);
      return result.map((value, axis) => value + normal[axis]);
    }, [0, 0, 0]);
    if (face[0] * averageNormal[0] + face[1] * averageNormal[1] + face[2] * averageNormal[2] < 0) {
      [foldPanel.indices[offset + 1], foldPanel.indices[offset + 2]] = [foldPanel.indices[offset + 2], foldPanel.indices[offset + 1]];
    }
  }
  appendGeometry(geometry, foldPanel);
  return geometry;
};

const hoodInteriorCavity = () => {
  const geometry = new Geometry();
  const segments = hoodEntranceAngles.length;
  const rings = [
    { centre: [0, 1.012, -0.115], radii: [0.138, 0.049], openingEdge: true },
    { centre: [0, 0.950, -0.110], radii: [0.105, 0.035] },
    { centre: [0, 0.890, -0.132], radii: [0.055, 0.015] }
  ];
  const vertices = rings.map((ring, row) => Array.from({ length: segments }, (_, column) => {
    const angle = hoodEntranceAngles[column];
    const position = ring.openingEdge
      ? hoodOpeningPoint(angle, "inner")
      : [
          ring.centre[0] + Math.cos(angle) * ring.radii[0],
          ring.centre[1],
          ring.centre[2] + Math.sin(angle) * ring.radii[1]
        ];
    const normal = normalise([-Math.cos(angle) / ring.radii[0], row === 0 ? -0.08 : 0.08, -Math.sin(angle) / ring.radii[1]]);
    return geometry.vertex(position, normal, [column / segments, row / (rings.length - 1)]);
  }));
  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const next = (column + 1) % segments;
      smoothIndexedQuad(geometry, [
        vertices[row][column], vertices[row][next],
        vertices[row + 1][next], vertices[row + 1][column]
      ]);
    }
  }
  return geometry;
};

const hoodCentreSeam = ({ startY = 0.750, endY = 0.930, segments = 18 } = {}) => {
  const geometry = new Geometry();
  const point = (y, x) => [x, y, -0.175 + 0.006 * ((y - startY) / (endY - startY))];
  for (let index = 0; index < segments; index += 1) {
    const y0 = startY + index / segments * (endY - startY);
    const y1 = startY + (index + 1) / segments * (endY - startY);
    orientedQuad(geometry, [point(y0, 0.004), point(y0, -0.004), point(y1, -0.004), point(y1, 0.004)], [0, 0, -1]);
  }
  return geometry;
};

const extrudePolygonZ = (inputPoints, depth) => {
  const geometry = new Geometry();
  const signedArea = inputPoints.reduce((area, point, index) => {
    const next = inputPoints[(index + 1) % inputPoints.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const points = signedArea >= 0 ? inputPoints : inputPoints.toReversed();
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
  const frames = sleeveFrames(rings);
  const point = sleevePoint;
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
      const vertices = points.map((entry, pointIndex) => geometry.vertex(entry, normals[pointIndex], [
        (index + [0, 1, 1, 0][pointIndex]) / segments,
        (row + [0, 0, 1, 1][pointIndex]) / (frames.length - 1)
      ]));
      geometry.indices.push(vertices[0], vertices[1], vertices[2], vertices[0], vertices[2], vertices[3]);
    }
  }
  const start = frames[0];
  const end = frames.at(-1);
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const startCentre = [start.centre[0], start.centre[1], start.centre[2] || 0];
    const endCentre = [end.centre[0], end.centre[1], end.centre[2] || 0];
    if (capStart) geometry.triangle([startCentre, point(start, a1), point(start, a0)], start.tangent.map((value) => -value));
    if (capEnd) geometry.triangle([endCentre, point(end, a0), point(end, a1)], end.tangent);
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

const positiveModulo = (value, modulus) => (value % modulus + modulus) % modulus;

const stitchedGarmentShell = ({
  torsoRings,
  rightSleeveRings,
  uvBounds,
  torsoSegments = 40,
  armholeStartRow = 3,
  armholeEndRow = 7,
  armholeHalfColumns = 5,
  transitionRows = 1,
  maximumTransitionOffsetM = 0.030,
  areaWeightedNormals = false
}) => {
  const geometry = new Geometry();
  const [minX, minY, maxX, maxY] = uvBounds;
  const garmentUv = ([x, y]) => [(x - minX) / (maxX - minX), (y - minY) / (maxY - minY)];
  const torsoVertices = torsoRings.map((_, row) => Array.from({ length: torsoSegments }, (_, column) => {
    const angle = column / torsoSegments * Math.PI * 2;
    const position = tailoredTorsoPoint(torsoRings, row, angle);
    return geometry.vertex(position, tailoredTorsoNormal(torsoRings, row, angle), garmentUv(position));
  }));
  const armholeCentres = [0, torsoSegments / 2];
  const removedCell = (row, column) => row >= armholeStartRow && row < armholeEndRow
    && armholeCentres.some((centre) => {
      const delta = positiveModulo(column - centre + torsoSegments / 2, torsoSegments) - torsoSegments / 2;
      return delta >= -armholeHalfColumns && delta < armholeHalfColumns;
    });
  for (let row = 0; row < torsoRings.length - 1; row += 1) {
    for (let column = 0; column < torsoSegments; column += 1) {
      if (removedCell(row, column)) continue;
      const next = positiveModulo(column + 1, torsoSegments);
      smoothIndexedQuad(geometry, [
        torsoVertices[row][column],
        torsoVertices[row + 1][column],
        torsoVertices[row + 1][next],
        torsoVertices[row][next]
      ]);
    }
  }

  const armholeLoop = (centreColumn) => {
    const startColumn = centreColumn - armholeHalfColumns;
    const endColumn = centreColumn + armholeHalfColumns;
    const loop = [];
    for (let column = startColumn; column <= endColumn; column += 1) loop.push(torsoVertices[armholeStartRow][positiveModulo(column, torsoSegments)]);
    for (let row = armholeStartRow + 1; row <= armholeEndRow; row += 1) loop.push(torsoVertices[row][positiveModulo(endColumn, torsoSegments)]);
    for (let column = endColumn - 1; column >= startColumn; column -= 1) loop.push(torsoVertices[armholeEndRow][positiveModulo(column, torsoSegments)]);
    for (let row = armholeEndRow - 1; row > armholeStartRow; row -= 1) loop.push(torsoVertices[row][positiveModulo(startColumn, torsoSegments)]);
    return loop;
  };

  const addSleeve = ({ side, sleeveRings, bodyLoop }) => {
    const frames = sleeveFrames(sleeveRings);
    assert.equal(bodyLoop.length, 28, "armhole loop must correspond one-to-one with the sleeve root");
    const sleeveNormal = (frame, angle) => normalise([
      frame.perpendicular[0] * Math.cos(angle),
      frame.perpendicular[1] * Math.cos(angle),
      Math.sin(angle)
    ]);
    const armholeCentre = bodyLoop.reduce((result, vertex) => {
      const position = geometry.position(vertex);
      return result.map((value, axis) => value + position[axis] / bodyLoop.length);
    }, [0, 0, 0]);
    const sleeveAngles = bodyLoop.map((vertex) => {
      const position = geometry.position(vertex);
      const across = ((position[0] - armholeCentre[0]) * frames[0].perpendicular[0]
        + (position[1] - armholeCentre[1]) * frames[0].perpendicular[1]) / frames[0].radius;
      const depth = (position[2] - armholeCentre[2]) / frames[0].depth;
      return Math.atan2(depth, across);
    });
    for (let index = 1; index < sleeveAngles.length; index += 1) {
      while (sleeveAngles[index] - sleeveAngles[index - 1] > Math.PI) sleeveAngles[index] -= Math.PI * 2;
      while (sleeveAngles[index] - sleeveAngles[index - 1] < -Math.PI) sleeveAngles[index] += Math.PI * 2;
    }
    const seamNormals = [];
    const bodyPositions = bodyLoop.map((bodyVertex) => geometry.position(bodyVertex));
    bodyLoop.forEach((bodyVertex, index) => {
      const angle = sleeveAngles[index];
      const bodyNormal = geometry.normal(bodyVertex);
      const radialNormal = sleeveNormal(frames[0], angle);
      const seamNormal = normalise(bodyNormal.map((value, axis) => value * 0.72 + radialNormal[axis] * 0.28));
      seamNormals.push(seamNormal);
      geometry.setNormal(bodyVertex, seamNormal);
    });

    let previousRing = bodyLoop;
    let sleeveFramesToLoft = frames;
    if (transitionRows === 1) {
      const rootRing = bodyLoop.map((bodyVertex, index) => {
        const position = bodyPositions[index].map((value, axis) => value + frames[0].tangent[axis] * maximumTransitionOffsetM);
        return geometry.vertex(position, seamNormals[index], garmentUv(position));
      });
      for (let index = 0; index < bodyLoop.length; index += 1) {
        const next = (index + 1) % bodyLoop.length;
        smoothIndexedQuad(geometry, [bodyLoop[index], bodyLoop[next], rootRing[next], rootRing[index]]);
      }
      previousRing = rootRing;
    } else {
      for (let transitionRow = 1; transitionRow <= transitionRows; transitionRow += 1) {
        const t = transitionRow / transitionRows;
        const eased = t * t * (3 - 2 * t);
        const bias = maximumTransitionOffsetM * Math.sin(Math.PI * t);
        const transitionFrame = frames[Math.min(transitionRow - 1, frames.length - 1)];
        const ring = bodyLoop.map((_, index) => {
          const angle = sleeveAngles[index];
          const target = sleevePoint(transitionFrame, angle);
          const position = bodyPositions[index].map((value, axis) => value * (1 - eased) + target[axis] * eased + transitionFrame.tangent[axis] * bias);
          const radialNormal = sleeveNormal(transitionFrame, angle);
          const normal = normalise(seamNormals[index].map((value, axis) => value * (1 - eased) + radialNormal[axis] * eased));
          return geometry.vertex(position, normal, garmentUv(position));
        });
        for (let index = 0; index < ring.length; index += 1) {
          const next = (index + 1) % ring.length;
          smoothIndexedQuad(geometry, [previousRing[index], previousRing[next], ring[next], ring[index]]);
        }
        previousRing = ring;
      }
      sleeveFramesToLoft = frames.slice(Math.min(transitionRows, frames.length));
    }

    for (const [row, frame] of sleeveFramesToLoft.entries()) {
      const ring = Array.from({ length: bodyLoop.length }, (_, index) => {
        const angle = sleeveAngles[index];
        const position = sleevePoint(frame, angle);
        const radialNormal = sleeveNormal(frame, angle);
        const radialBlend = transitionRows === 1 ? Math.min(1, row / 4) : 1;
        const normal = normalise(seamNormals[index].map((value, axis) => value * (1 - radialBlend) + radialNormal[axis] * radialBlend));
        return geometry.vertex(position, normal, garmentUv(position));
      });
      for (let index = 0; index < ring.length; index += 1) {
        const next = (index + 1) % ring.length;
        smoothIndexedQuad(geometry, [previousRing[index], previousRing[next], ring[next], ring[index]]);
      }
      previousRing = ring;
    }
  };

  addSleeve({ side: 1, sleeveRings: rightSleeveRings, bodyLoop: armholeLoop(0) });
  const leftSleeveRings = rightSleeveRings.map((ring) => ({ ...ring, centre: [-ring.centre[0], ring.centre[1], ring.centre[2] || 0] }));
  addSleeve({ side: -1, sleeveRings: leftSleeveRings, bodyLoop: armholeLoop(torsoSegments / 2) });
  finaliseSmoothIndexedShell(geometry, { areaWeightedNormals });
  return {
    geometry,
    leftSleeveRings,
    armholeRingVertexCount: 2 * ((armholeHalfColumns * 2) + (armholeEndRow - armholeStartRow)),
    garmentUvMapping: { type: "global-xy-projection", boundsM: uvBounds },
    armholeTransitionRows: transitionRows,
    transitionFrameSpan: transitionRows > 1 ? Math.min(transitionRows, rightSleeveRings.length) : 1,
    maximumTransitionOffsetM,
    transitionInterpolation: transitionRows > 1 ? "smoothstep-body-to-progressive-sleeve-frames" : "single-offset-legacy-tee",
    normalRelaxation: areaWeightedNormals ? "area-weighted-shared-indexed-surface" : "iterative-shared-ring-blend"
  };
};

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
    const normal = normalise([x / bodyHalfWidth ** 2, 0, sideSign * ellipse / bodyHalfDepth]);
    const base = [x, cy - height / 2 + height * v, sideSign * bodyHalfDepth * ellipse];
    return {
      position: base.map((value, axis) => value + normal[axis] * surfaceOffset),
      normal,
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

const ellipticalRingY = ({ centre, outer, inner, height, frontDrop = 0, segments = 36 }) => {
  const geometry = new Geometry();
  const [cx, cy, cz] = centre;
  const y0 = cy - height / 2;
  const y1 = cy + height / 2;
  const point = (radii, angle, y) => [cx + Math.cos(angle) * radii[0], y - frontDrop * Math.max(0, Math.sin(angle)), cz + Math.sin(angle) * radii[1]];
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    orientedQuad(geometry, [point(outer, a0, y1), point(outer, a1, y1), point(inner, a1, y1), point(inner, a0, y1)], [0, 1, 0]);
    orientedQuad(geometry, [point(outer, a1, y0), point(outer, a0, y0), point(inner, a0, y0), point(inner, a1, y0)], [0, -1, 0]);
    orientedQuad(geometry, [point(outer, a0, y0), point(outer, a1, y0), point(outer, a1, y1), point(outer, a0, y1)], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    orientedQuad(geometry, [point(inner, a1, y0), point(inner, a0, y0), point(inner, a0, y1), point(inner, a1, y1)], [-Math.cos((a0 + a1) / 2), 0, -Math.sin((a0 + a1) / 2)]);
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

const crownPanel = (panelIndex, { panels = 6, azimuthSegments = 60, verticalSegments = 48 } = {}) => {
  const geometry = new Geometry();
  const radiusX = 0.125;
  const radiusZ = 0.120;
  const baseY = 0.055;
  const height = 0.205;
  const start = -Math.PI / panels + panelIndex * Math.PI * 2 / panels;
  const end = start + Math.PI * 2 / panels;
  const point = (azimuth, elevation) => {
    const panelProgress = (azimuth - start) / (end - start);
    const panelShape = 1 + 0.020 * Math.sin(Math.PI * panelProgress) * Math.sin(elevation);
    const radial = Math.cos(elevation) ** 0.62 * panelShape;
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
      const triangleCentroids = [[0, 1, 2], [0, 2, 3]].map((corners) => corners.reduce((result, pointIndex) => result.map((value, axis) => value + points[pointIndex][axis] / 3), [0, 0, 0]));
      const rearAperture = triangleCentroids.some((sample) => sample[2] < -0.060
        && (sample[0] / 0.060) ** 2 + ((sample[1] - 0.115) / 0.052) ** 2 < 1);
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

const crownConstructionPoint = (azimuth, elevation, radialOffset = 0) => {
  const radiusX = 0.125 + radialOffset;
  const radiusZ = 0.120 + radialOffset;
  const radial = Math.cos(elevation) ** 0.62;
  return [radiusX * Math.sin(azimuth) * radial, 0.055 + 0.205 * Math.sin(elevation), radiusZ * Math.cos(azimuth) * radial];
};

const crownRibbons = ({ offsetAngles, halfWidth, radialOffset }) => {
  const geometry = new Geometry();
  const verticalSegments = 16;
  const topElevation = Math.PI / 2 * 0.91;
  for (const azimuth of offsetAngles) {
    for (let row = 0; row < verticalSegments; row += 1) {
      const e0 = 0.035 + row / verticalSegments * (topElevation - 0.035);
      const e1 = 0.035 + (row + 1) / verticalSegments * (topElevation - 0.035);
      const middle = crownConstructionPoint(azimuth, (e0 + e1) / 2, radialOffset);
      const normal = normalise([middle[0] / 0.125 ** 2, (middle[1] - 0.055) / 0.205 ** 2, middle[2] / 0.120 ** 2]);
      orientedQuad(geometry, [
        crownConstructionPoint(azimuth - halfWidth, e0, radialOffset),
        crownConstructionPoint(azimuth + halfWidth, e0, radialOffset),
        crownConstructionPoint(azimuth + halfWidth, e1, radialOffset),
        crownConstructionPoint(azimuth - halfWidth, e1, radialOffset)
      ], normal);
    }
  }
  return geometry;
};

const capEyelets = () => {
  const geometry = new Geometry();
  for (const centre of [[-0.074, 0.178, 0.090], [0.074, 0.178, 0.090], [-0.108, 0.162, 0.022], [0.108, 0.162, 0.022]]) {
    appendGeometry(geometry, ellipticalRingZ({ centre, outer: [0.0060, 0.0052], inner: [0.0032, 0.0028], depth: 0.0025, segments: 20 }));
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

const curvedBrimStitching = ({ widthSegments = 32 } = {}) => {
  const geometry = new Geometry();
  const point = (u, v) => {
    const halfWidth = 0.100 + 0.035 * Math.sin(Math.PI * v * 0.8);
    const x = u * halfWidth;
    const z = 0.075 + 0.180 * v - 0.012 * u * u;
    const y = 0.0158 + 0.010 * Math.abs(u) + 0.036 * (1 - v);
    return [x, y, z];
  };
  for (const rowV of [0.82, 0.91]) {
    for (let column = 0; column < widthSegments; column += 1) {
      const u0 = -0.91 + column / widthSegments * 1.82;
      const u1 = -0.91 + (column + 1) / widthSegments * 1.82;
      orientedQuad(geometry, [point(u0, rowV - 0.004), point(u1, rowV - 0.004), point(u1, rowV + 0.004), point(u0, rowV + 0.004)], [0, 1, 0]);
    }
  }
  return geometry;
};

const crownBillTransition = ({ segments = 28 } = {}) => {
  const geometry = new Geometry();
  const point = (u, z) => {
    const x = u * 0.108;
    const edgeRise = 0.005 * u ** 2;
    return [x, 0.051 + edgeRise, z - 0.006 * u ** 2];
  };
  for (let index = 0; index < segments; index += 1) {
    const u0 = -1 + index / segments * 2;
    const u1 = -1 + (index + 1) / segments * 2;
    orientedQuad(geometry, [point(u0, 0.071), point(u1, 0.071), point(u1, 0.123), point(u0, 0.123)], [0, 1, 0]);
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
    .setDoubleSided(preset.doubleSided ?? Boolean(preset.surface))
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
    .setDoubleSided(source.materials.artwork.doubleSided ?? true);
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
  const torsoRings = [
    { y: 0, halfWidth: 0.31, halfDepth: 0.058, centreX: 0, centreZ: 0, hemCurve: 0.014, fold: 0.002 },
    { y: 0.18, halfWidth: 0.32, halfDepth: 0.066, centreX: 0, centreZ: 0, fold: 0.004 },
    { y: 0.54, halfWidth: 0.34, halfDepth: 0.073, centreX: 0, centreZ: 0, fold: 0.006 },
    { y: 0.75, halfWidth: 0.35, halfDepth: 0.075, centreX: 0, centreZ: 0, fold: 0.004 },
    { y: 0.82, halfWidth: 0.36, halfDepth: 0.075, centreX: 0, centreZ: 0, fold: 0.003 },
    { y: 0.89, halfWidth: 0.36, halfDepth: 0.074, centreX: 0, centreZ: 0, fold: 0.002 },
    { y: 0.95, halfWidth: 0.355, halfDepth: 0.073, centreX: 0, centreZ: 0 },
    { y: 1.000, halfWidth: 0.300, halfDepth: 0.068, centreX: 0, centreZ: 0 },
    { y: 1.040, halfWidth: 0.14, halfDepth: 0.063, centreX: 0, centreZ: 0, frontDrop: 0.035 }
  ];
  const rightSleeve = smoothSleeveRings({
    start: [0.345, 0.875], control: [0.423, 0.830], end: [0.5159, 0.715],
    startRadius: 0.105, endRadius: 0.068, radiusBulge: 0.010,
    startDepth: 0.065, endDepth: 0.045, samples: 14
  });
  const stitched = stitchedGarmentShell({ torsoRings, rightSleeveRings: rightSleeve, uvBounds: [-0.66, 0, 0.66, 1.08] });
  const leftSleeve = stitched.leftSleeveRings;
  addNode(doc, assembly, buffer, "T_Shirt_Draped_Shell", stitched.geometry, materials.fabric, {
    role: "continuous-garment-shell",
    construction: "tailored-torso-attached-sleeves",
    shoulderDropM: 0.075,
    sleeveAttachment: "shared-armhole-rings",
    armholeCoverage: "torso-holes-stitched-to-matching-sleeve-root-rings",
    sleeveRootCaps: 0,
    armholeRingVertexCount: stitched.armholeRingVertexCount,
    stitchFacesPerSide: stitched.armholeRingVertexCount,
    garmentUvMapping: stitched.garmentUvMapping,
    normalContinuity: "blended-shared-ring-normals",
    sleeveCrossSection: "flattened-relaxed-elliptical-open-cuff",
    shoulderSleeveContinuity: true,
    frontBackReadable: true,
    dimensionsAuthority: source.dimensions.authority
  });
  addNode(doc, assembly, buffer, "T_Shirt_Collar", ellipticalRingY({ centre: [0, 1.032, 0], outer: [0.155, 0.080], inner: [0.108, 0.052], height: 0.018, frontDrop: 0.038 }), materials.collar, { role: "dimensional-collar", opening: "unfilled-neckline", frontDropM: 0.038, innerDepthM: 0.052, constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "T_Shirt_Collar_Interior", ellipticalRingY({ centre: [0, 1.014, 0], outer: [0.108, 0.052], inner: [0.096, 0.043], height: 0.040, frontDrop: 0.035 }), materials.interior, { role: "shadowed-inner-rib-wall", opening: "unfilled-dark-cavity", constructionAccuracyClaim: false });
  const sleeveHems = new Geometry();
  appendGeometry(sleeveHems, loftedTubeAlongPath(rightSleeve.slice(-3), { segments: 28, capStart: false, capEnd: false }));
  appendGeometry(sleeveHems, loftedTubeAlongPath(leftSleeve.slice(-3), { segments: 28, capStart: false, capEnd: false }));
  addNode(doc, assembly, buffer, "T_Shirt_Sleeve_Hems", sleeveHems, materials.collar, { role: "tubular-sleeve-hem-rims", opening: "unfilled-cuff-rims" });
  const hem = tailoredTorso([torsoRings[0], { ...torsoRings[0], y: 0.028, halfWidth: 0.312, halfDepth: 0.060 }], { segments: 36 });
  addNode(doc, assembly, buffer, "T_Shirt_Curved_Hem", hem.geometry, materials.collar, { role: "level-curved-hem-rim", profile: "level-curved-drape", integratedByOverlap: true });
  addNode(doc, assembly, buffer, "T_Shirt_Front_Artwork", curvedArtworkSurface({ centre: [0, 0.655], size: [0.300, 0.1125], bodyHalfWidth: 0.34, bodyHalfDepth: 0.073, side: "front", surfaceOffset: 0.012 }), materials.artwork, { role: "exact-front-artwork", surfaceMm: source.artwork.registration.surfaceMm, normalOffsetMm: 12, uvCoverage: "full-source-0-1", sourceSha256: source.artwork.sha256 });
};

const buildHoodie = (doc, assembly, buffer, source, materials) => {
  const torsoRings = [
    { y: 0.065, halfWidth: 0.335, halfDepth: 0.078, centreX: 0, centreZ: 0, fold: 0.003 },
    { y: 0.22, halfWidth: 0.350, halfDepth: 0.084, centreX: 0, centreZ: 0, fold: 0.005 },
    { y: 0.55, halfWidth: 0.370, halfDepth: 0.090, centreX: 0, centreZ: 0, fold: 0.008 },
    { y: 0.76, halfWidth: 0.380, halfDepth: 0.092, centreX: 0, centreZ: 0, fold: 0.006 },
    { y: 0.83, halfWidth: 0.382, halfDepth: 0.093, centreX: 0, centreZ: 0, fold: 0.003 },
    { y: 0.90, halfWidth: 0.375, halfDepth: 0.094, centreX: 0, centreZ: 0, fold: 0.002 },
    { y: 0.96, halfWidth: 0.350, halfDepth: 0.092, centreX: 0, centreZ: 0 },
    { y: 1.025, halfWidth: 0.250, halfDepth: 0.080, centreX: 0, centreZ: 0, rearDrop: 0.035 },
    { y: 1.065, halfWidth: 0.150, halfDepth: 0.068, centreX: 0, centreZ: 0, frontDrop: 0.025, rearDrop: 0.092 }
  ];
  const rightSleeve = smoothSleeveRings({
    start: [0.370, 0.875], control: [0.455, 0.840], end: [0.520, 0.225],
    startRadius: 0.115, endRadius: 0.070, radiusBulge: 0.016,
    startDepth: 0.080, endDepth: 0.052, samples: 18
  });
  const stitched = stitchedGarmentShell({
    torsoRings,
    rightSleeveRings: rightSleeve,
    uvBounds: [-0.69, 0, 0.69, 1.10],
    transitionRows: 8,
    maximumTransitionOffsetM: 0.004,
    areaWeightedNormals: true
  });
  const leftSleeve = stitched.leftSleeveRings;
  addNode(doc, assembly, buffer, "Hoodie_Draped_Shell", stitched.geometry, materials.fabric, {
    role: "continuous-garment-shell",
    construction: "tailored-torso-attached-sleeves",
    sleeveAttachment: "shared-armhole-rings",
    armholeCoverage: "torso-holes-stitched-to-matching-sleeve-root-rings",
    sleeveRootCaps: 0,
    armholeRingVertexCount: stitched.armholeRingVertexCount,
    stitchFacesPerSide: stitched.armholeRingVertexCount,
    garmentUvMapping: stitched.garmentUvMapping,
    normalContinuity: "blended-shared-ring-normals",
    armholeTransitionRows: stitched.armholeTransitionRows,
    transitionFrameSpan: stitched.transitionFrameSpan,
    maximumTransitionOffsetM: stitched.maximumTransitionOffsetM,
    transitionInterpolation: stitched.transitionInterpolation,
    normalRelaxation: stitched.normalRelaxation,
    sleeveCrossSection: "relaxed-tapered-long-sleeve-open-cuff",
    shoulderSleeveContinuity: true,
    frontBackReadable: true,
    dimensionsAuthority: source.dimensions.authority
  });
  const cuffs = new Geometry();
  appendGeometry(cuffs, loftedTubeAlongPath(rightSleeve.slice(-4), { segments: 28, capStart: false, capEnd: false }));
  appendGeometry(cuffs, loftedTubeAlongPath(leftSleeve.slice(-4), { segments: 28, capStart: false, capEnd: false }));
  addNode(doc, assembly, buffer, "Hoodie_Shaped_Cuffs", cuffs, materials.rib, { role: "conforming-rib-cuffs", opening: "unfilled-cuff-rims", integratedByOverlap: true });
  const waistband = tailoredTorso([
    { y: 0, halfWidth: 0.325, halfDepth: 0.074, centreX: 0, centreZ: 0 },
    { y: 0.055, halfWidth: 0.335, halfDepth: 0.078, centreX: 0, centreZ: 0 },
    { y: 0.110, halfWidth: 0.345, halfDepth: 0.082, centreX: 0, centreZ: 0 }
  ], { segments: 36 });
  addNode(doc, assembly, buffer, "Hoodie_Waistband", waistband.geometry, materials.rib, { role: "conforming-rib-waistband", integration: "conforming-body-overlap", opening: "unfilled-body-rim" });
  addNode(doc, assembly, buffer, "Hoodie_Open_Hood_Shell", openHoodShell(), materials.fabric, {
    role: "open-attached-hood-shell",
    opening: "unfilled-face-cavity",
    construction: "attached-two-panel-down-hood",
    panelCount: 2,
    orientation: "down-resting-on-upper-back",
    openingPlane: "upward-forward-neckline",
    openingForwardPitchDegrees: 22,
    rearViewOcclusion: "solid-exterior-shell-behind-cavity",
    rearExterior: "solid-two-lobe-panel",
    openingLip: "partial-irregular-front-and-side-fold",
    openingLipClosed: false,
    openingLipArcDegrees: 196,
    openingLipSections: hoodFoldSegments,
    openingLipThicknessRangeM: [0.006, 0.021],
    openingLipVerticalVariationM: 0.040,
    openingLipMaterial: "shared-shell-fabric",
    openingLipNormalMode: "area-weighted-fold-surface",
    torsoNecklineOcclusion: "rear-neckline-tucked-below-hood-lobes",
    foldPanelSurface: "filled-between-rear-lobes-and-partial-face-edge",
    foldPanelRearDropM: 0.125,
    foldPanelRearwardDrapeM: 0.035,
    foldPanelProjection: "rear-exterior-outside-aperture",
    detachedPerimeterBand: false,
    archEndpoints: "rounded-below-opening-lip",
    necklineOverlapM: 0.285,
    shoulderDrapeWidthM: 0.53,
    attachedAtNecklineY: 1.035,
    containsHeadForm: false,
    constructionAccuracyClaim: false
  });
  addNode(doc, assembly, buffer, "Hoodie_Hood_Interior_Cavity", hoodInteriorCavity(), materials.hoodInterior, {
    role: "material-backed-hood-interior",
    opening: "uncapped-entrance-and-throat",
    depthM: 0.117,
    entranceJoinPositions: hoodFoldSegments + 1,
    joinedTo: "Hoodie_Open_Hood_Shell"
  });
  addNode(doc, assembly, buffer, "Hoodie_Hood_Centre_Seam", hoodCentreSeam(), materials.rib, { role: "hood-rear-centre-seam", constructionAccuracyClaim: false });
  addNode(doc, assembly, buffer, "Hoodie_Back_Artwork", curvedArtworkSurface({ centre: [0, 0.655], size: [0.300, 0.1125], bodyHalfWidth: 0.38, bodyHalfDepth: 0.090, side: "back", surfaceOffset: 0.010 }), materials.artwork, { role: "exact-back-artwork", surfaceMm: source.artwork.registration.surfaceMm, normalOffsetMm: 10, uvCoverage: "full-source-0-1", sourceSha256: source.artwork.sha256 });
};

const buildCap = (doc, assembly, buffer, source, materials) => {
  for (let index = 0; index < 6; index += 1) {
    addNode(doc, assembly, buffer, `Cap_Panel_${String(index + 1).padStart(2, "0")}`, crownPanel(index), materials.crown, { role: "crown-panel", panel: index + 1, panelCount: 6, constructionAccuracyClaim: false });
  }
  const seamAngles = Array.from({ length: 6 }, (_, index) => -Math.PI / 6 + index * Math.PI / 3);
  addNode(doc, assembly, buffer, "Cap_Crown_Seams", crownRibbons({ offsetAngles: seamAngles, halfWidth: 0.010, radialOffset: 0.0015 }), materials.seam, { role: "raised-tonal-panel-seams", panelCount: 6 });
  addNode(doc, assembly, buffer, "Cap_Crown_Creases", crownRibbons({ offsetAngles: [-2 * Math.PI / 3, -Math.PI / 3, 0, Math.PI / 3, 2 * Math.PI / 3], halfWidth: 0.004, radialOffset: 0.0010 }), materials.seam, { role: "subtle-panel-form-creases" });
  addNode(doc, assembly, buffer, "Cap_Eyelets", capEyelets(), materials.seam, { role: "embroidered-vent-eyelets", count: 4 });
  addNode(doc, assembly, buffer, "Cap_Curved_Brim", curvedBrim({ widthSegments: 32, lengthSegments: 20 }), materials.crown, { role: "curved-dimensional-brim", curvatureAxes: 2, productionDimensionsClaim: false });
  addNode(doc, assembly, buffer, "Cap_Bill_Edge_Stitching", curvedBrimStitching(), materials.seam, { role: "tonal-bill-edge-stitching", rows: 2 });
  addNode(doc, assembly, buffer, "Cap_Crown_Bill_Transition", crownBillTransition(), materials.seam, { role: "front-crown-bill-join" });
  addNode(doc, assembly, buffer, "Cap_Top_Button", cylinderY({ centre: [0, 0.263, 0], radius: 0.008, height: 0.006 }), materials.seam, { role: "top-button" });
  addNode(doc, assembly, buffer, "Cap_Rear_Aperture_Rim", ellipticalRingZ({ centre: [0, 0.115, -0.108], outer: [0.068, 0.060], inner: [0.057, 0.049], depth: 0.007, segments: 64 }), materials.seam, { role: "rear-aperture-boundary", opening: "unfilled-through-aperture", crownGeometryRemoved: true, profile: "smooth-bound-edge-over-topology-cut" });
  addNode(doc, assembly, buffer, "Cap_Adjustment_Strap", boxGeometry([0, 0.069, -0.117], [0.136, 0.010, 0.007]), materials.seam, { role: "single-rear-adjustment-strap", bridgesAperture: true, alignedWithLowerRim: true, mechanismMeasured: false });
  addNode(doc, assembly, buffer, "Cap_Adjustment_Keeper", boxGeometry([0.040, 0.069, -0.125], [0.014, 0.020, 0.005]), materials.hardware, { role: "small-adjustment-keeper", mechanismMeasured: false });
  addNode(doc, assembly, buffer, "Cap_Patch_Border", curvedArtworkSurface({ centre: [0, 0.150], size: [0.061, 0.034], bodyHalfWidth: 0.125, bodyHalfDepth: 0.115, side: "front", surfaceOffset: 0.0040 }), materials.seam, { role: "patch-stitch-border", integration: "stitched-conforming-border" });
  addNode(doc, assembly, buffer, "Cap_Front_Patch", curvedArtworkSurface({ centre: [0, 0.150], size: [0.055, 0.028], bodyHalfWidth: 0.125, bodyHalfDepth: 0.115, side: "front", surfaceOffset: 0.0055 }), materials.patch, { role: "bone-woven-patch", nominalMm: source.artwork.registration.patchMm, standOffMm: 5.5, vendorProofRequired: true });
  addNode(doc, assembly, buffer, "Cap_Patch_Mark", curvedArtworkSurface({ centre: [0, 0.150], size: [0.020, 0.020], bodyHalfWidth: 0.125, bodyHalfDepth: 0.115, side: "front", surfaceOffset: 0.0075, widthSegments: 8, heightSegments: 4 }), materials.artwork, { role: "exact-compact-mark", surfaceMm: source.artwork.registration.surfaceMm, normalOffsetMm: 7.5, uvCoverage: "full-source-0-1", sourceSha256: source.artwork.sha256 });
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
