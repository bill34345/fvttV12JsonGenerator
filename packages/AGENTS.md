# 公共功能包规则

## 这层目录是做什么的

`packages/` 保存可以被 CLI、Web、Foundry 模块或其他工作流复用的功能包。它们是项目的业务能力，不是用户入口，也不应直接承担生产运维。

## 管理范围

- `contracts`：跨层共享的最小类型、目标版本、诊断和哈希契约。
- `models`：解析和生成共同使用的规范化 Actor/Item 领域模型。
- `parser`：把 Markdown/YAML/结构化文本解析成领域模型。
- `generation`：把领域模型投影成目标 Foundry/dnd5e JSON。
- `workflows`：组合解析、生成、验证和正式 artifact 注册。
- `intake-ai`、`ingest-plaintext`、`crawl-goddessfantasy`：不同来源的接入器。
- `assets-icons`：Actor 图、Token 图和图标处理。
- `spell-manifest-contracts`：可移植法术清单的纯契约。

## 依赖方向

- `contracts` 和 `models` 不得依赖应用入口、Foundry 浏览器模块、Web server 或运维工具。
- parser/generation/workflow 之间通过公开 package exports 和中立模型通信；不要从其他包深层导入私有文件。
- `apps/` 可以组合 package；package 不得反向导入 `apps/`。
- Foundry runtime 与 Node/Windows/SSH 实现必须在端口或适配器边界隔开，不得塞进共享领域包。
- `src/` 中的旧路径只允许作为兼容 re-export/adapter；新实现归对应 package 所有。

## 修改与验证

- 先读取目标 package 自己的 `AGENTS.md`；没有局部文件时，本文件和根规则共同生效。
- 修改 package export 时检查直接消费者和兼容入口，不要只验证包内类型。
- 基础检查：`bun run typecheck:packages`、`bun run architecture:verify`。
- 影响最终 Actor/Item JSON 时，还必须运行相关测试、正式生成和源语义验证；不能只报告 package typecheck。

## 完成标准

- 包的职责、依赖方向和公开入口没有被破坏。
- 旧入口仍按明确的兼容契约工作，或在任务明确批准后退役。
- 机械检查与受影响真实工作流的语义检查都已记录。
