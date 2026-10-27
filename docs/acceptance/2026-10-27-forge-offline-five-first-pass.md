# Forge 五只非 Foundry 补测：首次结果与预设停止点

2026-10-27。沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD `a6591c0`及本聊天已验证的空记录接收修复。没有修改产品代码、提示词或安装包，没有提交、合并、推送，也没有启动 Foundry／浏览器。

用户原话：“行，按这五只、四份输入开始非 FVTT 补测，模型服务 HTTP 最多 6 次。先核对并冻结原文，沿用当前 worktree；不启用 AI 复核、纠错或重试，失败保留原答和已有候选，先不提交、合并或推送。”

按[已批准方案](../reviews/2026-10-27-forge-coverage-and-offline-samples.md)执行。实际在第三只 Shield Guardian 暴露治疗目标附注缺省导致整只无法生成后，按方案中的共用接收／转换问题停止条件，停在 **3／6次HTTP**。Hydra、Black Pudding 已保留完整候选；Shield Guardian 没有Actor；Mimic、Otyugh及其发现请求尚未执行。剩余3次未使用，不挪给修复、探针或重试。本批不是五只全部验收完成。

## 原文核对与冻结

使用已有官方SRD5.2.1 PDF，SHA-256 `8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`。来源准备者与主控均实际查看265、266、300、308、309、313、323七页PNG，核对完整statblock及24项能力。Black Pudding分裂的跨页末句、Mimic跨页特性／动作、Otyugh右栏首段Tentacle Slam均完整保留，没有混入邻接生物。

只整理PDF排版断词、页脚和重复标题，保留MOD／SAVE表；没有输入官方Actor YAML或期望输出。四份输入分别是Hydra1158、Black Pudding1893、Shield Guardian1954，以及Mimic＋Otyugh2581个UTF-16字符。双生物文件不含特殊“Creature 1/2”标头；两个来源独立保存，精确oracle范围不发送给模型。

`sources/source-manifest.json`、`source-oracle.json`保存原文hash、页码、全部基础与能力核对点；`source-preparation-validation.json`是来源准备者读回；主控视觉确认和最终冻结以 `sources/frozen.json` 为准。后续没有改写冻结文本。

## 实际首次结果

| 样本 | 正式生成结果 | 逐来源核对结论 |
| --- | --- | --- |
| Hydra | 有完整Actor，analysis为ready_to_generate，generation为ready_for_gm_review，程序findings为空。 | HP184／AC15／CR8、全属性／SAVE、Perception+6／被动16、40尺行走游泳、暗视和六种状态免疫保持。五项能力完整；咬击+8／10尺／1d10+5穿刺有GM攻击与伤害操作。五头、单回合25伤害掉头、零头死亡、回合末长头、火伤例外、恢复20HP、额外借机反应和随当前头数多攻均保留。没有把动态头数强做成固定次数；复杂动态规则交GM。 |
| Black Pudding | 有完整Actor，程序findings为空。 | HP68／AC7／CR4、全属性／SAVE、20尺行走攀爬、四伤害免疫、七状态免疫保持。五项能力完整；Corrosive Form独立1d8酸伤；伪足+5／10尺／4d6+3酸伤。非魔法弹药／武器／护甲腐蚀、Mending解除、1分钟／2尺穿透、分裂的体型／10+HP／Bloodied或闪电挥砍触发、两个较小个体、原先攻和HP向下均分完整。没有误授Mending或自动创建子Actor。 |
| Shield Guardian | **没有生成Actor。** 原答、IR、分析和生成失败记录保留。 | 六项能力及基础内容保留，拳击+7／10尺／2d6+4钝击＋2d6力场、护符转移向上取整、储法条件／替换／原施法者参数、Protection的+5AC及期限均在IR。没有编造具体储存法术。Regeneration的治疗目标缺少契约必填special字段，程序拒绝转换，详见下文。 |
| Mimic | **未调用。** | 原文已冻结；不根据准备完成推断模型表现。 |
| Otyugh | **未调用。** | 原文已冻结；双生物发现及两次提取都未开始。 |

Hydra与Black Pudding已由主控及独立核对者对照原文、首答、IR、Markdown、Actor实际字段和全文。独立核对发现Black Pudding的Corrosive Form活动condition中触发短语出现重复（短条件与完整规则同时展示）；数据、伤害、适用对象及GM规则未丢失或重复执行，记录为非阻塞显示细节，本轮不修改。

本批没有实际创建Actor或施放／掷骰。以上是本地正式生成与来源对照，不是新的Foundry运行接受。生成候选仍须GM确认，也没有将程序结构绿色提升为任意来源准确率。

## Shield Guardian 的直接失败原因与停止判断

原回复的再生结构为：

```json
{"formula":"10","type":"healing","target":{"type":"self","count":1}}
```

每回合开始、至少1HP的条件同时保留在操作condition、能力activationCondition、完整描述和proof里。当前结果仅报告：

