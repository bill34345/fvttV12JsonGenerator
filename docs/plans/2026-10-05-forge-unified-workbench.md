# Forge GM 与生物蓝图统一工作台

## 当前状态与范围

2026-10-05：用户确认统一方案并要求开始。唯一候选为 `codex/20261005-151259-forge-unified-workbench`，起点 `e917e897c685f9da317986c5671a837b3d314a6c`；root 是耦合 Forge 子系统的唯一 writer。当前阶段：本轮本地交付已完成；0.5.0的Mirror实机/视觉、精确清理、手册实页及最终CI通过，最新主线已保留并快进集成到本地master，合并后手册核对通过。两棵旧树只读保留，不提交、清理或改写其内容；未push或部署生产。

目标是一个 `fvtt-json-forge` 工作台：Actor/Item 目录入口、独立共享连接设置、手工蓝图/标准来源/AI 整理、输入→审核→完成、草稿重开和派生。保留用户已选的蓝图库/编辑/独立预览布局及 2024 资料块呈现。当前授权覆盖实施、相关验证和已有边界内的本地提交/集成；不 push、不操作生产或 ServerNext，不修改 Painter。

## 来源与已有事实

- GM 来源：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20260913-021943-forge-encounter-import`，HEAD `b0396c3`，29 个 dirty 路径；三阶段 Intake、Actor/Item 目录入口、会话连接与独立设置、创建完成入口和回归。
- Blueprint 来源：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20260922-135223-creature-authoring-research`，HEAD `e2739f0`，35 个 dirty 路径；严格蓝图、中文 YAML、父 hash 与字段差异、世界/用户草稿隔离、编辑器与资料块、structured target 语义修复。
- 当前 master 已包含 Painter 交付的精确 14.368/5.3.3 兼容修改、响应目标绑定、批量及战斗包后继修复。逐 hunk 移植旧树有效增量，不用旧整文件覆盖这些变化。
- 交接初始Mirror安装0.4.0来自蓝图来源加受限兼容构建；其脚本SHA-256为`12a8fe3f79ac3494ace3b2ed84bde21c547ae7d26eaff30362b122f6ae9963e2`。本次经统一源码、完整构建及精确安装后验收0.5.0，当前归档身份见下方最终接受记录。
- 旧 GM 第二轮离线通过、新版 UI 未执行；蓝图 9/23 有限实机接受不覆盖 9/24 布局和最终焦点修正。历史记录用于选择复用范围，不提升为本次新组合 PASS。

## 确定的产品流程

1. Actor 目录进入 Forge 生物；Item 目录进入 Forge 物品。重复打开聚焦同一工作台，旧公开 API 保持可用。
2. 生物可选手工蓝图、标准资料、AI 整理；物品保留标准资料与 AI 整理。模式拥有各自草稿，不自动把复杂来源转换成有损蓝图。蓝图生成的规范来源可以查看/导出；父子变体使用不同身份。
3. 蓝图维持左侧库、中部编辑、右侧独立预览；窄窗口重排区域，预览仍可见。编辑 tab 不隐藏预览。草稿预览标明未验证，正式预览来自实际生成 artifact。
4. AI 连接配置是独立共享窗口。Key 默认只在页面会话中共享，持久化须用户主动选择；连接身份变化使旧审核失效。
5. 输入→生成/验证或分析/审核→确认创建→打开卡片/继续制作。返回编辑不自行写世界，内容变化立即撤销旧候选资格；草稿和历史审核不恢复 accepted response。
6. 战斗包保留专用入口和完整审阅；导入、绑定与明确启动分开。Actor、Item、战斗包继续走各自类型适配器及创建/回读保护。

本轮不新增自动 CR 平衡、完整法术/传奇/巢穴编辑、已有 Actor 覆盖或 dnd5e 6.x。最终 JSON 始终走来源→workflow→parser/generation→verifier；不手写产物。

## 实施顺序

- [x] 核对 Painter 已进入 master，建立唯一候选。
- [x] 锁定来源清单、冲突处置和统一应用入口。
- [x] 移植蓝图/目标映射与 GM 流程，接入一个工作台及共享连接。
- [x] 运行受影响局部检查，审查并修复真实问题。
- [x] 构建完整统一候选并完成 Mirror 实机/视觉验收。
- [x] 同步手册、必要集成门禁、本地提交与集成。

## 验证选择与理由

