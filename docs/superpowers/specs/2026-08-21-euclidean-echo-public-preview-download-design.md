# Euclidean Echo Public Preview Download Design

**Date:** 2026-08-21  
**Status:** Approved concept; implementation pending written-spec review

## Goal

Publish the existing Euclidean Echo 0.1.0 installers on the localized POVKH LAB
`/download/` page, invite public testing and feedback, and state the current
validation and signing limitations without implying certification or production
readiness.

## Product status

The public maturity label is `PUBLIC PREVIEW / NOT CERTIFIED` (localized in
English, Italian and Russian). Do not call the release stable, certified, or
fully validated.

The product card must disclose that:

- real-DAW and external plugin-host validation is not yet complete;
- the macOS packages are ad-hoc signed but are not Apple Developer ID signed or
  notarized;
- users should test the software at their own discretion and report problems.

The tone should remain direct and welcoming. The Russian invitation is:
“Тестируйте на здоровье — и пишите, что работает, что ломается и чего не
хватает.” English and Italian should preserve the meaning rather than translate
it mechanically.

## Page structure

Keep `/download/` as the plugin page. Replace the first classified module card
with a public Euclidean Echo product card while preserving the other two locked
module cards.

The Euclidean Echo card contains:

1. product index and preview-status badge;
2. the approved current-interface screenshot from the plugin project;
3. product name, version `0.1.0`, and a concise description of the synchronized
   Euclidean multi-tap delay;
4. supported deliverables: VST3 and standalone on Windows; VST3, AU and
   standalone on macOS;
5. three explicit download controls:
   - macOS / Apple Silicon;
   - macOS / Intel;
   - Windows / x64;
6. the signing, notarization and host-validation warning;
7. a feedback mail link to the configured `CONTACT_EMAIL`, with a localized
   subject identifying Euclidean Echo Preview Feedback;
8. a link to a SHA-256 checksum manifest.

The page introduction, metadata and footer must be revised in all three locales
so they no longer claim that every plugin name and download is sealed. They
should state that one public preview is available and two modules remain under
lock.

## Assets and downloads

Use the prepared release artifacts from
`/Users/alessandropovkh/Desktop/Plugin Euclidean Echo/dist/installers/`:

- `Euclidean_Echo_0.1.0_macOS_AppleSilicon.pkg`;
- `Euclidean_Echo_0.1.0_macOS_Intel.pkg`;
- `Euclidean_Echo_0.1.0_Windows_x64_Setup.exe`.

Copy immutable release files into a versioned public directory beneath
`site/assets/downloads/euclidean-echo/0.1.0/`. Use the current 900×560 interface
render from `/Users/alessandropovkh/Desktop/Plugin Euclidean Echo/ui_preview_900x560.png`
as a local optimized web asset; do not link to the external project path at
runtime.

Generate a plain-text `SHA256SUMS` file from the exact copied installer bytes.
The website build must copy these files without transformation. Installer links
must use local, base-path-aware URLs and descriptive accessible names.

Do not modify the Euclidean Echo source project or its currently modified
`README.md`.

## Responsive and accessible behavior

The product card remains readable at all existing site breakpoints. Download
controls may wrap vertically on narrow screens, but their platform and
architecture labels must remain visible. The screenshot uses meaningful alt
text in every locale. Warning text is normal document content, not tooltip-only
content. Keyboard focus and contrast follow the existing button system.

## Verification

Add focused automated coverage before implementation for:

- localized Euclidean Echo name, version, preview status and warning copy;
- all three download links and their exact local targets;
- feedback mail link using the configured contact address;
- preservation of the two locked module cards;
- source-to-public installer byte equality;
- SHA-256 manifest correctness;
- absence of unsupported certification, notarization or stable-release claims.

Then run the relevant focused tests, the full site test suite, and browser QA.
Visually inspect `/download/`, `/it/download/` and `/ru/download/` on desktop and
mobile. Verify every downloadable file exists in the generated output and that
its hash matches the published manifest.

## Out of scope

- A separate Euclidean Echo detail page.
- Payment, licensing, accounts, telemetry or automatic update infrastructure.
- Code signing, Apple notarization or DAW certification work.
- Changes to the plugin binaries or source code.
- Publication of the two remaining classified modules.
