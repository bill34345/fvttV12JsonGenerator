# Forge 冻结六 PDF 验收完整结果

2026-10-13（Asia/Shanghai）。**六只均已完成各自唯一一次提交；0/6通过全部必需阶段。此冻结版本未达到“在本批明确样本与支持范围内通过”的标准。**

未对失败样本再次生成、续译、手改候选、换怪或修改冻结代码。付费审核保持关闭；没有提交、合并或推送。

## 逐例结果

| 样本 | 顶层提交 | 流程耗时（秒） | 模型HTTP请求 | 内置IR修复 | 原语言包／完整中文草稿 | 最终结果 |
|---|---:|---:|---:|---:|---|---|
| Sea Hag Auntie | 1 | 114.662 | 2 | 1 | 无／无 | **失败**：来源门禁：完整正文和coverage保留自选规则，但parent claim只引叙事段；模型候选属性为完整英文名，与当前守卫期待的短码形态不一致，AMBIGUOUS_SAVE_ABILITY仍阻断。 |
| Gazer | 1 | 135.311 | 4 | 0 | 有／有 | **失败**：形式生成及中文草稿完成；人工源→Actor核对发现四种射线共享60尺可见目标范围未进入IR/Actor范围字段，本批语义门禁不通过。 |
| Mezzoloth Sellblade | 1 | 168.776 | 4 | 1 | 有／无 | **失败**：原语言包ready；中文保护校验拒绝，只有8/22字段的部分草稿，无完整中文候选。不能将原语言ready当成功。 |
| Charon | 1 | 366.357 | 3 | 1 | 无／无 | **失败**：来源能力标题识别误报2项，正文片段实际已在IR；另2个复杂能力以Utility保留而缺结构豁免字段，被当前门禁拒绝。 |
| Baernaloth Keeper | 1 | 177.201 | 3 | 1 | 无／无 | **失败**：11项能力保留；模型自报AMBIGUOUS_SPELLCASTING（无完整施法表），当前入链不能把该疑问与完整能力事实/GM边界分开。 |
| Ultroloth Mesmer | 1 | 134.141 | 3 | 1 | 无／无 | **失败**：等级保留在englishName但未满足description位置要求；充能5-6被误当公式；内置修复响应又引用不存在的路径，schema拒绝。 |

“每只一次”指一次顶层提交；沿用了计划明确允许的原有限内置修复。19次HTTP请求由发现3次、提取6次、IR修复5次、翻译5次组成，并非19次整链重生成。所有19次HTTP均200；本批实际失败发生在业务契约、语义或修复响应校验，没有将下载/TLS故障计为怪物失败。

- 生成与中文流程耗时合计：1096.448秒（约18分16秒）。
- 第一例开始：2026-10-13T14:07:00.951000+08:00；最后一例结束：2026-10-13T14:38:41.539000+08:00。两者墙钟跨度1900.588秒，包含父控逐例源数据审查与诊断间隔；不能与上述流程耗时相混。
- 实际响应模型均为冻结的deepseek-flash，原有openai-chat / low配置保持。
- 全部6个summary的paidReviewAttempts=0，sharedFreezeFailure为空。
- 显式翻译修复函数调用记录均为0；Gazer配置纠错计数在冻结运行器中为unknown（本地配置路径无法据该计数器判定）。不把unknown写成0，也不声称任何一例“零修复整链通过”。
- singleSubmissionReady仅Gazer为true：它表示有候选和完整中文草稿供审查，最终仍因范围事实门禁失败。Mezzoloth的ready_for_gm_review只代表原语言包，不代表中文完成。

## 具体证据与原因

### Sea Hag Auntie：完整正文不等于已经形成守卫认可的完整事实绑定

最终IR的Seed Terror正文明确保留目标自选INT/WIS、DC15、15尺范围、恐慌1分钟及回合末再次豁免，且activityType为utility。机械coverage覆盖1569–1857整个规则单元。但是同路径parent claim只引用1569–1679的叙事段“Seed Terror. Illusory blight…rot.”，没有选择与豁免条款；完整选择条款只在模型uncertainty证据中。

