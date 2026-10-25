# FVTT 工具合集重构执行总账

本文件是该计划的唯一当前进度源。[总计划](PLAN.md)说明设计，[模块索引](MODULES.md)定位子计划，子计划定义切片；已执行的事实和下一步写在这里，避免多份“最新进度”。

## 当前状态

- 2026-10-25 接续中：按本聊天用户授权补齐 Forge 以外模块在 ServerNext 6.0.6 的适配与验收；八个候选已安装，IFS来源metadata与House药水规范化另有定点更新。Babele两表、House药水、Monitor短会话/重载、Guard裁剪/禁用/重载及各自限定恢复已实际接受；Painter另补真实Region移动、linked falling与普通重载，精确本例清理和工具删除后读回已过，非GM仍待Role。Species食人魔原生授予、1/5级、消耗/拒绝、长休/Context、普通重载及本例精确清理现已接受；BH、IFS无CC、Resolver、Role和最终工具/文档衔接继续。原Calendar未知前像由用户选择本轮保留当前UI并记录缺口，本批尺寸键仍单列，不扩大功能设置许可。下方10月12日段保留为既有记录，本轮身份、边界与最小检查选择见文末接续段，不将旧PID或候选号当作当前证明。

- 日期：2026-10-12。
- 阶段：LOCAL_SOURCE_AND_DELIVERY_BATCH_VERIFIED_NATIVE_GATES_PENDING。H4/Deck/TE/CC/WMP既有代表链保留；IFS、TokenSync、Resolver、Chat Guard、Monitor、House、Painter、Babele的新候选源码/包已核但未安装，BloodHunter仅Preview修复/浏览器单包检查，Species保持既有纯内容边界。36项手册和最终H4双交付刷新完成；架构门通过。Forge仍占共享Chrome，继续避开，待实机窗口与Forge成果交接；整体重构未完成。
- 本次授权：用户明确先做H4的模块包/离线手册交付准备，之后按大计划连续推进小计划直到结束或真正必须停下，不开启goal模式；持续避开Forge使用的5.3.3 Mirror。普通可逆实现/测试/文档不逐次询问；Git/生产/外部发行及缺失产品决定保留各自权限出口。
- 架构负责人：本聊天主控；实际模块writer在实施范围确定时登记，同一状态家族一个writer。
- 基线：`master` / `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`。
- 文档候选：本任务既有 `codex/20261011-144833-suite-direction-console-handbook` sibling worktree，前轮未提交更名/手册候选继续保留。
- 主工作区基线为3734eb2，仅既有`.omo/`未跟踪；未读其他Forge工作树未提交成果。旧Next PID34112退出原因UNKNOWN；用户2026-10-12回复“你启动就行”后按原app/data恢复PID38672、creation UTC02:54:55.8460570Z、单loopback30002/nobackups；原生Launch cor-cotn/GM登录各一次、新owned Chrome tab651343827及606/WMP加载身份已核。原916文档限定接受/设置旧UNKNOWN保留；Mirror、生产和LevelDB未触碰。
- Git/外部状态：未commit、merge、push、改仓库名、发布商品或操作生产。

## 阶段与下一步

| 阶段 | 当前状态 | 已有/下一结果 |
| --- | --- | --- |
| P0 规划与基线 | PLAN_READY | 总/子计划、引用、命令、owner覆盖和独立事实复核已完成；不是实施PASS |
| P1 统一手册/合集入口 | H4_LOCAL_DELIVERY_ACCEPTED | 双交付与Foundry投影/更新页已限定接受；离线HTML视觉、外部渠道及H3历史恢复边界保留 |
| P2 独立模块试点 | D3_GM_REPRESENTATIVE_ACCEPTED | 606真实HP20→13→20、原生ex3→4→3、普通重载与两轮精确恢复接受；玩家/失效UUID/禁用UI和完整准入尚有缺口 |
| P3 规则家族 | TE_CC_WMP_IFS_WITH_CC_REPRESENTATIVE_ACCEPTED | TE首次保存、CC状态/伤势/IFS episode及WMP单GM Slow/duplicate/重载/已知恢复接受；IFS有CC仪式/真blind/历史重放/重载/下一episode和清理已接受，无CC独立链仍待 |
| P4 制作链/法术契约 | RESOLVER_R1_R3_SOURCE_VERIFIED | R1边界、R2提交读回/精确恢复与R3同源帮助已完成源码/包检查；原生水合/施法待验，完整K1/Forge J0仍需当前Forge成果交接 |
| P5 其他独立/内容功能 | NATIVE_ACCEPTANCE_IN_PROGRESS | Babele两表、House药水、Monitor短会话/重载、Guard、Painter事务/移动及Species食人魔链已限定接受；Painter非GM、BH新角色等缺失出口继续，旧User恢复缺口保留 |
| P6 分批发行 | LOCAL_CANDIDATE_DRAFT_READY | L1/L2本地交付与四包机械校验通过，L3目录草案；原生准入、品牌/套餐/分发及Git授权待定 |

已交付：**H1内容重构、H2/H3命名功能及H4本地双交付准备**；Deck已补D1版本呈现和D2受控错误反馈，详见下方记录。只适用于精确Core14.368/dnd5e6.0.5及命名场景；H1离线视觉、H3历史恢复及完整Deck准入仍有缺口，没有合并或发行。

## 模块队列

此表登记实施进度；“计划已核对”不能代替运行PASS。

| 子计划/切片 | 实施状态 | 主要前置 |
| --- | --- | --- |
| Suite H1–H4 | H4_LOCAL_DELIVERY_ACCEPTED | 本地包/投影/更新页已接受；离线视觉、外部发行及H3历史恢复缺口保留 |
| Deck D1–D3 | D3_GM_REPRESENTATIVE_ACCEPTED | D1/D2与606 GM代表链、普通重载/恢复接受；r1失败原件保留，玩家/失效UUID/禁用UI等尚未执行 |
| Trigger T1–T3 | FIRST_SAVE_SINGLE_GM_ACCEPTED | 606首次保存、管理器/事件/退订/重载与CC消费者接受；自身夹具精确恢复，WMP Slow消费者另有代表链接受 |
| Conditions C1–C3 | SINGLE_GM_REPRESENTATIVE_ACCEPTED | Addled/Frozen/Manager/普通重载/外来效果、HP伤势/原生短休及IFS当前episode合作和精确清理接受；非完整19状态或复活接受 |
| Weapon W1–W3 | SINGLE_GM_SLOW_AND_KNOWN_RESTORATION_ACCEPTED | W2/真实Slow/duplicate/普通重载与全部自有对象/两Macro删除后读回接受；原业务normalized指纹同，normal stats例外、旧User UNKNOWN和其他精通/角色缺口保留 |
| Fading F1–F3 | 606_WITH_CC_RITUAL_BLIND_HISTORY_REPLAY_RELOAD_CLEANUP_ACCEPTED_NO_CC_PENDING | 最终骰来源metadata已实装；有CC实际future999零写、原生贡献、真blind结果/隐私、旧卡一次重放、普通重载、下一episode和精确清理已接受，失败输入原件保留；无CC独立链及原配置恢复仍待 |
| TokenSync S1–S3 | 606_GM_HUD_HELP_ACCEPTED_UI_GAP_USER_ACK_ROLE_PENDING | 606真实普通/分级/linked去重/overlay/fly/Default/帮助已过并清自有对象；Calendaria旧坐标缺失，用户已确认本轮保留已核当前B并记录缺口，原12 REVIEW不改为恢复PASS；角色/第二客户端出口未执行 |
| Forge J0–J3 | DEFERRED_OCCUPIED | 正在进行的Forge成果及其可交接基线/测试窗口 |
| Resolver R1–R3 | SOURCE_VERIFIED_INSTALLED_RUNTIME_PENDING | 原事务/模块回归、帮助/接线/构建及类型结果保留；候选已实装并核对完整文件树，真实水合/原生Cast/Undo/重载出口待独立工具验收 |
| Painter P1–P3 | 606_TRANSACTION_MOVEMENT_LINKED_FALLING_RELOAD_SCOPED_CLEANUP_ACCEPTED_ROLE_PENDING | 原FireI/Undo/Redo/veto证据复用；新实机一格Region距离10/成本15、A升空后B地走按lastMovedToken清falling、三次真实API movement与完整source普通reload通过；原Scene/NPC/工具准确删除后原11集合/设置/User已采范围恢复通过，非GM仍待Role，本批工具尺寸键单列 |
| Guard G1–G3 | 606_TRIM_DISABLE_RELOAD_HELP_SCOPED_RESTORATION_ACCEPTED | 一次25消息/20页面卡、禁用reload25卡/0裁剪、再启用20卡和帮助通过；消息/设置已清，Monks偏好精确恢复与helper删除后GET、原主最终恢复读回通过，原13 REVIEW保留；不推广真实缩略图/滚动暂停/长时 |
| Monitor M1–M3 | 606_SHORT_SESSION_API_VISUAL_RELOAD_RESTORATION_ACCEPTED | 同一真实会话跨普通reload恢复、6 samples/6 events、单次stop与原历史hash保持；世界/设置及本例User已采集范围一致，测试archive公开list/export缺席和reader删除后GET均通过；不推广companion/长时 |
| House H1–H3 | 606_POTION_API_VISUAL_RELOAD_ACCEPTED_USER_GAP_ACKNOWLEDGED | 新模型规范化已实装，真实Apply/schema2/三Activity/手改保护/Restore/重载通过，世界与设置精确恢复；旧User整体恢复未知由用户明确保留当前状态继续，原REVIEW不改写；不推广其他村规 |
| Babele B1–B3 | 606_TWO_TABLES_API_VISUAL_RESTORATION_ACCEPTED | 2026-10-25真实25/5中文行、原UUID、重复渲染、真实窗口后来源/全世界指纹及0外来写通过；准确临时Macro删除后GET与完整恢复接受，不推及整表库/掷表 |
| Species SP1–SP3 | 606_OGRE_NATIVE_GRANTS_LEVEL5_USES_REST_RELOAD_SCOPED_CLEANUP_ACCEPTED | 同一新Actor原生Large/四零级特性/每级HP3，Barbarian1 HP15/40与5 HP55/50/AC8/dark60，正式物种5级脱困和FastMovement来源；两次消耗、第三拒绝、长休2、全Context同原、普通重载及精确清理通过。旧2个未知veto保存；不推广ASI属性生效/全物种/全等级/全部Activity/武器自动化/生产 |
| BloodHunter BH1–BH3 | NEW_CHARACTER_GRANTS_RUNTIME_PENDING_OLD_ACTOR_PREVIEW_ONLY | 用户本轮已限定新建角色与职业授予，旧角色更新只读预览，Copy/Apply备份路线不执行；既有源码/构建证据保留，6.0.6真实新角色/四子职授予待验，发行不属本轮 |
| Midi MI1–MI3 | MI1_LOCAL_AUDITED_RUNTIME_PENDING | local.9六patch与lock一致；local.10历史接受另列，实装交接/MI2–MI3未执行 |
| 外部候选 E1–E3 | E1_E3_LOCAL_REGISTER_READY | 逐候选来源/版本与去向已登记，分发条件UNKNOWN；无新需求不做E2广泛适配 |
| 共享核心 K1–K4 | K1_BASELINE_AUDITED_FORGE_HANDOFF_PENDING | 当前基线owner/省略版本调用已列；K2–K4须对接工作中Forge成果 |
| 应用 A1–A4 | A1_BASELINE_AUDITED | 当前组合面/默认值已核，命名/手册已做；A2/A3尚无新的产品使用场景 |
| 发行 L1–L4 | L1_L2_LOCAL_VERIFIED_L3_DRAFT | H4双交付和四消费者机械校验已做，候选目录可审阅；原生准入/内容范围/品牌渠道及Git授权待定 |

## 本次规划记录

1. 读取当前已提交架构、前轮候选与支持记录，确认原七月架构搬迁已经完成，不重新执行。
2. 两项独立只读核查分别确认17个owner的实际依赖与验证入口、手册宿主/ID映射/样式风险。均未改文件或运行测试/服务。
3. 总计划采用统一手册优先、Deck试点、真实规则依赖家族、制作契约与独立功能分批接续；没有发明Forge→Resolver→Painter调用链。
4. 为全部现有owner及拟新增入口写独立子计划；支撑工作流单独归属，不为所有功能强行建mod。
5. 手册方向独立复核确认双交付、ID分离、独立性与安全边界一致；按建议把H2收紧为零世界文档写入、零game.settings值变更，渲染/路由/复制不触发操作。
6. 模块事实复核确认15个维护模块的runtime ID/包版本、2个外部owner及主要小计划准确。修正P3遗留的TokenSync→CC前置措辞，图中明确CC/IFS双向可选协作，并列全CC三组精确版本门。

## 本次验证选择与结果

本次只有文档规划和索引链接变化：检查本计划内Markdown引用/本地路径、根命令真实存在、禁止raw入口、17个owner覆盖、15个runtime ID与源码映射、计划/实施状态口径和现有手册stale。不会执行每个子计划里的命令，不跑全仓CI或Chrome/Foundry。

首轮本地文档检查发现校验器只发现src/module.json，映射核对只覆盖14/15；补充读取根module.json并要求完整15项覆盖后再核对。这是文档核对工具的覆盖缺口，不重跑业务。结果在下方续记。前轮更名/手册的测试和Web接受仍保留原候选身份，不因写计划重新测试；手册file URL拒绝、Forge环境占用与锁定Bun整合CI未执行仍是原来的边界。

最终文档核对为PASS：25份Markdown、18份模块/owner子计划、3份支撑工作流；现有17个owner全部覆盖，15个runtime manifest ID/版本映射与源码一致，138处本地链接存在，56个所列根命令/入口存在且无人工raw调用。这里检查的是计划中命令可用性，没有执行这些业务命令。`git diff --check`通过；现有 `handbook:status` 与 `handbook:check` 均通过，35项来源/指纹保持一致，不需要刷新review或生成HTML。独立事实审阅结果已由主控合并到文档。

本地检查原件为本任务 `.local/suite-direction/plan-validation.json`；规划只改文档及导航指针，不改变业务实现或运行目标。因此没有运行模块测试、全CI、浏览器或Foundry；这些属于后续各切片的实际出口。

## H1 实施记录

- writer/候选：沿用本任务worktree；主控负责共享视图、standalone adapter、内容投影和构建接线；模型worker仅写`packages/suite-handbook/src/model.ts`与对应测试。
- 本批变化：新增browser-safe包，把原全局页面状态抽为`mountHandbook(root, content, host)`；保留35个条目ID、全部sources/watch/review和单文件HTML。构建端从真实manifest读取runtime ID，另导出同源JSON供H2使用。
- 验证选择：变化涉及公开包边界、宿主副作用与构建产物，运行模型/双root/生命周期/异步复制测试、既有手册Node与安全Bun测试、包类型和architecture门禁；对照HTML内嵌数据与JSON导出，检查手册review与生成一致性。测试覆盖实际新增风险，不执行Actor生成、模块E2E或全仓CI。
- 工具链：本机全局Bun保持1.3.8；本批使用任务目录内官方1.3.14，归档SHA-256与官方发布摘要一致。PowerShell下载停滞只停止本任务进程，curl断点传输后完成校验。新锁文件仅新增suite-handbook workspace，没有外部依赖升级。
- 接受边界：此前Chrome对手册file URL的明确拒绝继续有效，不尝试临时托管或替代浏览器；本批非浏览器行为证据不代替真实视觉接受。Forge Mirror仍由其他工作树使用，本批不访问Foundry、不操作服务。
- Git/发行：没有commit、merge、push或安装/发布授权，保持本地候选状态。
- 独立审阅复现新增宿主风险：复制按钮置于form时默认提交宿主表单。补显式`type=button`、阻止该点击默认动作和submit=0回归；这是未来ApplicationV2宿主边界需要的检查。
- 首轮14个共享包测试及19个Node手册测试通过；异步复制已测remount后晚到，继续补单纯dispose与同实例reroute两种实际生命周期，再仅重跑受影响共享包测试。类型与架构检查独立执行中。
- 类型和architecture门禁通过。standalone adapter新接管pushState/replaceState，既有测试只通过hash事件进入页面，尚未直接证明点击与浏览器返回的适配路径；补一个使用真实内联bundle的导航/history/全局快捷键场景，再运行手册Node与安全Bun入口。
- 该补测在Node与Bun两环境均复现JSDOM对file来源pushState的SecurityError。根据已安装JSDOM的Location/navigation实现，静态适配器改用原生hash与`location.replace`，并抑制自己已渲染hash的重复事件；不改HTTP目标、不绕过Chrome拒绝。新增路径/返回与搜索替换需复验，现有共享包/类型/架构结果按受影响范围保留。
- 改用hash后首次点击路径已通过；返回用例误接收点击尚未派发的旧hashchange。测试改为同时核对当前hash与event.newURL达到目标，并设1秒失败预算，再直接验证连续搜索不增加history长度。没有用无条件等待掩盖返回结果。
- 新测试被Bun转译执行，但各package的src-only tsconfig不检查tests；补根`typecheck:all`验证新测试与全仓类型组合，并复验改过的standalone类型/安全Bun runner。完整业务CI仍不在本批集成范围。
- 根类型检查仅发现新增模型测试固定fixture的三处数组可能为undefined；补该已知非空fixture的类型断言，再重跑根类型检查。非业务实现变化，不重复架构/Foundry验收。

## H1 最终结果与接续

| 检查/证据 | 结果 | 实际覆盖 |
| --- | --- | --- |
| `bun run test:suite-handbook` | PASS，14项/170断言 | 搜索/路由、安全文本、双root、默认宿主全局隔离、dispose/remount/reroute、晚到复制、form提交为零 |
| `bun run handbook:test` | PASS，20项 | 真实内联bundle的静态行为、file来源导航/返回/连续搜索替换、review与来源/目录/命令拒绝路径、HTML/JSON同源 |
| `bun run handbook:test:bun` | PASS，20项 | 固定Bun1.3.14、安全包装runner下同一手册组 |
| `bun run typecheck:packages`、`typecheck:all`、`typecheck:handbook` | PASS | 15个公共包、standalone/client及新增测试的类型组合；adapter后续修改用独立handbook类型入口最终复验 |
| `bun run architecture:verify` | PASS | 1,250模块/2,840依赖，零边界违规、零环；新增browser-safe包独立规则 |
| `handbook:review/build/export/check` | PASS，35项 | 仅受影响的verification-development人工对照更新；全部watch保留、两份构建同源 |
| 生成文件读回 | PASS | 35个旧ID完整保留、15个自有manifest ID、71份来源、61个命令块逐页核对，HTML内嵌内容与export JSON相同 |
| `git diff --check`、计划链接/命令/owner核对 | PASS | 当前候选文义与引用；未执行计划中的业务命令 |

生成HTML为1,173,313 bytes，SHA-256 `a521a6c376c0fd97f4e6287c627be44816fbc4840b674b3ea84af134d5cbd772`；导出JSON SHA-256 `332f6560afa59bfcd2d7a24ad04229a9ad7cb1712b8c6bde607ca62345fc1773`。原件见本任务`.local/suite-direction/h1-artifact-readback.json`及`h1-*.log`；固定工具链收据在`toolchains/bun-v1.3.14/receipt.json`。dist与工具链均为忽略产物，不成为第二份可编辑正文。

独立审阅原P2已修复并补审解决；本批没有剩余必须修复项。真实Chrome视觉/窄屏接受保持NOT_EXECUTED，原因是既有file URL明确拒绝；Foundry真实运行、H2窗口、模块安装状态、全仓业务CI及外部发行均NOT_EXECUTED。非浏览器JSDOM证据不提升成真实浏览器或Foundry PASS。

下一步只推进H2：读取精确Foundry V14窗口接口，建立应用根内样式和只读帮助入口；使用世界的测试安排需避开当前Forge占用。现有模块、仓库名与发布状态没有被H1改变。本任务仍是未提交worktree候选，未commit/merge/push/部署。

## H2 实施与验证选择

- 用户本次明确“继续H2，把FVTT里的只读手册窗口做出来”，验收继续避开Forge占用的5.3.3 Server Mirror；旧H1禁用全部Foundry目标的合同不作为H2目标授权，新的H2合同只允许已核对的ServerNext。
- 沿用本任务worktree与技术工作名`fvtt-suite-console`；不冻结商业品牌、旧module ID不改。GM设置菜单与API都验权，窗口单实例；默认不加载或启动其他工具。
- 精确Core接口：Context7仅作v14导航；读取本机14.368 package/`client/applications/api/application.mjs`与`client/helpers/client-settings.mjs`，确认`_renderHTML/_replaceHTML`、等待_onRender/_preClose及不等待_onClose、registerMenu只注册menu不保存值。官方API/原始架构issue另存本批review；本模块不调用dnd5e接口。
- 验证选择：源接口校准后的窗口/注册测试覆盖GM/player拒绝、单实例、重绘/关闭、主题/复制和零业务写入能力；构建与manifest/内联内容身份核对、应用CSS解析及作用域、模块类型与架构检查。实际Foundry/Chrome验证入口、窄窗布局、关闭/重开、复制与设置/文档不变，保留前后真实身份。
- 环境调查：只查ServerNext进程与30002监听，当前均不存在；目标数据根与modules根为普通目录。占用中的Mirror不访问、不安装、不刷新、不启停；不复制新Lab，不接生产。
- 外部/Git：尚无commit/merge/push/生产或公开发行授权。独立Chrome沿用用户选择的GPT-6.1 Sol/medium及自动回调授权，待候选和目标前置齐备后派发。
- 独立审阅复现P2：Core正在等待_preClose时rendered仍为true，API的closeHelp后立即openHelp没有进入render队列，可能成功返回却最后关闭。统一让打开经过Core render semaphore，复用既有暂停点补API及直接窗口close两种回归；此修复只重跑受影响模块测试/类型，保留既有共享包、手册与架构证据。
- 手册受影响项已逐项对照：version-selection/markdown-convert/monster-intake只因支持表新增H2候选行失效，原生成目标、步骤、输出与限制未改；foundry-ops补自有首次安装白名单说明，拒绝覆盖/链接/陈旧manifest不变；verification-development核新宿主、构建与测试入口；suite-console新增独立用户条目。准备更新6项review与两宿主构建，原35个ID保持，新总数36。
- 修后H2模块11项/91断言通过，API close及直接窗口close交错后均只留一个有效窗口；Foundry/standalone重开文案分开。模块和17项首次安装保护、14项共享包、20项静态手册、模块类型与architecture结果保留。
- 新包首次安装到Next普通目录，5文件inventory SHA-256 `37bdece2644c0207e2fec54e567f9dceb5167c68d2aa875c1bb1e06faf9d488c`与预览相同，无覆盖/备份。初次启动预检因旧options锁目录存在而停在启动前；只读核对其为2026-10-05留下的空普通目录、无Next进程/30002监听，并对照proper-lockfile4.1.2的stale恢复实现。后续使用原生启动流程处理过期锁，不手删Config锁、不改Config值；原子安装成功结果不因该前置层重新执行。
- 原生Next启动成功：PID15696、Node24.17、127.0.0.1:30002、active/cor-cotn/Core14.368/dnd5e6.0.5、stderr0；不以旧PID代替现场身份。客户端脚本与CSS的磁盘及HTTP SHA分别为`e2d4d3316321cdcd1a2c7fb77b29374fd1e06b95184a9f44c3ecf548ef29c51a`、`69f46d9885a37e56bfaa88d54e3fae7ce0be9f654e70a7d1013516c6a6c98e47`，内容digest `72f01274c4e796c217ec070b0b269e58ab31e71510a623a6daa0c2328ab6ea9f`，36条。
- H2 Chrome派发已接受：`H2-HANDBOOK-20261011-01/r1`，复用独立聊天`01a129cb-499f-7080-92d4-1f3ec433a168`与原正式Chrome路径，用户模型选择GPT-6.1 Sol/medium及自动回传父UUID授权继续有效。执行器需重新核实际turn_context/Full Access。只允许Next新产品入口及本批自有Macro；原H1 file拒绝不重试、不托管，不访问Mirror。验收PENDING，未把安装/单测当运行PASS。
- r1回执：登录PASS，Core14.368/dnd5e6.0.5与新模块0.1.0正常可见；当前官方Chrome只读求值作用域不暴露game/window.game，无法按原合同读取API及私有probe状态。执行器在启用模块前停止，未改开关、未创建Macro，已关闭自有tab并保留Next服务。这是读取能力缺口，没有产品FAIL。
- r2只修本次Macro证据面：通过正常ApplicationV2 DialogV2显示clientIdentity、stage与完整脱敏report，使用DIV content和纯textContent；连接器只读DOM，不扩大求值或改变通道。流程顺序修正为UI核版本→仅启用新模块→原生Macro显示已加载身份。Node/JSDOM五个场景通过，含普通/编辑器新建、未启用拒绝、嵌入Token变化被检出、清理失败仍有可见收据；原观测结果和产品检查无需重跑。最终源SHA `8c7cd33c0e265eec432b769b7e192504b20800987e964c27263f870d27837525`，可见收据中的规范化执行源SHA应为`a423dbcbd8256cc9b38b32b6e749ac02ce976386d04f932353af6c625bddf2c8`；业务模块构建/安装/HTTP身份保持原批次。r2已由同一独立Chrome聊天接受，当前等待完成或真实阻塞回调；父不轮询，不提前宣布H2实机通过。

- r2回执确认新模块已启用，active count由99到100，唯一checkbox变化是`fvtt-suite-console:false→true`；客户端正常重载。自有Macro第一次执行在`showReceipt(initializing)`遇到Core14.368的`config.content element must have no attributes`，早于任何snapshot、settings包装或Hook安装；执行器正常删除该Macro并关闭自有tab，Next服务和新模块启用状态保留。菜单、窗口、复制、只读性运行证据仍未执行，不能把这个工具错误判成产品失败。
- r3只修收据根容器：对照精确`dialog.mjs`的初始化规则，先在私有模拟中加入构造时必须DIV且无属性、转成innerHTML的约束，复现原失败；再把阶段属性移到内层DIV，五个原场景通过。源SHA为`83a0ee30f1d9f83c768fd2b8e2fd88e490fe887a163c8585988e6d69737f9276`，规范化执行源SHA为`90d787dcefc5989481be1a3933797267096ce51b660b1b8c2bb70f4f49e9a67f`。新合同复用r2启用/开关/清理证据，只补实际窗口和只读性；产品代码、构建、安装和已通过局部检查未变，不重复这些步骤。派发前核Next仍为PID15696、127.0.0.1:30002、同一14.368/server-next进程。

- r3实机结果保留：身份、GM设置入口、36条/73原文、旧称与用途搜索、prepare/steps/limits定位、原文返回、正常复制、关闭/重开/重复入口单实例、1000×720宽窗和420×620窄窗目录/复制回退均有真实证据；世界/设置/global及最终世界/设置哈希一致、settings.set调用为零。总体仍FAIL：截图确认卡片/工具行重叠、浅色标题对比不足；原观察器捕获1次preUpdateUser和2次preUpdateMacro却没有ID/字段/栈，归因未知。不能用其他PASS掩盖这些缺口。自有Macro与tab已清理，方法/Hook/clipboard已恢复，Next继续常驻。
- r4修复与最小复验选择：CSS writer只改应用根内按钮的高度/布局及标题、悬停颜色；对照Core14.368固定button高度和heading主题变量，Bun CSS解析与定点规则检查通过。条目用途/入口/步骤/限制未变，人工对照suite-console来源与窗口实现后仅更新该stale review并生成同源产物。真实复验只检查宽/窄主题的标题对比、卡片和工具行排布，以及同一行为批的只读性，不重放搜索/原文/生命周期业务矩阵。
- r4证据工具变化：精确`MacroConfig.#onExecute`源码表明每次Execute先submit再execute，但r3没有document ID，因此仍不追认旧事件归因。新工具只由Macro启动一次，准备完成后通过DialogV2页面内存按钮开始观察、变窄和结束；基线前关闭Macro编辑器，阶段推进不提交文档。所有写事件继续严格失败，不豁免自有Macro；补document/parent身份、changedFields和脱敏栈。六个私有模拟场景通过，包含有事件但哈希未变仍FAIL、敏感值不进入报告及精确清理。最终结论仍须新实机证据。

- r4候选已完成受保护更新：原Next安装5文件完整inventory仍匹配本任务首次安装收据，精确PID15696/127.0.0.1:30002未变；只写本模块CSS、随review元数据变化的JS与build-identity，manifest/README保持，不动其他模块/配置/世界/服务。新5文件inventory为`6d8d0291dcf2e53ca487f808d460acae5d318a7e0fc00728b2e35581f691e33e`；磁盘及HTTP读回JS `b67a07cb44a4a8374aa594810e292125cea59ff32bfacded108f5d70d74691e7`、CSS `ed14ddb173ac29e1b31487b80dfa366a7b169bc55507ff39854218e8429c0006`一致，contentDigest为`ee27cd0a1ca41fecddcd4a23bc1c3ede15946f60ec533f8fa26c9d503bad85ae`。排除review后整个DTO哈希与r3相同，确认36条正文与全部sources未变；handbook:build/check及模块build通过。原始首次安装工具仍拒绝覆盖，没有修改该保护。
- r4合同复用r3的GM菜单与导航等有效证据；本轮通过正常测试Dialog按钮调用已安装模块公开help API打开手册，Chrome只操作可见UI、读DOM。新probe源SHA `99ea2e741c71f1f335062a3a535895b56485da6fda2579b1b70b095bdf308cc7`、规范化SHA `ea7f9fedb5a9a7bf96ec76c7a2b812e84d818e718105b3aca0798181d3925134`，六个模拟场景最终通过；保留r3完整源和失败原报告，不追认旧三次写事件归因。实机视觉与只读门禁仍待同一Chrome执行器回传。

- r4实机修正版：宽窗1000×720浅/深标题与卡片、工具行几何和窄窗420×620深色步骤/命令通过；父已查看`wide-light-settled.png`与`narrow-dark.png`。浅色窄窗只有计算色/几何有效，后续手册与测试Dialog同时缩到各自CSS最小值、移到0/0，三张裁图无效，不追认通过。观察无Macro事件、settings.set为零，7次User更新均指向Tokenbar位置，原轮严格零写仍FAIL；清理完成、Next常驻。
- 对该重复失败改用宿主/工具层诊断：本机Tokenbar14.01与Core14.368源码确认window.resize→全部ApplicationV2.setPosition→Tokenbar1000ms防抖保存User位置；Core会把极小可用空间计算结果存回实例，解释360×420和200×52两个最小尺寸。七次User事件均落在七次clip截图调用区间，支持截图相关解释；r4未记录瞬时viewport，因此不宣称已唯一证明内部原因。详见[调查记录](../../reviews/2026-10-11-h2-handbook-acceptance-resize.md)。没有改第三方模块、开关、Core或浏览器provider。
- r5只补浅色窄窗及零写门禁：产品候选、安装及手册内容保持r4身份；同一官方Chrome连接器只用fullPage:false完整视口截图，取消clip/viewport变化，不重放有效矩阵。私有工具增加被动resize的前后尺寸/自有窗口位置记录、当前User Tokenbar位置哈希和监听清理，保留全部写事件为FAIL。七个私有模拟场景通过；新增调查文档不改变手册内容，handbook:check与diff检查通过。父等同一执行器真实回传再作结论。

