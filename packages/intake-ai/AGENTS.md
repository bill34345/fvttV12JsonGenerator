# AI 内容整理规则

## 这个功能是做什么的

本目录把不规则 TXT/Markdown 交给可配置的 AI provider，生成可审阅的 Intake 中间结果；它不是绕过 parser/generator 直接制造最终 Actor JSON 的工具。

## Monster默认责任边界

AI负责理解内容；外部生物回答在接收入口整理一次，程序负责技术ID与附带记录。`validateMonsterIntakeIR`和`verifyMonsterIntake`返回具体字段／投影问题，不能取消Actor或删除已有能力；内部不重复作整只接受检查。可读生物回答的外壳、字段位置、引文、缺省值或内部IR问题不是AI没有正常返回。不能从原文猜补数值或覆盖模型明确机制；复杂规则及未映射字段与对应能力原文一起保留。旧SourceAudit只在显式离线入口出报告。Item和Species契约独立。依据为[用户原话与46项范围](../../docs/acceptance/2026-10-27-forge-generation-delivery-remediation.md)。

## 状态边界

- Item Intake is a parallel evidence IR, not a Monster compatibility mode. Its formal entry is `--intake-items`; raw TXT/irregular Item Markdown must never be routed through the legacy item AI normalizer.
- The current Item contract is exactly Foundry `14.364` / dnd5e `5.3.3` / `core`. AC, light, shared uses and spell consumption need field-specific verifier coverage, and any unresolved spell or weak source evidence must remain `needs_review`/`failed` rather than become an empty ability or Utility fallback.
- Species Intake is another independent evidence IR with formal entry `--intake-species`, exact `core` / 2024 targets for Foundry `12.331` + dnd5e `4.3.9`, Foundry `14.364` + dnd5e `5.3.3`, or the ServerNext static candidate Foundry `14.368` + dnd5e `6.0.2`. Its accepted ledger is target-aware: neither an older V14 acceptance nor a static projector test accepts `14.368/core/2024` content. V12 remains a static-candidate generation/build target until a real V12 Lab passes; the existing V14 target retains its own runtime evidence. It may accept fully preserved `gm-assisted`/`external-rule` mechanics, but arbitrary Foundry paths, arbitrary Effect changes, empty Utility fallbacks, stale Markdown, cross-target evidence reuse and unreviewed module entries must fail closed.

- 结果必须保持 `accepted`、`needs_review`、`failed` 等真实状态；不得把 provider 返回、schema 通过或文件写出自动提升为 accepted。
- Monster provider保留原答并交付可读生物资料；renderer确定性输出可转换字段，局部问题保留在对应能力说明和IR导出，不把整项已有基本操作变为纯说明。Item/Species继续各自validator/verifier边界。
- 每次 Intake 都必须维持同一来源的可审计链：source → evidence IR → 已验证的 rendered Markdown（含适用的 portable spell-manifest evidence）→ workflow JSON。不得让同一 run 的 IR、Markdown、manifest 或 JSON 交叉引用另一来源/另一 run 的证据。
- verifier 必须按 source identity 和该 source 的 evidence/range 复核，不得用“本批有相似条目通过”代替当前来源的验收。
- 当前Intake IR未表达的高级mechanics保留具体问题与原文；不能手修Markdown/JSON冒充accepted。生物候选的获取不依赖检查通过，已生成Actor须返回可访问的actorPath；正式登记/覆盖冲突只限制相应写入。
- API key、完整 provider 请求、敏感响应和凭据不得进入仓库或普通日志；测试使用 fake provider，除非用户明确授权真实调用。
- resume 必须保留原 run、决定文件和审计链，不能覆盖用户尚未处理的选择。

## 修改入口

- 公共出口：`packages/intake-ai/src/index.ts`。
- provider/http处理外部调用和一次接收整理；orchestrator组织交付；validator/verifier报告检查结论；renderer负责确定性输出。生物流程不自动调用AI复核或纠错，显式纠错失败保留原答及已有产物。

## 验证

- `bun run typecheck:packages`
- `bun test src/core/intake/__tests__ tests/cli-ai-intake.test.ts --max-concurrency 4`
- 真实 TXT 指来源内容，不自动授权联网 provider。CLI 的 `--dry-run` 只做参数、预检和调用估算，不产生 accepted source chain；fake provider 只用于注入式测试，不证明真实模型效果。
- 对已有 Monster Intake 来源链运行 `bun run verify:intake -- --source <source> --ir <ir> --markdown <markdown> --actor <actor>`；四个输入必须属于同一来源／run。该命令接受 MonsterIntakeIR，不代替 Item／Species 各自的 verifier。未传 `--json-output` 或 `--markdown-output` 时只读本地文件并打印报告，不调用 provider；传这两个可选参数会写指定报告文件。
- 创建或 resume 来源链需要真实 provider 时，遵守用户已明确授权的任务、目标、数据与调用范围；已有会话授权持续有效，不逐次重新索取。超出原范围或尚无授权时先澄清。若继续生成 Actor，再执行 Actor 验证和来源语义核对。

## 完成标准

- 错误、歧义和不支持内容没有被降级隐藏。
- 同一 accepted 中间结果可确定性重现，resume 不破坏审计信息。
- 真实样例的来源语义与 source-scoped chain 由人工复核，而不是只确认 provider/JSON 返回成功。
