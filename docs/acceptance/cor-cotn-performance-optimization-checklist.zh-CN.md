# cor-cotn 长时游玩性能优化 Checklist

最后更新：2026-07-27
目标运行时：Foundry VTT 14.364、dnd5e 5.3.3
目标世界：`cor-cotn`

## 1. 最终目标

本项目的最终验收不是“世界能启动”或“内存某一刻较低”，而是：

- 玩家连续游玩约 4 小时，不需要每 30～45 分钟刷新页面；
- 可以接受 2～3 小时后出现轻微卡顿，并通过一次刷新释放客户端内存；
- 连续经历 2～4 张地图、多个战斗轮次、先攻、攻击、法术、状态、动画和 Token
  移动后，客户端仍可正常操作；
- Scene 切换、Token/动画删除和战斗结束不产生持续重复的前端异常；
- 返回轻量 Scene 并等待后，内存、DOM、监听器、Workflow、Effect 和纹理缓存能够
  明显回落，而不是每轮单调增加。

## 2. 验收层级

每一个优化项必须分别记录：

- `实施状态`：未开始、进行中、已实施、已回滚；
- `机械验证`：设置、版本、数量、哈希或命令是否符合预期；
- `短程行为验收`：真实操作路径是否正常；
- `长时验收`：30～50 分钟受控循环及 4 小时真实跑团是否通过；
- `环境`：仅本地、线上已同步或两者都已验证；
- `证据`：对应快照、采样、错误日志、恢复记录或人工观察。

“已实施”不能替代“长时验收通过”。

## 3. 当前基线摘要

最近一次完整世界快照：

- `.local/foundry-v14/evidence/cor-cotn-performance/snapshots/2026-07-26-current-world.json`

该文件仍是最近一次同一时点完整快照，但不是 2026-07-27 迁移时的精确现状。后续
运行时已观察到文档和聊天数量继续变化；正式同步前必须生成新的完整冻结快照。

### 3.1 世界内容

| 指标 | 2026-07-24 原始审计 | 2026-07-26 当前 | 变化 | 状态 |
|---|---:|---:|---:|---|
| Actor | 771 | 516 | -255 / -33.1% | 已实施 |
| Journal | 415 | 78 | -337 / -81.2% | 已实施 |
| Journal Page | 734 | 246 | -488 / -66.5% | 已实施 |
| Scene | 295 | 252 | -43 / -14.6% | 已实施 |
| Scene Token | 2,836 | 2,667 | -169 / -6.0% | 已实施 |
| ChatMessage | 335 | 352 | +17 / +5.1% | 7 月 26 日快照；文档不删除，客户端 DOM 已有守卫 |
| 启用模块 | 87 | 68 | -19 / -21.8% | 已实施，需版本复核 |

说明：ChatMessage 在该快照时比原审计多 17 条。删除服务器日志与删除世界
ChatMessage 不是同一件事。2026-07-27 的 Chat Memory Guard 只限制已渲染聊天卡
DOM，不删除或改写世界消息；后续仍必须分别观察消息文档数量、DOM、缩略图缓存和
MIDI Workflow 累积。

### 3.2 当前客户端观测点

本次不是冷启动，也不是长时验收，只是建立后续对比锚点：

| 指标 | 当前值 |
|---|---:|
| Runtime Heap Used | 760,604,896 bytes |
| Performance JS Heap Used | 749,229,044 bytes |
| JS Heap Total | 965,386,240 bytes |
| DOM Nodes | 47,559 |
| JS Event Listeners | 10,060 |
| Documents | 34 |
| Frames | 35 |
| Resources | 1,236 |

当前可视 Scene 为 `B5.狂蛙人洞穴Bullywug Cave`：61 墙、12 Token、0 Tile、
0 灯。该数据只能用于确认采样链可用，不能据此判断长期内存是否合格。

### 3.3 地图图片

Map Image Optimizer 2.1 全量应用时曾达到：

- 361 张不同优化图；
- 408 条 Scene/Level/Tile 优化引用；
- 220 个 Scene 使用优化图。

2026-07-26 当前实时世界重新统计为：

- 268 张不同优化图；
- 310 条优化引用；
- 132 个 Scene 使用优化图；
- Scene/Level/Tile 图片引用共 442 条；
- 世界自有引用 399 条、模块资源 40 条、远程资源 1 条。

这说明后续“低收益/明显模糊地图恢复原图”的工作已经实际落地，但旧的
`Map Image Optimizer 2.1 验收记录`没有同步为当前最终状态。今后以本清单和时间戳
快照为当前状态入口，MIO 的全量记录保留为历史实施证据。

## 4. 已完成或已经实施的优化

### A. 静态世界内容

