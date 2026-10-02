# Weapon Mastery & Properties：CoTN 批次验收

主环境是 `server-mirror/cor-cotn`，锁定 Foundry 14.364、dnd5e 5.3.3、Midi-QOL 14.0.11，并保留世界原有模组。原生无 Midi 路径单独记录，结束后恢复配置；不能把精简环境结果代替 CoTN。通用检查选择见现行 [开发反馈闭环](development-feedback-loop.md)。

## 固定候选并进入批次

1. 在候选 worktree 显式运行 `bun run build:weapon-mastery-properties`。构建生成 `dist/build-identity.json`；install、patch、verify-artifact、verify-install 都只校验固定产物，源码或配置变化时先重建。`bun run verify-install:weapon-mastery-properties` 返回安装树、运行脚本与 buildId；仍为 `runtimeVerified:false`。
2. 由 Foundry Ops 核对 30001 PID、可执行文件、数据根、世界、版本和 owner/占用；被他人使用时协调。30002 和生产不在本流程写入范围。
3. 普通 Chrome 操作沿用当前项目的 `chrome-delegation-dev` 与宿主要求，默认独立 `gpt-6.1-sol / medium` 执行任务，同一模块批次复用执行者；主控及其他角色保持用户当时配置。执行者核自身实际模型、effort、权限与目标，主任务收简短收据并复核证据。历史 Luna/max 收据保留原身份；不宣称已验证速度或总 token 收益。独立任务须满足宿主创建授权和实际权限；不能把任务隔离当成浏览器或数据隔离。
4. 入批记录全部启用模组 ID/版本、相关设置、客户端 `game.modules.get('fvtt-weapon-mastery-properties').api.buildId` 与安装身份。环境发生变化才重取完整基线，单用例保存必要差异。

## 持久 helper 与正式交付

源码为 `foundry-modules/fvtt-weapon-mastery-properties/e2e/fixture-macro.js`，纯判定器为相邻 `evidence.ts`，GM 界面为 `src/e2e-harness.ts`。它们随正常模块构建编入浏览器入口。主持人启用 `Weapon Mastery GM E2E harness (development only)` 后，通过 Token 工具栏试管按钮打开。按 `Scan official dnd5e weapons`、`Create / resume batch`、`Prepare task scene and Combat` 完成准备；用 `Open task attacker sheet` 打开测试角色。重载后从批次列表恢复，无需重新交付源码。独立完整宏入口保留兼容，初始化宏不能被临时检查代码覆盖。

本地文件工具负责读取授权的源码；Foundry 的脚本宏或受支持导入功能负责保存、执行测试程序；Chrome 负责操作 Foundry 页面。浏览器直接打开本地 JS 不是准备步骤。先验证完整工具在 Foundry 内的保存和重载恢复，再扩展玩法测试；初始化宏与临时检查命令使用不同入口。

历史工具拒绝覆盖浏览器访问该本地 file URL 及同一访问的绕行，保留此事实与边界。本地文件读取和哈希核对已经成功，不能把该拒绝写成整个任务无法取得源码；也没有证据证明用户重新上传会解除浏览器限制，因此撤销“重新传附件才能继续”的前置要求。应用内保存/导入操作须按当前受支持工具及实际拒绝范围核实；未验证前不宣称交付已完成，不重复被拒操作或用其他通道规避它。只有确实缺少用户输入时才提出具体请求，不能转为逐项手工建场地。

正式攻击前先核对客户端构建身份，以及一次 reload 后能够恢复已有批次。只存在源码文件、按钮或旧 Macro 文档不算真实恢复成功。

## 批次与用例入口

