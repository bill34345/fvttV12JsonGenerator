# 本地 Foundry MCP 准备与检查

这个入口只处理本地 Mirror 和 ServerNext。它分别核对 Foundry 进程、MCP 后台身份与一次真实世界读取，避免把进程在线或工具列表可见误报成连接就绪。使用根 README 指定的本地开发运行时 Bun 1.3.14。

## 统一入口与按需连接

配置采用 `[mcp_servers.foundry]` 时，`FOUNDRY_MCP_CONFIG` 指向外部环境清单。此准备工具会从清单读取所选 Mirror 或 Next 的原有身份、端口和权限，并继续执行原有校验。统一入口与所选旧入口同时启用会拒绝，避免重复启动。

本机该仓库的主目录与现有 worktree 已统一配置。新建 worktree 时，本仓库 Git 初始化脚本从主目录复制统一入口和禁用的旧条目；环境清单仍共用，不需为每个新任务重复配置。

统一 MCP 在聊天初始化和列工具时不连接任何环境；调用 `mirror__get-world-info` 或 `next__get-world-info` 才连接对应后台。`production-readonly__` 只公开读工具。后台仍按环境共享，退出一个聊天不停止其他聊天使用的后台。Foundry 世界与 GM 页面的准备步骤保持不变。

配置切换后，尚未载入的聊天使用统一入口；已载入聊天可能仍持有旧工具目录，需要在任务可中断时通过正常设置重载或完整重启 Codex。不要为了刷新目录归档聊天或按进程名批量结束 Node。

旧工作区的源码尚未集成新版准备工具时，使用部署的独立入口 `F:\FoundryLab\foundry-v14\tools\foundry-mcp\codex-readiness.ts`，传入该工作区的实际 `--config`，不要运行尚不识别统一清单的旧版准备脚本。

