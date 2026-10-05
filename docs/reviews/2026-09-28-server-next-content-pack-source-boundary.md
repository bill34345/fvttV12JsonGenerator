# 两个旧内容包的 ServerNext 来源边界（2026-09-28）

> **9/29范围澄清：**未找到公开发行URL或再分发许可，不应被当作无法评估用户已持有内容自用迁移的技术阻塞。5e DLC已有系统正常迁移路线，Dungeon Strugglers按用户新指示暂停；见[来源与可行性复查](2026-09-29-server-next-external-modules-upstream.md)。本页保留当时调查证据，不再作为当前执行决定。
## 结论

旧 Mirror 的 `5e-dlc-monster` 与 `dungeon-strugglers-collection` 都没有进入 Next；保持 `HOLD_SOURCE_LICENSE`。它们是 dnd5e 内容合集，不能因缺脚本或本机已有旧文件就当作通用工具复制。当前证据不足以确认可使用的正式目标包、D&D 6适配和内容取得权限，本轮未下载、复制、安装、启用或打开合集内容。

## 本机只读来源与公开入口

| 旧包 | Mirror 本机 `module.json` 只读事实 | 当前可核的正式入口及限制 |
|---|---|---|
| `5e-dlc-monster` 1.2.0 | 标题“5e扩展书怪物”，作者字段仅“寄”；无 `url`、`manifest`、`download`；Foundry 最低12、验证14，没有 dnd5e 6版本声明。声明两个 dnd5e Actor 合集：“官方扩展书怪物合集”与“魔邓肯巨献:多元宇宙的怪物”。无运行脚本。 | 9/28按精确 ID 与标题公开查找，未找到可核的作者发行/许可入口。Foundry14验证字段不证明内容可迁、D&D6可用或版权/取得授权。 |
| `dungeon-strugglers-collection` 1.1.1 | 旧清单的作者/主页指向 Dungeon Strugglers 的 Patreon；manifest 和 download 指向 Google Drive；Foundry 最低10、验证12，dnd5e 最低2.1.5，没有 D&D6上限/验证。声明两个 Item 合集与一个 Actor 合集。 | [发行方 Patreon 介绍](https://www.patreon.com/dungeonstrugglers/about)介绍 Foundry VTT Item Packs 和会员内容，但未在本次可核公开页面给出当前精确模块版本、D&D6适配及这份旧合集的免费/付费取得条件。不得把旧 Drive URL 当成现行正式包，也不能因为未在先前37项付费表里就默认免费。 |

这两项的磁盘缺口计数不变。Mirror 只用于本次 manifest 只读对照；没有读取、迁移或编辑其合集数据库。未知公开来源不是“官方已宣布不支持”，也不是授权代理从私人下载位置补包。

## 新候选复查步骤

1. `5e-dlc-monster`：取得可核的作者/发行方仓库、版权/分发说明及与本机 ID 一致的固定发行包；再查精确 dnd5e6适配。缺任一关键来源时继续暂缓。
2. `dungeon-strugglers-collection`：只从发行方公开可核的正式页面判定当前模块ID、版本、许可/取得方式和目标支持；若属于付费包，按本次付费只记录范围，不下载或更新。
3. 有正式免费且目标适配的包后，才按[来源与安装规则](../runbooks/server-next-module-upstream-and-package-source.md)核包路径、manifest、SHA-256、依赖及短时客户端读回；不得复制 Mirror 旧合集或自行改其世界数据库。
