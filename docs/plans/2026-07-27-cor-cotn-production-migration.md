# cor-cotn 本地优化最终生产迁移计划

初版日期：2026-07-27
最近更新：2026-07-28
目标生产实例：`http://49.232.12.153:8080`
生产代码根：`E:\Bill\v14`
生产 Data 根：`E:\Bill\fvtt_v13\data`
目标世界：`cor-cotn`
锁定运行时：Foundry VTT 14.364、dnd5e 5.3.3

## 1. 状态与授权边界

本文是当前本地优化成果向生产 8080 迁移的统一执行入口，取代
`docs/superpowers/plans/2026-07-12-foundry-v14-production-optimization.md` 作为未来
执行依据。旧计划保留为历史背景。

本文存在不等于已经获得生产写权限。执行前仍需要用户明确授权本次停服、备份、
上传、替换、启动和运行时验收范围。51020 始终默认为只读；过去一次复制付费模块的
授权不延伸到本次。

截至本文编写：

- 最近一次生产实时核对为 2026-07-23；
- 2026-07-24～28 的世界清理、章节 Adventure、配置调整和性能补丁只在本地
  `server-mirror`；
- 本文编写过程没有访问、停止或修改生产服务器；
- 本地和生产都可能在最近快照后继续变化，任何历史 PID、模块数和文档数都不能作为
  执行时事实。

## 2. 完成标准

只有以下四层都分别记录，迁移才可以声明完成：

1. **机械迁移通过**：源/目标版本、目录、文件清单、大小、SHA-256、模块 ID 和设置
   符合本次批准范围。
2. **短程语义验收通过**：GM 和非 GM 的世界载入、轻重 Scene、Token、Actor、
   攻击/伤害、聊天、动画及相关补丁行为真实可用。
3. **受控性能验收通过**：30～50 分钟真实节奏循环后，Heap、DOM、监听器、
   Workflow、Effect 和纹理/Worker 没有不可接受的单调累积。
4. **真实跑团验收通过**：约 4 小时 GM+玩家会话满足性能 Checklist 的最终目标。

短程通过不能升级为长时通过。线上文件存在、HTTP 200、模块显示 active 或世界成功
启动都只是机械证据，不能替代真实操作。

## 3. 执行时必须重新冻结的基线

开始时先只读，不修改或重启：

- 重新查询 8080 监听 PID、完整命令行、可执行文件、工作目录和启动器；
- 确认同时匹配 `E:\Bill\v14\code\main.js`、`--port=8080` 和
  `--dataPath="E:\Bill\fvtt_v13\data"`；
- 记录 Foundry、dnd5e、Node、目标世界和当前在线用户；
- 导出生产启用模块 ID/版本及关键世界/客户端设置；
- 记录生产世界 Actor、Scene、Journal、Item、Combat、ChatMessage、Scene Token；
- 记录生产世界目录文件数、总字节和停服前可安全取得的非数据库清单；
- 从现有日志和页面只读捕获当前错误基线；在取得执行授权并完成备份后，再以普通
  攻击/伤害建立会写入聊天消息的操作基线；
- 同时在本地生成同一字段的新鲜快照，不使用 2026-07-26 的 516 Actor/352
  ChatMessage 数字冒充当前值。

如果生产不再是 Foundry 14.364 / dnd5e 5.3.3，或实际代码/Data 路径变化，停止执行并
重审所有版本锁定补丁。

## 4. 三方对照与保留规则

部署前制作三方矩阵：

| 层 | 含义 |
| --- | --- |
| 生产当前 | 2026-07-22～23 维护后又可能继续变化的真实线上状态 |
| 本地当前 | 2026-07-24～28 清理、章节归档和补丁后的 `server-mirror` |
| 迁移目标 | 用户本次明确批准的最终状态 |

以下生产结果默认保留，除非用户逐项批准覆盖：

- Aura Effects 2.1.1；
- Foundry CHN 14.364；
- Filepicker Plus 6.0.1 已安装但未启用；
- Calendaria 1.2.0 与 3DS:ATLAS 1.0；
- 85 个既有非玩家 Token 的 Neutral disposition；
- `core.prototypeTokenOverrides` 的 NPC Neutral 默认值；
- Dice So Nice 的 `persistentDice=false`、`allowInteractivity=false`；
- AutoAnimations 7.0.17 的 `tieToDocuments(sourceToken)` 生命周期补丁；
- 生产已存在的用户、权限、客户端偏好和后来新增游戏数据。

