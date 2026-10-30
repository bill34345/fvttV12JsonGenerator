# fvtt-json-forge：新 thread 接手记录

记录时间：2026-10-15。用户准备换新 thread 接手。本文件是现状与证据交接，不是产品完成声明，也不授权新的模型费用或发布。

## 先看结论

**原始产品目标仍未完成，不能说模块整体修好了，也没有证明全新生物首次完整跑通。**

原始目标：基础数据可信、来源完整的怪物能够生成完整中文 Actor。基础数据与完整能力分步处理，每步核验；Actor 和正式中文共用核实后的事实。复杂能力可以完整保留为 GM 手动项，不能因为无法自动化就阻断整只怪，也不能丢文或生成错误自动效果。描述须中文在前、完整原文在后。

现在优先修的产品问题是：**程序生成的中文提示/备注与作者原文混在一起，被整体放入“英文原文”栏。** 七个手动能力的重复 GM 提示已在源码中离线修正，但传记里的生成器护甲备注仍未分离。最新源码没有安装到 Foundry，现有世界卡仍为旧版。

## 工作树与边界

- 必须复用 `I:\OpenCode\fvttV12JsonGenerator-worktrees\20261006-111625-bettermonsters-eye-deep-sample`，不要在主工作区改代码或另起工作树覆盖成果。
- 分支 `codex/20261006-111625-bettermonsters-eye-deep-sample`；HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。交接时索引为空，存在大量之前多轮留下的 tracked/untracked 改动，全部保留；不能把整个 diff 算成本轮修改。
- **当前禁止调用 DeepSeek、读取 Key 重新生成或开启付费审核。** 早前允许的一次生成已经执行完并失败，不能把旧许可当成下一次许可。只能用保存的来源、回信、草稿和包离线验证，直到人类另行授权。
- 不自动重试凑通过；保留失败现场、冻结版本及有用的通过证据。不提交、不合并、不推送、不 reset/stash、不清未知文件，不手改最终 Actor JSON。
- 只读、代码修正及必要离线验证可继续自主完成。原生工作沿用已授权本地 Mirror，不碰生产或直接编辑 LevelDB。
- 用户反复要求大白话、真实结果。不要先堆解释/认错/保证，更不要用测试、回执、浏览器工具或清理完成代替产品完成。这里的“拆分”指基础数据/完整能力的生成阶段，不是多代理并行修问题。

## 阅读顺序

先读适用 AGENTS.md，然后读以下最近记录：

1. `docs/acceptance/2026-10-15-forge-duplicate-gm-notice-offline.md`——最新缺陷、已改范围、未改传记及未安装的边界。
2. `docs/acceptance/2026-10-15-forge-source-url-repair-and-tome-recovery.md`——通用网址修复、真实导入/刷新 UI 结果及完整读回缺口。
3. `docs/acceptance/2026-10-15-forge-bilingual-first-tome-golem.md`——必须保留的首次失败，仍为 0/1。
4. 初始交接要求的 `docs/acceptance/2026-10-13-forge-six-fresh-retest.md`、`docs/reviews/2026-10-13-forge-comparable-importers-and-manual-fallback.md`、`docs/reviews/2026-10-13-forge-staged-api-feasibility.md`。这些是历史研究/失败基线，后续已有部分实现，不能据旧日期把当前源码误判为尚未实施。

按实际范围再读局部文档，不重读全部历史报告，不重新调研已有记录，不重跑无影响的通过检查。

## 当前两层版本

### 已安装的 V13：网址修复版

证据目录 `.local/forge-url-localization-repair-20261015/`。

- `candidate-freeze-v13.json` SHA256 `458e7edac2c222942b8e4053005e64182ef3f05c37a2acecee9d3d67df4d7c85`，当时绑定 530 文件。
- `final-repair-receipt.json` SHA256 `95db0db9279950608efa0d0ce6b7efecfe5d86930decca971f8d230ce51d4f1e`。
- 通用网址保护属于 `packages/contracts/src/localization-source-urls.ts` 与 `localization.ts`。HTTP(S) 原网址保留，逐字段核对内容/数量/顺序；真正漏译的正文、增删改或重复网址继续拒绝，没有网站或怪物白名单。
- 296 项相关测试、类型、架构和手册检查通过。使用 Tome 原基础回复及原三份中文回复离线完整链通过，23 字段、7 能力、15 双语描述；真实模型调用为零。
- 恢复包标签复用已返回的 Tome Golem 名称，未发明新译文；既有经验值标签规范化把两处 XP 显示为“经验值”，数字不变。不要声称与首次草稿全部字节相同。
- 正常真实 GM 确认、一次导入通过。世界 Actor 288→289，宏 94→94。Actor 为 **书卷魔像 Tome Golem / `5bfce59617ab658e`**。已交付 Archivist **`8b7f80ac824cdd1c`** 也保留。
- 导入后的完整原始数据已核对 7 能力、15 处中英描述、全部基础数据、完整引用及零错误自动化。11 处 HTML 字节相同，另 4 处仅 Foundry 的实体/空白规范化，全文相同。
- 一次刷新后同 Actor ID、HP256/AC14/CR12、七能力名称及 Flammable 的中英全文/网址 UI 通过；**刷新后的全部数据 JSON 未取得，仍未核实**。不要把 UI 子集写成全部 15 描述/机制刷新后都已复核。
- 本轮 helper 已精确移除，16 业务文件保持。当前已安装业务 index SHA256 `c673d49545ca4d01a483c7a4c9a52f9d189424d8e88fa40ae04f3fbc534b97a3`，`helper-closeout-receipt.json` 保存清理记录。没有为了清理再刷新客户端，旧页可能还留有已加载按钮。

