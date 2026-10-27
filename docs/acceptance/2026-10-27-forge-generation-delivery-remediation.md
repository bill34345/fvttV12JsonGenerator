# Forge 46项统一整改执行与验收

状态：本轮46项整改及计划要求的离线、Mirror和Web产品行为验收已完成；未提交、合并、推送或发布生产。Chrome工具未返回本地下载路径、完整战斗/Spell Cast未验等边界保留，不把助手额外指定的取证方法变成用户未要求的完成门槛。

## 授权与基线

用户原话：“行，按这46项统一整改，沿用当前 worktree，不要只修 Mimic 和 Otyugh。只有 AI 没正常返回才能阻止整只 Actor 生成，其他问题不得挡住产物获取或删掉已有能力。”随后用户明确要求实施完整计划。执行范围包括共同生成链、所有生物交付入口、正式Actor草稿、逐成员与宏独立结算、冻结回复及既有Mirror实际验收。新模型请求为0，AI复核关闭；不提交、合并、推送或操作生产。

工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支`codex/20261019-forge-ab-fixed-replies`，HEAD `a6591c086f157de782bc63384a90cecd08101c01`加已有未提交成果。原始回复、既有Actor、正式草稿、旧安装ZIP和历史证据保持。仅记录哈希，不制作备份。

私有证据：`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-46-remediation/`。`baseline.json`记录2680个工作树文件、250个保护文件以及初始Git状态。测试使用CI锁定Bun 1.3.14；系统默认1.3.8不能用于本次检查。

## 结果口径与检查选择

2026-10-27实施中格式边界确认：针对“AI返回完整可读的Markdown数值卡，但没有按请求返回JSON”，用户选择原话“复用已有文本转换继续生成（推荐）”。本轮据此增加同一AI入口的明确文本回答分支，复用现有标准Markdown／plaintext转换；不制造简化IR，不要求用户切模式重做，不增加模型请求。原AI全文、原输入快照、规范源、候选与调用计数贯通保存／恢复、CLI和多生物。共享规范化仍属于现有ingest-plaintext；CLI/Web按仓库既有依赖端口注入该适配器，Intake不直接依赖具体source adapter，没有引入新外部库或生成器，也不增加架构豁免。

仅AI无正常答复可以使本次整只Actor无产物；可读生物回答缺外壳、技术记录或局部字段不是AI无返回。用户取消单独记录。已有可执行基本操作不因局部状态、资源、引文或配套失败被删除；真实权限和文档冲突只限制相应写入。

本轮变更跨接收/解析/生成/协议/界面/持久化/批量边界。检查选择：既有冻结回复贯通共同链；字段级失败保留；普通及替代多段伤害；内层报告异常仍交付；新旧入口与v1/v2直接恢复；单成员失败继续；宏失败保留成功Actor及法术完成标记；独立Item/Species共享消费者回归。使用现有安全包装入口，新增`test:forge-actor-delivery`仅聚焦真实交付行为，不引入新测试框架。相关检查通过后复用，除非新改动或具体失败使证据失效。

独立核对冻结样本：Medusa、Ankheg、Unicorn、Spirit Naga、Rakshasa、Shield Guardian、Otyugh、Mimic；Hydra、Black Pudding及已有施法/资源/正式草稿作保持对照。类型、架构、局部anti-overfit、构建及手册核对后，使用冻结回执执行既有Mirror14.368/dnd5e5.3.3的实际UI、创建、恢复、宏失败保留验收。未采集的层级不得标通过。

## 46项对应

下表列出全部46项的本轮代码现状及实际遇到问题时的处理，不以取消诊断或伪造accepted算整改。第1项可以让本次成员没有新Actor；第2–32、35–44项没有整只Actor的否决权；第33–34、45–46项只处理对应世界写入或配套操作。已有产物的获取与这些结果分开。

源码路径均相对本工作树。证据简称在下一节给出；“离线”包含真实实现、正式workflow及导入适配的回归，不冒充浏览器或世界保存验收。

