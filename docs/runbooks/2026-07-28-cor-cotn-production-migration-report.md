# `cor-cotn` 8080 生产迁移报告

执行 ID：`20260728-220757+0800`
执行窗口：2026-07-28～29（Asia/Shanghai）
目标：仅 `http://49.232.12.153:8080`
运行时：Foundry VTT `14.364` / dnd5e `5.3.3`
代码根：`E:\Bill\v14`
Data 根：`E:\Bill\fvtt_v13\data`
世界：`cor-cotn`

本报告对应的一次性三方审计/候选构造工具已冻结到执行 ID
`20260728-220757+0800`，调用时必须显式传入相同的 `--execution-id`。其中
`5e-dlc-monster=false` 只是本次主迁移切换时的历史裁决，不代表当前生产配置；
后续经用户单独授权的部署见第 12 节。该工具不得直接用于新的生产迁移。

## 1. 当前结论

当前整体状态为 `Partial`，不是完整 `Pass`。

- 机械迁移：`Pass`
- 短程 GM / 非 GM 语义验收：`Pass`，但生产公网 HTTP 下的 Sequencer
  Spritesheet Generator 受 secure-context 限制，不能把源码补丁检查写成线上 Worker
  排队验收通过
- 本地生产前快照复原演练：`Pass`
- 30～50 分钟连续受控观测：`Partial`；30 分钟性能累积指标为 `Pass`，但
  FXMaster 8.2.4 的场景退出清理异常可重复，运行时清洁度不能写成通过
- 约 4 小时真实 GM + 玩家跑团：未开始，仍由用户侧完成

迁移后生产 8080 已恢复运行。2026-07-29 00:57:38 +08:00 的现场进程为 PID `8692`，
命令行同时匹配 `E:\Bill\v14\code\main.js`、`--port=8080` 和目标 DataPath，HTTP
返回 200；PID 是现场证据，后续运维仍必须重新查询，不能复用。

51020 全程未停止、未修改、未访问其数据；迁移前后监听 PID 均为 `9480`。

## 2. 已迁移内容与明确排除

### 已部署

- 三方合并后的完整 `Data\worlds\cor-cotn`
- Sequencer `4.2.3`，只包含锁定源码形状下的 Spritesheet Worker `7 → 最多 2`
  补丁
- Simple Cover 5e `2.2.0-cor-cotn.1`
- Hide NPC Names `1.3.4` 生命周期兼容补丁
- Chat Memory Guard `1.0.0`，世界启用
- Map Image Optimizer Bridge `2.1.0`，包体已安装、世界默认禁用
- 与本地完全相同的 AutoAnimations `7.0.17`、Monk's Bloodsplats `14.01`
  保持线上原目录，没有重复覆盖

生产目标世界最终启用 68 个模块。Bridge 保持禁用是批准后的目标状态：它用于迁移和
回滚，不是常驻依赖；若启用，会在 GM `ready` 路径重新探测大量 MIO 图片。

### 未夹带

- `5e-dlc-monster`：许可未确认，因此没有上传、安装或启用
- Plutonium Quick Insert 补丁、Blood Hunter 数据/URL、卡勒姆或测试 Actor
- Swipe VTT 自动启用
- `core.mipmap`、MLD extra statuses、角色图批量降至 2048²、专用 Chrome Profile
- Sequencer Blob cap、TextureLoader TTL/主动回收、DSN 预热
- DSN 玩家批量配置、Calendaria 聊天时间戳改造、RenderTexture 所有者映射
- Foundry 核心 Token Ring 或核心/dnd5e SVG 修改

## 3. 快照、候选与回滚点

本地生产前一致性快照：

```text
I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\backups\production\fvtt-production\8080\cor-cotn\20260728-220757+0800
```

远端快速回滚目录：

```text
E:\Bill\fvtt_v13\data\.migration-rollback\20260728-220757+0800
```

远端非扫描暂存目录：

```text
E:\Bill\fvtt_v13\data\.migration-staging\20260728-220757+0800
```

关键冻结值：

| 单元 | 文件 | 字节 | 整树 SHA-256 |
|---|---:|---:|---|
| 生产前世界快照 | 2,281 | 1,779,692,729 | `fadcf488e6fe28f6711572864af87c3dca304aea4321b53701918f8ba293d480` |
| 最终世界候选 | 1,704 | 677,992,402 | `345f934b2970c31d1d3feef72107300da6fed71833378ec76672b8960f085454` |

