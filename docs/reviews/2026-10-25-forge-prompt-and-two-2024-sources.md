# Forge提示词收口与两例2024来源

本轮授权与当前执行见[唯一当前状态](../plans/2026-10-20-forge-ab-current-state.md)。沿用`20261019-forge-ab-fixed-replies`，不合并或推送。AI负责内容理解，程序只验结构、身份与转换／保存保真；不将本次人工对照重新编成自然语言校验器。

## 提示词结论与实现

旧默认完整IR提取同时要求Line／Clause目录、精确引文、逐字段claims与空白覆盖；还夹有未提供的sourceInventory／FEATURE阶段上下文。它们增加格式负担，部分旧语句甚至要求AI在缺少字面Shared／each时强制把明确的选择式施法改为手动，与当前职责不符。实际当前结构支持claims／coverage为空。

默认提取、复审、修复统一共用紧凑完整IR说明和一种exact-quotes协议。source仅发送一次，候选仅发送程序范围；不附旧目录，不重复整段candidate.quote。保留完整能力、独立／共享资源、受支持基本操作、GM后果、固定AC／普通装备省略、2024区域及闭合结构。历史Line／Clause读取和显式分步协议保持兼容，不借此迁移旧Actor。

独立复查定位两处真实协议不一致：复审引文定位漏传candidate范围，当前候选内唯一但跨候选重复的引文会误报；reuseOf要求身份／profile／restrictions相同，提示却允许不同限制。前者补传范围并以跨候选重复句回归；后者对齐现有结构，不同限定使用独立的受支持at-will组，不使用reuseOf。没有放松引用唯一性或引入新的法术推断。

提取system文本原为52,035字符，最终v48为16,487字符；精确数字见私有证据prompt-after-v48.json。这是字符与请求UTF-8字节测量，不是模型token、成本、速度或质量结论。真实两例与原生保存接受另行记录，单元测试不替代它们。

v47中文首答实际把中性攻击猜为mwak／rwak，并给有时限的麻痹填写flat native-with-gm＋appliedConditions。前者是AI理解／表示错误，不能称校验误报；后者被结构层放行，却在正式生成器的已有限制处报InvalidMixedFeatureBoundary，退回全Utility候选。这是程序支持组合检查的缺口。仅补结构组合检查，不从原文代改武器分类或状态。

据该失败，默认新回复进一步统一为SourceOP表示所有基本roll，移去同时提供的扁平机制字段及appliedConditions写法；历史扁平输入读取保持，未放宽生成器的混合效果限制。中文近战／远程攻击检定明确采用neutral类型。首次失败原件保留；只为中文再做一次新prompt提取，不重做有效Mage。多表示路径是已核的提示设计负担，但未把一次模型结果归因为已证明的模型因果关系。

## 来源、版本和输入边界

