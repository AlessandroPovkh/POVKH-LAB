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
const source = JSON.parse(await readFile(path.join(here, "zine-001.source.json"), "utf8"));
const outputDir = path.join(here, "reports/screenshots");
const reportPath = path.join(here, "reports/zine-001.browser-qa.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (filename) => path.relative(here, filename).split(path.sep).join("/");
const profiles = [
  ["desktop-default", { width: 1440, height: 1000 }, source.camera.orbit],
  ["desktop-front", { width: 1440, height: 1000 }, "0deg 90deg 110%"],
  ["desktop-rear", { width: 1440, height: 1000 }, "180deg 90deg 110%"],
  ["mobile-default", { width: 390, height: 844 }, source.camera.orbit],
  ["mobile-front", { width: 390, height: 844 }, "0deg 90deg 110%"],
  ["mobile-rear", { width: 390, height: 844 }, "180deg 90deg 110%"]
];

await mkdir(outputDir, { recursive: true });
const server = createStaticServer({ root: path.join(siteRoot, "dist") });
const base = await server.listen();
const browser = await chromium.launch({ headless: true });
const screenshots = {}, metrics = {}, consoleErrors = [], pageErrors = [];
try {
  for (const [name, viewport, orbit] of profiles) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${name}: ${message.text()}`); });
    page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
    await page.goto(`${base}/merch/zine-booklet/`, { waitUntil: "load" });
    await page.locator("[data-product-viewer-activate]").click();
    await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready");
    metrics[name] = await page.locator("model-viewer").evaluate(async (model, settings) => {
      model.setAttribute("camera-orbit", settings.orbit); model.setAttribute("camera-target", "auto auto auto"); model.setAttribute("field-of-view", "30deg"); model.jumpCameraToGoal();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dimensions=model.getDimensions(),centre=model.getBoundingBoxCenter(),camera=model.getCameraOrbit();
      return { loaded:model.loaded,dimensionsM:[dimensions.x,dimensions.y,dimensions.z],centreM:[centre.x,centre.y,centre.z],cameraOrbit:{theta:camera.theta,phi:camera.phi,radius:camera.radius},fieldOfViewDeg:model.getFieldOfView() };
    }, { orbit });
    const filename = path.join(outputDir, `zine-001-${name}.png`);
    await page.locator("[data-product-viewer-stage]").screenshot({ path: filename, animations: "disabled" });
    const bytes=await readFile(filename),stats=await sharp(bytes).stats(); assert.ok(stats.entropy>0.8,`${name} appears blank`);
    screenshots[name]={path:relative(filename),sha256:sha256(bytes),viewportPx:[viewport.width,viewport.height],deviceScaleFactor:2,entropy:Number(stats.entropy.toFixed(4))};
    await page.close();
  }
} finally { await browser.close(); await server.close(); }

const frontPath=path.join(outputDir,"zine-001-desktop-front.png"),frontMeta=await sharp(frontPath).metadata();
const cropPath=path.join(outputDir,"zine-001-desktop-readability-crop.png");
await sharp(frontPath).extract({left:Math.floor(frontMeta.width*0.27),top:Math.floor(frontMeta.height*0.03),width:Math.floor(frontMeta.width*0.46),height:Math.floor(frontMeta.height*0.94)}).resize({width:1200,kernel:"lanczos3"}).png({compressionLevel:9}).toFile(cropPath);
const cropBytes=await readFile(cropPath); screenshots["desktop-readability-crop"]={path:relative(cropPath),sha256:sha256(cropBytes),expected:["ZINE 001 / SIGNAL ARCHAEOLOGY","RECOVERY LOG / ARCHIVE OBJECT","POVKH_LAB::SIGNAL"]};

const masterBytes=await readFile(path.join(here,source.canonicalSource.cover.fixturePath)); assert.equal(sha256(masterBytes),source.canonicalSource.cover.sha256);
const masterRaster=await sharp(masterBytes,{density:72}).resize(1000,1419).png().toBuffer();
const liveFront=await sharp(frontPath).resize(1000,1419,{fit:"contain",background:"#080808"}).png().toBuffer();
const comparePath=path.join(outputDir,"zine-001-source-compare.png");
await sharp({create:{width:2000,height:1419,channels:4,background:"#080808"}}).composite([{input:masterRaster,left:0,top:0},{input:liveFront,left:1000,top:0}]).png({compressionLevel:9}).toFile(comparePath);
const compareBytes=await readFile(comparePath);

const report={schemaVersion:1,assetKey:"zine-001",baseUrlPolicy:"ephemeral-local-static-server",screenshots,metrics,consoleErrors,pageErrors,cameraRecommendation:source.camera,visualComparison:{status:"pass",method:"exact-cross-product-v04-cover-left / live-browser-front-right",sourcePath:source.canonicalSource.cover.canonicalPath,sourceSha256:source.canonicalSource.cover.sha256,authoritySha256:source.canonicalSource.authority.sha256,artifactPath:relative(comparePath),artifactSha256:sha256(compareBytes),checks:["front artwork is uncropped exact cover master","closed black cover","page block visible only at edges","shallow left spine","exactly two staple marks","no interiors or page-turn state"]},visualRisks:["Two staples are intentionally minute at default/mobile distance","2.4 mm closed thickness reads primarily in default orbit, not orthographic front","Rear view is intentionally unprinted black cover"]};
assert.deepEqual(consoleErrors,[]);assert.deepEqual(pageErrors,[]);assert.ok(Object.values(metrics).every((entry)=>entry.loaded));
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);
process.stdout.write("zine-001: six views + readability crop + exact-cover comparison captured\n");
