# Task 2 report — local apparel concept GLBs

Status: DONE

## Outcome

The t-shirt, hoodie and cap now have local, poster-first GLB viewers instead of blocked synthetic-spin placeholders. Each model is explicitly governed as a concept visualization, not a manufacturing reference, and carries the same six negative production claims in its source record, scene extras and build report.

The models use meaningful grounded volume rather than flat cards:

- t-shirt: rounded tapered torso, curved multi-ring short sleeves, dimensional collar and a conformed front-art surface;
- hoodie: rounded torso, curved multi-ring long sleeves, wrapped rib hem/cuffs, a dense dimensional hood/opening with rear centre seam and a conformed rear-art surface;
- cap: six-panel low-profile crown, thin curved/tessellated brim, plausible top button, rear opening/strap and a crown-conforming bone patch.

All exact artwork textures are embedded from governed local PNGs without crop, redraw or resampling. Their transparent pixels are preserved and the materials use glTF `BLEND`, preventing the former opaque rectangular texture cards.

## Governed identity inputs

| Model | Exact input | SHA-256 | Registration surface |
| --- | --- | --- | --- |
| t-shirt | `PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png` | `c46bf6bd82ea2ec6928e9fe4ca9a314b56580af49c044be0395579c43c06dada` | 300 x 112.5 mm front concept surface |
| hoodie | `PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png` | `284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f` | 300 x 112.5 mm rear concept surface |
| cap | `PVKH_COMPACT_DARK_KNOCKOUT_EXACT_1000x1000_v01.png` | `a42fca876265d2c1b1a9c1e169e24cd80da2c626ed1ff8e4632d1893afcac782` | 20 x 20 mm mark on a 55 x 28 mm concept patch |

The extraction tool verifies the exact encoded hashes, resolution, channels and alpha before copying. The apparel authority is pinned by SHA `75a20bc9682937274d4fedc6c11a090b646561bd8961082fa9fdf843030ad935`; the cap FIELD ISSUE provenance is pinned by SHA `19fc96d537894d187e9273271b6e3681edc965a673420c2058cc1edf601acc12`.

## Artifact evidence

| Model | GLB SHA-256 | Bytes | Triangles | Draw calls | Reopened bounds mm |
| --- | --- | ---: | ---: | ---: | --- |
| t-shirt | `3b63d05f4ac17e4fbff244b0f4a2a4e4103f60461ada77414089e1b1e497ba82` | 258,272 | 1,976 | 5 | 1068.649 x 1040 x 111.5 |
| hoodie | `fff29a338a7ab526011853aa5f11f9ea6531be08f83c14c037bdc0b761292092` | 364,448 | 3,274 | 10 | 1184.386 x 1350 x 262.5 |
| cap | `c2dbbf0fe7ddf1611f40004beb2ed4d4d002cf920e7f6eff44c9fc98fe58c4f4` | 220,596 | 2,710 | 12 | 270 x 266 x 377 |

Every GLB is byte-deterministic across two independent in-memory builds, uses no runtime decoder extension, reopens grounded at Y=0, passes Khronos validation with zero errors/warnings, and remains below the 4 MB / 80,000 triangle / 20 draw-call apparel ceilings.

## TDD and review corrections

RED was recorded before implementation for the missing three GLBs, source/build records and catalog release. Later visual review drove additional RED tests before fixes:

- artwork materials failed because all three reopened as `OPAQUE` instead of `BLEND`;
- t-shirt/hoodie bodies and artwork surfaces failed curvature-section requirements;
- cap brim/button winding disagreed with vertex normals;
- cap top button exceeded plausible concept scale;
- cap patch/mark failed crown standoff and z-clearance gates;
- hoodie hood/hem/cuffs and cap crown/brim failed smoothness/tessellation gates;
- browser evidence initially failed because no load-gated reports or screenshots existed.

The final tests independently verify exact source bytes, transparent source pixels, texture provenance, alpha compositing, named geometry, face winding, curvature/tessellation, bounds, grounded pivots, truth-boundary metadata, budgets, validator results, report integrity and deterministic rebuilds.

