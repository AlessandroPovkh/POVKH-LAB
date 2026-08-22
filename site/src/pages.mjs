import { createHash } from "node:crypto";
import { COPY, DEFAULT_LOCALE, LOCALES, LOCALE_META } from "./i18n.mjs";
import {
  CONTACT_EMAIL,
  OG_IMAGE_PATH,
  ROBOTS_CONTENT,
  SITE_BASE_PATH,
  SITE_ORIGIN,
  SITE_STATUS,
  SOCIAL_LINKS
} from "./config.mjs";

const absoluteUrlFor = (publicPath) => `${SITE_ORIGIN}${SITE_BASE_PATH}${publicPath}`;

const NAV_ITEMS = [
  ["home", ""],
  ["catalog", "catalog"],
  ["merch", "merch"],
  ["artists", "artists"],
  ["process", "process"],
  ["about", "about"],
  ["press", "press"],
  ["download", "download"],
  ["contact", "contact"]
];
const PRIMARY_NAV_KEYS = new Set(["home", "catalog", "merch", "artists"]);

const PRESS_ASSETS = [
  "downloads/POVKH-LAB-Brand-Board-v1.0.pdf",
  "assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg",
  "assets/logo/povkh-lab-horizontal-dark-outlined.svg",
  "assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg",
  "assets/logo/povkh-lab-ascii-reverse-transparent-outlined.svg"
];

const SOURCE_BLOCKED_VIEWER_COPY = Object.freeze({
  en: "360° view after approval of a physical sample",
  it: "Vista 360° dopo l'approvazione di un campione fisico",
  ru: "Обзор 360° после утверждения физического образца"
});

const SOURCE_BLOCKED_VIEWER_LABEL = Object.freeze({
  en: "Approved concept image; interactive view pending sample approval",
  it: "Immagine concept approvata; vista interattiva in attesa dell'approvazione del campione",
  ru: "Утверждённое концепт-изображение; интерактивный обзор ожидает утверждения образца"
});

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const mailtoHrefFor = (recipient, subject) => `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}`;

const localizedRoute = (locale, route) => [LOCALE_META[locale].prefix, route === "404" ? "" : route]
  .filter(Boolean)
  .join("/");

const outputPathFor = (locale, route) => {
  const prefix = LOCALE_META[locale].prefix;
  if (route === "404") return `${prefix ? `${prefix}/` : ""}404.html`;
  const localized = localizedRoute(locale, route);
  return localized ? `${localized}/index.html` : "index.html";
};

const publicPathFor = (locale, route) => {
  const prefix = LOCALE_META[locale].prefix;
  if (route === "404") return `/${prefix ? `${prefix}/` : ""}404.html`;
  const localized = localizedRoute(locale, route);
  return localized ? `/${localized}/` : "/";
};

const deployedPathFor = (publicPath) => `${SITE_BASE_PATH}${publicPath}`;

const rootPrefixFor = (localized) => {
  const depth = localized.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
};

const assetPrefixFor = (locale, route) => route === "404"
  ? `${SITE_BASE_PATH}/`
  : rootPrefixFor(localizedRoute(locale, route));

const manifestHrefFor = (locale, route) => {
  const manifestPath = `${LOCALE_META[locale].prefix ? `${LOCALE_META[locale].prefix}/` : ""}site.webmanifest`;
  return route === "404"
    ? deployedPathFor(`/${manifestPath}`)
    : `${rootPrefixFor(localizedRoute(locale, route))}${manifestPath}`;
};

const hrefFor = (locale, currentRoute, targetLocale, targetRoute) => {
  const targetPath = publicPathFor(targetLocale, targetRoute);
  if (currentRoute === "404") return deployedPathFor(targetPath);
  return `${rootPrefixFor(localizedRoute(locale, currentRoute))}${targetPath.slice(1)}`;
};

const activeFor = (route) => {
  if (route === "") return "home";
  const section = route.split("/")[0];
  return section === "listen" ? "catalog" : section;
};

const navLinksMarkup = (locale, route, items) => {
  const t = COPY[locale].common;
  const active = activeFor(route);
  return items.map(([key, targetRoute]) => {
    const current = key === active ? ' aria-current="page"' : "";
    return `<li><a class="nav-link" href="${hrefFor(locale, route, locale, targetRoute)}"${current}>${escapeHtml(t.nav[key])}</a></li>`;
  }).join("");
};

const navMarkup = (locale, route) => {
  const t = COPY[locale].common;
  const list = navLinksMarkup(locale, route, NAV_ITEMS.filter(([key]) => PRIMARY_NAV_KEYS.has(key)));
  return `<nav class="desktop-nav" aria-label="${escapeHtml(t.primaryNav)}"><ul class="nav-list">${list}</ul></nav>`;
};

const languageMarkup = (locale, route) => {
  const t = COPY[locale].common;
  const links = LOCALES.map((targetLocale) => {
    const meta = LOCALE_META[targetLocale];
    const current = targetLocale === locale ? ' aria-current="page"' : "";
    return `<li><a class="language-link" href="${hrefFor(locale, route, targetLocale, route)}" lang="${meta.lang}" hreflang="${meta.lang}" aria-label="${escapeHtml(meta.selfName)}"${current}>${meta.label}</a></li>`;
  }).join("");
  return `<nav class="language-nav" data-language-switcher aria-label="${escapeHtml(t.languageNav)}"><ul class="language-list">${links}</ul></nav>`;
};

const siteIndexMarkup = (locale, route) => {
  const t = COPY[locale].common;
  const primaryList = navLinksMarkup(locale, route, NAV_ITEMS.filter(([key]) => PRIMARY_NAV_KEYS.has(key)));
  const secondaryList = navLinksMarkup(locale, route, NAV_ITEMS.filter(([key]) => !PRIMARY_NAV_KEYS.has(key)));
  return `<details class="site-index" data-site-index>
    <summary class="menu-summary">${escapeHtml(t.menu)} / Index</summary>
    <div class="site-index-panel">
      <nav class="site-index-primary" aria-label="${escapeHtml(t.mobilePrimaryNav)}"><ul class="nav-list">${primaryList}</ul></nav>
      <nav class="site-index-secondary" aria-label="${escapeHtml(t.secondaryNav)}"><ul class="nav-list">${secondaryList}</ul></nav>
      ${languageMarkup(locale, route)}
    </div>
  </details>`;
};

const signalFieldMarkup = () => `<div class="site-signal-layer" aria-hidden="true">
    <div class="site-signal-stage" data-signal-field data-signal-mode="static" data-signal-target="">
      <svg class="site-signal-overlay" data-signal-overlay data-signal-svg viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
        <path class="signal-target-brackets" data-signal-target-brackets fill="none" stroke="#f32222" d=""></path>
        <path class="signal-panel-link" data-signal-panel-link fill="none" stroke="#f32222" d=""></path>
      </svg>
    </div>
  </div>`;

const playerTime = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

const audioPlayerMarkup = (locale, prefix, tracks, defaultTrackId) => {
  const copy = {
    en: { player: "Audio player", prev: "Previous", prevShort: "PREV", play: "Play", playShort: "PLAY", pause: "Pause", pauseShort: "PAUSE", next: "Next", nextShort: "NEXT", volume: "Volume", volumeControl: "Volume control", queue: "Open track list", queueShort: "TRACKS", queueTitle: "Catalog playback", close: "Close track list", select: "Play {title} by {artist}", seek: "Seek through track", loading: "Reading waveform", blocked: "Press play to enable sound", waveformError: "Waveform unavailable", audioError: "Audio unavailable — retry play" },
    it: { player: "Lettore audio", prev: "Precedente", prevShort: "PREC", play: "Riproduci", playShort: "PLAY", pause: "Pausa", pauseShort: "PAUSA", next: "Successivo", nextShort: "SUCC", volume: "Volume", volumeControl: "Controllo volume", queue: "Apri elenco tracce", queueShort: "TRACCE", queueTitle: "Riproduzione catalogo", close: "Chiudi elenco tracce", select: "Riproduci {title} di {artist}", seek: "Sposta la posizione nella traccia", loading: "Lettura forma d’onda", blocked: "Premi play per attivare l’audio", waveformError: "Forma d’onda non disponibile", audioError: "Audio non disponibile — riprova" },
    ru: { player: "Аудиоплеер", prev: "Предыдущий", prevShort: "ПРЕД", play: "Воспроизвести", playShort: "ПУСК", pause: "Пауза", pauseShort: "ПАУЗА", next: "Следующий", nextShort: "СЛЕД", volume: "Громкость", volumeControl: "Регулятор громкости", queue: "Открыть список треков", queueShort: "ТРЕКИ", queueTitle: "Воспроизведение каталога", close: "Закрыть список треков", select: "Воспроизвести {title} — {artist}", seek: "Перемотка по треку", loading: "Чтение формы волны", blocked: "Нажмите play, чтобы включить звук", waveformError: "Форма волны недоступна", audioError: "Аудио недоступно — повторите запуск" }
  }[locale];
  const defaultIndex = tracks.findIndex((track) => track.id === defaultTrackId);
  if (defaultIndex < 0) throw new Error(`${defaultTrackId} is required for the global audio player`);
  const defaultTrack = tracks[defaultIndex];
  const artistCredit = defaultTrack.artistCredit.toUpperCase();
  const playlist = tracks.map((track) => {
    const isDefault = track.id === defaultTrackId ? ' data-player-default="true"' : "";
    const current = track.id === defaultTrackId ? ' aria-current="true"' : "";
    const selectLabel = interpolate(copy.select, { title: track.title, artist: track.artistCredit });
    return `<li data-player-track${isDefault} data-track-id="${escapeHtml(track.id)}" data-catalog-id="${escapeHtml(track.audio.catalogId)}" data-src="${prefix}assets/tracks/${escapeHtml(track.audio.file)}" data-waveform="${prefix}assets/audio/${escapeHtml(track.audio.waveform)}" data-artist="${escapeHtml(track.artistCredit.toUpperCase())}" data-title="${escapeHtml(track.title.toUpperCase())}" data-duration="${track.audio.duration}">
        <button type="button" data-player-select${current} aria-label="${escapeHtml(selectLabel)}"><span class="playlist-code">${escapeHtml(track.id)}</span><span class="playlist-name"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artistCredit)}</small></span><span class="playlist-duration">${playerTime(track.audio.duration)}</span></button>
      </li>`;
  }).join("\n      ");
  return `<aside class="hud-audio" data-audio-player data-track-count="${tracks.length}" data-state="loading" aria-label="${escapeHtml(copy.player)}">
    <audio id="povkh-audio-engine" data-audio-engine preload="none"></audio>
    <div class="hud-audio-bar" data-player-bar>
      <div class="hud-audio-track">
        <strong data-player-title>${escapeHtml(defaultTrack.title.toUpperCase())}</strong>
        <span class="sr-only" data-player-artist>${escapeHtml(artistCredit)}</span>
      </div>
      <div class="hud-audio-primary-controls">
        <button class="hud-audio-toggle" type="button" data-player-toggle data-play-label="${escapeHtml(copy.play)}" data-play-text="${escapeHtml(copy.playShort)}" data-pause-label="${escapeHtml(copy.pause)}" data-pause-text="${escapeHtml(copy.pauseShort)}" aria-label="${escapeHtml(copy.play)}">${escapeHtml(copy.playShort)}</button>
        <button class="hud-audio-queue" type="button" data-player-playlist-toggle data-player-tray-toggle aria-controls="povkh-player-tray" aria-expanded="false" aria-label="${escapeHtml(copy.queue)}">${escapeHtml(copy.queueShort)} <span data-player-index>${String(defaultIndex + 1).padStart(2, "0")} / ${String(tracks.length).padStart(2, "0")}</span></button>
      </div>
    </div>
    <section class="hud-player-tray" id="povkh-player-tray" data-player-tray hidden aria-labelledby="povkh-player-tray-title">
      <div class="hud-playlist-head"><div><span class="eyebrow">AUDIO / ${String(tracks.length).padStart(2, "0")}</span><h2 id="povkh-player-tray-title" data-player-playlist-title>${escapeHtml(copy.queueTitle)}</h2></div><button type="button" data-player-playlist-close data-player-tray-close aria-label="${escapeHtml(copy.close)}">×</button></div>
      <div class="hud-player-tray-body">
        <div class="hud-waveform-shell">
          <canvas class="hud-waveform" data-player-waveform width="640" height="112" tabindex="0" role="slider" aria-controls="povkh-audio-engine" aria-label="${escapeHtml(copy.seek)}" aria-valuemin="0" aria-valuemax="${Math.round(defaultTrack.audio.duration)}" aria-valuenow="0"></canvas>
          <i class="hud-waveform-playhead" data-player-playhead aria-hidden="true"></i>
          <output class="hud-waveform-tooltip" data-player-seek-tooltip hidden aria-hidden="true">00:00</output>
        </div>
        <div class="hud-audio-controls">
          <button type="button" data-player-prev aria-label="${escapeHtml(copy.prev)}">${escapeHtml(copy.prevShort)}</button>
          <button type="button" data-player-next aria-label="${escapeHtml(copy.next)}">${escapeHtml(copy.nextShort)}</button>
          <div class="hud-volume" data-player-volume-shell>
            <button class="hud-volume-toggle" type="button"
              data-player-volume-toggle
              data-volume-label="${escapeHtml(copy.volume)}"
              aria-label="${escapeHtml(copy.volume)}: 60%"
              aria-expanded="false"
              aria-controls="povkh-volume-popup">
              <span aria-hidden="true">VOL </span><span data-player-volume-value aria-hidden="true">60</span>
            </button>
            <div class="hud-volume-popup" id="povkh-volume-popup" data-player-volume-popup hidden>
              <label id="povkh-volume-label" for="povkh-volume-range" data-player-volume-label>${escapeHtml(copy.volumeControl)}</label>
              <span data-player-volume-percent aria-hidden="true">60%</span>
              <input id="povkh-volume-range" data-player-volume type="range" min="0" max="100" step="1" value="60" aria-labelledby="povkh-volume-label" aria-controls="povkh-audio-engine" aria-valuenow="60" aria-valuetext="60%">
            </div>
          </div>
          <output data-player-time aria-live="off">00:00 / ${playerTime(defaultTrack.audio.duration)}</output>
        </div>
        <p class="hud-audio-status" data-player-status data-loading-label="${escapeHtml(copy.loading)}" data-blocked-label="${escapeHtml(copy.blocked)}" data-waveform-error-label="${escapeHtml(copy.waveformError)}" data-audio-error-label="${escapeHtml(copy.audioError)}" aria-live="polite">${escapeHtml(copy.loading)}</p>
        <ol class="hud-audio-playlist">${playlist}</ol>
      </div>
    </section>
  </aside>`;
};