- r5实机回执PASS：仅完整视口截图，浅色420×620首页/工具行/步骤命令及目录通过；所有截图前后viewport2560×1215与窗口420×620/位置保持。worldWriteEvents/settings.set/resizeEvents全部为空，世界/设置/global/User Tokenbar位置前后和最终摘要一致，全部测试资源清理；父已检查三张有效截图及完整report。r4原FAIL及无效裁图继续保留，r5支持取消clip后路径无resize/写入，但不冒称主动复现了截图内部因果。
- 最终人工复核发现额外命令显示问题：Web条目的两条原始命令含换行，Foundry Core `code`的`white-space:nowrap`仍压过外层pre的继承，截图合为一行。补`.command > code`的局部pre-wrap/长词换行与无内层padding；新增以实际Core相关规则为前置、核有效计算样式及宿主外code不变的回归。模块12项/99断言通过；新测试文件进入根类型组合，补typecheck:all。只复验多行/长命令显示和fallback选择；r3/r4/r5其他已通过证据按逻辑与内容绑定继续复用。完成状态待这处实际显示缺口闭合。

- r6准备完成：模块12项/99断言、根typecheck:all、handbook:build/check、模块构建通过；8个私有工具模拟场景覆盖命令选择的原文/行数/SHA读回。原r4安装inventory精确匹配后只更新本任务的CSS、JS review元数据和build identity，新的inventory `13b662ce91048e862b891eae7a0d5ce2818434ebc0e3d76c943a648eb99a806e`；磁盘与HTTP的JS `0154f6d34888f987c83c29f5032d70698e2ad13ca5bb1b74fd5443d29231ce8c`、CSS `fb626ab0c826c6d47963e5f34aba205dd82f42b0f530717d81eb9868961c58f1`一致。contentDigest `a8c7219bcd56d89fb396eb55f613c6201ec124369613f73e4cabf3e0aefa891f`；排除review后DTO仍与r3/r4相同，Next进程未重启，其他文件/模块/配置不变。

## H2 最终接受与交付

结论：**H2_LOCAL_ACCEPTED**。目标为ServerNext `http://127.0.0.1:30002`、Core14.368、dnd5e6.0.5、`cor-cotn`，模块`fvtt-suite-console`0.1.0。主控已读最终原始report、对照命令来源并查看有效截图；不只采信执行器PASS。

| 层级 | 最终结果与证据 |
| --- | --- |
| 构建身份 | r6的contentDigest `a8c7219bcd56d89fb396eb55f613c6201ec124369613f73e4cabf3e0aefa891f`，JS `0154f6d34888f987c83c29f5032d70698e2ad13ca5bb1b74fd5443d29231ce8c`，CSS `fb626ab0c826c6d47963e5f34aba205dd82f42b0f530717d81eb9868961c58f1`；源码构建、安装磁盘、HTTP及真实客户端内容身份绑定一致 |
| GM真实入口与阅读 | r3的GM设置菜单、36条/73份原文、用途/旧称搜索、准备/步骤/限制定位、原文返回、关闭/重开/重复入口单实例通过；后续只改局部CSS和review元数据，正文与运行逻辑未变，证据复用 |
| 布局与主题 | r4宽窗1000×720浅深主题、卡片/工具行排布和窄窗深色；r5完整视口采集的420×620浅色首页/滚动工具行/步骤，目录和无横溢均通过 |
| 命令与复制 | r6两行命令的textContent/innerText保持原文；fallback实际选择2行，UTF8 SHA `2ea8b37fc7eb0dab38d69d3316937eb4c7053fc1aa10f2149bbea3c531d4e3a5`与来源一致。156字长命令在420px窗口约4行，code/父块/root均无横溢，未执行文档命令 |
| 严格只读 | r5/r6均为worldWriteEvents=[]、settingSetCalls=[]、resizeEvents=[]；世界、设置、URL/title/主题、viewport及User Tokenbar位置前后/最终哈希一致。267项敏感或隐藏设置不读取原值，但全部settings.set调用仍在观察范围 |
| 生命周期与拒绝路径 | 模块12项/99断言通过，含GM/Core拒绝、根隔离、重绘/关闭释放、API及直接close/open交错与Core inline-code样式回归；玩家UI没有新建账户实测 |
| 共同检查 | 共享包14项/170断言、静态手册Node及安全Bun各20项、17项首次安装保护、模块/根类型及architecture保持有效；最终补根typecheck:all、构建、handbook:check。没有执行全仓业务CI或未受影响模块矩阵 |
| 清理与服务 | 本批Macro均按精确身份清理；最终Hook/settings方法/clipboard/resize listener恢复、自有tab清空。Next15696/30002与新模块启用状态保留，供用户试用 |

完整私有证据：本任务`.local/suite-direction/h2/chrome/r3`至`r6`，最终`r6/report.json`、`selected-multiline-confirmed.json`、`long-command.json`、`multiline-confirmed.png`及`long-command-wrapped.png`。r6首次误选第二个复制按钮的收据保留，只有按data-copy=0核回的正确两行收据用于接受。r4窗口漂移与Tokenbar写事件原件、无效裁图继续保留，未用最终PASS抹去；[调查结论](../../reviews/2026-10-11-h2-handbook-acceptance-resize.md)区分相关性与未直接复现的内部原因。

收尾机械核对PASS：当前构建/安装5文件、最终报告目标与内容身份、命令来源SHA、原始前后字段及精确清理重新读回一致，原件`h2/final-parent-validation.json`。读取器首次误把`ownedTabsAfter`取自browser，按实际r6的cleanup字段修正后通过，没有重跑有效浏览器行为。计划索引核对25份Markdown/18子计划/18个owner/16个manifest/140链接/60个可用命令通过；只检查这些命令存在，没有执行它们。最终handbook:check及diff格式检查通过；主工作区仍为3734eb2和原`.omo/`。

交付仍在本任务worktree，未commit/merge/push、未改仓库名、未公开发行或安装生产。Mirror5.3.3、其他Core版本、玩家阅读面、H1静态HTML视觉、H3模块组合/帮助接通及H4分发包不在本次接受范围。下一步按H3小计划推进，不由H2通过自动启动其他模块重构。

## H3 实施与验证选择

- 用户明确“继续H3，先把模块安装/启用状态和Deck的帮助入口接上”，继续避开Forge使用的5.3.3 Mirror。沿用本任务worktree，不提交/合并/推送或扩展生产。
- root负责shared reader状态端口、Suite0.2.0/API ABI1、目录loader及说明；独立Deck writer负责Deck0.2.0的共享工具栏、公开帮助/权限、包内后备与相关unit。不同writer没有交叉改同一子系统。
- 状态只读当前客户端game.modules，以真实runtime ID查找；已启用、未启用、未安装、未知和实际版本分开呈现，不把已启用当业务支持。刷新仅更新状态节点，不重新挂载文章、滚动或复制状态。静态宿主和非模块条目不查询Foundry。
- Deck正确ABI时定位Suite的稳定open-session-deck条目；缺失、停用、未知ABI或打开失败则显示随包帮助。各入口复查GM，不调用Deck业务命令/openPanel/openPopout/设置写。后备单实例显式恢复最小化并置前；初轮后补该真实Core差异，最终Deck67项/426断言及包构建通过。
- 首个owner说明完整迁入Deck docs/manual.json，中央只保留source指针；ID、sources和watch继续保留。loader拒绝越界/链接、错误owner、双份覆盖、未监测来源和重复ID；Deck与合集从同一JSON取得正文，不手工复制后备内容。
- ServerNext现场仍为PID15696/127.0.0.1:30002、Core14.368。旧Deck安装9文件与本次修改前包差在两份README及JS；去注释后JS只差master已有的Mirror14.368/5.3.3门两行，Next6.0.5路径相同。安装更新将逐文件绑定此基线，不覆盖来源不明漂移。未访问Mirror。
- 本批验证选择：shared状态安全/刷新/无宿主副作用测试、Suite真实bootstrap接线与ABI、loader源归属/指纹及拒绝路径、Deck帮助路由/后备/权限/单实例；整合时做相关类型、architecture、同源handbook review/build/check、两模块包及安装身份。真实Chrome只验状态、Deck帮助跳转、Suite停用后的后备与恢复、面板/同会话副屏帮助和零业务写入，不重跑全部Deck命令或H2矩阵。准备期Deck现有lastOpenMode写入在观察外记录/恢复；严格帮助观察仍要求零文档/设置写入。沿用完整视口截图，保留H2禁止clip的经验。
- 当前局部结果：shared17项/195断言、Suite12项/105断言、Node与安全Bun手册各22项通过；根与handbook类型、architecture零违规/环通过。独立只读审阅未发现必须修复的问题，实机仍未执行。Bun lockfile-only保留了旧workspace版本字段；按实际package.json只同步Suite/Deck两项到0.2.0，再验证frozen-lockfile。外部依赖没有升级。
- 最终局部结果：Deck67项/450断言、foundry-modules类型、两模块构建、handbook review/build/check共36项及frozen-lockfile安装检查通过；architecture为1261模块/2853依赖，零边界违规/环。Deck说明新增帮助步骤后按同源内容重新测试，早先426断言不作为最终计数。
- 受保护本地更新已完成：先绑定Suite原5文件与Deck原9文件inventory，再只更新这两个自有模块。Suite新inventory为`3e38a3a09f0f1c7a83f5342cb84b8407bd5775e29e7b6e6a1b43d9d066fba17a`；Deck为`c6a2bc321d9fd7c09a753ad5452d70097cac31614b33547fa40411439deb5b6b`，均为0.2.0。Suite内容digest为`7bc1d7108d6afe469b17b849e07f616663f80595ff3e6a3790f1f3c61926c186`。JS/CSS候选、磁盘与HTTP逐文件一致；收据在`.local/suite-direction/h3/update-receipt.json`。无备份、无其他模块/Config/世界写入，Next仍为PID15696。
- 精确Core源码确认Module.getPackages与已运行世界缓存清单；仅刷新客户端不足以更新0.2.0元数据。H3允许在Next无人/无其他连接时，通过原生“返回设置→只重新启动cor-cotn”刷新世界清单，保留Node进程；先用自有Macro保存原世界/设置/模块开关/Deck偏好基线。执行器须再核其他活跃用户；若出现Admin Password或权限阻塞，保存现场回调，不猜凭据、不kill服务、不改镜像。
- H3证据工具只通过原生Macro和DialogV2公开DOM收据，Chrome不读取game等页面运行全局。源SHA为`cc6aeba69ad21122431cfa42cc753450b6a04291c4a3ce0a987ee0ea9a5d0dff`，规范化执行源SHA为`dd19b62f8aa9845ae42c4ffa6f97a91d3f981309d6462946758dba68b165b23d`；四个模拟场景通过，覆盖跨重载恢复、清理失败仍FAIL、Scene/Token变化严格FAIL及陈旧身份在观测前拒绝。这只证明工具行为，产品运行结果仍PENDING。
- 派发前最终核对：handbook:check为36项PASS；25份计划/18个owner/16个manifest/140本地链接/60入口核对及git diff --check通过。现场Next为本聊天PID15696、loopback30002/cor-cotn/Core14.368/dnd5e6.0.5、users=0且无建立连接。H3合同`.local/suite-direction/h3/chrome-contract-r1.json`绑定候选/安装/服务、原生世界重载、只切Suite开关和偏好恢复；原执行源已保存到`h3/chrome/r1/probe-source.js`，本批实际浏览器接受保持PENDING。
- H3/r1派发已由Codex app接受，目标为原独立Chrome聊天`01a129cb-499f-7080-92d4-1f3ec433a168`（Chrome 验收手册与操作台），保持用户选择GPT-6.1 Sol/medium与原自动回调授权。执行器核实际配置后直接验收，父UUID为`01a129b6-4b84-7eb3-9d3a-952c9aaf0c4f`。父本轮结束，按完成/阻塞回调继续证据裁决，不轮询或提前认定H3通过。

## H3/r1 实机回执与窄补查（2026-10-12）

- 原独立Chrome执行器已回传；实际GPT-6.1 Sol/medium、danger-full-access/never与正式Chrome session3均符合。Suite/Deck客户端均0.2.0、帮助ABI1和内容digest与候选一致；原生只重进cor-cotn，无Admin Password提示，Node15696未重启。Forge/Mirror/生产未触碰。
- 两轮产品帮助PASS：面板/同会话副屏正确定位统一Deck条目；17个mapped状态/版本逐项一致、Forge未安装详情和Web非模块省略状态正确、刷新保留文章与scroll1576；420×620窄窗无横溢。停用Suite后两入口都显示本模块后备、单实例/关闭重开/最小化恢复置前正确。父已亲看两张完整视口截图与前后几何收据。启用轮没有已安装未启用的mapped候选，该UI分支NOT_EXECUTED，未为覆盖额外切其他模块。
- 两轮严格帮助观察均零document/settings/resize事件，世界/设置/UserUI/模块开关/global/viewport前后相同，观察器恢复。仅Suite OFF→ON的checkbox全集与原始一致，原Deck偏好、设置/UserUI恢复、自有Macro和tabs清理均true；Next保持常驻。
- 整批原始report仍FAIL：跨原生维护和多次客户端重载，originalWorldUnchanged=false（a645a6da→42348ad0）；文档计数相同，但只有总哈希，无法定位原始差异，也不追认历史恢复。两轮各自稳定，不足以说明世界哈希为何跨客户端变化。原件完整保留在`h3/chrome/r1/`，有效业务证据不重放。
- 窄补查选择：使用新的精确owned Macro，**不打开帮助、不切模块、不重启世界/Node**，只比较一次普通客户端重载前后的逐文档/顶层字段指纹；通过精确Core的公开SocketInterface、modifyDocument **action=get**只读取服务器返回数据，区分客户端toObject与服务器读回两层。只保存ID、路径和SHA，不保存原始世界正文/备份；本工具自身排除，其他数据不修。Core14.368的DataModel.toObject默认克隆_source，Document.toObject还执行shimData；ClientDatabaseBackend把get返回数据再次构成客户端模型，所以总哈希不能直接等同持久存储证据。
- 按firsthand-research/AnySearch检索Foundry官方GitHub的toObject/reload及dnd5e source/randomID症状，没有找到与精确14.368/6.0.5相符的原始案例；不引用通用旧版升级故障推断原因。接下来以本地精确源码与无帮助对照反证；原始跨维护恢复仍保持UNKNOWN。
- 对照工具五个模拟场景通过，含GET-only请求/错响应拒绝、重复Execute、客户端独有差异、服务器差异、敏感值不落盘与精确清理失败。源SHA`cf3159c2a2e1479a49bbcfe6f14710ac26708a9ad3663c85091af6457239d6a7`，规范化SHA`94c11a55eba020fc002429d2d5260f29bdc5b45c63912e0a95f8a74b382520fb`；合同`h3/world-diag-contract-r1.json`，真实对照仍待执行。仅临时证据工具和总账变化，不改产品/手册正文或候选hash，不重跑已有效产品检查。
- `H3-WORLD-DIAG-20261012-01/r1`已由原独立Chrome聊天接受，当前等待正式完成/阻塞回调。精确接口、检索局限和历史证据边界另存[调查记录](../../reviews/2026-10-12-h3-world-fingerprint-diagnosis.md)。父按独立回调流程结束本轮；原产品文件/构建/安装身份保持，没有为了补证重建候选或重放有效帮助链。
- 对照r1回执为BLOCKED_TOOL_FAILED_BEFORE_BASELINE：首个工具保存时报`Cannot create property 'compendiumSource' on string`，零页面reload、零对照，不能给出世界差异结论。精确宏Cg7Q09TJF9gcNV3l与自有tab已清理，Next15696/30002常驻；其他模块开关/帮助/API均未操作。
- 新失败属于证据工具保存协议：ObjectField递归展开带点号的键，指纹fields字典的`_stats`字符串与`_stats.compendiumSource`路径冲突。原Mock只structuredClone没有模拟Core展开。直接导入精确14.368 expandObjectInPlace后，Node/V8复现相同错误；接入原工具测试后旧源得到tool-failed而非baseline（红），改字段路径为数组值后五场景通过（绿），包括重载比较/错误响应/真实展开/敏感值排除/清理失败。Bun/JSC的同一失败文本为readonly property，未把不同引擎文案当作不同原因。
- r2只修工具格式，保持原GET-only、一次普通客户端reload和零产品操作范围。新源SHA`d308dedf320c7ce86a75ade1527c00992ede67e9591683da5d1e916ef9d87030`，规范化SHA`0b40ba5d2005ac5283036fa60315654b6fa48d3bdaea47a4789fde4673ff45d5`。原宏已清理，r2用精确新名称`[H3] 世界指纹对照 20261012-02`；沿用原执行器和回调，不重跑产品矩阵或改候选hash。
- 对照r2已由原Chrome执行器接受，合同`h3/world-diag-contract-r2.json`、证据`h3/chrome/world-diag-r2/`；派发前Next仍为PID15696和精确目标、users=0。当前等待真实对照回调，父结束本轮；没有将本地工具模拟通过写成真实baseline或H3收尾PASS。

## H3 本批功能接受与审计边界（2026-10-12）

结论：**H3_FEATURE_ACCEPTED；原整批恢复审计PARTIAL/UNKNOWN**。本批用户要求的安装/启用状态接线、Deck统一帮助与独立后备已实现，下面命名范围有真实行为证据；不把整个H3组合矩阵、Deck全部业务或原历史恢复认定为PASS。

| 层级 | 实际结论与证据 |
| --- | --- |
| 状态接线 | 17个条目按真实runtime ID/版本与客户端逐项匹配；enabled和missing详情、非模块无状态、刷新保留文章/scroll1576通过。当前组合没有installed-disabled的mapped条目，该UI分支仅局部测试，实机NOT_EXECUTED；unknown/异常状态与静态宿主不查询由共享包回归覆盖。 |
| Deck帮助 | Suite0.2.0/ABI1开启时，面板和同会话副屏定位open-session-deck；Suite停用后两入口打开随包后备，正文/步骤/限制、单实例、重开、最小化恢复与置前通过。完整36条与全部来源保留，Deck唯一正文归模块owner。 |
| 阅读与视觉 | 420×620原生窄窗口root宽与scroll宽均418；两张完整视口截图父已查看，采集前后窗口/viewport几何稳定。H2未受影响的搜索/原文/复制证据复用。 |
| 帮助只读门 | 两个独立观察区间的document/settings/resize事件均空，世界/设置/UserUI/模块开关/global/viewport前后匹配，方法/Hook恢复。准备期已有Deck lastOpenMode写入在观察外，收尾恢复原值。 |
| 原整批恢复 | 开关全集、Deck偏好、设置/UserUI和精确fixture/tabs已恢复；维护前后的客户端世界总哈希不同，旧工具只有总哈希，无逐文档原基线，历史世界恢复仍UNKNOWN。r1原始report.status=FAIL保留，不能用两轮帮助PASS覆盖。 |
| 新无帮助对照 | r2仅正常页面reload一次，服务器GET的916个文档/10集合指纹完全稳定（serverChanges=[]，SHA d8df9d2b…）。客户端仅两Actor的items及一Scene的tokens指纹变化，证明当前对照中客户端模型与服务器读回需分层，不能追认旧维护。 |
| 对照的User事件 | 两次capture各1条preUpdateUser（同一User），无字段/栈归因，原因UNKNOWN；该诊断不满足所有Document零写，未豁免事件。其settings/moduleflags/UserUI哈希稳定，不等于其他User字段也未变。 |
| 清理/服务 | r1帮助宏、对照r1/r2宏及全部自有tab均精确清理，最终ownedTabs=[]，观察器移除；Next仍为本聊天PID15696/127.0.0.1:30002、cor-cotn/Core14.368/6.0.5，Suite/Deck按原启用。Mirror、Forge工作树、生产、LevelDB未操作。 |

本地最终检查保留：shared17项/195断言、Suite12项/105断言、Deck67项/450断言；Node与安全Bun手册各22项，相关类型与architecture（1261模块/2853依赖、零违规/环）、frozen-lockfile与两模块构建通过。仅证据工具/总账/不进入手册的审计记录随后变化，没有重跑未受影响业务或全仓CI。

完整私有原件为本任务`.local/suite-direction/h3/chrome/r1/`和`world-diag-r1/`、`world-diag-r2/`；后者report/finished/cleanup与原始r1均保留。诊断当前具体差异：Actor.65DtcQDkiSKj0Qd5/items、Actor.aMZwC9ORkpZpdlkc/items、Scene.2rQFnhlfPt5sGJ9i/tokens。没有修改这些文档或继续调查其深层原因，避免把只读帮助任务扩大成世界修复。对照不执行产品帮助或开关变化，耗时97.2秒；不与727.9秒产品接受批次作速度结论。

后续工程范围按用户下一次选择：H4交付包或Deck D1其余能力呈现。若需要严格的整批历史世界恢复证明，现有旧哈希不足以完成；不得把新基线或维护后的稳定值冒充旧源。玩家面、其他Core/Mirror、只安装合集等组合、完整Deck命令与公开发行保持未执行。本轮不commit/merge/push或新增重构切片。

收尾检查选择：父审脚本已逐文件核回两模块候选/实装及4份HTTP资源，逐字段核两轮零写报告、17状态、scroll/最小化/截图几何、原checkbox全集恢复与精确清理，保持原FAIL和两条诊断User事件。`.local/suite-direction/h3/final-parent-validation.json`为PASS，含图像hash与实际父审范围；主仓仍3734eb2和原`.omo/`。当前只改进度/审计说明，没有改变用户入口、操作步骤、支持版本或限制，手册原正文及构建身份保留；最后运行既有handbook:check、计划引用/owner/命令核对及git diff --check，确认这些文档修改未使既有生成物陈旧，不扩大业务测试。

最终文档门禁PASS：handbook:check仍36项同步，计划25份Markdown/18个owner/16个manifest/141本地链接/60入口全部有效，git diff --check通过。健康报告与Suite/Deck子计划、模块索引已同步命名功能接受和PARTIAL/UNKNOWN边界。H3本批交付保留在本任务worktree；未commit/merge/push或发布，H4及后续模块切片尚未开始。

## H4 实施与连续接续（2026-10-12）

- 本次连续授权从H4开始，随后Deck剩余D1→D2→D3，再按总计划P3–P5依赖推进可独立工作；没有H5时不虚构编号。Git/生产/公开发行、品牌/价格及被占Forge的交接仍按实际权限和依赖处理，普通步骤不再次提问。
- writer归属：root负责docs/handbook的显式投影、完整离线HTML、说明/review/根脚本与整合；suite_h4_delivery只负责Suite模块的0.3.0构建/本地交付/白名单与相关unit。原Deck writer已只读准备下一个D1，暂不改其source以保持当前H4来源一致。
- H4读取面选择：28个用户条目进入Foundry，8个工程/历史入口仅保留完整离线手册；全部36个稳定ID继续离线可读，17个runtime映射保留。delivery.json穷举两侧，拒绝未知/重复/遗漏ID及无理由省略；Foundry只带引用到的sources/reviews，没有缩小总目录watch与来源覆盖。
- H4检查选择：新增投影/完整性/工程来源不泄漏/导出路径链接拒绝测试，运行现有手册Node与安全Bun组；Suite ZIP/manifest/version/逐文件哈希/CRC/确定性/未知payload与链接拒绝由module单测和真实归档读回验证。整合执行相关类型/architecture、handbook review/build/check与本地候选交付读取；旧H2/H3未改阅读交互证据按身份复用，Foundry补投影与首次打开成本实测。H1 file拒绝保持，不托管或换通道。
- 初始实际大小：完整HTML1,194,736 bytes，Suite JS1,185,539 bytes，36项/74来源。先测投影后包和实际首开，再决定加载方式，不先引入分段/服务。H4只是本地交付候选，没有canonical下载地址或商业授权定稿，不伪造外部发行就绪。
- 投影Node组26项通过；module writer已完成0.3.0打包/安装说明和局部防护检查，尚待最终review/HTML后的真实归档读回。完整工程HTML从模块ZIP中排除，作为独立release文件交付；真实build接入handbook:check前置，防止只更新review却交付旧HTML。
- 版本前置发现官方最新稳定6.x为release-6.0.6（2026-10-06发布），Next仍6.0.5。只读researcher核官方tag差异和最后已验证启用全集，后续依赖系统的新开发先处理精确兼容门；H4只依赖Core的静态交付独立推进，不直接升级或放宽模块声明。

- H4最终静态交付：shared18项/198断言、手册Node与安全Bun各26项、相关类型与architecture（1263模块/2858依赖，零违规/环）、frozen-lockfile检查通过。Suite首轮全组15通过/1默认5秒超时；只给真实双构建用例设30秒后遇到同进程第二次Bun.build读取错误，第二次确定性构建改为独立固定Bun进程后定向1通过/40断言。此前15项有效结果保留，不声称一次全组16通过。独立审阅发现ZIP中央目录时间/日期字段偏移错误，已修并由标准Python zipfile读回5项1980-01-01及CRC全部通过；相关3项/32断言通过。
- 冻结的0.3.0本地交付包含ZIP843,568B（SHA256 `424368716369de0fed8bb775e13e5d9c89f8bfe5a174ac4782fd25187a9e9958`）、独立manifest、完整HTML1,204,060B（`e79012765ec998d07649ba52a677b3ece7a5a7b8041e0230caade3d433a03adf`）、SHA256SUMS和release-candidate收据。ZIP精确5文件；Foundry JS821,351B，内容digest `3bcbdf34a89de7d8e664a06a39f596d184f1ad8d6c4fbbd329056c43d72b373c`，28用户条目；离线36项保留。无canonical下载地址，外部发行未执行。
- 已直接从上述实际ZIP更新自有Next的Suite，先绑定原H3完整逐文件inventory，仅4个文件变化、CSS保留；新5文件inventory `a2cfbb4155ca021d8313be9f0668a7247bbeeaf6af7a130ff943c270248b7fa1`，JS/CSS磁盘与HTTP同字节，收据`.local/suite-direction/h4/update-receipt.json`。PID15696/30002/cor-cotn/Core14.368/6.0.5仍匹配，更新前users=0。没有改Deck实装、系统、其他模块或世界。
- H4验收工具复用Core14.368 GET-only/原生Macro和DialogV2路径，保存逐文档及字段SHA，不保存世界正文；字段路径用数组值通过真实expandObjectInPlace。7个模拟情形通过，覆盖跨重载持久基线、两个计时样本、观察期写入严格失败、服务器变化、仅客户端变化、错响应/错身份与清理失败。工具源SHA `b693c70cc5970de4c51c514af06521b03be24d73d444bd51e72d383ee4f28426`，规范化SHA `fe371bf3e083fe570ee8da8cbe044f7b8a29a079fb0c33a395b0ccfcdff4b728`；实际运行仍PENDING。合同`.local/suite-direction/h4/chrome-contract-r1.json`仅允许一次Next原生重进世界刷新模块元数据，保留Node；严格帮助观察不含GET采集，采集产生的User事件仍单列归因，不豁免或追认H3历史恢复。
- H4冻结实装与release文件交独立Chrome验收期间，原Deck writer可在模块源码内推进D1能力呈现及D2异步失败反馈并运行局部检查；不改冻结的Suite/Deck安装，不访问Lab。根手册最终快照在集成Deck说明时重新review/build，旧命名候选证据继续绑定旧SHA，不能自动推广给后续构建。
- H4/r1派发已由原独立Chrome聊天接受，实际运行回执待审；父不轮询执行器、日志或浏览器。原AnySearch找到Bun问题10813/11123/18746但正文提取失败（TLS/服务无法提取），官方GitHub API补读又返回unexpected EOF/0bytes；没有确认与Windows/Bun1.3.14相符的根因，不将旧问题号当作已证实原因。只保留本地独立进程构建的有效结果，停止同路线重试。
- Deck D1/D2源码候选已完成：真实Core/dnd5e配对和支持态、禁用直接输入/父标签的原因、同步调用保留popout手势的异步失败提示；未改变精确版本门、命令语义或持久身份。原writer固定Bun1.3.14运行75项/506断言、foundry-modules类型和9文件build通过；独立只读审阅未发现必须修复项。新源码尚未安装或实机接受，旧H3命名帮助证据不推广给新UI，owner manual新增步骤待根review/build。
- 已取得精确6.0.6版本化引用并同步tracked provenance，旧6.0.5 HEAD与运行实例不变；references verify两条线通过。Context7 resolve fetch failed后以精确tag源码核接口。新发现needsMigrationVersion仍6.0.0，当前Next若已记录6.0.5则普通升级不重跑migrateWorld；先读回真实迁移版本和残留旧exhaustion字段，历史异常不作为本次自动修复目标。详见6.0.6预检记录。
- H4/r1父审已核原件并查看截图：28投影、包/资源、两个计时样本、严格观察零写与server维护前后相同均通过；整体保留PARTIAL_USER_COPY_FINDING，updates详细工程review正文外露。首开API74.5ms/两帧103.1ms，重复API15.2ms/两帧1138.7ms，均排除世界启动/JS下载解析，无普适性能判定。准备GET中一条Monk's Little Details宏窗口尺寸User flag事件（含字段/栈）保留，loaded/final采集0；不宣称全User文档恢复。新客户端inventory实录108/100，与原15个605上限阻塞一致，证据`.local/suite-direction/next606/live-inventory-h4.json`。父审收据`h4/parent-r1-assessment.json`，原H3 UNKNOWN不变。
- 已修Foundry view及导出的review note为用户用途摘要，保留date/fingerprint和完整offline工程note。shared18项/202断言、Node与安全Bun手册各26项通过；实际release4项/72断言通过，新ZIP841,978B/SHA `8fba65bdb2a87d3ebff43d9f8d06bab89976b0702db122fb874d9b8529d8e9f4`，完整HTML1,205,849B/SHA `beb4a9d8f40b7973b35e9448c3631111013661a8ce9e8829acab95d0fd98b478`。未发行候选版本仍Suite0.3.0/Deck0.2.0，按新SHA区分修订；没有改公开发行版本或地址。
- 从两个实际ZIP安全更新Suite与Deck，绑定旧完整inventory，最终分别`d0f35f3b4f2b6677809e4ed499a302ecc1028511dabfb71bfd16f8f4631ab8ad`和`9b016ac58f327ac399c096a3e0f93dcc90cb51ddd505142d31a06f97796c65b4`；逐文件与HTTP一致。Deck76项/529断言含606原生效果与错配拒绝，只有源码候选，运行系统仍605。H4/r2合批合同只补updates与Deck新UI/受控cardDensity错误提示，无Setup/world/Node重启或模块切换；工具8场景通过，GET审计在严格观察外且保留全部事件。已派发原Chrome独立聊天，等待正式回调，冻结实装不再改动。
- 606其余13个自有模块已有分组静态候选与局部证据，尚未安装/升级或接受新系统；详细整合由下一节接续。辅助组误跑旧Monitor全脚本，子进程落到全局Bun1.3.8且内部启动临时headlessChrome测合成页；未连接Foundry。精确临时根`fvtt-session-monitor-restart-Ce2q1k`已不存在，对应Chrome进程空，原PID/随机端口未采集；保留流程偏差，后续固定Bun1.3.14排除该Chrome用例的23项为当前局部证据，不将旧合成页测试称E2E。
- Classpack只准备元数据load候选，保留605迁移身份及原pack/runtime。首个新反证把readonly inventory也误当成迁移门，实际源码允许其读pack；已据该失败收窄断言到preflight/migrate/confirmRecovery，核606在数据访问前拒绝，保留inventory读取语义。没有因此改运行接口或触发迁移；针对新边界重跑模块-owned纯测试。

## H4收尾与Deck D3前置接续（2026-10-12）

