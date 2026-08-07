# Apparel 3D Quality Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the three governed apparel concept GLBs so the tee, hoodie, and cap read as credible garments in desktop and real mobile product viewers.

**Architecture:** Extend the deterministic procedural builder with tailored torso, sleeve, hood-panel, seam, eyelet, and bill helpers. Keep each asset's exact artwork as a separate conforming surface and preserve the existing source JSON, report, validator, capture, lazy-load, and mobile-stage contracts.

**Tech Stack:** Node.js ESM, `@gltf-transform/core`, `@gltf-transform/functions`, `gltf-validator`, Sharp, Playwright, `@google/model-viewer`.

## Global Constraints

- Exact artwork source bytes, SHA-256 hashes, transparency, 300 × 112.5 mm garment surfaces, and 20 × 20 mm cap mark must not change.
- Every asset remains a concept visualization and not a manufacturing reference.
- GLBs remain byte-deterministic, validator-clean, and below 4,000,000 bytes, 80,000 triangles, and 20 draw calls.
- Viewer loading remains poster-first and first-party; activated mobile stage remains approximately 358 × 520 px at a 390 × 844 px viewport with no horizontal overflow.
- Continuous garment-space UVs and subtle deterministic cloth normal/roughness response must not regress.
- Do not modify `.superpowers/sdd/progress.md`.

---

### Task 1: Tailored T-shirt shell and openings

**Files:**
- Modify: `site/tools/merch-3d/apparel-concept-models.test.mjs`
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`
- Modify: `site/tools/merch-3d/t-shirt-001.source.json`
- Regenerate: `site/assets/merch-3d/t-shirt-001.glb`
- Regenerate: `site/tools/merch-3d/reports/t-shirt-001.{report,inspect,validator}.json`

**Interfaces:**
- Consumes: `Geometry`, `appendGeometry()`, `curvedArtworkSurface()`, source material/camera governance.
- Produces: `tailoredTorso()`, `attachedSleeve()`, `openCuffRim()`, and a `T_Shirt_Tailored_Shell` node with explicit bridge metadata.

- [x] **Step 1: Write failing topology and proportion tests**

```js
assert.equal(shell.getExtras().construction, "tailored-torso-attached-sleeves");
assert.ok(nodes.get("T_Shirt_Sleeve_Hems")?.getMesh());
assert.ok(boundaryEdgeCount(nodes.get("T_Shirt_Sleeve_Hems")) >= 24);
assert.ok(shellDepth / torsoWidth >= 0.12);
assert.ok(shell.getExtras().shoulderDropM >= 0.06);
```

- [x] **Step 2: Verify RED**

Run: `node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

Expected: FAIL because the checkpoint exposes `unified-draped-front-back-shell` and no sleeve-hem openings.

- [x] **Step 3: Implement shaped torso, sleeves, bridges, cuff rims, collar and hem**

```js
const torso = tailoredTorso({ rows, frontDepth: 0.072, backDepth: 0.058, hemCurve: 0.014 });
appendGeometry(shell, torso.geometry);
for (const side of [-1, 1]) appendGeometry(shell, attachedSleeve({ side, shoulderDrop: 0.075 }).geometry);
addNode(doc, assembly, buffer, "T_Shirt_Sleeve_Hems", sleeveHemRims, materials.collar, { opening: "unfilled-cuff-rims" });
```

- [x] **Step 4: Rebuild and verify GREEN**

Run: `node site/tools/merch-3d/build-t-shirt-001.mjs && node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

Expected: all apparel model tests PASS and validator warnings remain zero.

### Task 2: Attached two-panel hoodie and shaped body system

**Files:**
- Modify: `site/tools/merch-3d/apparel-concept-models.test.mjs`
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`
- Modify: `site/tools/merch-3d/hoodie-001.source.json`
- Regenerate: `site/assets/merch-3d/hoodie-001.glb`
- Regenerate: `site/tools/merch-3d/reports/hoodie-001.{report,inspect,validator}.json`

**Interfaces:**
- Consumes: tailored torso/sleeve helpers from Task 1.
- Produces: `twoPanelHood()`, `hoodThroatOverlap()`, shaped cuff/waistband surfaces, and an attached open-cavity hood node.

- [x] **Step 1: Write failing hood/body construction tests**

```js
assert.equal(hood.getExtras().construction, "attached-two-panel-hood");
assert.equal(hood.getExtras().panelCount, 2);
assert.ok(hood.getExtras().necklineOverlapM >= 0.08);
assert.ok(nodes.get("Hoodie_Hood_Throat_Overlap")?.getMesh());
assert.ok(boundaryEdgeCount(hood) >= 24);
assert.ok(nodes.get("Hoodie_Shaped_Cuffs")?.getMesh());
```

- [x] **Step 2: Verify RED**

Run: `node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

Expected: FAIL because the checkpoint hood is one annular shell without two-panel or throat-overlap semantics.

- [x] **Step 3: Implement attached panel hood, neck bridge, body, cuffs and waistband**

```js
const hood = twoPanelHood({ necklineY: 1.00, crownY: 1.35, opening: "teardrop" });
addNode(doc, assembly, buffer, "Hoodie_Open_Hood_Shell", hood.geometry, materials.fabric, {
  construction: "attached-two-panel-hood", panelCount: 2, necklineOverlapM: 0.08, opening: "unfilled-face-cavity"
});
addNode(doc, assembly, buffer, "Hoodie_Hood_Throat_Overlap", hood.throat, materials.rib, { role: "crossing-throat-panels" });
```

- [x] **Step 4: Rebuild and verify GREEN**

Run: `node site/tools/merch-3d/build-hoodie-001.mjs && node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

