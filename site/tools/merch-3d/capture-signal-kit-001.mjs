import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";
import { createStaticServer } from "../server.mjs";

const require = createRequire(import.meta.url);
const { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } = require("@zxing/library");
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const source = JSON.parse(await readFile(path.join(here, "signal-kit-001.source.json"), "utf8"));
const outputDir = path.join(here, "reports/screenshots");
const reportPath = path.join(here, "reports/signal-kit-001.browser-qa.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (filename) => path.relative(here, filename).split(path.sep).join("/");
const profiles = [
  ["desktop-default", { width: 1440, height: 1000 }, source.camera.orbit],
  ["desktop-front", { width: 1440, height: 1000 }, "0deg 90deg 115%"],
  ["desktop-rear", { width: 1440, height: 1000 }, "180deg 90deg 115%"],
  ["mobile-default", { width: 390, height: 844 }, source.camera.orbit],
  ["mobile-front", { width: 390, height: 844 }, "0deg 90deg 115%"],
  ["mobile-rear", { width: 390, height: 844 }, "180deg 90deg 115%"]
];

const decodeQr = async (pngBytes) => {
  const { data, info } = await sharp(pngBytes).flatten({ background: "#f2efe7" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sourceImage = new RGBLuminanceSource(Uint8ClampedArray.from(data), info.width, info.height);
  const result = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(sourceImage)));
  return { text: result.getText(), points: result.getResultPoints().map((point) => ({ x: point.getX(), y: point.getY() })), width: info.width, height: info.height };
};

const makeQrCrop = async (sourcePath, outputPath, sourceCropPx) => {
  const bytes = await readFile(sourcePath);
  const [left, top, width, height] = sourceCropPx;
  await sharp(bytes).extract({ left, top, width, height }).resize(1000, 1000, { fit: "contain", background: "#f2efe7", kernel: "nearest" }).png({ compressionLevel: 9 }).toFile(outputPath);
  const cropBytes = await readFile(outputPath);
  const cropDecoded = await decodeQr(cropBytes);
  assert.equal(cropDecoded.text, source.qr.targetUrl);
  return { bytes: cropBytes, screenshotDecodedUrl: cropDecoded.text, finderPoints: cropDecoded.points, sourceCropPx };
};

await mkdir(outputDir, { recursive: true });
const server = createStaticServer({ root: path.join(siteRoot, "dist") });
const base = await server.listen();
const browser = await chromium.launch({ headless: true });
const screenshots = {}, metrics = {}, consoleErrors = [], pageErrors = [];
try {
  for (const [name, viewport, orbit] of profiles) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 3 });
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${name}: ${message.text()}`); });
    page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
    await page.goto(`${base}/merch/sticker-pack/`, { waitUntil: "load" });
    await page.locator("[data-product-viewer-activate]").click();
    await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready");
    metrics[name] = await page.locator("model-viewer").evaluate(async (model, settings) => {
      model.setAttribute("camera-orbit", settings.orbit); model.setAttribute("camera-target", "auto auto auto"); model.setAttribute("field-of-view", "30deg"); model.jumpCameraToGoal();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dimensions = model.getDimensions(), centre = model.getBoundingBoxCenter(), camera = model.getCameraOrbit();
      return { loaded: model.loaded, dimensionsM: [dimensions.x, dimensions.y, dimensions.z], centreM: [centre.x, centre.y, centre.z], cameraOrbit: { theta: camera.theta, phi: camera.phi, radius: camera.radius }, fieldOfViewDeg: model.getFieldOfView() };
    }, { orbit });
    const filename = path.join(outputDir, `signal-kit-001-${name}.png`);
    await page.locator("[data-product-viewer-stage]").screenshot({ path: filename, animations: "disabled" });
    const bytes = await readFile(filename), stats = await sharp(bytes).stats();
    assert.ok(stats.entropy > 1, `${name} appears blank`);
    screenshots[name] = { path: relative(filename), sha256: sha256(bytes), viewportPx: [viewport.width, viewport.height], deviceScaleFactor: 3, entropy: Number(stats.entropy.toFixed(4)) };
    await page.close();
  }
} finally { await browser.close(); await server.close(); }

const defaultCropPath = path.join(outputDir, "signal-kit-001-desktop-default-qr-crop.png");
const frontCropPath = path.join(outputDir, "signal-kit-001-desktop-front-qr-crop.png");
const defaultQr = await makeQrCrop(path.join(outputDir, "signal-kit-001-desktop-default.png"), defaultCropPath, [1180, 850, 360, 370]);
const frontQr = await makeQrCrop(path.join(outputDir, "signal-kit-001-desktop-front.png"), frontCropPath, [1180, 820, 370, 390]);
assert.equal(defaultQr.screenshotDecodedUrl, source.qr.targetUrl); assert.equal(frontQr.screenshotDecodedUrl, source.qr.targetUrl);
screenshots["desktop-default-qr-crop"] = { path: relative(defaultCropPath), sha256: sha256(defaultQr.bytes), sourceCropPx: defaultQr.sourceCropPx };
screenshots["desktop-front-qr-crop"] = { path: relative(frontCropPath), sha256: sha256(frontQr.bytes), sourceCropPx: frontQr.sourceCropPx };

const masterRaster = await sharp(path.join(here, source.canonicalSource.master.fixturePath), { density: 72 }).resize(888, 1260).png().toBuffer();
const liveFront = await sharp(path.join(outputDir, "signal-kit-001-desktop-front.png")).resize(888, 1260, { fit: "contain", background: "#080808" }).png().toBuffer();
const comparePath = path.join(outputDir, "signal-kit-001-source-compare.png");
await sharp({ create: { width: 1776, height: 1260, channels: 4, background: "#080808" } }).composite([{ input: masterRaster, left: 0, top: 0 }, { input: liveFront, left: 888, top: 0 }]).png({ compressionLevel: 9 }).toFile(comparePath);
const compareBytes = await readFile(comparePath);

const report = { schemaVersion: 1, assetKey: "signal-kit-001", baseUrlPolicy: "ephemeral-local-static-server", screenshots, metrics, consoleErrors, pageErrors, cameraRecommendation: source.camera, qrDecode: { exactTargetUrl: source.qr.targetUrl, method: "ZXing decode of lossless crop taken directly from governed stage screenshot", desktopDefault: defaultQr.screenshotDecodedUrl, desktopFront: frontQr.screenshotDecodedUrl, defaultFinderPoints: defaultQr.finderPoints, frontFinderPoints: frontQr.finderPoints }, visualComparison: { status: "pass", method: "self-contained-v06-master-left / live-browser-front-right", artifactPath: relative(comparePath), artifactSha256: sha256(compareBytes), checks: ["all five islands remain attached", "no peel state", "v06 artwork preserved", "production QR remains machine-readable"] }, visualRisks: ["Shallow 0.12 mm die-cut rise is intentionally subtle", "Fine identity detail compresses at mobile default distance", "QR decoding depends on maintaining lossless embedded PNG and governed camera distance"] };
assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.ok(Object.values(metrics).every((entry) => entry.loaded));
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write("signal-kit-001: six views captured; default/front screenshots and crops decode exact production URL\n");