- [x] Actor 从 771 降到 516。
- [x] Journal 从 415 降到 78。
- [x] Journal Page 从 734 降到 246。
- [x] Scene 从 295 降到 252。
- [x] Scene Token 总量降低。
- [ ] 重新审计当前缺失 Actor 引用和已删除 Actor 对 Scene Token 的影响。
- [ ] 判断保留的 19 个 Combat 文档是否仍有业务价值；本阶段不删除。
- [x] 已把 ChatMessage 文档数量与聊天卡片 DOM 分开评估，没有把服务器日志删除
  当作完成。
- [x] Chat Memory Guard 已完成短程 GM/非 GM A/B；原 510 条消息指纹保持一致，
  测试后仅新增一条真实豁免消息。
- [ ] 在 30～50 分钟和 4 小时会话中继续观察消息文档、聊天 DOM 与第三方卡片兼容。

### B. 地图纹理

- [x] 建立独立 Map Image Optimizer。
- [x] 生成带 XMP、哈希、登记表和恢复记录的 WebP。
- [x] 通过 Bridge 只替换 Level 背景/前景与 Tile 图片路径。
- [x] 保持 Scene 尺寸、网格、墙、灯、Token 和 Tile 几何不变。
- [x] 根据低像素收益和 SSIM 分析恢复部分小图原图。
- [x] 当前实时引用重新统计：268 张不同优化图、310 条引用。
- [x] 1,080 张当前未引用场景图移到 `server-mirror` 外的可恢复归档，世界目录减少
  1,733,210,505 bytes；迁移后第二次 dry-run 候选为 0。
- [x] 356 个现存世界内地图路径通过 HTTP HEAD；另有两条迁移前已经缺失的 Level
  背景引用，未被本轮伪造替换。
- [ ] 在长测中同时记录当前 Scene 的解码像素估算和切图耗时。
- [ ] 验证连续切换大图后纹理缓存是否回落。

### C. 模块与运行时设置

- [x] 当前启用模块从早期 87 个降到 68 个。
- [x] MIDI-QOL `Debug = none`。
- [x] MIDI-QOL `Save to Chat Card = true`。
- [x] MIDI-QOL `Use Weak References for Workflows = true`。
- [x] Sequencer `debug = false`。
- [x] Automated Animations `debug = false`。
- [x] Automated Animations 7.0.17 源码语义已纠正：`killAllAnim = on` 才表示自动
  动画启用，`off` 表示禁用；2026-07-28 A/B 恢复复验记录为 `on`。
- [x] Core Performance Mode 当前为 `2`。
- [x] Chat Memory Guard 已安装启用；世界默认保留 40 条已渲染消息、token 缩略图
  128px、WebP 质量 75。
- [x] Sequencer 4.2.3 已应用 7→最多 2 个 spritesheet Worker 的可回滚上限补丁。
- [ ] 在测试开始前冻结并保存完整启用模块 ID/版本。
- [ ] 确认所有测试客户端的客户端级设置一致；世界级设置一致不代表客户端级设置一致。
- [x] Sequencer 补丁已完成 20 次真实 Automated Animations 播放，并在后续逐页
  resident 审计中确认两个 WASM committed 区域各约 `1.15 MiB` resident。

### D. 已知生命周期修复

- [x] Monk's Bloodsplats 14.01 本地生命周期守卫仍在，当前 JS 哈希为
  `8C6F677EC96A464A213797419B9CEBDEFFEB913C6EB2E34A7B5703428A78E491`。
- [x] Automated Animations 7.0.17 持久模板在来源 Token 存在时调用
  `tieToDocuments(sourceToken)`，降低来源删除后的残留风险。
- [x] Hide NPC Names 1.3.4 本地文件包含无 Actor/无 `prototypeToken` 的回退保护。
- [x] Simple Cover 5e 已升级为本地修订版 `2.2.0-cor-cotn.1`，按 Actor UUID
  串行化固定 ID Effect 创建；10 路并发和正常攻击链均通过本地验收。
- [ ] 模块更新后重新检查三个本地文件哈希和补丁语义，防止更新覆盖。
- [ ] 将删除 Token、删除持久模板、结束动画和切 Scene 纳入受控测试。

## 5. 总体执行路线

### 里程碑 1：统一清单与当前状态快照

状态：`已完成`

- [x] 建立本文件作为长期状态入口。
- [x] 建立 `.local/foundry-v14/evidence/cor-cotn-performance/`。
- [x] 采集当前世界文档数量、模块、关键设置、地图引用、客户端性能和服务端进程。
- [x] 明确当前地图引用已经不同于 MIO 2.1 全量应用时点。
- [x] 不修改任何 Scene、Actor、Combat、ChatMessage 或世界设置。

### 里程碑 2：准备可重复的战斗场景

状态：`等待用户准备`

建议至少准备：

