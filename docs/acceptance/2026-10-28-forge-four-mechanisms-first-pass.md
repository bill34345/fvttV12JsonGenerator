# Forge 四类机制官方怪首答测试

状态：四次首答、本地来源对照、Mirror新卡配置验收及精确清理已完成。Ghoul和Dust Mephit通过本批机制配置对照；Ettercap和Priest有两项真实语义缺陷。四只均有Actor，不等于四只机制全部通过。本轮仅测试，未修补新首答、生成资料或最终JSON。

用户原话：“行，先把这轮修复按功能做本地提交，不合并、不推送，保留全部证据。然后按这四类机制测4只2024规则的官方怪，每只一次模型请求，共4次，不复核、不重试。检查Activity、伤害、Effects和资源，不投骰，也不重跑已通过的测试。”

## 本地提交

沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，先完成四批：

| 提交 | 功能 |
|---|---|
| `c8ef5a033075cda1ac0ab5ee22225cdc0a2b5af7` | 完整回答先接收，再整理内容格式；保留原答与接收诊断 |
| `95828ed7edf685a72d815d2ae29b41e0b19813ab` | 法术短休／长休恢复、共享次数、中文固定环阶贯通 |
| `b2c89eda6d4c8a1d2599301a568837b4de797802` | 官方状态模板、Activity关联及手动应用入口 |
| `5dc5702767bbcb0818a05a02e45c925289e66758` | 说明、手册和三处修复／官方状态的验收记录 |

模型调用前worktree已清洁。1156份既有私有证据逐文件hash保持；所有产品和测试源码字节保持，只有当前状态文档新增授权及提交说明。主工作区HEAD与42份既有dirty文件未改。未合并、推送、清理worktree或重跑旧测试。执行提交要求的agents生成／检查，无说明差异；手册此前build/check结果复用，新状态文档后的status仍33项一致。

整理部分暂存时曾发现无上下文patch的插入偏移错误，尚未commit也未执行；只撤回本任务自己暂存的部分，按原行区间重新建立index，源码工作文件没变。错误diff与最终提交清单分别保留，不将取证／暂存工具问题写成产品测试失败。

## 来源和调用

本批只用CHM新版 `怪物图鉴2025` 条目。前言明确配合《玩家手册2024》《城主指南2024》，并取代旧版怪物；不是旧2014 stat block。CHM SHA-256为 `836eea8912cf6c068687e99db4a1b4b6b915aeb2ef8af35cfb040803184686f2`。

| 官方怪 | 所覆盖机制 |
|---|---|
| 伊特怪 Ettercap | Bite物理＋毒素、多段伤害与命中中毒；Web Strand束缚及Reel前置依赖 |
| 食尸鬼 Ghoul | Claw命中后按目标资格追加CON10；失败麻痹、期限和正确活动归属 |
| 尘魔蝠 Dust Mephit | Death Burst范围DEX10／半伤；独立Blinding Breath锥形／目盲／充能6；Sleep1/日 |
| 祭司 Priest | 两种攻击、WIS施法、Spirit Guardians独立1/日与Divine Aid四选一共享3/日 |

每只使用完整唯一stat-block；原HTML及页前背景独立保留，只整理版面和表格。四份UTF-8无BOM/LF输入逐项核对原HTML的所有文本内容和顺序，不修规则。尘魔蝠半伤和限时状态属于两个不同范围Save，不合并。祭司来源拼写 `Thaumanturgy` 原样保留并注明；模型保留该原名并额外提供 `Thaumaturgy` alias，不把它当作本次七道法术丢失的原因。祭司只给WIS，没有字面DC，不把系统可派生的DC冒称来源明确数值。

使用原批实测runner，仅替换新证据根、四只名称／ID及request identity。固定 `deepseek-flash`、Responses流式、`monster-intake-extract-v52-official-status-effects`；maxAttempts=1，单样本及总请求计数在HTTP前记账。每只1次、共4次，四次均HTTP200且有completed实际文本。AI复核、纠错、重试、发现、探针、模型列表、翻译和配套配置请求均0。服务usage合计输入18403、输出69927、总88330 tokens；reasoning已含在输出内。

## 首答后的实际结果

