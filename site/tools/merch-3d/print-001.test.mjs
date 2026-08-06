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
  assert.deepEqual(source.camera, { orbit: "0deg 75deg 115%", fieldOfView: "30deg", target: "auto auto auto" });
  for (const [key, [canonicalPath, hash]] of Object.entries(expected)) {
    assert.equal(source.identity[key].canonicalPath, canonicalPath);
    assert.equal(source.identity[key].sha256, hash);
    assert.equal(sha256(await readFile(path.join(here, source.identity[key].path))), hash);
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
  const [bytes, report, validator] = await Promise.all([
    readFile(glbPath),
    readJson(path.join(here, "reports/print-001.report.json")),
    readJson(path.join(here, "reports/print-001.validator.json"))
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
});

test("PRINT browser evidence covers desktop/mobile default, front, rear and readability", async () => {
  const qa = await readJson(path.join(here, "reports/print-001.browser-qa.json"));
  assert.deepEqual(qa.consoleErrors, []);
  assert.deepEqual(qa.pageErrors, []);
  assert.equal(qa.visualComparison.status, "pass");
  assert.deepEqual(qa.cameraRecommendation, { orbit: "0deg 75deg 115%", fieldOfView: "30deg", target: "auto auto auto" });
  const expected = ["desktop-default", "desktop-front", "desktop-rear", "mobile-default", "mobile-front", "mobile-rear", "desktop-readability-crop"];
  assert.deepEqual(Object.keys(qa.screenshots), expected);
  for (const entry of Object.values(qa.screenshots)) {
    const bytes = await readFile(path.join(here, entry.path));
    assert.equal(sha256(bytes), entry.sha256);
    assert.ok(bytes.byteLength > 1_000);
  }
});
