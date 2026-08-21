# DROP-001 3D Asset Build Map

**Date:** 2026-08-06
**Status:** Production build specification
**Scope:** All eleven products in `site/data/merch.json`
**Architecture authority:** `docs/superpowers/specs/2026-08-06-povkh-merch-3d-optimization-design.md`

## Decision

DROP-001 uses the approved hybrid progressive-enhancement approach:

- Build deterministic local GLBs for rigid and flat objects from measured or explicitly provisional geometry plus canonical flat artwork.
- Attempt a verified GLB for the hoodie POC only. Release it as a GLB only if the silhouette and print-registration gates in this document pass.
- Use honest 24/36-frame turns of approved physical samples for the tee, cap, and any hoodie that fails the POC. A spin must never be synthesized from the current four-view gallery imagery.
- Keep the first public gallery image as the poster. Load no model or spin frames until explicit activation.
- Preserve alternate configurations, open states, page spreads, connector states, worn views, and macro details in the existing 2D gallery. A GLB is not required to reproduce every gallery image.

The rejected extremes are “GLB everything,” which would invent garment and vendor geometry, and “spin everything,” which would discard the deterministic geometry and exact artwork registration available for rigid products.

## Non-negotiable production rules

1. `@google/model-viewer` is the only browser 3D runtime. Its selected package version must be pinned in the implementation lockfile and self-hosted.
2. `@gltf-transform/*` is the local, offline build, inspection, and optimization toolchain. Its selected versions must be pinned with the runtime. No cloud converter, image-to-3D service, or Hunyuan step is permitted.
3. Source assets, generated intermediates, validators, and decoders must run locally. Do not introduce runtime requests to third-party hosts.
4. GLB coordinates use metres, glTF Y-up, object front toward +Z, a centred rotation pivot, and ground at Y=0. Freeze transforms before export.
5. Brand-critical graphics are rendered deterministically from canonical SVG/raster artwork, governed copy, fonts, and placement records. Never perspective-crop a public concept WebP, ask a generative model to redraw a mark, or retype artwork by eye.
6. Physical dimensions labelled **provisional** are viewer geometry only. They are not manufacturing data and must be replaced from the selected vendor dieline, tech pack, or measured sample before production sign-off.
7. Every GLB must have zero Khronos glTF Validator errors. Use `gltf-transform inspect` and a locally installed validator as build gates.
8. Prefer low-poly authored geometry, `dedup`, `prune`, `weld`, and `quantize`/`KHR_mesh_quantization`. Embed right-sized WebP, PNG, or JPEG textures. Do not add Draco, Meshopt, or KTX2 decoder dependencies unless a later measured performance review explicitly changes the approved architecture.
9. Do not write timestamps or machine-specific paths into asset metadata. Builds from identical inputs must be byte-stable where the toolchain permits it and semantically identical otherwise.
10. Static GLBs contain one approved display state. Do not add hinges, garment animation, page turning, or connector animation solely to mimic the gallery.

## Authority and source notation

The public WebPs in `site/assets/merch/` are composition references and posters, not texture masters. The repository paths below are the canonical build authorities even when the production source tree must first be surfaced from its source branch into the implementation branch.

Short prefixes used below:

- `PM` = `production/physical-merch/concepts/drop-001`
- `LOGO` = `assets/logo`
- `APPAREL_REG` = `site/data/apparel-print-registration-v02.json`
- `APPAREL_FIX` = `site/tools/fixtures/apparel-registration/artwork`

Each per-asset build record must include:

- canonical source path and SHA-256;
- dimension authority and status (`confirmed`, `standard nominal`, or `provisional`);
- primitive/node list and material constants;
- texture crop, colour space, UV bounds, and registration values;
- canonical camera orbit and poster path;
- unoptimized and optimized inspection reports;
- output SHA-256, byte size, triangles, draw calls, validator result, and screenshot-diff result.

Brand palette is Void `#080808`, Bone `#F2EFE7`, Signal Red `#F32222`, and Signal Ink `#B5121B`. Colour-managed conversions must use the canonical artwork profile; do not sample colours from concept renders.

