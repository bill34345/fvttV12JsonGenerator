# FVTT 远程运维交接（新 thread 入口）

最后实时核对：2026-07-29 00:57（Asia/Shanghai）
文档补录：2026-07-29；已完成 8080 生产迁移并重新实时核对
适用项目：`I:\OpenCode\fvttV12JsonGenerator`

这份文件是本项目处理远程 Foundry VTT 时的首要入口。新 thread 应先阅读本文件，再按链接进入详细报告。这里记录连接路由、实例边界、已完成维护、当前残留问题和安全规则；不保存密码、私钥或浏览器会话。

## 1. 两个远程实例不要混淆

| 用途 | 入口 | 代码路径 | Data 路径 | 默认权限边界 |
|---|---|---|---|---|
| 用户自己的生产实例 | `http://49.232.12.153:8080` | `E:\Bill\v14` | `E:\Bill\fvtt_v13\data` | 只有用户明确要求时才修改；任何生产写操作都先盘点、备份、验证 |
| 朋友的共享实例 | `http://49.232.12.153:51020` | `E:\CARROT\FVTTV14` | `E:\CARROT\FVTTV14\data` | 默认只读；不得因同机部署而自行修改、停止服务或复制付费模块 |

8080 的目录名仍含 `fvtt_v13`，但它当前运行的是 **Foundry v14**。不能从 Data 路径名称推断运行版本。

最近实时监听快照：

- 8080：2026-07-29 00:57 的 Node PID 为 `8692`，命令行为
  `E:\Bill\v14\code\main.js --port=8080 --dataPath="E:\Bill\fvtt_v13\data" --world=cor-cotn`，
  HTTP 200。
- 51020：Node PID `9480`，命令行为 `E:\CARROT\FVTTV14\code\main.js --port=51020 --dataPath="E:\CARROT\FVTTV14\data"`。
- PID 只是快照，重启后一定会变化。后续不得依据本文记录的 PID 直接结束进程，必须重新查询监听端口和完整命令行。

## 2. SSH 和登录信息

- 本机 SSH 别名：`fvtt-production`。
- 当前别名指向：`Administrator@49.232.12.153`。
- 基本入口：`ssh fvtt-production`。
- 远端默认 shell 是 `cmd.exe`。复杂只读 PowerShell 命令应通过 `powershell -NoProfile -EncodedCommand <Base64>` 执行，避免中文路径和嵌套引号损坏。
- SSH 私钥仅存在本机 SSH 配置中。**不要把私钥路径、私钥内容、Foundry 密码或临时会话 Cookie 写入项目。**
- 8080 的 GM 用户名曾使用 `gamemaster`；密码故意不记录，新 thread 如需登录应向用户索取或使用已有授权会话。
- 8080 的非 GM 验证曾使用 `SY`，当时无密码；账号状态可能变化，不能把旧验证视为永久授权。
- 51020 曾在用户明确授权的只读审计中使用“助手”账号。未来浏览或登录该实例仍应以用户当前请求为准。

## 3. 8080 当前运行基线

- Foundry VTT：`14.364`
- dnd5e：`5.3.3`
- 世界 ID：`cor-cotn`
- Node：`24.17.0`
- 启动器：`E:\Bill\v14\fvtt-8080-start-v14.cmd`
- stdout：`E:\Bill\fvtt_v13\scratch\foundry-8080-v14.stdout.log`
- stderr：`E:\Bill\fvtt_v13\scratch\foundry-8080-v14.stderr.log`
- 本地审计过的启动器副本：[fvtt-8080-start-v14.cmd](scripts/fvtt-8080-start-v14.cmd)

Foundry 曾提示 `14.365` 可用，但本文所有模块和世界验收基于 `14.364`。不要自动升级核心版本；升级应作为独立维护任务重新验证。

## 4. 已完成并验证的维护

