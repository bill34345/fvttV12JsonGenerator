# ServerNext 付费模块只读分类与迁移排除清单

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

2026-09-23 实时核对：Batch 3 的 35 项商业内容包均有发行方购买证据。34 项在各自 Foundry 官方包页显示逐包 `Purchase` 入口；Griffon Book One 以发行方商品页确认。另有 Filepicker+ 和 JB2A Patreon，共 **37 项**。用户指示本次只记录，不查询私人下载位置、不下载、不安装/更新、不改启用开关。官方发布版、实际取得包来源和目标可用性是不同结论。

后续用户只对 `house-divided`、`dnd-tomb-annihilation`、`dnd-phandelver-below`、`dnd-heroes-borderlands` 增加了**停用开关**授权；不包含其它33项。2026-09-23 两次尝试均未持久修改四项：正常UI整体保存被其它缺失依赖模块拦截，外部Chrome策略拒绝控制台入口，未调用设置API。逐项实时状态见[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)。下表 `PAID_RECORD_ONLY` 仍准确描述它们的**包版本/安装处置**，不再代表这四项的开关不得更改。

11:31 UTC 更新：用户随后同意把 `eoh-setting-throne`、`eoh-festering-city`、`grim-hollow-monster-grimoire` 同时停用，并表示已自行处理。独立Chrome只读回看上述七项均显示 off，未再写设置；`dnd-deadfall` 也显示 off，相比先前基线多停用一项，来源未明，保留当前状态。此更新覆盖上一段的旧操作时间截面；不改变本表37项的付费来源和版本结论。