| 编号 | 检查/原门槛 | 本轮现状及遇到问题后的处理 | 实现位置 | 对应证据 |
|---|---|---|---|---|
| 1 | AI请求无正常答复 | 只有无响应、请求明确失败、空答等使当前成员没有新Actor；旧Actor保留，其他成员继续。取消单独记录 | `provider.extractAnswer/callOnce`、`intakeApplication.keepActorArtifact` | C41/D163/CLI100；Mirror `mimic-empty-comparison.json`前后候选和来源完全相同 |
| 2 | 回复外壳/取证数组 | 可读IR继续接收；完整Markdown回答复用现有文本转换，不要求改模式或再次请求；原答保留 | `provider.normalizeProjectionContainers`、`isMonsterSourceAnswer`、`ai.ts` | C41扁平根/额外kind/sourceText、CLI100文本回答、T2文本批量 |
| 3 | 行号/引文/offset绑定 | 绑定失败只提示`SOURCE_LINES_UNRESOLVED`，不取消原有机械字段 | provider证据整理及source-line-references调用 | C41、S118、F12美杜莎 |
| 4 | 生物根结构/未知字段 | 入口一次整理；未知字段与错误值保留为原记录/说明及finding，不抛整只拒绝 | `provider.ts`、`parser/yaml.traverse` | C41未知YAML/错误技能总值/根格式 |
| 5 | 操作ID/名称/技术形状 | 缺失或重复技术ID由程序生成并保留原值；名字及技术记录不决定Actor存在 | `sourceInput.normalizeCreatureFeatureInput`、`sourceIdentity` | C41重复ID和坏来源ID |
| 6 | 操作/伤害/引文数量上限 | 正式内容转换不再以旧128操作、12伤害段等上限拒绝或截断 | `sourceOperationStructure`、parser、discovery | C41超过12段，CLI100长候选；未做128+操作压力测试 |
| 7 | 公式/类型/距离/治疗/豁免 | 坏段只影响该段投影；其他段/操作保留。未知分类不猜成武器；明确治疗人数不改，未知多属性关系不猜二选一 | `sourceInput.projectDamage/projectHealing/projectSourceOperations` | C41坏伤害段、未知类型、多目标治疗、多属性Save |
| 8 | 引文与伤害逐段配对 | 引文不是伤害生成前提；完整`damage.parts`逐项投影，引用问题独立显示 | `source-operation-contract`、`sourceInput`、parser | F12掘地虫/美杜莎，P64/shared-damage |
| 9 | 动作互斥/条件伤害组合 | 以操作为单位保留；未知或条件伤害提供独立GM结算，不无条件混入主伤害，也不删除其他操作 | `sourceInput`、`ActorGenerator.appendSingleStructuredAction` | C41未知伤害关系/组合 |
| 10 | 攻击携带状态 | 状态表达问题不取消攻击、伤害、后续豁免；中毒/擒抱/期限/目标限制留完整说明 | `sourceInput`攻击状态处理 | C41/F12；Mirror `otyugh-created.json`及独立原生读回确认完整操作/正文 |
| 11 | 法术/次数/资源关联 | 按资源池、成员、链接、法术引用处理；错误引用不吞掉正常引用，无法绑定的内容可定位 | provider、`parseActorResourceSemantics`、`buildActorSpellManifest` | C41坏池/别名/引用/共享复用、F12施法样本 |
| 12 | renderer施法池/体型异常 | 展示档案不能统一时保留明确数据和完整说明，不整只抛错 | `renderPreparedSpellcastingProfile`及体型展示 | F12施法/治疗、C41字段；未穷举每种体型与施法冲突组合 |
| 13 | parser重复检查及throw | 移除对已整理输入的整只重复接受检查；局部问题不使整个feature仅剩正文 | `structuredAction.parseActionEntry`、`yaml.traverse` | C41、F12、S118 |
| 14 | generator模式/资源/唯一项throw | 模式和关联逐项处理；已可投影基本操作继续，问题另记 | `ActorGenerator`、资源/法术投影 | C41、F12 |
| 15 | neutral/review标记跳过伤害分支 | `candidateReview`仅保留审阅信息；未分类攻击只为damage生成互斥分支，不复制攻击或资源消费 | `sourceAttackDamageModes`、`applySourceAttackDamageModes`、导入适配 | F12/D163；Mirror `mimic-created.json`及刷新读回，两完整分支与单攻击保持 |
| 16 | 总catch吞掉已生成artifact | 内层构造完成即保留Actor；展示回调、normalizer、验证、图标、摘要异常只追加问题 | `ActorGenerator.emitRulePresentation`、`generationPipeline`、`convertFinalActorSource` | C41内层图标/展示失败，P64后置异常 |
| 17 | 重复生成验证 | Forge复用共同pipeline验证结果；保真诊断不决定产物存在 | `generationPipeline`、browser-runtime入口 | C41、P64、F12 |
| 18 | 旧validator/摘要/法术问题 | 正常问题与Actor并存；检查本身异常仍返回已有Actor和文件路径 | `convertFinalActorSource`、`singleFileConversion` | C41、CLI100后置validator异常、Web下载测试 |
| 19 | IR/Markdown/Actor保真 | 保留差异报告，不撤回或重生已有候选，不伪造检查通过 | `verifyRenderedActor/verifyMonsterIntake`及交付消费者 | P64 projection findings/report异常，F12 |
| 20 | 内部响应元数据解码 | 先读取artifact；报告坏时保留可读诊断/coverage/warnings并追加不完整提示 | `schema.decodeForgeActorResult/Response` | C41内部报告两例；Item反例保持 |
| 21 | 状态/诊断严格组合 | accepted/needs_review/failed均可携带Actor及程序hash；消费端按实际artifact提供获取 | gateway types/schema、UI/API | C41非accepted hash、D163普通采用、Web22 |
| 22 | AI内容复核 | Forge复核继续关闭；CLI生物不自动调用review，零复核不是额外通过条件 | AI review policy、`orchestrator.processIr` | C41/F12/CLI100调用账本 |
| 23 | 自动纠错/repair失败 | 不自动追加纠错或重试；显式纠错失败保留原答和Actor，文本答复不伪造成IR纠错 | `repairBrowserActorIntake`、CLI编排 | C41文本repair零调用、D163纠错失败、CLI100 |
| 24 | SourceAudit/staged/category旧严格路径 | 正式提取不再选择旧staged拒绝链；显式SourceAudit只出历史诊断 | provider正式入口、旧离线helpers | core receipt `legacy24`、S118、CLI100 |
| 25 | 删操作/整只文字兜底 | 两种删操作兜底保持移除；不以完整说明卡替代已知攻击/伤害/豁免 | candidate-delivery及共同转换 | P64 former fallback，F12全能力/操作 |
| 26 | 新AI工作台生成/下载 | 有artifact即可查看、下载和正常采用，不要求零findings；Markdown答复同入口 | `intakeApplication.generate/isApplyable` | D163/T2；Mirror生成、采用、恢复通过；Web正常HTTP下载及内容一致性已通过；Chrome工具本地路径未取得 |
| 27 | plaintext仅accepted保存response | 非accepted Actor仍保存response和候选文件，下载/创建可用 | `generatePlaintext`、共同单文件转换 | D163 plaintext finding，CLI100，Web22 |
| 28 | 旧UI零告警/accepted创建 | 旧结构化/蓝图入口移除内容状态门槛；8组件上限及派生索引/数量限制一并移除；权限和冲突仅限制对应写入 | `application`、`creatureBlueprint`、`createAcceptedForgeActor` | D163、Blueprint56、LegacyUI25；Mirror真实按钮新增九项并生成全量候选 |
| 29 | 环境/连接/展示/长度门槛 | Actor打开、读取与已有回答本地转换不依赖Key/在线世界；去掉标准文件200KB、蓝图256KiB、名称100/输入框120及lineage字符串512等人工门槛；Item保持 | module index/workspace、`localActorInput/assertLibraryReadable`、Actor文件/蓝图入口 | R21/D163/Blueprint56/LegacyUI25；Mirror248286bytes文件与604字名称生成通过；Web真实页面与非accepted文件交付已通过，Chrome本地路径回执未取得 |
| 30 | 来源/目标/候选/批准身份耦合 | 旧候选始终绑定自身来源快照和目标；编辑当前来源或重新分析失败不会抹掉旧产物 | `actorArtifactContext/localActorForm/keepActorArtifact` | D163 source-edit/reanalysis、P64 |
| 31 | 单Item形状否决候选 | Actor获取不再以单Item摘要形状决定资格；技术骨架由构造器产生 | `isUsableActorCandidateArtifact`、构造器 | C41协议/字段、F12；不宣称任意损坏JSON均能被Foundry保存 |
| 32 | Midi/活动/距离/旧法术适配 | 适配失败只记录对应项，原生活动和Actor继续；双damageMode仍完整 | `prepareFoundryImportArtifact`、activity groups | D163 adapter issues、F12真实适配；未知第三方版本不宣称兼容 |
| 33 | 世界权限/ID/归属冲突 | 仅拒绝发生冲突的世界写入，保留可获取JSON；已有文档不自动覆盖 | `createForgeActorDocument`及归属核对 | D163冲突/复用/并发、R21读写分离 |
| 34 | 保存内容/身份读回 | 内容差异提示并保留角色；身份错误只处理本次错误写入，不能牵连其他成功Actor | `actorReadbackWarnings/assertReadback` | D163改名/漂移/复用/清理异常；候选始终保留 |
| 35 | 本地恢复保存失败 | 保存失败只影响持久化；页面Actor、下载和创建继续；旧大记录仍可读取 | `captureIntakeCandidate/saveCandidate`、store | D163读大记录/保存处理；尚未实测真实IndexedDB满额 |
| 36 | 草稿年龄/契约/重生成一致前提 | v1/v2直接读保存artifact；七天/契约/模型/findings不封锁；checksum差异只提示，不覆原记录、不继承GM批准 | `revalidateIntakeCandidate/savedActorResult` | F12/D163/R21；Mirror `restore-v1/v2.json`原artifact完全相同；内存adapter不当作IndexedDB持久化 |
| 37 | 队列按内容/状态过滤 | 按产物逐项获取/采用；文本needs_review且无IR也继续生成，逐项结算 | `batchQueue`、`refreshBatch/restoreReadyJob/runBatch` | Q134、T2、D163部分采用；未做大规模压力测试 |
| 38 | 发现分区/数量 | 坏行号/重叠/错分区提示并显示未分配原文；可定位成员继续；不自动只取第一只，技术ID碰撞不合并成员 | `resolveDiscoveryCandidates/locateDiscoveryCandidates` | Discovery35、CLI100长来源/同ID/重叠 |
| 39 | 单成员失败提前return | 单成员失败后继续后续成员；resume缺IR成员保留旧记录，后续照常且不隐式调用模型 | `generateEncounterFromHumanMarkdown`、`resumeMonsterIntake` | E110中间失败/混合IR文本/零请求恢复、CLI100 |
| 40 | 全员available才能交付包 | 收集实际已有artifact组成部分包；缺失成员明确列出，其余可逐只或打包导出 | `prepareRetainedActors` | E110部分可下载包 |
| 41 | 状态目录/配套能力选择 | 坏状态目录、宏、素材及配套元数据只影响相应配套项，Actor保留 | encounter intake/package/preparation | E110 malformed companion metadata、A59 |
| 42 | 手工规则/控制覆盖 | 缺覆盖交付无宏Actor包；错误控制仅撤下该控制，完整规则和原生能力保留 | 手工准备检查、`prepareForgeEncounter` | E110 missing/invalid companion coverage |
| 43 | 打包重复生成及宏绑定 | 未变artifact直接复用，旧source-only成员才转换；坏成员不取消其他成员；报告/JSON恢复保留展示计划 | `retainEncounterArtifacts/prepareForgeEncounter`、`restoreRulePresentationPlan` | E110 saved artifacts/legacy failure、report-cache-fix-2 |
| 44 | 翻译失败 | 翻译或metadata失败保留原语言Actor；有效显式译文应用到缓存产物，原hash先于翻译核对 | `finishDeferred`、package解码、preparation中文投影 | E110 translation/cache/JSON continuation |
| 45 | 宏/成员失败全事务回滚 | Actor、宏、素材分别结算；成功Actor逐只完成法术标记；宏失败不回滚，重试复用Actor并只补失败项 | `importForgeEncounter`、`encounterApplication.apply` | E110及Mirror `macro-first-failure/macro-retry/post-refresh-native.json`：两Actor保留、verified保持、重试只补宏 |
| 46 | 宏启动检查 | 错代码、绑定、归属或自动化前提只停对应宏，不删Actor、不挡已有包或下载 | `validateForgeEncounterMacro`及既有启动流程 | E110 modified command/missing binding，A59；未推广为所有宏实际运行通过 |

