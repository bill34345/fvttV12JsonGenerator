# ServerNext 迁移：唯一当前状态与执行入口

> **2026-10-05 最新收尾入口：** 用户在完整进度报告后批准恢复本地Next、更新四模块、补原生Cleave实机、整合历史源码并本地合并；本条取代下文旧快照中“未授权合并／等待自有模块”的当前含义。原Next已恢复，四包实装，真实Cleave伤害9／HP80→71通过；本批临时文档已清理、原世界设置已精确恢复。最终模块集合和本地整合状态以[本次收尾记录](../reviews/2026-10-05-servernext-closeout.md)顶部为准。旧工作树与私有证据保留，历史失败及边界不改写，远端push和生产不在本次。下文日期、旧PID、旧HEAD与旧未完成项按当时快照阅读，不当作最新状态。

> 2026-10-03本地提交授权与当前入口：用户明确要求先做commit、减少dirty积压。已在原迁移分支形成b6ec1ad（运维/来源恢复）、493f21d（Midi历史补丁及固定测试输入）、0c91e70（外部候选/不全包）；剩余总表、审计资料与手册在配套文档提交中归档。本轮仅本地commit，未授权或执行merge/push，不吸收master、不reset/stash、不隐藏或丢弃旧改动、不清理运行或私有证据。历史61974058与dirty计数保留为当时快照；后续以此分支实际git log/status为准。手册视觉检查仍按用户决定延后。详见[本地检查点说明](../reviews/2026-10-03-server-next-local-checkpoints.md)。

> 2026-10-03当前：b796c62f单原效果恢复、独立恢复收据和普通客户端重载已通过父审；21合集来源与95启用集合保持，原FAILED保留且迁移未重放。38ee6abb已实证石之坚韧正常长休恢复2次/使用1次及真实1d12+2、游侠PHB宿敌正常授予、头盔可见施法配置与取消，普通重载全部保持。41项检查通过。04a9e7ae精确清理已父审通过，本批角色/物品/消息/Macro/owned页全部0，原294/213/65/90/12/67及1419Chat IDs保持。此轮不全包6.0.5兼容和明确来源修复已接受；源码未发布，手册机械检查通过；页面目视因正式Chrome拒绝file://协议而NOT_EXECUTED，拒绝及空白页清理证据已保留。运行验收时为Next PID43196／14.368／6.0.5、273dirty／索引0；现按下方用户新授权分组本地提交，运行服务不因提交改变。历史暂停点见`.local/classpack-next-20261002/restart-handoff-20261003.md`。

> 2026-10-03用户补充决定：手册页面目视检查“之后再一起检查”，现为DEFERRED_BY_USER，不再作为本轮收尾阻塞；历史协议拒绝证据保留。本轮不全包工作已收尾，下一组仍是自建MOD适配（含后置的Selected Token Sync），已有接受直接复用。本条仅确认既定顺序，不启动新模块安装或修改。


更新时间：2026-10-03。文件名中的20260927是稳定入口名，本正文是当前唯一总状态。本轮已批准的非暂停运行收尾完成：既有66模块／162资源、DAE与原火巨人AC、74图引用、视频采样直接复用；雅灵完整来源、明确2024出神＋MPMM季节替代、正常API恢复、整体差异、GM重载／重登、七授予及出神UI与精确清理均已父审。世界294 Actor／目标40 Item保持，世界Item206→213为批准7来源，旧27来源hash保持，Macro90及出生页清理通过。全程正式Chrome，Computer Use0；本任务r2传输错误已通过单字段正常API纠正，失败原件保留。服务39148／30002／cor-cotn／Core14.368／dnd5e6.0.5保持。已批准范围结论见第5.13节；用户新要求的实时三环境对账见第5.14节：线上当前启用的8包尚未安装到Next，不能把批准范围闭合扩大为完整线上包集迁完；源码发布未授权，未自动commit／合并／push，排除对象及全矩阵／长时／生产边界不变。

用户后续已选择新一轮范围，见第5.15节：不全包进入内容适配；自有mod适配后置，Token同步随该阶段最后处理；Cze地图包不列完成门，城主工具包与Plutonium不处理。Importer官方V14支持已核，无需另造dnd5e6适配；新阶段未完成不反改第5.13节原批准迁移收尾的接受。

## 1. 当前身份与范围

| 项目 | 当前值／边界 |
|---|---|
| 当前整合基线 | HEAD 6197405（完整提交 61974058f1af4e0f70fc675a0c856cae07d99a8f）；原迁移分支已吸收此前 master 发布提交。2026-10-02 开工核展开 status 仍为220个未提交路径、索引为空；原未发布内容继续保留。本轮不自动commit／合并／push。 |
| 原迁移工作树 | I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration；保留原有 dirty/untracked 内容。master 同步并不表示原树的全部本地改动已整合或发布。 |
| 最新现场状态 | 50480完成本轮既有修复后实际已停，原因未获证。核Next无进程／30002无占用、277个现存Data LOCK冷态可独占只读后恢复同一实例；当前PID39148、Administrator、127.0.0.1:30002、cor-cotn／Core14.368／dnd5e6.0.5／DAE14.0.14+servernext.1。/api/status active与实际命令匹配。无额外实例／备份／Mirror或生产操作，旧39528／50480不沿用。 |
| 当前已完成边界 | 6.0.5 版本更新、94 项启用集合恢复、十个自有模块的限定代表行为／普通 GM 重载／精确清理、Midi local.10 两个请求加值切片，以及 Vision 5e + Item Macro、两个 DLC 合集技能加值修复的限定验收均已完成。完整模块矩阵和全世界无错误不在这些接受范围内。 |
| 本轮工作边界 | 用户已恢复非暂停迁移主线；“上轮仅同步源码和进度”已被取代。三个限定调查已父审；当前完整剩余清单与当天建议顺序见第5节。沿用适用E2E，不升级Core／Mirror／生产，不自动发布剩余源码；“希望今天全部完成”尚不等于解除已明确暂停对象。 |

**共用验收工具 V1 已交付 master**；文件侧的 prepare、ready、execute、collect、resume 流程可复用。Vision 5e + Item Macro 的运行入口来自专属的 6.0.2 历史试用切片，不是通用运行适配器，也不是 6.0.5 已验证契约。需要在 6.0.5 执行新的运行任务时，必须按精确现场与版本建立对应合同；不能直接套用旧 6.0.2 合同。见[工具 V1 验证结论](../reviews/2026-10-01-development-feedback-v1-verification-status.md)与[VM 限定运行记录](../reviews/2026-09-30-development-feedback-next-vm-runtime.md)。

## 2. 总进度

### 已完成的运行验收

| 范围 | 当前接受结果 | 明确边界／证据 |
|---|---|---|
| 系统版本更新与现场恢复 | 同一 ServerNext／cor-cotn 从 dnd5e 6.0.2 更新到 6.0.5；Core 保持 14.368，现场身份如上。 | 版本升级不是模块兼容结论；不表示生产升级。[版本策略及升级记录](../reviews/2026-10-01-dnd5e-version-following-policy.md) |
| 十个自有模块 | chat-memory-guard、fvtt-babele-rolltable-embed-translation、fvtt-battlefield-painter、fvtt-blood-hunter-2024、fvtt-homebrew-species、fvtt-house-rules、fvtt-injury-fading-spirits、fvtt-json-generator-spell-resolver、fvtt-session-monitor、open-session-deck。原 94 项启用集合已恢复；十项各自的限定代表行为、一次普通 GM 重载及自有对象／临时 Macro 精确清理通过。 | Midi 由另行授权的 local.10 增量处理；其余 93 个版本与已接受基线一致。Painter 的本轮火焰可见性与视频推进已通过，但旧世界其他 Pixi／页面错误仍开放。未接受完整 Cast、天然 19、全部子职／地形、玩家／GM 全矩阵、长时或生产。[十模块记录](../reviews/2026-10-01-next-605-custom-module-restoration.md) |
| Midi-QOL 两个请求处理器 | local.10 的 Check 与 Save 各接受一次真实 +4 来源加值：Check 骰 12、总值 16；Save 骰 20、总值 24。原 94 项集合和 49 个来源值保持，测试 Actor／Scene／Feat／Chat 与辅助 Macro 精确清理。 | 只接受两个 Activity 请求切片；不推及其他权限、隐私、workflow、完整 Cast、生产或长时行为。旧 local.9 的 +1 失败原件保留，不改写历史。[Midi 验收](../reviews/2026-10-01-next-605-midi-request-bonus-gap.md) |
| Vision 5e + Item Macro | 既有候选的视野／刷新、宏保存重开及手动／活动 API 切片，普通玩家和 GM 刷新、原值恢复、归属核验与精确清理通过。 | 这是限定行为与恢复闭环；未接受 Vision 全部感官／墙体／语言或 Item Macro 所有系统／旧用法。源运行合同仍是 6.0.2 专属历史切片。[实机与清理记录](../reviews/2026-09-30-development-feedback-next-vm-runtime.md) |
| 两个 DLC Actor 合集 | 5e-dlc-monster.monster-heji 与 5e-dlc-monster.modengken-duoyuanguaiwu 两个声明合集已迁移；11 个 Actor 的49条来源技能检查加值已逐字段修复并对照来源。普通重载保持值，三个代表API／界面检查与精确清理通过。 | 原技能修复阶段不再调用迁移，不表示全部1,247个Actor玩法。本轮准确原Other AC Bonus状态与已知图片缺口另接受，见第5节；没有追加官方付费包验收。[49字段修复](../reviews/2026-10-01-dlc-source-skill-repair.md)；[原迁移记录](../reviews/2026-10-01-development-feedback-dlc-runtime.md) |
| 较早已接受的限定批次 | DFreds Droppables、Global Progress Clocks、Item Piles、Item Piles D&D5e、DFreds Convenient Effects 的原有限定行为与清理结论沿用；既有角色／物品修复也不因本轮重开。 | 不重复已通过玩法。它们仍是分项限定结果，不合并成“全世界零错误”或所有功能兼容声明；各旧专题原件保留在原迁移工作树。 |
| DLC单一Other AC Bonus | 原6.0.5／DAE14.0.14切片确认火巨人AC21、内存启用21／禁用20，delta+1；18板甲＋2盾牌＋1效果归属正确，清理通过。 | 不改Actor数值。首次原包applied=null、DOM Inactive是当时实证；后续本轮DAE候选applied=true／DOM Active及图片修复已接受，不改写旧失败原件。[首次限定接受](../reviews/2026-10-02-next-605-dlc-ac-inactive-diagnosis.md)；[本轮修补](../reviews/2026-10-02-next-dae-phase-chain-and-icon-sources.md) |
| 五项收尾的非付费加载与DAE窄修补 | 新客户端实际94启用，28个启用付费包明确排除。66个非付费模块逐项active／version与162个声明脚本／样式资源全部成功，无失败／未知入口，新增console error为0。DAE候选9项精确源码方法检查PASS；实机内存无效果AC10／+1效果AC11、bonus1／applied=true，持久Actor仍294。 | 仅接受用户要求的正常加载／声明资源及本次最小效果切片，不代表每项玩法。2条旧数据validation异常保留；r1检查器错误已保存并修正，不能算模块失败或抹去历史。出生Macro清理、完整90 IDs一致及owned页关闭通过。原火巨人状态UI在图片修复批次作最后读回。[本轮来源／分层证据](../reviews/2026-10-02-next-dae-phase-chain-and-icon-sources.md) |

### 源码整合与工具可用性

| 项目 | 状态 | 边界 |
|---|---|---|
| master 发布成果 | 版本跟随策略、共用工具 V1、6.0.5 十模块源码与版本门、Midi local.10 修复及相关发布前检查已进入 master 6197405；实际 CI／类型／覆盖率等发布检查见[发布整合记录](../reviews/2026-10-01-next-605-release-integration.md)。 | master中被接受的范围不等于原迁移树剩余源码已发布；368是旧同步前历史计数，本轮当前为223个未提交路径，也不等于223个功能故障。额外工具与本地运行合同不自动适配。 |
| 原工作树接续 | master基线已在原迁移分支前移到6197405，索引仍为空。已发布十模块采用最终验收版本，原Midi五个脚本、首次安装入口、玩家修复路由保留；209个未涉及的原dirty文件逐SHA核对未变，其他未发布内容没有被自动提交。 | 原树实际完成文件侧prepare→ready→execute→collect→resume，behavior=PASS、evidence=COMPLETE，收据593a68a8-f374-4e09-bd17-c81f56e83721，正式操作一次、没有重放E2E。它只证明原树工具可用；自动parentReview仍保留PENDING，不替代业务父审。 |
| 旧合同与接续规则 | HEAD／指令或候选变化后，旧合同不能继续复用绑定；未执行的检查准备新合同，已执行的操作先读状态和原件，不盲目重放。旧6.0.2运行合同不覆盖6.0.5。 | 文件侧原件在原树`.local/next-master-sync-20261001-230000/proof.json`；旧运行合同与原件仍只读保留，不为通过门禁篡改历史绑定。 |
| 已有证据复用 | 十模块、Midi、Vision／Item Macro 与 DLC 的实机接受复用各自最终父审原件；发布整合没有再进入浏览器、投骰或重部署。 | 接受范围或依赖版本未变化时不重复 E2E；新行为或新风险需另建对应的精确检查。 |

### 仍开放的问题

| 项目 | 现状 |
|---|---|
| DLC效果与已知图标 | 本轮限定问题已闭合：DAE原生条件链／applied修补通过，准确原火巨人AC21／+1／DOM Active；已确认世界73处与该合集1处图片正常更新／重载／清理。内部change文字截图仍INCOMPLETE，未逐个检查所有pack图片或玩法；这些层级不追加为本轮阻断。[本轮修补与边界](../reviews/2026-10-02-next-dae-phase-chain-and-icon-sources.md) |
| 雅灵内容 | 完整来源与明确替代正常API恢复／整体差异／GM重载／限定UI／清理已接受。采用原sw1tLIZrkxRBFoWL，原40 Item保持，失踪旧key移除；7新来源、27旧来源保护通过。原失踪Item未找回，真实长休／季节玩法未执行。详见第5.13节及雅灵专题最终段。 |
| 旧 Pixi／页面异常 | 当前6.0.5采样已父审：148 cache中7个视频资源两次均valid／非零尺寸，递归前置0；新客户端console只捕获已知测试副本和雅灵两条error，旧Pixi族此次未复现。旧互调机制静态明确，但历史无资产URL、当前缓存refs无Tile／场景归属，原因仍UNRESOLVED；不改Core或重试相同观察。原生网络／专用page-error流INCOMPLETE，404另开放。仅新真实失败或相关代码／媒体变化重开。[限定采样](../reviews/2026-10-02-next-pixi-video-source-diagnosis.md) |

### 本轮接续分类与当前下一项

| 分类 | 项目／本轮决定 |
|---|---|
| 业务已完成，部分源码待整合 | 十模块／Midi local.10及共用工具V1已在6197405交付；VM、DLC49字段和较早已接受批次的运行证据复用。原树仍有Midi五脚本及工具、external-candidates、player-item-repair和专题文档等未发布内容，不能因运行已接受写为源码全部整合。是否发布另需明确授权。 |
| 真正未完成 | 本轮雅灵正常API／来源差异／持久化／限定UI／清理已接受，已批准非暂停运行收尾闭合。剩余源码提交、合并、push及对应发布整合仍未授权；不自动恢复六暂停对象，不追加35原关闭／37付费或完整玩法／长时／生产接受。 |
| 明确暂停 | Custom Conditions、Trigger Engine、Weapon Mastery、JSON Forge、Plutonium CN，以及已有明确暂停／待判的其他候选、付费record-only范围。没有恢复、升级或派发这些项。 |
| 当前新证据 | 共用文件侧工具新合同122769fe-5d83-4fdc-868d-a4bf228aaac2完整往返，收据9249cda1-4a7b-40e9-8b5e-76f5a7a4adc3：PASS／COMPLETE／NOT_REQUIRED，自动父审仍PENDING；独立父审只接受精确源码归因。此前失败与参数恢复保留，不重放已执行操作。 |
| 下一动作与实际缺口 | 原批准运行收尾无临时对象或待派发。新实时对账发现8个线上启用包Next未安装，若要覆盖需用户明确决定新增迁入范围，原暂停／关闭排除不自动解除；源码发布另需授权，见第5.14节，不把旧基线或旧CI当新范围通过。 |

### 明确暂停或尚未接受的范围

| 项目 | 决定／状态 |
|---|---|
| Custom Conditions、Trigger Engine、Weapon Mastery、JSON Forge、Plutonium CN | 按既有用户决定暂停；本次源码同步不恢复，不派发，不自动安排下一步。 |
| 其他待核模块与合集 | Dungeon Strugglers 等未具备精确版本／可验证依据的项保持暂停或待判，不因 6.0.5 的其他验收推定兼容。付费模块继续 record-only，不升级、不切换、不测试。 |
| 十模块及其他已启用模块的完整玩法 | 94 项集合恢复和代表行为不替代模块全功能接受。天然 19、完整 Cast、其他子职／地形、全部玩家／GM 组合未执行。 |
| 系统外验收 | 长时测试、生产环境、Mirror 变更及全世界零错误结论均未执行／未接受。不得把 ServerNext 本地证据扩大到这些出口。 |

## 3. 接续规则

1. 当前指定工作是恢复非暂停ServerNext迁移主线；上一轮仅同步边界已被本轮授权取代。始终在指定原迁移树接续并保护dirty/untracked，不自动提交、丢弃或发布；这份总表仍是唯一当前状态入口。
2. 明确暂停项目继续暂停，其恢复需新的明确范围；本轮已授权的非暂停开放项按证据继续调查／执行，不重复索取业务授权。新运行合同必须绑定实际版本、服务身份、目标和验收出口；宿主跨聊天发送授权另按实际工具规则处理。
3. 沿用已通过证据；仅在代码、现场、行为或新风险变化时重跑受影响门。UI／角色／持久化、来源语义、清理归属仍分别以对应原件和父审结论为准。
4. 安装兼容声明、构建通过、模块启用、代表性行为和完整玩法是不同层级；报告时逐层写状态，不用一个“支持”概括。

## 4. 当前证据入口

- [2026-10-02接续复核与DLC AC Inactive源码归因／实机边界](../reviews/2026-10-02-next-605-dlc-ac-inactive-diagnosis.md)
- [2026-10-02雅灵缺失原Item的来源接续调查](../reviews/2026-10-02-next-605-eladrin-source-gap.md)
- [2026-10-02旧Pixi视频资源异常的精确归因切片](../reviews/2026-10-02-next-pixi-video-source-diagnosis.md)
- [ServerNext 6.0.5 十模块恢复、代表行为、重载与清理](../reviews/2026-10-01-next-605-custom-module-restoration.md)
- [Midi-QOL local.10 两个请求加值与清理](../reviews/2026-10-01-next-605-midi-request-bonus-gap.md)
- [共用验收工具 V1 正式结论](../reviews/2026-10-01-development-feedback-v1-verification-status.md)
- [Vision 5e + Item Macro 专属运行历史](../reviews/2026-09-30-development-feedback-next-vm-runtime.md)
- [DLC 原迁移观察与原始语义失败记录](../reviews/2026-10-01-development-feedback-dlc-runtime.md)
- [DLC 49 条来源技能加值修复](../reviews/2026-10-01-dlc-source-skill-repair.md)
- [dnd5e 双版本线与跟随策略](../reviews/2026-10-01-dnd5e-version-following-policy.md)
- [master 发布前整合与验证](../reviews/2026-10-01-next-605-release-integration.md)
- [版本跟随操作规程](../runbooks/dnd5e-version-following.md)
- [Worktree 开发规程](../runbooks/worktree-development.md)

本文件只负责总状态与下一步边界；专题报告保留当时的原件、失败过程和精确接受范围。旧报告中已被新证据替代的 PID、版本、下一步或“待执行”状态不再作为当前事实引用。

## 5. 2026-10-02 完整剩余清单与当天收尾口径

**用户最新执行决定：**先处理这5组工作。非付费模块以正常启动／加载／必要入口无新增报错为验收，不追加所有玩法矩阵；具体修补只保留最小对应检查。付费包不由本任务验证，由官方负责，不再把37项列为本任务“待完整验收”。原来未启用的模块只确认旧开关，确认后排除；6个明确暂停项目未解除。源码提交／合并／push仍未获得发布授权。

“DND5E不全包”身份已核：旧库存title=DND5E不全包、ID／folder=`dnd5e_classpack`、version=`4.3.4-v14.2`，原启用基线=false；与付费`mcdm-class-bundle`不是同一模块。它按新决定排除，不安装或测试。仅名称／ID身份成立，本轮不读取其完整合集或扩展内容结论。

本节按用户要求，以功能／内容而不是未提交文件数说明剩余内容。对照来源为9/29保存的旧环境库存、当前Next磁盘manifest及本轮最近已接受94项启用原件；没有重新访问Mirror。私有机器对照在本树 `.local/next-continuation-20261002/remaining-inventory-audit.json`。旧启用基线77项中，当前仍未进入新环境的是下行6个明确暂停项目；这不把94项启用扩大为全部功能通过。当前磁盘103个独立manifest，最近启用94项；磁盘计数不替代当前客户端注册查询。

### 5.1 五组收尾当前状态：运行闭合，源码发布未授权

| 剩余组 | 小白说明 | 当前需要做什么／边界 |
|---|---|---|
| 已完成业务的源码整合 | 功能已在Next使用，一部分代码仍保留在原迁移树，尚未正式发布。 | 已按Midi历史工具、外部候选、玩家修复工具、手册／证据区分交付；手册已明确6.0.2旧入口不能覆盖6.0.5／local.10，并登记DAE／图片修复来源。索引不改。commit／合并／push仍需发布授权，不能一次提交全部既有dirty。 |
| 雅灵种族条目 | 已采用原角色2024《出神》并追加MPMM长休后换季条款；不宣称旧原Item找回。 | 完整来源、7source正常API创建、授予配置／value及关联记录同步、原40Item／27旧source保护、整体hash、GM重载／UI／精确清理均接受。期间本任务r2字段传输错误已窄纠正并保留失败原件；没有实际执行长休或季节玩法。 |
| 遗留图标与404 | 已确认74处接受：世界73处／33个owner／11旧路径，加本地DLC原火巨人效果1处；保留测试Actor未改。 | 正常API仅img及受限修改metadata，世界完整IDs／重载73matched／两图UI通过；合集单图diff仅img+效果modifiedTime、278 IDs一致、原配置／锁恢复、重载hash相同、AC21／+1／applied保持。所有出生Macro／owned页清理通过。不启用Plutonium，不将此扩大为所有pack扫描或原字节复原。 |
| DAE效果状态／条件链 | 已接受最小修补；准确原火巨人AC21／来源+1／applied=true，原来源hash与锁保持。 | 候选14.0.14+servernext.1的9项方法测试、内存AC10→11及准确原目标读回通过，DOM／AX有Change Active，不再Inactive。实际截图确认原Actor与AC21，内部change文字截图仍INCOMPLETE；按无新增报错标准不为补图反复重开。未修改角色数值／条件，未扩大到所有玩法。 |
| 旧Pixi与页面证据 | 当前7个视频资源有效，正常新客户端及r2检查无新的Pixi／console错误。 | 本轮按用户无新增报错标准接受当前加载，不继续无变化重试或猜改Core。旧递归历史原因未闭合、全场景／网络／独立page事件流没有全量接受；新同族错误或相关代码／媒体变化时重开。 |

当前240个未提交路径仅作交付规模参考：文档58、Midi工具／历史补丁82、外部候选68、玩家修复18、其他入口／手册14。它们不是240个尚未迁移的模块或故障。

### 5.2 真正尚未迁的6个原启用项目：全部明确暂停

