# 牧师施法与角斗士长矛交接修复（2026-10-24）

本批处理用户指定的两项问题，由主代理亲自完成。沿用8fd68ea和当前worktree；先前“三只旧CLI比较”的文档改动保留。用户已明确生成以AI结果为准：原文核对只提示，不能覆盖、删改或阻止生成；本批按这一数据优先级修复，不新增自然语言正则来解释“同一施法属性”。没有新增AI请求、狮子测试或玩法扩展，没有提交／合并／推送／修改hook。

## 原因与改动

### 牧师：附加文字限定不再撤回整组法术

原DS回复已经给出两组感知施法、DC13、随意／每日次数以及神圣援助四选一共用每日3次。四个神圣援助法术又附带`using the same spellcasting ability as Spellcasting.`文字限定。旧Resolver不支持这项casting限定就抛错，七法术事务在第4项失败并回滚，最终无Cast。

现在直接采用AI结构化参数。可映射的参数照常录入；不能自动映射的casting文字保留在既有完整特性／法术提示中，并进入既有Resolver报告。Forge完成页和批量记录显示具体法术与文字限定。未知文字不再撤回整组法术，不自动推断新的限定效果，也不把已录入写成所有限定都自动实现。仍使用目标世界已启用资料包的真实法术、现有选择／owned缓存和事务机制；未修改compendium。

CLI此次未访问目标世界，旧CLI没有最终JSON的直接原因仍是旧提示词把Spellcasting标成Save后遇到当前共用出口。它不能证明目标世界没有这七个法术；本批在Foundry中实际检索并录入，解决的是Forge／Resolver交接。

### 角斗士：Feature保留近战、远程与同一份伤害

原DS结果完整包含攻击+7、触及5尺、射程20/60尺、2d6+4穿刺。旧生成器仅给中立攻击建立一个GM检定；同时向Activity写入dnd5e5.3.3不支持的`range.long`，导致保存时60丢失。

按实际安装的固定系统源码`dnd5e.mjs:11288`，Activity RangeField只有value／units／special，没有long／reach。本批保持Spear为Feature，按AI明确给出的两种模式生成两个GM检定入口：近战5尺和远程20/60尺，均1d20+7；只保留一个命中后2d6+4穿刺伤害入口。远程普通距离20保存在value，60保存在支持的special文字并显示于入口名称，完整结构化原始距离也保留。没有套官方Weapon或把伤害改成标准长矛伤害；命中、暴击和远射程劣势仍由GM处理，本轮未扩展这些玩法。

### 原文对照与AI字段分离

普通Forge AI入口不再调用生成前的`normalizeMonsterSourceFacts`，移除根据原文回填身份／先攻／豁免、语言或改写悬浮等路径。原文核对仍可产生诊断，不能通过这条回填路径改动AI给出的生物字段。三个原DS结果的analysis.creature与原回复creature逐字段相等，原始IR保持；错误不自动改为accepted。此次证明限定在本批普通Forge路径及对应检查，不称为全项目所有历史入口均已审核完。

## 本地Foundry实际结果

使用当前常驻Mirror PID10172／127.0.0.1:30001／cor-cotn／Core14.368／dnd5e5.3.3／Midi14.0.11。通过正常工作台、顺序队列、GM确认、角色创建和Resolver录入；Provider仅重放原两份DS回复以验证程序修复，无网络模型端点。两项均attempt1／applied。

| 生物 | 实际角色 | 录入读回 |
| --- | --- | --- |
| 角斗士 | Actor.d7edfe2578c74f73；HP112／112／15d8+45 | Spear为feat；近战5、远程20且special“远射程60尺”；两个1d20+7入口，一个2d6+4穿刺伤害；没有被系统丢弃的Activity long字段。 |
| 牧师 | Actor.7b32541e2299c7a1；HP38／38／7d8+7 | Resolver hydrated；7个真实缓存Spell和7个Cast，均WIS／DC13；目标资料均2024。Light／Thaumaturgy随意，Spirit Guardians独立每日1次；神圣援助四个bonus Cast共用所属Feature的3/day池，每个消费1个itemUses。四项文字限定进入报告并在Forge可见。 |

