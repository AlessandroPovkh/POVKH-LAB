import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createPages } from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "..");
const motionRoot = path.resolve(siteRoot, "..", "media", "motion", "exports");
const physicalSourceRoot = path.resolve(motionRoot, "..", "physical", "source");
const json = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const catalog = await json("../data/catalog.json");
const audioLibrary = await json("../data/audio-library.json");
const artistLibrary = await json("../data/artists.json");
const registry = await json("../data/merch.json");
const copyAuthority = await json("../data/merch-copy-authority.json");
const readAsset = async (relative) => {
  const image = registry.objects.flatMap((object) => object.gallery).find(({ path }) => path === relative);
  return image ? { path: relative, width: image.width, height: image.height, sha256: "a".repeat(64) } : null;
};
const merchLibrary = await validateMerchLibrary(registry, copyAuthority, { readAsset });
const pages = createPages(catalog, audioLibrary, artistLibrary, merchLibrary);
const pageFor = (locale) => pages.get(`${locale === "en" ? "" : `${locale}/`}merch/index.html`).toString();
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const verifyRenderHost = process.env.PVKH_VERIFY_PHYSICAL_RENDER_TOOLCHAIN === "1";

const deliveries = [
  { file: "PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.webm", codec: "vp9", width: 1920, height: 1080, fps: 30 },
  { file: "PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.mp4", codec: "h264", width: 1920, height: 1080, fps: 30 },
  { file: "PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.webm", codec: "vp9", width: 640, height: 360, fps: 24 },
  { file: "PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.mp4", codec: "h264", width: 640, height: 360, fps: 24 }
];
const provenanceFiles = [
  "assets/fonts/BarlowCondensed-Black.ttf",
  "assets/fonts/IBMPlexMono-Medium.ttf",
  "assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg",
  "media/motion/physical/source/physical.css",
  "media/motion/physical/source/physical.js",
  "media/motion/physical/source/render.html",
  "media/motion/render_physical_motion.mjs"
];
const fileSha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const decodedSeam = async (file, { width, height, fps }) => {
  const frameCount = 3 * fps;
  const { stdout } = await exec("ffmpeg", [
    "-v", "error", "-i", file,
    "-vf", `select=eq(n\\,0)+eq(n\\,${frameCount - 1})`,
    "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
  ], { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
  const frameBytes = width * height * 3;
  assert.equal(stdout.length, frameBytes * 2, `${path.basename(file)} seam decoder must return exactly two RGB24 frames`);
  let absoluteDelta = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < frameBytes; index += 1) {
    const delta = Math.abs(stdout[index] - stdout[frameBytes + index]);
    absoluteDelta += delta;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  return {
    normalizedMae: absoluteDelta / (frameBytes * 255),
    maxChannelDelta
  };
};

test("renders one live merch title over the PHYSICAL motion stage without the repeated plate title", () => {
  for (const locale of ["en", "it", "ru"]) {
    const html = pageFor(locale);
    assert.equal(count(html, /<h1\b/g), 1, `${locale} merch must expose one live h1`);
    assert.equal(count(html, /id="merch-title"/g), 1, `${locale} merch title must remain live HTML`);
    assert.equal(count(html, /data-merch-motion-stage(?:[ >])/g), 1, `${locale} merch motion stage is missing`);
    assert.equal(count(html, /class="merch-hero-object"/g), 0, `${locale} repeated static title plate must be removed`);

    const stage = html.match(/<div class="merch-motion-stage"[\s\S]*?<\/div>\s*<div class="hero-bottom">/)?.[0];
    assert.ok(stage, `${locale} merch PHYSICAL stage markup is missing`);
    assert.equal(count(stage, /data-motion-video(?:[ >])/g), 1, `${locale} merch must use one shared lazy motion video`);
    assert.match(stage, /data-merch-motion-fallback/);
    assert.match(stage, /class="merch-motion-ring"/);
    assert.match(stage, /class="merch-motion-datum"/);
    assert.match(stage, /class="merch-motion-signal"/);
    assert.doesNotMatch(stage, /FIRST PHYSICAL SIGNAL/i, `${locale} fallback must not repeat the hero title`);
    assert.match(stage, /data-src="[^"]*PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1\.webm"/);
    assert.match(stage, /data-mobile-src="[^"]*PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1\.webm"/);
    assert.match(stage, /data-src="[^"]*PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1\.mp4"/);
    assert.match(stage, /data-mobile-src="[^"]*PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1\.mp4"/);
    assert.doesNotMatch(stage, /<source\s+src=/, `${locale} motion sources must remain unhydrated at parse time`);
  }
});

test("publishes silent loop-safe PHYSICAL desktop and mobile deliveries with an auditable manifest", async () => {
  const manifestPath = path.join(motionRoot, "physical-manifest.json");
  await access(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.scene, "physical");
  assert.equal(manifest.sequence, "scan > register > materialise > hold");
  assert.equal(manifest.assets.length, 4);
  assert.ok(Array.isArray(manifest.inputs), "PHYSICAL manifest must enumerate transitive inputs");
  assert.deepEqual(manifest.inputs.map(({ file }) => file), provenanceFiles, "PHYSICAL provenance must enumerate every transitive file input in stable order");
  const sourceDigest = createHash("sha256");
  for (const input of manifest.inputs) {
    const file = path.join(repoRoot, input.file);
    const digest = await fileSha256(file);
    assert.equal(input.sha256, digest, `PHYSICAL provenance hash drifted for ${input.file}`);
    sourceDigest.update(input.file);
    sourceDigest.update(await readFile(file));
  }
  assert.equal(manifest.sourceSha256, sourceDigest.digest("hex"), "PHYSICAL delivery is stale relative to its renderer source");
  const renderSource = await readFile(path.join(physicalSourceRoot, "render.html"), "utf8");
  assert.match(renderSource, /assets\/logo\/povkh-lab-compact-reverse-transparent-outlined\.svg/, "PHYSICAL source must use the exact approved compact bullet mark");

  for (const expected of deliveries) {
    const delivery = manifest.assets.find(({ file }) => file === expected.file);
    assert.ok(delivery, `manifest is missing ${expected.file}`);
    assert.match(delivery.sha256, /^[a-f0-9]{64}$/);
    assert.equal(delivery.width, expected.width);
    assert.equal(delivery.height, expected.height);
    assert.equal(delivery.fps, expected.fps);
    assert.equal(delivery.durationSeconds, 3);
    assert.equal(delivery.audio, false);
    const file = path.join(motionRoot, expected.file);
    await access(file);
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), delivery.sha256, `${expected.file} hash drifted`);
    if (verifyRenderHost) {
      const { stdout } = await exec("ffprobe", [
        "-v", "error",
        "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration",
        "-of", "json",
        file
      ]);
      const probe = JSON.parse(stdout);
      assert.equal(probe.streams.length, 1, `${expected.file} must contain one stream`);
      assert.equal(probe.streams[0].codec_type, "video", `${expected.file} must be silent video`);
      assert.equal(probe.streams[0].codec_name, expected.codec, `${expected.file} codec drifted`);
      assert.equal(probe.streams[0].width, expected.width, `${expected.file} width drifted`);
      assert.equal(probe.streams[0].height, expected.height, `${expected.file} height drifted`);
      const [numerator, denominator] = probe.streams[0].r_frame_rate.split("/").map(Number);
      assert.ok(Math.abs((numerator / denominator) - expected.fps) <= 0.05, `${expected.file} fps drifted`);
      assert.ok(Math.abs(Number(probe.format.duration) - 3) <= 0.08, `${expected.file} duration drifted`);
    }
    assert.ok(delivery.loopSeam, `${expected.file} must record a decoded first-to-last loop seam`);
    assert.equal(delivery.loopSeam.method, "decoded-rgb24-normalized-mae");
    assert.equal(delivery.loopSeam.frames, `0:${(3 * expected.fps) - 1}`);
    assert.equal(delivery.loopSeam.threshold, 0.0025);
    assert.equal(delivery.loopSeam.thresholdRationale, "mean decoded channel delta stays below 0.64 of one 8-bit code value");
    assert.equal(delivery.loopSeam.maxChannelThreshold, 8);
    assert.equal(delivery.loopSeam.maxChannelThresholdRationale, "no localized decoded channel may jump by more than 8 of 255 code values");
    assert.ok(delivery.loopSeam.normalizedMae >= 0 && delivery.loopSeam.normalizedMae <= delivery.loopSeam.threshold, `${expected.file} recorded normalized seam exceeds its accepted threshold`);
    assert.ok(Number.isInteger(delivery.loopSeam.maxChannelDelta) && delivery.loopSeam.maxChannelDelta >= 0 && delivery.loopSeam.maxChannelDelta <= delivery.loopSeam.maxChannelThreshold, `${expected.file} recorded localized seam exceeds its accepted threshold`);
    if (verifyRenderHost) {
      const actualSeam = await decodedSeam(file, expected);
      assert.ok(actualSeam.normalizedMae <= delivery.loopSeam.threshold, `${expected.file} decoded loop seam ${actualSeam.normalizedMae} exceeds ${delivery.loopSeam.threshold}`);
      assert.ok(actualSeam.maxChannelDelta <= delivery.loopSeam.maxChannelThreshold, `${expected.file} localized loop seam ${actualSeam.maxChannelDelta} exceeds ${delivery.loopSeam.maxChannelThreshold}`);
      assert.ok(Math.abs(actualSeam.normalizedMae - delivery.loopSeam.normalizedMae) <= 1e-9, `${expected.file} recorded loop seam is stale`);
      assert.equal(actualSeam.maxChannelDelta, delivery.loopSeam.maxChannelDelta, `${expected.file} recorded maximum channel delta is stale`);
    }
  }
});

