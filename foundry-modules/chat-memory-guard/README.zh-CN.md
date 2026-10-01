# Chat Memory Guard / 聊天内存保护

这是一个拥有独立 manifest、版本、构建、测试、安装保护和验收边界的 Foundry module release unit。
它不依赖本仓库的 Actor generator、AI Intake、workflow、crawler 或其他 Foundry module 私有实现。

## 支持范围

- ServerNext manifest 兼容范围：Foundry VTT 14.368 / dnd5e 6.0.2–6.0.5（`verified` 保持 6.0.2）
- 原 Server Mirror 1.0.0：Foundry VTT 14.364 / dnd5e 5.3.3，仅作历史对照
- 模块 ID：`chat-memory-guard`
- 当前候选：`1.1.0`；6.0.2 上的安装、启用、重载与代表性 DOM 上限证据保留；6.0.5 的启用、重载和运行时读回待本次恢复验收。世界聊天记录保留、滚动阅读暂停及头像路径仍待补证

模块只裁剪当前浏览器已经渲染的聊天卡片。它调用 Foundry 公开的
`ChatLog.deleteMessage()`，不会调用 `ChatMessage.delete()`，不会修改世界中的聊天数据库记录，
也不会修改 Foundry、dnd5e、MIDI-QOL 或其他模块源码。

6.0.2 与 6.0.5 锁定 dnd5e 源码都在 `module/documents/chat-message.mjs` 中以相同签名触发
`dnd5e.renderChatMessage`；本次只扩展 manifest 上限，原 hook 与消息处理逻辑保持不变。

## 独立构建与测试

在本 workspace clone 中，先从仓库根目录安装锁定依赖，再进入本目录运行独立门禁：

```powershell
bun install --frozen-lockfile
cd foundry-modules/chat-memory-guard
bun run typecheck
bun test
bun run build
```

未来从过滤后的独立仓库 clone 构建时，由该仓库自己的 `bun.lock` 提供 frozen install；本次
workspace 迁移不把主仓库 lockfile 复制成第二份权威文件。

构建输出：

- `dist/module/`：可直接安装的 module 目录；
- `dist/chat-memory-guard.zip`：独立发布包。

在主 workspace 根目录仍可使用兼容命令：

```powershell
bun run test:chat-memory-guard
bun run build:chat-memory-guard
```

旧 `install:chat-memory-guard` 只指向本地 Server Mirror，且包含与当前无备份规则冲突的历史替换逻辑；`1.1.0` 构建在任何写入前会被此入口拒绝。ServerNext 只按迁移交接的离线定点安装流程处理，不创建备份，不运行旧安装入口。

## 设置

在“游戏设置 → 模块设置 → 聊天内存保护”中打开设置窗口：

- GM 世界默认值：供整个世界使用。
- 本浏览器个人覆盖：每位玩家可以跟随世界设置，或只覆盖自己的客户端。
- 默认保留 40 条已渲染消息。
- 默认优先 Token 图，并生成最长边 128px、质量 75 的会话级 WebP 缩略图。

设置保存后立即重新渲染当前卡片并应用。缩略图只存在于当前页面会话，刷新或关闭页面后释放。

## 诊断

在浏览器控制台运行：

```js
game.modules.get("chat-memory-guard").api.getStats()
```

结果只包含渲染数量、裁剪数量、pending 删除数量、缩略图缓存数量/估算字节、失败数、模块监听器
数量和当前有效设置，不包含消息正文。

## 已知边界

- dnd5e 在 Core `renderChatMessageHTML` 之后才创建头像。本模块在
  `dnd5e.renderChatMessage` 阶段、卡片插入聊天 DOM 之前尽量替换头像，但不声称能够阻止浏览器
  发起首次原图请求。
- 自动化和短时 A/B 运行时证据不能证明长时间跑团内存永不增长。
- 完整第三方聊天卡矩阵和少见动画头像仍需在真实跑团中持续抽查。
- 精确目标源码已核对 `ChatLog.deleteMessage()`、聊天 DOM、Core 与 dnd5e 渲染 Hook；这些静态依据不代替下面分项记录的真实客户端验收。
- ServerNext 的独立 Chrome 批次已核对模块正常启用、重载保持、临时客户端上限20下的聊天 DOM 25→20及新消息21→20；临时客户端设置已恢复。世界 ChatMessage 存储计数、滚动阅读暂停、头像缩略图/失败回退与 `getStats()` 未取得充分证据，因此仍是部分验收。
- workspace 物理迁移不会升级历史运行时验收结论；旧目标的真实运行时证据仍以
  `docs/acceptance/chat-memory-guard-runtime-report.zh-CN.md` 为准。
