# Neogi Void Hunter：正常 Forge AI 入口的新来源验收

2026-10-18。本次复用已有 Forge 工作树与原 Mirror，目标是从此前未用的完整怪物原文，经正常 Forge AI 界面请求 DeepSeek、正式生成、GM 确认创建，再实际使用攻击、伤害、豁免、次数和真实法术。不得使用保存 IR 重放替代这段真实入口。

**当前状态：这份新来源已完成正常 AI → 正式生成 → 同一新卡水合 → 五类基础实际操作与重载接受；任意门的条件伤害明确留 GM。** 这不是首次成功，首次及后续失败独立保留；任意门的真实施法／扣次通过不冒充其Midi条件伤害工作流完成。

**原因与责任更正：** 首次啃咬的攻击伤害和独立Save已经正确，是本轮新增校验误拒；首次奴役次数也已经正确，次数语法漏项不是首次七条阻断之一。中文法术匹配只改前层、漏改完整服务校验，是本轮修复不完整造成的额外失败。下文“共用修复”只说明技术改动，不能据此把所有问题都说成旧工具原有缺陷。逐项归因见[失败原因与责任更正](../reviews/2026-10-18-forge-failure-causes-and-responsibility.md)。首次原件和运行结果不因本次更正而改写。

## 来源与固定期待

- 来源：用户本地 CHM《DND五版不全书26.08.06之颤栗吧，血族降临！》中《布布的星界怪兽展》`纽吉怪Neogi.htm`，选择完整连续的“纽吉怪虚空猎手 Neogi Void Hunter”单元。来源 SHA-256 为 `07d0be495b60b9de73a1db36eb2c07b7879c1ac18d886f5cec031b880b2fa2d9`，1161 个 UTF-16 字符，各轮不改来源。项目、既有测试／报告／Forge 保存材料及验收前世界角色目录无该怪物使用命中；这是有记录范围内的首次来源，不推断所有外部历史。
- 冻结来源及出处：`.local/forge-fresh-normal-ai-20261018/selected-source/`；期待：`expected-source-facts.json`。
- 啃咬：近战武器攻击 +5，触及 5 尺；`1d8+3` 穿刺加 `4d6` 毒素；同 Item 独立 CON12 Save，不再次消费主操作资源。中毒、每回合末重掷与提前结束交 GM。
- 爪击：近战武器攻击 +5，触及 5 尺，`1d8+3` **穿刺**，遵从本份原文。
- 魔能矢：**远程法术攻击** +6，120 尺，`3d10+4` 力场。
- 奴役：附赠动作、可见 30 尺目标、WIS14 Save；一次资源，短休或长休恢复。魅惑一日及死亡、距离、受伤后重掷、反应／命令限制、心灵感应完整留 GM，不能生成空 duration 的永久魅惑效果。
- 真正施法：CHA；任意门、隐形术各自独立 1/日；原文没有全局 DC／攻击加值或成分豁免，不补造。需实际 Spell 匹配、缓存、水合、Cast 和次数读回。

## 真实首次结果与后续失败

| 轮次 | 正常入口结果 | 创建情况与原件 |
| --- | --- | --- |
| 首次 | 正常 discover、extract 各 1 次真实 DeepSeek HTTP200；7 条来源契约阻断。正常“修正问题”再请求 1 次，仍 7 阻断。 | 未生成／创建。首次回复及 UI 读回、一次修复原件分别冻结于 `first-result-manifest.json` 与 `repair-once-failure-manifest.json`。导出下载事件超时单独保留，不覆盖已取得的原回复。 |
| 第二轮 | 共用来源修复后，从完整原文重新发起 discover/extract，各 HTTP200；repair/review 为零。分析通过，正常生成一次，local verifier 通过。父控独立语义审查仍拒绝：复杂魅惑被链接为空 duration Effect；普通攻击类型仍为旧值，dnd5e5.3.3 会把 rsak 误读成近战法术攻击。 | 未创建。`029-readback.json` 及 `post-fix-attempt2-rejected-manifest.json` 保留不安全候选，不把 local green 算通过。 |
| 第三轮 | 共用生成／验收修复后，再从原文 fresh 请求，HTTP200；67 处引用均精确、五基础数值匹配，但普通 Claws/Bolt 的“单一目标”被错误送进编号 placement 证明，触发 2 条 `UNBOUND_FEATURE_TARGET`。 | 未生成／创建，repair/review 为零。`039-provider-response.json`、`040-readback.json` 及 `post-fix-attempt3-blocked-manifest.json` 冻结。 |
| 第四轮 | 从重载后的空原文编辑器重新请求，discover/extract 各 1 次 HTTP200，repair/review 为零；65 处原文引用匹配，分析 ready，正常生成一次后本地校验与父控独立候选语义核对通过。 | `050-provider-response.json`、`051/052-readback.json` 与 `post-fix-attempt4-first-candidate-manifest.json` 的30份原件冻结。进入正常创建和实际操作。 |