维护源码位于个人 fork [bill34345/foundry-vtt-mcp](https://github.com/bill34345/foundry-vtt-mcp)，稳定定制线为 `main`。readiness 接受原 `on-demand-v1` / `v0.8.4-multi1` 组合，以及新版 `v0.8.5-on-demand.1` 中匹配的统一入口和后台。新版候选交付不会自动切换已有后台或 GM 页面；空闲时切换后仍需核对实际进程与 Bridge 版本。生产环境保持单独的权限与部署边界。

## 安装 worktree 配置初始化

`worktree_init.py` 是 Git `post-checkout` 初始化器的源码。它从主目录的 `.codex/config.toml` 提取统一 `foundry` 入口和三个禁用旧条目，补到新 worktree，并登记 `.worktreeinclude`。已有相同配置保持原样，已有不同 Foundry 配置会拒绝；其他配置和环境参数不改。

换电脑或重新拉取仓库后，先准备主目录的本机配置：启用 `foundry`，显式禁用 `foundry-mirror`、`foundry-next`、`foundry-production-readonly`。真实地址和凭据保留在本机。安装需要 Git 与 Python 3.11 及以上版本；下面的 `python` 必须指向准备供 hook 使用的解释器。

```powershell
bun run foundry:mcp:install-worktree-init --repo I:\OpenCode\fvttV12JsonGenerator
bun run foundry:mcp:install-worktree-init --repo I:\OpenCode\fvttV12JsonGenerator --apply
```

第一条只检查和输出计划。第二条才把源码和启动器安装到该仓库共用的 `.git/hooks`；`--repo` 也可指向其中一个已有 worktree，配置来源仍为主目录。启动器使用本次安装的 Python 绝对路径，源码不固定某台电脑的路径。解释器位置改变后重新运行安装器即可。

安装器不会对已有 worktree 立即执行初始化，也不会重写 MCP 配置或重启服务。以后正常创建 worktree 或切换分支时由 Git 触发。未知已有 hook、不同的 helper 或自定义 `core.hooksPath` 会拒绝，供维护者先处理冲突；不会覆盖另一套 hook 或创建备份。

聚焦检查使用真实隔离 Git fixture：`bun run test:foundry-mcp-worktree-init`。

## 检查连接

在当前 worktree 中执行，`--config` 使用该 worktree 的绝对配置路径：

```powershell
bun run foundry:mcp check --instance next --lab-root F:\FoundryLab\foundry-v14 --config I:\OpenCode\fvttV12JsonGenerator\.codex\config.toml
```

默认只读。增加 `--apply` 才把本次观察写入该实例的 `readiness.jsonl` 和 `current-readiness.json`。这会记录观察时间、状态、最后一次真实读取成功时间，以及最少的世界身份；不会保存角色资料、凭据或完整错误正文。

输出状态：

| 状态 | 含义 |
| --- | --- |
| `ready` | 已通过配置指纹检查，并实际读到预期实例、世界、Core 和系统版本 |
| `foundry_stopped` | 该套 Foundry 没有运行 |
| `backend_unavailable` | Foundry 已运行，但该套 MCP 后台不能响应 |
| `gm_bridge_missing` | Foundry 已运行，但在线 GM 页面的 Bridge 未连上 |
| `identity_mismatch` | 后台配置或读取目标与所选实例不符 |
| `service_conflict` | 端口或数据目录被身份不明、非回环或不完整启动的进程占用 |
| `startup_failed` | 本次启动没有通过进程归属与 HTTP 检查，进程和诊断日志保留 |
| `read_failed` | 后台没有完成有效世界读取 |

退出码 `0` 表示真实读取成功，`2` 表示尚未就绪或需要操作，`1` 表示参数、文件配置或工具执行错误。MCP 返回 `isError: true` 时绝不判为就绪。

启动最多等待90秒。窗口内未确认成功时会保留进程和日志；进程可能仍在初始化，应先核对同一PID和日志，不重复启动或把超时当成进程已经退出。

## 准备所选环境

```powershell
bun run foundry:mcp prepare --instance next --lab-root F:\FoundryLab\foundry-v14 --config I:\OpenCode\fvttV12JsonGenerator\.codex\config.toml --apply
```

移除 `--apply` 可只查看当前状态；它不会启动服务或写日志。有 `--apply` 时，只在端口空闲、没有对应 Foundry 进程且本地文件身份符合时启动现有实例。已正确运行的服务直接复用，未知占用会拒绝；入口不停止、重启或替换已有服务，不修改 Foundry Config 或世界数据库。启动使用隐藏后台进程、仅回环监听和 `--nobackups`。

`gm_bridge_missing` 的输出会给出 `browserAction`。执行代理应按项目 Chrome 规范准备**本任务拥有的 GM 页面**：Mirror 使用 `http://127.0.0.1:30001/game`，Next 使用 `http://localhost:30002/game`，按现有登录规则进入世界并保持页面在线，然后重新执行检查。保留其他任务的页面与占用；这个 CLI 自身不会创建浏览器、代替 GM 登录或声称页面已经准备。

检查走已安装 MCP 后端的控制协议，属于独立 CLI 读取。需要证明当前聊天原生 MCP 可用时，仍应由当前聊天调用对应服务的 `get_world_info`；CLI 结果不能替代那一层证据。

## 日志与恢复

自然检查的连接成功、断开与恢复保存在 `<lab-root>/tools/foundry-mcp/instances/<mirror|next>/readiness.jsonl`；当前观察和最后一次成功时间保存在相邻 `current-readiness.json`。失败观察保留上一次成功时间。时间是**检查发现状态的时间**，不代表准确的物理断线时刻；本入口没有定时监控或开机任务。

观察时间在本次检查完成时记录。并行检查乱序写入时，较早的观察会以 `older_observation` 留在日志中，当前状态保留较新的观察，最后一次成功时间取已知成功时间的最大值。

若写入锁或启动锁已存在，工具会拒绝争用，不按文件年龄抢占。先核对精确实例的进程、日志和锁归属，再按项目规则处理。

聚焦安全测试：

```powershell
bun run test:foundry-mcp-readiness
```