当前source-facts守卫从feature/parent claim寻找完整规则，还对已有疑问的candidates要求int/wis；本次模型给的是intelligence/wisdom。因此保留AMBIGUOUS_SAVE_ABILITY阻断。这个结果不能解释为“原文缺少选择者/属性”，也不能靠删除模型错误码或接受所有Utility绕过。需要使完整source/coverage/claim的同一规则单元在入链时形成统一、无冲突的事实绑定。

证据：`attempts/sea-hag-auntie/source-gate-diagnostic.json`、`first-analysis.json`、`result.json`。没有修改这些输入来取得通过。

### Gazer：规则文本保留，但范围事实只留在父说明

原文Eye Rays要求在60尺内可见目标中选择，约束下列四种射线。新IR的父动作及四种射线均无range/target字段；生成的父Item、各射线Item及原生save Activity也没有60尺范围字段。范围文字仍出现在父项中文说明，未与其余机械事实一起投影。

本批因此拒绝宣称目标/范围的共同事实契约已成立。没有进行原生导入，也没有宣称已经实测原生距离限制是否生效。

通过的部分：AC13、HP13/3d4+6、飞行30尺、四种射线DC12及WIS/WIS/DEX/STR、Cold3d6、推离25(1d10×5)及方向，已对照源与候选；完整中文规则已查看。7个Item和8个Activity共15处图标全部在目录内、非默认，有理由，7个不同路径HTTP200；类别近似如实保留fallback置信。

测试运行器自己注入的“frozen fresh acceptance”标签被直译为“冰冻新鲜验收”，作为测试标签翻译问题单列，不用它冒充怪物规则缺失的证据。候选仍因范围事实失败。

证据：`attempts/gazer/review-preview.json`、`semantic-assessment.json`、`icon-offline-check.json`。正式加载器重建42条预览并核验draft身份，0网络调用；没有授予批准或改写候选。

### Mezzoloth Sellblade：中文保护门禁拒绝；具体坏字段仍缺证据

原语言包完成，source IR经过一次内置修复。两次翻译HTTP均200、finishReason=stop，之后保护校验报“译文漏掉、重复或添加了受保护的数字、骰式或标记”。完整中文草稿未产生。

冻结运行器保留22字段请求、8字段部分草稿、错误、请求元数据、IR和原语言包；**没有保存被拒绝的完整模型原文回复**。所以无法精确定位哪个字段、数字或标记被改动，也不能据此断言是模型翻错还是校验误报。没有用部分草稿重放出另一种错误来冒充原故障，没有重试补取回复。

源语言候选的7个Item和7个Activity共14处图标均为目录内非默认路径；这只是静态路径证据，未取得其原生可视证据或完整中文验收。

证据：`attempts/mezzoloth-sellblade/result.json`中的localization、`provider-failures.json`、`requests.json`、`partial-candidate-audit.json`。

### Charon：两处标题误识别已证实，结构字段问题分开保留

SOURCE_FEATURE_OMITTED声称遗漏“Charon can deal twice as much Psychic damage to it”和“Line's area”。查看PDF第2页、原文和最终IR后确认，这两段是普通正文，而非独立能力标题；它们分别完整存在Blood Covenant和Treasure Wind中。两项属于已证实的源分段/完整性误报。

另两项SOURCE_STRUCTURED_RULE_MISMATCH对应Blood Covenant和Scales of Oblivion：最终IR以utility完整保存复杂条件规则，但save字段为空。当前schema/GM辅助前置路径无法在这里闭合，不能将此与两个假标题混为同一结论，也没有绕过字段要求将候选导入。

证据：`attempts/charon/source-gate-diagnostic.json`及最终validation，PDF已渲染完整页核对。

### Baernaloth Keeper：模型的全局施法疑问仍决定入链

最终IR保留11项具名能力：Secret-Thief、Despoiling Resistance、Multiattack、Deranging Touch、Grey Fate、Erase Deeds、Discordant Miasma、Nail to the Sky、Premonition of Pain、Soul Tether、Lost Passage。最终唯一阻断为模型自报AMBIGUOUS_SPELLCASTING：来源有Level N Spell注记，但没有完整spellcasting block。