详细证据、备份、回滚步骤见 [2026-07-22-fvtt-8080-maintenance-report.md](2026-07-22-fvtt-8080-maintenance-report.md)。该报告包含后续实际执行结果，在冲突处优先于最初的维护计划。

已完成事项：

- Aura Effects `2.1.1` 已安装并启用。
- Foundry CHN 已从 `14.362` 同步到 `14.364`，保持启用。
- Filepicker Plus 已在用户确认共同购买并明确授权后，从 51020 的模块目录同步到 8080：`4.0` → `6.0.1`；目前已安装但未启用。
- Polyglot `2.9.2` 和 Swipe VTT `2.3.0` 已关闭但保留文件。
- Socketlib 等库模块没有批量关闭。
- Calendaria `1.2.0` 与必需依赖 3DS:ATLAS `1.0` 已启用；此前 39 个 `calendaria.calendarnote` 页面全部恢复加载。
- 3DS:ATLAS 是共享工具/界面库，不是 3D 渲染模块。Calendaria 的天气、电影式跳时、场景黑暗同步、环境音和 FXMaster 等高负载选项保持关闭。
- 所有 85 个已放置、原为 Secret 的非玩家 Token 已改成 Neutral；原本明确 Friendly/Hostile 的 Token 未动。
- `core.prototypeTokenOverrides` 已确认将 NPC 原型 Token 默认为 Neutral；以后从 NPC Actor 拖入场景的 Token 也会保持 Neutral。
- Hide NPC Names `1.3.4` 保持启用；非 GM 玩家看到中立 NPC 时仍显示“未知生物”，并已实测可以按 `T` 选为目标。
- Foundry A/V 世界设置已是 `core.rtcWorldSettings.mode = 0`，不需要逐个玩家注入代码关闭。
- Dice So Nice 已将 `persistentDice` 与 `allowInteractivity` 从 `true` 改为 `false`，短测后没有骰子队列或持久骰子残留。
- 51020 在维护过程中未停止、未写入；它只作为经授权的模块来源使用过一次。

### 2026-07-22 磁盘版本复核

| 模块 ID | 已安装版本 | 最近确认的世界状态 |
|---|---:|---|
| `auraeffects` | 2.1.1 | 启用 |
| `foundry_chn` | 14.364 | 启用 |
| `filepicker-plus` | 6.0.1 | 未启用 |
| `calendaria` | 1.2.0 | 启用 |
| `3ds-atlas` | 1.0 | 启用 |
| `polyglot` | 2.9.2 | 未启用 |
| `swipe-vtt` | 2.3.0 | 未启用 |
| `socketlib` | v1.1.4 | 启用/保留 |
| `dice-so-nice` | 6.2.9 | 启用 |
| `hide-npc-names` | 1.3.4 | 启用 |

“已安装版本”是 2026-07-22 对服务器模块清单的实时只读复核；“世界状态”来自最近一次 GM/玩家运行时验收。新 thread 若要修改模块，仍应先重新读取当前状态。

## 5. 备份与本地脚本

现有服务器备份：

- 主维护前一致性备份：`E:\Bill\fvtt_v13\backups\codex-20260722-091339-8080-maintenance`
- Foundry CHN / Filepicker Plus 升级前备份：`E:\Bill\fvtt_v13\backups\codex-20260722-100645-module-upgrade`
- Calendaria / 3DS:ATLAS 启用前备份：`E:\Bill\fvtt_v13\backups\codex-20260722-103047-calendaria-enable`

已审计的本地运维脚本：

- [fvtt-8080-backup-install-aura.ps1](scripts/fvtt-8080-backup-install-aura.ps1)
- [fvtt-8080-backup-install-calendaria-dependency.ps1](scripts/fvtt-8080-backup-install-calendaria-dependency.ps1)
- [fvtt-8080-sync-friend-modules.ps1](scripts/fvtt-8080-sync-friend-modules.ps1)
- [fvtt-8080-start-v14.cmd](scripts/fvtt-8080-start-v14.cmd)

