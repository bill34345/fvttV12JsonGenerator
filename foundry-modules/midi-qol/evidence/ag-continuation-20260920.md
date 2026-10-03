# A–G continuous acceptance handoff

**Candidate update after the initial handoff:** local.6 is now installed as browser resources; server PID remains 11188 and may still advertise local.2. The initial local.3 identity below is historical. Use batch6K `local6-client-build.json`, `local6-build-result.json` and `local6-browser-update-applied.json` for current hashes. The first four Workflow fingerprints are unchanged from local.5; verify the new damage-target-builder fingerprint as well. The preserved manual-Damage failure already passed on local.5; keep that evidence. Scaled activity, unavailable/valid target rendering and remaining A–G work continue with no overall time limit.

## Current user authorization

The user explicitly requested continuing until all A–G behavior is handled and verified, removed the artificial time limit, requested Full Access, and invoked chrome-delegation-dev again. This supersedes this task's old 25-minute handoff and the repository's default 30-minute autonomous-session limit for this authorized acceptance effort. Elapsed time and network problems are still recorded, but no time cutoff or single-gate boundary completes the task. This exception is task-specific, not a change to global AGENTS or other work.

The root integrates source fixes and follows up on genuine blockers; the independent Chrome executor runs all remaining feasible cases and sends a completion/failure callback. Do not treat one scenario's success, a report file, or a child final answer as overall completion. A failing case may be isolated while independent cases proceed. Previously passed, unaffected cases can retain their exact linked evidence; an evidence gap is grounds for a targeted recapture, not an automatic complete rerun.

## Exact target and permissions

- Carrier checkout: `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration`, branch `codex/20260919-151319-server-next-migration`, HEAD `b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d`.
- Runtime: `http://127.0.0.1:30002`, ServerNext data root `F:\FoundryLab\foundry-v14\data\server-next`, Foundry 14.368, dnd5e 6.0.2, world `cor-cotn`.
- Existing permanent service: PID 11188 at handoff. No start/stop/restart, options-lock removal, or global scene activation. Other tasks share this instance.
- Server Mirror / 30001 read-only; no production actions, database editing, commit, merge, push, backups or public distribution.
- User explicitly authorized empty-password test-account login, and native test-account management to make it empty if necessary. It already worked for Gamemaster. No repeated permission request is needed for login or deleting positively identified task-owned fixtures.
- Full Access was explicitly requested. Host config currently declares `default_permissions = ":danger-full-access"`; the thread-creation API exposes no separate permissions field. Executor must record its actual runtime permission profile and use granted capabilities, rather than claiming a prompt changes the sandbox or bypassing a denied action. Report a genuine permission blocker with exact tool evidence.
- Executor may author and repair **test-only** fixture scripts/macros in its own task directory, or a uniquely named scratch directory under this checkout's ignored `.local` directory. Do not concurrently edit business source or the parent's maintained harness. A real source bug is sent to the root for a minimal patch/build/deployment and a focused retest; it does not close the remaining A–G work.
- Native document creation, activity execution, owned fixture HP/config setup, and owned fixture deletion are authorized. Prefer item/activity/session options. If an essential test setting must be changed, snapshot it, record why, and restore it only if its current value still equals this task's temporary value. Do not overwrite another task's intervening configuration changes. Do not directly write live LevelDB or patch prototype/Math.random/Workflow results.

## Candidate identity

- Candidate `14.6.0-beta.4338eeab.local.3`, pinned upstream `4338eeab85041cd71b76ede36818e2265cbf06ae`.
- ZIP SHA-256 `29E180D1093F6FB2A3006B7C4E99C887E933E08D67EC328640DFC1D74B16115B`.
- Browser bundle SHA-256 `84B1CF21529779ABE5E345951DBD79CAB0507E3D052966D0D44DF80350AF50CA`.
- Actually executing `Workflow.setupTemplateCleanup` fingerprint `a9e8202ab7aea206c314469c96bc28fcd11e448be9ee7c077319e58497b34620`.
- Actually executing `WorkflowState_RollFinished` fingerprint `727433a80fcf5e21735f9bb7b2e261c04a1ce004196e5124d540be3c5c1b3b17`.

The permanent server may advertise cached local.2 metadata. Distinguish that from the tested client methods; never restart the service to make the label change. The existing prepared macro at `foundry-modules/midi-qol/dist/cf-fixture/` checks both method fingerprints; its normal-template fixture is already useful reference code. Do not execute code via hidden browser-control channels: use supported external Chrome controls and the native Foundry Script Macro authoring/import UI for explicitly authorized test fixtures.

## Order and acceptance

