# Safe Delivery Checklist

This checklist separates repository delivery gates from deeper product-support claims. The canonical current claim boundary is [`docs/acceptance/current-support-matrix.md`](acceptance/current-support-matrix.md).

## Commit boundaries

1. Preserve user-owned workspace changes and stage only the intended remediation files.
2. Keep source/parser/generator changes separate from acceptance-document reconciliation when practical.
3. Generate final Actor/Item JSON only through the project CLI or workflows; never hand-repair deliverables.
4. Keep `.local` runtime data, credentials, cookies, raw logs, and production inventories untracked.
5. A clean command or schema check is mechanical evidence; source review and real runtime behavior are separate acceptance layers.

## Required repository gates before push

- [x] `bun run ci:verify` passed on 2026-07-17 against the final code: 791 tests / 3,093 expectations, both typechecks, 87.94% line / 88.68% function production coverage, 115-source anti-overfit, 1,668-path repository hygiene, locked dnd5e reference verification, Web build, and offline Actor smoke. Two preceding aggregate attempts hit unrelated scheduling timeouts that passed in isolation; two later complete reruns passed, and the last rerun includes the final Web cleanup.
- [x] The focused current corpus command passed 148 tests / 656 expectations across 11 files.
- [x] v14 core and modded acceptance batches retain six schema-valid samples each with zero actor-verification warnings.
- [x] Representative v12/v14 Shield and v14 core/modded Damage-Bound Warden CLI outputs were read against their source Markdown.
- [x] Acceptance documents preserve the 2026-07-11 88-ID reproduction failure as historical evidence, while the current matrix no longer treats that superseded snapshot as a completion gate.
- [x] Repository hygiene confirms no tracked `.local` runtime data, user database, password, cookie, private key, raw server log, or production inventory snapshot; the latest M10 run checked 1,605 tracked paths.
- [ ] Immediately before a real push, confirm `git status --short` contains only the intended staged delivery. Existing user-owned edits are not part of this remediation and must not be staged or overwritten.

## Product gates still open

- [x] Standalone Item v14: import/equip/AC/both Activities/prone/limited-use/concentration/runtime-readback and the no-dialog `exportToJSON()` source-relevant comparison pass.
- [x] DAE/MIDI `isDamaged`: the real CLI modded-v14 Actor retained the effect before damage and removed it after locked DAE 14.0.12 + MIDI-QOL 14.0.9 damage; the real CLI core control retained it after damage.
- [x] Authenticated GoddessFantasy: the explicitly authorized Chrome session produced 37 topics / 47 statblocks without inspecting or exporting cookies; 47/47 regenerated v14 Actors passed verifier plus expanded source-semantic review.
- [x] AI monster intake: a real Codex-OAuth-backed `gpt-5.4` Lurker IR reached accepted with zero deterministic/AI findings after full resume regeneration; the same source/IR verifies against fresh project-generated v12 and v14/core Actors, and the v14 Actor passed Foundry 14.364 / dnd5e 5.3.3 sheet/readback. Separate stochastic extraction failures correctly returned needs_review and promoted no formal Actor.
- [x] Historical 88-module snapshot: removed as a current product gate after reconciling the later 79-module local baseline and 2026-07-12 production changes. No current production count is claimed without a fresh inventory.

Chrome file access, the bounded standalone Item gate, and the authorized authenticated crawl are closed. Historical full-module evidence remains Partial, but the superseded 88-ID snapshot is not a current blocker and no present production count is inferred from it.

## Outside the current remediation authorization

- Rewriting Git history to purge large files from older commits.
- Bypassing protected-module signatures.
- Directly mutating Foundry LevelDB to avoid the supported import workflow.
- Inspecting or changing production merely because local Foundry acceptance is incomplete.
