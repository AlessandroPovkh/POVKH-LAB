import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const glbPath = path.join(siteRoot, "assets/merch-3d/print-001.glb");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const near = (actual, expected, tolerance = 0.08) => Math.abs(actual - expected) <= tolerance;

test("PRINT pins only the governed Bone-left and Void-right flat masters", async () => {
  const source = await readJson(path.join(here, "print-001.source.json"));
  const expected = {
    boneLeft: ["production/physical-merch/concepts/drop-001/renders/archive-objects/print-001/source/flat-art/PVKH_PRINT_001_A_SIGNAL_BONE_FLAT_ARTWORK_v01.png", "20f9a1113b7a861334496b736bb9bbe8f4e48e3853b65fb0f1731a04237e3ad5"],
    voidRight: ["production/physical-merch/concepts/drop-001/renders/archive-objects/print-001/source/flat-art/PVKH_PRINT_001_B_VOID_REVERSE_FLAT_ARTWORK_v01.png", "6a852a668ff424e66ac1fc82925610e35637a79071b5727d5b99013a200d651e"]
  };
  assert.equal(source.productId, "MRCH-008");
  assert.deepEqual(source.dimensionAuthority, {
    sheetTrim: { status: "confirmed", dimensionsMm: [420, 594], basis: "governed ISO 216 A2 trim" },
    sheetThickness: { status: "standard nominal", valueMm: 0.4, basis: "viewer-only uncoated paper stock" },
    displayGap: { status: "confirmed", valueMm: 30, basis: "governed display separation" },
    naturalBow: { status: "provisional", authoredMm: 1.5, maxMm: 2, basis: "viewer presentation only; not manufacturing data" }
  });
  assert.deepEqual(source.geometry.nodes, ["Print_001_Centred_Grounded_Pivot", "Print_001_Bone_Left", "Print_001_Void_Right"]);
  assert.deepEqual(source.geometry.meshes, ["Print_001_Bone_Left_Mesh", "Print_001_Void_Right_Mesh"]);
  assert.deepEqual(source.geometry.primitives, [
    { node: "Print_001_Bone_Left", role: "paper-back-and-edges", material: "MAT_BONE_PAPER" },
    { node: "Print_001_Bone_Left", role: "artwork-front", material: "MAT_PRINT_BONELEFT" },
    { node: "Print_001_Void_Right", role: "paper-back-and-edges", material: "MAT_VOID_PAPER" },
    { node: "Print_001_Void_Right", role: "artwork-front", material: "MAT_PRINT_VOIDRIGHT" }
  ]);
  assert.equal(source.geometry.segmentsPerSheet, 12);
  assert.equal(source.geometry.animations, 0);
  assert.deepEqual(Object.values(source.materials).map(({ name }) => name), ["MAT_BONE_PAPER", "MAT_VOID_PAPER", "MAT_PRINT_BONELEFT", "MAT_PRINT_VOIDRIGHT"]);
  for (const material of Object.values(source.materials)) {
    assert.equal(material.metallic, 0);
    assert.ok(material.roughness >= 0.9);
    assert.equal(material.baseColor.length, 4);
  }
  assert.deepEqual(source.camera, {
    orbit: "0deg 75deg 115%",
    fieldOfView: "30deg",
    target: "auto auto auto",
    evidenceViews: {
      front: { orbit: "0deg 90deg 115%", fieldOfView: "30deg", target: "auto auto auto" },
      rear: { orbit: "180deg 90deg 115%", fieldOfView: "30deg", target: "auto auto auto" }
    }
  });
  assert.deepEqual(source.poster, {
    path: "assets/merch/poster-diptych.webp",
    sha256: "2e6724aa5dc4aeee30b66a9400e3129bcd0a117812a20d0b7094e9d8b15d4b3e",
    role: "composition-reference-only",
    textureUse: "forbidden"
  });
  assert.equal(sha256(await readFile(path.join(siteRoot, source.poster.path))), source.poster.sha256);
  assert.deepEqual(source.inspectionPolicy, {
    reportPath: "reports/print-001.inspect.json",
    unoptimized: { stage: "authored-before-dedup-prune" },
    optimized: { stage: "reopened-after-dedup-prune" }
  });
  const merch = await readJson(path.join(siteRoot, "data/merch.json"));
  const viewer = merch.objects.find(({ id }) => id === source.productId).viewer;
  assert.deepEqual(viewer.cameraOrbit, { desktop: source.camera.orbit, mobile: source.camera.orbit });
  assert.deepEqual(viewer.fieldOfView, { desktop: source.camera.fieldOfView, mobile: source.camera.fieldOfView });
  assert.deepEqual(viewer.cameraTarget, { desktop: source.camera.target, mobile: source.camera.target });
  for (const [key, [canonicalPath, hash]] of Object.entries(expected)) {
    assert.equal(source.identity[key].canonicalPath, canonicalPath);
    assert.equal(source.identity[key].sha256, hash);
    assert.equal(sha256(await readFile(path.join(here, source.identity[key].path))), hash);
    assert.deepEqual(source.identity[key].resolutionPx, [1400, 1980]);
    assert.equal(source.identity[key].colourSpace, "sRGB");
    assert.deepEqual(source.identity[key].texture, {
      sourceUse: "full-image-no-crop",
      cropPx: [0, 0, 1400, 1980],
      fit: "fill",
      resolutionPx: [700, 990],
      mimeType: "image/png",
      derivedSha256: key === "boneLeft" ? "4ec903ae742d428bdc893b88910eb7347ccd8b5a75766ba8c11ea7290aabeafd" : "5f93f5130c291d75ad5ae572f245e5a439174174fbb1eedfd58ab4c97757f1b3"
    });
    assert.deepEqual(source.identity[key].registration, {
      surfaceMm: [420, 594],
      uvBounds: [0, 0, 1, 1],
      front: "+Z",
      orientation: "source-top-left-to-sheet-top-left",
      trim: "full-bleed"
    });
  }
});

