# FVTT JSON Forge module

## 用途与范围

This module contains parallel Foundry 14 GM-facing Actor, bounded world Item, and explicitly reviewed encounter-package create-only workflows. It may call the public browser runtime and Foundry Document APIs only.

- Do not import Node/Bun modules, read local files, or edit LevelDB.
- Enforce GM authority and the exact supported pairs Foundry 14.364 or 14.368 / dnd5e 5.3.3 before generation and creation.
- AI Actor 生成中的内容错误只作提示，不阻断最后生成；能投影的 AI 字段照常生成，活动转换失败时通过正式 renderer／workflow 保留完整动作文字。生成、来源核对与实际录入的结论分别记录，GM采用不把 `needs_review`／`failed` 改成 `accepted`。提示放在 Forge 的结果、完成页和批量记录中，不写入 Actor 或角色 JSON。依据为[用户原话与当前进度](../../docs/plans/2026-10-20-forge-ab-current-state.md)。GM、目标、来源身份和既有文档归属仍在写入前核对；Item入口保持独立契约。
- Reviewed encounter packages regenerate Actor sources through the formal browser workflow and retain usable candidates, full source and review findings. Missing companion coverage remains visible for GM handling; a candidate does not claim automated coverage. Package structure, source/artifact identity and valid macro bindings still gate import, and GM confirmation is required. Importing a candidate never enables its macros or promotes historical Review Bundles.
- Human Markdown encounter generation uses source-scoped Monster Intake IR validation, deterministic rendering and formal generation for every discovered Actor, then extracts and reviews a closed version-2 capability configuration. AI never writes executable code. The tool compiles a fixed module entry; unsupported rules remain explicit. Creation and first enablement require the GM action; enabled, identity-checked fixed configurations resume after refresh, without executing stored arbitrary commands. Caller cancellation, stale-source rejection, secret-free reports and the shared AI job gate apply to this entry too.
- Encounter imports store macros without executing them; startup is a separate GM action with command-hash and binding checks. Deterministic package Document IDs, full conflict preflight, semantic readback and owned-document cleanup are mandatory; uploaded content-addressed assets may remain for retry after failure.
- Actor 创建使用完整生成产物与 Forge 身份，并读回实际保存结果。内容字段不一致时保留角色，把具体对象、生成值与保存差异显示在 Forge；身份错误仍只清理本次错误创建的文档。提交前可取消，写入／读回期间不可取消；提交后页面崩溃可能留下已创建的角色。Item创建与读回保持自身契约。
- Each workflow derives its deterministic world Document ID from its type-specific `sourceId`, so concurrent windows cannot create different artifacts for the same source identity. Item operations must not change the world Actor count.
- API keys are client-local browser settings and must never enter world data, logs, diagnostics, or Forge responses.

## 验证与验收

- Select existing checks for the changed Forge behavior: source extraction/generation, candidate access and recovery, review/GM confirmation, creation and readback. Apply type/bundle/manifest checks and the relevant Actor or Item runtime path when affected; valid prior evidence is reusable. Documentation-only changes check meaning, references and generated consistency.
- AI功能验收：本worktree按用户“AI这步依然需要测试”“以后这类测试AI这步不要绕开”的要求包含真实AI处理，提示词检查与优化属于本worktree；[原话、当前授权与结果](../../docs/plans/2026-10-20-forge-ab-current-state.md)。固定回复用于程序检查，不替代这类功能验收的真实AI步骤；本批新回复的后续复验须说明与真实调用的关联及分段边界，付费范围沿用任务授权。
- Resolver owns spell source selection, owned cache, Cast parameters/resources and its adaptations. After those handoff responsibilities are proved, system/third-party spell movement, attacks, concentration and expiry do not automatically become Forge completion requirements. Continue into them for an affected Forge/Resolver change, an observed failure or an explicit independent user acceptance goal.
- Use the existing [check selection and failure layers](../../docs/runbooks/development-feedback-loop.md#本批先选范围再运行前置检查); keep unresolved findings and non-blocking unverified limits distinct from current required work. Check independent fixture IDs and the relevant visibility/submission preconditions before writes, and stop when the selected evidence is sufficient. No separate per-action report is required.

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.