- 一张轻量初始化/Landing Scene；
- 战斗 Scene A：多玩家角色与 NPC，强调攻击、法术、状态和动画；
- 战斗 Scene B：与 A 不同的压力结构，优先包含较多灯光、墙、Token 或 Tile；
- 所有测试 Token 有可用 Actor、先攻和至少一种明确的主要攻击/法术；
- 允许创建测试 Combat、ChatMessage、临时效果和移动 Token；
- 明确测试应在当前本地世界还是独立克隆世界执行。

用户准备后，先做只读预检：列出 Scene、Token、Actor、主要 Activity、权限、图片、
墙、灯、Tile 与预计触发模块。预检不执行攻击。

### 里程碑 3：30～50 分钟受控循环测试与根因判断

状态：`进行中；首轮受控战斗已完成但未通过，已进入根因隔离`

测试按真实节奏进行，不使用机器速度连续点击：

1. 轻量 Scene 稳定基线；
2. Scene A：全员先攻、逐个行动、主要攻击/法术、Token 移动，约 3 轮；
3. Scene B：重新建立战斗并重复；
4. A/B 间再切换一轮；
5. 返回轻量 Scene，等待 60～90 秒观察回落。

每 10 秒采样，并在 Scene、Combat、Round、Workflow、Effect 和错误事件处增加标记。
第一轮可以提前结束：如果已出现明确、可重复且证据完整的单一异常，不为凑满 50 分钟
继续制造无意义负担。但如果只是内存升高而没有回落样本，不能提前判定泄漏。

首轮暂定判断线，测试后根据真实波动校准：

- 返回轻量 Scene 90 秒后，Heap、Nodes、Listeners 不应每轮单调增加；
- 相对稳定基线，恢复点 Heap 暂不应长期高出超过 `+25%` 或 `+300 MB`；
- Nodes/Listeners 恢复点暂不应长期高出超过 `+25%`；
- 不应持续增加 MIDI Workflow、Sequencer Effect 或重复相同生命周期异常；
- 页面不应出现无法操作、Scene 无法完成加载或必须刷新才能继续。

### 里程碑 4：模块分组 A/B 与针对性修复

状态：`进行中；Simple Cover 已完成针对性修复，Sequencer 与聊天内存缓解已实施`

只有里程碑 3 出现可重复累积后才执行：

1. 核心 + dnd5e + 最小必要模块；
2. 加入 MIDI-QOL/DAE；
3. 加入 Sequencer/Automated Animations/JB2A；
4. 加入 Vision、Bloodsplats、Dice So Nice 等视觉模块；
5. 加回 UI/QoL 模块。

每次只改变一组，重复最短能复现问题的操作单元。修复后必须回跑同一单元，不以
“错误不再打印”替代真实操作验收。

### 里程碑 5：轻量真实跑团监控与 4 小时验收

状态：`生产迁移短程验收和 30 分钟连续观测已完成；4 小时真实跑团未开始`

- [ ] 制作客户端轻量监控模块。
- [ ] 10 秒采样，不截图、不抓完整 Heap Snapshot、不持续写世界 LevelDB。
- [ ] 本地 IndexedDB 保存，刷新后可继续同一 Session。
- [ ] 记录匿名性能指标、Scene/Combat事件和错误，不记录聊天正文、骰值、Actor正文、
  Cookie、密码或玩家输入。
- [ ] GM 可添加“玩家报告卡顿”标记。
- [ ] 跑团结束导出 JSON，再由报告工具分析。
- [ ] 最终以真实 4 小时 GM + 玩家会话验收本文件第 1 节目标。

## 6. 当前未证明的事项

- 当前 68 模块配置已完成 30 分 21.893 秒同 PID/浏览器连续观测；性能累积指标通过，
  但运行时清洁度因 FXMaster 8.2.4 场景退出清理异常可重复而保持 `Partial`。
- 早期约 754～761 MB 的单点已被 11 个连续样本替代；它仍不是 4 小时增长曲线。
- 浏览器 Console 在第三、四轮返回轻场景时各捕获两次 FXMaster compositor
  `clear` TypeError。异常非致命且 FXMaster 未在本次迁移中替换，但迁移前没有同路径
  捕获，不能声称它是既有问题或零错误通过。
- JS Heap 不能覆盖全部 GPU/纹理内存。
- GM 单客户端测试不能完全替代真实玩家电脑和多人并发。
- 服务器健康不能证明玩家浏览器没有泄漏。
- Sequencer 7→2 补丁只有代码、磁盘和 HTTP 机械证据；真实 WebM 触发、两个 WASM
  区域和补丁后 renderer 内存仍未证明。
- Chat Memory Guard 的短程 GM/非 GM 验收不能外推为全部第三方聊天卡或 4 小时
  跑团的绝对内存上限。
- [x] 本地世界、批准模块和补丁已按最终迁移文档同步到生产 8080；机械迁移和
  短程 GM/非 GM 验收通过；完整状态仍受 4 小时跑团、secure-context Spritesheet
  验收和 FXMaster finding 约束。

## 7. 证据索引

- 原始世界审计：
  `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/`
