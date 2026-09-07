# 2026-09-06 项目健壮性修复

状态：ci_validated_candidate。2026-09-07 用户明确授权精确暂存、完整 CI 和候选分支提交后，完整 ci:verify 已通过，包括新增 AGENTS 的 Git 门禁。来源语义与限定独立复核通过。基线 master 333c23ca；授权不包含合并 master、push、生产写入或旧 worktree 清理。下文保留历史失败证据，当前结论以末尾授权提交记录为准。

## 范围与完成标准

| Finding | 修复目标 | 状态 |
|---|---|---|
| F01 | 合集同名/规范化碰撞在写入前拒绝，来源与下载一一对应 | implemented / regression PASS |
| F02 | Item 护甲数值纳入 canonical 验证；含糊机制不得静默 accepted；保留 source | implemented / regression PASS |
| F03 | 英文 Actor 来源类型与标题恢复限定保真，负向验证可检测丢失 | implemented / regression PASS |
| F04 | 覆盖率只计仓库源码，拒绝临时 bundle 污染，不降低阈值 | PASS：生产行84.41%、函数86.14%；关键入口无缺失 |
| F05 | Web 重启孤立任务诚实结束为中断，原子写入状态，显式重试 | implemented / scoped verification PASS |
| F06 | Ruler 为根说明唯一生成者，GitNexus 索引不写 tracked 说明 | implemented / scoped verification PASS |
| F07 | 测试 CLI 子进程有界取消及回收 | PASS：完整CLI21项；完整覆盖率2589项；后台Job/全局mapper泄漏及构建子进程已修复 |
| F08 | 未声明的内容来源/许可不伪装为 SRD | implemented / scoped verification PASS |
| F09 | CLI v12 / Web v14 的入口默认与支持说明一致 | implemented / scoped verification PASS |

机械验证：受影响包/应用聚焦测试、类型、架构、完整 ci:verify。真实验收：正式 CLI/workflow/Web 重新执行审计来源，逐条比对结果；+3→99、类型删除等负向变异必须被拒绝；重启任务无虚假 running、无自动重放。

最初的 F01–F09 修复后，用户续作授权了旧候选的审查与文件级整合：Battlefield、Species V12、Moonshark 已进入本 worktree，原始工作区保持原状。子代理分工与最终复核见末尾记录；Git 历史尚未合并到 master。

## 执行证据

- 2026-09-06：创建唯一 sibling worktree codex/20260906-155332-project-robustness，依赖 frozen-lockfile 安装完成。主工作区既有 AGENTS/.claude/cache 保留。
- 原审计反例：2 个同名 Item → 1 个文件但 succeeded=2；Item magicalBonus 3→99 verifier accepted；White Tusk 类型为空且恢复标题丢失；restart running/active=0；LCOV 把约7万行临时 bundle 计入源码。
- 实现闭环：F01–F09 最小修复已落地。最终聚焦42 tests / 177 expects通过，Forge运行边界191 tests通过。F04统计使用TypeScript官方配置/AST API，按当前仓库源码清单排除临时bundle、声明、仅类型和纯re-export，并报告缺测源码；保持84% lines / 85% functions阈值。完整门禁仍未通过。
- 来源验收：正式 CLI v14/core/icon-off 生成 White Tusk，类型 humanoid/subtype orc, shapechanger、HP52、CR3、暗视60ft、被动察觉18（wis+3、熟练+2、额外passive+3）、6个来源条目、单次短休/长休恢复和消费均核对。变形具体执行、特殊暴击和限定施法仍为字面说明，不据此宣称完整战斗自动化。
- Web：隔离 localhost18765 真实粘贴→自动识别→转换→下载。同名不同加值批次整批失败、输出为空，步骤和交付区显示失败；不同名批次成功2/2，rare、baseAC2、magicalBonus2/3、未伪造来源许可。逐文件下载与ZIP两条entry哈希分别一致：CA92B472DC674A6D9A33A210243A09F3AB85FBD20ED0B31309F41463F1241427；22F109EC1F04F6B684FD6F10B2CB66AFE1E6034C8AD063131FE90B8082B36C9F。
- Web恢复：独立进程写 running 后退出，新服务读取为 failed/JOB_INTERRUPTED，无自动重放；原 succeeded任务和2文件保留。原子替换故障用临时测试目录模拟，失败不发布内存成功状态，临时写入文件清理。
- 子进程收尾：token-review自有30秒watchdog及finally回收，卡住的测试进程回收回归通过。最终重跑另暴露AI Item Intake两个Bun.spawnSync测试会阻塞测试层timeout；沿26940→37244→33408→29716→32108→11336→16372核对本轮CI进程树后，仅停止卡住的26940，并将两例改为Bun.spawn+现有20秒collectSubprocess。保留该次失败日志，不用聚焦通过抹去失败。
- 本地 Foundry/生产/长时验收 NOT_EXECUTED；本轮Web的独立临时cwd没有cn.json/spells.ldb，Web证据仅用于不依赖它们的物品合集；真实Actor来自完整仓库正式CLI。

