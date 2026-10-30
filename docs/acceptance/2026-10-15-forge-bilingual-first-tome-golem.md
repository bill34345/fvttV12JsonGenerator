# 冻结双语版：Tome Golem 首次完整验收失败

**结果0/1。** Tome Golem首次生成执行一次，全部4个分步请求已返回；基础Actor候选、完整七能力及23个中文文本字段都有保存件。中文校验把引用资料中的裸来源网址当作未翻译英文，阻断完整中文草稿；没有生成可批准的双语包，没有导入或刷新，没有重试或修改冻结代码改判。

## 首次与冻结身份

选定前在主区、当前及另三个注册工作树的输入输出、fixture、记录和保存结果中无匹配。Luna生成前对实时世界288个Actor行核查，也未发现Tome/Book Golem、Animated Book及中文书/卷册魔像等匹配；Dragonbone Golem是无关对象。来源与格式准备、两份完整引用及来源预检的边界见[来源记录](../reviews/2026-10-15-forge-tome-golem-source.md)。没有使用其他样本的IR或译文。

生产源码完全沿用已完成Archivist双语导入刷新的版本。冻结474绑定SHA `805880ae04da7317492fc949c737d34e0bf657edd97221ed61ef298bd35f0b77`，业务主脚本 `5e90014ac8af8477c2afc8f5a0410e026ab17581decc92d3d73e6744a7466bbe`。最终输入 `Tome-Golem-input.md` SHA `31cd60ecf84aee11b2648a106ead5a38d840a0bd2932c135dd3d71cba9d61a88`。

执行器为原独立GPT-6 Luna/max，实际never/danger-full-access配置、官方Chrome及当前安装字节均有预检。复用Browser3/tab651345569和Mirror PID54732 / 127.0.0.1:30001 / world cor-cotn / Core14.368 / dnd5e5.3.3，没有新建服务或安装其他候选。

## 实际执行

总耗时 **115005ms，约1分55秒**。外层执行1次，真实4个请求，均HTTP200并完成正文接收；自动重试0、修复0、付费AI审核0。4个请求身份不同，没有重复逻辑请求。

| 请求 | 阶段 | 传输耗时 | 保存正文字符 |
|---|---|---:|---:|
| 1 | 基础事实 | 5105ms | 668 |
| 2 | 中文标题 | 9388ms | 447 |
| 3 | 中文正文第一批 | 85602ms | 5634 |
| 4 | 中文正文第二批 | 14313ms | 226 |

Luna一次60秒命令等待先返回在途状态并回传。父任务因这一真实回传读取既有结果时，唯一进程已经结束、最终收据已存在；没有再轮询、重新执行或追加模型请求。宿主等待返回没有记作服务失败，也没有对生成设置总时限。

## 已取得的结果及具体卡点

- 英文Actor候选已准备：AC14、HP256/27d10+108、STR22/DEX17/CON19/INT3/WIS14/CHA2、CR12/XP8400；七能力齐全，全部为完整GM手动Item，无自动效果。Burning完整叠加/解除定义及Animated Book完整参考数据/战术已进入传记。
- 中文请求23字段、返回23字段，身份覆盖齐全。5个字段的唯一确定性finding为“未完成中文化，残留英文：https homebrewery naturalcrit com share …”。具体ID与原因保存在最终收据，中文及来源原件完整保留。
- 这些出处行是本轮准备完整引用时追加的 `Source: https://…`，回信中已译成“来源：https://…”，网址保持原样。当前中文检查没有将这类来源网址和自然语言正文分开，于是把网址中的英文字母当成漏译。这是**来源准备格式与本地校验边界不一致**，不能归因为DeepSeek未返回或能力太复杂。
- `ready_for_gm_review/prepared=true`只对应原语言Actor可供审阅。`completeChineseDraft=false`，没有顶层完整localizationDraft；待审字段保存在report.localization中。不能借前者把本轮双语任务改判通过。
- 没有对这23字段做完整译义通过的声明，没有手改URL或译文、伪造批准、补最终JSON、重新生成或进入原生导入。导入与刷新均 **NOT_EXECUTED**。

## 现场、旧结果及剩余问题

`run-1/provider-reply-001.json`至`004.json`四份独立完整正文均存在，没有截断、保存失败0；父任务从磁盘逐一读回，核对正文SHA、请求序号和本次来源hash。传输全部成功，无需断流前缀；本次失败属于本地中文判定，失败finding、23字段草稿、基础IR、原语言Actor和请求时间线均保留。

原始source-package、result、latest-report、requests、activity、generation-receipt及四回信不改。474冻结绑定和16当前安装业务文件再次核对一致。V10失败收据、Archivist双语交付收据SHA保持，旧Actor与服务没有由本轮改动；没有提交、合并或推送。

剩余未修问题是**合法来源网址的保护和中文校验**。本轮原始保存件已能离线重现，不需要再请求模型来确认；后续修复仍应保持原URL身份、不得任意放行新增网址或把真正漏译的英文正文一起豁免。本轮冻结首次失败不因后续修复而改写。

最终收据 `.local/forge-bilingual-fresh-20261015/first-generation-final-receipt.json`，SHA **ea9a42584b24ab20fbfdeb29880cfaaee744f9a902807793ae720a43c36749d8**。目录内同时保存来源准备时UNKNOWN_HEADING的0模型预检失败及无损格式适配，来源准备与真实模型首次结果分列。

本轮全新样本完整验收 **0/1**；先前Archivist保存件双语恢复1/1和历史六例首次0/6均不改。
