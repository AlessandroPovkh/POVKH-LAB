# Povkh Lab Recordings website

Production-oriented static website for the label. It has no external CDN, tracker, framework or runtime dependency. The build is deterministic and the generated site lives in `dist/`.

## Commands

Run from this directory:

```bash
npm run build
npm run check
npm run qa
npm run serve
```

`qa` reuses the pinned Playwright and Axe dependencies from `../tools/`; no second browser dependency tree is required.

## Content model

`data/catalog.json` is the catalog source of truth. It contains the approved
`PVKH-001`–`PVKH-013` sequence, canonical artist arrays, corrected platform
dates, published/upcoming state as of 2026-07-15 and complete EN/IT/RU
editorial copy. TuneCore IDs are stored only as internal distribution
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

`src/i18n.mjs` is the translation source of truth. English uses the unprefixed
routes, Italian mirrors them below `/it/`, and Russian mirrors them below
`/ru/`. Every language switch keeps the current route; do not introduce
client-side redirects or locale-dependent catalog facts.

Routes:

- `/` — home;
- `/catalog/` and `/catalog/pvkh-001/` through `/catalog/pvkh-013/` — catalog and release details;
- `/listen/pvkh-001/` through `/listen/pvkh-011/` — local service choosers for published releases;
- `/artists/` and `/process/` — confirmed catalog roster and working method;
- `/about/`, `/contact/`, `/press/` — label context, verified-contact placeholder and approved press assets.

The same 31 content routes exist below `/it/` and `/ru/`. The build also
generates localized `404.html` pages and locale-specific web manifests, for a
total of 96 HTML pages.

## Launch gates

The generated pages intentionally use `noindex, nofollow`, a `.example` canonical host and a placeholder OpenGraph image. Before public launch:

1. approve the real production domain and replace `povkh-lab.example`;
2. approve a 1200×630 raster OpenGraph image;
3. verify the official email and social channels, then add them to Contact;
4. replace planned dates, genres, preorder URLs or missing listening links only after platform verification;
5. change `robots.txt` and the robots meta tag only after all placeholders are cleared;
6. run `npm test` and inspect the multilingual screenshots in `artifacts/qa/`.

The press-page PDF is copied at build time from the canonical root export
`../exports/POVKH-LAB-Brand-Board-v1.0.pdf`; the static QA requires an exact
byte match. Logo SVGs are approved masters. The board still labels its example
release content as sample data, while the website catalog uses the separately
approved production dataset.

The local server sets conservative security headers and prevents path traversal. A production host should provide an equivalent HTTP Content Security Policy, HSTS and cache policy.
