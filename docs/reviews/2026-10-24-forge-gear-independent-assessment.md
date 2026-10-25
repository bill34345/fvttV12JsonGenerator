# Forge Gear方案独立评估（2026-10-24，未实施）

> 状态更新：评估后，用户已确认怪物保留Feature、AC固定，普通装备与loot不做，魔法武器单独判断。当前要求见[Forge唯一当前状态](../plans/2026-10-20-forge-ab-current-state.md)。本文保留当时的技术调查与备选分析，普通Gear方案及下列候选复查步骤不再是当前实施／验收待办。临时换thread交接文档已按用户要求删除。

## 结论与本轮边界

用户本轮要求：“独立评估这个装备方案。先核实依据、可行性、合理性和缺点，不默认接受前一个 thread 的结论，先别实施。保留当前 worktree 的未提交改动。”

结论：**Feature承担怪物攻击、真实Gear承担物品与普通掉落，这个职责划分合理；原方案有精确版本依据，但还不能原样作为实施定案。**“逐个创建武器，再删除攻击活动”是一条可行候选，不是已经证明最简单或必须采用的路径。应先比较创建前准备完整Actor与事后添加装备；领取时也应比较重新取合集与原生保留当前物品副本。

本轮只调查和记录评估。没有修改产品代码、提示词、现有文档或系统文件，没有调用Forge AI、创建或更新Foundry对象，没有运行浏览器、安装、部署、重启、提交、合并或推送。仅新增本评估页。现有交接、调查、当前状态页与未提交成果不改写；本页意见不构成用户已批准的新规则。

## 已独立复核的依据

- 当前工作树仍为`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支`codex/20261019-forge-ab-fixed-replies`，HEAD `8fd68ea3cc03ec996550a5a70bfa5f0f9cfd1a67`。开始时18份tracked修改、5份untracked，已采集23份文件的SHA-256用于结束复核。
- 评估时已读临时Gear交接文档、[原调查及方案](2026-10-24-forge-monster-gear-readonly-audit.md)、当前状态页相关记录；不把其结论直接当作证明。临时交接文档后按用户要求删除，来源调查与评估正文保留。
- 已重新读取原13次MCP只读查询记录，并核对两只NPC及普通长矛的fullData，而非只读摘要。角斗士确有长矛3、盾牌1、镶钉皮甲1；牧师有硬头锤1、圣徽1、链甲衫1。普通长矛基础1d6，怪物长矛2d6；两种用途不能混用。读取原始来源Markdown也确认Gear行及怪物伤害确实如此。
- 本机Mirror系统manifest为dnd5e5.3.3，`dnd5e.mjs`的SHA-256仍是`79ca2c817017a27c2fcea11d53d4b2a1b0238fe72e5597dde14197a629e77c4f`，与上轮记录相同。
- `bun run references verify dnd5e-5.3.3`成功；固定源码checkout为`F:/FoundryLab/reference-cache/dnd5e/5.3.3/repo`，HEAD `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`。本轮读取了其中的Gear、Weapon、AC、拖入流程和原始NPC YAML。
- 本轮也读取本机Core14.368源码，未以最新版API推断目标行为。没有重新检查运行中的世界或做运行验收；上轮MCP记录仍是历史观察，不能证明本轮方案已经保存或可领取。

## 原方案各部分的判断

| 部分 | 判断 | 原因与缺口 |
| --- | --- | --- |
| AI单列Gear，攻击保留Feature | 赞成此方向 | 符合已记录产品要求，也避免把普通长矛1d6覆盖怪物2d6。AI应输出名称、数量、明确限定及需要的Feature关联，程序消费结构，不从多重攻击次数猜装备数量。 |
| 从真实合集取普通物品 | 普通装备可行 | 本次六类名称有样本，系统已有来源及Gear支持。名称命中不等于版本、变体、语言或同名来源已经消歧。 |
| 创建后删除攻击活动 | 接口可行，但不宜直接定案 | `WeaponData._preCreate`会给单独创建且无活动的Weapon添加Attack；`Item5e.deleteActivity`是正式接口。两步之间确有可见重复攻击及中断窗口，但创建整只Actor是否可以避开该窗口，应先比较。 |
| 保持AI最终AC | 普通样本有直接静态依据 | `flat`模式跳过普通护甲／盾牌的AC加算；`natural`仍加盾牌。它不能保证任意装备的转移效果、穿戴副作用或第三方处理都不改变角色。 |
| 领取时取普通合集武器 | 原生支持，但有条件 | 来源有效、允许使用合集副本时，`asGear`克隆当时的合集内容并保留数量。也有原生保留／回退到NPC当前副本的路径，并非只能依赖合集重新取得攻击。 |
| 失败保留Actor并提示 | 方向合理，未形成完整交付设计 | 仍需区分未匹配、未导入、删除活动失败、未核对及源变化；现有角色复用路径不会自动完成新增Gear阶段。 |

## 需要修正或补齐的具体问题

### 1. “导入前清空活动不够”不能无条件推广到创建整只Actor

单独`Item.createDocuments`时，Weapon的`_preCreate`会补Attack，这一点已确认。Core14.368的`ClientDatabaseBackend.#preCreateDocumentArray`对本次创建的文档调用`_preCreate`；读取的Core Actor、dnd5e Actor/NPC创建路径没有逐项调用embedded Weapon `_preCreate`的循环。Actor里的Item由嵌套集合构造。旧活动迁移另有条件，现代装备不能与带旧`actionType`／`activation`的数据混为一谈。

