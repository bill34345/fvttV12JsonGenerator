# Foundry v14 本地优化与生产端操作记录

> 2026-07-26 起，`cor-cotn` 长时游玩性能优化的当前状态、后续受控测试与真实跑团
> 验收统一维护在
> [`cor-cotn-performance-optimization-checklist.zh-CN.md`](cor-cotn-performance-optimization-checklist.zh-CN.md)。
> 本文保留为此前模块、设置、补丁和生产操作的历史记录，不再单独代表当前最终状态。

初始记录日期：2026-07-12
最近补录日期：2026-07-27
适用基线：Foundry 14.364、dnd5e 5.3.3  
验证环境：本地 `server-mirror`  
生产服务器状态：本文包含 2026-07-12 的历史生产操作；2026-07-24～27 的新增补录
均仅发生在本地，尚未同步生产

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

历史诊断和本日志旧版本曾错误地把 `autoanimations.killAllAnim = off` 解释成
“没有启用杀掉全部动画，因此自动动画仍启用”。本地 Automated Animations 7.0.17
源码已确认该键实际是动画启停开关：`on` 会设置 `AnimationState.enabled = true`，
`off` 会设置 `AnimationState.enabled = false`。因此：

- `killAllAnim = on`：自动动画启用；
- `killAllAnim = off`：自动动画禁用。

后文保留的 2026-07-26 `off` 快照只能证明当时该客户端禁用了自动动画，不能作为
“动画仍启用”的证据。2026-07-28 三组 A/B 结束后的完整 Chrome 重启复验记录为
`killAllAnim = on`，并确认动画模块全部恢复 active。今后迁移和验收必须同时核对
模块 active 状态、该客户端设置值和一次实际攻击动画，不能仅根据设置名称推断。

在较早的重复“战斗 → Activity → 切换重型场景 → 返回轻量场景”测试中，
Automated Animations 7.0.15 与 Sequencer 4.2.2 曾复现场景切换竞态：Sequencer
的 Sprite 已被销毁后，异步流程仍尝试写入 `volume`。随后 10 次操作没有再出现
异常，但由于当时对 `killAllAnim` 的含义记录错误，这组结果不能继续用作“关闭
自动动画后问题消失”的可靠 A/B 证据。当前采用的缓解措施是关闭两个模块的 debug、
保留动画功能，并依靠后续生命周期补丁和受控测试验证。

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

目标世界为 `cor-cotn`，运行时为 Foundry VTT 14.364、dnd5e 5.3.3。实际进程从 v14 code 启动，但 User Data 位于 `X:\FoundryData`；模块部署目标因此是该 Data 根下的 `Data\modules`，而不是目录名称所暗示的 v13 code。

### 已应用配置与回滚点

- Foundry 世界备份：`X:\FoundryData\Backups\worlds\cor-cotn\world.cor-cotn.2026-07-12.1783842679709.bak`，大小 1,624,389,972 bytes。
- 文件级回滚目录：`X:\FoundryData\Backups\codex-v14-production-20260712-155358`。
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

## 2026-07-24～26 世界级清理与地图纹理优化补录

这一阶段此前主要记录在世界审计、Actor-only 重新审计、Map Image Optimizer
证据和长期性能 Checklist 中，没有同步回本日志。以下以 2026-07-26 当前世界快照
为终点补录；历史全量实施值和最终当前值分开保留，避免把中间状态当成现状。

### Actor 审计与用户人工清理

原始世界审计记录 771 个 Actor。Actor-only 重新审计阶段：

- Actor `771 → 555`；
- 本阶段实际删除 216 个 Actor；
- 6 个真实 player-protected Actor 得到保护；
- 重新分类 GM/Assistant GM OWNER，避免把 GM 所有权误当成玩家保护；
- 仍列出 77 个 `no-detected-reference` 候选，没有把静态候选自动当成可安全删除；
- 审计同时发现 902 条断裂 Token→Actor 行，其中 69 个被删 Actor ID 与新增断裂有关。

随后用户继续人工清理。2026-07-26 当前世界快照为 516 个 Actor，即相对
Actor-only 审计的 555 又减少 39 个，相对最初 771 共减少 255 个（33.1%）。
这 39 个的逐项人工决策没有单独结构化进 Actor-only 报告，因此本日志只记录
“用户人工清理后的数量结果”，不反推或伪造逐个删除理由。

当前状态不是“Actor 清理完全验收通过”：断裂 Token→Actor 需要针对 516 Actor 的
现状重新审计。此前审计中的 902 是 555 Actor 时点的数据，不能直接当成当前精确值。

证据：

```text
.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/
.local/foundry-v14/evidence/cor-cotn-actor-audit-20260725/actor-audit.md
.local/foundry-v14/evidence/cor-cotn-performance/snapshots/2026-07-26-current-world.json
```

### Journal、Scene 与静态世界体量

从 2026-07-24 原始审计到 2026-07-26 当前快照：

| 对象 | 原始审计 | 当前 | 变化 | 状态 |
| --- | ---: | ---: | ---: | --- |
| Actor | 771 | 516 | -255 / -33.1% | 已实施；断裂引用待重审 |
| Journal | 415 | 78 | -337 / -81.2% | 已实施 |
| Journal Page | 734 | 246 | -488 / -66.5% | 已实施 |
| Scene | 295 | 252 | -43 / -14.6% | 已实施 |
| Scene Token | 2,836 | 2,667 | -169 / -6.0% | 已实施；Actor 引用待重审 |
| ChatMessage | 335 | 352 | +17 | 未优化，不能算作清理收益 |
| 启用模块 | 87 | 68 | -19 / -21.8% | 7 月 26 日快照；版本需按同步时点复核 |

这部分清理直接落在项目本地：

```text
.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn
```

因此同步完整 `server-mirror/Data/worlds/cor-cotn` 时会携带这些世界文档变化。只同步
`Data/modules` 不会携带 Actor、Journal、Scene、Token 和世界设置。

### 场景图片降像素与选择性恢复

Map Image Optimizer 2.1 全量应用阶段曾达到：

- 361 张不同优化图；
- 408 条 Scene/Level/Tile 优化引用；
- 220 个 Scene 使用优化图。

全量应用后又按低像素收益、SSIM 和人工可读性恢复部分小图或明显模糊的原图。
2026-07-26 当前世界重新统计为：

- 268 张不同优化图；
- 310 条当前优化引用；
- 132 个 Scene 使用优化路径；
- Scene/Level/Tile 图片引用共 442 条；
- 其中世界自有引用 399 条、模块资源 40 条、远程资源 1 条。

所以“361 张/408 条”是历史全量实施峰值，“268 张/310 条”才是选择性恢复后的
当前状态。`.mio` 中还保留历史与替代输出，目录文件数或体积不能直接当成当前引用数。

运行时所需内容都位于 `server-mirror`：

```text
.local/foundry-v14/data/server-mirror/Data/modules/map-image-optimizer-bridge
.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn/.mio
.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn/mio-bridge
```

