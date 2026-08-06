import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium, webkit } from "playwright";
import { COPY } from "../src/i18n.mjs";
import { genreLabel } from "../src/pages.mjs";
import { SITE_BASE_PATH, SITE_ORIGIN, SOCIAL_LINKS } from "../src/config.mjs";
import { createStaticServer } from "./server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = path.join(siteRoot, "artifacts", "qa");
const siteOrigin = `${SITE_ORIGIN}${SITE_BASE_PATH}`;
const catalog = JSON.parse(await readFile(path.join(siteRoot, "data", "catalog.json"), "utf8"));
const audioLibrary = JSON.parse(await readFile(path.join(siteRoot, "data", "audio-library.json"), "utf8"));
const artistLibrary = JSON.parse(await readFile(path.join(siteRoot, "data", "artists.json"), "utf8"));
const merchLibrary = JSON.parse(await readFile(path.join(siteRoot, "data", "merch.json"), "utf8"));
const defaultAudioTrack = audioLibrary.tracks.find((track) => track.catalogId === audioLibrary.defaultCatalogId);
const tinyTexturedGlb = ({ invalidBounds = false } = {}) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4oKHxH4QZYAwAUJQI/QlXOVQAAAAASUVORK5CYII=", "base64");
  const imageOffset = 60;
  const binaryLength = imageOffset + png.length + ((4 - (png.length % 4)) % 4);
  const document = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 24, target: 34962 },
      { buffer: 0, byteOffset: imageOffset, byteLength: png.length }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: invalidBounds ? [0, 0, 0] : [-0.5, -0.5, 0], max: invalidBounds ? [0, 0, 0] : [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2", min: [0, 0], max: [1, 1] }
    ],
    images: [{ bufferView: 2, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const binary = Buffer.alloc(binaryLength);
  const positions = invalidBounds
    ? [0, 0, 0, 0, 0, 0, 0, 0, 0]
    : [-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0.5];
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 0, 1, 0, 0.5, 1].forEach((value, index) => binary.writeFloatLE(value, 36 + index * 4));
  png.copy(binary, imageOffset);
  const glb = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
  let offset = 0;
  for (const value of [0x46546c67, 2, glb.length, json.length, 0x4e4f534a]) {
    glb.writeUInt32LE(value, offset);
    offset += 4;
  }
  json.copy(glb, offset);
  offset += json.length;
  glb.writeUInt32LE(binary.length, offset);
  offset += 4;
  glb.writeUInt32LE(0x004e4942, offset);
  offset += 4;
  binary.copy(glb, offset);
  return glb;
};
const tinySpinPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nLkAAAAASUVORK5CYII=", "base64");
const publishedReleaseCount = catalog.releases.filter((release) => release.status === "published").length;
const upcomingReleaseCount = catalog.releases.filter((release) => release.status === "upcoming").length;
const baseRoutes = [
  "/",
  "/catalog/",
  ...catalog.releases.map((release) => `/catalog/${release.slug}/`),
  ...catalog.releases.filter((release) => release.streamingLinks).map((release) => `/listen/${release.slug}/`),
  "/artists/",
  ...artistLibrary.artists.map((artist) => `/artists/${artist.slug}/`),
  "/merch/",
  ...merchLibrary.objects.map((object) => `/merch/${object.slug}/`),
  "/process/",
  "/about/",
  "/press/",
  "/contact/",
  "/links/",
  "/download/"
];
const locales = [
  { code: "en", lang: "en", prefix: "", label: "EN" },
  { code: "it", lang: "it", prefix: "it", label: "IT" },
  { code: "ru", lang: "ru", prefix: "ru", label: "RU" }
];
const localizedPath = (locale, baseRoute) => {
  if (!locale.prefix) return baseRoute;
  return baseRoute === "/" ? `/${locale.prefix}/` : `/${locale.prefix}${baseRoute}`;
};
const routeCases = locales.flatMap((locale) => baseRoutes.map((baseRoute) => ({
  locale,
  baseRoute,
  route: localizedPath(locale, baseRoute)
})));
const routes = routeCases.map(({ route }) => route);
const viewports = [
  { name: "320", width: 320, height: 780 },
  { name: "375", width: 375, height: 812 },
  { name: "640", width: 640, height: 900 },
  { name: "812-landscape", width: 812, height: 375 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 1000 }
];
const screenshotCases = new Map([
  ["/@375", "home-en-mobile-375.png"],
  ["/@1440", "home-en-desktop-1440.png"],
  ["/it/@375", "home-it-mobile-375.png"],
  ["/it/@1440", "home-it-desktop-1440.png"],
  ["/ru/@375", "home-ru-mobile-375.png"],
  ["/ru/@1440", "home-ru-desktop-1440.png"],
  ["/catalog/@375", "catalog-en-mobile-375.png"],
  ["/catalog/pvkh-001/@1440", "release-en-desktop-1440.png"],
  ["/artists/alessandro-povkh/@1440", "artist-alessandro-en-desktop-1440.png"],
  ["/ru/artists/k-smokin/@375", "artist-k-smokin-ru-mobile-375.png"],
  ["/listen/pvkh-001/@375", "smartlink-en-mobile-375.png"],
  ["/listen/pvkh-001/@1440", "smartlink-en-desktop-1440.png"],
  ["/listen/pvkh-011/@1440", "smartlink-amazon-en-desktop-1440.png"],
  ["/catalog/pvkh-013/@375", "release-upcoming-en-mobile-375.png"],
  ["/it/catalog/@375", "catalog-it-mobile-375.png"],
  ["/ru/catalog/pvkh-001/@1440", "release-ru-desktop-1440.png"],
  ["/ru/listen/pvkh-001/@375", "smartlink-ru-mobile-375.png"],
  ["/ru/catalog/pvkh-013/@375", "release-upcoming-ru-mobile-375.png"],
  ["/it/process/@1024", "process-it-tablet-1024.png"],
  ["/press/@1024", "press-en-tablet-1024.png"],
  ["/ru/contact/@375", "contact-ru-mobile-375.png"],
  ["/links/@375", "social-access-en-mobile-375.png"],
  ["/links/@1440", "social-access-en-desktop-1440.png"],
  ["/it/links/@375", "social-access-it-mobile-375.png"],
  ["/ru/links/@375", "social-access-ru-mobile-375.png"],
  ["/ru/links/@1440", "social-access-ru-desktop-1440.png"],
  ["/merch/@1440", "merch-en-desktop-1440.png"],
  ["/merch/@375", "merch-en-mobile-375.png"],
  ["/it/merch/@1024", "merch-it-tablet-1024.png"],
  ["/ru/merch/@320", "merch-ru-mobile-320.png"],
  ["/merch/vinyl/@1440", "merch-vinyl-en-desktop-1440.png"],
  ["/it/merch/zine-booklet/@375", "merch-zine-it-mobile-375.png"],
  ["/ru/merch/collector-box-set/@1024", "merch-collector-box-ru-tablet-1024.png"]
]);
const failures = [];
let axeScans = 0;
let viewportChecks = 0;
let fallbackTypographyChecks = 0;

const fail = (message) => failures.push(message);
const releaseBlockedGlbFeatures = [
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  "EXT_meshopt_compression"
];
const glbFilesBelow = async (directory) => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await glbFilesBelow(absolute));
    else if (entry.isFile() && entry.name.endsWith(".glb")) files.push(absolute);
  }
  return files;
};
const glbJsonDocument = (bytes) => {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error("invalid GLB header");
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > bytes.length) throw new Error("invalid GLB chunk length");
    if (type === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(offset, offset + length).toString("utf8").replace(/\0+$/u, "").trim());
    }
    offset += length;
  }
  throw new Error("missing GLB JSON chunk");
};
const auditReleaseGlbs = async () => {
  for (const directory of [path.join(siteRoot, "assets", "merch-3d"), path.join(siteRoot, "dist", "assets", "merch-3d")]) {
    for (const file of await glbFilesBelow(directory)) {
      const relative = path.relative(siteRoot, file);
      try {
        const document = glbJsonDocument(await readFile(file));
        const json = JSON.stringify(document);
        for (const extension of releaseBlockedGlbFeatures) {
          if (json.includes(extension)) fail(`${relative}: release GLB requires non-vendored decoder ${extension}`);
        }
        const lottieImage = (document.images || []).find(({ mimeType = "", uri = "" }) => (
          mimeType === "application/lottie+json" || /\.lottie(?:\.json)?(?:[?#].*)?$/iu.test(uri)
        ));
        if (lottieImage) fail(`${relative}: release GLB requires the non-vendored Lottie loader`);
      } catch (error) {
        fail(`${relative}: cannot enforce release GLB decoder policy (${error.message})`);
      }
    }
  }
};
const interpolate = (template, values) => Object.entries(values)
  .reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
const expectedAlternatesFor = (baseRoute) => ({
  en: `${siteOrigin}${localizedPath(locales[0], baseRoute)}`,
  it: `${siteOrigin}${localizedPath(locales[1], baseRoute)}`,
  ru: `${siteOrigin}${localizedPath(locales[2], baseRoute)}`,
  "x-default": `${siteOrigin}${localizedPath(locales[0], baseRoute)}`
});
const expectedLanguageLinksFor = (baseRoute) => locales.map((locale) => ({
  lang: locale.lang,
  label: locale.label,
  path: localizedPath(locale, baseRoute)
}));

const inspectDisplayTypography = () => {
  const selector = [
    ".hero-title",
    ".page-title",
    ".section-title",
    ".release-code",
    ".card-title",
    ".empty-title",
    ".release-card-title",
    ".release-display-title",
    ".smartlink-release",
    ".social-access-title",
    ".social-access-service",
    ".step h3"
  ].join(",");
  const issues = [];
  const tokenPattern = /[\p{L}\p{N}]+(?:[-‑–—’'][\p{L}\p{N}]+)*[.?!,:;]?/gu;

  for (const element of document.querySelectorAll(selector)) {
    const boundary = element.parentElement;
    if (!boundary) continue;
    const boundaryRect = boundary.getBoundingClientRect();
    const boundaryStyle = getComputedStyle(boundary);
    const contentLeft = boundaryRect.left
      + Number.parseFloat(boundaryStyle.borderLeftWidth || "0")
      + Number.parseFloat(boundaryStyle.paddingLeft || "0");
    const contentRight = boundaryRect.right
      - Number.parseFloat(boundaryStyle.borderRightWidth || "0")
      - Number.parseFloat(boundaryStyle.paddingRight || "0");
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (const match of node.textContent.matchAll(tokenPattern)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()].filter(({ width, height }) => width > 0 && height > 0);
        const lines = [];
        for (const rect of rects) {
          if (!lines.some((top) => Math.abs(top - rect.top) <= 1)) lines.push(rect.top);
        }
        if (lines.length > 1) {
          issues.push({ type: "split-token", token: match[0], text: element.textContent.trim(), className: element.className });
          continue;
        }
        const tokenRect = range.getBoundingClientRect();
        if (tokenRect.left < contentLeft - 1 || tokenRect.right > contentRight + 1) {
          issues.push({
            type: "outside-container",
            token: match[0],
            text: element.textContent.trim(),
            className: element.className,
            overflowLeft: Math.max(0, contentLeft - tokenRect.left),
            overflowRight: Math.max(0, tokenRect.right - contentRight)
          });
        }
      }
    }
  }

  const heroTitle = document.querySelector(".hero-title");
  if (heroTitle) {
    const lines = [...heroTitle.querySelectorAll(":scope > .hero-title-line")];
    if (lines.length !== 3) issues.push({ type: "hero-line-count", count: lines.length });
    for (const line of lines) {
      if (getComputedStyle(line).whiteSpace !== "nowrap") {
        issues.push({ type: "hero-line-wrap", text: line.textContent.trim() });
      }
      const range = document.createRange();
      range.selectNodeContents(line);
      const lineTops = [];
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0 && !lineTops.some((top) => Math.abs(top - rect.top) <= 1)) lineTops.push(rect.top);
      }
      if (lineTops.length !== 1) issues.push({ type: "hero-line-count", text: line.textContent.trim(), count: lineTops.length });
    }
  }

  const releaseCode = document.querySelector(".release-code");
  if (releaseCode && getComputedStyle(releaseCode).whiteSpace !== "nowrap") {
    issues.push({ type: "release-code-wrap", text: releaseCode.textContent.trim() });
  }

  return issues;
};

const displayFontSizes = () => {
  const selector = [
    ".hero-title",
    ".page-title",
    ".section-title",
    ".release-code",
    ".card-title",
    ".empty-title",
    ".release-card-title",
    ".release-display-title",
    ".smartlink-release",
    ".social-access-title",
    ".social-access-service",
    ".step h3"
  ].join(",");
  return [...document.querySelectorAll(selector)]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({
      className: element.className,
      text: element.textContent.trim(),
      size: Number.parseFloat(getComputedStyle(element).fontSize)
    }));
};

const applyTextZoom = async (page) => {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

const viewerControlHitTest = async (page, selector) => {
  const control = page.locator(selector);
  await control.scrollIntoViewIfNeeded();
  return control.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + 3, rect.top + rect.height / 2],
      [rect.right - 3, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.top + 3],
      [rect.left + rect.width / 2, rect.bottom - 3]
    ];
    const player = document.querySelector("[data-audio-player]");
    return {
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      points: points.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return { viewer: button === hit || button.contains(hit), player: Boolean(player?.contains(hit)) };
      })
    };
  });
};

const ensurePlayerTrayOpen = async (page) => {
  const tray = page.locator("[data-player-tray]");
  if (await tray.evaluate((element) => element.hidden)) {
    await page.locator("[data-player-tray-toggle]").click();
    await page.waitForFunction(() => document.querySelector("[data-player-tray]")?.hidden === false);
  }
  return tray;
};

const advancedControl = async (page, selector) => {
  await ensurePlayerTrayOpen(page);
  return page.locator(selector);
};

const verifyDisplayFontGrowth = (label, before, after) => {
  if (before.length !== after.length) {
    fail(`${label}: display node count changed from ${before.length} to ${after.length}`);
    return;
  }
  for (let index = 0; index < before.length; index += 1) {
    const initial = before[index];
    const zoomed = after[index];
    if (initial.text !== zoomed.text || initial.className !== zoomed.className) {
      fail(`${label}: display node order changed at ${index}`);
      continue;
    }
    if (zoomed.size + 0.01 < initial.size || zoomed.size < initial.size * 1.05 || zoomed.size < initial.size + 2) {
      fail(`${label}: ${initial.className} "${initial.text}" grows only ${initial.size.toFixed(2)}px -> ${zoomed.size.toFixed(2)}px`);
    }
  }
};