- 父审已接受H4/r2修正后的28条用途/日期更新页，摘要逐项与冻结content一致，实际截图已查看；当前Suite ZIP为`8fba65bdb2a87d3ebff43d9f8d06bab89976b0702db122fb874d9b8529d8e9f4`、content digest `91634dff9ca1d237184e538107524ec99ace18fa5ca9697a9c8fe2e9059120c8`，完整HTML独立交付。r1工程review外露失败及其原件保留，不追认旧候选。H1 file视觉、全User持久字段与原H3历史恢复仍未闭合。
- Deck/r2真实面板和同会话副屏显示14.368/6.0.5及支持态；实际0个禁用输入，故原因提示UI为NOT_EXECUTED。r2受控工具栏拒绝虽然setter只拦1次/转发0次并恢复，晚查询没有捕获通知，原FAIL保留。
- r3只填补该提示证据缺口，没有改产品字节：点击前原生MutationObserver在通知插入和两个RAF时捕获连通DOM，display:flex/visibility:visible/opacity:1及视口内rect，文字为“副屏操作失败: Error: DECKD2-owned-rejection”。三次实时样本证明可见；静态截图没有通知，排除为可见证据。未测native移除时刻，不虚构5秒实测。Doc事件0、偏好/设置/flags及本批hash恢复，setter/observer/Hooks恢复，自有Macro/tab清理、原Next常驻。
- 父审收据为`.local/suite-direction/h4/parent-r2-r3-assessment.json`：H4_LOCAL_DELIVERY_ACCEPTED、Deck D1配对/副屏及D2受控可见工具栏失败限定接受。不是全Deck、606、玩家、Mirror、生产或公开渠道PASS。
- D3前置按[606预检记录](../../reviews/2026-10-12-next-606-preflight.md)接续：官方精确源码、100启用manifest/121入口/496JS-MJS全集静态复核和15项候选已准备；只定位到原已知上限/代码门，外部动态行为仍UNKNOWN，Item Piles既有602限定修正保留。Deck已安装，其余14项尚待正常关闭世界后更新，系统仍605。Classpack/Species/Blood Hunter限定manifest-only，不覆盖内容或运行脚本。
- 下一检查理由：606涉及14个模块实现/清单与手册的整合，旧architecture计数和类型结果不能代表新源码；执行受影响整合类型/architecture、frozen lock及人工review/build/check。运行阶段先保存hash-only原生基线/迁移版本，Next正常ReturnSetup后严格安装，再由同一官方Chrome执行器做正常Setup无备份系统更新和新客户端读回。Core/Mirror/Forge/生产、直接LevelDB、备份及强制迁移均不在此范围。
- 当前整合结果：root全类型与foundry-modules类型通过；architecture为1280模块/2868依赖、零违规/环；固定Bun1.3.14 frozen-lockfile检查543 packages无变动。已人工核对19个stale条目的真实入口/新候选限制及旧证据范围，更新review并生成完整36项HTML；handbook:check与Foundry28/36导出通过，watch覆盖未缩小。已安装H4/r2包仍绑定旧冻结digest，这次说明生成不自动推广其运行证据。
- 私有14目标更新器dry-run仅11 runtime可完整读取；三个内容包LOCK因世界运行而EBUSY，明确preview-incomplete，无apply。独立审查找出模块全树检查后逐文件覆盖窗口、未来READY可通过两项风险，writer已补最终异步READY后逐文件旧bytes/SHA检查及完整preview原字节SHA绑定/未来时间拒绝。随机临时目录3项/11断言通过，独立复审无剩余must-fix；保持单维护writer、非原子锁前提。源锁SHA为`c8d6143f9fe535d1d6c156c39276de9561c3da7af169e88d56ba5b641f25c8ef`。
- Chrome阶段A原合同阻断保留：v1工具误把世界客户端`game.data.options.noBackups===true`当作只读基线前置；真实客户端字段unavailable，尚未PREPARE、十集合GET、baseline flags或ReturnSetup。仅导入/执行精确owned Macro `OPxb05DlZsjK01mB`并保留owned tab `651343790`，Node15696仍在原世界运行。精确Core源码中该选项控制位于Setup视图；本轮修正为世界内如实记录unavailable，再于正常Setup检查备份控件并与同PID --noBackups联合核对，未改服务选项、未绕过浏览器拒绝，也没有升级/安装。原blocked收据在next606/chrome/pre，恢复使用新修订并保留原件。
- 恢复v2保留原Macro/tab与v1阻断，7个定向模拟覆盖unavailable只允许hash-only基线且保留pendingSetupGuard、显式false零写拒绝。已派发原Chrome执行器，实际结果待回传；正常Setup完整菜单/控件与同PID --noBackups联合门未通过前不安装或升级。独立准备Deck D3代表业务工具，不重放旧帮助。19项说明/review刚更新，现行本地release快照需重新生成/归档读回以匹配根HTML；只刷新工作树交付物，不改已冻结实装或将旧运行证据推广到新digest。
- 上述本地release刷新完成：Suite0.3.0 ZIP849,541B、SHA `62613d606c5a90eed1a66c93d9bb261fd0ef587e88a23c6f1ffd1381af057bc5`；独立完整HTML1,215,902B、源/交付同SHA `4f8ef9b9c8be5d60e5db7e6abcdd5e65251469783a63e48c76ddf9373b85fbe3`。现行独立manifest/校验清单与5文件白名单同步，实际verify-release再次4项/72断言通过；重跑理由仅为19项手册说明已变。该新快照未安装，Next仍是H4/r2原Suite/Deck冻结字节，原运行证据不推广给此新内容。

- PRE/v2真实基线已由父核对：10集合916原文档、100active；systemMigrationVersion6.0.2/needs6.0.0、DFreds指定key已完成，exhaustion9/finite旧flag6/实际迁移eligible0。GET观察事件与setting calls均0，hooks/setter恢复。baseline SHA `8a12da48aa028e5e7e7ccf4e1a5690c6a3432ac5ea7e306c09133340c626c686`，原生ReturnSetup成功但Manage Backups仍1，原失败保留。
- 参数根因在精确Core14.368纯parser反证中重现，14.364配置源码同样消费全小写nobackups。共用launcher及规范化/冲突反证已修，安全foundry-lab176项/1091断言、tools类型通过。没有把静态串匹配当作实际生效；新说明需人工核foundry-ops条目后build/check。
- 自有维护先核唯一console成员、原生SIGINT handler、active=false/同PID创建时间/单loopback/无共享certs清理路径。首次helper在附加控制台后因PowerShell进度缓冲句柄失败，原Node保留；禁用该helper进度输出后的无信号诊断通过。随后原Node正常SIGINT退出、原生锁自行释放；辅助进程随控制台事件退出，未进入启动步骤。没有重放停止，只在确认旧PID/port/lock均无后补启动。新服务PID34112保持原app/data/30002，正确--nobackups，Setup active=false；`restart-receipt.json`绑定全过程，原正常关闭日志保留，不复制数据、强制结束或删除锁。
- 私有更新器已重绑新PID34112、source lock SHA不变。完整14目标before哈希预览现为preview-ready，无blocker/residual，原字节SHA `781834b6ebf5cf1523007dd300d3504d2d518504bf7d77d58ae84909fdc32138`。11 runtime共112个差异、Painter新增78；3个metadata目标完整3329/18/30文件树均已读，只计划各module.json。原Chrome修订3实际完整Setup菜单为viewWarnings/configure/update，backups和createBackup控件均0；新PID/创建时间/监听/active=false均匹配，备份UI门PASS，原v1/v2失败不追认。停在安装前，随后创建绑定该预览的新READY并apply，再原生系统更新及读回。

- 已按绑定新PID的READY完成14目标实际更新：收据`next606/update-owned-606-receipt.json`为updated/error=null，115文件逐项与最终全树对账通过。11 runtime共112变化（Painter新增78），3个内容目标各仅module.json，原packs/scripts未覆盖。当前Next仍34112/Setup inactive、Core14.368/dnd5e6.0.5；源码候选不等于606运行通过。
- 系统覆盖前核实原6.0.5官方发行ZIP全部1605归档项CRC通过，1,340个实装非pack文件与官方同字节、manifest同值、差异0；原tag与编译入口的差异已解释为官方release构建，原REVIEW_REQUIRED原件保留。6.0.6官方资产108,647,116B及发布SHA已核，但独立参考ZIP仍21,919,183B，curl续传TLS失败未新增字节；该归档校验缺口单列，不冒充系统安装失败或通过。下一步合同`next606/chrome-contract-system-update.json`只让原官方Chrome任务正常Setup更新606、启动原世界并执行保留Macro的POST；先保留Macro与读回，由父审后再精确清理。

- 同时推进独立准备：D3私有工具审查发现busy重复点击可解锁在途SETUP、同页面再执行丢失旧Hook两项问题；尚未导入Foundry，交原Deck writer修正并保留同客户端/延迟创建反例。P3/T1已核TE/CC/WMP真实公开调用与队列边界，原规则writer仅拥有TE源码/局部测试；606升级批冻结dist/ZIP及Lab安装保持不变，后续T1另建候选身份。参考606ZIP由原交付writer以Node默认TLS对同官方URL作一次Range诊断，保存失败/新增字节，不动Lab或重复相同curl失败。

- 原生606更新仅执行一次，在3%→27%后报download terminated，实际请求经过既有`fvtt-download-cdn.aivu.top`公共下载补丁；没有Core Update/其他包安装、世界启动、POST或重试。父没有凭manifest 605判“全树未变”，另以升级前官方证明复核1,340非pack程序文件，全部同SHA，收据`next606/system-after-native-download-failure.json`；packs/世界未由此证明。Node34112仍Setup inactive，保留Macro/tab/基线。直连官方ZIP的Node默认TLS一次诊断在HTTP前失败，partial大小/SHA未变；随后仅比较官方小API和实际代理的短Range响应，禁止因工具失败改Core、代理设置或换安装通道。
- Deck D3工具的两个并发反例已修，固定工具7场景通过，独立复审关闭P1/P2；新raw SHA `d7953cafd98b6497bf28481f9e94f2b1468f428cf1dfe29735077340486eec44`，normalized `f9af4acdf9da86e730e555eed8f3c4bb3211966afd57fbc09c49e60ee41c5976`。尚未导入/运行；真实按钮来源仍需Chrome原件绑定，失效UUID竞争不制造替代情形。
- P3/T1源代码完成：内部`external-events.ts`集中信封/ledger及纯发布选择，evaluator收敛Actor/Combat触发匹配，runtime保留GM/队列/失败回退。49项/262断言、模块类型通过，独立逐段审阅无must-fix；新导入图对应architecture 1281模块/2869依赖、零违规/环。公开API/schema/settings/用户步骤及安全限制未变；只更新受watch影响的review，不改正确的用户说明。旧606前置dist/ZIP仍冻结，未用源码结果宣称已安装/实际接受。

- T1受watch影响的唯一手册条目已逐项核对，用户入口/结果/限制没有变化；更新作者review并生成36项完整HTML，handbook:check通过。为保持H4交付与现行根HTML一致，局部release重新生成并真实4项/72断言验证：ZIP849,541B/SHA `ad605f9a78254973df6ca8db5c00526623f7db0689d1183373c274b23d1149bb`，完整HTML1,216,418B/SHA `c49a351f8201f5401c7f82b5d34b447a2cc2180e19f5bc41e33b92aa4b4dc3e5`。独立manifest/校验清单/5文件白名单均同步，Next仍保留H4/r2实装，没有将新说明快照提升为新运行接受。
- 新的网络层证据：官方release API默认TLS GET=200；当前真实代理对bytes0-65535返回精确206/总108,647,116，首64KiB SHA与保留partial一致。只证明此块和Range支持，不能解释原27% terminated或证明整包。按同一路径从已有偏移作有界分段参考下载，不改Core/代理/环境/服务；只有全长、官方SHA与CRC通过后才决定是否有据恢复原生Setup安装。原失败收据及POST基线继续保留。

- 上述参考归档已完整补齐：同一既有代理11次精确206 Range、无失败重试，新增86,727,933B；全长108,647,116B与官方SHA `88c4013a5fb9aaaae18405b6a7eda69fd72c4f0b74920906c899c6df6b617595`匹配，1,478项CRC及唯一606 manifest官方SHA通过。旧curl/Node失败不追认，完整参考不等于已安装。父基于新增整包传输证据与原605文件保留证明，给原Chrome一轮新的原生Setup更新恢复合同`chrome-contract-system-update-r2.json`；只允许一次，同服务/代理/Core/候选不变，失败不发第三轮或换安装通道，成功后执行原POST并保留基线Macro给父审。

- 支持矩阵实际安装/下载失败范围更新后，4个来源关联条目逐项人工复核（版本选择、Markdown正式生成、Intake、开发验证），保留正确的用户步骤与安全限制，再review/build/check通过。当前唯一最新本地交付为Suite0.3.0 ZIP849,780B/SHA `6d61e195788cfeceb34cd47c34f096b6c4249b4777f870714d747b12851a73e3`、完整HTML1,217,709B/SHA `59cf953ecc3f782c518f44999e5f69bd6f84a66b9c4db76c40f569ac0e37a5dc`，独立manifest/清单和5文件白名单同步；因来源/生成内容发生具体变化，实际release4项/72断言再次通过。之前快照仍按各自SHA记为历史，不覆盖原运行结论。第二次原生恢复已由原Chrome聊天接受；父完成独立必要同步后结束回合，待正式回传接续，不轮询或补造工作。

- 第二次原生Setup更新成功，实际UI截图父已查看，磁盘606 manifest及1,340非pack程序文件与官方完整发行物完全一致；没有更改Core/代理/环境，原首次terminated保留。原世界正常启动并执行原Macro唯一POST：10/10集合916文档serverChanges=[]、100active身份同、模块max声明已读到606；迁移/DFreds/exhaustion统计及world/systemFlags均同。原生Core日志出现正常package/system version迁移，不将客户端dnd5e因needs6.0.0而跳过migrateWorld扩大成“无任何迁移”。Node34112常驻原cor-cotn，保留Macro/POST现场。
- POST设置范围为1556项/排除111项，aggregate从`ebe4a6e45b775575e787a3663218ae15c0b9f8abf2b908f37a9c26dee27dbe4a`变`49536db8023dabde3694cef9646af7c482feab591e06a058e1f8bd8c825a7511`。采集期间Doc/setting事件0、hooks/setter恢复，但旧工具只有总hash，不能直接归因/恢复。启动日志29项error/warn中的唯一error为既有Actor上的Item identifier无效，旧605原件未搜到同错误；不能称新回归或旧实测，先保留且不修改既有Actor。独立源码窄查仅定位同605/606条件的firstRun/calendarConfig/DFreds/profile等候选，DFreds与systemMigrationVersion已由前后同值排除；下一私有只读工具核原基线SHA并导出逐key/hash，测试12项通过，有限模拟不写设置。合同`settings-diag/chrome-contract.json`派原Chrome，保留原Macro，完整约2MB哈希收据先直写/读回后才清理新诊断Macro，不把无匹配改写为PASS。

- 在只读设置诊断等待期间继续独立P3/T2源码核对，定位Foundry storage先sanitize再runtime校验的原数据问题丢失，以及CRUD异步全store保存的同客户端并发覆盖风险。原规则writer仅在TE owner准备局部反例/最小存储保护与Manager失败呈现；不触Lab/已装候选/旧baseline/D3，不为窗口分离再造公共层。新增检查理由是实际未知数据丢失和并发保存风险；有效读/执行与公开schema/消费者契约保留，数据迁移和自动清理仍未授权。

- 设置诊断已结束且不追加猜测：完整导出5,123,150B/SHA `aa062361de4d7a0624c07fd06be090bfa870bd2c70a9b844b352de59b059bd39`，父独立重算原baseline SHA仍`8a12...c686`。当前aggregate与原POST同；1556记录/945不同key/611重复key，旧工具的keyed map只导出945键，不能冒充逐行身份。8个源码定向内存假设均无匹配，零观察写入且恢复完整；不知道实际值变化或只是同名行排序，保留UNKNOWN，不自动去重/改设置。新诊断Macro已清，原Macro完整基线已可靠保存，父允许下一批精确结束原工具生命周期。
- 父审`next606/parent-native-update-assessment.json`限定接受原生606安装/启动与916原文档相同，设置和启动物品错误边界保留。D3工具补实际TE自动宏与两个将写设置行唯一性前置，清理ID/数量门前移到任何restore/delete之前；14场景验证缺失/重复/ID变化零误写。新合同`deck-d3/chrome-contract.json`交同一Chrome：先清原baseline工具，再仅新NPC/Folder做真实面板/同会话副屏HP20→13→20、ex3→4→3与普通客户端reload/最终恢复；不是玩家/失效UUID或全模块准入，前置实际阻断就保留原数据回传。
- TE T2兼容复审发现等价旧operand因JSON键序而误拒，已用结构比较修正并保留红例；最终57项/332断言、模块类型通过，独立定向复审关闭P2且无剩余must-fix。source说明同步，当前仍未build/install；后续中央手册明确新保存限制再构建与绑定真实接受。

## D3失败定向处理与T1/T2本地构建（2026-10-12）

- D3 r1仅执行到第一个真实面板HP检查：DOM输入13，服务器HP20/max20/temp0，native `preApplyDamage`调用为空，力竭由准备3降到1。原`PARTIAL`回执与截图保留，后续副屏/力竭/reload未执行。父已查看截图，未把输入框值当作持久化证据。自有Macro `gl3AChoI2LZxqQwt`、Actor `R7FI9Udy5mk6zNAJ`、Folder `DtkgAQmsdSYUlD7j`保留，下一轮先用原工具精确恢复/清理；旧系统PRE/POST Macro已正常删除并保存结束收据。
- 精确606 Actor源码显示首次创建exhaustion效果后会异步把旧字段同步为1，符合当前初始化3→1的现象；这仍是待实机核对的fixture时序解释。私有v2先原生1级、监听owned Actor `updateActor`并读回后原生加2级，且被动记录目标输入的trusted focus/input/change/keydown/blur。测试工具不直接写旧字段或调用Deck业务命令。父另发现r1完成状态与v2共用全局key会阻止同页接续，交原writer只修v2会话隔离并补回归；旧源/失败原件不改。
- TE T1/T2当前源码57项/332断言、模块类型和独立定向复审通过；root正常build并用标准ZIP CRC、8文件白名单和dist逐字节比对核回，新ZIP104,230B/SHA `23cef13be22d2b61c7c71b90a0eb66240a8c40de40018894cd3ebda5b4f7df2c`、JS SHA `3e1240f58c6f3e4302cdfba8ad6ad5b8e04b4244f7a9c594eb860262af0dc1d5`。Next尚未更新TE，新source-lock需独立绑定；旧14模块安装工具的源锁已失效，不重复执行。API1、external能力1、schema/setting/module版本保持，跨客户端原子保存和raw重复key检测不作已实现承诺。
- 此次接口影响实际执行全Foundry模块类型与architecture：1,282模块/2,874依赖、零违规/环；git diff --check通过（只有换行提示）。5个受影响手册条目人工复核、review/build/check通过，正文加入TE保存限制和当前606实装/独立业务证据边界。
- 来源/手册变化后实际重建最新H4本地交付：Suite0.3.0 ZIP851,456B/SHA `4ebdc8fb19cff8c40c054cb816e1f8ec643b9af64eae134305fbdc86dad09071`，完整离线HTML1,219,023B/SHA `aec39e856056943d51d13feda2baccd1d29844405a856e5ce192ae035864f40a`；release既有4项/72断言通过。这个最新交付尚未装入Next，当前Suite/Deck运行证据继续绑定原H4/r2冻结bytes，旧快照不覆盖。
- 下一实际步骤：原D3 fixture清理与v2定向复验；同时独立准备TE最小真实接受和T3消费者映射。实机写规则前只核对`fvtt-trigger-engine.triggers`本key原始持久行数量/ID与原值，其他key611条重复保持未知且不清理；不为存储反例往持久Lab写未知schema。

## D3 GM代表链接受与TE后续候选（2026-10-12）

- 原Chrome独立聊天按明确配置复用同服务/tab完成D3 r2；父逐项核四个完整checkpoint、可信输入事件、服务器pre/post、两轮finished、DOM absence与实际候选SHA，并查看hp13/finished两张完整视口截图，`parent-deck-d3-r2-assessment.json`接受命名范围。旧r1精确恢复成功但business仍PARTIAL，Actor/Folder/Macro均已删除，不改写原失败。
- 新原生初始化实际捕获owned Actor旧字段同步1，server/cache先1再稳定3；面板真实keyboard改HP13触发10条isTrusted事件，含change/blur，原生伤害7；同会话副屏HP20原生调用-7；真实面板ex+1与副屏ex−1得到4/3。副屏pointer超时后通过同一官方locator键盘确认焦点完成，截图接口超时单列，已有DOM/服务器/native证据保留，不重放业务。
- 一次普通GM客户端reload的timeOrigin改变且navigation=reload，HP20/ex3与十集合hash稳定；仅自有Actor/Folder新增。最终两轮原集合、设置值/偏好/精确行ID、开关和已观察UserUI均同，GET事件空、所有owned对象与副屏缺席，Next仍34112/30002/原世界。玩家/nonGM、失效UUID、禁用原因UI及第二Foundry客户端仍NOT_EXECUTED；历史H3恢复/606设置差异继续UNKNOWN。
- TE T3消费核对发现在途退订问题，普通/external各在调用前确认listener仍订阅，两条红例修复后59项/335断言、类型通过；已开始回调不撤销。README来源与手册核对/生成已同步，root构建新T1/T2/T3 ZIP104,896B/SHA `5c6aaac265af82a2a968ef7bef9bd12d46afd36b32093d2893776042e825cdb9`、JS SHA `28cd1e4066e8eef7e3f803e7711ad8dd30ed817da67db837d8df6001948fca0b`，8文件标准CRC/逐字节通过。旧T1/T2快照不含T3，仍保留原收据。
- 下一次安装preview只允许TE两README与JS三文件，完整before树同旧606实装，manifest/其余5文件不变。独立审阅指出preview时间被进程时间覆盖及两轮清理可重复绑定r1两项P2；已拆processCreatedAt与preview.createdAt、精确唯一绑定父验两轮路径/hash/dispatch/源码/目标/恢复字段，22纯guard反例通过，独立复审闭合。旧preview原件保留，新`trigger-t1-t3-update-preview-r2.json`只读生成，尚未apply；正常世界关闭/新鲜owner READY是实际写入前置。
- 最新H4本地交付随TE来源再生成：Suite ZIP851,726B/SHA `1c9f6b011d75531ed9fd34aac84312971412b1fc32c35ae99125cf1a3aa2fad6`，完整离线HTML1,219,051B/SHA `73175de17d235c93dbce882171ca1449f4e9ef38afe47180747664e0039d2d1c`。这里只改变来源/内容与身份，未改打包算法；继续复用既有release单测与白名单检查，当前新版未装入Next，原H4运行快照不覆盖。

## TE新包安装/正常启动与实机工具前置（2026-10-12）

- 同一独立Chrome原生Return to Setup一次，Node34112不停止，真实inactive/Setup截图/精确owner READY与两轮D3清理hash均核回。READY使用PowerShell合法7位UTC小数，纯guard兼容该实际格式且保留无效/未来/早于preview的拒绝，25反例通过；没有为收据格式重放原生关闭。root唯一apply更新3文件，完整8文件树同新ZIP/dist、4个HTTP资源同实装，收据`trigger-t1-t3-update-receipt.json` statusupdated/errornull/SHA `41ab9f6e427fb7ca15e48138e8afb9be2e96a6793bb703f55c68b9582fc03840`。
- 原Chrome用同世界原生菜单Launch一次/GM正常登录一次，回原cor-cotn/Core14.368/dnd5e606，单loopback/PIDcreation保持。父已查看真实世界截图，installed JS前后同新候选。启动瞬时房规通知指出Midi/DAE/DieSoNice超出已验证范围，原文单列、未修复或归因TE；不能声明全部模块功能接受。
- TE私有工具用真实TE runtime+FoundryStorage/Core展开作受控harness；父核到真实preUpdateActor带_id、Setting原行ID门、barrier提前拒绝处理，修正后15场景通过。另核Core DialogV2禁止空buttons，以及pending-unknown不能因再报错降级为可cleanup，交原writer补前置反例；尚未导入实机。候选包/实装不因工具修复改变，实际正向业务仍NOT_EXECUTED。
- 下一依赖：冻结工具新源码/Import身份后做正向TE链与精确恢复。CC C1只有独立只读owner/API/能力/消费者映射准备，没有同时改WMP算法或推进未接受运行结论。

## TE首次保存前置调整与CC C1/C2源码（2026-10-12）

- TE实机r1已通过源码/API/新HTTP JS身份门，但在任何Actor/trigger/Setting写入前因目标key原始持久行0而BLOCKED。run:null/actions[]，唯一测试Macro正常删除，完整原件保留。精确Core14.368 `ClientSettings.get`在无行时返回unsaved默认Setting，`#setWorld`首次正常保存才调用Setting.create；0行是合法初始状态，不是数据损坏，不手工seed空行。
- r2私有工具独立dispatch/global/Dialog，0分支核world/Object/严格空默认与公开get/reload，首次只经正常TE api.create自然保存一行并绑定sole自有definition/Actor/Macro和createdRowId；结束先api.delete自有规则，再仅删除本次创建且仍唯一/同ID/严格空/原activeGM的Setting行，恢复原0行。1行路径恢复原raw/ID，不删原行。删除前临时原生veto补最后身份/值检查，发生外来改动保留，finally卸监听；没有跨客户端CAS承诺。Node24.17真实TE/FoundryStorage/Core helper共26场景通过，父复跑；已派原Chrome，实际正向接受仍待回调。旧r1工具与原件不改，包/实装身份不变。
- CC C1已列19条件ID、condition/weaponEffect/injury三owner与TE/WMP/IFS公开边界；C1正向门只订阅active TE/api1/subscribe，保留init→ready重试。C2保存Injury实际socket和handler，在stop仅从原socket off自身回调，保留foreign监听及重复start/stop/restart语义。两个红例先复现，178项/1493断言、模块类型及diff检查通过，父已核具体实现与Core14.368 fog.mjs的off(event,handler)用法。未改规则算法/schema/API/持久身份，未装新CC或宣称606玩法接受。
- 本次手册核对选择：Deck owner手册只更新606已接受GM代表链/剩余角色边界，CC操作步骤/参数不变，历史Mirror说明明确历史目标；支持矩阵区分D3接受、TE新包已装/首次保存前置和CC源码阶段。受影响6条逐项人工复核后review/build/check。Deck仅帮助数据变化选既有help相关检查；CC源码已用178项/类型，不因README再重跑；新包作标准ZIP/CRC/逐字节及来源一致性读回，不重放已有效HP业务或无关全仓CI。

## TE首次保存实机接受与CC冻结包（2026-10-12）

- TE r2经原生Macro import/execute完成0→1首次正常保存、真实管理器行及重开、已settle的不匹配/禁用0动作与匹配1动作、在途listener退订0迟到调用、普通客户端reload和精确清理。父逐项核原件并查看manager/finished截图，原件`.local/suite-direction/next606/parent-trigger-t1-t3-r2-assessment.json` SHA `1b01d1c62f495a7037e3d096c407778a9769d7c24878bd287fe7e6ffd8104943`，状态`TE_T1_T2_T3_FIRST_SAVE_AND_SINGLE_GM_EVENT_ACCEPTED`。run `77b4fb8c-9002-4a4e-904a-8ea7129b276b`的Actor/Macro/trigger/本轮新Setting均移除，恢复0行/默认值和原十集合/设置/module flags/User；旧r1原件保留。单GM结果不提升为external/WMP攻击/CC消费者/第二GM/未来schema实机接受。
- 本地CC C1/C2包冻结：ZIP287,802B/SHA `0863495603bc28d2acc8358f67664ae0ac8089a133146e9c88d2c3405d4e7052`，JS SHA `4b83069693c8b1e3501316a1f84ebe84fbed52beacbeb118ac4689d6e642f588`，31文件CRC/dist/source manifest一致。更新preview SHA `9662739051f439dc143a0809020158f86c3bba123037ae8c1c28d82f4e27d517`，只允许两README/JS，另外28文件不变；实际写入仍待正常关闭READY。
- Deck帮助数据包ZIP145,765B/SHA `851e624c47597c0eff69f89ca438859bc422f47f798198b54d210c548762b92c`，JS SHA `840c0564e1652e6f7228f4bf9c4fbbd115d8beabc55a6302e858fec1da19b53d`；13项/267断言帮助检查通过。AST只读核出manual initializer均为纯数据，新值等于owner JSON；在内存替换旧manual后整个编译JS逐字节相同，差异仅requires0/limits5/6/8。未安装新Deck，D3实机仍绑定旧745889...，不重放有效业务。
- 同批本地Suite双交付ZIP852,913B/SHA `02ca5f3275854415e9e4eceeb2677aabe19184c18b82e591b379a6474d048e79`、离线HTML1,220,100B/SHA `e09097d03ab24638ecb55f5702456a1e2b9e194d425fabbc41c88edb774b15c8`，36旧ID/28Foundry投影与5文件白名单保持。最新内容包未安装，旧H4/r2运行身份不替换；源码/手册变化后再按实际watch人工核对，不盲刷review。
- CC私有工具已冻结，dispatch `962c32e4-1bd8-4e09-82d4-fe6cd4ac55c3`，source SHA `e0793d0c8bc6a3d8beca1ad017990fc03a14d8e8615d794c543fc2e60216e0b3`、规范命令SHA `6c53032d0b06e5322f261bb66973265393f3c8f23c6229c182f4e63ca0f3d738`、import SHA `9876c9bcfabf5e16507bd302b19ab634978b0f102b74185cf4e96ab130ceb3b1`。真实CC/TE/Core helper的10项模拟场景通过，独立只读审阅无must-fix；原生Actor DataModel/Manager DOM/reload尚未验，超时不取消在途原生Promise，必须保留pending对象。
- 原Chrome已正常Return to Setup一次，保留Node34112/creation20:23:17.7356390Z/单loopback30002并保存Setup截图；原始inactive status只有active:false/version14.368，没有users。父核精确Core `dist/server/views/api.mjs`只在game.ready追加users，这不是业务失败。原blocked收据保留；私有CC门改为严格inactive、users缺省允许/存在必须0，42项CC与25项共享纯检查通过，preview/包/TE原件不变。只补新READY，不重放关闭或TE业务。

- CC关闭READY补全SHA `43bc370f9fc5bd062264b1149d3c11c0044d4ff1ab428f6ba1ba0287c3c5ef24`，保留真实inactive响应；root唯一apply成功，收据SHA `996ef115f840a0363a7a231261b5f54b8e8105d12130f55ca40fa2e942a462c1`/statusupdated/errornull。两README/JS共3写入，31文件完整树与4HTTP资源同冻结包；同Node/Setup保持。已派原独立Chrome正常启动原世界后执行冻结CC工具，回传前只称安装与静态PASS。自然禁用/旧IFS接口只记录SKIP，不改全局开关造条件。
- W1源核对发现`moduleRecord`返回未启用模块，但CC/TE兼容报告和公开getter未查active，可把保留API当就绪；TE start还可能订阅错误API/能力。可选Midi也把已安装但inactive旧版本当作阻断。原规则writer在WMP owner内先补零订阅/零发布/零预约等实际反例，再收敛正向预检；精确版本/公开schema/规则保持，不动已装WMP与W2结算算法。所选检查为既有WMP局部安全测试和模块类型；不因跨两个文件默认跑全仓CI或重复CC实机。

## CC代表链接受与WMP W1/W2接续（2026-10-12）

