# AI-First Monster Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not use subagents unless the user later authorizes delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-first, evidence-backed intake path from arbitrary monster text to accepted project Markdown and CLI-generated Foundry Actor JSON.

**Architecture:** A new `src/core/intake/` service owns discovery, versioned IR, evidence validation, deterministic rendering, workflow generation, deterministic semantic comparison, independent AI review, one repair, bundles, and resume decisions. CLI and Web call the shared service. The old plaintext parser remains Legacy and never serves as an implicit fallback.

**Tech Stack:** Bun 1.3.x, TypeScript 5.9.x, React 19, OpenAI-compatible chat completions, js-yaml, existing Actor parser/generator, Foundry 12/14 target profiles.

## Global Constraints

- Final Actor JSON must be generated through project parser/generator workflows, never authored or patched by AI.
- Preserve user-owned dirty files and stage/commit only task-scoped paths.
- Default tests make zero network calls. Live OpenAI acceptance must be explicit and bounded.
- Parser/generator changes require fixture-backed tests, structural verification, and anti-overfit audit.
- Findings close only after mechanical verification and source-to-output semantic acceptance.

---

### Task 1: Record the defect and lock the real source fixture

- [x] Add the approved design, this implementation plan, and INTAKE-001/002 plus VER-002 to the remediation ledger.
- [x] Add the unmodified Lurker source fixture and RED tests for zero detection, default leakage, merged actions, and verifier false-green behavior.
- [x] Run the focused baseline and record the expected failures.

### Task 2: Add versioned IR, evidence, coverage, and validators

- [x] Define canonical monster/action models, claims, coverage, uncertainty, review, discovery, and decision contracts.
- [x] Add runtime validation for schema, JSON pointers, evidence offsets/quotes, required fields, dice, enums, conflicting claims, and mechanical coverage.
- [x] Cover valid Lurker IR plus invalid evidence, missing fields, conflicting claims, bad dice, and uncovered mechanics.

### Task 3: Add an isolated OpenAI-compatible intake provider

- [x] Add explicit `MONSTER_INTAKE_*` configuration with no fallback to translation variables.
- [x] Implement separate versioned discovery/extraction/review/repair prompts, strict JSON parsing, reasoning stripping, one retry, timeout, and sanitized metadata.
- [x] Test all provider stages with fake HTTP clients; keep the default suite offline.

### Task 4: Build deterministic renderer, verifier, and workflow generation

- [x] Render validated English IR to the existing Chinese YAML/structured-action Markdown contract.
- [x] Generate candidate Actors through the shared conversion workflow for v12/v14 and allowed effect profiles.
- [x] Compare IR, Markdown-derived Actor data, and final Actor projection; make known Lurker corruptions blocking.
- [x] Emit JSON and Chinese Markdown verification reports.

### Task 5: Build orchestration, bundles, and decisions resume

- [x] Implement source hashing, limits, chunked discovery, offset reconciliation, concurrency 2, extraction, validation, generation, review, one repair, and collection status aggregation.
- [x] Persist the complete audit bundle and register Actor deliverables only for accepted results.
- [x] Implement decisions validation and `select`, `set`, `preserve-literal`, and `exclude` resolution followed by full regeneration/re-review.
- [x] Add idempotent promotion, conflict review, and backup-on-confirmed-replace behavior.

### Task 6: Integrate CLI and harden Legacy behavior

- [x] Add `--intake-monsters`, `--resume-intake`, and `--decisions`, with dry-run preflight and exit codes 0/2/1.
- [x] Label old plaintext commands Legacy and make zero detected creatures a failure in CLI and Web.
- [x] Add CLI tests for accepted, needs-review, failed, resume, limits, and target/profile combinations.

### Task 7: Integrate Web job, API, and Chinese review UI

- [x] Add `ai-monster-intake`, `needs_review`, capability reporting, shared job execution, and decisions resume route.
- [x] Register review artifacts safely while withholding unaccepted Actor JSON.
- [x] Add the paste/upload workbench, per-creature status, evidence/issues, decision controls, resume, and downloads.
- [x] Verify authentication, limits, job concurrency, retention, path safety, wrapping, and zero client-side secrets.

### Task 8: Reconcile documentation and acceptance claims

- [x] Document recommended intake, Legacy boundary, provider disclosure, variables, limits, privacy, and failure states.
- [x] Add bounded AI intake status to current support/delivery matrices without claiming arbitrary-input perfection.
- [x] Update the remediation ledger at every stop and only close findings after semantic acceptance.

### Task 9: Complete mechanical and semantic acceptance

- [x] Run all focused and aggregate gates, Web build, anti-overfit, reference, hygiene, and offline smoke.
- [x] Run explicit bounded OpenAI acceptance for Lurker, a two-monster collection, and two ambiguity negatives.
- [x] Manually compare raw source, IR, Markdown, v12/v14 JSON, and reports.
- [x] Import/read back the accepted v14/core Lurker in the project-local Foundry mirror and record exact evidence.
- [x] Finish the branch only when both mechanical and semantic gates pass.