同步线上时必须同时包含 Bridge 模块、优化图片和已写入新路径的世界 Scene 数据。
只传模块会缺图；只传世界数据库而漏掉 `.mio` 图片也会产生失效资源。

尚未完成的语义验收：

- 连续切换多张大图后的纹理缓存回落；
- 优化图在实际缩放倍率下的可读性和模糊度抽查；
- 30～50 分钟受控循环和真实长时跑团；
- 当前 Scene 的完整解码像素压力清单。

### 模块裁剪、设置与生命周期修复

同一阶段的当前快照还确认：

- 启用模块从 87 降到 68；
- MIDI-QOL：`Debug = none`、`Save to Chat Card = true`、
  `Use Weak References for Workflows = true`；
- Sequencer 与 Automated Animations debug 关闭；
- Automated Animations 在该历史快照中为 `killAllAnim = off`，按 7.0.17 实际源码
  语义表示该客户端当时禁用了动画；当前目标状态和 2026-07-28 A/B 恢复状态为
  `killAllAnim = on`；
- Foundry Core Performance Mode 为 2；
- Monk's Bloodsplats 14.01 生命周期守卫仍位于
  `server-mirror/Data/modules/monks-bloodsplats`；
- Automated Animations 7.0.17 的持久模板路径在来源 Token 存在时调用
  `tieToDocuments(sourceToken)`；
- Hide NPC Names 1.3.4 保留无 Actor/无 `prototypeToken` 的回退保护。

这些设置和模块补丁均属于本地 `server-mirror` 当前状态，但仍要在正式同步前重新
冻结模块 ID/版本和设置快照；模块更新可能覆盖本地 dist/source 补丁。

长期状态、当前快照和未完成验收以这里为入口：

```text
docs/acceptance/cor-cotn-performance-optimization-checklist.zh-CN.md
.local/foundry-v14/evidence/cor-cotn-performance/
```

## server-mirror 同步线上边界

当前部署模型就是把项目本地 `server-mirror` 作为未来线上同步来源，但同步单位不同：

| 内容 | 当前本地位置 | 同步要求 |
| --- | --- | --- |
| Actor/Journal/Scene/Token/设置 | `Data/worlds/cor-cotn` | 同步完整世界目录，并在停服/备份后执行 |
| 优化地图与替换登记 | `Data/worlds/cor-cotn/.mio`、`mio-bridge` | 必须与世界 Scene 路径一起同步 |
| Map Image Optimizer Bridge | `Data/modules/map-image-optimizer-bridge` | 同步模块目录 |
| Sync Token Actor | `Data/modules/sync-token-actor` | 本地使用 3.1.0 接替旧 `sync-token-name`；生产应先盘点现状，再决定安装/启停和设置 |
| Chat Memory Guard | `Data/modules/chat-memory-guard` | 同步模块目录；世界默认值随 `Data/worlds/cor-cotn` 同步，玩家客户端覆盖不属于世界数据库 |
| Sequencer Worker 上限 | `Data/modules/sequencer` | 当前补丁已直接写入该模块目录 |
| Simple Cover 5e 并发修复 | `Data/modules/simplecover5e` | 当前修订版已直接写入该模块目录 |
| Bloodsplats/AA/Hide NPC Names 生命周期补丁 | 各自 `Data/modules/<id>` | 同步对应模块目录并复核哈希 |
| Plutonium Quick Insert 兼容补丁 | `Data/modules/plutonium-cn` | 不属于性能优化；后来已按用户单独授权部署，见本文 2026-07-29 补充部署 |
| Blood Hunter homebrew | `Data/assets/homebrew/blood-hunter-2024.activities.json` | 不随世界目录同步；后来仅上传 JSON，导入和实战验收仍由用户完成 |
| 项目补丁器、测试、报告 | 仓库 `scripts/`、`docs/` | 不影响 Foundry 运行；用于重做、验证和回滚审计 |

不能把“复制整个 `Data/modules`”等同于“完整同步 server-mirror”：世界清理和地图
引用位于 `Data/worlds/cor-cotn`。正式上线前仍需生产停服、完整备份、源/目标版本与
模块清单复核；本日志不授权直接覆盖线上 LevelDB。

最终迁移的机器专属执行入口保存在本机私有运维记录中，不进入公开仓库。任何执行仍要求开始时做新鲜的生产只读盘点，并不因本日志存在而授权停服、复制或覆盖。

## Simple Cover 5e Actor 级并发修复（2026-07-26，本地）

本地 `server-mirror` 的 `simplecover5e` 已从上游 `2.2.0` 修订为
`2.2.0-cor-cotn.1`。修复范围只在模块内部，不修改 Foundry v14.364 核心源码。

根因是多个攻击/豁免 Hook 使用 `void setCoverStatusViaGM(...)` 同时更新同一个
Actor；原实现的“状态不存在 → 创建固定 ID ActiveEffect”不是原子操作，可能重复
创建 `dnd5ecoverTotal0` 等 dnd5e 系统效果。修订版按 Actor UUID 串行执行掩护状态
写入，不同 Actor 仍可并行；一次失败不会阻塞该 Actor 后续更新。

机械验证：

- Node 回归测试：`4 pass / 0 fail`；
- 语法检查：`status.mjs` 与测试文件通过 `node --check`；
- 模块清单可解析，实际运行版本为 `2.2.0-cor-cotn.1`；
- 本地 Foundry 重启后端口 30001 返回 HTTP 200；
- 模块目录不存在 `node_modules`，不会把开发依赖同步到线上；
- 上游 ESLint 依赖 `@bytestruct/foundry-eslint@1.0.2` 已无法从 npm 获取，因此
  本轮无法重建原包的 lint 环境；这项明确记录为未执行，不以语法检查冒充 lint。

实时语义验收：

- 在 B4 未链接巨蜘蛛 Token 的 ActorDelta 上同时发起 10 次全掩护写入；
- 10 次调用全部成功，只产生一个 `dnd5ecoverTotal0`；
- 没有重复 ID 或未处理异常；
- 随后恢复无掩护，测试 ActiveEffect 数量回到 0，原有 `poisonous` 状态保留；
- 完成一次正常刺剑攻击与伤害，聊天卡到达 `WorkflowState_Completed`；
- 重载后 MIDI Workflow Map 回到 0，Console error 为 0；
- 页面返回残纱沼泽，原叛神殿 Combat 仍保持第 3 轮第 8 回合、9 名参战者。

本轮正常攻击新增一条测试 ChatMessage，没有删除历史记录。

部署位置：

```text
I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\data\server-mirror\Data\modules\simplecover5e
```

以后同步整个 `Data/modules` 时，该目录会携带修复。模块内
`LOCAL_PATCH.zh-CN.md` 记录了来源、版本和验证方式；`module.json` 已移除上游
自动下载地址，避免同步后被原版 `2.2.0` 静默覆盖。

关键 SHA-256：

