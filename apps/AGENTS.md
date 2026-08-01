# 用户应用入口规则

## 这层目录是做什么的

`apps/` 保存用户直接使用的应用：终端命令行和浏览器 Web 工具。应用负责参数、交互、任务状态和交付，不拥有 parser/generator 的业务规则。

## 依赖与兼容

- CLI 和 Web 必须调用 `packages/` 的公开 workflow 或稳定 application facade；不得复制生成逻辑或以 shell-out CLI 作为 Web 的主要实现。
- `src/index.ts`、旧 Web 入口等兼容路径保持薄转发，除非用户明确批准退役。
- 用户可见的参数、默认路径、诊断、状态码、下载格式和安全行为都属于应用契约。
- 应用不得把服务器端 API key、Cookie、SSH 凭据或 bearer token 暴露给浏览器或生成 artifact。

## 验证

- `bun run typecheck:apps`
- CLI 变化运行 `bun run test:cli`；Web 变化遵守 `apps/web/AGENTS.md`。
- 共同 workflow 变化需要从 CLI 和 Web 各验证一个真实用户路径，不能只检查内部函数。

## 完成标准

- 用户入口仍调用同一正式业务流程，兼容入口没有静默分叉。
- 错误和 needs-review 状态在界面/终端中如实呈现。
- 真实输入可以从入口走到可下载/可验证的正式结果。