| 项目 | 用来做什么 | 为什么不计入本轮自动执行 |
|---|---|---|
| Custom Conditions | 本团自定义状态与效果 | 用户明确暂停，需独立6.x适配／验收。 |
| Trigger Engine | 自动根据回合／事件触发操作 | 用户明确暂停，需独立6.x接口与行为适配。 |
| Weapon Mastery & Properties | 武器精通和武器特性自动化 | 用户明确暂停，旧5.x验收不覆盖Next。 |
| JSON Forge | 本团JSON生成／导入界面 | 用户明确暂停，另一工作树来源整合边界仍保留。 |
| Plutonium CN | 中文资料导入器 | 用户明确暂停；本轮不再查包、安装或启用。 |
| Dungeon Strugglers Collection | 物品素材合集 | 用户明确暂停，精确新包／适配来源待核。 |

若当天目标包含这6项，就是改变既有暂停范围；不能从“希望今天全部完成”自动推断已解除，也不能保证多项适配当天通过。

### 5.3 原来关闭、当前未带入的35个旧记录：未纳入默认迁移目标

它们不是漏掉的已启用功能，也没有自动迁移／删除授权。以下完整列出；分组只为阅读，不能当作兼容结论。

| 类别 | 完整名称 |
|---|---|
| 资料与内容（3） | 5e不全书在线版（5e-chm-online）；DND5E不全包（dnd5e_classpack）；Forgotten Adventures Battlemaps。 |
| 绘图／地图（5） | Advanced Drawing Tools；Universal Battlemap Importer；Map Image Optimizer Bridge；Levels；Grid Scaler。 |
| 地图棋子／特效（10） | Easy Target；Selected Token Sync；Baileywiki Mass Edit；Multilevel Tokens；Swarms；Swipe；Sync Token Names；Tagger；Tile Scroll；Token Magic FX。 |
| 血量／队伍／战斗标记（3） | Always HP；Party Resources；Monk's Combat Marker。 |
| 聊天／笔记／语言／任务（6） | Chat Media；DFreds Chat Pins；Monk's Enhanced Journal；Polyglot；Simple Quest；Translate All。 |
| 查错／查找／连接／回收（5） | Find the Culprit；Foundry MCP Bridge；Dig Down - Advanced Search；回收站（recycle-bin）；Library: Scene Packer。 |
| 无有效标题，身份未核（3） | bad；good；sample。不将其计作已确认正式模块，不擅自迁移或清理。 |

### 5.4 37个付费包：明确排除本任务验证，由官方负责

这37项与已安装／已启用／保持关闭名单有重叠，不与6／35相加。用户已再次明确它们不由我们验证，由官方负责；不将它们作为迁移验收债务，不逐项测试功能或内容。保留正常组合中的既有启用状态，正常客户端自动加载不升级为“付费包通过”。逐包历史见[付费记录](../reviews/2026-09-23-server-next-paid-module-record-only.md)，不刷新外部发行版本、不下载或升级。

| 类别 | 完整名称 |
|---|---|
| D&D内容包（13） | Forgotten Realms: Adventures in Faerûn；Arcana Unleashed；Arcana Unleashed: Deadfall；Dungeon Master's Guide；Eberron: Forge of the Artificer；Heroes of the Borderlands；Forgotten Realms: Heroes of Faerûn；Monster Manual；Phandelver & Below: The Shattered Obelisk；Player's Handbook；Ravenloft: The Horrors Within；Tasha's Cauldron of Everything；Tomb of Annihilation。 |
| 第三方资料／设定／冒险（18） | Allies and Antagonists；Atheron Campaign Setting；The Demon Queen Awakens；ZAMANORA: Ballad of the Witch；ZAMANORA: Monsters & Fables；Echoes of Heaven: The Festering Earth；Echoes of Heaven Campaign Setting/The Throne of God；Grim Hollow - Monster Grimoire；Heliana's Guide to Monster Hunting；A House Divided；Prepared! Expanded Collection；Librus Nocturnum；MCDM Class Bundle；Flee, Mortals! & Where Evil Lives；Shards and Traditions；The Folk from Harrowthorpe；The Griffon's Saddlebag, Book One；Weapons of Lore。 |
| 表格／地图／动画／工具（6） | The Great Book of Random Tables；The Great Book of Random Tables: Quests；Hexcrawl Hex Tiles；Tile Arsenal；Filepicker Plus；JB2A - Patreon Complete Collection。 |

其中当前磁盘存在、最近94启用原件未启用的9项：The Demon Queen Awakens、Deadfall、Heroes of the Borderlands、Phandelver & Below、Tomb of Annihilation、Echoes of Heaven: The Festering Earth、Echoes of Heaven Campaign Setting/The Throne of God、Grim Hollow - Monster Grimoire、A House Divided。保持既有关闭／记录决定；Demon Queen的旧签名问题单列，不能为了清错手改签名。

### 5.5 不自动追加的验收与有意保留项

- 全部模块每个功能、天然19、完整Cast、所有子职／地形、全部玩家／GM组合、1247 NPC全部玩法：尚未完整验收，不是本轮已约定迁移接受门的自动追加任务。
- 长时会话、Mirror变更、生产迁移、全世界零错误：未执行，沿用原范围。
- 旧错误测试副本LN5PLqTTdx0l7o7w按用户要求保留，其非法identifier错误不能当作待删除项。当前两条console error另一条为雅灵；不能以清零方式删除保留副本。

### 5.6 当天建议顺序与可完成范围

建议先整理未发布源码的精确交付边界，同时处理图标来源／DAE窄修复候选；雅灵只在取得明确来源后修，旧Pixi没有新的失败证据就沿用当前采样结果，不投入无变化重试。最终统一只补本轮改动影响的验收和清理，发布前给具体审查清单再取得对应授权。

当前执行目标仍是5组收尾；35原关闭／37付费／6暂停保持排除。雅灵来源策略已由用户明确替代决定解决，剩余为受支持GUI能力恢复及真正写入／验收；源码发布授权独立保持。缺证或无当前失败样本不虚写修复通过。

### 5.7 源码交付准备与本批接续

保留原220路径，不整体暂存。拟审查分组为：Midi锁定历史源码工具及说明；外部候选来源／补丁（含本轮DAE与icons）；正常玩家Item修复入口及局部测试；Foundry Ops现有routing／catalog与package入口；专题记录／唯一总表／手册。已进入master的十模块和Midi local.10增量不重复发布，也不从旧候选构建覆盖当前运行。新DAE9项方法测试、静态图片指纹、冻结Macro syntax及git diff --check已通过；已完成的来源／E2E直接复用。

手册四项已人工对照当前版本与历史工具边界，生成／一致性检查31项PASS；本节及新源码变化后应按受影响条目重新记录最终指纹。源码真正发布仍待相应授权和实际integration门；不能用这些准备或旧master CI成绩冒充当前全部源码已合并通过。

图片修复a083a6f0-1d4c-49c4-a9c8-b9376103675d/revision2已收到并父审73处限定接受。r1的末尾LF字节门拒绝为零执行／零世界写入；r2严格对齐实际编辑器保存，正常API更新及只读重载各一次，绝不重放。原件和parent-final-acceptance在同一F盘证据根icon-repair-r2。共用新文件合同0c44a419-4f45-4477-9ff4-866f2ce32e4c／收据5b497872-1da5-4e66-94bb-a75db4539f1c保持原样。

父合同另有目标文字错误：CCQeulSS5VGkOP2y／yY23mBjn0wsSE16h实际是世界剑客，AC17／Other AC Bonus +2／applied=true，不能作为原火巨人AC21证明。图片批次严格用了指定ID且未改规则，图标结论仍成立；DAE原目标待补准确只读。原accepted原件准确UUID是Compendium.5e-dlc-monster.modengken-duoyuanguaiwu.Actor.0NvFibF8HEHoRR10／effect WhNngS9xnhhHeTRv。

9c73ca68-cf2b-4d8e-9b6d-d9c930f874ab/revision1准确原DAE只读已父审：AC21／+1／applied=true、来源SHA b858246f...cf7b5e与旧接受相同、packLocked=true，原世界／pack写入0；DOM／AX有Change Active，截图内部文字视觉INCOMPLETE保持真实边界。出生Macro4bRHk17W4N24c9np删除、90 IDs保持、owned页651337965缺席、服务50480保持。新文件合同77b81b7b-758d-4ea4-88c1-11424a424af7／收据ad22acc3-f96c-430b-a2b8-8049987a2447保持原样。

合集单图c4b711ec-c4df-4561-8aa9-06e98c16af72/revision1已回执并父审：正常API只Effect img更新；完整Actor diff仅effects.0.img及effects.0._stats.modifiedTime，unexpected=[]，configRestored／packLocked=true，278完整index IDs前后相同。重载只读sourceHash等于写后17a27a4bdbe3e96b5a53f1991a32be35da1f5b0baa810f41191cd989a106434a，AC21／+1／applied=true保持，单图实际150×150／新src及父看图通过。出生d4wF4vZYF3qfdOGE／t8Ik9ooXQe1PQUln清理，原90IDs保持、owned页651337969关闭，service50480继续。原件及独立父接受在同证据根dlc-one-icon-r1。未遍历合集／测试付费包／重放世界73处；普通任务未开发工具。当前无Chrome派发等待，2旧validation例外保留。

2026-10-02源码准备复核：当前240个未提交路径，Midi82、外部候选68、玩家修复18、文档／手册58、其他入口14，索引为空。原220文件中210个SHA保持；10个有意更新为总表、三个手册JSON、HTML、Midi README、外部README／package脚本、旧恢复脚本公开元数据入口及根局部测试入口，未知原文件变化／缺失0。新增架构scope、只读facade／package exports及3项边界测试是integration失败的必要修正；雅灵有限投影4项仅新增准备，不改运行数据。精确分组在.local/next-finish-20261002/source-preparation-review.json。

交付准备检查：Foundry Ops及Midi类型PASS；隔离Ops397／0、Blood Hunter包20／0、架构scope3／0；包类型PASS。首次依赖检查误扫上游归档/嵌套依赖并发现旧脚本私有导入，保留失败过程后修正精确scope与公开契约，最终architecture:verify1092模块／2442依赖无违规／循环。agents32层级PASS，卫生1649tracked与全部新交付路径的原检查器预审PASS，git diff --check及handbook31项PASS。详细原因／限制见本轮专题；不声称全仓覆盖率或ci:verify已重跑。

主master只读复核仍6197405／clean／索引为空，没有从其他worktree移动分支、改其依赖或发布。当前源码为可审查准备，正式commit／合并／push尚未授权、未执行；既有修复合同全部完成并清理。雅灵原能力仍失踪，但用户已授权明确替代，当前待真正恢复及验收。

### 5.8 用户确定的雅灵方案与当前能力恢复

用户最新回复已明确沿用当前sw1tLIZrkxRBFoWL／系统origins24的2024出神，并补MPMM雅灵使用出神完成长休后可更换季节条款。原6个已存在能力保持来源，原失踪oFrdemKo1y1Hcrx0不猜造、不再当作本轮必须追回原件。新方案仍要取得当前完整输入、七条合法来源／授予状态、限定UI／重载及原值保护证据；替代尚未实施。授权原句与精确ID在.local/next-finish-20261002/eladrin-authority-20261002.json。

源输入70e223d7-764b-4767-9136-1220b1d471c6/revision1因服务已停、revision2因官方Chrome/Browser技能消失，均0页／0Macro／0执行／0写入。新39148服务ready原件在同F盘证据根service-restore-r1；旧进程停止原因未证明，不推断谁操作。官方Chrome技能当前catalog不列出、原skills目录为空，不能调用遗留browser-client假称能力仍在。

Computer Use正式@oai/sky导入／list_apps预检a18fd0f9-c60b-4778-b809-450909c1b8fd/r1通过；未读取既有其他网页内容。随后e7febfe3-e8aa-4288-9dc5-81be5a5d8f09/r1的launch_app未建立新窗口，仍零输入／Macro／执行。r2只在新鲜非认证Chrome窗口用浏览器级Ctrl+N，新增owned空白window1840510；首次只读state时工具明确停止，原句为无法足够确认当前浏览器URL以执行策略。所有后续UI停止，不重试、关闭窗口或改工具／协议绕行。Macro0／来源capture0／World写入0；新增空白窗口保留，cleanup INCOMPLETE，原窗口和service39148保持。当前无运行派发等待，原件在eladrin-computer-inputs-r2/blocker-receipt.json。

已准备eladrin-adoption.mjs及安全入口test:eladrin-adoption，4项通过：保留6个实际能力ID、明确采用现存TranceID，7配置源UUID与7已授予记录同步；拒绝未授权/部分/嵌入/重复/漂移；执行精确6.0.5 ItemGrant.apply证明同步后的skipExisting创建0能力，而保留旧source值的控制组会重复创建7项；只附加用户季节段落、2024原文/机械字段保持。只是投影和防重复证据，不冒称原种族已修或4小时长休/季节玩法实机通过。源码规模现240路径、原220中210保持/10有意更新（新增局部测试入口），索引为空。

新增这两个文件后的最终依赖／循环门退出0，1094模块／2443依赖无违规，工具类型PASS，卫生原检查器覆盖1876个tracked+非忽略新路径PASS。手册31项、相对引用／尾空白和git diff检查PASS。阶段收据.local/next-finish-20261002/current-receipt.json保留当时GUI停止与残留历史，不登记任务全部完成；其旧空白窗口建议已由第5.9节最新交接替代，不执行。

### 5.9 本聊天闭环与新聊天接手

用户要求先记录本地状态，再自行转到另一个聊天继续；本次不创建／派发新聊天。用户报告另一聊天Chrome已测试可用，此为用户报告，不推断全局工具故障或宣称本聊天已恢复。本主聊天也做过正式Computer Use最小自测：导入／应用枚举成功，窗口只读状态得到同样“无法确定当前浏览器URL以执行策略”的明确停止；随后零输入／导航／Macro／数据写入，不再试旧路径。

旧窗口1840510在主聊天只读枚举时已成为其他未保存工作页面，不能继续按原出生空白窗口认定所有权；不关闭、导航或覆盖，新执行使用自己创建的页面。先前未清理窗口的历史原件保留，当前不把已经复用的窗口当作自动清理债务。雅灵输入阶段Macro创建0／执行0／来源capture0／角色写入0；既有90 Macro清理证据不重跑。

接手入口已保存：.local/next-finish-20261002/new-thread-handoff.md、handoff-receipt.json、handoff-runtime.json及eladrin-authority-20261002.json。交接快照HEAD61974058f1af4e0f70fc675a0c856cae07d99a8f／分支codex/20260919-151319-server-next-migration，240 dirty/untracked路径、索引为空；原220中210 SHA不变、10有意更新、未知变化／删除0。2026-10-02 15:28:42+08:00只读服务核对：PID39148／Administrator／ServerNext数据根／30002／cor-cotn／Core14.368／dnd5e6.0.5 active=true。操作前仍重新核实际服务与Git状态，不因漂移reset或重放恢复脚本。

旧current-chrome-dispatch.json登记STOPPED_FOR_HANDOFF／待回调false；旧执行器无运行派发等待。新聊天不能用旧父UUID发回调或直接重派旧6.0.2／失效GUI合同。先读取适用AGENTS与以上文件，确认自己列出的正式Chrome/Browser入口和最小只读往返，然后以当前候选／指令／HEAD准备新合同，从准确雅灵原种族、六能力与现有2024出神完整输入继续。已接受的66模块、DAE、74图引用、视频与既有迁移E2E直接复用，不从头重跑、不重新开发共用V1。来源完整差异、正常API持久化、GM重载／有限UI和精确清理仍为未完成层级。

本聊天交接闭环完成不等于迁移全部完成：雅灵实际恢复仍待新聊天执行；源码发布尚未授权；原关闭／付费／六暂停对象保持排除；Mirror、生产、备份、额外实例与运行中LevelDB边界不变。

### 5.10 新父接续：正式Chrome可用与完整输入新合同

2026-10-02新父聊天`01a0fb6d-4646-7252-99ef-dfd2619ce968`接手。现场核对仍为原分支／HEAD6197405、240个未提交路径、空索引；30002单一loopback listener为PID39148／Administrator，实际命令指向ServerNext数据根，status为active／cor-cotn／14.368／6.0.5。新父通过当前正式Chrome插件入口完成Example Domain的读取／点击跳转，再新建自有页读取准确Next登录页，测试页关闭。未操作旧窗口1840510，未用Computer Use拒绝路径或旧派发／回调。

共用V1文件合同`3d2b8741-ab78-4473-9752-9aab60133efc`已走prepare→ready→execute→collect→resume，正式执行一次；收据`774b49c7-f444-4c53-97b7-e50e3775dfdf`为文件行为PASS／证据COMPLETE，独立父接受只覆盖源码身份、240路径SHA基线、空索引和原2337字节探针指纹，不覆盖角色恢复。早期未领取的文件合同`79b8a5c7-6e3a-4723-b5ac-e881cae18c4f`因准备脚本的中文路径输出处理及wx冻结调整被新合同取代，不执行旧合同。

用户明确授权先创建新的独立Chrome执行聊天，若它无法处理由当前父亲自执行。新执行器`01a0fba0-50a4-72b3-af9a-0345c5c55205`，期望gpt-6.1-sol／medium；实际权限／模型／能力仍须由其最新turn_context和真实往返证明。新输入派发`c84d046b-ad25-4556-b36d-b752a2b865b1`／revision1已获宿主接受，准确回调目标为本节新父UUID。完整合同与运输收据位于本树`.local/next-eladrin-takeover-20261002/source-contract.json`及`source-dispatch-delivery.json`。本阶段只通过正常Macro工作流读取精确雅灵种族、六原能力与现存2024出神；复用原探针，仅增本次完整Macro／世界Actor／Item ID元数据和归属名，冻结2550字节／SHA15640144487e1a6d7ff754d357b05041707a9bf006c95f20dec84ff3177610b9，语法检查通过。

私有新证据根为`F:/FoundryLab/foundry-v14/evidence/server-next-migration/eladrin-takeover-20261002-7c0e`。本节派发时输入待回调；后续实际输入接受及预览状态见第5.11节。输入探针不授予来源／Actor写入；不重新开发V1、不重跑已接受E2E。不轮询执行器，下一有效事件为完成／真实阻塞回调或用户新指令。

### 5.11 雅灵完整输入已父审，真实6.0.5预览进行中

新输入回调收据017a68ca-5028-4d12-9d63-204bcf2d5639已正确送达。执行器的最新实际配置为gpt-6.1-sol／medium／Full Access；它独立使用正式Chrome完成正常GM登录、Macro保存／重开／单次执行、DOM完整textarea读取与正常UI精确清理，未使用Computer Use。父审完整原文和来源字段、JSON与完整ID数组，接受输入及清理：Actor40 Item／SHA bf4a458eee2de7f57c95e2ec4622affc65a8c5a8b54fb259ccdb363e01bd12ba前后保持，六实际能力存在、失踪原ref null、当前2024出神完整；Macro90／Actor294／世界Item206。出生DdCavaO2aw6I0Fgc删除、原90 IDs完整一致，owned页651338405关闭。不存在额外清理后Actor重读证明，不扩为角色已恢复。

当前候选补原种族说明的失踪出神链接，同步七ItemGrant configuration/value与来源关联，在现有出神只追加授权季节句。七新合法source和一个来源文件夹拟通过正常API创建，已有40 Actor Item IDs及六能力活动／效果／资源／正文保持；27个已接受来源库做保护对账，不改旧来源。当前6.0.5 ItemGrant跳过已有授予的源码事实继续复用。新增正文链接／副本关联两项回归后投影6项PASS，工具类型PASS；共用V1新候选文件合同6dee209a-3871-4d8e-80c1-f0f5b5f82a77／收据264f8d13-c700-4300-84a8-78421b1b0f26为PASS／COMPLETE，仍不代替真实schema。

同一执行器已收到新预览合同2feacd9b-c21e-43bf-b628-9fbc6969b9c8／revision1，本树`.local/next-eladrin-takeover-20261002/preview-contract.json`。冻结Macro60620字节／SHA46221dccc3e9b07290cc1d7ac37dfa1c7d29f7b3dfe3ff925d80303e6a3b0ecb。阶段只做真实客户端严格schema／完整差异预览，不能点击Apply、创建永久source或写Actor；预览归一化差异先父审。自有Macro及页临时保留给同一批次的后续写入／限定重载／UI与精确清理。永久source创建0、角色写入0，重载／UI／持久化接受仍未执行。用户明确本任务全程Chrome，后续不使用Computer Use。

### 5.12 真实schema已接受，新协议与应用合同待回执

预览回调31dc4a29-bb07-4348-a36c-d49602ef93bd已正确送达。父读取完整preview-native.json（SHA9a2ebe53f9bb3a576f5881b097e227080054ad06843ea745c52563154e60f0b1），独立脚本比较8个candidateItems／updates及7个sourceRows与纯投影逐字段相同，15个归一化差异数组全部空，原Actor hash保持、27旧source保护清单完整；本批preview/parent-preview-acceptance.json只接受真实schema／精确内容，不代替正常API写入。Owned Macro WOZGet3eB4U4OisM和owned页651338411暂留同一批次，最终必须清理。

父据准确Core14.368 common/data/fields.mjs的ObjectField._updateDiff确认普通对象补丁会merge；省略缺失旧key不能保证删除。因此r2适配器在正常actor.updateEmbeddedDocuments的value.added字段使用common/data/operators.mjs原生ForcedReplacement，并增加只读内存控制组／正确组反证；原已接受的candidateItems／sourceRows／机械字段不变，不直接修改源集合或LevelDB。共用V1新文件合同810080b0-8aaf-4686-90b1-471d225f9dcd已完整往返、正式执行一次，收据1e8576bf-40e9-4321-a38d-1351515142aa为PASS／COMPLETE；新Macro62009bytes／SHAe5c35a3232e8053519749f92f881462c1f7579c728ce6c37c57136a29316ee12。

新应用派发0f01cf48-3f3e-4b26-ba67-a4facfa87d14／revision1已发送给同一Chrome执行器。准确合同为本树`.local/next-eladrin-takeover-20261002/apply-contract.json`。必须先通过r2内存协议与r1候选一致门，才可Apply一次；新sources7／来源folder1、准确8个Actor Item更新、原40 Item IDs及机械字段保持。成功后普通GM页重载一次、只读Verify、七授予／现有出神四小时句与季节条款实际UI／截图、90 Macro IDs恢复与owned页关闭。失败保留原件及owned对象，不重放写入。派发时永久来源／角色写入仍0，实际操作状态待回执；全程Chrome，不追加Computer Use、玩法矩阵、模块升级、发布或已排除范围。

### 5.13 本轮非暂停运行收尾闭合与最终雅灵接受

**雅灵明确替代恢复ACCEPTED；本轮已批准运行收尾闭合。** 新独立执行器用正式Chrome完成完整输入和15项零差异真实schema；r2编辑器保存门阻塞后，父按用户明确授权在同一正式Chrome接管准确出生页651338411，原生编辑器粘贴／Save／Reopen取得完整r2。全批Computer Use0，不操作1840510，不复用旧父回调或重放旧合同。

正常API创建7完整来源和来源folder f83b23bd5ae4d797，初次更新8个原Item。r2原生操作符在本次精确嵌套value.added路径实际传输被保存为普通编码对象，整个Actor差异门失败后停止。父保留失败原件，先证明唯一未解差异是授予map，再正常API仅更新原种族Item的完整system／recursive:false一次，source再创建0。没有重放整批、手写运行中数据库或删除原对象；不将内存协议PASS当作API传输PASS。

