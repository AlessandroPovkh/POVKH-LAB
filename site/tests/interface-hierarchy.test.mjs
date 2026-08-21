import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SITE_BASE_PATH, SOCIAL_LINKS } from "../src/config.mjs";
import { COPY } from "../src/i18n.mjs";
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
const locales = ["en", "it", "ru"];
const localePath = (locale, route) => `${locale === "en" ? "" : `${locale}/`}${route ? `${route}/index.html` : "index.html"}`;
const pageFor = (locale, route) => pages.get(localePath(locale, route)).toString();
const fragment = (html, pattern, label) => {
  const match = html.match(pattern);
  assert.ok(match, `${label} markup is missing`);
  return match[0];
};
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const localeForOutput = (output) => output.startsWith("it/") ? "it" : output.startsWith("ru/") ? "ru" : "en";
const publicLocalePrefix = (locale) => locale === "en" ? "/" : `/${locale}/`;
const resolvedPath = (output, href) => new URL(href, `https://example.test/${output}`).pathname;

test("keeps exactly Home / Catalog / Merch / Artists in the primary desktop navigation", () => {
  for (const [output, buffer] of pages.entries()) {
    if (output.endsWith("404.html")) continue;
    const locale = localeForOutput(output);
    const html = buffer.toString();
    const primary = fragment(html, /<nav class="desktop-nav"[\s\S]*?<\/nav>/, `${output} desktop primary navigation`);
    const links = [...primary.matchAll(/<a class="nav-link" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
      .map(([, href, label]) => ({ href, label }));
    const expected = ["home", "catalog", "merch", "artists"].map((key) => COPY[locale].common.nav[key]);
    assert.deepEqual(links.map(({ label }) => label), expected, `${output} primary navigation must contain only the four audience routes`);
    assert.deepEqual(links.map(({ href }) => resolvedPath(output, href)), [
      publicLocalePrefix(locale),
      `${publicLocalePrefix(locale)}catalog/`,
      `${publicLocalePrefix(locale)}merch/`,
      `${publicLocalePrefix(locale)}artists/`
    ], `${output} primary routes must keep their localized destinations`);
    assert.equal(count(primary, /<(?:a|button|summary)\b/g), 4, `${output} primary navigation must expose exactly four interactive elements`);

    const index = fragment(html, /<details[^>]+data-site-index[\s\S]*?<\/details>/, `${output} Menu / Index disclosure`);
    assert.match(index, new RegExp(`<summary[^>]*>${COPY[locale].common.menu}\\s*/\\s*Index<`), `${output} disclosure must be labelled Menu / Index`);
    const mobilePrimary = fragment(index, /<nav class="site-index-primary"[\s\S]*?<\/nav>/, `${output} Menu / Index primary routes`);
    assert.deepEqual(
      [...mobilePrimary.matchAll(/<a class="nav-link" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, label]) => ({ href: resolvedPath(output, href), label })),
      [
        { href: publicLocalePrefix(locale), label: COPY[locale].common.nav.home },
        { href: `${publicLocalePrefix(locale)}catalog/`, label: COPY[locale].common.nav.catalog },
        { href: `${publicLocalePrefix(locale)}merch/`, label: COPY[locale].common.nav.merch },
        { href: `${publicLocalePrefix(locale)}artists/`, label: COPY[locale].common.nav.artists }
      ],
      `${output} Menu / Index must preserve all four audience routes when desktop navigation is hidden`
    );
    for (const key of ["process", "about", "press", "download", "contact"]) {
      const label = COPY[locale].common.nav[key];
      assert.match(index, new RegExp(`>${label}<`), `${output} Menu / Index is missing ${key}`);
      const hrefMatch = index.match(new RegExp(`<a[^>]+href="([^"]+)"[^>]*>${label}<`));
      assert.ok(hrefMatch, `${output} Menu / Index destination is missing for ${key}`);
      assert.equal(resolvedPath(output, hrefMatch[1]), `${publicLocalePrefix(locale)}${key}/`, `${output} Menu / Index destination drifted for ${key}`);
    }
    assert.equal(count(index, /data-language-switcher(?:[ >])/g), 1, `${output} Menu / Index must contain the language switcher`);
    assert.equal(count(html, /class="mobile-nav"/g), 0, `${output} must not duplicate the navigation tree for mobile`);

    const player = fragment(html, /<aside class="hud-audio"[\s\S]*?<\/aside>/, `${output} compact player`);
    assert.match(player, /data-player-tray[^>]*hidden/, `${output} player tray must start closed`);
    assert.match(player, /data-player-tray-toggle[^>]*aria-controls="povkh-player-tray"/, `${output} Tracks must control the tray`);
    assert.match(player, /data-player-tray-toggle[^>]*aria-expanded="false"/, `${output} Tracks must expose its closed state`);
    assert.equal(count(player, /data-player-playlist-dialog(?:[ >])/g), 0, `${output} player queue must be an upward tray, not a modal dialog`);
  }
});

test("publishes one Social Access destination in every footer instead of duplicate channel links", () => {
  for (const [output, buffer] of pages.entries()) {
    if (output.endsWith("404.html")) continue;
    const locale = localeForOutput(output);
    const footer = fragment(buffer.toString(), /<footer class="site-footer"[\s\S]*?<\/footer>/, `${output} footer`);
    assert.equal(count(footer, /href="[^"]*links\/"/g), 1, `${output} footer needs exactly one Social Access route`);
    assert.ok(footer.includes(COPY[locale].pages.links.title), `${output} footer Social Access label is missing`);
    assert.equal(count(footer, /target="_blank"/g), 0, `${output} footer must not repeat direct social channels`);
    for (const { url } of SOCIAL_LINKS) {
      assert.ok(!footer.includes(`href="${url}"`), `${output} footer must omit the direct social destination ${url}`);
    }
  }
});

test("shows collection status once and never repeats it on merch object cards or detail gates", () => {
  for (const locale of locales) {
    const overview = pageFor(locale, "merch");
    assert.equal(count(overview, /data-merch-visible-status(?:[ >])/g), 1, `${locale} merch overview must show one collection status`);
    assert.doesNotMatch(overview, /href="#merch-objects"/, `${locale} merch overview must not repeat the Explore jump`);
    const cards = fragment(overview, /<section class="section" id="merch-objects"[\s\S]*?<\/section>\s*<details[^>]+data-merch-roadmap/, `${locale} merch index`);
    assert.equal(count(cards, /data-merch-visible-status(?:[ >])/g), 0, `${locale} object cards must not repeat collection status`);
    const roadmap = fragment(overview, /<details[^>]+data-merch-roadmap[\s\S]*?<\/details>/, `${locale} merch roadmap`);
    assert.doesNotMatch(roadmap.match(/^<details[^>]*>/)?.[0] || "", /\sopen(?:[ >])/, `${locale} merch roadmap must start closed`);

    for (const object of merchLibrary.objects) {
      const detail = pageFor(locale, `merch/${object.slug}`);
      assert.equal(count(detail, /data-merch-visible-status(?:[ >])/g), 1, `${locale}/${object.slug} must show concept status once`);
      const hero = fragment(detail, /<section class="merch-detail-hero"[\s\S]*?<\/section>/, `${locale}/${object.slug} detail hero`);
      assert.equal(count(hero, /data-product-viewer-activate(?:[ >])/g), 1, `${locale}/${object.slug} needs one leading viewer action`);
      assert.doesNotMatch(hero, /href="#merch-concept-gallery"/, `${locale}/${object.slug} must remove the redundant View Gallery action`);
      if (object.viewer.availability === "sourceBlocked") {
        assert.match(hero, /data-product-viewer-activate[^>]*disabled[^>]*aria-disabled="true"/, `${locale}/${object.slug} source block must stay honest`);
      }
      const gallery = fragment(detail, /<div class="merch-gallery"[\s\S]*?<\/div>\s*<\/section>/, `${locale}/${object.slug} gallery`);
      const triggerSources = [...gallery.matchAll(/data-merch-gallery-trigger[^>]+href="([^"]+)"/g)].map(([, href]) => href);
      assert.equal(triggerSources.length, object.gallery.length - 1, `${locale}/${object.slug} gallery must omit the viewer poster`);
      assert.ok(triggerSources.every((href) => !href.endsWith(object.viewer.poster)), `${locale}/${object.slug} gallery repeats its viewer poster`);
    }
  }
});

test("renders 404 with only brand, language and one Return Home action", () => {
  for (const locale of locales) {
    const output = `${locale === "en" ? "" : `${locale}/`}404.html`;
    const html = pages.get(output).toString();
    assert.ok(html.includes("data-lightweight-shell"), `${locale} 404 must opt into the lightweight shell`);
    assert.equal(count(html, /class="brand-link"/g), 1, `${locale} 404 needs the brand home link`);
    assert.equal(count(html, /data-language-switcher(?:[ >])/g), 1, `${locale} 404 needs the language switcher`);
    const action = fragment(html, /<a class="button" href="([^"]+)">([^<]+)<\/a>/, `${locale} Return Home action`);
    const [, href, label] = action.match(/<a class="button" href="([^"]+)">([^<]+)<\/a>/);
    assert.equal(label, COPY[locale].pages.notFound.cta, `${locale} 404 action label drifted`);
    assert.equal(href, `${SITE_BASE_PATH}/${locale === "en" ? "" : `${locale}/`}`, `${locale} 404 action must return to localized Home`);
    const allActions = [...html.matchAll(/<(a|button|summary)\b[^>]*>/g)];
    assert.equal(allActions.length, 5, `${locale} 404 may expose only brand, three language links and Return Home`);
    assert.equal(count(html, /<(?:button|summary)\b/g), 0, `${locale} 404 must not add disclosure or control buttons`);
    const actionPaths = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)]
      .map(([, actionHref]) => new URL(actionHref, "https://example.test/404.html").pathname)
      .sort();
    assert.deepEqual(actionPaths, [
      `${SITE_BASE_PATH}/${locale === "en" ? "" : `${locale}/`}`,
      `${SITE_BASE_PATH}/${locale === "en" ? "" : `${locale}/`}`,
      `${SITE_BASE_PATH}/404.html`,
      `${SITE_BASE_PATH}/it/404.html`,
      `${SITE_BASE_PATH}/ru/404.html`
    ].sort(), `${locale} 404 action set must stay limited and correctly localized`);
    for (const forbidden of [
      "data-audio-player",
      "data-hud-frame",
      "data-motion-video",
      "data-route-footer",
      "class=\"desktop-nav\"",
      "class=\"mobile-nav\"",
      "class=\"site-signal-layer\""
    ]) assert.ok(!html.includes(forbidden), `${locale} lightweight 404 must omit ${forbidden}`);
  }
});
