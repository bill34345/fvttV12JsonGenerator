# Forge 非PDF修复的最终核账

日期：2026-10-17。本记录接续[原始目标核账](2026-10-17-forge-original-goal-status.md)，不改写那份历史调查或任何失败原件。

## 结论

这轮按用户顺序要求修复的三项——施法次数/共享归属和复杂授予承接、影响规则的中文与共用语法、正常浏览器入口及受影响旧能力防回退——已取得相应的代码、保存输入、正式来源链和实机证据。完成判断来自这些产品行为，助手移除和fixture清理只是最后的恢复步骤。

这项接受限定在本地Mirror Core14.368 / dnd5e5.3.3、正式产物目标14.364/core和下列来源/规则形状。它不是任意怪物成功率、所有旧格式穷举、生产发布或所有复杂规则自动结算的证明。Gith在本轮之前未生成，但其来源参与过语法预检，不能称盲测；Shared是人工控制来源，不能称真实AI新怪。历史六例0/6、Archivist V10中文失败和各次原始失败仍保持原结论，不因本轮样例通过而升级。

工作树仍为`20261006-111625-bettermonsters-eye-deep-sample`；HEAD仍为`f79c25fbac747a7e08f98c48779f052c3db68599`，索引空。无提交、合并或推送，PDF不在本轮修改范围。

## 从原始问题核对产品结果

| 用户要的行为 | 当前证据和边界 |
| --- | --- |
| 普通攻击、伤害、Save、范围和次数不能被复杂正文抹掉 | 保存Cloaker、死亡/复仇天使、Company的来源回归和已接受实机证据继续有效；本轮Gith实际普通攻击/多段伤害、充能消费和独立后续Save进一步通过。未重测Foundry命中/DC/伤害算术。 |
| 同一攻击Item里的后续Save必须能由GM单独点 | Gith Temporal Item同时保留Attack和单独WIS16 Save；实际控制独立靶点击原Save卡，靶自己的真实Save消息关联源卡。先前充能spent1不再扣第二次。穿越时光/返回位置完整交GM，没有制造永久消失Effect。死亡天使原CON18/dead接受继续有效。 |
| 法术必须真实匹配和施放 | 正常浏览器Gith生成后匹配PHB2024三法术。See Invisibility和Plane Shift实际施放产生原生消息，缓存准备视图免除V/S/M且使用来源动作时机。Teleport保留可用一次，没有为了凑数量重复施法。 |
| 每项N/日不能被旧1/day限制挡住 | 保存真实`UNSUPPORTED_CAST_USES`失败；修复实际planner owner的遗漏限制。public planner/正常Actor service回归red396/6→green402/0。Gith3/1/1独立池实际使用后和刷新保持spent1/1/0。非法计数、周期、at-will混有限次数、prepared来源等级/法位归属及pact等不支持方式的边界未放宽。 |
| 共享次数扣同一个池，独立次数不被连带扣除 | Shared正常导入/匹配后，Blur使Item池spent0→1，Disguise Self使1→2；第三次默认消费被原生“没有可用次数”拒绝，消息数和计数不增。耗尽后See Invisibility仍单独成功一次，只改Activity spent0→1/max3。真实刷新及无助手普通模块重载都保持共享剩余0/2、独立剩余2/3。 |
| 复杂施法不能让完整能力或可做部分消失 | Gith和Shared的隐形Mage Hand完整可见且没有无限制Cast；其余准确法术保留真正Cast。纯GM、混合native+manual以及后续AI修复保留的正式回归通过。一个特性多个不同共享池、射线选择/次数限制等不能精确表达的授予仍完整GM，不合并池、不伪造自动化。 |
| 中文必须保留条件和范围含义 | 本轮最后补Company r8正常页面一次生成，2连接+4正式流程均200，零repair/付费审核/人工改译。逐项核对28个显示字段：浴血仅限定半伤、受擒独立，球心距使用者60尺与半径15尺分开，成功/失败都结束2环以下法术，失败目盲期限与成功半伤保留，传送明确距自身当前位置120尺。正常GM批准后的正式Actor仍保留这些关系与完整原文；未覆盖旧Company卡。 |
| 来源/中文/生成/导入/匹配/使用要同一条可追溯链 | Gith r7正常Chrome选择原文→正常DeepSeek→源/IR/Markdown/Actor两个verifier→正常批准导入同一Actor→r8正常解析/匹配→实际点用→刷新，原件均保留。Company r8原语言和批准中文的三个正式verifier通过。Shared明确用正式离线来源链进入正常文件预览/导入，不冒充模型成功。 |
| 新名不自动加双语括号 | 现有死亡/复仇天使、Company及新Gith的真实卡面和来源回归继续有效。作者自带的充能、Psionics、每日次数等括号保留。没有改旧卡名称。 |
| 防回退不能只是绿色测试 | 本轮最终局部门、类型、局部anti-overfit、架构与手册证据按影响复用，311生产源码在实机批次结束时与r8冻结完全一致。旧能力受影响的同Item Save、来源效应、法术缓存/期限、独立资源、反应/充能等分层核对；不是宣称所有旧能力在任何来源组合下都实测。 |

