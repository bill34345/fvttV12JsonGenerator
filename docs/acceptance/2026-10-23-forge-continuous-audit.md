# Forge 连续推进 A：现有提示定性（2026-10-23）

基线为 `38d23af`，沿用原Forge工作树。本批由主控亲自完成，只读原Mage来源／冻结IR及已保存的实机结果，新增有界回归；无新模型、浏览器或Lab操作，未修改产品生成代码或原始回复。

## 11条提示的实际含义

| 提示 | 数量 | 核实原因与处置 |
|---|---:|---|
| `SOURCE_OPERATION_FACT_CONFLICT` | 4 | 同一Arcane Burst旧提案把来源明确的近战或远程择一写成单一`melee`，同时混入reach5／range120。单条攻击不能同时满足两种模式；完整证据与攻击／伤害清单因此拒绝。不是四个独立程序缺陷。 |
| `MIXED_FEATURE_SOURCE_CONFLICT`、`SOURCE_BASIC_OPERATION_OMITTED` | 2 | 上述同一个无效operation使原生剩余规则无法被当作已证明的完整基本操作；保留完整原文不等于错误机械字段已通过。 |
| `V2_ATTACK_MODE_CONFLICT` | 1 | 冻结V2提案的“类型”为“近战攻击”，来源却是“Melee or Ranged Attack Roll”。提案自由文字提到了两种形式，但不能覆盖结构字段冲突。该问题同时保存在原提案review及顶层uncertainty中，汇总去重后为一条。 |
| `SPELL_REFERENCE_SOURCE_MISMATCH` | 2 | Misty Step及Protective Magic正确引用Intelligence，但缺少父Spellcasting明确给出的DC14及其精确来源证据。与当前源绑定的确定性结果逐字段对比，仅这两项缺失；没有未知的额外组件豁免或不同次数差异。保留两处独立提示。 |
| `GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED` | 2 | Actor与Items层的汇总提示，说明旧提案仍有未解决语义问题。这不是两个新的内容缺陷。 |

结论：**本批没有确认需要修改生产校验器的程序误判。** 11条不能算11个程序bug；主要是一个攻击提案冲突、两处引用资料缺少已明确的继承字段，及其派生／汇总提示。原候选的`needs_review`及历史11条原样保留，仍可按已有GM采用流程使用。

## 正反例及原件保护

在新测试中读取原始seed，不覆盖文件。在单独的内存提案中，用来源证明的两条互斥中立操作分别保留近战+6／5尺、远程+6／120尺、同一3d8+3力场伤害，并补充已有父来源的DC14证据。源事实守卫不再报告上述operation／spell-reference冲突；原顶层V2 review note仍保留，因此该反事实提案也没有被伪称为真实新模型accepted结果。

将派生提案的DC改为99或删掉远程分支，分别重新触发引用失配及基本操作遗漏。最后再次读回原seed和原validator结果，字节与结论均未变。另有既有三种独立中立攻击正反例、组件与引用、条件计数、反例保护一并复用。

`bun run test:forge-brass-casting-followup`：**54 pass、0 fail、245断言**，实际使用原隔离Bun1.3.14和既有hermetic入口。新Mage检查依赖既有私有seed，干净checkout缺seed时明确skip，不能把skip算成此项通过。日志入口为外部`forge-continuous/batch-a-tests-final.log`。

新增断言首次把导出层的7项攻击相关提示当成validator路径内7项，而实际为6项加独立V2 note；第二次发现原顶层uncertainty按设计继续保留。两份初始失败日志保留，修正仅在测试断言，未放宽产品守卫或删除原不确定项。

## 连续推进

A按“完成现存问题定性、只修确认缺陷”收口；没有为消除提示强改原回复。随后连续进入B的完整候选恢复，不等待用户再选择测试或实机步骤。当前默认主控亲自实施及验收，后续结果续记[唯一交接页](../plans/2026-10-20-forge-ab-current-state.md)。
