# Forge 跨阶段契约修复与模糊 Icon：本轮执行报告

日期：2026-10-13。结论：**PARTIAL，整体验收未通过，已按“失败即停”停止。**

本轮已实施精简计划，离线连接和整合检查通过，冻结后只做了一次真实全新模型生成。该次生成未形成通过本地校验的中文候选，故没有 GM 批准、导入、刷新或测试对象写入；没有付费 AI 审核、提交、合并或推送。

## 范围与身份

- 继续工作树：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261006-111625-bettermonsters-eye-deep-sample`。
- 分支：`codex/20261006-111625-bettermonsters-eye-deep-sample`；HEAD 保持 `f79c25fbac747a7e08f98c48779f052c3db68599`。
- 96 个既有 dirty/untracked 文件的执行前状态与 SHA 保存在 `.local/forge-contract-repair-20261013/baseline.json`。保留所有既有改动，未 reset/stash/清理其他工作树。
- main/master 保持 `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`，仍只有既有 `.omo/` 未跟踪目录。
- 原文仍为同一份 Mezzoloth Sellblade，2,085 UTF-16 字符，SHA-256 `2c93b830d3814fdc9ddd6bb255699a9bd28edbcf118bda1900fa6fa992bf0562`。
- 构建 SHA-256：`949fcdd6ced3e9b8a8bfa941c10540f597af210bfc221bd1fbef3074cdc5f99d`。冻结 260 个输入文件，真实生成期间变化数为 0。

## 已实施的改动

1. v14 程序生成的原生状态标题按稳定状态 ID 和现有原生目录决定，本地化不再请求模型重新决定这些内置标题；自定义名称和 v12 行为保持。
2. 按本地锁定 dnd5e 5.3.3 语言目录映射已知英文名、大小写及已有中文别名，包括 Abyssal；未知短语字面保留。
3. 完整公式保护和保存读回校验共用公式扫描，覆盖括号、嵌套、有符号操作数与运算顺序；允许 x/×/* 和空白等价。补范围/伤害数字用途及重甲正反条件检查，既有食物留存和 INT/WIS 缺属性/缺文/冲突回归继续通过。
4. Forge v14 浏览器会话启用内部模糊选图；内容主题不足时用功能类别图。Activity 按 includeBase 仅读实际基础伤害，不混入 versatile 或兄弟活动。明确覆盖优先，素材不可用失败。CLI/Web 默认模式和 Node 保守选择入口保持。
5. 唯一新增 Forge 响应字段是可选 `iconReview`。现有 v1 报告类型归中立 contracts，旧 workflow 入口 re-export；Actor/Item 响应、最终准备候选和结果展示保留理由、备选与置信度，旧响应仍可读。没有新增请求字段、公开 matchPolicy、报告 v2 或最终 Actor/战斗包字段。
6. README、来源验证说明及手册已同步。

## 离线与整合证据

| 检查 | 结果 | 证据 |
|---|---|---|
| Forge、图标、协议、语义、旧/新 INT/WIS、缺文/冲突等受影响回归 | 705 pass / 0 fail，6707 断言 | `integration-forge-final.log` |
| Encounter 连接回归 | 541 pass / 0 fail，2401 断言 | `integration-encounter.log` |
| 包、全仓、应用、Foundry 模块类型 | PASS；最终全仓类型在最后修正后通过 | `typecheck-*.log` |
| 依赖 | PASS，1325 模块、3167 依赖无违规 | `architecture-verify.log` |
| 局部 anti-overfit | PASS，37 份源码 | `audit-anti-overfit.log` |
| 正式离线 fixture 生成及 verify:actor | PASS，warnings / sourceIntegrityErrors 均空 | `offline-generation.log` / `offline-source-verification.log` |
| Forge 构建 | PASS | `build.log` |
| 本地选图素材 | 39 条存在且记录 SHA | `icon-asset-preflight.json` |
| 手册 | PASS，33 项工具，覆盖/入口/指纹/HTML 一致 | `handbook-check.log` |

独立只读审查发现的括号/负数公式、重甲未知否定、范围与移动数字交换、includeBase/versatile 四项在离线反例上闭合。但这不证明真实全链通过；下面的新失败推翻了“重甲生产者→消费者已全部闭合”的判断。

整合首轮有 3 项旧测试预期失败：Node 保守策略与 Forge 模糊策略的图像 hash 差异，以及继承图报告分类纠正。正式 Node 对比现改为同一 browser icon adapter，全值/hash 比较仍保留；CLI 仍保留实际默认图并核对准确分类。一次筛选复验另遇测试全局 document 只读初始化错误，保留日志后使用原安全入口不筛选重跑，最终 705/705 通过，没有修改测试框架或放宽产品门禁。

## 唯一一次全新生成

不读取旧 IR、译文、自动化配置或人工修正；outer maxAttempts=1。付费审核方法设拒绝守卫，触发数也为 0。

| 阶段 | 实际 HTTP 数 | 耗时 |
|---|---:|---:|
| 初次抽取 | 1 | 55.359 秒 |
| 流程内置 IR 修复 | 1 | 92.106 秒 |
| 中文标题批次 | 1 | 26.171 秒 |
| 中文正文批次 | 1 | 61.930 秒 |
| 总流程 | **4** | **235.869 秒** |

发现请求 0，自动化配置请求/修正 0，付费 AI 审核 0；没有第二次提交、续译或模型重试。

初次抽取因短引文 `Actions` 不能唯一定位而出现越界证据和未覆盖来源。内置修复后来源检查通过，原语言候选 accepted，1 个 Actor、0 个 Macro。其状态标题及语言键通过实际链，Abyssal/Infernal 投影为 `abyssal`/`infernal`。

25 个中文字段均已返回，单字段本地重放 23 个通过；Shred 的 HTML 正文和纯文本正文两处被同一重甲边界误拦。流程报告保留 `ready_for_gm_review` 是原语言候选状态，**不能将其解释成中文生成成功**；`hasChineseDraft=false`，整体为 FAIL。

生成入口前另有一次取证脚本前置失败：脚本把冻结清单里的 3 个 ZIP/PDF 当 UTF-8 文本计算 hash。此时模型请求 0、未读取凭据、产品和构建未变。已保留 `fresh-attempt-1/preflight-failure.json` 与差异诊断，只将本任务取证脚本改为字节 hash 后才进行上述唯一首次模型提交，冻结清单未改。

## 实际停止原因：保护器与校验器仍有边界冲突

失败字段：`text-afe39999667ac8a24ee2e33c`；另一处同形纯文本字段 `text-d5b68f68d43c16f53c727533`。

原文关键条件：`or half as much if it is wearing Heavy Armor`。

实际返回的句尾：

> ……受到 9（2d8）挥砍伤害，或减半 如果该生物穿着重甲。

原文和该译文都表达“穿着重甲时减半”，**没有肯定/否定翻转**。语序生硬不等于本次错误码所指的条件反转。

证据链：

1. `protectCriticalRulePhrases` 只固定 `if it is wearing Heavy Armor`，还原为“如果该生物穿着重甲”；前面的 `or half as much` 交给模型。
2. 实际译文包含这一固定片段，前接“或减半 ”。
3. `validateLocalizationDraft` 取从逗号后到“重甲”的整个片段，得到“或减半 如果该生物穿着重甲”。
4. 条件正则要求从条件词/主语开始，该前缀不匹配，于是报“译文改变重甲条件的肯定或否定”。
5. 保存输入的本地最小重放复现同一错误；独立只读审查也直接读取同一 request/draft 确认误拦。

这是本轮新增的**条件片段保护输出与完整子句验证未闭合**。离线正反例只测了以“如果…”开头的条件，没有覆盖实际保护/翻译/还原后保留前置结果短语的全句。不能把它归咎于模型把重甲条件翻反，也不能用 705 项绿色测试宣布全链已修好。

本轮停点之后没有修改产品或候选。以后若继续，最小修复应保留这两份实际失败输入，验证“结果短语＋条件”的完整既有规则片段在保护、还原、保存读回与批准之间一致；正反、未知否定、缺文和冲突仍须阻断。该修复及再次全新生成 **NOT_EXECUTED**，等待后续指令。

## Icon 与原生验收边界

该次原语言正式候选有 7 个 Item、7 个 Activity，14/14 已选目录内非默认路径。现有报告：exact=1、semantic=13、type-default=0；置信度 exact=1、high=5、fallback=8。低把握类别/继承选择保留理由，未伪装成精确匹配。

- Conniving Resistance：防御护盾。
- Multiattack / Shred：攻击类别图。
- Spindletip Claws：爪子。
- Weaverot Barb：飞行倒刺/投射物。
- Toxic Emission：毒素。
- Divergent Dark：黑暗球体。

这仅证明离线选中路径与报告，**没有证明原生视觉验收**。中文必要阶段失败后未派发 Chrome，未安装到 Mirror，未导入、刷新、执行控制器或战斗，也没有需要清理的本次世界对象。

## 现场与交接

全部本轮证据根：`.local/forge-contract-repair-20261013/`。

- `freeze.json`：候选、源码及检查绑定。
- `fresh-generation-1/summary.json`、`requests.json`、`stages.json`：首次实际结果、请求数、耗时与修复次数。
- `fresh-generation-1/fresh-extracted-ir.json`、`first-analysis.json`：初次抽取和失败来源检查。
- `fresh-generation-1/latest-report.json`、`result.json`：实际完整 request/draft、失败字段、原语言候选；不得当中文批准包导入。
- `failure-reproduction.json`、`field-validation.json`、`failure-reproduction.log`：真实输入的最小重放与全部25字段的独立本地校验结果。

状态：实施/离线验证 PARTIAL；全新中文生成 FAIL；原生导入刷新 NOT_EXECUTED；Git 发布 NOT_EXECUTED。付费 AI 审核保持关闭；没有提交、合并或推送。
