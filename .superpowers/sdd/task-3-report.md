# Task 3 report: collector box open archive set

## Status

Complete in the collector scope.

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

GREEN verification:

```text
node --test site/tools/merch-3d/collector-box-001.test.mjs
4 tests passed, 0 failed

node site/tools/merch-3d/build-collector-box-001.mjs --verify
verified 2bf98876e57104cd434a6236b6c8ecc36b20fd7ad620832cdffda148e03d1249
244040 bytes, 626 triangles, 10 draw calls
```

Khronos validation reports 0 errors and 0 warnings. Browser QA reports all semantic gates true, including six required views, model load, source comparison, mobile breathing room, bone-interior visibility and Signal Red tab visibility.

## Governed poster exception

The activated 3D model defaults open and is compared against `collector-box-set-open.webp`. The inert poster remains the approved closed hero because the repository requires `viewer.poster === gallery[0].path` and the immutable collector gallery contract begins with `closed`. Gallery order and global validation were intentionally not changed.

## Integration note

The full site build became unavailable during final capture because concurrent apparel outputs no longer matched their not-yet-updated asset-manifest entries. No apparel or shared-contract files were changed here. Collector captures were regenerated against the already-built site after refreshing only its untracked/generated collector GLB and governed camera attributes; the parent integrator will rerun the full build and capture after apparel manifest integration.
