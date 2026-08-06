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
const glbPath = path.join(siteRoot, "assets/merch-3d/collector-box-001.glb");
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

test("collector sources pin ARCHIVE CLAMSHELL closed hero, exact lid identity and provisional boundary", async () => {
  const source = await readJson(path.join(here, "collector-box-001.source.json"));
  const expected = {
    provenanceV04: ["production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/provenance-v04.json", "55070315d383fa3dfea8ecbf1fbfe4ab3e9c2f6a0e1ef3bed480fada50731ee2"],
    parentProvenance: ["production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/provenance.json", "12639f1f8201464ec1a320a6f56f040e47280852cb1e764bbad0d39cb8527bc6"],
    selection: ["production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/candidate-selection.json", "bfdbe40c0322e64d0d8291b1c9602692337a3a14c6c959c2dd34fffaa8f37493"],
    compositionOnly: ["production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/source/final-contents-geometry-v04.json", "7ba671184f982ba03f24f6281f6d3685c78cd4cd0f4c6cfd7fc03fd01b32313a"]
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
  assert.equal(source.selectedForm, "01 / ARCHIVE CLAMSHELL");
  assert.equal(source.state, "CLOSED ONLY");
  assert.equal(source.dimensions.authority, "provisional-viewer-envelope-not-machinable");
  assert.equal(source.canonicalSource.compositionOnly.application, "uncertainty-record-only-not-modeled");
  assert.deepEqual(source.derivedMaterials.bookclothNormal, {
    path: "sources/collector-box-001/PVKH_COLLECTOR_BOX_BOOKCLOTH_NORMAL_v01.png",
    sha256: "8b04ece8038f37ecf6fe1379615e2e0a6deac983e3ad55baf1167aef74eec373",
    method: "approved GLB texture promoted to a governed cross-architecture build fixture"
  });
  assert.equal(sha256(await readFile(path.join(here, source.derivedMaterials.bookclothNormal.path))), source.derivedMaterials.bookclothNormal.sha256);
  assert.equal(sha256(await readFile(path.join(here, source.identity.lid.path))), "284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f");
  assert.deepEqual(source.identity.lid.uvRecord.surfaceMm, {width: 202, height: 75.75, centreX: 4, centreY: 152});
  assert.deepEqual(source.identity.lid.uvRecord.uvBounds, [0, 0, 1, 1]);
  assert.equal(source.camera.poster, "assets/merch/collector-box-set-closed.webp");
  assert.deepEqual(source.camera.mobile, {
    default: {orbit: "30deg 68deg 133%", target: "auto 0.1575m auto", fieldOfView: "30deg"},
    front: {orbit: "0deg 68deg 132%", target: "auto 0.1575m auto", fieldOfView: "30deg"},
    rear: {orbit: "180deg 68deg 132%", target: "auto 0.1575m auto", fieldOfView: "30deg"}
  });
});

test("collector GLB is only a closed 250 x 315 x 55 mm clamshell with seam, lid art and red tab", async () => {
  const [source, bytes, report, browserQa] = await Promise.all([
    readJson(path.join(here, "collector-box-001.source.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/collector-box-001.report.json")),
    readJson(path.join(here, "reports/collector-box-001.browser-qa.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
  for (const name of ["Collector_Box_Closed_Envelope", "Collector_Box_Closed_Lid", "Collector_Box_Lid_Seam", "Collector_Box_Signal_Red_Tab", "Collector_Box_Lid_Identity"]) {
    assert.ok(nodes.get(name)?.getMesh(), `${name} mesh missing`);
  }
  assert.deepEqual(boundsFor(nodes.get("Collector_Box_Closed_Envelope").getMesh().listPrimitives()[0].getAttribute("POSITION")), [250, 315, 55]);
  assert.equal(nodes.get("Collector_Box_Closed_Envelope").getExtras().state, "closed-only");
  assert.equal(nodes.get("Collector_Box_Closed_Envelope").getExtras().dimensionAuthority, "provisional-viewer-envelope-not-machinable");
  assert.deepEqual(nodes.get("Collector_Box_Lid_Identity").getExtras().uvRecord, source.identity.lid.uvRecord);
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(doc.getRoot().listNodes().some((node) => /drawer|open|interior|content|hinge|cavity|tray/i.test(node.getName())), false);
  assert.equal(doc.getRoot().listTextures().length, 2, "only exact lid identity and a non-identity bookcloth normal may be embedded");
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().canonicalSourceSha256 === source.identity.lid.sha256).length, 1);
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().proceduralRecipe === "pvkh-bookcloth-normal-v1" && texture.getExtras().containsIdentity === false).length, 1);
  const metrics = metricsFor(doc);
  assert.ok(bytes.byteLength <= 2_100_000);
  assert.ok(metrics.triangles <= 40_000);
  assert.ok(metrics.drawCalls <= 10);
  assert.deepEqual(report.budget, {...metrics, bytes: bytes.byteLength, ceilings: source.budgets});
  assert.equal(report.output.sha256, sha256(bytes));
  assert.deepEqual(report.cameraRecommendations.desktop.default, {orbit: "30deg 65deg 115%", target: "auto 0.1575m auto", fieldOfView: "24deg"});
  assert.deepEqual(browserQa.checks, {sixRequiredViews: true, noBrowserErrors: true, readabilityCrop: true, sourceCompare: true, modelLoaded: true, mobileBreathingRoom: true, mobileTabVisible: true});
  assert.equal(browserQa.capturedAtPolicy, "timestamp-omitted; checked-in hashes prove snapshot integrity only, while cross-rerender acceptance uses semantic gates and human visual review");
  assert.deepEqual(browserQa.rerenderPolicy, {
    pixelHashes: "snapshot-integrity-only",
    automatedPixelTolerance: false,
    crossRerenderComparison: "semantic-gates-and-human-visual-review",
    semanticGatesRemainAuthoritative: true
  });
  assert.deepEqual(browserQa.views.filter((view) => /^(desktop|mobile)-(default|front|rear)$/.test(view.view)).map((view) => view.view).sort(), ["desktop-default","desktop-front","desktop-rear","mobile-default","mobile-front","mobile-rear"]);
  for (const view of browserQa.views.filter((entry) => /^mobile-(default|front|rear)$/.test(entry.view))) {
    assert.ok(view.visualMarginsPx.every((value) => value >= 12), `${view.view} clips the model: ${view.visualMarginsPx}`);
  }
  for (const view of browserQa.views.filter((entry) => /^mobile-(default|front)$/.test(entry.view))) {
    assert.ok(view.signalRedTabPixels >= 20, `${view.view} loses the Signal Red tab`);
  }
  for (const view of browserQa.views) assert.equal(sha256(await readFile(path.join(siteRoot, view.path))), view.sha256, `${view.view} screenshot drift`);
  assert.equal(sha256(await readFile(path.join(siteRoot, browserQa.visualComparison.artifactPath))), browserQa.visualComparison.artifactSha256);
});

test("collector validates without warnings and checked-in output is deterministic", async () => {
  const bytes = await readFile(glbPath);
  const validation = await validateBytes(new Uint8Array(bytes), {uri: "collector-box-001.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  assert.equal(validation.issues.numErrors, 0);
  assert.equal(validation.issues.numWarnings, 0);
  const {stdout} = await execFile(process.execPath, [path.join(here, "build-collector-box-001.mjs"), "--verify"], {cwd: siteRoot});
  assert.match(stdout, /verified [a-f0-9]{64}/);
  const fixtureCheck = await execFile(process.execPath, [path.join(here, "extract-governed-material-fixtures.mjs")], {cwd: siteRoot});
  assert.match(fixtureCheck.stdout, /PVKH_COLLECTOR_BOX_BOOKCLOTH_NORMAL_v01\.png/);
});
