# Forge Actor 的 D&D 2024 资料块呈现依据（历史归档）

- 日期：2026-09-24。
- 原研究范围：Forge 生物蓝图的可读预览 UI；当时生成目标为 Foundry 14.364 / dnd5e 5.3.3 / core。归档不改变现行支持目标，具体版本按[支持矩阵](../acceptance/current-support-matrix.md)与源码版本门核对；资料块样式不证明完整 2024 规则自动化或 dnd5e 6.x 兼容。

## 2026-10-08 归档状态

可读资料块已进入主线的 [actorStatblock.ts](../../foundry-modules/fvtt-json-forge/src/actorStatblock.ts)，由 [application.ts](../../foundry-modules/fvtt-json-forge/src/application.ts) 的实际结果渲染链调用。草稿呈现当前创作输入，正式呈现读取 accepted artifact；[生物创作研究](2026-09-22-creature-item-authoring-opportunities.md)中的蓝图/预览提案已由后继完成。

本文件保留官方出处、字段层级与不猜填数据的设计依据。2026-10-07 独立审查复核了固定 SRD 5.2.1 与转换指南的相关文本；本次归档未新增规则、生成器、运行时或视觉接受。

## 分层结论

1. **官方规则/呈现来源。** D&D Beyond 的 [SRD 5.2.1 下载页](https://www.dndbeyond.com/srd)把英文版标为 2025-05-01 发布。其 [PDF 印刷第 254–258 页](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf#page=254)和[怪物资料块说明](https://www.dndbeyond.com/sources/dnd/br-2024/how-to-use-a-monster)给出了 2024 怪物资料块结构。
2. **结构特征。** 名称下是体型/生物类型/阵营；AC 与 Initiative 的修正值及固定分数同行；其后为 HP（生命骰）、Speed；六属性为三列两行，每项包含分数、MOD、SAVE。可用时再列技能、抗性/弱点/免疫、装备、感官、语言；CR 后括注 XP 与 PB。正文按 Traits、Actions、Bonus Actions、Reactions、Legendary Actions 等实际存在的栏目组织。官方[从旧 SRD 转换说明](https://media.dndbeyond.com/compendium-images/srd/guide/converting-to-srd-5.2.1.pdf#page=13)明确把先攻展示、全六项豁免展示和动作说明列为变化。
3. **本项目数据边界。** 草稿只证明作者当前输入了什么；正式候选才来自现有 workflow/artifact。没有可靠数据来源的 Initiative 总值、SAVE 总值、XP、PB、Skills、Senses、Languages、Gear 不猜填。资料块采用 2024 信息层级，但不照搬官方书籍的具体视觉装帧或已发表怪物正文。

## 后续新增范围的判断与复查

- [ ] 确认中文标签在 Forge 中与现有 dnd5e 中文用词一致；未有锁定译名时保留英文缩写 AC、HP、CR、PB 与必要的术语提示，不声称官方中文版逐字对照。
- [ ] 如以后加入 2024 特有的完整机制或迁移 dnd5e 6.x，分别核对目标版本的原生 Actor/Activity 数据、准确规则来源和真实 Foundry 运行；不能沿用本次纯呈现验收。
- [ ] 新增外部资料块参考时，优先取官方 SRD/Basic Rules 或作者公开源码/截图，记录精确版本与发布日期；与本文件及生成 artifact 字段逐项对照，再判断是否适用于 Forge。

## 来源与证据范围

资料块结构来源记录于上列 Wizards of the Coast / D&D Beyond 官方公开材料；中文标签采用项目用词，不宣称与官方中文版逐字一致。原记录中的“待改实现”已由主线 renderer 和统一工作台替代。既有接受按其具体版本和产物保留，后续行为变化再补相应检查；本文件仅是来源与设计依据，不单独构成运行时通过证据。