生产前快照还包含 `Config`、8080 启动脚本和三个被替换模块的原版。Foundry 内置世界
备份也已在正常卸载世界前创建。完整私有清单、逐文件哈希与恢复顺序只保存在 `.local`
私有目录；本报告不复制许可、Cookie、密码或玩家隐私。

切换后正式世界和五个部署模块与批准候选逐文件比较，路径、字节与 SHA-256 差异均为
0。远端旧世界和旧模块采用同卷移动保存在快速回滚目录，没有制作第二份远端大世界。

## 4. 三方合并与数据归属

最终候选从本地优化世界开始构造，再对生产前快照执行三方 LevelDB 差异裁决：

- 本地明确拥有的优化字段、删除项、七章 Adventure 与 MIO 路径使用本地值
- `ChatMessage`、`Combat` 使用本地集合
- 生产独有且不在删除清单中的用户、权限和世界文档保留
- 同 ID 单边字段变化按归属合并
- Aura Effects、Calendaria/3DS、Foundry CHN、Filepicker Plus、Neutral Token、
  DSN 世界设置等生产维护结果没有被旧本地状态覆盖

合并候选验证了用户、权限、世界设置、模块矩阵、章节归档、删除项和生产独有文档。
没有未裁决冲突带入切换。原始本地世界和生产快照都保持只读；没有手工编辑 live
LevelDB。

## 5. 机械验证

- 新进程运行 Foundry `14.364` / dnd5e `5.3.3` / `cor-cotn`
- 8080 命令行和 DataPath 精确匹配，`/join` 返回 HTTP 200
- 生产 `E:` 在最后一次记录时仍有约 9.77 GB 可用
- Sequencer、Simple Cover、Hide NPC Names、Chat Memory Guard 存在且启用
- Map Image Optimizer Bridge 存在且禁用
- `5e-dlc-monster` 不存在
- 七个 Adventure 全部可读取
- 61 个 Scene 共审计 611 条不同媒体引用；85 条 `__mio_` 路径失败数为 0
- 共发现 77 条 404；其中 76 条已在迁移前本地工作簿存在，最后一条
  `systems/dnd5e/tokens/humanoid/token_8%20(2).png` 经三方归属证明也是本地候选
  原有引用，不是本次迁移新增
- 当前 `error.2026-07-28.log` 与 `error.2026-07-29.log` 均为 0 字节
- 没有 fatal、uncaught、unhandled、duplicate-ID 或 database-corruption 新类别

服务日志仍会报告部分嵌入 Token/Item 记录“undefined and not retrieved”。这个类别在
本次迁移启动前已经出现；迁移后和复原下载后的重启仍存在。本次没有把它掩盖成
“零警告”，也没有把重复出现次数当成新数据库损坏。它保留为既有数据清理风险。

## 6. 短程语义验收

### GM 世界与文档

- 轻量 Scene `凶兆 Ill Omen`：Canvas ready，MIO 背景成功载入
- 重型 Scene `叛神殿betrayers' rise`：43 Token、7 Tile、1,109 Wall、33 Light，
  Canvas ready；其一条 Tanarukk Token 图片缺失是迁移前已有引用
- GM 可打开 Actor 和 Journal
- Token `Verin Thelyss` 可选择、移动并恢复到原坐标；位置恢复通过，但移动会更新
  `_stats`/移动历史，因此没有把“完整 JSON 字节相等”写成通过

### 攻击、伤害与动画

- 近距离 Hand Crossbow 普通攻击一次未命中
- 优势攻击总值 25，命中 AC 17
- 伤害卡实际掷出 10，公式 `1d6 + 2 + 4`
- 测试没有把伤害应用到目标，目标 HP 保持 58
- MIDI Workflow 的目标、命中目标、攻击与伤害卡均正确
- AutoAnimations 返回匹配 Crossbow 的处理器
- Sequencer 实际播放 `jb2a.fireball.explosion.orange`，活动 Effect 在播放时可见，
  到期后清理
- 带持久 Sequencer Effect 的临时 Token 删除后，Effect 从 1 归零；临时 Token 和
  Actor 均已删除

公网入口是 HTTP IP，浏览器不是 secure context。Sequencer Spritesheet Generator
因此不能初始化，第三个 spritesheet 任务的排队/完成没有在线通过。部署源码与锁定
上游精确比较确认只把 Worker 上限从 7 改为 2；这仍是机械证据，不能替代 secure
context 下的运行验收。

