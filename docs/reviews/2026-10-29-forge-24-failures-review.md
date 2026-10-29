# Forge 剩余24个失败逐项复审

日期：2026-10-29。当前工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`；HEAD仍为`5dc5702767bbcb0818a05a02e45c925289e66758`。本轮只读审查代码、既有日志和冻结产物，没有运行测试、生成、构建、浏览器或模型服务，没有实施下面的修复。

用户原话：

> 行，先逐项复审剩余24个失败，确认哪些是真实缺陷、哪些是旧测试或入口问题，以及是否与前面的修复有关。先列确认的问题和修复方案，沿用当前worktree和冻结材料，不改代码、不新增模型调用，不提交、合并或推送。

## 结论与对前轮判断的修正

**确认1类P2产品回归，影响24项中的5项；其余19项是旧测试预期或旧入口失配。** 5项里，3项已直接因新回归在结构检查失败，另外2项首先被旧快照断言挡住，但独立保存的同一冻结成员已确认存在这个回归。不能把这24项全称为旧测试问题。

| 分类 | 数量 | 本报告编号 |
|---|---:|---|
| 真实产品回归直接成为首失败 | 3 | 13、15、16 |
| 旧快照首失败，同时存在被遮住的真实回归 | 2 | 06、24 |
| 旧输出、工作IR、诊断或快照预期 | 17 | 01、02、05、07–12、14、17–23 |
| 旧staged入口／诊断fixture失配 | 2 | 03、04 |

回归是最近五类修复中的**R01没有在所有消费者闭环**：引文成功重定位后，provider保留`candidateReview.findings=[]`作为正常历史；已有guard禁止空findings，于是正常内容被程序自己报成`INVALID_STRUCTURE /creature/candidateReview`。已有Actor仍生成并保留，但分析被误标待审、问题列表多出假错误，生成报告还出现`GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED`。

这修正了[五类修复验收](../acceptance/2026-10-29-forge-five-mechanism-fixes.md)中将R01算作完全闭环的结论。完整Actor相同、73项局部检查通过、失败名称没有增加，均不能排除这个诊断／状态回归。原先已保存的机械内容、原答保持和三只Mirror配置证据仍有效；本次没有发现必须撤销其已验证范围的机械损坏，也没有修写旧报告或失败产物。

## 材料、时点与方法

本轮私有证据根`A`：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-24-failure-audit`。

前轮五类修复证据根`E5`是同级`forge-five-mechanism-fixes`；前一轮46项对照证据根`E46`是同级`forge-46-comparison-regression`。`A/failure-inventory.json`保存24个完整用例名、唯一编号及所属入口。六组日志的重复名称只计一次，两个current-input用例也被generation-preservation重复收集。

`E5/check-results.json`及对应日志不是本轮重跑结果。较宽整合日志早于最后几项边界补修；本次逐条读取失败点、当前源码、现有完整Actor和分析记录，并对照前轮同名失败点。未执行到的断言和成员明确标出，不将它们写成PASS。主控核对空字段组及共同契约，两名只读代理分别复核CLI／旧入口／本地化／raw恢复和生成快照组；主控另追查R01的renderer、parser、生成与验证消费者。

规则及机械差异以冻结来源为依据；没有调用新模型或使用新版外部规则替换来源。Git diff用于区分已经在HEAD存在的行为、前序未提交修复和最近R01变更；无法精确定位旧行为首次引入提交的项目明确不作强归因。

## 已确认产品问题P01：正常整理历史被当作结构错误

涉及13、15、16，以及06、24中被旧快照遮住的成员。证据链：

