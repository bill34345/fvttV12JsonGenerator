# C/F focused runtime protocol — 2026-09-20

Target: the already-running ServerNext at `http://127.0.0.1:30002`, Foundry 14.368, dnd5e 6.0.2, `cor-cotn`, Midi-QOL local.3 client code. The permanent server may advertise cached local.2 metadata; the macro requires exact SHA-256 fingerprints of both actually loaded Workflow methods and records the distinction. Reload only this test tab after the parent's verified browser-resource update. This Chrome round has no process, lock-file, module installation or global-settings permissions. Never stop/restart the server, even on failure or timeout.

## Prepared artifact

Run `bun run midi-qol:prepare-cf` before dispatch. Import `foundry-modules/midi-qol/dist/cf-fixture/cf-macro.json` as a Script Macro named `E2E-MIDI6-CF-20260920-Harness`. The equivalent bundled command is `cf-macro.js` in the same directory. Only the imported Macro needs manual setup; do not rebuild the Actor/Item in sheet forms.

The macro is a reviewed test harness, not a patch to Midi/Foundry. It creates a tagged caster, target, embedded spell and client-local test Scene through native document APIs. Test input is one minute, non-concentration, Circle radius 30 ft, creature targets, range 120 ft, template prompt enabled. It validates the live activity data after creation and before use. If the readback differs or the runtime class is not MidiUtilityActivity, stop before casting and export the precheck error.

## Required order and proof

1. Prepare and verify. Capture PRECHECK PASS and live Activity duration/range/target, caster and target UUIDs. Capture constructor-only model probes and status registrations without `_id` as diagnostics; these do not count as gameplay proof.
2. Cast and place Circle. This calls the installed `activity.use` and opens the normal placement preview. Click near the marked target token on the canvas. Do not directly create a Region or ActiveEffect to imitate the expected result.
3. Inspect effect and links. Export/copy the evidence JSON. Require exactly one ordinary cleanup effect, top-level type `base`, system class corresponding to the registered base model, correct duration, and exact Region/Template `flags.dnd5e.dependentOn` equal to that effect UUID. A condition effect with `system.type=base` is a failure, even without a toast.
4. Delete cleanup effect only. This deletes only the verified effect via its native `delete()`. The test harness waits for the real dependency implementation to remove the referenced Region/Template. Require `cascadePass=true`; never manually delete the Region before measuring this result.
5. Open Troubleshooter using the panel button, inspect Errors and distinguish errors since this run started. Native DevTools access is optional; if unavailable record the Console gap. Do not clear prior Troubleshooter errors.
6. Export pre-cleanup JSON, then Cleanup owned fixture, then export/copy final evidence. Read the exact visible textarea value using supported browser DOM reads and save it verbatim if download export is unavailable; do not reconstruct a summary and label it raw JSON. Ensure all flagged Actors/Items/Tokens/Scene/effects/regions are gone. Remove the temporary harness Macro after preserving the evidence. Keep unrelated documents and the shared server intact.

## Reporting

Budget: 25 minutes total, with the last 5 minutes reserved for evidence and cleanup. If import/setup cannot be completed within the first 5 minutes, report the actual tool limitation promptly rather than spending the round recreating sheet fields. The endpoint staying up is part of cleanup success.

Return separate PASS/FAIL/NOT_EXECUTED results for configuration readback, activity execution, effect type/model, dependentOn link, effect-to-region deletion, Troubleshooter, cleanup and server-left-running. Include the artifact hash, runtime identity and exact test-owned document UUIDs. A mere placed circle or missing toast is not C/F acceptance. This round makes no claims about attack/save/concentration/reaction or summon/transform gameplay coverage.
