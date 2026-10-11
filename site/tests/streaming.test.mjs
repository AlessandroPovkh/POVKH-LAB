import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { hasValidStreamingServiceOrder, isOfficialStreamingUrl } from "../src/streaming.mjs";

const verifiedLinks = [
  ["appleMusic", "https://music.apple.com/us/album/two-faces-mixtape/6804368976"],
  ["spotify", "https://open.spotify.com/album/3DVh5E77CD0OL8XcEzrzhT"],
  ["amazonMusic", "https://music.amazon.ca/albums/B0HG76FXVM"],
  ["yandexMusic", "https://music.yandex.ru/album/43660869"],
  ["vkMusic", "https://music.vk.com/link/sNz9i"],
  ["kionMusic", "https://music.mts.ru/album/43660869"]
];

test("verified album destinations and existing single links are supported", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"));
  for (const [service, url] of verifiedLinks) assert.equal(isOfficialStreamingUrl(service, url), true, url);
  for (const release of catalog.releases) {
    for (const { service, url } of release.streamingLinks || []) {
      assert.equal(isOfficialStreamingUrl(service, url), true, `${release.id}: ${url}`);
    }
  }
});

test("streaming chooser permits unique supported subsets in the fixed service order", () => {
  for (const services of [
    ["appleMusic"], ["spotify"], ["amazonMusic", "yandexMusic", "vkMusic", "kionMusic"],
    verifiedLinks.map(([service]) => service),
    ["appleMusic", "spotify", "youtubeMusic", "amazonMusic", "yandexMusic", "vkMusic", "kionMusic"]
  ]) assert.equal(hasValidStreamingServiceOrder(services), true, services.join(","));
  for (const services of [[], ["spotify", "appleMusic"], ["appleMusic", "appleMusic"],
    ["appleMusic", "unknown"], ["vkMusic", "yandexMusic"], ["constructor"], null, "appleMusic"]
  ) assert.equal(hasValidStreamingServiceOrder(services), false, JSON.stringify(services));
});

test("official link validation rejects lookalike hosts, credentials, ports and extra URL components", () => {
  for (const [service, value] of verifiedLinks) {
    const url = new URL(value);
    for (const invalid of [
      value.replace("https:", "http:"),
      value.replace(url.hostname, `${url.hostname}.example.com`),
      value.replace("https://", "https://user:password@"),
      value.replace(url.hostname, `${url.hostname}:444`),
      `${value}#fragment`, `${value}?redirect=https://example.com`,
      ` ${value}`, `${value}\n`, value.replace("https://", "https:\\\\")
    ]) assert.equal(isOfficialStreamingUrl(service, invalid), false, invalid);
  }
  for (const service of ["constructor", "toString", "__proto__", "unknown", null]) {
    assert.equal(isOfficialStreamingUrl(service, verifiedLinks[0][1]), false, String(service));
  }
});

test("official link validation keeps each platform's exact release URL grammar", () => {
  for (const [service, url] of [
    ["appleMusic", "https://music.apple.com/us/album/two-faces-mixtape/6804368976?i=6804368977"],
    ["spotify", "https://open.spotify.com/track/6a65PgYFVcLYcYZP47c6xc"],
    ["amazonMusic", "https://music.amazon.com/albums/B0HG76FXVM"],
    ["youtubeMusic", "https://music.youtube.com/watch?v=xs9Ms-0UPBo"]
  ]) assert.equal(isOfficialStreamingUrl(service, url), true, url);
  for (const [service, url] of [
    ["appleMusic", "https://music.apple.com/us/album/two-faces-mixtape/6804368976?i=6804368977&i=6804368978"],
    ["appleMusic", "https://music.apple.com/us/album/two-faces-mixtape/6804368976?i="],
    ["spotify", "https://open.spotify.com/album/short"],
    ["spotify", "https://open.spotify.com/artist/3DVh5E77CD0OL8XcEzrzhT"],
    ["amazonMusic", "https://music.amazon.ca/albums/B0HG76FXVM/extra"],
    ["amazonMusic", "https://music.amazon.example/albums/B0HG76FXVM"],
    ["yandexMusic", "https://music.yandex.ru/artist/43660869"],
    ["yandexMusic", "https://music.yandex.ru/album/not-a-number"],
    ["vkMusic", "https://music.vk.com/link/sNz9i/extra"],
    ["vkMusic", "https://vk.com/link/sNz9i"],
    ["kionMusic", "https://music.mts.ru/album/43660869?play=true"],
    ["kionMusic", "https://music.mts.ru/album/0"],
    ["youtubeMusic", "https://music.youtube.com/watch?v=xs9Ms-0UPBo&list=extra"]
  ]) assert.equal(isOfficialStreamingUrl(service, url), false, url);
});