这些不是在相同代码上反复分析直到抽到成功。每次重新生成前都有不同的已确认共用缺陷、最小修复和相应门禁；失败仍计入本例，不称首次成功。

## 共用修复及离线边界

1. 来源操作归属：同句 Hit 与 Save 按出现位置归属伤害，重复骰式也不能串到后续 Save；支持完整中英混排能力身份及中文施法属性、短休／长休充能标签。纯中文法术名走原名匹配，不强制模型补没有来源证明的英文名。
2. v14 原生攻击类型采用 `melee/ranged` 与 `weapon/spell` 分类；保持数值、伤害、激活和距离。v12／13 独立边界保留。
3. v14/core 的复杂标准状态生命周期完整交 GM，移除错误的显式／推断 Effect 与链接，保留所有基础操作。简单明确时长与独立普通状态继续原生；modded、自定义执行器及旧卡不自动迁移。独立审查覆盖漏写结构化时长、独立倒地与后续中毒、并列同一时长状态等反例。
4. 普通 Attack 字面目标使用完整自身父能力、唯一完整攻击头及一致的模式／命中／距离证明；已给的错误子 claim 仍拒绝。编号 shared 目标及 `feature.range` 原有严格路径不变。独立审查又补上“无目标头，把 reach 尾段冒充目标”的拒绝，未删合法目标字段。

冻结清单：`worker-chinese-source-freeze-r5.json`、`worker-condition-projection-freeze-r22.json`、`worker-target-binding-freeze-r10.json`。最后一项审查在 manifest 生成后关闭 P2，最终源码字节与审查相同。所有清单位于本例 `.local/forge-fresh-normal-ai-20261018/`。

最终目标修复的 native basics 为 358/0、raw contracts 77/0、package/all types exit0、三源码 anti-overfit PASS；旧 CLI／legacy 19/0。上一批七份生成／验证源码未漂移，复用其 generation287、structured-action-targets54、encounter633、staged241、生产／Foundry types、architecture 与受影响源码 anti-overfit 证据。手册五项经具体人工核对并更新 review，`handbook:check` 33 项通过。

GitNexus 已对最终生产代码运行 `analyze --force --index-only`，2041 文件、30084 节点、72925 边，索引时间2026-10-17T18:35:49Z。此前一次增量 FTS 索引不一致保留在失败日志，使用已安装工具的完整索引重建恢复；没有 clean／安装／hook／长期 watcher。最新符号结果仍声明 incoming 为 lower-bound，实际调用链以源码和测试为准，不能把图中遗漏调用者解释为不存在。

## 第四轮与实际操作

第四轮 request 为 `forge-intake-ai-monster-3fbe17ec-5df3-4e63-807c-4d2d6eaf01f5`。原文提取约145秒，响应200，无额外repair/review。正式候选为9个Item，`052-readback.json` SHA-256 `5db7639f248fe007ebd067c556aad430cf2e8b0d8a86516b3ef457d4ecb2da55`；原生攻击、伤害、独立Save、1/sr及GM状态边界、两个独立1/day manifest均通过逐项原文核对，规则偏好为正常UI原有2024。

两个任务内审计器的过窄假设也原样保存：`daily-each/count=1`是当前正式契约支持的独立1/日；普通近战武器的触及保存在`range.reach=5`，不能只检查`range.value`。纠正的是只读审计器，模型回复、IR、候选和产品字节没有为此改变。最终核对为`candidate-semantic-audit-052-r2.json`，实际水合与操作另验。

