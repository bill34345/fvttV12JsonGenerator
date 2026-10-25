# 怪物法术解析器

这是安装进 Foundry Virtual Tabletop（Foundry VTT）的浏览器模块。它读取本项目生成 Actor 携带的可移植法术清单，在目标世界已启用的 dnd5e 法术资料包中寻找匹配法术，并以 Actor 为单位执行全有或全无的安全解析。

运行时仅接受 Foundry/dnd5e 精确配对 `14.364/5.3.3`、`14.368/5.3.3`、`14.368/6.0.2`、`14.368/6.0.5` 和 `14.368/6.0.6`。`6.0.2` 的既有水合与指定施法路径有历史运行证据；`6.0.5` 在2026-10-01独立通过资料索引、十法术自动水合完整归属、普通UI一次Undo及重载后pending／0缓存。该轮没有人工Review／Apply点击，原生Cast完整矩阵仍未执行，见[限定接受](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md)。`6.0.6` 当前对 `0.1.7` 的限定接受覆盖一个 Rat NPC 样本：原生NPC角色卡上的十条法术、生成施法入口及各自来源和缓存逐一对应；当前含 Midi-QOL 的组合中，迷踪步经正常使用窗口消耗一次；撤销上次水合及普通重载后保持待处理、零法术缓存和零生成Cast。测试角色、消息和取证工具已清理，原内容及已采范围内的设置、账号和场景状态读回通过。该结果不覆盖真实传送落点、无Midi-QOL的组合、全法术库、所有活动、玩家、长时或生产；设置比较也不代表全库原值均已采集。精确构建、运行证据与采集范围见[本轮总账](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)。交叉配对及 `6.0.3`、`6.0.4` 等未列版本拒绝。

## 使用帮助

在“游戏设置 → 模块设置 → 目标世界法术解析器”中点击“使用帮助”。GM 在统一操作手册合集已启用且接口可用时，会定位本模块说明；合集不可用时打开模块随包的只读说明。帮助与离线手册共用 `docs/manual.json`，点击帮助不会保存设置、重建索引或执行法术解析。新入口尚待真实Foundry窗口验收。

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

- 当前本地候选在最终保存后核对完成记录和受管法术/活动。保存被拦截、记录不完整或内容在保存期间变化时，报告提交失败并尝试恢复；恢复只替换本模块自己的记录，残留差异仍会报告。缺少必要的精确恢复接口时，在第一次文档写入前停止。本修复已完成离线事务检查；ServerNext 6.0.6 仅在上文唯一批准 Rat NPC 的限定实机链上接受。
- 运行时仅接受上列精确组合；交叉组合和未列版本会拒绝。manifest 的 `verified` 仍是旧组合；既有十法术水合、代表性原生 Cast 与一次首次水合撤销/重载证据绑定 `6.0.2`，`6.0.5` 的限定实机接受另记。6.0.6 只接受上文 Rat NPC 的来源索引、10项水合、一次原生 Midi Use 消耗、Undo、重载和清理，不能推广为全库或完整 Cast 矩阵。
- 固定 `6.0.6` 源码中 CastActivity、Cast数据、缓存与攻击路径未在版本差异文件内；聊天卡资源消耗在原生 Activity mixin 改为传入 `{ message }`。解析器没有自定义 `consume()` 或聊天卡资源消耗适配；本次仅接受真实 Misty Step 消耗对话与 Activity spent 0→1 的代表链，不宣称真实传送落点、纯 Core-only 矩阵或其他法术／活动的消耗行为。
- 当前生成器的 Actor 法术清单仍以旧目标生成；Forge `0.4.0` 尚待原工作树整理。因此静态候选不能当作完整的 ServerNext 集成。
- dnd5e `6.0.2` 的原生 Cast 缓存附魔把变更保存在 `effects[].system.changes`；解析器按原生缓存来源选择该字段，并在更新 Hook 到达后核对实际缓存。`onUpdateActivities` 源码仍以顶层 `changes` 调用 `ActiveEffect.update()`，而目标运行时的 `updateActiveEffect` 差量负载在本轮仅由上述代表链覆盖；其他 Hook、Keep/Overwrite、no-op、失败补偿、全法术库和全部活动仍需单独验收。
- dnd5e `6.0.2` 为 Item compendium 默认索引 `system.source`；索引请求会省略其下的 `system.source.rules/book`，直接从完整的 `system.source` 读取规则世代和书籍。dnd5e `5.3.3` 没有该默认父字段，仍单独请求两个子字段。两版都须保留 2024/2014 区分，不能把缺失规则当成 2014。
- View Report 的顶层 `status` 表示当前 Actor 状态，只有当前 manifest、目标运行时与严格管理文档仍匹配时才显示 `hydrated`。与当前 manifest 哈希及完整法术引用集合绑定的上次提交，另列为 `lastCommittedOutcome`（含 Keep/Overwrite）；无决策重新预检列为 `currentPreflightWithoutDecisions`。manifest 被替换或提交选择缺失、重复、指向错误引用时，不把旧记录当作当前提交结果。未提交 Actor 仍显示当前预检。
- 本地安装和短时验证只针对配置后的 F 盘测试环境；完成 server-mirror 的 PID、端口、路径和运行者预检后可自主执行，被其他参与者占用时等待。
- 唯一生产环境是远程服务器 8080 Foundry；只读 inventory/acquire 可在保留 CLI guard 和目标核对的前提下自主执行，生产安装或 Actor hydration 等写入必须再次取得明确授权。
- 构建、单元测试和安装 hash 一致只能证明机械正确；目标世界中的实际解析行为仍需单独做运行时语义验收。
