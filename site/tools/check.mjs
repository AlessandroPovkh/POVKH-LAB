import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasValidStreamingServiceOrder, isOfficialStreamingUrl } from "../src/streaming.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(siteRoot, "dist");
const siteOrigin = "https://povkh-lab.example";
const failures = [];

const locales = [
  {
    id: "en",
    lang: "en",
    prefix: "",
    label: "EN",
    selfName: "English",
    ogLocale: "en_GB",
    manifest: "site.webmanifest",
    manifestIcon: "assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg"
  },
  {
    id: "it",
    lang: "it",
    prefix: "it",
    label: "IT",
    selfName: "Italiano",
    ogLocale: "it_IT",
    manifest: "it/site.webmanifest",
    manifestIcon: "../assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg"
  },
  {
    id: "ru",
    lang: "ru",
    prefix: "ru",
    label: "RU",
    selfName: "Русский",
    ogLocale: "ru_RU",
    manifest: "ru/site.webmanifest",
    manifestIcon: "../assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg"
  }
];

const catalogPath = path.join(siteRoot, "data", "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const releaseRoutes = Array.isArray(catalog.releases)
  ? catalog.releases.map((release) => `catalog/${release.slug}`)
  : [];
const listenRoutes = Array.isArray(catalog.releases)
  ? catalog.releases.filter((release) => release.streamingLinks).map((release) => `listen/${release.slug}`)
  : [];
const contentRoutes = [
  "",
  "about",
  "artists",
  "catalog",
  "contact",
  "download",
  "press",
  "process",
  ...releaseRoutes,
  ...listenRoutes
];

const publicPathFor = (locale, route) => {
  const localized = [locale.prefix, route === "404" ? "" : route].filter(Boolean).join("/");
  if (route === "404") return `/${locale.prefix ? `${locale.prefix}/` : ""}404.html`;
  return localized ? `/${localized}/` : "/";
};

const outputPathFor = (locale, route) => {
  if (route === "404") return `${locale.prefix ? `${locale.prefix}/` : ""}404.html`;
  const localized = [locale.prefix, route].filter(Boolean).join("/");
  return localized ? `${localized}/index.html` : "index.html";
};

const pageCases = locales.flatMap((locale) => [
  ...contentRoutes.map((route) => ({
    locale,
    route,
    relative: outputPathFor(locale, route),
    publicPath: publicPathFor(locale, route)
  })),
  {
    locale,
    route: "404",
    relative: outputPathFor(locale, "404"),
    publicPath: publicPathFor(locale, "404")
  }
]);

const fail = (message) => failures.push(message);

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const isHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const exists = async (file) => {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const listFiles = async (dir, base = dir) => {
  const result = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(absolute, base));
    if (entry.isFile()) result.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return result;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const tagsFor = (html, tagName) => [
  ...html.matchAll(new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, "gi"))
].map((match) => match[0]);

const attribute = (tag, name) => {
  const escaped = escapeRegExp(name);
  const match = tag.match(new RegExp(`\\s${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'))?(?=\\s|/?>)`, "i"));
  if (!match) return null;
  return match[1] ?? match[2] ?? "";
};

const hasClass = (tag, className) => (attribute(tag, "class") || "").split(/\s+/).includes(className);

const singleMetaContent = (html, key, value, label) => {
  const matches = tagsFor(html, "meta").filter((tag) => attribute(tag, key) === value);
  if (matches.length !== 1) {
    fail(`${label}: expected exactly one meta ${key}="${value}", found ${matches.length}`);
    return null;
  }
  const content = attribute(matches[0], "content");
  if (content === null) fail(`${label}: meta ${key}="${value}" has no content`);
  return content;
};

const resolveReference = (pageCase, reference) => new URL(
  reference,
  new URL(pageCase.publicPath, siteOrigin)
);

const validateDirectStreamingAnchors = ({ anchors, release, label }) => {
  const expectedLinks = release.streamingLinks || [];
  if (anchors.length !== expectedLinks.length) {
    fail(`${label}: direct streaming CTA count is ${anchors.length}, expected ${expectedLinks.length}`);
  }
  for (const expected of expectedLinks) {
    const matches = anchors.filter((anchor) => attribute(anchor, "data-streaming-service") === expected.service);
    if (matches.length !== 1) {
      fail(`${label}: expected exactly one ${expected.service} CTA, found ${matches.length}`);
      continue;
    }
    const anchor = matches[0];
    if (attribute(anchor, "href") !== expected.url) fail(`${label}: ${expected.service} URL does not match source data`);
    if (!attribute(anchor, "aria-label")) fail(`${label}: ${expected.service} CTA has no accessible name`);
    if (attribute(anchor, "target") !== "_blank") fail(`${label}: ${expected.service} CTA must open in a new tab`);
    const rel = new Set((attribute(anchor, "rel") || "").split(/\s+/).filter(Boolean));
    if (!rel.has("noopener") || !rel.has("noreferrer")) fail(`${label}: ${expected.service} CTA is missing safe rel tokens`);
  }
  const expectedServices = new Set(expectedLinks.map(({ service }) => service));
  for (const anchor of anchors) {
    const service = attribute(anchor, "data-streaming-service");
    if (!expectedServices.has(service)) fail(`${label}: unexpected direct streaming service ${service || "(missing)"}`);
  }
};

for (const [service, url] of [
  ["spotify", "https://open.spotify.com/track/a"],
  ["spotify", "https://open.spotify.com:444/track/6a65PgYFVcLYcYZP47c6xc"],
  ["youtubeMusic", "https://music.youtube.com/watch?v=x"],
  ["youtubeMusic", "https://music.youtube.com/watch?v=xs9Ms-0UPBo&list=extra"],
  ["amazonMusic", "https://music.amazon.com/albums/A"],
  ["appleMusic", "https://music.apple.com/us/album/overdose/1821154298?i=1821154306#fragment"]
]) {
  if (isOfficialStreamingUrl(service, url)) fail(`Streaming URL validator accepted invalid ${service} fixture: ${url}`);
}

const expectedPageFiles = pageCases.map(({ relative }) => relative).sort();
const allDistFiles = await listFiles(distDir);
const htmlFiles = allDistFiles.filter((file) => file.endsWith(".html")).sort();

if (JSON.stringify(htmlFiles) !== JSON.stringify(expectedPageFiles)) {
  const missing = expectedPageFiles.filter((file) => !htmlFiles.includes(file));
  const extra = htmlFiles.filter((file) => !expectedPageFiles.includes(file));
  if (missing.length) fail(`Missing localized pages: ${missing.join(", ")}`);
  if (extra.length) fail(`Unexpected localized pages: ${extra.join(", ")}`);
  if (!missing.length && !extra.length) fail("Localized page order is not deterministic");
}

const expectedHtmlCount = locales.length * (contentRoutes.length + 1);
if (htmlFiles.length !== expectedHtmlCount) fail(`Localized site must contain exactly ${expectedHtmlCount} HTML pages; found ${htmlFiles.length}`);

if (catalog.schemaVersion !== 2) fail("Catalog schema version must be 2");
if (!isIsoDate(catalog.asOf)) fail("Catalog snapshot must be a valid ISO date");
const snapshotDate = isIsoDate(catalog.asOf) ? Date.parse(`${catalog.asOf}T23:59:59Z`) : Number.NaN;
if (catalog.label?.officialName !== "Povkh Lab Recordings" || catalog.label?.publicMark !== "POVKH LAB") fail("Approved label names are missing");
if (catalog.label?.founder !== "Aleksandr Babenko (Povkh)" || catalog.label?.founded !== 2025 || catalog.label?.location !== "Brescia (BS), Italia") {
  fail("Approved founder, year or location is incorrect");
}
if (!Array.isArray(catalog.releases) || catalog.releases.length !== 13) fail("Catalog must contain exactly 13 releases");
const releaseByRoute = new Map();
const smartReleaseByRoute = new Map();
const seenTuneCoreIds = new Set();
for (const [index, release] of (catalog.releases || []).entries()) {
  const sequence = String(index + 1).padStart(3, "0");
  if (release.id !== `PVKH-${sequence}` || release.slug !== `pvkh-${sequence}`) fail(`Catalog sequence mismatch at position ${index + 1}`);
  if (!/^(published|upcoming)$/.test(release.status) || release.public !== true) fail(`${release.id}: invalid public status`);
  if (!Array.isArray(release.artists) || release.artistCredit !== release.artists.join(" & ")) fail(`${release.id}: invalid artist identity model`);
  if (typeof release.title !== "string" || !release.title.trim()) fail(`${release.id}: release title is missing`);
  if (seenTuneCoreIds.has(release.tuneCoreId)) fail(`${release.id}: duplicate TuneCore ID`);
  seenTuneCoreIds.add(release.tuneCoreId);
  if (!/^\d+$/.test(release.tuneCoreId || "")) fail(`${release.id}: invalid TuneCore ID`);
  if (typeof release.tuneCoreIdNeedsOwnerVerification !== "boolean") fail(`${release.id}: TuneCore ID verification flag must be boolean`);
  if (!isIsoDate(release.releaseDate)) fail(`${release.id}: invalid release date`);
  const releaseDate = isIsoDate(release.releaseDate) ? Date.parse(`${release.releaseDate}T00:00:00Z`) : Number.NaN;
  if (Number.isFinite(snapshotDate) && Number.isFinite(releaseDate)) {
    if (release.status === "published" && releaseDate > snapshotDate) fail(`${release.id}: future release cannot be published on this snapshot`);
    if (release.status === "upcoming" && releaseDate <= snapshotDate) fail(`${release.id}: past release cannot remain upcoming on this snapshot`);
  }
  if (!Array.isArray(release.formats) || release.formats.length !== 1 || release.formats[0] !== "digital") fail(`${release.id}: invalid format model`);
  if (!Array.isArray(release.tracks) || release.tracks.length !== 1 || release.trackCount !== 1) {
    fail(`${release.id}: expected one track`);
  } else {
    if (release.tracks[0].title !== release.title) fail(`${release.id}: track title must match release title`);
    if (release.tracks[0].duration !== null && !/^\d+:[0-5]\d$/.test(release.tracks[0].duration)) fail(`${release.id}: invalid track duration`);
  }
  if (release.primaryGenre !== null && (typeof release.primaryGenre !== "string" || !release.primaryGenre.trim())) fail(`${release.id}: primaryGenre must be null or a verified platform genre`);
  if (release.status === "published" && !release.primaryGenre) fail(`${release.id}: published release is missing a verified platform genre`);
  if (!Array.isArray(release.editorialTags) || release.editorialTags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    fail(`${release.id}: editorialTags must contain only non-empty strings`);
  } else {
    const normalizedTags = release.editorialTags.map((tag) => tag.trim().toLocaleLowerCase("en"));
    if (new Set(normalizedTags).size !== normalizedTags.length) fail(`${release.id}: duplicate editorial tags`);
    if (release.primaryGenre && normalizedTags.includes(release.primaryGenre.toLocaleLowerCase("en"))) fail(`${release.id}: platform genre is duplicated as an editorial tag`);
  }
  if (!release.editorial || typeof release.editorial.contentBasis !== "string" || !release.editorial.contentBasis.trim()
    || typeof release.editorial.genreBasis !== "string" || !release.editorial.genreBasis.trim()
    || typeof release.editorial.reviewRequired !== "boolean") {
    fail(`${release.id}: editorial provenance is incomplete`);
  }
  if (release.status === "published") {
    if (!Array.isArray(release.streamingLinks) || release.streamingLinks.length !== 3) {
      fail(`${release.id}: published release must have exactly three verified streaming links`);
    } else {
      const services = release.streamingLinks.map((link) => link?.service);
      if (!hasValidStreamingServiceOrder(services)) {
        fail(`${release.id}: invalid streaming service order`);
      }
      if (new Set(services).size !== services.length) fail(`${release.id}: duplicate streaming service`);
      const streamingUrls = new Set();
      for (const link of release.streamingLinks) {
        if (!link || JSON.stringify(Object.keys(link).sort()) !== JSON.stringify(["service", "url"])) {
          fail(`${release.id}: streaming link must contain only service and url`);
          continue;
        }
        if (!isOfficialStreamingUrl(link.service, link.url)) fail(`${release.id}: ${link.service} URL does not match its official service`);
        if (streamingUrls.has(link.url)) fail(`${release.id}: duplicate streaming URL`);
        streamingUrls.add(link.url);
      }
    }
    if (release.preorderDate !== null || release.preorderUrl !== null) fail(`${release.id}: unverified historical preorder data must be omitted`);
  }
  if (Object.hasOwn(release, "listenUrl")) fail(`${release.id}: removed listenUrl field is still present`);
  if (release.status === "upcoming") {
    if (release.streamingLinks !== null) fail(`${release.id}: upcoming release must not expose unverified streaming links`);
    if (!isIsoDate(release.preorderDate)) {
      fail(`${release.id}: upcoming release needs a valid preorder date`);
    } else if (Number.isFinite(releaseDate) && Date.parse(`${release.preorderDate}T00:00:00Z`) >= releaseDate) {
      fail(`${release.id}: preorder must begin before release`);
    }
    if (release.preorderUrl !== null && !isHttpsUrl(release.preorderUrl)) fail(`${release.id}: preorderUrl must be null or a valid HTTPS URL`);
    if (release.preorderUrl !== null && isIsoDate(release.preorderDate) && Number.isFinite(snapshotDate)
      && snapshotDate < Date.parse(`${release.preorderDate}T00:00:00Z`)) {
      fail(`${release.id}: preorder URL cannot be public before the preorder date`);
    }
  }
  for (const locale of locales) {
    const localized = release.content?.[locale.id];
    for (const field of ["short", "story", "mood", "audience"]) {
      if (typeof localized?.[field] !== "string" || !localized[field].trim()) fail(`${release.id}: content.${locale.id}.${field} is missing`);
    }
  }
  releaseByRoute.set(`catalog/${release.slug}`, release);
  if (release.streamingLinks) smartReleaseByRoute.set(`listen/${release.slug}`, release);
}
const publishedReleases = (catalog.releases || []).filter((release) => release.status === "published");
const upcomingReleases = (catalog.releases || []).filter((release) => release.status === "upcoming");
if (publishedReleases.length + upcomingReleases.length !== (catalog.releases || []).length) fail("Every release must have a supported status");
for (const [id, expectedDate] of [["PVKH-001", "2025-07-11"], ["PVKH-002", "2025-07-30"], ["PVKH-008", "2026-05-22"], ["PVKH-010", "2026-06-19"]]) {
  if (catalog.releases?.find((release) => release.id === id)?.releaseDate !== expectedDate) fail(`${id}: corrected official date regressed`);
}
if (catalog.releases?.find((release) => release.id === "PVKH-009")?.title !== "Near (Slowed)") fail("PVKH-009: official title regressed");
if (catalog.releases?.find((release) => release.id === "PVKH-013")?.title !== "Все сон") fail("PVKH-013: intentional title spelling regressed");
if (await exists(path.join(distDir, "data", "catalog.json"))) fail("Internal catalog source must not be copied into the public build");

const robots = await readFile(path.join(distDir, "robots.txt"), "utf8");
if (robots !== "User-agent: *\nDisallow: /\n") fail("robots.txt must disallow the complete pre-launch site");

const seenDescriptions = new Map(locales.map((locale) => [locale.id, new Map()]));
for (const pageCase of pageCases) {
  const absolute = path.join(distDir, pageCase.relative);
  if (!await exists(absolute)) continue;

  const html = await readFile(absolute, "utf8");
  const label = pageCase.relative;
  const expectedCanonical = `${siteOrigin}${pageCase.publicPath}`;

  if (!/^<!doctype html>/i.test(html)) fail(`${label}: missing doctype`);

  const htmlTags = tagsFor(html, "html");
  if (htmlTags.length !== 1 || attribute(htmlTags[0], "lang") !== pageCase.locale.lang) {
    fail(`${label}: html lang must be exactly ${pageCase.locale.lang}`);
  }

  const bodyTags = tagsFor(html, "body");
  if (bodyTags.length !== 1) {
    fail(`${label}: expected exactly one body element`);
  } else {
    if (attribute(bodyTags[0], "data-site-status") !== "prelaunch") fail(`${label}: missing prelaunch site marker`);
    if (attribute(bodyTags[0], "data-locale") !== pageCase.locale.id) fail(`${label}: body locale marker is incorrect`);
  }

  if (!/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html)) fail(`${label}: invalid viewport meta`);
  if (!/<main id="main-content" tabindex="-1">/.test(html)) fail(`${label}: missing focusable main landmark`);
  if (!/class="skip-link" href="#main-content"/.test(html)) fail(`${label}: missing skip link`);
  if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) fail(`${label}: pre-launch site must remain noindex`);
  if ((html.match(/<h1\b/g) || []).length !== 1) fail(`${label}: expected exactly one h1`);
  if (/\sstyle=/.test(html)) fail(`${label}: inline styles are prohibited by CSP`);
  if (/on(?:click|load|error)=/i.test(html)) fail(`${label}: inline event handler found`);
  if (/(?:fonts\.googleapis|cdnjs|unpkg|jsdelivr|googletagmanager|google-analytics)/i.test(html)) fail(`${label}: external CDN or tracker found`);
  if (/PVKH[—–‑]\d{3}/.test(html)) fail(`${label}: catalog codes must use a canonical ASCII hyphen`);
  if (/\b(?:123\d{7}|11233799518)\b/.test(html)) fail(`${label}: internal TuneCore ID leaked into rendered HTML`);

  const metaDescription = singleMetaContent(html, "name", "description", label);
  if (metaDescription) {
    const decodedDescription = metaDescription
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", "\"")
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
    if (decodedDescription.length > 160) fail(`${label}: meta description is ${decodedDescription.length} characters; maximum is 160`);
    const previousRoute = seenDescriptions.get(pageCase.locale.id).get(metaDescription);
    if (previousRoute) fail(`${label}: meta description duplicates ${previousRoute}`);
    seenDescriptions.get(pageCase.locale.id).set(metaDescription, label);
    const ogDescription = singleMetaContent(html, "property", "og:description", label);
    if (ogDescription !== metaDescription) fail(`${label}: OpenGraph description must match the meta description`);
  }

  for (const anchor of tagsFor(html, "a")) {
    if (attribute(anchor, "target") !== "_blank") continue;
    const rel = new Set((attribute(anchor, "rel") || "").split(/\s+/).filter(Boolean));
    if (!rel.has("noopener") || !rel.has("noreferrer")) fail(`${label}: target=_blank link must use noopener noreferrer`);
  }

  const linkTags = tagsFor(html, "link");
  const canonicalTags = linkTags.filter((tag) => attribute(tag, "rel") === "canonical");
  if (canonicalTags.length !== 1) {
    fail(`${label}: expected exactly one canonical link, found ${canonicalTags.length}`);
  } else if (attribute(canonicalTags[0], "href") !== expectedCanonical) {
    fail(`${label}: canonical must be ${expectedCanonical}`);
  }

  const ogUrl = singleMetaContent(html, "property", "og:url", label);
  if (ogUrl !== null && ogUrl !== expectedCanonical) fail(`${label}: og:url must match the self-canonical`);

  const ogLocale = singleMetaContent(html, "property", "og:locale", label);
  if (ogLocale !== null && ogLocale !== pageCase.locale.ogLocale) fail(`${label}: incorrect OpenGraph locale ${ogLocale}`);

  const ogLocaleAlternates = tagsFor(html, "meta")
    .filter((tag) => attribute(tag, "property") === "og:locale:alternate")
    .map((tag) => attribute(tag, "content"))
    .sort();
  const expectedOgAlternates = locales
    .filter((locale) => locale.id !== pageCase.locale.id)
    .map((locale) => locale.ogLocale)
    .sort();
  if (JSON.stringify(ogLocaleAlternates) !== JSON.stringify(expectedOgAlternates)) {
    fail(`${label}: OpenGraph locale alternates are incomplete or duplicated`);
  }

  if (!/<meta property="og:image" content="https:\/\/povkh-lab\.example\/assets\/og\/povkh-lab-og-placeholder\.png">/.test(html)) {
    fail(`${label}: missing OpenGraph placeholder`);
  }

  const alternateTags = linkTags.filter((tag) => attribute(tag, "rel") === "alternate");
  if (alternateTags.length !== 4) fail(`${label}: expected exactly four hreflang alternates, found ${alternateTags.length}`);
  const actualAlternates = new Map();
  for (const tag of alternateTags) {
    const hreflang = attribute(tag, "hreflang");
    const href = attribute(tag, "href");
    if (!hreflang || !href) {
      fail(`${label}: alternate link must contain hreflang and href`);
      continue;
    }
    if (actualAlternates.has(hreflang)) fail(`${label}: duplicate hreflang ${hreflang}`);
    actualAlternates.set(hreflang, href);
  }
  const expectedAlternates = new Map([
    ...locales.map((locale) => [locale.lang, `${siteOrigin}${publicPathFor(locale, pageCase.route)}`]),
    ["x-default", `${siteOrigin}${publicPathFor(locales[0], pageCase.route)}`]
  ]);
  if (actualAlternates.size !== expectedAlternates.size) fail(`${label}: hreflang key set is not exact`);
  for (const [hreflang, href] of expectedAlternates) {
    if (actualAlternates.get(hreflang) !== href) fail(`${label}: hreflang ${hreflang} must point to ${href}`);
  }

  const manifestLinks = linkTags.filter((tag) => attribute(tag, "rel") === "manifest");
  if (manifestLinks.length !== 1) {
    fail(`${label}: expected exactly one web manifest link`);
  } else {
    const manifestHref = attribute(manifestLinks[0], "href");
    try {
      const resolvedManifest = resolveReference(pageCase, manifestHref);
      const expectedManifestPath = `/${pageCase.locale.manifest}`;
      if (resolvedManifest.origin !== siteOrigin || resolvedManifest.pathname !== expectedManifestPath || resolvedManifest.search || resolvedManifest.hash) {
        fail(`${label}: manifest link must resolve exactly to ${expectedManifestPath}`);
      }
    } catch {
      fail(`${label}: invalid manifest reference ${manifestHref}`);
    }
  }

  const switchers = [...html.matchAll(/<nav\b(?=[^>]*\bdata-language-switcher(?:\s|=|>))[^>]*>[\s\S]*?<\/nav>/gi)].map((match) => match[0]);
  if (switchers.length !== 1) {
    fail(`${label}: expected exactly one language switcher, found ${switchers.length}`);
  } else {
    const anchors = [...switchers[0].matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]);
    const languageAnchors = anchors.filter((anchor) => hasClass(tagsFor(anchor, "a")[0], "language-link"));
    if (languageAnchors.length !== 3) fail(`${label}: language switcher must contain exactly three language links`);

    const anchorsByLanguage = new Map();
    for (const anchor of languageAnchors) {
      const opening = tagsFor(anchor, "a")[0];
      const hreflang = attribute(opening, "hreflang");
      if (!hreflang) {
        fail(`${label}: language link missing hreflang`);
        continue;
      }
      if (anchorsByLanguage.has(hreflang)) fail(`${label}: duplicate switcher language ${hreflang}`);
      anchorsByLanguage.set(hreflang, { anchor, opening });
    }

    let currentCount = 0;
    for (const targetLocale of locales) {
      const entry = anchorsByLanguage.get(targetLocale.lang);
      if (!entry) {
        fail(`${label}: switcher missing ${targetLocale.lang}`);
        continue;
      }
      const { anchor, opening } = entry;
      const href = attribute(opening, "href");
      const current = attribute(opening, "aria-current");
      const visibleLabel = anchor
        .replace(/^<a\b[^>]*>/i, "")
        .replace(/<\/a>$/i, "")
        .replace(/<[^>]*>/g, "")
        .trim();

      if (attribute(opening, "lang") !== targetLocale.lang) fail(`${label}: ${targetLocale.label} link has incorrect lang`);
      if (attribute(opening, "aria-label") !== targetLocale.selfName) fail(`${label}: ${targetLocale.label} link has incorrect accessible name`);
      if (visibleLabel !== targetLocale.label) fail(`${label}: ${targetLocale.lang} switcher label must be ${targetLocale.label}`);

      if (targetLocale.id === pageCase.locale.id) {
        if (current !== "page") fail(`${label}: current language ${targetLocale.lang} must use aria-current="page"`);
        if (current === "page") currentCount += 1;
      } else if (current !== null) {
        fail(`${label}: inactive language ${targetLocale.lang} must not use aria-current`);
      }

      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
        fail(`${label}: ${targetLocale.lang} switcher link must be a local anchor`);
        continue;
      }
      try {
        const resolved = resolveReference(pageCase, href);
        const expectedPath = publicPathFor(targetLocale, pageCase.route);
        if (resolved.origin !== siteOrigin || resolved.pathname !== expectedPath || resolved.search || resolved.hash) {
          fail(`${label}: ${targetLocale.lang} switcher must preserve route at ${expectedPath}`);
        }
      } catch {
        fail(`${label}: invalid ${targetLocale.lang} switcher href ${href}`);
      }
    }
    if (currentCount !== 1) fail(`${label}: language switcher must expose exactly one current language`);
  }

  const statusMarkerCount = (html.match(/\sdata-release-status="(?:published|upcoming)"/g) || []).length;
  const expectedStatusMarkerCount = pageCase.route === ""
    ? 1
    : pageCase.route === "catalog"
      ? catalog.releases.length
      : releaseByRoute.has(pageCase.route)
        ? 1
        : 0;
  if (statusMarkerCount !== expectedStatusMarkerCount) {
    fail(`${label}: release status marker count is ${statusMarkerCount}, expected ${expectedStatusMarkerCount}`);
  }
  if (/\sdata-release-status="sample"/.test(html)) fail(`${label}: legacy sample status marker found`);
  const sampleBoundaryCount = (html.match(/\sdata-sample-boundary="true"/g) || []).length;
  if (sampleBoundaryCount !== 0) fail(`${label}: legacy sample boundary marker found`);

  const detailRelease = releaseByRoute.get(pageCase.route);
  const releaseIdCount = (html.match(/\sdata-release-id="PVKH-\d{3}"/g) || []).length;
  if (releaseIdCount !== (detailRelease ? 1 : 0)) fail(`${label}: release identity marker count is ${releaseIdCount}`);
  if (detailRelease) {
    if (!html.includes(`data-release-id="${detailRelease.id}"`)) fail(`${label}: release identity does not match ${detailRelease.id}`);
    if (!html.includes(`data-release-status="${detailRelease.status}"`)) fail(`${label}: release status does not match source data`);
    if (!html.includes(`<time datetime="${detailRelease.releaseDate}"`)) fail(`${label}: canonical release date is missing`);
    if (!html.includes(detailRelease.title)) fail(`${label}: release title is missing`);
    const jsonLd = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .find((match) => attribute(`<script${match[1]}>`, "type") === "application/ld+json")?.[2];
    try {
      const graph = JSON.parse(jsonLd)["@graph"];
      const recording = graph?.find((item) => item["@type"] === "MusicRecording");
      if (!recording || recording.name !== detailRelease.title || recording.datePublished !== detailRelease.releaseDate) {
        fail(`${label}: release JSON-LD does not match source data`);
      }
      if (detailRelease.primaryGenre) {
        if (recording?.genre !== detailRelease.primaryGenre) fail(`${label}: JSON-LD genre must contain only the verified platform genre`);
      } else if (Object.hasOwn(recording || {}, "genre")) {
        fail(`${label}: JSON-LD must omit an unverified future genre`);
      }
      const expectedSameAs = detailRelease.streamingLinks?.map(({ url }) => url);
      if (expectedSameAs && JSON.stringify(recording?.sameAs) !== JSON.stringify(expectedSameAs)) {
        fail(`${label}: JSON-LD streaming URLs do not match source data`);
      }
      if (!expectedSameAs && Object.hasOwn(recording || {}, "sameAs")) fail(`${label}: JSON-LD must omit unavailable streaming URLs`);
    } catch {
      fail(`${label}: release JSON-LD is invalid`);
    }
    const streamingAnchors = tagsFor(html, "a").filter((tag) => attribute(tag, "data-release-cta") === "streaming");
    const preorderCtaCount = (html.match(/\sdata-release-cta="preorder"/g) || []).length;
    if (detailRelease.streamingLinks) {
      const directAnchors = streamingAnchors.filter((tag) => attribute(tag, "data-streaming-service") !== "allServices");
      validateDirectStreamingAnchors({ anchors: directAnchors, release: detailRelease, label });
      const smartAnchors = streamingAnchors.filter((tag) => attribute(tag, "data-streaming-service") === "allServices");
      if (streamingAnchors.length !== 4 || smartAnchors.length !== 1) fail(`${label}: published release must expose three direct CTAs and one smart CTA`);
      if (smartAnchors.length === 1) {
        const smartAnchor = smartAnchors[0];
        const href = attribute(smartAnchor, "href");
        try {
          const resolved = resolveReference(pageCase, href);
          const expectedPath = publicPathFor(pageCase.locale, `listen/${detailRelease.slug}`);
          if (resolved.origin !== siteOrigin || resolved.pathname !== expectedPath || resolved.search || resolved.hash) {
            fail(`${label}: all-services CTA must resolve locally to ${expectedPath}`);
          }
        } catch {
          fail(`${label}: all-services CTA has an invalid href`);
        }
        if (attribute(smartAnchor, "target") !== null) fail(`${label}: all-services CTA must stay in the same tab`);
      }
    } else if (streamingAnchors.length !== 0) {
      fail(`${label}: upcoming release must not expose streaming CTAs`);
    }
    if (preorderCtaCount !== (detailRelease.preorderUrl ? 1 : 0)) fail(`${label}: preorder CTA does not match source data`);
    if (!html.includes(`data-release-primary-genre data-verified="${detailRelease.primaryGenre ? "true" : "false"}"`)) {
      fail(`${label}: verified platform-genre state is missing`);
    }
    if (detailRelease.primaryGenre && !html.includes(`>${detailRelease.primaryGenre}</dd>`)) fail(`${label}: verified platform genre is not rendered`);
    const editorialTagCount = (html.match(/\sdata-release-editorial-tags(?:\s|>)/g) || []).length;
    if (editorialTagCount !== (detailRelease.editorialTags.length ? 1 : 0)) fail(`${label}: editorial-tag display does not match source data`);
    if (detailRelease.editorialTags.length && !html.includes(`>${detailRelease.editorialTags.join(" / ")}</dd>`)) fail(`${label}: editorial tags are not rendered exactly`);
  }

  const smartRelease = smartReleaseByRoute.get(pageCase.route);
  const smartReleaseIdCount = (html.match(/\sdata-smart-release-id="PVKH-\d{3}"/g) || []).length;
  if (smartReleaseIdCount !== (smartRelease ? 1 : 0)) fail(`${label}: smart-link release marker count is ${smartReleaseIdCount}`);
  if (smartRelease) {
    if (!html.includes(`data-smart-release-id="${smartRelease.id}"`)) fail(`${label}: smart-link identity does not match ${smartRelease.id}`);
    if (!html.includes(`<p class="smartlink-release">${escapeHtml(smartRelease.title)}</p>`)) fail(`${label}: smart-link title does not match source data`);
    if (!html.includes(`<p class="meta">${escapeHtml(smartRelease.artistCredit)}</p>`)) fail(`${label}: smart-link artist does not match source data`);
    const smartStreamingAnchors = tagsFor(html, "a").filter((tag) => attribute(tag, "data-release-cta") === "streaming");
    validateDirectStreamingAnchors({ anchors: smartStreamingAnchors, release: smartRelease, label });
    const chooserNavs = tagsFor(html, "nav").filter((tag) => hasClass(tag, "streaming-links"));
    if (chooserNavs.length !== 1 || !attribute(chooserNavs[0], "aria-label")) fail(`${label}: smart-link chooser needs one accessible navigation label`);
    if (smartStreamingAnchors.some((tag) => attribute(tag, "data-streaming-service") === "allServices")) {
      fail(`${label}: smart-link page must not link recursively to itself`);
    }
    const backAnchors = tagsFor(html, "a").filter((tag) => attribute(tag, "data-smart-back") !== null);
    if (backAnchors.length !== 1) {
      fail(`${label}: smart-link page must expose exactly one release return link`);
    } else {
      try {
        const resolved = resolveReference(pageCase, attribute(backAnchors[0], "href"));
        const expectedPath = publicPathFor(pageCase.locale, `catalog/${smartRelease.slug}`);
        if (resolved.origin !== siteOrigin || resolved.pathname !== expectedPath || resolved.search || resolved.hash) {
          fail(`${label}: smart-link return must resolve locally to ${expectedPath}`);
        }
      } catch {
        fail(`${label}: smart-link return has an invalid href`);
      }
    }
    const smartJsonLd = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .find((match) => attribute(`<script${match[1]}>`, "type") === "application/ld+json")?.[2];
    try {
      const graph = JSON.parse(smartJsonLd)["@graph"];
      if (graph?.some((item) => item["@type"] === "MusicRecording")) fail(`${label}: smart-link page must not duplicate release MusicRecording data`);
    } catch {
      fail(`${label}: smart-link JSON-LD is invalid`);
    }
  }

  if (!detailRelease && !smartRelease) {
    const unexpectedStreamingCtas = (html.match(/\sdata-release-cta="streaming"/g) || []).length;
    if (unexpectedStreamingCtas) fail(`${label}: streaming CTAs are only allowed on release and smart-link pages`);
  }
  const catalogCardCount = (html.match(/\sdata-release-card(?:\s|>)/g) || []).length;
  const expectedCatalogCardCount = pageCase.route === "catalog" ? catalog.releases.length : 0;
  if (catalogCardCount !== expectedCatalogCardCount) fail(`${label}: catalog card count is ${catalogCardCount}, expected ${expectedCatalogCardCount}`);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) fail(`${label}: duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);

  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="[^"]*"/.test(match[0])) fail(`${label}: image without alt attribute`);
    if (!/\swidth="\d+"/.test(match[0]) || !/\sheight="\d+"/.test(match[0])) {
      fail(`${label}: image must reserve width and height`);
    }
  }

  const csp = singleMetaContent(html, "http-equiv", "Content-Security-Policy", label);
  if (csp !== null) {
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'"]) {
      if (!csp.includes(directive)) fail(`${label}: CSP missing ${directive}`);
    }
    const structuredDataScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((match) => attribute(`<script${match[1]}>`, "type") === "application/ld+json");
    if (structuredDataScripts.length !== 1) {
      fail(`${label}: expected exactly one JSON-LD script`);
    } else {
      const hash = createHash("sha256").update(structuredDataScripts[0][2]).digest("base64");
      if (!csp.includes(`'sha256-${hash}'`)) fail(`${label}: CSP does not authorize the exact JSON-LD payload`);
      try {
        const graph = JSON.parse(structuredDataScripts[0][2])["@graph"];
        const organization = graph?.find((item) => item["@type"] === "Organization");
        if (!organization || organization.name !== "Povkh Lab Recordings" || organization.alternateName !== "POVKH LAB") {
          fail(`${label}: Organization JSON-LD does not use the approved names`);
        }
      } catch {
        fail(`${label}: JSON-LD payload is invalid`);
      }
    }
  }
  const referrer = singleMetaContent(html, "name", "referrer", label);
  if (referrer !== null && referrer !== "no-referrer") fail(`${label}: referrer policy must be no-referrer`);

  const references = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const reference of references) {
    if (/^javascript:/i.test(reference) || reference.startsWith("//")) {
      fail(`${label}: unsafe reference ${reference}`);
      continue;
    }
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(reference)) continue;
    if (reference.startsWith("#")) {
      if (!ids.includes(reference.slice(1))) fail(`${label}: missing anchor target ${reference}`);
      continue;
    }
    const clean = reference.split("#")[0].split("?")[0];
    let target = clean.startsWith("/")
      ? path.resolve(distDir, clean.slice(1))
      : path.resolve(path.dirname(absolute), clean);
    if (target !== distDir && !target.startsWith(`${distDir}${path.sep}`)) {
      fail(`${label}: reference escapes dist ${reference}`);
      continue;
    }
    const targetInfo = await exists(target);
    if (targetInfo?.isDirectory()) target = path.join(target, "index.html");
    if (!await exists(target)) fail(`${label}: broken local reference ${reference}`);
  }
}

const expectedManifestFiles = locales.map((locale) => locale.manifest).sort();
const actualManifestFiles = allDistFiles.filter((file) => file.endsWith(".webmanifest")).sort();
if (JSON.stringify(actualManifestFiles) !== JSON.stringify(expectedManifestFiles)) {
  fail(`Expected exactly three localized manifests: ${expectedManifestFiles.join(", ")}`);
}

for (const locale of locales) {
  const manifestPath = path.join(distDir, locale.manifest);
  if (!await exists(manifestPath)) continue;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.name !== "POVKH LAB" || manifest.short_name !== "POVKH LAB") fail(`${locale.manifest}: invalid application name`);
  if (manifest.lang !== locale.lang) fail(`${locale.manifest}: lang must be ${locale.lang}`);
  if (manifest.start_url !== "./") fail(`${locale.manifest}: start_url must be ./`);
  if (manifest.display !== "standalone") fail(`${locale.manifest}: display must be standalone`);
  if (manifest.background_color !== "#080808" || manifest.theme_color !== "#080808") {
    fail(`${locale.manifest}: brand theme colors are incorrect`);
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length !== 1) {
    fail(`${locale.manifest}: expected exactly one icon`);
  } else {
    const icon = manifest.icons[0];
    if (icon.src !== locale.manifestIcon || icon.sizes !== "any" || icon.type !== "image/svg+xml" || icon.purpose !== "any") {
      fail(`${locale.manifest}: icon contract is incorrect`);
    }
    const iconTarget = path.resolve(path.dirname(manifestPath), icon.src);
    if (iconTarget !== distDir && !iconTarget.startsWith(`${distDir}${path.sep}`)) {
      fail(`${locale.manifest}: icon escapes dist`);
    } else if (!await exists(iconTarget)) {
      fail(`${locale.manifest}: icon is missing`);
    }
  }
}

const css = await readFile(path.join(distDir, "assets", "styles.css"), "utf8");
for (const token of ["--void: #080808", "--bone: #f2efe7", "--signal: #f32222", "--signal-ink: #b5121b", "--steel: #8f918f"]) {
  if (!css.includes(token)) fail(`Missing brand color token: ${token}`);
}
for (const family of ["Barlow Condensed", "Inter", "IBM Plex Mono"]) {
  if (!css.includes(family)) fail(`Missing local brand font: ${family}`);
}
if (!/@media \(prefers-reduced-motion: reduce\)/.test(css)) fail("Reduced-motion media query missing");
if (!/@media print/.test(css)) fail("Print stylesheet missing");
if (/(?:#ec4899|space mono|fira|fonts\.googleapis)/i.test(css)) fail("Non-brand palette, font or CDN reference found");

for (const logo of [
  "povkh-lab-compact-reverse-transparent-outlined.svg",
  "povkh-lab-horizontal-dark-outlined.svg",
  "povkh-lab-horizontal-reverse-transparent-outlined.svg",
  "povkh-lab-primary-reverse-transparent-outlined.svg"
]) {
  const svg = await readFile(path.join(distDir, "assets", "logo", logo), "utf8");
  if (/<text\b|<image\b|@font-face|href=/i.test(svg)) fail(`Logo is not self-contained outlined SVG: ${logo}`);
}

const buildManifest = JSON.parse(await readFile(path.join(distDir, "build-manifest.json"), "utf8"));
if (buildManifest.schemaVersion !== 1) fail("Build manifest schema version must be 1");
for (const source of ["data/catalog.json", "src/pages.mjs", "src/i18n.mjs", "assets/", "../exports/POVKH-LAB-Brand-Board-v1.0.pdf"]) {
  if (!buildManifest.generatedFrom?.includes(source)) fail(`Build manifest provenance missing: ${source}`);
}

const boardDownload = await readFile(path.join(distDir, "downloads", "POVKH-LAB-Brand-Board-v1.0.pdf"));
const canonicalBoard = await readFile(path.join(siteRoot, "..", "exports", "POVKH-LAB-Brand-Board-v1.0.pdf"));
if (!boardDownload.equals(canonicalBoard)) fail("Downloaded brand board must match the canonical root export byte-for-byte");

const actualFiles = allDistFiles.filter((file) => file !== "build-manifest.json").sort();
const manifestFiles = Object.keys(buildManifest.files || {}).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) fail("Build manifest file list is not exact");
for (const relative of actualFiles) {
  const hash = createHash("sha256").update(await readFile(path.join(distDir, relative))).digest("hex");
  if (buildManifest.files?.[relative] !== hash) fail(`Build manifest hash mismatch: ${relative}`);
}

if (failures.length) {
  console.error(`Static QA failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Static QA passed: ${htmlFiles.length} localized pages, ${catalog.releases.length} catalog releases, ${actualManifestFiles.length} manifests, ${actualFiles.length + 1} exact files, reciprocal hreflang, release data integrity and no broken local links.`);
}