test("records the exact pinned Playwright, Chromium and ffmpeg render toolchain", async () => {
  const manifest = JSON.parse(await readFile(path.join(motionRoot, "physical-manifest.json"), "utf8"));
  assert.ok(manifest.toolchain, "PHYSICAL manifest must record the pinned and actual render toolchain");
  const packageJson = JSON.parse(await readFile(path.join(siteRoot, "package.json"), "utf8"));
  const playwrightPackagePath = path.join(siteRoot, "node_modules", "playwright", "package.json");
  const playwrightPackage = JSON.parse(await readFile(playwrightPackagePath, "utf8"));
  assert.equal(manifest.toolchain.playwright.pinnedVersion, packageJson.devDependencies.playwright);
  assert.equal(manifest.toolchain.playwright.actualVersion, playwrightPackage.version);
  assert.equal(manifest.toolchain.playwright.actualVersion, manifest.toolchain.playwright.pinnedVersion, "actual Playwright must equal its project pin");
  assert.equal(manifest.toolchain.playwright.packageJsonSha256, await fileSha256(playwrightPackagePath));

  const browsersPath = path.join(siteRoot, "node_modules", "playwright-core", "browsers.json");
  const browsers = JSON.parse(await readFile(browsersPath, "utf8"));
  const chromiumPin = browsers.browsers.find(({ name }) => name === "chromium");
  assert.ok(chromiumPin, "Playwright Chromium pin is missing");
  assert.equal(manifest.toolchain.chromium.pinnedRevision, chromiumPin.revision);
  assert.equal(manifest.toolchain.chromium.pinnedVersion, chromiumPin.browserVersion);
  assert.equal(manifest.toolchain.chromium.browsersJsonSha256, await fileSha256(browsersPath));
  assert.equal(manifest.toolchain.chromium.actualVersion, manifest.toolchain.chromium.pinnedVersion, "recorded Chromium must equal the Playwright browser pin");
  assert.match(manifest.toolchain.chromium.executableSha256, /^[a-f0-9]{64}$/);

  assert.equal(manifest.toolchain.ffmpeg.pinnedVersion, "7.0.2-tessus");
  assert.equal(manifest.toolchain.ffmpeg.actualVersion, manifest.toolchain.ffmpeg.pinnedVersion, "recorded ffmpeg must equal the renderer pin");
  assert.match(manifest.toolchain.ffmpeg.executableSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.toolchain.environment.node, /^v\d+\.\d+\.\d+$/);
  assert.match(manifest.toolchain.environment.platform, /^(darwin|linux|win32)$/);
  assert.match(manifest.toolchain.environment.arch, /^(arm64|x64)$/);

  const rendererSource = await readFile(path.join(repoRoot, "media", "motion", "render_physical_motion.mjs"), "utf8");
  assert.match(rendererSource, /actualFfmpegVersion !== pinnedFfmpegVersion/, "renderer must reject an unpinned ffmpeg host");
  assert.match(rendererSource, /actualChromiumVersion !== chromiumPin\.browserVersion/, "renderer must reject an unpinned Chromium host");
  assert.match(rendererSource, /executableSha256: await sha256\(chromium\.executablePath\(\)\)/, "renderer must fingerprint Chromium");
  assert.match(rendererSource, /executableSha256: await sha256\(ffmpegBinary\)/, "renderer must fingerprint ffmpeg");
});

