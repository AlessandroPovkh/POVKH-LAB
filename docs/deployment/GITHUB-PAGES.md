# GitHub Pages release — 2026-10-11

Target: https://alessandropovkh.github.io/POVKH-LAB/ (Russian homepage: /ru/).
User requested publication of the reviewed release/admin changes to the existing Pages service. Production origin and base path reuse existing repository variables. Publish from feature/p-004-pages-release with the existing pages.yml workflow and deploy_production=true; main is not merged by this operation.

This release preserves the 24-track player and adds the released Two Faces premiere with six service destinations, Out the box (October16) and пена (November13), plus the Decap editor shell. OAuth and GitHub content editing are not connected on static GitHub Pages. Automatic Timeweb publication remains disabled.

Previous deployed source: a45e97f2e2c63993b54fcb01bdcad06628026e7e, branch deploy/two-faces-player, successful workflow run32596029490. Rollback reference: dispatch the existing Pages workflow from that unchanged branch after verifying its SHA; deploy_production=true. No force-push or deletion of the old deployment branch.

Local preflight: production build, static QA, base-path QA (171pages,11970localreferences),11admin/OAuth tests including project-path links. Full project suite runs in the unchanged Actions workflow before deployment. Final workflow and public smoke results live in the release evidence under site/artifacts/pages-release (local, not public site content).