不得以“本地更优化”为理由直接覆盖这些线上独有结果。世界目录替换前必须确认上述
世界设置和数据在迁移目标中仍存在，或明确记录采用生产值的合并方式。

## 5. 迁移单元

### 0. 模块配置与包体一致性

世界目录会携带模块启用设置，但不会自动补齐生产磁盘上的模块包。迁移前必须把本地
最新启用模块 ID/版本与生产磁盘/启用状态逐项对照：

- 68 是 2026-07-26 的本地快照，不是必须机械追求的生产数字；
- 对迁移目标中每个启用 ID，确认生产有许可且版本兼容的包体；
- 对本地已关闭的 `tokenmagic`、`levels`、`simple-quest`、`5e-chm-online`、
  `chat-media`、`scene-packer`、`monks-combat-marker`、`monks-common-display` 和
  `translate-all`，记录生产最终决定，不因复制世界设置而静默改变；
- `token-action-hud-core` 和 `token-action-hud-dnd5e` 在本地保持启用；Argon Core/
  dnd5e 已移出模块扫描目录，不得因生产磁盘仍有旧包而被世界设置意外重新启用；
- Automated Animations 保持启用，迁移验收不得以关闭动画换取性能通过；
- `sync-token-actor` 3.1.0 与旧 `sync-token-name` 必须成对检查：新包可用后再启用，
  旧包保持关闭，并确认自动图片同步仍关闭；
- 不允许用“复制整个 Data/modules”补齐差异；每个缺失包都要有来源、许可、版本、
  哈希和明确部署决定，付费模块尤其不能从 51020 自动复制。

### A. 完整世界目录

来源：

```text
.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn
```

目标：

```text
E:\Bill\fvtt_v13\data\Data\worlds\cor-cotn
```

要求：

- 只在世界正常卸载、精确 8080 进程停止并完成一致性备份后替换；
- 使用完整暂存目录和原子目录切换，不在 live LevelDB 上 merge-copy；
- 世界目录包含 Actor、Journal、Scene、Token、设置、优化地图引用、`.mio` 和
  `mio-bridge`；
- 替换后核对源/目标文件数、总字节和整树 SHA-256；
- 不把 `server-mirror` 外的未使用场景图归档复制回生产。

本地归档：

```text
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727
```

该归档是本地恢复材料，不是生产部署内容。

### A1. 世界级章节 Adventure Pack 与当前剥离状态

完整世界目录必须携带世界级 Pack：

```text
world.cor-cotn-chapter-archive
显示名称：溟渊的呼唤：章节归档
Document 类型：Adventure
```

2026-07-28 本地快照中的七个 Adventure：

| Adventure | ID | Scene | 专属 Actor | Folder | Token |
| --- | --- | ---: | ---: | ---: | ---: |
| 红梦密会 | `IUIOaSRx8l7EazeG` | 16 | 62 | 9 | 212 |
| 第六章 | `d6GFwntrENpGwR94` | 9 | 13 | 5 | 87 |
| 第四章 | `RVss5zbuko093w5M` | 108 | 78 | 56 | 1,315 |
| 第四点五章 | `Ni8ZUaT8gLCNGv5q` | 1 | 2 | 3 | 9 |
| 第五章 | `TTZvGnVOyiB3jaAJ` | 35 | 28 | 10 | 340 |
| 第七章 | `6x9v6LzabvLLD896` | 2 | 0 | 1 | 0 |
| 妖精荒野 | `WeQIoZQzDV58cMW1` | 20 | 65 | 13 | 269 |

当前期望状态是“Adventure 保留、上述章节的 Scene 和专属 Actor 不作为世界文档
常驻”。2026-07-28 快照为 268 Actors、61 Scenes、132 Folders，并且七章
Adventure 内 Scene/专属 Actor ID 与世界交集为 0；迁移时必须重新按 ID 验证，不能
只追求历史数量。

生产使用规则：

- 不在上线后一次导入七章；只在真正玩到对应章节前按需导入；
- 标准恢复路径是章节当前不在世界时的 create-style import；
- 不把同 ID 内容已存在时的重复覆盖导入作为常规路径，第四章曾在该边界触发
  ActorDelta/dnd5e/MIDI 问题；
- Adventure 是快照，不会自动同步导入后的世界编辑；
- Adventure 只保存媒体路径，不复制图片、音频或视频；世界、模块、媒体路径必须一并
  迁移和验证；