### Expected implementation contract

Use one stable asset key across `site/tools/merch-3d/<asset-key>.source.json`, `site/assets/merch-3d/<asset-key>.glb`, reports, and the future `merch.json` viewer record. The approved POC filenames remain `cassette-002.glb` and `hoodie-001.glb`.

| SKU | Asset key | Output kind |
|---|---|---|
| MRCH-001 | `vinyl-001` | `site/assets/merch-3d/vinyl-001.glb` |
| MRCH-002 | `cassette-002` | `site/assets/merch-3d/cassette-002.glb` |
| MRCH-003 | `disc-004` | `site/assets/merch-3d/disc-004.glb` |
| MRCH-004 | `data-key-003` | `site/assets/merch-3d/data-key-003.glb` |
| MRCH-005 | `t-shirt-001` | `site/assets/merch-360/t-shirt/{mobile,desktop}/frame-NNN.webp` |
| MRCH-006 | `hoodie-001` | GLB at `site/assets/merch-3d/hoodie-001.glb` on POC pass; otherwise `site/assets/merch-360/hoodie/{mobile,desktop}/frame-NNN.webp` |
| MRCH-007 | `cap-field-issue` | `site/assets/merch-360/cap/{mobile,desktop}/frame-NNN.webp` |
| MRCH-008 | `print-001` | `site/assets/merch-3d/print-001.glb` |
| MRCH-009 | `signal-kit-001` | `site/assets/merch-3d/signal-kit-001.glb` |
| MRCH-010 | `zine-001` | `site/assets/merch-3d/zine-001.glb` |
| MRCH-011 | `collector-box-001` | `site/assets/merch-3d/collector-box-001.glb` |

`{mobile,desktop}` above denotes two literal variant directories, not braces in a filename. Spin controls must be labelled “360° view,” not “3D,” and must state that the sequence depicts a photographed approved sample.

## Shared asset kit

Build the following parameterised primitives once and instantiate them in product build scripts. A primitive is reusable code and topology, not a shared mutable scene file.

| ID | Primitive | Used by | Required controls |
|---|---|---|---|
| `P01` | Bevelled box or paperboard shell | cassette case, CD case, USB pack, collector box | XYZ dimensions, wall thickness, bevel radius/segments, lid seam |
| `P02` | Sheet, card, or page block | vinyl sleeve, J-card, inserts, posters, stickers, zine | width, height, thickness, corner radius, fold/spine |
| `P03` | Disc or annulus | vinyl, CD, cassette hubs | outer/inner radius, thickness, groove count, radial UV |
| `P04` | Transparent enclosure | cassette, CD | wall thickness, IOR/transmission or alpha fallback, render-order test |
| `P05` | Mechanical small parts | cassette, USB | screw, spindle, guide roller, pressure pad, slider, connector envelopes |
| `P06` | Insert, cavity, and pull tab | USB pack, collector box | cavity clearance, tray depth, pull-tab anchor |
| `P07` | Registered print/decal surface | all marked products | physical size, anchor, UV rectangle, art SHA-256, no edge bleed unless specified |
| `P08` | Garment print projector | tee, hoodie | measured mesh landmarks, 300 × 112.5 mm print plane, front/rear anchor |

Shared material presets are `MAT_PAPER_BONE`, `MAT_PAPER_VOID`, `MAT_BOARD_VOID`, `MAT_INK_RED`, `MAT_CLEAR_POLYMER`, `MAT_SMOKE_POLYMER`, `MAT_BLACK_TRAY`, `MAT_SILVER_DISC`, `MAT_ANODIZED_BLACK`, `MAT_CONNECTOR_METAL`, `MAT_COTTON_BONE`, `MAT_COTTON_VOID`, and `MAT_WASHED_CAP`. Store numeric PBR constants in source specs; product scripts may override only documented values. Paper and fabric remain high-roughness and non-metallic. Metals use authored roughness, while transparent materials require a render-order and mobile fallback check.

## Release matrix

