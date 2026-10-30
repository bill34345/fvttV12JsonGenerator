# Forge 再扩样：52 条未用原文与外部施法归属修复

日期：2026-10-18。候选：`20261006-111625-bettermonsters-eye-deep-sample`，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。

结论：**本轮选定52个新完整父段，104条正确链通过，222项错误/漏文被拒，1项来源主导归正恢复周期且结果正确。旧331案例全部回归通过。修复了外部新出现施法者的误归属，以及独立复核发现的列表遍历漏检。最后20个怪物父段在修复冻结后首次全过，未再修改代码。**

这不是52个新怪物或52种全新机制；32条物品规则放在明确合成Actor上验证来源/原生基础操作，不宣称角色已装备物品或实现物品导入。5条真实施法附加资料未纳入本批52例，也未被伪装成GM Utility通过。

## 1. 问题的原因是什么

Efreeti Bottle原文先让一个efreeti出现，再按随机表决定它是否替使用者施放Wish。旧检查把这位新出现生物的施法，当成了承载者自己获得法术，因此普通入口要求不存在的施法清单，分步入口要求不存在的本体施法属性。完整正确GM规则在两条入口都被拒。

首次修复之后，独立复核发现另一风险：列表检查只读取第一个匹配。若第一份列表属于外部生物，后面还有本体真正的列表，检查可能提前退出，把本体法术也当普通文字放过。这个反例已经通过完整链复现accepted/只有Utility，再以持久测试修复。

Sword of Life Stealing的另一处首测失败来自测试提案：第一句伤害证明漏了同句的Weapon类别/稀有度前缀。补完整合法证明句后通过，没有把它记成产品缺陷。

## 2. 证据是什么

### 来源、版次与去重