- 已有 missing Actor Token 不修复、不猜测同名 Actor，导入后仍应保留原名称、图像
  和占位。

妖精荒野的已批准内容变化也随世界与 Adventure 迁移：Scene
`tGvSIXUpenW0tZU2 / 市广场（哀怒）` 中只删除以下两个旧
`terrainmapper.setTerrain` Behavior：

- Region `Ly0gnunJI67KE6IQ` / Behavior `qarR8w9x0MaNbO3A`；
- Region `pUIG1zAcB0kBnKeX` / Behavior `2Vc0xVW2xJyX2jGL`。

两个 Region/shape 必须保留，不自动生成 `modifyMovementCost` 替代项。迁移后导入
妖精荒野时，旧 Behavior 不得复活。

### B. Map Image Optimizer Bridge

来源模块：

```text
Data/modules/map-image-optimizer-bridge
```

必须与世界内新的 Scene/Level/Tile 路径同时部署。只部署模块不部署世界，或只部署
世界不部署 Bridge，都不是完整迁移。

### C. Chat Memory Guard

来源模块：

```text
Data/modules/chat-memory-guard
```

锁定构建 ZIP SHA-256：

```text
807A40FE488F6FB2D60615B693A5EE0D0A36F754F07BB1C655C23A3F22850C6F
```

世界默认设置随世界目录迁移；玩家“跟随世界默认/隐藏头像/系统原图”等客户端覆盖不随
世界数据库迁移。上线后必须分别以 GM 和非 GM 验收。

### D. Sequencer 4.2.3 Worker 上限

来源模块：

```text
Data/modules/sequencer
```

锁定哈希：

| 对象 | SHA-256 |
| --- | --- |
| 原版相邻备份 | `8F907DBBFC0611D3EBC2D1456C118A74041A7492753AFDE5EA96F303D77CFB68` |
| 7→2 补丁 bundle | `08540669C22A5DE4986F515716E9BECB3BC1833A04C5E0832E6F11CB8B7799B0` |

只允许应用于精确 Sequencer 4.2.3 和唯一匹配的
`SpritesheetGenerator-*.js`。版本、bundle 名、源码形状或哈希变化时停止，不把旧
补丁套到新版本。

本地 2026-07-28 已认证运行时完成 20 次 Automated Animations 公共 API 播放；
TextureLoader、PIXI cache、DOM、持久 Effect 和 JS heap 没有累积。两个 Worker
合计约 572 MiB 是 committed 地址空间，不是同量的物理 RAM；后续
`K32QueryWorkingSetEx` 逐页检查确认两个 WASM 区域实际 resident 各约 1.15 MiB。
Worker 7→2 补丁的价值主要是限制虚拟提交和并发解码风险，不应宣传成已经释放约
572 MiB 真实驻留内存。迁移后仍需核对生产实际加载同一补丁，不得把本地测试自动
外推为生产通过。

### E. Simple Cover 5e 并发修复

来源模块：

```text
Data/modules/simplecover5e
```

目标版本必须显示 `2.2.0-cor-cotn.1`。完整同步模块目录，不只复制单个 JS；核对
`LOCAL_PATCH.zh-CN.md`、`module.json` 和回归测试文件存在。模块清单已移除上游自动
下载地址，防止静默覆盖为原版 2.2.0。

### F. 生命周期补丁模块

逐个部署和核对，不能合并成一个无差别模块包：

- `monks-bloodsplats` 14.01；
- `autoanimations` 7.0.17；
- `hide-npc-names` 1.3.4。

Bloodsplats 补丁 JS 的已知本地 SHA-256 为：

```text
8C6F677EC96A464A213797419B9CEBDEFFEB913C6EB2E34A7B5703428A78E491
```

AutoAnimations 线上与本地都曾记录
`tieToDocuments(sourceToken)`。部署前先比对完整文件哈希和源码形状；内容一致时不
重复覆盖，内容不一致时先确定差异来源。

### F1. Combat Tracker、Monk 与 Token Action HUD 配置

本地最终配置目标：

```text
token-action-hud-core = enabled
token-action-hud-dnd5e = enabled
enhancedcombathud = absent or disabled
enhancedcombathud-dnd5e = absent or disabled

monks-combat-details.select-combatant = false
monks-combat-details.opencombat = none
monks-combat-details.popout-combat = false
monks-combat-details.auto-scroll = false
monks-combat-details.pan-to-combatant = true
```

