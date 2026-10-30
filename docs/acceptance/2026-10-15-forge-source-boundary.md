# Forge 作者原文与程序说明边界

2026-10-15，继续复用 `20261006-111625-bettermonsters-eye-deep-sample`；用户授权代码修正、保存数据整链及实际入口验证、原 Luna 的必要导入和刷新。禁止 DeepSeek、付费审核、提交、合并和推送。已有改动及失败原件保留；初始文件指纹在 `.local/forge-source-boundary-20261015/baseline.json`。

## 本次要改变的行为

作者传记、完整能力原文与程序生成的护甲/尺寸备注、GM 提示分别有明确归属；中文在前、对应原文在后，程序说明不进入原文栏。作者自己写的中文、同名提示、网址、引用定义、条件和数值不得被裁掉。所有结果仍通过正式 renderer → parser → generation → verifier，不手改最终 Actor JSON。

## 检查选择

- 当前公开 `prepareForgeEncounter` 从 Tome 保存的实际批准包重生成：七能力、零自动效果、零网络，仍复现传记原文末尾含生成器护甲备注；先补能抓住该缺陷的回归。
- 修改会跨 renderer/parser/generation/localization，因此检查来源元数据往返、失配拒绝、中文/原文实际排列、作者中文与相同备注反例、普通不受影响输入；再运行对应现有安全测试、包类型和局部 anti-overfit。
- 保存 Tome/Archivist 及相关旧失败来源通过正式链重新核对。改变来源身份的旧批准不能沿用；译文按同源文本绑定复用，交 GM 重新确认。实际入口覆盖保存包预览、正文核对及正常批准/导入，不用脚本直写世界预期数据。
- 原生仅复验本次展示/来源变化及实际缺失的完整刷新读回；复用已有无关基础机制证据。冻结后交原 Luna；最终读回方式在移除临时入口前确定。
- 当前未证明全新样本首次完整成功；禁止新模型调用，本轮不能用保存数据回放改写首次失败或宣布原始产品目标完成。

## 当前状态

本轮作者原文/程序说明/双语展示修复、保存数据整链、实际审核入口及两例原生批准/导入/一次刷新验证已完成，最终点击后状态也已核对；临时工具已精确撤下，纯业务入口恢复。完整前后及最终原始数据均已保存，全部32处双语描述和旧世界基线通过。原始Forge目标仍未完成：全新样本首次完整成功未证明，其他未在本轮重验的原始失败不改判。Luna后续意外点击Tome能力名称触发使用，保留为no-use失败；当前两张Actor未因此改变，留下1张无保存骰子结果的utility聊天卡，原标签待确认窗口状态UNKNOWN。以下分节保留原始过程与失败。

- 新增回归先出现 5 个失败，修正后事实/来源组 57 项通过；分步组 186 项、parser 132 项通过。初次来源元数据重复保存整篇原文触发了原有“前言只出现一次”检查，已改为程序拥有的长度边界，Markdown 只保存一份原文。
- Tome 与 Archivist 从原始来源和原基础回信重新走公开 provider 工厂的分步路径，再经正式生成、来源 verifier、原译文逐字段对应复用、本地合成及包重读。分别保留 7/8 项完整能力和 15/17 处完整原文，零自动效果/宏，旧来源批准均失效；仅合成测试 GM 批准，不冒充原生批准。原始首次失败不改判。
- 整链观察器最初误将基础分段回信的 hash 当全文 hash、假定所有 Activity 都有 consumption 对象、假定所有传记都有程序备注；已分别对照实际契约修正。Tome 通过后未重跑，只继续 Archivist。旧失败/输出保留，无真实模型或网络调用。
- 实际应用恢复入口新增测试：载入未批准保存包、完整来源与可读双语预览、真实复选框逻辑、正常批准、保存及重开。初始测试夹具使用错误包目标、缺少能力，被正式门禁正确拒绝；修正夹具后定向通过。此前主组其余 577 项已通过，未因夹具修正重跑。
- 包类型检查和架构检查通过。全量类型发现两处新增测试的类型声明错误，已改正，待定向复核。局部 anti-overfit 通过。
- 手册旧 watch 报 6 条 stale；已核对影响：Item/Species 仍使用各自 renderer，未改变入口、目标、输出或权限；Markdown/Monster 仅新增 canonical 传记归属数据，普通输入兼容；Forge 与人类 MD 入口说明同步程序说明及来源批准边界。未缩小 watch。