const globalHudMarkup = (catalog, defaultTrackIndex, trackCount) => {
  const snapshot = catalog.asOf.replaceAll("-", ".");
  return `<div class="site-hud-frame" data-hud-frame data-hud-section="01" aria-hidden="true">
  <div class="site-hud-timeline">
    <span class="site-hud-timeline-label">VIEWPORT [Y.PX]</span>
    ${Array.from({ length: 9 }, (_, index) => `<span data-hud-tick="${index}">${String(index * 100).padStart(4, "0")}</span>`).join("")}
  </div>
  <div class="site-hud-rail site-hud-rail-left">
    <p>COORD. SYS<br><b>PVKH-LAB</b></p>
    <span class="site-hud-ruler"><span class="site-hud-ruler-values">${Array.from({ length: 7 }, (_, index) => `<i data-hud-ruler-value="${index}">${String(index * 100).padStart(4, "0")}</i>`).join("")}</span></span>
    <p class="site-hud-section site-hud-section-a">SECTION / ACTIVE<br><b data-hud-section-current>01</b><br><span data-hud-section-title>HERO</span></p>
    <p class="site-hud-section site-hud-section-b">SECTION / NEXT<br><b data-hud-section-next>02</b></p>
    <p class="site-hud-baseline">BASELINE<br><b data-hud-baseline>Y 0000</b></p>
    <p class="site-hud-unit">GRID MINOR 24 PX<br>MAJOR 192 PX<br><b data-hud-depth>DEPTH 000%</b></p>
  </div>
  <div class="site-hud-rail site-hud-rail-right">
    <span class="site-hud-cross"></span>
    <div class="site-hud-status">
      <p>ARCHIVE STATUS<br><b>${SITE_STATUS.toUpperCase()}</b></p>
      <p>NODE<br><b data-hud-node>HOME.01</b></p>
      <p>VIEW DEPTH<br><b data-hud-progress>000%</b></p>
      <p>SNAPSHOT<br><b>${snapshot}</b></p>
    </div>
    <div class="site-hud-signal">
      <p><b>SIGNAL MONITOR</b><br>TRACK <span data-hud-player-index>${String(defaultTrackIndex + 1).padStart(2, "0")} / ${String(trackCount).padStart(2, "0")}</span><br>REAL PEAKS 160<br>SECTION <span data-hud-signal-section>01</span><br>OFFSET <span data-hud-offset>Y 0000</span></p>
      <span class="site-hud-meter"></span>
      <p><b>SIGNAL PATH</b><br>INPUT<br>MP3<br>↓<br>48 KHZ / 192 KBPS<br>↓<br>STEREO</p>
    </div>
    <p class="site-hud-ref">REF. &nbsp; POVKH-LAB<br>SYS. &nbsp; V1.0<br>MODE &nbsp; <span data-hud-mode>VIEW.01</span></p>
  </div>
</div>`;
};

const shell = ({ locale, route, title, description, body, catalog, audioLibrary, pageClass = "", ogType = "website", structuredDataExtra = null }) => {
  const meta = LOCALE_META[locale];
  const t = COPY[locale].common;
  const prefix = assetPrefixFor(locale, route);
  const canonical = absoluteUrlFor(publicPathFor(locale, route));
  const fullTitle = title === "POVKH LAB" ? title : `${title} — POVKH LAB`;
  const audioTracks = audioLibrary.tracks.map((audio) => {
    const release = catalog.releases.find((item) => item.id === audio.catalogId);
    if (!release) throw new Error(`${audio.catalogId} has no matching catalog release`);
    const catalogTrack = release.tracks.find((track) => track.position === audio.position);
    if (!catalogTrack) throw new Error(`${audio.id} has no matching catalog track`);
    return { ...release, id: audio.id, title: catalogTrack.title, audio };
  });
  const defaultTrackIndex = audioTracks.findIndex((track) => track.id === audioLibrary.defaultTrackId);
  if (defaultTrackIndex < 0) throw new Error(`${audioLibrary.defaultTrackId} is not present in the audio library`);
  const organization = {
    "@type": "Organization",
    "@id": `${absoluteUrlFor("/")}#label`,
    name: "Povkh Lab Recordings",
    alternateName: "POVKH LAB",
    foundingDate: "2025",
    founder: { "@type": "Person", name: "Aleksandr Babenko (Povkh)" },
    location: { "@type": "Place", name: "Brescia (BS), Italia" },
    url: absoluteUrlFor("/"),
    ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS.map(({ url }) => url) } : {})
  };
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": structuredDataExtra ? [organization, structuredDataExtra] : [organization]
  });
  const structuredDataHash = createHash("sha256").update(structuredData).digest("base64");
  const alternates = [
    ...LOCALES.map((targetLocale) => `<link rel="alternate" hreflang="${LOCALE_META[targetLocale].lang}" href="${absoluteUrlFor(publicPathFor(targetLocale, route))}">`),
    `<link rel="alternate" hreflang="x-default" href="${absoluteUrlFor(publicPathFor(DEFAULT_LOCALE, route))}">`
  ].join("\n  ");
  const ogAlternates = LOCALES
    .filter((targetLocale) => targetLocale !== locale)
    .map((targetLocale) => `<meta property="og:locale:alternate" content="${LOCALE_META[targetLocale].ogLocale}">`)
    .join("\n  ");

  const documentHead = `<!doctype html>
<html lang="${meta.lang}" data-site-base="${SITE_BASE_PATH}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080808">
  <meta name="color-scheme" content="dark">
  <meta name="robots" content="${route === "404" ? "noindex, follow" : ROBOTS_CONTENT}" data-route-head>
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${structuredDataHash}'; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'">
  <title data-route-head>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}" data-route-head>
  <link rel="canonical" href="${canonical}" data-route-head>
  ${alternates}
  <meta property="og:type" content="${ogType}" data-route-head>
  <meta property="og:site_name" content="POVKH LAB">
  <meta property="og:locale" content="${meta.ogLocale}">
  ${ogAlternates}
  <meta property="og:title" content="${escapeHtml(fullTitle)}" data-route-head>
  <meta property="og:description" content="${escapeHtml(description)}" data-route-head>
  <meta property="og:url" content="${canonical}" data-route-head>
  <meta property="og:image" content="${absoluteUrlFor(OG_IMAGE_PATH)}" data-route-head>
  <meta property="og:image:width" content="1200" data-route-head>
  <meta property="og:image:height" content="630" data-route-head>
  <meta property="og:image:alt" content="${escapeHtml(t.ogAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${prefix}assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg" type="image/svg+xml">
  <link rel="manifest" href="${manifestHrefFor(locale, route)}">
  <link rel="preload" href="${prefix}assets/fonts/BarlowCondensed-ExtraBold.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="${prefix}assets/fonts/Inter-Variable.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="stylesheet" href="${prefix}assets/styles.css">
  <script type="application/ld+json" data-route-head>${structuredData}</script>
  ${route === "404" ? "" : `<script src="${prefix}assets/site.js" defer></script>
  <script src="${prefix}assets/router.js" defer></script>`}
</head>`;

  if (route === "404") return `${documentHead}
<body class="${pageClass}" data-lightweight-shell data-site-status="${SITE_STATUS}" data-locale="${locale}">
  <header class="site-header lightweight-header">
    <div class="container lightweight-header-inner">
      <a class="brand-link" href="${hrefFor(locale, route, locale, "")}" aria-label="${escapeHtml(t.brandHome)}">
        <img src="${prefix}assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg" width="1600" height="400" alt="POVKH LAB">
      </a>
      ${languageMarkup(locale, route)}
    </div>
  </header>
  <main id="main-content" tabindex="-1">${body}</main>
</body>
</html>
`;

  return `${documentHead}
<body class="${pageClass}" data-site-status="${SITE_STATUS}" data-locale="${locale}">
  <a class="skip-link" href="#main-content">${escapeHtml(t.skip)}</a>
  <header class="site-header" data-route-header>
    <div class="container header-inner">
      <a class="brand-link" href="${hrefFor(locale, route, locale, "")}" aria-label="${escapeHtml(t.brandHome)}">
        <img src="${prefix}assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg" width="1600" height="400" alt="POVKH LAB">
      </a>
      ${navMarkup(locale, route)}
      ${siteIndexMarkup(locale, route)}
    </div>
  </header>
  ${globalHudMarkup(catalog, defaultTrackIndex, audioTracks.length)}
  ${audioPlayerMarkup(locale, prefix, audioTracks, audioLibrary.defaultTrackId)}
  <main id="main-content" tabindex="-1" data-route-main>
    <div class="site-ambient" aria-hidden="true">
      <video class="site-ambient-video" muted loop playsinline preload="none" tabindex="-1" data-motion-video>
        <source data-src="${prefix}assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.webm" type="video/webm">
        <source data-src="${prefix}assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.mp4" type="video/mp4">
      </video>
    </div>
    ${signalFieldMarkup()}
    ${body}
  </main>
  <footer class="site-footer" data-route-footer>
    <div class="container footer-grid">
      <img class="footer-mark" src="${prefix}assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg" width="1000" height="1000" alt="">
      <nav aria-label="${escapeHtml(t.footerNav)}"><ul class="footer-links">
        <li><a href="${hrefFor(locale, route, locale, "catalog")}">${escapeHtml(t.nav.catalog)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "merch")}">${escapeHtml(t.nav.merch)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "process")}">${escapeHtml(t.nav.process)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "press")}">${escapeHtml(t.nav.press)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "download")}">${escapeHtml(t.nav.download)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "contact")}">${escapeHtml(t.nav.contact)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "links")}">${escapeHtml(COPY[locale].pages.links.title)}</a></li>
      </ul></nav>
      <p class="footer-meta">POVKH LAB<br>${escapeHtml(t.footer.tagline)}<br>${escapeHtml(t.footer.version)}</p>
    </div>
  </footer>
</body>
</html>
`;
};