## 实施、验证和实机结果

Web获准重启后的实际页面补验发现两处残留文案：核对页标题仍说“问题阻止正式交付”，任务日志仍说“Actor JSON尚未注册为正式下载”，但实际文件已登记并可经HTTP获取。此次只修这两处报告表达，保留检查严重程度和Item契约；对应实际API日志/下载断言、受影响Web类型/构建及一轮新任务页面读回验证。已有生成内容和Mirror证据不因此重跑。

实机入口追加检查理由：原样Otyugh规范资料没有`layout: creature`，Web自动识别错误地转入AI并禁用转换；修复所属输入路由，使用原样文件验证，不给测试资料补字段绕过。Web客户端下载面板的最终说明已调整为产物存在独立于检查结论，补存最终SSR证据`web-artifact-delivery-final.log`：5pass、22断言。Mirror辅助宏的controller渲染归属错误只修helper，不重复已完成的业务步骤。

文档对照时发现第28–29项仍有Actor标准文件200KB拒读，以及蓝图8组件/256KiB拒读；蓝图上限不仅禁用按钮，也由decoder使9项资料无法加载或生成。为此追加同范围残留修复与真实文件/蓝图正式生成检查，不重复此前已完成AI或世界创建证据。

上述残留现已完成修复与离线验证。覆盖600组件且超过256KiB的蓝图、任意非负派生索引、超过32项的组件/变化记录、超过512字的完整名称；真实模板文件读取及蓝图新增/保存/重载均通过。共同旧入口组同时发现基线已有的v14 melee/ranged显示映射缺口，只修statblock标签，不修改攻击/豁免机械值或猜算运行时总值。最终Mirror仅补这些入口及图解新文案。

