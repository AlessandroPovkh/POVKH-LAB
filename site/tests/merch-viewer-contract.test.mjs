import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const library = JSON.parse(await readFile(new URL("../data/merch.json", import.meta.url), "utf8"));
const locales = ["en", "it", "ru"];
const apparel = new Set(["t-shirt", "hoodie", "cap"]);
const flat = new Set(["poster", "sticker-pack", "zine-booklet"]);
const safeProjectPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?![a-z][a-z0-9+.-]*:)[A-Za-z0-9._/-]+$/i;
const orbit = /^-?\d+(?:\.\d+)?deg \d+(?:\.\d+)?deg \d+(?:\.\d+)?%$/;
const fieldOfView = /^(?:auto|\d+(?:\.\d+)?deg)$/;
const cameraTarget = /^(?:auto|-?\d+(?:\.\d+)?m) (?:auto|-?\d+(?:\.\d+)?m) (?:auto|-?\d+(?:\.\d+)?m)$/;
const apparelConceptModels = new Map([
  ["t-shirt", "assets/merch-3d/t-shirt-001.glb"],
  ["hoodie", "assets/merch-3d/hoodie-001.glb"],
  ["cap", "assets/merch-3d/cap-001.glb"]
]);
const conceptDisclosure = {
  en: [/3D concept visualization/i, /not a manufacturing reference/i],
  it: [/visualizzazione 3D concept/i, /non è un riferimento per la produzione/i],
  ru: [/3D-визуализаци/i, /не является производственным эталоном/i]
};

const limitsFor = (slug) => {
  if (apparel.has(slug)) return { bytes: 4_000_000, triangles: 80_000, drawCalls: 20 };
  if (flat.has(slug)) return { bytes: 800_000, triangles: 5_000, drawCalls: 4 };
  return { bytes: 2_500_000, triangles: 50_000, drawCalls: 12 };
};

const requireViewer = (object) => {
  assert.ok(object.viewer, `${object.id} / ${object.slug} must declare a poster-first viewer contract`);
  return object.viewer;
};

test("declares one poster-first interactive viewer for every DROP 001 object", () => {
  assert.equal(library.objects.length, 11);
  assert.equal(library.objects.filter(({ viewer }) => viewer.kind === "glb").length, 11, "DROP 001 must expose 11 GLB viewers");
  assert.deepEqual(library.objects.filter(({ viewer }) => viewer.availability === "sourceBlocked"), [], "DROP 001 must expose zero blocked viewers");
  const sources = new Set();
  for (const object of library.objects) {
    const viewer = requireViewer(object);
    assert.equal(viewer.kind, "glb", `${object.id}.viewer.kind must be glb`);
    assert.equal(viewer.poster, object.gallery[0].path, `${object.id} must reuse its approved hero as the no-JS poster`);
    assert.match(viewer.poster || "", safeProjectPath, `${object.id}.viewer.poster must be base-safe`);
    assert.match(viewer.src || "", safeProjectPath, `${object.id}.viewer.src must be base-safe`);
    assert.ok(!sources.has(viewer.src), `${object.id}.viewer.src must be unique`);
    sources.add(viewer.src);

    assert.equal(viewer.availability, undefined, `${object.id} must not retain a source block`);

    if (viewer.kind === "glb") {
      assert.match(viewer.src, /^assets\/merch-3d\/[a-z0-9-]+\.glb$/);
      assert.deepEqual(Object.keys(viewer.cameraOrbit || {}).sort(), ["desktop", "mobile"]);
      assert.deepEqual(Object.keys(viewer.fieldOfView || {}).sort(), ["desktop", "mobile"]);
      assert.deepEqual(Object.keys(viewer.cameraTarget || {}).sort(), ["desktop", "mobile"]);
      for (const profile of ["desktop", "mobile"]) {
        assert.match(viewer.cameraOrbit[profile] || "", orbit, `${object.id} needs a deterministic ${profile} camera orbit`);
        assert.match(viewer.fieldOfView[profile] || "", fieldOfView, `${object.id} needs a deterministic ${profile} field of view`);
        assert.match(viewer.cameraTarget[profile] || "", cameraTarget, `${object.id} needs a deterministic ${profile} camera target`);
      }
      assert.equal(viewer.decoderPolicy, "uncompressed-only", `${object.id} must prohibit remote-decoder GLB extensions`);
    }
  }
});

