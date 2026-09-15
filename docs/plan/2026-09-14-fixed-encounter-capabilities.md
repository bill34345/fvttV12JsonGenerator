# 固定自动化能力与 DS Intake

状态：固定能力实现与真实 DS 配置审核通过；第三轮运行验收 PARTIAL，清理的完整文档 ID 集合核对通过，但运行时间超限。重复 Dazed 的窄修复已完成；用户确认 Token 按世界设置重掷 HP 属于预期行为，已撤回 HP 干预，离线回归、类型、构建及独立审查通过；修复版本尚未进行 Chrome 复验。尚未发布、合并或执行生产操作。

## 用户确认的分工

AI 只提取人类 Markdown 中的生物与自动化规则，并选择工具已实现的能力、填写参数。固定执行代码由项目维护；不让 AI 编写 JavaScript 宏。原生 Activity 保存 DC、伤害、资源和 HP；模块负责召唤、回合触发及已实现的状态分支。

本地 Intake 统一走 DS API 的 `deepseek-flash`，已通过官方模型目录与文档核对为 DeepSeek V4.1 Flash。当前本地配置默认 low 推理、Responses/json_object；不是 Luna OAuth 桥接。Luna Max 是受委派的浏览器验收操作者，不是 Intake Provider。凭据只从既有外部秘密配置读入内存，用户环境仅保存文件路径引用，不复制 Key。

## 实现

- 闭合版本 2 能力选择数据：save-summon、turn-start-area、staged-corruption、threshold-ward、ward-break，以及来源明确的自身回合传奇资源恢复。
- 编译器校验精确来源、feature、参数、引用和正式 Item 身份，生成固定薄入口。未知字段、代码、路径或能力拒绝；旧式人工审核脚本包保持独立，不允许 AI Provider 返回该格式。
- 模块验证已导入命令字节、hash、完整上下文和 Actor 绑定后启用；只按已启用且重新验证的数据恢复，不执行 flags 中的任意代码。
- “关闭面板”保持运行；“停用自动化”持久禁用并作废待选格，异步世界写入边界重查 live 状态。
- 回合次序使用 `combat.turns`，正确处理本轮尚未行动的自身回合、目标下一回合结束，以及 Combatant 创建顺序不同的情况。
- 守护以真实 DamageSummary 伤害项合计，治疗不抵消触发资格；保持治疗、临时 HP 与最大 HP 语义。unlinked Token 状态使用其 synthetic Actor，蓝图不被改写。
- 修正生成警告的闭合诊断路径；正式生成失败不再把空对象送给 AI 并产生误导的“全部字段丢失”意见。

当前执行器只支持 Foundry 14.364 / dnd5e 5.3.3 / core。V12 执行适配未实现，不声称两版共用当前运行代码。

## 真实来源与产物

原始来源：`docs/examples/晶血龙兽与月石晶体-人类写法.md`。

原始 SHA-256：`58b2f10e7f9ce3650082e87eff2f841b4638f5ccb31517f74b582ecfcbbd8349`。

本次真实 DS 产物：`obsidian/dnd数据转fvttjson/output/human-crystalbleed-ds-fixed-20260914-c/`。A 轮实际提取后暴露诊断路径问题和腐化 staged 标记；B/C 使用独立、绑定来源与父报告 hash 的反馈，由 DS 修正 IR，未手改 Actor JSON。

C 轮两只 Actor 的来源审核均 accepted；DS 约 20 秒返回六项能力配置及传奇资源池，工具正式编译后独立配置审核 accepted，整包 ready_for_gm_review。

- 龙兽：HP 176、生命骰 14d12+42、AC 19、huge、15 个能力。
- 晶体：HP 15、无生命骰、AC 17、medium、3 个能力。
- 共用腐化 marker，齐射成功/失败均召唤一只，原生伤害与豁免参数不重复写入宏。
- 包逻辑 hash：`cc85c7c875a4e35b2682c5f2a04755bf749ba0c80275c71fd8bd0e95c48bbc7b`。
- ZIP SHA-256：`0566a9ce2cccb8da1019550976dc3ebf721cad818867c2f9f250960241f13436`。

两份正式 Actor 执行 `verify:actor`，warnings/sourceIntegrityErrors 均空；当前编译器重新核对已保存配置与入口字节一致。来源未知的持续时间、数量上限、召唤者死亡等仍保留 GM 裁决。其他未选能力仍使用原生/GM流程。