Budgets are optimized output targets followed by hard ceilings. Camera values map directly to `camera-orbit="theta phi radius"`. A spin has no model orbit; its capture turntable must retain a fixed camera, exposure, crop, and object centre across frames.

| SKU / slug | Release mode | Viewer geometry and dimensions | Target / hard ceiling | Canonical orbit | Risk |
|---|---|---|---|---|---|
| MRCH-001 `vinyl` | GLB | 12-inch record Ø300 × 1.9 mm; outer sleeve 315 × 315 × 4 mm; inner 307 × 307 × 0.5 mm; standard nominal | 1.4 MB, 18k tris, 6 calls / 2.5 MB, 50k, 12 | `20deg 75deg 110%` | Medium: translucent record and microtype |
| MRCH-002 `cassette` | GLB; POC gate | cassette 100.4 × 63.8 × 12.0 mm; Norelco case 109 × 70 × 17 mm; standard nominal | 2.2 MB, 45k tris, 10 calls / 2.5 MB, 50k, 12 | `0deg 75deg 105%` | High: layered transparency and mechanical registration |
| MRCH-003 `cd` | GLB | jewel case 142 × 125 × 10.4 mm; disc Ø120 × 1.2 mm, Ø15 mm hole; standard nominal | 1.8 MB, 35k tris, 10 calls / 2.5 MB, 50k, 12 | `25deg 70deg 110%` | Medium: clear case and reflective clean disc |
| MRCH-004 `usb-edition` | GLB | device 86 × 20 × 9 mm; pack 150 × 65 × 25 mm if later modelled; provisional | 1.2 MB, 18k tris, 7 calls / 2.5 MB, 50k, 12 | `35deg 75deg 120%` | Medium: proprietary slider and unconfirmed vendor dimensions |
| MRCH-005 `t-shirt` | Honest spin | Vendor size-M approved sample; print plane 300 × 112.5 mm; garment dimensions vendor-gated | 24 frames ≤2.3 MB mobile; 36 ≤3.8 MB desktop / 2.5 MB and 4 MB | Fixed capture; no model orbit | High/source-blocked: no authoritative multiview mesh or turntable capture |
| MRCH-006 `hoodie` | GLB only on POC pass; otherwise honest spin | Vendor size-M measured mesh; print plane 300 × 112.5 mm; garment dimensions vendor-gated | GLB 3.5 MB, 70k tris, 12 calls / 4 MB, 80k, 20; spin as tee | `0deg 75deg 110%` if GLB; otherwise fixed capture | High: cloth silhouette, hood occlusion, back-print deformation |
| MRCH-007 `cap` | Honest spin | Vendor one-size approved sample; nominal 580 mm head circumference only for viewer scale | 24 frames ≤2.3 MB mobile; 36 ≤3.8 MB desktop / 2.5 MB and 4 MB | Fixed capture; no model orbit | High/source-blocked: panel/crown fit and patch curvature are vendor-specific |
| MRCH-008 `poster` | GLB | two independent A2 sheets, each 420 × 594 × 0.4 mm; 30 mm display gap; A2 confirmed, thickness nominal | 0.65 MB, 1.5k tris, 4 calls / 0.8 MB, 5k, 4 | `0deg 75deg 115%` | Low: flat geometry; exact complementary artwork |
| MRCH-009 `sticker-pack` | GLB | A5 sheet 148 × 210 × 0.25 mm with layered die-cuts; standard nominal | 0.75 MB, 4k tris, 4 calls / 0.8 MB, 5k, 4 | `0deg 70deg 115%` | Medium: QR decoding, small type, and die-cut boundaries |
| MRCH-010 `zine-booklet` | GLB | A5 closed 148 × 210 × 2.4 mm; 32 pages, saddle stitch; format/page count confirmed, thickness nominal | 0.78 MB, 4.5k tris, 4 calls / 0.8 MB, 5k, 4 | `20deg 70deg 110%` | Medium: page-edge read and deterministic cover build |
| MRCH-011 `collector-box-set` | GLB | A5 two-layer clamshell, viewer box 250 × 315 × 55 mm; provisional | 2.1 MB, 40k tris, 10 calls / 2.5 MB, 50k, 12 | `30deg 65deg 115%` | High: vendor dieline and black-on-black form separation |

