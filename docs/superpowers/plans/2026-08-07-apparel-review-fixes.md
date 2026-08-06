# Apparel Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tee/hoodie shoulder patches with genuinely stitched armhole topology, expose a material-backed hoodie cavity, and make responsive camera settlement race-safe.

**Architecture:** Build each garment shell as one indexed mesh with torso armhole holes, matching sleeve-root rings, shared stitch boundaries, smooth transition normals, and one global XY garment UV projection. Split the down hood into an exterior shell and an open inner cavity node using the existing governed interior material. Replace the shared camera boolean with revision-owned settlement results and gate `ready` on the latest completed revision.

**Tech Stack:** Node.js ESM, `@gltf-transform/core`, `gltf-validator`, Playwright, Sharp, `@google/model-viewer`.

## Global Constraints

- Preserve exact artwork bytes, hashes, dimensions and transparency.
- Keep each GLB deterministic, validator-clean and below 4,000,000 bytes, 80,000 triangles and 20 draw calls.
- Preserve the cap geometry except deterministic report/capture regeneration if required.
- Preserve poster-first, first-party loading and aspect-adjusted FOV framing with noncropped mobile margins.
- Do not modify `.superpowers/sdd/progress.md`.

---

### Task 1: Stitched armhole garment shells

**Files:**
- Modify: `site/tools/merch-3d/apparel-concept-models.test.mjs`
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`
- Modify: `site/tools/merch-3d/t-shirt-001.source.json`
- Modify: `site/tools/merch-3d/hoodie-001.source.json`
- Regenerate: tee and hoodie GLBs and build reports

**Interfaces:**
- Consumes: torso ring definitions, sleeve paths, `Geometry`, `addNode()`.
- Produces: `stitchedGarmentShell({ torsoRings, sleeve, uvBounds })` with one indexed mesh, two real torso armhole holes, matching root rings and global garment-space UV metadata.

- [x] **Step 1: Add RED topology tests**

Assert the builder no longer contains `shoulderBridge`, shell extras declare `shared-armhole-rings`, root cap count is zero, indexed connectivity is one component, armhole zones have no boundary edges, transition normal dots remain smooth, and all shell UVs follow the documented global XY formula rather than resetting per component.

- [x] **Step 2: Run the apparel model test and record the expected old-patch failures**

Run: `node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

- [x] **Step 3: Implement one indexed torso/armhole/sleeve mesh**

Add shared-index helpers to `Geometry`, omit torso cells in each armhole, derive ordered armhole loops, create one-to-one outward root rings, stitch quads between corresponding vertices, continue the sleeve loft without root caps, blend normals across both rings, and map every shell vertex through:

```js
u = (x - uvBounds.minX) / (uvBounds.maxX - uvBounds.minX);
v = (y - uvBounds.minY) / (uvBounds.maxY - uvBounds.minY);
```

- [x] **Step 4: Rebuild tee/hoodie and verify GREEN**

Run both deterministic build scripts, then rerun the apparel model test.

### Task 2: Real hoodie inner cavity and elevated evidence

**Files:**
- Modify: `site/tools/merch-3d/apparel-concept-models.test.mjs`
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`
- Modify: `site/tools/merch-3d/hoodie-001.source.json`
- Modify: `site/tools/merch-3d/capture-apparel-concepts.mjs`
- Modify: `site/tools/merch-3d/apparel-concept-browser-qa.test.mjs`
- Regenerate: hoodie GLB, reports and screenshots

**Interfaces:**
- Consumes: the upward neckline opening in `openHoodShell()` and `materials.hoodInterior`.
- Produces: `Hoodie_Hood_Interior_Cavity`, an open multi-ring inner surface joined positionally to the opening edge, with nonzero Y/Z depth and a dedicated elevated capture profile.

- [x] **Step 1: Add RED cavity/material/capture tests**

Require the interior node and material assignment, at least two open boundary loops, connected cavity topology, minimum depth, and `desktop-elevated-cavity` browser evidence.

- [x] **Step 2: Run focused model/browser QA tests and record failures**

Run: `node --test site/tools/merch-3d/apparel-concept-models.test.mjs site/tools/merch-3d/apparel-concept-browser-qa.test.mjs`

- [x] **Step 3: Implement the inner surface and elevated camera**

Build an uncapped 40-section cavity from the opening inner ellipse down/back through multiple throat rings, assign `hoodInterior`, add governed topology extras, and capture from a front/top orbit near 55 degrees polar elevation.

- [x] **Step 4: Rebuild, recapture and inspect native images**

Inspect tee desktop/mobile plus hoodie rear/elevated-cavity/mobile at original size before acceptance.

### Task 3: Revision-owned camera settlement

**Files:**
- Modify: `site/tests/product-viewer-camera-browser.test.mjs`
- Modify: `site/assets/product-viewer.js`

**Interfaces:**
- Consumes: viewport media changes, load, reset and `<model-viewer>.updateComplete`.
- Produces: `settleCameraProfile()` result objects `{ status: "settled" | "superseded" | "aborted", revision }`, revision-owned applying state, and latest-settlement readiness gating.

- [x] **Step 1: Add a RED load/resize/reset race test**

Delay the cassette GLB, force a mobile media change plus reset from a model `load` listener, record every transition to `viewerState=ready`, and require the first/only ready snapshot to contain the latest mobile profile.

- [x] **Step 2: Run the camera browser test and record the false-ready failure**

Run: `node --test site/tests/product-viewer-camera-browser.test.mjs`

- [x] **Step 3: Implement token-scoped settlement**

Only a revision may clear its own applying marker; return explicit status; keep a latest-settlement promise; and have the load handler await the latest settled revision before exposing ready state.

- [x] **Step 4: Rerun focused camera tests**

Run: `node --test site/tests/product-viewer-camera-browser.test.mjs`

### Task 4: Release verification, report and commit

**Files:**
- Modify: `.superpowers/sdd/task-2-report.md`
- Modify: this plan's checkboxes

- [x] **Step 1: Run deterministic rebuild/validator verification for tee, hoodie and cap**

- [x] **Step 2: Run every requested focused and browser suite serially where shared builds require it**

- [x] **Step 3: Run `git diff --check` and confirm `.superpowers/sdd/progress.md` is untouched**

- [x] **Step 4: Append exact hashes, budgets, capture dimensions, commands and pass counts to the report**

- [x] **Step 5: Commit the complete scoped review-fix wave**
