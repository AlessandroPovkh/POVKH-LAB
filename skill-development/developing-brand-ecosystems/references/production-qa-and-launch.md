# Production QA and launch

Status: `orchestration`

## Skill attribution

**Primary owner:** Existing project test/build harnesses own their checks; `playwright`/`webapp-testing` own browser automation when invoked; `verification-before-completion` owns fresh evidence before claims. `developing-brand-ecosystems` owns the cross-artifact validation ladder and reconciliation of authorities with all consumers.

**Evidence:** `tools/qa_label_ecosystem.mjs`, `site/tools/qa.mjs`, media/production QA scripts, manifests, and final audits. They prove project QA and Playwright/Axe/FFmpeg/fontTools usage, not historical Agent Skill invocation.

**Added by `developing-brand-ecosystems`:** Source→generation→artifact→experience→integration→launch ordering and a brand-specific handoff contract spanning several specialist outputs.

## Validation ladder

1. Source: schemas, licenses, rights, naming, approvals, and source-of-truth consistency.
2. Generation: deterministic commands, pinned dependencies, manifests, hashes, and clean rebuilds.
3. Artifact: dimensions, formats, links, metadata, text, contrast, safe areas, and source/master/export separation.
4. Experience: real content, viewports, keyboard, zoom, assistive technology, reduced motion, performance, errors, and recovery.
5. Integration: every changed authority and downstream consumer agree.
6. Launch: domain, contacts, indexing, analytics, public facts, external services, rollback, and owner sign-off.

Use `scripts/validate_brand_ecosystem.py` as a generic baseline, then run project-native checks. A template baseline is not production approval.

## Handoff shape

Lead with what is ready. Include:

- approved masters and editable sources;
- generated outputs and reproduction commands;
- normative documents and owners;
- test evidence and unverified boundaries;
- excluded samples/placeholders;
- launch variables, approvals, rollback, and next review.

Do not claim readiness from the existence of files alone.

For routed owners and installed sources, read [skill-provenance-map.md](skill-provenance-map.md).