这是首次组合三份来源。局部检查选择：蓝图/目标映射来源回归、完整 Forge suite、相关类型、构建及归档；理由是这些路径实际发生合并，旧单侧 PASS 不证明组合。生成变化复用六类 target fixtures、守卫与派生精英正式 CLI/来源 verifier，并进行局部 anti-overfit。版本契约复用锁定 dnd5e 5.3.3 的本地源码/已记录证据，不扩大支持。

实机补测选择：目录/单窗口模式/连接入口、输入焦点与宽窄布局、草稿保存刷新重开、同源复用、派生独立身份、stale 零写入、Actor/Item 创建读回，以及受影响战斗包入口/绑定代表链。具体执行前绑定候选、安装 hash、现存服务 owner 和原始证据；没有凭据授权的真实 AI 请求保持未执行，不伪造通过。旧 Painter、其他模块和无关长时矩阵复用既有证据。

到最终集成边界执行 required CI、agents 与 handbook 门禁；通过结果仅在相关修改/失败/明确影响出现时重复。报告、导出或清理故障只补对应证据，不重放独立有效行为。最终接受之前不把候选写成已完成。

## 执行记录

- 读取当前根/模块/packages/generation 规则与 feedback loop。forge-browser-runtime 和 models 没有单独 AGENTS，适用 packages 规则。
- 已复用前轮完整原聊天与来源核对。并行只读探索分别检查 UI 合并接缝和共享模型/验收入口；不向旧树写入。
- 本次布局是延续已由用户确认的现有工作台，不重新选择品牌风格或创建概念图；设计依据为旧源码与已有截图，视觉接受待最终候选。

- 已逐 hunk 移植两树有效实现：GM Intake 与 master 的四处 Core 校验冲突按语义合成；Actor 文件读取/完成入口与蓝图状态合成；CSS 保留蓝图区域并接入统一窗口。原树 29/35 路径 hash 清单在任务 `.local/forge-unified/source-inventory.json`。
- 0.5.0 为本次统一候选，保留 master 精确 Core 门禁。Bun 1.3.14 frozen 基线安装通过；模块 typecheck 通过；移植后 Forge 原有及蓝图回归首次为 299 pass / 0 fail / 2710 assertions。记录 `.local/forge-unified/forge-tests-r1.log`。
- 下一检查缺口：新 host 的模板挂载、跨 pane 取消/失效、提交锁、重绘与草稿保留尚无组合测试，因此增加模块拥有的真实 HBS/JSDOM 集成回归。使用已在 lock 中的 Handlebars 4.7.9 显式 dev 依赖，不新增模板框架。

- 独立审查发现文件加载未同步草稿、异步完成更新旧DOM两项P2，均已修复并复核闭合。新host 9测试/48断言通过，包括读取/生成/创建回读期间重绘；原有类型专用门禁与 encounter lifecycle 保留。模块类型和 packages 类型检查通过。
- 目标映射45测试/136断言通过。两份新来源经正式CLI生成并verify:actor，均无warnings/sourceIntegrityErrors；人工核对守卫AC15/HP24、精英HP48、速度30、六属性16/12/14/10/12/10、长矛基础d6+STR3/熟练命中5、单生物目标/5尺，以及敏捷DC13、30尺、2d6火焰/成功半伤。派生使用不同sourceId，parent绑定一致。原生运行总值仍待实机读回。
- 局部anti-overfit通过（4 sources）。机械设计检测发现移植CSS的4处侧边粗线及编辑tab指示：侧边线收窄，保留有状态含义的tab下划线；这不是视觉验收。

- CI r1：3638 pass / 1 skip / 3 fail；三个失败为根级旧Intake UI契约仍要求密钥在主面板及旧三步/滚动。按已批准独立连接/单窗布局更新对应契约，先跑该文件，不重跑已通过生成/其他业务。
- Mirror预检发现30001无监听、旧39008已退出。手工PowerShell后台启动被自动策略检查拒绝，用户明确要求代理继续自行启动。采用项目已有受控Lab launcher；源码核实它缺少运行时--noBackups（Core保存配置时会移除此项），因此补足该安全参数和两profile断言，先跑安全包装Lab测试再调用现有launch入口。无新Lab、无备份、无Next/生产操作。
- Chrome执行聊天01a10b1b-3a61-7843-a584-8391d8bca8a3已获用户明确新建/复用/回传授权；当前只做无世界写入的能力预检，等待真实回调，不轮询。

