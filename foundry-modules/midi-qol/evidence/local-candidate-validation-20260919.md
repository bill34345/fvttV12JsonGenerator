# Midi-QOL ServerNext local candidate validation

Target: Foundry 14.368, dnd5e 6.0.2, `cor-cotn`, `server-next`.

## local.1 — rejected

- Version: `14.6.0-beta.4338eeab.local.1`
- ZIP SHA-256: `FF11CEB0C246458BC7129563C0399398631B7D710A4B878B98B153756C093A74`
- Static patch tests, TypeScript baseline/candidate comparison, build, archive verification, install dry-run, install, and server smoke passed.
- External Chrome reproduced `system.type may not be undefined` during template placement. The bundle contained top-level `type: "base"`; this disproved the sufficiency of local.1 in that environment, but did not establish which system model had been selected. The earlier claim that base effects require a `system.type` discriminator was not supported by source.
- Result: `FAIL`; do not install or distribute.

## local.2 — historical candidate, rejected by 2026-09-20 runtime evidence

- Version: `14.6.0-beta.4338eeab.local.2`
- ZIP SHA-256: `895520AF6402E542B4EA4582AF221036B5AAA26F0CA987C639491807AE5ADC36`
- Patch initializes both top-level `type: "base"` and `system: { type: "base", changes: [] }` for Midi-created template, summon, and transform cleanup effects.
- Focused tests: 6 PASS, including negative mutations for missing document type and missing typed system data.
- Upstream and candidate TypeScript checks: 0 / 0; archive: 148 entries with module ID `midi-qol`.
- Installation identity gate and clean second cold-start passed. The first start repaired and migrated the two module compendia; the second start did not repeat those errors. Known unrelated `demon-queen-awakens` signature errors remained.
- Chrome placed one 30 ft Circle without a visible schema toast, but did not inspect the correct Actor cleanup effect or dependent deletion chain. A second focused task left the activity at Self/Instantaneous and never entered `setupTemplateCleanup`.
- Historical runtime state was `PARTIAL`. The later batch6I run with correct duration/Circle configuration reached the real cleanup path and reproduced `system.type may not be undefined`; creation/link are now `FAIL` and cascade `NOT_EXECUTED`. A/B/D/E and full G remain incomplete. No claim of complete compatibility is permitted.

The external dirty Midi-QOL checkout was not modified; its four pre-existing package files retained their original hashes. Runtime reports remain under the private ServerNext evidence root and are not copied into the repository.

## 2026-09-20 correction and focused evidence work

- In installed dnd5e 6.0.2, `BaseEffectData.defineSchema` has no `system.type`; `ConditionData.defineSchema` adds it as required. Therefore local.2's extra field cannot be called a proven base-effect requirement.
- `ActiveEffect5e._initializeSource` can migrate to condition on `_id` equality with a registered status. A fresh effect and a status registration both lacking `_id` are a concrete collision hypothesis; actual runtime status registrations and final effect type must be read back.
- Manual synthetic Workflow strings are being replaced with tests executing methods extracted from the pinned Midi source. Stubbed methods prove creation payload/control flow, not Foundry data-model correctness or real region deletion.
- The C/F fixture now builds a test macro with checked input and mandatory runtime readback of duration/geometry/targets. It calls the installed activity workflow, records resulting effects/links, and deletes only the effect when testing cascade.
- ServerNext/30002 is permanently running by user instruction. No testing task may start, stop or restart it. Each test uses and cleans only tagged temporary documents; global Midi settings and existing campaign documents remain untouched.