## 冻结与原生派发准备

全量类型修正后通过，实际入口相关22项通过，手册33项build/check通过。冻结281源文件与16业务文件；正常生产/工具浏览器bundle均通过安全扫描。仅本地Mirror业务index发生变化，19项静态HTTP hash已读回，PID54732/Administrator/loopback30001/cor-cotn未变；没有停止服务、备份或世界写入。

新的小型读回工具复用生产Application/恢复/批准入口，并在普通页面显示受SHA绑定的base64分段。冻结的实际bundle通过非浏览器249715字节/14段UTF8与emoji往返及工具会话清理检查。浏览器将保存两份完整实际批准包和Actor全文，不再依赖下载或文件选择器；这不是绕过任何浏览器拒绝。工具与新角色暂留父审后精确收尾。

原生尚未执行；不能宣布当前修复或原始目标完成。原Luna的独立验收合同见 `.local/forge-source-boundary-20261015/luna-native-handoff.md`，回调归属为本新父 `01a13ee1-e2ca-7421-b895-cf0bb2aabec5`。

## 第一次原生回调：工作标签失效，未开始验收

Luna报告旧Chrome标签651345569不可用，Chrome清单7页且目标匹配0；基线、批准、导入、刷新和世界写入均未执行。候选/服务没有变。原阻碍记录保留在 `evidence/native/`。

父任务核对当前turn原始会话记录的5次CUA调用，确认本轮没有文件选择器动作；回调中“文件选择超时后丢页”的说法混入旧轮次，不能当作本轮或本候选失败。父任务初步转述也据此纠正；独立审计在 `native-recovery-audit.json`。

在同一既有验收授权内，明确允许原Luna用当前官方Chrome新建一个本任务工作标签打开同一loopback Foundry，保留其余页面。更正只涉及缺页恢复和新入口核对，不重做离线链或安装，不改变候选/安全边界。补充合同 `luna-native-recovery-1.md`；新证据目录 `evidence/native-recovery-1/`，旧阻碍原件不覆盖。

## 工作页恢复后：基线辅助层修正

原Luna已用同一Chrome恢复owned标签651345635，正确新工具出现；旧7页保留。基线按钮因旧世界Document来源中非JSON值在 `items/0/system/enchant/max` 被严格artifact hash拒绝，未批准/导入/刷新。父任务用原冻结工具与可选undefined字段离线复现同一错误，核对本机5.3.3 source map的Feat FormulaField后，仅增加辅助层原生来源指纹适配。正式Actor JSON的严格hash/validator未放宽；源值变化与类型差别继续可辨识。17项正反例和新实际工具249996字节/14段完整往返通过。

产品/fixture/281源冻结不变，只安装R2辅助JS和对应临时import，两变化HTTP hash通过。原失败工具及回执保留；新入口及元数据见 `helper-revision-2.json`、`helper-r2-install-receipt.json`。原Luna继续同一owned标签正常批准/导入及全文刷新读回，新证据放 `native-recovery-2/`。

另独立核对旧 `native/current-turn-context.json` 仍为原SHA `5ea2bae...1d669`、574字节，与原manifest一致；没有原件丢失证据，也未进行恢复或覆盖。Luna关于此前上下文不可恢复的披露保留，并以 `native-evidence-preservation-audit.json` 更正实际状态。

## R2后续：改用原生JSON边界，一次预检全部Document

R2在旧世界 `flags/dnd5e/initiativeAdv` 的原生对象上拒绝，仍无批准/导入。停止逐个原型补丁，父任务对照Core14.368 `foundry.utils.duplicate()` 的实际JSON序列化边界，基线改为完整原生JSON导出来源的canonical hash，不比较临时内存prototype。产品正式Artifact的严格JSON验证保持。可选undefined、跨realm/boxed对象及自有toJSON、真实值变化与非导出值的14项检查通过；实际R3工具250008字节/14段完整往返通过。

