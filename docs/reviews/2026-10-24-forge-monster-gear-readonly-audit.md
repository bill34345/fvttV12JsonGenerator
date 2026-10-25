# Forge怪物装备：MCP只读实查与范围纠正（2026-10-24）

本轮只读调查。用户指出：“也不行，我感觉你根本都没经过实地考察，这个装备完全是一个新功能，是以前我们没处理过的。mcp装假的吗”。此前助手提出“生成无自动效果的装备条目”和“直接匹配并导入合集装备”，都没有先核对Foundry现有数据及项目承接能力，现撤回为既定方案；本轮不实施装备功能，不把这些助手建议记成用户已确认要求。

## MCP实际连接与读取

第一次Mirror `get_world_info`返回Bridge未连接。Foundry30001与Mirror MCP31414／31415／31416服务均在；此前验收记录中Bridge模块0.8.4已启用。本轮只打开已有本地Mirror的GM页面，没有启用模块、改设置或重启服务，随后同一个MCP工具成功返回：

- instanceId：mirror；实际与期望origin均为http://127.0.0.1:30001。
- world：cor-cotn；Foundry14.368／dnd5e5.3.3。
- 读取42个Item合集包，查询两只NPC、五种其他Gear名称与普通长矛，获取两只官方2024NPC和普通长矛完整数据，共13次成功只读调用；另保留第一次连接失败。

因此，MCP已经安装且实际可用；此轮打开本地GM页面后恢复读取。先前没有使用它核对装备，是助手调查不足，不能归咎于工具没有这项读取能力。生产、Next及其他任务页面未操作。

## 实际装备数据

来源：`dnd5e.actors24`，两条目system.source.rules均为2024。这里只把条目当作装备结构的实物样本，不拿整份NPC覆盖当前输入来源。

| 条目 | 实际embedded Item |
| --- | --- |
| 角斗士mmGladiator00000 | Spear：weapon、quantity3、基础2d6、20/60尺；Shield：equipment、quantity1、armor2；Studded Leather Armor：equipment、quantity1、armor12。三项均带gear属性。 |
| 牧师mmPriest00000000 | Mace：weapon、quantity1、基础1d6及动作追加2d4光耀；Holy Symbol：loot、quantity1；Chain Shirt：equipment、quantity1、armor13。三项均带gear属性。Radiant Flame虽为weapon类型，但没有gear属性，说明“攻击条目”和“可携带Gear”不能单凭Item类型等同。 |

角斗士样本AC使用default计算：镶钉皮甲12＋敏捷2＋盾牌2＝16。牧师样本AC使用natural／flat13，即使带已装备链甲衫也不是与角斗士相同的计算模式。不能在未验证前承诺所有怪物统一“只记录装备、不计算”或“导入后自动计算”。当前Forge按来源定值保存AC的策略没有在本轮修改。

普通长矛另取自`dnd5e.equipment24.Item.phbwepSpear00000`：基础伤害1d6、quantity1，含原生Attack活动。它与角斗士自身长矛的2d6／quantity3不同。所以“直接拿普通长矛填进去，再说它不接入攻击”不足以证明不会出现错误数值或重复攻击入口。

Shield、Studded Leather Armor、Chain Shirt、Holy Symbol、Mace均在当前2024装备索引中找到对应项；同名对象同时可在SRD2024和PHB装备包中出现。名称搜索结果不是已完成消歧／版本选择／导入。Shield搜索有截断，但对应基础Shield已在结果内；没有为追求全库覆盖继续搜索。

额外边界：这个SRD2024牧师条目的施法缓存中有Spiritual Weapon，而本次PDF／SRD5.2.1输入写Spirit Guardians。合集NPC不能取代AI对用户原文的处理；本轮没有迁移或“纠正”用户来源。

## dnd5e5.3.3原生Gear机制

只读对照实际系统`F:/FoundryLab/foundry-v14/data/server-mirror/Data/systems/dnd5e/dnd5e.mjs`，SHA-256为`79ca2c817017a27c2fcea11d53d4b2a1b0238fe72e5597dde14197a629e77c4f`。

- 14269附近`preCreateGear`：符合条件的NPC物理Item自动带gear属性；natural类型排除。
- 14341附近`asGear`：标为gear的物品在被领取时有原生转换路径。对支持compendiumGearSource、且拥有compendiumSource并未要求preserve的物品，可从关联合集来源克隆，保留数量；否则克隆当前物品，并支持原生保留名称／效果选项。
- 14379附近`gearPresentationData`：装备展示可使用关联来源及名称。
- 60667附近NPC侧栏、73642附近统计块Gear：使用数量＋gear属性筛选和展示，不是把所有weapon都当装备。

这些是已核实的固定源码事实；本轮没有拖拽物品、领取掉落或执行asGear。MCP的fullData没有返回embedded Item的_stats，无法从这份接口读回证明某只NPC的具体compendiumSource关联。因此不宣称实际掉落转换已通过，也不据此直接设计最终数据结构。

## 项目当前能力

- `packages/models/src/canonicalMonster.ts:155`的CanonicalMonster包含属性、技能、语言、特性、动作、施法等，没有gear／equipment清单。
- `packages/intake-ai/src/renderer.ts`没有装备清单渲染出口。
- `packages/parser/src/mapping.ts:49`与`yaml.ts:289`的items映射主要承接特性、动作和施法；不是“任意装备可以直接塞进items”的完整输入协议。
- `packages/generation/src/actor.ts:574`建立动作／法术等newItems，随后以该集合写入Actor；没有已接通的怪物Gear导入步骤。
- 项目有单独Item类型和装备／武器生成能力，例如`packages/models/src/item.ts`，不能把这项能力等同于已实现“从怪物Gear清单解析、匹配、录入装备”。