1. `packages/intake-ai/src/provider.ts:651–668`成功定位全部引文后设置`evidenceNormalized=true`；`:758–760`即使没有实际问题也创建`findings:[]`的历史记录，保留旧提案和旧坐标。
2. `packages/models/src/sourceCandidate.ts:10–14`以`!value.findings.length`拒绝这个形状；`packages/intake-ai/src/structure-validator.ts:87`据此生成blocking的`INVALID_STRUCTURE`。
3. `packages/forge-browser-runtime/src/ai.ts:369–372,438–441`按该finding把分析标为`needs_review`。`E5/probe-current/{ledger-rakshasa,new-sample-mi-go,raw-control-unicorn,raw-control-spirit-naga}/analysis.json`及`probe-remaining/four-{unicorn,spirit-naga}/analysis.json`直接记录了空history和误报；对应generation均仍有候选。
4. **只允许空数组仍不够。** `renderer.ts:55–67`继续把纯历史写入规范来源，`parser/src/yaml.ts:96–98`接受后传给生成器。`generation/src/verification.ts:35–37`仅凭记录存在便称有未解决问题；`:42`及`:72`附近的同类消费者也须按实际问题判断。`generation/src/actor.ts:371–374`在document交付中还会复制整个记录到Actor flags。
5. 正式Forge当前使用`reviewDelivery:'external'`，所以两个raw/draft对照的完整Actor仍相同且没有该顶层flag；这不证明其分析／诊断正确，也不能证明document交付只改guard就能修好。

前后失败点对照尤其重要：

| 用例 | E46旧失败点 | E5当前失败点 |
|---|---|---|
| Unicorn／Spirit Naga | `forge-current-input-recovery.test.ts:102`第二个IR全等断言；第一个结构检查已通过 | 同行第一个blocking为空断言；收到新`INVALID_STRUCTURE` |
| Mi-Go | `forge-empty-fields-vulnerability.test.ts:208`旧Actor全等，差异为来源明确的状态增量 | `:206`blocking为空断言，尚未执行施法与Actor相等检查 |

**拟议机制修复，未实施：**

- 入口数据形状允许合法空findings历史，保留version、字段白名单、proposal类型／深度／数量和不可执行数据限制；不得添加假finding来满足旧guard。
- 原始回复、原提案、旧坐标继续留在分析／IR历史；没有实际未解决finding的记录不进入规范机械来源、document Actor审阅flags或待审判断。
- renderer、生成交付及verification共同按“确有未解决finding”判断。直接从规范来源进入的调用也要覆盖，不能只修普通provider路径。
- 用现有四个原答表示和四首答聚合中的对应成员，分别核对分析状态、问题列表、原坐标、正式Actor，以及external／document两种交付；真正坏记录的反例继续保留。相同Actor不能替代状态与诊断断言。
- 仍存在真实问题时照常列出，GM确认与程序检查保持分开；不强行把所有结果改成accepted。

## 24项逐条结果

表中的行号是当前测试源码；完整名称和原始日志位置以`A/failure-inventory.json`为准。处理码见下一节。