R3一次遍历所有Actor/Macro，无法原生JSON导出的全部文档以ID/类型/错误出诊断packet，未完整成功不存部分基线；5文档/3错误的失效路径验证通过。只更新辅助JS及临时import，产品/两fixture不变，旧失败工具与原件保留。继续由原Luna在651345635做基线及已授权连续原生链；新证据在 `native-recovery-3/`。当前仍不是原始目标完成。

## 两例原生导入及完整刷新前父审

原Luna通过实际生产审核入口重新确认中文并正常导入，各创建一次：Tome `4a3a99c5130860f8`（HP256/AC14/CR12，7手动能力），Archivist `8ef3f654e303b8d0`（HP153/AC14/CR10，8手动能力）。代表传记/能力排版已查看，未执行能力、掷骰、效果或宏。导入后尚未刷新，不把这一步当持久化通过。

刷新前packet通过官方Chrome的页面可见DOM分段返回，父任务从实际工具结果保存14段；312140个base64字符、234103字节，SHA `396db6916249d28bc633ea16ccbb4948a225fc569d424c911e0c7053f38f22a1` 全部一致。系统剪贴板与工具剪贴板隔离后未继续重试剪贴板，也未重生成packet或重复导入。首次collector未解开MCP文本content封装而报告0/14，修复观察器后直接复用全部实际返回；正反例3/5通过。完整原件在 `evidence/native-packet-transfer/before-refresh/`。

父任务用两份实际GM批准包分别重新走公开 `prepareForgeEncounter`：批准者为本次GM，来源和保存译文逐项未改，实际导入package ID/hash与文档绑定一致。观察器曾把数组直接传给对象专用hash而失败，修正为普通对象包裹后通过，严格hash未改。两类观察器错误都有独立记录，未撤销有效原生行为或修改原件。

全部32处双语正文逐处比对完整HTML结构、属性及每个文本字符；24处原始HTML相同，8处只差一次实体编码。完整作者原文与来源flags一致，Tome护甲备注只在中文程序说明，Archivist没有凭空增加传记备注；15个能力及其活动均保持手动utility、无攻击/豁免/伤害/效果/消耗目标。两张原生Actor的完整来源hash与当前指纹一致。

原有289个Actor与94个Macro的全部导出来源指纹未变，新增恰为上述两张卡，宏新增0、未知角色0、场景和暂停状态未变。两个旧验收Actor仍在基线内。现有运行时语义投影、数值公式字符串及缺省字段规则用于机制对照；全部原始差异另存，不把原型Token展示缺省值等未改范围宣称为逐字相同。真实模型和付费审核调用0。保存译文本身已有措辞/标点问题没有被本轮边界修复消除。

父审回执为 `native-regeneration-receipt.json`、`native-before-refresh-semantic-audit.json`、`native-before-refresh-text-audit.json`。接下来交同一Luna对同一页面正常刷新一次，读取完整刷新后packet，父审通过后再精确撤下本轮工具。

## 一次刷新后的完整父审与交互偏差

刷新后14段已由父任务完整保存，234103字节，SHA `74b393af3fed408cef5b8d3a39f9e71fa04bbc56d0ea57ac40826b8775a30bda` 与实际页面元数据吻合；执行器可见结果截断不代表保存的文本缺段。两份完整Actor来源、实际批准包、导入前基线及全部当前ID/hash一致，原始完整正文和手动机制对照继续通过。最初逐位置比较current.actors因刷新后的集合迭代顺序变化而失败；仅将这个无序ID/hash索引按ID对照后，除recordedAt外全部一致。Actor正文、批准包及原基线未归一化。回执为 `native-refresh-persistence-audit.json` 和两份 `native-after-refresh-*-audit.json`。

Luna在完成该packet之后为查看Codex Crush点击了能力名称，实际触发使用路径，页面出现“角色在场景中没有Token”的AC5E警告，并报告产生聊天卡。该动作违反本轮只读看排版的约定；未看到骰点不能当作没有尝试使用。后续Archivist通过描述展开控件查看。该偏差和实际工具返回保留于 `native-action-deviation-observed.json`；刷新后packet早于这次点击，不能据它证明点击后Actor没有变化。将补点击后的完整状态读回，不重做正式生成、导入或刷新，不删除聊天证据。

