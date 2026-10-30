# 本地 Foundry MCP 开发准备

在开发任务需要通过 MCP 使用本地 Foundry 时，先准备所选实例，再实际读取世界。服务器在线、MCP 工具可见和游戏连接就绪分别判断。

当前实现支持独立选择 Mirror 或 Next。Next阶段完成后，用户已恢复Mirror实施；两套分别保留安装与运行验收，不能由其中一套的结果推定另一套可用。最新结果见各自实施记录。

统一入口安装后，`mcp_servers.foundry` 的 `FOUNDRY_MCP_CONFIG` 保存各环境清单位置；本工具读取所选环境的原配置并保持身份校验。旧的三个 MCP 条目保持禁用，避免每个聊天重复启动接入进程。原生工具改为 `mirror__get-world-info`、`next__get-world-info` 等固定环境前缀。列工具不会唤起环境，实际调用才连接；已经由其他聊天使用的环境继续运行。

现有旧 worktree 尚未集成新版 readiness 源码时，应使用下方独立本机入口；它已能识别统一清单。工具源码的提交/合并与外部运行配置部署分别记录，不把部署完成写成已合并。

本机该仓库的现有 worktree 均已切换统一入口；以后按正常 Git 流程新建 worktree，会由本仓库 post-checkout 脚本继承主目录的统一 MCP 配置，并保留 `.worktreeinclude` 中的配置文件登记。

版本升级时，准备工具接受原 `on-demand-v1` / `v0.8.4-multi1` 组合与 `v0.8.5-on-demand.1` 的匹配入口/后台。文件路径正确不代表旧进程已替换：共享后台会被复用，GM 页面也不会自动加载新 JS。候选可先独立交付，真实切换需在任务空闲时核对后台进程、Bridge 与世界读回；不要为了更新版本打断其他任务。

首次拉取仓库或换电脑时，先在主目录准备统一 MCP 本机配置，再安装版本管理中的初始化器。需要 Git 和 Python 3.11及以上；不带 `--apply` 时只显示计划：

```powershell
bun run foundry:mcp:install-worktree-init --repo I:\OpenCode\fvttV12JsonGenerator
bun run foundry:mcp:install-worktree-init --repo I:\OpenCode\fvttV12JsonGenerator --apply
```

