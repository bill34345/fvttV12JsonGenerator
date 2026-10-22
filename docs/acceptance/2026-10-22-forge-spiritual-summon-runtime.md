# 灵体武器召唤、移动与攻击实机验收

日期：2026-10-22。用户授权继续复用原worktree补召唤物摆放、移动与攻击，不新增模型调用。唯一续接入口仍为[当前状态](../plans/2026-10-20-forge-ab-current-state.md)。本次原生摆放、键盘移动、实际攻击伤害、刷新及最终精确恢复均已父审通过。

## 目标与证据

- 原工作树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支 `codex/20261019-forge-ab-fixed-replies`；复用原N2正式包 `proof-n2-de2a81a5`、包hash `173008952c08089d96150328d657a81c70cf04696515e08c6ad2129278e26e32`。不手写、修补最终Actor，不重新生成模型回复。
- 同一 `server-mirror`／`cor-cotn`／`127.0.0.1:30001`，PID35252，Core14.368／dnd5e5.3.3／Midi14.0.11。Forge脚本仍885d42d5…、Resolver仍68f6cd75…，本次没有安装、启停或修改服务，没有生产操作。
- 复用同任务Chrome执行器，实际最新配置 `gpt-6.1-sol`／`medium`／Full Access。正常官方连接器操作独立owned页651349036，原5页保留。代码工具只准备只读观察器和明确的独立fixture；原生召唤、位置移动、目标选择、攻击与伤害均在正常UI执行，没有直接调用activity.use、写期望坐标、篡改骰子或直接改目标HP。
- 新证据在 `.local/forge-spiritual-summon-20261022/`。原513份冻结证据及上批完整记录共607文件继续hash保护。公开Hook与完整Actor／Token／消息原件分别保存，不拿工具“成功”回执替代实际行为。
- 使用新的持久baseline保存原checkpoint与集合，原snapshot SHA29d5…95a／审计273，11集合原ID、Guard8Item／24Token、场景、视图、时间、暂停和目标均纳入保护；原世界没有同来源武器模板。任务初始化器跨刷新复用原基线，严禁从测试状态重新采集。正常Macro UI保存的命令hash等于完整源码去首尾空白后的hash。

## 原生召唤摆放：PASS

正常导入同一正式N2包，建立独立非active测试Scene `20c96a40a10ffd35`，网格100像素／5尺。施法者Token `c5bdb000dea64445` 位于 `(200,400)`；独立可见靶子Token `587eb16bc6b61447` 位于 `(900,400)`，目标Actor `6130cfc51ec7fd61` 为AC10／HP40。原活动场景和既有对象未改。

正常角色卡选择Spiritual Weapon Cast，原生对话框保持召唤物摆放与资源消费。原生profile `Compendium.dnd-players-handbook.actors.Actor.phbsplSpiritualW` 自动导入新的world模板 `phbsplSpiritualW`，创建unlinked武器Token `SjGTrjit2G9GCzhA`。实际落点 `(700,600)`，与计划点不同但在来源60尺范围内；保留实际结果，不为对齐计划修改坐标或重做召唤。

武器合成Actor的summon origin准确指向本次邪教徒缓存法术 `Actor.066f8a30abad74d9.Item.YjRNRuRO0GhMHxFM`，level2／mod2，近战法术攻击flat+4、5尺、bonus，伤害公式为本次等级的1d8+2 force。preSummon／preSummonToken／summonToken／postSummon与createToken均实际观察到，observer无错误。父能力spent0→1，上限2，其他池保持。

证据：`baseline.json`、`prepared.json`、`after-placement-attempt.json`、`parent-baseline-review.json`、`parent-placement-review.json`。

## 正常移动：PASS（键盘路径）

两次官方AX.drag返回成功但武器仍 `(700,600)`，没有位置更新，已停止该路线并保留失败原件。ArrowRight仅平移画面，也没有算移动。按项目重复失败规则读取官方一手issue、通用说明和精确Core14.368源码后，确认当前版本方向键用于画面控制，W/A/S/D用于Token移动；暂停只限制非GM。通用网页仍混列旧快捷键，不覆盖精确版本源码，见[控制输入核对](../reviews/2026-10-22-foundry14-token-movement-controls.md)。

未指定时长的一次D仍无位移，随后核对官方接口文档明确支持按住时长，正常使用`duration:0.12`秒：D使 `(700,600)→(800,600)`，W两次分别到 `(800,500)→(800,400)`。这三步共15尺，小于来源20尺；最终与靶子相邻5尺。三个完整DTO及三个updateToken变更载荷相符，暂停始终true，未改键位或写坐标。施法者全部资源、缓存身份、靶子及模板DTO都未因移动改变，只有一次Cast。

此结果证明正常键盘移动，不证明AX.drag已修，也不证明系统自动限制20尺。原生updateToken回调当时的位置getter仍是旧值，最初父审检查误以为它应为新坐标；已仅修检查器，对照原始change载荷与随后完整DTO，未重写原件或重跑移动。

证据：`after-drag-attempts.json`、`after-native-d-key.json`、`movement-input-receipt.json`、`after-held-d.json`、`after-held-w1.json`、`after-move.json/png`、`parent-movement-review.json`。