因此，**从目标合集取正式Document，在未保存的数据上准备普通Gear及空活动，再作为完整Actor的items一次创建**，有充分静态理由值得优先验证。这个候选能减少“已创建但没删完攻击”的状态，也更接近Forge当前完整Actor创建入口。

限制：本轮没有实测，不能断言所有模块、迁移、复制路径都不会补活动；需要显式准备Gear标记、数量、穿戴状态及来源，不能期待被跳过的Item创建步骤自动补齐它们。这不是用`noHook`、补丁或prototype绕过系统。本建议也不能绕过正式renderer/workflow或私改最终JSON；可携带的装备清单仍须由正式链产出，目标世界的物品导入归Foundry适配层。

若该候选在精确目标上失败，再选择创建后`deleteActivity`，并保存“本次拥有的哪一件物品完成到哪一步”，按实际读回继续；不应为了每次重试重新添加一套装备。相同Actor的并发窗口也要核对，不能只靠页面内布尔锁。

### 2. 领取恢复Attack不只有“重新取得合集原件”一种机制

`asGear`在来源有效且`flags.dnd5e.gear.preserve !== true`时取合集副本；不采用合集或来源读取返回空值时，保留当前物品副本。来源读取若抛出异常则没有这里的回退保证，不能把权限错误也概括为无害。之后，原生角色表拖入路径仍调用`Item5e.createDocuments`，无活动的普通Weapon会由`WeaponData._preCreate`补Attack。

所以，对NPC上已是普通1d6长矛、只是移除了活动的这个特例，**来源失效不必然意味着玩家拿不到攻击按钮**：回退副本也可能在创建时恢复默认Attack。相反，重新取合集不能保证“当初导入的同一份内容”，因为合集可能已经更新。

可比较两个模式：

- **重新取合集**：沿用原方案；得到领取时的合集版本，适合明确需要按合集恢复标准内容的场景。应承认跨世界、模块禁用／升级、权限变化会影响结果。
- **原生保留普通副本**：使用系统已有`preserve`语义，领取当前普通Item副本，由玩家端Item创建补默认Attack。它有利于保留生成时的装备数据，降低对未来合集内容的依赖；活动复杂的物品不能因此自动判为支持。

两者都没有本轮运行验收。建议先比较这个普通武器特例，再选择实际交付语义，不把`preserve`写成已确认默认值。对非武器、工具、充能或附带施法的物品，不能依赖“系统一定会自动补回所有使用功能”。

原生跨Actor拖拽默认是复制，不能把“玩家得到了普通武器”扩大称为“完整战利品领取及扣减”：NPC库存是否减少、重复领取是否受控是另外的问题，当前方案未实现，也不应顺带扩大本轮任务。

### 3. 合集来源可以正式建立，但当前核对不足以证明保存正确

Core14.368的`WorldCollection.fromCompendium`在传入真实合集Document时正式填写`_stats.compendiumSource`，并处理ID、ownership等导入字段。这个入口比手写来源字符串可靠。匹配时应确认目标是对应规则／变体的顶层Item，不要用另一只NPC内的定制Weapon充当普通装备源。

固定版本的官方YAML还能补充上轮MCP接口没有返回的来源证据：角斗士长矛指向`dnd5e.equipment24`；牧师硬头锤、圣徽、链甲衫的原始来源指向PHB装备包。这证明官方原始资料确实使用该关联，**仍不能证明本机已安装条目的运行时关联完全相同**，也不能直接复制这些指针作为Forge匹配结果。

目前Forge `runtime.ts:itemSemantics`没有核对Gear数量、Gear标记、普通装备穿戴状态或`_stats.compendiumSource`。因此“现有读回通过”并不能覆盖装备正确性。需在本模块新增对应语义核对，按Item身份检查，不把所有`_stats`都盲目纳入比较。

