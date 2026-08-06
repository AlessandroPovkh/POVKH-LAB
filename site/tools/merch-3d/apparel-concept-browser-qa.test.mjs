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

test("apparel concept browser QA stores load-gated desktop and mobile model-viewer evidence", async () => {
  for (const assetKey of records) {
    const report = JSON.parse(await readFile(path.join(here, `reports/${assetKey}.browser-qa.json`), "utf8"));
    assert.equal(report.assetKey, assetKey);
    assert.equal(report.renderer, "@google/model-viewer");
    assert.equal(report.capturePolicy, "local-static-server; await model load and visible dimensions before capture");
    assert.deepEqual(report.checks, {
      requiredViews: true,
      noBrowserErrors: true,
      modelLoaded: true,
      nonBlankFrames: true,
      breathingRoom: true
    });
    assert.deepEqual(report.views.map((view) => view.view), ["desktop-default", "mobile-default"]);
    for (const view of report.views) {
      const screenshot = await readFile(path.join(siteRoot, view.path));
      const metadata = await sharp(screenshot).metadata();
      assert.equal(sha256(screenshot), view.sha256);
      assert.deepEqual([metadata.width, metadata.height], view.viewportPx);
      assert.equal(view.loaded, true);
      assert.equal(view.modelIsVisible, true);
      assert.ok(view.foregroundPixels >= 1000);
      assert.ok(view.visualMarginsPx.every((margin) => margin >= 8), `${assetKey} ${view.view} must be fully framed`);
      assert.deepEqual(view.errors, []);
    }
  }
});