const app = createStaticServer({ root: path.join(siteRoot, "dist"), basePath: SITE_BASE_PATH });
await auditReleaseGlbs();
const baseUrl = await app.listen();
await rm(screenshotDir, { recursive: true, force: true });
await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: "dark",
      reducedMotion: "no-preference"
    });
    await context.addInitScript(() => {
      const nativePlay = HTMLMediaElement.prototype.play;
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value() {
          if (this.hasAttribute("data-audio-engine")) {
            return Promise.reject(new DOMException("Autoplay blocked for route QA", "NotAllowedError"));
          }
          return nativePlay.call(this);
        }
      });
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    for (const routeCase of routeCases) {
      const { locale, baseRoute, route } = routeCase;
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const label = `${route} @ ${viewport.width}×${viewport.height}`;
      if (!response || response.status() !== 200) fail(`${label}: HTTP ${response?.status() ?? "no response"}`);
      if (await page.locator("h1").count() !== 1) fail(`${label}: expected exactly one h1`);
      if (await page.locator("main").count() !== 1) fail(`${label}: expected one main landmark`);

      const pageContract = await page.evaluate(({ expectedLang, expectedLocale, expectedCanonical, expectedAlternates, expectedLanguageLinks }) => {
        const canonicalElements = [...document.querySelectorAll('head link[rel="canonical"]')];
        const alternateElements = [...document.querySelectorAll('head link[rel="alternate"][hreflang]')];
        const switchers = [...document.querySelectorAll("nav[data-language-switcher]")];
        const languageLinks = switchers.length === 1
          ? [...switchers[0].querySelectorAll("a.language-link[lang][hreflang]")]
          : [];
        const currentLinks = languageLinks.filter((link) => link.getAttribute("aria-current") === "page");
        const signalLayers = [...document.querySelectorAll(".site-signal-layer")];
        const signalFields = [...document.querySelectorAll("[data-signal-field]")];
        const actualAlternates = alternateElements.map((element) => ({
          hreflang: element.getAttribute("hreflang"),
          href: element.getAttribute("href")
        }));
        const actualLanguageLinks = languageLinks.map((link) => {
          const url = new URL(link.href);
          return {
            lang: link.getAttribute("lang"),
            hreflang: link.getAttribute("hreflang"),
            label: link.textContent.trim(),
            path: url.pathname,
            search: url.search,
            hash: url.hash,
            current: link.getAttribute("aria-current"),
            ariaLabel: link.getAttribute("aria-label")
          };
        });
        return {
          htmlLang: document.documentElement.lang,
          bodyLocale: document.body.dataset.locale,
          canonicalCount: canonicalElements.length,
          canonical: canonicalElements[0]?.getAttribute("href") ?? null,
          alternateCount: alternateElements.length,
          alternateKeysUnique: new Set(actualAlternates.map(({ hreflang }) => hreflang)).size === actualAlternates.length,
          actualAlternates,
          expectedAlternates,
          switcherCount: switchers.length,
          languageLinkCount: languageLinks.length,
          currentCount: currentLinks.length,
          currentLang: currentLinks[0]?.getAttribute("hreflang") ?? null,
          switcherLabel: switchers[0]?.getAttribute("aria-label") ?? null,
          actualLanguageLinks,
          signalLayerCount: signalLayers.length,
          signalFieldCount: signalFields.length,
          signalHidden: signalLayers[0]?.getAttribute("aria-hidden") ?? null,
          signalPathCount: signalFields[0]?.querySelectorAll("path").length ?? -1,
          signalLegacyCount: document.querySelectorAll("[data-signal-shell], [data-signal-readout], [data-signal-link], [data-signal-node]").length,
          signalCircleCount: signalFields[0]?.querySelectorAll("circle").length ?? -1,
          expectedLanguageLinks,
          expectedLang,
          expectedLocale,
          expectedCanonical
        };
      }, {
        expectedLang: locale.lang,
        expectedLocale: locale.code,
        expectedCanonical: `${siteOrigin}${route}`,
        expectedAlternates: expectedAlternatesFor(baseRoute),
        expectedLanguageLinks: expectedLanguageLinksFor(baseRoute)
      });

      if (pageContract.htmlLang !== pageContract.expectedLang) {
        fail(`${label}: html lang is ${pageContract.htmlLang}, expected ${pageContract.expectedLang}`);
      }
      if (pageContract.bodyLocale !== pageContract.expectedLocale) {
        fail(`${label}: body data-locale is ${pageContract.bodyLocale}, expected ${pageContract.expectedLocale}`);
      }
      if (pageContract.canonicalCount !== 1 || pageContract.canonical !== pageContract.expectedCanonical) {
        fail(`${label}: canonical is ${pageContract.canonicalCount} × ${pageContract.canonical}, expected ${pageContract.expectedCanonical}`);
      }
      if (pageContract.alternateCount !== 4 || !pageContract.alternateKeysUnique) {
        fail(`${label}: expected exactly four unique hreflang alternates, got ${JSON.stringify(pageContract.actualAlternates)}`);
      }
      for (const [hreflang, expectedHref] of Object.entries(pageContract.expectedAlternates)) {
        const matches = pageContract.actualAlternates.filter((item) => item.hreflang === hreflang && item.href === expectedHref);
        if (matches.length !== 1) fail(`${label}: hreflang ${hreflang} does not resolve exactly to ${expectedHref}`);
      }
      if (pageContract.switcherCount !== 1) fail(`${label}: expected exactly one language switcher`);
      if (!pageContract.switcherLabel) fail(`${label}: language switcher has no accessible label`);
      if (pageContract.languageLinkCount !== 3) fail(`${label}: language switcher has ${pageContract.languageLinkCount} links`);
      if (pageContract.currentCount !== 1 || pageContract.currentLang !== locale.lang) {
        fail(`${label}: current language is ${pageContract.currentCount} × ${pageContract.currentLang}, expected ${locale.lang}`);
      }
      if (pageContract.signalLayerCount !== 1
        || pageContract.signalFieldCount !== 1
        || pageContract.signalHidden !== "true"
        || pageContract.signalPathCount !== 2
        || pageContract.signalLegacyCount !== 0
        || pageContract.signalCircleCount !== 0) {
        fail(`${label}: invalid magnetic signal field ${JSON.stringify({
          layers: pageContract.signalLayerCount,
          fields: pageContract.signalFieldCount,
          hidden: pageContract.signalHidden,
          paths: pageContract.signalPathCount,
          legacy: pageContract.signalLegacyCount,
          circles: pageContract.signalCircleCount
        })}`);
      }
      for (const expected of pageContract.expectedLanguageLinks) {
        const matches = pageContract.actualLanguageLinks.filter((item) => item.hreflang === expected.lang);
        if (matches.length !== 1) {
          fail(`${label}: expected one ${expected.lang} language link`);
          continue;
        }
        const actual = matches[0];
        if (actual.lang !== expected.lang || actual.label !== expected.label || actual.path !== expected.path || actual.search || actual.hash || !actual.ariaLabel) {
          fail(`${label}: invalid ${expected.lang} language target ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        }
      }

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth
      }));
      if (overflow.document > 1 || overflow.body > 1) fail(`${label}: horizontal overflow ${JSON.stringify(overflow)}`);

      if (viewport.width <= 768) {
        const mobilePlayerHeight = await page.locator("[data-audio-player]").evaluate((player) => player.getBoundingClientRect().height);
        if (mobilePlayerHeight > 72) fail(`${label}: compact mobile audio player is too tall (${mobilePlayerHeight.toFixed(1)}px)`);
      }

      const typographyIssues = await page.evaluate(inspectDisplayTypography);
      if (typographyIssues.length) {
        fail(`${label}: display typography ${JSON.stringify(typographyIssues.slice(0, 6))}`);
      }

      const brokenImages = await page.locator("img").evaluateAll((images) => images
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")));
      if (brokenImages.length) fail(`${label}: broken images ${brokenImages.join(", ")}`);

      if (baseRoute === "/merch/") {
        const merchContract = await page.evaluate(() => ({
          objects: document.querySelectorAll("[data-merch-object]").length,
          categories: [...document.querySelectorAll("[data-merch-category]")]
            .map((node) => node.dataset.merchCategory),
          detailLinks: document.querySelectorAll("[data-merch-detail]").length,
          roadmap: document.querySelectorAll("[data-merch-roadmap]").length,
          roadmapOpen: document.querySelector("details[data-merch-roadmap]")?.open,
          statuses: document.querySelectorAll("[data-merch-visible-status]").length,
          anchor: document.querySelector('.merch-hero a[href="#merch-objects"]')?.getAttribute("href"),
          navCurrent: document.querySelectorAll('.nav-link[aria-current="page"]').length,
          firstGridColumns: new Set([...document.querySelector(".merch-object-grid").querySelectorAll(".merch-object")]
            .map((node) => Math.round(node.getBoundingClientRect().left))).size
        }));
        if (merchContract.objects !== merchLibrary.objects.length
          || JSON.stringify(merchContract.categories) !== JSON.stringify(["media", "wear", "printObjects"])
          || merchContract.detailLinks !== merchLibrary.objects.length
          || merchContract.roadmap !== 1
          || merchContract.roadmapOpen !== false
          || merchContract.statuses !== 1
          || merchContract.anchor != null
          || merchContract.navCurrent !== 1
          || (viewport.width === 320 && merchContract.firstGridColumns !== 1)) {
          fail(`${label}: invalid merch browser contract ${JSON.stringify(merchContract)}`);
        }

        if (viewport.width === 320 || viewport.width === 375) {
          await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
          const playerSafety = await page.evaluate(() => {
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const player = document.querySelector("[data-audio-player]").getBoundingClientRect();
            const copyAndAction = [
              ["lede", document.querySelector(".merch-hero .lede")],
              ["status", document.querySelector(".merch-hero .meta")]
            ].flatMap(([name, node]) => {
              if (!node || getComputedStyle(node).display === "none") return [];
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 ? [{ name, rect }] : [];
            });
            return {
              player,
              intersections: copyAndAction.filter(({ rect }) => overlaps(player, rect)).map(({ name, rect }) => ({ name, rect }))
            };
          });
          if (playerSafety.intersections.length) {
            fail(`${label}: ready player intersects merch hero copy ${JSON.stringify(playerSafety)}`);
          }
        }
      }

      const merchSlug = baseRoute.match(/^\/merch\/([a-z0-9-]+)\/$/)?.[1] || null;
      if (merchSlug) {
        const expectedObject = merchLibrary.objects.find((object) => object.slug === merchSlug);
        const expectedGalleryCount = expectedObject?.gallery.filter((image) => image.path !== expectedObject.viewer.poster).length || 0;
        const detailContract = await page.evaluate(() => {
          const gallery = document.querySelector("[data-merch-gallery]");
          const triggers = [...document.querySelectorAll("[data-merch-gallery-trigger]")];
          const figures = [...document.querySelectorAll("[data-merch-gallery-figure]")];
          const releaseGate = document.querySelector("[data-merch-release-gate]");
          const hero = document.querySelector("[data-product-viewer-poster]");
          return {
            rootCount: document.querySelectorAll("[data-merch-detail-id]").length,
            objectId: document.querySelector("[data-merch-detail-id]")?.dataset.merchDetailId || null,
            stage: document.querySelector("[data-merch-detail-id]")?.dataset.merchStage || null,
            galleryCount: Number(gallery?.dataset.galleryCount || 0),
            controller: gallery?.dataset.merchGalleryController || null,
            triggers: triggers.length,
            uniqueTriggerHrefs: new Set(triggers.map((trigger) => trigger.href)).size,
            figures: figures.length,
            hiddenFigures: figures.filter((figure) => figure.hidden).length,
            dialogCount: document.querySelectorAll("[data-merch-gallery-dialog]").length,
            dialogOpen: document.querySelector("[data-merch-gallery-dialog]")?.open || false,
            gateCount: releaseGate ? 1 : 0,
            heroLoading: hero?.getAttribute("loading") || null,
            heroPriority: hero?.getAttribute("fetchpriority") || null,
            leadingActions: [...document.querySelectorAll(".merch-detail-hero [data-product-viewer-activate]")]
              .filter((button) => !button.hidden).length,
            galleryJump: document.querySelectorAll('.merch-detail-hero a[href="#merch-concept-gallery"]').length,
            visibleStatuses: document.querySelectorAll("[data-merch-visible-status]").length,
            posterRepeated: [...document.querySelectorAll("[data-merch-gallery-trigger] img")]
              .some((image) => image.src === hero?.src),
            breadcrumbCurrent: document.querySelector("[data-merch-breadcrumb] [aria-current=page]")?.textContent.trim() || null,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        });
        if (!expectedObject
          || detailContract.rootCount !== 1
          || detailContract.objectId !== expectedObject.id
          || detailContract.stage !== "concept"
          || detailContract.galleryCount !== expectedGalleryCount
          || detailContract.controller !== "active"
          || detailContract.triggers !== expectedGalleryCount
          || detailContract.uniqueTriggerHrefs !== expectedGalleryCount
          || detailContract.figures !== expectedGalleryCount
          || detailContract.hiddenFigures !== expectedGalleryCount - 1
          || detailContract.dialogCount !== 1
          || detailContract.dialogOpen
          || detailContract.gateCount !== 1
          || detailContract.heroLoading !== "eager"
          || detailContract.heroPriority !== "high"
          || detailContract.leadingActions !== 1
          || detailContract.galleryJump !== 0
          || detailContract.visibleStatuses !== 1
          || detailContract.posterRepeated
          || !detailContract.breadcrumbCurrent
          || detailContract.horizontalOverflow > 1) {
          fail(`${label}: invalid merch detail contract ${JSON.stringify(detailContract)}`);
        }

        if (viewport.width === 375) {
          const triggerIndex = Math.min(1, expectedGalleryCount - 1);
          const trigger = page.locator("[data-merch-gallery-trigger]").nth(triggerIndex);
          await trigger.focus();
          await trigger.click();
          await page.waitForFunction(() => document.querySelector("[data-merch-gallery-dialog]")?.open);
          const initialDialog = await page.evaluate(() => ({
            open: document.querySelector("[data-merch-gallery-dialog]")?.open || false,
            current: [...document.querySelectorAll("[data-merch-gallery-figure]")].findIndex((figure) => !figure.hidden),
            counter: document.querySelector("[data-merch-gallery-counter]")?.textContent.trim() || "",
            activeControllers: document.querySelectorAll('[data-merch-gallery-controller="active"]').length,
            activeElement: document.activeElement?.matches("[data-merch-gallery-close]") || false
          }));
          if (!initialDialog.open
            || initialDialog.current !== triggerIndex
            || initialDialog.activeControllers !== 1
            || !initialDialog.activeElement) {
            fail(`${label}: merch gallery did not open at the selected view ${JSON.stringify(initialDialog)}`);
          }
          await page.keyboard.press("End");
          const finalIndex = await page.locator("[data-merch-gallery-figure]").evaluateAll((figures) => figures.findIndex((figure) => !figure.hidden));
          if (finalIndex !== expectedGalleryCount - 1) fail(`${label}: End did not reach final merch gallery view`);
          await page.keyboard.press("Home");
          const homeIndex = await page.locator("[data-merch-gallery-figure]").evaluateAll((figures) => figures.findIndex((figure) => !figure.hidden));
          if (homeIndex !== 0) fail(`${label}: Home did not reach first merch gallery view`);
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => !document.querySelector("[data-merch-gallery-dialog]")?.open);
          if (!await trigger.evaluate((element) => document.activeElement === element)) {
            fail(`${label}: merch gallery did not restore focus to its trigger`);
          }
        }
      }

      if (baseRoute === "/links/") {
        const socialAccess = await page.evaluate(() => {
          const nav = document.querySelector("[data-social-access-nav]");
          const links = [...document.querySelectorAll("[data-social-access-link]")];
          return {
            navCount: document.querySelectorAll("[data-social-access-nav]").length,
            navLabel: nav?.getAttribute("aria-label") || "",
            ids: links.map((link) => link.dataset.socialId),
            hrefs: links.map((link) => link.href),
            targets: links.map((link) => {
              const rect = link.getBoundingClientRect();
              return {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                right: rect.right,
                scrollWidth: link.scrollWidth,
                scrollHeight: link.scrollHeight,
                ariaLabel: link.getAttribute("aria-label"),
                target: link.getAttribute("target"),
                rel: link.getAttribute("rel")
              };
            })
          };
        });
        const expectedIds = SOCIAL_LINKS.map(({ id }) => id);
        const expectedHrefs = SOCIAL_LINKS.map(({ url }) => url);
        if (socialAccess.navCount !== 1 || socialAccess.navLabel !== COPY[locale.code].pages.links.navLabel) {
          fail(`${label}: invalid social-access navigation landmark ${JSON.stringify(socialAccess)}`);
        }
        if (JSON.stringify(socialAccess.ids) !== JSON.stringify(expectedIds)
          || JSON.stringify(socialAccess.hrefs) !== JSON.stringify(expectedHrefs)) {
          fail(`${label}: social-access order or destinations do not match SOCIAL_LINKS ${JSON.stringify(socialAccess)}`);
        }
        if (new Set(socialAccess.hrefs).size !== socialAccess.hrefs.length) {
          fail(`${label}: social-access destinations are not unique`);
        }
        for (const [index, target] of socialAccess.targets.entries()) {
          const expected = SOCIAL_LINKS[index];
          const relTokens = new Set((target.rel || "").split(/\s+/).filter(Boolean));
          const expectedAria = interpolate(COPY[locale.code].pages.links.serviceAria, { service: expected?.label || "" });
          if (target.target !== "_blank"
            || !relTokens.has("noopener")
            || !relTokens.has("noreferrer")
            || target.ariaLabel !== expectedAria) {
            fail(`${label}: social-access ${expected?.id || index} has an unsafe or incorrect accessible target ${JSON.stringify(target)}`);
          }
          if (target.width < 44 || target.height < 44) {
            fail(`${label}: social-access ${expected?.id || index} is below 44×44px ${JSON.stringify(target)}`);
          }
          if (target.scrollWidth > target.width + 0.5 || target.scrollHeight > target.height + 0.5) {
            fail(`${label}: social-access ${expected?.id || index} content is clipped ${JSON.stringify(target)}`);
          }
          if (target.left < -0.5 || target.right > viewport.width + 0.5) {
            fail(`${label}: social-access ${expected?.id || index} leaves the viewport ${JSON.stringify(target)}`);
          }
        }

        if (viewport.width === 320 || viewport.width === 375) {
          await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
          if (viewport.width === 375) {
            const initialPlayerClearance = await page.evaluate(() => {
              const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
              const finalLink = document.querySelector(".social-access-item:last-child [data-social-access-link]")?.getBoundingClientRect();
              return { playerTop: player?.top ?? null, finalBottom: finalLink?.bottom ?? null };
            });
            if (initialPlayerClearance.playerTop === null
              || initialPlayerClearance.finalBottom === null
              || initialPlayerClearance.finalBottom > initialPlayerClearance.playerTop + 0.5) {
              fail(`${label}: all four social-access rows must appear above the ready player at 375px ${JSON.stringify(initialPlayerClearance)}`);
            }
          }
          await page.evaluate(() => {
            document.documentElement.style.scrollBehavior = "auto";
            const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
            const finalLink = document.querySelector(".social-access-item:last-child [data-social-access-link]")?.getBoundingClientRect();
            if (player && finalLink && finalLink.bottom > player.top) {
              window.scrollBy(0, finalLink.bottom - player.top + 16);
            }
          });
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const playerSafety = await page.evaluate(() => {
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
            const finalLink = document.querySelector(".social-access-item:last-child [data-social-access-link]")?.getBoundingClientRect();
            return {
              player,
              finalLink,
              visible: Boolean(finalLink && finalLink.top >= 0 && finalLink.bottom <= innerHeight),
              overlap: Boolean(player && finalLink && overlaps(player, finalLink))
            };
          });
          if (!playerSafety.visible || playerSafety.overlap) {
            fail(`${label}: final social-access row cannot be revealed clear of the audio player ${JSON.stringify(playerSafety)}`);
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate(() => document.documentElement.style.removeProperty("scroll-behavior"));
        }
      }

      if (baseRoute === "/catalog/") {
        const catalogContract = await page.evaluate(() => {
          const cards = [...document.querySelectorAll("[data-release-card]")];
          const hrefs = cards.map((card) => new URL(card.href).pathname);
          return {
            count: cards.length,
            uniqueHrefs: new Set(hrefs).size,
            published: cards.filter((card) => card.dataset.releaseStatus === "published").length,
            upcoming: cards.filter((card) => card.dataset.releaseStatus === "upcoming").length,
            hidden: cards.filter((card) => card.hidden).length,
            toolbarVisible: getComputedStyle(document.querySelector("[data-catalog-filters]")).display !== "none",
            result: document.querySelector("[data-filter-result]")?.textContent.trim() || "",
            titleLanguages: cards.map((card) => ({
              slug: new URL(card.href).pathname.match(/\/(pvkh-\d{3})\/$/)?.[1] || null,
              lang: card.querySelector(".release-card-title")?.getAttribute("lang") || null
            }))
          };
        });
        if (catalogContract.count !== catalog.releases.length || catalogContract.uniqueHrefs !== catalog.releases.length) {
          fail(`${label}: catalog cards are not ${catalog.releases.length} unique routes`);
        }
        if (catalogContract.published !== publishedReleaseCount || catalogContract.upcoming !== upcomingReleaseCount) {
          fail(`${label}: catalog status counts are ${catalogContract.published}/${catalogContract.upcoming}, expected ${publishedReleaseCount}/${upcomingReleaseCount}`);
        }
        if (catalogContract.hidden !== 0) fail(`${label}: default catalog filter hides ${catalogContract.hidden} cards`);
        if (!catalogContract.toolbarVisible || !catalogContract.result) fail(`${label}: enhanced catalog filters are not initialised`);
        for (const { slug, lang } of catalogContract.titleLanguages) {
          const expectedLanguage = catalog.releases.find((release) => release.slug === slug)?.titleLanguage;
          if (!expectedLanguage || lang !== expectedLanguage) fail(`${label}: ${slug} title lang is ${lang}, expected ${expectedLanguage}`);
        }

        const filterMetrics = await page.locator(".filter-button").evaluateAll((buttons) => buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }));
        if (filterMetrics.length !== 3) fail(`${label}: expected three filter controls`);
        if (filterMetrics.some(({ width, height }) => width < 44 || height < 44)) fail(`${label}: catalog filter target is below 44×44px`);
      }

      const releaseSlug = baseRoute.match(/^\/catalog\/(pvkh-\d{3})\/$/)?.[1];
      if (releaseSlug) {
        const expectedRelease = catalog.releases.find((release) => release.slug === releaseSlug);
        const releaseCopy = COPY[locale.code].pages.release;
        const releaseContract = await page.evaluate(() => {
          const structuredData = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map((script) => JSON.parse(script.textContent))
            .find((data) => Array.isArray(data["@graph"]));
          const recording = structuredData?.["@graph"].find((item) => item["@type"] === "MusicRecording");
          const streamingCtas = [...document.querySelectorAll('[data-release-cta="streaming"]')];
          const preorderCtas = [...document.querySelectorAll('[data-release-cta="preorder"]')];
          const primaryGenre = document.querySelector("[data-release-primary-genre]");
          const editorialTags = document.querySelector("[data-release-editorial-tags]");
          const streamingTargets = streamingCtas.map((cta) => {
            const rect = cta.getBoundingClientRect();
            return {
              service: cta.dataset.streamingService || null,
              href: cta.href,
              target: cta.getAttribute("target"),
              rel: cta.getAttribute("rel"),
              ariaLabel: cta.getAttribute("aria-label"),
              visibleLabel: cta.querySelector(".streaming-label")?.textContent.trim() || null,
              width: rect.width,
              height: rect.height,
              scrollWidth: cta.scrollWidth,
              scrollHeight: cta.scrollHeight,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom
            };
          });
          const streamingGaps = [];
          for (let first = 0; first < streamingTargets.length; first += 1) {
            for (let second = first + 1; second < streamingTargets.length; second += 1) {
              const a = streamingTargets[first];
              const b = streamingTargets[second];
              const dx = Math.max(a.left - b.right, b.left - a.right, 0);
              const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
              streamingGaps.push(Math.hypot(dx, dy));
            }
          }
          return {
            id: document.querySelector("[data-release-id]")?.dataset.releaseId || null,
            status: document.querySelector("[data-release-id]")?.dataset.releaseStatus || null,
            title: document.querySelector(".release-display-title")?.textContent.trim() || null,
            titleLang: document.querySelector(".release-display-title")?.getAttribute("lang") || null,
            trackTitleLang: document.querySelector(".track-list [lang]")?.getAttribute("lang") || null,
            releaseDate: document.querySelector(".data-list time")?.getAttribute("datetime") || null,
            streamingTargets,
            streamingGaps,
            streamingNavLabel: document.querySelector(".streaming-links")?.getAttribute("aria-label") || null,
            preorderCtaCount: preorderCtas.length,
            preorderHref: preorderCtas[0]?.href || null,
            primaryGenre: primaryGenre?.textContent.trim() || null,
            primaryGenreVerified: primaryGenre?.dataset.verified || null,
            editorialTags: editorialTags?.textContent.trim() || null,
            jsonLdHasGenre: Object.hasOwn(recording || {}, "genre"),
            jsonLdGenre: recording?.genre || null,
            jsonLdHasSameAs: Object.hasOwn(recording || {}, "sameAs"),
            jsonLdSameAs: recording?.sameAs || null,
            jsonLdHasLanguage: Object.hasOwn(recording || {}, "inLanguage")
          };
        });
        if (!expectedRelease || releaseContract.id !== expectedRelease.id || releaseContract.status !== expectedRelease.status) {
          fail(`${label}: release identity/status mismatch ${JSON.stringify(releaseContract)}`);
        }
        if (releaseContract.title !== expectedRelease?.title || releaseContract.releaseDate !== expectedRelease?.releaseDate) {
          fail(`${label}: release title/date mismatch ${JSON.stringify(releaseContract)}`);
        }
        if (releaseContract.titleLang !== expectedRelease?.titleLanguage
          || releaseContract.trackTitleLang !== expectedRelease?.titleLanguage) {
          fail(`${label}: release title language semantics mismatch ${JSON.stringify(releaseContract)}`);
        }
        if (releaseContract.jsonLdHasLanguage) fail(`${label}: JSON-LD exposes an unverified recording language`);
        const expectedPreorderCtas = expectedRelease?.preorderUrl ? 1 : 0;
        const expectedStreamingLinks = expectedRelease?.streamingLinks || [];
        const expectedStreamingServices = expectedStreamingLinks.length
          ? [...expectedStreamingLinks.map(({ service }) => service), "allServices"]
          : [];
        if (JSON.stringify(releaseContract.streamingTargets.map(({ service }) => service)) !== JSON.stringify(expectedStreamingServices)) {
          fail(`${label}: streaming CTA service order does not match source data ${JSON.stringify(releaseContract.streamingTargets)}`);
        }
        if (expectedStreamingLinks.length && !releaseContract.streamingNavLabel) fail(`${label}: streaming chooser has no accessible label`);
        const expectedStreamingNavLabel = expectedStreamingLinks.length
          ? interpolate(releaseCopy.streamingLabel, { title: expectedRelease.title })
          : null;
        if (releaseContract.streamingNavLabel !== expectedStreamingNavLabel) fail(`${label}: localized streaming chooser label mismatch`);
        if (new Set(releaseContract.streamingTargets.map(({ href }) => href)).size !== releaseContract.streamingTargets.length) {
          fail(`${label}: streaming CTA destinations must be unique`);
        }
        if (releaseContract.streamingTargets.some(({ ariaLabel }) => !ariaLabel)) fail(`${label}: streaming CTA has no accessible name`);
        for (const expectedLink of expectedStreamingLinks) {
          const actual = releaseContract.streamingTargets.find(({ service }) => service === expectedLink.service);
          const relTokens = new Set((actual?.rel || "").split(/\s+/).filter(Boolean));
          if (!actual || actual.href !== expectedLink.url || actual.target !== "_blank" || !relTokens.has("noopener") || !relTokens.has("noreferrer")) {
            fail(`${label}: ${expectedLink.service} CTA contract does not match source data ${JSON.stringify(actual)}`);
          }
          const serviceLabel = releaseCopy.services[expectedLink.service];
          const expectedAriaLabel = interpolate(releaseCopy.serviceAria, { title: expectedRelease.title, service: serviceLabel });
          if (actual?.visibleLabel !== serviceLabel || actual?.ariaLabel !== expectedAriaLabel) {
            fail(`${label}: ${expectedLink.service} localized label mismatch ${JSON.stringify(actual)}`);
          }
        }
        const allServices = releaseContract.streamingTargets.find(({ service }) => service === "allServices");
        if (expectedStreamingLinks.length) {
          const expectedSmartPath = localizedPath(locale, `/listen/${expectedRelease.slug}/`);
          if (!allServices || new URL(allServices.href).pathname !== expectedSmartPath || new URL(allServices.href).origin !== baseUrl || allServices.target !== null) {
            fail(`${label}: all-services CTA must stay local at ${expectedSmartPath} ${JSON.stringify(allServices)}`);
          }
          const expectedAllServicesAria = interpolate(releaseCopy.allServicesAria, {
            title: expectedRelease.title,
            service: releaseCopy.services.allServices
          });
          if (allServices.visibleLabel !== releaseCopy.services.allServices || allServices.ariaLabel !== expectedAllServicesAria) {
            fail(`${label}: all-services localized label mismatch ${JSON.stringify(allServices)}`);
          }
        } else if (allServices) {
          fail(`${label}: unavailable smart-link CTA is rendered`);
        }
        if (releaseContract.streamingTargets.some(({ width, height }) => width < 44 || height < 44)) {
          fail(`${label}: streaming CTA target is below 44×44px ${JSON.stringify(releaseContract.streamingTargets)}`);
        }
        if (releaseContract.streamingTargets.some(({ width, height, scrollWidth, scrollHeight }) => scrollWidth > width + 0.5 || scrollHeight > height + 0.5)) {
          fail(`${label}: streaming CTA content is clipped ${JSON.stringify(releaseContract.streamingTargets)}`);
        }
        if (releaseContract.streamingGaps.some((gap) => gap < 8)) {
          fail(`${label}: streaming CTA gap is below 8px ${JSON.stringify(releaseContract.streamingGaps)}`);
        }
        if (releaseContract.preorderCtaCount !== expectedPreorderCtas || releaseContract.preorderHref !== (expectedRelease?.preorderUrl || null)) {
          fail(`${label}: preorder CTA does not match source data ${JSON.stringify(releaseContract)}`);
        }
        if (releaseContract.primaryGenreVerified !== String(Boolean(expectedRelease?.primaryGenre))) {
          fail(`${label}: platform-genre verification marker does not match source data`);
        }
        const expectedPrimaryGenre = expectedRelease?.primaryGenre
          ? genreLabel(expectedRelease.primaryGenre, locale.code)
          : null;
        if (expectedPrimaryGenre && releaseContract.primaryGenre !== expectedPrimaryGenre) {
          fail(`${label}: displayed platform genre is ${releaseContract.primaryGenre}, expected ${expectedPrimaryGenre}`);
        }
        if (!releaseContract.primaryGenre) fail(`${label}: platform-genre field is empty`);
        const editorialApproved = expectedRelease?.editorial?.reviewRequired !== true;
        const expectedEditorialTags = editorialApproved && expectedRelease?.editorialTags.length
          ? expectedRelease.editorialTags.map((tag) => genreLabel(tag, locale.code)).join(" / ")
          : null;
        if (releaseContract.editorialTags !== expectedEditorialTags) {
          fail(`${label}: editorial tags are ${releaseContract.editorialTags}, expected ${expectedEditorialTags}`);
        }
        if (releaseContract.jsonLdHasGenre !== Boolean(expectedRelease?.primaryGenre)
          || releaseContract.jsonLdGenre !== (expectedRelease?.primaryGenre || null)) {
          fail(`${label}: JSON-LD genre is not limited to verified platform metadata`);
        }
        const expectedSameAs = expectedStreamingLinks.length ? expectedStreamingLinks.map(({ url }) => url) : null;
        if (releaseContract.jsonLdHasSameAs !== Boolean(expectedSameAs)
          || JSON.stringify(releaseContract.jsonLdSameAs) !== JSON.stringify(expectedSameAs)) {
          fail(`${label}: JSON-LD streaming URLs do not match source data`);
        }
      }

      const smartSlug = baseRoute.match(/^\/listen\/(pvkh-\d{3})\/$/)?.[1];
      if (smartSlug) {
        const expectedRelease = catalog.releases.find((release) => release.slug === smartSlug);
        const releaseCopy = COPY[locale.code].pages.release;
        const smartContract = await page.evaluate(() => {
          const targets = [...document.querySelectorAll('[data-release-cta="streaming"]')].map((cta) => {
            const rect = cta.getBoundingClientRect();
            return {
              service: cta.dataset.streamingService || null,
              href: cta.href,
              target: cta.getAttribute("target"),
              rel: cta.getAttribute("rel"),
              ariaLabel: cta.getAttribute("aria-label"),
              visibleLabel: cta.querySelector(".streaming-label")?.textContent.trim() || null,
              width: rect.width,
              height: rect.height,
              scrollWidth: cta.scrollWidth,
              scrollHeight: cta.scrollHeight,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom
            };
          });
          const gaps = [];
          for (let first = 0; first < targets.length; first += 1) {
            for (let second = first + 1; second < targets.length; second += 1) {
              const a = targets[first];
              const b = targets[second];
              const dx = Math.max(a.left - b.right, b.left - a.right, 0);
              const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
              gaps.push(Math.hypot(dx, dy));
            }
          }
          return {
            id: document.querySelector("[data-smart-release-id]")?.dataset.smartReleaseId || null,
            releaseTitle: document.querySelector(".smartlink-release")?.textContent.trim() || null,
            releaseTitleLang: document.querySelector(".smartlink-release")?.getAttribute("lang") || null,
            releaseMarkers: document.querySelectorAll("[data-release-id]").length,
            musicRecordingCount: [...document.querySelectorAll('script[type="application/ld+json"]')]
              .map((script) => JSON.parse(script.textContent))
              .flatMap((data) => data["@graph"] || [])
              .filter((item) => item["@type"] === "MusicRecording").length,
            streamingNavLabel: document.querySelector(".streaming-links")?.getAttribute("aria-label") || null,
            backHref: document.querySelector("[data-smart-back]")?.href || null,
            currentPrimaryPath: document.querySelector('.desktop-nav .nav-link[aria-current="page"]')
              ? new URL(document.querySelector('.desktop-nav .nav-link[aria-current="page"]').href).pathname
              : null,
            targets,
            gaps
          };
        });
        if (!expectedRelease || smartContract.id !== expectedRelease.id || smartContract.releaseTitle !== expectedRelease.title
          || smartContract.releaseMarkers !== 0 || smartContract.musicRecordingCount !== 0) {
          fail(`${label}: smart-link identity contract mismatch ${JSON.stringify(smartContract)}`);
        }
        if (smartContract.releaseTitleLang !== expectedRelease?.titleLanguage) {
          fail(`${label}: smart-link title lang is ${smartContract.releaseTitleLang}, expected ${expectedRelease?.titleLanguage}`);
        }
        const expectedLinks = expectedRelease?.streamingLinks || [];
        if (JSON.stringify(smartContract.targets.map(({ service }) => service)) !== JSON.stringify(expectedLinks.map(({ service }) => service))) {
          fail(`${label}: smart-link service order does not match source data ${JSON.stringify(smartContract.targets)}`);
        }
        if (!smartContract.streamingNavLabel) fail(`${label}: smart-link chooser has no accessible label`);
        const expectedSmartNavLabel = interpolate(releaseCopy.streamingLabel, { title: expectedRelease?.title || "" });
        if (smartContract.streamingNavLabel !== expectedSmartNavLabel) fail(`${label}: localized smart-link chooser label mismatch`);
        if (new Set(smartContract.targets.map(({ href }) => href)).size !== smartContract.targets.length) fail(`${label}: smart-link destinations must be unique`);
        if (smartContract.targets.some(({ ariaLabel }) => !ariaLabel)) fail(`${label}: smart-link CTA has no accessible name`);
        const expectedBackPath = localizedPath(locale, `/catalog/${expectedRelease?.slug}/`);
        if (!smartContract.backHref || new URL(smartContract.backHref).origin !== baseUrl || new URL(smartContract.backHref).pathname !== expectedBackPath) {
          fail(`${label}: smart-link return must stay local at ${expectedBackPath}`);
        }
        if (smartContract.currentPrimaryPath !== localizedPath(locale, "/catalog/")) {
          fail(`${label}: smart-link primary navigation must identify Catalog as current`);
        }
        for (const expectedLink of expectedLinks) {
          const actual = smartContract.targets.find(({ service }) => service === expectedLink.service);
          const relTokens = new Set((actual?.rel || "").split(/\s+/).filter(Boolean));
          if (!actual || actual.href !== expectedLink.url || actual.target !== "_blank" || !relTokens.has("noopener") || !relTokens.has("noreferrer")) {
            fail(`${label}: smart-link ${expectedLink.service} contract mismatch ${JSON.stringify(actual)}`);
          }
          const serviceLabel = releaseCopy.services[expectedLink.service];
          const expectedAriaLabel = interpolate(releaseCopy.serviceAria, { title: expectedRelease.title, service: serviceLabel });
          if (actual?.visibleLabel !== serviceLabel || actual?.ariaLabel !== expectedAriaLabel) {
            fail(`${label}: smart-link ${expectedLink.service} localized label mismatch ${JSON.stringify(actual)}`);
          }
        }
        if (smartContract.targets.some(({ width, height }) => width < 44 || height < 44)) {
          fail(`${label}: smart-link target is below 44×44px ${JSON.stringify(smartContract.targets)}`);
        }
        if (smartContract.targets.some(({ width, height, scrollWidth, scrollHeight }) => scrollWidth > width + 0.5 || scrollHeight > height + 0.5)) {
          fail(`${label}: smart-link CTA content is clipped ${JSON.stringify(smartContract.targets)}`);
        }
        if (smartContract.gaps.some((gap) => gap < 8)) fail(`${label}: smart-link target gap is below 8px ${JSON.stringify(smartContract.gaps)}`);
      }

      const navVisibility = await page.evaluate(() => {
        const desktop = document.querySelector(".desktop-nav");
        const index = document.querySelector("details[data-site-index]");
        const header = document.querySelector(".site-header");
        return {
          desktop: desktop ? getComputedStyle(desktop).display : null,
          desktopLinks: desktop?.querySelectorAll(":scope .nav-link").length || 0,
          index: index ? getComputedStyle(index).display : null,
          indexCount: document.querySelectorAll("details[data-site-index]").length,
          indexOpen: index?.open,
          mobileNavCount: document.querySelectorAll(".mobile-nav").length,
          headerHeight: header?.getBoundingClientRect().height || 0
        };
      });
      if (viewport.width < 1280 && navVisibility.desktop !== "none") fail(`${label}: primary desktop navigation visible below 1280px`);
      if (viewport.width >= 1280 && navVisibility.desktop === "none") fail(`${label}: primary desktop navigation hidden at or above 1280px`);
      if (navVisibility.desktop === null || navVisibility.desktopLinks !== 4
        || navVisibility.index === null || navVisibility.index === "none"
        || navVisibility.indexCount !== 1 || navVisibility.indexOpen !== false
        || navVisibility.mobileNavCount !== 0) {
        fail(`${label}: simplified navigation contract failed ${JSON.stringify(navVisibility)}`);
      }
      if (viewport.width <= 375 && navVisibility.headerHeight > 80) {
        fail(`${label}: closed mobile header is ${navVisibility.headerHeight.toFixed(1)}px tall`);
      }

      await page.locator("details[data-site-index] > summary").click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const languageTargetMetrics = await page.locator("nav[data-language-switcher] .language-link").evaluateAll((links) => {
        const targets = links.map((link) => {
          const style = getComputedStyle(link);
          const rect = link.getBoundingClientRect();
          return {
            lang: link.getAttribute("hreflang"),
            width: rect.width,
            height: rect.height,
            visible: style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
          };
        });
        const gaps = [];
        for (let index = 1; index < targets.length; index += 1) {
          const previous = targets[index - 1];
          const current = targets[index];
          const dx = Math.max(previous.left - current.right, current.left - previous.right, 0);
          const dy = Math.max(previous.top - current.bottom, current.top - previous.bottom, 0);
          gaps.push(Math.hypot(dx, dy));
        }
        return { targets, gaps };
      });
      for (const target of languageTargetMetrics.targets) {
        if (!target.visible) fail(`${label}: ${target.lang} language target is not visible`);
        if (target.width < 44 || target.height < 44) {
          fail(`${label}: ${target.lang} language target is ${target.width.toFixed(2)}×${target.height.toFixed(2)}, minimum is 44×44`);
        }
      }
      if (languageTargetMetrics.gaps.some((gap) => gap < 8)) {
        fail(`${label}: language target gaps are ${languageTargetMetrics.gaps.map((gap) => gap.toFixed(2)).join(", ")}, minimum is 8px`);
      }
      await page.locator("details[data-site-index] > summary").click();

      if (viewport.width === 375 || viewport.width === 1440) {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        axeScans += 1;
        if (results.violations.length) {
          fail(`${label}: axe ${results.violations.map((item) => `${item.id}(${item.nodes.length})`).join(", ")}`);
        }
      }

      const screenshotName = screenshotCases.get(`${route}@${viewport.name}`);
      if (screenshotName) {
        if (baseRoute === "/links/") await page.mouse.move(1, 1);
        await page.evaluate(async () => {
          await Promise.all([...document.querySelectorAll("[data-motion-video]")].map((video) => new Promise((resolve) => {
            video.pause();
            if (video.readyState < 1) {
              resolve();
              return;
            }
            const done = () => resolve();
            video.addEventListener("seeked", done, { once: true });
            video.currentTime = 0;
            setTimeout(done, 250);
          })));
        });
        await page.screenshot({ path: path.join(screenshotDir, screenshotName), fullPage: true });
      }
      viewportChecks += 1;
    }

    if (consoleErrors.length) fail(`${viewport.name}: console errors: ${[...new Set(consoleErrors)].join(" | ")}`);
    if (pageErrors.length) fail(`${viewport.name}: page errors: ${[...new Set(pageErrors)].join(" | ")}`);
    await context.close();
  }

  for (const viewport of [
    { name: "320", width: 320, height: 780 },
    { name: "1024", width: 1024, height: 900 },
    { name: "1440", width: 1440, height: 1000 }
  ]) {
    const fallbackContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    await fallbackContext.route(/\.ttf(?:$|\?)/, (route) => route.abort("failed"));
    const fallbackPage = await fallbackContext.newPage();

    for (const { route } of routeCases) {
      const response = await fallbackPage.goto(`${baseUrl}${route}`, { waitUntil: "load" });
      await fallbackPage.evaluate(() => document.fonts.ready);
      const label = `${route} @ ${viewport.width}×${viewport.height} / font fallback`;
      if (!response || response.status() !== 200) fail(`${label}: HTTP ${response?.status() ?? "no response"}`);
      const metrics = await fallbackPage.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth
      }));
      if (metrics.documentOverflow > 1 || metrics.bodyOverflow > 1) {
        fail(`${label}: horizontal overflow ${JSON.stringify(metrics)}`);
      }
      const typographyIssues = await fallbackPage.evaluate(inspectDisplayTypography);
      if (typographyIssues.length) {
        fail(`${label}: display typography ${JSON.stringify(typographyIssues.slice(0, 6))}`);
      }
      if (viewport.width === 320 && (route === "/" || route === "/it/" || route === "/ru/")) {
        const localeName = route === "/" ? "en" : route.slice(1, 3);
        await fallbackPage.screenshot({
          path: path.join(screenshotDir, `home-${localeName}-font-fallback-320.png`),
          fullPage: true
        });
      }
      fallbackTypographyChecks += 1;
    }
    await fallbackContext.close();
  }

  const interactionContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const interactionPage = await interactionContext.newPage();
  await interactionPage.goto(baseUrl, { waitUntil: "load" });
  const motionHydration = await interactionPage.locator("[data-motion-video]").evaluateAll((videos) => videos.map((video) => ({
    className: video.className,
    state: video.dataset.motionState,
    sources: [...video.querySelectorAll("source")].map((source) => source.getAttribute("src"))
  })));
  if (motionHydration.length !== 2
    || motionHydration.some(({ state, sources }) => state === "disabled" || sources.length !== 2 || sources.some((source) => !source))
    || motionHydration.find(({ className }) => className.includes("hero-motion"))?.sources.some((source) => !source.includes("_MOBILE_640x360_"))) {
    fail(`Motion: mobile mode did not hydrate the lightweight decorative sources ${JSON.stringify(motionHydration)}`);
  }
  await interactionPage.keyboard.press("Tab");
  if (!await interactionPage.locator(".skip-link").evaluate((element) => element === document.activeElement)) {
    fail("Keyboard: skip link is not the first focus target");
  }
  await interactionPage.keyboard.press("Enter");
  await interactionPage.waitForTimeout(50);
  const skippedMain = await interactionPage.locator("main").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: element === document.activeElement,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor
    };
  });
  if (!skippedMain.focused || skippedMain.outlineStyle !== "solid" || skippedMain.outlineColor !== "rgb(243, 34, 34)") {
    fail(`Keyboard: skip link main focus is not visibly signal-red ${JSON.stringify(skippedMain)}`);
  }
  await interactionPage.locator(".menu-summary").focus();
  await interactionPage.keyboard.press("Enter");
  if (!await interactionPage.locator("[data-site-index]").evaluate((element) => element.open)) fail("Keyboard: site index did not open");
  await interactionPage.keyboard.press("Escape");
  if (await interactionPage.locator("[data-site-index]").evaluate((element) => element.open)) fail("Keyboard: Escape did not close site index");
  const focusStyle = await interactionPage.locator(".menu-summary").evaluate((element) => getComputedStyle(element).outlineStyle);
  if (focusStyle === "none") fail("Keyboard: focused menu control has no visible outline");

  await interactionPage.goto(`${baseUrl}/links/`, { waitUntil: "load" });
  const firstSocialAccess = interactionPage.locator("[data-social-access-link]").first();
  await firstSocialAccess.focus();
  const socialFocusStyle = await firstSocialAccess.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  if (socialFocusStyle.style === "none" || socialFocusStyle.width < 3) {
    fail(`Social access: focused channel has no 3px visible outline ${JSON.stringify(socialFocusStyle)}`);
  }
  const socialLanguageTargets = await interactionPage.locator("nav[data-language-switcher] .language-link").evaluateAll((links) => links.map((link) => ({
    lang: link.getAttribute("hreflang"),
    path: new URL(link.href).pathname,
    search: new URL(link.href).search,
    hash: new URL(link.href).hash
  })));
  if (JSON.stringify(socialLanguageTargets) !== JSON.stringify([
    { lang: "en", path: "/links/", search: "", hash: "" },
    { lang: "it", path: "/it/links/", search: "", hash: "" },
    { lang: "ru", path: "/ru/links/", search: "", hash: "" }
  ])) {
    fail(`Social access: language targets do not preserve route identity ${JSON.stringify(socialLanguageTargets)}`);
  }

  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/`),
    interactionPage.locator(".brand-link").click()
  ]);
  const socialHomeIdentity = await interactionPage.evaluate(() => ({
    path: location.pathname,
    bodyClass: document.body.className,
    heading: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
    hasSocialAccess: Boolean(document.querySelector(".social-access-terminal")),
    activeNav: document.querySelector(".desktop-nav .nav-link[aria-current='page']")?.textContent?.trim() || ""
  }));
  if (socialHomeIdentity.path !== "/"
    || !socialHomeIdentity.bodyClass.split(/\s+/).includes("page-home")
    || socialHomeIdentity.heading !== COPY.en.pages.home.heroTitle.join(" ")
    || socialHomeIdentity.hasSocialAccess
    || socialHomeIdentity.activeNav !== COPY.en.common.nav.home) {
    fail(`Social access: Home must restore the original home route ${JSON.stringify(socialHomeIdentity)}`);
  }

  await interactionPage.goto(`${baseUrl}/links/`, { waitUntil: "load" });
  await interactionPage.locator("[data-site-index] > summary").click();
  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/ru/links/`),
    interactionPage.locator('nav[data-language-switcher] .language-link[hreflang="ru"]').click()
  ]);
  const russianSocialIdentity = await interactionPage.evaluate(() => ({
    lang: document.documentElement.lang,
    path: location.pathname,
    ids: [...document.querySelectorAll("[data-social-access-link]")].map((link) => link.dataset.socialId),
    hrefs: [...document.querySelectorAll("[data-social-access-link]")].map((link) => link.href)
  }));
  if (russianSocialIdentity.lang !== "ru"
    || russianSocialIdentity.path !== "/ru/links/"
    || JSON.stringify(russianSocialIdentity.ids) !== JSON.stringify(SOCIAL_LINKS.map(({ id }) => id))
    || JSON.stringify(russianSocialIdentity.hrefs) !== JSON.stringify(SOCIAL_LINKS.map(({ url }) => url))) {
    fail(`Social access: Russian language switch changed route or destination identity ${JSON.stringify(russianSocialIdentity)}`);
  }

  await interactionPage.goto(`${baseUrl}/catalog/`, { waitUntil: "load" });
  const upcomingFilter = interactionPage.locator('[data-filter-value="upcoming"]');
  await upcomingFilter.focus();
  await interactionPage.keyboard.press("Space");
  if (await upcomingFilter.getAttribute("aria-pressed") !== "true") fail("Catalog filter: upcoming button did not become active by keyboard");
  if (await interactionPage.locator("[data-release-card]:visible").count() !== upcomingReleaseCount) {
    fail(`Catalog filter: upcoming view must expose exactly ${upcomingReleaseCount} cards`);
  }
  if (await interactionPage.locator("[data-release-card][hidden]").count() !== catalog.releases.length - upcomingReleaseCount) {
    fail(`Catalog filter: upcoming view must hide exactly ${catalog.releases.length - upcomingReleaseCount} cards`);
  }
  await interactionPage.locator('[data-filter-value="published"]').click();
  if (await interactionPage.locator("[data-release-card]:visible").count() !== publishedReleaseCount) {
    fail(`Catalog filter: released view must expose exactly ${publishedReleaseCount} cards`);
  }
  await interactionPage.locator('[data-filter-value="all"]').click();
  if (await interactionPage.locator("[data-release-card]:visible").count() !== catalog.releases.length) {
    fail(`Catalog filter: all view must restore ${catalog.releases.length} cards`);
  }

  await interactionPage.goto(`${baseUrl}/catalog/pvkh-001/`, { waitUntil: "load" });
  await interactionPage.locator("[data-site-index] > summary").click();
  const italianLanguageLink = interactionPage.locator('nav[data-language-switcher] .language-link[hreflang="it"]');
  await italianLanguageLink.focus();
  const languageFocusStyle = await italianLanguageLink.evaluate((element) => getComputedStyle(element).outlineStyle);
  if (languageFocusStyle === "none") fail("Keyboard: focused language link has no visible outline");
  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/it/catalog/pvkh-001/`),
    interactionPage.keyboard.press("Enter")
  ]);
  if (await interactionPage.locator("html").getAttribute("lang") !== "it") fail("Language routing: EN → IT deep route has wrong html lang");
  await interactionPage.locator("[data-site-index] > summary").click();
  const russianLanguageLink = interactionPage.locator('nav[data-language-switcher] .language-link[hreflang="ru"]');
  await russianLanguageLink.focus();
  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/ru/catalog/pvkh-001/`),
    interactionPage.keyboard.press("Enter")
  ]);
  if (await interactionPage.locator("html").getAttribute("lang") !== "ru") fail("Language routing: IT → RU deep route has wrong html lang");
  if ((await interactionPage.locator("h1").textContent())?.trim() !== "PVKH-001") fail("Language routing: deep route changed page identity");
  if (await interactionPage.locator('nav[data-language-switcher] [aria-current="page"]').getAttribute("hreflang") !== "ru") {
    fail("Language routing: deep route switch did not update current language");
  }
  const smartLinkCta = interactionPage.locator('[data-streaming-service="allServices"]');
  await smartLinkCta.focus();
  if (await smartLinkCta.evaluate((element) => getComputedStyle(element).outlineStyle) === "none") {
    fail("Keyboard: focused all-services CTA has no visible outline");
  }
  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/ru/listen/pvkh-001/`),
    interactionPage.keyboard.press("Enter")
  ]);
  if (await interactionPage.locator('[data-smart-release-id="PVKH-001"]').count() !== 1) {
    fail("Smart link: keyboard navigation did not preserve release identity");
  }
  if (await interactionPage.locator('[data-release-cta="streaming"]').count() !== 3) {
    fail("Smart link: service chooser must expose exactly three direct destinations");
  }
  await interactionPage.locator("[data-site-index] > summary").click();
  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/listen/pvkh-001/`),
    interactionPage.locator('nav[data-language-switcher] .language-link[hreflang="en"]').click()
  ]);
  if (await interactionPage.locator('[data-smart-release-id="PVKH-001"]').count() !== 1) {
    fail("Smart link: language switch did not preserve smart-link identity");
  }
  await interactionPage.goto(`${baseUrl}/ru/catalog/pvkh-013/`, { waitUntil: "load" });
  if ((await interactionPage.locator(".release-display-title").textContent())?.trim() !== "Все сон") {
    fail("Release identity: intentional title ‘Все сон’ was altered");
  }
  const finalRelease = catalog.releases.find((release) => release.id === "PVKH-013");
  if (await interactionPage.locator('[data-release-id="PVKH-013"]').getAttribute("data-release-status") !== finalRelease?.status) {
    fail("Release identity: PVKH-013 status does not match the approved snapshot");
  }
  await interactionContext.close();

  const audioContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const audioPage = await audioContext.newPage();
  const audioErrors = [];
  audioPage.on("pageerror", (error) => audioErrors.push(error.message));
  await audioPage.goto(baseUrl, { waitUntil: "load" });
  await audioPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.dataset.waveformState === "ready");
  const initialAudio = await audioPage.evaluate(() => ({
    state: document.querySelector("[data-audio-player]")?.dataset.state,
    paused: document.querySelector("[data-audio-engine]")?.paused,
    title: document.querySelector("[data-player-title]")?.textContent,
    artist: document.querySelector("[data-player-artist]")?.textContent,
    index: document.querySelector("[data-player-index]")?.textContent,
    hudIndex: document.querySelector("[data-hud-player-index]")?.textContent,
    trackCount: document.querySelectorAll("[data-player-track]").length,
    peaksReady: document.querySelector("[data-audio-player]")?.dataset.waveformState,
    mediaTitle: navigator.mediaSession?.metadata?.title || null,
    volume: document.querySelector("[data-audio-engine]")?.volume,
    volumeValue: document.querySelector("[data-player-volume-value]")?.textContent,
    volumeExpanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded")
  }));
  await audioPage.mouse.click(700, 760);
  await audioPage.waitForTimeout(120);
  if (!await audioPage.locator("[data-audio-engine]").evaluate((audio) => audio.paused)) {
    fail("Audio player: a random page click started playback");
  }
  const volumeToggle = await advancedControl(audioPage, "[data-player-volume-toggle]");
  const volumeRange = audioPage.locator("[data-player-volume]");
  await volumeToggle.click();
  const volumeOpen = await audioPage.evaluate(() => ({
    expanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded"),
    hidden: document.querySelector("[data-player-volume-popup]")?.hidden
  }));
  await audioPage.screenshot({ path: path.join(screenshotDir, "player-volume-desktop-1440.png") });
  await volumeRange.evaluate((range, value) => {
    range.value = value;
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }, "35");
  const volumeChanged = await audioPage.evaluate(() => ({
    audio: document.querySelector("[data-audio-engine]")?.volume,
    value: document.querySelector("[data-player-volume-value]")?.textContent,
    percent: document.querySelector("[data-player-volume-percent]")?.textContent,
    saved: localStorage.getItem("povkh-lab-player-volume-v1"),
    popupHidden: document.querySelector("[data-player-volume-popup]")?.hidden
  }));
  await volumeRange.evaluate((range, value) => {
    range.value = value;
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }, "0");
  const zeroVolume = await audioPage.evaluate(() => ({
    audio: document.querySelector("[data-audio-engine]")?.volume,
    value: document.querySelector("[data-player-volume-value]")?.textContent,
    percent: document.querySelector("[data-player-volume-percent]")?.textContent
  }));
  await volumeRange.evaluate((range, value) => {
    range.value = value;
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }, "35");
  await audioPage.keyboard.press("Escape");
  const volumeClosed = await audioPage.evaluate(() => ({
    expanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded"),
    hidden: document.querySelector("[data-player-volume-popup]")?.hidden,
    focusReturned: document.activeElement?.hasAttribute("data-player-volume-toggle")
  }));
  await ensurePlayerTrayOpen(audioPage);
  await volumeToggle.click();
  await audioPage.mouse.click(700, 760);
  const volumeOutsideClosed = await audioPage.evaluate(() => ({
    expanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded"),
    hidden: document.querySelector("[data-player-volume-popup]")?.hidden
  }));
  await ensurePlayerTrayOpen(audioPage);
  await volumeToggle.focus();
  await audioPage.keyboard.press("Space");
  const keyboardVolumeOpen = await audioPage.evaluate(() => ({
    popupHidden: document.querySelector("[data-player-volume-popup]")?.hidden,
    focusedRange: document.activeElement?.hasAttribute("data-player-volume")
  }));
  await audioPage.keyboard.press("Shift+Tab");
  const keyboardVolumeToggleFocused = await audioPage.evaluate(() => document.activeElement?.hasAttribute("data-player-volume-toggle"));
  await audioPage.keyboard.press("Tab");
  const keyboardVolumeRangeFocused = await audioPage.evaluate(() => document.activeElement?.hasAttribute("data-player-volume"));
  await audioPage.keyboard.press("ArrowLeft");
  const keyboardVolumeLowered = await audioPage.evaluate(() => ({
    audio: document.querySelector("[data-audio-engine]")?.volume,
    range: document.querySelector("[data-player-volume]")?.value,
    value: document.querySelector("[data-player-volume-value]")?.textContent,
    percent: document.querySelector("[data-player-volume-percent]")?.textContent,
    ariaValueText: document.querySelector("[data-player-volume]")?.getAttribute("aria-valuetext")
  }));
  await audioPage.keyboard.press("ArrowRight");
  await audioPage.keyboard.press("Escape");
  await audioPage.locator("[data-player-toggle]").click();
  await audioPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.dataset.playing === "true");
  await audioPage.waitForTimeout(350);
  const playingAudio = await audioPage.evaluate(() => ({
    paused: document.querySelector("[data-audio-engine]")?.paused,
    currentTime: document.querySelector("[data-audio-engine]")?.currentTime,
    state: document.querySelector("[data-audio-player]")?.dataset.state
  }));
  await audioPage.locator("[data-player-toggle]").click();
  const pausedAudio = await audioPage.evaluate(() => ({
    paused: document.querySelector("[data-audio-engine]")?.paused,
    userPaused: document.querySelector("[data-audio-player]")?.dataset.userPaused
  }));
  const waveform = await advancedControl(audioPage, "[data-player-waveform]");
  await waveform.focus();
  await audioPage.keyboard.press("End");
  const endTime = await audioPage.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
  await audioPage.keyboard.press("Home");
  const homeTime = await audioPage.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
  await audioPage.keyboard.press("ArrowRight");
  const arrowTime = await audioPage.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
  const waveformBox = await waveform.boundingBox();
  if (!waveformBox) fail("Audio timeline: waveform has no pointer box");
  else {
    await audioPage.mouse.move(waveformBox.x + waveformBox.width * 0.25, waveformBox.y + waveformBox.height / 2);
    const hoverTooltip = await audioPage.evaluate(() => ({
      hidden: document.querySelector("[data-player-seek-tooltip]")?.hidden,
      text: document.querySelector("[data-player-seek-tooltip]")?.textContent
    }));
    await audioPage.mouse.down();
    await audioPage.mouse.move(waveformBox.x + waveformBox.width * 0.75, waveformBox.y + waveformBox.height / 2, { steps: 6 });
    const dragTime = await audioPage.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
    await audioPage.screenshot({ path: path.join(screenshotDir, "player-timeline-scrub-1440.png") });
    await audioPage.mouse.up();
    if (hoverTooltip.hidden || !/^\d{2}:\d{2}$/.test(hoverTooltip.text || "")
      || Math.abs(dragTime - defaultAudioTrack.duration * 0.75) > 1.2) {
      fail(`Audio timeline: pointer contract failed ${JSON.stringify({ hoverTooltip, dragTime })}`);
    }
  }
  await (await advancedControl(audioPage, "[data-player-next]")).click();
  await audioPage.waitForFunction(() => document.querySelector("[data-player-title]")?.textContent === "ROBERT"
    && document.querySelector("[data-audio-player]")?.dataset.waveformState === "ready"
    && document.querySelector("[data-audio-engine]")?.currentSrc.endsWith("/assets/tracks/pvkh-008-robert.mp3"));
  const nextAudio = await audioPage.evaluate(() => ({
    title: document.querySelector("[data-player-title]")?.textContent,
    artist: document.querySelector("[data-player-artist]")?.textContent,
    index: document.querySelector("[data-player-index]")?.textContent,
    hudIndex: document.querySelector("[data-hud-player-index]")?.textContent,
    currentSrc: document.querySelector("[data-audio-engine]")?.currentSrc,
    mediaTitle: navigator.mediaSession?.metadata?.title || null
  }));
  if (await audioPage.locator("[data-audio-player]").getAttribute("data-playing") === "true") {
    await audioPage.locator("[data-player-toggle]").click();
  }
  await (await advancedControl(audioPage, "[data-player-prev]")).click();
  await audioPage.waitForFunction(() => document.querySelector("[data-player-title]")?.textContent === "OPPORTUNIST"
    && document.querySelector("[data-audio-player]")?.dataset.waveformState === "ready"
    && document.querySelector("[data-audio-engine]")?.currentSrc.endsWith("/assets/tracks/pvkh-007-opportunist.mp3"));
  const previousAudio = await audioPage.evaluate(() => ({
    title: document.querySelector("[data-player-title]")?.textContent,
    index: document.querySelector("[data-player-index]")?.textContent,
    currentSrc: document.querySelector("[data-audio-engine]")?.currentSrc
  }));
  await ensurePlayerTrayOpen(audioPage);
  const playlistOpen = await audioPage.evaluate(() => ({
    trackButtons: document.querySelectorAll("[data-player-select]").length,
    current: document.querySelectorAll('[data-player-select][aria-current="true"]').length,
    activeCatalogId: document.querySelector('[data-player-select][aria-current="true"]')?.closest("[data-player-track]")?.dataset.catalogId,
    hidden: document.querySelector("[data-player-tray]")?.hidden,
    expanded: document.querySelector("[data-player-tray-toggle]")?.getAttribute("aria-expanded")
  }));
  await audioPage.keyboard.press("Escape");
  const playlistFocusReturned = await audioPage.evaluate(() => document.activeElement?.hasAttribute("data-player-tray-toggle"));
  await (await advancedControl(audioPage, '[data-player-track][data-catalog-id="PVKH-012"] [data-player-select]')).click();
  await audioPage.waitForFunction(() => document.querySelector("[data-player-title]")?.textContent === "RUNWAY"
    && document.querySelector("[data-audio-engine]")?.currentSrc.endsWith("/assets/tracks/pvkh-012-runway.mp3")
    && document.querySelector("[data-player-tray]")?.hidden === true);
  const directAudio = await audioPage.evaluate(() => ({
    title: document.querySelector("[data-player-title]")?.textContent,
    index: document.querySelector("[data-player-index]")?.textContent,
    currentSrc: document.querySelector("[data-audio-engine]")?.currentSrc,
    currentCatalogId: document.querySelector('[data-player-select][aria-current="true"]')?.closest("[data-player-track]")?.dataset.catalogId
  }));
  if (await audioPage.locator("[data-audio-player]").getAttribute("data-playing") === "true") {
    await audioPage.locator("[data-player-toggle]").click();
  }
  await audioPage.locator("[data-player-toggle]").click();
  await audioPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.dataset.playing === "true");
  await audioPage.waitForTimeout(220);
  await audioPage.evaluate(() => { window.__qaPersistentAudio = document.querySelector("[data-audio-engine]"); });
  const persistentBefore = await audioPage.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
  await Promise.all([
    audioPage.waitForURL(`${baseUrl}/catalog/`),
    audioPage.locator('.desktop-nav a[href="./catalog/"]').click()
  ]);
  await audioPage.waitForFunction(() => document.body.classList.contains("page-catalog"));
  const persistentAfter = await audioPage.evaluate(() => ({
    sameNode: window.__qaPersistentAudio === document.querySelector("[data-audio-engine]"),
    currentTime: document.querySelector("[data-audio-engine]")?.currentTime,
    currentSrc: document.querySelector("[data-audio-engine]")?.currentSrc,
    playing: document.querySelector("[data-audio-player]")?.dataset.playing,
    playerCount: document.querySelectorAll("[data-audio-player]").length,
    routeMainCount: document.querySelectorAll("[data-route-main]").length,
    volume: document.querySelector("[data-audio-engine]")?.volume,
    volumeValue: document.querySelector("[data-player-volume-value]")?.textContent,
    volumeExpanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded")
  }));
  await audioPage.goBack();
  await audioPage.waitForURL(baseUrl + "/");
  const persistentBack = await audioPage.evaluate(() => ({
    sameNode: window.__qaPersistentAudio === document.querySelector("[data-audio-engine]"),
    title: document.querySelector("[data-player-title]")?.textContent,
    playerCount: document.querySelectorAll("[data-audio-player]").length
  }));
  const russianBefore = await audioPage.evaluate(() => ({
    currentTime: document.querySelector("[data-audio-engine]")?.currentTime,
    paused: document.querySelector("[data-audio-engine]")?.paused,
    playing: document.querySelector("[data-audio-player]")?.dataset.playing,
    volume: document.querySelector("[data-audio-engine]")?.volume,
    popupHidden: document.querySelector("[data-player-volume-popup]")?.hidden,
    expanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded")
  }));
  await audioPage.evaluate(() => { window.__qaRussianAudio = document.querySelector("[data-audio-engine]"); });
  await audioPage.locator("[data-site-index] > summary").click();
  await Promise.all([
    audioPage.waitForURL(`${baseUrl}/ru/`),
    audioPage.locator('nav[data-language-switcher] .language-link[hreflang="ru"]').click()
  ]);
  await audioPage.waitForTimeout(220);
  const russianAfter = await audioPage.evaluate(() => ({
    sameNode: window.__qaRussianAudio === document.querySelector("[data-audio-engine]"),
    currentTime: document.querySelector("[data-audio-engine]")?.currentTime,
    paused: document.querySelector("[data-audio-engine]")?.paused,
    playing: document.querySelector("[data-audio-player]")?.dataset.playing,
    volume: document.querySelector("[data-audio-engine]")?.volume,
    volumeValue: document.querySelector("[data-player-volume-value]")?.textContent,
    popupHidden: document.querySelector("[data-player-volume-popup]")?.hidden,
    expanded: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-expanded"),
    toggleLabel: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-label"),
    rangeValueText: document.querySelector("[data-player-volume]")?.getAttribute("aria-valuetext"),
    controlLabel: document.querySelector("[data-player-volume-label]")?.textContent
  }));
  const russianVolumeLabel = await audioPage.locator("[data-player-volume-toggle]")
    .getAttribute("aria-label");
  if (await audioPage.locator("[data-audio-player]").getAttribute("data-playing") === "true") {
    await audioPage.locator("[data-player-toggle]").click();
  }
  if (!initialAudio.paused || initialAudio.title !== "OPPORTUNIST" || initialAudio.artist !== "ALESSANDRO POVKH & K/SMOKIN"
    || initialAudio.index !== "07 / 13" || initialAudio.hudIndex !== "07 / 13" || initialAudio.trackCount !== 13
    || initialAudio.peaksReady !== "ready" || initialAudio.mediaTitle !== "OPPORTUNIST"
    || Math.abs(initialAudio.volume - 0.6) > 0.001 || initialAudio.volumeValue !== "60" || initialAudio.volumeExpanded !== "false"
    || volumeOpen.expanded !== "true" || volumeOpen.hidden
    || Math.abs(volumeChanged.audio - 0.35) > 0.001 || volumeChanged.value !== "35" || volumeChanged.percent !== "35%"
    || volumeChanged.saved !== "0.35" || volumeChanged.popupHidden
    || zeroVolume.audio !== 0 || zeroVolume.value !== "00" || zeroVolume.percent !== "0%"
    || volumeClosed.expanded !== "false" || !volumeClosed.hidden || !volumeClosed.focusReturned
    || volumeOutsideClosed.expanded !== "false" || !volumeOutsideClosed.hidden
    || keyboardVolumeOpen.popupHidden || !keyboardVolumeOpen.focusedRange || !keyboardVolumeToggleFocused || !keyboardVolumeRangeFocused
    || Math.abs(keyboardVolumeLowered.audio - 0.34) > 0.001 || keyboardVolumeLowered.range !== "34"
    || keyboardVolumeLowered.value !== "34" || keyboardVolumeLowered.percent !== "34%" || keyboardVolumeLowered.ariaValueText !== "34%"
    || playingAudio.paused || playingAudio.currentTime <= 0 || playingAudio.state !== "playing"
    || endTime < defaultAudioTrack.duration - 0.2 || homeTime > 0.05 || Math.abs(arrowTime - 5) > 0.15
    || !pausedAudio.paused || pausedAudio.userPaused !== "true"
    || nextAudio.title !== "ROBERT" || nextAudio.artist !== "LEVO.MP3" || nextAudio.index !== "08 / 13" || nextAudio.hudIndex !== "08 / 13"
    || !nextAudio.currentSrc?.endsWith("/assets/tracks/pvkh-008-robert.mp3") || nextAudio.mediaTitle !== "ROBERT"
    || previousAudio.title !== "OPPORTUNIST" || previousAudio.index !== "07 / 13"
    || !previousAudio.currentSrc?.endsWith("/assets/tracks/pvkh-007-opportunist.mp3")
    || playlistOpen.trackButtons !== 13 || playlistOpen.current !== 1 || playlistOpen.activeCatalogId !== "PVKH-007"
    || playlistOpen.hidden || playlistOpen.expanded !== "true" || !playlistFocusReturned
    || directAudio.title !== "RUNWAY" || directAudio.index !== "12 / 13" || directAudio.currentCatalogId !== "PVKH-012"
    || !directAudio.currentSrc?.endsWith("/assets/tracks/pvkh-012-runway.mp3")
    || !persistentAfter.sameNode || persistentAfter.currentTime < persistentBefore || persistentAfter.playing !== "true"
    || !persistentAfter.currentSrc?.endsWith("/assets/tracks/pvkh-012-runway.mp3") || persistentAfter.playerCount !== 1 || persistentAfter.routeMainCount !== 1
    || Math.abs(persistentAfter.volume - 0.35) > 0.001 || persistentAfter.volumeValue !== "35" || persistentAfter.volumeExpanded !== "false"
    || !persistentBack.sameNode || persistentBack.title !== "RUNWAY" || persistentBack.playerCount !== 1
    || !russianVolumeLabel?.startsWith("Громкость:")
    || !russianAfter.sameNode || russianAfter.paused !== russianBefore.paused || russianAfter.playing !== russianBefore.playing
    || russianAfter.currentTime <= russianBefore.currentTime || Math.abs(russianAfter.volume - russianBefore.volume) > 0.001
    || russianAfter.volumeValue !== "35" || !russianAfter.popupHidden || russianAfter.expanded !== "false"
    || !russianAfter.toggleLabel?.startsWith("Громкость:") || russianAfter.rangeValueText !== "35%"
    || russianAfter.controlLabel?.trim() !== "Регулятор громкости"
    || audioErrors.length) {
    fail(`Audio player contract failed ${JSON.stringify({ initialAudio, volumeOpen, volumeChanged, zeroVolume, volumeClosed, volumeOutsideClosed, keyboardVolumeOpen, keyboardVolumeToggleFocused, keyboardVolumeRangeFocused, keyboardVolumeLowered, playingAudio, endTime, homeTime, arrowTime, pausedAudio, nextAudio, previousAudio, playlistOpen, playlistFocusReturned, directAudio, persistentBefore, persistentAfter, persistentBack, russianBefore, russianAfter, russianVolumeLabel, audioErrors })}`);
  }
  await audioContext.close();

  const fallbackWaveformContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fallbackWaveformPage = await fallbackWaveformContext.newPage();
  await fallbackWaveformPage.route("**/*.waveform.json", (route) => route.abort());
  await fallbackWaveformPage.goto(baseUrl, { waitUntil: "load" });
  await fallbackWaveformPage.waitForFunction(
    () => document.querySelector("[data-audio-player]")?.dataset.waveformState === "error"
  );
  const fallbackWaveform = await advancedControl(fallbackWaveformPage, "[data-player-waveform]");
  const fallbackBox = await fallbackWaveform.boundingBox();
  if (!fallbackBox) {
    fail("Fallback waveform: seek canvas has no pointer box");
  } else {
    await fallbackWaveformPage.mouse.click(
      fallbackBox.x + fallbackBox.width * 0.25,
      fallbackBox.y + fallbackBox.height * 0.5
    );
    await fallbackWaveformPage.locator("[data-player-toggle]").click();
    await fallbackWaveformPage.waitForFunction(
      () => document.querySelector("[data-audio-engine]")?.readyState >= 1
    );
    const fallbackSeekTime = await fallbackWaveformPage.locator("[data-audio-engine]")
      .evaluate((audio) => audio.currentTime);
    if (Math.abs(fallbackSeekTime - defaultAudioTrack.duration * 0.25) > 1.2) {
      fail(`Fallback waveform: seek restored ${fallbackSeekTime}`);
    }
  }
  await fallbackWaveformContext.close();

  const savedVolumeContext = await browser.newContext();
  await savedVolumeContext.addInitScript(() => {
    localStorage.setItem("povkh-lab-player-volume-v1", "0.35");
  });
  const savedVolumePage = await savedVolumeContext.newPage();
  await savedVolumePage.goto(baseUrl, { waitUntil: "load" });
  const savedVolume = await savedVolumePage.evaluate(() => ({
    audio: document.querySelector("[data-audio-engine]")?.volume,
    range: document.querySelector("[data-player-volume]")?.value,
    value: document.querySelector("[data-player-volume-value]")?.textContent,
    percent: document.querySelector("[data-player-volume-percent]")?.textContent,
    ariaValueText: document.querySelector("[data-player-volume]")?.getAttribute("aria-valuetext"),
    toggleLabel: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-label")
  }));
  if (Math.abs(savedVolume.audio - 0.35) > 0.001 || savedVolume.range !== "35"
    || savedVolume.value !== "35" || savedVolume.percent !== "35%" || savedVolume.ariaValueText !== "35%"
    || savedVolume.toggleLabel !== "Volume: 35%") {
    fail(`Audio volume: valid storage did not restore ${JSON.stringify(savedVolume)}`);
  }
  await savedVolumeContext.close();

  const invalidVolumeContext = await browser.newContext();
  await invalidVolumeContext.addInitScript(() => {
    localStorage.setItem("povkh-lab-player-volume-v1", "not-a-volume");
  });
  const invalidVolumePage = await invalidVolumeContext.newPage();
  await invalidVolumePage.goto(baseUrl, { waitUntil: "load" });
  const invalidVolume = await invalidVolumePage.locator("[data-audio-engine]")
    .evaluate((audio) => audio.volume);
  if (Math.abs(invalidVolume - 0.6) > 0.001) {
    fail(`Audio volume: invalid storage restored ${invalidVolume} instead of 0.6`);
  }
  await invalidVolumeContext.close();

  const malformedVolumeContext = await browser.newContext();
  await malformedVolumeContext.addInitScript(() => {
    localStorage.setItem("povkh-lab-player-volume-v1", "0.35garbage");
  });
  const malformedVolumePage = await malformedVolumeContext.newPage();
  await malformedVolumePage.goto(baseUrl, { waitUntil: "load" });
  const malformedVolume = await malformedVolumePage.locator("[data-audio-engine]")
    .evaluate((audio) => audio.volume);
  if (Math.abs(malformedVolume - 0.6) > 0.001) {
    fail(`Audio volume: malformed storage restored ${malformedVolume} instead of 0.6`);
  }
  await malformedVolumeContext.close();

  const unavailableVolumeContext = await browser.newContext();
  await unavailableVolumeContext.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
  });
  const unavailableVolumePage = await unavailableVolumeContext.newPage();
  await unavailableVolumePage.goto(baseUrl, { waitUntil: "load" });
  const unavailableVolume = await unavailableVolumePage.locator("[data-audio-engine]")
    .evaluate((audio) => audio.volume);
  if (Math.abs(unavailableVolume - 0.6) > 0.001) {
    fail(`Audio volume: unavailable storage restored ${unavailableVolume} instead of 0.6`);
  }
  await unavailableVolumeContext.close();

  for (const width of [320, 375]) {
    const mobileVolumeContext = await browser.newContext({ viewport: { width, height: 812 } });
    const mobileVolumePage = await mobileVolumeContext.newPage();
    await mobileVolumePage.goto(baseUrl, { waitUntil: "load" });
    await (await advancedControl(mobileVolumePage, "[data-player-volume-toggle]")).click();
    const mobileVolume = await mobileVolumePage.evaluate(() => {
      const rect = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect && {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left
        };
      };
      const popup = rect("[data-player-volume-popup]");
      const title = rect("[data-player-title]");
      return {
        button: rect("[data-player-volume-toggle]"),
        range: rect("[data-player-volume]"),
        waveform: rect("[data-player-waveform]"),
        waveformTouchAction: getComputedStyle(document.querySelector("[data-player-waveform]")).touchAction,
        popup,
        title,
        player: rect("[data-audio-player]"),
        popupHidden: document.querySelector("[data-player-volume-popup]")?.hidden,
        overlapsTitle: Boolean(popup && title && popup.left < title.right && popup.right > title.left
          && popup.top < title.bottom && popup.bottom > title.top),
        viewport: innerWidth
      };
    });
    if (mobileVolume.popupHidden || !mobileVolume.button || !mobileVolume.range || !mobileVolume.waveform || !mobileVolume.popup || !mobileVolume.title || !mobileVolume.player
      || mobileVolume.button.height < 44 || mobileVolume.range.height < 44 || mobileVolume.waveform.height < 44
      || mobileVolume.waveformTouchAction !== "pan-y"
      || mobileVolume.popup.left < 0 || mobileVolume.popup.right > mobileVolume.viewport
      || mobileVolume.overlapsTitle || mobileVolume.player.height > 72) {
      fail(`Mobile audio volume ${width}px: invalid popup geometry ${JSON.stringify(mobileVolume)}`);
    }
    if (width === 375) {
      await mobileVolumePage.screenshot({ path: path.join(screenshotDir, "player-volume-mobile-375.png") });
    }
    await mobileVolumePage.goto(`${baseUrl}/merch/`, { waitUntil: "load" });
    const mobileMerchPlayer = await mobileVolumePage.evaluate(() => {
      const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
      const hero = document.querySelector(".merch-hero")?.getBoundingClientRect();
      return {
        player,
        hero,
        bodyPadding: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
        heroBottom: hero?.bottom ?? null
      };
    });
    if (!mobileMerchPlayer.player || !mobileMerchPlayer.hero || mobileMerchPlayer.player.height > 72
      || mobileMerchPlayer.bodyPadding < mobileMerchPlayer.player.height - 1) {
      fail(`Mobile audio player ${width}px: measured clearance failed ${JSON.stringify(mobileMerchPlayer)}`);
    }
    await mobileVolumeContext.close();
  }

  for (const { width, height } of [
    { width: 320, height: 780 },
    { width: 375, height: 812 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 }
  ]) {
    for (const textZoom of [false, true]) {
      const merchGeometryContext = await browser.newContext({ viewport: { width, height } });
      const merchGeometryPage = await merchGeometryContext.newPage();
      for (const route of ["/merch/", "/it/merch/", "/ru/merch/"]) {
        await merchGeometryPage.goto(`${baseUrl}${route}`, { waitUntil: "load" });
        if (textZoom) await applyTextZoom(merchGeometryPage);
        await merchGeometryPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
        const geometry = await merchGeometryPage.evaluate(() => {
          const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const title = document.querySelector("#merch-title");
          const range = document.createRange();
          if (title) range.selectNodeContents(title);
          const titleRanges = [...range.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map(({ top, right, bottom, left, width, height }) => ({ top, right, bottom, left, width, height }));
          const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
          const playerRect = player && {
            top: player.top, right: player.right, bottom: player.bottom, left: player.left,
            width: player.width, height: player.height
          };
          return {
            player: playerRect,
            titleRanges,
            intersections: playerRect ? titleRanges.filter((rect) => overlaps(playerRect, rect)) : [],
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        });
        if (!geometry.player || !geometry.titleRanges.length || geometry.intersections.length || geometry.overflow > 1) {
          fail(`Merch player geometry ${route} @ ${width}px${textZoom ? " 200% text zoom" : ""}: ${JSON.stringify(geometry)}`);
        }
      }
      await merchGeometryContext.close();
    }
  }

  const signalContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference"
  });
  const signalPage = await signalContext.newPage();
  await signalPage.goto(`${baseUrl}/catalog/`, { waitUntil: "load" });
  await signalPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.classList.contains("signal-field-ready"));
  await signalPage.waitForFunction(() => document.querySelector("[data-hud-baseline]")?.textContent === "Y 0000");
  const initialHud = await signalPage.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds ? { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left } : null;
    };
    const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const audio = rect("[data-audio-player]");
    const timeline = rect(".site-hud-timeline");
    const status = rect(".site-hud-status");
    return {
      catalogPanels: document.querySelectorAll(".site-hud-catalog").length,
      section: document.querySelector("[data-hud-section-current]")?.textContent,
      baseline: document.querySelector("[data-hud-baseline]")?.textContent,
      firstTick: document.querySelector("[data-hud-tick]")?.textContent,
      timelineHidden: document.querySelector("[data-hud-frame]")?.classList.contains("is-timeline-hidden"),
      timelineOpacity: getComputedStyle(document.querySelector(".site-hud-timeline")).opacity,
      crossTop: rect(".site-hud-cross")?.top,
      audioTop: audio?.top,
      timelineBottom: timeline?.bottom,
      overlapsTimeline: overlaps(audio, timeline),
      overlapsStatus: overlaps(audio, status)
    };
  });
  if (initialHud.catalogPanels !== 0 || initialHud.section !== "01" || initialHud.baseline !== "Y 0000"
    || initialHud.timelineHidden || initialHud.timelineOpacity !== "1"
    || initialHud.overlapsTimeline || initialHud.overlapsStatus
    || initialHud.audioTop < initialHud.timelineBottom) {
    fail(`HUD: invalid initial scroll/stacking contract ${JSON.stringify(initialHud)}`);
  }
  const initialSignal = await signalPage.evaluate(() => ({
    mode: document.querySelector("[data-signal-field]")?.dataset.signalMode,
    path: document.querySelector("[data-signal-panel-link]")?.getAttribute("d"),
    brackets: document.querySelector("[data-signal-target-brackets]")?.getAttribute("d"),
    paths: document.querySelectorAll("[data-signal-field] path").length,
    legacy: document.querySelectorAll("[data-signal-shell], [data-signal-readout], [data-signal-link], [data-signal-node]").length,
    pointerEvents: getComputedStyle(document.querySelector(".site-signal-layer")).pointerEvents
  }));
  if (initialSignal.mode !== "static" || initialSignal.path || initialSignal.brackets
    || initialSignal.paths !== 2 || initialSignal.legacy !== 0 || initialSignal.pointerEvents !== "none") {
    fail(`Magnetic line: invalid idle contract ${JSON.stringify(initialSignal)}`);
  }

  await signalPage.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    scrollTo(0, 1300);
  });
  await signalPage.waitForFunction(() => document.querySelector("[data-hud-baseline]")?.textContent === "Y 1300");
  await signalPage.waitForFunction(() => getComputedStyle(document.querySelector(".site-hud-timeline")).opacity === "0");
  const scrolledHud = await signalPage.evaluate(() => ({
    section: document.querySelector("[data-hud-section-current]")?.textContent,
    baseline: document.querySelector("[data-hud-baseline]")?.textContent,
    firstTick: document.querySelector("[data-hud-tick]")?.textContent,
    timelineHidden: document.querySelector("[data-hud-frame]")?.classList.contains("is-timeline-hidden"),
    timelineOpacity: getComputedStyle(document.querySelector(".site-hud-timeline")).opacity,
    crossTop: document.querySelector(".site-hud-cross")?.getBoundingClientRect().top,
    audioTop: document.querySelector("[data-audio-player]")?.getBoundingClientRect().top,
    catalogPanels: document.querySelectorAll(".site-hud-catalog").length
  }));
  if (scrolledHud.catalogPanels !== 0 || !scrolledHud.timelineHidden || scrolledHud.timelineOpacity !== "0"
    || scrolledHud.section === initialHud.section
    || scrolledHud.baseline === initialHud.baseline || scrolledHud.firstTick === initialHud.firstTick
    || scrolledHud.crossTop === initialHud.crossTop || Math.abs(scrolledHud.audioTop - initialHud.audioTop) > 1) {
    fail(`HUD: scroll telemetry did not advance cleanly ${JSON.stringify({ initialHud, scrolledHud })}`);
  }
  await signalPage.evaluate(() => scrollTo(0, 1200));
  await signalPage.waitForFunction(() => document.querySelector("[data-hud-baseline]")?.textContent === "Y 1200"
    && !document.querySelector("[data-hud-frame]")?.classList.contains("is-timeline-hidden"));
  await signalPage.waitForFunction(() => getComputedStyle(document.querySelector(".site-hud-timeline")).opacity === "1");
  const restoredTimelineOpacity = await signalPage.locator(".site-hud-timeline").evaluate((element) => getComputedStyle(element).opacity);
  if (restoredTimelineOpacity !== "1") fail(`HUD: timeline did not return on upward scroll (${restoredTimelineOpacity})`);
  await signalPage.evaluate(() => scrollTo(0, 1300));
  await signalPage.waitForFunction(() => document.querySelector("[data-hud-baseline]")?.textContent === "Y 1300");
  await signalPage.waitForTimeout(100);
  const targetProbe = await signalPage.evaluate(() => {
    const cards = [...document.querySelectorAll(".release-card")];
    const card = cards.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top > 80 && rect.bottom < innerHeight - 40 && rect.left < innerWidth * 0.55;
    });
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    return {
      code: card.querySelector(".release-card-code")?.textContent?.trim(),
      x: Math.max(8, rect.left - 36),
      y: rect.top + Math.min(48, rect.height * 0.35)
    };
  });
  if (!targetProbe) {
    fail("Magnetic line: could not locate a visible release target");
  } else {
    await signalPage.mouse.move(targetProbe.x, targetProbe.y);
    await signalPage.waitForFunction(() => Boolean(document.querySelector("[data-signal-panel-link]")?.getAttribute("d")));
    const trackedSignal = await signalPage.evaluate(({ expectedX, expectedY }) => {
      const stage = document.querySelector("[data-signal-field]");
      const stageRect = stage.getBoundingClientRect();
      const path = document.querySelector("[data-signal-panel-link]");
      const match = path.getAttribute("d")?.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
      return {
        mode: stage.dataset.signalMode,
        target: stage.dataset.signalTarget,
        path: path.getAttribute("d"),
        brackets: document.querySelector("[data-signal-target-brackets]")?.getAttribute("d"),
        start: match ? { x: Number(match[1]), y: Number(match[2]) } : null,
        expected: { x: expectedX - stageRect.left, y: expectedY - stageRect.top },
        overlayPointerEvents: getComputedStyle(document.querySelector("[data-signal-overlay]")).pointerEvents,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    }, { expectedX: targetProbe.x, expectedY: targetProbe.y });
    if (trackedSignal.mode !== "tracking"
      || trackedSignal.target !== targetProbe.code
      || !trackedSignal.path
      || !trackedSignal.brackets
      || !trackedSignal.start
      || Math.abs(trackedSignal.start.x - trackedSignal.expected.x) > 0.6
      || Math.abs(trackedSignal.start.y - trackedSignal.expected.y) > 0.6
      || trackedSignal.overlayPointerEvents !== "none"
      || trackedSignal.documentWidth > trackedSignal.viewportWidth + 1) {
      fail(`Magnetic line: target acquisition contract failed ${JSON.stringify(trackedSignal)}`);
    }
    const settledPath = trackedSignal.path;
    await signalPage.waitForTimeout(400);
    if (await signalPage.locator("[data-signal-panel-link]").getAttribute("d") !== settledPath) {
      fail("Magnetic line: path keeps mutating after pointer input settles");
    }
  }
  await signalContext.close();

  const touchContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${baseUrl}/it/catalog/pvkh-001/`, { waitUntil: "load" });
  const touchSignal = await touchPage.evaluate(() => ({
    mode: document.querySelector("[data-signal-field]")?.dataset.signalMode,
    path: document.querySelector("[data-signal-panel-link]")?.getAttribute("d"),
    legacy: document.querySelectorAll("[data-signal-shell], [data-signal-readout]").length,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  if (touchSignal.mode !== "static" || touchSignal.path || touchSignal.legacy !== 0 || touchSignal.documentWidth > touchSignal.viewportWidth + 1) {
    fail(`Touch: signal field must use the static compact fallback ${JSON.stringify(touchSignal)}`);
  }
  await touchPage.locator("[data-site-index] > summary").tap();
  await Promise.all([
    touchPage.waitForURL(`${baseUrl}/ru/catalog/pvkh-001/`),
    touchPage.locator('nav[data-language-switcher] .language-link[hreflang="ru"]').tap()
  ]);
  if (await touchPage.locator("html").getAttribute("lang") !== "ru") fail("Touch: language switch did not load Russian deep route");
  await Promise.all([
    touchPage.waitForURL(`${baseUrl}/ru/listen/pvkh-001/`),
    touchPage.locator('[data-streaming-service="allServices"]').tap()
  ]);
  if (await touchPage.locator('[data-smart-release-id="PVKH-001"]').count() !== 1) fail("Touch: all-services CTA did not open the smart-link page");
  await touchContext.close();

  const noScriptContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    javaScriptEnabled: false
  });
  const noScriptPage = await noScriptContext.newPage();
  await noScriptPage.goto(`${baseUrl}/ru/process/`, { waitUntil: "load" });
  await noScriptPage.locator("[data-site-index] > summary").click();
  await Promise.all([
    noScriptPage.waitForURL(`${baseUrl}/process/`),
    noScriptPage.locator('nav[data-language-switcher] .language-link[hreflang="en"]').click()
  ]);
  if (await noScriptPage.locator("html").getAttribute("lang") !== "en") fail("No JavaScript: language switch did not load English equivalent route");
  await noScriptPage.goto(`${baseUrl}/catalog/`, { waitUntil: "load" });
  if (await noScriptPage.locator("[data-release-card]").count() !== catalog.releases.length) {
    fail(`No JavaScript: catalog must retain all ${catalog.releases.length} release cards`);
  }
  if (await noScriptPage.locator("[data-catalog-filters]").evaluate((element) => getComputedStyle(element).display) !== "none") {
    fail("No JavaScript: inert catalog filter controls must stay hidden");
  }
  await noScriptPage.goto(`${baseUrl}/catalog/pvkh-001/`, { waitUntil: "load" });
  await Promise.all([
    noScriptPage.waitForURL(`${baseUrl}/listen/pvkh-001/`),
    noScriptPage.locator('[data-streaming-service="allServices"]').click()
  ]);
  if (await noScriptPage.locator('[data-release-cta="streaming"]').count() !== 3) {
    fail("No JavaScript: smart-link chooser must retain all direct destinations");
  }
  await Promise.all([
    noScriptPage.waitForURL(`${baseUrl}/catalog/pvkh-001/`),
    noScriptPage.locator("[data-smart-back]").click()
  ]);
  if (await noScriptPage.locator('[data-release-id="PVKH-001"]').count() !== 1) {
    fail("No JavaScript: smart-link return did not restore the release page");
  }
  await noScriptPage.goto(`${baseUrl}/links/`, { waitUntil: "load" });
  const noScriptSocialAccess = await noScriptPage.evaluate(() => ({
    ids: [...document.querySelectorAll("[data-social-access-link]")].map((link) => link.dataset.socialId),
    hrefs: [...document.querySelectorAll("[data-social-access-link]")].map((link) => link.href),
    targets: [...document.querySelectorAll("[data-social-access-link]")].map((link) => link.getAttribute("target")),
    rels: [...document.querySelectorAll("[data-social-access-link]")].map((link) => link.getAttribute("rel")),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  if (JSON.stringify(noScriptSocialAccess.ids) !== JSON.stringify(SOCIAL_LINKS.map(({ id }) => id))
    || JSON.stringify(noScriptSocialAccess.hrefs) !== JSON.stringify(SOCIAL_LINKS.map(({ url }) => url))
    || noScriptSocialAccess.targets.some((target) => target !== "_blank")
    || noScriptSocialAccess.rels.some((rel) => !rel?.includes("noopener") || !rel.includes("noreferrer"))
    || noScriptSocialAccess.overflow > 1) {
    fail(`No JavaScript social access: invalid contract ${JSON.stringify(noScriptSocialAccess)}`);
  }
  await noScriptPage.goto(baseUrl, { waitUntil: "load" });
  const noScriptSignal = await noScriptPage.evaluate(() => ({
    paths: [...document.querySelectorAll("[data-signal-field] path")].map((path) => path.getAttribute("d")),
    playerDisplay: getComputedStyle(document.querySelector("[data-audio-player]")).display,
    bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom)
  }));
  if (noScriptSignal.paths.length !== 2 || noScriptSignal.paths.some(Boolean)
    || noScriptSignal.playerDisplay !== "none" || noScriptSignal.bodyPaddingBottom !== 0) {
    fail(`No JavaScript: magnetic line or audio fallback is not inert ${JSON.stringify(noScriptSignal)}`);
  }
  await noScriptContext.close();

  const noScriptMerchContext = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 }
  });
  const noScriptMerchPage = await noScriptMerchContext.newPage();
  await noScriptMerchPage.goto(`${baseUrl}/merch/`, { waitUntil: "load" });
  const noScriptMerch = await noScriptMerchPage.evaluate(() => ({
    objects: document.querySelectorAll("[data-merch-object]").length,
    detailLinks: document.querySelectorAll("[data-merch-detail]").length,
    anchor: document.querySelector('.merch-hero a[href="#merch-objects"]')?.getAttribute("href"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  if (noScriptMerch.objects !== merchLibrary.objects.length
    || noScriptMerch.detailLinks !== merchLibrary.objects.length
    || noScriptMerch.anchor != null
    || noScriptMerch.overflow > 1) {
    fail(`No JavaScript merch: invalid contract ${JSON.stringify(noScriptMerch)}`);
  }
  await noScriptMerchContext.close();

  const noScriptMerchDetailContext = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 }
  });
  const noScriptMerchDetailPage = await noScriptMerchDetailContext.newPage();
  await noScriptMerchDetailPage.goto(`${baseUrl}/merch/vinyl/`, { waitUntil: "load" });
  const noScriptMerchDetail = await noScriptMerchDetailPage.evaluate(() => ({
    objectId: document.querySelector("[data-merch-detail-id]")?.dataset.merchDetailId || null,
    links: [...document.querySelectorAll("[data-merch-gallery-trigger]")].map((link) => ({
      href: link.getAttribute("href"),
      alt: link.querySelector("img")?.getAttribute("alt") || ""
    })),
    dialogOpen: document.querySelector("[data-merch-gallery-dialog]")?.hasAttribute("open") || false,
    controller: document.querySelector("[data-merch-gallery]")?.dataset.merchGalleryController || null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  if (noScriptMerchDetail.objectId !== "MRCH-001"
    || noScriptMerchDetail.links.length !== merchLibrary.objects[0].gallery.length - 1
    || noScriptMerchDetail.links.some(({ href, alt }) => !href?.endsWith(".webp") || !alt)
    || noScriptMerchDetail.dialogOpen
    || noScriptMerchDetail.controller
    || noScriptMerchDetail.overflow > 1) {
    fail(`No JavaScript merch detail: invalid fallback ${JSON.stringify(noScriptMerchDetail)}`);
  }
  await noScriptMerchDetailContext.close();

  const auditTextZoomRoute = async (page, route, suffix = "") => {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const before = await page.evaluate(displayFontSizes);
    await applyTextZoom(page);
    if (/^(?:\/(?:it|ru))?\/links\/$/.test(route)) {
      await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
    }
    const zoomMetrics = await page.evaluate(() => {
      const targets = [...document.querySelectorAll('[data-release-cta="streaming"]')].map((target) => {
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        return {
          width: rect.width,
          height: rect.height,
          scrollWidth: target.scrollWidth,
          scrollHeight: target.scrollHeight,
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
        };
      });
      const socialTargets = [...document.querySelectorAll("[data-social-access-link]")].map((target) => {
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          scrollWidth: target.scrollWidth,
          scrollHeight: target.scrollHeight,
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
        };
      });
      return {
        rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        targets,
        socialTargets
      };
    });
    const label = `200% text zoom${suffix}: ${route}`;
    if (Math.abs(zoomMetrics.rootFontSize - 32) > 0.1) fail(`${label} root font is ${zoomMetrics.rootFontSize}px`);
    if (zoomMetrics.documentWidth > zoomMetrics.viewport + 1) {
      fail(`${label} overflows ${zoomMetrics.documentWidth - zoomMetrics.viewport}px horizontally`);
    }
    if (zoomMetrics.targets.some(({ visible, width, height }) => !visible || width < 44 || height < 44)) {
      fail(`${label} has an unavailable streaming target ${JSON.stringify(zoomMetrics.targets)}`);
    }
    if (zoomMetrics.targets.some(({ width, height, scrollWidth, scrollHeight }) => scrollWidth > width + 0.5 || scrollHeight > height + 0.5)) {
      fail(`${label} clips streaming CTA content ${JSON.stringify(zoomMetrics.targets)}`);
    }
    if (zoomMetrics.socialTargets.some(({ visible, width, height, left, right }) => !visible || width < 44 || height < 44 || left < -0.5 || right > zoomMetrics.viewport + 0.5)) {
      fail(`${label} has an unavailable social-access target ${JSON.stringify(zoomMetrics.socialTargets)}`);
    }
    if (zoomMetrics.socialTargets.some(({ width, height, scrollWidth, scrollHeight }) => scrollWidth > width + 0.5 || scrollHeight > height + 0.5)) {
      fail(`${label} clips social-access content ${JSON.stringify(zoomMetrics.socialTargets)}`);
    }
    if (zoomMetrics.socialTargets.length) {
      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
        const finalLink = document.querySelector(".social-access-item:last-child [data-social-access-link]")?.getBoundingClientRect();
        if (player && finalLink && finalLink.bottom > player.top) {
          window.scrollBy(0, finalLink.bottom - player.top + 16);
        }
      });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const socialPlayerSafety = await page.evaluate(() => {
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
        const finalLink = document.querySelector(".social-access-item:last-child [data-social-access-link]")?.getBoundingClientRect();
        return {
          player,
          finalLink,
          visible: Boolean(finalLink && finalLink.top >= 0 && finalLink.bottom <= innerHeight),
          overlap: Boolean(player && finalLink && overlaps(player, finalLink))
        };
      });
      if (!socialPlayerSafety.visible || socialPlayerSafety.overlap) {
        fail(`${label}: final social-access row cannot be revealed clear of the audio player ${JSON.stringify(socialPlayerSafety)}`);
      }
      await page.evaluate(() => document.documentElement.style.removeProperty("scroll-behavior"));
    }
    const typographyIssues = await page.evaluate(inspectDisplayTypography);
    if (typographyIssues.length) fail(`${label} typography ${JSON.stringify(typographyIssues.slice(0, 6))}`);
    if (/^(?:\/(?:it|ru))?\/merch\/$/.test(route)) {
      await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
      const playerSafety = await page.evaluate(() => {
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const player = document.querySelector("[data-audio-player]").getBoundingClientRect();
        const title = document.querySelector("#merch-title");
        const titleRange = document.createRange();
        if (title) titleRange.selectNodeContents(title);
        return {
          player,
          intersections: [...titleRange.getClientRects()]
            .filter((rect) => overlaps(player, rect))
            .map((rect) => ({ name: "title", rect }))
        };
      });
      if (playerSafety.intersections.length) {
        fail(`${label}: ready player intersects merch hero at ${page.viewportSize().width}px ${JSON.stringify(playerSafety)}`);
      }
    }
    const after = await page.evaluate(displayFontSizes);
    verifyDisplayFontGrowth(label, before, after);
  };

  const textZoomContext = await browser.newContext({
    viewport: { width: 320, height: 780 },
    reducedMotion: "reduce"
  });
  const textZoomPage = await textZoomContext.newPage();
  for (const { route } of routeCases) await auditTextZoomRoute(textZoomPage, route);
  await textZoomContext.close();

  const merchTextZoomContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce"
  });
  const merchTextZoomPage = await merchTextZoomContext.newPage();
  for (const route of ["/merch/", "/it/merch/", "/ru/merch/"]) {
    await auditTextZoomRoute(merchTextZoomPage, route, " @ 375px");
  }
  await merchTextZoomContext.close();

  const fallbackTextZoomContext = await browser.newContext({
    viewport: { width: 320, height: 780 },
    reducedMotion: "reduce"
  });
  await fallbackTextZoomContext.route(/\.ttf(?:$|\?)/, (route) => route.abort("failed"));
  const fallbackTextZoomPage = await fallbackTextZoomContext.newPage();
  for (const { route } of routeCases) await auditTextZoomRoute(fallbackTextZoomPage, route, " / font fallback");
  await fallbackTextZoomContext.close();

  const desktopTextZoomContext = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    reducedMotion: "reduce"
  });
  const desktopTextZoomPage = await desktopTextZoomContext.newPage();
  for (const route of [
    "/", "/it/", "/ru/",
    "/about/", "/it/about/", "/ru/about/",
    "/process/", "/it/process/", "/ru/process/",
    "/listen/pvkh-011/", "/it/listen/pvkh-011/", "/ru/listen/pvkh-011/"
  ]) await auditTextZoomRoute(desktopTextZoomPage, route, " @ 1024px");
  await desktopTextZoomContext.close();

  const releaseZoomContext = await browser.newContext({
    viewport: { width: 640, height: 900 },
    reducedMotion: "reduce"
  });
  const releaseZoomPage = await releaseZoomContext.newPage();
  await releaseZoomPage.goto(`${baseUrl}/ru/catalog/pvkh-011/`, { waitUntil: "load" });
  const releaseBefore = await releaseZoomPage.evaluate(displayFontSizes);
  await applyTextZoom(releaseZoomPage);
  const releaseZoomMetrics = await releaseZoomPage.evaluate(() => {
    const details = [...document.querySelectorAll(".data-list dd")].map((element) => element.getBoundingClientRect().width);
    return {
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      details
    };
  });
  if (releaseZoomMetrics.documentWidth > releaseZoomMetrics.viewport + 1 || releaseZoomMetrics.details.some((width) => width < 1)) {
    fail(`200% text zoom: 640px release layout is clipped ${JSON.stringify(releaseZoomMetrics)}`);
  }
  const releaseZoomTypography = await releaseZoomPage.evaluate(inspectDisplayTypography);
  if (releaseZoomTypography.length) fail(`200% text zoom: 640px release typography ${JSON.stringify(releaseZoomTypography.slice(0, 6))}`);
  verifyDisplayFontGrowth("200% text zoom: 640px release", releaseBefore, await releaseZoomPage.evaluate(displayFontSizes));
  await releaseZoomContext.close();

  const headerZoomContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce"
  });
  const headerZoomPage = await headerZoomContext.newPage();
  for (const route of ["/", "/it/", "/ru/"]) {
    await headerZoomPage.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const headerBefore = await headerZoomPage.evaluate(displayFontSizes);
    await applyTextZoom(headerZoomPage);
    const headerMetrics = await headerZoomPage.evaluate(() => {
      const desktop = document.querySelector(".desktop-nav").getBoundingClientRect();
      const index = document.querySelector("[data-site-index] > summary").getBoundingClientRect();
      const navList = document.querySelector(".desktop-nav .nav-list");
      return {
        viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          desktopRight: desktop.right,
          indexLeft: index.left,
        navClientWidth: navList.clientWidth,
        navScrollWidth: navList.scrollWidth,
        volumeLabel: document.querySelector("[data-player-volume-toggle]")?.getAttribute("aria-label")
      };
    });
    const expectedVolumePrefix = route === "/ru/" ? "Громкость:" : "Volume:";
    if (headerMetrics.documentWidth > headerMetrics.viewport + 1
      || headerMetrics.desktopRight > headerMetrics.indexLeft + 1
      || headerMetrics.navScrollWidth > headerMetrics.navClientWidth + 1
      || !headerMetrics.volumeLabel?.startsWith(expectedVolumePrefix)) {
      fail(`200% text zoom: ${route} desktop header collision ${JSON.stringify(headerMetrics)}`);
    }
    verifyDisplayFontGrowth(`200% text zoom: ${route} desktop`, headerBefore, await headerZoomPage.evaluate(displayFontSizes));
  }
  await headerZoomContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce"
  });
  const reducedPage = await reducedContext.newPage();
  const reducedMotionRequests = [];
  const reducedViewerRequests = [];
  reducedPage.on("request", (request) => {
    if (/\/assets\/motion\//.test(request.url())) reducedMotionRequests.push(request.url());
    if (/\/assets\/(?:product-viewer\.js|vendor\/model-viewer\.min\.js|merch-3d\/)/.test(request.url())) {
      reducedViewerRequests.push(request.url());
    }
  });
  await reducedPage.goto(baseUrl, { waitUntil: "load" });
  const reducedStyles = await reducedPage.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionDuration: getComputedStyle(document.querySelector(".button")).transitionDuration,
    signal: {
      mode: document.querySelector("[data-signal-field]")?.dataset.signalMode,
      path: document.querySelector("[data-signal-panel-link]")?.getAttribute("d"),
      display: getComputedStyle(document.querySelector("[data-signal-overlay]")).display,
      animations: document.querySelector("[data-signal-overlay]")?.getAnimations({ subtree: true }).length
    },
    videos: [...document.querySelectorAll("[data-motion-video]")].map((video) => ({
      state: video.dataset.motionState,
      currentSrc: video.currentSrc,
      sources: [...video.querySelectorAll("source")].map((source) => source.getAttribute("src"))
    }))
  }));
  if (reducedStyles.scrollBehavior !== "auto") fail(`Reduced motion: scroll-behavior is ${reducedStyles.scrollBehavior}`);
  const reducedDurations = reducedStyles.transitionDuration.split(",").map((value) => Number.parseFloat(value));
  if (reducedDurations.some((value) => !Number.isFinite(value) || value > 0.00002)) {
    fail(`Reduced motion: transition duration is ${reducedStyles.transitionDuration}`);
  }
  if (reducedMotionRequests.length
    || reducedStyles.videos.length !== 2
    || reducedStyles.videos.some(({ state, currentSrc, sources }) => state !== "disabled" || currentSrc || sources.some(Boolean))) {
    fail(`Reduced motion: decorative media was hydrated ${JSON.stringify({ reducedMotionRequests, videos: reducedStyles.videos })}`);
  }
  await reducedPage.mouse.move(240, 430);
  await reducedPage.waitForTimeout(180);
  const reducedSignalAfter = await reducedPage.evaluate(() => ({
    mode: document.querySelector("[data-signal-field]")?.dataset.signalMode,
    path: document.querySelector("[data-signal-panel-link]")?.getAttribute("d"),
    display: getComputedStyle(document.querySelector("[data-signal-overlay]")).display,
    animations: document.querySelector("[data-signal-overlay]")?.getAnimations({ subtree: true }).length
  }));
  if (reducedStyles.signal.mode !== "static"
    || reducedSignalAfter.mode !== "static"
    || reducedSignalAfter.path !== reducedStyles.signal.path
    || reducedStyles.signal.display !== "none"
    || reducedSignalAfter.display !== "none"
    || reducedStyles.signal.animations
    || reducedSignalAfter.animations) {
    fail(`Reduced motion: signal field reacted to pointer input ${JSON.stringify({ before: reducedStyles.signal, after: reducedSignalAfter })}`);
  }
  await reducedPage.goto(`${baseUrl}/merch/`, { waitUntil: "load" });
  const reducedMerch = await reducedPage.evaluate(() => {
    const card = document.querySelector(".merch-object");
    return {
      found: Boolean(card),
      transitionDuration: card ? getComputedStyle(card).transitionDuration : null,
      animations: card?.getAnimations({ subtree: true }).length ?? -1,
      motion: [...document.querySelectorAll("[data-motion-video]")].map((video) => ({
        state: video.dataset.motionState,
        currentSrc: video.currentSrc,
        sources: [...video.querySelectorAll("source")].map((source) => source.getAttribute("src"))
      }))
    };
  });
  const reducedMerchDurations = reducedMerch.transitionDuration
    ?.split(",")
    .map((value) => Number.parseFloat(value)) ?? [];
  if (!reducedMerch.found
    || reducedMerch.animations !== 0
    || reducedMotionRequests.length
    || reducedMerch.motion.length !== 2
    || reducedMerch.motion.some(({ state, currentSrc, sources }) => state !== "disabled" || currentSrc || sources.some(Boolean))
    || reducedMerchDurations.some((value) => !Number.isFinite(value) || value > 0.00002)) {
    fail(`Reduced motion: merch fallback or card contract failed ${JSON.stringify({ reducedMotionRequests, reducedMerch })}`);
  }
  await reducedPage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  const reducedViewerPoster = await reducedPage.locator("[data-product-viewer-poster]").isVisible();
  if (!reducedViewerPoster || reducedViewerRequests.length) {
    fail(`Reduced motion: poster-first viewer hydrated before activation ${JSON.stringify(reducedViewerRequests)}`);
  }
  await reducedPage.goto(`${baseUrl}/links/`, { waitUntil: "load" });
  const reducedSocialAccess = await reducedPage.evaluate(() => {
    const terminal = document.querySelector(".social-access-terminal");
    const link = document.querySelector(".social-access-link");
    const field = document.querySelector(".social-access-field");
    return {
      terminalAnimations: terminal?.getAnimations({ subtree: true }).length ?? -1,
      linkTransition: link ? getComputedStyle(link).transitionDuration : null,
      fieldAnimations: field?.getAnimations({ subtree: true }).length ?? -1
    };
  });
  if (reducedSocialAccess.terminalAnimations !== 0
    || reducedSocialAccess.fieldAnimations !== 0
    || reducedSocialAccess.linkTransition?.split(",").some((value) => Number.parseFloat(value) > 0.00002)) {
    fail(`Reduced motion: social access is not static ${JSON.stringify(reducedSocialAccess)}`);
  }
  await reducedContext.close();

  const saveDataContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const saveDataPage = await saveDataContext.newPage();
  await saveDataPage.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true }
    });
  });
  const saveDataRequests = [];
  const saveDataAudioRequests = [];
  const saveDataViewerRequests = [];
  saveDataPage.on("request", (request) => {
    if (/\/assets\/motion\//.test(request.url())) saveDataRequests.push(request.url());
    if (/\.mp3(?:$|\?)/.test(request.url())) saveDataAudioRequests.push(request.url());
    if (/\/assets\/(?:product-viewer\.js|vendor\/model-viewer\.min\.js|merch-3d\/)/.test(request.url())) {
      saveDataViewerRequests.push(request.url());
    }
  });
  await saveDataPage.goto(baseUrl, { waitUntil: "load" });
  const saveDataStates = await saveDataPage.locator("[data-motion-video]").evaluateAll((videos) => videos.map((video) => ({
    state: video.dataset.motionState,
    currentSrc: video.currentSrc,
    sources: [...video.querySelectorAll("source")].map((source) => source.getAttribute("src"))
  })));
  const saveDataSignalMode = await saveDataPage.locator("[data-signal-field]").getAttribute("data-signal-mode");
  const saveDataAudio = await saveDataPage.evaluate(() => ({
    currentSrc: document.querySelector("[data-audio-engine]")?.currentSrc,
    state: document.querySelector("[data-audio-player]")?.dataset.state
  }));
  if (saveDataRequests.length
    || saveDataAudioRequests.length
    || saveDataStates.length !== 2
    || saveDataStates.some(({ state, currentSrc, sources }) => state !== "disabled" || currentSrc || sources.some(Boolean))
    || saveDataSignalMode !== "static"
    || saveDataAudio.currentSrc
    || saveDataAudio.state !== "paused") {
    fail(`Save-Data: deferred media contract failed ${JSON.stringify({ saveDataRequests, saveDataAudioRequests, saveDataStates, saveDataSignalMode, saveDataAudio })}`);
  }
  await saveDataPage.goto(`${baseUrl}/merch/`, { waitUntil: "load" });
  const saveDataMerchStates = await saveDataPage.locator("[data-motion-video]").evaluateAll((videos) => videos.map((video) => ({
    state: video.dataset.motionState,
    currentSrc: video.currentSrc,
    sources: [...video.querySelectorAll("source")].map((source) => source.getAttribute("src"))
  })));
  if (saveDataRequests.length
    || saveDataMerchStates.length !== 2
    || saveDataMerchStates.some(({ state, currentSrc, sources }) => state !== "disabled" || currentSrc || sources.some(Boolean))) {
    fail(`Save-Data: merch PHYSICAL media was hydrated ${JSON.stringify({ saveDataRequests, saveDataMerchStates })}`);
  }
  await saveDataPage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  const saveDataViewerPoster = await saveDataPage.locator("[data-product-viewer-poster]").isVisible();
  if (!saveDataViewerPoster || saveDataViewerRequests.length) {
    fail(`Save-Data: poster-first viewer hydrated before activation ${JSON.stringify(saveDataViewerRequests)}`);
  }
  await saveDataPage.goto(`${baseUrl}/links/`, { waitUntil: "load" });
  const saveDataSocialAccess = await saveDataPage.evaluate(() => {
    const terminal = document.querySelector(".social-access-terminal");
    const field = document.querySelector(".social-access-field");
    return {
      terminalAnimations: terminal?.getAnimations({ subtree: true }).length ?? -1,
      fieldAnimations: field?.getAnimations({ subtree: true }).length ?? -1,
      links: document.querySelectorAll("[data-social-access-link]").length
    };
  });
  if (saveDataRequests.length
    || saveDataSocialAccess.terminalAnimations !== 0
    || saveDataSocialAccess.fieldAnimations !== 0
    || saveDataSocialAccess.links !== SOCIAL_LINKS.length) {
    fail(`Save-Data: social access is not static and complete ${JSON.stringify({ saveDataRequests, saveDataSocialAccess })}`);
  }
  const deferredWaveform = await advancedControl(saveDataPage, "[data-player-waveform]");
  const deferredBox = await deferredWaveform.boundingBox();
  if (!deferredBox) throw new Error("Save-Data timeline has no pointer box");
  await saveDataPage.mouse.click(
    deferredBox.x + deferredBox.width * 0.5,
    deferredBox.y + deferredBox.height * 0.5
  );
  await saveDataPage.locator("[data-player-toggle]").click();
  await saveDataPage.waitForFunction(() => document.querySelector("[data-audio-engine]")?.readyState >= 1);
  const deferredSeekTime = await saveDataPage.locator("[data-audio-engine]")
    .evaluate((audio) => audio.currentTime);
  if (Math.abs(deferredSeekTime - defaultAudioTrack.duration * 0.5) > 1.2) {
    fail(`Save-Data timeline: pending seek restored ${deferredSeekTime}`);
  }
  await saveDataContext.close();

  const readyViewerContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "no-preference"
  });
  const readyViewerPage = await readyViewerContext.newPage();
  const readyViewerRequests = [];
  const readyViewerConsoleErrors = [];
  const readyViewerPageErrors = [];
  readyViewerPage.on("request", (request) => readyViewerRequests.push(request.url()));
  readyViewerPage.on("console", (message) => {
    if (message.type() === "error") readyViewerConsoleErrors.push(message.text());
  });
  readyViewerPage.on("pageerror", (error) => readyViewerPageErrors.push(error.message));
  await readyViewerPage.route("**/assets/merch-3d/cassette-002.glb", (route) => route.fulfill({
    status: 200,
    contentType: "model/gltf-binary",
    body: tinyTexturedGlb()
  }));
  await readyViewerPage.goto(`${baseUrl}/it/merch/cassette/`, { waitUntil: "load" });
  await readyViewerPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
  const activationHitTest = await viewerControlHitTest(readyViewerPage, "[data-product-viewer-activate]");
  await readyViewerPage.evaluate(() => {
    window.__viewerCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__viewerCspViolations.push({
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective
      });
    });
  });
  const readyViewerRequestStart = readyViewerRequests.length;
  await readyViewerPage.locator("[data-product-viewer-activate]").focus();
  await readyViewerPage.locator("[data-product-viewer-activate]").press("Enter");
  await readyViewerPage.waitForFunction(() => ["ready", "error"].includes(
    document.querySelector("[data-product-viewer]")?.dataset.viewerState
  ));
  const readyViewerContract = await readyViewerPage.evaluate(() => {
    const root = document.querySelector("[data-product-viewer]");
    const model = root?.querySelector("model-viewer");
    const instructions = root?.querySelector("[data-product-viewer-instructions]");
    const reset = root?.querySelector("[data-product-viewer-reset]");
    const input = model?.shadowRoot?.querySelector(".userInput");
    const resetRect = reset?.getBoundingClientRect();
    const resetHit = resetRect
      ? document.elementFromPoint(resetRect.left + resetRect.width / 2, resetRect.top + resetRect.height / 2)
      : null;
    return {
      state: root?.dataset.viewerState,
      status: root?.querySelector("[data-product-viewer-status]")?.textContent.trim(),
      expectedStatus: root?.dataset.viewerReady,
      instructionsVisible: instructions ? !instructions.hidden : false,
      describedBy: model?.getAttribute("aria-describedby"),
      instructionsId: instructions?.id,
      focusOnInput: model?.shadowRoot?.activeElement === input,
      focusOnReset: document.activeElement === reset,
      inputLabel: input?.getAttribute("aria-label") || "",
      modelHasTabindex: model?.hasAttribute("tabindex"),
      resetReachable: Boolean(resetRect
        && resetRect.top >= 0
        && resetRect.bottom <= innerHeight
        && (resetHit === reset || reset?.contains(resetHit))),
      cspViolations: window.__viewerCspViolations
    };
  });
  const resetHitTest = readyViewerContract.state === "ready"
    ? await viewerControlHitTest(readyViewerPage, "[data-product-viewer-reset]")
    : null;
  let readyTabOrder = null;
  if (readyViewerContract.state === "ready") {
    await readyViewerPage.locator("[data-product-viewer-reset]").focus();
    await readyViewerPage.keyboard.press("Shift+Tab");
    const backwardToInput = await readyViewerPage.evaluate(() => {
      const model = document.querySelector("model-viewer");
      return document.activeElement === model && model?.shadowRoot?.activeElement?.classList.contains("userInput");
    });
    await readyViewerPage.keyboard.press("Tab");
    const forwardToReset = await readyViewerPage.locator("[data-product-viewer-reset]").evaluate((reset) => document.activeElement === reset);
    readyTabOrder = { backwardToInput, forwardToReset };
  }
  let pointerOrbit = null;
  if (readyViewerContract.state === "ready") {
    const modelBox = await readyViewerPage.locator("model-viewer").boundingBox();
    const initialTheta = await readyViewerPage.locator("model-viewer").evaluate((model) => model.getCameraOrbit().theta);
    if (modelBox) {
      await readyViewerPage.mouse.move(modelBox.x + modelBox.width * 0.5, modelBox.y + modelBox.height * 0.5);
      await readyViewerPage.mouse.down();
      await readyViewerPage.mouse.move(modelBox.x + modelBox.width * 0.72, modelBox.y + modelBox.height * 0.58, { steps: 12 });
      await readyViewerPage.mouse.up();
      await readyViewerPage.waitForFunction((theta) => {
        const current = document.querySelector("model-viewer")?.getCameraOrbit().theta;
        return Number.isFinite(current) && Math.abs(current - theta) > 0.03;
      }, initialTheta);
      pointerOrbit = await readyViewerPage.locator("model-viewer").evaluate((model) => model.getCameraOrbit().theta);
    }
    await readyViewerPage.locator("[data-product-viewer-reset]").click();
    await readyViewerPage.waitForFunction(() => {
      const model = document.querySelector("model-viewer");
      return model?.getAttribute("camera-orbit") === "14deg 72deg 105%"
        && Math.abs(model.getCameraOrbit().theta - 14 * Math.PI / 180) < 0.002
        && Math.abs(model.getFieldOfView() - 19) < 0.02;
    });
  }
  const resetCamera = await readyViewerPage.locator("model-viewer").evaluate((model) => {
    const orbit = model.getCameraOrbit();
    const target = model.getCameraTarget();
    return {
      attributes: {
        orbit: model.getAttribute("camera-orbit"),
        fieldOfView: model.getAttribute("field-of-view"),
        target: model.getAttribute("camera-target")
      },
      orbit: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius },
      fieldOfView: model.getFieldOfView(),
      target: { x: target.x, y: target.y, z: target.z }
    };
  }).catch(() => null);
  const readyActivationRequests = readyViewerRequests.slice(readyViewerRequestStart);
  if (readyViewerContract.state !== "ready"
    || readyViewerContract.status !== readyViewerContract.expectedStatus
    || !readyViewerContract.instructionsVisible
    || readyViewerContract.describedBy !== readyViewerContract.instructionsId
    || (!readyViewerContract.focusOnInput && !readyViewerContract.focusOnReset)
    || !/Trascina|frecce/.test(readyViewerContract.inputLabel)
    || readyViewerContract.modelHasTabindex
    || !readyTabOrder?.backwardToInput
    || !readyTabOrder?.forwardToReset
    || !readyViewerContract.resetReachable
    || !activationHitTest.insideViewport
    || activationHitTest.points.some(({ viewer, player }) => !viewer || player)
    || !resetHitTest?.insideViewport
    || resetHitTest.points.some(({ viewer, player }) => !viewer || player)
    || !Number.isFinite(pointerOrbit)
    || resetCamera?.attributes.orbit !== "14deg 72deg 105%"
    || resetCamera?.attributes.fieldOfView !== "19deg"
    || resetCamera?.attributes.target !== "auto 0.078m auto"
    || !Number.isFinite(resetCamera?.orbit.theta)
    || !Number.isFinite(resetCamera?.orbit.phi)
    || Math.abs(resetCamera?.orbit.theta - 14 * Math.PI / 180) > 0.002
    || Math.abs(resetCamera?.orbit.phi - 72 * Math.PI / 180) > 0.002
    || !Number.isFinite(resetCamera?.orbit.radius)
    || !Number.isFinite(resetCamera?.fieldOfView)
    || Math.abs(resetCamera?.fieldOfView - 19) > 0.02
    || !Number.isFinite(resetCamera?.target.y)
    || Math.abs(resetCamera?.target.y - 0.078) > 0.002
    || readyViewerContract.cspViolations.length
    || readyViewerConsoleErrors.length
    || readyViewerPageErrors.length
    || readyActivationRequests.some((url) => /model-viewer-support/.test(url))
    || readyActivationRequests.some((url) => new URL(url).origin !== baseUrl)) {
    fail(`Product viewer: successful localized GLB contract failed ${JSON.stringify({ readyViewerContract, readyTabOrder, activationHitTest, resetHitTest, pointerOrbit, resetCamera, readyViewerConsoleErrors, readyViewerPageErrors, readyActivationRequests })}`);
  }
  await readyViewerContext.close();

  const invalidBoundsContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const invalidBoundsPage = await invalidBoundsContext.newPage();
  await invalidBoundsPage.route("**/assets/merch-3d/cassette-002.glb", (route) => route.fulfill({
    status: 200,
    contentType: "model/gltf-binary",
    body: tinyTexturedGlb({ invalidBounds: true })
  }));
  await invalidBoundsPage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  await invalidBoundsPage.locator("[data-product-viewer-activate]").click();
  await invalidBoundsPage.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "error");
  const invalidBoundsFallback = await invalidBoundsPage.evaluate(() => ({
    state: document.querySelector("[data-product-viewer]")?.dataset.viewerState,
    posterVisible: !document.querySelector("[data-product-viewer-poster]")?.hidden,
    activateVisible: !document.querySelector("[data-product-viewer-activate]")?.hidden,
    modelCount: document.querySelectorAll("model-viewer").length
  }));
  if (invalidBoundsFallback.state !== "error" || !invalidBoundsFallback.posterVisible
    || !invalidBoundsFallback.activateVisible || invalidBoundsFallback.modelCount !== 0) {
    fail(`Product viewer: invalid bounds did not recover to the honest poster fallback ${JSON.stringify(invalidBoundsFallback)}`);
  }
  await invalidBoundsContext.close();

  const cassetteContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const cassettePage = await cassetteContext.newPage();
  const cassetteRequests = [];
  cassettePage.on("request", (request) => cassetteRequests.push(request.url()));
  await cassettePage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  const cassetteRequestStart = cassetteRequests.length;
  await cassettePage.locator("[data-product-viewer-activate]").click();
  await cassettePage.waitForFunction(() => ["ready", "error"].includes(
    document.querySelector("[data-product-viewer]")?.dataset.viewerState
  ));
  const cassetteGeometry = await cassettePage.evaluate(async () => {
    const root = document.querySelector("[data-product-viewer]");
    const model = root?.querySelector("model-viewer");
    const dimensions = model?.getDimensions();
    const center = model?.getBoundingBoxCenter();
    const orbit = model?.getCameraOrbit();
    const target = model?.getCameraTarget();
    let renderedPixels = 0;
    try {
      const blob = await model?.toBlob();
      if (blob) {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) renderedPixels += 1;
        }
        bitmap.close();
      }
    } catch {
      renderedPixels = 0;
    }
    return {
      state: root?.dataset.viewerState,
      attributes: {
        orbit: model?.getAttribute("camera-orbit"),
        fieldOfView: model?.getAttribute("field-of-view"),
        target: model?.getAttribute("camera-target")
      },
      orbit: orbit ? [orbit.theta, orbit.phi, orbit.radius] : null,
      fieldOfView: model?.getFieldOfView(),
      target: target ? [target.x, target.y, target.z] : null,
      dimensions: dimensions ? [dimensions.x, dimensions.y, dimensions.z] : null,
      center: center ? [center.x, center.y, center.z] : null,
      renderedPixels
    };
  });
  const cassetteActivationRequests = cassetteRequests.slice(cassetteRequestStart);
  if (cassetteGeometry.state !== "ready"
    || cassetteGeometry.attributes.orbit !== "18deg 70deg 103%"
    || cassetteGeometry.attributes.fieldOfView !== "22deg"
    || cassetteGeometry.attributes.target !== "auto auto auto"
    || !Number.isFinite(cassetteGeometry.orbit?.[0])
    || !Number.isFinite(cassetteGeometry.orbit?.[1])
    || Math.abs(cassetteGeometry.orbit?.[0] - 18 * Math.PI / 180) > 0.002
    || Math.abs(cassetteGeometry.orbit?.[1] - 70 * Math.PI / 180) > 0.002
    || !Number.isFinite(cassetteGeometry.orbit?.[2])
    || !Number.isFinite(cassetteGeometry.fieldOfView)
    || Math.abs(cassetteGeometry.fieldOfView - 22) > 0.02
    || !cassetteGeometry.target?.every(Number.isFinite)
    || !cassetteGeometry.dimensions?.every((value) => Number.isFinite(value) && value > 0)
    || !cassetteGeometry.center?.every(Number.isFinite)
    || cassetteGeometry.renderedPixels < 1
    || cassetteActivationRequests.some((url) => /model-viewer-support/.test(url))
    || cassetteActivationRequests.some((url) => new URL(url).origin !== baseUrl)) {
    fail(`Product viewer: actual cassette geometry/render activation failed ${JSON.stringify({ cassetteGeometry, cassetteActivationRequests })}`);
  }
  await cassetteContext.close();

  const spinContext = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const spinPage = await spinContext.newPage();
  const spinRequests = [];
  spinPage.on("request", (request) => spinRequests.push(new URL(request.url()).pathname));
  await spinPage.route("**/assets/merch-360/fixture/manifest.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      schemaVersion: 1,
      assetKey: "fixture-spin",
      variants: {
        mobile: { frames: ["frame-000.png", "frame-001.png", "frame-002.png"] },
        desktop: { frames: ["frame-000.png", "frame-001.png", "frame-002.png"] }
      }
    })
  }));
  await spinPage.route("**/assets/merch-360/fixture/frame-*.png", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: tinySpinPng
  }));
  await spinPage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  await spinPage.locator("[data-product-viewer]").evaluate((root) => {
    root.dataset.viewerKind = "spin";
    root.dataset.viewerSrc = "../../assets/merch-360/fixture/manifest.json";
  });
  const spinRequestStart = spinRequests.length;
  await spinPage.locator("[data-product-viewer-activate]").click();
  await spinPage.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready");
  const spinActivationRequests = spinRequests.slice(spinRequestStart);
  const spin = spinPage.locator("[data-product-viewer-spin]");
  const spinBeforeStep = await spin.getAttribute("data-frame-index");
  await spin.press("ArrowRight");
  await spinPage.waitForFunction(() => document.querySelector("[data-product-viewer-spin]")?.dataset.frameIndex === "1");
  const spinAfterKey = await spin.getAttribute("data-frame-index");
  await spinPage.locator("[data-product-viewer-reset]").click();
  const spinAfterReset = await spin.getAttribute("data-frame-index");
  await spin.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: 220, clientY: 180, button: 0 });
  await spin.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", clientX: 170, clientY: 180, buttons: 1 });
  await spin.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: 170, clientY: 180, button: 0 });
  await spinPage.waitForFunction(() => document.querySelector("[data-product-viewer-spin]")?.dataset.frameIndex === "1");
  const spinAfterTouch = await spin.getAttribute("data-frame-index");
  if (spinBeforeStep !== "0"
    || spinAfterKey !== "1"
    || spinAfterReset !== "0"
    || spinAfterTouch !== "1"
    || spinActivationRequests.some((pathname) => /model-viewer|merch-3d/.test(pathname))
    || !spinActivationRequests.some((pathname) => pathname.endsWith("/manifest.json"))
    || !spinActivationRequests.some((pathname) => pathname.endsWith("/frame-000.png"))
    || spinActivationRequests.some((pathname) => pathname.endsWith("/frame-001.png"))) {
    fail(`Product viewer: lazy spin contract failed ${JSON.stringify({ spinActivationRequests, spinBeforeStep, spinAfterKey, spinAfterReset, spinAfterTouch })}`);
  }
  await spinContext.close();

  const viewerContext = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    reducedMotion: "no-preference"
  });
  const viewerPage = await viewerContext.newPage();
  const viewerRequests = [];
  viewerPage.on("request", (request) => {
    if (/\/assets\/(?:product-viewer\.js|vendor\/model-viewer\.min\.js|merch-3d\/)/.test(request.url())) {
      viewerRequests.push(request.url());
    }
  });
  await viewerPage.route("**/assets/merch-3d/cassette-002.glb", (route) => route.fulfill({
    status: 404,
    contentType: "model/gltf-binary",
    body: "missing model fixture"
  }));
  await viewerPage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  await viewerPage.waitForTimeout(120);
  if (viewerRequests.length || !await viewerPage.locator("[data-product-viewer-poster]").isVisible()) {
    fail(`Product viewer: runtime or model loaded before explicit activation ${JSON.stringify(viewerRequests)}`);
  }
  await viewerPage.locator("[data-product-viewer-activate]").click();
  await viewerPage.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "error");
  const viewerFallback = await viewerPage.evaluate(() => ({
    posterVisible: !document.querySelector("[data-product-viewer-poster]")?.hidden,
    activateDisabled: document.querySelector("[data-product-viewer-activate]")?.disabled,
    modelCount: document.querySelectorAll("model-viewer").length,
    status: document.querySelector("[data-product-viewer-status]")?.textContent.trim() || ""
  }));
  const viewerRequestPaths = viewerRequests.map((url) => new URL(url).pathname);
  const expectedViewerRequests = [
    "/assets/product-viewer.js",
    "/assets/vendor/model-viewer.min.js",
    "/assets/merch-3d/cassette-002.glb"
  ];
  if (JSON.stringify(viewerRequestPaths) !== JSON.stringify(expectedViewerRequests)
    || viewerRequests.some((url) => new URL(url).origin !== baseUrl)
    || !viewerFallback.posterVisible
    || viewerFallback.activateDisabled
    || viewerFallback.modelCount
    || !viewerFallback.status) {
    fail(`Product viewer: activation/fallback contract failed ${JSON.stringify({ viewerRequestPaths, viewerFallback })}`);
  }
  await viewerContext.close();

  const noWebglContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const noWebglPage = await noWebglContext.newPage();
  await noWebglPage.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return nativeGetContext.call(this, type, options);
    };
  });
  const noWebglRequests = [];
  noWebglPage.on("request", (request) => {
    if (/\/assets\/(?:product-viewer\.js|vendor\/model-viewer\.min\.js|merch-3d\/)/.test(request.url())) {
      noWebglRequests.push(new URL(request.url()).pathname);
    }
  });
  await noWebglPage.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  await noWebglPage.locator("[data-product-viewer-activate]").click();
  await noWebglPage.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "error");
  const noWebglFallback = await noWebglPage.evaluate(() => ({
    posterVisible: !document.querySelector("[data-product-viewer-poster]")?.hidden,
    activateDisabled: document.querySelector("[data-product-viewer-activate]")?.disabled,
    modelCount: document.querySelectorAll("model-viewer").length,
    busy: document.querySelector("[data-product-viewer]")?.getAttribute("aria-busy")
  }));
  if (JSON.stringify(noWebglRequests) !== JSON.stringify(["/assets/product-viewer.js"])
    || !noWebglFallback.posterVisible
    || noWebglFallback.activateDisabled
    || noWebglFallback.modelCount
    || noWebglFallback.busy !== "false") {
    fail(`Product viewer: WebGL fallback failed ${JSON.stringify({ noWebglRequests, noWebglFallback })}`);
  }
  await noWebglContext.close();

  const touchSeekContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true
  });
  const touchSeekPage = await touchSeekContext.newPage();
  await touchSeekPage.goto(baseUrl, { waitUntil: "load" });
  await touchSeekPage.waitForFunction(
    () => document.querySelector("[data-audio-player]")?.dataset.waveformState === "ready"
  );
  await touchSeekPage.locator("[data-player-toggle]").click();
  await touchSeekPage.waitForFunction(
    () => document.querySelector("[data-audio-engine]")?.readyState >= 1
  );
  const touchWaveform = await advancedControl(touchSeekPage, "[data-player-waveform]");
  const touchBox = await touchWaveform.boundingBox();
  if (!touchBox) {
    fail("Touch timeline: waveform has no pointer box");
  } else {
    const touchY = touchBox.y + touchBox.height * 0.5;
    await touchWaveform.dispatchEvent("pointerdown", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: touchBox.x + touchBox.width * 0.2,
      clientY: touchY
    });
    await touchWaveform.dispatchEvent("pointermove", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      button: -1,
      buttons: 1,
      clientX: touchBox.x + touchBox.width * 0.7,
      clientY: touchY
    });
    await touchWaveform.dispatchEvent("pointerup", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: touchBox.x + touchBox.width * 0.7,
      clientY: touchY
    });
    const touchSeekTime = await touchSeekPage.locator("[data-audio-engine]")
      .evaluate((audio) => audio.currentTime);
    await touchWaveform.dispatchEvent("pointerdown", {
      pointerId: 42,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: touchBox.x + touchBox.width * 0.4,
      clientY: touchY
    });
    await touchWaveform.dispatchEvent("pointercancel", {
      pointerId: 42,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: touchBox.x + touchBox.width * 0.4,
      clientY: touchY
    });
    const cancelledSeeking = await touchSeekPage.locator("[data-audio-player]")
      .getAttribute("data-seeking");
    const touchAction = await touchWaveform.evaluate((element) => getComputedStyle(element).touchAction);
    if (Math.abs(touchSeekTime - defaultAudioTrack.duration * 0.7) > 1.2
      || cancelledSeeking === "true" || touchAction !== "pan-y") {
      fail(`Touch timeline: drag contract failed ${JSON.stringify({ touchSeekTime, cancelledSeeking, touchAction })}`);
    }
  }
  await touchSeekContext.close();

  const dynamicMotionContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "no-preference"
  });
  const dynamicMotionPage = await dynamicMotionContext.newPage();
  await dynamicMotionPage.goto(baseUrl, { waitUntil: "load" });
  await dynamicMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => [...video.querySelectorAll("source")].every((source) => source.hasAttribute("src"))));
  await dynamicMotionPage.mouse.move(240, 430);
  await dynamicMotionPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.dataset.signalMode === "tracking");
  await dynamicMotionPage.emulateMedia({ reducedMotion: "reduce" });
  await dynamicMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "disabled"
      && video.readyState === HTMLMediaElement.HAVE_NOTHING
      && [...video.querySelectorAll("source")].every((source) => !source.hasAttribute("src"))));
  await dynamicMotionPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.dataset.signalMode === "static");
  await dynamicMotionPage.emulateMedia({ reducedMotion: "no-preference" });
  await dynamicMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState !== "disabled"
      && [...video.querySelectorAll("source")].every((source) => source.hasAttribute("src"))));
  await dynamicMotionPage.mouse.move(180, 520);
  await dynamicMotionPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.dataset.signalMode === "tracking");
  await dynamicMotionContext.close();

  const delayedMotionContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "no-preference"
  });
  const delayedMotionPage = await delayedMotionContext.newPage();
  await delayedMotionPage.addInitScript(() => {
    window.__motionPlayQueue = [];
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        return new Promise((resolve, reject) => window.__motionPlayQueue.push({ resolve, reject }));
      }
    });
  });
  await delayedMotionPage.goto(baseUrl, { waitUntil: "load" });
  await delayedMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "loading"));
  await delayedMotionPage.emulateMedia({ reducedMotion: "reduce" });
  await delayedMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "disabled"));
  await delayedMotionPage.evaluate(() => {
    for (const attempt of window.__motionPlayQueue.splice(0)) attempt.resolve();
  });
  await delayedMotionPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const staleMotionStates = await delayedMotionPage.locator("[data-motion-video]").evaluateAll((videos) => videos.map((video) => ({
    state: video.dataset.motionState,
    readyState: video.readyState,
    sources: [...video.querySelectorAll("source")].map((source) => source.getAttribute("src"))
  })));
  if (staleMotionStates.some(({ state, readyState, sources }) => state !== "disabled" || readyState !== 0 || sources.some(Boolean))) {
    fail(`Motion: stale play promise revived disabled media ${JSON.stringify(staleMotionStates)}`);
  }
  await delayedMotionPage.emulateMedia({ reducedMotion: "no-preference" });
  await delayedMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "loading"
      && [...video.querySelectorAll("source")].every((source) => source.hasAttribute("src"))));
  await delayedMotionPage.evaluate(() => {
    for (const attempt of window.__motionPlayQueue.splice(0)) attempt.resolve();
  });
  await delayedMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "active"));
  await delayedMotionContext.close();

  const rejectedMotionContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "no-preference"
  });
  const rejectedMotionPage = await rejectedMotionContext.newPage();
  await rejectedMotionPage.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() { return Promise.reject(new DOMException("Blocked for QA", "NotAllowedError")); }
    });
  });
  await rejectedMotionPage.goto(baseUrl, { waitUntil: "load" });
  await rejectedMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "paused"));
  await rejectedMotionPage.emulateMedia({ reducedMotion: "reduce" });
  await rejectedMotionPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "disabled"
      && video.readyState === HTMLMediaElement.HAVE_NOTHING
      && [...video.querySelectorAll("source")].every((source) => !source.hasAttribute("src"))));
  await rejectedMotionContext.close();

  const dynamicSaveDataContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const dynamicSaveDataPage = await dynamicSaveDataContext.newPage();
  await dynamicSaveDataPage.addInitScript(() => {
    const connection = new EventTarget();
    connection.saveData = false;
    window.__qaConnection = connection;
    Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  });
  await dynamicSaveDataPage.goto(baseUrl, { waitUntil: "load" });
  await dynamicSaveDataPage.evaluate(() => {
    window.__qaConnection.saveData = true;
    window.__qaConnection.dispatchEvent(new Event("change"));
  });
  await dynamicSaveDataPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState === "disabled"
      && video.readyState === HTMLMediaElement.HAVE_NOTHING
      && [...video.querySelectorAll("source")].every((source) => !source.hasAttribute("src"))));
  if (await dynamicSaveDataPage.locator("[data-signal-field]").getAttribute("data-signal-mode") !== "static") {
    fail("Dynamic Save-Data: signal field did not stop tracking");
  }
  await dynamicSaveDataPage.evaluate(() => {
    window.__qaConnection.saveData = false;
    window.__qaConnection.dispatchEvent(new Event("change"));
  });
  await dynamicSaveDataPage.waitForFunction(() => [...document.querySelectorAll("[data-motion-video]")]
    .every((video) => video.dataset.motionState !== "disabled"
      && [...video.querySelectorAll("source")].every((source) => source.hasAttribute("src"))));
  await dynamicSaveDataPage.mouse.move(240, 430);
  await dynamicSaveDataPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.dataset.signalMode === "tracking");
  await dynamicSaveDataContext.close();

  const printContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const printPage = await printContext.newPage();
  await printPage.goto(`${baseUrl}/process/`, { waitUntil: "load" });
  await printPage.emulateMedia({ media: "print" });
  const printStyles = await printPage.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    header: getComputedStyle(document.querySelector(".site-header")).display,
    signal: getComputedStyle(document.querySelector(".site-signal-layer")).display
  }));
  if (printStyles.background !== "rgb(255, 255, 255)") fail(`Print: body background is ${printStyles.background}`);
  if (printStyles.header !== "none") fail(`Print: header display is ${printStyles.header}`);
  if (printStyles.signal !== "none") fail(`Print: signal field display is ${printStyles.signal}`);
  await printContext.close();

  for (const asset of [
    "/downloads/POVKH-LAB-Brand-Board-v1.0.pdf",
    "/assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg",
    "/assets/logo/povkh-lab-horizontal-dark-outlined.svg",
    "/assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg",
    "/assets/logo/povkh-lab-ascii-reverse-transparent-outlined.svg"
  ]) {
    const response = await fetch(`${baseUrl}${asset}`, { method: "HEAD" });
    if (!response.ok) fail(`Press asset unavailable: ${asset} (${response.status})`);
  }

  for (const [asset, expectedType] of [
    ["/assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.webm", "video/webm"],
    ["/assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.mp4", "video/mp4"],
    ...audioLibrary.tracks.map((track) => [`/assets/tracks/${track.file}`, "audio/mpeg"])
  ]) {
    const response = await fetch(`${baseUrl}${asset}`, { method: "HEAD" });
    if (response.status !== 200
      || response.headers.get("content-type") !== expectedType
      || response.headers.get("accept-ranges") !== "bytes") {
      fail(`Media delivery: ${asset} headers are ${response.status} / ${response.headers.get("content-type")} / ${response.headers.get("accept-ranges")}`);
    }
  }
  const audioRangeResponse = await fetch(`${baseUrl}/assets/tracks/${defaultAudioTrack.file}`, {
    headers: { Range: "bytes=0-1" }
  });
  if (audioRangeResponse.status !== 206
    || audioRangeResponse.headers.get("content-type") !== "audio/mpeg"
    || audioRangeResponse.headers.get("content-length") !== "2"
    || (await audioRangeResponse.arrayBuffer()).byteLength !== 2) {
    fail("Audio delivery: MIME or byte-range contract failed");
  }
  const rangeAsset = "/assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.webm";
  const rangeHead = await fetch(`${baseUrl}${rangeAsset}`, { method: "HEAD" });
  const rangeTotal = Number.parseInt(rangeHead.headers.get("content-length") || "", 10);
  if (!Number.isSafeInteger(rangeTotal) || rangeTotal < 100) fail(`Motion delivery: invalid source length ${rangeTotal}`);
  const rangeResponse = await fetch(`${baseUrl}${rangeAsset}`, {
    headers: { Range: "bytes=0-99" }
  });
  const rangeBody = await rangeResponse.arrayBuffer();
  if (rangeResponse.status !== 206
    || rangeResponse.headers.get("content-range") !== `bytes 0-99/${rangeTotal}`
    || rangeBody.byteLength !== 100) {
    fail(`Motion delivery: byte range contract failed ${rangeResponse.status} / ${rangeResponse.headers.get("content-range")} / ${rangeBody.byteLength}`);
  }
  const invalidRangeResponse = await fetch(`${baseUrl}${rangeAsset}`, {
    headers: { Range: "bytes=999999999-" }
  });
  if (invalidRangeResponse.status !== 416 || invalidRangeResponse.headers.get("content-range") !== `bytes */${rangeTotal}`) {
    fail(`Motion delivery: invalid range contract failed ${invalidRangeResponse.status} / ${invalidRangeResponse.headers.get("content-range")}`);
  }
  for (const unsupportedRange of ["items=0-99", "bytes=0-9,20-29", "bytes=invalid"]) {
    const fallbackRangeResponse = await fetch(`${baseUrl}${rangeAsset}`, { headers: { Range: unsupportedRange } });
    if (fallbackRangeResponse.status !== 200 || Number(fallbackRangeResponse.headers.get("content-length")) !== rangeTotal) {
      fail(`Motion delivery: unsupported range ${unsupportedRange} did not fall back to a full response`);
    }
    await fallbackRangeResponse.body?.cancel();
  }

  for (const { route } of routeCases.filter(({ route }) => route !== "/")) {
    const withoutSlash = route.slice(0, -1);
    const redirectResponse = await fetch(`${baseUrl}${withoutSlash}`, { redirect: "manual" });
    if (redirectResponse.status !== 308 || redirectResponse.headers.get("location") !== route) {
      fail(`Routing: ${withoutSlash} redirect is ${redirectResponse.status} → ${redirectResponse.headers.get("location")}, expected 308 → ${route}`);
    }
  }

  for (const malformedPath of ["/assets/styles.css/child", "/it/assets/styles.css/child"]) {
    const malformedResponse = await fetch(`${baseUrl}${malformedPath}`);
    if (malformedResponse.status !== 404) fail(`Routing: non-directory path ${malformedPath} returned ${malformedResponse.status}`);
  }
  const nullByteResponse = await fetch(`${baseUrl}/%00`);
  if (nullByteResponse.status !== 400) fail(`Routing: encoded null byte returned ${nullByteResponse.status}`);

  const missingCases = [
    { locale: locales[0], request: "/missing/deep/path/", heading: "Page not found", canonicalPath: "/404.html" },
    { locale: locales[1], request: "/it/missing/deep/path/", heading: "Pagina non trovata", canonicalPath: "/it/404.html" },
    { locale: locales[2], request: "/ru/missing/deep/path/", heading: "Страница не найдена", canonicalPath: "/ru/404.html" }
  ];
  const missingContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const missingPage = await missingContext.newPage();
  for (const missing of missingCases) {
    const missingResponse = await missingPage.goto(`${baseUrl}${missing.request}`, { waitUntil: "load" });
    if (!missingResponse || missingResponse.status() !== 404) fail(`Routing: ${missing.request} returned ${missingResponse?.status()}`);
    if ((await missingPage.locator("h1").textContent())?.trim() !== missing.heading) {
      fail(`Routing: ${missing.request} localized 404 heading missing`);
    }
    if (await missingPage.locator("html").getAttribute("lang") !== missing.locale.lang) {
      fail(`Routing: ${missing.request} 404 lang is not ${missing.locale.lang}`);
    }
    if (await missingPage.locator("body").getAttribute("data-locale") !== missing.locale.code) {
      fail(`Routing: ${missing.request} 404 data-locale is not ${missing.locale.code}`);
    }
    const missingCanonical = await missingPage.locator('link[rel="canonical"]').getAttribute("href");
    if (missingCanonical !== `${siteOrigin}${missing.canonicalPath}`) {
      fail(`Routing: ${missing.request} 404 canonical is ${missingCanonical}`);
    }
    const missingCurrent = await missingPage.locator('nav[data-language-switcher] [aria-current="page"]').getAttribute("hreflang");
    if (missingCurrent !== missing.locale.lang) fail(`Routing: ${missing.request} 404 current language is ${missingCurrent}`);
    const lightweight404 = await missingPage.evaluate(() => ({
      actions: document.querySelectorAll("a, button, summary").length,
      marked: document.body.hasAttribute("data-lightweight-shell"),
      forbidden: document.querySelectorAll("[data-audio-player], [data-hud-frame], [data-motion-video], [data-route-footer], .desktop-nav, .mobile-nav, .site-signal-layer").length
    }));
    if (lightweight404.actions !== 5 || !lightweight404.marked || lightweight404.forbidden !== 0) {
      fail(`Routing: ${missing.request} is not the exact lightweight five-action 404 ${JSON.stringify(lightweight404)}`);
    }
    const missingImages = await missingPage.locator("img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length);
    if (missingImages) fail(`Routing: ${missing.request} 404 has ${missingImages} broken images`);
    const missingBackground = await missingPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (missingBackground !== "rgb(8, 8, 8)") fail(`Routing: ${missing.request} 404 stylesheet not applied (${missingBackground})`);
    const headers = missingResponse?.headers() ?? {};
    if (headers["x-content-type-options"] !== "nosniff") fail(`Security: X-Content-Type-Options is ${headers["x-content-type-options"]}`);
    if (headers["x-frame-options"] !== "DENY") fail(`Security: X-Frame-Options is ${headers["x-frame-options"]}`);
    if (headers["referrer-policy"] !== "no-referrer") fail(`Security: Referrer-Policy is ${headers["referrer-policy"]}`);
  }
  await missingContext.close();

  const root404Html = await readFile(path.join(siteRoot, "dist", "404.html"), "utf8");
  const pagesFallbackContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const pagesFallbackPage = await pagesFallbackContext.newPage();
  for (const prefix of ["it", "ru"]) {
    const missingPath = `/${prefix}/github-pages-fallback-check/`;
    await pagesFallbackPage.route((url) => url.pathname === missingPath, (route) => route.fulfill({
      status: 404,
      contentType: "text/html; charset=utf-8",
      body: root404Html
    }));
    const fallbackResponse = await pagesFallbackPage.goto(`${baseUrl}${missingPath}`, { waitUntil: "load" });
    const fallbackContract = await pagesFallbackPage.evaluate(() => ({
      lang: document.documentElement.lang,
      lightweight: document.body.hasAttribute("data-lightweight-shell"),
      page404: document.body.classList.contains("page-404"),
      actions: document.querySelectorAll("a, button, summary").length,
      externalScripts: document.querySelectorAll("script[src]").length
    }));
    if (fallbackResponse?.status() !== 404 || fallbackContract.lang !== "en"
      || !fallbackContract.lightweight || !fallbackContract.page404
      || fallbackContract.actions !== 5 || fallbackContract.externalScripts !== 0) {
      fail(`GitHub Pages fallback: ${prefix} did not retain the lightweight no-script root 404 ${JSON.stringify(fallbackContract)}`);
    }
    await pagesFallbackPage.unroute((url) => url.pathname === missingPath);
  }
  await pagesFallbackContext.close();

  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const webkitContext = await webkitBrowser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "no-preference"
    });
    const webkitPage = await webkitContext.newPage();
    const webkitErrors = [];
    webkitPage.on("pageerror", (error) => webkitErrors.push(error.message));
    await webkitPage.goto(baseUrl, { waitUntil: "load" });
    await webkitPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
    await (await advancedControl(webkitPage, "[data-player-volume-toggle]")).click();
    await webkitPage.locator("[data-player-volume]").evaluate((range) => {
      range.value = "60";
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const webkitVolumeOpen = await webkitPage.evaluate(() => ({
      volume: document.querySelector("[data-audio-engine]")?.volume,
      popupHidden: document.querySelector("[data-player-volume-popup]")?.hidden
    }));
    const webkitWaveform = await advancedControl(webkitPage, "[data-player-waveform]");
    const webkitWaveformBox = await webkitWaveform.boundingBox();
    if (!webkitWaveformBox) {
      fail("WebKit audio: waveform has no pointer box");
    } else {
      await webkitPage.mouse.click(
        webkitWaveformBox.x + webkitWaveformBox.width * 0.4,
        webkitWaveformBox.y + webkitWaveformBox.height * 0.5
      );
    }
    await webkitPage.locator("[data-player-toggle]").click();
    await webkitPage.waitForFunction(() => document.querySelector("[data-audio-player]")?.dataset.playing === "true");
    await webkitPage.waitForTimeout(350);
    const webkitAudio = await webkitPage.evaluate(() => ({
      paused: document.querySelector("[data-audio-engine]")?.paused,
      currentTime: document.querySelector("[data-audio-engine]")?.currentTime,
      currentSrc: document.querySelector("[data-audio-engine]")?.currentSrc,
      volume: document.querySelector("[data-audio-engine]")?.volume,
      timelineTime: document.querySelector("[data-audio-engine]")?.currentTime,
      touchAction: getComputedStyle(document.querySelector("[data-player-waveform]")).touchAction,
      playing: document.querySelector("[data-audio-player]")?.dataset.playing,
      artist: document.querySelector("[data-player-artist]")?.textContent,
      waveform: document.querySelector("[data-audio-player]")?.dataset.waveformState
    }));
    if (webkitAudio.paused || webkitAudio.playing !== "true" || !webkitAudio.currentSrc?.endsWith("/assets/tracks/pvkh-007-opportunist.mp3")
      || webkitAudio.artist !== "ALESSANDRO POVKH & K/SMOKIN"
      || webkitAudio.waveform !== "ready"
      || Math.abs(webkitVolumeOpen.volume - 0.6) > 0.001 || webkitVolumeOpen.popupHidden
      || Math.abs(webkitAudio.volume - 0.6) > 0.001
      || Math.abs(webkitAudio.timelineTime - defaultAudioTrack.duration * 0.4) > 1.2
      || webkitAudio.touchAction !== "pan-y") {
      fail(`WebKit audio contract failed ${JSON.stringify(webkitAudio)}`);
    }
    await webkitPage.locator("[data-player-toggle]").click();

    await webkitPage.goto(`${baseUrl}/catalog/`, { waitUntil: "load" });
    await webkitPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.classList.contains("signal-field-ready"));
    await webkitPage.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      scrollTo(0, 1300);
    });
    await webkitPage.waitForTimeout(100);
    const webkitProbe = await webkitPage.evaluate(() => {
      const card = [...document.querySelectorAll(".release-card")].find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top > 80 && rect.bottom < innerHeight - 40 && rect.left < innerWidth * 0.55;
      });
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return {
        code: card.querySelector(".release-card-code")?.textContent?.trim(),
        x: Math.max(8, rect.left - 36),
        y: rect.top + Math.min(48, rect.height * 0.35)
      };
    });
    if (webkitProbe) {
      await webkitPage.mouse.move(webkitProbe.x, webkitProbe.y);
      await webkitPage.waitForFunction(() => Boolean(document.querySelector("[data-signal-panel-link]")?.getAttribute("d")));
    }
    const webkitSignal = await webkitPage.evaluate((probe) => ({
      mode: document.querySelector("[data-signal-field]")?.dataset.signalMode,
      target: document.querySelector("[data-signal-field]")?.dataset.signalTarget,
      path: document.querySelector("[data-signal-panel-link]")?.getAttribute("d"),
      brackets: document.querySelector("[data-signal-target-brackets]")?.getAttribute("d"),
      legacy: document.querySelectorAll("[data-signal-shell], [data-signal-readout], [data-signal-link]").length,
      pointerEvents: getComputedStyle(document.querySelector(".site-signal-layer")).pointerEvents,
      probe
    }), webkitProbe);
    if (!webkitProbe || webkitSignal.mode !== "tracking" || webkitSignal.target !== webkitProbe.code
      || !webkitSignal.path || !webkitSignal.brackets || webkitSignal.legacy !== 0 || webkitSignal.pointerEvents !== "none") {
      fail(`WebKit magnetic line contract failed ${JSON.stringify(webkitSignal)}`);
    }

    await webkitPage.goto(`${baseUrl}/process/`, { waitUntil: "load" });
    await webkitPage.goBack({ waitUntil: "domcontentloaded" });
    await webkitPage.waitForFunction(() => document.querySelector("[data-signal-field]")?.classList.contains("signal-field-ready"));
    await webkitPage.evaluate(() => scrollTo(0, 1300));
    if (webkitProbe) {
      await webkitPage.mouse.move(webkitProbe.x, webkitProbe.y);
      await webkitPage.waitForFunction(() => Boolean(document.querySelector("[data-signal-panel-link]")?.getAttribute("d")));
    }
    if (webkitErrors.length) fail(`WebKit signal page errors: ${webkitErrors.join(" | ")}`);
    await webkitPage.screenshot({ path: path.join(screenshotDir, "signal-webkit-1440.png") });
    await webkitContext.close();
  } finally {
    await webkitBrowser.close();
  }
} finally {
  await browser.close();
  await app.close();
}

