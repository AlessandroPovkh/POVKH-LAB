import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COPY } from "../src/i18n.mjs";
import { createStaticServer } from "./server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("../../tools/node_modules/playwright");
const AxeBuilder = require("../../tools/node_modules/@axe-core/playwright").default;

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = path.join(siteRoot, "artifacts", "qa");
const siteOrigin = "https://povkh-lab.example";
const catalog = JSON.parse(await readFile(path.join(siteRoot, "data", "catalog.json"), "utf8"));
const publishedReleaseCount = catalog.releases.filter((release) => release.status === "published").length;
const upcomingReleaseCount = catalog.releases.filter((release) => release.status === "upcoming").length;
const baseRoutes = [
  "/",
  "/catalog/",
  ...catalog.releases.map((release) => `/catalog/${release.slug}/`),
  ...catalog.releases.filter((release) => release.streamingLinks).map((release) => `/listen/${release.slug}/`),
  "/artists/",
  "/process/",
  "/about/",
  "/press/",
  "/contact/",
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
  ["/ru/contact/@375", "contact-ru-mobile-375.png"]
]);
const failures = [];
let axeScans = 0;
let viewportChecks = 0;

const fail = (message) => failures.push(message);
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

const app = createStaticServer({ root: path.join(siteRoot, "dist") });
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

      const brokenImages = await page.locator("img").evaluateAll((images) => images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")));
      if (brokenImages.length) fail(`${label}: broken images ${brokenImages.join(", ")}`);

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
            result: document.querySelector("[data-filter-result]")?.textContent.trim() || ""
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
            jsonLdSameAs: recording?.sameAs || null
          };
        });
        if (!expectedRelease || releaseContract.id !== expectedRelease.id || releaseContract.status !== expectedRelease.status) {
          fail(`${label}: release identity/status mismatch ${JSON.stringify(releaseContract)}`);
        }
        if (releaseContract.title !== expectedRelease?.title || releaseContract.releaseDate !== expectedRelease?.releaseDate) {
          fail(`${label}: release title/date mismatch ${JSON.stringify(releaseContract)}`);
        }
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
        if (expectedRelease?.primaryGenre && releaseContract.primaryGenre !== expectedRelease.primaryGenre) {
          fail(`${label}: displayed platform genre is ${releaseContract.primaryGenre}, expected ${expectedRelease.primaryGenre}`);
        }
        if (!releaseContract.primaryGenre) fail(`${label}: platform-genre field is empty`);
        const expectedEditorialTags = expectedRelease?.editorialTags.length ? expectedRelease.editorialTags.join(" / ") : null;
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

      const expectedMobile = viewport.width < 1280;
      const navVisibility = await page.evaluate(() => {
        const desktop = document.querySelector(".desktop-nav");
        const mobile = document.querySelector(".mobile-nav");
        return {
          desktop: desktop ? getComputedStyle(desktop).display : null,
          mobile: mobile ? getComputedStyle(mobile).display : null
        };
      });
      if (expectedMobile && navVisibility.mobile === "none") fail(`${label}: mobile navigation hidden below 1280px`);
      if (expectedMobile && navVisibility.desktop !== "none") fail(`${label}: desktop navigation visible below 1280px`);
      if (!expectedMobile && navVisibility.desktop === "none") fail(`${label}: desktop navigation hidden at or above 1280px`);
      if (!expectedMobile && navVisibility.mobile !== "none") fail(`${label}: mobile navigation visible at or above 1280px`);
      if (navVisibility.desktop === null || navVisibility.mobile === null) fail(`${label}: responsive navigation element missing`);

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
        await page.screenshot({ path: path.join(screenshotDir, screenshotName), fullPage: true });
      }
      viewportChecks += 1;
    }

    if (consoleErrors.length) fail(`${viewport.name}: console errors: ${[...new Set(consoleErrors)].join(" | ")}`);
    if (pageErrors.length) fail(`${viewport.name}: page errors: ${[...new Set(pageErrors)].join(" | ")}`);
    await context.close();
  }

  const interactionContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const interactionPage = await interactionContext.newPage();
  await interactionPage.goto(baseUrl, { waitUntil: "load" });
  await interactionPage.keyboard.press("Tab");
  if (!await interactionPage.locator(".skip-link").evaluate((element) => element === document.activeElement)) {
    fail("Keyboard: skip link is not the first focus target");
  }
  await interactionPage.keyboard.press("Enter");
  if (!await interactionPage.locator("main").evaluate((element) => element === document.activeElement)) {
    fail("Keyboard: skip link does not move focus to main");
  }
  await interactionPage.locator(".menu-summary").focus();
  await interactionPage.keyboard.press("Enter");
  if (!await interactionPage.locator(".mobile-nav").evaluate((element) => element.open)) fail("Keyboard: mobile menu did not open");
  await interactionPage.keyboard.press("Escape");
  if (await interactionPage.locator(".mobile-nav").evaluate((element) => element.open)) fail("Keyboard: Escape did not close mobile menu");
  const focusStyle = await interactionPage.locator(".menu-summary").evaluate((element) => getComputedStyle(element).outlineStyle);
  if (focusStyle === "none") fail("Keyboard: focused menu control has no visible outline");

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
  const italianLanguageLink = interactionPage.locator('nav[data-language-switcher] .language-link[hreflang="it"]');
  await italianLanguageLink.focus();
  const languageFocusStyle = await italianLanguageLink.evaluate((element) => getComputedStyle(element).outlineStyle);
  if (languageFocusStyle === "none") fail("Keyboard: focused language link has no visible outline");
  await Promise.all([
    interactionPage.waitForURL(`${baseUrl}/it/catalog/pvkh-001/`),
    interactionPage.keyboard.press("Enter")
  ]);
  if (await interactionPage.locator("html").getAttribute("lang") !== "it") fail("Language routing: EN → IT deep route has wrong html lang");
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

  const touchContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${baseUrl}/it/catalog/pvkh-001/`, { waitUntil: "load" });
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
  await noScriptContext.close();

  const textZoomContext = await browser.newContext({ viewport: { width: 320, height: 780 } });
  const textZoomPage = await textZoomContext.newPage();
  for (const route of ["/catalog/pvkh-001/", "/ru/catalog/pvkh-001/", "/ru/listen/pvkh-011/"]) {
    await textZoomPage.goto(`${baseUrl}${route}`, { waitUntil: "load" });
    const zoomMetrics = await textZoomPage.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
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
      return {
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        targets
      };
    });
    if (zoomMetrics.documentWidth > zoomMetrics.viewport + 1) {
      fail(`200% text zoom: ${route} overflows ${zoomMetrics.documentWidth - zoomMetrics.viewport}px horizontally`);
    }
    if (!zoomMetrics.targets.length || zoomMetrics.targets.some(({ visible, width, height }) => !visible || width < 44 || height < 44)) {
      fail(`200% text zoom: ${route} has an unavailable streaming target ${JSON.stringify(zoomMetrics.targets)}`);
    }
    if (zoomMetrics.targets.some(({ width, height, scrollWidth, scrollHeight }) => scrollWidth > width + 0.5 || scrollHeight > height + 0.5)) {
      fail(`200% text zoom: ${route} clips streaming CTA content ${JSON.stringify(zoomMetrics.targets)}`);
    }
  }
  await textZoomContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce"
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(baseUrl, { waitUntil: "load" });
  const reducedStyles = await reducedPage.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionDuration: getComputedStyle(document.querySelector(".button")).transitionDuration
  }));
  if (reducedStyles.scrollBehavior !== "auto") fail(`Reduced motion: scroll-behavior is ${reducedStyles.scrollBehavior}`);
  const reducedDurations = reducedStyles.transitionDuration.split(",").map((value) => Number.parseFloat(value));
  if (reducedDurations.some((value) => !Number.isFinite(value) || value > 0.00002)) {
    fail(`Reduced motion: transition duration is ${reducedStyles.transitionDuration}`);
  }
  await reducedContext.close();

  const printContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const printPage = await printContext.newPage();
  await printPage.goto(`${baseUrl}/process/`, { waitUntil: "load" });
  await printPage.emulateMedia({ media: "print" });
  const printStyles = await printPage.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    header: getComputedStyle(document.querySelector(".site-header")).display
  }));
  if (printStyles.background !== "rgb(255, 255, 255)") fail(`Print: body background is ${printStyles.background}`);
  if (printStyles.header !== "none") fail(`Print: header display is ${printStyles.header}`);
  await printContext.close();

  for (const asset of [
    "/downloads/POVKH-LAB-Brand-Board-v1.0.pdf",
    "/assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg",
    "/assets/logo/povkh-lab-horizontal-dark-outlined.svg",
    "/assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg"
  ]) {
    const response = await fetch(`${baseUrl}${asset}`, { method: "HEAD" });
    if (!response.ok) fail(`Press asset unavailable: ${asset} (${response.status})`);
  }

  for (const { route } of routeCases.filter(({ route }) => route !== "/")) {
    const withoutSlash = route.slice(0, -1);
    const redirectResponse = await fetch(`${baseUrl}${withoutSlash}`, { redirect: "manual" });
    if (redirectResponse.status !== 308 || redirectResponse.headers.get("location") !== route) {
      fail(`Routing: ${withoutSlash} redirect is ${redirectResponse.status} → ${redirectResponse.headers.get("location")}, expected 308 → ${route}`);
    }
  }

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
} finally {
  await browser.close();
  await app.close();
}

await writeFile(path.join(screenshotDir, "qa-report.json"), `${JSON.stringify({
  passed: failures.length === 0,
  viewportChecks,
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
    "images",
    "responsive navigation",
    "44px language targets",
    "verified streaming CTA contract",
    "44px streaming targets and 8px gaps",
    "localized smart-link routing",
    "WCAG A/AA",
    "keyboard",
    "deep language routing",
    "touch",
    "JavaScript-disabled routing",
    "200% text zoom",
    "reduced motion",
    "print",
    "press downloads",
    "localized redirects",
    "localized deep 404",
    "security headers"
  ],
  failures
}, null, 2)}\n`, "utf8");

if (failures.length) {
  console.error(`Browser QA failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Browser QA passed: ${viewportChecks} route/viewport checks, ${axeScans} axe scans, 3 languages, streaming/smart-link contracts, keyboard/touch/no-JS switching, reduced motion, print, redirects, localized 404 and security headers.`);
}
