# Midi-QOL dnd5e 6 兼容修复计划

当前续接（2026-09-23）：Batch6 DAE/Tidy实际UI发现普通ActiveEffect创建被dnd5e6.0.2无ID状态迁移误判为condition，详见[迁移总报告](./server-mirror-to-server-next.md)的AH段。锁定原上游及既有四补丁不变，新增独立patch0005/local.8候选仅在Midi自有ActiveEffect子类新建无ID非condition效果时先分配ID。构建TypeScript baseline/candidate均0，最终80/80源码测试、更新器预览、模块类型检查和手册一致性检查通过。受限在线更新已仅替换JS/source map/module.json，ZIP SHA256 4E1A222E3D60557D8172164EF71CBC44973027749BFF6997DE59F88093E55A2F、磁盘/HTTP bundle SHA256 2DAB2B3A021FDB603F1680D0FA962E5E68022887A45A0248D997EA48D9AAE6F8，PID43656未变；新客户端浏览器验收尚未执行。local.7旧35项保持其原版本PASS。

最终状态（2026-09-22）：Batch6的Midi-QOL兼容验收及授权清理已完成，[A–G总清单](./midi-qol-ag-acceptance-checklist.md)35/35关闭。AE正常API删除九个root和AA临时宏共10个，父方复核全部absent、配置恢复、无目标/工作流残留、共享状态不变。ServerNext PID34548持续运行；local.7未重装，既有dirty保留，未提交或生产回迁。详见[最终交付](../../foundry-modules/midi-qol/evidence/final-delivery-20260922.md)。本结论仅关闭本轮Midi兼容/清理，不代表后续迁移批次或其他模块资源告警已解决；以下旧状态按日期保留历史。

最新状态（2026-09-22 AD/AE复核）：A–G全部已有历史或当次通过证据，总清单33/35。AD单次原生Shield自然到期及当次Z02恢复通过；AE新独立Luna Max / Full Access任务因Chrome提供方缺席未执行清理。仅Z03精确自有对象清理和Z04最终交付未完成，服务PID34548保持运行。当前结论见[A–G总清单](./midi-qol-ag-acceptance-checklist.md)和[AD/AE复核](../../foundry-modules/midi-qol/evidence/ag-review-batch6ad-ae-20260922.md)，下方旧阶段状态保留历史。

当前续接（2026-09-22 08:58）：官方外部Chrome已通过压缩传输修复恢复，真实打开/读取/点击验证通过。全新Luna Max E2E任务 Access/never；只测剩余编号。详见[A–G总清单](./midi-qol-ag-acceptance-checklist.md)最新派发记录。以下故障和旧PID描述按各自时间保留历史。

## 2026-09-22 新主任务续接

已核对指定worktree/branch/HEAD及既有dirty，local.7哈希匹配且未重装。经授权恢复ServerNext，08:00:30实测PID34548、127.0.0.1:30002、14.368/dnd5e6.0.2/cor-cotn、join200及HTTP bundle哈希一致；服务保持运行。新主任务初次绑定返回`Browser is not available: chrome`；随后经官方createBrowserTab入口注册了Chrome提供方，但再次复现`Unable to load browser request-header policy`，仍未取得可操作页面。验收未新增PASS，Z02须实时复核。当前事实和证据详见[A–G总清单](./midi-qol-ag-acceptance-checklist.md)的本次续接记录；下文交接/旧批次内容保留其历史时间语境。

新callbackThreadId：`01a0c666-44c3-7010-8d64-7eb1582a5d7f`。未创建E2E执行器，待官方Chrome提供方真正可用并核实Luna Max/Full Access后派发。


交接时状态（2026-09-22 07:48，后续实测见上方）：local.7已安装，P已验证附魔应用/移除和旧卡升环伤害；A–G总清单29/35有历史通过证据，整体未完成。T/U/V/W及主任务亲试均因Chrome策略初始化失败而未进入页面。交接时30002无监听、API连接拒绝，旧PID59816已不是当前运行证明；服务退出原因未知。本轮仅整理交接。请先读[最新迁移交接报告](./server-next-migration-handoff-20260927.md)，再按总清单处理剩余项。

