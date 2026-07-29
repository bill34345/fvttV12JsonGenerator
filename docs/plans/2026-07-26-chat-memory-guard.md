# Chat Memory Guard v1.0 实施计划

## Summary

在 `I:\OpenCode\fvttV12JsonGenerator` 中开发独立的 Foundry v14 模块 `Chat Memory Guard`，目标是限制聊天栏长期保留的 DOM、图片解码和事件监听器数量，同时保证 dnd5e、MIDI-QOL 及其他模块生成的可操作聊天卡片在重新加载后仍然可用。

实施基于本地锁定版本：

- Foundry VTT：14.364
- dnd5e：5.3.3
- MIDI-QOL：14.0.11
- 模块 ID：`chat-memory-guard`
- 默认保留：最近 40 条消息
- 默认头像：Token 图
- 默认图片模式：会话级 WebP 缩略图
- 默认缩略图：最长边 128px，质量 75
- 不删除聊天数据库记录，不修改 Foundry、dnd5e、MIDI-QOL 或其他模块源码。

Less Chat 的整体思路可参考，但不照搬其替换 ChatLog 内部方法的方案。v1 使用 Foundry v14 的公开 `ChatLog.deleteMessage`、`renderBatch`、`renderChatMessageHTML` 和 dnd5e 5.3.3 的公开 `dnd5e.renderChatMessage` Hook，尽量避免与 `ChatLog5e`、MIDI 和其他聊天模块争夺生命周期。

锁定源码已经确认真实渲染顺序：Core 的 `renderChatMessageHTML` 先执行，dnd5e 随后才在 `_enrichChatCard()` 中创建头像并设置图片 `src`，最后触发 `dnd5e.renderChatMessage`。因此 v1 不宣称可以阻止浏览器对 dnd5e 原图发起首次请求或开始首次解码；可验收目标是尽量在卡片插入 ChatLog DOM 前替换 dnd5e 头像，并证明原图不会因为本模块长期驻留于聊天 DOM、Blob URL 缓存或模块自有监听器中。

批准后的计划首先保存到：

`I:\OpenCode\fvttV12JsonGenerator\docs\plans\2026-07-26-chat-memory-guard.md`

## Architecture and Interfaces

### 模块代码与发布

源码放在：

```text
src/foundry/chat-memory-guard/
├── module.json
├── index.ts
├── settings.ts
├── chat-window.ts
├── avatar-policy.ts
├── thumbnail-cache.ts
├── diagnostics.ts
├── styles/
├── lang/
└── __tests__/
```

增加独立构建脚本和命令：

```text
scripts/buildChatMemoryGuard.ts
bun run build:chat-memory-guard
bun run test:chat-memory-guard
```

构建产物包括：

- `dist/chat-memory-guard/chat-memory-guard.zip`
- 可直接安装到本地镜像的模块目录。
- 安装目标固定为
  `I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\data\server-mirror\Data\modules\chat-memory-guard`

构建与安装流程不得覆盖未知同名模块；更新前验证模块 ID，并保留可恢复的上一版本备份。

### 设置模型

提供一个中文模块设置窗口，分成两层：

1. GM 世界默认值。
2. 每个玩家的本地覆盖值。

世界默认设置：

```ts
interface ChatMemoryGuardDefaults {
  enabled: boolean;             // true
  retainedMessages: number;    // 40
  avatarSource: "system" | "token" | "actor" | "hidden"; // token
  imageMode: "original" | "thumbnail";                    // thumbnail
  thumbnailMaxEdge: number;    // 128
  thumbnailQuality: number;    // 75
}
```

客户端设置：

```ts
interface ChatMemoryGuardClientSettings {
  followWorldDefaults: boolean; // true
  overrides: ChatMemoryGuardDefaults;
}
```

限制：

- 保留消息数：20–200。
- 缩略图最长边：48–256。
- WebP 质量：40–95。
- 非 GM 只能修改自己的客户端覆盖。
- GM 可修改世界默认值，也可为自己的浏览器设置个人覆盖。
- 修改设置后立即应用，不要求刷新页面。

提供只读诊断 API：