## 机械证据与静态复核

- 核心安全入口：337 tests / 1487 assertions PASS。
- Forge 模块：224 tests / 2181 assertions PASS；其中固定 runtime 13 tests / 112 assertions。
- typecheck:all、typecheck:packages PASS。
- architecture:verify PASS；anti-overfit 21 sources PASS。
- AGENTS 31 文件、handbook 26 项 review/build/check PASS。
- 同一独立 reviewer 已确认数据/凭据边界、回合次序、异步停用边界及文档修正，最终静态门禁 PASS。

候选模块仍为未发布 0.3.0，ZIP SHA-256 `72f64c0dad5d2fbab2956511a3c47d6ca36ce8063f6fda648023770e53dfe908`。已安装精确 server-mirror 模块目录并回读七个文件 hash；安装期间 Foundry 停止。

## 本地运行验收

委派 `/root/luna_mirror_acceptance`，角色 Luna Max；只操作外部 Chrome 与精确本地 cor-cotn 世界。一次 Chrome/Foundry 窗口最多 25 分钟，检查真实 DS 包导入、原生齐射召唤、独立 HP/先攻、晶体回合戳刺、刷新恢复与停用，并清理本次对象、恢复基线、停自有进程。

父代理不持续查询代理状态、不运行监控任务，等待其完成后返回报告。真实 AI 全链在 CLI 运行，浏览器使用同一已审核产物做导入和运行；不将其写成浏览器重复执行了全部 AI 阶段。

### 第一轮与后续修复

Luna第一轮窗口为10:49:37至11:10:11，约20分34秒。外部Chrome预览通过，但C包的空图片在原生Actor创建时变为`systems/dnd5e/icons/svg/actors/npc.svg`，严格回读因比较空值失败。原生探针复现；所有测试对象清理，283 Actor、90 Macro、64 Scene、10 Combat、996 Chat及完整ID基线恢复。报告保存在`.pui/fixed-luna-runtime-report.md/json`。该轮战斗行为均NOT_EXECUTED。

父代理随后修复导入副本的原生NPC缺图默认值，未改正式Actor JSON，显式图片仍严格核对。另发现C的`use`拼写导致次数丢失；validator现在拒绝该字段并验证`uses`。真实DS修正后，D审核进一步发现旧`每日`到`perLongRest`的映射错误；现保留day/lr/sr/dawn差异，严格拒绝null、数组period和多字段冲突，固定ward-break还要求正式native计数器与消耗1。

E包目录为`obsidian/dnd数据转fvttjson/output/human-crystalbleed-ds-fixed-20260914-e/`；逻辑hash `f0ca6b389edf1a3c37aaf96fc02e0ad87729568df45f0a1c0bf7f8867eb5909f`，ZIP SHA-256 `ba7d796a3b32018e3714138b1caa523375083ed358fcaacf12bc71ad6f0fd469`。E的绯晶拒绝已具有max2、day恢复与原生itemUses消耗1；两份来源verify无warnings/sourceIntegrityErrors，DS独立配置审核accepted。

本次增量核心343 tests/1512 assertions、模块226 tests/2188 assertions、类型与anti-overfit23 sources通过；同一reviewer复核关闭新增parser/周期和图片适配阻断。最新未发布模块ZIP SHA-256为`c7ca00fbff247a788f6b5b7e0d6ddd2d2e1114b441758152e83be46ff0de1dbd`，已在停止状态安装并回读七文件。

同一 Luna Max 的 E 复验已返回 PARTIAL：原生导入两只 Actor、固定入口以及显式启用通过；六项规则与守护完整状态已在外部 Chrome 查看。战斗准备脚本漏 await，未创建 Token/Combat，召唤、戳刺、状态和刷新行为均 NOT_EXECUTED。已停用并清理本次对象，恢复场景和暂停状态，关闭测试页并停自有进程。第二轮仅有数量与本次对象清理记录，不声称完整世界 ID 集合再次核验。

