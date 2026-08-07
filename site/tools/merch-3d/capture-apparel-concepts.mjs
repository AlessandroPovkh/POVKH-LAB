import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { createStaticServer } from "../server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const outputDir = path.join(here, "reports/screenshots");
const execFile = promisify(execFileCallback);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (filename) => path.relative(siteRoot, filename).split(path.sep).join("/");
const records = [
  { assetKey: "t-shirt-001", slug: "t-shirt", contrast: "dark" },
  { assetKey: "hoodie-001", slug: "hoodie", contrast: "light" },
  { assetKey: "cap-001", slug: "cap", contrast: "light" }
];
const background = [22, 22, 22];

const analyseSyntheticFrame = async (bytes) => {
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

const cameraMetrics = (viewer) => viewer.evaluate((element) => {
  element.jumpCameraToGoal();
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

const modelPixelEvidence = (viewer, contrast) => viewer.evaluate(async (element, contrastRole) => {
  const blob = await element.toBlob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let visiblePixels = 0;
  let contrastPixels = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (rgba[offset + 3] === 0) continue;
      visiblePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const luminance = rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722;
      if ((contrastRole === "dark" && luminance < 52) || (contrastRole === "light" && luminance > 50)) contrastPixels += 1;
    }
  }
  bitmap.close();
  return {
    canvasPx: [canvas.width, canvas.height],
    foregroundPixels: visiblePixels,
    artworkContrastPixels: contrastPixels,
    foregroundBoundsPx: visiblePixels ? [minX, minY, maxX, maxY] : null,
    visualMarginsPx: visiblePixels ? [minX, minY, canvas.width - 1 - maxX, canvas.height - 1 - maxY] : [0, 0, 0, 0]
  };
}, contrast);

const waitForModel = async (page) => {
  await page.waitForFunction(() => {
    const element = document.querySelector("model-viewer");
    if (!element?.loaded || !element.modelIsVisible) return false;
    const dimensions = element.getDimensions();
    return [dimensions.x, dimensions.y, dimensions.z].every((dimension) => Number.isFinite(dimension) && dimension > 0);
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(850);
};

const pointerOrbitAndReset = async (page, expectedCamera) => {
  const viewer = page.locator("model-viewer");
  const initialTheta = await viewer.evaluate((model) => model.getCameraOrbit().theta);
  const box = await viewer.boundingBox();
  assert.ok(box, "built product viewer must expose a pointer surface");
  const trajectories = [
    [[0.39, 0.44], [0.70, 0.55]],
    [[0.62, 0.42], [0.30, 0.57]],
    [[0.48, 0.62], [0.72, 0.38]]
  ];
  let pointerOrbitChanged = false;
  for (const [startRatio, endRatio] of trajectories) {
    const start = { x: box.x + box.width * startRatio[0], y: box.y + box.height * startRatio[1] };
    const hit = await viewer.evaluate((model, point) => {
      const target = model.shadowRoot?.elementFromPoint(point.x, point.y);
      return target?.id !== "default-pan-target" && Boolean(model.shadowRoot?.querySelector(".userInput")?.contains(target));
    }, start);
    if (!hit) continue;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * endRatio[0], box.y + box.height * endRatio[1], { steps: 12 });
    await page.mouse.up();
    pointerOrbitChanged = await page.waitForFunction((theta) => {
      const next = document.querySelector("model-viewer")?.getCameraOrbit().theta;
      return Number.isFinite(next) && Math.abs(next - theta) > 0.03;
    }, initialTheta, { timeout: 3_000 }).then(() => true, () => false);
    if (pointerOrbitChanged) break;
  }
  assert.equal(pointerOrbitChanged, true, "built product viewer must respond to a real pointer orbit");
  await page.locator("[data-product-viewer-reset]").click();
  await page.waitForFunction(({ orbit, target, fieldOfView }) => {
    const model = document.querySelector("model-viewer");
    return model?.getAttribute("camera-orbit") === orbit
      && model.getAttribute("camera-target") === target
      && model.getAttribute("field-of-view") === fieldOfView;
  }, expectedCamera);
  return { pointerOrbitChanged, resetRestored: true };
};

await mkdir(outputDir, { recursive: true });
await execFile(process.execPath, [path.join(siteRoot, "tools/build.mjs")], { cwd: siteRoot });
const server = createStaticServer({ root: path.join(siteRoot, "dist"), cacheControl: "no-store" });
const baseUrl = await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const record of records) {
    const source = JSON.parse(await readFile(path.join(here, `${record.assetKey}.source.json`), "utf8"));
    const profiles = [
      { view: "desktop-default", viewport: { width: 900, height: 900 }, camera: source.camera.desktop.default },
      { view: "mobile-default", viewport: { width: 390, height: 600 }, camera: source.camera.mobile.default },
      ...(record.assetKey === "hoodie-001" ? [{ view: "desktop-elevated-cavity", viewport: { width: 900, height: 900 }, camera: source.camera.desktop.front }] : []),
      ...(record.assetKey === "cap-001" ? [{ view: "desktop-rear-aperture", viewport: { width: 900, height: 900 }, camera: source.camera.desktop.rear }] : [])
    ];
    const views = [];
    for (const profile of profiles) {
      process.stdout.write(`${record.assetKey} ${profile.view}: loading\n`);
      const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: 1 });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
        <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:rgb(${background.join(",")})}model-viewer{display:block;width:100vw;height:100vh;background:rgb(${background.join(",")})}</style></head>
        <body><model-viewer src="${baseUrl}/assets/merch-3d/${record.assetKey}.glb" alt="${record.assetKey} concept visualization; not a manufacturing reference" camera-controls interaction-prompt="none" camera-orbit="${profile.camera.orbit}" camera-target="${profile.camera.target}" field-of-view="${profile.camera.fieldOfView}" exposure="1.05" shadow-intensity="0.55" shadow-softness="1"></model-viewer></body></html>`, { waitUntil: "load" });
      await page.addScriptTag({ url: `${baseUrl}/assets/vendor/model-viewer.min.js`, type: "module" });
      await page.waitForFunction(() => Boolean(customElements.get("model-viewer")), null, { timeout: 10_000 });
      await waitForModel(page);
      const viewer = page.locator("model-viewer");
      const metrics = await cameraMetrics(viewer);
      const filename = path.join(outputDir, `${record.assetKey}-${profile.view}.png`);
      const bytes = await page.screenshot({ animations: "disabled" });
      const frame = await analyseSyntheticFrame(bytes);
      assert.ok(frame.foregroundPixels >= 1000, `${record.assetKey} ${profile.view} produced no substantial frame`);
      const isElevatedCavityDetail = profile.view === "desktop-elevated-cavity";
      if (isElevatedCavityDetail) {
        assert.ok(frame.foregroundBoundsPx[2] - frame.foregroundBoundsPx[0] >= 700, `${record.assetKey} ${profile.view} must tightly frame the hood detail`);
      } else {
        assert.ok(frame.visualMarginsPx.every((margin) => margin >= 8), `${record.assetKey} ${profile.view} is cropped: ${frame.visualMarginsPx}`);
      }
      await writeFile(filename, bytes);
      views.push({
        view: profile.view,
        surface: "isolated-model-viewer",
        path: relative(filename),
        sha256: sha256(bytes),
        viewportPx: [profile.viewport.width, profile.viewport.height],
        camera: profile.camera,
        errors,
        ...metrics,
        ...frame
      });
      await page.close();
    }

    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    const thirdPartyRequests = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("request", (request) => { if (new URL(request.url()).origin !== baseUrl) thirdPartyRequests.push(request.url()); });
    await page.goto(`${baseUrl}/merch/${record.slug}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("[data-product-viewer-poster]")?.naturalWidth > 0);
    const stage = page.locator("[data-product-viewer-stage]");
    const inactiveBox = await stage.boundingBox();
    const inactiveFilename = path.join(outputDir, `${record.assetKey}-mobile-product-poster.png`);
    const inactiveBytes = await stage.screenshot({ animations: "disabled" });
    const inactiveMetadata = await sharp(inactiveBytes).metadata();
    await writeFile(inactiveFilename, inactiveBytes);
    views.push({
      view: "mobile-product-poster",
      surface: "built-product-page",
      activated: false,
      path: relative(inactiveFilename),
      sha256: sha256(inactiveBytes),
      browserViewportPx: [390, 844],
      viewportPx: [inactiveMetadata.width, inactiveMetadata.height],
      errors: [...errors],
      thirdPartyRequests: [...thirdPartyRequests]
    });

    await page.locator("[data-product-viewer-activate]").click();
    await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready", null, { timeout: 20_000 });
    await waitForModel(page);
    const viewer = page.locator("model-viewer");
    const activeBox = await stage.boundingBox();
    const modelPixels = await modelPixelEvidence(viewer, record.contrast);
    assert.ok(activeBox.height >= 500 && activeBox.height <= 521, `${record.assetKey} built mobile viewer did not expand: ${activeBox.height}`);
    assert.ok(modelPixels.foregroundPixels >= 5_000, `${record.assetKey} built mobile viewer rendered too little garment evidence`);
    assert.ok(modelPixels.visualMarginsPx.every((margin) => margin >= 8), `${record.assetKey} built mobile model is cropped: ${modelPixels.visualMarginsPx}`);
    assert.ok(modelPixels.artworkContrastPixels >= 30, `${record.assetKey} built mobile viewer lacks inspectable contrast signal`);
    const camera = source.camera.mobile.default;
    const interaction = await pointerOrbitAndReset(page, { orbit: camera.orbit, target: camera.target, fieldOfView: camera.fieldOfView });
    const activeFilename = path.join(outputDir, `${record.assetKey}-mobile-product-stage.png`);
    const activeBytes = await stage.screenshot({ animations: "disabled" });
    const activeMetadata = await sharp(activeBytes).metadata();
    await writeFile(activeFilename, activeBytes);
    const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    views.push({
      view: "mobile-product-stage",
      surface: "built-product-page",
      activated: true,
      path: relative(activeFilename),
      sha256: sha256(activeBytes),
      browserViewportPx: [390, 844],
      viewportPx: [activeMetadata.width, activeMetadata.height],
      camera,
      errors: [...errors],
      thirdPartyRequests: [...thirdPartyRequests],
      overflowPx,
      interaction,
      ...(await cameraMetrics(viewer)),
      ...modelPixels
    });
    await page.close();

    const requiredViewNames = ["desktop-default", "mobile-default", ...(record.assetKey === "hoodie-001" ? ["desktop-elevated-cavity"] : []), ...(record.assetKey === "cap-001" ? ["desktop-rear-aperture"] : []), "mobile-product-poster", "mobile-product-stage"];
    const activeViews = views.filter((view) => view.activated !== false);
    const fullyFramedViews = activeViews.filter((view) => view.view !== "desktop-elevated-cavity");
    const productStage = views.find((view) => view.view === "mobile-product-stage");
    const checks = {
      requiredViews: JSON.stringify(views.map((view) => view.view)) === JSON.stringify(requiredViewNames),
      noBrowserErrors: views.every((view) => view.errors.length === 0),
      noThirdPartyRequests: views.every((view) => !view.thirdPartyRequests || view.thirdPartyRequests.length === 0),
      modelLoaded: activeViews.every((view) => view.loaded && view.modelIsVisible),
      nonBlankFrames: activeViews.every((view) => view.foregroundPixels >= 1000),
      breathingRoom: fullyFramedViews.every((view) => view.visualMarginsPx.every((margin) => margin >= 8)),
      builtPageBeforeAfter: views.some((view) => view.view === "mobile-product-poster") && Boolean(productStage),
      expandedMobileInspectionStage: productStage.viewportPx[1] >= 500,
      interactionAndReset: productStage.interaction.pointerOrbitChanged && productStage.interaction.resetRestored,
      noLayoutOverflow: productStage.overflowPx === 0
    };
    assert.ok(Object.values(checks).every(Boolean), `${record.assetKey} browser QA failed: ${JSON.stringify(checks)}`);
    const report = {
      schemaVersion: 2,
      assetKey: record.assetKey,
      renderer: "@google/model-viewer",
      capturePolicy: "built-product-page before/after activation at 390x844 plus isolated desktop/mobile/rear views and a deliberately tight elevated hood-cavity detail; await loaded visible dimensions and rendered pixels",
      hashPolicy: "snapshot integrity only; semantic gates and human visual review govern acceptance",
      views,
      checks
    };
    await writeFile(path.join(here, `reports/${record.assetKey}.browser-qa.json`), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${record.assetKey}: isolated and built-product-page evidence captured\n`);
  }
} finally {
  await browser.close();
  await server.close();
}
