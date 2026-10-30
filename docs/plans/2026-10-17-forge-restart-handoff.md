# Forge 重启接续记录

2026-10-17，用户要求“这轮代码修改好后，记录下进度。我要重启codex”。本轮代码与受影响离线检查已收尾，暂停新模型/页面批次。**整体目标未完成，重启后继续同一工作树。** 当前状态优先于较早报告的阶段描述。

## 最终目标和权限

生成的怪物应保留完整规则和可靠中文；普通攻击、伤害、同特性内附带的独立Save、使用次数和真实法术匹配必须可用。复杂能力保留完整GM规则及其中能准确提供的基础操作，不能整体降成假Utility或丢掉能力。验证卡片可见且正常可投、Save属性/DC/目标范围、施法匹配和次数归属；不重测Foundry的命中判定或骰子算术。

先补独立/共享施法次数、复杂施法承接，再修规则中文和共用解析；保存失败回归后走正常DeepSeek和真实卡片使用。局部通过、文字完整、能导入不算整体修好。PDF属于另一个thread，不修改其处理代码。保留旧卡、已有改动和失败原件；不提交、不合并、不推送，不重启或停止其他服务，不直接读写世界LevelDB，不批量清理。

## 唯一工作树

- 路径：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261006-111625-bettermonsters-eye-deep-sample`
- 分支：`codex/20261006-111625-bettermonsters-eye-deep-sample`
- HEAD：`f79c25fbac747a7e08f98c48779f052c3db68599`，重启前再次确认未变化、索引为空。工作树本来即有大量修改，不reset/stash或另建树。
- 所有本轮证据：`.local/forge-spell-and-rule-repair-20261017/`。`baseline.json`是开始时基线；`restart-freeze-readback.json`是当前读回。
- 当前验收：[同日记录](../acceptance/2026-10-17-forge-spell-and-rule-repair.md)。方案：[同日计划](2026-10-17-forge-spell-and-rule-repair.md)。接口研究：[施法共享次数](../reviews/2026-10-17-forge-spell-shared-uses.md)。

## 已做的代码

1. 独立每日N次由各Cast消费；同一能力明确的一组共享次数扣同一特性池。额外共享池和未实现的特殊限定完整交GM，其余准确法术继续匹配。来源动作/附赠动作/反应覆盖法术默认时机；不支持的射线数量不能变成无限制Cast。混合/纯GM施法在后续AI修复后仍完整保留，原生与手动重叠继续阻断。
2. Company实际中文驱动的条件半伤、独立受擒、球心/半径、集群体型和环阶保护；软换行的自身传送距离明确从当前位置量，目标相对位置不改。旧批准稿不能绕过已知错义检查。
3. 旧中文近战命中、附加伤害和DC语序兼容；攻击后独立Save保留原有恢复证据。最新Gith失败补“类人”别名、唯一同类型标题的附注、AC引用同源完整trait和加粗分区施法时机。AC照原文18，灵能护体完整交GM，不自动猜条件加值或Effect；未知/冲突仍拒绝。
4. 正常单怪无宏包的保存误拒已修：按正式解包后的包hash与报告比较，保留source/目标/目录安全检查、篡改拒绝和恢复后重新确认。
5. 摘要补已支持sphere别名，消除原生球形已经存在时的错误“未覆盖”提示；完整复杂规则继续GM。没有给怪物名写特例。

## 真实页面结果与失败

**Company r4已过生成及保存恢复，未导入或使用新卡。** 同原来源，SHA `4468a368378447825b92b44f583ab7acb631f79fcae17ababa77abc374f07761`。2连接+4正式流程HTTP200；零repair/付费审核/人工修订/批准/导入。关闭/重开/正式重预览后报告与包逐字相同且无新增HTTP。`company-r4-source-chain/receipt.json`及两份verify日志通过。真实图片`browser-native-r4/official-company-r4-*.jpg`和provenance保留，根已看实际规则区。r3首败、错误请求计数及其更正记录都保留，不重写首次结果。

**CHM吉斯泽莱开悟者首次正常失败，本地修复尚未DeepSeek复验。** 来源`source/Githzerai-Enlightened-layout-v2.md`，SHA `8295ff67c551ba3040ff24fd071db273b05728b08e83c5eabc0c173434862fb9`。来源参与预检，不能称盲测。发现和基础提取两请求均200，模型给humanoid正确；代码未认“类人”而拒绝。完整917字符及开头叙述实际保留。原请求/回复021—024、失败报告026、最后读回027在`browser-native-r4`，fixture `tests/fixtures/forge-gith-first-ui-base-failure.json`。未进入翻译/repair/导入。保留red及green-r1/r2/r3，最终green-r4为228通过；中间测试曾误把既有custom契约当subtype，已更正测试，不声称原生subtype标题显示已验收。

**Shared Casting Test是人工控制样例，不是新官方怪或真实AI成功。** `.local`内`prepare-shared-fixture-r2.ts`及正式输出证明来源→IR/Markdown/Actor：两法术共2/日、另一独立3/日、特殊法师之手完整GM。实机尚未验收。

## 当前离线证据

| 证据文件（均在本轮.local） | 结果/用途 |
| --- | --- |
| `gith-header-green-r4.log` | 228通过，最新基础与时机反例，正式Actor/verifier |
| `native-restart-final.log` | 111通过，攻击/Save及独立共享使用次数 |
| `encounter-restart-final.log` | 620通过，完整生成集成、GM保留及保存/恢复 |
| `types-restart-final.log`、`types-packages-restart-final.log` | 最新all/packages类型通过 |
| `anti-overfit-restart-final.log` | 最新3生产源码通过 |
| `facts-sphere-r2.log`、`meaning-soft-wrap.log` | 65事实/100意义检查；未被后续变化失效 |
| `resolver-r3.log`、既有generation/架构日志 | 沿用未受最新变化影响的395/287及无循环结果 |
| `handbook-restart-check.log` | 33项通过；6条人工核对并更新review/HTML，未新做视觉验收 |

套件有交叠，不相加为独立案例数。保存输入回归、类型、verifier和构建均不能代替新模型或实际卡片。

## 构建与运行环境

最新**candidate-r6已构建冻结、未安装**，301业务源码读回无漂移；Forge纯业务hash `ba6fec4bf1871d964f1a5d4dbea6930111c9ee072551989a4ba61cbc29794a28`；Resolver `226733474c5a0606553b0c299b51d41d8e3b5af2f7c8f43994064727cf112a3c`。r5是旧中间构建。r6有26文件（25业务+1本轮助手），不是ZIP发布验收。

**当前安装/页面仍candidate-r4**，26文件逐项与r4收据相符，Forge纯业务043acc3a…，组合入口66cb307f…；Resolver同上。安装目录：`F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules`。不要误用没有Data子目录的路径。重启前Foundry PID14420、127.0.0.1:30001、Administrator、world cor-cotn、Core14.368/dnd5e5.3.3，服务未重启。完整命令在`restart-environment.json`，重启后重核实际身份。80启用模块清单已保存；Monks实际14.01，不因误读的14.02徽标升级。MCP桥未连接，不改桥配置。

自有记录桥PID34840/57599已由根正常关闭，`bridge-stop.json`及进程/端口退出已读回。Key只从既有外部文件一次传正常密码框，未保存浏览器Key选项、未入报告或仓库。**已装r4助手仍指向已关闭的记录桥，当前页不能直接点生成。** helper未删，纯业务重载还欠。没有停止Foundry或清理世界。

最后027读回：307旧Actor、94旧Macro均无改变，无新Actor，pending0/errors0。旧卡和失败原件保留；没有新卡功能通过的声明。

## 重启后按顺序继续

1. 先读本文件和同日验收最新节，核git/index、r6源码冻结、当前安装r4收据、Foundry实际PID/端口/路径/owner及版本。基线变化先解释归属，不能覆盖别人的修改或停止服务。无需重复仍有效的离线或历史页面证据。
2. 续建本轮记录桥：保留r4脚本/descriptor/证据，使用新run及新输出目录，仍仅loopback、正确Origin、一次Key传递、答案白名单记录。`native-readback.ts`当前import `bridge-session-r4.json`，须改引用新descriptor后再构建新candidate-r7（或下一未用编号）。r6保留作纯业务冻结，**不要直接安装含旧桥地址的r6助手**。核最新业务hash与r6一致；若业务改了，重新决定受影响检查。
3. 按当前身份更新/复用本轮`install-candidate.ps1`，从**实际r4**逐项hash确认后安装新候选，服务无需重启。若原PID改变，只在实际路径/owner/监听身份核实后调整检查，不能跳过。最终读回计划要保留到纯业务重载前后。
4. Chrome复用原独立thread `01a142ad-0656-79f1-80ea-975431d99aa4`，标题“Forge 基础操作修复独立核查”，用户指定gpt-6-luna/medium，已允许自动回传。原拥有Chrome3 tab651346486、`http://127.0.0.1:30001/game`，目前保留Gith失败现场；重启后先核实际tab，不能猜新ID。按`chrome-delegation-dev`读协议、实际turn_context配置及官方Chrome接口；不轮询、不换通道。只读审查任务不操作服务。
5. 同Gith原文走正常DeepSeek一次；保留首次修后完整源/请求/可见回复/IR/Markdown/Actor/中文/截图。不要靠手改最终JSON或付费repair掩盖结果。根对照完整来源及正式verifier再继续批准/导入。
6. 新Gith卡：普通攻击和独立WIS16 Save可点且正常投；目标及GM特殊后果正确。法师之手隐形变体完整GM，不假Cast；识破隐形独立3/日，异界传送和传送术各1/日有真实法术匹配和正确消耗。反应与充能6保留。核具体输出再接受，不预先写成功。
7. Shared控制样例实际两种法术共扣池0→1→2；另一独立3/日池不变，用一次仅自身变化；耗尽正常限制；重开/刷新不重置已用次数。补受影响旧功能的必要读回，不重测Foundry算术。
8. 最后做精确来源与中文/规则核对、新卡原生持久化读回。依据新候选的纯业务index恢复，仅删除本轮归属助手文件；普通业务重载再读回，正常关闭自有桥。不能以cleanup或一批通过关闭三个仍开放的产品目标。

安全包装入口继续用根package.json现有命令。Bun1.3.14目录：`H:\CodexData\visualizations\2026\10\02\01a0fdf7-35f6-79c3-b1c5-4812d1a8f54d\crystalbleed-v14-close-20261003\ci-runtime-1.3.14\bun-windows-x64`。不直接跑内部`:raw`，不重复无新证据的失败。

根checkpoint仍保留`forge-broader-spell-grants`、`forge-chinese-rule-reliability`、`forge-final-entry-and-legacy-coverage`三个未完成产品项。按本次用户重启请求暂停；不是整体完成。hook输入/状态在本轮.local与`H:\CodexData\hooks\state\task-progress\01a14292-7aea-7e12-aea1-6ef85b64f7ed.json`。