### 模块生命周期

- Simple Cover：临时 Actor 上并发 10 次设置 total cover，全部返回成功，只生成一个
  `dnd5ecoverTotal0` Effect；清除后 Effect 为 0，临时 Actor 已删除
- Bloodsplats：临时战败 NPC 实际生成 bloodsplat，且挂在
  `canvas.regions.bloodsplats`；删除链完成后 Token/Actor 均不存在
- Hide NPC Names：非 GM 的 NPC Token 名牌为 `未知生物`，底层无权限 Actor 不可见
- Chat Memory Guard：GM 在读历史时不裁剪；回到底部后侧栏收敛到 40，数据库仍保留
  全量消息；popout、Core 重渲染和 MIDI 卡交互均可用。15 条临时 GM whisper 已全部
  删除，数据库恢复到 556 条

### Adventure

`world.cor-cotn-chapter-archive` 恰有七章：第七章、红梦密会、第四点五章、第四章、
第五章、妖精荒野、第六章。七个 Adventure 均成功载入文档。

选择最小的第七章执行导入—检查—恢复：

- 导入前与世界 Folder/Scene ID 交集为 0
- 导入创建 1 个 Folder、2 个 Scene
- 两个 Scene 均可读取
- 按精确 ID 先删除 Scene、再删除 Folder
- `core.adventureImports` 恢复为导入前值
- 最终三个临时世界文档残留为 0

### 非 GM 与客户端边界

- `SY` 无密码登录成功，角色绑定存在
- 玩家可进入 `SwampA’`，打开分配 Actor 和可读 Journal，并控制自己的 Token
- 世界当时处于暂停状态，因此没有绕过暂停强行移动玩家 Token
- GM 与 `SY` 的 Dice So Nice 用户设置不同且各自保留
- 没有把 GM 客户端设置批量推送给玩家
- 玩家会话没有新增客户端 error；测试自身调用废弃
  `Sidebar.activateTab` 产生的一条兼容 warning 已单列为操作噪声

## 7. 本地快照复原演练

生产前快照被复制到一次性目录：

```text
I:\OpenCode\fvttV12JsonGenerator\.local\rr-20260728-220757
```

归档原件没有直接启动。首次普通 `Copy-Item` 因 Windows 长路径失败，残缺演练副本未被
当成结果；后续通过短路径联接重新复制，2,281 个世界文件、1,779,692,729 bytes 与
生产前快照逐文件 SHA-256 差异为 0。

为遵守“清理需另行确认”，两个失败重试目录没有自动删除：

- `.local\foundry-v14\restore-rehearsal\20260728-220757+0800`：
  1,177 文件、344,749,297 bytes
- `.local\foundry-v14\restore-rehearsal\20260728-220757+0800-retry1`：
  2 文件、1,414 bytes

它们不是有效恢复点；真正通过的演练目录是 `.local\rr-20260728-220757`。

生产许可在本机并行验证失败后，只在一次性副本中换用本机已有许可；生产快照内的
许可原件哈希未改变。两个本地镜像缺失、但生产前启用的 Czepeku 地图模块包含运行中
LevelDB，因此没有违规热拷贝。确认只有本次 GM 在线后，正常卸载世界、精确停服，
离线下载两个模块并逐文件验证：

| 模块 | 文件 | 字节 | 哈希差异 |
|---|---:|---:|---:|
| `czepeku-262-swamp-graveyard` | 49 | 50,432,470 | 0 |
| `czepeku-29-depths-of-the-festerwood` | 33 | 30,344,007 | 0 |

该离线窗口约 62 秒。8080 随后用原入口重新启动；新的 PID 和 HTTP 200 已由第二个
独立 SSH 会话复核，51020 前后均未变化。

演练结果：

- Foundry `14.364` / dnd5e `5.3.3` / `cor-cotn`
- 本地 GM 登录返回 `JOIN.LoginSuccess`，`/game` 返回 200
- Actor 771、Combat 19、Item 1,430、Journal 415、Macro 89、Message 337、
  Scene 295、Table 12、User 7，均与复制后的原始 LevelDB 顶层计数一致
