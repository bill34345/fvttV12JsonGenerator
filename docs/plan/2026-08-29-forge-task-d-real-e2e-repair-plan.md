# Forge Task D 真实 E2E 语义失败定向修复计划

日期：2026-08-29

本计划是 `2026-08-24-forge-fvtt-intake-task-d-plan.md` 与 `2026-08-25-forge-fvtt-ai-provider-connections-plan.md` 的短修复增补，只处理 2026-08-28 真实 DeepSeek E2E 已证明的 Monster/Item Intake 阻断。accepted-only、fail-closed、Forge Protocol v1、世界写入适配器与凭据边界保持不变。

## 已证明的失败

- Monster 的真实 Responses 请求已完成，但 provider 可漂移 `source.length`、返回无语义的空 `spellcasting: []`，或给非 prepared spellcasting 添加无证据的 `casterLevel`。
- Lurker 的 Multiattack 被错误结构化为来源没有的攻击自动化；AI Review 正确阻断。
- AI Item 的 discover/extract 已完成，但顶层结构通过后，畸形的嵌套 ability 使归一化抛错，UI 只能显示笼统的 `ANALYSIS_PROVIDER_FAILURE`，无法进入 deterministic validation/repair。
- 2026-08-29 复验中 Lurker 的真实 discover/extract 与 Responses 终态均完成；旧阻断未复现，但 provider 返回了存在且非对象的可选 `legendary`，触发 `INVALID_LEGENDARY_METADATA`。
- 浏览器长请求、DeepSeek Responses、GM/非 GM、零世界写入和 Key 清理已经通过，不在本计划重复修改。

## 修复范围

1. Monster provider normalization 把 request-owned source hash/UTF-16 length 恢复为真实输入值。
2. 仅在来源没有 spellcasting 语义时省略空 spellcasting；非 prepared group 删除不适用的 caster-level 字段。
3. 对 Multiattack 聚合动作移除 provider 虚构的 attack automation，保留完整 description 并降为 utility/damage；实际的显式攻击条目不变。
4. Item normalization 对不可信嵌套结构保持 total：不抛异常，把畸形字段交给 validator 生成精确 blocking findings，从而允许 bounded repair。
5. 仅当来源完全没有 `Legendary Actions` / `传奇动作` 语义时删除 provider 的 `legendary` 占位；来源确有传奇语义时仍由 validator 阻断非对象或不完整 metadata。
6. 补充真实失败形态的 focused regressions，并验证 Node/browser 两条调用链。

## 完成标准

- `SOURCE_LENGTH_MISMATCH`、无语义空 spellcasting、innate caster-level 漂移和 Multiattack 虚构自动化均有定向回归。
- 畸形 Item ability 不再变成笼统 provider failure，而是稳定进入 `needs_review`/deterministic findings；不允许畸形 IR accepted。
- focused tests、packages/foundry typecheck、architecture、Forge tests/build、secret scan 与 `git diff --check` 通过。
- 本轮不调用真实 Provider、不写世界；修复完成后由新的独立 Luna Max task 执行真实 E2E。
