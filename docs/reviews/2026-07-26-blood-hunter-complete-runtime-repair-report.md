# 血猎手全功能运行时修复报告

## 当前结论

本轮已经修复导致用户实测失败的核心生成契约，并用本地精确版本的临时 Actor/武器完成了代表性运行时探针。生成物不再把“结构存在”当作“运行时可用”的替代证据。

当前交付边界：

- Foundry VTT 14.364
- dnd5e 5.3.3
- MIDI-QOL 14.0.11
- DAE 14.0.12
- Item Macro 3.0.1 未成为必需依赖
- 生成物：`.local/foundry-v14/data/server-mirror/Data/assets/homebrew/blood-hunter-2024.activities.json`
- HTTP：`http://127.0.0.1:30001/assets/homebrew/blood-hunter-2024.activities.json`
- SHA-256：`3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65`

没有修改卡勒姆、正式 Actor、世界合集包、远程服务器或线上 homebrew，也没有提交或推送 Git。

## 已修复的系统性问题

- `buildActivity()` 现在保留 save/damage/utility/enchant 显式传入的 Effect 引用。
- `鲜血秘法`使用稳定 identifier `blood-maledict`；血咒消费目标使用字符串 identifier，不再写 Plutonium 占位对象。
- 七种血仪使用 dnd5e 5.3.3 的 `system.damage.parts` Enchantment 兼容入口。
- 血仪和血咒失血均为 Damage Activity；宏从 `workflow.damageRolls` 读取骰值。
- 失血直接扣当前 HP、不消耗临时生命、不经过抗性/免疫，并清零 MIDI 待应用伤害；缺少 Actor、骰值或 `damageItem` 时失败关闭。
- 血仪用 `dnd5e.applyEnchantment` 替换同一武器上的旧血仪，并用 `dnd5e.restCompleted` 在短休/长休时清除 Actor 武器上的血仪。
- 未注册的 `fvttJsonGenerator` flag 域不再通过 `getFlag()` 读取，避免 Foundry 14 抛错。
- 下回合结束效果使用 `duration.expiry: "sourceEnd"`；移除了旧 `turnEndSource` 等 DAE 持续时间。
- 焦虑、捆缚、腐蚀、怒号、乱心、鲁莽等 Activity 现在引用实际 Effect。
- 印记血咒会施加带来源范围的标记 Effect；额外血仪骰仍按受控辅助结算。
- 21 个诱变剂全部生成可见 Activity 和休息失效 Effect；可靠的能力值、速度、感官、抗性、免疫、检定优势和精准重击阈值已写入 Effect。
- 化狼结社不再被过滤；基础职业与弑灵、渎魂、突变、化狼四个结社全部进入覆盖清单。

## 完整覆盖审计

真实源包共有 94 个功能条目：

| 分类 | 数量 |
|---|---:|
| 自动化 | 5 |
| 辅助自动化 | 68 |
| 原生/无需自制 Activity | 21 |
| 明确人工处理 | 0 |
| 静默遗漏 | 0 |

最终侧数据和产物结构：

| 结构 | 数量 |
|---|---:|
| 基础职业侧数据 | 9 |
| 四结社侧数据 | 23 |
| 可选特性侧数据 | 42 |
| Activity | 117 |
| 七种血仪 | 7 |
| 可选血咒 | 14 |
| 诱变剂 | 21 |

“辅助自动化”表示有真实 Effect、骰子、消耗、标记或明确操作入口，但依赖触发伤害、武器、控制者、位置、目标类型或法术位的分支不会猜测。

## 仍然是辅助而非全自动的语义

- 破晓血仪：基础光耀附伤全自动；持握黯蚀抗性、20 尺光照、对不死额外骰提供独立辅助 Activity。黯蚀抗性需在不再持握武器时手动移除。
- 印记血咒：标记 Effect 会实际施加；匹配当前血仪与攻击者范围后的额外骰仍由辅助流程确认。
- 腐蚀的回合末重复豁免/重复伤害、胀痛的同回合攻击计数、怒号的差值 5 震慑与 24 小时免疫仍需受控处理。
- 驱魔、暴露、盲目、傀儡、同苦、噬魂等需要实时工作流上下文的分支会给出明确提示，不自动猜测。
- 残虐、化学试剂、再生、红莲等动态诱变剂保留真实 Effect/入口，但动态选择或回合触发仍为辅助。
- 渎魂结社的同调法术选择、契约位恢复和若干烙印联动，以及化狼的最近生物/浴血/回合触发，仍保留明确辅助边界。

## 机械验证

- 血猎手专项：15/15，497 个断言。
- Foundry Lab：172/172，1072 个断言。
- 全仓：1382/1382，6547 个断言，`--max-concurrency 4`。
- production/all TypeScript：通过。
- Web build：通过。
- `bun run audit:anti-overfit`：通过，6 个生产源文件。
- 项目工作流连续生成两次，哈希一致。
- 最终验证器：零重复 ID、零失效 Effect 引用、零对象消费 target、零旧 DAE 持续时间、零错误附魔路径、零覆盖遗漏。

## 本地运行时探针

所有探针均使用临时 `Codex Blood Hunter … Probe` Actor 和临时武器，并在 `finally` 中删除：

- `blood-maledict`被 dnd5e DataModel 重映射为鲜血秘法真实 Item ID。
- 焦虑血咒 Activity 的 Effect ID 与嵌入 Effect ID 一致。
- 原生 Enchant 应用后，短剑攻击获得 `@scale.blood-hunter.crimson-rite` 火焰伤害部件。
- 先烈焰后冻结时，武器只保留冻结；短休后血仪 Effect 为零。
- 增幅失血从 20 HP/5 临时生命开始，先失去 4、再失去 3：结果为 13 HP/5 临时生命；MIDI 的 hp/temp/total 待应用伤害均清零；首次增幅标记仅一个。
- 缺少 `workflow.damageItem` 时，HP 和临时生命均不变化，且不创建首次增幅标记。
- 探针相关控制台 error 为零。

## 尚待用户人工验收

- 通过 Plutonium 重新导入本 URL 后，检查实际 Item 卡片和操作手感。
- 卡勒姆的迁移与完整实战。
- 焦虑/印记/诱变剂/混种变形的 UI 操作，以及复杂血咒的提示是否符合桌面习惯。
- 线上合集包同步。

因此，代码、生成物语义和代表性运行时契约已经通过；完整职业玩法仍等待用户人工验收，`BH-ACT-003` 暂不关闭。
