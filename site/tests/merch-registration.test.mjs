import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFile = promisify(execFileCallback);
const registrationPath = path.join(siteRoot, "data", "apparel-print-registration-v02.json");
const safeProjectPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

const expectedGarments = Object.freeze({
  "t-shirt": {
    master: {
      path: "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png",
      sha256: "c46bf6bd82ea2ec6928e9fe4ca9a314b56580af49c044be0395579c43c06dada"
    },
    approvedHero: {
      path: "assets/merch/t-shirt-front.webp",
      canvas: { width: 1600, height: 900 },
      placement: [528, 350, 480, 180]
    },
    views: {
      "print-macro": "assets/merch/t-shirt-print-macro.webp",
      "on-body": "assets/merch/t-shirt-on-body.webp"
    }
  },
  hoodie: {
    master: {
      path: "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png",
      sha256: "284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f"
    },
    approvedHero: {
      path: "assets/merch/hoodie-rear.webp",
      canvas: { width: 1600, height: 900 },
      placement: [552, 365, 432, 162]
    },
    views: {
      "print-macro": "assets/merch/hoodie-print-macro.webp",
      "worn-rear": "assets/merch/hoodie-worn-rear.webp"
    }
  }
});

const readRegistration = async () => {
  const source = await readFile(registrationPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  assert.ok(source, "apparel-print-registration-v02.json must freeze the approved physical print system");
  return JSON.parse(source);
};

const assertAssetReference = (reference, label) => {
  assert.ok(reference && typeof reference === "object" && !Array.isArray(reference), `${label} must be an object`);
  assert.match(reference.path || "", safeProjectPath, `${label}.path must be a base-safe project path`);
  assert.match(reference.sha256 || "", sha256Pattern, `${label}.sha256 must lock exact source pixels`);
};

const determinant3 = ([a, b, c, d, e, f, g, h, i]) => (
  a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
);

const inverse3 = (matrix) => {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = determinant3(matrix);
  assert.ok(Math.abs(determinant) > 1e-9, "artwork homography must be invertible");
  return [
    e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d
  ].map((value) => value / determinant);
};

const project = (matrix, point) => {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const divisor = g * point.x + h * point.y + i;
  assert.ok(Math.abs(divisor) > 1e-9, "homography projected a point to infinity");
  return {
    x: (a * point.x + b * point.y + c) / divisor,
    y: (d * point.x + e * point.y + f) / divisor
  };
};

const bounds = (points) => ({
  left: Math.min(...points.map(({ x }) => x)),
  right: Math.max(...points.map(({ x }) => x)),
  top: Math.min(...points.map(({ y }) => y)),
  bottom: Math.max(...points.map(({ y }) => y))
});

test("locks the canonical 1600x600 / 300x112.5 mm plane and exact artwork masters", async () => {
  const registration = await readRegistration();
  assert.equal(registration.schemaVersion, 2);
  assert.deepEqual(registration.canonicalPlane, {
    width: 1600,
    height: 600,
    physicalSizeMm: { width: 300, height: 112.5 },
    tolerances: { scale: 0.02, center: 0.02 }
  });
  assert.deepEqual(Object.keys(registration.garments || {}), Object.keys(expectedGarments));

  for (const [slug, expected] of Object.entries(expectedGarments)) {
    const garment = registration.garments[slug];
    assert.deepEqual(garment.master, {
      ...expected.master,
      width: 1600,
      height: 600
    }, `${slug} must use the exact approved master`);
    const masterBytes = await readFile(path.join(siteRoot, garment.master.path));
    assert.equal(createHash("sha256").update(masterBytes).digest("hex"), expected.master.sha256, `${slug} master bytes drifted`);
    const { stdout } = await execFile("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0", path.join(siteRoot, garment.master.path)
    ]);
    assert.equal(stdout.trim(), "1600x600", `${slug} master raster dimensions drifted`);
    assert.equal(garment.approvedHero.path, expected.approvedHero.path, `${slug} approved hero source drifted`);
    assert.deepEqual(garment.approvedHero.canvas, expected.approvedHero.canvas, `${slug} approved hero canvas drifted`);
    const { x, y, width, height } = garment.approvedHero.placement || {};
    assert.deepEqual([x, y, width, height], expected.approvedHero.placement, `${slug} approved hero placement drifted`);
  }
});