```text
CD2E8974069FEE7355BCF78CBD0C81AF9CE699654D01140768382F175BD01F90  scripts/cover/status.mjs
10B6133D16ED6DCA15650CECA31D6090F8CDE9595C348E17076E744780BEC4F7  module.json
FFB6A26AB534098E264E4DB99A3C96D580FB2470B5D849889B6615790FA9F30C  tests/cover-status-queue.test.mjs
```

## Sequencer Spritesheet Worker 上限补丁（2026-07-27，本地）

### 4.2 GB 归因与修复依据

本补丁之前的只读运行时诊断把 Chrome 显示的约 4.2 GB 拆分为 renderer、GPU、
V8 heap、纹理和 Worker 私有提交。关键证据为：

- 最大 Chrome renderer 工作集约 1,879.7 MB、Private Bytes 约 3,980.5 MB；
- GPU process 工作集约 781.4 MB、Private Bytes 约 5,352.6 MB；
- V8 heap used 约 765,941,660 bytes、total heap 约 852,705,280 bytes，不能单独
  解释约 4.2 GB；
- Sequencer 4.2.3 一次创建 7 个 spritesheet 解码 Worker，每个带一个
  299,958,272-byte WASM 初始私有提交区域；
- 七块合计 2,099,707,904 bytes，即约 2002.4375 MiB，是当时最主要且已经精确
  闭合的固定内存来源；
- Worker 上限只限制 WebM 到 spritesheet 的转换并发，不限制最终可同时显示的动画
  数量；没有空闲 Worker 时，转换任务排队，普通 WebM 先显示。

因此先实施最小、可回滚的 7→2 上限，而不是同时引入按需创建、空闲终止、WASM
重编译或大范围 Sequencer 重构。完整归因见
[`2026-07-26-fvtt-chrome-4.2gb-memory-attribution-report.md`](../reviews/2026-07-26-fvtt-chrome-4.2gb-memory-attribution-report.md)。

项目本地 `server-mirror` 的 Sequencer 4.2.3 已应用版本锁定、源码形状锁定的
spritesheet Worker 上限补丁。16 逻辑线程机器上的 eager Worker 计算从 7 限制为
最多 2；最低值 1、现有 Worker 等待队列、VideoAsset 回退和缓存路径不变。

机械验证：

- 专项测试 `13 pass / 0 fail / 42 assertions`；
- Foundry Lab `185 pass / 0 fail / 1114 assertions`；
- `bun run typecheck:all` 和 `git diff --check` 通过；
- 真实安装 dry-run、apply 和 restore dry-run 均通过；
- 原版相邻备份 SHA-256：
  `8F907DBBFC0611D3EBC2D1456C118A74041A7492753AFDE5EA96F303D77CFB68`；
- 当前补丁 bundle SHA-256：
  `08540669C22A5DE4986F515716E9BECB3BC1833A04C5E0832E6F11CB8B7799B0`；
- 重启后 `127.0.0.1:30001`、HTTP 和 `cor-cotn` 选择状态正常；
- HTTP 实际提供的 bundle 唯一包含补丁 sentinel 和上限公式，哈希与磁盘一致。

2026-07-28 的已认证 `/game` 运行时复验已经取代上述早期 `Blocked` 状态：

- Sequencer 4.2.3、Automated Animations 7.0.17 均在真实世界中 active；
- 使用 Automated Animations 公共 API 播放 20 次动画，其中 16 次重复既有资源、
  4 次引入新资源，全部完成；
- 前后 TextureLoader、PIXI Texture/BaseTexture 数、持久 Sequencer Effect、DOM
  elements 均没有增加，JS heap used 从 457.2 MiB 回落到 441.0 MiB；
- 首批不同动画后 renderer native private 出现高水位，但重复相同资源的增幅更小，
  冷却后也没有表现出固定斜率的 JS/PIXI/DOM 泄漏；
- 旧审计通过 `VirtualQueryEx` 观察到本地上限补丁下两个 Worker 各约 286 MiB、
  合计约 572 MiB committed；当前 4.2.3 源码也只构造两个常驻解码 Worker。后续
  `K32QueryWorkingSetEx` 已进一步确认这两个区域实际 resident 各约 1.15 MiB。

因此“未认证、未触发动画”的旧阻塞已关闭，WASM 区域的逐页 resident 口径也已由
后续调查闭合。仍未完全闭合的是 Sequencer 模块私有 `_totalCacheSize`：当前控制面
没有暴露 Blob cache 的实时 count/bytes。不能把 500 MiB 理论上限直接写成当前实占，
也不能把 Worker committed 上限差值当成 Chrome 物理 RAM 的精确下降量。

完整证据和恢复步骤见：

```text
docs/reviews/2026-07-26-sequencer-spritesheet-worker-memory-cap-report.md
```

## 未使用场景图移出世界包（2026-07-27，本地，选择性归档）

> 当前结论：最初 1,080 张的全量迁移被用户运行时验收推翻；完整回滚只用于恢复基线，
> 随后已按实际 MIO 启动请求选择性重做。用户在 `/join` 又发现世界背景图 404，
> 证明第一次选择性保护仍漏掉了 `world.json` 清单资源；该图现已恢复。当前 93 张
> 计划输出和 1 张世界背景保留在世界内，986 张仍在外部归档。未认证 `/join`
> 页面已真实刷新且零浏览器错误；2026-07-28 后续已认证世界、B5 场景和战斗测试
> 也能够正常进入。低频场景和全部动态模块路径仍未穷举，不把一次已认证会话外推为
> 全资源矩阵通过。

本轮直接整理项目本地 `server-mirror` 内的 `cor-cotn` 世界，但归档目标明确位于
`server-mirror` 之外：

```text
世界：
.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn

归档：
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727
```

因此以后同步整个 `server-mirror` 到线上时，归档图不会进入线上世界包；仍在使用的
图片和 Scene/Level/Tile 内记录的路径没有改写。

执行前，30001 已停止。世界被原样复制到只读审计副本，且在打开副本 LevelDB 之前
完成整树核对：源与副本均为 2,886 个文件、2,423,058,276 字节，树 SHA-256 均为
`4cb7de9bd9f9855deb01b36801b51af8b674dbded167873b33b4a302ee32e7e5`。
引用扫描只打开副本数据库，没有打开源世界数据库。

通用字符串扫描会在 Foundry Setting 中读到 MIO 历史操作的 `oldPath/newPath`，
它们是回滚记录，不是当前 Scene 引用。本轮因此使用以下判定：

- 当前 Scene、Level 背景/前景和 Tile 纹理字段作为运行时地图引用；
- 其他世界文档及世界 compendium 的当前图片引用作为额外保护；
- MIO 注册的原图/输出图以及 `scenes/` 下栅格图构成场景图候选池；
- 只有不与上述任何当前引用相交的现存文件才允许迁移。

