# ActiveEffect source and test evidence — 2026-09-20

## Corrected model conclusion

The earlier local.2 explanation was incorrect. In the installed dnd5e 6.0.2 source, `BaseEffectData.defineSchema` does not define `system.type`; `ConditionData.defineSchema` adds it as a required nonblank field. Foundry 14.368 `TypeDataField` chooses a model from the document's top-level `type`, not from a second discriminator in `system`.

Exact local source anchors:

- Foundry `common/data/active-effect.mjs`: core `ActiveEffectTypeDataModel` defines `changes` only.
- Foundry `common/data/fields.mjs`, `TypeDataField.initialize` / `_validateRecursive`: selects the system model using top-level document type.
- dnd5e `dnd5e.mjs`, `ActiveEffect5e._initializeSource` (around 12591): when a non-condition effect's `_id` equals a registered status `_id`, merges `{ type: 'condition', 'system.type': data.statuses?.[0] }`.
- dnd5e `ConditionData` (around 7437) and `BaseEffectData` (around 82940): distinct schemas.

The dnd5e bundle SHA-256 is `E9570927A215948FB3A3923A322C7BBF1455009565F48813168EDD8C6DF4890F`. The offline test rejects a changed bundle instead of silently claiming the same version semantics.

## Reproduced failure mechanism

`effect-model-source.test.ts` imports real Foundry common model/helpers in Node 24.17.0, extracts the real dnd5e migration method, and captures the data passed to its superclass. It does not launch Foundry or access a database.

| Input and status registry | Result handed to superclass |
|---|---|
| Fresh no-ID base effect; one registered status lacks `_id` | `condition`, missing `system.type` |
| local.2 shape; same missing-ID status | `condition`, `system.type='base'` |
| Base effect with a fresh defined ID; same status | stays `base` |
| Fresh no-ID base effect; all status IDs defined | stays `base` |
| Actual matching status ID and `statuses=['poisoned']` | legitimate `condition`, `system.type='poisoned'` |

The erroneous match is `undefined === undefined`. Real `mergeObject` preserves the local.2 string when the incoming migration value is undefined. Thus local.2 can mask the validation error while retaining the wrong document type. It cannot be accepted based on absence of a toast.

Monk's Little Details has a potential source of ID-less registrations when its extra-status feature inserts user-defined statuses without `_id`. This is a source-level lead, not a proven runtime attribution. dnd5e itself normally assigns status IDs; actual `CONFIG.statusEffects` must be inspected in the running client.

## Real Midi source tests

`real-workflow-source.test.ts` verifies the locked commit, Git blob, candidate Workflow hash, patch hash and dependency lock. It extracts and transpiles the actual `setupTemplateCleanup` method and the actual `WorkflowState_RollFinished` prefix through summon/transform cleanup. With dependency stubs it captures creation payloads and tests duration/start, flags, dependentOn writes, existing-effect reuse and transformed UUID merging. Local.3 adds negative mutations for `_id` alongside type/system; removing the three added properties at each factory must restore the upstream Workflow byte-for-byte after newline normalization.

These are source behavior tests, not live Foundry model/cascade proof. Local.3 expects a fresh ID, base document type and changes-only system data. Local.2 remains a negative control in the real migration probe.

## Runtime proof still required

The C/F harness creates and reads back a one-minute, non-concentration Circle-30-ft activity, runs the installed normal activity use/placement workflow, then inspects the actual cleanup effect and Region dependency. It records live ID-less status registrations and constructor-only controls separately from C/F acceptance. A condition effect whose `system.type` says `base` is FAIL, not PASS.

Batch6I subsequently confirmed the failure in the live client: a valid one-minute Circle activity reached setupTemplateCleanup and failed document creation with the original schema error. The same-session no-ID local.2 constructor probe became condition; the fresh-ID control remained base. The report is at `F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6I-midi-qol-cf-prepared-20260920\report-resumed-20260920.md`. Its JSON was reconstructed from displayed evidence rather than exported verbatim; do not treat it as a complete raw trace.

Foundry `client/data/client-backend.mjs` cleans createData before constructing the client Document. The base model can strip the invalid system.type before dnd5e's missing-ID migration; this explains why local.2 constructor-only success did not prevent the real create failure. Local.3 supplies a valid new ID before that path. The test harness must never inject the fix into Workflow; acceptance checks the executing methods against the built candidate and uses native activity creation/deletion. Browser-only resource replacement must preserve the user's permanent service and existing packs.
