import { createHash } from "node:crypto";
import { COPY, DEFAULT_LOCALE, LOCALES, LOCALE_META } from "./i18n.mjs";

const SITE_ORIGIN = "https://povkh-lab.example";

const NAV_ITEMS = [
  ["home", ""],
  ["catalog", "catalog"],
  ["artists", "artists"],
  ["process", "process"],
  ["about", "about"],
  ["press", "press"],
  ["download", "download"],
  ["contact", "contact"]
];

const PRESS_ASSETS = [
  "downloads/POVKH-LAB-Brand-Board-v1.0.pdf",
  "assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg",
  "assets/logo/povkh-lab-horizontal-dark-outlined.svg",
  "assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg"
];

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

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

const rootPrefixFor = (localized) => {
  const depth = localized.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
};

const assetPrefixFor = (locale, route) => route === "404" ? "/" : rootPrefixFor(localizedRoute(locale, route));

const manifestHrefFor = (locale, route) => {
  const manifestPath = `${LOCALE_META[locale].prefix ? `${LOCALE_META[locale].prefix}/` : ""}site.webmanifest`;
  return route === "404" ? `/${manifestPath}` : `${rootPrefixFor(localizedRoute(locale, route))}${manifestPath}`;
};

const hrefFor = (locale, currentRoute, targetLocale, targetRoute) => {
  const targetPath = publicPathFor(targetLocale, targetRoute);
  if (currentRoute === "404") return targetPath;
  return `${rootPrefixFor(localizedRoute(locale, currentRoute))}${targetPath.slice(1)}`;
};

const activeFor = (route) => {
  if (route === "") return "home";
  const section = route.split("/")[0];
  return section === "listen" ? "catalog" : section;
};

