# Forge 再次扩样：条件、时机和替换关系

日期：2026-10-18。状态：**扩样与诊断完成；发现 3 类支持缺口，尚未修复这些新缺口。**

## 1. 问题的原因是什么

上一轮证明了一批排版和数字写法能够处理，但不能由此推断“规则之间的关系”都能处理。这轮重点是同一个数字在什么条件下生效、影响谁、发生在哪个回合、是否代替原有效果。

本轮确认的缺口：

| 描述 | 实际结果 | 已核实的原因与影响 |
|---|---|---|
| 半血时把 4d4 换成 2d4 | 普通完整 IR 入口通过；分步整理入口拒绝 | 分步入口的既有快速识别把前一组伤害记为 `base`，后续要求提案保留同一关系；完整的条件分支提案把两种伤害放在独立 GM Damage 上，被判成“漏伤害”。不是数字漏了，而是关系比较冲突。 |
| 双手握持时把 1d8+2 换成 1d10+2 | 普通入口通过；分步入口拒绝 | 同上一类比较冲突。两种不同来源结构均能复现，仍不能据此断言所有替换伤害都会失败。 |
| Medium swarm of Tiny beasts | 两个入口都拒绝 | 头部身份检查只认识普通体型＋生物类型行及单词类型别名，没有把“虫群整体体型”和“个体体型”拆开证明。正确的整体 medium / 类型 beast 提案无法通过独立检查。 |

前两行的代码定位是 `packages/intake-ai/src/staged-feature-mechanics.ts` 的初始 Attack 伤害提取，以及 `packages/intake-ai/src/staged-extraction.ts` 的 `ESTABLISHED_DAMAGE_OMITTED` 关系比较。第三行是 `packages/intake-ai/src/staged-source-facts.ts` 的 `identityHeaderRows` / `declaredTypes` / `explicitType` 身份检查。这是基于本次复现与当前代码的因果说明，不是外部 issue 自动证明了本项目有同一 bug。

## 2. 证据是什么

### 调研来源与适用边界

读取了官方 SRD 5.1 及同类导入器的 7 个原始故障帖。24 个案例实际引用其中 6 帖和 SRD；另一个再生案例因重复而留在候选资料中。只取规则结构，使用现有两个合成生物交替提供基础数据；**24 个案例不是 24 个真实怪物，也不是 24 个独立 bug。**

官方来源是 [Wizards SRD 5.1 PDF](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf)，属于 **2014 规则文本**，不把它误称为 SRD 5.2.1 或 Foundry 系统 5.1。页码为物理 PDF 页码，逐栏提取，避免把左右栏的不同怪物拼在一起。原 PDF SHA-256 与分栏证据见 `.local/forge-weird-semantics-expansion-20261018/srd-columns.json`。

同类工具原帖：

