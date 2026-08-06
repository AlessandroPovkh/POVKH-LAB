import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";

const execFile = promisify(execFileCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const glbPath = path.join(siteRoot, "assets/merch-3d/cassette-002.glb");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("source identity attachments remain byte-identical and poster follows the merch registry", async () => {
  const source = await readJson(path.join(here, "cassette-002.source.json"));
  const merch = await readJson(path.join(siteRoot, "data/merch.json"));
  const product = merch.objects.find((entry) => entry.id === "MRCH-002");

  assert.equal(source.camera.poster, product.gallery.find((image) => image.role === "hero").path);
  assert.equal(source.camera.poster, product.viewer.poster);
  for (const identity of Object.values(source.identity)) {
    const bytes = await readFile(path.join(here, identity.path));
    assert.equal(sha256(bytes), identity.sha256);
  }
});

test("optimized GLB contains exact mechanics, embedded identity and a centred grounded pivot", async () => {
  const [bytes, report] = await Promise.all([
    readFile(glbPath),
    readJson(path.join(here, "reports/cassette-002.report.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const nodes = doc.getRoot().listNodes();
  const names = nodes.map((node) => node.getName());
  const textures = doc.getRoot().listTextures();
  const bounds = getBounds(doc.getRoot().getDefaultScene());

  assert.equal(names.filter((name) => /^Screw_\d{2}$/.test(name)).length, 5);
  assert.deepEqual(names.filter((name) => /^Hub_/.test(name)).sort(), ["Hub_Left", "Hub_Right"]);
  assert.deepEqual(names.filter((name) => /^Guide_Roller_/.test(name)).sort(), ["Guide_Roller_Left", "Guide_Roller_Right"]);
  assert.deepEqual(names.filter((name) => /^Spindle_/.test(name)).sort(), ["Spindle_Left", "Spindle_Right"]);
  assert.equal(nodes.find((node) => node.getName() === "Pressure_Pad").getExtras().touchesTapeInProjection, true);
  assert.deepEqual(nodes.find((node) => node.getName() === "Tape_Path").getExtras().orderedRoute, ["left-reel", "left-guide", "pressure-pad", "right-guide", "right-reel"]);
  assert.equal(nodes.find((node) => node.getName() === "Empty_Window").getExtras().containsGeometry, false);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(textures.length, 3);
  assert.deepEqual(textures.map((texture) => sha256(texture.getImage())).sort(), Object.values(report.sourceIntegrity).map((entry) => entry.sha256).sort());
  assert.ok(Math.abs(bounds.min[1]) < 1e-7, `ground drift: ${bounds.min[1]}`);
  assert.ok(Math.abs(bounds.min[0] + bounds.max[0]) < 1e-7, "X pivot is not centred");
  assert.ok(Math.abs(bounds.min[2] + bounds.max[2]) < 1e-7, "Z pivot is not centred");
});

test("actual artifact independently satisfies validation and hard budgets", async () => {
  const bytes = await readFile(glbPath);
  const report = await readJson(path.join(here, "reports/cassette-002.report.json"));
  const result = await validateBytes(new Uint8Array(bytes), {uri: "cassette-002.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  const file = await stat(glbPath);

  assert.equal(result.issues.numErrors, 0);
  assert.equal(result.issues.numWarnings, 0);
  assert.equal(file.size, report.budget.bytes);
  assert.equal(sha256(bytes), report.output.sha256);
  assert.ok(report.budget.bytes <= 2_500_000);
  assert.ok(report.budget.triangles <= 50_000);
  assert.ok(report.budget.drawCalls <= 12);
  assert.equal(report.deterministic.verifiedBySecondInMemoryBuild, true);
});

test("checked-in GLB and reports reproduce from canonical inputs", async () => {
  const {stdout, stderr} = await execFile(process.execPath, [path.join(here, "build-cassette-002.mjs"), "--verify"], {cwd: siteRoot});
  assert.match(stdout, /verified [a-f0-9]{64}/);
  assert.doesNotMatch(`${stdout}\n${stderr}`, /\/Users\/|\\Users\\|20\d\d-\d\d-\d\dT/);
});
