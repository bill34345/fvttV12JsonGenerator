# 角斗士、美杜莎、牧师：旧CLI真实对照（2026-10-24）

按用户要求，只测试角斗士、美杜莎、牧师。狮子后续不再作为重复验收样本，已有成功证据保留。由主代理亲自完成；本轮比较，不修改产品或提示词，不纠正AI首答，不手改最终JSON。

## 实际测试范围

使用同一worktree的基线`8fd68ea3cc03ec996550a5a70bfa5f0f9cfd1a67`，Bun1.3.14。这里的旧CLI是仓库保留的legacy入口、旧AI整理提示词及YAML读取流程；不是历史独立二进制复原。它之后仍连接当前共享workflow／生成器，因此牧师的当前出口行为不能当作历史版本同样拦截的证明。

真实入口：`--ingest-plaintext --enable-ai-normalize`，然后对实际产生的Markdown运行普通单文件CLI，显式`--fvtt-version 14 --effect-profile core --icon-mode off --output <本次证据目录/actor.json>`。没有使用新版`--intake-monsters`，没有使用Forge已存IR或AI回复冒充旧CLI处理，也没有声称执行原子`--ingest-plaintext-actors`。

三份原文逐字节直接输入时，旧CLI均识别0生物、退出1、模型HTTP0：它只认`# **名称**`标题。按已有对照方式另列适配，仅给原名称行包上该标题，正文其余字节完全不变，反向去掉包裹与原文逐字节相等。程序自身正常的段落标题／CRLF正规化照原实现执行；没有合并PDF断字、删规则或修改数字。

随后每份适配输入各进行一次真实DS请求，实际返回均`deepseek-flash`，temperature0、默认推理设置。三份system提示词逐字相同，SHA-256 `aa423b7f4162be6656092eee81eaf131802b359d3fb5410c815c97959d4e9252`。真实HTTP共3，纠错／重试0。三个AI回答的YAML对象与CLI生成Markdown逐字段完全相等，证明实际采用了AI首答，没有在AI失败后静默退回规则解析。

## 三只的结果

| 生物 | CLI结果 | 具体内容结果 |
| --- | --- | --- |
| 角斗士 | 生成JSON，退出0，4个Item；现有verify:actor退出0 | HP112／AC16／CR5／六属性正确。长矛AI写了+7、2d6+4、触及5尺和20/60尺，程序只生成一个近战Weapon攻击，Item与活动的远程value／long都为空，20/60仅在说明里。装备、生命骰、技能、语言、先攻和豁免熟练等遗漏。 |
| 美杜莎 | 生成JSON，退出0，5个Item；现有verify:actor退出0 | HP127／AC15／CR6／六属性正确；蛇发1d4+3穿刺＋4d6毒素保留，凝视为附赠动作、CON豁免、DC按CHA与PB计算为13、30尺锥形及充能5–6保留。生命骰、技能、语言、先攻／感知豁免等遗漏；AI已写黑暗视觉150尺，但Actor中变成0。 |
| 牧师 | AI整理成功，但正式生成退出2，未写Actor JSON | AI完整保留两组共7个法术及神恩每日3次，生命值含7d8+7；但把施法特性标成Save。当前共用生成器报告该Save需人工复核，因此没有正式输出。装备、技能、语言等未填入AI结果。不能声称旧CLI原生施法已成功。 |

## 对照本轮Forge问题

### 角斗士：旧链也没有完整承接近战／远程双模式

AI回答明确含`范围: 触及 5 尺或 20/60 尺`，最终只有一个melee Attack，Item与活动的range都是reach5、value=null、long=null。它在程序转换阶段已丢掉结构化远程射程，尚未到Foundry保存；Forge前批则投影出60但保存时丢失，丢失阶段不同。

旧CLI产出的是自定义natural Weapon Item，基础骰2d6，力量18；不是从官方武器库拿一份1d6长矛替换原伤害。但它不符合本项目当前已选的怪物攻击Feature设计，不能据此建议把Forge切回Weapon。静态数据保留了近战伤害所需的骰与属性；本次未实际掷骰，不把静态推算称为攻击结算通过。

其他实际遗漏：AI首答只填HP112，没有15d8+45；未填盾牌、三支长矛、镶钉皮甲，未填运动+10／表演+5、Common和先攻+5。对应Actor生命骰为空、装备无单独记录、技能默认计算为运动+4／表演+2、语言空、先攻默认+2。力量／敏捷／体质／感知的原文豁免+7／+5／+6／+4，在当前源数据下分别只得+4／+2／+3／+1。

AI保留“中型或小型”，但程序将整段中文直接写进`system.traits.size`，没有投影成合法体型代码及可选体型说明；本次没有Foundry导入，不能声明会如何显示或保存。

### 牧师：旧提示词把法术豁免DC当成独立豁免动作

旧提示词原文要求：“有 DC → 类型: save”。本次AI因此将包含“法术豁免DC13”的Spellcasting填写为`类型: save`／感知／DC13。这里没有原文要求目标立即进行一次感知豁免；这是施法所使用的DC。需要复核的是类型和用途，不能把原文DC本身说成错误。

实际CLI诊断：`GEN_LITERAL_REVIEW_REQUIRED actor/structuredActions/特性/3/save`，随后`Generation needs_review; no formal output was written.`，退出2，没有`actor.json`。此处是旧提示词与当前共用生成出口的组合结果，不能推断某个未运行的历史二进制也会如此。