## Product build records

### MRCH-001 — Signal Red Vinyl

- **Geometry:** Instantiate `P02` for a closed outer sleeve and black inner sleeve, plus `P03` for a partially exposed 12-inch record. Use shallow bevels and model only silhouette-relevant sleeve thickness. Keep record, label, outer sleeve, and inner sleeve as separately nameable nodes. The display state is fixed; the gallery retains reverse, contents, and macro states.
- **Canonical texture/logo source:** `PM/renders/vinyl/smoke-archive/source/artwork/PVKH_VINYL_OUTER_FRONT_MASTER_v05.svg`, `PVKH_VINYL_OUTER_REVERSE_MASTER_v05.svg`, `PVKH_VINYL_CENTER_LABEL_MASTER_v05.svg`, and the adjacent `master-authorities-v05.json`. Follow its dependency chain to the exact `LOGO` masters rather than substituting concept crops.
- **Material:** Bone uncoated sleeve, Void inner sleeve, smoked translucent Signal Red vinyl with low roughness, subtle authored radial grooves, and printed centre label. Use geometry or a compact normal treatment for grooves; no dense displacement.
- **Registration/QA:** Centre-label rotation and radius must match the flat master. Text and mark edges must remain stable at the default orbit and 2× screenshot scale. Validate transparent edge sorting against the sleeve opening.

### MRCH-002 — Cassette 002

- **Geometry:** Instantiate `P04` for the smoked clear cassette shell and clear Norelco case; `P03` for two hubs; `P05` for exactly five screws, two guide rollers, spindles, pressure pad, and a continuous tape path; and `P02` for the Bone J-card. The cassette is displayed in the open case with parts arranged to match the canonical hero composition without intersections.
- **Dimensions:** Use the standard nominal values in the release matrix for the POC, record their authority, then replace them if the selected cassette and Norelco vendors supply different measured drawings.
- **Canonical texture/logo source:** `PM/renders/archive-objects/cassette-002/placements.json` and its `source/identity/PVKH_ASCII_DARK_EXACT_1600x600_v01.png`, `PVKH_COMPACT_DARK_EXACT_1000x1000_v01.png`, and `PVKH_COMPACT_REVERSE_EXACT_1000x1000_v01.png`. IBM Plex Mono SemiBold and governed copy come from the same source/provenance records.
- **Material:** Smoked transparent shell, clear case, black/brown tape, black hubs and hardware accents, Bone J-card, and exact dark/reverse identity textures. Use a controlled transmission/IOR material only if the local target-browser matrix passes; retain an authored alpha-blend fallback preset.
- **Registration/QA:** This asset must pass the cassette POC gate below before the rigid-product pipeline is accepted.

### MRCH-003 — Disc 004

- **Geometry:** Instantiate `P04` for a full-size closed clear jewel case, `P01` for the black tray, `P02` for the front/rear inserts, and `P03` for a clean disc seated in the hub. The initial state is closed. Open-case and disc-only views remain in the gallery.
- **Canonical texture/logo source:** `PM/renders/archive-objects/disc-004/placements.json` and its `source/identity/PVKH_ASCII_DARK_EXACT_1600x600_v01.png`. The retained compact reverse identity source is unapplied by design; do not invent disc printing.
- **Material:** Clear polystyrene case, matte black tray, Bone paper insert, and neutral reflective silver disc with subtle radial anisotropy. Avoid environment-dependent mirror-black output.
- **Registration/QA:** The disc must remain visually clean, the insert must not float above the case, and the clear lid must not produce render-order halos at the default and rear-three-quarter views.

### MRCH-004 — Data Key 003