录入前Forge自身的内容读回未报告差异。录入完成后整页刷新，两只完整Actor DTO哈希与刷新前逐字一致；角色、法术、射程和资源均保持。没有点击法术使用、扣次、攻击命中、ApplyHP、回合或生产操作，所以本页不声明这些玩法通过。

浏览器实际Provider重放计数discover2／extract2／review0／repair0／liveModel0。原始DS回复及来源冻结文件哈希保持，没有修改原失败成绩或称为新AI首轮成功。用实际队列canonicalSource经正式公共workflow重生成两份JSON，哈希均与浏览器候选一致；没有手改最终JSON。两份现有verify:actor均退出0；原文疑点仍独立保留，不用这两个退出码宣称全部内容正确。

实际界面截图位于下述证据根`forge-spell-warning-final.png`；仓库文档不复制外部证据文件。

## 检查与保留的限制

- 候选输出／协议／创建73项通过，其中当前官方回复只运行角斗士、美杜莎、牧师，狮子已移出该重复验收入口；三个analysis不改AI生物字段。
- 原生操作相关现有套件1237项通过；Resolver507项、候选／界面242项、bundle3项通过。计数有交叉，不合计为独立用例数。
- packages／Foundry modules类型检查，架构检查和局部anti-overfit4份来源通过；两份正式Actor verifier通过。
- 首次扩查有两条旧断言仍要求疑点阻止生成，分别在`forge-ordinary-source-contract.test.ts`178／257附近。按已确认政策改为候选可生成、疑点保留、原AI数据不变及无额外调用；首次日志保留，未修改原DS回复。
- 原三样本的Gear遗漏仍是待处理事项：角斗士与牧师装备不在原AI结构中，本批没有凭原文擅自补入。原语言／来源核对误报仍显示提示，不冒充已消失。
- 既有独立statblock预览文案检查失败保留在上一批验收记录，本批没有再次运行或修复；它不是这两只的录入失败。

辅助取证有两处工具修正：界面JSON导出711058字符，单次工具读取截断，改为分段读取同一导出；没有重跑业务。最初辅助比较错误地把完成Resolver后的Actor与录入前便携产物整体比较，因真实缓存与系统默认字段不同失败；改为保留已完成的正式生成结果，分别引用Forge录入前读回及本次明确的水合后参数断言。未放宽产品读回、改数据或重新创建角色。最终完整DTO刷新比较独立通过，原辅助错误日志保留。

## 证据、清理和安装

证据根：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-priest-gladiator-20261024-c8e241`。

- `frozen-inputs.json`：同两份原DS来源、回复及旧验收工具身份。
- `native/install.json`：两个模块脚本前后SHA-256和仅本任务两份静态工具；没有备份或服务重启。
- `native-readback.json`、`reloaded-readback.json`：完整角色、队列、法术与原世界保护数据。
- `field-verification.json`、`regenerated/`：独立字段核对、实际队列Markdown及正式workflow同哈希JSON。
- `forge-spell-warning-final.png`：实际Forge界面显示已录入及具体限定，其他早期截图未充分显示目标提示，保留但不冒充该证据。
- `cleanup.json`：最终读回后仅删除本任务两只角色和QA存储；原世界ID／Guard／Token／视图／时间与原scope一致。
- `macro-cleanup-final.json`：本任务宏Wk6eNZ8Td2fLEKN6与编辑器不存在；早一次异步删除尚未完成的读回保留。
- `static-cleanup.json`、`browser-cleanup.json`：两个任务静态工具已精确移除，本任务页651350048关闭，其他页面未动，PID10172和最终安装产品保留。

最终安装脚本：
- `F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/fvtt-json-forge/scripts/index.js`：`f667f66afeba7fa29de22d787417e4c3311cd3c0ed6aa83d7d86b3519f766dff`。
- `F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/fvtt-json-generator-spell-resolver/scripts/index.js`：`e07f1f0cde2fa1135119d14557925373fdfd77da700812d2750db1dd024160ba`。

手册按实际用户行为同步；已有8项watch影响人工核对，保留Item／Species及CLI正式输出的独立约定。手册HTML生成与一致性、代理约定生成检查随本批完成。当前浏览器仍有已明确的本地file协议拒绝，未重复尝试或换通道；手册视觉打开未执行，实际生成HTML文字另外核对。Foundry界面真实观察与截图已完成。