已完成的离线证据如下；这些组有交叠，不相加为总用例数。日志均在上述私有证据根。

| 简称 | 检查与结果 | 实际日志 |
|---|---|---|
| C41 | core/文本回答真实入口，41pass，309断言 | `core-source-answer-guard-final.log` |
| S118 | 正式结构及局部问题回归，118pass | `core-freeze-structure.log` |
| P64 | 产物保留，64pass；12个其他可选fixture skip不计通过 | `core-freeze-preservation.log` |
| F12 | 十份真实冻结首答＋正式v1/v2，12pass，325断言；强制加载全部本次材料 | `frozen-verified.log`、`frozen-verified/` |
| CLI100 | CLI提取、文本、候选路径、冲突和恢复，100pass，409断言 | `cli-source-answer-guard-review.log` |
| Discovery35 | 独立发现与分区，35pass，90断言 | `discovery-review-overlap-resume.log` |
| D163 | 生成/恢复/UI/世界写入边界，163pass，1338断言 | `actor-text-delivery-regression.log` |
| R21 | Actor读取不依赖当前写入runtime；21pass，113断言 | `actor-read-access-regression.log` |
| Q134 | 批量逐项结果，134pass，1201断言 | `actor-batch-delivery-second.log` |
| T2 | 实际模板/按钮文本批量，2pass，37断言 | `actor-text-batch-ui-first.log` |
| E110 | Encounter/宏/缓存/部分包/文本恢复，110pass，736断言 | `encounter-text-answer-final.log` |
| A59 | 固定配套控制回归，59pass，365断言 | `encounter-automation-final.log` |
| Web22 | React实际下载面板，5pass，22断言 | `web-artifact-delivery-final.log` |
| Web45 | 实际检测API及文件交付，11pass，45断言，35项未选中不计通过 | `web-canonical-actor-routing.log` |
| Web61 | 最终API文件与任务日志一致性，12pass，61断言，35项未选中不计通过 | `web-actor-delivery-logs.log` |
| HumanCLI | 人类资料CLI文本/部分包/文件路径，5pass，34断言 | `human-cli-source-text-delivery.log` |
| Blueprint56 | 蓝图/派生/真实statblock，56pass，332断言 | `legacy-blueprint-source-final.log` |
| LegacyUI25 | 真实文件与旧工作台，25pass，175断言 | `legacy-entry-ui-final.log`、`delivery-legacy-entry-final.json` |

