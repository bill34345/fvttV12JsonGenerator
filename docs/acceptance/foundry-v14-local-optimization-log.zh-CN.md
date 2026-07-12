# Foundry v14 本地优化与生产端操作记录

记录日期：2026-07-12  
适用基线：Foundry 14.364、dnd5e 5.3.3  
验证环境：本地 `server-mirror`  
生产服务器状态：本轮未修改

## 记录用途

本文记录已经在本地完成并验证的配置调整，供之后在生产服务器逐项复现。生产端实施时应一次只修改一组设置，重新进入世界确认后再继续下一项；本文中的“本地已完成”不代表生产端已经同步。

## 本地已经实施的优化

### 1. 默认关闭不兼容或当前不需要的模组

| 模组 | 本地状态 | 原因与证据 | 生产端建议 |
| --- | --- | --- | --- |
| `simple-quest` 2.3.10 | 已关闭 | 最小化复现仍会在 `getSceneControlButtons` 中触发 `t.find is not a function` | 关闭，等待明确支持 Foundry v14 的版本 |
| `5e-chm-online` 251108 | 已关闭 | 多次出现 Scene Controls 参数类型告警，当前不是必需模组 | 关闭；如以后确有需要，再单独测试 |
| `chat-media` 14.0.1 | 已关闭 | 启动时写入 v14 已弃用的 `ChatLog.MESSAGE_PATTERNS` | 关闭，等待更新 |
| `scene-packer` 2.8.12 | 已关闭 | 当前世界不需要打包/解包场景；启动时访问弃用的 `CompendiumCollection` | 日常跑团关闭；仅在明确导入或打包内容时临时评估 |
| `monks-combat-marker` 12.01 | 已关闭 | 使用旧版 `Token`/`loadTexture` API；Foundry v14 已有原生战斗回合标记 | 关闭，使用核心回合标记 |
| `monks-common-display` 14.01 | 已关闭 | 当前不使用电视、投影仪或第二公共显示端；该模组会包装场景切换入口 | 不使用公共显示屏时关闭 |
| `tokenmagic` 0.8.4 | 已关闭 | `requestLoadFilters()` 对未就绪 Placeable 缺少前置空值检查，已直接触发 `loadingRequest` 异常 | 先关闭；等待短程 A/B 和官方修复 |
| `levels` 7.0.3 | 已关闭 | Foundry v14 已有原生 Scene Levels；作者已退休该模组 | 关闭，详见下方迁移记录 |
| `translate-all` 2.1.0 | 保持关闭 | 未配置密钥时仍初始化 OpenAI 请求并返回 401；它不是正常 Babele 汉化链的必要组成 | 保持关闭，除非以后单独配置并验证 |

继续关闭 `tokenmagic` 后，本地启用模组数为 79。该数字只用于核对本地状态；生产端模组集合或版本变化后不应机械追求相同数字。

### 2. MIDI-QOL 长时间战斗缓解设置

本地已采用：

- `MIDI-QOL Debug = None`：减少战斗期间 Console 日志压力。
- `Save to Chat Card = 开启`：允许 Workflow 状态随聊天卡片管理。
- `Use Weak References for Workflows = 开启`：避免已完成 Workflow 一直被强引用保留。

短程 A/B 中，启用弱引用后，已完成 Workflow 可在自然 GC 后释放；删除对应测试聊天消息后 Workflow Map 回到 0。聊天消息本身仍会保留聊天卡片 DOM，因此长时间跑团仍应避免无限累积无用测试消息。

### 3. Automated Animations / Sequencer 缓解设置

本地已把 `autoanimations.killAllAnim` 设置为 `off`，即客户端不再执行 Automated Animations。

原因：在重复执行“战斗 → Activity → 切换重型场景 → 返回轻量场景”时，Automated Animations 7.0.15 与 Sequencer 4.2.2 复现过场景切换竞态：Sequencer 的 Sprite 已被销毁后，异步流程仍尝试写入 `volume`。关闭自动动画后，相同 10 次操作未再出现该异常。

生产端如果希望保留动画，不应直接照抄这一项；可以先只在容易卡顿的客户端关闭，再等待两个模组提供明确修复。

## Levels 迁移与关闭记录

### 迁移前重新分类

先前按“存在 `flags.levels`”统计得到 182 个场景，这个口径不代表 182 个场景仍依赖旧 Levels，现已纠正：

