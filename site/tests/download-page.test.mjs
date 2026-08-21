import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CONTACT_EMAIL } from "../src/config.mjs";
import * as pageModule from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";

const { createPages } = pageModule;

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
const count = (value, pattern) => [...value.matchAll(pattern)].length;

const archives = [
  {
    filename: "Euclidean_Echo_0.1.1_macOS_Universal_TestCandidate.zip",
    bytes: 26885575,
    sha256: "e7cfb3a7eebf784456a72ccc757454c5abe4a97567ba0df4d6b2509ecd39a8ba"
  }
];

const localeCases = [
  {
    locale: "en",
    output: "download/index.html",
    assetPrefix: "../",
    status: "PUBLIC PREVIEW / NOT CERTIFIED",
    warningClaims: ["real-DAW", "external plugin-host", "ad-hoc signed", "not Apple Developer ID signed", "not Apple notarized"],
    unsupportedClaim: /\b(?:stable release|certified release|Apple-notarized build)\b/i,
    subject: "Euclidean Echo Preview Feedback"
  },
  {
    locale: "it",
    output: "it/download/index.html",
    assetPrefix: "../../",
    status: "ANTEPRIMA PUBBLICA / NON CERTIFICATO",
    warningClaims: ["DAW reali", "host plugin esterni", "firma ad hoc", "non è firmato con Apple Developer ID", "non è notarizzato da Apple"],
    unsupportedClaim: /\b(?:release stabile|release certificata|build notarizzata da Apple)\b/i,
    subject: "Feedback anteprima Euclidean Echo"
  },
  {
    locale: "ru",
    output: "ru/download/index.html",
    assetPrefix: "../../",
    status: "ПУБЛИЧНОЕ ПРЕВЬЮ / НЕ СЕРТИФИЦИРОВАНО",
    warningClaims: ["реальных DAW", "сторонних хостах плагинов", "подписаны ad hoc", "не подписан Apple Developer ID", "не прошёл нотарификацию Apple"],
    unsupportedClaim: /(?:стабильный релиз|сертифицированный релиз|нотарифицированная Apple сборка)/i,
    subject: "Обратная связь по превью Euclidean Echo"
  }
];

test("publishes one localized Euclidean Echo preview with one universal archive and two locked modules", () => {
  for (const localeCase of localeCases) {
    const html = pages.get(localeCase.output).toString();
    assert.equal(count(html, /data-plugin-product="euclidean-echo"/g), 1, `${localeCase.locale} needs one Euclidean Echo product`);
    assert.equal(count(html, /data-plugin-locked(?:[ >])/g), 2, `${localeCase.locale} must preserve two locked modules`);
    assert.ok(html.includes("Euclidean Echo"), `${localeCase.locale} product name is missing`);
    assert.ok(html.includes("0.1.1"), `${localeCase.locale} product version is missing`);
    assert.ok(html.includes(localeCase.status), `${localeCase.locale} preview status is missing`);
    for (const claim of localeCase.warningClaims) {
      assert.ok(html.includes(claim), `${localeCase.locale} warning is missing ${claim}`);
    }
    assert.doesNotMatch(html, localeCase.unsupportedClaim, `${localeCase.locale} must not claim release certification or stability`);

    assert.equal(count(html, /<a[^>]+download=/g), 1, `${localeCase.locale} needs one download button`);
    assert.ok(html.includes("macOS Universal"), `${localeCase.locale} universal macOS label is missing`);
    assert.ok(html.includes("Apple Silicon + Intel"), `${localeCase.locale} supported architectures are missing`);
    assert.doesNotMatch(html, /0\.1\.0|Windows_x64|\.exe(?:\"|<)/, `${localeCase.locale} must not expose superseded builds`);

    for (const { filename } of archives) {
      const href = `${localeCase.assetPrefix}assets/downloads/euclidean-echo/0.1.1/${filename}`;
      assert.match(html, new RegExp(`<a[^>]+href="${href.replaceAll(".", "\\.")}"[^>]+download`), `${localeCase.locale} is missing ${filename}`);
    }

    const feedbackHref = `mailto:${encodeURIComponent(CONTACT_EMAIL)}?subject=${encodeURIComponent(localeCase.subject)}`;
    assert.ok(html.includes(`href="${feedbackHref}"`), `${localeCase.locale} feedback email is missing`);
    assert.ok(html.includes(`${localeCase.assetPrefix}assets/downloads/euclidean-echo/0.1.1/SHA256SUMS`), `${localeCase.locale} checksum link is missing`);
  }
});

test("percent-encodes mailto recipients and subjects before publishing them", () => {
  assert.equal(typeof pageModule.mailtoHrefFor, "function", "pages must expose the production mailto builder");
  assert.equal(
    pageModule.mailtoHrefFor("feedback+preview?test@example.com", "Echo feedback #1"),
    "mailto:feedback%2Bpreview%3Ftest%40example.com?subject=Echo%20feedback%20%231"
  );
});

test("ships the approved archive bytes and a matching SHA-256 manifest", async () => {
  const publicDirectory = new URL("../assets/downloads/euclidean-echo/0.1.1/", import.meta.url);
  const manifestLines = [];

  for (const archive of archives) {
    const bytes = await readFile(new URL(archive.filename, publicDirectory)).catch(() => null);
    assert.ok(bytes, `${archive.filename} must be published`);
    assert.equal(bytes.byteLength, archive.bytes, `${archive.filename} byte length drifted`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), archive.sha256, `${archive.filename} hash drifted`);
    manifestLines.push(`${archive.sha256}  ${archive.filename}`);
  }

  const screenshot = await readFile(new URL("euclidean-echo-ui.png", publicDirectory)).catch(() => null);
  assert.ok(screenshot, "the current Euclidean Echo interface preview must be published");
  assert.equal(createHash("sha256").update(screenshot).digest("hex"), "c373ab3cb773c98805e7d4eb517e7e4f153969ef0097ffca0cead44e77faac84");

  const manifest = await readFile(new URL("SHA256SUMS", publicDirectory), "utf8").catch(() => null);
  assert.equal(manifest, `${manifestLines.join("\n")}\n`, "SHA256SUMS must describe the exact public archive");
});
