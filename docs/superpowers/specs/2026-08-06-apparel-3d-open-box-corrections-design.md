# POVKH LAB apparel corrections and 3D completion

## Outcome

Complete the merch catalog without changing the approved POVKH LAB visual language:

- secondary t-shirt and hoodie photographs use the same exact artwork, scale logic, and garment-space registration as each approved hero;
- t-shirt, hoodie, and cap gain useful interactive 3D concept viewers;
- the collector box opens by default and visibly contains the merch set;
- every new 3D asset is honestly labelled as a concept visualization, not a manufacturing reference.

## Global constraints

- Use only governed exact logo masters. Do not generate, retype, redraw, or approximate logo text.
- Blank garment pixels remain source-identical outside the applied artwork by default. The only permitted blank-base retouch is the governed hoodie print-macro v1→v2 repair: its exact changed pixels must stay confined to the declared repair bounds, and the repaired v2 base—not the pre-retouch v1 source—is the byte-preservation authority for final compositing.
- Apparel print artwork remains 300 x 112.5 mm in the design record; perspective views may warp the plane but may not change its aspect or internal layout.
- Secondary photo registration must be reviewed visually against the approved hero, not only by file hashes.
- Garment and cap meshes communicate volume and placement, but do not claim vendor fit, fabric simulation, construction accuracy, or production dimensions.
- Collector box is an open archive-set concept: lid, base, trays/recesses, zine, cassette, CD, data key, vinyl and sticker components must be separately readable.
- Collector box hinge and dimensions remain provisional; no machinability claim.
- All viewers keep poster-first loading, keyboard/accessibility support, mobile cameras, and the existing interaction language.
- No product may retain a `sourceBlocked` viewer once its concept GLB is present.

## Apparel photo correction

The hero files remain the authority:

- `t-shirt-front.webp`
- `hoodie-rear.webp`

The deterministic registration renderer owns the fixes for:

- t-shirt print macro;
- t-shirt on-body;
- hoodie print macro;
- hoodie worn rear.

The master art is placed once per view using a perspective quad. The corrected quads must preserve the hero's perceived centered composition and the exact relative relationship between the ASCII bullet, red rule, and `POVKH_LAB::SIGNAL` line. Visual QA includes a contact sheet that shows hero, detail, and worn view at the same time.

Static-image dimensions and decoded pixel hashes use the pinned native `sharp 0.35.3` / libvips raw-RGBA path. File SHA-256 remains the byte-identity authority. Dry verification re-renders the lossless source/mask bundle and compares it pixel-for-pixel; the already-approved lossy public WebP exports are copied into the temporary verification bundle and checked independently by both byte and decoder-governed pixel hashes. This avoids making verification depend on a platform-specific FFmpeg decoder while leaving the approved WebP files unchanged.

## Apparel and cap 3D

The three missing models are authored locally as lightweight concept meshes:

- t-shirt: relaxed body, sleeves, collar, front and back readability, exact dark artwork on the front;
- hoodie: body, sleeves, rib hem/cuffs, dimensional hood, exact reverse artwork on the back;
- cap: panelled crown, brim, button and rear strap/opening, exact approved patch/mark.

Each GLB stores concept status and source provenance in extras, uses governed textures, opens at a legible three-quarter angle, and stays inside the repository's viewer budgets.

## Collector box 3D

Replace the closed envelope with a default-open presentation matching the approved open gallery image. The scene contains:

- base and lid at an approximately 105-degree open angle;
- bone lid lining with an exact identity panel;
- dark modular tray and red pull tab;
- zine in the upper compartment;
- cassette, CD, data key and vinyl/archive sleeve elements in individual recesses;
- sticker/identity inserts.

The parts are visually faithful concept geometry rather than replicas of manufacturing internals. The immutable approved closed hero remains the poster; after activation, the 3D model defaults open and its cameras frame both lid and contents.

## Acceptance

- Four corrected apparel images are regenerated deterministically and pass source/hash/placement tests.
- T-shirt, hoodie and cap GLBs exist, validate with zero errors, respect asset budgets and are wired into catalog data.
- Collector box opens by default, contains all required named components, validates and passes camera/readability capture.
- Catalog reports 11 GLB viewers and zero blocked apparel viewers.
- Desktop and mobile browser tests show visible, draggable models and no console errors.
- Full `npm test` passes before release.
