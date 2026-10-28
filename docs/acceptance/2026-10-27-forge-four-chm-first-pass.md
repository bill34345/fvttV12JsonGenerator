# Forge 四只 CHM 2024 规则怪物首答测试

状态：本批测试、来源对照、Mirror两只限定实际使用、刷新读回及临时对象清理均已完成。三只保留Actor，一只在接收层失败；另有夜鬼婆两处局部机械差异，不能记为四只全部通过。没有修改产品或重跑旧测试。

用户先要求：“那你去 CHM 里面挑选 4 个怪。注意是2024的怪”，选定狂战士 Berserker、相位蜘蛛 Phase Spider、巨魔 Troll、夜鬼婆 Night Hag 后，用户明确说“开始测试”。这次不安排多生物文件，不增加第五只关联生物。

执行安排：四份单只各一次提取，模型HTTP最多4次；发现、模型列表、连接探针、AI内容复核、自动纠错、重试、翻译与额外配套配置调用均为0。该预算是本次执行安排，不改写为用户逐字给定的数字。失败和原答如实保留；不修改来源、规范Markdown或Actor凑通过，不在测试中擅自修产品或提交新改动。

工作树沿用`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，测试基线为干净提交`0da71b24086722660c4b67e88dbffeb5bfc8faa7`。复用已通过的46项回归、构建及既有证据，不重跑旧矩阵。先执行真实首答和本地来源对照；再按前述安排选本批多段伤害/施法样本做Mirror实际使用检查，使用已保存回答，不增加模型请求，并按占用与浏览器委派约定处理。

四项来自用户本机CHM的`怪物图鉴2025`新版目录，前言明确配套《玩家手册2024》《城主指南2024》。原CHM SHA256为`836eea8912cf6c068687e99db4a1b4b6b915aeb2ef8af35cfb040803184686f2`，选择依据及完整条目已保存在私有`forge-next-four-chm-20261027/`。本次只整理完整stat-block中的版面和表格，原HTML及页前背景保持；不补写规则。

| 单只来源 | 核对重点 |
|---|---|
| 狂战士 Berserker | AC13/HP67/CR2；巨斧+5、1d12+3；浴血优势及中型/小型选择 |
| 相位蜘蛛 Phase Spider | AC14/HP45/CR3；两次啃咬；1d10+3穿刺加2d8毒素；伤害降至0后才中毒/麻痹1小时；隐匿+7与附赠以太漫游 |
| 巨魔 Troll | AC15/HP94/CR5；三次2d6+4撕裂/触及10尺；再生15及酸火/死亡限制；4/日断肢规则与附赠冲锋；仅测试本体 |
| 夜鬼婆 Night Hag | 本体AC17/HP112/CR5与灵魂袋AC15/HP20分开；多攻/爪击；INT/DC14、升环/仅自身/每项2日次数；条件集会施法和1/日噩梦缠身 |

CHM原有`Trait Name`与`Nightmare Hautnting`两处标题问题保持并单列，不算模型新增错误。集会魔法的“所选法术再次使用前长休”依原句核对，不预先假设全目录共享一次。

私有测试证据根：`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-chm-first-pass-20261027/`。原答、调用计数、来源、分析、完整Actor及差异记录分别保存；不把内部检查accepted等同完整语义或实战通过。

## 首次调用与本地产物

使用现有`deepseek-flash`、Responses流式协议、`monster-intake-extract-v50-input-field-policy`。实际HTTP共4次；重试、复核、纠错、发现、探针、模型列表、翻译均为0。服务usage合计输入17,926、输出56,053、总量73,979 tokens；其中reasoning已包含在输出内，不重复相加。

| 样本 | 首答转换的实际结果 | 来源对照与局部问题 |
|---|---|---|
| 狂战士 Berserker | 无Actor，`ANALYSIS_INVALID_RESPONSE`；HTTP200、流读取结束 | 失败取证含可读基础数据、浴血狂怒、巨斧。接收缓冲截断，不能确定终帧完整内容或真实失败分支；不能判为模型未答，也不能计入生成通过。 |
| 相位蜘蛛 Phase Spider | `needs_review`且Actor存在，6项能力 | AC14/HP45/CR3、隐匿+7、两次啃咬、附赠以太漫游均在。攻击使用通用检定`1d20+5`，独立伤害完整包含`1d10+3`穿刺和`2d8`毒素。降至0、稳定、中毒1小时及中毒期间麻痹完整保留。两条重复`damage.types`形状问题只是提示，未取消Actor。 |
| 巨魔 Troll | `accepted`且Actor存在，5项能力 | AC15/HP94/CR5、察觉+5、三次撕裂、`1d20+7`、触及10尺、`2d6+4`挥砍、再生15及酸火/死亡限制、断肢4/日及附赠冲锋保留。没有额外生成Troll Limb。复杂时机按原文处理，不声明已自动化。 |
| 夜鬼婆 Night Hag | `needs_review`且Actor存在，8项基础能力及12条待解析法术引用 | 本体与灵魂袋数值分开；两次爪击、`1d20+7`和`2d8+4`挥砍保留。法术INT/DC14、Dream1/日与灵魂袋/位面限制、两项各2/日及位面转移仅自身均在manifest。4条引文范围问题未取消Actor。集会法术恢复周期和魔法飞弹四环机械投影有局部缺口，见下。 |

相位蜘蛛与夜鬼婆的攻击是来源未分类攻击，现有生成器使用带`sourceOperation.role=attack-roll`的通用检定活动；有实际roll公式，不能只因`activity.type`不等于`attack`就称攻击丢失。

### 狂战士的已知事实与证据限制

失败发生在transport返回content之前，尚未到provider的`extractAnswer`文本兼容分支。实际接收1,983,361 bytes，失败取证只保留头尾1,000,000 bytes，`captureTruncated=true`。`raw-answer.txt`是从该失败取证摘取的可见文字，不是已证明完整的模型终值。其文本缺一个闭合符，只读内存补符可解析，但本次没有改原答、重新请求或生成修补Actor。

源码的流式结束处理还可能因缺完成帧、没有受支持输出内容或`JSON.parse(content)`失败抛出同类错误；当前笼统的`unexpected_response`不能区分这些分支。后者确有在provider之前以内容格式拒绝回答的风险，但这次截断证据不足以认定具体是哪一支。该接收缺口保持未解决，不能用“AI没有正常返回”替代诊断。

后续三次在相同HTTP上增加独立可见输出/completed元数据取证，均确认完整可见终值；没有改变请求、产品或增加调用。首只没有这层证据，不能倒推补齐。

### 夜鬼婆的局部差异

- 便携Actor在世界导入前将法术存在顶层spellManifest，`spellResolution=pending`；基础Item的`uses=null`不代表法术次数丢失。必须读实际Cast导入结果。
- 集会原句要求再次施展所选法术前完成长休；manifest的6项各自`1/day`保留独立次数，但把恢复周期从长休变成了按日。原文没有要求六项共享一次或永久锁定某一道，不能额外添加这种限制。
- 魔法飞弹的“四环版本”在原答、说明与manifest restriction中保留，但没有结构化`castingLevel`。现有Cast投影不从该文本生成四环设置；实际默认环阶待Mirror读回。文字存在不等于升环机械正确。

### 输入准备与取证解释纠正

最初的来源排版稿折叠了HTML换行，且清单LF hash与物理CRLF不一致；未用于模型调用。原稿和失败核对保留。最终`sources-r2/`逐项核对完整stat-block、换行、表格、UTF-8文件hash后冻结，四次请求仅使用这一版。

独立语义核对曾仅按活动type、基础Item uses判断“攻击/次数丢失”，已按实际roll公式和portable manifest纠正；纠正历史保留在`semantic-review.json`。以最终产物的真实结构为依据，不把测试器误判作为产品缺陷。

## Mirror验收范围与进行状态

沿用Mirror `14.368 / dnd5e5.3.3`、端口30001、世界`cor-cotn`。已核对进程、路径及只有本任务Gamemaster在线；其他任务Next页面不操作。当前安装Forge bundle SHA256为`77a6de43aaa108e8b44c1e484c0b56dfac4cc69fc447069f47d38ee095b47219`。

复用本任务Chrome执行器与专用GM页，通过正常Forge标准资料入口读取本批实际生成的Markdown；小型观察Macro只读回文档及准备两个任务Actor的临时场景，不替代产品生成/创建或实际操作。

正常UI已经创建相位蜘蛛`a78b4276e039df25`和夜鬼婆`790fd79237dfbb90`。两只UI生成JSON与本地首答Actor逐字段差异为0。夜鬼婆实际20个Item为8个基础能力和12个法术，法术来自2024玩家手册包，`spellImportPhase=verified`。保存后的Cast已确认集会各项恢复为`day`、魔法飞弹没有四环override而缓存法术为1环；这两处局部差异已从静态推断升级为世界读回证据。Dream的1/日和完整限制、另外两项法术各2/日保留。

读回的两个已加载服务函数均匹配所服务bundle源码。原世界318个Actor、180个Item、67个Scene、94个Macro、10个Combat、1244个Message的hash没有变化。临时场景`TT97eTaS4u1i6QrH`只切换本任务视图，active仍为原场景`EBJYd289N5uyTmlC`。

首次选择测试目标时，观察Macro调用了本版本不存在的`game.user.updateTokenTargets`，在真正攻击前失败。这是测试工具问题；生成和导入证据继续有效。按本地14.368源码`client/canvas/layers/tokens.mjs:341`改用`canvas.tokens.setTargets`，只更新同一个Macro的command，保留原baseline与对象。旧工具、错误栈和修订记录分别保留，不重跑已经完成的生成。

| 实机操作 | 实际结果 |
|---|---|
| 蜘蛛通用攻击一次 | 正常角色卡→活动选择→原生骰窗；`1d20+5=22`，消息`rEDsdlSYQiw3H0IW`。 |
| 蜘蛛独立伤害一次 | 同一伤害消息`sCaPKeY72L2kQjFH`含`1d10+3`穿刺=9和`2d8`毒素=12；没有额外攻击或资源消费。 |
| 夜鬼婆魅影杀手一次 | 真实Cast确认窗显示消耗1次/可用2次；DC14、目标为本任务蜘蛛。完成后`spent:0→1,max:2`，其他所有活动次数不变。随后该流程伤害骰`4d10=18`，消息`tdonhXo3K9iOFLhF`。 |
| 魔法飞弹默认使用入口 | 没有四环配置，直接进入`1d4+1`伤害窗；Cast无level override，缓存Spell为1环。没有手调或掷这次伤害，取消了伤害窗口；但打开使用入口已经产生卡片`wPt6BdR5ZFF4f6lG`，不能称为纯只读检查或完全没有发起Cast。 |
| 刷新后的保存读回 | 两Actor ID、6/20 Item和法术导入verified保持；魅影杀手已用1/总2、位面转移未用0/总2保持；四条消息仍在。两只HP仍为45/112，未应用HP、效果或推进回合。 |

以上是限定实际使用验收，不代替全套战斗自动化。集会恢复周期仅核对保存配置，未做长休/日更实验；完整条件中毒、灵魂袋、位面、持续伤害等特殊规则未自动化实演。巨魔只做本次来源到Actor对照，没有额外进Mirror。

最终刷新后`protectedChanges=[]`，active/viewed均为原场景。root已核对截图、实际消息rolls、全部活动uses差异、刷新后文档，授权精确清理本批两Actor、一Scene及其Token、四Message和观察Macro；原始来源、首答、可下载Actor、测试源码及全部失败证据保留。

清理已完成：两Actor、一Scene/两Token、四Message已删除，观察Macro `pUZpPbkuIMeeYQOi`已通过正常UI删除，目录确认其不存在；仅本任务GM页`651352147`关闭。root独立重算清理收据，原六集合逐ID/逐hash/计数完全一致，无意外新增项，原active/viewed/worldTime/paused均保持。Mirror进程27128继续运行，其他任务Next页未操作。49份冻结来源、首答、本地产物及调用记录逐文件SHA256不变。

关键取证索引（相对于上述私有根）：

- `sources-r2/frozen.json`、`input-review-r2.json`：最终输入冻结和逐来源核对。
- `http-ledger.json`、`results/<sample>/`：四次实际调用、成功/失败原始证据及三个Actor。
- `semantic-review.json`：独立来源对照及误判纠正历史。
- `chrome/node-ui-artifact-comparison.json`、`chrome/actors-created.json`：UI生成一致性、真实创建与法术导入。
- `chrome/spider-after-damage.json`、`chrome/limited-actions-final.json`、`chrome/parent-runtime-review.json`：真实rolls及唯一资源消费差异。
- `chrome/post-refresh.json`：实际持久化读回。
- `chrome/cleanup.json`、`chrome/cleanup-baseline-comparison.json`、`chrome/helper-deleted-ui.json`、`chrome/final-tab-closed.json`：精确清理和浏览器收尾。
- `first-pass-preservation.json`、`final-preservation-review.json`：冻结文件及原世界最终保护核对。

## 下一步范围

本批先停止增加模型请求与新怪物。建议优先处理transport在provider之前的内容格式拒绝及模糊失败原因，随后处理集会长休恢复映射和中文“四环版本”对现有升环适配的缺口。修复后用本批冻结材料复验受影响部分；狂战士首答完整终值缺失的证据边界必须继续保留，不能以修补摘取文本冒充原首答成功。

本轮只新增验收记录与私有取证，没有修改产品源码、执行旧回归、重新构建、提交、合并或推送。用户入口/操作说明未改变，不触发手册重生成。
