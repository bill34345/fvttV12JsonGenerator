# ServerNext 怪物法术匹配器：撤销失败与本地修复候选（2026-09-25）

## 来源与当前结论

唯一目标是 `server-next` 的 Foundry `14.368` / dnd5e `6.0.2`，模块源码 owner 为本工作区 `foundry-modules/monster-spell-resolver`。9 月 25 日实时查看[项目公开 GitHub 发行页](https://github.com/bill34345/fvttV12JsonGenerator/releases)，没有匹配器独立正式发行；本地 `src/module.json` 和 `package.json` 是这次自制模块的版本、兼容及 dnd5e 依赖来源。0.1.5 只提供诊断，0.1.6 的目标世界水合与指定原生施法已通过，但 Undo 真实失败。不得把模块清单的 Foundry 最大版本、测试通过或 0.1.5 的诊断作用写成完整修复。

[0.1.6 一次 Undo 真实失败](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver016-20260925/undo-failure-20260925.json>)后，任务怪物从 10 个法术变成 20 个不同 ID，每个名字重复；[只读残余摘要](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver016-20260925/undo-residual-readback-20260925.json>)显示状态 `failed-recovery-required`，10 个仍归匹配器所有，10 个是无归属的 dnd5e 原生缓存。52 处差异均在法术快照，主要是重建时间戳；[四处效果来源精确对照](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver016-20260925/origin-pairs-20260925.json>)由 PHB 资料包法术 UUID 被重写为同一角色内嵌法术 UUID。失败任务场景、两名角色、三份宏和十条聊天消息随后[按精确 ID 经正常界面清理](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver016-20260925/failed-task-cleanup-20260925.json>)。

源码 `hooks.ts::restoreSnapshot()` 当时把旧 `flags.fvtt-json-generator-spell-resolver` 作为普通对象更新。Foundry 14 的[官方文档更新说明](https://foundryvtt.com/api/modules/foundry.documents.html)明确普通文档更新会递归合并；`_replace(data)`／[ForcedReplacement](https://foundryvtt.com/api/v14/classes/foundry.data.operators.ForcedReplacement.html)用于整字段替换。这支持将撤销时恢复模块 flags 改为 `ForcedReplacement.create(...)`，并在任何世界写入前确认 API 存在。根因判断仍属**从源码与残余的推断**；必须以修复后真实 Undo 证明。不能直接改运行中的 LevelDB 或用删除无归属缓存掩盖错误。

## 待验证的本地化变更

候选代码只在匹配器的 Undo 路径工作：使用 Foundry 的整字段替换；通过 Actor/Item 的公开 API 恢复先前效果来源，再比较除系统重建时间戳以外的完整快照；对本次事务新出现的无归属缓存，必须验证所属 Actor、活动、目标资料包 UUID 和公开 getter 全量投影后才能清理。新增测试模拟 Foundry 递归合并、效果来源重写、时间戳变化和新原生缓存，仍拒绝真实内容差异。它不能因为单测通过便列为交付。

独立只读复核又发现一个补偿边界：失败的目标快照可能已生成其所选来源的原生缓存，而原状态的同一活动选择了另一个来源。补偿前现在先在目标活动仍可读时，按本次新增 ID、所属 Actor、严格活动所有权、资料包 UUID，以及可用的公开 getter 投影核对并清理目标缓存；任何无法证明的缓存均保留并报告恢复失败。测试将残留缓存改成目标快照的来源后通过。代码阶段 `hooks.test.ts` 75 项、模块测试 223 项、根安全入口连同法术清单契约 335 项、TypeScript 检查及构建均通过；真实世界 Undo 结果见下节。

下一步仅在正常关闭 `cor-cotn`、23 个锁释放、精确进程及端口停止后，把构建出的候选差异文件更新到 ServerNext。随后用新的、带来源哈希的任务怪物做正式水合、正常 Undo、整页重载读回；若 Undo 再失败，停止该 Actor 上的操作，保留安全诊断，修复后另建任务 Actor 复测。最终清理所有自有对象。原生攻击、豁免、目标、消耗等在 0.1.6 已有[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)，若相关实现未变，不重复玩法测试。

## 0.1.7 目标世界结果

上述正常关世界、锁释放、精确旧进程停止、八文件比对与两文件替换已经完成；新 PID70308 只在 `127.0.0.1:30002` 监听，`/api/status` 读回原 `cor-cotn`、Foundry14.368、dnd5e6.0.2。构建 ZIP SHA-256 为 `225FE6A5E339D12513896B8E320664DA65D7D149BDB7FF66195DFF28442758A5`，已装八文件均匹配构建；改动只涉及 `module.json` 和 `scripts/index.js`。

正常 GM 界面创建新任务怪物并导入同一正式 Rat Warlock JSON 后，报告显示 `hydrated` 和 10 条已提交选择。点击一次 Undo 后出现完成通知，公开宏读回 `pending`、0 个受管法术、0 个无归属原生缓存、0 个法术项、0 个受管施法活动、没有撤销快照；整页重载后读回相同。精确 Actor 和宏通过 Foundry 公开 API 删除，读回二者均不存在。[不含付费正文的验收记录](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver017-20260925/first-hydration-undo-reload-cleanup.json>)。此结果使 **首次水合 → 撤销 → 持久化** 的指定关键行为 `PASS`，0.1.6 的失败仍保留为历史缺陷。运行时故意注入失败的补偿路径没有执行；离线测试覆盖相应边界，不把它写成真实世界通过。
