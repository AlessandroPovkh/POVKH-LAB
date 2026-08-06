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
const glbPath = path.join(siteRoot, "assets/merch-3d/zine-001.glb");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));

test("ZINE binds the exact cross-product v04 cover and c978 authority", async () => {
  const source = await readJson(path.join(here, "zine-001.source.json"));
  assert.equal(source.canonicalSource.cover.canonicalPath, "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/source/artwork/PVKH_COLLECTOR_BOX_001_ZINE_FLAT_COVER_MASTER_v04.svg");
  assert.equal(source.canonicalSource.cover.sha256, "ffbc37ed621dd18006c89d8c05cd356f4377a0fa66643fe38fe6c07e5df33485");
  assert.equal(source.canonicalSource.authority.canonicalPath, "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/source/artwork/zine-flat-cover-authority-v04.json");
  assert.equal(source.canonicalSource.authority.sha256, "c9781d0b7fbee456409fd8bf159572a0bec17206942e7ed33dd489a303dccf0c");
  for (const entry of Object.values(source.canonicalSource)) assert.equal(sha256(await readFile(path.join(here, entry.fixturePath))), entry.sha256);
  assert.equal(source.galleryPolicy, "never-crop-gallery-renders");
  assert.deepEqual(source.camera, { orbit: "20deg 70deg 110%", fieldOfView: "30deg", target: "auto auto auto" });
});

test("ZINE reopens as a static closed 32-page black-cover A5 object with shallow spine and exactly two visible staples", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const bounds = getBounds(doc.getRoot().getDefaultScene());
  const sizeMm = bounds.min.map((value, axis) => (bounds.max[axis] - value) * 1000);
  assert.ok(Math.abs(sizeMm[0] - 148) < 0.05);
  assert.ok(Math.abs(sizeMm[1] - 210) < 0.05);
  assert.ok(Math.abs(sizeMm[2] - 2.4) < 0.01);
  assert.ok(Math.abs(bounds.min[1]) < 1e-7);
  const nodes = doc.getRoot().listNodes();
  const staples = nodes.filter((node) => /^Staple_0[12]$/.test(node.getName()));
  assert.equal(staples.length, 2);
  assert.ok(staples.every((node) => node.getExtras().visible === true));
  assert.equal(nodes.find((node) => node.getName() === "Zine_001_Closed_Page_Block").getExtras().pageCount, 32);
  assert.equal(nodes.find((node) => node.getName() === "Zine_001_Shallow_Spine").getExtras().shallow, true);
  assert.equal(nodes.some((node) => /interior|page.turn|open/i.test(node.getName())), false);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(doc.getRoot().listTextures().length, 1);
  const artMaterial = doc.getRoot().listMaterials().find((material) => material.getName() === "MAT_ZINE_V04_FRONT_COVER");
  assert.equal(artMaterial.getAlphaMode(), "BLEND", "transparent v04 field must reveal the black cover");
  assert.equal(artMaterial.getDoubleSided(), true);
  const coverMaterial = doc.getRoot().listMaterials().find((material) => material.getName() === "MAT_ZINE_BLACK_COVER");
  assert.deepEqual(coverMaterial.getBaseColorFactor().slice(0, 3), [0.005, 0.005, 0.006]);
  assert.ok(staples.every((node) => node.getWorldTranslation()[2] * 1000 > 1.1), "staple registration must sit above cover artwork");
  assert.equal(doc.getRoot().listExtensionsUsed().length, 0);
});

test("ZINE stays deterministic, validator-clean and under release ceilings", async () => {
  const [bytes, report, validator] = await Promise.all([readFile(glbPath), readJson(path.join(here, "reports/zine-001.report.json")), readJson(path.join(here, "reports/zine-001.validator.json"))]);
  const live = await validateBytes(new Uint8Array(bytes), { uri: "zine-001.glb", format: "glb", writeTimestamp: false });
  assert.equal(live.issues.numErrors, 0); assert.equal(live.issues.numWarnings, 0);
  assert.equal(validator.issues.numErrors, 0); assert.equal(validator.issues.numWarnings, 0);
  assert.equal(report.output.sha256, sha256(bytes));
  assert.equal(report.deterministic.verifiedBySecondInMemoryBuild, true);
  assert.deepEqual(report.physicalEvidence, { method: "reopened-glb-bounds-and-node-registration", closed: true, dimensionsMm: [148, 210, 2.4], pageCount: 32, blackCover: true, shallowSpine: true, visibleStaples: 2, interiors: 0, pageTurnAnimations: 0 });
  assert.ok((await stat(glbPath)).size <= 780_000);
  assert.ok(report.budget.triangles <= 4_500);
  assert.ok(report.budget.drawCalls <= 4);
});

test("ZINE browser evidence covers six governed views, readability and exact-cover comparison", async () => {
  const qa = await readJson(path.join(here, "reports/zine-001.browser-qa.json"));
  assert.deepEqual(qa.consoleErrors, []); assert.deepEqual(qa.pageErrors, []);
  assert.equal(qa.visualComparison.status, "pass");
  assert.equal(qa.visualComparison.sourceSha256, "ffbc37ed621dd18006c89d8c05cd356f4377a0fa66643fe38fe6c07e5df33485");
  assert.deepEqual(qa.cameraRecommendation, { orbit: "20deg 70deg 110%", fieldOfView: "30deg", target: "auto auto auto" });
  const expected = ["desktop-default", "desktop-front", "desktop-rear", "mobile-default", "mobile-front", "mobile-rear", "desktop-readability-crop"];
  assert.deepEqual(Object.keys(qa.screenshots), expected);
  for (const entry of Object.values(qa.screenshots)) assert.equal(sha256(await readFile(path.join(here, entry.path))), entry.sha256);
});