- **Geometry:** Instantiate `P01` for the black monolithic body and `P05` for the captive slider plus USB-A and USB-C connector envelopes. Model the device in one neutral closed display state; gallery images preserve the two extended connector states. Do not model packaging until a pack interaction or measured vendor dieline justifies its cost.
- **Dimensions:** The 86 × 20 × 9 mm device is a provisional viewer envelope. Replace the body and slider dimensions from the selected dual-interface mechanism before manufacturing or final GLB approval.
- **Canonical texture/logo source:** `PM/renders/archive-objects/data-key-003/placements.json`, its `source/identity/PVKH_ASCII_DARK_EXACT_1600x600_v01.png`, and `PVKH_COMPACT_REVERSE_EXACT_1000x1000_v01.png`.
- **Material:** Black anodized aluminium body, black polymer slider, brushed connector metal, recessed Bone/Signal identity as governed by placements. Keep connector materials non-reflective enough to read on Void.
- **Registration/QA:** Verify both connector envelopes and slider clearances even though the released GLB is static. Do not imply that the provisional shell is a machinable enclosure.

### MRCH-005 — Bone Source Tee

- **Geometry/capture:** No GLB is authorized from current evidence. Capture an approved vendor size-M physical sample on a fixed turntable: 24 evenly spaced frames for mobile and 36 for desktop, with frame zero matching the gallery front. Retain a clean alpha or a single approved neutral background consistently; never interpolate missing rear or side cloth views.
- **Dimensions:** Use the measured sample and vendor tech pack. The only current physical authority is the 300 × 112.5 mm print master, registered at exactly 480 × 180 px at `(528, 350)` in the 1600 × 900 hero canvas. Overall garment dimensions remain vendor-gated.
- **Canonical texture/logo source:** `APPAREL_FIX/PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png` and the tee record in `APPAREL_REG`.
- **Material:** Warm Bone cotton jersey with measured wash, seam, collar, and hem response. The physical sample—not a procedural shader—is the release authority for the honest spin.
- **Registration/QA:** Reproject the canonical front frame to the registration canvas and require print width, height, and centre each within ±2%. Verify no exposure or crop jumps through the sequence and no duplicate/missing turn angles.

### MRCH-006 — Void Backmark Hoodie

- **Geometry:** For the POC, use a licensed local base mesh or vendor/reference size-M mesh, remodel it to the measured approved silhouette, and keep hood, body, sleeves, cuffs, hem rib, and drawcords as audit-friendly nodes. Do not infer a rear mesh from the current front/rear images or use an image-to-3D service.
- **Dimensions:** The vendor tech pack/measured sample controls overall dimensions. The back print plane is 300 × 112.5 mm, registered at 432 × 162 px at `(552, 365)` in the 1600 × 900 hero canvas.
- **Canonical texture/logo source:** `APPAREL_FIX/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png` and the hoodie record in `APPAREL_REG`.
- **Material:** Washed Void cotton fleece with separate rib materials, plausible fabric-scale normal/roughness, and a Bone reverse print whose glyph shapes are not distorted by baked wrinkle detail. The plain front must remain unmarked.
- **Registration/QA:** Run the hoodie POC gate below. One documented correction pass is allowed. On failure, release only a real-sample honest spin using the tee capture budget and sequence QA.

### MRCH-007 — Field Issue Cap

- **Geometry/capture:** No GLB is authorized from current evidence. Capture an approved one-size physical sample through a full turn, 24 mobile and 36 desktop frames, with front patch, six-panel crown, brim, rear opening, and Signal Red rear flag all visible at their natural angles.
- **Dimensions:** The selected vendor tech pack and measured sample are authoritative. A nominal 580 mm head circumference may normalize viewer scale but must not drive the sewing pattern, crown, or brim geometry.
- **Canonical texture/logo source:** `PM/explorations/ascii-bullet/revised-capsule/cap-field-issue/source/PVKH_COMPACT_DARK_KNOCKOUT_EXACT_1000x1000_v01.png`, its derived SVG, and the adjacent `placements.json`, `provenance.json`, and `selection.json` records.
- **Material:** Washed black cap fabric, structured Bone front patch, matching stitch, metal or polymer closure per sample, and Signal Red rear flag. The sample controls wash and patch curvature.
- **Registration/QA:** Verify equal angular spacing, stable crown silhouette, patch legibility in the canonical front frame, no clipped brim, and no frame-to-frame background, exposure, or crop shift.

