# Forge 同类导入工具调研与 GM 手动生成边界

日期：2026-10-13。本轮完成外部说明、固定提交源码和一手使用／失败报告的核对；没有运行外部代码、安装模块或发起模型调用。产品改造尚未实施，旧六例0/6不改写。

## 调研后结论

确实存在直接同类工具，包括模型分步提取能力的 Foundry 模块、能力块文本导入器和图片／文本转 Foundry JSON 的网页工具。不能再把本任务描述成“可能没有人做过”。查到的实现能够证明分开基础数值与能力、保留能力描述、仅为已识别规则建立执行数据这类设计已经有人采用；不能证明它们满足本项目完整中文、来源保真、非默认图标和精确目标版本的全部标准。

用户本轮明确要求：“如果某些特性不好做，就直接做成 GM 手动，至少不能让它无法生成”。该要求作为后续产品边界：基础数据可信且完整能力可以保留时，自动化支持不足不应阻断整只怪物的生成。手动项必须有完整内容、中文、条件和结果、必要资源／期限及清晰操作边界，不能丢弃能力、只留标题或空白 Utility。缺失、冲突与错误执行数据继续暴露和校验。

## 范围、版本与可量化使用信号

优先调查直接同类，不以热门模块列表代替机制研究。公开使用信号以本次读取为准，不代表可靠性或全市场份额。

| 候选 | 固定提交与版本 | 已核来源与使用信号 | 本机状态 |
|---|---|---|---|
| Aioros / 5e Statblock Importer | `98f5bd9bf3a18b3cb50429f1bef6b735de32271e`，2.4.0，2026-10-04提交 | MIT；GitHub6星／6fork；Forge Bazaar公开installs字段6.9447，README徽章按百分数显示。按本文1–10%平台公开指标视为中等使用信号；分母及全市场份额未确认。 | 未安装、未运行。manifest声明Core最低12.331、verified14.368；dnd5e最低4.3.0、最高6.999、verified6.0.5。声明范围包括5.3.3，不等于本机5.3.3验收。 |
| wickercar / AI Monster Importer | `7381ed0c34a63020cb870be93d041435e7ab12d1`，1.0.9，2024-02-14提交 | MIT；GitHub0星／1fork，小规模历史项目；有公开演示与实际报错。 | 未运行。Core11–12、verified11.313；dnd5e verified2.1.5，不能直接当v14／5.3.3替代品。 |
| Tonyb29 / DM VTT Toolkit | `048dda2543ef4c1c863acb7c37fb0c0bb2281d85`，2026-10-11提交 | GitHub0星／0fork，小规模活跃项目；官网标CC BY-NC4.0，仓库API未识别license，代码复用授权待核。 | 未运行。作者面向dnd5e4+/5.x；文档自称测试5.2.5，没有本机5.3.3接受证据。 |

