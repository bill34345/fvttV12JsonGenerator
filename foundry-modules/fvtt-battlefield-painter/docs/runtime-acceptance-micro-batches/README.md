# Battlefield Painter：Luna Max 微批次续测索引

## 为什么改成微批次

上一轮把修复、重装、双客户端、Square、Hex、P2、性能、最终回归和清理放进同一条长任务。它确实新增了 7 个完整 PASS，但在 4 小时内仍留下 24 个 PARTIAL，并在独立 case 尚未完成时提前进入清理。今后一次 Luna 任务只能执行一个批次文件，完成后必须停下，由用户另发下一批。

## 每批共同硬规则

- 固定 worktree、Lab、世界、端口和证据目录沿用现有报告；不新建 worktree，不 commit、merge、push，不创建备份，不读写 LevelDB，不触碰 8080/51020。
- 开始时读取根/模块/Foundry Ops `AGENTS.md`、现有报告、本索引和本批文件；核对 Git、PID、30001、HTTP、安装身份。
- GM 必须是命令行打开的 Chrome：

  `Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--new-window','--window-size=1440,1100','http://127.0.0.1:30001/join'`

  随后按 `chrome:control-chrome` 连接明确的 Chrome backend。玩家只用独立 Codex 内置 Browser。先用可见 UI 证明 GM=`Gamemaster [GM]`、玩家=`佐德`，不得读取 Cookie、profile、密码或存储。
- 浏览器动作使用各自浏览器绑定返回的真实 Playwright 接口；不得用同一 context 的两个标签页冒充双用户，不得用字段检查替代玩家拖动、碰撞、动画或音频体验。
- 每批使用独立 `BP-ACCEPT-20260815-Bxx-<HHmmss>-` 前缀 Scene/Actor/Token/foreign fixtures；只通过 Foundry UI 或公开 Document API 创建。续跑同一批也生成新时间，不复用失败 fixture。
- 每个断言同时保存：GM 文档/API 抽样、玩家可见截图或录屏、两端 console/network、server log 新区段。失败先冻结证据。
- 验证批次禁止修改源码、重装、跑全仓 CI、清理其他批次 fixture 或继续下一批。若发现模块缺陷，标记 FAIL 并停；由 Sol 另写一个最小修复批次。
- 目标 20 分钟、硬上限 30 分钟。时间到就把未完成项写为 PARTIAL，保存检查点并停。批末更新报告对应 Case ID、检查服务器健康；除 B99 外不禁用模块、不删 fixture、不停 Lab。

## 执行顺序与开放项

| 批次 | 只负责的开放项 |
|---|---|
| B00 | 双客户端、命令行 Chrome、身份和基础权限准备 |
| B01 | SQ-004、SQ-005、SQ-006、SQ-007、SQ-018 精确画笔边界 |
| B02 | SQ-008、REC-003 地形/阶段/刷新持久化 |
| B03 | SQ-010、SQ-011、SQ-012 玩家移动、碰撞、光视听 |
| B04 | Hex Rows 的 HEX-007 核心 P1 |
| B05 | Hex Columns 的 HEX-006/007 生命周期 |
| B06 | P2-002、P2-003：P0 与 P0+P1 实际绘制 |
| B07 | 历史记录；当前 Square 动画/聚类/零音频请求由 R02 取代 |
| B08 | `RETIRED — NOT APPLICABLE`；不再录制或审核 Battlefield Painter 音频 |
| B09 | 历史记录；当前 Hex Rows P2/零音频请求由 R02 取代 |
| B10 | 历史记录；当前 Hex Columns P2/零音频请求由 R02 取代 |
| B11 | P2-007：25/100/300 操作后的可交互性补证 |
| B12 | P2-009：真实过期 fingerprint 拒绝 |
| B13 | 连续火焰场的真实 Canvas、双端、网络、循环和性能证据 |
| B14 | 连续薄冰膜与 Stage II 寒气场；视觉已通过，完整 E2E 矩阵由用户取消 |
| R01 | 修复后 Square/Hex Rows/Hex Columns 预览、高亮生命周期与预览/提交集合一致性 |
| R02 | 音频退役、零新声音请求、六 WebM 资源及 legacy owned AmbientSound 清理 |
| B90 | R01/R02 完成后的 ENV-005、权限、最终语义/机械门禁；不得清理 |
| B99 | 仅在 Sol 确认所有可执行门禁关闭后清理和停 Lab |

