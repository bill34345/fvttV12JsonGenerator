# Foundry v14 Source-to-JSON Full Review

Reviewed on: 2026-07-11; remediation amendment: 2026-07-15

## Scope

This review covers the current Foundry v14 acceptance artifacts generated through the project workflow:

- Core profile report: `docs/acceptance/v14-core-batch-verification.md`
- Modded v14 profile report: `docs/acceptance/v14-modded-batch-verification.md`
- Core JSON output: `obsidian/dnd数据转fvttjson/output/v14-acceptance`
- Modded v14 JSON output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance`

The review compares generated Actor JSON back to the source markdown, following `docs/generated-actor-verification.md`. Live import evidence is recorded separately in `docs/acceptance/v14-live-runtime-smoke-test.md` and is summarized here only to connect offline fidelity with actual runtime behavior.

## Mechanical Results

- `v14AcceptanceSuite` was rerun for `core`: 6 samples, 6 passed schema spot checks, 0 failed samples, 0 verification warnings.
- `v14AcceptanceSuite` was rerun for `modded-v14`: 6 samples, 6 passed schema spot checks, 0 failed samples, 0 verification warnings.
- The generated JSON was parsed and spot-checked for actor name, HP, AC, CR, senses, item count, module flags, and known pollution strings.
- No generated JSON contained `<think>`, `MiniMax`, `openai-compatible`, or `Times Up: required`.
- Core profile JSON contains no `midi-qol.OverTime`.
- Modded v14 profile JSON contains `midi-qol.OverTime` only on `v14-modded-bleeding-guardian.v14.json`.
- The 2026-07-15 regeneration contains no source-derived AC effect whose source text begins with the false `ack:` tail of `Attack:`.

## Source-to-JSON Review

| Sample | Source path | Result | Notes |
| --- | --- | --- | --- |
| Slithering Bloodfin | `obsidian/dnd数据转fvttjson/input/slithering-bloodfin.md` | Pass | Name, HP `142 (15d10 + 60)`, AC 16 natural, CR 9, blindsight 100 ft., and reviewed actions/effects match the source summary. No actor verification warnings. |
| Chuul Nullifier | `obsidian/dnd数据转fvttjson/input/chuul-nullifier.md` | Pass | Name, HP `127 (15d10 + 45)`, AC 17 natural, CR 6, darkvision 60 ft., and actions including Pincer/Tentacles match the source summary. No actor verification warnings. |
| Bonebreaker Dorokor | `obsidian/dnd数据转fvttjson/input/bonebreaker-dorokor.md` | Pass | Core combat stats and attacks are preserved. Item names remain source-faithful, including `Multiattack` and `War Cry`; `Attack:` text no longer creates invented AC changes. No actor verification warnings. |
| White Tusk Shaman | `obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md` | Pass | Core combat stats and spear action are preserved. The wrapped source heading now produces a distinct `Spirit-Bonded Body` item; its transformation/termination prose stays separate from `Minion: Savage Horde`, and neither item receives an invented `Unconscious` effect. No actor verification warnings. |
| Bleeding Guardian | `obsidian/dnd数据转fvttjson/input/v14-modded-bleeding-guardian.md` | Pass | Name, HP `22 (4d8 + 4)`, AC 13, CR 1, Bleeding Bite attack, and source-derived bleed automation match the fixture. The earlier false `+4 AC` effect is absent. No actor verification warnings. |
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
- `White Tusk Shaman`: `Minion: Savage Horde`, `Spirit-Bonded Body`, `Spirit-Bonded Mind`, and `Multiattack` remain distinct source-faithful items.

The current batch can be treated as source-faithful for project-internal v14 acceptance. Live testing has now removed the former narrow import risk: all six core and all six modded Actors imported, their sheets opened, and representative Activities operated in their respective disposable worlds. Re-export preservation of the reviewed HP, AC, CR, senses, movement, and Activity semantics was verified for all six core Actors; the modded runtime evidence is import/sheet/representative-Activity coverage plus the focused Bleeding Guardian automation proof, not a six-Actor modded re-export review.

## Live Runtime Corroboration

- Core: Foundry `14.364`, dnd5e `5.3.3`, zero third-party modules; six imports, six sheets opened, specified Activities exercised, 21 chat messages, no browser/server errors in the segment, and no OverTime automation.
- Minimal modded: MIDI-QOL `14.0.9`, DAE `14.0.12`, libWrapper `1.13.5.1`, and socketlib `v1.1.4`; six imports and representative Activities passed.
- Bleeding Guardian: the corrected runtime proof produced exactly one bleeding OverTime effect and one turn-start `1d6` piercing roll (`5`, HP `40 -> 35`), without reusing initial-hit damage or leaking automation to unrelated Actors. MIDI-QOL-disabled manual use also remained available.

### 2026-07-15 remediation retest

- Regenerated Bonebreaker Dorokor, Bleeding Guardian, and White Tusk Shaman were imported from both the `core` and `modded-v14` output directories into project-local disposable worlds.
- In the core world, all three sheets opened and seven representative Activities produced chat messages. AC remained `16`, `13`, and `14` before and after the exercised Activities.
- In the locked minimal modded world, the active versions were MIDI-QOL `14.0.9`, DAE `14.0.12`, libWrapper `1.13.5.1`, and socketlib `v1.1.4`. The same seven Activities produced messages and again left AC unchanged.
- The imported modded Bleeding Bite Activity referenced exactly one `Bleeding` effect whose runtime change remained `flags.midi-qol.OverTime = turn=start,damageRoll=1d6,damageType=piercing,label=Bleeding`.
- White Tusk Shaman rendered with AC 14 and six separate items, including `Spirit-Bonded Body`; its Minion and Spirit-Bonded Body items had no invented status effects.

## Overall Limitation

This source-to-JSON review remains `Pass`, and the narrow core/minimal-modded Actor runtime gates pass. Overall local-mirror acceptance is nevertheless `Partial`: a production-equivalent module candidate still has reproducible scene-control errors. The older statement that copied `cor-cotn` was blocked at Gamemaster authentication is superseded by the later, explicitly authorized local-only password-reset evidence in the runtime report; sampled copied-world workflows pass, but complete module coexistence does not. These boundaries do not invalidate source fidelity, but they prevent a claim of complete production-environment support.

The exact runtime environment, import matrix, failure evidence, and remaining work are recorded in `docs/acceptance/v14-live-runtime-smoke-test.md`.

## 2026-07-15 Milestone 9 Scope Amendment

The original six-Actor review above remains valid for those samples. It is not the complete current corpus and must not be used as a standalone claim for Item or DAE/MIDI runtime support.

- The current executable corpus now has 19 bounded categories with Chinese/English, Actor/Item, v12/v14, core/modded, positive/close-negative, parser/effect, and unrelated-regression coverage. Its focused command passed 148 tests / 656 expectations; aggregate CI passed 738 / 2,921.
- The standalone Shield and Damage-Bound Warden add source/CLI/schema evidence outside the original six-sample batch. Shield live equip/Activity/export behavior and Damage-Bound Warden damage-triggered effect removal are still unaccepted because local file selection is blocked by the user-controlled Chrome extension permission.
- The `isDamaged` support boundary is the locked DAE 14.0.12 + MIDI-QOL 14.0.9 `modded-v14` stack, not DAE alone. Static flag generation passes; executed runtime removal does not yet.

The canonical current conclusion is [`current-support-matrix.md`](current-support-matrix.md); the original dated evidence and false/partial chronology remain preserved here and in the runtime report.
