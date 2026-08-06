# SDD Progress — POVKH Merch / 3D Optimization

| Task | Implementation | Spec review | Quality review | Status |
| --- | --- | --- | --- | --- |
| 1. Governance tests | tests-only RED | passed after fixes | passed after fixes | completed / intentional RED |
| 2. Apparel registration | implemented / tests green | passed | passed after hardening | completed |
| 3. PHYSICAL motion | implemented / tests green | passed | passed after hardening | completed |
| 4. 3D runtime | implemented / tests green | passed | passed after hardening | completed |
| 5. Cassette + hoodie POC | cassette complete; hoodie intentionally blocked | passed | passed | completed |
| 6. All product viewers | eight evidence-backed GLBs / tests green | passed | passed after hardening | completed |
| 7. Interface hierarchy | implemented / tests green | passed | passed | completed |
| 8. Full verification | clean immutable checkout green | passed | final release audit in progress | in progress |
| 9. Release | — | — | — | pending |

## Shared constraints

- Worktree: `.worktrees/merch-3d-optimization`
- Branch: `agent/merch-3d-optimization`
- Canonical design: `docs/superpowers/specs/2026-08-06-povkh-merch-3d-optimization-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-06-povkh-merch-3d-optimization-plan.md`
- Never modify the shared dirty `data-key-003` worktree; source reads only.
- Exact brand artwork only; no generated/retyped logos or microtype.
- Do not mark a task complete until tests and both reviews pass.

## Task 1 RED evidence

- `npm run test:merch-registration` — expected failure until the governed v2 registration file and exact apparel source packet exist.
- `npm run test:merch-viewer-contract` — expected failure until every DROP 001 object declares poster-first viewer metadata.
- `npm run test:interface-hierarchy` — expected failure until the four-route primary navigation, progressive Menu / Index, single Social Access footer route, single status hierarchy and lightweight 404 are implemented.
- This is a tests-only checkpoint. Task 1 remains unreviewed and no production behavior has been changed.
- Spec review found six gaps; source-byte/dimension checks, independent homography math, spin budgets, exact navigation destinations, all-page footer coverage and exact 404 action coverage were added.
- Quality review added byte/dimension verification for every registration asset/output, pixel-level artwork-vs-garment masks, locked apparel surfaces/quads, all-route header/Menu coverage and an exact five-action lightweight 404 shell.

## Task 2 implementation evidence

- Copied only the two locked 1600×600 artwork masters and four 1536×1024 blank apparel bases into the governed registration fixture; all six source SHA-256 values match the read-only authority.
- `npm run assets:apparel-registration` stages and validates all four source PNGs, eight masks, four q88 metadata-stripped public WebPs and the JSON registration before backup-backed atomic publication.
- `--verify` now performs a real dry rerender and compares decoded RGBA pixel hashes for all PNGs, masks and regenerated q88 WebPs; encoded-byte reproducibility is explicitly not claimed across toolchains.
- Provenance records the actual Playwright, Chromium and ffmpeg fingerprints used for the governed bundle.
- A second complete render plus dry verification passed without changing any governed image bytes.
- `npm run test:merch-registration` — passed 7/7, including stale-pixel rejection and injected rename-failure rollback.
- `npm run test:merch-assets` — passed 2/2.
- `npm run test:merch-pages` — passed 1/1.
- `npm run test:merch` — passed 10/10.
- Full-resolution WebPs and 375×250 mobile presentations were inspected; all four retain the exact raster artwork and fabric modulation inside the locked quads.

## Task 3 implementation evidence

- Added a dedicated three-second PHYSICAL `scan → register → materialise → hold` family in desktop/mobile WebM and MP4, with one live page H1 and an exact compact bullet mark inside the mobile safe area.
- Reused the shared lazy motion loader; reduced-motion and Save-Data browser gates prove zero decorative motion requests.
- The renderer hashes every transitive input (exact logo, both fonts, HTML/CSS/JS and renderer) and records enforced Playwright, Chromium and ffmpeg pins/fingerprints.
- Every encoded delivery passes both global normalized seam MAE ≤0.0025 and pixel-local max-channel delta ≤8/255, as well as codec, duration, frame-rate and silence probes.
- Motion contracts passed 4/4; build and 153-page static QA passed; the prior full browser matrix passed 1050 viewport, 450 fallback-font and 300 axe checks in Chromium/WebKit.
- Independent review passed after provenance and localized seam gates were hardened.

## Tasks 4–7 implementation evidence

- Self-hosted pinned `@google/model-viewer` 4.3.1 ships poster-first: no runtime, model or decoder request occurs before explicit activation; reduced-motion and Save-Data retain the lightweight poster path.
- Eight products have deterministic, locally built GLBs with governed source identity, physical dimensions, camera contracts and validator evidence: vinyl, cassette, CD, data key, poster, sticker pack, zine and collector box.
- Tee, hoodie and cap remain deliberately `sourceBlocked` until a physical sample scan or vendor mesh is available; the site does not imply a fake garment 3D experience.
- The cassette proof of concept passed model, runtime, camera and browser checks. The same evidence gates were then applied to the seven remaining supported objects.
- The CD was reduced from 1,270,180 bytes / 12,442 triangles to 523,660 bytes / 2,842 triangles while retaining its 120 mm body, 15 mm centre hole and deterministic identity. The recorded visual comparison has worst SSIM 0.998926 and RMSE 0.956/255.
- Primary navigation is now Home / Catalog / Merch / Artists; Menu / Index is progressive disclosure. The player keeps 60% default volume and timeline seeking, while Social Access and page status are no longer duplicated.
- Runtime, camera, catalog browser, model governance, deterministic builds and hierarchy tests all pass. The independent model-performance reviewer reported no remaining findings.

## Task 8 verification evidence

- A second immutable checkout created from `git archive HEAD` passed `npm ci` with 45 packages and zero vulnerabilities, then passed the complete `npm test` matrix.
- The clean run covered 11 merch contracts, asset/page/social/registration/motion/viewer/runtime/camera/browser/model/hierarchy suites, 38 deterministic model checks, a 342-file build and 153-page static validation.
- Full QA covered 1,050 route/viewport cases, 450 failed-font typography cases, 300 axe checks, three languages, Chromium and WebKit, keyboard/touch/no-JS, audio/video ranges, reduced motion, Save-Data, print, redirects, localized 404s and security headers.
- A production build with the GitHub Pages base path `/POVKH-LAB` passed both static checking and 9,039 local-reference checks across 153 pages.
- The opt-in emulated mobile benchmark passed all four governed scenarios with zero context losses and no third-party or eager 3D requests. It remains explicitly non-substitutive for physical Android validation.
- Deferred release-quality evidence is limited to physical Android measurements and real garment geometry; neither is represented as complete.
