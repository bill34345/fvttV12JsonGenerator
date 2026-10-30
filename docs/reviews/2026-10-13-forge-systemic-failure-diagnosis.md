# Forge 屡次返修的系统性原因

2026-10-13。范围：只读分析、保存输入的确定性诊断和外部调研。没有改产品、修改真实候选、调用生成模型或付费审核，没有操作Foundry、commit、merge或push。

## 结论

**已能确认一类跨阶段的一致性问题：同一个状态、语言、公式或机制，在不同阶段由不同的表或局部规则解释；阶段各自通过，不能保证接起来仍然一致。** 模型的提取和译义错误也真实存在，但当前证据不足以把主要问题归结为模型能力、怪物难度，或简单的“提示太长”。

已有canonical模型、共享状态目录、正式workflow、来源验证、译文保护和icon报告，不需要假定这些设施完全不存在。缺口在于部分真实生产路径没有共用它们，或者只传递了其中一部分事实。应按这样的共同原因成组整改，再评估模型处理剩余不确定内容的能力。

本轮对照7份已保存首次结果，涉及3份原文、5个构建版本；它们不是独立随机样本，不能合并成成功率。尤其最后两次Gazer和Mezzoloth使用同一JS `88642c9c214deeea86b7895096ddb38416e7c3125aaa959ab261557912c37441`，分别暴露骰式x误拦截、固定状态标题冲突及语言代码问题。换新PDF只揭示了这个版本的不同边界，不证明修一处必然引入另一处。

## 一、具体失败如何归入共同原因

| 现象 | 共同原因 | 证据状态 |
| --- | --- | --- |
| Grappled生成“被擒抱”，校验要求“受擒” | 固定语义由多套显示名称维护，确定性文案仍交模型协调 | 最新实际失败；原样validator已复现 |
| Restrained生成“受限”，共享表要求“束缚” | 与Grappled相同的生产者/消费者冲突 | 当前代码静态确认；不是本次Mezzoloth含有该状态 |
| Abyssal输出大写，系统key为abyssal | parser已有该语言知识，但最终映射漏项；大小写修复仅覆盖枚举中的部分成员 | 最新真实产物＋锁定5.3.3源码确认；未实测UI |
| 保留1d10 x 5反而被英文残留检查拒绝 | 公式、文字、缩写没有完全按语义类别区分 | Gazer实际失败＋当前合成对照确认 |
| 修改运算符、数字用途或否定词仍通过译文校验 | 检查数字/术语/标记存在，不等于检查其角色和逻辑关系 | 本轮故意构造的反例；不能冒充真实模型曾输出它们 |
| 部分图标为默认或仅表达一种伤害 | 内容覆盖有限，safe表示路径安全，不等于所有语义匹配完成 | Mezzoloth实际7Item/7Activity；默认回退本身不是错误 |
| 某Activity图标忽略其使用的基础伤害 | 下游只看到局部机制形态，漏掉与父Item的关系 | 独立零模型合成对照复现 |
| 早期目标自选/缺属性/完整正文引文被拦 | 模型有等价或非法表示，适配/前置校验没有覆盖相应表示族 | 对应旧形态已有修复和回归；不是说现在仍全未修 |
| 海渴症keep food down译成“咽下” | 真正的模型译义错误；旧校验未覆盖该必要条件 | 历史实际语义失败；已有有限专项保护，不等于一般译义问题解决 |

### 固定名称：共享目录存在，但生产路径未统一

`packages/contracts/src/native-lifecycle-catalog.ts:2-16`已有14个原生状态ID和标签：grappled=受擒，restrained=束缚。本地化术语表也采用这两个译名。但活动路径使用的`generateEnhancedConditionEffects`在`packages/generation/src/actor-effects.ts:440-451`仍独立维护grappled=被擒抱、restrained=受限。

本次真实流向为：

```text
机器状态ID grappled（正确）
  → 生成器标题 被擒抱 (Grappled)
  → collector把标题作为普通待译文本
  → 待审译稿 被擒抱
  → 共享术语表要求 受擒，拒绝
```

