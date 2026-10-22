# Forge与官方2024法师、成年绿龙对照

状态：完整结构与四项有界原生行为对照、精确清理及最终读回已完成，父控27项证据/保护检查与helper删除后21项读回通过。原Guard事故恢复已核准。本批只比较，不修改产品、官方合集或最终JSON，新增生成Provider请求0；新发现的产品缺口尚未修复。

结论：当前产物缺少官方已有的迷踪步施法/扣次、护身魔法共享施法池，并把Geas施法时间从1分钟错误缩短为1动作；这些应修。官方在本环境也有两项真实问题：毒雾原AC−2效果加入目标后AC仍16，Geas普通施法即提前弹5d10。不能把官方实现一律视为正确，也不能用GM说明文字代替已经安全可做的施法接线。

## 来源与版本

本地Mirror Core14.368/dnd5e5.3.3/Midi14.0.11、80模块；Monster Manual1.3.0、PHB2.1.0。准确条目为`Compendium.dnd-monster-manual.actors.Actor.mmMage0000000000`与`Compendium.dnd-monster-manual.actors.Actor.mmAdultGreenDrag`，两Actor的source.rules均为2024；没有选择dnd5e.monsters中的旧同名条目。与前批同一2024来源生成的Mage fc05b24a7edae217、AdultGreenDragon44ad550ba6dc064b最终实机保存数据比较。

前批已完成原文与自有产物实机验证，但没有完成这两个官方对应怪物的Actor对照；官方PHB Geas和Guard目标不等于对应怪物。前批限定结果继续有效，不升级为官方配置/行为一致。

## 读取方法的实际限制

专用Mirror MCP在打开正常Foundry GM页后连接成功。其get_compendium_entry_full中的fullData并非无损导出：本机foundry-mcp-bridge0.8.4的sanitizeData全局剔除save、key及大多数下划线字段，造成Activity豁免、Cast挑战DC与Effect作用路径缺失；顶层items又是摘要。这不是官方数据缺项，不能据此判断官方未配豁免或AC效果。完整MCP原件及读取源码hash保存在本批证据根，标为有损投影。

已通过正常Compendium公开读取/原生Macro取得两个Actor的完整toObject及prepared摘要（`chrome/official-native-full-export.json`及两份`official-*-full.json`）。没有修改桥的安全过滤，没有请求凭据。桥的create_actor_from_compendium使用同一有损fullData，因此本批不以它创建官方参照。

## 对照准备事故与恢复前置

准备临时Actor时，执行器误用`game.actors.importFromCompendium`；其下游`importDocument`默认`keepId:true`，已有ID且无交互确认时走replace。官方Mage/Dragon的源ID在基线中不存在，新增了两Actor；Guard的源ID`mmGuard000000000`原已存在，故其名称变为本批前缀，8件装备被替换为默认3件。发现后尚未使用业务能力，立即停止世界写入；该Guard不属于任务对象，不能清理或用合集默认数据冒充原件。

正常服务器读回确认覆盖确已持久化。原世界只有B9梵卓堡`cKaWIFd71zsxeQJv`的24个Token引用该Actor，已保存其完整Token/Delta；这些Delta不用于猜测原WorldActor全文。

只读取原有SST与`003751.log`，未打开数据库、未加锁、未复制数据库、未直接编辑数据、未停服务。按bundled LevelDB1.20格式校验CRC32C、Snappy、WriteBatch计数；WAL201片段/100批次无尾残，Guard的12条写操作全部属于事故批次309406，主记录sequence309417。按严格`sequence<309406`重建Actor主记录及其有序8件Item，Actor/Item effects均为空；另一个只读解析器逐值复核一致。CURRENT/MANIFEST确认有效表正是所读四SST、当前WAL3751且prevLog0。原名称`警卫 Guard`、HP11/11、folder/ownership/prototype/flags与装备ID均有原始记录依据。恢复DTO与来源在`recovery/guard-preincident-wal-reconstruction.json`和`guard-recovered-source.json`。

纯内存构造曾原位改变传入DTO，初版报告在构造后才存输入而误称零差，导致写前SHA守卫拒绝，未进入世界更新。实际原因已用Core14.368源码和只读反证确认：已有`core.prototypeTokenOverrides.npc.disposition=0`，客户端构造会把原stored−2投影为0；−2本身是合法SECRET，不是错误数据。完整原件不改，深拷贝迁移/清洗保留−2；临时模型dryRun生成的ForcedReplacement亦保留−2，世界/原件不变。仅正常客户端预设投影作为准确预期，不能把0冒充原始存储值。

