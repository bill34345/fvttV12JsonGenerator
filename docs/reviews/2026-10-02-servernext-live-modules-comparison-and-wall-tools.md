# 三环境当前运行模块对账与墙线工具

日期：2026-10-02，Asia/Shanghai。状态：三环境当前客户端只读对账和墙线资料核对完成；当前完整结果见本报告最终实时对账段，前置与认证阶段保留为历史。本报告不是迁移第二份总进度；已批准运行收尾结论仍见唯一迁移总表。

## 口径与服务预检

用户明确要此刻运行／启用的模块，不将磁盘安装或旧保存开关当作当前运行。Module Management的未修改初始checkbox来自game.modules中module.active，依据Core14.368 client/applications/sidebar/apps/module-management.mjs的239—247行。只打开界面、读取完整ID／名称／版本／checked状态；不Save、不改开关、不创建Macro或世界文档。

| 目标 | 当前实际世界与版本 | 证据层级 |
|---|---|---|
| Mirror 30001 | fvtt-v14-module-matrix／Core14.364／dnd5e5.3.3，PID64672，1人在线 | 当前测试世界，不是cor-cotn；不切世界，不操作另一任务页面 |
| Next 30002 | cor-cotn／Core14.368／dnd5e6.0.5，PID39148 | 当前服务身份已核，客户端模块清单待回执 |
| 线上8080 | cor-cotn／Core14.364／dnd5e5.3.3，active | 当前状态接口身份已核，客户端清单待回执；真实主机不入本报告 |

本机manifest盘点：Mirror117，Next103，仅代表安装。Foundry MCP Bridge未连接，未为盘点启用它。生产SSH inventory配置未在当前进程／用户环境发现，未绕过工具配置门禁；改用用户已授权的正常Chrome只读界面。浏览器不查cookies／凭据／profile；若生产需要正常登录由用户完成，不套用本地空密码约定。

## 自由画墙工具的官方核对