collect路径见`packages/generation/src/reviewed-localization.ts:20-40,71-76`；validator见`packages/contracts/src/localization.ts:202-207`。固定状态身份已经明确，这项工作应直接取对应显示规则，减少让模型再次判断标准术语的机会。

2026-10-07的[术语复核](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/reviews/2026-10-07-forge-translation-terminology.md:27)已记过Grappled旧译名；上游代码仍保留该名称。能说明此前问题没有在这条生产路径上被彻底消除；不能仅凭旧报告推定所有旧修复无效。

### 语言代码：知识存在于另一条路径

`packages/parser/src/english.ts:143-163`已含abyssal；`packages/intake-ai/src/renderer.ts:316-318`只把小部分语言转成中文，其余透传；最终`packages/generation/src/actor.ts:140-196,421-429`映射没有abyssal项。结果是Infernal变成infernal，Abyssal仍为Abyssal。

目标dnd5e5.3.3的config.mjs:3932规定小写abyssal，traits模板第70行按精确key查询。原生数据和供人阅读的语言名应分开，已知别名须归入目标版本key；未知描述应保持明确的字面/待审边界，不能猜成另一个语言。

## 二、校验的强弱不均已经有反例证据

本轮先对现有生产validator执行9个小样例：1个原样实际失败、4个规范或保义对照，以及4个能力边界探针。没有调用模型、改真实译稿或制造新accepted候选。

| 输入与译文关系 | 生产validator结果 | 含义 |
| --- | --- | --- |
| 真实标题“被擒抱 (Grappled)”→“被擒抱” | 拒绝 | 复现当前固定术语冲突 |
| Grappled→受擒，以及正常范围/伤害、正常否定句 | 通过 | 基本对照正常 |
| 1d10 x 5→1d10 x 5 | 拒绝 | 合法数学记号被当英文 |
| 1d10 x 5→1d10 × 5 | 通过 | 等义乘号形式能通过 |
| 1d10 x 5→1d10 ÷ 5 | 通过 | 错误运算符未拦住 |
| 20尺内造成10伤害→10尺内造成20伤害 | 通过 | 数字集合保留，角色已交换 |
| 未穿重甲→穿重甲，伤害数不变 | 通过 | 条件被反转，数字/术语仍满足 |

随后补齐一个证据缺口：将最后三类错误先经过实际`protectLocalizationText().restore()`再进入validator，三类仍都通过。保护器要求每个占位符出现一次并保护HTML顺序，但不绑定数字的语义角色；validator把数值token排序比较，也不检查普通否定关系。相关代码在`packages/contracts/src/localization.ts:130-145,190-208`。

组合诊断第一次使用了不合法文本ID，在条目解码层被正确拒绝；该结果保留，不作为语义证据。修正诊断ID后另存结果，没有重写真实候选。反例只能证明这些组件的检查边界，不能宣称完整导入已经放过这三种错误，也不能把构造样例计为模型失败。

这意味着“多加几条字符串判断”与“放宽一点让它过”都不是通用答案。需要按类别检查：机器ID是否合法、公式是否等价、数字角色是否一致、条件和结束关系是否保留；无法可靠判断的文字继续待人工语义核对。

## 三、icon显示了同一个问题：数据范围和验收含义没有完全对齐

Mezzoloth的三个默认图符合当前覆盖边界：没有安全的魔抗/黑暗传送视觉族，物理挥砍也没有独立damage-family映射。Weaverot Barb的Item读取到了穿刺基础伤害和暗蚀追加伤害；当前视觉规则映射暗蚀、不映射穿刺，因此产生枯萎手。它只能算部分表达，不能断言本次Item漏读了基础伤害。

另一个可泛化的缺陷通过独立合成对照得到确认。用现有`createBundledIconResolutionSession('14',{mode:'safe'})`，给一个中性名称武器设置Item基础火焰伤害、Activity追加寒冷伤害：

