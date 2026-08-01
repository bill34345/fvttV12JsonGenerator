# 命令行应用规则

## 这个功能是做什么的

本目录是 `fvtt-import` 的正式 CLI 应用。它提供单文件转换、Vault Sync、AI Intake、纯文本/Item 导入、翻译、目标版本、图标和图片资产选项；根 `src/index.ts` 是兼容启动入口。

## 不可违反的规则

- 参数解析和用户提示可以在这里实现；解析、生成、Intake 和资产业务规则必须调用公开 workflow/package。
- 保持 `src/index.ts` 与 `apps/cli/src/main.ts` 的参数、默认值、退出行为和输出语义一致。
- 默认 Vault 为 `obsidian/dnd数据转fvttjson`；不得因为测试方便改变正式 input/output 约定。
- `--dry-run` 不得执行 Vault promotion、远程上传或其他外部写入。
- v14 safe icon、effect profile、图片 SSH 等互斥/版本条件必须在写文件前失败。
- CLI 显示“成功”前，正式 artifact gate 必须已经完成；needs-review 不能以退出成功文案伪装成 accepted。

## 验证

- `bun run typecheck:apps`
- `bun run test:cli`
- `bun run cli:help`，人工检查命令和中文/英文说明没有陈旧路径。
- 改变生成语义时，用兼容入口和新入口各生成同一真实样例，比较结果并执行 `verify:actor` 与源语义核对。

## 完成标准

- 新旧入口行为一致，错误在写入前 fail-closed。
- 至少一个真实命令从输入运行到正式输出并经人工核对。
- 仅 help 输出或 CLI 测试通过不足以证明转换正确。