| 入口 | 用途 |
| --- | --- |
| `ensureBatch(options)` | 建立或按精确 ledger/runId 恢复批次；提供 expectedBuildId 与可选 expectedSettings，核对身份和归属 |
| `prepareCombat({ledgerMessageId})` | 激活任务场景，创建或恢复带准确场景关联的任务战斗；只包含本批棋子 |
| `adoptBuild({ledgerMessageId,expectedBuildId,receiptsSaved:true})` | 旧结果保存且没有未完成用例后，显式接纳实际加载的新构建；保留对象和原证据身份，受影响用例仍须复位重测 |
| `resetCase({ledgerMessageId,scenario})` | 复位任务所属状态，核对前一 workflow、效果和当前回合 |
| `runCase({ledgerMessageId,scenario,source,request})` | `ui-activity` 登记真实 UI 用例；`runtime-api` 调用公开 use API，明确尚需完成的 UI 步骤 |
| `snapshot({ledgerMessageId,scenario})` | 读回真实场景、Combat、资格、消息、HP、效果及诊断台账 |
| 面板 `Load selected saved receipt` | 选择既有批次与规则后，从精确台账只读载入已保存收据；不重导已关闭用例，也不修改旧构建身份 |
| `checkpointVex({ledgerMessageId,observations})` | 首击应用伤害后立即固定攻击卡、实际扣血、攻击者新 Vex 效果和 ID；返回 `SAVED` 才进入第二击 |
| `prepareVexNext({ledgerMessageId})` | 第二击前核对原效果、同一攻击者、目标与选中的目标 Token |
| `recordVexPreRoll({ledgerMessageId,observation})` | 掷骰前记录游戏对话框实际提示的优势来源和所选模式；`STOP` 时停在本项 |
| `exportReceipt({ledgerMessageId,scenario,observations})` | 可重复保存中间证据；完成后以 observations.closeCase=true 关闭已终止用例，未知字段不能猜填 |
| `reconcileCase({ledgerMessageId,scenario,isolationReason})` | 核对中断或未完成用例；已终止可复位，无法确认结束则隔离整个批次并返回 requireNewBatch |
| `cleanupBatch({ledgerMessageId})` | 全部用例完成后按 ID 与归属清理任务对象 |

兼容原 `create/registerCombat/captureChatMessages/cleanup/finalize` 入口。真实武器 UUID 从锁定系统或正常世界内容取得，不猜 ID；家规参数按已配置规则提供。批次保留场景、Actor、Item、Token、Combat 和完整 helper，用例间复位；新增规则沿用批次。

Vex 复位时，工具先核对当前 Canvas 场景、任务 Token 的 ID、Actor 和归属标记，再通过 Foundry 14.364 的公开 Token 图层操作控制唯一任务攻击者、选择唯一任务目标；若入口不可用，仍以实际读回为准。首击启动 UI 用例前，核对面板 Snapshot 中 `sourceSelection.matches=true`、`controlledTokenIds` 只有本批 `sourceTokenId`，以及 `targetSelection.matches=true`、`selectedTokenIds` 只有本批 `targetTokenId`，并记录 `paused`。标记 Combat 行的显示名称不足以证明游戏用户实际控制了攻击者或选中了目标。工具在 UI Vex 启动时会拒绝错误的攻击者或目标选择。若测试期间调整世界暂停状态，登记原值并在本批收尾恢复。

Vex 优势测试场地须让攻击者与目标真实互相看见，否则 Midi 的不可见优势/劣势可能抵消 Vex，净模式呈“常规”。新批次夹具显式开启任务场景的明亮全局照明，并给任务 Token 60 尺视野。已有批次不会因源码更新而自动改变；对已有任务场地修订前，核对精确批次、场景、两枚 Token 的归属与当时 HP/效果，通过 Foundry 文档 API 修改后读回视线状态，再从原首击检查点继续。若窗口已列出 Vex 优势来源但净模式为“常规”，如实记录两种来源并停在掷骰前，不能把普通单骰判作 Vex 失败。

面板摘要的 `status=Observed` 只表示 Snapshot 已读回；判断用例是否可以复位、继续或放弃，应看 `caseStatus`、`batchStatus`、`activeCase`。这些字段来自台账状态，不能把摘要的操作状态当作用例状态。

正式 reconcile 若返回 `isolated`，短摘要应直接保留 `requireNewBatch`、`retainedIds` 和 `reconciliation.pendingAttacks`；先核对这些字段，再决定新批次与之后的精确清理。若 Copy last 后系统剪贴板哈希仍与旧收据相同，不要把旧内容另存为本次隔离收据；可保存屏幕上这份短摘要，但须标明它不是完整原始 JSON。

使用表单内的 Activity 时，先核对精确 Item/Activity ID、按钮实际可见位置以及点击坐标上的顶层元素。9 月 26 日曾发现 Vex Activity 元素虽已连接且带 `item-action`，中心点却被下一件 Deadly 武器的标题盖住；这种坐标不能用于 Vex 点击。可仅调整表单展开或滚动状态，再重新核对坐标与目标，避免重复误点。若确认点击真实 Activity 后仍没有新卡，先比较点击前后的聊天消息与攻击者模块台账，再看 `weaponUseGate` 中武器是否嵌入、当前用户是否有权限、是否带 Item Macro，以及攻击 Activity 的 `canUse`。这些只读字段用于缩小入口故障范围；即使均为可用，也不能代替一次真实攻击卡。