- 1 名 GM、5 个角色绑定；所有绑定 Actor 存在
- 生产前 67 个启用模块均有包体
- 旧 Sequencer `4.2.3`、Simple Cover `2.2.0`、Hide NPC Names `1.3.4` 正确
- 生产前 absent 的 Chat Memory Guard、MIO Bridge、`5e-dlc-monster` 仍 absent
- 本地演练日志没有 error/warn/fatal、uncaught、unhandled、duplicate-ID 或数据库
  损坏
- 演练进程已精确停止，31464 端口已关闭

生产前运行时清单曾把 Item 写成 1,429；对未启动的二次副本和演练后数据库进行 ID
级比较，二者实际均为 1,430，新增、删除、变化均为 0。因此本报告以原始 LevelDB
事实为准，并保留旧运行时清单的计数差异，不把它解释为演练新增 Item。

## 8. 30 分钟连续受控观测

复原演练后的生产服务在同一 PID `8692` 和同一 GM 浏览器会话中，从
2026-07-29 00:27:06.699 持续到 00:57:28 +08:00，共 1,821.893 秒。期间执行四轮
轻场景 → 43 Token / 1,109 Wall 重场景 → Sequencer fireball → Actor/Journal →
`SwampA’` 的受控循环，并在循环后保留自然空闲间隔。

| 样本 | Heap used | Listeners | CDP Nodes | Worker | Texture 估算 | 服务端 WS |
|---|---:|---:|---:|---:|---:|---:|
| 启动后样本 0 | 1,233,161,712 | 7,640 | 32,879 | 10 | 未采集 | 553,730,048 |
| 空闲样本 1 | 447,881,468 | 5,781 | 22,971 | 10 | 未采集 | 231,514,112 |
| 第一轮后 | 456,847,152 | 6,227 | 30,073 | 18 | 415,510,913 | 239,788,032 |
| 第二轮瞬时峰值 | 494,736,032 | 7,693 | 48,695 | 18 | 415,510,913 | 未同步采集 |
| 第二轮空闲 | 457,161,188 | 6,230 | 27,879 | 18 | 415,510,913 | 242,704,384 |
| 第四轮空闲 | 462,298,120 | 6,228 | 30,381 | 18 | 415,510,913 | 249,864,192 |
| 30 分钟最终 | 462,547,740 | 6,230 | 33,854 | 18 | 415,510,913 | 249,864,192 |

性能累积指标结论为 `Pass`：

- 启动高水位自然回落；后续空闲 Heap 保持约 448～463 MB，没有逐轮上升
- 第二轮后的 Nodes/Listeners 瞬时峰值在空闲时回落，不是单调保留
- Worker 在第一次实际动画后从 10 预热到 18，后续三轮及最终样本均保持 18
- 纹理估算在第一次循环后保持 415,510,913 bytes，没有逐轮增加
- 每轮检查后 MIDI Workflow、Sequencer Effect 和测试窗口均回到 0
- 服务端 Working Set、Private、Handle 和 Thread 没有单调累积；最终 8080 HTTP 200

运行时清洁度结论为 `Partial`。第三轮从重场景返回时，FXMaster `8.2.4` 的
`GlobalEffectsCompositor.renderFrame` 成对抛出
`Cannot read properties of null (reading 'clear')`；第四轮把重场景停留和退出前等待
延长后，同一错误仍成对复现。错误没有令 Canvas 失败、没有留下 Effect/窗口/文档
残留，服务端日志也没有对应 fatal/error；但它不是验收探针自身错误，不能写成
“零运行时错误”。

FXMaster 没有在本次迁移中替换，迁移前也没有对同一路径做浏览器日志捕获，因此不能
证明该异常由迁移新增。它不满足“严重新增异常”的自动回滚条件，本次不为这个未归属
的非致命模块问题撤销已经通过的世界迁移；该 finding 留待独立诊断。

## 9. 操作噪声与未关闭风险

以下错误由验收探针本身触发，不是生产功能回归：

- 一次 Playwright 合成点击令 MIDI/dnd5e 收到缺少真实 DOM target 的事件；改用物理
  Chrome 点击后攻击和伤害链通过
- 两次错误的 Sequencer Database 查询参数
- 删除 Token 后对已经不存在的 UUID 调用 `EffectManager.getEffects`；修正为在全部
  Effect 中过滤后，删除链重跑通过
- 对 Foundry 14 不存在的 `foundry.utils.deepEqual` 调用；删除和设置恢复已经先完成，
  后续用序列化等值确认设置精确恢复

