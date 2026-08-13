# Battlefield Painter P0 · `0.1.0-alpha.1`

这是一个自用的 Foundry VTT v14 战场地形画笔原型。它不复制 Tile Arsenal 的代码、配置或素材，只实现相近的高层工作流：GM 从工具盘选择地形、在地图上涂抹，并由模组创建一组可以追踪和回滚的场景文档。

当前版本是静态运行时加固后的 alpha：浏览器 bundle 已在模拟 Foundry 全局环境中完成加载、生命周期注册、ApplicationV2 打开和版本/权限门禁测试；由于没有可用的真实 Foundry 环境，Tile、Region、光源和墙体的实际画布语义仍待验收。

## P0 范围

- 火焰、冰霜、荆棘三种配置。
- 每种配置两个阶段，共 6 张原创透明 WebP。
- Foundry 原生 Tile 负责画面。
- Foundry 原生 Region `modifyMovementCost` 行为负责移动消耗。
- 火焰创建原生 AmbientLight，使用 `torch` 动画。
- 成熟荆棘在地形外边界创建 Wall。
- 绘制、擦除、阶段切换支持方格和六角格；几何来自 `canvas.grid`，不自行猜测六角格坐标。
- 所有文档带 `flags.fvtt-battlefield-painter` 所有权信息；批次创建失败时自动回滚。

P0 暂不包含音效、WebM 动画、12 色变体、预览笔刷、跨客户端并发锁、伤害自动结算和第三方自动化模组集成。

## 使用（待真实 Foundry 验收）

1. 以 GM 身份打开一个已激活的场景。
2. 在 Tiles 场景控制组点击火焰图标，打开“战场地形画笔”。
3. 选择地形、阶段和模式，点击“启用画笔”。
4. 在地图上按住左键拖动；松开时一次性创建该笔画。
5. “擦除”只作用于本模组拥有的地形；擦除一部分笔画时会安全重建剩余部分。
6. “切换阶段”会升级或循环命中的完整笔画批次。

控制台可用 API：

```js
game.modules.get("fvtt-battlefield-painter").api.auditScene()
```

API 同时公开 `compatibility` 与 `canMutate`。仅当版本精确为 Foundry `14.364` / dnd5e `5.3.3` 且当前用户是 GM 时，才暴露 `open`、`activate` 和 `deactivate`；其他环境只保留诊断能力。

## 开发与构建

```powershell
bun run test:coverage
bun run typecheck
bun run build
```

构建产物为 `dist/module/` 和 `dist/fvtt-battlefield-painter.zip`。静态构建成功不等于 Foundry 真实语义通过。

本地 Lab 安装入口：

```powershell
bun run install:local
bun run install:local -- --apply
bun run verify-install
```

安装脚本只接受仓库批准的 `F:\FoundryLab\foundry-v14`，会先构建、核对目标身份、使用暂存目录、备份同 ID 旧模组，并逐文件哈希验证；它不触碰生产环境。

## 文档索引

- [设计与实现决定](docs/architecture.md)
- [外部调研与版本边界](docs/research-notes.md)
- [P0 真实验收清单](docs/acceptance-checklist.md)
- [原创素材来源与完整提示词](docs/asset-provenance.md)
- [后续路线](docs/roadmap.md)
- [Alpha 发布说明](docs/alpha-release-notes.md)
