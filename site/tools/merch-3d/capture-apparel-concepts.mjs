import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { createStaticServer } from "../server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const outputDir = path.join(here, "reports/screenshots");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (filename) => path.relative(siteRoot, filename).split(path.sep).join("/");
const assetKeys = ["t-shirt-001", "hoodie-001", "cap-001"];
const background = [22, 22, 22];

const analyseFrame = async (bytes) => {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const difference = Math.max(
        Math.abs(data[offset] - background[0]),
        Math.abs(data[offset + 1] - background[1]),
        Math.abs(data[offset + 2] - background[2])
      );
      if (difference <= 6) continue;
      foregroundPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    foregroundPixels,
    foregroundBoundsPx: foregroundPixels ? [minX, minY, maxX, maxY] : null,
    visualMarginsPx: foregroundPixels ? [minX, minY, info.width - 1 - maxX, info.height - 1 - maxY] : [0, 0, 0, 0]
  };
};

await mkdir(outputDir, { recursive: true });
const server = createStaticServer({ root: siteRoot, cacheControl: "no-store" });
const baseUrl = await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const assetKey of assetKeys) {
    const source = JSON.parse(await readFile(path.join(here, `${assetKey}.source.json`), "utf8"));
    const profiles = [
      { view: "desktop-default", viewport: { width: 900, height: 900 }, camera: source.camera.desktop.default },
      { view: "mobile-default", viewport: { width: 390, height: 600 }, camera: source.camera.mobile.default }
    ];
    const views = [];
    for (const profile of profiles) {
      process.stdout.write(`${assetKey} ${profile.view}: loading\n`);
      const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: 1 });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      await page.goto(`${baseUrl}/dist/index.html`, { waitUntil: "domcontentloaded" });
      await page.setContent(`<!doctype html>
        <html><head><meta charset="utf-8">
        <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:rgb(${background.join(",")})}model-viewer{display:block;width:100vw;height:100vh;background:rgb(${background.join(",")})}</style></head>
        <body><model-viewer src="${baseUrl}/assets/merch-3d/${assetKey}.glb" alt="${assetKey} concept visualization; not a manufacturing reference" camera-controls interaction-prompt="none" camera-orbit="${profile.camera.orbit}" camera-target="${profile.camera.target}" field-of-view="${profile.camera.fieldOfView}" exposure="1.15" shadow-intensity="0.8" shadow-softness="1"></model-viewer></body></html>`, { waitUntil: "load" });
      await page.addScriptTag({ url: `${baseUrl}/assets/vendor/model-viewer.min.js`, type: "module" });
      await page.waitForFunction(() => Boolean(customElements.get("model-viewer")), null, { timeout: 10_000 });
      const viewer = page.locator("model-viewer");
      await viewer.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const element = document.querySelector("model-viewer");
        if (!element?.loaded || !element.modelIsVisible) return false;
        const dimensions = element.getDimensions();
        return [dimensions.x, dimensions.y, dimensions.z].every((dimension) => Number.isFinite(dimension) && dimension > 0);
      }, null, { timeout: 15_000 });
      const metrics = await viewer.evaluate(async (element) => {
        element.jumpCameraToGoal();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const dimensions = element.getDimensions();
        const centre = element.getBoundingBoxCenter();
        const orbit = element.getCameraOrbit();
        return {
          loaded: element.loaded,
          modelIsVisible: element.modelIsVisible,
          dimensionsM: [dimensions.x, dimensions.y, dimensions.z],
          centreM: [centre.x, centre.y, centre.z],
          cameraOrbit: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius },
          fieldOfViewDeg: element.getFieldOfView()
        };
      });
      assert.equal(metrics.loaded, true);
      assert.equal(metrics.modelIsVisible, true);
      assert.ok(metrics.dimensionsM.every((dimension) => Number.isFinite(dimension) && dimension > 0));
      const filename = path.join(outputDir, `${assetKey}-${profile.view}.png`);
      await page.waitForTimeout(1000);
      let bytes;
      let frame;
      let renderedFrameWaitMs = 1000;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        bytes = await page.screenshot({ animations: "disabled" });
        frame = await analyseFrame(bytes);
        if (frame.foregroundPixels >= 1000 && frame.visualMarginsPx.every((margin) => margin >= 8)) break;
        await page.waitForTimeout(250);
        renderedFrameWaitMs += 250;
      }
      assert.ok(frame.foregroundPixels >= 1000, `${assetKey} ${profile.view} never produced a substantial rendered frame`);
      assert.ok(frame.visualMarginsPx.every((margin) => margin >= 8), `${assetKey} ${profile.view} is cropped: ${frame.visualMarginsPx}`);
      await writeFile(filename, bytes);
      views.push({
        view: profile.view,
        path: relative(filename),
        sha256: sha256(bytes),
        viewportPx: [profile.viewport.width, profile.viewport.height],
        camera: profile.camera,
        errors,
        renderedFrameWaitMs,
        ...metrics,
        ...frame
      });
      await page.close();
    }
    const checks = {
      requiredViews: views.map((view) => view.view).join(",") === "desktop-default,mobile-default",
      noBrowserErrors: views.every((view) => view.errors.length === 0),
      modelLoaded: views.every((view) => view.loaded && view.modelIsVisible),
      nonBlankFrames: views.every((view) => view.foregroundPixels >= 1000),
      breathingRoom: views.every((view) => view.visualMarginsPx.every((margin) => margin >= 8))
    };
    assert.ok(Object.values(checks).every(Boolean), `${assetKey} browser QA failed: ${JSON.stringify(checks)} ${JSON.stringify(views.map(({ view, visualMarginsPx }) => ({ view, visualMarginsPx })))}`);
    const report = {
      schemaVersion: 1,
      assetKey,
      renderer: "@google/model-viewer",
      capturePolicy: "local-static-server; await model load and visible dimensions before capture",
      hashPolicy: "snapshot integrity only; semantic gates and human visual review govern acceptance",
      views,
      checks
    };
    await writeFile(path.join(here, `reports/${assetKey}.browser-qa.json`), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${assetKey}: desktop/mobile model-viewer evidence captured\n`);
  }
} finally {
  await browser.close();
  await server.close();
}
