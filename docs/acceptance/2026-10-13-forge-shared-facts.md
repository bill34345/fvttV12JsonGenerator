# Forge 共同事实与跨 PDF 验收记录

日期：2026-10-13（Asia/Shanghai）。依据：[已批准计划](../plans/2026-10-13-forge-shared-facts-and-cross-pdf.md)。

## 当前结论

**实施与受影响离线检查完成；整个计划尚未完成。六例全新生成、真实中文核对、原生导入、刷新及清理均未执行。**

本轮把已登记、能够完整识别的规则单元，改为从 Actor 实际使用的归一化事实生成固定中文。来源与结构 IR、事实与 Actor、呈现计划与批准身份分别有门禁。未知限定仍完整保留，明确交给 GM 审核，不能宣称已经由固定模板证明正确。

当前阻断是三份新 PDF 尚无原始字节和 SHA-256。用户已批准“先实施，冻结验收前必须补齐哈希”；该例外只调整实施顺序，没有授权换样本、先跑部分批次或略过冻结。

本报告中的 PASS 是对应离线检查的结论，不是任意 PDF 可用保证，也不是六例真实验收通过。

| 层级 | 当前状态 | 证据与限制 |
|---|---|---|
| 共同事实、固定中文、剩余文本、审批绑定 | VERIFIED：离线 | 来源反例、生成与保存读回、测试批准、再生成；不包含真实 GM 批准 |
| 原有历史错误与兼容性回归 | VERIFIED：离线 | 下述安全入口均通过；Gazer 两份未保存的历史配置不作精确复现声明 |
| Icon 模糊、类别、继承与 includeBase | VERIFIED：离线回归 | 原有行为保留；本轮未核对任何新生成候选的实际原生图标 |
| 三份新 PDF 原件封存 | BLOCKED | 公开附件身份固定；原始文件、文件哈希和首个怪物身份缺失 |
| 六样本版本冻结 | NOT_EXECUTED | 只读预检正确阻断；没有 batch-freeze.json |
| 六次全新生成及原生验收 | NOT_EXECUTED | 没有 attempts 目录；实际模型调用 0，导入 0，刷新 0 |
| 发布 | NOT_EXECUTED | 没有提交、合并、推送、安装或部署 |

## 实际改动

### 同一事实用于 Actor 与中文

- 复用 `CanonicalMonster → StructuredActionData/ActionData`。生成层捕获真正交给 Actor Item/Activity 的归一化结果，保留与来源结构事实的关系。
- 新增内部 `RulePresentationPlan`：稳定逻辑路径、事实引用、固定中文块、连续剩余文本槽、未覆盖机制说明，以及事实、模板、来源和 Actor 机械摘要。
- 对完整匹配的已知规则单元本地生成中文：攻击与伤害、普通豁免伤害、豁免状态与期限、目标自选 INT/WIS 和再次豁免、推离、重甲条件减半、食物留存等。不是按怪物名称或特性名称添加分支。
- 条件、追加和替代伤害关系保留，不能执行的分支明确标为 GM 辅助。摘要只表达已消费的事实，不把摘要误当作已覆盖全部原文。
- 不能完整证明的规则保留完整来源和待核对信息，固定摘要与模型处理的正文有明确边界。未登记条件和状态不凭名称强行归为固定规则。

### 本地化、完整预览与批准

- Forge v14 战斗包准备入口显式捕获计划，采用 `zh-CN-facts-v1`；固定块不发给模型重新翻译，模型只处理名称、叙事和剩余正文。
- 包级说明与 GM 手工操作说明同样复用完整固定块。其余连续正文整体保留，防止按换行拆开后漏掉食物条件或公式关系。
- GM 辅助配置仍先经过原有 selection、来源引文、参数、carrier 和步骤门禁；通过后，显示步骤由编译器使用同一来源特性的完整说明组装。原始模型 selection 保留作证据。
- 实际模板显示完整来源、完整合成中文、只读固定规则块和剩余文本编辑框；缺少计划、过期上下文或请求身份不匹配均不能批准。
- 加载与批准重新生成计划，`sourceHash/requestHash` 绑定事实和模板版本。可信计划还绑定规范化后的 Actor 机械摘要；沿用旧计划篡改 DC 或 Effect 关联也会拒绝。
- 计划通过内部私有上下文传递，没有增加 Forge 公开请求、响应或战斗包字段，既有可选 `iconReview` 保留。普通单 Actor、CLI/Web 默认入口与 v12 不隐式启用该新策略。

## 本轮发现并关闭的真实缺口

独立反证发现，仅对照来源与描述仍不充分：保留原始来源、description 和 claims，只改实际结构 IR，错误依然可能进入 Actor。最初 9 个负例全部误放行。补上来源事实到实际 IR 字段的核验后，这 9 个负例均在来源门禁拒绝，错误码为 `SOURCE_STRUCTURED_RULE_MISMATCH`。