const navMarkup = (locale, route, mobile = false) => {
  const t = COPY[locale].common;
  const active = activeFor(route);
  const list = NAV_ITEMS.map(([key, targetRoute]) => {
    const current = key === active ? ' aria-current="page"' : "";
    return `<li><a class="nav-link" href="${hrefFor(locale, route, locale, targetRoute)}"${current}>${escapeHtml(t.nav[key])}</a></li>`;
  }).join("");

  if (mobile) {
    return `<details class="mobile-nav">
      <summary class="menu-summary">${escapeHtml(t.menu)}</summary>
      <nav aria-label="${escapeHtml(t.mobilePrimaryNav)}"><ul class="nav-list">${list}</ul></nav>
    </details>`;
  }

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

const shell = ({ locale, route, title, description, body, pageClass = "", ogType = "website", structuredDataExtra = null }) => {
  const meta = LOCALE_META[locale];
  const t = COPY[locale].common;
  const prefix = assetPrefixFor(locale, route);
  const canonical = `${SITE_ORIGIN}${publicPathFor(locale, route)}`;
  const fullTitle = title === "POVKH LAB" ? title : `${title} — POVKH LAB`;
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#label`,
    name: "Povkh Lab Recordings",
    alternateName: "POVKH LAB",
    foundingDate: "2025",
    founder: { "@type": "Person", name: "Aleksandr Babenko (Povkh)" },
    location: { "@type": "Place", name: "Brescia (BS), Italia" },
    url: `${SITE_ORIGIN}/`
  };
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": structuredDataExtra ? [organization, structuredDataExtra] : [organization]
  });
  const structuredDataHash = createHash("sha256").update(structuredData).digest("base64");
  const alternates = [
    ...LOCALES.map((targetLocale) => `<link rel="alternate" hreflang="${LOCALE_META[targetLocale].lang}" href="${SITE_ORIGIN}${publicPathFor(targetLocale, route)}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${publicPathFor(DEFAULT_LOCALE, route)}">`
  ].join("\n  ");
  const ogAlternates = LOCALES
    .filter((targetLocale) => targetLocale !== locale)
    .map((targetLocale) => `<meta property="og:locale:alternate" content="${LOCALE_META[targetLocale].ogLocale}">`)
    .join("\n  ");

  return `<!doctype html>
<html lang="${meta.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080808">
  <meta name="color-scheme" content="dark">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'sha256-${structuredDataHash}'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <!-- Replace the .example canonical host only after the production domain is approved. -->
  <link rel="canonical" href="${canonical}">
  ${alternates}
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="POVKH LAB">
  <meta property="og:locale" content="${meta.ogLocale}">
  ${ogAlternates}
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/og/povkh-lab-og-placeholder.png">
  <meta property="og:image:width" content="2000">
  <meta property="og:image:height" content="2000">
  <meta property="og:image:alt" content="${escapeHtml(t.ogAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${prefix}assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg" type="image/svg+xml">
  <link rel="manifest" href="${manifestHrefFor(locale, route)}">
  <link rel="preload" href="${prefix}assets/fonts/BarlowCondensed-ExtraBold.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="${prefix}assets/fonts/Inter-Variable.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="stylesheet" href="${prefix}assets/styles.css">
  <script type="application/ld+json">${structuredData}</script>
  <script src="${prefix}assets/site.js" defer></script>
</head>
<body class="${pageClass}" data-site-status="prelaunch" data-locale="${locale}">
  <a class="skip-link" href="#main-content">${escapeHtml(t.skip)}</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand-link" href="${hrefFor(locale, route, locale, "")}" aria-label="${escapeHtml(t.brandHome)}">
        <img src="${prefix}assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg" width="1600" height="400" alt="POVKH LAB">
      </a>
      ${navMarkup(locale, route)}
      ${navMarkup(locale, route, true)}
      ${languageMarkup(locale, route)}
    </div>
  </header>
  <main id="main-content" tabindex="-1">
    <div class="site-ambient" aria-hidden="true">
      <video class="site-ambient-video" autoplay muted loop playsinline preload="metadata" tabindex="-1">
        <source src="${prefix}assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.webm" type="video/webm">
        <source src="${prefix}assets/motion/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.mp4" type="video/mp4">
      </video>
    </div>
    ${body}
  </main>
  <footer class="site-footer">
    <div class="container footer-grid">
      <img class="footer-mark" src="${prefix}assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg" width="1000" height="1000" alt="">
      <nav aria-label="${escapeHtml(t.footerNav)}"><ul class="footer-links">
        <li><a href="${hrefFor(locale, route, locale, "catalog")}">${escapeHtml(t.nav.catalog)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "process")}">${escapeHtml(t.nav.process)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "press")}">${escapeHtml(t.nav.press)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "download")}">${escapeHtml(t.nav.download)}</a></li>
        <li><a href="${hrefFor(locale, route, locale, "contact")}">${escapeHtml(t.nav.contact)}</a></li>
      </ul></nav>
      <p class="footer-meta">POVKH LAB<br>${escapeHtml(t.footer.tagline)}<br>${escapeHtml(t.footer.version)}</p>
    </div>
  </footer>
</body>
</html>
`;
};

const listMarkup = (items) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

