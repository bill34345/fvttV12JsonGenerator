# Forge 显式 thinking/high：三来源 A/B 结果

**high 轮已完成：6次首次方案运行、14次真实能力HTTP、0重试、0repair。按同一机器验收和来源语义出口，A通过1/3（Angel），B通过0/3。low轮全部结果、原始失败和源码保留，未改写为本轮结果。**

实验启动标识为2026-10-19，报告整理日期2026-10-20。结果目录 `.local/forge-ab-high-first-pass-20261019` 与 low 的 `.local/forge-ab-first-pass-20261019` 分开。

## 参数与比较边界

14个实际发送请求均为 `deepseek-flash`、`reasoning_effort:"high"`、`thinking:{type:"enabled"}`、`json_object`、600000ms超时，每笔只尝试一次。均返回 `model=deepseek-flash`、`finish_reason=stop` 和非零推理token；没有截断、限流、网络失败或服务端可见型号切换。实际具体权重版本仍不是API自证。

没有修改公共 transport 或 A/B 业务代码：high运行器在两侧共用的HTTP实验适配端写入显式thinking开关。保存body、实际发送body和哈希一致，假HTTP测试覆盖A/B两侧。对于两轮都实际请求到的 **11个相同 case/arm/unit**，删除 `thinking`、`reasoning_effort` 两个字段后，请求body逐字段完全相同。见本地[参数对照](../../.local/forge-ab-high-first-pass-20261019/cross-round-request-parity.json)。

A完整基线仍为 `f637f77f28c086e34297513e5293f98b3835f2e9`；B仍为固定回复验收时的两个业务文件。三份来源、八组公共基础事实、Angel既有切分、提示模板、目标版本、顺序 S1 A→B/S2 B→A/S3 A→B、27次上限、首错停止与共同验收均相同。没有给high模型low的能力答案。

温度仍发送0，保持其它参数相同，但在thinking模式下不生效，不是随机性或确定性保证。两轮不是冷缓存或负载控制实验；样本是三个已知开发来源，每条件各一次，不能据此得出思考力度的普遍因果结论。

## high 首次结果

| 来源 | A 首次结果 | B 首次结果 | HTTP A/B | 提取入口秒 A/B | 估算美元 A/B |
|---|---|---|---|---|---|
| S1 Giant Boar | Charge 条件伤害关系拒绝 | Tusk YAML语法拒绝 | 1 / 1 | 14.09 / 5.48 | 0.002135 / 0.001286 |
| S2 Company | Spindly Shred引文边界拒绝 | 同一能力引文边界拒绝 | 3 / 1 | 20.26 / 54.05 | 0.002925 / 0.008029 |
| S3 Obsession | **共同机器与来源语义通过** | Radiant Ray攻击类型拒绝 | 7 / 1 | 22.09 / 34.33 | 0.003237 / 0.005165 |
| 合计 | **1/3** | **0/3** | **11 / 3** | **56.44 / 93.87** | **0.008297 / 0.014480** |

入口计时和low口径相同，包含原有只读来源/基础复验、本地提取与模型等待，不含公共原件准备、人工审阅、适配器开发或Foundry。纯HTTP等待为 A55.24秒、B93.53秒。仅S3-A到达正式生成/验收，另耗0.122秒。

**失败耗时不是成功完成耗时。** B本轮每份都在动作类别停止，少发请求并不代表完成同等工作。也不能把S1-B在语法阶段更早停止称为相对low提速。没有同一来源A/B双侧成功的配对，因此不计算成功速度或费用优劣。

## 首错与low的具体差异

- **S1-A**：high把Charge额外2d6的 `damage.relationship` 写为 `base`；来源明确要求直线移动20尺、同回合Tusk命中，当前绑定器在 `/damage/0/condition` 拒绝。low对此用了conditional并通过能力层。未删除条件、替换关系或重提；Relentless/Tusk未到达。原有休息规则公共误报本轮未被触发，不代表已修复。
- **S1-B**：Tusk引文写成 `attack: Melee Weapon Attack: +5 ...`，含冒号的字符串未引用，YAML解析失败。JSON外壳完整且finish_reason=stop，不能归咎回复截断。Traits未请求，没有到达low的Relentless消费问题。
- **S2-A/B**：high的B使用了正确的 `sourceOperations/attack/proof` 键，未再出现low的“源操作”翻译问题；但两边都被Spindly Shred的 `proof.attack/clause-boundary` 阻断。+10、触及0尺及10d8+4保留，不能概括为这些数字读错。A另给半伤写了未在来源直接打印的固定24，B给了replacement载体；均未到后续验收，不修正或把这些额外行算成功。后续类别不补跑。
- **S3-A**：Spear引文不再把能力标签合入攻击子句，继续通过Ray、施法、Bond、Parry及最终共同出口。B仍将Ray标为 `rsak`，与当前只写“远程攻击检定”的来源绑定要求不符；与low相同的类型问题仍在。B的+7、60尺、3d6+4正确保留，但不能据此接受整个能力。

