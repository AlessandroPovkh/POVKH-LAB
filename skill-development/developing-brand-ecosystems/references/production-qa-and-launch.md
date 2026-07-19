# Production QA and launch

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
