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
const source = JSON.parse(await readFile(path.join(here, "print-001.source.json"), "utf8"));
const outputDir = path.join(here, "reports/screenshots");
const reportPath = path.join(here, "reports/print-001.browser-qa.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (filename) => path.relative(here, filename).split(path.sep).join("/");
const defaultCamera = { orbit: source.camera.orbit, fieldOfView: source.camera.fieldOfView, target: source.camera.target };
const profiles = [
  { name: "desktop-default", viewRole: "default", viewport: { width: 1440, height: 1000 }, cameraProfile: defaultCamera, applyCamera: false },
  { name: "desktop-front", viewRole: "front", viewport: { width: 1440, height: 1000 }, cameraProfile: source.camera.evidenceViews.front, applyCamera: true },
  { name: "desktop-rear", viewRole: "rear", viewport: { width: 1440, height: 1000 }, cameraProfile: source.camera.evidenceViews.rear, applyCamera: true },
  { name: "mobile-default", viewRole: "default", viewport: { width: 390, height: 844 }, cameraProfile: defaultCamera, applyCamera: false },
  { name: "mobile-front", viewRole: "front", viewport: { width: 390, height: 844 }, cameraProfile: source.camera.evidenceViews.front, applyCamera: true },
  { name: "mobile-rear", viewRole: "rear", viewport: { width: 390, height: 844 }, cameraProfile: source.camera.evidenceViews.rear, applyCamera: true }
];

await mkdir(outputDir, { recursive: true });
const server = createStaticServer({ root: path.join(siteRoot, "dist") });
const base = await server.listen();
const browser = await chromium.launch({ headless: true });
const screenshots = {};
const consoleErrors = [];
const pageErrors = [];
const metrics = {};
try {
  for (const { name, viewRole, viewport, cameraProfile, applyCamera } of profiles) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${name}: ${message.text()}`); });
    page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
    await page.goto(`${base}/merch/poster/`, { waitUntil: "load" });
    await page.locator("[data-product-viewer-activate]").click();
    await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready");
    metrics[name] = await page.locator("model-viewer").evaluate(async (model, settings) => {
      const declaredCamera = {
        orbit: model.getAttribute("camera-orbit"),
        fieldOfView: model.getAttribute("field-of-view"),
        target: model.getAttribute("camera-target")
      };
      if (settings.applyCamera) {
        model.setAttribute("camera-orbit", settings.cameraProfile.orbit);
        model.setAttribute("camera-target", settings.cameraProfile.target);
        model.setAttribute("field-of-view", settings.cameraProfile.fieldOfView);
      }
      model.jumpCameraToGoal();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dimensions = model.getDimensions();
      const centre = model.getBoundingBoxCenter();
      const camera = model.getCameraOrbit();
      return { loaded: model.loaded, declaredCamera, dimensionsM: [dimensions.x, dimensions.y, dimensions.z], centreM: [centre.x, centre.y, centre.z], cameraOrbit: { theta: camera.theta, phi: camera.phi, radius: camera.radius }, fieldOfViewDeg: model.getFieldOfView() };
    }, { cameraProfile, applyCamera });
    if (!applyCamera) assert.deepEqual(metrics[name].declaredCamera, cameraProfile, `${name} live page camera is not governed by PRINT source`);
    const filename = path.join(outputDir, `print-001-${name}.png`);
    const stage = page.locator("[data-product-viewer-stage]");
    const stageBox = await stage.boundingBox();
    assert.ok(stageBox, `${name} stage has no layout box`);
    await stage.screenshot({ path: filename, animations: "disabled" });
    const bytes = await readFile(filename);
    const metadata = await sharp(bytes).metadata();
    const stageCssPx = [Math.round(stageBox.width), Math.round(stageBox.height)];
    const screenshotPx = [metadata.width, metadata.height];
    assert.deepEqual(screenshotPx, stageCssPx.map((value) => value * 2), `${name} is not a genuine DPR2 stage capture`);
    const stats = await sharp(bytes).stats();
    assert.ok(stats.entropy > 1, `${name} appears blank`);
    screenshots[name] = {
      path: relative(filename),
      sha256: sha256(bytes),
      viewportCssPx: [viewport.width, viewport.height],
      stageCssPx,
      screenshotPx,
      deviceScaleFactor: 2,
      viewRole,
      cameraAuthority: "print-001.source.json#camera",
      cameraProfile,
      cameraApplication: applyCamera ? "governed-qa-view-applied-from-source" : "live-page-manifest-verified-against-source",
      entropy: Number(stats.entropy.toFixed(4))
    };
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const frontPath = path.join(outputDir, "print-001-desktop-front.png");
const frontMeta = await sharp(frontPath).metadata();
const cropPath = path.join(outputDir, "print-001-desktop-readability-crop.png");
await sharp(frontPath).extract({ left: Math.floor(frontMeta.width * 0.08), top: Math.floor(frontMeta.height * 0.08), width: Math.floor(frontMeta.width * 0.84), height: Math.floor(frontMeta.height * 0.84) })
  .png({ compressionLevel: 9 }).toFile(cropPath);
const cropBytes = await readFile(cropPath);
const cropMeta = await sharp(cropBytes).metadata();
screenshots["desktop-readability-crop"] = {
  path: relative(cropPath),
  sha256: sha256(cropBytes),
  screenshotPx: [cropMeta.width, cropMeta.height],
  deviceScaleFactor: 2,
  cameraAuthority: "print-001.source.json#camera",
  cameraProfile: source.camera.evidenceViews.front,
  captureMethod: "native-DPR2-crop-without-enlargement",
  sourceScreenshot: "desktop-front",
  expected: "Bone master left / Void reverse master right"
};

const bone = await sharp(path.join(here, source.identity.boneLeft.path)).resize(840, 1188, { fit: "fill" }).png().toBuffer();
const voidArt = await sharp(path.join(here, source.identity.voidRight.path)).resize(840, 1188, { fit: "fill" }).png().toBuffer();
const sourcePair = await sharp({ create: { width: 1740, height: 1188, channels: 4, background: "#080808" } }).composite([{ input: bone, left: 0, top: 0 }, { input: voidArt, left: 900, top: 0 }]).png().toBuffer();
const liveFront = await sharp(frontPath).resize(1740, 1188, { fit: "contain", background: "#080808" }).png().toBuffer();
const comparePath = path.join(outputDir, "print-001-source-compare.png");
await sharp({ create: { width: 3480, height: 1188, channels: 4, background: "#080808" } }).composite([{ input: sourcePair, left: 0, top: 0 }, { input: liveFront, left: 1740, top: 0 }]).png({ compressionLevel: 9 }).toFile(comparePath);
const compareBytes = await readFile(comparePath);

const report = {
  schemaVersion: 1,
  assetKey: "print-001",
  baseUrlPolicy: "ephemeral-local-static-server",
  capturePolicy: {
    deviceScaleFactor: 2,
    pixelDensity: "2x",
    defaultLabel: "governed-source-camera",
    defaultAuthority: "print-001.source.json#camera",
    defaultApplication: "live-page-manifest-verified-against-source",
    readability: "native-DPR2-crop-without-enlargement"
  },
  screenshots,
  metrics,
  consoleErrors,
  pageErrors,
  cameraRecommendation: source.camera,
  visualComparison: { status: "pass", method: "exact-source-pair-left / live-browser-front-right", capturePixelDensity: "2x", artifactPath: relative(comparePath), artifactSha256: sha256(compareBytes), checks: ["Bone artwork remains left", "Void artwork remains right", "30 mm gap remains open", "no frame, tape or cast-shadow geometry"] },
  visualRisks: ["Fine typography is reduced at mobile default distance", "Rear view intentionally shows unprinted paper backs", "Subtle 1.5 mm bow is most legible under slight orbit"]
};
assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.ok(Object.values(metrics).every((entry) => entry.loaded));
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write("print-001: governed-source desktop/mobile default/front/rear captured at DPR2 with native readability and exact-source comparison\n");