这些脚本和备份路径是历史恢复资料，不代表允许无条件重复执行。每次生产变更仍需根据用户当前请求确认授权范围。

## 6. 当前仍存在的初始化问题

截至 2026-07-22 的完整非 GM 初始化捕获和 GM 交叉检查显示：Calendaria、3DS:ATLAS、Sequencer 和 SimplePeer 没有再次出现初始化错误，但 8080 尚不能称为“零错误初始化”。

### 2026-07-23：Sequencer 持久模板指向空 Region（已清理并加预防补丁）

快速检索词：`get_object_position`、`firstShape.type`、`Cannot read properties of undefined (reading 'type')`、`shapes: []`、`PersistentCanvasEffect`、`纠缠术 entangle`。

- 症状：世界初始化和画布 ticker 中，Sequencer 4.2.3 在 `get_object_position()` / `get_object_dimensions()` 读取 `Region.shapes[0].type` 时抛错。
- 本次坏链路：AutoAnimations 的持久模板特效仍指向 Region，但来源 Token 已被删除；残留 Region 的 `shapes` 已变成空数组。AutoAnimations 只设置了 `origin`，没有用 `tieToDocuments(sourceToken)` 把持久特效绑定到来源 Token 的删除生命周期。
- 本次对象：持久特效 `nTvgmcIuaiDUpgda`，Region `Scene.qg3gE9wfV6vhaWV8.Region.S2yVKIWddmRkS4O5`，来源 Token `CgfBgYsfEsb6XbPF`。这些 ID 只用于历史审计；处理新故障时必须重新从堆栈和运行时对象定位，不能照抄。
- 安全清理：先通过 `Sequencer.EffectManager.endEffects({ effects: ["<effect-id>"] })` 结束坏特效，再通过 `fromUuid("<region-uuid>")` 取得 Region 并调用文档的 `delete()`；不要编辑 live LevelDB。
- 预防补丁：线上 AutoAnimations 7.0.17 的持久模板两条分支（圆/矩形、锥/线）在 `persist(true)` 前增加 `if (sourceToken) templateSeq.tieToDocuments(sourceToken);`。这样来源 Token 删除时，Sequencer 会同步结束持久特效。
- 验证：补丁前，真实 7.0.17 bundle 的回归测试稳定失败；补丁后矩形与锥形模板共 `2 passed / 0 failed`，`node --check` 通过，线上脚本 SHA-256 为 `260BDFE29792EEE9BE672B50BE36B704944792650EB8F33493D0C9E19D3760A0`。
- 注意：这是对第三方模块 bundle 的本地补丁，未来更新或重装 AutoAnimations 可能覆盖它。更新后应搜索 `tieToDocuments(sourceToken)` 并重跑回归测试。按用户当次要求，本次修复没有另做备份。
- 上游状态：截至 2026-07-23，没有在 AutoAnimations、Sequencer 或 Foundry 官方 GitHub 找到这条完整生命周期链路的同一公开 issue；有相似的无效 effect / Region shape 容错问题，但不是同一堆栈和触发条件。

### 需要修复的真实数据错误

1. 世界 Item `cSJInMIUhfxqKHpD` 初始化失败。
   - 名称：`引导神力：驱散亡灵 Turn Undead（2024 5e）`
   - 无效 Activity：`JY8hJIoaoFtwC3Nv`
   - 当前公式：`@abilities.wis.mod d8`
   - dnd5e 解析失败，因此整个 Item 被加入 `game.items.invalidDocumentIds`。
   - 修复前应先检查该 Activity 的实际设计意图，不要只凭错误文本猜测公式。

2. 场景 `tGvSIXUpenW0tZU2`（市广场（哀怒））残留两个未注册的 Terrain Mapper 行为。
   - Region `Ly0gnunJI67KE6IQ` / Behavior `qarR8w9x0MaNbO3A`
   - Region `pUIG1zAcB0kBnKeX` / Behavior `2Vc0xVW2xJyX2jGL`
   - 类型均为 `terrainmapper.setTerrain`。
   - 当前没有安装 Terrain Mapper；Foundry 会跳过两个行为，区域本体仍加载但地形功能丢失。
   - 该场景在检查时未激活，因此不会立即破坏玩家当前场景。

