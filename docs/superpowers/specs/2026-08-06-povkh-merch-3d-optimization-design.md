# POVKH LAB Merch Consistency, Motion, 3D and Interface Optimization

**Date:** 2026-08-06
**Status:** Approved for autonomous execution by the user's explicit instruction on 2026-08-06
**Scope:** Merch renders, merch/product-page experience, 3D progressive enhancement, global navigation/player simplification, QA and GitHub Pages release

## Outcome

The merch area must feel like one governed physical archive rather than a collection of separately composed mockups. Apparel artwork is registered once in physical coordinates and reproduced consistently across every view. The merch entrance becomes a restrained moving “materialisation” sequence related to the catalog motion language. Product pages remain fast and useful as ordinary 2D pages, with an optional, self-hosted interactive object view. Global chrome is reduced so the object, copy and music hierarchy can breathe.

## Fixed brand constraints

- Preserve the current POVKH LAB void/bone/signal palette, typography, grid, scan-line texture and archival language.
- Use only canonical source logos and exact artwork. AI may not redraw logos, microtype, track lists or artist names.
- The approved main T-shirt and hoodie renders define artwork scale and placement.
- Home remains Home; Social Access remains a separate route and is not substituted for Home.
- 3D is an enhancement, never a gate to product photography, description or navigation.
- All new runtime assets are self-hosted and compatible with the GitHub Pages project base path.

## Considered approaches

### Apparel consistency

1. Continue adjusting a quadrilateral independently in every image. Fast, but it recreates the existing drift and cannot be regression-tested.
2. Re-generate every apparel image with an image model. Visually flexible, but unsafe for exact typography, logos and garment continuity.
3. **Recommended: physical registration.** Lock one canonical 1600×600 artwork plane representing 300×112.5 mm, then map it into each camera view through versioned anchors/homographies and garment masks. Reapply fabric/fold shading above the exact artwork.

### Merch entrance motion

1. Reuse the catalog video unchanged. Consistent but semantically generic.
2. Use an animated GIF. Simple, but larger, less controllable and worse for reduced-motion/network behavior.
3. **Recommended: a dedicated PHYSICAL motion family.** A short WebM/MP4 loop materialises a red scan line, registration ring, bone field and object datum. It reuses the existing lazy motion loader and has a designed static fallback.

### Product interaction

1. Build a custom Three.js renderer for every object. Maximum freedom with excessive runtime, accessibility and maintenance responsibility.
2. Convert a single image automatically into final 3D. Useful only for blockouts: hidden geometry and exact brand marks are not proven.
3. **Recommended: hybrid progressive enhancement.** Self-host pinned `@google/model-viewer` and audited GLB assets. Rigid/flat objects use parameterised geometry with canonical texture maps. Apparel uses a verified garment mesh; when fidelity fails, use a lightweight 24/36-frame 360° sequence and label it honestly as “360° view”.

### Interface simplification

1. Remove routes and content. Reduces overload but destroys useful archive depth.
2. Restyle everything while keeping all controls visible. Cosmetic only.
3. **Recommended: progressive disclosure.** Keep Home, Catalog, Merch and Artists as primary desktop routes; move the remaining institutional routes into `Menu / Index`. Collapse advanced player controls, remove repeated card statuses and repeated hero/CTA language, and simplify the 404 shell.

## Apparel registration system

The master artwork has these invariant properties:

- canonical raster plane: 1600×600;
- physical intent: 300×112.5 mm;
- T-shirt approved placement: master rendered 480×180 at `(528, 350)` in the 1600×900 hero;
- hoodie approved placement: master rendered 432×162 at `(552, 365)` in the 1600×900 hero;
- physical center and width are transferred through a declared garment surface, not inferred independently from the crop.

Create `apparel-print-registration-v02.json` with master file hashes, dimensions, physical size, garment surface anchors, view homographies, occlusion masks and public asset destinations. A deterministic compositor produces macro/on-body/worn derivatives. The macro camera may move closer, but it must show the same physical print.

Acceptance tolerances after inverse projection into canonical space:

- artwork width and height within ±2% of the approved master;
- artwork center within ±2% of the declared surface;
- no visible artwork pixels outside the garment mask;
- exact master hash and aspect ratio;
- fabric/fold modulation remains visible without changing text geometry.

## Merch motion direction

Sequence: `scan → register → materialise → hold`, approximately three seconds and loop-safe. The H1 remains live HTML. The video stays decorative, muted and non-essential. The static fallback shows one registration ring, one datum and one signal line without repeating “FIRST PHYSICAL SIGNAL” inside the plate.

Motion files:

