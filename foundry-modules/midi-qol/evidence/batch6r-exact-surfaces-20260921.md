# batch6R：精确组件、到期门禁与已授权清理

目标/候选/权限不变：external Chrome → ServerNext30002/cor-cotn/14.368/6.0.2/local.7，实际 Full Access、Luna Max，无整体时间上限；服务不启停，不操作30001/共享活动遭遇，不推进共享时钟。父方继续负责源码和总清单。

## 已复核结论，不重复测

- Q E03正常回合reset移除了Reaction used，结合M的真实使用/标记证据，E03通过。B04、C03/C04、A/D/F和正常短休也保留此前PASS。
- Q G03所选 `ChatMessage.fGGoACLxLRGRju92` 是 **Shield效果卡**，且读取了 `.midi-qol-hit-class.midi-qol-target-select`，不是 `midi-damage-application`。效果可以直接作用Actor，此报告不能判伤害面板补丁失败。严禁据此给效果路径加“必须Token”限制。
- C06保留“Shield未到期”的真实失败观察，但暂不归因Midi。核心到期链受 `game.user.isActiveGM`、`game.users.activeGM.isSelf`、`effect.isExpiryTrackable`、registry membership 等门禁约束，Q未记录。
- Q的`q-g05-browser-log-capability.evidence.json`不是合法JSON（toolCapabilityCheck写成了无key的object）。保留原文件，写修正后的合法JSON并注明原文件错误；仅记录真实工具结果，不重建不存在的Console数据。

## 顺序与可执行脚本

这些 `.js` 文件都是**原生 Script Macro body**，父方已做语法检查。使用现有自有 `Macro.GcNaY7ZO5aaqZo4n`，保持其名称 `AG-MIDI6P-E2E-HELPER-20260921`，避免创建/改名更多helper。按阶段替换command执行，不同时运行；通过ChatMessage中JSON读回落盘。

1. **G03**：只使用已知攻击伤害卡 `ChatMessage.90TrRGP4xYe3ppO2`。执行同目录 `r-damage-tray-readback.js`，其严格限定实际Midi伤害tray，记录renderer、targetingMode、row HTML/UUID/类型。若要求选择 recorded/targeted 模式，用正常tray控件选择后再运行；不要改message.targets。先在own scene记录有效Token，再切本客户端view到无该Token的scene读Actor-only行，再返回重绘。不可用条目无option、HP不变；正常有效Apply一次验证真实HP。脚本不Apply，实际Apply须正常卡操作。不能使用Shield效果卡或hit header代替。
2. **C06**：先用 `q-combat-view-preflight.js` 建立正确own tracker view，再执行 `r-shield-expiry-diagnostic.js`。它读取现有Shield `BSQ5I5WwZldPqtbT`的完整source、trackable、registry.has、sourceActor、start对象对应关系、duration.remaining、GM身份和expiryAction。在门禁不满足时只留证据，不伪造权限或手动register/refresh；门禁满足才正常推进own回合且worldTime.delta0，观察combatTurnChange、效果更新与未处理异常。不要替换内部逻辑、修改start/flags/expired或patchprototype。若仍失败，把原始JSON交父方；继续独立项和清理。
3. **G04/G05**：保留Troubleshooter原始baseline/delta。先核实当前正常CUA支持的日志能力；仅“没有能力”不是安全拒绝。若CUA无法读取Chrome Console，可以明确使用已有 **computer-use / @oai/sky** 对当前同一个外部Chrome作正常DevTools UI只读操作，先阅读该插件文档并重新发现窗口、确认URL30002。这是为缺失功能使用受支持的同浏览器UI，不是切换到IAB/脚本/CDP，也不能绕过任何工具实际安全停止。用户打开浏览器后O的正常URL识别已成功；若本次Sky仍返回停止则立即遵从，保存精确错误，不换下一路径。不得向Console输入脚本或清除日志。能读取则保存原始可见日志/截图；不能则仍PARTIAL，不能用Troubleshooter替代Console。
4. **Z02**：所有测试结束，compare-before-restore临时设置与本客户端scene/tracker view，保存读回，保留共享状态。
5. **Z03**：先保存本次证据，再将 `r-owned-fixture-cleanup.js` 原样写入上述helper执行。它核对exact UUID/name、跨scene/Combat引用、未知combatant和view状态，按ownCombat→ownScene→五Actor→两Macro的顺序用正常 `.delete()` 删除，保留全部现有消息，最后输出剩余对象/共享状态验证。它也会删除执行它的helper本身，JS已开始的执行可继续完成最后ChatMessage报告。若任何身份/引用门禁失败，给精确对象，不擅扩白名单；若真正delete失败，停止后续删除并回传具体错误。不要调用其它删除路径。

## 清理授权和证据

用户在实施计划中直接要求清理自有对象，之后要求整个A–G完成，并明确全权负责。developer规定已授权不重问，技能不扩大审批门槛；chrome-delegation-dev也明确不再索取确切自有fixture清理确认。Q甚至已在 `q-c06-old-shield-removal.evidence.json` 通过正常ActiveEffect.delete删除了旧效果。

本脚本只实现这项已授权清理，不授权删除陌生数据。请执行现有授权，不再向用户重复提问。若你认为有**实际更高优先级约束**，应区分工具真实拒绝与SKILL文字，并返回相应工具错误或SKILL文件位置，不能把自己的推断说成已发生的工具阻断；真实工具拒绝绝不绕过。

父方已独立审查cleanup脚本；发现的跨Combat引用/未知combatant守卫缺口已修正。3项离线测试、29次expect通过，验证确切九个root删除、保留无关数据/消息、拒绝全部风险输入，以及native失败后停止。这不替代实际Z03读回。

## 交付

目录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6R-midi-qol-local7-exact-surfaces-20260921`。
逐ID：C06、G03、G04、G05、Z02、Z03；E03引用Q已通过，不重跑；Z04父方最后复核。无新源码/安装，保留实际版本。回传父任务 `01a0b8d1-e8db-70f2-9662-fd9beb035162`，以“Chrome 子任务回传”开头，附原始数据和文件、清理结果/实际拒绝。不要扩大任务成API研究或再次用错卡片，不递归委派。