|样本|依据|实际输入与版本反证|
|---|---|---|
|英文Mage|[官方SRD5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)第305页；[官方新版Mage条目](https://www.dndbeyond.com/monsters/4831023-mage)|实际输入取PDF左栏Mage完整连续区段，截图核到下一条Archmage前结束。HP81、Arcane Burst3d8+3、Protective Magic3/day等区别旧版；不用网络抽取中的乱码代替原文。|
|中文高等星之子使者|CHM《鸦阁魔域：魔障深藏》第五章条目；[官方书目](https://www.dndbeyond.com/sources/dnd/rthw)、[官方介绍](https://www.dndbeyond.com/posts/2169-everything-you-need-to-know-about-ravenloft-the)、[官方商品的5.5e标识](https://marketplace.dndbeyond.com/BB-Ravenloft-WK15/6015000?pid=DB6015000)|选用Ravenloft: The Horrors Within2026修订规则条目，HP304、Coagulated Nodule、12d8胆汁、传奇动作3／巢穴4；2021同名旧条目为HP290、Psychic Orb、10d10等，不用于生成。付费新版英文全文重定向至商品，未逐条独立核对英文全文。|
|现有呓语之口|[官方Monster Manual模块](https://foundryvtt.com/packages/dnd-monster-manual)；本地dnd-monster-manual1.3.0 manifest的MM2024来源与actors合集|正常运行API只读找到“呓语之口 Gibbering Mouther”，UUID为`Compendium.dnd-monster-manual.actors.Actor.mmGibberingMouth`，system.source.rules=2024。读取前后世界Actor ID集合相同；不读LevelDB，不复制合集Actor进世界。|

中文来源窄提取自`H:/Download/DND五版不全书26.06.30之你史大锤叔叔一个嘉豪大坐就是一本雷霆大书.chm`中的`鸦阁魔域：魔障深藏/第五章/高等星之子使者.htm`。原entry4136字节SHA256=`b303908de5b6524dfcc5c4f78cdc11a5feef45e2f5c81d347c8f266464f87cd9`，按声明编码解码并只整理段落／表格边界，未改术语、数字或规则。输入UTF-16长度1217，SHA256=`638fec67a7dc3542317e6a45b103b59fed6acd928d19359d864c71e4868ee445`。英文输入UTF-16长度1099，SHA256=`31db7efae81bdd8d10bbbdabdba8d62b6477deb3d080ee06212b142c1e3a78da`。来源原件及付费全文不入公开仓库。

## 预定的真实接受重点

Mage核对AC15／HP81、Arcane Burst近战／远程两模式、法术INT／DC14、Fireball4级、每日each独立次数、Misty Step3/day和Protective Magic两个选项共享3/day。不因标题次数或or关系缺少关键词退化为空手动占位。

中文核对AC15／HP304、全部语言／心灵感应120、两种中性攻击、胆汁射程120／球状sphere30／DEX23／12d8酸／成功半伤、传奇动作与抗性3／巢穴4、完整复活／召唤／先攻／时限。胆汁按失败目标分别召唤已有官方呓语之口，现有固定save-summon自动化不支持这种位置和失败分支，不强行套用；保留完整GM后果，不生成额外呓语之口Actor或错误的旧版加值。

当前Mirror目标14.368／dnd5e5.3.3／cor-cotn；ServerNext独立任务保持。只创建本批可追踪测试对象，完成刷新持久化源读取与完整对照后清理。Marker、候选、原始回复、AI次数、原生读回和清理分别保留；本地通过不等于发布或生产接受。

## 核对与证据

本轮私有证据根：`H:/CodexData/visualizations/2026/10/24/01a16bdb-060b-7bf0-b3bc-6856d049157a/prompt-consolidation-20261025/`。baseline冻结501份既有证据及本地配置引用；新失败和后续修复各留原件。具体真实结果完成后补入本节。

手册核对：Monster Intake与Forge补充当前prompt／资源解释；Item／Species仅共享provider机械代码，prompt与输入／输出／使用步骤／安全边界未变。生物与召唤物及开发检查条目继续保留独立接受层级；不能把本次字符缩短写成模型质量已提高。

### Mage匹配阶段的独立缺陷

首次AI字段与正式JSON、原生创建持久化源通过生产比较器对照，0投影差异、0保存warnings，五项完整规则保留。法术解析器则因世界保存了其他manifest的合法手选记录，在当前Mage的严格预检中误报`/savedMappings/0 UNKNOWN_PREFLIGHT_KEY`；Actor保持pending，不能称已有Cast。

最小service fixture加入另一manifest的合法object／array记录，修复前两例均不能执行水合。修复仅在Resolver的createPreflight按当前manifest的完整logicalSpellRefKey集合筛选局部输入；全局记录仍先验结构，保持原值，当前Review新增映射继续严格校验。没有清空设置、放宽planner或修2014兼容。509项Resolver测试、类型／构建通过，独立只读复查未见其他调用旁路。同一Mage经正常UI解析后自动匹配12项2024 PHB，不再出现旧错误；17个内嵌Item包括五feat与12缓存，12个Cast在刷新后保持。

### 最终真实结果

Mage保留首次有效AI和Actor，中文保留首次v47失败并以v48补测。v48中文的两项中性攻击、胆汁120／sphere30／DEX23／12d8half／recharge5–6、legendary3／lair4、抗性3／4、八项完整规则和全部GM后果均通过源文／IR／正式候选人工核对，创建并刷新后完成实际持久源对照。没有把定时麻痹做成永久效果，也没有把复杂胆汁套成错误的固定召唤能力。

生产readback比较器核原始机制，Resolver生产builder核12个Cast、缓存归属及内容hash；IR投影比较使用限定原生DTO表示适配，NPC XP取实际runtime标量、FormulaField数值字符串按同值核对，水合阶段世界元数据另验。辅助工具曾把可移植生成verifier直接用于已水合Actor、假定分文件仍有外层wrapper及误传父池标志，导致工具失败；仅修辅助层，原始来源／AI／世界Actor没有据此改写，也未重做水合或AI。初始／失败／最终资料与日志分开保留。

总HTTP8=正确provider探针2＋发现3＋提取3；没有review／repair／自动重试。767项选定测试通过，含118结构、28有效冻结投影与509 Resolver。实机验证覆盖真实提取、正式生成、创建、匹配与刷新持久化，不代表每个法术实际Cast或全战斗自动化。清理前原有全部318Actor及其他世界集合来源hash一致；仅两新Actor及唯一取证Macro属于本批清理范围。最终清理／冻结保存收据见本轮证据目录。
