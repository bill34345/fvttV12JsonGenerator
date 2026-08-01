# ADR-0003：Foundry modules 按独立发布单元治理

- 状态：Accepted
- 日期：2026-07-31
- 决策人：项目用户

## 背景

仓库当前包含 `chat-memory-guard`、`session-monitor` 和 `monster-spell-resolver`。三者的运行时、版本、
安装、验收和与 generator 的耦合度不同，不能继续被当作一个无差别的 `src/foundry` 功能集合。

## 决策

三个 module 从现在起分别拥有 manifest、版本、构建入口、测试、验收和发布记录：

1. `chat-memory-guard` 基本独立，是第一拆分候选；
2. `session-monitor` 与 Windows/Chrome companion 共同构成一个产品，是第二拆分候选；
3. `monster-spell-resolver` 先留在主仓库，直到 `spell-manifest-contracts` 稳定且不再导入
   intake/parser 私有实现。

所有当前和未来 module 继续受 `MOD-I18N-001` 的双语产品要求约束。物理拆仓不能用于升级任何
`Partial` 或未完成的运行时支持声明。

## 后果

- module 可以暂时共享 Git 仓库，但不能共享模糊发布身份；
- 跨 module 复用必须通过窄 contract，不能借用无关领域实现；
- 每次拆分都需要目标 Foundry/dnd5e 版本的真实运行时验收；
- `SPELL-002`、`SPELL-003` 和 `MON-001` 的现有状态保持不变。

## 2026-08-01 实施补充

`spell-manifest-contracts` 已建立稳定契约，resolver 生产代码不再导入 Intake 或 parser 私有实现；原在线恢复事项也已由用户完成并确认正确。因此 Monster Spell Resolver 已物理迁入 `foundry-modules/monster-spell-resolver/`，并在主仓库内作为独立构建和发布单元维护。此次移动没有把它拆成独立 Git 仓库，也没有扩大生产部署或版本支持声明。