当前扫描得到 400 条世界相对运行时地图引用、358 个不同路径。最终迁移 1,080 个
未引用场景图，共 1,733,210,505 字节；每个文件在归档中继续保留其相对于
`Data/worlds/cor-cotn` 的完整子目录。例如原来的 `scenes/tiles/.../foo.webp`
仍归档为 `scenes/tiles/.../foo.webp`，没有压平目录。

机械验证：

- 1,080 个文件移动前后 SHA-256 全部一致；
- 1,080 个源路径全部消失，归档目标全部存在，完整相对路径检查零失败；
- 二次干跑候选数为 0；
- 世界由 2,423,058,276 字节降为 689,847,771 字节，精确减少
  1,733,210,505 字节，与归档候选总量一致；
- `server-mirror` 重启后仅监听 `127.0.0.1:30001`，根页面 HTTP 200；
- 日志到达 `Launching World | Complete`；
- 356 个不同的现存世界内地图路径逐一执行 HTTP HEAD，356/356 返回成功。

发现两条迁移前已经缺失的 Level 背景引用：

```text
uploaded-chat-media/Urzin_by_Kent_Davis.webp
Exandria_-_Speculative-min.png
```

它们不在本轮迁移候选内，也不是本轮移动造成；本轮没有擅自替换或修复。除这两个
既有缺失项外，当前地图引用的现存路径均保持原位并通过 HTTP 验证。

恢复和审计入口：

```text
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/README.zh-CN.md
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/manifest.json
.local/foundry-v14/evidence/cor-cotn-unused-scene-images-20260727-current-snapshot/unused-scene-images.dry-run.json
.local/foundry-v14/evidence/cor-cotn-unused-scene-images-20260727-current-snapshot/http-active-map-verification.json
```

### 运行时失败与完整回滚修订

用户重新打开本地 FVTT 后观察到大量真实 404，例如：

```text
worlds/cor-cotn/scenes/Xhorhas_Bazzoxan_BetrayersRise_AbandonedChamber.__mio_v1_balanced_392x343_q88_8f44d513.webp
```

复核确认该文件确实在迁移清单中、世界路径缺失、归档文件存在，且 HTTP 实测为 404。
因此此前“当前 Scene 字段未引用即可迁移”的语义验收失败；356/356 检查只覆盖了
不完整的引用集合，不能证明其他候选不会被模块请求。

根因位于当前安装的 `map-image-optimizer-bridge`：

- 世界 `ready` 时自动发现最新 MIO 替换计划；
- `loadPlan()` 无论是否真正应用替换，都会调用 `verifyOutputImages(plan)`；
- `verifyOutputImages(plan)` 会遍历计划的所有 `assets`，为每个优化输出创建
  `Image()` 并实际加载、解码；
- 因而 MIO latest plan、selective restore 和 `replacementRuns` 中的输出路径仍是
  当前模块运行时依赖，不能作为纯历史日志排除。

失败后已停止经过 PID/命令行核对的本地 30001 服务，并按原 manifest 完整回滚：

- 1,080 个文件、1,733,210,505 字节全部恢复到原世界相对路径；
- 所有恢复文件 SHA-256 检查零失败；
- 本地世界重新到达 `Launching World | Complete`；
- 仅监听 `127.0.0.1:30001`，根页面 HTTP 200；
- 用户报告的具体 URL 已恢复为 HTTP 200；
- 全部 1,080 个恢复路径逐一执行 HTTP HEAD，1,080/1,080 成功。

恢复证据：

```text
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/restore-report.json
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/restore-http-verification.json
```

完整回滚不是最终停点，只用于回到一致基线。随后按用户要求继续定位并选择性重做：

- 最新 MIO 计划包含 351 个会由 `verifyOutputImages()` 实际请求的输出；
- 原 1,080 个候选中有 93 个属于这些计划输出，共 25,012,598 字节；
- 这 93 张全部保留在 `cor-cotn` 世界内；
- 其余 987 张重新归档，共 1,708,197,907 字节；
- 当前 351 个计划输出和 356 个现存地图引用合并为 449 个不同 URL；
- 449/449 HTTP 成功，用户报告的 `AbandonedChamber.__mio...webp` 返回 200。

随后用户在未认证 `/join` 页面发现：

```text
worlds/cor-cotn/scenes/The_Creation_of_the_Dragons_-_Ameera.jpg
```

根因是 `world.json.background` 直接引用该图；Foundry 会在进入世界前加载它。这说明
“数据库场景引用 + MIO 计划输出”仍不是完整依赖集合。已通过可复跑脚本核对
`world.json` 中的全部图片字段，只命中这一张归档候选，并按原路径恢复：

- 恢复 1 张、275,705 字节；
- SHA-256：`804299af409a0c6786b5be91d95ddbda15e14c1bb983b8ded61805992f4e9278`；
- 当前外部归档剩余 986 张、1,707,922,202 字节；
- 该图片 URL 返回 HTTP 200，响应长度与磁盘文件长度均为 275,705；
- 现有 Chrome `/join` 页面真实刷新后正常渲染世界标题、加入表单、游戏细节及描述，
  本次刷新产生的浏览器 error 日志为 0。

当前选择性清单和验证：

```text
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/selective-manifest.json
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/selective-http-verification.json
.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727/world-manifest-restore.json
```

当前部署含义是：同步 `server-mirror/Data/worlds/cor-cotn` 时，93 张启动校验所需图片
和 1 张加入页世界背景会正常随世界同步；986 张归档图片位于 `server-mirror` 外，
不会上线。机械验证、未认证 `/join` 和后续已认证 B5 场景/战斗会话均已通过；尚未
穷举全部低频场景和动态模块路径，因此迁移后仍需做代表性重型场景与 MIO Bridge
`ready` 复验。

## Chat Memory Guard 聊天卡内存守卫（2026-07-27，本地）

项目本地 `server-mirror` 已安装并启用独立模块 `chat-memory-guard`。它只管理客户端
已经渲染的聊天卡 DOM、说话者头像和模块自有缩略图缓存，不删除或改写
`ChatMessage` 文档，也不修改 Foundry、dnd5e 或 MIDI-QOL 源码。

当前世界默认设置：

| 设置 | 当前值 |
| --- | --- |
| 启用 | `true` |
| 已渲染消息上限 | `40` |
| 头像来源 | `token` |
| 图片模式 | `thumbnail` |
| 缩略图最长边 | `128px` |
| WebP 质量 | `75` |

行为与范围：

- 玩家位于聊天栏底部时，侧边栏或 popout 只保留最新 40 条已渲染消息；
- 玩家向上阅读历史时暂停裁剪，回到底部后再收敛到 40 条；
- 被移除的只是当前 DOM；向上加载时仍可由 Foundry Core 重新渲染历史消息；
- 头像缩略图使用会话内去重、有上限的 LRU Blob 缓存，刷新、隐藏、停用或卸载时
  撤销模块持有的 Blob URL；
- Token/Actor 头像替换要求 GM 身份或玩家对 Actor 具有 OBSERVER 权限；无权限时
  保留 Foundry/dnd5e 提供的系统头像，不根据名称猜测身份；
