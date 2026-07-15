# Foundry v14 Modded Profile Batch Verification

Generated at: 2026-07-15T10:54:07.281Z

## Summary

- Output dir: `I:/OpenCode/fvttV12JsonGenerator/obsidian/dnd数据转fvttjson/output/v14-modded-acceptance`
- Effect profile: `modded-v14`
- Samples: 6
- Passed schema checks: 6
- Failed samples: 0
- Verification warnings: 0
- Foundry runtime import: outside this offline batch report; see `docs/acceptance/v14-live-runtime-smoke-test.md` for current live-runtime evidence.

## Module Compatibility

- MIDI-QOL `14.0.9` and DAE `14.0.12` are the locked v14 module references for generated automation.
- Times Up: not used for v14; v14 duration handling is core/DAE-based.
- Item Macro: not required for v14 acceptance; no v14-verified dependency is assumed.

## Mechanical Checks

| Sample | Category | Output | Schema | Verification warnings |
| --- | --- | --- | --- | --- |
| Slithering Bloodfin | complex actions and effects | `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/slithering-bloodfin.v14.json` | 8/8 | 0 |
| Chuul Nullifier | save activity and conditions | `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/chuul-nullifier.v14.json` | 8/8 | 0 |
| Bonebreaker Dorokor | multiattack, recharge, and reactions | `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/bonebreaker-dorokor.v14.json` | 8/8 | 0 |
| White Tusk Shaman | english route and innate utility text | `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/white-tusk-shaman.v14.json` | 8/8 | 0 |
| Bleeding Guardian | explicit bleeding overtime module fixture | `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/v14-modded-bleeding-guardian.v14.json` | 8/8 | 0 |
| GoddessFantasy Yithian Fixture | crawler fixture chain; print pages requested=1 | `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/goddessfantasy-yithian.v14.json` | 8/8 | 0 |

## Sample Details

### Slithering Bloodfin

- Source: `obsidian/dnd数据转fvttjson/input/slithering-bloodfin.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/slithering-bloodfin.v14.json`
- Actor/item name: 滑行血鳍 (Slithering Bloodfin)
- Item count: 9
- HP: `{"value":142,"max":142,"temp":null,"tempmax":null,"formula":"15d10 + 60"}`
- AC: `{"flat":16,"calc":"natural"}`
- CR: `9`
- Senses: `{"ranges":{"darkvision":0,"blindsight":100,"tremorsense":0,"truesight":0},"special":"","units":"ft"}`
- Items reviewed: 血狂, 扭滑, 死亡爆裂, 多重攻击, 啃咬, 尾击, 吞咽, 滑溜, 远洋尖啸

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":0,"blindsight":100,"tremorsense":0,"truesight":0},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 9 embedded items checked |
| embedded item target stats | pass | 9 embedded items checked |
| save activities omit legacy dc.value | pass | 3 save activities checked |
| effects target stats | pass | 6 effects checked |

### Chuul Nullifier

- Source: `obsidian/dnd数据转fvttjson/input/chuul-nullifier.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/chuul-nullifier.v14.json`
- Actor/item name: 甲伏怪无效者 (Chuul Nullifier)
- Item count: 6
- HP: `{"value":127,"max":127,"temp":null,"tempmax":null,"formula":"15d10 + 45"}`
- AC: `{"flat":17,"calc":"natural"}`
- CR: `6`
- Senses: `{"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"}`
- Items reviewed: 两栖, 反魔场光环, 感知魔法, 多重攻击, 钳击, 触须

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 6 embedded items checked |
| embedded item target stats | pass | 6 embedded items checked |
| save activities omit legacy dc.value | pass | 1 save activities checked |
| effects target stats | pass | 0 effects checked |

### Bonebreaker Dorokor

