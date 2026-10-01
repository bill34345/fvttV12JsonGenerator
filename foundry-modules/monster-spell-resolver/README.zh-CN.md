# 怪物法术解析器

这是安装进 Foundry Virtual Tabletop（Foundry VTT）的浏览器模块。它读取本项目生成 Actor 携带的可移植法术清单，在目标世界已启用的 dnd5e 法术资料包中寻找匹配法术，并以 Actor 为单位执行全有或全无的安全解析。

运行时仅接受 Foundry/dnd5e 精确配对 `14.364/5.3.3`、`14.368/6.0.2` 和 `14.368/6.0.5`。`6.0.2` 的既有水合与指定施法路径有历史运行证据；`6.0.5` 在2026-10-01独立通过资料索引、十法术自动水合完整归属、普通UI一次Undo及重载后pending／0缓存。该轮没有人工Review／Apply点击，原生Cast完整矩阵仍未执行，见[限定接受](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md)。交叉配对及 `6.0.3`、`6.0.4` 等未列版本拒绝。

## 目录归属

- `src/`：浏览器运行源码、`module.json`、语言文件、样式、模板和模块测试。
- `build.ts`：构建可安装目录和 ZIP。
- `lab.ts`、`labCli.ts`、`labConfig.ts`：只负责配置后的本地 Foundry Lab 构建、安装、校验、卸载和一次性测试世界准备。
- `dist/`：可重建的本地构建产物，不提交 Git。

旧目录 `src/foundry/monster-spell-resolver/` 和旧构建、安装脚本已经退役；本目录是唯一实现位置。

## 常用命令

在仓库根目录运行：

```powershell
bun run test:spell-resolver
bun run typecheck:foundry-modules
bun run build:spell-resolver
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
```

构建产物位于 `foundry-modules/monster-spell-resolver/dist/`。本地安装目标由 `FVTT_OPS_LAB_ROOT` 精确解析；当前机器的持久测试环境是 `F:\FoundryLab\foundry-v14`。

上面的 `foundry:lab spell-resolver install` 是既有 server-mirror 安装路径。ServerNext 首次安装可用 `bun run foundry:ops lab install-server-next-owned-module --module-id=fvtt-json-generator-spell-resolver --version=0.1.7`，先检查干跑的目标与 SHA-256，再加 `--apply`；目标已有版本时该工具拒绝覆盖，升级需单独执行受控流程。0.1.5 只是诊断版，发现正式 Rat Warlock 首条法术的原生缓存投影比较失败；只读差异仅有九条原生效果变化行 `_id` 不同。0.1.6 只忽略这些重建 ID，正式怪物十法术水合及代表性攻击、豁免、目标伤害和日次数消耗真实通过；但一次 Undo 与补偿真实失败，留下 10 个无归属原生缓存。当前已装 `0.1.7` 定点修正 Undo flags 递归合并、系统重建时间戳与效果来源、原生缓存清理。新任务怪物自动十法术水合后，单次 Undo 回到 `pending` 且0法术/0无归属缓存/0受管活动，整页重载结果相同；[现场证据](../../docs/reviews/2026-09-25-resolver-undo-source-and-fix.md)。故意故障补偿仅单测，未在运行中世界注入。文件安装、世界启用、水合、原生 Cast 与 Undo 是分别验收的步骤。

## 支持与安全边界

- 运行时仅接受精确组合 Foundry VTT `14.364` / dnd5e `5.3.3`，以及 ServerNext `14.368` / `6.0.2` 或 `6.0.5`；交叉组合和未列版本会拒绝。manifest 的 `verified` 仍是旧组合；既有十法术水合、代表性原生 Cast 与一次首次水合撤销/重载证据绑定 `6.0.2`，本轮 `6.0.5` 的限定实机接受另记。故意失败时的运行时补偿尚未注入验证。
- 当前生成器的 Actor 法术清单仍以旧目标生成；Forge `0.4.0` 尚待原工作树整理。因此静态候选不能当作完整的 ServerNext 集成。
- dnd5e `6.0.2` 的原生 Cast 缓存附魔把变更保存在 `effects[].system.changes`；解析器按原生缓存来源选择该字段，并在更新 Hook 到达后核对实际缓存。`onUpdateActivities` 源码仍以顶层 `changes` 调用 `ActiveEffect.update()`，而目标运行时的 `updateActiveEffect` 差量负载尚未实测；目前兼容嵌套、点路径与顶层形式，仍需在 ServerNext 进行实际 Hook、Keep/Overwrite、no-op 与失败回滚验收。
- dnd5e `6.0.2` 为 Item compendium 默认索引 `system.source`；索引请求会省略其下的 `system.source.rules/book`，直接从完整的 `system.source` 读取规则世代和书籍。dnd5e `5.3.3` 没有该默认父字段，仍单独请求两个子字段。两版都须保留 2024/2014 区分，不能把缺失规则当成 2014。
- View Report 的顶层 `status` 表示当前 Actor 状态，只有当前 manifest、目标运行时与严格管理文档仍匹配时才显示 `hydrated`。与当前 manifest 哈希及完整法术引用集合绑定的上次提交，另列为 `lastCommittedOutcome`（含 Keep/Overwrite）；无决策重新预检列为 `currentPreflightWithoutDecisions`。manifest 被替换或提交选择缺失、重复、指向错误引用时，不把旧记录当作当前提交结果。未提交 Actor 仍显示当前预检。
- 本地安装和短时验证只针对配置后的 F 盘测试环境；完成 server-mirror 的 PID、端口、路径和运行者预检后可自主执行，被其他参与者占用时等待。
- 唯一生产环境是远程服务器 8080 Foundry；只读 inventory/acquire 可在保留 CLI guard 和目标核对的前提下自主执行，生产安装或 Actor hydration 等写入必须再次取得明确授权。
- 构建、单元测试和安装 hash 一致只能证明机械正确；目标世界中的实际解析行为仍需单独做运行时语义验收。
