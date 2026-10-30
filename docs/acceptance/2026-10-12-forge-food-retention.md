# 海渴症食物留存译义：回归与单点校验

**最终结论：本次食物留存缺陷已在保存原件与一次全新生成中验证通过；完整中文生成仍因包级内部规则ID残留而FAIL，按约定停止。** 全新一次耗时465.226秒、9次模型HTTP（提取1、原有IR修复1、配置1、翻译6），付费审核0。没有手改候选、再次提交、安装、导入或刷新。

本轮授权：查明同一译义为何再次漏检，以最新保存坏译文建立回归，单点修复，不手改候选、不放宽校验；固定同源全新生成一次，成功才导入刷新，失败停止。付费审核关闭，不commit/merge/push。

复用已授权工作树。81个既有dirty/untracked文件身份记录在`.local/forge-food-retention-20261012/baseline.json`。fixture取自上一轮result SHA a81f642db1079b46a9630e792af123e764e38f62faea948a2f5aae2ecfd8b022，原始HTML来源字段与错误译文逐字保留，仅筛选这一字段，不修正文案。

本地原因：历史记录明确只用reviseForgeEncounterLocalizationBody修正当次10个槽；未增加food-retention保护/回归。当前validateLocalizationDraft只核身份、数字/骰式、HTML、中文及已知术语，无此句的后果/必要条件校验；protectCriticalRulePhrases也没有这条语义，并在HTML标签处分段。本次原文keep solid food与down分在相邻li中，不能靠只匹配单段的规则认出完整句。deferred策略不调用付费审核，所以草稿形式检查通过仍需核源；不是已有该门禁后来被关闭。

检查选择：原始坏译文在共用validator、GM批准和已有批准读回先RED；覆盖纯文本/换行/HTML/改名，正确“留住不吐”及海水必要条件通过，吞咽替换、遗漏/反转必要条件、改成淡水和数字/标记变化仍失败。再补真实战斗包草稿/续跑出口，确保不是未接线的独立helper。修复仅共用译义门禁与对应来源提示，不改来源或已保存候选。相关本地化组、Forge整合、类型、架构、局部anti-overfit、构建和手册核对后才冻结并进行一次真实新提交。

共用校验的6项定点先获得4个预期RED、2个对照PASS，修复后6项全通过。新的有限语义门禁把HTML分段还原为只读可见句子，要求保留固体食物、不吐出与海水必要条件；未知来源变体保留核对，不依怪物名或译文ID。数字/标签门禁仍先执行。提示只澄清该来源含义，不改模型回复；增加真实战斗包草稿和伪旧draft_ready续跑检查，用于验证坏译文不能绕过共用入口，且付费审核零调用。

公开流程检查已通过：7项/37断言，坏译文保持在needs_review回报，旧draft_ready也重新按当前门禁校验；只重译被拒字段的机制仍有效，测试内审核0次。接下来因contracts共用校验与translation提示变化，运行已存在的本地化完整组、相关关键保护/Forge测试、全仓和package类型、依赖及局部anti-overfit。输入输出限制新增有限食物留存校验，需要同步手册和构建。没有其他产品代码修改。

补齐真实翻译service的传输回归：来源提示确实进入请求，即使fake provider仍返回本次原始错误译文，服务不擅自改稿，共用validator仍拒绝；1次fake调用，无审核。8项本缺陷测试纳入44项本地化组（329断言），另542项Forge/关键保护通过。package类型、架构1314模块/3112依赖、2文件anti-overfit及build通过。全仓类型先发现测试只读actor数组赋值与mock缺模型字段，已修正测试构造并通过；未改产品语义。手册6条核对并重建，33项check通过。新增最后一个传输测试后仅补全仓类型确认，其他已通过且实现未变的检查复用。

## 为什么又漏了，以及本次具体修复

1. [历史引用定义记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-reference-definitions.md:35)明确记载当时修正的是10个候选正文槽，并未建立通用译义保证。对当前实现/测试检索没有这句food-retention门禁，故不是已有同一回归失效，而是未把当时人工发现转成程序约束。
2. [共用validator](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/contracts/src/localization.ts)原先检查身份、数字/骰式、HTML、中文残留、术语和少数状态词。“咽下”与“不吐出”都能满足这些形式要求，旧坏译文在本次RED中实际通过了原来的validator和GM批准路径。
3. [关键规则保护](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/critical-rule-localization.ts)没有食物留存规则，并明确在HTML标签处分段。本次保存来源把keep solid food与down分在相邻li；简单往单段正则里追加完整英文句子也不够。付费审核关闭使程序没有额外模型语义复核，但开启付费审核不是本次修复手段。

