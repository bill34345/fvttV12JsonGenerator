# ADR-0002：Foundry 运维能力属于独立产品边界

- 状态：Accepted
- 日期：2026-07-31
- 决策人：项目用户

> 2026-08-10 修订：本 ADR 的产品边界继续有效；其中“生产单独授权”的读取部分由 [ADR-0005](0005-production-read-autonomy-and-write-authorization.md) 修订为“生产只读无需逐次对话授权但保留机械门禁”。任何生产写入仍须再次明确授权。历史文字保留为当时决策证据。

## 背景

`scripts/foundry-lab`、world audit、生产 inventory/acquisition/migration、本地 mirror 管理以及 Blood
Hunter、Plutonium、Sequencer 等专项流程具有高权限、环境依赖和独立运行时验收要求。它们与普通
Markdown 到 Actor/Item JSON 转换的权限边界、发布节奏和失败后果不同。

## 决策

这些能力先在当前仓库内收拢到一个明确的 `tools/foundry-ops` 产品边界，接口稳定后迁往独立的
`fvtt-foundry-ops` 仓库。拆出前必须：

- 区分 read-only inventory、local mutation 和 production mutation；
- 将主机、凭证、world、backup/evidence root 外部配置化；
- 只通过稳定 CLI、package API 或 artifact contract 使用 generator；
- 保留 inventory-first、backup-first 和生产单独授权规则；
- 为所有相关 hardening findings 指定迁移后的 owner。

## 后果

- 第一阶段不拆仓，也不移动 `.local`；
- 普通生成器测试不得依赖 Foundry Lab；
- 运维工具不得继续无约束导入 generator 私有文件；
- 未来拆仓必须使用 fresh clone 和可审查的历史提取，不在活跃工作副本改写历史。