### 最新工作树源码：重复 GM 提示离线修正版，未安装

证据目录 `.local/forge-bilingual-source-cleanup-20261015/`。

- `final-offline-receipt.json` SHA256 `29df17f021893b497aed4052eff0288f759efcb1f76edf14688d308c331a1e54`。
- `offline-recompile-receipt.json` SHA256 `94202e35557d9d6b36d4ab7df47653ab46dbddc6efce7c3fca20650ad9605342`。
- 本轮只改 `packages/generation/src/actor-text.ts`、`actor.ts`、`reviewed-localization.ts` 的展示归属及相关测试/说明。`formatManualRuleHtml()` 共用程序提示生成，`descriptionSource()` 只在 manualRule 标记及完整格式精确对应时取完整规则正文。作者自身的中文/同名提示不得删掉；缺失或不匹配标记时不擅改来源。
- `tests/forge-staged-manual.test.ts` 的正式生成/批准/保存读回测试先红后绿；`tests/forge-rule-presentation.test.ts` 增加正文、活动聊天、多行/网址、作者中文及不可信标记反例。
- 本轮 186 分步 + 52 事实/来源归属测试 = 238，通过 2461 断言；包/全仓类型、verify:actor、架构、anti-overfit、浏览器安全构建、手册检查通过。不要把这 238 与上轮 296 相加当成不同测试。
- 用前轮真实 GM 批准保存包经过正式 workflow 重编译，排除 14 处英文侧多余程序提示；中文逐字不变，非描述数据逐值不变，译文身份不变。产物 `recompiled-tome-actor.json`，无新模型、网络或世界写入。
- 浏览器候选 `browser/index.js` SHA256 `691e697cb969bdb31347b020ce1434511e029044a7f5781a6c15518c7bc93f03`，**未安装、未导入、未作原生复验**。
- V13 冻结包/产物、收据及首次文件均未动。V13 的 530 绑定里部分路径指向可变工作树源码，现在源码已修，hash 变化是预期；不能为了让旧 freeze/install 脚本通过而回滚新修复。复用的是旧不可变候选和行为证据，后续发行需新冻结。

## 紧接着做的产品修复

先写简短实施步骤，优先处理传记来源边界，不再围着下载回执兜圈：

1. 查 `packages/intake-ai/src/renderer.ts` 的 `renderBiography()`：原始 `creature.biography`/传奇前言后，程序会追加 `护甲等级：...` 以及 Colossal 的原生尺寸/GM 判断备注。这些生成器文字进入了生成后的 biography。
2. 查 `packages/generation/src/reviewed-localization.ts` 的 `bilingualDescription()`：传记仍把整个生成后的字段当英文来源追加。Tome 英文栏末尾当前仍有 `护甲等级：14（Natural Armor）`。应在产生资料时明确区分作者文字/来源事实与程序提示，不能简单删除所有中文、砍末尾段落或给 Tome/某网站写特例。
3. 保留全部原文、链接、引用定义、条件与数值；作者原文自己写的中文也必须保留。必要来源身份/批准绑定变化须重新校验，不能伪造 GM 批准或强行沿用已不匹配的旧 hash。
4. 用保存失败数据及真实消费者离线验证，再冻结最终候选。基础数据与完整能力继续分步核验，同一事实供 Actor 和中文使用。
5. 新代码只有离线通过；当前世界 Actor 仍旧，不得向用户说已经更新。原生验收只重做受此次展示变化影响的部分，保留有效基础/机制证据；正常正式生成/导入，不手改最终 JSON，不删除旧失败卡或原件凑通过。

更大目标仍缺“完全没处理过的新怪物，首次完整生成、中文与正常导入刷新成功”的证据。**现在没有再次调用 DeepSeek 的许可**，不得为了补这一项擅自消耗额度。

## 保存输入和失败原件

首次目录 `.local/forge-bilingual-fresh-20261015/`：

