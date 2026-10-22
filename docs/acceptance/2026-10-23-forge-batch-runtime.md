# Forge 普通批量队列真实验收（2026-10-23）

**本批三处真实验收通过，临时 Actor、宏、两个 QA 存储项、三个静态 QA 文件及本批页面已清理；Mirror 保持运行。** 本次没有发现需要修改产品代码的新故障。首次取证工具初始化错误已仅在取证层修复，原日志保留。

用户在[第一批离线修复](2026-10-22-forge-batch-candidate-first-pass.md)完成后明确授权“开始做这个真实的验收”。沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD仍为 `c6263af`，改动未提交；没有合并、推送或生产操作。

后续本地提交：验收完成后，用户另行授权将本批修复、测试、验收记录和手册整理为本地提交，以包含此记录的commit为准；上段HEAD及未提交状态保留为验收当时的事实。提交整理不重跑实机、不修改产物或原始收据，不合并、不推送、不改hook。

## 目标、候选与方法

- 精确本地目标：`F:/FoundryLab/foundry-v14/data/server-mirror`，Foundry `14.368`／dnd5e `5.3.3`／`cor-cotn`。
- 原端口无监听且旧进程已退出。复用已验证的180秒等待启动入口启动同一实例，PID `59936`、仅 `127.0.0.1:30001`；没有修改启动器、Core、dnd5e或Resolver。原启动器修改仍留在其原独立工作树，没有合并到本工作树。启动成功后的输出管道壳单独关闭，没有终止服务进程树。
- 本地安装只更新 Forge 主脚本和批量模板。主脚本 SHA-256：`1a3b7c07a27a13a6dd11513a6c6f83e078f34d59cdecc4f2e6fba7f43a105465`，模板为 `9a34b284c32ae3ce996e09539bcc864303e60a3c53e6075f5b32287f9ae23e35`。HTTP读回一致，真实页面显示本批按钮、确认框和历史摘要。
- 执行器为同任务 `/root/forge_batch_browser`，实际最新 `turn_context` 核实 `gpt-6.1-sol / medium`、`danger-full-access / never`；使用官方Chrome扩展。通过正常宏UI打开测试入口，后续生成、刷新、GM确认、历史导入和删除均使用正常界面。
- 复用已有、未经修改的2024 Mage来源及冻结IR。原始来源哈希：`d572dfcb4649f39c34f389dba5a2bd82515b023eb2540ee0f6daf539b49581dc`。只替换Provider回复及隔离的连接设置，正式生成、Application、IndexedDB、队列、审批、Actor创建和读回均使用当前产品代码；不手写最终Actor或伪造审批结果。
- 生产IndexedDB store使用精确任务scope `cor-cotn:<当前GM>:qa:forge-batch-20261023-50b1e3`。既有默认来源库、队列和战斗包恢复项只读哈希保护，没有复制或恢复这些数据。

## 实际结果

| 场景 | 真实观察与独立复核 |
|---|---|
| 首次批量候选 | 同一固定Mage正式链形成可用候选，job为`ready_for_gm_review`／attempt1，正式`needs_review`，11项原问题保留；固定discover／extract各1，尚无新Actor。 |
| 整页刷新 | 同一job及attempt1保留，内存候选从1变0；discover／extract仍各1，0自动请求／创建。批量创建禁用，显式继续可用。此为整页刷新，不是仅重开Application。 |
| 显式重新准备 | 正常点击“开始／继续批量处理”后，attempt变2并取得新候选；固定discover／extract各2。没有继承旧GM审批。 |
| GM批量采用 | 正常确认框显示正式`needs_review`及原问题，正常滚动／点击“是”后创建唯一`Actor.31251abe8924608a`。job为`applied`，latestReview为`reviewed_candidate`，正式仍`needs_review`；11项findings和候选检查摘要与确认前完全相同。 |
| 真实创建读回 | 队列结果、GM证明与世界Actor的sourceId、最终sourceHash、artifactHash一致，Actor记录真实GM采用及原严格结论。5个来源Item和12个owned法术缓存保留，其余10个世界集合没有增删。未Cast、掷骰、移动或攻击。 |
| 已采用历史 | 从正常job“打开只读review”，摘要显示流程`reviewed_candidate`、正式`needs_review`；创建不可用。 |
| 提交中历史 | 用刚才真实采用记录构造合法`committing_and_reading_back`只读历史File，经正常“载入审核记录”导入，摘要显示该流程状态及正式`needs_review`，没有误标accepted；没有增加请求或创建。该记录是历史fixture，不声称真实发生崩溃。 |

创建产物hash为 `12ac065c841b67557be16b7d8447cdec71b973fd560f0f1bcdff20223f9abd87`。父控独立核对四阶段JSON、审批和世界身份、原问题、集合差异、历史DOM及截图，不仅采用执行器的PASS汇报。

最终固定回复调用计数为 **discover2／extract2／review0／repair0／liveModel0**。完整来源和失败结论未因验收而改写；本次不评价新模型准确率、费用或速度。

## 清理、恢复与保留

- 最终读回后，仅删除上述新Actor及其embedded Items；11个世界集合ID集恢复。既有Guard、24个Token、场景／视图／时间／控制与目标选择均与本批基线一致。
- 两个QA IndexedDB存储项与本任务localStorage键已删除，原默认scope哈希不变。临时宏 `Forge Batch QA 50b1e3`／`SystdDm8Z9rRdIK8`正常UI删除，同名及ID读回均为0。
- 三个QA静态文件在父控核对精确路径、安装SHA及最终读回后删除；测试源码、v1／v2构建、原始失败及有效业务证据保留。产品候选仍安装，Mirror `59936`保持驻留，没有停服或回退产品。
- 初始取证失败来自Foundry扩展DTO的`undefined`字段，不是产品生成或队列失败。仅将取证哈希改为JSON序列化视图，再完成本轮真实链；不修改Guard或放宽产品校验。
- 宏清理曾被执行器主动暂停，未发生自动审批拒绝。核对完整浏览器政策及已有临时对象清理授权后，按明确的可丢弃测试数据条款继续同一官方UI。原始政策核对记录保留，不新增用户审批要求。
- 初始9个其他页面未被执行器操作；期末库存有1个消失、2个新增，原因未知。本批只关闭自建页面，不声称全浏览器库存一致，也不调查其他用户页面。
- 服务options、dnd5e和Resolver脚本保持指纹一致。世界manifest因本次正常启动更新了`lastPlayed`，固定版本仍14.368／5.3.3；没有为恢复旧字节哈希回写运行时间。

## 证据与接受边界

原件目录：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-batch-runtime-acceptance/`。

主要入口为 `before-reload.json`、`after-reload.json`、`after-explicit-rerun.json`、`after-apply.json`、`committing-history.json`、`cleanup.json`、`parent-create-review.json`、`macro-delete-final.json`、`browser-result-final.json` 和最终父控收据；对应截图／DOM保留。验收源码在 `tests/diagnostics/forge-batch-runtime-browser.ts`，仅经正常模块构建和精确Lab安装运行，不是默认产品入口。

本次是固定Mage、当前候选、当前本地版本上的三处真实行为证据。`failed`及Item等其他分支复用前轮离线回归，没有新增实机矩阵；不推广到任意新来源、完整法术玩法、完整候选持久化、下载落盘、6.x或生产。本批未改产品代码，前轮94／68／3项检查继续复用；仅为新增取证源码做严格类型检查及实际运行，没有重跑无关测试。

唯一当前交接入口仍为[当前状态](../plans/2026-10-20-forge-ab-current-state.md)。