这组配置关闭 Monk 自动弹出的第二个 Combat Tracker、自动选中和自动滚动，保留
玩家主动选择 Token、核心 Tracker 和镜头跟随。公平 A/B 中 TAH 在纯换回合、真实
点击和手动选中路径均比 Argon 快，所以生产迁移不得以“Argon DOM 更少”为理由恢复
Argon。

Automated Animations 必须保持 active，且客户端
`autoanimations.killAllAnim = on`。本地 7.0.17 源码确认 `on` 才会设置
`AnimationState.enabled = true`，`off` 会禁用动画。迁移验收还需要实际看到一次
攻击动画和 Sequencer 特效，不能只根据模块 active 或某个设置键名推断动画已开启。

### F2. Dice So Nice 客户端设置边界

Dice So Nice 的主要外观与性能配置位于客户端 scope，不随世界数据库统一覆盖到所有
玩家。生产世界迁移只能保留世界 scope 设置；GM 本机的低图片质量、低阴影、无抗锯齿、
无高 DPI 等偏好不能被描述为“全桌已经优化”。

如用户之后批准通过 DSN Profiles & Data 向玩家推送 Preferences & Display，应单独
记录推送对象和回滚方式。当前迁移不推送玩家客户端配置，也不禁用 3D 骰子。

### F3. Native 内存诊断不是已完成的部署补丁

当前已知：

- Sequencer WebM Blob LRU cache 源码硬上限为 500 MiB，但实时实占尚未暴露；
- 两个 Sequencer Worker 合计约 572 MiB 是 committed；逐页实测 resident 各约
  1.15 MiB，不能再把 572 MiB 计为当前物理 RAM；
- Foundry TextureLoader 当前实测约 254 MiB，纹理 TTL 为 15 分钟；
- 自动动画受控播放没有发现 JS/PIXI/DOM 固定斜率泄漏，但存在 renderer native
  高水位；
- 当前 Renderer Private Working Set 约 1.16～1.20 GiB，其中 V8 cage
  `407.81 MiB`、PartitionAlloc pool A `402.07 MiB`、pool B `266.02 MiB`，
  三项合计解释 Renderer PWS 的 `92.54%`；
- GPU Private Working Set 约 `448.67 MiB`；58 个 managed texture 的 base-level
  约 `230.48 MiB`，其中 13 个 RenderTexture 约 `111.09 MiB`；
- Quick Insert 当前 `searchLib === null`、`hasIndex === false`，Duplicate UUID
  警告不是当前约 408 MiB V8 resident 的解释。

因此生产迁移只包含已经验证的 Worker 7→2 补丁，不包含尚未实施的 Blob cap、
TextureLoader TTL、主动纹理回收或 DSN 预热。以后每项都必须单独 A/B、单独授权、
单独回滚，不能作为本计划的隐含变更。

以下无源码候选同样不属于当前迁移包：客户端 `core.mipmap` A/B、MLD
`add-extra-statuses` 核对、2048² 玩家角色图降分辨率、专用 Foundry Chrome
Profile，以及 13 个 RenderTexture 的所有者映射。“DSN 隐藏侧栏统计”和
“Calendaria 聊天时间戳停止周期更新”也尚无已实施 setting/scope/运行时证据。
Foundry v14.364 无条件加载核心 Token Ring spritesheet，核心/dnd5e SVG 也没有可
整体关闭的普通世界设置；若需要更改这些核心加载行为，必须作为单独源码/资源方案
重新授权，不能夹带进本次生产迁移。

2026-07-28 的三组完整 Chrome 重启 A/B 进一步确认：

- 当前动画栈全开相对“Sequencer/AA/dnd5e Animations/Automated Evocations 关闭但
  JB2A 保留”，Chrome Working Set 多约 `274.80 MiB`，Chrome private 多约
  `1029.84 MiB`；
- private 差值主要位于 Renderer `626.02 MiB` 和 GPU `374.71 MiB`，JS heap
  只差 `38.79 MiB`；
- 关闭运行时后少两个 WorkerGlobalScopes，与双 Sequencer Worker 一致；
- 三组战斗帧 P95 均为 `7.6 ms`，关闭动画没有稳定降低 Long Task；
- 单独再关闭 JB2A 没有可测收益。