const listMarkup = (items) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

const heroMotionMarkup = (locale, route, name) => `<video class="hero-motion" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" data-motion-video>
  <source data-src="${assetPrefixFor(locale, route)}assets/motion/PVKH_MOTION_BLOB_${name}_1920x1080_v1.webm" data-mobile-src="${assetPrefixFor(locale, route)}assets/motion/PVKH_MOTION_BLOB_${name}_MOBILE_640x360_v1.webm" type="video/webm">
  <source data-src="${assetPrefixFor(locale, route)}assets/motion/PVKH_MOTION_BLOB_${name}_1920x1080_v1.mp4" data-mobile-src="${assetPrefixFor(locale, route)}assets/motion/PVKH_MOTION_BLOB_${name}_MOBILE_640x360_v1.mp4" type="video/mp4">
</video>`;

const formatDate = (value, locale) => new Intl.DateTimeFormat(LOCALE_META[locale].lang, {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
}).format(new Date(`${value}T12:00:00Z`));

const durationToIso = (duration) => {
  if (!duration) return undefined;
  const [minutes, seconds] = duration.split(":").map(Number);
  return `PT${minutes ? `${minutes}M` : ""}${seconds}S`;
};

const totalTrackDuration = (tracks) => {
  if (tracks.some((track) => !track.duration)) return null;
  const seconds = tracks.reduce((total, track) => {
    const [minutes, remainder] = track.duration.split(":").map(Number);
    return total + minutes * 60 + remainder;
  }, 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const GENRE_LABELS = {
  it: {
    Ambient: "Ambient",
    Electronic: "Elettronica",
    Electronica: "Elettronica",
    "Alternative rap": "Rap alternativo",
    "Cinematic electronica": "Elettronica cinematica",
    Downtempo: "Downtempo",
    "Experimental electronica": "Elettronica sperimentale",
    "Experimental hip-hop": "Hip-hop sperimentale",
    "IDM-adjacent": "Area IDM",
    "Left-field trap": "Trap sperimentale"
  },
  ru: {
    Ambient: "Эмбиент",
    Electronic: "Электроника",
    Electronica: "Электроника",
    "Alternative rap": "Альтернативный рэп",
    "Cinematic electronica": "Кинематографическая электроника",
    Downtempo: "Даунтемпо",
    "Experimental electronica": "Экспериментальная электроника",
    "Experimental hip-hop": "Экспериментальный хип-хоп",
    "IDM-adjacent": "Близко к IDM",
    "Left-field trap": "Экспериментальный трэп",
    Rap: "Рэп"
  }
};

export const genreLabel = (value, locale) => GENRE_LABELS[locale]?.[value] || value;

const conciseMetaDescription = (value, limit = 160) => {
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit - 1).replace(/\s+\S*$/, "").trimEnd();
  return `${clipped}…`;
};

const interpolate = (template, values) => Object.entries(values)
  .reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);

const streamingLinksMarkup = ({ release, releaseCopy, locale, currentRoute, includeAllServices = false }) => {
  if (!release.streamingLinks) return "";
  const label = interpolate(releaseCopy.streamingLabel, { title: release.title });
  const destinations = release.streamingLinks.map((destination) => ({ ...destination, external: true }));
  if (includeAllServices) {
    destinations.push({
      service: "allServices",
      url: hrefFor(locale, currentRoute, locale, `listen/${release.slug}`),
      external: false
    });
  }
  const links = destinations.map(({ service, url, external }) => {
    const serviceLabel = releaseCopy.services[service];
    const ariaTemplate = service === "allServices" ? releaseCopy.allServicesAria : releaseCopy.serviceAria;
    const ariaLabel = interpolate(ariaTemplate, { title: release.title, service: serviceLabel });
    const modifier = service === "appleMusic"
      ? ""
      : service === "allServices"
        ? " button-smart"
        : " button-secondary";
    const externalAttributes = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    const direction = external ? "↗" : "→";
    return `<li><a class="button streaming-button${modifier}" data-release-cta="streaming" data-streaming-service="${service}" href="${escapeHtml(url)}"${externalAttributes} aria-label="${escapeHtml(ariaLabel)}">${service === "allServices" ? '<span class="smart-signal" aria-hidden="true"></span>' : ""}<span class="streaming-label">${escapeHtml(serviceLabel)}</span><span class="streaming-direction" aria-hidden="true">${direction}</span></a></li>`;
  }).join("");
  const modifier = includeAllServices ? "" : " streaming-actions-three";
  return `<nav class="streaming-links" aria-label="${escapeHtml(label)}"><ul class="streaming-actions${modifier}">${links}</ul></nav>`;
};

const releaseVisualPath = (release) => release.artwork || `assets/releases/signals/${release.slug}.svg`;

const releaseVisualMarkup = ({ locale, currentRoute, release, className = "release-visual", eager = false }) => {
  const prefix = assetPrefixFor(locale, currentRoute);
  const isOfficial = Boolean(release.artwork);
  const alt = isOfficial ? `${release.title} — ${release.artistCredit}` : "";
  return `<figure class="${className}" data-artwork-status="${isOfficial ? "official" : "signal"}">
    <img src="${prefix}${escapeHtml(releaseVisualPath(release))}" width="1200" height="1200" alt="${escapeHtml(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async">
    ${isOfficial ? "" : '<figcaption aria-hidden="true">CATALOG SIGNAL / NO APPROVED ARTWORK</figcaption>'}
  </figure>`;
};

const artistMonogram = (name) => name.split(/[^\p{L}\p{N}]+/u)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => [...part][0])
  .join("")
  .toUpperCase();

const artistCreditMarkup = ({ artists, artistByName, locale, currentRoute }) => artists.map((name) => {
  const artist = artistByName.get(name);
  if (!artist) return escapeHtml(name);
  return `<a href="${hrefFor(locale, currentRoute, locale, `artists/${artist.slug}`)}">${escapeHtml(name)}</a>`;
}).join(" <span aria-hidden=\"true\">×</span> ");

const artistSocialLinksMarkup = ({ artist, label }) => {
  if (!artist.links.length) return "";
  const accessibleLabel = interpolate(label, { artist: artist.name });
  return `<nav class="artist-socials" aria-label="${escapeHtml(accessibleLabel)}"><ul>${artist.links.map(({ service, url }) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(service)}</span><span aria-hidden="true">↗</span></a></li>`).join("")}</ul></nav>`;
};

const artistGalleryMarkup = ({ artist, locale, route, copy }) => {
  const total = artist.gallery.length;
  const galleryLabel = interpolate(copy.galleryLabel, { artist: artist.name });
  const slides = artist.gallery.map((photo, index) => {
    const values = { artist: artist.name, index: String(index + 1), current: String(index + 1), total: String(total) };
    return `<figure class="artist-gallery-slide" data-gallery-slide role="group" aria-roledescription="slide" aria-label="${escapeHtml(interpolate(copy.photoPosition, values))}"${index === 0 ? ' aria-current="true"' : ""}><img src="${assetPrefixFor(locale, route)}${escapeHtml(photo)}" width="1200" height="1500" alt="${escapeHtml(interpolate(copy.photoAlt, values))}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" draggable="false"></figure>`;
  }).join("");
  const controls = total > 1
    ? `<div class="artist-gallery-controls"><button class="artist-gallery-button" type="button" data-gallery-previous aria-label="${escapeHtml(copy.previousPhoto)}" disabled><span aria-hidden="true">←</span></button><div class="artist-gallery-readout"><output data-gallery-counter aria-live="polite" aria-atomic="true" aria-label="${escapeHtml(interpolate(copy.photoPosition, { current: "1", total: String(total) }))}">01 / ${String(total).padStart(2, "0")}</output><span>${escapeHtml(copy.swipeHint)}</span></div><button class="artist-gallery-button" type="button" data-gallery-next aria-label="${escapeHtml(copy.nextPhoto)}"><span aria-hidden="true">→</span></button></div>`
    : "";
  return `<div class="artist-gallery${total > 1 ? " is-multiple" : ""}" data-artist-gallery data-gallery-index="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(galleryLabel)}"><div class="artist-gallery-track" data-gallery-track${total > 1 ? ` tabindex="0" aria-label="${escapeHtml(copy.swipeHint)}"` : ""}>${slides}</div>${controls}</div>`;
};

const releaseCardMarkup = ({ locale, currentRoute, release, t, filterable = false, headingLevel = 2 }) => {
  const route = `catalog/${release.slug}`;
  const headingTag = headingLevel === 3 ? "h3" : "h2";
  const filterAttributes = filterable
    ? ` data-release-card data-release-status="${release.status}"`
    : ` data-release-status="${release.status}"`;
  const cardId = `${release.slug}-card`;
  return `<a class="release-card"${filterAttributes} href="${hrefFor(locale, currentRoute, locale, route)}" aria-labelledby="${cardId}-action ${cardId}-code ${cardId}-title ${cardId}-artist">
    ${releaseVisualMarkup({ locale, currentRoute, release, className: "release-card-visual" })}
    <span class="sr-only" id="${cardId}-action">${escapeHtml(t.common.openRelease)}</span>
    <span class="status">${escapeHtml(t.common.status[release.status])}</span>
    <span class="release-card-code" id="${cardId}-code">${escapeHtml(release.id)}</span>
    <div class="release-card-main">
      <${headingTag} class="release-card-title" id="${cardId}-title" lang="${release.titleLanguage}">${escapeHtml(release.title)}</${headingTag}>
      <span class="meta" id="${cardId}-artist">${escapeHtml(release.artistCredit)}</span>
    </div>
    <time class="meta" datetime="${release.releaseDate}">${escapeHtml(formatDate(release.releaseDate, locale))}</time>
  </a>`;
};

const merchDetailStructuredData = ({ object, locale, route }) => ({
  "@type": "CreativeWork",
  "@id": `${absoluteUrlFor(publicPathFor(locale, route))}#concept`,
  name: object.content[locale].name,
  description: object.content[locale].metaDescription,
  url: absoluteUrlFor(publicPathFor(locale, route)),
  inLanguage: LOCALE_META[locale].lang,
  creator: { "@id": `${absoluteUrlFor("/")}#label` },
  isPartOf: { "@type": "CreativeWorkSeries", name: "POVKH LAB DROP 001" },
  image: object.gallery.map(({ path: imagePath }) => absoluteUrlFor(`/${imagePath}`))
});