### MRCH-008 — Print 001 Diptych

- **Geometry:** Instantiate two independent `P02` A2 sheets, standing side by side with a 30 mm viewer gap and a minimal natural bow no greater than 2 mm. Keep the Bone and Void sheets separate and avoid simulated frames, tape, or wall shadows in the GLB.
- **Canonical texture/logo source:** `PM/renders/archive-objects/print-001/source/flat-art/PVKH_PRINT_001_A_SIGNAL_BONE_FLAT_ARTWORK_v01.png` and `PVKH_PRINT_001_B_VOID_REVERSE_FLAT_ARTWORK_v01.png`.
- **Material:** High-roughness uncoated paper, one Bone/Signal face and one Void/reverse face. Back faces use unprinted stock tones unless production data states otherwise.
- **Registration/QA:** Artwork must fill the intended trim without borrowing perspective or lighting from public poster images. At 2× screenshot scale, sheet edges must remain smooth and both designs must be legible without texture shimmer.

### MRCH-009 — Signal Kit 001

- **Geometry:** Instantiate `P02` for an A5 carrier and shallow raised die-cut islands for the ASCII strip, primary/compact marks, red name strip, and Social Access QR. Preserve the selected-sheet layout. A peeled or separated state belongs only to the gallery.
- **Canonical texture/logo source:** `PM/renders/archive-objects/signal-kit-001/source/artwork/PVKH_SIGNAL_KIT_001_SELECTED_SHEET_MASTER_v06.svg`, `master-authority-v06.json`, and the product-level `placements.json`, including the governed Social Access QR source/metadata and exact `LOGO` dependencies.
- **Material:** Semi-matte Bone sticker stock, light protective finish, minimal adhesive edge, exact Void and Signal inks. Avoid glossy highlights that obscure the QR.
- **Registration/QA:** Rasterize at a resolution that preserves the smallest governed type. The QR extracted from the optimized GLB texture must decode to the governed payload at default orbit and a canonical front screenshot; all die-cut boundaries must remain inside bleed/safe areas.

### MRCH-010 — Zine 001 / Ink Pressure

- **Geometry:** Instantiate a static closed `P02` cover and page block with a shallow spine fold and two visible saddle staples. Use a single efficient page-edge material; do not model 32 individual sheets or page-turn animation. Gallery images preserve internal spreads and binding details.
- **Canonical texture/logo source:** `PM/renders/archive-objects/zine-001/design/povkh-lab-zine-001-grid-spec.md`, `PM/renders/archive-objects/zine-001/provenance.json`, its deterministic renderer inputs, and approved flat artwork sources such as `FRAGMENT_STUDY` and `TRANSMISSION_LOSS`. Rebuild the closed cover from those authorities; do not crop a concept render. If an exact final flat cover master is promoted, record its SHA and replace the generated cover input.
- **Material:** High-roughness black cover stock, neutral page block, governed red/Bone/white inks, and metallic staples with controlled roughness. Preserve the restrained black-on-black cover behaviour without losing the title at the canonical exposure.
- **Registration/QA:** Confirm A5 trim and 32-page copy authority. Front, back, spine, and staple positions must align; internal spread textures are deliberately excluded from the GLB budget.

### MRCH-011 — Collector Box 001