该结果提高了 Sequencer/动画运行时 native memory 的定责置信度，但没有改变生产
方案：继续迁移已经验证的 Worker 7→2 补丁，保持自动动画与 JB2A 启用；不得把本次
诊断性全关闭当成生产配置。

### G. 可选功能迁移，不属于默认性能范围

只有用户另行批准时才执行：

1. `Data/modules/plutonium-cn` 的 Quick Insert 兼容补丁；
2. `Data/assets/homebrew/blood-hunter-2024.activities.json`；
3. Plutonium homebrew URL 配置；
4. 卡勒姆、测试 Actor 或线上合集包迁移。

Blood Hunter 当前产物 SHA-256：

```text
3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65
```

该功能流必须先在测试 Actor 验收，再处理正式 Actor/合集；不能因 JSON 和本地探针
通过就直接覆盖卡勒姆。

## 6. 备份与回滚

在任何世界或模块替换前：

1. 确认没有真实玩家在线；
2. 通过 GM 正常返回 Setup 卸载世界；
3. 创建并验证 Foundry 内置世界备份；
4. 停止只匹配完整 8080 命令行的进程；
5. 为 `Config`、目标世界和每个待替换模块创建带时间戳的相邻或独立备份；
6. 记录源/目标、文件数、字节、修改时间和 SHA-256；
7. 在暂存目录验证完整性后原子切换；
8. 保留旧目录直到全部短程验收结束。

不要：

- 复制运行中的 LevelDB 作为一致性备份；
- 编辑 live LevelDB；
- 删除 `.lock` 而不先证明没有进程占用；
- 使用历史 PID 或模糊匹配全部 `node.exe`；
- 停止或修改 51020；
- 把密码、Cookie、私钥或付费模块许可信息写入证据。

任一变更组失败时，只回滚该组及其依赖世界快照，然后重跑相同验收单元。不要在失败
状态继续叠加下一组。

## 7. 推荐部署顺序

1. 新鲜只读生产/本地盘点和差异矩阵；
2. 用户确认最终模块状态，特别是 Swipe 保持关闭还是重新启用；
3. 世界卸载、内置备份、停服和文件级备份；
4. 完整世界目录、章节 Adventure Pack 与 Map Image Optimizer Bridge；
5. 核对七章 Adventure 存在、世界零交集和妖精荒野两个旧 Behavior 不复活；
6. Chat Memory Guard；
7. Sequencer Worker 上限；
8. Simple Cover 5e；
9. Bloodsplats、AutoAnimations、Hide NPC Names；
10. 核对 Monk/TAH/Argon 最终状态和 DSN 客户端设置边界；
11. 启动 8080，完成每组机械与短程语义验收；
12. 如另获授权，再执行 Plutonium/Blood Hunter 功能迁移；
13. 30～50 分钟受控循环；
14. 用户真实 4 小时跑团验收。

Swipe VTT 2.3.0 当前远程记录为已安装但未启用。旧计划要求启用 Swipe 的决定已经
过时；本次不得自动启用，必须由用户重新确认。

## 8. 迁移后验收矩阵

### 世界和地图

- 世界登录、Canvas、轻量与重型 Scene；
- Actor sheet、Journal、Token 选择/移动/目标；
- Scene/Level/Tile 当前图片路径逐一 HTTP 验证；
- 两条迁移前已经缺失的 Level 背景引用继续单列，不归因于迁移；
- 93 张最新 MIO 计划输出和 1 张世界背景仍在世界中；
- 没有把当前 986 张、1,707,922,202 bytes 的外部归档重新带回生产世界。

### 章节 Adventure

- Pack `world.cor-cotn-chapter-archive` 可打开，七个 Adventure 的名称和 ID 一致；
- 七章 Adventure 中的 Scene/专属 Actor ID 与世界文档交集为 0；
- 选择一个小章节做一次 create-style Import Adventure，实际打开 Scene、Token 和
  Actor，再恢复到预定归档状态；
- 既存 missing Actor Token 的名称、图像和占位保留，没有新增 missing；
- 不要求 linked 空 Delta 字节级一致，但必须记录 Foundry 原生 `null` 规范化；
- 妖精荒野两个旧 `terrainmapper.setTerrain` Behavior 不存在，两个 Region/shape
  仍存在；
- 图片、音频和视频按原路径可访问；不把 Adventure Document 存在当成媒体通过。

### 普通战斗