test("declares an auditable surface quad, homography, garment mask and fabric layer for every recomposed view", async () => {
  const registration = await readRegistration();
  for (const [slug, expected] of Object.entries(expectedGarments)) {
    const views = registration.garments?.[slug]?.views;
    assert.deepEqual(Object.keys(views || {}), Object.keys(expected.views), `${slug} view contract must stay complete and ordered`);
    for (const [role, publicPath] of Object.entries(expected.views)) {
      const view = views[role];
      assert.equal(view.publicPath, publicPath);
      assert.deepEqual(view.output, { width: 1536, height: 1024 });
      assertAssetReference(view.base, `${slug}.${role}.base`);
      assertAssetReference(view.garmentMask, `${slug}.${role}.garmentMask`);
      assertAssetReference(view.fabricModulation, `${slug}.${role}.fabricModulation`);
      assert.equal(view.fabricModulation.enabled, true, `${slug}.${role} must preserve fold and fibre modulation`);
      assert.equal(view.surfaceAnchors?.length, 4, `${slug}.${role} needs four declared surface anchors`);
      for (const [index, anchor] of (view.surfaceAnchors || []).entries()) {
        assert.ok(Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y), `${slug}.${role}.surfaceAnchors[${index}] must be finite`);
      }
      assert.equal(view.artworkToOutput?.length, 9, `${slug}.${role} needs a 3x3 artwork-to-output homography`);
      assert.ok(view.artworkToOutput.every(Number.isFinite), `${slug}.${role} homography must contain finite numbers`);
      assert.ok(Math.abs(determinant3(view.artworkToOutput)) > 1e-9, `${slug}.${role} homography must be invertible`);
      assert.equal(view.sourceCorners?.length, 4, `${slug}.${role} must declare four governed master corners`);
      assert.equal(view.artworkQuad?.length, 4, `${slug}.${role} must declare four governed output corners`);
    }
  }
});

test("keeps every inverse-projected print within the normalized 0.02 scale and centre tolerances", async () => {
  const registration = await readRegistration();
  const tolerance = registration.canonicalPlane?.tolerances;
  assert.deepEqual(tolerance, { scale: 0.02, center: 0.02 });

  for (const [slug, garment] of Object.entries(registration.garments || {})) {
    for (const [role, view] of Object.entries(garment.views || {})) {
      const inverse = inverse3(view.artworkToOutput);
      const canonical = view.artworkQuad.map((point) => project(inverse, point));
      const actual = bounds(canonical);
      const actualWidth = actual.right - actual.left;
      const actualHeight = actual.bottom - actual.top;
      const widthScale = actualWidth / 1600 - 1;
      const heightScale = actualHeight / 600 - 1;
      const centerOffsetX = ((actual.left + actual.right) / 2 - 800) / 1600;
      const centerOffsetY = ((actual.top + actual.bottom) / 2 - 300) / 600;
      assert.ok(Math.abs(widthScale) <= tolerance.scale, `${slug}.${role} width exceeds +/-0.02`);
      assert.ok(Math.abs(heightScale) <= tolerance.scale, `${slug}.${role} height exceeds +/-0.02`);
      assert.ok(Math.abs(centerOffsetX) <= tolerance.center, `${slug}.${role} horizontal centre exceeds +/-0.02`);
      assert.ok(Math.abs(centerOffsetY) <= tolerance.center, `${slug}.${role} vertical centre exceeds +/-0.02`);
      assert.deepEqual(bounds(view.sourceCorners), { left: 0, right: 1600, top: 0, bottom: 600 }, `${slug}.${role} source corners must cover the exact master`);
    }
  }
});
