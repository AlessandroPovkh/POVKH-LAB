import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

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
      "print-macro": {
        publicPath: "assets/merch/t-shirt-print-macro.webp",
        artworkQuad: [[250, 290], [1286, 300], [1280, 688], [256, 678]],
        surfaceAnchors: [[150, 180], [1400, 190], [1390, 820], [160, 810]]
      },
      "on-body": {
        publicPath: "assets/merch/t-shirt-on-body.webp",
        artworkQuad: [[606, 330], [930, 330], [922, 452], [612, 452]],
        surfaceAnchors: [[480, 235], [1055, 235], [1025, 700], [510, 700]]
      }
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
      "print-macro": {
        publicPath: "assets/merch/hoodie-print-macro.webp",
        artworkQuad: [[254, 300], [1280, 310], [1274, 692], [254, 682]],
        surfaceAnchors: [[140, 170], [1400, 180], [1390, 820], [150, 810]]
      },
      "worn-rear": {
        publicPath: "assets/merch/hoodie-worn-rear.webp",
        artworkQuad: [[621, 356], [895, 370], [889, 472], [621, 460]],
        surfaceAnchors: [[520, 300], [1005, 330], [980, 790], [550, 760]]
      }
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

const assertAssetReference = async (reference, label, expectedDimensions = null) => {
  assert.ok(reference && typeof reference === "object" && !Array.isArray(reference), `${label} must be an object`);
  assert.match(reference.path || "", safeProjectPath, `${label}.path must be a base-safe project path`);
  assert.match(reference.sha256 || "", sha256Pattern, `${label}.sha256 must lock exact source pixels`);
  const file = path.join(siteRoot, reference.path);
  const bytes = await readFile(file);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), reference.sha256, `${label} bytes drifted from the declared hash`);
  if (expectedDimensions) {
    const { stdout } = await execFile("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0", file
    ]);
    assert.equal(stdout.trim(), `${expectedDimensions.width}x${expectedDimensions.height}`, `${label} dimensions drifted`);
  }
};

const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
};

const decodeGray = async (reference, dimensions) => {
  const { stdout } = await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", path.join(siteRoot, reference.path),
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"
  ], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
  assert.equal(stdout.length, dimensions.width * dimensions.height, `${reference.path} decoded mask size drifted`);
  return stdout;
};

const decodeRgb = async (reference, dimensions) => {
  const { stdout } = await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", path.join(siteRoot, reference.path),
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
  ], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 });
  assert.equal(stdout.length, dimensions.width * dimensions.height * 3, `${reference.path} decoded RGB size drifted`);
  return stdout;
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
  assert.equal(registration.renderer.pixelDeterministic, true);
  assert.equal(registration.renderer.encodedBytesDeterministic, false);
  assert.equal(Object.hasOwn(registration.renderer, "deterministic"), false, "renderer must not overclaim encoded byte determinism");
  assert.match(registration.renderer.fingerprints?.playwright || "", /^\d+\.\d+\.\d+$/);
  assert.match(registration.renderer.fingerprints?.chromium || "", /\d+/);
  assert.match(registration.renderer.fingerprints?.ffmpeg || "", /^ffmpeg version /);
  assert.match(registration.renderer.fingerprints?.ffmpegVersionSha256 || "", sha256Pattern);
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
    for (const [role, expectedView] of Object.entries(expected.views)) {
      const view = views[role];
      assert.equal(view.publicPath, expectedView.publicPath);
      assert.deepEqual(view.output, { width: 1536, height: 1024 });
      await assertAssetReference(view.base, `${slug}.${role}.base`, view.output);
      await assertAssetReference(view.sourceRender, `${slug}.${role}.sourceRender`, view.output);
      await assertAssetReference(view.garmentMask, `${slug}.${role}.garmentMask`, view.output);
      await assertAssetReference(view.appliedArtworkMask, `${slug}.${role}.appliedArtworkMask`, view.output);
      await assertAssetReference(view.fabricModulation, `${slug}.${role}.fabricModulation`, view.output);
      await assertAssetReference({ path: view.publicPath, sha256: view.outputSha256 }, `${slug}.${role}.publicOutput`, view.output);
      assert.match(view.sourceRender.pixelSha256 || "", sha256Pattern, `${slug}.${role}.sourceRender needs a decoded RGBA hash`);
      assert.match(view.garmentMask.pixelSha256 || "", sha256Pattern, `${slug}.${role}.garmentMask needs a decoded RGBA hash`);
      assert.match(view.appliedArtworkMask.pixelSha256 || "", sha256Pattern, `${slug}.${role}.appliedArtworkMask needs a decoded RGBA hash`);
      assert.match(view.outputPixelSha256 || "", sha256Pattern, `${slug}.${role}.publicOutput needs a decoded RGBA hash`);
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
      assert.deepEqual(view.artworkQuad.map(({ x, y }) => [x, y]), expectedView.artworkQuad, `${slug}.${role} approved artwork quad drifted`);
      assert.deepEqual(view.surfaceAnchors.map(({ x, y }) => [x, y]), expectedView.surfaceAnchors, `${slug}.${role} approved garment surface drifted`);
      assert.ok(view.artworkQuad.every((point) => pointInPolygon(point, view.surfaceAnchors)), `${slug}.${role} artwork must stay inside the approved garment surface`);
      const garmentMask = await decodeGray(view.garmentMask, view.output);
      const artworkMask = await decodeGray(view.appliedArtworkMask, view.output);
      for (let pixel = 0; pixel < artworkMask.length; pixel += 1) {
        if (artworkMask[pixel] > 8) assert.ok(garmentMask[pixel] > 8, `${slug}.${role} artwork escapes garment mask at pixel ${pixel}`);
      }
    }
  }
});

