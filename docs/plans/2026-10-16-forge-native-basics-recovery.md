# Forge 基础操作与复杂能力共存修复方案

日期：2026-10-16。状态：供用户审阅，尚未实施。基于现有候选 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample`。本轮只读源码并保存方案，没有业务代码修改、产品测试、生成调用、安装或浏览器操作。

## 交付目标与采用路线

保留已有来源切分、基础数据分步、完整原文、中文审核和正式生成链。修复能力事实提取与执行边界，恢复普通攻击、伤害、豁免、次数/消耗/恢复，并允许同一项能力同时拥有原生操作与明确的 GM 后续规则。最终 JSON 仍由现有 renderer → parser → generation → verifier 产生。

采用有来源证据的逐能力提取；不整体退回旧的大段模型请求，也不只增加 one creature 正则。现有来源程序可无歧义提取的事实继续使用；其余完整能力进入小 schema 模型提取。模型只能提出封闭字段与其短引文，完整正文、来源身份、位置和能力清单仍由程序持有。单个能力未能可靠提取时保留其全文和明确的手动/复核状态，不删能力，不过滤异常。

### 外部实现的具体用途

- **主参照：Aioros 5e Statblock Importer**，固定提交 `98f5bd9bf3a18b3cb50429f1bef6b735de32271e`。借鉴 `setActions → setAttackOrSave → setPerDay/setRecharge` 的职责：完整描述先保存，执行配置分别添加，未识别项最后保留 Utility。借鉴其攻击、Save、damage、uses 的组装实例；其字段逐项对照本项目目标5.3.3，不能原样复制全部正则、默认值或状态推断。[源码](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiActor.js)
- **提取职责参照：wickercar AI Monster Importer**，固定提交 `7381ed0c34a63020cb870be93d041435e7ab12d1`。借鉴基础资料/完整能力清单/逐能力小schema/确定性formatter；不采用异常返回undefined并过滤、异常空对象或switch穿透。[总流程](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/genFoundry5eMonsterFromTextBlock.ts)、[错误处理反例](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/text-parsing/Parsed5eItemParser.ts)
- **字段和预期实例：官方dnd5e5.3.3**，提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`。同版Cloaker的attack/save/uses/consumption与Activity/Uses模型直接作为结构对照。完整来源决定规则语义；官方卡不是允许错误默认值的豁免。[同版卡](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsters/aberration/cloaker.yml)

第三方模块本机仍未安装和实测。无需引入新运行依赖、复制整套导入器或重新设计Forge界面。原始外部研究、版本/许可及一手问题证据见[调查记录](../reviews/2026-10-16-forge-intent-regression-and-implementation-references.md)。

## 1. 能力表示：明确允许“原生操作＋GM规则”

现有 `gm-manual` 的含义是整项不执行，并被validator、renderer、parser、generator、verifier共同强制。不能简单放宽它的字段白名单。

建议在现有能力契约增加一个明确的混合执行分支，暂名 `native-with-gm`（这是提案名，当前不存在）：

- 完整 `description` 和来源证据继续原样持有。
- 原生部分复用既有 attack/damage/save/uses/recharge/activation/range 字段，逐项绑定来源依据与前提。
- GM部分只引用本能力或其已绑定共享前言的原文范围，保存未自动处理的规则与原因，不产生可执行代码。
- 三种情况分开校验：完全原生、原生＋GM、完整纯手动。仅有明确次数/消耗可执行、其效果手动的能力也属于混合分支，例如Phantasms。

模型不决定“整项复杂就不提取”。它提出本能力中明确的基本事实、基础/追加/替代/条件伤害关系、Save触发与后果，以及剩余规则。程序验证字段、数值、伤害关系、证据归属和条件绑定。数字在原文出现本身不足以通过；无法区分基础伤害与条件/持续伤害时不生成猜测的伤害。

若有多个Save、命中后另作Save或替代伤害，只有现有子活动/分支表示能完整表达其触发、顺序和共享资源时才使用。不能安全表示的后续部分继续手动，保留不受其影响的基础攻击/伤害。若连基础部分也不能独立成立，则完整手动并标明具体原因，不能误报基础功能已配置。

## 2. 四类基础功能的恢复方式

| 功能 | 提取与投影 | 必须排除的错误 |
| --- | --- | --- |
| 攻击 | 恢复source-explicit近战/远程、武器/法术类型、命中总加值、触及/射程和目标限制；复用CanonicalFeature.attack与现有Activity生成。目标措辞与后续规则不再决定是否整项放弃。 | 不能把印刷的+6又加一次熟练/属性；原文未确立的分类不凭名称猜。2024泛化措辞单列分类反例，不能因词形变化照抄2014/2024另一版数值。 |
| 伤害 | 基础与明确无条件追加伤害走既有damage/sourceDamageParts；条件、替代、持续伤害分别保存。仅受支持且语义等价的分支进入活动。 | 不能把每回合伤害或倒地后额外伤害加进每次命中的基础伤害；不能自动加入来源未有的属性伤害加值。 |
| 豁免 | 恢复DC、能力、触发、范围/目标及来源明确的成功/失败伤害；复用已有Save和分支投影。原文给出的固定DC以literal身份保持，不因目标豁免属性或能力名称重新计算。命中后触发的Save不能冒充独立立即Save。 | 来源未写半伤时不能默认半伤；需要GM筛选目标不应连明确的DC/能力也丢掉；普通Save与目标自选INT/WIS保持不同边界。 |
| 资源 | 分别恢复max、消耗位置与day/sr/lr/dawn/recharge；复用既有structured uses和Activity消费通道。标题和正文有冲突时报告，不按能力名推断。 | 1/1显示不等于能扣次；不能每天变成长休；多个活动不能各自复制一个池或重复扣次；无次数依据不默认一次。 |

