# AI-First Monster Intake Design

**Date:** 2026-07-16
**Status:** Approved

## Goal

Convert arbitrary pasted text, `.txt`, or irregular Markdown describing one or more D&D 5e monsters into source-faithful project Markdown and Foundry Actor JSON. AI owns document understanding; deterministic code owns contracts, rendering, generation, and acceptance gates.

## Product decisions

- Build a new `src/core/intake/` pipeline. Keep the old rule-based plaintext workflow as an explicitly labeled Legacy tool.
- Support monsters/NPCs only in v1. Items and direct image/PDF OCR are out of scope.
- Support a single monster or a collection of up to 50 monsters.
- New intake is strict: missing configuration, provider failure, invalid responses, or blocking semantic findings never fall back silently to Legacy.
- AI extraction and AI review are separate calls. One bounded semantic repair is allowed.
- High-confidence results may complete automatically only when deterministic and AI review gates agree. Ambiguity becomes `needs_review`.
- Web resolves review issues through a form. CLI resolves the same issues with a decisions JSON file.
- Final Actor JSON is generated only through the project parser/generator workflow. AI never writes or repairs final JSON.

## Architecture

```text
raw text
  -> AI document discovery
  -> AI extraction to MonsterIntakeIR with exact source evidence
  -> deterministic schema/evidence/coverage validation
  -> deterministic project Markdown renderer
  -> existing project parser/generator
  -> deterministic IR/Markdown/Actor semantic comparison
  -> independent AI review
  -> at most one AI repair and complete revalidation
  -> accepted | needs_review | failed
```

The AI emits stable English-keyed JSON, not Markdown. Each material claim points to one or more exact UTF-16 source ranges. Deterministic code verifies `source.slice(start, end) === quote`, rejects unsupported values, and requires coverage for mechanically relevant source text.

## Status model

- `accepted`: register and promote standard Markdown, Actor JSON, IR, and reports.
- `needs_review`: retain source, candidate IR/Markdown, candidate Actor, issues, and decisions template; do not expose Actor JSON as a deliverable.
- `failed`: configuration, provider, schema, evidence, resource, or generator failure prevents a reviewable candidate.

For collections, accepted creatures may be promoted independently. A collection with any execution failure returns failure; otherwise any unresolved review issue returns `needs_review`.

## Configuration and limits

Only `MONSTER_INTAKE_API_KEY`, `MONSTER_INTAKE_BASE_URL`, `MONSTER_INTAKE_MODEL`, `MONSTER_INTAKE_REVIEW_MODEL`, and `MONSTER_INTAKE_TIMEOUT_MS` configure the feature. Translation/OpenAI environment variables never activate it implicitly.

- source: 200,000 UTF-16 code units maximum;
- creature count: 50 maximum;
- creature span: 25,000 code units maximum;
- discovery chunks: 24,000 with 1,000 overlap;
- creature concurrency: 2;
- per creature: one extraction, one review, and at most one semantic repair;
- retryable provider failure: one retry per stage.

## Acceptance

The raw `Lurker in the Dark` Chinese compact statblock is the primary real fixture. Acceptance requires exact identity, stats, defenses, senses, languages, three separate traits, separate Multiattack and Claw, Claw mechanics, and Dark Teleport semantics. Planted AC 20, HP 332, all-10 abilities, merged actions, and biography-only traits must be blocking findings.

Default automated tests are network-free. Final product acceptance additionally performs a bounded explicit OpenAI run and a project-local Foundry 14.364/dnd5e 5.3.3 import/readback. Production is out of scope.