```js
game.modules.get("chat-memory-guard").api.getStats()
```

返回当前聊天栏渲染消息数、已裁剪数量、缩略图缓存数量、缓存字节估算、生成失败数和当前有效设置，不读取或返回消息正文。

## Implementation Changes

### 1. 聊天消息窗口管理

只控制浏览器中已经渲染的聊天卡片，不删除 `game.messages` 中的 ChatMessage。

行为固定为：

- 玩家位于聊天栏底部时，只保留最新 X 条已渲染消息。
- 玩家向上滚动查看历史时暂停裁剪，允许 Foundry Core 按批次加载旧消息。
- 玩家重新回到底部后，再恢复到最新 X 条。
- 侧边聊天栏和弹出式聊天窗口保持同步。
- 私聊、暗骰、GM Roll 和玩家权限继续由 Foundry Core 控制。

裁剪旧卡片时，按顺序调用当前 `ChatLog` 实例公开的：

```js
chatLog.deleteMessage(messageId)
```

该调用只移除对应 DOM、更新 Core 的历史游标并将 `message.logged` 恢复为未渲染状态，不调用 `ChatMessage.delete()`。

不得：

- 直接删除 `<li>`。
- 删除数据库消息。
- 替换整个 `ChatLog` 类。
- 修改 Foundry 私有字段。
- 拦截或重新实现 `/reply`、发送、通知、滚动和消息更新逻辑。
- 复制或缓存旧卡片 HTML。

用 `MutationObserver` 观察新卡片加入，用聊天滚动事件检测是否回到底部，并通过模块串行调度器、pending-message ID 集合和 DOM 移除确认防止创建消息、更新消息和裁剪同时竞争。

`ChatLog.deleteMessage()` 的公开 Promise 只保证 Core 删除任务已经进入其渲染队列；实际 `<li>` 会在约 100ms 删除动画完成后才移除。因此：

- 模块不得把 `await deleteMessage()` 当作 DOM 已移除的证明。
- 已提交删除的 ID 必须保留在 pending 集合中，避免重复裁剪。
- MutationObserver 确认节点消失后才清除 pending 并重新计算窗口。
- 动画期间允许 DOM 短暂超过配置上限；无新增消息后必须在 1 秒内收敛到上限。
- 若动画完成事件或 Mutation 丢失，调度器必须通过有界重查恢复，不能永久卡在 pending 状态。

### 2. 可操作聊天卡兼容

历史消息重新出现时，必须由 Foundry Core 的 `renderBatch` 和 `ChatLog.constructor.renderMessage(message)` 重新生成。

这样会重新执行官方 `renderChatMessageHTML` Hook，使以下内容重新挂载：

- dnd5e 攻击、伤害、豁免和资源按钮。
- MIDI-QOL 伤害应用、效果应用、撤销和专注按钮。
- Automated Conditions 5e 操作。
- Monk’s TokenBar、Monk’s Chat Timer 和 Monk’s Combat Details 的聊天交互。
- Dice So Nice、Hide NPC Names、Sequencer、Share Media、Plutonium 等当前启用模块的渲染 Hook。

模块自身不缓存第三方事件监听器，也不克隆已绑定事件的 DOM。

消息在未渲染期间被 MIDI 或 dnd5e 更新时，以 `game.messages` 中的最新 Document 为准；重新加载后不得恢复旧 HTML 或旧按钮状态。

### 3. 发言者头像控制

仅处理聊天卡左上角的发言者头像：

```text
.message-header .message-sender .avatar
```

不处理：

- 法术或攻击卡主图。
- Item 图标。
- 骰子图片。
- MIDI 伤害区域。
- 第三方模块插入的其他图片和按钮图标。

头像来源：

- `system`：保留 dnd5e `getPreferredArtwork()` 的当前行为。
- `token`：优先使用消息 Speaker 对应 Scene Token 的贴图，其次 Actor 原型 Token，最后回退 Actor 图或系统当前头像。
- `actor`：优先使用 Actor `img`，无法解析时回退系统当前头像。
- `hidden`：隐藏头像但保留标题布局和发言者名称。

安全规则：

