# 四个官方2024新样本：首次结果与停止原因

本批没有全部通过。四份真实DS首次处理全部完成：1份正式accepted，1份生成needs_review候选，2份未生成Actor。随后对可用候选启动一次Foundry验收，但在第一项创建前被来源换行身份不一致阻断，Actor创建数0，第二项未执行。按用户要求保留失败、解释原因并停止；没有修改产品、提示词、AI回复或最终JSON后重跑。

用户原话、范围及当前状态见[唯一交接页](../plans/2026-10-20-forge-ab-current-state.md)。沿用`codex/20261019-forge-ab-fixed-replies`，基线`5cfcda1e4a298a23adde086a3e277cb80e638205`，主代理亲自执行。

## 有限查漏及样本选择

先核对历史实际问题与当前实现，没有重复旧人工注错矩阵：

- 2026-10-18“普通入口不核基础事实”的旧结论已经过时：当前validator在入口调用`validateSourceBaseFacts`，复用基础数字与静态来源核对。
- 技能总加值1／2的旧混义已有修复：renderer明确输出`总加值`对象，并有已有专门检查。未再次把旧报告当成当前失败。
- 批量候选、刷新恢复、历史摘要复用有效验收；下载文件实际落盘仍是独立证据缺口，细粒度base缓存仍无足够收益证据。本批不处理这些旁支。

