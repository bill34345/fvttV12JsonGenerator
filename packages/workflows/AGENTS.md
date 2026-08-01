# 正式转换工作流规则

## 这个功能是做什么的

本目录把解析、生成、图片、翻译、Vault Sync 和验证组合成用户真正调用的流程，并决定哪些文件可以登记为正式 artifact。

## 不可违反的规则

- workflow 必须调用 package 的公开接口；不得重新实现 parser/generator 规则，也不得深层导入私有实现。
- 正式输出只能在生成与规范验证完成后登记。`generated`、文件存在或 JSON 可解析不等于 `accepted`。
- 单文件转换、collection、Vault Sync、Item、纯文本 Actor 和 Web upload 必须保留各自的写入边界；upload 模式不得默认污染 Vault manifest。
- 外部 I/O、翻译、图片上传等通过端口/适配器注入，测试默认使用 fixture 或 fake，不依赖真实网络。
- 路径、默认输出和诊断变化属于用户可见契约，必须同步检查 CLI 与 Web 消费者。

## 修改入口

- 公共出口：`packages/workflows/src/index.ts`。
- 单文件、collection、Vault、Item、plaintext 和 verification 各自由同目录对应 workflow 管理。
- `src/core/application` 仍有组合/兼容代码；新可复用流程优先归本 package。

## 验证

- `bun run typecheck:packages`
- 运行受影响 workflow 的聚焦测试；影响 CLI 时追加 `bun run test:cli`，影响 Web 时遵守 `apps/web/AGENTS.md`。
- Actor 语义变化时运行正式生成、`verify:actor` 与来源人工核对。

## 完成标准

- 正式 artifact gate 没有被绕过，失败和 needs-review 状态没有被伪装成成功。
- CLI、Web 和兼容入口对相同流程保持一致语义。
- 至少一个真实输入从入口走到最终输出并完成语义检查。