日期：2026-09-19

历史离线阶段（2026-09-21，后已安装）：local.7附魔clone修复完成构建、70项测试和只读安装预览时尚未安装/E2E，实际服务当时为local.6。该阶段保留在[local.7校验记录](../../foundry-modules/midi-qol/evidence/local7-validation-20260921.md)，不能当作当前未安装结论。后续恢复/清理与浏览器故障以交接和验收总清单为准。

**实时验收入口：[Midi-QOL A–G 验收总清单](./midi-qol-ag-acceptance-checklist.md)。** 后续派发按该清单的固定编号列出要测、已过不重测和未执行项；父任务复核证据后更新勾选。本文保留开发过程，历史状态不替代总清单。

## 目标

2026-09-20 最新执行授权：持续推进至 A–G 全部处理并验证，不再以单项 C/F 或单次派发为任务完成边界。用户明确取消本任务的测试时间限制并要求 Full Access；它覆盖旧 handoff 的 25 分钟及项目默认 30 分钟限制，仍记录耗时、网络故障、证据和清理，不追溯修改旧轮次当时的超时结论。ServerNext 永久运行、Mirror 只读、无提交/生产操作等边界继续有效。完整接续协议见 `foundry-modules/midi-qol/evidence/ag-continuation-20260920.md`。

为 `server-next` 的 Foundry VTT 14.368 + dnd5e 6.0.2 建立一条可持续维护的 Midi-QOL 兼容修复线。当前阶段只处理 dnd5e 6 兼容性 Bug，尽量保持上游行为和模块 ID 不变，方便以后官方正式支持 dnd5e 6 时切回官方版本。

`server-mirror` 继续保持只读，本计划中的源码修改、打包、安装和 E2E 只针对 `server-next`。

本线程此前完成的世界迁移、模块分批安装、官方最新版复核、Midi-QOL beta 构建、服务器 smoke 和部分玩法检查都属于同一个 `server-next` 升级任务。完整批次历史和证据索引见 [Server Mirror -> ServerNext 分批迁移计划](./server-mirror-to-server-next.md)。旧 E2E 报告只作为问题复现证据；本轮 A–G 完整验收以修复候选的独立 Chrome 报告为准。

## 固定执行环境

本任务显式覆盖 `fvttV12JsonGenerator` 项目通常使用的 Foundry 14.364 / dnd5e 5.3.3 `server-mirror` 默认值。后续代理进入本 worktree 后，必须先按以下身份核对目标，再执行任何安装、启动、测试或数据操作：

- 代码与计划承载项目：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration`
- Foundry 数据根：`F:\FoundryLab\foundry-v14\data\server-next`
- 模块目录：`F:\FoundryLab\foundry-v14\data\server-next\Data\modules`
- 世界目录：`F:\FoundryLab\foundry-v14\data\server-next\Data\worlds\cor-cotn`
- 本地入口：`http://127.0.0.1:30002`
- Foundry：`14.368` / Build 368
- 游戏系统：`dnd5e 6.0.2`
- 世界：`cor-cotn`
- 证据根：`F:\FoundryLab\foundry-v14\evidence\server-next-migration`

禁止把本任务的构建、安装或验证指向 `F:\FoundryLab\foundry-v14\data\server-mirror`。该目录只允许只读对照；不得向其中写入 Midi-QOL beta、不得升级其 dnd5e、不得用它替代 `server-next` 完成验收。每次启动前都要核对 data path、Foundry/dnd5e 版本、world、端口和实际进程命令行；任一身份不匹配时停止执行并修正目标。

用户要求`server-next/30002`保持常驻：E2E不得启动、停止或重启它，结束保留服务。随后用户明确授权主任务处理实际停服恢复，并于2026-09-21要求重新启动；这允许主任务在重新核对实例/占用后恢复原ServerNext，不授权为测试而日常启停。安装候选仍须遵守限定范围，不得用历史PID或旧清理指令停止共享进程。

## 当前基线