- 玩家无权看到 Actor 身份、盲骰或隐藏消息内容时，不得通过 Token/Actor 图泄露身份；继续使用系统提供的作者头像或隐藏头像。
- Scene Token 已删除、Actor 缺失、随机 Token 无法确定或路径无效时使用安全回退，不做名称猜测。
- 不修改 Actor、Token、ChatMessage 或用户头像字段。

### 4. 会话级缩略图

缩略图只存在当前浏览器页面会话：

- 不写入世界目录。
- 不上传 Foundry 文件。
- 不使用 LocalStorage、IndexedDB 或 Cache Storage 做跨刷新缓存。
- 刷新或关闭页面后释放全部缩略图。

生成方式：

1. 在 Core `renderChatMessageHTML` 中处理该阶段已经存在的系统头像；在 dnd5e 5.3.3 的 `dnd5e.renderChatMessage` 中处理其后置创建的头像，并尽量在卡片插入 ChatLog DOM 前替换。MutationObserver 只做幂等补偿。
2. 将缩略图任务放入单并发队列，避免同时解码多个大头像。
3. 使用浏览器 `fetch`、`createImageBitmap` 和离屏 Canvas 等比缩放。
4. 输出 WebP Blob URL。
5. 立即关闭原始 `ImageBitmap` 并释放临时 Canvas。
6. 设置变化、LRU 淘汰或页面卸载时调用 `URL.revokeObjectURL()`。

不得使用 PIXI `loadTexture` 生成头像缩略图，避免把原始大图加入 PIXI 全局纹理缓存。

缓存按“标准化图片路径 + 最大边 + 质量”去重，最多保留：

```text
max(64, 当前保留条数 × 2)
```

并以 256 项为硬上限；超出时按 LRU 释放。

动画头像在缩略图模式下截取静态首帧并立即销毁临时 Video；无法安全解码时使用默认静态头像，不回退播放高分辨率动画。原图模式继续遵从系统原本的动画行为。

跨域、损坏或不支持图片只记录一次诊断警告，不中断聊天卡渲染。

## Test and Acceptance

### 自动化测试

自动化和代码级集成测试是首版的主要验收手段，覆盖：

- 保留 40 条、20/200 边界和无效设置修正。
- 仅在聊天栏底部裁剪；阅读历史时不裁剪。
- 裁剪调用公开 `ChatLog.deleteMessage`，不调用 `ChatMessage.delete`。
- 多次 Mutation、消息更新和快速连发不会产生重复裁剪或顺序错乱。
- 删除动画尚未完成时不会重复提交同一 ID；无新增消息后 1 秒内稳定收敛到配置上限。
- 回到聊天底部后恢复到配置数量。
- Sidebar 与 Popout 同步。
- 模拟超过 100 条消息，验证 DOM 窗口、消息顺序、重复加载和数据库消息数量。
- 模拟向上加载历史，验证旧消息经 `ChatLog.constructor.renderMessage` 重新渲染，而不是恢复缓存 HTML。
- 验证重新渲染会重新执行 dnd5e、MIDI-QOL 和第三方模块注册的 `renderChatMessageHTML` Hook。
- 使用代表性夹具验证攻击、伤害、豁免、应用伤害、应用效果、撤销和资源按钮的事件监听器会重新挂载，并调用预期 Document/API 边界。
- 模拟消息在未渲染期间被更新，确认重新加载时使用最新 ChatMessage Document 数据。
- Token、Actor、系统默认、隐藏四种头像策略。
- Scene Token、原型 Token和Actor图的回退顺序。
- 私聊、盲骰和不可见 Actor 不泄露身份。
- 缩略图等比尺寸、质量参数、WebP输出、去重和LRU释放。
- 设置变化及页面卸载会回收 Blob URL、Bitmap、Canvas 和 Video。
- 缩略图失败不会阻止聊天卡及按钮渲染。
- 模块禁用时恢复 Foundry 原生聊天行为。
- 通过测试夹具对比启用前后 DOM、图片元素和模块新增监听器数量，证明数量受保留上限约束。

### Codex 最小 Chrome 冒烟验收

