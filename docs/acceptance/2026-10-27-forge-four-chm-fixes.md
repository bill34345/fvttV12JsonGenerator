# Forge 四怪首答问题修复与配置验收

状态：三处代码修复、定向离线复验、Mirror正常创建/配置/刷新核对和精确清理均已完成。沿用原worktree及`0da71b2`，保留首答测试记录和全部原件；本轮新增生成模型请求、Use/Cast、投骰及消息均为0，未提交、合并或推送。相位蜘蛛的中毒/麻痹Effect缺口只做实际核查，未列为已修复。

用户原话：“先把这三处修掉，沿用当前 worktree，用本批冻结材料复验，不新增模型请求、不重跑已通过的测试。尤其是狂战士，不能再把内容格式问题当成‘AI没正常返回’来拦截整只 Actor。”

用户另明确：“这些攻击鉴定你都不需要去真实投掷”“你要验证的是 activity 里面是否有对应的动作，点开来之后里面的效应是否与文本一致”“也要看一下中毒、麻痹这些触发条件是否在 effect 栏位里面”。本轮执行方式据此改为Activity/Effect及正常配置窗口核对，实际攻击、伤害、豁免和施法投骰为0；原投骰记录作为历史证据保留，不重复。

## 本轮改动与最小复验

- 接收：Actor的完整回复先交给既有接收整理层，不在transport用JSON内容格式否决；Item/Species保持原契约。新增定向接收测试只验证这条改动、真实未完成/空答与独立消费者边界。狂战士保存材料是截断失败取证摘取，合成completed回放与真实首答结果分开记录。
- 施法：沿现有usage group/portable manifest传递长休与短休恢复，缺省仍兼容day；现有Cast升环适配增加完整中文“X环版本”，不依怪物或法术名特判。新增定向测试验证同一冻结夜鬼婆从provider到Actor、真实Cast builder和受影响原生缓存投影；正反例围绕新增恢复/升环表示，不重跑旧大组。
- 类型、架构、局部anti-overfit、Forge/Resolver构建及手册一致性按实际修改范围检查；这些检查仅覆盖被本次改动影响的输入，不重开46项或四怪首答模型测试。
- Mirror复用已保存回复/新正式生成资料，检查正常创建、法术导入、Activity伤害/加值、Cast环阶与恢复、Effect栏及关联、刷新后保存；只打开配置，不调用use/roll，不创建战斗或推进回合。

相位蜘蛛Effect只读结果：原生成Actor及Mirror保存Actor的根Effects、Bite Item Effects均为0，攻击/伤害Activity的effects均为空。降至0→稳定→中毒1小时→中毒期间麻痹仅在说明和manualRule中，不算Effect完成。当前sourceOperation没有明确状态生命周期字段；本次将核对并报告该独立缺口，不把普通命中套用中毒/麻痹作为修复。

原件根：`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-chm-first-pass-20261027/`。

本次证据根：`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-chm-fixes-20261027/`。

## 实现与离线结果

Actor的`extractAnswer`启用transport内部内容解析延后，正常完成的回复进入既有provider；外部请求体不变，Item/Species和默认transport仍使用各自契约。provider只补完全确定的末尾对象/数组闭合标点，保留原始回复及前后hash、附加标点记录；未结束字符串、缺值等不猜补。真实空答、缺completed终帧、请求失败有各自原因，不能把内容语法笼统写成AI没有返回。

狂战士保存摘取文本通过合成completed输入进入真实provider→BrowserAI→generation，输出完整2项能力的Actor：AC13/HP67，巨斧检定`1d20+5`、挥砍`1d12+3`、浴血狂怒原规则保持。`candidateAvailable=true`、`formalStatus=needs_review`，导出Actor严格等于response artifact，规范来源hash一致。`berserker/receipt.json`明确标记`SYNTHETIC_COMPLETED_INPUT_FROM_TRUNCATED_FAILURE_EVIDENCE_EXCERPT`；真实旧请求没有重发、原终帧仍不可得。这证明当前接收与生成能处理该摘取内容，不把旧首答改记为成功。