- 承载项目：`I:\OpenCode\fvttV12JsonGenerator`
- 开发 worktree：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration`
- 项目分支：`codex/20260919-151319-server-next-migration`
- 上游仓库：`https://gitlab.com/tposney/midi-qol.git`
- 上游开发分支：`origin/dnd6`
- 当前源码提交：`4338eeab85041cd71b76ede36818e2265cbf06ae`
- 上游源码快照：`I:\OpenCode\remote\builds\midi-qol-beta-dnd6-4338eeab`
- 上游源码快照分支：`server-next/dnd6-bugfixes`
- 已安装历史测试模块版本：`14.6.0-beta.4338eeab`
- 当前候选版本：`14.6.0-beta.4338eeab.local.6`；local.1/local.2 已被运行时错误拒绝，local.4 在部署前因缩放恢复审查被拒绝。服务器可能仍显示缓存的 local.2 元数据，实际受测代码须核对五项指纹（cleanup方法两项、item/activity getter两项、damage target builder）。
- Foundry：`14.368`
- dnd5e：`6.0.2`
- DAE：`14.0.14`
- World：`cor-cotn`

外部上游快照已经存在本地打包相关改动：

- `package.json`
- `package/module.json`
- `package/midi-qol-v14.6.0-beta.4338eeab.zip`
- `package/midiqolbeta-v14.6.0-beta.4338eeab.zip`

这些内容属于 `I:\OpenCode\remote\builds\midi-qol-beta-dnd6-4338eeab`，不是本 worktree 的改动。本轮保持该 dirty checkout 不变；构建从锁定 SHA 新建隔离源码目录，不复制或覆盖这四个文件。

## 许可证 Gate

仓库当前 `LICENSE` 明确为 MIT License，Copyright (c) 2020 Tim Posney。MIT 条款允许使用、复制、修改、合并、发布、分发、再许可和销售软件副本，分发时需要保留原版权声明和许可文本。

仓库同时列出了独立授权的声音和图标素材，包括 CC BY 3.0、ZapSplat Standard License 等。因此：

1. 本地修改和本地 `server-next` 测试可以继续。
2. 如果以后公开发布修改版，保留原 `LICENSE`、版权声明和作者信息。
3. 公开发布前单独核对随包素材的再分发和署名条件。
4. 不假定项目名称、Logo 或其他品牌元素由 MIT 自动授权，若要公开发布独立 fork，再单独检查品牌使用规则。

当前阶段只做本地兼容修复，不发布外部发行版，因此素材再分发检查不阻塞开发。

## 上游与补丁策略

项目内开发统一在 `codex/20260919-151319-server-next-migration` worktree 分支进行。每次修改第三方模块前先检查 Midi-QOL 整体的官方 release、分支和开放 MR；官方没有适用修复时才使用 `foundry-modules/midi-qol/upstream.lock.json` 固定的源码与独立补丁。

补丁必须能对锁定 SHA 精确通过 `git apply --check`，并记录 SHA-256。上游包含同等修复后删除相应补丁并重跑同一验收矩阵。本轮不自动 commit、merge 或 push。

## 第一轮源码修复范围

优先修已经有根因证据的问题。

### 1. ActiveEffect / dnd5e 6 数据模型

已知现场错误：

`system.type may not be undefined`

当前证据指向 `Workflow.setupTemplateCleanup` / `processPlacedTemplates` 创建 ActiveEffect 时仍沿用旧结构。dnd5e 6.0.2 注册的 ActiveEffect data model 包括 `base`、`condition`、`enchantment`，系统自身创建普通 ActiveEffect 时会显式使用 `type: "base"`。

第一步修改：

- 审计 Midi-QOL 所有 `ActiveEffect.create`、`createEmbeddedDocuments("ActiveEffect", ...)` 和等价构造路径。
- local.2 当前补丁在三个普通 Midi 临时 ActiveEffect 上填写顶层 `type: "base"` 及 `system: { type: "base", changes: [] }`。这是待核实的候选形状，不是模型要求：dnd5e 6.0.2 的 BaseEffectData 不定义 system.type，ConditionData 才定义该必填字段。需核对 _initializeSource 是否将无 _id 的普通效果误迁移成 condition，并在真实运行时读回最终 document type 与 system model。
- 避免只修一个调用点后在其他 workflow 再触发同类错误。
- 本轮只声明固定 Foundry 14.368 / dnd5e 6.0.2 目标，不扩大未测试的 dnd5e 5.x 兼容承诺。

