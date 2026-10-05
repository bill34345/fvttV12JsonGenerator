# ServerNext：Ravenloft-babele 本地译包检查（2026-09-24）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

结论：`HOLD_LOCAL_TRANSLATION_SOURCE`。这不是可从公开发行版直接更新的模块；Mirror 的本地 `Ravenloft-babele` 1.0.0 manifest 没有 `url`、`manifest` 或 `download`，README 仍是模板说明。2026-09-24 用模块 ID 与标题搜索 GitHub/Gitee 公开入口，未找到可确认属于此包的发行仓库；这表示**未确认上游**，不证明绝对不存在。不能为它填写臆测的“官方最新版”。

只读检查目标与来源：

| 对象 | 结果 |
|---|---|
| Mirror 本地 manifest | `F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules\Ravenloft-babele\module.json`，SHA-256 `D5600F13FC6ECB7760B41F1FD71D83427C6713EA3B82133B267F4B14565750FB`；Foundry verified 14.364，仅要求 `babele`，不声明 dnd5e 6。 |
| 翻译内容 | 顶层 9 个 JSON 均能解析；Actor 69、Adventure 17、Bastion 8、Book 41、Fallback Actor 54、Item 62、Option 91、Scene 61、Table 56 个按名称索引的译文条目。另有 `compendium/cn/新建文件夹/` 下 Actors、Fallback Actors 两份同名但**字节不同**的 JSON（也可解析），归属/扫描效果未核；不能把它们默认为可忽略的正式内容。 |
| 目标付费包 | ServerNext 已装 `dnd-ravenloft-horrors-within` 1.0.1，manifest SHA-256 `92622AA3B798BDE23F57E70FDB36D6E2F064E6692092491370ECA11AEB38320D`，其 9 个 pack 名与译文 JSON 文件名一一对应；这只证明 pack 名存在，不证明每个条目及字段适配。 |
| 关键结构错误 | `options.json` SHA-256 `5F533C3A929A34123C75BE719CE7EBAEDCA60FFB2B164E24F7ECA5E2C17B5CE9` 的 `mapping.path` 含 `系统活动`、`系统推进`、`系统.运动` 等机器翻译字符串；`mapping.converter` 也有 `活动`、`进步` 等翻译名。Bastions 3 项、Items 4 项、Options 7 项 mapping 共 14 项存在这类值。对照同一 Mirror 已装 dnd5e Babele mapping 的 `system.activities`、`system.advancement`、`effects` 等字段，Babele `script/mapping/mapping-block.js` 的路径读取逻辑，以及中文补丁 `scripts/registerAddons.js` 实际注册的英文 `activities`、`effects`、`advancement` converter，这些中文值不能当作目标文档路径或已注册转换器。 |

未复制、修补或安装此模块到 ServerNext；未读取或修改付费包世界数据。尤其不能因为九个 pack 名相同，就把机器翻译映射与描述视作 dnd5e 6 兼容。用户要求付费包版本和安装只记录，目标 Ravenloft 内容包保持现状。

若今后明确处理该**本地译包**，先确认来源归属与可修改权，再在隔离候选中修复所有 mapping 的路径与 converter，按目标 1.0.1 的 pack 条目 ID/名称和 dnd5e 6 结构逐项对照，最后单独验证 Babele 在 ServerNext 的真实显示；不得直接把 Mirror 目录迁入目标。下次复查公开入口时，用精确模块 ID/manifest 元数据查询 GitHub/Gitee/Foundry，并记录检索日期及可验证 URL。
