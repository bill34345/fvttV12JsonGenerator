# Architecture Decision Records

本目录记录 `fvttV12JsonGenerator` 的架构边界决策。ADR 只记录已经决定的方向及其后果；执行进度记录在
`docs/remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md`，原项目 hardening findings
继续以 `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md` 为权威来源。

| ADR | 状态 | 决策 |
|---|---|---|
| [0001](0001-modular-monolith-before-repository-splits.md) | Accepted | 先模块化单体，再按已验证边界拆仓 |
| [0002](0002-foundry-operations-product-boundary.md) | Accepted | Foundry 运维能力最终成为独立产品 |
| [0003](0003-foundry-modules-release-boundaries.md) | Accepted | 三个 Foundry module 按独立发布单元治理 |
| [0004](0004-preserve-vault-paths-during-code-reorganization.md) | Accepted | 代码重整期间保持 Obsidian vault 路径兼容 |
| [0005](0005-production-read-autonomy-and-write-authorization.md) | Accepted | 生产只读保留机械门禁并可自主执行，任何生产写入再次授权 |

