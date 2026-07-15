# Safe Delivery Checklist

This checklist separates repository delivery gates from deeper product-support claims. The canonical current claim boundary is [`docs/acceptance/current-support-matrix.md`](acceptance/current-support-matrix.md).

## Commit boundaries

1. Preserve user-owned workspace changes and stage only the intended remediation files.
2. Keep source/parser/generator changes separate from acceptance-document reconciliation when practical.
3. Generate final Actor/Item JSON only through the project CLI or workflows; never hand-repair deliverables.
4. Keep `.local` runtime data, credentials, cookies, raw logs, and production inventories untracked.
5. A clean command or schema check is mechanical evidence; source review and real runtime behavior are separate acceptance layers.

## Required repository gates before push

- [x] `bun run ci:verify` passed on 2026-07-15: 738 tests / 2,921 expectations, both typechecks, production coverage, 109-source anti-overfit, 1,602-path hygiene, locked dnd5e reference verification, Web build, and offline Actor smoke.
- [x] The focused current corpus command passed 148 tests / 656 expectations across 11 files.
- [x] v14 core and modded acceptance batches retain six schema-valid samples each with zero actor-verification warnings.
- [x] Representative v12/v14 Shield and v14 core/modded Damage-Bound Warden CLI outputs were read against their source Markdown.
- [x] Acceptance documents retain **Fail / Partial** for exact production-equivalent module coexistence and distinguish the reduced 84-module startup from parity.
- [x] Repository hygiene confirms no tracked `.local` runtime data, user database, password, cookie, private key, raw server log, or production inventory snapshot.
- [ ] Immediately before a real push, confirm `git status --short` contains only the intended staged delivery. Existing user-owned edits are not part of this remediation and must not be staged or overwritten.

## Product gates still open

- [ ] Standalone Item v14: import the real CLI Shield, equip it, verify AC, exercise both Activities and prone handling, export/read back, and compare source-relevant fields.
- [ ] DAE/MIDI `isDamaged`: import the real modded-v14 Actor, apply the source-derived condition through its Activity, deal actual damage, prove removal, and run a core/consumer-inactive control.
- [ ] Authenticated GoddessFantasy: receive explicit session/credential authorization, run the authenticated incremental pipeline without exposing secrets, and review provenance plus generated semantics.
- [ ] Exact production-equivalent module coexistence: load the exact authorized valid package set and pass representative workflows without the known runtime errors.

The first two gates are currently blocked by the user-controlled Chrome extension file-URL permission. The authenticated crawl and protected/full module set require new authority or external state. Their open state does not invalidate the repository and bounded CLI gates above, but it prevents a blanket “complete v14 support” claim.

## Outside the current remediation authorization

- Rewriting Git history to purge large files from older commits.
- Bypassing protected-module signatures.
- Directly mutating Foundry LevelDB to avoid the supported import workflow.
- Inspecting or changing production merely because local Foundry acceptance is incomplete.
