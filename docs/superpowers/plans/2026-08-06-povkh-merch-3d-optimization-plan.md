# POVKH LAB Merch / 3D Optimization Implementation Plan

> Execute in isolated branch `agent/merch-3d-optimization`. Every behavior change starts with a failing test; every slice gets independent review before the next slice.

**Goal:** Deliver physically consistent apparel galleries, a motion-led merch entrance, progressive 3D/360 interaction, a quieter site hierarchy, full QA and a verified GitHub Pages release.

**Architecture:** Preserve the static generator in `site/src/pages.mjs` and existing `assets/site.js` runtime. Add deterministic build-time apparel registration, a self-hosted lazy viewer module and declarative viewer metadata in `merch.json`. Use progressive disclosure in existing shell markup rather than introducing a framework.

## Task 1 — Freeze baselines and add governance tests

**Files:**
- Create: `site/tests/merch-registration.test.mjs`
- Create: `site/tests/merch-viewer-contract.test.mjs`
- Create: `site/tests/interface-hierarchy.test.mjs`
- Modify: `site/package.json`

1. Add failing assertions for exact apparel masters, registration fields and canonical tolerances.
2. Add failing assertions for product viewer poster/source/alt/budget contracts and base-safe paths.
3. Add failing assertions for four primary nav items, one Social Access footer destination, single merch status and lightweight 404.
4. Run each test independently and record the expected failure.
5. Commit the red tests.

## Task 2 — Recompose apparel gallery assets

**Files:**
- Create: `site/data/apparel-print-registration-v02.json`
- Create: `site/tools/render-apparel-registration.mjs`
- Create governed source packet/provenance entries under `site/tools/fixtures/apparel-registration/`
- Modify: `site/assets/merch/t-shirt-print-macro.webp`
- Modify: `site/assets/merch/t-shirt-on-body.webp`
- Modify: `site/assets/merch/hoodie-print-macro.webp`
- Modify: `site/assets/merch/hoodie-worn-rear.webp`
- Modify: `site/data/merch-asset-manifest.json`

1. Copy only canonical artwork derivatives and required masks/bases from the read-only production source into an auditable registration packet.
2. Implement hash and geometry validation.
3. Render the four derivatives from the approved physical planes.
4. Run registration tests and compare canonical inverse projections.
5. Inspect all six apparel WebPs at full resolution and mobile crops.
6. Commit assets, manifest and provenance.

## Task 3 — Add PHYSICAL merch motion

**Files:**
- Create: `site/assets/video/PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.{webm,mp4}`
- Create: `site/assets/video/PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.{webm,mp4}`
- Modify: `site/src/pages.mjs`
- Modify: `site/assets/styles.css`
- Modify: motion tests

1. Write failing tests for PHYSICAL sources, one visible merch title and no repeated plate title.
2. Build a loop-safe materialisation animation using exact brand geometry/type assets.
3. Call the existing `heroMotionMarkup` with `PHYSICAL`.
4. Add a designed static fallback and enforce reduced-motion/Save-Data no-request behavior.
5. Run video probe, browser network and visual tests.
6. Commit.

## Task 4 — Establish local 3D runtime and contracts

**Files:**
- Modify: `site/package.json`, lockfile
- Create: `site/assets/vendor/model-viewer.min.js` and license notice or reproducible vendor step
- Create: `site/assets/product-viewer.js`
- Modify: `site/data/merch.json`
- Modify: `site/src/pages.mjs`
- Modify: `site/assets/styles.css`

1. Pin one audited Apache-2.0 `@google/model-viewer` version; do not add another renderer.
2. Add failing tests proving no viewer/model fetch before explicit activation.
3. Implement poster-first loader, base-path resolution, loading/ready/error states, Reset View and a11y instructions.
4. Add reduced-motion, Save-Data and WebGL-failure fallbacks.
5. Prove no cross-origin decoder/runtime requests.
6. Commit.

## Task 5 — Cassette and hoodie POC

**Files:**
- Create: source specs under `site/tools/merch-3d/`
- Create: `site/assets/merch-3d/cassette-002.glb`
- Create either `site/assets/merch-3d/hoodie-001.glb` or governed 360 sequence
- Modify: `site/data/merch.json`
- Create: GLB validation/budget tests

1. Build cassette geometry from controlled dimensions and exact decals.
2. Build/assess hoodie against approved front/rear sources; never invent the print.
3. Validate GLB structure, extensions, size, triangles, draw calls and textures.
4. Capture canonical orbit screenshots and compare silhouette/registration tolerances.
5. Apply the defined hoodie go/no-go gate; use an honest 360 fallback when needed.
6. Run interaction/performance/error tests and commit.

## Task 6 — Complete viewer assets for all products

**Products:** vinyl, cassette, CD, USB, poster, sticker pack, zine, collector box, T-shirt, hoodie, cap.

1. Add one red contract test per missing product viewer.
2. Produce rigid/flat parameterised GLBs with exact canonical front/back textures.
3. Produce verified garment viewer assets or 360 fallbacks.
4. Enforce category byte/triangle/draw-call budgets.
5. Run validator and visual checks for every object.
6. Commit in small category batches.

## Task 7 — Simplify global and merch hierarchy

**Files:**
- Modify: `site/src/pages.mjs`
- Modify: `site/assets/site.js`
- Modify: `site/assets/styles.css`
- Modify: hierarchy and browser tests

1. Reduce primary desktop nav to Home/Catalog/Merch/Artists and add accessible Menu/Index disclosure.
2. Collapse mobile player advanced controls while preserving 60% default volume and timeline seeking.
3. Replace footer social duplicates with Social Access.
4. Remove repeated product-card status, hero CTA/title repetition and duplicate hero gallery image.
5. Move roadmap to a closed disclosure.
6. Render 404 through a lightweight shell.
7. Restore visible main focus and run keyboard/screen-reader checks.
8. Commit.

## Task 8 — Full verification and independent review

1. Run unit/manifest/registration/viewer tests.
2. Run clean build and static QA.
3. Run Chromium and WebKit route matrix, keyboard, mobile, reduced-motion, Save-Data, font-failure and axe tests.
4. Run GLB validator and asset budgets.
5. Review visual snapshots for every changed product and shell.
6. Run independent design/UX reviewer and code/test reviewer; fix verified findings.
7. Re-run the entire suite from a clean checkout.

## Task 9 — Release

1. Review final diff and exclude private source material, temporary captures and hidden metadata.
2. Commit intentionally and push `agent/merch-3d-optimization`.
3. Integrate with the repository’s Pages release workflow.
4. Verify deployed `/`, `/merch/`, two product viewers, reduced-motion fallback, language routes and 404.
5. Report the deployed URL, test evidence, viewer modes and any explicitly deferred high-fidelity source requirements.
