# Chat Memory Guard / 聊天内存保护规则

## 这个功能是做什么的

本模块限制当前浏览器已经渲染的聊天卡片和头像媒体占用，避免长聊天 DOM 持续增长；它不删除世界中的聊天记录，也不修改 Foundry、dnd5e 或 MIDI-QOL 源码。

## 不可违反的规则

- 只裁剪浏览器 DOM。允许使用 Foundry 的 `ChatLog.deleteMessage()` 移除已渲染卡片；不得调用 `ChatMessage.delete()` 删除世界文档。
- 设置分为 GM 世界默认值和当前浏览器个人覆盖；不得让一个客户端的优化静默改写其他用户设置。
- 诊断和日志只记录计数、估算字节、失败数和有效设置，不得记录聊天正文、用户秘密或凭据。
- thumbnail 是页面会话级缓存，刷新/关闭后释放；不得把自动缩略图描述成阻止了首次原图请求。
- 本模块是独立 release unit，不依赖 generator、AI Intake、workflow、crawler 或其他 Foundry 模块私有实现。
- 本地 installer 不是生产部署；替换已存在同 ID 模块前必须执行 owned-module 检查和备份。

## 验证

- `bun run test:chat-memory-guard`
- `bun run build:chat-memory-guard`
- `bun run typecheck:foundry-modules`
- 运行时变化需在项目本地 Foundry 14.364 / dnd5e 5.3.3 中检查设置、聊天渲染、裁剪和 `game.modules.get("chat-memory-guard").api.getStats()`。

## 完成标准

- 世界聊天文档未被删除，浏览器 DOM/缩略图限制按设置生效。
- manifest、1.0.0 版本、构建目录和 ZIP 一致。
- 短时 A/B 只能证明被测场景；不得据此声称长时间跑团内存永不增长。
