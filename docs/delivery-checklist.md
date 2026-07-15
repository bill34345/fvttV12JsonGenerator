# Safe Delivery Checklist

This checklist separates repository delivery gates from deeper product-support claims. The canonical current claim boundary is [`docs/acceptance/current-support-matrix.md`](acceptance/current-support-matrix.md).

## Commit boundaries

1. Preserve user-owned workspace changes and stage only the intended remediation files.
2. Keep source/parser/generator changes separate from acceptance-document reconciliation when practical.
3. Generate final Actor/Item JSON only through the project CLI or workflows; never hand-repair deliverables.
4. Keep `.local` runtime data, credentials, cookies, raw logs, and production inventories untracked.
5. A clean command or schema check is mechanical evidence; source review and real runtime behavior are separate acceptance layers.

## Required repository gates before push

- [x] `bun run ci:verify` passed on 2026-07-15: 743 tests / 2,932 expectations, both typechecks, 87.55% line / 88.41% function production coverage, 109-source anti-overfit, 1,605-path hygiene, locked dnd5e reference verification, Web build, and offline Actor smoke.
- [x] The focused current corpus command passed 148 tests / 656 expectations across 11 files.
- [x] v14 core and modded acceptance batches retain six schema-valid samples each with zero actor-verification warnings.
- [x] Representative v12/v14 Shield and v14 core/modded Damage-Bound Warden CLI outputs were read against their source Markdown.
- [x] Acceptance documents retain **Fail / Partial** for exact production-equivalent module coexistence and distinguish the reduced 84-module startup from parity.
- [x] Repository hygiene confirms no tracked `.local` runtime data, user database, password, cookie, private key, raw server log, or production inventory snapshot; the latest M10 run checked 1,605 tracked paths.
- [ ] Immediately before a real push, confirm `git status --short` contains only the intended staged delivery. Existing user-owned edits are not part of this remediation and must not be staged or overwritten.

## Product gates still open

- [ ] Standalone Item v14: import/equip/AC/both Activities/prone/limited-use/concentration/runtime-readback pass; capture the remaining supported UI Export Data download and compare source-relevant fields.
- [x] DAE/MIDI `isDamaged`: the real CLI modded-v14 Actor retained the effect before damage and removed it after locked DAE 14.0.12 + MIDI-QOL 14.0.9 damage; the real CLI core control retained it after damage.
- [ ] Authenticated GoddessFantasy: receive explicit session/credential authorization, run the authenticated incremental pipeline without exposing secrets, and review provenance plus generated semantics.
- [ ] Exact production-equivalent module coexistence: load the exact authorized valid package set and pass representative workflows without the known runtime errors.

Chrome file access is no longer a blocker. The standalone Item gate is now open only for a captured supported UI export/download comparison. The authenticated crawl and protected/full module set still require new authority or external state. Their open state does not invalidate the repository and bounded runtime/CLI gates above, but it prevents a blanket “complete v14 support” claim.

## Outside the current remediation authorization

- Rewriting Git history to purge large files from older commits.
- Bypassing protected-module signatures.
- Directly mutating Foundry LevelDB to avoid the supported import workflow.
- Inspecting or changing production merely because local Foundry acceptance is incomplete.