- 当前性能快照：
  `.local/foundry-v14/evidence/cor-cotn-performance/snapshots/`
- 后续受控测试：
  `.local/foundry-v14/evidence/cor-cotn-performance/controlled-runs/`
- 后续真实跑团：
  `.local/foundry-v14/evidence/cor-cotn-performance/live-sessions/`
- 本地优化历史：
  `docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md`
- Chat Memory Guard 运行时验收：
  `docs/acceptance/chat-memory-guard-runtime-report.zh-CN.md`
- Sequencer Worker 归因与实施：
  `docs/reviews/2026-07-26-fvtt-chrome-4.2gb-memory-attribution-report.md`
  和 `docs/reviews/2026-07-26-sequencer-spritesheet-worker-memory-cap-report.md`
- 未使用场景图归档：
  `.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/`
- 最终生产迁移入口：
  `docs/plans/2026-07-27-cor-cotn-production-migration.md`
- 地图优化项目：
  `I:\OpenCode\map-image-optimizer`

## 8. 2026-07-26 首轮受控战斗结果

状态：`流程完成，但性能验收不通过；进入根因隔离`

- [x] 残纱沼泽建立本轮稳定基线。
- [x] B4 破败哨塔 10 个 Token 全员先攻并完成 3 轮共 30 次行动。
- [x] B4 战斗结束，所有测试移动的 Token 恢复原坐标。
- [x] 叛神殿仅 4 个魅魔与 5 个玩家角色加入战斗。
- [x] 叛神殿完成 3 轮共 27 次行动，战斗保留在第 3 轮。
- [x] 返回残纱沼泽；叛神殿 Combat 仍为 active，9 个 Combatant 未改变。
- [x] 每 10 秒采样，并在 Scene、Combat、Round、Activity 与错误处添加标记。
- [ ] 长时性能验收通过。

首轮发现：

1. MIDI Workflow `0 → 31 → 58` 单调增加；返回残纱沼泽后 58 个 WeakRef
   仍全部存活。
2. `simplecover5e` 反复创建固定 ID `dnd5ecoverTotal0`，产生 13 次可重复的
   未处理异常，影响 Actor 与 ActorDelta。
3. B4 曾同时存在 32 个未处理的攻击/伤害掷骰配置窗口，证明该 UI/Workflow
   链路会快速扩大 DOM；本轮已关闭所有测试生成窗口。
4. 叛神殿存在无效资源引用：
   `assets/srd5e/img/bestiary/tokens/MPMM/Tanarukk.webp`。

## 9. 2026-07-26 根因隔离更正与纹理缓存发现

状态：`最短复现单元已定位；首轮纹理资产整理已完成，等待新基线受控复跑`

上一轮结论需要按本轮证据更正：

- [x] 使用 1 个攻击者、1 个目标，逐次完整完成 5 次攻击骰和伤害骰。
- [x] simplecover5e 开启和关闭各完成一组，合计 10 次。
- [x] 10 张聊天卡全部到达 `WorkflowState_Completed`。
- [x] 两组均未复现 `dnd5ecoverTotal0` 重复 ID。
- [x] 证明上一轮 58 个活 Workflow 主要来自未完成的并发投骰窗口，不能代表正常玩家流程。
- [x] 完成不含战斗操作的 `沼泽 → B4 → 沼泽 → 叛神殿 → 沼泽` 纯切图对照。
- [x] 返回沼泽并等待 30 秒后，JS Heap 回落，但 PIXI 解码纹理估算未回落。
- [x] 模块配置逐项恢复；simplecover5e 已重新启用。
- [x] 叛神殿 Combat、Token 坐标、Actor、HP 和 Scene 数据未改变。

纹理缓存关键数据：

| 节点 | 解码纹理估算 |
|---|---:|
| 沼泽基线 | 168,951,276 B |
| B4 | 298,929,660 B |
| 返回沼泽 | 298,929,660 B |
| 叛神殿 | 449,752,608 B |
| 再返回沼泽 30 秒后 | 449,752,608 B |

当前判断：

1. `simplecover5e` 的重复 ID 仍是真实并发竞态嫌疑，但不是正常顺序攻击的稳定复现项。
2. 地图切换后的确定性累计项是 PIXI Assets 中的背景、Token 和 Subject 解码纹理。
3. 地图背景优化有效，但只优化背景不足以解决 3～4 Scene 后的总页面占用。
4. 下一步先建立 Scene 总纹理压力清单，并优先处理 2048×2048 等超大 Token/Subject；
   之后才在本地克隆世界验证“仅卸载上一 Scene 独占纹理”的安全方案。

证据：

- `.local/foundry-v14/evidence/cor-cotn-performance/controlled-runs/2026-07-26-combat-completion-texture-cache-isolation-summary.json`
- `.local/foundry-v14/evidence/cor-cotn-performance/controlled-runs/2026-07-26-combat-completion-texture-cache-isolation-report.zh-CN.md`

