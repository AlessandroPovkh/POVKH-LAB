# Discovery and maturity audit

Status: `original-method`

## Skill attribution

**Primary owner:** `developing-brand-ecosystems`. `agents-best-practices` informs source-of-truth legibility, but the six-level brand maturity model and ecosystem audit shape are original to this skill.

**Evidence:** `README.md`, `ECOSYSTEM-MAP-RU.md`, `ECOSYSTEM-FINAL-AUDIT-RU.md`, project inventory output, and `scripts/inspect_brand_ecosystem.py`. These prove artifacts and structure, not historical skill invocation.

**Added by `developing-brand-ecosystems`:** Brand-specific maturity routing, cross-touchpoint inventory, and a required audit output that joins evidence, authorities, strengths, gaps, dependencies, autonomy, and validation.

## Inputs

Resolve the subject, audience, desired outcome, project root, repository state, local instructions, available evidence, external dependencies, and deadline. Search before asking for information that may already exist.

## Inventory

Identify:

- strategy, research, positioning, naming, voice, and decision records;
- logos, design tokens, fonts/licenses, components, templates, imagery, media, packaging, and environments;
- product/app/site source, content schemas, data, builds, deployment rules, and analytics definitions;
- campaign, editorial, sales, support, onboarding, operations, approval, rights, and handoff materials;
- generators, manifests, validators, CI, screenshots, audits, and known gaps.

Run `scripts/inspect_brand_ecosystem.py ROOT --format markdown` when a filesystem project is available.

## Maturity routing

| Level | Observable state | Primary next work |
|---|---|---|
| Unformed | idea or unrelated material | discovery and strategy |
| Direction | strategy plus candidate expressions | select a master concept |
| Identity | recognizable identity with weak rules | codify the design system |
| Product | identity applied to a core experience | connect content and operations |
| Ecosystem | major touchpoints align | automate QA and handoff |
| Governed | sources and checks remain reliable | measure, maintain, prune sediment |

Rate maturity from evidence, not polish.

## Required audit output

Lead with the verdict. Then provide:

1. scope and maturity;
2. authorities and evidence gaps;
3. strengths worth preserving;
4. contradictions and risks;
5. dependency map;
6. prioritized work packets with autonomy modes;
7. validation signals.

Do not prescribe an aesthetic until strategy and existing brand equity are understood.

For complete provenance and installed sources, read [skill-provenance-map.md](skill-provenance-map.md).