Phantasms原文及官方同版实例明确一次使用，短休或长休后恢复。投影为max=1、消费1 itemUses、sr recoverAll；随后在目标runtime分别验证短休和长休的实际恢复，而非只看字段。

## 3. 复杂能力如何保留能做的部分

沿用同一个Item与能力身份，不额外制造一个会重复耗动作/次数的“手动版同名能力”。完整中英正文保持；卡片/聊天说明用现有说明区域清楚列出哪些已配置、哪些需要GM。

| Cloaker能力 | 本轮最低可执行结果 | GM部分 |
| --- | --- | --- |
| Bite | +6，触及5尺，2d6+3穿刺攻击；正确单目标限制 | 附着、头部条件、呼吸/目盲、附着中目标与优势、脱离和挣脱判断。已有受支持机制可准确承接的子规则单独核对，不因混合模式一律删除。 |
| Tail | +6，触及10尺，1d8+3挥砍攻击 | 不应因one creature而出现手动降级。 |
| Moan | WIS DC13 Save，原文60尺范围和听觉/异怪限制清楚保留 | 目标筛选、未被现有机制可靠承接的恐慌后果/期限及24小时免疫；已有受支持效果须按既有来源与机制门检查，不默认全部自动，也不默认全部丢弃。 |
| Phantasms | 1次使用、使用扣1、正确休息恢复的Utility | 三个幻象的目标随机、特殊感官例外和消失条件。 |
| Damage Transfer/False Appearance/Light Sensitivity | 完整说明；不伪造环境或附着关系的自动判断 | 对应情境裁定；这些纯规则不需要虚假的攻击或Save。 |
| Multiattack | 正确组合说明与子攻击引用 | 不把本轮扩大成新的一键多重攻击引擎；两项子攻击必须各自可用。 |

“原生攻击＋额外条件伤害”样例还须保留基础攻击，但将条件伤害留在明确分支/GM说明中；不能以条件难实现为理由把基础攻击删除。

## 4. 必须贯穿的代码边界

所有路径均属于上述现有产品工作树；下面是拟修改范围，未实施：

1. `packages/intake-ai/src/staged-extraction.ts`：扩展能力事实响应与逐能力提取，保留来源单元/程序拥有的证据位置；记录实际程序/模型步骤与请求数，不增加外层重试来凑通过。
2. `packages/models/src/canonicalMonster.ts` 及相关StructuredAction类型：加入明确的混合边界与GM余项来源，保持既有纯手动语义和旧输入兼容。
3. `packages/intake-ai/src/validator.ts`、`source-facts.ts`、`renderer.ts`、`packages/parser/src/structuredAction.ts`：验证和传递新表示。**混合模式不得再从整段原文无差别调用parseSupportedRuleFacts**；只消费已验证结构化字段/既有已批准机制，防止GM余项被二次推导为效果。该限制还须贯穿actor-item-builder、actor-effects与Activity里的正文兜底推导，不能只关闭一个parser函数；只在新分支生效，不全局关闭旧入口的既有功能。
4. `packages/generation/src/actor.ts` 与确有需要的Activity/资源映射：复用现有原生投影，允许其附带GM说明与来源标记。基础操作与完整文字在同一Item中共存；uses与consumption必须共同正确。多活动能力明确标识哪个使用入口消费共享池、后续活动是否再次消费，不能用活动排序或数组第一项冒充资源归属。
5. `packages/intake-ai/src/verifier.ts` 及对应正式输出检查：完整正文、原生字段和GM余项分别验；实际多活动逐项核对，不能只验证首个Activity。纯手动继续要求零执行，混合能力要求声明的执行字段存在且额外字段/效果不存在。
6. `packages/forge-browser-runtime/src/encounterIntake.ts` 及实际受影响的包/本地化投影：沿用现有固定能力/GM说明覆盖方式；仅剩说明的GM余项不应被误判为必须新增控制器宏。需要TE/CC的既有闭合规则仍须原有来源绑定和独立审核，不借混合模式绕过。
7. 现有预览/说明和本地化入口：显示具体“可执行/GM”范围，移除对混合能力不适用的“此活动不会攻击/伤害/豁免/消耗”笼统提示。中文从同一份核实事实生成，完整英文原文不受影响。

