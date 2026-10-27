# Forge Mimic／Otyugh 双生物接续：真实首次结果

2026-10-27。用户原话：“行，继续剩余的 Mimic／Otyugh 双生物测试，沿用已冻结原文和当前 worktree。只用剩余3次HTTP：1次识别、2次提取；不重跑已通过样本。”

已执行这3次请求，原6次总账本用完。识别通过；Mimic有完整候选但受擒替代伤害分支不完整；Otyugh没有Actor，因非空状态字段用于当前不支持的操作组合而拒绝。两只均不能记为完整接受。本轮没有修改产品、提示词、原答、最终JSON或安装包，没有重跑前三只、重试、复核、纠错、Foundry／浏览器操作或Git发布。

## 版本、冻结来源与请求

沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD `a6591c0`及[已完成统一契约整改](2026-10-27-forge-input-contract-unification.md)的未提交成果。18份已验证实现／测试／入口文件hash与统一整改收据一致，runner本体未改。之前的[三次首答与停止点](2026-10-27-forge-offline-five-first-pass.md)保留，不将盾卫后来的零模型修复改写为原首答成功。

双生物输入继续使用已核官方SRD5.2.1／2024原文，不重做来源，不给模型提供预期分区。`paired.md`仍为2581个UTF-16字符，SHA-256 `60bc6ad40e99c75abf1ab92166f2a750b4a35326b86e3adfbae28a4d62ab3f67`。两只独立源及原PDF／页图的核对沿用冻结收据。

| 请求 | 实际HTTP | 结果 | 服务usage |
| --- | ---: | --- | ---: |
| 双生物识别 | 1 | 原始返回恰2候选，完整分区通过 | 1,755 tokens |
| Mimic提取 | 1 | 有Actor；替代伤害分支内容不足 | 23,666 tokens |
| Otyugh提取 | 1 | 无Actor；操作组合不符合契约 | 20,823 tokens |
| **本轮接续** | **3** | 无重试／追加请求 | **46,244 tokens** |

前3次V49提取加本轮3次请求合计6／6 HTTP、86,263个服务报告tokens。后两份提取为 `monster-intake-extract-v50-input-field-policy`，发现为独立的 `monster-intake-discover-v2-source-lines`；不能混写成单一提示词版本成功率。tokens仅是这些服务回执，不是项目总消耗或费用。models／探针／AI复核／纠错／重试／翻译／控制配置均0。

## 识别与分区

原始发现回复选择Mimic的L1–L32、Otyugh的L34–L63。程序先检查原候选数量及交叠，再使用现有分区函数，未修补模型边界：

- Mimic `[0,1271)`，SHA-256 `be017b63ef07bf66f01a691203af6417cde388fc4b28daef257088692e41b2fe`。多出的一个LF是两个冻结条目之间的分隔空白，正文与独立Mimic源逐字一致。
- Otyugh `[1271,2581)`，SHA-256 `71ddea6ebcd100d8b7c6744bbce5e3f5208b2f771670edfa265e589d6248a51b`，与独立冻结源相同。

主控和独立核对均确认无交叠、遗漏、串段或只取第一只。两个member请求使用真实返回分区，明确single，不再次发现。这证明本例真实发现与逐成员取源，不等于关联召唤／控制配置整包接受。

## Mimic：候选保留，替代分支不完整

正式生成得到4个Item，analysis为ready_to_generate，generation为ready_for_gm_review。基础数据保持：Medium Monstrosity、AC12、HP58／9d8+18、CR2／XP450、六属性与SAVE、先攻总+3、Stealth+5、酸／倒地免疫、暗视60／被动11、速度20。

Adhesive的Object Form Only、Huge或更小、逃脱DC13和劣势保留；Pseudopod的+5／5尺／1d8+3钝击＋1d8酸、Large或更小受擒及DC13保留；Shape-Shift的附赠动作、Medium／Small物体、返回本体、数据与装备限制完整。普通Bite的+5／5尺及目标受擒时优势说明保持。

