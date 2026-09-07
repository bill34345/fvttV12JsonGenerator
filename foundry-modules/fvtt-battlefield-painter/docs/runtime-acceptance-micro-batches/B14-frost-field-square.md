# B14-frost-field-square：连续薄冰膜与二阶段寒气场

状态：**视觉验收通过（用户于 2026-08-24 明确认可最终薄冰与寒气样片，并裁决不再重复完整 E2E）；runtime 代码与离线机械门禁已实现；既有 Badlands GM/普通玩家 Canvas 证据已确认 Token 位于效果上方。未执行的 Network、完整布局矩阵和 15×15 性能项目不再作为本批视觉通过门槛，也不宣称已验证。**

## 固定目标

- 仅支持 Foundry `14.364` / dnd5e `5.3.3` 的 Square grid。
- Stage I 是覆盖完整实际格位、地图仍可透出的薄冰膜；连续观看时几乎静止，仅允许极弱且缓慢的光泽变化。
- Stage II 保留同一冰膜，并增加固定在世界空间锚点上生成、膨胀、卷动、变薄和消散的浅色寒气。
- 新 P2 Frost Tile 使用 `frost-film-v1.webp` 并写入 `visualEffect: "frost-field-v1"`；不得请求旧 `frost.webm`。
- Stage I 不创建寒气媒体；Stage II 使用一个寒气 mesh。所有 Frost 共用一个 container、一个 mask 和一个 ticker，不按 Tile、bundle 或绘制批次创建独立动画时钟。
- Hex Frost、P0 Frost、Fire 和 Brambles 不在本批扩展。

## 已完成的离线实现事实

- `frost-film-v1.webp`：1024×1024 透明薄冰膜。
- `frost-mist-v1.webm`：1024×1024、24 fps、4 秒、2×2 四变体透明寒气。
- runtime mask 的 R 通道表示实际 Frost 占用，G 通道区分 Stage I/II；寒气 shader 只允许 Stage II 像素通过。
- Stage II 使用间距约 `0.62` 格的错列、确定性抖动世界空间 lattice，不按 Tile 重复固定三点；15×15、225 格样本保持不超过 675 个 emitter、两个 mesh 和一个 ticker。
- `auditFrostEffects()` 暴露只读的格数、阶段数、mesh、emitter、顶点、三角形、ticker、媒体和错误诊断。

上述事实由单元测试、类型检查和构建验证支持。真实 Canvas 已证明 shader 能在锁定运行时编译、GM 与普通玩家可重建相同效果，但尚未证明完整 Network 请求边界、全部布局、循环连续性或帧时间达到要求。

## 2026-08-23/24 Badlands 局部 Canvas 验收

- Scene：`BP-ACCEPT-20260823-B14-234906-Frost-Badlands`（`k0tDQjWqrbvHbjdu`），1400×1120、70 px Square grid，使用现有 `cor-cotn` Badlands 战斗地图。
- 样本：32 个 Frost 格，Stage I 12 格、Stage II 20 格，包含两个 3×3 区域、混合阶段行和中心缺口；另放置一个真实 Token 做层级检查。
- 旧素材在真实地图上太弱，曾临时把 fragment shader 采样增益提高到 `2.10`。最终重制素材已经直接包含获认可的冰冻感与寒气强度，因此 runtime 恢复为 `1.0` 中性采样，不再二次放大素材 alpha；媒体、emitter 数量、运动、mask 和 Stage I 均不改变。
- GM 与普通玩家首次进入均报告：`frostCells=32`、`stageICells=12`、`stageIICells=20`、`filmMeshCount=1`、`mistMeshCount=1`、`mistEmitters=52`、`tickerAttached=true`、`mediaLoaded=true`、`lastError=null`。
- 人工检查增强后的 4.31 秒普通玩家 Canvas 视频：Stage I 仍表现为薄冰膜；Stage II 的白青寒气可稳定辨认并有膨胀、淡出变化；地图裂纹和 Token 保持可读，Token 位于效果上方；未见整块移动、逐格固定三点、白烟墙或明显闪断。
- 本地证据目录：`F:\FoundryLab\foundry-v14\evidence\server-mirror\b14-frost\20260823-234906\`。世界截图和视频不进入仓库。
- 最终重制素材已在 Badlands 背景预览中检查 Stage I、Stage II、混合阶段和至少两个完整循环，用户明确判定视觉没有问题。精确 Network 请求、全部 L 形/擦除/undo/redo/切 Scene 布局矩阵以及 15×15 的 30 秒 p95 frame-time 未执行；这些项目不再阻塞本批视觉通过，但仍保持“未验证”，不能被后续文档引用为已通过。

## 已取消的扩展 E2E 矩阵

以下项目原计划作为完整 E2E 矩阵。用户于 2026-08-24 明确裁决不需要重复执行；除既有 Token 层级证据外，未执行项目保留为可选扩展检查，不再阻塞 B14 的视觉结论：

1. Stage I 单格、1×3 和 3×3 完整铺冰，地图可见，10 秒内没有明显流动、翻滚或塑料膜感。
2. Stage II 在同一冰膜上明显冒出寒气；寒气不是灰烟、蓝火、云墙或逐格重复的一团视频。
3. 混合 Stage I/II 时冰膜连续，寒气只来自 Stage II。
4. 跨绘制相邻格、L 形、中心缺口、擦除、undo/redo、平移、缩放、刷新、切 Scene 和晚加入玩家均保持逻辑范围与世界定位。
5. 寒气位于 Token 下方，不抢鼠标、不显著遮挡棋子。
6. Network 请求 `frost-film-v1.webp` 与 `frost-mist-v1.webm`，不请求旧 `frost.webm`，无音频请求。
7. 15×15 Stage II 保持 `filmMeshCount=1`、`mistMeshCount=1`、`mistEmitters<=675`、一个 ticker；30 秒 p95 frame-time 相对静态基线增量不超过 2 ms，对象数量无持续增长。

既有证据保存在本地 Lab evidence 目录，不提交世界画面。若未来修改 Frost 素材、alpha、renderer 层级、mask、ticker 或世界空间 emitter，再根据实际改动范围重新决定是否需要 Canvas 或性能回归；本次通过结论不自动覆盖未来变化。
