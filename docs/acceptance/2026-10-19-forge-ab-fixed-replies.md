# Forge A/B 分类 MD：固定回复接线验收

**结论：B 的内部实验入口已接通，四组固定回复的 A/B 共八条来源链均通过共同正式验收。真实模型调用为零。** 这只证明接线和拒绝行为，不证明 B 的提取质量、速度或费用优于 A。

## 基线与接入位置

- A 完整提交：`f637f77f28c086e34297513e5293f98b3835f2e9`。
- 实验目录：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261019-forge-ab-fixed-replies`。
- 分支：`codex/20261019-forge-ab-fixed-replies`；HEAD 直接从 A 建立，没有只挑最后一次差异，也没有混入 master 分叉。
- 原修复工作树与旧 B 工作树保留。此次没有 commit、合并、push、模型请求、Foundry 安装或世界写入。

新增的 `@fvtt-json-generator/intake-ai/category-md-extraction` 提供实验入口 `runCategoryMdMonsterExtraction({request, baseFacts, call, linePartition?, signal?})`。调用方注入固定回复；模块本身没有 HTTP 客户端。基础事实必须先经 A 的同一校验，当前接口不新增基础属性请求。存在来源切分歧义时可显式复用同一个行号切分回复，不能修改原文消除歧义。

B 按 Actions → Bonus Actions → Traits → Reactions → Legendary → Mythic 分批，空类跳过；每类包含其全部完整能力。每次提供该类 MD 模板、完整能力清单、各自原文与上下文、基础来源和 A 的现有操作契约。不因 A 能用程序处理就跳过 B 的能力请求。

AI 填写的 MD 被实际解析；适配器将其转为 A 接受的能力提案，接入 **同一组装器 → validator → renderer → workflow/parser/generation → Intake/Actor verifier**。JSON 仅封装类别、能力 ID 和 MD 字符串。程序保留原文、范围、证据和共享来源绑定。跨能力伤害升级、法术组等继续由共同组装器处理，不另造 B 专用规则生成器。未加入 Forge UI 或替换现有 A 入口。

## 已验证的完整链

以下是已有可移植来源及其明确标注的合成载体/组合对照，均不是新模型回复。B 的填写内容在任何一方运行前声明，没有用当前 A 的输出即时制造 B 答案。

| 固定对照 | A/B 最终读回 | A 能力回调 | B 类别回调 |
|---|---|---:|---:|
| 多类别：3 个动作、1 个附赠动作、1 个反应 | 攻击及后续豁免、双属性择一豁免、伤害、30 尺锥形、每日 3 次与充能保留 | 5 | 3 |
| Periapt 单次治疗 | action、2d4+2、自身、黎明一次恢复及一次消费 | 0 | 1 |
| Regenerate | 初次 4d8+15、后续 1、同一触碰受者、完整时机、后续无再次消费 | 0 | 1 |
| 两条完整伤害升级规则 | 单一 2d8、四类型择一、原始前置条件及两条完整父规则 | 0 | 1 |

上表只统计固定能力/类别回调。A 每组另接收一次相同基础事实回复；B 使用该共享基础事实，不在此重复请求。所有回调都是本地固定函数，不是 HTTP；不能用这些数字或测试耗时推算真实性能。

每组保存了原始来源、共享基础事实、两边 IR、规范 MD 和正式 Actor，以及 B 的模板、请求载体和填写 MD。八条保存后的来源链分别执行现有 `verify:intake` 与 `verify:actor`，共 **16 项读回，退出码均为 0**。Actor 验证使用该链生成的规范 MD；Intake 验证使用原始来源。没有手工修补最终 JSON。

## 拒绝与边界

- 错 DC、伤害骰式、目标或次数被拦截。OP 与 MD 载体的格式边界不同，不能要求两边每种错误码完全相同；例如 A 禁止在 OP 提案中额外携带 uses，B 检查 MD 中明确填写的次数是否与共同来源资源一致。
- 省略/重复/调换能力 ID、漏行、错类别、改正文规则、重复 YAML 键或伪造来源字段被拒绝。
- 手动模板不能被当作攻击或治疗的完成答案。B 不使用 A 的 auto 模式替换缺失的攻击提案，也不让已知单次治疗在模型未填写时悄悄恢复为成功。
- 法术属性与完整原文引文进入 A 的法术组校验；错误属性被拒绝，错误 OP 不能被法术分发悄悄吞掉。这里只证明 IR 法术组边界，没有新增法术匹配、导入或世界消费验收。
- 对两边成功 Actor 故意改错伤害/治疗后，同一个 verifier 均拒绝。
- 取消、来源身份、整类遗漏和回调失败保留拒绝；没有重试、修复调用或自动降级。

## 原定三来源前置

Giant Boar、Mezzoloth Company layout-v2、Angel of Obsession 的原件与基础事实文件哈希均核对。两边通过共同基础事实前置，分别为 **3/7/8 个父能力、2/3/4 个类别**，共 18 个能力、9 类。

Angel 的确定性切分在 A 上仍报 `UNLABELLED_MECHANICS`。复用原先已保存的第 02 份来源行号回复（见 [固定切分输入](../../tests/fixtures/forge-category-md-angel-partition.json)）后，共同前置可过。没有修切分器、改来源或新增来源模型调用。**三份原定来源仅完成切分/基础事实前置，没有执行其完整分类提取与生成，也没有以四组接线对照替代未来三来源真实 A/B。**

## 检查结果

- 新增接线/接口/原定来源前置：**28 通过，0 失败**；集成测试禁止真实 fetch，观察到 0 次网络尝试。
- A 已有定点回归：治疗 28、Regenerate 13、伤害升级 21，共 **62 通过**。普通空施法数组的预期拒绝仍保留，不能把这项回归通过说成普通入口功能成功。
- `typecheck:packages`、最终 intake 包类型、`architecture:verify`、新增两个源码的 anti-overfit 均通过。
- `typecheck:all` 仍退出 2：**21 条诊断**，只在 A 原先的两个回归文件；新增 B 文件没有诊断。A 的较大回归 5 项失败、旧 v12 失败、当前版本实机未验收等边界原样保留，本轮没有重跑或修补这些问题。
- 改动仅为 B 新模块、测试、固定切分输入、说明和测试/package 出口。A 已有产品源码、lock、原工作树不修改。运行环境为 Bun 1.3.8 和冻结 lock；未将 A 整理时的 Bun 1.3.14 耗时与本轮比较。
- 手册核对：只新增内部实验/测试入口，现有产品入口、用户输入输出、支持版本和安全权限均未改变；未修改产品手册或宣称全仓 CI 通过。

## 查看与复跑

先看本地 [动作模板](../../.local/forge-ab-fixed-replies/multi-category/B-action-template.md) 和 [固定填写后的动作 MD](../../.local/forge-ab-fixed-replies/multi-category/B-action-filled.md)，再对照同目录的 `A-rendered.md`、`B-rendered.md` 与 Actor。完整数据索引在本地 [最终收据](../../.local/forge-ab-fixed-replies/final-receipt.json)。这些 `.local` 运行产物不进入 Git。

在实验工作树中运行 `bun run test:forge-category-md` 可复跑可移植接线对照。原定三来源的本地前置默认跳过；需要显式设置 `FORGE_CATEGORY_MD_PILOT_ROOT` 为原件所在目录。若同时将 `FORGE_CATEGORY_MD_EVIDENCE_DIR` 设置为实验目录下 `.local/forge-ab-fixed-replies`，测试保存上述接线产物。它不会读 API 凭据或发模型请求。

**当前交付是离线实验接线，不是对 A/B 优劣的裁定，也不是当前候选 Foundry 实机验收。**
