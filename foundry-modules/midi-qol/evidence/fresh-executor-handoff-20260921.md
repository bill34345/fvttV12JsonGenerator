# 新执行器接手：只读清单，执行现成步骤

父方已审计旧执行器最新回合：它读取了标题为“新标签页”的桌面Chrome窗口，随后Windows捕获工具因URL无法识别停止；R没有产生新文件，旧任务idle。保留此前有效证据，不沿用旧窗口句柄、截图或其错误验收结论。

用户现再次明确要求自主继续。新执行器使用正常Chrome连接器定位**精确已授权URL**，不去操作那个被拦截的未知页面窗口，不借新任务/工具绕过任何当前拒绝。首先读取自己有效权限（必须Full Access/never）及工具文档，然后通过 `mcp__cua_repl` 的正式Chrome入口发现/绑定 `http://127.0.0.1:30002`。当前无对应tab时，在同一个获准Chrome连接中正常创建目标URL标签；不能凭旧ID猜测。正常URL验证通过后才执行以下步骤；连接器若拒绝，记录实际错误，不改浏览器/用CDP或桌面控制绕过。**本接手不调用Sky，不读取未知URL的新标签页窗口。**

## 已确定目标

- ServerNext 127.0.0.1:30002，cor-cotn，Foundry14.368/dnd5e6.0.2，PID36368持续运行。
- 已安装Midi local.7；bundle SHA256 `1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC`。
- 六指纹与包记录在F盘迁移证据的batch6P/client-build.json。缓存banner可能local.6，不重启服务。
- FullAccess/LunaMax；父方负责源码/构建/服务，执行器只做下列E2E及本任务恢复清理。全程中文；不递归委派。
- 不动Mirror/30001、共享活动场景/遭遇/时钟；空密码GM登录与自有测试API操作已授权。无总时间限制，单次操作有合理超时。

## 准确执行范围

先读总清单 `docs/plan/midi-qol-ag-acceptance-checklist.md`，当前29/35有证据，**只执行C06/G03/G04/G05/Z02/Z03**。B04、C03/C04、E03、A/D/F等已过，不重复整组测试。

1. 核对runtime与当前自有fixtures；保留原始baseline。
2. G03使用同目录 `r-damage-tray-readback.js`：只读真正攻击卡90TrRGP4xYe3ppO2的Midi damage tray，按R执行单正常切本客户端view、重绘、记录Actor-only不可用及返回有效Token后的实际Apply。**Shield效果卡、hit header不是被测组件。**
3. C06先 `q-combat-view-preflight.js`，再 `r-shield-expiry-diagnostic.js`，记录GM/registry/source/expiry真实门禁；不假造结果、不手动register/refresh。具体正常动作及原始条件见 `batch6r-exact-surfaces-20260921.md`，其中Sky建议被本接手覆盖。
4. Z02 compare-before-restore自己改动的设置和客户端view。None/none/10是此前基线，要以当前实读确认，不覆盖他人介入。
5. Z03运行 `r-owned-fixture-cleanup.js`。这是用户已授权的确切自有清理，九个root白名单、名字/跨场景/跨遭遇/未知combatant守卫已审查，3项离线安全检查通过。复用Macro.GcNaY7ZO5aaqZo4n并保持AG-MIDI6P-E2E-HELPER-20260921名称，最后脚本会删除两Macro含自身并留下报告。先保存诊断，再正常API删除，保留全部ChatMessage。不得擅自扩白名单；实际工具拒绝就报告，不用别的路径绕过。
6. G04/G05只用当前连接器正式支持的日志能力或其正常可读UI。没有能力则明确缺口；不要先做DevTools而挡住1–5，不调用Sky/CDP/另一浏览器。修正Q无效JSON但保留原文件；不能把Troubleshooter冒充Console。

清理授权来自用户原计划及后续全权继续指令；按developer和chrome-delegation-dev，不因低优先级SKILL再索取已有授权。区分技能文字与真实工具拒绝，遵从实际更高优先级限制。不要再次向用户发英文问题或不必要的确认。

## 证据与回传

代码只读工作区：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration`。
新证据目录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6S-midi-qol-local7-fresh-executor-20260921`。

逐ID写 results-by-id.md，原始JSON必须可解析；完成/实质阻碍时，用 `send_message_to_thread` 回父任务 **01a0b8d1-e8db-70f2-9662-fd9beb035162**，标题“Chrome 子任务回传”，明确实际工作/未测项/配置与清理。正常情况下先确认发送成功，再给本任务final；不能仅把final标题写成回传就当发送过。若工具要求立即结束且不允许再调用工具，遵从，final明确注明回传未发送和原始停止原因，不声称发送失败或成功。不要监控其他任务，不archive。