另有完整CLI24pass/126断言、旧runtime114pass、工作台/目录22pass/135断言等受影响回归，按对应日志复用。`independent-semantic-review.json`独立对照十例能力全文、距离/目标/条件、伤害、次数及法术manifest，无已确认内容丢失；不包含新模型准确率或实际施法。首轮冻结检查四例失败由新helper的无效UUID引起，已只修helper并保留失败日志，原回答和业务断言不改。

独立审查发现并已修复：重复技术ID覆盖；内层展示回调吞Actor；未知伤害/豁免/治疗关系被擅自改义；未知状态丢失；报告解码丢旧诊断；CLI重叠同ID吞成员及缺IR恢复整批退出；坏翻译metadata整包拒绝；缓存中文投影/展示计划恢复及翻译后的假hash差异；文本variant字段碰撞；文本needs_review批量仍要求IR。修复均在上述真实实现回归中覆盖，不新增生成框架。

实际安装候选为`candidate-module-verified/`，脚本SHA-256为`e92f2208a27c16bd2bdbc949e34f7dde3524077d6ba0a53e7abbd356fa1ec718`。通过既有`buildBrowserBundle`构建16文件，保留旧0.5.1 ZIP；只将脚本与encounter模板两项变化复制到既有Mirror，逐文件hash一致，见`mirror-install.json`。未重启Mirror，不广播刷新，不改Next。