### Simple Cover 5e 修复状态

- [x] 根因定位为同一 Actor 的异步 check-then-create 竞态。
- [x] 在模块内部实现按 Actor UUID 串行化；没有修改 Foundry 核心。
- [x] Node 回归测试 `4 pass / 0 fail`。
- [x] 本地 Foundry 重启后实际加载 `2.2.0-cor-cotn.1`。
- [x] B4 ActorDelta 10 路并发写入只创建一个固定 ID 效果。
- [x] 测试效果已删除，原状态保留，Console duplicate-ID error 为 0。
- [x] 正常攻击与伤害链到达 `WorkflowState_Completed`。
- [x] 模块目录已作为将来整包同步线上的部署来源。
- [ ] 上游 ESLint 环境未通过：锁定依赖已无法从 npm 获取。
- [x] 已同步线上；生产 `2.2.0-cor-cotn.1` 完成 10 路并发单 Effect 验收，并在
  同一短程验收中完成真实攻击/命中/伤害聊天卡链。
5. 同次运行的残纱沼泽基线到最终稳定点：
   Heap `+12.89%`，页面元素 `+47.06%`，ChatMessage `+93`，Workflow `+58`。

因此不能因 Heap 尚未超过 `+25% / +300 MB` 临时线而判定通过。当前最小下一步是
在已完成的 Simple Cover 修复基础上重新运行受控链路，并把 Sequencer Worker 上限、
Chat Memory Guard 和世界图片归档纳入同一次新基线。旧的“先做 Simple Cover
1 攻击者 + 1 目标 A/B”已经由后续并发修复与正常攻击验收取代，不再是当前下一步。

证据：

- `.local/foundry-v14/evidence/cor-cotn-performance/controlled-runs/2026-07-26-b4-betrayers-3round-summary.json`
- `.local/foundry-v14/evidence/cor-cotn-performance/controlled-runs/2026-07-26-b4-betrayers-3round-report.zh-CN.md`

## 10. 2026-07-27 本地缓解与迁移准备补录

状态：`三项已实施；Sequencer 动画运行时已复验，native 细分和长时整体目标仍未通过`

### Sequencer spritesheet Worker 上限

- [x] 4.2 GB 归因确认七个 299,958,272-byte WASM Worker 区域合计约
  2002.4375 MiB，是当时最主要且精确闭合的固定内存来源。
- [x] Sequencer 4.2.3 精确版本补丁将 Worker 计算限制为最多 2。
- [x] 补丁器具备版本/源码形状守卫、相邻备份、哈希、幂等、原子替换和 restore。
- [x] 磁盘和 HTTP 提供的 bundle 哈希一致。
- [x] 已认证 GM 会话中通过 Automated Animations 公共 API 完成 20 次真实动画播放，
  任务全部完成，补丁不再停留在“只看代码和 HTTP”。
- [x] 旧运行时审计观察到两个 Worker 合计约 `572 MiB` committed；当前 4.2.3
  源码只构造两个常驻解码 Worker，但 committed 不等于物理 RAM。
- [x] 后续已通过 `K32QueryWorkingSetEx` 逐页取得两个 WASM 区域的 resident 明细：
  各约 `1.15 MiB`，从而纠正“两个 Worker 实际占用约 572 MiB RAM”的旧印象。
- [ ] Sequencer 私有 WebM Blob cache 的实时 bytes/count 尚未暴露；500 MiB 只是源码
  硬上限，不能冒充当前实占。

### 未引用场景图归档

- [x] 在停止本地 30001 后，从只读一致性副本分析当前世界引用。
- [x] 初次 1,080 张全量归档的机械校验通过，但用户真实运行发现 MIO 动态输出 404，
  已明确判定语义失败并完整恢复 1,080/1,080。
- [x] 选择性重做后，93 张最新 MIO 计划输出和 1 张 `world.json.background` 留在世界，
  986 张、1,707,922,202 bytes 保留在 `server-mirror` 外的可恢复归档。
- [x] 已认证世界和 B5 场景/战斗能够正常进入，没有再次发现该归档造成的启动级 404。
- [ ] 仍需在长时多场景会话中确认没有动态路径或低频模块引用遗漏。

### Chat Memory Guard

- [x] 本地安装启用，默认只保留底部 40 条已渲染消息。
- [x] GM A/B、历史重新渲染、真实 MIDI 卡片、sidebar/popout 和监听器释放通过。
- [x] 原 510 条消息 ID、内容和 speaker 指纹不变；只新增一条真实测试消息。
- [x] 非 GM OBSERVER 权限、隐藏头像、sender 保留和缓存清空通过。
- [ ] 4 小时跑团及全部第三方聊天卡兼容继续由用户实际观察。

### 迁移边界

