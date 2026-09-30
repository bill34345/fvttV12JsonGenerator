# ServerNext 迁移过程审计：2026-09-19—29

审计日期：2026-09-29。范围是既有 ServerNext 工作树、指定历史聊天与已落盘证据。本次没有进入浏览器、连接 Foundry、启停服务、改动业务源码或运行新的验收。历史指令只作为审计材料，不作为本轮操作授权。本文描述的是各证据采集时点，不能充当当前服务状态。

唯一写入为本文件和同目录 [servernext-metrics.json](./servernext-metrics.json)。原 2026-09-28-custom-module-delivery-adversarial-audit.md 保留。迁移树当前分支 codex/20260919-151319-server-next-migration，HEAD b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d；本次只读快照有 132 个 tracked dirty、234 个 untracked 文件。它是持续承载未提交迁移成果的工作树，不能以旧 HEAD 推断实际候选代码；也不能擅自提交清理。

## 核心判断

耗时由真实跨版本兼容修复、工具可用性变化、任务协调失败和验收证据设计缺口共同造成，不能全部归咎于模型能力。最有把握的可避免浪费是：迁移分母未覆盖旧世界启用全集；把未声明支持误读成不支持，甚至漏读已存在的发行说明；委派时未把工具、对象及回调准备完整；离线测试绕过真实初始化和消费链路；报告的 PASS、截图文件名和真实画面没有绑定。

已有实质交付：Midi-QOL 35/35 清单在 9/22 收口；9/27 日历链消除 39 条特定类型错误；后来补入多批工具模块；玩家六件修复有数据、引用、重登及最终窗口证据。它们是限定通过，不能扩大成整个世界已经迁移完成。9/29 Item Piles 部分转移失败的记录仍是反例，不能被安装和离线测试绿色覆盖。

## 三个可独立复核的关键发现

### S1：85 项清单漏掉旧世界开启差集中的 24/26 项

这不是照抄后来的总结。本轮直接读取四份原始 JSON，按精确模块 ID 重新集合运算：

- L = [已安装 68 项](F:/FoundryLab/foundry-v14/evidence/server-next-migration/all-mod-upstream-audit-20260923/installed-modules-live-manifests-corrected.json) ∪ [计划 17 项](F:/FoundryLab/foundry-v14/evidence/server-next-migration/all-mod-upstream-audit-20260923/planned-modules-live-manifests.json)，去重后 85。
- M = [Mirror 保存配置](F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/mirror-persisted-module-setting.json) 的 enabledIds，78 项。
- N = [Next 正常客户端启动读回](F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/next-live-client-startup.json) 的 state.activeIds，74 项。
- M∩N=52；M−N=26；(M−N)∩L 仅 plutonium-cn、fvtt-json-forge；(M−N)−L=24。完整 24 项名单与公式已写入 metrics。

[清单生成器](F:/FoundryLab/foundry-v14/evidence/server-next-migration/all-mod-upstream-audit-20260923/build-current-ledger.ps1:8) 的第 8–22 行使用手列 groups，断言总量正好 85，只检查 installed/planned 是否在 groups，未检查旧世界保存开启全集。这解释了“85 表内部自洽，但不能回答整个 Mirror 是否迁完”。Mirror 是保存开关，Next 是当时客户端 active，两种层级不能伪装为同时在线的两端状态；这不影响“旧表遗漏其差集”的集合结论。

对应人类报告：[9/26 对账](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-26-server-next-mirror-enabled-gap-and-startup-errors.md:7)。原始文件指纹在 metrics.evidence_files。

### S2：DFreds Convenient Effects 的 HOLD 是阅读遗漏

[9/28 旧报告第 10 行](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-28-server-next-three-dnd-module-support-refresh.md:10) 明确写 v9.2.7 发行说明没有 D&D6 验证依据，并置 HOLD_SUPPORT。其第 3 行后来追加了纠错，旧判断仍保留可对照。