- “隐藏头像”会移除卡片头像容器内的 `img`/`video` 和 `src`，但保留 sender 文本。

机械验证：

- 模块专项测试 `26 / 26`，70 个断言；
- Foundry Lab `172 / 172`，1072 个断言；
- 最终全仓测试 `1421 / 1421`，6659 个断言；
- `typecheck:production`、`typecheck:all`、`ci:verify` 全部通过；
- 连续两次构建得到相同 ZIP SHA-256：
  `807A40FE488F6FB2D60615B693A5EE0D0A36F754F07BB1C655C23A3F22850C6F`；
- 构建产物与本地安装脚本哈希一致，模块安装位置为：
  `.local/foundry-v14/data/server-mirror/Data/modules/chat-memory-guard`。

GM 运行时验收：

- 禁用状态向上加载后 DOM 达到 50 且没有裁剪；重新启用但仍在阅读历史时保持 50；
  回到底部后收敛为 40；
- 一条刚裁剪的消息 `MNsGSZgeLL94rBD9` 能通过向上加载重新出现；
- 重新渲染的 MIDI 卡片 `srbKI5VT5AcPUifn` 能执行真实豁免，产生
  `tbnSdXkY3DeTUie4`，结果为 `1d20 = 16`，并保留 `originatingMessage`；
- 原 510 条消息的 ID、内容和 speaker 指纹保持一致。测试只新增上述一条真实豁免
  ChatMessage，没有删除或改写旧消息；
- 侧边栏与 popout 均收敛到 40，popout 关闭后模块监听器计数按 `1 → 2 → 1`
  释放；
- Token 缩略图、隐藏头像、系统原图和中文设置界面均通过真实页面抽查。

非 GM 运行时验收：

- 使用无密码玩家 `SY` 登录同一世界，确认 `game.user.isGM=false`；
- 17 张无 OBSERVER 权限的 Actor 卡片没有收到模块生成的 Token Blob 缩略图；
  一张有 OBSERVER 权限的角色卡正常得到有界缩略图；
- 临时切换玩家客户端为“隐藏头像”后，21/21 张已渲染卡片均无头像
  `img`/`video`、无头像 `src`，21/21 个 sender 文本保留；
- 模块缩略图缓存同时回到 0 条、估算 0 字节；
- 验收后玩家客户端已恢复“跟随世界默认值”，浏览器恢复到就绪的 GM 会话。

能力边界：

- “隐藏头像”证明的是模块处理完成后不再由聊天卡 DOM 或模块 Blob 缓存长期持有
  头像，不代表头像在整个生命周期中绝对从未生成或从未占用瞬时内存；
- Foundry Core/dnd5e 先生成聊天卡，模块随后在
  `renderChatMessageHTML` / `dnd5e.renderChatMessage` 生命周期中移除头像，因此
  浏览器可能已经发生短暂请求、解码或网络缓存保留；
- 无 OBSERVER 权限时模块不会新增 Token/Actor 替换，但 Foundry/dnd5e 原生系统
  头像本身有时就是 Actor 肖像。需要完全不显示时应选择“隐藏头像”；
- 本次短时 A/B 和代表性卡片验收不外推为完整第三方聊天卡矩阵或整场长时间跑团的
  绝对内存上限，这两项继续按性能 Checklist 做用户侧观察。

源码、构建、恢复与完整证据：

```text
src/foundry/chat-memory-guard/
dist/chat-memory-guard/chat-memory-guard.zip
docs/plans/2026-07-26-chat-memory-guard.md
docs/acceptance/chat-memory-guard-runtime-report.zh-CN.md
docs/acceptance/chat-memory-guard-manual-checklist.zh-CN.md
```

本轮只安装到项目本地 `server-mirror`，没有同步或修改生产服务器。

## 跨时点基线说明（2026-07-27）

2026-07-26 快照中的 516 Actors、252 Scenes、352 ChatMessages 是一个有明确时间戳
的世界快照，不应继续称为迁移时的“当前精确值”。后续只读运行时观测到 515 Actors、
252 Scenes、503 ChatMessages；Chat Memory Guard A/B 开始前又确认了 510 条原有
消息，测试后为 511 条，其中仅新增一条真实 MIDI 豁免消息。这些数字的变化说明世界
和聊天仍在继续使用，不代表任一较早快照造假，也不能相互覆盖。

正式同步前必须重新生成同一时点的完整冻结基线，至少包括：

- Actor、Scene、Journal、Journal Page、Item、Combat、ChatMessage 和 Scene Token；
- 启用模块 ID、版本与世界/客户端设置边界；
- 世界目录文件数、总字节和整树 SHA-256；
- 当前 Scene/Level/Tile 图片引用、已存在缺图和 HTTP 验证结果；
- 生产端同类快照及需要保留的线上独有维护结果。

在新的冻结基线产生前，本文所有数量都应按其日期引用，不得写成“线上将精确得到
516 Actors”或“当前只有 352 ChatMessages”。

## 2026-07-28 章节 Adventure、战斗 UI 与原生内存复验

### 原生 Adventure 逐章归档

已在世界级 Pack `world.cor-cotn-chapter-archive`（显示名称
`溟渊的呼唤：章节归档`）建立七个独立的原生 Adventure：

| Adventure | ID | Scene | 专属 Actor | Folder | Token |
| --- | --- | ---: | ---: | ---: | ---: |
| 红梦密会 | `IUIOaSRx8l7EazeG` | 16 | 62 | 9 | 212 |
| 第六章 | `d6GFwntrENpGwR94` | 9 | 13 | 5 | 87 |
| 第四章 | `RVss5zbuko093w5M` | 108 | 78 | 56 | 1,315 |
| 第四点五章 | `Ni8ZUaT8gLCNGv5q` | 1 | 2 | 3 | 9 |
| 第五章 | `TTZvGnVOyiB3jaAJ` | 35 | 28 | 10 | 340 |
| 第七章 | `6x9v6LzabvLLD896` | 2 | 0 | 1 | 0 |
| 妖精荒野 | `WeQIoZQzDV58cMW1` | 20 | 65 | 13 | 269 |

每章都完成了“创建 Adventure → 按精确 ID 剥离 → 原生 Import Adventure 恢复 →
实际 Canvas/Actor 语义检查 → 再次按精确 ID 剥离”。最终快照中，七个 Adventure
内的 Scene ID 和专属 Actor ID 与世界文档交集均为 0；2026-07-28 当时的世界快照为
268 Actors、61 Scenes、132 Folders。该数量只是带时间戳快照，不是未来迁移时的硬
断言。

恢复通过的含义是语义可用，不是数据库字节级还原：

- 顶层文档 ID、Token ID、位置、图像、墙体、灯光、区域和可用 Actor 引用得到恢复；
- 既存 missing Actor Token 没有新增，原有名称和图像占位保留；
- Foundry 会规范化部分元数据和 linked Token 的空 Delta；
- 第六章一个 Token、妖精荒野两个 Token 需要在 Adventure 内补充
  `delta.name`，第二轮恢复后名称语义才通过；