正常 GM 确认创建一次，Actor 为`b2a835cf605b26f1`，9个Item，首个Resolver review 对任意门、隐形术均报`SPELL_MISSING`，候选为空、Apply禁用，缓存为空。立即停止原生操作，仅取消review并保存`053-owned-created-actor.json`与`054-readback.json`；`first-native-hydration-failure-manifest.json`固定首次创建及水合失败，尚未建立靶、攻击、豁免或施法。

只读MCP核对准确Mirror身份后，目标Core 2024目录实际上存在这两个真实Spell，分别有完整双语显示名与英文`system.identifier`。首次失败时resolver只比较整个name／identifier，纯中文来源identifier不能匹配“中文 English”的整个显示名。随后修候选侧完整中文别名，仅在同候选的完整英文侧与identifier精确一致且引用没有英文自动身份时使用；406项相关测试及独立窄审通过，没有改来源、IR或manifest来补没有证据的英文。

首次新Resolver脚本`8f18a57795c68e94f13477619bb1024a3b834f1925eae6bcc1d5c688aebce8cc`装入同Mirror，Forge重新编译仍为相同`ed493...`。从同卡正常重新解析一次，实际选候选层已成功，报告两refs均为`resolved / automatic-2024`，按原优先选择PHB2024。但真实完整文档复核又报`INVALID_SELECTED_SPELL_DOCUMENT`，Apply禁用，缓存仍0，不能把报告resolved当水合通过。`055/056-readback.json`及`resolver-localized-key-failure-manifest.json`保留此失败。

继续追到`hooks.ts::validateSelectedSpellFacts`，发现六字段精确一致性校验之后又独立做旧身份求交，没有消费刚修的共同身份规则。这是本次漏查的后续consumer，已补完整service层红例并复用同一身份规则；六字段、UUID、type、可读性及manual-review约束保留。普通报告没有显示底层两个具体错误文本，故不声称已经捕获实机的细分原错误；源码反例和后续实机是否消除该阻断分开。完整service红基线417/1，修复后418/0，production／Foundry types与局部anti通过，独立审读完整服务消费链通过。

最终Resolver脚本SHA为`f7b0600d5dc90d977cc0a6e8b515249af7734ff868e798b3e2fc75b15b7734d3`。只更新该Mirror脚本、不重启服务，再正常重载并从同一张卡“解析或重新解析法术”一次，**自动水合成功**，无Review/Apply、无AI或重新生成。`058-readback.json`记录同Actor从9变为11个Item，两份新增真实Spell缓存；portable manifest与首次创建时完全一致，父控核对见`native-hydration-parent-audit.json`。

两份Cast为`509971af6e8b31f9`（任意门）与`779f7a331d81d6ad`（隐形术），均CHA、独立1/day、spent0，无成分忽略。实际cache为PHB2024的Spell：任意门`phbsplDimensionD`，4环/咒法/V；隐形术`phbsplInvisibili`，2环/幻术/V/S/M及专注，prepared duration1hour。58读回旧文档保护零差异，时间仍21085811。真实施放和实际资源恢复继续另验。

第三轮保存 IR 的只读诊断只用于证明误拒原因，没有生成或导入验收卡；不把这个诊断当 fresh4。水合修复后继续使用同一张本任务新卡，没有重新调用AI、生成或重放IR。

## 实际攻击、伤害、豁免和资源恢复

以下均为正常卡面／原生对话框操作与真实保存的 Chat Roll，不以测试或候选字段代替操作：

| 操作 | 真实结果与原件 |
| --- | --- |
| 啃咬 | `N0yq5ZhiN2eYPuyW`：`1d20+5=24`；`1d8+3` 穿刺5、`4d6` 毒素13，两部分独立正确。 |
| 爪击 | `uYMsJN5FVVvzBAFa`：`1d20+5=7`；`1d8+3` 穿刺8。 |
| 魔能矢 | `L6D62sOsQAnENu64`：`1d20+6=26`，首次自然20；保留真实暴击 `6d10critmax10+4=57` 力场，不为获得普通结果重掷。活动底式仍为 `3d10+4`，原生类型确为 ranged／spell，距离120尺。 |
| 啃咬独立豁免 | 原请求 `ltEVsCu0LeVwBrF7` 的新靶真实 CON Save `2HH29KMzjduHlC6T`：`1d20+1=11` 对DC12。靶为本轮新建 `1BJ9KhyiOiQbU23h`，不拿旧空白靶代替。 |
| 奴役豁免与再豁免 | 请求 `XyGb0d807RgbHUhW`；同新靶 WIS Save `SF7e0u7ktlgHKLL6`：`1d20+3=11` 对DC14；同Chat再Save `Sqc3PI5LteDlBi5s` 得8，次数仍为1消耗，不重复扣次。 |
| 次数与休息 | `062..067-readback.json`：奴役spent依次为 `1→1→1→0→1→0`，对应首次使用、同Chat再Save、默认消费再用被拒、单NPC短休、再次正常用、单NPC长休。未关闭消费、手写spent或进行Party Rest。两个每日法术期间均未消耗。 |

