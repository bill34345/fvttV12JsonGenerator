# ServerNext 迁移提速复核（2026-09-25）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

## 范围和结论

目标仍是已有的独立 `server-next`：Foundry 14.368、dnd5e 6.0.2、`cor-cotn`。本次复核研究迁移做法，不重新迁世界，不操作 Server Mirror 或生产。Foundry 官方推荐用独立安装和独立 User Data 测试新版本，升级前核对系统与模块兼容；本项目已完成这项隔离工作，应沿用目标环境，把剩余时间用在真实未关闭的门禁上。[Foundry V14 稳定版说明](https://foundryvtt.com/releases/14.359)、[多实例安装](https://foundryvtt.com/article/installation/)。官方的备份建议不改变本项目已明确的“不创建备份”边界。

这五天慢的直接原因见[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)：逐包先查上游、付费只记录、明确兼容者不重复玩法测试的规则定得较晚；Midi 两次浏览器轮次停在错误页面或错误夹具，没有执行目标的手动伤害动作；药水与怪物法术匹配则在真实操作中失败。后两项不能靠更新版本或扩大通过计数消除。初查时为`35 已处置 / 37 付费只记录 / 9 暂缓 / 4 自制未解决`；定点修复与实测后为`38 / 37 / 9 / 1`。这始终是 85 项**处置分类**，并非玩法通过率。

## 官方资料对今天操作的约束

| 来源事实 | 本地决策 |
|---|---|
| Foundry `compatibility.minimum/maximum` 是 Core 硬边界，`verified` 是 Core 指导信息。[包兼容说明](https://foundryvtt.com/article/package-management/) | 只凭“Foundry 14”不宣称支持 dnd5e 6；涉及系统的模块另查作者正式系统版本声明、发行说明和依赖。 |
| 安装的包需要在世界内启用，缺依赖可能阻止启用。[模块管理](https://foundryvtt.com/article/modules/)、[模块清单](https://foundryvtt.com/article/module-development/) | 免费包符合目标声明时只核对官方发布版、已装版和世界开关，不重复玩法测试；更新后读回安装及启用结果。 |
| dnd5e 6.0.0 引入 Active Effect 和聊天卡相关变化；6.0.2 是其后续补丁。[6.0.0 发布说明](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.0)、[6.0.2 发布说明](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.2/) | 自制模块及 Midi 本地补丁仅验收受这些变化影响的关键行为；已有通过的代表场景不重跑。 |

## 执行顺序与交付口径

1. 实时核对目标进程、属主、监听、锁、世界、版本与 `/join`；成功只关闭“服务可进入”一层。
2. 对**每个待处理免费第三方模块**操作前重查 GitHub、Gitee、GitLab 或发行方的最新正式版、Foundry/dnd5e 声明和依赖。明确支持目标才更新、安装并读回；声明不足维持 `HOLD`。37 项付费包只记录公开版和本机版，不下载、不更新、不测试、不重开。
3. 优先关闭 Midi 手动应用伤害、House Rules 药水、Resolver 正式法术匹配、Session Monitor 卡顿标记／导出、客户端中文偏好。一次轮次只设明确的前置检查、目标动作、成功／失败条件和任务对象清理。0.1.5 Resolver 仍只是诊断候选。
4. Forge、Blood Hunter、Homebrew Species 等缺来源或跨工作树条件者列清楚暂缓原因。不能以夹具、静态测试或本地补丁号代替正式交付。四小时会话仍由用户运行。

## 待判断本地化和新候选复查

- 待判断本地化：早间待办是 House Rules 药水与 Resolver 的 D&D 6 行为修复；两项已按真实失败定位、最小修改并完成报告列明的目标行为验收。其余未交付的自定义种族缺正式来源账本；Midi 带类型受伤效果及 Resolver 故意失败补偿的未验层级继续明列，不据此扩展新模块。状态与[模块健康台账](../acceptance/foundry-v14-module-health.md)及[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)分别核对。`Untested` 不算可用。
- 新候选复查：先核实发行方正式版本、manifest、目标 D&D 版本范围和必需依赖，再与已装版及 85 项台账比对；只有缺口确实影响目标使用时才列入迁移。热门模块只作对照，不因热度另开迁移范围。

这些官方资料给出分阶段迁移方法，不能保证药水和法术匹配两个真实故障在今晚固定时刻前修复。能否交付使用，仍由当前服务和关键行为的实际读回决定。

晚间现场结果：药水、Midi 基础手动伤害、怪物法术匹配器的正式水合／代表性原生施法／首次撤销与重载、监测器短时 Mark/实际导出均取得目标世界证据；GM 简体中文偏好在确认后保存并重载。最终服务重新读回原世界 active，详见[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)。自定义种族仍因正式来源账本缺失而未交付；Forge 和 Blood Hunter 按既有来源边界暂缓。用户质疑的 HUD、Babele 与 JB2A 已作[晚间 GitHub 再核](./2026-09-25-hud-babele-jb2a-github-recheck.md)：HUD 的6.x源码已合入但未正式发布；Core支持Foundry14；Babele与本机旧付费JB2A均不得被叫作“明确不支持”。此更新记录方法实行后的结果，不改变下表官方资料在早间查询时的版本口径。

## 9 月 25 日待迁免费包实时复核

以下版本来自当日发行方正式 manifest 或 release，逐包操作前仍应再读对应入口。`F` 是 Foundry Core，`D` 是 dnd5e 系统；没有 `D` 范围即如实保留“未声明”，不推定支持 6.0.2。

| 项目 | 公开正式版与来源 | 作者声明／依赖 | 本次决定 |
|---|---|---|---|
| Token Action HUD D&D5e | [2.1.0正式版](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/latest/download/module.json)；[6.x改动已合入源码](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/pull/169) | 正式包 F verified14.360／D maximum5.99；main源码已改 D maximum6.99；需 HUD Core 2.0.11–2.1.99 | `HOLD_FORMAL_RELEASE`：正式包不能用于当前D6；作者并非没有支持6.x的改动 |
| Token Action HUD Core | [2.1.1](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/latest/download/module.json) | 正式发布明确支持F14，清单verified14.360且无maximum；不限定D版本；需socketlib，color-picker可选 | `HOLD_DEPENDENCY`：Core自身合格，等适配器正式版一起处理 |
| Plutonium CN | [2.15.6](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases/latest/download/module-foundry14.json) | F 14–14.999、verified14.363；D maximum5.3.999；需 lib-wrapper>=1.13.0.0 | `HOLD_UNSUPPORTED` |
| 5e_chn | [5.3.0](https://github.com/fvtt-cn/5e_chn/releases/latest/download/module.json) | F verified12；D verified3.3.0，未声明6 | `HOLD_COMPAT` |
| D&D 简体中文 Babele 补丁 | [1.0.164](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/download/latest/module.json) | F minimum12／verified13，未列maximum；D 未列；需 babele。昨天的1.0.163已过时 | `HOLD_UNVERIFIED_TARGET`：不能断言V14不支持，只是目标组合缺作者明确验证 |
| zzz_mod_chn | [13.99](https://github.com/Memorize-Remix/fvtt_mod_chn/releases/latest/download/module.json) | F minimum/verified13；D 未列 | `HOLD_V13` |
| Midi-QOL | [正式稳定14.0.12](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/releases/permalink/latest)；[dnd6 分支](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/branches/dnd6) | 正式稳定版 D maximum5.3.99；[dnd6 源清单](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/files/module.json/raw?ref=dnd6)虽写D6范围，但作者仍标 WIP，且要求 DAE>=14.6.0 | 不替换本地 local.9，也不把 WIP 称正式修复 |
| DAE | [正式14.0.14](https://gitlab.com/api/v4/projects/tposney%2Fdae/releases/permalink/latest) | F verified14.367；D 未列；需 lib-wrapper、socketlib | 已装版与正式版相同，保留既有状态 |

12:56 北京时间、Midi 真实验收派发前再次直读 GitLab：最新正式发行仍为 v14.0.12，正式 manifest 的 D&D 上限仍是 5.3.99，依赖 socketlib、lib-wrapper、DAE>=14.0.0；DAE 最新正式发行仍为 v14.0.14。目标世界安装的仍是本地 `14.6.0-beta.4338eeab.local.9`，此次上游复核不触发替换。

Ravenloft-babele 没有可核实的公开发行入口，仍按[本地翻译来源审计](./2026-09-24-server-next-ravenloft-babele-local-source.md)暂缓。Forge 0.4 和 Blood Hunter 的跨工作树／正式原始来源门禁没有因公开同名搜索而解除。

## 37 项付费包公开版复核（10:40 北京时间）

本机 37 份 `module.json` 已在 ServerNext 磁盘只读重读，并保存 ID、版本和清单哈希到[现场清单](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resume-20260925/paid-installed-manifests.json>)。公开版由 Foundry 官方包页及对应公开 manifest／发行方商品页当日核对；详细 Core/D&D 声明仍见[原逐包审计](./2026-09-23-server-next-paid-module-record-only.md)。其中 **32 项公开版与本机版一致，3 项有新版，2 项公开精确版不可核**。全部保持 `PAID_RECORD_ONLY`，不下载、不更新、不测试、不改变世界开关。

| 模块 ID（公开入口） | 本机 → 今日公开版 |
|---|---|
| [allies-and-antagonists](https://foundryvtt.com/packages/allies-and-antagonists) | 13.0.1 → 13.0.1 |
| [atheron](https://r2.foundryvtt.com/packages-public/atheron/module.json) | 1.0.2 → 1.0.2 |
| [demon-queen-awakens](https://r2.foundryvtt.com/packages-public/demon-queen-awakens/module.json) | 6.0.0 → 6.0.0 |
| [dnd-adventures-faerun](https://r2.foundryvtt.com/packages-public/dnd-adventures-faerun/module.json) | 1.2.1 → 1.2.1 |
| [dnd-arcana-unleashed](https://r2.foundryvtt.com/packages-public/dnd-arcana-unleashed/module.json) | **1.0.0 → 1.0.1** |
| [dnd-deadfall](https://r2.foundryvtt.com/packages-public/dnd-deadfall/module.json) | **1.0.0 → 1.0.1** |
| [dnd-dungeon-masters-guide](https://r2.foundryvtt.com/packages-public/dnd-dungeon-masters-guide/module.json) | 2.0.0 → 2.0.0 |
| [dnd-forge-artificer](https://r2.foundryvtt.com/packages-public/dnd-forge-artificer/module.json) | 1.1.0 → 1.1.0 |
| [dnd-heroes-borderlands](https://r2.foundryvtt.com/packages-public/dnd-heroes-borderlands/module.json) | 1.1.0 → 1.1.0 |
| [dnd-heroes-faerun](https://r2.foundryvtt.com/packages-public/dnd-heroes-faerun/module.json) | 1.1.0 → 1.1.0 |
| [dnd-monster-manual](https://r2.foundryvtt.com/packages-public/dnd-monster-manual/module.json) | 1.4.0 → 1.4.0 |
| [dnd-phandelver-below](https://r2.foundryvtt.com/packages-public/dnd-phandelver-below/module.json) | 3.1.0 → 3.1.0 |
| [dnd-players-handbook](https://r2.foundryvtt.com/packages-public/dnd-players-handbook/module.json) | 2.2.0 → 2.2.0 |
| [dnd-ravenloft-horrors-within](https://r2.foundryvtt.com/packages-public/dnd-ravenloft-horrors-within/module.json) | 1.0.1 → 1.0.1 |
| [dnd-tashas-cauldron](https://r2.foundryvtt.com/packages-public/dnd-tashas-cauldron/module.json) | 4.0.0 → 4.0.0 |
| [dnd-tomb-annihilation](https://r2.foundryvtt.com/packages-public/dnd-tomb-annihilation/module.json) | 2.0.0 → 2.0.0 |
| [ec-zamanora-botw](https://r2.foundryvtt.com/packages-public/ec-zamanora-botw/module.json) | 1.0.1 → 1.0.1 |
| [ec-zamanora-maf](https://r2.foundryvtt.com/packages-public/ec-zamanora-maf/module.json) | 1.0.1 → 1.0.1 |
| [eoh-festering-city](https://r2.foundryvtt.com/packages-public/eoh-festering-city/module.json) | 2.1.0 → 2.1.0；需 `JB2A_DnD5e` |
| [eoh-setting-throne](https://r2.foundryvtt.com/packages-public/eoh-setting-throne/module.json) | 2.2.0 → 2.2.0；需 `JB2A_DnD5e` |
| [grim-hollow-monster-grimoire](https://r2.foundryvtt.com/packages-public/grim-hollow-monster-grimoire/module.json) | 1.0.0 → 1.0.0；需 `grim-hollow-core` |
| [heliana-core](https://r2.foundryvtt.com/packages-public/heliana-core/module.json) | 2.4.2 → 2.4.2 |
| [hexcrawl-hex-tiles](https://r2.foundryvtt.com/packages-public/hexcrawl-hex-tiles/module.json) | 1.3.1 → 1.3.1 |
| [house-divided](https://r2.foundryvtt.com/packages-public/house-divided/module.json) | 5.0.2 → 5.0.2 |
| [kp-prepared-expanded](https://r2.foundryvtt.com/packages-public/kp-prepared-expanded/module.json) | 13.0.0 → 13.0.0 |
| [librus-nocturnum](https://r2.foundryvtt.com/packages-public/librus-nocturnum/module.json) | 1.0.3 → 1.0.3 |
| [mcdm-class-bundle](https://r2.foundryvtt.com/packages-public/mcdm-class-bundle/module.json) | 3.0.0 → 3.0.0 |
| [mcdm-flee-mortals-where-evil-lives](https://r2.foundryvtt.com/packages-public/mcdm-flee-mortals-where-evil-lives/module.json) | 3.0.0 → 3.0.0 |
| [shards-and-traditions](https://foundryvtt.com/packages/shards-and-traditions) | 1.1.0 → 1.1.0 |
| [tgbort](https://foundryvtt.com/packages/tgbort) | 1.1.0 → 1.1.0 |
| [tgbortq](https://foundryvtt.com/packages/tgbortq) | 1.1.0 → 1.1.0 |
| [the-folk-from-harrowthorpe](https://foundryvtt.com/packages/the-folk-from-harrowthorpe) | 1.1.0 → 1.1.0 |
| [the-griffons-saddlebag-book-1-magic-items-and-player-options](https://www.thegriffonssaddlebag.com/vtt-packs/foundry-year-1-megapack) | 3.0.0 → 公开精确版不可核 |
| [tile-arsenal](https://foundryvtt.com/packages/tile-arsenal) | **1.1.0 → [1.1.1](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/module-1.1.1.json)** |
| [weapons-of-lore](https://r2.foundryvtt.com/packages-public/weapons-of-lore/module.json) | 2.0.1 → 2.0.1 |
| [filepicker-plus](https://r2.foundryvtt.com/packages-public/filepicker-plus/module.json) | 6.0.1 → 6.0.1 |
| [jb2a_patreon](https://www.jb2a.com/) | 0.8.7 → 公开付费包精确版不可核 |

Tile Arsenal 的官方包页今日出现 1.1.1，而旧 manifest 直链及网页缓存仍显示 1.1.0；以当日包页和 [1.1.1 清单](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/module-1.1.1.json)为准。Griffon 9 月 23 日的 3.0.1 和 JB2A 公开补丁说明不能冒充今日可核对的付费 manifest。包的 Foundry verified 或仅列出 `dnd5e` ID 也不能推出明确支持 dnd5e 6.0.2。
