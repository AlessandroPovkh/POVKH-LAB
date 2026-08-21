import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } = require("@zxing/library");
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const glbPath = path.join(siteRoot, "assets/merch-3d/signal-kit-001.glb");
const targetUrl = "https://alessandropovkh.github.io/POVKH-LAB/links/";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));

const decodeQr = async (pngBytes) => {
  const { data, info } = await sharp(pngBytes).flatten({ background: "#f2efe7" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const source = new RGBLuminanceSource(Uint8ClampedArray.from(data), info.width, info.height);
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
};

test("SIGNAL pins only v06 art and production QR while v05 remains geometry-only", async () => {
  const source = await readJson(path.join(here, "signal-kit-001.source.json"));
  const expected = {
    master: "be373904e0986ef4e4f61c6bf61f6c42cb0c281b085c48326d48a27014a1cf20",
    productionQr: "dc1d01331f2d58fca1ff49a2929d1bc2f835355f2ed7453a767eba85bd773e2e",
    masterAuthority: "c2056c207509d7df8e837ecc7c41e4a608df655e59f9abffc725c08e73797167",
    placementsGeometryOnly: "04c73d6322291384401da88dc0e09d7dc5cfba702de3661930ee1bf28d4c857a",
    provenance: "5a7c1d7ed7f53c6060bd9f422d5b70e739ee3f3fceae094e4f77884565281a0f"
  };
  for (const [key, hash] of Object.entries(expected)) {
    const entry = source.canonicalSource[key];
    assert.equal(entry.sha256, hash);
    assert.equal(sha256(await readFile(path.join(here, entry.fixturePath))), hash);
  }
  assert.deepEqual(source.canonicalSource.placementsGeometryOnly.usage, ["island bounds", "spacing", "shape geometry"]);
  assert.deepEqual(source.canonicalSource.placementsGeometryOnly.forbiddenUses, ["artwork", "QR payload", "QR image", "copy"]);
  assert.equal(source.qr.targetUrl, targetUrl);
  assert.equal(await decodeQr(await readFile(path.join(here, source.canonicalSource.productionQr.fixturePath))), targetUrl);
  assert.deepEqual(source.camera, { orbit: "0deg 70deg 115%", fieldOfView: "30deg", target: "auto auto auto" });
});

test("SIGNAL reopens as one upright A5 carrier with five attached unpeeled die-cut islands", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const bounds = getBounds(doc.getRoot().getDefaultScene());
  const sizeMm = bounds.min.map((value, axis) => (bounds.max[axis] - value) * 1000);
  assert.ok(Math.abs(sizeMm[0] - 148) < 0.05);
  assert.ok(Math.abs(sizeMm[1] - 210) < 0.05);
  assert.ok(sizeMm[2] > 0.25 && sizeMm[2] <= 0.5);
  assert.ok(Math.abs(bounds.min[1]) < 1e-7);
  const islands = doc.getRoot().listNodes().filter((node) => node.getName().startsWith("Signal_Island_"));
  assert.equal(islands.length, 5);
  assert.ok(islands.every((node) => node.getExtras().attached === true && node.getExtras().peeled === false));
  assert.equal(doc.getRoot().listTextures().length, 1);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(doc.getRoot().listExtensionsUsed().length, 0);
});

test("SIGNAL optimized embedded texture decodes to the exact production URL", async () => {
  const bytes = await readFile(glbPath);
  const doc = await new NodeIO().readBinary(bytes);
  const texture = doc.getRoot().listTextures()[0];
  assert.equal(texture.getMimeType(), "image/png");
  const artMaterial = doc.getRoot().listMaterials().find((material) => material.getName() === "MAT_SIGNAL_KIT_V06_MASTER");
  assert.equal(artMaterial.getAlphaMode(), "BLEND", "transparent v06 field must reveal the Bone carrier");
  assert.equal(artMaterial.getDoubleSided(), true);
  const textureStats = await sharp(texture.getImage()).stats();
  assert.equal(textureStats.channels[3].min, 0, "optimized master must preserve transparent field pixels");
  assert.equal(textureStats.channels[3].max, 255);
  const qrCrop = await sharp(texture.getImage()).extract({ left: 600, top: 876, width: 192, height: 192 }).resize(768, 768, { kernel: "nearest" }).png().toBuffer();
  assert.equal(await decodeQr(qrCrop), targetUrl);
});

test("SIGNAL stays deterministic, validator-clean and under release ceilings", async () => {
  const [bytes, report, validator] = await Promise.all([readFile(glbPath), readJson(path.join(here, "reports/signal-kit-001.report.json")), readJson(path.join(here, "reports/signal-kit-001.validator.json"))]);
  const live = await validateBytes(new Uint8Array(bytes), { uri: "signal-kit-001.glb", format: "glb", writeTimestamp: false });
  assert.equal(live.issues.numErrors, 0); assert.equal(live.issues.numWarnings, 0);
  assert.equal(validator.issues.numErrors, 0); assert.equal(validator.issues.numWarnings, 0);
  assert.equal(report.output.sha256, sha256(bytes));
  assert.equal(report.deterministic.verifiedBySecondInMemoryBuild, true);
  assert.equal(report.qrEvidence.embeddedTextureDecodedUrl, targetUrl);
  assert.ok((await stat(glbPath)).size <= 750_000);
  assert.ok(report.budget.triangles <= 4_000);
  assert.ok(report.budget.drawCalls <= 4);
});

test("SIGNAL browser default/front QR crops decode and all governed views remain clean", async () => {
  const qa = await readJson(path.join(here, "reports/signal-kit-001.browser-qa.json"));
  assert.deepEqual(qa.consoleErrors, []); assert.deepEqual(qa.pageErrors, []);
  assert.equal(qa.qrDecode.desktopDefault, targetUrl);
  assert.equal(qa.qrDecode.desktopFront, targetUrl);
  assert.equal(qa.visualComparison.status, "pass");
  assert.deepEqual(qa.cameraRecommendation, { orbit: "0deg 70deg 115%", fieldOfView: "30deg", target: "auto auto auto" });
  const expected = ["desktop-default", "desktop-front", "desktop-rear", "mobile-default", "mobile-front", "mobile-rear", "desktop-default-qr-crop", "desktop-front-qr-crop"];
  assert.deepEqual(Object.keys(qa.screenshots), expected);
  for (const entry of Object.values(qa.screenshots)) assert.equal(sha256(await readFile(path.join(here, entry.path))), entry.sha256);
  assert.equal(await decodeQr(await readFile(path.join(here, qa.screenshots["desktop-default-qr-crop"].path))), targetUrl);
  assert.equal(await decodeQr(await readFile(path.join(here, qa.screenshots["desktop-front-qr-crop"].path))), targetUrl);
});