法术次数组新增可选recovery，缺省day保持旧记录含义；入口只从该usage已关联的明确“恢复次数/休息后才能再次施展”引文整理shortRest/longRest，保留显式值、次数和共享关系。renderer与portable manifest沿用同一值，独立Cast、共享/单法术父池及hydrator映射day/sr/lr。中文完整X环版本与英文level N version复用Cast环阶投影，显式castingLevel可用于随意/天生施法；未知附加文本仍保留，未引入按怪物/法术名的分支。

夜鬼婆原冻结首答走真实provider与正式生成：原8项能力、整个Actor system及不相关Item与旧产物一致，12条法术保留；六项Coven Cast各max1、recovery lr，Magic Missile固定level4，Dream1/day、Phantasmal Killer及Plane Shift各2/day、仅自身限制保持。原始V50回执未改，新代码提示版本为V51；本轮没有新模型调用，不能宣称新提示词真实首答表现已验。

验证记录：

- 接收定向组12项通过；恢复归一经下述反例修正后只复验其单测试，1项/136断言通过，11项其他测试过滤。Item/Species实际拒绝坏JSON及正常空答/未完成响应的有效证据复用。
- 施法定向文件10项分批完成：首轮6项通过（含真实冻结夜鬼婆）；4个新人工fixture遗漏法术名称引文，触发现有portable引用诊断，保留失败日志。补齐这些人工fixture自己的来源/引文后，仅4项恢复投影复验通过，其余6项过滤，原始四怪材料没有修写。后续恢复判定改动只带跑受影响的4项；不重跑已通过的中文升环、夜鬼婆或其他入口。
- 独立审查发现恢复归一可能把“持续至长休”误当恢复，以及“1/日”“不会在长休后恢复”反例。已收紧明确条款与否定处理；独立只读复核关闭该P2，没有增加拒绝、额外审核或新框架。
- intake、generation、browser-runtime及Resolver受影响类型检查通过；13个生产文件的局部anti-overfit分两组检查通过；架构依赖/环检查通过。Forge和Resolver构建通过，只有后续恢复否定修正使Forge需要再次构建，Resolver构建结果直接复用。
- 手册8项按实际共享影响人工核对，33项页面生成/一致性检查通过；未缩小watch。

本批安装通过既有精确本地Mirror安装器，16个Forge文件/9个Resolver文件按hash比较，仅写变化项，无删除、备份、世界直接写入或服务重启。Forge脚本`445f278c61c1a3b2d05d05946e227086afc9eb78817daa356839fa179e474856`，Resolver脚本`d78cccc7edaf018a46771aba02a453e6121fde2549c39f1401c59328f7e75364`。原46项候选脚本`77a6de43...`仍在历史证据目录，未覆盖。

### 实机暴露并补齐的计划器限制

第一份Resolver候选使夜鬼婆保留8个基础Item、Forge导入标记verified，但法术仍pending。正常报告明确列出六项`UNSUPPORTED_CAST_USES`，不是无响应或Actor创建失败。实际owner `src/core/spell-resolution/planner.ts`还保留了day-only条件，先前只测Cast builder未覆盖这个下游环节。

已让真实计划器接受manifest已有的day/shortRest/longRest。新增定向检查使用本轮完整manifest与上一轮实际Mirror读取的12条法术来源元数据，验证真实`planSpellHydration`给出12项完整计划；longRest使用未改的真实新产物，shortRest/day为明确标注的兼容变体。19断言通过。旧“长/短休应该被拒绝”的两条断言改为接受正确恢复，定向2项/14断言通过，526项无关测试过滤；没有重跑接收与先前配置测试。

计划器只改变Resolver bundle，Forge保持同一hash。最终Resolver脚本为`898023ba281259b8d2cec3d5b8ecea655728bbd9e0d35f902156a8cc6da35444`。更新后复用现有三个Actor和同一任务页，正常解析一次得到12个法术、hydrated状态；原六条失败报告、初始生成候选ZIP及原始首答均保留。补执行计划器局部anti-overfit、Resolver类型/构建，以及新增诊断文件后的依赖检查；不重跑未受影响的Forge构建、旧类型和旧测试矩阵。

