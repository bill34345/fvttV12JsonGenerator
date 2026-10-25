# Homebrew Species：纯内容投影与授予身份

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。SP1/SP2既有边界已核，SP3正文归owner；内容发行与实际授予待验。

## 目标与当前事实

保持纯内容模块，让accepted来源、投影、内容包和授予关系一致；不为接入手册增加运行时Hook或socket。

- owner：[foundry-modules/fvtt-homebrew-species/](../../../../foundry-modules/fvtt-homebrew-species/)。
- 稳定 runtime ID：`fvtt-homebrew-species`；默认阶段：P5，内容发行范围明确后。
- 当前1.0.0；基础正式artifact/食人魔玩法目标14.364/5.3.3。V12和Next是显式候选；Next沿用6.0.2内容身份，6.0.5的合集读取不代表完整玩法。构建使用公开generation/species Interface，无模块依赖。
- 关键归属：`build.ts`、`verify.ts`、accepted ledger、`packages/generation/` 的Species公开投影。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### SP1 ledger到pack

核对来源/Markdown/决策/hash与accepted gate，隔离纯投影和构建IO；失败候选不得进入正式pack。

### SP2 目标构建与UUID

明确5.3.3与Next的目标artifact身份，不只调高清单maximum；授予关系、内容差异和包一致性可机械反证。

### SP3 纯内容帮助与发行

提供同来源的模块说明/内容入口，由合集聚合；保留内容-only文件面。核对来源与分发范围后再纳入发行候选。

## 必须保护

species/features pack名、Document ID、ItemGrant UUID、来源/accepted ledger及logical hash追溯。

## 本模块最小真实接受

- 来源或决策变动使旧accepted身份失效；错误授予/缺失Feature或外来引用被拒绝。
- 实际Add Species的受影响授予/等级/次数与原文一致，不扩成所有种族玩法接受。
- 模块包无runtime JS/socket/ready扫描；已有Actor中的内容不被更新包自动覆盖。

## 已有检查入口与下一步

- `bun run test:homebrew-species`
- `bun run build:homebrew-species`
- `bun run verify:homebrew-species`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

下一切片：SP1；先保留内容-only契约和既有食人魔有限接受，不重新生成未授权来源。 未达到该模块真实出口前不进入发行清单。


本轮证据见[内容边界](../../../reviews/2026-10-12-content-module-boundaries.md)；下一步按总账保留原生及发行出口，不重复已通过的局部检查。