- [x] 迁移前重新冻结本地和生产同一时点的世界、模块、设置、路径和哈希。
- [x] 通过三方归属合并保留生产端 2026-07-22～23 已有维护结果，没有整包盲覆盖。
- [x] 性能迁移与 Plutonium/Blood Hunter 功能迁移分开；后者没有夹带进本次生产
  迁移。

## 11. 2026-07-28 Adventure、战斗卡顿与原生内存补录

状态：`章节归档与短程可玩性通过；Adventure 性能收益未证明；长时玩家会话仍未通过`

### 原生 Adventure

- [x] 建立世界级 `world.cor-cotn-chapter-archive`，包含七个独立 Adventure：
  红梦密会、第四章、第四点五章、第五章、第六章、第七章、妖精荒野。
- [x] 每章完成原生创建、精确剥离、原生导入恢复、实际 Canvas/Actor 语义检查和最终
  再剥离。
- [x] 最终快照中七章 Adventure 的 Scene/专属 Actor ID 与世界文档交集均为 0。
- [x] 既存 missing Actor Token 没有新增；已有名称、图像和位置占位保留。
- [x] 已记录原生导入的非字节级规范化：元数据变化、linked 空 Delta 变为 `null`。
- [x] 已记录第六章一个、妖精荒野两个 Token 的 `delta.name` 兼容加固。
- [x] 妖精荒野两个已失效 `terrainmapper.setTerrain` Behavior 按用户授权精确删除；
  Region/shape 保留，未自动创建替代行为，导入后旧 Behavior 未复活。
- [x] 正式迁移后重新读取 Pack，确认七个 Adventure 均可载入；选择最小第七章并在
  导入前确认 Folder/Scene ID 与世界零交集。
- [x] 第七章完成 create-style 导入—检查—恢复；没有对已有同 ID 内容执行覆盖式
  导入。测试创建的 1 Folder/2 Scene 已按精确 ID 删除，`core.adventureImports`
  恢复为导入前值。

### Adventure 的性能结论

- [x] 红梦密会单章剥离 A/B 已完成：可比内存、帧间隔和 Long Task 没有改善。
- [x] 全部章节归档后的 B5 战斗可玩：空闲约 144 FPS、无 Long Task，JS heap 没有
  随三轮战斗单调增长。
- [x] 明确区分“Adventure 恢复可靠”与“Adventure 降内存有效”；前者通过，后者没有
  被当前 A/B 证明。
- [x] 不再把继续归档 Actor/Scene 作为 3 GB Chrome 内存的首要优化路线。

### Combat Tracker、Monk 与 HUD

- [x] Monk's Combat Details：
  `select-combatant=false`、`opencombat=none`、`popout-combat=false`、
  `auto-scroll=false`、`pan-to-combatant=true`。
- [x] 自动动画保持 active；没有通过禁用 Automated Animations 获得测试结果。
- [x] 在相同 `select-combatant=false` 条件下重测 TAH 与 Argon，TAH 的纯换回合、
  真实点击和换回合后手动选中均更快。
- [x] 保留 TAH Core/dnd5e；Argon Core/dnd5e 已移出模块扫描目录并保留可恢复副本。
- [ ] 在当前最终配置下重新抓换回合 CPU profile，拆分残余约 56～73 ms 的
  Hook/ApplicationV2/UI 成本。

### Sequencer、TextureLoader 与 Chromium native memory

- [x] 两个 32 GiB 外层地址范围已高置信度识别为 Chromium
  PartitionAlloc/GigaCage 分配池容器；reserved 不等于同等 RAM。
- [x] Sequencer 4.2.3 源码确认 WebM Blob LRU cache 硬上限 500 MiB。
- [x] 两个常驻 Sequencer 解码 Worker 的旧 `VirtualQueryEx` 结果合计约 572 MiB
  committed；后续逐页结果确认实际 resident 合计约 2.3 MiB。
- [x] Foundry TextureLoader 当前实测约 254.094 MiB，`CACHE_TTL=15 分钟`。
- [x] 20 次 AA 动画后 TextureLoader、PIXI cache、DOM、持久 Effect 和 JS heap 无
  累积；renderer native private 出现约 168 MiB 首次资源高水位。
- [x] 完成三组完整 Chrome 重启 A/B：当前动画栈全开、运行时关闭但保留 JB2A、全部
  关闭；三组均使用同一 B5 Scene、同一热身和同一 3 次攻击/5 次换回合正式负载。
- [x] 运行时关闭但保留 JB2A 后，Chrome Working Set 减少 `274.80 MiB / 10.50%`，
  Chrome private 减少 `1029.84 MiB / 28.35%`。
- [x] 上述 private 差值拆分为 Renderer `-626.02 MiB`、GPU `-374.71 MiB`；
  JS heap 只减少 `38.79 MiB`，WorkerGlobalScopes 从 18 降至 16。
- [x] 再关闭 JB2A 没有继续降低 TextureLoader、Worker 或进程内存；当前不把 JB2A
  资源包定责为 GiB 级来源，也不建议为性能删除它。
