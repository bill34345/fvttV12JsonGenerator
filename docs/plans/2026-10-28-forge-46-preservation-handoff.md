# Forge 46 项整改：能力保留缺陷与交接

更新：2026-10-28，Asia/Shanghai。交接来自当前聊天 `01a17bee-ceb9-7eb3-8fce-a8320e15295f`；前序只读审阅聊天为 `01a17adc-866c-7053-9668-326e795f4b96`。

## 先读结论

**当前版本有已确认的能力丢失和错误新增效果，不能按“46项已统一修好、可放心使用”交付。** 前代理已向用户撤回这一整体完成结论。既有具体样本的通过证据继续有效，但不证明全部输入分支符合“不删已有能力”。

最近四只2024规则官方怪均取得完整模型回复、生成了Actor，也都通过正常Forge入口创建到Mirror；其中Ghoul、Dust Mephit通过本批配置对照，Ettercap、Priest有实质语义失败。新问题已只读定位，**尚未修复**；全46项对数据删除／降级路径的重新回查也**尚未开展**。不要把本handoff或此前助手建议当成已经实施的整改。

用户当前最后指令是“给一个 handoff”。本次只整理交接，不修改产品、不运行测试、不调用模型、不新增提交。

## 用户原话、要求与当前执行范围

原46项实施要求：

> 只有 AI 没正常返回才能阻止整只 Actor 生成，其他问题不得挡住产物获取或删掉已有能力。

官方状态要求：

> 像这类攻击会附加，或者说是豁免失败会附加的这些状态，都要做进对应的 activity 里面的 effects 里面。

> 如果这个状态是官方状态的话，那他是一定要处理的。

最近已执行的授权：

> 行，先把这轮修复按功能做本地提交，不合并、不推送，保留全部证据。然后按这四类机制测4只2024规则的官方怪，每只一次模型请求，共4次，不复核、不重试。检查Activity、伤害、Effects和资源，不投骰，也不重跑已通过的测试。

测试后用户的质疑：

> 这就跟暗雷一样 说白了你改的有问题 既然出现了这一次，那这 46 个拦截还可以导致其他问题发生 好恐怖

> 你信誓旦旦说修好了 结果根本不能用 哎

> 为什么每次都要等扩大测试的时候才能发现？自己从来不做 code review 的吗？

适用边界：

- 沿用现有worktree，保存原答、已有Actor、草稿、安装候选、历史失败和全部证据。不能手改最终JSON凑通过。
- Actor存在、检查结论、具体能力可用性分开报告。保留说明文字不能替代已经明确的攻击、伤害、状态、法术和资源。
- 内容检查不得再次取得整只Actor否决权。GM权限及真实文档冲突只约束对应世界写入。Item／Species的独立契约不因共用文件修改被扩大。
- 本批**4次真实模型请求已全部用完**。没有剩余额度；无AI复核、纠错、重试、发现或翻译调用。后续可复用冻结材料，不把“继续”自行解释为新增付费额度。
- 用户要求检查Activity、伤害骰／加值、Effects和资源，**不投骰**。本批也未Use／Cast／Apply状态；旧手动Apply功能验证可复用。
- 已通过且未受影响的测试不重跑。新检查应对应具体缺陷、变更或必需的新集成缺口。
- 不合并、不推送、不操作生产、不清理worktree、不覆盖他人修改。最近本地提交授权已用于下述四批；本handoff没有执行新提交。
- 原实施授权、最近测试授权和助手建议分别记录。下面的“建议接续”不是用户已经逐项批准的新计划；接续时以用户新指令及既有有效授权确定工作，不新增无依据的审批门槛。

## 工作树与Git基线

