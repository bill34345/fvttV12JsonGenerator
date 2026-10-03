# ServerNext 全模块实时上游审计（2026-09-23）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

目标是 ServerNext `cor-cotn`、Foundry 14.368 / dnd5e 6.0.2。本记录落实用户新的迁移优先顺序：先查每个模块当前官方发布和精确 manifest，再决定更新、保留或暂缓；官方兼容声明不改写成玩法 PASS。官方已明确支持目标版本的模块，按用户要求只核对/更新版本，不继续安排玩法 E2E。旧验收结果仍按发生时的事实保留。

## 范围与方法

- 只读枚举 `F:\FoundryLab\foundry-v14\data\server-next\Data\modules` 的 68 个已安装目录，以及原迁移计划 Batch 6–8 的 17 个未迁入模块。对每个本地 `module.json` 记录 ID、版本、官方 manifest URL；实时 HTTP 获取该 URL，核对远端 ID、版本、Foundry 和 dnd5e 范围。GitHub/GitLab 发布资源、Foundry 官方包注册 CDN、作者公开 S3 均按其真实**上游信息来源**分类；这些 URL 不是本机实际安装包取得来源的证明。
- 精确原始盘点位于 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\all-mod-upstream-audit-20260923`。第一轮读取 GitHub release 的 `application/octet-stream` 时误把字节数组转为字符串，造成 31 个解析错误；`installed-modules-live-manifests-corrected.json` 仅重查这些失败项，保留第一轮文件以便追溯。以下计数和表格**只取修正文件**。
- 公开 manifest 的版本相等仅证明该入口此刻返回相同版本。Foundry `verified` 低于 14、dnd5e `verified` 低于 6、没有 `maximum`、没有系统关系和真实玩法通过是不同事实；不从缺少上限推断作者明确适配 dnd5e 6。
- 本次目标与来源 manifest 没有一个声明 Gitee 为发布入口；对 GitHub/GitLab 上游查实际仓库，对官方付费/内容包查 Foundry 注册源或作者发布源，不臆造 Gitee 镜像。安装 URL 锁定旧 tag 的 Babele 另查 GitLab release API；Allies & Antagonists 的作者固定版本目录另查 [Foundry 官方包页面](https://foundryvtt.com/packages/allies-and-antagonists)，当前公开最新仍为 13.0.1。
- 没有查询或导出凭据、Cookie、付费下载链接的令牌、世界 LevelDB 或完整包内容。Griffon's Saddlebag 的本机 manifest 路径含疑似访问标识，报告与 JSON 证据均将该路径段脱敏，只保留官方站点、包 ID 和远端 manifest 内容哈希。本轮是上游版本审计，**没有核定全部已装包的原始取得渠道**；尤其付费包不能凭官方 manifest 推断可通过 Foundry 更新器安装。审计期间没有安装、启停服务或更改世界；后续安装状态另记。

## 本次结论与处置顺序

68 个已安装模块：**62 个与当前公开 manifest 同版本**；4 个有较新官方版本；Midi-QOL 的 local.8 与官方稳定包版本不同，这是刻意保留的本地候选，不是待降级项；JB2A Patreon 0.8.7 没有公开 manifest，无法从本机包直接验证最新付费压缩包。额外复查 Babele [公开 GitLab releases API](https://gitlab.com/api/v4/projects/riccisi%2Ffoundryvtt-babele/releases?per_page=1)，最新版仍为 2.9.1；它的安装 manifest 指向固定 2.9.1 产物，不能仅凭固定 URL 断言最新。此处的“同版本”仅限版本核对，不等于 dnd5e 6 玩法验收。

| 已装模块 | 当前 → 官方 | 来源与目标兼容 | 处理 |
|---|---|---|---|
| Automated Animations | 7.1.1 → **7.1.3** | [官方 latest manifest](https://github.com/theripper93/autoanimations/releases/latest/download/module.json) 声明 Foundry 14；依赖 Sequencer/socketlib 均已安装。 | 免费公开包候选；先核对精确包和当前服务，再安排更新。 |
| Arcana Unleashed | 1.0.0 → **1.0.1** | [Foundry 官方 manifest](https://r2.foundryvtt.com/packages-public/dnd-arcana-unleashed/module.json) 声明 Foundry 14.367+、dnd5e 6.0.1+。 | **`PAID_RECORD_ONLY`**：用户从另一渠道取得付费包，本次只记录上游差异，不查询新包位置或安装。 |
| Arcana Unleashed: Deadfall | 1.0.0 → **1.0.1** | [Foundry 官方 manifest](https://r2.foundryvtt.com/packages-public/dnd-deadfall/module.json) 声明 Foundry 14.367+、dnd5e 6.0.1+。 | **`PAID_RECORD_ONLY`**：同上；不得直接走 Foundry Update。 |
| Griffon's Saddlebag Book 1 | 3.0.0 → **3.0.1** | [作者官网](https://www.thegriffonssaddlebag.com/)的本机包 manifest 声明 Foundry verified 14.365；dnd5e 只写 verified 4.3.8，未明确 6。 | **`PAID_RECORD_ONLY`**：只记录版本与声明，不查询或安装包。 |
| Midi-QOL | local.8 ≠ 官方稳定 14.0.12 | [官方稳定 manifest](https://gitlab.com/tposney/midi-qol/-/releases/v14.0.12/downloads/module.json) 上限 dnd5e 5.3.99；[dnd6 开发分支](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/branches/dnd6) 存在。 | 保留锁定上游提交加独立补丁的本地候选，绝不自动降级到官方稳定包。 |
| JB2A Patreon | 0.8.7 → 公开发布信息至少到 0.9.3 | [作者发布说明](https://www.patreon.com/JB2A/posts/jb2a-v0-9-3-168218512) 与本机包无公开 manifest。 | **`PAID_RECORD_ONLY`**：无法从公开信息核对付费压缩包，绝不以免费包覆盖。 |

17 个计划未迁入模块：4 个公开入口与 Mirror 同版本；3 个外部模块有更新（foundry_chn 14.365、dnd 简体 Babele patch 1.0.162、zzz_mod_chn 13.99）；`fvtt-json-forge` 的远端公开 manifest 反而是 0.1.0，落后于 Mirror 的 0.4.0，**不得降级**；9 个没有公开 manifest，主要是本仓库自制模块。Token Action HUD D&D5e 和 Plutonium CN 最新官方包仍声明 dnd5e 5.x 上限，继续暂缓。中文补丁/翻译包的“版本更新”不自动证明 dnd5e 6 字段翻译已覆盖。

AC5e 14.603.2 已安装并识别，但 AR 正常模块管理界面的一次保存被**另一个模块** `eoh-setting-throne` 依赖 `JB2A_DnD5e` 未启用的 Foundry 校验挡住；AC 开关仍为 false，未发生迁移。该 Echoes 包自己的官方 manifest 与已装版本同为 2.2.0，单纯更新版本不能修复这条依赖冲突。证据：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AR-ac-activation-20260923\summary.md`。先把依赖关系作为配置阻碍单列，不擅自启用免费 JB2A、替换 Patreon 资源或修改其他模块开关。