## 最终验收结果

| 检查 | 结果 | 精确证据与限制 |
|---|---|---|
| AGENTS、测试环境与隔离 | PASS | 最后一次ci:verify前置检查通过 |
| 生产/全仓/packages/apps/modules/tools类型 | PASS | 最后一次ci:verify全部类型检查通过 |
| 架构依赖与循环 | PASS | 11,189 modules / 12,241 dependencies，无违规，cycles退出0 |
| Session Monitor构建 / CLI分层 | PASS | 1/1构建测试；20/20 CLI、96expects |
| 最终完整ci:verify | FAIL | 2,399 pass / 1 fail / 15 filtered / 12,645 expects；PDF extract-only CLI在30秒超时，整个instrumented suite运行120.25秒 |
| 覆盖率 | FAIL（前一轮证据） | 前一轮2,400测试全过后，71572/85475行=83.73%、7384/8607函数=85.79%；38个缺测源码含关键server/index.ts。最后一轮因PDF测试失败，aggregate未运行coverage gate，不能将最后LCOV视为可信新基线 |
| 健壮性聚焦 | PASS | 42/42 tests、177expects；包括实际needs_review结果的Forge Item armor投影 |
| Forge运行边界 | PASS | 191/191 tests、1,986expects；不等于真实Foundry世界运行 |
| 反过拟合/卫生/锁定引用/Web构建/Actor smoke | PASS | 最后代码状态独立重跑；414sources、1302tracked paths、dnd5e5.3.3 ok、build成功、6个来源条目/0 verifier warnings/0 network |
| 人工来源和Web交付语义 | PASS（本轮样本） | 上述White Tusk与两份盾牌、碰撞拒绝、ZIP一一对应和任务重启；UI最后未变，后续协议/负向解析补丁用真实workflow回归确认 |
| 独立代码复核 | PASS | 同一Sol reviewer确认所有提出的同范围正确性问题已修正 |
| Foundry/生产/长时接受 | NOT_EXECUTED | 没有运行中的世界操作或生产写入 |

最后一次PDF超时后检查没有本worktree/extract-only对应的残留Bun进程。该测试仍使用Bun.spawnSync；本轮未进一步扩大到全仓CLI subprocess统一整改，也未把此前全过的测试运行冒充最终通过。

本机日志（Temp可能被系统清理，核心结论已保留在本文件）：
- 最后完整CI：`%TEMP%/fvtt-robustness-accepted-candidate-ci-20260906.log`，文件名不代表验收通过，实际exit1。
- 前一轮全测试通过但coverage失败：`%TEMP%/fvtt-robustness-reviewed-final-ci-20260906.log`。
- 最后聚焦：`%TEMP%/fvtt-robustness-last-focused-20260906.log`。
- 最后补跑后置检查：`%TEMP%/fvtt-robustness-closure-postchecks-20260906.log`。