| 样本 | 产物／检查状态 | 来源对照结果 |
|---|---|---|
| Ettercap | Actor存在，7项能力，程序accepted | AC12/HP44、技能、移动、多攻、Bite `1d6+2`穿刺＋`1d4`毒素、Claw `2d4+2`挥砍完整。中毒仅挂Bite命中后伤害；Web Strand DEX12／30尺／可见且不超过大型，束缚仅挂Save，网AC10/HP5及易伤／免疫／摧毁结束保留。**Reel额外生成束缚是错误，不能记整只语义通过。** |
| Ghoul | Actor存在，3项能力，程序accepted | AC12/HP22及免疫完整；两次Bite，`1d6+2`穿刺＋`1d6`暗蚀；Claw `1d4+2`挥砍、后续CON10分开。麻痹／失能只挂Save且onSave:false，非亡灵且非精灵及至目标下回合结束均保留。 |
| Dust Mephit | Actor存在，4项基础能力，程序needs_review | CR原答写字符串`1/2`，结构诊断保留，但Actor数值0.5正确且可生成。死亡时5尺radius／DEX10／`2d4`钝击／成功半伤，与15尺cone／DEX10／失败目盲／充能6分别保存。Sleep的1/日、CHA、DC10及无成分限定在便携法术清单中。 |
| Priest | Actor存在，5项基础能力，程序failed | AC13/HP38、两种攻击及完整伤害保留，Divine Aid原生计数3/day仍在；**七道法术引用全部被本地引文检查过滤，portable manifest及Cast缺失。** 施法文字存在不能算可施法活动通过。 |

所有未分类攻击均按既有中性 `utility.roll`＋独立damage表示，不因type不是attack误判丢攻击。检查状态与产物分开：accepted的Ettercap仍有语义错误，failed的Priest仍有可获取Actor。

## 两项真实缺陷与连带提示

**Reel误增状态。** 来源为“将30尺内因其绞网动作陷入束缚的一名生物……拉近”，描述已受束缚的目标资格，不是再次施加束缚。首答和IR均只有纯gm-manual能力，无appliedConditions；本地生成却增加 `restrained` 模板并链接Reel Utility。标记GM模式不能使这个额外能力变正确。下一步应修正文中的状态前置与真正施加语句的区分，保留Bite、Web Strand已有的正确状态，而不是取消整只Actor或一律关闭模板。

**Priest七道法术被删。** 原答已经提供两组、七个名字、WIS、独立1/日和共享3/日；组／usageGroup有原文，单spellRef未写evidence。入口按可选契约变为[]，renderer传入manifest，portable manifest检查却要求非空逐条引文；parser针对每条MISSING_EVIDENCE删ref，继而删空组，最终没有可供Resolver处理的manifest。这不是AI未答，不是Thaumanturgy拼写导致，也不是世界权限失败。下一步应使这类取证记录缺省只形成诊断，保留已明确的法术与资源合同，保持独立Item契约边界。

Priest的无Cast、孤立Feature、共享次数／激活方式诊断主要来自同一manifest丢失。Divine Aid仍有3/day计数器，不能写“次数完全丢失”；其说明Utility没有bonus激活不能靠把阅读器改成施法解决，需要保留真正Cast合同。体型“中型或小型”在实际传记中完整存在；程序追加逐引用GM记录后，传记presentation边界不匹配，丢对应元数据而导致ACTOR_SIZE_OPTIONS_LOSS，不能将该提示等同实际可见体型文字丢失。

此外，Dust Mephit的CR分数格式诊断未挡产物，最终CR正确；这是入口整理与结构报告不一致，独立于上述两处机制错误。

## Mirror实际配置与读回

本轮开始时旧PID27128及30001监听均已不存在。按正式installed readiness流程在端口空闲时启动同一现有Mirror，PID34600；没有升级、复制Lab或重启他人进程。专用GM页进入 `cor-cotn`，原生MCP确认Core14.368 / dnd5e5.3.3、唯一活动Gamemaster。Forge服务脚本仍为 `7c519c19fd86afd1df33bd6962ac3fa48f225a613bc80ead24d24cb230f8316f`，Resolver保持先前候选。

四只均从各自首答生成的标准Markdown，经正常Forge入口生成并确认创建；无第二次模型请求。观察宏只读回、打开卡片及精确清理，未替代产品创建，没有准备额外场景、Token或测试接收者。实际创建如下：

