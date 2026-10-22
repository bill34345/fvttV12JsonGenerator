# Forge 原定三来源真实 A/B 首轮结果

**首轮已完成，6/6 次方案运行，真实能力 HTTP 共 13 次，0 重试、0 repair。按冻结的共同验收，两边均为 0/3 整份通过。不能据此确定哪种方案更好，也不能把失败后提前停止当作提速。**

## 本次实际比较的版本与范围

A 为完整提交 `f637f77f28c086e34297513e5293f98b3835f2e9` 的现有 staged auto 流程；B 为上轮固定回复验收的分类 MD 模板和适配，两个 B 业务文件字节未变。实验工作树 `20261019-forge-ab-fixed-replies`。

三份既有来源为 Giant Boar、Mezzoloth Company layout-v2、Angel of Obsession，共 18 个完整父能力。公共基础仅复用八组事实，未把旧能力答案发给模型。Angel 的既有行号切分回复共用，来源、基础文件与切分回复均有冻结身份。没有新发现、切分、基础、翻译、复核或修复模型请求。顺序为 S1 A→B、S2 B→A、S3 A→B，全部串行。

模型配置均为 `deepseek-flash / openai-chat / low / temperature 0 / json_object`；单请求 600000ms、一次尝试。13 份实际回复的 `model` 都是 `deepseek-flash`，`finish_reason` 都为 `stop`，没有截断、限流或网络故障。API 没有返回更具体的权重版本，不能把文档映射当作服务端版本自证。

A 仍使用原公共 provider 与原 prompt，source/base 两阶段在 HTTP 端口回放，能力请求原样保留。B 使用既有分类入口，每类含全部完整能力与模板。两边共用当前来源组装、validator、renderer、workflow/parser/generation、Intake verifier 和 Actor verification。对照同时改变粒度、AI/程序职责和载体，不能单独归因于 MD 或批大小。

## 首次结果、请求、时间和费用

以下均为失败首次尝试的实际消耗，不是完成同等任务的成功耗时/费用。

| 来源 | A 首次停止位置 | B 首次停止位置 | HTTP A/B | 提取入口秒 A/B | 估算美元 A/B |
|---|---|---|---|---|---|
| S1 Giant Boar | Actor 校验：Relentless 休息恢复报错 | 同一出口，另有真实消费缺失 | 2 / 2 | 10.54 / 24.42 | 0.001264 / 0.004147 |
| S2 Company | Spindly Shred 引文 clause-boundary | Spindly Shred 使用不支持的中文协议键 | 3 / 1 | 20.25 / 42.16 | 0.002793 / 0.006013 |
| S3 Obsession | Spear 引文 clause-boundary | Radiant Ray 攻击类型绑定 | 4 / 1 | 10.14 / 17.49 | 0.001562 / 0.002750 |
| 合计 | 0/3 整份通过 | 0/3 整份通过 | **9 / 4** | **40.93 / 84.08** | **0.005620 / 0.012910** |

提取入口计时包含各自原有的只读来源/基础复验、模型等待和本地能力组装；共同原件准备、适配器开发与人工核对不计入。纯 HTTP 等待合计 A **39.99 秒**、B **83.61 秒**。只有 S1 到达后续正式生成/验收，另耗 A 0.076 秒、B 0.051 秒，其余为未到达。日志有逐请求、逐阶段的时间；这里没有以进程总运行时长充当模型时间。

原计划预计 24、硬上限 27 次；实际 13 次是首错停止造成的，不是优化得到的成功调用量。S2/S3 的 B 各只完成一个动作类别请求，后续类别没有补跑。

## 逐来源正确性核对

### S1：公共校验误报与 B 实际缺陷同时存在

两边均已生成 IR/MD/Actor，并通过 Intake verifier。Tusk 的 +5、触及5尺、2d6+3挥砍，以及 Charge 的20尺直线/同回合命中条件、额外2d6、DC13力量、倒地后果均进入候选。完整原文和 GM 条件保留，未增加自动触发器。

共同 Actor 校验器扫描 YAML 时，把 `名称: Relentless` 和 `nativeRuleText: Relentless` 当作能力名，而实际 Item 名为 `Relentless (Recharges after a Short or Long Rest)`。这些错误匹配找不到 Item，产生虚假的次数和恢复引文错误。已按原校验代码中的同一正则与实际 Item 名逐项读回，见本地 [休息规则检查证据](../../.local/forge-ab-first-pass-20261019/source-review-rest-checker.json)。本轮不修改检查器，不改写首次失败结果。

- **A 的实际 Relentless**：max=1、`sr/recoverAll`、Activity 消费1均存在，≤10伤害、将降至0改为1和休息限制原文保留。就这项次数/恢复而言，不能把误报说成 A 没抽对。
- **B 的实际 Relentless**：max=1、`sr/recoverAll`存在，但模型选了 `gm-manual`，最终 Activity 没有消费目标。因此除了共同假名误报，还存在真实的可执行一次消费缺失。A 的 auto 路径保住了已有的程序证明结构，B 没有得到同样的执行结果。
- **没有据此提升 A 为整份成功**：其 Tusk 仍是 weapon、Activity `includeBase=true`、伤害在 parts 中而 Item 无 `system.damage`；这属于原 A 基础伤害相关风险边界，本轮没有 Foundry 实机核对。B 的 Tusk 是 SourceOperation feat、`includeBase=false`。两边都保持原共同验收的失败标签。

### S2：A 的证据载体与 B 的协议字段均未通过