## 独立复核与范围

- 最终复核发现并修正：Forge Item armor误归Actor命名空间；increase/提高/提升/增加等含糊AC措辞漏审；来源缺省subtype时输出凭空追加未被拒绝。
- 继续复核发现literal-only armor使用泛化unresolved路径，已改为item/armor/unresolved/<index>。四个实际needs_review workflow结果经Item协议投影验证sourceField=item.armor。同一复核者最终结论PASS，无剩余同范围正确性缺陷。
- 子任务运行元数据确认：coverage_repair为luna_worker / gpt-5.6-luna / max；robustness_final_review为sol_reviewer / gpt-5.6-sol / high。两者实际权限均为danger-full-access；只读复核是行为限制，不宣称硬权限隔离。父任务将覆盖率自制解析器收敛为TypeScript API，并完成集成与来源验收。

## 尚未关闭的工作

1. 测试稳定性：先修复PDF CLI的无界同步子进程，并按测试责任范围统一deadline、输出读取和finally回收；固定完整测试通过的最终代码状态，再重建覆盖率。不得用单测复跑通过覆盖最后CI失败。
2. Coverage：排除污染后的生产行覆盖率仍未达到84%；Web server/index.ts缺少LCOV记录。不得降低阈值、排除真实可执行入口或把未导入文件当作已覆盖。下一步应让真实Web启动/停止集成测试产出可合并的源码coverage，并补Web与tools的行为测试。当前比率仅针对已报告生产源码；缺测清单单列，不能当作完整项目覆盖率。
3. Worktree：Battlefield Painter独有6个非merge补丁（ahead7/behind25）、Species的24 tracked dirty/4新文件、Moonshark的10 tracked dirty/4新文件仍待独立审查与候选整合。保留所有原始staged/unstaged状态，本轮未合并或清理。其他已合入旧worktree也未清理。
4. F02/F03是对本次反例和明确支持来源形态的修复，不是任意自然语言的完整机制自动化。来源中复杂变形、限定施法等仍保留字面说明；后续仍需扩展来源完整性矩阵。
5. F05恢复使用现有单进程jobStore；未实现跨进程租约、持久worker、断点续跑。重试由用户重新发起任务，不自动重放AI请求或世界写入。
6. F06修复候选规则，未覆盖主工作区原有GitNexus注入。主master仍333c23ca/ahead3，AGENTS保留原44行增量，索引为空，既有untracked保留。
7. 本地Foundry导入/交互、生产、长时验收NOT_EXECUTED；本轮Web临时服务和页签已关闭，18765无监听。未提交、合并、push、部署。

## 停止点

### 2026-09-06 用户续作：第一次上下文交接

用户明确要求继续剩余工作，沿用本任务候选 worktree；以上结果为上一阶段证据。主 master 的既有 dirty/untracked 和三个原始候选工作区保持不变，未提交、合并、推送或部署。

- CLI 子进程改为并发收集输出、显式 deadline、kill/reap；保留原超时预算。当前公开 `test:cli` 20/20 通过，4.73 秒。CLI 仍作为独立 CI 层执行，不再在 coverage 阶段重复启动。
- Web server 入口可显式启动/停止，实际 HTTP 测试覆盖鉴权、静态资源、错误请求和关闭监听；已通过。客户端补充测试由同一 Luna Max worker 完成，20/20 客户端测试通过，尚待整合后的完整 CI。
- Battlefield 101 个 committed 文件已导入候选，根脚本和锁文件已整合。锁定 FFmpeg 安装成功后 140/140 模块测试通过，构建通过。历史 Foundry/视觉证据不能作为本候选的新 runtime 通过。
- 下一步：按符号影响分析整合 Species 和 Moonshark；保留已有健壮性修复及原候选暂存状态。再做最终类型、架构、完整 CI/coverage、来源语义和适用的本地运行验收。V12 Species 仅静态候选，生产及长时层仍不在本次授权内。