随后普通GM页重载一次并正常Gamemaster重登，只读Verify及独立最终字段比对PASS：整个Actor hash06d567ac101131a4a5253855f9b3658acf38444a13098267e359a60fc2e50067等于最初批准预期，原角色40Item IDs与世界294Actor IDs保持，7configuration/value源一致且失踪旧key缺席。世界Item206→213正好为7批准来源，27个旧来源hash保持；六原能力机械字段／现有2024出神原文保持，出神只追加MPMM长休换季句，原种族说明仅修失踪出神链接。

真实原种族Advancement七项及修正正文链接打开准确sw1tLIZrkxRBFoWL的界面已AX／截图／父看图接受，显示原四小时句和新增季节条款。未实际长休、切季、投骰、level或扩展E2E。重载后console error仅有指定保留诊断副本LN5PLqTTdx0l7o7w的identifier错误；无雅灵初始化错误，不删除副本来清零，不扩大为全世界零错误。

出生Macro WOZGet3eB4U4OisM正常UI精确删除，完整前91／后90 IDs等于原基线；出生页651338411关闭且缺席。7source及来源folder保留为恢复成果，PID39148／30002／cor-cotn／14.368／6.0.5保持；无待派发／回调／临时清理。最终独立接受及全部原件指纹在F盘同批证据根parent-final-acceptance.json，详细失败／纠正和边界在雅灵专题最终段；过早Preview采样不能作应用成功证据。

源投影6项与工具类型通过，V1复用且源码未改；没有重跑已接受E2E、全仓CI或覆盖率。总表／专题与受影响手册同步留在原树，既有240路径与空索引保护。源码发布及对应整合仍未授权；35原关闭、37付费、6暂停及Mirror／生产／备份／额外实例／长时边界保持排除。本轮限定闭合不等于这些未执行层级通过。

### 5.14 用户新要求的此刻线上／Mirror／Next运行包对账

原批准范围的运行收尾已完成，但不等于Next完整覆盖此刻线上启用包集。用户新要求只读当前运行包，当前模块管理器原件已父审：2026-10-02上海18:39本地、18:46线上，Next cor-cotn／14.368／6.0.5为94启用／8未启用；线上cor-cotn／14.364／5.3.3为81启用／107未启用；Mirror当前fvtt-v14-module-matrix／14.364／5.3.3为12启用／102未启用，正在被其他任务使用，不切回旧cor-cotn。所有数量是未修改checkbox背后的当前module.active，不是仅磁盘或旧保存开关。

线上启用而Next未安装8项：Cze and Peku - Swamp Graveyard／czepeku-262-swamp-graveyard；Cze and Peku - Depths of the Festerwood／czepeku-29-depths-of-the-festerwood；Universal Battlemap Importer／dd-import；DND5E不全包／dnd5e_classpack；DND5E城主工具包／dnd5e_DMTools；Dungeon Strugglers／dungeon-strugglers-collection；框选Token同步／fvtt-selected-token-sync；Plutonium CN／plutonium-cn。其中两图包和城主工具包在Mirror也未安装；Token同步当前Mirror启用，其余Mirror已装但当前未启用。

当前Mirror启用而Next未安装3项为JSON Forge、Token同步、Trigger Engine。JSON Forge／Trigger／Dungeon Strugglers／Plutonium的原暂停不因此解除；Token同步／Importer／不全包在原Mirror cor-cotn基线为关闭，本次线上实际启用是新的来源差异事实。Cze地图包及城主工具包不在原Mirror安装基线，不能用旧基线证明已迁入。若用户要求覆盖这些8项，就是新的迁入范围决定；本次没有安装／启用／下载／功能测试授权。

Next启用而线上未启用21项，Next启用而Mirror当前测试世界未启用85项；完整名称／ID／版本、三环境未启用清单和225行状态矩阵见[实时对账专题](../reviews/2026-10-02-servernext-live-modules-comparison-and-wall-tools.md)。Next8未启用均为既有付费包，另Demon Queen磁盘有manifest但当前管理器无条目；仅记录状态，不追加签名修复或付费内容测试。

墙线工具Monk’s Wall Enhancement14.01在Next和线上均已启用，Mirror当前未启用；官方minimum／verified14、实现系统无关，用户描述最吻合自由手绘墙／Drawing转墙。ADT14.0.0在线与Mirror已装未启用，Next未安装；DF Curvy Walls13.0.0仅线上未启用，官方仅verified13.351、未有V14声明，不能据此断言必然不支持14。所有墙线动作未实机测试，本次不画墙或改Scene。

只读Chrome复用同执行器、实际6.1-sol／medium／Full Access，生产登录由用户正常完成。所有出生审计页清理，其他任务Mirror页未操作；无Save／checkbox变化／Macro创建／世界写入／服务启停／LevelDB操作，Computer Use0。旧线上认证阻塞与新成功收据分别保留。F盘module-live-comparison-20261002/parent-final-acceptance.json确认三环境清单及差集，真实生产主机／凭据不入仓库或报告。

用户后续询问两项dnd5e6适配可行性，已只读评估：[DND5E不全包](../reviews/2026-10-02-dnd5e-classpack-dnd6-feasibility.md)当前本机v14.2锁5.3.3，上游4.4锁Core13，不是Next现成兼容版；[框选Token同步](../reviews/2026-10-02-selected-token-sync-dnd6-feasibility.md)自有0.1.0同样锁旧组合，通用HUD／移动接口仍可复用，但6.0.5分级状态的ActiveEffect更新和右键减级需实际适配。两项登记为可适配／未实施／6运行Untested；没有改包、安装、启用、世界写入或解除原迁移排除。

### 5.15 原迁移收尾之后的新适配范围与执行顺序

用户明确取舍覆盖此前对这些对象的范围判断，历史清单和第5.13节已接受证据不重写：

| 对象 | 本轮决定 | 当前状态与下一步 |
|---|---|---|
| Cze and Peku两个地图包 | 不重要，不列本轮完成门 | 不为完整线上包集对齐补迁地图；未安装事实保留。 |
| Universal Battlemap Importer / dd-import | 核官方说明，不做额外dnd5e6适配 | 官方6.1.1清单及Foundry模块页明确Verified14，无系统关系限制；源码处理Core场景/墙/门/灯光。Next尚未安装/启用，官方支持与实机接受分开，见[官方核对](../reviews/2026-10-02-universal-battlemap-importer-v14-official.md)。 |
| DND5E不全包 / dnd5e_classpack | 本轮限定内容适配、代表UI/重载及精确清理完成；未发布 | 保留4.3.4原规则、21合集名称和文档/UUID，复用已有V14修补，不合并4.4的new-icon→spell或自动世界改写。21合集/5655顶层/13303可达原记录及18原孤立行、5530原生投影已通过；原单次迁移FAILED保留，单效果修复后另写COMPLETE恢复收据。歌利亚三授予、游侠一级PHB宿敌/自然探索者、头盔入口及Cancel通过；石之坚韧max修为@prof，正常长休/一次真实使用通过。批末精确清理已完成，原世界与聊天ID保持；手册条目已人工核对，根测试命令与生成检查通过。完整Teleport/受伤反应链/27宏全玩法未执行。 |
| DND5E城主工具包 / dnd5e_DMTools | 不处理 | 保持Next未安装，不因不全包recommend关系自动装入。 |
| 框选Token同步 / fvtt-selected-token-sync | 与其他自有mod一样，最后处理 | 本阶段不修改/安装；已有6分级状态差异记录留作后置适配输入。已有自有模块接受可复用，不从头重跑。 |
| Plutonium CN / plutonium-cn | 不处理 | 不安装、不恢复原暂停。 |
| Dungeon Strugglers | 用户本次未改变原暂停 | 继续暂停，不推断新迁入授权。 |

开工再次核定同一树/分支和空索引，243既有未提交路径保持。Next原PID39148、Administrator、准确app/data/world/loopback30002参数与/api/status active／14.368／6.0.5一致；官方最新三个稳定6.x发布为6.0.5/6.0.4/6.0.3，目标不变。只处理现有Next，不改Mirror/生产，不创建备份/额外实例，不停止他人服务，不直接编辑运行中的LevelDB，不自动发布。当前候选文件和内容审计不等于已经兼容或已安装。

本批新的只读Chrome前检已派发给原执行器01a0fba0-50a4-72b3-af9a-0345c5c55205，dispatch b322ea20-4e89-4b99-8897-eb991ed2aa66／revision1；准确父回调仍为01a0fb6d-4646-7252-99ef-dfd2619ce968。新合同仅正常Next页面/模块管理器读取与配置核验，不创建Macro、不改开关/世界/包、不关世界或停服务，不操作旧1840510。出生页面归属与原生原件存F盘classpack-next-20261002-b322ea20；前检回执待事件返回，不轮询。离线候选由单一实现worker继续；安装及运行合同必须在候选/输入审计父审后另立，不重放旧雅灵或迁移合同。总表/来源手册在候选稳定后一次同步，当前不以作者review冒充候选或6运行接受。

只读前检回调7fac1164-a944-43f1-98b4-111d439fac8b已正确送达，父核原件与此前94集合逐项一致；102条manager记录/94启用/8关闭、classpack缺席、DAE14.0.14+servernext.1与Midi local.10均实际active。实际新turn_context为6.1-sol/medium/danger-full-access/never；仅新owned651338501正常GM登录并保留，其他页未操作。PID39148与UI/API版本一致，持久写入0；父接受原件为同证据根parent-preflight-acceptance.json。候选来源审计仍需修正记录/真实文档计数、检查嵌入宏及6严格schema；此层未接受，不安装或启动合集迁移。

本批只读检查Macro已准备，3009bytes／SHAa22f5ddc441752b485c065b1a24c201a2ad42d19b2abe950dc7bab37da71831c；复用既有DialogV2原生textarea回执与V1文件合同，不调用迁移/创建/更新/删除/设置写入。共用V1在本树完成prepare→ready→execute→collect，文件收据de1f4ce1-c088-43df-acaa-9f8b353c3fe4为PASS/COMPLETE，仅接受语法和静态调用边界，运行仍NOT_EXECUTED。首次PowerShell参数/数组构造错误被V1前置拒绝；修正准确argv/两个独立candidatePaths后才取得成功合同，失败没有派发或世界操作。候选初次离线报告的13559是LevelDB记录（含文件夹/嵌入命名空间），不当作玩法文档数；12独立Macro补丁已复用，嵌入宏/内部UUID与严格来源接受继续等待最终输入审计。

后续全量输入审计明确：5655顶层文档、13559总记录（含7904嵌入/文件夹记录）、39014身份位置，21合集/既有ID保持；0本地图资源缺失。已完成12独立Macro与13个Item的15个嵌入命令字段的旧API修补，原语法问题不混同于玩法接受。传送头盔仅修失效Cast UUID，正文已明确现存Teleport；其余源引用父审中。实现worker因模型容量限制中断，候选/原件已保存，主控接手同目录，不重跑既有迁移。

用户已明确选择“先完成6.0.5兼容和明确修复，缺失自定义对象单列后续处理”。本轮不重造Dust Devil失踪召唤Actor、日魂宗失踪辅助法术或其他无法确认原实现的自定义对象；其源规则/坏链保留并列未接受边界。普通现存同源对象的确定引用修复继续；版本兼容、受影响代表行为与这些原缺陷分别汇报，不将原缺口计为已修复或把部分支持扩为全包玩法。

离线候选4.3.4-next.1冻结后，15项聚焦测试通过；独立review的Advancement真实储存规范化与准确重复效果删除重载两项P1已修复，代码无剩余P1。六组同源旧引用17字段与头盔Cast1字段有原文/哈希门；残余33审计条目不宣称修复。3337文件仅安装至原Next此前不存在的新包目录并逐文件SHA读回，安装前EEXIST空目录失败与本任务空目标恢复分别留证。详见[候选专题](../reviews/2026-10-02-classpack-next-605-candidate-and-runtime.md)。

登记合同624061f4回调030ed053-8cbd-4e2d-b200-df00981e5f87在正常Return to Setup之后发生Chrome传输阻塞，后续Launch/开关/Macro/前检/迁移均未执行。主控按用户既有fallback授权用当前正式Chrome接手，正常启动同一cor-cotn和GM登录，只启用本包并正常重载；实际管理器103条/95启用，精确原94+本包，旧8关闭保持。PID39148/Administrator、Core14.368/dnd5e6.0.5保持；Computer Use0，服务stop/restart0。出生651338506在/game，旧出生651338501仍在/setup待同批精确清理。root-activation-receipt.json及截图位于同F盘证据根。

新只读合同70e3e9c6-a984-4d9a-bef4-1ef492347ec2/revision1复用原执行器与3009byte探针/V1收据，禁止重做Setup、模块保存或包迁移，改为正式user.openTabs精确claim当前出生651338506。只读严格模型与全量源差异待运行；未创建测试角色，合集迁移、代表导入/授予/活动UI、迁移后重载和临时对象清理仍NOT_EXECUTED。手册待候选运行结论稳定后语义复核和build/check；未自动发布。当前Git详细-uall为263路径，空索引，既有dirty未reset/stash/删除。

只读合同回调e8670ef8-b218-486d-9100-c22c6543b5ab为命令整文件SHA末尾LF差异阻塞，Execute0；唯一出生Macro7Bm4CY4NMBNjvKHx，原90 ID加此宏=91，其余ID保持。正式Chromeclaim651338506成功，旧出生651338501确认同Next/setup后关闭，正常服务/95启用保持。父逐字节核对两次UI读回3008bytes/SHA9f9a3864a9a3df6901636119af02a9f96bc70485e1df4c8ff37ee76282746ffb，仅为不变3009byte原件去掉最后一个LF；Core14.368的Macro.command为默认trim:true StringField，保存规范化有源码依据。独立规范化文件node-v24.17.0 --check PASS，原V1输入和旧失败原件均保留。新合同132b9ef7-b2e6-4fcd-9796-f2009f1234e9/revision1只复用此出生宏、核对固定3008byte全SHA后单次执行，不宽泛忽略空白/hash、不新建宏、不迁移/导入。严格模型和源差异仍待真实回执。

该次实际执行回调dde135c0-d8d0-4a1d-862d-3067da489df8为FAIL_READONLY_SOURCE_IDENTITY_GATE：BackgroundFeature的Q5zSBfn4T0IH52mK“我来修好它！I'll Patch It!”正文投影SHA与冻结基线不同，preflight在next-migration.mjs:222停止。39464byte readonly-schema-native.json保留；Actor294/Item213/Scene65/Macro91/Table12/Journal67完整ID前后一致，迁移调用0/持久写入0。未把已知其他角色初始化警告归因为本任务或清理他人对象。父仅在已关闭的离线候选DB读取精确原记录，原中文规则存在，运行DB未操作。新只读诊断合同cc45e07f-a04d-401b-9edd-3665d4570092复用同出生宏，取得精确loaded/prepared正文和全量合集ID/strictschema；命令3603bytes/SHAc639c8f83a79c199020437d2f56c57989bdbdf4fe8aef8c5634f6f1c815cf2e2，V1新文件收据a7cf1233-a657-4dfe-9ab2-89287ed02f13 PASS/COMPLETE。来源门保持FAIL待诊断，后续迁移/行为/重载/清理未执行。

诊断回调a868fc03-d922-4f77-8deb-4b21c0ef2fb6：真实21合集/5655顶层、strictvalidate/dropInvalidEmbedded:false失败0，世界完整ID保持。209187byte完整原件SHA238b46340366201d4388d08753937dbe27fdb337810a0623938a6bb9573086c2经DOM分段读取及总长/JSON验证，早期单字符串截断不用于接受、没有第二Execute。父逐字段证明原正文及每个原text路径/值不变，差异仅模型新增6个空描述/Midi条件文本字段；原sourceFAIL保留，不由诊断PASS替代。

修复preflight投影：baseline绑定所有原textFieldPaths，每个原路径（包括原空字段）必须存在且原值SHA一致，仅允许新增空字符串；非空新增/原文改变/原空字段删除均拒绝。离线metadata刷新对13321原textSHA逐项验证不变，不更新包数据记录；新增实际形状和三个反例后安全脚本test:classpack为16/16 PASS。独立review复核全13321路径及源码/候选/manifest指纹一致，无剩余P1/P2。只更新原Next的source-baseline.json、scripts/next-migration.mjs、module.json三份元数据并读回：manifest aee90f5b183625c8f0b0249bd83cb53ae0f822ca8af676fab04922efe5f72cfc，runtime09e69b528ab27e22f4f9497ca9b22b7499d46aabd7f33d9a3b40e26770a66ded，baseline94e4406f4566de8188e04bdb1dbcd3828b7e36614aa8d09d632654cd637dc141。PID39148/Administrator、唯一30002/原world/版本仍一致，服务操作0、LevelDB记录写0。新修正前检合同将正常重新加载此metadata并复用出生宏单次检查；来源修正后的真实PASS、迁移、代表行为和最终清理仍待执行。

后续修正合同25fb63b2回调592cbd0b-15f4-4f9c-9029-9d9fd2750a27在正常ReturnSetup后再次Chrome读取超时、世界active=false/PID39148保持，Launch/修正前检均0。主控按既有fallback用新正式Chrome出生651338513打开Setup并正常Launch同cor-cotn/GM登录，未停止进程。复用bornMacro7Bm4CY4NMBNjvKHx、原90ID保持，单次修正前检在职业能力YWPe5vOpsEEhdAET正文处停止；新的全量只读诊断一次覆盖21/5655/13321，schema失败0、世界完整ID保持，1100315byte原件SHAced9c43e81e4645f3481a16e08961736f9b3ba5feaf3df9d154333092c6f56e1。全部差异为264 text、4显示name、14 Advancement、39 UUID、18不可达物理效果行，未自动丢弃或恢复对象。

全量原源/精确代码对照明确：174 TableResult旧text迁为description；88文本差异仅HTML空元素序列化；1条件表达式仅尾空格；1 feat空旧unidentified字段不在新schema。4名称均未鉴定展示，原toObject名称保持。18效果物理行原本就不在父effects数组，保留原物理行/哈希/父引用证据、不要求它们在运行时成为效果。14类/子职的37新增Advancement与额外UUID来自已启用Tasha4.0.0的initializeItemSource，离线以精确脚本SHA1d20c987899ff3c8d1fc67e2c9b91e93dbd942daeb1899250b3b14e4fed4d8af逐原源推算，不复制运行结果当基线；仅实际启用/insertOptionals/版本/代码SHA相符才采用该固定投影，不测试或迁移付费合集。空UUID不当作有效目标，其余原ID/规则/非空UUID仍逐项保护。

唯一非空UUID缺口为MPMM歌利亚dI68QjTEhKniIhvL的旧Actor.KjgPT4UMHpsUWB95.Item.JlnMw6egm8IM52KF。原规则d12+CON、PB次数/长休与同包已有BAX4NWZ6iTLGgf31完全对应，不用PHB仅一次/长休版本；离线候选只修此Item的正文和授予2字段，并以源SHAe3e592a9cbbf07552f4799ce5057c1a27f32892af3aa8ae3abdc300cfa262a71限门。主控正常API第一合同在写入前因误断言两条grant停止；真实只读结构证明6schema仍有3条、非法uuid为null且sort0。旧失败保留，修正合同b3d2e8e6/V1收据7f5ace98-803c-459e-ac09-3f3f33462241之后单次Item.update成功：2链接字段更新、其余字段独立投影相等、锁恢复、世界完整ID保持。parent-goliath-known-repair-acceptance.json记录实际1次包文档更新，没有Actor/世界Item/Scene新增或迁移调用。

综合来源projection revision3的safe test:classpack为21/21 PASS，独立review无P1/P2；TCoE静态ID/去重路径对当前原源可复用，仍须迁移后回验。原Next三份metadata再次精确更新并读回，未编辑运行DB：manifest c7cb37081597ef055146aeac05a8567c5aeaf48462475b5f2eabef0db89d0136/runtime c6cfe3fbded065dd311a21f48e0b74dc4996551da89140b923b5e3f256f1ccff/baseline3438b747847ab4e38130e689d1e5df4f24e3351c646a573dd72633aa99e6c11a。预期13,303可达源记录+18已记录孤立行=13,321物理源记录，21合集/5655顶层身份不变。当前修复与metadata安装接受；综合真实前检、正常API16合集迁移、代表导入/授予/活动UI、迁移后重载和最终清理仍待继续，手册待最终语义复核。

2026-10-03持久化纠正：正常GM客户端刷新后才成功关闭原world，同PID39148保持；新出生651338517正常Launch/登录，综合前检在歌利亚AdvancementID处FAIL。后台旧数组储存接受局部ID路径更新时，实际只保存VPO配置，内存前后相等不足以证明持久化。父保留39460byte失败和实际单ID结构原件，其他字段与任务前六项快照完全相等；原“两个字段修复内存接受”因此不算持久化接受。采用同Item完整system更新diff:false/recursive:false，随后Core官方pack.getDocuments({_id})强制后端读回：原六项定义及所有持久字段恢复、锁与世界ID保持。原始ok:false仅因SourceField.prepareData派生的bookPlaceholder/label/value/slug未持久化；精确源码38–52行和逐字段差异证明只有这四个展示属性，父独立语义接受另存，未覆盖旧报告/再次写入。原无效嵌入Item handles辅助不适用于正常合集Item，本次未套用或改其实现。恢复V1收据9d8fb05d-57e3-417f-a7ae-d5c55585ebe7，证据parent-goliath-storage-semantic-acceptance.json；至此同Item实际更新2次，完整合集迁移仍0。

迁移写入前的精确系统源码复核又发现bypassVersionCheck:true会无条件重写规则为2014，已改false并增加显式原source.rules比较和旧版本2024前置保护。全13321离线来源实际2014标签9185/2024标签2520；其中1987旧stats的2024内嵌Item（monsterspack1983/summons4）即使false也会被原生批量迁移重写，不能用包版本4.3.4代替逐文档stats。当前Source-preserving官方迁移辅助由单writer实现，使用官方migrateActorData/migrateItemData/getMigrationData，写入前保留每个原明确规则标签、完整源API更新及真实后端回验；未直接编辑运行DB、伪造stats或先写坏再改回。规则前置回归后safe test:classpack22/22 PASS；projection4候选指纹c10411ba5357357572ca5874021b4d56115bb5891fb167e122c5e5b089e760b3/020e2666d37360ba897fd05c62e6be28ebff9efe85cd05e6c38ef7be4a090461/c0c9e6d9eb327cfd6e8945dcda9668875fdfe3b9a862c11b111362ab1cbcbc75仅本地候选，未部署该轮。当前目标仍revision3，world active/仅GM/原95模块，Macro7Bm4CY4NMBNjvKHx与game651338517保留；完整来源PASS、16合集迁移、代表行为、重载和清理仍未完成。

2026-10-03迁移适配层projection5：精确Core真实mergeObject/ForcedReplacement/ForcedDeletion回归、投影及后端Actor/Item/effect/Advancement集合核对、正常deleteEmbeddedDocuments删除准确重复效果、未审查新effect前置拒绝已实现；独立复核无新P1，DataModel.validationFailures空容器按fields/joint实际非null判断修正。3Actor包只读原源审计为914Actor/6223内嵌Item/247内嵌effect，符合或仅版本阻断的spell/scroll transfer均0。safe test:classpack31/31 PASS；中间29PASS/1FAIL是未刷新候选合成代码SHA门，刷新后三者绑定通过，失败原件不掩盖。Next仅三份metadata正常更新：manifest8b12a33687e9d0312c9abf5dd1b564aee1d3f799d1c0c7010fef1abfb3d152a0/runtime38e308f0a1467d65c57951a9fca173f7471060dab1e981e58ee48f45fc34b1bc/baseline3b240c987c1323a2ad02976719cd1509f2e4a15260def0aafb575df56db52877，DB记录写入0。正式Chrome正常关开同world及GM登录，PID39148保持；新只读合同9ab55022-ddde-4e79-bd6b-b15d569b4f33重开原出生Macro全文3008byte/SHA9f9a...核对后只执行1次全来源及全部原生投影，正在取实际结果；完整合集迁移仍0，行为/最终重载/清理未完成。