| 反例 | 原来的漏检 | 当前要求 |
|---|---|---|
| Mezzoloth Toxic 的 DC | 14 改为 15 仍 ready | 拒绝 |
| Toxic 的豁免属性 | CON 改为 DEX 仍 ready | 拒绝 |
| Toxic 的期限 | 下一回合结束改为开始仍 ready | 拒绝 |
| Spindletip 的逃脱 DC | 15 改为 16 仍 ready | 拒绝 |
| Gazer 的状态关系 | 同时状态被标为分阶段仍 ready | 拒绝 |
| Sea Hag 的激活条件 | Bloodied 改为 not Bloodied 仍 ready | 拒绝 |
| Mezzoloth Weaverot 追加伤害 | 删除 1d10 Necrotic 仍 ready | 拒绝 |
| Weaverot 追加伤害 | 重复一次仍 ready | 拒绝 |
| Weaverot 伤害类型 | Necrotic 改为 Cold 仍 ready | 拒绝 |

前态证据保留于 `.local/forge-facts-20261013/history-field-probe-1.log` 与 `history-damage-probe-1.log`；后态纳入 `test:forge-facts`。全部为本地反证，无网络模型调用。

同时关闭了两处证据连接缺口：父 claim 只有标题时，仍需读取该特性自身的完整 evidence；父子引文重叠按来源坐标合并，不能重复计入伤害。Faldric 的反应从子 claim 引用已有 Longbow，保留其合法引用，不要求反应正文重复抄写整段武器说明。

## 历史整链覆盖与证据边界

| 回归组 | 已验证内容 |
|---|---|
| Sea Hag Auntie | 旧、新 INT/WIS 与缺属性形态；选择者、DC、属性、缺文和冲突反例；目标自选完整保留 |
| 食物留存 | 留住／不吐出及海水必要条件；“咽下”、遗漏、反转及跨行绕过均拒绝 |
| Gazer | 25 (1d10 × 5) 完整公式、乘号等价、数字／顺序／运算符反例；推离距离和 STR/DC；仍明确 GM 操作 |
| Mezzoloth | 历史 HTML 与纯文本、原生状态、Abyssal、Shred 完整减半条件；结构字段反证 |
| Faldric | 伤害从来源事实贯穿 Actor 与中文；只作离线对照，不计为 PDF 样本 |
| Icon | 模糊、类别、继承选择；includeBase 真／假；不混入兄弟 Activity 或未使用的 versatile 伤害 |
| 身份与兼容 | 保存读回、过期批准、旧／新策略分离、Actor 机械篡改、v12、普通公开响应不扩字段 |

历史原件保持不变。新链所需测试翻译有单独测试标记，测试 GM 身份不代表人类批准。Gazer 两份当时未保存的配置回复仍为 **UNKNOWN**，本轮没有把重新构造的输入称为原始配置精确复现。

## 最终检查收据

执行使用仓库锁定 Bun 1.3.14。下表引用最终有效结果；较早的失败日志保留，未删除或改写。不同套件存在覆盖重叠，不把数量相加作为独立测试总数。

| 检查 | 结果 | 收据（相对工作树 `.local/forge-facts-20261013/`） |
|---|---|---|
| `bun run test:forge-facts` | 41 pass / 0 fail，1,425 assertions | `integration-facts-closed.log` |
| `bun run test:forge-encounter` | 541 / 0，2,402 assertions | `integration-encounter-closed.log` |
| `bun run test:fvtt-json-forge` | 574 / 0，5,962 assertions | `integration-forge-closed.log` |
| `bun run test:reviewed-localization` | 44 / 0，329 assertions | `integration-reviewed-localization-final.log` |
| `bun run test:generation` | 287 / 0，1,308 assertions | `integration-generation-final.log` |
| `bun run typecheck:packages` | exit 0 | `core-types-faldric-1.log` |
| `bun run typecheck:foundry-modules` | exit 0 | `integration-types-foundry.log` |
| `bun run architecture:verify` | 依赖／循环检查通过；1,338 modules，3,230 dependencies | `integration-architecture.log` |
| `bun run audit:anti-overfit` | 52 sources 通过 | `integration-anti-overfit-closed.log` |
| `bun run references verify dnd5e-5.3.3` | 锁定 5.3.3 来源通过 | `integration-references.log` |
| `bun run build:fvtt-json-forge` | 16 文件构建成功 | `integration-build.log` |
| `bun run smoke:actor:offline` | 6 source items，0 verifier warnings，0 network calls | `integration-source-smoke.log` |
| 手册人工核对、生成与 `handbook:check` | 33 工具条目一致 | `docs/handbook/reviewed.json`、最终检查收据 |
| `git diff --check`、基线检查 | exit 0；109 个基线路径均保留；8 个既有 fixture 原字节未变 | 最终检查收据 |

来源 smoke 使用既有 White Tusk Shaman／modded-v14 配置，只证明该正式来源链离线检查；不能代替本批六例 core 配置或真实 Foundry 验收。未额外执行全仓 CI、coverage 或不受本轮影响的跨模块矩阵。

## 构建身份与工作区保护

