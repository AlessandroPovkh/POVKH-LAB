import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPages } from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const json = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const packageJson = await json("../package.json");
const registry = await json("../data/merch.json");
const copyAuthority = await json("../data/merch-copy-authority.json");
const catalog = await json("../data/catalog.json");
const audioLibrary = await json("../data/audio-library.json");
const artistLibrary = await json("../data/artists.json");
const readAsset = async (relative) => {
  const image = registry.objects.flatMap((object) => object.gallery).find(({ path: assetPath }) => assetPath === relative);
  return image ? { path: relative, width: image.width, height: image.height, sha256: "a".repeat(64) } : null;
};
const merchLibrary = await validateMerchLibrary(registry, copyAuthority, { readAsset });
const pages = createPages(catalog, audioLibrary, artistLibrary, merchLibrary);
const locales = ["en", "it", "ru"];
const outputFor = (locale, slug) => `${locale === "en" ? "" : `${locale}/`}merch/${slug}/index.html`;
const fragment = (html, pattern, label) => {
  const match = html.match(pattern);
  assert.ok(match, `${label} markup is missing`);
  return match[0];
};
const count = (html, pattern) => [...html.matchAll(pattern)].length;

test("pins and vendors one first-party model-viewer runtime with its Apache notice", async () => {
  assert.equal(packageJson.devDependencies?.["@google/model-viewer"], "4.3.1");
  const runtime = path.join(siteRoot, "assets", "vendor", "model-viewer.min.js");
  const notice = path.join(siteRoot, "assets", "vendor", "model-viewer.LICENSE.txt");
  await access(runtime);
  await access(notice);
  const source = await readFile(runtime, "utf8");
  const license = await readFile(notice, "utf8");
  assert.ok(source.length > 100_000, "vendored runtime is unexpectedly small");
  assert.match(license, /Apache License[\s\S]*Version 2\.0/i);
});

test("renders every localized product as an inert poster-first viewer shell", () => {
  for (const locale of locales) {
    for (const object of merchLibrary.objects) {
      const html = pages.get(outputFor(locale, object.slug)).toString();
      const viewer = fragment(
        html,
        /<section class="product-viewer"[\s\S]*?<\/section>/,
        `${locale}/${object.slug} product viewer`
      );
      assert.equal(count(viewer, /data-product-viewer(?:[ >])/g), 1);
      assert.equal(count(viewer, /data-product-viewer-poster(?:[ >])/g), 1);
      assert.equal(count(viewer, /data-product-viewer-activate(?:[ >])/g), 1);
      assert.equal(count(viewer, /data-product-viewer-status(?:[ >])/g), 1);
      assert.match(viewer, new RegExp(`src="[^"]*${object.viewer.poster.replaceAll("/", "\\/")}"`));
      assert.match(viewer, new RegExp(`data-viewer-src="[^"]*${object.viewer.src.replaceAll("/", "\\/")}"`));
      assert.match(viewer, /data-viewer-module="[^"]*assets\/product-viewer\.js"/);
      assert.match(viewer, /data-viewer-runtime="[^"]*assets\/vendor\/model-viewer\.min\.js"/);
      assert.doesNotMatch(viewer, /<model-viewer\b/i, `${locale}/${object.slug} must not instantiate WebGL before activation`);
      assert.doesNotMatch(viewer, /<script\b/i, `${locale}/${object.slug} viewer shell must stay inert at parse time`);
    }
  }
});

test("keeps the viewer launcher local, explicit, recoverable and route-disposable", async () => {
  const siteSource = await readFile(path.join(siteRoot, "assets", "site.js"), "utf8");
  const viewerSource = await readFile(path.join(siteRoot, "assets", "product-viewer.js"), "utf8");
  assert.match(siteSource, /initProductViewerLaunchers/);
  assert.match(siteSource, /data-product-viewer-activate/);
  assert.match(siteSource, /import\(moduleUrl\)/);
  assert.match(viewerSource, /customElements\.whenDefined\(["']model-viewer["']\)/);
  assert.match(viewerSource, /aria-live/);
  assert.match(viewerSource, /data-product-viewer-reset/);
  assert.match(viewerSource, /WebGL/i);
  assert.match(viewerSource, /saveData/);
  assert.match(viewerSource, /prefers-reduced-motion/);
  assert.doesNotMatch(viewerSource, /https?:\/\//i, "runtime must not call a cloud converter, CDN or remote decoder");
});

test("does not expose viewer runtime or model requests on the merch index", () => {
  for (const locale of locales) {
    const output = `${locale === "en" ? "" : `${locale}/`}merch/index.html`;
    const html = pages.get(output).toString();
    assert.doesNotMatch(html, /data-product-viewer/);
    assert.doesNotMatch(html, /assets\/merch-3d\//);
    assert.doesNotMatch(html, /model-viewer\.min\.js/);
  }
});