| 编号 | 用例及确切首失败 | 已确认事实、分类与前序关系 | 拟议处理 |
|---:|---|---|---|
| 01 | explicit-audit English confusion；`src/core/intake/__tests__/orchestrator.test.ts:726`要求正文含`Confused` | 旧GM附注／元数据预期。前面的WIS13、15尺球、传奇消耗2、专注、完整原文、无原生Effect均通过；直接调用显式SourceAudit，不是真CLI命令。`b2c89eda`尊重空statuses后不再制造非官方状态附注，早于12／107／22／最近5类。 | T6：保留真实机械和完整来源断言，不补造Confused原生效果；独立GM说明是否继续持久化另列边界。 |
| 02 | explicit-audit Chinese confusion；同`:726`要求英文`Confused` | 同01。完整中文“困惑术confusion”、回合开始和专注1分钟规则保留，不能以缺英文标签认定中文规则消失；`:727`的GM附注断言尚未执行。 | T6，同01；不能只删状态／期限的实质断言。 |
| 03 | legacy staged provider local source error before request；`tests/forge-discovery-grounding.test.ts:114`要求0次假HTTP，实际1次 | 旧入口fixture失配。当前provider走完整来源一次提取，不再由旧splitter对未知章节提前拒绝；`stagedExtraction`选项仍写在fixture里但正式路由已移除，HEAD已如此。与前22项中的旧入口问题同类，非本轮新回归。 | T3：历史分步反例接到现有离线staged helper；正式入口继续验证完整来源一次请求，不恢复旧前置否决。 |
| 04 | malformed base answer；同文件`:149`要求旧`stagedDiagnostic.stage` | 旧诊断预期。实际空creature答复仍以`invalid_response / AI returned no creature answer`、不可重试被拒；没有证据表明空答被接受为完整生物。与03同入口迁移，非107或最近5类引入。 | T3：检查当前错误码、不可重试和一次假请求，不要求不存在的旧分步阶段。 |
| 05 | nonempty misplaced／invalid root records；`forge-empty-fields-vulnerability.test.ts:48`要求根记录仍为undefined，实际[] | 旧工作IR形状预期。缺省附带容器由程序整理；非空错位记录保留，非法原值可在原提案及具体问题中追溯。不能要求工作容器与原答逐字相同。HEAD已有该接收行为；不是最近5类或107类型维护导致。后续循环变体未全执行。 | T1：分别断言工作容器、原答／原提案、非空内容和具体诊断，不恢复整卡否决。 |
| 06 | failed Rakshasa＋three successful artifacts；同文件`:84`旧Actor全等 | **混合。** 首只Rakshasa仅新增来源明确的Frightened／Incapacitated及Save链接，属于官方状态／保留修复增量；其保存analysis还确认P01，修快照后仍会有假诊断。日志先停在首只，后三成员未执行。 | **P01＋T4＋T7**：先修历史契约，再逐成员核状态、其余完整字段与真实问题；不能只更新快照。 |
| 07 | empty containers recorded once；同文件`:102`要求补齐路径顺序等于常量数组 | 旧无语义顺序断言。日志15条路径相同，只是senses／languages提到defenses之前；未显示路径或机械内容缺失。当前记录发生在首次补齐处，顺序不属于内容契约。与前22项“清除不可信历史”的修复对象不同。 | T1：比较准确、无重复的路径集合，保留幂等、原输入和告警code/path检查；后续断言未执行。 |
| 08 | explicit null／wrong types never replaced；同文件`:124`要求整理后整个IR等于非法原IR | 旧工作表示预期。日志明确保留null／对象／字符串原值及3个具体问题，工作表示改成可处理的容器／字面能力；不是把真实数值改写或猜出攻击。HEAD已有保留接收行为，非107或最近5类引入。 | T1：断言原输入不变、原值可追溯、具体问题存在且不新增可执行机制；不要求内部IR继续保持非法形状。 |
| 09 | vulnerability official conditional text；同文件`:157`坏报告decoder应ok=false | 旧附带报告否决预期。此前Actor、YAML和正常报告中的完整Bless条件备注已通过；只改报告`custom`为数组，Actor本体未改。现有decoder保留Actor并给`FORGE_REPORT_INCOMPLETE`符合46项政策，非新回归。 | T2：检查保留artifact/hash、具体坏报告提示和真实状态；保留后续真实内容漂移负例。 |
| 10 | vulnerability independent category；同`:157` | 同09；独立fire类别与带条件Cold备注分别保留。首次失败在报告解码，不是类别或条件混入错误字段。 | T2；继续保留独立类别、完整条件及真实类别漂移检查。 |
| 11 | vulnerability Chinese multiline note；同`:157` | 同09；中文多行备注及换行的正控已经通过，没有文本丢失证据。 | T2；精确多行文本比较保留。 |
| 12 | literal typed parser channel；同文件`:168`要求抛`InvalidVulnerabilityCustom` | 旧parser整项throw预期。字段内部仍拒绝非文字备注；`:225`逐字段捕获并由`:153–157`保留原`[piercing]`及错误，不把它写入真正易伤类别。HEAD已有该保留行为。后面的CRLF、IR和英文变体未执行。 | T2：检查可返回的模型、原值、具体错误和无类别污染，再验证其余操作保持，不恢复整卡失败。 |
| 13 | original Mi-Go full artifact/casting；同文件`:206`blocking应为空 | **P01真实回归。** 当前保存analysis有空history及假`INVALID_STRUCTURE`；Actor仍可用，独立完整比较只有Pincer受擒、Dazing Ray震慑／失能及链接增量。INT及2法术保留。旧日志在`:208`Actor快照才失败，现已提前。 | **P01＋T4**：先修误报，再核施法及具体状态增量，不能按旧快照问题一笔带过。 |
| 14 | unrelated original Rakshasa；同文件`:225`旧Actor全等 | 旧状态快照。保存产物只有Baleful Command的两状态及链接变化，原文明确两者；CHA及9法术保留。本例走合法草稿表示，没有candidateReview，findings为空，不能套用06原答的P01结论。 | T4：明确两状态、失败豁免归属和完整其余字段，不覆盖历史原件。 |
| 15 | Unicorn original raw provider normalizer；`forge-current-input-recovery.test.ts:102`第一个blocking断言 | **P01真实回归。** 正常重定位历史被判非法；旧版同行第二个IR全等断言才失败。当前完整Actor仍与规范草稿相同，不等于分析正确。与最近R01直接相关，不是107类型维护。 | **P01＋T5**：分别核机械内容与原始整理历史，不要求整份IR相同，也不能移除结构误报断言。 |
| 16 | Spirit Naga original raw provider normalizer；同`:102` | **P01同根。** 须保留singleton法术组、8 grants、升环限制和原坐标；当前假结构问题不因Actor相同而消失。 | **P01＋T5**，不能删除原历史或伪造问题满足guard。 |
| 17 | ordinary source-language／stale localization；`reviewed-localization.test.ts:907`要求failed，实际needs_review | 旧状态预期。普通英文Actor断言已通过；篡改获批译文后，在投影前验证失败，保留原语言Actor并提示`LOCALIZATION_PROJECTION_INCOMPLETE`符合已有政策。前轮同样失败，目标workflow当前无相关dirty改动。日志未完整打印changed artifact，原语言保留路径属源码确认。 | T2：检查待审、准确诊断、未套用篡改译文及原语言完整产物；不恢复整只失败。 |
| 18 | saved gear-policy Gladiator；`forge-candidate-output.test.ts:95→38`旧native快照 | 旧状态快照。Shield Bash来源明确STR15失败及中型／更小目标Prone，新增模板与Save失败链接正确；Spear、Parry、原伤害及激活保持。前后probe完整Actor相同，早于最近5类失败。 | T4：精确检查Prone和Save归属，再严格比较其他机械字段。 |
| 19 | area Balor；同文件`:237→38`旧native快照 | 旧状态快照。Flame Whip来源明确拉近后Prone，新效果挂命中后damage；两伤害、30尺、拉近25尺保持。测试本来已经允许两光环sphere→radius，该范围变化不是当前首失败。 | T4：分别核目标限制、命中后状态和原area允许变化，其余严格比较。 |
| 20 | area Behir；同`:237→38`旧native快照 | 旧快照含新授权增量。原Constrict／吞入状态及链接有来源依据；12类F06保持并列状态，最近E03另增加独立退出Prone Utility。不能把有新增Activity也说成“只有Effect数组不同”。 | T4：分Constrict、吞入、退出三阶段；Prone仅挂Exit，初始Save不挂，零额外消费。 |
| 21 | official Gladiator；同文件`:254`硬要求findings>0，实际0 | 旧“必有问题”预期。候选、IR、HP和诊断不混入Actor等前置已通过；保存产物两种+7攻击、5/20尺和远60、单份2d6+4穿刺保持。五类修复前已失败；未精确归因首次使findings为0的旧产品提交。 | T5：有效正控不要求假问题；真正“有诊断仍交付”使用已有带具体问题的fixture，继续核攻击与伤害。 |
| 22 | official Priest；同`:254` | 同21。此旧英文Priest不是前12类修复所涉中文Priest。保存产物两组7法术、WIS/DC13、独立1/day与四法术共享3/day、bonus归属保留。 | T5：不制造任意finding；保留七Cast及独立／共享消费断言。 |
| 23 | official Medusa；同文件`:245`整个creature等于原IR | 旧引文正规化预期，另有`:254`非零诊断断言。唯一IR差异是一份完整共享伤害引文展开成两份对应两伤害段；1d4+3穿刺与4d6毒素不变。机制可追到`dd7666925`，早于12／107／22／最近5类。 | T5：断言原件不变、同源完整引文按既有段数展开；两个伤害段和其余机制严格相同，同时修非零诊断预期。 |
| 24 | four actual first replies；`forge-generation-preservation.test.ts:118`首只Ankheg旧Actor全等 | **混合。** 日志首只新增来源受擒模板／链接而失败，后三只没执行；保存Roper只需最近E02合法链接增量；保存Unicorn／Naga则确认P01假结构错误，Actor仍相同。107对本测试只改类型与禁网接口，不改输入或断言。 | **P01＋T4＋T7**：每只独立覆盖，分别核Ankheg、Roper允许增量和两raw成员真实状态，不能只更新首只快照后称整组通过。 |