`native-enslave-exhausted-dom.txt/.jpg` 保存默认消费开启时的实际耗尽拒绝。短／长休前后世界时间始终 `21085811`，Calendaria设置未改。本人GM为触发独立Save而临时指定新靶，随后通过正常UI恢复null；旧317 Actor及嵌入Item、94 Macro、67 Scene、10 Combat无hash差异，180旧worldItem与017相同、1221旧消息未缺失。旧消息只证明ID仍存在，不扩大为全部内容hash相等。

这些检查证明真实攻击／伤害掷骰和豁免请求／响应可用；本轮没有自动扣HP或自动裁定命中，复杂中毒／魅惑生命周期也没有施加。

## 两个真正法术与 GM 条件后果

首次隐形术从真实Spell原生对话框默认确认后没有保存Spell Chat、两个spent仍0，却已产生本卡自己的专注Effect。`068/069-readback.json`及15份原件已冻结为 `first-native-cast-failure-manifest.json`；未捕获瞬时被删Chat或TroubleShooter细分错误，不把观察器传输errors[]解释成业务无错。

正常UI只读核对到Midi `requiresTargets=always`、自动远程选目标关闭，该次没有实际Token目标。准确版本源码的post-Chat取消／退还／删Chat分支与现象相符。只通过本卡正常UI结束这次失败专注，再补齐现有玩法前置；设置、来源、IR、portable manifest、法术cache及数值均未为此修改。核对与有边界的第一手检索见 [Midi前置条件记录](../reviews/2026-10-18-midi-invisibility-target-prerequisite.md)。

官方Chrome连接器当前缺少放置Token所需拖动入口，已保存能力缺口收据；没有改用隐藏JS或绕过页面拒绝。新场景 `9QVrwbjMFRgbC4iM` 仅View、不激活，正式Foundry MCP放入本轮两个新Actor的默认不链接Token，并用正式 `use_item` 设置唯一新靶、打开同一世界卡的原生feature chooser。随后仍由官方Chrome操作选择Spell及默认消费确认。MCP只准备fixture／目标，实际施法是UI证据；不把API的initiated当成功。

- 隐形术：`075-readback.json`、真实Spell Chat `QdMbFJjVXI2H00df`，实际缓存 `Oor8w0PQQovpO1Rj`，Midi `itemUseComplete=true / WorkflowState_Completed`；原feature的该Cast delta为spent+1，任意门仍0。CHA、V/S/M、1小时专注都保留，仅产生真实专注，目标未自动附加隐形AE。
- 任意门：`076-readback.json`、真实Spell Chat `X9W0vrASRhvR0mXk`，实际缓存 `7PMcsW4bECl2Gobq`，该Cast独立spent+1，隐形术仍1。PHB缓存自带的条件4d6力场伤害在本机Midi下会直接弹出掷骰窗口；原文明确只在传送到占位地点失败时发生。正常关闭一次，没有掷4d6、扣HP或移动Token，保留首次提示和关闭后读回。

**任意门真实Spell use、Chat和独立扣次已成立，但不能声称其Midi条件伤害工作流完成。** 关闭后 `itemUseComplete=true` 而currentAction仍 `WorkflowState_WaitForDamageRoll`；原Chat及上下文未提供普通skip／finish按钮。该分支明确交GM判断，不能为把状态变绿而掷不该发生的伤害、改cache或全局设置。整个例子的结论只覆盖所要求的基础操作与真实施法，不扩大为所有Midi后果自动化通过。