### 2. Natural 1 / Fumble 伤害卡

上一轮 external Chrome E2E 中，自然 1 已判定 `FUMBLE: naturalFumble`，实际伤害没有自动应用，但聊天卡保留了手动伤害/Apply 控件。官方历史 issue 说明 fumble 后保留手动伤害入口可能用于特殊能力；控件存在本身不再作为失败依据。

处理方式：

- 跟踪 natural fumble 后的 workflow state 和 damage-roll/chat-card 创建条件。
- 验证 natural 1 不进入错误的命中集合、不自动掷普通命中伤害、也不自动扣减未命中目标 HP；手动伤害入口按官方行为保留。
- 修改后确认普通命中、普通 miss、critical hit 和 natural 1 都不会发生回归。

### 3. DAE 条件链

上一轮 DAE 结论受“检查了错误 Actor 的 effects”影响，不能直接作为 Midi bug。

这一项先重新做正确 Actor 的运行时验证。只有能够稳定复现 Midi 侧错误后才修改源码。

### 4. Concentration

batch6K 已补齐一条真实专注链：Fly 建立 condition 专注与 base 依赖效果，正确持有者受真实攻击伤害，DC10 检定成功后保留，失败后专注和 Fly 效果均删除、飞行速度回到0。父任务读取 establish/success/fail 三份证据，保留这条链的通过结果（local.3，测试配置 doConcentrationCheck=chatOnly、removeConcentration=true；并非任意配置或所有DC边界的承诺）。执行器报告已把临时 removeConcentration 恢复，完整配置恢复将并入最终清理核对。无需无理由重跑已通过的零缩放专注场景。

随后 C Longstrider 已在正确目标产生 walk30→40 的效果；删除后的 walk30 由执行器观察，需补入落盘的收尾快照。Poisoned 活动的 Apply 点击遇 CUA unreachable，结果未确认，恢复后必须先读回而不是重复点击。父只读检查确认 ServerNext PID11188与HTTP200，不能将其等同浏览器连接正常；已授权执行器恢复自己的30002页面/控制会话，禁止动30001或共享服务。

### 5. 恢复聊天卡的手动 Damage（batch6K 新增）

local.3 A–G 验收中，普通 miss 本身未错误命中/自动伤害，但点击允许的手动 Damage 两次复现 `itemUuid undefined` 与 `onUseMacros` 的 `null.getFlag`。被动读回确认源 Item 存在、`flags.dnd5e` 缺失、`system.item/activity` 正确，原生关联 API 可恢复物品；`SaveToChatCard/UseWeakReferences` 均开启。`Workflow.item` 仍读取旧 flags 是根因。

官方分支与开放 MR 具体代码复核未发现适用修复。独立 patch 0002 为 local.4 恢复 dnd5e 6+ 的绑定活动物品或原生 scaled associated Item，保留5.x旧行为与真正缺失源的诊断；patch 0001 不变。先完成源码回归、负向变异、构建和审查，再仅更新浏览器资源。Chrome 在现有任务继续其他项，待新候选就绪后于当前场景完成处刷新并复测保留的失败聊天卡，不停服。此问题归 G 的真实错误，不以“手动按钮存在”把 A miss 改判失败。

local.4 构建 TypeScript 0/0，但独立审查发现先恢复 activity/actor 再读 item 会丢失 system.scaling，因此未部署并递增为 local.5：6.x activity 使用原生 scaled association，5.x 保持旧分支；增补真实 getter 读取顺序及负向变异。local.3 仍是已安装基线，安装门禁通过前不改变运行资源。

local.5 门禁及更新已完成：58 项测试/219 断言、模块工具 TypeScript 与上下游构建 TypeScript 均通过；独立 reviewer 关闭缩放 P2。ZIP `9096FD772DC5FA6AAA440DCE392A0D688FCAD58650E4C55E03895F57DD1A29EA`，磁盘/HTTP bundle 均为 `0EC5DB3B8FBF927DB1CF8652A1FBA6215BE9FA749843CD8A6C2D60F0404A0964`；仅替换三个浏览器资源，PID 11188 未变。Chrome 继续全矩阵并待刷新后复测保留的失败卡及缩放活动；G 的该失败尚不改为 PASS。证据在 batch6K 的 local5-* 文件。