现在在共用validateLocalizationDraft里，对明确英文食物留存句式作有限检查。只读合并可见文本跨换行/标签核句义，要求固体食物、不吐出、海水送服必要条件同时保留；原HTML与数值仍由既有严格校验独立核对。支持数种等价中文表达，吞咽替换、只要条件、条件反转、改成淡水和新增例外均拒绝。未知来源句式或不在有限等价范围的译法仍需核对；不宣称通用自然语言等价已解决。

生成器只获得更明确的来源指导，不会修改返回译文。该门禁经公开草稿、旧draft_ready复用、GM批准与批准读回路径验证；不是只供测试调用的独立工具。没有改动INT/WIS、provider重试、中文残留或数值/标记校验。

## 一次同源全新提交

北京时间2026-10-12 16:36:37.139至16:44:22.364；流程总时465.226秒，不含开发和事后读回。源SHA仍为0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1，4314字符。独占目录阻止第二次启动，没有旧IR、译文、控制配置或人工修正参数。

| 阶段 | HTTP数 | 结果 |
| --- | ---: | --- |
| 新提取 | 1 | 84.512秒；前置校验报告5处Save属性非法、2项来源能力遗漏提示及目标选择冲突 |
| 原有一次IR修复 | 1 | 105.947秒；通过后继续，不算零修复首次成功 |
| 配套配置 | 1 | 46.935秒；形成正式英文prepared候选 |
| 翻译 | 6 | 角色4批、包级2批；角色76字段为draft_ready，包级3字段返回后被英文残留检查拒绝 |
| 付费审核 | 0 | 禁止入口未被调用 |

翻译6批依据保存的request和既有9000字符/标题先行分批方式对应，不是重新提交整个来源。所有9次HTTP为200、finish_reason=stop。英文包仍ready_for_gm_review，但hasChineseDraft=false；不能将英文包状态当作整份中文接受。

## 食物留存实测通过，完整出口仍失败

本次字段 `text-904a74e2142cea239e8d7b69` 的原文仍是相同完整引用定义；新的描述和译文都没有复用上次修正文本。译文为：

> 它只有用海水送服，吃下的固体食物才不会吐出。

上述展示去除了HTML分段空白，原始字段未改。实际源/译配对、字段ID和完整HTML保存于failure-analysis.json。已再次只读调用共用validator：当前角色76字段通过，旧保存坏译文触发“食物留存”拒绝。这个结论证明本次目标句与确定性门禁，不代替全部76字段的穷尽语义批准；未进行世界运行验收。

完整出口停止在包级字段 `text-e3b2371c3320d1418879ffc7`。模型的英文说明和中文回复均含5个实际固定配置规则ID，例如 `sea-hag-auntie-seed-terror-manual`。当前[displayRuleReferences](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/forge-browser-runtime/src/encounterLocalizationProjection.ts:13)的显示转换只识别 `rule id <编号>`；本次模型写 `gm-manual rule <编号>`，不满足该条件，因此编号未转换成来源绑定的显示名称。已只读解码固定配置，5个ID确实存在于当前规则中；原有中文完整性检查正确拦截残留。

这里保留新的失败证据，不把它归为食物留存校验再次漏过；也不扩大本轮去修显示映射或放宽英文检查。没有第二次提交、字段续译、人工文案修正、中文批准或原生导入。

## 原件与收尾

- [首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-food-retention-20261012/fresh-attempt-1/summary.json)：SHA256 `2006cc570a7ff560756080d9496d6121538ebc0bbc6e122c9e6c9b7ea2dda6e0`。
- [完整result](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-food-retention-20261012/fresh-attempt-1/result.json)：SHA256 `eb3cb6e4dafc056b43c1a6b79e133fa4f16aa837bfd6d3037500c4b9cb20d028`。
- [来源/译文与停止原因](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-food-retention-20261012/fresh-attempt-1/failure-analysis.json)：各原件SHA、食物留存正文、包级ID证据和范围。
- [收尾记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-food-retention-20261012/closure.json)：74个范围外既有dirty/untracked不变、199个产品源码与冻结时一致、HEAD未动。

候选JS为b4b6dd4e2ecb4abd79114ba5371cc23d8fd4e505fe90b1ae4370c1c50dfcc692，未安装；Lab仍为旧ee6dd617aceb9aeb2d3aa1a20c56c3f9fa3bd71f7a23fc62b6c4da1b50ef0dd3。没有浏览器派发、世界写入或服务操作。原始summary/result保持首次内容，事后仅增加独立分析和报告；代码不变，没有commit、merge或push。
