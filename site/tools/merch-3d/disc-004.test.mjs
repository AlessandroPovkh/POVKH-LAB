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
const glbPath = path.join(siteRoot, "assets/merch-3d/disc-004.glb");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const boundsForAccessor = (accessor) => {
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
  return {sizeMm: min.map((value, axis) => (max[axis] - value) * 1000)};
};

const metricsFor = (doc) => doc.getRoot().listMeshes().reduce((totals, mesh) => {
  for (const primitive of mesh.listPrimitives()) {
    totals.triangles += primitive.getIndices().getCount() / 3;
    totals.drawCalls += 1;
  }
  return totals;
}, {triangles: 0, drawCalls: 0});

test("disc sources pin the selected packet while retaining reverse compact as audit-only", async () => {
  const source = await readJson(path.join(here, "disc-004.source.json"));
  const expected = {
    placements: ["production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/placements.json", "e025849c17099c7b656c114c92590b8d2dc622942e51e80c44f1446e7b438cb1"],
    provenance: ["production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/provenance.json", "d566a881825a1db3187695450ae0b8d5cb8a933a1d6dcb95b190cafde1c8c72d"],
    selection: ["production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/candidate-selection.json", "4dc10ad7fb52f18c5c8e977bd56afae9bd43a1b49a1daed836987bea98c2d1d2"]
  };
  for (const [key, [canonicalPath, canonicalSha]] of Object.entries(expected)) {
    const authority = source.canonicalSource[key];
    assert.equal(authority.path, canonicalPath);
    assert.equal(authority.sha256, canonicalSha);
    const fixtureBytes = await readFile(path.join(here, authority.fixturePath));
    assert.equal(sha256(fixtureBytes), authority.fixtureSha256);
    const fixture = JSON.parse(fixtureBytes);
    assert.equal(fixture.authorityType, "governed-minimal-copy");
    assert.equal(fixture.canonicalPath, canonicalPath);
    assert.equal(fixture.canonicalSha256, canonicalSha);
  }
  assert.equal(sha256(await readFile(path.join(here, source.identity.ascii.path))), source.identity.ascii.sha256);
  assert.equal(source.identity.compactReverse.application, "audit-only-not-embedded");
  assert.equal(source.discTreatment, "clean-silver-no-printed-mark");
  assert.deepEqual(source.geometryPolicy, {
    carrierRadialSegments: 64,
    carrierGrooveCount: 9,
    indexComponent: "UNSIGNED_SHORT",
    indexBits: 16,
    decoderPolicy: "uncompressed-only"
  });
  assert.deepEqual(source.budgets, {maxBytes: 700_000, maxTriangles: 6_000, maxDrawCalls: 6});
});