## 原生MCP与配置观察

本轮正常标准资料创建：狂战士`c4014ec25cd7225a`、夜鬼婆`790fd79237dfbb90`、相位蜘蛛`a78b4276e039df25`。相位蜘蛛只为新增Effect核对准备，不重复旧攻击/伤害使用测试。root使用原生Mirror `get_character_entity`独立读取实际Item，完整收据为本次根目录的`mcp-*.json`。

| 配置 | 原生MCP实读 |
|---|---|
| 狂战士巨斧 | 真实通用检定Activity含`1d20+5`；伤害Activity为1d12、bonus3、slashing。浴血狂怒完整保留为说明，没有优势Effect，不宣称自动识别浴血。 |
| 相位蜘蛛Bite | `damage.parts`是1d10+bonus3/piercing与2d8/poison；Item effects及两Activity effects全空，`effectConditionText`为空。HP0→稳定→中毒1小时→中毒期间麻痹在正文和activation.condition文字中，没有可执行状态Effect/关联。 |
| 集会魔法 | 六个独立Cast都为max1/spent0、recovery lr/recoverAll；材料豁免与两鬼婆/30尺限制保持，限制文字不冒充自动资格判断。 |
| 魔法飞弹 | 父Cast`spell.level=4`，属性int、材料豁免保持。缓存仍保留原法术base level1；5.3.3原生`SpellData.scalingIncrease`通过linkedActivity的level4计算升级差，不应要求缓存源码改成4环，也不能凭base1判本次失败。 |
| 其他法术 | 魅影杀手和位面转移各max2/spent0、day；位面转移self。Dream max1/spent0/day、需灵魂袋/位面/信使/目标及防护例外均保留。 |

缓存的原生enchantment用来保留属性、DC和成分覆盖；它不是通过system.level Effect升环。此前父代理对这一点的口头假设已按锁定5.3.3源码纠正，未据此修改产品。夜鬼婆Actor目录编辑一度无窗口，执行器停止重复尝试；观察宏只增加针对既有Item的公开`sheet.render(true)`按钮来打开正常配置页，不执行Activity、不修改Actor值、不给源规则补Effect。

已实际打开正常Item/Activity配置页：Coven恢复栏显示长休、max1/spent0；Magic Missile施法页显示4环、INT、DC14；Bite伤害页显示1d10+3穿刺及2d8毒素，Effects与应用效果列表为空。root已查看对应截图并与原生MCP读回对照。

`configuration-final.json`与`post-refresh.json`中三Actor逐字段严格相同。Magic Missile原生getter为baseLevel1、linkedCastLevel4、scalingIncrease3，刷新后保持；12个Cast全部spent0，原每日池不变。该验收证明配置、实际解析和保存，不宣称执行过休息、施法、HP结算或状态生命周期。

## 收尾与可获取产物

本轮可直接获取`berserker/actor.json`与`night-hag/actor.json`及各自`generated-source.md`，都来自正式生成链；检查状态继续needs_review。没有手写最终Actor或覆盖原答。Berserker的合成completed摘取回放边界继续保留。

已清理三个精确登记的测试Actor及其内嵌法术，观察宏`gRZNPzjXEuTnGL3r`通过正常UI删除，自有GM页`651352189`关闭。没有创建/删除场景或消息，没有操作其他任务页面。原世界六集合回到Actor318、Item180、Scene67、Macro94、Combat10、Message1244，原ID及hash完全一致；active/viewed、worldTime及paused保持。Mirror进程27128常驻，安装的最终本地候选保留。

关键证据：`transport/receipt.json`、`berserker/receipt.json`、`night-hag/`、`spell-plan-results.json`、`mcp-*.json`、`effects-review.json`、`chrome/configuration-final.json`、`chrome/post-refresh.json`、`chrome/parent-post-refresh-review.json`、`chrome/cleanup.json`与`chrome/final-cleanup-receipt.json`。初始计划器拒绝报告、人工fixture失败日志、UI工具问题及修正记录均保留，不改成通过。