- 第四章在世界中已有同 ID 内容时做重复覆盖式导入，曾触发
  ActorDelta/dnd5e/MIDI 边界问题；正常使用路径应是“章节当前不在世界时再导入”；
- Adventure 只保存媒体路径，不复制或修复图片、音频、视频文件。

妖精荒野 Scene `tGvSIXUpenW0tZU2 / 市广场（哀怒）` 中两个已失效的
`terrainmapper.setTerrain` Behavior 已按用户授权删除：

- Region `Ly0gnunJI67KE6IQ` / Behavior `qarR8w9x0MaNbO3A`；
- Region `pUIG1zAcB0kBnKeX` / Behavior `2Vc0xVW2xJyX2jGL`。

两个 Region 及其形状保留，没有自动创建 `modifyMovementCost` 替代项；导入验证后
旧 Behavior 没有复活。

性能结论必须与归档可靠性分开：

- 红梦密会单章 A/B 中，剥离 16 Scenes 和 62 Actors 后没有任何可比内存项下降，
  帧间隔和 Long Task 也没有改善；
- 全部目标章节归档后的 B5 战斗样本稳定在 Chrome Working Set 约 2.68 GiB、
  renderer Working Set 约 1.26 GiB、JS heap used 约 443～465 MiB；
- 该样本低于较早基线，但场景、采样时点和 Chrome 辅助进程不完全一致，不能把全部
  差值归因于 Adventure；
- 当前证据支持“Adventure 是可靠的内容管理方案”，不支持“世界章节文档是 3 GB
  内存或战斗卡顿的主要根因”。

证据：

- `docs/runbooks/foundry-v14-native-adventure-workflow.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/red-dream-adventure-pilot-report.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/chapter-6-adventure-report.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/remaining-chapters-adventure-report.md`
- `.local/foundry-v14/evidence/cor-cotn-chapter-archive-20260728/remaining-chapters-final-state.json`

### 战斗卡顿与 HUD 取舍

B5 的空闲 Canvas 约 144 FPS，20 秒没有 Long Task；卡顿集中在换回合时的 Combat
更新、ApplicationV2 Tracker 全量替换和模块 Hook/UI 更新。已完成以下本地配置：

- Monk's Combat Details：`select-combatant=false`、`opencombat=none`、
  `popout-combat=false`、`auto-scroll=false`、`pan-to-combatant=true`；
- TAH Core 2.1.1 与 TAH dnd5e 2.1.0 保持启用；
- Argon Core 5.0.1 与 Argon dnd5e 5.2.1 已移出模块扫描目录，保存在
  `.local/foundry-v14/removed-modules/argon-20260728`；
- Automated Animations 保持 active，真实攻击和 Sequencer 特效播放通过；没有以
  禁用自动动画换取性能结果。

公平条件下，TAH 比 Argon 更快：

| 路径 | TAH | Argon |
| --- | ---: | ---: |
| 三次纯换回合 Long Task 总时长 | 182 ms | 219 ms |
| 三次真实点击关联 Long Task | 102 ms | 363 ms |
| 换回合后手动选中 Long Task 总时长 | 252 ms | 541 ms |

因此保留 TAH、删除 Argon 是基于可感知交互 A/B，而不是只看 DOM 数量。关闭 Monk
自动选中仍是正确优化；玩家需要时手动选择 Token，TAH 会更新到所选角色。

证据：

- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/combat-jank-root-cause-20260728.md`
- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/tah-vs-argon-performance-20260728.md`

### 约 1.5 GiB 原生池与 Sequencer

此前“两块未知原生池”已经推进到更具体的责任边界：

- 它们的外层形状符合 Chromium PartitionAlloc/GigaCage 地址池；reserved 地址空间
  不等于同等 RAM；
- Sequencer 4.2.3 的 WebM Blob LRU cache 源码硬上限为 524,288,000 bytes，
  即 500 MiB；这是容量上限，不是当前实占；
- 两个 Sequencer spritesheet 解码 Worker 的旧运行时实测合计约 572 MiB
  committed；后续逐页检查确认实际 resident 合计仅约 2.3 MiB；
- 当前 Foundry TextureLoader 实测约 254.094 MiB；
- Blob cache 是未观测到当前实占的容量上限，Worker 是 committed、TextureLoader
  是纹理估算；三项不能相加成 1,326 MiB 真实驻留内存，也不能用来解释两个
  PartitionAlloc pool 的全部 live resident。

20 次自动动画受控播放后，TextureLoader、PIXI cache、DOM、持久 Effect 和 JS heap
没有累积；renderer native private 抬高约 168 MiB，更像首次媒体/解码/allocator
高水位。精确知道 500 MiB Blob cache 当前用了多少，仍需要增加只读诊断暴露；在
此之前不应直接把上限降到任意值并宣称完成修复。

证据：

- `docs/reviews/2026-07-28-fvtt-1.5gb-native-pool-external-attribution.md`
- `docs/reviews/2026-07-28-fvtt-sequencer-native-memory-runtime-probe.md`
- `.local/foundry-v14/evidence/fvtt-native-memory-probe-20260728.json`

### Dice So Nice

Dice So Nice 6.2.9 当前配置已经关闭高成本的高 DPI、抗锯齿、bump 和 glow，并采用
较低图片/阴影质量。实测第一次 `1d20` 出现一次 82.4 ms 停顿；随后 `2d20`、
`8d6` 和三次热缓存 `1d20` 基本平滑。第一次投骰后新增 geometry、texture、
MeshDepth/cubemap/PMREM/标准材质 shader program，符合首次材质、环境贴图和 shader
编译预热，而不是每次投骰持续泄漏。

DSN 的主要视觉/性能配置位于 `dice-so-nice.settings` 客户端 scope，只对当前浏览器
生效；玩家不会自动继承 GM 当前设置。DSN 自己提供 Profiles & Data 的 GM 推送能力，
但推送玩家偏好属于另一次明确操作。本轮没有修改 DSN 源码或玩家配置。

### 动画模块三组完整 Chrome 重启 A/B

按用户要求完成三组各一次、每组完整退出 Chrome 后重开的同流程测试：

1. 当前动画栈全部启用；
2. Sequencer、AA、D&D5e Animations、Automated Evocations 关闭，JB2A 保留；
3. 上述运行时关闭并额外关闭 JB2A。

三组都在 Scene `RTb8HaqvexdHgtwf / B5.狂蛙人洞穴`，等待 60 秒后运行相同热身和
正式负载：3 次真实 `枯枝爪击`、5 次换回合、8 秒冷却。每组测试消息按 ID 清理，
Combat 恢复到第 11 轮、第 5 turn。

