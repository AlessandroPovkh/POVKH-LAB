import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFile = promisify(execFileCallback);
const registrationPath = path.join(siteRoot, "data", "apparel-print-registration-v02.json");
const designSpecPath = path.join(siteRoot, "..", "docs", "superpowers", "specs", "2026-08-06-apparel-3d-open-box-corrections-design.md");
const safeProjectPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

const expectedGarments = Object.freeze({
  "t-shirt": {
    master: {
      path: "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png",
      sha256: "c46bf6bd82ea2ec6928e9fe4ca9a314b56580af49c044be0395579c43c06dada",
      pixelSha256: "a7a1caaa8c0d3cc5ff5b04b303d42f962ba0161f0516fd01a8e0a7af0f84b6c0",
      visibleBounds: { left: 70, top: 60, right: 1510, bottom: 536, width: 1440, height: 476 },
      visibleCentroid: { x: 685.702012, y: 341.056496 }
    },
    approvedHero: {
      path: "assets/merch/t-shirt-front.webp",
      sha256: "89cac41d6abf06cccc1952823b5c2dcdf4a063a063a98dfebb998b19c428db4e",
      pixelSha256: "cdde4b910cf72c08429c8ead9bcf81c89bc2df0bd4ea7027100a4789aa9f56ae",
      assetDimensions: { width: 1536, height: 1024 },
      placementCoordinateSpace: "assetPixels",
      placement: [528, 350, 480, 180]
    },
    views: {
      "print-macro": {
        publicPath: "assets/merch/t-shirt-print-macro.webp",
        outputSha256: "51714a5874b253208404d5a4fe5efc2b9f48db998cb46c8a0fc664e16f672c49",
        outputPixelSha256: "a6b32ac1a0c45808c5b55b264933efcd66761167251769e677fe51e19ef8461b",
        artworkQuad: [[380, 340], [1156, 347], [1152, 638], [384, 631]],
        surfaceAnchors: [[150, 180], [1400, 190], [1390, 820], [160, 810]],
        heroRelative: {
          centerOffset: { x: -0.014009, y: 0.054933 },
          scale: { x: 1.606481, y: 1.652661 }
        },
        appliedArtworkCentroid: { x: 712.193025, y: 508.56822 }
      },
      "on-body": {
        publicPath: "assets/merch/t-shirt-on-body.webp",
        outputSha256: "03be6aace4cc45c99f54d4e90f9f95d3afd60d8d1f9e9141b9e1e241cd0b4239",
        outputPixelSha256: "2c54cd0d02e09ef5a843d9ad0b01e926171a75cff789884b5b04c54cb40b81eb",
        artworkQuad: [[598, 327], [938, 327], [930, 455], [604, 455]],
        surfaceAnchors: [[480, 235], [1055, 235], [1025, 700], [510, 700]],
        heroRelative: {
          centerOffset: { x: 0.006362, y: -0.050781 },
          scale: { x: 0.6875, y: 0.714286 }
        },
        appliedArtworkCentroid: { x: 743.482783, y: 400.317024 }
      }
    }
  },
  hoodie: {
    master: {
      path: "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png",
      sha256: "284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f",
      pixelSha256: "d09d549653f459c5b45e98646639698d4c2eb85ba6ef52451325be651ea12d36",
      visibleBounds: { left: 70, top: 60, right: 1510, bottom: 536, width: 1440, height: 476 },
      visibleCentroid: { x: 685.702012, y: 341.056496 }
    },
    approvedHero: {
      path: "assets/merch/hoodie-rear.webp",
      sha256: "d46462cbac738c17c4f4aaddb1ba1fc7c35f13ebe09cc70d967377927219aefa",
      pixelSha256: "95c0396a2eb37c8339332af61d41e84dcbea72c1b3121930457e2011e9a965eb",
      assetDimensions: { width: 1536, height: 1024 },
      placementCoordinateSpace: "assetPixels",
      placement: [552, 365, 432, 162]
    },
    views: {
      "print-macro": {
        publicPath: "assets/merch/hoodie-print-macro.webp",
        outputSha256: "63c3a21c90ed11286e1e34e561858038d079236aa445204fc2328277a0cea89a",
        outputPixelSha256: "a3772ae9a1a3d83cbcb3c756c9a2dd6e827dbb7d5085eaa2be25627bb062f528",
        artworkQuad: [[357, 339], [1177, 347], [1173, 653], [357, 645]],
        surfaceAnchors: [[140, 170], [1400, 180], [1390, 820], [150, 810]],
        heroRelative: {
          centerOffset: { x: -0.019515, y: 0.058062 },
          scale: { x: 1.890432, y: 1.929661 }
        },
        appliedArtworkCentroid: { x: 707.165163, y: 516.540254 }
      },
      "worn-rear": {
        publicPath: "assets/merch/hoodie-worn-rear.webp",
        outputSha256: "27b04d86ea1071a8ec252a337245de861aca9b2806a04287cc74e4a721059248",
        outputPixelSha256: "a4c6d1d86d71e73413f7ba86f80baf4b495d4d26a4672c9121e2f58ac661d04d",
        artworkQuad: [[593, 353], [923, 370], [916, 492], [593, 478]],
        surfaceAnchors: [[520, 300], [1005, 330], [980, 790], [550, 760]],
        heroRelative: {
          centerOffset: { x: -0.002683, y: -0.026021 },
          scale: { x: 0.753601, y: 0.840336 }
        },
        appliedArtworkCentroid: { x: 733.017758, y: 430.439836 }
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
    const { width, height } = await sharp(bytes).metadata();
    assert.deepEqual({ width, height }, expectedDimensions, `${label} dimensions drifted`);
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
  const { data, info } = await sharp(path.join(siteRoot, reference.path))
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height, channels: info.channels }, { ...dimensions, channels: 1 }, `${reference.path} decoded mask dimensions drifted`);
  return data;
};

const decodeRgb = async (reference, dimensions) => {
  const { data, info } = await sharp(path.join(siteRoot, reference.path))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height, channels: info.channels }, { ...dimensions, channels: 3 }, `${reference.path} decoded RGB dimensions drifted`);
  return data;
};

