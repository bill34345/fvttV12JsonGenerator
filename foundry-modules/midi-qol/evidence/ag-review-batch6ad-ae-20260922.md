# AD / AE 主任务复核（2026-09-22）

当前结论：33/35 有通过证据，A–G 全部关闭；Z03 清理和 Z04 最终交付未完成。AD 当次 Z02 恢复通过；AE 未进入世界，没有新修改，也没有当前客户端读回。

## AD：采用完整原文，纠正转录

独立任务 `01a0c747-1c5f-7300-8671-ad4d6cd0105f` 的实际 Luna Max / never / danger-full-access 已在放行前核实。

执行器的 `ad-native-lifecycle-raw.json` 为转录整理：将 effects 数组改成 effect 字段，并错误地给 createActiveEffect / afterApply.source 写入最终 expired=true。不得以此判定创建即到期。主任务从该任务官方浏览器 function_call_output 中的页面 AX 报告文本提取完整 JSON，未重跑玩法、未读取世界数据库。

原文目录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AD-midi-qol-single-native-e2e-20260922`。

- `ad-native-lifecycle-verbatim.json`：来源工具输出 2026-09-22T04:33:27.067Z；SHA256 `3A8F0957F0CBDB8480F419DDC07E9ED63AD29EECA2340A891D14A9F48E943888`。
- `ad-z02-verbatim.json`：来源工具输出 2026-09-22T04:35:32.338Z；SHA256 `8A1B2D79071F5EBCE3185AEA9C4E651A1A22448B2E449D75AD69E8337F98AEFA`。

C06：Cast ChatMessage.4Slb6hXF5MOU2yQg，报告 ChatMessage.8OMN8pkKMuEFm3ds。nativeApplyClicks=1，唯一效果 BalAVxdbbCIXxsAu；start 为自有 Combat.xYa05YifCrc4A3Dh、round1/turn1。create 与 afterApply 原文 expired=false，active/trackable/registered=true；实际 AC15→20、bonus0→5。正常自有回合1/1→2/1，原生 updateActiveEffect 写入 expired=true，combatTurnChange 完成；效果 inactive/unregistered，AC20→15、bonus0。共享 worldTime21085409、活动遭遇11/5不变。无需修改 Midi 源码。

Z02：ChatMessage.Roxlv5hwWrRyiFuL 确认 HP957、slot1=0、override10/value10/bonus0、自有回合1/1、targets空，view/tracker/gameCombat回共享，restored/sharedUnchanged=true。过期效果仍附于自有 Target，留 Z03 随该 Actor 正常清理；不重建 AC 阶段已删除的旧 Shield。

## AE：新任务清理未执行

用户明确改由新独立 Luna Max 清理任务执行。任务 `01a0c792-32fa-7463-88f1-5d9755d8cbee` 的真实 turn_context 已核实 Luna/max、never、danger-full-access；Fast 没有可设置字段，实际记录无 service_tier，不宣称已启用。

证据目录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AE-final-owned-cleanup-20260922`，包含 permission-verification.json、z03-z02-browser-blocked.json / .md。主任务已读回 JSON。

官方浏览器清单只有 iab，唯一一次显式 Chrome create 返回 Browser is not available: chrome，之后清单未改变。原生宿主检查 correct=true 只证明注册正常，不证明浏览器连接可用。主任务当前也未发现 Chrome 进程。没有进入 Foundry、未执行宏、未删除/修改任何世界对象，九个 root 均为 unqueried-action-not-attempted，不能写成删除或已缺席。

ServerNext PID34548 仍监听 127.0.0.1:30002；AE 核对 /api/status active=true、14.368 / dnd5e6.0.2 / cor-cotn，join200。服务未启停。前一主任务启动 Chrome 的命令曾被自动审查以 blocked by policy 拒绝，未尝试替代通道绕过。下一步为恢复官方外部 Chrome 提供方后，执行已授权的 r-owned-fixture-cleanup.js 并真实读回。Z03/Z04 不勾选，不派发无变化的重复玩法测试。