test("matches the recorded executable fingerprints when run on the original render host", { skip: !verifyRenderHost }, async () => {
  const manifest = JSON.parse(await readFile(path.join(motionRoot, "physical-manifest.json"), "utf8"));
  const chromiumExecutable = chromium.executablePath();
  assert.equal(manifest.toolchain.chromium.executableSha256, await fileSha256(chromiumExecutable));
  const browser = await chromium.launch({ headless: true });
  try {
    assert.equal(manifest.toolchain.chromium.actualVersion, browser.version());
    assert.equal(manifest.toolchain.chromium.actualVersion, manifest.toolchain.chromium.pinnedVersion, "actual Chromium must equal the Playwright browser pin");
  } finally {
    await browser.close();
  }

  const { stdout: ffmpegPathOutput } = await exec("which", ["ffmpeg"]);
  const ffmpegPath = await realpath(ffmpegPathOutput.trim());
  const { stdout: ffmpegVersionOutput } = await exec(ffmpegPath, ["-version"]);
  const actualFfmpegVersion = ffmpegVersionOutput.match(/^ffmpeg version\s+([^\s]+)/)?.[1];
  assert.ok(actualFfmpegVersion, "ffmpeg version cannot be resolved");
  assert.equal(manifest.toolchain.ffmpeg.actualVersion, actualFfmpegVersion);
  assert.equal(manifest.toolchain.ffmpeg.executableSha256, await fileSha256(ffmpegPath));
});

test("the build copies the four PHYSICAL deliveries into the first-party motion directory", async () => {
  const buildSource = await readFile(path.join(siteRoot, "tools", "build.mjs"), "utf8");
  for (const { file } of deliveries) {
    assert.ok(buildSource.includes(`"${file}"`), `build must copy ${file}`);
    assert.ok(buildSource.includes(`"../media/motion/exports/${file}"`), `build manifest must record ${file}`);
  }
});
