# Batch6AA 主任务初次回传复核

日期2026-09-22；执行任务01a0c69d-c094-79f3-9acd-eb55b8d64fec。用户要求主任务复核后才更新验收。

## 当前决定

尚未据首次摘要增加PASS。执行器已被要求只补已有原始证据、不要重跑玩法或改世界；原summary文件保留。Z03清理待证据补齐和执行器释放浏览器，避免删除还需核对的对象。

## 已证实的落盘缺口

- c06-diagnostic.json是人工摘要：混合01:24施法、01:26效果更新、01:27再次推进；computedResultFromMacro=false被解释为谓词bug，但没有实际源码与完整每次报告。仓库交付r-shield-expiry-diagnostic.js没有c06Result字段，必须对照实际执行变体。
- c06-cast-readback.json未保留完整effect.toObject/duration/start/source；不足以独立检查expiry绑定。
- g04-g05-console-capture.json records只有四个通道名字，没有原始日志文本、资源URL或Troubleshooter本次内容。capture开始/停止成功不等同G04无新增Midi错误。
- g03-own-readback.json scene字段是shared Scene.k0tDQjWqrbvHbjdu，描述却是own-scene；可能为activeScene与viewedScene混淆，需要原始报告澄清。
- z02-final-readback.json只有shared/own-fixture标签，缺本轮初始baseline和完整UUID，尚不足以证明逐字段恢复。

## 后续

要求新执行任务在同一AA目录保存*-raw.json、实际C06变体源码、精确ChatMessage UUID及日志归因，区分每次运行，不覆盖原文件掩盖差异。主任务另对其原始工具记录作只读独立审计。是否关闭G05按总清单原验收条件和可用真实资源证据判断，不额外发明完整body-trace门禁。
## 独立工具记录复核

只读审计执行器rollout第1276行：01:26:36.328Z的round3→4实际包含updateActiveEffect(duration.expired=true)，before active/trackable/registered且AC+5，after inactive/expired/unregistered且AC0。第1315/1322行的01:27:08.256Z第二次round4→5，before已经过期且effect=null，仅有回合事件。初次c06-diagnostic.json混合了两次，必须更正并保留各自原始报告。实际执行宏确有自定义c06Result谓词，false原因未定，不能宣称是仓库原脚本bug或Midi错误。

第1299/1308行的Stop报告：实际有window.error、console.error/warn、unhandledrejection；多个参数按collector设计被omitted，时间及resource.url为空，只有Weak Reference warning有具体内容。drop0/conflicts空仅证明collector没声明丢弃/冲突，不证明无异常。G04尚不能通过，G05需要可归因资源证据。原E2E任务已被要求提取官方tab.dev.logs等既有原生日志，无法补回则如实报告并释放浏览器，不自行重造collector或重跑玩法。
## AA补件最终复核与AB边界

已查实际手工变体源码：c06Result始终可能为false，因为数据在before.actor.effect/after.actor.effect，谓词却读before.effect/after.effect。这是诊断变体字段错误，不是Midi缺陷。第一轮raw确有到期转变，但duration/start=null；C06保留部分行为证据，AB以完整e.toObject采集补全。

补件g03-own-readback-raw.json实际case为Q、capturedAt=2026-09-21T07:14:20.522Z；offscene为2026-09-21T07:16:50.634Z。两者是历史Q聊天，且normalRender中的hit/target-select header不等于真实damage tray。AA Apply/restore的9/22原始HP变化有效，但不可用→有效目标完整链仍不能关闭。总清单保持29/35。

新AB使用主任务固定ab-damage-tray-readback.js、ab-shield-expiry-diagnostic.js。业务逻辑/guards与原R脚本相同，仅发布每次独立AB报告、真实messageUuid和当前GM whisper；语法及独立审查通过。AB只补C06/G03/G04/G05和当次Z02，用官方Console/CDP事件采集，不复用丢失字段的AA collector。Z03待AB完成后由根执行。