Codex 不执行长时间战斗、反复切图或逐一点击所有第三方卡片。只在项目本地 `cor-cotn` 世界完成以下最小操作：

1. 启用模块，确认现有约 494 条数据库消息仍全部存在。
2. 位于底部时确认实际 DOM 保持在 40 条以内。
3. 向上滚动加载一批旧消息，确认旧消息重新出现；回到底部后再次恢复到 40 条以内。
4. 在一张重新加载的 dnd5e 或 MIDI 卡片上执行一个代表性操作，例如应用伤害或应用效果，并确认对应 Actor/Document 真实变化。
5. 切换 Token 缩略图、Actor 图和隐藏头像，确认显示即时变化且没有明显身份泄露。
6. 使用相同世界、消息集和滚动位置，分别在模块禁用和启用状态采集一次 DOM、图片元素、模块新增监听器和 JS Heap 快照，形成短时 A/B 对照；不要求长时间空闲观察或完整跑团。

### 用户人工抽查

交付一份简短的 `Chat Memory Guard 人工验收清单`，由用户在方便时或真实跑团过程中抽查：

- dnd5e 攻击、伤害、豁免和资源消耗/返还。
- MIDI Apply Damage、Apply Effects、Undo 和 Concentration。
- Monk’s TokenBar 及其他实际使用的第三方聊天按钮。
- 连续战斗、切换多个 Scene 后的聊天栏流畅度和内存变化。
- Token、Actor、隐藏头像以及少见动画头像的视觉效果。

这些扩展抽查不阻塞首版交付，但用户发现的按钮失效、历史丢失、权限泄露或明显内存回退必须作为有效缺陷记录和修复，不能以自动测试通过为由忽略。

### 完成标准

机械验证：

- 模块测试、类型检查和构建通过。
- ZIP 可以安装并被 Foundry 14.364识别。
- 没有修改 Foundry、dnd5e、MIDI 或其他第三方模块源码。
- 世界聊天数据库记录数量和消息内容没有变化。
- 代表性 dnd5e/MIDI 卡片夹具证明重新渲染、Hook 重挂载和按钮调用链成立。

语义验收：

- 默认只渲染最近40条时，旧消息仍可向上滚动找回。
- 最小 Chrome 冒烟中至少一个重新渲染的 dnd5e/MIDI 可操作卡片真实执行成功。
- Token/Actor缩略图选择符合设置，隐藏信息不泄露。
- 自动化压力场景中，聊天 DOM、图片和模块新增监听器数量被稳定限制。
- 短时 A/B 对照证明启用状态会在规定时间内收敛到窗口上限，并且模块不会长期保留已裁剪卡片的头像 Blob URL 或自有监听器；该结果不外推为长时间跑团内存稳定性。
- 首版完成声明必须明确：核心窗口管理和代表性卡片已验收；完整第三方卡片矩阵与长时间跑团表现等待用户按清单持续抽查。
- 若最小冒烟出现旧卡按钮失效、消息被删除、历史无法加载或权限头像泄露，均视为未完成，即使自动测试通过。

## Assumptions and Deliverables

- v1 只正式支持 Foundry 14.364、dnd5e 5.3.3 和 MIDI-QOL 14.0.11。
- 世界默认加个人覆盖是固定设置模型。
- 默认值为40条、Token、缩略图、128px、质量75。
- 缩略图只保留当前会话；刷新后重新生成。
- 只优化发言者头像，不处理法术、物品、骰子或第三方卡片主图。
- 模块不负责清理 MIDI Workflow 内部对象、PIXI Scene 纹理或动画缓存；这些属于独立性能问题。
- 当前脏工作区是实施基线，不从旧 `HEAD` 创建隔离 worktree，也不覆盖用户现有改动。
- 先在本地镜像安装验收；线上同步必须由用户另行明确授权。

最终交付：

- `chat-memory-guard.zip`
- 本地已安装模块
- SHA-256
- 中文设置与使用说明
- 第三方聊天卡兼容测试记录
- Chat Memory Guard 人工验收清单
- 短时启用/禁用 A/B 性能报告（不声称长时间跑团稳定性）
- 已保存的实施计划文档