继续既有工作树：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261006-111625-bettermonsters-eye-deep-sample`。

- 工作树分支：`codex/20261006-111625-bettermonsters-eye-deep-sample`。
- 工作树 HEAD 保持 `f79c25fbac747a7e08f98c48779f052c3db68599`；主区 HEAD 保持 `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`。
- 主区状态仍只有既有 `?? .omo/`。没有 reset、stash、删除原件或清理既有 dirty 文件。
- 构建 JS：`d4c2a5bf741efd528916e3d3936e7cdfa8fb9349a92c2dc8426b14c57d4c055b`，6,471,844 bytes。
- 构建 ZIP：`06520a2188a9286de0600b272bc694bf6a05d518e793e7a80299e588f6898512`，10,711,284 bytes。

以上均为原始字节 SHA-256。它们是当前候选的检查点身份，**不是已经冻结的六例验收版本，也没有安装到 Mirror**。

## 六例固定清单与下载阻断

| 顺序 | 来源 | 原件状态 | 本轮首次生成／中文／导入／刷新 |
|---|---|---|---|
| 1 | Sea Hags.pdf — Sea Hag Auntie | PDF 与 4,314 字符来源已有哈希 | 全部 NOT_EXECUTED |
| 2 | Beholders.pdf — Gazer | PDF 与 1,732 字符来源已有哈希 | 全部 NOT_EXECUTED |
| 3 | Mezzoloths.pdf — Mezzoloth Sellblade | PDF 与 2,085 字符来源已有哈希 | 全部 NOT_EXECUTED |
| 4 | 2026-10-06 [Charon.pdf](https://www.patreon.com/file?h=171613449&m=759199072) | URL 固定；文件和首个完整怪物未知 | 全部 NOT_EXECUTED |
| 5 | 2026-09-29 [Baernaloths.pdf](https://www.patreon.com/file?h=170928332&m=754585468) | URL 固定；文件和首个完整怪物未知 | 全部 NOT_EXECUTED |
| 6 | 2026-09-22 [- Ultroloths.pdf](https://www.patreon.com/file?h=170268968&m=750109190) | URL 固定；文件和首个完整怪物未知 | 全部 NOT_EXECUTED |

三份新样本按公开发布日期锁定，正文没有用于开发，也没有因难度换样本。来源身份和排除理由见 holdout `metadata/samples.json`。

本机普通下载先遇到 Patreon/CDN TLS 失败。独立 Chrome 执行聊天随后从固定 Charon.pdf 公开附件发起一次正常下载，页面跳到 `c10.patreonusercontent.com` 后显示 **ERR_BLOCKED_BY_CLIENT**。它证明该请求被客户端阻断，不能据此断言究竟是哪个组件造成。另两份在共享 CDN 阻断后没有继续尝试，不把它们报告为独立下载失败。

Chrome 执行器保留了错误、URL、前后标签页清单与清理收据，创建 1 个自有标签并关闭 1 个，保留原有标签。没有改网络／TLS 设置，没有切换通道绕过，没有读取 PDF 正文或操作 Foundry。

- 执行聊天：`01a12eb1-52b5-7bb1-afae-22c3f69e700c`；回传当前聊天。
- 浏览器收据：`H:\CodexData\visualizations\2026\10\12\01a12e90-4de0-75c1-92d5-714811781a77\forge-facts-holdout-20261013\metadata\browser-acquisition-receipt.json`。
- 收据 SHA-256：`9e63a86cc968ce749d03a22a98410d42058451cb96b87d13ce7598174edd505f`。
- sealed 目录为空；3 份 `pdfSha256/pdfBytes` 均为 null。
- `freeze-batch.ts --check` 返回预期 exit 2，逐项报告 3 份 PDF 原字节哈希缺失；`modelCalls: 0`、`credentialRead: false`。

## 继续执行所需条件

1. 取得上述三个固定附件的原始 PDF 文件。可恢复正常公开附件下载，或由用户提供同一附件原件；不需要更换样本。
2. 先按原始字节补齐 PDF SHA-256，随后在开发结束的前提下提取各自首个完整怪物，记录页码、完整原文及来源字节哈希，不据正文修改候选代码。
3. 核验已通过检查仍适用，冻结源码、模板、构建、图标目录／覆盖、模型配置和六份来源。核对 Mirror 14.368 / dnd5e 5.3.3 身份与清理基线。
4. 使用已准备的单次运行器依序提交，每例一次。单例失败封存、不修、不重试，继续下一预选样本；共享身份、冻结或清理条件失效则停止整批。
5. 通过来源和中文核对的候选，完成独立 Chrome 正常导入、刷新、规则与全部图标回读、精确清理。批次结束报告实际通过数。

批次入口说明：`.local/forge-facts-20261013/BATCH_RUNNER.md`。当前真实提交次数为 0；内置模型修复次数、真实阶段耗时和原生收据尚无数据，不能以测试耗时替代。

付费 AI 审核持续关闭。六例全部完成前，不能将该候选标为“在本批样本与支持范围内通过”。