标准JSON导出`exportToJSON`默认保留来源；`toCompendium`默认`clearSource:true`会递归清除来源。二者不能统称为同一种导出。跨世界保留UUID也不代表对方实际拥有同一合集。单件Item重新创建会触发Weapon创建逻辑；普通页面刷新不能据此推断会补Attack。完整Actor复制／重导入应按具体入口分别验证。

### 4. AC结论成立的范围比“真实装备不改变怪物”窄

当前renderer将AI的AC写成数字，parser将数字映射为`flat`；固定系统代码在该模式下直接取flat值后返回，普通盾牌不会再加2。本次角斗士16、牧师13有可行基础。

但仍有三个缺点：

- flat模式保留定值，也意味着卸下盾牌／盔甲后AC不会自动下降；该模式也跳过原生AC加值计算。这是既有定值策略的取舍，不能包装成完整动态装备计算。
- 普通护甲的潜行劣势处理发生在flat提前返回之前；可转移Active Effects还可能直接改变AC基础字段或其他属性。单独核对保存的flat数字不能证明最终显示和角色状态都未变。
- 物品是否穿戴需要明确。`preCreateEquipped`只在输入没有equipped字段时按NPC设置；真实合集物品通常已带`equipped:false`。不能宣称“导入NPC就自然全部穿上了”。

建议最初候选只涵盖已检查的普通物品，排除未处理的Active Effects和特殊活动；明确作为物品库存还是同时作为穿戴物，并读回实际prepared AC与存储值。无需为此扩展完整战斗验收。

### 5. “装备匹配”本身仍是新能力，不能附带塞进Spell Resolver

当前`CanonicalMonster`、AI输出协议、renderer、parser到Actor生成确实缺少完整Gear清单通路；`actor.items = newItems`目前主要承接特性、动作和施法。项目拥有独立Item生成器，不等于怪物Gear已接通。

最小合理归属：AI／模型保存名称、数量、明确限定与需要的Feature关联；renderer、parser、workflow保留清单；Foundry侧匹配真实Item、准备装备数据并读回。Spell Resolver只可借鉴来源清单、归属和冲突处理的机制，不承担装备语义。

需要补齐的匹配约束包括：规则版本、同名包、双语名称、变体、明确的+1／银制／充能限定，以及圣徽这种泛称是否足以选定具体品类。暂时没有证据支持“名字近似就可自动选第一个”。不能在源写了特殊限定时换成普通物品再显示完成。

装备后置导入还会改变完整Actor快照及现有按items核对的结果。可携带的生成依据、目标世界选中的合集版本和实际交付物品应分别可核对，不应把世界水合结果伪装成原始生成产物哈希，也不能只把额外Item从核对中排除来获得通过。中断、刷新、重复确认和已有Actor复用都要与所选创建策略一致。

### 6. 特殊装备目前不宜纳入支持承诺

固定5.3.3的`asGear`仍有未复制enchantment rider activities/effects的TODO。外部当前Issue已关闭，不能据此把后续修复回推到固定5.3.3。

带附魔、充能、施法或其他活动的物品，简单删除Attack可能留下第二套使用入口；清空所有活动则可能删除必要功能。两只普通样本不足以决定这些情况。宜保留AI原有限定并在Forge列出未完成项，继续交付怪物，不自造替代品，也不称这些装备已经录入完成。

## 替代方案比较与建议

| 候选 | 主要收益 | 代价／判断 |
| --- | --- | --- |
| 完整Actor保存前准备普通Gear，NPC装备无活动 | 有望减少数据库步骤和中断状态，匹配现有完整Actor入口 | 需精确目标验证，显式处理Gear／来源／穿戴；建议优先核实。 |
| 原方案：创建装备后逐项删除Attack | 正式API清晰，可处理事后追加 | 多步状态、重复攻击窗口、并发及重试成本；保留为候选。 |
| 仅显示名称／链接，或把武器改成loot | 开发成本低 | 不能等同真实weapon／equipment及原生使用；不建议作为本次目标的完成方案。 |
| 改怪物攻击为Weapon，或用全局Hook隐藏／拦截攻击 | 可复用官方NPC模式或隐藏重复入口 | 改变既有Feature要求或扩大影响面；本次不建议。 |

我的建议是保留Feature／Gear分工，先收窄普通装备候选，再分别验证“Actor一次创建”和“原生保留副本领取”；不要先把多步删除流程和依赖合集恢复领取固化成必需架构。若前者不能成立，再采用有明确归属与恢复能力的原方案。以上是评估意见，未选择或实施任何候选。

## 后续候选的复查步骤（待另行授权，本轮未执行）

