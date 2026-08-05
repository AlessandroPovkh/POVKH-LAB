import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPages } from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";

const json = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const catalog = await json("../data/catalog.json");
const audioLibrary = await json("../data/audio-library.json");
const artistLibrary = await json("../data/artists.json");
const registry = await json("../data/merch.json");
const copyAuthority = await json("../data/merch-copy-authority.json");
const readAsset = async (relative) => {
  const image = registry.objects.flatMap((object) => object.gallery).find(({ path }) => path === relative);
  return image ? { path: relative, width: image.width, height: image.height, sha256: "a".repeat(64) } : null;
};
const merchLibrary = await validateMerchLibrary(registry, copyAuthority, { readAsset });
const pages = createPages(catalog, audioLibrary, artistLibrary, merchLibrary);

const localePath = (locale, route) => `${locale === "en" ? "" : `${locale}/`}${route}/index.html`;
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const structuredData = (html) => {
  const match = html.match(/<script type="application\/ld\+json" data-route-head>(.*?)<\/script>/s);
  assert.ok(match, "page needs JSON-LD");
  return JSON.parse(match[1]);
};

test("renders 33 localized concept detail routes and linked overview cards", () => {
  assert.equal(pages.size, 153);
  assert.ok(pages.has("merch/vinyl/index.html"));
  assert.ok(pages.has("it/merch/vinyl/index.html"));
  assert.ok(pages.has("ru/merch/collector-box-set/index.html"));

  for (const locale of ["en", "it", "ru"]) {
    const overview = pages.get(localePath(locale, "merch")).toString();
    assert.equal(count(overview, /data-merch-detail(?:[ >])/g), 11);
    for (const object of merchLibrary.objects) {
      const html = pages.get(localePath(locale, `merch/${object.slug}`));
      assert.ok(html, `${locale}/${object.slug} route missing`);
      assert.equal(count(html, /<h1(?:\s|>)/g), 1);
      assert.match(html, new RegExp(`data-merch-detail-id="${object.id}"`));
      assert.match(html, /data-merch-stage="concept"/);
      assert.match(html, /data-merch-breadcrumb/);
      assert.equal(count(html, /data-merch-gallery-item(?:[ >])/g), object.gallery.length);
      assert.match(html, new RegExp(`>${object.content[locale].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
      assert.match(html, new RegExp(object.content[locale].metaDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      for (const [index, image] of object.gallery.entries()) {
        assert.ok(html.includes(image.path), `${locale}/${object.slug}/${image.role} asset missing`);
        assert.ok(html.includes(`width="${image.width}" height="${image.height}"`));
        assert.ok(html.includes(image.alt[locale]));
        assert.ok(html.includes(image.caption[locale]));
        if (index === 0) assert.match(html, new RegExp(`${image.path}[^>]+loading="eager"[^>]+fetchpriority="high"`));
      }
      assert.ok(html.includes(merchLibrary.copy[locale].backToDrop));
      assert.ok(html.includes(merchLibrary.copy[locale].accessTerminal));
      assert.ok(html.includes("/links/"));
      const graph = structuredData(html)["@graph"];
      const concepts = graph.filter((node) => node["@type"] === "CreativeWork");
      assert.equal(concepts.length, 1);
      assert.equal(concepts[0].image.length, object.gallery.length);
      assert.ok(!html.includes('"@type":"Product"'));
      assert.ok(!html.includes('"@type":"Offer"'));
      assert.ok(!html.includes('"offers"'));
    }
  }
});