- 世界共有 281 个场景。
- 167 个场景仅保留 `backgroundElevation`、`lightMasking` 或 `weatherElevation` 等旧设置。
- 4 个场景存在 `sceneLevels` 字段，但数组全部为空。
- 没有场景包含旧 Levels 楼层定义。
- 没有检测到 Wall Height 场景。
- 没有检测到会被迁移器跳过的 3D Canvas 场景。

### 官方迁移结果

使用 `Levels 7.0.3` 自带迁移 API 执行：

- 世界场景迁移：0
- 场景合集迁移：0
- 执行状态：成功，无异常

结果为 0 的含义是没有场景符合官方迁移器的旧多层场景识别条件，并非迁移命令失败。随后在本地关闭 Levels 并重载世界，确认 `levelsActive=false`。

### 关闭后的场景抽查

| 场景 | 关闭 Levels 后结果 | 观察 |
| --- | --- | --- |
| `B4` | Canvas 正常就绪 | 185 面墙、56 个光源正常载入；约 2.7 秒 |
| `叛神殿 betrayers' rise` | Canvas 正常就绪 | 1109 面墙、7 个 Tile、33 个光源正常载入；约 1.6 秒 |
| `Poster Map` | Canvas 正常就绪 | 37 个 Tile、106 个 Drawing 正常载入；约 1.5 秒 |

关闭后没有出现新的 Levels 相关 Console 错误。部分文档仍保留旧 Levels 字段，但当前官方迁移器不会处理它们，核心也不会读取这些模组私有字段。如果以后发现某个旧楼梯、电梯、Tile 阻挡或高度效果不工作，应针对该场景改用 v14 原生 `Change Level` / `Define Surface` Region，而不是重新长期启用退休的 Levels 模组。

## 当前剩余错误：三个模组的证据边界

场景切换时观察到的主要调用链包含 `tokenmagic`、`vision-5e` 和 `monks-common-display`，但三者的证据强度不同。

### `tokenmagic` 0.8.4：明确的直接异常

错误：

```text
TypeError: Cannot set properties of undefined (setting 'loadingRequest')
[Detected 1 package: tokenmagic(0.8.4)]
at tokenmagic.js
```

这是当前三个模组中唯一有直接错误位置和 Foundry 包检测标记的模组。它在场景文档更新期间触发，值得优先做单变量排查。当前结论为“明确运行错误，尚未证明是长期内存增长的唯一根因”。

2026-07-12 核对 Token Magic FX 官方仓库的开放、关闭 issue 和 PR 后，没有找到正文或标题包含 `loadingRequest` 的同一错误；GitHub 官方 issue 搜索返回 0 项。因此当前版本没有可直接套用的官方修复结论。

不过，0.8.4 随包 Source Map 显示 `requestLoadFilters(placeable)` 会先执行：

```js
placeable.loadingRequest = true;
```

然后才在后续计时回调中检查 `placeable == null`。多个 Token、Tile、Drawing、Region 创建/更新 Hook 都可能把 `getPlaceableById()` 的返回值直接传入这个函数。对象尚未创建完成、已因切图销毁或无法从 Canvas 取得时，便会精确产生当前 `Cannot set properties of undefined (setting 'loadingRequest')`。