准确分类：对当前Forge怪物生成链而言，Gear自动录入是尚未实现的功能；对Foundry系统本身而言，NPC Gear、数量、展示与领取转换已有原生机制。它不是把原有装备导入函数补一处调用即可完成的已证小修，也不应由助手在怪物错误修复中擅自定下新的物品语义。

## 本轮结论与未决定事项

1. 撤回两个未经验证的实施建议，不新增生成装备、不导入装备、不改已生成角色。
2. 保留用户已明确的怪物攻击Feature要求；官方NPC使用Weapon是参考事实，不构成改变用户选择的授权。
3. 装备展示、真实物品／掉落、官方关联、怪物定制数值、AC模式和重复攻击入口需要作为这项功能的明确设计与窄验收对象。MCP已给出可核实的样本和原生机制，实施方案仍未确定。
4. 本轮只执行MCP查询和本地代码读取，没有调用创建、导入、更新、删除、使用物品等写入工具；不新增模型调用，不改代码、设置或hook，不提交、合并、推送。前一批功能修复的未提交改动保持。

完整查询原件保存在`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-gear-readonly-20261024/mcp-observations.json`；事实摘要、来源版本和本轮范围见本页。不进行新角色／装备试写来冒充只读调查。

## 后续方案草案：Feature攻击与真实Gear并存

用户本轮原话：“问题就在这里，我们的攻击是feature，官方的不是。所以你得给出一个解决方案。”这要求提出方案，尚不代表用户同意下述具体实现，也不代表已经允许新增Gear模型调用或运行时写入。本节为助手建议；此前冻结查询原件不变。

### 已补查的接口事实

仍对照上述固定SHA-256的dnd5e5.3.3本机源码，没有改系统文件：

- `WeaponData._preCreate`，77090附近：如果创建时没有Activity，系统自动创建Attack。因而“导入前清空activities”不能单独满足不产生重复攻击的要求。
- `Item5e.deleteActivity(id)`，23830附近：系统提供正常的活动删除接口，并处理Foundry14的删除语义。`WeaponData._preUpdate`、`ActivitiesTemplate.preUpdateActivities/onUpdateActivities`没有补建默认Attack的逻辑。方案可采用创建后调用该接口，再读回；不能把静态可行性说成运行时已通过。
- `ActivitiesTemplate.hasAttack`／`isActive`，18169／18209附近：分别依据Attack Activity及Activity数量判断是否有攻击和可用活动。
- Actor物品拖入路径`_onDropCreateItems`，57486附近：物品来自另一只NPC时调用`asGear()`，再正常创建目标物品。结合14344附近`asGear()`，保留正确合集来源且不启用preserve时，可以重新取得普通武器副本及数量。这是源码支持的路径，本轮没有实际执行领取或拖拽。
- AC计算25930附近：`calc=flat`直接采用flat值；natural继续叠加盾牌等加值。不能把这两种模式混为一谈。装备录入必须保持AI生成的最终AC语义，不能因导入普通盾牌再次加2。

### 推荐实现

1. AI结构化输出单列Gear名称、数量及原文明确的限定条件；攻击仍保留在Feature。程序消费AI清单，不重新扫描原文猜装备，也不根据“长矛攻击”擅自推断携带数量。该清单在正式renderer/workflow中保留，合集UUID只在目标Foundry中解析。
2. Forge匹配目标世界已有的真实合集物品。角斗士的长矛Feature保留+7、2d6+4及近远两种使用方式；Gear另存普通Spear，quantity3，保持weapon类型与合集关联。盾牌和盔甲保持真实equipment，圣徽保持真实loot。不生成替代装备，不把Feature转换成Weapon，也不拿官方NPC的动作覆盖AI结果。
3. 对已经由Feature承担使用行为的物理武器，在本次创建的NPC副本上通过`deleteActivity`移除攻击活动，再读回。先只支持此次证据覆盖的普通装备；带额外施法、充能、附魔或其他活动的装备不一刀切删除，保留待处理提示。合集原件始终不修改。
4. 装备录入不重新推导怪物AC；保持既有AI输出的最终值，读回实际AC。普通装备与Feature的关系由Forge保存明确归属，用于继续未完成的录入和防止重复添加，不以全局监听修改其他Actor或手工加入的物品。
5. 领取装备使用原生Gear转换与关联合集来源：普通长矛恢复合集的1d6基础武器及Attack Activity，数量仍为3；角斗士的2d6+4属于其Feature。无法解析来源、同名候选未消歧或创建后移除活动失败时，Forge明确显示具体装备和未完成步骤，保留已生成怪物，不伪造物品、不把结果标成全部完成。

### 必须验证的最小范围

实施后先以角斗士和牧师验证这项新能力，不重测狮子或扩展战斗玩法：AI实际输出Gear清单；普通物品匹配及数量正确；Feature及其攻击／伤害不变；NPC不出现第二套武器攻击；AC不重复增加；刷新后保持；通过原生领取路径到临时角色后得到普通武器及正常Attack；未匹配项明确提示且不阻断Actor生成。装备录入涉及两次文档操作，应验证中断后继续不会重复添加。这些均为待执行验收，不是已有PASS。

本轮只追加调查与方案文档，没有实施Gear功能、改提示词、调用AI、创建或修改Foundry对象，也没有改hook、提交、合并或推送。此方案针对已核对的Foundry14.368／dnd5e5.3.3；没有推广到ServerNext或生产。
