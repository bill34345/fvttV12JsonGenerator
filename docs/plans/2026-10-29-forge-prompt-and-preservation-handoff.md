# Forge 提示词调查与既有能力保真交接

更新于2026-10-29，供新thread先恢复状态，再按用户新指令继续。此文件是本次交接入口；[唯一当前状态](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/docs/plans/2026-10-20-forge-ab-current-state.md)保留各轮历史。不要从旧handoff的“待修复”段落重新开工。

## 1. 现在要处理什么

上一轮程序修复、冻结材料对照、独立审查和本地配置验收已经结束。当前讨论转为：**Forge给AI的提示词会不会因不断追加修补说明而越来越臃肿，旧CLI是否更简单，以及如何在不破坏原有正确行为的前提下整理它。**

用户本次原话：“我建议你写一个 handoff，把这些调查内容和我们现在处理的情况做一个交接。我去另外一个 thread 继续操作，因为这个 thread 的上下文已经很长了。”本次只写交接，不继续修改产品或提示词，不新增模型请求，不创建新thread。

目前尚未提出、批准或实施具体提示词精简稿。下一thread不要把助手建议的“收口审查”误读为用户已经批准删规则、改数据结构、修改生成器或追加AI请求。

## 2. 用户唯一前提及沟通修正

用户原话，必须优先于助手此前概括：

> 改代码的前提是改完后不会让原本没问题的变成有问题。这才是唯一前提

助手对此的执行理解：修好当前问题必须同时保住原来正确的生物结果、流程和支持写法；一旦本次修改造成新的生成失败、能力丢失、参数错误或效果错挂，该修复不能宣布完成。既有对照只能证明已检查范围，没有证据时不能承诺任意未来输入绝不退化。不要用测试数量代替这个前提。

沿用的操作边界另列，**不要再把它们回答成用户的“唯一前提”**：当前worktree继续保留；原答、失败和旧快照保留；不新增模型调用、不自动复核/纠错/重试、不提交/合并/推送。两批每批6次的真实模型额度均已用完，不存在可自行使用的剩余额度。AI内容复核仍关闭。

用户结果表固定使用“生物｜成功程度｜问题点”。完全成功的“问题点”只写“—”；部分成功说清具体错误和实际影响；失败说清为什么没产物/不可用。不用accepted、有Actor、schema通过或静态测试通过替代实际功能判断。

用户已指出“冻结原答”“契约已修正”等说法不清楚。对用户直接说“上次AI原封不动保存的回答”“修改了给AI的提示词”。每个问题必须交代来源要求、AI回答、程序输出、使用后果和未完成验证；不能让内部术语掩盖实际问题。

最终产品是Foundry中的Forge mod；旧CLI只作相应行为参考，不把任务转回开发CLI。

## 3. 工作树和未发布成果

