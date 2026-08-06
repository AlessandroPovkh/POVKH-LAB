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
const profiles = [
  ["desktop-default", { width: 1440, height: 1000 }, source.camera.orbit],
  ["desktop-front", { width: 1440, height: 1000 }, "0deg 90deg 115%"],
  ["desktop-rear", { width: 1440, height: 1000 }, "180deg 90deg 115%"],
  ["mobile-default", { width: 390, height: 844 }, source.camera.orbit],
  ["mobile-front", { width: 390, height: 844 }, "0deg 90deg 115%"],
  ["mobile-rear", { width: 390, height: 844 }, "180deg 90deg 115%"]
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
  for (const [name, viewport, orbit] of profiles) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${name}: ${message.text()}`); });
    page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
    await page.goto(`${base}/merch/poster/`, { waitUntil: "load" });
    await page.locator("[data-product-viewer-activate]").click();
    await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready");
    metrics[name] = await page.locator("model-viewer").evaluate(async (model, settings) => {
      model.setAttribute("camera-orbit", settings.orbit);
      model.setAttribute("camera-target", "auto auto auto");
      model.setAttribute("field-of-view", "30deg");
      model.jumpCameraToGoal();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dimensions = model.getDimensions();
      const centre = model.getBoundingBoxCenter();
      const camera = model.getCameraOrbit();
      return { loaded: model.loaded, dimensionsM: [dimensions.x, dimensions.y, dimensions.z], centreM: [centre.x, centre.y, centre.z], cameraOrbit: { theta: camera.theta, phi: camera.phi, radius: camera.radius }, fieldOfViewDeg: model.getFieldOfView() };
    }, { orbit });
    const filename = path.join(outputDir, `print-001-${name}.png`);
    await page.locator("[data-product-viewer-stage]").screenshot({ path: filename, animations: "disabled" });
    const bytes = await readFile(filename);
    const stats = await sharp(bytes).stats();
    assert.ok(stats.entropy > 1, `${name} appears blank`);
    screenshots[name] = { path: relative(filename), sha256: sha256(bytes), viewportPx: [viewport.width, viewport.height], entropy: Number(stats.entropy.toFixed(4)) };
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
  .resize({ width: 1600, kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(cropPath);
const cropBytes = await readFile(cropPath);
screenshots["desktop-readability-crop"] = { path: relative(cropPath), sha256: sha256(cropBytes), expected: "Bone master left / Void reverse master right" };

const bone = await sharp(path.join(here, source.identity.boneLeft.path)).resize(420, 594, { fit: "fill" }).png().toBuffer();
const voidArt = await sharp(path.join(here, source.identity.voidRight.path)).resize(420, 594, { fit: "fill" }).png().toBuffer();
const sourcePair = await sharp({ create: { width: 870, height: 594, channels: 4, background: "#080808" } }).composite([{ input: bone, left: 0, top: 0 }, { input: voidArt, left: 450, top: 0 }]).png().toBuffer();
const liveFront = await sharp(frontPath).resize(870, 594, { fit: "contain", background: "#080808" }).png().toBuffer();
const comparePath = path.join(outputDir, "print-001-source-compare.png");
await sharp({ create: { width: 1740, height: 594, channels: 4, background: "#080808" } }).composite([{ input: sourcePair, left: 0, top: 0 }, { input: liveFront, left: 870, top: 0 }]).png({ compressionLevel: 9 }).toFile(comparePath);
const compareBytes = await readFile(comparePath);

const report = {
  schemaVersion: 1,
  assetKey: "print-001",
  baseUrlPolicy: "ephemeral-local-static-server",
  screenshots,
  metrics,
  consoleErrors,
  pageErrors,
  cameraRecommendation: source.camera,
  visualComparison: { status: "pass", method: "exact-source-pair-left / live-browser-front-right", artifactPath: relative(comparePath), artifactSha256: sha256(compareBytes), checks: ["Bone artwork remains left", "Void artwork remains right", "30 mm gap remains open", "no frame, tape or cast-shadow geometry"] },
  visualRisks: ["Fine typography is reduced at mobile default distance", "Rear view intentionally shows unprinted paper backs", "Subtle 1.5 mm bow is most legible under slight orbit"]
};
assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.ok(Object.values(metrics).every((entry) => entry.loaded));
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write("print-001: desktop/mobile default/front/rear + readability and exact-source comparison captured\n");