| 指标 | 当前全开 | 运行时关/JB2A 开 | 全关 |
|---|---:|---:|---:|
| Chrome Working Set | 2617.37 MiB | 2342.56 MiB | 2481.23 MiB |
| Chrome private | 3632.69 MiB | 2602.86 MiB | 2699.83 MiB |
| Renderer private | 1665.58 MiB | 1039.56 MiB | 1091.99 MiB |
| GPU private | 1557.59 MiB | 1182.88 MiB | 1206.82 MiB |
| JS heap used | 450.12 MiB | 411.33 MiB | 419.44 MiB |
| WorkerGlobalScopes | 18 | 16 | 16 |
| 帧 P95 | 7.6 ms | 7.6 ms | 7.6 ms |
| Long Task 总时长 | 444 ms | 553 ms | 479 ms |

当前全开相对“运行时关/JB2A 开”多约 `1029.84 MiB` Chrome private，其中
Renderer private 多 `626.02 MiB`，GPU private 多 `374.71 MiB`；这里的 private
指标主要是 OS private committed，不等于同量 resident。各进程 Working Set 求和多
`274.80 MiB`，但其中又包含共享页重复计算，也不能直接称为唯一物理 RAM。两个额外
WorkerGlobalScopes 与本地双 Sequencer Worker 上限一致；Renderer private 差值与
两个 Worker 合计约 572 MiB 的 committed 区域吻合，只能支持虚拟提交归因，不能
支持“Worker 实占 572 MiB 物理 RAM”。

卡顿指标没有随动画关闭稳定改善：三组 P95 完全相同，Long Task 也没有单调下降。
因此动画栈会显著改变 private commit，并在该次单轮 A/B 中改变 Working Set；但在
逐页 resident 纠正后，不能把全部差值归给 Sequencer Worker，也不能把它定为当前
短战斗周期性卡顿的唯一或稳定主因。仅关闭 JB2A 没有继续降低任何可比内存项，不能
将 JB2A 定责为 GiB 级来源。

测试后已再次完整重启 Chrome并确认五个模块全部恢复
`configured=true / active=true`；自动动画没有被永久禁用。

证据：

- `docs/audits/2026-07-27-cor-cotn-compendium-readiness/animation-stack-three-way-memory-ab-20260728.md`
- `.local/foundry-v14/evidence/animation-stack-three-way-ab-20260728.json`

### 真实驻留内存口径纠正

后续只读 `K32QueryWorkingSetEx` 逐页审计确认：

- 当前 Chrome 各进程 Working Set 求和约 `2.60 GiB`；
- 可安全跨进程求和的 Private Working Set 约 `1.93 GiB`；
- 其余约 `0.63 GiB` 是各进程视角的共享 Working Set，存在重复映射；
- Foundry Renderer Private Working Set 约 `1.20 GiB`；
- GPU 进程 Private Working Set 约 `449 MiB`；
- 两个 Sequencer/WASM 区域虽然各 commit `286.06 MiB`，实际 resident 各仅约
  `1.15 MiB`。

因此 Worker 上限主要降低 commit 风险，不等于按 `286 MiB/Worker` 直接释放当前
物理 RAM。Renderer 当前直接可见的 V8 live heap 约 `440 MiB`、Embedder heap 约
`129 MiB`、ArrayBuffer/backing 约 `85 MiB`。

后续完整枚举 AllocationBase 后又纠正了一项旧结论：原先约 `283 MiB` 的“匿名
resident 单块”实际上是第二个精确 `32 GiB` 的 Chromium
PartitionAlloc/GigaCage 系列地址池，不是某个 Foundry 或模块的单体缓冲区。最新
样本中 Renderer 三大 resident 地址组为：

- V8 heap cage：`407.81 MiB` resident；
- PartitionAlloc pool A：`402.07 MiB` resident；
- PartitionAlloc pool B：`266.02 MiB` resident；
- 三项合计 `1075.90 MiB`，解释 Renderer Private Working Set 的 `92.54%`。

两个 PartitionAlloc pool 合计 `668.09 MiB` resident。pool A 中至少三块 resident
commit 与 4096² token-ring 图集、2508² 当前 Scene 背景、2048² 角色图的解码
像素尺寸逐页吻合。Renderer 当前 121 个唯一 BaseTexture 的解码 RGBA 等效约
`192.30 MiB`，其中栅格化 SVG 图标/状态约 `76.27 MiB`。

GPU/Pixi 按 RED/RG/RGB/RGBA 实际格式修正后，58 个 managed texture 的 base-level
数据约 `230.48 MiB`，其中 13 个 RenderTexture 约 `111.09 MiB`。因此真实驻留的
下一轮重点改为图片 backing、SVG 栅格化、Canvas 全屏 RenderTexture 和 V8
retaining path；不以禁用自动动画作为默认方案。

证据：

- `docs/reviews/2026-07-28-fvtt-resident-memory-attribution.md`
- `docs/reviews/2026-07-28-fvtt-resident-memory-priority-investigation.md`
- `.local/foundry-v14/evidence/fvtt-resident-memory-probe-20260728.json`
- `.local/foundry-v14/evidence/fvtt-resident-memory-priority-investigation-20260728.json`

### 不修改源码候选项、排除结论与边界

以下是 2026-07-28 resident 调查后得到的下一轮候选项。除特别标记为“已确认”的
只读结论外，均**尚未实施**，不能写入生产迁移包或冒充已经取得的优化收益：

- `core.mipmap` 是客户端设置，可做单变量视觉/内存 A/B；关闭可能减少 GPU mipmap
  派生层，但也可能让缩放后的地图和 Token 增加锯齿或闪烁。
- Monk's Little Details 的 `add-extra-statuses` 是世界设置。额外状态 SVG 的栅格化
  是十余 MiB 量级候选，但关闭前必须确认 MIDI-QOL、DAE、Condition Lab 和现有
  Actor/Token 没有依赖这些状态。
- 2048² 角色图片解码后约占 16 MiB RGBA；若实际显示尺寸允许，单独降到 1024²
  理论上可减少约 12 MiB/张。此前压缩文件体积不等于降低解码分辨率，本项尚未执行。
- 可以建立只用于 Foundry 的独立 Chrome Profile，关闭无关扩展和视频标签，隔离
  Chrome 主进程、扩展和共享 GPU 进程开销；这只是测试/运行环境候选，尚未配置。
- GPU 侧 13 个 RenderTexture 合计约 111.09 MiB，仍需在 Foundry 单标签条件下
  映射到 Canvas、光照/遮罩、Dice So Nice、Token Ring 或模块滤镜的实际所有者。
- Maximum Framerate 主要降低持续渲染工作量，并不会按比例缩小已经解码的纹理或
  resident pool；限制过低还可能让动画更不流畅，必须按玩家显示器和 GPU 分级。

已经确认的排除和普通设置边界：

- Quick Insert 当前虽处于启用模块集合，但运行时 `searchLib === null` 且
  `hasIndex === false`；Duplicate UUID 警告不能解释当前约 408 MiB 的 V8 resident。
