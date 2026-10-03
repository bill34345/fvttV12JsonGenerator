# Batch6AD：最后的C06单原生入口与真实到期

## 范围

官方外部Chrome，ServerNext http://127.0.0.1:30002/game / cor-cotn / Foundry14.368 / dnd5e6.0.2 / local.7。服务保持运行，原PID34548只读复核，不启停/重启/清锁；Mirror/30001只读。唯一shell workdir I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration，branch codex/20260919-151319-server-next-migration，HEAD b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d，保留dirty、不创建/切worktree、不提交。

新独立Luna Max/实际Full Access/never，不递归委派。本轮只关闭C06并做当次Z02；G03/G04/G05已有父方认可的证据，不重测全组，但随C06保留增量Console以识别本次异常。Z03/Z04由主任务执行。

## 已定位的测试错误

AC点击了Midi的button[data-action=midiApplyEffects]，又点原生effect-application button[data-action=apply]，是两次应用而非展开+确认。原生preflight之后又导航Scene，使game.combat回到shared；原生getEffectStart默认当前game.combat。没有证据证明单次正确应用的Midi源码缺陷，上游复核仍dnd6=4338eeab，未改local.7。

本轮不要点击任何Midi“Apply Active Effects”按钮，也不要手动点击原生最终Apply。由主任务给的固定原生生命周期宏在最后一刻正常render并复核own context，只调用那个原生按钮一次，然后走正常回合更新。它不直接创建/修改效果、不写expired/start/registry，也不伪造结果。

AC清理已使旧Shield effect离开collection，留作已记录的自有效果基线变化；不能重建它假装恢复。取本轮实时baseline。九个root仍留给根最后清理。

## 文件（不要自编或缩写）

1. ac-identity-shield-readback.js — 613C45A5CE52A0FE0547CB0A7E8CBFBD13B3887F5023CB0D51C2BC9167563549。只读六函数指纹、完整源数据、同源bundle GET；代码位置是CONFIG.ActiveEffect.documentClass.prototype.clone，不是不存在的MidiQOL.enchantmentClone。
2. ad-prepare-shield.js — AB6D3AF4992C87D36E014611F4A9E59A8C864D80692FBD3F1AF3F4BED8EA7788。正常API查看own Scene、选择唯一own Target、必要时slot0→1、记录并临时清除该自有Actor的固定AC override、render own tracker；保存before/after及准备门禁，不创建任何effect。
3. ad-native-shield-lifecycle.js — 05A6AC309560A72D32D9461963977CCBAAF13D251F9D8AEA107EDE6332DCEA25。弹窗输入本轮新Shield ChatMessage UUID；禁止使用准备时间2026-09-22T03:44:03.842Z之前的旧卡。正常打开native tray、点击原生选择按钮；只接受唯一own Target。点击前立即normal render own tracker并重验对象身份、inactive/shared state；原生Apply恰好1次。记录全部效果源/Hook，只有1个active且startOwn/registry/GM通过才原生own.update(delta0)到下一回合并记录到期。

第三份宏的profile、targets各最多等待3秒，Apply可用效果等待最多5秒，原生turn lifecycle最多10秒。每次等待后有上下文复核；发生他人切换时中止，不恢复/推进别人的状态。三项实际脚本mock拒绝测试及独立审查通过，不等于游戏运行通过。

## 精确执行