### 非致命警告和观察项

- Plutonium 可选后端探测 `http://49.232.12.153:8080/api/plutonium` 返回 `404`；不用后端时可关闭检测。
- MIDI-QOL 对 `otherActivityUuid` 有 4 条弃用警告；另有旧 Hook 弃用提示。
- 约 6 条掷骰公式引用 `@resources.legres.value`，但相应结果上下文没有该属性。
- `zzz_mod_chn` 使用 V1 Application 框架；v14 可运行，Foundry 计划在 v16 移除兼容。
- Spritesheet Generator 因当前入口是 HTTP 而不是 HTTPS，无法初始化安全上下文功能。
- 有单条 WebGL 读回性能警告。
- 服务端 stderr 记录两条 `Ssdp` 的 `MaxListenersExceededWarning`。目前未导致进程退出，但如果数量随游戏时长持续增加，应单独追踪其来源。
- 自动条件模块的部分黄色输出是加载状态信息，不应误判为故障。
- Dice So Nice 只完成十次连续动画的短测，尚未完成真实多小时游戏的 soak test；“玩久后越来越卡”仍需下一次实际团务观察。

### 已确认的图片 404

- `modules/dnd5e_collection_2024/assets/creatures/portraits/horse.webp`
- `modules/dnd5e_collection_2024/assets/creatures/portraits/celestial-spirit-avenger.webp`
- `modules/dnd5e_collection_2024/assets/creatures/portraits/zombie.webp`
- `modules/5e-dlc-monster/assets/srd5e/img/bestiary/tokens/MPMM/Drow House Captain.webp`
- `modules/5e-dlc-monster/assets/srd5e/img/bestiary/tokens/MPMM/Drow Shadowblade.webp`

这五条是已捕获的具体缺失资源，不保证覆盖所有尚未访问的场景和 Actor。

## 7. 生产操作硬边界

1. 默认从只读盘点开始：重新确认 8080 监听进程、完整命令行、Foundry 版本、Data 路径、世界、在线用户、模块状态和日志。
2. 不直接编辑运行中的 LevelDB；不在服务器运行时复制活动世界数据库作为一致性备份。
3. 如需重启，只处理同时匹配 `E:\Bill\v14\code\main.js`、`--port=8080` 和 `--dataPath="E:\Bill\fvtt_v13\data"` 的进程。
4. 先确认没有真实玩家在线，优先通过 GM 的正常世界关闭流程卸载世界，再停止精确进程并备份。
5. 不使用历史 PID、模糊的 `node.exe` 匹配或目录名猜测目标。
6. 发现 `.lock` 等残留时先确认没有进程占用；需要处理时移动到带时间戳的备份目录，不直接删除。
7. 51020 默认只读。过去一次复制 Foundry CHN/Filepicker Plus 的授权不扩展为未来任意复制、安装、启停或修改授权。
8. 付费模块必须由用户明确确认许可和本次复制范围；同一台服务器上存在文件不等于自动获得复制权。
9. 不自动升级 Foundry、dnd5e 或关键模块；版本变化后重新做 GM 和非 GM 初始化验收。

## 8. 2026-07-28 本地候选状态与最终迁移入口

以下 2026-07-24～28 的文字最初用于描述迁移候选。该候选已经在执行 ID
`20260728-220757+0800` 下同步到生产 8080；候选边界仍保留，作为未来核对“本次包含/
排除什么”的历史依据。实际执行结果以本节后半和带时间戳迁移报告为准。

当前需要在未来迁移中逐项评估的本地候选包括：

- 清理后的完整 `Data/worlds/cor-cotn`，包含 Actor、Journal、Scene、Token、设置和
  Map Image Optimizer 路径变更；