- [x] 三组帧 P95 均为 `7.6 ms`，Long Task 总时长 `444 / 553 / 479 ms`；本轮没有
  证明关闭自动动画能稳定改善短战斗卡顿。
- [x] 测试后完整重启 Chrome，确认 Sequencer、AA、D&D5e Animations、Automated
  Evocations、JB2A 全部恢复 `configured=true / active=true`。
- [x] 纠正 resident 口径：各 Chrome 进程 Working Set 求和会重复计算共享页，后续
  以 `Working Set - Private` 作为主要唯一驻留 RAM 指标。
- [x] 当前只读复测：Chrome Private Working Set 合计约 `1.93 GiB`，其中 Foundry
  Renderer 约 `1.20 GiB`、GPU 进程约 `449 MiB`。
- [x] 使用 `K32QueryWorkingSetEx` 逐页确认两个 Sequencer/WASM committed 区域
  实际 resident 各约 `1.15 MiB`；约 `572 MiB` 是 commit，不是当前物理 RAM。
- [x] 完整枚举 `0x136C00000000` 的 AllocationBase，确认它是精确 `32 GiB` 的
  第二个 Chromium PartitionAlloc/GigaCage 系列地址池，而不是约 `283 MiB`
  Foundry/模块匿名单体；容器身份已闭合。
- [x] 逐页复测 Renderer 三大 resident 组：V8 cage `407.81 MiB`、PartitionAlloc
  pool A `402.07 MiB`、pool B `266.02 MiB`，合计解释 Renderer PWS 的 `92.54%`。
- [x] 将 pool A 的三个大 resident commit 与 4096² token-ring、2508² Scene
  背景、2048² 角色图的解码像素尺寸逐页对应；确认图片 backing 是 pool 的实质载荷
  之一，但不把全部 `668.09 MiB` pool resident 偷换为图片。
- [x] 枚举 Pixi/WebGL 资源：Renderer 侧 121 个 BaseTexture 解码 RGBA 等效约
  `192.30 MiB`；GPU 侧 58 个 managed texture 按真实格式计算 base-level
  `230.48 MiB`，其中 13 个 RenderTexture `111.09 MiB`。
- [ ] 在独立 profiling session 中启用 native heap profiler/memory-infra，按
  allocation stack 分解两个 PartitionAlloc pool 的 live allocation、缓存和碎片；
  当前不得把完整 pool 归罪于单个模块。
- [ ] 在允许强制 GC 的独立测试中获取 V8 heap snapshot，按 retained size 检查
  Document、Actor、Item、ChatMessage、Application、module cache 和 closure；
  快照结果不得冒充无扰动 resident 基线。
- [ ] 只开 Foundry 单标签隔离 GPU 进程，避免 Bilibili 等其他标签污染 GPU PWS，
  再定责 13 个 RenderTexture 的 core/module 所有者。
- [ ] 增加只读 Sequencer Blob cache count/bytes 诊断；在看到实际值之前不修改
  500 MiB 上限。
- [ ] 对三张不同重型 Scene 记录切换后 0/5/15/20 分钟的 TextureLoader、renderer、
  GPU 与 Chrome 曲线，确认 15 分钟 TTL 是否造成可感知高水位。
- [ ] 只有上述 A/B 证明收益后，才选择以下单一最小变更：
  - Sequencer Blob cap 按客户端设为 128/256/500 MiB；
  - 玩家端 Worker=1、GM 端保持 2；
  - 缩短 TextureLoader TTL 或在安全 Scene 切换点主动清理非当前纹理。
- [ ] 不同时修改 Blob cap、Worker 数和 Texture TTL，避免失去归因。

### 不修改源码的下一轮候选与边界

- [x] Quick Insert 当前运行时 `searchLib === null`、`hasIndex === false`；Duplicate
  UUID 警告不解释当前约 `408 MiB` V8 resident。
- [x] 已确认 Foundry v14.364 会无条件加载核心动态 Token Ring spritesheet；普通
  Token Ring 设置不能阻止图集加载，无源码阶段不把“关闭动态环”冒充内存修复。
- [x] 已确认核心/dnd5e SVG 栅格化没有可整体关闭的普通世界设置；后续只审计可选
  模块附加状态和具体资源尺寸。
- [ ] 在相同 Scene 下对客户端 `core.mipmap` 做单变量 A/B，同时检查 GPU PWS、
  managed texture、缩放锯齿和动画观感。
- [ ] 核对 Monk's Little Details `add-extra-statuses` 是否被 MIDI-QOL、DAE、
  Condition Lab 或当前世界状态使用；只有无依赖时才测试关闭。
- [ ] 对已确认的 2048² 玩家角色图做一张 1024² 副本 A/B；先证明视觉可接受和
  resident 收益，再决定是否批量处理。文件压缩不等于本项已完成。
