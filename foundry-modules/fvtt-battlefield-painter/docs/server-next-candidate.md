# ServerNext 6.0.2 历史验收与 6.0.5 兼容候选（0.3.0-alpha.2）

原版本为 Foundry `14.364` / dnd5e `5.3.3`。历史 ServerNext 目标是 `14.368` / `6.0.2`；新候选增加精确配对 `14.368` / `6.0.5`。模块浏览器运行时仅使用 Foundry core API；dnd5e 只用于系统 ID 和版本门禁。2026-09-24 的 Fire 方格定点运行验收仅覆盖历史 `6.0.2`，不外推到 `6.0.5` 或其它模式。

manifest 的最低/最高版本字段无法表达 Foundry 与 dnd5e 的配对关系，因此其 `verified` 保持旧版本，运行时门禁只接受 `14.364/5.3.3`、`14.368/6.0.2` 和 `14.368/6.0.5` 三个精确组合并阻止交叉组合。静态测试、类型检查和构建只证明候选可打包，不等于 `6.0.5` 真实运行兼容已通过。

2026-10-01 添加的 `14.368/6.0.5` 目前只通过固定版本门禁、构建和单元测试；仍需在当前目标世界创建一次性场景，完成 GM Fire 绘制、Region 移动消耗/光源、整页重载和本模块对象清理。此门未通过前，只能报告为候选。

2026-09-24 的[独立 Chrome 记录](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/battlefield-painter-dnd6-region-round-c-20260924/run-outcome.json>)：唯一临时 Scene 上，GM 在正常模块 UI 以 Fire / Stage I / 自由笔画 / 半径0画出2格，模块清理预览显示自有1批、2 Tile、1 Region、1 Light、0 Sound、0 Wall；原生 Region 列表显示一项“烈焰地带 · 移动消耗”，行为是 `Modify Movement Cost` / `×2`。整页重载后区域形状与火焰视觉仍在；本轮 Region 与 Scene 均经正常 UI 删除，原活动 Scene、战斗回合和暂停状态恢复。父方核对证据 manifest 4/4 文件哈希及唯一 ServerNext 服务身份。**代表性的方格 Fire→Region/光源/重载路径通过。**

精确画前、重载后及删除后的 Region 集合数、底层所有权 flag、数值 world time、模块 Undo、六角格、Frost/Thorns、阶段切换、玩家权限仍未验收；本轮删除 Region 用的是原生 UI，不冒充模块 Undo。原 `14.364` / `5.3.3` 的历史验收记录保持原状。一次原生 Scene Export 无可见结果后，Chrome 宿主拒绝 `chrome://downloads`；执行任务随后曾以 PowerShell 对预期文件名做一次无匹配搜索，违反本迁移的受限浏览器页面不改道规则。该搜索没有用于上述 Fire/Region 结论，不重复此路径。
