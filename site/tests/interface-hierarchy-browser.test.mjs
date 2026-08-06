import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createStaticServer } from "../tools/server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let app;
let baseUrl;
let browser;

before(async () => {
  app = createStaticServer({ root: path.join(siteRoot, "dist") });
  baseUrl = await app.listen();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await app?.close();
});

test("renders the simplified hierarchy and lightweight 404 in a real browser", async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/merch/`, { waitUntil: "load" });
  const overview = await page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const roadmap = document.querySelector("details[data-merch-roadmap]");
    const footer = document.querySelector(".site-footer");
    return {
      headerHeight: header?.getBoundingClientRect().height || 0,
      primaryLinks: document.querySelectorAll(".desktop-nav .nav-link").length,
      indexCount: document.querySelectorAll("details[data-site-index]").length,
      indexOpen: document.querySelector("details[data-site-index]")?.open,
      languageInsideIndex: Boolean(document.querySelector("details[data-site-index] [data-language-switcher]")),
      visibleStatuses: document.querySelectorAll("[data-merch-visible-status]").length,
      exploreJump: document.querySelectorAll('.merch-hero a[href="#merch-objects"]').length,
      roadmapCount: document.querySelectorAll("details[data-merch-roadmap]").length,
      roadmapOpen: roadmap?.open,
      footerSocialAccess: footer?.querySelectorAll('a[href$="/links/"]').length,
      footerExternal: footer?.querySelectorAll('a[target="_blank"]').length
    };
  });
  assert.ok(overview.headerHeight <= 80, `closed mobile header is ${overview.headerHeight}px tall`);
  assert.deepEqual(overview, {
    ...overview,
    primaryLinks: 4,
    indexCount: 1,
    indexOpen: false,
    languageInsideIndex: true,
    visibleStatuses: 1,
    exploreJump: 0,
    roadmapCount: 1,
    roadmapOpen: false,
    footerSocialAccess: 1,
    footerExternal: 0
  });

  await page.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  const product = await page.evaluate(() => ({
    leadingViewerActions: [...document.querySelectorAll(".merch-detail-hero [data-product-viewer-activate]")]
      .filter((button) => !button.hidden).length,
    galleryJump: document.querySelectorAll('.merch-detail-hero a[href="#merch-concept-gallery"]').length,
    visibleStatuses: document.querySelectorAll("[data-merch-visible-status]").length,
    poster: document.querySelector("[data-product-viewer-poster]")?.src,
    gallerySources: [...document.querySelectorAll("[data-merch-gallery-trigger] img")].map((image) => image.src)
  }));
  assert.equal(product.leadingViewerActions, 1);
  assert.equal(product.galleryJump, 0);
  assert.equal(product.visibleStatuses, 1);
  assert.ok(!product.gallerySources.includes(product.poster), "detail gallery repeats the viewer poster");

  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  const mainFocus = await page.locator("main#main-content").evaluate((main) => {
    const style = getComputedStyle(main);
    return { active: document.activeElement === main, color: style.outlineColor, style: style.outlineStyle };
  });
  assert.equal(mainFocus.active, true);
  assert.equal(mainFocus.style, "solid");
  assert.equal(mainFocus.color, "rgb(243, 34, 34)");

  const missing = await page.goto(`${baseUrl}/missing-task7-browser/`, { waitUntil: "load" });
  assert.equal(missing.status(), 404);
  const lightweight = await page.evaluate(() => ({
    actions: document.querySelectorAll("a, button, summary").length,
    marked: document.body.hasAttribute("data-lightweight-shell"),
    forbidden: document.querySelectorAll("[data-audio-player], [data-hud-frame], [data-motion-video], [data-route-footer], .desktop-nav, .mobile-nav, .site-signal-layer").length
  }));
  assert.deepEqual(lightweight, { actions: 5, marked: true, forbidden: 0 });
  await context.close();
});

test("keeps the compact player measurable while its upward tray preserves controls and seeking", async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
  await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.dataset.waveformState === "ready");

  const compact = await page.evaluate(() => {
    const player = document.querySelector("[data-audio-player]");
    const rect = player.getBoundingClientRect();
    const visibleControls = [...player.querySelectorAll("button")].filter((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    });
    return {
      height: rect.height,
      cssHeight: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--player-height")),
      bodyPadding: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
      visibleControls: visibleControls.map((button) => button.dataset.playerToggle !== undefined ? "play" : button.dataset.playerTrayToggle !== undefined ? "tracks" : "other"),
      titleVisible: document.querySelector("[data-player-title]")?.getBoundingClientRect().height > 0,
      trayHidden: document.querySelector("[data-player-tray]")?.hidden,
      volume: document.querySelector("[data-audio-engine]")?.volume
    };
  });
  assert.ok(compact.height <= 72, `compact player is ${compact.height}px tall`);
  assert.ok(Math.abs(compact.cssHeight - compact.height) <= 1, `measured height ${compact.cssHeight} != ${compact.height}`);
  assert.ok(compact.bodyPadding >= compact.height - 1, `body padding ${compact.bodyPadding} does not clear ${compact.height}`);
  assert.deepEqual(compact.visibleControls.sort(), ["play", "tracks"]);
  assert.equal(compact.titleVisible, true);
  assert.equal(compact.trayHidden, true);
  assert.ok(Math.abs(compact.volume - 0.6) < 0.001);

  const trayToggle = page.locator("[data-player-tray-toggle]");
  await trayToggle.click();
  const trayOpen = await page.evaluate(() => {
    const player = document.querySelector("[data-audio-player]")?.getBoundingClientRect();
    const tray = document.querySelector("[data-player-tray]");
    const rect = tray?.getBoundingClientRect();
    return {
      hidden: tray?.hidden,
      expanded: document.querySelector("[data-player-tray-toggle]")?.getAttribute("aria-expanded"),
      focusInside: Boolean(tray?.contains(document.activeElement)),
      upward: Boolean(player && rect && rect.bottom <= player.top + 1),
      internallyScrollable: Boolean(tray && getComputedStyle(tray).overflowY === "auto" && tray.scrollHeight >= tray.clientHeight)
    };
  });
  assert.deepEqual(trayOpen, { hidden: false, expanded: "true", focusInside: true, upward: true, internallyScrollable: true });

  const waveform = page.locator("[data-player-waveform]");
  await waveform.focus();
  await page.keyboard.press("End");
  const endState = await page.locator("[data-audio-engine]").evaluate((audio) => ({
    currentTime: audio.currentTime,
    duration: Number(document.querySelector("[data-player-waveform]")?.getAttribute("aria-valuemax"))
  }));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  const arrow = await page.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
  const box = await waveform.boundingBox();
  assert.ok(box, "waveform has no pointer box inside the tray");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  const pointer = await page.locator("[data-audio-engine]").evaluate((audio) => audio.currentTime);
  assert.ok(endState.duration > 0 && Math.abs(endState.currentTime - endState.duration) < 0.2,
    `End seek stopped at ${endState.currentTime} / ${endState.duration}`);
  assert.ok(Math.abs(arrow - 5) < 0.2, `Arrow seek stopped at ${arrow}`);
  assert.ok(Math.abs(pointer - endState.duration * 0.5) < 0.2, `Pointer seek stopped at ${pointer}`);

  await page.keyboard.press("Escape");
  assert.equal(await trayToggle.getAttribute("aria-expanded"), "false");
  assert.equal(await trayToggle.evaluate((toggle) => document.activeElement === toggle), true);
  await trayToggle.click();
  await page.mouse.click(2, 2);
  assert.equal(await trayToggle.getAttribute("aria-expanded"), "false");

  await page.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => document.querySelector("[data-audio-player]")?.classList.contains("is-ready"));
  const desktopSafety = await page.evaluate(() => {
    const player = document.querySelector("[data-audio-player]").getBoundingClientRect();
    const viewer = document.querySelector("[data-product-viewer]").getBoundingClientRect();
    const overlaps = player.left < viewer.right && player.right > viewer.left && player.top < viewer.bottom && player.bottom > viewer.top;
    return { height: player.height, overlaps };
  });
  assert.ok(desktopSafety.height <= 72, `desktop product player is ${desktopSafety.height}px tall`);
  assert.equal(desktopSafety.overlaps, false);
  await context.close();
});
