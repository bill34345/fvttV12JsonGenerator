# Forge 条件静态头与 Colossal 显示边界

目标锁定 Foundry Mirror 14.368 / dnd5e 5.3.3；这是现有修复任务的来源表达调整，不升级系统或修改全局尺寸配置。

## 可核实事实与用户选择

- 保存 Charon 原文 SHA-256 为 `441b41611f62f920a73f5494692a52cbe3ff41fd29c775af98e5d2bf0299ebb2`，写有 `Size Colossal (45 ft. tall)`；抗性同时有 `Necrotic; Attacks made without Advantage`，免疫含 `Diseased`。
- 锁定 dnd5e 5.3.3 的 `module/config.mjs` 中 `actorSizes` 只有 tiny/small/medium/large/huge/gargantuan 六项，最大键为 `grg`。对照参考缓存提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，没有原生 Colossal 尺寸；不存在“自动等同”来源证据。
- AnySearch 的作者网站/Patreon 和 Reddit 实际经验检索没有找到作者对 Colossal 的明确尺寸映射规则。其他版本的尺寸讨论只能作旁证，不能填入本项目规则。
- 用户于 2026-10-14 明确选择：使用最大原生 gargantuan，完整保留 Colossal 原文，并提示尺寸相关规则由 GM 手动判断。这是批准的显示政策，不是宣布两个规则尺寸相同。

## 实现与不丢文要求

来源头的明确无条件标准抗性/免疫仍核验为原生字段。带条件的完整分号子句、非原生状态名称和批准的 Colossal 来源尺寸由程序编译为完整 GM 手动 Item，保留原始正文和精确引文。逗号列表中出现限定语时，不把前面的类型偷偷变为无条件抗性。

尺寸使用 `grg`；来源尺寸另存于核实后的 IR，并写入完整尺寸 Item 与简介中的 GM 提示。条件不推断为自动效果，不改系统 CONFIG。缺少完整手动头 Item、来源正文被删改、明确无条件字段丢失或模型编造字段仍阻断。

待判断本地化：非原生状态 Diseased 仅按原文交 GM；本次不引入外部模块的疾病定义或自动机制。其他未批准未知尺寸仍拒绝。未来新来源出现不同尺寸类别，先对照源头与目标系统，再取得实际产品表达选择，不能直接推广本次 Colossal 映射。

来源：[作者 Charon 帖子](https://www.patreon.com/confluxcreatures/posts/slave-gods-of-171613449)、[同帖公开附件](https://www.patreon.com/file?h=171613449&m=759199072)、[dnd5e 5.3.3 配置源码](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/config.mjs)。本地保存输入与 V5 离线完整能力证据见 `docs/acceptance/2026-10-14-forge-staged-manual.md`。
