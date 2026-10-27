# Forge 生物输入契约统一整改

日期：2026-10-27。状态：本轮实现、冻结回复、两动作格式、CLI／Forge离线一致性和正式草稿验证完成；未执行新的模型请求或Foundry运行验收。

工作树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD仍为 `a6591c0`。已有未提交修改保留，本轮没有暂存、提交、合并或推送。最新进度见[唯一当前状态](../plans/2026-10-20-forge-ab-current-state.md)。

用户原话：“行，按这个方案统一整改，不要只给盾卫补字段。沿用当前 worktree，审完生物输入契约和两种动作格式，统一可选字段、空值和程序自有记录的处理，保留必要的机械检查。用冻结回复验证盾卫、已有产物和正式草稿，并核对 CLI／Forge 一致性；不调用新模型、不启用 AI 复核，先不提交、合并或推送。”

## 审查范围与统一原则

已审当前Monster完整IR、SourceOperation与旧平铺动作的16个字段族。各族改变、保持及依据在本轮 `worker-field-policy.json`，覆盖：根版本／来源／纯数据边界、根记录、身份、基础属性、空生物容器、防御／传记、能力正文及载体、SourceOperation机械字段、两载体治疗目标、程序操作记录／proof、可选空列表、施法组、法术授予与补充记录、传奇数据、共享资源／候选状态、旧解析器及相关消费者。

| 字段用途 | 本轮处理 | 明确保留的限制 |
| --- | --- | --- |
| 可选附注／补充文字 | Monster接收与结构化动作parser共用 `packages/models/src/sourceInput.ts`；无内容的可选文字按同一策略处理。 | 有内容文字不trim或改写；完整name／description和有实际意义的条件仍保留。 |
| 治疗目标附注 | 两动作格式都允许special缺省；仅缺省时形成空字符串。 | 目标类型、count、公式和healing/temphp类型仍检查；已有合法字符串，包括空白，原字节保持；不猜目标。旧平铺格式原有“整个target省略”的兼容保持，不扩大SourceOperation的目标缺省。 |
| 空生物容器 | saves、skills、防御及其四列表、感官、语言及values、五类能力容器可由程序补齐，并记录实际补齐路径。 | 只建立容器，不补分数、距离、技能值、防御或语言；“未提供”不等于已确认原文没有规则。null、错误类型保留并报错。mythicActions仍为可选。 |
| 可选空列表 | 按上下文处理无效果的空状态列表、额外伤害类型空列表、空proof.damage及空补充记录。 | sourceOperations:[]仍是没有任何操作的无效原生载体；非空错误类型、条件／替代伤害并入普通Attack/Save、错误引用长度与实际冲突仍拒绝，不删能力转Utility。 |
| 程序所有信息 | 绑定来源身份／坐标；分配缺省操作和施法技术ID；缺省proof为空对象；用已明确提供的完整父正文绑定sourceText及程序载体。 | 不从正文猜机械数据，不制造引句；明确ID、实际引用、schemaVersion、来源hash和授权／候选状态仍检查，不覆盖未知版本或伪造accepted。 |
| 施法组的两种表示 | 完整singleton对象在clone probe中应用与数组相同的ID和空记录规则，通过组内检查后才提交。 | {}、未知key、缺施法属性／实际授予组、错误类型等整体保持并继续报告；不补法术、次数、法术位或复用对象。 |
| 既有合法表示 | special的旧合法空白字符串、vulnerabilitiesCustom及biography原有合法空值保留。 | 不为了“统一格式”改写正式旧候选，从而触发finalSource／完整JSON／findings不一致；没有放松恢复hash比较。 |
| 真正机械与身份要求 | 保留核心数字、公式、攻击／豁免／伤害／治疗组合、资源／恢复／成员关系、范围和状态等检查。 | 不默认补save.outcome、治疗目标、次数、伤害类型；不把未知机械字段当无意义附注丢掉。 |

没有新建schema框架或AI入口。共用模型出口、Monster接收／草稿入口和parser消费同一规则；Item／Species独立provider／validator未接入Monster空容器整理。显式旧staged消费者仅适配special可选类型：没有实际附注就不从它匹配距离，未恢复旧SourceAudit作为默认检查。

提示词同步为 `monster-intake-extract-v50-input-field-policy`，不再要求模型填写程序所有的空占位及缺省技术ID。旧请求、模型首答、提示词身份和已保存草稿没有重标版本。本轮没有测量V50的新模型首答表现。

## 真实冻结回复与既有成果

### Shield Guardian

使用[原批次](2026-10-27-forge-offline-five-first-pass.md)未修改的 `raw-answer.txt`，真实provider接收函数只注入保存的响应，外部fetch禁止。没有手填special或手改最终JSON。

原首答→当前接收→分析→renderer→共用parser→正式Actor成功；analysis为ready_to_generate，generation为ready_for_gm_review，findings为空，六个Item完整。HP142／AC17／CR7、拳击+7／10尺／2d6+4钝击＋2d6力场、自疗10／自身／回合开始且至少1HP、Protection的+5AC与完整期限均正确。储法原文保留，没有虚构具体法术。原第三次真实请求的“无Actor”成绩仍保持，本轮是零模型的修后验证。

### 已正确产物与正式草稿

- Hydra、Black Pudding重走实际provider及正式生成，完整Actor JSON分别与原冻结产物严格相同。
- 已有Adult Brass Dragon完整产物、Unicorn九能力／九法术、Spirit Naga八法术及singleton表示继续通过相关正式链检查。
- 实际加载旧v1／v2 Adult Brass Dragon完整草稿；恢复后的完整记录与checksum保持，原文件不变。
- 新增旧合法空白附注反例，检查已有文字表示在整理及实际生成目标中不变；完整singleton缺ID／空记录与数组等价，非法singleton保持，悬空reuseOf不会被补造。