- **Geometry:** Instantiate `P01` for a closed A5 two-layer archive clamshell, its visible lid seam, and the exposed edge of the Signal Red pull tab. Reserve `P06` tray/cavity geometry for a future measured open-state asset. Do not carry invisible interior geometry, working hinges, or duplicate contents in the initial GLB; open, layer, and contents views remain in the gallery.
- **Dimensions:** The 250 × 315 × 55 mm viewer envelope is provisional. `PM/renders/archive-objects/collector-box-001/source/final-contents-geometry-v04.json` is composition evidence only, not a machinable dieline. Final board thickness, hinge, cavity, and clearance require the selected vendor dieline and packed sample.
- **Canonical texture/logo source:** `PM/renders/archive-objects/collector-box-001/provenance-v04.json`, the exact lid identity at `PM/explorations/ascii-bullet/revised-capsule/source/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png`, `LOGO/povkh-lab-ascii-dark-outlined.svg`, `PM/renders/archive-objects/collector-box-001/source/artwork/PVKH_COLLECTOR_BOX_001_ZINE_FLAT_COVER_MASTER_v04.svg`, and the Signal Kit selected-sheet master for governed future contents evidence.
- **Material:** Void paper-wrapped rigid board, Signal Red textile or paper pull-tab edge, and exact lid identity. Use bevel highlights sparingly so Void surfaces retain form. A later open-state asset adds the matte insert/tray and governed contents materials from their own build records.
- **Registration/QA:** Validate lid/box clearance and zero intersections even though the release state is closed. Any later open-state GLB is a separate asset and must independently remain within the rigid-object ceiling.

## Cassette POC: rigid-object go/no-go

The cassette POC accepts the shared rigid pipeline only when every gate passes. Correct once, rebuild from source, and rerun the full gate; do not waive a failed criterion in the optimized asset.

| Gate | Go tolerance |
|---|---|
| Dimensional authority | Shell and case dimension error ≤0.5 mm or ≤1%, whichever is larger, against the chosen standard/vendor drawing; J-card and cassette fit without collision |
| Canonical silhouette | Projected silhouette/keypoint deviation ≤1.5% of object bounding-box dimension in canonical front and three-quarter screenshots |
| Mechanical landmarks | Hub, roller, and screw centres each within 1% of projected bounding-box dimension |
| Required parts | Exactly five screws, two hubs, two guide rollers, one pressure pad, continuous tape path, and the characteristic empty window between hubs |
| Artwork registration | J-card and shell artwork width, height, and centre each within ±1% of declared target surface; source hashes match the build record |
| Identity fidelity | No retyped, warped, clipped, softened, or perspective-derived governed type/logo; microtype remains legible at the review crop |
| Rendering integrity | No z-fighting, detached parts, backface leaks, incorrect transparency order, or opaque halos in the canonical browser matrix |
| Optimized budget | Target ≤2.2 MB, ≤45k triangles, ≤10 draw calls; hard stop at 2.5 MB, 50k, or 12 calls |
| Validation/performance | Khronos validator zero errors; activation-to-interactive ≤2.5 s on the agreed mid-range Android/Fast 4G profile; stable 50–60 fps drag without long-task spikes or context loss |

Any failed mechanical, identity, validation, hard-budget, or performance invariant after the correction pass is **no-go**. Keep the poster/gallery interaction for the cassette until the local GLB is rebuilt; do not substitute a synthetic spin.

## Hoodie POC: apparel go/no-go

The hoodie POC may ship as a GLB only when every gate passes using an authoritative or measured mesh. The canonical comparisons are rear, rear three-quarter, and front.

| Gate | Go tolerance |
|---|---|
| Source authority | Vendor/reference mesh or licensed local base remodelled to a measured approved sample; source/licence recorded; no cloud or image-to-3D inference |
| Silhouette | Intersection-over-union ≥0.95 against each canonical mask |
| Landmarks | Shoulder tips, cuffs, hem corners, hood apex, and neck opening each deviate ≤2% of garment bounding-box dimension |
| Mesh integrity | Plausible thickness and folds; no non-manifold release geometry, self-intersections visible in canonical views, collapsed cuffs, or impossible hood/body penetration |
| Artwork authority | Exact reverse master SHA-256 recorded; print plane exactly 300 × 112.5 mm before cloth projection |
| Print registration | Reprojected print width, height, and centre each within ±2% of the approved 1600 × 900 hero placement `(552, 365, 432, 162)` |
| Print fidelity | No glyph redrawing, clipping, seam crossing, unintended hood occlusion, or fold treatment that changes character identity |
| Optimized budget | Target ≤3.5 MB, ≤70k triangles, ≤12 draw calls; hard stop at 4 MB, 80k, or 20 calls |
| Validation/performance | Khronos validator zero errors; activation-to-interactive ≤2.5 s on the agreed mid-range Android/Fast 4G profile; stable 50–60 fps drag |