- [ ] 建立只用于 Foundry 的 Chrome Profile，关闭无关扩展和视频标签；在单标签条件
  下重新测主进程、扩展、Renderer 和 GPU Private Working Set。
- [ ] 将当前 13 个、合计约 `111.09 MiB` 的 RenderTexture 映射到 Canvas、光照、
  遮罩、DSN、Token Ring 或模块滤镜的实际所有者。
- [ ] 核对“DSN 隐藏侧栏统计”和“Calendaria 聊天时间戳停止周期更新”是否存在
  官方设置、当前值及 scope；未取得运行时证据前不得标记已完成。
- [ ] Maximum Framerate 只按玩家显示器和 GPU 分级；不得声称降低 FPS 会按比例
  释放已解码纹理，也不得为了内存把动画限制到明显卡顿。

### Dice So Nice 与玩家端分级

- [x] DSN 第一次 `1d20` 观察到一次 82.4 ms 停顿；热缓存后的多次投骰基本平滑，
  符合材质、环境贴图和 shader 首次编译预热。
- [x] 已确认 DSN 主要视觉/性能配置属于客户端 scope；GM 当前设置不会自动应用给
  玩家。
- [ ] 如用户批准，实现一次不可见、不发聊天、不改掷骰结果的 DSN 空闲预热；不得
  禁用 3D 骰子或自动动画。
- [ ] 由玩家按设备选择 60/90/144 FPS 和 Foundry Performance Mode；先记录玩家
  显示器刷新率和 GPU，再决定是否限制帧率。

### 最终长时门槛

- [ ] 同一客户端连续切换 2～4 张真实地图并完成多轮战斗，至少记录 2 小时曲线。
- [ ] 至少一个非 GM 玩家客户端重复同一流程，不能用 GM 单机替代。
- [ ] 记录首次 DSN、首次 AA、新动画、重复动画、场景返回和 15 分钟纹理过期点。
- [ ] 若 2～3 小时后只剩 Chromium/媒体高水位且刷新可完全释放，记录为可接受的
  运维缓解；若继续单调增长，则进入 native heap backtrace/memory-infra 定责。

## 12. 2026-07-28～29 生产迁移执行状态

执行 ID：`20260728-220757+0800`
总体状态：`Partial`

### 已通过

- [x] 生产前本地/远端容量门槛、版本、DataPath、世界和在线用户重新盘点。
- [x] 世界和批准模块进入远端非扫描暂存，逐文件路径、字节和 SHA-256 对账。
- [x] GM 正常卸载世界、Foundry 内置备份、精确停 8080、离线生产快照。
- [x] 三方 LevelDB 差异归属完成，没有未裁决冲突。
- [x] 世界和模块原子切换；正式文件相对批准候选差异为 0。
- [x] `5e-dlc-monster` 因许可未确认而明确排除。
- [x] GM/非 GM 世界加载、轻重 Scene、Actor/Journal、Token 控制。
- [x] 真实攻击、命中、伤害聊天卡、MIDI Workflow、AA/Sequencer 特效。
- [x] Simple Cover 10 路并发单 Effect、Bloodsplats、动画 Token 删除清理链、
  Hide NPC Names。
- [x] Chat Memory Guard sidebar/popout、历史阅读、回到底部裁剪、Core 重渲染和 MIDI
  卡交互。
- [x] 七章 Adventure 读取；最小第七章 create-style 导入—检查—精确恢复。
- [x] GM 与 `SY` 的客户端设置边界复核；没有批量推送。
- [x] 生产前快照在一次性本地 DataPath 完成 v14.364/dnd5e 5.3.3 启动、GM 登录、
  7 User/权限投影、67 个原启用模块和文档计数复原演练。
- [x] 远端 `.migration-rollback\20260728-220757+0800` 和本地生产快照保留。
- [x] 同一 PID/同一浏览器会话完成 30 分 21.893 秒连续受控循环；Heap、DOM/CDP
  Node、监听器、Workflow、Effect、Worker、纹理和服务器内存均已记录，性能累积
  指标没有单调增长。

### 正在执行或未通过

- [ ] 约 4 小时真实 GM + 玩家跑团。
- [ ] 在 HTTPS 或 localhost secure context 下补 Sequencer Spritesheet Generator
  第三个任务排队/完成；公网 HTTP 下该功能当前不可用。
- [ ] 独立定责 FXMaster 8.2.4 在第三、四轮离开重场景时成对出现的 compositor
  `clear` TypeError；该 finding 不属于迁移探针噪声，也尚未证明由迁移新增。
- [ ] 77 条迁移前已存在的媒体 404 和 embedded-record warning 仍需独立内容清理，
  不归入本次迁移回归。

完整报告：
[`2026-07-28-cor-cotn-production-migration-report.md`](../runbooks/2026-07-28-cor-cotn-production-migration-report.md)。