Expected: all apparel model tests PASS and the real cavity remains unfilled.

### Task 3: Six-panel cap construction and clean rear assembly

**Files:**
- Modify: `site/tools/merch-3d/apparel-concept-models.test.mjs`
- Modify: `site/tools/merch-3d/lib/apparel-concept-builder.mjs`
- Modify: `site/tools/merch-3d/cap-001.source.json`
- Regenerate: `site/assets/merch-3d/cap-001.glb`
- Regenerate: `site/tools/merch-3d/reports/cap-001.{report,inspect,validator}.json`

**Interfaces:**
- Consumes: existing `crownPanel()`, real aperture omission, exact patch art.
- Produces: crown seams, eyelets, crease cues, bill edge stitching, crown-to-bill transition, and a rear assembly with no aperture-zone fragments.

- [x] **Step 1: Write failing cap-detail and clearance tests**

```js
for (const name of ["Cap_Crown_Seams", "Cap_Eyelets", "Cap_Bill_Edge_Stitching", "Cap_Crown_Bill_Transition"]) assert.ok(nodes.get(name)?.getMesh());
assert.equal(nodes.get("Cap_Crown_Seams").getExtras().panelCount, 6);
assert.equal(crownTrianglesInRearAperture(nodes), 0);
assert.equal(rearAssemblyFragmentsInAperture(nodes), 0);
```

- [x] **Step 2: Verify RED**

Run: `node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

Expected: FAIL because the checkpoint lacks seam, eyelet, bill-stitching, and transition nodes.

- [x] **Step 3: Implement restrained cap construction cues**

```js
addNode(doc, assembly, buffer, "Cap_Crown_Seams", crownSeamRibbons(), materials.seam, { panelCount: 6 });
addNode(doc, assembly, buffer, "Cap_Eyelets", crownEyelets(), materials.seam, { count: 4 });
addNode(doc, assembly, buffer, "Cap_Bill_Edge_Stitching", billEdgeStitching(), materials.seam, { rows: 2 });
addNode(doc, assembly, buffer, "Cap_Crown_Bill_Transition", crownBillTransition(), materials.crown, { role: "front-crown-bill-join" });
```

- [x] **Step 4: Rebuild and verify GREEN**

Run: `node site/tools/merch-3d/build-cap-001.mjs && node --test site/tools/merch-3d/apparel-concept-models.test.mjs`

Expected: all model tests PASS within the existing byte/triangle/draw-call ceilings.

### Task 4: Material calibration, capture inspection, verification, and report

**Files:**
- Modify: `site/tools/merch-3d/{t-shirt-001,hoodie-001,cap-001}.source.json`
- Modify: `site/assets/product-viewer.js`
- Regenerate: `site/tools/merch-3d/reports/*.browser-qa.json`
- Regenerate: `site/tools/merch-3d/reports/screenshots/t-shirt-001-*.png`
- Regenerate: `site/tools/merch-3d/reports/screenshots/hoodie-001-*.png`
- Regenerate: `site/tools/merch-3d/reports/screenshots/cap-001-*.png`
- Modify: `.superpowers/sdd/task-2-report.md`

**Interfaces:**
- Consumes: regenerated GLBs and existing `capture-apparel-concepts.mjs` built-page workflow.
- Produces: hash-pinned original-size capture evidence and a command/result handoff.

- [x] **Step 1: Add failing black-fabric readability assertions**

```js
assert.ok(fabricMaterial.getNormalScale() <= 0.03);
assert.ok(source.materials.fabric.baseColor.every((value, index) => index === 3 || value >= 0.018));
assert.ok(productStage.artworkContrastPixels >= 30);
```

- [x] **Step 2: Verify RED for any changed calibration gate**

Run: `node --test site/tools/merch-3d/apparel-concept-models.test.mjs site/tools/merch-3d/apparel-concept-browser-qa.test.mjs`

Expected: a deliberate failure on any source value below the new readability floor.

- [x] **Step 3: Rebuild and capture all governed evidence**

Run: `node site/tools/merch-3d/build-t-shirt-001.mjs && node site/tools/merch-3d/build-hoodie-001.mjs && node site/tools/merch-3d/build-cap-001.mjs && node site/tools/merch-3d/capture-apparel-concepts.mjs`

Expected: three deterministic build lines and successful isolated/built-product-page capture lines for all assets.

- [x] **Step 4: Inspect original-size captures**

Inspect desktop default, built mobile active stage, hoodie front cavity, and cap rear aperture PNGs at their native dimensions. Reject and iterate on planar/bat-wing silhouettes, detached hood, slab bill, internal fragments, crushed blacks, moiré, cropping, or illegible exact art.

- [x] **Step 5: Run focused verification**

Run:

```bash
node --test site/tools/merch-3d/apparel-concept-models.test.mjs site/tools/merch-3d/apparel-concept-browser-qa.test.mjs
node --test site/tests/merch-model-assets.test.mjs
node --test site/tests/product-viewer-runtime.test.mjs site/tests/product-viewer-camera-browser.test.mjs site/tests/product-viewer-catalog-browser.test.mjs
git diff --check
```

Expected: zero failures, zero validator warnings, zero whitespace errors.

- [x] **Step 6: Append the exact evidence report and commit**

Append final hashes, budgets, capture dimensions, commands, pass counts, and any honest visual concern to `.superpowers/sdd/task-2-report.md`, stage only scoped files (never `.superpowers/sdd/progress.md`), and commit with `feat: refine apparel 3d release quality`.