- 用户确认电脑重启并要求继续。候选58路径及历史日志保留；master前进到c1b87ee，新增的是验证选择/指令工具，最终集成时保留19路径增量，不以此重放旧业务。重启前受控launcher确曾启动67112；当前无存活Mirror进程/监听，检查到精确Config/options.json.lock为空普通目录，确认绝对路径及无进程后正常移除空锁并接续同一受控launch。
- Chrome重启预检FU05-PREFLIGHT-02已由父实际收到并接受：6.1Sol/medium/FullAccess匹配，当前官方Chrome自有空白tab最小往返成功并清理，未触碰Foundry。此前host离线导致的callback失败保留，不算业务失败。
- CI发现的3条根级旧UI契约已按共享连接/输入审核完成/分区滚动更新；将该文件加入既有Forge聚焦入口，避免只有全仓CI才发现入口漂移。本轮先局部复验3条，不重复3638项已通过检查。

- 恢复后受控launch启动15312，精确无用户的Mirror目标核对通过。为使完整0.5.0 manifest/JS一致加载，仅维护本任务刚创建的15312，按9文件白名单安装并逐字节回读，再恢复为35468；API active/14.368/5.3.3/cor-cotn/users0、noBackups参数与目标路径均核对。无其他服务、备份或世界文档写入。安装收据`.local/forge-unified/install-receipt.json`。
- ZIP SHA256 `67216d5e719f0d1a23a18e172d691fbe5e343482b1eba1bea5ec3ddd522efa76`，来源两旧树29/35路径字节与清单均保持。
- 根级旧UI契约局部复验3/3通过（29断言），并已加入Forge聚焦入口。CI r1的3638通过/1跳过保留，不能把其整体退出1改写为PASS；在最终真实接受和吸收c1b87ee主线后执行必要最终整合门禁，避免每个局部修复后重跑全仓。
- FU05-ACCEPTANCE-01/revision3已派发同一Chrome执行聊天。准备只读audit Macro、标准Actor/Item新sourceId来源与最终读回次序；首份工具真实往返成功后才扩大业务。战斗包runtime/lifecycle与master基线无差分，实机仅补新入口/原审核窗口，不重放旧战斗矩阵；不调用Provider。下一步：接受执行器实际结果并独立审图/比较基线，或只修新失败。
- FU05-ACCEPTANCE-01-PARTIAL-01a10b1b已收到：真实单窗口、蓝图焦点/保存/重开、同源复用及Guard24/Elite48创建读回通过，既有Actor/Item/Scene/Macro集合ID/hash变化0。保留两个Actor、两来源及审计Macro，后续复用。
- 独立审图确认纸色预览的dd及动作标题继承Core暗色主题文字变量而难以辨认。修复仅在statblock内设定文字theme tokens并去除dt暗色阴影；复验选择是重建归档、确认除CSS外八文件字节不变，以及原宽/窄实机截图，保持已有业务PASS。
- Item测试准备脚本写出的来源ID与所有权记录不一致，实机尚未创建Item。改用正式buildForgeItemRequest的显式sourceId参数，保留既有fixture身份并断言来源/response/ownership三者一致；只重生成这一未使用来源的正式响应，不改最终JSON或现有世界对象。
- 原Item输入带UTF-8 BOM（EF-BB-BF），父准备脚本的手工frontmatter正则未匹配，正式workflow随后生成另一新ID；确认为父fixture准备错误。显式sourceId参数已通过正式accepted响应，三处统一为item:v1:f11bd158-eaf3-4e7b-bd47-02a693b8b30c；既有Inspector无需替换。
- CSS修复ZIP为fa8f21d8a2837cc8098c464e194cba0baae78d6163718aa70c1a510edaf9fe7d。受控逐文件比较证实仅CSS有差分，另外八文件与前次安装逐字节相同；只更新精确模块CSS，35468服务保持运行。父独立读取两截图及baseline/partial收据，核实两Actor新增与其他所有基线hash不变，结果`.local/forge-unified/partial-parent-review.json`。无用户入口或操作语义变化，手册说明仍适用，最终门禁检查其watch。

## 2026-10-05 最终本地接受