本轮正式 `use_item` 指定世界Actor，默认不链接Token仅为目标与场景前置；没有另验所有synthetic Token独立资源语义。默认放置时caster Token产生自己的HP delta68，世界卡始终保留来源HP58，未编辑此delta，也未拿Token的HP替代源卡语义接受。

`077-readback.json`与对应默认对话框记录每日隐形术耗尽被拒，未取消消费或退还资源，两项spent仍各1。`078-readback.json`是正常刷新后的持久性读回，两真实缓存、两个Spell Chat、独立spent各1均保留；任意门的WaitForDamageRoll也如实保留。`079`结束本卡自己的成功隐形术专注后保存清理前状态，`080`只在正常UI删除本轮临时场景9Q（含两Token）及临时空NPC靶1BJ，保留生成卡b2、11个Item、真实Chat和全部证据。既有brw场景不动。

父控独立审计 `native-final-parent-audit.json` 的结论为 `PASS_WITH_EXPLICIT_GM_CONDITIONAL_BRANCH`：逐读实际Roll、两个真实Spell的原feature消费delta、源manifest不变、短长休序列、刷新持久性与恢复状态；132份首次／失败原件及r5的354份最终源码哈希全相等。审计器最初误把尚未保存重复Save Chat的063当完整快照，按064已保存的相同Chat纠正只读审计器，失败说明独立留存，没有重做操作或改变产品来过审计。

080完整最终读回确认旧Actor／嵌入Item、Macro、Scene、Combat零hash差异，180旧worldItem不变、1221旧消息ID无缺失；世界时间21085811、本人character=null、view／active均原landing，模块开关配置相同，新卡effects=[]。这是本轮完整hash证据；之后移除观察器的文件操作不写世界，移除后的普通UI刷新另记，不能假装仍有观察器全量快照。

## 目标与保护范围

- 工作树：`20261006-111625-bettermonsters-eye-deep-sample`，分支 `codex/20261006-111625-bettermonsters-eye-deep-sample`；HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。保留既有 dirty、untracked、旧卡和失败原件，不提交／合并／推送。
- 唯一运行目标：Mirror `cor-cotn`、30001，Core14.368／dnd5e5.3.3／Midi14.0.11，原 PID47244／Administrator；只更新其 Forge 模块业务文件，服务不重启，不触碰 Next 或生产。
- 第四轮加载的Forge业务 SHA `ed493f9519209cded4392e8e0b36e95c326ae1f1ac2ecb1305d10bd519d9163e`，观察版 SHA `ae6b047c033aaf671c8cc47ed06072b3b701fc3248674443c786a019e1878f97`；最终Resolver为上文 `f7b...`。最后r5重编译确认Forge业务字节相同，没有为后续Resolver修复重跑AI或换生成候选。
- 原基线：317 Actor（包含嵌入 Item）、94 Macro、67 Scene、10 Combat、1221 旧消息；180 旧 worldItem 完整指纹以 `017-readback.json` 为准。`041-readback.json` 仍全部零差异，世界时间21085811、本人 character=null、无新 Actor，视图／场景／配置同基线。
- Calendaria“休息时推进时间”已在真实设置 UI 核对为 false，未保存或改设置；实际短休／长休前后世界时间也均核对为21085811。
- 自有观察器在080完整读回后精确移除，保留最终新业务pure `ed493...` 与Resolver `f7b...`；移除收据为 `observer-removal-receipt.json`，不回滚旧bundle、不重启Mirror。`final-pure-business-ui-receipt.json`确认移除后正常刷新、观察按钮消失、11个Item和两个0/1次数保留、无专注并回landing；正式MCP只读再核世界身份、HP58／AC14、真实施法feature及两个spent1，原件为 `final-pure-business-mcp-readback.json`。`bridge-stop.json`和`receiver-stop-verification.json`确认本轮receiver64926已退出、端口关闭，Mirror仍原PID47244／30001运行。

最后仅新增／更新本例验收及研究说明，未再改产品、用户入口或手册watch内源码；因此复用最终service修复后的 `gate-handbook-final-service.log` 33项通过，与r5的354份源码冻结一致。已有review、生成手册及其他dirty／untracked保留。没有重建发布ZIP、提交、合并或推送。

本报告不会把一个样例、静态通过或一次本地接受提升为整个 Forge 产品稳定性、任意来源支持或生产接受。
