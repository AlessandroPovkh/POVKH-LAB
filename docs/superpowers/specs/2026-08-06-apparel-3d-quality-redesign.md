# Apparel 3D Quality Redesign

## Objective

Replace the WIP apparel concept models' flat or generic procedural reads with credible, release-quality concept geometry while preserving exact governed artwork, concept-only truth boundaries, deterministic builds, existing budgets, lazy activation, and the expanded real mobile inspection stage.

## Chosen approach

Use controlled procedural tailoring rather than third-party donor meshes or further flat-silhouette overlays. Each garment remains a deterministic, source-governed concept asset. The body, sleeves, hood, and trims are modeled as shaped surfaces with explicit transitions and openings; the cap retains its six-panel construction and true rear aperture while gaining seam, crease, eyelet, bill, and patch integration cues.

### T-shirt

- Build a relaxed torso with dense front/back drape, meaningful depth, a shoulder drop, tapered side seams, and a level curved hem.
- Add tapered sleeve volumes with open cuff rims and explicit shoulder bridge patches so sleeves read as attached cloth rather than bat wings or floating tubes.
- Preserve a visible collar opening and dimensional rib.
- Keep the exact artwork at the governed 300 × 112.5 mm surface and its approved placement.

### Hoodie

- Build a shaped body, angled sleeve volumes, attached cuffs, and a conforming waistband with softer transitions.
- Replace the halo hood with two side panels plus a rear/neck drape, open teardrop face cavity, throat overlap, neckline bridge, and rear centre seam.
- Keep the exact rear artwork at the governed 300 × 112.5 mm surface and its approved placement.

### Cap

- Retain six individually readable crown panels and remove crown geometry at the rear aperture.
- Add tonal panel seams, restrained creases, eyelets, a crown-to-bill transition, a doubly curved bill with edge-stitching cues, and a more conforming patch.
- Keep one lower-third adjustment strap and a small keeper; no opaque aperture card or visible internal fragments.

### Materials and lighting

- Preserve continuous garment-space UVs on large cloth surfaces.
- Use deterministic woven/washed normal and roughness textures at subtle strength.
- Raise black fabric values and soften viewer lighting enough to reveal construction without leaving the site's dark visual system.

## Contracts and tests

- Exact artwork hashes, texture provenance, dimensions, transparency, and concept/non-manufacturing disclosures remain unchanged.
- Geometry tests require shaped depth, shoulder attachment/bridge evidence, cuff and collar openings, a real hood cavity, a real cap aperture, and expected detail nodes within existing budgets.
- Builders must be byte-deterministic and glTF-validator clean with no warnings.
- Browser QA regenerates isolated desktop/mobile evidence, the actual built 390 px product page before and after activation, a hoodie front-cavity view, and a cap rear-aperture view.
- Original-size captures are reviewed for silhouette, edge artifacts, art legibility, crushed blacks, moiré, and internal fragments before the final test pass.

## Out of scope

- Manufacturing dimensions, vendor fit, production construction accuracy, cloth simulation, rigging, animation, or changing the approved artwork.
- Third-party base meshes, because research did not identify a cleaner premium source with lower licensing and topology risk.
