# batch6X：新主任务剩余玩法执行单（已准备，尚未派发）

目标external Chrome / ServerNext30002 / cor-cotn / 14.368 / dnd5e6.0.2 / local.7。2026-09-22 08:00主任务已验证服务PID34548；执行前重新只读核对，不把该PID当永恒事实。2026-09-22 08:54主任务已修复Statsig压缩传输，官方外部Chrome已实际打开/读取Example Domain并点击到IANA成功。本单必须由全新独立Luna Max任务执行，先实际核实Full Access；本单玩法尚未执行。无新安装，不操作30001/共享活动场景/遭遇/时钟。用户要求除E2E外由父方负责；**本单不让执行器删除九个root或再次询问清理许可，Z03由父方在回传后接手正式运维清理。**

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

证据：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AA-midi-qol-local7-new-thread-e2e-20260922`。
逐C06/G03/G04/G05/Z02；Z03明确“转父方运维清理，尚未执行”。原始JSON需可解析，Console报告必须注明采集来源和局限，不等同DevTools。完成/实质阻碍时先send_message_to_thread回 **01a0c666-44c3-7010-8d64-7eb1582a5d7f**，中文“Chrome 子任务回传”，再final。父方负责判断PASS和最后清理/交付，不递归委派。

## 本轮范围和启动门禁

- 由独立任务的gpt-5.6-luna/max执行，不递归委派。开始前由主任务通过受支持方式核实实际Full Access（unrestricted filesystem、无常规审批）；提示词授权不等于运行配置。不得编辑隐藏权限状态。
- 只读工作目录固定：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration`；branch `codex/20260919-151319-server-next-migration`；HEAD `b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d`。不创建/切换worktree，不修改源码或总清单，不commit/merge/push。
- 本轮执行：C06、G03、G04、G05和当次Z02。Z03留主任务正常API清理，Z04留主任务证据复核交付。
- 已通过不重测：A01–A05、B01–B04、C01–C05、D01–D04、E01–E03、F01–F04、G01–G02、Z01；日志窗口按第6步确有需要时触及已过附魔路径，不能重标历史PASS版本。
- 浏览器连接成功后核对URL、world、六函数指纹，特别是enchantmentClone；bundle SHA256 `1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC`。不重复安装local.7。
- 开始读取本次实时baseline，结束compare-before-restore；历史worldTime/共享Combat数值绝不能用作恢复常量。保留现有九个自有root，逐项按交接名字和ID核对。禁止改共享活动场景/遭遇/世界时间，30001/Mirror只读。
- ServerNext已由主任务恢复并须持续运行；执行器不得启动、停止、重启或清锁。无总体时间上限，每一步合理超时，不无限重试。
- 已授权ServerNext Gamemaster测试账号空密码正常登录、精确自有测试操作及正常API恢复。真正的工具安全拒绝按实际返回报告，不绕过。
- 完成或实质阻碍时必须主动调用send_message_to_thread，目标为本单的新callbackThreadId，前缀“Chrome 子任务回传”；再final。只落盘或final不等于回传成功。报告逐编号、版本/时间、实际与预期、证据绝对路径、恢复状态和能力缺口。
浏览器新返回API已提供可读Console的tab.dev.logs和可发现的CDP能力；执行器先按官方文档确认实际能力，能取原生证据则补充G04/G05，不能将被动资源观测冒充完整Network。保留原生宏的Stop/恢复要求。