G evidence collection starts before the first activity and continues through all cases. Run A, D, C, E, B, then remaining F cases, carrying forward reliable unaffected evidence. Each row needs subcase results, source/activity definition, caster/target Actor and Token UUIDs, settings, workflow/chat references, before/after state and actual evidence.

| Gate | Required closure |
|---|---|
| A | Normal hit, miss, critical, natural 1. Under on-hit-only auto damage, fumble must not enter an incorrect hit set or automatically apply hit damage. Manual damage controls alone are not a failure. Record actual rolls, hit sets, damage workflow and HP. |
| D | Establish concentration, damage the exact holder, verify DC, successful retention, failed removal and dependent effect cleanup. Real native rolls/actions required; no forged workflow/check results. |
| C | Correct affected Actor/synthetic Actor receives configured DAE effects. Verify ordinary/condition/enchantment types, duration and removal/expiry. Check the Item/activity really has the relevant effect and application enabled before judging failure. |
| E | Reaction prompt, accept, cancel/reject, correct resource consumption and reaction state; reject/cancel must not consume an accepted reaction's resources. |
| B | Actual activity definitions drive successful/failed saves and half/no damage. Verify numeric HP effects and multi-target identity rather than chat buttons alone. |
| F | Template placement, multi-target save/damage, ordinary cleanup creation/link/cascade, plus normal summon and transform cleanup paths. The latter two have source tests but no runtime acceptance yet. |
| G | No stuck workflows or new Midi-attributable errors; inspect Troubleshooter and available Console/log surface, record network request failures and classify cause. No missing evidence silently becomes PASS. |

Prior evidence: `batch6E-midi-qol-beta-e2e/retry-automation-profile-2` has partial old-build A/B/E/F gameplay; batch6J confirms local.3 ordinary template-chain observations but lacks verbatim JSON and Console. It does not close whole C/F. All batch6J world fixtures, including its final Macro, were removed. Calendaria's observed error timestamp falls within the old run; attribution remains uncertain, not automatically historical.

## Evidence and continuation

Verified source preparation pointers (read-only explorer): GM auto-damage uses `ConfigSettings.gmAutoDamage`, not the player `autoRollDamage`; `onHit` relies on the actual `hitTargets`/`hitTargetsEC` sets (`utils.ts:4315`, `Workflow.ts:1263`). Check `autoCheckHit` and actual targeting. For concentration, prefer normal activities and native damage application; Midi's `preUpdateActor` observes real HP loss (`Hooks.ts:152`), with `doConcentrationCheck`, `removeConcentration` and the system concentration setting recorded. dnd5e exposes `actor.getConcentrationDC(damage)`; calculate expectations using the active rules, not a hard-coded alternate edition.

For summon, use the activity's normal initial `.use()` with a valid test-Actor profile, `summon.prompt:true` and `autoRemoveSummonedCreature`; the delayed chat-card Summon button lacks the associated Midi workflow (`activities/SummonActivity.ts:11,48`, `Workflow.ts:1508,3081`). For transform, use a normal transform activity with a fixed test-Actor profile, `transform.mode:""`, selected test Token and `autoUndoTransformations`. To cover the patched ordinary cleanup effect, avoid that Item's concentration effect; otherwise the transform UUIDs attach to concentration instead (`activities/TransformActivity.ts:73`, `Workflow.ts:3148`, `Hooks.ts:216`). These are source prerequisites, not runtime results.

New evidence root: `F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6K-midi-qol-local3-ag-20260920`.

Before building a large fixture, prove an evidence capture route: a small known-value native macro panel or native export, then verify exact data lands in a readable file. Use supported DOM reads of the visible textarea if available. If unavailable, record exact tool limitation and provide inspectable UI evidence; do not spend a whole run repeatedly trying an unsupported download path, and do not label reconstructed summaries as raw exports. Keep task-owned provenance flags and a document inventory; preserve raw snapshots incrementally before cleanup.

For networking, record URL/category, time, HTTP or browser error and reproducibility. Diagnose local service reachability versus Chrome control versus unrelated remote assets without altering global network/security settings or stopping shared services. Normal recovery of the task's own tab/session is authorized. A genuine tool/permission or code blocker is returned with enough evidence for the root to act; it is not an excuse to mark the remaining scope complete.

The child sends `Chrome 子任务回传` to verified parent `01a0b8d1-e8db-70f2-9662-fd9beb035162`. Include A–G subcase ledger, raw evidence availability, exact failures, configuration restoration, owned-object cleanup, service-left-running and remaining gaps. No routine progress callbacks or polling supervisor. Root resumes from substantive completion/blocker callbacks and continues the authorized overall task until the full matrix is resolved.
