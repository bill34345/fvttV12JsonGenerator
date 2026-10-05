# batch6Q：只补正确上下文、目标渲染与收尾

local.7 未改源码或资源，PID36368保持。P已复核通过 B04/C03/C04和当次Z02，不重复。剩余 C06、E03、G03、G04/G05证据及Z03；Z02在Q结束再次核对。总目标仍全部A–G，不以本执行单代替完成。

## E03 / C06 正确遭遇上下文

P执行了 `ownCombat.view()`，而此前指定的是 `ui.combat.render({force:true, combat:ownCombat})`。前者并不存在，失败不能证明后者不安全或不可用。

1. 在正常UI打开 Combat Tracker，再将同目录 `q-combat-view-preflight.js` **全文作为自有 Script Macro body**执行。父方已对照14.368源码并做语法检查；不得替换成 Combat.view/activate。脚本只切本客户端tracker view，生成只读证据ChatMessage，不改worldTime/activeCombat。
2. 必须得到 `trackerRendered:true`、`gameCombat===ownCombat`、`targetInCombat:true`，共享状态前后一致；记录 `originalViewedCombat` 用于结束恢复。如果不符，回传实际读回，不能跳过门禁施法。
3. 对自有Combat用正常 `update({round:1,turn:targetCombatant在turns中的实际索引},{worldTime:{delta:0}})` 建立起始回合，保持active:false。不能改共享Combat。再次核对game.combat仍own。
4. **重新正常使用/应用一份 Shield 效果**，不能复用P绑定共享Combat的旧效果来测本场到期。准备自有spell slot允许，但不直接构造预期effect或改start。创建后确认effect.start的combat实际指向own；若指向shared，先停止本case，不手动修改绑定。
5. C06：正常推进own至下一round的同一source turn，仍worldTime.delta=0；等待原生异步文档事件，确认 Shield失效/移除、AC恢复。只改界面round或手填expired不算。
6. E03：M已证明真实use建立used-state。补正常reset，可以在实际used-state=true时执行normal `actor.shortRest({dialog:false,advanceTime:false,chat:false,autoHD:false})` 并等待异步事件，验证used-state/marker不再生效，worldTime不变；或验证符合当前配置的正常回合reset。不能直接改reaction flags/delete marker来冒充reset。
7. 结束使用同一render API恢复原client tracker view，逐项恢复自己临时配置。不要activate任何Combat。

源码依据：core game.mjs1691的game.combat使用rendered tracker.viewed；CombatTracker._configureRenderOptions读取options.combat；Actor.inCombat查询该game.combat。dnd5e sourceStart expiry只响应effect.start绑定的combat，因此P的shared绑定不能由own推进验证。

## G03 正确判定

Patch0003保护的是“渲染时解析成 Actor-only、缺失或无Actor Token 的条目”，并不规定任意off-scene Token都不可操作，也不禁用整个卡的外层Apply。P仅记录目标名称/外层按钮，没有记录当前row UUID或禁用属性，不能据此定源码FAIL。

1. 用本任务真实卡、真实目标，记录 `message.system.targets`，目标Actor/Token UUID，以及目标行实际DOM的class、aria-disabled、dataset、option/value和按钮。
2. 切自己的view到没有该Actor Token的场景。调用正常 `await ui.chat.updateMessage(message)` 重新渲染该真实卡（原生ChatLog5e公开方法），展开伤害tray；不改message targets/workflow结果。dnd5e只在首次canvasReady统一刷新recorded-targets，不能把旧DOM缓存当重新解析结果。
3. 记录fromUuidSync(row实际uuid)的documentName/actor以及新DOM。若解析Actor-only，应为midi-unavailable-target/aria-disabled且没有该行可应用option。外层Apply存在本身不FAIL；保留HP不变证据。
4. 返回原view，再正常ui.chat.updateMessage、展开，确认Token/Actor有效且正常Apply一次，HP正确变化。P的957→941实际Apply可保留，但还需把本次render分支联系起来；不重复对同卡不确定操作。
5. 若刷新后仍错误，把**真实row uuid、解析类型、targetingMode与DOM**回传父方；不要直接写新补丁或自设所有离场目标禁用规则。

## G04/G05

Troubleshooter的P delta支持无新增记录，但不替代Console。先检查当前正常工具文档是否提供日志读取；若没有，可以尝试当前同一获准Chrome控制路径支持的正常DevTools UI读取（不向Console输入业务脚本、不启动CDP或别的旁路）。若该UI/读取不可用，保存精确能力限制，仍PARTIAL，不补写通过、不切换路径绕过安全停止。

父方已在 P/parent-network-check.json 实测 status/bundle/map为200；BFP frost-film为404且磁盘不存在，属于已记录其他模块资产缺失。这是直接HTTP诊断，不能称作浏览器Console或网络日志。记录该边界，不重复调研源码/修其他模块。

## Z03 已授权清理

用户原计划明确要求清理自有文档，后续又明确全权负责。developer规定用户授权优先于SKILL且不得重复请求已有授权；chrome-delegation-dev也明确不重问确切自有fixtures清理。P报告中的action-time门槛来自computer-use的低优先级SKILL解释，不是已经发生的工具拒绝。应执行已授权的确切自有删除；若工具实际拒绝，报告原错误，不能自行推定需要再次询问。

Q完成测试后按 P/z03-pre-cleanup-inventory.evidence.json 逐UUID和任务归属核对，清理其deleteSet及Q新建对象（含可能模板/Region），保留messagesToPreserve和必要新证据。先恢复本客户端view再删自有Combat/Scene，不能删共享对象。原生delete API已在C04成功使用；同样只作用于清单中自有对象，不直接编辑数据库。逐UUID再读确认不存在，最后helper Macro自删并以已保存证据/集合读回核对。无需新的确认。

## 回传

目录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6Q-midi-qol-local7-remaining-20260921`。

按 C06/E03/G03/G04/G05/Z02/Z03 逐ID返回原始证据和精确状态，不能宣告所有A–G通过。父任务：01a0b8d1-e8db-70f2-9662-fd9beb035162。外部Chrome/FullAccess/LunaMax不变，无整体时间上限，服务不启停，不递归委派。真正源码失败交父方处理，其余独立项继续。
