# Forge 怪异文本写法：外部取样与本地回归

日期：2026-10-18。结果：**调研和扩大测试已完成，发现新缺口，产品尚不能宣称支持任意表达方式。** 本轮没有修产品代码。

工作副本：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261006-111625-bettermonsters-eye-deep-sample`；HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。目标仍为 Foundry 14.364 / dnd5e 5.3.3 / core / icon off。

## 1. 原因：有些地方把“没查明白”放成了“没有问题”

目前两条整理路径对同一种文本的判断不一致。分阶段整理较严格，能拦住这批错误值，但也会拒绝部分清楚的表格、链接和 PDF 连字。普通整理能接纳其中一些格式，却会漏掉对应的错误数字。

还查到一个更直接的原因：普通校验借用了整份怪物的能力分段程序来寻找基础数据。末尾缺句号或能力标题跨行让能力分段失败时，基础数据检查会整体跳过。把准确来源中的 HP 30 填成 99，也可能走到正式 Actor 输出。

代码证据：

- `packages/intake-ai/src/validator.ts` 的 `validateSourceBaseFacts()` 先调用 `splitStagedMonsterSource()`，异常分支直接返回。对静态字段只上报错误码含 `CONFLICT` 的问题；看不懂格式的 `UNSUPPORTED_STATIC_FACT` 等不形成这层阻断。
- `packages/intake-ai/src/base-source-numbers.ts` 在普通路径的 `complete=false` 模式下允许无法识别的数值布局继续。英文全称/纵向 Markdown 三列表的分数与调整值，尚不能作为独立数值证据读取。
- `packages/intake-ai/src/staged-extraction.ts` 的 auto 模式已能使用受限 AI 行号分段。因此“只用纯规则分段失败”不等于正常 staged 路径失败。本轮使用了 auto，保留该补救环节。`MISSING_STAT_HEADER` 仍不触发该补救。
- 各层对 Unicode、链接显示文字和规则句边界的处理不完全一致。PDF `ﬂy` 在悬浮证据检查中被拒绝；原始 UTF-16 坐标仍需保留，不能直接重写来源再沿用旧坐标。

`.local/forge-weird-statblock-research-20261018/source-boundary-trace.json` 记录了对照：同一错误 HP 交给准确基础数据片段可被查出，能力分段失败的普通完整链却接受了它。

## 2. 证据：37 个用例，两条路径，故意填错再测

从 17 个公开原始来源取样，建立 37 个合成用例。其中包含两个清楚格式的控制，以及同一递进失败规则的短/长两种证据引用；37 不是独立缺陷数量，也不是 37 次真实 AI 成功抽取。使用两个不同生物的数据、分数和伤害作为底稿，避免仅适配一个怪物。

流程：固定的模拟 AI 回复 → provider/阶段整理 → **anchorIrEvidence** → validator → renderer → public workflow → parser/generation → verifier → 独立来源语义断言。全部最终 Actor 来自正式 workflow，没有手改 Actor JSON。

- 普通路径使用实际 `OpenAICompatibleMonsterIntakeProvider.extract()`，注入 HTTP 回复，随后执行真实锚定和校验。
- 分阶段使用 `baseMode:facts`、`featureMode:auto`，必要时提供覆盖全部原始行的分段方案，并提供 sourceOperations。没有用关闭 AI 辅助的 source-only 结果代替正常路径。
- 正确回复和故意错误回复分别运行。正确对照先失败时，相关错误组记为未测，不把“一律拒绝”当成查错成功。
- 独立断言检查来源数值、能力清单、完整规则、伤害、DC、充能、激活时机、Actor 属性和原文证据坐标。不会只看流程返回 accepted。
- 规则遗漏用例同时修正内部 claims，避免仅靠悬空字段路径错误冒充语义检查。

| 实际运行 | 结果 |
|---|---|
| 74 次来源/路径对照 | 58 次正确输出；7 次误拦；7 次保守拦下待核对；2 次放过模糊 OCR 的猜值 |
| 107 次错误值 + 4 次规则遗漏 | 97 次拒绝；7 次按原文恢复正确值；7 次错误放行 |
| 8 组负例 | 正确对照未通过，未执行，不计入保护成功率 |
| `bun run typecheck:all` | PASS |
| 当前诊断程序的失败退出 | 实测存在缺口时输出 `GAPS_FOUND`、exit 1；未接入默认 CI 或 hook |

本次可以确认的错误放行，均出现在普通路径：

| 来源形式 | 故意错误 | 实际结果 |
|---|---|---|
| Ability / Score / Modifier 表格 | 敏捷 14 → 2 | IR 和 Actor 的敏捷都错误，validator/verifier 仍接受 |
| `[Darkvision](URL)`，链接里另有数字 | 黑暗视觉 90 → 60 | 错误感官距离被放行 |
| 感官与状态免疫标题相邻 | 在免疫中加入被动察觉数字 `15` | 无来源的免疫内容被放行 |
| 第一项能力缺末尾句号 | HP 30 → 99 | 基础数据检查随分段失败被跳过，输出错误 HP |
| 感知距离带“范围外失明”限制 | 震动感知 15 → 60 | 错误距离被放行 |
| Markdown 引用符包住基础数据 | HP 22 → 99 | 基础数据检查随分段失败被跳过，输出错误 HP |
| 充能标题跨行 | HP 30 → 99 | 基础数据检查随分段失败被跳过，输出错误 HP |
| OCR 的 `Speed S0` | 模拟 AI 猜成 30 | 普通路径放行；分阶段拒绝 |
| OCR 的 `INT l` | 模拟 AI 猜成 3 | 普通路径放行；分阶段拒绝 |

前七行是错误对照中的七次漏检；后两行是模糊来源中的猜值放行。同类原因可影响多个用例，不把九次放行当成九个独立代码缺陷。

已通过的样式包括：`feet` 全拼、伤害数字和骰式分行、AC 冒号、逐行六项属性、MOD/SAVE 三组表、零速度/无语言、Unicode 减号、`ﬁre` 连字、固定伤害、只有骰式的伤害、多个独立能力、动作/附赠动作/反应/传奇动作中的充能、命中后追加豁免、三个结果分支、听得懂但不能说、条件抗性的完整 GM 保留、巢穴 XP 例外和部分交错文本。它们通过的范围是本批精确样例。

需要分别看待的限制：

- “第一次/第二次失败”规则的短证据引用被两条路径拒绝；提供包含第一失败句的较长证据后，两条路径均通过，完整第二失败规则保留。当前缺口涉及证据句边界，并非该机制完全不能表达。
- 条件抗性使用完整手动规则，不生成无条件物理抗性。普通完整 IR 应给空原生抗性列表并附完整 GM trait；阶段 base-facts 可以给原文字面条件，由程序生成 GM trait。这两个回复协议不能混为一谈。
- 带范围外失明的感官在 staged 中被保守拒绝；普通路径正确回复可以通过，但错误距离也会漏过。安全拒绝与实际可用分开记。
- 充能后缀从 IR 名称拆出、Actor 名称重新展示，以及 MOD/SAVE 表补齐源中六项豁免属于正确处理。早期测试程序曾误报，已校正；旧试跑记录保留，不作为最终结论。

### 原始资料及证据强度

这些资料用来寻找现实存在的输入样式。旧导入器作者修过问题，不代表修复可用于本项目目标版本；未安装或移植这些工具。

| 原始来源 | 取样及反馈边界 |
|---|---|
| [5e-statblock-importer #56](https://github.com/jbhaywood/5e-statblock-importer/issues/56) | feet/ft、伤害断行、末尾句号。用户改单位后可用，维护者称 1.69 修复 |
| [#89](https://github.com/jbhaywood/5e-statblock-importer/issues/89) | 固定伤害无骰式的原始报告；不据此宣布目标环境修复 |
| [#60](https://github.com/jbhaywood/5e-statblock-importer/issues/60) | 非魔法/银制等条件抗性；讨论里的旧 Foundry 字段路径未采用 |
| [#95](https://github.com/jbhaywood/5e-statblock-importer/issues/95) | 被动察觉与防御字段串线的报告；只据已读文字取样，未把未查看的截图当独立验证 |
| [#108](https://github.com/jbhaywood/5e-statblock-importer/issues/108) | 非普通动作的充能；维护者称 1.90.1 修复 |
| [#129](https://github.com/jbhaywood/5e-statblock-importer/issues/129) | 攻击后豁免及禁止反应；维护者称 1.91.2 修复 |
| [#131](https://github.com/jbhaywood/5e-statblock-importer/issues/131) | 易伤与纵向属性布局；1.92.9 有作者及报告者反馈 |
| [#132](https://github.com/jbhaywood/5e-statblock-importer/issues/132) | 2024 MOD/SAVE/先攻/PB 布局，后续另有修复反馈；不扩大为所有 2024 内容均可导入 |
| [#37](https://github.com/jbhaywood/5e-statblock-importer/issues/37) | 可见 OCR 字母数字混淆、栏位交错；没有可靠依据让程序猜数字 |
| [#35](https://github.com/jbhaywood/5e-statblock-importer/issues/35) | GMBinder/Markdown 输入诉求；引用符用例为派生压力测试，不声称原帖单独证实引用符是唯一原因 |
| [foundryvtt-importer #25](https://github.com/EthanJWright/foundryvtt-importer/issues/25) | 感官限制语、0 速度、破折号语言；作者称 0.2.6 修复，未见报告者独立复验 |
| [#47](https://github.com/EthanJWright/foundryvtt-importer/issues/47) | 下一项充能能力被前一项吞并；关联 PR #49 修分段及充能 |
| [#88](https://github.com/EthanJWright/foundryvtt-importer/issues/88) | AC 短标题/冒号、紧凑属性和无平均值伤害；关联 PR #89，不推断发行版本 |
| [#104](https://github.com/EthanJWright/foundryvtt-importer/issues/104) | AI 给出的 Ability/Score/Modifier 表；后续称改成模板有帮助，不能归因于单一格式 |
| [#105](https://github.com/EthanJWright/foundryvtt-importer/issues/105) | 链接包住感官名称、范围外失明、理解但不能说；原报告含多个变量，无单因果证明 |
| [PF1 converter #405](https://github.com/Lavaeolous/PF1-StatBlock-Converter-Module/issues/405) | PDF `ﬂ` 连字。维护者称 3.1.5 修复；仅借用 Unicode 样式，没有引入 PF1 规则 |
| [官方 SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf) | 书面页 308 的三个结果分支、324 的递进失败、346 的 MOD/SAVE 表；采用合成数据。SRD 版本不等于 Foundry 系统版本 |

取样主要来自具体问题原帖与维护者反馈，不是按下载榜挑工具。jbhaywood/PF1 仓库当次公开元数据分别为 20/13 stars，仅用于说明来源体量，不作可用性排名。本主题没有新增待本地化模块；待判断本地化清单为空。

检索使用 AnySearch；原始 GitHub API 曾用于读取原帖/评论。补存 Ethan 原帖时 API 限流，产生的空元数据 JSON 不作为证据；已改用 AnySearch 成功提取同一公开原帖。PDF 截图最初的 URL 调用失败，随后引用 ID 调用返回成功；结论依赖可读的官方 PDF 文本及来源研究，不声称已完成截图像素层验收。

### 重现与文件

```powershell
# 从上述原开发副本运行；给输出一个尚未用过的目录，防止覆盖旧证据。
bun tests/diagnostics/forge-weird-statblock-audit.ts .local/forge-weird-statblock-research-20261018/replay-new
# 只查一个用例：第三参数为 ID 正则。
bun tests/diagnostics/forge-weird-statblock-audit.ts .local/forge-weird-statblock-research-20261018/replay-one '^linked-sense-numeric-url$'
```

诊断程序会留下 report/artifacts。发现漏检或误拦时返回 exit 1。这是主动运行的调查入口，没有挂到默认测试、日常工具或 hook。

- 长期语料：`tests/fixtures/forge-weird-statblock-research-cases.json`。
- 诊断程序：`tests/diagnostics/forge-weird-statblock-audit.ts`。
- 最终聚合：`.local/forge-weird-statblock-research-20261018/report.json`、`artifacts.json`、`result-manifest.json`。每条结果可追溯到其单次执行文件。
- 复用未改用例的 final-run；规则遗漏协议完善后只补跑 final-omission；诊断退出码只补跑 final-diagnostic。完整试跑中失败和测试程序修正记录均保留。
- `typecheck-final.log` 为最后类型检查。`final-receipt.json` 另记录既有文件与旧失败证据的保护核对。

## 3. 解决方案：先补共同漏洞，再谈更多自动处理

1. **先让基础数字检查独立工作。** 某个能力没分好段，不能连 HP、属性和速度也不查。可复用已有来源片段/行号分区和校验器，保留逐字段查证；不要仅因“不认识该布局”就默认正确。
2. **统一排版等价的读取。** 补清楚的三列表、链接显示文字、引用符与 PDF 连字。URL 中数字不作规则证据；保留原文不动，并维护规范化视图到原文的坐标对应。先修当前命中的样例和邻近反例，不先建一套通用 OCR 引擎。
3. **模糊值只影响当前怪物。** `S0`、`l` 等确实看不清时指出具体字段，保留待核对。它不能成为猜值许可，也不应变成阻止其他开发任务使用工具的全局 hook。
4. **继续使用这批测试收敛。** 每修一个共同问题就检查正确说法和错误对照。Foundry 衔接、旧格式和完整 GM 规则继续保留，不另请一个 AI 对每次结果全量复审。

优先次序是普通路径的“跳过检查/放过猜值”，随后是明确排版误拦，最后才扩大高级自动化。此次只完成了调研与测试扩充；上述产品缺口尚未修复。

后续候选复查：从表中的原始 issue 及关联 PR/版本反馈确认问题层次，提炼最小合法/错误对照，走相同 public workflow。修复不能拿原帖的“closed”代替当前本地通过；新增文本族应补来源与独立期望，避免重新跑一批无关旧样例凑通过数。

边界：真实 AI 调用 0、Foundry/浏览器运行验收未执行、安装/部署/提交/合并/推送 0。固定回复测试证明当前程序如何处理给定回复，不能证明真实模型每次都会正确整理，也不能给任意表达方式作保证。本次仅增加诊断和语料，未改变用户入口、输出契约、支持版本、操作步骤或安全限制，手册内容无需变更。

SRD attribution: This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## 用例矩阵

| 用例 | 分阶段 auto | 普通整理 | 错误对照 |
|---|---|---|---|
| `control-sentinel` 第二种生物的清楚写法 | 通过 | 通过 | 2 次；漏过 0 次 |
| `control-watcher` 清楚写法对照 | 通过 | 通过 | 2 次；漏过 0 次 |
| `feet-word` feet 全拼 | 通过 | 通过 | 4 次；漏过 0 次 |
| `damage-linebreak` 平均伤害与骰式跨行 | 通过 | 通过 | 4 次；漏过 0 次 |
| `ac-colon` AC 冒号短标题 | 通过 | 通过 | 4 次；漏过 0 次 |
| `vertical-abilities` 六项属性逐行列出 | 通过 | 通过 | 4 次；漏过 0 次 |
| `markdown-ability-table` 属性/数值/调整值 Markdown 表格 | 误拦 | 通过 | 2 次；漏过 1 次 |
| `mod-save-three-columns` MOD/SAVE 三组并排，豁免不等于调整值 | 通过 | 通过 | 4 次；漏过 0 次 |
| `zero-speed-no-language` 速度为零、语言破折号 | 通过 | 通过 | 4 次；漏过 0 次 |
| `unicode-minus` 属性调整值用 Unicode 减号 | 通过 | 通过 | 4 次；漏过 0 次 |
| `pdf-fly-ligature` PDF 的 ﬂ 连字出现在 fly | 误拦 | 误拦 | 正确对照未通过或 OCR 待核对，不冒领负例保护 |
| `pdf-fire-ligature` PDF 的 ﬁ 连字出现在 fire | 通过 | 通过 | 4 次；漏过 0 次 |
| `linked-sense-numeric-url` 感官为链接，URL 含无关数字 | 误拦 | 通过 | 2 次；漏过 1 次 |
| `adjacent-headers` 免疫与被动察觉相邻 | 通过 | 通过 | 4 次；漏过 1 次 |
| `vulnerability-header` 易伤独立标题 | 通过 | 通过 | 4 次；漏过 0 次 |
| `flat-damage` 固定伤害没有骰式 | 通过 | 通过 | 4 次；漏过 0 次 |
| `dice-only-damage` 仅骰式，没有平均值 | 通过 | 通过 | 4 次；漏过 0 次 |
| `missing-final-period` 第一项能力末尾没有句号 | 通过 | 通过 | 3 次；漏过 1 次 |
| `recharge-action` 充能能力位于 action | 通过 | 通过 | 4 次；漏过 0 次 |
| `recharge-bonus` 充能能力位于 bonus | 通过 | 通过 | 4 次；漏过 0 次 |
| `recharge-reaction` 充能能力位于 reaction | 通过 | 通过 | 4 次；漏过 0 次 |
| `recharge-legendary` 充能能力位于 legendary | 通过 | 通过 | 4 次；漏过 0 次 |
| `attack-follow-up-save` 命中后豁免和禁止反应 | 通过 | 通过 | 5 次；漏过 0 次 |
| `three-outcomes` 失败、成功、无论成败三个分支 | 通过 | 通过 | 5 次；漏过 0 次 |
| `two-failures` 第一次、第二次失败的递进 | 误拦 | 误拦 | 正确对照未通过或 OCR 待核对，不冒领负例保护 |
| `two-failures-expanded-proof` 递进失败：AI 引用较长的完整证据 | 通过 | 通过 | 3 次；漏过 0 次 |
| `conditional-physical-resistance` 非魔法伤害抗性以及银制例外 | 通过 | 通过 | 4 次；漏过 0 次 |
| `understands-cannot-speak` 听得懂但不能说 | 通过 | 通过 | 4 次；漏过 0 次 |
| `blind-beyond-radius` 震动感知带范围外失明限制 | 待核对 | 通过 | 2 次；漏过 1 次 |
| `alternative-xp-in-lair` CR/XP 在巢穴中有另一数值 | 通过 | 通过 | 4 次；漏过 0 次 |
| `markdown-blockquote` Markdown 引用和强调标题 | 误拦 | 通过 | 1 次；漏过 1 次 |
| `wrapped-title` 充能标题括号跨行 | 通过 | 通过 | 4 次；漏过 1 次 |
| `ocr-ambiguous-reach` OCR 把 5 识别成 S | 待核对 | 待核对 | 正确对照未通过或 OCR 待核对，不冒领负例保护 |
| `ocr-ambiguous-dice` OCR 把 1d8 识别成 ld8 | 待核对 | 待核对 | 正确对照未通过或 OCR 待核对，不冒领负例保护 |
| `ocr-ambiguous-speed` OCR 把 30 识别成 S0 | 待核对 | 猜值被放过 | 正确对照未通过或 OCR 待核对，不冒领负例保护 |
| `ocr-ambiguous-score` OCR 属性值变成单个 l | 待核对 | 猜值被放过 | 正确对照未通过或 OCR 待核对，不冒领负例保护 |
| `interleaved-columns` PDF 两栏内容交错进属性行 | 通过 | 通过 | 4 次；漏过 0 次 |

