# 旧CLI边界为什么没有完整继承到Forge

日期：2026-10-20。用户询问的是通用边界继承与原因，不限于Misty Escape。本轮复核现有代码、Git历史和项目原始计划/勘误；没有继续修改实现、运行模型或操作Foundry。上轮Misty的局部实际workflow证据复用，不重复执行。

## 结论

就“原生支持不足时仍完整交付规则、由GM处理”的边界，旧CLI已核实的处理比当前Misty入口更符合产品目标，应该复用。该差异不是mod技术上必须接受的限制。当前Forge并非完全没有手动模式；它已有gm-manual/native-with-gm，但前置适配、能力识别、组装和最终检查没有始终采用一致的边界。

不能把这个结论扩大为旧CLI所有行为更好。旧入口依赖固定格式、AI正常化和部分启发式规则；前批探针还实际出现过机械accepted但没有独立Misty Item的情况。应继承完整规则交付与有限执行原则，不能复制静默缺项、默认猜测或错误原生投影。

## 已核实的三条路线

| 路线 | 实际职责 | 与边界相关的区别 |
| --- | --- | --- |
| 旧CLI plaintext | 固定标题切分、normalizeBlock、可选AI整理为YAML/Markdown，再走parser/generation | 旧AI模板含utility、子活动、effects及条件正文；EnglishActionParser不匹配Attack/Save时保留desc为Utility。AI失败还有规则解析回退，但不是任意自由文本保证成功 |
| 普通Monster Intake/Forge | AI填写完整MonsterIntakeIR，validator/repair、renderer，再走正式生成 | Canonical输入与旧StructuredActionData不是同一契约，不能把旧prompt字段存在当成已接通新入口 |
| 当前staged/BW | 程序持有完整来源及能力单元，base facts/能力填表，adapter/assembler，再走正式生成/verifier | 更细的来源证明可以防错误原生操作，但部分前置守卫在manual选择前已经拒绝；能够保留正文不等于有机会走到手动出口 |

2026-07-31提交 `871db8d` 的初始CanonicalFeature没有旧通用subActions/高级行为容器。它能证明早期契约未承接全部旧表达，不能单靠这点推断某位实现者的主观动机，也不能把历史缺口当成当前所有字段仍缺失。

## 为什么没有完整拿过来：可证明的原因

1. **重新分层后没有完整保留旧能力和边界的对应关系。** 旧CLI的StructuredActionData与新Canonical Intake之间不是直接复用关系；旧字段/生成器能力仍存在，不代表staged前端有可达路径。这个差别已由2026-10-16勘误中的secondary Save、效果及spellcasting漏接具体证实。
2. **手动策略实际上采用过，但范围与验收后来失真。** 2026-10-13计划第2步已明确要求：完整但无法安全投影的能力交付完整GM手动Item，缺文与事实冲突仍拒绝；执行记录也写了显式GM模式与零推断Utility。2026-10-16勘误又明确撤回“基础操作与GM边界PASS”：它只证明缩减后的错误合同，没有证明用户原功能完成。说明问题不是完全未选择旧原则，而是没有稳定贯彻，也没有始终以旧功能作为验收下限。
3. **补回原生能力后的校验，有些把保护范围扩得过宽。** “不能把已支持的Save/Cast全部藏进Utility”本来合理，但应仅约束可安全执行、已经支持的部分。当前Misty的literalFixedHealing最后仍返回manual，却先要求证明healing目标；它对不执行的恢复文字施加了机制级前置。相反，早期又曾把可执行Save/Cast过度手动化。两种偏差均有具体证据，不是同一个“过严/过松”总开关能解决。
4. **本轮方案也延续了这个问题。** 我最初将并列句治疗目标解析作为Misty优先必经修复，没有先问这段内容是否需要生成Heal。上轮按实际旧格式验证后已更正，不把它解释成用户之前没说清或平台强制要求。

没有找到可证明“因为mod做不到，因此主动放弃这套边界”的决策依据。可确认的责任在契约迁移、消费者接线和验收范围；关于当时未记录的个人动机保持未知。

## mod与CLI真正的区别

文件、进程、环境变量、SSH、Sharp及Node依赖不能原样装进浏览器bundle；输入读取、目录输出和外部调用需要适配。这是技术差异。完整来源保留、能力分类、GM手动呈现、部分原生操作、Activity/资源/Cast和严格验证本身不受这个差异禁止。

当前Forge已在浏览器链使用共享生成能力，并有手动与混合模式；因此“mod只能这样卡住”与现有事实不符。不能把它们也一并归因于平台。具体自动触发/生命周期仍要按dnd5e及已启用模块实际接口验证，旧CLI字段或官方Actor按钮也不证明全自动可执行。

## 应复用的统一边界（建议，尚未实施）

| 情况 | 期望处理 |
| --- | --- |
| 已有支持、来源充分、能完整保留该操作限制 | 复用现有原生实现并检查最终字段，不能为过关全部改Utility |
| 能力有可安全分离的已支持操作和复杂后果 | 原生操作加完整GM后果；不能删掉会改变原生操作含义的限制 |
| 相关操作不能安全表示或其条件不能独立落实 | 将相关完整操作留GM，保留完整可见规则、原因和可追溯来源，不因自动化未支持就拒绝整只 |
| 原文缺失、基础事实冲突、模型编造/改错、实际输出执行了错误机制 | 继续阻断；不能拿manual标签掩盖真实错误 |

实施应先把旧CLI、普通Intake、staged/BW到最终消费者的现有边界逐项对应，复用已有共享逻辑；补的是缺失接线和分类错误，不另起一套提示词/大门禁/流程系统。适配层、组装、最终验证和导入预览要消费同一决定，避免某层允许手动、前层却已拒绝。

重点不只Misty：还应覆盖复合操作与后续豁免、治疗/吸血关系、带条件的伤害与状态、资源/恢复、能力施法/法术例外、变形及叙事边界。审查这些类别不等于立即实现所有自动化；也不能把程序当前bug重新定义成“不支持”，从而降低已有产品能力。

## 证据入口与边界

- `packages/ingest-plaintext/src/plaintextNode.ts`：AI正常化与规则解析回退。
- `packages/ingest-plaintext/src/plaintext.ts`：旧模板类型/子活动/效果/条件正文；normalizeBlock和段落保留。
- `packages/parser/src/englishAction.ts`：Utility完整desc回退。
- `packages/models/src/action.ts`及历史CanonicalMonster：两种契约的表达差异。
- `packages/intake-ai/src/staged-extraction.ts`：manual/native-with-gm组装及已有操作防遗漏检查。
- `packages/intake-ai/src/category-form-v2-adapter.ts`：Misty进入manual前的literalFixedHealing阻断。
- `packages/intake-ai/src/validator.ts:311–344`：完整GM规则、禁止假执行字段、原生已支持操作保持等守卫；不能统一删除。
- [2026-10-13原始计划](../plans/2026-10-13-forge-staged-manual-implementation.md)、[2026-10-16撤回功能完成结论](../acceptance/2026-10-16-forge-legacy-restoration-errata.md)。
- [同一2024 Misty实际窄验证与失败限制](2026-10-20-forge-misty-escape-legacy-manual-boundary.md)。

本轮仅完成分析及建议，未修改产品实现。没有声称已验证全部旧边界、当前四错误已解决或整只2024 Vampire可用。当前正式失败、旧冻结和模型调用限制保持；无需重放此前有效局部检查来证明文档更新。
