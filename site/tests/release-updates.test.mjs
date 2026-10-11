import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPages } from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";
import { COPY } from "../src/i18n.mjs";

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalog = await json("./fixtures/catalog-2026-10-11.json");
const audio = await json("../data/audio-library.json");
const artists = await json("../data/artists.json");
const registry = await json("../data/merch.json");
const authority = await json("../data/merch-copy-authority.json");
const merch = await validateMerchLibrary(registry, authority, { readAsset: async (path) => {
  const item = registry.objects.flatMap((object) => object.gallery).find((image) => image.path === path);
  return item ? { path, width: item.width, height: item.height, sha256: "a".repeat(64) } : null;
} });
const pages = createPages(catalog, audio, artists, merch);
const page = (locale, route = "") => pages.get(`${locale === "en" ? "" : `${locale}/`}${route ? `${route}/` : ""}index.html`).toString();

test("new announcements keep the released Two Faces featured in every language", () => {
  for (const locale of ["en", "it", "ru"]) {
    const html = page(locale);
    const featured = html.match(/<section[^>]+data-featured-release="PVKH-014"[\s\S]*?<\/section>/)?.[0];
    assert.ok(featured, `${locale} featured Two Faces`);
    assert.match(featured, /data-release-status="published"/);
    assert.ok(featured.includes(COPY[locale].pages.home.featuredTitle));
    const upcoming = html.match(/<section[^>]+data-upcoming-releases[\s\S]*?<\/section>/)?.[0];
    assert.ok(upcoming, `${locale} upcoming section`);
    assert.match(upcoming, /Out the box/);
    assert.match(upcoming, /пена/);
    assert.match(upcoming, /datetime="2026-10-16"/);
    assert.match(upcoming, /datetime="2026-11-13"/);
    assert.doesNotMatch(upcoming, /Two Faces/);
  }
});

test("Two Faces exposes all six named services while upcoming tracks have no fabricated listening links", () => {
  const release = catalog.releases.find(({ id }) => id === "PVKH-014");
  assert.equal(release.streamingLinks.length, 6);
  for (const locale of ["en", "it", "ru"]) {
    const chooser = page(locale, "listen/pvkh-014");
    for (const { service, url } of release.streamingLinks) {
      assert.ok(chooser.includes(`href="${url}"`), `${locale}: ${service}`);
      assert.ok(chooser.includes(COPY[locale].pages.release.services[service]));
    }
    for (const slug of ["pvkh-015", "pvkh-016"]) {
      const html = page(locale, `catalog/${slug}`);
      assert.match(html, /data-release-status="upcoming"/);
      assert.doesNotMatch(html, /data-release-cta="streaming"/);
      assert.match(html, new RegExp(`assets/releases/${slug}-`));
    }
  }
});

test("existing complete album playback and Intro default survive metadata updates", () => {
  const html = page("ru");
  assert.equal(audio.tracks.length, 24);
  assert.equal(audio.defaultTrackId, "PVKH-014.01");
  assert.equal(audio.tracks.filter(({ catalogId }) => catalogId === "PVKH-014").length, 11);
  assert.match(html, /data-player-default="true"[^>]+data-track-id="PVKH-014\.01"/);
});
test('catalog growth and changing the premiere update all public language copies',()=>{
 const expanded=structuredClone(catalog);expanded.releases.push({...structuredClone(catalog.releases[15]),id:'PVKH-017',slug:'pvkh-017',title:'Additional single'});expanded.featuredReleaseId='PVKH-001';
 const result=createPages(expanded,audio,artists,merch);
 for(const [locale,expected,stale]of [['en','17 positions','Sixteen positions'],['it','17 posizioni','Sedici posizioni'],['ru','Позиций в каталоге: 17','Шестнадцать позиций']]){
  const prefix=locale==='en'?'':`${locale}/`;const html=result.get(`${prefix}catalog/index.html`).toString();assert(html.includes(expected),locale);assert(!html.includes(stale),locale);
  const home=result.get(`${prefix}index.html`).toString();const featured=home.match(/<section[^>]+data-featured-release="PVKH-001"[\s\S]*?<\/section>/)?.[0];assert(featured);assert(featured.includes('Overdose'));assert(!featured.includes('Two Faces'));
 }
});
