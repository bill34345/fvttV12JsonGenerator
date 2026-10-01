# DLC 两个合集：来源技能加值修复后续任务

日期：2026-10-01。状态：**已完成，ACCEPTED_SOURCE_SKILL_REPAIR_LIMITED_SCOPE。** 49字段来源／重载、三个代表技能UI与实际API、精确自有资源清理均由父审接受。共用验收工具第一版及其评估已先收尾，本任务独立处理11 Actor／49来源技能加值，不扩大其他迁移。当前记录见[修复验收](../reviews/2026-10-01-dlc-source-skill-repair.md)。

## 已发生的事实

两个声明Actor合集的strict系统迁移此前已经执行：`5e-dlc-monster.monster-heji` 为969 Actor，`5e-dlc-monster.modengken-duoyuanguaiwu` 为278 Actor。全量身份／文本／图片对照及两个样本UI／一次GM重载已有证据；原迁移来源语义曾为FAIL，首包10 Actor／48字段、次包1 Actor／1字段的原技能检查额外加值未保留。此次仅恢复到正确的 `system.skills.<id>.roll.bonus`，没有重跑系统迁移。

现有精确版本dnd5e6.0.2源码显示技能旧 `bonuses.check` 被映射至 `check.roll.bonus`，而技能的RollConfigField使用直接 `roll`。结论、版本映射和限制见[追加实机记录](../reviews/2026-10-01-development-feedback-dlc-runtime.md)。不得把系统调用完成、数量一致或样本页面正常称为整个合集验收通过。

## 接续输入与拟定范围

私有证据根：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\dlc-tool-trial-20261001`。原始source-records、`runtime-strict-migration-6/native-after-evidence.json`、`after-source-comparison.json`、版本映射及 `proposed-source-skill-repair.json` 保留；完整after摘要为 `8b4466925a3433db95287e2648de853174f402f18d0bd0396789332beb4ef1ce`。权威当前状态为 `current-case.json`。完整付费数据及世界内容不进入仓库。

若后续明确执行该修复，先核对现场目标／进程／包锁与精确版本，逐项重新检查拟修清单及实际现值，避免覆盖此后的人工作业。拟定仅恢复11 Actor的49条已证明来源值，走正常Foundry文档API，按包恢复原锁；保存一次操作标记及实际读回，不重跑系统迁移、不改系统源码、不扩大到其他字段／合集／模块。

## 修复后的验收出口

逐项核对49字段的实际原值／新值与来源一致、只有声明字段改变，再验证受影响技能配置／使用结果及一次正常重载后的持久化。若目标版本、来源或现值已变化，重新判断适配，不能直接应用旧清单。

Other AC Bonus的Change Inactive和来源遗留图标缺失仍为不同问题，本拟定修复不包含它们。修完49字段只能接受相应来源字段与受影响行为，不能自动宣布全部1247 Actor玩法或所有效果通过。临时资源另按本次新创建的精确归属清理，旧V1工具证据与原迁移操作不重放。

最初记录只是待办；随后用户对上述限定修复明确回复“可以开始处理”，构成本任务写入与验收授权。新任务候选 `20261001-110849-dlc-skill-repair / 0c72981`，业务run为 `557ddb6e-bc9d-48e6-9b2e-d80245e88ec8`，私有证据根为 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\dlc-skill-repair-20261001-557ddb6e`。新授权、当前状态、共用本地准备收据与每步原生claim分别记录；旧PROPOSED_NOT_EXECUTED清单仍是历史来源，不用改写它冒充当前结果。

共用文件侧复用prepare／ready／execute／collect，初版收据 `92dc2841-0524-445b-80d9-af4355c73e6a` 只接受准备。实机暴露flags基线带点key表示变化后，独立只读诊断与精确Core复现定位，采用字符串snapshot codec，最新11项检查与收据 `97be6053-1837-4d11-946c-1b7abcf3459f` 仍只接受准备；真实写入／重载／技能及清理由另外原件和父审接受。旧失败与初版／修正版检查数量不混合。工具第一版结论继续有效，参见[正式验证结论](../reviews/2026-10-01-development-feedback-v1-verification-status.md)，不重新制造全平台前置条件。