AI保留Light、Thaumaturgy、Spirit Guardians，以及Divine Aid的Bless、Dispel Magic、Healing Word、Lesser Restoration，包含各组施法属性／DC文字和神恩共用每日3次。但它们是描述／特殊效果中的文字，没有本次可验的原生Cast或成功水合结果；因此没有绕开或证明解决Forge的casting限定交接问题。链甲衫、圣徽、钉头锤装备和三项技能、语言在AI首答已遗漏；钉头锤攻击本身保留。

### 美杜莎：PDF断字被AI正确还原，基础资料仍有遗漏

实际送给DS的旧CLI请求仍含`Poi-\nson`；AI首答和生成Markdown已变成完整Poison，并输出蛇发1d4+3穿刺＋4d6毒素，最终Actor保留这两段伤害。说明该断字不妨碍本次旧AI理解。Forge前批AI也理解正确，它的问题在后续拿原PDF断字做来源证明时误报，不能把这次结果解释成“只有旧AI能看懂”。

凝视完整原文含反射自我豁免、先束缚、下回合末重豁免、成功结束、再次失败石化，均留在最终描述；这些后果继续交GM，没有自动生命周期验收。

AI首答没有17d8+51、技能、语言、先攻及感知豁免熟练。最终生命骰空、语言空；欺瞒／察觉／隐匿默认+2／+1／+3，原文为+5／+4／+6；被动察觉默认11而原文14；先攻默认+3而原文+6；感知豁免默认+1而原文+4。上述为源数据的静态推算，未在Foundry掷骰。

黑暗视觉150尺与被动察觉14在AI首答和Markdown的`感官`文字中已存在，但最终`attributes.senses.ranges.darkvision=0`、无被动察觉补值。这项丢失发生在程序读取／投影阶段，不能归咎于AI没提取黑暗视觉。

## 如何理解检查的通过

两份Actor的现有`verify:actor`均退出0、warnings与sourceIntegrityErrors为空；旧Markdown审计同样未报告上述内容错误。它们接收的是AI已整理后的Markdown，无法自动把AI已经漏掉的原始统计块内容补回来。因此本轮另外人工对照原始资料、AI首答、Markdown和Actor；两份“CLI成功”均不等于来源完整或Foundry录入通过。

这一比较支持：AI先整理确实能消除PDF断字影响，完整文字保留有参考价值；但旧链也存在AI输出范围遗漏、类型判断错误和程序投影丢失。长矛双模式、装备字段和牧师原生施法没有从这三次结果中得到可直接替换Forge的完整解法。当前目标仍是Foundry内Forge mod；本轮不实施修复。

## 请求与证据

| 生物 | 输入tokens | 输出tokens（含供应方计数的推理token） | 总tokens | HTTP完整响应等待 |
| --- | ---: | ---: | ---: | ---: |
| gladiator | 1533 | 814 | 2347 | 4.256秒 |
| medusa | 1599 | 6129 | 7728 | 27.214秒 |
| priest | 1533 | 869 | 2402 | 4.077秒 |

合计12477 tokens；计数来自供应方usage，不以可见回答长度估计。等待是请求开始到完整响应收到的时间，不含人工审阅；没有将此时长与不同批次直接排名。

三份原始来源的SHA-256：

| 生物 | SHA-256 |
| --- | --- |
| gladiator | `b0c90cbde28287af479a042eaa23a9f18ef085f3ccee4abb3172fad0a6e26e20` |
| medusa | `489239e4ed7facc1220d2dde6c49a7cbbd4a97dc7259b876c8bc8d92966a9c3c` |
| priest | `09fac483a713bf98129d2674cd2fa27f4af32b3f81b1dbbd1f50391694d8f9c8` |

证据根目录：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-three-legacy-cli-20261024`。

- `manifest.json`：来源、仅标题适配、基线、运行时、旧CLI／观察器哈希及原冻结证据清单。
- 各生物`raw/`：原格式首次识别失败与模型HTTP0。
- 各生物`ingest/`：真实请求、首答、去除隐藏推理的响应、usage、实际中间Markdown及旧审计。
- 各生物`convert/`：原CLI命令、stdout、stderr、退出码与转换阶段模型HTTP0；两份`actor.json`由正式CLI生成。
- 两份`verify/`：实际安全入口`bun run verify:actor <中间Markdown> <Actor>`的输出。
- `semantic-readback.json`：三份AI回答确实采用的对象对照、共同提示词哈希、PDF断字仍进入请求的证据、两份Actor重点字段及静态技能／豁免推算。
- `summary.json`及各`result.json`：整批退出、真实HTTP数和原资料／冻结证据未变。

辅助只读报告脚本首次导入了本仓库未安装的`yaml`包，尚未执行业务，后改为仓库已有`js-yaml`完成同一批已存结果的读取；未因此重跑CLI、模型或生成。脚本保存在worktree `.local/forge-three-legacy-cli-20261024/`，复用的真实请求记录器保持不变。

本批无狮子测试、无产品／提示词／最终JSON手改、无Foundry或浏览器操作、无玩法扩展，无hook修改、提交、合并或推送。当前仅维护本验收记录与当前交接文档；测试证据保留。没有用户入口、操作步骤或支持范围变化，本批不触发手册产品说明修改。文义和引用、实际diff及`git diff --check`最终核对。