## Browser evidence

`capture-apparel-concepts.mjs` loads the checked-in first-party `model-viewer`, awaits the model load and visible dimensions, waits one rendered second, and then retries until the screenshot contains at least 1,000 foreground pixels with at least 8 px breathing room on every edge. It writes desktop 900 x 900 and mobile 390 x 600 evidence plus a hash-pinned browser-QA report for each model.

All six governed captures were visually reviewed at original resolution. The exact art is readable without a rectangular matte, models are fully framed, cap crown/patch no longer occlude one another, and the final shoulder/hood pass uses denser curved profile geometry.

Two early capture runs hung because an external module inserted into a synthetic 404/JavaScript document never upgraded the custom element, leaving `customElements.whenDefined("model-viewer")` unresolved. The runner now starts from the built same-origin HTML document and injects the allowed same-origin runtime URL. Successful runs exit cleanly. The two stale Node/browser trees and the Playwright CLI daemon were terminated, and `.playwright-cli/` was moved to Trash; the final process audit found no capture, Playwright or Chrome process left behind.

## Catalog integration

`MRCH-005`, `MRCH-006` and `MRCH-007` now use their local GLBs, governed desktop/mobile cameras, uncompressed-only decoder policy, product-class budgets and localized EN/IT/RU concept/not-manufacturing disclosures. Catalog tests require 11 GLB viewers and zero blocked viewers.

The same `data/merch.json` staging includes the already-reviewed collector-box camera/copy hunk because the parent explicitly assigned this task ownership of the combined catalog integration. No collector model/build/report file and no apparel raster-registration file is part of this task commit.

## Final verification

- exact fixture extraction verification — passed;
- three deterministic `build-*.mjs --verify` checks — passed;
- `npm run test:merch` — 11/11 passed;
- `npm run test:merch-assets` — 2/2 passed;
- `npm run test:merch-pages` — 2/2 passed;
- `npm run test:merch-viewer-contract` — 5/5 passed;
- `npm run test:product-viewer-runtime` — 7/7 passed;
- `npm run test:merch-model-assets` — 5/5 passed;
- `npm run test:merch-model-builds` — 43/43 passed;
- `npm run build` — 345 files built;
- `npm run test:product-viewer-catalog` — 2/2 passed across all 11 desktop/mobile GLB viewers after the collector mobile field of view was reconciled to model-viewer's supported `30deg` runtime value.

## Remaining concern

No remaining concern exists in the three apparel GLBs or their catalog integration. All dimensional records remain explicit viewer envelopes and must be replaced by selected blanks, vendor proofs and measured approved samples before production.

---

## Task 6 apparel 3D release-quality refinement — 2026-08-06

Status: DONE

### Outcome

The three apparel concepts were rebuilt from the original governed artwork bytes and reviewed again at native capture size.

- The tee now has a tapered tubular body, continuous covered shoulder roots, flatter relaxed sleeves with open hems, a dark open collar cavity, a curved hem and a normal-offset exact 300 x 112.5 mm art surface.
- The hoodie now reads as a hood-down garment: the rear exterior is a solid two-lobe drape with a centre seam, while the real opening turns upward into the neckline. The body, cuffs, waistband and exact rear art remain separately governed.
- The cap now has six-panel crown construction, raised seams, crease cues, eyelets, bill edge stitching, a crown-to-bill transition and a genuinely omitted rear aperture bounded by a smooth rim and restrained lower strap/keeper.
- Woven normal and roughness maps remain deterministic and subtle; dark materials were lifted enough to preserve form without washing out the near-black direction.

The activated mobile viewer now withholds `ready` until the responsive camera profile has settled. Camera tests distinguish the declared FOV attribute from model-viewer's intentional aspect-adjusted effective FOV, preserving full portrait-canvas framing instead of forcing cropped renders.

### Final artifacts