- 实际worktree：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`。
- 主仓库：`I:/OpenCode/fvttV12JsonGenerator`，本轮不在那里修改产品。
- 分支：`codex/20261019-forge-ab-fixed-replies`。
- 本次写交接前核对HEAD：`5dc5702767bbcb0818a05a02e45c925289e66758`；暂存区为空。
- 写交接前status为136条：90个tracked修改、46个untracked。这些是多轮未提交成果，不能重置、stash、删除、换干净基线或当作其他任务垃圾。交接写入后数量会增加。
- 沿用此worktree，不新建checkout来丢掉这些依赖。所有命令显式指定该workdir。
- Git：`H:/Git/cmd/git.exe`；锁定Bun1.3.14：`F:/FoundryLab/foundry-v14/runtime/bun-v1.3.14/bun.exe`。

本轮没有提交、合并、推送或生产发布。不要把工作树成果当作已进入master。

## 4. 最近两批真实首答及修复现状

先读以下三个来源，按新结果理解历史：

1. [第一批六只原始首答验收](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/docs/acceptance/2026-10-29-forge-six-known-creatures-first-pass.md)：Priest、Adult Brass Dragon、Roper、Behir、Unicorn、Magma Mephit，每只1次，共6次真实请求。
2. [第一批后的四类机制修复](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/docs/acceptance/2026-10-29-forge-four-compatibility-fixes.md)：恢复Brass可确定的完整JSON外壳/外层能力集合；纠正Behir后续酸伤重复挂初始状态；Magma明确语言列表补原生身份；Unicorn传奇抗性接同一原生计数。零新模型请求。
3. [第二批六只原始首答验收及Unicorn更正](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/docs/acceptance/2026-10-29-forge-six-more-known-creatures-first-pass.md)：Balor、Medusa、Spirit Naga、Otyugh、Hydra、Gladiator，每只1次，共6次真实请求。六只均有Actor，原始成绩3完全成功/3部分成功。

第二批后，最近三类处理见[详细验收](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/docs/acceptance/2026-10-29-forge-three-followup-fixes.md)。应准确分成**两类程序缺陷已验证修复，一项提示词修改尚未证明真实AI改善**：

| 对象/问题 | 实际状态 | 关键事实 |
|---|---|---|
| Balor/Unicorn报告失败 | 已验证修好 | 上轮原生资源验证新增`actor/system/resources/legres`，报告协议不接受，导致正确Actor附带失败报告。本次只允许这个精确路径，正式候选/报告/序列化/schema往返通过，没有放宽任意Actor路径。 |
| Otyugh语言不显示 | 已验证修好 | 原生values中的未登记语言系统不会显示；新旧Otyugh均有此既有缺口。通用投影将未知名称移至可见custom，并完整保留心灵感应备注，实际卡片可见。v12旧行为保留。 |
| Medusa额外逃脱DC | **未验证问题已消除，仍部分成功** | 上次AI错误填escapeDc13；程序照投影为额外提示。只更新了提取/显式纠错提示词，没有新AI回答，旧错误Actor保持。 |

必须保留历史更正：上轮把Unicorn评为完全成功时漏看了同一报告错误，第二批调查已撤回那次分级；其机械配置/实际保存正确的证据仍有效。最近修复后，Unicorn本轮冻结重放及配置验收可以评完全成功，但不覆盖原始失败报告或抹去误评事实。

### 美杜莎的问题，用普通话说清

- 正确规则：石化凝视第一次体质豁免失败后束缚；目标下回合结束时仍束缚则再次做DC13体质豁免，成功解除，第二次失败改为石化。来源没有逃脱检定。
- 上次AI回答保留上述描述，却额外填了`escapeDc:13`。
- 程序把这个明确字段显示成束缚效果中的“逃脱 DC 13”。效果由DM可选应用，没有自动执行逃脱检定，但会误导DM，属于实际错误输出。
- 错误首先在AI提取结果中出现；没有证据说明本轮生成器把正确的重复豁免改成逃脱。产品输出仍错，不能拿“模型错”当作修复已经完成。
- 现有责任边界是AI理解内容、程序负责结构及投影；不从原文偷偷覆盖AI明确机制。本次没有改写旧回答或手修最终Actor。
- 已改的是给AI的说明：重复豁免不能填escapeDc，真正逃脱检定才填；两种同时出现保留各自DC。是否使真实AI答对尚未验证。
- 当前extract版本`monster-intake-extract-v53-condition-dc-kind`；repair版本`monster-intake-repair-v43-condition-dc-kind`。repair提示词更新不表示执行过纠错，review仍关闭。

## 5. 已验证范围及不能抹掉的失败

最近一轮：

- 新增局部27项：原生资源报告11、语言11、重复豁免/逃脱DC契约5，均通过。
- 既有受影响147项：46冻结检查12、generation preservation81、四类兼容性54，均通过。
- 完整对照24份既有产物：第一批6、第二批6、46整改项实际使用的12份。22份Actor/恢复快照除允许的生成时间外不变；新旧两份Otyugh仅预期语言value/custom变化。没有发现未预期Actor回归。**12份不是46只，24份也不是24种不同生物；不宣称全部46项任意组合都正确。**
- 真实Mirror正常导入Balor、Unicorn、Otyugh，源Item目录/正文保留；三只完整Actor含_stats刷新前后严格相同，排除字段0。Balor/Unicorn原生传奇抗性3、同一属性消费；Unicorn9Cast及Shimmering Shield临时生命/目标保持；Otyugh卡片确实显示语言及完整备注。
- 类型all/packages、架构、局部anti-overfit、Forge构建、手册同步通过。独立实现审查和新增诊断补充审查未发现可操作实质问题；独立静态审查不等于独立运行所有行为。
- 原provider测试63通过/10失败；原协议测试51通过/14失败。已与精确旧源码的内存还原执行对照，失败名称集合相同。没有修这些旧断言或把失败计为通过；后续不要再次将它们未经比较归因于新改动，也不要称全仓测试全绿。
- 第二批离线生成先用带禁网guard的私有诊断，保留有效行为证据。补安全入口后只读既有6份正式响应，通过真实wire schema与完整artifact相等，生成/网络/输出写入0；没有为补包装再生成6只。不要抹平这条执行边界。
- 5925份受保护旧材料hash保持，索引为空。以上是最近修复完成时的收据，不是未来未查即通过。
- 没有Use、Cast、EffectApply或投骰；不声称战斗执行已验收。不要因为新thread而重跑已经通过且依赖未变的矩阵。

局部实现入口：

| 范围 | 文件 |
|---|---|
| 当前Monster提取/复审/纠错提示词组装 | [monster-prompts.ts](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/intake-ai/src/monster-prompts.ts) |
| 实际system前缀、版本、请求装配 | [provider.ts](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/intake-ai/src/provider.ts) |
| 操作字段/规则说明、新增escapeDc段 | [source-operation-contract.ts](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/intake-ai/src/source-operation-contract.ts) |
| 资源报告允许路径 | [wireSafety.ts](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/forge-gateway-protocol/src/wireSafety.ts) |
| 语言共享投影及检查消费者 | [actor-languages.ts](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/generation/src/actor-languages.ts)、[verifier.ts](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/intake-ai/src/verifier.ts) |
| 新增局部测试 | [资源报告](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/tests/forge-native-resource-report.test.ts)、[语言显示](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/tests/forge-language-visibility.test.ts)、[DC区别](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/tests/forge-condition-dc-contract.test.ts) |

## 6. 提示词调查：已确认事实

用户原话：“我担心这个prompt会不会愈发臃肿。我的老CLI工具 给AI的prompt也很臃肿吗？”本次只读调查并导出文本，没有改代码、提示词或执行模型/业务测试。

下表统一比较system固定说明，不含生物原文；只是字符，不是模型token、费用或质量：

| 版本 | 字符数 | 已核依据 |
|---|---:|---|
| 旧CLI的生物YAML整理模板 | 2817 | 当前保留代码与历史提交128537e5/617a1df4的提示词完全相同。 |
| Forge V48，2026-10-25精简后 | 16487 | 保存的实际systemPrompt文本长度与当时记录一致。此前精简历史见下方来源。 |
| Forge V52，上次Medusa实际使用 | 18846 | 从当前组装移除唯一新增v53段后，完整system哈希与实际发送收据一致。 |
| Forge V53，当前 | 19348 | 当前实际组装文本静态测量。 |

V53约旧模板6.9倍字符，较V48增加2861字符、约17.4%；本次美杜莎说明新增502字符。中文/英文混合比例不同，不能把6.9倍字符说成6.9倍token或费用。Medusa真实输入usage包括系统说明和来源，不具备单独prompt token测量。

当前额外任务包括法术分组、共享/独立次数、独立操作及关系、状态阶段和引文；不能因旧模板短就删掉当前能力要求。旧模板也包含目标、子活动、成功/失败效果，不应说它只有基础数值。

已观察到可审查的重复/历史负担：多处重复“保留原文/不删能力/复杂后果交GM”；程序负责的ID/空记录说明重复出现；历史字段兼容说明与新回复生成说明混合。它们是**精简候选**，不是已经证明可安全删除的内容。

没有证据证明Medusa错误由提示词过长造成，也没有新旧prompt同输入真实AI对照证明短版更准确。助手建议“先审查、合并重复说明，再谈改稿”，不是已经批准的实施方案。

旧CLI范围注意：查到的是仓库内置`PromptedIngestNormalizer`生物YAML模板；不是证明用户过去手动复制给AI的所有提示词都只有2817字符。当前CLI普通标准资料转换无需AI；旧plaintext工作流只有注入normalizer且启用时才可能调用。当前正式CLI通过workflows实例化该旧路径，没有默认注入；不能凭代码有模板就说每次实际发送。旧兼容adapter保留环境配置注入，勿混为一条调用链。

旧模板代码：[plaintext.ts:1134](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/ingest-plaintext/src/plaintext.ts:1134)。当前组装在[monster-prompts.ts:28](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/packages/intake-ai/src/monster-prompts.ts:28)。2026-10-25已做过一次从52035到16487字符的收口，见[当时报告](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies/docs/reviews/2026-10-25-forge-prompt-and-two-2024-sources.md)；该历史记录不代表当前还是16487，也不证明精简本身提高质量。

## 7. 精确证据入口

共同私有父目录P：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313`。下列目录及文件均在本机，只读保留，不把完整原始请求/来源、凭据或未脱敏日志复制进仓库。

