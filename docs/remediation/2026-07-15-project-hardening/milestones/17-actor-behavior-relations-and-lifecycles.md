# Milestone 17: Actor Behavior Relations and Lifecycles

## Goal

Add a strict source-authored `行为机制` contract beside `资源机制`. Preserve activity relations and effect lifecycles without creature/action-name inference, and report expression coverage separately from execution mode.

## Rule classification

- Contract declarations and stable Item references: `source-derived`.
- dnd5e Activity/Effect fields and target-version differences: `schema-derived`.
- Reusable relation/lifecycle shapes supported by positive/negative corpus tests: `corpus-derived`.
- No explicit creature or action exceptions.

## Scope

- [x] Add typed `ParsedNPC.behaviorSemantics`.
- [x] Parse strict, duplicate-free IDs and exact Item references.
- [x] Support activity forwarding, follow-up/alternative/next-hit relations and independent secondary ranges.
- [x] Support apply/remove/suppress/restore, repeated saves, damage retries, ally rescue and leave-area endings.
- [x] Fail closed on dangling, ambiguous, duplicate or impossible references.
- [x] Project native Effects/Activities where core is complete; otherwise create visible GM operations with exact steps.
- [x] Publish two independent manifest axes: `structured|literal|missing` and `automatic|core-operable|gm-assisted|external-rule`.
- [x] Bump the canonical mechanics schema without silently changing schema-v1 meanings.
- [x] Add two positives, a close negative and an unrelated control for every generalized contract family.

## Acceptance

- Mechanical: focused tests, both typechecks, v12/v14 structural checks, Actor verification and anti-overfit.
- Semantic: source clause to contract to JSON to execution-mode mapping for every migrated clause.
- Runtime: next-hit, one-shot protection, apply/remove, repeated save and ally rescue are exercised in the local v14 mirror.

## Closure evidence

2026-07-31: The strict contract, parser, projector, manifest-v2 coverage and verifier are implemented. Runtime acceptance exposed that selected-target states were initially projected as self-target Activities; a generalized target-aware projector and v12/v14 positive/remove/self-control tests repaired the defect before closure. The local Foundry 14.364/dnd5e 5.3.3 run exercised next-hit, one-attack AC, target condition application, repeated-save/ally-rescue removal and dnd5e status cleanup. The complete source-to-contract-to-JSON-to-mode matrix is appended to `docs/reviews/2026-07-31-netherdeep-monster-manual-semantic-audit.md`.