test("re-layers hoodie fabric across transparent pixels inside the full artwork quad", async () => {
  const registration = await readRegistration();
  for (const [role, view] of Object.entries(registration.garments.hoodie.views)) {
    assert.equal(view.fabricModulation.artworkBlendMode, "normal", `hoodie.${role} artwork blend drifted`);
    assert.equal(view.fabricModulation.artworkOpacity, 0.88, `hoodie.${role} artwork opacity drifted`);
    assert.equal(view.fabricModulation.textureReturnOpacity, 0.16, `hoodie.${role} texture return drifted`);
    assert.equal(view.fabricModulation.textureReturnClip, "artworkQuad", `hoodie.${role} texture return clip drifted`);
    const [base, render, artworkMask] = await Promise.all([
      decodeRgb(view.base, view.output),
      decodeRgb(view.sourceRender, view.output),
      decodeGray(view.appliedArtworkMask, view.output)
    ]);
    let transparentTexturePixels = 0;
    for (let y = 0; y < view.output.height; y += 1) {
      for (let x = 0; x < view.output.width; x += 1) {
        const pixel = y * view.output.width + x;
        if (artworkMask[pixel] !== 0 || !pointInPolygon({ x: x + 0.5, y: y + 0.5 }, view.artworkQuad)) continue;
        const offset = pixel * 3;
        if (base[offset] !== render[offset] || base[offset + 1] !== render[offset + 1] || base[offset + 2] !== render[offset + 2]) {
          transparentTexturePixels += 1;
        }
      }
    }
    assert.ok(transparentTexturePixels > 500, `hoodie.${role} must return base texture across transparent artwork pixels`);
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

test("the compositor dry-rerenders and pixel-verifies every governed output", async () => {
  const renderer = path.join(siteRoot, "tools", "render-apparel-registration.mjs");
  const { stdout } = await execFile(process.execPath, [renderer, "--verify"]);
  assert.match(stdout, /dry-rerendered and pixel-verified 4 apparel registrations/);
});

test("dry verification rejects a stale registered compositor pixel hash", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "pvkh-apparel-stale-"));
  try {
    const staleRegistration = await readRegistration();
    staleRegistration.garments["t-shirt"].views["print-macro"].sourceRender.pixelSha256 = "0".repeat(64);
    const stalePath = path.join(temporaryRoot, "apparel-print-registration-v02.json");
    await writeFile(stalePath, `${JSON.stringify(staleRegistration, null, 2)}\n`, "utf8");
    const rendererUrl = pathToFileURL(path.join(siteRoot, "tools", "render-apparel-registration.mjs")).href;
    const { verifyApparelRegistration } = await import(rendererUrl);
    await assert.rejects(
      verifyApparelRegistration({ registrationFile: stalePath }),
      /source render pixel hash mismatch: t-shirt\/print-macro/
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("bundle publication rolls every final file back after a rename failure", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "pvkh-apparel-rollback-"));
  try {
    const stageRoot = path.join(temporaryRoot, "stage");
    const finalRoot = path.join(temporaryRoot, "final");
    await Promise.all([mkdir(stageRoot), mkdir(finalRoot)]);
    const artifacts = ["one.png", "two.json"].map((name) => ({
      stageFile: path.join(stageRoot, name),
      finalFile: path.join(finalRoot, name)
    }));
    await Promise.all([
      writeFile(artifacts[0].stageFile, "new-one"),
      writeFile(artifacts[1].stageFile, "new-two"),
      writeFile(artifacts[0].finalFile, "old-one"),
      writeFile(artifacts[1].finalFile, "old-two")
    ]);
    const rendererUrl = pathToFileURL(path.join(siteRoot, "tools", "render-apparel-registration.mjs")).href;
    const { publishStagedBundle } = await import(rendererUrl);
    let renameCount = 0;
    await assert.rejects(
      publishStagedBundle(artifacts, {
        backupParent: temporaryRoot,
        renameFile: async (from, to) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error("injected rename failure");
          await rename(from, to);
        }
      }),
      /injected rename failure/
    );
    assert.equal(await readFile(artifacts[0].finalFile, "utf8"), "old-one");
    assert.equal(await readFile(artifacts[1].finalFile, "utf8"), "old-two");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