| Model | GLB SHA-256 | Bytes | Triangles | Draw calls | Reopened bounds mm | Validator |
| --- | --- | ---: | ---: | ---: | --- | --- |
| t-shirt | `933668f46ff6f89532ef1eac7ae0ff1b6f69ed608c5b1ce545969a7e5a0be2b4` | 465,260 | 2,988 | 6 | 1136.800 x 1041.000 x 165.000 | 0 errors / 0 warnings |
| hoodie | `dcdc70995f27079ad1f80931eeb3aa369a7c90dcdbca215825d7e5aabb828fbb` | 600,844 | 3,842 | 7 | 1179.024 x 1065.000 x 271.387 | 0 errors / 0 warnings |
| cap | `2c52d94ecff7fa083f22afc0d7fb06db6bda764ede10b075fed2c23621fd84a3` | 3,565,776 | 38,090 | 19 | 269.862 x 266.000 x 382.500 | 0 errors / 0 warnings |

All remain below the governed ceilings of 4,000,000 bytes, 80,000 triangles and 20 draw calls and rebuild byte-for-byte deterministically.

### Final browser evidence

| View | Size | SHA-256 |
| --- | ---: | --- |
| tee desktop default | 900 x 900 | `4d7e567ec43ad683d608ff3bb960286a79003d3a3fe7107b49ba08dabb6dd827` |
| tee built mobile stage | 358 x 521 | `1e13397f22f4cea7c7574a324b20c67cf5ff4fda0afccdf144423aa502619284` |
| hoodie desktop default | 900 x 900 | `4bca2903f7511f15d125622e45a59853453070979e5b7f6c8eed096d94d03cb9` |
| hoodie desktop front cavity | 900 x 900 | `fa1dbf3f40c20ed8b0a03b339cc74b824a021c2bafb062a91643c4d79048e65f` |
| hoodie built mobile stage | 358 x 521 | `b120f1444e6c39ba531b4d5735b12d1003182f9461daf9fe9bb8486526a878ac` |
| cap desktop default | 900 x 900 | `d15c39eda8ecbab1720254f1cadd7cbcf74b441d6d5c18f46ba1902ea716e1a6` |
| cap desktop rear aperture | 900 x 900 | `1c64a863208bb301a821698e95376a35ad02c2aaf4df7d01a8a1c018244f3d1e` |
| cap built mobile stage | 358 x 521 | `9d2a8a9d7d07c4fef8ccaf14b18c78d1f22bd50c9084120ae669db231a333d24` |

At the real 390 x 844 browser viewport, all three active stages are 358 x 521 px (356 x 518 rendered canvas), have zero horizontal overflow, preserve pointer orbit/reset behavior, make no third-party requests and pass every stored QA check. Foreground/artwork contrast pixels were tee 60,917/2,661, hoodie 63,471/6,670 and cap 43,425/29,449.

Native-size review accepted the continuous tee shoulders and collar void, the hoodie-down rear and neckline cavity, and the cap's clean background-black aperture with no crown/detail fragments crossing it.

### Final verification

- `node --test site/tools/merch-3d/apparel-concept-models.test.mjs site/tools/merch-3d/apparel-concept-browser-qa.test.mjs` — 4/4 passed.
- `node --test site/tests/merch-model-assets.test.mjs` — 5/5 passed.
- `node --test --test-concurrency=1 site/tests/product-viewer-runtime.test.mjs site/tests/product-viewer-camera-browser.test.mjs site/tests/product-viewer-catalog-browser.test.mjs` — 11/11 passed. Serialization prevents the browser files from racing their shared `dist` rebuild.
- `node site/tools/merch-3d/capture-apparel-concepts.mjs` — all three isolated and built-product-page evidence sets captured successfully.
- `git diff --check` — passed.

### Remaining concern

The cap intentionally spends most of the current release budget (3.57 MB and 19 of 20 draw calls) to keep the rear aperture and crown rim smooth at inspection distance. It is within policy, but any future detail should replace or consolidate existing geometry rather than add another draw call. As before, all three assets remain concept visualizations and are not fit, construction or manufacturing references.
