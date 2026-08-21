import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "reports/screenshots");
const baseUrl = process.env.PVKH_MERCH_QA_URL || "http://127.0.0.1:4173/merch/cassette/";
const source = JSON.parse(await readFile(path.join(here, "cassette-002.source.json"), "utf8"));

const profiles = [
  {name: "desktop-default", viewport: {width: 1440, height: 1000}, orbit: source.camera.orbit, fov: source.camera.fieldOfView},
  {name: "desktop-front", viewport: {width: 1440, height: 1000}, orbit: "0deg 90deg 103%", fov: source.camera.fieldOfView},
  {name: "desktop-rear", viewport: {width: 1440, height: 1000}, orbit: "180deg 90deg 103%", fov: source.camera.fieldOfView},
  {name: "mobile-default", viewport: {width: 390, height: 844}, orbit: source.camera.mobileOrbit, fov: source.camera.mobileFieldOfView, target: source.camera.mobileTarget},
  {name: "mobile-front", viewport: {width: 390, height: 844}, orbit: "0deg 90deg 105%", fov: source.camera.mobileFieldOfView, target: source.camera.mobileTarget},
  {name: "mobile-rear", viewport: {width: 390, height: 844}, orbit: "180deg 90deg 105%", fov: source.camera.mobileFieldOfView, target: source.camera.mobileTarget}
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(outputDir, {recursive: true});
const browser = await chromium.launch({headless: true});
const captures = [];

try {
  for (const profile of profiles) {
    const page = await browser.newPage({viewport: profile.viewport, deviceScaleFactor: 1});
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    await page.goto(baseUrl, {waitUntil: "networkidle"});
    await page.locator("[data-product-viewer-activate]").click();
    await page.locator("model-viewer").waitFor({state: "attached"});
    const metrics = await page.locator("model-viewer").evaluate(async (viewer, settings) => {
      if (!viewer.loaded) await new Promise((resolve, reject) => {
        viewer.addEventListener("load", resolve, {once: true});
        viewer.addEventListener("error", () => reject(new Error("model-viewer error")), {once: true});
      });
      if (settings.fov) viewer.setAttribute("field-of-view", settings.fov);
      if (settings.orbit) viewer.setAttribute("camera-orbit", settings.orbit);
      if (settings.target) viewer.setAttribute("camera-target", settings.target);
      if (settings.fov || settings.orbit || settings.target) viewer.jumpCameraToGoal();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dimensions = viewer.getDimensions();
      const centre = viewer.getBoundingBoxCenter();
      return {
        loaded: viewer.loaded,
        dimensionsM: [dimensions.x, dimensions.y, dimensions.z],
        centreM: [centre.x, centre.y, centre.z],
        fieldOfViewDeg: viewer.getFieldOfView(),
        cameraOrbit: viewer.getCameraOrbit()
      };
    }, {fov: profile.fov, orbit: profile.orbit, target: profile.target || null});
    const file = path.join(outputDir, `cassette-002-${profile.name}.png`);
    await page.locator("[data-product-viewer-stage]").screenshot({path: file, animations: "disabled"});
    const bytes = await readFile(file);
    captures.push({
      view: profile.name,
      path: path.relative(path.resolve(here, "../.."), file).split(path.sep).join("/"),
      sha256: sha256(bytes),
      viewportPx: [profile.viewport.width, profile.viewport.height],
      errors,
      ...metrics
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const readabilitySource = path.join(outputDir, "cassette-002-desktop-front.png");
const readabilityFile = path.join(outputDir, "cassette-002-desktop-readability-crop.png");
await sharp(readabilitySource)
  .extract({left: 90, top: 50, width: 320, height: 180})
  .resize({width: 1280, kernel: "nearest"})
  .png()
  .toFile(readabilityFile);
const readabilityBytes = await readFile(readabilityFile);
captures.push({
  view: "desktop-readability-crop",
  path: path.relative(path.resolve(here, "../.."), readabilityFile).split(path.sep).join("/"),
  sha256: sha256(readabilityBytes),
  expectedText: source.readabilityAnchors.asciiJCard.expectedText,
  asymmetricAnchors: source.readabilityAnchors.asciiJCard
});

process.stdout.write(`${JSON.stringify(captures, null, 2)}\n`);