| 目录/文件 | 用途 |
|---|---|
| `P/forge-six-fresh-first-answers-20261029` | 第一批sources.json、来源、6份原答/首次失败、HTTP账本。 |
| `P/forge-four-compatibility-fixes-20261029` | 第一批修复及six-replay-final；Brass外壳/Behir/Magma/Unicorn机制证据。 |
| `P/forge-six-more-first-answers-20261029` | 第二批sources.json、6份原答/Actor/报告；Medusa错误首先出现的回答及实际输入。 |
| `P/forge-three-followup-fixes-20261029` | 最近修复完整证据；result.json、preservation-final.json、checkpoint-final-result.json。 |
| 上述最近修复目录的`independent/followup-comparison-final.json` | 24份完整差异的最终分类；原始diff和旧产物也保留。 |
| 同目录`independent/code-review.json`、`additional-readback-review.json` | 独立只读审查，包含审查时源码hash。 |
| 同目录`mirror/parent-refresh-validation.json`、`parent-restoration-validation.json` | 父代理独立核对实际保存/恢复。 |
| 同目录`report/existing-protocol-baseline-comparison.json`、`condition-dc/existing-failure-comparison-final.json` | 协议14/provider10旧失败对照。 |
| `P/forge-medusa-original-prompt-inspection-20261029/original-system-prompt-v52.txt` | 当时实际system原文，hash完全匹配发送收据。 |
| 同提示词目录`medusa-source-as-sent.txt`、`inspection-receipt.json` | 当时美杜莎原文及导出核对；readable user JSON为依据保存candidate重组的可读版，不能说是完整原始HTTP抓包。 |
| `P/forge-prompt-size-comparison-20261029/old-cli-normalizer-system.txt` | 2817字符旧CLI完整提示词。 |
| 同对照目录`forge-v53-system.txt`、`comparison.json`、`history-verification.json` | 当前完整prompt、长度/字节/hash及历史提交核对。 |