### CLI／Forge 一致性

将本轮重新生成的盾卫规范Markdown原样交给当前CLI，显式v14/core/icon off，CLI退出0并生成六个Item。与Forge Actor逐项比较：机械、正文、活动、资源、效果差异均为0。只有13处图标展示差异和2处生成时间差异：CLI明确icon off，Forge使用现有图标解析；没有因此忽略任何机械字段。

两条不同输入必须分开：

- 原始Monster IR JSON仍不是legacy CLI文件格式，报Unknown field schemaVersion，退出1无输出。这不是新增支持或本轮失败。
- 原失败阶段留下的旧规范Markdown仍携带历史candidateReview声明。整改后已不报InvalidSourceOperations，但CLI仍保留needs_review状态、退出2且不写正式文件；本轮没有删除历史问题来强行提升为accepted。

验证CLI／Forge一致性使用的是“原始冻结回复通过当前完整链重新生成的规范资料”，不是人工删掉旧Markdown的诊断。

## 检查与发现的修正

| 检查 | 最终结果与范围 |
| --- | --- |
| `bun run test:forge-input-field-policy` | 12 pass／0 fail／172断言，231项无关旧测试过滤。包含两载体、中文／已有双语、LF／CRLF、缺省等价、旧合法表示保持、程序记录、singleton正反例及盾卫真实冻结链。 |
| `bun run test:forge-structure-validation` | 118 pass／0 fail／314断言。 |
| `bun run test:forge-generation-preservation` | 65 pass／11 skip／0 fail／507断言，实际v1/v2草稿已加载并执行。11项未加载的其他历史fixture不统计通过。该组已包含current-input恢复，不另行重复该子组。 |
| packages与Forge类型 | 全部通过。最初staged消费者有3处string/undefined类型错误，作最小兼容修正后通过；没有据此重跑已接受业务。 |
| 架构／anti-overfit | 架构1553模块／4382依赖，无违规或循环；13个改动生产文件均覆盖局部anti-overfit，后续改动的3文件已窄复核。未把重复命令相加成独立覆盖数。 |
| 独立代码审查 | 初审两项兼容问题已收口；最终在本次范围内无剩余实质阻塞。 |
| 浏览器bundle | 构建到本轮独立证据目录并通过浏览器依赖安全及manifest检查；未安装。旧dist/release ZIP未覆盖。 |
| 手册 | 7条受影响说明人工核对，新增精准安全检查入口说明；生成及handbook:check通过，保持33项覆盖。 |

实际修正与测试期望变更分别记录：

1. 初版提前给非法singleton加空记录、改写原合法空白附注，两者都由独立检查发现，已修正代码并补反例。
2. proof.damage:[]旧测试要求拒绝，与本轮批准的无内容记录政策冲突；现单独验证其与缺省等价、不制造引句，非空坏quote／实际长度和引用冲突仍有反例。
3. 初次局部测试误把合法proof={}和非空附注文本当作非法，已修测试期望，没有据此收紧产品；旧V49字面版本断言随提示职责更新到V50。
4. 一次过宽的旧治疗wrapper选中了10条已经退出默认链的原文语义断言；失败日志保留，不把它们恢复为产品待办。之后只选本次实际受影响的旧Heal parser检查，没有修复或启用旧SourceAudit。

## 证据、保护与剩余范围

证据根：`H:/CodexData/visualizations/2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-contract-unification-20261027/`。

- `worker-field-policy.json`：16字段族政策及依据；`worker-implementation-receipt.json`：13生产文件、测试及安全入口的实际hash。
- `frozen-chain/`、`shield-regenerated.json`、`shield-replay-receipt.json`：冻结原件贯通及新Actor。
- `frozen-draft-restoration.json`：真实v1/v2草稿恢复不变。
- `cli-contract-check/`、`cli-contract-check-new/`：旧带诊断资料与当前新资料的实际CLI结果。
- 工作树 `.local/forge-contract-unification-20261027/independent-integration-final.json`、`cli-forge-diff.json`：独立汇总及全部15处非机械差异路径；有效文件保持原位，最终收据引用实际路径。
- `worker-policy-compatibility-final.log`、`worker-existing-structure-final.log`、`generation-preservation-final.log`、类型／架构／anti-overfit／手册日志：最终结果；初次失败日志另留。
- `preservation-final.json`、`final-receipt.json`：保护输入、原始首答、旧候选包与当前源码／文档／构建身份的最终读回。

新的浏览器脚本为 `bundle/index.js`，SHA-256 `fa9fa7723d9fcda8557fd688f75f01014857d1f8a6512cafe0e0bb18f26fd045`。它仅是验证构建，不是已安装或远端发布的版本。原 `dist/release/fvtt-json-forge-0.5.1.zip` 的SHA仍为 `b5f450378af72c13b19ba5e86d4c0436e48d9ad706f46f0b6ab13f8c12d5776f`，该旧包**不包含本轮统一整改**。

本轮新增模型服务HTTP、AI复核、纠错、Foundry及浏览器操作均为0。此前五只补测账本仍是3／6，Mimic／Otyugh及发现请求尚未执行；不会因离线修复完成自动恢复付费。正式安装／运行接受和V50真实新首答属于未执行层级，不把本轮离线结果推广为任意输入或全库覆盖。