- `INVALID_STRUCTURE`，路径 `/creature/traits/1/sourceOperations/0/healing/target`；
- 正式转换 `FORGE_WORKFLOW_FAILED: InvalidSourceOperations`。

核对源码：

1. `packages/intake-ai/src/source-operation-contract.ts:10` 的当前提示结构明确要求 `target.special`，因此模型确实漏了契约字段，首答不能写成完全合规。
2. `packages/models/src/sourceOperationStructure.ts:87` 只要求该字段为string，空字符串也合法；缺省却失败。
3. `packages/parser/src/structuredAction.ts:98` 使用相同结构检查，抛出InvalidSourceOperations，整只未生成；没有删除一个已经存在的盾卫Actor。
4. `packages/generation/src/actor.ts:1207`附近的自疗范围主要由已给出的 `target.type=self` 决定。本例已有治疗量、对象和条件，因此这是“允许为空的附加表示缺省造成整只硬失败”的具体接收风险，不能只概括成没有可用生物内容。

主控据此采用方案的停止点，保留剩余3次额度。独立语义核对确认其余内容保持；代码审查确认上述空值／缺省差别及同时存在的模型契约违规。并非所有不合规模型输入都自动算程序缺陷，也没有证明所有生物都受影响。

没有编辑原答、补special、构造修正Actor或运行调整副本。因此本轮**没有证明补一个空字符串就足以修好，也没有确认通用修法**。该字段名义上承载来源限制，不能据本例把所有缺字段都静默补空；后续改法须保留实际限制与原始证据。下一步可评估接收规则并用本次冻结回复做零模型验证，当前尚未获得或执行产品修复任务。

## 请求、模型与本地工具

使用现有DeepSeek/deepseek-flash、明确Responses协议、stream=true、json_object、reasoning auto；提取提示版本 `monster-intake-extract-v49-vulnerability-notes`。每只最多一次；三次均HTTP200，但HTTP成功不等于Actor生成成功。

| 请求 | 实际HTTP | 服务报告tokens | 结果 |
| --- | ---: | ---: | --- |
| Hydra提取 | 1 | 9,156 | 有Actor |
| Black Pudding提取 | 1 | 13,343 | 有Actor |
| Shield Guardian提取 | 1 | 17,520 | 无Actor，结构拒绝 |
| 双生物发现、Mimic提取、Otyugh提取 | 0 | 0 | 按停止点未运行 |
| **合计** | **3／上限6** | **40,019** | 2候选、1无产物、2未测 |

40,019只是本批三个服务usage回执（输入12,804、输出27,215），不是项目总消耗或金额。models／探针／复核／纠错／重试／翻译／控制配置均0。凭据只在发送时读取到进程内，未写入请求正文、报告或世界。

辅助runner位于本工作树 `.local/forge-offline-five-20261027/runner.ts`。复用前批一次性本地请求方式，原答即时保留、每固定call-id以wx预留且不可重发，6次总上限，唯一明确httpClient可联网，全局隐式fetch禁止，精确POST endpoint/model及redirect:error。每步独立执行，完整候选保存后才核对。双生物检查要求原始返回恰2条且不交叠，再核完整分区；没有把先合并重复成员后的数量当成功。

工具自检初期曾把JSON回执用于流式协议，离线前置失败；按实际SSE终止事件修正后通过。独立审查发现原发现检查可能先合并重复候选，已在任何真实请求前改为先检查原数量和交叠。最终9项工具边界检查通过，真实网络0、未读凭据；保留失败及最终日志。这些检查只覆盖本次请求工具，不重跑既有业务矩阵，也不计作新模型样本。

## 证据与保留

证据根：`H:/CodexData/visualizations/2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-offline-five-20261027/`。

- `sources/`：完整原文、PDF页图、排版记录、oracle和父冻结收据。
- `results/single-hydra/`、`single-black-pudding/`、`single-shield-guardian/`：每例原答、response evidence、无认证头的请求正文、analysis／generation、summary；只有前两例有actor.json。
- `independent/hydra.json`、`black-pudding.json`、`shield-guardian.json`：独立来源及产物核对。
- `calls/`、`http-ledger.json`：先预留再发送的实际次数、HTTP状态及usage。
- `stop-decision.json`：停止依据、反证、未证明之处和三项未运行请求。
- `preservation-final.json`、`batch-summary.json`：最终身份／hash读回及清楚区分已完成、失败、未运行的本批汇总。

原产品／测试／手册／上一轮ZIP及其已通过结果保留。本次文档只记录新证据，不改变产品入口、支持版本、使用步骤或规则；不刷新手册，不构建或安装新包，不把本轮失败改成历史候选已全面可用。

来源归属：System Reference Document 5.2.1，Wizards of the Coast LLC，CC-BY-4.0；本地PDF原件及来源hash见冻结清单。
