# FVTT JSON Forge

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Foundry 中准备和主持 D&D 游戏的 GM。主要任务是从已有规则资料或自行填写的生物蓝图，制作可审阅、可创建的生物、物品和战斗包。

## Product Purpose

在一个 Forge 工作台中完成资料编辑、生成、预览、审核和明确创建，保留来源、草稿及派生关系。用户于 2026-10-05 确认 GM 工作台和 Creature Blueprint 为同一模块，并批准现有成果的统一实施。

## Operating Context

使用 Foundry ApplicationV2 和原生目录/文档接口；本轮接受目标为本地 Mirror 14.368 / dnd5e 5.3.3，保留原 14.364 配对。标准来源和蓝图可无需 AI 使用，AI 配置为共享独立入口。

## Capabilities and Constraints

- 生物：手工蓝图、标准资料、AI 整理；物品：标准资料、AI 整理；战斗包有专用审核与启动边界。
- 保留三阶段操作、用户选定的蓝图库/编辑/独立预览，以及 2024 资料块信息结构。
- 只有正式生成验证通过的当前候选可创建；草稿预览不表示验证通过。
- 草稿按 world/user 隔离。来源改动、模式或连接变化使旧候选失效；派生有独立来源身份。
- Actor/Item 类型、GM 权限、精确目标、来源/产物 hash、create-only 和 readback 不放宽。
- 不将复杂 AI 来源自动转换为不完整蓝图；本轮不扩展自动 CR、完整法术/传奇/巢穴编辑或覆盖已有 Actor。
- 使用中文操作说明，保留现有公开 API；Key 不进入世界数据或诊断。

## Evidence on Hand

工作台与蓝图两份旧实现、离线回归和限定历史验收已存在。最新统一组合的视觉和运行接受仍待执行；当前任务状态见仓库 `docs/plans/2026-10-05-forge-unified-workbench.md`。

## Product Principles

操作路径清晰；来源和结果可核对；编辑不意外写入世界；用户选择不因切换模式丢失；状态及未验证内容如实呈现。