1. 主任务读回实际Full Access后放行。按当前URL绑定有效tab；旧ID失效就按URL重新取得，不用已释放对象。用户已授权Gamemaster空密码正常登录和自有测试操作。用官方API，不改工具代码/策略/代理，不旁路。
2. 保存live baseline完整UUID、shared clock/active/viewed Scene/Combat、targets、settings、own HP/slot/effects、helper原command。六指纹与bundlehash必须匹配local.7（1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC），可用固定identity宏。target effects空是AC已记录的结果，不伪造旧effect。
3. 在页面准备好后启用官方原生Runtime/Log观测及必要Network，记录起始cursor；每几步及时读分页落盘，truncated不可冒充完整，不刷新丢窗口，不保存headers/cookies/body/objectId。G04/G05无需重新跑一套，只捕获本次操作及异常。
4. 通过既有Helper Macro.GcNaY7ZO5aaqZo4n正常UI执行ad-prepare-shield.js原文，立即保存完整报告；contextReady/sharedUnchanged必须true。不要在此后再点击Scene导航。原始slot/targets/视图已在before中，但还要保留第2步baseline。
5. 打开自有Target角色卡，使用Item.tX2Mk5tbcWupZhmH的Shield正常Cast Spell一次；确认真正消耗slot并取得本次新ChatMessage UUID。**不要点midiApplyEffects，不要手动做最终Apply，不要额外攻击，不改反应配置。**
6. 将Helper命令改为ad-native-shield-lifecycle.js原文并执行。在正常DialogV2弹窗的New Shield ChatMessage UUID字段填入第5步实际UUID，点击Verify and apply once。宏会正常选择唯一Shield profile并检查native tray已有的唯一Target选择。若nativeApplyClicks=0且仅提示目标未选中，可在同一新卡的原生目标控件选唯一own Target后重跑宏一次；不要再Cast、不要改宏，不要点击另一个应用入口。若nativeApplyClicks=1后任何错误/超时，不得再Apply。
7. 成功证据不是“AD evidence saved”通知：必须读完整report。要求nativeApplyClicks=1、operationError不存在、afterApply恰好一个active/trackable/registered Shield、source.start.combat为own且AC+5；afterExpiry失效或正常删除/registry退出、总AC值及bonus回到beforeApply（afterApply的总AC应比beforeApply增加5，不能只看bonus），原生combatTurnChange及update/delete事件吻合、sharedUnchanged=true。完整duration/start/source字段必须保留，不能拼接不同运行。
8. 立即保存report原始JSON（带本轮messageUuid）、UI新卡UUID和Console/CDP窗口。若发生异常，报告单次native入口的完整source/stack/context，根判断是否改源码；不要自己修模块、删guard或伪造状态。
9. Z02 compare-before-restore本轮自有slot/HP/AC override（恢复准备报告before.acOverride，不硬编码10）、targets、own Combat round/turn、client scene/tracker和helper command。不要手写expired/start。正常到期后若仅有本轮新建的已过期effect残留，保留确切UUID并说明由根随Z03删除；不删除九个root，不重建AC已删除的旧effect。所有shared设置和时钟必须不变，不能把他人中途值写回历史常量。
10. 在tab仍有效时完成所有原始JSON/日志落盘并读回，关闭自己打开的编辑器，释放浏览器或markHandoff供根接续；不要final后再取证。

## 回传

证据唯一目录 F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AD-midi-qol-single-native-e2e-20260922。results-by-id.md逐C06/当次Z02，注明G03/G04/G05不重测但新增日志结果；原始证据独立文件，必须保留true messageUuid/date/source，不能只说raw留在Chat。
真实callbackThreadId=01a0c666-44c3-7010-8d64-7eb1582a5d7f；完成/实质阻碍先主动send_message_to_thread（Chrome 子任务回传）带文件绝对路径/ID/恢复状态及浏览器释放状态，再final。无整体时间上限，各操作合理超时，不无限重试；不归档、不递归委派、不改总清单。
夹具AC说明：本机dnd5e6.0.2 Attributes.prepareArmorClass明确在override为有限数值时直接令value=override，忽略bonus。AC基线有override=10。准备宏仅对自有Target记录原值并通过正常Actor.update清为空，以便观察真实总AC增加/恢复；效果应用与到期本身仍由正常流程完成。Z02必须恢复这项输入配置，compare-before-restore，不直接写AC bonus/value伪造效果。
