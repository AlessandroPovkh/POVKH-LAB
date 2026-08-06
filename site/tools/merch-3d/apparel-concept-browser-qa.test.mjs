import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const records = ["t-shirt-001", "hoodie-001", "cap-001"];

test("apparel concept browser QA stores isolated and built-product-page mobile evidence", async () => {
  for (const assetKey of records) {
    const report = JSON.parse(await readFile(path.join(here, `reports/${assetKey}.browser-qa.json`), "utf8"));
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.assetKey, assetKey);
    assert.equal(report.renderer, "@google/model-viewer");
    assert.equal(report.capturePolicy, "built-product-page before/after activation at 390x844 plus isolated desktop/mobile/rear views; await loaded visible dimensions and rendered pixels");
    assert.deepEqual(report.checks, {
      requiredViews: true,
      noBrowserErrors: true,
      noThirdPartyRequests: true,
      modelLoaded: true,
      nonBlankFrames: true,
      breathingRoom: true,
      builtPageBeforeAfter: true,
      expandedMobileInspectionStage: true,
      interactionAndReset: true,
      noLayoutOverflow: true
    });
    const auxiliary = assetKey === "hoodie-001" ? ["desktop-front-cavity"] : assetKey === "cap-001" ? ["desktop-rear-aperture"] : [];
    assert.deepEqual(report.views.map((view) => view.view), ["desktop-default", "mobile-default", ...auxiliary, "mobile-product-poster", "mobile-product-stage"]);
    for (const view of report.views) {
      const screenshot = await readFile(path.join(siteRoot, view.path));
      const metadata = await sharp(screenshot).metadata();
      assert.equal(sha256(screenshot), view.sha256);
      assert.deepEqual([metadata.width, metadata.height], view.viewportPx);
      assert.deepEqual(view.errors, []);
      if (view.view === "mobile-product-poster") {
        assert.equal(view.surface, "built-product-page");
        assert.equal(view.activated, false);
        assert.deepEqual(view.browserViewportPx, [390, 844]);
        assert.deepEqual(view.viewportPx, [358, 240]);
        assert.deepEqual(view.thirdPartyRequests, []);
        continue;
      }
      assert.equal(view.loaded, true);
      assert.equal(view.modelIsVisible, true);
      assert.ok(view.foregroundPixels >= 1000);
      assert.ok(view.visualMarginsPx.every((margin) => margin >= 8), `${assetKey} ${view.view} must be fully framed`);
      if (view.view === "mobile-product-stage") {
        assert.equal(view.surface, "built-product-page");
        assert.equal(view.activated, true);
        assert.deepEqual(view.browserViewportPx, [390, 844]);
        assert.deepEqual(view.viewportPx, [358, 521]);
        assert.deepEqual(view.thirdPartyRequests, []);
        assert.equal(view.overflowPx, 0);
        assert.deepEqual(view.interaction, { pointerOrbitChanged: true, resetRestored: true });
        assert.ok(view.foregroundPixels >= 5_000);
        assert.ok(view.artworkContrastPixels >= 30);
      } else {
        assert.equal(view.surface, "isolated-model-viewer");
      }
    }
  }
});