| 样本 | Actor ID | 实际保存结果 |
|---|---|---|
| Ettercap | `5a29aec49de5fda6` | 7Item；Bite双伤害和Poisoned、Web Strand DEX12/Restrained在正确活动；Reel错误的额外Restrained在UI和原生MCP均确认 |
| Ghoul | `ac4363c9bad78e02` | 3Item；Claw攻击／伤害／后续CON10分开，Paralyzed＋Incapacitated仅链接Save，目标资格和结束条件完整 |
| Dust Mephit | `7b9b18a3af11f110` | 4基础Item＋1个2024 Sleep缓存，法术导入verified；Sleep原生Cast独立1/day、CHA、DC10，无V/S/M成分；Breath使用一个1次/recharge6资源，死亡自爆与吐息独立 |
| Priest | `d1e5b3a7bfbd6676` | 原检查failed仍可正常创建，5基础Item、0Cast、无Resolver manifest；Divine Aid计数0已用/总3/day真实存在，但不是可用施法活动 |

Activity配置页实际看过对应伤害、范围、充能、状态和次数。Sleep的Cast `spell.properties` 在锁定5.3.3表示**忽略的成分集合**，三成分都在该集合中才是本例无成分，不据缓存原法术仍有V/S/M判错。实际 `toObject()` 和界面均显示 `spell.challenge.save=10`；原生MCP某些DataModel字段未序列化到返回值，原返回保存，不将工具省略误判为配置缺失。该字段解释对照锁定系统 `module/documents/activity/cast.mjs:166–181`。

最终刷新后按Actor ID逐个对照，四个Actor完整JSON无差异；集合枚举顺序改变，不要求数组顺序作为内容一致条件。原世界 `protectedChanges=[]`，新增Message为0，活动／查看场景、worldTime21085811、paused=true、controlled/targeted Token均保持基线。没有Use、Cast、攻击／伤害／豁免投骰、状态Apply或回合推进。既有通用Apply和删除效果测试未重跑。部分prepared `thinking` 状态没有对应Actor Effect文档，未归因本次生成，也未擅自清除。

Priest两次原生MCP读取正好遇到专用页刷新、Bridge暂时断开；保留 `mcp-priest-*.json` 原错误，待实际Bridge恢复后只补这两个失败读回，成功文件为 `mcp-priest-*-after-refresh.json`。没有重新创建或重生成样本，不把连接错误算进模型／产品失败数。

root完成逐来源、MCP、截图及刷新后按ID对照后，仅清理上述四Actor、观察宏 `QYZjRJ9OGwj24JK9` 和自有GM页 `651352437`。本批没有Scene／Token／Message可删。最终六集合逐ID/hash/数量完全匹配本轮启动后的基线：318 Actor、180 Item、67 Scene、94 Macro、10 Combat、1245 Message；场景、暂停、世界时间、控制与目标均保持。此处使用本轮实际基线，不拿上一轮1244条消息替代。Mirror PID34600保持运行；其他任务页面未操作。1156份历史证据及本批77份冻结输入／首答／产物hash保持，产品及测试源码与提交前已验收版本一致。

## 证据与后续范围

私有根：`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-mechanisms-20261028/`。

- `commit-baseline.json`、`commit-receipt.json`：本地分批提交及1156份原证据保持。
- `sources-prep/`：原HTML、完整来源、前言、选怪依据、字段预期、父代理独立冻结。
- `calls/`、`http-ledger.json`、`results/<id>/`、`first-replies-summary.json`：每次唯一请求、完整首答、completed文本、分析、规范来源、Actor和输出文件冻结hash。
- `semantic-review-first-two.json`、`semantic-review-dust-mephit.json`、`semantic-review-priest.json`：逐来源语义判断与根因；不修改产物凑通过。
- `chrome/`与`mcp-*.json`：本批新卡实际配置、文档读回与最后清理证据；不包含Use／Cast／投骰／Apply测试。

本批已用完明确授权4次请求。下一步应先针对这两处真实缺陷使用本批冻结材料修复，不再扩大样本或请求预算；此处只是建议，本次测试没有修改产品。旧生成、状态Apply、刷新／移除及其他矩阵通过证据复用，不将本批当作重新跑旧测试的理由。

上述四批既有修复已提交；本篇新首答报告和当前状态增量尚未提交。它们记录实际失败，不改变已提交的产品代码；全部私有源码／收据／截图继续原位保留。