- Source: `obsidian/dnd数据转fvttjson/input/bonebreaker-dorokor.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/bonebreaker-dorokor.v14.json`
- Actor/item name: Bonebreaker Dorokor
- Item count: 9
- HP: `{"value":82,"max":82,"temp":null,"tempmax":null,"formula":"11d8 + 33"}`
- AC: `{"flat":16,"calc":"flat"}`
- CR: `6`
- Senses: `{"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"}`
- Items reviewed: Aggressive, Wielder of Wound, Multiattack, Wound, Longbow, War Cry, Focus, Charge, Villain Ability: Warlord

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 9 embedded items checked |
| embedded item target stats | pass | 9 embedded items checked |
| save activities omit legacy dc.value | pass | 0 save activities checked |
| effects target stats | pass | 0 effects checked |

### White Tusk Shaman

- Source: `obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/white-tusk-shaman.v14.json`
- Actor/item name: White Tusk Shaman
- Item count: 6
- HP: `{"value":52,"max":52,"temp":null,"tempmax":null,"formula":"8d8 + 16"}`
- AC: `{"flat":14,"calc":"flat"}`
- CR: `3`
- Senses: `{"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"}`
- Items reviewed: Aggressive, Minion: Savage Horde, Spirit-Bonded Body, Spirit-Bonded Mind, Multiattack, Blood-Searing Spear

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 6 embedded items checked |
| embedded item target stats | pass | 6 embedded items checked |
| save activities omit legacy dc.value | pass | 0 save activities checked |
| effects target stats | pass | 0 effects checked |

### Bleeding Guardian

- Source: `obsidian/dnd数据转fvttjson/input/v14-modded-bleeding-guardian.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/v14-modded-bleeding-guardian.v14.json`
- Actor/item name: Bleeding Guardian
- Item count: 1
- HP: `{"value":22,"max":22,"temp":null,"tempmax":null,"formula":"4d8 + 4"}`
- AC: `{"flat":13,"calc":"flat"}`
- CR: `1`
- Senses: `{"ranges":{"darkvision":0,"blindsight":0,"tremorsense":0,"truesight":0},"special":""}`
- Items reviewed: Bleeding Bite

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":0,"blindsight":0,"tremorsense":0,"truesight":0},"special":""} |
| no item-level legacy activation | pass | 1 embedded items checked |
| embedded item target stats | pass | 1 embedded items checked |
| save activities omit legacy dc.value | pass | 0 save activities checked |
| effects target stats | pass | 1 effects checked |

### GoddessFantasy Yithian Fixture

- Source: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/goddessfantasy-yithian.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/goddessfantasy-yithian.v14.json`
- Actor/item name: 伊斯人 (Yithian)
- Item count: 5
- HP: `{"value":180,"max":180,"temp":null,"tempmax":null,"formula":"19d10+76"}`
- AC: `{"flat":14,"calc":"flat"}`
- CR: `15`
- Senses: `{"ranges":{"darkvision":0,"blindsight":0,"tremorsense":0,"truesight":60},"special":"","units":"ft"}`
- Items reviewed: 魔法抗性 (Magic Resistance), 心灵防护 (Shielded Mind), 多重攻击 (Multiattack), 钳击 (Pincer), 心灵互换 (Mind Swap)(充能6)

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":0,"blindsight":0,"tremorsense":0,"truesight":60},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 5 embedded items checked |
| embedded item target stats | pass | 5 embedded items checked |
| save activities omit legacy dc.value | pass | 1 save activities checked |
| effects target stats | pass | 0 effects checked |

## Semantic Acceptance Notes

- This is an offline generation report; it does not embed or supersede live Foundry runtime evidence.
- Source-to-output semantic review uses generated JSON summaries and `actorVerification`; any warning is documented above instead of hidden.
- Current import, interaction, re-export, and compatibility results are maintained in `docs/acceptance/v14-live-runtime-smoke-test.md`.

## 2026-07-15 Milestone 9 Amendment

The six rows above remain the original offline batch. A separate generalized Damage-Bound Warden fixture now passes `modded-v14` CLI/source/schema review with exactly one source-matched DAE 14.0.12 `isDamaged` flag and an otherwise source-equivalent core Actor. This adds static generation evidence; it does not add a seventh runtime-accepted Actor. MIDI-QOL 14.0.9 is the locked component that consumes real damage and removes the flagged effect, and that runtime exercise remains blocked by Chrome's user-controlled file-URL permission. See [`current-support-matrix.md`](current-support-matrix.md).
