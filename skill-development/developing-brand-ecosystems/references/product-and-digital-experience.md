# Product and digital experience

Status: `orchestration`

## Skill attribution

**Primary owner:** The existing framework/project harness owns implementation. Use `frontend-design` for a new visual direction, `ui-ux-pro-max` for substantial UX/accessibility review, and `playwright` or `webapp-testing` when rendered verification lacks a stronger native harness. `developing-brand-ecosystems` owns brand-through-behavior constraints and cross-system integration.

**Evidence:** `site/src/`, `site/assets/`, `site/data/`, `site/tools/`, `site/package.json`, `site/package-lock.json`, `site/README.md`, and commits `af86034`–`33688f7`. They prove direct code and Playwright/Axe library use; they do not prove those Agent Skills were invoked.

**Added by `developing-brand-ecosystems`:** A bridge from brand authorities and fact states to journeys, terminology, content models, preview/production gates, and downstream experience validation.

## Brand through behavior

Treat information architecture, terminology, interaction, performance, accessibility, privacy, reliability, and recovery states as brand expression—not only visual styling.

## Workflow

1. Map primary users, jobs, journeys, decision points, and trust risks.
2. Resolve product/content sources of truth and public-data gates.
3. Align navigation, terminology, messages, components, and states with the approved brand system.
4. Preserve the existing stack unless a change has measured value.
5. Design mobile, keyboard, zoom, reduced-motion, loading, empty, error, offline, long-content, and localization behavior.
6. Separate preview and production modes when facts, domains, contacts, indexing, analytics, or integrations require approval.
7. Build deterministic output and browser QA proportional to risk.

Use `ui-ux-pro-max` for substantial UX/accessibility review. Use `playwright` or `webapp-testing` for rendered verification. Use a framework-specific owner when the repository already has one.

## Completion

Core journeys work with real content across required viewports and input modes; public facts are approved; privacy and launch gates are explicit; the production artifact is reproducible.

For the library-versus-skill distinction and owner map, read [skill-provenance-map.md](skill-provenance-map.md).