test("binds the cassette viewer camera metadata to its governed desktop and mobile profiles", () => {
  const cassette = library.objects.find(({ slug }) => slug === "cassette");
  assert.deepEqual(cassette.viewer.cameraOrbit, {
    desktop: "18deg 70deg 103%",
    mobile: "14deg 72deg 105%"
  });
  assert.deepEqual(cassette.viewer.fieldOfView, { desktop: "22deg", mobile: "19deg" });
  assert.deepEqual(cassette.viewer.cameraTarget, {
    desktop: "auto auto auto",
    mobile: "auto 0.078m auto"
  });
});

test("provides concise EN / IT / RU alternative text for every viewer", () => {
  for (const object of library.objects) {
    const viewer = requireViewer(object);
    assert.deepEqual(Object.keys(viewer.alt || {}).sort(), [...locales].sort(), `${object.id}.viewer.alt must provide EN / IT / RU`);
    for (const locale of locales) {
      assert.equal(typeof viewer.alt[locale], "string");
      assert.ok(viewer.alt[locale].trim().length >= 12, `${object.id}.viewer.alt.${locale} is too short`);
      assert.ok(viewer.alt[locale].length <= 180, `${object.id}.viewer.alt.${locale} is too long`);
    }
  }
});

test("keeps declared viewer budgets inside the approved product-class ceilings", () => {
  for (const object of library.objects) {
    const viewer = requireViewer(object);
    const limits = limitsFor(object.slug);
    if (viewer.kind === "spin") {
      assert.deepEqual(Object.keys(viewer.budget || {}).sort(), ["desktopBytes", "desktopFrames", "mobileBytes", "mobileFrames"]);
      assert.ok(Number.isInteger(viewer.budget.mobileBytes) && viewer.budget.mobileBytes > 0 && viewer.budget.mobileBytes <= 2_500_000, `${object.id} spin exceeds the 2.5 MB mobile ceiling`);
      assert.ok(Number.isInteger(viewer.budget.desktopBytes) && viewer.budget.desktopBytes > 0 && viewer.budget.desktopBytes <= 4_000_000, `${object.id} spin exceeds the 4 MB desktop ceiling`);
      assert.equal(viewer.budget.mobileFrames, 24, `${object.id} mobile spin must contain 24 frames`);
      assert.equal(viewer.budget.desktopFrames, 36, `${object.id} desktop spin must contain 36 frames`);
    } else {
      assert.deepEqual(Object.keys(viewer.budget || {}).sort(), ["bytes", "drawCalls", "triangles"]);
      assert.ok(Number.isInteger(viewer.budget.bytes) && viewer.budget.bytes > 0, `${object.id}.viewer.budget.bytes must be a positive integer`);
      assert.ok(Number.isInteger(viewer.budget.triangles) && viewer.budget.triangles >= 0, `${object.id}.viewer.budget.triangles must be a non-negative integer`);
      assert.ok(Number.isInteger(viewer.budget.drawCalls) && viewer.budget.drawCalls >= 0, `${object.id}.viewer.budget.drawCalls must be a non-negative integer`);
      assert.ok(viewer.budget.bytes <= limits.bytes, `${object.id} exceeds its ${limits.bytes}-byte delivery ceiling`);
      assert.ok(viewer.budget.triangles <= limits.triangles, `${object.id} exceeds its ${limits.triangles}-triangle ceiling`);
      assert.ok(viewer.budget.drawCalls <= limits.drawCalls, `${object.id} exceeds its ${limits.drawCalls}-draw-call ceiling`);
    }
  }
});

test("discloses all three apparel GLBs as concept visualizations rather than manufacturing references", () => {
  assert.equal(apparelConceptModels.size, 3);
  for (const [slug, src] of apparelConceptModels) {
    const object = library.objects.find((entry) => entry.slug === slug);
    assert.equal(object.viewer.kind, "glb");
    assert.equal(object.viewer.src, src);
    assert.equal(object.viewer.availability, undefined);
    for (const locale of locales) {
      for (const pattern of conceptDisclosure[locale]) assert.match(object.viewer.alt[locale], pattern, `${slug} ${locale} concept disclosure`);
    }
  }
});
