# GoddessFantasy 站点抓取规则

## 这个功能是做什么的

本目录从 GoddessFantasy/SMF 版面收集主题和打印页，保存可追踪的原始 crawl artifacts，并把 `records.json` 转成 plaintext；它不直接生成或修补最终 Actor JSON。

## 范围与解耦

- package owner：`packages/crawl-goddessfantasy/**`。
- 命令入口：`src/tools/crawlSites.ts`。
- `src/core/crawl` 只保留兼容入口和兼容测试；新站点逻辑属于本 package。
- 与主 Actor CLI 保持解耦。crawl-to-plaintext 完成后再进入既有 Intake/generator 流程。

## 数据和凭据

- 不得提交 cookie header、保存的登录 Cookie、用户名、密码或 `.crawlee-storage/`。
- 凭据只来自环境变量 `GODDESSFANTASY_COOKIE`、`GODDESSFANTASY_USERNAME`、`GODDESSFANTASY_PASSWORD`，或用户明确提供的本地文件。
- `records.json`、`topics.jsonl`、`failures.jsonl`、`manifest.json` 和 print HTML 是来源证据，不是最终 Actor JSON。
- 使用 print-page URL 抓取完整主题；忽略 `#new`、`action=post`、`action=markasread`、`action=reporttm` 等非规范操作链接。
- 单元测试使用 fixture，不依赖真实网站；真实登录抓取必须有当前授权和可用凭据。

## 验证

- `bun run typecheck:packages`
- `bun test src/core/crawl/__tests__/goddessfantasy.test.ts src/core/crawl/__tests__/recordsToPlaintext.test.ts --max-concurrency 4`
- crawl-to-plaintext 变化时，确认 plaintext 仍能进入现有 ingest 流程。
- 若变化影响最终 Actor，继续执行 anti-overfit、正式生成和源语义验证。

## 完成标准

- 原始来源、失败项和转换结果可追踪，凭据没有进入产物。
- fixture 证明解析规则，真实抓取只在明确授权下验收。
- 抓取成功不能代替最终 Actor 语义验收。
