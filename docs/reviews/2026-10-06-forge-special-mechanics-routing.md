# Forge 特殊规则：特性、状态与自动化的职责评估

日期：2026-10-06。候选工作树：I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample。基线：6a7845650a04b8a78b458e5edd5f74fb2bb35ab3。

用户要求环顾现有模块及输入Mode，评估 Eye of the Deep 的眼柄禁用等特殊规则应采用临时特性、Custom Conditions还是其他处理方式。最初的只读评估已由用户批准在上述独立worktree实现并检验原模组组合；各历史失败及修复保留在下文，不把最初的只读停点当当前结论。未提交、合并、推送或生产部署。

当前首批已完成源码修复和Mirror14.368／dnd5e5.3.3／cor-cotn实际验证：Gaze、Glacial、Paroxysm、Rend的限定状态／期限／解除，以及GM单实例单光线禁用与明确恢复。CC0.2.0与AC5e14.533.8公开来源适配已验证真实STR／DEX攻击劣势；真实SY跨客户端OWNER／非OWNER／部分fact／tempHP／zeroHP已验证。测试包是按PDF人工核准的固定参数、再经公开工具编译生成，不能冒称新的全自动AI能力选择接受。世界清理已完成，最后Audit删除后再次独立读回九集合；原成员、已捕获设置和视图恢复，唯一明确报告的原Combat modifiedTime变化保留，具体终态见文末。

用户后续明确收敛支持边界：Multiattack、Magic Resistance等需要规则判断的特性，以目标版本官方dnd5e的处理为基准；官方没有制作执行效果时，本工具保留特性原文和正常原生操作，不额外实现复杂自动化，也不把它们列为必须补齐的缺陷。这不是把未执行测试标成通过，而是说明性特性的完成标准为来源保真、分类／活动／资源正确及正常导入，自动化验收只要求实际承诺执行的效果。

已核精确dnd5e5.3.3作者源码缓存提交`965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`：2014和2024官方Magic Resistance均`effects: []`、`activities: {}`；两版Multiattack均仅utility Activity且`effects: []`。源码位置为`packs/_source/monsterfeatures/{magic-resistance,multiattack}.yml`与`monsterfeatures24/{traits/magic-resistance,actions/multiattack}.yml`，module实现搜索未见这两种怪物特性的专用自动结算。结论限于此锁定版本，不推广到未来系统或第三方自动化模块。

| 能力 | 实际处理与证据 | 保留边界 |
| --- | --- | --- |
| Strobeflash Gaze | 范围逐目标原生CON豁免；仅失败Blinded；来源下一start解除；两来源独立 | 合法cone及目标由GM确认 |
| Glacial Ray | 原生DEX与cold伤害，CC Slowed半速，目标下一end恢复；免疫与多来源不倍乘 | 距离／可见性由GM确认 |
| Paroxysm Ray | 原生WIS与Paralyzed，来源下一end或真实受伤解除；GM／玩家HP、tempHP、zeroHP均验证 | 正伤害commit与真实sender；0／免疫／取消保持 |
| Crushing Rend | 失败差值至少5才Enfeebled+Clumsy；STR／DEX检定、豁免及攻击劣势；任意1HP恢复清成组，重载首次治疗通过 | 本批两来源四效果；queued新旧交错仍只有单元证据 |
| Eyestalks | 永久规则Item＋GM控制的能力可用性；单Token单ray锁定、重载／停用保留、明确恢复 | GM确认Bloodied／实际重击并选择；不自动识别暴击、长休或Purge恢复 |
| Multiattack、Magic Resistance | 对照官方保留说明／原生utility，无附加执行效果 | 按用户范围不做新增自动化，不作为必须补测或待实现缺陷 |
| Purge、Abyssal Mirage | 原文、现有原生活动／资源及明确GM操作步骤保留 | 默认GM裁定；没有官方同类执行能力或额外用户要求时，不继续扩展复杂自动化 |

可使用样本位于`.local/bettermonsters-eye-deep/special-rules/eye.forge-encounter.json`／同名ZIP；包hash`c68c701a14657d2010357d3a39197ed039274217df50fb2eaf2190e864e1869b`。正式派生Actor文件`eye.generated.json` hash`93926f5b00c285e807dad2ab6537ae63509611e12421c0a648792d436cf1b44d`，来自`eye.annotated-source.md`的公开workflow。旧AI接受Actor`68cee8…`仅保留原始证据，不能当成已修正的当前派生样本。最终本地Forge0.5.1 ZIP`a365f216e541b0db3bcabd72d71d8757ab6a141d488f6c50ee20f6db5a931c44`、CC0.2.0 ZIP`5b8c7d840560fbc488a917b80cdd0efef76ce8caec2450757564036bb84c2ce2`；后者只更新README，runtime脚本hash仍`4677ac4b…`，旧实机接受可按相同代码绑定复用。

## 结论与原则

建议按规则的作用对象和职责分配，不在“所有特殊规则都加临时Feat”和“所有特殊规则都做Custom Condition”之间二选一。

1. 来源特性／动作保存怪物具有什么能力，长期属于Actor的Item／Activity。
2. 标准受擒、目盲、麻痹等目标状态使用dnd5e原生状态效果。已匹配的通用额外状态复用Custom Conditions，例如Slowed、Enfeebled、Clumsy。
3. 眼梗禁用是这只怪物的某项能力当前不可用，应是绑定能力的局部运行状态。可用状态效果或提示卡承载并显示，但真正禁止使用需要能力调用前的检查，不能只增加一条文字特性。
4. 何时施加、何时解除、如何判断攻击／豁免结果属于规则执行与生命周期。优先复用Forge已有固定能力和角色／包绑定方式；Trigger Engine提供经过版本确认的事件事实与调度，不负责理解某个怪物的眼梗。