- 一个真实 Token 攻击一个真实目标；
- d20、命中、伤害和聊天卡完整到达；
- MIDI Workflow 最终进入 `WorkflowState_Completed`；
- 没有长期保留未完成配置窗口；
- 只出现一个预期 Combat Tracker，不自动弹出第二个 Tracker；
- 换回合不自动选择当前战斗者，玩家手动选择 Token 后 TAH 正常更新；
- Monk 不自动滚动，`pan-to-combatant=true` 的镜头跟随仍按预期工作；
- TAH Core/dnd5e active，Argon Core/dnd5e 不 active；
- Automated Animations active，实际攻击动画可见。

### Dice So Nice

- GM 和至少一个玩家分别记录 DSN 客户端 Preferences & Display；
- 不假设 GM 当前设置自动继承给玩家；
- 第一次投骰与热缓存投骰分别观察，不把一次首次 shader warm-up 当成持续卡顿；
- 不禁用 3D 骰子；任何 GM 批量推送都需要单独授权和回滚记录。

### Chat Memory Guard

- GM disabled/enabled A/B；
- 向上阅读时不裁剪，回到底部收敛到 40；
- 被裁剪消息能由 Core 重渲染；
- 重渲染 MIDI 卡片仍可操作；
- 原有 ChatMessage ID、内容和 speaker 指纹不变；
- sidebar/popout 同步及关闭后监听器释放；
- 非 GM 无 OBSERVER 权限时不新增身份相关 Token/Actor 替换；
- 隐藏头像保留 sender，并清空模块自有缩略图缓存。

### Sequencer Worker 上限

- Sequencer active 且实际加载目标补丁 bundle；
- 使用现有安全、非平铺 WebM 触发 spritesheet generator；
- 第三个转换任务排队后能继续，不永久 pending；
- renderer 恰好出现两个 299,958,272-byte 私有提交区域；
- 30 秒内无新增 fatal、uncaught 或 unhandled error；
- 用户检查首次转换延迟、多动画视觉、切 Scene 恢复和复杂 JB2A/AA 组合。

### Simple Cover 5e

- 运行版本为 `2.2.0-cor-cotn.1`；
- 同一 Actor/ActorDelta 10 路并发只产生一个固定 ID Effect；
- 测试 Effect 清理后原状态保留；
- 一次正常攻击与伤害完成，无 duplicate-ID error。

### 生命周期补丁

- Bloodsplats 在 defeated Token 上仍显示，切 Scene 后没有旧 `position` Promise 异常；
- 删除来源 Token 后，AA 持久模板关联特效结束，不再产生空 Region 孤儿链；
- Hide NPC Names 在无 Actor/无 `prototypeToken` 边界不抛错，非 GM 仍看到预期名称。

### 错误基线

以下既有问题不得被隐瞒，也不能自动归因于本次迁移：

- Turn Undead Item 的无效 `@abilities.wis.mod d8`；
- 妖精荒野两个旧 `terrainmapper.setTerrain` 行为已经按用户授权删除；如果迁移后再次
  出现，应判定为回归，而不是既有错误；
- 已记录的模块图片 404；
- 两条迁移前已经缺失的 Level 背景；
- Plutonium 可选后端 404、弃用警告和 SSDP listener warning。

迁移只有在没有新增严重错误或必需功能回归时通过短程门槛。

## 9. 长时验收与结论格式

### 30～50 分钟受控循环

使用真实节奏覆盖：

- 轻量 Scene 基线；
- 两张不同压力结构的战斗 Scene；
- 先攻、多个回合、攻击、伤害、法术、状态、动画和 Token 移动；
- sidebar/popout 聊天和历史加载；
- 返回轻量 Scene 后等待 60～90 秒。

每 10 秒记录 Heap、DOM、Listeners、Workflow、Effect、纹理/资源和错误事件。不得以
一次低内存点或服务器健康替代回落曲线。

### 4 小时真实跑团

最终由真实 GM+玩家会话验证：

- 不需要每 30～45 分钟刷新；
- 2～4 张地图和多轮战斗后仍可操作；
- 可以接受 2～3 小时后轻微卡顿并通过一次刷新释放；
- Scene、Token、动画删除和战斗结束不持续产生重复异常。

最终报告逐项使用：

- `Pass`：机械、短程和相应长时层级均通过；
- `Partial`：部分层级通过，仍有明确未验收项；
- `Blocked`：缺少登录、触发夹具、授权或外部条件；
- `Fail`：出现可重复回归、错误或验收指标失败。

