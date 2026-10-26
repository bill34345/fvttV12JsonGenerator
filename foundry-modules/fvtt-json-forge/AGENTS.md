# FVTT JSON Forge module

## 用途与范围

- 面向用户统一称“生物生成”；生成本体和能力关联的召唤生物／物件属于同一目标，不再以“普通Actor”和“encounter package／战斗包”解释成两类功能。当前入口文案为“生物与召唤物”，交付称“生物导入文件”；旧协议ID、代码符号、记录键和文件扩展名仅作兼容标识。用户原话及命名边界见[当前决定](../../docs/plans/2026-10-20-forge-ab-current-state.md)。

This module provides Foundry 14 GM-facing creature generation including associated summons, bounded world Item generation, and reviewed create-only imports. It may call the public browser runtime and Foundry Document APIs only.

- Do not import Node/Bun modules, read local files, or edit LevelDB.
- Enforce GM authority and the exact supported pairs Foundry 14.364 or 14.368 / dnd5e 5.3.3 before generation and creation.
- AI Actor生成由AI理解内容；程序默认只验闭合结构、支持组合、身份与引用，以及IR、Markdown、JSON和实际保存结果的保真。不再从原文判遗漏、核规则语义或补写覆盖数据；生物本体和关联召唤物统一复用完整IR入口。AI不确定、结构及转换／保存差异保留具体提示，候选、检查与GM采用分别记录。旧SourceAudit仅显式离线运行。用户于2026-10-25明确暂时关闭Forge的AI内容复核，后续开发和测试均不启用；AI提取、程序检查和GM人工核对继续。GM、目标、来源身份和文档归属继续在写前核对，Item契约独立。用户原话与实施边界见[当前状态](../../docs/plans/2026-10-20-forge-ab-current-state.md)。
- Reviewed creature/summon import files regenerate Actor sources through the formal browser workflow and retain usable candidates, full source and review findings. Missing companion coverage remains visible for GM handling; a candidate does not claim automated coverage. Package structure, source/artifact identity and valid macro bindings still gate import, and GM confirmation is required. Importing a candidate never enables its macros or promotes historical Review Bundles.
- Human Markdown creature generation uses source-identity-bound Monster Intake structure and projection validation, deterministic rendering and formal generation for every discovered Actor, then extracts and reviews a closed version-2 capability configuration. AI never writes executable code. The tool compiles a fixed module entry; unsupported rules remain explicit. Creation and first enablement require the GM action; enabled, identity-checked fixed configurations resume after refresh, without executing stored arbitrary commands. Caller cancellation, stale-source rejection, secret-free reports and the shared AI job gate apply to this entry too.
- Creature/summon imports store macros without executing them; startup is a separate GM action with command-hash and binding checks. Deterministic package Document IDs, full conflict preflight, semantic readback and owned-document cleanup are mandatory; uploaded content-addressed assets may remain for retry after failure.
- Actor 创建使用完整生成产物与 Forge 身份，并读回实际保存结果。内容字段不一致时保留角色，把具体对象、生成值与保存差异显示在 Forge；身份错误仍只清理本次错误创建的文档。提交前可取消，写入／读回期间不可取消；提交后页面崩溃可能留下已创建的角色。Item创建与读回保持自身契约。
- Each workflow derives its deterministic world Document ID from its type-specific `sourceId`, so concurrent windows cannot create different artifacts for the same source identity. Item operations must not change the world Actor count.
- API keys are client-local browser settings and must never enter world data, logs, diagnostics, or Forge responses.

## 验证与验收

- 新批次或新聊天先读[唯一当前状态](../../docs/plans/2026-10-20-forge-ab-current-state.md)。按新版生成流程和新来源验证实际结果；历史旧流程测试失败记录已退役，不作为当前待办或恢复旧流程的依据。原始证据仅用于按版本追溯。

- Select existing checks for the changed Forge behavior: source extraction/generation, candidate access and recovery, review/GM confirmation, creation and readback. Apply type/bundle/manifest checks and the relevant Actor or Item runtime path when affected; valid prior evidence is reusable. Documentation-only changes check meaning, references and generated consistency.
- AI功能验收：本worktree按用户“AI这步依然需要测试”“以后这类测试AI这步不要绕开”的要求包含真实AI处理，提示词检查与优化属于本worktree；[原话、当前授权与结果](../../docs/plans/2026-10-20-forge-ab-current-state.md)。固定回复用于程序检查，不替代这类功能验收的真实AI步骤；本批新回复的后续复验须说明与真实调用的关联及分段边界，付费范围沿用任务授权。
- Resolver owns spell source selection, owned cache, Cast parameters/resources and its adaptations. After those handoff responsibilities are proved, system/third-party spell movement, attacks, concentration and expiry do not automatically become Forge completion requirements. Continue into them for an affected Forge/Resolver change, an observed failure or an explicit independent user acceptance goal.
- Use the existing [check selection and failure layers](../../docs/runbooks/development-feedback-loop.md#本批先选范围再运行前置检查); keep unresolved findings and non-blocking unverified limits distinct from current required work. Check independent fixture IDs and the relevant visibility/submission preconditions before writes, and stop when the selected evidence is sufficient. No separate per-action report is required.

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.
