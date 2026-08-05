# SDD Progress — POVKH Merch / 3D Optimization

| Task | Implementation | Spec review | Quality review | Status |
| --- | --- | --- | --- | --- |
| 1. Governance tests | tests-only RED | gaps fixed | important gaps fixed | red / final review pending |
| 2. Apparel registration | — | — | — | pending |
| 3. PHYSICAL motion | — | — | — | pending |
| 4. 3D runtime | — | — | — | pending |
| 5. Cassette + hoodie POC | — | — | — | pending |
| 6. All product viewers | — | — | — | pending |
| 7. Interface hierarchy | — | — | — | pending |
| 8. Full verification | — | — | — | pending |
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