随后执行唯一一次正常`Actor.updateDocuments`完整替换（同ActorID，未删除重建）；恢复批309418、主记录309429。新增WAL实读203片段/101批次、CRC/计数完整，原名称/ID/八Item顺序/全部业务/原stored阵营−2均精确一致，`businessDifferences=[]`；实际元数据差单列，只允许六个Core受管理`_stats`字段，不忽略业务字段。证据`recovery/guard-restored-persisted-readback.json`。页面结果导出一度超时，未据此重放恢复；父控随后核9项原生+7项持久化检查和原24Token全文精确相同，`recovery/parent-restoration-review.json`保留原件。后续实际施法全部使用随机新Guard `BL6RiYIQ289SXGcC`及Token `q81NmMDoiJmdTU4d`，原Guard不再作为靶子。

## 结构与实机对照结果

| 对象 | 官方当前配置 | 我们当前配置 | 目前能下的判断 |
| --- | --- | --- | --- |
| 迷踪步 | 独立能力Item3/日，真实Cast引用PHB2024 Misty Step，附赠动作，配置消费本Item1次；本次正常父能力施法确认后synthetic池3→2，护身魔法仍3 | 只有说明按钮与完整GM文字，Item3/日，无原生施法连接，手动计数 | 官方可用的施法与扣次确实未接入当前产物。前批手动改数保存通过只证明计数UI，不能说明该能力完整。本次未自动移动Token，不夸称自动传送。 |
| 护身魔法 | 同一个3/日Item里法术反制和护盾术两个反应施法入口，均指向该Item次数池；本次从父能力施放护盾一次，共享池3→2，迷踪步仍2 | 只有说明按钮和完整GM文字、3/日手动计数 | 官方的施法与共享扣次确已验证，当前产物没有承接；不能把完整留GM等同于保留这些能力。法术反制分支仅核配置，未另用一次。 |
| 毒雾 | 90ft/20ft球/2d6毒素/成功无伤害，并链接AC−2效果；实际一次use放置模板、伤害2d6=5、传奇消费1均通过。Guard自然CON12失败，GM从同卡应用原效果后AC仍16 | 已验证相同落点/模板/伤害/传奇消费，AC−2及期限手动 | 官方当前AC效果没有降低目标AC，不能照抄；模板/伤害/消费可借鉴。到期未推进回合验证，不称其正确自动到期。 |
| Geas条件伤害 | 官方父能力正常使用一次，目标未Save/未Charm即自动弹5d10心灵伤害；缓存是同一个豁免活动含5d10及魅惑 | 原Cast1/日保留；缓存分成Save与独立GM条件伤害，前批实际施法不提前弹伤害 | 官方在同环境也有提前伤害问题。我们的条件伤害分离适配需要保留；本次已取消5d10，未掷/未ApplyCharm/未扣HP。 |

另见施法覆盖差异：官方法师Spellcasting有9个Cast，当前本项只有Cone of Cold/Fly两个真实Cast，其余完整保留为GM文字；官方绿龙Spellcasting有3个Cast，当前只有Geas真实Cast。该事实不能用‘正式链通过’掩盖，具体遗漏/保守降级原因与本批三个重点分开列明；本批不先改代码。

完整原件补充：官方毒雾效果changes使用`system.armor.value`加−2；当前dnd5e5.3.3 NPC AC实际由`system.attributes.ac`计算，另配置turnStart到期与原文“目标下一回合结束”不直接相符。已正常从同卡应用原效果一次，实际enabled效果存在而目标AC16→16，证明本环境该AC减值未生效；并非仅据字段名判断。

毒雾实际证据：Region`3yO6vJI0x3lEvcwO`的circle中心1100,900、半径400.00002px，grid100px/5ft等于20ft；新Guard中心1050,850在范围内，龙中心250,950在范围外，落点距龙不足90ft。关联原Activity准确，唯一伤害消息`zygy2BFm3jFVtWzY`为2d6=5；唯一Save`nZEjMYTm9PkMi8gT`为fresh Guard的1d20+1=12，失败于17，没有改骰/第二Save。GM从原聊天卡应用效果`XVlV4nAsxpNDwzru`，原payload未改，enabled、−2加值、turnStart/1turn均读回，目标HP13/AC16不变，龙传奇spent始终1。父控已读三阶段JSON及伤害提示图；模板初始预览图不冒充最终放置图。证据`noxious-after-template-and-damage-before-save.json`、`noxious-after-single-save-before-effect.json`、`noxious-after-official-effect.json`。准备中误开未提交的请求掷骰窗口不计roll，失败截图保留；一次导出工具超时仅补读已有报告，未重应用效果。

