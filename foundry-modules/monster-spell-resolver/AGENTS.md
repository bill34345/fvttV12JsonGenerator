# Monster Spell Resolver / 怪物法术解析器规则

## 这个功能是做什么的

本 Foundry 模块读取生成 Actor 携带的可移植法术清单（manifest），并把明确归本模块所有的内嵌法术（Spell）与施法活动（Activity）解析到目标世界已启用的法术资料包（Item compendium）。它不会全世界扫描并按名称替换法术。

## 目标世界硬门禁

- 只有携带有效 resolver manifest 的 Actor 才有资格处理。
- 只允许修改模块拥有的 embedded Spells，以及明确链接到生成 feature 的模块拥有 Cast Activities。
- 不得修改 compendium、patch Foundry/dnd5e prototype、按名称删除文档或运行自动全世界迁移。
- 实际解析写入（hydration）必须按 Actor 全有或全无；中途失败要通过补偿回滚恢复操作前状态。
- 遇到人工修改只能选择 Keep、Overwrite 或 Cancel；关闭 review 窗口等同 Cancel。
- manifest 不得携带目标世界专属 ID；契约变化同步读取 `packages/spell-manifest-contracts/AGENTS.md`。
- 本模块是目标世界 hydration owner：它从 portable `pending` manifest 选择目标世界法术并原子地写入 owned 缓存 Spell/Cast Activity；不得反向修改生成阶段的 manifest，或把静态契约合法误报为 hydration/runtime 成功。

## 构建、安装与运行时

- 本目录是唯一功能 owner：浏览器源码和 manifest 位于 `src/`，构建位于 `build.ts`，本地 Lab 安装与一次性世界准备位于 `lab.ts`、`labCli.ts` 和 `labConfig.ts`。旧 `src/foundry/monster-spell-resolver`、`scripts/buildSpellResolver.ts` 与 `scripts/foundry-lab/spellResolver*.ts` 不得恢复为实现或兼容副本。
- 本地构建、安装与短时 runtime 目标是 `F:\FoundryLab\foundry-v14` 的 v14 集成测试环境；生产只指远程服务器 8080 Foundry。生产只读核对可在目标明确、带 `--apply` 与 `--allow-production-read`、并通过外部配置 guard 时自主执行；生产安装、hydration 和其他写入仍须再次明确授权。
- 本地 Lab 安装与短时测试可在完成 PID、端口、路径和运行者预检，且确认 mirror 未被他人占用后自主执行；若被占用则等待协调或释放，不得自行停止、复用或替换该环境。
- 本地事务测试只能使用停止状态的一次性测试世界，保留原模块可恢复备份、hash、锁和清理证据。会故意损坏、删除、链接、锁定或替换路径的 fixture 必须使用随机临时根；只能从 F 盘只读加载匹配 14.364 的 `classic-level`。
- Foundry/dnd5e hook、Activity 和 Item 结构必须对照锁定版本资料，不得凭最新版或记忆实现。

## 验证

- `bun run test:spell-resolver`
- `bun run build:spell-resolver`
- 同时运行 spell manifest contract 测试和受影响 generator manifest 测试。
- 运行时变化先在项目本地 Foundry mirror 验证：eligible/ineligible Actor、全部成功、部分失败回滚、Keep/Overwrite/Cancel 和关闭即取消。
- hydration 验收后仍须把 native Cast 的真实使用作为单独 runtime 层：检查攻击、豁免、目标限制、消耗与 resolver 禁用后的缓存可用性；本地 runtime 与生产接受分别记录。

## 完成标准

- 只触及明确 owned 文档，失败后 Actor 恢复到操作前状态。
- manifest producer、contract、resolver 和目标版本结构一致。
- portable/static manifest、目标世界 hydration、native Cast runtime 是三个不同层级。单测/build 通过不等于 hydration；hydration 成功也不等于原生施法或生产接受已验收。
