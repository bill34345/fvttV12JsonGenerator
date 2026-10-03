# ServerNext 聊天内存保护 1.1.0 候选（2026-09-28）

## 当前结论

`chat-memory-guard` `1.1.0` 已在本工作树构建并安装到 ServerNext，精确目标为 Foundry `14.368` / dnd5e `6.0.2`。**安装、正常客户端启用/重载、设置读回及聊天 DOM 上限 PASS；世界 ChatMessage 存储计数、滚动阅读暂停、头像缩略图/失败回退和 `getStats()` 仍 INCOMPLETE。**旧 Mirror 的 `1.0.0` / 14.364 / 5.3.3 证据不跨版本使用。

## 精确源码核对

- 本机 Foundry 14.368 `client/applications/sidebar/tabs/chat.mjs` 仍提供 `ChatLog.deleteMessage()`、`updateMessage()`、`isAtBottom`、`.chat-log` 与 `.chat-scroll`；`deleteMessage()` 只从当前聊天 DOM 移除卡片，源码中只有用户显式删除动作才调用 `ChatMessage.delete()`。
- 14.368 的 `client/documents/chat-message.mjs` 仍发出 `renderChatMessageHTML`；`templates/sidebar/tabs/chat/log.hbs` 保留滚动容器，`templates/sidebar/chat-message.hbs` 保留 `.message[data-message-id]`。
- Next 已装 dnd5e 6.0.2 的 `dnd5e.mjs` 仍发出 `dnd5e.renderChatMessage`，在 `.message-sender` 下创建 `.avatar` 及图片/视频；与模块当前选择器相符。
- 14.368 的 ApplicationV2、HandlebarsApplicationMixin 和 `templates/generic/form-footer.hbs` 仍存在。以上只证明接口和结构候选，不能证明设置提交、滚动裁剪和头像处理在目标世界实际通过。

## 候选改动与机械检查

- `src/module.json` 和包版本改为 `1.1.0`，manifest 只声明精确 14.368 / dnd5e 6.0.2；移除与当前运行代码无关、且版本锁到旧 MIDI 14.0.11 的推荐关系。浏览器运行时代码未改变。
- 旧 `install:chat-memory-guard` 仍只指向 Server Mirror；新候选在任何写入前明确拒绝此入口，避免误写旧目标或触发历史备份逻辑。Next 必须按无备份的离线定点安装门禁处理。
- `bun run test:chat-memory-guard`：29 PASS / 0 FAIL。`bun run typecheck:foundry-modules`：PASS。`bun run build:chat-memory-guard`：PASS；包仅 6 个指定文件，ZIP SHA-256 `4D5236EDAD88DE971536ADAF070D803F00AC19F455E434455E8CCE35A7A26C62`。
- GM 正常 Return to Setup 后，`/api/status active=false` 且 23/23 个世界锁可独占；精确 PID39832 通过前台 Ctrl+C 正常退出。Next 目标原先不存在，核六文件清单与哈希后无备份安装；[停服前门禁](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/pre-install-gate.json>)与[安装回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/install-receipt.json>)保留了前后身份。
- 原参数重启后 PID42860 / 唯一 loopback30002 / 原 `cor-cotn` active、0 人在线；模块 `module.json` HTTP 200，ID/版本及本地文件哈希相符。[Server smoke](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/server-smoke.json>)只证明资源可访问，不能证明模块已注册或启用。
- 为遵守短时运行上限，Server smoke 后再次通过 GM 设置页正常关闭世界，复核 `active=false`、23/23 锁可独占，再让 PID42860 正常退出；最终 `30002` 无监听。模块六文件留在 Next 磁盘，世界未因安装直接改写。

## 独立 Chrome 正常客户端验收

[独立 Chrome 回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/cmg-chrome-acceptance-20260928-145916.json>)来自 GPT-6 Luna/max 独立任务，使用官方 browser-client 的可见 AX 操作；不是主任务的 HTTP smoke。截图：[模块管理](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/cmg-activation-20260928.png>)、[设置](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/cmg-settings-initial-20260928.png>)、[聊天页](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/cmg-chat-20260928.png>)。

| 场景 | 结果与边界 |
|---|---|
| 模块注册、启用与重载 | PASS。正常 UI 中 `1.1.0` 已登记；只启用这一项，active 84→85，重新登录后勾选保持，其余开关未改。 |
| 世界/客户端设置 | PASS。世界当前值为 enabled/40/hidden/thumbnail/128/75；客户端原为 follow=true、覆盖值40/token/thumbnail/128/75。临时设 follow=false、上限20，结束前已通过 UI 恢复原值。 |
| DOM 裁剪 | PASS。只读 DOM 读回可见卡片25→20；在底部正常发送一条后21→20，符合临时上限。 |
| 滚动阅读暂停 | INCOMPLETE。滚动上移实际出现非底部位置，但正常发送时 Foundry 自动滚回底部，未构成保持阅读位置时的裁剪对照。 |
| 世界 ChatMessage 保留 | INCOMPLETE。browser-client 的只读 DOM 评估不暴露 `window.game`，没有取得前后世界存储计数；源码没有调用 `ChatMessage.delete()` 的结论不能替代真实存储读回。 |
| 头像缩略图/失败回退、`getStats()` | INCOMPLETE。聊天页可见卡片及图片，但未取得足以证明缩略图尺寸、失败回退和 API 计数的受支持读回；未使用控制台注入。 |
| 测试对象清理 | PASS。唯一测试消息 `CMG-NEXT-20260928-1447-A7F3`（ID `Ex97UpeUKRPxR6uQ`）经正常上下文菜单删除，DOM 读回该卡片为0；世界集合全量计数仍未验证。 |
| 错误差异 | 本轮重载有10条 console error（8条既有 Item 校验、2条 Pixi 调用栈）及35条 warning，未见本模块错误；付费保护包签名错误仍按旧记录单列，不归因本模块。 |

**当前仅可称 LOCAL_PARTIAL。**下一次只补上表未完成的具体行为，先取受支持的只读数据路径，再选择最小真实交互；不要重跑已通过的启用、上限和设置场景。短时场景也不等于长期跑团内存验收。

本轮重新以 GM 设置页关世界时，第一次 5 秒状态请求超时，随后 10 秒读回为 `active=false`，23 个锁全释放。先前设置页/主菜单尝试的精确返回未捕获，不能断言其原因；加入页无管理员凭据的通用认证错误符合[Foundry 官方说明](https://foundryvtt.com/article/reset-admin-password/)。本轮没有设置管理员密码或修改 Foundry 核心。详见[唯一交接报告](../plan/server-next-migration-handoff-20260927.md)。

独立批次在14:59返回时因 GM Return to Setup 未成功而正常登出，服务仍为 PID2964 / `active=true, users=0`，没有强停。父任务随后只接手这项困难关服步骤：通过官方 Chrome 重新以 GM 登录并点击正常设置入口，`/api/status active=false`、23/23 锁可独占后，PID2964 正常退出，30002 无监听。[最终停服回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/chat-memory-guard-next-20260928/parent-final-shutdown-20260928.json>)。服务从14:27:59至15:11:01共2582秒，超过30分钟上限782秒；这是真实流程偏差，不计作额外验收时长，也不以分段测试掩盖。