程序只有4条非阻塞EMPTY_FIELD_NORMALIZED：resistances、vulnerabilities、reactions、legendaryActions。冻结来源确实没有对应条目，补空没有阻止生成，也没有造成此次内容问题。

受擒目标的Bite分支存在实际缺口：

| 层 | 普通伤害 | 受擒替代伤害 |
| --- | --- | --- |
| 原文要求 | 1d8+3穿刺＋1d8酸 | 2d8+3穿刺＋1d8酸 |
| 原始AI操作数据 | 两段均有 | alternative操作只有2d8+3穿刺 |
| 实际Actor活动 | 两段均有 | 同样只有2d8+3穿刺 |

生成器按每个operation给出的damage列表投影，没有从原文重新推断或从另一个操作自动继承酸伤。因此这是首答对完整替代分支的表达不足，未发现IR到Actor投影把已提供的酸伤删掉。按当前生成的数据，只使用替代伤害活动会漏酸伤；普通与替代活动合用又会多出普通穿刺。完整原文仍可供GM处理，但不能凭“正文完整、已有Actor”判定这一可操作分支通过。本轮未进入Foundry，不声称测试过其手工调整界面。

原答、候选和字段问题保留，未补酸伤或请求修正。

## Otyugh：非空状态字段与操作类型不匹配，没有Actor

基础数据及4项动作已提取：Large Aberration、AC14、HP104／11d10+44、CR5／XP1800、六属性与SAVE（CON+7）、先攻0、速度30、暗视120／被动11、Otyugh语言和不可回应的120尺心灵感应。完整正文保留：

- Multiattack一咬两触手；Bite +6／5尺／2d8+3穿刺及中毒。
- 中毒目标完成Long Rest后才触发CON15；失败使生命值上限减少5（1d10），成功结束中毒，条件结束前不恢复。
- Tentacle +6／10尺／2d8+3穿刺，Medium或更小、两触手之一、逃脱DC13。
- Tentacle Slam CON14、已受擒目标、3d8+3钝击、成功半伤，以及震慑至Otyugh下回合开始。

实际阻断发生在两个非空字段：

```text
Bite attack:     failureStatuses: ["poisoned"]
Tentacle attack: failureStatuses: ["grappled"]
```

当前契约的failureStatuses只用于Save操作的原生失败状态；它不提供把这些状态直接挂到attack命中上的承载。原文所述命中状态及解除／体型限制应按本批既定范围完整保留为GM规则，不能把此字段理解为通用状态列表。

`packages/models/src/sourceOperationStructure.ts`的neutral-combination和failureStatuses检查分别报告这两个操作。之后parser抛InvalidSourceOperations，整只Actor未生成。10条缺省空容器提示均非阻塞；不是空栏兼容修复退化，也没有生成后删除Actor。另一方面，完整原文和主要数值正确不改变“当前程序仍因这种操作表达整只失败”的实际结果；本轮没有调整此行为，也没有删除非空状态字段强行通过。

## 保留性与本轮范围

证据根：`H:/CodexData/visualizations/2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-offline-five-20261027/`。

- `results/discover-pair/`：原始发现回执、完整分区及程序校验。
- `results/member-mimic/`：原始回复、IR、规范资料、生成结果、完整actor.json。
- `results/member-otyugh/`：原始回复、IR、规范资料及实际生成失败；没有actor.json。
- `resume-paired-20261027/independent/`：发现及两份内容的独立核对。
- `resume-paired-20261027/summary.json`、`preservation-final.json`：本轮3请求、全部6请求、具体问题及保护结果。
- `http-ledger.json`及6个独立call文件：实际请求记录；早先三次call文件和结果未覆盖。

此前29份call／结果文件、三个冻结源引用及18份已验证实现／测试／入口hash保持。当前候选包与已完成的统一整改未重建或重跑；没有触碰Foundry、世界或旧草稿。新记录只说明本轮真实结果，不把问题变成修复完成或整体正式可用；后续若处理这两项，可使用已保存首答定位，不在本轮追加模型或改产品。