- CC原Chrome正常启动同Next，唯一Macro原生import/execute，客户端普通reload后同Macro再Execute，总2次。run `5f089dcb-2c13-488d-8fa6-6af3c43d9dbd`：Addled/Frozen唯一实例、启停、实际Manager行、重载后ID/参数/外来sentinel哈希同；自然injuryenabled/IFSactive时原生damage20→HP0/episodeopen/stacks0，heal-1→HP1/stacks1/episodeclosed，原生shortRest全no-chat/time/bastion/autoHD后HP1/stacks0/projection0。IFS只同步当前episode，历史/次数/旧injury保持；没有复活结算。
- 父逐项核原件、源码/Import/served JS/进程身份并查看manager/c3-result/finished三张viewport图，机械评估21份原件引用通过，`parent-cc-c1-c3-r1-assessment.json` SHA `c015f2fabe1fa6c969b44dc49bc3fd10c41f5582bcc7a5ac11e5a71703b791d8`，状态`CC_C1_C2_C3_SINGLE_GM_REPRESENTATIVE_ACCEPTED`。自有Actor `rSNjLR14uKiQJbss`、Macro `BurbG7pIQWPG2Bnc`及效果全部清理，原十集合/Settings/module/User哈希同、GET写事件空；Node34112/30002与worldtab保留。socket stop/restart仅单测覆盖，全部状态/玩家/多GM/WMP攻击不推广。
- WMP独立审阅指出首次依赖检查后缓存CC API跨`await fromUuid`仍会启动失活模块，之后才被ledger门拒绝。两条红例先复现，修后每次Actor解析后重核activeGM/完整依赖并fresh getter；首个CC start前以现有started字段持久claim，每次成功ticket更新再保存。首个调用前失效零start/ledger/publish且恢复后可cancel；第二预约前失效保留首个已开始的reconciliation。cancel/commit/reserve相应异步边界同样fresh核对，最终287项/1421断言及类型通过，未build/install。
- W2具体风险与新增检查理由：第一CC reserve成功后失去依赖或最终WMP持久化失败，旧流程可能已有预约但还无sourceActor ledger。接续用现有字段先持久准备身份、逐ticket记录，不提前发布不完整attack.prepared；失败/未知不能作为干净取消或同ID重新预约。选择初始claim失败零reserve、部分reserve/超时后可追踪/禁止开始及正常取消/重复提交回归，源码writer仍在同owner，不扩大跨客户端CAS或两持久操作原子性承诺。
- W2局部检查先287过/2失败复现无持久claim，修后292项；独立审阅又定位started claim与完整启动混用，三红例后295项/1479断言通过。完成marker只在全部ticket与最终持久确认后写入，部分/未知同客户端或reload重试拒绝。定向复核另发现最后CC.start等待中降权时persistState静默跳过会冒充成功，正在收敛GM持久写入必须成功或拒绝的内部契约，并补最后ticket/prepare/cancel相应反例；正常玩家transport缓存语义保护。此记录是新增检查理由，不将未闭合候选称运行PASS。
- WMP原生验收设计核到真实turn key与画布Token要求，采用owned Scene.view()而不activate原世界Scene；原生Combat仅自有场景/棋子，删除时保护原UI combat pointer，禁止既有文档/世界时间写入。实际WMP自然发布会写唯一TE `externalEventLedger`，不能要求零设置写或只恢复磁盘而留下once-loaded缓存。私有工具只允许该键的自有事件，先核0/1唯一行、严格已知schema与原始raw/ID、原事件不淘汰，清理后精确恢复并额外普通reload清缓存，再核11集合（含ChatMessage）和原设置/UI/时间。该工具仍在准备，不是实机接受，也不打开全局E2E setting。

## WMP W1/W2源码冻结、安装与交付读回（2026-10-12）

- WMP最终GM持久writer在进入/排队写前/Actor写返回后均验activeGM及完整依赖；玩家transport继续独立本地缓存，不再用跳过写入冒充确认。CC异步操作返回和完成marker前复核，失败取消回退内存终态；commit/cancel缓存terminal须匹配sourceActor持久step。root再核到公开commit可越过部分启动，已用真实链接卡反例复现并在actualOutcome前要求内存与持久两侧完成started marker，未完成返回pending对账。最终安全`test:weapon-mastery-properties`300项/1506断言、模块类型/diff通过；独立定向复审关闭前述P2，最后4行commit门由root核对及反例闭合。未增加schema/API/模块版本或跨客户端CAS。
- root正式build后标准ZIP CRC、8文件白名单、dist逐字节、manifest和全部sourceFiles哈希通过：ZIP464,654B/SHA `8823c810b73948390a5da3f6c60289637a330dbf5c3afd1ca8ea22f3a376b81b`，JS SHA `67e7bee1b822010e647f7f5922f74f6d93fd60b0621a0ee6c4d177a0a2468fe1`，buildId `b10e469053e2144c1cfe71a7497d6760bf7582711dd2141f56dadc497b60f6fa`，正式build-identity SHA `b2964dde8402f3c546213184c909b270ae8e644a216384f60bae17bfc2b4ecf6`。原件`wmp-w1-w2-build.json`，不是实机接受。
- 私有更新器复用正式requireFrozenBuild和既有write/READY机制，28拒绝反例通过，独立只读审阅无mustfix。preview SHA `e176b2af98c74bf2809330bb47392d8ba0204d5bf40e5056408ed649d1088573`绑定旧8树、源身份、CC两份清理及父审原件；Chrome正常Return to Setup一次/同Node保留，READY SHA `393f467da271cfeafcf7d7d719f1922c1fe9fa1afb57d91d39fcd94e2453ab10`保留原生inactive无users。root唯一apply仅README2/JS，8文件after树 `e981f1ede4fe4d8008a924606daec2270709937d0ffee916b4b9ee2ca0d21d22`/4HTTP读回通过，receipt SHA `9b5431eba8713938ef2273ba9b5faf269bfdb59f1ed4a06d6ad40134438678f6` statusupdated/errornull；正常启动原世界已派，尚未导入攻击工具。
- WMP私有工具第一版18纯guard/未运行时mock不代表原生成功路径。导入前独立审阅发现原生展开Macro更新会自veto，以及原生无fixture marker的自有Chat更新/删除会被误veto；原writer正在仅私有工具内补实际注册Hook/精确新卡身份测试并重新冻结。原产品/已装包与旧18项事实保留，不为工具修复重跑300项业务或更新模块。
- 同一Chrome已正常Launch原cor-cotn一次/GM登录一次，34112/原creation/单loopback/606/users1及served WMP67e7...均核回，父查看world.png；没有导入Macro或产生新fixture。截图仍有既有房规重击首骰依赖范围警告，较晚DOM/native-action记录notices[]不能解释为从未显示警告；只保留事实，不归因本WMP、不修其他模块，也不重放启动。
- 私有工具两项veto接线已修并复审关闭：Macro唯一run子树兼容原生展开/_id并绑save intent；W3 attackId先保存再publicuse，原生新卡update严格source角色图，delete按逐卡intent/当前全文与来源再次检查，damage→usage→attack顺序。root复跑21项，包括实际Core展开和已注册Hook，全部通过；完整命令SHA `38dadd77c1fb1468dd03b74908e226027d99ab61f95132f43eaa6b388c6ed411`、Import64,642B/SHA `cf7514eca104db4b0d89d752ee052a4d9d7a1cdbd56231e22327e8e22e4d182c`。已派原Chrome执行W2取消与W3真实攻击/伤害/Slow、两次客户端reload与精确恢复；尚待回传，不将21项纯/模拟Hook提升为E2E。
- 本批8条手册逐项对照入口/实际原件后review，`handbook:build/check`通过36项。新版本地Suite双交付ZIP856,051B/SHA `04b53a8a67fe960e970ddb4f057ce7a5a7b874c01b57070f0f85d2a3037dddd6`，完整HTML1,223,377B/SHA `999a6ff48748bfd201da80018ce92827759570e683f466536fb3295a9aaa7654`，5文件/36与28投影不变；既有release入口4项/72断言通过。辅助hash读取最初少写文件名版本后缀，只按release-candidate实际文件名补读通过，不重构/重测。该最新Suite包未装入Next，旧H4/r2运行身份不覆盖。

## IFS F1/F2独立源码准备（2026-10-12）

- WMP已安装包及原生fixture批保持冻结，原规则writer切到IFS唯一owner，只做F1 model/接口归属与F2已核写入边界的源码/局部反例，不build/install、不触Lab/Chrome或其他模块。
- 新检查理由是parseActorModuleState/parseHistory规范化后whole fadingSpirits写入是否会丢失旧数组条目的未知扩展。实际Foundry会递归合并object，不能用浅Object.assign mock推断unknown sibling丢失；先对照Core的数组替换语义再判断。若证明无损性缺口，仅无损保留或明确拒绝无法理解的旧值；不新增仪式/迁移/全Actor清理/schema/API版本。已有activeGM、发送者权限与重复结算边界保持，旧injury原件保护；选择既有IFS安全测试/类型与实际新反例，不重复WMP300项或其已派原生链。

## WMP r1保留现场与只读诊断（2026-10-12）

- 同一Chrome的r1通过精确候选/API与11集合前置，只到夹具初始化即报PARTIAL_FOREIGN_WRITE_VETO。User、monks-tokenbar.movement及一条ChatMessage更新被veto，W2预约/取消、W3攻击、重复提交、重载和清理均NOT_EXECUTED。原Macro LlokMfcu2EtGbOnT、run4c31bf83-0242-4f0f-bc4c-683fa8470788、两Actor/Scene/Combat/Token/Club保持；attackIds为空，TE仍为前置1行6事件。旧失败没有改写成功，也不据veto推断原件已恢复。
- 已核已装Monks14.01的位置保存1000ms debounce和战斗movement设置路径，但实际User字段/聊天调用者未捕获。分层源码事实与缺口落盘[诊断记录](../../reviews/2026-10-12-wmp-next-fixture-scope-diagnosis.md)，不把可能路径当实机归因。
- 私有diagnosis只允许一轮普通客户端reload解除本批旧临时guard，再原生导入独立Macro；Stage A核旧Macro命令/owner、11集合所有原件、全Settings IDs/raw指纹、User/module/TE/时间及夹具/无攻击。只有全门通过才固定Scene.view往返，所有写尝试veto并采安全字段hash/调用栈，不重建、不攻击、不恢复设置或删除对象。Stage B后guard保留，显式只读刷新补延迟日志；不轮询、不自动解绑。
- 父已读关键实现并复跑11个Core14.368真实展开/已注册Hook私有场景PASS；首次检查恰逢writer未重新生成Import，指纹不一致即停，冻结后修该层通过，未重复业务。冻结command SHA ce9bac50f177217c727515b7081b65e86c137bc036dd6aa9818a34941fff647d、Import SHA30bda59b389e0d41443029a597d48cfd87368a1d93bf0ce76f9ca4aaf009498f；dispatch442aa475-10e6-489a-9717-a5cdea0c15e3已派原独立Chrome，待实际只读报告。Node34112/原creation/单loopback30002再次核同，Mirror未触碰。
- 诊断回传StageA_BLOCKED：按授权普通reload一次、导入诊断Macro6CHzFgvSgYzQhXZ3后Execute/StageA各一次。既有Combat8WCtc3bOyudYuHzh完整SHA3c5252...→5de253...，User70b2a1...→671458...；其余原件、Settings/module/TE6事件、fixture/noAttack/time全部同，新增仅自有四根与一条Monks roundmarker聊天。Stage B/场景往返/刷新/攻击/恢复/清理均未执行；新traceGuard未装，旧ephemeral guard已由授权reload清除。父已核JSON并查看stage-a.png，评估原件parent-wmp-r1-diagnosis-r1-assessment.json SHA db5394c77fb8ff99c237afad0f43bd7f8ea0eac106f28412af63b75a724422c0。报告层首个Python编码拼写错误只修该层，未重放浏览器。
- Core14.368服务端源码已核到Combat._onCreateOperation经sublevel.findUpdate直接停用其他active Combat，再广播sideEffects，绕过客户端preUpdateCombat；R1实际Combat.create(active:true)触发条件成立。此机制解释guard为何没有记录该类写入，但只有完整反事实hash与旧基线相等才能确认本次仅active变化。User仍待有限路径/已有证据核对，禁止猜原像或先写回求PASS。

## IFS F1/F2源码结果与F3接续（2026-10-12）

- 三个旧历史/未知条目/贡献扩展红例证明parse后的数组替换会丢既有数据；写边界先确认既有值可完整保留，否则明确拒写。后续两组反例分别修正合法legacy缺默认值被误拒、整块fading字符串/数组及当前未来schema在持旧proposal时漏门。最终65项/412断言、模块类型及diff检查通过；父已核guard与红绿用例，缺省/null/空对象及已知默认仍能初始化，旧injury和未知对象sibling不被本修复迁移。
- F3最小原生链准备为一自有死者和贡献者、普通仪式/606原生请求、GM显式贡献裁定、真实blind最终骰、唯一历史与锁清理、旧卡重复/普通重载及精确恢复；不预设骰面。当前observedRequestResult只显示及预选GM裁定，没有结果到达即自动写Actor的证据；非授权结果来源及无CC实机仍需独立证据。WMP保留现场关闭前不派新玩法夹具。
- F3新增源码检查理由：ui三个lookup仍可读取inactive CC保留API，runtime已使用active正向门。原writer仅对成功恢复抑制、dashboard伤势开关和旧管理入口补inactive/unknown-active反例；66通过/1失败复现后统一active===true，活动CC三个合作正例保持。最终67项/423断言、模块类型/diff通过，父核具体helper和测试。未安装/Lab，不把静态结果提升为复活接受。
- 父人工核对IFS完整说明/README/源码限制后review该唯一stale条目，handbook:build/check均36项通过。正常build:injury-fading-spirits生成11文件包；标准ZIP CRC、档案与stage逐文件字节、README/CREDITS来源、ID/版本1.1.0核对通过。ZIP80,588B/SHA e978d6b2989caf56df4e9873607e877a79052528d4e67288c93df39f1d4d2cde，JS b85685159e42a6864a7946fca944ff25ba11b5ce936200188d72f698141bfd94；私有ifs-f1-f3-build.json SHA2dd1f033d66e24ed7eb795e34343bba0ae6eb3d4e9735402136f0768ad44bd64。该包仅本地准备，实装IFS未改；Suite最新双交付快照仍是前批，最终整合时再按新手册更新。

## 当前必须解除的运行阻塞（2026-10-12）

- Counterfactual dispatch bd6d13aa-7707-43b2-b792-3c076c9f76fe在前置停止：PID34112不存在、30002无listener、status连接拒绝；原官方Chrome browser3/tab651343790返回Tab not found。没有nativeImport/Execute/场景操作或数据清理，新命令仍仅在本地；持久夹具当前状态尚未重验，不能声称浏览器tab或原进程仍保留。
- 主控一次只读复核确认没有server-next Node/30002 listener。旧stdout最后为09:18:30创建诊断Macro，stderr为空，没有明确退出记录；本机未在此期间重启，退出原因保持UNKNOWN。进程盘点首个宽CommandLine筛选误包含执行盘点的pwsh，已改Name=node.exe核对，不把shell当Next。
- 按原app/data/loopback/nobackups/Setup-only sentinel准备恢复原独占服务；命令在CreateProcess前被自动审批拒绝，返回仅blocked by policy，无更具体理由。没有启动或新的恢复进程，不使用其他命令/CLI/通道绕过。用户需恢复该精确Next服务或解除实际执行限制，才可接续原生诊断和验收。
- 实际内部代理会话/工具store在本轮接续中未恢复，导致消息未进入执行和一次无效event wait；已停止pending任务，主控直接完成小型只读工具及TokenSync边界检查。丢失的store使一次read默认落主目录，立即以绝对sibling路径重核；没有因此写主区。后续每次显式绑定绝对候选，不因工具会话丢失创建新服务或改用浏览器旁路。

## TokenSync S1源码与交付准备（2026-10-12）

- 只读owner核对确认现有去重/clamp/overlay/movementAction/权限和multistatus门已存在，不整体重写。精确606 source map与Core14.368非await descendant链给首建力竭后台legacy更新提供事实；受控HUD快速两次加级旧实现预期2/实际1，安全入口21通过/1失败。
- 唯一产品变更在core纯desired planner及index原生writer等待。首建0→1先注册自有Actor/User的updateActor Hook，再native toggle；须changed/source legacy1和options.originalExhaustion1才确认后续delta0并继续队列。10s单操作超时移除自身Hook并阻断后续分级写，关闭开关才清阻断；不直接写legacy/derived、不patch原型、不改CC/移动/权限/schema。
- 主控补多个真实ID Hook模型/foreign监听保留、错误Actor/User/原级不释放和受控timeout零后续排队写/关闭后恢复。最终安全test:selected-token-sync 24通过/99断言，模块typecheck及diff核对；预期timeout日志为负例证据，不是测试失败。606原生HUD、重载、玩家/双客户端均未执行，旧605结果不扩大。说明和本地构建由主控收尾，不在Next阻塞期间安装。
- 另核新等待门也影响声明605范围：从已提交provenance固定commit3ee48de读取clean605完整cache，与已核官方606 source map的4个目标片段逐字一致。没有把本地缺tag当作版本证明，也未读取Forge成果或Mirror。[分层源码记录](../../reviews/2026-10-12-tokensync-exhaustion-sync.md)保存来源/语义/缺口，24项结果不扩成两个目标实机接受。
- 人工核TokenSync完整README/手册条目后review，handbook:build/check36项通过；正常build及标准ZIP CRC/5文件白名单/与stage逐字节/README来源/ID0.2.0通过。ZIP29,035B/SHA70cca497322584a333fe1fa15c4ceb975fc561424961436a31092ddfd8b5c773，JS9e1568be52adcb4d9a5bb5b6731d04f2ecfa960eda27c4d09232be6f6d262cf9，私有build receipt SHAebf2014976139bf7fd6dabe691336bf03263e6aedeeb0b79470fc287bef6767f；未安装。
- H4双交付按最新IFS/TokenSync说明重新生成，既有release校验4项/72断言通过。新ZIP857,588B/SHA dd955cde4ba83e4cb83aa359cda560af45a6d4212f0fe045923e8c6c296d809f；完整HTML1,225,009B/SHA b5d0cdf8a1e1e64c3060fc4034f5fb0b18b2019fd5231a4618bab44dbe915b94，root与交付同字节；36完整/28Foundry/5文件与ABI不变，未装/未公开发行。当前运行阻塞评估parent-wmp-r1-counterfactual-r1-assessment.json SHA bd89d347cac4b73b4d1ca6eb7703e5bf31b375072ca31c3a063b25c524cb817f，新的反事实诊断仍NOT_EXECUTED。[接续点](CONTINUATION.md)已列具体顺序。

## 用户授权恢复Next与原批接续（2026-10-12）

- 用户对运行阻塞明确回复“你启动就行”。先重核原sibling分支/HEAD、旧owner收据、无Next Node及30002监听、loopback preload SHA b0a4748149867082c101be01c2c00cd791de542657de1ad9fed4dfb01b975872后，再执行同一原目标恢复；这次正常启动获准，没有改通道绕过前次拒绝。
- 新隐藏detached Node38672，creation UTC2026-10-12T02:54:55.8460570Z；原14.368 app/data/server-next、同Node24.17、Setup-only absent sentinel、--nobackups。跨后续工具调用核进程仍在、单127.0.0.1:30002与status active:false/version14.368、实装6.0.6；世界尚未Launch。启动收据recovered-140674bb-a7be-49e4-9a0f-a2409f0c1eba-service.json SHA df69229fb6e79542735defb03eb5e6337fd802e76dc67b15d4de9f6f524df6a9，并更新当前owner指针。
- 初次读回误将ConvertFrom-Json自动解析的DateTime与7位小数字符串直接比，门误拒；只修为UTC ticks比较再读回通过，未重复启动。新stdout的demon-queen-awakens protected签名错误已在旧stdout找到8次，保留为既有警告；不修付费包或称启动零错误，stderr为空也不代替日志审阅。
- 原独立Chrome（用户指定6.1 Sol/medium、fresh FullAccess事实由执行器核）已派正常Launch同cor-cotn/owned GM与只读counterfactual r2，先正式库存恢复或只建一个拥有的目标tab，再核新PID/客户端和WMP served JS；不执行旧R1、不重建夹具、清理、攻击或写恢复。新命令/Import保持冻结，前批NOT_EXECUTED与拒绝原件不覆盖。回传后主控评估再接续，无需用户再次回复继续。

## 只读反事实接受与WMP同夹具业务r2（2026-10-12）

- 原Chrome库存确无旧tab/30002页面，仅新建owned tab651343827；正常Launch cor-cotn/GM Join各一次，同Node38672/Core14.368/606/users1/served WMP67e7...已核。更新同诊断Macro6CHzFgvSgYzQhXZ3并只Execute一次，没有改旧R1 Macro或创建新夹具。父读JSON并查看counterfactual.png，评估SHA3280d6abc8c4d7dd6dac832d54f0cd2beb5a826b63237cf5a20a1fb828290cf6。
- Combat当前5de253...、active=false；仅内存改true完整SHA精确回到原3c5252...，stats4d8422...同。因此本次此Combat仅active一字段变化已确认。User当前671458...仍同StageA，两个独立缺省flag假设均不匹配，旧70b2...原字段未捕获；保持UNKNOWN，不再枚举坐标/时间。新Chat7Ph...正确author为自有GM、roundmarker=true、完整SHAeaf800...同；旧诊断读取doc.user得到null是字段映射缺口，旧原件不覆盖。实际写入/攻击/恢复/清理均0。
- 下一批明确只接受业务代表链：保护User当前671458...及当前原Combat/辅助Chat，保留原R1完整恢复缺口；新单独resume flag保存业务基线，旧Macro/原run不改。复用原Scene/Actor/Token/Club/active Combat，不再次创建/启动/激活。仅对当前GM两个已核Monks位置路径的合法numeric/auto保存请求同步veto，记录为辅助防写；任何其他外来写仍fatal，业务入口先拒绝且零Actor/CC回调。
- R2生成器绑定冻结R1全源码38dadd...，只替换adoption/guard/UI及隔离新run key；删除新建夹具和清理/恢复出口，保留原W2/W3/duplicate/reload断言。16项新增私有检查含Core展开、真实注册Hook和blocked入口零业务；原21项稳定helper由同源码证明复用，产品300项不重复。新command SHAbb20bcb906f5bd0305da695d56ef8d4a5b9eeaf77c25b8d39bd532ad4756ceaf、Import SHAd2caec778e43fa834fd832c280acee8229d1697976a112ad44e1c1aa873abdfe、guide SHA665b1b829bb181292788142523a4dc63ccff69068f531e3992f950806d76135c，resumeExecutionId0680c1dc-019e-48ea-8bc2-d8a17b55aa4c已派。
- 本批一次完成W2 Sap预约/未开始取消、W3真实Club/Midi Apply/HP/Slow/来源、重复提交和普通重载读回；genuine miss/unknown停止保留，不重放/强制骰。到persist-reload回执后保留所有对象/TE，主控评估真实终态再接既有授权的精确恢复；计划为正常API恢复已证Combat active并审计新stats、精确TE raw/缓存和自有对象清理，User未知原值不写回。旧失败不改写、整体恢复不宣称PASS。
- 本轮仅私有验收工具与诊断/进度变化，用户模块入口、输出、支持版本与手册安全限制未改；当前H4内容包和36条手册检查结果仍适用，不盲刷review或重复构建。

## R2前置停止与User字段trace（2026-10-12）

- R2仅Execute/adopt各一次，原夹具身份核对后live blocked已有一条preUpdateUser，辅助位置防写列表为空。stored run.blockedForeignWrites仍空，stage标签仍fixture-ready；父读完整JSON并查看adoption.png，不能由阶段名宣称无fatal成功。执行器在W2入口前停止，没有W2/W3/duplicate/reload/cleanup，也不为生成拒绝收据额外调用业务。新Node38672/ownedtab651343827/guard/两Macro/所有夹具/TE保留。
- 初始R1与当前R2都没有捕获User payload具体字段，继续同一路径无新增信息不会收敛。因此不再重试业务或扩大白名单，改为目标字段仪器：只采User changed路径/形状/value hash与清理后的调用栈，其他文档只记hook/id，所有写仍同步veto。三个待分辨来源为位置保存附带字段、其他模块User flag或收据渲染偏好保存；未捕获实际字段前均为假设。
- 私有trace d4b11b1a-bb98-4e57-8491-ac9ce2966304只允许一次普通reload清本批已无在途业务的临时guard，再更新同controller。核resume仍fixture-ready/无attack、HP120/200、ledger/CC效果空及当前User/Settings/time。先开同ID收据并只读刷新；已有User事件则不切场景，否则仅一次owned Scene.view/local Combat/control/target步骤。单操作有界，保留guard、没有WMP/恢复/清理或自动释放出口。
- 9项私有检查含Core展开后的路径、非plain/安全getter取样、真实注册veto与敏感值redaction通过；首个语法扫描误把纯hash helper的WeakSet.delete当文档写，只修扫描范围到新诊断body再通过，未重放实机。新command SHA20abe983220752a2760f25f9cf4b25a775b55b4dc2c0e39df404516dd35fb272，Import SHA707eee8ed1d0ff31fe49250c3e94e6fc50a815f2fe0638f0c7d79943f872817b，已派原独立Chrome。未改变产品模块或重跑其已有效的测试/构建。

## 原生Import语义修正与trace r3b（2026-10-12）

- r3一次授权reload清旧临时guard、同controller Import/Execute各一次后，组合resume身份断言失败，receiptDOM/view/refresh为0，新traceguard未安装；没有任何W2/W3/恢复/清理。父核JSON并查看initialization-error.png，按工具初始化失败保留，不能解释为真的跑过业务。
- 主控之前错误假设native JSON Import递归合并flags。精确Core14.368 client-doc importFromJSON:1044–1062明确update(data,{diff:false,recursive:false,noHook:true})；Base preserveOnImport仅_id/sort/ownership/folder，Macro没有flags例外。Core真实mergeObject反例确认旧controller resume flag会由新flags整体替换；此前“guard会挡nativeImport”也不是正确边界，noHook会跳过这些prewrite钩。上轮reload实际清的是本任务旧runtime closure/guard，并不证明Import受其保护。
- r3b只修初始化来源：读完全未动过的旧R1 Macro规范化源码38dadd...与原incident身份；当前Actor HP/ledger/CC效果、完整Settings/TE与时间仍独立检查无业务。controller旧resume可缺省，实际resumePresent/phase/source在只读收据输出，不伪造已保存状态。所有原R3/业务r2失败原件保留，不覆盖旧源码/Import。
- 6项新增检查使用真实Core非递归merge，并覆盖缺失resume可做只读诊断、不同/已有attack身份拒绝；字段/注册Hook/veto/redaction正文逐字不变，既有9项仪器证据复用。新command SHAbad85bdcd00f30a572771872f0d9dfb42800196756af3c260edaeab414bab57d，Import SHA468e81cf5377353bde4537c0601db57b887df4ffefd674bef4f4f56bd34023ad，dispatch9869bcee-936e-4a26-9025-3b96f7c1f036已派原Chrome；因新guard未装，不再次reload，仅同Macro原生更新后只读诊断。
- prewrite veto只证明观察到的Hook被拦；noHook和服务端sideEffects不在该保证内，实际持久状态须靠前后完整读回。后续stateful controller代码更新必须先保留其自有run证据或按明确身份交接本任务runtime state，不再假定Import保留flags；不创建世界备份或改用户原件。产品/模块包/已有效检查未改变。

## User trace实证与同夹具业务r4（2026-10-12）

- r3b同controller Import/Execute各一次，无reload/新对象。原R1身份读取成功，实际resumePresent=false确认控制Macro flags未跨导入保留。initial及首次refresh无事件，唯一owned视图步骤后捕获3次prewrite，再一次2秒等待/只读refresh；未重演场景/业务。父核final-refresh.json并查看图，11集合/Settings/User/time/activeScene前后完整指纹同，guard保留。该结果不补旧R1 User70b2原像或承诺排除noHook/server sideEffects。
- 第一User请求确为flags.token-action-hud-core.isUnlocked boolean false，实际stack含async Utils.setUserFlag、该模块min.mjs:1:11023。已核已装TAH Core2.1.2、主JS SHA5f5dd9389f3592b691c7db46cae3243762c5600b606377153b5f39d5bf030670及Utils正常setUserFlag实现。第二User为Monks位置left/top数字0，stack没有Monks调用者帧，保留caller UNKNOWN。第三Fog0OFf1sfmPyv7t7rZ仅有hook/id，所属scene/user未捕获，不凭事件名归因。这些是本次复现实证，旧R2丢失的payload不被追认。
- Core14.368 Fog的正常save为explored+timestamp，Base._preUpdate补timestamp；普通get query走数据库GET，不启sharedFog时无共享筛选副作用。r4业务前用正常只读GET核该exact ID/current GM/known原或自有Scene/level及source hash；归属不符/不唯一先停，不输出位图。之后仅exact typed字段保存请求同步veto并记录辅助，其他action/user/path仍fatal；TAH仅当前GM exact false偏好也veto，绝不放行落地。
- 私有r4复用冻结r2 bb20...主体，新增实际payload回归、Fog作用域/恒veto/外来拒绝及有用fatal路径/栈18项通过；产品代码/300项与稳定helper不重复。保存terminal cleanupHandoff安全测试状态，避免下次Import替换flags后丢接续；原row/raw/指纹仍从未改旧R1 Macro读取。已settled的native use直接observe，避免重复Apply；blind攻击值不导出。
- 新command SHA28afbafdca4854b288bb4b61aaac66453e03c720e9d7d62b6f9b196ab624830a、Import SHAbb6d4250c7ce453663a46e831cc345a1f20b74f933114c70f30d0474efbc586f、guide SHAea24147f1d9ac63b47275880fff94137b6b1c41a0d7b8b4393758deb4b01c97b，resumeExecutionId d2ba88ae-752a-4bdc-8b99-218fbf69cda2已派原独立Chrome。一普通reload仅清自有traceguard，无在途业务，复用原夹具；到persist-reload保留所有对象/TE，由主控评估后接精确恢复。源工具包装首次反引号转义错误在执行前停止，只修该层后18项通过，没有重复实机。

## WMP真实命中的证据补齐与收尾选择（2026-10-12）

- 只读工具dd6c8eca...经原R4 guard的精确Macro intent保存原task flags并读回，preservedRun SHA a9cc363be121e828a71c47866f58551a793464800bb6aa874ed78aedb385b0c4。安全handoff独立保存并解析，SHA 1a94fd617d9f9d524458aa04d15c1889147426e9ff9053cdb347338e5c37f1e4；后续Import不再依赖controller旧flags。
- 实测source HP120、target HP198/walk20、唯一Slow q8zWHF2BADMeYcHM及原生五条速度投影；w3账本committed/hit/damage2，W2仍cancelled。原生attack pMD5KZURDMwzO8WQ的D20Roll9具有native rollType=attack、无Midi标记，system.origin和WMP midiCardId共同指向usage gZRx9k9hCiBbJYoK；usage保留Midi attack9/damage2。两卡source/item/activity/target/attackId一致，旧私有断言过窄被实际原件推翻；产品、骰和Apply均未变，旧PARTIAL/veto保留。
- 父读JSON并查看viewport图，六保护检查全通过：原6 TE prefix加4自有事件同row/count10、其他Setting、当前User671458...、owned Fog7b2b...、原11集合及time/paused/activeScene保持。终态JSON SHA 672ddb5ef8381771e297d53907031d33d14e8623e0d34392754d288a2645f181。父独立核两卡/账本/Slow并接受这一命中代表链，不推广所有精通、玩家/Multi-GM或R1 User恢复。
- 新缺口仅duplicate/普通重载及恢复。R5私有检查使用真实捕获卡片核标准native与Midi usage双关联/外来与歧义拒绝，以实际Core expandObject/ForcedDeletion核恒veto、Combat active intent及task保存→显示→JSON解析；检查通过。显示测试首轮缺callback绑定，仅修测试桩；未执行实机重试。产品300项/构建/安装/掷骰证据复用。偏好原像仅记录已知安全形状，未知值不导出、不修改。
- R5 command 66aac81b6126e94140a8b37fb19c1b8b9da0904d74187d6a769c4d52fe837cba / Import 4ea4b1baa15356007462399e5c7960a61ca048648005424373b34a5cb295a499 / finishId 7d14eff0-270f-4c04-a1b0-6e0e2d15af89已准备。无use/Apply/新建入口；同attack duplicate零变化后普通重载读回，再正常API清绑定卡、R1新增roundmarker、owned Combat/Scene/两Actor。删除Combat前清本地view指针，随后正常恢复原Combat active；自动_stats单列审计，业务字段须按旧完整hash反证。Scene正常服务端cascade仅清自有Fog，同时保存/核对原Scene当前用户Fog指纹。
- 精确TE row/raw恢复后第二普通reload清一次加载缓存；保存restoration收据后，在同一running closure正常删除两份自有证据Macro，随后include-all Macro的服务端GET最终读回并导出ID/hash指纹。任何新异常停并保留；已核辅助偏好、owned-key Sequencer清除、cleanup roundmarker/movement请求仍全部veto。R1 User70b2原像UNKNOWN继续单列，不猜写。
- 本轮只变私有工具/执行记录，产品入口/版本/用户步骤未变，不刷新手册review或重建H4，不commit/合并/push/操作Mirror或生产。R5原生结果尚待回传，不能预先接受duplicate/恢复。

