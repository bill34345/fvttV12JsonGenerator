# Foundry v14 Core Batch Verification

Generated at: 2026-07-07T00:46:11.101Z

## Summary

- Output dir: `I:/OpenCode/fvttV12JsonGenerator/obsidian/dnd数据转fvttjson/output/v14-acceptance`
- Samples: 5
- Passed schema checks: 5
- Failed samples: 0
- Verification warnings: 4
- Foundry runtime import: not run; no local Foundry v14 runtime is available.

## Mechanical Checks

| Sample | Category | Output | Schema | Verification warnings |
| --- | --- | --- | --- | --- |
| Slithering Bloodfin | complex actions and effects | `obsidian/dnd数据转fvttjson/output/v14-acceptance/slithering-bloodfin.v14.json` | 8/8 | 0 |
| Chuul Nullifier | save activity and conditions | `obsidian/dnd数据转fvttjson/output/v14-acceptance/chuul-nullifier.v14.json` | 8/8 | 0 |
| Bonebreaker Dorokor | multiattack, recharge, and reactions | `obsidian/dnd数据转fvttjson/output/v14-acceptance/bonebreaker-dorokor.v14.json` | 8/8 | 2 |
| White Tusk Shaman | english route and innate utility text | `obsidian/dnd数据转fvttjson/output/v14-acceptance/white-tusk-shaman.v14.json` | 8/8 | 2 |
| GoddessFantasy Yithian Fixture | crawler fixture chain; print pages requested=1 | `obsidian/dnd数据转fvttjson/output/v14-acceptance/goddessfantasy-yithian.v14.json` | 8/8 | 0 |

## Sample Details

### Slithering Bloodfin

- Source: `obsidian/dnd数据转fvttjson/input/slithering-bloodfin.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-acceptance/slithering-bloodfin.v14.json`
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
| effects target stats | pass | 8 effects checked |

### Chuul Nullifier

- Source: `obsidian/dnd数据转fvttjson/input/chuul-nullifier.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-acceptance/chuul-nullifier.v14.json`
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
| effects target stats | pass | 2 effects checked |

### Bonebreaker Dorokor

- Source: `obsidian/dnd数据转fvttjson/input/bonebreaker-dorokor.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-acceptance/bonebreaker-dorokor.v14.json`
- Actor/item name: Bonebreaker Dorokor
- Item count: 9
- HP: `{"value":82,"max":82,"temp":null,"tempmax":null,"formula":"11d8 + 33"}`
- AC: `{"flat":16,"calc":"flat"}`
- CR: `6`
- Senses: `{"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"}`
- Items reviewed: Aggressive, Wielder of Wound, 多重攻击Multiattack, Wound, Longbow, War Cry : Dorokor screams an orcish war phrase, spurring her warriors on toward victory, Focus, Charge, Villain Ability: Warlord
- Actor verification warnings: `Item name not found in source markdown: 多重攻击Multiattack`; `Item name not found in source markdown: War Cry : Dorokor screams an orcish war phrase, spurring her warriors on toward victory`

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 9 embedded items checked |
| embedded item target stats | pass | 9 embedded items checked |
| save activities omit legacy dc.value | pass | 0 save activities checked |
| effects target stats | pass | 2 effects checked |

### White Tusk Shaman

- Source: `obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-acceptance/white-tusk-shaman.v14.json`
- Actor/item name: White Tusk Shaman
- Item count: 5
- HP: `{"value":52,"max":52,"temp":null,"tempmax":null,"formula":"8d8 + 16"}`
- AC: `{"flat":14,"calc":"flat"}`
- CR: `3`
- Senses: `{"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"}`
- Items reviewed: Aggressive, Minion: Savage Horde: After moving at least 20 feet in a straight line toward a creature, the next attack the orc makes against that creature scores a critical hit on a roll of 18–20, Spirit-Bonded Mind, 多重攻击Multiattack, Blood-Searing Spear
- Actor verification warnings: `Item name not found in source markdown: Minion: Savage Horde: After moving at least 20 feet in a straight line toward a creature, the next attack the orc makes against that creature scores a critical hit on a roll of 18–20`; `Item name not found in source markdown: 多重攻击Multiattack`

| v14 schema spot check | Result | Detail |
| --- | --- | --- |
| actor core version | pass | 14.361 |
| actor system version | pass | 5.3.3 |
| actor system id | pass | dnd5e |
| v14 senses ranges | pass | {"ranges":{"darkvision":60,"blindsight":0,"tremorsense":0,"truesight":0},"special":"","units":"ft"} |
| no item-level legacy activation | pass | 5 embedded items checked |
| embedded item target stats | pass | 5 embedded items checked |
| save activities omit legacy dc.value | pass | 0 save activities checked |
| effects target stats | pass | 2 effects checked |

### GoddessFantasy Yithian Fixture

- Source: `obsidian/dnd数据转fvttjson/output/v14-acceptance/goddessfantasy-yithian.md`
- Output: `obsidian/dnd数据转fvttjson/output/v14-acceptance/goddessfantasy-yithian.v14.json`
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

- This report is project-internal acceptance, not a live Foundry runtime import result.
- Source-to-output semantic review uses generated JSON summaries and `actorVerification`; any warning is documented above instead of hidden.
- Final runtime acceptance still requires importing representative JSON into a throwaway Foundry v14.361 + dnd5e 5.3.3 world.