| Activity是否使用基础伤害 | 应被考虑的有效伤害 | 当前Activity图标报告 |
| --- | --- | --- |
| includeBase=true | 火焰＋寒冷 | 寒冷图，semantic/high，“Single cold damage type” |
| includeBase=false | 仅寒冷 | 相同寒冷图和单寒冷理由 |

`resolver.ts:180-188`的Activity输入只传本活动和父range，未传父基础伤害；`structuredSignals`也不解释includeBase。前者在true情况下违反现有“混合视觉族保守回退”的原则。该合成样例证明Activity消费关系缺口；它不是本次Weaverot的同一根因。

另一处是证据在中途丢失：workflow已生成`iconReview`，包括匹配来源、置信度、理由和回退；Forge浏览器入口`packages/forge-browser-runtime/src/index.ts:116-126,188-200`取actor，却没有把该报告传入最终response。因而上层只见safe与img，很难直接分辨“路径有效”和“内容已匹配”。应转交已有报告，不必另建一套评估服务。

## 四、为什么局部绿测后，换一个怪仍失败

1. **前面的阻断遮住了后面的问题。** 目标自选、配置、翻译依次出现问题，修通上一关后才看见下一关。需要区分新引入回归和原有/新来源触发的缺口；不能一概解释为代码越修越坏。
2. **测试多按组件或已知样本组织，部分接缝缺少检查。** 本地化测试手工构造了Paralyzed效果；它没有证明当前真实生成的Grappled/Restrained标题能与术语表兼容。语言测试列出Aquan等若干例，遗漏Abyssal。icon混合伤害测试把两类伤害都放进Activity parts，没有覆盖父Item base＋Activity parts的形态。
3. **版本和政策不能混为一谈。** `tests/acceptance/slithering-bloodfin.acceptance.test.ts:73-74`是v12/modded-v12，明确预期旧译名。它可以合理保护旧行为，不能用来证明v14中文术语一致，也不能为了修v14直接改掉旧版本语义。所缺的是按目标版本连接生产者和消费者的测试。
4. **阶段通过不等于目标交付通过。** `finishDeferred`先把原语言包标成ready_for_gm_review，中文失败时仍保留包。现有UI确实显示“中文草稿未完成”，并保留GM确认；不能称其偷偷把失败中文版导入。但报告消费端若只读一个ready值，仍会把部分完成误判成整体成功。icon也有同样区分。

已有数百项测试证明了被测范围，并非无效；但数量不能代替以上跨阶段性质。前几轮单点修复证明旧失败形态被处理，尚未证明整个同类输入范围可靠。此前应更明确地保持这个区别。

## 五、建议按问题族处理的顺序

### 1. 先统一确定性语义与它的显示方式

复用已有状态ID、NATIVE_LIFECYCLE_STATUS_DEFINITIONS和目标系统语言目录。明确v14中文标签、历史别名和v12兼容政策；生成器、collector、validator不能各定义一套当前标准。固定状态名、语言key、规则ID和可确定的数学记号尽量由程序处理，AI只处理需要理解的自然语言。

完成标准是有限集合的一致性，而不只是Mezzoloth过关：所有已声明支持的状态和语言路径都能通过生成→收集→本地化/目标key核验，冲突和未知值仍有明确出口。不得覆盖用户自定义名称或未经批准的自定义状态。

### 2. 用完整的已验证事实驱动下游

已有结构化事实尽量只解释一次。公式带运算符，伤害/范围各有用途，Activity的有效伤害遵守includeBase，来源引文保持完整绑定。中文规则表达和icon候选从这些事实派生。无充分证据的复杂条件仍保留原文与待审状态，不承诺靠通用正则证明任意自然语言等价。

数学表达式只需覆盖本项目明确支持的小语法，并有等价/非等价反例；不以全局放行x、忽略运算符或降低英文残留要求代替。已知机制可保护完整句/片段，未知说明继续人工语义核对，不能仅凭数字都在就宣布正确。

### 3. 把交付要求变成分别可核的结果

