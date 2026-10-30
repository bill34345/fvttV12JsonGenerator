# Forge 产品目标、功能回退与可用实现参照

日期：2026-10-16。状态：调查完成，产品故障未修复。

本次请求是阅读聊天 `01a13ee1-e2ca-7421-b895-cf0bb2aabec5`，复述用户实际需要的 Mod，并调查能帮助实现的外部资料。已读完该聊天全部 30 个 turn，检查实际候选源码、保存的 Cloaker 原文和输出，并由一个只读子代理独立核对事实契约和既有功能。内部计划、收据、测试名称均作为审计对象，不据其 PASS 字样推定产品完成。

本报告独立于产品工作树保存。没有修改产品代码、生成卡、官方合集或 Mirror，没有模型生成、安装、浏览器操作、提交、合并或推送。

## 用户实际需要的结果

给 Forge 一份真实怪物原文，经过正常模块入口，生成内容准确、中文可读、能在 Foundry 中正常使用的怪物卡。

- 基础数值准确；特性、动作、附赠动作、反应、传奇动作等完整保留。对象、条件、范围、伤害关系、结果、次数和期限不能丢失。
- 原文明示且目标系统支持的攻击、伤害、豁免、使用次数、消耗和恢复应配置为可用功能。能力同时有复杂后续规则时，仍应保留其中明确、可安全独立表达的基础操作。
- 确实不能可靠自动执行的部分保留完整规则，清楚说明 GM 要判断或操作什么；不能因此把整项变成纯文字，也不能仅因特殊能力无法自动化而阻断整只怪物。
- 中文与保留原文对应，作者原文、翻译和程序提示分清。中文不能漏译、改义或留下处理残渣。既有语义图标要求也不能因流程改版消失。
- 基础数据与完整能力分步处理，程序持有来源身份和位置；模型负责需要语言理解的提取、翻译。分步不等于把原有能力提取缩减成仅识别一种完整句式。
- 用真实新来源验证正常入口；本地正常生成采用已有 DeepSeek 默认配置。保存答案回放、专用验收入口、导入保存成功只能证明其对应层级。打开卡后应实际能进行受影响的基础操作。

用户允许复杂部分 GM 手动，没有授权全部能力变成资料占位。现有 TE/CC 等已支持功能应核对基线并避免回退；这不构成新增任意自动化机制的要求。

## 已确认的回退位置

实际产品候选：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample`，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`；关键分步文件处于未提交改动范围，不能把它们归因给某个已提交修复。

1. `packages/forge-browser-runtime/src/encounterIntake.ts:106` 固定选择 `baseMode:'facts', featureMode:'source'`。能力配置在程序里决定，本次全手动不能归因于生成模型自己选择。
2. `packages/intake-ai/src/staged-extraction.ts:413-425` 只把整段完全匹配的简单攻击作为 native。目标短语只接受 `one target`，正常 `one creature` 不匹配；附加一句后续规则也会使整体失败。
3. 同文件 `427-449` 将 manual 强制为 Utility/gm-manual，其字段白名单不能保留 attack、damage、save。`78-84` 的模型模式提示同样限制复杂、条件、豁免等能力；只把 featureMode 改回 model 不能解决契约本身的缩窄。
4. `safeFeatureFacts` 当前识别 Recharge、N/Day 和动作成本，没有承接本例标题的短休或长休恢复。
5. `tests/forge-staged-extraction.test.ts:486-505` 明确断言附带条件或追加伤害的攻击没有 attack/damage。测试在保护过度降级后的行为，绿色无法证明基本可用性。
6. `packages/models/src/canonicalMonster.ts:22` 的基础模型仍有 attack/damage/save/aoe/conditions/healing/uses。旧 HEAD provider schema 也要求提取这些字段。`packages/generation/src/actor.ts:978-1008` 的 gm-manual 分支会拒绝执行字段并生成 Utility。因此需要修上游表示及其下游边界，不能只给正则补一个短语或手补最终 JSON。