## WMP R5已接受行为与剩余恢复（2026-10-12）

- 原Chrome同候选66aac81b.../单loopback30002/PID38672正常执行；父核persistence-passed JSON并查看viewport图。同attack公开duplicate为committed/zero settlements，world66fe...、Settings3e632...及HP/Slow/TE均不变；工具普通reload一次后HP198/walk20/同Slow/TE10保持，父接受这两项，不因收尾失败重跑。
- 正常精确删除native attack pMD5KZURDMwzO8WQ、usage gZRx9k9hCiBbJYoK、R1新增roundmarker7Phwp4h3BkTLohVj及owned Combat6BYyuAQB3T780JjJ。原Combat8WCtc3bOyudYuHzh已正常恢复active，当前SHA654fc2fa2cf33a76dea7675084579ebaeb62cea544a556c2db8d0e813ebe404c；仅_stats.modifiedTime由1791207337148变1791783112210，置回原stats的内存反事实匹配原3c5252...。没有再激活/倒写metadata。
- 之后assertGuard捕获两条preUpdateSetting同rowTOHsTrEEnPBKCjUg、仅value/_id，全部veto；stack到ClientSettings.set，没有上游模块caller。私有guard漏记key，此时不能归因。工具partial-r5/failedPhase=cleaning，Scene/两Actor/Slow/Fog/TE/两Macro及live guard保留；TE恢复、第二reload、最终Macro删除/删除后读回未执行。
- 当前新缺口只需exact Setting元数据及剩余状态只读核对。新工具bef1915fd38d77911c113e630eb338448dc7f88db4a120d79af4965ff17d3022 / Import144a58a50433c17a3be271edf590ec7bfbb288a4db83f3d466be6bb97f057979 / readbackId4d3a0ef2-87e6-4d68-950a-4e271b771c98复用同controller/live R5缓存，先精确保留R5 run（canonicalSHA30ae9203...），不关guard、不重载或重做删除。仅导出row key/registered scope/user/type/module及raw hash、同key各行user/hash/旧key-value覆盖，核原世界仅三自有根加已审计Combat metadata、User/Fog/TE/time；值不导出。精确行/多用户同key/陈旧与歧义拒绝/无玩法入口检查通过；制作时一处手抄SHA字符错误已由门禁阻止，修正后通过，未实机重试。
- Core14.368 WorldSettings.getSetting按key和user共同find；ClientSettings.#setWorld对USER scope取当前userId后正常update(value)。同key数量不能直接判数据异常，不去重或改旧设置。实际TOHs...的key/scope/user仍待原生回传；之后只接剩余Scene/Actor/Fog清理、TE恢复及最终读回，已完成的Chat/Combat删除和active更新不重复。

## Calendaria用户设置已定位与R6剩余恢复选择（2026-10-12）

- 同Chrome只读bef1915f...通过exact live R5 intent保留run，canonicalSHA30ae9203...；新安全R5handoff文件SHA804b01b365020ad8eb611acefbe4fb5f3608b12f8d72f6972a50685ae21d0009，setting-readback JSON SHA022f79e5195acf6bbb5b92d6aded88f462b37bbe698b5915d87ec5c3794b20cc。六检查均通过，R5旧PARTIAL/veto保留。
- exact行TOHsTrEEnPBKCjUg为calendaria.calendarHUDPosition/current GM/user scope，registered/typeName同key/configfalse/Cal1.4.2，rawHash7e9d2cae3fcea88b937ff1e2b51657377747a5275d700ee02d67962276fdd473保持。同key6行对应6个不同user，全部原ID/key/raw值hash同，未异常去重；只解释这六行，不推广其他旧设置计数。原stack没有模块caller，实际caller UNKNOWN。
- 剩余worldSHA bef7f8adbcec7f2bda2f77c076061602f12d8d2283b79f49570e9a4a97f190cb，仅source/target Actor与owned Scene三个新根和已审计原Combat metadata四差异；三Chat/owned Combat已缺席。原Combat654fc2fa... active true、stats反事实匹配原3c5252...；User671458...、其他Settings、modules/time/原Scene selfFog及ownedFog7b2b...保持，TE原6+自有4=count10。两NPC HP120/198，target同Slow/walk20。
- 精确已装Cal1.4.2（manifest许可MIT链接），calendaria.mjs SHAe8f5ccf548417f3e04f8e3a2b37d8107bab37dd8177a3443d61d193980148681：位置设置为user/configfalse/nullable对象，HUD的zone/center/anchor调整正常调用settings.set保存位置。只作为恒veto的辅助请求分类，不放行常规UI保存或新增依赖；许可不扩展外部包发行授权。
- R6新缺口只剩原三根/Fog、精确TE恢复/一次普通cache reload和两Macro删除后读回。派发前用实际metadata绑定行ID/key/user、注册Hook恒veto及不同目标/形状拒绝，单行条件恢复要求其他Setting/world/module/User/Fog/time全部一致，异常零update/save；确认无duplicate/use/Apply/Combat激活/旧Chat删除入口与报告值最小化，全部通过。产品300项、已接受命中/duplicate/首次reload不重跑。
- R6 command8eb462173159c12936e20f5d8feb6f8ee1d77f258f0e012e5f3433b3c6f09c4d / Import27e24feb2f17589a29b91a7ef047263db7a0b3f097bced5c91c51eafdb013a4f / finishIdd1d54a4b-6b89-4cbf-a759-bf22d93a9856准备完成。同controller新阶段嵌入已保存安全handoff，正常删除剩余Scene/Actors，恢复TE后只作尚缺的第二普通reload。该已知位置偏好原像仅留本任务控制Macro、报告删除该值；若新客户端在guard装前仅自动改此行，正常API精确还原，其他漂移停止。证据Macro和临时原像随后正常删除，同closure全集合GET最终读回；未知旧User原像不猜写。
- 只改私有验收/恢复工具和记录，产品/用户步骤未变，手册/H4包/产品测试不重复；未操作Mirror/生产或Git发布。R6原生结果尚待回传，不能提前宣布剩余恢复通过。

## WMP R6完成与IFS更新准备（2026-10-12）

- 原Chrome按8eb46217...完成R6三剩余根/Fog清理、TE精确恢复及所缺第二ordinary reload（R6只一次），正常GM Join一次后restoration-passed保存；随后两Macro删除，真实final-readback再完整GET。phasecomplete/errornull/blocked[]，Calendar unchanged，条件单行还原未在实机触发；不把单测分支写成已实测。Native配置/源/PID38672及单loopback30002前后相同，服务/tab保留。
- 父核final JSON并独立重算完整ID/hash数组：actualWorldSHA d01b61e92c19cd92653482d042e25dc69f7b3c8624a081b73af93344a8fda2f4；仅将Combat8WC...已审计_stats对应的doc hash还原为旧3c5252...后，normalizedSHA精确等原ce98afd7c9d47316b9124a29d630b7d3c69c4ec829ad39be228ab0f642fee8d8。九项已删Actor/Scene/Combat/Chat/Macro ID在最终全集合均缺席。11集合count：Actor294/Item213/Scene65/Journal67/RollTable12/Macro92/Combat10/Folder163/Playlist0/Cards0/Chat1496，非Chat合计916。
- final JSON SHA87d3a8f9b38341180a7d816bcb58e06fcd951f91e9c92e845f0ba7f463b1a77d，父assessment文件SHAab4d765443a2ad055cf3ad87c5e1873dbe18763ea03df34660fc308eb7c56b41。Settings e71b38...、currentUser671458...、TE原6、原Scene/canvas/view/Combat/time/paused/空选择及originalSceneFog[]匹配。唯一metadata例外仍Combat modifiedTime，不倒写；R1 User70b2原像UNKNOWN与R4/R5 PARTIAL保留。未接受所有精通、玩家/Multi-GM或完整发行。
- 接IFS F1–F3：冻结ZIP e978d6b.../JSb8568515.../11文件及67项/423断言与类型证据复用，源码未变不重跑。私有定点updater核20个源输入、完整stage/原606实装tree、ZIP及WMP父接受，preview通过：仅README.zh-CN.md和scripts/index.js改变；beforeHash2d620d94... / afterHash8d8db5d5...。尚未写实装，需同owner正常关闭cor-cotn到Setup并READY后才apply。
- IFS局部规则/旧CLI默认只指Mirror；该CLI实际会建backup并rename/cp，不符合本任务无备份和避开Forge约束，未调用/改其默认授权。本任务沿用已授权独占Next的既有TE/CC/WMP定点维护流程，不创建额外Lab、备份或删除文件，不改Core/system。公共旧安装入口仍须按[共享交付与运维](workstreams/release-and-operations.md)的共同操作边界整改，不能把本轮定点维护记成公共安装器已修复；L3为合集发布目录，不误记为安装器切片。
- IFS普通仪式负责结果/历史，不自动恢复HP；目标最小链为自有dead/contributor、正常request投骰、GM贡献确认、genuine blind最终骰、唯一历史/旧卡重放/重载。原生F1未来schema零Actor写拒绝可同时验证新加载写边界；玩家非owner/多GM和无CC需分条件，不伪造消息或用当前CC活跃冒充无CC。正常关闭及新候选启动同时释放旧WMP页面guard/closure，之后建立IFS新工具。Git/公开发行/生产/Mirror均未操作。

## IFS正常关闭前置的首次失败与响应层定位（2026-10-12）

原Chrome菜单关闭操作一次后仍/game/active=true，READY未写，IFS无installed写入。父已核截图/实际menu HTML及Core14.368精确source：仅other users存在才出确认，独占GM无确认正常，撤回以缺确认判失败的预期。服务端owner日志15:21:46确已记录接收关闭请求，初始未达服务端假设减弱；HTTP状态/redirect尚缺，不能从菜单消失或无console error判关闭通过。

下一步仅正式Chrome既有POST/setup安全metadata与当前UI/status读回，不重放关闭/改Cookie或Config/用CLI杀进程。具体源hash、第一手v11案例的差异、AnySearch TLS失败与授权网页fallback在[正常关闭诊断](../../reviews/2026-10-12-next-normal-world-close-diagnosis.md)。WMP接受和IFS frozen preview/两文件计划保持，其他业务/CI不重跑；若原操作稍后正常关闭并核同Node inactive，可保留旧失败后按新证据写READY。

## IFS关闭响应能力缺口与隔离前端复验选择（2026-10-12）

正式Chrome SDK无既有network-response metadata入口，未调用禁止的cdp/其他通道；HTTP status/redirect UNKNOWN，当前同Node仍active，READY/实装未写。父源码确认HTTP request.user按session/world映射赋值，旧Socket页面身份不能证明当前HTTP身份；会话创建时间日志不足以确定本次会话缺失。

固定session Cookie不按端口隔离，且当前是否共享jar没有证据，故不清Cookie/重登旧host或归因Forge。一次新的正常认证复验使用专属.localhost前端别名（完整URL见关闭诊断），仍同127.0.0.1:30002绑定/PID38672/data-next，无DNS或服务配置写入/额外Lab。新页只读证同目标后才关已完成旧自有页；既有私有约定正常GM Join，原生Return Setup一次，失败停止，不变更Core或强停进程。后台canonical preview0979/Sourcee978及所有安全门保持，前端alias/新tab/新登录与关闭次数单列；结果尚待。

## Chrome隔离能力核对与继续独立源码（2026-10-12）

- 一次专属.localhost新页被官方Chrome客户端`net::ERR_BLOCKED_BY_CLIENT`拒绝，目标未绑定；无旧页关闭、GM登录、再关闭世界、READY或实装写入。拒绝仅限该URL，不能记作自动审批拒绝或扩大为canonical被禁止；没有更换host/通道绕过。
- 独立Chrome只读inventory回传已父审：browser3同时可见本任务owned30002页与127.0.0.1:30001页面，后者未操作/认领，也未导出标题/路径/query/内容。SDK不提供context/cookie-store隔离标识，登录隔离仍UNKNOWN；sessionName仅有命名文档，没有Cookie隔离证明；当前正式SDK无独立隐身/context创建入口。能力缺口不等于Chrome本身不支持隐身。
- 用户要求解释上一问题，已说明重新登录Next可能影响Forge网页登录；不是新的登录/干扰授权。按原不干扰Forge要求，先保留Next/旧自有页与IFS preview，不重登或强停。原生验收待正式独立登录环境或共享占用解除后继续；源码计划不因此全停，接TokenSync S3统一帮助入口。当前仅修诊断/交接记录，产品/手册用户正文未变，不重复测试或构建。

## TokenSync S3源码切片的检查依据（2026-10-12）

现有S1测试不覆盖新的帮助入口。新增只读帮助接线与owner正文后，需验证active/ABI/entry的精确路由、玩家不调用GM合集接口、可选依赖失败后的独立阅读、重复/最小化重开，以及实际getSceneControlButtons按钮不写设置或文档。运行现有模块测试与类型入口；正文/实现watch改变后人工核对并生成统一手册，重新准备本地交付。旧S1包冻结证据保留为历史，变更后的候选另登记；606帮助视觉、玩家权限和HUD同步仍需原生接受。

## TokenSync S3本地完成与原生延期（2026-10-12）

- 新增真实Token控制栏帮助按钮；GM仅通过active Suite/ABI1/精确entry调用统一手册，玩家直接读随包窗口，合集缺失/不兼容/调用失败也回退。正文迁到owner docs/manual.json，中央仅source引用；所有36个稳定ID/watch保持。没有模块硬依赖、设置或文档写入、新持久身份。
- 现有模块安全入口35项/348断言与类型通过；进一步加强“错误Suite不得调用”后只补跑帮助10项/247断言及类型，全部通过，未重复HUD业务/构建。原生超时负例的预期错误日志保留。测试证明实际Hook按钮零设置/Actor写入、玩家不查GM接口、回退同源全文、并发/最小化/关闭后重开；不等于Foundry视觉或玩家同步已验。
- ZIP 37578字节，SHA b9e34b65617e21fd736687e5ae636be59ce72a0ab4aeec1796fefb1090a7ee3d；JS cc743bfe90508203b10a698397213eff54c7d0a169b4f7e80d6ca88519c1abbd。5文件白名单、CRC、archive/stage逐字一致、13源码输入已冻结。新收据.local/suite-direction/next606/tokensync-s3-build.json SHA cfda0565c17364175760bf8bbb04253fada602779a86dce4c320b689d072c6dd；旧S1收据保留为历史，新包未安装。
- TokenSync及开发手册来源人工review，handbook build/check均36项通过。H4内容变化后以现有release验收入口完成两次真实准备/一致性，4项72断言通过。当前Suite ZIP 858863字节/SHA883f14b274adf76e2386697b1586d965a6979b60319ebd7556189e95a3433049；完整HTML1226025字节、根与交付同SHA88e73a9476e0a353bda724be0c616b64b2e30d6ec61e4b2a240d19cca691f1ec。最新交付仍未安装/发布。
- 用户明确回复Forge“还在用，继续避开”，不再重问浏览器共享状态，不重新登录/退出或操作30001。Next原正常关闭缺口与IFS frozen preview保留；S2/完整S3原生出口未关闭。下一独立范围为Resolver R1的producer/contract/consumer与写入边界核对；不依赖或复制Forge脏树。

## Resolver R1检查选择（2026-10-12）

本切片先核现有producer/contract/consumer及候选选择，不为重构强行改算法或搬目录。真实producer位于packages/generation/src/actor-spell-manifest.ts，便携validator/hash已属于packages/spell-manifest-contracts；src/core/spell-resolution中的契约文件是re-export，resolver/planner/normalize仍有实际纯实现，当前模块是主要运行消费者。先用已有契约/生成manifest用例确认pending与目标世界ID拒绝，用现有Resolver安全入口定点覆盖确定性候选、来源索引与所有权。未改输出，不新增正式生成产物、不触碰Forge工作树或世界；结果只作为R1静态边界证据。R2事务/补偿与R3原生施法另保留出口。

## Resolver R1结果与R2提交读回缺口（2026-10-12）

R1已有契约/真实生成器fixture21项45断言、确定性候选/可读来源索引/严格所有权54项176断言通过。manifest仅pending且禁止目标世界ID，显示名不作自动键，当前来源hash与完整group/ref绑定保持；不更改生成器输出，不将单测称为正式来源链或目标世界水合接受。

R2代码核对发现最后Actor.update保存spellResolution后直接返回committed，没有保存结果读回。精确Core14.368 client-backend在preUpdate拒绝后去掉更新项，全部拒绝返回空数组；Document.update可以因此返回undefined而不throw。补最小反例模拟最后提交被静默拦截或仅部分记录保存，要求进入原有补偿并保留准确phase/residual；不是新增故障注入到运行中世界。反例先在原代码执行，再只修本模块提交边界，运行事务/补偿相关已有检查，保留R1结果。

## Resolver R2反例、独立审阅与恢复修正（2026-10-12）

- 旧最终提交在静默veto和report缺失两反例均错误返回committed。新增源flags逐字段读回/提交后owned结构与hash核对，期望值与更新参数分开clone，失败沿现有phase commit补偿。
- astra-orchestrator独立只读审阅发现P2：旧rollback普通对象更新在Foundry会递归合并，已写入的部分提交字段无法清除；原fixture整体替换掩盖该风险。改成默认递归合并后，veto通过、report缺失/内容漂移两例明确恢复失败。中间伪造完整Foundry全局的fixture导致无关Hook生命周期超时，已撤回，改沿现有host-port方式注入字段操作，不改真实服务。
- 恢复使用与既有Undo一致的公开ForcedReplacement，只针对flags.<resolver namespace>。在首次文档写入前验证并预构造；普通旧值先clone，operator Proxy不再clone。缺接口/构造失败零文档写；其他模块flags保留。递归fixture下事务37项232断言和类型通过，第二次提交/Keep/Overwrite/失败残留原出口保持；独立复核P2已关闭，无新增阻断发现。
- 最终提交与恢复相连，需在本模块整合边界运行一次现有完整Resolver组，覆盖Hook服务、Undo、构建与生命周期；不是全仓CI。实际运行/权限/补偿故意故障仍未执行。构建前核本任务dist只有旧8文件/ZIP且无链接；旧builder移除force选项，仅忽略ENOENT，其他清理失败继续抛错，由现有构建检查覆盖。

## Resolver R1–R3本地候选收尾（2026-10-12）

R2完整模块349项1656断言通过后，R3新增GM设置窗口只读帮助并迁移owner正文。帮助与原接线/版本/双语/实际两次构建46项407断言、类型通过；保存表单submit=0/设置写入=0、手册ID与runtime ID区分、GM中途失权及回退/重开已机械核对。完整记录见[Resolver提交读回](../../reviews/2026-10-12-resolver-commit-readback.md)，真实水合/异常恢复/帮助窗口/施法/停用后缓存仍待验。

Resolver ZIP298576字节、SHA4c75ca373324c4390fb86d1a0ce02452b46b5d93c465d65cb602dc86a29c874e，JS aa2c1fbb33c6b20c8532dd46630110e59f83fe436ecdfa8fff71f2b5aec34f53；8文件CRC/白名单/archive-stage逐字一致，45个源输入冻结，版本0.1.7候选未安装。收据.local/suite-direction/next606/resolver-r1-r3-build.json SHA d64e1593c0bb6a0fba18f787e4020f39e12bb4ec65b79cbbb3f83a469b41def6。

手册Resolver/开发来源人工review后，36项build/check通过；H4双交付4项72断言通过。当前Suite ZIP860493字节/SHA6356836539c5ad306bd8c9d2ea953b0b108889021969a942060ba900e66e33da，完整HTML1227601字节、root/交付同SHA845f1b486ac09beca6687a49b9f3f56708754f82bba12809d38137b63ce7ca31。未安装最新包或外部发布，Forge继续避开。下一独立源码范围是Chat Guard G1/G2缓存生命周期。

## Chat Guard G1检查选择（2026-10-12）

现thumbnail-cache已经独立，保留其owner，无需再拆文件。发现clear只增加generation、不移除inFlight索引：立即重新请求同一头像会复用旧请求并得到过期结果；若仅清索引，旧请求finally又可能删除新请求。另失败来源Set没有容量限制，runtime失败日志包含源路径/原始error，超出计数级诊断约定。新增受控Promise时序反例，覆盖clear后新请求、旧完成不清新请求、同步抛错后的索引释放、失败记忆容量和资源释放；只在本地使用合成头像与错误，不访问真实聊天/媒体。先运行最小缓存/日志入口，再按实际生命周期影响接G2。

## Chat Guard G1结果与G2检查选择（2026-10-12）

G1新增四反例在旧代码均失败：跨clear复用旧Promise、失败来源无界、同步抛错留下pending索引、零容量返回已回收URL。修后inFlight完成仅移除自己的Promise，clear释放索引，晚到资源仍回收；失败记忆有容量上限，独立失败计数保持准确并在clear重置。runtime诊断不再输出源URL/原始error。缓存/诊断14项49断言及类型通过。

G2现有stop只断开聊天Observer并清缓存，没有退订4个Hook，重复start也会多注册；正在等待的裁剪/头像更新可能在stop后继续。补真实DOM与受控异步的本地反例：start幂等、stop仅移除自有Hook/卸载事件、restart可用、停用/关闭后的后续裁剪与retry为零、晚到缩略图不能覆盖新的卡片。保留世界ChatMessage集合，模拟ChatLog.deleteMessage仅移除DOM，不创建真实聊天或服务器操作。

## Chat Guard G2审阅与共享正文渲染选择（2026-10-12）

G2四个旧行为反例均复现后修正，另补多窗口refresh中关闭一窗不应阻断另一窗的反例并通过。独立审阅指出旧裁剪批次在第一次DOM删除await期间调高保留数，仍会发第二次删除；真实runtime.refresh/JSDOM反例先失败。现在controller每批捕获runtime generation，在每次后续删除前重核；9项相关检查通过，fake世界22文档保留，只完成已在途的1次DOM删除。独立复核P2关闭；G1/G2未实装或获得长时/原生接受。

G3接入时，TokenSync、Resolver与Chat Guard已有三个真实的同源说明消费者。按codebase-design只提取纯正文渲染到suite-handbook公开出口：给Document和正文，返回脱离宿主的只读article，不读Foundry、不注册事件或执行命令。各模块保留权限、Suite可选接线及窗口生命周期；不改已有Deck业务/接受。三个候选声明workspace源码依赖并继续编进独立ZIP，无新增必装Foundry模块。检查共享渲染的文字安全/宿主不变与实际各模块入口，补架构门与源依赖/lock一致性；旧候选hash保留为历史，收尾重新冻结，业务事务检查不重复。

## Chat Guard与共享渲染最终本地包（2026-10-12）

Chat Guard完整48项298断言、公共手册19项213断言通过；TokenSync受影响帮助/入口/构建15项277断言、Resolver对应46项407断言通过。四个相关package类型通过。架构首次拒绝Chat Guard的package依赖后，仅放行suite-handbook公开index，其他业务/私有依赖仍拒绝；复验1294模块/2901依赖无违规，cycles退出0。三处Bun类型固定原1.3.14，frozen安装检查no changes；未升级运行时或其他模块类型。详见[生命周期记录](../../reviews/2026-10-12-chat-memory-guard-lifecycle.md)。

最新候选（均CRC/白名单/archive-stage逐字一致，未安装）：

| 候选 | ZIP字节 / SHA-256 | JS SHA-256 | 源/文件与收据 |
| --- | --- | --- | --- |
| Chat Guard 1.1.0 | 42761 / 1c3f58ffd6656d8d09a9ae9c2212b94e55196f15c20f573d04ab076492a35dde | a5061cf9fa38cb721c888881f1a3994b35470e2f5ab95cdc88fe7e8a61e7829a | 24源/6文件；chat-guard-g1-g3-shared-build.json，SHA33fff0f7... |
| TokenSync 0.2.0 | 38382 / a3b5848e5ea489613c2e8478f1910cdd2464e2d2eb78e3dbb7c3eb4a126c3138 | db31337e8b6fd89fb54d6c278600c10a48f92eed0978594211617fa2150d5b1e | 19源/5文件；tokensync-s3-shared-build.json，SHA78ac5247... |
| Resolver 0.1.7 | 299426 / 11d3f3625967f9c326167268c382dbf4b34edbbf93eef054f833d858952e5d55 | b78528861dbc555d9a3a66cb17046eb5c440f6d97bdbd45293520220fc45de31 | 51源/8文件；resolver-r1-r3-shared-build.json，SHA14e29495... |

收据均在.local/suite-direction/next606，旧候选只保留历史身份。手册五项受影响来源逐项核对，36项build/check通过。当前H4双交付4项72断言通过：Suite ZIP862763字节/SHA6d55ac380c95ce6e1dc920ffb2b31b0896a1401f8071ba8b4a717dd548b9c2c4；完整HTML1230379字节，root/交付同SHA967260a6aedcd02694e2ec3b59f04f2671eae3bf7cdb02b4685d6eb84a7355de。最新H4仍未安装/公开发行。

下一独立范围为Session Monitor M1。已读其局部规则：普通test:session-monitor会运行启动真实Chrome的companion用例，因此本批只选src与明确无浏览器副作用的契约检查，不调用总入口或Companion/CDP替代Chrome验收。仅核源码/合成归档，不读个人录音或现有监测档案。

## 尚需产品决定的事项

- 正式品牌与新增合集入口ID，在持久数据/外部发布前确定；现有module ID不随品牌变更。
- 首批收费模块与维护周期/AI成本。架构建议先用手册+Deck完成试点，再按实际价值组合；不妨碍已授权技术切片准备。
- 首批各功能对5.3.3/6.x的公开承诺，依据逐模块实际接受而定；不能把两个系统线当作所有功能均已覆盖。

这些是后续产品/发行选择，不是本轮规划缺失的技术事实。普通可逆实现细节由架构负责人和模块owner在授权内完成。

## 后续每批追加的最小记录

记录切片、writer/候选、实际变化与依赖影响、所选验证/证据复用理由、真实接受/未执行、帮助/构建身份、资源读回、Git/发行状态和下一步即可。只有这些事实需要更新，不另外建立一套例行统计或重复报告。

## Monitor M1/M2 的异步存储反证

首轮 runtime 修复通过24项 src 检查和类型，但独立审阅用受控纯内存存储复现：事件追加成功、元数据失败时，刷新后计数落后并重复编号；停止事件元数据失败后重试会出现两条停止事件；GM降为玩家后旧Hook仍接纳事件。这些是实际修复缺口，不能以永久active或文档限制关闭。继续由同一writer扩展存储原子提交与恢复，保留schema1、1.1.2和历史；主控独立做帮助/交付。新增检查只覆盖上述失败、失败后的重载和权限边界，不运行Chrome/Companion/真实数据库。

## Babele B1/B2 检查选择

当前匹配在重复ID/range时取最后一条，翻译对象可覆盖文档UUID；渲染途中异常还可能留下半张已修改表。这直接涉及子计划要求的行身份/原文回退，先补歧义匹配、身份保护与中途失败的纯数据/DOM反例，再提取模块内匹配接口。另核语言缓存清理后旧Promise失败是否误删新缓存。只改本模块与手册，不读取实际表库或操作浏览器。House H1/H2由独立writer核对药水快照/手改异步边界，源码范围与Monitor互不重叠。

## Babele B1–B3 本地收尾

原4反例修复；14项/37断言与类型通过，独立审阅未发现阻断。纯匹配接口、全行成功后提交、缓存身份和注册幂等均在owner内。手册正文已归owner，保持原ID/sources/watch；2文件ZIP CRC/白名单/stage一致，ZIP `a4ea11a222a0970a502c7ec79834ff626ac02dd31e22c57e56f522854c411535`，收据 `babele-b1-b3-build.json`。没有安装，历史605两表接受不推广到606新候选。

## Monitor M1–M3 源码闭合

46项src与类型通过；独立审阅发现的跨事务序号/stop重复、GM后台入口、上限恢复latch及同步事务入队失败均已修正并复核。GM面板帮助接可选Suite或独立只读窗，正文归owner。禁止运行带真实Chrome副作用的聚合测试；当前仅模拟存储/事务/DOM证据，非真实IndexedDB或606会话接受。源码/手册最终构建准备中。

## Painter P1/P2 检查选择

只读核对证明P1已有纯plan接口，单格Square Fire产生Tile/Region/Light各一，14项现有plan/transaction/ownership检查通过。P2受控反例：非空计划的create返回空数组仍成功，service随后报告绘制完成。针对实际创建数量、唯一ID、Scene所有权读回与失败回滚补检查并修复，不新增效果/美术；原生P3延期。

## 内容模块 SP1/BH1/BH2 检查选择

Species已有独立accepted ledger→公开纯投影→pack IO边界；仅核当前target/hash/UUID保护，不重生成真实来源。Blood Hunter Preview发现仅凭旧logicalHash相等可跳过当前说明/Activity/Effect手改，先以保留原hash的合成Actor核反例；只修纯Preview判断，不执行copy/backup/apply。BH3旧副本/备份迁移与本轮无备份要求不兼容，保持待用户明确迁移方案，不擅自改成原地写入。

## House与内容模块本地收尾

House H1/H2最终75项/411断言、类型及独立审阅通过，药水update等待中的手改不再进入恢复基线，临时清标失败有同实例受控重试；不拓宽Midi版本。Species既有边界5项/52断言通过，未改纯投影或重生成用户来源。BloodHunter BH1六项构建契约208断言通过；BH2三个旧hash手改漏报与审阅发现的名称覆盖回归均关闭，19项通过/1真实来源跳过/86断言。三模块正文归owner；无真实角色copy/backup/apply或安装。具体证据见对应review，BH3保留无备份模式决策门。

## Painter P2 本地闭合

五类集合preflight/创建数/新ID/所有权读回与最终全量新增核对已完成。空返回、部分返回、外来/重复/错配、删除veto/throw、晚到未报告Tile及原计划空Sound均受反例保护；只清理明确自有新对象，未知保留并报告。最终coverage332项/6096断言/39文件、类型/build通过，独立复核关闭P2。未改美术或执行实际Scene操作；P3延期。

## K1/A1与外部来源登记

当前基线CLI/Web实际组合面、Forge公开browser-runtime消费者、Resolver/内容包owner及省略版本调用已落盘。未读取正在工作的Forge脏树；K2–K4等其实际成果交接，避免重写当前生成链。Midi六patch逐个SHA与local.9 lock一致，local.10历史请求接受单列；外部候选逐ID/版本登记，全部排除自有ZIP，许可未知保留。没有联网下载、重建外部候选或修改实装。

