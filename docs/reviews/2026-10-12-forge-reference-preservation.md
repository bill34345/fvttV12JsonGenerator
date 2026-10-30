# Forge 引用定义遗漏的窄排查

本次只处理已提供原文的引用定义没有进入输出，不更换PDF提取器、模型或战斗机制。

本地事实：同hash海鬼婆失败IR的coverage完整引用Hag Debts和Merthirst，却将二者标为ignored-with-reason，creature的能力/传记没有完整正文。公开Forge分析回放稳定返回SOURCE_DEFINITION_OMITTED；这属于IR到输出的保留问题。

外部第一手对照：[Docling Serve issue 271](https://github.com/docling-project/docling-serve/issues/271)的原报告使用2.41.0，PDF转Markdown时缺少FURNITURE层脚注；维护者建议使用原生Document JSON并按需要导出层。后续使用者也报告了独立转换服务方案。该问题发生在PDF导出层，本任务的输入已包含完整定义，因此不采用其提取器/服务改动，也不把外部经验当作本地原因。

采用现有来源事实整理与严格完整性检查：仅对明确引用定义的精确候选范围，按原文保留至已有传记字段并附来源证据，不推断自动效果；截断/矛盾/未知机制继续校验。最小反证是同一失败IR公开分析重放及不同名称的中英文、多段例外、scope和幂等回归。

待判断本地化：无新增外部模块或服务候选。若未来新来源确实在PDF提取后缺脚注，先对照原PDF与提取文本确认缺失发生层，再复查所用提取器精确版本/导出层；不能套用本次IR保留修复来掩盖输入缺失。原任务进度与实测见[第一轮计划](../plans/2026-10-11-forge-first-pass-optimization.md)。
