# FVTT 跑团会话监测器

这是一个面向 Foundry VTT 14.364 / dnd5e 5.3.3 的轻量排障工具。它把
浏览器内的会话指标和浏览器外的 Chrome/Windows 进程指标分开记录，再在
结束时合并成一条时间线。

它只观察，不清缓存、不改设置、不删除文档，也不写 Foundry LevelDB。
v1 只在 GM 客户端运行。

本目录是一个完整 release unit，而不是只有 Foundry bundle：

- `src/`：Foundry browser module、版本化 schema、IndexedDB 与 GM UI；
- `companion/`：Chrome/CDP、Windows process、CLI、报告与端到端测试；
- `build.ts`：确定性 module 构建及项目本地 mirror 安装保护；
- `package.json`：产品版本、独立 typecheck/build/test/monitor 入口。

module 与 companion 共同维护 schema v1 和产品版本 1.1.1。它们可以共享本产品的 schema，
但不得分别成为两个漂移的发布物。唯一的上游运行时依赖是
`@fvtt-json-generator/contracts/hash` 提供的 browser-safe SHA-256；Foundry runtime 不导入
companion，companion 也不导入 generator、workflow、Web 或运维实现。

## 独立构建与测试

在主 workspace 安装锁定依赖后，可直接从本目录运行：

```powershell
bun run typecheck
bun test
bun run build
```

构建产物位于：

```text
foundry-modules/session-monitor/dist/module
foundry-modules/session-monitor/dist/fvtt-session-monitor.zip
```

## 安装

```powershell
bun run install:session-monitor
```

安装目标固定为：

```text
.local/foundry-v14/data/server-mirror/Data/modules/fvtt-session-monitor
```

随后在目标世界的“管理模组”中启用
`FVTT Session Monitor / 跑团会话监测器`。MIDI-QOL 14.0.11 与
Sequencer 4.2.3 是可选的推荐依赖；未启用时只会留下对应
`capability-gap`，不会让会话失败。

## 权限与配置边界

- 根命令只会把 module 安装到项目内的 `server-mirror`；生产部署仍需单独授权，
  不会因运行 build、test 或 install 命令而发生。
- companion 只启动并管理自己创建的专用 Chrome，不接管用户日常 Chrome；
  它通过 CDP 和 Windows 进程接口读取性能信号，不读取 cookie、密码或浏览器凭据。
- 专用 profile 与证据默认写入 workspace 的 `.local/`，不会写入 Foundry
  LevelDB。可用 `--url`、`--chrome`、`--profile` 和 `--output-root` 显式覆盖。
- 根 workspace wrapper 会传入内部的 `--workspace-root`，用于定位本地 mirror 和
  默认 `.local/` 目录；从本 package 直接运行时也可显式传入该参数。
- companion 必须在普通 GM 登录后才能开始握手。它不会猜测、提取或绕过 GM
  密码；处于 join 页时只等待人工正常登录。

## 一次真实记录

先启动项目本地 Foundry，再运行：

```powershell
bun run monitor:session -- record
```

伴随程序会启动一个专用 Chrome profile，并等待已登录的 GM 世界。第一次
使用该 profile 时，在新开的 Chrome 中选择 GM 并正常登录即可。登录后它会：

- 调用模块 API 开始或续接一个会话；
- 每 10 秒写一条 Chrome CDP/Windows 进程采样；
- 每 60 秒扫描 renderer 的固定 WASM private committed allocation；
- CDP 断开时留下 gap，并持续尝试重连；
- 整个 Chrome 被关闭后，用同一 profile 自动启动下一代 Chrome；
- 若 Foundry 要求重新登录，会停在登录页等待你正常登录，然后核对并续接
  同一个 session ID；
- 收到 `Ctrl+C` 后停止会话、生成报告并关闭自己启动的 Chrome。

默认输出目录：

```text
.local/foundry-v14/evidence/cor-cotn-performance/live-sessions/<session-id>/
```

主要文件：

- `browser-session.json`：Foundry 模块导出；
- `companion.jsonl`：伴随程序原始采样；
- `companion-errors.jsonl`：隐私过滤后的 CDP 错误；
- `companion-events.jsonl`：Chrome/renderer 代际与重启边界；
- `session-combined.json`：合并后的完整证据；
- `report.md`：人类可读摘要；
- `heap-timeline.svg`：JS heap 时间线。