## 已安装 68 个模块逐项版本快照

以下表格从修正后的实时读取结果生成；状态是版本状态，不是运行/玩法结果。

| 模块 / 官方入口 | 已装版本 | 实时官方版本 | dnd5e 声明 | 版本状态 |
|---|---:|---:|---|---|
| [_chatcommands](https://gitlab.com/woodentavern/foundryvtt-chat-command-lib/-/raw/master/src/module.json) | 2.0.6 | 2.0.6 | 未列 dnd5e | 同版本 |
| [allies-and-antagonists](https://raw.githubusercontent.com/grimpress/modules/main/allies-and-antagonists-v1301/module.json) | 13.0.1 | 13.0.1 | 未列 dnd5e | 同版本 |
| [atheron](https://r2.foundryvtt.com/packages-public/atheron/module.json) | 1.0.2 | 1.0.2 | 列出 dnd5e，未声明版本范围 | 同版本 |
| [auraeffects](https://github.com/roth-michael/Aura-Effects/releases/latest/download/module.json) | 2.1.1 | 2.1.1 | 未列 dnd5e | 同版本 |
| [autoanimations](https://github.com/theripper93/autoanimations/releases/latest/download/module.json) | 7.1.1 | 7.1.3 | 未列 dnd5e | 不同版本 |
| [automated-conditions-5e](https://github.com/thatlonelybugbear/automated-conditions-5e/releases/latest/download/module.json) | 14.603.2 | 14.603.2 | min 6.0.0 / verified 6.0.3 / max 6.1 | 同版本 |
| [automated-evocations](https://github.com/theripper93/automated-evocations/releases/latest/download/module.json) | 6.0.0 | 6.0.0 | 未列 dnd5e | 同版本 |
| [babele](https://gitlab.com/riccisi/foundryvtt-babele/-/jobs/artifacts/2.9.1/raw/module/module.json?job=build) | 2.9.1 | 2.9.1 | 未列 dnd5e | 同版本 |
| [custom-css](https://github.com/yorkshirelandscape/FoundryVTT-Custom-CSS/releases/latest/download/module.json) | 2.4.4 | 2.4.4 | 未列 dnd5e | 同版本 |
| [dae](https://gitlab.com/tposney/dae/raw/v14/package/module.json) | 14.0.14 | 14.0.14 | 未列 dnd5e | 同版本 |
| [demon-queen-awakens](https://r2.foundryvtt.com/packages-public/demon-queen-awakens/module.json) | 6.0.0 | 6.0.0 | min 5.1.0 / verified 5 / max 未列上限 | 同版本 |
| [dice-calculator](https://github.com/mclemente/fvtt-dice-tray/releases/latest/download/module.json) | 4.0.5 | 4.0.5 | 未列 dnd5e | 同版本 |
| [dice-so-nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/raw/master/module/module.json) | 6.3.1 | 6.3.1 | 未列 dnd5e | 同版本 |
| [dnd-adventures-faerun](https://r2.foundryvtt.com/packages-public/dnd-adventures-faerun/module.json) | 1.2.1 | 1.2.1 | min 5.2.4 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-arcana-unleashed](https://r2.foundryvtt.com/packages-public/dnd-arcana-unleashed/module.json) | 1.0.0 | 1.0.1 | min 6.0.1 / verified 未列 / max 未列上限 | 不同版本 |
| [dnd-deadfall](https://r2.foundryvtt.com/packages-public/dnd-deadfall/module.json) | 1.0.0 | 1.0.1 | min 6.0.1 / verified 未列 / max 未列上限 | 不同版本 |
| [dnd-dungeon-masters-guide](https://r2.foundryvtt.com/packages-public/dnd-dungeon-masters-guide/module.json) | 2.0.0 | 2.0.0 | min 5.1.0 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-forge-artificer](https://r2.foundryvtt.com/packages-public/dnd-forge-artificer/module.json) | 1.1.0 | 1.1.0 | min 5.2.4 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-heroes-borderlands](https://r2.foundryvtt.com/packages-public/dnd-heroes-borderlands/module.json) | 1.1.0 | 1.1.0 | min 5.1.8 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-heroes-faerun](https://r2.foundryvtt.com/packages-public/dnd-heroes-faerun/module.json) | 1.1.0 | 1.1.0 | min 5.2.4 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-monster-manual](https://r2.foundryvtt.com/packages-public/dnd-monster-manual/module.json) | 1.4.0 | 1.4.0 | min 5.3.3 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-phandelver-below](https://r2.foundryvtt.com/packages-public/dnd-phandelver-below/module.json) | 3.1.0 | 3.1.0 | min 5.3.1 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-players-handbook](https://r2.foundryvtt.com/packages-public/dnd-players-handbook/module.json) | 2.2.0 | 2.2.0 | min 5.1.9 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-ravenloft-horrors-within](https://r2.foundryvtt.com/packages-public/dnd-ravenloft-horrors-within/module.json) | 1.0.1 | 1.0.1 | min 5.3 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-tashas-cauldron](https://r2.foundryvtt.com/packages-public/dnd-tashas-cauldron/module.json) | 4.0.0 | 4.0.0 | min 6.0.0 / verified 未列 / max 未列上限 | 同版本 |
| [dnd-tomb-annihilation](https://r2.foundryvtt.com/packages-public/dnd-tomb-annihilation/module.json) | 2.0.0 | 2.0.0 | min 5.3.3 / verified 未列 / max 未列上限 | 同版本 |
| [dnd5e-animations](https://github.com/MrVauxs/dnd5e-animations/releases/latest/download/module.json) | 3.3.0 | 3.3.0 | min 4.3.5 / verified 未列 / max 未列上限 | 同版本 |
| [ec-zamanora-botw](https://r2.foundryvtt.com/packages-public/ec-zamanora-botw/module.json) | 1.0.1 | 1.0.1 | min 5.3 / verified 5 / max 未列上限 | 同版本 |
| [ec-zamanora-maf](https://r2.foundryvtt.com/packages-public/ec-zamanora-maf/module.json) | 1.0.1 | 1.0.1 | min 5.3.2 / verified 5 / max 未列上限 | 同版本 |
| [eoh-festering-city](https://r2.foundryvtt.com/packages-public/eoh-festering-city/module.json) | 2.1.0 | 2.1.0 | 列出 dnd5e，未声明版本范围 | 同版本 |
| [eoh-setting-throne](https://r2.foundryvtt.com/packages-public/eoh-setting-throne/module.json) | 2.2.0 | 2.2.0 | min 5.0.4 / verified 未列 / max 未列上限 | 同版本 |
| [filepicker-plus](https://r2.foundryvtt.com/packages-public/filepicker-plus/module.json) | 6.0.1 | 6.0.1 | 未列 dnd5e | 同版本 |
| [fxmaster](https://github.com/gambit07/fxmaster/releases/latest/download/module.json) | 8.3.6 | 8.3.6 | 未列 dnd5e | 同版本 |
| [grim-hollow-monster-grimoire](https://r2.foundryvtt.com/packages-public/grim-hollow-monster-grimoire/module.json) | 1.0.0 | 1.0.0 | min 5.3.3 / verified 未列 / max 未列上限 | 同版本 |
| [heliana-core](https://r2.foundryvtt.com/packages-public/heliana-core/module.json) | 2.4.2 | 2.4.2 | min 5.3.3 / verified 未列 / max 未列上限 | 同版本 |
| [hexcrawl-hex-tiles](https://r2.foundryvtt.com/packages-public/hexcrawl-hex-tiles/module.json) | 1.3.1 | 1.3.1 | 未列 dnd5e | 同版本 |
| [hide-npc-names](https://github.com/ddbrown30/hide-npc-names/releases/latest/download/module.json) | 1.4.1 | 1.4.1 | 未列 dnd5e | 同版本 |
| [house-divided](https://r2.foundryvtt.com/packages-public/house-divided/module.json) | 5.0.2 | 5.0.2 | min 5.3.3 / verified 5 / max 未列上限 | 同版本 |
| jb2a_patreon | 0.8.7 | — | 未列 dnd5e | 无公开 manifest |
| [kp-prepared-expanded](https://r2.foundryvtt.com/packages-public/kp-prepared-expanded/module.json) | 13.0.0 | 13.0.0 | 列出 dnd5e，未声明版本范围 | 同版本 |
| [lib-dfreds-migrations](https://github.com/DFreds/lib-dfreds-migrations/releases/latest/download/module.json) | 1.0.4 | 1.0.4 | 未列 dnd5e | 同版本 |
| [lib-dfreds-ui-extender](https://github.com/DFreds/lib-dfreds-ui-extender/releases/latest/download/module.json) | 2.5.0 | 2.5.0 | 未列 dnd5e | 同版本 |
| [lib-wrapper](https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json) | 1.13.5.1 | 1.13.5.1 | 未列 dnd5e | 同版本 |
| [librus-nocturnum](https://r2.foundryvtt.com/packages-public/librus-nocturnum/module.json) | 1.0.3 | 1.0.3 | min 4.1.2 / verified 未列 / max 未列上限 | 同版本 |
| [mcdm-class-bundle](https://r2.foundryvtt.com/packages-public/mcdm-class-bundle/module.json) | 3.0.0 | 3.0.0 | min 5.3.2 / verified 5.3 / max 未列上限 | 同版本 |
| [mcdm-flee-mortals-where-evil-lives](https://r2.foundryvtt.com/packages-public/mcdm-flee-mortals-where-evil-lives/module.json) | 3.0.0 | 3.0.0 | min 5.3.2 / verified 5.3 / max 未列上限 | 同版本 |
| [midi-qol](https://gitlab.com/tposney/midi-qol/raw/v14/package/module.json) | 14.6.0-beta.4338eeab.local.8 | 14.0.12 | min 5.2.4 / verified 未列 / max 5.3.99 | 不同版本 |
| [monks-active-tiles](https://github.com/ironmonk108/monks-active-tiles/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [monks-bloodsplats](https://github.com/ironmonk108/monks-bloodsplats/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [monks-chat-timer](https://github.com/ironmonk108/monks-chat-timer/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [monks-combat-details](https://github.com/ironmonk108/monks-combat-details/releases/latest/download/module.json) | 14.03 | 14.03 | 未列 dnd5e | 同版本 |
| [monks-common-display](https://github.com/ironmonk108/monks-common-display/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [monks-little-details](https://github.com/ironmonk108/monks-little-details/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [monks-scene-navigation](https://github.com/ironmonk108/monks-scene-navigation/releases/latest/download/module.json) | 14.02 | 14.02 | 未列 dnd5e | 同版本 |
| [monks-tokenbar](https://github.com/ironmonk108/monks-tokenbar/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [monks-wall-enhancement](https://github.com/ironmonk108/monks-wall-enhancement/releases/latest/download/module.json) | 14.01 | 14.01 | 未列 dnd5e | 同版本 |
| [portal-lib](https://github.com/theripper93/portal-lib/releases/latest/download/module.json) | 4.0.0 | 4.0.0 | 未列 dnd5e | 同版本 |
| [quick-insert](https://gitlab.com/fvtt-modules-lab/quick-insert/-/releases/permalink/latest/downloads/module.json) | 3.7.8 | 3.7.8 | 未列 dnd5e | 同版本 |
| [sequencer](https://github.com/fantasycalendar/FoundryVTT-Sequencer/releases/latest/download/module.json) | 4.2.3 | 4.2.3 | 未列 dnd5e | 同版本 |
| [shards-and-traditions](https://tkc-prd-s3-manifests.s3.amazonaws.com/shards-and-traditions/latest.json) | 1.1.0 | 1.1.0 | 未列 dnd5e | 同版本 |
| [socketlib](https://github.com/farling42/foundryvtt-socketlib/releases/latest/download/module.json) | v1.1.4 | v1.1.4 | 未列 dnd5e | 同版本 |
| [tgbort](https://tkc-prd-s3-manifests.s3.amazonaws.com/tgbort/latest.json) | 1.1.0 | 1.1.0 | 未列 dnd5e | 同版本 |
| [tgbortq](https://tkc-prd-s3-manifests.s3.amazonaws.com/tgbortq/latest.json) | 1.1.0 | 1.1.0 | 未列 dnd5e | 同版本 |
| [the-folk-from-harrowthorpe](https://tkc-prd-s3-manifests.s3.amazonaws.com/the-folk-from-harrowthorpe/latest.json) | 1.1.0 | 1.1.0 | 未列 dnd5e | 同版本 |
| [the-griffons-saddlebag-book-1-magic-items-and-player-options](https://www.thegriffonssaddlebag.com/) | 3.0.0 | 3.0.1 | min ? / verified 4.3.8 / max 未列上限 | 不同版本 |
| [tidy5e-sheet](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/releases/latest/download/module.json) | 14.1.2 | 14.1.2 | min 6.0.0 / verified 6.0.0 / max 6.0.x | 同版本 |
| [tile-arsenal](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/module.json) | 1.1.0 | 1.1.0 | 未列 dnd5e | 同版本 |
| [weapons-of-lore](https://r2.foundryvtt.com/packages-public/weapons-of-lore/module.json) | 2.0.1 | 2.0.1 | min 5.0.0 / verified 5.0.4 / max 未列上限 | 同版本 |

## 计划但尚未迁入的 17 个模块

下表的“本地版本”来自只读 Mirror，绝不是 ServerNext 已安装声明。自制模块若无公开 manifest，后续以本仓库源码和用户指定的发布源为准。

| 模块 / 官方入口 | Mirror 版本 | 实时公开版本 | dnd5e 声明 | 来源状态 |
|---|---:|---:|---|---|
| [token-action-hud-dnd5e](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/latest/download/module.json) | 2.1.0 | 2.1.0 | min 5.1.0 / verified 5.3.1 / max 5.99 | 同版本 |
| [token-action-hud-core](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/latest/download/module.json) | 2.1.1 | 2.1.1 | 未列 dnd5e | 同版本 |
| [plutonium-cn](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases/latest/download/module-foundry14.json) | 2.15.6 | 2.15.6 | min 5.3.0 / verified 5.3.2 / max 5.3.999 | 同版本 |
| fvtt-house-rules | 0.1.0 | — | 未列 dnd5e | 无公开 manifest |
| fvtt-injury-fading-spirits | 1.0.0 | — | 未列 dnd5e | 无公开 manifest |
| [fvtt-json-forge](https://raw.githubusercontent.com/bill34345/fvttV12JsonGenerator/master/foundry-modules/fvtt-json-forge/src/module.json) | 0.4.0 | 0.1.0 | min 5.3.3 / verified 5.3.3 / max 5.3.3 | 不同版本 |
| fvtt-json-generator-spell-resolver | 0.1.0 | — | 未列 dnd5e | 无公开 manifest |
| fvtt-battlefield-painter | 0.3.0-alpha.1 | — | 未列 dnd5e | 无公开 manifest |
| open-session-deck | 0.1.0 | — | 未列 dnd5e | 无公开 manifest |
| fvtt-session-monitor | 1.1.1 | — | 未列 dnd5e | 无公开 manifest |
| fvtt-homebrew-species | 1.0.0 | — | 未列 dnd5e | 无公开 manifest |
| fvtt-blood-hunter-2024 | 1.0.0 | — | 未列 dnd5e | 无公开 manifest |
| [foundry_chn](https://github.com/fvtt-cn/foundry_chn/releases/latest/download/module.json) | 14.364 | 14.365 | 未列 dnd5e | 不同版本 |
| [5e_chn](https://github.com/fvtt-cn/5e_chn/releases/latest/download/module.json) | 5.3.0 | 5.3.0 | min 2.2.0 / verified 3.3.0 / max 未列上限 | 同版本 |
| [dnd-simplified-chinese-babele-patch](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/download/latest/module.json) | 1.0.89 | 1.0.162 | 未列 dnd5e | 不同版本 |
| [zzz_mod_chn](https://github.com/Memorize-Remix/fvtt_mod_chn/releases/latest/download/module.json) | 13.93 | 13.99 | 未列 dnd5e | 不同版本 |
| Ravenloft-babele | 1.0.0 | — | 未列 dnd5e | 本地机器译包、未确认公开上游；2026-09-24 [只读源码检查](./2026-09-24-server-next-ravenloft-babele-local-source.md)发现14项Babele mapping路径/转换器被翻译，保持暂缓 |

## 后续动作与复查入口

Batch 3 的 35 项商业内容包、Filepicker+ 和 JB2A Patreon 已逐项核对购买来源，共 37 项按用户要求只记录。每项本机/上游版本及官方购买证据见[付费模块只读分类与排除清单](./2026-09-23-server-next-paid-module-record-only.md)；此分类不代表它们在 dnd5e 6 运行通过。

### Batch 8 中文模块二次实时复核（2026-09-23 08:25 UTC）

安装前再次查询了发行方的 GitHub 最新 release、Foundry 注册页及发布 manifest，结论仍按**发布版本**而非仓库 `main` 内的占位/旧版本号记录：

| 模块 | 官方实时入口 | 最新发布 | 对 ServerNext 的结论 |
|---|---|---|---|
| foundry_chn | [GitHub release](https://github.com/fvtt-cn/foundry_chn/releases/latest)、[Foundry 注册页](https://foundryvtt.com/packages/foundry_chn) | 14.365 | 发布说明称支持 Foundry 14.365，注册页标 V14 verified；免费公开包，可在核包后安装，14.368 的翻译覆盖不由 manifest 保证。 |
| 5e_chn | [GitHub release](https://github.com/fvtt-cn/5e_chn/releases/latest)、[Foundry 注册页](https://foundryvtt.com/packages/5e_chn) | 5.3.0 | 发布说明明确针对 dnd5e 5.3.x；发布 manifest 的系统 verified 仅 3.3.0，未见 dnd5e 6 支持声明。继续 `HOLD_COMPAT`。注册页列表停在 4.3.0，不能据此把发行方最新 release 判为 4.3.0。 |
| dnd-simplified-chinese-babele-patch | [GitHub release](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/latest) | 1.0.162 | 最新发布仍是翻译自动更新；当前审计 manifest 只验证 Foundry 13，继续 `HOLD_V13`，不以版本号上升推断 V14 可用。 |
| zzz_mod_chn | [GitHub release](https://github.com/Memorize-Remix/fvtt_mod_chn/releases/latest) | 13.99 | 当前审计 manifest 只验证 Foundry 13；继续 `HOLD_V13`。仓库 `master/module.json` 仍写 8.5/verified12，是旧源码入口，不能替代 13.99 发布包。 |

随后从该 GitHub release 的公开 `foundry_chn.zip` 下载官方包到 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch8-foundry-chn-20260923`，SHA-256 为 `7AEC9AAEA7CB993AA757C3E834E0BA2C627D202532C9609DC31C396F53C363D0`（57,107 字节）。ZIP 仅有根目录 `module.json`、`cn.json` 两项；内层 manifest 是 `foundry_chn` 14.365、Foundry minimum/verified 均为 14、未列 maximum，下载 URL 指向同一 14.365 资源。**只完成包核对，尚未安装或验证 14.368 翻译覆盖**。其余三项未取包；`Ravenloft-babele` 无公开上游入口，仍待本地译文与目标字段核对。

B1后续维护回合只对 AutoAnimations、Arcana Unleashed、Deadfall 重新取得官方 manifest 并记录三项目录的更新前哈希，**没有打开 Setup 或安装任何包**。执行器在06:48:45Z发现ServerNext原PID43656不在、30002无监听/API拒绝连接，于是停止；父方再次核对三项本地module.json SHA与更新前一致。此服务状态阻碍与付费包实际来源未确认是两条独立问题，不能把“没有更新”归因成“官方没有新版本”。证据：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\all-mod-official-update-b1-20260923`。现时30001属于另一个Mirror进程；不得拿它替代ServerNext，也不因30002无监听就清理仍存在的锁目录。

父方随后依先前用户要求持久ServerNext可进入的授权，沿用同一Node/Foundry入口、dataPath、世界与loopback preload启动PID53652，未清锁、未停Mirror、未改模块。07:05:48Z复核30002唯一loopback监听、API active=true/14.368/dnd5e6.0.2/cor-cotn、`/join`200及stdout启动完成；`world.json`在正常启动前后SHA有变化，不称世界数据字节完全不变。详见`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AS-service-recovery-20260923`。先前PID43656的退出原因仍未知。

后续免费模块维护已将AutoAnimations从7.1.1更新到官方7.1.3，正常包管理安装树11项均匹配官方ZIP路径/长度/哈希；唯一目标世界已重新Launch、API active。只选择了Setup一次性使用数据提示的`Decline Sharing`，没有付费包或其它模块更新。证据：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\all-mod-free-autoanimations-update-resume-20260923`。上表保留**更新前审计快照**7.1.1→7.1.3；现时已装7.1.3与逐项处置状态应读[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)，不能把上表的时间截面误当成安装仍待办。

1. 把官方最新状态与**实际包来源**分开审计。免费公开包可核对发布资源并在当前授权内更新。用户已明确要求本次对付费包只记录、不处理，因此 Arcana Unleashed、Deadfall、Griffon、JB2A Patreon 等标 `PAID_RECORD_ONLY`，不再询问本地下载位置，也不得假定 Foundry 更新器能取得。最终迁移报告逐项列出上游版、本机版和未处理原因；官方支持模块不新增玩法 E2E。
2. Batch 7 自制模块没有“官方外部最新版本”可替代源码迁移；不能改 manifest 数字冒充 dnd5e 6。Batch 8 中文包先查当前 GitHub/Gitee 实际发布、语言覆盖及目标版本；不把 V13 的 13.99 当作 V14 可用。
3. 下次进行安装前重新读取各模块最新 release/manifest；本文件只记录 2026-09-23 这次时间截面。用户要求的顺序是“实时上游状态 → 实际取得包的渠道/版本核对 → 可用包更新”，而不是为每个官方支持模块重复玩法测试。跨任务按[当前 runbook](../runbooks/server-next-module-upstream-and-package-source.md)执行。
