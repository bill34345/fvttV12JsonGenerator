# 现成状态图标选型：已确认用于本地候选

日期：2026-09-23。状态：用户确认采用20项现成SVG；初选已完成一次server-mirror安装与HUD复验。随后用户又确认笨拙改用 Drop Weapon、踉跄改用原笨拙的 Foot Trip；下表记录最新仓库候选映射，新映射的安装与浏览器结果须另行核对，不能沿用初选的验收。

## 权限与结论

用户明确禁止继续绘制SVG，并要求所有新增状态改找现成图标；先展示候选，随后明确回复“就用那个吧”，同意采用此前展示的20项。用户再看过笨拙候选的HUD尺寸预览后，明确选择 [skoll/drop-weapon](https://game-icons.net/1x1/skoll/drop-weapon.html)；踉跄按其要求接收原笨拙的 [lorc/foot-trip](https://game-icons.net/1x1/lorc/foot-trip.html)。19种Custom Conditions状态加伤势共20项，全部来自Game-icons.net；保持该库白色剪影语言。伤势1–3层共用同一原始图形，层数由HUD文字角标呈现，不自行绘制分层SVG。

## 来源与验证

通过AnySearch发现官方状态目录、关于页和GitHub官方仓库；随后逐页核对图标作者及CC BY 3.0链接，从每页实际列出的透明SVG下载链接保存原文件。没有描摹、修改path、组合图形或将位图转为SVG。

- 官方状态目录：https://game-icons.net/tags/state.html
- 官方许可及作者说明：https://game-icons.net/about.html
- 官方仓库：https://github.com/game-icons/icons
- 初筛仓库树：82d948812bfe3f269ef8f731dcdb07b08160edc4
- 本地候选：F:/FoundryLab/foundry-v14/evidence/condition-icons-sourced-20260923/
- 笨拙二次候选与HUD尺寸预览：F:/FoundryLab/foundry-v14/evidence/clumsy-icon-candidates-20260923/
- selection.json记录当时20项实际下载地址、作者、许可、SHA-256及采集时的待确认状态；该原始采集记录不作为当前授权状态，用户随后已确认采用。
- 模块内 `CREDITS.md` 随构建包一起提供逐项作者、作品、来源、原始SVG哈希及CC BY 3.0许可链接；原SVG字节未编辑，仅更名为模块内文件名。

## 状态映射

| 状态 | 候选 | 理由 |
|---|---|---|
| 心智混乱 / addled | [delapouite/brain-leak](https://game-icons.net/1x1/delapouite/brain-leak.html) | 脑力流失，表达心智受损 |
| 迷乱 / bewildered | [lorc/uncertainty](https://game-icons.net/1x1/lorc/uncertainty.html) | 问号与回转，表达困惑 |
| 流血 / bleeding | [lorc/bleeding-wound](https://game-icons.net/1x1/lorc/bleeding-wound.html) | 伤口滴血 |
| 燃烧 / burning | [lorc/small-fire](https://game-icons.net/1x1/lorc/small-fire.html) | 完整火焰轮廓 |
| 笨拙 / clumsy | [skoll/drop-weapon](https://game-icons.net/1x1/skoll/drop-weapon.html) | 手中武器脱落，表达动作失准；用户在HUD尺寸预览后确认 |
| 恍惚 / dazed | [delapouite/knocked-out-stars](https://game-icons.net/1x1/delapouite/knocked-out-stars.html) | 眩晕星环 |
| 无防备 / defenseless | [lorc/cracked-shield](https://game-icons.net/1x1/lorc/cracked-shield.html) | 裂开的防御盾牌 |
| 分心 / distracted | [darkzaitzev/distraction](https://game-icons.net/1x1/darkzaitzev/distraction.html) | 人物被旁侧动静吸引 |
| 衰弱 / enfeebled | [lorc/oppression](https://game-icons.net/1x1/lorc/oppression.html) | 受压蜷身，表示力量受到压制 |
| 冻结 / frozen | [delapouite/frozen-body](https://game-icons.net/1x1/delapouite/frozen-body.html) | 被冻住的人体 |
| 无助 / helpless | [delapouite/human-target](https://game-icons.net/1x1/delapouite/human-target.html) | 人体成为靶标，表达易受致命打击 |
| 定身 / immobilized | [skoll/cement-shoes](https://game-icons.net/1x1/skoll/cement-shoes.html) | 双脚被固定的人体 |
| 厄运 / jinxed | [lorc/cursed-star](https://game-icons.net/1x1/lorc/cursed-star.html) | 诅咒符号 |
| 震愕 / shocked | [lorc/lightning-mask](https://game-icons.net/1x1/lorc/lightning-mask.html) | 受冲击的脸；图形含闪电，但状态规则不限定电击来源 |
| 病弱 / sickened | [lorc/vomiting](https://game-icons.net/1x1/lorc/vomiting.html) | 恶心呕吐 |
| 减速 / slowed | [lorc/snail](https://game-icons.net/1x1/lorc/snail.html) | 蜗牛，表达移动缓慢 |
| 踉跄 / staggered | [lorc/foot-trip](https://game-icons.net/1x1/lorc/foot-trip.html) | 脚步绊住，表达踉跄；原笨拙图标按用户要求转用 |
| 英勇 / valor | [lorc/winged-sword](https://game-icons.net/1x1/lorc/winged-sword.html) | 翼剑，表达勇气与增益 |
| 虚弱 / weakened | [lorc/sword-break](https://game-icons.net/1x1/lorc/sword-break.html) | 破裂武器，表达伤害降低 |
| 伤势 / injury | [lorc/bandaged](https://game-icons.net/1x1/lorc/bandaged.html) | 包扎的人体 |

## 尚待判断

候选图形只表达状态概念，不改变规则。衰弱、无助和踉跄采用身体受压、人体靶标和脚步失稳作比喻；新笨拙/踉跄搭配仍须在实际HUD里核对清晰度。Dazed在CoTN有其他模组的同名状态，但自定义项以独立ID显示；不把换图当作同名状态的修复。Shocked 的 Lightning Mask 图形仍带闪电，不能据此把规则解释为仅由闪电伤害造成。

## 本地候选安装与边界

在确认30001仍为常驻的Foundry14.364/dnd5e5.3.3、`cor-cotn`、精确`server-mirror`数据目录后，先比较两个模块构建包与安装目录的manifest及逐文件SHA-256，再仅覆盖两个自有模块的静态文件；没有停服、重启、创建备份、改写世界LevelDB或触碰30002。安装预览与前后逐文件哈希记录在 `F:/FoundryLab/foundry-v14/evidence/condition-hud-sourced-20260923/update-preview.json` 和 `update-verified.json`。Custom Conditions由27增至28个文件，伤势模块由10增至11个文件，新增文件均为各自的`CREDITS.md`；安装后两个`verify-install`均通过，30001 `/api/status`仍是`cor-cotn`。

首次安装前通过的离线检查包括Custom Conditions 48项测试、伤势80项测试、生成器Dazed投影聚焦测试91项、模块与包类型检查、架构依赖检查、两个模块构建、`handbook:check`。这些只证明当时的候选实现和安装字节；后续浏览器结果如下，不能把未执行项算作通过。

## CoTN 外部 Chrome 回传与后续修复

2026-09-23 在真实 `cor-cotn` 世界、77个原有启用项组合中，Chrome可见裸 `Dazed` 使用外部 `mcdm-flee-mortals-where-evil-lives` 图标，自定义“恍惚（自定义状态）”使用 `fvtt-custom-conditions.dazed` 和本模块图标；两者分立显示。自定义 Dazed 在测试 Actor 上点击启用、停用、再启用均通过。伤势管理器可见 `0/3→1/3→2/3→3/3`，然后按原路清回0/3。测试 Actor `FqqsDQZD62UnAQlp`、Scene `aKL3Db4ksES2rOfr` 及该 Scene 内 Token 已通过 UI 清理，返回 `landing page`、暂停状态和 IFS internal 基线；页面留在 Custom Conditions Manager。浏览器证据：`F:/FoundryLab/foundry-v14/evidence/condition-hud-sourced-20260923/chrome/readback.json` 与 `report.md`。

同轮发现 **FAIL**：经 TAH 激活 Shocked 后，`shocked` 高亮，但 namespaced Dazed 与 Defenseless 没有高亮。精确安装的 TAH DnD5e 2.1.0 构建器按 Actor ActiveEffect `statuses` 判定高亮；其默认点击调用 `actor.toggleStatusEffect()`。原模块只截获自定义 Dazed，因此 TAH 的 Shocked 点击可能生成无 Custom Conditions flags 的普通效果，绕过复合规则。Chrome隔离环境没有开放直接读取 `game/CONFIG/canvas`，实际 ActiveEffect flags 未从浏览器直接读回；该机制是与实测相符的源码解释，不伪称已取得 flags 证据。

已在候选代码中补 Shocked 的自有 TAH 点击桥接：通过 Custom Conditions 公开 API 施加、停用、再启用，仅截获模块自有状态；测试精确断言 `shocked`、`fvtt-custom-conditions.dazed`、`defenseless` 三个投影状态和 CC flag。独立审查发现快速双击时两次读取旧状态的竞态，已将同一 Actor/状态的完整“读取→判断→写入”串行，并以延迟写入测试覆盖 Dazed、Shocked 双击。修复后 Custom Conditions 聚焦测试 **51 PASS / 0 FAIL**、模块类型检查与构建通过。复查确认普通 TAH 连续点击使用相同 Actor Document 对象；不同包装对象代表同 UUID 的并发路径仍是单独限制。

仅更新本地server-mirror的Custom Conditions三个静态文件（英中语言包与`index.js`），伤势模块逐文件哈希保持一致；二次更新的预览、前后哈希位于 `F:/FoundryLab/foundry-v14/evidence/condition-hud-sourced-20260923/shocked-update-preview.json`、`shocked-update-before.json`、`shocked-update-verified.json`。安装后Custom Conditions `verify-install`通过，30001仍为`cor-cotn`。

随后新建的GPT-6 Luna独立Chrome任务初次因旧GM页面占用而未进入世界，保留阻塞记录于 `F:/FoundryLab/foundry-v14/evidence/condition-hud-sourced-20260923/chrome-gpt6/preflight-report.md`。用户关闭旧页后，同任务以正常Gamemaster空密码进入CoTN；第二轮报告在同目录 `e2e-round2-results.md`、`e2e-round2-ui-evidence.md`、`e2e-round2-fixture-ids.json`。**PASS**：修复版经TAH点击Shocked后，Shocked、Custom Dazed、Defenseless同时高亮；同一实例第二次停用、第三次启用，重载后仍在，Manager应用路径与TAH投影一致。伤势的TAH角标已直接显示0/3到3/3；英文界面与恢复中文、tooltip none与恢复full、20项已选图标的基本加载/区分均经可见界面核对。保留77项启用组合，清理本轮确切Actor `IFp6dPk7Mi1Dv2Rm`、Scene `p5bIJYFydh18NPia`及随Scene删除的Token `zGZAk1lYXAGukOw7`，服务常驻，页面留在landing page。

**首轮 FAIL、修复后 PASS**：已启用Jinxed 1d6和Valor 1d4的TAH项最初没有显示6、4角标；同Token编辑Jinxed为1d4后也没有角标变化。精确安装的TAH Core 2.1.1会将不存在的`info1`标准化为`{}`，旧候选使用`!action.info1`判断空位，导致角标写入被跳过；浏览器观察与这一源码路径吻合。修复为空对象可填、保留非空外来角标、按选中Token Actor重算后，Custom Conditions **53 PASS / 0 FAIL**、Foundry模块类型检查与构建通过。本地server-mirror只更新Custom Conditions的`scripts/index.js`，伤势模块字节未变；预览、前后哈希见 `F:/FoundryLab/foundry-v14/evidence/condition-hud-sourced-20260923/dice-update-preview.json`、`dice-update-before.json`、`dice-update-verified.json`，`verify-install`通过。GPT-6 Chrome第三轮复验在同一Token `D80y8l8LGjPqu10f` 上看到Jinxed `1d6→6`、Valor `1d4→4`，不重选Token把Jinxed改为1d4后立即显示4；重载后两者均显示4。tooltip none无额外浮层，已恢复full/1500ms。证据见 `F:/FoundryLab/foundry-v14/evidence/condition-hud-sourced-20260923/chrome-gpt6/e2e-round3-results.md` 和 `e2e-round3-ui-evidence.md`。

第三轮临时Scene `Ao05kezR2WPlpNrh`、Actor `FSACXe155rsougRI` 与两个Token `eqHVDVV8AR11LZux`、`D80y8l8LGjPqu10f` 的exact IDs记录于同目录 `e2e-round3-fixture-ids.json`。浏览器任务起初在Foundry永久删除确认对话框前暂停；主任务按本轮既有授权核对ID/归属后通知继续。任务随后只通过Foundry UI删除上述精确Scene与Actor；两个Token随Scene移除，最终Scene和Actor目录中均无该条目，清理 **PASS**。原始暂停记录保留，更新后的删除证据见 `e2e-round3-results.md`、`e2e-round3-ui-evidence.md` 和 `e2e-round3-server-status.json`；最终30001仍为`cor-cotn`、PID32196、Foundry14.364/dnd5e5.3.3。

真实指针仅移动悬停仍为 **NOT_EXECUTED**：当前Chrome控制接口没有纯移动调用；点击后出现的tooltip不代替这一项。图标显示不等于用户最终美术接受。其余独立世界E2E不因本轮重复执行。

新候选复查：先核对官方页面、作者和许可，再以32/64px预览比较整套；如换候选，更新下载URL和哈希。资产选型不等于模块功能可用，状态口径仍遵守docs/acceptance/foundry-v14-module-health.md，Untested不能当运行通过。