`REC-006` 与 `P2-012` 是明确的正式发布门禁，本轮 Alpha 不移除 setter；应标为 `PARTIAL — RELEASE GATE`，不要求 Luna 擅自实现。仓库级 coverage 82.95%/84.76% 低于 84%/85% 是另一个 Sol/用户范围决定，不得让 Luna修改其他 package 或反复重跑冒充解决。

## 修复批次边界

- B01/B04 的预修复预览失败证据保持冻结；R01 只记录修复后的新证据，不覆盖旧截图或旧报告。
- B11、B12、SQ-011 不因本轮修复重复执行或降级。B11 的坐标校准/证据缺口仍是证据问题，B12 的 stale fingerprint 保护仍是独立通过项。
- B08 的“录制和主观听音”要求因 Battlefield Painter 音频产品范围退役而标记 `RETIRED — NOT APPLICABLE`，不再为已移除功能制造 PASS 证据。
- B07、B09、B10 的历史音频步骤不再执行；当前媒体/灯光/零声音标准统一由 R02 覆盖。B90 不再要求 OGG、用户听音或旧音频文件存在。
- 当前修复验收顺序固定为 R01（预览）→ R02（音频退役与旧声音清理）→ B90（最终门禁）。
- R01/R02 执行前必须完成源码、自动测试和构建门禁；每批仍遵守本 README 的双客户端、证据冻结、30 分钟停止和无清理规则。

## 当前执行状态 — 2026-08-16

- R01：**PASS**。三种网格的 Foundry v14 高亮、预览/提交集合一致性和生命周期清理已完成真实双客户端验证。
- R02：**PASS**。六个 WebM、零 OGG、零新 owned 声音请求、三网格阶段组合和 legacy cleanup 已完成真实双客户端验证。
- B90：**已执行，`PARTIAL — RELEASE GATE`**。Square 代表性双客户端语义抽样、模块门禁、媒体退役检查已完成；唯一阻断是既有全仓 coverage release gate（2005 tests passed / 0 failed，但 lines 82.82% < 84%、functions 84.65% < 85%）。
- B99：**已完成，PASS**。下方追加章节记录了按证据清单完成的测试对象清理、模块禁用和 `server-mirror` 停止；模块仍安装但保持禁用。
- 运行期间创建的临时 Scene 已通过 Foundry 公共 Document API 删除；原 B12 fixture 已按文档 ID、计数和 foreign survival 重新核对。

## B05—B10 连续验收 — 2026-08-15

本节是后续追加的真实双客户端记录，不改写 B04 旧 FAIL、B07/B08/B09/B10 历史正文，也不把 R01/R02 当成这些批次的替代证据。执行前缀为 `BP-E2E-B05-B10-20260815-170842`，每批均在 30 分钟硬上限内停止：

| 批次 | 当前状态 | 证据目录 |
|---|---|---|
| B05 Hex Columns P1 | `PARTIAL`：主要绘制、生命周期和玩家同步通过，但完整 fill-held preview 与 direct-path offset 对照未闭合 | 证据根目录（B05 文件未置于子目录） |
| B06 Square P0/P1 | `PARTIAL`：P0/P1 实际绘制、声音=0、历史和玩家证据通过；全部 P1 预览/提交集合对照未完整保存 | `...\\B06` |
| B07 Square 当前 P2 | `PASS`：六 WebM 帧推进、9+9 聚类、零声音、owned-only clear/rebuild | `...\\B07` |
| B08 音频 | `RETIRED — NOT APPLICABLE`：六 WebM、零 OGG、无 `assets/audio`；不录音、不听音 | `...\\B08` |
| B09 Hex Rows 当前 P2 | `PASS`：六 WebM 帧推进、9+9 聚类、foreign 四类文档保留、重建一致 | `...\\B09` |
| B10 Hex Columns 当前 P2 | `PASS`：六 WebM 帧推进、9+9 聚类、foreign 四类文档保留、重建一致 | `...\\B10` |

证据绝对路径为 `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B05-B10-20260815-170842`。因此当前顺序结论是“B05—B10 已执行但尚未全部通过”；B90、B99、清理 Scene、停止 Lab 及发布操作仍未执行。

