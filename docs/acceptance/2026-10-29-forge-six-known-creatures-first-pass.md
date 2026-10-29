# 六只既有生物的新任务首答测试

日期：2026-10-29。六次首答、来源及旧产物对照、五只正常Forge导入/配置/刷新和临时对象清理完成。**六次服务均completed；五只有Actor，成年黄铜龙没有Actor。本批不能记为整批语义通过。** 本轮发现问题只记录，没有修改产品代码、原答、IR或最终Actor JSON，没有提交、合并或推送。

用户原话：“行，就测这6只。每只1次模型请求，共6次，不复核、不纠错、不重试、不投骰。保留新旧原答和失败产物，发现问题先报告，不改代码，不提交、合并或推送。”

工作树仍为`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支`codex/20261019-forge-ab-fixed-replies`，HEAD`5dc5702767bbcb0818a05a02e45c925289e66758`。本轮私有证据根E为`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-six-fresh-first-answers-20261029`。

## 来源、预算与实际入口

六份输入沿用以前测试过的精确原始文本，新建来源/请求身份，没有注入旧答复或复用旧IR作为本次提取输入。`E/sources.json`记录每份来源hash、旧原答容器、旧正确Actor及各自SHA-256。Priest明确采用之前七法术被过滤的那份新版中文来源；其他同名版本不替代。

| 样本 | 原始来源SHA-256 | 新首答结果 |
|---|---|---|
| 祭司 Priest | d66d6b378051245fa9766e13e4c23cb9e57f2aa46562d59b68244a71e1476079 | Actor保留，needs_review |
| Adult Brass Dragon | 1fcb66a559662653b4815564761955d549fd7a423bb424f5ff395ffa93757ffe | completed回答保留，未生成Actor |
| Roper | 71a4d89f42487229fc3ca3a28f1884d3fe41876ecf654d538a7ddd8dcc530c5f | Actor保留，程序accepted |
| Behir | cbc5191b5fa7611a4046266c8495131d571ec65719e6333c606bad32c14cccd3 | Actor保留，程序accepted；另发现错误状态链接 |
| Unicorn | 65a06fcb62ffe0946b85073fb0edbc8e8aeb9a4bf02fc2c5b9466dc5ccdb6d17 | Actor保留，程序accepted；另有原生计数表示差异 |
| Magma Mephit | 8711754ca74506c5a5233179e69957a730a622c20d6308d71f56ed0cc1e7ef56 | Actor保留，needs_review；另有原生语言字段退化 |

沿用既有实测runner的单次HTTP前记账机制，仅适配六份来源、新身份、证据根和当前package入口。每只`maxAttempts=1`，总HTTP最多6；发送前独占保留该样本ID，失败也不得再次发送。仅放行`https://api.deepseek.com/responses`一次提取，单只模式跳过发现，复核/纠错/重试/探针/模型列表/翻译/配套配置请求全部0。请求模型`deepseek-flash`，Responses流式，当前提取提示词`monster-intake-extract-v52-official-status-effects`。

实际六次均HTTP200且服务状态completed。usage输入28088、输出124792、合计152880 tokens，输出已包含reasoning。`http-ledger.json`及`calls/*.json`逐只记录真实发送次数，`results/*/{raw-answer.txt,response-evidence-1.json,transport-visible-completion.json,analysis.json,generation.json,summary.json}`保留各阶段原件；五个成功生成的Actor和规范来源另存。

生成段由runner调用当前Forge公共`analyzeBrowserActorSourceWithAi → generateBrowserActorIntakeCandidate`及正式workflow；不是旧CLI代替模块，也不声称六次均在浏览器点击AI生成。浏览器实际证据覆盖正常产品上传、预览、GM确认导入、Resolver配置、卡片查看和刷新；五份导入包由现有公用serializer生成，包内Actor哈希与正式生成产物一致，没有手补Actor JSON。

## 逐只来源与实机配置

| 样本 | 已核实的实际机械与结果 | 问题或边界 |
|---|---|---|
| Priest | HP38/AC13、六属性及两攻击保持；Mace为1d6+3钝击+2d4光耀，Radiant Flame为2d10光耀。两组七法术/wis均在manifest。正常选源后实际7个Cast，Spirit Guardians独立1/day，Divine Aid四选一共用3/day、bonus且消费同一Item次数 | 首次自动解析pending/0Cast；Thaumanturgy有3个候选来源，须GM选具体来源。coverage缺classification导致结构诊断，但没有丢Actor或法术 |
| Brass | 完成文本11860字符保留；外层JSON根对象提前闭合，后续claims/coverage/uncertainties落在根外 | 当前接收器转入source-text兜底，文本转换识别0个生物块，报SOURCE_TEXT_FORMAT_UNSUPPORTED，最终无Actor。未尝试修复JSON、重新生成或创建替代卡 |
| Roper | HP93/AC20、Bite独立1d20+7与3d8+4穿刺；Tentacle只有1个Utility检定1d20+7、60尺、无Damage，链接grappled/poisoned；Reel完整30尺拉近规则保留 | 语言自定义栏从空变为字面None；来源是Languages None，属于显示差异，未据此判机械失败。未实际使用或施加效果 |
| Behir | HP168/AC17；Bite两段2d12+6穿刺+2d10闪电；Constrict STR18/5d8+6及受擒/束缚；Breath DEX16/12d10闪电/90×5尺Line/半伤/充能5–6；Swallow bonus/DEX18，6d6酸伤、后续CON14及完整30伤害阈值保留；退出Prone独立且无额外消费 | 初始Save正确关联组合blind/restrained，但Swallowed Acid又关联两份单独blind/restrained模板。酸伤阶段没有新的状态施加事件，属重复/错阶段关联，原样保留待修 |
| Unicorn | HP97/AC12、Hooves2d6+4、Radiant Horn1d10+4；两组九法术清单及实际9Cast，基础CHA/DC14，Blessing两选一bonus共用3/day；传奇动作预算3、每项activation.value=1。Shimmering Shield为3d6临时HP、1生物/60尺，self-or-visible资格、AC+2和期限文字保持 | 原生legres.max从旧卡3变为0；独立Legendary Resistance特性仍有3/day和itemUses消费。确认是原生栏与独立计数的表示差异，不能称整项抗性能力丢失，也不能称与旧原生配置完全相同 |
| Magma Mephit | HP18/AC11/CR0.5；Death Burst DEX11/2d6火/5尺radius/半伤，Claw1d4+1挥砍+1d6火，Fire Breath DEX11/2d6火/15尺cone/半伤/充能6及消费1保持 | 原答CR是字符串1/2，IR报类型诊断，最终数值0.5正确。语言原生primordial从旧卡消失，整段Primordial (Ignan, Terran)仅留自定义栏；全文未丢，但原生字段退化 |

