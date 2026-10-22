# Forge 三份完整2024来源：真实首次生成试点

2026-10-21。本批实际执行完毕：**1份正式/来源通过并完成限定实机与刷新读回，2份保持阻断；原始首答及失败不改**。这不是模型准确率统计、全来源接受或产品收益证明。

最终产品目标仍是更可靠、更快、更省、减少逐步干预的Foundry Forge mod。本次通过正常mod UI生成，未用诊断CLI代替产品入口。延续[当前状态](../plans/2026-10-20-forge-ab-current-state.md)，保持前批能力和原始冻结结果。

## 范围、候选与来源

- 用户授权每份一轮首次生成，最多纠错一次、分开计数；真实遗漏/错误继续阻断，正式与来源通过后实机。
- 同一工作树`20261019-forge-ab-fixed-replies`、HEAD`f637f77f28c086e34297513e5293f98b3835f2e9`，37项已接受实现/测试文件与前批一致。本批没有修改产品代码、提示词、校验器、最终JSON或旧夹具，也没有Git发布、生产写入或版本升级。
- 唯一Mirror：Foundry14.368/dnd5e5.3.3/cor-cotn/80启用模块。Forge脚本SHA`f266b830b9a31fe085bb1c6f2d6856161292a7625c465e39122d958d7e22ed70`；resolver脚本SHA`a0b0b21f56715394b4afe230b18fe3a0c56a8001a4279cfe3aa4518838791f43`，磁盘与实际客户端抓取一致。
- 普通UI连接：DeepSeek/deepseek-flash/OpenAI Chat Completions/Auto/JSON Object；实际9回执model均deepseek-flash。保持source输出语言，不另做翻译或付费复核。不能与历史high/固定回复批次直接比较耗时或准确性。
- 三份均来自[官方SRD5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)，使用2024规则。PDF SHA`8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`；逐页渲染/目视核对完整左右栏。只修PDF单词断行及数学负号，raw文本与来源正文同时保留。三份均未用于前批Company/Vampire修复。

| 来源 | PDF页/完整能力 | 正文SHA-256 |
| --- | --- | --- |
| P1 Brown Bear | 346，3项；含右栏Claw | c59b294563ba028d7cd4f25c00dfa02b0d739a72ed259b58bbb611fb0c78b5e5 |
| P2 Mage | 305，5项；完整Medium or Small、法术清单、Bonus/Reaction | d572dfcb4649f39c34f389dba5a2bd82515b023eb2540ee0f6daf539b49581dc |
| P3 Adult Green Dragon | 294，9项；含右栏传奇续文、巢穴/资源/施法/目标与冷却 | fd21907ae13e9b4dde3206c333bb6518bdeb8bc1b0513fa438ac7af0eb717f57 |

本地完整证据根`.local/forge-fresh-2024-pilot-20261021/`。`sources.json`、逐页PNG与预先写定的`source-acceptance-rubric.md`保存完整性和核对标准。

## 实际调用、耗时及干预

每份仅一轮真实生成；初始识别、基础、BW特性按实际HTTP逐笔计算。未把provider包装器的extract一次当作实际HTTP一次。

| 来源 | 实际首轮结果 | 首轮模型HTTP | prompt / completion / total tokens | HTTP完整响应等待合计 | 点击至观察终态 |
| --- | --- | ---: | ---: | ---: | ---: |
| P1 | 正式与来源通过 | 3：discovery/base/whole-v2 | 4262 / 1402 / 5664 | 8.879秒 | 36.839秒 |
| P2 | Skills字段边界阻断 | 2：discovery/base | 2078 / 856 / 2934 | 4.840秒 | 32.177秒 |
| P3 | 3处V2适配阻断 | 3：discovery/base/whole-v2 | 6835 / 12168 / 19003 | 53.204秒 | 64.846秒 |

