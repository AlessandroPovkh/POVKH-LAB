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
const glbPath = path.join(siteRoot, "assets/merch-3d/vinyl-001.glb");
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
  return {min, max, sizeMm: min.map((value, axis) => (max[axis] - value) * 1000)};
};

const trianglesAndDraws = (doc) => doc.getRoot().listMeshes().reduce((totals, mesh) => {
  for (const primitive of mesh.listPrimitives()) {
    totals.triangles += primitive.getIndices().getCount() / 3;
    totals.drawCalls += 1;
  }
  return totals;
}, {triangles: 0, drawCalls: 0});

test("vinyl sources pin canonical masters and minimal authorities by exact SHA", async () => {
  const source = await readJson(path.join(here, "vinyl-001.source.json"));
  const expected = {
    masterAuthorities: ["production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/source/artwork/master-authorities-v05.json", "adf0d3d5d15cee2b8a2dc5ee3243a0c5c8c71526a5213c4fd9f4d38f3d6fc10a"],
    placements: ["production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/placements.json", "2585de2c157c5823308ae7514f6c15404aa3a938b0563c728d0199ab6d1ea7e4"],
    provenance: ["production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/provenance.json", "1f3f67e11b49d8fc3d9590a1431c3dd5f3d174463121d1caab4de4164b05d7d9"]
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
  assert.deepEqual(Object.fromEntries(Object.entries(source.identity).map(([key, value]) => [key, value.sha256])), {
    outerFront: "6a3a80aa9a45b273fe840395a03f4c46f2a6aed5b0b4d3b39139373399113b1b",
    outerReverse: "69746c784d303957e608a13747d83725a2a96c7872f7143cf76314302922eca6",
    centerLabel: "23b918489decf0a7b2ae1d0ac0b14fc9eea5b5e3e6bf2b6f1074f7a9ea115c18"
  });
  for (const identity of Object.values(source.identity)) {
    assert.equal(sha256(await readFile(path.join(here, identity.path))), identity.sha256);
  }
  assert.deepEqual(source.identity.outerFront.derivedRaster, {
    path: "sources/vinyl-001/PVKH_VINYL_OUTER_FRONT_MASTER_v05.approved-1024.png",
    sha256: "6cf6ee29f29820e6e24145fca29c8089c8836f4c4ac90cc1f0c72bf3fa842565",
    method: "approved GLB texture promoted to a governed cross-architecture build fixture"
  });
  assert.deepEqual(source.identity.outerReverse.derivedRaster, {
    path: "sources/vinyl-001/PVKH_VINYL_OUTER_REVERSE_MASTER_v05.approved-1024.png",
    sha256: "82f784270fb2f8cb3dd55f1cd8fa410381f43167484e0a2274097c149438c4fd",
    method: "approved GLB texture promoted to a governed cross-architecture build fixture"
  });
  assert.deepEqual(source.derivedMaterials.recordSmoke, {
    path: "sources/vinyl-001/PVKH_VINYL_SIGNAL_RED_SMOKE_TEXTURE_v01.png",
    sha256: "df710dc1f298215b9029d192167ae2e0fd8de40da7601b9941dbeaf8f5793c7d",
    method: "approved GLB texture promoted to a governed cross-architecture build fixture"
  });
  for (const reference of [source.identity.outerFront.derivedRaster, source.identity.outerReverse.derivedRaster, source.derivedMaterials.recordSmoke]) {
    assert.equal(sha256(await readFile(path.join(here, reference.path))), reference.sha256);
  }
  assert.doesNotMatch(await readFile(path.join(here, source.identity.centerLabel.path), "utf8"), /\bDEV\b/i);
});

test("vinyl GLB preserves exact physical envelopes, true hole and governed texture set", async () => {
  const [source, bytes, report, browserQa] = await Promise.all([
    readJson(path.join(here, "vinyl-001.source.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/vinyl-001.report.json")),
    readJson(path.join(here, "reports/vinyl-001.browser-qa.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const node = (name) => {
    const found = doc.getRoot().listNodes().find((entry) => entry.getName() === name);
    assert.ok(found?.getMesh(), `${name} mesh missing`);
    return found;
  };
  const primitiveBounds = (name) => boundsForAccessor(node(name).getMesh().listPrimitives()[0].getAttribute("POSITION"));
  assert.deepEqual(primitiveBounds("Vinyl_Outer_Sleeve").sizeMm.map((value) => Number(value.toFixed(3))), [315, 315, 4]);
  assert.deepEqual(primitiveBounds("Vinyl_Inner_Sleeve").sizeMm.map((value) => Number(value.toFixed(3))), [307, 307, 0.5]);
  assert.deepEqual(primitiveBounds("Vinyl_Record").sizeMm.map((value) => Number(value.toFixed(3))), [300, 300, 1.9]);
  assert.equal(Number(node("Vinyl_Record").getExtras().centreHoleDiameterMm), 7.2);
  assert.equal(node("Vinyl_Record").getExtras().displayState, "partially-exposed");
  assert.equal(doc.getRoot().listTextures().length, 4);
  assert.deepEqual(doc.getRoot().listTextures().map((texture) => texture.getExtras().canonicalSourceSha256).filter(Boolean).sort(), Object.values(source.identity).map((entry) => entry.sha256).sort());
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().proceduralRecipe === "pvkh-signal-red-smoke-v1").length, 1);
  const metrics = trianglesAndDraws(doc);
  assert.ok(bytes.byteLength <= 1_400_000);
  assert.ok(metrics.triangles <= 18_000);
  assert.ok(metrics.drawCalls <= 6);
  assert.deepEqual(report.budget, {...metrics, bytes: bytes.byteLength, ceilings: source.budgets});
  assert.equal(report.output.sha256, sha256(bytes));
  assert.equal(doc.getRoot().listExtensionsUsed().length, 0);
  assert.deepEqual(browserQa.checks, {sixRequiredViews: true, noBrowserErrors: true, readabilityCrop: true, modelLoaded: true});
  assert.deepEqual(browserQa.views.filter((view) => /^(desktop|mobile)-(default|front|rear)$/.test(view.view)).map((view) => view.view).sort(), ["desktop-default","desktop-front","desktop-rear","mobile-default","mobile-front","mobile-rear"]);
  for (const view of browserQa.views) assert.equal(sha256(await readFile(path.join(siteRoot, view.path))), view.sha256, `${view.view} screenshot drift`);
  assert.equal(sha256(await readFile(path.join(siteRoot, browserQa.visualComparison.artifactPath))), browserQa.visualComparison.artifactSha256);
  assert.equal(report.visualComparison.browserQa, "tools/merch-3d/reports/vinyl-001.browser-qa.json");
});

test("vinyl GLB validates without warnings and checked-in output is deterministic", async () => {
  const bytes = await readFile(glbPath);
  const validation = await validateBytes(new Uint8Array(bytes), {uri: "vinyl-001.glb", format: "glb", writeTimestamp: false, maxIssues: 100});
  assert.equal(validation.issues.numErrors, 0);
  assert.equal(validation.issues.numWarnings, 0);
  const {stdout} = await execFile(process.execPath, [path.join(here, "build-vinyl-001.mjs"), "--verify"], {cwd: siteRoot});
  assert.match(stdout, /verified [a-f0-9]{64}/);
  const fixtureCheck = await execFile(process.execPath, [path.join(here, "extract-governed-material-fixtures.mjs")], {cwd: siteRoot});
  assert.match(fixtureCheck.stdout, /PVKH_VINYL_SIGNAL_RED_SMOKE_TEXTURE_v01\.png/);
});