一个规则实例必须记录来源能力、受影响Actor／Token、实际创建的Effect、应用事件和结束约束。删除时只移除该实例拥有的效果；不改基础数值，不把运行状态写回可复用蓝图，不用显示名称作唯一标识，不为每只怪物临时新增世界级条件或世界触发器。

## 当前所有输入Mode及其他入口

源码workspaceApplication.ts只提供Actor的blueprint／structured／ai三个顶层Mode；Item提供structured／ai。pure-text Actor是Intake子模式，战斗包是独立入口，输入Mode不等于执行规则模式。

| 入口 | 当前职责与限制 | 对特殊规则的建议 |
| --- | --- | --- |
| 手工蓝图 | CreatureBlueprintV1包含基础数值及attack／save组件；没有任意特性、反应、复杂状态或生命周期的完整编辑契约 | 保持简单输入。后续按相同规则契约添加受限组件，保留未支持资料；不把复杂AI资料强行转换为V1蓝图 |
| 标准资料 | 正式Markdown/YAML经parser／generation／verifier；已有ActorBehavior语义支持状态、操作、GM步骤和来源说明 | 将特殊规则写入正式来源并生成，遵守同一审核门禁；不要导入后临时补最终JSON |
| AI整理生物 | 有证据的CanonicalMonster／Feature，结构化攻击、豁免、状态说明；目前CanonicalAppliedCondition.duration仍为string，CanonicalFeature未直接接入完整ActorBehaviorMechanic | AI提议来源与高层参数；固定能力验证器决定可实现性。模型返回或原文保留不等于自动执行 |
| AI整理物品 | 独立Item IR／目标效果／法术／使用次数入口，不能冒充Monster解析 | 沿用Item规则与目标，不把怪物自身状态硬塞入所有Item来源 |
| 纯文本审阅 | 不调用AI的受限结构解析和来源审阅 | 与其他输入共用结果覆盖说明，不给无结构的特殊段落暗中补行为 |
| 战斗包 | Actor、绑定Macro与固定能力配置共同审核，导入与启用分开 | 复用其来源绑定、固定配置、active-GM、重载恢复；单只怪物也应能承载规则，是否扩展现有包形态须实施时核实，不要求用户为每只怪新建复杂遭遇 |

后续应让这些输入进入同一规则覆盖与能力验证出口；不按Mode各写一套特殊功能。现有ActorBehaviorSemantics可作为扩展依据，但它不直接等于Monster Intake已有完整规则提取，也不等于有对应运行器。需要显式适配，不能另造一个与已有模型平行的自由脚本系统。

## 当前模块分工

已核对docs/handbook/modules.json登记的模块职责，并深读本问题直接涉及的实现。

| 模块／层 | 现在拥有的职责 | 本次评估 |
| --- | --- | --- |
| dnd5e原生Activity／ActiveEffect | 攻击、豁免、伤害、基础状态与原生可操作效果 | 受擒／目盲／麻痹继续走原生。效果与Activity引用存在仍需验收实际目标、失败分支、免疫和期限 |
| Custom Conditions | 封闭的19条件清单与固定参数、Actor条件实例、骰式修饰、特定既有生命周期；伤势另有0–3层规则 | 复用语义吻合的条件。它不是任意新条件或自然语言结束条件解释器 |
| Trigger Engine | 世界级documentUpdate／combatTurnStart／combatTurnEnd条件匹配与Macro调度；外部attack.prepared／committed／cancelled是窄接口 | 可承接稳定事件事实；当前缺少通用攻击结果／暴击及自然骰点事实，不能宣称已经能完整自动处理Eyestalks／Purge |
| Forge固定战斗控制器 | 已有save-summon、turn-start-area、staged-corruption、threshold-ward、ward-break与传奇资源恢复；Actor／包身份绑定与少量特定到期代码 | 最适合先加受限“豁免结果→效果→期限”的能力族，沿用固定代码而不是AI产出宏代码；现有Dazed到期路径不是任意状态期限已实现的证据 |
| Weapon Mastery & Properties | 官方武器规则与武器特性，包含自己的来源、结果和生命周期处理 | 可参考稳定事件及实例管理。其Slow减速10尺不能替代本例速度减半；不把眼梗伪装成武器特性 |
| Injury／Fading Spirits／伤势 | 特定伤势层数、死亡／复活和恢复规则 | 不把来源未定义为伤势的眼梗禁用映射成0–3层伤势，否则附加无来源的死亡／治疗语义 |
| House Rules、Blood Hunter、Species、spell resolver | 村规、职业／种族内容与法术解析的独立范围 | 仅按实际授权和系统范围使用，不能用村规或法术猜测特殊怪物特性 |
| Painter、token sync、session deck、session monitor、chat memory、Babele兼容 | 场景表现、选择同步、跑团界面／记录和性能／翻译 | 可以展示、辅助控制或排障；不成为怪物规则解释或效果生命周期的owner |

Custom Conditions公开API能apply／update／remove／setEnabled／applyFromItem，但Item模板导入不会自行判断豁免、目标或应用状态；其一般应用路径也没有通用状态免疫前置保证。一般状态没有任意实例duration，部分endCondition参数只保留说明。因此“有这个状态”与“本来源触发及期限已接通”必须分开验收。

## Eye of the Deep 的具体路由