各份纠错HTTP均0。三份生成共8模型HTTP/27601tokens；必要共享连接probe另1模型HTTP，70prompt+68completion=138tokens/1.244秒。因此全批**9模型HTTP，13245prompt+14494completion=27739tokens**。completion含provider回执的reasoning用量，不额外叠加。模型列表GET另1次，依据本次正常DeepSeek测试代码路径；窄chat观测器没有捕获该GET原始网络记录，不伪装逐笔抓取。

HTTP时间是每笔完整响应等待，不能当完整产品耗时。“点击至观察终态”含Chrome工具往返和P1 15秒/P2P3 20秒观测间隔，是实际终态观察上界；meter的run时间还包含父控核对/切源等待，未拿它刷性能数字。没有当前币种价格/账单核对或受控A/B，不能宣称变快/降费。上述tokens只统计Forge provider回执，不含Codex编排与人工审查成本。

额外操作明确区分：

- 生成结果人工编辑0；模型纠错0；额外向用户索取信息0。正常来源核对/GM批准及完整手动规则裁定不计作修复模型结果。
- P1第一次UI提交被“连接未测试”本地门阻断，实际provider0；完整保存错误，再正常连接测试一次。因此UI生成提交共4次，但实际生物生成仍3轮，未暗中重复首答。连接测试是共享前置，未计成P1纠错或混入首答tokens。
- P2/P3提取失败时没有可用IR，现有正常repair入口无法执行；未使用纠错额度不证明产品不需要纠错。这是本次暴露的工作流限制，未另造自定义付费修复或重生成。
- 调用观测Macro、精确checkpoint内存保留、读回Macro及选择自有Token的API按钮属于验收准备，全部留痕。它们没有写生成结果或伪造活动结果。

## 来源核对与失败归因

P1父控19项来源读回通过：身份/体型、全部基础值、速度/感官/感知/先攻、CR/XP及完整3能力。Bite和Claw各保留中立1d20+5/reach5与独立正确伤害1d8+3 piercing、1d4+3 slashing，不猜Weapon/Spell。Multiattack一Bite一Claw及Claw Large-or-smaller Prone完整留GM；无额外Save或无条件Effect。正式与来源verifier均accepted、ready_for_gm_review，0repair，原包0macro/0asset。见`P1/parent-source-acceptance.json`。

P2实际`ANALYSIS_INVALID_RESPONSE / UNSUPPORTED_STATIC_FACT at /creature/skills`继续阻断。原模型skills为arcana6/history6/perception4，和原文相同。源码HEADS/METADATA不把Gear当字段终止，staticEntries把紧随Skills的Gear Wand追加为技能正文，从而拒绝。这是本地字段边界缺口，不能归为模型技能遗漏。未删Gear、未改来源/回复，没有完整能力或最终Actor接受证据。见`P2/parent-failure-review.json`。

P3保留实际3诊断：

1. `V2_USE_COUNT_CONFLICT /features/unit-3/uses`：回复有Resistance3及巢穴4说明；当前接口对条件次数标题不接受普通flat uses提案，由独立来源ledger承接。它首先暴露接口不匹配，不能直接说原文次数被漏掉。
2. `V2_SPELLCASTING_GRANT_UNSUPPORTED /features/unit-8/spellcasting`：回复保留CHA17、无需Material、全部3法术与MindSpike3环。源码会把换行的施法介绍续行放进manualGrants，之后spellEntries要求manual条目具有grant标签，是明确审查线索；完整清单核对尚未完成。
3. `V2_TARGET_CONFLICT /features/unit-11/save/target`：回复目标字段是球体内每生物，独立区域字段有20尺Sphere/90尺/可见点；当前比较器要求目标字段自身出现visibility。接收者资格与区域放置点的绑定需分别审查，不能仅凭该诊断宣布完整回复丢了可见点。

以上均未通过删字段、改JSON、修改校验或手动改回复求接受；原始阻断保留。也不承诺修这3处就能接受整个回复：其他未到达检查（包括AtWill恢复字段契约）仍可能失败。见`P3/parent-failure-review.json`。

