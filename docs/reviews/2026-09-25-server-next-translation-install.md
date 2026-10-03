# ServerNext 中文包与 JB2A 按新授权安装（2026-09-25）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

**后续实际读回：**下文“Ravenloft译文样本未执行”是9月25日安装时的历史状态。9月26日首次抽样英文FAIL；经Babele正常界面刷新原有译表后，两件物品中文名显示并在整页重载后保持，详情见[9月26日复查](./2026-09-26-ravenloft-babele-refresh.md)。其余条目没有因此判为全面中文通过。

## 本次权限与结论层级

用户今晚明确要求把所有中文翻译包装入 ServerNext 并实际验证，且把本机已有的 JB2A Patreon 动画包启用验证。此新授权覆盖此前对这些**指定包**的“只记录/暂缓”处置；不扩大到其余付费内容、Server Mirror 或生产。安装目标仍是唯一 `F:\FoundryLab\foundry-v14\data\server-next`／`cor-cotn`／Foundry14.368／dnd5e6.0.2。项目唯一可写代码工作区未变。

四个中文包的文件已装入并通过正常游戏界面启用；重载后四个开关都仍开启，世界启用模块由66增至70。角色卡出现中文名称、特性和动作，但多个标题仍显示英文，因此**中文只部分覆盖**。JB2A Patreon0.8.7原本已在磁盘且已启用，本轮没有下载或更新；火球动画预览实际显示约5秒紫色火球。Ravenloft本地译包的开关已读回，但未打开付费冒险条目，译文样本未执行。

## 作者正式来源与实际包