旧保存包/草稿保持可读，不静默重新解释其纯手动身份；需要重新提取的资料通过明确重新生成产生新候选。机械事实或显示语义变化使旧确认按现有hash规则失效，重新审阅；不自动改旧世界卡。同步相关手册条目、review与生成页，保留handbook:check，不修改无关入口或扩建新UI。

## 5. 防回退证据：改前与改后使用同一组材料

先固定现有源码/保存原文/IR/正式包/输出的身份与哈希，按三类分开：已知有基础功能的旧样例、应被修复的当前失败、确实仅能GM处理的样例。原件原位保留，不制作环境备份，不将当前错误输出照单全收为正确基线。

### 局部与正式生成回归

| 检查 | 明确失败条件 |
| --- | --- |
| 普通攻击至少三种有意义变体 | one target/one creature、近战/远程或不同合法换行中有基础攻击/伤害遗漏。 |
| 复杂攻击保留基础操作 | 添加附着或条件额外伤害后，原有基础攻击消失；或附加条件/持续伤害被加入无条件伤害。 |
| Save成功/失败分支 | DC/能力错误、Success无伤却输出半伤，或后续条件Save被错误提前执行。 |
| 资源 | 只显示计数没有消费、恢复周期漂移、重复扣次、共享池拆开或取消动作也扣次。 |
| 既有特殊边界 | 目标自选INT/WIS被擅自选一个属性；条件抗性变无条件；延迟/分阶段状态提前施加；来源缺失/数值冲突被manual标签放行。 |
| 既有能力不退步 | 旧攻击、Save/伤害、TE/CC已支持规则及其无关不触发反例发生变化；旧中文/原文/图标或保存重开行为被破坏。 |
| 篡改检查 | 主动删除攻击/伤害/Save/consumption或改DC、max、period后，正式verifier仍给通过。 |
| 不相关入口 | 原有普通Actor/Item、Blueprint及必要V12静态生成样例出现无理由变化。 |

断言通过来源→正式renderer/parser/generation/verifier的最终Actor完整结构与来源语义；不能只检查helper结果。对不相关已知正确样例只允许明确登记的变化，不屏蔽activities、effects、uses、中文、图标或文档/活动ID及绑定关系。运行时间等已知临时元数据可按原有规则归一化。

保存IR重投影用于保护生成器；保存来源经能力切分与新提取契约的测试用于保护上游，两者分别记账。新契约需要的测试回复若为测试作者构造，明确标记fake，不能冒充模型真实生成。旧“复杂攻击必须没有attack/damage”的断言须改为“基础操作存在＋手动余项不执行”，保留纯手动的零执行反例。

已有检查入口可复用：`test:forge-staged-manual`、`test:forge-save-branch-projection`、`test:forge-raw-contracts`、`test:forge-encounter`（含structured-source-uses）、`test:reviewed-localization`、`test:parser-focused`、`test:generation`；按实际修改范围选取并复用已有效的共同检查。模块整合边界运行受影响Forge测试/构建、types、architecture、局部anti-overfit和手册检查；不默认重复全仓CI。每次新增/重复检查记录它回答的具体变化或缺口。

### 正常入口与真实行为验收

离线通过后冻结一个候选。在后续明确实现/本地验收授权下，核对现有Mirror身份，按当前Chrome技能与已指定执行器使用正常Forge入口：

- 一份未参与修复、同时有攻击/Save/资源及复杂规则的新来源，从零走正常DeepSeek生成、中文审核、导入，保留首轮回复与失败；不注入答案，不用专用helper绕过生成入口，不外层重试凑通过。
- 已保存Cloaker作为固定失败回归，用正常候选导入后实际掷Bite/Tail攻击与伤害，读回公式和总加值；攻击是否碰巧命中不作为公式正确性的替代判据。
- 实际发起Moan WIS DC13并用自有目标完成Save；核对范围/限制，确认GM余项没有偷偷施加效果。
- Phantasms实际使用后1→0，取消行为不扣次；从耗尽状态分别验证短休和长休恢复；固定资源最终状态，再刷新读回。若任一失败，不把显示1/1或刷新成功称为资源可用。
- 至少一项带复杂后果的攻击，证明基础操作运行而手动余项不自动执行；至少一项原有受支持TE/CC闭合规则与其负例，证明没有被新模式静默降级。
- 读取最终Item/Activities/Effects/Uses、完整中英文本、图标与截图，最后才按当次明确范围处理自有fixture。复用独立有效的旧证据，不因报告变化重跑。

任何层级失败均保留具体结果，不用通过数量、导入保存或另一份怪物通过替代。能证明的是本次变化的功能与兼容范围；不声称有限样例可以保证所有自由文本永不出错。

## 实施顺序与当前停止点

顺序：固定基线与失败 → 表示/提取/防二次推断 → 原生操作和资源投影 → 正式verifier与回归 → 模块/中文整合 → 冻结后正常入口及行为验收。中间无需反复重装Mirror试错；取得必要离线证据后才进入受影响的真实使用验证。

当前停在方案审阅：未修改业务代码，未运行上述计划中的测试，未调用模型或操作Foundry。用户尚未授权发布，不提交、合并或推送。
