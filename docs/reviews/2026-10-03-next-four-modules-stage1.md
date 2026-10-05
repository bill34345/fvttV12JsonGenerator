# 四自建模块迁入 ServerNext：基础链与十九状态候选证据

日期：2026-10-03，上海时区。实施聊天 `01a100eb-e2ed-7291-b60b-32550657b4c3`；候选树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-164211-next-four-modules`，分支 `codex/20261003-164211-next-four-modules`，已提交基线 `ec08352906172bbdf05f8cb573194c41761b36f0`。

**当前入口（2026-10-05）：** 后续恢复授权已纠正 r57 误停；本文件以下内容保留阶段一当时的历史状态，不再充当当前待办清单。[最新进度](2026-10-05-next-four-modules-progress.md)记录四模块限定本地行为、集成 CI、自有玩法夹具清理、文档等价包实装及最终读回已闭合，按用户要求停止。r86 原始全量摘要 FAIL、旧个人 UI 坐标与孤立设置历史 UNKNOWN、一处 Scene 旧完整来源未捕获、r52 停点、r51／r78 等失败原件及 r56 原始速度 UNKNOWN 保留，不把后续分步通过改写为旧连续案例成功，也不声称所有历史来源逐字复原。候选仍未提交、合并或推送。

**历史停点：PARTIAL／按用户要求停止（2026-10-04 r52 检查点）：基础伤势／休息／快速复活及TE限定回合顺序、十九状态原生实例生命周期、20项属性检定／豁免、11项攻击者与伤害骰、7项目标模式、实际伤害向下取整与Frozen累计受伤解除、8项原生消息特殊暴击已获得限定实机接受。r51因额外正常通知的整体FAIL保留；r52已独立证明最终视图／Combat／集合恢复，并用House Rules旗标精确绑定该通知到拥有天然20消息。r50跨客户端前置检查晚执行的缺口保留，后续宏内已加动作前原589聚合门与精确五generated-ID范围核对。CC回合tick、移动／动作限制、HUD、WMP接入及联合收尾、其它复活仪式／多GM和最终拥有对象清理尚未闭合。r53仅源准备未派发／未运行。152局部检查、类型检查、手册30检查通过；实施候选未提交／合并／推送。原ServerNext PID36984（14.368／6.0.5）保持运行，Chrome执行聊天已idle，全部拥有夹具与证据保留。** 本文件只记录本批专题证据。唯一迁移总表仍在原迁移树 `docs/plan/server-next-migration-handoff-20260927.md`，本阶段向其第5.18节追加结果。以下早期记录保留其当时状态。

## 授权和保护基线

### 当前失败与修复边界（2026-10-04 r16）

2026-10-04 r19 更新：作者修复CC已定点安装并核ZIP/build/installed31文件一致，原服务恢复PID64688。复验在原source前置暂停：相对r16有两个original Actor整体hash变化（65DtcQDkiSKj0Qd5、aMZwC9ORkpZpdlkc，r9均无CC/legacy injury），具体字段与原因待只读核实。没有执行新playerRest、更新HP或修原Actor；临时owned权限已恢复，r19期间589原source未继续变化。历史批次的原角色保持证据不推广为本次重启后的全量不变；patch玩家休息实机接受仍PENDING。

玩家 native HP1→0→2 跨客户端由活动GM结算通过，玩家原生短休创建真实消息后伤势仍2，实机15秒等待失败。原589Actor源、世界时钟保持，只增加拥有rest消息；两个owned对象权限已精确恢复，失败事务未重放。父以精确Core源码定位canonical `ChatMessage.author` 与CC旧 `message.user` 校验差异，author-only合法请求和冲突alias两反证旧实现均FAIL；修复后133测试通过、typecheck/手册通过。候选已构建但尚未安装或实机复验，不能将此前GM休息PASS推广为玩家休息PASS。r15已补齐普通玩家原生消息可见性与UI不泄露结果；权限表单持久化失配根因仍UNKNOWN，正常owned Macro API往返与精确恢复已通过。普通/最终仪式、Combat/GM交接、CC十九状态及WMP仍未闭合。

用户恢复 TE、CC、WMP 与 IFS 配套升级，要求独立实施、逐阶段推进且共同接口统一负责；真实 E2E 固定 gpt-6.1-sol / medium。原交接入口为原树 `.local/next-four-modules-handoff-20261003/handoff.md`。本聊天实际 turn_context 为 gpt-6-astra / xhigh / danger-full-access / never。

主仓开工为干净 master ec083529。新树从此已提交基线建立，包含 d477ef7 的四模块整合，不从原迁移树旧 HEAD 69ef911 开发。交接 receipt 的 23 个受保护文件逐 SHA-256 相符，原索引为空；只允许定点追加原迁移总表，其余原树只读。没有 commit、merge、push、备份或额外 Foundry 实例。

现场只读确认：30002 唯一监听 PID41112、Administrator；Node24.17.0、app14.368、data/server-next、cor-cotn、loopback 参数与交接一致。`/api/status` 为 active=true、14.368 / dnd5e6.0.5、users=1，不称空闲。旧已接受浏览器 final receipt 的 96 个启用包逐项核对当前磁盘 manifest，版本失配 0；**这不证明当前客户端仍启用同一集合**，新客户端全集读回仍待正式 Chrome 恢复。

## 精确来源与共同接口

AnySearch 成功提取[官方最新发布](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.5)，并直接读取官方 releases API 的非 draft／非 prerelease 6.x 全列表比较；最新稳定仍为 6.0.5，与本地 system.json 一致，因此没有系统更新。精确参考 checkout 为 `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`，工作区干净。Context7 的限定查询返回 Wiki Hooks，故只作导航，具体顺序以该固定源码为准。

| 来源与接口事实 | 本项目采用方式／差异 | 最小反证检查与现状 |
|---|---|---|
| Core14.368 `client/documents/collections/users.mjs` 的 activeGM 每次按 active/isGM 选择指定 GM | TE 不缓存活动 GM 身份；异步等待后必须重新检查 | 订阅者等待、Macro 解析、后续动作和回写 helper 的交接回归；旧实现 3 FAIL，修复后通过 |
| Core14.368 `client/documents/combat.mjs` 的 `_manageTurnEvents` 在活动 GM 上先 await 原生回合生命周期，再 callAll combatTurnChange；其他客户端也收到各自的 Hook | 保留 TE 的活动 GM 门和原生完成事件、同次 end/start 一起排队和去重设计，不改为定时器 | 原有快速转换／慢生命周期／不重放测试及新增回调和订阅者失权测试通过；Next Combat 实机尚未执行 |
| dnd5e6.0.5 `module/documents/actor/actor.mjs` 先完成 bulk update、可选时间推进和 rest 消息，再发 restCompleted(actor,result,config)；消息 type=rest、system.type=result.type | CC 保持原生休息消息关联和实际发送者验权，未发明新版 hook | 本地 CC 休息／发送者回归通过；真实玩家短休、长休和跨客户端仍待验 |
| 同版本 rollDeathSave 在更新前调用 rolls/details hook，之后读取 details.updates 和 details.outcome | CC 已有自然 19–20 修改使用 outcome=revive，IFS 不重新拥有伤势 | CC 精确配对和保留骰规则回归通过；Next 天然19–20及复活 blind 表现仍待验 |

官方 dnd5e 实现代码的 `LICENSE.txt` 为 MIT；本次只引用接口事实。Core 本机源码仅作获授权安装的接口核对，不复制发布。四份精确源码路径和 SHA 保存于私有 `source-provenance.json`。没有新增外部模块或待判断本地化候选；下次官方 6.x 变化须重新核 target、这些接口和受影响接受，不将本轮静态通过自动推广。

共同接口当前口径：

- TE0.2.0 的 `subscribe` 提供 Actor／Combat 事件，HP 事件捕获原生 modifiedTime；`apiVersion=1`／`externalEvents=1` 保持。
- CC0.2.0 通过公开订阅处理伤势；当前 6.0.5 精确门仅开放伤势，十九种通用状态及 weaponEffects 仍锁 5.3.3。本阶段没有放宽这些门。
- IFS1.1.0 的 injuryOwner 指向 CC，只写 fadingSpirits；旧 injury 原件、未知字段与独立复活保留。Next 磁盘仍为 IFS1.0.1，安装／启用必须统筹三模块组合，不能同时引入两个伤势写入者。
- WMP0.1.0 已接受 CC／TE0.2.0 的 API，仍锁 5.3.3。旧 Vex／WMP 交付与 Mirror 代表链是复用证据，不是 Next 接受。WMP 迁移留在 CC 通用状态之后。

## 本阶段实现与验证

TE 原实现只在 Actor／Combat 队列开始时检查 active GM。若订阅者、回合回调或 Macro UUID 解析 await 期间发生 GM 切换，旧客户端仍会执行后续订阅者、公开事件 Hook 和 Macro；因果回写 helper 也未重新验权。

现在在这些异步边界及每个后续触发器／动作前重新验权，helper 写入前也检查。外部武器事件的持久去重与非 GM 订阅能力不变。引擎不能中断已经执行中的任意用户 Macro；Macro 内直接文档写入仍由作者验权，README 与手册明确这个限制。本阶段保留 0.2.0 候选版本，以本次源码和 bundle SHA 区分，不声称已发布。

| 检查 | 实际结果 |
|---|---|
| frozen install | Bun1.3.8 成功，bun.lock 无变化 |
| 首次权限反证 | TE 原 38 PASS，加 3 个回归均 FAIL，原件 `te-authority-red.log` |
| TE 修复与 Combat 补充回归 | 43 PASS，0 FAIL，231 assertions |
| CC 既有伤势／通用规则与接口回归 | 128 PASS，0 FAIL，1232 assertions |
| IFS 独立复活与验权回归 | 56 PASS，0 FAIL，373 assertions |
| WMP 安全包装测试入口 | 260 PASS，0 FAIL，1110 assertions；证明旧支持边界未回归，不是6适配 |
| Foundry 模块类型检查 | `bun run typecheck:foundry-modules` 退出0 |
| TE／CC／IFS 构建及归档 | 三包构建通过；ZIP每个文件与build tree SHA一致、文件数一致、package/manifest版本一致 |
| 中文工具手册 | TE条目人工核对、review及build/check通过，30项覆盖保持；页面目视按用户决定延期 |

三份构建 runtime SHA：TE `914db6e69d5477e7610c9249f7a691c77e716552e641a13734a094c260883df8`；CC `d62f11a4e36a6f3cc10c501e0d8458539056efa5f66df1c8fcb6bcddf0ab55e5`；IFS `c748dd4ad7ed6fb26bb9c7f94bdff3d7b8390ed00ac538d11e21a3c636ddd145`。这是本树实际根脚本构建身份；没有用旧 Mirror bundle 的不同 Bun banner 哈希冒充本次字节身份。完整 ZIP、文件清单与 SHA 在 `artifact-receipt.json`。

原始日志和收据均位于本树 `.local/next-four-modules-20261003/`。本阶段不改 parser/generation，不跑无关来源全矩阵；整体集成 CI、安装与运行边界未闭合，不以定点测试代替它们。

## Chrome 阻碍与唯一下一步

复用获准执行聊天 `01a0fba0-50a4-72b3-af9a-0345c5c55205`，dispatch `preflight-01a100eb-r1`／revision1；实际回调 receipt `a9fae585-cb6a-4d8a-95ad-355851126b92` 已送达本实施 UUID，父已读回原件。执行器最新 turn_context 明确为 gpt-6.1-sol／medium／danger-full-access／never。

父与执行器当前工具注册表均没有 mcp__cua_repl／Chrome extension browser 入口或工具发现入口；执行器的 Chrome enabled 配置不等于可调用能力，旧 browser-client.mjs 的磁盘存在也不构成替代路径。当前结论为 `BLOCKED_CURRENT_CUA_CHROME_ENTRY_NOT_EXPOSED`，不是网站权限拒绝，也不是 Foundry 故障。没有 Windows 桌面、raw CDP、旧客户端导入、浏览器页创建或任何世界写入，待清理对象为0。

下一步是让同一执行器获得当前官方 Chrome 入口并完成最小往返；固定模型不改、不重复制造相同缺口的新聊天。之后复核实际 Next 用户／96启用集合及战役基线，正常 API 只读预览旧伤势 flags、schema／冲突、投影和设置，再冻结安装合同。首次安装保护工具目前仅在原迁移树，本批尚未复制其 dirty 实现；届时只复用明确需要的精确文件与哈希，不吸收 Token 同步修改。

运行顺序仍为 TE 基础＋CC伤势／IFS1.1.0安全组合 → CC十九种通用状态 → WMP → 联合恢复和精确清理。TE 新异步失权行为、真实 HP、回合与去重、GM／玩家／双GM、CC旧数据保持及复活 blind 等出口仍须 Next 实机证据。手册 HTML 目视按用户此前决定延期；不绕过 file:// 拒绝补它。其余暂停对象、Mirror、生产和长时验收保持原边界。

### 用户指定更换独立 Chrome 执行聊天

2026-10-03 用户先明确要求传递完整 `[@Chrome](plugin://browser@openai-bundled?browserFamily=chrome)`，随后要求停止旧执行聊天、创建全新上下文的独立聊天，模型仍为6.1 Sol / medium。这项明确选择替代上文复用旧执行器的下一步。

旧执行聊天以停止收据 `b391988f-4cf5-4e1b-a648-2b68ddf382fa` 确认已停止、无操作在途；仅完成只读配置／服务核对，浏览器连接、owned tab、Macro、fixture和世界写入均0，无对象需要移交。原件为 `.local/next-four-modules-20261003/chrome-mention-r2-stopped-handoff.json`，旧失败与配置记录保留。

新独立执行聊天为 `01a101cc-b72c-7571-ab86-d3af20bc102d`，使用create_thread新建，明确附上Chrome插件引用；请求配置gpt-6.1-sol / medium，实际配置待执行器本轮turn_context读回。dispatch `fresh-chrome-01a100eb-r1`／revision1只授权当前正式Chrome最小连接及现有Next只读前检，不继承旧页、宏或合同。回调仍指向本实施父UUID `01a100eb-e2ed-7291-b60b-32550657b4c3`。新证据目录为同候选树 `.local/next-four-modules-20261003/fresh-chrome-r1/`；当前路由收据为 `current-chrome-executor.json`。创建与派发成功不等于浏览器连接或实机接受通过。

### 正式前检回执与共享 app 维护窗口

新执行器回执 `fresh-chrome-r1-01a101cc-b72c-20261003` 已实收：实际6.1-sol／medium／danger-full-access／never通过，当前官方node_repl入口调用成功；browser／chrome26.930.31428的两个skills目录均为空，随附文档要求的Bootstrap说明缺失，因此Chrome最小连接和页面前检均NOT_EXECUTED。无owned页、Macro、fixture或世界写入；原件为上述fresh-chrome-r1目录的receipt.json和config-capability.json。宿主曾报告模型容量错误，该历史保留，不能代替后来收到的具体能力前检。

另一个用户授权任务“查找并评估 FVTT 下载代理”（`01a101da-e04e-7762-a1a6-d8c7e8036d51`）请求维护Mirror／Next共用app14.368的公开包下载代码。实施父已读回该聊天实际安装授权及userMessage `01a101ec-435e-7192-a57b-2e2aecb0f8a7` 的跨聊天协调授权，并只释放本任务对Next的使用窗口。只读核实时仍为PID41112／Administrator／30002／cor-cotn／14.368／6.0.5，users0；未替维护任务安装、停止、重启或改世界，也不代替Mirror owner放行。

本批Next服务和浏览器操作保持HOLD，等待维护owner完成回报后重新核对新PID、两文件SHA、world/system及原模块集合再接续。精确启动参数和旧启动脚本的已有输出拒绝边界已交接；本聊天没有验证正常停止入口，未把Return to Setup当作进程退出。维护完成前不重派Chrome，不改变用户指定模型；本批源码、未提交改动和既有原始证据保留。

维护方随后报告事故：尚未收到Mirror READY时，把未带`--apply`的`foundry:lab stop`误作预览执行，实际停止Mirror PID45120；已停止后续维护，向用户请求新的恢复授权。维护方报告两补丁文件未覆盖、Next进程未停止；这些安装／Mirror事实未由本聊天另行验收。

21:50上海时间，本聊天只读独立核实Next为`active=false`、Core14.368、30002唯一loopback listener仍PID41112／Administrator，原app/data与启动参数保持。Next已正常返回Setup，不能表述为世界已恢复运行。104注册／96启用属于维护方报告的UI基线，等待原件读回。本批服务／世界写入0，保持`HOLD_PENDING_MAINTENANCE_OWNER_RECOVERY`；准确收据为`.local/next-four-modules-20261003/maintenance-interruption-next.json`。已通知维护方保留原事故和基线证据，不在本任务中恢复Mirror、修补停服入口或继续安装。

### 维护释放、正式 Chrome 接通与只读伤势预览准备

维护方后续交来原件，父审实际104行／96 active的id@version与此前接受集合完全一致；正常返回一次、同PID41112及`active=false`核对通过，两app文件现场SHA仍与维护前一致。父审收据为`maintenance-baseline-review.json`。用户要求暂停代理安装后，维护owner明确取消占用并释放Next，本任务解除其造成的HOLD，只恢复原四模块范围，不安装下载代理或操作Mirror。

查阅同日另一获准执行聊天的实际工具原件，确认当前chrome26.930.31428公开`setupBrowserRuntime()`经正式node_repl可连接；随后的`browser.documentation()`提供当前API。父保存精确组件SHA与成功原件引用于`resume-world-r2/official-bootstrap-reference.json`，不是导入旧版本或改通道。新执行器同一6.1-sol／medium聊天在r2也完成真实连接及动态API读取，关闭了r1的能力未知项。

r2建立本批owned Next页`651339397`，准确识别原`cor-cotn`。首次点击`a.control.play[data-action=worldLaunch]`返回selector deadline，虽然匹配1／visible1，后续截图、DOM及父只读API仍为Setup／active=false；未把工具调用算成成功启动，也没有重复Launch。r2原件与截图保留。已派r3只诊断同一控件的可操作性／遮挡并在新证据后恢复正常启动；若世界已启动直接进入join，不重放生命周期。登录、世界内104／96新读回及其后预览仍待回执。

同时准备旧伤势只读工具`injury-preflight.js`：复用已有DialogV2 textarea输出路径，先Readback，再Injury Preview；精确目标／GM门，读取世界与synthetic Actor的HP、旧新伤势namespace、投影、flags/effects指纹、限定设置和ID集合，不调用任何文档写入。输入为5509字节，SHA256 `969c79439d90c6a1dcb2afee060c7667905082f6797766e6fc890f058835e965`，预先去掉末尾LF。七项隔离JS检查覆盖未知字段、混合效果／禁用、synthetic身份、错误目标／用户／版本拒绝和部分读取失败，写入0；这不代表真实浏览器保存往返已通过。

共用V1完成prepare→ready→execute→collect，run `e0785799-c9d9-43c1-bed7-14b9fa9a6cc7`、receipt `49eb96a2-8a9d-41b0-aeb1-0112365a3c56`，文件侧PASS／COMPLETE／cleanup NOT_REQUIRED，自动parentReview保留PENDING。对应身份和请求位于本批.local根。下一步待r3世界恢复实收后，在同一owned页正常UI保存／重开／全文SHA验证Macro，再先验证最小Readback往返，才执行只读伤势预览。未复制安装器dirty文件，未安装／启用三模块，未作战役数据迁移。


## r37/r38 原生攻击失败与修复候选

Enfeebled 原生力量攻击仍为普通1d20，r37失败保留。r38六公开Hook只读快照确认prepared STR attack mode无劣势源，实际效果只投射check/save；没有把第三方模式重建源码推断称为完整因果证据。6.0.5候选新增能力特定原生attack effect字段，5.3.3继续旧Hook路径。缺口三回归先红，修复后147检查、typecheck、手册30检查及构建通过；尚未安装和原生复验。攻击／伤害／回合／移动／HUD与WMP仍未闭合，旧失败不能被清理或绿色静态检查覆盖。


r39释放并定点安装CC原生攻击投射修复后恢复同实例PID41960，31 build/ZIP/installed文件一致；当前147局部检查通过，修复实机攻击与伤害仍待r40，不称规则已恢复。


r40新CC字节已加载但Enfeebled原生STR仍普通1d20，真实复验FAIL，剩余攻击／伤害未执行。该修复候选尚未证明有效，转native效果保存／应用层诊断；147测试和安装文件一致不能盖过失败。原数据及拥有对象基线保持。


## r45限定原生攻击与伤害骰接受

拥有场景在正常照明／sight／近战相邻／渲染shape前置下，11实际随机AttackActivity攻击和伤害检查通过。Enfeebled/Clumsy攻击劣势、移除恢复、Jinxed/Valor独立d4及Weakened对实际骰和两加值减半有完整raw/options/dice证据。未应用HP，4.5向下取整层仍待原生applyDamage核对。原589和原世界／Combat保持，临时拥有light/sight/xy、视图选择目标及效果恢复。此接受不能覆盖缺Token上下文或未照明旧失败；目标模式／crit、tick、移动、HUD及WMP仍未闭合。


## r46/r47目标优势缺口与可选适配候选

Defenseless实际已施加但原生attack仍mode0，r46失败和完整恢复记录保留。r47只读验证自有status在CONFIG一次但AC5e14.603.2公共状态表缺项，原生paralyzed格式及公共引用接口有效；源码核该公开表与内部getter同引用。候选在CC内可选注册自有projectedDefenseless opponent规则，Frozen/Shocked共用该状态；无强制mode、无私有导入／prototypepatch／外部文件或setting写入。只真实enabledCC实例生效，延迟ready与注册冲突和自有清理有回归；152检查、typecheck、手册30和构建通过。实际目标模式仍待安装复验，不能以静态／注册成功称合法优势和抵消已通过。


r48基线/正常释放后只更新CC目标规则适配3文件，31文件build/ZIP/installed一致，恢复同实例PID36984；152局部检查通过。r49真实目标优势／抵消复验待执行，r46实际失败继续保留。


## r49七项原生目标模式接受

新CC自身注册public Defenseless entry后，7真实native attack模式[0,1,0,1,1,0,0]通过，覆盖Defenseless/Frozen/Shocked优势、移除、合法Enfeebled抵消和Helpless无额外优势。源和目标phase效果、临时ownedlight/sight/xy和GM视图选择目标均恢复，原589及世界／Combat保持。HTTP字节hash与live entry和实机行为是分层加载证据，未直接抽取浏览器响应body。152局部检查通过；特殊crit、实际HPfloor/Frozen伤害解除、tick/move/HUD与WMP仍未闭合。


## r50限定实际HP伤害接受与前置缺口

真实6.5弱化伤害扣6HP；Frozen cold对照counter0，fire4与bludgeoning4累计8解除threshold6，原生applyDamage实际通过，fixture/原589case前后与世界恢复。旧浏览器tabs不可用后新建GM651339587；跨轮两raw hash变动在测试后才核，父以完整精确五ID normalized证据接受限定行为和恢复，保留前置顺序缺口与client初始化原因推断，不称合同所有项通过。下一宏在任何动作前执行冻结原589聚合manifest和精确五ID门；不重复已通过HP case。特殊crit、tick/move/HUD/WMP未闭合。


## 用户停点：普通话说明

本段旧停点已由正式业务恢复授权替代。当前已完成r53五项流血/灼烧原生回合、治疗与移除边界，并由r55独立只读核对闭合终态：HP2/source20、原视图/层级/选中/目标、原589 raw/normalized整表、原10Combat、拥有场景、集合成员与世界时间保持；r53/r54整体FAIL原件继续保留。仅拥有Combat的AC5e cadence.updatedAt作为精确原生生成时间戳例外记录，没有放宽其它字段或original Combat。5条condition消息有拥有Actor绑定，6条无直接绑定的Monk通知保留、无删除授权。父审见`.local/next-four-modules-20261003/tick-terminal-r55/parent-adjudication.json`。

当前r56已派发同一6.1 Sol/medium执行器，采用一个原生movement/use/roll/equip批和两类真实HUD入口，10行旧接受复用；所有安全恢复步骤独立执行，避免单个断言中断其它收尾。WMP后续接口准备见`.local/next-four-modules-20261003/wmp-next-interface-facts.json`：要处理正向CC写入能力、6.x规范效果/移动字段、typed消息来源链、实际Midi local10同卡与异步完成、必要critical卷映射；源码事实不当实机PASS。不重新跑旧十九状态与攻击矩阵。

现在还没有把四个模块全部迁完，但最容易影响游戏结果的几条链已经实测通过：伤势和休息、攻击优势与劣势、伤害减半后取整、冰冻受伤解除，以及特殊暴击。触发引擎和快速复活的基础联动也已经验证。接下来要做的是流血／灼烧随回合扣血、移动与动作限制、HUD操作，随后接入武器精通并做最后联合检查和清理。

耗时既有新版接口的真实缺口，也有测试准备不足：两个攻击规则需要修复；Token创建返回顺序未按输入顺序、测试场景缺视野／照明等问题导致额外排查。系统正常提示消息和新客户端初始化编号也增加了复核。当前暴击与恢复核对已完成，按用户要求暂停，不启动下一轮。独立Chrome仍固定6.1 Sol／medium。

接续入口：当前树 `.local/next-four-modules-20261003/user-stop-checkpoint.json`；完整长期记录在原迁移树唯一总表。

## 接续准备：仅整理文件，业务仍停止

2026-10-04，依据总控用户批准的测试流程整改，已整理[最小接续清单](H:/CodexData/coordination/2026-10-04-test-overwork-audit-01a0ffcd/implementation/consumers/servernext-prep.json)。清单绑定当前候选树、HEAD、相关源码指纹、旧接受原件与明确的失效理由；已过基础链、回合顺序、十九状态实例、检定/攻击/受伤以及8项暴击证明继续按原限定范围复用。r51整体FAIL和r50前检缺口不改写，r52只读父审保留；r37–r52的16次派发不能记作16个独立业务用例。

后续只有获得业务接续授权后，才按CC回合结算、移动/动作入口、HUD入口、WMP实际接口改动挑窄批次。旧notExecuted记录表示证据尚无，不自动使其它仪式、多GM或完整矩阵成为本轮必做项。r53仍仅有源文件，没有派发或运行；本次没有Chrome、Foundry、服务、世界或共享工具源码操作。共享工具由指定owner处理，收到精确候选后只做文件侧核验。原停点、历史收据与既有dirty改动保持。

### 文件侧接入已验证，迁移业务继续停止

2026-10-04重启后，只恢复获准的文件接入验证。使用精确共用候选 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261004-122215-validation-selection`，未复制或修改其源码。已生成[带选择约束的本轮请求](../../.local/validation-selection-adoption/positive.request.json)及10份薄分项绑定：7个已接受行为家族和r52恢复层复用，r51原整体FAIL、r50前检缺口与尚未开始的业务保留各自状态。实际读回9份相关当前源码并与准备清单核对，合同以readonlySources冻结这些当前身份，旧原件另行引用；不把相同context声明当作自动依赖判断。

真实 `acceptance prepare/ready/execute/collect` 文件入口通过，唯一执行项为 `prep-readback/evidence`。无理由把已过critical改为check、把reuse夹进执行范围两个负例均在preflight/operation前拒绝，4个marker没有生成；49份选定旧文件保持原字节，共用源码与独立审查指纹保持一致。只有一个新文件检查运行记录，没有Foundry/Chrome/服务/世界动作，r53仍未执行。

接续先读[接入结果](H:/CodexData/coordination/2026-10-04-test-overwork-audit-01a0ffcd/implementation/consumers/servernext-adoption/adoption-result.json)及[准确门禁命令](H:/CodexData/coordination/2026-10-04-test-overwork-audit-01a0ffcd/implementation/consumers/servernext-adoption/entry-pointer.json)：当前CLI工作目录为主线 `I:/OpenCode/fvttV12JsonGenerator`，共用工具已按提交 `cdf387a89af91a3525c7af857298760638434379` 完成本地合并，依据[总控Git读回](H:/CodexData/coordination/2026-10-04-test-overwork-audit-01a0ffcd/implementation/publication-parent-git-readback.json)。接续命令仍为 `bun run foundry:ops acceptance resume --contract="I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-164211-next-four-modules/.local/development-feedback/9b51ee8f-987c-4b5f-9d90-70d75b61132c/contract.json"`；此前候选验证返回REVIEW并读回文件PASS，本次只更新入口，没有重跑验收。原commonCandidate、接入结果、旧合同及旧收据作为历史接受身份保留，消费者workspace不变。该合同已领取，不能重复ready/execute。后续获新的业务恢复授权时，沿用选择约束建立新的窄批请求并重新核对实际目标；本文件接入通过不解除业务STOP，本次没有提交业务改动。
