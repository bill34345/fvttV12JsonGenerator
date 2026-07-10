# Foundry v14 Live Runtime Smoke Test

Status: pending

This is the remaining live-runtime acceptance gate for Foundry v14 support. Offline schema checks, workflow generation, and source-to-JSON review are recorded separately in `docs/acceptance/v14-source-json-full-review.md`.

## Locked Environment

Record the installed versions before importing any generated JSON:

| Component | Required version | Actual version | Result |
| --- | --- | --- | --- |
| Foundry VTT | `14.361` | Not recorded | Pending |
| dnd5e | `5.3.3` | Not recorded | Pending |
| MIDI-QOL, modded world only | `14.0.9` | Not recorded | Pending |
| DAE, modded world only | `14.0.12` | Not recorded | Pending |
| Times Up | Not installed or not required | Not recorded | Pending |
| Item Macro | Not required | Not recorded | Pending |

Use a disposable world. Run the `core` checks with MIDI-QOL and DAE disabled. Run the `modded-v14` checks in a separate world with only the locked module versions enabled. Do not use a migrated v12 world as acceptance evidence.

## Inputs

Regenerate the artifacts through the project workflows before importing them:

```powershell
bun run src/tools/v14AcceptanceSuite.ts --effect-profile core --out-dir "obsidian/dnd数据转fvttjson/output/v14-acceptance" --report "docs/acceptance/v14-core-batch-verification.md"
bun run src/tools/v14AcceptanceSuite.ts --effect-profile modded-v14 --out-dir "obsidian/dnd数据转fvttjson/output/v14-modded-acceptance" --report "docs/acceptance/v14-modded-batch-verification.md"
```

Required pre-import results for each profile:

- 6 samples generated.
- 6 schema checks passed.
- 0 failed samples.
- 0 actor verification warnings.
- The source-to-JSON review remains passing.

## Core Runtime Checks

For every JSON under `obsidian/dnd数据转fvttjson/output/v14-acceptance`:

- [ ] Import the Actor into the disposable core world without a schema or document error.
- [ ] Open the Actor sheet and confirm name, HP, AC, CR, senses, movement, and resources render.
- [ ] Open every embedded Item used by the sample checks below.
- [ ] Execute at least one attack, save, utility, reaction, or bonus-action Activity where the source provides one.
- [ ] Confirm rolls and chat cards complete without console errors.
- [ ] Confirm no `midi-qol.OverTime` automation is active in the core profile.
- [ ] Export the imported Actor and confirm the key semantic fields remain present after Foundry/dnd5e preparation or migration.

| Sample | Required interaction focus | Import | Sheet | Activities | Console | Re-export |
| --- | --- | --- | --- | --- | --- | --- |
| Slithering Bloodfin | Tail Crash attack, Death Burst save, Swallow bonus action, Pelagic Screech reaction | Pending | Pending | Pending | Pending | Pending |
| Chuul Nullifier | Pincer attack, Tentacles attack and attached conditions | Pending | Pending | Pending | Pending | Pending |
| Bonebreaker Dorokor | Multiattack, Longbow, War Cry recharge utility | Pending | Pending | Pending | Pending | Pending |
| White Tusk Shaman | Minion: Savage Horde, Multiattack, Blood-Searing Spear | Pending | Pending | Pending | Pending | Pending |
| Bleeding Guardian | Bleeding Bite attack with no module overtime behavior | Pending | Pending | Pending | Pending | Pending |
| GoddessFantasy Yithian | Pincer attack, Mind Swap recharge/save behavior | Pending | Pending | Pending | Pending | Pending |

## Modded v14 Runtime Checks

Repeat the import, sheet, Activity, console, and re-export checks using JSON under `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance` with MIDI-QOL `14.0.9` and DAE `14.0.12` enabled.

The required module-specific acceptance is deliberately narrow:

- [ ] All six Actors still import and operate without module hook, effect, or console errors.
- [ ] Bleeding Bite applies exactly one bleeding effect when the source-defined workflow succeeds.
- [ ] At the start of the affected target's turn, MIDI-QOL rolls exactly `1d6` piercing damage once.
- [ ] The initial `1d8 + 3` hit damage is not reused as overtime damage.
- [ ] Unrelated Actors and Items do not receive `midi-qol.OverTime` flags or bleeding automation.
- [ ] The behavior does not require Times Up or Item Macro.
- [ ] Disabling MIDI-QOL does not make the Actor or Item document impossible to open; manual handling remains possible.

DAE `14.0.12` coexistence without errors can pass here, but this checklist does not prove a DAE-specific automation contract. That remains separate work until a source-derived DAE behavior fixture exists.

## Failure Evidence

For every failed row, record all available evidence:

- Exact Foundry, dnd5e, MIDI-QOL, and DAE versions.
- Actor and Item names.
- Import dialog error or notification text.
- Browser console stack trace.
- Relevant Foundry server log excerpt.
- Screenshot of the incorrect sheet, Activity, effect, roll, or chat card.
- Re-exported Actor JSON when import succeeds but migration or runtime behavior is wrong.
- Whether the same artifact passes in `core` and fails only in `modded-v14`.

Do not repair an exported Actor manually and use it as acceptance evidence. Fix the project workflow, regenerate the JSON, and rerun the failed row.

## Acceptance Decision

| Gate | Result | Evidence |
| --- | --- | --- |
| Core profile imports all six Actors | Pending | Not recorded |
| Core profile sheet and Activity interactions | Pending | Not recorded |
| Modded profile imports all six Actors | Pending | Not recorded |
| MIDI-QOL bleeding behavior | Pending | Not recorded |
| No unrelated module automation leakage | Pending | Not recorded |
| Re-export preserves source semantics | Pending | Not recorded |
| No blocking console or server errors | Pending | Not recorded |

Foundry v14 runtime support passes only when every gate above is `Pass`. A partial result must remain `Partial` and list the failed rows. DAE-specific automation support must not be claimed from coexistence testing alone.

## Remaining Work Outside This Gate

These are separate from the live Actor import smoke test:

1. **Standalone Item v14 acceptance:** generate a real Item Markdown source through the CLI, compare the v14 Item JSON back to the source, import it, open it, and execute its Activities. Current v14 Item coverage is unit-level rather than end-to-end semantic acceptance.
2. **DAE-specific behavior fixture:** add a source-derived case that requires a documented DAE `14.0.12` contract. The current modded fixture proves MIDI-QOL bleeding overtime only.
3. **Versioned local module references:** preserve exact MIDI-QOL `14.0.9` and DAE `14.0.12` manifests or source snapshots locally and document every generated module field against them.
4. **Real GoddessFantasy v14 crawl:** run the authenticated live-site crawl through plaintext and Actor generation. Current v14 acceptance uses a local HTML fixture.
5. **Broader real-input corpus:** expand beyond the current six-sample v14 batch. The vault currently contains more inputs than the acceptance suite reviews semantically.
6. **User documentation:** add v14 CLI, Web, crawler, `core`, and `modded-v14` examples to the main manual or README after runtime behavior is accepted.

These items do not invalidate the completed offline Actor source-to-JSON review. They limit which parts of the overall v14 workflow can be called fully accepted.