## L2/L3候选准备

共用只读ZIP校验器6组stdlib测试通过，四真实消费者实际校验通过：Monitor5文件 ZIP de9b49a1…，House12文件 cb71e318…，Babele2文件 a4ea11a2…，Painter93文件 0d4d8ed0…。前三者另用owner精确白名单，Painter白名单继续由其build gate负责，共用工具只核stage/ZIP相等。各收据绑定source inputs/文件hash，全部未安装。BloodHunter只单独构建浏览器脚本，不重造内容pack。L3候选目录与待决事项已落盘，未取得商品或Git发布授权。

## 本批最终整合读回（2026-10-12）

- 手册人工核对10项受影响条目，全部36项来源/目录/命令/指纹/生成HTML一致；没有缩小watch。正文owner迁移保留全部ID，新增校验工具登记在工程说明。
- H4最终4项/72断言通过，含两次真实构建ZIP字节一致；模块5文件/Foundry28项投影，完整36项HTML单独交付。ZIP SHA-256 `1ee2a4d9e32ad6ac0eb86bdd59a05ccb3507fd5f03d1a996e1685e79ffbbe7ca`；HTML SHA-256 `1c0366923fc00d7f14818f822bf4cc580fd254037bd7e3113cc1f3e4726ce3f1`，与根HTML相等。新包未安装/发行，旧原生证据不自动推广到新正文。
- architecture:verify通过：1304模块/2928依赖，无违规、cycle检查退出0；仅本批改变的类型/模块检查按各收据完成。没有跑全仓CI或声称合并准入完成。
- 当前主区只读确认master仍 `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`、仅既有`.omo/`未跟踪。所有修改保留任务worktree，没有commit/merge/push/改仓库名/生产操作。
- 剩余必须由环境/产品决定解开的门：共享Chrome仍由Forge占用；Forge新成果尚未交接；BH无备份写入方案、内容分发范围与品牌/渠道/收费方案待定。只读候选目录已准备，详见RELEASE_CANDIDATE.md，不把这些缺口标为完成。

## 2026-10-24 Next 6.0.6 适配与验收接续

用户原话：“那你接着把 Forge 以外还没完成的模块在 ServerNext 6.0.6 上的适配和验收补齐，已经通过的部分不要重复测。”据此继续本工作树的模块适配、必要本地安装与缺失的真实验收；Forge 排除，目标系统保持 6.0.6，已通过且相关输入未变的证据复用。此授权未包含 Git 发布、生产或商品发行。

实施选择与当前证据：

- 本轮父任务 `01a16e87-a8b1-7731-9a8d-6c9b309cbf94`。开工主区只读，仍是 master `3734eb2`；继续当前唯一候选树 `codex/20261011-144833-suite-direction-console-handbook`，原 317 个 dirty/untracked 文件 SHA 基线保存在 `.local/next606-resume-20261024/worktree-before.json`，不自动提交、清理或覆盖其他任务成果。
- 复用：6.0.6 的 TE 首次保存/事件、CC 状态/伤势/休息、WMP Slow/重复结算/恢复、Deck GM HP/力竭代表链，以及各候选源码/类型/包检查。当前四份安装脚本与相应接受构建 SHA 一致，不重放这些行为。
- 窄补测：IFS 普通复活与可选 CC；TokenSync 606 HUD/角色；Resolver 水合/Undo/原生 Cast；Chat Guard 聊天生命周期；Monitor 短会话/恢复；House 药水事务；Painter 实际场景事务；Babele 翻译行/原 UUID；Species 和 Blood Hunter 的临时新角色原生授予。各用例先保留原值与对象身份、单独重置，结束精确清理并最终读回。不将新角色授予接受写成旧用户 Actor 迁移通过。
- 本轮不追加长时会话、任意规则全组合或发行决定。Blood Hunter 旧 Actor 的 Copy/Apply 入口仍强制 JSON backup，与无备份规则冲突；先验证临时新角色的原生内容链，保留旧角色迁移的独立产品缺口。
- 官方 Chrome 26.1021.31345 标准连接已通过；本批 same-task-agent 执行器实际 `gpt-6.1-sol/medium/danger-full-access/never` 已由自身最新 turn_context 核对，browser 3，自有 tab 初始为空。未接管其他六页或切换 Computer Use。收据在 `.local/next606-resume-20261024/chrome-preflight/`。
- 只读包核对：IFS、TokenSync、Resolver、Chat Guard、Monitor、House、Painter、Babele 八个最终候选的 source inputs/ZIP/文件清单一致；TokenSync 使用最后的 `tokensync-s3-shared-build.json`，不是已被替代的旧 S3 收据。实际目标仍是旧构建，八包合计仅 20 个既有文件需要变更，无新增/删除/packs。当前 Next 30002 无监听和匹配服务进程，系统文件为 6.0.6。
- 安装检查选择：只为本轮离线定点 updater 新增 ZIP 在预检后被替换、端口查询失败必须停止、合法 payload 精确写入三个必要反例，随机临时目录内 3 项通过。独立审查提出的写前 payload SHA 和端口查询 fail-closed 两项已修正；没有重跑八个模块的既有静态回归。完整预览在 `.local/next606-resume-20261024/install-preview.json`。此时仅预览，尚未写实装或启动 Next；行为、安装与恢复结果按后续真实收据续记。

接续实际结果：

- 八包定点安装已执行：20 个既有文件写入、142 个目标文件完整 SHA 对齐；安装后仍确认 Next 离线，未动数据库、packs、Mirror 或生产。原始 `install-receipt.json` 状态为 `INSTALLED_EIGHT_EXACT_CANDIDATES_RUNTIME_PENDING`，不将安装升格为玩法 PASS。
- 原 Next 正常恢复：Node24.17.0、PID48896、创建 UTC2026-10-24T15:48:37.6561440Z、唯一127.0.0.1:30002、原app14.368/data-next。原生 proper-lockfile 检查确认10/18遗留 options.json.lock 未被持有，随后由原生启动处理；没有手删锁。第一次就绪检查发生在监听之前，保留其失败，随后同一进程原生Setup读回通过，未重复启动。正常Launch cor-cotn/一次默认GM Join后，真实界面确认14.368/6.0.6/101启用，初始console error为空；父已查看身份截图。当前候选只读身份/业务工具往返继续，仍未新增玩法通过。
- 血猎范围收到用户明确答复，原话：“本轮只验收新建角色与职业授予，旧角色更新保留为只读预览”。实际执行据此限制为本批临时新角色；不修改旧角色Copy/Apply模式，不执行旧角色更新或备份。
- IFS消息归属的必要窄补充：精确源码确认原生最终blind消息只有GM speaker/flavor，没有其Actor/attempt身份。拟仅增加消息来源metadata，不含原骰/total/formula，也不改结算或历史；该变化单独做UI流程回归并更新IFS候选，旧接受不因此重放。工具独立审查同时修正等待期间外来聊天归属、嵌入文档祖先判定与未恢复状态不能进入下一用例等问题；这些属于工具缺口，未在实机重放业务。

## 2026-10-25 实际预检与工具修正接续

- IFS最小来源补充已实现并通过独立审查：普通/最终、快速两个已获结算锁的调用点向原生blind消息增加 `finalRoll.actorUuid/attemptId`，miracle无骰分支不变。新增3用例先红后绿，29断言、67旧例filtered；固定Bun1.3.14类型通过。未跑无变化旧矩阵。标准dist原件保留，新11文件包构建于任务 `ifs-provenance/stage/module`，ZIP SHA `5a444a3d...4262a`，新脚本 `a90b4a0b8d7ef81bbabc3b1a5a34b074e36f643983d314a70e49fc963faa7430`。
- 已经一次正常Return to Setup并父核同PID48896/active=false，只更新IFS这一个既有脚本；11文件整树与HTTP字节一致，未重启Node、未改开关。正常Launch/GM Join后UI仍14.368/6.0.6/101启用。新包运行接受仍待真实仪式，不将静态3pass升格。
- 本批仅有一个新工具Macro `FerafSKnc8hvkj8U`，名称 `[Next606 Indep] 20261024 786465bb`；普通Create/Import成功，未覆盖历史工具。原生Export/编辑器全文读取的运输问题见[专项记录](../../reviews/2026-10-25-next606-macro-readback-transport.md)。后按精确Core和错误源零写反例，通过正常Execute的内置完整source断言进入选择器；这不是独立DOM导出完整command。
- 首次完整preflight原件610989字节，SHA `946e8608beb9b44465eb0c355f9fb9e4b3df04b113241f14618d60fac4b201f0`，父侧独立解析/复算通过。七候选active/version/HTTP SHA、精确目标与11集合/设置/User/Fog指纹齐全，`state=null`、`behavior=NOT_EXECUTED`。官方单次DOM输出截断后仅读同一显示正文的13片段补运输，未重放该次预检。
- 随后选择house的实际UI值正确，但Run回调仍跑默认preflight；两次都未创建业务fixture。已保留 `chrome-business/house/selector-blocker.json` 和原件，误名 `01-house-applied.json` 实际是ready，不能作为Apply证据。精确Core14.368 `DialogV2` 会把DIV内容转换为innerHTML再生成新DOM；工具闭包读了离线select原节点，故永远默认值。只修实际dialog中的选项读取与对应真实渲染反例；现有七包预检与IFS安装证据继续有效，不重打模块业务或整合CI。
- 当前真实保留状态：同一Chrome extension，Node runtime重建后内部browser ID3→1，owned tab仍 `651350433`／`http://127.0.0.1:30002/game`；Macro为本轮所有，无业务Actor/Scene/药水/会话fixture。已登记旧保留Actor `LN5PLqTTdx0l7o7w` 的Item identifier初始化错误再次出现，保留原件，不修该旧文档或归因为新候选。
- 唯一下一步：独立工具writer完成selector回调修正/冻结后，只覆盖本轮Macro并普通reload清旧闭包；保留已过preflight，先House/Monitor实际链与精确恢复，再其余五模块。规则/内容工具四类风险已修并独立审查接受，业务command `2c92fc9a...3760d32`，IFS依赖新来源标记；后接IFS有/无CC与Species/BH新角色。Deck仅补非GM拒绝/失效UUID/自然禁用提示，TokenSync补真实权限与第二客户端；不重跑TE/CC/WMP/Deck既有代表链，不追加任意全组合或长时。

### 选择器已闭合，House 真实失败与定向修复

- 工具r2保留原编译/JSON/收据，独立新目录 `independent-probes/r2-live-select/`；17项工具反例通过。仅覆盖本轮Macro并普通reload后，真实 `selector-readback` 返回actualSelection=selector-readback/live-dialog-form，SHA `31bd0ad1...52d32f`，不再跑完整预检。r2 runId `07b8fba8-694e-412a-ba01-119ac3214ce9`／command `ddd821f4...b37e4c`。
- House首次真正调用Preview/Apply后复合断言失败，原件 `chrome-business/house/04-house-applied-r2.json` SHA `8a04d02d7c4e6c52c40ffabb34f8bf1e5756d861174f50f6b31ce22db8a8c652`。保留Actor `qNQLb4WOYJHGF4oz`／Item `LLIsHzEYvY50v5GG`／phase=prepared／restoration=PENDING；未重Apply或cleanup，Monitor未开始。原API返回未捕获，不能从后来快照追认返回值。
- 只读诊断从同一保留Item取得真实raw source：3条生成活动存在、snapshot仍schema1/activities={}。原件 `05-retained-readback.json` SHA `8407c31a82fbf83915123fe59be1171f98a70c6c6607807fd8049580becdb044`。临时诊断Macro `NjV4M4D7lVTiM76Q` 已正常准确删除并原生GET确认，`06-diagnostic-removed.json` SHA `c25780014da8e7be649d4449830ba02678977fa32bb542b6c831ded1b7360ab7`；原主工具/Actor/Item均保留。
- 因果已缩小到产品的计划比对：当前严格matcher把计划与已持久化的原生/Midi完整数据直接比较，而每活动有21个正常模型差异；其中仅template.units空值原生规范化为ft就能使纯内存反例由applied/schema2变成null/schema1。map标签与行_id不同不是此次Apply失败原因。尚不能排除原调用另有canWrite变化，故保留原返回UNKNOWN。
- 修复选择：药水writer只在House内部增加注册Activity DataModel的纯规范化接缝，在任何快照写入前生成完整原生预期，缺模型/异常零写拒绝；不删除默认字段、放宽手改或改变schema2完整保存/Restore保护。新增检查仅覆盖真实606行、正常单位规范化和非中性手改拒绝，补相应药水局部回归/类型/新stage/实机；不重跑无变化的Ammo/HP等75项功能或其他模块。
- 现场接续采用同一自有Actor另建一个空药水Item，仅重验失败Apply及未执行的手改保护/Restore/重载；旧schema1失败Item保持取证，最后随精确自有Actor清理。不清旧快照或手动升级schema2来制造PASS，不替换原完整世界基线。工具手改路径另须按实际map key唯一定位行_id，不能把两者混为一谈。
- 等待药水修复期间，仅准备Babele纯渲染的独立只读用例；不接管House的恢复待审状态，不开另一可变Case或宣布其他模块通过。

### Babele 6.0.6 代表接受与 House 新包实装

- Babele独立纯渲染已实际执行，未调用主工具begin或操作House现场。狂野魔法25/25、困惑术5/5中文结果、基本方位原UUID/中文标签、两次渲染一致，以及真实Dialog render后两表来源不变均成立；父查看了上段/困惑术段两张完整截图。脚本仍为 `b942753b...59a1031`，精确Core14.368/6.0.6/Babele2.9.1/libWrapper1.13.5.1。
- 行为文件 `chrome-business/babele/01-behavior.json` SHA `e349cfa6f701c26ebc750c0fdcc486cf3aba57020322a9a283510242d58aca9a`，实际UTF-8为1214515字节；最终文件 `04-final-restoration.json` SHA `7b20d9a5ba7155305361a71b414f8c1ad0f9c1353df42b456c6122a0239be3d9`，1820297字节。父独立深比较全部before/afterRender/final逐项完全一致，writeEvents=[]；Macro `teAxVVSqpcGLS4sI` 已准确删除并原生GET确认，House Actor/主Macro与原设置/User/module/time未变。`parent-assessment.json`接受限定API/视觉/恢复层；不重跑主工具的Babele，也不推广全部表库、英文表头/内联标签或实际掷表。
- House新修复已源码审查无阻断；5个新真实行/拒绝用例红→绿、类型与受影响药水组通过。选名regex额外匹配了少量同模块非药水描述，保留实际35通过的运行记录，不为统计重跑；没有全75功能/其他模块重复。新包另存 `house-resume/package-r1`，旧dist/release保留，12文件仅module.js变化。
- 同PID48896又一次正常Return to Setup后只更新House脚本；12文件与HTTP逐字节核新JS `ce044da8a16fd11f2ba381ef96738e8fd4f780f62aeb5095dc8382d0281945fe`，ZIP `41b6d09c...41f1de`。这只更新House的候选身份，不撤销其他六包已接受预检。当前同页正常Launch/GM Join接续，未重启Node/改开关/清旧Item快照。
- 一次性现场续接工具 `house-resume/tool-r1/resume-macro.json` 已经独立审查：保留原Actor/失败Item、完整主checkpoint/原基线；另建一个空药水Item只补失败Apply和未执行步骤，分项保存API返回/真实数据，按真实map key测试手改保护/Restore，普通reload后先停父审；通过后才adopt原checkpoint、准确删helper/原生GET、再reload原主工具cleanup。工具的四项离线检查和live selector事实均已核；尚无修后实机PASS。

### House 实际行为接受、User 历史缺口与明确继续决定

- 新脚本 `ce044da8...1945fe` 下，只在原Actor新建Item `mlQnAmd9T9uKgqi7`。真实Apply返回applied:true，3条Activity、schema2和完整实际数据/快照一致；父查看原生Sheet的Bonus Action快速饮用、Action谨慎饮用、Action喂服三行。实际手改Restore返回null并保留名称/快照，按真实map key恢复该测试编辑后Restore返回restored:true、0活动/无快照；普通reload保持。`resume-r1/05-after-reload.json` SHA `a3bfff06853a18c7e39613b9bc291a59a03fa634805e50342fcd7d927b3ca70a` 与父独立分项复核/图片接受见 `parent-mid-assessment.json`，旧失败Item仅取证未改。
- 经明确父审才adopt原主checkpoint，原baseline/TE/原Actor归属/设置原像和旧lastFailure保持。helper `3q5Y68P4MfeXvkcj` 准确删除并原生GET确认，普通reload后仅执行原主cleanup一次；Actor和两个Item已清。`07-main-cleanup.json` SHA `a6c360f7f09f3acd4759919a893d97b690380869071c905b95341bd25bbdbf1f` 为原始REVIEW：documentChanges=[]，Settings/module/time/pause/Fog全部true，TE.changed=false，唯一userUnchanged=false。没有重做已接受药水、改新baseline或猜写User。
- 初始工具仅保留User整体hash，无分项原像/User ID；时间线在多个区间出现不同User hash，不能指定历史变化字段或归因给House。Babele自身before/render/final保持的接受不撤销。安全诊断只请求原生User index显式白名单，无password/salt/full User GET或任意flag值输出；当前User `FccwB5HfAhy1F49a` 的16项服务器/客户端安全字段一致，服务器modifiedTime为UTC2026-10-24T17:25:37.324Z，晚于House基线；没有本轮Macro占Hotbar，观察区间无updateUser事件。当前新投影不能补造旧原像，`game.data.users`也不是不可变历史。
- 用户收到上述具体缺口后明确答复，原话：**“保留当前账号状态，记录缺口并继续”**。据此保留当前账号，继续其余模块，并给新用例记录充分前像；**不把旧User恢复写成PASS，不回写未知旧值，不撤销药水业务接受**。这仅是本轮该历史缺口的知情处理，不是以后任意User变化的豁免。安全诊断Macro `F8mbBFRY1RDWu343` 已准确删除并读回；其01/02/03和父判断保存在 `chrome-business/house/user-diagnostic/`。
- 下一步r3先通过一次性bridge原生GET导出Feraf实际持久旧run，与07.state比对并保存后，精确升级同一个自有Macro的command/binding/continuation记录，原run完整不动；避免普通Import的recursive:false先丢旧run。bridge删除并GET后普通reload，再由明确sole-User-gap continuation清本工具旧run开启新case，不新造业务通过。
- 后续User基线实施选择：服务器安全index逐字段tuple前像，绑定明确User ID；非敏感已知布局仅Monks position、npc/character角色卡宽高四叶及祖先存在性，其他flags只做不泄露值的完整性比较，凭据不读。post updateUser记录路径/时点/发送者/noHook；只有已捕获且精确可归属的布局变化才公开API恢复，未知变化仍REVIEW。正常_stats审计单列、不倒写。该检查改进不重跑产品、Babele或药水；先接Monitor等剩余模块。

### r3 接续与 Monitor 短会话实际结果

- bridge原生导出的实际旧run与House原件07.state完全一致，旧run SHA `0168d62d…00a449`。精准升级前再次核旧command SHA；只更新本轮主Macro的command/binding/continuation，旧run、其他flags及ownership保持。bridge `rgwol7UPYpsRvKWP`准确删除并GET缺席，普通reload后再次读回旧run/非User原基线通过。`r3-continuation/04-main-inspect-continuation.json` SHA `f23be9689a39cc212ddfa6fabdfabed6e123d07fbea4a34259b785918b1659a4` 已父审。
- 据用户原话“保留当前账号状态，记录缺口并继续”明确执行接续，只记录决定并unset本工具旧run，不重写User、不把旧raw REVIEW变PASS。当前主Macro `FerafSKnc8hvkj8U` 的r3 command为 `28246d25…96d526`；新User证据helper为 `edba0ac4…418eb`，新布局/归属检查10项通过；旧产品行为未重测。
- Monitor仅执行一个短会话 `1c29db88-d4bd-4fc0-ac4c-f103b96e4150`。真实面板记录中、实际卡顿标记、普通reload后同ID恢复与一次stop成立；导出6 samples/6 events、refreshCount=1，恰好一个session-stop，两个原历史完整export hash保持。父已查看重载后真实面板。行为文件 `chrome-business/monitor-r3/04-recovered-stopped.json` SHA `3733ea3c…c2dd4`；不推广companion、四小时或其他角色。
- `05-cleanup-final.json` SHA `61ca6bebf8b9326a24904a3a36fd2aa2e69dfd3bd9c246034b493a467e64ab88`，2007858字节。父独立深比较baseline/after全部字段逐项相同，包括11文档集合、设置、模块、Fog、时间/暂停、受控/目标Token与当前User安全tuple/非敏感flags/布局；本例post User事件为空，状态为cleaned/PASS_WITH_SCOPED_USER_EVIDENCE。此结果不是全User字节比较，也不修复旧House未知原像。
- Monitor清理已await正常deleteSession并复核原历史；最终世界指纹不能证明客户端IndexedDB archive缺席，因此仅追加一次公开list/export只读缺席读回，不重开/重跑短会话。当前转入Guard的最小真实聊天生命周期/禁用用例；其他模块仍按原缺口排队。
- 上述archive缺口已补：独立最小reader经5项工具检查与只读审查，公开list仅原两ID、测试export严格null、两原export完整hash一致，`07-archive-final-readback.json` SHA `550cb67c13541c487c7fd3900d5a9568f084b25d170a13161503241546dcd1fb`父已读回接受。随后准确删除reader `IKv7LKSmaUNEuTCY`、原生GET/客户端均缺席，`08-reader-removed.json` SHA `4488e906e3f10ac41c704c72e3edc843cee6c24faa5da9409547abddf22a9752`，无删除后持久化；没有重开、停止或再删除Monitor会话。Monitor本轮限定出口闭合。

### Guard 真实裁剪、禁用与侧栏偏好恢复检查

- 仅一次创建25条本轮消息。启用/retained20时DOM20、世界25；通过正常个人配置UI禁用并普通reload后DOM25、trimmed0、世界25。再按完整测试覆盖恢复enabled/20/system/thumbnail/128/75并普通reload，DOM20、trimmed5、世界25。实际证据为`guard-r3/08-disabled-after-reload.json` SHA `fdfcbd9b…375ee`与`10-reenabled-after-reload.json` SHA `8a80c146…33222`；07/09只是UI操作后尚未刷新回执的旧显示，不按文件名追认通过。
- 正常默认头像mystery-man.svg fallback可见、thumbnail cache0，因此不声称真实WebP转换通过。实际上滚/回底没有新消息，未形成暂停裁剪反证；不为该观察重复25条创建。重载前后attached聊天窗口数1稳定，getStats.moduleListenerCount是窗口数，不是全部Hook总数。统一帮助实际窗口截图已保存。
- cleanup后25条自有消息消失，世界文档差异为空，Settings/modules/time/pause/Fog全恢复。`13-cleanup-final.json` SHA `8e44507840a4f9609127972635ec2027fadd34ae7ecbe0ef3b585316a26f8f68`原始REVIEW保留：公开User业务字段与5个已采UI字段一致，唯一非UI namespace hash变化为Monks Little Details。真实post两次捕获当前requester/guard的`flags.monks-little-details.sidebar-tab`与正常modifiedTime。
- 精确安装源码1282–1284确认Monks在changeSidebarTab时正常setFlag保存tab.tabName，470–474在初始化时恢复该偏好。当前r3只有namespace原hash、没有该安全叶原值，不能猜写或扩大旧House豁免。仅准备只读有限UI枚举与原完整namespace hash匹配，若能唯一证明原叶，则正常UI回到原标签并补一次restoration-readback；否则保留未知。没有重跑Guard业务、切换新基线或开始下一可变用例。
- 首轮只读helper实际18个tab/缺席/null候选均不匹配，其他namespace/敏感覆盖保持；原件`sidebar-preimage/01-preimage-readback.json` SHA `c8639b2d…dd572`保留，不能把已观察的单叶事件当全部差异来源。新源码1287–1288/476–480另证实展开布尔偏好的保存/初始化，故仅准备有限双叶联合反证；准确helper仍`8ACKE34wXntp3ZBj`，r2 command `ee873a84…02f624`已独审，无匹配将停止更多字段猜测。详见[UI偏好恢复调查](../../reviews/2026-10-25-next606-user-ui-restoration.md)。
- 双叶72候选实际仍无命中，原件`02-joint-preimage-readback.json` SHA `8e0f3c09…1c44b`。按停滞规则停止原路并作AnySearch作者源码/CHANGELOG调研，结合本机MLD14.01 `apps/macro-config.js`12–22行发现原生编辑器按Macro ID延迟保存尺寸；此前诊断本身新增的尺寸键不能靠侧栏枚举解释。没有开始几何数值或其他个人偏好的暴力猜测。
- 新来源驱动r3只读反证，仅本轮3个精确Macro尺寸键retain/remove与原有限侧栏状态联合：576个canonical候选唯一1个完整命中原MLD namespace SHA `4eb37309…a4bc3`。原tab=macros、expanded=true，主Feraf尺寸720×600保持，只有后建reader `IKv7LKSmaUNEuTCY`和helper `8ACKE34wXntp3ZBj`尺寸键原应缺席。`03-owned-size-preimage.json` SHA `38f791cb5f53a46c371ff08ea3d99e45b677164a03c04509008d7b770000cc87`父已解析，其他namespace/敏感覆盖保持；不修改r1/r2失败原件或旧House结论。
- 据此仅准备artifact-r4精确恢复：command `5d482064…750308e`，JSON `5c5c6dc5…659af5`，3组新增工具检查与独审通过。两次原生main/User写前保护，单次公开User.update最多tab=macros及这两个尺寸叶删除；不覆盖map/namespace、不写expanded/Feraf/stats。恢复后父审才准确删helper，1200ms后末读防迟到timer；原Guard13和mainrun保持。此时尚未实际恢复，不能把前像证明升格为恢复PASS。
- 精确恢复已实际一次通过：`04-exact-restoration.json` SHA `ef90de2974420bc895bb9d704696ae8a57aa24521726f94b3b6011922340da6d`，父独立核requestedChange仅3叶、after原namespace与其他公开/非敏感范围保持；未改stats/mainrun。父审后准确删helper，延迟末读`05-helper-removed-final.json` SHA `64474b16d831e77aa5147da4512be34d917d3a0e770f1f1687ec46c5d6a6a81a`，原生GET/客户端缺席、2尺寸键持续缺席、namespace原hash保持，无删除后User写。
- 再普通reload，通过正式chat命令恢复Feraf，正常回Macros侧栏后只补原`restoration-readback`。`guard-r3/14-restoration-final.json` SHA `fa635c9b0697dfbc7f7a9e479d459c76a1bf130194416b418871d8749fcfcaab`，phase=cleaned/PASS_WITH_SCOPED_USER_EVIDENCE。父深比全部非User快照字段与原值完全相同，安全flags对象原件相同，User业务/已知布局保持，仅modifiedTime审计差异。原13 REVIEW与House旧缺口保留，不重跑Guard。当前接Painter实际事务。

### 后续工具准备与手册同步选择

- Rules仅新建`rules-content-probes/r2-safe-user/`，复用冻结User helper `edba0ac4…418eb`；当前使用artifact-r2 command `96cff0777dc99f10ce6c37fc17aaffbb180963fe971a639ac9619f493ee9e60d`、JSON `221d02671d4a262a512d9be2c8ba5bdc80ee118809ff7354016b1ff2efb9cff5`。9个本工具检查通过，独审确认User不落入通用fixture标记放行、删除前terminal/删除后仅GET重试/无后写、旧closure须匹配源码SHA。IFS无需开卡；新角色必要时只对自有fixture选择真实注册原生类，世界默认/旧Actor不变。未执行IFS/Species/BH业务，不能把准备当接受。
- Role独立新`role-probes/r2-user-baseline/`已冻结并独审无阻断，command `d7d86e26dceddc20147b0a48c164c5bf3adcf39d5235958bb47a98986a095d63`、JSON `9e7febe0bec8b67e4185f42f3d4b024cae397f0362f0dc245d21a614e5d21434`。8项新增接线检查通过，原Reader/Setting/User层字节保持；Actor.create无sheet，sidebar有原tuple/事件/全namespace反证才窄恢复，expanded/last-actor仅采。登出前flush与跨reload事件保持，删除后最终Macro/User只读核对及终态无后写已审。尚未创建User或实际角色验收，不计业务PASS。
- 正式Core14.368原生chat `/macro 完整名称`已源码与实际UI往返验证，不创建ChatMessage、不占Hotbar、不打开MacroConfig。后续初次Import后关闭编辑器待已证1秒debounce稳定再采基线；普通reload后使用该入口恢复工具。原始r3主仍五UI策略；未来八叶User层另存新目录，当前仅源码/4组局部检查，未整合或覆盖主工具，必须等Guard旧恢复闭合才精准升级。
- 当前已对Babele/House/Monitor的README和owner manual按真实限定结果同步；历史版本与未知边界保持。支持矩阵/health新增当前补充，不改写10月12日历史段、不把上游Babele全体提升为PASS。未因此覆盖已接受安装JS或重跑已过业务，最终手册尚待统一review/build/check。
- 固定Bun1.3.14的`handbook:status`仅报8项stale：version-selection、markdown-convert、monster-intake、verification-development、Babele、House、IFS、Monitor。前三项共同引用本轮新增补充的current-support-matrix；其生成/Intake入口、5.3.3目标与权限没有因6.0.6模块验收改变，最终人工核对正文后更新review，不缩小watch。IFS待真实结果再同步，工程条目核新的检查/来源边界；不运行全仓CI或重复产品矩阵来消除文档stale。

### Painter 事务接受与只补移动/重载的选择

- `painter-r3`实际一格FireI、audioOff，生成1Tile/1Region/1Light、0Sound/Wall；正常Undo归零、Redo恢复。一次本Scene的公开preCreateTile veto确切触发1次，失败红色通知实际可见，五嵌入集合前后保持、临时Hook移除。`08-veto-verified.json` SHA `1087bda7…8be27`，追加只读`09-post-veto-public-state.json` SHA `b127867b…e1a44`；父独立深比Redo与故障后sceneId/audit/counts/documents完全一致并查看图。
- completedStrokes从1到2不是写入或Undo历史条数：controller377的pointercancel与463–464的finally均增加该计数，painter-app110/176用它恢复Shift一笔后的面板；scene-history123–142仅mutation成功且前后不同后push。没有为此改产品或重复Undo/veto。`11-cleanup-final.json` SHA `5b3c2b1e2cced2ed66297710eb2f853d69dfbb7a8700e0a41809adb696d1c19a`父深比全部非User字段一致、非敏感flags原件一致/Userscope通过，仅审计时间变化，Scene准确删除。
- 该结果只闭合本次事务/可见样本，不能漏掉局部AGENTS原要求：6.0.6 linked Token falling改用Actor lastMovedToken，“validate the affected movement/Region chain before accepting this target”；子计划的普通reload持久性和非GM门也尚未采。已通过绘制/Undo/Redo/失败出口复用，只另备1个Square Scene/FireI/1NPC/2linkedToken的连续原生API移动与reload用例。精确研究确认先regionalize再measure，真实moveToken/passed/finished，再等Actor队列；A悬空后让地面B移动，6.0.6应按B清falling，不手写flag/状态、不调用plummet或伤害。新fixture绘制仅为缺失链前置，不重跑事务矩阵/全格型/美术。
- Role临时Player亦窄补Painter只读门：新r3仅替Reader，command `7993a0be9538d4d54dd521a57a0a87f4152137d5de1ec6700d838c2227ee063b`、Reader `2e6f2dc946c36b260961f29844ebdf32d966066d6b1d5cd17bda7756bf1cc393`、MacroJSON `8e6921daa9a8f2d2d91ea0c8bb49b9229789066d71d7cefe9a30e56c467a4b37`。2项新接线检查与独审通过，controller反向替Reader后与已审r2逐字一致。只读canMutate=false且open/activate/deactivate不暴露，真实工具栏与GM最终零写仍待实际验收，不调用私有API。

