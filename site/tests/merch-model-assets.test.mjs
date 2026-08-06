import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(siteRoot, relative), "utf8"));

test("pins the audited local model build and validation toolchain", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(packageJson.devDependencies?.["@gltf-transform/core"], "4.4.2");
  assert.equal(packageJson.devDependencies?.["@gltf-transform/functions"], "4.4.2");
  assert.equal(packageJson.devDependencies?.["gltf-validator"], "2.0.0-dev.3.10");
  assert.equal(packageJson.devDependencies?.sharp, "0.35.3");
  assert.equal(
    packageJson.scripts?.["test:merch-model-builds"],
    "node --test tools/merch-3d/*.test.mjs"
  );
  assert.equal(
    packageJson.scripts?.["benchmark:product-viewer"],
    "node --test tests/product-viewer-performance-browser.test.mjs"
  );
  assert.match(packageJson.scripts?.test ?? "", /npm run test:merch-model-builds/);
  assert.doesNotMatch(packageJson.scripts?.test ?? "", /benchmark:product-viewer/);
});

test("governs the cassette source, deterministic build and release report", async () => {
  const source = await readJson("tools/merch-3d/cassette-002.source.json");
  const report = await readJson("tools/merch-3d/reports/cassette-002.report.json");
  const merch = await readJson("data/merch.json");
  const cassette = merch.objects.find(({ slug }) => slug === "cassette");
  const assetPath = path.join(siteRoot, "assets/merch-3d/cassette-002.glb");
  const asset = await stat(assetPath);

  assert.equal(source.assetKey, "cassette-002");
  assert.deepEqual(source.dimensionsMm.cassette, [100.4, 63.8, 12]);
  assert.deepEqual(source.dimensionsMm.case, [109, 70, 17]);
  assert.equal(source.dimensionsAuthority.status, "nominal-provisional");
  assert.match(source.identity.ascii.sha256, /^[a-f0-9]{64}$/);
  assert.match(source.identity.compactDark.sha256, /^[a-f0-9]{64}$/);
  assert.match(source.identity.compactReverse.sha256, /^[a-f0-9]{64}$/);

  assert.equal(report.assetKey, source.assetKey);
  assert.deepEqual(report.camera, source.camera);
  assert.deepEqual(cassette.viewer.cameraOrbit, {
    desktop: source.camera.orbit,
    mobile: source.camera.mobileOrbit
  });
  assert.deepEqual(cassette.viewer.fieldOfView, {
    desktop: source.camera.fieldOfView,
    mobile: source.camera.mobileFieldOfView
  });
  assert.deepEqual(cassette.viewer.cameraTarget, {
    desktop: "auto auto auto",
    mobile: source.camera.mobileTarget
  });
  assert.equal(report.validation.errors, 0);
  assert.equal(report.validation.warnings, 0);
  assert.equal(report.mechanics.screws, 5);
  assert.equal(report.mechanics.hubs, 2);
  assert.equal(report.mechanics.guideRollers, 2);
  assert.equal(report.mechanics.continuousTapePath, true);
  assert.equal(report.mechanics.pressurePad, true);
  assert.equal(report.registration.maxErrorPercent <= 1, true);
  assert.equal(report.budget.bytes <= 2_500_000, true);
  assert.equal(report.budget.triangles <= 50_000, true);
  assert.equal(report.budget.drawCalls <= 12, true);
  assert.equal(asset.size, report.budget.bytes);
  assert.match(report.output.sha256, /^[a-f0-9]{64}$/);
});

