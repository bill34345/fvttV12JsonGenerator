# ServerNext compendium 索引字段冲突（2026-09-24）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

目标仍是 ServerNext Foundry 14.368 / dnd5e 6.0.2。独立 Chrome 在启用 `fvtt-json-generator-spell-resolver` 0.1.1 并重载后看到 `Cannot create property 'rules' on number '1'` 通知；[当前服务 stdout](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/controlled-restart-house-resolver-language-20260924/stdout.log>)在 12:59:20–22 CST 记录 156 条同类异常。服务随后仍保持 PID55224、唯一 loopback30002、原世界 active；不能因此称 compendium 索引可用。

只读对照安装的 Foundry 14.368 `dist/database/backend/server-backend.mjs`：错误发生在 `_getDocuments` 的 index 分支，后端把字段列表逐项写成投影对象，尚未读取 pack 的具体文档。`common/utils/helpers.mjs::setProperty` 对父字段已经为数字 `1` 的对象再写下级 `rules` 时抛出该 TypeError。因此这不是世界 Actor/Item 本体损坏的证据。

已找到一条**静态可触发的具体冲突**：安装的 dnd5e 6.0.2 `dnd5e.mjs` 给 Item 默认 `compendiumIndexFields` 加入 `system.source`；Foundry 客户端 `compendium-collection.mjs` 会把默认字段与调用方的 `getIndex({fields})` 合并；已安装 Resolver 0.1.1 的 `buildSpellSourceIndex` 又请求 `system.source.rules`。合并后同时包含父路径和子路径，足以触发上述错误。日志没有记录请求方或 pack，因此不能断言 156 条全部由 Resolver 发起。静态扫描的 dnd5e 默认字段和已安装模块未发现另一条同样明确的 `.rules` 父子冲突；旧 PID25892 的现存归档日志未保留同错，不能据此证明旧进程没有发生。

处置：Resolver 0.1.1 的文件、登记、启用已有证据，但 hydration 与原生 Cast **未验收且旧索引请求有阻断**。源码 0.1.2 已按精确目标构建候选：`createFoundryAdapter().getItemIndex` 检查运行时 pack 的默认 `indexFields`，已有父路径 `system.source` 时不再请求 `rules/book` 子路径，旧 dnd5e 5.3.3 不含父路径时仍请求子字段；2014/2024 同名法术和来源书籍的索引投影测试保持通过。专项 316/316、类型检查、构建通过，候选 ZIP SHA-256 `7C40191C8AEB3FBA3E9260C151CCDCD2A4834B71E8E2870F0A434F2ECC2E1BC8`；独立只读复审未发现这条修复的代码阻断。世界经正常 UI 停止，父任务确认 `active=false` 与 23 个世界锁释放后停止 PID55224，只离线替换 Resolver 的 `module.json`、`scripts/index.js`；初次重启的 PID64840 曾原世界 active、目标版本0.1.2、8/8文件哈希匹配，却在后续浏览器任务预检前无报错日志地消失，故该轮 UI/水合未执行。主机未重启；[独立进程恢复后的读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/controlled-resolver-012-update-20260924/persistent-verified.json>)确认当前 PID39880、原世界 active、0.1.2安装文件8/8哈希匹配。**0.1.2文件已部署，当前世界实际加载、索引错误消失与 hydration 尚未浏览器验证**；在此之前不归因其它模块、不直接读写运行中世界 LevelDB。

随后[独立 Chrome 当前世界读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver012-runtime-retry-20260924/run-outcome.json>)确认 Resolver 0.1.2 active，世界共74项/66 active/8 inactive，GM正常加入及 Module Management 页面没有再出现 `.rules` 通知；父任务按 PID39880 启动后至该浏览器读回的本机[错误日志窗口](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver012-runtime-retry-20260924/parent-log-review.json>)计数：同类索引错误 **0**，另有已单列的付费包签名错误 2 条。原“进入世界即大量报错”路径有运行证据支持修复；这不能证明所有 pack 查询、Actor hydration 或原生 Cast 均已通过。前一轮的系统文件选择器未弹；后一轮改用**官方CUA文档化的文件选择API**，已[成功导入正式Rat Warlock JSON并打开10条候选Review](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/resolver012-cua-file-import-20260924/run-outcome.json>)，但时限前未Apply，自有Actor已清理，hydration仍未执行。

后续复查新候选时，先重新核对目标实际 dnd5e 版本与默认索引字段；若系统升级导致字段变化，不能沿用本次对 6.0.2 的假设。旧156条异常的具体请求发起者和 pack 未记录，不能逐条归因 Resolver；后续 hydration 应单独验证来源索引和写入结果。