## 测试与入口处理方案，均未实施

| 处理码 | 对应项 | 有限处理范围与必须保留的反证 |
|---|---|---|
| P01 | 06、13、15、16、24 | 先修上述纯历史／实际问题的共用契约及所有消费者；保留原答、旧坐标和真正坏记录。不要只放宽guard、只消掉某个错误码或更新失败快照。 |
| T1 工作表示与原答分开 | 05、07、08 | 接收处可整理工作容器，原答及非法原值必须可追溯；路径按集合而非无意义顺序比较，保留幂等、真实错误、输入不变与无伪造机械值。 |
| T2 附带问题不取消Actor | 09–12、17 | 修改旧throw／decoder失败／整只failed预期；必须补足保留完整产物和具体问题的断言，真正字段漂移仍应检出。不能简单把期望false改true后结束。 |
| T3 旧分步与正式完整入口分开 | 03、04 | 既有离线staged helper验证旧splitter／阶段错误；正式provider验证完整来源及无内容答复，保留调用次数和错误码约束。 |
| T4 历史快照加精确允许增量 | 06、13、14、18–20、24 | 旧产物继续保存；逐来源核效果、阶段及链接，比较视图只允许已确认的具体增量，其他内容严格相同。不得排除整个effects／activities或直接刷新整卡hash。 |
| T5 诊断及证据各自核对 | 15、16、21–23 | 有效fixture可以没有finding；真实问题用对应code/path的负例。机械内容与整理历史分开验证，同源引文展开不能凭数量判为新增伤害。 |
| T6 Confusion的GM说明边界 | 01、02 | 现有材料确认旧附注变化，但不足以判为必须恢复的产品缺陷：完整来源及Save仍在，没有官方Confused状态。若继续承诺专门GM lifecycle元数据，应与官方status／可选效果模板分开设计，不以伪造状态修测试。 |
| T7 每成员均获得执行覆盖 | 06、24 | 拆为现有风格的独立用例，或逐成员收集后再统一断言，防止首个旧快照阻断其他成员。继续使用现有安全入口，不开发新测试框架。 |