### TokenSync GM 业务、页面恢复与仅个人日历位置的待决定项

- 原native HUD文字与图标两次未生效的原因经elementFromPoint证实为minical遮挡，没有Actor效果写入，不算同步失败。正常Close遮挡后命中实际Poisoned图标，两Actor各1效果；exhaustion各level1，两个linked Token共用Actor未重复升2。右键已有非分级状态时按精确dnd5e `_manageCondition`原生语义移除，不是overlay创建；对缺席图标真正右键后两Actor均core.overlay=true。该原生移除观察不改写为overlay PASS，也没有重复已过普通状态/分级测试。
- 原owned页651350433随后消失，官方owned/user inventory无30002页；没有以此重建fixture。父重新核原PID48896、creation UTC2026-10-24T15:48:37.656144Z、Node24.17/app14.368/data-next与唯一loopback30002后，同官方连接新建唯一恢复owned页651350506。正常身份门/Feraf原run/原Scene及Actor读回一致，恢复view与选择三Token后只接未完成操作，未prepare或碰Mirror。
- Overlay原件`08-overlay-created.json` SHA `a7eb75c1…95efb`；三Token fly且Actor原movement保持的09 SHA `e1958ec8…3ef12`；Default三null的10 SHA `21112879…fe529`，帮助窗口截图11已保存。自有Scene/Actor/Token已准确清理。`12-cleanup-final.json` SHA `2b4063ae8b3050b8962577bd35e40c1a0fbf70ae5ac30eb1808367804e9ab0e4`父解析：11世界集合/Fog/module/time/pause/视图与控制目标全部同原，User安全业务/非敏感flags/布局均通过；唯一设置差异为row `iWZGzzQw5Nh2n1nR` 的`calendaria.miniCalPosition`，原值hash `2a8ad6d0…710ac`变`f70c502e…c4f8d`。12.state的canonical SHA为 `94e2edb4e0e5c839ae87e19ff390b967f3ee906cb336feab7dd7b46a0e5d8c0d`；精准升级前仍须原生GET核实际持久flag一致，raw REVIEW保持。
- 已核Calendaria1.4.2 source map：settings-handler28该key为user scope/ObjectField nullable，mini-cal1406仅保存left/top/zoneId；不是日期/时钟。原工具只保存hash，10月12日历史安全诊断也仅同hash，无旧坐标值。没有猜写位置、读取LevelDB或把记录差异说成日期改变。用户已收到本次与后续纯UI偏好保留范围问题，尚无答复，不能把前次House答复扩大或将12重判为恢复PASS。依赖该选择的下一可变case暂不开始，移动工具及r4针对该安全布局原值的捕获继续离线准备。
- 读取连接器`foundry_next.get_world_info`仍报module not connected；没有为此启用额外模块或切换实例，后续仍沿已验证的官方Chrome原生UI/Macro路径。
- 客户端同步开关的独立只读DOM也已补齐：`tokensync-r3/14-toolbar-toggle-dom.json`当前唯一可见selectedTokenSync按钮aria-pressed=false、无active，匹配本例原enabled=false；未重新点击开关/打开设置或读game globals。原12 UI位置REVIEW保持，不以该补证抹去。

### 工作区保持与并行主区变化

- 再核开工317个既有dirty/untracked SHA：本轮17个已登记owner源码/测试/说明/总账文件改变，其余300个原字节保持，没有既有文件丢失。主区仍仅原`.omo/`和`.worktreeinclude`未跟踪，本轮未向主区写入或进行Git发布。
- 主区HEAD由开工3734eb2并行前进到`24aed52f7c2bd7b57499eb02b24f57a0f5b23f9c`，本任务树仍3734eb2。只读查看提交清单/路由差异后确认该提交只新增Babele中文补丁独立项目维护入口及相应Ruler/手册，没有产品代码。该路由针对上游汉化更新/自有译文合并；本轮自有RollTable Embed兼容扩展的限定运行验收没有转为翻译维护。未自动merge/rebase或复制主区HTML；未来获授权整合时必须保留该路由和手册入口，不能用旧基线生成物覆盖并行成果。
- 当前候选说明已完成一次真实人工review/build/check收尾：原8项加新Guard说明，共9项逐项核入口/支持范围/限制。IFS仅纠正保护已装状态，完整仪式仍待实机；House从既有原件另核bonus/action、普通2d4+2、谨慎8+2及喂服语义存在，没有重跑药水。固定Bun1.3.14的handbook:build与handbook:check均PASS36项，原watch和目录覆盖保留，根HTML由生成器产出。该结果是当前任务树的文档一致性，不是后续模块runtime或主区整合/发布通过；今后新增实际结果改变正文时再按实际输入更新。

### 当前可独立准备的工具已冻结，实际续接待UI范围答复

- Painter缺失移动/重载用例使用`painter-movement-probe/artifact-r3/probe-macro.json`，command `a877b775e761863d1845af8f148b155f02c44095b935c27e44e01a64af704e47`、JSON `55611058ee766c2aa3b89f35cabdd4a5c62b822286008e5e5430a13171eba9ee`。原4组工具边界检查通过后，独审只新增P2：Token出生成功、预测失败时旧按钮可二次出生。已在创建前保存tokens-creating，返回立即登记真实born IDs/parent/role/marker与mapping，再预测；新增1个乱序返回/预测失败/拒再生及精确归属清理反例通过，原4组/产品未重跑，复核闭合。实际movement/reload尚未执行。
- 新主工具仅供审的r4 `independent-probes/r4-mld-ui-baseline/artifact-r2/`已冻结，规范化command `07bc1b9099410718c88d5af82d375775704934535f403538e47db508907e8bda`、bundle `1623706292e9cc542ad745d4ede4f62aa813d90b1cf05532b1007f61633b64a7`。8精确UI叶与Calmini安全row/user/raw/presence捕获/比较已整合，Cal不自动恢复；TokenSync cleanup与末读增加实际client getter。仅新增整合/Cal4组及收紧缺席行后的相关2组检查，既有b1d1 User4组按完整SHA复用，没有产品/实机重测。
- r4未来续接的Setting归属P2亦已闭合：旧差异准确ID须与receipt的exceptionSettingId及_id/key/user/canonicalSHA对应；permit再按准确ID原生index仅读_id/key/user，必须当前User/精确Calkey；其他User同key、错ID、缺席或漂移均拒绝，不取value。仅新增4个必要反例，原组复用，独审无剩余阻断。
- 上述r4包明确REVIEW_ONLY_NOT_ACTIVATED/executionAllowed=false，不是可Import的Macro；userQuote/activation/nativePriorRunBinding仍为空，finalBridgeBuilt=false。原Feraf r3、edba、TokenSync12及其REVIEW原值未动。须等真实用户UI范围答复，再fresh原生GET核旧run、具体Setting归属与保存证据一致后另建精准bridge；不能靠新policy重判旧5叶记录或补造旧坐标。
- 当前没有活动业务fixture；只有原主工具Feraf和原Next服务保留，owned恢复页651350506。所有实际继续入口均由同一官方Chrome执行器接续，后续只补尚缺范围。

### 原始目标检查点与独立用例接续判断

- Stop hook 提醒后，已将原始非Forge/不重测目标、已接受切片、剩余实际模块及恢复缺口绑定到私有 task-progress checkpoint；批次完成没有标成整体完成。原用户决定仍仅为血猎手新建/授予、旧角色只读，以及House历史User缺口保留；当前Cal范围题尚未答复。
- 重新核对技术依赖后，先前将全部可变用例排在Cal答复后的做法是助手的排队选择，不是用户禁令。独立Painter movement工具拥有自己的run/夹具与当前设置原值，可在不改Feraf旧run、不处置旧Cal差异、不允许任何新未知差异的条件下补缺失链。此次接续不新增UI保留豁免；新例仍须逐字段精确恢复。Rules也可独立，但当前版本缺本例Cal原像，需要实际最小适配后才执行。
- 新的Painter准备仅替换已审八叶User helper，并对旧guard的数值尺寸分支增加精确MLD三叶适配；保留旧r3/原helper/通过证据。旧TokenSync12的REVIEW、未知旧坐标和待答问题保持，不能用新基线重判。独立用例源审与新接线检查通过后，继续同一官方Chrome执行器，仅补移动/Region/linked falling/reload，不重放已过绘画/Undo/Redo/veto。

### 独立Painter实机准备、运输修复与接续门

- 实际新页为651350510。官方文档确认自建页在turn结束自动关闭，markHandoff逐turn生效、恢复后原mark清除；此前只本地准备不调用该API会使旧页随后消失。当前执行器已真实mark并会在每个需接续停点重标，不以口头保留代替；原服务PID48896/30002身份未变。
- Painter独立r4经父读和独审后实际prepare一次：Macro zkNq5g381yAHk0Lw、Scene N2Qg41PQ1F2B6TPc、Level INQ3SKOcxCWxcPw4、NPC ulbYBCxhJsVYLKUK，01-prepared.json SHA98d446065ae8a23092ee86c801331db3f1afd83e5d5321c9adc5e2e386bf8970。当前仍awaiting-one-fire-fixture，没有绘制/出生A/B/移动。Cal准确row iWZG/Fcc存在，原raw hash f70c，绑定新例当前B而非补造旧A。
- 首次暂停是本工具veto了第三方桥lastConnectionState更新。精确本机0.8.4源码与有限枚举hash证实该准确world Setting开测为error；被拒payload没有保存，不追认其值。正常Export Data一次运输未取到文件，未重试；并核Core默认exportToJSON会clearOwnership，故改为现有工具command临时只读reader+原生Socket GET完整自身source，未换浏览器/网络通道或reload。
- 03-native-own-source.json SHA40d5969c789cb0b724c380633f5cb71c5dd5b2bfb9e0f773d7224fe83bdc0fb2已父审：实际持久run==live run==01准备run，canonical5cf0970c1261acee3e45a340370b762c2cd0bc914b49a09f0763e78391ef5002；原owner/run flags与default0/Fcc3 ownership均保持。临时reader源b76d，旧live源仍4bbb。另有一次preUpdateUser拒绝，字段未知，原两条raw事件不清；post目前仅两次本例sidebar-tab审计。当前工具command暂为reader，fixture/live保存，需r5只读当前User完整比较和父审具体接续，不能以pre veto代替精确恢复通过。
- r5只准备幂等桥状态窄门和自有harness无损迁移：已冻结pure helper bridge-error-noop.js SHA37ccff455ebd6d405fa4599ecd7bbdcadca37674005b28e32ea06f42a194c821，仅准确row/key/world/Fcc/唯一原tuple和当前raw==拟写raw==原error可过。真实状态变化/其他键仍拒绝。旧原件与拒绝前缀完整保留，当前User/Cal实读和接续尚未完成。详见本轮[工具后台状态调查](../../reviews/2026-10-25-next606-probe-background-status.md)。
- Rules独立r3 command f141addadb488219fb487cc58348689ba3a34f9e7e087f96e4ffad22d1c2f204、JSONe41b07adfe1afb4fb14761a01386ea374d7c36b930e598802713753afe6f6f6d，Role独立r4 command4b541304bd5eebd696109398a14e739ff132c8184d4c1a84730e779c0f29a20e、JSONd6a4376d9f344773b3418fd63b20f316342eff1dd2b1543b198557acd9c94367，已完成新接线局部检查与只读独审，均非业务PASS。Role没有Painter的零Setting veto，无需因该工具故障扩改Role或Player Reader。Resolver独立工具按原业务段/八叶/Cal/真实源门准备，旧Feraf不改。

### Painter移动链闭合与IFS首次夹具纠正

- r5实际只读预检04 SHA99c10922b368a8511e1c28ff62cecae1a224f3a618c5902ba01393f7f17a56f6已父深核：八叶User业务/其他flags/已知布局保持，仅modifiedTime；Cal原B、Bridge原error、原夹具零Token/Region。明确激活05后原两拒绝完整保留，新拒绝为零，没有新prepare。
- Painter新缺失链已实际连续一次完成：一格FireI仅作前置；A/B各出生一次，A真实API穿Region的原生预测/实际distance10/cost15、difficulty2；A升5ft后flagA/fallingtrue；地面B走一格后flagB/fallingfalse，即使A仍5ft/B0。三moveToken完成Promise均true，HP20/Chat不变。11/12完整native Scene+Actor source SHA2d94e39fb559a9ad8616edf94165f2ac4c9e384b2ce7f45392051a1752852711保持；12 SHA829f2c8846212e157879f9c505dfb9f8053ef68c0aa968d99059a8dfc8fdd856。
- 原Scene/NPC及Fog准确清理，13 SHAab410929736e7aec985ce7bcce4b973b6efa3ce9bc24be6ad65227eaf6f13683父比全部非User快照字段与原baseline逐项相同，User已采范围通过；一次finalize精确删工具zkNq，14 SHAf5f9a900a0493cf0583d6c02850afd39e78652b0eb1d3a6d11133fdb0e780965的原生Macro缺席/全范围末读再父核通过，无删除后持久化。整体Painter非GM门仍待Role；准备尺寸键与旧Cal缺口不因此关闭，旧事务/美术未重测。
- 原主工具native只读绑定亦完成：Inspector WE3m7nsUJElPyCw8保留源edb64不变，native-prior-run-inspector/01-native-binding.json SHA9b3badbb93f181634ae8e6795d909faabed105c9bd456f047b9dc79a75674de7。父核实际run94e2/main28与准确Cal row_id/key/user Fcc稳定，原REVIEW不变；不读value/不写continuation。自身UI反事实因Painter尺寸键残留仍独立REVIEW，不阻断该原生绑定，也不是用户UI答复。
- IFS有CC已开始真实r4：Macro9IHrsHX8s6YwrmuK，01只读selector源/目标门通过；02 SHA51aaa99180cff27c34aa79ce9017365a5402ab823907ab94046a17a47664f8d1停Unknown legacy injury schema，deadActor RfavfnFdW2QNTDKw/contributor Y3BuFo6yZfzakVqK已保留，run82a91650-8d20-4c55-a137-8049146be109仍baseline/blocked[]，无schema999/Wizard/骰/消息。
- 已从精确source定位夹具错误：prepareIfs手造旧injury只有oldMarker/stacks/nested且IFS根没有schemaVersion；CC injury.ts88要求旧IFS根schemaVersion1并经parseState核完整episode/HP/suppression/transaction字段，故其正常拒绝不是6.0.6产品回归。只准备修正本轮现有新Actor输入并用正式beginDeathEpisode接续，不重建角色或改产品保护；失败原件保持，尚不能把它追认零写负例PASS。
- IFS无CC组合另有实际前置：Core ModuleManagement会整写checkbox对象、移除不存在moduleId；active清单相同不足以证明原raw恢复。WMP实装requires CC+TE，IFS无CC正常UI须处理WMP依赖，不能照旧guide只关CC。正在准备精确core.moduleConfiguration原raw/行归属收据入口，尚未切任何开关。

### IFS有CC闭合及全局配置/Context补证

- 同Actor/run的输入修复04 SHA4b423687e50c89daa2fb883eb6a9f037db55f46e8c4c2e5b277cb91974d78d3d已父核公开begin首次true、原baseline/ownership及contributor完整source保持，合法legacyHash9f1d，原02失败不改PASS；normal R5源5c2438保留其他业务。
- IFS有CC实际future999零Actor写/hash保持；原生prc贡献2对DC15，GM裁定失败；真实最终blind结果success，DC11/0成功1失败，history1/blind1/audit1/pendingnull/旧injury保持，raw final face/total未导出。旧卡Wggs实际结算按钮一次后history1/0新消息；未采toast不声称通知通过。业务reload后stateHash41fe保持、下一episode/旧history保持。09 SHA bf31c98d836da4ffe9c6dcc4e263da313148bc5ceadab79d4bc298d2eb7aeba8；12 SHA0788861846a09d5ff43fd2a0c2fa6bd96e7baaa399bd51fd2b48c42c46b580d3；13 SHA506963b398e4cd099f7428a2364a456ffaba52cd95496af56d0ba3234f4ffdbe。
- 14-cleanup SHA2b38a891ed2539ba51ec08c1e7a8514742b60bd47ab7f8a130546026fb235950父核原文档/设置/模块hash和User8/其他flags通过，只有modifiedTime，CalB未变，三Actor已清。实际tracked chatIds6、未另采实际delete数，不按简报5条推断；原完整Chat集合hash恢复已证。证据已确认，Rules9IH保留，无CC仍待。
- Rules snapshot虽采time/paused/activeScene，cleanCase未比较/导出after这些字段，不能拿14暗示Context恢复。复用NoCC必需Core收据只读补采，不重测IFS：首次r3因build漏binding.userId拒绝，88a原件originalnull/captureIssuedfalse，源码证实没到唯一setFlag。r4固定真实绑定/空态前检且门未放宽，同Macro普通reload后首次capture成功。
- Core helper XhO0kFwCPrRml2U1源fe48，02-original-and-context-r4 SHA98bbdc82ec34d0a030eab3eea881ab4e2898fcaaf7ade3f1dc38a4f30eaf440a已父核：world rowQrz1rbARmAKNYYgo/原rawSHA71c567043ca7ebdc9d528c2c859f650bd970004e117de2ee837333b18adced29与IFS原tuple同，113模块/101active清单同。当前time21085409/pausedtrue/activeScene同IFS原像；view/Level/control/targets/pan/Fog逐项同Painter14已恢复原像，补证闭合Context缺口。没有改时间/场景/模块开关，原helper收据与source保持。
- Species character原生longRest四false的6.0.6签名已精核，系统时间/chat/Bastion分支关闭；外部Hook仍须实际后读Context。Resolver独立9a899f/JSON27efd9已审，Role r4亦准备，其他实际仍继续。

### Species 同角色接续与 HP 配置停点

- 当前仍为同一 Species run `85598167-f646-4ece-a2f0-682a87b9acd3`、Actor `3FBXNaqyDvl53zG0`、Rules Macro `9IHrsHX8s6YwrmuK`。R7-r2 command `bd33d5c7b6213ce61b582311edf42e900474bbe0f649e7b1262a8c7f6c9724e0` 的实际基础读回06 SHA `9d62c03528ebab9d779871d8f6922daec2a319c11938d7c47f985ce10ef057b1` 通过来源证明、Large、四项授予和公式读取；没有重建或重新授予。原生角色卡图已显示 AC8、速度40、黑暗视觉60。
- 原生 HPConfig 显示 Maximum Override20；一次清空、离焦与关闭后，08 SHA `f5853e1ec65fdc1121f1f866711b80e5fa5d6810d72014da116e2b23db7b2571` 仍读到 source.hp.max20。同期有一条 `preUpdateUser` 拒绝，准确 User Fcc、路径 `flags.dnd5e`，但旧记录没有保存 payload 或 recursive 选项，不能判为无害同值写，也不能断定是编辑模式偏好。已停止职业、等级和 HP 重试，原 Actor/run/拒绝记录保留。
- 精确6.0.6 `primary-sheet-mixin.changeMode` 调用 Actor 表单 submit；`base-actor-sheet.#saveSheetSize` 才会调用 User 的 dnd5e.sheetPrefs。HPConfig 继承 submitOnChange，且按 maxDelta 计算当前 HP。下一步只修诊断/工具与原生表单提交层；保留旧拒绝并先取得实际写入形状及当前逐字段原像，不用假设放宽账号门，也不直接写15/55。此停点不改变 IFS WithCC 或其他已接受切片。

### HP 原生提交定位与同角色恢复前检

- R8 临时 command-only 诊断默认只读，Macro owner/run/ownership 保持；10 SHA `8a60cf77cc2e6ca44ad902040ebbf2f2885ae06aa441ecb27fd9596d065a21be` 父核：当前 User 业务字段、非敏感受保护 flags 与 CalB 都同本例原像；唯一 last-actor 从原 Actor.CPUI1003ActorAA1 指向本测试 Actor，具有同 case/requester 的真实 posthash，可在最终精确恢复。旧08未知拒绝原文保留，不据新基线重判。
- 11 SHA `ee6409b6bf84c061b761d06adec4976c9e55e2140b6f440643867dd9f82b63d7` 实际确认原生 HPConfig 可编辑、submitOnChange=true，但 fill空+Tab只有 isTrusted=false 的 input 和可信 Tab，没有 change/Actor prepost，故服务器仍20。此证据把失败限定为该自动填空路径没有提交，不是 HP 计算或 Species 产品失败。
- 关闭这份未提交 HP 表单、重新打开原生值20后，唯一真实 Ctrl+A/Backspace/Tab 在12 SHA `b2cd3b825aa882d2f87f637f1155a3ad4161f9648e095ddfb22efc515266d68f` 捕获可信 input/change，随后真实 Actor pre/post 和服务器完整源确认 max20/value20→maxnull/value0、prepared0/0。无职业时该值是原生计算结果，没有手写15/55；同Actor上的 CC/IFS episode 监听副作用保留，不能为了测试输入纯净而删除。12以后不重跑这一步或物种授予。
- 诊断未来请求实际捕到普通 `flags.dnd5e={}`、recursive=true/diff=true、无 noHook，均继续 veto；另有已知MLD叶请求，不能把所有未来记录一概说为空写。新事实允许为正常工具评估一个准确 Fcc、已存在 namespace、普通递归空对象的窄 no-op 门；不推广其他 User 写，也不追认旧08 payload。职业、等级、使用次数、长休/Context和重载仍待接续。

### R9 正常工具恢复与继续职业验收

- 13 SHA `1b683187cd743a5dab5b5d65d8d7618a71ffd85bfd7619ba2250e01d3f64e88f` 已停止临时监听，33条事件完整保存；旧正常工具也已release，此间明确是业务暂停，不能声称还有guard保护。R9-r3 normal source `eb8d0c3931088777d65f3d145397b28b9a61ab49164a32b6f579ef86160d2006` 只从13完整Macro换command/owner SHA，原run/ownership保持；旧未知raw前缀保留，未来新增deny仍阻止。
- 小纯门 `dc16d36cfe0ca6b4da4bf98c08fc29e295fd7344dfba7a522e167be291541334` 已独审：准确Fcc、当前requester、baseline/live既有namespace、普通递归空对象、explicit recursive/diff true，noHook缺席或严格false；operator/getter/额外字段拒。R9另在诊断捕获失败时保留record并新增deny。r2旧“captureError仍允许”测试预期已被r3实际hook故障反例替代，不把旧预期当最终通过证据；其他已审逻辑复用。
- 同Macro正常Import/普通reload后的14 SHA `b4ea89e144417ea6145e81f1fb4211cfc7d41ab11df1274910f6b5833fff66ea` 正确停在已知sidebar偏好缺归属：本例基线Chat，当前Macros，其他受保护字段/Cal及Actor完整源不变。只正常切Macros→Chat恢复已采原叶、等debounce再reload，没有新豁免或猜写。15 SHA `847d56bbf7305b198f20281870b259ce282cbc1b8cd776ab5a01a57c812fd8ea` 恢复成功；父比13/14/15 freshActor完整源逐字相等，SHA `199cfb8c3706bc0bd375dce6f4538a12eed4a268fbd520c43e7bf6d2e6618597`，User仅有可归属last-actor差异，CalB同，旧raw拒绝仍唯一原条目。
- 后续仅接原生野蛮人1/5级、脱困消耗、长休与Context、普通重载；不重prepare、物种授予或HP清除。R9顶层recoveryReadback是上述历史前检，不是升级后的当前Actor；阶段验收以最新实际species diagnostic/native readback和UI为准，不宣称工具未采集的升级后完整Actor字节一致。

### 用户本轮 UI 保留选择已收到

- 待答问题现已收到用户原话：**“本轮纯界面偏好可保留当前值，记录缺口并继续（侧栏、窗口尺寸、日历位置）”**。该题的原文同时说明“后续仍会先采原值并尽量恢复，不涉及角色数据或功能设置”。原题、答复和任务内应用分开保存在 `task-progress/user-ui-decision-20261025.json`，不是永久偏好或其他模块业务数据豁免。
- 据此保留准确 Calendaria row `iWZGzzQw5Nh2n1nR` / Fcc 的当前B坐标，raw SHA f70c；旧A只有2a8a指纹、原坐标未知的缺口保留，不猜写、不将原TokenSync12的REVIEW改成恢复PASS。后续已采到的UI原值继续尽量恢复；本轮确实不能还原的纯UI差异可按该选择记录保留。角色数据、功能设置、权限和Hotbar的既有核对边界不变。
- Species 16–23实际业务已由父审：1级15/40，5级55/50/AC8/lg/dark60、正式5级物种授予及FastMovement来源；两次使用到0、第三拒绝且聊天/效果/grants同，长休恢复2、全Context不变、普通重载语义保持。`parent-business-acceptance.json` SHA `abb7aaee23e382bd303325784042b97f43fe89d0419f8a609c5888a10670bbab`，已看原生卡与拒绝图；仅待本例清理读回，不将批次通过视为整体目标完成。

### Species 清理闭合、索引同值门与下一用例

- 24清理实际在删除前门遇到Resolver `indexMetadata` 请求并停。25–27原生读回确认当时Actor与两chat仍在，其余11集合/设置/模块同原；准确NAT当前raw同baseline。一次公开Rebuild的新请求实际拟写/当前/原值逐字相同，SHA db912；仍veto、无post，另核API可变更/无诊断、1919候选。旧24 payload仍未知，不根据新请求追认。27完整原件 SHA `ae9bb0deb7992d5ae2eddd2ad4423a73092918765e4a28537c518d789d3af318`。
- R12只给工具接准确row/key/world/Fcc/当前case且已fresh native capture验证的同raw门，任何真实/序列化变化、其他对象或capture失败仍拒。new case在Actor前等待原生metadata与健康API一致；已有run重载先以原tuple新取闭包receipt，不依赖API发布而自锁，健康另报告。Bootstrap29父独立核仅批准6个own-run附加字段及source身份更新，Actor、R9旧proof/33events、R11两events与其他flags/ownership保持；30 fresh正常前检成立，旧2日志不清。只重试尚未完成的cleanup，没有重跑16–23。
- 31 SHA `a0a06e97c972f44e2aa0b2b04194acd5cabb8f5134139ddc66eada619a639c36` 实际phaseclean。父将documents/settings/modules SHA逐一与原baseline比对相同，User业务/其他flags/8已知UI均恢复，last-actor回原CPUI，仅modifiedTime审计变化；Cal本例原B未动。`parent-final-acceptance.json` SHA `afca9fe1eee5ee50f1d6b60167f4c154963c70016250fdacf05c1a3731db3b2e`，Species本轮代表链闭合。32 SHA `db53716b66db540d489cb65bd8d5d37aed6cb3e5b0914fb75d4990857d4f59e4` 仅确认ack并显式release，固定按钮文案STOPPED_WITHOUT_CLEANUP不表示又清理或撤销已clean状态。
- 下一步R13仅合已审BH精确只读capture与已审R12 metadata门，当前尚未开始BH。必须先保存fresh完整native闭合run再准确unset该自有键/切源，保留全部原件；不将32 public摘要当native hash。R13受控rollover尚待实际前检，旧Actor/角色功能已通过不重测，Rules Macro继续复用，最终所有取证工具清理单列。

### BH 新角色已完成原生流程，关联读取层接续

- R13切换已实际完成：33完整native闭合Species run SHA `d621b5126c80af0252d7ac7cc3917ed384fc9d0dfdc913204390ceb28953386c` 已保存父审，准确Actor/两chat缺席。34只移除自己的已完结run键并更新command/owner SHA，其他flags/ownership/createdTime保持；35保存post native后才移除已停自有registry，同页新normal `24cd1d4b6ab857951d6ad7567fd85f430cff9bfbf47cd9aff082d111b16f976f` 以run=null启动，未reload或覆盖旧证据。
- BH新run `4326fdfc-12d8-42ec-a7ce-520a5285aa37` 的四Actor是突变 `OxE3MEVwkn7L5J6T`、弑灵 `VxafkRhZC0zU4IdN`、化狼 `RHBLlaWeLvanCj5s`、渎魂 `aSTejPz69L6mKIdG`。四个实际原生向导及代表卡已完成，class3/HP22、Con/Dex10；所有卡均原生CharacterActorSheet。化狼Complete后追加的原生scale尾步继续在同一Manager完成，早期0级卡另留pending证据，不算PASS，也未重授予。
- 首次聚合06 SHA `9428ef3a08f4c9b5c6ee08edd4b65c9d0b1306de38afc8dac6ebf3d4efba8559` 四角色均因Subclass关系断言拒绝，blocked为空；class与精确四subclass的真实stamp/稳定source hash已匹配，但不能把卡面直接记为完整来源接受。四角色、run及全部授予保持，未reload/cleanup/重建。
- 父查精确6.0.6发现读取器把prepared `SubclassValueData.document` 当字符串ID比较。该字段是LocalDocumentField：默认idOnly=false、运行时解析当前Actor的Item对象、toObject才回ID；Subclass.apply写入raw ID/原UUID，reverse也把prepared值当Item调用.id。需仅修读取层，同时核prepared对象归属/身份和两份raw ID/UUID，先保存实际关系再断言，不删关系检查或补source。R14准备中，其他授予/Scale/元数据门不因此重跑；完整BH验收仍待。

### BH 四支原生授予与重载读回已接受，清理接续

- R14实际保存了四Actor的prepared LocalDocumentField关系：均为当前Actor集合中的同一个原生BaseItem实例，当前实装构造器为MidiItem；raw advancement/value仍为准确Item ID与原compendium UUID。原06失败保留，07只读前检与08 source-only迁移证明四Actor完整源不变，未重授予。R14随后10停在焦虑血咒的logicalHash，属于下一层预期来源差异。
- 已定位构建边界：canonical-package保留投影前源，build.ts的writeLevelDbPack先调用projectRuntimeDocuments，再投影v14 Effect并刷新logicalHash；已发布pack与migration-contract使用投影后值。R15以固定Bun1.3.14仅调用纯投影/哈希导出，不构建、不打开或修改LevelDB、不安装产品；82份运行文档及模块/版本/目标/ID/UUID链与contract逐项一致，canonical序列化SHA `ceef1e3aeb68721bec6765f9f17a0cb0e2987d03f9556d4160e87697dcaa2394`。只修读取器的预期层，canonical、pack与Actor均未改。
- R15 normal source `d26a6ef7fd996da76ad76486491461d8ce5c2cea86d7e127916b8d0d5ec881d3` 保留真实首次producer `24cd1d4b…976f`、旧run/flags/ownership及全部授予。14完整聚合 SHA `8b8540e61600fcb4842caa985870dbe6a05ea0b9b841e11bb196e0e33b9e0b59` 为PASS_BOUNDED_NEW_ACTORS、blocked为空。四支class3/HP22、Con/Dex10，突变14 Items/12 links与4配方；弑灵11/9；化狼10/8及原生number scale1；渎魂10/8及四scale 1/2/1/2。41条模块来源观察的marker/advancement合同差异均为零，另4条实际官方Archery来源单列，不套模块marker预期。父已查看四张实际原生角色卡。
- 渎魂来源明确为Intelligence/GM辅助配置，progression=none、ability为空；本次只接受授予图与表值，没有宣称自动创建契术位或法术。没有运行特性、旧角色更新、Copy/Apply或备份。原06/10拒绝不改判为PASS。
- 为补缺失持久性只普通重载一次并重新加入原世界。15保留官方Chrome DOM运输超时；16读取当前官方组件文档，17同owned Tab screenshot与AX各一次成功；fresh AX关闭欢迎框后唯一小DOM探针恢复，没有再次reload/Join或新tab。18源门核cor-cotn/Core14.368/dnd5e6.0.6/Fcc activeGM与原run/四IDs。19完整聚合 SHA `56871dd407676e84d5eade3f0f40958bfe5c34069c7fe713b1f6c46bece0c5ab` 父独立深比最新完整report与14完全相同，blocked为空、unreviewed0、Resolver可变更且诊断为空。新角色/职业授予与重载代表链已接受，仅待四fixture准确清理与全局原像末读；整体非Forge目标仍未完成。