const decodeRgba = async (reference, dimensions) => {
  const { data, info } = await sharp(path.join(siteRoot, reference.path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height, channels: info.channels }, { ...dimensions, channels: 4 }, `${reference.path} decoded RGBA dimensions drifted`);
  return data;
};

const pixelBounds = (pixels, dimensions, stride = 1, channel = 0, threshold = 8) => {
  let left = dimensions.width;
  let top = dimensions.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      if (pixels[(y * dimensions.width + x) * stride + channel] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  assert.ok(right > left && bottom > top, "governed artwork pixels must not be empty");
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

const pixelCentroid = (pixels, dimensions, stride = 1, channel = 0, threshold = 8) => {
  let weightedX = 0;
  let weightedY = 0;
  let weight = 0;
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const value = pixels[(y * dimensions.width + x) * stride + channel];
      if (value <= threshold) continue;
      weightedX += (x + 0.5) * value;
      weightedY += (y + 0.5) * value;
      weight += value;
    }
  }
  assert.ok(weight > 0, "governed artwork pixels must have a measurable centroid");
  return { x: round6(weightedX / weight), y: round6(weightedY / weight) };
};

const round6 = (value) => Number(value.toFixed(6));

const heroRelativeRegistration = (garment, view, appliedArtworkBounds, appliedArtworkCentroid) => {
  const hero = garment.approvedHero;
  const master = garment.master;
  assert.equal(hero.placementCoordinateSpace, "assetPixels", "approved hero placement must declare asset-pixel coordinates");
  assert.equal(Object.hasOwn(hero, "canvas"), false, "approved hero must not carry a stale virtual canvas");
  const heroVisibleBounds = {
    width: master.visibleBounds.width / master.width * hero.placement.width,
    height: master.visibleBounds.height / master.height * hero.placement.height
  };
  const heroCenter = {
    x: (hero.placement.x + master.visibleCentroid.x / master.width * hero.placement.width) / hero.assetDimensions.width,
    y: (hero.placement.y + master.visibleCentroid.y / master.height * hero.placement.height) / hero.assetDimensions.height
  };
  const viewCenter = {
    x: appliedArtworkCentroid.x / view.output.width,
    y: appliedArtworkCentroid.y / view.output.height
  };
  return {
    centerOffset: {
      x: round6(viewCenter.x - heroCenter.x),
      y: round6(viewCenter.y - heroCenter.y)
    },
    scale: {
      x: round6((appliedArtworkBounds.width / view.output.width) / (heroVisibleBounds.width / hero.assetDimensions.width)),
      y: round6((appliedArtworkBounds.height / view.output.height) / (heroVisibleBounds.height / hero.assetDimensions.height))
    }
  };
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
  assert.equal(registration.renderer.pixelDecoder, "sharp raw RGBA");
  assert.match(registration.renderer.fingerprints?.sharp || "", /^sharp 0\.35\.3 \/ libvips /);
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
    const { width: masterWidth, height: masterHeight } = await sharp(masterBytes).metadata();
    assert.deepEqual({ width: masterWidth, height: masterHeight }, { width: 1600, height: 600 }, `${slug} master raster dimensions drifted`);
    assert.equal(garment.approvedHero.path, expected.approvedHero.path, `${slug} approved hero source drifted`);
    assert.equal(garment.approvedHero.placementCoordinateSpace, expected.approvedHero.placementCoordinateSpace, `${slug} approved hero placement coordinate authority drifted`);
    assert.equal(Object.hasOwn(garment.approvedHero, "canvas"), false, `${slug} approved hero must use its decoded asset dimensions without a virtual canvas`);
    const { x, y, width, height } = garment.approvedHero.placement || {};
    assert.deepEqual([x, y, width, height], expected.approvedHero.placement, `${slug} approved hero placement drifted`);
  }
});