const merchGalleryMarkup = ({ object, locale, route, copy }) => {
  const prefix = assetPrefixFor(locale, route);
  const gallery = object.gallery.filter((image, index) => index !== 0 || image.path !== object.viewer.poster);
  const total = gallery.length;
  const inline = gallery.map((image, index) => `<li class="merch-gallery-item" data-merch-gallery-item data-gallery-index="${index}">
      <a class="merch-gallery-trigger" data-merch-gallery-trigger href="${prefix}${escapeHtml(image.path)}" aria-label="${escapeHtml(`${copy.viewGallery}: ${image.alt[locale]}`)}">
        <span class="merch-gallery-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <img src="${prefix}${escapeHtml(image.path)}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.alt[locale])}" loading="lazy" decoding="async">
        <span class="merch-gallery-caption">${escapeHtml(image.caption[locale])}</span>
      </a>
    </li>`).join("");
  const slides = gallery.map((image, index) => `<figure class="merch-gallery-dialog-figure" data-merch-gallery-figure data-gallery-index="${index}"${index === 0 ? "" : " hidden"}>
        <img src="${prefix}${escapeHtml(image.path)}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.alt[locale])}" loading="lazy" decoding="async">
        <figcaption>${escapeHtml(image.caption[locale])}</figcaption>
      </figure>`).join("");
  const counterLabel = interpolate(copy.imageCounter, { current: "1", total: String(total) });
  return `<div class="merch-gallery" data-merch-gallery data-gallery-count="${total}">
    <ol class="merch-gallery-list" data-merch-gallery-list aria-label="${escapeHtml(copy.galleryLabel)}">${inline}</ol>
    <dialog class="merch-gallery-dialog" data-merch-gallery-dialog aria-labelledby="${escapeHtml(object.id)}-gallery-title">
      <div class="merch-gallery-dialog-head">
        <h2 id="${escapeHtml(object.id)}-gallery-title">${escapeHtml(object.content[locale].name)} / ${escapeHtml(copy.galleryLabel)}</h2>
        <button type="button" data-merch-gallery-close aria-label="${escapeHtml(copy.closeGallery)}">×</button>
      </div>
      <div class="merch-gallery-dialog-stage">${slides}</div>
      <div class="merch-gallery-dialog-controls">
        <button type="button" data-merch-gallery-previous aria-label="${escapeHtml(copy.previousImage)}" disabled>←</button>
        <output data-merch-gallery-counter data-counter-template="${escapeHtml(copy.imageCounter)}" aria-live="polite" aria-atomic="true" aria-label="${escapeHtml(counterLabel)}">01 / ${String(total).padStart(2, "0")}</output>
        <button type="button" data-merch-gallery-next aria-label="${escapeHtml(copy.nextImage)}">→</button>
      </div>
    </dialog>
  </div>`;
};

const productViewerMarkup = ({ object, locale, route, copy }) => {
  const prefix = assetPrefixFor(locale, route);
  const hero = object.gallery[0];
  if (["hoodie", "cap"].includes(object.slug)) {
    return `<figure class="merch-detail-visual">
      <img src="${prefix}${escapeHtml(hero.path)}" width="${hero.width}" height="${hero.height}" alt="${escapeHtml(hero.alt[locale])}" loading="eager" fetchpriority="high" decoding="async">
      <figcaption>${escapeHtml(hero.caption[locale])}</figcaption>
    </figure>`;
  }
  const viewer = object.viewer;
  const dataSaverCopy = copy.viewerDataSaver;
  const sourceBlocked = viewer.availability === "sourceBlocked";
  const blockedCopy = SOURCE_BLOCKED_VIEWER_COPY[locale];
  const instructionsId = `${object.id.toLowerCase()}-viewer-instructions`;
  const cameraOrbit = viewer.cameraOrbit || { desktop: "0deg 75deg 105%", mobile: "0deg 75deg 105%" };
  const fieldOfView = viewer.fieldOfView || { desktop: "auto", mobile: "auto" };
  const cameraTarget = viewer.cameraTarget || { desktop: "auto auto auto", mobile: "auto auto auto" };
  const orbitLimits = viewer.orbitLimits;
  const orbitLimitAttributes = orbitLimits
    ? ` data-viewer-min-camera-orbit="${escapeHtml(orbitLimits.min)}" data-viewer-max-camera-orbit="${escapeHtml(orbitLimits.max)}"`
    : "";
  return `<section class="product-viewer" data-product-viewer data-viewer-kind="${escapeHtml(viewer.kind)}" data-viewer-availability="${sourceBlocked ? "sourceBlocked" : "available"}" data-viewer-src="${prefix}${escapeHtml(viewer.src)}" data-viewer-poster="${prefix}${escapeHtml(viewer.poster)}" data-viewer-orbit-desktop="${escapeHtml(cameraOrbit.desktop)}" data-viewer-orbit-mobile="${escapeHtml(cameraOrbit.mobile)}" data-viewer-field-of-view-desktop="${escapeHtml(fieldOfView.desktop)}" data-viewer-field-of-view-mobile="${escapeHtml(fieldOfView.mobile)}" data-viewer-camera-target-desktop="${escapeHtml(cameraTarget.desktop)}" data-viewer-camera-target-mobile="${escapeHtml(cameraTarget.mobile)}"${orbitLimitAttributes} data-viewer-module="${prefix}assets/product-viewer.js" data-viewer-runtime="${prefix}assets/vendor/model-viewer.min.js" data-viewer-loading="${escapeHtml(copy.viewerLoading)}" data-viewer-ready="${escapeHtml(copy.viewerReady)}" data-viewer-error="${escapeHtml(copy.viewerError)}" data-viewer-data-saver="${escapeHtml(dataSaverCopy)}" data-viewer-budget="${escapeHtml(String(viewer.budget.bytes || viewer.budget.desktopBytes || 0))}" aria-label="${escapeHtml(sourceBlocked ? SOURCE_BLOCKED_VIEWER_LABEL[locale] : copy.viewerLabel)}">
    <div class="product-viewer-stage" data-product-viewer-stage>
      <img data-product-viewer-poster src="${prefix}${escapeHtml(hero.path)}" width="${hero.width}" height="${hero.height}" alt="${escapeHtml(viewer.alt[locale])}" loading="eager" fetchpriority="high" decoding="async">
      <div class="product-viewer-canvas" data-product-viewer-canvas aria-hidden="true"></div>
      <span class="product-viewer-datum" aria-hidden="true">OBJECT / ${escapeHtml(object.id.slice(-3))}</span>
    </div>
    <div class="product-viewer-controls">
      <button class="button" type="button" data-product-viewer-activate${sourceBlocked ? ` disabled aria-disabled="true"` : ""}>${escapeHtml(sourceBlocked ? blockedCopy : copy.viewerActivate)}</button>
      <button class="button button-secondary" type="button" data-product-viewer-reset hidden>${escapeHtml(copy.viewerReset)}</button>
      <p class="product-viewer-status" data-product-viewer-status role="status" aria-live="polite" aria-atomic="true">${sourceBlocked ? escapeHtml(blockedCopy) : ""}</p>
    </div>
    <p class="product-viewer-instructions" id="${escapeHtml(instructionsId)}" data-product-viewer-instructions hidden>${escapeHtml(copy.viewerInstructions)}</p>
    <p class="product-viewer-caption">${escapeHtml(hero.caption[locale])}</p>
  </section>`;
};

