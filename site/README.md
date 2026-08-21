# Povkh Lab Recordings website

Production-oriented static website for the label. It has no external CDN, tracker, framework or runtime dependency. The build is deterministic and the generated site lives in `dist/`.

## Commands

Run from this directory:

```bash
npm ci
npx playwright install chromium webkit
npm run build
npm run check
npm run qa
npm run serve
npm run audio:stream
npm run visuals
npm run og
```

Playwright and Axe are pinned locally so a clean clone, local machine and CI run the same browser QA. `npm test` builds the site, validates the generated files and then checks every route in Chromium plus the audio and magnetic-line contracts in Chromium and WebKit.

## Content model

`data/catalog.json` is the catalog source of truth. It contains the approved
`PVKH-001`–`PVKH-013` sequence, canonical artist arrays, corrected platform
dates, published/upcoming state as of 2026-07-15 and EN/IT/RU editorial copy.
Copy carrying `editorial.reviewRequired: true` stays behind the public rendering
gate until artist approval; those pages expose verified metadata and a localized
pending-review note instead. TuneCore IDs are stored only as internal distribution
references; the public catalog identifiers are always `PVKH-###`, and the raw
source JSON is not copied into `dist/`. `primaryGenre` contains only the genre
verified on an official platform; interpretive style vocabulary belongs in
`editorialTags` and is rendered separately. Future releases may expose a
`preorderUrl` only from their approved preorder date. The build and QA derive
release status from the ISO `asOf` snapshot instead of hard-coding status
counts.

Published releases contain exactly three verified direct destinations in
`streamingLinks`: Apple Music, Spotify and a verified third service. Release
pages render those destinations plus a fourth local “All services” CTA. That
CTA opens the label-owned `/listen/pvkh-###/` chooser, so the smart-link flow
has no client-side API, redirect service or third-party aggregator dependency.
Upcoming releases keep `streamingLinks: null` until official destinations can
be verified.

`PVKH-011` retains `tuneCoreIdNeedsOwnerVerification: true` because its internal
11-digit TuneCore reference still needs an owner-side check. This flag does not
affect the verified Apple Music metadata or the public `PVKH-011` identity, and
neither the flag nor the internal ID is published.

`data/content-draft.json` preserves the internal editorial basis, suggested
genre vocabulary and review flags used while preparing the catalog. It is an
audit artifact, not a second runtime source, and is also excluded from the
public build.

`data/merch.json` is the source of truth for the coming-soon merch overview,
including its localized copy, object order, categories and roadmap. Object detail
routes remain unpublished until `detailEnabled` is true and approved local
photography plus complete EN/IT/RU copy are available.

The global HUD audio console contains all 13 catalog masters in canonical
PVKH-001 → PVKH-013 order, with PVKH-007 “Opportunist” selected by default.
Canonical project copies live in the root `Tracks/` folder as tagged stereo MP3
files at 320 kbps / 48 kHz. Reproducible 192 kbps public-player copies live in
`Tracks/streaming/`; the 320 kbps masters are not copied into the public build.
Every track has its own precomputed 160-point waveform, so
the browser never decodes a full file merely to draw the graph. Audible
autoplay is attempted, but browsers may require the explicit PLAY control.
Save-Data defers the MP3 request until that explicit action. Native Media
Session metadata and play/pause/seek actions are used when supported.
First visits start at 60% volume; later visits restore the last valid local
preference. The instrument-style `VOL` control opens a horizontal,
keyboard-accessible popup range. The waveform accepts click, drag and touch
seeking, with five-second arrow-key steps, and records a pending restore time
so seeking remains available before the media has loaded.
The track-list dialog allows direct keyboard or pointer selection of any catalog
position. Internal navigation progressively replaces the route while preserving
the single audio element, current time and play state; direct URLs and no-JavaScript
navigation continue to work as ordinary static pages.
Decorative HUD telemetry keeps one invariant English instrument language across
locales; functional player controls, status/error copy and accessibility labels
are localized.

`src/i18n.mjs` is the translation source of truth. English uses the unprefixed
routes, Italian mirrors them below `/it/`, and Russian mirrors them below
`/ru/`. Every language switch keeps the current route; do not introduce
client-side redirects or locale-dependent catalog facts.