独立依据是 [固定上游记录第 3–8 行](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/upstream-lock.json:3)：同一个 v9.2.7、publishedAt=2026-09-21T17:09:28Z（北京时间 9/22 01:09），保存的完整 releaseBody 已说明 D&D6 分级效果处理与 6.0 以后迁移。记录还保存正式 ZIP URL 与 SHA-256，指向 [同一官方发行页](https://github.com/DFreds/dfreds-convenient-effects/releases/tag/v9.2.7)。本轮只读这个已归档来源，没有再查网络，因此不主张官方页面此刻未变。

这比“主任务后来承认查漏”更强：新旧结论引用同一已发布版本，旧 HOLD 的文字与保存的发行正文直接矛盾。纠错不代表运行通过；按用户规则它应进入依赖、安装、启用、重登新增错误检查，而非继续等待作者发布。原主聊天 01a0e0af… JSONL 第 9006 行（2026-09-29T07:49:27.521Z）另保存撤销误判的事件。

### S3：Item Piles 六项离线通过遗漏真实注册／缓存消费链路

原始聊天 [9/29 新主任务](H:/CodexData/sessions/2026/09/29/rollout-2026-09-29T16-15-25-01a0ec3b-9fad-72a0-9869-c6f58a0220b6.jsonl:498) 第 498 行，2026-09-29T09:58:40.831Z，call_38LUoUQatLmzPBoplAzGk64y，工具实际输出 tests 6 / pass 6 / fail 0。

两小时后的 [真实 v2 读回](F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929/bag-container-v2-readback.json:1) 绑定 dispatchId=NEXT-PILES-20260929-02、toolRevision=2、Foundry14.368/dnd5e6.0.2、基础及适配 local1。第 20–24 行两个新 operation 都 completed，但第 269–270 行刀的 attunement 为字符串 NaN、attuned=true；第 765–794 行 payload 比对失败，第 863 行缺 Gem，源人物仍持有 Gem 并引用已移走的 Pouch。这是实际发生了部分写入后的语义失败，不是按钮没有执行。

本轮静态复核的因果链：

1. [原离线测试](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/item-piles/tests.mjs:13) 用自建 registrations Map 替代 addSystemIntegration；第 17–18 行等待 hook 全部完成后直接挑 6.0.2/5.0.0 配置。
2. [真实基础 ready 代码](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/item-piles/sources/base/src/module.js:121) 在 Hooks.callAll 后立即 registerSystemLibwrappers；[libwrapper 第 103 行](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/item-piles/sources/base/src/libwrapper.js:103) 立即读取 SYSTEMS.DATA。
3. [local1 适配器](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/item-piles/dist-local1/itempilesdnd5e/dist/module.js:424) 在逐版注册中 await；[SYSTEMS 第 41–68 行](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/item-piles/sources/base/src/systems.js:41) 缓存第一次读取结果。精确 Foundry14.368 [Hooks.callAll](F:/FoundryLab/foundry-v14/app/14.368/client/helpers/hooks.mjs:114) 和 #call 第 158 行同步调用，不等待 listener Promise。
4. 新增 [registration 回归](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/foundry-modules/server-next-external-candidates/item-piles/registration.test.mjs:6) 覆盖实际 API／SYSTEMS。原始日志第 895 行、call_I7y8Wj7RBhwKjzsRRw2OB6Re、12:07:42Z 实际复现 1.0.6 != 1.0.10；第 1016 行、call_qEltIheXuSjz3Q6hqidHK68e、12:21:05Z 记录修后 12 pass。

这些证据支持“测试替身掩盖初始化先后及缓存”。仍不能据此宣称 local2 已在世界通过；本次读取的交接记录仍显示后续正常关世界门禁受阻、未安装 local2。已有 Loose UI 与货币成功保留，受损四件测试物品应精确重置，不能重放整批转移。

## 时间线：目标、成果与停顿

时间均换算为北京时间。精确 UTC 与原始行号保存在引用或 metrics。

| 时间 | 事件与实际含义 | 证据 |
|---|---|---|
| 9/19 16:43–17:04 | 用户把第三方 Midi 修复明确为“Mirror 全部内容迁到 Next”的子阶段，接受原地改名的计划；目标固定 14.368/6.0.2/30002，旧 Mirror 为 14.364/5.3.3。是早期范围澄清，非后期不断更换系统。 | 9/19 主 JSONL 第 49、274 行 |
| 9/19 19:05 | C 轮夹具仍 Self/Instantaneous，没有非瞬时 30ft Circle、没放模板；因此没有触发待验清理 effect。F 未执行。先派发、再补前置对象造成一次无效验收。 | 同文件第 1167 行明确失败回执；9/20 第 1543 行要求先备齐对象 |
| 9/20 13:41 | 用户扩大本轮边界为全部 A–G，并明确网络问题也需处理；不能把后续仅交 C/F 后停顿说成一直缺授权。 | 同文件第 2829 行 |
| 9/21—22 | 浏览器策略初始化、URL 安全识别确实拦住工具；不是业务代码失败。最后恢复官方通道后补余项，A–G/Z 35/35 于 9/22 完成，保留旧版本未受影响 PASS。 | 同文件第 5801 行的真实 safety stop；[验收清单](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/plan/midi-qol-ag-acceptance-checklist.md:3) 第 3、21、29、62 行 |
| 9/23 | 用户明确上游优先、明确支持的免费包不做全量玩法、37 付费只记录；Forge 源码在另一 dirty 树，用户决定暂缓。合理缩小工作与发布边界。 | 9/22 14:21 主 JSONL 第 3011、3048、3855、4433 行 |
| 9/24—25 | Resolver 有文件却未登记；受控重启后登记、启用通过，但还未水合／施法。缓存是符合现象的推断，报告未把它过度写为唯一根因。 | [登记缓存专项](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-24-server-next-package-registration-cache.md:9) |
| 9/25 | Blood Hunter “没有正式资料”被纠正：旧项目有锁定哈希，唯一工作树没找到属于路径问题；获准读 Mirror 精确文件后字节匹配。后续真实升级／复制也暴露系统自动 identifier 等差异，属于需要修的兼容行为。 | [来源纠错](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-25-blood-hunter-source-recovery.md:5)；9/25 主 JSONL 第 9431、9848 行 |
| 9/26 | 用户问“是否和 Mirror 开启相同、是否报错”，才做完整差集，发现 24 项漏表；Next 新登录 50 console errors，其中 39 日历类型错误，另 3 page errors。不能用 85 处置数代表整体完成。 | S1 原始四 JSON；[错误分类](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-26-server-next-mirror-enabled-gap-and-startup-errors.md:24) |
| 9/27 | 首派用子智能体而非用户要求的独立任务，用户纠正；新执行器曾错套 Mirror 登录规则。之后 ATLAS/Calendaria 正常重登与既有 New Dawn 页面通过，日历错误 39→0，剩余非日历错误没有隐藏。 | 9/27 主 JSONL 第 331 行；[日历原始回执](F:/FoundryLab/foundry-v14/evidence/server-next-migration/calendar-chain-20260927/calendar-chain-normal-client-acceptance-20260927.json:290) |
| 9/27 21:54—9/28 | 用户明确停止、恢复，又要求确认真实 Chrome 操作方式；部分空档是主动暂停或工具验证，不能全计模型执行慢。后续多批包注册／开关通过仍不是所有功能通过。 | 9/27 主 JSONL 第 1194、1253、1266、1612、1660 行 |
| 9/28 22:25 | 独立执行器用 task-local send_message→/root，未用跨线程 API→父 UUID；父任务无法自动收到。不是跨线程工具已调用后丢信。 | executor 01a0e69f… JSONL 第 3639 行，call_sf2X2c7VThWgxNAo9cdIRGGK |
| 9/29 11:46–11:49 | v7 落盘后发生 compaction，随后回到旧 PID35180 关服任务，final 回答旧任务而未回 v7。外置当前契约因此有具体必要性。 | 同 executor 第 5356 行 compaction、第 5367 行转去关服、第 5435 行旧任务 final |
| 9/29 | 六件玩家物品最终 6/7 修好，27 永久来源、346 tests；v11/v12 曾有 4 项／1 项窗口证据错位，父审纠正后才收口。v11 2555 秒，较当时 1800 秒上限超 755 秒。 | [最终机器回执](F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/player-item-repair-final-receipt-20260929.json)，evidenceCorrections、timingDeviations；本轮未重新视检这些旧图，画面错位结论依据保存的父审纠正记录 |
| 9/29 15:42 后 | 用户暂停自有模块／Plutonium、将雅灵/Pixi排后，优先十外部模块，取消 30 分钟总限制。CE 误判纠正；Item Piles 当前真实失败如 S3。 | 9/27 主 JSONL 第 8883、9075 行；新主第 9 行完整新范围 |

## 用户提示中的歧义与合法变化

用户确实调整过范围，但大多是明确优先级或验收预算，不应归为“用户一直变需求”来解释所有返工。

| 原话短摘与时间 | 审计判定 |
|---|---|
| 9/19 16:43：“最终的目标…server mirror 的所有内容移植到 server next” | 初始 Midi 命名偏窄，用户及时明确总目标；次轮已批准总／子计划，后续分母漏项属于执行计划缺口。 |
| 9/20 13:41：“本轮边界就是把 A~G 都处理好且验证没问题” | 合法扩展 A–G；后续仍以 C/F 自设边界停下是不执行已授权目标。 |
| 9/23 13:55：“不需要测试官方表示支持的 MOD” | 收紧到官方支持包的安装／启用／启动验证，不能解释成“完全不读回”，更不能为每包新增全量玩法。 |
| 9/24 10:22：被问“原始、已接受 enriched source JSON 在哪个本地路径”后答“没有” | 术语＋路径问题存在实际歧义；只证明用户当时未提供该文件路径，不能推出整个旧开发从无资料。9/25 用户质疑后找回锁定源。 |
| 9/26 16:17：“主要是要看看有没有报错…不需要验证…300% OK” | 对迁移整体验收进一步说明轻重；本地修改的关键行为仍需目标证明，官方支持包不无限扩 E2E。 |
| 9/27 21:54：“先让他停止…没办法操作 chrome”；22:00：“现在…可以用了，继续” | 明确暂停／恢复，不能把这段全算代理停顿。 |
| 9/28 20:51：“先处理…7 件物品…不同时安装剩余模块”；同一批准计划另写“浏览器验收控制在30分钟内，25分钟开始收尾” | 合法临时优先级变化，并对这一子任务重新明确 30 分钟边界；不能责怪执行器此时未继续装包，也不能把 v11 超时一律归为继承过期规则。9/20 的“不限制时间”属于当时 A–G，之后此处有新的明确计划。 |
| 9/29 15:42：“先…10个外部模块”“30分钟…如果有，忽略它” | 明确的新顺序和旧限制覆盖。应更新唯一契约；本文未发现可证明的取消后继续强行按 30 分钟拆批事件，不作这种额外指控。 |

## 约束是否合理

| 约束 | 有根据的边界与实际问题 |
|---|---|
| 共享 Mirror/Next、数据目录与 PID 身份、正常关世界及锁释放 | 合理的数据完整性与他人工作保护。历史“0 用户”不等于其他任务释放服务。9/29 shutdown active 仍 true 是真实门禁，不能为了提速直接杀进程或改库。可改进的是复用已核身份、统一一次维护窗口和显式占用合同。 |
| 不备份、不直接编辑运行中 LevelDB | 明确项目边界。Blood Hunter 正常更新流程需要测试人物备份，与边界确有冲突；9/25 21:51 用户仅批准专用测试人物例外，问这一次有依据。不要把后来已有例外再次变成同样阻断，也不要自主扩到玩家备份。 |
| 不自动整合另一 dirty worktree、commit/merge/push 需发布授权 | 合理。9/23 用户已选择暂缓 Forge，所以它未交付不是迁移代理没有去拷贝代码的过错。迁移成果长期 dirty 增加接手成本，但审计不代替用户授予发布权。 |
| 付费 37 包仅记录、Plutonium 最新明确暂停 | 合理的明确范围。无包授权不能补装；官方声明不足是“未证实”，不自动等于“不兼容”。CE 的 HOLD 是读漏，而非这条边界要求。 |
| 独立线程实际 Full Access、浏览器真实安全停机 | 宿主权限与工具 safety stop 是硬事实，不能绕过；仅从配置默认值或“没有命名 Chrome 工具”推断实际工具不可用则证据不足。9/29 v2 原始回执明确撤销 globalThis 无绑定推断，官方 browser-client 初始化恢复。 |
| 30 分钟、回调后能否继续、Mirror-only 登录 skill | 旧上限在有效时有依据，v11 超时仍须记录；用户取消后应覆盖。旧 PreToolUse 以 turn_id 锁定回调恢复、把 Mirror 登录约定套 Next、把独立任务发成 spawn_agent，属于代理／协议扩大或错配，不能说用户没有授权。 |

## 返工归因与 WMP 对照边界

真实复杂度包括：dnd5e5→6 的效果和 ItemGrant 来源约束、第三方基础包与适配包时序、多个模块及旧世界数据的组合。真实上游缺口包括 Droppables 正式产物与源码不符、Clocks 丢失声明资源；本轮没有重新查上游，采用固定发行资产证据。工具外因包括已记录的 Chrome safety stop、用户明确暂停、9/23 用户说明子任务额度不足；最后一项没有对应账单，不能量化损失。

代理可避免部分由 S1–S3、错误登录／线程种类、两次回调漏发、错位截图直接支持。重复调研不一律是浪费：发行包确曾更新，安装前定点刷新合理；但对未变包整套重查、报告多个“当前”、已过项无新影响仍重测会增加成本。历史清单已明确要求只撤销受候选变化影响的 PASS，这个设计应保留。

与 WMP 可共用的是运行目标绑定、候选／证据版本绑定、场景对象所有权、真实步骤前置条件、失败后禁止盲重放、回调合同与截图核验。ServerNext 的特有难度是模块全集和依赖／安装组合、上游选择、跨版本世界文档迁移；WMP 的规则触发、命中／伤害／回合状态语义不能由 ServerNext“无新启动错误”替代。此处是验收边界比较，WMP 具体归因及失败次数以主控的独立 WMP 审计为准。

## 通用验收平台与各 worktree 工具：六条具体边界

1. 共用运行合同：环境 ID、dataPath、world、Core/system、端口／PID／owner、候选 hash、占用者；集中做只读 preflight 和授权过的单次维护，保留 Mirror/Next 独立权限。不能提供绕过用户占用的自动重启。
2. 共用证据账本：以模块 ID／能力／候选／验收层级存事实；把 installed、registered、enabled、启动、代表行为、持久化、人工画面分开。迁移分母取完整源清单差集，每项都有保留／退役／待定决定；不硬编码 85，不给不具备同一层级的条目算总完成百分比。
3. 共用调度与回执：一次浏览器批次一个持久 dispatchId、revision、父 UUID、候选 hash、进度／清理对象清单；压缩后只读当前合同。完成回执需跨线程成功收件证明；父核证据后升级为 accepted。不要仅凭 executor final 或 callback_sent=true。
4. 共用可恢复的夹具设施：创建／读回／运行／清理有状态，记录本任务精确 ID 和 before hash；部分写入必须先 reconcile，只重置批准对象。各工作树保留专属场景及断言；禁止跨工作树共享可变 case 状态或用一轮 cleanup 清别人的对象。
5. 共用驱动及收集，专属真实语义：通用层负责正常登录、模块管理、重载、console/network 分层采集、截图 Actor/Item 身份。Item Piles 注册→缓存→转移、WMP 首次命中→效果→下一次攻击、Blood Hunter 升级等，必须由各版本适配器走真实入口；不能用 mock 注册表或通用 PASS 字段替代。
6. 风险驱动复测：官方明确支持且未本地修改包只验包／依赖／启用／重登新增错误；本地修复先做真实生产链的局部回归，再做受影响代表行为。复用已充分 PASS；保存单次操作超时与 started 状态，启动超时先读原 PID，不二次启动。不把全量玩法、全世界零错误、4 小时 soak 默认加进每个 worktree。

## 量化口径及未证明部分

metrics 精确读取 10 个已知历史文件（含同一主线程的两个延续文件、3 个独立 Chrome 执行器），按 token_usage_record.payload.response_id 去重，得到 9,918 条唯一响应；26 次 compaction。该样本内单文件 event token 累计值下降次数为 0；延续文件仍携带上段累计值，因此仍不能相加所有末尾累计数。

记录的输入 2,880,852,243 tokens，其中 cached input 2,843,870,336（98.716%）；输出 5,674,125，其中 reasoning 为输出子集。未缓存输入 36,981,907；未缓存输入加输出 42,656,032。这是所选记录的推理使用量，不是付费金额、账户配额百分比或“全部浪费”。缓存输入不能再与总输入相加；reasoning 不再与 output 相加。逐响应相加与 event 累计口径存在差异，原值均保留，未强行消除差异或换算账单。

没有所有旧执行器／子代理完整记录，没有空闲时间剔除，没有统一的失败回调耗时数据，也没有可把每段 token 精确归因于缺陷的实验。不能据此估算“换模型能省多少”“Luna 提速多少”或把 9/19—29 的日历跨度全部称为工作耗时。唯一实测时长例子是原回执中的 v11=2555 秒、v12=929 秒、最后父审=316 秒及服务遗留 9330 秒；其中等待与操作时间未进一步分解。

本轮只做 JSON 集合复算、字段／调用链核对、历史事件去重统计、引用与文件存在性检查。没有重跑业务测试，没有重新验收 Foundry，没有外部调研。20 个关键文件及 10 个历史快照均记录 SHA-256，便于后续发现现场文件继续变化。
