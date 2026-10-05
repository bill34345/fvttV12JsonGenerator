# ServerNext 付费包双目标兼容声明复核（2026-09-26）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

## 结论

本次只读检查目标 `F:\FoundryLab\foundry-v14\data\server-next` 的37份付费模块清单：**37份都在磁盘上**，没有下载、升级、安装、启用或测试任何付费包。85项总账中没有放入Next的仍仅是免费 `plutonium-cn` 与本团 `fvtt-json-forge` 两项；两者目录和清单都不存在。

严格按“发行方公开正式清单同时明确 Foundry 14 和 dnd5e 6 的版本要求，且包含目标 Foundry 14.368 / dnd5e 6.0.2”筛选，**37项中确认3项**：Arcana Unleashed、Deadfall、Tasha's Cauldron of Everything。它们均已在Next有文件，但Arcana和Deadfall本机1.0.0低于公开最新版1.0.1；Deadfall先前由用户关闭，仍保持关闭。此判定是兼容声明与文件存在，不代表本机旧文件等同新版，也不代表玩法验收。

| 付费包 | 本机已装 → 公开正式版 | 发行方目标声明 | 本轮状态 |
|---|---|---|---|
| [allies-and-antagonists](https://raw.githubusercontent.com/grimpress/modules/main/allies-and-antagonists-v1301/module.json) | 13.0.1 → 13.0.1 | F最低13 / 验证13；D最低未写 / 验证未写 | 未声明 D&D 6 系统版本；不能由 Foundry 14 推出 |
| [atheron](https://r2.foundryvtt.com/packages-public/atheron/module.json) | 1.0.2 → 1.0.2 | F最低13 / 验证14；D最低未写 / 验证未写 | 只列 D&D 系统，没有写 6.x 版本 |
| [demon-queen-awakens](https://r2.foundryvtt.com/packages-public/demon-queen-awakens/module.json) | 6.0.0 → 6.0.0 | F最低14 / 验证14；D最低5.1.0 / 验证5 | D&D 最后验证仍是 5.x，未明写 6.x |
| [dnd-adventures-faerun](https://r2.foundryvtt.com/packages-public/dnd-adventures-faerun/module.json) | 1.2.1 → 1.2.1 | F最低13.345 / 验证13；D最低5.2.4 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-arcana-unleashed](https://r2.foundryvtt.com/packages-public/dnd-arcana-unleashed/module.json) | 1.0.0 → 1.0.1 | F最低14.367 / 验证14；D最低6.0.1 / 验证未写 | ✅ 正式清单明写 Foundry 14 与 D&D 6 最低版本 |
| [dnd-deadfall](https://r2.foundryvtt.com/packages-public/dnd-deadfall/module.json) | 1.0.0 → 1.0.1 | F最低14.367 / 验证14；D最低6.0.1 / 验证未写 | ✅ 正式清单明写 Foundry 14 与 D&D 6 最低版本 |
| [dnd-dungeon-masters-guide](https://r2.foundryvtt.com/packages-public/dnd-dungeon-masters-guide/module.json) | 2.0.0 → 2.0.0 | F最低13 / 验证13；D最低5.1.0 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-forge-artificer](https://r2.foundryvtt.com/packages-public/dnd-forge-artificer/module.json) | 1.1.0 → 1.1.0 | F最低13 / 验证13；D最低5.2.4 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-heroes-borderlands](https://r2.foundryvtt.com/packages-public/dnd-heroes-borderlands/module.json) | 1.1.0 → 1.1.0 | F最低13.345 / 验证13；D最低5.1.8 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-heroes-faerun](https://r2.foundryvtt.com/packages-public/dnd-heroes-faerun/module.json) | 1.1.0 → 1.1.0 | F最低13.345 / 验证13；D最低5.2.4 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-monster-manual](https://r2.foundryvtt.com/packages-public/dnd-monster-manual/module.json) | 1.4.0 → 1.4.0 | F最低13 / 验证14；D最低5.3.3 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-phandelver-below](https://r2.foundryvtt.com/packages-public/dnd-phandelver-below/module.json) | 3.1.0 → 3.1.0 | F最低13 / 验证14；D最低5.3.1 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-players-handbook](https://r2.foundryvtt.com/packages-public/dnd-players-handbook/module.json) | 2.2.0 → 2.2.0 | F最低13 / 验证14；D最低5.1.9 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-ravenloft-horrors-within](https://r2.foundryvtt.com/packages-public/dnd-ravenloft-horrors-within/module.json) | 1.0.1 → 1.0.1 | F最低13 / 验证14；D最低5.3 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [dnd-tashas-cauldron](https://r2.foundryvtt.com/packages-public/dnd-tashas-cauldron/module.json) | 4.0.0 → 4.0.0 | F最低14 / 验证14；D最低6.0.0 / 验证未写 | ✅ 正式清单明写 Foundry 14 与 D&D 6 最低版本 |
| [dnd-tomb-annihilation](https://r2.foundryvtt.com/packages-public/dnd-tomb-annihilation/module.json) | 2.0.0 → 2.0.0 | F最低14 / 验证14；D最低5.3.3 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [ec-zamanora-botw](https://r2.foundryvtt.com/packages-public/ec-zamanora-botw/module.json) | 1.0.1 → 1.0.1 | F最低14 / 验证14；D最低5.3 / 验证5 | D&D 最后验证仍是 5.x，未明写 6.x |
| [ec-zamanora-maf](https://r2.foundryvtt.com/packages-public/ec-zamanora-maf/module.json) | 1.0.1 → 1.0.1 | F最低14 / 验证14；D最低5.3.2 / 验证5 | D&D 最后验证仍是 5.x，未明写 6.x |
| [eoh-festering-city](https://r2.foundryvtt.com/packages-public/eoh-festering-city/module.json) | 2.1.0 → 2.1.0 | F最低13.000 / 验证13.351；D最低未写 / 验证未写 | 只列 D&D 系统，没有写 6.x 版本 |
| [eoh-setting-throne](https://r2.foundryvtt.com/packages-public/eoh-setting-throne/module.json) | 2.2.0 → 2.2.0 | F最低13.000 / 验证14.364；D最低5.0.4 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [grim-hollow-monster-grimoire](https://r2.foundryvtt.com/packages-public/grim-hollow-monster-grimoire/module.json) | 1.0.0 → 1.0.0 | F最低14.364 / 验证14；D最低5.3.3 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [heliana-core](https://r2.foundryvtt.com/packages-public/heliana-core/module.json) | 2.4.2 → 2.4.2 | F最低14 / 验证14；D最低5.3.3 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [hexcrawl-hex-tiles](https://r2.foundryvtt.com/packages-public/hexcrawl-hex-tiles/module.json) | 1.3.1 → 1.3.1 | F最低12 / 验证14；D最低未写 / 验证未写 | 未声明 D&D 6 系统版本；不能由 Foundry 14 推出 |
| [house-divided](https://r2.foundryvtt.com/packages-public/house-divided/module.json) | 5.0.2 → 5.0.2 | F最低14 / 验证14；D最低5.3.3 / 验证5 | D&D 最后验证仍是 5.x，未明写 6.x |
| [kp-prepared-expanded](https://r2.foundryvtt.com/packages-public/kp-prepared-expanded/module.json) | 13.0.0 → 13.0.0 | F最低12 / 验证13；D最低未写 / 验证未写 | 只列 D&D 系统，没有写 6.x 版本 |
| [librus-nocturnum](https://r2.foundryvtt.com/packages-public/librus-nocturnum/module.json) | 1.0.3 → 1.0.3 | F最低12 / 验证13；D最低4.1.2 / 验证未写 | D&D 只写旧最低版、无上限；形式范围可装，但未明写验证 6.x |
| [mcdm-class-bundle](https://r2.foundryvtt.com/packages-public/mcdm-class-bundle/module.json) | 3.0.0 → 3.0.0 | F最低14.361 / 验证14；D最低5.3.2 / 验证5.3 | D&D 最后验证仍是 5.x，未明写 6.x |
| [mcdm-flee-mortals-where-evil-lives](https://r2.foundryvtt.com/packages-public/mcdm-flee-mortals-where-evil-lives/module.json) | 3.0.0 → 3.0.0 | F最低14.361 / 验证14；D最低5.3.2 / 验证5.3 | D&D 最后验证仍是 5.x，未明写 6.x |
| [shards-and-traditions](https://tkc-prd-s3-manifests.s3.amazonaws.com/shards-and-traditions/1.1.0.json) | 1.1.0 → 1.1.0 | F最低14 / 验证14.365；D最低未写 / 验证未写 | 只列 D&D 系统，没有写 6.x 版本 |
| [tgbort](https://tkc-prd-s3-manifests.s3.amazonaws.com/tgbort/1.1.0.json) | 1.1.0 → 1.1.0 | F最低14 / 验证14.365；D最低未写 / 验证未写 | 未声明 D&D 6 系统版本；不能由 Foundry 14 推出 |
| [tgbortq](https://tkc-prd-s3-manifests.s3.amazonaws.com/tgbortq/1.1.0.json) | 1.1.0 → 1.1.0 | F最低14 / 验证14.365；D最低未写 / 验证未写 | 未声明 D&D 6 系统版本；不能由 Foundry 14 推出 |
| [the-folk-from-harrowthorpe](https://tkc-prd-s3-manifests.s3.amazonaws.com/the-folk-from-harrowthorpe/1.1.0.json) | 1.1.0 → 1.1.0 | F最低14 / 验证14.365；D最低未写 / 验证未写 | 只列 D&D 系统，没有写 6.x 版本 |
| [the-griffons-saddlebag-book-1-magic-items-and-player-options](https://foundryvtt.com/packages/the-griffons-saddlebag-book-1-magic-items-and-player-options) | 3.0.0 → 公开精确版不可核 | 公开精确清单未取到 | 公开的精确付费清单不可核；不标双目标通过 |
| [tile-arsenal](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/module-1.1.1.json) | 1.1.0 → 1.1.1 | F最低14.367 / 验证14；D最低未写 / 验证未写 | 未声明 D&D 6 系统版本；不能由 Foundry 14 推出 |
| [weapons-of-lore](https://r2.foundryvtt.com/packages-public/weapons-of-lore/module.json) | 2.0.1 → 2.0.1 | F最低13 / 验证14；D最低5.0.0 / 验证5.0.4 | D&D 最后验证仍是 5.x，未明写 6.x |
| [filepicker-plus](https://r2.foundryvtt.com/packages-public/filepicker-plus/module.json) | 6.0.1 → 6.0.1 | F最低14 / 验证14；D最低未写 / 验证未写 | 未声明 D&D 6 系统版本；不能由 Foundry 14 推出 |
| [jb2a_patreon](https://foundryvtt.com/packages/jb2a_patreon) | 0.8.7 → 公开精确版不可核 | 公开精确清单未取到 | 公开的精确付费清单不可核；不标双目标通过 |

## 判断口径与边界

- [Foundry 官方包管理说明](https://foundryvtt.com/article/package-management/)区分 `minimum`/`maximum` 硬边界和 `verified` 指导信息。作者只写 D&D 5.x 最低版且无上限时，通常不会被版本门禁拦下，但这**不是作者明确验证 D&D 6**；本表不把它标为绿色。只写 Foundry 14 或只列 `dnd5e` ID也不够。
- 29份可从Foundry公开清单直接取得；另6份通过Foundry包页列出的正式清单地址取得。Griffon Book One 只有[发行方商品页](https://www.thegriffonssaddlebag.com/vtt-packs/foundry-year-1-megapack)、JB2A Patreon只有[发行方站点](https://www.jb2a.com/)，两者无法公开取得精确付费manifest，因此不猜D&D6声明。
- Arcana Unleashed和Deadfall的公开1.0.1清单写 Foundry最低14.367/最高14、D&D最低6.0.1；Tasha 4.0.0写 Foundry最低14、D&D最低6.0.0。三者声明覆盖目标；没有宣称所有功能已测试。
- 本轮只读查询的原始字段摘要在 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\paid-compatibility-20260926\official-public-manifests-summary.json`；另六份正式清单地址见上表。目标本机三项的版本/兼容字段已单独读回。付费包不开启已关闭项，用户原有的37项只记录授权保持。

## 待判断本地化与下次复查

本轮没有新增需要本地化的付费包，也没有授权更新任何付费文件。若以后需要重新判断：先核精确本机模块ID、发行方最新正式清单或发行说明，再分别读 Foundry 与 dnd5e 版本字段及依赖；对仅写5.x最低版者，不把“可安装”冒充“作者明确验证6.x”。用户若另行授权付费更新，再单独核对包来源、现有关闭状态和目标世界身份。
