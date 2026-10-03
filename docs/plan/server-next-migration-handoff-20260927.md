# ServerNext 迁移：唯一当前状态与执行入口

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