在 4 小时验收前，整体生产迁移最高只能报告为 `Partial`，不能写成“性能优化全部
完成”。

## 10. 证据和交接

执行后应更新：

- `docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md`；
- `docs/acceptance/cor-cotn-performance-optimization-checklist.zh-CN.md`；
- `docs/runbooks/FVTT-REMOTE-OPERATIONS-HANDOFF.zh-CN.md`；
- 新的带时间戳生产迁移报告。

原始清单、哈希、日志和性能采样保存在忽略的：

```text
.local/foundry-v14/evidence/production/<timestamp>/
```

不得在跟踪文档中记录密码、Cookie、私钥、许可证或原始玩家隐私数据。

本地 2026-07-28 新增的主要证据入口：

- `docs/runbooks/foundry-v14-native-adventure-workflow.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/red-dream-adventure-pilot-report.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/chapter-6-adventure-report.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/remaining-chapters-adventure-report.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/bullywug-post-archive-memory-test.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/combat-jank-root-cause-20260728.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/tah-vs-argon-performance-20260728.md`
- `docs/reviews/2026-07-28-fvtt-sequencer-native-memory-runtime-probe.md`
- `docs/reviews/2026-07-28-fvtt-resident-memory-attribution.md`
- `docs/reviews/2026-07-28-fvtt-resident-memory-priority-investigation.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/animation-stack-three-way-memory-ab-20260728.md`
- `.local/foundry-v14/evidence/cor-cotn-chapter-archive-20260728/remaining-chapters-final-state.json`
- `.local/foundry-v14/evidence/fvtt-native-memory-probe-20260728.json`
- `.local/foundry-v14/evidence/fvtt-resident-memory-probe-20260728.json`
- `.local/foundry-v14/evidence/fvtt-resident-memory-priority-investigation-20260728.json`
- `.local/foundry-v14/evidence/animation-stack-three-way-ab-20260728.json`

## 11. 2026-07-28 执行检查点

当前执行 ID：

```text
20260728-220757+0800
```

本计划落地时新增的一次性三方审计和候选构造工具只允许上述执行 ID。其模块状态
裁决冻结为 2026-07-28 主迁移现场状态，不是当前生产模块配置；任何后续迁移必须
重新生成归属表和候选，不得复用这组历史裁决。

状态：`Partial`。机械迁移、短程 GM/非 GM 语义验收和本地生产前快照复原演练已通过；
同一 PID/浏览器会话完成 30 分 21.893 秒连续受控观测，性能累积指标通过，但
FXMaster 8.2.4 场景退出清理异常可重复，因此该层运行时清洁度仍为 `Partial`。
约 4 小时真实跑团尚未开始。按本计划第 9 节，在真实跑团通过前不得声明完整 `Pass`。

已完成：

- 现场重新确认 8080 仍为 Foundry `14.364`、dnd5e `5.3.3`、
  `E:\Bill\v14` / `E:\Bill\fvtt_v13\data` / `cor-cotn`；
- 远端 `E:` 在预上传后仍有 `11,476,979,712` bytes 可用，本地 `I:` 明显超过
  `10 GiB` 门槛；
- 冻结本地候选世界：1,699 文件、673,052,684 bytes、整树 SHA-256
  `dca2dae809fbd547e7c606bddca0089c1ea9f2012d146e7f5468f9814af9d6cc`；
- 将世界、Map Image Optimizer Bridge、Chat Memory Guard、Sequencer、
  Simple Cover 5e 和 Hide NPC Names 上传到远端非扫描暂存目录，并完成
  1,924 个文件的本地/远端逐文件哈希对账，差异为 0；
- 证明 AutoAnimations 和 Monks Bloodsplats 线上/本地整树一致，因此不重复覆盖；
- 将 Map Image Optimizer Bridge 裁决为“包体随世界部署、默认禁用”：本地最终
  `core.moduleConfiguration` 为 false，启用时会在每个 GM `ready` 重新加载并解码
  最新计划的 351 张输出图；它是迁移/回滚工具，不是常驻运行依赖；
- 捕获密码为空的非 GM `SY` 运行时白名单基线后正常登出，当前 `/join` 显示
  0 个在线玩家；
- 新增可审计三方 LevelDB 差异工作流。控制烟测覆盖 67,735 条记录，在
  “生产=2026-07-24 共同基线”的条件下得到 0 个冲突；36 个相关测试以及
  `typecheck:production` / `typecheck:all` 通过。