当前不能宣称所有问题关闭。日志位于 `%TEMP%/fvtt-resume-*.log`；旧工作区评审保存在候选忽略目录 `.pui/battlefield-review.md`。

第一次上下文交接已在本阶段完成最小实现交接；第二次按sol-luna-terra-orchestrator停止扩大范围，仅完成当前代码集成、同一reviewer最小修正和验收记录。当前候选可审阅，但不能宣称所有审计问题或完整CI已经关闭。不要从该状态自动发布，也不要把后续coverage/旧候选整合改成降低门禁或批量合并。

### 2026-09-07 用户续作：第一次上下文交接

在原隔离候选继续，未提交、合并、推送、部署或清理旧 worktree。Species 和 Moonshark 候选内容已完成文件级整合；原始工作区的 staged/unstaged 状态保持不变。V12 Species 仍是静态候选，不能宣称运行验收。

- 来源验收纠正 Moonshark 候选中超出来源的独立 Polymorph cast；复杂变形保留 GM 辅助说明。织月者之矛的伤害、目标、豁免和 1–3 次充能消费已有负向验证。
- 修复每日动作仅显示次数、不实际消费的问题：自身资源扣一次，长休恢复，不扣法术位。v12/v14 的 1/3/5 次来源与篡改输出回归均通过；公开健壮性测试 56 pass / 306 expects。
- CLI 公共入口 21 pass。覆盖率改为外部 90 秒 watchdog 的 27 个确定性分片，共发现 285 个测试文件。全部分片测试通过，但合并失败：同一 `species.ts` 在不同 Bun LCOV 中 FNF 为 18 与 47。合并器拒绝不一致数据，当前覆盖率门禁仍未通过，不能沿用旧 lcov 成绩。
- 全仓 TypeScript 与 419 个来源的 anti-overfit 检查通过。下一步只关闭当前验收问题：解释函数覆盖率计数差异，运行后置门禁、最终跨模块复核，更新精确未完成项。新 Battlefield AGENTS 尚未进入索引，完整 `ci:verify` 的 tracked-file 门禁仍待最终发布授权；不得为通过检查自动暂存。

### 2026-09-07 收尾记录（当前权威状态）

候选分支：`codex/20260906-155332-project-robustness`。本阶段实现与离线/来源验收通过；Git 发布门禁与运行时边界单列，不宣称整体发布完成。

| 检查 | 当前结果 | 证据与范围 |
|---|---|---|
| 完整公开覆盖率路径 | PASS | hermetic `test:coverage`：CLI 21/21、instrumented 2589/2589，0 fail；日志 `%TEMP%/fvtt-final-public-coverage2-20260907.log` |
| 生产覆盖率 | PASS | lines 76011/90053 = 84.41%；functions 7848/9111 = 86.14%；阈值仍84%/85%，关键源码无缺失。仍单列未加载的非关键入口，不称100%源码覆盖 |
| 全树TypeScript与anti-overfit | PASS | 最终代码 typecheck:all；418 sources。各包/应用/模块/tools独立配置此前通过，收尾再检查production/packages |
| 指令文件内容预检 | PASS | 30份说明，`runAgentsInstructionsCheck({verifyTracked:false})` 内容/生成一致性检查0errors；这明确不包含Git tracked门禁 |
| 完整ci:verify | BLOCKED_BY_GIT_GATE | 新Battlefield AGENTS未tracked，公开agents:check明确失败；未擅自git add。不得把上行内容预检称为全CI通过 |
| 来源语义 | PASS（指定样本） | 正式CLI生成月鲨9items，AC13/HP126/CR5、啃咬、DC15体质半伤、3次自身扣次/长休恢复、尾击bonus与1d10+@mod对应来源；长矛3黎明充能、DC15/30尺/单目标/2d8每充能/缩放最多3、点亮0次、无独立免费Polymorph cast。复杂变形、每回合重复豁免等保留GM辅助边界 |
| 跨模块独立复核 | PASS | Species跨目标Markdown失效、wrapper未锁版本、Item无效资源值三个反例均修复后，由同一reviewer确认封闭 |
| 本地Foundry / 生产 / 长时 | NOT_EXECUTED | 未导入本候选到运行世界，未部署。V12没有Lab运行证明；Battlefield历史B14用户视觉接受/重复E2E豁免保留为历史证据 |

