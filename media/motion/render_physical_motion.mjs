#!/usr/bin/env node
import { chromium } from "../../site/node_modules/playwright/index.mjs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const siteRoot = path.join(repoRoot, "site");
const sourceRoot = path.join(here, "physical", "source");
const source = path.join(sourceRoot, "render.html");
const output = path.join(here, "exports");
const deliveries = [
  { label: "desktop", width: 1920, height: 1080, fps: 30, stem: "PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1" },
  { label: "mobile", width: 640, height: 360, fps: 24, stem: "PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1" }
];
const durationSeconds = 3;
const requestedFfmpegBinary = process.env.PVKH_FFMPEG_BINARY || "ffmpeg";
const pinnedFfmpegVersion = "7.0.2-tessus";
const loopSeamThreshold = 0.0025;
const loopSeamMaxChannelThreshold = 8;
const provenanceFiles = [
  "assets/fonts/BarlowCondensed-Black.ttf",
  "assets/fonts/IBMPlexMono-Medium.ttf",
  "assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg",
  "media/motion/physical/source/physical.css",
  "media/motion/physical/source/physical.js",
  "media/motion/physical/source/render.html",
  "media/motion/render_physical_motion.mjs"
];

const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const collectInputs = async () => Promise.all(provenanceFiles.map(async (file) => ({
  file,
  sha256: await sha256(path.join(repoRoot, file))
})));
const sourceSha256 = async (inputs) => {
  const digest = createHash("sha256");
  for (const input of inputs) {
    digest.update(input.file);
    digest.update(await readFile(path.join(repoRoot, input.file)));
  }
  return digest.digest("hex");
};
const resolveExecutable = async (requested) => {
  if (requested.includes(path.sep)) return realpath(requested);
  const { stdout } = await exec("which", [requested]);
  return realpath(stdout.trim());
};
const ffmpegBinary = await resolveExecutable(requestedFfmpegBinary);
const { stdout: ffmpegVersionOutput } = await exec(ffmpegBinary, ["-version"]);
const actualFfmpegVersion = ffmpegVersionOutput.match(/^ffmpeg version\s+([^\s]+)/)?.[1];
if (actualFfmpegVersion !== pinnedFfmpegVersion) {
  throw new Error(`PHYSICAL renderer requires ffmpeg ${pinnedFfmpegVersion}; received ${actualFfmpegVersion || "unknown"}`);
}
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
const decodedLoopSeam = async (file, delivery) => {
  const frameCount = durationSeconds * delivery.fps;
  const { stdout } = await exec(ffmpegBinary, [
    "-v", "error", "-i", file,
    "-vf", `select=eq(n\\,0)+eq(n\\,${frameCount - 1})`,
    "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
  ], { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
  const frameBytes = delivery.width * delivery.height * 3;
  if (stdout.length !== frameBytes * 2) {
    throw new Error(`${path.basename(file)} seam decoder returned ${stdout.length} bytes; expected ${frameBytes * 2}`);
  }
  let absoluteDelta = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < frameBytes; index += 1) {
    const delta = Math.abs(stdout[index] - stdout[frameBytes + index]);
    absoluteDelta += delta;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  const normalizedMae = absoluteDelta / (frameBytes * 255);
  if (normalizedMae > loopSeamThreshold) {
    throw new Error(`${path.basename(file)} decoded loop seam ${normalizedMae} exceeds ${loopSeamThreshold}`);
  }
  if (maxChannelDelta > loopSeamMaxChannelThreshold) {
    throw new Error(`${path.basename(file)} localized decoded loop seam ${maxChannelDelta} exceeds ${loopSeamMaxChannelThreshold}`);
  }
  return {
    method: "decoded-rgb24-normalized-mae",
    frames: `0:${frameCount - 1}`,
    threshold: loopSeamThreshold,
    thresholdRationale: "mean decoded channel delta stays below 0.64 of one 8-bit code value",
    maxChannelThreshold: loopSeamMaxChannelThreshold,
    maxChannelThresholdRationale: "no localized decoded channel may jump by more than 8 of 255 code values",
    normalizedMae: Number(normalizedMae.toFixed(12)),
    maxChannelDelta
  };
};
const packageJson = JSON.parse(await readFile(path.join(siteRoot, "package.json"), "utf8"));
const playwrightPackagePath = path.join(siteRoot, "node_modules", "playwright", "package.json");
const playwrightPackage = JSON.parse(await readFile(playwrightPackagePath, "utf8"));
const pinnedPlaywrightVersion = packageJson.devDependencies?.playwright;
if (playwrightPackage.version !== pinnedPlaywrightVersion) {
  throw new Error(`PHYSICAL renderer requires Playwright ${pinnedPlaywrightVersion}; received ${playwrightPackage.version}`);
}
const browsersPath = path.join(siteRoot, "node_modules", "playwright-core", "browsers.json");
const browsers = JSON.parse(await readFile(browsersPath, "utf8"));
const chromiumPin = browsers.browsers.find(({ name }) => name === "chromium");
if (!chromiumPin) throw new Error("Playwright Chromium pin is unavailable");

const stage = await mkdtemp(path.join(here, ".physical-stage-"));
const framesRoot = await mkdtemp(path.join(tmpdir(), "povkh-physical-frames-"));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const actualChromiumVersion = browser.version();
  if (actualChromiumVersion !== chromiumPin.browserVersion) {
    throw new Error(`PHYSICAL renderer requires Chromium ${chromiumPin.browserVersion}; received ${actualChromiumVersion}`);
  }
  const toolchain = {
    playwright: {
      pinnedVersion: pinnedPlaywrightVersion,
      actualVersion: playwrightPackage.version,
      packageJsonSha256: await sha256(playwrightPackagePath)
    },
    chromium: {
      pinnedRevision: chromiumPin.revision,
      pinnedVersion: chromiumPin.browserVersion,
      actualVersion: actualChromiumVersion,
      browsersJsonSha256: await sha256(browsersPath),
      executableSha256: await sha256(chromium.executablePath())
    },
    ffmpeg: {
      pinnedVersion: pinnedFfmpegVersion,
      actualVersion: actualFfmpegVersion,
      executableSha256: await sha256(ffmpegBinary)
    },
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch()
    }
  };
  const assets = [];
  for (const delivery of deliveries) {
    const frames = path.join(framesRoot, delivery.label);
    await mkdir(frames, { recursive: true });
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
        sha256: await sha256(target),
        loopSeam: await decodedLoopSeam(target, delivery)
      });
    }
  }
  await browser.close();
  browser = null;
  const inputs = await collectInputs();
  const manifest = {
    schemaVersion: 1,
    scene: "physical",
    sequence: "scan > register > materialise > hold",
    renderer: "Playwright + Chromium + ffmpeg",
    inputs,
    sourceSha256: await sourceSha256(inputs),
    toolchain,
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
