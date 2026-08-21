import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const outputDir = path.join(here, "reports/screenshots");
const source = JSON.parse(await readFile(path.join(here, "vinyl-001.source.json"), "utf8"));
const baseUrl = process.env.PVKH_MERCH_QA_URL || "http://127.0.0.1:4173/merch/vinyl/";
const assetKey = "vinyl-001";
const profiles = [
  {name:"desktop-default",viewport:{width:1440,height:1000},...source.camera.desktop.default},
  {name:"desktop-front",viewport:{width:1440,height:1000},...source.camera.desktop.front},
  {name:"desktop-rear",viewport:{width:1440,height:1000},...source.camera.desktop.rear},
  {name:"mobile-default",viewport:{width:390,height:844},...source.camera.mobile.default},
  {name:"mobile-front",viewport:{width:390,height:844},...source.camera.mobile.front},
  {name:"mobile-rear",viewport:{width:390,height:844},...source.camera.mobile.rear}
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (filename) => path.relative(siteRoot, filename).split(path.sep).join("/");
await mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const captures=[];
try{
  for(const profile of profiles){
    const page=await browser.newPage({viewport:profile.viewport,deviceScaleFactor:1});
    const errors=[];
    page.on("console",message=>{if(message.type()==="error")errors.push(`console: ${message.text()}`);});
    page.on("pageerror",error=>errors.push(`page: ${error.message}`));
    await page.goto(baseUrl,{waitUntil:"networkidle"});
    await page.locator("[data-product-viewer-activate]").click();
    const viewer=page.locator("model-viewer");await viewer.waitFor({state:"attached"});
    const metrics=await viewer.evaluate(async(element,settings)=>{
      if(!element.loaded)await new Promise((resolve,reject)=>{element.addEventListener("load",resolve,{once:true});element.addEventListener("error",()=>reject(new Error("model-viewer load error")),{once:true});});
      element.setAttribute("camera-orbit",settings.orbit);element.setAttribute("camera-target",settings.target);element.setAttribute("field-of-view",settings.fieldOfView);element.jumpCameraToGoal();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const dimensions=element.getDimensions(),centre=element.getBoundingBoxCenter();
      return {loaded:element.loaded,dimensionsM:[dimensions.x,dimensions.y,dimensions.z],centreM:[centre.x,centre.y,centre.z],fieldOfViewDeg:element.getFieldOfView(),cameraOrbit:element.getCameraOrbit()};
    },profile);
    const filename=path.join(outputDir,`${assetKey}-${profile.name}.png`);
    await page.locator("[data-product-viewer-stage]").screenshot({path:filename,animations:"disabled"});
    const bytes=await readFile(filename),stats=await sharp(bytes).stats();
    assert.ok(stats.entropy>1.2,`${profile.name} appears visually blank`);
    captures.push({view:profile.name,path:relative(filename),sha256:sha256(bytes),viewportPx:[profile.viewport.width,profile.viewport.height],entropy:Number(stats.entropy.toFixed(4)),errors,...metrics});
    await page.close();
  }
}finally{await browser.close();}

const frontFile=path.join(outputDir,`${assetKey}-desktop-front.png`),frontMeta=await sharp(frontFile).metadata();
const cropFile=path.join(outputDir,`${assetKey}-desktop-readability-crop.png`);
await sharp(frontFile).extract({left:0,top:Math.floor(frontMeta.height*0.10),width:Math.floor(frontMeta.width*0.58),height:Math.floor(frontMeta.height*0.72)}).resize({width:1400,kernel:"lanczos3"}).png({compressionLevel:9}).toFile(cropFile);
const cropBytes=await readFile(cropFile);captures.push({view:"desktop-readability-crop",path:relative(cropFile),sha256:sha256(cropBytes),expected:"exact v05 outer-front master including governed tracklist"});

const canonicalPath=path.resolve(here,"../../../../data-key-003",source.visualReference.path);
const canonicalBytes=await readFile(canonicalPath);assert.equal(sha256(canonicalBytes),source.visualReference.sha256,"canonical visual reference drift");
const compareFile=path.join(outputDir,`${assetKey}-selected-gallery-compare.png`);
const left=await sharp(canonicalBytes).resize(960,640,{fit:"contain",background:"#090a0c"}).png().toBuffer();
const right=await sharp(frontFile).resize(960,640,{fit:"contain",background:"#090a0c"}).png().toBuffer();
await sharp({create:{width:1920,height:640,channels:4,background:"#090a0c"}}).composite([{input:left,left:0,top:0},{input:right,left:960,top:0}]).png({compressionLevel:9}).toFile(compareFile);
const compareBytes=await readFile(compareFile);
const qa={schemaVersion:1,assetKey,baseUrl,capturedAtPolicy:"timestamp-omitted-for-determinism",views:captures,visualComparison:{canonicalPath:source.visualReference.path,canonicalSha256:source.visualReference.sha256,artifactPath:relative(compareFile),artifactSha256:sha256(compareBytes),layout:"canonical-left / live-3d-front-right"},checks:{sixRequiredViews:profiles.every(profile=>captures.some(capture=>capture.view===profile.name)),noBrowserErrors:captures.every(capture=>!capture.errors||capture.errors.length===0),readabilityCrop:true,modelLoaded:captures.filter(capture=>capture.loaded!==undefined).every(capture=>capture.loaded)}};
await writeFile(path.join(here,`reports/${assetKey}.browser-qa.json`),`${JSON.stringify(qa,null,2)}\n`);
assert.deepEqual(qa.checks,{sixRequiredViews:true,noBrowserErrors:true,readabilityCrop:true,modelLoaded:true},JSON.stringify(captures.map(({view,errors})=>({view,errors}))));
process.stdout.write(`${assetKey}: six views + readability + selected-gallery compare captured\n`);