真实r5来源门PASS原件2340934bytes/SHA48f5bf4ebd0056783ac49162694ab81f4a6c78e363697cedbaa6f3729533fac5：21合集/5655顶层、13303可达+18原孤立、5530原生投影、1987旧stats2024保护、世界六类完整ID保持。另保存1个游侠TCoE findContainingGrant plain-map.values钩子错误；该源PASS没有升级为无错误运行接受。独立从14原源复核363→400进阶（37附加）、重复初始化及map→array→hook→map全JSON字节14/14相同，聚合SHAd27bcdd6babb7c7ec3691448eb908a2e4cde8fd3f4eb76e3c9745ab7d4dac4ee；只有classes-new/6Ce5hGue5OSI2jKj需精确数组输入，13其他仍map。r6正常候选与wire仅该UUID+TCoE启用/setting/4.0.0/源码SHA/来源投影匹配才转完整等价数组，键与内部ID逐条保护；每doc构造/后端再核原文与grant/spell UUID。paid代码/设置/功能不改。33/33 safe tests PASS，限定review无新P1；r6 manifest305a1c0ef5dca1d06b8553ca1b6a21677cbb21cccb0f191c77e1158a8d9d2e8b/runtimea9fcec80ef05d09a5b06501857c6f194194071d4d513bf863b324b3ba60f1917/baselinef5176acb9bd772f559220d85d874b0cc67fc6510753d9f122332dd78117f3644已Next三文件读回，记录写入0。正常关开同world/空密码GM登录/Chrome AX最小往返PASS，PID39148不变/仅GM1。
新合同6ef96156-dd0b-4d35-a579-280d9b213be2已原独立执行聊天01a0fba0-50a4-72b3-af9a-0345c5c55205原生接受：先r6实际全源+零新相关钩子错误门，满足精确谓词才正常Macro UI单次api.migrate，再正常客户端重载完整来源后验。3204byte迁移consumer SHA98c53158f18bfecc1b8f51e0405702fbea6db6aa1076d7633962e40a72adaf48，V1文件prepare/ready/execute/collect收据54b657dc-9956-462f-a2a4-6c89b58460d3 PASS/COMPLETE并已父文件审阅；这不代表实际迁移。父派发时完整合集迁移仍0，后续以新回执实际完成/失败点修正；禁止旧合同、清收据整批重放及服务操作。执行器保留Macro7Bm4CY4NMBNjvKHx与出生game651338517供随后代表UI/批末清理，当前正常API迁移/重载回执待返回，代表行为、最终清理、手册最终语义核对未完成。派发后父不监控，当前dirty268/索引0/HEAD61974058/分支codex/20260919-151319-server-next-migration，无commit/合并/push。

6ef96156执行器回调fed28e74-23c7-4875-add3-a1550a9246f4明确阻塞于517仍属于父Chrome session，实际6.1-sol/medium/FullAccess/never及服务/仅GM已核，宏编辑/前检/迁移/reload/服务操作均0。父读取正式Chrome生命周期文档，无即时跨session release/transfer接口；正常核对并close本批出生game517成功，原世界与Macro保存源保持。新合同c2833431-63bb-42e4-b6af-ef32a8cf548e已同执行聊天原生接受，授权其在自己session只新开一个同Next game客户端页面并保存出生归属，再继续相同r6真实门/条件单次迁移/客户端重载；不用旧517或旧合同，不关开世界。父仅此页生命周期恢复，Computer Use0/DB及服务操作0；新的source/migration/reload实际结果仍待回调，代表UI/批末Macro与新出生页清理待完成。

执行器392040fa只读诊断前的失败更新：c2833431回调6cfea95d-3740-41bc-84f3-9cdf46395adf，新出生538正常Chrome/GM/95模块、r6只读全谓词PASS原件2341047bytes/SHA201830a01e62ad4bafd158c6b2d43dc33602d83ddfc0924b3a64a2a0c4b2982f。单次3204byte工具正常API迁移已实际处理21包（16Actor/Item共5530，DAE分包计数留原件），run efc058ea-3168-414b-84d1-e5a4f7da1636最终FAILED post-migration-identity-validation：只报summons/秘法眼4XOCbibDwZcdgbhV原静态隐形dnd5einvisible00消失，added0；原作者效果物理源SHA6349e630c39d2d9922a29c709f932cf60a2376ba975f1ff531727d98b72ffc5e，不是重复删除豁免。失败原件45201bytes/SHAcbc0682a0e3bc299e270bd0046e4501893953b5a72961bc3559eb0b05a8d5d9b；世界完整ID保持，sourceAcceptance未到，pack锁完整证明失败branch未返回，客户端reload未执行，0整批重放/清收据。此前r6无新钩子错误门已被后续3个TCoE错误supersede。
源码因果已具体定位：Core14.368 client-backend.mjs203–226 cleanData migrate:true发送前把adv数组强制map，所以r6传输形状不解决后端重构游侠TCoE.values；公开top-level pre/source setup post hook可限定兼容且保持真实存储标志。另DAE迁移更新秘法眼免疫effect9ho...→queueStatusesReconciliation/schedule异步→ci.all含invisible→删除静态输出effect，缺少合集Actor隔离；不会用允许删除表掩盖。两个文件側修补正准备，不改paid代码/规则，必须实读确认与限定恢复后再接受。新只读合同392040fa-8d4e-4395-b923-df34a041fe26已原执行器接受，复用538/出生Macro，核全源及两对象/设置/无效集合字段，不做恢复或迁移。12653byte诊断SHA09cef8af932f369ce0acf19993e65d4154699042c3d18f5ab13d3cbd123e2dd3，V1文件收据5d6ed02b-81c8-4cc8-908a-4c5fc1d8391a PASS/COMPLETE父文件接受；实际门待新回调，原FAILED保留。

2026-10-03最终暂停收据：只读回调501d817d-1b9a-44c7-a062-44b0d2e91e4a确认全源仅1个effect缺失，21锁true，FAILED原JSON不变；两根因实证。r7公开source双Hook与DAE合集状态隔离已完成，40classpack/4DAE检查PASS、限定review无新P1；五静态文件已安装并SHA读回（r7-static-install-receipt.json），DB记录直接写入0。原39148退出，父只在0监听/0Next进程后以原参数启动同实例PID72360，停他人进程0/备份0/额外实例0；暂停快照active30002/cor-cotn/14.368/dnd6.0.5/users0。官方Chrome552/join AX实测PASS后该探针已关闭。6743byte单效果恢复工具SHA977004a9ec0520c6b610b174e18858f5c004a318e3972bd1bb56b7cddbdaf634，V1r2收据7c4b0f4d-655c-40e0-bac5-6b897616438f PASS/COMPLETE；首次文件checker转义失败原件保留。新合同7a79b7a5-c44e-4555-8532-ae7875681bde在用户暂停指令前只PREPARED，未发送/未执行，pointer已PAUSED_FOR_USER_RESTART。Chrome执行器单次即时状态核为idle/completed，原Macro7Bm4CY4NMBNjvKHx保留，只读诊断源尚在，未粘贴恢复源；旧页538/513早晨为/no，不推断重启后身份。当前273dirty/索引0/HEAD61974058，不commit/合并/push。下一步须用户继续后重核Git/服务/官方Chrome和新PID，再新合同进行原效果恢复、独立恢复收据、重载、代表UI、批末清理及手册最终复核。

2026-10-03用户重启后续接：branch/HEAD61974058/273dirty/索引0均与暂停一致，五安装SHA和6743byte恢复工具SHA逐项吻合，不重跑40+4已接受检查。官方Chrome当前技能项/文件缺失，但插件enabled=true、标准browser-client组件和当前node_repl js工具在；父按正式入口成功连接并读全documentation，新814/join完整AX证据已保存后close。Next按原路径/参数恢复PID43196，最初连接拒绝仅冷启动尚在加载世界包，随后active cor-cotn14.368/dnd6.0.5/users0；未停止任何他人服务。新合同b796c62f-8c70-42a5-83bf-129bd7ca7e93已原独立Chrome聊天接受，仍只原效果1次正常API恢复、保持原FAILED、独立恢复收据和正常客户端重载验收。旧未发送7a79b7a5暂停合同退休，禁止重放21包；回执到达前不宣称恢复完成。

2026-10-03恢复结果父审接受：b796c62f回执47082f3c-f10a-410c-818e-24c3097bc349为PASS_SINGLE_AUTHORED_EFFECT_RECOVERY_AND_CLIENT_RELOAD。正式Chrome正常Macro界面只执行6743byte恢复源一次，秘法眼原dnd5einvisible00补回；原FAILED efc058ea全文SHA57d53103…保持，api.migrate调用0，21锁和全部世界ID保持。恢复原件b796c62f-single-authored-effect-recovery-native.json为1264193bytes/SHA12db9e290e5c083b20858e3d226473d43c8cc121077914e77a94878155d5f95c；独立COMPLETE恢复收据明确migrationReplayed=false、原FAILED preserved。正常客户端重载后3008byte旧只读工具回读原件2341248bytes/SHA5e91de57471c2c26505cb7c18676c2f3c0bb62766da2e60ed77d8a1d27de7361，再次21/5655/13303+18/5530、95启用原集合与世界ID均保持，source hook3进3出/pending0/failures0，新相关错误0。实际页651338821属于原独立执行器，原Macro7Bm4CY4NMBNjvKHx保留；此时尚无UI角色fixture，不把恢复当车卡或活动验收。

代表UI合同6850b813-43a9-4a1b-9a40-06482b119cfe已同执行器原生接受。复用acceptance-macro.js生命周期的小型consumer-r2为8331bytes/SHAe766e0d3ab25aa24bad30e673e347250f26adcf3987f6a2298a3d127cfb89c67；共用V1收据70ec9c18-6b17-46e0-9bd8-9f60514efc64文件PASS/COMPLETE，r1在派发前发现17字符fixture ID后退休，r2加16字符校验，未在世界执行r1。先正常UI全文保存和Readback实际往返，再只创建一个CPUI1003ActorAA1角色，按正常UI做歌利亚三特征授予、游侠一级进阶和头盔Cast入口后取消；不API植入期望授予，不新造E2E框架，不做付费选项或完整Cast。本地原BAX4NWZ6iTLGgf31明确uses.max=1、原文PB次数，故当前合同只记录源及导入实际值，次数行为未接受；此项来源明确矛盾待回执后定点修复，不属于延期重造缺失自定义对象。fixture/Macro/owned页保留至受影响复验后批末一次清理。回执、清理与手册最终核对仍PENDING；父不轮询或监控。

2026-10-03代表UI输入门修订：执行器f34d7427回执在任何Execute/Prepare之前发现Core保存宏去掉一个末尾LF；8331变8330bytes，除此全文一致，未创建角色/导入/施法。父独立读取saved原件逐字节确认后保存canonical输入SHAf2673940d82ff3f828149793663423a501111f16b34c8550c57daac2fdc37ab2，共用V1收据0c252495-f895-49cd-97bc-ab9eac32909b PASS/COMPLETE。6850b813 revision2已原生接受并显式替代旧输入门；优先核对已正确保存的现宏，不重粘贴、不重跑任何迁移，继续Readback真实往返与原三条UI。此为工具输入规范化，不是产品行为失败；原阻塞证据保留。

2026-10-03代表UI父审：92d5eabb-25f7-4eec-93bc-2794dec36828原件和两张关键截图已核。真实Readback运输通过后只Prepare一次，CPUI1003ActorAA1出生；歌利亚正常拖入及六步进阶、三source和advancementOrigin保持，STR14/DEX15/CON14。源及导入石之坚韧max1/spent1，actorprof2，原文PB次数，确认为原数值缺陷。游侠正常一级九步后39原AdvID保持、PHB自然探索者已授予，宿敌选择未确认checked，added为空，尚不能归为产品失败；Tasha替代项未导入。头盔正常使用已生成正确Teleport缓存物品HMYrqUc6Bzu2Y3Cz，故修复引用的实际解析通过，但配置窗口/完整Cast未接受，充能3/spent0未变、chat0。最终265625chars/286711bytes原件SHA bede1c06b99bcf503e868c05740288786355022558cecf15b875dbb8d4dc1265；排除本批角色的原世界ID、95模块保持、consoleerror0。清理仍0，角色8Items/原Macro/执行器651338821保留。

父按明确来源修复uses.max为@prof：精确原前像702b3d5a2b7462d6d302c8ccf3826fc48e617149a293c507fba3ec05e1e1cccc，离线候选读回3e67c092ff2be5f58dc27d220e60b8985f7082f5b4a01722ca620335fbc6ee44；还原max后完整原件相同。build增加第二条内容修补，41项classpack检查PASS，runtime/baseline/manifest指纹不变。原spent1有精确6.0.5迁移来源：migratedUses0按max-value得到1，本次保持原消耗，不以人工回满伪验长休。正常API修复consumer5994bytes/SHA dc5e2432e9dc942359766b67bc387677a185db01a218cac30d8c2c18742f8ea7只写源包及现有owneditem两个max标量；UI生命周期8421bytes/SHA484e14a2a8fc2f0f9dc03983a02d7dcfb213a577d05713bb4c45c364820ede84只加worldTime/实际RollToggle只读字段。V1收据2a0f9f7e-dd5d-4700-89b0-125961708c9c PASS/COMPLETE。136d2343-8009-4bb2-bea2-9f26ab9c9ed4已同Chrome执行器接受：定点修复→正常单角色长休/使用→游侠Modify Choices补验→头盔可见入口→一次普通客户端reload，保留fixture待父审。运行修复、这轮UI和清理仍待回执，不重放迁移。

2026-10-03次数修复部分失败：136d2343回执e3c73958-0625-472e-ac75-063728f73d84已父核原生原件。5994byte输入全文SHA一致、Execute仅1；完整源及owned前像门均通过，source.update已返回/sourceWrote=true，随后stored保全谓词失败，ownedWrote=false。repairFlag保留STARTED at2026-10-03T03:42:21.857Z；before/after世界ID一致。原catch未输出postimage与锁状态，故暂不声称它们通过，也不猜变化原因。原件136d2343-repair-native.json为39404bytes/SHA6ece3979258a1d8381cd8bdfbf3faf5f91b9b4a88afde36d9968a6ddfacbd082。LongRest/一次use/Ranger补选/Helm补验/reload均0，fixture及Macro保持，旧修复不得重放。只读新合同6d2ea911-2a5b-42a8-91b1-5afe64fdcc3c已原生接受：2311byte/SHA c51299de6b5e5d957f6a5309b311633155b8bdb6cb6ef761afc7e9c673482747，V1收据40d8385e-5e3d-4977-bd0d-27ff38a25ef7 PASS/COMPLETE，仅正常Macro输入更新后查询source/raw/derived/lock与原收据。所有后续数据写入、清STARTED、玩法、重载及清理禁止至父核实际差异。

2026-10-03只读差异父审完成：6d2ea911回执72e1afc6-20f1-4aa0-ac31-42c5d7900f00，原件73844bytes/SHAabe29b4ed71f056aea9706f35da11d6dc632f77b0c25b869f5d1b00ddb140bd8。source/raw字段max@prof、spent1、lr/recoverAll；owned仍max1/spent1且全字段与6850原件完全相同。packLocked=true、worldIDs/旧FAILED SHA57d53103…/恢复COMPLETE保持。父递归diff只有目标max、mtime及system.source.bookPlaceholder/label/value/slug四字段移除；目标6.0.5 module/data/shared/source-field.mjs的构造schema不含这四项，prepareData明确生成它们，故原谓词误将派生显示字段当作者字段，不存在正文/规则/恢复/其他数据丢失。精确删除白名单仅接受原值empty/empty/DND5E不全包/dnd5e或字段缺省，未知值仍拒绝；实际前后相容、正文变更/规则变更/未知显示值反例均通过V1。只修比较器，不重写已正确源。

38ee6abb-4203-402c-8971-2590f469f9d6合同已同执行器接受：5970byte/SHAf47c08c2e4a1b32e2fe4f643b3c9fdc8a84b9ee3a41c654fc6dc424f5a427bea，V1收据731cdc8e-1ebc-431b-b4a7-37c1de9a2349 PASS/COMPLETE。新工具0 source.update/0锁改动，仅owned物品max标量1次；原STARTED原样保留，另存classpackEnduranceRepairRecovery。PASS后接回8421只读生命周期、正常长休/一次use/宿敌选择/头盔入口/普通clientreload。当前这些实际结果仍PENDING，清理0；旧5994修复与旧合同均禁止重放。

2026-10-03最终限定行为父审PASS：38ee6abb回执b3655e36-884c-488f-a61d-0057c3225592，四份核心原件完整SHA已独立核对，Stone1/2、PHB宿敌勾选和Helm施法配置三张实际截图已目视审阅。owned-only正常API恢复sourceWriteCalls0、max@prof/spent1、history/time/worldID均保持，另存COMPLETE，原partial STARTED不清。正常单角色LongRest→max2/spent0/value2，再正常use1/Consume1→真实1d12+2（d12=10、total12）、spent1/value1；世界时间21085409不变。游侠Level1 ModifyChoices正常选PHB宿敌，actualgrant XUYvaGtJO1WDnQSA，origin88uhoFZZc0ghi6ND.J7PLzrqjw4bzcSpL和added.1指向FxSEAmMXMIcv4iWm；自然探索者、39AdvID、单race/class、原三种族特征保持。头盔展开实际库存行后点击可见Cast按钮，Teleport/MidiUse/Consume1of3/CastSpell真实配置出现并正常Close取消，CastSpell0/Teleport0/chargeSpent0。普通clientreload1后以上字段/95集合/原世界ID/time均保持、新相关error0。核心原件SHA：owned-recovery be06b01d14967e8aa9611667458ccb4b8eda75627851900d104aeb6385fead5c；after-long-rest7b8d4508db53370f928af5cf79c1179192f4aab274acedc12823dc1b85dcdc96；after-one-use8551d2f9de0ed4f7c688ac7ceb47892d357c09fd7428baa301a8055e30978302；after-client-reload80a2fd46eeeddd13bb390e731910102a4a3c592d4bc81385bacb454c119574ab。限定接受不推广为完整伤害反应链、真实Teleport或27宏全玩法。

04a9e7ae-708d-4286-931d-1ceecabd8659批末清理合同已同执行器接受：复用原生命周期，清理仅CPUI1003ActorAA1及9个内嵌物品、消息IBcOL9uzAOMRkm9J与NjpI9MSBp5giWOsP、出生Macro7Bm4CY4NMBNjvKHx和owned页651338821。9079byte/SHA c29bf10a19f448bf4827a4dd194979a17bddeeca7948d5f4abaff72165466c23，V1收据bdcfd857-13f2-408e-aed0-080e4456c072 PASS。Cleanup回执保存后才Finalize，后者先保存包含旧partial flags的临时Macro证据，再删除自身并读回原90Macro/1419Chat/所有世界ID/time/view/pause。原全局FAILED迁移+COMPLETE恢复settings保持，其他历史对象不删；实际清理待回调。手册命令门原先把bun run --cwd误认成根script，已添加可审阅根别名test:classpack-next并实跑41PASS，未改检查器或缩watch；status现在只需核verification-development与server-next-external-candidates。

2026-10-03批末清理父审PASS：04a9e7ae回执f509c9ee-b292-4fe3-8c03-862d6e5d5454。Cleanup1次精确删除本批Actor及9内嵌物品和两消息；fixture-cleanup原件168741bytes/SHA4377a5818214484b08fd18319423ff6b2b451ee06da0d90b24078b2c8007c84e。保存后Finalize1次正常删除出生Macro；最终原件155214bytes/SHA4a42e581fb181758b7fa6e621435f9454d453373f238f7545daaac11a3354888，原临时Macro的STARTED/COMPLETE/UI ledger与完整command均保存在ownedMacroEvidence，而全局FAILED SHA57d53103…与原COMPLETE恢复settings保持。父独立比较最终完整ID集合与出生前基线：Actors294/WorldItems213/Scenes65/Macros90/Tables12/Journals67，Chat1419，active95集合不变，worldTime21085409/viewedScenek0tDQjWqrbvHbjdu/pausedtrue。实际Actor/Macro精确搜索无本批条目的两张截图已目视核对；仅owned821正常close成功、owned当前本批页0。服务核PID43196/Administrator/30002/14.368/dnd6.0.5/cor-cotn active/users0；无服务操作/来源写/设置写/迁移重放。旧未知CodexTemp/NewMacro/历史页未动。当前273dirty/索引0/HEAD61974058，未commit/合并/push。

本轮最终边界：原ServerNext迁移不重跑；不全包基础6.0.5兼容、来源保护与明确修复、三个代表UI链/石之坚韧次数和骰子、限定重载及全部本批清理已接受。Dust Devil及Open Hand/Sun Soul失踪自定义对象、其他不确定内容缺口、27宏全玩法、完整Teleport、完整伤害反应、生产/长时仍未接受。自建mod下一阶段另按已定顺序继续，Selected Token Sync最后；城主工具包/Plutonium不处理，付费与其他排除边界不变。手册已人工核两受影响条目，test:classpack-next41PASS，31项生成/一致性检查通过；页面目视是最后文档收尾，不再进入Foundry创建任何对象。

2026-10-03文档最终边界：8b5b4b72回执07ed7e0b-1d64-4ff4-8636-140561d70b7d。已生成HTML663307bytes/SHA130f5b728442f7968f78d8b86ce26f145732b4c9271884077306fd79646934c8与浏览器合同吻合，但官方Chrome在goto准确file:///I:/…/工具手册.html时明确拒绝协议，仅允许http:/https:，并禁止改通道绕过。故页面加载/搜索/可见文字/视觉截图均NOT_EXECUTED；没有以文件hash或31项机器检查冒充视觉验收。仅本次新owned空白945正常close成功，剩余本批浏览器页0。原件8b5b4b72-blocked-report.json和tab-close.json已父核；未改权限、起服务、换通道或重访Foundry。原不全包限定实机与精确清理接受不变。后续若要补此唯一文档视觉门，应先有正式浏览器能力/许可的真实变化；不能重放旧Foundry合同。追加这项已知工具边界后只更新说明指纹及重建手册，不重复已通过玩法测试。

### 5.16 累积成果的本地提交（2026-10-03）

本轮不新增Foundry玩法或部署：把已审查的迁移运维工具、历史Midi补丁、外部候选和来源/验收记录分别保存为本地提交，并以最后的文档/手册提交闭合。公开源码与补丁、5655条来源身份/哈希索引保留；忽略的upstream/dist、下载包、固定分发测试源、运行中世界、完整浏览器原件及私有资料均不入Git。根package脚本按对应组分段暂存，未用git add .或git add -A。

提交前解决两处可复现性问题：classpack历史报告与新构建报告分开，新报告放ignored dist，已有候选/新报告仍拒绝覆盖；Midi历史6.0.2测试改读原SHA校验的官方固定分发源，不再误读已升级的现行系统。未改变安装候选或放宽目标/来源哈希。相应新检查通过，完整测试及证据适用边界见检查点说明；原实际UI/来源/重载/清理接受继续复用。此处本地commit不等于合并、推送、发布或生产验收。

### 5.17 框选 Token 同步 6.0.5 适配（2026-10-03）

用户明确从后置列表恢复 Selected Token Sync，并选择分级状态“各 Actor 各自增减一级、保留等级差异”。候选0.2.0已按精确Core14.368/dnd5e6.0.5实现：HUD分级串行分支、linked去重、synthetic继承重读、0/6边界和右键事件去重，普通状态及movementAction保留。20模块测试、404Ops安全测试、模块/tools类型、架构、frozen install、32项AGENTS和31项手册一致性通过。安装器仅增加此ID白名单；5文件已首次安装并逐项核对，scriptSHA29da3b9efbe7fd97371311af2bf1eb0e89fd543c4b843fb32fd5d4f4eaee884a，manifestSHA31e57cfaf0c3d1d24059a1cf8a532c729496f74033cf90e59c81c90935698e70。世界内启用与玩法仍待验，详见[本轮候选记录](../reviews/2026-10-03-selected-token-sync-next-605.md)。

