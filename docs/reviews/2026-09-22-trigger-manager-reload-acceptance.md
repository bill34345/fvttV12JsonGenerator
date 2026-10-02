# Trigger Manager 完整页面重载验收

日期：2026-09-22。范围仅为通用 Actor HP Trigger 的 Manager 创建、编辑、完整页面重载及启停后的真实事件分发。

## 基线与既有证据

- 源码基线：master `8c8bad682b7c7339824465f0ef93ef30a7e38cb4`，主工作区开始时干净。本次记录在独立 `codex/20260922-101904-trigger-manager-reload` worktree 编写，不提交、合并、推送或部署。
- [2026-09-21 发布就绪记录](2026-09-21-custom-conditions-release-readiness.md) 中，通用 Trigger 的完整 reload 门仍待补。Bleeding 的 reload 证据不能替代通用 Trigger 配置验收。
- 2026-09-22 CoTN 组合验收 `F:\FoundryLab\foundry-v14\evidence\server-mirror-cotn-review\20260922-handoff\ACCEPTANCE.md` 已覆盖 Trigger HP 更新及停用，但未覆盖本次完整链路，因此只补本门。
- 当前实际目标为 `server-mirror / cor-cotn`，Foundry `14.364` / dnd5e `5.3.3`；与旧记录中的 `fvtt-v14-module-matrix` 不同。30001 为 PID `30872`，数据目录 `F:\FoundryLab\foundry-v14\data\server-mirror`。保留原世界与模组组合，不切世界、不启停常驻服务。
- 根入口 `bun run build:trigger-engine` 成功；运行 JS SHA-256 为 `3B9EF04243BADDA5DCFB7612CA591DAE76FE51E771EF78D86FF04FF1485F85DA`。构建与安装的 JS、manifest、模板、样式、语言文件逐文件相同；两份 README 不同，不影响本轮运行代码身份。
- 初次从模块目录执行构建时，仅 Bun 输出中的源码路径注释前缀不同；改用根 package 脚本后运行 JS 与安装逐字节一致，未修改或重装 Lab 模块。

## 本轮证据

证据根：`F:\FoundryLab\foundry-v14\evidence\trigger-manager-reload\20260922-101904`。

- `environment-before.json`：开始时 Git、API、监听者及已安装模块文件哈希。
- `build-installed-comparison.json`：当前源码构建与 Lab 安装逐文件比较。

结论：**PASS**。真实 Chrome 原生 Manager UI 与完整页面刷新已完成以下验证，无需修改模块源码。浏览器操作约为北京时间 10:20–10:42；后续仅整理及审查既有证据，未继续浏览器测试。

| 验收门 | 状态 |
| --- | --- |
| Manager 创建、编辑，完整刷新后 ID / 条件 / Macro / 启停一致 | PASS：创建后编辑名称；完整刷新经历 `/game → /join → 登录 → /game`，重新打开 Manager 读回相同定义字段 |
| 仅刷新、不修改 Actor：执行 0 次 | PASS：持久 setup 标记保留，Logger 仍为 0 条 |
| 匹配 Actor HP 更新：执行 1 次 | PASS：Target HP `29→28`，Logger `0→1`，上下文 Actor UUID、Trigger ID 及 HP 前后值匹配 |
| 无关字段、其他 Actor HP 更新：分别执行 0 次 | PASS：Target 的 `system.attributes.hp.temp` 更新与 Other HP `29→28` 分别观察 2 秒，Logger 均保持 `1→1` |
| 停用后刷新：匹配更新 0 次；重新启用恢复 1 次 | PASS：停用及完整刷新后 Target 串行 `26→27→26`，Logger `3→3`；另一次停用刷新后的重新启用，Target `28→27`，Logger `1→2` |

使用刷新后仍保留的、带本轮唯一前缀的持久 ChatMessage 追加日志计数，并核对调用上下文；不使用刷新会清空的内存变量或全局 Chat 总数代替。Manager 创建、名称编辑及启停均经真实 UI；HP 更新经原生 UI 创建的脚本 Macro 调用公开 `Actor.update`，没有直接调用 Trigger 分发入口或伪造 Hook。

