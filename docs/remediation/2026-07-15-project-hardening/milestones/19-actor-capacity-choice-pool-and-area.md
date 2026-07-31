# Milestone 19: Actor Capacity, Choice Pools and Areas

## Goal

Complete the 11-Actor corpus with source-derived capacity, choice-pool, area and compound-state contracts.

## Scope

- [x] Capacity: slots, acquire/release, size limit, escape DC and linked grapple/restrained lifecycle.
- [x] Choice pools: choose a fixed number of distinct options, publish current choices, consume each once and reset at the declared time.
- [x] Areas: shape, size, duration, enter/start/end/leave events, linked effects and removal.
- [x] Compound state transitions must be explicit; no ability-name inference.
- [x] Preserve dynamic actual-damage, forced other-Actor attacks, automatic environment listeners and per-hit attunement consumption as truthful `gm-assisted` operations in core.
- [x] Preserve Ruidium Corruption as an `external-rule` with exact trigger, DC and source result text.

## Corpus acceptance

- [x] Migrate all 11 real Markdown sources.
- [x] Regenerate 11 v12/core plus 11 v14/core JSON files only through the CLI.
- [x] Verify every Actor and maintain a clause-to-contract-to-JSON-to-mode matrix.
- [x] Exercise capacity, choice/reset/consume, two-stage state, area/removal and every GM-assisted entry point in local v14.
- [x] Run focused tests, full bounded tests, coverage/typechecks, `verify:actor`, structural checks, reference verification, anti-overfit and `git diff --check`.

## Runtime evidence

2026-07-31 local Foundry 14.364/dnd5e 5.3.3: all 11 Actors imported. Eye capacity spent sequence was `0→1→2→2→1`; Nautiloid selected three visible distinct markers, rejected a fourth use at the native capacity boundary, reset to zero, and removed old markers; Earth transitioned from restrained mineralization to cleared state to petrified; Undertow placed a 60×15-foot ray and Crimson Veil placed a 20-foot circle. GM-assisted cards retained actual-damage, cross-Actor, environmental and external-rule steps. Cleanup removed 11 Actors, 11 Tokens, 23 messages and 2 templates, restored `cor-cotn`, released port 30001 and did not access production.

## Closure evidence

2026-07-31: all 22 v12/core and v14/core Actor files were regenerated through `src/index.ts` and every standalone `verify:actor` run exited 0. The focused behavior suite passed `35 / 35` with `236` assertions. The full bounded suite passed `1554 / 1554` with `7353` assertions; production coverage passed at `85.30%` lines and `88.18%` functions. Production and broad TypeScript checks, the 179-source anti-overfit audit, 1844-path repository hygiene, locked dnd5e 5.3.3 reference verification, Web build, offline Actor smoke and `git diff --check` passed. The manual 11-Actor clause matrix is recorded in `docs/reviews/2026-07-31-netherdeep-monster-manual-semantic-audit.md`. All intentionally assisted or external-rule mechanics remain visible as `needs_review`; no core-only output is represented as fully automatic.