若端口或 Chrome 路径不同：

```powershell
bun run monitor:session -- record `
  --url http://127.0.0.1:30001/game `
  --chrome "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

也可以从既有导出重新生成报告：

```powershell
bun run monitor:session -- report `
  --browser <browser-session.json> `
  --companion <companion.jsonl> `
  --events <companion-events.jsonl> `
  --out <report-directory>
```

## GM 面板

- “开始”：建立 IndexedDB 会话并立即采样；
- “刚才卡顿”：写入无自由文本的时间标记；
- “停止并导出”：停止采样并下载 JSON；
- 刷新页面：自动续接同一 world 中最后一个 active session。

单次会话最多 12 小时、4,320 个浏览器采样、10,000 个事件和 1,000 个
错误。达到上限会标记 `truncated` 并安全停止。

## 隐私与解释边界

导出不包含聊天文本、骰值、Actor/Item 文本、玩家输入、cookie、密码、
令牌、IP、原始 Scene/Combat ID 或任意对象 dump。错误消息默认写成
`<message-redacted>`，只保留错误类型、过滤后的栈位置、包 ID 和指纹。

Scene/Combat 使用单会话别名。活动模组清单只记录模组 ID 和版本，并保存
配置哈希。

报告中的 JS heap、renderer private bytes、working set、GPU/utility 进程、
texture 估值、DOM 数量和固定 Worker allocation 是不同信号。工具只负责
相关性对齐，不把相关性写成因果结论。

完整关闭专用 Chrome 不会结束模块中的 active session。伴随程序会自动
重启 Chrome，并把新进程记为下一代 `browserGeneration`；renderer PID
变化则只记为递增的 `rendererGeneration`，不会把原始系统 PID 写入报告。
Markdown 报告会列出每次冷重启前后的 page heap、renderer private bytes
及差值，SVG 时间线会显示冷重启竖线。

因此，遇到卡顿时可以直接关闭这个专用 Chrome 窗口；不要同时按
`Ctrl+C`，也不要先点面板里的“停止并导出”，因为这两种操作代表你明确要
结束本次记录。若自动重启后出现登录页，只需照常登录；伴随程序会继续等待，
并且只有恢复到原来的 active session ID 后才会继续采样。

## 验证

```powershell
bun run test:session-monitor
bun run typecheck:production
bun run typecheck:all
bun run build:session-monitor
```

生产部署已于 2026-07-30 获得单独授权：部署时通过普通 Foundry 模组管理
为线上 `cor-cotn` 启用了 `fvtt-session-monitor`。首次 1.1.0 线上点击
“开始”暴露公网 HTTP 缺少 `crypto.subtle`；1.1.1 已改用项目既有的
浏览器安全纯 JavaScript SHA-256，并通过 13/13 聚焦测试与远端制品校验。

2026-07-31 的 8080 只读复核再次确认：当前监听进程仍使用
`E:\Bill\fvtt_v13\data`，该 DataPath 下存在完整 1.1.1 五文件制品，五个
模块资源经 8080 回环均返回 HTTP 200，公网 8080 的 manifest 也返回
`fvtt-session-monitor` 1.1.1。本次没有登录 GM 客户端或读取运行中的世界
LevelDB，因此只重新证明“当前已部署并由 8080 提供”，没有把历史启用事件
冒充为当前实时 `active` 证明。

最终 1.1.1 的“开始 → 刚才卡顿 → 停止并导出”短烟雾测试仍需在服务器重启
后由 GM 正常加入再完成；实际四小时跑团和非 GM 设备证据也仍未完成，不能
由安装、HTTP 200 或短烟雾测试替代。

超过 30 分钟的持续 Chrome/Foundry 监测不由代理启动、等待或代跑。四小时
验收由用户在真实跑团时亲自开始并实时观察；代理只负责事前检查命令、存储和
隐私边界，并在跑团结束后读取导出证据、生成报告和解释结果。多个短测试也不能
拼接成一次四小时验收。