1. 用一个普通长矛及固定系统验证完整Actor创建是否保持零活动、Gear／数量／来源是否保存；比较单件Item创建和刷新。若一次创建成立，再决定是否仍需要事后删除阶段。
2. 在原生NPC到临时PC的拖入路径比较有效来源、来源不可解析、preserve三种情况。核对普通1d6、quantity3及可用Attack；区别复制与真正移走。不用“缺源一定损坏”或“肯定可恢复”替代读回。
3. 装备清单正式接通后，角斗士与牧师各含一次真实AI处理；确认清单来自AI而非程序扫描或手补回复。冻结回复只验证后半段。
4. 核对Feature原数值不变、NPC无第二套攻击、六项Gear数量／来源／穿戴及实际AC、刷新、重复提交／中断恢复；未匹配／特殊装备明确显示未完成并保留Actor。复用狮子和无关玩法的既有证据。
5. JSON标准导出／再导入与失效来源各做窄检查；导出支持口径按所选路线明确，不增加通用战利品平台、全局Hook或完整战斗测试。

## 证据定位与外部一手材料

以下源码均为固定提交`965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，不是浮动master：

| 事实 | 来源 |
| --- | --- |
| Gear设置、asGear、preserve、来源克隆、特殊附魔TODO | [physical-item.mjs:239、309、349](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/item/templates/physical-item.mjs#L239) |
| 单独创建Weapon自动Attack | [weapon.mjs:578](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/item/weapon.mjs#L578) |
| 活动迁移条件、hasAttack、isActive | [activities.mjs:82、123、228](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/item/templates/activities.mjs#L228) |
| flat、natural、盾牌、潜行劣势处理 | [attributes.mjs:148](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/actor/templates/attributes.mjs#L148) |
| 原生拖入、默认复制、asGear后创建Item | [base-actor-sheet.mjs:1636、1819](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/applications/actor/api/base-actor-sheet.mjs#L1819) |
| 原始官方NPC装备来源 | [角斗士YAML:553](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/actors24/humanoid/gladiator.yml#L553)、[牧师YAML:557](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/actors24/humanoid/priest.yml#L557) |

Core14.368本机文件：`F:/FoundryLab/foundry-v14/app/14.368/client/data/client-backend.mjs:76`，`client/documents/abstract/world-collection.mjs:109`，`client/documents/abstract/client-document.mjs:431、928、1044、1108`及`common/documents/actor.mjs:152`。前三份源码SHA-256依次为`8ffe114bca601980bf2f4582ce1f6e27c555d76586470f1a16ac23f6f021b9c5`、`40c6f46a690ca563cbfa1cbfe19ea90328559534e844bcb23a229e7cc50559e8`、`a007180e3cf8d465dffe43b11272f289b4cf77a9e301c7d431f48267dfad8e9e`。

项目事实位置：`packages/models/src/canonicalMonster.ts:155`；`packages/intake-ai/src/provider.ts:296`；`packages/intake-ai/src/renderer.ts:80`；`packages/parser/src/mapping.ts:49`、`yaml.ts:289、769`；`packages/generation/src/actor.ts:572、656`；`foundry-modules/fvtt-json-forge/src/runtime.ts:152、237、607、624`。

公开检索使用AnySearch，先发现code子域，再混合检索官方Issue与实现；code.snippet一次返回服务暂不可用，通用检索与原文提取成功，无须改用其他搜索通道。读到的一手材料：

- [#6909](https://github.com/foundryvtt/dnd5e/issues/6909)：用户在Core14.359／dnd5e5.3.0实测，NPC附魔皮甲拖到PC后变成普通皮甲；取消Gear仍发生。维护者归入5.3.1并通过#6917修复非Gear仍转基础品的问题。固定5.3.3源码已有非Gear提前返回。该案例支持必须检查领取结果与保留语义，不是宣称5.3.3仍有同一个已修缺陷。
- [#6867](https://github.com/foundryvtt/dnd5e/issues/6867)：用户提供embedded Item来源导致NPC表打不开的实际错误，维护者确认第一项为系统问题，第二项属于Babele转换器；归入5.3.1修复。本地固定提交包含对应修复提交。它说明来源形态和本地化转换会影响行为，不支持把所有同名UUID都当等价来源。
- [#6357](https://github.com/foundryvtt/dnd5e/issues/6357)：维护者讨论附魔riders与活动耦合，贡献者给出关联失败经历；该项在2026-10-21由#7389关闭。固定5.3.3的Gear代码仍有TODO，当前Issue状态不能升级本项目的版本承诺。

外部材料改变了对领取／特殊装备风险的判断，没有证明本方案在Mirror运行通过。本轮机械检查为引用缓存验证、版本／源码／既有证据读取及工作树文件哈希复核；原有23份文件结束复核全部与开始时SHA-256一致。未运行产品测试或新增运行验收。手册入口、支持版本和用户操作步骤未改变，未刷新手册或生成页面。