最吻合描述的是Monk’s Wall Enhancement，但用户回忆不能单独证明唯一身份。官方[功能说明](https://github.com/ironmonk108/monks-wall-enhancement#usage--current-features)包含Freehand Wall Drawing和Convert Drawing to Walls；[14.01手绘实现](https://github.com/ironmonk108/monks-wall-enhancement/blob/14.01/monks-wall-enhancement.js#L484-L513)把手绘轨迹简化为Wall；[Drawing转换路径](https://github.com/ironmonk108/monks-wall-enhancement/blob/14.01/monks-wall-enhancement.js#L1146-L1238)创建墙，并删除原被转换Drawing。这是行为说明，当前任务未执行转换或绘图。

| 模块 | 准确发布来源 | V14声明／系统依赖 | 本机安装 |
|---|---|---|---|
| Monk’s Wall Enhancement／monks-wall-enhancement | [14.01发布，2026-04-20](https://github.com/ironmonk108/monks-wall-enhancement/releases/tag/14.01)；[manifest](https://github.com/ironmonk108/monks-wall-enhancement/releases/latest/download/module.json) | minimum14／verified14，无systems限制、relationships为空；libWrapper源码路径可选 | Mirror和Next均14.01，当前active待回执 |
| Advanced Drawing Tools／advanced-drawing-tools | [v14.0.0发布，2026-06-29](https://github.com/DawidIzydor/advanced-drawing-tools/releases/tag/v14.0.0)；[准确发布manifest](https://github.com/DawidIzydor/advanced-drawing-tools/releases/download/v14.0.0/module.json) | minimum14／verified14，无systems限制，要求lib-wrapper | Mirror14.0.0；Next未安装 |

ADT的[功能表](https://github.com/DawidIzydor/advanced-drawing-tools#feature-overview)主要是Drawing图形／样式／多边形编辑，没有把自由画墙列为主要功能；[发行说明](https://github.com/DawidIzydor/advanced-drawing-tools/blob/v14.0.0/RELEASE_NOTES.md)说明V14／PixiJS8适配。其Foundry展示页Verified13与精确发布manifest不一致，不能据展示页判定v14.0.0不支持V14。

两者相关实现使用Foundry的Drawing／Wall／Scene接口，没有观察到dnd5e专属调用或系统版本限制。用户认为主要取决于CoreV14的方向成立；这只是manifest与源码推论，不能写成dnd5e6.x自由手绘／转墙实机PASS。Monk14.01仍使用PIXI.Graphics.lineStyle和WallsLayer拖拽包装；最小反证应是受控临时Scene中的一次自由手绘与一次Drawing转换，并检查墙段／预览／清理。当前用户只要求盘点和支持调查，没有执行该测试、启用／安装或重启授权。

## 当前对账执行与待补层级

新只读浏览器合同1b6fbeb3-82a1-42f9-b080-8473ac32b790／revision1，复用已授权Chrome执行器；准确父回调为当前聊天。仅出生审计页，严禁操作另一代理Mirror页651338418／旧1840510；不踢用户，不切世界，不Save模块管理器，不写本地／生产。Mirror无法使用空闲合适账号时报告共享前置，生产要求认证时报登录缺口，不将旧清单代替当前active。

私有证据根为F盘server-next-migration/module-live-comparison-20261002，含当前service-preflight、两套installed metadata及browser-contract。当前差集／完整inactive清单待真实模块管理器回执；旧9月Mirror cor-cotn保存77／78和线上81等历史数量只作历史参考，不用于当前差集。最终收到原件后补本报告的按精确ID差集、未安装／已装未启用分类和时间戳。

待判断本地化：未新增本地化项目。Monk候选已安装，不为本次调查改源码；ADT原关闭／Next未安装边界保持，用户若确需Drawing编辑再单独决定是否纳入。共用工具、既有E2E、运行世界、模块状态和发布授权均未改变。

## 本地当前客户端已父核，线上认证已恢复

只读回调36d7b026-d65c-496e-8cb7-4bc08fd7e0c4已正确送达：Next模块管理器102行，94启用／8未启用；Mirror当前matrix世界114行，12启用／102未启用。完整checkbox untouched，搜索为空，UI原件及精确时间戳存同证据根next-current-modules.json／mirror-current-modules.json。Mirror仅使用空闲测试GM2，另一任务页651338418及已占用Gamemaster未操作。

两边当前共同启用9项。Mirror启用而Next未启用3项，均在Next未安装：FVTT JSON Forge（fvtt-json-forge）、框选Token同步（fvtt-selected-token-sync）、Trigger Engine（fvtt-trigger-engine）。前后两项属于明确暂停；Token同步在9/29原Mirror cor-cotn基线保存为关闭，在当前matrix测试世界启用，不能据此倒改原迁移范围。Next启用而Mirror当前matrix未启用85项；完整精确ID／名字在local-partial-comparison.json，不用总数推断未迁移。

Monk’s Wall Enhancement14.01的Next checkbox=true、Mirror checkbox=false，均可启用；此时Next已运行该墙线模块。ADT14.0.0在Mirror checkbox=false且可启用，Next未安装。此结果是当前加载状态，不是自由手绘／转墙功能接受。

Next当前8个未启用包：Arcana Unleashed: Deadfall、Heroes of the Borderlands、Phandelver & Below: The Shattered Obelisk、Tomb of Annihilation、Echoes of Heaven: The Festering Earth、Echoes of Heaven Campaign Setting/The Throne of God、Grim Hollow - Monster Grimoire、A House Divided。Next磁盘第103项The Demon Queen Awakens未出现在当前管理器；本轮仅确认无当前条目，历史签名异常不升级为本轮复验原因。Mirror另有bad／good／sample三个无title磁盘manifest，未出现在管理器，不当作正式当前运行模块。

线上首轮正常game访问转Join，认证阻塞原件保留。用户已在父聊天明确回复登录了，准确出生认证页651338453收到新只读合同6e477859-12ea-42ea-b913-c489d77db52d／revision1，只补线上当前管理器；不重复已接受Next／Mirror采集。线上旧阻塞JSON不覆盖，新认证清单单独保存，完整三方差集待回调。已关闭本批Next651338447和Mirror651338450审计页，线上出生页暂保留供认证读取，未写设置／模块／世界。

## 最终实时对账：三环境原件齐全

本次只读对账已完成。此前认证阻塞原件保留；用户正常登录后才取得线上当前清单。以下启用表示未触碰的模块管理器初始checkbox，属于当前客户端module.active，不是仅磁盘安装或旧世界保存开关。

| 环境 | 当前世界 | 采集时间（上海） | 管理器行数 | 启用 | 未启用 |
|---|---|---|---|---|---|
| Next | cor-cotn | 2026/10/2 18:39:43 | 102 | 94 | 8 |
| Mirror | fvtt-v14-module-matrix | 2026/10/2 18:39:43 | 114 | 12 | 102 |
| 线上8080 | cor-cotn | 2026/10/2 18:46:39 | 188 | 81 | 107 |

### 线上当前启用，但Next没有运行：完整8项

这8项在Next管理器与本机安装manifest中均缺席，属于未安装。此前已批准迁移范围闭合，不等于Next完整覆盖此刻线上启用集合；新对账缺口在此明确登记，不能自动安装、解除暂停或测试付费内容。

| 包名称 | 精确ID | 线上版本 | Mirror当前状态 | Next状态 |
|---|---|---|---|---|
| Cze and Peku - Swamp Graveyard | czepeku-262-swamp-graveyard | 1.0.0 | 未安装 | 未安装 |
| Cze and Peku - Depths of the Festerwood | czepeku-29-depths-of-the-festerwood | 1.0.2 | 未安装 | 未安装 |
| Universal Battlemap Importer | dd-import | 6.1.1 | 未启用 | 未安装 |
| DND5E不全包 | dnd5e_classpack | 4.3.4-v14.1 | 未启用 | 未安装 |
| DND5E城主工具包 | dnd5e_DMTools | 1.4.0 | 未安装 | 未安装 |
| Dungeon Strugglers' Items Coollection | dungeon-strugglers-collection | 1.1.1 | 未启用 | 未安装 |
| 框选 Token 同步 / Selected Token Sync | fvtt-selected-token-sync | 0.1.0 | 启用 | 未安装 |
| Plutonium CN | plutonium-cn | 2.15.6 | 未启用 | 未安装 |

其中Cze and Peku两图包与DND5E城主工具包在Mirror也未安装。当前Mirror的Token同步启用来自测试世界；它在9/29旧cor-cotn保存基线为关闭。本轮没有因此倒改原排除范围。Dungeon Strugglers和Plutonium原明确暂停，DND5E不全包与Universal Battlemap Importer原基线关闭；其当前线上启用是本次新采集事实。

### Mirror当前启用，但Next没有运行：完整3项

| 包名称 | 精确ID | Mirror版本 | 线上状态 | Next状态 |
|---|---|---|---|---|
| FVTT JSON Forge | fvtt-json-forge | 0.4.0 | 管理器无条目 | 未安装 |
| 框选 Token 同步 / Selected Token Sync | fvtt-selected-token-sync | 0.1.0 | 启用 | 未安装 |
| Trigger Engine / 触发器引擎 | fvtt-trigger-engine | 0.2.0 | 管理器无条目 | 未安装 |

### Next启用，但线上当前没有运行：完整21项

| 包名称 | 精确ID | Next版本 | 线上当前状态 |
|---|---|---|---|
| Allies and Antagonists | allies-and-antagonists | 13.0.1 | 管理器无条目 |
| Atheron Campaign Setting | atheron | 1.0.2 | 管理器无条目 |
| Arcana Unleashed | dnd-arcana-unleashed | 1.0.0 | 管理器无条目 |
| Tasha's Cauldron of Everything | dnd-tashas-cauldron | 4.0.0 | 未启用 |
| ZAMANORA: Ballad of the Witch - Core Book | ec-zamanora-botw | 1.0.1 | 管理器无条目 |
| ZAMANORA: Ballad of the Witch - Monsters & Fables | ec-zamanora-maf | 1.0.1 | 管理器无条目 |
| Filepicker Plus | filepicker-plus | 6.0.1 | 未启用 |
| Battlefield Painter | fvtt-battlefield-painter | 0.3.0-alpha.2 | 管理器无条目 |
| Heliana's Guide to Monster Hunting | heliana-core | 2.4.2 | 管理器无条目 |
| Hexcrawl Hex Tiles | hexcrawl-hex-tiles | 1.3.1 | 管理器无条目 |
| Prepared! Expanded Collection | kp-prepared-expanded | 13.0.0 | 管理器无条目 |
| Librus Nocturnum | librus-nocturnum | 1.0.3 | 管理器无条目 |
| MCDM Class Bundle | mcdm-class-bundle | 3.0.0 | 管理器无条目 |
| Monk's Common Display | monks-common-display | 14.01 | 未启用 |
| Shards and Traditions | shards-and-traditions | 1.1.0 | 管理器无条目 |
| The Great Book of Random Tables | tgbort | 1.1.0 | 管理器无条目 |
| The Great Book of Random Tables: Quests | tgbortq | 1.1.0 | 管理器无条目 |
| The Folk from Harrowthorpe | the-folk-from-harrowthorpe | 1.1.0 | 管理器无条目 |
| The Griffon's Saddlebag, Book One Magic Items and Character Options | the-griffons-saddlebag-book-1-magic-items-and-player-options | 3.0.0 | 管理器无条目 |
| Tile Arsenal | tile-arsenal | 1.1.0 | 管理器无条目 |
| Weapons of Lore | weapons-of-lore | 2.0.1 | 管理器无条目 |

Next启用而当前Mirror测试世界未启用85项，不等于85个应迁移故障；在下方完整状态矩阵逐项展示。

### Next已登记但未启用：完整8项

| 包名称 | 精确ID | 版本 |
|---|---|---|
| Arcana Unleashed: Deadfall | dnd-deadfall | 1.0.0 |
| Heroes of the Borderlands | dnd-heroes-borderlands | 1.1.0 |
| Phandelver & Below: The Shattered Obelisk | dnd-phandelver-below | 3.1.0 |
| Tomb of Annihilation | dnd-tomb-annihilation | 2.0.0 |
| Echoes of Heaven: The Festering Earth | eoh-festering-city | 2.1.0 |
| Echoes of Heaven Campaign Setting/The Throne of God | eoh-setting-throne | 2.2.0 |
| Grim Hollow - Monster Grimoire | grim-hollow-monster-grimoire | 1.0.0 |
| A House Divided | house-divided | 5.0.2 |

另The Demon Queen Awakens磁盘有manifest，但管理器无条目；只登记此状态，不把历史签名异常当作本轮重验原因。Mirror的bad／good／sample无title磁盘记录也无管理器条目，不视作正式运行包。

### Mirror当前未启用：完整102项

| 包名称 | 精确ID | 版本 |
|---|---|---|
| Chat Commander | _chatcommands | 2.0.6 |
| 3DS:ATLAS | 3ds-atlas | 1.0 |
| Translation: 中文 [DnD5E] | 5e_chn | 5.3.0 |
| 5e不全书在线版 (5e CHM Online) | 5e-chm-online | 251108 |
| 5e扩展书怪物 | 5e-dlc-monster | 1.2.0 |
| Advanced Drawing Tools | advanced-drawing-tools | 14.0.0 |
| Always HP | always-hp | 14.01 |
| Aura Effects | auraeffects | 2.1.1 |
| Automated Animations | autoanimations | 7.0.17 |
| Automated Conditions 5e | automated-conditions-5e | 14.533.8 |
| Automated Evocations - Companion Manager | automated-evocations | 6.0.0 |
| Babele | babele | 2.9.1 |
| Calendaria | calendaria | 1.2.0 |
| Chat Media | chat-media | 14.0.1 |
| Chat Memory Guard / 聊天内存保护 | chat-memory-guard | 1.0.0 |
| Color Picker | color-picker | 1.7 |
| Custom CSS | custom-css | 2.4.4 |
| Universal Battlemap Importer | dd-import | 6.1.1 |
| DFreds Chat Pins | dfreds-chat-pins | 6.1.0 |
| DFreds Convenient Effects | dfreds-convenient-effects | 9.1.0 |
| DFreds Droppables | dfreds-droppables | 6.1.2 |
| Dice Tray | dice-calculator | 3.7.1 |
| Dice So Nice! | dice-so-nice | 6.2.9 |
| Forgotten Realms: Adventures in Faerûn | dnd-adventures-faerun | 1.2.1 |
| Dungeons & Dragons Dungeon Master's Guide | dnd-dungeon-masters-guide | 2.0.0 |
| Eberron: Forge of the Artificer | dnd-forge-artificer | 1.1.0 |
| Forgotten Realms: Heroes of Faerûn | dnd-heroes-faerun | 1.1.0 |
| Dungeons & Dragons Monster Manual | dnd-monster-manual | 1.3.0 |
| Dungeons & Dragons Player's Handbook | dnd-players-handbook | 2.1.0 |
| Ravenloft: The Horrors Within | dnd-ravenloft-horrors-within | 1.0.1 |
| Translation: 中文 [DND5E-Babele] | dnd-simplified-chinese-babele-patch | 1.0.89 |
| DND5E不全包 | dnd5e_classpack | 4.3.4-v14.2 |
| D&D5e Animations | dnd5e-animations | 3.3.0 |
| Dungeon Strugglers' Items Coollection | dungeon-strugglers-collection | 1.1.1 |
| Easy Target | easy-target | 4.0 |
| Forgotten Adventures Battlemaps | fa-battlemaps | 1.2.21 |
| Filepicker Plus | filepicker-plus | 6.0.1 |
| Find the Culprit | find-the-culprit | 3.3.0 |
| Translation: 中文 [Core] | foundry_chn | 14.364 |
| Foundry MCP Bridge | foundry-mcp-bridge | 0.8.2 |
| Dig Down - Advanced Search | fuzzy-foundry | 5.0.0 |
| Babele RollTable @Embed Translation | fvtt-babele-rolltable-embed-translation | 0.1.0 |
| Battlefield Painter | fvtt-battlefield-painter | 0.3.0-alpha.1 |
| 自定义状态 / Custom Conditions | fvtt-custom-conditions | 0.2.0 |
| FVTT JSON Generator Spell Resolver | fvtt-json-generator-spell-resolver | 0.1.0 |
| Party Resources | fvtt-party-resources | 1.9.0a |
| FVTT Session Monitor / 跑团会话监测器 | fvtt-session-monitor | 1.1.1 |
| 武器精通与特性 / Weapon Mastery & Properties | fvtt-weapon-mastery-properties | 0.1.0 |
| Gambit's FXMaster | fxmaster | 8.2.4 |
| Global Progress Clocks | global-progress-clocks | 1.3.2 |
| Hide NPC Names | hide-npc-names | 1.3.4 |
| Item Piles | item-piles | 3.3.4 |
| Item Macro | itemacro | 3.0.1 |
| Item Piles: D&D 5e | itempilesdnd5e | 1.1.0 |
| JB2A - Patreon Complete Collection | jb2a_patreon | 0.8.7 |
| Levels | levels | 7.0.3 |
| Lib: DFreds Migrations | lib-dfreds-migrations | 1.0.3 |
| Lib: DFreds UI Extender | lib-dfreds-ui-extender | 2.3.0 |
| Map Image Optimizer Bridge | map-image-optimizer-bridge | 2.1.0 |
| Flee, Mortals! & Where Evil Lives | mcdm-flee-mortals-where-evil-lives | 2.0.1 |
| Midi QOL | midi-qol | 14.0.11 |
| Monk's Active Tile Triggers | monks-active-tiles | 14.01 |
| Monk's Bloodsplats | monks-bloodsplats | 14.01 |
| Monk's Chat Timer | monks-chat-timer | 14.01 |
| Monk's Combat Details | monks-combat-details | 14.02 |
| Monk's Combat Marker | monks-combat-marker | 12.01 |
| Monk's Common Display | monks-common-display | 14.01 |
| Monk's Enhanced Journal | monks-enhanced-journal | 13.06 |
| Monk's Little Details | monks-little-details | 14.01 |
| Monk's Scene Navigation | monks-scene-navigation | 14.02 |
| Monk's TokenBar | monks-tokenbar | 14.01 |
| Monk's Wall Enhancement | monks-wall-enhancement | 14.01 |
| Baileywiki Mass Edit | multi-token-edit | 3.2.2 |
| Multilevel Tokens, by Beneos | multilevel-tokens | 14.1.3 |
| Multiple Document Selection | multiple-document-selection | 14.01 |
| Open Session Deck / 开放式跑团副屏 | open-session-deck | 0.1.0 |
| Plutonium CN | plutonium-cn | 2.15.6 |
| Polyglot | polyglot | 2.9.2 |
| Portal | portal-lib | 4.0.0 |
| PSFX - Peri's Sound Effects | psfx | 0.15.0 |
| Quick Insert - Search Widget | quick-insert | 3.7.7 |
| QuickScale | quickscale | 1.7.0 |
| 鸦阁巴别塔机翻 | Ravenloft-babele | 1.0.0 |
| 回收站 | recycle-bin | 2.0 |
| Grid Scaler | scaleGrid | 1.5.0 |
| Library: Scene Packer | scene-packer | 2.8.12 |
| Sequencer | sequencer | 4.2.3 |
| Share Media | share-media | 3.14.2 |
| Simple Quest | simple-quest | 2.3.10 |
| Simple Cover 5e | simplecover5e | 2.2.0-cor-cotn.1 |
| Swarms | swarm | 14.0.2 |
| Swipe | swipe-vtt | 2.3.0 |
| Sync Token Actor | sync-token-actor | 3.1.0 |
| Sync Token Names | sync-token-name | 2.0.0 |
| Tagger | tagger | 1.6.0 |
| Tidy 5e Sheets | tidy5e-sheet | 13.5.0 |
| Tile Scroll | tile-scroll | 5.0.0 |
| Token Magic FX | tokenmagic | 0.8.4 |
| Translate All | translate-all | 2.1.0 |
| Vision 5e | vision-5e | 3.1.3 |
| Z Scatter | z-scatter | 2.2.4 |
| Translation: 中文 [Mod] | zzz_mod_chn | 13.93 |

### 线上当前未启用：完整107项

| 包名称 | 精确ID | 版本 |
|---|---|---|
| 5e不全书在线版 (5e CHM Online) | 5e-chm-online | 251108 |
| Advanced Drawing Tools | advanced-drawing-tools | 14.0.0 |
| Always HP | always-hp | 14.01 |
| Active Token Effects | ATL | v1.1.1 |
| Better Roofs | betterroofs | 4.0.2 |
| Chat Media | chat-media | 14.0.1 |
| lib - Color Settings | colorsettings | 3.0.4 |
| Crunch My Party! | crunch-my-party | 14.0.0 |
| DF Chat Enhancements | df-chat-enhance | 5.1.0 |
| DF Curvy Walls | df-curvy-walls | 13.0.0 |
| DFreds Chat Pins | dfreds-chat-pins | 6.1.0 |
| Heroes of the Borderlands | dnd-heroes-borderlands | 1.1.0 |
| Tasha's Cauldron of Everything | dnd-tashas-cauldron | 3.0.0 |
| System Customizer | dnd5e-system-customizer | 3.1.0 |
| Dorman Lakely's Critical Hit & Fumble Tables | dorman-lakelys-crit-fumble-tables | 1.4.0 |
| Daggerheart Duality Dice Roller | duality-roller | 1.2.0 |
| Forgotten Adventures Battlemaps | fa-battlemaps | 1.2.21 |
| Fear Tracker for Foundry | fear-tracker | 0.4.09 |
| Filepicker Plus | filepicker-plus | 6.0.1 |
| Find the Culprit | find-the-culprit | 3.3.0 |
| Forien's Copy Environment | forien-copy-environment | v3.0.0 |
| Dig Down - Advanced Search | fuzzy-foundry | 5.0.0 |
| Paper Doll | fvtt-paper-doll-ui | 1.1.2 |
| Party Resources | fvtt-party-resources | 1.9.0a |
| Group Initiative | group-initiative | 2.1.7 |
| Hot Pan & Zoom! | hot-pan | 14.0.0 |
| Hotpot! | hotpot-daggerheart | 1.2.1 |
| Image Hover | image-hover | 3.2 |
| Integrate AI | integrate-ai | 1.2.0 |
| Integrate AI: Gimme a Hook | integrate-ai-gimme-a-hook | 1.0.0 |
| Integrate AI: Gimme a Name | integrate-ai-gimme-a-name | 1.0.0 |
| Kingdoms & Warfare Actors | knw-actors | 2.0.6 |
| Layer Hotkeys | layer-hotkeys | 2.8.1 |
| Levels | levels | 7.0.3 |
| Library: DF Module Buttons | lib-df-buttons | 13.1.1 |
| 🕯️ Light Sources | light-sources | 0.0.3 |
| Lock View | LockView | 2.1.0 |
| Free Map Pack \| The MAD Cartographer | mad-freecontent | 14.2.0 |
| Map Image Optimizer Bridge | map-image-optimizer-bridge | 2.1.0 |
| Media Preview | media-preview | 0.0.3 |
| Monk's Combat Marker | monks-combat-marker | 12.01 |
| Monk's Common Display | monks-common-display | 14.01 |
| Monk's Enhanced Journal | monks-enhanced-journal | 13.06 |
| Monk's Hotbar Expansion | monks-hotbar-expansion | 14.01 |
| Baileywiki Mass Edit | multi-token-edit | 3.2.2 |
| Multilevel Tokens, by Beneos | multilevel-tokens | 14.1.3 |
| Notebook | notebook | 3.0.0 |
| Pings | pings | 1.4.3 |
| Polyglot | polyglot | 2.9.2 |
| Progress/Countdown Tracker | progress-countdown-tracker | 1.0.23 |
| Racooze's Free Battlemaps | racoozes-free-battlemaps | 1.1.24 |
| 回收站 | recycle-bin | 2.0 |
| Grid Scaler | scaleGrid | 1.5.0 |
| Library: Scene Packer | scene-packer | 2.8.12 |
| Settings Extender | settings-extender | 2.0.0 |
| Swarms | swarm | 14.0.2 |
| Swipe | swipe-vtt | 2.3.0 |
| Tagger | tagger | 1.6.0 |
| The Griffon's Saddlebag, Pack 2021-11 | the-griffons-saddlebag-pack-2021-11 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2021-12 | the-griffons-saddlebag-pack-2021-12 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-01 | the-griffons-saddlebag-pack-2022-01 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-02 | the-griffons-saddlebag-pack-2022-02 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-03 | the-griffons-saddlebag-pack-2022-03 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-04 | the-griffons-saddlebag-pack-2022-04 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-05 | the-griffons-saddlebag-pack-2022-05 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-06 | the-griffons-saddlebag-pack-2022-06 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-07 | the-griffons-saddlebag-pack-2022-07 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-11 | the-griffons-saddlebag-pack-2022-11 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2022-12 | the-griffons-saddlebag-pack-2022-12 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-01 | the-griffons-saddlebag-pack-2023-01 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-02 | the-griffons-saddlebag-pack-2023-02 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-03 | the-griffons-saddlebag-pack-2023-03 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-04 | the-griffons-saddlebag-pack-2023-04 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-05 | the-griffons-saddlebag-pack-2023-05 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-06 | the-griffons-saddlebag-pack-2023-06 | 2.0.1 |
| The Griffon's Saddlebag, Pack 2023-07 | the-griffons-saddlebag-pack-2023-07 | 1.0.1 |
| The Griffon's Saddlebag, Pack 2023-08 | the-griffons-saddlebag-pack-2023-08 | 1.0.1 |
| The Griffon's Saddlebag, Pack 2023-09 | the-griffons-saddlebag-pack-2023-09 | 1.0.1 |
| The Griffon's Saddlebag, Pack 2023-10 | the-griffons-saddlebag-pack-2023-10 | 1.0.1 |
| The Griffon's Saddlebag, Pack 2023-11 | the-griffons-saddlebag-pack-2023-11 | 2.0 |
| The Griffon's Saddlebag, Pack 2023-12 | the-griffons-saddlebag-pack-2023-12 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-01 | the-griffons-saddlebag-pack-2024-01 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-02 | the-griffons-saddlebag-pack-2024-02 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-03 | the-griffons-saddlebag-pack-2024-03 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-04 | the-griffons-saddlebag-pack-2024-04 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-05 | the-griffons-saddlebag-pack-2024-05 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-06 | the-griffons-saddlebag-pack-2024-06 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-07 | the-griffons-saddlebag-pack-2024-07 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-08 | the-griffons-saddlebag-pack-2024-08 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-09 | the-griffons-saddlebag-pack-2024-09 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-10 | the-griffons-saddlebag-pack-2024-10 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-11 | the-griffons-saddlebag-pack-2024-11 | 2.0 |
| The Griffon's Saddlebag, Pack 2024-12 | the-griffons-saddlebag-pack-2024-12 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-01 | the-griffons-saddlebag-pack-2025-01 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-02 | the-griffons-saddlebag-pack-2025-02 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-03 | the-griffons-saddlebag-pack-2025-03 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-04 | the-griffons-saddlebag-pack-2025-04 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-05 | the-griffons-saddlebag-pack-2025-05 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-06 | the-griffons-saddlebag-pack-2025-06 | 2.0 |
| The Griffon's Saddlebag, Pack 2025-07 | the-griffons-saddlebag-pack-2025-07 | 2.0 |
| The Southern Alliance | the-southern-alliance | 1.1.0 |
| TheRipper93's Module Hub | theripper-premium-hub | 6.0.1 |
| Tile Scroll | tile-scroll | 5.0.0 |
| Token Lean: Peek Around Corners | token-lean | 2.2.5 |
| Token Magic FX | tokenmagic | 0.8.4 |
| Translate All | translate-all | 2.1.0 |
| Wall Height | wall-height | 7.0.8 |

### 所有可见包及本机磁盘记录的完整状态矩阵

线上“管理器无条目”不能升级为服务器磁盘未安装，本轮未取得生产SSH磁盘inventory。Next／Mirror的“未安装”同时依据UI缺席和本机manifest缺席。

| 名称 | 精确ID | Next cor-cotn | Mirror matrix | 线上 cor-cotn |
|---|---|---|---|---|
| 3DS:ATLAS | 3ds-atlas | 启用 | 未启用 | 启用 |
| 5e不全书在线版 (5e CHM Online) | 5e-chm-online | 未安装 | 未启用 | 未启用 |
| 5e扩展书怪物 | 5e-dlc-monster | 启用 | 未启用 | 启用 |
| Translation: 中文 [DnD5E] | 5e_chn | 启用 | 未启用 | 启用 |
| Active Token Effects | ATL | 未安装 | 未安装 | 未启用 |
| Lock View | LockView | 未安装 | 未安装 | 未启用 |
| 鸦阁巴别塔机翻 | Ravenloft-babele | 启用 | 未启用 | 启用 |
| Chat Commander | _chatcommands | 启用 | 未启用 | 启用 |
| Advanced Drawing Tools | advanced-drawing-tools | 未安装 | 未启用 | 未启用 |
| Allies and Antagonists | allies-and-antagonists | 启用 | 未安装 | 管理器无条目 |
| Always HP | always-hp | 未安装 | 未启用 | 未启用 |
| Atheron Campaign Setting | atheron | 启用 | 未安装 | 管理器无条目 |
| Aura Effects | auraeffects | 启用 | 未启用 | 启用 |
| Automated Animations | autoanimations | 启用 | 未启用 | 启用 |
| Automated Conditions 5e | automated-conditions-5e | 启用 | 未启用 | 启用 |
| Automated Evocations - Companion Manager | automated-evocations | 启用 | 未启用 | 启用 |
| Babele | babele | 启用 | 未启用 | 启用 |
| bad | bad | 未安装 | 仅磁盘，无管理器条目 | 管理器无条目 |
| Better Roofs | betterroofs | 未安装 | 未安装 | 未启用 |
| Calendaria | calendaria | 启用 | 未启用 | 启用 |
| Chat Media | chat-media | 未安装 | 未启用 | 未启用 |
| Chat Memory Guard / 聊天内存保护 | chat-memory-guard | 启用 | 未启用 | 启用 |
| Color Picker | color-picker | 启用 | 未启用 | 启用 |
| lib - Color Settings | colorsettings | 未安装 | 未安装 | 未启用 |
| Crunch My Party! | crunch-my-party | 未安装 | 未安装 | 未启用 |
| Custom CSS | custom-css | 启用 | 未启用 | 启用 |
| Cze and Peku - Swamp Graveyard | czepeku-262-swamp-graveyard | 未安装 | 未安装 | 启用 |
| Cze and Peku - Depths of the Festerwood | czepeku-29-depths-of-the-festerwood | 未安装 | 未安装 | 启用 |
| Dynamic effects using Active Effects (DAE, ServerNext local) | dae | 启用 | 启用 | 启用 |
| Universal Battlemap Importer | dd-import | 未安装 | 未启用 | 启用 |
| The Demon Queen Awakens | demon-queen-awakens | 仅磁盘，无管理器条目 | 未安装 | 管理器无条目 |
| DF Chat Enhancements | df-chat-enhance | 未安装 | 未安装 | 未启用 |
| DF Curvy Walls | df-curvy-walls | 未安装 | 未安装 | 未启用 |
| DFreds Chat Pins | dfreds-chat-pins | 未安装 | 未启用 | 未启用 |
| DFreds Convenient Effects | dfreds-convenient-effects | 启用 | 未启用 | 启用 |
| DFreds Droppables (ServerNext local 1) | dfreds-droppables | 启用 | 未启用 | 启用 |
| Dice Tray | dice-calculator | 启用 | 未启用 | 启用 |
| Dice So Nice! | dice-so-nice | 启用 | 未启用 | 启用 |
| Forgotten Realms: Adventures in Faerûn | dnd-adventures-faerun | 启用 | 未启用 | 启用 |
| Arcana Unleashed | dnd-arcana-unleashed | 启用 | 未安装 | 管理器无条目 |
| Arcana Unleashed: Deadfall | dnd-deadfall | 未启用 | 未安装 | 管理器无条目 |
| Dungeons & Dragons Dungeon Master's Guide | dnd-dungeon-masters-guide | 启用 | 未启用 | 启用 |
| Eberron: Forge of the Artificer | dnd-forge-artificer | 启用 | 未启用 | 启用 |
| Heroes of the Borderlands | dnd-heroes-borderlands | 未启用 | 未安装 | 未启用 |
| Forgotten Realms: Heroes of Faerûn | dnd-heroes-faerun | 启用 | 未启用 | 启用 |
| Dungeons & Dragons Monster Manual | dnd-monster-manual | 启用 | 未启用 | 启用 |
| Phandelver & Below: The Shattered Obelisk | dnd-phandelver-below | 未启用 | 未安装 | 管理器无条目 |
| Dungeons & Dragons Player's Handbook | dnd-players-handbook | 启用 | 未启用 | 启用 |
| Ravenloft: The Horrors Within | dnd-ravenloft-horrors-within | 启用 | 未启用 | 启用 |
| Translation: 中文 [DND5E-Babele] | dnd-simplified-chinese-babele-patch | 启用 | 未启用 | 启用 |
| Tasha's Cauldron of Everything | dnd-tashas-cauldron | 启用 | 未安装 | 未启用 |
| Tomb of Annihilation | dnd-tomb-annihilation | 未启用 | 未安装 | 管理器无条目 |
| D&D5e Animations | dnd5e-animations | 启用 | 未启用 | 启用 |
| System Customizer | dnd5e-system-customizer | 未安装 | 未安装 | 未启用 |
| DND5E城主工具包 | dnd5e_DMTools | 未安装 | 未安装 | 启用 |
| DND5E不全包 | dnd5e_classpack | 未安装 | 未启用 | 启用 |
| Dorman Lakely's Critical Hit & Fumble Tables | dorman-lakelys-crit-fumble-tables | 未安装 | 未安装 | 未启用 |
| Daggerheart Duality Dice Roller | duality-roller | 未安装 | 未安装 | 未启用 |
| Dungeon Strugglers' Items Coollection | dungeon-strugglers-collection | 未安装 | 未启用 | 启用 |
| Easy Target | easy-target | 未安装 | 未启用 | 管理器无条目 |
| ZAMANORA: Ballad of the Witch - Core Book | ec-zamanora-botw | 启用 | 未安装 | 管理器无条目 |
| ZAMANORA: Ballad of the Witch - Monsters & Fables | ec-zamanora-maf | 启用 | 未安装 | 管理器无条目 |
| Echoes of Heaven: The Festering Earth | eoh-festering-city | 未启用 | 未安装 | 管理器无条目 |
| Echoes of Heaven Campaign Setting/The Throne of God | eoh-setting-throne | 未启用 | 未安装 | 管理器无条目 |
| Forgotten Adventures Battlemaps | fa-battlemaps | 未安装 | 未启用 | 未启用 |
| Fear Tracker for Foundry | fear-tracker | 未安装 | 未安装 | 未启用 |
| Filepicker Plus | filepicker-plus | 启用 | 未启用 | 未启用 |
| Find the Culprit | find-the-culprit | 未安装 | 未启用 | 未启用 |
| Forien's Copy Environment | forien-copy-environment | 未安装 | 未安装 | 未启用 |
| Foundry MCP Bridge | foundry-mcp-bridge | 未安装 | 未启用 | 管理器无条目 |
| Translation: 中文 [Core] | foundry_chn | 启用 | 未启用 | 启用 |
| Dig Down - Advanced Search | fuzzy-foundry | 未安装 | 未启用 | 未启用 |
| Babele RollTable @Embed Translation | fvtt-babele-rolltable-embed-translation | 启用 | 未启用 | 启用 |
| Battlefield Painter | fvtt-battlefield-painter | 启用 | 未启用 | 管理器无条目 |
| 血猎手 2024 | fvtt-blood-hunter-2024 | 启用 | 启用 | 启用 |
| 自定义状态 / Custom Conditions | fvtt-custom-conditions | 未安装 | 未启用 | 管理器无条目 |
| Homebrew Species / 自制种族 | fvtt-homebrew-species | 启用 | 启用 | 启用 |
| 本团村规 / House Rules | fvtt-house-rules | 启用 | 启用 | 启用 |
| 伤势与消逝的灵魂 / Injury & The Fading Spirits | fvtt-injury-fading-spirits | 启用 | 启用 | 启用 |
| FVTT JSON Forge | fvtt-json-forge | 未安装 | 启用 | 管理器无条目 |
| FVTT JSON Generator Spell Resolver | fvtt-json-generator-spell-resolver | 启用 | 未启用 | 启用 |
| Paper Doll | fvtt-paper-doll-ui | 未安装 | 未安装 | 未启用 |
| Party Resources | fvtt-party-resources | 未安装 | 未启用 | 未启用 |
| 框选 Token 同步 / Selected Token Sync | fvtt-selected-token-sync | 未安装 | 启用 | 启用 |
| FVTT Session Monitor / 跑团会话监测器 | fvtt-session-monitor | 启用 | 未启用 | 启用 |
| Trigger Engine / 触发器引擎 | fvtt-trigger-engine | 未安装 | 启用 | 管理器无条目 |
| 武器精通与特性 / Weapon Mastery & Properties | fvtt-weapon-mastery-properties | 未安装 | 未启用 | 管理器无条目 |
| Gambit's FXMaster | fxmaster | 启用 | 未启用 | 启用 |
| Global Progress Clocks (ServerNext local 1) | global-progress-clocks | 启用 | 未启用 | 启用 |
| good | good | 未安装 | 仅磁盘，无管理器条目 | 管理器无条目 |
| Grim Hollow - Monster Grimoire | grim-hollow-monster-grimoire | 未启用 | 未安装 | 管理器无条目 |
| Group Initiative | group-initiative | 未安装 | 未安装 | 未启用 |
| Heliana's Guide to Monster Hunting | heliana-core | 启用 | 未安装 | 管理器无条目 |
| Hexcrawl Hex Tiles | hexcrawl-hex-tiles | 启用 | 未安装 | 管理器无条目 |
| Hide NPC Names | hide-npc-names | 启用 | 未启用 | 启用 |
| Hot Pan & Zoom! | hot-pan | 未安装 | 未安装 | 未启用 |
| Hotpot! | hotpot-daggerheart | 未安装 | 未安装 | 未启用 |
| A House Divided | house-divided | 未启用 | 未安装 | 管理器无条目 |
| Image Hover | image-hover | 未安装 | 未安装 | 未启用 |
| Integrate AI | integrate-ai | 未安装 | 未安装 | 未启用 |
| Integrate AI: Gimme a Hook | integrate-ai-gimme-a-hook | 未安装 | 未安装 | 未启用 |
| Integrate AI: Gimme a Name | integrate-ai-gimme-a-name | 未安装 | 未安装 | 未启用 |
| Item Piles (ServerNext local 1) | item-piles | 启用 | 未启用 | 启用 |
| Item Macro (ServerNext local 1) | itemacro | 启用 | 未启用 | 启用 |
| Item Piles: D&D 5e (ServerNext local 2) | itempilesdnd5e | 启用 | 未启用 | 启用 |
| JB2A - Patreon Complete Collection | jb2a_patreon | 启用 | 未启用 | 启用 |
| Kingdoms & Warfare Actors | knw-actors | 未安装 | 未安装 | 未启用 |
| Prepared! Expanded Collection | kp-prepared-expanded | 启用 | 未安装 | 管理器无条目 |
| Layer Hotkeys | layer-hotkeys | 未安装 | 未安装 | 未启用 |
| Levels | levels | 未安装 | 未启用 | 未启用 |
| Library: DF Module Buttons | lib-df-buttons | 未安装 | 未安装 | 未启用 |
| Lib: DFreds Migrations | lib-dfreds-migrations | 启用 | 未启用 | 启用 |
| Lib: DFreds UI Extender | lib-dfreds-ui-extender | 启用 | 未启用 | 启用 |
| libWrapper | lib-wrapper | 启用 | 启用 | 启用 |
| Librus Nocturnum | librus-nocturnum | 启用 | 未安装 | 管理器无条目 |
| 🕯️ Light Sources | light-sources | 未安装 | 未安装 | 未启用 |
| Free Map Pack \| The MAD Cartographer | mad-freecontent | 未安装 | 未安装 | 未启用 |
| Map Image Optimizer Bridge | map-image-optimizer-bridge | 未安装 | 未启用 | 未启用 |
| MCDM Class Bundle | mcdm-class-bundle | 启用 | 未安装 | 管理器无条目 |
| Flee, Mortals! & Where Evil Lives | mcdm-flee-mortals-where-evil-lives | 启用 | 未启用 | 启用 |
| Media Preview | media-preview | 未安装 | 未安装 | 未启用 |
| Midi-QOL Beta (dnd5e 6, ServerNext local) | midi-qol | 启用 | 未启用 | 启用 |
| Monk's Active Tile Triggers | monks-active-tiles | 启用 | 未启用 | 启用 |
| Monk's Bloodsplats | monks-bloodsplats | 启用 | 未启用 | 启用 |
| Monk's Chat Timer | monks-chat-timer | 启用 | 未启用 | 启用 |
| Monk's Combat Details | monks-combat-details | 启用 | 未启用 | 启用 |
| Monk's Combat Marker | monks-combat-marker | 未安装 | 未启用 | 未启用 |
| Monk's Common Display | monks-common-display | 启用 | 未启用 | 未启用 |
| Monk's Enhanced Journal | monks-enhanced-journal | 未安装 | 未启用 | 未启用 |
| Monk's Hotbar Expansion | monks-hotbar-expansion | 未安装 | 未安装 | 未启用 |
| Monk's Little Details | monks-little-details | 启用 | 未启用 | 启用 |
| Monk's Scene Navigation | monks-scene-navigation | 启用 | 未启用 | 启用 |
| Monk's TokenBar | monks-tokenbar | 启用 | 未启用 | 启用 |
| Monk's Wall Enhancement | monks-wall-enhancement | 启用 | 未启用 | 启用 |
| Baileywiki Mass Edit | multi-token-edit | 未安装 | 未启用 | 未启用 |
| Multilevel Tokens, by Beneos | multilevel-tokens | 未安装 | 未启用 | 未启用 |
| Multiple Document Selection | multiple-document-selection | 启用 | 未启用 | 启用 |
| Notebook | notebook | 未安装 | 未安装 | 未启用 |
| Open Session Deck / 开放式跑团副屏 | open-session-deck | 启用 | 未启用 | 启用 |
| Pings | pings | 未安装 | 未安装 | 未启用 |
| Plutonium CN | plutonium-cn | 未安装 | 未启用 | 启用 |
| Polyglot | polyglot | 未安装 | 未启用 | 未启用 |
| Portal | portal-lib | 启用 | 未启用 | 启用 |
| Progress/Countdown Tracker | progress-countdown-tracker | 未安装 | 未安装 | 未启用 |
| PSFX - Peri's Sound Effects | psfx | 启用 | 未启用 | 启用 |
| Quick Insert - Search Widget | quick-insert | 启用 | 未启用 | 启用 |
| QuickScale | quickscale | 启用 | 未启用 | 启用 |
| Racooze's Free Battlemaps | racoozes-free-battlemaps | 未安装 | 未安装 | 未启用 |
| 回收站 | recycle-bin | 未安装 | 未启用 | 未启用 |
| sample | sample | 未安装 | 仅磁盘，无管理器条目 | 管理器无条目 |
| Grid Scaler | scaleGrid | 未安装 | 未启用 | 未启用 |
| Library: Scene Packer | scene-packer | 未安装 | 未启用 | 未启用 |
| Sequencer | sequencer | 启用 | 未启用 | 启用 |
| Settings Extender | settings-extender | 未安装 | 未安装 | 未启用 |
| Shards and Traditions | shards-and-traditions | 启用 | 未安装 | 管理器无条目 |
| Share Media | share-media | 启用 | 未启用 | 启用 |
| Simple Quest | simple-quest | 未安装 | 未启用 | 管理器无条目 |
| Simple Cover 5e | simplecover5e | 启用 | 未启用 | 启用 |
| socketlib | socketlib | 启用 | 启用 | 启用 |
| Swarms | swarm | 未安装 | 未启用 | 未启用 |
| Swipe | swipe-vtt | 未安装 | 未启用 | 未启用 |
| Sync Token Actor | sync-token-actor | 启用 | 未启用 | 启用 |
| Sync Token Names | sync-token-name | 未安装 | 未启用 | 管理器无条目 |
| Tagger | tagger | 未安装 | 未启用 | 未启用 |
| The Great Book of Random Tables | tgbort | 启用 | 未安装 | 管理器无条目 |
| The Great Book of Random Tables: Quests | tgbortq | 启用 | 未安装 | 管理器无条目 |
| The Folk from Harrowthorpe | the-folk-from-harrowthorpe | 启用 | 未安装 | 管理器无条目 |
| The Griffon's Saddlebag, Book One Magic Items and Character Options | the-griffons-saddlebag-book-1-magic-items-and-player-options | 启用 | 未安装 | 管理器无条目 |
| The Griffon's Saddlebag, Pack 2021-11 | the-griffons-saddlebag-pack-2021-11 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2021-12 | the-griffons-saddlebag-pack-2021-12 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-01 | the-griffons-saddlebag-pack-2022-01 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-02 | the-griffons-saddlebag-pack-2022-02 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-03 | the-griffons-saddlebag-pack-2022-03 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-04 | the-griffons-saddlebag-pack-2022-04 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-05 | the-griffons-saddlebag-pack-2022-05 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-06 | the-griffons-saddlebag-pack-2022-06 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-07 | the-griffons-saddlebag-pack-2022-07 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-11 | the-griffons-saddlebag-pack-2022-11 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2022-12 | the-griffons-saddlebag-pack-2022-12 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-01 | the-griffons-saddlebag-pack-2023-01 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-02 | the-griffons-saddlebag-pack-2023-02 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-03 | the-griffons-saddlebag-pack-2023-03 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-04 | the-griffons-saddlebag-pack-2023-04 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-05 | the-griffons-saddlebag-pack-2023-05 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-06 | the-griffons-saddlebag-pack-2023-06 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-07 | the-griffons-saddlebag-pack-2023-07 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-08 | the-griffons-saddlebag-pack-2023-08 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-09 | the-griffons-saddlebag-pack-2023-09 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-10 | the-griffons-saddlebag-pack-2023-10 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-11 | the-griffons-saddlebag-pack-2023-11 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2023-12 | the-griffons-saddlebag-pack-2023-12 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-01 | the-griffons-saddlebag-pack-2024-01 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-02 | the-griffons-saddlebag-pack-2024-02 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-03 | the-griffons-saddlebag-pack-2024-03 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-04 | the-griffons-saddlebag-pack-2024-04 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-05 | the-griffons-saddlebag-pack-2024-05 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-06 | the-griffons-saddlebag-pack-2024-06 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-07 | the-griffons-saddlebag-pack-2024-07 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-08 | the-griffons-saddlebag-pack-2024-08 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-09 | the-griffons-saddlebag-pack-2024-09 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-10 | the-griffons-saddlebag-pack-2024-10 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-11 | the-griffons-saddlebag-pack-2024-11 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2024-12 | the-griffons-saddlebag-pack-2024-12 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-01 | the-griffons-saddlebag-pack-2025-01 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-02 | the-griffons-saddlebag-pack-2025-02 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-03 | the-griffons-saddlebag-pack-2025-03 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-04 | the-griffons-saddlebag-pack-2025-04 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-05 | the-griffons-saddlebag-pack-2025-05 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-06 | the-griffons-saddlebag-pack-2025-06 | 未安装 | 未安装 | 未启用 |
| The Griffon's Saddlebag, Pack 2025-07 | the-griffons-saddlebag-pack-2025-07 | 未安装 | 未安装 | 未启用 |
| The Southern Alliance | the-southern-alliance | 未安装 | 未安装 | 未启用 |
| TheRipper93's Module Hub | theripper-premium-hub | 未安装 | 未安装 | 未启用 |
| Tidy 5e Sheets | tidy5e-sheet | 启用 | 未启用 | 启用 |
| Tile Arsenal | tile-arsenal | 启用 | 未安装 | 管理器无条目 |
| Tile Scroll | tile-scroll | 未安装 | 未启用 | 未启用 |
| Token Action HUD Core | token-action-hud-core | 启用 | 启用 | 启用 |
| Token Action HUD D&D 5e | token-action-hud-dnd5e | 启用 | 启用 | 启用 |
| Token Lean: Peek Around Corners | token-lean | 未安装 | 未安装 | 未启用 |
| Token Magic FX | tokenmagic | 未安装 | 未启用 | 未启用 |
| Translate All | translate-all | 未安装 | 未启用 | 未启用 |
| Vision 5e (ServerNext local 1) | vision-5e | 启用 | 未启用 | 启用 |
| Wall Height | wall-height | 未安装 | 未安装 | 未启用 |
| Weapons of Lore | weapons-of-lore | 启用 | 未安装 | 管理器无条目 |
| Z Scatter | z-scatter | 启用 | 未启用 | 启用 |
| Translation: 中文 [Mod] | zzz_mod_chn | 启用 | 未启用 | 启用 |

### 墙线候选的最终状态与支持边界

| 模块 | Next | Mirror当前 | 线上 | V14口径 |
|---|---|---|---|---|
| Monk's Wall Enhancement | 启用 | 未启用 | 启用 | 14.01官方minimum／verified14；墙线功能未实机测试 |
| Advanced Drawing Tools | 未安装 | 未启用 | 未启用 | 14.0.0发布manifest支持14；Drawing编辑，非主要画墙功能 |
| DF Curvy Walls | 未安装 | 未安装 | 未启用 | 13.0.0官方verified13.351；无V14声明，不据此断言不能运行 |
| Wall Height | 未安装 | 未安装 | 未启用 | 线上7.0.8 UI显示verified13风险；不是自由画墙候选 |

DF Curvy Walls是曲线／椭圆／矩形墙及形状拟合：[官方功能](https://github.com/flamewave000/dragonflagon-fvtt/blob/master/df-curvy-walls/README.md)、[当前manifest](https://dragonflagon.cafe/mods/man/df-curvy-walls)、[13.0.0变更记录](https://github.com/flamewave000/dragonflagon-fvtt/blob/master/df-curvy-walls/CHANGELOG.md#release-1300-2026-03-23)。未声明游戏系统限制，依赖lib-wrapper和lib-df-buttons；当前版未有V14验证声明，dnd5e6.x／V14操作仍Untested。若用户记得沿洞窟边缘自由画墙，Monk更吻合；若记得弧形／圆形墙，可能是DF Curvy Walls。

待判断本地化／迁入：线上8个Next缺包按当前来源／原暂停或排除决定登记，未授权迁入；特别3个Mirror也未装的包需精确发行来源、许可与包身份复查。墙线模块Monk已在Next运行，无新安装／启用任务；DF Curvy Walls当前未启用且V14门未验，不自动纳入。

### 证据与清理

两个本地与线上认证后的完整current-modules原件均父核，所有计数与ID集合一致，三个出生审计页已关闭，另一任务Mirror页651338418保持。无checkbox变更、Save、Macro创建、包内容／功能测试、世界切换、服务启停、LevelDB写入、备份或发布。生产认证页651338453正常登录由用户完成；历史阻塞与新成功收据分别保存。全程正式Chrome，Computer Use0。

完整机器对账与父接受原件在F盘同证据根final-comparison.json／parent-final-acceptance.json；文档仅含环境别名和公共模块名称，真实生产目标／凭据未进入报告。
