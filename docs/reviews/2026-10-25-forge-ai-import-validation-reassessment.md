# Forge：开源AI导入工具的校验方式与替代方案评估

调研于2026-10-24启动，2026-10-25整理完成。沿用`20261019-forge-ab-fixed-replies` worktree，HEAD为`8fd68ea3cc03ec996550a5a70bfa5f0f9cfd1a67`。本轮只调查、比较并记录建议，没有替换或关闭现有校验器，没有安装依赖、复制第三方实现进产品、调用模型或写入Foundry。

用户要求停止不断小修小补，调查其他AI Actor／Item导入工具是否校验、如何处理失败；若实现确实优秀，允许评估直接复用代码，不能把方案局限于抽象借鉴。当前AI数据优先、原文核对不能覆盖或阻断最后生成的决定保持。用户对现有校验器不适合正式使用的评价是此次重新评估的出发点；本报告不把先前局部PASS推广为产品整体可用。

## 分层结论

1. **源码已核实：有校验，但校验对象不同。** 三个直接相关的AI Foundry项目采用JSON／Zod结构处理、确定性组装或资料包匹配；在所查路径中，未发现一套成熟、独立、覆盖D&D原文语义的检查系统。不能从这个有限样本推论所有AI导入器都如此。
2. **源码与反例已核实：少检查并不等于更可靠。** wickercar会吞掉单动作失败；DM Toolkit在离线反例中漏能力、误设成功伤害却仍显示100%；DeadMate的AI特殊动作存在静态传递缺口。它们不能作为“去掉检查后就能正式使用”的证明。
3. **可以直接复用，但需挑机制和许可。** Instructor JS与Aioros的实际许可证为MIT，可以在保留版权及许可文本的条件下复用合适代码。Instructor的schema验证、错误反馈和限次纠错最值得做适配评估；没有证据支持整包替换Forge。GnollStack明确是专有源码可见软件；DeadMate无明确LICENSE；DM Toolkit许可声明冲突，三者不列为已确认可直接复制的代码来源。
4. **助手建议，尚未实施：收敛默认链的职责。** 保留结构／目标版本检查、AI结构化数据到最终JSON及原生读回的一致性检查、明确的人工预览；将目前靠自然语言语法识别判断AI是否正确的检查移出默认生产判断链，不再遇到新句式就永久追加规则。未识别不等于已证明AI错误。可选AI审核／纠错继续受用户现有开关与费用边界控制。

本轮没有外部工具的真实AI质量、Foundry运行或正式使用验收；以下“已核实”指固定源码、已读取的一手报告，或明确标出的纯函数离线结果。

## 检索范围、版本与热度

公开发现使用已配置AnySearch，初始查询包含失败／issue；源码、目录、提交和issue通过GitHub连接器读取。复用了2026-10-13研究的三个固定来源并重新核查，又增加两个Foundry候选和一个通用TypeScript结构化提取库。GitHub仓库搜索调用返回参数错误，目录／文件／issue读取正常；发现候选继续走AnySearch，没有把搜索失败当成无相关项目。

为了避免按名气选工具，本次按直接相关性、源码可核程度和失败路径筛选。当前查询中直接相关的Foundry项目普遍关注度低：0–10 stars记为小众，11–1000记为中等，超过1000记为热门；这是本次可比信号的粗分，不是质量等级。没有为了凑中等热度把非AI或无复用许可的软件冒充成熟AI导入器。以下star数均为本次API观察，不是下载数或生产使用证明。