父任务尝试保存三份已返回截图时发现会话持久化层中的image base64含截断省略号，不能解码；没有构造或伪称保存本地截图。Luna的inline截图与查看回执保留，父审的独立强证据是完整原生DOM回读及全文校验，不能冒充父任务独立看图。

## 点击后核对遇原标签缺失：只读收尾观察

原Luna回报651345635不在官方Chrome Browser3清单；父审实际工具返回，确认仅有原7页，按ID及URL均无目标。未执行取消对话框/读packet/刷新/导入或使用能力；原标签待确认窗口状态保持UNKNOWN。Mirror PID54732、loopback30001、服务所有者及冻结业务index仍一致，不把浏览器缺页当作产品持久化失败。

为核对已持久化的点击后状态，沿已有恢复授权由同一Luna建一个本任务新页，只读现存两卡及对应Actor在已验证刷新packet之后的持久化聊天。新的最终观察器没有生成、批准、导入或会话恢复入口；旧基线取自完整原生证据并标注来源，不制造新session批准或改写历史。新实际bundle的完整11段/193357字节、过滤和UI生命周期检查通过；只更换临时import/helper，两份HTTP hash核对通过，产品和旧失败原件不改。最终观察packet返回后，本批内结束纯观察UI并关闭新建工作页，避免无必要跨回调保留临时页；父任务再独立保存并核验数据及撤下已知临时文件。

## 最终只读状态及收尾

同一Luna创建只读工作页651345647，读取一次最终状态：12段、266924个base64字符、200191字节，SHA `c7a897f45a2912c4a6b6c9a82d9fba4fe9ec81e5c90ec2c3a9c87e0b02f63a66`。父任务完整保存核验，两张Actor来源与已通过刷新后的全文完全相同，全部当前Actor/Macro ID/hash亦相同；原289Actor/94Macro、场景/暂停均未变。因此复用已通过的32处全文/来源及实际批准包验证，没有再生成或重导入。

本次范围内有1张聊天卡 `IuH7RQ5GfASS8bT7`，绑定Tome的Codex Crush utility活动；`itemUseComplete=true`，保存rolls为0，damageList/effects为空，deltas=null。它证明发生了能力使用及聊天写入，不能用没有保存骰点冒充“从未尝试掷骰”。该聊天卡与两张新Actor保留；没有删除来掩盖偏差。旧标签的待确认UI不可观测，保持UNKNOWN。

实际官方工具结果确认新观察器dialog/button/finish控件均为0、无当前JS dialog，新建owned页已关闭且按ID不可绑定，其他7页保留。父任务仅撤下安装目录中的4份本轮helper与2份fixture、移除确认为空的本轮fixture目录；每个绝对路径/归属/hash在删除前重核，无Force/递归删除、备份或服务停止。仓库内失败源码、产物及所有回执不删除。旧缺失标签sessionStorage未伪称已手动清空。

纯业务index恢复为冻结 `7edae3658acfee22aee35b04820b9a59e1b42de285d8cb002c782df176c43b51`；16份业务文件磁盘/HTTP hash通过，6个临时URL均404，PID54732保持。初始213个dirty文件中仅本轮明确修改的17路径变化，196个无关原路径及206份受保护旧产物全部hash不变；281份冻结产品源文件不变、HEAD不变、索引为空。无DeepSeek/其他真实模型/付费审核、commit/merge/push。既有测试/类型/架构/anti-overfit及33项手册检查证据继续有效，辅助观察层变更没有触发无关重跑。

最终回执：`native-post-interaction-audit.json`、`native-final-ui-lifecycle-audit.json`、`native-tools-disk-closeout-receipt.json`、`native-tools-http-closeout-receipt.json`、`final-preservation-receipt.json`。这些只支持本轮保存数据边界修复与必要原生验收，不支持将原始首次失败、旧译文措辞问题或其他未重验的产品问题改判为完成。