Routes:

- `/` — home;
- `/catalog/` and `/catalog/pvkh-001/` through `/catalog/pvkh-013/` — catalog and release details;
- `/listen/pvkh-001/` through `/listen/pvkh-011/` — local service choosers for published releases;
- `/artists/`, five `/artists/{slug}/` files and `/process/` — confirmed catalog roster, derived discographies and working method;
- `/merch/` and eleven `/merch/{slug}/` routes — the DROP 001 concept overview and non-commercial object galleries;
- `/about/`, `/contact/`, `/press/` — label context, verified contact and approved press assets;
- `/links/` — Access Terminal chooser for the label's verified external social channels;
- `/download/` — pre-release classified plugin slots without invented product details.

The same 50 content routes exist below `/it/` and `/ru/`. The build also
generates localized `404.html` pages and locale-specific web manifests, for a
total of 153 HTML pages.

`SOCIAL_LINKS` from `src/config.mjs` is the only runtime authority for the
Access Terminal, contact and footer social destinations. Its approved defaults
are Telegram, TikTok, Instagram and YouTube, in that order. SoundCloud remains
optional until a verified HTTPS URL is supplied. An explicitly blank social
environment value omits that service; production fails closed if no verified
destination remains.

Confirmed local artwork is published for all thirteen releases. The build also
keeps deterministic signal plates generated from the real track waveforms as a
safe fallback if an artwork field is ever unavailable. `data/artists.json` keeps the confirmed five-name roster
and approved artist social links. Its ordered `gallery` arrays drive the touch, pointer and keyboard-accessible
profile carousels; the first gallery item is the roster portrait. Unapproved bios, portraits and links remain null
or empty instead of being invented.

## Launch gates

The default build is a locked preview: `noindex, nofollow`, a reserved `.example`
canonical host and `Disallow: /`. It already uses the final 1200×630 brand
OpenGraph plate. Production mode fails closed until the real domain and public
contact are supplied. Supported build variables:

```text
POVKH_SITE_MODE=preview|production
POVKH_SITE_ORIGIN=https://approved-domain
POVKH_SITE_BASE_PATH=
POVKH_CONTACT_EMAIL=alessandropovkh@icloud.com
POVKH_SOCIAL_TELEGRAM=https://t.me/povkhlab
POVKH_SOCIAL_TIKTOK=https://www.tiktok.com/@povkh_lab_recordings
POVKH_SOCIAL_INSTAGRAM=https://www.instagram.com/povkh_lab/
POVKH_SOCIAL_YOUTUBE=https://www.youtube.com/@POVKH_LAB
POVKH_SOCIAL_SOUNDCLOUD=
POVKH_OG_IMAGE=/assets/og/povkh-lab-og.png
```

The selected Signal Kit preview QR still resolves directly to Telegram and is
not approved for production printing. Only an explicitly approved real HTTPS
origin can authorize regeneration to `<approved-origin>/links/`; `.example`,
preview, temporary deployment and third-party redirect URLs are invalid print
targets. Regeneration, decoding and print approval are a separate release gate.

Before public launch:

1. approve the real production domain and set `POVKH_SITE_ORIGIN` for the build;
2. verify optional SoundCloud and provide it as a build variable if approved; the approved contact email defaults to `alessandropovkh@icloud.com`;
3. replace planned dates, genres, preorder URLs or missing listening links only after platform verification;
4. run a strict `POVKH_SITE_MODE=production` build; it generates indexable meta, `robots.txt` and `sitemap.xml` only after the gates pass;
5. run `npm test` and inspect the multilingual screenshots in `artifacts/qa/`.

The press-page PDF is copied at build time from the canonical root export
`../exports/POVKH-LAB-Brand-Board-v1.0.pdf`; the static QA requires an exact
byte match. Logo SVGs are approved masters. The board still labels its example
release content as sample data, while the website catalog uses the separately
approved production dataset.

Pushes to `main` run preview QA only. Production deployment is a manual workflow
dispatch protected by the GitHub `production` environment and its approved
variables. The local server sets conservative security headers and prevents path
traversal. A production host should provide an equivalent HTTP Content Security
Policy, HSTS and cache policy.