- Foundry v14.364 的 Canvas loader 会无条件把动态 Token Ring spritesheet 加入
  加载队列；普通 Token Ring 设置只能控制 Token 是否使用动态环，不能阻止核心图集
  加载。若要移除该核心图集，需要自定义资源/代码方案，不属于当前无源码优化范围。
- 核心和 dnd5e 的 SVG 图标会被浏览器栅格化；当前没有普通世界设置可以整体关闭
  核心 SVG。只能从可选模块附加图标或具体资源尺寸入手。
- “Dice So Nice 隐藏侧栏统计”和“Calendaria 聊天时间戳停止周期更新”目前只在
  卡顿诊断中被列为候选，尚未找到已实施 setting、scope 和运行时验收记录。两项状态
  必须先核对，不能记录为已完成；如无官方设置，则继续遵守“不改源码优先”。

### 下一轮优化的证据门槛

本地 v14.364 与 Foundry v14 官方 API 均确认：

- `TextureLoader.CACHE_TTL = 900000`，纹理默认保留 15 分钟；
- Scene draw 会以 `expireCache=true` 加载并清理超过 TTL 的非 pinned、非当前资源；
- 当前 TextureLoader 估算约 254 MiB；
- Foundry 的 Maximum Framerate、Performance Mode 属于客户端设置，适合按玩家机器
  分级，不应把 GM 的配置当成全桌统一状态。

因此下一轮不再泛化“还有很多 Actor/Scene”，而按以下顺序收集证据：

1. 先用专用 Foundry Chrome Profile、单标签和无关扩展关闭的条件重测 Renderer/GPU，
   分离宿主浏览器开销，并映射 13 个 RenderTexture 的所有者。
2. 暴露 Sequencer 私有 Blob cache 的只读 count/bytes，确认当前实占后再决定是否把
   500 MiB 上限改为客户端可配置的 128/256/500 MiB。
3. 对三张不同重型 Scene 做“切换后 0/5/15/20 分钟”TextureLoader 与进程内存曲线，
   先证明旧场景纹理确实占住再讨论缩短 TTL 或主动回收。
4. 分别对 `core.mipmap`、MLD `add-extra-statuses` 和 2048² 角色图降到 1024²做
   单变量 A/B；每项都要包含视觉/功能验收，不能同时修改。
5. 在当前 Monk/TAH 配置下重新抓一次换回合 CPU profile，拆出仍存的约 56～73 ms
   Hook/UI 成本；不再把已经证伪的 Argon 替换列为候选。
6. 核对 DSN 隐藏侧栏统计和 Calendaria 聊天时间戳是否存在可用设置及当前 scope；
   未证明已实施前保持 pending。
7. 如果用户接受，在世界 `ready` 后做一次不可见、不发聊天、不改变掷骰结果的 DSN
   预热，把首次 82.4 ms shader 编译移到加载阶段；自动动画和 3D 骰子继续保留。
8. 最后才做 2～4 小时真实玩家会话，判断 Chromium/媒体高水位是否需要会中刷新，
   并按玩家电脑分别设置 60/90/144 FPS 与性能模式。

外部核对：

- [Foundry v14 官方 `TextureLoader` API](https://foundryvtt.com/api/v14/classes/foundry.canvas.TextureLoader.html)
  明确提供 `CACHE_TTL`、`approximateTotalMemoryUsage` 和 `expireCache()`；
- [Foundry 官方设置说明](https://foundryvtt.com/article/settings/)明确区分客户端、用户和
  世界设置，并把 Maximum Framerate、Performance Mode 列为设备相关客户端设置；
- [Foundry 历史 issue #7122](https://github.com/foundryvtt/foundryvtt/issues/7122)
  证明 TextureLoader 缓存错误曾造成场景切换内存/速度问题，但该旧 bug 已修复，
  不能直接套用到 v14；
- [Dice So Nice 5.0 发布说明](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/tags/5.0.0)
  记录物理引擎已移到 Worker；当前剩余首次停顿更符合本地观测到的 shader/material
  warm-up，而不是旧版“投骰开始时物理冻结”。

## 2026-07-28～29 生产迁移补录

执行 ID `20260728-220757+0800` 已把本地批准候选迁移到生产 8080。当前状态为
`Partial`：

- 机械切换通过，正式世界与五个部署模块相对批准候选的逐文件差异为 0；
- Chat Memory Guard、Sequencer 7→2、Simple Cover、Hide NPC Names 已进入生产；
- MIO Bridge 已安装但按批准目标保持禁用；
- AA 与 Bloodsplats 因线上/本地整树一致而没有重复覆盖；
- 主迁移窗口中 `5e-dlc-monster` 因许可未确认而未部署；后续单独授权状态见本文
  2026-07-29 补充部署；
- GM/非 GM、轻重 Scene、Actor/Journal、Token、攻击/伤害、动画、Simple Cover、
  Bloodsplats、Hide NPC Names、Chat Memory Guard 和七章 Adventure 短程验收通过；
- 生产前快照已在一次性本地 DataPath 完成启动、GM 登录、用户/权限、模块状态和
  文档计数复原演练，归档原件没有直接启动；
- 同一 PID/浏览器会话完成 30 分 21.893 秒连续观测：启动 Heap 回落后保持约
  448～463 MB，第一轮动画后 Worker 从 10 预热到 18 并保持不变，纹理估算保持
  415,510,913 bytes，Nodes/Listeners 瞬时峰值可在空闲回落，服务端指标也没有
  单调积累；
- 第三、四轮离开重场景时，未替换的 FXMaster 8.2.4 均成对抛出 compositor
  `clear` TypeError。Canvas 和服务保持可用、没有残留，但该 finding 使连续观测
  运行时清洁度只能为 `Partial`；
- 4 小时真实跑团未完成，因此不能把“已经迁移”写成“长时性能目标已通过”。

生产公网入口为 HTTP IP，不是 secure context。Sequencer Spritesheet Generator
无法在线初始化；当前 7→2 只具有锁定源码和包体哈希机械证明，第三个 spritesheet
排队/完成仍未获得运行时证据。

## 2026-07-29 可选功能补充部署

此前表格和生产迁移补录中“未部署”描述的是主性能迁移窗口的历史状态。用户后来单独
批准功能补充部署，执行 ID 为 `20260729-013252+0800`：

- 血猎手活动 JSON 已上传，供用户之后通过 Plutonium 自定义导入；按要求未导入、
  未做内容或玩法验收；
- Plutonium `2.15.6` Quick Insert 精确补丁已部署，补丁 Bundle SHA-256 为
  `E2078FD773FD76A540136B1DA454AD591C2832C983425A391BDD7902AD326EBE`；
- `5e-dlc-monster` `1.2.0` 已安装并在 `cor-cotn` 启用，两个 Actor 合集索引均能
  通过 Foundry API 读取。

本节不改变性能优化验收状态；它只记录另外授权的功能部署。机器专属的机械证据、容量、日志、完整结果和回滚点保存在本机私有运维记录中；公开仓库不再保存可直接定位真实服务器的报告。