Medusa的V52实际system SHA-256：`dc85828b29cba5730ead61a6f5a8a8f56d37d7af2cafa4008e2b4c1e8e9bdf22`。当前V53 system SHA-256：`5a309d556c8ccdc487f05b16e0e09bf5bc6944ea04564bd07095487e6f65c5b7`。旧CLI system SHA-256：`aa423b7f4162be6656092eee81eaf131802b359d3fb5410c815c97959d4e9252`。

## 8. 本地服务与清理的最后收据

以下是已完成修复验收时的最后状态，**本次交接未重新启动/登录/探测服务，下一thread使用前再核实当前占用**：

- Mirror：`F:/FoundryLab/foundry-v14/data/server-mirror`，端口30001，PID33972，world cor-cotn，Core14.368/dnd5e5.3.3。
- 安装Forge0.5.1的scripts/index.js SHA-256：`0b28427792d5fce6d2b383fc770977a14e3cb674bf50aa948d6241d10954059b`；本轮17文件已核同一候选，实际客户端加载hash另验。
- 最近3测试Actor、观察器、自有tab均已正常UI精确删除/关闭；无需再按旧ID清理。原Mirror服务及用户页面保留，Next/生产未动。
- 七集合/时间/暂停/活动场景恢复hash：`5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535`；318Actor、180Item、94Macro、67Scene、10Combat、1245Message、133Folder。
- 当前是提示词讨论，不需要浏览器或Foundry验收。将来确有需要时读项目Chrome委派规范、local-lab-login及readiness；旧agent/tab身份不能直接当成新thread可复用授权或当前存活证明。

## 9. 新thread建议起点，尚未实施

1. 读本文件、当前AGENTS及相关局部AGENTS，核对同一worktree/HEAD/dirty，确认用户新指令；不用重读全部历史会话。
2. 如果用户继续提示词审查，先只读逐段分类：必要字段定义、必要机制语义、重复提醒、历史兼容/程序账本、新回复无关内容。每项给保留/合并/移出/待定理由，指出消费者依赖；不能以“字数多”直接删能力。
3. 提供具体可审阅精简稿及前后差异后，再按用户授权处理；不要同时大改IR、parser或生成器来追求短提示词。没有新模型额度时保持0外部请求。
4. 将验证问题分开：旧回答重放可以验证接收/生成/报告和既有产物不退化；新提示词能否让AI保持正确提取，需要真实同输入对照，尚未授权或执行。不能把前者当作后者，也不能将“提示词改了”写成Medusa已修好。
5. 已通过且未受影响的旧检查直接复用；只补真实变化对应缺口。更新结果仍按用户唯一前提审阅。当前没有批准压缩目标、百分比或硬字数上限。

用户如果只要求审查或方案，不要自行修改产品、跑业务测试、请求模型或扩成新一轮全库测试。报告中指出事实、推断和缺口，优先回答用户当前问题。

## 10. 交接记录

本次只新增本交接文档并更新唯一当前状态的入口；保留既有产品/提示词/测试/手册内容、原答与旧报告。不提交、不合并、不推送，不执行模型、业务测试、浏览器或Foundry。验证只限文义、路径/引用和实际差异；新增交接不构成重跑已有测试的理由。