完整单进程诊断主动推翻了“分片全绿即可”的假设：发现E2E测试污染全局Fireball映射、AI API测试未等待后台Job就清理，以及Spell Resolver构建子进程生命周期缺口。已分别恢复mapper、使用离线fake provider且等待终态、用execFile显式限时/回收。覆盖率入口现在为单进程、确定性全量文件清单和外部120秒watchdog；不再使用跨进程函数计数合并。本任务新建的实验LCOV合并器及测试已移除，未删除既有tracked文件。

整合后的Species：V12 accepted Markdown写入`input/species/v12/`，package写入`output/species/v12/`；V14原路径不变。跨目标修改后两个ledger的Markdown SHA/package logical hash分别匹配。版本专属wrapper在类型及运行时拒绝另一版本。Item uses限定正整数、锁定恢复字段、限制充能与缩放容量，来源正反例通过。

原工作区状态复查：Battlefield HEAD5e7455d仍clean/ahead7；Species HEAD8451d1d仍28条dirty状态；Moonshark HEAD8451d1d仍14条dirty状态。主master333c23ca仍ahead origin3，原AGENTS的44行GitNexus注入及untracked保留，索引为空。这里完成的是候选文件整合，未Git merge，旧分支ahead数字不会因此改变。

当前剩余动作：取得明确发布授权后精确暂存、跑含tracked门禁的完整ci:verify、按意图提交；合入master前必须处理其既有AGENTS与topic重叠，不能stash或覆盖。若用户要求运行时接受，另按精确Lab身份做短时导入/交互；不得用本阶段JSON语义替代运行时。

实际子代理元数据：`coverage_merge`为luna_worker / gpt-5.6-luna / max，完成合并器调查和后续Species wrapper最小修复；`integration_final_review`为sol_reviewer / gpt-5.6-sol / high，三项REVISE修正后PASS。两者session权限均danger-full-access，只读复核是行为限制，不是硬隔离。父任务负责集成、来源比对和整体门禁。

收尾后置检查实际结果：production/packages typecheck、architecture:verify、web:build、smoke:actor:offline、锁定dnd5e引用、仓库卫生均PASS；环境预检与Foundry测试隔离PASS。日志为`%TEMP%/fvtt-closure-*-20260907.log`。最终diff --check无内容错误，主/候选索引均为空，未遗留本轮Bun测试进程。

### 2026-09-07 授权提交记录（覆盖此前 Git 门禁阻挡状态）

用户明确授权：精确暂存本次改动、运行完整CI、通过后提交候选分支；不合并master、不push。197个已审阅路径已精确暂存，没有暂存主工作区或旧候选内容，没有删除既有tracked文件。

完整 `bun run ci:verify` exit 0，日志 `%TEMP%/fvtt-authorized-full-ci-20260907.log`：30份AGENTS tracked/生成幂等/分层通过；所有typecheck、架构、环境和测试隔离通过；Session Monitor build 1/1、CLI 21/21、instrumented 2589/2589，零失败；生产lines76017/90053（84.41%），functions7848/9111（86.14%）；418来源anti-overfit、1425路径hygiene、锁定dnd5e5.3.3引用、Web build、White Tusk来源smoke均通过。首次纳入新文件后的完整门禁没有通过降低阈值或排除测试实现。

来源语义沿用上一阶段同一代码状态的正式CLI/Web对照和独立复核；本提交阶段没有改变产品代码。Foundry交互、生产与长时层仍为NOT_EXECUTED。提交前刷新仅本候选GitNexus索引并检查暂存改动；后续合并master前仍必须协调其既有AGENTS注入段，不得覆盖或stash。
