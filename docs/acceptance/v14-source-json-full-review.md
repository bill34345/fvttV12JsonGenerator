# Foundry v14 Source-to-JSON Full Review

Reviewed on: 2026-07-09

## Scope

This review covers the current Foundry v14 acceptance artifacts generated through the project workflow:

- Core profile report: `docs/acceptance/v14-core-batch-verification.md`
- Modded v14 profile report: `docs/acceptance/v14-modded-batch-verification.md`
- Core JSON output: `obsidian/dnd数据转fvttjson/output/v14-acceptance`
- Modded v14 JSON output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance`

The review compares generated Actor JSON back to the source markdown, following `docs/generated-actor-verification.md`. It is not a live Foundry runtime import smoke test.

## Mechanical Results

- `v14AcceptanceSuite` was rerun for `core`: 6 samples, 6 passed schema spot checks, 0 failed samples, 0 verification warnings.
- `v14AcceptanceSuite` was rerun for `modded-v14`: 6 samples, 6 passed schema spot checks, 0 failed samples, 0 verification warnings.
- The generated JSON was parsed and spot-checked for actor name, HP, AC, CR, senses, item count, module flags, and known pollution strings.
- No generated JSON contained `<think>`, `MiniMax`, `openai-compatible`, or `Times Up: required`.
- Core profile JSON contains no `midi-qol.OverTime`.
- Modded v14 profile JSON contains `midi-qol.OverTime` only on `v14-modded-bleeding-guardian.v14.json`.

## Source-to-JSON Review

| Sample | Source path | Result | Notes |
| --- | --- | --- | --- |
| Slithering Bloodfin | `obsidian/dnd数据转fvttjson/input/slithering-bloodfin.md` | Pass | Name, HP `142 (15d10 + 60)`, AC 16 natural, CR 9, blindsight 100 ft., and reviewed actions/effects match the source summary. No actor verification warnings. |
| Chuul Nullifier | `obsidian/dnd数据转fvttjson/input/chuul-nullifier.md` | Pass | Name, HP `127 (15d10 + 45)`, AC 17 natural, CR 6, darkvision 60 ft., and actions including Pincer/Tentacles match the source summary. No actor verification warnings. |
| Bonebreaker Dorokor | `obsidian/dnd数据转fvttjson/input/bonebreaker-dorokor.md` | Pass | Core combat stats and attacks are preserved. Item names now remain source-faithful, including `Multiattack` and `War Cry`. No actor verification warnings. |
| White Tusk Shaman | `obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md` | Pass | Core combat stats and spear action are preserved. Item names now remain source-faithful, including `Minion: Savage Horde` and `Multiattack`. No actor verification warnings. |
| Bleeding Guardian | `obsidian/dnd数据转fvttjson/input/v14-modded-bleeding-guardian.md` | Pass | Name, HP `22 (4d8 + 4)`, AC 13, CR 1, Bleeding Bite attack, and source-derived bleed automation match the fixture. No actor verification warnings. |
| GoddessFantasy Yithian Fixture | generated plaintext fixture in `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/goddessfantasy-yithian.md` | Pass | Crawl-to-plaintext-to-actor flow regenerated a v14 Actor with matching name, HP `180 (19d10+76)`, AC 14, CR 15, truesight 60 ft., and reviewed actions. No actor verification warnings. |

## Module Profile Review

The profile split behaves as intended for the current fixtures:

- `core` strips module automation and emits no `midi-qol.OverTime`.
- `modded-v14` preserves the source-derived bleeding automation:
  - `turn=start,damageRoll=1d6,damageType=piercing,label=Bleeding`
- The bleeding automation does not leak into unrelated samples.
- No v12-only module assumptions were used as proof of v14 runtime correctness.

## Acceptance Conclusion

Foundry v14 generation is mechanically passing for both `core` and `modded-v14`, and all 6 current samples pass source-to-JSON semantic review without actor verification warnings.

The previous English markdown item-name fidelity defects are resolved:

- `Bonebreaker Dorokor`: `Multiattack` and `War Cry` are source-faithful item names.
- `White Tusk Shaman`: `Minion: Savage Horde` and `Multiattack` are source-faithful item names.

The current batch can be treated as source-faithful for project-internal v14 acceptance, subject to the runtime-import risk below.

## Remaining Risk

Live Foundry v14.361 + dnd5e 5.3.3 import and sheet interaction smoke testing was not run because no local Foundry v14 runtime is available in this environment.