仍未关闭：

- 4 小时真实跑团未完成
- Spritesheet Generator 需要 HTTPS/localhost secure context
- FXMaster 场景退出清理异常可重复，尚未独立定责或修复
- 77 条既有资源 404 尚未作为独立内容修复
- 既有 embedded-record warning 尚未清理

## 10. 回滚状态

远端 `.migration-rollback\20260728-220757+0800` 至少保留到 4 小时真实跑团通过；本地
生产快照不自动删除。失败时仍按固定顺序停新 8080、移出失败候选、同卷恢复旧世界和
旧模块；只有远端回滚目录不可用时才从本地快照上传恢复。`Config` 和启动脚本本次未
修改，不需要选择性恢复。

2026-07-29 00:57:41 +08:00 的只读复核确认回滚根存在：

- `worlds\cor-cotn`：2,281 文件、1,779,692,729 bytes
- `modules\sequencer`：88 文件、7,093,755 bytes
- `modules\simplecover5e`：109 文件、7,213,814 bytes
- `modules\hide-npc-names`：14 文件、86,932 bytes

任何清理、删除回滚目录或删除本地快照都需要另行确认。

## 11. 证据

私有证据根：

```text
.local/foundry-v14/evidence/production/20260728-220757+0800/
```

主要清单包括三方差异、最终候选清单、生产离线清单、设置与包清单、恢复顺序、切换后
逐文件对账、复原演练结果和连续观测样本。私有内容不进入 Git；跟踪文档只记录快照 ID、
摘要哈希、验收结论和剩余风险。

## 12. 2026-07-29 可选功能补充部署

执行 ID：`20260729-013252+0800`。本节是用户在主迁移完成后单独批准的功能部署，
不改变第 1～11 节对原迁移窗口的历史记录。目标仍仅为生产 8080；51020 未停止、
未修改，监听 PID 在部署前后均为 `9480`。

部署结果：

- 血猎手活动 JSON 已放到
  `Data\assets\homebrew\blood-hunter-2024.activities.json`，492,145 bytes，
  SHA-256
  `3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65`；
  公网使用路径为
  `/assets/homebrew/blood-hunter-2024.activities.json`，服务端 HTTP 核验为 200。
  按用户要求，本次没有执行 Plutonium 自定义导入，也没有验证血猎手内容或玩法。
- `plutonium-cn` 保持精确版本 `2.15.6`，仅替换批准的 `js\Bundle.js`。补丁后文件
  为 3,355,151 bytes，SHA-256
  `E2078FD773FD76A540136B1DA454AD591C2832C983425A391BDD7902AD326EBE`，
  `PLUTONIUM_QUICK_INSERT_COMPAT_V2_15_6` 哨兵恰好 1 个。按用户明确授权，本次
  没有为该文件新建备份。
- `5e-dlc-monster` `1.2.0` 已安装并在 `cor-cotn` 启用；清单声明
  `compatibility.verified = 14`。停服切换前批准包为 4,781 文件、
  710,462,561 bytes，整树 SHA-256
  `e204b02687153cad60226b0f968003e36d02a49e21d0feb033d8d805187e8988`。
  世界重载后 `game.modules` 报告模块 `active = true`，两个 Actor 合集均可读取：
  `monster-heji` 969 条、`modengken-duoyuanguaiwu` 278 条。

切换时只停止了精确匹配 `--port=8080` 和目标 DataPath 的 PID `8692`。随后使用原
启动入口恢复为 PID `5000`，命令行仍为 Foundry `14.364`、目标 DataPath 和
`--world=cor-cotn`；最终 HTTP 200，GM 返回 `SwampA’`，Foundry `ready = true`。
最近 500 行 debug 日志没有 fatal、uncaught、unhandled、duplicate-ID 或数据库损坏
匹配，当日 error 日志为 0 bytes。最终 `E:` 可用空间为 8,327,684,096 bytes。

运行中的 LevelDB 合集会被 Foundry 加锁并发生正常日志轮换，因此启用后没有再次热读
整树哈希；离线整树哈希已在切换前验证，启用后的真实性证明使用 Foundry Document API
读取合集索引。血猎手导入和实际内容验收明确留给用户，不能把本节状态表述为血猎手
语义验收通过。

本次私有证据位于：

```text
.local/foundry-v14/evidence/production/20260729-013252+0800/
```