- 随后20清理 SHA `92aa75853523ca82d4e40619e657bc0878d6129bbab32445c9c5616204a7d834` phaseclean；父核documents同01原baseline、Setting/modules同原、User业务/其他flags/8已知UI通过，仅modifiedTime审计，CalB无变化。21只用原Core helper比较，SHA `99f6798e7b0aa90e1a08c90a99ac4fbdc7eb0273cfd0eb9b9ece2df6fb17748f` 的row/raw/113modules及完整Context/Fog全equal、contextDifferences为空。BH本轮限定结果闭合；Rules取证Macro仍保留供NoCC，最终工具清理单列。新case无需重复BH。

### NoCC 全局组合已建立，代表链接续

- BH22仅ack/release，clean run及全部原件保留。其后无活动业务case时迁移同一Core helper XhO：01 native前检核临时reader source3115、旧owner fe48、不可变receipt canonical6c366与原02逐项相同；02仅一次更新command/owner.source为1c5f。父独立比完整native source，除两批准字段及正常审计外全部相同，原flags/ownership/createdTime保持。普通reload清旧registry后03原生身份/immutable receipt通过，03b原row/raw/modules/Context全等；没有删旧registry或重采原像。
- 原生Module Management停WMP时提示可选停用CC/TE，未保存时先停并读回；正常取消可选项保留TE，再单独关CC并取消TE可选停用。04a保存前113checkbox仅WMP/CC为false。04b普通重载后原生SHA `cf103e020ccb7e41371af40a0d055f6ed458a25984b1e671607f0599f0b838eb`，父独立比完整113 id/version不变、101→99active，仅CC0.2/WMP0.1两项false，IFS/TE保持true，原Setting row/完整Context相同。此为NoCC前置通过，不是IFS业务通过。
- 接续仅一次ifs-without-cc新例：新baseline先等待Resolver实际metadata/API稳定并fresh捕获；合法legacy输入、direct IFS future-schema保护、原生贡献/真实blind单次结算、同旧卡重放/普通重载/下一episode。NoCC清理和Rules最终删除必须仍在这两项关闭时完成，之后才恢复原模块组合/必要原raw及Context；Core helper在NoCC baseline中保持source/flags不变。已过WithCC/Species/BH不重跑。

- NoCC实际run698d6523的合法输入/正式贡献prc12对DC15由GM判失败，真实最终blind仅一次，安全history为success/DC11/0成功1失败，history/blind/audit各1、pending空、legacy injury保持。future999 direct IFS零Actor写且hash保持；同旧卡真实点击一次后新消息0/stateHash8e5ebe9a保持，普通reload的完整安全resolution与06深比exact，下一episode保留history。10 SHA `d5e9af700f29bfe6c74e4a16d5336956468c020de271b8ed14aa16ff0c6e4a56`，11 SHA `b93e80c2d84e9b6f1724f6d995770cdd0a0411f1bd7c65964c371e92d863c671`；父已看贡献真实卡和重载图。最终face/total未导出，未采toast不声称文字提示，tracked6chat不当实际删除数。
- 12准确清理 SHA `81e482666f6b126f0911235bccd3ea25cfa6059e77729f3a9c5b1e114ee280b8` 同NoCC原baseline的documents/settings/modules，User业务/其他flags/8叶接受、CalB同，只有modifiedTime审计；13Context/Fog同原。14ack后仍在99启用组合最终删Rules9IH，15 SHA `a774e4b5df65f72f637ca97c795d2ba09c27f265fd05e28968b0e054ed49dacc` terminal-complete/ownMacroRemovedtrue/blocked空，父比native末读三SHA与12exact、User/Cal通过。IFS无CC代表链与其清理闭合；原101组合恢复仍是下一独立出口，尚未宣称全局恢复完成。
- 终态完整state.run下载只点现有导出一次，官方download事件15秒超时；精确预期Windows下载文件亦不存在。16保留运输失败，完整run归档未取得；01–15必要安全行为、baseline签名及删除后native恢复证据保持。父将该缺口认定为额外归档运输层，不以导出失败抹去已验证行为，也不声称文件存在；不为此重建工具或重跑业务。

- 原组合正常UI恢复后05仅6个原缺席inactive键显式false及序列化差额，原所有key/value相同、113/101与Context/Fog全等。06仅一次准确Qrz.value回原raw71c567；07 SHA `67a41a3ec203d1b5e7579bed2f9e3c1c58ea811f17a064afe4b4f6a6bca493a1` 真自然reload后，父深比原/当前Setting与完整模块rows、capture/currentContext完全相同，原receipt6c366/source1c5保持，进度verified-after-natural-reload。NoCC全局配置恢复出口闭合，Core仍保留待后续业务结束自删。
- Resolver仅新生Macro `GFVm9pz58fsMFQyg`/source4429ffcb/run488ce4dd，01源门与02唯一prepare已通过；唯一NPC `s2Jz2kyFNyMccElL` 是NPCActorSheet/Tidyfalse，卡面有十项名称，尚未正式hydration witness。02新baseline1571条Setting与NoCC前1665条不同，父实际取11-R15 native原run baseline按本工具更宽secretKey过滤后逐项exact；94差额均为token名称段被排除，不当服务器删除或94值已核。Core及indexMetadata均在可比较1571中保持，fresh metadata/API健康。此为跨用例可比范围证明，不是全库字节相等；未放宽过滤、重建NPC或重prepare。

### Resolver 代表链及清理闭合；Role 只读工具修复

- Resolver04十refs/十ownedSpell/十managedCast均精确关联，父逐项核cachedFor/relativeUUID/selectedUuid/compendiumSource/manifest，已看原生报告。唯一真实迷踪步949dd在当前实际“Midi Use”正常消费窗口勾选消耗，0→1，消息U4精确关联缓存Quw及其原生活动，无骰；不宣称纯Core无Midi或真实传送落点。最初隐藏行点击只折叠、未产生卡/消费，正常命中后才首次有效使用，不当重复Cast。
- 只一次正常Undo，无额外确认窗就不追加点。07卡面授予入口已撤，08 SHA `6c591f2fa130a61d8980647e9ae5eb027a20e90f280520e274e617878d01c8f7` 普通reload后pending/0Spell/0managedCast、undoSnapshot实际字段缺席、portablemanifest与04完全相同，timeOrigin确变、metadataHealthy/blocked空。09准确清理通过，10 SHA `2f4efe59ade0a5ac433b1d513b5c7f058829b14479af7477644f67005864b27c` native/client GFVm缺席、终态无后写；父独立比原/末11集合fingerprint arrays与1571可比Setting tuples完全相同，User业务/其他flags8叶/Cal/time/pause/Fog通过，仅审计变化。parent-final-acceptance保存；Resolver本轮代表链闭合，不重跑。
- 原Role新工具4CK仅readonly preflight报TypeError object is not iterable、phase=null，未setup、无测试User/Actor/Scene，原件01 SHA `9dc8f19d2fb4d8f7dbf0bbbbee9d1b948e71481994c23a8318a4327285c618b2` 保留。精确Core14.368 game.mjs629使用Collection，common/utils/collection.mjs14–15默认iterator返回值；旧snapshot却按Map entry解构Module对象，属于工具读取错误。
- 新role-probes/r5-module-values只改单一模块读取表达式为显式.values()，仍完整id/version/active、原排序/哈希。真实Core Collection一组反例先复现旧TypeError再验证新完整hash；父逆差异可逐字回r4。command `080c9333ada7ccffddbff3bce78df5f7344ae52e8f6b49b1f9a8135e948bcf96`、JSON `7feee746a1ceb7952f979d6b963e4d00961a9539b6275b32c9fbc9e3081c45b1`；Reader2e6/helper/权限/policy不变，旧组及产品不重测。无活动case时新Macro+安全reload+只读preflight待实际；父审通过后正常UI删失败4CK，再唯一setup的fresh原生baseline证其缺席，未造迁移桥或重建环境。

- 新Role Macro `8PI8Ku7STCSZve9v` source080c经过安全正常reload后，实际只读preflight成功，01 SHA `35e030626b2d63b02f481b84122666b2a9de6f2eca967debd284d0d3b09a139f`。Fcc role4/原Hotbar权限、7原Users、11集合和1682 native Setting identity行已采；799明确安全值hash、883仅身份审计，allValuesCompared=false。父按原113模块rows以本工具原.sort()重算e37f54与snapshot完全相同，Deck745889/TokenSyncdb313 served身份匹配。此前hash不同只是排序协议不同，不当模块漂移。
- 实际初次按创建名执行未命中，是Import改名，按真实entry名执行后native已完成；一次调用超时从AX证实READONLY_PREFLIGHT已完成，未重发，正常OK关闭欢迎框后DOM全文取得。未因运输超时重复setup。当前父已接受preflight并安排删准确失败4CK、唯一setup后只接GM自然busy/stale缺失链，角色行为尚待实际结果。

- Role8PI唯一setup已完成，失败4CK按正常UI确认删除；02只输出fixture binding，未据此伪造完整持久baseline hash，4CK最终native缺席仍由既定terminal全Macro读回核。TempUser2qOY、两个Actor CWT3/iGih、Scene kioa、Tokens SGh/TF1均绑定本工具。GM只进行新TempHP0→1输入、原HP20保持；06 SHA `33171a72ab136ee7c3a34b303eae822b558377733d44f681ef296ed1c76921ea` 实际四input disabled/busy=true，自然最低力竭−另有DOM/图。stale D9smg只删一次，09 SHA `c83434566d24a5129961a265672fca25f554b9cbe2dbf7f3d16682cd7adc2a91` fromUuid不解析且row消失。父已核JSON与实际TempHP卡图；不推广永久NativeApiUnavailable/private execute分支。
- 第二GM页651350589已实际创建并正常加入，两端Reader 10/11均Fcc/Core14.368/dnd6.0.6/cor-cotn；12/13主页恰选两个自有Token、syncEnabledtrue、两个Actor状态仍空。执行器初始化状态回报延迟后，父中断探查返回previous running，故不以旧pending_init断言未操作；执行器明确中断的是状态面板展开/只读hit-test，Poisoned img.click未发出。恢复时Node绑定已丢，安排按官方标准首次初始化同browser1、先owned inventory核原两页及fresh状态，绝不重新创建页或重发可能已生效的业务。跨客户端结果尚待，GM通过片不重测。

### 主机重启后的同实例恢复，已过行为保留

- 机器Win32_OS实际LastBootUpTime为2026-10-25 14:54:27.5+08，晚于旧Next PID48896启动；该PID及30002监听均已消失，旧stdout最后14:18:10没有退出原因。不能把服务消失归因于TokenSync或那次状态面板操作；主机重启是已核事实，旧浏览器内存/Node绑定丢失与之相符。父依据过时pending_init状态发出了不必要的中断，调用已返回running；执行器确认未发Poisoned点击，只有展开/只读hit-test结果未知。所有已落盘通过片与部分Role fixture继续保留。
- 恢复脚本从原启动器仅更换3个输出文件名，另有LF/CRLF非行为差异；独审校验source SHA41e505、PowerShell语法/rootpath/guard无阻断。原日志/receipt不覆写；app14.368/Node24.17/data-server-next/loopback30002/startup不存在sentinel/nobackups、现存进程/端口/certs/native stale-lock/Corehash/system6.0.6门保持。不手删锁，不复制app/data、不备份、升级或碰Mirror/生产。8个已验入口实际SHA均同冻结值。
- 新进程PID16876，creation15:19:59+08，唯一127.0.0.1:30002。native/api/status返回activefalse/Core14.368，证明Setup就绪，不当已启动cor-cotn。官方Chrome旧owned清单空，user metadata无旧两ID；新唯一主owned页651350837明确mark，原生Launch cor-cotn只发一次，目前正常World/Package Data加载中。仍待Fcc/同Role8PI run及原对象实际恢复；不重setup、GMbusy/stale或任何既过业务。

### 第二客户端已接受，Role 取消请求日志的接续修复

- 主机重启后已实际正常Launch/Join原cor-cotn，主owned页651350837；15恢复User8/flags/Cal通过，15b原两Actor/Token状态空且CWT完整sourceSHA与先前HP20/TempHP1原件相同，Role8PI仍原gm-ui，未setup。随后第二GM唯一live页651350840，19主真实选两Token/空状态后HUD只一次Poisoned，20实际图父已看；21第二页、22主页Fcc/14.368/606/cor-cotn且两个不同Actor均poisoned，父已逐项核。23正常close第二页，inventory只剩主。跨客户端片接受，不因后续工具门重做。
- 24 before-player停在3条Fcc同case/requester的已取消flags.token-action-hud-core.isUnlocked请求；25原User业务/其他flags/8叶与Cal完整保护范围仍accepted，真实值未采的旧payload保持未知，不追认noop。实装TACore2.1.2 sourceSHA5f5dd9389f3592b691c7db46cae3243762c5600b606377153b5f39d5bf030670证明该字段控制个人HUD编辑/拖动/点击模式；不因此把功能性模式变化纳入用户纯窗口保留许可。
- 准备R6始终取消该写请求，原User写门/所有flags与Cal比较不变，只将精确已取消记录单列；未来仅同case/Fcc/requester/唯一HUDpath且本R6明确vetoed-not-forwarded标记才可审。旧3原文、原baseline/IDs/results及失败历史完整保留。4组新定向检查与实际迁移末读增强组通过，旧Role/helper/产品矩阵不重测。
- 实际26 source-only只读前检SHA `0407c667f2eec2a7e7daf6fc05ac63f8c563c6170db41d8bbf89386d2724d263`，8PI command临时1a0d066/owner080c，原native run/flags/ownership及live日志均采；User保护范围/Cal同原，原生HUD叶存在且false、与原namespace相符，仅证明当前原像。打开编辑器又有旧guard取消的208个MLD窗口width/height路径（含历史null键）及一条HUD路径，当前共5条原文保留、installReadyfalse。未安装R6或进入Player；下一版须在同一实际snapshot父审后仅更新自身源/完整日志证明，防反复编辑生成新同类取消请求的循环，不放行这些User写、不猜原值。
- 批末另确认两个必需证据缺口：Role其他User ID来自loaded game.users，不能称native全User index；原Inspector只读反事实也不能完成尺寸恢复。已分配独立专用Inspector finalizer准备，仅在Role已接受并finalized后复用既有WE3，尝试完整已知Task UI键反事实4eb匹配后精准恢复，否则依用户本轮选择记录保留；同时补native User _id-only及最后own tool缺席。无新Macro/世界/通用框架，不提前执行，不把准备当恢复。

- UI检查点原出口“恢复完整原安全MLDnamespace”现按已收到的原话限定解释：用户答“本轮纯界面偏好可保留当前值，记录缺口并继续（侧栏、窗口尺寸、日历位置）”，原问题同时约定后续先采原值尽量恢复且不涉及角色数据/功能设置。实际检查点条款改为“能以精确证据恢复的已采UI原值继续恢复；无法还原的本轮纯界面值按该选择保留并记录缺口；其他账号与业务数据仍保护”。此为本轮授权变化，不伪造最早原像、不将保留说成恢复；旧原严格出口与raw REVIEW历史保留在此前段落/原件。HUD编辑模式未知请求仍被取消，并未借此获得实际写许可。
- 专用末批Inspector finalizer静态准备7组通过但installation:null待绑定；独审发现DialogV2重建内容后读detached input会错误识别父审SHA。已只改为callback第三参dialog.element固定ID live读取；真实DOM outerHTML序列化→new form重建反例修前复现、修后3子例通过，原7组/产品不重跑。独审复核P2闭合。pending-r3命令2cb5e49408572907f2dea8614dd27afc16f419c1cff7511ff969697982a6b9eb仍不可安装；须真实Role-final与旧Inspector fresh证据生成live绑定，尚无任何User UI恢复或工具终结行为。

- 进度记录校验返回“A required outcome cannot be silently replaced”，因此保留检查点原outcome文字，不把上段的新适用说明冒称为系统已接受的出口替换。用户原话与实际适用说明分别保留在action/授权原件中；它不扩大功能字段写入许可，UI项仍open，先尝试机械验证的精确恢复。该校验失败没有被后续shell成功当成checkpoint通过；重提交将单独核exit/result。

- R3新增三组有限prefix/controlhash、真实live输入、已知hooks暂停/一次native更新定向验证通过，独审无阻断；原8叶写门/Reader字节保持，旧矩阵不重跑。实际27 SHA `fb74dfa2fa0c616d9cafe18451fb81a67c8b03be53cb4200a9f0147e7142cd97` 有7条原文，父Node重算control c70c1918完全相同，26→27native run/其他flags ownership/fixtures全等，前5完整保留，后2仍是同208集合/soleHUD。
- 输入该实际control后只安装一次，28 SHA `dcaae794a33f31cc5e4e10637ade94b44351f94d30081ebaa3f0a9e03ec9dd24` 原生normal41c/source-owner41c；父独立深比afterRun==expectedRun、原baseline/ids/results及7raw记录完全相同，除批准source/run日志证明和正常audit外整个native self字段相同，User accepted/fixtures同。仅旧updateUser1521/preUpdateUser1522暂停，gap openUntilNormalReload明确记录。已安排立即普通reload、新R6 known-ui读回后，只接Player，不重GM/第二客户端/Poisoned。尚未把准备或取消记录分类写成Player通过。

### Role Player 代表链通过，清理剩一条来源待核消息

- 31普通reload已关闭上述保护间隙；七条原取消记录及批准prefix保持，unreviewed=0，User/Cal同原。34为实际TempPlayer2q/isGMfalse的原生身份；35四个Deck公开入口均GM-only拒绝、writes空且Actor/Setting保持，36真实toolbar缺席。37/37b帮助遮挡尝试不作通过，37c父已看可见fallback帮助，37d确认visible/text；实装旧帮助bundle仍写606待验，不能把工作树文档更新冒称已部署帮助同步。
- 38/39证明Player的Painter公开兼容但canMutate=false、创建/激活能力不可用且原生工具栏缺席。41/42真实Observer Token尝试后无HUD、canUpdate=false，controlled只含自有Token；不扩大为TokenSync私有validateTargets全分支。44回原GM，工具内部比两Actor完整native hash同入Player前；compact结果不导出hash原值，因此父没有独立重算这组未导出值。45 User保护范围、Cal和七raw/unreviewed0均同；46证据清单SHA `1c2f5df51ba6a5de7f51fa8392631e420857f0a396b932abe33e850b93b8ab86`。这些产品行为冻结，不因后续清理重跑。
- 47唯一cleanup已删除本例TempUser、两Actor、Scene、Folder与Reader，其他User/Settings/modules/activeScene恢复门通过；原始结果仍为REVIEW_REQUIRED，唯一文档差异是新ChatMessage `AXTzGaG9uqVGBelQ`，SHA `4609be8e0b669207bb62e26c594b2cdf3c6697e4e398d86f90aaa98cc762f8cd`。47原件SHA `376ded88bfd658e9d7d38d98ab8d3926154b22ea561f0703a1dd0aca8f65e844`。没有重复cleanup、改判旧结果或先行删消息。
- 48官方DOM准确message-id缺席，不能从页面证明来源。安全服务日志记录其17:16:06创建，恰在首次Player加载；实装3ds-atlas的更新通知会创建当前User作者、只whisper给自己、speaker为Atlas标题的消息，但这只是候选解释。新增专用r7只先取准确Chat index的作者/时间/类型/收件人/说话者元数据，禁止正文和骰子；实际归属证明后才可核准确原hash并删除一次，之后补原生恢复与Role工具缺席。原47 REVIEW及所有业务证据保留，末批Inspector仍未安装。

- 49安全native日志将TempUser会话界定为09:15:53–09:19:14Z；其间09:16:06建消息。A仅准确index的离线小件33dedd冻结。50第一次Macros点击是dispatch前超时，未操作；51标准inventory/screenshot/AX/小DOM恢复并成功开Macros，第二次打开Config派发超时，52按未知保存。53只读确认Config未出现后，查当前官方LocatorClickOptions与SDK，timeoutMs同时传command/transport，15000ms参数有实际接口依据；唯一后续点击成功。旧正常41c命令完整核对，仅command换A，不换通道、runtime或权限；巨型Role结果窗正常关闭以减少页面1.2MB文本，registry/guard保留，不能因此断言该文本是已证根因。
- 54唯一A执行SHA `3aa5e1b7e070dd100e3c7e5a0739c543607bb43ca5da900da2756fc649ca52fa`：作者/唯一whisper均TempUser2q，timestamp1792919766986处原生会话窗，style0/blindfalse，speaker actor/scene/token全null，alias实际`Dice So Nice!`。Atlas条件为false并保留，不改成通过；旧候选被否证。实装dice-so-nice6.3.1 main.js SHA `3d21ae43d1e1cda37aac2904ccf74515527d863faf5a4e6b31bace212fe9fe4d` 的唯一whisper创建点为_welcomeMessage：未见欢迎flag时创建当前User私信，alias一致，之后仅设该User欢迎flag，无GM门；完整方法已读。元数据符合欢迎实现，但正文未检，不声称其完整正文身份。
- 父审55 SHA `75ede4bd6179fa5bd2fdcda186ce274678fc7231d48a70c067a11c7753a13fc5` 依据准确native临时作者和唯一临时收件人、会话时间及无Actor/Token关联，接受其为本轮测试账号私信，允许仅该消息的条件式清理。B仍须重核54元数据/47 full-row hash并只删一次；54无正文/full-row读取或文档写，原47 REVIEW保持。尚未执行删除/Role终结/末批Inspector。

- B724467实际56前检SHA `5fa2444d8e5b5971439f950773321f4f41bbe276b02e75daf3c702a314dfe415` 全部精确通过，包括metadata==54、native自身run/ownership/source及公开deleteDocuments所需cache ID存在。确认归属后完整native消息只用于两次内存SHA锁47原4609，未语义检查/导出正文、骰子或其他内容。只写一次自身独立intent，再准确正常deleteDocuments一次。57 SHA `af4aa88312f9316d5dde85bc59fc43bbbd8debc0b16b0c316049d5860e486d5d` 原生准确ID缺席，不用API返回代替完成；未删其他消息或重测业务。
- 58仅现成restoration-readback一次，SHA `d8e17be89fc5b796b67f34fb82e9083d1dc4cb102d829f46fb2ec0f9f37dc1d5`。父59 SHA `476fbcd0615a83e2a6b796839e46be5825436645455f707473d51ceeb46ca19e` 对28不可变原baseline独立深比：11类完整文档fingerprint arrays完全相同；1682条Setting去auditHash后结构完全相同，799安全值hash/883仅身份范围不变，两个row仅auditHash变；其他User public rows/原7 IDs、Fcc全部非audit tuples/ancestor/nonPositionFlags、CalB和模块/active+viewScene/control/target/time21085409/pausedtrue均相同。全Setting值、全User字节恢复仍未声称。
- 58原始REVIEW保留：旧七取消记录逐项保持，新增两条均准确R6 source41c/case/Fcc、vetoed-not-forwarded、完全相同208路径集合，未知payload不追认为noop，实际User没有变化。父单独接受数据恢复，不修改R6批准prefix或伪造clean/PASS。Role大结果窗已正常关，registry/guards保留；接续只保存末日志、停准确本例hook/observer、正常UI删8PI与native缺席，再完成旧Inspector/Main/Core的最终工具和纯UI出口，业务不重跑。

### Role 与全部工具的原生终态闭合

- C仅复用原生known-ui-readback：60的User8/Cal通过；61实际control `d6e0398d6aacb00d761fd8c0cb8ca914ec34bbeae95358c3af67cfeb4efd4b9c`由父独立重算，旧9 raw完整，仅新增同源取消的208路径记录。63末日志native保存后只停updateUser1521/preUpdateUser1522；observer原本不存在，不虚称新断开。旧run/REVIEW/prefix不改，内存terminal禁止业务。正常UI仅删8PI一次，65原生`_id`缺席/删除后持久化0；父67接受，SHA `d32633e0f50c906c15ab2df093586a259f185eb68cfbefb121ca368afe0434e3`。
- 66旧Inspector源码edb64不变，native Main命令28/run94/raw REVIEW与准确Cal行身份全匹配。旧单键反事实76fb不能恢复整个namespace，原结果保持；public/五UI/其他namespace/sensitive覆盖稳定。随后只command换经真实67/66绑定的cc48新封印，旧tag仍准确描述edb64；A原生95宏=92原宏+三工具、原7User ID-only且Temp缺席、实际immutable identity7556、CalB/public/其他flags通过，完整已知键恢复候选恰等4eb。父审02后正常UI删Main，未执行旧业务或改旧run。
- Core最后只读门发现唯一pan.scale微差：原0.7746031746031746、当前0.7753968253968254，x/y700/560与Qrz原raw71c567/113项101active/原receipt6c366/其他Context均同；04保留失败，没有绕过其门。精确Core源码表明resize重算最小scale，原生缩小只调整camera；976/原scale与977/当前scale均为1260，初始视口变化是有依据的解释，未声称捕到具体触发时刻。
- 官方viewport可选能力已查文档，第一次set/reset准确，但当前runtime没有cua.scroll，未发滚轮、不猜调用。之后正常配置控制页核实际ZoomOut=PageDown，官方ax.pressKey可用；一次临时2556×976、freeboard无Tour/输入焦点后一次真实PageDown，再必须reset默认2556×921。14完整Context/raw/modules/Fog严格回原，15 Core通过自身门自删/native缺席。两次能力／视图差异及reset证据保留，不改源码、进度或场景数据，不重跑NoCC或模块业务。

### 最后纯UI恢复：意图编码失败与一次未发调用接续

- 原B仅执行一次，16因`Foreign/prior one-attempt intent`停止，attempted=true、User调用标记false、delete标记false。17原生范围仍保护，旧REVIEW不改。只读reader-r1错误地以pre作为DialogV2.content，18保留实际div容器要求；主代理只修div包装，native读取与权限门不变，r1冻结、r2补采成功，不把未显示的值推成已观察。
- 19原生旧intent SHA `93418aebbcac7c0e85ebe311d2e746b560c70d1cc6433e0c9e183bf90d33ed36`，immutable身份仍7556；change已变成嵌套flags/monks-little-details，macro-window-size空对象，7条删除键消失。精确Core14.368 setFlag直接update，DocumentFlagsField/ObjectField递归展开dotted keys并应用删除操作；将更新指令对象存为普通flag不能保持原形。实际Core ObjectField.clean+mergeObject的两组内存反例复现完整native形状并验证JSON字符串/path-value编码保留；初次测试环境缺CONST仅修独立harness常量及兼容日志配置，未替代字段实现或写真实文档。
- 新c074接续始终固定旧flag9341和原immutable身份7556，旧flag不删不覆盖，原16的已发生尝试仍记录。独立新key只存opaque JSON字符串，native逐字相等及fresh guard通过后才发**此前未到达的首次**User.update；源代码及16/17/19共同证明旧User调用未发出，没有清一次门后重跑B。独审无阻断，原User隐私投影、92宏全源hash、7User ID-only、CalB、完整安全MLD候选与终态机制复用。
- 21/22当前原生范围复核通过；23首次User调用后完整安全MLD namespace/candidate精确4eb，7个新增Task尺寸键缺席、T1本来无键、最早已采Feraf720×600保留/sidebar macros，其他User范围/CalB/92原宏/7User保持，仅记录正常audit。父24接受后C仅删自身WE3一次；25实际终态 `C_TOOLS_ABSENT_ORIGINAL_MACROS_USERS_CAL_AND_EARLIEST_SAFE_MLD_MATCH`，SHA `e086971667285c0ed0e2db4047930595c692bdca560259ae7760c0f007cacd3d`。
- 父26独立深比最终native宏数组与92原行完全相同，9个登记Task ID均缺席，原7User ID完全相同且Temp不在；完整安全MLD4eb及已知tuple、CalB/public范围通过，删除后无持久化或User写。父接受SHA `ebc3815078a8a62f75d24a7ab3629986badbf1940d95862235a23288fddf6f60`。本轮对象和工具清理、精确已采UI出口闭合；旧House整User原像缺口、Calendar旧A与额外IFS工具归档缺口依原决定／事实保留，不声称完整pre-task User或全部Setting值恢复。最终文档/手册一致性与工作区保留检查继续，模块已过行为未重跑。

### 2026-10-25 最终交付核对

- 当前支持矩阵、模块健康记录及受影响README/manual已同步真实代表范围与终态；Deck状态编辑、Painter绘制明确为GM-only，玩家入口拒绝是已验边界，不列成待实现的正向玩家写入功能。TokenSync玩家同步、IFS更多玩家／多GM等真实未验范围保留。旧BH更新仍按用户选择只验Preview，Forge正式生成/Intake目标不扩大；实装后备帮助旧文案未重打包，不冒称已部署最新说明。
- 人工核对11个受影响条目，使用固定Bun1.3.14运行handbook build/check，完整36项来源、目录覆盖、命令、指纹与HTML一致。末次将“28项baseline”纠正为“第28号原件的baseline”后，仅4个源文档引用条目重新核对，其余7项复用；再生成/check均PASS。最终HTML SHA `635b9e1146472e7970d6665145e8f80206c886ef0617ec2c4544169efde11d96`，证据final-handbook-validation-r2 SHA `a5afa6396cddf35f675c312f3e4d959f0cbfd40cd0638c8b52b8ee10868a31c8`。交互实现未改，复用既有视觉证据，没有绕过历史file URL连接器拒绝。
- 只读运行身份核对PASS：原PID16876、唯一127.0.0.1:30002、同app14.368/data-server-next、nobackups、API active=true/world cor-cotn/system dnd5e6.0.6；9个已验模块入口的版本/文件SHA全部仍同冻结值，未因文档或工具修复重建部署它们。服务保持运行，不涉及Mirror或生产。
- 原317个dirty/untracked文件基线核对：285字节不变、32个明确owner路径为本轮更新、缺失0、范围外变化0，HEAD3734eb2及原branch保持；额外8个本轮审阅／药水规范化源与fixture保留。git diff --check通过，未reset/stash/stage/commit/merge/push/delete既有工作。上述生成页面与功能源码保留在本工作树，未发布Git。最后只更新进度检查点，不再执行模块业务或世界写入。

## 本地master整合（2026-10-25）

- 用户授权先理清改动/依赖后提交合并；在由master fac6675创建的独立topic整合，原dirty工作树与主区未跟踪基线保留，不push/部署/清理。依赖选择、独立Forge/Web排除、master Babele入口保留及实际检查见[整合记录](../../reviews/2026-10-25-next606-master-integration.md)。
- 本次必要检查针对workspace/共享帮助依赖闭包、模块构建和新手册组合，不重放已接受的Foundry玩法。WMP/Deck过时说明与模块AGENTS按原始限定证据更新，未新增用户权限约束或推广全功能606支持。
- 新检查理由：CI coverage默认会运行旧Monitor真实Chrome重启，违背本轮不重复浏览器接受的边界。仅隔离完整精确测试名并在coverage manifest声明NOT_EXECUTED；补保留同文件普通测试的反例，阈值/库存文件/CLI与build gate不缩减。