## 这轮最后补的真实中文缺口

r4 Company保存/重开通过时，Strike-Gate仍写“位于120尺内”，没有显式测距原点。softbreak保护的离线100项通过不能替代修后正常模型结果。因此最后只补同源Company正常浏览器生成；不重跑已过Gith/Shared，不手改文字，不覆盖旧Company。

这次中文与来源逐条对照后可接受。原始报告`browser-native-r6/014-product-visible-json.json`、正常批准后的包`015-product-visible-json.json`和正常来源生成链`company-r8-source-chain/`保留。已用现有`prepareForgeEncounter`从精确页面包正式重生成批准Actor，没有修补最终JSON。`intake-verification.log`、`actor-verification.log`和`approved-actor-verification.log`均exit0。官方截图`company-r8-approved-preview.jpg`显示真实中文与原文对照。

## 运行环境和精确恢复

- Mirror PID12252、127.0.0.1:30001、server-mirror/cor-cotn、Administrator；本轮实机期间不重启Foundry。
- 最后完整原生读回`browser-native-r6/017-native-readback.json`证明307旧Actor和94Macro无变化，世界时间21085811、全局activeScene `EBJYd289N5uyTmlC`、模块启用配置不变。
- 唯一临时Scene `by9gBUnDBlcUpBNY`和其中3个Token、默认临时靶`IFVaB6WhyDjjbysW`经正常UI按准确身份清理。Scene从未active；原场景不改。Gith `ace5d3afdcde19d2`和Shared `ab8df4f05e4886e2`保留，清理后的两张完整Actor与048刷新读回逐字段相同。
- 按r8安装收据核对26文件后，仅将Forge入口恢复为冻结纯业务字节，并删除唯一自有`forge-spell-rule-acceptance.js`。其余24个安装文件均不变，未清理其他文件。纯业务Forge SHA `ba6fec4bf1871d964f1a5d4dbea6930111c9ee072551989a4ba61cbc29794a28`；Resolver SHA `dbda100f4275b64a20523c498fa3ac3b08e1609aa7f9586c1b31006ebb423a21`。
- 真实普通页面重载后助手DOM不存在；两张同一Actor卡实际打开并展开，Gith可见剩余2/3、0/1、1/1，Shared可见0/2与2/3。只读Mirror接口补充确认计数和消费归属，未用接口写结果。完整Save/DC字段以原生toObject原件和卡面为准，不用连接器简化投影冒充完整Actor。
- 最后全旧卡哈希是在助手移除前、临时fixture清理后的017取得；无助手重载后核的是两张卡和普通模块，不把它说成重载后又重新计算了全世界哈希。
- 本轮自有r5/r6记录桥均通过正常shutdown退出，60495端口消失；已有Foundry/MCP服务保留。Key只经一次临时传递，未保存到浏览器，没有进入仓库或报告。

## 没有被本轮结论覆盖的范围

任意自由中文零误译、任意陌生来源稳定率、所有老授予/法位/传奇组合的真实界面穷举、其他系统版本、生产、长时自然到期均未证明。Gith类型附注“吉斯人”保留在来源/既有custom承接中，当前标题只显示“类人”；没有声称原生subtype标题显示也验收。复杂目标资格、条件性结果、回合精确期限、传送位置和结束其他法术等，仍按完整正文由GM裁定。

这些范围不能靠收据或清理升级；发现新的实际失败仍须保留原件、定位共用原因。当前接受的是用户本轮明确要求补齐的功能及其有界来源证据，不能据此改写早期失败统计。

## 最后证据入口

所有下列短路径相对`.local/forge-spell-and-rule-repair-20261017/`：

- `gith-r7-source-chain/receipt.json`、`planner-r8-repair-receipt.json`、`gith-r8-parent-native-receipt.json`。
- `shared-r8-parent-native-receipt.json`、`browser-native-r5/043`至`048-native-readback.json`。
- `company-r8-source-chain/receipt.json`、三个正式verifier日志、`browser-native-r6/014`至`017`。
- `final-native-before-restoration-r8.json`、`owned-fixture-mcp-readback-r8.json`、`pure-business-r8-restoration.json`、`pure-business-r8-readback.json`、`pure-business-r8-mcp-entities.json`。
- `browser-native-r6/pure-business-r8-image-provenance.json`、两张原始官方Chrome截图、`final-environment-r8.json`及两个bridge-stop原件。
