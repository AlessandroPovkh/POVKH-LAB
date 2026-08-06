# Task 3 report: collector box open archive set

## Status

Collector correction implemented; clean integration verification remains pending.

- Replaced the closed-only GLB with a default-open 105-degree archive-set concept.
- Added separately named base, lid, bone lining, modular tray/recesses, zine, cassette, CD, data key, vinyl/archive sleeve, sticker/identity insert and Signal Red pull-tab components.
- Reused the governed exact reverse identity raster for the lid card and zine mark; no identity was retyped or generated.
- Increased product recognizability with a dark zine cover, smoke cassette/reel cues, smoke CD case plus silver disc, data-key connector cue and a Signal Red archive-sleeve stripe.
- Kept hinge, dimensions, clearances and manufacturing internals explicitly provisional/non-machinable in source data, node extras and the build report.
- Tuned desktop/mobile default cameras and updated only the collector viewer fields in `data/merch.json`.
- Regenerated the deterministic GLB, validator/inspection/build reports, six browser views, readability crop and approved-open source comparison.

## TDD evidence

RED was recorded before implementation:

- source test failed because state was `CLOSED ONLY` instead of `DEFAULT OPEN ARCHIVE SET`;
- artifact test failed because `Collector_Box_Open_Base` was missing;
- later refinements failed first on missing `Collector_Box_Vinyl_Recess`, recognizability nodes and `Collector_Box_Lid_Identity_Backplate`.

Initial GREEN verification (superseded by the Important review below):

```text
node --test site/tools/merch-3d/collector-box-001.test.mjs
4 tests passed, 0 failed

node site/tools/merch-3d/build-collector-box-001.mjs --verify
verified 2bf98876e57104cd434a6236b6c8ecc36b20fd7ad620832cdffda148e03d1249
244040 bytes, 626 triangles, 10 unique mesh primitives (invalid as a runtime draw count)
```

That first pass was validator-clean, but review correctly found that its draw-call metric counted unique mesh primitives rather than rendered node/primitive pairs. Its completion status and budget evidence are withdrawn.

## Governed poster exception

The activated 3D model defaults open and is compared against `collector-box-set-open.webp`. The inert poster remains the approved closed hero because the repository requires `viewer.poster === gallery[0].path` and the immutable collector gallery contract begins with `closed`. Gallery order and global validation were intentionally not changed.

## Integration note

No apparel, shared catalog, or shared-contract file is owned by this correction. Clean cross-task integration remains a parent-level release gate.

## Important review correction

The rejected pass was corrected with new RED/GREEN coverage:

- Runtime metrics now count every mesh-bearing node/primitive pair. The 24-instance layout was consolidated into nine static, transform-baked material batches; named components remain as semantic nodes that identify their visible batch.
- Canonical identity artwork authority is now separate from concept placement metadata. Exact full-image placements record distinct surfaces for the lid panel (120 x 45 mm), zine cover (78 x 29.25 mm) and sticker insert (75 x 28.125 mm); none is presented as production registration.
- The sticker insert has a larger dark backplate and the archive sleeve is a clearly Signal Red square with a dark vinyl disc. Browser QA now requires at least two separate red regions and high-contrast identity pixels in mobile default/front views.
- The build report measures the reopened open scene at min `[-125, 0, -119.971]`, max `[125, 221.079, 125]`, size `[250, 221.079, 244.971]` mm. It records the 250 x 315 x 55 mm figure separately as a provisional closed envelope and states that neither record is machinable.

Fresh correction evidence:

```text
node --test site/tools/merch-3d/collector-box-001.test.mjs
4 tests passed, 0 failed

node site/tools/merch-3d/build-collector-box-001.mjs --verify
verified 886f26820f6dcd5f6d4e2cc32d8a4840db2761d6d499191dae12b441c3b230e2
271352 bytes, 934 runtime triangles, 9 runtime draw calls, 9 unique mesh primitives

npm run build
POVKH LAB site built: 345 files
```

Khronos validation reports 0 errors and 0 warnings. Regenerated browser QA reports every semantic gate true across six required views, including mobile interior, separate archive-red and exact-identity contrast gates.