工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`

分支：`codex/20261019-forge-ab-fixed-replies`

HEAD：`5dc5702767bbcb0818a05a02e45c925289e66758`

| 本地提交 | 内容 |
|---|---|
| `c8ef5a033075cda1ac0ab5ee22225cdc0a2b5af7` | 完整回复接收、把内容格式处理移出transport、原答取证 |
| `95828ed7edf685a72d815d2ae29b41e0b19813ab` | 短休／长休恢复、共享次数、中文固定施法环阶 |
| `b2c89eda6d4c8a1d2599301a568837b4de797802` | 官方状态模板、正确Activity关联、GM手动应用与力竭等级 |
| `5dc5702767bbcb0818a05a02e45c925289e66758` | 说明、手册、四怪修复和状态功能验收记录 |

上面的提交都在本地，未合并、未推送。提交前后的已验证产品／测试代码字节保持，没有为了提交重新跑旧测试。提交时核对了主工作区HEAD和42份dirty文件，未修改它们；主工作区路径是 `I:/OpenCode/fvttV12JsonGenerator`，不要把工具默认cwd当作目标worktree。

本handoff写入前的未提交内容只有：

- `M docs/plans/2026-10-20-forge-ab-current-state.md`：最新四怪失败与当前状态。
- `?? docs/acceptance/2026-10-28-forge-four-mechanisms-first-pass.md`：新测试完整记录。

本handoff本身为第三份未提交文档。产品代码没有因新测试或后续质疑而修改。

历史46项六批提交保留：`22d0c09`、`ef3c4ca`、`ce1f9e3`、`37fbbeb`、`6607948`、`0da71b2`。其中 **`22d0c09` 包含本次确认的逐法术删除逻辑**。

## 当前证据入口

最新四怪私有根，以下简称N：

`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-mechanisms-20261028`

优先读取：

1. [最新四怪验收](../acceptance/2026-10-28-forge-four-mechanisms-first-pass.md)。
2. `N/final-receipt.json`、`first-replies-summary.json`、`http-ledger.json`。
3. `N/sources-prep/frozen.json`、`expectations.json`、`selection.md`。
4. `N/results/{ettercap,ghoul,dust-mephit,priest}/`：`raw-answer.txt`、`transport-visible-completion.json`、`analysis.json`、`generated-source.md`、`actor.json`、`generation.json`。
5. `N/semantic-review-first-two.json`、`semantic-review-dust-mephit.json`、`semantic-review-priest.json`。
6. `N/chrome/four-actors-created.json`、`post-refresh.json`、`parent-final-readback.json`、`configuration-summary.json`及相应截图。
7. `N/final-preservation-review.json`、`chrome/cleanup*.json`、`macro-cleanup-receipt.json`、`tab-cleanup-receipt.json`、`mirror-process-final.json`。

本批原文来自同一本本地CHM `怪物图鉴2025` 目录。前言明确配套PHB2024／DMG2024，原CHM SHA256：`836eea8912cf6c068687e99db4a1b4b6b915aeb2ef8af35cfb040803184686f2`。完整原HTML、背景、表格、换行和输入均保存在 `N/sources-prep/`，UTF-8无BOM、LF；父代理独立核对完整stat-block的内容和顺序。祭司来源的 `Thaumanturgy` 拼写保持，模型另给了 `Thaumaturgy` alias；它不是本次丢七法术的原因。

实际使用 `deepseek-flash`、Responses流式、`monster-intake-extract-v52-official-status-effects`。每只一次，四次均HTTP200并有completed可见文本。服务usage合计输入18403、输出69927、总88330 tokens，reasoning包含在输出内。凭据不要输出或写入仓库；没有必要重新读取凭据进行冻结复验。

复用的单次调用runner位于 `.local/forge-four-mechanisms-20261028/runner.ts`，同源脚本留在N。**不要再次运行其live/single分支**，账本4/4已用完。需要本地反例时使用现有正式生成实现和安全测试入口，不修改原回答。

## 已确认的两项机制缺陷

### P1：Priest已给齐的七道法术被本地检查删除

事实链：

1. 原答及IR有两组、七个法术、WIS、Spirit Guardians独立1/day、Divine Aid四选一共享3/day。组／usageGroup有正确引文，单spellRef省略evidence。
2. `packages/intake-ai/src/provider.ts:833` 将省略的ref.evidence正规化为`[]`；当前入口形状检查接受这个空列表。
3. `packages/intake-ai/src/renderer.ts:128–162` 将七个完整引用写入便携法术清单，evidence仍为`[]`。
4. `packages/spell-manifest-contracts/src/validator.ts:295–300` 对空列表报 `MISSING_EVIDENCE`。
5. `packages/parser/src/yaml.ts:215–248` 把任意匹配引用路径的finding加入invalidRefs，然后 `.filter` 删除引用。七条均被删，两个空组也被删。
6. parsed manifest不存在，`actor.ts:679–686` 不安装Resolver合同，仅留下孤立Feature提示。世界导入没有manifest可解析，实际0Cast。

最终Actor仍有5个基础Item、两种攻击与完整伤害，Divine Aid仍有原生3/day计数器，但两施法Feature只有规则说明。**文字和计数器存在，不等于七道法术可用。** 原检查failed仍可正常生成／创建整只Actor，此处不是“AI未正常返回”。

确切引入归属已通过 `git blame` 和commit diff核对：

- 非空逐条证据要求来自旧提交 `30a9037d8`，2026-07-31。
- 入口补空及parser逐引用删除逻辑均收录在46整改提交 `22d0c0941459efa636b72df680f83443b95640e0`。
- 该提交把原来整份manifest检查失败抛错改成逐条删除，却没有区分缺附带记录与缺真实法术内容。
- 最近四个提交未修改 `yaml.ts` 或portable validator。不能归因于最新官方状态改动，也不能宣称同一祭司回答曾在更旧代码下成功；旧非空限制也会拒绝它。

连带提示应区分：

- `SHARED_SPELL_POOL_DRIFT` 找不到Resolver关联对象，但实际3/day计数仍在，不是次数完全消失。
- rule-reader Utility空activation是既有惰性说明入口设计；应恢复Cast合同及来源bonus timing，不能把阅读器伪装成法术。
- “中型或小型”在传记中完整存在。parser追加七引用及两空组诊断后，旧presentation边界不匹配，导致metadata失效并报 `ACTOR_SIZE_OPTIONS_LOSS`。这是展示元数据和诊断错误，不能误报为可见体型文字真的丢失。

建议方向，尚未实施：附带引文缺省／不完整只产生诊断，保留明确的法术引用、资源及分组；入口和下游契约一次统一；不增加模型复核，不以删ref使校验通过。诊断追加不应破坏原展示记录。共用validator有独立消费者，修复应保持Item／Species契约及真实世界归属边界。

### P2：Ettercap Reel把已有状态前置误生成为新状态

原文：

> 伊特怪将30尺内因其绞网动作陷入束缚的一名生物向直线拉近至多25尺。

这是选择已被Web Strand束缚的目标并拉近，不是再次施加束缚。原答和IR仅有gm-manual Utility，没有appliedConditions；本地生成却新增 `restrained` Effect `73eac2116a39eff5`，并链接Reel Utility `60bb4ef83a0a54eb`。实际UI、MCP和持久文档均确认。标记GM模式不能使这个多余效果变正确。

定位方向：`packages/generation/src/actor-effects.ts` 中明确状态提取／`inferredAppliedConditions`，以及 `actor.ts` 的手动能力状态投影路径。当前只确定原答后本地新增，未对这一条另做完整Git引入归属审计；不要把未查明的历史归属说成已核实。

建议方向，尚未实施：区分“施加状态”和“以已有状态限定目标”，保住真正的Bite中毒、Web Strand束缚及其他官方状态模板；不能通过全部关闭推导或删掉整个能力消除反例。

## 其余样本及已验证边界

| 样本 | 已证明的结果 |
|---|---|
| Ettercap | 7项能力；Bite `1d6+2`穿刺＋`1d4`毒素，中毒只挂命中后伤害；Web Strand DEX12／30尺／可见且不超过大型，束缚仅挂Save，网AC10/HP5及易伤／免疫／网毁结束保留。Reel额外Effect使整只不能记完整通过。 |
| Ghoul | 3项能力；Bite `1d6+2`穿刺＋`1d6`暗蚀，Claw `1d4+2`挥砍及后续CON10独立；非亡灵、非精灵、命中背景、目标下回合结束保留；麻痹＋失能只挂Save，onSave:false。 |
| Dust Mephit | 自爆special／5尺radius／DEX10／`2d4`钝击／成功半伤；吐息15尺cone／DEX10／目盲／充能6独立；Sleep正常水合为2024 PHB缓存和Cast，1/day、CHA、DC10、无V/S/M成分。 |
| Priest | Actor与基础攻击保留；七法术／Cast缺失是实质失败，详见上节。 |

Dust模型CR写字符串`1/2`，最终Actor正确为0.5，结构诊断导致needs_review但不影响获取／创建。这是入口整理与报告不一致，优先级低于上述能力错误。

中性攻击正常表示为 `utility.roll`＋独立damage，不因activity.type不是attack判为攻击丢失。回合开始／结束等相对时机保留在效果说明；不虚构数值倒计时，不声称已经全自动结束。

本批Mirror已完成真实配置页、原生MCP和刷新读回，**未投骰、未Use/Cast、未Apply**。四个Actor按ID各自逐字段一致；刷新后集合顺序改变，不能以数组顺序变化误报内容漂移。

取证细节：

- 锁定5.3.3 Cast的 `spell.properties` 是忽略成分集合；Sleep在这里包含vocal/somatic/material正是无需三成分。
- 原生MCP返回会省略部分DataModel字段。Sleep的 `challenge.save=10` 在真实toObject和UI均存在；不能仅因MCP序列化未返回就判丢失。
- 读取Priest两Item时碰到GM页刷新导致Bridge短暂断开；失败收据保留，恢复后只补这两个未完成读回。不是模型重试，也不是产品丢对象。
- 某些prepared `thinking` 状态无Actor Effect文档，未归因于生成器、未擅自清除。

## 为什么此前review没发现

这一节依据实际代码、测试及历史审查记录，不以“做过review”替错误辩护。

- 审查接受了“按finding路径过滤坏引用”的笼统处理，没有区分附带证据问题和真实法术不可执行问题；这与用户不删能力的要求冲突，从diff即可发现。
- `tests/forge-46-core.test.ts:206` 的 `spellGroups()` 为每条ref预先填满evidence。相关测试确实核对法术名称、数量和资源，但集中于坏别名、空名字、坏关联，未覆盖“法术完整明确，仅缺附带引文”的关键反例。不能笼统说所有测试只检查Actor存在。
- `forge-46-remediation/independent-semantic-review.json` 的状态是 `PASS_WITH_COVERAGE_GAPS`，只独立对照十个冻结样本；其法术样本为Unicorn、Spirit Naga、Rakshasa。它明确不代表全部官方怪覆盖。
- 前一批Night Hag十二道法术各有一条ref evidence，本批Dust Sleep也有；Priest七条ref均没有，但组和usage evidence都有。这解释为何既有成功样本未触发删除分支，不证明旧代码支持所有缺省。
- 前代理把有范围的证据概括为“46项整体完成”，超过了证据。已向用户承认并撤回整体保证；不抹掉具体通过事实，也不把未审其余路径说成没有风险。

## 建议接续顺序，尚未执行

1. 先读当前全局／项目／局部AGENTS和本文件，核对真实worktree、HEAD、dirty及证据；不要再建工作树、重置、stash或重跑已有矩阵。
2. 如果接续任务要求回查46项，逐项跟踪整改后内容的去向，优先看新加的 `filter`、`delete`、清空列表、catch后continue及纯文字替代分支。确认每条检查影响的是附带记录、实际字段、单个操作还是整份能力，不把降低报错数量当作保真。
3. 对已明确的Priest和Reel故障使用本批原答建立最小本地反例，再修对应拥有者；保留原失败产物，新结果另存，禁止修补冻结JSON。共同链保持单一写入者。
4. 检查“入口允许缺省／下游仍要求非空”等跨层矛盾；重点包括来源引文、协议记录、状态、资源／关联和恢复路径。回查是开发审查，不是在产品里新增审核门槛。
5. 检查断言需比较来源已声明的法术／操作／伤害段／状态／资源及关联，而非只比较Actor是否存在；继承正确旧测试，仅补具体未覆盖分支，不重新用付费模型碰样本。
6. 本地修复通过后，只补受影响的真实导入／配置读取。用户不要求投骰；旧未变Apply／刷新／移除证据复用。完成结论按具体范围给，不再以“全绿”推断所有46项都无数据损失。

## 运行环境、清理与保护

所有命令显式设置workdir为上述worktree。使用CI锁定Bun **1.3.14**：

```powershell
$env:PATH='F:\FoundryLab\foundry-v14\runtime\bun-v1.3.14;'+$env:PATH
```

Mirror最后实际核对为 `F:/FoundryLab/foundry-v14/data/server-mirror`，端口30001，Core14.368 / dnd5e5.3.3，世界cor-cotn，PID **34600**。这是最后收据，不是未来存活保证；下次用前重新核对占用／身份。旧PID27128已不存在。本轮按正式readiness在服务缺失时启动原Lab，收尾保留运行。

安装候选：

- Forge：`7c519c19fd86afd1df33bd6962ac3fa48f225a613bc80ead24d24cb230f8316f`
- Resolver：`898023ba281259b8d2cec3d5b8ecea655728bbd9e0d35f902156a8cc6da35444`

四个测试Actor已精确删除：`5a29aec49de5fda6`、`ac4363c9bad78e02`、`7b9b18a3af11f110`、`d1e5b3a7bfbd6676`。helper `QYZjRJ9OGwj24JK9` 已删除，自有GM tab `651352437` 已关闭；这些ID仅供追溯，不可假定仍可操作。

本批没有新增Scene、Token或Message。最终六集合逐ID/hash/数量保持本轮基线：318 Actor、180 Item、67 Scene、94 Macro、10 Combat、1245 Message。活动／查看场景、worldTime21085811、paused=true、control/targets均恢复。1156历史证据和77份本批冻结文件hash保持。

其他任务Next页不得操作。最后inventory中651352334仍在，651352432已不在；本任务没有操作后者，不猜外部关闭原因。过去旧页ID同样不能作为新占用证明。

浏览器按 `chrome-delegation-dev` 复用既有执行器，当前同任务 `/root/chrome_executor`、项目明确选择Sol/medium、Full Access；新聊天不能假定旧agent仍可用，按当前工具核实。官方Chrome连接器、正常文件上传／Macro导入及产品UI；不使用注入、raw CDP或直接LevelDB。之前手册file协议被明确拒绝，拒绝收据保留，不改通道绕过；本批Foundry HTTP验收已完成。

当前worktree没有 `docs/runbooks/foundry-mcp-readiness.md`，主工作区有该新runbook和已安装独立CLI；此前只读参考了主工作区文档，未把未合并代码复制到本worktree。需要恢复MCP时核实正式入口；不要为文档路径缺失自行升级环境。

## 历史成果与不能改写的事实

同一私有父目录还保存：

- `forge-46-remediation/`：46项实施、冻结及Mirror证据；对应 [46项原记录](../acceptance/2026-10-27-forge-generation-delivery-remediation.md)。该记录的历史整体完成结论需结合本文件已撤回保证来读。
- `forge-four-chm-first-pass-20261027/`：Berserker、Phase Spider、Troll、Night Hag原四次首答。
- `forge-four-chm-fixes-20261027/`：接收／法术恢复／固定环阶修复；Berserker是从截断失败取证摘取内容构造completed输入的本地回放，**不能冒称原真实首答完整成功**。
- `forge-official-status-effects-20261027/`：状态功能及真实无投骰Apply；包含错误的初版Medusa产物、阶段修正、Otyugh说明修正、取证层错误与恢复，均保留。

旧状态批有一份原研究收据曾误移目录后被扩充，已按原会话Add File字节恢复旧21948字节版本，hash与baseline一致，新扩充版另存；不要再次移动或覆盖它们。

四个本地修复提交已经完成，最近四次测试已经完成；**这只说明这些操作完成，不说明发现的产品缺陷已修复。** 用户下一次接续时，应先明确报告当前已知故障和正在处理的具体范围。