local.5 原失败卡复测已通过：四指纹匹配，原 miss 卡手动 Damage 掷出1d8+3=10，workflow完成；hitTargets仍为空，未点击Apply，Actor实际HP46未变（damageList中的46→36只是提案，不是已扣血）。未再出现missing-item/getFlag错误。缩放活动真实复测仍须独立证据。

### 6. 无有效 Token 的伤害列表渲染（local.6）

旧卡进入viewport时出现calculateDamage(undefined)。源码证明RecordedTargets可降级为Actor-only，但父类伤害面板要求Token.actor；原Midi guard在super之后。具体触发的旧卡/UUID仍需Chrome定位，不把时间上在local.5重载后出现误称local.5源码引入。独立patch0003在父调用前把Actor-only/actorless/missing Token显示为不可操作Unavailable行，不提供伤害数字或option，不猜替代目标；有效目标维持原逻辑，真实计算错误仍暴露。

local.6 的67项测试/259断言、上下游TypeScript0/0及独立审查通过，已仅更新三个资源并核对磁盘/HTTP bundle `734B6F7C0405EFA152B231A30D9131BD4436179383C68549BB2BB8D5ECFB2AE1`；ZIP `5EBDE9D568F195A283612CB92EB6E26351969C88159641B5D842E88D51FFE879`，PID11188不变。新增第五项组件指纹，Chrome验证真实旧卡渲染/不可用目标不扣血/有效目标可用后才关闭该G问题。完整A–G继续。

## 本地验证顺序

每个源码修复完成后按以下顺序验证：

1. TypeScript/build/lint 或项目已有的等价静态检查。
2. 打包生成新的本地测试 ZIP。
3. 只安装到 `server-next`，保持内部 module ID 为 `midi-qol`，以维持 flags、Hooks、模板路径、DAE 和其他生态模块兼容。
4. 当前 30002 为永久共享服务，禁止启停；先核对运行身份与候选资源。冷启动历史证据单列，不把浏览器资源更新写成新冷启动通过。
5. 使用 external Chrome 对实际 `cor-cotn` world 运行玩法 E2E。

### 当前候选验证状态（2026-09-19）