旧 Bloodfin 接受测试覆盖攻击、Save/伤害及 TE/CC 字段，属于既有离线生成能力的证据，版本与路径为旧 PlainTextActorWorkflow/v12；不作为当前 Forge staged/v14 的运行时通过证据。

## 新增的直接官方对照

通过 `bun run references verify` 核对共享缓存：dnd5e-5.3.3 与 current-6 均为 ok。本次只使用 5.3.3，提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，对应 checkout clean。本机 Mirror 的 system.json 也为 5.3.3。没有升级任何组件。

读取官方同版源文件：`F:/FoundryLab/reference-cache/dnd5e/5.3.3/repo/packs/_source/monsters/aberration/cloaker.yml`，用既有 js-yaml 只读解析，逐项对照保存的正式生成输出。

| 能力 | 5.3.3 官方 SRD 源数据 | 当前保存输出 |
| --- | --- | --- |
| Bite | weapon，STR melee weapon Attack，基础 2d6 piercing；结合 STR 与熟练生成相应命中及伤害加值 | Utility，无 attack/damage |
| Tail | weapon，STR melee weapon Attack，基础 1d8 slashing，reach 10 | Utility，无 attack/damage |
| Moan | Save，WIS，DC calculation=cha，formula=13，范围/区域有配置 | Utility，无 save |
| Phantasms | Item uses.max=1，recovery.period=sr，recoverAll；Utility 消耗 1 itemUses | Utility，无 uses/consumption |

这补上了先前 UI 报告未确认的幻象恢复和消耗字段。官方源数据证明这些结构存在，未证明当前本地运行中按钮、扣次和休息恢复已正确执行；本轮未做行为测试。官方卡的全部字段也不能不加判断照抄，例如 Moan 的空伤害列表旁有 onSave=half，它不代表原文要求半伤。

参照：[同版官方 Cloaker 源数据](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsters/aberration/cloaker.yml)、[Attack 模型](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/activity/attack-data.mjs)、[Save 模型](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/activity/save-data.mjs)、[Uses 模型](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/shared/uses-field.mjs)。

## 外部实现具体能提供什么

复用并重新核对 10 月 13 日已有直接同类研究，未重开泛化模块榜单或重复调查无关候选。

| 资料 | 本轮实际读取 | 可采用的部分 | 限制与不能照搬的部分 |
| --- | --- | --- | --- |
| Aioros 5e Statblock Importer | 固定提交 `98f5bd9bf3a18b3cb50429f1bef6b735de32271e` 的 sbiActor.js、module.json | `setActions` 先保存完整描述，再调用 `setAttackOrSave`，独立设置次数/充能；attack、save、damage 有明确实现，未识别才建 Utility。这直接帮助纠正“整项有复杂规则就全手动”的设计。 | MIT，2.4.0；manifest verified Core14.368、dnd5e6.0.5，不能宣称已在本机5.3.3验证。采用职责和实现参照，字段对照5.3.3，不原样复制全部正则、默认值或效果推断。 |
| wickercar AI Monster Importer | 固定提交 `7381ed0c34a63020cb870be93d041435e7ab12d1` 的总流程及逐能力 parser | 先基础信息、完整能力清单，再逐能力小 schema 提取，最后确定性 formatter；这是恢复有限语义提取的具体参照。 | 老版本，仅作设计参考。逐能力异常返回 undefined，并过滤失败项；分字段异常返回空对象，switch 还有穿透，均不能采用。 |
| 官方 dnd5e 5.3.3 | 上述精确提交的 Activity/Uses 源码与同版官方怪物卡 | 提供准确字段形状、系统推导及真实卡配置的对照，可以用于固定输出断言和行为验收预期。 | 结构/源数据与运行时行为分开；完整原文仍是规则语义的最终依据。不能拿2024 MM变化覆盖2014来源。 |

源码：[Aioros 固定实现](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiActor.js)、[其 manifest](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/module.json)、[AI Importer 分步流程](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/genFoundry5eMonsterFromTextBlock.ts)、[失败项过滤反例](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/text-parsing/Parsed5eItemParser.ts)。

