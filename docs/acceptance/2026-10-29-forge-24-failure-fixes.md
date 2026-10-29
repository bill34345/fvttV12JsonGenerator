# Forge 24项失败修复验收

日期：2026-10-29。状态：24项逐项闭合；共用契约修复、受影响离线对照及独立代码审查完成，未提交、合并或推送。

用户原话：“行，开始修复这24项，先修R01的共用契约，再按报告处理旧测试和入口。沿用当前worktree和冻结材料，不新增拦截条件、不牺牲原有能力或支持的写法。每组修完做受影响的对照回归，最后独立代码审查。保留原答、失败产物和旧快照，不新增模型调用，不提交、合并或推送。”

沿用`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支`codex/20261019-forge-ab-fixed-replies`。依据[24项原审计](../reviews/2026-10-29-forge-24-failures-review.md)和[执行计划](../plans/2026-10-29-forge-24-failure-fixes.md)。私有证据根E为`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-24-failure-fixes`；前轮五类修复根E5为同级`forge-five-mechanism-fixes`。

## 实际修复

产品根因是正常整理历史与未解决问题的契约冲突，影响原24项中的5项；其余19项属于旧断言或旧入口失配。合法空findings保留原提案和旧坐标，仍使用原有版本、字段、类型、深度和数量约束；renderer、Actor交付和verifier只按真实finding生成待审内容。纯历史保留在分析IR，不进入规范机械来源或Actor审阅flags。手动计数与是否有finding分开，合法次数、恢复说明及消费继续保留。

本轮生产改动限于6个文件：models的sourceCandidate/sourceOperations、intake-ai的renderer、generation的actor/verification，以及独立审查后补修的parser/structuredAction。测试7个既有文件、新增history回归及精确增量helper；未刷新原冻结fixture或旧快照。

其余修订针对旧断言和旧入口。没有刷新旧快照，也没有为满足“问题数量非零”制造问题。来源明确的状态、链接和独立退出活动先核对真实ID、归属、onSave、阶段和完整文字，再只从历史比较视图排除已核实增量，其余内容继续严格比较。

| 原编号 | 修复与验证对象 | 当前组结果 |
|---|---|---|
| 01–02 | 中英文Confusion的WIS13、15尺球、传奇费用2、专注、完整正文；空statuses及一分钟说明经真实parser保留，无伪造Confused系统状态 | 通过 |
| 03 | 退役分步反例接现有离线helper，UNKNOWN_HEADING精确路径、0次callback；正式入口仍传完整source/hash/边界 | 通过 |
| 04 | 空creature保持invalid_response且不可重试；无旧stagedDiagnostic，一次fake HTTP | 通过 |
| 05 | 错位非空附带记录与非法原值保留；工作IR容器、原proposal、具体诊断分别核对 | 通过 |
| 06 | Rakshasa、Magma Mephit、Oni、Warrior Infantry拆四个用例；状态增量与原余下内容逐只比较 | 通过 |
| 07 | 15条补齐路径比较准确、无重复集合；输入不变、幂等与伪造历史反例保留 | 通过 |
| 08 | 非法null/类型的工作表示与原值分开核对；无补造攻击、伤害或数值 | 通过 |
| 09–11 | 三类易伤备注的坏附带报告保留Actor/hash及FORGE_REPORT_INCOMPLETE；真实备注和类别漂移负例保持 | 通过 |
| 12 | 非文字备注逐字段保留原值与InvalidVulnerabilityCustom；LF/CRLF、非法IR、英文均覆盖 | 通过 |
| 13–14 | Mi-Go与第二份Rakshasa只允许具体来源状态/链接增量；其余完整Actor及施法保持 | 通过 |
| 15–16 | Unicorn/Naga空历史保留原答、proposal与旧坐标；工作IR机械内容、正式Actor与规范草稿相同，无假问题 | 通过 |
| 17 | 坏译文保留完整原语言Actor/hash，needs_review及LOCALIZATION_PROJECTION_INCOMPLETE明确，坏译文未应用 | 通过 |
| 18–20 | Gladiator/Balor/Behir按具体来源验证效果与链接；Behir退出Prone独立、无额外消费，不混入吞入Save | 通过 |
| 21–22 | 官方Gladiator/Priest有效正控findings为0；Priest七Cast、WIS16/wis/DC13与独立/共享次数保持；真实FIXTURE_REVIEW反例另验 | 通过 |
| 23 | Medusa一个完整共享引文只按已有两段伤害展开；原IR不变，两段伤害保持，不新增伤害 | 通过 |
| 24 | 四首答拆四个用例；Ankheg/Roper核实最早基线后的状态及链接，Unicorn/Naga完整Actor直接相同 | 通过 |

Oni保留真实坏引文对应的`FIELD_PROJECTION_INCOMPLETE /creature/spellcasting/0/abilityEvidence`及原proposal；保真检查accepted、分析ready、最终candidate/verification needs_review分别记录，不把实际问题改成零。

## 已执行证据及最终整合

组内最终日志：`contracts/{10-empty-type-narrowing,06-current-corrected,11-localization-type-narrowing}.log`分别22/14/75通过；`legacy/{discovery-final,cli-delivery-after}.log`分别35/100通过；`snapshots/04-final-green.log`13通过。三组收据含完整旧名到新名映射；聚合成员拆开后数量变化不能解释为新增生物。

R01初次17项/600断言通过；独立审查补修后的最终`r01/review-direct-green-types.log`为58项/2523断言通过。最终整合结果如下，重叠入口不累加为独立用例数量：

| 安全入口 | 最终结果 | 日志 |
|---|---:|---|
| test:forge-generation-preservation | 80通过，0失败，1159断言 | final-test-forge-generation-preservation.log |
| test:forge-46-core | 41通过，0失败，308断言 | final-test-forge-46-core.log |
| test:forge-preservation-generation | 10通过，0失败，310断言 | final-test-forge-preservation-generation.log |
| test:forge-cli-delivery | 100通过，0失败，417断言 | final-test-forge-cli-delivery.log |
| test:forge-preservation-content | 22通过，0失败，156断言 | regression-test-forge-preservation-content.log |
| test:forge-preservation-delivery | 20通过，0失败，170断言 | regression-test-forge-preservation-delivery.log |
| test:forge-five-mechanisms | 73通过，0失败，456断言 | regression-test-forge-five-mechanisms.log |
| test:forge-official-status-effects | 24通过，0失败，606断言 | regression-test-forge-official-status-effects.log |
| test:forge-46-frozen | 12通过，0失败，325断言 | final-test-forge-46-frozen.log |
| diagnose:forge-preservation-frozen | 14个记录通过 | final-diagnose-forge-preservation-frozen.log |

根`typecheck:all`最终退出0，生产`typecheck:packages`退出0；最初两次根检查发现的测试类型收窄遗漏已修，红日志保留。依赖架构与循环检查通过；最终六源码anti-overfit及Forge构建通过。parser补修不增加模块依赖边，架构结果复用；其他受影响入口按最终代码重验。不重新运行未受补修影响的译文与旧入口组。

最终代码在`E/final-frozen/`重新重放同一冻结材料，`frozen-actor-comparison-final.json`逐字段对照E5：58份Actor比较记录中55份完整JSON相同，3份自身治疗机制控制仅`/_stats/createdTime`与`/_stats/modifiedTime`不同，没有机械或描述差异，所有预期Actor均存在。四份原答ledger-Rakshasa、Mi-Go、Unicorn、Spirit Naga另核分析ready、无blocking、无假生成finding、候选可获取，history与完整Actor分别和E5相同；旧原答和坐标未改。记录涵盖不同表示及控制样例，不是58种不同生物，也不等于所有46项组合已实机验收。旧快照时点早于官方状态投影，针对它的精确增量断言与本轮相对E5的全等比较分开记录。

## 独立代码审查及保留边界

独立只读审查发现并关闭两项P2：直接规范YAML的能力/施法组非法空review会失去提示；无review时字符串counter会在生成器调用`.entries()`抛异常，中断整只Actor。RED为18通过/40失败，确认真实崩溃；在StructuredActionParser入口复用原有形状校验，非法原值进入具体`FIELD_PROJECTION_INCOMPLETE`，不传给已确定类型的生成层，不增加整只拦截。合法空历史、独立计数和显式空计数列表继续支持。中间一次补修把metadata加进正文的失败日志也保留，随后以不追加来源注释的字段保留方式修正。

最终58项覆盖两种载体、两种交付、十种坏形状及LF/CRLF等价；external完整Actor与干净对照全等，document只允许精确review flags及固定待审提示差异，能力原文、活动、效果和资源保持。独立审查已读回最终源码、严格断言和RED/GREEN日志，确认两项关闭，其余受审改动未见新的实质缺陷。独立代理没有重跑测试，此结论是独立代码与执行证据复核。

没有新提取、发现、复核、纠错、翻译或其他模型服务请求。fake HTTP只回放冻结/内存回复，不能算真实模型质量验收。没有本轮浏览器、Foundry安装/世界写入或Use/Cast/Apply/投骰；完整Actor没有本轮机械变化，导入/保存runtime代码也未改，既有配置证据按原范围复用，不提升为本轮实机通过。没有执行全仓CI，不作任意来源无bug保证。

最终保留核对见`E/preservation-final.json`：4586份既有保护证据SHA-256均不变，2723份仓库文件基线仅声明范围发生变化，无原文件缺失，原答、失败及旧快照未改；未改的既有dirty成果保持。HEAD仍`5dc5702767bbcb0818a05a02e45c925289e66758`、分支不变、索引为空，未提交、合并或推送。辅助核对脚本初次按Windows默认GBK解码Git文件名失败，仅修正该取证层为UTF-8后重验，不重跑业务测试或改原件。七个手册watch条目逐项人工核对；Item/Species的独立接受、版本和发布边界未放宽，正常历史说明及安全测试入口同步到生成手册。
