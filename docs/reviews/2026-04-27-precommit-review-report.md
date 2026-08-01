# 2026-04-27 Precommit Review Report

**结论**
通过。

阻塞项 `ItemAiNormalizer` abort timer 泄漏已修复并验证。NPC/monster parser 稳定化、item AI normalizer 网络隔离、文档更新和 CLI 生成物检查均已覆盖。

**阻塞问题**
无。

已修复的问题：

- `src/core/ingest/item-ai-normalizer.ts:88-118`：HTTP request throw/reject 时 abort timer 现在会通过 `finally` 清理，不再让进程挂到 `timeoutMs`。
- `tests/core/ingest/item-ai-normalizer.test.ts:135-161`：新增 throw 路径 timer cleanup 断言，防止回归。

**非阻塞风险**
- `README.md:265-269`：Markdown-only 文案说写入 `vault/middle`，示例仍传 `--emit-dir "obsidian/dnd数据转fvttjson/input"`。代码实际通过 `dirname(emitDir)/middle` 写入 `middle`，行为正确，但示例对用户不直观。建议后续把示例改成更明确的 vault/input -> vault/middle 说明，或更新 CLI option 描述。
- `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`：CLI 重生成后的 diff 主要是 activity/effect id 和 timestamp churn。它可证明走过 CLI，但作为提交内容噪音较大。建议默认不提交，除非本轮需要保留生成物证据。
- 当前工作区仍包含多个计划文档和 fixture 的未跟踪文件。提交前需要按 commit 边界显式 stage，避免误把 review handoff 或生成物混入功能提交。

**验证结果**
- focused parser tests: `bun test src/core/parser/__tests__/action.test.ts src/core/parser/__tests__/yaml.test.ts`，`11 pass / 0 fail`
- focused item normalizer tests: `bun test tests/core/ingest/item-ai-normalizer.test.ts`，`9 pass / 0 fail`
- NPC/monster regression: `bun test tests/e2e.test.ts src/core/generator/__tests__/phase1-validation.test.ts src/core/parser/__tests__/yaml.test.ts src/core/parser/__tests__/action.test.ts src/core/ingest/__tests__/plaintext.test.ts src/core/workflow/__tests__/plainTextActor.test.ts tests/cli-plaintext-actors.test.ts`，`49 pass / 0 fail`
- full bun test: `bun test`，`334 pass / 0 fail`
- CLI regeneration: `bun run src/index.ts "obsidian/dnd数据转fvttjson/input/slithering-bloodfin__滑行血鳍.md" -o "obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json"`，成功，`Validation passed`，`Items: 9`
- manual source-vs-output check: 通过。输出 actor 与源 Markdown 匹配：`滑行血鳍 (Slithering Bloodfin)`、`type=npc`、`hp=143`、`ac=16 natural`、`blindsight=100`、`cr=9`、9 个 item 名称均对应源 Markdown。
- timer leak repro: 修复前 2s timeout repro 约 `2068ms` 退出；修复后约 `45ms` 退出。
- diff hygiene: `git diff --check -- src/core/ingest/item-ai-normalizer.ts tests/core/ingest/item-ai-normalizer.test.ts` 无 whitespace error，仅有既存 LF/CRLF 警告。

**提交建议**
- Commit 1: NPC/monster parser and workflow documentation
  - `src/core/parser/action.ts`
  - `src/core/parser/yaml.ts`
  - `src/core/parser/__tests__/action.test.ts`
  - `src/core/parser/__tests__/yaml.test.ts`
  - `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`
  - `README.md`
  - `docs/manual.md`
  - `AGENTS.md`
  - corresponding internal agent plan (kept local-only after the public-repository cleanup)
- Commit 2: item AI normalizer test isolation and timer cleanup
  - `src/core/ingest/item-ai-normalizer.ts`
  - `tests/core/ingest/item-ai-normalizer.test.ts`
  - corresponding internal network-isolation plan (kept local-only)
- Review artifacts:
  - internal pre-commit handoff (kept local-only)
  - `docs/reviews/2026-04-27-precommit-review-report.md`
  - 建议作为单独 docs/review commit，或在用户明确要保留审查过程时并入第一组 docs 提交。
- Generated Actor JSON:
  - `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`
  - 建议默认 left unstaged。原因：本次 diff 主要是随机 id/timestamp churn，行为正确性已由 CLI regeneration、manual check、acceptance tests 覆盖。

**下一步**
可以按上面的两个功能提交分组进行 staging；如果要保持历史干净，先不要 stage regenerated `slithering-bloodfin` JSON，除非你决定把它作为本轮 CLI 证据提交。
