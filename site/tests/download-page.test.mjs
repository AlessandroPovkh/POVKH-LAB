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

const installers = [
  {
    filename: "Euclidean_Echo_0.1.0_macOS_AppleSilicon.pkg",
    bytes: 9986242,
    sha256: "cae1742adf0d001b031f61e8ad2cbc41fefde1db831eac4ea9d52bd5f1b0fdd0"
  },
  {
    filename: "Euclidean_Echo_0.1.0_macOS_Intel.pkg",
    bytes: 10894355,
    sha256: "d887676c0e7a69ee29606262c6f63bd09541e65e7bd0b2d3343ef491dedfb5f7"
  },
  {
    filename: "Euclidean_Echo_0.1.0_Windows_x64_Setup.exe",
    bytes: 5870925,
    sha256: "b3cc283abb815675c84208f2ec28a96e8974c02f674068c9cfd740a1d66985e1"
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
    warningClaims: ["DAW reali", "host plugin esterni", "firma ad hoc", "non sono firmati con Apple Developer ID", "non sono notarizzati da Apple"],
    unsupportedClaim: /\b(?:release stabile|release certificata|build notarizzata da Apple)\b/i,
    subject: "Feedback anteprima Euclidean Echo"
  },
  {
    locale: "ru",
    output: "ru/download/index.html",
    assetPrefix: "../../",
    status: "ПУБЛИЧНОЕ ПРЕВЬЮ / НЕ СЕРТИФИЦИРОВАНО",
    warningClaims: ["реальных DAW", "сторонних хостах плагинов", "подписаны ad hoc", "не подписаны Apple Developer ID", "не прошли нотарификацию Apple"],
    unsupportedClaim: /(?:стабильный релиз|сертифицированный релиз|нотарифицированная Apple сборка)/i,
    subject: "Обратная связь по превью Euclidean Echo"
  }
];

test("publishes one localized Euclidean Echo preview with three installers and two locked modules", () => {
  for (const localeCase of localeCases) {
    const html = pages.get(localeCase.output).toString();
    assert.equal(count(html, /data-plugin-product="euclidean-echo"/g), 1, `${localeCase.locale} needs one Euclidean Echo product`);
    assert.equal(count(html, /data-plugin-locked(?:[ >])/g), 2, `${localeCase.locale} must preserve two locked modules`);
    assert.ok(html.includes("Euclidean Echo"), `${localeCase.locale} product name is missing`);
    assert.ok(html.includes("0.1.0"), `${localeCase.locale} product version is missing`);
    assert.ok(html.includes(localeCase.status), `${localeCase.locale} preview status is missing`);
    for (const claim of localeCase.warningClaims) {
      assert.ok(html.includes(claim), `${localeCase.locale} warning is missing ${claim}`);
    }
    assert.doesNotMatch(html, localeCase.unsupportedClaim, `${localeCase.locale} must not claim release certification or stability`);

    for (const { filename } of installers) {
      const href = `${localeCase.assetPrefix}assets/downloads/euclidean-echo/0.1.0/${filename}`;
      assert.match(html, new RegExp(`<a[^>]+href="${href.replaceAll(".", "\\.")}"[^>]+download`), `${localeCase.locale} is missing ${filename}`);
    }

    const feedbackHref = `mailto:${encodeURIComponent(CONTACT_EMAIL)}?subject=${encodeURIComponent(localeCase.subject)}`;
    assert.ok(html.includes(`href="${feedbackHref}"`), `${localeCase.locale} feedback email is missing`);
    assert.ok(html.includes(`${localeCase.assetPrefix}assets/downloads/euclidean-echo/0.1.0/SHA256SUMS`), `${localeCase.locale} checksum link is missing`);
  }
});

test("percent-encodes mailto recipients and subjects before publishing them", () => {
  assert.equal(typeof pageModule.mailtoHrefFor, "function", "pages must expose the production mailto builder");
  assert.equal(
    pageModule.mailtoHrefFor("feedback+preview?test@example.com", "Echo feedback #1"),
    "mailto:feedback%2Bpreview%3Ftest%40example.com?subject=Echo%20feedback%20%231"
  );
});

test("ships the approved installer bytes and a matching SHA-256 manifest", async () => {
  const publicDirectory = new URL("../assets/downloads/euclidean-echo/0.1.0/", import.meta.url);
  const manifestLines = [];

  for (const installer of installers) {
    const bytes = await readFile(new URL(installer.filename, publicDirectory)).catch(() => null);
    assert.ok(bytes, `${installer.filename} must be published`);
    assert.equal(bytes.byteLength, installer.bytes, `${installer.filename} byte length drifted`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), installer.sha256, `${installer.filename} hash drifted`);
    manifestLines.push(`${installer.sha256}  ${installer.filename}`);
  }

  const screenshot = await readFile(new URL("euclidean-echo-ui.png", publicDirectory)).catch(() => null);
  assert.ok(screenshot, "the current Euclidean Echo interface preview must be published");
  assert.equal(createHash("sha256").update(screenshot).digest("hex"), "e7b01c1dfbd7b907cb1d7d4e82de3def48ff73b0159e897f5ba0a16ee5643256");

  const manifest = await readFile(new URL("SHA256SUMS", publicDirectory), "utf8").catch(() => null);
  assert.equal(manifest, `${manifestLines.join("\n")}\n`, "SHA256SUMS must describe the exact public installers");
});