await writeFile(path.join(screenshotDir, "qa-report.json"), `${JSON.stringify({
  passed: failures.length === 0,
  viewportChecks,
  fallbackTypographyChecks,
  axeScans,
  routes,
  viewports,
  checks: [
    "HTTP",
    "landmarks",
    "localized html lang",
    "canonical and hreflang",
    "language switcher contract",
    "horizontal overflow",
    "display typography and container bounds",
    "failed-font typography",
    "images",
    "responsive navigation",
    "44px language targets",
    "verified streaming CTA contract",
    "44px streaming targets and 8px gaps",
    "localized smart-link routing",
    "localized DROP 001 detail routes and native-dialog galleries",
    "merch gallery keyboard, focus restore and no-JavaScript image fallback",
    "WCAG A/AA",
    "keyboard",
    "deep language routing",
    "touch",
    "JavaScript-disabled routing",
    "200% text zoom",
    "reduced motion",
    "Save-Data media suppression",
    "audio player, waveform and Media Session",
    "audio/video MIME and byte ranges",
    "print",
    "press downloads",
    "localized redirects",
    "localized deep 404",
    "WebKit audio and magnetic-line history restore",
    "security headers"
  ],
  failures
}, null, 2)}\n`, "utf8");

if (failures.length) {
  console.error(`Browser QA failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Browser QA passed: ${viewportChecks} route/viewport checks, ${fallbackTypographyChecks} failed-font typography checks, ${axeScans} axe scans, 3 languages, Chromium + WebKit audio and magnetic-line contracts, streaming/smart-link contracts, keyboard/touch/no-JS switching, reduced motion/save-data, audio/video ranges, print, redirects, localized 404 and security headers.`);
}