const heroMotionMarkup = (locale, route, name) => `<video class="hero-motion" autoplay muted loop playsinline preload="metadata" aria-hidden="true" tabindex="-1">
  <source src="${assetPrefixFor(locale, route)}assets/motion/PVKH_MOTION_BLOB_${name}_1920x1080_v1.webm" type="video/webm">
  <source src="${assetPrefixFor(locale, route)}assets/motion/PVKH_MOTION_BLOB_${name}_1920x1080_v1.mp4" type="video/mp4">
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

const releaseCardMarkup = ({ locale, currentRoute, release, t, filterable = false, headingLevel = 2 }) => {
  const route = `catalog/${release.slug}`;
  const headingTag = headingLevel === 3 ? "h3" : "h2";
  const filterAttributes = filterable
    ? ` data-release-card data-release-status="${release.status}"`
    : ` data-release-status="${release.status}"`;
  const accessibleName = `${t.common.openRelease}: ${release.id}, ${release.title}, ${release.artistCredit}`;
  return `<a class="release-card"${filterAttributes} href="${hrefFor(locale, currentRoute, locale, route)}" aria-label="${escapeHtml(accessibleName)}">
    <span class="status">${escapeHtml(t.common.status[release.status])}</span>
    <span class="release-card-code">${escapeHtml(release.id)}</span>
    <div class="release-card-main">
      <${headingTag} class="release-card-title">${escapeHtml(release.title)}</${headingTag}>
      <span class="meta">${escapeHtml(release.artistCredit)}</span>
    </div>
    <time class="meta" datetime="${release.releaseDate}">${escapeHtml(formatDate(release.releaseDate, locale))}</time>
  </a>`;
};

const createLocalePages = (locale, catalog) => {
  const t = COPY[locale];
  const releases = catalog.releases;
  const label = catalog.label;
  const labelCopy = label.content[locale];
  const published = releases.filter((release) => release.status === "published");
  const upcoming = releases.filter((release) => release.status === "upcoming");
  const featured = [...upcoming].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0]
    || [...published].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
  const pages = new Map();
  const page = (route, key, body, options = {}) => {
    const copy = t.pages[key];
    pages.set(outputPathFor(locale, route), shell({
      locale,
      route,
      title: copy.title,
      description: copy.description,
      body,
      ...options
    }));
  };

  const home = t.pages.home;
  page("", "home", `
    <div class="container">
      <section class="hero" aria-labelledby="home-title">
        ${heroMotionMarkup(locale, "", "SOUND")}
        <div>
          <p class="eyebrow">${escapeHtml(home.eyebrow)}</p>
          <h1 class="hero-title" id="home-title">${home.heroTitle.map(escapeHtml).join("<br>")}</h1>
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
    const previous = releases[releaseIndex - 1] || null;
    const next = releases[releaseIndex + 1] || null;
    const recordingData = {
      "@type": "MusicRecording",
      "@id": `${SITE_ORIGIN}${publicPathFor(locale, route)}#recording`,
      name: release.title,
      byArtist: release.artists.map((artist) => ({ "@type": "Person", name: artist })),
      datePublished: release.releaseDate,
      genre: release.primaryGenre || undefined,
      duration: durationToIso(release.tracks[0].duration),
      url: `${SITE_ORIGIN}${publicPathFor(locale, route)}`,
      sameAs: release.streamingLinks
        ? release.streamingLinks
          .filter(({ service }) => service !== "allServices")
          .map(({ url }) => url)
        : undefined,
      recordLabel: { "@id": `${SITE_ORIGIN}/#label` }
    };
    page(route, "release", `
      <div class="container">
        <section class="section release-hero" aria-labelledby="release-title" data-release-id="${release.id}" data-release-status="${release.status}">
          <nav aria-label="${escapeHtml(t.common.breadcrumb)}"><ol class="breadcrumb"><li><a href="${hrefFor(locale, route, locale, "")}">${escapeHtml(t.common.nav.home)}</a></li><li><a href="${hrefFor(locale, route, locale, "catalog")}">${escapeHtml(t.common.nav.catalog)}</a></li><li aria-current="page">${escapeHtml(release.id)}</li></ol></nav>
          <div class="release-heading">
            <span class="status">${escapeHtml(t.common.status[release.status])}</span>
            <p class="eyebrow">${escapeHtml(releaseCopy.position)} / ${escapeHtml(release.id.slice(-3))}</p>
            <h1 class="release-code" id="release-title" aria-label="${escapeHtml(`${release.id} — ${release.title}`)}">${escapeHtml(release.id)}</h1>
            <p class="release-display-title">${escapeHtml(release.title)}</p>
            <p class="release-artist">${escapeHtml(release.artistCredit)}</p>
          </div>
        </section>
      </div>
      <section class="section">
        <div class="container release-grid">
          <div>
            <p class="eyebrow">${escapeHtml(releaseCopy.statementEyebrow)}</p>
            <h2 class="section-title">${escapeHtml(releaseCopy.statementTitle)}</h2>
            <p class="release-statement">${escapeHtml(localized.short)}</p>
            ${release.streamingLinks
              ? streamingLinksMarkup({ release, releaseCopy, locale, currentRoute: route, includeAllServices: true })
              : release.preorderUrl
                ? `<div class="button-row"><a class="button" data-release-cta="preorder" href="${escapeHtml(release.preorderUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(releaseCopy.preorderCta)}<span aria-hidden="true"> ↗</span></a></div>`
                : `<p class="upcoming-note">${escapeHtml(releaseCopy.upcomingBody)}</p>`}
          </div>
          <dl class="data-list">
            <div><dt>${escapeHtml(releaseCopy.fields.status)}</dt><dd>${escapeHtml(t.common.status[release.status])}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.artist)}</dt><dd>${escapeHtml(release.artistCredit)}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.date)}</dt><dd><time datetime="${release.releaseDate}">${escapeHtml(formatDate(release.releaseDate, locale))}</time></dd></div>
            ${release.preorderDate ? `<div><dt>${escapeHtml(releaseCopy.fields.preorder)}</dt><dd><time datetime="${release.preorderDate}">${escapeHtml(formatDate(release.preorderDate, locale))}</time></dd></div>` : ""}
            <div><dt>${escapeHtml(releaseCopy.fields.format)}</dt><dd>${escapeHtml(t.common.digital)}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.tracks)}</dt><dd>${release.trackCount}</dd></div>
            <div><dt>${escapeHtml(releaseCopy.fields.primaryGenre)}</dt><dd data-release-primary-genre data-verified="${release.primaryGenre ? "true" : "false"}">${escapeHtml(release.primaryGenre || t.common.platformGenrePending)}</dd></div>
            ${release.editorialTags.length ? `<div><dt>${escapeHtml(releaseCopy.fields.editorialTags)}</dt><dd data-release-editorial-tags>${escapeHtml(release.editorialTags.join(" / "))}</dd></div>` : ""}
            <div><dt>${escapeHtml(releaseCopy.fields.duration)}</dt><dd>${escapeHtml(release.tracks[0].duration || t.common.tba)}</dd></div>
          </dl>
        </div>
      </section>
      <section class="section">
        <div class="container editorial-grid">
          <article class="editorial-block editorial-story"><p class="eyebrow">${escapeHtml(releaseCopy.storyEyebrow)}</p><h2 class="card-title">${escapeHtml(releaseCopy.storyTitle)}</h2><p>${escapeHtml(localized.story)}</p></article>
          <article class="editorial-block"><p class="eyebrow">${escapeHtml(releaseCopy.moodEyebrow)}</p><h2 class="card-title">${escapeHtml(releaseCopy.moodTitle)}</h2><p>${escapeHtml(localized.mood)}</p></article>
          <article class="editorial-block"><p class="eyebrow">${escapeHtml(releaseCopy.audienceEyebrow)}</p><h2 class="card-title">${escapeHtml(releaseCopy.audienceTitle)}</h2><p>${escapeHtml(localized.audience)}</p></article>
        </div>
      </section>
      <section class="section">
        <div class="container grid-2">
          <div class="panel"><p class="eyebrow">${escapeHtml(releaseCopy.tracklist)}</p><ol class="track-list">${release.tracks.map((track) => `<li><span class="track-position">${String(track.position).padStart(2, "0")}</span><span>${escapeHtml(track.title)}</span><span class="meta">${escapeHtml(track.duration || t.common.tba)}</span></li>`).join("")}</ol></div>
          <div class="panel"><p class="eyebrow">${escapeHtml(releaseCopy.credits)}</p><h2 class="card-title">${escapeHtml(release.artistCredit)}</h2><p>${escapeHtml(releaseCopy.cataloguedBy)} ${escapeHtml(label.officialName)}.</p></div>
        </div>
      </section>
      <nav class="catalog-pager container" aria-label="${escapeHtml(releaseCopy.catalogNavigation)}">
        ${previous ? `<a class="pager-link" href="${hrefFor(locale, route, locale, `catalog/${previous.slug}`)}"><span class="meta">${escapeHtml(releaseCopy.previous)}</span><strong>${escapeHtml(previous.id)} / ${escapeHtml(previous.title)}</strong></a>` : "<span></span>"}
        ${next ? `<a class="pager-link pager-next" href="${hrefFor(locale, route, locale, `catalog/${next.slug}`)}"><span class="meta">${escapeHtml(releaseCopy.next)}</span><strong>${escapeHtml(next.id)} / ${escapeHtml(next.title)}</strong></a>` : `<a class="pager-link pager-next" href="${hrefFor(locale, route, locale, "catalog")}"><span class="meta">${escapeHtml(releaseCopy.back)}</span><strong>${escapeHtml(t.common.nav.catalog)}</strong></a>`}
      </nav>`, {
        title: `${release.id} — ${release.title}`,
        description: conciseMetaDescription(localized.short),
        ogType: "music.song",
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
                <p class="smartlink-release">${escapeHtml(release.title)}</p>
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
      <div class="artist-grid">${[...artistIndex.entries()].map(([artist, artistReleases], index) => `<article class="panel artist-card"><span class="index-no">${String(index + 1).padStart(2, "0")}</span><h3 class="card-title">${escapeHtml(artist)}</h3><p class="meta">${escapeHtml(artists.positionsLabel)}: ${artistReleases.length}</p><ul class="artist-release-list">${artistReleases.map((release) => `<li><a href="${hrefFor(locale, "artists", locale, `catalog/${release.slug}`)}"><span>${escapeHtml(release.id)}</span><span>${escapeHtml(release.title)}</span></a></li>`).join("")}</ul></article>`).join("")}</div>
    </div></section>`, { pageClass: "page-artists" });

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
  page("contact", "contact", `
    <div class="container"><section class="hero" aria-labelledby="contact-title">
      ${heroMotionMarkup(locale, "contact", "LINK")}
      <div><p class="eyebrow">${escapeHtml(contact.eyebrow)}</p><h1 class="page-title" id="contact-title">${escapeHtml(contact.title)}</h1></div>
      <div class="hero-bottom"><p class="lede">${escapeHtml(contact.lede)}</p><p class="meta muted">${escapeHtml(contact.status)}</p></div>
    </section></div>
    <section class="section"><div class="container grid-2">
      <div class="empty-state"><p class="eyebrow">${escapeHtml(contact.generalEyebrow)}</p><h2 class="empty-title">${escapeHtml(contact.generalTitle)}</h2><p>${escapeHtml(contact.generalBody)}</p></div>
      <div class="panel"><p class="eyebrow">${escapeHtml(contact.beforeEyebrow)}</p><h2 class="card-title">${escapeHtml(contact.beforeTitle)}</h2><ul class="plain-list">${listMarkup(contact.items)}</ul></div>
    </div></section>
    <section class="section"><div class="container"><p class="body-copy">${escapeHtml(contact.pressBody)}</p><div class="button-row"><a class="button" href="${hrefFor(locale, "contact", locale, "press")}">${escapeHtml(contact.pressCta)}</a></div></div></section>`, { pageClass: "page-contact" });

  const download = t.pages.download;
  page("download", "download", `
    <div class="container"><section class="hero" aria-labelledby="download-title">
      ${heroMotionMarkup(locale, "download", "PRIME")}
      <div><p class="eyebrow">${escapeHtml(download.eyebrow)}</p><h1 class="page-title" id="download-title">${escapeHtml(download.title)}</h1></div>
      <div class="hero-bottom"><p class="lede">${escapeHtml(download.lede)}</p><p class="meta muted">${escapeHtml(download.status)}</p></div>
    </section></div>
    <section class="section"><div class="container">
      <div class="section-head section-rule"><div><p class="eyebrow">${escapeHtml(download.gridEyebrow)}</p><h2 class="section-title">${escapeHtml(download.gridTitle)}</h2></div><p class="body-copy">${escapeHtml(download.gridBody)}</p></div>
      <div class="plugin-grid">${download.cards.map(([index, title, body], itemIndex) => `<article class="plugin-vault">
        <div class="plugin-vault-head"><span class="index-no">${escapeHtml(index)}</span><span class="cipher-timer cipher-timer-${itemIndex + 1}" aria-hidden="true"></span></div>
        <div class="plugin-lock" aria-hidden="true"><span></span><span></span><span></span></div>
        <h3 class="card-title">${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>
        <div class="cipher-strip" aria-hidden="true">0x${String(itemIndex + 31).padStart(2, "0")} / ▓▒░ / NULL_ACCESS</div>
      </article>`).join("")}</div>
    </div></section>
    <section class="section"><div class="container"><p class="body-copy">${escapeHtml(download.footer)}</p></div></section>`, { pageClass: "page-download" });

  const notFound = t.pages.notFound;
  page("404", "notFound", `<div class="container"><section class="hero" aria-labelledby="not-found-title"><div><p class="eyebrow">${escapeHtml(notFound.eyebrow)}</p><h1 class="page-title" id="not-found-title">${escapeHtml(notFound.title)}</h1></div><div><p class="lede">${escapeHtml(notFound.body)}</p><div class="button-row"><a class="button" href="${hrefFor(locale, "404", locale, "")}">${escapeHtml(notFound.cta)}</a></div></div></section></div>`);

  return pages;
};

export const createPages = (catalog) => {
  const pages = new Map();
  for (const locale of LOCALES) {
    for (const [relative, html] of createLocalePages(locale, catalog)) pages.set(relative, html);
  }
  return pages;
};
