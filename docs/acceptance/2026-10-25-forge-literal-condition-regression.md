# Forge：旧检查整改与明确条件状态退化修复

状态：本地修复、限定原生保存／刷新读回及精确清理通过。此增量沿用同一worktree和未提交成果，状态修复真实模型请求为0；已获新批准的四样本复核实验另记，不混作本修复的验收。

## 实际故障与修复

核对既有转换证据时，发现潜妖 Lurker 的显式条件传递问题：AI中间数据明确包含grappled／restrained、escapeDc14及“目标体型不超过中型，直至擒抱结束”；实际Actor生成两个攻击活动链接的原生Effect，显式适用和解除条件未完整投影。没有固定结束时间本身不是错误；本次修复落实的是GM条件说明及手动处理边界，并非要求状态必有倒计时。该输入是既有历史回归资料，仅用于证明转换缺陷，不替代当前2024规则验收。

原因是literal生成路径为避免正文反推而清空了内嵌效果描述，同时跳过旧自然语言生命周期检查；结构中已有的条件没有完整传给这一层。不能通过恢复正文正则判定或删除旧断言解决。

本次只补明确数据传递和表示检查：

- `EmbeddedEffect.condition`接收AI已经声明的条件字符串；renderer／parser原样传递，非法或冲突的条件字段拒绝。没有按动作名或原文猜条件。
- literal分支按明确的condition、escapeDc、staged，或不能直接表示的duration分出GM状态。保留原攻击、伤害、豁免、距离、资源；不生成这些状态的自动Effect或链接。
- 既有conditionLifecycle账本现在保留每个状态的条件、逃脱DC、阶段、期限和完整规则，并显示GM说明。同一状态的另一无条件分支不能绕过受限分支。
- 可直接表示的固定期限状态仍保留原生Effect。不同状态混合时，两种输入顺序都核对原生状态的身份、描述、期限与链接，避免过滤后说明串位。
- 生成层及Intake层都核对复杂GM状态的明确账本和无错误自动化；Intake层另严格检查原生固定期限。重新加入受限状态、篡改DC／条件、删除账本或添加悬空链接均会被检出。

同一历史来源和IR修复前后逐字段比较，仅六处Actor差异：爪击Item／Activity增加GM说明、移除两个错误Effect及活动链接、增加明确GM状态账本。全部其他字段严格相同。见`condition-regression-before.json`、`condition-regression-after.json`、`condition-exact-artifact-diff.json`，原件未更改。

## 旧测试的职责整改

保留原staged基础／整表／纠错次数和业务断言，改由明确legacy provider测试。Company、Needle和历史Vampire又通过当前公开完整IR入口→正式workflow做固定回复控制，完整IR、Markdown、Actor全等，没有删除字段获得通过。Vampire明确标为SRD5.1／2014历史兼容，不算2024内容质量接受。

原文语义判断移到已有显式SourceAudit检查，同一错误码及反例保留；默认检查继续拒绝非法结构、错误来源证据与转换差异。browser-runtime不再要求程序把AI意见自动抹掉或按正文补空集合，真实Lurker条件断言仍保留并通过。Guard原冻结输入的空custom type被具体拒绝；另有独立有效格式控制，不改冻结文件。

旧V2“目标数量1”目前进入目标限制文本，当前SourceOperation没有对应的数值targetCount字段。因此数值99与原文的比较保留为显式审计，不宣称默认代码验证了一个未承载的数值字段；范围、攻击类型、消耗、scaling等已支持数据的默认保真反例仍保留。该格式限制没有通过本轮修改偷偷补语义或扩字段。

逐断言说明为本任务证据`consumer-contract-migration.md`；首次失败与基线对照均保持。

## 实际检查

- 条件边界＋browser-runtime：66 pass／0 fail。覆盖四种明确GM条件、固定两轮原生状态、LF／CRLF、非法字段、元数据／效果／链接篡改、同状态多分支、不同状态混合两种顺序及完整无关Item不变。
- 七文件consumer整合：285 pass／0 fail／原有3 skip，2093条断言。三个跳过的私有历史base事实用例未新启用、未计通过，没有新增skip。
- 完整Intake UI／队列：140 pass／0 fail，包含两龙及草稿恢复／修正原要求。这次重验因生成／验证器实际变化，未重跑模型。
- 包类型、Foundry模块类型、构建、7份生产源局部anti-overfit及架构检查通过。架构1542模块／4317依赖无违规。
- 中途报告脚本及代码整合错误保留在首次日志：新增局部变量作用域、coverage输出路径不属于协议允许集合，以及误向无关Item报告缺账本。分别修正所属层后通过，未放宽协议路径或业务断言。

## 限定运行时

沿用Mirror PID35448、30001、Core14.368／dnd5e5.3.3／cor-cotn，无重启。安装只更新Forge的`scripts/index.js`，SHA-256 `5b94b8f37fd642c7b77aaae172940cc4e8a06107995b95b4a31767a92dceb7a8`；其余安装文件逐hash保持。

一次明确合成的当前格式机制控制，由正式workflow产生canonical Markdown，再通过正常Forge标准资料生成及GM创建。它同时包含GM处理的受擒／束缚与原生两轮中毒，验证对象是实际投影与保存，不宣称生成了新的官方生物。模型、Key、掷骰、状态施加、场景和时钟操作均不在本用例内。

正常创建Actor `066d5df1bf8300bb`。原生界面显示攻击+6、触及10尺、1d10+4，活动仅链接唯一poisoned Effect，原生期限显示两轮；受擒／束缚无自动Effect。完整Actor `toObject()`刷新前后严格相等，父级生产readback检查0差异，GM状态账本的完整规则／条件／DC14逐字段保持。

Core14.368会将旧duration.rounds迁移为duration.value=2／units=rounds，精确源码为`common/documents/active-effect.mjs`的`#migrateDuration`。首次辅助脚本误查旧字段，只修辅助断言后复用同一原快照；没有再次创建或刷新。

随后精确删除该Actor及唯一取证Macro `ZUsibzulSHgs9azB`。父级确认原318 Actor／94 Macro及其他所有集合ID／hash、场景和时间保持，候选store为空；唯一owned页面关闭，其他页面与常驻服务保持。`condition-runtime/parent-verification.json`、`final-preservation.json`和`final-browser-receipt.md`记录此范围。

父级查看截图后进一步明确混合状态的提示：把泛称“以下状态”改为“受擒 grappled、束缚 restrained”，避免把仍由原生Effect处理的中毒也读成手动。新旧完整产物严格比较仅Item与Activity两处可见文字变化，全部基础操作、状态账本和原生期限相同，相关66项检查再次通过。此文字精化复用已经通过的字段保存与UI组件证据，没有重复进世界；最新安装脚本为`c23d02c6d90dce39baaf4aa929a5e51f008e65975c138d5c6c5ef2284007f6a9`。原生截图对应前述5b94…构建，不冒称最新文字已另行现场截图。

证据根：`H:/CodexData/visualizations/2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53/forge-regression-recovery/`。检查日志为`condition-*.log`；限定世界证据在`condition-runtime/`。
