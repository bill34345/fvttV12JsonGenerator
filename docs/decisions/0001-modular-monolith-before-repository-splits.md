# ADR-0001：先建立模块化单体，再拆分仓库

- 状态：Accepted
- 日期：2026-07-31
- 决策人：项目用户
- 来源计划：`docs/plans/2026-07-31-project-classification-and-architecture-reorganization.md`

## 背景

当前仓库同时包含转换核心、来源接入、资产工作流、CLI、Web、Foundry modules 和 Foundry 运维工具。
现有 1,576 个测试提供了渐进重构安全网，但内部 `core` 层次、公开入口和发布边界仍不稳定。立即拆成多个
仓库会同时固定尚未验证的接口，并扩大路径、构建、测试和运行时回归范围。

## 决策

先在当前仓库内建立明确的 contracts、domain/parser、generation、application workflows、adapters 和
apps 边界，再将这些边界迁为 Bun workspace packages。只有一个候选边界满足以下条件后，才允许拆仓：

1. 不导入主仓库私有实现；
2. 有稳定 contract 或 CLI/artifact 接口；
3. 能在 fresh clone 中独立安装、构建、测试和验收；
4. 原 hardening findings 和支持声明已有明确 owner；
5. 拆分前后真实用户工作流语义一致。

## 后果

- 第一阶段不会大规模移动目录；
- 依赖门禁先于物理拆分；
- 不采用微服务或 framework-driven rewrite；
- 每个 package 迁移都必须有 characterization tests 和回滚提交；
- monorepo 不是永久要求，拆仓由已验证边界触发。

