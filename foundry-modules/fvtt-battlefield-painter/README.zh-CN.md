# Battlefield Painter P2 Alpha · `0.3.0-alpha.2`

这是一个自用的 Foundry VTT v14 战场地形画笔原型。它不复制 Tile Arsenal 的代码、配置或素材，只实现相近的高层工作流：GM 从工具盘选择地形、在地图上涂抹，并由模组创建一组可以追踪和回滚的场景文档。

当前版本是 P2 alpha：浏览器 bundle 已在模拟 Foundry 全局环境中完成加载、生命周期注册、ApplicationV2 打开和版本/权限门禁测试。Frost B14 的薄冰/寒气视觉已获用户认可，Fire B13 的完整真实 Canvas 验收仍保持独立未完成；其他运行时结论以各 micro-batch 记录为准，不能由静态测试一并推定。新版本不再生成或创建 Battlefield Painter 音频；旧版本残留 AmbientSound 只能由 GM 显式清理。

`0.3.0-alpha.2` 允许三组精确运行配对：原 Foundry `14.364` / dnd5e `5.3.3`，历史 ServerNext `14.368` / `6.0.2`，以及 `14.368` / `6.0.5`。manifest 的 `verified` 仍保留旧版本，运行时拒绝交叉配对和未列明版本。2026-09-24 的真实 Canvas 定点验收针对 `14.368` / `6.0.2`，通过方格 Fire 笔画→原生 Region 移动消耗/光源→重载视觉→自有对象清理。2026-10-01 在 `6.0.5` 独立修正行列坐标与视频加载后，原两格 Square Fire I 的可见动画、Region／light、正常GM重载及精确清理通过；六角格、其它地形／阶段、模块Undo与玩家权限未扩大验收，见[本轮限定恢复](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md)与[历史候选记录](docs/server-next-candidate.md)。

## 当前范围

- 火焰、冰霜、荆棘三种配置。
- 每种配置保留两个逻辑阶段，并共享 1 张原创透明 P0 WebP；当前共 3 张基础图。旧场景兼容循环仍保留为每种地形 1 个 WebM。
- P0 与未带 marker 的旧场景由 Tile 媒体、透明度、Tint、火焰光源和成熟荆棘 Wall 表达阶段；P2 Square Fire/Frost 另有独立视觉层。
- Foundry 原生 Tile 负责静态地表或逻辑占位；P2 Fire 与 Frost 分别由模块自管的世界空间 renderer 绘制，均位于 Token 下方。
- Foundry 原生 Region `modifyMovementCost` 行为负责移动消耗。
- 火焰创建原生 AmbientLight，使用 `torch` 动画；P2 对长笔画使用最多 16 格一组的确定性聚类光源。
- P2 新建火焰 Tile 以 `alpha=0` 的 `fire.webp` 作为逻辑/兼容纹理并写入 `visualEffect: "fire-field-v1"`；运行时火场不采样、不移动 `fire.webp`，也不请求 `fire.webm`，而是共享 `fire-stage-i.webm`（Stage I）和 `fire-stage-ii.webm`（Stage II）。
- P2 新建 Square Frost Tile 使用 `frost-film-v1.webp` 并写入 `visualEffect: "frost-field-v1"`；Stage I 只显示薄冰膜，Stage II 额外使用共享的 `frost-mist-v1.webm` 寒气场，不请求旧 `frost.webm`。Hex Frost 与无 marker 旧场景保持兼容路径。
- Brambles 仍使用当前 `brambles.webp` / `brambles.webm` Tile 路径；独立荆棘视觉效果属于下一阶段。
- 不再创建新的 AmbientSound；审计仍识别旧版本模块所有声音，并提供 GM 专用的指纹确认清理入口。旧声音清理不可撤销，也不会被 undo/redo 恢复。
- 新包不再携带 OGG；旧场景中的模块所有 `AmbientSound` 可能请求缺失资源（404）。GM 看到旧声音警告后，应先打开 Painter，通过显式确认入口清理；模块不会自动迁移或删除旧场景数据。
- 成熟荆棘在地形外边界创建 Wall。
- 绘制、擦除、阶段切换支持方格和六角格；几何来自 `canvas.grid`，不自行猜测六角格坐标。
- 所有文档带 `flags.fvtt-battlefield-painter` 所有权信息；批次创建失败时自动回滚。
- P1 增加 0–4 格笔刷半径、自由/直线/填充三种几何、画布光标预览，以及只恢复本模组文档的撤销/重做。
- “直线”委托当前 Foundry Grid 的 `getDirectPath`；半径委托 `getAdjacentOffsets`，避免自行假设方格或六角格邻接。
- “填充”是拖拽起点与终点之间的 offset 区域填充，不是依赖地图像素颜色的洪水填充。
- P2 提供 GM 专用的本场景地形清除预览，只统计模块所有文档，并在确认前重新核对文档 ID 指纹。
- 方格 Tile 仅在 Foundry 已明确识别为方格时做 8% 的视觉尺寸扩展（每侧约 4%）；Region、Wall、cellKey、offset 和所有权边界仍使用原始方格几何。六角格和未识别网格不自动套用该视觉扩展。

