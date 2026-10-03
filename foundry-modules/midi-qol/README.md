# Midi-QOL ServerNext compatibility patch

This is the retained historical6.0.2/local.9 tool and patch route. Current
ServerNext is6.0.5/local.10; the two request-bonus handler corrections were
already integrated separately. Do not rebuild this older lock and overwrite
the accepted current installation. Its installer remains bound to the old
target. Current state is only in
`docs/plan/server-next-migration-handoff-20260927.md`; see the2026-10-01
request-bonus review for the limited local.10 acceptance.

This directory carries a reproducible patch against an exact official Midi-QOL commit. It does not vendor the upstream repository or reuse the dirty external checkout.

The supported target is Foundry 14.368, dnd5e 6.0.2, world `cor-cotn`, and the `server-next` data root. `server-mirror` is read-only and is rejected by the installer.

## Workflow

1. `bun run midi-qol:upstream-check` reports the current official releases, branches, and open merge requests. This is advisory; a build always uses the commit in `upstream.lock.json`.
2. `bun run midi-qol:build` creates a clean source checkout under `.local/midi-qol`, verifies the lock and patch hashes, records baseline and patched TypeScript diagnostics, applies the patch exactly, and builds a candidate ZIP.
3. `bun run midi-qol:test` runs the patch-contract, archive, and install-target rejection tests.
4. `bun run midi-qol:install` performs a dry-run against ServerNext. Add `--apply` only for the exact stopped ServerNext target after the candidate and checks pass.

Historical 6.0.2 tests read only `.local/midi-qol/test-sources/dnd5e-6.0.2/dnd5e.mjs`;
they do not read the currently installed ServerNext system, which may have moved to
6.0.5. Obtain `dnd5e-release-6.0.2.zip` from the official
[`release-6.0.2`](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.2)
asset URL recorded in that release's `system.json`, extract **only** its root
`dnd5e.mjs` into the ignored directory above, and verify SHA-256
`e9570927a215948fb3a3923a322c7bbf1455009565f48813168edd8c6df4890f`.
The shared test reader enforces that digest and fails if the file is absent or
different. This is a historical test input, not a system install or a 6.0.5
compatibility claim.

The build and installer never call the upstream `dev`, `clean`, or `tag` tasks. They do not create backups, modify worlds, or operate on `server-mirror`.

The local.3 candidate gives each of three ordinary cleanup effects (template, summon, transform) a fresh `_id`, top-level `type: "base"`, and `system: { changes: [] }`. This prevents dnd5e's migration from matching an undefined document ID against an undefined status ID. `BaseEffectData` does not declare `system.type`; the local.2 attempt to supply it was incorrect and failed the real workflow. That cleanup patch leaves copied, restored, condition, and enchantment paths unchanged; the separate local.7 candidate below addresses the observed enchantment clone failure. Actual creation, type/model and dependency cleanup still require Chrome acceptance.

## Focused C/F fixture

`bun run midi-qol:prepare-cf` builds an importable Script Macro and a checked test Item input in `dist/cf-fixture`. It does not connect to or modify Foundry. The macro creates only tagged temporary documents through native APIs, reads back the effective 1-minute / Circle-30-ft / creature-target configuration, and refuses to cast if it differs. The cast uses the installed activity workflow; effect deletion must cause region deletion through the real dependency implementation. Its constructor probes are diagnostic and never count as workflow acceptance.

ServerNext/30002 is a permanently running shared service. This fixture never starts, stops, restarts, installs modules, changes global Midi settings, activates a scene for other users, or deletes pre-existing campaign objects. The Chrome executor must preserve the service when it finishes.

Local.5 adds a separate restored-workflow Item/Activity patch: for dnd5e 6+, recover a scaled activity through the native chat-card resolver, then use its Item or the native associated-item resolver before the legacy flag fallback. This addresses optional manual Damage throwing on a valid dnd5e 6 card with no legacy item flag, and avoids access-order-dependent loss of system.scaling. Local.4 was built but rejected in review before deployment for the latter issue. The cleanup patch remains unchanged. Source regression and browser retesting are separate gates.

Local.6 adds independent patch 0003 for damage-tray target rendering. On the fixed dnd5e 6 target, Actor-only or actorless/missing Token references become explicitly unavailable text rows before the native Token-only builder is called. They contain no damage total or actionable target option; valid targets keep their original calculation/application behavior. Source and native-parent regression tests do not replace browser verification.

The separate `browser-update.ts` entry is pinned to a local.7-to-local.8 browser-resource update without service operations; see the runbook. A running server may continue to advertise cached local.7 metadata. The fixture compares methods, accessors, damage rendering, enchantment cloning, and the new ActiveEffect creation override against the candidate ZIP. The browser must execute those exact functions before its behavior is attributed to local.8. Refresh only the test tab after a successful update and between active scenarios.

Local.7 completed its scoped A–G/Z checklist (35/35) on 2026-09-22; those results retain their original version and evidence. Local.8 adds independent patch 0005 after a separate Batch 6 DAE/Tidy test found ordinary ActiveEffect creation failing. In dnd5e 6.0.2, an ID-less ordinary effect can match an ID-less status entry and be migrated to an invalid condition. The new Midi-owned subclass override supplies an ID before that migration only for newly created, non-condition effects on dnd5e 6; explicit IDs, native condition effects, and other versions retain their original path. Offline source checks and a built candidate do not establish local.8 browser acceptance. No Foundry/dnd5e prototype or global status definition is changed.

Local.9 adds independent patch 0006 for the Batch 6 AL manual-APPLY `isDamaged` timing failure. With dnd5e 6 and `autoApplyDamage="none"`, calculated damage still runs Midi hooks and macros, but DAE `isDamaged` expiry waits for the Midi usage card's own APPLY. The tray requires the exact originating message, a post-write `dnd5e.applyDamage` event, positive HP or temp HP loss, and matching final actor readback before recording a new application. An existing Midi GM action first stores and reads back an independent target Actor flag containing the exact effect UUIDs for this card and damage selector; only those effects can then expire. A retry or fresh client reconciles that snapshot even if HP is already zero, and does not remove an effect added later if completion marking failed. Effects already marked `duration.expired` or disabled also count as settled. If a later target's native APPLY fails, confirmed earlier targets are finalized before the original failure propagates. Cancelled, zero, mismatched, or unrecognized new applications leave the effect in place. Automatic modes retain their existing path. Manual `isDamaged.<type>` remains unexpired because the post-write hook does not prove a positive contribution from that exact type. On 2026-09-25 the ServerNext GM used a normal Dagger attack and manual damage card: before APPLY the target had HP 40 and the base `isDamaged` effect; after one APPLY it had HP 28 and the effect was removed. This closes that scoped behavior, with task fixtures cleaned. Typed-duration, temporary HP, cancel/retry, and other distinct paths remain outside that observation.
