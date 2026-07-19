# Skill provenance map

Status: `orchestration`

## Skill attribution

**Primary owner:** `agents-best-practices` owns skill-system provenance and routing architecture; `developing-brand-ecosystems` owns the brand-domain application and this evidence policy.

**Evidence:** POVKH LAB Git history; installed skill metadata and filesystem dates; `AI-development-skills-pack-19-07-2026/MANIFEST.md`; design/plan commits `00bbb7a`, `18393a5`, `b3a3748`, `fd7b6b7`; baseline/forward evals; project code, manifests, and audits.

**Added by `developing-brand-ecosystems`:** A domain-level ownership map connecting strategy, identity, product, content, media, governance, and launch while preventing specialist execution from being miscredited as work of the router.

## Evidence vocabulary

| Label | Meaning |
|---|---|
| Agent Skill invocation | A conversation/tool trace or explicit execution record names the skill during the work. |
| library/tool usage | Code, lockfiles, manifests, or logs prove a technology ran; this does not prove the similarly named Agent Skill ran. |
| artifact evidence | A file or audit proves that a result exists, not which skill authored it. |
| installed-before | Filesystem evidence shows the skill was available before an artifact; availability is not invocation. |
| installed-after | The skill could not have produced earlier committed work in that installed form. |
| not evidenced | Available records cannot support attribution; do not infer authorship. |

## What is actually evidenced for POVKH LAB

The public project history from `af86034` through `33688f7` proves website implementation and fixes. Project artifacts prove the broader brand ecosystem. They do not contain Agent Skill invocation logs.

| Area/result | Agent Skills proven to have created it | What is proven instead | Evidence |
|---|---|---|---|
| Brand strategy, Typographic Monolith, Signal Red, typography, logo hierarchy | not evidenced | The decisions and assets exist; author/skill split is unknown | `BRAND-GUIDE-RU.md`, `assets/logo/`, `logo-concepts/`, `brand-board.html` |
| Static multilingual website and UI | not evidenced | Vanilla Node/HTML/CSS/JS implementation and Git changes exist | `site/`, `site/README.md`, commits `af86034`–`33688f7` |
| Browser/accessibility QA | not evidenced as Agent Skill invocation | Playwright and Axe library/tool usage is proven | `site/package.json`, `site/tools/qa.mjs`, `tools/qa_brand_package.mjs`, lockfiles |
| Logo outline production | not evidenced | fontTools library usage is proven | `tools/build_logo_outlines.py`, `tools/requirements.txt` |
| Motion/audio/media production | not evidenced | Playwright, FFmpeg/ffprobe, Python and authored generators are proven | `media/motion/`, `media/sonic/`, manifests and audits |
| Campaign, EPK, onboarding, content, photo/video, merch, dashboard | not evidenced | Files, generators, and QA results prove the systems exist | corresponding project directories, `ECOSYSTEM-MAP-RU.md`, audits |
| Creation of `developing-brand-ecosystems` | `brainstorming`, `agents-best-practices`, `skill-creator`, `writing-skills`, `test-driven-development`, `writing-plans`, `executing-plans`, `verification-before-completion` | Direct invocation occurred in the recorded creation workflow | design/plan documents, commits `00bbb7a`–`fd7b6b7`, evals/tests |
| Installation of the downloaded skill pack | `skill-installer` | Direct invocation occurred during local installation | installed folders dated 2026-07-19 13:46 + conversation record |
| Provenance revision of this skill | `receiving-code-review`, `agents-best-practices`, `writing-skills`, `skill-creator` | Direct invocation occurred in this revision workflow | this file, provenance contract test, revision commit |

## Borrowed method versus independent judgment

| Source skill/practice | Borrowed | Still decided by Codex/user/project |
|---|---|---|
| `agents-best-practices` | primary-owner boundaries, progressive disclosure, source-of-truth legibility, provenance and eval discipline | brand maturity model, touchpoint map, specific authorities, case interpretation |
| `brainstorming` | explore context, compare approaches, obtain design approval before implementation | which brand directions are meaningful and which one to recommend |
| `skill-creator` | skill folder structure, frontmatter, references/scripts layout, validation tooling | domain content, routing rules, names of artifacts and checks |
| `writing-skills` + `test-driven-development` | RED→GREEN baseline/forward-test discipline | scenarios, failure interpretation, minimal corrective instructions |
| `writing-plans` + `executing-plans` | staged implementation and checkpoints | actual plan scope, code, references, and integration choices |
| `verification-before-completion` | fresh evidence before completion claims | which project-specific commands establish readiness |
| `frontend-design` | conditional owner for implementing a new digital visual direction | no historical POVKH LAB invocation is evidenced; brand constraints remain project decisions |
| `ui-ux-pro-max` | conditional owner for substantial UX/accessibility review | no historical invocation is evidenced; existing project QA was implemented directly in code |
| `playwright` / `webapp-testing` | conditional owner for browser automation when no stronger project harness exists | POVKH LAB proves Playwright library usage, not these Agent Skills |
| `imagegen` | conditional owner for raster generation/editing | no historical invocation is evidenced; existing raster provenance remains unknown unless generation traces are preserved |
| Remotion skills | conditional owner only for Remotion-based work | POVKH LAB motion uses Playwright + FFmpeg, so Remotion ownership does not apply to that implementation |

