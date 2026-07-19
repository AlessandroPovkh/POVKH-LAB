---
name: developing-brand-ecosystems
description: Use when creating, auditing, consolidating, or substantially developing a brand across strategy, identity, product, website, content, campaigns, physical or media touchpoints, operations, governance, production readiness, or handoff; especially when existing materials are fragmented or several brand consumers must remain coherent. Skip isolated cosmetic edits and ordinary feature work without a cross-system brand decision.
---

# Developing Brand Ecosystems

## Core contract

Treat the brand as a governed system, not a pile of artifacts. Preserve evidence, resolve authority, choose one master direction, and validate every affected consumer.

## Skill routing and provenance

Read [skill-provenance-map.md](references/skill-provenance-map.md) before attributing prior work or delegating a specialist branch. A library present in code is not evidence that an Agent Skill was invoked. Use `not evidenced` when no prompt, trace, dated installation, commit, or manifest proves invocation.

| Task | Primary skill | Role of `developing-brand-ecosystems` | Evidence |
|---|---|---|---|
| Cross-system brand audit, maturity, authority map | `developing-brand-ecosystems` | Owns the method and integration verdict | `references/discovery-and-maturity-audit.md`, inspector output |
| Strategic framing and brand positioning | `developing-brand-ecosystems` | Owns evidence/decision structure; Codex supplies project-specific judgment | `references/strategy-and-positioning.md`, approved strategy source |
| Creative discovery before implementation | `brainstorming` | Defines brand criteria and preserves the decision in the ecosystem map | design spec or recorded approval |
| New digital visual direction or major redesign | `frontend-design` | Sets constraints, authority, downstream consumers, and approval gate | invoked-skill trace plus changed frontend artifacts |
| UX, accessibility, responsive review | `ui-ux-pro-max` | Routes the bounded review and integrates findings into brand governance | invoked-skill trace plus audit/findings |
| Browser interaction and rendered verification | existing project harness; otherwise `playwright` or `webapp-testing` | Defines required brand/product invariants and consumes test evidence | test files/logs; library imports alone prove tool use only |
| Raster image generation or editing | `imagegen` | Supplies brief, rights/status, placement, source/master/export rules | image-generation trace plus generated asset |
| Remotion implementation or rendering | relevant Remotion skill | Defines brand motion grammar, approvals, formats, and integration QA | Remotion source/render artifacts and invoked-skill trace |
| Data-backed KPI/dashboard work | relevant Data Analytics skill | Defines brand authority, public-fact gates, and downstream consistency | cited data source and validated report/dashboard |
| Agent-skill architecture and provenance | `agents-best-practices` | Applies the architecture to this domain and records owner boundaries | this routing table and provenance map |
| Creating/testing this Agent Skill | `skill-creator` + `writing-skills` | Supplies the brand-domain content and installs the validated result | design/plan commits, baseline evals, tests |
| Cross-artifact launch and handoff | `developing-brand-ecosystems` | Owns source→master→export→consumer reconciliation | `references/production-qa-and-launch.md`, project QA evidence |

## Route the work

1. Resolve the project root, local instructions, subject type, user goal, and existing evidence.
2. Read [discovery-and-maturity-audit.md](references/discovery-and-maturity-audit.md). Classify the system as unformed, direction, identity, product, ecosystem, or governed.
3. Build a map of normative sources, verified facts, planning fixtures, editable sources, production masters, derived exports, consumers, and validators.
4. State the chosen autonomy per work packet using [autonomy-and-approvals.md](references/autonomy-and-approvals.md).
5. Load only the branches the task needs:

| Need | Read |
|---|---|
| Positioning, audience, promise, naming | [strategy-and-positioning.md](references/strategy-and-positioning.md) |
| Explore or select a direction | [concept-development.md](references/concept-development.md) |
| Logo, color, type, grid, templates | [identity-and-design-system.md](references/identity-and-design-system.md) |
| Website, app, service, UX, content model | [product-and-digital-experience.md](references/product-and-digital-experience.md) |
| Editorial system, channel work, campaigns | [content-and-campaigns.md](references/content-and-campaigns.md) |
| Photo, video, sound, packaging, print | [media-and-physical-touchpoints.md](references/media-and-physical-touchpoints.md) |
| Roles, approvals, files, metrics, maintenance | [operations-and-governance.md](references/operations-and-governance.md) |
| QA, exports, launch, handoff | [production-qa-and-launch.md](references/production-qa-and-launch.md) |
| Transferable worked method | [povkh-lab-method-case-study.md](references/povkh-lab-method-case-study.md) |
| Skill ownership, versions, sources, and evidence limits | [skill-provenance-map.md](references/skill-provenance-map.md) |

6. For strategic choices, present 2–3 meaningfully different options and recommend one. Implement reversible, objective improvements directly when authorized by the autonomy policy.
7. Produce the smallest coherent system needed by the real product. Add no touchpoint merely to complete a checklist.
8. Validate modified artifacts locally, then re-check the dependency map. Report the outcome, evidence, unresolved decisions, and reproduction commands.

## Completion contract

Finish only when every affected consumer points to an explicit authority, verified facts remain separate from fixtures, masters remain separate from exports, user changes are preserved, and relevant checks pass or are named as unverified.

## Common mistakes

- Inventing strategy, facts, palettes, or channels when evidence is missing.
- Treating a redesign as the default cure for execution defects.
- Publishing samples, projections, or placeholders as facts.
- Creating exports without editable sources or production ownership.
- Declaring one artifact complete while downstream consumers contradict it.

Use `scripts/inspect_brand_ecosystem.py --help` for read-only inventory and `scripts/validate_brand_ecosystem.py --help` for configurable static checks.
