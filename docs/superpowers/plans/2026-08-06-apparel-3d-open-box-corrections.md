# Apparel corrections and 3D completion implementation plan

> Design: `docs/superpowers/specs/2026-08-06-apparel-3d-open-box-corrections-design.md`

## Task 1: Make apparel registration visually enforceable

**Files:**

- Modify: `site/tests/merch-registration.test.mjs`
- Modify: `site/tools/render-apparel-registration.mjs`
- Modify: `site/data/apparel-print-registration-v02.json`
- Regenerate: four apparel public images and governed render/mask fixtures

Write failing checks for exact master identity, stable artwork bounds and hero-relative center/scale. Adjust quads and rerender all four views. Create a comparison contact sheet for visual review, then run `npm run test:merch-registration`.

Keep static-image QA native and deterministic: `sharp` owns dimensions and raw pixel hashes, the dry verifier rebuilds lossless source/mask artifacts, and approved lossy WebP exports retain separate byte/pixel identity checks without a decoder subprocess.

## Task 2: Add concept 3D for t-shirt, hoodie and cap

**Files:**

- Add: source records, builders and tests under `site/tools/merch-3d/`
- Add: governed art fixtures under `site/tools/merch-3d/sources/`
- Add: three GLBs and build reports
- Modify: `site/data/merch.json`
- Modify: viewer/model contract tests

First update tests to require 11 GLB products, zero blocked products and three concept-model disclosures. Build lightweight volumetric models with exact textures, validate outputs, connect cameras/posters/budgets, then run focused viewer and model tests.

## Task 3: Rebuild collector box as an open archive set

**Files:**

- Modify: `site/tools/merch-3d/collector-box-001.source.json`
- Modify: `site/tools/merch-3d/build-collector-box-001.mjs`
- Modify: `site/tools/merch-3d/collector-box-001.test.mjs`
- Regenerate: collector GLB, report, inspection and captures
- Modify: `site/data/merch.json`

Replace closed-only assertions with failing tests for open lid, interior trays and named contents. Build and validate the open assembly, preserve the immutable approved closed hero as its poster, tune desktop/mobile cameras for the activated open model, and capture default/front/rear views.

## Task 4: Integrate and verify

**Files:**

- Modify only where required by failing integration tests.

Run focused tests, build the site, start the local server, visually inspect every corrected gallery image and new viewer at desktop/mobile widths, test pointer drag and keyboard access, run accessibility and console checks, then run the full test suite. Request independent spec and quality review, fix all important findings, and release only after a clean final verification.