## Ownership boundary by reference

| Reference | Status | `developing-brand-ecosystems` owns | Delegates or adapts |
|---|---|---|---|
| `discovery-and-maturity-audit.md` | original-method | brand maturity levels and ecosystem audit output | source-of-truth legibility informed by `agents-best-practices` |
| `strategy-and-positioning.md` | original-method | evidence-aware brand strategy contract | project judgment remains Codex/user work |
| `concept-development.md` | orchestration | comparable-direction criteria and master/archive boundary | `brainstorming`, `frontend-design`, `imagegen` |
| `identity-and-design-system.md` | original-method | source/master/export identity governance | implementation is stack/media specific |
| `product-and-digital-experience.md` | orchestration | brand-through-behavior and integration boundary | `frontend-design`, `ui-ux-pro-max`, `playwright`, `webapp-testing` |
| `content-and-campaigns.md` | original-method | fact/fixture/content-consumer method | specialist writing/data owners when explicitly invoked |
| `media-and-physical-touchpoints.md` | orchestration | touchpoint justification, brand constraints, handoff | `imagegen`, Remotion/media skills, manufacturer rules |
| `operations-and-governance.md` | adapted-from-skill | brand-specific governance application | adapts `agents-best-practices` legibility/feedback loops |
| `autonomy-and-approvals.md` | adapted-from-skill | brand-risk examples and packet application | adapts `agents-best-practices` permission model and Codex safety practice |
| `production-qa-and-launch.md` | orchestration | cross-artifact validation ladder and launch reconciliation | `verification-before-completion`, project harnesses, browser/data/security owners |
| `povkh-lab-method-case-study.md` | project-case | transfer of observed project lessons | no historical skill authorship claimed |
| `skill-provenance-map.md` | orchestration | attribution policy and brand-domain owner map | `agents-best-practices` provenance architecture |

## Installed skills relevant to this map

Versions are recorded when metadata exists; otherwise the upstream/source is given. Installation does not prove historical use.

| Skill | Version or source | Evidence/use status |
|---|---|---|
| `developing-brand-ecosystems` | local skill, commit `fd7b6b7` plus this revision | directly used in forward tests; not creator of pre-existing POVKH LAB artifacts |
| `agents-best-practices` | v1.2.0; DenisSergeevitch/agents-best-practices `b612dd…`, locally extended | directly used to architect and revise this skill; installed after original site commits |
| `brainstorming` | Superpowers v6.1.1, `d884ae0`, obra/superpowers | directly used for design/spec of this skill; installed after original site commits |
| `writing-skills`, `test-driven-development`, `writing-plans`, `executing-plans`, `verification-before-completion`, `receiving-code-review` | Superpowers v6.1.1, `d884ae0`, obra/superpowers | directly used during creation/revision of this skill; installed after original site commits |
| `skill-creator`, `skill-installer`, `imagegen` | built-in OpenAI system skills; installed bundle has no exposed semantic version | creator/installer directly used for skill work; historical `imagegen` use on POVKH LAB not evidenced |
| `frontend-design` | Anthropic skills, locally adapted; no pinned revision in installed file | conditional owner only; installed 2026-07-19 13:46, after original site work |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill; restored local full version, no pinned revision | installed before the July 19 site fixes, but invocation is not evidenced |
| `playwright` | Codex global skill source; exact upstream revision not recorded | installed after original site commits; project uses Playwright library 1.61.1 independently |
| `webapp-testing` | Anthropic skills, locally adapted; no pinned revision | installed after original site commits; no historical invocation evidenced |
| Remotion skills | local `remotion-best-practices` bundle; source/version not recorded in this project | available now; POVKH LAB motion implementation is not Remotion |
| Data Analytics skills | OpenAI curated remote plugin `data-analytics` 0.2.8 | conditional owners for data-backed work; not evidenced in original POVKH LAB project |

Re-audit this table whenever skills are upgraded, renamed, or replaced. Preserve invocation traces in future project decision records if per-artifact attribution matters.
