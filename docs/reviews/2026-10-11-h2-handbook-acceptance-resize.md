# H2 手册验收中的窗口收缩与 Tokenbar 位置写入

日期：2026-10-11。范围仅本次 ServerNext/Core14.368/dnd5e6.0.5 的 H2 接受，不调整其他模块、版本或共享服务。当前实施进度仍以[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)为准。

## 已确认事实

- r4修正版的宽窗浅深主题和窄窗深色截图已消除按钮内容重叠、浅色标题低对比；同源36条及全部原文未变。
- r4的7个写入Hook均是User的`flags.monks-tokenbar.position.left/top`，没有Macro更新；世界、设置和页面全局状态摘要一致。原世界文档摘要不包含User，这一点不能省略；User Hook非空仍使该轮严格零写门禁失败，不能把“世界摘要一致”解释成全部文档没有任何变化。
- 后续手册缩为360×420、测试Dialog缩为200×52，二者都落到left/top=0。原浅色窄窗裁图因此不能验收，r4 receipt已标无效。
- 执行器操作记录包含7次`screenshot({clip:...})`，七个User更新全部发生在这些调用区间；之后一次`screenshot({fullPage:false})`没有对应更新。这个对应关系是线索，不等于已测到截图内部的瞬时viewport。

| 裁图调用开始（UTC） | 该调用内截图数 | 对应User事件（UTC） |
| --- | --- | --- |
| 13:46:42.035 | 2 | 13:46:46.344、13:46:50.295 |
| 13:47:19.113 | 1 | 13:47:20.730 |
| 13:47:55.445 | 1 | 13:47:57.275 |
| 13:48:08.616 | 2 | 13:48:10.750、13:48:14.840 |
| 13:48:26.940 | 1 | 13:48:28.846 |

原件在任务worktree `.local/suite-direction/h2/chrome/r4/`；`report.json`保留全部事件字段/脱敏栈，`receipt.json`记录有效和无效截图，未改判或过滤。用户标识不复制到本文件。

## 精确安装源码解释

本机只读来源：`F:/FoundryLab/foundry-v14/app/14.368`，以及`data/server-next/Data/modules/monks-tokenbar`的14.01代码。

1. Core `client/game.mjs:2164`注册window resize；`:2306–2312`对全部rendered ApplicationV2调用`setPosition()`。
2. Tokenbar `apps/tokenbar.js:287–290`的`setPosition()`调用`persistPosition`；`:134–137`防抖1000ms后调用`game.user.setFlag`保存left/top。浏览器resize即可触发，不需要拖动Tokenbar或手册调用文档API；初始渲染也可能触发，不能只凭字段断定来源。
3. Core `client/applications/api/application.mjs:1136`读取ownerDocument的clientWidth/Height，`:1144/1153/1173–1180`钳制宽高和位置，`:1101`把结果存回实例。临时可用空间极小可以使实例位置持续缩小；CSS最终显示仍受min-width/min-height限制。
4. 手册CSS最小值360×420；Core `public/css/foundry2.css:7039–7042`普通Application最小宽200、高header36加1rem16，恰为200×52。这解释了观察尺寸，但r4没有resize时尺寸记录，因此“临时零/极小viewport”仍是待实证的解释。

## 一手资料与适用边界

AnySearch的code域发现请求在TLS握手前断连，随后使用公开网页搜索和原始页面。未找到与本次“官方连接器裁图、两个窗口同时缩到CSS minimum、Tokenbar写位置”完全一致的公开一手报告。

- [Monk’s Tokenbar维护者更新记录](https://github.com/ironmonk108/monks-tokenbar/blob/main/CHANGELOG.md)记录14.01的v14适配和旧版位置修复。它没有证明本次症状由哪次操作造成；不据此升级或改第三方代码。
- [Foundry原始问题12007](https://github.com/foundryvtt/foundryvtt/issues/12007)报告v13阶段`width:auto`使窗口靠左且难以移动。本手册设置固定数值宽高、目标Core14.368，条件不匹配，不能套用该旧问题结论。

## 下一检查与待判断项

- 使用同一官方连接器的完整视口截图，禁止clip、fullPage:true、locator裁图及修改浏览器viewport；不以其他通道绕过许可。
- 私有验收工具增加被动window resize记录，保留事件前后viewport、两个自有应用的实例position/inline style/rect；每次User更新与时间线对照。观察Tokenbar当前位置的前后哈希，不记录设置值或凭据。
- 严格零写门禁继续要求写Hook和settings.set为空；不豁免Tokenbar或测试Macro事件。只补浅色窄窗视觉和这一门禁，保留已有效的业务/视觉证据。
- 不主动触发可疑裁图、派发resize、拖动Tokenbar或调用其setPosition来制造写入；不修改/停用第三方模块。
- 待判断本地化/外部修补：无新增候选。若后续证实独立的Tokenbar缺陷，再单独登记精确版本和最小复现；本次不扩展为第三方模块修复。

## r5/r6复验结果

同一官方连接器改用完整可见视口截图后，r5/r6都记录到零resize、零User/其他文档写入和零settings.set；viewport、世界/设置/页面状态、当前User Tokenbar位置的前后/最终哈希一致。截图前后应用420×620尺寸和位置稳定，浅色窄窗视觉缺口由r5闭合；r6另闭合父人工复核发现的Core inline-code nowrap影响多行/长命令的缺口。

这支持“取消clip后的正式路径没有再触发异常”，但没有主动复现或测得旧裁图内部的瞬时零尺寸；因果置信度不升级成唯一确定。r4原FAIL、位置字段事件和无效裁图保持原样。最终H2接受范围及资源状态见执行总账。
