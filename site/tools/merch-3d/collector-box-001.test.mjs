import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
const glbPath = path.join(siteRoot, "assets/merch-3d/collector-box-001.glb");
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const metricsFor = (doc) => {
  const metrics = {triangles: 0, drawCalls: 0, uniqueMeshPrimitives: 0};
  for (const mesh of doc.getRoot().listMeshes()) metrics.uniqueMeshPrimitives += mesh.listPrimitives().length;
  for (const node of doc.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      metrics.triangles += primitive.getIndices().getCount() / 3;
      metrics.drawCalls += 1;
    }
  }
  return metrics;
};

const boundsMmFor = (scene) => {
  const bounds = getBounds(scene);
  return {
    min: bounds.min.map((value) => Number((value * 1000).toFixed(3))),
    max: bounds.max.map((value) => Number((value * 1000).toFixed(3))),
    size: bounds.min.map((value, axis) => Number(((bounds.max[axis] - value) * 1000).toFixed(3)))
  };
};

test("collector sources govern a default-open ARCHIVE CLAMSHELL concept without manufacturing claims", async () => {
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
  assert.equal(source.state, "DEFAULT OPEN ARCHIVE SET");
  assert.deepEqual(source.openAssembly, {
    defaultOpen: true,
    lidAngleDeg: 105,
    hingeAuthority: "provisional-visual-concept",
    contentsAuthority: "composition-only-not-manufacturing-internals",
    namedContents: ["zine", "cassette", "cd", "data-key", "vinyl-archive-sleeve", "sticker-identity"]
  });
  assert.deepEqual(source.dimensions.provisionalClosedEnvelopeMm, [250, 315, 55]);
  assert.equal(source.dimensions.authority, "provisional-closed-envelope-not-open-scene-not-machinable");
  assert.equal(source.dimensions.actualOpenScenePolicy, "measured-from-reopened-glb-not-production-dimensions");
  assert.equal(source.canonicalSource.compositionOnly.application, "concept-composition-reference-only-not-machinable");
  assert.deepEqual(source.derivedMaterials.bookclothNormal, {
    path: "sources/collector-box-001/PVKH_COLLECTOR_BOX_BOOKCLOTH_NORMAL_v01.png",
    sha256: "8b04ece8038f37ecf6fe1379615e2e0a6deac983e3ad55baf1167aef74eec373",
    method: "approved GLB texture promoted to a governed cross-architecture build fixture"
  });
  assert.equal(sha256(await readFile(path.join(here, source.derivedMaterials.bookclothNormal.path))), source.derivedMaterials.bookclothNormal.sha256);
  assert.equal(source.identity.artwork.authority, "canonical-governed-exact-raster");
  assert.equal(sha256(await readFile(path.join(here, source.identity.artwork.path))), "284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f");
  assert.deepEqual(source.identity.artwork.sourcePx, [1600, 600]);
  assert.deepEqual(source.identity.artwork.uvBounds, [0, 0, 1, 1]);
  assert.deepEqual(Object.fromEntries(Object.entries(source.identityPlacements).map(([key, placement]) => [key, placement.surfaceMm])), {
    lidPanel: [120, 45],
    zineCover: [78, 29.25],
    stickerInsert: [75, 28.125]
  });
  for (const placement of Object.values(source.identityPlacements)) {
    assert.equal(placement.canonicalArtworkSha256, source.identity.artwork.sha256);
    assert.equal(placement.placementAuthority, "concept-derived-viewer-placement-not-production-registration");
    assert.equal(placement.sourceUse, "full-image-no-crop-no-redraw");
  }
  assert.deepEqual(source.visualReference, {
    path: "assets/merch/collector-box-set-open.webp",
    sha256: "4c890def8723dea116c0b12fbe092f5f52aa3560916396d651171d79882ebf82",
    authoritySource: "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/renders/selected/PVKH_DROP001_COLLECTOR_BOX_001_OPEN_FINAL_CONTENTS_CONCEPT_v04.png",
    authoritySourceSha256: "39fb9506f9274ba1aaceb0848b24de33fbb18898d2732440097e4d2f83862294"
  });
  assert.equal(source.camera.poster, "assets/merch/collector-box-set-closed.webp", "governed gallery-order contract keeps the inert closed hero poster");
  assert.deepEqual(source.camera.mobile, {
    default: {orbit: "25deg 58deg 145%", target: "auto 0.075m auto", fieldOfView: "34deg"},
    front: {orbit: "0deg 56deg 145%", target: "auto 0.075m auto", fieldOfView: "34deg"},
    rear: {orbit: "180deg 58deg 148%", target: "auto 0.075m auto", fieldOfView: "34deg"}
  });
  assert.deepEqual(source.uncertainty, {
    openStateModeled: true,
    interiorModeled: true,
    contentsModeled: true,
    workingHingeModeled: false,
    drawerModeled: false,
    vendorDielineConfirmed: false,
    physicalProofConfirmed: false,
    machinabilityClaim: false
  });
});