第二窗口 11:25:23–11:38:03，约12分40秒，超过委派的8分钟上限；两轮累计约33分14秒。服务日志首条11:27:23，监听11:30:29，不能将全部超时归因于启动。父代理未轮询代理状态，但时间控制未达到要求。报告及纠正记录位于 `.pui/fixed-luna-retry-runtime-report.md/json`、`.pui/fixed-luna-parent-audit.md`；已准备含正确 await 的独立 fixture，尚未执行。按照项目30分钟限制，额外运行须取得明确授权，当前不重启 Lab。生产、V12、长期会话和多客户端接受均未执行。

### 第三轮审查与修复（2026-09-14）

用户另行授权第三轮，报告位于 `.pui/chrome-encounter-20260914-round3/`。真实 E 包导入、成功/失败齐射召唤、回合戳刺与零 HP 停止、一次绯晶拒绝及守护恢复已有运行证据。父代理重新比对 baseline/cleanup 的 Actor、Macro、Scene、Combat、ChatMessage 完整 ID 集合，五类一致，场景、暂停和原 Combat 轮次恢复。运行至清理耗时约 33 分 14 秒，超过 25 分钟委派窗口及 30 分钟上限，时间门禁 FAIL，不以行为通过抵消。

父代理核对原始证据发现两项报告遗漏：龙兽蓝图 176 HP，fixture 场上 Token 却为 152；失败目标同时有随机 ID 的 Forge Dazed 和 `dnd5edazed000000`。不能据报告摘要判定完整验收通过。

- HP：锁定 dnd5e 5.3.3 的 Token 创建逻辑使用世界自动掷 HP 设置，正式 Actor 蓝图仍是176。用户确认蓝图显示176即可、Token重掷属于预期行为；撤回本次新增的 autoRollNPCHP 覆盖、fixture HP强制相等检查及对应测试，不再将152判为待修缺陷。
- Dazed：镜像 DAE 的 `reconcileActorStatuses` 将随机 ID 状态作为输入，补建静态 ID 状态；源效果停用后又删除 DAE 派生状态，解释原始快照中重复及消失。固定状态创建需使用原生状态工厂、静态身份和 `keepId`，避免重复，并保护已有其他来源状态。

剩余运行门禁包括修复后的状态兼容、守护真实伤害与耗尽削弱形态、重复腐化增加力竭、停用后刷新；本次代码修复不声称上述已通过。后续 Chrome 操作按 `chrome-delegation-dev` 独立 Luna 任务回传流程执行。

撤回 HP 干预前的历史修复验证：`bun run test:fvtt-json-forge` 231 tests / 2246 assertions PASS；模块 typecheck、build、release 及 verify:release（1 test / 9 assertions）PASS；fixture 语法检查 PASS；handbook 26 项核对/build/check PASS；独立 reviewer 无新增实质性阻断。回归包含 DAE 静态身份派生模拟、本包状态到期后重施及新到期、外来状态保护、工厂等待期间停用、NPC 自动掷 HP 正反对照。原生/DAE 替身测试不是 Chrome 实测。本地新候选 ZIP SHA-256 为 `29530d686fa6a6a10ef12b4984b4b81c0d900c2257078e1c695d8db8edcc67d5`，未安装到 Lab；旧 E 包及正式 Actor JSON 保持原样。

当前候选仅保留 Dazed 修复；上段 ZIP hash 和测试数量是撤回前记录，当前结果在下方补记。

撤回后验证：Forge 230 tests / 2235 assertions PASS，模块 typecheck/build/release PASS。当前 ZIP SHA-256 为 b54f8c4399029788a6148ab776e12e35a68cfaef87592b6b06981479566be167，未安装或发布。后续复验核对 Actor 蓝图176；不要求随机化后的场上Token同为176。


### 合并接受范围（2026-09-15）

用户明确授权 commit 并 merge master，同时更新工具说明，不包含 push 或生产部署。当前候选 b54f8c4399029788a6148ab776e12e35a68cfaef87592b6b06981479566be167 已安装本地 mirror。专项守护实际伤害和耗尽削弱 PASS；重复腐化因缺相邻快照收紧为 PARTIAL，用户明确同意留待独立状态设计再明确。窗口26分24秒，25分钟门禁FAIL、30分钟硬限PASS；清理报告通过。原证据在 .pui/chrome-ward-corruption-20260915/，不把忽略的本地证据目录加入发布。

工具说明区分通用MD输入与有限固定能力库，保留Dazed专项、浏览器完整AI生成、生产和长时验收的未执行边界。本轮不为已接受的腐化缺口重启测试。
