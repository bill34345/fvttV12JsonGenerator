# batch6T：完成可执行的功能证据，清理由父方接手

仍用已正常连接的external Chrome / ServerNext30002 / cor-cotn / 14.368 / dnd5e6.0.2 / local.7，服务PID36368不变。无新安装，不操作30001/共享活动场景/遭遇/时钟。用户要求除E2E外由父方负责；**本单不让执行器删除九个root或再次询问清理许可，Z03由父方在回传后接手正式运维清理。**

S已经证明旧Shield `BSQ5I5WwZldPqtbT` expired=true、active=false、AC bonus=0。旧Q未到期观察不能据此追认完整转变，也不能继续称它一直失效失败。需要正常创建一份新的活动效果再测。

G03 rows=[]是测试读回缺口：原生 `shouldBuildTargetList` 要求可见且未suspended；之前重绘后未等待展开/可见。父方已经修正读回宏，正常打开Chat、展开tray、滚动卡片并等待真实可见（不写visible/target数据），输出完整presentation门禁。

## 按顺序操作

1. 正常核对目标、六指纹和baseline。全部输出中文。复用自有Macro.GcNaY7ZO5aaqZo4n，保持名称AG-MIDI6P-E2E-HELPER-20260921。
2. **G04/G05采集开始**：运行同目录 `t-console-capture-start.js`。这是测试专用原生Script Macro，给console.error/warn加透传记录并监听错误/资源事件，不改Foundry/dnd5e prototype，不阻止原日志，不改workflow或业务数据。对象参数故意不展开，防getter副作用；只记录此后发生的事件。确认开始消息仅whisper给当前GM。不要刷新页面，否则会丢失当前capture。
3. **G03**：运行更新后的 `r-damage-tray-readback.js`。只针对实际攻击卡90TrRGP4xYe3ppO2中的midi-damage-application。依次在own scene正常有效、无目标scene Actor-only、返回own scene读回。必须看到presentation.shouldBuild=true；若仍false，保存open/visible/suspended/connected，不把rows=[]当补丁失败，不反复同样操作。正常UI选择targeted；不可用行不能有可应用option，HP不变；返回有效后正常Apply一次验证HP。按正常API恢复自有HP后保留证据。
4. **C06新效果**：先本客户端view own Scene，再运行q-combat-view-preflight.js（次序不能反过来）。确认own tracker/game.combat/target.inCombat。通过正常Target的Shield活动重新施放并正常Apply效果；自有spell slot可准备为1，禁止手动创建期望效果/写expired/start。原生流程可以复用或新建effect，但此刻应只有一个active Imperceptible Barrier且start绑定own。
5. 执行更新后的 `r-shield-expiry-diagnostic.js`：已改为选择唯一active Shield，不再硬编码旧expired ID；读取GM/registry/source门禁，正常own下一轮，等待真正combatTurnChange完成或10秒诊断超时，再读回effect/AC。不得手动registry.refresh、改flags或伪造结果。若正常施法无法建立唯一active效果，保存实际失败而非跳过后宣称已测。
6. **仅补G04的日志证据**：B04/C03/C04已通过，不重跑全组；若前两例没有触及新附魔clone，可使用既有正常Magic Weapon活动/真实消息再做一次正常applyEnchantment与正常移除，目的只是在本次采集窗口核对local.7新增路径无错误，引用已过C03/C04，不重写历史版本。
7. 完成时必运行 `t-console-capture-stop.js`：立即恢复原Console函数/移除监听，把脱敏报告只whisper给当前GM，验证消息whisper recipient，按界面读回落盘。发布失败时报告留在当前client，重跑Stop可恢复，不能刷新抹掉；不要人为清空日志。保存dropped/conflicts以及对象省略、预绑定别名和resource timing的局限。此证据不声称历史DevTools日志或完整网络跟踪。
8. **Z02**：compare-before-restore本次设置、client scene/tracker/targets，以及仅为自有fixture准备的状态。不要覆盖他人介入的值。保留现有fixtures，输出当前精确UUID/状态清单交父方清理；不再让用户确认删除。

如果任何工具真正安全拒绝，遵从并准确回传，不更换控制路径绕过。缺少DevTools接口不需要去Sky或CDP，本次已提供应用内正常测试观测方式。没有拒绝时继续上述实际步骤；不要将未经读取的技能条款扩展为新的测试审批要求。

## 回传

证据：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6T-midi-qol-local7-functional-close-20260921`。
逐C06/G03/G04/G05/Z02；Z03明确“转父方运维清理，尚未执行”。原始JSON需可解析，Console报告必须注明采集来源和局限，不等同DevTools。完成/实质阻碍时先send_message_to_thread回 **01a0b8d1-e8db-70f2-9662-fd9beb035162**，中文“Chrome 子任务回传”，再final。父方负责判断PASS和最后清理/交付，不递归委派。