## 新确认：Geas施法时间被错误缩短

官方提前伤害的实际反证：使用前`geas-before-cast-source-preflight.json`确认原缓存仍是单一MidiSaveActivity、5d10与Charmed未被当前resolver维护适配，目标没有Charm。唯一一次从父Spellcasting Cast确认使用，立刻出现5d10心灵伤害提示；`geas-premature-5d10-prompt-dom.json`/PNG留全。父控已实际看图，确认原父行显示1分钟、0/1和5d10配置。正常取消该伤害提示，未进行Geas Save、Charm、伤害掷骰或HP应用；不以官方同样有问题推翻2024原文的未来违令条件。

官方Geas Cast的activation.override=false，缓存法术基础施法时间为1分钟；当前生成Cast覆盖为1动作。已通过AnySearch查找并读取[2024官方Basic Rules的Spellcasting段](https://www.dndbeyond.com/sources/dnd/br-2024/how-to-use-a-monster#Spellcasting)：其“Casting Times of 1+ Minutes”明确规定，列在怪物施法动作里并不自动缩短长施法时间，必须由动作描述另行说明才可例外。成年绿龙原文没有这种例外，所以本项**官方正确，我们的一动作覆盖错误**。这不是GM手动条件伤害边界，应修生成/绑定时对基础施法时间的覆盖。原首轮、冻结回复和此前有界Geas结果全部保留；之前无提前伤害/正确扣次的证据不能证明施法时间也正确。本批只对照，不先改产物或代码。

调研边界：先发现gaming子域，仅有电竞/Steam不适用，遂走公开检索；Sage Advice不是本项时间问题的直接依据。绿龙页面用户评论只用于发现反证线索，最终结论依据上面的官方规则正文及本地完整Actor/源文，不以评论当规则。完整检索正文保存在`rules-2024-how-to-use-monster-extract.txt`。新候选复查：若新怪物原文明示缩短时间，核准确例外后单独覆盖；否则继承所选2024法术时间，不能统一按动作栏写action。

基础数值对照：两怪物六属性、HP/公式和CR相同；Mage HP81/18d8/CR6、AC15（官方由法师护甲效果计算，当前为flat）；Dragon HP207/18d12+90/CR15、AC19（官方natural，当前flat）。Mage施法属性INT，Dragon CHA一致；Geas目标豁免是WIS17，不能把施法属性与目标豁免属性混为一项。

这里比较的是WorldActor/原件基础数值。实际本批Token创建后、使用前，Mage synthetic HP已是77（World81），新Guard synthetic13（World11）；原因未调查，不把它归因某模块，也不为对齐数值改HP或重做fixture。各次业务HP保护使用各自before；基础数值一致不能推广成Token所有派生值完全一致。迷踪步从父能力`mmMistyStep00000`使用一次，消息`uiLJNK5U8MEYyrL5`无roll，synthetic spent1/protective0；World父池均spent0是未链接Token的独立状态。证据`chrome/misty-after-native.json`及`misty-cast-prompt.png`，父控已实际读取JSON并查看提示图。

护身魔法通过正常展开可见父项、点护盾术分支一次，消息`cqtnbYjoeFnEXgs2`无roll，synthetic护身魔法spent1、迷踪步spent1；World两池仍0。父控已读`shield-after-native.json`并查看`shield-cast-prompt.png`。此时Mage AC仍15且仅有原法师护甲Effect；没有自动获得Shield的+5AC，不能把这次施法/共享扣次通过扩大成护盾效果自动结算通过。没有追加攻击或改AC测试。

## 终态核对与修复边界

最终业务原件`chrome/final-business-before-cleanup.json`，at2026-10-21T07:40:42.783Z：三临时WorldActor与三syntheticActor、ownedScene/Region、五消息全文/骰式、原Guard与24Token、原activeScene/Combat/模块及checkpoint完整保存。父控独立27项读取断言通过，并实际查看迷踪步/护盾扣次、最终Region+Guard+伤害5/Save12、Geas提前5d10五张关键图。Geas取消后synthetic每日spent1、World仍0，新卡`U7GFRkDO2AuPmbSe`无roll；目标无Charm/HP13保持。五消息只有两roll：毒雾2d6=5与Guard CON12，未掷Geas伤害、未做Geas Save/Charm/HP应用。独立CON Save没有自动回填Midi卡片完整结算，不把本批称为毒雾全部自动结算；回合到期未执行。

后续修复应补通用施法绑定及时间继承：先接有完整来源证明的迷踪步、护身魔法共用池，保留2024法术身份、施法属性、次数、恢复和反应资格；其他9对2、3对1清单逐项确认原文支持，不凭数量补造内容。默认继承基础法术的长施法时间，只有来源明确说明替代时间/动作才覆盖，不按“动作”分栏统一写1动作。原Geas条件伤害仍由GM按全文、违令及每目标每日限制主动处理，保留当前兼容适配。

毒雾AC不能复制当前官方错误字段；须对精确版本Actor的固定AC/装备计算AC分别确认正确作用与期限，实际通过后才启用相应自动化。未安全处理的部分完整留GM，不能用删字段、放宽来源校验或提前自动伤害来补通过。

本轮382份冻结证据、2份正式包、16个源码文件SHA逐一保持，证据`comparison-protection-readback.json`；不重新记首轮1/3。无源码变化，未改用户入口/支持版本/操作步骤或安全限制，不重复代码测试/全仓CI/handbook构建。新增文档只记录对照、真实失败和下一步边界。

本次对照包含误覆盖恢复和浏览器/取证脚本故障处理，不能拿整批耗时衡量生成速度或声称减少人工。新增生成Provider请求为0，代理聊天开销没有按Provider生成token计入或冒充已测节省。所有工具层失败保留：大取证窗口之后持续读取超时（确切根因未证），同页正常重载后恢复；额外Workflow重建诊断对独立Save报错后整段移除；清理主体完成后因`Scene.view()`遇loading直接返回、随后动画读取空dimensions报错，以及使用本版不存在的User目标API而中断回执。后半段只按Core14.368已核公开`canvas.draw(original)`队列/ready检查/同步pan修复视图与回执，不重放删除或任何能力。精确删除主体的四类operations及原保护读回已保存`cleanup-current-after-applied-deletes.json`。

最终`chrome/final-live-after-helper-delete.json`（07:57:43.617Z）21项全通过：原318Actor/180Item/94Macro/67Scene/7activeToken/10Combat/80模块/1239消息、原Guard八Item业务与24Token全文、原Scene/Combat、time/paused、checkpoint229原SHA、原视图2600/1700/.5、空control/targets均恢复。仅五任务消息、三个任务Actor、三个Token、测试Scene/Region、唯一helper被删除，原Guard明确排除；正常API不能逐字恢复的受管理_stats旧值已另存，不宣称其无变化。`official-owned-tab-close-receipt.json`确认只关闭owned651348168，四个其他页面全保留；`final-service-readback.json`实读PID8712、127.0.0.1:30001、原data/world均正确，无服务重启/生产写入。

父控终态再核19项通过（`parent-final-restoration-review.json`）。初版只因baseline把viewedScene与坐标分开保存、终态将sceneId放在view内而报比较格式不等；原fail收据保留，严格合并同一baseline的场景ID与坐标后逐值相等，未重跑业务或更改现场。最终汇总`final-receipt.json`明确标记“对照完成但存在已知产品失败”，不把清理通过称为新缺口已修。

证据根：`.local/forge-official-2024-compare-20261021/`。对照、原Guard业务恢复与本批对象清理均已完成；产品缺口按上述边界待下一阶段实施。来源规则、数字、条件和版本差异优先按原文解释，不把官方实现无条件当作规则正确的证明。

## 后续实施（同日，独立于上面的冻结对照批）

用户继续授权后，父代理直接修复每日施法连接、父能力每日池、法术等级及Geas长施法时间继承，复用同一份冻结来源完成正式链和受影响Mirror原生操作；该修复不追改上面的对照事实或原首轮失败。完整进度、0新增生成请求、保留GM边界与终态检查见[当前MD](../plans/2026-10-20-forge-ab-current-state.md)。
