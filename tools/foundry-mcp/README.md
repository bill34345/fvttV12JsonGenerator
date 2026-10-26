# 本地 Foundry MCP 准备与检查

这个入口只处理本地 Mirror 和 ServerNext。它分别核对 Foundry 进程、MCP 后台身份与一次真实世界读取，避免把进程在线或工具列表可见误报成连接就绪。使用与项目 CI 一致的 Bun 1.3.14。

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