- `Data/modules/map-image-optimizer-bridge`；
- `Data/modules/chat-memory-guard`；
- Sequencer 4.2.3 spritesheet Worker 7→最多 2 的本地补丁；
- Simple Cover 5e `2.2.0-cor-cotn.1` 并发修复；
- Bloodsplats、AutoAnimations、Hide NPC Names 生命周期补丁；
- 世界级 `world.cor-cotn-chapter-archive`，内含红梦密会、第四章、第四点五章、
  第五章、第六章、第七章、妖精荒野七个独立原生 Adventure；
- 七章 Scene/专属 Actor 已从世界文档剥离；2026-07-28 快照中 Adventure 与世界的
  Scene/Actor ID 交集为 0；
- Monk's Combat Details 已关闭自动弹出第二 Tracker、自动选中和自动滚动，保留
  `pan-to-combatant=true`；
- TAH Core/dnd5e 保持启用；Argon Core/dnd5e 已移出本地模块扫描目录；
- Automated Animations 保持启用，客户端目标值为
  `autoanimations.killAllAnim=on`；本地 7.0.17 源码中 `off` 会禁用动画。不能以
  关闭自动动画作为生产性能迁移方案，迁移后还要实际播放一次攻击动画验收。
- 最新逐页 resident 审计已纠正旧口径：两个 Sequencer Worker 合计约 572 MiB 是
  committed，不是当前物理 RAM；两个 WASM 区域实际 resident 各约 1.15 MiB。
- 当前 Renderer PWS 主要归入 V8 cage 与两个 PartitionAlloc pool，GPU 侧仍需继续
  映射 RenderTexture 所有者；不得继续把“未知约 1.5 GiB”直接归罪于 Sequencer。

以下内容必须分开处理：

- `server-mirror` 外当前 986 张、1,707,922,202 bytes 的未使用场景图归档不能重新
  复制进生产世界；93 张 MIO 计划输出和 1 张世界背景仍需留在世界；
- 七个 Adventure 只保存媒体路径，不复制图片、音频、视频；不能只迁移世界数据库而
  忽略对应媒体和模块；
- 章节按需导入，不要上线后一次导入七章，也不要把同 ID 内容已存在时的覆盖式导入
  当成标准恢复路径；
- 妖精荒野 Scene `tGvSIXUpenW0tZU2` 的两个旧 `terrainmapper.setTerrain`
  Behavior 已按用户授权删除；Region/shape 保留，迁移后旧 Behavior 不得复活；
- Plutonium Quick Insert 和 Blood Hunter homebrew 不属于性能同步默认范围；它们
  已在 2026-07-29 经用户单独授权作为可选功能补充部署；
- Chat Memory Guard 的玩家客户端覆盖不随世界数据库迁移；
- Dice So Nice 的主要 Preferences & Display 属于客户端 scope；GM 本机设置不会随
  世界数据库自动应用给玩家；
- Sequencer Blob cap、TextureLoader TTL、主动纹理回收和 DSN 预热尚未实施，不属于
  当前生产迁移包；
- `core.mipmap`、MLD `add-extra-statuses`、2048² 玩家图降分辨率、专用 Foundry
  Chrome Profile 和 RenderTexture 所有者映射都只是无源码候选，尚未实施；
- “DSN 隐藏侧栏统计”和“Calendaria 聊天时间戳停止周期更新”尚未取得明确
  setting/scope 与运行时验收记录，不能在迁移时声称已经完成；
- Foundry v14.364 会加载核心 Token Ring spritesheet，核心/dnd5e SVG 也没有整体
  关闭的普通世界设置；任何核心资源替换或加载行为修改都需要单独授权；
- 生产端已经存在的 Aura Effects、Calendaria/3DS:ATLAS、Foundry CHN、
  Filepicker Plus、Token disposition、Dice So Nice 和 AutoAnimations 补丁不能被
  本地旧状态盲目覆盖。