## 原生攻击与伤害：PASS

Monk Tokenbar遮挡工具栏时，停止盲点；未提交误开的XP／请求掷骰弹窗。根据精确Core源码，使用正常T键选择当前指向靶Token，读回targetedTokens只有独立靶子，再从武器合成卡的Move and Attack发起攻击。没有更换浏览器通道或修改第三方模块。

第一轮实际自然1＋4＝5，对AC10未命中，伤害单独正常掷出1d8+2＝5，未Apply，靶子仍HP40。此轮AC5E提示双方不可见：本任务Scene准备沿用了旧`globalLight:true`字段，Core14清理后实际全局照明关闭，且Token视野关闭；不能将GM画面可见误作正常视觉判定。首轮原件／miss保留，不计作正常可见条件通过。

仅通过正常Scene配置，将本任务Scene的tokenVision与`environment.globalLight.enabled`设为true，未改原场景、模板、hidden状态或AC5E全局设置。第二轮对话框中的双方不可见提示自然撤下，没有手动取消判定。正常攻击自然10＋4＝14，命中AC10；1d8+2掷出7＋2＝9点force。使用该消息的正常Apply按钮，只给独立靶子应用伤害，HP40→31。

攻击和伤害的原生rollAttackV2／postRollAttack／rollDamageV2、消息speaker、target UUID、命中列表与伤害类型均读回。父池仍spent1／max2，全部Caster资源与缓存身份保持，总计只有一次Cast。原世界Combat未推进，不把本次场外GM操作宣称为自动回合费用或每回合次数强制执行。

证据：`before-attack-target.json`、`attack-confirm.*`、`after-attack.json`、`fixture-visibility-fixed.json`、`attack-confirm-visible.*`、`after-visible-attack.json/png`、`parent-attack-review.json`。消息分别为召唤 `O5REVHrHEnX49i3J`、首攻 `JPdlanWRr2aU2fnV`、可见命中 `Og6pPauOPNQfJC3F`。

## 刷新：PASS

正常关闭窗口、整页刷新后，武器完整Token及合成Actor源DTO、原生活动source、Caster完整DTO、法术缓存身份、靶子HP31与模板DTO保持。位置仍 `(800,400)`，summon origin／level2／mod2及flat+4保持，父池剩余1/2。

临时计算值`computedAttack.ability`由攻击后的`int`变为刷新后的空串，单列记录，不宣称所有临时计算字段完全相同；源activity.attack.ability在前后均为空、flat=true／bonus4保持，其他计算字段相同。父审按精确差异核对，没有以宽松归一化掩盖源数据变化，也未为抹除差异重跑攻击。

证据：`after-reload.json`、`parent-reload-and-cleanup-review.json`。原baseline hash67c3…2d4f保持，recaptured=false，原场景／视图／时间／暂停／Guard及模块保护通过。

## 最终恢复与限制

最终精确恢复 PASS。新增只读模板引用字段确认模板只被本任务武器Token使用；实际宏命令与保留源码一致，该字段不改变初始化／恢复器或重采基线。正常UI删除本任务三条消息、三个Actor（N2、独立靶子、新自动模板）及测试Scene／三个Token，最后删除helper。原11集合完整ID逐项相同，恢复318Actor／180Item／67Scene／94Macro／1239消息；Guard8Item／24Token完整DTO、模块、原场景、视图／时间／暂停及初始空目标保持。

原snapshot SHA29d5…95a通过CAS275→276恢复，不回滚审计号，baseline hash67c3…2d4f保持且未重采。Calendar／Monk Tokenbar按现场原显示恢复；只记录客户端可见状态，不声称未采集的客户端设置字节完全等同。所有业务原件与607保护文件hash无变化。

第一次点击Dispose后未捕获成功通知，原收据明确记录task localStorage清除UNKNOWN；没有撤销有效业务或世界恢复结果。仅用一张短期owned页、正常Macro UI加入最小精确键读取工具，不执行旧initializer或业务。实际直接读到该任务键已不存在，原世界ID／Guardhash／checkpoint276同时符合预期，Clear从未点击。正常删除这一取证宏后，再次读回精确键缺失、11集合完整ID相同、helper不存在；原UNKNOWN收据保留，新独立证据补齐此层。没有重跑任何通过的业务。

任务owned页651349036与补证页651349040均已关闭，fresh owned清单为空，原5用户页全部保留；没有本批临时模块资产安装。最终证据：`template-reference-check.json`、`final-world-after-helper-delete.json`、`parent-final-world-review.json`、`storage-verification-after-helper-delete.json`、`browser-storage-verification-cleanup.json`、`parent-final-restoration-review.json`。

用户说明、支持矩阵和手册同步；相关条目逐项人工review，最终检查结果保存于本批`handbook-check.log`。产品代码未变，复用已有产品回归，不重复模型／旧施法或战斗矩阵。

本次没有新的模型调用、产品代码修改、模块安装、服务重启、提交、合并、推送或生产操作。没有验证专注结束自动回收、期限到期、任意新来源／版本／模块组合；源20尺移动和动作时机仍由GM按原文执行。上批Cast及下载触发证据继续保留，文件落盘限制不因本批改变。