官方仓库已有同类生命周期问题：[PR #313](https://github.com/Feu-Secret/Tokenmagic/pull/313) 记录 Foundry v14 中未完整绘制的 Placeable 被 Token Magic 无条件解引用；维护者因 v14 已改用 Region 而关闭该特定 PR。它不是 `loadingRequest` 的修复，但证明 Token Magic 曾遇到同一类“Placeable 不完整仍继续访问”的 v14 问题。另有仍开放的 [Issue #253](https://github.com/Feu-Secret/Tokenmagic/issues/253)，也是 Token Magic 对未准备好的对象写属性导致 Canvas 异常，但字段为 `renderable`，并非本次错误。

当前判断：这是 Token Magic 0.8.4 中尚未公开报告的真实空值保护缺陷，适合在完成最小复现后向官方新建 issue；不能声称官方已经确认或修复。

2026-07-12 已在本地 `server-mirror` 关闭 Token Magic。重载后确认 `configured=false`、`active=false`，启用模组数由 80 降为 79，`landing page` Canvas 正常就绪，启动阶段没有新的 Token Magic 警告或错误。当前只证明关闭操作安全完成；尚未完成包含重复切图和 Token 特效的短程 A/B，因此还不能量化它对长期内存增长的贡献。

建议下一步：在本地保持其他状态不变，只关闭 `tokenmagic`，重复一组短切图与带 Token 特效的操作，比较错误数、Token 显示和内存回落。

### `vision-5e` 3.1.3：参与失效资源绘制，但未直接崩溃

缺失 Token 或法术贴图时，调用栈经过：

```text
vision-5e -> Token5e._draw -> Foundry loadTexture
```

这只能说明 `vision-5e` 包装或扩展了 Token 绘制过程，不能证明它制造了错误资源路径，也不能单凭这一段堆栈判定它泄漏内存。应在修正或接受缺失资源后，再通过启用/禁用 A/B 判断它是否放大渲染开销。

2026-07-12 完成 Token Magic 保持关闭条件下的 Vision 5e 短程 A/B：

| 配置 | 实际切图 | 15 秒后 Heap | 切图中位数 | 脚本捕获异常 |
| --- | ---: | ---: | ---: | --- |
| Vision 5e 开启（第一轮） | 12/12 成功 | 约 913 MB | 约 794 ms | 0 个 Vision 异常；6 个一次性 `monks-bloodsplats` Promise 异常 |
| Vision 5e 关闭 | 12/12 成功 | 约 919 MB | 约 823 ms | 0 |
| Vision 5e 恢复开启 | 12/12 成功 | 约 919 MB | 约 869 ms | 0 |

三组使用相同的 `landing page`、`B4`、`叛神殿 betrayers' rise`，共完成 36 次实际 Canvas 切换。短样本中没有证据表明 Vision 5e 导致明显的切图延迟或 Heap 累积。

控制台的资源结果存在稳定差异：Vision 开启期间记录到 15 条 `Invalid Asset`，全部调用链经过 `vision-5e`；Vision 关闭组没有新增此类错误。随后再次关闭 Vision，分别进入三张场景各一次，资源错误总数仍停留在 15，新增为 0。

这说明 Vision 5e 确实参与了使这些失效 Token/法术纹理进入绘制的条件；但错误仍由 Foundry `loadTexture` 对不存在路径抛出，尚无证据表明 Vision 创建或写入了这些错误路径。准确分类为“Vision 开启会暴露/触发既有失效资源，资源数据本身仍是根因候选”，不是“Vision 5e 自身崩溃”。

最终已恢复原配置：Vision 5e 开启、Token Magic 关闭、79 个模组启用，世界回到 `landing page` 并正常就绪。当前不建议仅因这些缺图关闭 Vision 5e；下一步应定位 15 条错误对应的具体 Token/Actor/效果数据来源。

第一轮出现的 6 个 `monks-bloodsplats 14.01` 空对象 Promise 异常在 Vision 恢复开启的第二轮没有复现，因此当前只能记录为一次性切图竞态嫌疑，不能归因给 Vision 5e。

2026-07-12 核对官方 issue、评论、14.01 Changelog 和 Git 历史：仓库没有公开报告包含 `getBloodImage`、`refreshBloodsplat`、`reading 'position'` 或相同 TypeError。旧 issue #20 曾报告进入世界时偶发 Console 错误，但因过时而关闭，无法证明与本次相同；#26 是旧版 PIXI 资源缓存警告；#40 是 libWrapper 更新后的血迹不生成；#54 是解除 defeated 后 Token 仍不可控制，均不是本次调用栈。

精确错误来自 14.01 新增代码：`getBloodImage()` 在异步载入纹理后读取 `token.x`/`token.y`。Foundry 的 `token.x` getter 会继续读取 PIXI transform 的 `position`；如果切图期间旧 Token 已销毁，transform 已为 null，就会产生 `Cannot read properties of null (reading 'position')`。这段坐标赋值由 14.01 的 v14 兼容重写于 2026-05-09 引入，因此应分类为“老的异步生命周期问题家族中的 v14 新回归”，不是已经有官方修复的老 issue。

### Monk's Bloodsplats 14.01 本地补丁交付记录

2026-07-12 只在本地 `server-mirror` 应用生命周期补丁，生产服务器未修改。补丁在 `loadTexture()` 返回后、读取 `token.x/y/w/h` 前确认：Token 未销毁、Token 文档仍属于当前 Canvas 场景、文档仍映射到同一 Placeable、PIXI transform 仍存在。失效时仅放弃该次已经过期的血迹任务，不修改世界数据。

机械与运行验收：

- 项目内可重复补丁工具：`scripts/foundry-lab/patchMonksBloodsplats.ts`
- 回归测试：`scripts/foundry-lab/__tests__/patchMonksBloodsplats.test.ts`
- 回归测试 4/4 通过，覆盖守卫位置、幂等性、上游代码形状校验和原版备份
- 浏览器实际确认加载补丁版 14.01
- `landing page` / `B4` / `叛神殿 betrayers' rise` 重复切换 24 次，24/24 Canvas ready
- 场景最多正常渲染 23 个 Bloodsplat，原功能没有被整体禁用
- 补丁前同一路径曾出现 6 个 `position` Promise 异常；补丁后为 0
- 补丁后全部脚本错误和未处理 Promise 为 0
- 15 秒自然回落后 Heap 约从 909 MB 到 922 MB；短样本没有明显累积趋势

校验值：

| 产物 | SHA-256 |
| --- | --- |
| 官方 14.01 `monks-bloodsplats.js` 备份 | `8DEBA62982121899A8CEA8A626D298D425C2A15C032A9480FED0F1641227204B` |
| 本地补丁版 `monks-bloodsplats.js` | `8C6F677EC96A464A213797419B9CEBDEFFEB913C6EB2E34A7B5703428A78E491` |
| 可部署补丁 ZIP | `A4284D177C8D3DBBDF9726A8B68287779D0E8617EF8C326EC9351C60E3D356FF` |

本地可部署包位于：

```text
.local/foundry-v14/evidence/patched-modules/monks-bloodsplats-14.01-codex-v14-lifecycle.zip
```

ZIP 已解压复核：根目录包含 `module.json`、补丁版 `monks-bloodsplats.js` 和 `LOCAL-PATCH.zh-CN.md`；不包含本地 `.bak`；解压后的 JS 哈希与上述补丁版一致。

生产端部署步骤：

1. 确认无人在线并停止生产端 Foundry 进程。
2. 保留服务器现有 `Data/modules/monks-bloodsplats` 目录备份。
3. 用上述 ZIP 的根目录内容覆盖服务器 `Data/modules/monks-bloodsplats`。
4. 启动 Foundry，确认模组仍显示 14.01 且正常启用。
5. 重复切换一张包含已击败 Token 的场景与轻量场景，确认血迹仍显示且 Console 不再出现 `getBloodImage` / `position` 异常。
6. 若需回滚，恢复原目录或重新安装官方 14.01。

注意：Foundry 的模组更新或重新安装会覆盖此补丁。每次更新后必须重新核对官方是否已包含等价修复；不能无条件把旧补丁套到新版本。

## 墙体、绘图、选择与辅助模组 v14 分类（2026-07-12）

| 模组 | 当前本地状态 | v14 判断 | 建议 |
| --- | --- | --- | --- |
| `wall-height` | 未安装 | 作者明确宣布在 v14 退休；核心 Scene Levels 用楼层定义墙体上下高度，但并非一比一替代 | 不安装、不重新启用 |
| `monks-wall-enhancement` 14.01 | 已启用 | 最低/验证均为 14；自由绘墙、拖拽/合并墙点等功能没有被核心完全替代 | 暂时保留；后续做实际绘墙验收 |
| `advanced-drawing-tools` 14.0.0 | 已启用 | 最低/验证均为 14；增加线条、填充、文字和编辑样式，核心 Placeables Palette 只部分重叠 | 暂时保留；不是已证实冲突 |
| `multiple-document-selection` 14.01 | 已启用 | 最低/验证均为 14；它处理侧边栏目录文档，核心 v14 多选主要处理 Canvas Placeables，作用域不同 | 暂时保留；不是核心重复项 |
| `scaleGrid` 1.5.0 | 已启用 | manifest 只验证到 13；使用旧全局 `Dialog`、`renderTemplate` 和 Scene Controls 注入；只有实际点击工具时才能验收 | 建议日常关闭，需要校准地图网格时临时启用并测试 |
| `easy-target` 4.0 | 已启用 | 只验证到 13；包装 `Token.prototype._onClickLeft`、`_canControl`、`TokenLayer.targetObjects`，并依赖旧 MeasuredTemplate 路径；v14 已扩展核心 Placeable 控制 | 高风险，建议关闭；若需要 Alt 点击，再做专门 A/B |
| `recycle-bin` 2.0 | 已启用 | 只验证到 12；仍继承旧 `Application` 并使用旧全局 `Dialog`；核心备份不是同等的世界内回收站 | 不是核心重复，但兼容债务高；建议默认关闭，删除验收时临时测试 |
| `sync-token-name` 2.0.0 | 已关闭；由 `sync-token-actor` 3.1.0 接替 | 旧包只验证到 13；新包明确验证到 14，并已通过本地 Actor 改名验收 | 保持旧包关闭；新包关闭自动图片同步，只同步名称 |

运行日志检查：上述已安装的七个模组当前均为启用状态，本次会话按模组名过滤得到的警告/错误均为 0。这只能证明已经走过的启动和切图路径没有直接异常，不能证明 Grid Scaler 按钮、绘墙、目录批量操作、删除恢复或 Actor 改名功能已经通过。

外部依据：Foundry v14 核心增加 Scene Levels、Placeables Palette、Placeables Sidebar，并把选择控制扩展到所有 Placeable 类型；Wall Height 作者明确宣布模组退休。功能重叠不自动等于冲突，只有 Wall Height 属于已确认由核心接替的退休项。

### `monks-common-display` 14.01：已按实际用途关闭

场景载入调用栈经过：

```text
Scene.view#monks-common-display -> Canvas.draw
```

这说明它包装了场景切换入口，但目前没有异常抛自它自己的实现，也没有证据证明它生成了无效图片路径。由于当前不使用电视、投影仪或第二公共显示端，该模组已经在本地关闭。重载后确认 `configured=false`、`active=false`，世界正常进入 `landing page`。

当前结论：因不需要其功能而关闭，不把这项操作表述为已经证明它损坏。

## 已知但暂不作为三个模组问题处理的资源错误

已看到若干 `Invalid Asset`，例如缺失的 Tanarukk Token、`5e-dlc-monster` Token 和某些法术贴图。对于生产包原本就缺少或路径漂移的图片，这类错误是可预见的内容资源问题。

资源加载失败会产生 Console 噪声和重复加载开销，但错误栈经过某个绘图模组不等于该模组创建了错误路径。后续排查三个模组时应把已知缺图单独计数，避免把资源错误误归因给 `vision-5e` 或 `monks-common-display`。

## `sync-token-name` 替换为 `Sync Token Actor`（2026-07-12）

本地 `server-mirror` 已安装并启用 `Sync Token Actor` 3.1.0，同时停用旧 `Sync Token Names` 2.0.0；启用模组总数保持 79。生产服务器未修改。

安装依据与校验：

- 官方 Foundry 包页声明支持 Foundry 13–14，并验证到 14。
- 使用官方 latest release manifest 和 ZIP；解压后核对 `id=sync-token-actor`、`version=3.1.0`、`compatibility.verified=14`。
- 下载 ZIP 的 SHA-256 为 `72cd9f397f787a141e2e7c5abbae01e133764fce49860f3bb273d703b28b6b1a`。
- 本地包与原始证据只保存在忽略的 `.local/foundry-v14` 中。

为保持与旧模组相近的职责范围，并避免覆盖已经单独配置的 Token 图片，当前本地设置为：

| 设置 | 当前值 | 原因 |
| --- | --- | --- |
| 自动名称同步 | 开启 | Actor 改名时同步原型 Token 名称 |
| 同步当前场景 Token | 开启 | 保留旧模组对已放置 Token 的主要行为 |
| 自动图片同步 | 关闭 | 防止 Actor 头像覆盖独立 Token 图片 |
| Token Ring 禁用 | 关闭 | 不改变现有 Token Ring 视觉设置 |

真实行为验收使用一个临时 NPC：创建时 Actor 名称、原型 Token 名称、Actor 图片和 Token 图片彼此不同；随后同时修改 Actor 名称与 Actor 图片。结果是原型 Token 名称正确跟随 Actor，Token 图片保持原值，说明名称同步可用且关闭图片同步有效。临时 NPC 已删除，残留数量为 0；浏览器 Console 中没有 `sync-token-actor` 或 `sync-token-name` 相关警告/错误。

生产端执行时应先安装 3.1.0，再在同一次模组配置变更中启用 `Sync Token Actor`、停用 `Sync Token Names`，重载后关闭“自动图片同步”，最后用一个可删除的测试 Actor 重复上述改名检查。

## `recycle-bin` 的 v14 路径（2026-07-12 调研）

当前本地 `recycle-bin` 2.0 不是需要寻找另一个同类模组的问题：原作者已经发布 `Recycle Bin` 4.0.0，最低版本为 Foundry 14，并明确验证到 14。它仍提供 Actor、Scene、Token、Tile、Active Effect、Actor 内 Item、Journal Page 等文档删除后的恢复，功能上是旧 2.0 的直接升级路径。

4.0.0 是发布者渠道提供的付费包，是否能升级取决于现有购买/Patreon 授权。本轮只完成外部版本核实，尚未取得受保护安装包，也没有改动本地 `recycle-bin` 2.0。Foundry 核心世界备份只能恢复整个世界或包，不是逐个文档的实时回收站，因此不能视为等价替代。

## 最终 79 模组配置的 15 分钟操作累积复验（2026-07-12）

测试配置为本地 `server-mirror`、Foundry 14.364、dnd5e 5.3.3、79 个启用模组。循环使用 `landing page`、`叛神殿 betrayers' rise` 和 `凯尔·莫罗 Cael Morrow全地图`；共采集 53 个浏览器样本，完成 16 轮场景循环。前 8 轮包含 Actor/Item 窗口开关，后 8 轮为只切图单变量；最后在轻场景自然空闲到 15 分钟。

| 指标 | 初始轻场景 | 测试峰值 | 15 分钟最终轻场景 |
| --- | ---: | ---: | ---: |
| 浏览器 JS heap | 837.5 MB | 1120.5 MB | 966.4 MB |
| DOM Nodes | 44,260 | 151,275 | 72,692 |
| JS Listeners | 18,597 | 40,760 | 23,689 |
| Documents | 59 | 76 | 59 |
| Frames | 58 | 67 | 58 |

最终 heap 比初始高 128.9 MB（15.4%），低于筛选阈值 25% 或净增 500 MB；最高峰约 1.12 GB，未重现此前接近 3 GB 的爆发。第 3–8 轮 Nodes/Listeners 一度阶梯抬升，但第 9 轮发生自然 GC，Nodes 从 151,275 降至约 59,495，Listeners 从 40,760 降至约 21,933；后续继续在区间内波动，没有单向无界增长。当前证据支持“原先的严重内存爆涨已受到控制，仍保留约 100–150 MB 的场景/纹理缓存平台”，不支持宣称零增长或完全没有长期风险。

服务端收尾为 RSS 169.7 MB、Private 261.3 MB，端口 30001 正常，最近日志没有 `ERROR`、`TypeError` 或未处理异常。Console 只有已知 Tanarukk Token 图片路径无效；调用栈经过 `vision-5e` 的 Token 绘制包装，但仍无证据证明图片路径由 Vision 5e 创建。

战斗与 Activity 验收存在独立缺口：自动创建/启动临时 Combat 和直接调用真实 Activity 都曾使完整模组环境的前端 Hook 流程超过 25 秒且阻塞 CDP。测试按既定规则记录失败并继续；创建于本轮的临时 Combat `MuaPRtrqxIuj2g2v` 已按创建时间核对后删除，没有删除历史 Combat。该卡顿不能计入“战斗通过”，也不能单凭脚本调用失败归罪于某个模组；仍需用正常 UI 做一次短程战斗工作流验收。

## 生产端建议执行顺序

1. 记录生产端当前 Foundry、dnd5e、模组版本和启用列表。
2. 关闭 `simple-quest`、`5e-chm-online`、`chat-media`、`scene-packer`。
3. 关闭 `monks-combat-marker`，改用 Foundry v14 原生回合标记。
4. 确认生产世界没有实际旧 Levels 多层地图后，运行 Levels 7.0.3 官方迁移，再关闭 `levels`。
5. 把 MIDI-QOL Debug 改为 None，并开启 Save to Chat Card、Use Weak References for Workflows。
6. 按客户端决定是否关闭 Automated Animations；不要在所有玩家端一次性修改而不验证动画需求。
7. 每完成一组修改就重载世界，切换一张轻量场景和一张重型场景，完成一次战斗与 Activity，记录 Console 新错误。
8. 不使用第二公共显示端时关闭 `monks-common-display`；暂不禁用 `vision-5e`；关闭 `tokenmagic` 后做单变量短程 A/B。

## 验收层级

机械验证已经完成：本地配置已写入、世界已重载、Levels 官方迁移命令成功返回、代表场景 Canvas ready、没有 Levels 相关错误。

语义验收已经覆盖：三个代表场景在 Levels 关闭后可正常进入，战斗标记由核心能力接替，MIDI-QOL 与动画缓解设置在短程 A/B 中表现符合预期。

尚未完成：生产端同步、`tokenmagic` 单变量 A/B、`vision-5e` 的独立归因，以及旧楼梯、电梯或 Tile 特殊行为的逐场景人工检查。
## 生产环境执行记录（2026-07-12）

目标世界为 `cor-cotn`，运行时为 Foundry VTT 14.364、dnd5e 5.3.3。实际进程从 v14 code 启动，但 User Data 位于 `E:\Bill\fvtt_v13\data`；模块部署目标因此是该 Data 根下的 `Data\modules`，而不是目录名称所暗示的 v13 code。

### 已应用配置与回滚点

- Foundry 世界备份：`E:\Bill\fvtt_v13\data\Backups\worlds\cor-cotn\world.cor-cotn.2026-07-12.1783842679709.bak`，大小 1,624,389,972 bytes。
- 文件级回滚目录：`E:\Bill\fvtt_v13\data\Backups\codex-v14-production-20260712-155358`。
- `translate-all` 已关闭；`monks-common-display`、`levels`、`tokenmagic` 等此前已关闭的模块保持关闭。
- Automated Animations 7.0.15 保持启用。Swipe 性能档位选择 `Balanced`，没有选择会禁用 Automated Animations 的 `Extreme`。
- MIDI-QOL：Debug=`关闭`、Save to Chat Card=`true`、Use Weak References for Workflows=`true`；保存、重载并重新打开设置后值仍然存在。

### 部署结果

- Swipe VTT 2.3.0 已部署到 `Data\modules\swipe-vtt` 并在世界内启用；传输 ZIP SHA-256 为 `183EFE8DFC82436DD65A2CB5AFE96D101467CF3CD8C31A3E88E0A2E6C0DAC2E3`，服务器最终目录共 40 个文件。
- Monk's Bloodsplats 14.01 生命周期补丁已覆盖到生产模块；最终 `monks-bloodsplats.js` SHA-256 为 `8C6F677EC96A464A213797419B9CEBDEFFEB913C6EB2E34A7B5703428A78E491`，原版文件可从上述回滚目录恢复。
- 轻量场景 `B4` 和重场景 `叛神殿 betrayers' rise` 均能实际进入；B4 可见血迹，切换后没有再次观察到 `getBloodImage` / `reading 'position'` 生命周期异常。

### 15 分钟高频操作验收

验收窗口为 16:24–16:40，操作按人类节奏执行，没有反复触发动画。场景进入、角色卡/物品查看、聊天区域、Swipe 移动端界面和快捷控制均被实际操作。

- Swipe 快捷控制能由真实 CDP `touchStart`/`touchEnd` 展开，属于触控语义通过，不只是按钮存在。
- 生产端的 Token 触控拖动尝试没有改变文档坐标，因此本轮不计为通过；本地复制世界此前已有成功触控拖动证据，但不能替代生产验收。
- 角色卡中的 Rapier/MIDI 攻击入口被操作，但没有生成新的完整攻击/伤害聊天卡；生产端攻击与伤害仍未验收通过。
- Swipe 启动时出现 `Session validation error: TypeError: Failed to fetch`；Premium Combat 在本次生产会话中未能确认解锁，因此仅判定基础触控界面可用。
- Swipe 与 Item Piles 的 `_onClickLeft2` libWrapper 重叠警告仍存在。本轮没有复现 Item Piles 功能损坏，但也没有完成 pile/merchant 的真实触控 A/B，故只记录为共存风险。
- 已知缺图仍包括 `5e-dlc-monster` 的 Core Spawn Emissary/Crawler 和重场景中的 Tanarukk；调用栈经过 `vision-5e`，但没有证据表明这些路径由本次改动创建。

### 收尾机械检查

Chrome 的临时移动设备尺寸、触控模拟和移动 UA 已恢复为桌面状态。服务器 PID 3592 仍在运行，`[::]:8080` 仍由 PID 3592 监听。

生产结论为 `Partial`：模块和设置已经真实落地，Bloodsplats 补丁及基础 Swipe 触控通过抽样；Swipe 付费会话校验、生产 Token 拖动、完整攻击/伤害链和 Item Piles 触控共存仍未通过语义验收。
