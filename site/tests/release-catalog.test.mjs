import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { hasValidStreamingServiceOrder, isOfficialStreamingUrl } from "../src/streaming.mjs";

const catalog = JSON.parse(await readFile(new URL("./fixtures/catalog-2026-10-11.json", import.meta.url), "utf8"));
const audio = JSON.parse(await readFile(new URL("../data/audio-library.json", import.meta.url), "utf8"));
const releaseById = new Map(catalog.releases.map((release) => [release.id, release]));

test("October catalog keeps the released Two Faces premiere when later announcements are added", () => {
  assert.equal(catalog.asOf, "2026-10-11");
  assert.equal(catalog.releases.length, 16);
  assert.equal(catalog.featuredReleaseId, "PVKH-014");
  const featured = releaseById.get(catalog.featuredReleaseId);
  assert.equal(featured.title, "Two Faces");
  assert.equal(featured.status, "published");
  assert.equal(featured.releaseDate, "2026-10-01");
  assert.equal(featured.primaryGenre, "Electronic");
  assert.equal(featured.tuneCoreId, null);
  assert.equal(featured.tuneCoreIdNeedsOwnerVerification, true);
  assert.equal(featured.releaseType, "mixtape");
  assert.equal(featured.trackCount, 11);
  assert.deepEqual(featured.tracks.map(({ title }) => title), [
    "Intro", "Of us", "Red 2", "Dec 12 16", "Motherland", "Water", "Redline Malice", "Office", "Azimuth", "Opportunist", "Bigger"
  ]);
  assert.deepEqual(featured.streamingLinks.map(({ service }) => service), ["appleMusic", "spotify", "amazonMusic", "yandexMusic", "vkMusic", "kionMusic"]);
  assert.equal(hasValidStreamingServiceOrder(featured.streamingLinks.map(({ service }) => service)), true);
  for (const { service, url } of featured.streamingLinks) assert.equal(isOfficialStreamingUrl(service, url), true);
});

test("announced singles preserve their supplied titles, dates and covers without inventing missing metadata", async () => {
  for (const [id, title, artistCredit, titleLanguage, date] of [
    ["PVKH-015", "Out the box", "Levo.mp3", "en", "2026-10-16"],
    ["PVKH-016", "пена", "SUBMRN", "ru", "2026-11-13"]
  ]) {
    const release = releaseById.get(id);
    assert.equal(release.title, title);
    assert.equal(release.artistCredit, artistCredit);
    assert.equal(release.titleLanguage, titleLanguage);
    assert.equal(release.releaseDate, date);
    assert.equal(release.status, "upcoming");
    assert.equal(release.releaseType, "single");
    assert.equal(release.trackCount, 1);
    assert.deepEqual(release.tracks, [{ position: 1, title, duration: null }]);
    for (const field of ["primaryGenre", "tuneCoreId", "streamingLinks", "preorderDate", "preorderUrl"]) {
      assert.equal(release[field], null, `${id}: ${field}`);
    }
    assert.equal(release.tuneCoreIdNeedsOwnerVerification, true);
    assert.equal(release.editorial.reviewRequired, true);
    for (const locale of ["en", "it", "ru"]) {
      assert.equal(release.content[locale].mood, null);
      assert.equal(release.content[locale].audience, null);
      assert.ok(release.content[locale].short.includes(title));
      assert.ok(release.content[locale].story.includes(title));
    }
    assert.match(release.artwork, /^assets\/releases\/[a-z0-9-]+\.webp$/);
    assert.ok((await readFile(new URL(`../${release.artwork}`, import.meta.url))).length > 0);
  }
});

test("adding announcements preserves the 24-track player and its Two Faces default", () => {
  assert.equal(audio.schemaVersion, 2);
  assert.equal(audio.defaultTrackId, "PVKH-014.01");
  assert.deepEqual(audio.tracks.map(({ id }) => id), [
    ...Array.from({ length: 13 }, (_, index) => `PVKH-${String(index + 1).padStart(3, "0")}`),
    ...Array.from({ length: 11 }, (_, index) => `PVKH-014.${String(index + 1).padStart(2, "0")}`)
  ]);
  assert.ok(audio.tracks.every(({ catalogId }) => !["PVKH-015", "PVKH-016"].includes(catalogId)));
});