一手报告也已读正文及可见跟进：[AI Importer issue 5](https://github.com/wickercar/foundry-ai-text-importer/issues/5)，用户提供原文，报告豁免熟练与加值错误并称多来源重现，未见修复确认；[Aioros issue 65](https://github.com/Aioros/5e-statblock-importer/issues/65)，实际用户要求逐字段导入预览、未知文字提示和原文保存。这些支持数值对照、完整性和可解释预览的必要性，不证明任何第三方模块已经满足本项目。

AnySearch 混合检索成功，但 code.snippet 结果未可靠限制到指定仓库，故只作线索。GitHub blob 源码提取只得到行号，转读固定提交 raw 原文。Context7 指定5.3.3仍返回6.0.x/Wiki，只作导航，所有本次版本结论回到本地锁定提交。最初猜测的 attack.mjs/save.mjs 路径404后，改查仓库树找到 *-data.mjs，没有按同一错误地址反复重试。

## 建议路线与最小反证

建议保留分步处理和完整来源，恢复逐能力的受约束事实提取，并把“完整能力正文”“可执行基础部分”“仍需 GM 的规则”分别表达、分别验证。优先复用现有 canonical/parser/generation 通道；不要简单放宽现有 gm-manual 分支允许混入执行字段，也不要整体回退到要求模型抄整篇和计数的旧流程。

下一轮如获实现授权，先证明保存 Cloaker 在当前代码下缺字段，再以同版官方卡校对新候选。回归应包含普通攻击的不同目标措辞、纯 Save/伤害、带复杂 rider 的攻击、条件追加伤害不得变无条件、短休资源以及不相关样例。之后从正常模块入口完成一份未参与修复的新来源，实际验证攻击/伤害/豁免/扣次与恢复，而不再只检查文本、导入和刷新。已有独立有效的保存证据不必为文档更新重跑。

基础目标已经由用户明确说明；实现选择不能再转嫁为“你要不要保留攻击”的澄清问题。若后续涉及新增特殊自动化或改变 GM 决策边界，再针对具体规则提问。

## 待判断引入／本地化

- Aioros：作为实现对照，外部模块本机状态仍 Untested；本轮不安装、不引入新运行依赖。
- AI Monster Importer：借鉴分步职责，不作为当前版本安装候选，不采用丢能力或吞错路径。
- 官方系统：直接使用已有锁定资料，没有新增模块本地化事项。
- 若有新候选：先核许可、固定版本及目标字段，再使用同一完整来源比对基础操作、条件后果和资源，最后才做独立实际运行验证。

## 证据身份与检查范围

以下 SHA-256 对应本轮实际读取的产品候选原件：

| 文件 | SHA-256 |
| --- | --- |
| staged-extraction.ts | `deecd84f949cb5b3932318f353aa5b734d583b7384e64e128c2f9ccd3824e662` |
| encounterIntake.ts | `a08f1c92e479f3aa9889d33c7d176cc26f6276547a25f5f6c8066cd28ccdacd1` |
| forge-staged-extraction.test.ts | `c7a31d5c4c603825146d7f778cbfe12f02ebab3ef2df83965d4b954dd53be249` |
| expected-corrected-actor.json | `f3a1d3267405bb2571b192eea0e018f0e81c2dcdf8a894c4bbc2f266eb9d3181` |
| Cloaker.md | `c16797a7af4250418bde417c3578b98b96f961b3def69a8f23cf2ec3df277e49` |
| 官方 cloaker.yml | `9ffdeb4c480a87100341b40e8fc33496d824ebfeef70f12b4324157f3e798320` |

实际检查：聊天全页读取、候选代码与既有测试意图核对、保存 Actor 八项活动/uses 只读核对、官方 YAML 四项基础配置解析、共享 references verify、外部固定源码/manifest/两条用户 issue 阅读。未重跑产品测试，未作运行时点击或新生成；本轮没有产品变更使这些检查成为必要。

本次仅新增调查报告，未改变用户入口、输入输出契约、支持版本或操作步骤，不需要重建工具手册。业务修复、全新来源行为验收、发布均未执行。
