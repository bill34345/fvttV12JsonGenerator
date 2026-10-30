# 海鬼婆同源全新生成：单次提交

用户要求：用同一份海鬼婆原文全新生成，不复用旧IR、译文或人工修正；记录首次结果、耗时、模型调用次数。成功后一次导入与刷新；失败保留现场分析，不重复提交凑通过。付费AI审核保持关闭，不合并master。

当前结果：**唯一一次全新提交失败，needs_review；无完整候选、无中文草稿，未导入或刷新。** 已停止并保留现场，没有第二次提交、续跑或人工内容修正。固定源SHA256 `0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1`，4314 UTF-16字符；候选JS `ee6dd617aceb9aeb2d3aa1a20c56c3f9fa3bd71f7a23fc62b6c4da1b50ef0dd3`，本轮没有修改产品代码。

设置与前批一致：DeepSeek/deepseek-flash/openai-chat/json_object/low，中文，deferred审核。计时使用公开Forge战斗包生成流程；一次提交内的原有有限IR修复单列，调用数含提取、控制配置、翻译及其原有自动修复。没有外层重试、旧草稿、旧控制配置、译文续接或正文修正。API Key仅从既有外部文件读入内存，证据不含凭据、完整HTTP响应或推理文本。

证据目录`.local/forge-sea-hag-fresh-20261012/attempt-1/`。计量脚本通过独占创建目录防止重复启动，逐请求保存状态/耗时/usage元数据，保存新提取IR、首次分析、最终结果及源代码前后指纹。先核原生候选与中文含义，只有生成完整且核源无错才派发实际导入；自动化测试确认不冒充人类逐条审核。若失败，停止在首次结果，不修代码或候选凑通过。

## 首次结果与计量

北京时间2026-10-12 14:28:28.941至14:30:29.414；生成流程总耗时 **120.473秒**，不含前置准备与事后分析。只调用一次`generateEncounterFromHumanMarkdown`，参数未包含drafts、draftParentHash、sourceFeedback、priorDrafts或缓存控制配置。

| 阶段 | 发起HTTP数 | HTTP耗时 | 结果 |
| --- | ---: | ---: | --- |
| 新提取 | 1 | 93.051秒 | 返回有效IR；5环法术等级仅在Bilebrine名称中，没有进入正文，被SOURCE_SPELL_LEVEL_OMITTED拦截 |
| 流程内自动修复 | 1 | 27.199秒 | 补入Bilebrine正文的5环/充能限定；Seed Terror结构完全未变 |
| 配套配置生成 | 0 | — | 未到达 |
| 中文翻译 | 0 | — | 未到达 |
| 付费AI审核 | 0 | — | 禁止入口未被调用 |
| 总计 | **2** | 总流程120.473秒 | **首次失败，停止** |

两次请求都是HTTP200、finish_reason=stop。199个纳入快照的来源代码文件在前后检查中均未变化。所有调用均由此次原文提交产生，使用旧原文不等于复用旧IR。此单样本结果只记0/1，不推广为一般成功率。

## 现场分析

最终阻断为 `ACTOR_SAVE_ABILITY_DRIFT`，路径 `/creature/actions/3/save/ability`，原文错误信息 `Seed Terror lost save ability undefined.`。

新IR完整保留Target’s Choice、INT/WIS、DC15及能力正文，但结构为 `activityType: save` 和 `save: {dc: 15, condition: ...}`，没有`save.ability`；`uncertainties`为空，也没有旧输入的feature.evidence数组。首次提取与自动修复后的Seed Terror对象逐字段相等。修复请求只纠正先前已报告的5环正文问题，没有改变这个不完整Save。

上一轮保存失败IR是“无structured save、有AMBIGUOUS_SAVE_ABILITY阻断及完整feature证据”。当前来源整理的限定分支要求该错误标记，且拒绝已有save对象，因此本次另一种形态没有触发它。具体条件见`packages/intake-ai/src/source-facts.ts:73`及`:79`。这证明上一轮修复仍是已保存形态的有限处理，尚不足以保证同源全新提取成功。

本次还直接暴露了验证时点问题：缺少ability的Save通过初始IR校验，补5环正文后分析状态为ready_to_generate；后面的生成投影含 `save.ability: ["undefined"]`，并带一个恐慌Effect。Intake来源→Actor verifier在`packages/intake-ai/src/verifier.ts:688`拦下它，formalStatus/intakeVerificationStatus均为needs_review，没有形成可导入prepared包。这个中间产物没有进入世界，不能称作有效的原生Save。

另一个ACTOR_CONDITION_REQUIRES_GM是Steal Passion的手动后果提示，属于已有GM配套边界；本次提前停止的新增实质阻断是目标选择的Save属性。Hag Debts与Merthirst已保留在传记，引用定义保留问题没有复发。

若下一轮继续修复，应先用此次新IR补反证，检查原生Save缺失ability的前置拒绝，以及依据来源事实处理同一目标选择的不同IR形态；不能单靠模型是否生成特定错误码。此处只记录下一诊断方向，未执行新修复或重试。

## 保留证据与边界

- `summary.json`：SHA256 `3cc8fee030a77e965532d1adb6799c9fd68302969fbf131fcb16172482493031`，首次结果、计时、请求、明确不复用策略。
- `fresh-extracted-ir.json`：SHA256 `abb0476f2bc292ea644331d38c8ecdb50d502fc107183c71af7e1740390331b3`，本次新提取的结构化IR。
- `first-analysis.json`：SHA256 `6883e2c981a75844bdf59cfa49bcf15b62bedee77b05c48a7b4a8a17b1ef72e5`，自动修复前的分析与原阻断。
- `result.json`：SHA256 `a039560b42a10917c3a77694282c945682bdec6abdd5ecdac7b4986fdd5fbba4`，自动修复后IR、实际中间投影与最终阻断。
- `requests.json`、`stages.json`、`progress.json`、`source-manifest.json`：过程与代码身份。
- `failure-analysis.json`：独立读回原件、前后Seed对象相等、缺失ability、最终中间投影及边界断言；没有重写原始结果。

本轮没有改产品实现、修正IR/正文、复用旧译文、派发浏览器、创建世界对象、修改服务或commit/merge/push。既有通过的限定保存输入验收继续保留；本次新鲜生成失败另记，不能用旧PASS覆盖。没有代码变更，因此不重跑产品测试或手册构建；本次必要检查为计量脚本语法、身份前后校验及失败数据读回。