## S3-A的来源语义核对

机器结果最初保留为 `PASS_MACHINE_GATES_PENDING_SOURCE_REVIEW`，未覆盖首次文件。另行形成[来源核对记录](../../.local/forge-ab-high-first-pass-20261019/source-review-S3-A.json)，25项读回通过：

- 八个完整父能力都有去向，施法作为独立spellcasting组；七项能力描述及施法父块均为原始来源的完整子串。八组公共基础事实保持相同。
- Bite：+8/触及5尺、2d6+5穿刺与2d6光耀；Spear：+8/触及10尺、2d8+5穿刺；Ray：+7/60尺、3d6+4光耀。原生Activity逐项保留，`includeBase=false`，无重复基础伤害。
- Spear大型或更小的对象、向外推离至多15尺；Ray减速10尺至下一回合结束，均保留完整GM条件，没有新增自动移动或状态生命周期。
- 感知施法、DC15、免材料、两项随意法术，以及Disguise Self24小时限制，保留在同源portable spell manifest。没有匹配目标世界Spell、hydration或实际Cast。
- Warding Bond保留bonus、1/day、消费1、30尺可见目标、受护关系持续/重选，以及同一受护者10尺内豁免+4。Warding Parry保留reaction、同一受护对象/10尺/遭受攻击、AC+4与触及内追加矛攻击资格，保持GM规则，不借用来源清单制造第二个攻击按钮。
- 真实视觉120尺、被动察觉20及原基础数值保留。未制造自动Effects。

保存后的同一来源链又经现有 `verify:intake` 与 `verify:actor` 只读核对，退出码均0。**这里通过的是约定的来源忠实候选出口，不是当前Actor的Foundry实机接受。**

## 两轮汇总

| 条件 | A整份通过 | B整份通过 | HTTP A/B | 提取秒 A/B | 估算美元 A/B |
|---|---|---|---|---|---|
| low，thinking默认开启 | 0/3 | 0/3 | 9 / 4 | 40.93 / 84.08 | 0.005620 / 0.012910 |
| high，thinking显式开启 | 1/3 | 0/3 | 11 / 3 | 56.44 / 93.87 | 0.008297 / 0.014480 |

A high的调用和时间增加同时包含“Angel走到了末尾”这一工作量差异；B high的请求减少同时包含“S1连Traits也没走到”。不可当作纯参数速度基准，也不从两次随机样本推导成功率提升。

## high 用量与估算

| 用量 | A | B |
|---|---:|---:|
| 输入token | 35,198 | 11,939 |
| 缓存命中输入 | 23,040 | 4,864 |
| 输出token，含推理 | 10,674 | 22,341 |
| 推理token | 9,631 | 20,322 |
| 总token | 45,872 | 34,280 |

本轮请求在15:57–15:59 UTC，全部off-peak。沿[同一份官方报价](https://api-docs.deepseek.com/quick_start/pricing/)和实际缓存/输出用量，high估算 **$0.022777662**；两轮合计27个真实能力HTTP、估算 **$0.041307012**。均为公开价估算，实扣账单UNKNOWN。没有保存推理正文，只保留用量计数。费用与cache、输出类型及未完成工作量有关，不能从请求数或总token单独判断。

## 保留与当前判断

high原始104份首轮文件在来源审阅前冻结；14份首次业务回复、首次失败及阶段都保留，未修回复或补问。low目录114份文件、low运行器/旧报告、两方案业务源码与原工作树均保持原样，前后指纹可核。新增6项假HTTP/参数检查通过；全量类型仍只有A既有21条诊断，新high运行器无新增诊断。未重新跑无关旧验收，未修A/B、变更默认模式、安装Foundry或提交合并。

**本轮当前实现A得到一个合格候选，B没有；这支持继续保留A作为基线，但不能证明逐能力拆分本质上优于分类拆分。** 提高思考力度没有消除当前协议/载体和来源绑定边界的问题；B的字段遵循在S2有变化，同时S1新增YAML失败。low结果不是无效数据，high也不能覆盖它。没有进一步修复或第三轮授权，本轮到此结束。

见[机器摘要](2026-10-20-forge-real-ab-high-first-pass.json)、[high最终收据](../../.local/forge-ab-high-first-pass-20261019/final-receipt.json)、[原low报告](2026-10-19-forge-real-ab-first-pass.md)与[high执行边界](../plans/2026-10-19-forge-real-ab-high-first-pass.md)。