已证实的是能力仍在、阻断来自该疑问。不能将它写成能力已遗漏；也没有依据强造施法属性、法术位或职业。如何将已明确的能力等级/DC/次数与未提供的全局施法信息分开，并在合法GM边界内呈现，是当前未闭合的支持契约。

证据：`attempts/baernaloths/source-gate-diagnostic.json`、`result.json`。

### Ultroloth Mesmer：等级字段位置不兼容、充能区间误作算式、修复协议失败

- Lava Geyser/Grey Fate/Mimetic Slip的6/7/5环等级仍在englishName中；description未包含这些能力自身的Level N Spell注记；Mimetic Slip正文虽提到“结束5环及以下法术”，那是另一种数字用途。当前source-completeness只核description中的能力等级注记，因而报SOURCE_SPELL_LEVEL_OMITTED。准确结论是字段位置要求未满足，不是这些等级在整个IR中消失。
- Grey Fate原文、description和结构damage.formula都包含6d10+40。直接调用冻结的localizationFormulaSpans证明，来源另多出来自Recharge 5-6的signature `5-6`，而description只有 `(6d10+40)`。将充能区间误作减法使来源公式列表不等，触发了已证实的SOURCE_FORMULA_MISMATCH误报。
- 内置修复响应在第4个operation的path引用不存在路径，生产校验正确以REPAIR_INVALID_RESPONSE拒绝。该修复未生效；没有另发修复或手工补字段。

证据：`attempts/ultroloths/source-gate-diagnostic.json`、`formula-diagnostic.json`、`provider-failures.json`。公式诊断仅重放保存文本到原生产lexer，0模型、0候选修改。

## 原生阶段与清理收据

**6例导入、刷新、原生规则与全部Icon回读全部NOT_EXECUTED。** 原因是没有候选通过此前必需的来源/中文/Actor事实门禁，不是偷偷省略了已通过候选的原生测试。

共享原生前置PASS：实际Mirror14.368/dnd5e5.3.3/cor-cotn、PID56132、GM权限、当前JS及16文件HTTP字节、完整Actor/Macro基线已核。收尾独立Chrome再次核完整ID+name集合；父控另从保存的两份集合独立比较，287个Actor、94个Macro完全相等，added/removed/changed为空。草稿字段及outputLanguage=source保持、无保存任务、0本批新世界对象。

- 批次owned tab创建1/关闭总计1，无owned页遗留，无待下载/编辑/对话框。
- 收尾0模型、付费审核、Key读写、连接探测、导入、刷新、世界对象创建删除、宏或Activity执行、服务操作。
- 收尾前已有两个他人页651344434/651344413缺失，原因UNKNOWN；执行器本轮未操作它们。收尾开始时所有其他页面均保留。不声称整个历史浏览器库存完全未变。
- 本地Mirror继续常驻，并保留本次测试候选模块。没有升级Core/dnd5e、创建另一套Lab、生产写入、直接LevelDB编辑或备份。

原生收尾状态SHA-256：`701692d89c322361b1cc517a6dc4bba5c196a745b8396b2b5051a977190cbbc8`。
原生收尾receipt SHA-256：`92be9ea0edd7509a539e15062dcb7461abffa3cb73e38a14513cd92f04b34f76`，父控核对其10项证据SHA。它证明共享基线与页面收尾，不证明任何本批候选导入成功。

## 版本、原件和权限

