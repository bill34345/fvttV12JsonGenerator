# Chat Memory Guard / 聊天内存保护

这是一个拥有独立 manifest、版本、构建、测试、安装保护和验收边界的 Foundry module release unit。
它不依赖本仓库的 Actor generator、AI Intake、workflow、crawler 或其他 Foundry module 私有实现。

## 支持范围

- Foundry VTT 14.364
- dnd5e 5.3.3
- MIDI-QOL 14.0.11
- 模块 ID：`chat-memory-guard`
- 当前 release：`1.0.0`

模块只裁剪当前浏览器已经渲染的聊天卡片。它调用 Foundry 公开的
`ChatLog.deleteMessage()`，不会调用 `ChatMessage.delete()`，不会修改世界中的聊天数据库记录，
也不会修改 Foundry、dnd5e、MIDI-QOL 或其他模块源码。

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

`install:chat-memory-guard` 只允许写入项目本地 Foundry mirror 的精确目录，并在替换已有同 ID
模块前创建备份。它不是生产部署命令。

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
- workspace 物理迁移不会升级历史运行时验收结论；真实运行时证据仍以
  `docs/acceptance/chat-memory-guard-runtime-report.zh-CN.md` 为准。