test("PRINT reopens as two grounded upright A2 sheets with governed gap, bow and order", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const bounds = getBounds(doc.getRoot().getDefaultScene());
  const sizeMm = bounds.min.map((value, axis) => (bounds.max[axis] - value) * 1000);
  const names = doc.getRoot().listNodes().map((node) => node.getName());
  assert.ok(names.includes("Print_001_Bone_Left"));
  assert.ok(names.includes("Print_001_Void_Right"));
  assert.ok(near(sizeMm[0], 870));
  assert.ok(near(sizeMm[1], 594));
  assert.ok(sizeMm[2] <= 2.01, `display depth/bow exceeds 2 mm: ${sizeMm[2]}`);
  assert.ok(Math.abs(bounds.min[1]) < 1e-7, "PRINT must be grounded");
  assert.ok(Math.abs(bounds.min[0] + bounds.max[0]) < 1e-7, "PRINT pivot must be X-centred");
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(doc.getRoot().listTextures().length, 2);
  assert.equal(doc.getRoot().listExtensionsUsed().length, 0, "decoder/image extensions are forbidden");
});

test("PRINT stays deterministic, validator-clean and under release ceilings", async () => {
  const [bytes, source, report, validator, inspection] = await Promise.all([
    readFile(glbPath),
    readJson(path.join(here, "print-001.source.json")),
    readJson(path.join(here, "reports/print-001.report.json")),
    readJson(path.join(here, "reports/print-001.validator.json")),
    readJson(path.join(here, "reports/print-001.inspect.json"))
  ]);
  const live = await validateBytes(new Uint8Array(bytes), { uri: "print-001.glb", format: "glb", writeTimestamp: false });
  assert.equal(live.issues.numErrors, 0);
  assert.equal(live.issues.numWarnings, 0);
  assert.equal(validator.issues.numErrors, 0);
  assert.equal(validator.issues.numWarnings, 0);
  assert.deepEqual(report.validation, { errors: 0, warnings: 0, infos: live.issues.numInfos, hints: live.issues.numHints });
  assert.equal(report.output.sha256, sha256(bytes));
  assert.equal(report.deterministic.verifiedBySecondInMemoryBuild, true);
  assert.ok((await stat(glbPath)).size <= 650_000);
  assert.ok(report.budget.triangles <= 1_500);
  assert.ok(report.budget.drawCalls <= 4);
  assert.equal(report.physicalEvidence.method, "reopened-glb-bounds-and-node-registration");
  assert.equal(report.physicalEvidence.gapMm, 30);
  assert.equal(report.physicalEvidence.leftArtwork, "boneLeft");
  assert.equal(report.physicalEvidence.rightArtwork, "voidRight");
  assert.deepEqual(report.excludedPresentation, ["frames", "tape", "shadows"]);
  assert.equal(report.governedBuildRecord.productId, source.productId);
  assert.deepEqual(report.governedBuildRecord.dimensionAuthority, source.dimensionAuthority);
  assert.deepEqual(report.governedBuildRecord.geometry.declared, source.geometry);
  assert.deepEqual(report.governedBuildRecord.materials, source.materials);
  assert.deepEqual(report.governedBuildRecord.poster, source.poster);
  assert.deepEqual(report.governedBuildRecord.camera, source.camera);
  assert.deepEqual(report.governedBuildRecord.textures.boneLeft.registration, source.identity.boneLeft.registration);
  assert.deepEqual(report.governedBuildRecord.textures.voidRight.registration, source.identity.voidRight.registration);
  assert.deepEqual(report.governedBuildRecord.inspections.unoptimized, {
    stage: source.inspectionPolicy.unoptimized.stage,
    reportPath: `${source.inspectionPolicy.reportPath}#/unoptimized`,
    triangles: 200,
    drawCalls: 4
  });
  assert.deepEqual(report.governedBuildRecord.inspections.optimized, {
    stage: source.inspectionPolicy.optimized.stage,
    reportPath: `${source.inspectionPolicy.reportPath}#/optimized`,
    triangles: 200,
    drawCalls: 4,
    bytes: bytes.byteLength
  });
  assert.equal(inspection.schemaVersion, 1);
  assert.equal(inspection.assetKey, "print-001");
  assert.ok(inspection.unoptimized.scenes);
  assert.ok(inspection.optimized.scenes);
});