const merchDetailMarkup = ({ object, previous, next, locale, route, overview, copy }) => {
  const content = object.content[locale];
  const adjacent = [
    previous ? `<a rel="prev" href="${hrefFor(locale, route, locale, `merch/${previous.slug}`)}"><span>${escapeHtml(copy.previousObject)}</span><strong>${escapeHtml(previous.content[locale].name)}</strong></a>` : "",
    next ? `<a rel="next" href="${hrefFor(locale, route, locale, `merch/${next.slug}`)}"><span>${escapeHtml(copy.nextObject)}</span><strong>${escapeHtml(next.content[locale].name)}</strong></a>` : ""
  ].filter(Boolean).join("");
  return `<div class="container merch-detail" data-merch-detail-id="${escapeHtml(object.id)}" data-merch-stage="concept">
    <nav class="merch-breadcrumb" data-merch-breadcrumb aria-label="${escapeHtml(COPY[locale].common.breadcrumb)}"><ol>
      <li><a href="${hrefFor(locale, route, locale, "")}">${escapeHtml(COPY[locale].common.nav.home)}</a></li>
      <li><a href="${hrefFor(locale, route, locale, "merch")}">${escapeHtml(overview.title)}</a></li>
      <li aria-current="page">${escapeHtml(content.name)}</li>
    </ol></nav>
    <section class="merch-detail-hero" aria-labelledby="merch-detail-title">
      <div class="merch-detail-copy">
        <span class="merch-detail-index" aria-hidden="true">${String(object.order).padStart(2, "0")}</span>
        <p class="eyebrow">${escapeHtml(content.eyebrow)}</p>
        <h1 class="page-title" id="merch-detail-title">${escapeHtml(content.name)}</h1>
        <p class="merch-concept-status" data-merch-visible-status>${escapeHtml(copy.conceptStatus)}</p>
        <p class="lede">${escapeHtml(content.lede)}</p>
      </div>
      ${productViewerMarkup({ object, locale, route, copy })}
    </section>
    <section class="section merch-detail-gallery-section" id="merch-concept-gallery" aria-labelledby="merch-gallery-heading">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(content.eyebrow)}</p><h2 class="section-title" id="merch-gallery-heading">${escapeHtml(copy.galleryLabel)}</h2></div><p class="body-copy">${escapeHtml(content.conceptNote)}</p></div>
      ${merchGalleryMarkup({ object, locale, route, copy })}
    </section>
    <section class="section merch-detail-story" aria-labelledby="merch-story-title">
      <div class="merch-story-datum" aria-hidden="true">OBJECT / CONCEPT</div>
      <div><p class="eyebrow">${escapeHtml(copy.storyEyebrow)}</p><h2 class="section-title" id="merch-story-title">${escapeHtml(content.storyTitle)}</h2><p class="body-copy">${escapeHtml(content.storyBody)}</p></div>
    </section>
    ${object.specifications.length ? `<section class="section merch-detail-specifications"><h2>${escapeHtml(copy.specificationsTitle)}</h2><dl>${object.specifications.map((specification) => `<div><dt>${escapeHtml(specification.label[locale])}</dt><dd>${escapeHtml(specification.value[locale])}</dd></div>`).join("")}</dl></section>` : ""}
    <aside class="merch-release-gate" data-merch-release-gate>
      <h2>${escapeHtml(copy.releaseGateTitle)}</h2>
      <p>${escapeHtml(content.conceptNote)}</p>
      <p>${escapeHtml(object.releaseGate.copy[locale])}</p>
    </aside>
    <div class="merch-detail-actions">
      <a class="button" href="${hrefFor(locale, route, locale, "merch")}">← ${escapeHtml(copy.backToDrop)}</a>
      <a class="button button-secondary" href="${hrefFor(locale, route, locale, "links")}">${escapeHtml(copy.accessTerminal)} →</a>
    </div>
    <nav class="merch-adjacent" aria-label="${escapeHtml(copy.galleryLabel)}">${adjacent}</nav>
  </div>`;
};