- `Tome-Golem-input.md` SHA256 `31cd60ecf84aee11b2648a106ead5a38d840a0bd2932c135dd3d71cba9d61a88`；来源全文及 Burning/Animated Book 完整定义已保存。
- `run-1/provider-reply-001.json` 是基础事实，002/003/004 是中文回复，均已保存完整。原首次 4 次 HTTP200，约 115 秒；不是没调用 DS 或没回信。最后因本地把网址当漏译失败，首次 0/1 保留。
- 原中文有旧占位符编号，不要拿新保护器直接解释旧编号。前轮 `frozen-decoder/legacy-reader.mjs` 及 `decoded-original-translations.json` 已准确恢复 23 字段，`legacy-reader-receipt.json` 验证原请求/回复 hash。优先复用，不重复制作兼容器。
- 原先 Treasure 标题曾在静态入口不支持，转为普通段落后才执行唯一模型尝试，全文未删。这是历史准备限制，不是“任意原文首次都支持”的证据。
- 原译文中有残余所有格撇号及字面 Markdown；不宣称中文零误译。用户接受中文后跟完整英文用于现场核对。

## Browser / 服务：继续复用原 Luna，别由新主控自己操作

- 原独立执行 thread：**`01a13871-5d83-7930-8c21-1810f9d250a1`**，用户指定 GPT-6 Luna / max。先读 `H:\CodexData\skills\chrome-delegation-dev\SKILL.md`，不要新建一例一个执行任务或递归委派。
- 原父 thread 为 `01a135d7-1e1a-72e2-b51a-f7b5fd9e8def`。**新 thread 的 callbackThreadId 必须改为新父任务真实 UUID，不能继续回调旧父。** 核对人类回调授权及实际配置；派发首行 `[chrome-delegation:dispatch]`，回调首行 `[chrome-delegation:callback]`，用 Codex app `send_message_to_thread`，不是 collaboration `/root`。
- 派发准备做完后交给 Luna。无独立必要工作就结束父回合等真正回调，不轮询状态、刷日志或定时唤醒。
- 现有 Chrome 工作页：Browser3 / tab **651345569** / `http://127.0.0.1:30001/game`，需按当前官方工具文档确认，不重建无关页面。
- 现有服务交接时仍为 PID **54732**，监听 `127.0.0.1:30001`，world `cor-cotn`，Core **14.368** / dnd5e **5.3.3**；data `F:\FoundryLab\foundry-v14\data\server-mirror`，owner Administrator。交接已读回端口/PID，继续操作前仍核对；不得停止、重启或复制第二套 Lab。
- 已明确拒绝 `chrome://downloads`（官方工具只允许 HTTP/HTTPS），不得换通道、原始 CDP、间接导航或其他手段绕过。旧官方 Chrome runtime 脚本已不在原路径；当前官方统一 Chrome 提供方曾正常重连同一页，不能把“NodeRepl 全局变量没了”误当 Chrome 不可用。按当前真实工具文档恢复，不照抄已删除的旧脚本路径。
- 文件选择器曾出现空 FileList、不支持 FilePayload，随后 filechooser 超时；正常导出只发出一次，下载事件 30 秒超时重置。实际系统下载目录是 `H:\Download`，已按目标 Actor ID 查过未找到。不要重复这些不变失败或重生成/重导入填回执。
- 后续只用正常应用/已授权只读工具补实际缺失证据，不为此新造通用平台。查看能力说明使用真正的展开/详情入口，不能点能力使用按钮冒充阅读。

## 工具与接手状态

- 固定 Bun1.3.14：`H:\CodexData\visualizations\2026\10\02\01a0fdf7-35f6-79c3-b1c5-4812d1a8f54d\crystalbleed-v14-close-20261003\ci-runtime-1.3.14\bun-windows-x64\bun.exe`。
- Python：`C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`；用 `-B`，必要时设置 `PYTHONUTF8=1`。
- 现有安全入口：`test:forge-staged-manual`、`test:forge-facts`、`typecheck:packages`、`typecheck:all`、`architecture:verify`、`audit:anti-overfit`、`verify:actor`、`handbook:check`。只补与新变化有关的检查，不手动跑内部 raw，不重复全仓 CI。
- 旧父进度状态：`H:\CodexData\hooks\state\task-progress\01a135d7-1e1a-72e2-b51a-f7b5fd9e8def.json`。可读其产品队列，但它属于旧会话；新父不要照搬旧 session/回调 UUID 修改旧状态。重点未完成项：`original-complete-chinese-actor`、`bilingual-biography-generated-note-separation`，以及已明确的刷新完整数据缺口。历史单次失败项不能靠重跑改成首次成功。

本次交接只新增说明，没有继续改代码、请求 DeepSeek/付费审核、操作浏览器或发布。
