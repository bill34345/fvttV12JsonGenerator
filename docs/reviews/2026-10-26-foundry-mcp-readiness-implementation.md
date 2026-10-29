# 本地 Foundry MCP 准备与恢复实施

> 已完成的Next阶段记录。用户随后恢复Mirror实施，最新接续见[Mirror验收记录](2026-10-26-foundry-mcp-mirror-acceptance.md)。下文“Mirror暂不处理”和进程/页面状态均是Next阶段当时的边界与读回，不代表Mirror当前仍暂停或这些进程跨重启持续存活。

日期：2026-10-26，Asia/Shanghai。当前实施 owner：聊天 `01a173dd-c199-7281-9775-17e178f56517`。工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261026-004213-foundry-mcp-readiness-review`。

## 授权与当前范围

用户执行授权原话：“这些东西都由你来完成吧，按照这个步骤”。接续 [优化评审](2026-10-26-foundry-mcp-readiness-review.md) 的连接闭合、GM 客户端准备、真实读回、日志与重连修正。

用户随后明确：“先处理 next吧，mirror先不要处理”。因此本轮运行安装和验收仅为 Next；Mirror 未安装恢复适配器、未操作已有页面、未向其他聊天发送协调消息。CLI 的 Mirror 参数和已有单元测试不构成 Mirror 已处理。没有 commit、merge、push 或生产写入授权。

## 当前交付与进度

- Next 原有 Bridge 设置正确；本轮启动现有服务并通过任务专用 GM 页连接。原生 MCP 成功读取 `cor-cotn`、Foundry14.368、dnd5e6.0.6；角色目录与既有 Amalgam 读取均成功。没有创建 Actor/Item/Journal/Scene。
- `foundry:mcp prepare|check` 分别区分服务、后台、GM Bridge、身份和真实读取；只有 `--apply` 才启动缺失服务或写审计。已有正确服务复用，未知占用拒绝。
- Next 安装 `local-recovery-1`：单一恢复控制者、首次连接失败后保留监测、尊重显式停止与重连偏好；后台目标与权限校验不变。
- 观察审计按完成时间写入，迟到旧观察不覆盖新状态，`lastSuccessAt` 保留最大成功时间。客户端连接事件保留最多64条，不保存角色正文或凭据。
- 开发流程入口已加入 Ruler 源说明；手册已生成38项。修订后CLI真实启动并正常返回，最终GM页与原生MCP/固定入口读回均通过；本轮Next实施完成。

## 行为证据

以下事件时间由 UTC 收据转换为北京时间；完整本机收据在该工作树 `.local/mcp-readiness/`。

| 检查 | 已观察结果 |
| --- | --- |
| 初次正式 MCP | 正确世界和版本、294项角色目录、既有 Amalgam 读取成功 |
| 独立 CLI | `ready`，复用已核实的 Next PID22468；不冒充当前聊天原生工具 |
| 故障原代码契约 | 对精确安装主文件哈希还原出的实际类复现初始失败无监测、心跳恢复失败持久关闭重连偏好；内存网络/计时器/设置替身，不是实机断网 |
| 客户端真实断线 | 01:10:06断线，01:10:35自动接回；首次候选日志原因误标 startup，已修正并窄复验 |
| 显式停止 | 01:11:00停止，01:11:58仍断开且监测关闭；enabled/autoReconnect/Allow Write Operations均保持原值true |
| 停止时读回 | 原生工具 module not connected；CLI `gm_bridge_missing`、退出2；当前日志保留上一成功时间 |
| 手动恢复 | 01:12:53连接恢复，无偏好变更 |
| 最终日志修正 | 01:14:01断线，01:14:20自动恢复且原因正确为 recovered |
| 最终候选页面重载 | 01:15:09重新连接；仅本任务专用页被重载 |
| 首连失败模拟 | 正常宏UI临时改变本页配置 getter，使单次连接指向无监听端口；finally恢复原getter和31515，持久设置未改；01:15:44失败、01:16:14仅靠心跳恢复，没有手动启动；配置变化后的连接原因显示startup，边界已记录 |
| 真实准备启动 | 修订CLI于01:29:35正常返回，启动Next PID11320，正确报告GM未连接并要求浏览器接续；独立进程读回另见最终收据 |
| 最终使用状态 | 专用GM页651351163保留；01:35:15固定本机入口prepare返回ready、复用PID11320，当前聊天原生世界及既有Amalgam读取成功 |

Next 最终服务PID11320，回环端口30002，数据路径 `F:/FoundryLab/foundry-v14/data/server-next`，现有app14.368；启动使用 `--nobackups`。启动命令返回后，由独立进程确认命令、创建时间、监听归属和 `/join` HTTP200。最终收据：`.local/mcp-readiness/runtime/next-final-operational.json`。

## 代码与安装身份

- 已核上游 Bridge0.8.4主文件：`169abb12ddc7793f9c8dbcb7d01484a50f28d79cc82c550384a4ed70cf43d6b0`。
- 本地注入后主文件：`eb75ed360c8dba836a8a9ff01589a76df232fed5e41a41ac31a06aa743789cb3`。
- 最终恢复 helper：`8c7b4d49b8ca355a895e278c1f6f2110dfa8310adfa5099ceeb818039bd02ed5`。
- 固定本机CLI：`F:/FoundryLab/foundry-v14/tools/foundry-mcp/codex-readiness.ts`，SHA256 `4dc048a25c735480f3a5359b7965d46cc45c9b35c5c487055f52e12a3a491c13`；与仓库实现同字节，实际复用准备已通过。
- 安装器只接受已核基线、完整注入标记与已知本任务旧helper；未知文件拒绝覆盖，不创建备份。

实现：[readiness.ts](../../tools/foundry-mcp/readiness.ts)、[bridge-recovery.mjs](../../tools/foundry-mcp/bridge-recovery.mjs)、[install-recovery.mjs](../../tools/foundry-mcp/install-recovery.mjs)。使用入口：[准备流程](../runbooks/foundry-mcp-readiness.md)。上游版本和第一手案例来源沿用优化评审；没有将旧版Mac/HTTPS使用案例当作本地Windows修复依据。

## 验证与剩余工作

- Bun1.3.14安全测试：readiness 17项/73 assertions；恢复15项/49 assertions，包括精确安装代码契约与真实 SocketBridge 类的内存事件测试。
- 独立审查发现并关闭：旧 socket 停止后重连、短暂连接事件漏记、旧观察覆盖新状态、安装器缺少注入标记，以及helper单独升级预览数量错误。最终限定复查未发现新增实质问题。
- `agents:generate` / `agents:check`、`typecheck:tools`、38项手册生成/一致性、生成HTML实际条目和命令内容均通过；最终受影响手册指纹已人工核对。临时宏按精确ID删除并读回为0，原测试页已关闭；最终保留新GM页供正常使用。
- 主代理目视检查了最终Bridge设置截图，实际可见Connected、localhost和31515。最初一般设置截图未显示连接状态，仅作为版本证据；缺口只补采截图，没有重跑已通过功能。
- 两种首启顺序的源码契约与本页不可用目标模拟分别记录；没有停止 MCP 共享后台或把模拟称为真实后台停机。Mirror 和生产接受不在本轮结论中。
- 本机Next连接修正及固定CLI已安装生效；仓库实现、Ruler流程和手册仍在本工作树，未提交、合并或推送。主线其他聊天尚不会自动读取这个工作树里的新流程，不将其称为全项目已集成。

## Windows 启动器实测补充

首版CLI真实启动了Next PID11632并完成回环监听、世界启动和GM未连接状态判定，但Bun父进程退出后，外层PowerShell捕获命令仍保持等待；在停止精确的本任务子进程后才返回原来的有效JSON。服务启动成功和命令正常返回分别判定，该收据不作为完整启动入口PASS。

启动适配器改用隐藏的PowerShell Start-Process，显式重定向本任务日志，先关闭自己的文件句柄，再返回PID并执行原有身份/HTTP检查。本轮修订入口已真实启动PID11320并正常返回；此前原生MCP和客户端恢复的有效证据保留，没有因此重跑这些用例。

辅助核对脚本另有将已解析DateTime再次按文本解析的错误，非终止错误后脚本继续并停止了本任务创建的Next PID22468。随后独立核对进程与端口，确认只涉及本任务服务，再继续启动入口验收；失败记录保留，辅助脚本改用严格错误停止和精确进程身份读回。没有据此重复安装模块。

按firsthand-research/AnySearch重新检索并读取[上游Bun Windows detached报告](https://github.com/oven-sh/bun/issues/31603)：作者在Bun1.3.14也复现了Windows子进程生命周期问题，但其表现为父退出时子被终止，与本机子进程保留、外层命令等待不同。它不能证明本次具体原因，本轮也未采用报告中的替代命令；本地修正以隐藏Start-Process的既有成功和修订CLI的实际返回为依据。