后续执行结果：

- GM 正常返回 Setup，Foundry 内置世界备份已创建；
- 精确停止 8080 后取得本地生产前一致性快照，世界为 2,281 文件、
  1,779,692,729 bytes，整树 SHA-256
  `fadcf488e6fe28f6711572864af87c3dca304aea4321b53701918f8ba293d480`；
- 真实三方差异按归属构造最终候选，没有未裁决冲突；最终世界为 1,704 文件、
  677,992,402 bytes，整树 SHA-256
  `345f934b2970c31d1d3feef72107300da6fed71833378ec76672b8960f085454`；
- 旧世界和三个旧模块已同卷移动到
  `E:\Bill\fvtt_v13\data\.migration-rollback\20260728-220757+0800`，正式世界与
  五个部署模块的切换后逐文件差异为 0；
- `5e-dlc-monster` 因许可未确认而明确排除，未上传、未安装、未启用；
- Bridge 包体已部署但按裁决保持禁用；Chat Memory Guard 已启用；
- GM 与 `SY` 完成短程世界、Scene、Token、Actor/Journal、攻击/伤害、动画、
  Simple Cover、Bloodsplats、Hide NPC Names、Chat Memory Guard 和客户端设置边界
  验收；
- 七个 Adventure 均成功载入；最小第七章完成导入—检查—按精确 ID 删除，且
  `core.adventureImports` 恢复为导入前值；
- 生产前快照已在一次性本地 DataPath 使用 Foundry `14.364` / dnd5e `5.3.3`
  启动，GM 登录、7 个用户、权限投影、角色绑定、原 67 个启用模块和顶层文档计数
  均通过；归档原件没有直接启动；
- 为复原演练补齐两个含 LevelDB 的 Czepeku 模块时，先确认只有本次 GM 在线，再
  正常卸载世界、精确停服离线下载；8080 离线约 62 秒，随后用原入口恢复，51020
  前后均未变化；
- 公网 HTTP 不是 secure context，Sequencer Spritesheet Generator 的第三任务排队
  不能在线验收；当前只有锁定源码 7→2 的机械证明，不能把它写成完整运行时通过。
- 30 分钟连续观测中，Heap、DOM/CDP Node、Listeners、Worker、纹理和服务器内存
  没有单调积累；Worker 首轮由 10 预热到 18 后保持不变，纹理估算保持
  415,510,913 bytes。第三、四轮从重场景返回时，未替换的 FXMaster 8.2.4 均成对
  抛出 compositor `clear` TypeError；Canvas、HTTP 和清理状态保持正常。由于迁移前
  没有同路径捕获，不能证明是迁移新增，也不能把连续观测写成零错误 `Pass`。

当前仍未关闭的门槛：

- 用户完成约 4 小时真实 GM + 玩家跑团；
- 在 HTTPS 或 localhost secure context 下补 Sequencer Spritesheet Generator
  队列验收，或明确继续接受公网 HTTP 下该功能不可用。
- 对可重复的 FXMaster 场景退出清理异常做独立定责和处置。

私有证据位于：

```text
.local/foundry-v14/evidence/production/20260728-220757+0800/
```

其中完整三方记录含世界数据，只保留在忽略目录；跟踪文档不复制玩家隐私或许可内容。
完整执行分层结论见
[`2026-07-28-cor-cotn-production-migration-report.md`](../runbooks/2026-07-28-cor-cotn-production-migration-report.md)。

### 2026-07-29 可选功能补充部署

主迁移窗口中 `5e-dlc-monster` 因许可未确认而排除的记录保持为当时事实。用户随后
单独确认并批准了以下补充部署，执行 ID 为 `20260729-013252+0800`：

- 上传血猎手活动 JSON，供用户之后通过 Plutonium 自定义导入；本次不导入、不做
  血猎手内容或玩法验收；
- 不新建备份，直接部署已在本地验证的 Plutonium `2.15.6` Quick Insert 精确补丁；
- 安装并启用已修复至 Foundry v14 的 `5e-dlc-monster` `1.2.0`。

补充部署后，DLC 模块在 `cor-cotn` 中为 active，两个 Actor 合集分别读取 969 和
278 条索引；血猎手 JSON 与 DLC 清单 URL 均返回 HTTP 200；8080 世界 ready，51020
未受影响。完整哈希、进程、容量、日志和验收边界见执行报告第 12 节。