当前执行入口为
[`2026-07-27-cor-cotn-production-migration.md`](../plans/2026-07-27-cor-cotn-production-migration.md)。
该计划的机械迁移、短程语义验收和本地复原演练已经执行；30 分 21.893 秒连续观测
已完成，性能累积指标通过，但 FXMaster 场景退出清理 finding 令运行时清洁度保持
`Partial`。4 小时真实跑团仍按分层状态继续。旧的
`2026-07-12-foundry-v14-production-optimization.md` 只保留为历史背景，不再作为
直接执行计划。

### 2026-07-28～29 生产迁移实际状态

- 状态：`Partial`，不是完整 `Pass`
- 本地生产前快照：
  `.local\foundry-v14\backups\production\fvtt-production\8080\cor-cotn\20260728-220757+0800`
- 远端快速回滚：
  `E:\Bill\fvtt_v13\data\.migration-rollback\20260728-220757+0800`
- 最终世界候选：1,704 文件、677,992,402 bytes、SHA-256
  `345f934b2970c31d1d3feef72107300da6fed71833378ec76672b8960f085454`
- 新增 Chat Memory Guard 并启用；MIO Bridge 已安装但按目标默认禁用
- Sequencer、Simple Cover、Hide NPC Names 已替换为批准构建
- AutoAnimations、Bloodsplats 因线上/本地完全相同而保持原目录
- 主迁移窗口中 `5e-dlc-monster` 因许可未确认而排除；用户随后单独确认并批准，
  `1.2.0` 已于 2026-07-29 安装并在 `cor-cotn` 启用
- GM 和非 GM 短程验收、本地快照复原演练已通过
- 同一 PID/浏览器会话的 30 分钟性能累积指标通过；Worker 首轮预热到 18 后稳定，
  纹理估算和 Heap/Nodes/Listeners/服务器内存均无单调积累
- FXMaster 8.2.4 在第三、四轮离开重场景时重复出现 compositor `clear`
  TypeError；非致命、模块未替换、尚未证明迁移新增，作为独立 finding 保留
- 远端回滚目录至少保留到 4 小时真实跑团通过；本地快照不自动删除
- 公网 HTTP 不是 secure context，Sequencer Spritesheet Generator 仍不可用；
  不能把 7→2 源码补丁检查写成线上队列验收

完整执行报告：
[`2026-07-28-cor-cotn-production-migration-report.md`](2026-07-28-cor-cotn-production-migration-report.md)。

### 2026-07-29 可选功能补充状态

- 执行 ID：`20260729-013252+0800`
- 血猎手 JSON 已上传到 `Data\assets\homebrew`，供后续 Plutonium 自定义导入；
  本次没有导入或做内容验收
- Plutonium `2.15.6` Quick Insert 精确补丁已部署；按用户授权没有新建备份
- `5e-dlc-monster` `1.2.0` 已启用；两个 Actor 合集可由 Foundry API 读取，
  索引数为 969 和 278
- 8080 当前 PID `5000`；51020 PID `9480` 未变化
- `E:` 最终可用空间 8,327,684,096 bytes
- 完整哈希与验收边界见生产迁移报告第 12 节

### 2026-07-30 classpack 部署状态

- `dnd5e_classpack` 已从线上旧版 `4.3.4` 替换并在 `cor-cotn` 启用为
  `4.3.4-v14.1`；21 个合集均被运行中的世界打开，浏览器日志已建立真实索引
- 旧 classpack 仅保留模块目录回退点：
  `E:\Bill\fvtt_v13\backups\module-deploy-20260730-0810+0800\dnd5e_classpack-4.3.4`
  ；没有新建世界或整服备份
- 后续仓库/本地镜像已把版本门、21-pack 身份门和 Windows LF 幂等比较加固为
  `4.3.4-v14.2`，但本轮没有更新生产；8080 仍是 `4.3.4-v14.1`。未来如需
  部署 v14.2，必须作为新的生产变更重新盘点、授权和验收

