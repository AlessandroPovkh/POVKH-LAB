# Operations and governance

Status: `adapted-from-skill`

## Skill attribution

**Primary owner:** `agents-best-practices` provides agent-legible sources of truth, feedback loops, validators, and sediment cleanup. `developing-brand-ecosystems` adapts those practices to brand assets, approvals, facts, touchpoints, versions, rights, metrics, and handoff.

**Evidence:** `README.md`, `ECOSYSTEM-MAP-RU.md`, `onboarding/`, `content-system/`, `dashboard/`, manifests, audits, and the `agents-best-practices` v1.2.0 source metadata. This adaptation was used to create the new skill, not proven as the historical process that created every POVKH artifact.

**Added by `developing-brand-ecosystems`:** Brand-specific authority types, source/master/export governance, recurring cross-touchpoint maintenance, and contributor-ready handoff criteria.

## Make the system durable

Define:

- one index pointing to normative sources;
- owners, approvers, contributors, and informed roles;
- approval states and evidence fields;
- file naming, versions, directories, and archive rules;
- intake/onboarding requirements;
- KPI definitions and data sources;
- change logs, audits, handoffs, and recurring review dates;
- validators that turn repeated review comments into checks.

Prefer structured data for facts reused by multiple consumers. Keep planning fixtures in a separate namespace or explicit status field. Generated artifacts must record their sources or fingerprints when feasible.

## Maintenance loop

Periodically find stale docs, duplicate authorities, broken generators, unused touchpoints, low-quality examples, expired rights, obsolete exports, and recurring failures. Remove sediment or convert it into a current rule, tool, validator, or eval.

## Completion

A new contributor can find the authority, reproduce outputs, understand approval state, run checks, and hand off work without relying on chat history.

For full source attribution, read [skill-provenance-map.md](skill-provenance-map.md).