四份来自Wizards of the Coast官方SRD5.2.1，按2024规则体系选取；官方说明怪物名称和数据块跟随新版Monster Manual。本批使用这一份统一可核实出版来源，没有声称来自两本不同书。[官方发布页](https://www.dndbeyond.com/srd)、[官方英文PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)。

This work includes material from the System Reference Document 5.2.1 by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/.

复用的官方PDF SHA-256：`8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`。原页289、306–307、316、356–357全部渲染并目视核对；从完整数据块截取，去掉出版物页眉／重复目录标题并衔接跨页正文，保留原文换行和断字，没有改写规则。

| 对象／原页 | 选择理由 | 本次正式首次结果 | 实际影响 |
| --- | --- | --- | --- |
| 狮子 Lion／356–357 | 非施法野兽，基础攻击、群体战术、跳跃及短期恐惧 | accepted，0 findings | 生成HP22／4d10的正式Actor；本次原生创建未到达 |
| 角斗士 Gladiator／289 | 近战或远程择一、盾击条件、招架反应 | 未生成，6条提示 | 同一个Spear操作失配及其派生／汇总阻断，不是6个独立问题 |
| 牧师 Priest／316 | 感知施法、每日次数、附赠动作四法术共用3次／日 | needs_review候选，4条提示 | 3条来源问题加1条汇总；HP38／7d8 + 7及主要施法数据已生成，原生创建未执行 |
| 美杜莎 Medusa／306–307 | 多伤害类型、充能附赠动作、反射及两阶段石化 | 未生成，5条提示 | 蛇发伤害引文失配及派生提示，另有语言备注误判 |

四份IR的HP、生命骰、AC、CR、六属性均与原文一致；具名能力在IR中均存在。此核对不是完整语义全部通过，尤其装备遗漏另列如下。复杂条件的完整GM规则保留不等于已实现自动状态推进。

## 失败的具体原因

### 1. 角斗士：两种攻击模式被混在单个近战操作里

原文Spear明确为Melee or Ranged Attack Roll，命中+7、近战触及5尺或远程20／60尺、伤害2d6 + 4穿刺。AI回复只建立一个`attack.type:melee`，却同时填写reach、range和longRange。现有中立攻击接口要求分别保留两种互斥模式，所以不能投影成这个单一操作；完整正文仍在，但不足以纠正错误的可执行结构。

实际发送的v39提示词保留了旧式“Melee or Ranged Weapon Attack用mwak混合字段”的说明，新增中立melee／ranged契约却没有解释这种现代双模式如何表达。已确认输出结构不合约，提示词说明缺口是明确风险；本批未通过再采样实验量化其因果影响。不是HP或Parry反应填写错误，也不应靠程序猜测武器分类来掩盖。

### 2. 牧师与美杜莎：同义语言备注被字面比较误判

原文均为`Languages Common plus one other language`。AI填写原生Common，加备注`one other language`，已保留“通用语＋另一种语言”的数量与含义。当前`staged-source-facts.ts`把原文切成`Common`和`plus one other language`，但对未知语言备注保留整个字符串比较，因缺少连接词plus报冲突。这个失败不能表述成AI把语言数量或内容填错。

### 3. 牧师：每日四选一施法没有被已有来源识别器承接

原文Divine Aid每日至多3次，附赠动作在Bless、Dispel Magic、Healing Word、Lesser Restoration中选一个，继承Spellcasting的施法属性。AI保留了四个法术、一个共享3次／日池、bonus时机及WIS／DC13。

现有`sourceDailySpellAction`的法术名组不允许逗号，并且后续只按or分为至多两段，因此不识别这一完整四项列表。依赖该识别结果的授予关系和父施法DC依据随之未绑定：程序报“未明确授予”和“DC13依据不支持”。原文确实存在四项授予和父DC13，不能据错误标签说原文没有它们。

AI还把“使用相同施法属性”重复放入每项casting限制。是否会影响Resolver属于原生阶段尚未到达的检查，不能预先报为已经发生的创建错误。

### 4. 美杜莎：PDF断字导致正确毒素伤害不能通过引文核对

原页Snake Hair是1d4 + 3穿刺，加4d6毒素。PDF把Poison换行印为`Poi-`／`son`，提取后保持`Poi-\r\nson`。AI正确填入了4d6、poison及完整引文。

当前来源伤害核对要求连续的poison标签；一般空白归一化不能把这个断字还原，因此同一句中两项伤害的证明引用也未被正确展开，最终阻断生成。这是来源排版与证明接口问题，不是AI将伤害骰或类型填错。未修改原文为Poison后重试。

### 5. 人工核对另发现：装备被忽略，自动检查没有报告

角斗士与牧师的coverage都将Gear标为ignored-with-reason，理由分别为“schema没有表示”／“IR没有对应字段”。角斗士的Shield、3支Spears和Studded Leather Armor没有进入IR；其最终Actor本来就未生成，不能声称导入后丢失。

牧师已有候选只包含5个能力Item，Chain Shirt、Holy Symbol没有装备Item或完整装备说明，Mace只作为攻击能力存在。候选传记仅保留体型选项。这是本次原文对照确认的遗漏，未包含在自动4条提示中；不能用其他数值正确掩盖。后续应明确装备信息如何进入已有结构或完整说明，而不是让程序从无数字上下文中猜装备属性。

## Foundry阶段：创建前阻断，不能宣称原生通过

目标为原Mirror PID38788／127.0.0.1:30001／cor-cotn／Core14.368／dnd5e5.3.3。复用现有验收工具，仅选择有产物的Lion和Priest；牧师保持needs_review，未伪装accepted。工具返回本批新IR，模型联网方法不存在。

第一项在分析阶段提示ANALYSIS_PROVIDER_FAILURE，随后队列报`review does not match its source entry`。只读现场补采确认：

- 队列与新AI原件保存Lion来源957字符、27个CRLF，哈希`39634fbe…`。
- 工作台写入textarea后再读取，实际reviewSource为930字符、27个LF，哈希`62d2365a…`。
- 两者仅相差CRLF→LF，正文逐字符相同。
- 验收Provider严格要求旧新回复所属来源逐字一致，因此在返回新IR前拒绝，discover／extract回放计数均0；错误review仍被拿去与队列原CRLF身份比较，再次拒绝。

实际代码链为`intakeApplication.ts`的`loadBatchEntry`→textarea→`readForm`／`runAnalysis`→`settleJob`，`batchQueue.ts`保留严格来源／哈希身份。这里同时暴露了验收适配器与表单／队列的来源一致性问题；本批没有修正归一化或证据坐标后重跑，不能将其当作生成Actor本身的创建失败。第一项interrupted／attempt1，第二项pending／attempt0；没有执行GM批量创建，Actor、Item、消息等世界增量均0。

因此，本批对两份可用候选的Foundry创建及字段录入仍未完成。角斗士、美杜莎无生成产物，不能手写补造Actor去凑验收。

## 实际调用、证据与恢复

四份各一次发现＋一次提取，共8次真实HTTP请求，均200／completed，实际模型deepseek-flash；修复、额外审核、再次生成调用均0。四份提取system提示词逐字相同，哈希`eabf68a35bf68cb637f3d3fe10d81dec2ffb081eba2e987c25ebd541f5f1326e`，与上批v39一致。输入51,310、输出54,103、合计105,413 tokens；没有推算账单。

证据根：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-four-2024-20261023-dc5545/`。

- `limited-audit.json`、`source-inventory.json`、六张原页PNG及`sources-final.json`：有限查漏和来源身份。
- `product-freeze.json`、`live/intent.json`、`live/result.json`及各对象request／reply／analysis／IR／generation：未修改的产品与实际首次结果。
- `batch-analysis.json`：基础字段独立核对、全部请求、原始问题分类；没有把汇总条数当成bug数量。
- `native/after-first-failure.json`、`actual-source-identity.json`、`source-identity-diagnosis.json`：实际队列与来源变化，证明创建未到达。
- `native/cleanup.json`、`ui-cleanup-final.json`、`static-cleanup.json`、`browser-cleanup.json`：临时宏`pix8roXlCUvBbUac`、QA存储、两份静态工具和页面`651349820`已清理，原世界ID／Guard／24Token／视图／时间／原scope一致，其他页面未操作。

产品代码、提示词及安装Forge／Resolver哈希保持，常驻服务保留。新增真实调用脚本是已有两龙诊断器的四来源适配，不进入正式模块。准备时曾把LF文本哈希与实际CRLF文件混用，零调用预检拒绝后保留旧清单并另存实际字节清单；没有修改来源内容。运行后诊断脚本只补一个TypeScript返回类型，初始TS7006日志及最终退出0的实际观察收据均保留；成功检查没有输出，Tee-Object未生成空日志，因此明确另存`diagnostic-types-final-receipt.json`，没有为了补日志重跑。已执行版本源码另存，未因此重新调用AI。只读PDF提取的旧编码／终端显示错误不计作模型失败。

## 下一批建议，尚未实施

优先处理来源身份在表单／队列／回复之间的一致性，避免复验无法到达创建；再处理语言连接词、PDF断字及每日施法引用的已证实误判，并明确双模式攻击和Gear的输出契约。程序修复可先用本批冻结原件验证；提示词改变后的新首轮质量需要另行明确的真实AI测试。本批不据此自动获得修复或重跑授权。

这不是新增一套无限自然语言猜测器的建议：应减少正确AI结果被格式／契约分歧拒绝，明确模型该输出的已有结构和不能丢弃的来源内容。暂不继续扩大样本，也不补全仓测试、玩法矩阵、缓存优化或其他模块。

本轮用户入口、支持版本和操作步骤未改变，现有手册仍准确；保留原检查，不因失败报告新增默认CI／hook检查。整批停止并说明失败不表示Forge产品已全部完成或本批原生验收通过。