规则来源为[官方SRD5.1](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf)／2014；交叉核对官方dnd5e5.3.3固定提交`965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，不混用玩家种族、新版怪物或记忆补写。

- 物品组32父段：32份精确物品文件＋4张关联表的公开捕获，24页PDF，完整保留所有结尾与表格；最长2198字符。Catalog SHA-256 `16d2f0273ff5571750316318e0b8d300654046f0de643c62d4faf9b2acfd4292`。
- 怪物组20核心父段：取自25项研究中的非施法部分；全研究含23份固定官方Git原文、39页78栏。Catalog SHA-256 `34c18b73ac3cb5c989271107c7257aa8e2725119a36cd5665e529e5e0124ff3f`。额外5施法父段标有requiresSpellcastingPipeline，未计入测试数。
- 核对旧331案例的全部344个能力父段，并额外核对更早的4份native/statblock/weird研究fixture，完整父段无匹配。52项在旧语料及本批均无精确重复；替换已知主体名与数字后也无相同全文。词汇近似仅用于人工复核，不能当自动语义去重证明。

6个较近例已逐项审阅：Fire Elemental对比Magmin改变目标回合START/END；Ghast对比Ghoul取消elf豁免例外；Mummy Lord成功豁免的保护覆盖mummies及mummy lords，普通Mummy排除lords。其余分别增加逐次替换、可用性/部位限制、三形态速度矩阵。这些是新的条件、对象或时机对照，不只换名字或骰子。物品组5对共享尾文也已披露：容器各自的逃脱、损坏、容量等主体规则不同，完整共同尾文没有删掉。

资料差异以PDF为准：[Efreeti Bottle固定原文](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/items/trinket/efreeti-bottle.yml)用于交叉核对施法者与随机表；银质Horn of Valhalla的PDF为2d4+2而pack专属说明为3d4+3；Rope of Entanglement的pack主说明缺少PDF后半段。Lemure、Ghast标题及Archmage星号差异在研究目录单独保留。

### 执行结果

固定provider回复仍走来源→普通/分步入口→IR→validator→renderer→公开workflow/parser/generation→verifier。目标显式14.364/dnd5e5.3.3/core/icon-off。没有真实模型调用或手修Actor。

| 选定批次 | 正确结果 | 错误/漏文被拒 | 来源直接主导且结果正确 | 合计 |
|---|---:|---:|---:|---:|
| 新32物品父段 | 64 | 145 | 0 | 209 |
| 新20怪物父段 | 40 | 77 | 1 | 118 |
| 本轮52合计 | 104 | 222 | 1 | 327 |
| 旧331回归 | 662 | 1378 | 14 | 2054 |

唯一新来源主导项位于ordinary：故意把Lich的3/Day改成短休恢复，入口按原文恢复daily，IR与最终计数器均为3/day。这是已有来源绑定的确定性归正，单独记1项，不计入222拒绝；原始错误提案确已交给入口，并非未请求。与旧批合计383案例/766正确链/1600拒绝/15来源主导，共2381检查。正确对照被拒一直算支持缺口，未计成防护成功。

物品首测保留于`rules-first`：60正确、4正确误拦；Efreeti两条是真缺口，Sword两条是提案边界错误。最终`closed-rules`为64正确、145拒绝。最后`monsters-first`在`pre-monsters-freeze.json`后读取并首测，40正确、77拒绝、1来源主导；13个冻结代码/测试文件在首测结束后完全不变。

代码检查：native **794/0**、staged **264/0**、parser **135/0**、generation **287/0**，生产及package类型、2个修改生产源anti-overfit、architecture、独立输出目录的浏览器bundle及安全断言通过。没有删除/替换既有dist。

32个定点产物读回另外检查了：物件AC/HP不写入本体，水体体积不变成生物伤害区域，按充能/伤口计数的伤害只保留单位GM骰，不猜基础攻击；持续伤害发生在目标START且不重复扣主资源，Legendary Resistance日次数不借传奇动作池，elf例外和免疫覆盖范围保留。6组原字节来源/MD与实际IR/Actor导出还通过verify:intake及verify:actor，warnings和sourceIntegrityErrors均为空。

### 边界与记录

证据根：`.local/forge-extra-64-20261018/`。研究者不读实现/跑产品；物品组在第一次源码冻结后读取，怪物核心在最后修复冻结后读取。首次失败、全部工件、独立复核和来源捕获保留，旧967份证据不改写。

固定假回复验证本地处理链，未验证真实AI首次整理、任意改写、完整怪物/装备导入、装备状态或Foundry实际导入/点击/刷新。复杂表格、充能缩放、临时生命等保留完整GM规则，不据文字完整或原生基础骰可用宣称高级机制已自动执行。混合否定/正向全文的polarity仍沿用既有保守规则，本轮未称该类结构化施法完整成功。

## 3. 解决方案是怎样的

在已有casting判据内，要求a/an/another引入同一名词短语，并明确appears/emerges/is summoned/created，才证明后面的the主体为外部新实体。单法术、列表和归属极性共用该证据，显式把外部法术塞进本体清单会由NON_POSITIVE_SPELL_GRANT拒绝；旁边本体真正施法继续保留。

列表逐个判断，不在第一个外部或否定列表处提前结束。新增的外部/本体列表先后、相邻真授予、普通spellcaster profile和完整Efreeti两入口回归，修复前失败、修复后通过；没有增加任何怪物名例外。

沿用现有诊断入口，分别选`tests/fixtures/forge-extra-item-rule-cases.json`及`forge-extra-monster-rule-cases.json`，使用新的输出目录保留历史；发现真实缺口后只修共性、重跑受影响来源和既有测试。最后20原文首次通过，结束本轮。未新增全局hook、后台循环或每次生成的第二个AI审核。

待判断安装/本地化项：无。后续新候选复查：先比对本批完整父段和近似例的逻辑差异，再核对原版完整父段、确定正确与错误提案，复用公开链首测；真实施法附加须单独走既有manifest管线，不准转GM Utility充数。真实AI与Foundry接受继续分层，不推广本轮结论。

本轮仅在已授权原开发副本修改相关代码/测试与说明；不提交、合并、push、安装、世界写入、服务重启或修改hook配置。手册按实际共享影响人工核对后同步，来源检查不成为阻挡其他工作的全局门禁。

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
