# Hoodie Catalog Orbit Design

## Context

The governed hoodie remains a concept visualization, not a manufacturing model. Its approved desktop and mobile product views read correctly, but a steep top-down diagnostic angle exposes the procedural hood as layered geometry. The user needs a useful product interaction, not unrestricted inspection of provisional construction.

External replacement paths were rejected for this release: GarmentCode depends on a non-commercial NVIDIA simulator and has a documented macOS execution defect; the only traceable MakeHuman donor is a fitted CC-BY garment whose silhouette conflicts with the selected oversized hoodie.

## Decision

Keep the exact-artwork hoodie GLB and present it as a catalog 360 viewer:

- allow unrestricted horizontal azimuth so the customer can rotate through a complete turn;
- constrain polar tilt to `68deg`–`98deg`, which permits useful above/below inspection without entering the provisional hood construction;
- keep the existing desktop/mobile default cameras, poster-first loading, zoom, reset, reduced-motion, Save-Data and WebGL fallbacks;
- retain the existing EN/IT/RU concept disclosure and production release gate;
- express the restriction as optional product metadata so rigid objects and approved garments retain their current controls.

This is a standard product-viewer constraint, not a static fake: the GLB remains interactive and horizontally rotatable through 360 degrees.

## Data and runtime contract

`MRCH-006.viewer.orbitLimits` owns the restriction:

```json
{
  "min": "auto 68deg auto",
  "max": "auto 98deg auto"
}
```

`site/src/pages.mjs` emits the values as inert `data-viewer-min-camera-orbit` and `data-viewer-max-camera-orbit` attributes. `site/assets/product-viewer.js` copies them to `<model-viewer min-camera-orbit>` and `<model-viewer max-camera-orbit>` before assigning `src`.

## Verification

- Contract tests require the hoodie limits and unchanged full-azimuth `auto` values.
- Markup/runtime tests prove the attributes survive the poster-first boundary.
- A real Chromium pointer test drags horizontally and proves theta changes, then drags vertically in both directions and proves phi stays within 68–98 degrees.
- The existing camera race, responsive reset, catalog, asset budget and full suite remain green.
- Independent review must confirm that this is accurately described as a concept 360 viewer and that no source/license asset entered the bundle.

## Scope boundary

A production-grade sewn hoodie mesh remains gated on vendor patterns, a scan, or a commercially licensed garment simulation pipeline. The catalog orbit does not claim production geometry.