test("PRINT browser evidence covers desktop/mobile default, front, rear and readability", async () => {
  const [source, qa] = await Promise.all([
    readJson(path.join(here, "print-001.source.json")),
    readJson(path.join(here, "reports/print-001.browser-qa.json"))
  ]);
  assert.deepEqual(qa.consoleErrors, []);
  assert.deepEqual(qa.pageErrors, []);
  assert.equal(qa.visualComparison.status, "pass");
  assert.deepEqual(qa.cameraRecommendation, source.camera);
  assert.deepEqual(qa.capturePolicy, {
    deviceScaleFactor: 2,
    pixelDensity: "2x",
    defaultLabel: "governed-source-camera",
    defaultAuthority: "print-001.source.json#camera",
    defaultApplication: "live-page-manifest-verified-against-source",
    readability: "native-DPR2-crop-without-enlargement"
  });
  const expected = ["desktop-default", "desktop-front", "desktop-rear", "mobile-default", "mobile-front", "mobile-rear", "desktop-readability-crop"];
  assert.deepEqual(Object.keys(qa.screenshots), expected);
  for (const [name, entry] of Object.entries(qa.screenshots)) {
    const bytes = await readFile(path.join(here, entry.path));
    assert.equal(sha256(bytes), entry.sha256);
    assert.ok(bytes.byteLength > 1_000);
    assert.equal(entry.deviceScaleFactor, 2);
    assert.equal(entry.cameraAuthority, "print-001.source.json#camera");
    if (name !== "desktop-readability-crop") {
      assert.deepEqual(entry.screenshotPx, entry.stageCssPx.map((value) => value * 2));
      assert.equal(entry.viewRole, name.split("-").slice(1).join("-"));
      assert.equal(entry.cameraApplication, entry.viewRole === "default" ? "live-page-manifest-verified-against-source" : "governed-qa-view-applied-from-source");
    }
  }
  assert.equal(qa.screenshots["desktop-default"].cameraProfile.orbit, source.camera.orbit);
  assert.deepEqual(qa.screenshots["desktop-front"].cameraProfile, source.camera.evidenceViews.front);
  assert.deepEqual(qa.screenshots["desktop-rear"].cameraProfile, source.camera.evidenceViews.rear);
  assert.equal(qa.screenshots["desktop-readability-crop"].captureMethod, "native-DPR2-crop-without-enlargement");
  assert.equal(qa.visualComparison.capturePixelDensity, "2x");
});
