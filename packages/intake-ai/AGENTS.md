# AI 内容整理规则

## 这个功能是做什么的

本目录把不规则 TXT/Markdown 交给可配置的 AI provider，生成可审阅的 Intake 中间结果；它不是绕过 parser/generator 直接制造最终 Actor JSON 的工具。

## 状态边界

- Item Intake is a parallel evidence IR, not a Monster compatibility mode. Its formal entry is `--intake-items`; raw TXT/irregular Item Markdown must never be routed through the legacy item AI normalizer.
- The current Item contract is exactly Foundry `14.364` / dnd5e `5.3.3` / `core`. AC, light, shared uses and spell consumption need field-specific verifier coverage, and any unresolved spell or weak source evidence must remain `needs_review`/`failed` rather than become an empty ability or Utility fallback.

- 结果必须保持 `accepted`、`needs_review`、`failed` 等真实状态；不得把 provider 返回、schema 通过或文件写出自动提升为 accepted。
- provider 原始输出必须经过本 package 的 validator/verifier；确定性 renderer 只能渲染已支持的契约。
- 每次 Intake 都必须维持同一来源的可审计链：source → evidence IR → 已验证的 rendered Markdown（含适用的 portable spell-manifest evidence）→ workflow JSON。不得让同一 run 的 IR、Markdown、manifest 或 JSON 交叉引用另一来源/另一 run 的证据。
- verifier 必须按 source identity 和该 source 的 evidence/range 复核，不得用“本批有相似条目通过”代替当前来源的验收。
- 当前 Intake IR 未表达的高级 mechanics 必须保留为 `needs_review`，不能根据自然语言猜测后偷偷写入 renderer/generator；`needs_review`/`failed` 不能经手修 Markdown 或 JSON 被提升、推广为正式产物。
- API key、完整 provider 请求、敏感响应和凭据不得进入仓库或普通日志；测试使用 fake provider，除非用户明确授权真实调用。
- resume 必须保留原 run、决定文件和审计链，不能覆盖用户尚未处理的选择。

## 修改入口

- 公共出口：`packages/intake-ai/src/index.ts`。
- provider/http 只处理外部调用；orchestrator 管流程；validator/verifier 决定可接受性；renderer 负责确定性输出。

## 验证

- `bun run typecheck:packages`
- `bun test src/core/intake/__tests__ tests/cli-ai-intake.test.ts --max-concurrency 4`
- 对普通真实 TXT 跑 CLI Intake、`bun run verify:intake <source> <run-dir>`；确认 verifier 的 source 与 run 中 rendered Markdown/manifest 是同一来源。若继续生成 Actor，再执行 Actor 验证和语义核对。

## 完成标准

- 错误、歧义和不支持内容没有被降级隐藏。
- 同一 accepted 中间结果可确定性重现，resume 不破坏审计信息。
- 真实样例的来源语义与 source-scoped chain 由人工复核，而不是只确认 provider/JSON 返回成功。
