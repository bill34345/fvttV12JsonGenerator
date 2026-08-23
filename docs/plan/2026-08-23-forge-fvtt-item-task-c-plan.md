# Forge FVTT Task C：世界 Item create-only 垂直闭环

## 目标与基线

- Goal objective：完成 Forge FVTT Task C 的 bounded Item create-only 垂直闭环：从 `codex/forge-fvtt-product@e9a9cc0` 创建独立 WorkTree，完成 Item protocol、browser runtime、Foundry UI、世界 Item 创建/readback、自动门禁、独立 Code Review 修复和 Luna Max 定向 E2E 证据闭环；未经授权不 commit、push、merge 或清理 WorkTree。
- 基线：`e9a9cc0fa5e69e5225c910d3fae3dd4121c2d0ee`。
- WorkTree：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260823-194627-forge-fvtt-item-task-c`。
- 分支：`codex/20260823-194627-forge-fvtt-item-task-c`。
- 用户明确选择方案 1：不修改 HIGH-risk `ItemParser.parse()`；新增 Item 专属公开解析入口，严格验证 `item:v1:` 身份后委托现有 parser。

## 不变量

- Protocol 保持 v1；Actor capability、request、response、`actor:v1:` validator 和世界 Actor 流程保持 wire/行为兼容。
- Item 使用独立 `item:v1:` UUID v4 身份、独立 decoder、独立 result union 和独立 world adapter。
- 最终 Item source 先检查 whitespace 与 UTF-8 200000-byte 上限；超限不得 hash 或 parse；之后才验证身份和 hash，且 parser/generator/verifier 使用同一字符串。
- 只接受一个最终 Item artifact；多 stage 必须 `needs_review`，无 `artifactHash`，不可创建。
- Forge-only artifact 投影消除非语义时间戳并确定性重键 Item/Activity/Effect 及 linkage；CLI/Web 输出不得变化。
- 世界写入只使用 Foundry Document API；不编辑 LevelDB。确定性 Document ID 来源于 `sourceId`，完整 artifact/flags 一次 create，随后 `toObject()` readback。
- 不 commit、push、merge、stash、备份或清理 WorkTree。

## 实现与验证映射

| 范围 | 实现 | 机械门禁 | 语义验收 |
|---|---|---|---|
| Item 身份/协议 | contracts、forge-gateway-protocol | strict decoder、unknown key、byte/hash/status matrix、Actor 回归 | Actor ID 不接收 Item；Item 不接收 Actor/非法/替换身份 |
| Browser runtime | parser Forge Item entry、item generation、deterministic projection | v12/v13/v14 conformance、Node/browser parity、重复生成、forbidden imports | Shield 完整语义；三祷之坠多 stage 阻断 |
| Foundry UI | 独立 Forge Item ApplicationV2/template/state | lifecycle、stale race、动态 target/GM gate、提交锁定 | preview 只对应当前 source snapshot；不安全结果不可创建 |
| 世界 Item | 独立 adapter | repeat/concurrent/conflict/collision/readback/cleanup tests | source/hash/target/flags 与 Item 完整来源相关投影 readback 一致；Actor 数量不变 |

## 当前证据与剩余门禁

- `ItemParser.parse()` upstream impact 为 HIGH；按用户选择的方案 1 避开。Task C 实际既有符号影响分析均为 LOW；任何后续 HIGH/CRITICAL 结果仍立即停止。
- 锁定依赖安装完成；GitNexus 已刷新。`bun run typecheck:packages` 当前通过。
- 当前真实 Shield browser runtime 已返回 accepted、零诊断、正式 verifier accepted；间隔生成完整 response 和 artifact hash 相同。三祷之坠返回 needs_review 且无 artifact/hash。
- 待完成：协议/runtime/module 专项测试，Foundry Item UI/world adapter，全部仓库门禁，父 Sol Shield 人工语义核对，独立 Sol Code Review，Review 修复，以及 Luna Max 本地 Foundry E2E 与精确清理证据。

## 停止与交接

- browser/Node 不一致、CLI/Web 输出变化、正式 Shield workflow 失败、多 stage 只能静默取首项、Actor 回归、readback 无法保真、需要复制 parser/generator/verifier 规则、GitNexus HIGH/CRITICAL、或范围扩展到生产/LevelDB/embedded Item/AI Intake/任意 Item 时立即停止。
- 机械与父任务语义证据完成后，Goal 保持 active，交给独立 GPT-5.6 Sol 只读 Code Review；无阻塞 P1 后才创建独立 Luna Max E2E 任务。
- 只有代码、适用门禁、独立 Review、真实 Foundry E2E、动态 UI 证据与精确清理全部核实，才将 Goal 标记 complete。