| 一手来源 | 原帖与后续说明 | 本轮用途与限制 |
|---|---|---|
| [#45 Lair Actions](https://github.com/jbhaywood/5e-statblock-importer/issues/45) | 2023-02-25 报告巢穴动作被当作普通特性；作者后续称 v1.63 修复 | 提醒测试先攻 20 的事件时机；没有安装该版本或推断本项目兼容。 |
| [#76 Swarm support](https://github.com/jbhaywood/5e-statblock-importer/issues/76) | 2023-12-31 报告虫群类型和个体体型；后由 PR #78 关闭 | 提醒区分整体体型与个体体型；关闭不代表本项目已支持。 |
| [#87 Single range](https://github.com/jbhaywood/5e-statblock-importer/issues/87) | 2024-01-12 报告只有一个射程的远程法术攻击；由 PR #88 关闭 | 加入单射程，不能凭空补长射程。 |
| [#106 Size descriptors in abilities](https://github.com/jbhaywood/5e-statblock-importer/issues/106) | 2024-04-02 报告能力里的体型词污染怪物身份；后续称 v1.83.03 实现修复 | 加入体型限制和临时外观，不让它们覆盖基础体型。合成例改变了具体体型词。 |
| [#43 Few Errors on one monster](https://github.com/jbhaywood/5e-statblock-importer/issues/43) | 原始整段文本含受酸/火伤害后再生减量 | 仅证明这种真实文本存在；没有把它认定为该 issue 的已隔离故障原因。 |
| [#123 Multiple forms](https://github.com/jbhaywood/5e-statblock-importer/issues/123) | 原文含零血换形态、治疗转移等结构 | 分别取单能力，不把多个形态的整篇文章强行当成一个 statblock。 |
| [#54 Failed to import](https://github.com/jbhaywood/5e-statblock-importer/issues/54) | 原文含至少 1 HP 才再生的条件 | 与已有再生条件重复，本轮不另计测试；整段导入失败不等于已证明再生条件是根因。 |

这是一轮定向搜集同类故障和规则原文，不是外部模块安装或热度排行榜，也没有新增待安装/本地化工具。AnySearch 公开检索有较多不相关结果，已保留而未当证据；之后直接读取原始 issue 和官方 PDF。AnySearch 不处理该 PDF，使用官方原始 URL 下载并逐栏读取，没有换用付费服务或真实 AI。

### 新增 24 个案例

| 案例 ID | 要保住的关系 | 原始位置 | 最终诊断 |
|---|---|---|---|
| half-hp-replacement | 半血时替换伤害，而非相加 | SRD p390 左栏 Swarm of Insects | 普通通过；分步拒绝 |
| two-handed-replacement | 双手换骰，而非额外一份 | SRD p304 右栏 Drow | 普通通过；分步拒绝 |
| arithmetic-save-dc | 难度为 5＋本次伤害，附辐射/重击例外 | SRD p357 左栏 Zombie | 两入口完整 GM 保留；错误固定 DC 5 被拒 |
| regeneration-suppressed | 酸/火后下回合暂停再生 | SRD p351 右栏 Troll | 两入口通过，GM 处理 |
| regeneration-reduced | 酸/火后只是少恢复，不是完全停止 | 原帖 #43 文本 | 两入口通过，GM 处理 |
| failure-margin-five | 差 5 点才立即石化，普通失败先束缚 | SRD p330 左栏 Medusa | 两入口通过；没有生成无条件石化 Effect |
| repeat-save-next-turn | 下回合结束重投，成功解除 | SRD p265 右栏 Basilisk | 两入口通过；后续判定留 GM |
| death-trigger-save | 死亡才触发爆发 | SRD p330 右栏 Dust Mephit | 两入口通过；不占普通动作 |
| digest-owner-turn | 消化在吞食者回合，内伤达阈值才判吐出 | SRD p341 左栏 Purple Worm | 两入口通过；GM 触发伤害/豁免 |
| escape-dc-not-save | 挣脱 DC 不能变成一次初始豁免 | SRD p272 左栏 Marilith Tail | 两入口通过；错误额外 Save 被拒 |
| size-gated-save | 体型符合才做后续豁免 | SRD p399 右栏 Gladiator；#106 为旁证 | 两入口通过 |
| redirect-healing | 别人回血变 0，改由自身回血 | 原帖 #123 文本 | 两入口通过，GM 处理 |
| rejuvenation-unless-wish | 死亡数日后回来，但有阻止办法 | SRD p335 左栏 Naga | 两入口通过，GM 处理 |
| magic-immunity-willing-exception | 法术等级上限＋自愿接受例外 | SRD p341 右栏 Rakshasa | 两入口通过，GM 处理；未造全局魔法免疫 |
| reaction-every-turn | 每个回合可反应，并非每轮/每日次数 | SRD p272 左栏 Marilith | 两入口通过，GM 处理 |
| split-rounded-hp | 伤害类型、血量阈值、向下取整、缩小体型 | SRD p337 右栏 Black Pudding | 两入口通过，GM 处理 |
| single-ranged-spell-range | 一个射程值，不补第二个 | 原帖 #87 | 两入口通过 |
| lair-initiative-twenty | 巢穴事件先攻 20，平局后行 | 原帖 #45 | 两入口通过，GM 特性；不是专用巢穴调度自动化 |
| zero-hp-next-form | 零血换形态，先攻保持 | 原帖 #123 | 两入口通过，GM 处理；未自动创建第二个 Actor |
| per-target-immunity | 成功后 24 小时免疫属于目标 | SRD p272 右栏接 p273 左栏 Nalfeshnee | 两入口通过；未变成施术者每日次数 |
| shapechange-keeps-base-size | 临时外观体型不覆盖本体 | 原帖 #106 的能力体型污染报告 | 两入口通过；错误基础 tiny 被拒 |
| temporary-parry-ac | 一次攻击的临时 AC 不覆盖基础 AC | SRD p399 右栏 Gladiator | 两入口通过；错误基础 AC 被拒 |
| swarm-individual-size | 整体 medium，个体 tiny，类型 beast | 原帖 #76；SRD p389–390 旁证 | 两入口拒绝，仍需处理 |
| attack-plus-poison-save-half | 穿刺属于攻击，毒素另豁免减半 | SRD p341 左栏 Purple Worm Tail Stinger | 两入口通过；检查最终按钮的伤害归属及 half |

### 实际执行与结果

在用户已授权的原工作副本 `20261006-111625-bettermonsters-eye-deep-sample` 内执行，目标为 Foundry 14.364 / dnd5e 5.3.3 / core / icon off。没有安装或写入 Foundry。

- 24 个案例 × 普通完整 IR、分步 auto 两入口 = **48 个正确对照**。
- **44 个产物通过**来源正文、基础数据、精确坐标和受影响原生活动检查。
- **4 个对照被拒**，对应上面 3 类描述；拒绝没有算成成功生成。
- **36 个错误/漏文检查**：32 个拒绝、1 个由来源识别得到正确结果、3 个因正确对照本来未通过而无法证明防护效果。这 3 个不算“已防住”。
- 上述 1 个正确结果是单射程案例的分步快速路径：调用记录只有 `base`，未请求 `feature` 提案。错误长射程提案没有进入该路径；报告的 `SOURCE_RESTORED` 标签不代表实际修复过 AI 的错误射程。
- 本矩阵没有观察到错误放行；这只约束本批固定提案，不能推广到任意说法或真实 AI 首次提取。
- `bun run typecheck:all`：PASS。没有生产代码变化，因此复用前轮已有回归证据，没有重跑整仓 CI、真实浏览器或模型。

显式诊断命令（输出目录必须为新的目录，报告文件采用排他写入以保留旧失败）：

```powershell
bun tests/diagnostics/forge-weird-semantics-audit.ts .local/forge-weird-semantics-expansion-20261018/new-run
```

本次最终输出是 `.local/forge-weird-semantics-expansion-20261018/final-matrix/report.json` 与 `artifacts.json`。命令退出 **1**，状态 `GAPS_FOUND`，原因是存在支持缺口；不能将前面某一局部 probe 的 PASS 当最终全通过。完整 JSON 从公开 workflow 生成，未手改最终 Actor。诊断不加入默认 CI 或 hook。

`probe-1`、`run-1`、`probe-2` 均保留。早期提案中条件伤害放在 Attack、死亡爆发使用首个 follow-up、免疫案例遗漏距离等测试构造问题已核对并改正；最终矩阵只采用符合现有契约的提案，没有把这些早期失败计为本次产品故障。虫群也换成自然原文式头部后再判定，排除了混合 Type 行的影响。

## 3. 解决方案是怎样的

本轮用户要求继续找样本，因此只完成扩样、验证和问题定位，**没有自动修改生产实现**。建议后续按两个小改处理：

1. 先统一分步入口对替换伤害的比较：Attack 后面的两种条件伤害可以分别保留为 GM Damage，但必须同时核对两组骰、条件、顺序和互斥关系；不能为了通过而把它们都改成无条件 base，也不能直接删除原有检查。半血和双手案例一起回归，再补“把两份伤害相加”“删掉条件”的反例。
2. 再补虫群头部身份：证明整体 medium / 类型 beast，另保留个体 tiny 的原文；用反例确认 tiny 不能覆盖 Actor 整体体型。不要因为这一例就在整个 statblock 中到处扫描体型词。

现有通过案例继续保留。高级时机、复活、分裂、治疗转移等目前主要由 GM 按完整文字处理；“通过”不代表程序自动执行这些规则。巢穴事件也只是完整 GM 特性，未声称支持自动巢穴时序。

待判断本地化/新工具清单：**无**。不为本轮引入第三方模块、额外 AI 审核或全局门禁。

下一次扩样可优先复查本轮没有覆盖的结构：多次咆哮各有不同结果、同一次攻击对不同生物类型采用不同结果、形态间不同恢复规则。先读取完整原文及上下文，拆成有完整边界的单案例；加入本诊断即可，不先扩大到全部自动化能力。

## 已验证与仍未验证

已验证：固定来源与固定假模型提案经过公开提取/组装 → validator → renderer → workflow/parser/generation → verifier；独立核对正文、坐标和相关原生数据。

未验证：真实模型的首轮提取成功率、修复重试效果、任意语言改写、Foundry 实际导入/刷新/UI、自动执行这些高级规则。前轮真实运行或历史 PASS 不自动推广为本批运行验收。

本轮只新增测试 JSON、独立诊断与本报告，没有改变产品入口、版本或操作方式；手册无需改写。既有 dirty 文件、前轮源码和失败证据保持原样，以本轮 final-receipt 的实际哈希复核为准。

## SRD 归属

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