- freeze SHA-256：`833d2af025af5f8e055bbba023cc6eb47ac6f6feab3de1d6c2ad99a994fe4dc1`；326项源码/构建/规则模板/图标/配置/运行器在全部生成后仍逐字节一致，与读取新holdout正文前checkpoint一致。
- 工作树HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`，主区HEAD `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`均未移动。主区仍为既有`?? .omo/`。109个原基线路径均保留，8个历史fixture原字节未改。
- JS `d4c2a5bf741efd528916e3d3936e7cdfa8fb9349a92c2dc8426b14c57d4c055b`；ZIP `06520a2188a9286de0600b272bc694bf6a05d518e793e7a80299e588f6898512`。git diff --check通过，未重复与源码无关的整套测试。
- 三份新PDF通过原固定公开附件各一次正常HTTPS获取，HTTP200、curl retry0、TLS校验开启。历史TLS为何恢复、原Chrome拦截具体触发者仍UNKNOWN；没有以当前下载成功虚构过去根因。

| 样本 | PDF原字节SHA-256 | 完整来源原字节SHA-256 | 来源UTF-16长度 |
|---|---|---|---:|
| Sea Hag Auntie | `70739312d347c2366a5b1fe1f5acfffb2d16c3b10390dfe9302364143399b0d5` | `0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1` | 4314 |
| Gazer | `cc7f114b0dcf7e96386665488ee57ec27139440fb46be94aaadca763d0ed2034` | `a9c9cfc009ee19152ab64755bbda600628eabc3add772f32ecbad05a174b9a9b` | 1732 |
| Mezzoloth Sellblade | `c33b74cb7eb83237c31f1098e1882232e7b6a847c8e5a1e2a24f145a79cff6ef` | `2c93b830d3814fdc9ddd6bb255699a9bd28edbcf118bda1900fa6fa992bf0562` | 2085 |
| Charon | `e5ed1182f7a0d26258f69b2042c365f6266b2acd69ce92fb9ca067f7a41f458e` | `441b41611f62f920a73f5494692a52cbe3ff41fd29c775af98e5d2bf0299ebb2` | 4933 |
| Baernaloth Keeper | `f1d61b30af629ea7b640987d0b5a5960d980781ba65fbd14f725c3b6301ed738` | `8032158a5794a1322d4fe710436e8ef5074f8ae74e3f1470347ca4b0188b12b3` | 4562 |
| Ultroloth Mesmer | `d075b4c72aeba6ffc5d4cb8510a351cbdf0932b7d64559f277d827b5dfc4aed5` | `f069cce7ba2d8d9aeb23e3fc91ff393063cf2399ad8e2ab5b48b9e4116937f8b` | 3679 |

## 这批证明什么，以及剩余工作

已证明：本版本在本批支持范围没有通过；故障不只发生在AI提取，也发生在程序自身源标题识别、证据形态/代码别名契约、数值用途分类、父子范围传递和中文保护阶段。新增共同事实/固定中文改动并未覆盖前置入链所有解释路径。此前离线41/541/574等通过证据仍是相应历史与合成检查的证据，不能替代本批红色结果。

本批没有执行以下修复；它们是由实际失败收据导出的优先项：

1. **先闭合入链事实绑定。** 让原source、完整coverage和claim在现有解析/IR边界形成同一完整规则单元，再评估结构冲突与GM执行方式；不让模型疑问的措辞、候选别名或引用颗粒度独自决定支持与否。缺来源、选择者、DC/属性/条件冲突仍拒绝。
2. **标题与元数据按已有结构读。** 用当前section/feature/evidence结构核能力清单，防止普通续行句子成为标题；等级、充能等注记进入相应事实字段，避免在name/englishName/description间反复猜测或强造施法表。
3. **公式先区分数字用途。** 利用已有规则事实把伤害算式、射程、充能区间、法术等级分开，再核公式操作数/运算符/顺序；不是放宽公式保护或增加按怪名的例外。
4. **补父子动作上下文传递。** 将已核对的共享目标、可见性和范围一次归一化后同时供Actor与固定中文使用；正文保留不能代替机械字段与明确GM边界。
5. **补证据收集缺口。** 在现有本地收据中保存脱敏、源身份绑定的失败模型回复和逐字段校验诊断；修复patch路径协议及配置纠错计数。先用本批保存输入离线回归，不重新生成本批样本来凑通过。

没有证据证明任意PDF成功，也没有完整原生候选通过；本报告不把未执行阶段或unknown计为通过。

## 证据入口

所有本批现场在 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-facts-20261013/`：

- `batch-final-receipt.json`：六例聚合、阶段耗时、逐文件hash、原生收尾及证据边界。
- `attempts/<case-id>/`：started、首次/最终IR分析、result、summary、requests、progress、失败verdict及相应诊断；原件不改。
- `native/native-preflight.json`、`native/native-final-state.json`、`native/native-final-receipt.json`：独立Chrome证据。
- 原计划及离线阶段：[已批准计划](../plans/2026-10-13-forge-shared-facts-and-cross-pdf.md)、[共同事实离线报告](2026-10-13-forge-shared-facts.md)。