| 包 | 作者正式来源、今天版本与声明 | 本次实际包身份 |
|---|---|---|
| Foundry 核心中文包 | [作者正式发布14.365](https://github.com/fvtt-cn/foundry_chn/releases/tag/14.365)，F14 verified | ServerNext已装14.365，保持原文件；此前已读世界启用，仍待本轮组合重载读回 |
| Babele | [正式2.9.1](https://gitlab.com/riccisi/foundryvtt-babele/-/releases/2.9.1)，F14 verified，需 lib-wrapper | ServerNext已装2.9.1及lib-wrapper，不重复下载 |
| 5e_chn | [作者正式5.3.0](https://github.com/fvtt-cn/5e_chn/releases/tag/5.3.0)，面向dnd5e5.3.x、当前dnd5e6未验证 | [正式ZIP](https://github.com/fvtt-cn/5e_chn/releases/download/5.3.0/5e_chn.zip) SHA-256 `B2BA690E20A0FB22B5A5EBE2451E69F2E3839EF36EBACEA61D4FD16858128694`，内2文件；ZIP内清单ID/版本是5e_chn/5.3.0，F min/verified13、D min5.3.0/verified5.3.9。注意作者的 latest 单独清单与同一正式ZIP内清单范围不同，以实际安装的ZIP内清单和明确发布说明如实记录，不推断D6兼容。 |
| D&D 简体中文 Babele 补丁 | [作者正式清单1.0.164](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/download/latest/module.json)，F min12/verified13、无maximum，需Babele；D6未明确验证 | [正式ZIP](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/download/latest/dnd-simplified-chinese-babele-patch.zip) SHA-256 `523D019AC175AF0843C2378308E5C53D75BF131CB715A5E786ACC36EBBD62A01`，内599文件，ZIP内ID/版本相同 |
| zzz_mod_chn | [作者正式13.99](https://github.com/Memorize-Remix/fvtt_mod_chn/releases/tag/13.99)，F min/verified13、无maximum；作者说这是V13最后版，当前F14未验证 | [正式ZIP](https://github.com/Memorize-Remix/fvtt_mod_chn/releases/download/13.99/mod_chn.zip) SHA-256 `8E8F85BEF42FEB055A5EB5713AC9F9371650BF2971A495A23D1EDBC1331F98FD`，内3文件，ZIP内ID/版本相同；作者要求别与Foundry VTT Mega同用，目标未发现Mega目录 |
| Ravenloft 本地中文包 | 没有可确认的公开正式仓库；用户本机原包 `H:\Download\Ravenloft-babele.rar` SHA-256 `5C4880888DDD3F56FAC63765542E47C33C9B1D39BF7048C7C3D147C536D26BC2` | 原RAR内14文件、9个直属译文JSON及两份额外子目录JSON；原manifest是1.0.0/F verified13.344，依赖Babele。原三份直属译文JSON的14处 `mapping.path/converter` 被误译成中文，依据正式Babele补丁当前英文路径/名称定点修正，译文条目内容保持同一JSON值；本地候选标 `1.0.1-local.1`，不冒充作者正式发布。 |
| JB2A Patreon | 本机付费0.8.7清单F min10/verified13、无maximum；[作者公开更新记录](https://jules-bens-aa.github.io/jb2a-wiki/patchnotes/)到0.9.3，不能证明本机付费0.8.7目标可用 | 原本就在ServerNext磁盘；本轮不下载、不替换付费文件，只按用户新授权启用并做实际动画预览。作者[排障说明](https://jules-bens-aa.github.io/jb2a-wiki/troubleshooting/jb2a/)要求避免免费/付费两包同时用；目标仅有付费包。 |

三个官方ZIP的路径已逐项检查，无绝对路径、上层逃逸或额外 `module.json`。Ravenloft原RAR亦只含命名目录下的14文件，原包未修改。候选四目录在离线目标中均原本不存在；正常GM Return to Setup后 `/api/status active=false`、原PID70308仍独占本机30002，23个世界锁均可独占打开，才停止精确进程；只新建四个模块目录，逐文件与候选哈希匹配，随后以同一 app/data/world 参数启动PID40612。原世界重新active，四个新包及原JB2A的 `module.json` HTTP 均为200。[仅文件及服务层证据](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/translation-install-20260925/install-files-only.json>)。

Ravenloft本地包的机械修订只针对 `mapping` 的七种键，共14处，采用同次安装的作者D&D Babele补丁 `mapping.json` 中的英文路径与转换器名称；每份译文的 `entries`、`folders` 等非 `mapping` JSON 值在修订前后保持相同：

| 键 | 修订后的路径／转换器 |
|---|---|
| range | `system.range`／`range` |
| rangeActivities | `system.activities`／`rangeActivities` |
| activities | `system.activities`／`activities` |
| effects | `effects`／`effects` |
| advancement | `system.advancement`／`advancement` |
| movement | `system.attributes.movement`／`movement` |
| senses | `system.attributes.senses`／`senses` |

## 待判断本地化与后续复查

- 此次是用户要求对旧中文包进行受控试装；作者未明确支持D6/F14的包不因“安装成功”就被写成全面翻译正常。实际GM的简体中文偏好已选中，`zzz_mod_chn` 的中文欢迎提示出现；人物卡可见“技艺受训”“短棒”等中文，也仍见 SPEED/SENSES/LANGUAGES/HABITAT/GEAR/TREASURE 英文标题。四个新开关重载后仍为on，其余模块开关未改。没有逐条核2024玩家手册和Babele全部译文；Ravenloft付费冒险条目为避免自动弹窗未打开，译文样本记为未执行。后续只对实际发现的遗漏做定点修订，不直接编辑运行中数据库。
- JB2A本机0.8.7原已开启；Sequencer Database 中 `jb2a/fireball` 的播放预览显示为视频、时长5042毫秒，实际看到紫色火球。这证明该段动画可播，不能据此推断全部付费动画可用，也不能把免费版V14声明套到旧付费版。
- 新候选复查仍按作者正式发布页、下载包内清单、依赖和目标世界实际读回顺序；Ravenloft本地候选保留原RAR来源哈希与14处机械修订记录，不能宣称机器译文质量已人工校对。
