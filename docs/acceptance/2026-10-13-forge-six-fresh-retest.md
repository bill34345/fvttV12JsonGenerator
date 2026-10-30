# Forge 六例全新复测完整报告（2026-10-13）

**结论：本批六例各提交一次，完整通过0/6；零内置修复的完整通过亦0/6。当前候选还不能按本批标准作为可靠PDF导入工具交付。**

六例生成已全部结束。唯一达到来源包＋完整中文草稿阶段的Gazer，独立逐项核对发现缺文，因此同样失败。没有批准、导入或刷新不合格候选。世界与草稿基线、页面及服务器临时工具收尾均已完成并核验；没有不合格候选进入原生导入。

## 批次身份与边界

- 继续现有Forge sibling工作树，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`，保留全部既有dirty改动与失败原件。
- 本轮是六份已知来源的全新模型复测，不是未见PDF泛化测试；来源和PDF沿用固定清单、原始字节SHA。
- 六例均未传入旧IR、译文、自动配置、人工修正；每例只有一次顶层提交，使用既有有限内置修复，无外层重试、续译、改候选或换怪。
- 所有17次实际Provider请求均HTTP200，17份回复完整留存且内容hash由父控逐份核验，无截断、无证据存储失败。主模型实际返回身份均`deepseek-flash`，冻结配置reasoning=low／json_object。
- 付费AI审核请求0。未提交、合并、推送；未修改master。旧冻结批0/6和旧Gazer保存输入原生PASS保留独立口径。

| 固定样本 | 首次提交最终结果 | 生成流程耗时 | 模型HTTP请求 | 来源修复请求 | 配置修正请求 | 译文修复请求 | 停止点 |
|---|---|---:|---:|---:|---:|---:|---|
| Sea Hag Auntie | 失败 | 3分49秒 | 4 | 1 | 1 | 0 | 来源修复后进入配置；同一完整能力的5段连续coverage不能合成来源证明，第二次配置将该能力列为unresolved。另有gmSteps不足2项的问题。 |
| Gazer | 失败 | 2分00秒 | 4 | 0 | 0 | 0 | 来源包与完整中文草稿生成，但外貌段落及直径8英寸没有Actor/中文去向；完整来源门禁失败。 |
| Mezzoloth Sellblade | 失败 | 1分05秒 | 2 | 1 | 0 | 0 | 法术等级遗漏修复后，Shred重甲减半被写入damage.condition，整段2d8伤害变为literal/Utility并阻断在GM待审。 |
| Charon | 失败 | 4分11秒 | 3 | 1 | 0 | 0 | 修复后仍有传奇前言的纯空白差异、两段伤害均标base，以及条件伤害关系校验冲突。 |
| Baernaloth Keeper | 失败 | 2分52秒 | 3 | 1 | 0 | 0 | 其余字段修复后，完整照录原文的条件仍被拒绝；校验器要求原文没有的英文扩写句式。 |
| Ultroloth Mesmer | 失败 | 0分31秒 | 1 | 0 | 0 | 0 | 发现阶段复制全文时仅将末尾CRLF改为LF；少一个回车字符，候选不能锚定，未开始提取。 |

合计：17次请求＝发现3＋提取5＋来源修复4＋配置2（含1次修正）＋翻译3；付费审核0。各例生成流程耗时之和868.501秒（14分28.5秒），首例开始至末例返回的批次墙钟跨度2228.544秒（37分8.5秒），包含逐例核对、报告及衔接/进程收尾等待，不能把差额全部算作模型执行。共享Chrome前置核对另记录1856秒墙钟跨度，不宣称等于连续工具操作时间。

Gazer在生成阶段没有来源／配置／翻译修复。冻结runner对零HTTP的确定性配置将修正数记为unknown；父控按实际0配置HTTP和4份attempt=1回复确定修正数为0，原summary未改。Gazer完整验收失败，所以不计“零修复通过”。

## 逐例证据与判断

### Sea Hag Auntie

来源修复后进入配置；同一完整能力的5段连续coverage不能合成来源证明，第二次配置将该能力列为unresolved。另有gmSteps不足2项的问题。

[逐项评估](../../.local/forge-five-replay-and-six-retest-20261013/attempts/sea-hag-auntie/failure-assessment.json)；[原始首次结果](../../.local/forge-five-replay-and-six-retest-20261013/attempts/sea-hag-auntie/result.json)；[完整脱敏模型回复](../../.local/forge-five-replay-and-six-retest-20261013/attempts/sea-hag-auntie/provider-replies.json)。原始summary SHA：`9e2e57fd4a3465482a6cddbc09a85fc33b9754c2ce91f8fb4b81050be18d4229`。

### Gazer

来源包与完整中文草稿生成，但外貌段落及直径8英寸没有Actor/中文去向；完整来源门禁失败。

[逐项评估](../../.local/forge-five-replay-and-six-retest-20261013/attempts/gazer/semantic-assessment.json)；[原始首次结果](../../.local/forge-five-replay-and-six-retest-20261013/attempts/gazer/result.json)；[完整脱敏模型回复](../../.local/forge-five-replay-and-six-retest-20261013/attempts/gazer/provider-replies.json)。原始summary SHA：`dca22ee062c0274ee65f3d1658a4404f929cdbbc45b683663f49b49b68ae6633`。

### Mezzoloth Sellblade

法术等级遗漏修复后，Shred重甲减半被写入damage.condition，整段2d8伤害变为literal/Utility并阻断在GM待审。

[逐项评估](../../.local/forge-five-replay-and-six-retest-20261013/attempts/mezzoloth-sellblade/failure-assessment.json)；[原始首次结果](../../.local/forge-five-replay-and-six-retest-20261013/attempts/mezzoloth-sellblade/result.json)；[完整脱敏模型回复](../../.local/forge-five-replay-and-six-retest-20261013/attempts/mezzoloth-sellblade/provider-replies.json)。原始summary SHA：`95a77a261512e0934be58acf0d8612c73100eabd79e7b01654355c24991c1d70`。

### Charon

修复后仍有传奇前言的纯空白差异、两段伤害均标base，以及条件伤害关系校验冲突。

[逐项评估](../../.local/forge-five-replay-and-six-retest-20261013/attempts/charon/failure-assessment.json)；[原始首次结果](../../.local/forge-five-replay-and-six-retest-20261013/attempts/charon/result.json)；[完整脱敏模型回复](../../.local/forge-five-replay-and-six-retest-20261013/attempts/charon/provider-replies.json)。原始summary SHA：`83542cc21ee0f84809823eeae04e0a86251067d341be87d652d75f90218e6890`。

### Baernaloth Keeper

其余字段修复后，完整照录原文的条件仍被拒绝；校验器要求原文没有的英文扩写句式。

[逐项评估](../../.local/forge-five-replay-and-six-retest-20261013/attempts/baernaloths/failure-assessment.json)；[原始首次结果](../../.local/forge-five-replay-and-six-retest-20261013/attempts/baernaloths/result.json)；[完整脱敏模型回复](../../.local/forge-five-replay-and-six-retest-20261013/attempts/baernaloths/provider-replies.json)。原始summary SHA：`27631a4ac783563046a15b27a9950312013970dd1fc5b0dc81bf530370670599`。

### Ultroloth Mesmer

发现阶段复制全文时仅将末尾CRLF改为LF；少一个回车字符，候选不能锚定，未开始提取。

[逐项评估](../../.local/forge-five-replay-and-six-retest-20261013/attempts/ultroloths/failure-assessment.json)；[原始首次结果](../../.local/forge-five-replay-and-six-retest-20261013/attempts/ultroloths/result.json)；[完整脱敏模型回复](../../.local/forge-five-replay-and-six-retest-20261013/attempts/ultroloths/provider-replies.json)。原始summary SHA：`05ff9c0afb034546c6a4197881c535541bcae601104ad15508709ba7eacaf2c9`。

## 已经由实际输入证明的共同问题

1. **来源分段与“完整规则单元”契约仍未统一。** 海鬼婆Steal Passion的5段覆盖连续、字节引文精确，连接后与完整IR正文一致；来源检查通过，配置阶段却找不到单个完整coverage，因而误拦。同一段内容在不同阶段被要求采用不同包装。
2. **来源“已分类”不等于有输出去向。** Gazer外貌段落仅被标narrative、claimPaths为空，IR无biography；8英寸直径也只剩tiny枚举。中文请求从已经生成的Actor字段创建，缺失的文本根本不进入译文请求。本地化与哈希检查无法发现此前已被丢掉的内容。独立源文核对因此拒绝该候选。
3. **触发前提、结算分支和字面条件仍混在condition字符串里。** Mezzoloth的“重甲则减半”导致整个基础伤害成为条件文字；Charon的不能支付法术位后伤害被合法标conditional，却与校验器默认第一伤害为base的假设冲突。这不是新增自动化支持的证据，当前GM承接仍有缺口。
4. **校验仍在二次解释英文句式。** Baernaloth的damage.condition完整照录原文，包括Whenever与If it does not；检查却要求does not choose to fail and end this effect这句原文没有的扩写。Charon前言仅空白不同、Ultroloth仅末尾CRLF变LF亦阻断。拒绝非原字节的quote符合当前严格发现契约，但把全文复制和排版一致性交给模型，仍是未闭合的工程边界。
5. **模型也有真实字段错误。** Charon原文plus连接两段伤害，回复却将二者都标base；use/uses、法术等级和覆盖范围问题也反复出现。这些冲突必须保留拦截。不能把所有失败归为程序误拦，也不能归为模型能力不足而忽略前述确定性缺口。

归纳：同源事实已经覆盖部分进入Actor的已识别字段，但“所有原文怎样进入事实与显示”“不同IR形态怎样归一化”“所有校验怎样消费同一规则单元”尚未闭合。继续逐个怪物补英文匹配或仅换模型，不能由本批证据证明会解决这些问题。

## 已保留的局部有效证据

冻结前574项Forge、541项战斗包、287项generation、41项facts、44项localization及76项raw contracts通过；新增39项投影反例、17项coverage/compact连接、11项Node/browser伤害词汇连接和3项literal-source核验通过。包／模块类型、依赖／循环、局部anti-overfit、构建、来源verifier和33项手册检查通过。它们只证明各自覆盖的行为，不抵消本批失败。
Gazer本次核对的AC/HP、六属性、fly30/hover、四条DC12射线、60尺可见目标、Frost3d6cold与Force25(1d10×5)推离、GM边界没有发现所述缺失；15处Item/Activity有目录内非默认图与理由，11处fallback置信、4处high。没有进入新原生导入，不能声称本批实际图标加载或原生回读通过。Dazed定义及非执行叙述仍需GM核对。

## 原生与清理

通过门禁后才导入的条件未满足，因此新GM批准0、导入0、导入后刷新0、创建Actor/Macro0、控制器/Activity/Token/时钟执行0。共享前置确认Mirror14.368／dnd5e5.3.3／cor-cotn／PID56132，287Actor/94Macro完整ID+名称基线；六包前缀缺席证明的边界是现有registry＋与上轮精确清理一致的目录集合，未新做全部raw flags扫描。未来具体导入前仍有冻结helper与正式导入器的精确文档身份门禁。
**收尾完成。** 独立回执与11份证据已核验，287/94完整ID与名称集合由父控再次逐值比对相同，Forge用户字段及encounter空来源/source语言/无任务保持。服务器唯一helper已按安装前不存在与原SHA精确正常删除，HTTP404；16正式模块文件磁盘/HTTP字节保持，PID56132服务常驻。页面651344549在关闭请求后的即时库存仍列出，原PENDING回执保留不覆盖；后续独立库存-only补证已确证owned=[]、该页在全量库存缺席、原6个他人页全部保留。补证回合新close/创建/导航/世界等操作均0，具体消失时刻与触发者UNKNOWN，不声称又手动关闭一次。

## 后续修复应集中在哪个边界

下一步应围绕一个完整的来源消费／事实归一化边界实施，并先使用本批新保存的原始失败做离线整链反证：

- 依据精确原文锚点及同能力的连续覆盖组装完整规则单元；对单段、分段、CRLF/边界空白使用统一呈现规则，仍拒绝真实删文、跨能力、数值、否定和冲突。
- 每段实际内容必须落到固定规则块、可翻译剩余槽或有明确依据的元数据归档。纯叙事、尺寸附注和未支持完整机制不能因没有对应Actor字段而消失；在源文侧闭合消费检查。
- 已支持的触发／目标／结算条件由现有规则事实推导，不要求模型再扩写一套英文条件。Actor、完整中文、GM说明与批准读回消费同一份归一化结果；未知机制继续阻断或显式待审，不能删condition放行。
- 模型负责有界提取／选择及剩余文本翻译；来源位置、全文复制和固定GM步骤尽量由程序承担。保留真实模型事实错误的校验，消除因内部包装不同造成的误拦。

本批不再修补、生成或重试以凑通过；上述是基于新证据的后续范围，不是已经实现或接受的承诺。

## 冻结和证据索引

- Freeze333文件：`bb31729c6ad645cda69526903a8000ae9e16b4503e89a4d5b6925797d7149cc8`。
- 本地ZIP：`ea2ddad3b334b3ff522383deeee81ee7064e3092f0e96ba8102bb76b886c8984`。
- 安装index.js：`c90cb641e9892a8d208c632db485dbdb0fbf9ddbd584d37e7858b84c03e712b2`。
- [冻结与样本原始字节清单](../../.local/forge-five-replay-and-six-retest-20261013/batch-freeze.json)。
- [模型批次收据](../../.local/forge-five-replay-and-six-retest-20261013/model-batch-receipt.json)与[逐例汇总](../../.local/forge-five-replay-and-six-retest-20261013/batch-current.json)。
- [离线修复收据](../../.local/forge-five-replay-and-six-retest-20261013/offline-freeze-receipt.json)；[独立原生前置收据](../../.local/forge-five-replay-and-six-retest-20261013/native-preflight/receipt.json)。
- [本轮计划](../plans/2026-10-13-forge-five-replay-and-six-fresh-retest.md)。

本轮判断来自锁定源码、原始回复与实际正式链；未以新增外部讨论替代这些直接证据。未宣称任意PDF成功率。

### 最终收据

- [最终父控收据](../../.local/forge-five-replay-and-six-retest-20261013/final-receipt.json)。
- [原生基线与原关闭请求收据](../../.local/forge-five-replay-and-six-retest-20261013/native-closeout/receipt.json)，SHA `d073123b99427917ea650360bed76ce257f3ffbcbf50731154a1de94884ee8d8`。
- [实际页面缺席补证](../../.local/forge-five-replay-and-six-retest-20261013/native-closeout/tabs-final-receipt.json)，SHA `ac8806cff496e05f6b12ff295b19c4438024e05ab91386b6918ce71a6b5ac0c6`；绑定库存SHA `9e75109f4d1234ae37ba2c6317f95062f3247d0007016b0f798ddc9a0fced154`。
- [服务器唯一helper精确清理收据](../../.local/forge-five-replay-and-six-retest-20261013/helper-cleanup-receipt.json)。私有工具源与首次失败材料继续保留，未制作系统备份。

六例验收批次及owned收尾已完成；Mod的可靠PDF完整转换目标仍未达到。本次0/6不通过再生成、更换来源或手改候选提升。
