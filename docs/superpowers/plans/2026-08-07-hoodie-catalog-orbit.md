# Hoodie Catalog Orbit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the governed hoodie GLB as a true horizontal 360-degree product viewer while preventing steep diagnostic tilt into provisional hood construction.

**Architecture:** Add optional orbit-limit metadata to the existing merch viewer contract. Pass it through the inert product-page shell and apply it to the existing self-hosted `<model-viewer>` before the GLB source is assigned. Verify the boundary with contract tests and real pointer interaction.

**Tech Stack:** Node.js ESM, static page generator, `@google/model-viewer` 4.3.1, Node test runner, Playwright Chromium.

## Global Constraints

- Preserve the existing hoodie GLB, exact artwork, source hashes, default desktop/mobile cameras and concept disclosure.
- Horizontal theta remains unrestricted; polar phi is limited to `68deg`–`98deg`.
- Do not add a renderer, cloud converter, remote runtime request or external 3D asset.
- Poster-first behavior, reduced-motion, Save-Data, WebGL fallback, responsive camera settlement and Reset View must not regress.
- Every production change begins with a failing test and the final slice receives independent review.

---

### Task 1: Viewer orbit-limit contract and runtime

**Files:**
- Modify: `site/tests/merch-viewer-contract.test.mjs`
- Modify: `site/tests/product-viewer-runtime.test.mjs`
- Modify: `site/data/merch.json`
- Modify: `site/src/pages.mjs`
- Modify: `site/assets/product-viewer.js`

**Interfaces:**
- Consumes: `object.viewer`, `productViewerMarkup()`, `activateModel()` and the existing desktop/mobile camera profile.
- Produces: optional `viewer.orbitLimits: { min: string, max: string }`, inert data attributes, and `<model-viewer>` min/max camera attributes.

- [ ] **Step 1: Write the failing contract and markup tests**

```js
const hoodie = library.objects.find(({ slug }) => slug === "hoodie");
assert.deepEqual(hoodie.viewer.orbitLimits, {
  min: "auto 68deg auto",
  max: "auto 98deg auto"
});
assert.match(viewerHtml, /data-viewer-min-camera-orbit="auto 68deg auto"/);
assert.match(viewerHtml, /data-viewer-max-camera-orbit="auto 98deg auto"/);
```

- [ ] **Step 2: Verify RED**

Run: `cd site && node --test tests/merch-viewer-contract.test.mjs tests/product-viewer-runtime.test.mjs`

Expected: FAIL because hoodie metadata and rendered min/max attributes do not exist.

- [ ] **Step 3: Add metadata and inert markup propagation**

Add the exact `orbitLimits` object to `MRCH-006.viewer`. In `productViewerMarkup()`, render the two optional data attributes only when both values exist:

```js
const orbitLimits = viewer.orbitLimits;
const orbitLimitAttributes = orbitLimits
  ? ` data-viewer-min-camera-orbit="${escapeHtml(orbitLimits.min)}" data-viewer-max-camera-orbit="${escapeHtml(orbitLimits.max)}"`
  : "";
```

- [ ] **Step 4: Apply limits before the model source**

In `activateModel()` after creating `<model-viewer>` and before `model.setAttribute("src", ...)`:

```js
if (root.dataset.viewerMinCameraOrbit && root.dataset.viewerMaxCameraOrbit) {
  model.setAttribute("min-camera-orbit", root.dataset.viewerMinCameraOrbit);
  model.setAttribute("max-camera-orbit", root.dataset.viewerMaxCameraOrbit);
}
```

- [ ] **Step 5: Verify GREEN**

Run: `cd site && node --test tests/merch-viewer-contract.test.mjs tests/product-viewer-runtime.test.mjs`

Expected: all selected tests PASS.

### Task 2: Real interaction proof and review

**Files:**
- Modify: `site/tests/product-viewer-camera-browser.test.mjs`
- Modify: `.superpowers/sdd/task-2-report.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: built hoodie page and model-viewer pointer controls.
- Produces: browser evidence that theta rotates and phi clamps, plus the final Task 6 status record.

- [ ] **Step 1: Write a failing Chromium interaction test**

Activate `/en/merch/hoodie/`, drag from the viewer center at least 240 CSS pixels horizontally, and assert that `getCameraOrbit().theta` changes by more than `0.25` radians. Then perform large vertical drags in both directions and assert every settled `phi` remains between `68 * Math.PI / 180 - 0.01` and `98 * Math.PI / 180 + 0.01`.

- [ ] **Step 2: Verify RED**

Run: `cd site && node --test tests/product-viewer-camera-browser.test.mjs`

Expected: the new test fails before runtime limits are available in the built fixture or when either vertical drag escapes the governed interval.

- [ ] **Step 3: Rebuild and verify interaction GREEN**

Run:

```bash
cd site
npm run build
node --test tests/product-viewer-camera-browser.test.mjs
```

Expected: horizontal pointer interaction changes theta, both vertical extremes remain clamped, Reset View returns to the governed profile, and existing responsive camera tests pass.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
cd site
node --test tests/merch-viewer-contract.test.mjs tests/product-viewer-runtime.test.mjs tests/product-viewer-camera-browser.test.mjs tests/product-viewer-catalog-browser.test.mjs tests/merch-model-assets.test.mjs
npm test
cd ..
git diff --check
```

Expected: zero failures, zero validator warnings and zero whitespace errors.

- [ ] **Step 5: Record evidence and request independent review**

Update the task report with the exact commands, pass counts and the honest concept limitation. Mark Task 6 complete only after the independent reviewer confirms full horizontal rotation, constrained tilt, unchanged artwork/default cameras and no bundled external donor.

- [ ] **Step 6: Commit scoped changes**

```bash
git add docs/superpowers/specs/2026-08-07-hoodie-catalog-orbit-design.md \
  docs/superpowers/specs/2026-08-07-garment-source-audit.md \
  docs/superpowers/plans/2026-08-07-hoodie-catalog-orbit.md \
  site/tests/merch-viewer-contract.test.mjs \
  site/tests/product-viewer-runtime.test.mjs \
  site/tests/product-viewer-camera-browser.test.mjs \
  site/data/merch.json site/src/pages.mjs site/assets/product-viewer.js \
  .superpowers/sdd/task-2-report.md .superpowers/sdd/progress.md
git commit -m "fix: constrain hoodie catalog orbit"
```
