# Gazer 普通失败推离的 GM 衔接

当前结论：**PARTIAL，尚未完成，不可进入本轮导入验收**。保存样例的核心衔接通过，但全新生成仍失败，离线分析另确认新候选的完整正文引文判定过严。

本轮只处理保存的 Gazer IR 中 Force Ray 的普通失败推离。保留力量 DC 12 原生 Save 与完整距离/方向；推离由 GM 手动处理，不自动移动 Token。付费 AI 审核关闭，不 commit、merge 或 push。

## 来源与最小复现

Beholders.pdf 第 4 页左侧 Gazer CR 1/2，原文 1732 UTF-16 字符，SHA-256 `a9c9cfc009ee19152ab64755bbda600628eabc3add772f32ecbad05a174b9a9b`。完整来源及原页视觉绑定复用 [首次对照记录](2026-10-12-forge-gazer-pdf-control.md)。

保存失败结果 SHA-256 `e82120b2b013fc21116696f43d40e0131ab7b5f554d274290f41caff80acde9d` 中的 repaired IR 原样进入 `tests/fixtures/forge-gazer-forced-movement-intake.json`。该 fixture 仅用于离线回归；全新生成不读取它。红测复现普通 Save 的 literal-only 阻断及战斗包 needs_review，记录在 `.local/forge-gazer-push-20261012/red.log`。

根因是结果分支没有结构化失败效果，`deriveExplicitSaveOutcome` 将 Save 记为 literal；普通 Save 的 literal-only 不属于可绑定的 GM behavior。旧 manualPreparationRules 从 appliedConditions 识别特殊状态，Force Ray 没有 appliedConditions，因此未生成准备声明，也未进入配置。原生 STR/DC12 Activity 和推离全文当时已存在，问题不是丢失 Save。

## 单点修改与边界

- 新增仅识别完整普通失败推离的来源证明：精确原文位置、完整能力引文、单属性/DC、同一受试目标、远离来源方向、固定/骰式距离与相关 claim 一致。模型错误码与怪物/动作名称不决定机制。
- 在来源已证明且绑定 gm-manual 时，渲染描述性的失败分支，保留原生 Save，并生成独立 literal/gm-assisted 手工规则。普通单 Actor literal-only 门禁和包准备器均未放宽。
- 准备与最终核源都要求完整原文落在同一 Item 的手工操作中；最终必须是 gm-manual 与唯一配套宏。缺少、错误、截断或冲突规则不能获得准备通过。
- 不实现失败差值、成功分支、额外前提、自动移动或未知强迫位移。没有扩展其他海鬼婆问题。

## 本地证据

- 新回归 5 项、100 个断言通过；覆盖保存的骰式距离、DC-first/不同属性及固定距离、PDF 断行/不同骰式距离。截断、否定、方向冲突、条件、成功分支、Save/claim 冲突、缺证据、错 Actor/Item、非 manual 配置及缺失宏绑定仍拦截。
- 完整比较全部原生 Save 字段与其余 6 个 Item。新增手工规则使载体获得稳定 Item ID，归一化 Save outcome 也改变稳定 Activity ID；除此之外原生 Save 数据和其余 Item 未变。未伪称 ID 不变。
- `test:fvtt-json-forge` 加既有 GM manual 回归：543 PASS；`test:forge-encounter`：541 PASS。
- `typecheck:packages`、`typecheck:all`、`architecture:verify`、4 文件 anti-overfit、Forge 构建通过。
- 保存 IR 经真实正式 workflow 重放，零模型请求；`verify:actor` 对正式渲染来源和 Actor 输出通过，warnings/sourceIntegrityErrors 为空。Intake 仍诚实报告 ACTOR_FORCED_MOVEMENT_REQUIRES_GM，包为 ready_for_gm_review，未称其全自动。
- 已核对手册对应条目并生成页面，`handbook:check` 通过。

候选 JS SHA-256 `bb0f14d17a278f9d7f4d3547fb29b0b7487fd2c40c6cff638142c73f5a34b1f8`。完整日志、来源、正式 Actor、核源和冻结清单位于 `.local/forge-gazer-push-20261012/`。

## 同源全新生成

北京时间 2026-10-12 19:57:13.326 至 19:59:11.103，只调用一次全新生成入口；不带旧 IR、译文、配置或人工修正。

| 阶段 | 实际模型请求 | 结果/耗时 |
| --- | ---: | --- |
| 全新提取 | 1 | 56.490 秒，直接 ready_to_generate，无 IR 修复 |
| 首次配套配置 | 1 | 39.180 秒，来源绑定编译拒绝 |
| 原有一次配置纠正 | 1 | 21.880 秒，再次拒绝 |
| 翻译 / 付费审核 | 0 / 0 | 未进入，禁止审核调用计数也为 0 |
| 总流程 | **3** | **117.777 秒，needs_review，无 prepared/中文草稿** |

三次 HTTP 均 200、finish_reason=stop，返回模型 deepseek-flash。配置纠正属于原有流程的一次数据纠正，计入本次首次结果；没有另起生成或外层重试。200 个产品源码文件在运行前后全部一致。

本次新 IR 的 Force Ray 保留 STR/DC12 和完整推离描述，来源 verifier 给出 ACTOR_FORCED_MOVEMENT_REQUIRES_GM，已进入配套配置阶段；旧的普通 Save literal-only 入口阻断已越过。但最终配置未通过，因此不能声称最终绑定或整包链成功。

## 失败分析与证据缺口

**已证实**：配置阶段两次响应均被来源绑定编译拒绝。保存报告只有通用 finding；provider-failures 仅记录 automation/unknown。两次被拒绝的配置 JSON 与底层具体 TypeError 没有落盘，进程已结束。因此无法查明它们具体错在哪个字段，不能归因于模型、网络、某条射线或特定编译分支。该诊断保留不足也是本轮缺口。

**另有独立反例**：不发模型请求、不改变候选，使用本次新 IR 和正式 Actor 做编译探针。含编号/标题的完整引文通过；去掉 `4. Force Ray.` 后仍是原文中唯一、同一能力证据包含的完整规则正文，Save、距离与方向全部保留，但被新 guard 的 quote 严格相等拒绝。这证明候选的引文边界判定还过严；不能据此断言本次模型返回恰好命中该反例，因为原配置未保留。

[离线反例](../../.local/forge-gazer-push-20261012/quote-boundary-diagnosis.json) 记录 exactUniqueSourceQuote / containedInSameFeatureEvidence / completeRulePreserved 均为 true，complete-body 仍 rejected。局部 5 项绿色回归没有覆盖这一有效正文形态，不能拿测试通过称为完全修好。

后续最小处理应先补这个有效正文引文回归，只校正完整来源范围的等价判断；保留唯一来源位置、同一能力、完整正文、DC/属性/距离/方向与冲突检查。同时保存脱敏的编译拒绝字段及相关配置，之后才能根据真实失败做单点修复。本轮遵照“失败就停”，没有继续改候选或再次生成。

## 收尾与剩余验收

- 未安装候选、未派发 Chrome、未导入、未刷新；这些均为 NOT_EXECUTED。
- 当前候选仍有上述引文边界缺陷及全新配置失败，不宣称任务完成。
- 冻结构建、原始首次 result/summary/IR/请求与阶段记录均保留；补充 failure-analysis 仅为独立分析，不改写原件。
- 付费 AI 审核为 0；无 commit、merge、push，master 未动。既有工作区文件保护核对见 closure.json。