- `PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.webm`
- `PVKH_MOTION_BLOB_PHYSICAL_1920x1080_v1.mp4`
- `PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.webm`
- `PVKH_MOTION_BLOB_PHYSICAL_MOBILE_640x360_v1.mp4`

No motion request is allowed when reduced motion or Save-Data is active.

## 3D architecture

`merch.json` gains a per-product viewer contract:

```json
{
  "viewer": {
    "kind": "glb",
    "poster": "/assets/merch/example.webp",
    "src": "/assets/merch-3d/example.glb",
    "cameraOrbit": "0deg 75deg 105%",
    "alt": { "en": "…", "it": "…", "ru": "…" },
    "budget": { "bytes": 2500000, "triangles": 50000 }
  }
}
```

The product page renders the poster and a button first. Only an explicit action imports the locally pinned viewer and fetches the current object. The index never loads models. Runtime state includes loading, progress, ready and recoverable error, announced through `aria-live`. Reset View and concise mouse/touch/keyboard instructions remain available. Vertical page scroll must continue to work.

Asset classes and budgets:

| Class | Products | Delivery budget |
| --- | --- | --- |
| Flat/book-like | poster, stickers, zine, vinyl sleeve | ≤0.8 MB, ≤5k triangles, ≤4 draw calls |
| Rigid/packaging | cassette, CD, USB, collector box, vinyl | ≤2.5 MB, ≤50k triangles, ≤12 draw calls |
| Apparel | T-shirt, hoodie, cap | ≤4 MB, ≤80k triangles, ≤20 draw calls |
| 360 fallback | apparel only when needed | ≤2.5 MB mobile / ≤4 MB desktop, 24/36 frames |

All GLBs must pass Khronos validation without errors. Brand-critical small type is not destructively compressed. Models and decoders are first-party assets; there are no runtime cloud converters or user uploads.

### Proof-of-concept gate

- Cassette proves rigid geometry and exact label registration.
- Hoodie proves the highest-risk cloth silhouette and print fidelity.
- Activation-to-interactive target: ≤2.5 seconds on a mid-range Android/Fast 4G profile.
- Drag target: stable 50–60 fps without long-task spikes or context loss.
- If the hoodie misses silhouette/print fidelity after one correction pass, ship a 360° view until authoritative multi-view/cloth sources exist.

## Information hierarchy

### Header

- Primary: Home, Catalog, Merch, Artists.
- Secondary drawer: Process, About, Press, Download, Contact and language.
- Preserve a visible focus path and semantic links/buttons.

### Player

- Desktop may retain the full timeline and volume control.
- Mobile default: title, Play/Pause and Tracks disclosure only.
- Timeline, previous/next and volume live in the disclosed tray.
- Default volume remains 60%; timeline remains seekable.

### Merch index and detail

- One collection status, not eleven repeated statuses.
- Product cards lead with image, name and category; no redundant “coming soon” label.
- Roadmap becomes a closed “Drop 001 / development logic” disclosure or leaves the primary flow.
- Product detail has one leading action: load interactive view. Gallery/story/specs stay available without it.
- Remove repeated first image from the gallery when it is already the hero.
- Previous/next remain quieter than Back to Drop.

### Footer and 404

- Footer has one Social Access route instead of repeating every social destination.
- 404 uses a lightweight shell with brand, language and Return Home only; no player or decorative HUD.

## Accessibility, resilience and performance

- Visible focus on main content after the skip link.
- `prefers-reduced-motion` disables auto-rotation, inertial prompts and decorative video requests.
- Save-Data, slow connection, WebGL failure, model 404/corruption and JavaScript-off all retain the poster/gallery and product content.
- Images declare intrinsic dimensions; below-fold media are lazy-loaded without layout shifts.
- No `transition: all`; focus/hover/motion states are explicit.
- Runtime 3D and model bytes must not affect index LCP or a product page before activation.

## Test and release gates

1. Unit/manifest tests for apparel registrations, viewer metadata, paths, budgets and motion fallbacks.
2. Mutation tests for shifted/scaled artwork, altered source hash, missing mask and missing viewer fallback.
3. Build and static QA for all locales/routes.
4. Playwright in Chromium and WebKit across desktop/mobile, keyboard, reduced motion, Save-Data and failed-font modes.
5. Visual snapshots for T-shirt/hoodie canonical overlays, merch motion fallback, product viewer poster/ready/error and simplified shells.
6. GLB validation, asset byte budgets and no cross-origin runtime requests.
7. Independent design/UX/code review after each implementation slice.
8. GitHub Pages base-path smoke test and deployed URL smoke test before release is declared complete.
