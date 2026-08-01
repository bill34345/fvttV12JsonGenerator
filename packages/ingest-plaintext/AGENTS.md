# 纯文本规则导入器规则

## 这个功能是做什么的

本目录把规则相对整齐的纯文本怪物集合切分、审计并送入现有 Markdown/Actor 流程。它是 legacy rule-based 接入器；普通杂乱资料优先使用 AI Intake。

## 不可违反的规则

- 重复运行必须稳定，不得重复追加同一条目或覆盖未确认的用户文件。
- Vault promotion、Actor 图与 Token 图路由、来源 URL 和审计信息必须保留。
- `actor.img` 表示角色卡图片；prototype token texture 表示棋子图片，两者不得因为文件名相似而混用。
- 无法可靠切分或识别的条目必须报告为跳过/失败/需要复核，不得静默丢失。
- 最终 Actor JSON 仍由正式 workflow/generator 产生，不得在 ingest 层手写修补。

## 修改入口与验证

- 公共出口：`packages/ingest-plaintext/src/index.ts`。
- `bun run typecheck:packages`
- `bun test tests/cli-plaintext-actors.test.ts src/core/ingest --max-concurrency 4`
- 使用真实小型 plaintext fixture 重复执行，核对条目数量、名称、图片路由、Markdown 和生成 Actor 语义。

## 完成标准

- 第一次与重复运行都不会丢失、重复或错误覆盖内容。
- 输入条目与输出 Markdown/Actor 可以逐项追踪。
- 图像角色和最终 Actor 语义经过人工抽样核对。
