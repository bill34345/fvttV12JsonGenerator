# H3 跨客户端世界指纹差异调查

日期：2026-10-12。范围仅本任务ServerNext/Core14.368/dnd5e6.0.5，Suite与Deck0.2.0候选。当前状态由[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)维护。Forge使用的5.3.3 Mirror与生产不参与。

## 已知证据和缺口

H3/r1的统一手册状态、Deck面板/同会话副屏帮助以及Suite停用后的独立后备均有有效实机证据。两轮帮助观察的文档/设置/resize事件均为空，世界、设置及宿主状态在各轮内部不变。模块开关、原Deck偏好、设置/UserUI以及精确Macro/tab清理已核回。

整批原始报告仍为FAIL：原生返回设置/只重新启动世界及后续客户端重载后，客户端`toObject()`世界总哈希与维护前不同，文档计数相同。原工具没有保留逐文档指纹，因此原始差异的具体文档、字段和归因均UNKNOWN；不把后续新对照当作历史恢复的证明，不修改或强制恢复世界数据。

## 精确接口来源

本机Core来源根为`F:/FoundryLab/foundry-v14/app/14.368/`。

- `common/abstract/data.mjs:836`：`DataModel.toObject(source=true)`克隆模型的`_source`，并不是一次持久存储读回。
- `common/abstract/document.mjs:542`：`Document.toObject()`还调用`shimData`。客户端初始化、清洗或兼容层与持久值需要分层观察。
- `client/data/client-backend.mjs:36`：GET响应的result经`documentClass.fromSource`重新构成客户端模型；因此返回原始数据与当前模型可能不同。
- 同文件`:704`、`:722`：普通GET请求为`{type,action,operation}`，通过公开`SocketInterface.dispatch("modifyDocument", request)`返回单个响应。`client/helpers/_module.mjs:14`公开导出`foundry.helpers.SocketInterface`。
- `common/abstract/backend.mjs:37`的GET配置强制`broadcast=false`。只读对照沿用现有Foundry连接，不新建客户端，不直接读取或编辑LevelDB，不发送create/update/delete操作。

新工具只保存逐文档/顶层字段与stats/flag归属的SHA、ID和计数，不保存世界正文、凭据或可恢复的世界副本。自有Macro从两层世界指纹排除；其flags保存发生在读观察器移除之后，收尾精确删除。

## 检索与反证选择

按firsthand-research通过当前AnySearch检索官方GitHub的`toObject reload source random data`及dnd5e的`actor source changes reload randomID`，并查询公开实现。没有找到符合精确14.368/6.0.5和本次症状的第一手复现；一般旧版升级故障不能用于本次归因。这里以精确本地源码和最小真实对照为证据，不声称已有社区结论。

下一步只做一次普通客户端页面重载：不打开帮助、不切模块、不重启世界或Node，分别比较客户端模型与服务器GET返回数据的逐文档/字段指纹。若服务器读回不变而客户端改变，定位客户端变动；若服务器层也变化，继续按真实字段调查。无论哪种结果，都保留r1原始FAIL与历史恢复UNKNOWN，并复用独立有效的帮助证据。

本批没有引入外部模块、内容或本地化候选；待判断本地化清单无新增项。新Core或修改取样方式时，先复核上述GET响应结构及模型构造差异，再执行同一窄对照，不能用新取样结果覆盖旧报告。

## 对照工具r1保存失败与r2修正

真实r1停在首个基线保存前，错误为`Cannot create property 'compendiumSource' on string`；没有执行页面重载或形成对照，不是产品失败。该批精确Macro和自有tab已清理，Next常驻，原H3帮助证据与历史恢复UNKNOWN保持。

Core14.368的`common/data/fields.mjs:1904`会对ObjectField逐层重建/展开；`common/utils/helpers.mjs:569`的`expandObjectInPlace`与`:848`的`setProperty`把包含点号的对象键视为嵌套路径。工具在同一fields字典里既存`_stats`总哈希，又存`_stats.compendiumSource`字段哈希，二者展开后发生字符串/对象冲突。

本地直接调用这一精确Core函数，在Node/V8中复现了与Chrome相同的错误。把原工具测试的Macro.update替身接上该函数后，旧工具从baseline变成tool-failed；修正为`[路径字符串, SHA]`数组后，五个模拟场景通过，点号路径在原生展开后完整保留。只修证据格式，没有改变产品/安装/世界数据或对照范围；r1失败原件仍在`h3/chrome/world-diag-r1/`，新执行源与结果将写入`world-diag-r2/`。这仍不提前证明真实重载对照通过。

## r2真实结果与可用结论

一次普通客户端页面重载的对照已完成，未打开Deck/帮助、未切模块或重启世界/Node。服务器GET的10集合/916个文档指纹前后全部相同，SHA为`d8df9d2bd8ae235689d8fd74588f294ad2dd7c5539038d02593d570811e28e74`，`serverChanges=[]`。客户端仅Actor.65DtcQDkiSKj0Qd5的items、Actor.aMZwC9ORkpZpdlkc的items、Scene.2rQFnhlfPt5sGJ9i的tokens变化。settings/moduleflags/UserUI哈希一致，观察器与精确自有宏/tab已清理，Next15696保持运行。

这直接支持本次对照的`CLIENT_MODEL_CHANGED_WITH_STABLE_SERVER_READBACK`，说明客户端toObject总哈希不能独自证明持久世界内容改变。两个Actor/item与Scene/token内部的更深字段及初始化原因没有调查，不推断为某一模块、随机ID或具体迁移。

两次capture各记录1条同一User的preUpdateUser，无字段和调用栈归因；因此这次诊断**不满足所有Document零写**。settings/UserUI位置哈希稳定不代表其他User字段未变。原H3帮助观察的零事件证据继续有效；原跨维护历史恢复仍UNKNOWN，不用本次稳定服务器指纹追认它。

H3本批功能接受和整批审计分开记账：用户要求的状态/Deck帮助命名功能已接受，原整批恢复为PARTIAL/UNKNOWN；完整范围与未执行项见总账。本轮不修世界、不继续扩展现场取样，不把帮助重构扩大成环境/数据修复。新任务若需要严格跨重载持久证明，应在操作前保存服务器层逐文档指纹并对User写事件保留字段/脱敏栈；不得把维护后的新基线冒充维护前原源。
