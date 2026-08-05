import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadMerchAssetManifest } from "./export-merch-assets.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(siteRoot);
const library = JSON.parse(await readFile(path.join(siteRoot, "data", "merch.json"), "utf8"));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource
} = require("@zxing/library");
const publishedQrCrop = Object.freeze({ x: 868, y: 664, width: 126, height: 126, scale: 4 });

const decodePublishedQr = (pngBuffer) => {
  const png = PNG.sync.read(pngBuffer);
  const width = publishedQrCrop.width * publishedQrCrop.scale;
  const height = publishedQrCrop.height * publishedQrCrop.scale;
  const luminance = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = publishedQrCrop.y + Math.floor(y / publishedQrCrop.scale);
    for (let x = 0; x < width; x += 1) {
      const sourceX = publishedQrCrop.x + Math.floor(x / publishedQrCrop.scale);
      const sourceOffset = (sourceY * png.width + sourceX) * 4;
      const targetOffset = y * width + x;
      const alpha = png.data[sourceOffset + 3] / 255;
      const red = png.data[sourceOffset] * alpha + 242 * (1 - alpha);
      const green = png.data[sourceOffset + 1] * alpha + 239 * (1 - alpha);
      const blue = png.data[sourceOffset + 2] * alpha + 231 * (1 - alpha);
      luminance[targetOffset] = (red + 2 * green + blue) / 4;
    }
  }

  const source = new RGBLuminanceSource(luminance, width, height);
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
};

const webpDimensions = (buffer) => {
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF", "public merch asset must start with RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP", "public merch asset must be WebP");
  const type = buffer.subarray(12, 16).toString("ascii");
  if (type === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  if (type === "VP8L") {
    assert.equal(buffer[20], 0x2f, "invalid lossless WebP signature");
    return {
      width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
      height: 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10)
    };
  }
  if (type === "VP8 ") {
    const marker = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    assert.ok(marker >= 0, "invalid lossy WebP frame marker");
    return {
      width: buffer.readUInt16LE(marker + 3) & 0x3fff,
      height: buffer.readUInt16LE(marker + 5) & 0x3fff
    };
  }
  throw new Error(`unsupported WebP chunk ${type}`);
};

test("the exact 50 public concept exports match source and registry authority", async () => {
  const manifest = await loadMerchAssetManifest();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, "approvedConceptExports");
  assert.deepEqual(manifest.imports.signalKitV06, {
    state: manifest.imports.signalKitV06.state,
    designSpec: "docs/superpowers/specs/2026-08-05-povkh-signal-kit-production-qr-gallery-design.md",
    implementationPlan: "docs/superpowers/plans/2026-08-05-povkh-signal-kit-production-qr-gallery.md",
    targetUrl: "https://alessandropovkh.github.io/POVKH-LAB/links/",
    authoritativeQaPassed: true,
    authoritativeDecodePassed: true,
    localProductionRoutePassed: manifest.imports.signalKitV06.localProductionRoutePassed,
    localCanonicalPassed: manifest.imports.signalKitV06.localCanonicalPassed,
    liveReachability: manifest.imports.signalKitV06.liveReachability,
    privateGovernanceUnchanged: true
  });
  const pairedState = manifest.imports.signalKitV06.state === "preparedForPublicConceptArchive"
    && manifest.imports.signalKitV06.localProductionRoutePassed === false
    && manifest.imports.signalKitV06.localCanonicalPassed === false
    && manifest.imports.signalKitV06.liveReachability === "pendingPostDeploy";
  const promotedState = manifest.imports.signalKitV06.state === "approvedForPublicConceptArchivePendingReachability"
    && manifest.imports.signalKitV06.localProductionRoutePassed === true
    && manifest.imports.signalKitV06.localCanonicalPassed === true
    && manifest.imports.signalKitV06.liveReachability === "pendingPostDeploy";
  const liveState = manifest.imports.signalKitV06.state === "approvedForPublicConceptArchive"
    && manifest.imports.signalKitV06.localProductionRoutePassed === true
    && manifest.imports.signalKitV06.localCanonicalPassed === true
    && manifest.imports.signalKitV06.liveReachability === "passed";
  assert.ok(pairedState || promotedState || liveState, "Signal Kit site import state and route proof flags must stay paired");
  assert.equal(manifest.assets.length, 50);

  const registry = library.objects.flatMap((object) => object.gallery.map((image) => ({
    objectId: object.id,
    slug: object.slug,
    role: image.role,
    path: image.path,
    width: image.width,
    height: image.height
  })));
  const sourcePaths = new Set();
  const publicPaths = new Set();
  const outputHashes = new Set();
  let totalPublicBytes = 0;
  for (const [index, asset] of manifest.assets.entries()) {
    const expected = registry[index];
    assert.deepEqual(
      { objectId: asset.objectId, slug: asset.slug, role: asset.role, path: asset.publicPath },
      { objectId: expected.objectId, slug: expected.slug, role: expected.role, path: expected.path }
    );
    assert.match(asset.source, /^production\/(?!.*(?:^|\/)\.\.(?:\/|$)).+\.png$/);
    assert.match(asset.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(asset.outputSha256, /^[a-f0-9]{64}$/);
    assert.ok(!sourcePaths.has(asset.source), `duplicate source path ${asset.source}`);
    assert.ok(!publicPaths.has(asset.publicPath), `duplicate public path ${asset.publicPath}`);
    assert.ok(!outputHashes.has(asset.outputSha256), `duplicate public content hash ${asset.outputSha256}`);
    sourcePaths.add(asset.source);
    publicPaths.add(asset.publicPath);
    outputHashes.add(asset.outputSha256);

    const publicFile = path.join(siteRoot, asset.publicPath);
    const publicStat = await stat(publicFile);
    assert.ok(publicStat.size <= 1.5 * 1024 * 1024, `${asset.publicPath} exceeds the 1.5 MiB gallery budget`);
    totalPublicBytes += publicStat.size;
    const bytes = await readFile(publicFile);
    const dimensions = webpDimensions(bytes);
    assert.equal(sha256(bytes), asset.outputSha256);
    assert.deepEqual(dimensions, { width: asset.width, height: asset.height });
    assert.deepEqual(dimensions, { width: expected.width, height: expected.height });
    assert.ok(Math.max(asset.width, asset.height) <= 2000);
    assert.ok(asset.width <= asset.sourceWidth && asset.height <= asset.sourceHeight);
    assert.ok(Math.abs(asset.width / asset.height - asset.sourceWidth / asset.sourceHeight) < 0.002);
    assert.equal(asset.encoder, "ffmpeg/libwebp q=88 yuv420p metadata-stripped");

    if (process.env.PVKH_VERIFY_PRIVATE_MERCH_SOURCES === "1") {
      const sourceFile = path.join(repoRoot, asset.source);
      await stat(sourceFile);
      assert.equal(sha256(await readFile(sourceFile)), asset.sourceSha256);
    }
  }
  assert.ok(totalPublicBytes <= 30 * 1024 * 1024, `public merch gallery exceeds 30 MiB: ${totalPublicBytes} bytes`);
});

test("the QR survives the public WebP export and resolves to the fixed smart-link route", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pvkh-merch-qr-"));
  const decodedPng = path.join(temporaryDirectory, "sticker-pack-sheet.png");

  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", path.join(siteRoot, "assets/merch/sticker-pack-sheet.webp"),
      "-frames:v", "1",
      decodedPng
    ]);
    assert.equal(
      decodePublishedQr(await readFile(decodedPng)),
      "https://alessandropovkh.github.io/POVKH-LAB/links/"
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