旧Chrome技能/REPL会话在工具刷新后消失，用户再次标记当前@Chrome；父使用现行官方Chrome extension浏览器API实际读回登录页，没有Windows桌面控制。初次连接拒绝经核实为原PID43196/30002已不存在；按原本地授权恢复同一app/data/world到PID41112，14:44:30启动完成，未停他人服务、不增实例、不备份、不删锁。父预检页651339016已正常关闭。

新合同90fc9dc2-271d-4d1f-8fcb-9cc945c32ae0已由原独立执行聊天原生接受，回调精确父UUID保持当前任务；不重放旧合同。复用既有生命周期consumer与V1，最终输入11856bytes/SHAd5799286143f5760c9797ba585563a0df6d56316c816ab495360f617912e6468；V1收据a9a3e159-cf0f-4fae-bc61-3e65e4811494文件PASS/COMPLETE，首次检查器语法失败原件保留。仅3NPC/1非活动Scene/5Token/1Macro，真实HUD验收每Actor等级、0/6与快速操作、普通状态/overlay、移动、程序化负例、双客户端和重载。权限真实canUserModify与完整PlayerUI分开；完成前保留自有fixture供父审，再批末清理。当前实际HUD与清理PENDING，父不轮询。手册目视继续按用户选择延期。本阶段尚未commit/合并/push。

2026-10-03父接管与最终接受：原独立执行器回执2b446f47-eec7-4e15-bb92-c643fca18f2b证实未暴露当前CUA Chrome接口，浏览器/世界写入均0。父按用户先前明确fallback授权，以新接管合同a01d08b8-dcbe-48c8-ba6b-aa41230d02e0使用当前正式Chrome浏览器API；Windows桌面和rawCDP均0。实际模块管理器104注册/95启用→仅本模块加入成为96。21项限定GM行为与25份原件父审PASS：普通状态/overlay、每Actor分级增减、linked/synthetic、0/6、快速0双击与1→0→1、程序化负例、fly/default-null、双GM客户端无重复、普通重载。默认派生walk与源null已按Core精确源码及实际toObject读回分开；仅升级consumer只读字段r4=11914bytes/SHA7154927cced6c71220b66e9ef29b1288a70e8e8156ff40006904e8ed48e3a28f，V1e62503ab PASS，不改已安装bundle。

批末Cleanup正常删除3NPC/1Scene/5Token，Finalize保存完整macro证据后删除f2MxtXaP3G5gCujz；217273字符原件分5段完整取回，不重放Finalize。最终原世界IDs为294Actors/213Items/65Scenes/90Macros/12Tables/67Journals/1419Chat，time21085409、viewk0tDQjWqrbvHbjdu、pausedtrue保持，client开关恢复false，模块保持启用。实际主标签651339025、观察651339053、父预检651339016均正常关闭，自有标签0。最终原件SHAeed169f29d8b5a13b1c7ed1871132d3dd1c9c13082776991c23e30b6383eef4d；审查SHA8dc409df762efd39d4670599619af3f6844e2b511d36a1a47bc5d7610231c89a。原旧测试副本LN5PLqTTdx0l7o7w/f8e17a7b397a98b7的identifier错误与2026-09-28记录完全对应，按原要求保留；本模块相关新增error0。

本阶段功能/限定实机/清理闭合，Next服务PID41112常驻。未接受完整玩家角色UI、生产与长时会话；手册目视仍按用户选择延期。已同步限定支持矩阵和健康状态，无本轮commit/合并/push。

### 5.18 四自建模块独立迁移接手与 TE 第一阶段（2026-10-03）

用户已明确恢复 Trigger Engine、Custom Conditions、Weapon Mastery 与消逝灵魂1.1.0配套升级；这条新决定覆盖上文针对这四项的旧暂停，不恢复其他暂停范围。实施 owner 为新独立聊天01a100eb-e2ed-7291-b60b-32550657b4c3，实际gpt-6-astra/xhigh/Full Access；新树I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-164211-next-four-modules，codex/20261003-164211-next-four-modules，自已提交master ec083529建立。业务与专题记录均在新树，本文件继续作为唯一总表。原迁移树23个交接SHA全部匹配、索引为空；此次仅追加本节，其他22路径保持原字节。

官方最新稳定6.x仍为6.0.5，实装Core14.368/dnd5e6.0.5；PID41112/Administrator/30002/cor-cotn/active=true/users=1已核，不称空闲。复用SelectedTokenSync最终接受的96启用集合，逐项读取当前磁盘manifest版本失配0；当前客户端启用全集尚未新读，不以磁盘证据替代。没有系统升级、服务启停、模块安装/开关或战役写入。

四模块接口已核：TE公开Actor/Combat及外部武器事件，CC拥有伤势，IFS1.1.0仅复活；Next仍装IFS1.0.1，须作为安全组合统筹升级，避免双伤势所有者。CC6.0.5仍仅伤势门，19种通用状态和weaponEffects/WMP仍锁5.3.3。本阶段未宽放这些门，也未从旧Vex/PENDING重跑历史验收。

TE发现异步等待期间活动GM切换后旧客户端仍继续执行的真实代码缺口：新增3回归在原实现均FAIL；补充等待后的订阅/事件/宏/因果回写验权并加2项Combat分支后，TE43 PASS，CC128 PASS，IFS56 PASS，WMP260 PASS；模块类型检查、三包build/ZIP逐文件对账、frozen install及30项手册一致性通过。TE0.2.0候选runtime SHA914db6e69d5477e7610c9249f7a691c77e716552e641a13734a094c260883df8。以上只是本地代码证据；用户宏已经执行中的直接写入不能被引擎撤回，此限制已同步README和手册。

复用原Chrome执行聊天01a0fba0-50a4-72b3-af9a-0345c5c55205，dispatch preflight-01a100eb-r1/revision1，回执a9fae585-cb6a-4d8a-95ad-355851126b92已送达准确新owner并父审。实际6.1-sol/medium/danger-full-access/never通过；但父与执行器注册表均缺当前mcp__cua_repl/Chrome extension browser入口，最小浏览器往返NOT_EXECUTED。只有旧browser-client磁盘文件不当作当前能力；Desktop/rawCDP/旧client导入均0，无出生对象或服务遗留。本阶段为PARTIAL/工具能力阻塞，不是网站拒绝或模块兼容失败。

唯一下一步：同一执行器恢复当前正式Chrome入口并完成最小往返，再正常API预览当前伤势flags/设置/投影/冲突与世界基线，冻结三模块组合安装合同，执行TE+伤势/复活窄验收；之后CC十九状态、WMP与联合收尾。新树[第一阶段专题](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-164211-next-four-modules/docs/reviews/2026-10-03-next-four-modules-stage1.md)及.local/next-four-modules-20261003保存原失败、源码/安装manifest证据和前检收据。首次安装保护工具未从原树复制，待必要最小复用时绑定精确文件/SHA。未commit/merge/push；手册目视仍按用户决定延期，Mirror/生产/长时均未执行。

