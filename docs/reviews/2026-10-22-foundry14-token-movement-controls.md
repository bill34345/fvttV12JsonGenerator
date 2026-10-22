# Core14.368 Token 移动输入核对

范围：灵体武器召唤物的有界实机验收。仅调查正常界面输入，不修改 Core、模块、快捷键设置、Token 坐标或世界暂停状态。

## 原因、证据与处理

官方 Chrome 的两次拖动操作返回成功，但读回武器仍为 `(700,600)`，没有位置 updateToken；不能按工具回执宣称移动成功。之后 ArrowRight 使全部 Token 随画面一起平移，武器相对场景坐标未变。当前 GM、受控武器、选择工具、paused=true 都有现场记录。

**已核实方向键行为是版本控制差异。** Core14.368 的本地 `client/helpers/interaction/client-keybindings.mjs:441` 起，W/A/S/D 绑定移动，`:533` 起方向键绑定平移；`:978` 的移动处理存在50ms延迟、100ms节流。`client/canvas/placeables/token.mjs:1105` 仅禁止非GM在暂停时移动，`:4736` 的拖动守卫核受控对象和选择工具。当前条件不支持把暂停直接判作GM移动失败原因。

**拖动未移动的原因仍未知。** 上述按键来源不能解释拖动输入未落地，不能据此宣称工具、Foundry或某个模块有已确认故障。当前停止重复拖动，先用文档化正常W/A/S/D验证位置读回；不得直接写坐标、注入事件或更换连接通道冒充实际移动。

## 外部一手来源与反证

- [官方 issue14006](https://github.com/foundryvtt/foundryvtt/issues/14006)：farling42 于2026-03-22报告V14默认数字键由Token移动改为画面控制，aaclayton与stwlam跟进。它支持版本控制变化这一解释，不证明本机拖动失败原因，也没有证明当时已经提供一键恢复旧设置的功能。
- [官方通用控制说明](https://foundryvtt.com/article/controls/)仍同时列W/A/S/D和方向键作为对象移动，不能据通用页面覆盖精确14.368源码。该页还说明正常鼠标选择、测距路径与移动入口，作为后续候选操作的说明而非本机通过证据。
- 精确版本来源：`F:/FoundryLab/foundry-v14/app/14.368/client/helpers/interaction/client-keybindings.mjs`、`client/canvas/placeables/token.mjs`。本次不是依据“最新版”猜测行为。

AnySearch先发现gaming／code能力；游戏域仅电竞／商店，代码域不覆盖该Core控制文档，因此采用两条公开通用检索，随后读取官方原文。其他搜索摘要中的旧浏览器手势案例未读原文，未用于本机归因。第一次extract已成功保存控制说明，仅控制台GBK输出失败；复用保存内容，不重复获取已成功页面。原始检索／页面在`.local/forge-spiritual-summon-20261022/movement-*.md`。

## 待判断本地化清单与复查

无新增外部模块本地化候选。W/A/S/D已实际成功：官方Chrome的`AX.pressKey`文档提供`duration`秒数参数（0—30秒），一次未指定时长的D没有位移，随后指定0.12秒后正常向右移动一格；两次同样时长的W各上移一格，三个完整Token读回和updateToken变更载荷逐项对应，暂停保持true。全过程无坐标写入、事件注入或键位修改。此对照与Core50ms延迟读取移动键的源码相符；AX.drag未移动的原因仍未知，不据键盘成功改判拖动通过。

该操作与拖动边界已同步本次[灵体武器实机验收](../acceptance/2026-10-22-forge-spiritual-summon-runtime.md)。不安装新模块、不改变用户既有键位。观察器原始Hook回调保留旧位置getter与新change载荷；父审最初误以为该getter已是更新后坐标，已改为对照原始change和之后完整DTO，不改写原件或重跑移动。

后续版本或新客户端复查时，先核实际Core版本、当前键位和精确源码，再选择一个正常输入并读回Token坐标；若输入仍失败，保留实际焦点、受控对象、活动层和可见错误后重新分类，不循环重试。玩法的20尺上限与5尺攻击距离另按实际位置和来源核对，不把键位可用等同规则自动强制执行。
