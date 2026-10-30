# Forge 能力提取：逐能力与按类别批量的证据比较

日期：2026-10-19。状态：研究完成，提取改造与真实 A/B 均未执行。本报告不修改原 chat 的修复计划，不接受整个 Forge，不授权模型调用、安装、Foundry 写入、提交、合并或推送。

## 结论和证据边界

外部开发者确实采用过按完整单元提取、按相关字段分组提取，以及程序处理与模型处理结合的不同方式。现有资料没有直接比较本项目的逐能力方案与 Actions/Bonus Actions 整类方案，不能宣布任何一方已经更准确、更快或更便宜。

用户原方案 B 应当作为原样定义的候选，不能先被改成混合方案再进行评价。现状 A 应保留为对照；已有投入不证明 A 更好，B 更依赖 AI 也不证明 B 更好。是否保留某层实现，应依据它继续满足目标的证据和替换成本，不能只依据历史工时。

推荐下一决策是比较 A 与 B 的真实整体效果，先不替换执行路径。若再提出按语义关系成组、类别过大时拆组、规则快路径或局部修复，应单独标为增强候选 C，不能把它的预期收益记到 B 原方案上。此建议是工程判断，尚无本地效果实证。

## 范围、候选身份与分工历史

本报告保存位置是独立文档 worktree，来自已提交 master `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`；这里没有复制 Forge 未提交源码，也不冒充运行候选。研究对象为：

