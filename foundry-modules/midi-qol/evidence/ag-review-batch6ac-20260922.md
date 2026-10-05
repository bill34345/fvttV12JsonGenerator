# AC父方原始证据复核

## 结论

G04/G05可以关闭其指定的日志/资源验收边界。C06没有完成正确的单次应用/到期，仍未关闭；不把双入口结果直接当Midi源码bug。Z02 shared视图/时钟/设置已恢复，但自有效果baseline已变化，历史PASS不能冒充此次完全恢复。

## 实际动作

interaction-order.json及独立rollout审计一致：先button[data-action=midiApplyEffects]（实际Midi应用），后effect-application button[data-action=apply]（实际原生应用）。两者不是“展开再确认”的同一动作。最终native旧效果_stats.duplicateSource指向Item profile，system.origin.message指向本轮cast；另一个DAE效果flags.dae.activity/flags.midi-qol.castData明确不同生成路径。原始记录没有第一次应用后快照，不凭最终状态推算每一刻，但能确认双入口事实。

Q预检本身通过gameCombat/tracker own及targetInCombat；其后再次导航own Scene，最终tracker已shared。Foundry14.368 game.combat取当前rendered tracker.viewed；ActiveEffect.getEffectStart默认game.combat。故应用瞬间的context必须重新核验，不能沿用数分钟前预检。

## 原生日志

native-cdp-events.json有8个窗口，truncated均false：83 requestWillBeSent、83 responseReceived、83 loadingFinished、314 consoleAPICalled、4 Log.entryAdded、1 exceptionThrown。
32个console.error均为BFP frost-film资源加载错误。13条warning为getEffect(9)、MaskFilter(1)、createRiderConditions(1)、spellLevel(1)、measure loop(1)。唯一exception是自有C06诊断发现多效果后的guard；没有新增可归因Midi的JS异常。AB实际Troubleshooter的已知Calendaria类型错误单列，本次没有抹除日志。
Network中Midi bundle200/hash匹配；4个HTTP404是injury-1.svg和plutonium-cn skills.svg各2次，不归因Midi。没有保存敏感headers/cookies或body，窗口外不作承诺。

## 后续限定

已在03:27:40Z核查整个Midi上游release/branches/12个open MR，dnd6仍4338eeab、最新release14.0.12。未改四个源码补丁或local.7。
新增ad-native-shield-lifecycle.js通过正常Macro UI取得本轮新Shield message UUID，严格验证自身actor/item/scene及唯一native tray选择；在单次Apply前立即正常render own tracker并重验shared快照，只调用原生Apply按钮一次，不触发midiApplyEffects。随后记录create/update来源，满足one-active/startOwn门禁才走原生own.update(delta0)和expiry。无直接effect/expired/registry写入，错误真实报告。
独立审查的共享状态竞态已修复，3个mock guard拒绝路径实测通过；源码审查/单测不是玩法PASS。实际E2E必须新建Luna Max/Full Access任务验证。保留九个root，最后由根正常API清理，不重建已删除旧effect假装恢复。