# 第二批首答三类问题修复

2026-10-29。用户原话：“...修改，我需要再重申我让你改代码的前提吗？”沿用当前worktree、冻结材料和原有修复前提；不新增模型调用、不启用AI内容复核，不提交、合并或推送。三类机制修改、完整冻结对照、独立代码审查及本地配置验收完成。两类程序缺陷已消除；Medusa仅修正提取契约，冻结错误原答仍按部分成功保留，真实模型改善未验证。

## 修复及责任边界

1. **原生传奇资源报告契约。** 上一轮生成验证新增`actor/system/resources/legres`，协议却不接受该字段，导致Balor和Unicorn有正确Actor但报告失败。本次只在协议放行这一个精确路径，没有开放任意Actor字段。真实公共候选、报告投影、JSON序列化与schema读回均覆盖；错误容量仍须报告失败，未登记路径继续拒绝。
2. **未登记语言的实际显示。** 对照锁定dnd5e5.3.3的`prepareLanguages`，已知语言保留原生身份，未登记名称及带限定文字保留到可见custom，同时保留原备注。生成器与verifier复用同一布局规则，不能把正确移动误报成丢失，也不能放过真正删掉语言、已知原生项或心灵感应备注。没有Otyugh专用分支，不自动迁移已创建Actor，v12保留旧行为。
3. **重复豁免与逃脱DC。** 新Medusa原答明确错误填了escapeDc13。按AI负责理解、程序负责结构和投影的既有边界，本次在提取及显式纠错契约中说明：重复豁免不等于逃脱检定；两者同时存在则保留各自DC及规则。extract版本v53、repair版本v43，内容复核保持关闭。程序不偷偷改写原答明确的机制，因此冻结Medusa仍有错误逃脱DC，不能重新计为完全成功。没有新模型请求，真实首答改善尚未证明。

以上均没有新增整只Actor拦截、删除能力或以纯说明替代原有攻击、伤害、法术和次数。旧材料和旧成绩保留；[第二批原始验收及Unicorn分级更正](2026-10-29-forge-six-more-known-creatures-first-pass.md)仍是历史首答结果。

## 已完成的局部验证

| 检查 | 结果及实际边界 |
|---|---|
| 原生资源报告 | 11通过、0失败；Balor/Unicorn原答，1/3/5容量，真实正式报告、序列化与schema完整往返，错误容量与六类不安全路径反例 |
| 语言投影 | 11通过、0失败；真实Otyugh完整Actor只改变语言布局，Roper完整Actor不变，已知/未知混合、限定、ALL、方言、空语言及v12，三种实际删字段变异均报错 |
| 条件DC契约 | 5通过、0失败；重复豁免、合法逃脱、两种不同DC共存；冻结错误Medusa完整Actor不变，保留原答而不自动纠错 |
| 类型和架构 | typecheck:all、typecheck:packages、architecture:verify通过 |
| 防样本硬编码 | 本轮6个实现文件通过局部anti-overfit |
| 独立代码审查 | 未发现新的可操作实质问题；独立静态审查，没有替代运行时和来源验收 |

原provider测试仍为63通过、10失败，完整失败名称集合与已证明的精确旧代码基线相同。原协议测试仍为51通过、14失败，精确旧wireSafety内存还原执行同样失败名称集合；未把旧失败改成通过，也未扩大修复这些历史测试。原件、失败日志及基线收据保留。

## 完整冻结对照与配置验收

独立完整对照24份产物：前一批6份、第二批6份、46整改项实际使用的12份冻结产物。22份Actor或恢复快照除允许的生成时间外保持不变；新旧两份Otyugh只变更语言value/custom，未知名称和原备注完整保留。所有规范源正文保持；报告差异逐项归为提示词版本、离线回放模型身份、两份报告恢复及语言布局对应hash变化，没有未分类差异。这里的12份不是46只生物，也不能用这组结果保证未来任何输入都无缺陷。

`test:forge-46-frozen`12通过、`test:forge-generation-preservation`81通过、`test:forge-four-compatibility`54通过；前后两批各6份原答离线重放都有Actor。第二批先由带网络guard的私有诊断生成，其行为证据保留；补登记正式诊断源码及安全包装入口后，只读既有6份正式响应，通过真实wire schema和完整artifact相等验证，生成/模型/输出写入均0，未重复生成或覆盖原件。

本地Mirror为PID33972/30001、cor-cotn、Core14.368/dnd5e5.3.3。仅更新Forge的scripts/index.js，17个模块文件核对一致，实际加载hash为`0b28427792d5fce6d2b383fc770977a14e3cb674bf50aa948d6241d10954059b`。正常Forge导入Balor、Unicorn、Otyugh三只，原Item目录及正文保持；三只完整Actor含_stats刷新前后严格相同，排除字段0。Balor/Unicorn原生传奇抗性均3、特性消费同一属性且无独立池；Unicorn9Cast及Shimmering Shield的3d6临时生命/60尺目标保留。Otyugh实际卡片明确显示语言名及完整心灵感应备注，主控已查看截图。没有Use、Cast、EffectApply或投骰。

| 生物 | 成功程度 | 问题点 |
|---|---|---|
| Balor | 完全成功 | — |
| Unicorn | 完全成功 | — |
| Otyugh | 完全成功 | — |
| Medusa | 部分成功 | 冻结原答的错误逃脱DC13保持；契约已修正，但无新请求，尚不能证明真实模型首答改善。 |

完全成功仅指本轮冻结生成、原有机制保留、配置/可见显示及保存范围，不包含未执行的能力使用或战斗结算。历史原首答成绩不覆盖，Medusa不重复导入或请求模型。三个测试Actor、观察器及自有页已精确清理；七集合、世界时间、暂停和活动场景严格恢复，完整hash为`5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535`，原Mirror服务和用户页保留。

## 证据与交付

工作树`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支`codex/20261019-forge-ab-fixed-replies`，HEAD`5dc5702767bbcb0818a05a02e45c925289e66758`。私有证据根R为`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-three-followup-fixes-20261029`。

局部证据：`report/green.log`、`language/green4.log`、`condition-dc/final.log`、`condition-dc/existing-failure-comparison-final.json`、`report/existing-protocol-baseline-comparison.json`、`independent/code-review.json`。已有原答、失败、快照只读保留，新成果另存。完整对照见`independent/followup-comparison-final.json`及`final-receipt.json`；补充诊断审查见`independent/additional-readback-review.json`。运行与恢复由主控另行核对，见`mirror/parent-refresh-validation.json`、`mirror/parent-restoration-validation.json`及实际截图。手册同步及最终原件hash核对见本轮对应日志与`preservation-final.json`。
