# Forge 46 项完整对照回归：预期变化、新回归与既有问题

日期：2026-10-28。沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD `5dc5702767bbcb0818a05a02e45c925289e66758`。本轮只验证及记录，不实施修复。

## 结论

**46条检查/交付路径已逐项核对，但当前版本不能判为整体无回归。确认1类新回归、3项既有机械缺陷/覆盖缺口，以及1项既有报告问题。** 正确旧产物大部分保持；不能把保留Actor与完整机械可用混为一谈。

- **N01，新回归，P2**：3个明确“自身获得临时生命值”的历史兼容用例，目标从self退成any/数量未定。与上一轮B15缺目标改动有关。
- **E01，既有产品缺陷，P2**：Warrior Infantry的Pack Tactics要求盟友没有失能，却新增失能效果并链接Utility。在本轮未提交修复前的官方状态版HEAD中也可复现；相对更早正确无Effect产物是错误增量。
- **E02，既有关联缺口，P2**：Roper Tentacle有正确受擒/中毒模板，但没有任何Activity链接。不是整只无产物，也不是攻击消失。
- **E03，既有阶段缺口，P2**：Behir Swallow的吞入目盲/束缚模板存在；吐出或逃出时倒地只有正文，没有独立阶段模板。没有删掉以前已实现的倒地模板。
- **R01，既有报告问题，P3**：Unicorn/Spirit Naga引文成功重定位后仍报不完整；完整Actor与对应草稿严格相同。

所有现有产品源码、既有测试、旧报告及冻结材料保持。新增模型服务调用0，无提交、合并、推送；没有操作Mirror、Next或生产，没有投骰、Use/Cast/Apply或真实宏执行。

## 授权、基线与方法

用户本次原话：

> 行，先不改代码，用现有冻结材料把46项完整做一轮对照回归，重点查有没有破坏原来正确的产物，把预期变化、新回归和既有问题分开列清楚。沿用当前worktree，保留原答和失败产物，不新增模型调用，不提交、合并或推送。

46项指[原46条检查/交付路径](../acceptance/2026-10-27-forge-generation-delivery-remediation.md)，不是46只怪物。本轮对照时间点分别为旧46版本、官方状态正确修订、12类保留修复后、22项修复后和当前版本，避免用历史失败产物作正确标准。

