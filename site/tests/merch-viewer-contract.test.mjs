import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const library = JSON.parse(await readFile(new URL("../data/merch.json", import.meta.url), "utf8"));
const locales = ["en", "it", "ru"];
const apparel = new Set(["t-shirt", "hoodie", "cap"]);
const flat = new Set(["poster", "sticker-pack", "zine-booklet"]);
const safeProjectPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?![a-z][a-z0-9+.-]*:)[A-Za-z0-9._/-]+$/i;

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
  const sources = new Set();
  for (const object of library.objects) {
    const viewer = requireViewer(object);
    assert.ok(["glb", "spin"].includes(viewer.kind), `${object.id}.viewer.kind must be glb or spin`);
    assert.equal(viewer.poster, object.gallery[0].path, `${object.id} must reuse its approved hero as the no-JS poster`);
    assert.match(viewer.poster || "", safeProjectPath, `${object.id}.viewer.poster must be base-safe`);
    assert.match(viewer.src || "", safeProjectPath, `${object.id}.viewer.src must be base-safe`);
    assert.ok(!sources.has(viewer.src), `${object.id}.viewer.src must be unique`);
    sources.add(viewer.src);

    if (viewer.kind === "glb") {
      assert.match(viewer.src, /^assets\/merch-3d\/[a-z0-9-]+\.glb$/);
      assert.match(viewer.cameraOrbit || "", /^-?\d+(?:\.\d+)?deg \d+(?:\.\d+)?deg \d+(?:\.\d+)?%$/, `${object.id} needs a deterministic camera orbit`);
    } else {
      assert.ok(apparel.has(object.slug), `${object.id} may use spin360 only for apparel`);
      assert.match(viewer.src, /^assets\/merch-360\/[a-z0-9-]+\/manifest\.json$/);
    }
  }
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