| 来源规则 | 建议载体／执行方式 | 当前缺口与边界 |
| --- | --- | --- |
| Claw受擒／escape DC14 | Claw的原生目标效果，明确逃脱操作 | 已有静态绑定；命中／免疫／逃脱仍需运行证据 |
| Strobeflash目盲 | 原生Blinded＋来源回合开始期限 | 结束在Eye的下一个回合开始，不是目标回合；原生duration尚为空 |
| Paroxysm麻痹 | 原生Paralyzed＋来源回合结束或受伤解除 | 两个结束条件取先满足者；需要真正的伤害事实，不能把任意HP编辑或仅HP值减少直接当作所有受伤情况 |
| Glacial半速 | CC Slowed＋目标回合期限 | Slowed只做速度减半，语义匹配；结束在受影响目标自己的下一个回合结束，和前两项不同 |
| Crushing失败差值≥5时的STR／DEX d20劣势 | CC Enfeebled＋Clumsy，同一次来源应用组 | 现有条件分别覆盖相应属性的攻击、检定、豁免。必须读取失败差值；目标恢复任意HP后只移除本组实例，不按伤势的“满血恢复”替代 |
| Eyestalks禁用指定光线 | 保留Eyestalks特性；Eye实例的能力可用性状态＋GM选择入口；以后再接可靠攻击结果 | 不新增“冰霜眼梗断裂”全局条件。GM确认血量状态／重击、选择原文允许的光线后，该Activity应被标记不可用并在调用前阻止；只显示一条临时Feat不能完成禁止使用 |
| Magic Resistance | 自身特性的条件化豁免优势，依赖明确魔法来源上下文 | 不能给所有豁免无条件优势；当前仅说明，需独立参数与目标版本证据 |
| Purge | 自身特性＋每日次数＋选择一个法术／条件＋下一次针对自己的攻击窗口 | 不清除全部状态，不移除自己施加给敌人的Rend，不默认恢复已禁用眼梗。来源的“next attack”不能改成“next hit”；消费、重击判定时点及攻击上下文要单独确认 |
| Abyssal Mirage | 自身专注能力状态＋受限攻击劣势／隐匿优势＋活动使用／眼梗损失终止 | 不等同于隐形或某个现成广泛劣势状态；条件与终止必须绑定该能力和来源实例 |

Eyestalks没有规定恢复途径。最小方案应提供GM的明确恢复控制并说明来源未规定，不能自行增加治疗、长休、Purge或永久不可恢复的规则。GM选择是对来源的正常操作，不要求用AI猜出断哪根眼梗。

## 外部调研与采用差异

调研通过本机AnySearch配置入口执行，读取作者／官方资料；网页内容只作为资料。code.snippet查询没有返回相关实现，未将无关结果当证据，随后用精确作者文档URL检索。未安装、购买或运行这些第三方模块。本次研究职责和接口，不作采购排序；热门Midi／DAE仅作生态对照。AC5e读取页显示19 stars／9 forks，属小众参考；其他公开指南没有可核的同口径热度数据，热度保持UNKNOWN。