test("disc GLB preserves exact jewel and disc dimensions with an unmarked silver carrier", async () => {
  const [source, merch, bytes, report, browserQa] = await Promise.all([
    readJson(path.join(here, "disc-004.source.json")),
    readJson(path.join(siteRoot, "data/merch.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/disc-004.report.json")),
    readJson(path.join(here, "reports/disc-004.browser-qa.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const node = (name) => {
    const found = doc.getRoot().listNodes().find((entry) => entry.getName() === name);
    assert.ok(found?.getMesh(), `${name} mesh missing`);
    return found;
  };
  const primitiveBounds = (name) => boundsForAccessor(node(name).getMesh().listPrimitives()[0].getAttribute("POSITION"));
  assert.deepEqual(primitiveBounds("Disc_Jewel_Case").sizeMm.map((value) => Number(value.toFixed(3))), [142, 125, 10.4]);
  assert.deepEqual(primitiveBounds("Disc_Carrier").sizeMm.map((value) => Number(value.toFixed(3))), [120, 120, 1.2]);
  const carrierPositions = node("Disc_Carrier").getMesh().listPrimitives()[0].getAttribute("POSITION").getArray();
  let minimumCarrierRadiusM = Infinity;
  for (let offset = 0; offset < carrierPositions.length; offset += 3) {
    minimumCarrierRadiusM = Math.min(minimumCarrierRadiusM, Math.hypot(carrierPositions[offset], carrierPositions[offset + 1] - 0.06));
  }
  assert.equal(Number((minimumCarrierRadiusM * 2_000).toFixed(3)), 15, "carrier geometry must preserve the 15 mm centre hole");
  assert.equal(Number(node("Disc_Carrier").getExtras().centreHoleDiameterMm), 15);
  assert.equal(node("Disc_Carrier").getExtras().printedMark, false);
  assert.equal(node("Disc_Carrier").getExtras().radialSegments, source.geometryPolicy.carrierRadialSegments);
  assert.equal(node("Disc_Carrier").getExtras().grooveCount, source.geometryPolicy.carrierGrooveCount);
  assert.match(node("Disc_Carrier").getMesh().listPrimitives()[0].getMaterial().getName(), /CLEAN_SILVER/);
  assert.equal(doc.getRoot().listTextures().length, 2, "only exact ASCII plus non-identity silver response may be embedded");
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().canonicalSourceSha256 === source.identity.ascii.sha256).length, 1);
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().proceduralRecipe === "pvkh-clean-silver-radial-v1" && texture.getExtras().containsIdentity === false).length, 1);
  assert.equal(doc.getRoot().listMaterials().some((material) => /logo|compact|identity.*disc/i.test(material.getName())), false);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) assert.ok(primitive.getIndices().getArray() instanceof Uint16Array, `${mesh.getName()} must use u16 indices`);
  }
  const metrics = metricsFor(doc);
  assert.deepEqual(metrics, {triangles: 2_842, drawCalls: 6});
  assert.ok(bytes.byteLength <= 700_000);
  assert.ok(metrics.triangles <= 6_000);
  assert.equal(metrics.drawCalls, 6);
  const merchObject = merch.objects.find((object) => object.id === source.productId);
  assert.deepEqual(merchObject.viewer.budget, {bytes: 700_000, triangles: 6_000, drawCalls: 6});
  assert.deepEqual(report.geometryPolicy, source.geometryPolicy);
  assert.deepEqual(report.budget, {...metrics, bytes: bytes.byteLength, ceilings: source.budgets});
  assert.equal(report.output.sha256, sha256(bytes));
  assert.equal(doc.getRoot().listExtensionsUsed().length, 0);
  assert.deepEqual(browserQa.checks, {sixRequiredViews: true, noBrowserErrors: true, readabilityCrop: true, modelLoaded: true});
  assert.deepEqual(browserQa.views.filter((view) => /^(desktop|mobile)-(default|front|rear)$/.test(view.view)).map((view) => view.view).sort(), ["desktop-default","desktop-front","desktop-rear","mobile-default","mobile-front","mobile-rear"]);
  for (const view of browserQa.views) assert.equal(sha256(await readFile(path.join(siteRoot, view.path))), view.sha256, `${view.view} screenshot drift`);
  assert.equal(sha256(await readFile(path.join(siteRoot, browserQa.visualComparison.artifactPath))), browserQa.visualComparison.artifactSha256);
  assert.equal(report.visualComparison.browserQa, "tools/merch-3d/reports/disc-004.browser-qa.json");
});

test("disc GLB validates without warnings and checked-in output is deterministic", async () => {
  const bytes = await readFile(glbPath);
  const validation = await validateBytes(new Uint8Array(bytes), {uri: "disc-004.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  assert.equal(validation.issues.numErrors, 0);
  assert.equal(validation.issues.numWarnings, 0);
  const {stdout} = await execFile(process.execPath, [path.join(here, "build-disc-004.mjs"), "--verify"], {cwd: siteRoot});
  assert.match(stdout, /verified [a-f0-9]{64}/);
});

test("disc optimization audit pins the accepted visual and emulated performance evidence", async () => {
  const [bytes, report, audit] = await Promise.all([
    readFile(glbPath),
    readJson(path.join(here, "reports/disc-004.report.json")),
    readJson(path.join(here, "reports/disc-004.optimization-audit.json"))
  ]);
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.assetKey, "disc-004");
  assert.equal(audit.decision, "accepted-64-radial-segments-9-grooves-u16");
  assert.equal(audit.selected.outputSha256, sha256(bytes));
  assert.equal(audit.selected.rawBytes, bytes.byteLength);
  assert.equal(audit.selected.triangles, report.budget.triangles);
  assert.equal(audit.selected.drawCalls, report.budget.drawCalls);
  assert.deepEqual(audit.selected.geometryPolicy, report.geometryPolicy);
  assert.deepEqual(audit.validation, {errors: 0, warnings: 0, extensionsUsed: [], extensionsRequired: []});
  assert.equal(audit.visualComparison.profiles.length, 6);
  assert.ok(audit.visualComparison.worstCase.minimumSsim >= 0.9989);
  assert.ok(audit.visualComparison.worstCase.maximumChangedPixelRatio4 <= 0.0014);
  assert.ok(audit.performanceExperiment.pairedDelta.medianClickToReadyMs < 0);
  assert.ok(audit.performanceExperiment.pairedDelta.firstPartyTransferredBytes < 0);
  assert.equal(audit.performanceExperiment.releaseTarget.coldClickToReadyMs, 2_500);
  assert.equal(audit.performanceExperiment.releaseTarget.metByPrototype, false);
  assert.equal(audit.performanceExperiment.physicalAndroidRequired, true);
});