Vex 首击在真实伤害卡点击 Apply 后，立即使用面板的 **Vex: save first-hit checkpoint**。工具把攻击编号、卡片、实际扣血与攻击者身上的新效果 ID 写入台账；返回 `SAVED` 后，保存完整收据并核对文件存在。浏览器正常下载时点 **Download last JSON**；本地 Chrome 若把 Blob 链接打开为标签而不保存文件，可点 **Copy last** 一次，从本机标准文本剪贴板读回 JSON。先在内存中核对 runId、scenario、构建与关键收据字段，再写入任务证据目录并读回哈希；不要把完整 JSON 输出到对话或在浏览器里展开。实测 Browser Use 的 `tab.clipboard.readText()` 对此路径曾返回空，不能把它当作 OS 剪贴板无内容。不能保存未知剪贴板内容或仅有的页面摘要；文件不存在时不能勾选 Previous receipts saved。随后使用 **Vex: check target and effect**。打开第二击游戏对话框后、掷骰前，把界面实际提示写入 observations 的 `vexPreRoll`：`targetActorId`、`effectId`、`offeredAdvantage`、`sourceLabel`、`selectedMode`（`advantage` / `normal` / `disadvantage`），执行 **Vex: record dialog before roll**。只有 `READY` 才掷骰；随后记录攻击卡、实际骰子和效果消费，导出并保存最终收据。选择“常规”得到的单骰不能断言 Vex 失败；前置检查点缺失时判 INCOMPLETE。Sap 仍在首次效果产生后、下一击消费前导出中间收据。观察尚未完成时保持用例 active，不能启动下一项。源码中的预期构建 ID 必须来自固定产物；旧批次缺少身份仍为 INCOMPLETE，不靠相同版本号补齐。

若首击扣血有证明而检查点因 `attacker-vex-effect-missing` 返回 `STOP`，保存完整收据后停在此处，不进行第二击。当前候选在 Vex 用例开始时只对本地 GM 打开有界伤害证明诊断；收据的 `diagnostics` 只保留阶段、原因码、攻击/消息编号及目标 HP，用于区分 `updateActor` 未带证明、状态门槛、消息关联和证明校验失败。诊断不会补发效果或放宽校验。未完成攻击若仍在模块台账中，不强行复位同一批次；依正式 reconcile 的结果保留或隔离。

同一世界只运行一个可写用例。未完成的对话框、伤害应用或 workflow 不能被下一项复位覆盖。中断用例恢复为待重新执行，不补记成功；无法确定结束的状态保留证据并隔离，另建任务所属对象，批末统一清理。未知或他人的对象不修改。

取消预约的当前权威状态在效果 `flags.fvtt-custom-conditions.weaponEffect.reservation`，不是攻击历史 `source.moduleLedger[].reservations[].ticket`。未掷骰正常取消后应同时读回：攻击 step=cancelled、原效果仍启用、当前效果 reservation 已移除、HP 与攻击骰消息不变。历史台账可以保留当初的 reserved 票据，已提交攻击也可以保留 started 票据；单凭历史票据不能判定当前预约残留。核对效果 instanceId、revision 和 attackId 后再作结论，不为改变历史票据而修改运行逻辑或重复测试。

## 玩法及判定

Fatal/Deadly验收分别记录“攻击是否重击”和“伤害是否选择重击”。在dnd5e伤害配置窗提交normal会主动关闭本次伤害的重击，即使攻击是重击、窗口此前显示2d6或critical按钮存在。验证重击特性必须提交当前伤害窗口的critical动作，并从最终骰子/卡片读回critical；不能查看critical按钮样式后点normal再把普通伤害判模块FAIL。攻击检定的normal按钮则表示普通攻击模式，含义不同。原始错误操作保留并标明前提不成立，只重试受影响用例。

Cleave 开始前要求 Snapshot/面板 `cleaveGeometry.legal=true`。两个候选距离来自实际网格 `measurePath`；Foundry14.364 的 diagonals=1 是 EXACT（对角一步约7.07尺），不是等距5尺。原中型攻击者与两中型目标的直角摆位不能在该设置下证明5尺Cleave。Reset case现对Cleave使用大型2×2任务攻击者，来源(400,400)、主目标(600,400)、次目标(600,500)，最近占用格中心距离均5尺，棋子不重叠；武器reach和世界设置保持实际值。其他用例复位会恢复来源中型1×1、(500,400)。超距或测距缺失在攻击前失败关闭，不能等攻击完再补几何前提。

