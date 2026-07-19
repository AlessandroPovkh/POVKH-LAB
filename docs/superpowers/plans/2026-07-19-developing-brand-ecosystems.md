# Developing Brand Ecosystems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, validate, and install a universal Codex skill that reproduces the POVKH LAB brand-ecosystem method for any product or organization without copying its aesthetic.

**Architecture:** A compact model-invoked router in `SKILL.md` progressively loads focused references. Two standard-library Python tools provide read-only inspection and configurable static validation; JSON eval fixtures test activation and workflow shape.

**Tech Stack:** Agent Skills Markdown/YAML, Python 3 standard library, `unittest`, Codex skill-creator validation.

## Global Constraints

- Skill name and directory: `developing-brand-ecosystems`.
- Existing or fragmentary brands are the primary audit/development scenario; from-scratch creation remains supported.
- The skill chooses audit/proposal, safe implementation, or autonomous completion per work packet.
- POVKH LAB is a method case study, never a default aesthetic or industry template.
- Scripts are read-only unless an explicit output path is supplied and use only Python standard library.
- External sends, deployment, payments, destructive actions, and public factual claims remain approval-gated.

---

### Task 1: Baseline behavior and evaluation contract

**Files:**
- Create: `skill-development/developing-brand-ecosystems/evals/baseline-observations.md`
- Create: `skill-development/developing-brand-ecosystems/evals/should-trigger.json`
- Create: `skill-development/developing-brand-ecosystems/evals/workflow-cases.json`

**Interfaces:**
- Produces: bilingual activation fixtures and workflow rubrics consumed by final validation.

- [ ] Run at least three fresh-context scenarios without the skill: fragmented SaaS brand, existing consumer identity with UX defects, and cultural project with mixed public/planning facts.
- [ ] Record observable omissions and conflicting choices in `baseline-observations.md`.
- [ ] Define `should_trigger`, `should_not_trigger`, and `ambiguous` prompt arrays in `should-trigger.json`.
- [ ] Define workflow cases with required rubric keys: `source_truth`, `autonomy`, `preserve_character`, `yagni_touchpoints`, `validation`.
- [ ] Validate both JSON files with `python3 -m json.tool` and expect exit code 0.

### Task 2: Initialize the skill and write focused references

**Files:**
- Create: `skill-development/developing-brand-ecosystems/SKILL.md`
- Create: `skill-development/developing-brand-ecosystems/agents/openai.yaml`
- Create: `skill-development/developing-brand-ecosystems/references/*.md`

**Interfaces:**
- Consumes: approved design spec and baseline observations.
- Produces: one router skill with direct context pointers to eleven references.

- [ ] Initialize with `init_skill.py developing-brand-ecosystems --path skill-development --resources scripts,references --interface display_name='Developing Brand Ecosystems' --interface short_description='Audit and develop coherent brand ecosystems' --interface default_prompt='Use $developing-brand-ecosystems to audit and develop this brand or product ecosystem.'`.
- [ ] Replace generated `SKILL.md` with a compact routing contract whose frontmatter description begins `Use when...` and contains only triggering conditions.
- [ ] Write focused references for discovery, strategy, concepts, identity, digital product, content, media/physical touchpoints, governance, autonomy, QA/launch, and the POVKH LAB method case.
- [ ] Keep every reference directly linked from `SKILL.md`; do not create nested reference chains.
- [ ] Run `quick_validate.py skill-development/developing-brand-ecosystems` and expect `Skill is valid!`.

### Task 3: Build read-only project inspection with TDD

**Files:**
- Create: `skill-development/developing-brand-ecosystems/scripts/inspect_brand_ecosystem.py`
- Create: `skill-development/developing-brand-ecosystems/tests/test_inspect_brand_ecosystem.py`

**Interfaces:**
- Produces: `inspect(root: Path) -> dict` and CLI `ROOT [--format json|markdown] [--output PATH]`.

- [ ] Write failing `unittest` cases for project classification, detected sources, dependency manifests, fonts/licenses, QA commands, touchpoint signals, ignored build/cache directories, JSON output, and no writes without `--output`.
- [ ] Run the test file and confirm failure because the module does not exist.
- [ ] Implement the minimal standard-library scanner, sorted deterministic output, explicit ignored directories, and Markdown renderer.
- [ ] Run the test file and expect all tests to pass.

### Task 4: Build configurable ecosystem validation with TDD

**Files:**
- Create: `skill-development/developing-brand-ecosystems/scripts/validate_brand_ecosystem.py`
- Create: `skill-development/developing-brand-ecosystems/tests/test_validate_brand_ecosystem.py`

**Interfaces:**
- Produces: `validate(root: Path, config: dict) -> dict` and CLI `ROOT [--config PATH] [--format json|markdown] [--output PATH]`.

- [ ] Write failing tests for broken Markdown links, missing font-license declarations, configured public-output placeholder detection, required paths, required QA commands, valid fixture pass, and no project writes.
- [ ] Run tests and confirm failure because the validator module does not exist.
- [ ] Implement minimal typed findings with `severity`, `code`, `path`, and `message`; return exit 0 without errors and exit 1 with errors.
- [ ] Run tests and expect all tests to pass.

### Task 5: Forward-test, refactor, install, and verify

**Files:**
- Modify: skill files only when forward-tests reveal a transferable gap.
- Install: `/Users/alessandropovkh/.codex/skills/developing-brand-ecosystems/`

**Interfaces:**
- Consumes: completed skill, eval fixtures, and POVKH LAB read-only case.
- Produces: validated installed skill and evidence handoff.

- [ ] Re-run baseline scenarios with the skill in fresh contexts and score against workflow rubrics.
- [ ] Fix only observed routing, omission, or rationalization gaps and re-test.
- [ ] Run `unittest`, JSON validation, `quick_validate.py`, compile checks, `--help`, and a read-only POVKH LAB dry run.
- [ ] Copy the verified folder into `/Users/alessandropovkh/.codex/skills/developing-brand-ecosystems`.
- [ ] Compare source and installed tree hashes and confirm no missing files.
- [ ] Commit the project-side skill source and report installation plus restart/new-session requirement.