test("enforces visible master identity, artwork bounds and hero-relative registration", async () => {
  const registration = await readRegistration();
  const contactSheet = registration.visualQa?.contactSheet;
  assert.equal(registration.visualQa?.reviewMethod, "hero / print macro / worn-or-on-body contact sheet");
  assert.equal(registration.visualQa?.layout, "t-shirt hero / print macro / on-body; hoodie hero / print macro / worn-rear");
  assert.equal(contactSheet?.path, "tools/fixtures/apparel-registration/apparel-registration-contact-sheet-v02.png");
  await assertAssetReference(contactSheet, "visualQa.contactSheet", { width: 1800, height: 800 });
  assert.match(contactSheet.pixelSha256 || "", sha256Pattern, "contact sheet needs a decoded RGBA hash");

  for (const [slug, expected] of Object.entries(expectedGarments)) {
    const garment = registration.garments[slug];
    const masterPixels = await decodeRgba(garment.master, { width: 1600, height: 600 });
    assert.equal(createHash("sha256").update(masterPixels).digest("hex"), expected.master.pixelSha256, `${slug} decoded master pixels drifted`);
    assert.deepEqual(pixelBounds(masterPixels, { width: 1600, height: 600 }, 4, 3), expected.master.visibleBounds, `${slug} visible master bounds drifted`);
    assert.deepEqual(pixelCentroid(masterPixels, { width: 1600, height: 600 }, 4, 3), expected.master.visibleCentroid, `${slug} visible master centroid drifted`);

    await assertAssetReference(garment.approvedHero, `${slug}.approvedHero`, expected.approvedHero.assetDimensions);
    const heroPixels = await decodeRgba(garment.approvedHero, expected.approvedHero.assetDimensions);
    assert.equal(createHash("sha256").update(heroPixels).digest("hex"), expected.approvedHero.pixelSha256, `${slug} approved hero pixels drifted`);

    for (const [role, expectedView] of Object.entries(expected.views)) {
      const view = garment.views[role];
      const artworkMask = await decodeGray(view.appliedArtworkMask, view.output);
      const measuredBounds = pixelBounds(artworkMask, view.output);
      const measuredCentroid = pixelCentroid(artworkMask, view.output);
      assert.deepEqual(
        measuredBounds,
        view.appliedArtworkBounds,
        `${slug}.${role} registered visible bounds must come from the rendered artwork mask`
      );
      assert.deepEqual(
        measuredCentroid,
        expectedView.appliedArtworkCentroid,
        `${slug}.${role} measured artwork centroid drifted`
      );
      assert.deepEqual(
        view.appliedArtworkCentroid,
        measuredCentroid,
        `${slug}.${role} registered visible centroid must come from the rendered artwork mask`
      );
      assert.deepEqual(view.heroRelative, expectedView.heroRelative, `${slug}.${role} hero-relative center/scale drifted`);
      assert.deepEqual(
        view.heroRelative,
        heroRelativeRegistration(garment, view, measuredBounds, measuredCentroid),
        `${slug}.${role} hero-relative center/scale must be independently reproducible from actual visible mask pixels and the approved hero`
      );
    }
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
      assert.equal(view.outputSha256, expectedView.outputSha256, `${slug}.${role} approved WebP bytes drifted from independent authority`);
      assert.equal(view.outputPixelSha256, expectedView.outputPixelSha256, `${slug}.${role} approved decoded WebP pixels drifted from independent authority`);
      assert.deepEqual(view.output, { width: 1536, height: 1024 });
      await assertAssetReference(view.base, `${slug}.${role}.base`, view.output);
      await assertAssetReference(view.sourceRender, `${slug}.${role}.sourceRender`, view.output);
      await assertAssetReference(view.garmentMask, `${slug}.${role}.garmentMask`, view.output);
      await assertAssetReference(view.appliedArtworkMask, `${slug}.${role}.appliedArtworkMask`, view.output);
      await assertAssetReference(view.fabricModulation, `${slug}.${role}.fabricModulation`, view.output);
      await assertAssetReference({ path: view.publicPath, sha256: view.outputSha256 }, `${slug}.${role}.publicOutput`, view.output);
      const approvedPublicPixels = await decodeRgba({ path: view.publicPath }, view.output);
      assert.equal(createHash("sha256").update(approvedPublicPixels).digest("hex"), expectedView.outputPixelSha256, `${slug}.${role} approved decoded WebP pixels drifted from independent authority`);
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

test("audits the single bounded hoodie macro base retouch as an explicit design exception", async () => {
  const registration = await readRegistration();
  const view = registration.garments.hoodie.views["print-macro"];
  const repairViews = [];
  for (const [slug, garment] of Object.entries(registration.garments)) {
    for (const [role, candidate] of Object.entries(garment.views)) {
      if (candidate.baseRepair) repairViews.push(`${slug}/${role}`);
    }
  }
  assert.deepEqual(repairViews, ["hoodie/print-macro"], "only the governed hoodie macro may retouch its blank base");
  const designSpec = await readFile(designSpecPath, "utf8");
  assert.match(
    designSpec,
    /The only permitted blank-base retouch is the governed hoodie print-macro v1→v2 repair/,
    "the fixed design constraints must explicitly authorize the one bounded hoodie macro repair"
  );
  assert.equal(
    view.base.path,
    "tools/fixtures/apparel-registration/bases/PVKH_VOID_BACKMARK_HOODIE_PRINT_FIBER_MACRO_BLANK_BASE_v02.png"
  );
  assert.deepEqual(view.baseRepair, {
    source: {
      path: "tools/fixtures/apparel-registration/bases/PVKH_VOID_BACKMARK_HOODIE_PRINT_FIBER_MACRO_BLANK_BASE_v01.png",
      sha256: "46fe2c064e42d8420eca02b7ef75a0eaa37ad4fe3768e67d2e111d651ad84b15"
    },
    method: "preserve-low-frequency-field-and-transplant-clean-source-detail",
    blurSigma: 28,
    highFrequencyGain: 0.72,
    repairBounds: { left: 735, top: 430, right: 1415, bottom: 870 },
    fullStrengthBounds: { left: 820, top: 515, right: 1365, bottom: 790 },
    donorOffset: { x: -520, y: 0 },
    changedPixels: view.baseRepair.changedPixels,
    changedOutsideFinalArtworkMaskPixels: view.baseRepair.changedOutsideFinalArtworkMaskPixels,
    outsideRepairBoundsChangedPixels: 0
  });
  assert.ok(view.baseRepair.changedPixels > 100_000, "hoodie macro repair must replace the contaminated fabric plane");
  const [source, repaired, artworkMask] = await Promise.all([
    decodeRgb(view.baseRepair.source, view.output),
    decodeRgb(view.base, view.output),
    decodeGray(view.appliedArtworkMask, view.output)
  ]);
  let changedInside = 0;
  let changedOutside = 0;
  let changedOutsideFinalArtworkMask = 0;
  const { left, top, right, bottom } = view.baseRepair.repairBounds;
  for (let y = 0; y < view.output.height; y += 1) {
    for (let x = 0; x < view.output.width; x += 1) {
      const offset = (y * view.output.width + x) * 3;
      const changed = source[offset] !== repaired[offset]
        || source[offset + 1] !== repaired[offset + 1]
        || source[offset + 2] !== repaired[offset + 2];
      if (!changed) continue;
      const pixel = y * view.output.width + x;
      if (artworkMask[pixel] === 0) changedOutsideFinalArtworkMask += 1;
      if (x >= left && x < right && y >= top && y < bottom) changedInside += 1;
      else changedOutside += 1;
    }
  }
  assert.equal(changedOutside, 0, "hoodie macro repair must preserve every source pixel outside the declared repair bounds");
  assert.equal(changedInside, view.baseRepair.changedPixels, "hoodie macro repair changed-pixel audit drifted");
  assert.equal(
    changedOutsideFinalArtworkMask,
    view.baseRepair.changedOutsideFinalArtworkMaskPixels,
    "the intentional v1→v2 retouch outside the final artwork must remain exactly audited"
  );
  assert.ok(changedOutsideFinalArtworkMask > 0, "the report must not misrepresent the v1 photo as unchanged outside final artwork");
});

test("preserves the blank base for every pixel outside the actual applied-artwork mask in all four views", async () => {
  const registration = await readRegistration();
  for (const [slug, garment] of Object.entries(registration.garments)) {
    for (const [role, view] of Object.entries(garment.views)) {
      if (slug === "hoodie") {
        assert.equal(view.fabricModulation.artworkBlendMode, "normal", `${slug}.${role} artwork blend drifted`);
        assert.equal(view.fabricModulation.artworkOpacity, 0.88, `${slug}.${role} artwork opacity drifted`);
        assert.equal(view.fabricModulation.textureReturnOpacity, 0.16, `${slug}.${role} texture return drifted`);
        assert.equal(view.fabricModulation.textureReturnClip, "artworkAlpha", `${slug}.${role} texture return must not affect transparent master pixels`);
      }
      const [base, render, artworkMask] = await Promise.all([
        decodeRgb(view.base, view.output),
        decodeRgb(view.sourceRender, view.output),
        decodeGray(view.appliedArtworkMask, view.output)
      ]);
      let comparedPixels = 0;
      let changedPixels = 0;
      for (let y = 0; y < view.output.height; y += 1) {
        for (let x = 0; x < view.output.width; x += 1) {
          const pixel = y * view.output.width + x;
          if (artworkMask[pixel] !== 0) continue;
          comparedPixels += 1;
          const offset = pixel * 3;
          if (base[offset] !== render[offset] || base[offset + 1] !== render[offset + 1] || base[offset + 2] !== render[offset + 2]) {
            changedPixels += 1;
          }
        }
      }
      assert.ok(comparedPixels > 1_000_000, `${slug}.${role} must exercise the full area outside the applied-artwork mask`);
      assert.equal(changedPixels, 0, `${slug}.${role} source render must remain byte-identical to the base outside the applied-artwork mask`);
      assert.deepEqual(view.outsideAppliedArtworkMask, {
        rule: "source-render-rgb-equals-base-where-applied-artwork-mask-is-zero",
        comparedPixels,
        changedPixels: 0
      }, `${slug}.${role} outside-print preservation audit drifted`);
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
