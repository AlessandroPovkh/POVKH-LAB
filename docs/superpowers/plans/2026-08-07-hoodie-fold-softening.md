# Hoodie Fold and Armhole Softening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the governed hoodie read as folded fabric by replacing the closed mechanical hood lip and discrete armhole rail stack while preserving the approved stitched topology, cavity, cameras, artwork and envelope.

**Architecture:** Generate only a partial irregular front/side hood fold that shares its endpoints with the two exterior lobes, keep a complete but unfilled forward-pitched interior entrance in front of a solid rear shell, and tuck the rear torso neckline below the hood overlap. Replace the single 30 mm root jump with eight smoothstep-interpolated progressive sleeve-frame rings, a maximum 4 mm distributed positional bias and area-weighted relaxed normals before the remaining sleeve loft.

**Tech Stack:** Node.js ESM, `@gltf-transform/core`, `gltf-validator`, Playwright, Sharp, `@google/model-viewer`.

## Global Constraints

- Do not change `site/assets/product-viewer.js` or any governed default/mobile/auxiliary camera values.
- Preserve one indexed hoodie garment shell, zero sleeve-root caps, zero repair patches, coherent global garment-space UVs and original viewer envelope.
- Preserve exact artwork bytes, material governance, true uncapped hood interior and solid rear hood exterior.
- Remove the obsolete tracked `hoodie-001-desktop-front-cavity.png` after the elevated replacement is regenerated.
- Do not modify `.superpowers/sdd/progress.md`.

---

### Task 1: Structural regression gates

**Files:**
- Modify: `site/tools/merch-3d/apparel-concept-models.test.mjs`

**Interfaces:**
- Consumes: reopened hoodie shell/exterior/interior node extras and builder source.
- Produces: failing assertions for partial fold coverage, variable thickness, rear-neckline tuck and distributed armhole transition rows.

- [x] Add assertions requiring `openingLipClosed: false`, `openingLipArcDegrees < 240`, `openingLipThicknessRangeM` with unequal endpoints, `torsoNecklineOcclusion: "rear-neckline-tucked-below-hood-lobes"`, at least five armhole transition rows and no 30 mm root offset literal.
- [x] Run `node --test site/tools/merch-3d/apparel-concept-models.test.mjs` and record the expected missing-extra/legacy-offset failure.

### Task 2: Partial folded hood edge and neckline tuck

**Files:**
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`
- Modify: `site/tools/merch-3d/hoodie-001.source.json`

**Interfaces:**
- Consumes: `hoodOpeningPoint()`, exterior lobe endpoints and the complete interior entrance loop.
- Produces: `hoodOpeningFoldEdge()` spanning only the front/side arc, variable-thickness fold geometry joined to both lobes, and a hoodie-only rear neckline drop hidden below the hood overlap.

- [x] Replace the 40-section closed annulus with a 25-section asymmetric arc from right lobe through the front edge to the left lobe; vary width, depth and height without closing the rear silhouette.
- [x] Keep the cavity entrance complete and open, but share only the governed partial fold positions with the exterior and record the exact shared-position count.
- [x] Add hoodie top-ring `rearDrop` handling so the rear torso neckline lies beneath the hood panel rather than producing a second visible oval.

### Task 3: Distributed armhole transition

**Files:**
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`

**Interfaces:**
- Consumes: the real 28-vertex torso armhole loop and first sleeve frame.
- Produces: eight smoothstep progressive upper-arm transition rings, maximum 4 mm sine-distributed bias, area-weighted relaxed normals, then the remaining sleeve loft.

- [x] Replace the single offset root ring with eight progressive indexed rings whose positions advance through the upper-arm sleeve frames and whose normals are area-weighted and relaxed.
- [x] Preserve the original armhole boundary indices, global UV projection and zero-cap cuff topology.

### Task 4: Rebuild, evidence and release

**Files:**
- Regenerate: hoodie GLB/build reports/browser report/screenshots.
- Modify: `.superpowers/sdd/task-2-report.md`
- Delete: `site/tools/merch-3d/reports/screenshots/hoodie-001-desktop-front-cavity.png`

**Interfaces:**
- Consumes: final builder/source and unchanged capture cameras.
- Produces: deterministic validator-clean hoodie plus original-size desktop default, elevated cavity and mobile-stage evidence.

- [x] Build hoodie, run focused model tests, regenerate browser evidence, and inspect the three governed hoodie images at original size.
- [x] Run two exact deterministic hoodie verifies, apparel model/browser QA, model assets and `git diff --check`.
- [x] Confirm `site/assets/product-viewer.js`, camera metadata and `.superpowers/sdd/progress.md` are untouched.
- [x] Append exact hashes/budgets/captures/tests to the task report and commit the scoped wave.
