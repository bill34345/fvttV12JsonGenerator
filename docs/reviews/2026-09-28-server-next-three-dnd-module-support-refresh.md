# 三个 D&D 相关旧包的 ServerNext 支持复查（2026-09-28）

> **9/29纠错：**本文关于DFreds Convenient Effects9.2.7“没有D&D6声明”的判断错误。该版本9/21完整发行说明已明确dnd5e6.0+分级效果适配，原HOLD_SUPPORT撤销。详见[重新核查的原始来源](2026-09-29-server-next-external-modules-upstream.md#4-dfreds-convenient-effects)；当前决定只见[唯一清单](../plan/server-next-migration-handoff-20260927.md)。其余内容为9/28调查快照，不作为派发指令。
## 分层结论

`dfreds-convenient-effects`、`vision-5e`、`itemacro` 本轮仍为 `HOLD_SUPPORT`；没有下载、安装、启用或做玩法测试。公开包页上的 D&D 5e 系统 ID 与“该系统当前最新版”是动态展示，不等于对应模块的发行版本已验证 `dnd5e 6.0.2`。本项目固定运行目标仍是 Foundry 14.368 / dnd5e 6.0.2，不能用较新的 Foundry/dnd5e 版本替代验收目标。

| 模块 | 当天作者/Foundry正式入口 | 尚缺的目标依据 |
|---|---|---|
| `dfreds-convenient-effects` | [Foundry 包页](https://foundryvtt.com/packages/dfreds-convenient-effects)列正式9.2.7、Foundry14验证；说明它提供 D&D5e 和 SW5e 预制效果，且能与 Midi-QOL、DAE 等集成。[9.2.7发行说明](https://github.com/DFreds/dfreds-convenient-effects/releases/tag/v9.2.7)没有给出 D&D6预制效果的明确验证。 | 基础界面与 D&D预制效果不能混为一谈。尚无可核的目标6.0.2预制效果声明；本团已有自动效果链，不以无系统版本上限推断可安全并用。原记录的必需依赖 `socketlib`、`lib-dfreds-ui-extender`、`lib-dfreds-migrations` 另核。 |
| `vision-5e` | [Foundry 包页](https://foundryvtt.com/packages/vision-5e)列正式3.2.2、Foundry14验证，明确会按人物感官、专长和效果自动管理视野。[3.2.2发行说明](https://github.com/dev7355608/vision-5e/releases/tag/v3.2.2)仅指一项修复，没有 D&D6声明。 | 既有正式manifest历史复核仅到 dnd5e5.3.3；视野属系统专有行为。需作者对6.x的正式依据或新发行，不能只凭 Foundry14验收。 |
| `itemacro` | [Foundry 包页](https://foundryvtt.com/packages/itemacro)列正式3.0.1、Foundry最后验证13.344；[3.0.1 changelog](https://github.com/Foundry-Workshop/Item-Macro/blob/v3.0.1/CHANGELOG.md)写 AppV1/AppV2 查找与点击修正，3.0.0是 Foundry13迁移。模块提供物品宏及 D&D专用调用路径。 | 未找到正式 Foundry14验证或 dnd5e6调用路径承诺。不能把包页“可保存和手动运行宏”的一般功能推广成目标系统的角色卡与活动 Hook 可用。 |

以上是“当前正式支持未核实”，并非本轮实测失败。三包仍各占原26项缺文件清单中的一项；Next总数和开关差集不变。旧Mirror只作已有来源记录，不复制旧包。

## 新候选复查步骤

1. 操作当天重新查作者发行说明、固定manifest、相关 issue/PR；寻找 Foundry14.368 与 dnd5e6.0.2 各自明确覆盖的正式依据。
2. 对 D&D预制效果、视野自动同步、物品宏活动 Hook 分别确认实际变化路径与旧世界用途；有正式支持后再核固定包、依赖与目标锁/服务身份。
3. 进入安装门禁后只验作者正式版的版本、文件、开关、重新登录错误；对作者未明确支持或本地补丁才做受迁移影响的关键行为 E2E。没有依据时继续暂缓，不自行给旧包改版本号。