- worktree：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample`。
- branch：`codex/20261006-111625-bettermonsters-eye-deep-sample`。
- HEAD：`f79c25fbac747a7e08f98c48779f052c3db68599` 加大量 dirty/untracked 文件；HEAD 不代表实际候选。
- 独立源码取证时点：2026-10-19 20:21:02 +08:00。原修复 chat 仍可继续修改，以下行号和哈希都是静态快照。

旧 CLI 已经有分工：按标题切怪、可选 AI 将整只怪整理为专用 YAML/MD、程序解析和生成。现代普通 Intake 又有完整证据 IR 提取路径。当前战斗包强制启用分步 facts/auto，不能将它泛称为全部 Forge。既有核对已于 10 月 17 日记录这一区别；问题不是项目从未分工。

历史依据保留在原候选的以下既有记录，不新建竞争的产品当前状态：

- [旧 CLI 与当前入口核对](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-source-normalization-audit-20261017/cli-vs-encounter.md)。
- [10 月 13 日分步可行性](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/reviews/2026-10-13-forge-staged-api-feasibility.md)：当时已明确拆分收益未测量。
- [分步实施及 V1/V2 调整](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/plans/2026-10-13-forge-staged-manual-implementation.md)：V1 出现返回格式和来源证明错误，V2 把更多来源/格式职责交给程序。
- [共用契约与旧能力恢复](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/plans/2026-10-17-forge-common-contract-restoration.md)：后续补回基础操作、共享资源和真实施法；这些修复不证明调度粒度最优。

## 比较对象固定

| 对象 | 初次提取怎样分配 | 不预设的部分 |
| --- | --- | --- |
| A：当前战斗包 | 程序持有完整来源单元；AI 一次基础 facts；部分能力由程序识别，其余逐完整能力请求 AI，再核对组装 | 当前程序识别未必覆盖完整；已得到部分字段仍可能请求 AI 找遗漏；不是每项能力都会发请求 |
| B：用户原方案 | 基础属性一批；Actions 全部一批；Bonus Actions 存在则整类一批；Traits/Reactions/Legendary/Mythic 等按类别处理；每批给本批原文与相应 MD 填写模板，AI 返回填好的标准内容 | 用户没有规定必须只给裁切原文、必须重写来源坐标、必须整组重试或必须取消所有检查；这些不能作为 B 的既定缺陷 |
| C：可能的增强候选 | 例如 B 加类别过大时拆组、按依赖关系组合、局部修复，或保留部分程序识别 | C 并非 B 原方案；本轮既未实施，也未证明其更好 |

“请求按类别发出”与“结果逐能力核对”可以同时成立；“按完整能力发请求”与“模型可见其他相关能力”也可以同时成立。

需要分别评价三个变量：一次分配多少任务、语义提取由程序还是 AI 承担、模型返回 Markdown 还是结构化对象。B 是可以整体比较的方案，但整体胜负不能自动归因为其中某一个变量。没有证据表明 Markdown 或 JSON 名称本身决定准确率。

## 当前源码确认的事实

- [战斗包配置](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/forge-browser-runtime/src/encounterIntake.ts:102) 启用 `baseMode: facts`、`featureMode: auto`。
- [分步调度](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/staged-extraction.ts:540) 先程序划分，特定失败可请求 line-ID 分区；基础 facts 后进入能力循环。单能力请求携带所属 context 和全体 sourceInventory，不能将 A 描述为必然只看孤立一句。
- [能力组装](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/staged-extraction.ts:390)、[来源操作契约](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/source-operation-contract.ts:8)、[共享资源](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/staged-resource-pools.ts:11) 和 [施法组装](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/staged-spellcasting.ts:67) 属于不同职责。它们可以评估后继续复用，不天然绑定单能力请求。
- A 当前的网络重试边界不等于能力边界：[retryingMonsterProvider](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/forge-browser-runtime/src/encounterIntake.ts:122) 在特定本机桥接配置下包装整个 extract。不能宣称 A 已自动只重试失败能力。
- 程序校验并不等于程序一定正确。若某个校验仍依赖过窄的来源句式，B 即使正确提取也可能被同一校验拒绝；改批大小本身不能修复该问题。反过来，不能以模型正确为假设删除来源校验。

## 外部原始证据

本节将产品开发者文档、真实用户报告和作者实验分开；研究使用公开原文，不以搜索摘要替代结论。没有找到 Actions 整类与逐能力在同一 Foundry 输入、模型、验证出口上的公开直接 A/B。

### 1. 直接同类：AI Monster Importer

固定提交 `7381ed0c34a63020cb870be93d041435e7ab12d1` 的默认路径先提取基础信息和能力清单，再逐能力并行请求模型，最后由 formatter 组装。它证明逐能力是实际采用过的路线，不证明当前 A 更好。该实现把失败项过滤掉；[issue 5](https://github.com/wickercar/foundry-ai-text-importer/issues/5) 的用户还报告熟练和豁免加值错误并跟进多来源重现，读取时仍 open。不能把这些实现错误归因于粒度，也不能说 B 会自动避免。

原始代码：[总流程](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/genFoundry5eMonsterFromTextBlock.ts)、[逐能力提取](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/text-parsing/Parsed5eItemParser.ts)。这是旧系统年代的固定实现，不是本机已安装或 5.3.3 已接受的替代品。

### 2. Unstract：提示可以分开维护，再组合执行

[开发者文档](https://docs.unstract.com/unstract/unstract_platform/features/single_pass_extraction/single_pass_extraction_intro/) 将一个字段或紧密相关字段组作为提示维护单位，也支持合并执行以减少重复上下文；同时警告大量密集指令会降低遵循能力。其建议短文档保留完整背景，不能偷换为“任何分组都要裁掉其他原文”。[验证说明](https://docs.unstract.com/unstract/unstract_platform/features/single_pass_extraction/developing_and_verifying_singlepass/) 要求核对代表性输入变体。这是开发团队的产品实践，不是独立的 Forge 对照实验。

对 B：按相关内容成组有现成实践。对 A：单独维护小任务有维护价值。两点都不决定实际请求必须多大，更不能把供应商的高准确率目标当作本地保证。

### 3. DocETL：有实测，但不是本项目胜负

使用固定 [论文 v3（2025-04-01）§5.1、§5.6](https://arxiv.org/html/2410.12189v3#S5.SS1)，不混用 v2 数字。50 份合同、41 类条款，优化为 21 组 map，每组抽取 1–3 类相关内容并提供全文，随后合并。相对自身未优化基线，F1 从 0.379 到 0.477；运行时间 23.43→180.30 秒，执行费用 $0.08→$1.46，优化成本另计。它支持“聚焦相关任务值得评估”，不支持分类一定省时。F1 仍为 0.477，评估允许较宽松片段重叠，不能当成严格规则保真。

同文 30 个计划实测有显著差异，部分生成计划甚至漏传正文。没有纯粒度消融，也未比较本报告 A/B；不能把全部收益归因于分组。

### 4. LangExtract：真人报告和修复说明上下文是独立问题

[issue 230](https://github.com/google/langextract/issues/230) 的开题正文自称 AI 生成且未验证，因此不作为真人复现。后续用户 azaroth42 报告 Wikipedia 跨块共指和身份复用问题，并说明使用滑窗预处理；维护者通过 [PR 306](https://github.com/google/langextract/pull/306) 增加前文上下文。它支持检查跨组依赖，不支持“A 必然没上下文”或“B 必然解决依赖”。相同类别内也可能不独立，不同类别间也可能共享规则。

### 5. trustcall：局部修复可以独立于初次批大小

[作者实现和示例](https://github.com/hinthornw/trustcall) 使用补丁修正失败工具输出，而非每次重写整个对象；这一恢复方式并不专属于 A。其 README 的最少三项 food 验证示例还能看到为通过验证而新增原文未列出的内容。示例用于说明结构修复，不是忠实来源提取的保证。来源语义核对必须继续独立存在；B 加局部修复属于额外设计，不能假定 B 原方案已经具备。

### 证据取舍

本轮重点为直接同类固定源码、非主流领域提取系统、原始用户问题与作者实验；没有用热门通用框架清单代替比较。LangExtract 只作跨组上下文的反例。外部工具均未在本机安装、运行或接入，兼容与本机健康为 Untested，不进入可用模块清单。

## 同一标准下比较 A 与 B

| 维度 | A 当前方案 | B 原方案 | 当前判断 |
| --- | --- | --- | --- |
| 常见能力 | 可直接使用已验证的程序识别，少问模型 | 仍将该类整体交给 AI | A 有避免部分请求的机制；不能据此推出总体更快或更准 |
| 非典型语言表达 | 模型补充受既有分流和校验影响；过窄判断可能误拦 | AI 负责该组完整整理，较少依赖预先识别每句的模板 | B 有覆盖写法变体的合理动机；成功率未测，校验缺陷也不会自动消失 |
| 同类内关系 | 单能力提案可看 inventory/context，最终统一组装 | 一次处理该类多项能力，相关规则同时属于工作目标 | B 的任务组织更集中；不能把 A 写成没有背景来制造优势 |
| 跨类别关系 | 已有资源、施法、升级等统一检查 | 仍需处理 Actions/Bonus/Traits 等跨批共享或引用 | 两者都要核对；类别不等于依赖边界 |
| 漏项与错误定位 | 有单能力身份和错误路径；实际自动重试可能重跑 extract | 有身份清单和逐项检查也可定位；整批错误恢复策略尚未定义 | 单项校验与请求批大小是两件事，不能宣称 B 注定整组重跑 |
| 上下文和输出体积 | 若 k 项问模型，可重复携带同一 inventory；但 k 可为 0 | 重复模板次数可能减少；Actions 很长而 Bonus 很短时，类别大小失衡 | 都有可能更贵；应记录真实输入/输出及重试，不能只数步骤 |
| 已有修复与切换成本 | 已有当前入口、回归和部分真实结果 | 需要新批量返回适配/可能的 MD 接口适配 | 这些是工程成本，不是准确率投票；不必推倒生成与来源核验层 |

反例不是已观测的 B 故障：跨 Actions 与 Bonus 的共享 3/day、Traits 给出的施法属性、升级伤害引用前置能力、极长法术能力、同一能力内攻击后豁免、Regenerate 两个治疗时机。这些应作为共同验收对象，而不是拿来默认拒绝 B。

## 推荐的下一判断方式，尚未执行

1. 等原 chat 的候选边界稳定后，固定该候选、同一来源、同一模型配置及目标版本；不并行修改其核心文件。
2. 先比较 A 与 B 原定义的整体效果，程序仍保存真实原文，使用相同的正确性出口。若 B 返回 MD，可以适配进共同结构；这不表示已证明 MD 更好。不能为某一方案降低语义要求，也不要求 B 保留 A 的规则快路径才允许参赛。
3. 复用现有来源，覆盖常规动作、非典型写法、同类引用、跨类共享资源、两段治疗、升级继承、施法和排版变体；不因哪边失败而换输入。保存首次结果和失败；后续修复另算。
4. 先按能力检查有无缺文、错数值、错主体/条件/时机、错误自动化和错误资源消费，再记录首次合格率、总耗时、模型等待、HTTP/重试数及 token/费用。实际费用不可得时记 UNKNOWN，不能拿估算冒充账单。
5. 第一轮整体比较之后若需要解释原因，再分别控制“粒度、AI职责、返回格式”这三个变量。不是所有疑问都要先建通用调度平台。
6. C 只有在有具体风险或 A/B 结果支持时才另行评估；不能用折中本身冒充经验已证明的最优。

上述是可执行的比较建议，不是本次已经授权或已经运行的付费实验。原 chat 已有行为验收继续有效，不因这份报告而重跑。

## 独立检查、实际执行与保存边界

- 外部研究子代理：独立检索原始论文、开发者文档、真实问题与跟进；根复读核心来源。
- 本地只读子代理：核对当前分工、共享依赖、历史记录及可复用层。
- 独立推理审查：检查 A/B 定义、上下文公平性、案例归因、沉没成本和第三候选偷换；该角色没有重新读全部外部原文，也不提供效果实测。
- 三个角色仍是 AI，独立审查不保证无偏；外部真人材料和后续同条件结果才是另外的证据层。
- 实际执行：本地文件/Git 只读检查、公开检索和原文阅读；单独创建本报告 worktree 并写本文；没有执行产品测试、真实模型生成、浏览器、安装、Foundry 写入或 Git 发布。worktree 创建触发仓库已有初始化钩子，在新 worktree 建立了本地配置和 `.worktreeinclude`；没有把它算作研究源码改动。
- AnySearch 的一条 DocETL 检索返回 `Search service temporarily unavailable`，改用网页工具读取官方文档/原论文；其他检索继续。研究子代理遇到 GitHub 匿名 REST 限流，使用原网页和固定 raw 源码，没有增加认证或声称缺件成功。
- 核对范围：本文的语义、引用与作用域。无用户入口、输入输出、支持版本、已发布步骤或安全限制变化，不更新产品手册，也不运行全仓 CI。

### 源码时点哈希（非已提交候选）

```text
packages/intake-ai/src/staged-extraction.ts FF74402191C9D20A554B9525EB5B8651B6CE930D6379A35D44F12E77F90689CC
packages/intake-ai/src/staged-source.ts 943F23B8741E0EBDDF7655D80AE076878CA180142509DAE65591FE918AF1EE48
packages/intake-ai/src/staged-feature-mechanics.ts DC2323C07DD4ABC8A38A92977091B6321B75E986AD15B28AA6AC0B042501594A
packages/intake-ai/src/staged-resource-pools.ts 38C06DD4466984C4B7C2E131BB98862B56189EBF43C054A76389A736DDDAB62D
packages/intake-ai/src/staged-spellcasting.ts 60BDA6C422F75EBC7F4E951B9CFBEB88A56FB6726B450566E235D5C6E4CC3F4A
packages/forge-browser-runtime/src/encounterIntake.ts 0C72B7793686E94E1462E9E4410578EC809EF4AFB8F1F315E30A0576CDD059A9
```

## 待判断引入、本地化与新候选复查

- 没有外部模块或框架获准引入/本地化；Unstract、DocETL、LangExtract、trustcall 仅为设计证据。
- 待判断的是 A/B/C 的处理方式，不是依赖安装。若后来选择具体工具，重新检查版本、许可、数据去向、来源绑定、失败保留和目标运行兼容；Untested 不计可用。
- 新候选优先找同输入、同模型下的分组/逐项对照及失败原件；没有这一层时按机制证据处理。复查不能只看 schema 通过或供应商成功率宣传。