优先复验新版 Vex/Slow 的 **Midi 卡片内 Apply**。必须通过原 UI 回归证明正常伤害卡与实际 HP 更新有关联；API 成功不能替代此 UI 故障回归。Vex 检查另一击对同一目标的优势来源和消费，Slow 检查速度与本次效果，Push 实际选定合法落点并读回位移。

随后覆盖共十一项规则：Cleave、Graze、Nick、Push、Sap、Slow、Topple、Vex、Deadly、Fatal、重击流血。重复计算和边界用低层/正式 API 批量覆盖；保留不同交互机制的 UI。原生与 Midi、玩家与 GM 的不同业务路径分别记录，不做全排列。

- 前提成立、观测完整而预期结果不存在：FAIL。
- 前提真实未成立：PRECONDITION_FAILED；没有执行：NOT_EXECUTED。
- 观测或本次因果关联不足：INCOMPLETE；不能据此宣布代码失败或通过。
- 正确结果且来自本次动作：PASS。内部 ledger 用于诊断，旧效果不能冒充新效果。

保存 exportReceipt 返回的 JSON 并核对文件确实存在后，从仓库根运行 `bun run verify:weapon-evidence <receipt.json>`。面板只展示双方 HP、效果 ID、攻击编号与原因，不在浏览器里展开或复制大段原始 JSON。退出码 0 只表示该文件提供的用例通过，1 表示存在 FAIL，2 表示前提/证据不全或输入错误；未提供的规则继续为 NOT_EXECUTED。该命令只读取收据，不访问 Foundry，也不把输入值本身当作真实性证明。

对于同武器 Midi Vex 两击用例，CLI、面板导出和 Load selected saved receipt 使用同一个只读关联器：用已保存首击检查点、掷骰前观察、唯一第二击原生消息及其 Midi 卡、预约和效果读回来补全第二击身份，无需再手填 `nextAttack`。关联结果在 `evidenceAssociation` 中说明；第二击命中时还要求匹配的实际伤害证明和新的 Vex 实例。记录歧义、证据缺失或混批保持 INCOMPLETE；已证明第二击造成伤害但没有新效果是 FAIL。关联器不改写原始文件或历史构建身份，未提供的规则与清理仍独立记录。原生或换武器路径暂不自动关联，继续要求明确观察；这项工具检查不代替其真实运行验收。

不调用内部 settle、直接写效果或伪造扣血来制造成功。配置使用正式 API，战斗使用正常 Activity/Midi 链路。API 与 UI 入口写入同一结构化收据，清理状态独立于玩法结果。Midi 激活时使用其公开 completeActivityUse，原生模式使用 WMP 公开 use；Nick 的两次 Light 武器使用仍走真实 UI。

## 批次收尾

CLI与源码中的共享关联器还支持已保存的Midi Cleave非重击、单一基础伤害命中：结合唯一父子台账、原生攻击与Midi卡、双方真实伤害证明、稳定距离和当前回合额度，推导childAttack。原生子攻击消息不必重复带parentAttackId，但子台账和伤害卡必须明确一致；重复子攻击、错目标、缺证明或复杂伤害公式保持INCOMPLETE。正属性修正错误加入子伤害时必须FAIL。已有手填childAttack不会被覆盖。此关联不重写原始收据，也不证明未执行的原生/多客户端分支；代码尚未安装时只使用CLI离线回放，不能声称客户端已有新分类行为。

区分“证据分类失败”和“操作抛错”：Export receipt可以正常保存并关闭一个FAIL/INCOMPLETE/PRECONDITION_FAILED用例，只要攻击确已终止。关闭后以独立Snapshot的实时ledger.case状态和activeCase为准；receipt.after是关闭前保存的玩法快照，其activeCase不能证明当前仍开着。Reset通过显式删除上一轮case的检查点字段避免Foundry递归flag合并把旧攻击/旧build混入新收据，外部原始文件始终保留。

每个用例先保存证据，再复位可重复使用对象；暂停时恢复原活动场景、Combat、暂停及登录状态，列明保留对象。全部验收完成后恢复原场景/Combat，登记任务聊天卡，调用 cleanupBatch；保存逐对象不存在读回后，`finalize({ledgerMessageId,externalReceiptSaved:true})` 最后删除台账，再清理已核对的 helper/操作 Macro。已授权的精确任务对象清理无需反复确认。测试源码和有价值的外部证据保留。

已通过且未受影响的路径不机械重跑；证据保留原构建身份。共享桥接、依赖、设置或判定器改变时复验对应路径。速度配对实验记录准备、首次结果、整批、失败重试、人工介入和清理时间；没有实测不能宣布提速幅度。
