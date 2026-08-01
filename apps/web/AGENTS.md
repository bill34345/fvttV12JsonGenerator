# Web / VPS 工作台规则

## 这个功能是做什么的

本目录是中文优先的浏览器工作台：用户上传 Markdown/TXT，服务器执行正式 workflow，页面显示任务进度、警告和失败项，并下载 JSON、Markdown 或 ZIP。它是可部署到个人 VPS 的应用，不是 CLI 的网页壳。

## 架构

- Web API 调用共享 workflow/service；不得 shell out 到 CLI 作为主要实现。
- CLI 需要 Web 支持的新分支时，先提取可复用 service，再让两个入口调用同一实现。
- 长任务必须进入 job system，报告状态、进度、日志、警告、失败和已登记输出文件。
- upload 模式不得写 Vault Sync manifest，除非用户明确选择 Vault 工作流。
- 改 Web 时保持 `src/index.ts` 和 `apps/cli/src/main.ts` CLI 行为稳定，除非任务明确包含 CLI 变更。

## 安全与公开部署

- 默认绑定必须保持 loopback-only；公开或反向代理模式必须显式开启，并保留已实现的认证边界。
- 浏览器用户在外部访问层认证；代理可以注入服务器 bearer token，但浏览器不得提交或看到该 token。
- 翻译、AI normalize、crawl、SSH 等凭据只能来自 VPS 环境变量。
- 保留 rate limit、上传大小、每 IP 长任务并发、临时目录清理和隐藏 stack trace。
- 下载接口只能返回当前 job 已登记文件；不得从 URL 或用户输入直接拼任意服务器路径。
- 文件名和 ZIP entry 必须清理并拒绝 path traversal。

## 前端产品规则

- 默认中文优先，第一屏就是实际工作台；不要加入 landing page、营销 hero、仿羊皮纸、紫色光效或假 dashboard。
- 优先呈现上传转换、批处理进度、警告、失败条目、JSON 预览和下载动作。
- 单文件任务提供直接 JSON 下载；批量任务提供逐文件与 ZIP 下载。
- 长中文路径、生成名称、警告和 JSON 字段必须换行或滚动，不能遮挡相邻控件。

## 部署文档

- 明确写出绑定地址、公开模式、认证方式和 trusted proxy 边界；不得把当前 API 描述为公开无认证。
- 列出环境变量，并明确翻译/抓取/SSH 凭据只存在服务器端。
- 反向代理 body limit 必须与 Web 上传限制兼容。

## 验证与完成标准

- `bun run typecheck:apps`
- `bun run web:build`
- API/job 变化：`bun test apps/web/src/server/__tests__/api.test.ts --max-concurrency 4`，并运行受影响安全/job 测试。
- 上传/下载变化：浏览器 smoke 上传真实 Markdown，查看进度/警告并下载生成的 JSON 或 ZIP。
- 影响 Actor 语义时，继续执行正式 Actor 生成、`verify:actor` 和源 Markdown 人工核对。
- build 和 API 测试通过只算机械验证；真实页面流程、安全边界和下载内容都检查后才算完成。