## P1实际mod与实机接受

正常Forge上传原包→预览→GM来源核对批准→创建Actor`10f9a6f77bbb3597`。独立目标为官方MM2024 Guard副本`27asrahborCpchn9`，两自有Token精确放置并可见；已有318Actor、7原Token不作测试对象。

实际客户端prepared读回HP22、AC11、先攻+1/score11、Perception+3/passive13。使用正常ActorSheet Claw：

- 中立辅助检定只掷一次，1d20+5，原骰12，总17；目标AC16，由GM判定命中。
- 命中后独立伤害只掷一次，1d4+3 slashing，原骰4，总7。
- 两条真实聊天卡保留完整GM提示、未分类攻击和Large-or-smaller Prone文字；没有额外Save、自动Prone或HP应用，源/目标HP保持22/11、effects为空。
- 一次完整reload后，同Actor/3Item IDs/Activities及prepared值保持。限定接受不等于自动命中、HP/抗性结算、倒地施加、Multiattack自动组合或Bite按钮已实测。

父控独立13项读回及限制见`P1/parent-native-acceptance.json`。真实API选择/target/pan仅准备自有Token；实际Claw操作/骰子由正常UI完成，未把API准备宣称UI点选。

## 恢复、证据与运行边界

原已保存上传包/译文checkpoint只在内存保留，未制作备份或扫描其他storage。结束snapshot SHA`29d5d975377ed9b59d64fdd1186f500bdfd557823cbd458c16b10fc53b31895a`精确恢复；revision204→216包含真实任务审计，其中恢复误重复一次额外+1单列，未称整个存储envelope字节不变。正常UI旧草稿提示在reload后恢复。

2自有Actor/2Token/2消息/2Macro精确删除。父控读回318Actor/180世界Item索引、94原Macro索引、7原Token完整JSON和10原Combat完整JSON；场景内容除真实_stats审计外一致，原Scene/paused=true/worldTime21085811/控制与target恢复。原服务PID8712/14.368/127.0.0.1:30001/HTTP200保留。只关owned Foundry tab，保留原about:blank。Key已正常清除、persist=false、宿主变量释放；observer在reload前停止。

保留的工具/操作失败：初次漏传版本选择启动自有14.364进程后停止并显式重启14.368；初始代理实际模型不符后换成经收据验证的Sol/medium；旧草稿重新预览无可见结果；报告下载事件timeout后同页完整原文补证；恢复按钮误重复一次；关ownedtab后的额外MCP读回返回bridge未连接，父控最初按JSON解码失败。最终世界证明来自关tab前实际API完整快照、精确删除回执和最终Macro DOM，另有当前进程/HTTP读回；没有重开tab或重跑已过业务来补报告层错误。

343历史冻结文件、原评分及7受保护2024/历史输入不改。初始127dirty/untracked路径除获授权当前MD外均保持；本批另增本验收记录，产品候选不变。观测器零网络检查、19项来源核对、13项实机读回、原始请求冻结/凭据边界/最终恢复检查完成。复用前批仍有效的整合门，未重跑全仓测试；未改变产品用户入口/支持版本/操作步骤，本轮仅新增试点记录，无手册功能变更。

完整收据：`.local/forge-fresh-2024-pilot-20261021/pilot-final-receipt.json`。原始模型证据与逐笔用量：`model-evidence-freeze.json`和`model-requests/`；各份首次报告/raw meter独立保留。恢复证明：`parent-restoration-review.json`。本批已要求的3首轮及通过者实机完成，产品缺口仍待后续实施：Gear字段终止、条件资源接口、换行施法介绍与grant边界、目标/区域中心资格绑定、提取阶段一次纠错的正常入口。先用这批冻结证据修复并保留反例，不能把本批1/3改写成后补后的首答成绩。

This work includes material from the System Reference Document 5.2.1 (SRD 5.2.1) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