安装只写本仓库共用的 Git hooks，后续新建 worktree 自动继承。已有未知 hook、不同 helper 或自定义 hooksPath 会拒绝，不能直接覆盖；安装不会重启 MCP 或立即修改任何 worktree 配置。源码、解释器选择和冲突边界见 [准备工具说明](../../tools/foundry-mcp/README.md#安装-worktree-配置初始化)。

## 日常准备顺序

1. 选择当前任务实际需要的实例，核对共享占用。使用根 README 指定的本地开发运行时 Bun 1.3.14；配置取当前 worktree 的 `.codex/config.toml` 绝对路径。
2. 执行准备命令。正确运行的服务复用；端口和对应进程均空闲时才启动现有本地实例，不重启已有服务。

   ```powershell
   $taskRepoRoot = (git rev-parse --show-toplevel).Trim()
   bun run foundry:mcp prepare --instance next --lab-root F:\FoundryLab\foundry-v14 --config "$taskRepoRoot\.codex\config.toml" --apply
   ```

3. 返回 `browserAction` 时，按项目 `chrome-delegation-dev` 规范复用执行代理和本任务拥有的专用 GM 页面。Next 固定使用 `http://localhost:30002/game`，Mirror 使用 `http://127.0.0.1:30001/game`，分别隔离登录 Cookie。正常登录进入 `cor-cotn`，核对 Bridge 已启用、正确端口及连接状态；保留原有写入权限设置。拒绝广播重载，只重载本任务页面。CLI 不操作 Chrome，浏览器动作由执行代理接续完成。
4. 执行一次检查并记录观察。随后由当前聊天对应的原生 `get_world_info` 读回实例、世界、Core 和系统版本；首次接入或恢复验收再读取一项既有角色或合集。未通过时不继续依赖 MCP 的操作。

   ```powershell
   bun run foundry:mcp check --instance next --lab-root F:\FoundryLab\foundry-v14 --config "$taskRepoRoot\.codex\config.toml" --apply
   ```

5. 保留专用 GM 页面及其 owner/tabId 收据，供同一批工作复用。关闭该页会中断此客户端连接；下次需要时重复准备流程。其他任务页面保持其原有所有权。

`--apply` 允许准备命令启动缺失的本地服务并写审计；不带它只读检查。工具拒绝未知占用、错服、禁用配置及非本地目标。输出 `ready` 必须来自真实世界读取，不能以 ping、工具列表或页面 Connected 代替。具体状态和退出码见 [CLI 说明](../../tools/foundry-mcp/README.md)。

本轮已把同字节 CLI 安装为独立本机入口，未合并当前 worktree 时也可使用；配置仍读取该项目的外部实际条目：

```powershell
& F:\FoundryLab\foundry-v14\runtime\bun-v1.3.14\bun.exe F:\FoundryLab\foundry-v14\tools\foundry-mcp\codex-readiness.ts prepare --instance next --lab-root F:\FoundryLab\foundry-v14 --config I:\OpenCode\fvttV12JsonGenerator\.codex\config.toml --apply
```

## 一次性本地恢复修正

安装器仅接受已核实的 Bridge 0.8.4 主文件和已识别的本地补丁，校验字节后增加恢复适配器；不升级 Foundry 或 dnd5e。

```powershell
bun run foundry:mcp:install-recovery --instance next --lab-root F:\FoundryLab\foundry-v14
bun run foundry:mcp:install-recovery --instance next --lab-root F:\FoundryLab\foundry-v14 --apply
```

先审阅不带 `--apply` 的计划；实际安装后，仅重载本任务 GM 页面，并用 `window.foundryMCPBridge.getRecoveryStatus()` 的正常应用检查入口核对 `local-recovery-1`。页面状态读取通过正常 Foundry 宏/UI，Chrome 不使用注入代码绕过应用入口。

适配器在页面存活、模块启用且用户允许自动重连时持续退避恢复。它修正首次连接失败后没有心跳监测、失败时持久关闭用户重连偏好、以及底层旧 socket 在停止后自行重连的问题。显式停止或禁用后不自动恢复；恢复启动由正常设置或启动操作发起。身份校验继续由后台执行，不放宽预期目标。

## 连接记录

- `<lab-root>/tools/foundry-mcp/instances/next/readiness.jsonl`：自然检查的状态、成功、断开、恢复及乱序观察。
- 相邻 `current-readiness.json`：最新观察与不倒退的 `lastSuccessAt`。失败记录不抹掉上次成功时间。
- GM 页面恢复适配器：通过模块的 `getRecoveryStatus()` 提供最多 64 条 `connected`、`disconnected`、`retry_failed`、`stopped`、`page_closed` 事件；保存在该站点、该世界专用的客户端存储。事件只含时间、类别、原因类别与次数，无角色正文或凭据。

CLI 日志中的时间是检查观察完成时间；客户端 WebSocket 事件在页面实际收到时记录。页面关闭或电脑关机期间没有后台页面计时器，因此不是持续在线监控，也不能从无记录时段推算精确在线率。

## 故障分层与最小检查

`foundry_stopped`：由准备命令按身份条件启动。`backend_unavailable`：检查所选 MCP 后台。`gm_bridge_missing`：准备对应专用 GM 页面。`identity_mismatch` / `service_conflict`：停止依赖操作，检查正确目标，不换实例完成同一请求。`read_failed`：保留原失败，定位具体返回。

代表接受包括正式世界与既有角色读取、现有服务复用、临时断开后的恢复、显式停止保持、客户端重载与日志读回。Next见 [Next阶段记录](../reviews/2026-10-26-foundry-mcp-readiness-implementation.md)，Mirror见 [Mirror接续记录](../reviews/2026-10-26-foundry-mcp-mirror-acceptance.md)。启动最多等待90秒；超时仍保留进程和日志，先核对同一进程是否继续初始化，不重复启动。

```powershell
bun run test:foundry-mcp-readiness
bun run test:foundry-mcp-recovery
```

恢复单元测试可通过显式 `FVTT_MCP_UPSTREAM_MAIN=<已安装 main.js 绝对路径>` 增加精确上游类的离线契约检查；只读源码，网络、计时器和设置使用内存替身。它不代替真实 GM 页面和原生 MCP 验收。