来源：[5e官方模块页](https://foundryvtt.com/packages/5e-statblock-importer)、[其固定manifest](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/module.json)、[AI官方模块页](https://foundryvtt.com/packages/llm-text-content-importer)、[其固定manifest](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module.json)、[DM作者说明](https://dmtoolkit.org/about)、[DM固定README](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/048dda2543ef4c1c863acb7c37fb0c0bb2281d85/README.md)。

## 直接读到的实现事实

### 1. 5e Statblock Importer：完整能力描述先入 Item，再补可识别执行数据

固定源码 `scripts/sbiActor.js:165` 的 `setActions` 先建立feat并保存描述，再调用 `setAttackOrSave`。没有生成activity时创建utility，仍加入Actor；`setFeatures:499` 同样保存特性描述。`scripts/sbiWindow.js:329` 在成功解析Actor后执行创建并显示importIssues。该实现证明“有可读能力而没有完整自动执行”可以作为导入结果；它不证明所有未识别来源都被保留。

采用：完整能力先落到有身份的Item，自动化作为可验证的附加投影。不采用：把其所有regex、专门规则和默认值原样搬入Forge；不把一个utility存在视为手动内容完整。

来源：[固定sbiActor.js](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiActor.js)、[固定sbiWindow.js](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiWindow.js)。

### 2. AI Monster Importer：已经有基础数据、能力清单与逐能力调用

`genFoundry5eMonsterFromTextBlock.ts:56` 的默认小schema方案分别调用基础信息与能力名称／正文提取，再经 `Parsed5eItemParser.fromBasicItemList` 为每项能力调用模型。也有按字段组进一步拆分的代码。默认流程不要求模型直接生成整套Foundry文档，最后由formatter组装。

反例也在源码：`Parsed5eItemParser.ts:29` 解析单项失败时返回undefined，`:47` 将它过滤；分字段实现还会在异常后返回空对象。这不能作为完整手动承接。策略switch也没有逐case终止，不能把所列策略视为已正确隔离并验收。

采用：基础数据与完整能力的不同提取职责、小schema和本地投影。不采用：吞错、删能力、空对象成功及无界Promise.all；不复制旧版本的Foundry字段。

来源：[固定总流程](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/genFoundry5eMonsterFromTextBlock.ts)、[固定逐能力处理](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/text-parsing/Parsed5eItemParser.ts)。

### 3. DM VTT Toolkit：AI识别文本与确定性Foundry组装分离

`src/App.tsx:3` 引用实际使用的v20 stable parser。`claude-api.ts:50` 将图片识别成能力块文本；parser的 `buildActionItems:1035` 根据已识别攻击／豁免生成activity，其余动作创建utility，`:1077` 保存描述。这提供了文本能力保留与执行投影分离的另一个具体实现。

不能照搬的反例：save分支`:1070` 统一写 `onSave:'half'`；README还说明部分法术缺正文／未知法术用默认等级。这些不满足我们的规则保真要求。该工具能输出JSON不代表内容已正确，不采用按名字从模型知识生成来源怪物或重掷凑结果的流程。

来源：[固定parser](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/048dda2543ef4c1c863acb7c37fb0c0bb2281d85/parser-versions/dnd-parser-v20-stable.tsx)、[固定AI调用](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/048dda2543ef4c1c863acb7c37fb0c0bb2281d85/parser-versions/claude-api.ts)。

## 一手使用与失败记录

- [PDF导入用户讨论](https://www.reddit.com/r/FoundryVTT/comments/rt9sp2/importing_content_from_pdf/)：用户报告从Tome of Beasts／Monster Manual Expanded PDF复制标准能力块后导入，并报告个别攻击／豁免需要手动补配置。这是历史使用经验，不能推广到当前版本、Better Monsters或中文正确性。
- [AI Importer issue5](https://github.com/wickercar/foundry-ai-text-importer/issues/5)：2024-03-24用户提供完整原文，报告生成了错误豁免熟练与加值；同日跟进称多来源均重现。当前API仍为Open，未找到该线程的修复确认。说明分步调用本身不能代替字段核对。
- [5e Importer issue65](https://github.com/Aioros/5e-statblock-importer/issues/65)：2026-09-27用户要求更清晰的逐项预览、未解析文字提示和原始能力块保存。当前Open；最新README与源码已提供部分预览／问题展示，不能把问题中全部描述直接当最新版缺陷，也不能声称整个建议已修完。

这些报告说明实际工作流会保留手动处理；它们没有给出我们六样本或同等严格中文审核的通过率。

## 对Forge现状的具体修正

现有实现已有gm-manual，但入口与完成状态仍耦合：

- `packages/intake-ai/src/encounter-proposal.ts:79` 对unresolved整体阻断；模型也被要求将未支持或含糊规则放进该集合。
- `packages/forge-browser-runtime/src/encounterIntake.ts:433` 的manualPreparationRules和`:483` 的特殊承接检查只覆盖限定类型；它不是任意完整能力的通用手动保留出口。
- `packages/intake-ai/src/encounter-automation.ts:158` 仍依赖模型提供至少两条gmSteps。海鬼婆实际返回单条和五段完整来源证明的消费冲突，已经表明“存在手动类型”不等于能稳定到达手动输出。
- 原文内容去向、条件归一化与误拦仍须修；不能把本轮全部0/6归为不会自动化。

后续应分别判断两件事：角色内容是否完整可信，以及哪些操作可自动执行。完成的GM手动能力属于生成成功的一种预期结果，应在预览清楚标注；不得以手动占比大为由阻断整个Actor，也不声称全部自动化。

建议先建立完整来源单元与保留去向，确保外貌、尺寸、特性、动作均能进入最终结果。基础字段独立核对；每项完整能力再尝试事实提取。仅把核实且受支持的部分投影为可执行数据。提取不足而完整来源仍存在时，为该能力生成明确的GM手动Item；条件、追加／替代伤害不清楚时不生成有误的自动伤害或效果。共享目标、资源和期限仍参与合并检查。

手动说明应由已保留完整规则和固定操作模板组织，尽量去掉模型重复抄全文、填写字符位置、凑固定步骤数量等任务。中文与Actor仍从同一份核实事实生成，中文草稿与原文逐单元对应；英文回退不能算中文完成。

## 最小反证与验收出口

| 检查 | 能推翻方案的反例 |
|---|---|
| GM手动可生成 | 基础字段正常、完整来源存在的一项未支持能力，仍导致整只Actor无法产生候选。 |
| 完整保留 | Item只有标题／笼统提示，遗漏任一目标、前提、结果、期限或正文；或某项提取失败被过滤掉。 |
| 安全投影 | 将条件伤害变无条件，自动施加原本需裁定的状态，或错误半伤默认值进入原生activity。 |
| 判定分层 | 把来源缺失／数据冲突标成“手动”就放行，或把已完整手动保留仅因不自动执行判整只失败。 |
| 中文与图标 | 中文缺文或误译，或任一Item／Activity落到透明、占位或catalog类型默认图。 |
| 真实使用 | 候选不能在Mirror14.368／dnd5e5.3.3正常导入、刷新、回读；完整手动规则在卡片上看不到。 |

先用保存的失败输入在正式链中核对上述边界。通过后再冻结、固定未参与开发的新PDF并首次生成，必要的原生验收照常。单次提交内的分步调用与修复调用分开统计，不增加外层重试或改写旧失败。

## 待判断引入／本地化与复查步骤

- 5e Statblock Importer：可作为来源解析与手动能力保留的对照候选；本机状态Untested。先核版本与目标接口，再以同一完整来源核对能力保留与攻击／豁免字段，不能仅凭verified14.368宣称可用。
- AI Monster Importer：仅借鉴分步职责；版本旧且存在吞错路径，本轮不作为安装或本地化候选。
- DM VTT Toolkit：可作为确定性文本导出的对照；许可、目标字段和错误默认值需要先核。不引入依赖或复制代码。
- 新候选复查固定源码／manifest／许可和实际版本；用普通攻击、条件伤害、目标自选豁免、跨段能力和纯叙事进行来源到结果核对；完整性或语义失败即保留反例，不能靠换怪或重复生成宣称成功。

未发现有公开证据同时满足“任意英文PDF、完整可信中文、所有能力均保留、当前精确版本、非默认语义图标”的即用替代品；这限于本次检索范围，不是无人实现或技术不可能的结论。

## 证据保存与局限

22份原始源码／说明／manifest文件固定到上述提交，另有3份各仓库源文件hash清单与2份公开API记录；合计27份已保存文件逐项SHA-256核对。保存根：[研究证据](../../.local/forge-comparable-importers-20261013/complete-file-manifest.json)，总清单SHA `50ec1e77684188ab732334d0153cefd0c3f297626013256c3d9c4391c7c8ab16`。

AnySearch首轮检索成功，后续code子域／检索及正文提取返回空内容，已明确改用网页原始来源。GitHub匿名API在补存问题记录时限流，3份补存未取得；没有换认证、重试或把缺件记为成功。issue5跟进通过API／网页已读，issue65主体通过网页已读；issue65评论数未知，前次脚本输出的0不采信。原始源码完整保留及其hash核对不受补存失败影响。

本轮只读外部检索与本地证据／报告保存；没有运行第三方代码、发起模型请求、付费审核、安装、导入或Git发布操作。手动生成边界已按本次用户要求明确，但产品实现、支持矩阵与手册更新、回归及新来源验收尚未进行。

