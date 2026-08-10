# Markdown / YAML 解析器规则

## 这个功能是做什么的

本目录把中文 YAML/Markdown、英文 bestiary 文本和结构化动作内容解析为中立领域模型。它负责忠实理解来源，不负责直接写 Foundry Actor JSON。

## 不可违反的规则

- 每个解析规则必须是 `schema-derived`、`source-derived`、`corpus-derived` 或用户批准并在调用处记录的 `explicit-exception`。
- 不得仅凭怪物名、动作名或当前 fixture 猜测伤害、DC、属性、次数、恢复方式、条件或自动化效果。
- parser bug 必须有 fixture-backed 回归测试；至少包含应命中的多个样例和一个接近但不应命中的反例。
- 输入信息含糊时保留原文或输出需要复核的中立结果，不得为了让当前 JSON 看起来完整而编造机制。
- 支持的 Markdown/YAML/结构化文本格式必须对既有来源保真；LF 与 CRLF 的等价输入应解析出相同领域含义，且行尾规范化不得改变可追溯原文或把格式差异误判为规则差异。
- 单语来源无需翻译才可解析，已有双语内容也不得被解析器压缩成单一语言或擅自建立翻译对应。
- 普通 parser 不因正常格式、语言或行尾处理而自行施加 `needs_review` 状态；它只保留字面值、诊断或中立含义。只有明确的 Intake/工作流状态 gate 才决定是否可推广。
- parser 只输出领域含义；Foundry/dnd5e 版本投影属于 `packages/generation`。

## 修改入口

- 公共出口：`packages/parser/src/index.ts`。
- 中文、英文、Item、资源与行为语义分别在同目录对应文件中维护。
- `src/core/parser` 是兼容层；新实现优先放在本 package，兼容层保持薄转发。

## 验证

- `bun run typecheck:packages`
- `bun test src/core/parser/__tests__ --max-concurrency 4`
- `bun run audit:anti-overfit`
- 对格式支持或文本切分的改动，增加 LF 与 CRLF 的等价 fixture，并覆盖单语和已有双语样例。
- 若解析变化影响最终 Actor/Item，继续运行正式 workflow、`bun run verify:actor <source.md> <output.json>`，并人工对照来源。

## 完成标准

- fixture 证明规则可泛化且不会误伤接近反例。
- 真实来源中的数值、条件、选择和限定语义被保真解析。
- 格式和语言的正常差异不会改变解析出的领域含义或制造虚假的 review 状态。
- 最终 JSON 受影响时，生成结果已重新验收；仅 parser 单测通过不算完成。
