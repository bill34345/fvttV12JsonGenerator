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

## 构建、安装与运行时

- 本目录是唯一功能 owner：浏览器源码和 manifest 位于 `src/`，构建位于 `build.ts`，本地 Lab 安装与一次性世界准备位于 `lab.ts`、`labCli.ts` 和 `labConfig.ts`。旧 `src/foundry/monster-spell-resolver`、`scripts/buildSpellResolver.ts` 与 `scripts/foundry-lab/spellResolver*.ts` 不得恢复为实现或兼容副本。
- 本地构建、安装与短时 runtime 目标是 `F:\FoundryLab\foundry-v14` 的 v14 集成测试环境；生产只指远程服务器 8080 Foundry，任何生产读取、安装或 hydration 都需要单独授权。
- 本地事务测试只能使用停止状态的一次性测试世界，保留原模块可恢复备份、hash、锁和清理证据。会故意损坏、删除、链接、锁定或替换路径的 fixture 必须使用随机临时根；只能从 F 盘只读加载匹配 14.364 的 `classic-level`。
- Foundry/dnd5e hook、Activity 和 Item 结构必须对照锁定版本资料，不得凭最新版或记忆实现。

## 验证

- `bun run test:spell-resolver`
- `bun run build:spell-resolver`
- 同时运行 spell manifest contract 测试和受影响 generator manifest 测试。
- 运行时变化先在项目本地 Foundry mirror 验证：eligible/ineligible Actor、全部成功、部分失败回滚、Keep/Overwrite/Cancel 和关闭即取消。

## 完成标准

- 只触及明确 owned 文档，失败后 Actor 恢复到操作前状态。
- manifest producer、contract、resolver 和目标版本结构一致。
- 单测/build 通过不等于目标世界 hydration 已验收；本地 runtime 与生产接受分别报告。
