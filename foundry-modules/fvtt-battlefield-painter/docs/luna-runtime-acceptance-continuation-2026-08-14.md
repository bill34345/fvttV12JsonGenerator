# Luna Max：Battlefield Painter 实机验收续测交接

## 执行身份与目标

- 执行者必须是 Luna Max，由 Luna 直接完成，不得再委派子任务。
- 目标是继续现有 Battlefield Painter 实机验收，不创建新 worktree，不重做已经有可靠证据且状态未漂移的工作。
- 只有完整机械门禁和真实双客户端 Foundry 语义验收都通过，才能给出 `PASS` 或 `PASS WITH RELEASE GATE`。
- 不改变 module ID、flags schema、文档所有权规则或公开 API。Alpha 的 `setDevelopmentPhase` 保留；关闭可变阶段控制属于后续正式发布门禁。

## 固定工作位置

- Worktree：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260814-092014-battlefield-painter-runtime-acceptance`
- 分支：`codex/20260814-092014-battlefield-painter-runtime-acceptance`
- 基线提交：`92346b31d26b8d48b8c864a0d23b3908ef020068`
- 目标远端：`origin/codex/20260813-095900-battlefield-painter-p0`
- 现有报告：`foundry-modules/fvtt-battlefield-painter/docs/runtime-acceptance-2026-08-14.md`
- 现有证据：`F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\`

原始计划中“创建 sibling worktree”的步骤已经完成。Luna 只重新核对基线与隔离状态，不得再创建另一个 worktree。

## 必须保留的既有状态

开始前读取完整现有报告、分支 `docs/acceptance-checklist.md`、本交接文件、模块局部 `AGENTS.md` 和 Foundry Ops 局部规则。

当前已知未提交内容为：

- `test/brush-engine.test.ts`：既有严格类型修复。
- `test/p2-media-cluster.test.ts`：既有严格类型修复。
- `docs/runtime-acceptance-2026-08-14.md`：既有验收报告。
- `docs/luna-runtime-acceptance-continuation-2026-08-14.md`：本地 Luna 交接文件。

先用 diff 证明以上内容与报告描述一致。不得回退、覆盖、暂存或清理。若新 thread 发现额外改动、不同 HEAD 或无法解释的证据漂移，停止并向用户报告。

现有报告及证据已经记录：

- `BP-STATIC-001`：首轮 root strict compiler 失败及两处测试类型修复。
- `BP-STATIC-002`：完整测试通过后，仓库全局 production coverage 仍低于既定阈值。
- `BP-E2E-000`：正式 launcher 等待窗口不足的失败日志和同一固定 Lab 的成功启动证据。
- 模块测试、coverage、typecheck、build、安装、安装验证和模块 hash。
- 上轮有效结论为 `BLOCKED`，原因是无法建立独立 Chrome GM 客户端；尚未证明 Battlefield Painter runtime 缺陷。

不得覆盖这些文件或把旧证据冒充本轮重新执行。新证据使用新的 Case ID 或带续测时间的文件名，并在现有报告中追加续测过程和最终结论，保留原有失败时间线。

## 续测起点

1. 重新执行只读身份核对：Git HEAD、远端 HEAD、worktree diff、证据文件、端口、PID、命令行、HTTP、安装目录、模块 ID/version/hash。
2. 如果源码、测试修复、构建和安装 hash 与报告完全一致，可复用既有首轮机械证据；若发生漂移，重新执行受影响的机械门禁。
3. 无论是否发生修复，完整 runtime 矩阵结束后仍须执行原计划规定的最终机械门禁。
4. 交接编写时的只读快照显示 `30001` 由固定 Foundry `14.364`、`server-mirror`、`cor-cotn` 进程监听，但该状态可能在新 thread 前变化。Luna 必须重新核对，不能依赖旧 PID。
5. 若现有监听者身份完全匹配、HTTP 健康且所有权可证明，可继续使用，不得再启动第二个进程。若端口空闲，使用正式 launcher。若进程属于其他参与者或所有权无法证明，停止协调，不得擅自终止。
6. 若最终正式 stop 无法识别或控制现有进程，不得盲目 kill 或伪造 PID 状态；冻结错误和进程证据后暂停请求用户决定。

## 双客户端和登录规则

- Chrome 只能作为独立 GM 客户端。
- Codex 内置 Browser 只能作为独立非 GM 玩家客户端。
- 两者必须使用独立浏览器绑定和不同 Foundry 用户身份；不得以同一身份标签页代替。
- 本地 `server-mirror` 所有测试账号采用空密码约定：选择目标账号，密码留空，只提交一次。
- 空密码若被拒绝，立即停止重试并报告 URL、dataPath、世界、账号和可见错误；不得搜索密码、Cookie、浏览器 profile、local storage、LevelDB 或历史会话。
- Chrome 连接失败时，按 `chrome:control-chrome` 技能做一次连接排障。仍不可用时，暂停并请用户在 `Settings → Computer use` 启用 Chrome 扩展；等待用户处理，不得用内置 Browser 或 Edge 替代 GM 客户端。
- 等待用户期间不得持续轮询。若不能在本段 30 分钟边界内继续，保存证据和报告检查点，并安全暂停。

## 执行顺序

建立双客户端后，从现有报告的 `Required continuation gate` 继续：

1. 记录启用 Battlefield Painter 前的世界模块集合。
2. 只启用 Battlefield Painter，完成 init、ready、Scene load、切换和 canvas teardown 检查。
3. 创建统一 `BP-ACCEPT-<时间>-` 前缀的 Square、Hex Rows、Hex Columns、Actor、玩家 Token 和外部对照文档。
4. 逐条执行 checklist，不抽样；每条保留唯一 Case ID、文档证据和用户可见证据。
5. 先完成权限和 Square 基础硬门禁，再执行两个 Hex、四种阶段组合、媒体、聚类、25/100/300 单元、清理、持久化和故障回滚。
6. 每段连续自动运行不超过 30 分钟；段末保存证据、更新报告并确认服务器健康。
7. 首次失败先冻结证据。只允许修复模块内部且不改变公共契约的缺陷；修复后按原计划重新构建、安装和回归。
8. 完成后执行最终机械门禁和最终双客户端语义复验。
9. 通过 Foundry UI 禁用模块，删除精确前缀的临时对象，恢复测试前模块集合，保留安装目录但保持禁用，并正式停止任务拥有的 Lab。
10. 不 commit、merge、push，不删除 worktree，不创建备份，不编辑 LevelDB，不触碰生产 `8080` 或 `51020`。

## 原始验收计划逐字正文

以下正文必须原样保留，不得改写；续测前言仅解释已经完成的初始化步骤和现有检查点。

Battlefield Painter 分支 1-to-1 Foundry 实机验收计划

目标与完成标准

在独立 worktree 中，以远端分支 codex/20260813-095900-battlefield-painter-p0 的确定提交为基线，在本机 server-mirror 上完成与分支 docs/acceptance-checklist.md 逐项对应的真实 Foundry 验收。

执行者使用 Luna Max，不再委派子任务。验收目标锁定为：

Foundry 14.364

dnd5e 5.3.3

Lab：F:\FoundryLab\foundry-v14\data\server-mirror

世界：cor-cotn

端口：30001

模块：fvtt-battlefield-painter 0.3.0-alpha.1

双客户端硬门禁：独立 GM 客户端与非 GM 玩家客户端

测试失败时先保存失败证据；若属于模块内部、无需改变公共契约的缺陷，则在 worktree 中最小修复并重测

不修改 master，不直接修改目标远端分支，不自动 commit、merge 或 push

不创建任何备份，不直接编辑 LevelDB，不触碰生产 8080 或 51020


只有机械检查和真实 Foundry 语义验收都达到要求，才能声明“Alpha 实机验收通过”。性能项目若分支没有定义数值 SLA，只能报告实测数据与可用性结论，不能虚构阈值。

1. 基线、隔离与静态门禁

1. 在主工作区重新执行只读核对：

git status --short --branch

git worktree list --porcelain

git fetch --all --prune

确认 origin/codex/20260813-095900-battlefield-painter-p0 的 HEAD；当前已知值为 92346b31d26b8d48b8c864a0d23b3908ef020068，执行时必须重新记录实际值。

确认主工作区未提交内容不与测试任务冲突；禁止自动 stash、提交或清除用户文件。

确认端口 30001 无监听者、server-mirror 未运行，模块目标目录当前不存在。若状态已变化，先记录并核对所有权。



2. 从远端目标提交创建 sibling worktree：

分支名：codex/<执行时间>-battlefield-painter-runtime-acceptance

基点：目标远端分支的已记录 HEAD

所有测试修复、测试代码和验收报告只进入该 worktree。



3. 在 worktree 中安装锁定依赖并执行首轮机械检查：

bun install --frozen-lockfile

模块目录执行 bun run test:coverage

bun run typecheck

bun run build

根目录执行 bun run agents:check

根目录执行 bun run typecheck:foundry-modules

git diff --check

4. 记录首轮结果、构建产物 SHA-256、Git HEAD 和工作区状态。静态检查失败必须先分类：

模块自身缺陷：进入修复循环。

环境或依赖问题：记录为 BLOCKED，不得伪装成代码失败。

即使全部绿色，也只能进入实机测试，不能据此判定功能通过。




2. 安装、启动与双客户端准备

1. 从模块目录使用正式安装器：

先执行 bun run install:local，检查 dry-run 的 Lab 根、目标目录和构建结果。

再执行 bun run install:local -- --apply。

执行 bun run verify-install。

核对安装目录、模块 ID、版本以及构建目录与安装目录的 SHA-256；记录 runtimeVerified:false 仅表示尚未完成运行时验收。



2. 使用正式 Lab 入口启动：

bun run foundry:lab launch server-mirror

核对实际进程、可执行文件、dataPath、世界、端口、监听地址和 HTTP 响应。

必须确认是 Foundry 14.364、dnd5e 5.3.3、世界 cor-cotn、端口 30001。

保存本次启动后新增的 server log 区段，不复制世界或数据库作为备份。



3. 建立两个真正独立的浏览器会话：

Chrome：GM 客户端，负责模块启用、画笔操作、场景配置和审计。

Codex 内置 Browser：非 GM 玩家客户端，负责权限、移动、碰撞、视觉和音频体验。

不读取、导出或保存密码、Cookie、浏览器 profile。

如任一角色需要登录，由用户在对应窗口手动登录；不得以两个同身份标签页替代双客户端。

玩家客户端不可获得 GM 权限。无法建立独立玩家会话时，完整验收状态必须是 BLOCKED/PARTIAL。



4. 记录启用模块前的世界模块列表，然后只启用 Battlefield Painter。验证初始化、ready、场景切换和 canvas teardown 期间：

无模块报错或未处理异常。

Tiles 控件只对 GM 出现。

非 GM 只能获得诊断能力；任何绘制、清除、阶段切换或文档变更入口都必须缺失或明确拒绝。

面板为 ApplicationV2，六个预览、中文标签和控件状态均真实显示。




3. 逐项实机测试矩阵

所有临时场景、Actor、Token 和对照文档使用统一前缀 BP-ACCEPT-<时间>-，只能通过 Foundry UI 或公开 Document API 创建，不直接操作 LevelDB。至少建立：

Square 场景

Hex Rows 场景

Hex Columns 场景

一个可由玩家控制、能够进行实际移动的 Token

模块不拥有的外部 Tile、Region、AmbientLight、AmbientSound 和 Wall，用于“不误删外部文档”测试


每一条 docs/acceptance-checklist.md 都建立唯一 Case ID，结果只能为 PASS、FAIL、PARTIAL 或 BLOCKED，不得抽样代替整项验收。

测试组	必须完成的真实验收

P0 基础能力	三种地形及两个阶段；静态 WebP；每笔一个 Region；火焰灯光；仅成熟荆棘生成外墙；擦除中间单元后正确重建；阶段切换完整替换 bundle；停用模块后控制项消失且外部文档不受影响。
P1 画笔能力	free、line、fill；半径 0–4；光标预览跟随与消失；重复单元跳过；双向直线与 Foundry 路径一致；fill 四个端点方向与预览一致；每场景 undo/redo，至少覆盖绘制、擦除和阶段切换；新操作清空 redo；历史上限 20；外部文档始终不变。
Square 语义	Tile 与方格精确对齐、透明边缘无明显接缝；玩家实际移动经过每个 Region 时成本为 ×2；火焰阶段灯光和 torch 行为正确；仅第二阶段荆棘阻挡移动，且不错误阻挡视野、光线和声音。
Hex 语义	在 Hex Rows 和 Hex Columns 上分别测试三种地形；Tile 对齐；Region 为六顶点；荆棘共享边不生成重复 Wall；擦除和阶段切换后 offset 重建一致；重复 radius、line、fill、preview、undo/redo 核心测试。
P2 媒体能力	六个透明 VP9 WebM 和三个 OGG 均真实加载；动画不仅请求成功，而且画面确实运动；声音确实播放并具有预期空间变化；阶段专属 ambience、墙体衰减和火焰灯光均由玩家客户端确认。
P2 聚类能力	P0、P0+P1、P0+P2、P0+P1+P2 四种开发阶段组合分别验证；每个集群不超过 16 个单元；相同输入重建结果稳定；P0+P2 不出现 P1 控件；完整组合同时具备画笔、历史、动态媒体、声音和聚类灯光。
大面积操作	对 25、100、300 个连续单元分别记录执行耗时、生成文档数量、集群组成、console/server 错误和肉眼交互状态；操作完成后必须仍可继续点击控件、平移缩放和移动 Token。无既定 SLA 时报告测量值，不编造毫秒级通过线。
清理预览	清理预览只统计模块所有文档；ID fingerprint 一致时允许清理，过期 fingerprint 必须阻止；clear 本身可 undo；clear、undo、redo 和 reload 后外部文档都存活。
持久化和恢复	刷新两个客户端并重新进入场景，确认 flags、擦除和阶段切换仍有效；auditScene 计数与实际 Foundry 文档逐类一致；停用再启用模块不破坏既有或外部文档。
故障回滚	使用仓库已有的无效 Region 行为 fixture 验证 Tile 回滚；不得在共享 Lab 中持久篡改 CONFIG 或制造不可控故障。若需要运行时验证，只允许在任务临时场景中进行可恢复、会话级注入，并在同一 case 结束时恢复。
Alpha 阶段开关	通过当前 Alpha 暴露的 setDevelopmentPhase 切换组合；P1 关闭时只能 free、半径 0、无历史；重新启用后功能恢复。Alpha 版存在该 setter 不算缺陷；将 DEVELOPMENT_PHASE_CONTROLS_MUTABLE=false 并移除 setter 属于后续正式发布门禁，本轮不擅自执行。


双客户端的关键硬门禁：

GM 绘制后，由玩家实际拖动或执行移动，不以 GM 端文档字段代替移动成本和碰撞体验。

玩家确认火焰动画、灯光、环境声、荆棘碰撞及声学表现。

玩家尝试访问模块 API 或控件时，不得成功创建、更新或删除任何画笔文档。

每个关键行为同时保留文档层证据和用户可见行为证据。


单次连续自动运行不得超过 30 分钟。长矩阵应分段执行，每段结束保存证据并确认服务器仍健康；四小时 soak 不在本轮范围内。

4. 缺陷记录、修复和回归循环

1. 首次失败必须先冻结证据，再修改代码。每个缺陷建立 BP-E2E-001 形式的记录，包含：

Git HEAD、模块构建 SHA、Foundry/dnd5e 版本。

阶段组合、网格类型、客户端角色和精确触发步骤。

预期行为、实际行为、Foundry 文档数量与关键字段差异。

浏览器截图或短录屏、console/network 证据、server log 区段。

是否可稳定复现，以及是否影响相邻功能。



2. 仅自动修复以下范围：

Battlefield Painter 模块自身代码、媒体引用、测试和模块文档。

保持现有 module ID、flags schema、文档所有权规则和公开 API 契约。

每个 parser/geometry/生成类缺陷增加最小、可复现的回归 fixture 或测试。

不修改 Foundry、dnd5e、其他模块、现有世界内容或生产环境。



3. 若修复必须改变持久化 schema、公开 API、模块 ID、世界数据迁移规则或其他模块，则停止自动修复，将其记录为需要 Sol/用户决策的范围扩张。


4. 每次修复后执行：

对应 focused test。

bun run test:coverage

bun run typecheck

bun run build

git diff --check



5. 重新安装前：

使用正式命令停止 server-mirror，确认 PID 消失且 30001 不再监听。

确认安装目标确为本任务创建，模块 ID、版本及当前 hash 与记录一致。

删除精确安装目录时只使用 Remove-Item -LiteralPath <精确目录> -Recurse，绝不使用 -Force。

如果删除因权限、只读或占用失败，立即停止并报告精确对象，不改用其他强制删除方式。

重新执行安装器、hash 验证和正式启动流程。



6. 回归顺序：

重跑原始失败 case。

重跑同地形、同网格或同生命周期的相邻 case。

重跑外部文档保护、双客户端权限和 reload 持久化。

所有缺陷关闭后，再完整执行一次模块验收矩阵。

同一外部环境阻塞在一次针对性处理后仍复现，则标记 BLOCKED，停止无界重复。




若只在 cor-cotn 出现问题，可在现有 fvtt-v14-module-matrix 世界做隔离诊断，但隔离世界通过不能替代 cor-cotn 的正式结论，也不得自动修复其他模块。

5. 报告、最终门禁与 Lab 收尾

1. 原始证据写入：

F:\FoundryLab\foundry-v14\evidence\battlefield-painter\<日期>-<短HEAD>\

仅保存日志片段、截图/录屏、测试结果、文档字段抽样、时间数据和 hash 清单；不得复制世界、数据库或模块目录作为备份。


2. 在 worktree 中生成：

foundry-modules/fvtt-battlefield-painter/docs/runtime-acceptance-2026-08-14.md

报告必须逐项映射分支 acceptance checklist，并分别给出：

机械验证结果。

GM 与玩家端真实语义验收。

修复前失败和修复后重测证据。

Square、Hex Rows、Hex Columns 结果。

四种开发阶段组合结果。

25/100/300 单元测量数据。

未测试、部分通过、被阻塞和正式发布前仍需完成的事项。



3. 完成所有修复后执行最终机械门禁：

模块完整测试、coverage、typecheck、build。

根目录 bun run agents:generate。

根目录 bun run agents:check。

根目录 bun run ci:verify。

git diff --check。

检查没有意外 tracked/untracked 文件、凭据、Cookie、用户数据或 Lab 文件进入 worktree。



4. 最终语义复验必须再次覆盖：

两个独立客户端刷新后无模块 console 错误。

玩家真实移动成本和成熟荆棘碰撞。

动画、灯光与声音。

erase/stage/undo/redo/reload。

foreign documents 生存。

清理预览 fingerprint 和可撤销性。



5. 按用户选择“保留但禁用”收尾：

通过 Foundry UI 禁用 Battlefield Painter。

删除所有 BP-ACCEPT- 临时 Scene、Actor、Token 及其模块拥有文档；删除前确认前缀和所有权。

核对世界启用模块集合恢复到测试前状态。

保留最终测试通过的模块安装目录，记录最终安装 hash，但保持禁用。

使用 bun run foundry:lab stop server-mirror 停止 Lab，确认 PID 消失、端口 30001 无监听。

不删除 worktree，不 commit、merge 或 push；将完整 diff、测试结果和剩余风险交给 Sol/用户决定后续集成。




最终结论只能采用以下之一：

PASS — Alpha 实机验收通过：机械门禁、完整 checklist、双客户端语义验收全部通过。

PASS WITH RELEASE GATE：Alpha 功能通过，但正式发布仍需关闭可变开发阶段控制等明确发布动作。

PARTIAL：完成了部分矩阵，但有未执行项目，不得称完整通过。

BLOCKED：独立玩家登录、环境或其他外部条件阻止硬门禁。

FAIL：仍存在可复现的模块缺陷，报告必须列出最小修复范围。