test("binds released rigid and flat viewers to their governed build records", async () => {
  const merch = await readJson("data/merch.json");
  const records = [
    ["vinyl", "vinyl-001", "nested"],
    ["cd", "disc-004", "nested"],
    ["usb-edition", "data-key-003", "nested"],
    ["poster", "print-001", "flat"],
    ["sticker-pack", "signal-kit-001", "flat"],
    ["zine-booklet", "zine-001", "flat"],
    ["collector-box-set", "collector-box-001", "nested"],
    ["t-shirt", "t-shirt-001", "nested"],
    ["hoodie", "hoodie-001", "nested"],
    ["cap", "cap-001", "nested"]
  ];

  for (const [slug, assetKey, cameraShape] of records) {
    const object = merch.objects.find((entry) => entry.slug === slug);
    const source = await readJson(`tools/merch-3d/${assetKey}.source.json`);
    const report = await readJson(`tools/merch-3d/reports/${assetKey}.report.json`);
    const asset = await stat(path.join(siteRoot, `assets/merch-3d/${assetKey}.glb`));
    const desktop = cameraShape === "nested" ? source.camera.desktop.default : source.camera;
    const mobile = cameraShape === "nested" ? source.camera.mobile.default : source.camera;

    assert.equal(object.viewer.src, `assets/merch-3d/${assetKey}.glb`);
    if (cameraShape === "nested") assert.equal(source.camera.poster, object.viewer.poster);
    assert.deepEqual(object.viewer.cameraOrbit, { desktop: desktop.orbit, mobile: mobile.orbit });
    assert.deepEqual(object.viewer.fieldOfView, { desktop: desktop.fieldOfView, mobile: mobile.fieldOfView });
    assert.deepEqual(object.viewer.cameraTarget, { desktop: desktop.target, mobile: mobile.target });
    assert.deepEqual(object.viewer.budget, {
      bytes: source.budgets.maxBytes,
      triangles: source.budgets.maxTriangles,
      drawCalls: source.budgets.maxDrawCalls
    });
    assert.equal(asset.size, report.budget.bytes);
    assert.equal(report.validation.errors, 0);
    assert.equal(report.validation.warnings, 0);
  }
});

test("makes data-key and collector captures reject production default-camera drift", async () => {
  for (const assetKey of ["data-key-003", "collector-box-001"]) {
    const source = await readFile(path.join(siteRoot, `tools/merch-3d/capture-${assetKey}.mjs`), "utf8");
    assert.match(source, /profile\.name\.endsWith\(["']-default["']\)/);
    assert.match(source, /production camera drift/);
    assert.match(source, /getAttribute\(["']camera-orbit["']\)/);
    assert.match(source, /getAttribute\(["']camera-target["']\)/);
    assert.match(source, /getAttribute\(["']field-of-view["']\)/);
  }
});

test("governs apparel GLBs as concept geometry without manufacturing claims", async () => {
  for (const [assetKey, productId] of [["t-shirt-001", "MRCH-005"], ["hoodie-001", "MRCH-006"], ["cap-001", "MRCH-007"]]) {
    const [source, report, bytes] = await Promise.all([
      readJson(`tools/merch-3d/${assetKey}.source.json`),
      readJson(`tools/merch-3d/reports/${assetKey}.report.json`),
      readFile(path.join(siteRoot, `assets/merch-3d/${assetKey}.glb`))
    ]);
    const doc = await new NodeIO().readBinary(bytes);
    const scene = doc.getRoot().getDefaultScene();
    assert.equal(source.productId, productId);
    assert.deepEqual(source.truthBoundary, {
      status: "concept-visualization",
      manufacturingReference: false,
      vendorFitClaim: false,
      fabricSimulationClaim: false,
      constructionAccuracyClaim: false,
      productionDimensionsClaim: false
    });
    assert.deepEqual(scene.getExtras().truthBoundary, source.truthBoundary);
    assert.deepEqual(report.governedBuildRecord.truthBoundary, source.truthBoundary);
    assert.equal(report.output.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(report.validation.errors, 0);
    assert.equal(report.validation.warnings, 0);
    assert.ok(doc.getRoot().listTextures().some((texture) => texture.getExtras().canonicalSourceSha256 === source.artwork.sha256));
  }
});