## B90 final gate — 2026-08-16

本节追加 B90 的最终门禁结果，不改写 B05—B12、R01 或 R02 的历史状态。固定环境为 Foundry `14.364` / dnd5e `5.3.3` / `server-mirror` / `cor-cotn` / `30001`；GM 使用命令行 Chrome，玩家使用独立 in-app Browser。新建 Square Scene `BP-ACCEPT-20260816-B90-20260815-184258-Final`（`R1GW0k8Nsouz9Dla`），实际完成 fire stage/erase/undo/redo、frost 移动成本、mature brambles 墙边碰撞、reload 和 Scene 切换回场景。玩家始终没有 Painter 控件或写权限；最终 audit 为 `bundles=3, tiles=5, regions=3, lights=1, sounds=0, walls=6`，无 Battlefield Painter 音频请求，六 WebM/零 OGG/无 `assets/audio`。

模块测试、typecheck、build、agents 生成/检查、Foundry modules typecheck 与 `git diff --check` 均 PASS。`bun run ci:verify` 的 2005 个测试全部通过，但既有全仓 coverage 阈值失败，因此 B90 只能记为 `PARTIAL — RELEASE GATE`，不是新的模块代码错误。证据目录为 `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B90-20260815-184258`。B99 必须等用户审阅 B90 后另行明确授权，才能清理对象并停止 Lab。

## B99 清理与停止 — 2026-08-16（已完成）

B90 结果获用户确认后，B99 已完成：Battlefield Painter 通过 Foundry 模块管理界面禁用但保留安装；按逐 ID、逐名称证据清单删除 15 个验收 Scene、其 14 个嵌入 Token 和 6 个验收 Actor；无 Macro 候选、无 LevelDB 或文件系统世界编辑。B90 Scene 中已记录的 foreign fixtures 仅随明确归属的测试 Scene 一并移除，未独立删除未知 foreign 文档。删除后目录不再存在本轮候选前缀。

随后执行 `bun run foundry:lab stop server-mirror` 成功：PID `32616` 消失，`127.0.0.1:30001` 释放，`8080/51020` 未被触碰。B99 证据为 `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B99-20260816-delete-result.json`；B05—B12、R01/R02、SQ-011 的既有状态保持不变。没有源码修改、版本修改、commit、merge 或 push。

## B13-art-style-square — 连续火焰场视觉验收（待执行）

本批只验收连续火焰场，不与 Frost B14 混合判定，也不重跑 B11、B12、SQ-011。实现门禁完成后，另开独立的 `B13-art-style-square` 双客户端批次：Foundry `14.364`、dnd5e `5.3.3`、`server-mirror`、`cor-cotn`、命令行 GM Chrome 和独立玩家 Browser。

验收对象：

- P2 火焰确认 Tile 请求 `fire.webp`、写入 `fire-field-v1` 且不请求 `fire.webm`。
- P2 火焰必须由独立连续场覆盖实际 Tile 格位：一个 Scene 只有一个 mesh，世界坐标和共享时钟跨格连续，不能逐格重复、整块平移或按 Tile 独立相位。
- Stage I/II、L 形、中心缺口、跨绘制相邻格、Token 层级、世界定位和 15×15 压力样本分别取证。
- 人工视觉判断必须确认火焰是真正铺地燃烧的连续火舌，而不是图片分块移动、半透明蒙层或墙纸。

## B14-frost-field-square — 薄冰膜与寒气场视觉验收（已通过）

最终薄冰与寒气样片已在真实战斗地图背景下获用户明确认可；P2 Square Frost runtime 已实现，既有 Badlands 双端 Canvas 证据也已确认 Token 位于效果上方。用户于 2026-08-24 裁决不再重复完整 E2E，因此 Network、完整布局矩阵和 15×15 性能保持未验证，但不再阻塞本批视觉通过。详细范围和未宣称事项见 `B14-frost-field-square.md`。

本批明确不做六角格视觉验收，不处理鼠标悬停预览、音频播放、B11 坐标/证据缺口、B12 stale fingerprint 或 SQ-011 旧证据问题。当前源码实施阶段不启动 Lab、不打开浏览器、不重装模块。