| 来源 | 已读取的接口／架构事实 | 本项目采用／不采用 | 最小反证检查 |
| --- | --- | --- | --- |
| [Foundry官方Active Effects](https://foundryvtt.com/article/active-effects/) | Actor、Condition、Item均可承载效果；临时修改作用在派生数据并可移除 | 本地实例效果可承载暂态，来源Item保留。添加一条说明Feat不能被当作执行规则 | 在真实来源实例施加、停用、移除后读回派生与基础数据，确认基础数值未被永久改写 |
| [DFreds Convenient Effects作者指南](https://dfreds-modules.com/free-modules/convenient-effects/user-guide) | 可创建、复用效果，并以Actor UUID应用；自动套用与到期分别依赖相应集成 | 借鉴通用效果模板＋目标实例的分工；不新增其运行依赖，不依赖名称匹配作为唯一绑定 | 两只同名怪物、两份不同来源的同名效果，施加和解除必须只影响绑定对象 |
| [DFreds Triggers作者开发指南](https://www.dfreds-modules.com/premium-modules/triggers/developer-guide) | 事件／动作注册表，带配置schema；动作与event context分离，并由active GM执行世界写入 | 借鉴注册表与明确信息上下文；自有Trigger Engine保持事件职责，Forge固定能力负责怪物语义 | 同一事件在多个GM／重载／重复Hook下最多执行一次，缺少事件信息时拒绝假自动化 |
| [Automated Conditions 5e作者仓库](https://github.com/thatlonelybugbear/automated-conditions-5e) | 状态或专用flags影响不同种类的骰式，并支持源／目标上下文；公开页有MIT标识 | 对照“状态效果如何改变骰式”的边界；不据此把所有怪物逻辑变成状态，不替换已存在CC | 同一效果只影响规定属性与roll类型，其他检定以及无关来源不得改变 |

以上是2026-10-06读取的可变公开指南／仓库页面，不是精确14.368／5.3.3的接口接受。记录中的接口用于架构比较；落地必须对照本地锁定版本源码、实际模块配置和真实行为。未复制第三方代码；付费Triggers只有公开文档观察，不推断私有实现或许可。

## 建议实施顺序与第一批范围

第一批优先打通明确的通用状态应用和期限，不从复杂眼梗／重击窗口的全自动解释起步：

1. 给每项能力输出覆盖说明：规则是否结构化、由原生／已实现模块／GM步骤执行、运行是否实际验收。自动化必需却没有能力实现时保持需复核；允许GM处理也必须显式展示步骤。统一覆盖说明应用于各输入Mode，不能以source accepted替代完整功能通过。
2. 在既有固定能力契约中扩一个受限的“豁免结果→已知效果→结束约束”族，明确next-source-turn-start、next-source-turn-end、next-target-turn-end及damage／HP-recovery等语义；这是拟新增能力，不是现在已有支持。初始样本选择Strobeflash、Glacial、Paroxysm，再接Rend的失败差值与成组解除。条件内容继续复用原生与CC，没有命中语义的外部模板不自动附加。
3. Eyestalks先提供来源特性关联的GM操作：禁用哪条光线、当前状态、明确恢复。该按钮必须调用受限的能力可用性操作并禁止对应Activity；这是有功能的GM辅助，不是增加文字提示后标作自动化。待攻击结果、自然骰、暴击、血量时点和选择权限都有实证后，再选择自动提示／自动触发；不自动随机选择光线。
4. 后续用户范围已替代最初继续扩展Magic Resistance／Purge／Mirage自动化的建议：默认保留原文、原生活动／资源与GM裁定；仅目标版本官方同类能力已有明确执行接口，或用户另行指定自动化时，再进入实现与验证。AI仍只选已经实现的固定能力，不能编写随意宏或数据路径。

复用现有ActorBehavior、固定能力、来源身份和控制器生命周期骨架，不新建大型DSL／世界规则平台。初期新增的生命周期处理只拥有自己的实例，不接管CC现有Bleeding／Frozen或武器模块全部结算。一次性手写宏可作明确标记的试验，但不能作为每只怪物默认生成路线。

前端建议保持已选的“专注编辑与审核”同页布局：特殊特性旁展示“原生可操作／模块自动化／GM辅助／待实现”与具体未覆盖规则，提供必要的禁用／恢复或效果应用入口；不要让用户为每只怪物填写原始flags、字段路径或建立新Mode。

## 待判断本地化／复查清单

- 不新增必须采购或本地化的外部模块；保留已有候选状态。AC5e在本地旧健康表为Untested，本轮作者资料读取不升级运行状态；DFreds Triggers不进入安装清单。
- 待吸收的是效果模板／实例分离、注册表schema、Actor／Token来源关联、active-GM幂等与受限生命周期能力。进入实现前重新核对最新目标、现有接口、候选源码身份与模块全集，固定本批两三个来源规则及负例。
- 实机接受要覆盖成功／失败／失败差值、状态免疫、两个来源与两个实例、源角色与目标角色的不同回合、重复施加、移除／停用／重载、临时HP吸收伤害、实际HP恢复和共享Actor／非链接Token边界。
- CC当前源码、README和2026-10-05记录支持精确Next14.368／6.0.5的有限状态切片；旧module description与使用runbook仍有injury-only措辞冲突。记录为待对齐文档，不能把Next有限接受或5.3.3历史接受用于证明当前Eye完整效果。此次建议先绑定Mirror5.3.3，不扩大为Next版本排障。

## 本地关键证据入口

- foundry-modules/fvtt-json-forge/src/workspaceApplication.ts：输入Mode与草稿分离。
- packages/forge-browser-runtime/src/creatureBlueprint.ts：V1蓝图的有限attack／save组件。
- packages/contracts/src/conditions.ts：19项封闭定义，Slowed／Enfeebled／Clumsy的精确范围。
- foundry-modules/fvtt-custom-conditions/src/runtime.ts与api.ts：Actor实例、applyFromItem、叠加与既有生命周期。
- foundry-modules/fvtt-trigger-engine/src/types.ts与runtime.ts：世界事件、外部事件信封、active-GM调度。
- packages/models/src/behavior.ts与canonicalMonster.ts、packages/parser/src/behaviorSemantics.ts、packages/generation/src/actor-behavior-semantics.ts：已有语义表达骨架与当前Monster IR差异。
- packages/intake-ai/src/encounter-capabilities.ts、foundry-modules/fvtt-json-forge/src/encounterAutomationRuntime.ts与encounterAutomationLifecycle.ts：五类固定能力、包绑定与限定生命周期。
- packages/forge-browser-runtime/src/encounterPreparation.ts：受审来源、配套Macro与角色绑定的推广门禁。
- docs/reviews/2026-10-06-bettermonsters-eye-of-the-deep-workflow.md与.local/bettermonsters-eye-deep/effect-coverage-audit.json：当前实际样本缺口。

本轮没有运行测试或Foundry操作；结论是源码／资料驱动的设计建议，拟新增能力仍需实现与独立接受。

## 用户批准后的第一批实现（2026-10-06）

用户已批准在既有独立worktree实现并检验其他本地mod的协作，不包括commit、merge、push或生产。继续使用`codex/20261006-111625-bettermonsters-eye-deep-sample`，基线`6a7845650a04b8a78b458e5edd5f74fb2bb35ab3`。目标只绑定Mirror `14.368 / dnd5e 5.3.3 / cor-cotn / 30001`，禁止备份。

本批新增五项来源能力：Gaze、Glacial、Paroxysm、Rend的受限效果与生命周期，以及GM确认的Eyestalks禁用／恢复和真正的Activity使用前拦截。永久规则仍在来源Item；Magic Resistance、Purge与Mirage继续保留明确GM步骤和未自动化边界。IR及旧AI接受产物不覆写。测试包由公开`compileEncounterSelection`／`renderEncounterActorSource`／`prepareForgeEncounter`制作，声明为来源人工选取的固定参数样本，不冒称新的AI接受结果，不手改最终Actor JSON。

安装之前的独立复查已发现并要求修复多人事件、跨文档Hook options、范围多目标、多来源同状态、免疫与异步队列问题，单元通过不代替Mirror实测。新建的检验只用于这些具体缺口。

制作真实样本时另发现：Rend与Glacial在正式生成中已有Save Activity，但`deriveExplicitSaveOutcome`没有识别来源的D&D2024 `FAILURE:`标签，将成功豁免伤害分支保留为literal；严格战斗包gate因而拒绝。这不是允许放宽gate的理由。先添加三个来源格式正例、未知SUCCESS／差值限定／缺分支反例与旧输入不变检查，再修一般来源格式判定；保留全部Actor、来源及配套宏绑定核对。

这一来源格式修复已使真实样本通过原有严格整包预览，包hash为`c68c701a14657d2010357d3a39197ed039274217df50fb2eaf2190e864e1869b`，含单个Eye、五个明确GM辅助载体和工具编译的固定控制入口。新增5项测试、14项既有契约／打包测试通过；分号分隔的未知SUCCESS近邻反例保持needs_review。另55项已受影响的Intake／结构动作／来源审核检查通过，architecture检查通过。这里的包只证明人工来源配置与正式生成，不宣称重跑了AI固定参数选择或真实浏览器。

独立复查确认精确Core14.368的`preUpdateActor`先执行，随后才过滤空diff；不能将零HP有效伤害与取消更新都按“没有HP变动”认定。本候选仅对已有自有受伤解除组的零HP原生正伤害无变化路径，向同次Actor更新写唯一提交标记；post必须读回真实标记。其他有变化的伤害要有updateActor提交，0／免疫归零／取消不移除。该提交标记、跨客户端fact、重载首次治疗及多来源期限仍须Mirror实机接受。

最终未发布Forge0.5.1候选ZIP SHA256为`7a100d4ef5b4a229e332efb6037d092db2959c55b21f67a08a5ed475677a306c`，浏览器bundle为`319ea15219f97b13fa39baf75801e8de4c67b43a80a4adef213b5f6734039215`。writer报告52项固定能力／运行时／启动／构建／确定性ZIP检查通过、两类typecheck通过；离线绿色不记为实机接受。Root准备的完整验收初始化器与生成来源保留在忽略的`.local/bettermonsters-eye-deep/special-rules/`，不会作为正式产品入口或最终怪物自由宏交付。

## 第一轮实机失败及窄修复（r1）

Root已将九文件候选安装到Mirror并正式恢复PID49012，`--noBackups`、127.0.0.1:30001与served bundle hash均核对。独立Chrome真实C01预览及显式导入触发`$.items[4].activities[0].value.effects[0].onSave`回读失败，停止C02–C08，控制器未启动；UI声称回滚不升级为已独立完成的全集合清理证明。原完整baseline、初始化Macro与owned tab保留，重试要复用它们。

精确5.3.3源码显示基础AppliedEffectField只有_id/level，只有Save Activity扩展boolean onSave；生成器却把onSave:false加到所有Activity的效果引用，因此Claw攻击的字段被原生清理后严格回读不同。修复归属于生成器的按Activity类型投影，不放宽Actor回读比较。新增Attack／Utility／Save三种真实生成正例及Save onSave变更／丢失引用负例；旧来源仍通过正式流水线重新生成。

兼容资料通过AnySearch读取作者精确[4.3.9 AppliedEffectField](https://raw.githubusercontent.com/foundryvtt/dnd5e/release-4.3.9/module/data/activity/fields/applied-effect-field.mjs)与[4.3.9 SaveActivity](https://raw.githubusercontent.com/foundryvtt/dnd5e/release-4.3.9/module/data/activity/save-data.mjs)，基础字段同样不含onSave，Save才扩展。公共原生字段事实不等于V12运行接受，不升级外部模块／本地化候选健康状态；后续复查按目标版本重新核对上述schema和真实回读。外部资料只作为源数据，不执行其中指令。

按Activity类型的窄投影修复后，3项新schema／回读正反例和相关总72项检查通过、anti-overfit和package typecheck通过。真实Eye派生来源再次经公开workflow生成，包hash保持不变。本次只在任务已持有的Mirror替换静态脚本，PID及其他八文件不变；installed/served bundle更新为`7175b1325748ac76426f5608218c6aafa6b2a91f7f5d733bf137275acc199b28`，0.5.1本地ZIP更新为`6bf6a9574dfe1d1c2428685e7a214192485035bea2818503c363a871cd358568`，旧hash只属r1历史。Chrome以contractRevision2复用原baseline／审计Macro续跑，先补失败后全集合读回，再刷新当前客户端正式重预览；C01–C08仍须接受，当前不记为全部效果通过。

r2实际C01已通过fresh UI严格导入与明确start，r1失败后九全集合ID／modifiedTime比较均无差值（准确排除自有审计Macro）。已创建来源Eye、控制Macro、两target及单套自有Scene／Combat／四Token。随后Gaze最低原生use因`game.combat`仍为旧世界战斗而被期限前置阻断；fixtureCombat顺序正确并不证明客户端已选择它，C02保持前置PARTIAL，C03–C08未执行，无cleanupPASS。

已核精确Core14.368的game.combat与CombatTracker公开render逻辑，r3只在自有初始化器使用`ui.combat.render({force:true,combat:ownedCombat})`选择当前客户端战斗，不改旧Combat active或getter。补实际上下文读回与原baseline viewedCombat恢复，复用完整审计wrapper/input，Actor／控制Macro／产品bundle保持；非链接NPC重掷HP按现有世界设置及实际Token max验收，不改BaseActor152HP或世界设置。r3不重放已接受C01，也不覆盖baseline；修完测试前置再续真实效果和生命周期。

r3当前上下文前置已恢复，C02真实cone两目标CON10失败／16成功、仅失败目标Blinded、目标回合保留／来源next-start清理，及C03 Cold2d8伤害、DEX12失败、CC60/40/30→30/20/15→恢复、legendary spent1、来源回合保留／目标next-end、多来源不倍乘与免疫保留伤害/消耗均有实机证据，Root接受。C03首次审计的数字字符串严格比较误报已撤回，不认作产品bug。

C04 Paroxysm原生WIS10/DC15施加成功，但真实applyDamage(5)把非链接targetA HP300降为295后麻痹未解除，后续fresh snapshot仍有同group。此为实际功能失败，不用单元绿色覆盖。C04其他分支及C05–C08未执行，owned fixture/唯一baseline保留，没有最终cleanupPASS。下一步仅对同失败状态追加一次原生1伤害的临时Hook trace以区分提交/userId/HP路径/Actor与options身份；普通ActorDelta确会转发updateActor的精确源码已查，不无证据改成猜测，也不重复通过的C01–C03。

r4单次1伤害实际trace排除Actor对象变更／前后options变更／缺updateActor／错误userId；HP295→294真实提交但麻痹保留。r5只读Hooks.events给决定性顺序：runtime post id982先于bridge post1043，前者检查尚未生成的committedDamageOptions而退出。Core14.368 game.mjs先await canvas初始化再触发ready，canvas.draw先触发canvasReady；因此旧index在canvasReady恢复控制器、到ready才注册bridge的顺序不正确。归因于Forge恢复顺序，不归因于MidiActor或其他mod。

r6最小修复只改index的canvasReady顺序：先幂等注册bridge/passive guard再resume，ready保留fallback；41项检查及模块typecheck通过。Actor生成、包参数与effect/lifecycle规则未改，C01–C03有效证据复用；伤害／重载分支按本候选复验。0.5.1新bundle `8fbb8b593b7e51d0b2dea3d44bfe99c829e705cbd7ea5c8ccac0f69e2fd5f9a0`，ZIP `17b1a0f60145c9d284ef7f6ff7d13f9e6893c6288e45e72000b805bedf913e34`，任务持有的Mirror只换静态scripts/index.js，PID／其他八文件／版本保持，没有服务重启。当前C04及C05–C08和最终清理仍待实机接受，不以注册顺序测试替代实际受伤解除。

r6实际刷新恢复后，bridge post989先于runtime post993；旧失败现场HP294→293时原Paralyzed group已真实清除。随后C04普通HP300→295、tempHP10→5且HP300的受伤解除均通过，修复有实机证据。零HP/temp0正伤害5分支仍不清，停止剩余矩阵。精确Core Document.update原地加`_id`，当前零HP post要求原updates恰好四键，构成新的强候选；r7仅对这一状态追踪同updates对象与真实stamp，不回放C01–C03或已通过的普通HP/temp分支。

成功移除Paralyzed后即时读回另有DAE14.0.12 `autoCreated:true`、static-id `dnd5eincapacitat`且origin:null的Incapacitated。目前不把即时读回等同于永久残留，也不按autoCreated标记盲删外来状态。已只读核现有DAE的create/update/delete效果后的status reconciliation与公开`DAE.actionQueue`，下一步应在合法健康目标解除后等待该公开队列并读回实际parent/来源/其他活跃依赖，再判断是异步证据层还是生命周期缺陷。未修改第三方DAE、没有升级其健康/本地化状态；缺口不影响已成立的独立Gaze/Slowed证据。

r7真实零HP trace确认stamp已提交读回、原updates在Core update后增加`_id=poodVUPRYkr2MgEC`第五键；后置四键拒绝是准确根因。r8仅允许该_id且验证等于目标Actor.id，其他额外键与取消无stamp继续拒绝；41项检查/module typecheck通过。Mirror新bundle `03d8cc3dd0d671ce45a4577dbd9885f68b8460079e1d2eab27d8b702cb97dbe8`、ZIP `a365f216e541b0db3bcabd72d71d8757ab6a141d488f6c50ee20f6db5a931c44`，仍只替换script、原PID/版本/包/其他八文件不变。r8复验zeroHP、剩余取消/免疫/来源期限与健康targetB的DAE公开队列依赖读回；未完成部分和最终清理继续保留未接受，不抹除已有普通HP/temp证据。

r8实机已接受C04零HP正伤害、零伤害／免疫／preApply取消／两种preUpdate取消及来源next-end期限分支。健康targetB解除Paralyzed后的DAE自动Incapacitated在公开队列barrier完成后消失，之前的永久残留疑虑撤回；没有修改DAE。C05真实Rend差值4无组、差值5产生Enfeebled+Clumsy，原生STR／DEX检定及豁免的`2d20dis`实际取10／舍16，CON／WIS正常。只识别kl的旧审计误报撤回；但原生力量／敏捷攻击确实仍为普通1d20，不能记C05全部通过。C05治疗／组清理与C06–C08及最终恢复仍未接受。

r9检查只针对这个新的攻击缺口。精确CC当前只在preRollAttack写顶层disadvantage；本地AC5e14.533.8随后会依据自身来源重新计算同一字段，另有postBuild／postRollConfiguration协调。Root准备同一保留现场的一次STR与DEX原生AttackActivity trace：临时观察现有Hook回调前后及最终骰式，不改期望结果、不重复施加状态、不变更模块设置，finally恢复函数和移除观察Hook。先拿实际顺序与覆写证据，再确定一般CC适配；不因预Hook绿色而代替最终实骰接受。

r9实测把“AC5e清false”的竞争假设修正为更精确事实：CC Hook1034将disadvantage置true，后续1054保持；AC5e Hook1108最终给config与roll.options写advantage=true/disadvantage=true、mode0；真实STR与DEX仍普通1d20。它的subject／opponent优势和劣势来源均空、targets为空，preAC5e frozen baseline却正确保存原生dis=true；所以没有证据支持额外合法优势，bothtrue是其fast-forward normal协调表示。精确14.533.8源码对未知status表项跳过，而已公开同一statusEffectsTables引用。下一步只读核实两CC表项缺失和表可扩展，再通过CC拥有的可选公开状态注册让AC5e计入来源，不强制最终骰式、不改第三方文件或设置。观察Hook已全部恢复，HP268与两CC实例未变；r9不计C05整体接受。

r10实际只读表确认14.533.8 active、公开表为可扩展对象，Enfeebled／Clumsy／Defenseless自有status条目均缺失，原生Paralyzed存在attack.opponent优势规则；未写任何表或状态。CC单writer只在精确Mirror组合可选注册前两项按属性、active实例限定的攻击来源，沿用生命周期与自有entry回收；保持Next独立门。候选保持0.2.0，避免让WMP现有精确依赖门拒绝0.2.1，实际候选以脚本／ZIP哈希标识。这不是新版本发布。

Mirror已安装CC0.2.0脚本SHA为`18fb45076c79c4ecfaccd838ddd879dbc6eb7a1dad8b0d9fea9f6732cf13174c`，31文件完整before清单已保存；该脚本没有当前HEAD的公开表ready重试，不能拿同版本号宣称源码一致。Root核对当前HEAD新增的6.0.5移动字段与攻击schema只在精确Next分支，5.3.3投射status、movement映射与check/save变化保持；preparedHp兼容更新与weapon effect API可用性仍须按旧TE及实际模块组合检查。CC首次安装器明确拒绝既有目录，本次不调用该初装入口；后续仅按本任务已有本地安装授权、准确文件白名单与前后哈希更新自有静态模块文件，不删除目录、不建备份、不改世界数据。除C05受影响原生攻击外，补C03一项真实Slowed与期限窄验收，其他有效证据按相关路径未变复用。

CC适配及既有模块整合安全检查178项、模块typecheck通过；Next自定义来源名称优先级保留。确定性构建与实际安装只改变scripts/index.js及两README，共31文件中另28文件相同。CC0.2.0候选bundle／served SHA为`4677ac4b6ceda291d3020d42a296fc3219a122f784547142da01fa3065a715e3`，ZIP为`caf03d83d4cd40207b74cfc6f24f3b8784311fcc01d224bb077cb445b12bd5de`；PID49012不变，Forge／TE／WMP／AC5e／DAE／Midi共246份代码和静态文件前后hash相同。一次pre-copy校验误纳入Midi已打开的pack LevelDB log导致读取失败，尚无复制；修正为静态文件范围，活数据库不读取或写入。写后的控制台dictionary投影空值只属报告层，原JSON收据与served hash正常；只修投影／读回，不重安装。手册33项检查通过。r11真实接受仍待回传，静态安装不记为攻击通过。

r11客户端资源URL与Root安装／served收据绑定后，保留的Rend组真实STR`2d20dis+3+2`、DEX`2d20dis+2+2`取10弃16；AC5e实际来源分别衰弱／笨拙，健康targetB普通1d20。真实Paroxysm目标作为opponent时，来源中确有麻痹优势及CC衰弱劣势，原生Dialog默认普通、实际1d20抵消；同一组合还包含AC5e可见性优势／劣势，故这是实际完整组合接受，不宣称隔离了可见性。tempHP5保持原HP268及两CC，另一个Eye真实Rend32伤害后HP241、四效果两source；native回血1到242清四效果，力量攻击恢复普通。Root接受C05这些分支。

更新CC后的真实Glacial仍伤害8并减速30/20/15；Root工具把创建顺序的tokenIndex1／2写反，实际最后停在targetA start，并非产品提前清除失败。没有重施射线，只推进tokenIndex1的source2 start，即真正targetA end，原组到期且恢复60/40/30；原FAIL加补证共同保留并接受C03窄复验。工具另一次因旧game.user.updateTokenTargets在0步/0攻击时失败，改精确Core14.368的公开canvas.tokens.setTargets；新完整源码已修同一helper的目标恢复。产品与原baseline未改。C06–C08、effect-bearing reload首次治疗及最终清理继续未接受。

C07预期另按当前源码核准：持久停用只令控制Macro.fixedAutomation.enabled=false并移除控制器Hook，不删除既有效果、claims或ray lock；独立被动guard仍拦截被禁用光线，重载不自动恢复控制器。GM显式恢复能力才解锁。手动删除／禁用本包ownedNativeStatus效果的claims清理须在控制器启用时检验；停止后不要求已卸载监听继续清理。C08计划用真实非GM客户端的Core OWNER许可链及两次原生damage事实，不手造Hook或payload身份冒称远端接受。所有操作仍在同批owned对象上。

r12全部请求phase实机接受：真实GM按钮仅禁source1 Glacial，原生调用零save／消息／HP／资源／效果变化，满HP未自动解锁；source1 Paroxysm和source2 Glacial独立。锁定在重载及真实UI持久停用后仍由被动guard拦截；停止保留既有效果且不恢复runtime。编译控制入口重新启用、GM明确恢复按钮后，Glacial原生使用开放并消耗一次legendary。前置只有Bloodied72/144及真实criticalroll20/20，SimpleCover显示全掩护，不能把这当实际命中／暴击伤害接受；该分支证明GM辅助可用性控制，不证明自动识别合法重击。

r12双来源Gaze在真实原生cone选择中各建一claim，source1 next-start保留source2，后者next-start最后解除。第三次Gaze后GM删除精确本包ownedNativeStatus Effect，claims清空并重载不复活。真实Rend effect-bearing重载后的首次目标HP变更为native治疗1：268→269并清两CC，填补r11的首次治疗缺口。停止重载回到世界landing scene的一次工具前置错发生于0业务动作，改为核对owned Scene标记后native view切回；不启动已停用runtime、不重放有效步骤。外来状态、多来源Paralyzed、手动disabled及真实玩家继续补验，queued新旧交错仍仅有单元边界，不声称全部原C07矩阵实机接受。

r13补充接受先存在的外来于Forge原生Blinded在own Gaze到期后保留，以及精确owned Effect.disabled=true清状态与claims。两来源Paralyzed使用真实同两组，通过显式source1/source2 start/end补齐期限：第一个end保留第二组，最后end清0。原工具跳过own start却期待end清理的误报原件保留，只续既有组、无reset／recast；这是显式事件路径接受，不宣称自然连续nextTurn。queued旧新竞争仍只有单元证据。

r13真实SY非GM客户端与GM使用同一Mirror的两个正常站点会话（localhost／127.0.0.1），未更改用户role、character或全局权限。只本批owned Scene／Actor及唯一PlayerProbe Macro授予测试许可。非OWNER applyDamage被Core ActorDelta权限链拒绝、HP／效果不变；玩家公开start／stop被GM guard拒绝。获得OWNER后两次native伤害分别300→299→298，GM收到真实传输sender且OWNER=true，两个不同eventId及新组最终清0；第二次fact实际diff只有eventId／beforeHp／afterHp／groupIds，完整持久flag校验仍通过。玩家被禁用光线调用保留资源／HP／效果／消息；未独立统计player saveHook次数。新增Macro仅`Zw39LIgZDWc0YYZ0`且已进入controller附加精确清理表。

r14把GM本地边界补成真实SY跨客户端证据：temp10→9且HP300不变，native伤害1仍解除Paralyzed组；HP0/temp0保持0的正伤害1由真实Core stamp提交、fact.noOpAtZero=true且eventId等于stamp，GM真实SY/OWNER验证后claims清0。零HP终态仍有bloodied/dead，未把它冒称健康目标依赖清理。观察Hook卸载、原baseline和fixtures保留待统一收尾；角色权限／原世界集合恢复仍不能在最后删除读回之前标通过。

r15完整清理前置正确停止：97个已跟踪来源消息之外还有18新增，且Audit.flags基线的packSourceConfiguration表面不等，故零删除。r16/r17只读补证识别一个直接绑定本包Combat的native turn，以及17个Monks14.02空speaker roundmarker；消息没有combatID，时间近邻不单独作为来源证明。Root结合精确模块只在combat round/start/delete事件创建该标记的代码、本批GM作者／创建范围、仅自有Combat实际变更和全部10原Combat modifiedTime逐一不变，推断17项是本批回合测试通知；明确为综合归属推断，并按准确18 ID加入本批已授权清理白名单。完整消息元数据保留为审计证据，不扩大到其他通知。

packSourceConfiguration真实设置完全未变：最初外部baseline.json保存七个原始字面点号键，与当前live exactJSON相同；只有保存到Audit.flags后点号键被展开为嵌套结构。保留两种历史证据、比较改用不可变外部原始基线，不向真实setting写入错误nested值、不伪造基线。r18仅修改拥有的验收工具；准确额外消息身份再核，且通过自有Combat的原生delete调用观察并捕获新生成RoundEnd通知，一并收尾，避免关闭战斗新增一条未追踪消息。原生API删除后九集合／设置／视图终态仍待读回。

r18准确owned清理一次已执行，删除3Actor、1Scene及嵌入项、1Combat、controller及PlayerProbe，97+18既有消息和本次直接deleteCombat操作捕获的1个RoundEnd共116消息；SY登出关闭新增tab，GM及服务保留。最后Audit gate保留了1个真实元数据差异：原Combat`8WCtc3bOyudYuHzh` modifiedTime从`1790688866037`到`1791300409674`，没有missing／extra，其他原文档mtime相同，原active表、视图／世界时间／暂停／相机／选中目标及原settings一致。

精确Core14.368 `client/documents/combat.mjs:675–678`在删除Combat后，创建者客户端会调用当前collection.viewed.activate()；`:144–145`明确通过原生update({active:true})。这条普通恢复路径与本次原viewedCombat元数据变更吻合，中间未单独捕获其update payload，不能宣称旧Combat全字段原始快照存在。Root将该准确ID／前后mtime列为本任务恢复的已报告元数据例外，禁止伪造／修改_stats以让门禁绿色；成员、active和其他捕获的原值恢复仍按严格比较。最后Audit删除与独立九集合读回继续取得，不能把这次例外扩展到其他字段或文档。

## 最终交接与清理出口（r19）

最后Audit`9hq0zdJyEK1WieDW`已通过原生API删除，随后真实执行独立`postFinalizeCollect`，没有新建替代审计文档或使用目录渲染数量代替。状态为`RESTORATION_VERIFIED_WITH_ONE_REPORTED_COMBAT_MTIME_CHANGE`。九FULL集合原ID全部保留／无extra，数量依次Actor286、Item180、Scene65、Combat10、Macro93、Journal67、Table12、Cards0、ChatMessage1090；除准确已报告的Combat`8WCtc3bOyudYuHzh` mtime外，其他原文档mtime相同。全部外部原始settings等值，原Scene／viewedCombat／worldTime21085811／pausedtrue／camera2600,1700,.5／controlled与targets[]及10个Combat.active同原表。

删除了3个本批Actor、Scene及4Token／模板、Combat、Controller、PlayerProbe、最后Audit及116个有范围证据的来源消息／回合通知。无本包Actor／Macro、Audit或其他owned对象残留；SY已退出并关闭新增localhost tab，GM的原owned tab保留。Server Mirror PID49012、127.0.0.1:30001和`--noBackups`仍实际核准；没有重启／停止服务、生产操作、原World stats改写、用户role／character修改或settings回写。

最终证据在任务外部目录`eye-deep-rules-20261006-r1/`：`r19-final-cleanup-receipt.json`、`r19-independent-after-last-audit.json`、`r19-independent-final-comparison.json`及完整初始化源码；原PDF和历史FAIL／补证都保留。本任务代码、样本与两本地候选包仍在上述worktree，main干净，未提交／合并／推送。下一步建议先用当前样本做一次用户同页编辑／审核走查，明确自动化、GM辅助和未支持标签，再按确认范围做正式整合；不新增任意规则Mode或模型自由宏。
