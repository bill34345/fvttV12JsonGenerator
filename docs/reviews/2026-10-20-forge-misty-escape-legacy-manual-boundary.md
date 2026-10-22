# Misty Escape：旧CLI与官方的手动规则边界核对

日期：2026-10-20。用户要求确认旧CLI是否只处理可处理的原生内容、不要求所有规则文字都可结构化。只读核对及局部执行完成；产品实现和冻结回复未修改。

结论：该处理原则有证据支持。完整保留来源，可靠支持的机制生成原生操作，其余明确留GM；Misty Escape不应仅因延迟恢复1HP的治疗目标无法结构化，就阻断整只怪物。上一份四阻断方案将这个来源绑定设为优先必经修复，过度要求手动文字结构化；本记录修正该实施优先级。

## 实际证据

1. `ingest-plaintext/src/plaintext.ts:normalizeBlock/emitProjectMarkdown`保留规则段落；AI整理器的既有输出模板接受名称、类型utility和完整描述，并不要求每段恢复文字都变成healing。没有调用AI验证或推断其真实输出。
2. `parser/src/englishAction.ts`没有识别出Attack/Save时返回Utility并保留desc。同一2024 Misty原文的局部调用实际返回Utility，完整正文保持。
3. 用旧AI整理器文档规定的YAML对象格式，填入该局部解析结果及未改Misty正文，通过当前CLI共用 `convertMarkdownContentToJson`（14/core/icon off），实际accepted、0诊断；生成同名Item，完整可见描述、一个Utility，无Heal、无Effect、无自动计时。网络尝试0、世界写入0。输入只是该能力的隔离格式验证，不是整只2024 Vampire验收，不是运行旧版二进制。
4. 前批指定官方MM2024 Actor的Misty Item同样保留完整规则，没有Heal；它另外提供self Paralyzed Utility/Effect。这说明“支持的原生操作＋完整手动规则”的原则一致，不能据此声称旧CLI与官方原生能力逐字段相同。
5. 当前Forge的 `category-form-v2-adapter.ts:literalFixedHealing` 本来最终也是返回manual，但返回前强制证明目标；`and it`未通过就抛V2_HEALING_TARGET_UNSUPPORTED。也就是说，它没有打算执行Heal，却把Heal级别的绑定当成GM文字接受前置，这是本例与旧路径的关键差别。

## 检查过程的限制与失败保留

私有目录 `.local/forge-vampire-2024-legacy-fallback-20261020/` 保存全部探针和结果。直接把英文statblock送进通用Markdown路由遇到YAML格式错误；仅包装legacy标题/映射分区后机械accepted，但未生成独立Misty Item，不能算该能力验收；YAML特性字符串列表也不是旧AI模板要求的结构化对象，查找Misty Item失败。读取实际YAML分发和旧AI模板后，使用文档规定对象格式完成上述第3项验证。没有把早先accepted当作来源保真通过，没有修改产品来迎合探针。后续方案不得由这个局部成功推导整只旧CLI或当前Forge已经通过。

## 修正后的实施方向（尚未实施）

- 程序选择native、native-with-gm或gm-manual：只执行有可靠来源证明的部分，手动部分保留完整描述和明确范围。Misty优先走现有gm-manual接受边界；麻痹按钮属于可独立验收的后续原生支持，不把1小时恢复的精细解析变成整只生成前置。
- 不以删字段替代降级：填写回复、原文、提议事实均保留，程序明确记录哪些提议没有投影为可执行操作。完整描述要逐项核对，不能只有一个成功标签。
- 手动并非兜底洗白：实际生成的攻击/治疗/施法/资源必须继续核对；模型改错数字、编造机制、漏掉来源或原生操作丢失限制仍须阻断。若无法隔离不支持条件，相关整个操作留GM，不生成不受限制的半截操作。
- 这个原则还需用于复查Bite等能力；不能先假定所有四错误都能直接manual通过。Charm/Beguile已明确存在的施法、时机、Recharge和传奇费用仍按完整能力语义分别判断。

本次只确认和修正方案，没有实现该降级策略；当前Forge整只Vampire仍FAIL，实机未执行。旧冻结、来源和产品源码保持。
