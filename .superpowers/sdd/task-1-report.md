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
- Encoded SHA-256: `72b419422832991e62085cdde5709d0e6da2cf914e64c3d1344e1d4e2b8c8fe6`
- Decoded RGBA SHA-256: `f26047c69b0cd955452faefe2e91a65083603e92c7afc5d99ed5bcb3715570c2`

Original-resolution review confirmed:

- the ASCII bullet, red rule, and `POVKH_LAB::SIGNAL` line retain the exact master relationship;
- macro views no longer overpower the hero registration;
- on-body/worn views have consistent perceived placement and scale;
- no print escapes the garment masks;
- no rectangular matte remains in either hoodie view;
- garment pixels outside the print layer remain unchanged.

## Files and provenance

The existing apparel renderer regenerated four public WebPs, four governed source-render PNGs, and four applied-artwork masks. Garment-mask rerenders were pixel-identical and therefore produced no Git diff. The registration JSON now includes the contact-sheet record, visible bounds, and hero-relative measurements.

`site/tools/export-merch-assets.mjs` and `site/data/merch-asset-manifest.json` were updated only for the four changed apparel source/output hashes so the repository-wide merch provenance test remains consistent.

## Final verification

Fresh final run:

- `npm run test:merch-registration` — 8/8 passed; includes a full dry rerender and pixel comparison of all four public images, source renders, masks, bounds, homographies, and the contact sheet.
- `npm run test:merch-assets` — 2/2 passed.
- `npm run test:merch-pages` — 2/2 passed.
- `npm run test:merch` — 11/11 passed.
- `git diff --check` on Task 1 source/data/test files — clean.

## Self-review

- Scope: only apparel registration source/tests/data, four public derivative images, governed derivative fixtures/contact sheet, and their four manifest mappings are included.
- Identity: no artwork was generated, retyped, redrawn, or modified; exact masters are validated by encoded and decoded hashes plus visible-alpha bounds.
- Determinism: staged bundle validation now covers 18 artifacts; dry verification independently rerenders and compares the contact sheet and all governed pixels.
- Visual defect prevention: transparent hoodie master pixels are asserted byte-identical to the garment base, preventing recurrence of rectangular texture-return matte.
- Shared worktree safety: unrelated concurrent 3D/catalog changes were left untouched and will not be staged in this commit.
- Remaining concerns: none within Task 1 scope.
