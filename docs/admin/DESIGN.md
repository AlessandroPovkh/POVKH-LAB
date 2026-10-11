# Release administration

The user selected the proposed free Decap CMS editor and automated static publication. This implementation retains the existing site, JSON catalog and completed release/player changes. It does not replace the frontend.

## Editing

/admin/ opens Decap, localized in Russian, with a GitHub backend for AlessandroPovkh/POVKH-LAB. The existing catalog is one file collection containing release entries. The owner edits title, canonical artists, date, cover, platform links and optional localized descriptions. Catalog IDs and track counts are generated and checked. Existing release order and removal are disabled. The featured release is independently selectable. A compact desktop preview shows title, artists, artwork, date and status. Mobile uses the full width for the editing form; the split preview is hidden below 800px.

New singles get factual metadata in all three locales; no genre or service URL is invented. Missing private distribution IDs remain null. Existing detailed metadata is preserved through save/reload. Image input accepts JPG/PNG/WebP and is resized to a bounded image at build time, preserving the uploaded original. The catalog as-of date remains explicit; advancing it requires completed metadata for releases that have become published.

## Persistence and publication

Production uses Decap GitHub editorial workflow: save a draft, review, then publish. Failed CI leaves the previously published static files intact. An opt-in Timeweb workflow builds/checks before uploading a versioned static artifact. Hosting credentials live in GitHub environment secrets, never in the repository or browser.

The development editor runs only on loopback and writes to a separate local sandbox through an explicit local backend. It never impersonates successful GitHub authentication or makes remote writes. Browser tests save/reload an edited catalog and verify that the generated site changes.

## Remaining hosting input

User initially selected Timeweb Cloud/VPS, then described annual hosting for two servers/sites. The exact product remains unconfirmed; no domain purchased yet. Do not assume a VPS. The editor is independent of this choice. OAuth and deployment templates remain disconnected until the real origin and hosting capabilities are established.

## Acceptance

Existing 16 releases and 24 player tracks survive. Add/edit a release and cover, save/reload, select a premiere, reject invalid input, run build/check. Inspect real editor and preview screenshots. Test OAuth flow with synthetic credentials where a runnable backend is available. No live publication, actual GitHub mutation or hosting operations in this local package.

## Implementation reconciliation

The opt-in deployment and OAuth templates target Linux SSH with Node.js 22+, conditional on the unconfirmed hosting product. No claim of shared-hosting compatibility or a live connection is made. A PHP OAuth adapter remains a hosting-specific follow-up if Node processes are unavailable. Catalog regression tests use an October fixture so future ordinary edits do not fail historical assertions. Local saves deliberately remain in a sandbox, with a visible notice. The initial legacy null format and mobile overflow discoveries were repaired and verified. Independent review findings about pre-save validation parity and stale catalog counts were fixed with focused regression tests.