One documented correction pass is allowed. Any silhouette, landmark, print, source, validator, hard-budget, or performance failure after that pass is **no-go for GLB**. The fallback is a real approved-sample 360° capture at 24 mobile/36 desktop frames and the spin budgets in the release matrix. The four existing gallery views are not sufficient spin input.

## Deterministic local build pipeline

For each GLB, implement a product-local build spec consumed by one pinned local build command:

1. Verify the declared source paths and SHA-256 values before geometry generation.
2. Generate procedural primitives in metres with the glTF-Transform `Document` API and stable node/material names; only the governed hoodie source may enter as a locally authored mesh. Record confirmed versus nominal/provisional dimensions in asset extras or the adjacent source spec, not as an unqualified claim.
3. Render brand textures from canonical flat authorities in a colour-managed local step. Use power-of-two dimensions only when measured output shows a benefit; choose resolution from legibility and byte budget, not convention.
4. Assemble the single approved static display state and freeze transforms.
5. Run glTF-Transform `dedup`, `prune`, appropriate `weld`, and quantization. Do not weld intentional seams, transparent layers, UV borders, or garment print boundaries.
6. Produce `inspect` reports before and after optimization, then run the local Khronos validator.
7. Capture canonical desktop and mobile screenshots through the self-hosted `model-viewer` test harness. Compare silhouettes, landmarks, identity, registration, transparency, and exposure against the acceptance records.
8. Test explicit activation from the real poster, network throttling, drag performance, keyboard/touch interaction, reduced motion, fallback, and WebGL/context-loss behaviour.
9. Emit the optimized GLB, deterministic build manifest, reports, screenshots, and hashes. Only the reviewed optimized GLB enters the public asset tree.

Spin production uses the same source discipline: approved physical sample, locked turntable centre and angle list, fixed camera/lens/exposure/white balance/background, deterministic image processing, duplicate-frame detection, and a manifest mapping frame number to angle, dimensions, byte size, and SHA-256.

## Release QA and stop conditions

Every product release requires:

- correct SKU/slug, canonical poster, accessible label, and explicit activation behaviour;
- no viewer/spin download on initial gallery load;
- zero network calls to third-party model, texture, decoder, or conversion services;
- the optimized budget and relevant hard ceiling in the release matrix;
- exact source hashes, validator result, texture/registration checks, canonical screenshot approvals, and browser/device results in the build manifest;
- a working static-gallery fallback for JavaScript failure, unsupported WebGL, data-saver policy, and asset error;
- no invented vendor certainty: provisional dimensions remain labelled and block manufacturing sign-off;
- no replacement of existing 2D detail views unless a separate content decision explicitly approves it.

Stop the release for a missing canonical source, unknown artwork payload, validator error, failed identity/QR/registration check, hard-budget breach, inaccessible interaction, or undocumented vendor dimension. Visual resemblance alone is not acceptance.

## Build sequence

1. Build the shared primitive/material kit and cassette POC. Accept the rigid-object pipeline only on cassette go.
2. In parallel with source procurement, run the hoodie POC. Choose verified GLB or honest spin immediately after its single correction pass.
3. Build the lowest-risk GLBs: poster, zine, sticker pack.
4. Build remaining standard rigid GLBs: vinyl and CD.
5. Build the vendor-gated USB and collector-box GLBs after their dimension evidence is recorded; until then, their current posters remain the production fallback.
6. Capture tee and cap honest spins from approved samples; capture hoodie only if its GLB is no-go.
7. Run integrated activation, fallback, accessibility, network, budget, and performance QA for all eleven product pages before enabling the feature flag.

This sequence does not make vendor-gated objects appear dimensionally final. It makes their uncertainty explicit while allowing the local viewer architecture, canonical artwork pipeline, and release gates to be implemented once and reused.
