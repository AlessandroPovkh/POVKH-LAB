# Terminal Relic Concept Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one review-only concept board for POVKH LAB Terminal Relic so the user can judge the direction before approving or rejecting it.

**Architecture:** Keep the supplied ornament as an untouched local source, then present it through a single self-contained HTML concept board. CSS masks recolor the source without modifying its geometry; local brand fonts and existing color tokens provide the wordmark and terminal hierarchy. A browser screenshot becomes the review PNG while the current production logo system remains untouched.

**Tech Stack:** HTML/CSS, source SVG, local Barlow Condensed and IBM Plex Mono fonts, Playwright screenshot, `xmllint`.

## Global Constraints

- Status remains `WIP concept for review`; it is not an approved production master.
- Do not modify `assets/logo/`, `site/`, templates or any downstream consumer.
- Use only Void `#080808`, Bone `#F2EFE7` and Signal Red `#F32222`.
- Use Barlow Condensed for `POVKH LAB` and IBM Plex Mono for terminal metadata.
- No crosshairs, reticles, targets, scope graphics, aiming brackets, glow, chrome, bevel, 3D or neon gradients.
- HUD character comes from truthful labels, indexes, alignment, spacing and status syntax.
- The board must show a full lockup, compact mark, ASCII signature and small-scale monochrome test.

---

### Task 1: Build and render the WIP concept board

**Files:**
- Create: `logo-concepts/terminal-relic/source/ornament-original.svg`
- Create: `logo-concepts/terminal-relic/terminal-relic-concept-board.html`
- Create: `logo-concepts/terminal-relic/terminal-relic-concept-board.png`

**Interfaces:**
- Consumes: `/Users/alessandropovkh/Downloads/❧.svg`, `assets/fonts/BarlowCondensed-Black.ttf`, `assets/fonts/IBMPlexMono-Regular.ttf`, `assets/fonts/IBMPlexMono-SemiBold.ttf`
- Produces: one editable review board and one 2400×1600 PNG preview; no production master or public export

- [ ] **Step 1: Preserve the supplied ornament as the concept source**

Copy `/Users/alessandropovkh/Downloads/❧.svg` byte-for-byte to `logo-concepts/terminal-relic/source/ornament-original.svg`. Keep its `2199×1257` viewBox and single black path unchanged.

- [ ] **Step 2: Create the review board**

Create `terminal-relic-concept-board.html` as a fixed `2400×1600` canvas with:

- a narrow header containing `POVKH_LAB // CONCEPT_01`, `TERMINAL RELIC`, and `STATUS: WIP / NOT MASTER`;
- a 6 px Signal Red separator;
- a dominant full-lockup panel pairing the Bone ornament with `POVKH LAB` and the factual metadata `SOURCE: ❧.SVG`, `MODE: VECTOR`, `SYSTEM: POVKH_LAB`;
- a compact-mark panel showing the unframed ornament on Void;
- an ASCII panel where repeated characters `01 / \\ _ : ; < >` are clipped by the ornament silhouette and labeled `POVKH_LAB::SIGNAL`;
- a small-size panel showing the solid monochrome mark at 24, 32, 48 and 96 px;
- generous negative space, straight rules and indexed labels, with no targeting graphics.

Load fonts from `../../assets/fonts/` with `@font-face`. Recolor the source SVG with CSS `mask-image` and `-webkit-mask-image`; do not rewrite its path data.

- [ ] **Step 3: Validate source structure**

Run:

```bash
xmllint --noout logo-concepts/terminal-relic/source/ornament-original.svg
rg -n "crosshair|reticle|target|scope|glow|gradient" logo-concepts/terminal-relic
```

Expected: `xmllint` exits 0; the forbidden-term search returns no matches in concept assets.

- [ ] **Step 4: Render the review PNG**

Run Playwright against the local HTML at a `2400×1600` viewport and write `logo-concepts/terminal-relic/terminal-relic-concept-board.png` with no browser chrome.

Expected: PNG dimensions are exactly `2400×1600`; local fonts are loaded before capture.

- [ ] **Step 5: Review at full and reduced size**

Check the PNG visually at original size and at a 1200 px wide preview. Confirm that:

- `POVKH LAB` reads immediately;
- the ornament remains recognizable;
- the ASCII treatment is visibly distinct from the solid mark;
- the small-size row exposes rather than hides legibility limits;
- no element resembles a reticle or targeting interface;
- WIP status is visible.

- [ ] **Step 6: Verify repository scope**

Run:

```bash
git status --short -- logo-concepts/terminal-relic assets/logo site templates
```

Expected: only `logo-concepts/terminal-relic/` contains new files; existing identity consumers remain unchanged.

- [ ] **Step 7: Commit the review artifact**

```bash
git add logo-concepts/terminal-relic
git commit -m "Add Terminal Relic logo concept board"
```

Expected: one isolated commit containing the source ornament, HTML board and PNG preview.