test("collector GLB defaults open with a lined lid, modular tray and separately named archive contents", async () => {
  const [source, bytes, report, browserQa] = await Promise.all([
    readJson(path.join(here, "collector-box-001.source.json")),
    readFile(glbPath),
    readJson(path.join(here, "reports/collector-box-001.report.json")),
    readJson(path.join(here, "reports/collector-box-001.browser-qa.json"))
  ]);
  const doc = await new NodeIO().readBinary(bytes);
  const actualOpenSceneBoundsMm = boundsMmFor(doc.getRoot().getDefaultScene());
  const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
  const required = [
    "Collector_Box_Open_Base",
    "Collector_Box_Open_Lid",
    "Collector_Box_Lid_Interior",
    "Collector_Box_Modular_Tray",
    "Collector_Box_Zine_Recess",
    "Collector_Box_Cassette_Recess",
    "Collector_Box_CD_Recess",
    "Collector_Box_Data_Key_Recess",
    "Collector_Box_Vinyl_Recess",
    "Collector_Box_Upper_Zine",
    "Collector_Box_Zine_Identity_Exact",
    "Collector_Box_Cassette",
    "Collector_Box_CD",
    "Collector_Box_CD_Disc",
    "Collector_Box_Data_Key",
    "Collector_Box_Data_Key_Connector",
    "Collector_Box_Vinyl_Archive_Sleeve",
    "Collector_Box_Vinyl_Archive_Signal",
    "Collector_Box_Sticker_Identity_Insert",
    "Collector_Box_Signal_Red_Pull_Tab",
    "Collector_Box_Lid_Identity_Backplate",
    "Collector_Box_Lid_Identity"
  ];
  for (const name of required) {
    assert.ok(nodes.has(name), `${name} semantic component missing`);
    assert.match(nodes.get(name).getExtras().visualBatch, /^Collector_Box_Visual_Batch_/, `${name} must identify its visible material batch`);
  }
  const visualBatches = ["Board", "Bone", "Tray", "Zine", "Cassette", "Disc", "Data_Key", "Signal", "Identity"].map((name) => `Collector_Box_Visual_Batch_${name}`);
  for (const name of visualBatches) assert.ok(nodes.get(name)?.getMesh(), `${name} visible batch missing`);
  assert.deepEqual(nodes.get("Collector_Box_Open_Base").getExtras().placement.sizeMm, [250, 36, 190]);
  assert.equal(nodes.get("Collector_Box_Open_Base").getExtras().state, "default-open-archive-set");
  assert.equal(nodes.get("Collector_Box_Open_Base").getExtras().dimensionAuthority, source.dimensions.authority);
  assert.equal(nodes.get("Collector_Box_Lid_Pivot_Provisional").getExtras().openAngleDeg, 105);
  assert.equal(nodes.get("Collector_Box_Lid_Pivot_Provisional").getExtras().workingHinge, false);
  assert.deepEqual(nodes.get("Collector_Box_Lid_Identity").getExtras().placementRecord, source.identityPlacements.lidPanel);
  assert.deepEqual(nodes.get("Collector_Box_Zine_Identity_Exact").getExtras().placementRecord, source.identityPlacements.zineCover);
  assert.deepEqual(nodes.get("Collector_Box_Sticker_Identity_Insert").getExtras().placementRecord, source.identityPlacements.stickerInsert);
  for (const name of required.filter((name) => /Zine|Cassette|_CD|Data_Key|Vinyl|Sticker/.test(name))) {
    assert.equal(nodes.get(name).getExtras().conceptOnly, true, `${name} must disclose concept-only geometry`);
  }
  assert.equal(doc.getRoot().listAnimations().length, 0);
  assert.equal(doc.getRoot().listNodes().some((node) => /closed|drawer|working_hinge/i.test(node.getName())), false);
  assert.equal(doc.getRoot().listTextures().length, 2, "only exact lid identity and a non-identity bookcloth normal may be embedded");
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().canonicalSourceSha256 === source.identity.artwork.sha256).length, 1);
  assert.equal(doc.getRoot().listTextures().filter((texture) => texture.getExtras().proceduralRecipe === "pvkh-bookcloth-normal-v1" && texture.getExtras().containsIdentity === false).length, 1);
  const metrics = metricsFor(doc);
  assert.ok(bytes.byteLength <= 2_100_000);
  assert.ok(metrics.triangles <= 40_000);
  assert.ok(metrics.drawCalls <= source.budgets.hardMaxDrawCalls);
  assert.equal(metrics.drawCalls, visualBatches.length, "each material batch must render once");
  assert.equal(metrics.uniqueMeshPrimitives, metrics.drawCalls, "runtime draws must not hide node-instanced primitives");
  assert.deepEqual(report.budget, {...metrics, bytes: bytes.byteLength, ceilings: source.budgets});
  assert.equal(report.output.sha256, sha256(bytes));
  assert.equal(report.physicalEvidence.state, "default-open-archive-set");
  assert.deepEqual(report.physicalEvidence.actualOpenSceneBoundsMm, actualOpenSceneBoundsMm);
  assert.deepEqual(report.physicalEvidence.provisionalClosedEnvelopeMm, source.dimensions.provisionalClosedEnvelopeMm);
  assert.equal(report.physicalEvidence.boundsRelationship, "measured open scene differs from provisional closed envelope; neither is machinable");
  assert.deepEqual(report.physicalEvidence.modeled, ["open base and lid", "bone lid lining", "modular tray and recesses", ...source.openAssembly.namedContents]);
  assert.deepEqual(report.physicalEvidence.excluded, ["working hinge", "vendor dieline", "manufacturing internals", "machinability claim"]);
  assert.deepEqual(report.cameraRecommendations.desktop.default, {orbit: "25deg 56deg 135%", target: "auto 0.075m auto", fieldOfView: "29deg"});
  assert.deepEqual(browserQa.checks, {sixRequiredViews: true, noBrowserErrors: true, readabilityCrop: true, sourceCompare: true, modelLoaded: true, mobileBreathingRoom: true, mobileInteriorVisible: true, mobileArchiveVisible: true, mobileIdentityContrast: true});
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
    assert.ok(view.boneInteriorPixels >= 100, `${view.view} loses the bone lid interior`);
    assert.ok(view.signalRedRegions >= 2, `${view.view} must separate the red archive sleeve from the pull tab`);
    assert.ok(view.identityContrastPixels >= 100, `${view.view} loses exact identity contrast`);
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

test("collector catalog viewer preserves the governed poster while activating the open camera", async () => {
  const [source, merch] = await Promise.all([
    readJson(path.join(here, "collector-box-001.source.json")),
    readJson(path.join(siteRoot, "data/merch.json"))
  ]);
  const collector = merch.objects.find(({slug}) => slug === "collector-box-set");
  assert.equal(collector.viewer.poster, "assets/merch/collector-box-set-closed.webp");
  assert.deepEqual(collector.viewer.cameraOrbit, {desktop: source.camera.desktop.default.orbit, mobile: source.camera.mobile.default.orbit});
  assert.deepEqual(collector.viewer.fieldOfView, {desktop: source.camera.desktop.default.fieldOfView, mobile: source.camera.mobile.default.fieldOfView});
  assert.deepEqual(collector.viewer.cameraTarget, {desktop: source.camera.desktop.default.target, mobile: source.camera.mobile.default.target});
  for (const alt of Object.values(collector.viewer.alt)) assert.match(alt, /open|aperto|открытого/i);
});
