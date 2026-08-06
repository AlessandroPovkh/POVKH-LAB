#!/usr/bin/env node
import { chromium } from "../../site/node_modules/playwright/index.mjs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(here, "physical", "source");
const source = path.join(sourceRoot, "render.html");
const output = path.join(here, "exports");
const deliveries = [
  { label: "desktop", width: 1920, height: 1080, fps: 30, stem: "PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1" },
  { label: "mobile", width: 640, height: 360, fps: 24, stem: "PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1" }
];
const durationSeconds = 3;
const ffmpegBinary = process.env.PVKH_FFMPEG_BINARY || "ffmpeg";
const sourceFiles = ["render.html", "physical.css", "physical.js"];

const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const sourceSha256 = async () => {
  const digest = createHash("sha256");
  for (const file of sourceFiles) {
    digest.update(file);
    digest.update(await readFile(path.join(sourceRoot, file)));
  }
  digest.update(await readFile(fileURLToPath(import.meta.url)));
  return digest.digest("hex");
};
const encode = async (frames, target, delivery, codec) => {
  const input = path.join(frames, "frame-%04d.png");
  const common = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-framerate", String(delivery.fps), "-i", input,
    "-frames:v", String(durationSeconds * delivery.fps), "-an",
    "-map_metadata", "-1", "-fflags", "+bitexact", "-pix_fmt", "yuv420p"
  ];
  const codecArgs = codec === "mp4"
    ? ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", "-flags:v", "+bitexact"]
    : ["-c:v", "libvpx-vp9", "-crf", "35", "-b:v", "0", "-cpu-used", "2", "-row-mt", "0", "-threads", "1"];
  await exec(ffmpegBinary, [...common, ...codecArgs, target], { maxBuffer: 16 * 1024 * 1024 });
};

const stage = await mkdtemp(path.join(here, ".physical-stage-"));
const framesRoot = await mkdtemp(path.join(tmpdir(), "povkh-physical-frames-"));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const assets = [];
  for (const delivery of deliveries) {
    const frames = path.join(framesRoot, delivery.label);
    await import("node:fs/promises").then(({ mkdir }) => mkdir(frames, { recursive: true }));
    await page.setViewportSize({ width: delivery.width, height: delivery.height });
    for (let frame = 0; frame < durationSeconds * delivery.fps; frame += 1) {
      const url = new URL(pathToFileURL(source));
      url.searchParams.set("time", String(frame / delivery.fps));
      await page.goto(url.href, { waitUntil: "load" });
      await page.waitForFunction(() => window.__POVKH_PHYSICAL_READY__ === true);
      await page.screenshot({
        path: path.join(frames, `frame-${String(frame).padStart(4, "0")}.png`),
        animations: "disabled"
      });
    }
    for (const format of ["mp4", "webm"]) {
      const file = `${delivery.stem}.${format}`;
      const target = path.join(stage, file);
      await encode(frames, target, delivery, format);
      assets.push({
        file,
        width: delivery.width,
        height: delivery.height,
        durationSeconds,
        fps: delivery.fps,
        format,
        audio: false,
        sha256: await sha256(target)
      });
    }
  }
  await browser.close();
  browser = null;
  const manifest = {
    schemaVersion: 1,
    scene: "physical",
    sequence: "scan > register > materialise > hold",
    renderer: "Playwright + ffmpeg",
    sourceSha256: await sourceSha256(),
    assets
  };
  await writeFile(path.join(stage, "physical-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const asset of [...assets, { file: "physical-manifest.json" }]) {
    await rename(path.join(stage, asset.file), path.join(output, asset.file));
  }
  console.log(`PHYSICAL motion render: PASS — ${assets.length} silent deliveries`);
} finally {
  if (browser) await browser.close();
  await rm(framesRoot, { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
}