**2026-09-24 10:11–10:13 UTC 公开上游再核**：37项中35项有可直接读取的精确公开 manifest，逐项HTTP 200且模块ID匹配，版本与昨日记录全部相同，没有新增公开版本或兼容声明差异；本清单没有 Gitee 发布入口。[Arcana Unleashed](https://r2.foundryvtt.com/packages-public/dnd-arcana-unleashed/module.json)与[Deadfall](https://r2.foundryvtt.com/packages-public/dnd-deadfall/module.json)仍为官方1.0.1、目标已装基线1.0.0，只记录差异。Griffon [发行方商品页](https://www.thegriffonssaddlebag.com/vtt-packs/foundry-year-1-megapack)仍可访问，却不公布精确版本、manifest或兼容范围；昨日3.0.1只保留为历史记录，今天**无法公开复核**。JB2A [作者公开补丁说明](https://jules-bens-aa.github.io/jb2a-wiki/patchnotes/)顶部为v0.9.3，但这不是`jb2a_patreon`的精确付费manifest或可安装版本。历史manifest中另有9项Foundry `verified`低于14、7项dnd5e `verified`仅5.x；这是声明缺口，不能凭版本相同判它们在目标世界可用。此次没有重读目标安装包、下载付费包或改任何开关。

| 模块 ID | ServerNext 已装 | 官方公开上游 | 购买证据 | 本轮处置 |
|---|---:|---:|---|---|
| allies-and-antagonists | 已装 13.0.1 | 13.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/allies-and-antagonists) | PAID_RECORD_ONLY |
| atheron | 已装 1.0.2 | 1.0.2 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/atheron) | PAID_RECORD_ONLY |
| demon-queen-awakens | 已装 6.0.0 | 6.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/demon-queen-awakens) | PAID_RECORD_ONLY |
| dnd-adventures-faerun | 已装 1.2.1 | 1.2.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-adventures-faerun) | PAID_RECORD_ONLY |
| dnd-arcana-unleashed | 已装 1.0.0 | 1.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-arcana-unleashed) | PAID_RECORD_ONLY |
| dnd-deadfall | 已装 1.0.0 | 1.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-deadfall) | PAID_RECORD_ONLY |
| dnd-dungeon-masters-guide | 已装 2.0.0 | 2.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-dungeon-masters-guide) | PAID_RECORD_ONLY |
| dnd-forge-artificer | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-forge-artificer) | PAID_RECORD_ONLY |
| dnd-heroes-borderlands | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-heroes-borderlands) | PAID_RECORD_ONLY |
| dnd-heroes-faerun | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-heroes-faerun) | PAID_RECORD_ONLY |
| dnd-monster-manual | 已装 1.4.0 | 1.4.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-monster-manual) | PAID_RECORD_ONLY |
| dnd-phandelver-below | 已装 3.1.0 | 3.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-phandelver-below) | PAID_RECORD_ONLY |
| dnd-players-handbook | 已装 2.2.0 | 2.2.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-players-handbook) | PAID_RECORD_ONLY |
| dnd-ravenloft-horrors-within | 已装 1.0.1 | 1.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-ravenloft-horrors-within) | PAID_RECORD_ONLY |
| dnd-tashas-cauldron | 已装 4.0.0 | 4.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-tashas-cauldron) | PAID_RECORD_ONLY |
| dnd-tomb-annihilation | 已装 2.0.0 | 2.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/dnd-tomb-annihilation) | PAID_RECORD_ONLY |
| ec-zamanora-botw | 已装 1.0.1 | 1.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/ec-zamanora-botw) | PAID_RECORD_ONLY |
| ec-zamanora-maf | 已装 1.0.1 | 1.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/ec-zamanora-maf) | PAID_RECORD_ONLY |
| eoh-festering-city | 已装 2.1.0 | 2.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/eoh-festering-city) | PAID_RECORD_ONLY |
| eoh-setting-throne | 已装 2.2.0 | 2.2.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/eoh-setting-throne) | PAID_RECORD_ONLY |
| grim-hollow-monster-grimoire | 已装 1.0.0 | 1.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/grim-hollow-monster-grimoire) | PAID_RECORD_ONLY |
| heliana-core | 已装 2.4.2 | 2.4.2 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/heliana-core) | PAID_RECORD_ONLY |
| hexcrawl-hex-tiles | 已装 1.3.1 | 1.3.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/hexcrawl-hex-tiles) | PAID_RECORD_ONLY |
| house-divided | 已装 5.0.2 | 5.0.2 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/house-divided) | PAID_RECORD_ONLY |
| kp-prepared-expanded | 已装 13.0.0 | 13.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/kp-prepared-expanded) | PAID_RECORD_ONLY |
| librus-nocturnum | 已装 1.0.3 | 1.0.3 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/librus-nocturnum) | PAID_RECORD_ONLY |
| mcdm-class-bundle | 已装 3.0.0 | 3.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/mcdm-class-bundle) | PAID_RECORD_ONLY |
| mcdm-flee-mortals-where-evil-lives | 已装 3.0.0 | 3.0.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/mcdm-flee-mortals-where-evil-lives) | PAID_RECORD_ONLY |
| shards-and-traditions | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/shards-and-traditions) | PAID_RECORD_ONLY |
| tgbort | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/tgbort) | PAID_RECORD_ONLY |
| tgbortq | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/tgbortq) | PAID_RECORD_ONLY |
| the-folk-from-harrowthorpe | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/the-folk-from-harrowthorpe) | PAID_RECORD_ONLY |
| the-griffons-saddlebag-book-1-magic-items-and-player-options | 已装 3.0.0 | 9/23记录3.0.1；9/24公开精确版不可核 | [发行方 Book One 商品页](https://www.thegriffonssaddlebag.com/vtt-packs/foundry-year-1-megapack) | PAID_RECORD_ONLY |
| tile-arsenal | 已装 1.1.0 | 1.1.0 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/tile-arsenal) | PAID_RECORD_ONLY |
| weapons-of-lore | 已装 2.0.1 | 2.0.1 | [Foundry 包页 Purchase](https://foundryvtt.com/packages/weapons-of-lore) | PAID_RECORD_ONLY |
| filepicker-plus | 已装 6.0.1 | 6.0.1 | [Foundry 包页 Purchase: Patreon](https://foundryvtt.com/packages/filepicker-plus) | PAID_RECORD_ONLY |
| jb2a_patreon | 已装 0.8.7 | 无可公开核对的精确付费 manifest | [JB2A 发行方 Patreon 资源库](https://www.jb2a.com/) | PAID_RECORD_ONLY |

当前可公开精确复核的版本差异：Arcana Unleashed 1.0.0→1.0.1、Deadfall 1.0.0→1.0.1。Griffon Book One 3.0.0→3.0.1是9/23历史记录；9/24公开商品页无法证明今天的精确版本。其余32个有公开manifest的Batch 3包与9/23审计同版。JB2A Patreon的公开补丁说明提到v0.9.3，但无可取用且可验证的该付费manifest，本表不把它当作精确可安装版本。

`demon-queen-awakens` 已有 `BLOCKED_SIGNATURE` 是独立的运行完整性事实，不改变其付费仅记录的本轮处置。这个清单不声明 37 个模块均已在 dnd5e 6 实际可用。其余 48 项不能整体称为免费；对没有公开购买入口的自制或外部模块，继续按各自来源与兼容证据处理。

逐模块当前执行状态见 [最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)，完整官方 manifest 审计见 [85 项上游审计](./2026-09-23-server-next-all-mod-upstream-audit.md)。