A 通过两项 Traits，并由程序保留 Multiattack；随后 Spindly Shred 的首条攻击引文被当前完整子句绑定器拒绝。原始回复另把半伤写成 `formula: "half"` 的独立替换伤害，这不能直接成为现有数字骰式；程序尚未走到它的后续检查。本轮没有修引文、替换公式或重提。

B 一次返回了全部三个动作及原文，但将明确要求的 `sourceOperations` 写成 `源操作`，并把内部 `attack/proof/...` 等键也翻译了。当前适配器不支持这些键，故在 Spindly Shred 停止。不能把这说成已经通过 MD 协议后才发现数值不对；它首先是提示/载体遵循失败。Volley 的伤害、DC、范围可在原始回复中看到，但没有走到共同验收，不能记作成功。Traits 与 Bonus Actions 均未请求。

### S3：A 引文边界与 B 无来源支持的类型推断

A 通过 Magic Resistance、Multiattack 和 Bite，在 Spear 停止：`proof.attack` 同时含“矛Spear。”标签和攻击子句，当前 binder 报 clause-boundary。+8、触及10尺、2d8+5这些数值本身保留，不能笼统称为数字抽错。后四个能力未到达。

B 的动作批次包含五个完整父能力；前三个通过能力层，在 Radiant Ray 停止。模型填写 `attack.type=rsak`（远程法术攻击），原文只写“远程攻击检定”，当前来源绑定不接受这项推断；+7、60尺、3d6+4仍正确保留。施法行也已返回感知和原文引文，但发生在首错之后，尚未走到法术组验收。Traits、Bonus Actions、Reactions 未请求。

## 18 个能力的完整性边界

| 能力阶段状态 | A | B |
|---|---:|---:|
| 已通过能力来源层 | 9 | 7 |
| 位于首次拒绝点 | 2 | 2 |
| 同批回复已收到、但还没走到验证 | 0 | 2 |
| 未到达处理 | 7 | 7 |
| 合计 | 18 | 18 |

**“通过能力来源层”不是整份正确或最终可用**，例如 B 的 Relentless 后续仍丢消费。A 的处理状态来自实际 stage trace；B 的前缀状态由冻结回复顺序和首个异常位置对照既有串行适配控制流得出，证据层级在[逐能力表](../../.local/forge-ab-first-pass-20261019/per-ability-review.json)中说明。没有把程序直接处理的 Tusk/Multiattack当作未到达，也没有把同批收到但未验证的行当作正确。

## 用量与费用解释

| 实际用量 | A | B |
|---|---:|---:|
| 输入 token | 28,298 | 15,331 |
| 其中缓存命中 | 20,736 | 4,864 |
| 输出 token（含推理计数） | 7,372 | 18,875 |
| 其中推理 token | 6,454 | 16,455 |
| 总 token | 35,670 | 34,206 |

B 在本次失败尝试中请求较少，总 token略少，但输出计费 token 更多、输入缓存命中也更少；不能从请求数直接推断费用，或把差异全部归因于 MD 正文长度。思考 token 是服务端统计，只保存计数，没有保存推理正文。

所有请求在 2026-10-19 14:49–14:51 UTC，均处于 off-peak。按[当日 DeepSeek 官方报价](https://api-docs.deepseek.com/quick_start/pricing/)及实际 cache-hit/cache-miss/output用量，估算合计 **$0.01852935**。A $0.005619708，B $0.012909642。报价为每百万输入命中 $0.003、未命中 $0.15、输出 $0.6。**这是公开价估算，不是账户实扣账单；实际实扣 UNKNOWN。** 前后缓存状态不相同，本次不是冷缓存控制试验。

## 保留与未做事项

109 份首轮文件在分析前冻结，包括每笔安全请求正文、完整业务回复、用量、时间、错误及可得的 IR/MD/Actor；第一份回复、失败标签和证据均未覆盖。推理正文、凭据和请求头不保存。原始业务材料仅在 ignored 的本次私有 `.local` 目录；提交候选中只有运行器、边界测试与摘要。

模型 HTTP=13，source/base/review/repair/translation新模型请求=0，重试=0，候选业务源码变化=0。原工作树 HEAD、89个未提交路径及字节指纹在运行前后相同。没有安装、导入、世界操作、commit、合并、push，未修 A 或 B。

运行器的费用/脱敏/首错保存/重复与预算门禁4项固定测试通过；类型检查仍只有 A 既有21条诊断，运行器没有新增诊断。上轮28项固定接线和62项相关回归的有效证据保留，本轮未因摘要整理再跑一遍。当前不是全仓 CI 通过，也不是 Foundry 实机验收。

## 当前判断

本轮说明：**B 确实减少了实际请求，但当前 B 还不能作为可用的替代流程；A 也没有在冻结的共同出口提供三份完整通过结果。** 失败包含公共校验误报、A的证据协议边界，以及B的字段/执行载体与类型推断，不能用一个“AI准确率”概括。

没有同源双侧成功样本，不能给出完成任务的速度/费用胜负。这是三个已知开发来源、每侧各一次，未换默认模式，也没有为了得到结论追加第二轮。后续若继续，应分别决定公共校验、A证据载体、B协议约束的处理范围，再单独授权验证；本轮到此为止。

机器摘要见[结果 JSON](2026-10-19-forge-real-ab-first-pass.json)，私有全量索引见[最终收据](../../.local/forge-ab-first-pass-20261019/final-receipt.json)，执行边界见[首轮计划](../plans/2026-10-19-forge-real-ab-first-pass.md)。