私有证据根E：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-46-comparison-regression`。

`baseline.json`登记2717个工作树文件与2942个既有证据文件；补验前另登记825个更早冻结证据文件。只登记路径和SHA-256，不制作源码备份或覆盖原件。所有诊断脚本和新产物位于E，仓库只新增本报告。

正式回放均经实际provider接收/草稿分析→renderer→parser→workflow/generator→verifier；注入已有回复代替HTTP，额外discover/review/repair方法禁止调用。正式Actor回放沿用各场景core/图标关闭，锁定Bun1.3.14及既有hermetic安全包装；独立消费者和历史版本正控保持各自测试契约。目标沿用各冻结场景14.364或14.368/dnd5e5.3.3，不混用prepared与保存字段。网络guard实测载入，拒绝外部fetch；仅允许安全测试自己的loopback API。没有真实模型服务请求，注入响应的extraction计数不冒称真实新调用。

原样回复、保存IR、单字段派生、机制构造及只读恢复分开标识。新旧Actor逐字段比较包含正文、flags、目标、效果、资源及链接；另完整保存导入适配结果。两个独立只读复核分工检查46项覆盖和来源语义；`independent-review.json`为父代理据实际回报转录的收据，不说成审查者写入或执行测试。

## 新回归N01：明确自身的临时生命值被降成未知目标

现有3个用例分别是英文固定6点、中文固定6点、英文1d6临时HP。原文明确`it gains`、`它将获得`或`the creature gains`。当前仍有正确数量、temphp及special激活，但目标变成any，人数空，spec范围，并提示GM目标未知。实际后果是原本可直接用于自身的活动需要重新确定目标。

根因：`packages/intake-ai/src/orchestrator.ts::applyExplicitTemporaryHitPointMechanics`的历史fallback识别数量/种类后只写`{formula,type:'temphp'}`，过去依赖共同生成器缺省self。B15在`packages/generation/src/activity.ts`将真正缺目标改成any，未同步这个已从来源确认自身的旧消费者。证明范围是显式历史SourceAudit兼容链，不泛化成所有fresh完整IR都改坏自身目标。

对照只在内存读取Git HEAD的`activity.ts`，其当前diff唯一运行行为差异就是B15收件对象处理；其他当前代码不变。原3测试在旧模块下3/3通过。同一正式workflow、相同工作目录的完整产物对照也均旧self、新any。收据：`pre-b15-module-receipt.json`、`pre-b15-healing-test.log`、`probe-current/healing-self-*/`与`probe-pre-b15/healing-self-*/`。没有磁盘恢复、源码副本或手修Actor。

拟议修法：在负责来源识别的入口，为来源明确自身的grant写入self/count1；保留真正未知目标的any策略，以及明确其他目标/数量/范围的正反例。不能把公共默认全部退回self，也不能只改3个测试期望。

## 既有机械问题与报告问题

| 编号 | 对象、事实及影响 | 历史/证据 | 拟议机制修法 |
|---|---|---|---|
| E01 | Pack Tactics的盟友否定前置误生成失能模板，且挂到本能力Utility。GM模板仍是错误效果；本轮没有实际施加 | `probe-current/ledger-warrior-infantry/`；同canonical在当前/HEAD actor-effects均误生，`pack-tactics-{current,head}.json`。宽主体/谓语扫描未识别doesn’t have及盟友归属 | 在状态施加谓词中处理否定和真实主体/从句归属；保留Oni、Mi-Go、Rakshasa及真正命中/失败施加状态正控，不整体关闭推导 |
| E02 | Roper Tentacle保留+7、60尺和全文，Item有Grappled/Poisoned两模板，唯一attack-roll Utility的effects为空。模板未进入对应活动 | `probe-remaining/four-roper/`；`status-head-baseline.json`同源HEAD两个生成拥有者同样无链接 | 无伤害攻击按明确源OP关联命中结果的GM模板；不虚构Damage或第二次攻击，不误挂到别的Save |
| E03 | Behir Swallow保留DEX18、吞入目盲/束缚、酸伤/吐出CON14及全部退出规则；退出Prone未投影成独立阶段模板 | `probe-remaining/area-behir-2024/`。HEAD也无该退出模板，旧正确范围未包括它，不能称本轮删掉已有效果 | 为确证的退出结果保留独立、带完整触发条件的GM阶段模板；不能将Prone混入吞咽失败当场施加组 |
| R01 | 原答-1坐标被成功绑定后仍出现28/25条非阻断FIELD_PROJECTION_INCOMPLETE；原答/草稿完整Actor严格相同。影响是多余问题提示 | `probe-current/{raw-control,draft-control}-{unicorn,spirit-naga}/`。provider的evidenceRecords用“原/新坐标相同”判断完成 | 正常坐标整理留追踪；真正无法定位的附带记录才报不完整。保留原答，分测机械相等与报告历史 |

E01与E02经过只读Git模块内存对照；E03的历史对照仅证明此前也未实现该阶段，不把“全文仍在”当成官方状态模板已经完成。

## 已确认的保持与预期变化

| 对照层 | 本轮结果 |
|---|---|
| 旧46十Actor | Hydra、Black Pudding、Shield Guardian、Unicorn、Spirit Naga完整JSON0差异；其余差异逐项如下 |
| 最近14份保留修复产物 | 全部完整JSON0差异；含原样、单变量派生和机制构造，不计成14个独立官方首答 |
| 较新正确Otyugh/Medusa/Mimic | 三份完整JSON0差异 |
| Ghoul、Dust原答 | 重新经过真实接收及正式生成，与各原正确Actor完整相同 |
| Brass及4个治疗/台账边界 | 与最近正确产物完整相同；旧Brass只增加已确认的两阶段官方模板和链接，保留旧hash反证 |
| v1/v2正式草稿 | 原保存artifact严格相同、不重生成；仍是旧Brass hash是恢复契约，不应自动升级 |
| Unicorn/Spirit Naga raw/draft | 完整Actor0差异；仅输入整理追踪及报告差异，见R01 |
| 原四首答补验 | Ankheg仅来源受擒模板/链接增量；Unicorn、Spirit Naga完整相同；Roper另列E02，不能判整体全通过 |
| 旧14+当前14的导入适配 | 各core/Midi共56产物。Core全字段0差异；Midi仅精确允许字段，源Actor未变 |

旧→当前的预期状态变化已按来源确认：Ankheg Bite受擒、Medusa首次束缚/二次石化及失能、Mimic Adhesive/Pseudopod受擒、Rakshasa恐慌及失能、Oni Nightmare Ray恐慌、Mi-Go Pincer受擒与Dazing Ray震慑及失能。Mi-Go Extract Brain已有状态前置没有误加；Mimic Bite没有误加受擒。Priest恢复7ref、两分组、独立1/day及共享3/day；Ettercap只去除Reel错误束缚。Warrior不在预期列表中。

Otyugh对旧46的34路径变化：6处效果/链接、2处原答failureStatuses恢复、26处仅去掉程序生成的GM诊断尾句。四能力原描述完整保留；后三项nativeRuleText与原答逐字一致。长休、HP上限、体型、逃脱和下回合期限都未丢。与后续官方状态正确版全JSON相同。

更早gear/area样本新增literalMechanics记录，7组共16个Utility ID替换按Item/sourceLogicalPath一一对应。活动除了ID、显式名字、图标及等价HTML外字段相同，旧ID没有悬空引用；所有改动说明的可见文本相同。Balor两处sphere→radius、两份Fire Elemental的proof单元素整理与spec→self均是已有来源支持的范围修正，尺寸和其他字段保持。Gladiator Shield Bash、Balor Flame Whip、Behir Constrict/吞入的新增状态及链接有来源支持；Behir退出阶段仍按E03单列。

Midi允许增量逐条核值：`otherActivityCompatible=false`、`triggeredActivityId='none'`，以及适用时`removeChatButtons='none'`/`autoCEEffects='none'`；全GM模板活动的`effectConditionText='false'`为字符串；GM Effect的`dae.dontApply=true`。无Item/Activity/Effect数量、ID、链接或机械字段损失。见`adapter-classification.json`及完整`probe-current/adapters/`。

## 测试失败分类与未执行边界

执行26个仓库既有安全入口，另用同一hermetic包装只补选12个因环境未设而skip的既有冻结用例。当前27个入口中20个退出0、7个保留失败退出；各组有重叠，不相加成成功率。最初23条skip记录对应12个不同名字，已全部补执行，补验5pass/7fail。原始skip和失败日志保留，没有改断言凑绿。

按显示的完整用例名去重，共27项失败：

| 数量 | 分类 | 说明 |
|---:|---|---|
| 3 | N01真实新回归 | 自身临时HP变任意目标，已做修改前反证 |
| 15 | 旧契约、展示或无语义顺序断言 | 7个empty-fields、1本地化状态、2Confusion标签、2旧staged协议、3official断言。实际失败点与当前产品要求不一致；后续未跑断言不冒称通过 |
| 7 | 旧快照未包含已确认修复 | Mi-Go、两项Rakshasa、gear Gladiator、Balor、Behir、四首答集合。已另存完整产物核预期差异；集合中另发现E02、Behir另发现E03，不能整体称无问题 |
| 2 | R01报告/追踪差异 | raw/draft IR深相等失败，但完整Actor相同；仍有诊断口径过宽的问题 |

三个official测试被旧断言提前挡住的机械检查已单独补读实际产物并执行原检查：Gladiator两攻击5/20尺、+7、远60尺且只有一份伤害；Medusa两段伤害各一次；Priest通过真实Cast builder构造7个Cast，均WIS/DC13，4个bonus Cast消费同一3/day池。使用既有测试UUID作纯构造，不冒称缓存已水合或Cast已运行。见`official-postassertions.json`。

其他旧断言：3个易伤正控已保留Actor/备注，只在要求坏报告否决整只解码处失败；非法备注原值和问题仍保留，不被当成真实易伤类别。Confusion完整原文、WIS13、15尺球、专注、传奇消耗2均在，未伪造官方Confused状态。本地化错误保留原语言Actor并提示needs_review。旧staged正式链不应因旧断言恢复。详细名字在`test-summary-final.json`。

没有执行128+操作压力、真实浏览器磁盘满额、任意自然语言组合、真实Use/Cast/Apply、治疗/资源结算、生产/Next或全仓CI。既有类型/构建及Mirror证据只按未改变源码和目标的范围复用，不写成此次新执行。旧测试提前失败后的其余所有变体不笼统标通过；当前机械产物用独立回放和读回补实质缺口。

## 46项逐条记录

缩写：C=`test:forge-46-core`；F=`test:forge-46-frozen`；P=`diagnose:forge-preservation-frozen`；PC/PG/PD=`test:forge-preservation-content/generation/delivery`；G=`test:forge-generation-preservation`；Modes=`test:forge-preservation-modes`；I=`test:forge-actor-delivery-regression`；R=`test:forge-actor-read-access-regression`；E=`test:forge-46-encounter`；CLI/WEB=`test:forge-cli-delivery`/`test:forge-cli-web-delivery`；D/Q/B=`test:forge-discovery/batch-queue/blueprint`；H=`test:forge-healing-resource-boundary`；M=`test:reviewed-localization`；BC=`test:forge-behavior-contracts`；Review=`test:forge-ai-review-disabled`；Status=`test:forge-official-status-effects`；Projection=`test:forge-projection-preservation`；Adapter=56份纯适配全字段比较。

| 原项 | 路径 | 当前证据 | 结果与边界 |
|---:|---|---|---|
| 1 | 无正常AI答复 | C / I / E | 空答与请求失败隔离；旧Actor及后续成员保留 |
| 2 | 回答外壳、IR与Markdown | C / R / CLI | 完整IR及可读Markdown沿正式链交付，原答保持 |
| 3 | 行号、引文与offset | F / PC / 原答全字段 | 机械字段保持；R01：成功重定位仍有过量不完整提示 |
| 4 | 根结构与未知字段 | C / PC / empty-fields | 正常字段保持；旧整卡拒绝/字节形状断言单列 |
| 5 | 技术ID、名字与资源身份 | C / PC / P | 重复ID和非法ID反例保留能力及同步资源关联 |
| 6 | 数量与长度限制 | C / CLI / E | 既有>12伤害段、长来源、>20成员通过；未新增128+操作压力证明 |
| 7 | 公式、距离、目标、治疗和Save | C / H / N01 | 明确结构目标正控保持；N01：历史自身临时HP链退化 |
| 8 | 伤害与引文逐段配对 | F / G / Modes | 共享伤害、互斥伤害完整；无额外段或扣费 |
| 9 | 条件、互斥与替代分支 | C / PG / Modes | 父子/替代状态及真实操作分支保持 |
| 10 | 攻击携带官方状态 | PG / Status / 全字段 | 确认E01错加失能、E02无伤害攻击漏链接、E03退出阶段缺模板 |
| 11 | 法术与资源关联 | C / PC / P / H | Priest7refs、共享资源、原缺台账0及明确台账分别保持 |
| 12 | 施法展示、属性与体型 | PC / F / P | 缺ability不吞ref；原体型/正文及其余能力保持 |
| 13 | parser重复检查与throw | C / PC / PG / G | 局部问题不取消其他操作；非法备注只报对应字段 |
| 14 | generator模式及关联 | C / PG / Modes | 正常/冲突模式保持；N01/E02的具体投影缺口单列 |
| 15 | neutral与伤害模式 | F / Modes / Adapter | Mimic两完整伤害分支保持；Roper无伤害攻击另见E02 |
| 16 | 总catch吞生成产物 | C / G | icon/presentation/report/finalize失败保留已有完整Actor |
| 17 | 重复生成与验证 | G / F | projection finding不触发第二次生成，回放请求账本保持 |
| 18 | validator、摘要与文件交付 | C / CLI / WEB | 报告异常不吞Actor和路径；CLI具体内容退化见N01 |
| 19 | IR、Markdown、Actor保真 | Projection / 全字段 | 逐字段比较；不能以默认verifier通过抹去E01–E03 |
| 20 | 响应元数据解码 | C / empty-fields | 坏报告保留artifact并提示；3个易伤旧decoder否决断言不适用 |
| 21 | 状态与候选可获取性 | C / I / WEB | 非accepted产物仍可获取；未伪造accepted |
| 22 | AI内容复核关闭 | Review / F / CLI | 无自动review，零真实模型服务请求 |
| 23 | repair失败与追加调用 | I / Review / CLI | 失败保留原答/Actor，不隐式追加请求 |
| 24 | 旧staged与显式SourceAudit | D / BC / CLI | 正式入口保持完整IR；2个旧staged断言过时；历史正控N01退化 |
| 25 | 删操作与整卡文字兜底 | G / C / F / P | 已知攻击/伤害/Save/法术未退成整卡文字；N01目标仍需修 |
| 26 | 新工作台获取与采用 | I / R | 实际应用handler离线通过；本轮没有新浏览器验收 |
| 27 | plaintext与非accepted保存 | I / CLI / WEB | 保留response、输出文件与候选 |
| 28 | 旧UI和蓝图限制 | I / B / R | 超过八组件及既有编辑采用路径保持 |
| 29 | Key、环境、连接与长度 | R / B | 无Key本地读取/下载及大输入保持；Item独立边界保持 |
| 30 | 来源、候选和批准身份 | I / R / E | 编辑/重分析失败保留旧候选自己的来源与目标 |
| 31 | 单Item形状否决Actor | C / PD / F | 完整artifact获取与坏配套记录隔离；不宣称任意坏JSON可保存 |
| 32 | 导入与Midi适配 | I / Adapter / Modes | 旧14+当前14各core/Midi共56；全部只有精确允许增量 |
| 33 | GM、ID、归属与冲突 | I / PD / E | 只限制对应世界写入，不抹候选或别的成员 |
| 34 | 保存读回与内容变化 | I / PD | 资源/免疫/移动/正文/期限等差异检测通过；不是本轮新世界写入 |
| 35 | 存储、quota与取消 | Q / I | IndexedDB适配器隔离通过；不冒充真实浏览器磁盘满额 |
| 36 | v1/v2草稿恢复 | F / G / R | 原artifact完整相同；清旧GM批准，不自动升级成新版Brass |
| 37 | 批量获取与逐项状态 | Q / I / E | 部分成功、文本无IR和取消状态保持逐项结算 |
| 38 | 发现分区和数量 | D / CLI | 完整来源、错行号/重叠/相同ID隔离；旧staged期望单列 |
| 39 | 单成员失败继续 | E / CLI | 中间失败后继续；恢复不隐式调用模型 |
| 40 | 部分遭遇包交付 | E | 保留已有artifact，缺失成员明确列出 |
| 41 | 状态目录与配套元数据 | E / PD | 坏配套只影响该项，完整Actor及原始记录保留 |
| 42 | 手工规则与控制覆盖 | E / PD | 坏控制撤下该控制，原生能力及规则保留 |
| 43 | 缓存产物复用及报告恢复 | E / P | 保存artifact按原hash复用，展示/报告失败不重生 |
| 44 | 翻译与本地化失败 | E / M | 局部失败保留Actor；旧failed期望应为有问题的候选 |
| 45 | 宏失败与逐项导入 | E / I | 离线实际应用路径通过；旧Mirror成功/失败分结算证据限定复用 |
| 46 | 宏启动与绑定前提 | E / PD / M | 坏代码/归属/绑定/长度只隔离相应宏；本轮未执行真实宏 |

## 后续修复建议与收尾

本轮停在对照回归与方案。建议先修N01的来源明确自身消费者，再修E01否定/主语识别与E02无伤害攻击关联，随后补E03独立退出阶段，最后收敛R01报告口径；每项复用本轮失败产物和正控，小批修改后重验受影响链。未获得新的修复执行授权前不实施这些改法。

最终源文件/证据/Git核对见`final-validation.json`：原工作树文件和3767个保护证据无变化，无删除、无索引变更、HEAD保持；仓库仅新增本报告。报告新增没有改变用户入口、操作步骤或支持版本，因此没有刷新手册或重跑无关类型/构建检查。所有原答、历史失败Actor及本轮新失败/对照产物保留。