const createLocalePages = (locale, catalog, audioLibrary, artistLibrary, merchLibrary) => {
  const t = COPY[locale];
  const releases = catalog.releases;
  const artistByName = new Map(artistLibrary.artists.map((artist) => [artist.name, artist]));
  for (const release of releases) {
    for (const name of release.artists) {
      if (!artistByName.has(name)) throw new Error(`Artist profile missing for ${name}`);
    }
  }
  const label = catalog.label;
  const labelCopy = label.content[locale];
  const published = releases.filter((release) => release.status === "published");
  const upcoming = releases.filter((release) => release.status === "upcoming");
  const featured = [...upcoming].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0]
    || [...published].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
  const pages = new Map();
  const page = (route, key, body, options = {}) => {
    const { copy: copyOverride, ...shellOptions } = options;
    const copy = copyOverride || t.pages[key];
    pages.set(outputPathFor(locale, route), shell({
      locale,
      route,
      title: copy.title,
      description: copy.description,
      body,
      catalog,
      audioLibrary,
      ...shellOptions
    }));
  };

  const home = t.pages.home;
  page("", "home", `
    <div class="container">
      <section class="hero" aria-labelledby="home-title">
        ${heroMotionMarkup(locale, "", "SOUND")}
        <div>
          <p class="eyebrow">${escapeHtml(home.eyebrow)}</p>
          <h1 class="hero-title" id="home-title">${home.heroTitle.map((line) => `<span class="hero-title-line">${escapeHtml(line)}</span>`).join("\n")}</h1>
        </div>
        <div class="hero-bottom">
          <p class="lede">${escapeHtml(home.lede)}</p>
          <div>
            <p class="meta muted">${escapeHtml(home.sequenceLabel)}</p>
            <p class="body-copy">${escapeHtml(home.sequenceValue)}</p>
            <div class="button-row"><a class="button" href="${hrefFor(locale, "", locale, "catalog")}">${escapeHtml(home.catalogCta)}</a></div>
          </div>
        </div>
      </section>
    </div>
    <section class="section">
      <div class="container">
        <div class="section-head section-rule">
          <div><p class="eyebrow">${escapeHtml(home.featuredEyebrow)}</p><h2 class="section-title">${escapeHtml(home.featuredTitle)}</h2></div>
          <p class="body-copy">${escapeHtml(home.featuredBody)}</p>
        </div>
        ${releaseCardMarkup({ locale, currentRoute: "", release: featured, t, headingLevel: 3 })}
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="section-head section-rule">
          <div><p class="eyebrow">${escapeHtml(home.pathsEyebrow)}</p><h2 class="section-title">${escapeHtml(home.pathsTitle)}</h2></div>
          <p class="body-copy">${escapeHtml(home.pathsBody)}</p>
        </div>
        <div class="path-grid">
          ${home.paths.map((item) => `<a class="path-card" href="${hrefFor(locale, "", locale, item.route)}"><span class="index-no">${escapeHtml(item.index)}</span><h3 class="card-title">${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></a>`).join("")}
        </div>
      </div>
    </section>`, { pageClass: "page-home" });

  const catalogCopy = t.pages.catalog;
  page("catalog", "catalog", `
    <div class="container">
      <section class="hero" aria-labelledby="catalog-title">
        ${heroMotionMarkup(locale, "catalog", "ARCHIVE")}
        <div><p class="eyebrow">${escapeHtml(catalogCopy.eyebrow)}</p><h1 class="page-title" id="catalog-title">${escapeHtml(catalogCopy.title)}</h1></div>
        <div class="hero-bottom"><p class="lede">${escapeHtml(catalogCopy.lede)}</p><p class="meta muted">${escapeHtml(catalogCopy.publishedLabel)}: ${published.length}<br>${escapeHtml(catalogCopy.upcomingLabel)}: ${upcoming.length}</p></div>
      </section>
    </div>
    <section class="section">
      <div class="container">
        <div class="catalog-toolbar" data-catalog-filters data-results-template="${escapeHtml(catalogCopy.resultsTemplate)}" aria-label="${escapeHtml(catalogCopy.filterLabel)}">
          <button class="filter-button" type="button" data-filter-value="all" aria-pressed="true">${escapeHtml(catalogCopy.filters.all)}</button>
          <button class="filter-button" type="button" data-filter-value="published" aria-pressed="false">${escapeHtml(catalogCopy.filters.published)}</button>
          <button class="filter-button" type="button" data-filter-value="upcoming" aria-pressed="false">${escapeHtml(catalogCopy.filters.upcoming)}</button>
          <span class="filter-result" data-filter-result aria-live="polite"></span>
        </div>
        <div class="catalog-grid flow-top">
          ${[...releases].reverse().map((release) => releaseCardMarkup({ locale, currentRoute: "catalog", release, t, filterable: true })).join("")}
        </div>
        <aside class="panel catalog-policy" aria-labelledby="catalog-policy-title">
          <p class="eyebrow">${escapeHtml(catalogCopy.policyEyebrow)}</p>
          <h2 class="card-title" id="catalog-policy-title">${escapeHtml(catalogCopy.policyTitle)}</h2>
          <p>${escapeHtml(catalogCopy.policyBody)}</p>
        </aside>
      </div>
    </section>`, { pageClass: "page-catalog" });

  const releaseCopy = t.pages.release;
  const listenCopy = t.pages.listen;
  for (const [releaseIndex, release] of releases.entries()) {
    const route = `catalog/${release.slug}`;
    const localized = release.content[locale];
    const editorialApproved = release.editorial?.reviewRequired !== true;
    const previous = releases[releaseIndex - 1] || null;
    const next = releases[releaseIndex + 1] || null;
    const releaseDuration = totalTrackDuration(release.tracks);
    const recordingData = {
      "@type": release.trackCount === 1 ? "MusicRecording" : "MusicAlbum",
      "@id": `${absoluteUrlFor(publicPathFor(locale, route))}#recording`,
      name: release.title,
      byArtist: release.artists.map((name) => ({
        "@type": "MusicGroup",
        name,
        url: absoluteUrlFor(publicPathFor(locale, `artists/${artistByName.get(name).slug}`))
      })),
      datePublished: release.releaseDate,
      genre: release.primaryGenre || undefined,
      duration: durationToIso(releaseDuration),
      numTracks: release.trackCount === 1 ? undefined : release.trackCount,
      track: release.trackCount === 1 ? undefined : release.tracks.map((track) => ({
        "@type": "MusicRecording",
        position: track.position,
        name: track.title,
        duration: durationToIso(track.duration)
      })),
      url: absoluteUrlFor(publicPathFor(locale, route)),
      sameAs: release.streamingLinks
        ? release.streamingLinks
          .filter(({ service }) => service !== "allServices")
          .map(({ url }) => url)
        : undefined,
      publisher: { "@id": `${absoluteUrlFor("/")}#label` }
    };
    page(route, "release", `
      <div class="container">
        <section class="section release-hero" aria-labelledby="release-title" data-release-id="${release.id}" data-release-status="${release.status}">
          <nav aria-label="${escapeHtml(t.common.breadcrumb)}"><ol class="breadcrumb"><li><a href="${hrefFor(locale, route, locale, "")}">${escapeHtml(t.common.nav.home)}</a></li><li><a href="${hrefFor(locale, route, locale, "catalog")}">${escapeHtml(t.common.nav.catalog)}</a></li><li aria-current="page">${escapeHtml(release.id)}</li></ol></nav>
          ${releaseVisualMarkup({ locale, currentRoute: route, release, className: "release-hero-visual", eager: true })}
          <div class="release-heading">
            <span class="status">${escapeHtml(t.common.status[release.status])}</span>
            <p class="eyebrow">${escapeHtml(releaseCopy.position)} / ${escapeHtml(release.id.slice(-3))}</p>
            <h1 class="release-code" id="release-title" aria-labelledby="release-title release-name-${release.slug}">${escapeHtml(release.id)}</h1>
            <p class="release-display-title" id="release-name-${release.slug}" lang="${release.titleLanguage}">${escapeHtml(release.title)}</p>
            <p class="release-artist">${artistCreditMarkup({ artists: release.artists, artistByName, locale, currentRoute: route })}</p>
          </div>
        </section>
      </div>
      <section class="section">
        <div class="container release-grid">
          <div>
            <p class="eyebrow">${escapeHtml(releaseCopy.statementEyebrow)}</p>
            <h2 class="section-title">${escapeHtml(releaseCopy.statementTitle)}</h2>
            <p class="release-statement">${escapeHtml(editorialApproved ? localized.short : releaseCopy.editorialPendingBody)}</p>
            ${release.streamingLinks
              ? streamingLinksMarkup({ release, releaseCopy, locale, currentRoute: route, includeAllServices: true })
              : release.preorderUrl
                ? `<div class="button-row"><a class="button" data-release-cta="preorder" href="${escapeHtml(release.preorderUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(releaseCopy.preorderCta)}<span aria-hidden="true"> ↗</span></a></div>`
                : `<p class="upcoming-note">${escapeHtml(releaseCopy.upcomingBody)}</p>`}
          </div>
          <dl class="data-list">
            <div><dt>${escapeHtml(releaseCopy.fields.status)}</dt><dd>${escapeHtml(t.common.status[release.status])}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.artist)}</dt><dd>${artistCreditMarkup({ artists: release.artists, artistByName, locale, currentRoute: route })}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.date)}</dt><dd><time datetime="${release.releaseDate}">${escapeHtml(formatDate(release.releaseDate, locale))}</time></dd></div>
            ${release.preorderDate ? `<div><dt>${escapeHtml(releaseCopy.fields.preorder)}</dt><dd><time datetime="${release.preorderDate}">${escapeHtml(formatDate(release.preorderDate, locale))}</time></dd></div>` : ""}
            <div><dt>${escapeHtml(releaseCopy.fields.format)}</dt><dd>${escapeHtml([t.common.digital, t.common.releaseTypes[release.releaseType]].filter(Boolean).join(" / "))}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.tracks)}</dt><dd>${release.trackCount}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.primaryGenre)}</dt><dd data-release-primary-genre data-verified="${release.primaryGenre ? "true" : "false"}">${escapeHtml(release.primaryGenre ? genreLabel(release.primaryGenre, locale) : t.common.platformGenrePending)}</dd></div>
            ${editorialApproved && release.editorialTags.length ? `<div><dt>${escapeHtml(releaseCopy.fields.editorialTags)}</dt><dd data-release-editorial-tags>${escapeHtml(release.editorialTags.map((tag) => genreLabel(tag, locale)).join(" / "))}</dd></div>` : ""}
            <div><dt>${escapeHtml(releaseCopy.fields.duration)}</dt><dd>${escapeHtml(releaseDuration || t.common.tba)}</dd></div>
          </dl>
        </div>
      </section>
      ${editorialApproved ? `<section class="section">
        <div class="container editorial-grid">
          <article class="editorial-block editorial-story"><p class="eyebrow">${escapeHtml(releaseCopy.storyEyebrow)}</p><h2 class="card-title">${escapeHtml(releaseCopy.storyTitle)}</h2><p>${escapeHtml(localized.story)}</p></article>
          <article class="editorial-block"><p class="eyebrow">${escapeHtml(releaseCopy.moodEyebrow)}</p><h2 class="card-title">${escapeHtml(releaseCopy.moodTitle)}</h2><p>${escapeHtml(localized.mood)}</p></article>
          <article class="editorial-block"><p class="eyebrow">${escapeHtml(releaseCopy.audienceEyebrow)}</p><h2 class="card-title">${escapeHtml(releaseCopy.audienceTitle)}</h2><p>${escapeHtml(localized.audience)}</p></article>
        </div>
      </section>` : ""}
      <section class="section">
        <div class="container grid-2">
          <div class="panel"><p class="eyebrow">${escapeHtml(releaseCopy.tracklist)}</p><ol class="track-list">${release.tracks.map((track) => `<li><span class="track-position">${String(track.position).padStart(2, "0")}</span><span lang="${release.titleLanguage}">${escapeHtml(track.title)}</span><span class="meta">${escapeHtml(track.duration || t.common.tba)}</span></li>`).join("")}</ol></div>
          <div class="panel"><p class="eyebrow">${escapeHtml(releaseCopy.credits)}</p><h2 class="card-title artist-credit-links">${artistCreditMarkup({ artists: release.artists, artistByName, locale, currentRoute: route })}</h2><p>${escapeHtml(releaseCopy.cataloguedBy)} ${escapeHtml(label.officialName)}.</p></div>
        </div>
      </section>
      <nav class="catalog-pager container" aria-label="${escapeHtml(releaseCopy.catalogNavigation)}">
        ${previous ? `<a class="pager-link" href="${hrefFor(locale, route, locale, `catalog/${previous.slug}`)}"><span class="meta">${escapeHtml(releaseCopy.previous)}</span><strong>${escapeHtml(previous.id)} / <span lang="${previous.titleLanguage}">${escapeHtml(previous.title)}</span></strong></a>` : "<span></span>"}
        ${next ? `<a class="pager-link pager-next" href="${hrefFor(locale, route, locale, `catalog/${next.slug}`)}"><span class="meta">${escapeHtml(releaseCopy.next)}</span><strong>${escapeHtml(next.id)} / <span lang="${next.titleLanguage}">${escapeHtml(next.title)}</span></strong></a>` : `<a class="pager-link pager-next" href="${hrefFor(locale, route, locale, "catalog")}"><span class="meta">${escapeHtml(releaseCopy.back)}</span><strong>${escapeHtml(t.common.nav.catalog)}</strong></a>`}
      </nav>`, {
        title: `${release.id} — ${release.title}`,
        description: conciseMetaDescription(localized.short),
        ogType: release.trackCount === 1 ? "music.song" : "music.album",
        pageClass: "page-release",
        structuredDataExtra: recordingData
      });

    if (release.streamingLinks) {
      const listenRoute = `listen/${release.slug}`;
      page(listenRoute, "listen", `
        <div class="container">
          <section class="section smartlink-page" aria-labelledby="smartlink-title" data-smart-release-id="${release.id}">
            <nav aria-label="${escapeHtml(t.common.breadcrumb)}"><ol class="breadcrumb"><li><a href="${hrefFor(locale, listenRoute, locale, "")}">${escapeHtml(t.common.nav.home)}</a></li><li><a href="${hrefFor(locale, listenRoute, locale, "catalog")}">${escapeHtml(t.common.nav.catalog)}</a></li><li><a href="${hrefFor(locale, listenRoute, locale, route)}">${escapeHtml(release.id)}</a></li><li aria-current="page">${escapeHtml(listenCopy.title)}</li></ol></nav>
            <div class="smartlink-layout">
              <div>
                <p class="eyebrow">${escapeHtml(listenCopy.eyebrow)} / ${escapeHtml(release.id)}</p>
                <h1 class="section-title" id="smartlink-title">${escapeHtml(listenCopy.title)}</h1>
              </div>
              <div>
                <p class="smartlink-release" lang="${release.titleLanguage}">${escapeHtml(release.title)}</p>
                <p class="meta">${escapeHtml(release.artistCredit)}</p>
                <p class="lede smartlink-lede">${escapeHtml(listenCopy.lede)}</p>
                ${streamingLinksMarkup({ release, releaseCopy, locale, currentRoute: listenRoute })}
                <p class="meta muted smartlink-note">${escapeHtml(listenCopy.availability)}</p>
                <div class="button-row"><a class="button button-secondary" data-smart-back href="${hrefFor(locale, listenRoute, locale, route)}"><span aria-hidden="true">← </span>${escapeHtml(listenCopy.back)}</a></div>
              </div>
            </div>
          </section>
        </div>`, {
        title: `${release.title} — ${listenCopy.title}`,
        description: `${listenCopy.description} ${release.title} — ${release.artistCredit}.`,
        pageClass: "page-listen"
      });
    }
  }

  const merch = merchLibrary.content[locale];
  const merchObjectsByCategory = new Map(merchLibrary.categories.map(({ id }) => [
    id,
    merchLibrary.objects.filter((object) => object.category === id)
  ]));

  page("merch", "merch", `
  <div class="container">
    <section class="hero merch-hero" aria-labelledby="merch-title">
      <div>
        <p class="eyebrow">${escapeHtml(merch.eyebrow)}</p>
        <h1 class="page-title" id="merch-title">${escapeHtml(merch.heroTitle)}</h1>
      </div>
      <div class="merch-motion-stage" data-merch-motion-stage>
        ${heroMotionMarkup(locale, "merch", "PHYSICAL")}
        <div class="merch-motion-fallback" data-merch-motion-fallback aria-hidden="true">
          <span class="merch-motion-ring"></span>
          <span class="merch-motion-datum"></span>
          <span class="merch-motion-signal"></span>
        </div>
      </div>
      <div class="hero-bottom">
        <p class="lede">${escapeHtml(merch.lede)}</p>
        <div>
          <p class="meta muted" data-merch-visible-status>${escapeHtml(merch.status)}</p>
        </div>
      </div>
    </section>
  </div>
  <section class="section" id="merch-objects" data-merch-index>
    <div class="container">
      <div class="section-head section-rule">
        <div><p class="eyebrow">${escapeHtml(merch.indexEyebrow)}</p><h2 class="section-title">${escapeHtml(merch.indexTitle)}</h2></div>
        <p class="body-copy">${escapeHtml(merch.indexBody)}</p>
      </div>
      <div class="merch-categories">
        ${merchLibrary.categories.map(({ id }) => `
          <section class="merch-category" data-merch-category="${escapeHtml(id)}" aria-labelledby="merch-category-${escapeHtml(id)}">
            <h3 id="merch-category-${escapeHtml(id)}">${escapeHtml(merch.categoryLabels[id])}</h3>
            <div class="merch-object-grid">
              ${merchObjectsByCategory.get(id).map((object) => `
                <a class="merch-object" data-merch-object data-merch-detail data-merch-id="${escapeHtml(object.id)}" data-merch-status="comingSoon" href="${hrefFor(locale, "merch", locale, `merch/${object.slug}`)}">
                  <span class="index-no">${escapeHtml(String(object.order).padStart(2, "0"))}</span>
                  <img class="merch-object-image" src="${assetPrefixFor(locale, "merch")}${escapeHtml(object.gallery[0].path)}" width="${object.gallery[0].width}" height="${object.gallery[0].height}" alt="${escapeHtml(object.gallery[0].alt[locale])}" loading="lazy" decoding="async">
                  <h4>${escapeHtml(object.content[locale].name)}</h4>
                </a>`).join("")}
            </div>
          </section>`).join("")}
      </div>
    </div>
  </section>
  <details class="section merch-roadmap-disclosure" data-merch-roadmap>
    <summary class="container merch-roadmap-summary">
      <span><span class="eyebrow">${escapeHtml(merch.roadmapEyebrow)}</span><span class="section-title" role="heading" aria-level="2">${escapeHtml(merch.roadmapTitle)}</span></span>
      <span class="body-copy">${escapeHtml(merch.roadmapBody)}</span>
    </summary>
    <div class="container merch-roadmap-content">
      <ol class="merch-roadmap">
        ${merch.roadmapPhases.map((phase) => `<li><span class="index-no">${escapeHtml(phase.index)}</span><div><h3>${escapeHtml(phase.title)}</h3><p>${escapeHtml(phase.body)}</p></div></li>`).join("")}
      </ol>
    </div>
  </details>