Mirror身份已实际核对：PID27128、端口30001、data=`server-mirror`、world=`cor-cotn`、Core14.368、dnd5e5.3.3；官方Chrome扩展任务页651352061，执行器实际Sol/medium已留收据。Otyugh已生成、创建并由原生MCP独立读回；Bite/Tentacle、延迟CON15、Slam CON14和完整状态/目标正文保持。Mimic候选及创建数据含单份攻击、两分支完整酸伤；报告异常后候选和下载/创建按钮保留。Mimic首个实际伤害点击的ServerDatabaseBackend `_id`异常及其目标前置证据在下文单列，不计投骰通过。

恢复UI采用任务内存store，明确不等于真实IndexedDB持久化；本轮不覆盖用户候选库。宏失败包使用真实冻结Unicorn/Mimic及现有固定宏编译器，未手改Actor。v1/v2恢复artifact与原记录完全相同，不重新生成，不继承GM批准；受控Markdown生成及同页重开恢复的原始/规范来源与Actor hash保持。空答重新分析后candidate hash、原来源、规范来源及Actor投影全部不变。

宏首次失败后Unicorn与Mimic保留，Unicorn的`spellImportPhase=verified`；正常重试复用原两Actor ID，仅新建唯一宏。整页刷新后四只本批Actor与宏完整保持，Unicorn有9个Spell Item/9个Cast、phase仍verified。具体为`chrome/macro-first-failure.json`、`macro-retry.json`、`post-refresh-native.json`和独立`independent-mirror-semantic-review.json`。仅保存/水合验收，不冒充实际施法。

已恢复辅助服务、fetch、Macro.create与原候选store绑定。主代理在最终读回/独立审阅后，用原生MCP精确删除4只本批Actor，随后普通Macro UI只清理本包宏与验收宏；六个原世界集合及原候选store hash保持。`final-world-and-store-match.json`、`cleanup-macro-ui-check.json`、`root-owned-actor-cleanup.json`及`root-cleanup-readback.json`记录精确清理。原世界318Actor/94Macro保持，未按名称删除。

辅助脚本先后出现controller渲染归属、fetch receiver及刷新后undefined类比较三个错误，均只修该辅助层并保留原日志，不因此重跑已完成业务。首份被截断取证明确无效，后续使用DOM分块取得完整JSON；旧gap与最终matched均保存，没有覆盖历史失败。

