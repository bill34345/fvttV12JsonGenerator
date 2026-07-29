# Foundry VTT v14 原生 Adventure 制作与恢复操作手册

## 适用范围

本手册用于项目本地 Foundry VTT `14.364`、dnd5e `5.3.3`。当前实例：

- App：`.local/foundry-v14/app/14.364`
- Data：`.local/foundry-v14/data/server-mirror`
- World：`cor-cotn`
- URL：`http://127.0.0.1:30001/`

它不授权操作生产服务器，也不建议离线编辑正在使用的 LevelDB。

## 官方资料

- [Adventure Documents](https://foundryvtt.com/article/adventure/)（页面标注 Version 13.350，2025-10-20 更新）
- [Compendium Packs](https://foundryvtt.com/article/compendium/)

官方说明的核心约束：

1. Adventure Document 必须存放在 Adventure 类型的 Compendium Pack 中。
2. Adventure 可以同时包含 Actor、Scene、Item、JournalEntry、RollTable、Cards、Playlist 等顶层文档。
3. 加入 Adventure 的文档保留唯一 ID；再次导入同一 ID 时可能覆盖世界中的现有文档。
4. Adventure 保存 Folder 结构和文档链接，但媒体文件本体不进入 Adventure，只保留路径。
5. Compendium 内容不会像世界文档一样在玩家加入时全部加载，适合保存暂时不用的内容。

## 本地 v14.364 对照

本地 `public/scripts/foundry.mjs` 已确认仍有：

- `CompendiumCollection.createCompendium(metadata, options)`
- `AdventureExporter`
- `Adventure.prepareImport(options)`
- `Adventure.importContent(data)`

v14.364 原生 Adventure Exporter 将世界文档转换到 Adventure 时使用：

```js
document.toCompendium(adventure.collection, {
  clearSort: false,
  clearFolder: false,
  clearFlags: false,
  clearSource: false,
  clearOwnership: true,
  clearState: true,
  keepId: true
});
```

原生导入创建世界文档时使用 `keepId: true`。因此，原始 Scene、Actor、Token 和 embedded document ID 是恢复链接的关键，不应在归档前重建或改名猜配。

## 官方 UI 制作流程

1. 以 GM 登录目标世界。
2. 打开 Compendium Packs 侧栏。
3. 创建 Document Type 为 `Adventure` 的世界级 Pack。
4. 打开 Pack，点击 `Create Adventure`。
5. 在 Summary 中填写名称、描述、横幅和排序。
6. 在 Contents 中拖入需要保存的顶层文档或 Folder。
7. 检查 Contents，不得误收共享、玩家或其他章节文档。
8. 点击 `Build Adventure`。
9. 关闭并重新打开 Pack 和 Adventure，确认保存后的真实内容。

拖入 Folder 会把该 Folder 下的内容作为一个集合处理。若 Folder 内混有共享 Actor，不应直接拖入整个 Actor Folder，应按冻结清单逐个加入专属 Actor。

## 原生导入流程

1. 打开 Compendium Packs 侧栏。
2. 打开 Adventure Pack。
3. 双击目标 Adventure。
4. 选择要导入的文档类型；完整恢复测试选择全部内容。
5. 点击 `Import Adventure`。
6. 若同 ID 文档仍在世界，Foundry 会提示可能覆盖；归档往返测试应先确认目标专属文档已经删除。
7. 导入后验证实际 Scene、Token、Actor、Folder、链接和模块 flags，而不只检查数量。

## Rebuild Adventure 注意事项

- Rebuild 会用世界中当前同 ID 文档替换 Adventure 内的版本。
- 世界中已经不存在的文档可能在 Rebuild 后从 Adventure 移除。
- 完成归档删除后，不应随意 Rebuild；需要先明确是在更新快照还是误操作。
- Adventure 是快照，不会自动同步世界中后续修改。

## 红梦密会试点规则

- 只处理 16 个冻结 Scene、62 个章节专属 Actor 和 9 个必要 Folder。
- 39 个共享 Actor 留在世界，不加入 Adventure。
- 76 个既存 missing Actor Token 不修复、不替换，保留 Token 原数据。
- Adventure 内容重新打开并与基线核对前，不删除任何世界文档。
- 剥离后只做一次同条件内存后测。
- 后测完成后必须通过原生 Import Adventure 恢复，并进行实际 Canvas/Actor/Token 语义验收。
- 本轮恢复成功后保留恢复状态，等待用户人工复核；不自动第二次删除。

## 失败与恢复

出现新增 missing Actor、共享/玩家内容被覆盖、Scene 无法打开、Folder 层级丢失或 Adventure 无法导入时：

1. 立即停止；
2. 保存差异和控制台证据；
3. 关闭本地世界；
4. 使用 `.local/foundry-v14/evidence/cor-cotn-red-dream-pilot-20260727-r2/world-snapshot` 恢复；
5. 不处理其他章节。

## 试点执行记录

执行日期：2026-07-27。

### 创建与持久化

- 新建 Pack：`world.cor-cotn-chapter-archive`
- 显示名称：`溟渊的呼唤：章节归档`
- Adventure ID：`IUIOaSRx8l7EazeG`
- Adventure 名称：`红梦密会`
- 实际内容：16 Scenes、62 Actors、9 Folders、212 Scene Tokens
- 39 个共享 Actor 没有收入 Adventure。
- 原 `Adventure-BxzlyiYWyXYyz9XI / 怪物特性` Pack 未改动。

通过本地 v14.364 API 创建 Adventure 时，`pack.createDocument(data)` 只产生了客户端实例，没有把文档持久写入 Pack。本次最终使用公开文档创建入口：

```js
await CONFIG.Adventure.documentClass.create(data, {
  pack: pack.collection
});
```

完成后必须关闭并重新打开 Pack，不能把“内存中出现了 Document”当成持久化成功。

### Folder 的实际处理

9 个必要 Folder 中：

- 3 个是只容纳目标 Scene 的专属 Folder，剥离时可以删除；
- 6 个 Actor Folder 同时容纳共享 Actor，不能从世界删除。

因此，本次实际剥离为 16 Scenes、62 Actors、3 Folders，而不是机械删除全部 9 个 Folder。原生导入时，6 个仍存在的同 ID Folder 会触发覆盖警告；它们被重新导入后，Folder 数量恢复为原值。

### 原生导入规范化行为

原生 Adventure 往返不是字节级备份：

- `_stats.createdTime`、`modifiedTime`、`lastModifiedBy`、`systemVersion` 等元数据会按当前运行时重写；
- 当前 dnd5e/模块 schema 会把缺省字段补全；
- 世界文档 ownership 会按导入者重新建立；
- 本次 77 个 `actorLink: true` Token 的空/无效 Delta 被规范化为 `null`；
- 135 个 `actorLink: false` Token 的 Delta 在忽略 embedded `_stats` 时间元数据后全部保持一致。

因此，往返验收应区分：

1. ID、名称、位置、图像、尺寸、Actor 引用、flags 等玩家可见/功能字段；
2. unlinked Token 的实际 Delta 内容；
3. 仅用于元数据或 schema 规范化的差异。

不要用 JSON 字节完全一致作为 Adventure 的唯一成功标准，也不能隐藏以上规范化差异。

### 本次验证结果

- 剥离状态：Actor 516→454，Scene 252→236。
- 原生导入后：Actor 454→516，Scene 236→252，Folder 186→189。
- 16 Scenes、62 Actors、9 Folders、212 Tokens 的精确 ID 全部恢复。
- 既存缺失 Actor Token 保持 76 个，其中 linked 56、unlinked 20；没有新增 missing Actor。
- 实际打开 B4、shumas 和零 Token Scene 均成功；Canvas embedded 内容数量与恢复文档一致。
- 缺失 Actor 的 linked Token 仍保留名称、图像、坐标和可见占位。
- 专属 Actor 卡可打开，共享 Actor 继续解析。
- 临时测试 Macro 已删除；最终返回安全 Scene 并重载确认 Pack/Adventure 持久存在。

完整证据见：

`docs/audits/2026-07-27-cor-cotn-compendium-readiness/red-dream-adventure-pilot-report.md`

## 第六章执行补充（2026-07-28）

第六章证明了：创建 Adventure 后仍必须做一次真实删除—原生导入—语义验收，不能只核对 Pack 中的数量。

实时世界与旧审计不一致时，以实时 ID 为准。本次旧审计预计 10 Scene、179 Token 和 12 个章节 JournalEntry，但实时世界只有 9 Scene、87 Token，旧 Scene `YjFlYzBmMjA5MDFj` 和 12 个 JournalEntry 均已不存在，因此没有补齐或猜测导入。

第六章原生 Adventure：

- ID：`d6GFwntrENpGwR94`
- 9 Scene
- 13 个章节专属 Actor
- 5 Folder
- 87 Token
- 14 个共享/玩家保护 Actor 留在世界
- 19 个既存缺失 Actor ID 不修复，涉及 44 Token

第一次原生导入时，未链接 Token `v5AGX3mS25aVqKYS` 的顶层名称从“萨利卡斯（Xalicas）”被重置为 Actor Prototype Token 名称“天神使徒”。原因是原 Token 的 `delta.name` 为 `null`。这种玩家可见差异必须判为失败。

兼容处理是在 Adventure Scene 数据中设置：

```text
token.delta.name = "萨利卡斯（Xalicas）"
```

这仍然使用原生 Adventure Document 和原生“导入冒险”，没有修改 Foundry 或模块源码。第二次原生导入后，87 个 Token 名称全部保持。

本次还观察到以下原生规范化：

- 203 个 embedded Item ownership 条目被 `clearOwnership: true` 移除；
- 30 个空/无效 Token Delta 被规范化为 `null`；
- 3 个 `fog.reset` 缺省字段被移除；
- 6 处 `<br />` 被 HTML 解析器规范化为 `<br>`；
- 除显式 `delta.name` 加固外，未解释的语义差异为 0。

完成语义验收后，第六章再次从世界剥离。最终世界只保留共享/保护内容，红梦密会和第六章均只存在于 Adventure Pack 中。详见：

`docs/audits/2026-07-27-cor-cotn-compendium-readiness/chapter-6-adventure-report.md`

## v14 RegionBehavior 兼容性门槛（2026-07-28）

创建 Adventure 前必须扫描 Scene 内所有 RegionBehavior 的 `type`，并确认该类型已存在于当前运行时的 `CONFIG.RegionBehavior.dataModels` 中。

如果 Scene `_source` 中仍保存已卸载模块或旧版本模块提供的未知 behavior type：

- Scene 可能仍出现在世界目录中；
- prepared document 可能忽略该 behavior；
- Adventure 创建会对嵌套文档重新执行严格校验，并拒绝整个 Adventure；
- 不得为了通过校验而静默删除未知 behavior；
- 不得只在当前页面临时注册假的 data model，因为刷新或导入环境仍会失败；
- 必须先证明存在无损迁移方案，或把该章节保留在世界。

本地案例：

- Scene `tGvSIXUpenW0tZU2 / 市广场（哀怒）`
- 两个旧 behavior type：`terrainmapper.setTerrain`
- Terrain Mapper v14 已删除旧 Set Terrain 功能；
- Foundry v14 核心等价方向是 `modifyMovementCost`，但 schema 不同，不能在没有语义决策和实际移动验收的情况下自动改写。

后续用户明确授权删除两个旧 Behavior 后，使用失效嵌入文档的正式删除入口处理：

```js
const invalidBehavior = region.behaviors.get(behaviorId, {invalid: true});
await region.deleteEmbeddedDocuments("RegionBehavior", [invalidBehavior.id]);
```

注意：

- 直接把过滤后的 `regions` 数组传给 `Scene.update()` 会被 EmbeddedCollection 更新逻辑视为增量合并，缺少的 Behavior 不会自动删除；
- `deleteEmbeddedDocuments` 对失效文档的返回数组可能为空，不能只看返回值判断；
- 删除后必须重新检查 `region._source.behaviors`、`region.behaviors.invalidDocumentIds` 和 Region 数量；
- 本次两个 Region 均保留，源 behaviors 和 invalid ID 集合均变为 0；
- 只有用户明确接受删除旧规则语义时才可以采用该路径。

## 创建式导入与覆盖式导入

章节归档的标准恢复路径必须是：

```text
目标章节专属文档不在世界
        ↓
Import Adventure
        ↓
按保留 ID 创建世界文档
```

不要把“世界中已有相同 ID 文档时再次覆盖导入”当作等价验证。旧 dnd5e ActorDelta 或模块管理的 embedded Item 可能在覆盖更新路径中触发更新错误，即使从空世界状态进行的创建式导入已经成功。

本地第四章案例中，创建式导入完整恢复 108 Scene、78 Actor 和 1,315 Token；但在这些文档仍存在时再次覆盖导入，Scene `d5k6TA2DNiVCECoI` 的旧 Token ActorDelta Item 触发 dnd5e/MIDI 更新错误。正常按需恢复仍使用经过验证的创建式导入路径。