另一个已确认的测试证据缺口：`tests/forge-candidate-output.test.ts:31–38`的`frozenNativeMechanics`递归排除所有`_id`和`flags`，并排序Activity。因此该简化比较单独变绿不能证明Effect链接、source-operation归属或退出阶段正确。T4必须在真实产物上额外核对Effect ID、Activity引用、`onSave`和阶段marker，不能降低现有机械断言。

建议顺序：先完成P01的共用机制修复与坏记录反例，再处理T1–T5旧预期／入口和T7覆盖；Confusion只按已确认的GM边界处理，不自动扩展状态自动化。完成后再运行受影响的既有安全入口与冻结正式链，确认剩余失败点；本报告没有提前把这些拟议检查记为通过，也不以追加新模型样本代替修好当前契约。

## 本轮保存与未执行范围

原HEAD、分支、索引、所有产品源码、测试及冻结材料保持；只新增本报告和私有审计证据，并在唯一当前状态追加这次诊断结论以避免沿用R01已闭环的旧判断。完整hash读回和差异清单见`A/final-validation.json`。没有修改旧验收报告、原始回复或失败日志。

本轮没有运行任何测试、正式回放、构建、Foundry操作或模型服务；上文PASS只指原日志已执行到的前置断言或已有独立证据，不是本轮新测试结果。尚未执行的修复、修后通过率、任意新来源正确性、实机战斗结算和发布均不在本轮完成声明内。