用户随后明确要求新的独立Chrome执行聊天以避免旧上下文干扰，仍固定6.1 Sol/medium，并显式指定[@Chrome](plugin://browser@openai-bundled?browserFamily=chrome)。旧执行器01a0fba0-50a4-72b3-af9a-0345c5c55205已通过收据b391988f-4cf5-4e1b-a648-2b68ddf382fa确认停止，无在途操作、owned页/Macro/fixture/世界写入均0。新建独立执行聊天01a101cc-b72c-7571-ab86-d3af20bc102d，dispatch fresh-chrome-01a100eb-r1/revision1；已开始本轮配置、当前官方Chrome连接及Next只读环境前检，实际配置/连接/模块清单待回执，不称实机PASS。这项用户决定替代上段复用旧执行器的下一步，回调仍为实施owner01a100eb-e2ed-7291-b60b-32550657b4c3；新树.local/next-four-modules-20261003/current-chrome-executor.json记录当前路由。

新Chrome前检回执fresh-chrome-r1-01a101cc-b72c-20261003已实收：实际6.1-sol/medium/Full Access/never及官方node_repl入口VERIFIED；当前browser/chrome插件两个skills目录为空，正式Bootstrap说明缺失，Chrome连接/Next页面清单仍NOT_EXECUTED，无owned页/Macro/fixture/世界写入。先前宿主模型容量失败保留为历史，具体当前能力以该回执为准。另据维护聊天01a101da-e04e-7762-a1a6-d8c7e8036d51中的人类安装及跨聊天协调授权，本实施任务已释放一次Next维护窗口，交接PID41112/Administrator/30002/cor-cotn/14.368/6.0.5/users0及精确启动参数；未替其安装代理、重启或改世界。本批服务/浏览器操作HOLD，等待共享app14.368公开下载补丁维护完成回报，再核新PID/文件SHA/目标与原模块集合后接续；不代替Mirror owner放行。当前hold与原件入口保存在新树current-chrome-executor.json及第一阶段专题末段。

维护事故接续：下载代理维护owner报告在Mirror READY前把不带--apply的foundry:lab stop误当预览，实际停止Mirror PID45120，已停后续维护并请求用户新的恢复授权；两补丁未覆盖和Mirror状态为维护方报告，本任务未另行验收。2026-10-03上海21:50本实施owner独立只读核Next：active=false/Core14.368、30002仍PID41112/Administrator/原app-data与启动参数。Next在Setup，尚未恢复世界运行；104注册96启用为维护方UI报告待原件。本迁移任务服务/世界操作0，保持HOLD_PENDING_MAINTENANCE_OWNER_RECOVERY，等待维护owner按新恢复决定完成回报，再复核接续，不自行恢复Mirror/修补stop工具/推进Next。新树maintenance-interruption-next.json及第一阶段专题末段保存依据。

维护方已完成Mirror事故恢复接受，并按用户暂停代理安装的决定取消维护占用，明确释放Next；本任务解除HOLD，只接续四模块。交来的Next104注册/96启用原件已父审，id@version与上一批完全一致，两个app文件现场仍原版。当前正式Chrome26.930.31428公共启动方法已有另一执行器实证，新独立6.1-sol/medium执行器r2也已连接成功，旧缺入口结论不再作为当前状态。r2出生页651339397准确找到cor-cotn，但一次Launch控件点击timeout后仍Setup/active=false；原件保留，r3已派至同执行器诊断可操作性/遮挡并在新证据后恢复启动，不原样重放。只读伤势Macro输入5509字节/SHA969c79439d90c6a1dcb2afee060c7667905082f6797766e6fc890f058835e965、7项隔离检查及V1收据49eb96a2-8a9d-41b0-aeb1-0112365a3c56文件PASS/COMPLETE完成；真实保存/Readback/伤势预览尚未执行。Next候选安装/启用/数据迁移仍0。新树第一阶段专题和current-chrome-executor.json记录当前r3出口，代理安装与Mirror仍不在本任务操作范围。

### 5.18 续记：2026-10-04 中断恢复、三模块启用与自动最大 HP 修复

本实施聊天 01a100eb-e2ed-7291-b60b-32550657b4c3 的候选仍为 20261003-164211-next-four-modules，未提交、合并或推送。用户要求的新 Chrome 独立执行聊天 01a101cc-b72c-7571-ab86-d3af20bc102d 已实际按 gpt-6.1-sol / medium 接续；旧聊天停止，不复用其上下文。

已验证：TE0.2.0、CC0.2.0 与 IFS1.1.0 安装到原 ServerNext；r7 客户端 106 registered / 98 enabled，原96启用保留，仅新增TE/CC。9份CC伤势 state/legacySnapshot逐项等于旧IFS原件，原HP和世界对象ID无变化；既有1个伤势投影保留ID并转交CC。完整r5-r8读回与安装收据保留在候选树 .local/next-four-modules-20261003/。

新增问题及修复：dnd5e6.0.5 原始 hp.max=null 表示自动计算，不能当作0。TE保留原始before/after语义，增加独立 preparedHp；CC消费该实际准备值并对缺失值失败关闭。原实现反证失败，修复后TE45/CC131通过，模块typecheck及手册30项检查通过。2026-10-04已在r8正常Return Setup后停止本任务PID45468，定点安装冻结补丁，仅TE README及runtime、CC runtime变化；无备份、无额外实例、未操作Mirror/生产。新启动收据 prepared-hp-service-launch.json 的PID54636，启动及重启后客户端读回仍待完成核实。

当前仅第一阶段PARTIAL：真实HP下降/恢复/全满、原生休息和IFS复活接受尚未完成；CC十九种通用状态和WMP仍为后续6.x迁移工作。不以字节安装或本地测试宣称实机完整通过。
2026-10-04 r9 重启后真实Chrome只读回归完成：PID54636/Admin/原Next目标；106注册/98启用全集相对r7零差异，保留的预检Macro源码5509bytes/hash未变，589个原Actor视图的原HP、flags、effects、9legacy/9CC及世界ID均相同，projection stats差异0。父读取receipt与baseline-comparison原件后接受为READONLY_REGRESSION_PASS，玩法仍NOT_EXECUTED。完整证据 prepared-hp-readback-r9/；Readback SHA6cfb3bc0f32ebc2031e9dfa58614f050a233a01bc4e42a5c9f3f52f3bd509f7d，Preview SHAf0dcef474fdb3594e3fb7574617e1fbca10c5c76e09d7769c81aa76e3637e774。

下一批r10准备了独立正常保存的世界Script Macro输入 injury-hp-fixture.js（11139bytes/SHA7d6ff96c3b08eeec6d296f90294afdb7d92c171cf40f623c65658e51799df182）；不覆盖预检Macro。仅创建1个专属character，源max=null/overall bonus20，并调用原生Actor.update五次检查倒地/恢复/第二次倒地/恢复/满血，验证TE原始与prepared事件、CC伤势和IFS死亡阶段。10项本地语法及工具控制/权限/目标/重复执行拒绝检查通过；本地模拟不计玩法接受。保留测试对象供后续休息/复活批次，批末统一清理。
r10 原生HP玩法链接受：正常世界Script Macro JY52DnngUs1YNtS3 保存、重开完整复制11139bytes/SHA一致后执行一次，创建专属角色 RyTpPtsl8jctRmo8。真实source max=null/prepared max20，20→0→1→0→2→20 五次原生Actor.update均通过；CC伤势0/1/1/2/0，两次倒地失败0/1，投影与IFS死亡阶段一致，TE每步原始maxnull与preparedmax20事件及modifiedTime通过。原589 Actor全源指纹逐项相同，仅增加拥有Actor，订阅已注销。父读完整native-hp-report并独立核对指纹和步骤后接受为NATIVE_API_HP_CHAIN_PASS；不是角色Sheet界面操作或跨客户端证据。原始报告349656字符/SHA29b8c6190c89c614d8d0c1eb971deca2866a4ba0b52bfeda46efb7af97c6e8f0，7段齐全。

下一批r11复用同1个Actor与拥有Macro，不新建角色。按精确6.0.5原生shortRest/longRest接口，禁用chat/advanceTime/advanceBastionTurn，短休在1HP时清除伤势、长休在已经满HP时清除伤势以排除满血恢复混淆；IFS公开setInjury只作标明的准备，withInjurySuppressed真实恢复验证一次抑制及下一次普通恢复不被抑制。批末保留0HP拥有角色供复活UI。输入 injury-rest-fixture.js 15322bytes/SHA58ba2fb4a9665f0451cd3eac1442099d85ca75b861298783b7c17df511fff556，语法/范围检查通过；玩法仍待实机。十九状态/WMP尚未6适配。
r11 原生休息和IFS公开恢复包装接受：同Actor RyTpPtsl8jctRmo8、同拥有Macro JY52DnngUs1YNtS3 正常Save/reopen源码15322bytes/SHA58ba2fb4a9665f0451cd3eac1442099d85ca75b861298783b7c17df511fff556后只执行一次。shortRest在1HP清除伤势1、longRest在已经20HP清除准备的伤势2，两次真实restCompleted的hitPoints delta均0；chat/dialog/advanceTime/advanceBastionTurn均false/duration0/messageIdnull。IFS public setInjury确实转交CC；withInjurySuppressed恢复0→1不叠伤势并消费抑制，下一次普通恢复0→2叠1。原589全源指纹、世界ID及时钟未变，订阅与观察Hook注销。父读完整native-rest-report独立核对指纹、两次native事件后接受NATIVE_REST_SUPPRESSION_PASS。原报告400329字符/9段/SHA c3cf8e6bbb0dc15b2030b9b2ef93777b01ddd4a3095365a5a8ef848f147ac627。批末同Actor保留0HP/伤势1/openepisode，restStageCOMPLETE；没有新Actor/Macro。

准备r12真实快速复活界面：同拥有Macro源码更新为injury-resurrection-fixture.js（12100bytes/SHAfe3934e0dc6810c729e8630d2cdd6a54db98321454d59d9befabdbcdd31ddfdf），通过正常公开入口打开真实Wizard；测试表单选择rapid、caster modifier+20、soul willing，使原生随机暗骰用于可控成功场景，不注入骰值/结果。检验实际blindroll与GM whisper摘要、一次回归历史、状态/摘要无原骰数据、临时文档锁释放、实际HP仍0直至正常原生恢复1且不额外叠伤势。预期增加本批2条ChatMessage，保留精确ID供后续保密验收与批末清理；当前玩家UI和普通/最终贡献仪式仍未接受，不把GM元数据当玩家界面保密证据。
r12真实快速复活UI接受：同拥有Macro正常Save/reopen/copy12100bytes/SHAfe3934e0dc6810c729e8630d2cdd6a54db98321454d59d9befabdbcdd31ddfdf后Execute/OpenWizard/Begin各一次，真实表单rapid/modifier20/soulWilling、三贡献者空。真实原生随机暗骰Fpom5i16sORWInCM及GM摘要0TRwqFbapLjiUVsY创建；rapid/DC10/success、一次历史/回归、Actor状态与GM摘要无原骰字段、锁已释放。仪式后HP仍0，正常原生恢复到1后伤势仍1、episode关闭、抑制消费。父读完整resurrection-report并独立核对消息、原589指纹、时钟和末态后接受RAPID_RESURRECTION_UI_PASS；增加的两条本批消息保留供后续隐私验收及最终清理。报告328634字符/7段/SHAe55f0916707fc88d863d530965fd0c68ed91a1dff5fd9dc25fe5f7d826403259。此限定成功场景不覆盖普通/最终贡献仪式、失败锁或玩家UI。

r13准备只读玩家可见性探针injury-visibility-probe.js 3234bytes/SHAc000bbf8a7313ec50af10aad6946252c7fb4bafc946939b942fa4d4b4968c40b；4项本地权限断言通过（不计真实玩家）。只读正常用户id/name/role/isGM/active及精确两条本批消息native visible/isContentVisible/isRecipient，不采集原骰/凭据/其他日志。仍复用拥有Macro，允许仅其临时LIMITED权限供当前不在线的普通测试用户正常登录后执行；不改原角色/用户角色或系统角色权限，无可用正常账号或需要未知登录凭据时停止并报告，不搜索秘密或绕过登录。Core14.368真实blind roll可有visible=true的隐藏内容占位，因此玩家验收以内容不可见/骰总值及tooltip无泄露、GM摘要不显示为准，不能误判为盲骰整行必须消失。
r13 PARTIAL：普通玩家SY/HF1ShlQokLfqMCJ6从离线正常登录到本批新页651339542；GM651339461保持连接。只读observer源码3234bytes/hash验证，GM两条本批消息内容可见读回通过；给本批Macro临时SY Limited1的UI保存/重开字段读回后，玩家目录无该入口（一次普通reload后仍无），玩家API报告NOT_EXECUTED。原生玩家聊天两准确ID均无行/骰总值/tooltip，界面观察已保存但不替代完整native API报告。Macro权限已恢复default0/各用户-20，源数据/模块/消息无其他写入，原角色未操作。首次实际前置问题归入PARTIAL_BLOCKED_PLAYER_MACRO_ENTRY，根因UNKNOWN，不把它当全局Script权限拒绝。

父核精确Core14.368：client/documents/abstract/client-document.mjs visible getter与client/documents/macro.mjs canUserExecute均要求LIMITED。因此Observer等级是必要条件的猜测未成立，不直接提升角色/全局权限或换隐藏执行渠道。r14增加只读正常Macro探针injury-visibility-diagnostic.js 3971bytes/SHAe003ea794ae757b94e9cf3c6c5c122888ad97e553dffd390fe441050995cccae，核同拥有Macro真正native ownership、selected Limited/Observer/canExecute/can(MACRO_SCRIPT)、folderID，定位持久化与真实UI/过滤层。两客户端/对象保留给此恢复。
r14已定位实际native权限与UI表单失配：ownedMacro nativeownership一直为{default:0,FccwB5HfAhy1F49a:3}，SY不存在，因此selectedLimited/Observer/canExecute全false；SY can(MACRO_SCRIPT)true。权限UI在Save/reopen后显示SY1，关闭旧编辑器重开后正常GM探针仍native无SY。实际玩家#macros激活/search空/foldernull/入口无。表单 restored全个体Default/nativebaseline相同。精确保存链根因UNKNOWN，不归因Limited等级或全局Script禁用。两页同GM/SY保留，未写原对象。

父核Core14.368 DocumentOwnershipConfig正常单文档提交是document.update({ownership:_replace(levels)},{noHook:true})，尚不把源流程推断为本地根因。r15准备正常保存世界Script Macro中的native Macro.update({ownership},{recursive:false,diff:false})定点往返验证；只已有ownedMacro JY52DnngUs1YNtS3，冻结baseline{default0,GM3}与temporary{baseline,SY1}，写前精确匹配拒绝未知变化，写后检查game.macros原生ownership/canUserExecute。玩家只按Read按钮；Grant/Restore要求activeGM，不触用户角色/global settings/原Actor/其他Macro，恢复精确baseline。输入 injury-native-macro-permission.js 6108bytes/SHA5d2c157bc3f1e80866fbff477c6b70b40d080f14b4fa804a98af9ea85dfc383f。局部控制流回归通过：读路径无写、grant/restore、重复授权拒绝、nonGM/inactiveGM/wrongobject/foreignownership前置拒绝。真实Macro API往返和玩家执行仍待回调；不使用隐藏browser game执行或修改Core。
r15 PLAYER_BLIND_NATIVE_VISIBILITY_PASS：正常保存源6108bytes/SHA5d2c157bc3f1e80866fbff477c6b70b40d080f14b4fa804a98af9ea85dfc383f的本批Macro，用正常native Macro.update临时授予SY Limited1即真实持久化且玩家目录立即出现，无reload/Observer升级/全局变化。真实SY role1/isGMfalse正常Macro UI只读报告：blind present/visibletrue但isContentVisiblefalse且非recipient；GM audit presenttrue但visible/contentVisiblefalse且非recipient。原生玩家聊天两ID行/骰总值/tooltip均未显示，无原骰值采集。native Restore恢复恰好{default0,GM3}、selectedLimited/canExecutefalse，父独立读原件接受。执行器随后更正：恢复后权限UI采样实际[]，不能接受先前“表单已稳定读回”的摘要；native精确恢复仍有效，UI复核缺口单列，r14表单持久化根因仍UNKNOWN。写仅本批Macro源1次/本批权限2次，原Actor/用户角色/global/message未写。

下一r16准备实际玩家-origin更新：复用同owned Actor/Macro，GM通过已验证native方式只给该Macro SY1/该Actor SY3，冻结baseline后拒绝未知permission。玩家原生HP1→0→2验GM端伤势/失败与IFSepisode唯一联动，并调用原生chat shortRest检验真实playerauthor/type/restMessage和GM经认证路由一次消费，时间不推进。若dnd5e.allowRests未开启则前置停止，不改全局；GM每种结果都恢复两个owned权限，采集原589源指纹比较。预计新增1条拥有原生rest消息，输入 injury-cross-client-fixture.js 12756bytes/SHAbdce0e21357259c40b165cd3f2929864e40a07db249e65df6d89e89ebd9f4c74；真实跨客户端结果待执行，不以语法和限定privacy通过推广。
r16 PARTIAL_PLAYER_REST_FAILED_PERMISSIONS_RESTORED：真实普通玩家TE privileged API拒绝、nativeHP1→0→2由GM结算的伤势1/失败1/IFSepisode及伤势2通过；实际native player-author shortRest消息0QdV4oxLlsk84hHt已经创建，但15秒GM清伤势超时，末2HP/stacks2/episodeclosed，未消费对应rest id，crossClientStage RUNNING保留。原589full source相同，时间21085409不变，仅新增该1rest消息。GMfinish仅恢复ownedActor/Macro到精确default0/GM3；恢复PASS不掩盖玩法FAIL。两个客户端、1fixture/2Macro/3message均保留，无重跑或手写期望数据。

父核Core14.368源：common/documents/chat-message.mjs canonical author和create权限禁止冒充作者；dist/server/sockets.mjs handleCustomSocket广播附this.user.id，身份来自认证socket。CC nativeRest(requesterId)仍只读取旧message.user，精确6.0.5 message使用author；补两个反证原实现131PASS/2FAIL（author-only合法休息不能清除；legacy alias可覆盖冲突canonical author），修复优先author、仅缺失时兼容user后133PASS/0FAIL，模块typecheck和30项手册check通过。中文README补校验说明，英文README旧伤势所有者冲突已更正。候选CC runtime SHA6ff942175685ec29c6588ae69222940cf18d3dd46158095c7c8a7a755ece2184；冻结owned升级计划仅README两份/runtime三文件，installed tree old e658bb...→candidate20d11e...；当前尚未apply。先r17正常Macro只读精确失败消息author/user/关联Actor现场值，再本批SY正常退出、GM正常ReturnSetup释放同Next，父按旧授权安装单CC补丁并复验一个新原生playerRest，不重放旧失败事务。
r17现场已确认失败消息0QdV4oxLlsk84hHt author/sourceAuthor=SY、legacyUserId=null、restType短休、associatedActorUUID准确，验证CC作者差异。ownedSY正常LogOut一次已到Join；GM ReturnSetup一次没有实际卸载，API仍active=true/users1/PID54636。未安装、停服务、写Actor或重放旧rest，未以非错误click当释放成功。

父核Core14.368 game.shutDown为POST/setup worldShutdown，server/views/setup.mjs读取HTTP认证req.user，缺少GM时拒绝/重定向Join；server/views/join.mjs普通Join页面logoutWorld。游戏socket中的GM身份与后续HTTP身份独立：刚由同Chrome普通玩家登录再登出后，旧GMsocket保持不代表HTTP仍GM；这是精确来源支持的恢复假设，没有读取Cookie/profile/session store或凭据。r18只用本批GM页面正常Navigate Join结束自己的旧连接、确认只有本批GM无其他用户后正常Gamemaster重新登录，再正常ReturnSetup一次，以APIactivefalse和原PID证明释放；不原样重复旧状态click、不换协议或raw操作。
r18 WORLD_RELEASE_PASS：同ownedGM正常Navigate Join结束旧连接、CurrentPlayers0，正常Gamemaster重登录一次、ReturnSetup一次，实际APIactivefalse/同PID54636，GMSetup与SYJoin确认。无读取Cookie/秘密，恢复符合正常身份前置假设，不独立宣称内部HTTPsession根因已证。

父核unloaded/PID/owner/data/port后只停止自己54668以外的实际PID54636一次，NEXT_STOPPED门通过，单CC冻结patch apply成功：treee658bb...→20d11e2690141380f9a5a1f85051b61f56e19d916828c897a68aa663446ce78f，只README两份与runtime变动；同app/data/world参数恢复到PID64688/Admin。APIactive=true/core14.368/dnd5e6.0.5/cor-cotn/users0/stderr0；TE44355559...与IFSc748dd4a...未改，CC新runtime6ff942175685ec29c6588ae69222940cf18d3dd46158095c7c8a7a755ece2184。Python独立ZIP CRC与31文件逐SHA核 build=ZIP=installed，zipSHAd8ef80e9ce0e7511ac417b5e833b69e51bea1d567eb3546f9552bd1a876da6a9。无备份、额外实例、Mirror/生产操作或发布。

r19输入 injury-rest-author-retry.js 12897bytes/SHA4a46584108641eb5066faf2d1f954479650131252f99be04631ea1bd2b114e6a，复用原failed-rest actor2HP/stacks2、完全不更新HP，只发1个新的原生玩家chat短休。old failed rest id必须仍不在processedTransactionIds；新id一次消费清0，GM每分支恢复ownedActor/Macro权限；先比r16原589source基线以检查重启保持，再GMprepare/finish完整比较。真实玩家短休修复接受仍PENDING，旧失败原件不覆盖、不重放。
r19前置暂停，不执行新playerRest：新PID64688/module106/98一致，GMprepare只授权ownedActor/Macro。相对r16 originalAfter，589 source fingerprints中两个原world Actor变化：65DtcQDkiSKj0Qd5（npc）及aMZwC9ORkpZpdlkc（character），前后SHA保留before-baseline-comparison.json。PLAYER RUN0/newrest消息0/HPupdate0；GMfinish精确恢复owned权限，r19期间原589source/ID/time保持，fixture仍2HP/stacks2/closed/restAuthorRetryStagePREPARED，旧crossClientStageRUNNING和旧失败rest未重放。普通SY旧页651339542缺失不宣称已清理，新ownSY页651339574正常登录并保留。

两个差异Actor在r9均无legacy injury/CC injury，不直接归因CC迁移或patched rest function；目前具体字段/原因UNKNOWN，旧“originals全部保持”的结论只属于对应历史批次，不推广到本次重启后的整体。父只读新启动日志有正常Migrating Package Data阶段，不据此认定为正常数据迁移。r20只读probe original-drift-readback.js 4073bytes/SHA7a54033fd1752466d8f97b577c25d4d92b7f7b96f210ade4fdf565766d1befc5，采集两exactActor的component hashes、HP/death、limited stats/items/effects metadata及user.character映射，比较r9 HP/flags/effects，缩小差异。没有全量rollback副本、猜测还原或任何原Actor写；短休patch运行验收仍PENDING。
r20 READONLY_COMPONENT_EVIDENCE_COMPLETE_CAUSE_UNKNOWN：两exact原Actor fullSHA与r19相同，没有继续变化；HP、death、flagsSHA、effectsSHA逐项与r9一致，均无legacy/CCinjury。NPC8items无角色绑定，character36items绑定另一inactive用户而非本批SY。现metadata只能提供有限线索，不证明旧字段相同或正常迁移。父只读原迁移树两份相关计划（reviewed-plan及icon-repair-plan），F evidence检索旧fullSHA无可用原文；没有找到完整旧component数据，停止扩展泛扫描。未写原Actor，不创建恢复副本、不猜还原；两历史fullsource差异原因保持UNKNOWN，不宣称全量迁移原文保持已通过。

当前两差异的HP/伤势相关flag/effect一致且r19→r20稳定，专属fixture2HP/stacks2保持、r19playerRun0证明retryStage仅PREPARED未开始。r21允许继续这个尚未执行的单个新playerRest，并以r19当前589完整指纹作受控功能验收基线；不是抹掉r16差异。输入 injury-rest-author-resume.js 13571bytes/SHA2dda95ba6db7d21059264028f1a2be663ffa3306e221f6fdd66d1c1f6c99072f，GMprepare冻结两个已知当前SHA并再次全589与r19比对，若有新的差异则停止；RUNNING/COMPLETE仍不允许重放。只更新owned权限/标记、执行1个新原生playerRest，GMfinish全量当前before/after与时钟/ID及权限恢复，旧failed rest0Q仍不消费。补丁功能验证与两历史fullsource保留UNKNOWN分别报告。
r21 PLAYER_NATIVE_REST_CURRENT_BASELINE_PASS_HISTORICAL_DRIFT_UNKNOWN：完整当前589before与r19after逐项相同，normalSY native新shortRest at2HP/stacks2生成x9IyhGvk4KJtZX3T/type rest/canonical authorSY/speakerownActor；GM清到伤势0、HP仍2、精确rest:Actor.RyTpPtsl8jctRmo8:x9IyhGvk4KJtZX3T:short仅1次，old0Q失败事务未重放/消费。TE privileged API非GM拒绝也通过。GMfinish精确恢复ownedActor/Macro default0/GM3，当前589case前后相同、时钟保持、world IDs仅新增该own restMessage。父独立读三完整原件比较接受，source13571bytes/SHA2dda95ba...；原始3JSON长度157311/20989/155240和SHA保留各receipt。两历史whole-source差异原因仍UNKNOWN，不称全量历史原文保持PASS；目前本批1Actor/2Macro/4ChatMessage保留。

准备r22真实自然19/20死亡豁免：精确6.0.5 Actor.rollDeathSave({}, {configure:false}, {create:false})支持原生实际随机骰且不创建聊天。仅ownedActor，最多100次实际随机保留d20，未给骰面/RNG/结果；逐次准备死亡计数以免三成功/失败终止，遇真实保留19或20检查native hook outcome=revive/原生HP1/计数0/伤势1，二者都观察到才接受；达到采样上限未见两者则INCONCLUSIVE，不当语义FAIL或未见面证明。批后先等nativeHP恢复2事件结算再公开injury清0，原589当前基线/clock/IDs保持、观察Hook注销。输入injury-native-death-save.js 11873bytes/SHA36fea602486745cf00cfcae598fe62117246fa6a8f5efa22e994434a08b797e4，syntax/exact native接口/scope核对完成，真实结果待回调。
r22 NATIVE_RETAINED_19_AND_20_PASS：真正native随机rollDeathSave configure=false/create=false，24次实际evaluated roll中第16/22为保留20、第24为保留19；三次critical都有nativehook outcome=revive/HP1/death计数0/CC伤势1，不注入骰面或RNG、不造Hooks、不生成ChatMessage。ownedActor最后HP2/stacks0/episodeclosed/死亡计数0、观察Hook注销。当前589before与r21after及casebefore/after一致、IDs/time不变，完整报告338447字符/7段/SHA1f0d3e0aeddbe867f935ac2b3eccad429cf15f611bb560ce91fee9b42534e518，父核原件接受。历史两wholeActor差异仍UNKNOWN。

r23准备TE真实Combat订阅及Macro dispatch：Core14.368实际Combat activation全局会自动deactivate原activeCombat，生命周期刷新shared ActiveEffect registry；先要求无tracked original Effects、有空原TriggerStore，否则只读前置拒绝且不创建/切换。条件满足才create1inactive ownScene/Combat，reuse同Actor/Macro；原active flag有精确前值、原Combat语义全source除正常stats哈希记录并native恢复。普通nativeupdate start/两rapid轮转换+60ms慢订阅验证S1/E1/S2/E2/S3及真实Macro causal updateDocument五次唯一动作，nochange/rewind/重复key不重放。source为正常Script Macro含顶层return await使真实TE Macro.execute等待写入Promise，未造Corehook或引擎事件。最后remove仅ownTriggerDefs/本次新建空setting，restore原Combatactive pointer，保留owninactiveScene/Combat供后续状态批次。输入trigger-native-combat-fixture.js 16587bytes/SHA858ecebbfda15787fa7321ecddd999818fb115ad24bc582cc55a29ae4168c399，exact native接口/syntax/scope已核，runtime待执行。
r23真实前置停在10original trackedEffects，source中全部expiry=turnStart；没有创建Scene/Combat/TriggerDefs、切换activeCombat或订阅，runtime events/Macro接受NOT_EXECUTED，不能以空cleanup/无错误点击判PASS。ServerNext目录只含cor-cotn，未新建world/实例或改原timers。

父深入精确Core14.368 ActiveEffect.isExpiryEvent：核心expiry事件必须匹配context.combat中的effectCombatant；只有ownActor的实际Combat对这10foreign Actor的各核心事件应均false。Actor.onUpdateEffectDurations为空、dnd5e6.0.5无override，native refresh仅prepared durations，不能凭registeredcount就称会写/过期。撤回r23“any foreign tracker禁止”的过宽门，改r24独立真实predicate反证：先createinactiveownScene/Combat，nativeupdate round1/turn0且turnEventsfalse用于前置，只读实际10effects.isExpiryEvent对6种native事件，全部strictfalse才resetownCombat round0再activate测试真正Core生命周期；任何unscoped或matching effect仍拒绝，不清timers、不改expiryAction、不patchCore、不造Hooks。

r24源码trigger-scoped-native-combat.js 17996bytes/SHA350d316280f4f188a632d42d7071a177af51c4227e2130f9055eee972931afe2，经exact interface/syntax核。条件满足后仍real native subscription+Macro S1/E1/S2/E2/S3/order/unique/no replay，owned TriggerDefs及本次new-emptySetting清理、原activeCombat flag/全语义sans_stats恢复、原589当前source/IDs/time/view一致；新增ownScene/Combat保留批次复用。前置round1 turnEventsfalse不计事件接受；正式nativeevents不用turnEventsfalse，修门不是绕过实际拒绝或扩大original权限。runtime待回调。
r24 EVENT_MACRO_CHAIN_VERIFIED_WORLD_ID_GATE_FAILED（overall false）：真实inactiveowned Combat下10foreign effects×6actual native expiry predicate全false，正式nativeupdates TE订阅和actualworldMacro各5条S1/E1/S2/E2/S3/unique/order，60ms慢end+两并发更新与nochange/rewind/repeatedkey无重放通过。创建ownSceneKDZvNoT3KJElTwfw/CombatVo4ZOq0Dp1Ubc8Gw；ownsubscriber/2TriggerDefs/本次newemptySetting已清理、originalCombat语义sans_stats/activeflag恢复、当前589前后与r22基线相同、clock/view相同。唯一最后失败是除预期ownScene/Combat之外新增消息vfkjTY4FGpnRKyyg，来源未知，不删除/归因。父核原件只接受上述限定行为，整体仍false；ownActorcombatStageCOMPLETE只是分阶段标记不能替代总接受。完整323840字符/7段/SHAb7abaf163ed020df9ee75d460069800f5c3489ca6dacbca43da86e4afeff6f5e。

r25仅正常保存readonlyMacro读取精确新增message vfkj... author/type/speaker/flags scopes及nonblind content，盲骰不导出roll数据。不重跑Combat/修expectedevents、不删未知对象、不写originalActors、角色/全局、Combat状态。若明确来自本批ownScene/Combat生命周期，父按实际证据重新审worldID允许集，保留原failedreport；若关联不明则未知保留。后续CC19继续同owninactiveScene/Combat复用，节点补丁接受不被恢复PASS替代。
r25只读确认vfkj...是Monk's Combat Details14.03 roundmarker/nonblind/nonroll/emptycontent/flavor Round0、无Combat/Actor/Scene关联。父核当前源码js/combat-turn.js SHA c3bc8477ea2235dcd2f949b1b3283248f99655c5c1e957878d101bdf610bbb1c，updateCombat delta.round分支134–150创建无binding通知，本批唯一round0更新为ownedinactivepreflight reset；case时点/GMauthor/模块flag均匹配。message与本批关联是SOURCE_CORRELATED_INFERENCE，不当显式ID绑定或自动cleanup许可。独立机械父判定native-combat-parent-adjudication.json保留raw r24 false原件，验证5订阅/5真Macro/order/unique/noReplay/10×6expiryfalse/所有恢复/当前589/clock/view，并允许这条已知模块通知作为额外输出后worldID集完全相同，接受SCOPED_NATIVE_COMBAT_FUNCTION_AND_RESTORATION_ACCEPTED；通知继续保留待最终精确cleanup判定。

进入第二阶段CC十九状态候选，未扩大IFS全仪式或WMP接受：精确generic门14.364/5.3.3与14.368/6.0.5、其他系统/交叉及未审版本拒绝，Index init同门注册19状态。武器效果独立isSupported/写入与事件结算仍锁5.3.3，避免十九状态开启连带写旧武器状态。锁定6.0.5源码确认d20 subject/rolls/top-level disadvantage、postUseActivity先于subsequent Attack、postRollConfiguration可取消且先于evaluate、伤害options透传。发现6版攻击Chat schema改type=attack/system.targets.actor+token+ac，旧Helpless/Frozen读取flags.roll.type/targets.uuid错误；两个新反证先141PASS/2FAIL，适配优先canonical actor+AC snapshot（total cover/null及非attack不回退矛盾legacyflags）后143PASS/0FAIL，5.x旧路径保持。模块typecheck/构建及30手册check通过，source-provenance固定commit3ee48de...和6文件SHA；中英README/手册同步候选与未验边界。

新CC runtime e031185479e4cf0ef018fa19518ebc6344ed7dc0a52ce56825bed4ade0a55fcf，冻结singleowned计划tree20d11e...→63011d343119b99b0702d2e937b1bcce680278dfb8bab66f0ee5787c30a9264a，只两README和runtime，尚未apply。r26先6541bytes readonly baseline源码cc19-stage2-baseline.js/SHA3062618e9e10090ff764a5524dd8922374839cdb59400939bea2b8c6a3f6f42c捕当前589+module106/98+IDs/time/owned状态，正常SY退出、GM Join重登录再ReturnSetup释放原64688；父随后同参数安装和重启。十九状态UI/语义runtime仍NOT_EXECUTED，WMP候选未开发/安装；两个历史wholeActor差异UNKNOWN与通知binding推断单列，不备份/发布。
r26 BASELINE_AND_WORLD_RELEASE_PASS：166369字符/4段/SHA59a49cae8f2f8cdbe100623a669cc2b0cdeb116fb52ed90335fd1491445f7687，当前589与r24after、106/98与r7完整id/version/active一致；ownActorHP2/stacks0/closed/own权限default0GM3、genericDefs0/injurytrue/trigger0/ownSceneCombatinactive。正常SYLogOut→GMJoin重登录→ReturnSetup各一次，APIactivefalse/同64688。父核精确owner/listener/data/world卸载后只停自己64688一次，NEXT_STOPPED真实门通过；singleCC0.2已apply frozen tree20d11e...→63011d343119b99b0702d2e937b1bcce680278dfb8bab66f0ee5787c30a9264a，只两README/runtime，无备份或其他服务操作。

原同app/data/world参数恢复到PID61180/Admin，APIactive=true/14.368/6.0.5/cor-cotn/users0/stderr0，新CC runtime e031185479e4cf0ef018fa19518ebc6344ed7dc0a52ce56825bed4ade0a55fcf。独立Python ZIP CRC及31文件SHA核 build=ZIP=installed，zipSHA108878067ed5f7cdebd1a50b842af6b15d057804843babe1a20749779fdc30f3。TE/IFS没有本轮变动，仍各44355559.../c748dd4a...；source/frozen install只是字节证据，不称十九状态接受。

r27准备cc19-instance-matrix.js 12350bytes/SHAc127d18b033cd54c87b80deb5de5c2628f0fed539162835500c772dd5215b2df：先正常readonly按钮capture fresh589/完整module set/19catalog/各status注册一次，比r26baseline；通过才同ownActor逐个19 publicapi.apply→flag/status projection→disable/enable→remove本次effect，合法origin为ownedMacroUUID/source标记case，参数bleed1/burn1fire/frozenDC10/jinxvalor1d4。末HP2/stacks0/实例0、当前原589/IDs/time保持，weaponWriter仍拒绝6目标。此只是native实例与生命周期接口，不替代roll/movement/Combat tick及可见HUD。没有新增Actor/Macro/Scene，复用同own对象；源预置stage防重放。runtime待回调，历史2wholeActor差异及roundmarkerbinding推断保持原边界。
r27 POST_INSTALL_CATALOG_VERIFIED_NEW_ORIGINAL_DRIFT_BLOCKED_RUN：new61180/current106/98全集与r26相同、exact19defs及各status唯一注册通过，ownedActorHP2/stacks0/closed/ownershipbaseline。postinstall-current589相对r26在相同两original Actors又出现新wholeSHA：65D... f96d...→608a6cc4a0268634c8a94bcf04c017aa26f107aeed2dc92fc0008640a418b83a；aMZw...d38e...→cb30fd85a68908608e91638ad5e12accd78065fae3a3491c03596c46675de9ff。执行preflight一次、Run0/effect0/marker0/HPupdate0/permission0，没有修原数据。GM初login与playerJoin竞争仅normalGM重登录恢复，双ownedgamesockets保留。旧整体差异仍UNKNOWN，这次新差异未归因CCmigration。

重复两Actor在每次重启整hash变化，r20留过完整component/itemhash，可在r28直接比对定位层级。新locked6.0.5源码有activity/profile/applied-behavior DocumentIdField randomID initial，也有tool自动构造activity，均只是候选解释，不无证定为根因。readonly original-repeat-drift-readback.js 5063bytes/SHAf6bf088ad3c308a10a5741a66cf64be21653509d1fca606f8cfd3915e4449b5b，新增每Item顶层/systemhash与activity/profile标识符，保留已有hp/death/flags/effects/top-level数据；不克隆Actor/构造新Doc/写数据/重启或reload。先与r20定点比较oldcomponent与items找具体变项再决定下一变量，不能盲扩大采样或还原。十九instance/玩法仍NOT_EXECUTED。
r28定点组件读回：两Actor当前wholeSHA与r27相同，无再次变化；相比r20 Actor顶层仅items hash变，所有Actor systemParts/flagScopes/HP/death/flags/effects/stats相同、item IDs无新增/删除。每Actor只1Item hash变：Nightgaunt fireball ykG8Os9wGs6iDol8、Seaelf race Oqs0HDVs0QOmvzb9，二者Item stats/flags hash相同，Item.embedded effects hash变；不是Actor自身Effect变化。当前item各字段hash/activity descriptors已存，但旧r20没有更细subcomponent，不能断言其余item字段都没变或randomID原因已证。实例Run仍0，原物件无更新。

父锁定6.0.5 data/abstract/active-effect-data-model.mjs:30 changes.element新增_id DocumentIdField(initial randomID)，这是更贴近embeddedEffect的候选机制；Core14.368 start/duration fields及DAE14.0.14代码也核过，不先归因。r29准备exacttwo Item effects sourcefields/componenthash+parentItemSansEffects hash，并用两个仅内存自造BaseEffectDataModel（非克隆original/非world Doc、不给change_id）观察ID default是否随机，其结果不能单独证明original旧差异。输入embedded-effect-drift-probe.js 4694bytes/SHAfe4e5d43dea5c205085872f35df1736fec5a66436a64d1eea8973f8ee32c3e99，无original prepare/constructor/update、无reload/restart。只读字段证据/自造schema观察后再定下一变量，历史exact difference原因仍UNKNOWN，十九instance尚未执行。
r29只读字段与自造schema观察完成：fireball effect dnd5espellchange有4 system.changes，SeaElf SwimSpeed effect SIoBMgJ64YgbJ1eS有1；direct effectDoc、Item.effects、ActorNested serialization hash相同，当前rawActor/Item hash与r27/r28一致。两个own仅内存BaseEffectDataModel不输入change_id，生成不同16位ID而排除_id后的数据完全一致，证明schema随机初始机制；不单独宣称historical originals仅ID差异。rawreport11098字符/SHA90ee56734869eb615a84b10cfbee3cf3f70bd50413f5a1c21bb4434170480057保留，任何原Doc未construct/clone/prepare/update。

r30受控单变量实验准备：在同PID61180、相同app/system/modules/build下仅normal deactivate/launch同cor-cotn world一次，不restart Node/不install。不复制Actor为restore对象，只临时JSON数据里排除精确两effect的5处system.changes._id，采原Actor全其余字段strict canonical SHA、exacteffectsourceFields、raworiginal589/IDs/clock/modules/own状态。正常before一次→normalownSY退出/GM重新登录/ReturnSetup→normal同worldLaunch/GM重新进入→after同脚本一次，直接diff effect fields+normalizedwholeActor并看其余587源保持，验证是否该5ID且仅该5ID变。若归一仍异则继续UNKNOWN且不修原数据；若仅5IDs则判本次controlledreload范围，不将未存历史old字段自动判恢复。输入controlled-reload-drift-baseline.js 8000bytes/SHA9890a78821137f581404b12ad7a25dd6ac66b4c3d59219da7dd8498e6ab8f96f，syntax/exactpointer/count核，runtime未执行。十九matrix仍Run0。
r30 CONTROLLED_RELOAD_EXACT_FIVE_CHANGE_IDS_REPRODUCED：同Node61180/Admin、相同包/module10698/build下正常卸载再Launch同cor-cotn一次，未NodeStop/install或settings/actorAPI写。before/after各一次，exacteffectfielddiff仅fireball4+SwimSpeed1 system.changes[n]._id改变；临时排除这5精确路径后的wholeActor全其余字段canonical SHA两者完全相同（965693fce6d5a23076355fd9de020913f057875b8599d618acc989721169d169 /4339f4d216c60481db57a5c8f5dcef88f39b3d135fa6553c1a969b570705f191），其余587 raw hashes完全相同。原IDs/time/fullmodules/ownActor及ownership保持。父独立读before/after重新计算对照接受本次controlledReload只有5ID默认生成变化，未写original或ID，归一仅temp JSON/hash。两原Actor更早未存oldfield的历史精确diff不追溯改判；当前对重载变项已有可复现实证，不能把所有未来字段都掩码。before173798/after173733字符各4段/SHA e1be904e... /ce1cbfe4...与精确old/newIDs在原件。

r31继续此前没执行的cc19实例Case：source仍12350bytes/SHAc127d18b...，cc19InstanceStage undefined（r27Run0）。postinstall preflight先比current589 raw与r30after，而不是r26旧随机ID；如无新变化才publicapi逐19 apply/disable/enable/remove，actor/system/角色不修复、不clone、不persist生成ID。source功能验收与controlleddata解释分别记录。SY目前ownedJoin，可暂留离线，仅GM跑实例；若需后续player检查再正常登录。Node/version/bundle不变，world缓存未再次重载，unknown旧历史边界保留。
r31 CC19_NATIVE_INSTANCE_PROJECTION_LIFECYCLE_PASS：postinstall当前589与r30after raw全同、module10698/cat19/status每项1，normalRun首次（r27从未Run）。19项nativeapi.apply→schema1/primaryprojectedstatus/list→disable/enable→remove全部通过，weaponWriter6目标仍拒绝，generic实例0、ownActorHP2/stacks0/closed。当前589case前后、world IDs/time保持。父独立读matrix原件逐19与原源比较接受此实例/projection层；没有roll/attack/tick/movement的全玩法声明。preflight167178字符/SHA22397fef...，matrix334887/7段/SHAb861fa84fd333c0188f7f3dfcd197573d457834a75feb00034ac073366b1a9fa。临时effects已移除，cc19InstanceStageCOMPLETE。

r32准备actualnative savingthrow/abilitycheck矩阵：Sickened仅CON save劣势、CON check/Dex save正常及移除恢复；Clumsy Dex save/check劣势+Str控制，Enfeebled Str save/check，Addled Int/Wis/Cha save/check+Con控制；Jinxed/Valor 1d4实际负/正dice及两者独立组合。原生Actor.rollSavingThrow/rollAbilityCheck({},configurefalse,createfalse)，options/真实2d20低留/公式与d4实评估，不Mock/注入结果、不创建chat、不更新HP/Combat。每case只ownActor flaggedeffect，末移除并恢复baseline，原589当前raw/IDs/time同；attack/Weakened damage/turn movement/HUD后续。输入cc19-native-roll-matrix.js 12635bytes/SHAa12e0d688fe1a7783f9a65b1f023a7bc5004e3a05e9ac2a4843cd2ede62c28f9，syntax/exact6 API及formula检查器两正负示例已核。runtime待回调。
r32 FAILED_UNCONDITIONED_NATIVE_ROLL_BASELINE：第一未施状态CONsave已nativeevaluated/d20存在，但工具严格boolean-disadvantage/active结果数/结果总数断言失败，checks[]，没有任何conditioncase或effect创建。源码先assert后push，因此failed native metadata未记录，不能归因状态规则、其他模块或6native骰模型。主FAIL保留，cleanup generic0/HP2stacks0/原589与r31当前及case前后/IDs/time保持；cc19RollStage RUNNING，不能整体重跑。原报告310821字符/7段/SHA68341960f7e2e862222e8e3d8c4641e210b5a9fb1de84e0cd223ba1f7b991679。

父再核exact6.0.5 D20Roll options.advantageMode和hasAdvantage/hasDisadvantage为有效模式，旧boolean不一定保留；D20Die applyAdvantage及results处理要对实际结构验。r33 one新的unconditioned CONsave diagnostic，不重复矩阵/不修改期待结果或settings；捕真实preRoll配置、source/prepared CON.roll字段、status/effects、完整nativeoptions/modeconstants/has模式、Dice.class/number/modifiers/options/results和strict/nondiscarded计数，先记录再判，不附强1-result要求。只ownActor，新原生随机投骰createfalse，没有HP/原Actor更新。输入cc19-native-roll-diagnostic.js 4330bytes/SHA2efb3a406b7c36e28af2876f6eb8226c1502e9c80fdb918c6c70d621409afd19，syntax/exactAPI/scope已核，runtime待回。
r33实际未施状态CONsave诊断完整：native1d20+0/D20Die1result/strictActive1，options与preRoll config advantage=true/disadvantage=true，但advantageMode0、hasAdvantage/hasDisadvantage均false，所以最终是NORMAL。source/preparedCON roll.mode0，原生Options含Automated Conditions5e/MidiQOL NoChanges元数据，其来源作用不单凭字段归因。父对照exact6 D20Roll effective getter及applyKeybindings双标记抵消、独立读raw数据接受为工具r32 rawboolean→effective mode判定缺口；不是某condition语义FAIL。观察Hook注销、HP2/generic0，没有statecase或生产改动。

r34修正仅验收器：cc19-effective-mode-roll-matrix.js 12961bytes/SHA74924ee86f2627e5cba202bec45339853e2bf19a99c70408efc24dbfba9e81b8。每个roll先保存complete rawoptions/formula/dice/results，再用nativehasDisadvantage/hasAdvantage和advantageMode constants+结果数量判finalmode；不改变骰/模式或config来制造结果。新cc19RollRulesStage独立防重放，r32失败marker留RUNNING，原6状态case未执行所以接着实际native矩阵，不覆盖旧FAIL原件。部署bundle与globalmodsettings完全不改，后续若condition actualmode不符保留前置已有完整metadata诊断source链。原589/currentcase和cleanup继续守。

### 2026-10-04 r34 接受与中断恢复

新独立 Chrome 执行聊天仍为 01a101cc-b72c-7571-ab86-d3af20bc102d，6.1 Sol / medium。父核对 r34 完整原生骰报告 SHA-256 0a5c6060e7868bf103dd1be754fff98fe9873892792a883b7b5d0b09a37a08dd：ok=true、errors=[]，20 项已实际求值，六状态 Sickened / Clumsy / Enfeebled / Addled / Jinxed / Valor 的有效 NORMAL / DIS 模式、保留骰、正负及组合独立 d4 符合断言。此为限定原生 API 投骰接受，非攻击／伤害／tick／移动／HUD 全规则接受。r32 错将原始 advantage/disadvantage 入参当最终模式的失败仍保留，不修改 RNG 或骰面。589 原 Actor、世界 IDs 和世界时间在本批前后相同；最终测试 Actor HP2、伤势0、通用状态0。

主控中断后只读确认原 ServerNext PID61180、127.0.0.1:30002、app14.368、data/server-next、cor-cotn 仍在；独立任务 r34 已完成且 idle。十九状态实例 r31 与限定投骰 r34 已闭合，后续仍需攻击、伤害、回合、移动、HUD，WMP 未接入。r35 仅准备一个标记的原生武器 Actor 和现有拥有 Scene 中两枚 linked Token，复用至最终批清理；不提前宣称攻击／伤害通过，不创建世界或额外实例，不触碰原对象。


### 2026-10-04 r35 格式恢复／r36 原生攻击对象准备接受

r35 因正常 Macro 保存去掉输入末尾一个 LF 而在运行前停止，Execute0 / Run0 / 对象创建0。父统一生成输入trimEnd后11599 bytes / SHA42227af90aa2b1c61beefdc2ab722fe4084a54cf77251f31e95850eefcbd9fc2，与已保存源逐字节相同；r36复用现有Macro后执行一次，原生准备PASS。报告SHA8861ee61d2b123aa9446fcf8ad8e143958cf131337c01440d5493594b07b97d9，父核原589基线等于r34.after、前后source一致、世界IDs仅新增一个拥有Actor，世界时间／GM视图／空targets／Combat全源保持。

批拥有新增Actor 0e5NXsDag66VmH5p、其weapon Item mm5lhCemyWYYpWuW，系统weapon._preCreate生成AttackActivity zXF7Ezu6lXQ6ZTN6（weapon／mwak）。现有拥有Scene KDZvNoT3KJElTwfw新增linked attacker Token QxtFr6GGk7iVMHXg、target Token XrdTKwb9kunpei7z；精确batch／owner／role标记和IDs已记在拥有victim RyTpPtsl8jctRmo8。所有对象留至最终批清理，本轮未投攻击／伤害、未修改HP、未view／activate scene、未target或推进Combat。

r37已准备11项真实原生投骰：STR Enfeebled、DEX finesse Clumsy及对照／移除、Jinxed／Valor和独立组合d4、Weakened武器伤害及前后对照。临时finesse属性精确恢复；普通原生item last选择标记属于拥有Item。无chat／HP应用／scene或Combat变化，此仅attacker及伤害骰层，目标优势／Helpless或Frozen暴击、实际HP应用、tick、移动、HUD仍未验。WMP仍未接入。


### 2026-10-04 r37 Enfeebled 原生力量攻击失败／r38接口诊断

r37执行一次，普通STR原生攻击NORMAL通过；Enfeebled已施加后原生攻击仍1d20、有效mode0、hasDisadvantage=false，预期DIS失败。报告SHA438a79846893cbcdc85ca0041cf2dcd3b7fe7f518fc34ec345aabc7eece614d1；保留失败检查与nativeAttackRollStage RUNNING，不重放、不改骰或配置绕过。剩余9项攻击／伤害未执行。精确本轮condition已移除、temporary finesse恢复调用成功但原报告未记录其最终数组；589原Actor、世界IDs／time、GM视图／targets／Combat保持，双方HP20／2、伤势0。

固定6.0.5源码确认preRollAttack先于applyKeybindings／原生buildConfig／postConfiguration，攻击从actor能力attack.roll.mode构造core模式，而CC现有effect changesFor只投射check／save模式，攻击通过preRoll顶层config.disadvantage修改。安装AC5e源码包含冻结模式和后续模式重建；这只是竞争接口假设，r37尚不足以归因具体覆盖步骤。r38只在两次拥有原生随机攻击上添加公开Hooks只读快照，记录顶层和roll0模式、能力字段、CC实际effect和原生STR攻击字段，结束移除所有监听并核finesse恢复数组。没有禁用外部模块／改设置／patch prototype，不称诊断为规则通过。


### 2026-10-04 r38 诊断接受／6.0.5原生能力攻击效果修复候选

r38两次真实STR攻击和六公开Hook快照已采集，报告SHA81b62b998435bd4f4940d28f0ff131d0498586207465a52eb402860cbe286f6d。普通及Enfeebled攻击top-level／roll0均adv=true、dis=true、mode0，prepared STR.attack.roll mode0且优势／劣势counts均0；实际Enfeebled效果只含STRcheck/save两处劣势。没有证明所有中间覆写的因果顺序，规则仍FAIL。观察Hooks全部移除、weaponproperties[]精确读回，拥有双方HP20／2和伤势0、原589与world IDs/time保持。

候选将Enfeebled、Clumsy、Addled的能力特定attack.roll.mode劣势作为6.0.5原生ActiveEffect change持久投射，交给系统合并合法优势／劣势；5.3.3无该原生schema，保留旧Hook，不投射新攻击字段。三个缺口回归旧实现143PASS/3FAIL，修复加5.3.3防回归后147PASS/0FAIL；foundry模块typecheck通过，人工核手册并build/check30PASS，CC构建通过。新候选runtimeSHA6e71d821418f5d42f7083cecfedde0873d7bb49d6f4467ce3b5d1d91dcb61a92。预览只改CC的README两份及scripts/index.js，apply=false、writes0/backups0；当前运行仍旧e031...，不可将静态通过称实机恢复。r39先捕获原589／精确五changeID正规化baseline、拥有对象、模块集合与恢复状态，再通过正常GM UI退出世界到Setup；只有active=false且PID/path/owner/port确认后父定点stop／安装／同实例重启，其他服务不动。


### 2026-10-04 r39 释放接受／CC原生攻击投射修复定点安装

r39完整baseline原589逐项等r38.after，模块106／98、world IDs/time、双方HP、weaponproperties[]、空targets、拥有Scene两linked Tokens及Combat全hash保持。正常GM UI第一次Return Setup仍active，经已有r18登录前置恢复后第二次正常Return Setup成功active=false；不是未变前置盲重试，浏览器执行器未stop或安装。父重新核PID61180/path/owner/127.0.0.1:30002且active=false，定点停止唯一服务。stopped guard在安装前及每次写入前通过，只有CC两份README和scripts/index.js改变；build／ZIP／installed31文件及CRC独立一致，runtimeSHA6e71d821418f5d42f7083cecfedde0873d7bb49d6f4467ce3b5d1d91dcb61a92，ZIP SHA9a15bb2433ca55bf5e8b26c4c9985ebf41eef4697c78b7a7a8cc97f2f41db278。同app/data/world/loopback/noBackups启动PID41960，API14.368／6.0.5／cor-cotn active=true，stderr0。没有备份／额外实例／其他服务停止／Mirror或生产变化。

r40先正常GM登录并读回当前baseline：原587原始source逐项、其余两原Actor只允许精确已证实五changeID在临时JSON正规化后保持，模块集合／拥有对象／IDs/time核前后；再11项真实原生攻击／伤害受影响复验。新marker nativeAttackRulesStage独立，原失败nativeAttackRollStage RUNNING保留。新的安装字节接受不代替攻击实机接受，规则当前仍PARTIAL。


### 2026-10-04 r40 新字节原生攻击仍失败／转效果应用层诊断

r40客户端HTTP字节SHA6e71d821...已验证，新PID41960原target。安装前后587原Actor raw保持，另两个仅精确五changeID正规化hash相同；106／98模块、IDs/time/view/Combats/ownedScene/tokens/HP20-2/permissions保持。新marker nativeAttackRulesStage的复验只完成普通STR基线和Enfeebled两骰，后者仍mode0/hasDisadvantage=false，完整报告SHA5a0e9f9f152dad82946470f83448f96b9a2331dbffb6fa703142eaa911a0d91b。剩余6attack+3damage未执行；phase效果移除、weaponproperties[]精确恢复、原589 case前后raw相同、IDs/time保持。147静态通过与安装字节一致不能覆盖真实FAIL，也不能称修复有效。旧r37和新r40两个RUNNING失败marker都保留。

两次同一实际失败后不再重跑原攻击验收：r41转到native ActiveEffect存储、applicable/active/suppression、prepared能力attack/check/save mode及overrides层，正常CC apply/remove仅拥有Enfeebled实例，前／应用后／移除后三快照，零attack/damage，无prepareData手工调用、配置或模式写入、第三方禁用及原对象修改。暂不判断是效果保存／应用还是后续mode覆盖。


### 2026-10-04 r41 原生效果投射实证／r42实际Token场景前置

r41零攻击／伤害，正常CC apply后实际Enfeebled enabled/active/not suppressed且在allApplicableEffects中，system.changes含STRcheck/save/attack三个add -1／initial change，prepared三者mode-1且disadvantagecount1，overrides三者-1；remove后mode0/count0/overrides空恢复。完整报告SHAcf3376cdf606bfd55bf1a8868728f54f6c2e93a621bc4e4bb082d29e69ee8bd9，父机械核三快照、原589/world IDs/time保持。证明6.0.5原生效果保存和应用有效，但并未证明攻击最终模式通过。

转检查真实Token前置：安装AC5e源码getSubjectTokenForHook依赖speaker／actor.getActiveTokens，_buildBaseConfig的actor=canvas Token.actor；r37/r40拥有两Actor的linked Tokens虽已存在，但测试时场景不在GM当前画布。是否为最终模式丢失原因仍待实际反证，不能直接归因或关闭模块。r42用既有拥有inactive Scene的本地GM view、实际拥有source control和target选择补齐Canvas Token上下文，记录公开Hook模式与prepared字段并执行11原生attack/damage；恢复原GM view/level/control/emptytargets，原Combat全源和ownScene全源要求保持。无Scene.activate／原Token写入／模式或RNG注入／新增对象／全局设置变更，新marker独立保留旧失败。


### 2026-10-04 r42 Canvas Token复合前置未达／r43分项读回

r42拥有Scene.view后实际linked Canvas Token复合assert失败，发生在control／target／observer／所有骰之前；checks0、snapshots0，不能称Token环境攻击假设已测试。报告SHAd226ff7bd2135910d26c1313653f68829dd65e4364dbcb08803b037065415e28；finally原view／level、空control和targets恢复，ownScene完整hash前后cb74d773...一致、weaponproperties[]、HP20／2与伤势generic0、原589／world IDs/time／Combat保持。nativeTokenAttackRulesStage RUNNING保留。复合断言未记录具体失败项，Token可用／身份项仍UNKNOWN。

r43只读各个native Canvas前置，记录initialized/loading/ready/noCanvas/当前Scene、拥有TokenDocument和画布Token是否存在、actorLink/isLinked及Actor UUID/引用、marker、activeToken列表，再正常owned Scene.view一次并读回每项后恢复；不control／target／condition／roll、不写Actor或settings，不创建替代Scene。若当前loading／noCanvas前置不符，保留快照而非无新证据重试。


### 2026-10-04 r43 Token契约身份顺序更正／r44实际画布原生骰准备

r43分项读回证明canvas初始化ready/loading=false/noCanvas=false，正常view确实进入拥有Scene、两Token均渲染且linked。报告SHA660f6b4a2b5c2d9e56f50aad1c43a44fe3dbfab788761e63909597f63e2f004b。实际XrdTKwb9kunpei7z属于Actor.0e5NXsDag66VmH5p且role attacker-token；QxtFr6GGk7iVMHXg属于Actor.RyTpPtsl8jctRmo8且role target-token。r36返回数组tokens[0]/[1]未保持输入顺序，初始摘要／拥有victim中的旧nativeAttackerTokenId/nativeTargetTokenId标签和父r42契约因此反向；此处显式更正，不改Token数据或倒换Actor。实际Document.marker与actorId始终正确。r42失败精确是错误期待Actor引用，非canvas未加载。r43零attack/damage/conditions/control/target/Actorupdates，原view及source保持。

父修未来fixture生成器按actorId+role查Token，不再依赖返回数组顺序；已持久旧失败标记／旧fixture标签保留为历史，不用它们作后续真实身份依据。r44使用实际Xrd攻击者／Qxt目标及role+linked+owner断言，并先保存各predicate再执行11原生rolls和公开pipeline快照。无需修改当前Token／场景／全局设置；原GM view/control/空targets、ownScene全hash和原Combat须恢复。攻击上下文假设尚未实测，不提前归因AC5e。


### 2026-10-04 r44真实Token前置通过／投骰弹窗取消与视野fixture修正准备

r44正确实际sourceXrd／targetQxt通过Actor/role/owner/linked断言，原生普通STR基线完成；Enfeebled prepared mode-1，但AC5e双方看不见提示且transitadv/dis同时true，原生投骰dialog意外出现。执行器未指定模式，正常Close取消使finally完成。完整报告SHAe8668324bf2ea22192af7a057e902c03f3fae163a68b957f12b65e07c60457c5、checks1，剩余attack/damage未执行；另捕获preRollAttack toClipperPoints错误及包栈，不凭单个错误断言CC或第三方根因。所有观察器／phase条件清理，ownedweapon[]、原Scene/control/targets、ownScene全hash、原589/IDs/time/Combats和HP20/2保持。nativeCanvasAttackRulesStage RUNNING保留。

父核已有fixture配置：ownScene tokenVision=true但globalLight.enabled=false，两ownToken sight.enabled=false/range0，双方看不见是实际前置而非期望单一劣势的干净基线。Core14.368 Token.shape为正常公开渲染字段，在_refreshShape按帧初始化；先前宏await Scene.view后立即投骰未验证shape ready。r45仅临时正常修改拥有Scene globalLight.enabled/bright=true及两ownToken sight.enabled=true/range60、sourceToken x200使近战相邻；待正常渲染两帧并断言shape.toClipperPoints存在再执行11原生rolls，不patchshape／API／模块／RNG或mode。最后精确恢复light／sight／position、view／control／targets／weapon／条件；Scene语义比较仅排除本次明确拥有Scene和两Token的正常_stats时间变化，其他字段保持，原589仍全raw保持。不是全局设置或原场景修改。


### 2026-10-04 r45限定原生攻击与伤害骰11项接受／r46目标模式准备

r45在正常准备的拥有lit Scene、两Token sight60且近战相邻、shape正常渲染上下文，11真实原生检查PASS。完整报告SHA9b81621bf0474c70ff29d2e508e629b479c926cc6d29b6331e667f2950e1f816。普通STR／移除Enfeebled为1d20，EnfeebledSTR和ClumsyDEX为2d20dis、ClumsySTR对照普通；Jinxed减实际d4、Valor加实际d4及组合两个独立d4；原生weapon damage2d6+3+3、Weakened将骰和两加值分别乘0.5得到实际4.5、移除后恢复。未改RNG/骰/模式，没有意外弹窗选择或chat／HP应用。24公开Hook快照保留。几何readback证明shape.toClipperPoints可用，precontrol visionSource/LOS布尔实际false，不能推广为独立完整LOS接受。限定同构场景路径接受，不抹掉r37/r40缺Token及r44未照明失败。

exactownedlight／sight／xy恢复，前后Scene语义hash相同（只排本次拥有Scene和两Token正常_stats）；原view/level/control/emptytargets、observeroff、weapon[]／条件generic0／HP20-2/伤势0保持；原589等r44.after且本case原始hash前后相同、world IDs/time／原Combat全源保持。nativeVisibleAttackRulesStage COMPLETE。r46只做7原生target mode：Defenseless/Frozen/Shocked优势、移除恢复、真实Enfeebled与目标Defenseless抵消、Helpless不自动给优势对照；特殊crit／HP伤害floor／tick／move／HUD／WMP仍未验。


### 2026-10-04 r46目标Defenseless优势失败／r47公开接口最小读回

r46真实Token／lit sight／近战／geometry前置有效，普通目标基线通过；Defenseless已在拥有target条件列表，但实际原生attack仍1d20/mode0/hasAdvantage=false而预期ADV，完整报告SHA8558e8d606bf7a5e513fcfdceeb231a7d616d90f320b2535488caec2a221fea8。原生骰失败保留，剩余5项未执行，无模式覆盖或dialog。父核六公开Hook快照，均top-level及roll0 adv/dis同时true、AC5e目标优势未计入；尚不独据快照称完整覆盖因果。source/target phase效果和observer、weapon[]、临时owned light/sight/xy／Scene语义、原view/control/targets、原589及IDs/time/Combats和HP20/2伤势0均恢复。nativeTargetModesStage RUNNING留存。

父核安装AC5e14.603.2精确源码的公开ac5e.statusEffectsTables及statusEffectsOverrides API、目标status rules计数流程：getStatusEffectResult对缺表项直接空返回，override并不能为未注册状态补项。r47只读当前公共表的own fvtt-custom-conditions.defenseless及paralyzed结构、表可扩展性和公共方法存在，核真实最小接口；不直接改最终骰mode、关闭第三方或改持久settings。之后在CC内实现可清理的可选公开注册适配候选，合法优势／劣势通过既有引擎合并，不靠验收宏写期望结果。


### 2026-10-04 r47公共目标规则表缺口确认／可选注册适配候选

r47只读公共接口：AC5e14.603.2 active、global API/public table存在可扩展且引用稳定，CONFIG中自有Defenseless注册一次，但公共table ownEntry=null；paralyzed公开结构为_id/name/rules且attack.opponent函数。报告SHA09ae8daababf674b2c48a5f9a762ee611f976c855b8cc5153da28facf1e819b5。零状态／规则表／设置／Actor／Scene／Token／骰更新；原589比较未执行，不虚称新全量source通过。

父固定AC API/main/setpieces/settings源码SHA来源已保存target-rule-adapter-source-provenance.json，证明API tables与内部状态表通过同getter共享、公开statusEffectsReady通知、状态结果进入既有优势／劣势合并，未知状态在override前跳过。CC候选在精确14.368/6.0.5+active AC5e14.603.2下为一个自有projectedDefenseless条目添加opponent来源函数，Frozen/Shocked复用该状态；仅真实enabled非templateCC实例生效，裸状态／disabled不生效，处理API迟就绪，不覆盖既有注册，stop仅删同引用自有条目，不强制骰模式、不改AC源码／设置。两缺口检查旧实现FAIL，修复含冲突及版本护栏后152PASS；typecheck、手册30／build通过，候选runtimeSHA556ff6b7f218f21de5cb9f29108784a880f00fd5c92cce75ca8f369b41c6907a。只读升级预览仅CC两README+scripts/index.js，applyfalse/writes0/backups0，当前运行仍6e71...。r48先capture原589及精确五changeID正规化／拥有Scene／Combats／modules／permissions和AC automateStatuses实际值，再正常UI释放；关闭状态自动化则保留前置失败，不私改设置。候选未安装或实机接受，r46FAIL保持。


### 2026-10-04 r48基线与释放接受／CC目标规则适配定点安装

r48原589raw逐项等r46.after、模块106/98及world IDs/time/原Combat full hash保持，拥有Scene inactive/tokens2、HP20/2、伤势0、weapon[]、权限与原view空targets保持；AC automateStatuses实际true、旧own target entry缺失。正常GM UI Return未释放后以已有GMJoin重新登录改变前置，再新Settings Return成功active=false；SY已inactive，但此前tab已显示/，不虚称Join。父重新核owned PID41960/path/owner/loopback/activefalse并定点stop。旧6e71...识别门和每次写入前stopped guard通过，只有CC两个README及index.js更新。build/ZIP/installed31文件/CRC一致，runtimeSHA556ff6b7f218f21de5cb9f29108784a880f00fd5c92cce75ca8f369b41c6907a、ZIP SHAbdb9e1e1a2312e5a72ce5a3f1fd13f6cc4863273ca6a8e1ed79d5c14eac5bd8b，无备份/外部包文件或settings写入。

同app14.368/data server-next/worldcor-cotn/dnd5e6.0.5和原loopback/noBackups参数恢复PID36984，APIactive=true/stderr0。未改Mirror/production/其他服务。r49先正常GMjoin并核新客户端bytes/公开own target entry及autoStatusestrue，再read安装后587raw及另两精确5changeID正规化hash／模块／世界／拥有对象；之后七项目标模式受影响复验。新marker独立保留r46失败，注册存在／字节一致不代替真实规则接受。


### 2026-10-04 r49七项原生目标模式接受／r50真实HP伤害准备

r49已新GM登录并核live自有公共规则entry/opponent function/空target结果''和实机行为；HTTP按manifest index.js响应196033bytes SHA556ff6...，首次误runtime.js404记录后改正确manifest路径。没有提取浏览器响应body，不把HTTP字节hash冒称直接client-byte抽取。安装前后原587raw保持、两原Actor仅精确五changeID正规化完整hash相同，模块106/98、AC14.603.2/automateStatusestruе、worldIDs/time/原Combats/ownScene/view/HP20-2/权限保持。

完整reportSHA9c7d6915a6b2a4fe505858458f836adc2b23c4a1b1ddf712c25717848a3e59f3，7真实随机native targeted attack finalmodes[0,1,0,1,1,0,0]、21publicHooks：基线普通、Defenseless优势、移除普通、Frozen优势、Shocked优势、Enfeebled劣势+Defenseless优势合法相消普通、Helpless单独普通。无宏临时注册表／模式或RNG注入／dialog选择，规则由新CC自身注册。phase效果／observer／weapon[]／ownedlight-sight-xy及Scene语义/原GM view-control-targets恢复，HP20/2伤势generic0，原589case前后raw同/IDs-time-Combat保持。nativeTargetRulesRetryStage COMPLETE，旧r46失败留存。

r50真实native弱化DamageActivity骰经Actor.applyDamage到owned target HP，最多12随机骰观察实际小数且核向下取整；不得注骰或强制小数。Frozen用实际typed native DamageRoll 1d4的cold负对照／fire与bludgeoning累计到指定阈值6原生解除（最多6，HP保持正值），共享native计算/应用options，由CC既有Hooks结算。仅拥有targetHP20预备→实际damage→HP2恢复和本批已授权ownedfixture视野准备，无chat／original writes。未执行前不称HPfloor／Frozenbreak通过；特殊crit、tick／move／HUD／WMP仍未验。


### 2026-10-04 r50限定HP行为与恢复接受（跨客户端前置顺序缺口保留）／r51特殊暴击准备

r50实际weakened两NativeDamageRoll总值5、6.5，经Actor.applyDamage分别HP20→15、20→14，后者actual6=floor6.5。Frozen指定threshold6：真实cold d4=1、counter0，恢复HP20后仍0；fire4让counter4、bludgeoning4累计8并原生移除。reportSHAfe71e1269bafea698d4525b860bce93ae9c21c05a1cd81813932d337c90b98aa，原589本case前后raw相同，世界IDs/time/Combat、拥有字段及HP20/2伤势generic0恢复。

会话开始官方Chrome tabs.list空，旧GM651339461/SY651339574均No tab，不是执行器关闭；新owned GM651339587正常Join，SY未重建，不称旧tabs已清理。跨轮r49.after→r50.before两原Actor raw不同，执行器未在damage前拦住/核先序合同；测试后正常readonlybaseline证明其它587raw同且两Actor仅精确4+1 known changeIDs排除后完整normalizedhash与r49同，postreadonly等r50.after。父独立核并保存parent-adjudication为限定功能/恢复接受，前置晚执行及新client原因仅推断的缺口保留；模板NoHPapplication误文与真实已授权ownedHP动作区分，不改旧证据。

r51生成器加入动作前冻结589行聚合manifest：其余587 raw与身份全保持，两Actor只允许精确五generated IDs临时JSON排除且完整normalizedhash保持，任何额外差异在flags/fixture/light/conditions/roll/chat之前失败。source32112bytes SHA6550332ee9e02a882ca5577883a680c1777700d8a9828fc4a0f5f8397cf2c5d0已Nodevm与前置顺序断言。r51真实native AttackActivity.createChat消息验证ordinary／Helpless武器和法术／Frozen钝击武器与斩击或钝击法术负对照／高AC真实miss不强制crit，8证明各最多16正常随机抽样、排天然1和20；不注骰/期望crit/targets/type。仅normal owned AC.override10/50和weapon types prepare/restore；新增一个标记的owned cantrip Item以native AttackActivity factory创建其melee spell活动，保留供后续并批末清理，实际native消息只加ownership tags并保留精确IDs。特殊crit未验前不称通过；tick/move/HUD/WMP仍待。


### 2026-10-04 r51八项persisted特殊crit证明／额外通知导致总体失败保留

r51动作前原589聚合manifest与精确五ID正规化门通过，12真实native攻击消息给出8非天然1/20命中或miss证明：ordinary不crit；Helpless武器／法术hit转crit而miss不转；Frozen斩击weapon与钝击spell不转、钝击weapon hit转、miss不转。完整reportSHA29644419789788a5f8d359b305e16f834c4947908577c8641c9d30fb1c636aa7，proofs8逐项persistedCritical符合expected；returned源roll不crit而persistedMessage crit是实际preCreate转换，不是宏写结果。新增owned spellItem3x2JJeE6oQdENt38/activityvddvKJRYqCmYxcEQ保留。创建12精确phase/owner native消息，source天然20 xZcbaD5j3IU1irIx另同时间出现13th GM House Rules提示M6e4ddTQ3C07M3fs，总worldIDs门失败，原rawokfalse和stage先COMPLETE再cleanup失败的顺序保留。

原589case前后raw及worldtime保持；phase效果/observer/weapon[]/AC/weapon damage types/ownlight-sight-xy语义均恢复，HP20/2伤势generic0。联合assert因IDsfalse未证明最终view/targets，后置Combat fullhash未执行，不能提前称终态全接受。再次起始Chrome tabs为空，GM651339587不可用，新ownedGM651339591正常Join，非执行器关旧tab；SY不重建。

父只读安装fvtt-house-rules0.1.3的scripts/module.js SHA575ea2be64f086279bb700f156dc0cb3519c77b2c632eb9eb65aa3143cf3034a，processAttackChat对retainedNatural20调用postNaturalCard，该card带flags.fvtt-house-rules.naturalRequest并含messageId/actorUuid/activityUuid。r52只读实际extra旗标与天然20源消息绑定，并独立复验原view/level/control/emptytargets/Combat全hash/集合ID终态，不rerun已通过crit，不改House Rules、settings或删除任何消息。直接绑定未核前仅源码关联推断，无extra cleanup授权扩张。


### 2026-10-04T02:27:57.765Z r52独立恢复及精确通知绑定接受；按用户要求停止并记录

r52只读完整reportSHA4100911c2ac49824bd272220a0305f4e0bcd52a22e75cd156fc15ed8999dbd38，原589聚合门通过，world集合等r51.after、worldtime21085409、原GMview/level/control/emptytargets及原Combat完整hash9ba144...／ownScene语义均恢复。额外House Rules消息M6e4ddTQ3C07M3fs的naturalRequest直接绑定拥有天然20source xZcbaD5j3IU1irIx及sourceActor/weaponActivity；父独立核后接受8特殊crit证明及恢复，r51整体rawFAIL仍保留，批末可定点清理这条精确派生通知但现在不删。新ownedGM651339595，旧不可用tabs不称已清理。

用户询问为何耗时并明确要求当前处理完成后停下、记录并用小白可懂的方式汇报。主控在完成r52裁决后立即停止后续执行；Chrome任务已idle，无新dispatch。r53仅prepared source/Node语法检查，NOT_EXECUTED/NOT_DISPATCHED，不以准备称回合结算通过。技术耗时包含两个真实版本适配缺口（能力攻击劣势、目标优势公共表来源）及主控fixture准备欠缺（返回顺序导致Token角色映射反向、视野／照明／渲染前置），另有正常系统通知数量与client初始化ID比对造成的额外复核，不把所有延迟归咎新版。

当前限定已接受基础伤势/休息/快速复活、19实例生命周期、20原生检定、11攻击者伤害骰、7目标模式、真实HPfloor/Frozen伤害解除、8特殊crit。未闭合：CC回合tick、移动/动作限制及HUD、WMP接入与四模块联合收尾、其它复活仪式/多GM、最终拥有测试对象清理。代码152CC局部PASS/typecheck/手册30PASS；候选未commit/merge/push，未操作生产/Mirror。原ServerNext PID36984保持运行，不把停止代理工作解释成停止服务。所有拥有对象与证据保留以便接续。停点收据在当前实施树.local/next-four-modules-20261003/user-stop-checkpoint.json。

### 2026-10-05 r53回合结算接受／r56未执行业务／r57诊断结束，按用户要求暂停

r53五项流血／灼烧原生回合扣血、治疗及移除后边界获接受，r55独立恢复核对通过；r53/r54原始整体FAIL保留。只对拥有Combat的AC5e cadence.updatedAt记录精确原生时间戳例外，未扩大original Combat比较范围。原589来源、原10Combat、场景、世界时间与原视图保持；5条直接绑定condition消息和6条无直接绑定Monk通知保留。

r56移动／动作／HUD批在业务前错误使用Token.object.rendered，画布等待失败；steps=[]，没有实际移动／活动／HUD步骤、临时物品／状态或新消息。独立清理后原589raw/normalized、foreignCombats、场景、time、HP20/2和原view/control/targets保持，但拥有Actor整体来源比较FAIL，且修改前完整来源未导出。r57只读PASS确认canvas.ready、renderable、valid texture实际正常而rendered为undefined；保存当前拥有Actor0e5NXsDag66VmH5p完整来源，walk为字符串30、stage为RUNNING、CCnamespace absent；原速度及完整差异UNKNOWN，不凭默认值写回、不补称整体恢复PASS。r57只更换并恢复视图，无Actor／Item／状态／骰／服务写入。

用户再次要求当前处理结束后停止、记录并用小白可懂的话汇报。本轮诊断及回执父审结束后即暂停，Chrome执行聊天01a101cc-b72c-7571-ab86-d3af20bc102d当前idle，实际6.1-sol／medium／Full Access配置已核，无新dispatch；只读核ServerNext同实例PID33540／Administrator／127.0.0.1:30002／cor-cotn／14.368／6.0.5／active=true，保持服务运行。业务候选仍未提交／合并／推送。

仍待：修正测试方法并保存完整前后来源、明确拥有角色基线；只测未执行的CC移动／动作和HUD；WMP6适配与联合收尾；最终拥有对象清理。旧接受继续复用，其他复活仪式／多GM未验不自动扩scope。普通话汇报在实施树docs/reviews/2026-10-05-next-four-modules-progress.md；暂停原件在.local/next-four-modules-20261003/user-pause-20261005-r57/checkpoint.json，当前入口已更新。历史r52 STOP和前次resume授权保留，本暂停取代继续执行状态，等待用户新继续指令。

### 2026-10-05 r57误停纠正／按真实新批准继续原迁移

复核聊天01a10808-6835-7003-9054-d4d2fbbfef6e用户原消息于2026-10-04T18:08:56.401Z明确批准“可以，按照你说的继续处理”，获准方案原文hash已核。r57错误重用10/4上午旧STOP；该STOP此前已被10/4晚恢复取代，技术故障或等待回传不产生新暂停。历史pause／FAIL原件原字节保留；实施树business-resume-20261004/authority-correction-20261005.json记录纠错和实际授权，唯一current-checkpoint恢复ACTIVE，dispatchAllowed=true，不重复索取继续。先修当前harness的有效readiness、写前完整来源导出、独立恢复与字段diff，保留r56原速度UNKNOWN，声明拥有fixture现状新基线，跑通一条最小原生移动／活动／导出／恢复链后持续推进CC剩余入口、HUD、WMP6与限定联合收尾。旧接受不重跑，不追加其它仪式／多GM矩阵、不改共享app／Mirror／生产、不新增commit／merge／push授权。关键完整链结果或具体阻塞按实际批准回传复核聊天，成功后实施owner继续，不等待重复继续。

### 2026-10-05 r60最小链接受／r61原生运动属性缺口修复安装／r64窄复验

r60实际nativeutility和TokenDocument.move保存读回／完整恢复通过父审及独立复核，三source导出同报告，raw与semantic终态diff均空；原589／foreign10Combat／8集合／time／activeCombat／HP20-2／原view保持，无newchat。r59将createfalse返回draft误当chat的原FAIL保留，installed dnd5e6.0.5 bundle18211确认draft返回语义，早期trace已修。

r61无条件level1/bonuscantrip真实入口通过，随后Slowedprepared15断言FAIL，其余movement/actions/HUD未执行；十独立恢复全过、原数据保持。精确6.0.5 hasConditionEffect对property按连字符拆status-level，公共fvtt-custom-conditions状态被拆fvtt，三个源协议回归均先红。候选仅在6.0.5效果statuses与conditionEffects使用无连字符内部fvttcc别名，保持公开19项及5.3.3路径，不注册额外HUD项、不改prototype。155局部检查、typecheck、手册30/build通过；独立source检查Corestatus字符串无registry限制、actor收集all、hasLevels安全、HUD和图标不新增。

r62readonly baseline106/98与源保持，但正常Return仍active，FAIL保留；r63已有正常GMJoin改变前置并真实BUTTON本体GUI点击后setup/APIactivefalse通过。原589normalized7752...保持，当前clientraw e01bc...，仅known五ID初始化差异边界不扩大。父fresh核旧33540／Administrator／loopback／原app-data-world及inactive，再只停33540；stopped guard在安装及每文件write前核，仅CC README两份和index.js更新，旧tree53a44...→新726923...，31build/ZIP/installed SHA逐项同，runtime8d77e03ad2514c0c158efb72093c249750a53639980d4536c4ac341adeaba579。无backup／额外实例／Mirror／production／sharedapp改动。

同app14.368／data server-next／cor-cotn／loopback/noBackups参数relaunch当前PID11348，APIactive14.368/6.0.5/stderr0。r64派同6.1-sol/medium Chrome只验证三运动属性及原未执行动作/HUD，实际prepared/status/propertybooleans/失败值完整导出；已接受minimum、spell prerequisites和旧规则不重跑。新安装byte接受不是runtimePASS，WMP6仍后置；持续授权ACTIVE，等待callback不写用户暂停。


### 2026-10-05 r71 CC限定闭合与r72 WMP候选释放

CC r64移动／逃脱、r66行动、r67攻击次数／装备及r71真实厄运参数提交／病弱关闭均获父审，当前各批原589／foreign10Combat／成员／时间／视图与完整owned来源恢复成立。历史r56原精确速度缺口及所有FAIL不改。管理器在正常UI退出世界后按三文件计划更新，31 installed/build/ZIP一致，同Next新PID32816，14.368／6.0.5，CC当前8102b9e8构建；r71父审见本候选.local/next-four-modules-20261003/cc-hud-manager-fix-r71/parent-adjudication.json。

WMP6候选与CC native6Effects能力／system.changes桥已实现及打包。原生system消息与local10 type4单卡／单目标／实际HP绑定的局部检查通过，未知type0仍拒绝；普通critical base已有原生标记，不加位置猜测。CC163检查／类型通过；WMP244通过及1构建身份超时原件保留，该项独立复验与构建／artifact／类型通过；installer15通过、handbook30通过。当前r72只只读全来源／模块／原武器flags并正常Return Setup，之后父才精确安装CC与首次WMP8文件。WMP尚未安装、未启用或取得实机，四模块整体未完成。唯一当前状态仍在候选.local/next-four-modules-20261003/business-resume-20261004/current-checkpoint.json，ACTIVE，不需要新用户继续。

未提交／合并／push／生产或Mirror操作；保持唯一coupled写入者及同6.1 Sol／medium Chrome执行聊天，下一步只做新武器／联合代表实机，不重放旧条件矩阵。

## 2026-10-05 r73-r78真实WMP进度与r79修复安装准备

首份CC原生武器写入/WMP已在Next安装并通过正常UI启用，PID13940/Core14.368/dnd5e6.0.5。r73 ready、r74实际Slow强弱接替与Fatal骰接受，观察器原FAIL缺口保留。r75错误测试配置、r76临时flags比较超时均保留；r77完整持久来源精确恢复44条injury记录。r78真实WMP.use暴露重复原生攻击窗口及selection错误，计划HP链未执行，12清理/完整来源/原589/foreign10/member/time全部PASS。修复让Midi负责一次攻击，同nonce/可用棋子目标，按真实攻击边界返回并区分preAbort；不强制改自动伤害设置。250WMP检查、类型、构建、产物、30项手册通过；新build6647be尚未安装。r79已派发只读基线和正常Return Setup，收到inactive后才停止绑定的自有Next进程并安装三文件补丁。原范围继续，修复后的实际HP/同卡/效果、终止和最终收尾仍待完成；无业务提交/合并/推送，无Mirror/生产操作。详见当前候选docs/reviews/2026-10-05-next-four-modules-progress.md和.local/next-four-modules-20261003/business-resume-20261004/current-checkpoint.json。


## 2026-10-05 r84-r95四模块限定迁移收尾完成并停止

本次限定本地 TE／CC／IFS／WMP 迁移、约定玩法、自有夹具清理、文档等价包实装及最终加载读回已闭合，按用户要求结束新操作。当前 Next 保留运行：PID43152／Administrator／127.0.0.1:30002／cor-cotn／Core14.368／dnd5e6.0.5。未升级 Core／system，未改 Mirror／生产／共享app，未提交／合并／推送或清理工作树。

WMP 重复发起攻击的问题已修复。r80 单次真实攻击与同卡伤害保留，r84 从恢复后的同一卡片另行完成实际 HP2→0／Slow 30→20，并接受真实掷前取消及 Sap 释放；不把 r80 超时原FAIL改写成连续流程PASS。r86 严格两Actor／一Scene／一Combat已删除，精确已完成Midi流程移除；所有消息、Macro和源证据保留。新增RoundEnd按源码和实际卡片接受。原589Actor归一化／foreign10Combat／64Scene客户端hash／成员／时间／原view与控制目标已核；r90→最终1667Setting id／key／user／rawhash逐项一致，孤立迁移标记rawhash保持。

最终安装47文件均match。TE／CC脚本原字节不变，IFS未变；WMP文档更新仅改变README及嵌入buildId，剥buildId后行为字节一致，复用旧实机及CI：当前build32515e4a042d44fc174c270b862f7f341774e9fc27532b66d304e1a9c00385f2／script19f42f7d05ac18e2c945c878cc6ef251d92cfb4334a61d60a156da2d32bef62f，实际WMP ready/runtime.started、CC native6能力1、107登记／99启用。此前集成CI exit0、CC163检查／WMP250检查、手册最终30项通过继续有效。短Setup／启动窗口、缺前置派发0浏览器动作及读回脚本FAIL原件保留，不重跑绿色玩法。

历史证据限制不抹掉：r56旧测试Actor原速度UNKNOWN；个人GM日历HUD旧坐标未保存；孤立permission_viewer.migrated无时间。Scene2rQFnhlfPt5sGJ9i（叛神殿）当前读取构造会为两Item效果补十个随机system.changes._id；r95同rawserver data两次本地构造与live只差这十ID，剥副本ID后全同9f2bc26ef4ae54cae8fbf144d92e1ef065b2a67e2643b82708cbe4a4f339affa，raw GET稳定／live与集合不变／SceneWrite0。但旧r85完整Scene.before未捕获，不能补称历史全部65Scene字节原样。全部19状态动作组合／8精通逐项／多GM／长时／其它复活仪式／生产仍不属于本次接受。

最终进度：[2026-10-05限定迁移记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-164211-next-four-modules/docs/reviews/2026-10-05-next-four-modules-progress.md)。最终父审：[r92/r95收尾](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-164211-next-four-modules/.local/next-four-modules-20261003/wmp6-native-hp-r75/parent-adjudication-final-readback-r92.json)。唯一当前检查点仍在该候选 .local/next-four-modules-20261003/business-resume-20261004/current-checkpoint.json；完成后dispatchAllowed=false。新增范围等待用户新请求；旧业务PASS和全部原FAIL保持，无自动继续派发。
