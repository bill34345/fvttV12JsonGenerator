# Forge 普通批量队列第一批修复（2026-10-22）

本批从 `c6263af4bdb2b45279746ff00e977f368153ec18` 继续，沿用 `20261019-forge-ab-fixed-replies` 工作树。用户授权只处理普通批量候选、刷新后续接及历史摘要；不新增真实模型调用、不扩展玩法、不做完整候选持久化、不改 hook、不提交／合并／推送。

**三处实现及离线验证完成。新的真实 Foundry 页面、批量世界创建／刷新验收为 NOT_EXECUTED。** 既有普通 Actor 创建／读回及 Item 严格创建证据只复用于未改动的服务边界，不能当作本批新队列实机通过。唯一当前入口仍为[当前状态](../plans/2026-10-20-forge-ab-current-state.md)。

后续更新：上段及本文NOT_EXECUTED描述2026-10-22离线批次。用户随后明确授权，2026-10-23已完成这三处的限定真实批量／刷新／历史验收和精确清理，详见[后续实机记录](2026-10-23-forge-batch-runtime.md)；不回写本页当时的离线检查为实机证据。

## 原因、证据和修复

| 问题 | 原因与使用后果 | 本批修复 |
|---|---|---|
| 普通批量漏接 Actor 候选策略 | 单只 Actor 允许对有 IR 的语义待审来源生成可用候选；批量 runner 只在 `ready_to_generate` 时生成。之后的候选筛选、GM确认、队列apply又只接受 `accepted`，导致单只可用的候选在普通批量里无法交付。 | 批量复用单只的候选生成条件及现有 GM 审批／候选创建服务。队列增加 `reviewed_candidate`，manifest及逐项apply接受有完整审批身份的AI Actor采用记录，保留原 `needs_review`／`failed`及问题；Item仍须accepted。 |
| 待GM确认任务刷新后不能续接 | 来源及只读review保存在队列；完整response仅在Application内存。刷新后内存丢失，`ready_for_gm_review`又同时被UI与队列的启动条件排除，只能先取消再恢复。 | 缺少当前内存候选的待审任务，可显式点击“开始／继续批量处理”产生新attempt并重新准备。打开／刷新队列不会请求模型、创建Document或继承旧确认。当前已有有效候选时不重复运行。 |
| 历史摘要误称accepted | 历史渲染把所有 `committing_and_reading_back`统一写成accepted；该流程状态也可能来自GM采用的非accepted Actor。 | 摘要分别显示真实流程状态、正式检查结论和GM采用记录。历史始终只读，不能直接创建。 |

审批继续绑定当前GM、原始／最终来源、候选、目标及产物。审批后的review除状态与GM审批本身外须与当前待审记录一致。确认框显示正式结论和具体问题；确认后重新核对候选清单，篡改来源、产物或解析结论不得写世界。非accepted Actor继续走现有 `createReviewedForgeActorCandidate`，不改严格创建接口或生成器，不手写产品最终JSON。

本批只保存既有review摘要及新增状态，没有把完整response/artifact写入队列。刷新后的“继续”是显式重新准备，可能产生新的AI费用，不承诺免费恢复旧候选；战斗包原有持久化续跑不变。

## 已执行验证

使用原本隔离的 Bun `1.3.14`，没有变更全局安装。新增 `test:forge-batch-queue` 只为既有 hermetic runner 选择队列、IndexedDB和Intake Application测试文件，没有新增运行框架。

| 检查 | 实际结果及边界 |
|---|---|
| `bun run test:forge-batch-queue` | 94 pass、0 fail、777断言。新增9项回归覆盖两种非accepted Actor采用、Actor／Item刷新后显式重跑、确认后来源／产物／解析篡改拒绝、队列采用状态及只读历史。包含既有混合队列、部分失败、并发／权限边界与IndexedDB检查。 |
| `bun run test:forge-candidate-output` | 68 pass、0 fail、396断言。复用固定回复、候选／协议与现有创建／读回适配器检查；不请求真实模型。 |
| `bun run test:forge-v2-bw:bundle` | 3 pass、0 fail；浏览器bundle安全、模块文件清单及确定性离线发布包一致。仅构建，没有安装或发布。 |
| `bun run typecheck:packages` | PASS。 |
| `bun run typecheck:foundry-modules` | PASS。 |
| `bun run architecture:verify` | PASS，无依赖违规及循环。 |
| 手册人工核对、review／build／check | 33项一致；只核对实际stale的 `verification-development`、`human-encounter-intake`、`fvtt-json-forge`。后者更新用户步骤；战斗包仅共享目录watch触发，行为未变。 |

首次局部检查为93 pass／1 fail：新增needs_review测试夹具错误地携带error级诊断，与现有协议不符。仅把该夹具改为warning；failed仍保留error，没有放宽产品解码器。首次模块类型检查发现Actor／Item联合类型不能直接访问可能不存在的artifact，已改为显式收窄并通过复验。两个初始失败日志保留，不计作最终通过结果。

## 保留的限制

- 本批没有Chrome／真实Foundry页面操作，没有安装候选到Lab或生产。新队列的实机按钮表现、真实Document创建与整页刷新仍未取得本批证据；离线Application重建不是浏览器刷新实测。
- 没有新增真实模型生成、纠错或审核；固定结果不能证明新资料准确率、费用或速度收益。
- 没有持久化优化、玩法扩展、hook改造、提交、合并或推送。完整来源／原始回复及历史首轮失败继续保留。
- 原件保护和最终diff／HEAD核对另见本批外部 `final-receipt.json`，不把私有原回复或本机配置加入仓库。

日志及收据目录：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-batch-first-pass/`。
