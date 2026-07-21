# Terminal Relic Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote Terminal Relic from an approved concept into the governed POVKH LAB logo system, update the brand book and website, and deploy the verified result to GitHub Pages.

**Architecture:** Preserve the approved filenames consumed by the site while replacing their SVG geometry through the deterministic logo generator. Add a separate outlined ASCII signature as an optional large-format asset, update normative documentation and the generated brand-board PDF, then copy only approved masters into the site. Publish from a clean branch based on `origin/main`, merge only scoped changes, manually dispatch the protected Pages production workflow, and verify the live artifact.

**Tech Stack:** Python 3 + fontTools, SVG, HTML/CSS, Node.js 22, Playwright 1.61.1, Git, GitHub CLI, GitHub Actions/Pages.

## Global Constraints

- Terminal Relic is the approved master direction; Concept 02 / Typographic Monolith becomes process archive.
- The supplied ornament geometry remains byte-identical in `logo-concepts/terminal-relic/source/ornament-original.svg`.
- Use only Void `#080808`, Bone `#F2EFE7`, Signal Red `#F32222`, Signal Ink `#B5121B`, and Steel `#8F918F` according to existing roles.
- Use Barlow Condensed for the display name and IBM Plex Mono for ASCII/system typography; production SVG lettering must be outlined.
- Keep the existing public asset filenames for primary, horizontal, compact, reverse, dark and monochrome variants so downstream routes remain stable.
- No crosshairs, reticles, targets, scope graphics, aiming brackets, glow, chrome, bevel, 3D or neon gradients inside logo assets.
- Keep editable sources, production masters, derived exports and archived concepts visibly separate.
- Do not stage unrelated untracked files, audio, campaign, media, dashboard or social export directories.
- Production deployment is authorized by the user, but only after local source, artifact, site and browser checks pass.

---