- `local.1`：静态、构建、安装和服务器 smoke 通过；实际模板放置仍复现 `system.type may not be undefined`，候选已拒绝。
- `local.2`：初始化顶层 document type 和 typed system data；静态测试 6/6、补丁前后 TypeScript 0/0、构建、安装和第二次冷启动通过，ZIP SHA-256 为 `895520AF6402E542B4EA4582AF221036B5AAA26F0CA987C639491807AE5ADC36`。
- `local.2` Chrome：早期一次放置和错误配置轮次证据不足。2026-09-20 batch6I 在正确的 1 minute / Circle 30 ft 活动中确实触发 setupTemplateCleanup，再次复现 `system.type may not be undefined`；effect 数量 0、dependentOn=null，创建与链接 `FAIL`、cascade `NOT_EXECUTED`。所有该轮对象已清理，30002 保持运行。
- `local.3`：三个 Midi 自建普通清理 effect 补新 `_id`，保留顶层 base 和 system.changes，去掉无效 system.type。真实 dnd5e 源码与同会话 fresh-ID/base 对照证明缺 ID 迁移碰撞；源码修复并不替代真实创建和删除链验收。更新只限核验后的浏览器资源，保留 compendium、世界和永久服务；候选方法指纹与服务器缓存版本分别记录。
- `local.3` 准备门禁：构建 TypeScript 0/0、更新前 43 项测试通过，独立审查和更新预览通过。2026-09-20 已替换 bundle/source map/manifest 三个文件，磁盘与 HTTP bundle SHA-256 一致，PID 11188 未变；没有冷启动。ZIP 为 `29E180D1093F6FB2A3006B7C4E99C887E933E08D67EC328640DFC1D74B16115B`。batch6J C/F 真实创建与删除链仍待独立 Chrome 验收。
- batch6J 回传：普通模板链观察通过——base/BaseEffectData、60 秒、dependentOn、原生 effect 删除 cascade 均有执行器记录，实际两方法指纹符合 local.3。范围不等于完整 C/F；原始 JSON 未保存、Console 未执行，Macro 尚待清理，且运行约 63 分钟违反 25 分钟上限。整体交付仍未关闭。Calendaria 11:44:42 条目晚于报告的本轮开始时间，不能仅凭时间称其历史错误；父复核已要求修正。见 `foundry-modules/midi-qol/evidence/local3-runtime-review-20260920.md`。
- batch6J 清理收尾：执行器已通过原生 UI 删除最后的临时 Macro，完整名称搜索无匹配；04:51:25 UTC 复核 HTTP 200、PID 11188。未重跑测试或启停服务。报告已修正 C/F 范围及 Calendaria 时间；临时世界对象清理完成，原始 JSON/Console 缺口和超时 FAIL 仍保留。
- A、B、D、E 和完整 G 尚未在 `local.2` 上执行。30002 由用户管理为常驻共享服务，后续可以直接运行受控 E2E，禁止任何进程启停。
- C/F 新夹具使用 `midi-qol:prepare-cf` 生成测试宏：输入和实际创建后的 Activity 都必须通过 1 minute、Circle 30 ft、creature、120 ft range、非专注及 template prompt 校验；未通过就停止施放。新建仅客户端查看的测试 Scene，不激活到其他用户；走真实 activity.use 及 effect.delete，读取实际类型和 dependentOn，禁止注入预期 workflow 结果。

## E2E 验收矩阵

修复候选的独立 Chrome E2E 使用明确的 `PASS / FAIL / NOT_EXECUTED`。旧报告不能替代本轮验收：

| Gate | 场景 | 本轮目标 |
| --- | --- | --- |
| A | 武器攻击 | natural 1 不自动命中或自动施加普通命中伤害，同时验证正常命中、miss 与 critical |
| B | 法术/豁免 | 成功、失败、半伤或无伤与活动定义一致 |
| C | DAE / Active Effect | 正确目标 Actor 上实际创建、持续、移除 effect |
| D | Concentration | 完整建立、受伤检定、成功/失败、清理 |
| E | Reaction | 提示、接受、拒绝/取消、资源与反应状态 |
| F | Template / AoE | 模板、多目标、临时 ActiveEffect 创建与清理，并补测召唤/变形清理 |
| G | Workflow / Troubleshooter / Console | workflow 无挂起，记录 Troubleshooter；如 backend 仍无法读取 Chrome Console，明确记为证据缺口 |

临时 Token、Actor 副本和测试对象执行 cleanup；测试 ChatMessage 可以保留为 E2E 证据。

## 完成标准

这一阶段达到以下条件后，才把当前 beta 视为 `server-next` 可日常使用候选：

- 已知 ActiveEffect dnd5e 6 schema 错误消失。
- Natural 1 不产生错误自动命中、自动伤害或 HP 应用；手动入口不单独判失败。
- DAE 实际条件链通过。
- Concentration 完整链通过。
- A–G 均有本轮有效运行时证据。
- Foundry 冷启动和 world load 通过。
- 没有新增 Midi-QOL 归因的 stderr / Troubleshooter 错误。
- 修复以锁定来源和独立补丁保存，能够从上游 SHA 重建；本轮不要求提交。

## 官方正式版切换策略

当 Midi-QOL 官方稳定版本声明支持 dnd5e 6 时：

1. 保留当前来源锁定、补丁与回归证据作为历史参考。
2. 把来源锁定更新到新的官方稳定 tag/commit。
3. 对照每个本地补丁检查官方是否已经修复。
4. 只保留官方仍未包含的补丁。
5. 重跑同一套 A-G E2E。
6. 全部通过后再替换 `server-next` 当前 beta 包。

这样本地开发线始终可以被官方正式版替换，且不会形成难以拆分的长期 fork。
