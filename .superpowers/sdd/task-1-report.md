# Task 1 report — apparel registration corrections

Status: DONE

## Outcome

The four derivative apparel photographs now use corrected perspective quads with the original governed 1600 x 600 artwork masters unchanged. The renderer records and verifies decoded master identity, visible master bounds, approved-hero identity, rendered artwork bounds, and hero-relative center/scale. It also publishes and dry-verifies a 1800 x 800 hero/detail/worn contact sheet.

The hoodie compositor no longer creates a rectangular dark matte. Texture return is alpha-clipped and feathered by the applied artwork alpha; fully transparent master pixels inside the quad remain byte-identical to the blank garment base.

No `merch.json`, canonical hero, artwork master, or 3D model file was changed by Task 1.

## Root cause

The previous pipeline used an independently hand-tuned quad for every derivative view, but its scale/center test inverse-projected the same declared quad. That made the test tautological: it proved the homography could map its own corners back to the master, not that the visible artwork stayed registered relative to the approved hero.

A second visual issue came from applying hoodie `textureReturnOpacity` across the full rectangular artwork quad. Transparent master pixels therefore multiplied the garment base by itself, producing a visible dark rectangle.

## TDD evidence

1. Baseline `npm run test:merch-registration`: 7/7 passed, reproducing the gap (no visual-bounds or contact-sheet gate).
2. Added the visual-enforceability test first. RED: `visualQa.reviewMethod` was `undefined`, proving the committed bundle had no measured/contact-sheet contract.
3. Implemented master/hero pixel identity, pixel-derived artwork bounds, hero-relative center/scale, corrected quads, contact-sheet generation, and dry verification. Focused visual test passed.
4. Independent review found a dark rectangular matte in the two hoodie views.
5. Replaced the old transparent-quad modulation expectation with a regression test first. RED: registered clip was `artworkQuad`, not `artworkAlpha`.
6. Alpha-clipped and alpha-feathered texture return, rerendered, and verified that transparent pixels are unchanged. Focused matte regression passed.

## Registration records

| View | Corrected artwork quad | Rendered visible artwork bounds |
| --- | --- | --- |
| t-shirt / print macro | `(380,340) (1156,347) (1152,638) (384,631)` | `416,370 -> 1110,606` |
| t-shirt / on-body | `(598,327) (938,327) (930,455) (604,455)` | `617,340 -> 914,442` |
| hoodie / print macro | `(357,339) (1177,347) (1173,653) (357,645)` | `393,371 -> 1128,619` |
| hoodie / worn rear | `(593,353) (923,370) (916,492) (593,478)` | `607,368 -> 900,476` |

Both exact masters retain their governed encoded SHA-256 values:

- t-shirt dark knockout: `c46bf6bd82ea2ec6928e9fe4ca9a314b56580af49c044be0395579c43c06dada`
- hoodie reverse: `284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f`

Both decode to the locked visible-alpha bounds `70,60 -> 1510,536`. The authoritative hero WebPs are also byte- and pixel-locked without modification.

## Generated visual QA

- Contact sheet: `site/tools/fixtures/apparel-registration/apparel-registration-contact-sheet-v02.png`
- Layout: t-shirt hero / print macro / on-body; hoodie hero / print macro / worn rear
- Encoded SHA-256: `db677701f1ad170c293c64f615eb940b16d2fe3ff40c2be57ff928d86e0d737d`
- Decoded RGBA SHA-256: `47e7a870ed73d450d46ebe2f897349f11061a80032c6b1cefd9d5f779939864a`

Original-resolution review confirmed:

- the ASCII bullet, red rule, and `POVKH_LAB::SIGNAL` line retain the exact master relationship;
- macro views no longer overpower the hero registration;
- on-body/worn views have consistent perceived placement and scale;
- no print escapes the garment masks;
- no rectangular matte remains in either hoodie view;
- final source-render pixels outside the print layer remain byte-identical to each governed blank base (including the intentional hoodie macro v2 repair base).

## Files and provenance

The existing apparel renderer regenerated four public WebPs, four governed source-render PNGs, and four applied-artwork masks. Garment-mask rerenders were pixel-identical and therefore produced no Git diff. The registration JSON now includes the contact-sheet record, visible bounds, and hero-relative measurements.

`site/tools/export-merch-assets.mjs` and `site/data/merch-asset-manifest.json` were updated only for the four changed apparel source/output hashes so the repository-wide merch provenance test remains consistent.

## Final verification

Fresh final run:

- `npm run test:merch-registration` — 9/9 passed; includes a full dry rerender and pixel comparison of all four public images, source renders, masks, bounds, homographies, and the contact sheet.
- `npm run test:merch-assets` — 2/2 passed.
- `npm run test:merch-pages` — 2/2 passed.
- `npm run test:merch` — 11/11 passed.
- `git diff --check` on Task 1 source/data/test files — clean.

## Self-review