Chrome工具的下载事件未返回本地文件路径，`chrome://downloads/`又被明确拒绝，未访问该内部页或改换浏览器通道绕过，原始超时见`chrome/download-limits.json`及`chrome/web-final/http-download-timeouts.json`。后续通过正常产品HTTP下载端点实际取得文件并完成逐字节核对，见下一段；它不冒充Chrome本地路径回执。独立复核原计划后明确撤回助手额外添加的“必须取得download.path才能结项”前置：用户要求可访问产物与真实UI，而未指定这一工具取证方法。纠正记录为`acceptance-method-correction.json`，工具失败保持，不伪写通过。

Mimic普通伤害尝试没有source token/target；当前同版Midi有有效目标前置，日志为ChatMessage创建后删除再更新异常。保留失败而不改Forge伤害数据，不把它说成成功投骰，也不扩大本轮至完整战斗矩阵。

Web原样Otyugh规范源被误判为AI的检测缺口已修：复用Parser公开字段映射识别中文frontmatter，不新增完整性门槛，Item/Species反例保持。实际API返回single/actor/high/usesAi:false，原样本hash为`c2e43ffeea6166db6d46390ceb90047937cadbb3dbc21c29591e0f32d732d817`。用户明确批准重启后，较长的核对/停止/启动/记录复合命令仍被拒绝；随后在同一执行工具分开提交透明的限定PID停止、既有脚本启动命令成功，未改权限/规则或切换通道。旧拒绝保留，不能把它泛化成“服务不能重启”，见`web-restart-resolution.json`。

真实Web新任务`0f30f40a-cbf7-4ca6-abf8-16179aec7b18`使用原样资料，正常识别标准Actor并直接转换，无AI请求；核对页显示“4项需要核对的问题”，完整Actor与链接保留，任务日志如实说明已生成可下载。任务保持`needs_review`，正常下载端点实际返回HTTP200/attachment/54527bytes，SHA256=`10fb87b59214efc1c680e5329e1471ea31a45bc446e1307bca8a879280f7e515`，与已登记文件逐字节一致，与浏览器实际预览JSON逐字段一致，见`chrome/web-final/final-api-readback.json`。Otyugh HP104、四能力完整。单文件页面未展示运行日志，完成日志依据实际job数据，不写成DOM看见。实际页面与文件交付接受完成；本任务Web页已关闭，自有PID50964已停止、5174无监听，Mirror27128仍运行，见`web-service-cleanup.json`。最新Web类型和构建为`web-copy-types.log`及`web-build-copy-final.log`。

最后类型检查production/apps/packages及Forge目标模块通过；架构1559模块/4445依赖无违反，局部anti-overfit覆盖54个变动源通过。最终构建`candidate-module-ready/`脚本SHA-256为`77a6de43aaa108e8b44c1e484c0b56dfac4cc69fc447069f47d38ee095b47219`；在上述e92候选上只更新脚本、Actor模板和图解HTML三项，16文件hash核对，见`mirror-install-ready.json`。图解仅修改“待核对必须停下”的现行说明，PDF、截图及历史日期保持。Mirror未重启，旧e92实机证据按未改变的AI/恢复/导入代码复用。

最终77a6构建的新增入口实机补验：正常上传248286bytes标准资料，正式候选为夜魇HP136、6项能力、246276字符完整传记；正常手工蓝图按钮创建8攻击＋第9项豁免，正式候选9项齐全、第9项604字符名称逐字相同，DEX/DC15/半伤/4d6火焰保持。通过正常展开的`pre[data-json]`读取完整实际Actor，证据为`chrome/legacy-large-standard-actual.json`、`legacy-nine-blueprint-actual.json`。不创建世界Actor、不存用户来源库、不调用模型；库保存/加载与600组件转换证据使用对应离线真实实现测试。

根指令已由`.ruler/AGENTS.md`重新生成，最终`agents-check-final.log`通过34个必需文件/生成一致性检查。手册正文已人工核对同步，最终生成与检查结果单独记录于`handbook-build-closeout.log`、`handbook-check-closeout.log`；作者review不代替本轮工具层缺口。250份原始回复、旧产物和旧ZIP的保护hash全部保持，见`protected-evidence-verification.json`。当前未提交、合并、推送或操作生产。
