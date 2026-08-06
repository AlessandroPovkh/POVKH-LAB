import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { validateBytes } from "gltf-validator";

const execFile = promisify(execFileCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const glbPath = path.join(siteRoot, "assets/merch-3d/data-key-003.glb");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const boundsFor = (accessor) => {
  const values = accessor.getArray();
  const stride = accessor.getElementSize();
  const min = Array(stride).fill(Infinity);
  const max = Array(stride).fill(-Infinity);
  for (let offset = 0; offset < values.length; offset += stride) {
    for (let axis = 0; axis < stride; axis += 1) {
      min[axis] = Math.min(min[axis], values[offset + axis]);
      max[axis] = Math.max(max[axis], values[offset + axis]);
    }
  }
  return min.map((value, axis) => Number(((max[axis] - value) * 1000).toFixed(3)));
};

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((totals, mesh) => {
  for (const primitive of mesh.listPrimitives()) {
    totals.triangles += primitive.getIndices().getCount() / 3;
    totals.drawCalls += 1;
  }
  return totals;
}, {triangles: 0, drawCalls: 0});

test("data key sources pin the approved TECHNICAL RAIL closed-state authority", async () => {
  const source = await readJson(path.join(here, "data-key-003.source.json"));
  const expected = {
    placements: ["production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/placements.json", "ee2b6576ecff0c1f2b0d7d6960c5e2c451f660ff44110fa65d5fdec00fd80188"],
    provenance: ["production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/provenance.json", "5ed3d6b5a3732979634626668f36aff3b3f450b8a5bbe7b429e72f14a9f4fcaa"],
    selection: ["production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/candidate-selection.json", "77cdc1f0cdf2bb880ca11a427dc7ff80d382b5862842d5448184cab55a357ae7"]
  };
  for (const [key, [canonicalPath, canonicalSha256]] of Object.entries(expected)) {
    const authority = source.canonicalSource[key];
    assert.equal(authority.path, canonicalPath);
    assert.equal(authority.sha256, canonicalSha256);
    const bytes = await readFile(path.join(here, authority.fixturePath));
    assert.equal(sha256(bytes), authority.fixtureSha256);
    const fixture = JSON.parse(bytes);
    assert.equal(fixture.authorityType, "governed-minimal-copy");
    assert.equal(fixture.canonicalPath, canonicalPath);
    assert.equal(fixture.canonicalSha256, canonicalSha256);
  }
  assert.equal(source.selectedCandidate, "03 / TECHNICAL RAIL");
  assert.equal(source.state, "CLOSED / BOTH RETRACTED");
  assert.equal(source.dimensions.authority, "provisional-viewer-envelope-not-machinable");
  assert.equal(sha256(await readFile(path.join(here, source.identity.compactReverse.path))), source.identity.compactReverse.sha256);
  assert.equal(source.identity.compactReverse.application, "single-recessed-device-mark");
  assert.equal(source.identity.asciiDark.application, "audit-only-packaging-excluded");
  assert.equal(source.camera.poster, "assets/merch/usb-edition-packaging.webp");
});

test("data key GLB is a static closed dual-interface device inside the 86 x 20 x 9 mm envelope", async () => {
  const [source, bytes, report, browserQa] = await Promise.all([
    readJson(path.join(here, "data-key-003.source.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/data-key-003.report.json")),
    readJson(path.join(here, "reports/data-key-003.browser-qa.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
  for (const name of ["Data_Key_Device", "Data_Key_Polymer_Slider", "Data_Key_USB_A_Interface_Envelope", "Data_Key_USB_C_Interface_Envelope", "Data_Key_Compact_Identity"]) {
    assert.ok(nodes.get(name)?.getMesh(), `${name} mesh missing`);
  }
  assert.deepEqual(boundsFor(nodes.get("Data_Key_Device").getMesh().listPrimitives()[0].getAttribute("POSITION")), [86, 20, 9]);
  assert.equal(nodes.get("Data_Key_Device").getExtras().state, "closed-both-retracted");
  assert.equal(nodes.get("Data_Key_Device").getExtras().dimensionAuthority, "provisional-viewer-envelope-not-machinable");
  assert.equal(nodes.get("Data_Key_USB_A_Interface_Envelope").getExtras().exposed, false);
  assert.equal(nodes.get("Data_Key_USB_C_Interface_Envelope").getExtras().exposed, false);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(doc.getRoot().listNodes().some((node) => /pack|case|insert/i.test(node.getName())), false);
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().canonicalSourceSha256 === source.identity.compactReverse.sha256).length, 1);
  const metrics = metricsFor(doc);
  assert.ok(bytes.byteLength <= 1_200_000);
  assert.ok(metrics.triangles <= 18_000);
  assert.ok(metrics.drawCalls <= 7);
  assert.deepEqual(report.budget, {...metrics, bytes: bytes.byteLength, ceilings: source.budgets});
  assert.equal(report.output.sha256, sha256(bytes));
  assert.deepEqual(report.cameraRecommendations.desktop.default, {orbit: "35deg 75deg 120%", target: "auto 0.010m auto", fieldOfView: "24deg"});
  assert.deepEqual(browserQa.checks, {sixRequiredViews: true, noBrowserErrors: true, readabilityCrop: true, sourceCompare: true, modelLoaded: true});
  assert.equal(browserQa.capturedAtPolicy, "timestamp-omitted; checked-in hashes prove snapshot integrity, while rerenders use semantic and perceptual gates");
  assert.deepEqual(browserQa.rerenderPolicy, {
    pixelHashes: "snapshot-integrity-only",
    maxChannelDelta: 8,
    maxMeanAbsoluteChannelDelta: 0.001,
    semanticGatesRemainAuthoritative: true
  });
  assert.deepEqual(browserQa.views.filter((view) => /^(desktop|mobile)-(default|front|rear)$/.test(view.view)).map((view) => view.view).sort(), ["desktop-default","desktop-front","desktop-rear","mobile-default","mobile-front","mobile-rear"]);
  for (const view of browserQa.views) assert.equal(sha256(await readFile(path.join(siteRoot, view.path))), view.sha256, `${view.view} screenshot drift`);
  assert.equal(sha256(await readFile(path.join(siteRoot, browserQa.visualComparison.artifactPath))), browserQa.visualComparison.artifactSha256);
});

test("data key validates without warnings and checked-in output is deterministic", async () => {
  const bytes = await readFile(glbPath);
  const validation = await validateBytes(new Uint8Array(bytes), {uri: "data-key-003.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  assert.equal(validation.issues.numErrors, 0);
  assert.equal(validation.issues.numWarnings, 0);
  const {stdout} = await execFile(process.execPath, [path.join(here, "build-data-key-003.mjs"), "--verify"], {cwd: siteRoot});
  assert.match(stdout, /verified [a-f0-9]{64}/);
});
