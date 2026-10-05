# Item Piles 与 D&D 5e 配套包的 ServerNext 来源边界（2026-09-28）

## 结论

`item-piles` 与 `itempilesdnd5e` 均保持 `HOLD_SUPPORT`，本轮没有下载、安装、启用或运行测试。作者的[系统独立化说明](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/issues/731)明确指出：基础包保留已有物品堆，但依赖系统数据的功能需要相应配置，D&D 5e 应配套专用模块。因此只装基础包不能作为旧世界 D&D 物品堆功能已迁好的依据。

## 2026-09-28 的正式来源复核

| 项目 | 官方当前信息 | 对固定目标 14.368 / dnd5e 6.0.2 的含义 |
|---|---|---|
| 基础包 `item-piles` | [Foundry包页](https://foundryvtt.com/packages/item-piles)当前列 3.3.4、Foundry13—14且验证14；[发行标签](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/releases/tag/3.3.4)存在。现有资料表明它现在是系统独立基础层，依赖 `socketlib`、`lib-wrapper`。 | Foundry14范围满足，但不替代 D&D 系统配置；单独启用无法交付原有 D&D 相关功能。 |
| 配套包 `itempilesdnd5e` | [Foundry包页](https://foundryvtt.com/packages/itempilesdnd5e)和[作者1.1.0发行说明](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/releases/tag/1.1.0)只明确 Foundry14；发行说明没有写 dnd5e6.x。前版[1.0.8发行记录](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/releases)明确修过 dnd5e5.x 的数据结构。 | 包页显示支持 `dnd5e` 这个系统 ID，旁边展示系统的当前最新版，但这不是作者对目标6.0.2的精确验证承诺。不能据此标记 `UPSTREAM_SUPPORTED_DND6`。 |
| 标签源码 | [1.1.0标签下的 `module.json`](https://raw.githubusercontent.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/1.1.0/module.json)仍写 `version: 1.0.0`，只列 Foundry 范围及基础包依赖。 | 标签源码不能直接当作1.1.0发行安装清单。未来取得正式固定包时须单独核其发行资产、内部manifest与哈希。此处不推断发行ZIP自身错误。 |

官方页面与仓库在本轮查询中没有给出配套包明确适配 dnd5e 6.0.2 的发布依据；未找到声明不等于实测不兼容。按本项目现行的[来源与安装规则](../runbooks/server-next-module-upstream-and-package-source.md)，D&D专用包声明不清时暂缓，两包作为一个功能链记录。基础包与配套包的磁盘缺口各占原26项中的一项，当前计数不变。

## 新候选复查步骤

1. 下一次准备安装前，重新查作者固定发行标签、发行说明、问题/PR与 Foundry 包页，寻找配套包对 dnd5e6.x 的明确支持或正式修复。
2. 有目标依据后，核固定发行资产的 SHA-256、ZIP内部 `module.json` ID/版本、依赖和路径安全；分别记录基础包与配套包，不把源码标签中的旧版本字段冒充发行资产结论。
3. 仅在满足当前来源门禁时再核 Next 的 PID/端口/锁、短时安装、正常客户端实际开启与重新登录错误。必要时对迁移受影响的 D&D 专有物品堆行为作代表性验收；已有 Mirror 设置只读对照，不复制旧包。