当前暂不包含 12 色变体、跨客户端并发锁、伤害自动结算和第三方自动化模组集成。Fire、Frost 和后续 Brambles 的视觉/运行时验收分别记录，不互相替代。

## 使用

1. 以 GM 身份打开一个已激活的场景。
2. 在 Tiles 场景控制组点击火焰图标，打开“战场地形画笔”。
3. 选择地形、阶段和模式，点击“启用画笔”。
4. 在地图上按住左键拖动；松开时一次性创建该笔画。
5. “擦除”只作用于本模组拥有的地形；擦除一部分笔画时会安全重建剩余部分。
6. “切换阶段”会升级或循环命中的完整笔画批次。

控制台可用 API：

```js
game.modules.get("fvtt-battlefield-painter").api.auditScene()
game.modules.get("fvtt-battlefield-painter").api.auditEffects()
game.modules.get("fvtt-battlefield-painter").api.auditFrostEffects()
```

`auditEffects()` 与 `auditFrostEffects()` 分别只读返回 Fire/Frost 的 mesh、格位、顶点、三角形、ticker、媒体、重建次数和最近错误。API 同时公开 `compatibility` 与 `canMutate`。仅当版本精确为 Foundry `14.364` / dnd5e `5.3.3`，或 Foundry `14.368` / dnd5e `6.0.2`、`6.0.5`，且当前用户是 GM 时，才暴露 `open`、`activate` 和 `deactivate`；其他环境只保留诊断能力。

Alpha 还提供仅供开发、测试和修复使用的内部阶段开关：

```js
const api = game.modules.get("fvtt-battlefield-painter").api
api.developmentPhases()
api.setDevelopmentPhase("p1", false) // 关闭 P1，回退为 P0 单格自由画笔
api.setDevelopmentPhase("p1", true)
api.setDevelopmentPhase("p2", false) // 关闭动态素材和聚类光源
api.setDevelopmentPhase("p2", true)
```

正式版发布前必须把 `DEVELOPMENT_PHASE_CONTROLS_MUTABLE` 改为 `false`，确认运行时不再暴露 `setDevelopmentPhase`，并重新跑完整门禁。

## 开发与构建

```powershell
bun run test:coverage
bun run typecheck
bun run build
# 仅在明确需要重新生成媒体时运行；普通构建不会重新生成资产
bun run generate:media
bun run generate:frost-field
```

构建产物为 `dist/module/` 和 `dist/fvtt-battlefield-painter.zip`。静态构建成功不等于 Foundry 真实语义通过。

本地 Lab 安装入口：

```powershell
bun run install:local
bun run install:local -- --apply
bun run verify-install
```

安装脚本只接受仓库批准的 `F:\FoundryLab\foundry-v14`，会先构建、核对精确目标、使用暂存目录并逐文件哈希验证。目标模组目录必须不存在；如果已有任何文件或目录，安装会停止且不会替换、移动或创建旧副本。它不触碰生产环境。

## 文档索引

- [设计与实现决定](docs/architecture.md)
- [外部调研与版本边界](docs/research-notes.md)
- [P0 真实验收清单](docs/acceptance-checklist.md)
- [原创素材来源与完整提示词](docs/asset-provenance.md)
- [后续路线](docs/roadmap.md)
- [0.3.0-alpha.1 发布说明（历史）](docs/alpha-release-notes.md)
- [ServerNext 静态兼容候选与待验收项](docs/server-next-candidate.md)
- [P1 开发 checkpoint 与异机验收交接](docs/p1-development-checkpoint.md)
- [P2 执行计划](docs/p2-execution-plan.md)
- [B13 连续火焰场视觉验收](docs/runtime-acceptance-micro-batches/B13-art-style-square.md)
- [B14 薄冰膜与寒气场视觉验收](docs/runtime-acceptance-micro-batches/B14-frost-field-square.md)