本轮定义 ID 为 `TRIG-RELOAD-20260922-hp`，编辑后的名称为 `TRIG-RELOAD-20260922 HP Match Edited`；监听 `system.attributes.hp.value`，条件为 `ALL: after-path _id eq aA4X9jG6IFlBWjoF`，Macro 引用 `Macro.WWifMIWbtgaDGRj4`。刷新后逐字段语义读回相同；结构化摘要不是原始完整对象的自动深比较。

### 实际顺序与父任务复核

1. 创建 Target / Other Actor、Logger / Driver Macro；Manager 创建并编辑 Trigger；完整刷新并登录，读回配置及 Logger 0 条。
2. 匹配 HP `29→28` 产生第 1 条；同 Actor 临时 HP、Other HP 分别不产生记录。
3. Manager 停用、完整刷新、读回停用，再重新启用；匹配 HP `28→27` 产生第 2 条。
4. 一次意外仍在启用状态的 `27→26` 产生第 3 条。它不能证明停用拦截，明确排除出该门；最初角色表输入落在临时 HP 的操作也未冒充匹配 HP 验收。
5. 再次停用并完整刷新，真实执行两个串行 `await Actor.update`：先 `26→27`，再 `27→26`；末尾 driver 标记读实际 HP 26，等待 2 秒后 Logger 仍只有上述 3 条。

父任务独立核对本轮原始浏览器调用：UTC `02:40:27.093` 在原生 Macro 编辑器输入两个顺序更新，`02:40:40.992` 点击执行，`02:40:49.100` 的 AX 读回包含原 3 条 Logger 及末尾 HP26 标记。由于末尾标记在两个 await 之后，已排除 `26→26` 无变化更新造成假通过的疑点；中间 HP27 没有单独截图，不将其表述为独立中间读回。独立审查据此解除原证据阻断，无需重测。

### 清理与证据文件

本轮 Actor `aA4X9jG6IFlBWjoF`、`2TmBMTwv13zr9DTg`，Macro `WWifMIWbtgaDGRj4`、`T9fBJizridsgfZUT` 和上述 Trigger 按精确 ID 清理；Chat 按本轮唯一前缀筛选清理。UI 显示清理成功、Trigger Manager 为空、两个 Actor 与 Macro 精确名称不再出现、前缀 Chat 消失。活动场景恢复为 `BP-ACCEPT-20260823-B14-234906-Frost-Badlands`；这是 `cor-cotn` 中的场景名，不是世界 ID。

- `report.md` / `readback.json`：浏览器执行报告与结构化语义摘要。
- `parent-disabled-raw-excerpts.json` / `parent-review.json`：针对停用测试疑点的原始 AX 摘录、精确脚本与父审结论。
- `http-runtime-identity.json`：HTTP 返回的模块 JS 哈希与构建、安装一致。
- `environment-after.json`：最终 API、监听 PID、工作区状态与模块文件身份。

Logger ChatMessage 文档 ID 未在清理前单独记录，保留为追溯性限制，JSON 中为 null，不编造。原始调用及内容足以支持本轮计数结论。未单独对重新启用后的状态再刷新；本次要求的启用恢复单次行为已覆盖。没有采集全世界对象数量或全部启用模组清单的前后深比较，因此清理结论限于本轮对象及已观察现场。

## 边界

本轮不扩大到全部状态、active GM 切换、Combat 事件、长时会话、serverNext、其他版本或生产。源码静态核查与构建只证明实现和安装身份，不能代替上述浏览器验收。

最终 10:48 复核：30001 仍为 PID30872、同一 `cor-cotn / 14.364 / 5.3.3`，30002 仍为 PID34548，运行 JS 哈希未变。主区被其他工作推进至 `e2739f0` 且仍干净；相对本轮基线仅新增外部付费模块调研记录及其 AGENTS 约定，与 Trigger 源码、安装及本轮两份验收文档无重叠。已读取新增约定；本任务未移动 master、未自动整合该提交。

实际检查：`bun run build:trigger-engine` 成功、运行资产逐文件/HTTP 哈希对账通过、证据 JSON 解析及判定一致性通过、`git diff --check` 通过，并完成上述真实浏览器验收与原始记录审查。只修改本专项记录和旧就绪摘要，不改变用户可见功能或工具用法，故未重跑无关全仓测试、未改手册或刷新其指纹。所有变更保留为本 worktree 未提交文件。