- `FU05-ACCEPTANCE-02` / revision4 / `FU05-ACCEPTANCE-02-FINAL-01a10b1b`为`PASS_AUTHORIZED_LOCAL_SCOPE`。父已收到实际回调、读取完整收据并独立审查替换后的宽/800px正式预览、窄窗草稿及原生Item截图。最初三张误命名截图已在receipt的evidenceCorrections中排除；使用`rev4-hp48-formal-*-verified.png`、`rev4-blueprint-draft-narrow-confirmed.png`及补充视觉收据。
- 精确运行组合为Forge0.5.0 / Foundry14.368 / dnd5e5.3.3 / cor-cotn / GM。已接受目录单窗口、四编辑标签与焦点、库草稿保存重开、蓝图正式生成创建/同源复用/独立派生、Actor三模式及Item两模式的独立草稿与旧候选失效、标准Actor/Item文件输入/生成/创建/回读/原生卡、共享独立AI连接窗口、设置入口迁移以及战斗包新入口打开原审核窗口。
- 预览数值颜色实际为rgb(46,32,27)，AC15、HP24→48、速度30、CR1可读；Guard原生准备数据+5/1d6+3、DEX13/2d6保留。正式CLI来源语义与UI运行证据分别接受，没有用schema或截图替代完整来源检查。
- 父直接比较baseline、after-business-final、post-cleanup：仅三个本次Actor和一个本次Item新增；清理后Actor286/Item180/Scene65/Macro93的全部ID/hash与基线一致。两库来源记录清除；审计Macro最后删除，其后原生UI完整93宏ID再次与基线一致。scene/paused/worldTime/camera/control保持，GM退出，自有tab关闭，用户tab未触碰，Mirror服务保留。
- 实际原始收据和截图保留于`H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/forge-unified-20261005/chrome-acceptance`；父独立核对为候选`.local/forge-unified/final-parent-review.json`。原GM/Blueprint两树HEAD及29/35路径状态和SHA再次核对不变。
- 本次真实Provider调用0；native combat、战斗包导入/启动、race stress、Next/生产均不在本次运行PASS范围。提交锁异步重绘由已有离线回归覆盖，未声称并发压力实机通过。旧战斗runtime源码未变，保留其原范围证据。
- 主线现为`3c23f758b84da73a2848b28094e4313f6819ca2d`：除验证选择/运维条目外又合入ServerNext四模块，Forge及本次共享生成目录无新差分。最终整合保留全部主线增量，重新合成手册，运行完整CI；不因无关主线变化重放已绑定且未改变的Mirror业务。
- 功能已本地提交`4b1419e`。主线吸收仅冲突于reviewed.json和生成HTML，逐条合成核对后30条手册check及34项agents检查通过；所有主线任务范围外文件、原有scripts和watch均保持。最终CI运行中；依handbook-maintenance实际打开生成页核对Forge入口/蓝图说明和接受边界，通过同一Chrome执行聊天完成，无需重新进入世界。
- 最终`bun run ci:verify`退出0：3727 pass / 1 skip / 0 fail，380测试文件、主覆盖率测试阶段397.24秒；CLI独立24项与构建测试也通过。完整类型、架构/环、覆盖率门禁、anti-overfit433 sources、hygiene1952 tracked paths、锁定参考、Web build和离线Actor smoke均通过。早期CI r1失败保留，修复后的最终组合已完成必要复验，没有缩减清单或放宽阈值。
- 合并后普通release重新构建的ZIP仍为`fa8f21d8a2837cc8098c464e194cba0baae78d6163718aa70c1a510edaf9fe7d`，与已接受及已安装产品一致，故复用Mirror行为证据。
- `FU05-HANDBOOK-01`实页检查及父审通过：Forge条目/三两模式/蓝图库/创建/版本和范围，验证条目的完整CI及两聚焦命令均实际可见；HTML SHA256为`9e905dcf5a170486a3ac7996f88b07bbb82b3c8a4e59be866339b39c87f40afe`。自有tab关闭，父关闭仅本次18764预览服务并确认监听0；Mirror仍为35468。
- 功能整合提交`b689aad7266e4c256050741c9d24ed74d3c8014b`已从主工作区正常fast-forward进入master，完整保留原主线`3c23f758b84da73a2848b28094e4313f6819ca2d`。合并前主区/索引为空，新增路径无既有文件碰撞；合并后主区干净，30条handbook:check通过，master手册与已实页接受HTML哈希一致。最终状态补记只改本计划，不改已验产品/测试/手册，复用本次CI和运行证据。

## 后续建议与保留边界

本轮统一工作台已可在Mirror使用。下一批优先选择一份真实团用怪物来源，针对明确的Provider/模型验证AI分析→审核→创建全链；不要把本轮共享设置窗口接受当作AI语义接受。战斗包现有玩法、Next、远端发布和生产部署按各自独立范围推进。

保留本候选的`.local/forge-unified`原始来源、日志、安装身份及父审文件；两棵旧源树完整保留。没有工作树删除、分支删除、远端push或生产变更。