`, { copy: merch, pageClass: "page-merch" });

  for (const [index, object] of merchLibrary.objects.entries()) {
    const route = `merch/${object.slug}`;
    const previous = merchLibrary.objects[index - 1] || null;
    const next = merchLibrary.objects[index + 1] || null;
    page(route, "merchDetail", merchDetailMarkup({
      object,
      previous,
      next,
      locale,
      route,
      overview: merch,
      copy: merchLibrary.copy[locale]
    }), {
      copy: { title: object.content[locale].name, description: object.content[locale].metaDescription },
      pageClass: "page-merch-detail",
      structuredDataExtra: merchDetailStructuredData({ object, locale, route })
    });
  }

  const artists = t.pages.artists;
  const artistIndex = new Map();
  for (const release of releases) {
    for (const artist of release.artists) {
      if (!artistIndex.has(artist)) artistIndex.set(artist, []);
      artistIndex.get(artist).push(release);
    }
  }
  page("artists", "artists", `
    <div class="container">
      <section class="hero" aria-labelledby="artists-title">
        ${heroMotionMarkup(locale, "artists", "TEAM")}
        <div><p class="eyebrow">${escapeHtml(artists.eyebrow)}</p><h1 class="page-title" id="artists-title">${escapeHtml(artists.title)}</h1></div>
        <div class="hero-bottom"><p class="lede">${escapeHtml(artists.lede)}</p><p class="meta muted">${escapeHtml(artists.countLabel)}: ${artistIndex.size}<br>${escapeHtml(artists.catalogLabel)}: ${releases.length}</p></div>
      </section>
    </div>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(artists.rosterEyebrow)}</p><h2 class="section-title">${escapeHtml(artists.rosterTitle)}</h2></div><p class="body-copy">${escapeHtml(artists.body)}</p></div>
      <div class="artist-grid">${artistLibrary.artists.map((artist, index) => {
        const artistReleases = artistIndex.get(artist.name) || [];
        const portrait = artist.portrait
          ? `<img class="artist-card-portrait" src="${assetPrefixFor(locale, "artists")}${escapeHtml(artist.portrait)}" width="1200" height="1500" alt="${escapeHtml(artist.name)}" loading="lazy" decoding="async">`
          : `<span class="artist-monogram" aria-hidden="true">${escapeHtml(artistMonogram(artist.name))}</span>`;
        return `<article class="panel artist-card">${portrait}<span class="index-no">${String(index + 1).padStart(2, "0")}</span><h3 class="card-title"><a href="${hrefFor(locale, "artists", locale, `artists/${artist.slug}`)}">${escapeHtml(artist.name)}</a></h3><p class="meta">${escapeHtml(artists.positionsLabel)}: ${artistReleases.length}</p><ul class="artist-release-list">${artistReleases.map((release) => `<li><a href="${hrefFor(locale, "artists", locale, `catalog/${release.slug}`)}"><span>${escapeHtml(release.id)}</span><span lang="${release.titleLanguage}">${escapeHtml(release.title)}</span></a></li>`).join("")}</ul><a class="artist-card-open" href="${hrefFor(locale, "artists", locale, `artists/${artist.slug}`)}">${escapeHtml(artists.openProfile)} <span aria-hidden="true">→</span></a></article>`;
      }).join("")}</div>
    </div></section>`, { pageClass: "page-artists" });

  const artistProfile = t.pages.artistProfile;
  for (const artist of artistLibrary.artists) {
    const artistReleases = artistIndex.get(artist.name) || [];
    const route = `artists/${artist.slug}`;
    const collaborators = [...new Set(artistReleases.flatMap((release) => release.artists).filter((name) => name !== artist.name))];
    const latest = [...artistReleases].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
    const visual = artist.gallery.length
      ? artistGalleryMarkup({ artist, locale, route, copy: artistProfile })
      : `<div class="artist-profile-signal" aria-hidden="true"><span>${escapeHtml(artistMonogram(artist.name))}</span><i></i><i></i><i></i></div>`;
    const profileDescription = interpolate(artistProfile.description, { artist: artist.name, count: String(artistReleases.length) });
    const artistData = {
      "@type": "MusicGroup",
      "@id": `${absoluteUrlFor(publicPathFor(locale, route))}#artist`,
      name: artist.name,
      url: absoluteUrlFor(publicPathFor(locale, route)),
      ...(artist.gallery.length ? { image: artist.gallery.map((photo) => absoluteUrlFor(`/${photo}`)) } : {}),
      album: artistReleases.map((release) => ({
        "@type": "MusicRecording",
        name: release.title,
        url: absoluteUrlFor(publicPathFor(locale, `catalog/${release.slug}`))
      })),
      ...(artist.links.length ? { sameAs: artist.links.map(({ url }) => url) } : {})
    };
    page(route, "artistProfile", `
      <div class="container"><section class="section artist-profile-hero" aria-labelledby="artist-profile-title">
        <nav aria-label="${escapeHtml(t.common.breadcrumb)}"><ol class="breadcrumb"><li><a href="${hrefFor(locale, route, locale, "")}">${escapeHtml(t.common.nav.home)}</a></li><li><a href="${hrefFor(locale, route, locale, "artists")}">${escapeHtml(t.common.nav.artists)}</a></li><li aria-current="page">${escapeHtml(artist.name)}</li></ol></nav>
        <div class="artist-profile-layout">${visual}<div class="artist-profile-heading"><p class="eyebrow">${escapeHtml(artistProfile.eyebrow)}</p><h1 class="page-title" id="artist-profile-title">${escapeHtml(artist.name)}</h1><p class="lede">${escapeHtml(interpolate(artistProfile.lede, { count: String(artistReleases.length) }))}</p>${artistSocialLinksMarkup({ artist, label: artistProfile.socialsLabel })}</div></div>
      </section></div>
      <section class="section"><div class="container">
        <dl class="artist-facts">
          <div><dt>${escapeHtml(artistProfile.positions)}</dt><dd>${artistReleases.length}</dd></div>
          <div><dt>${escapeHtml(artistProfile.firstPosition)}</dt><dd>${escapeHtml(artistReleases[0]?.id || t.common.tba)}</dd></div>
          <div><dt>${escapeHtml(artistProfile.latestPosition)}</dt><dd>${escapeHtml(latest?.id || t.common.tba)}</dd></div>
          <div><dt>${escapeHtml(artistProfile.collaborators)}</dt><dd>${collaborators.length ? artistCreditMarkup({ artists: collaborators, artistByName, locale, currentRoute: route }) : escapeHtml(artistProfile.solo)}</dd></div>
        </dl>
      </div></section>
      <section class="section"><div class="container"><div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(artistProfile.catalogEyebrow)}</p><h2 class="section-title">${escapeHtml(artistProfile.catalogTitle)}</h2></div><p class="body-copy">${escapeHtml(artistProfile.catalogBody)}</p></div><div class="catalog-grid artist-catalog-grid">${artistReleases.map((release) => releaseCardMarkup({ locale, currentRoute: route, release, t, headingLevel: 3 })).join("")}</div></div></section>`, {
      title: artist.name,
      description: profileDescription,
      pageClass: "page-artist-profile",
      structuredDataExtra: artistData
    });
  }

  const process = t.pages.process;
  page("process", "process", `
    <div class="container">
      <section class="hero" aria-labelledby="process-title">
        ${heroMotionMarkup(locale, "process", "PROCESS")}
        <div><p class="eyebrow">${escapeHtml(process.eyebrow)}</p><h1 class="page-title" id="process-title">${escapeHtml(process.title)}</h1></div>
        <div class="hero-bottom"><p class="lede">${escapeHtml(process.lede)}</p><p class="meta muted">${escapeHtml(process.disclaimer)}</p></div>
      </section>
    </div>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(process.workflowEyebrow)}</p><h2 class="section-title">${escapeHtml(process.workflowTitle)}</h2></div><p class="body-copy">${escapeHtml(process.workflowBody)}</p></div>
      <div class="steps">${process.steps.map(([title, body]) => `<article class="step"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`).join("")}</div>
    </div></section>
    <section class="section"><div class="container grid-2">
      <div class="panel"><p class="eyebrow">${escapeHtml(process.beforeEyebrow)}</p><h2 class="card-title">${escapeHtml(process.beforeTitle)}</h2><ul class="note-list">${listMarkup(process.beforeItems)}</ul></div>
      <div class="panel"><p class="eyebrow">${escapeHtml(process.gateEyebrow)}</p><h2 class="card-title">${escapeHtml(process.gateTitle)}</h2><ul class="note-list">${listMarkup(process.gateItems)}</ul></div>
    </div></section>`, { pageClass: "page-process" });

  const about = t.pages.about;
  page("about", "about", `
    <div class="container"><section class="hero" aria-labelledby="about-title">
      ${heroMotionMarkup(locale, "about", "ORIGIN")}
      <div><p class="eyebrow">${escapeHtml(about.eyebrow)}</p><h1 class="page-title" id="about-title">${escapeHtml(about.title)}</h1></div>
      <div class="hero-bottom"><p class="lede">${escapeHtml(labelCopy.short)}</p><p class="meta muted">${escapeHtml(about.tagline)}</p></div>
    </section></div>
    <section class="section"><div class="container">
      <div class="about-intro"><div><p class="eyebrow">${escapeHtml(about.storyEyebrow)}</p><h2 class="section-title">${escapeHtml(about.storyTitle)}</h2></div><p class="body-copy">${escapeHtml(labelCopy.long)}</p></div>
      <dl class="facts-list"><div><dt>${escapeHtml(about.facts.name)}</dt><dd>${escapeHtml(label.officialName)}</dd></div><div><dt>${escapeHtml(about.facts.founded)}</dt><dd>${label.founded}</dd></div><div><dt>${escapeHtml(about.facts.location)}</dt><dd>${escapeHtml(label.location)}</dd></div><div><dt>${escapeHtml(about.facts.founder)}</dt><dd>${escapeHtml(label.founder)}</dd></div></dl>
    </div></section>
    <section class="section"><div class="container"><div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(about.missionEyebrow)}</p><h2 class="section-title">${escapeHtml(about.missionTitle)}</h2></div><p class="body-copy">${escapeHtml(labelCopy.mission)}</p></div></div></section>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(about.principlesEyebrow)}</p><h2 class="section-title">${escapeHtml(about.principlesTitle)}</h2></div><p class="body-copy">${escapeHtml(about.principlesBody)}</p></div>
      <div class="principles-grid">${labelCopy.principles.map((principle, index) => `<article class="panel"><span class="index-no">${String(index + 1).padStart(2, "0")}</span><h3 class="card-title">${escapeHtml(principle.title)}</h3><p>${escapeHtml(principle.body)}</p></article>`).join("")}</div>
    </div></section>`, { pageClass: "page-about" });

  const press = t.pages.press;
  page("press", "press", `
    <div class="container"><section class="hero" aria-labelledby="press-title">
      ${heroMotionMarkup(locale, "press", "SIGNAL")}
      <div><p class="eyebrow">${escapeHtml(press.eyebrow)}</p><h1 class="page-title" id="press-title">${escapeHtml(press.title)}</h1></div>
      <div class="hero-bottom"><p class="lede">${escapeHtml(press.lede)}</p><p class="meta muted">${escapeHtml(press.version)}</p></div>
    </section></div>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(press.downloadsEyebrow)}</p><h2 class="section-title">${escapeHtml(press.downloadsTitle)}</h2></div><p class="body-copy">${escapeHtml(press.downloadsBody)}</p></div>
      <div class="press-grid">${press.cards.map(([index, title, body], itemIndex) => `<a class="press-card" href="${assetPrefixFor(locale, "press")}${PRESS_ASSETS[itemIndex]}" download><span class="index-no">${escapeHtml(index)}</span><h3 class="card-title">${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></a>`).join("")}</div>
    </div></section>
    <section class="section"><div class="container grid-2">
      <div class="panel"><p class="eyebrow">${escapeHtml(press.namingEyebrow)}</p><h2 class="card-title">${escapeHtml(press.namingTitle)}</h2><p>${escapeHtml(press.namingBody)}</p></div>
      <div class="panel"><p class="eyebrow">${escapeHtml(press.kitsEyebrow)}</p><h2 class="card-title">${escapeHtml(press.kitsTitle)}</h2><p>${escapeHtml(press.kitsBody)}</p></div>
    </div></section>`, { pageClass: "page-press" });

  const contact = t.pages.contact;
  const verifiedContactMarkup = CONTACT_EMAIL
    ? `<div class="panel verified-contact"><p class="eyebrow">${escapeHtml(contact.generalEyebrow)}</p><h2 class="contact-email"><a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a></h2><p>${escapeHtml(contact.verifiedBody)}</p>${SOCIAL_LINKS.length ? `<ul class="contact-socials">${SOCIAL_LINKS.map(({ label: socialLabel, url }) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(socialLabel)} ↗</a></li>`).join("")}</ul>` : ""}</div>`
    : `<div class="empty-state"><p class="eyebrow">${escapeHtml(contact.generalEyebrow)}</p><h2 class="empty-title">${escapeHtml(contact.generalTitle)}</h2><p>${escapeHtml(contact.generalBody)}</p></div>`;
  page("contact", "contact", `
    <div class="container"><section class="hero" aria-labelledby="contact-title">
      ${heroMotionMarkup(locale, "contact", "LINK")}
      <div><p class="eyebrow">${escapeHtml(contact.eyebrow)}</p><h1 class="page-title" id="contact-title">${escapeHtml(contact.title)}</h1></div>
      <div class="hero-bottom"><p class="lede">${escapeHtml(contact.lede)}</p><p class="meta muted">${escapeHtml(contact.status)}</p></div>
    </section></div>
    <section class="section"><div class="container grid-2">
      ${verifiedContactMarkup}
      <div class="panel"><p class="eyebrow">${escapeHtml(contact.beforeEyebrow)}</p><h2 class="card-title">${escapeHtml(contact.beforeTitle)}</h2><ul class="plain-list">${listMarkup(contact.items)}</ul></div>
    </div></section>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(contact.demoEyebrow)}</p><h2 class="section-title">${escapeHtml(contact.demoTitle)}</h2></div><p class="body-copy">${escapeHtml(contact.demoBody)}</p></div>
      <div class="grid-2"><div class="panel"><ul class="note-list">${listMarkup(contact.demoItems)}</ul></div><div class="panel"><p class="eyebrow">${escapeHtml(contact.demoNoteTitle)}</p><p>${escapeHtml(contact.demoNote)}</p></div></div>
    </div></section>
    <section class="section"><div class="container"><p class="body-copy">${escapeHtml(contact.pressBody)}</p><div class="button-row"><a class="button" href="${hrefFor(locale, "contact", locale, "press")}">${escapeHtml(contact.pressCta)}</a></div></div></section>`, { pageClass: "page-contact" });

  const links = t.pages.links;
  const socialAccessMarkup = SOCIAL_LINKS.length
    ? `<nav class="social-access-nav" data-social-access-nav aria-label="${escapeHtml(links.navLabel)}">
        <ol class="social-access-list">
          ${SOCIAL_LINKS.map(({ id, label: service, url }, index) => `<li class="social-access-item">
            <a class="social-access-link" data-social-access-link data-social-id="${escapeHtml(id)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(interpolate(links.serviceAria, { service }))}">
              <span class="social-access-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
              <span class="social-access-service">${escapeHtml(service)}</span>
              <span class="social-access-arrow" aria-hidden="true">↗</span>
            </a>
          </li>`).join("")}
        </ol>
      </nav>`
    : `<div class="social-access-empty" role="status"><h2>${escapeHtml(links.emptyTitle)}</h2><p>${escapeHtml(links.emptyBody)}</p></div>`;

  page("links", "links", `
    <div class="container social-access-container">
      <section class="social-access-terminal" aria-labelledby="social-access-title">
        <div class="social-access-intro">
          <p class="eyebrow">${escapeHtml(links.eyebrow)}</p>
          <h1 class="social-access-title" id="social-access-title">${links.displayTitle.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</h1>
          <p class="social-access-lede">${escapeHtml(links.lede)}</p>
        </div>
        <div class="social-access-panel">
          <p class="social-access-status">${escapeHtml(links.status)}</p>
          ${socialAccessMarkup}
        </div>
        <div class="social-access-field" aria-hidden="true"><span></span><span></span><span></span></div>
      </section>
    </div>`, { pageClass: "page-links" });

  const download = t.pages.download;
  const plugin = download.product;
  const pluginAssetRoot = `${assetPrefixFor(locale, "download")}assets/downloads/euclidean-echo/0.1.1/`;
  const pluginFeedbackHref = CONTACT_EMAIL
    ? mailtoHrefFor(CONTACT_EMAIL, plugin.feedbackSubject)
    : hrefFor(locale, "download", locale, "contact");
  page("download", "download", `
    <div class="container"><section class="hero" aria-labelledby="download-title">
      ${heroMotionMarkup(locale, "download", "PRIME")}
      <div><p class="eyebrow">${escapeHtml(download.eyebrow)}</p><h1 class="page-title" id="download-title">${escapeHtml(download.title)}</h1></div>
      <div class="hero-bottom"><p class="lede">${escapeHtml(download.lede)}</p><p class="meta muted">${escapeHtml(download.status)}</p></div>
    </section></div>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(download.gridEyebrow)}</p><h2 class="section-title">${escapeHtml(download.gridTitle)}</h2></div><p class="body-copy">${escapeHtml(download.gridBody)}</p></div>
      <div class="plugin-grid">
        <article class="plugin-release" data-plugin-product="euclidean-echo">
          <div class="plugin-vault-head"><span class="index-no">${escapeHtml(plugin.index)}</span><span class="plugin-preview-status">${escapeHtml(plugin.status)}</span></div>
          <div class="plugin-release-layout">
            <figure class="plugin-release-figure">
              <img src="${pluginAssetRoot}euclidean-echo-ui.png" width="900" height="560" alt="${escapeHtml(plugin.imageAlt)}" loading="lazy" decoding="async">
            </figure>
            <div class="plugin-release-copy">
              <p class="eyebrow">${escapeHtml(plugin.version)}</p>
              <h3 class="card-title">${escapeHtml(plugin.name)}</h3>
              <p>${escapeHtml(plugin.description)}</p>
              <p class="plugin-formats">${escapeHtml(plugin.formats)}</p>
              <div class="plugin-downloads" aria-label="${escapeHtml(plugin.downloadLabel)}">
                ${plugin.downloads.map(([label, filename]) => `<a class="button" href="${pluginAssetRoot}${escapeHtml(filename)}" download="${escapeHtml(filename)}">${escapeHtml(label)}</a>`).join("")}
              </div>
              <p class="plugin-warning">${escapeHtml(plugin.warning)}</p>
              <p class="plugin-invitation">${escapeHtml(plugin.invitation)}</p>
              <div class="plugin-release-actions">
                <a class="button button-secondary" href="${escapeHtml(pluginFeedbackHref)}">${escapeHtml(plugin.feedbackCta)}</a>
                <a class="plugin-checksum-link" href="${pluginAssetRoot}SHA256SUMS">${escapeHtml(plugin.checksumCta)}</a>
              </div>
            </div>
          </div>
        </article>
        ${download.cards.map(([index, title, body], itemIndex) => `<article class="plugin-vault" data-plugin-locked>
        <div class="plugin-vault-head"><span class="index-no">${escapeHtml(index)}</span><span class="cipher-timer cipher-timer-${itemIndex + 2}" aria-hidden="true"></span></div>
        <div class="plugin-lock" aria-hidden="true"><span></span><span></span><span></span></div>
        <h3 class="card-title">${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>
        <div class="cipher-strip" aria-hidden="true">0x${String(itemIndex + 32).padStart(2, "0")} / ▓▒░ / NULL_ACCESS</div>
      </article>`).join("")}</div>
    </div></section>
    <section class="section" data-sample-pack-vaults><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(download.samplePacks.eyebrow)}</p><h2 class="section-title">${escapeHtml(download.samplePacks.title)}</h2></div><p class="body-copy">${escapeHtml(download.samplePacks.body)}</p></div>
      <div class="plugin-grid">
        ${download.samplePacks.cards.map(([index, author, title, body, kind, resident], itemIndex) => `<article class="plugin-vault sample-pack-vault" data-sample-pack-locked data-sample-pack-kind="${escapeHtml(kind)}" data-resident="${escapeHtml(resident)}">
          <div class="plugin-vault-head"><span class="index-no">${escapeHtml(index)}</span><span class="cipher-timer cipher-timer-${itemIndex + 4}" aria-hidden="true"></span></div>
          <div class="plugin-lock" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="eyebrow">${escapeHtml(author)}</p><h3 class="card-title">${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>
          <div class="cipher-strip" aria-hidden="true">0x${String(itemIndex + 64).padStart(2, "0")} / ▓▒░ / SAMPLE_LOCK</div>
        </article>`).join("")}
      </div>
    </div></section>
    <section class="section"><div class="container"><p class="body-copy">${escapeHtml(download.footer)}</p></div></section>`, { pageClass: "page-download" });

  const notFound = t.pages.notFound;
  page("404", "notFound", `<div class="container"><section class="hero" aria-labelledby="not-found-title"><div><p class="eyebrow">${escapeHtml(notFound.eyebrow)}</p><h1 class="page-title" id="not-found-title">${escapeHtml(notFound.title)}</h1></div><div><p class="lede">${escapeHtml(notFound.body)}</p><div class="button-row"><a class="button" href="${hrefFor(locale, "404", locale, "")}">${escapeHtml(notFound.cta)}</a></div></div></section></div>`, { pageClass: "page-404" });

  return pages;
};

export const createPages = (catalog, audioLibrary, artistLibrary, merchLibrary) => {
  const pages = new Map();
  for (const locale of LOCALES) {
    for (const [relative, html] of createLocalePages(
      locale,
      catalog,
      audioLibrary,
      artistLibrary,
      merchLibrary
    )) pages.set(relative, html);
  }
  return pages;
};