保留原语言包、中文草稿、语义核对、icon覆盖、原生导入/刷新的独立状态。将现有iconReview贯穿到Forge结果；默认、部分匹配、未知不能等同已完成，不能为追求“全非默认”而任意选图。整体成功按本次用户要求判断，所需维度缺一项便报告PARTIAL或FAIL。

### 4. 改回归的组织方式，再测新来源

保持一个固定候选版本，先离线覆盖同一原因的组合：原生状态全集、支持语言别名/大小写、公式运算符和数字用途、真实生成的效果标题、includeBase true/false，以及旧/新IR表示。每项都有正常、等价表示和冲突/缺文反例；直接调用生产者→消费者，少用恰好已规范好的手写对象代替入口。

这组离线边界闭合后，再预先选定少量独立新来源作一次既定评估，记录首轮结果及内部修复次数；失败保留，不临时换怪或重试到通过。届时才能分开测量剩余模型错误与工具错误。当前不启动这些模型实验，也不承诺通过率。

这些是若干可分别审查的边界整改，依据共享原因划范围。无需重写全部架构，也不应继续只替换当前失败字段，然后立刻花费一次完整生成去撞下一关。

## 六、外部一手资料如何支持这个判断

本轮AnySearch检索、Issue #5178和DeepSeek官方文档读取成功；另外两个GitHub原页提取返回“Unable to extract”，随后用网页工具读取同一原页及后续评论。没有只靠摘要给结论。

- [Pydantic AI #5178](https://github.com/pydantic/pydantic-ai/issues/5178)与[合并修复 #5181](https://github.com/pydantic/pydantic-ai/pull/5181)：用户报告减小验证反馈后模型重复错误调用；维护者按调用路径保留失败输入并补对应回归。作者“工具参数完全不在上下文”的解释被维护者质疑，不能引用为既定机制。可借鉴的是核对真实反馈契约和缺失测试分支，不是增加重试。
- [LangExtract #358后续](https://github.com/google/langextract/issues/358)：用户将静默丢块追到默认吞解析错误的行为，关闭抑制才让既有处理接到错误；维护者确认并将不同范围的诉求拆开。可借鉴的是区分模型、适配器和调用方对失败的理解；本项目现有失败阻断应保留。
- [DeepSeek JSON Output官方文档](https://api-docs.deepseek.com/guides/json_mode/)说明json_object输出有效JSON文本的接口保证。它不提供本项目规则、译义和Foundry语义的正确性保证。

这些是原理层的参照，框架、provider、版本和文档规模不同，不证明Forge的每次错误同因，也不支持迁移到这些库能自动解决问题。待判断本地化：无新增外部模块/框架候选。未来复查先对照本地真实失败层位和版本，再读原Issue/修复，用一个能推翻解释的边界检查验证。

## 证据、复核与未证明事项

实现工作树保持HEAD f79c25fbac747a7e08f98c48779f052c3db68599及原dirty成果。主控执行9例validator检查和3例有效ID的保护器组合检查；两项独立只读复核检查词表/语言与icon边界，其中icon复核执行一组includeBase对照。没有重跑全仓测试；没有新模型调用。

- [历史原件与外部来源索引](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-systemic-analysis-20261013/evidence-index.json)
- [9例生产validator诊断](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-systemic-analysis-20261013/validator-probes.json)
- [保护器＋validator组合诊断](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-systemic-analysis-20261013/protected-token-probes-valid-id.json)
- [最新真实来源/译文/icon报告](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-13-forge-mezzoloth-first-pdf.md)
- [上一轮实际x失败与配置减负](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-13-forge-ai-handoff.md)

尚未证明：整个工具的故障占比、全部状态/语言的枚举审计结果、一般新来源成功率、换模型收益，以及拟议整改后的任何实际效果。旧两份未保存配置的精确失败字段继续UNKNOWN。固定术语/数学检查/icon关系这些确定性缺口不应由付费AI审核代替修复；付费审核保持关闭。
