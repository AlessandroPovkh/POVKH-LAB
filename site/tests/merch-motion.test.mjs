import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createPages } from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
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

const deliveries = [
  { file: "PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.webm", codec: "vp9", width: 1920, height: 1080, fps: 30 },
  { file: "PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.mp4", codec: "h264", width: 1920, height: 1080, fps: 30 },
  { file: "PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.webm", codec: "vp9", width: 640, height: 360, fps: 24 },
  { file: "PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.mp4", codec: "h264", width: 640, height: 360, fps: 24 }
];

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
  const sourceDigest = createHash("sha256");
  for (const file of ["render.html", "physical.css", "physical.js"]) {
    sourceDigest.update(file);
    sourceDigest.update(await readFile(path.join(physicalSourceRoot, file)));
  }
  sourceDigest.update(await readFile(path.resolve(motionRoot, "..", "render_physical_motion.mjs")));
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
});

test("the build copies the four PHYSICAL deliveries into the first-party motion directory", async () => {
  const buildSource = await readFile(path.join(siteRoot, "tools", "build.mjs"), "utf8");
  for (const { file } of deliveries) {
    assert.ok(buildSource.includes(`"${file}"`), `build must copy ${file}`);
    assert.ok(buildSource.includes(`"../media/motion/exports/${file}"`), `build manifest must record ${file}`);
  }
});