五个Actor的HP、AC、CR、六属性均与各自旧正确产物相同；另核的技能、移动、感官、抗性/免疫没有差异。语言的两处差异按表列出，不宣称所有字段相同。真实状态模板ID、Activity链接和阶段单独核对；不能用“Actor存在”或程序accepted代替这些语义检查。

Priest初次pending证据在`runtime-priest-configuration-full.json`与`priest-resolver-source-selection-dom.txt`。随后仅采用界面已有的官方PHB2024具体来源，点击一次正常Resolver配置Apply，未改Thaumanturgy原名、原答或IR，没有任何模型补救请求。选择后证据及真实卡片在`runtime-all-configuration-full.json`与`priest-post-selection-sheet.jpg`；这是正常GM选源后的结果，不能改记为首答全自动解析成功。

## 确认问题、差异及归因限制

需优先复审的是Brass格式错误后的整只保留缺口、Behir酸伤阶段重复状态关联、Magma原生语言项退为自定义文字。Unicorn的原生抗性栏/独立次数差异单列待判断；Priest与Magma的附带记录/类型诊断不等于没有产物。完整分类见`confirmed-findings-final.json`。

Brass的JSON语法错误由原首答直接确认；程序随后如何失败由当前源码和analysis/generation记录确认。新回答与以前的冻结回答不同，本轮未在旧代码上重放这些新回答，也未做版本消融，因此**没有证明上述每项都是前面某次修复引入**。本次没有修补代码、来源或答复，没有为获得绿色结果重跑生成。

## 目标身份、保存与清理

复用官方Chrome执行器`/root/chrome_executor22`、同任务回传；实际配置逐阶段核为`gpt-6.1-sol / medium / danger-full-access / never`。按用户已有启动许可启动普通Chrome；仅使用官方Chrome扩展通道，不使用页面注入或其他浏览器替代。Mirror原先未运行，经现有readiness入口准备为PID41304/30001；原生MCP实际读回`cor-cotn / Core14.368 / dnd5e5.3.3`。当前Forge0.5.1候选17个文件读回一致，仅更新Mirror的scripts/index.js，hash为`128e8bc2bfc0ec707168ccf36f978adf0a52ebc254f6febfd48a822599b88783`；Next/生产未改。

观察器经正常Macro UI导入/运行，只读记录本批对象和世界基线。五份候选经正常Forge UI预览/GM确认导入，root另用原生MCP读取Priest、Divine Aid、Roper Tentacle及Behir Swallow，并查看真实卡片截图。生成到实际保存的既有readback verifier五只均无差异提示；该检查不掩盖原生成产物里的已确认语义问题。

统一只刷新任务页面一次。root独立核对五只完整Actor逐ID相同，未忽略任何字段，包括_stats；原六条配置记录保持。`runtime-after-refresh-full.json`、`parent-refresh-validation.json`及`parent-after-refresh-check.json`保留读回。

清理前再捕获五只最终完整Actor，只删除本批五Actor/零包宏。七类集合的全部ID/name/hash、世界时间、暂停、活动场景严格恢复；前后整体SHA-256均为`5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535`。root核对`runtime-final-full.json`和`parent-restoration-validation.json`后，才删除本批观察器并关闭自有页。其他用户页面、源码、原答、失败、缓存和证据均保留。Mirror41304保持常驻，未启停Next。

## 材料保留及未执行层级

5266份既有保护证据SHA-256保持，2727份仓库文件基线无删除；产品/测试源码变化0，仅更新当前状态并新增本报告。HEAD/分支不变、索引为空，未提交、合并或推送。六份新原答及Brass失败全链原位保留。Behir旧批次本次定位到的是IR、metadata和Actor，未找到独立保存的旧raw reply；没有把IR重构成“旧原答”。此缺口不影响本次新原答及旧机械产物对照，但不能声称已做六份完整新旧原答的逐字比较。

预检曾发现私有runner断言匹配、工作目录和安全包装器不透传参数的问题，均在模型请求前修正；失败日志保留，当时真实HTTP为0。观察器首次正常下载事件超时后，仅给正常UI增加完整只读JSON出口，保留已有proof/baseline，不重跑业务或重置世界。没有把工具/取证问题计为生物生成失败。

本轮没有Use、Cast、效果Apply、投骰、战斗结算或真实资源扣费；正常Resolver来源配置Apply与能力应用区分记录。没有新增AI复核/纠错/重试/翻译或配套配置请求，没有重跑已通过离线矩阵、全仓CI或修改功能手册。新结果说明当前仍有实际缺口，不构成任意来源、任意描述或战斗行为的零bug保证。