| 对象与固定提交 | 真实类别／版本 | 本次关注信号 | 许可证与可用边界 |
| --- | --- | --- | --- |
| [wickercar AI Monster Importer](https://github.com/wickercar/foundry-ai-text-importer/tree/7381ed0c34a63020cb870be93d041435e7ab12d1) | 真正AI导入；1.0.9；Core11–12，verified11.313；dnd5e verified2.1.5 | 0 stars，最后提交2024-02-14 | MIT；目标与实现均不构成当前14.368／5.3.3接受 |
| [DM VTT Toolkit](https://github.com/Tonyb29/DM-VTT-Toolkit/tree/c756f5183192f28a135308e132268245a546ccc1) | 真正AI提取／设计；Actor输出文本再正则解析，Item输出JSON；README自称4.6-alpha，package仍2.0.0-alpha.1 | 0 stars，最后提交2026-10-20 | 无根LICENSE；About写CC BY-NC4.0，Privacy／App写MIT；许可未明 |
| [DeadMate Simple NPC Generator](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/tree/193998d478dec9f7bf435d16caa6e516863d54af) | 真正AI生成＋手工JSON导入；1.0.7；Core最低11、verified13，未声明精确dnd5e版本 | 2 stars，最后提交2026-03-06 | 完整树无LICENSE／NOTICE，API license=null；未确认直接复制许可 |
| [Aioros 5e Statblock Importer](https://github.com/Aioros/5e-statblock-importer/tree/98f5bd9bf3a18b3cb50429f1bef6b735de32271e) | **非AI**正则导入；2.4.0；Core最低12.331、verified14.368；dnd5e最低4.3.0、verified6.0.5 | 6 stars，最后提交2026-10-04 | MIT；版本声明不是5.3.3本地运行证据 |
| [GnollStack 5e Item Importer](https://github.com/GnollStack/5e-Item-Importer/tree/f93a6da1d6ae78440ef6795d5c6a9f436a8b1e34) | **非运行时AI**；自然文本／Strict YAML确定性导入；14.2.0；dnd5e6.0.6 | 4 stars，最后提交2026-10-19 | 专有EULA，明确不是开源；不覆盖本项目5.3.3目标 |
| [Instructor JS](https://github.com/567-labs/instructor-js/tree/868ef8c1293271930c10dd4a3f3415b3e604cd34) | 通用AI结构化提取库，**不是Foundry导入器**；1.7.0；TypeScript／Zod／OpenAI-like client | 804 stars，最后提交2025-01-27 | MIT；可评估复用窄机制，不把老依赖组合当当前浏览器／DeepSeek实测 |

热门通用对照只取[LangExtract](https://github.com/google/langextract/tree/3a68580f0aede0e96a2e1e03daa2a5f4011e4fcd)：约39029 stars、Apache-2.0，来源定位与可视化值得对照，但它是Python提取库、不是Foundry适配器，本轮不以其热度推动引入另一条运行栈。

## 实际采用哪些校验，失败怎样处理

### wickercar：有结构schema，没有独立的来源语义复核

默认路径从全文分别提取基础属性与动作列表，再逐动作请求结构化结果。`askLLM`使用LangChain的StructuredOutputParser与Zod，把schema转成提示要求；解析成功后进入Foundry formatter。没有第二次对照原文检查每个攻击、范围或遗漏的独立审核路径。[提取与默认策略](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/genFoundry5eMonsterFromTextBlock.ts#L18-L84)、[结构解析](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/llm/askLLM.ts#L16-L54)。

关键反证是动作生成／解析失败被catch后返回undefined，再过滤掉。任务跟踪器看到Promise正常结束，仍可显示完成；缺失动作没有完整原文占位。最终Actor并未整体调用已定义的Foundry5eMonsterSchema重验，也没有导入前人工预览或事务补偿。[吞错与过滤](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/text-parsing/Parsed5eItemParser.ts#L25-L48)、[创建路径](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/createFoundryActor.ts#L13-L62)。

真实用户的[issue5](https://github.com/wickercar/foundry-ai-text-importer/issues/5)报告豁免熟练／加值错误，目前仍open，未见作者修复回复；不能只凭这条issue确定错误由模型还是系统版本造成。网络层有LangChain默认最多6次重试，不能写成“完全不重试”；JSON／语义错误没有纠错循环。**小schema与调用接口可参考，吞错、丢项、旧版formatter不能照搬。**

### DM Toolkit：预览和评分不能证明语义正确

Actor链让AI输出statblock文本，再进入`parseStatBlock`；Item链让AI输出JSON字符串，`JSON.parse`后直接进入确定性builder。网页输出前未见运行时schema gate或原文语义对照。[Actor链](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/c756f5183192f28a135308e132268245a546ccc1/parser-versions/dnd-parser-v20-stable.tsx#L1232-L1307)、[Item链](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/c756f5183192f28a135308e132268245a546ccc1/parser-versions/magic-item-creator.tsx#L617-L658)。

其Accuracy只是字段匹配数占比，且排除未匹配的可选字段。Utility仅保护已经成功切分出的动作；被标题规则排除的段落不会因此获保留。所有Save动作固定写`onSave:'half'`，完整原文也没有作为根biography保存。[评分](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/c756f5183192f28a135308e132268245a546ccc1/parser-versions/dnd-parser-v20-stable.tsx#L727-L737)、[动作切分](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/c756f5183192f28a135308e132268245a546ccc1/parser-versions/dnd-parser-v20-stable.tsx#L329-L387)、[半伤默认](https://github.com/Tonyb29/DM-VTT-Toolkit/blob/c756f5183192f28a135308e132268245a546ccc1/parser-versions/dnd-parser-v20-stable.tsx#L1067-L1081)。

本轮执行了固定源码的四组纯函数离线反例，输入是合成parser控制，不是正式生物测试，不把旧版怪物当2024样本：

| 控制输入 | 实际返回 |
| --- | --- |
| 完整基础数据和两个动作，首个标题为The Final Word | 首动作消失；errors与warnings均空，Accuracy仍100 |
| 酸息明确成功不受伤害 | Save存在，但damage.parts为空、onSave为half；仍100、无告警 |
| 将AC与STR改成999 | 原数值999保留；无边界错误，仍100 |
| 完全无关的一句话 | 默认补成AC10／HP5／CR1的NPC；有默认告警、没有errors |

执行仅截取原helper／parser并去掉两处TypeScript类型及模块／UI包装，未改正则或默认值；完整来源、输入、输出、脚本保存在证据目录。parser blob与旧`048dda…`相同，不能假设新主分支已经修复。未调用模型或Foundry。

未找到独立用户issue后，另外读取作者[第一轮实作修正](https://github.com/Tonyb29/DM-VTT-Toolkit/commit/8a851882d8551f22fe0f58d61540d1d22e0feccb)与[第二轮修正](https://github.com/Tonyb29/DM-VTT-Toolkit/commit/11d2f65aa5b332a2797870ef7b254024a36fbc9a)：作者自己报告字段虽写入但技能加倍、护甲不生效，以及旧宏删除同名Actor等问题。这些属于另一系统／Foundry12的一手经历，只能支持“字段合法与实际生效要分开”，不是本项目D&D2024接受。**输入适配与确定性组装的边界值得参考，当前parser／评分／默认值不适合复制。**

### DeadMate：人工匹配预览值得参考，但并非AI路径都经过预览

源码确认真实调用`/chat/completions`，使用json_object与示例输出自定义NPC blueprint，再规范化、匹配compendium、构建Actor。手工JSON导入的可选预览能显示请求名、匹配名、来源包、匹配策略、缺失与重复，整批确认或取消。[预览入口](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/blob/193998d478dec9f7bf435d16caa6e516863d54af/scripts/ui.js#L4088-L4119)、[确认与创建](https://github.com/DeadMate/foundry-vtt-simple-npc-generator/blob/193998d478dec9f7bf435d16caa6e516863d54af/scripts/ui.js#L4222-L4241)。

不能把这项功能推广到直接AI生成：该路径跳过预览，缺项主要给总数告警；失败还可能回退本地随机NPC。另有明确静态传递缺口：AI schema和normalizeAiFullNpc保留actions，后续normalizeAiBlueprintForActor／normalizeAiItemGroups／resolveAiBlueprintItems只处理物品、法术与features，不消费actions，非武器特殊动作不进入该Actor构建或缺失计数。此结论是已追踪的静态路径，未运行复现。

直接复用许可未确认，且当前支持声明不是本项目14.368／5.3.3。**可独立采用“准备数据→逐项匹配明细→人工确认→创建”的交互思想，不能把整个AI导入器当成熟替换。**

### Aioros：有预览、未知行和导入问题报告，但它不是AI工具

它直接正则解析标准statblock。动作先保存description，再尝试建立Attack／Save；没有识别出可执行活动时仍保留Utility。[能力保存与fallback](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiActor.js#L297-L326)。它会收集unknownLines，提供文本分块预览与手动hint；导入后报告缺失法术、旧版法术和CR问题。[解析预览](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiWindow.js#L174-L207)、[导入及问题报告](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiWindow.js#L329-L369)。

其[issue65](https://github.com/Aioros/5e-statblock-importer/issues/65)要求更具体的字段接受／拒绝清单、未解析文本提示、原始statblock保存和重新导入，目前open。要区分作者现有分块预览与用户想要的最终字段审核清单，不能拿issue的“没有preview”措辞断言整个源码没有任何预览。

MIT允许评估直接复用相关代码；但这里的英文正则正是本项目不应继续扩建的部分。它还自动找Gear、计算装备AC，再在部分情况下改为flat；这与本项目普通装备省略／固定AC决定不同。**description优先、未知内容可见和导入问题列表值得取用，正则主流程与Gear／AC流程不复制。**

### GnollStack：真实schema检查和导后比较有价值，源码许可不允许直接纳入

运行时是确定性自然文本／Strict YAML解析，README的AI-assisted指开发方式。其最值得参考的策略是：创建前用真实Item documentClass克隆构造，再把原始值以`clean:false／strict:true／fallback:false／dropInvalidEmbedded:false`重新验证，防止构造器夹限／取整后掩盖原始输入错误。[原值保护](https://github.com/GnollStack/5e-Item-Importer/blob/f93a6da1d6ae78440ef6795d5c6a9f436a8b1e34/scripts/itemUtils.js#L19-L34)、[schema检查](https://github.com/GnollStack/5e-Item-Importer/blob/f93a6da1d6ae78440ef6795d5c6a9f436a8b1e34/scripts/itemUtils.js#L775-L836)。

Preview／编辑YAML后重预览／显式导入分开；可选导后comparison比的是parsed expected与实际Item，并不证明原文语义完整。[预览检查](https://github.com/GnollStack/5e-Item-Importer/blob/f93a6da1d6ae78440ef6795d5c6a9f436a8b1e34/scripts/ui/itemWindowActions.js#L375-L464)、[比较器](https://github.com/GnollStack/5e-Item-Importer/blob/f93a6da1d6ae78440ef6795d5c6a9f436a8b1e34/scripts/ui/itemComparisonEngine.js#L27-L88)。[issue1](https://github.com/GnollStack/5e-Item-Importer/issues/1)包含用户最终确认解决的旧版本加载问题，不能当当前14版schema行为通过。

其[完整EULA](https://github.com/GnollStack/5e-Item-Importer/blob/f93a6da1d6ae78440ef6795d5c6a9f436a8b1e34/LICENSE.txt#L7-L34)明确source-available而不是open source，禁止未获书面许可把全部／部分代码纳入其他模块及分发修改版。**只能独立设计同类机制，不能照搬该实现。** 这些参数的行为针对它的6.0.6目标；本报告没有核实在5.3.3上的等效接口，不提前宣布可直接使用。

### Instructor JS：最值得评估复用的窄机制

它不是Foundry导入器。调用者提供Zod response_model，库据此生成输出格式要求，对返回值执行safeParseAsync；失败时只把最后一份输出与本次具体错误追加到原始请求，按max_retries决定是否再请求。语义纠错默认0次，并非默认循环尝试；底层SDK的网络重试另算。[格式／局部错误反馈](https://github.com/567-labs/instructor-js/blob/868ef8c1293271930c10dd4a3f3415b3e604cd34/src/instructor.ts#L121-L159)、[结构验证与限次循环](https://github.com/567-labs/instructor-js/blob/868ef8c1293271930c10dd4a3f3415b3e604cd34/src/instructor.ts#L224-L288)。

这个边界比为每只新怪永久追加Prompt规则更适合研究：schema维护字段类型，纠错消息携带本次错误，不需要把每次失败变成系统提示词的新段落。它也允许调用者自定义复杂validator，不能因此宣称它天然解决领域语义；本项目不应再在这些refine里复制一套D&D自然语言解析器。

实际MIT文本在[LICENSE](https://github.com/567-labs/instructor-js/blob/868ef8c1293271930c10dd4a3f3415b3e604cd34/LICENSE)。可评估直接复用错误反馈与限次循环的实现，并保留`Copyright (c) 2024 Jason Liu`及许可文本；也可直接用成熟schema组件而不拷贝整个wrapper。当前尚不建议整体安装1.7.0，原因有具体证据：

- [issue203](https://github.com/567-labs/instructor-js/issues/203)报告1.7.0与Zod4.0.10的错误处理崩溃，仍open；不能把宽peerDependencies当实际兼容证明。
- [issue161](https://github.com/567-labs/instructor-js/issues/161)反映schema失败时不易取得原始回复，仍open；本项目已保留的原始回复／失败证据不能在换库时丢失，也不能改为记录完整敏感请求的debug日志。
- 仓库名为deepseek的测试实际使用Groq上的deepseek-r1-distill-llama-70b，不能冒充`api.deepseek.com`／本任务deepseek-flash接受。[实际测试配置](https://github.com/567-labs/instructor-js/blob/868ef8c1293271930c10dd4a3f3415b3e604cd34/tests/deepseek.test.ts#L45-L60)。
- 现有Forge有自己的传输、取消、审计、凭据及费用边界；复制验证循环不等于可以替换这些接口。返回的_meta也不能不经适配写进领域IR。

## 对Forge的建议：改变职责，不是再补中文表达式

以下是助手建议，未作为用户已经批准的实现方案，也未改代码。

| 层 | 建议保留的职责 | 建议退出默认链的职责 |
| --- | --- | --- |
| AI输出接入 | 类型、必需结构、已支持枚举／字段、骰式格式；错误定位到字段，原回复保留；能交付的候选继续交付 | 用越来越多的自然语言句式重做AI阅读，并把不认识的句子当成数据错误 |
| renderer／generation | 忠实投影AI给出的命中、DC、范围、次数、法术参数；完整规则及GM边界保留 | 根据原文擅自填值、改值、套官方装备或猜测高级自动化 |
| 原生适配与读回 | 当前目标版本真实schema、合法字段、ID／权限／所属文档；IR→JSON→实际文档的值是否丢失或变化 | 把schema合法、创建成功称为整只生物规则正确 |
| 预览与审核 | 让GM看原文、生成字段和未能转换的具体内容；缺失资料包、真实生成差异分别列清 | 以程序未识别中文而产生的大量技术错误替代可读的审核信息 |
| 可选AI审核／纠错 | 沿用显式开关、次数和费用边界，只反馈本轮错误；失败保留可用候选和原回复 | 自动开启付费审核，或为证明换方案有效而重跑已完成的历史AI |

**这里有明确取舍。** 结构检查无法发现“AI把原文+9写成了合法数字+19”，也无法单凭IR发现整段动作被AI漏掉。移出日常原文语义检查会减少自动漏项发现，吞咽这类真实遗漏仍需AI提取清单、GM对照或显式AI审核发现。不能为了减少误报而把这项能力的损失隐去，更不能因此把候选统一标为全语义accepted。

对应当前例子：Yithian的中文标头／语序不会再因为程序不认识而被断言为AI错误；长矛远射程20/60在Foundry保存后丢失60，仍由结构化结果与原生读回比较发现。这是两种不同的责任。完整来源与准确引文可继续用于追踪、定位和人工查看；它们不必承担程序全面判断D&D自然语言含义的职责。

建议把当前混在validator／verifier里的三类检查拆清：保留通用结构检查与生成保真检查；将原文语义规则独立为离线审计／诊断入口，是否保留哪些可证明的窄提示再按收益决定。**不采用“先继续补齐伊斯人的16项正则，再开始新方案”的顺序。** 正式JSON仍走现有workflow，不让第三方AI直接制造最终Actor／Item。

## 可复用／待判断清单与最小复查

下列为待判断复用，不是已安装／本地化可用模块；状态按[模块健康记录](../acceptance/foundry-v14-module-health.md)的原则，Untested不算可用。没有将外部模块登记为本地可用。

| 候选 | 当前建议 | 后续最小检查 |
| --- | --- | --- |
| Instructor schema＋局部错误反馈／限次循环 | 许可明确，可评估直接摘取或使用窄schema依赖；不整包替换 | 固定依赖版本；模拟合法结果、类型错误、枚举错误、0次／1次纠错、取消与原回复保留；再检查浏览器bundle与当前传输适配 |
| Aioros description优先／导入问题列表 | MIT，可取适合的窄实现；不取英文正则、Gear／AC策略 | 以无法执行的能力确认全文仍可见；两个同名能力不串项；完整IR与Actor非目标字段不变 |
| DeadMate匹配明细预览 | 仅交互设计可参考；复制许可未确认 | 新提交先核LICENSE；确认AI路径也经过预览、actions全被计入；不能仅看手工JSON分支 |
| GnollStack原生schema原值验证／导后比较 | 独立设计同类机制；不复制EULA代码 | 先核Core14.368／dnd5e5.3.3精确接口；验证构造器清洗不会掩盖原值，以及检查过程不写世界 |
| wickercar formatter／DM parser与评分 | 不采用 | 只有在新提交修复丢项、错误默认、失败可见性及许可后再复查；不要把同一旧blob再当新候选 |
| 现有中文语义规则 | 暂停逐项修补；作为迁移对照材料保留 | 先列明哪些是结构、哪些是投影、哪些在重读原文；用冻结Yithian／Behir／火元素／长矛验证新职责和失去的能力 |

最小验证不需要先跑更多生物，也不需要重做已通过的下载／施法／回合实验：先以保存回复证明结构问题能准确定位、内容不被改写、真正字段丢失仍能报告、候选与证据保留、已知中文未识别不再冒称内容错误。若以后修改提示词或模型调用协议，再按授权做一条新的真实AI链；若修改写入接口，再补对应目标的真实创建／刷新读回。新方案的准确率、速度、费用、干预减少和正式可用性目前均没有实测结论。

## 许可证处理

“可以直接复用优秀开源代码”这个方向成立，不需要为了形式上的原创重新写一遍。MIT候选须保留原版权和许可；依赖本身另核其许可。公开GitHub仓库并不自动授予复制到其他产品的权利，[GitHub维护的许可说明](https://choosealicense.com/no-permission/)也区分查看／fork与开放复用授权。DM Toolkit许可矛盾、DeadMate无许可、GnollStack明确禁止纳入其他模块，因此这些目前只作架构观察，不联系作者、不新开issue、不把代码移入Forge。

## 证据、工具和本轮边界

证据根：`H:/CodexData/visualizations/2026/10/24/01a16bdb-060b-7bf0-b3bc-6856d049157a/import-validation-research/`。

- `wickercar/report.md`、`metadata.json`、`source-evidence.json`：固定版本、依赖请求重试和一手issue。
- `deadmate/report.md`及同目录元数据／源码摘录：直接AI与手工JSON的路径区分、actions静态缺口、许可缺失。
- `dmtoolkit/REPORT.md`、三份上游源码、`offline-probes.mjs`、`test-inputs.json`、`offline-results.json`：四组完整离线控制及可重放方法。
- `dmtoolkit/gnollstack/REPORT.md`及同目录源码／LICENSE：Item schema原值检查、专有许可与版本限制。
- `aioros/`、`instructor/`、`sources.json`：本轮固定源码、实际LICENSE、manifest／package与原始issue内容。

AnySearch对OSI页面的提取失败，该页未用作判断依据；实际MIT／专有许可文本及GitHub许可说明已读取。没有用未读到的issue评论、模型名称、README评分或manifest兼容声明补造验收。两条独立研究子任务的证据由主代理读回对照后汇总；本轮源码与案例调查完成，不代表已实施替代方案。

本轮仓库只新增本评审并更新唯一当前状态，产品代码与此前44项dirty中的其余内容保持；不提交、合并或推送。未修改普通装备／固定AC／魔法武器范围、未做2014兼容性修复、未触碰生产。只做文义、来源链接、diff和保留性核对；研究文档不改变用户入口／输出／版本／操作步骤，故不刷新手册或重跑业务测试。