- Scope: only apparel registration source/tests/data, four public derivative images, governed derivative fixtures/contact sheet, and their four manifest mappings are included.
- Identity: no artwork was generated, retyped, redrawn, or modified; exact masters are validated by encoded and decoded hashes plus visible-alpha bounds.
- Determinism: staged bundle validation now covers 19 artifacts; dry verification independently rerenders and compares the repaired base, contact sheet and all governed pixels.
- Visual defect prevention: transparent hoodie master pixels are asserted byte-identical to the garment base, preventing recurrence of rectangular texture-return matte.
- Shared worktree safety: unrelated concurrent 3D/catalog changes were left untouched and will not be staged in this commit.
- Remaining concerns: none within Task 1 scope.

## Review-fix evidence — baked hoodie macro matte

The first review conclusion above was incomplete: alpha-clipping removed compositor spill, but the accepted v1 hoodie macro blank itself still contained a baked high-frequency rectangular panel. The primary production `PVKH_VOID_BACKMARK_HOODIE_STANDARD_BG_BLANK_v10.png` and related clean sources were inspected at original resolution; they are authoritative flat-back photographs with a different camera and could not replace the macro without changing garment geometry.

The renderer now deterministically creates `PVKH_VOID_BACKMARK_HOODIE_PRINT_FIBER_MACRO_BLANK_BASE_v02.png` from the governed v1 macro source. A 28 px low-frequency field preserves the original lighting, folds, and garment geometry. Only the contaminated fabric detail is replaced from clean pixels in the same photograph, with a smooth feather over `735,430 -> 1415,870`; 261,343 pixels change inside that region and zero pixels change outside it. The repaired base is locked at SHA-256 `d0e01e873ebd68673f25407efa08f8c6325ee088e2ad9ccae49f811f607bc905`.

The registration test now measures each applied-artwork mask directly. It locks both the visible bounds and alpha-weighted pixel centroid, then derives hero-relative center/scale from those measurements and the master artwork's measured visible bounds/centroid. It no longer derives visual registration from `artworkQuad`.

The base-preservation regression now covers all four corrected views. For every mask-zero pixel in each 1536 x 1024 view, source-render RGB must equal blank-base RGB byte-for-byte. Fresh audit counts are 1,550,397 (tee macro), 1,568,491 (tee on-body), 1,547,777 (hoodie macro), and 1,568,801 (hoodie worn), all with zero changed pixels.

Fresh regenerated evidence:

- Hoodie macro public WebP SHA-256: `63c3a21c90ed11286e1e34e561858038d079236aa445204fc2328277a0cea89a`.
- Hoodie macro governed source-render SHA-256: `bd5fe42f0ff3e1cd7f5bcd9e2da3eb97b2b3fc550a69c61626f73517309ab504`.
- Contact-sheet SHA-256: `db677701f1ad170c293c64f615eb940b16d2fe3ff40c2be57ff928d86e0d737d` (decoded RGBA `47e7a870ed73d450d46ebe2f897349f11061a80032c6b1cefd9d5f779939864a`).
- Original-resolution inspection of the repaired blank, public WebP, and 1800 x 800 contact sheet confirms the dark panel is gone and the garment silhouette, folds, hood, shoulder, and right-side seam remain intact.

Fresh test evidence:

- `npm run test:merch-registration` — all seven primary registration/compositor tests passed through full four-view dry rerender; the two long-running stale-hash/rollback cases also passed independently (9/9 total).
- `npm run test:merch-assets` — 2/2 passed.
- `npm run test:merch-pages` — 2/2 passed.
- `npm run test:merch` — 11/11 passed.

No 3D model, viewer catalog, or `merch.json` file is part of this fix.

## Review-fix evidence — hero coordinate authority and repair exception

The approved hero placements `(528,350,480,180)` and `(552,365,432,162)` are coordinates in the decoded 1536×1024 hero assets. The former 1600×900 `canvas` field was stale and caused hero-relative normalization to mix coordinate systems. It has been removed; each hero now declares `placementCoordinateSpace: "assetPixels"`, and the renderer/test divide placements only by `assetDimensions`.

Corrected mask-derived hero-relative targets are:

| View | Center offset | Visible scale |
| --- | --- | --- |
| t-shirt / print macro | `(-0.014009, 0.054933)` | `(1.606481, 1.652661)` |
| t-shirt / on-body | `(0.006362, -0.050781)` | `(0.687500, 0.714286)` |
| hoodie / print macro | `(-0.019515, 0.058062)` | `(1.890432, 1.929661)` |
| hoodie / worn rear | `(-0.002683, -0.026021)` | `(0.753601, 0.840336)` |

The v1→v2 hoodie macro operation is explicitly an intentional, tightly bounded blank-base retouch—not a claim that the original photo stayed unchanged outside the final artwork. Exactly 261,343 v1 pixels change inside repair bounds `735,430 → 1415,870`; 255,186 of those changes are outside the final applied-artwork mask, while zero changes occur outside the declared repair bounds. Final v2→source-render preservation remains separate and requires byte identity for every mask-zero pixel.

The approved design spec now permits this one exception only. Registration validation and direct tests reject `baseRepair` on the other three views and require the sole repair identity to be `hoodie/print-macro`.