### Task 1: Promote Terminal Relic and generate production logo masters

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-povkh-lab-terminal-relic-logo-design.md`
- Create: `logo-concepts/terminal-relic/APPROVAL.md`
- Modify: `tools/build_logo_outlines.py`
- Modify: `tools/artifact_spec.mjs`
- Modify: `tools/qa_brand_package.mjs`
- Create/replace: `assets/logo/povkh-lab-*-outlined.svg`
- Create: `assets/logo/povkh-lab-ascii-dark-outlined.svg`
- Create: `assets/logo/povkh-lab-ascii-reverse-transparent-outlined.svg`

**Interfaces:**
- Consumes: approved ornament path, Barlow Condensed Black, IBM Plex Mono SemiBold, current `LOGO_MASTERS` filename and dimension contract
- Produces: deterministic 1000×1000 stacked/compact masters, 1600×400 horizontal masters, and 1600×600 ASCII signature masters

- [ ] Mark the concept spec `approved master direction` with the approval date and record that the user approved rollout to the brand book, website and GitHub Pages.
- [ ] Update `build_logo_outlines.py` so the existing 13 public filenames render Terminal Relic compositions: ornament + signal rule + outlined POVKH LAB for primary/horizontal variants, and the unframed ornament for compact variants.
- [ ] Add dark and reverse outlined ASCII signature variants using outlined IBM Plex Mono rows clipped by the ornament plus the exact identifier `POVKH_LAB::SIGNAL`.
- [ ] Add the two ASCII assets to `LOGO_MASTERS` and one derived 3200×1200 PNG to `RASTER_EXPORTS`; allow only self-contained `clip-path="url(#terminal-relic-clip)"` in those two masters.
- [ ] Run `python3 tools/build_logo_outlines.py`, then `python3 tools/build_logo_outlines.py --check`.
- [ ] Run XML, no-runtime-text, intrinsic-dimension, transparent-background and small-size render checks for all masters.
- [ ] Commit the approval record, generator, validator and production SVG masters as one scoped commit.

### Task 2: Update the normative brand book and generated reference artifacts

**Files:**
- Create/modify: `BRAND-GUIDE-RU.md`
- Create/modify: `brand-board.html`
- Create/modify: `HANDOFF-MANUAL-RU.md`
- Create/modify: `assets/fonts/*`
- Create/modify: `templates/*.svg`
- Modify: `exports/POVKH-LAB-Brand-Board-v1.0.pdf`
- Create/modify: `exports/POVKH-LAB-Brand-Board-v1.0.png`
- Create/modify: `exports/POVKHLAB_*.png`
- Create/modify: `exports/board-pages/*.png`
- Create/modify: `exports/export-manifest.json`

**Interfaces:**
- Consumes: Task 1 masters and existing approved brand tokens/templates
- Produces: current normative guide, visual board, downloadable PDF and derived raster exports while preserving `exports/social/`

- [ ] Replace Typographic Monolith master references with Terminal Relic in the guide, rewrite logo meaning/hierarchy/safe-area rules, document the ASCII signature as secondary, and retain Concept 02 as archive.
- [ ] Update the brand board hero, variant gallery, construction copy, alt text and production notes to show Terminal Relic with no targeting vocabulary.
- [ ] Update the handoff manual so contributors use the new master hierarchy and generator.
- [ ] Export to an isolated staging directory, run `npm --prefix tools run qa -- --exports-dir <stage>`, and copy only the validated generated files into canonical `exports/`; do not remove or overwrite `exports/social/`.
- [ ] Verify the PDF has 12 pages, the overview and raster dimensions match `artifact_spec.mjs`, and the manifest fingerprint matches the current sources.
- [ ] Commit only the normative guide, board source, required fonts/licenses/templates, generated artifacts and export tooling.

### Task 3: Replace the site identity and verify the static product

**Files:**
- Modify: `site/assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg`
- Modify: `site/assets/logo/povkh-lab-horizontal-dark-outlined.svg`
- Modify: `site/assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg`
- Modify: `site/assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg`
- Create: `site/assets/logo/povkh-lab-ascii-reverse-transparent-outlined.svg`
- Modify: `site/assets/og/povkh-lab-og.png`
- Modify: `site/src/pages.mjs`
- Modify: `site/src/i18n.mjs`
- Modify: `site/tools/check.mjs`
- Modify: `site/tools/qa.mjs`

**Interfaces:**
- Consumes: Task 1 production masters and Task 2 canonical PDF
- Produces: unchanged public routes using Terminal Relic in header, favicon, footer and press downloads; regenerated OpenGraph plate

- [ ] Copy the approved horizontal, compact, primary and ASCII masters into `site/assets/logo/` without changing existing public filenames.
- [ ] Add the ASCII master as the fifth press download and update EN/IT/RU press copy to brand system v2.0 and `Downloads / 05`.
- [ ] Extend static and browser QA to require the ASCII press asset and continue rejecting text, image and external runtime dependencies in every public logo.
- [ ] Run `npm --prefix site run og`, then `npm --prefix site test`.
- [ ] Inspect home, press and one localized route at desktop and mobile widths; verify header/footer marks, favicon path, press downloads, keyboard navigation, reduced motion and no browser errors.
- [ ] Commit only the site identity, copy, tests and regenerated OG image.

### Task 4: Publish the scoped rollout and deploy GitHub Pages

**Files:**
- Publish branch: `agent/terminal-relic-rollout`
- Target repository: `AlessandroPovkh/POVKH-LAB`
- Target branch: `main`
- Workflow: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: three verified rollout commits
- Produces: merged `main`, successful production Pages deployment, live Terminal Relic site

- [ ] Run `git status -sb`, inspect the complete branch diff against `origin/main`, and verify no unrelated untracked files are staged.
- [ ] Push `agent/terminal-relic-rollout` with tracking and create a scoped GitHub pull request targeting `main`.
- [ ] Merge the pull request only after local checks and repository merge requirements pass.
- [ ] Dispatch `pages.yml` with `deploy_production=true` and monitor the workflow to completion.
- [ ] Verify `https://alessandropovkh.github.io/POVKH-LAB/` returns HTTPS 200 and that the live header logo plus press ASCII asset match the committed SVG hashes.
- [ ] Report commit/PR/workflow/Page URLs, validation evidence and the unrelated local files deliberately excluded from publication.