### 2026-07-30 跑团监控器部署状态

- `fvtt-session-monitor` 已安装并启用；首次线上点击“开始”暴露公网 HTTP
  没有 `crypto.subtle`，本地工具因此由 `1.1.0` 修正为 `1.1.1`
- 监控器 `1.1.1` 使用项目既有的浏览器安全纯 JavaScript SHA-256；
  13/13 聚焦测试、生产类型检查、远端五文件清单和 SHA-256
  `31098AD6EB861D641DC67BED9B51BA889058EA382CDDABC2BBC6D1C18C492CC4`
  均通过
- 当前 8080 为 PID `6480`，命令仍是 v14 代码、特殊 Data 路径和
  `--world=cor-cotn`；启动日志已到 `Launching World | Complete`
- 最后一次 `1.1.1` 的“开始 → 刚才卡顿 → 停止并导出”短烟雾测试，
  仍需用户手动刷新内置浏览器并重新以 GM 加入后完成；四小时真实跑团和
  非 GM 设备证据仍然不包含在短烟雾测试中
- 2026-07-31 只读复核确认当前 PID 6480 仍绑定相同 8080/DataPath，完整
  1.1.1 五文件制品仍在模块目录，五个资源经 8080 回环均为 HTTP 200，
  公网 manifest 也返回 1.1.1。本次没有 GM 登录态，也没有读取 live
  LevelDB；因此当前部署/服务状态为 Pass，当前世界 `active` 状态未重验。

最新 resident 归因依据：

- [`2026-07-28-fvtt-resident-memory-attribution.md`](../reviews/2026-07-28-fvtt-resident-memory-attribution.md)
- [`2026-07-28-fvtt-resident-memory-priority-investigation.md`](../reviews/2026-07-28-fvtt-resident-memory-priority-investigation.md)

## 9. 新 thread 建议开场检查

新 thread 可以直接说：

> 请先阅读 `docs/runbooks/FVTT-REMOTE-OPERATIONS-HANDOFF.zh-CN.md`，目标是线上 8080，先只读盘点并告诉我当前状态；除非我明确授权，不要修改 51020、不要编辑 live LevelDB、不要重启或升级。

接手后至少验证：

- `ssh fvtt-production` 是否仍指向预期服务器。
- 8080 当前监听进程的命令行是否仍使用 v14 代码和特殊 Data 路径。
- `cor-cotn` 是否仍是加载世界、Foundry/dnd5e 版本是否漂移。
- 当前是否有真实玩家在线。
- 本文“当前仍存在的初始化问题”是否已变化。
- 计划中的动作是否需要停服、备份、浏览器 GM/玩家双端验收。

## 10. 相关文档

- [2026-07-22-fvtt-8080-maintenance-report.md](2026-07-22-fvtt-8080-maintenance-report.md)：实际变更、证据、备份与回滚。
- [2026-07-22-fvtt-8080-maintenance-plan.md](2026-07-22-fvtt-8080-maintenance-plan.md)：最初计划；其中 Filepicker Plus 的“暂缓”状态后来已被用户的新授权覆盖，以实际报告和本文为准。
- [2026-07-12-foundry-v14-production-optimization.md](../superpowers/plans/2026-07-12-foundry-v14-production-optimization.md)：较早的生产优化计划背景。
- [2026-07-27-cor-cotn-production-migration.md](../plans/2026-07-27-cor-cotn-production-migration.md)：本次最终迁移入口及当前分层状态。
- [2026-07-28-cor-cotn-production-migration-report.md](2026-07-28-cor-cotn-production-migration-report.md)：实际切换、回滚点、短程验收、复原演练与剩余风险。
- [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md)：模块健康检查背景。
- [foundry-v14-module-parity.md](../acceptance/foundry-v14-module-parity.md)：模块版本/镜像一致性背景。
