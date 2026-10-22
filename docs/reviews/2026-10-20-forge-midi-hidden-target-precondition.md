# Forge 本地验收：Midi 隐藏目标前置与后续异常

日期：2026-10-20。范围为当前 Forge 新契约的本地 Company/Vampire 验收；不修改外部模块、全局设置、系统版本或生产。业务进度仍以[当前 MD](../plans/2026-10-20-forge-ab-current-state.md)为唯一入口。

## 分层结论

**VERIFIED：本地精确代码的目标过滤。** 当前环境 Core14.368 / dnd5e5.3.3 / Midi14.0.11 / Automated Conditions5e14.533.8。Midi 的 `isValidTarget` 会拒绝 `hidden=true`，不因 GM 已选中而豁免。`validTargetTokens` 再次筛选 workflow targets，并把筛选结果写回 user targets。因此目标设置 API 的 applied 回执不能证明后续使用有有效目标。

本轮两个新测试 Token 初始被设置为隐藏。Company 通用 Utility 已实际掷出1d20+10且无自动伤害；独立 Damage 在无 Token 阶段失败，补隐藏 Token、设置精确目标后仍报 `midi-qol.noTargets`。这是测试前置的错误，不能据此宣称 Forge 的 Damage 投影损坏；也不能通过放宽来源或目标校验使其通过。选择的反证实验是只将本任务的确切目标 Token 改为可见，保留来源、Actor、Activity、模块和全部设置，再正常使用；不得修改其他用户对象。

**VERIFIED：单变量实机结果。** 只将确切owned目标Token的hidden改为false，同一Company Actor/Activity、目标位置、候选和全部模块设置保持，原生独立Damage成功掷出10d8+4=53；HP/资源未变。随后Bite攻击和两类伤害也成功，刷新持久化通过。这确认本轮有效目标前置；未修改第三方代码，也不把该结果推广为任意目标/版本通用修复。

**UNKNOWN：后续数据库 `_id` 异常的完整因果。** 原生错误为 `ServerDatabaseBackend._updateDocuments` 读取 undefined 的 `_id`。本地 Core 的对应位置是顶层文档 `getMany(ids)` 后读取返回文档 ID，并不证明输入 JSON 没有 `_id`。Midi 拒绝后的退款/聊天卡清理是候选解释，但尚无实际 documentName/ID 证明，不据此修第三方代码或改 Forge 最终数据。原错误和原生零伤害/HP资源未变证据继续保存。

## 精确本地来源

安装文件 `F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules\midi-qol\midi-qol.js`，SHA-256 `ca530b51fc4883067c5571f1d985931087c09bb21887f9a24c3ab95d48f3a966`，随附 source map：

| 机制 | bundle / 原始源位置 |
| --- | --- |
| `isValidTarget` 排除 hidden、secret、neverTarget、group及无Actor | bundle约19958；utils.ts 8400–8412 |
| `validTargetTokens` | bundle约17305；utils.ts 4559–4563 |
| setupTargets筛选并更新用户目标 | bundle约8240；MidiActivityMixin.ts 1428–1485 |
| Damage使用后无目标检查 | bundle约8435–8465；MidiActivityMixin.ts 1660–1706 |

Source Token 的查找路径与目标筛选不同：`tokensForActor` 优先 synthetic Actor 的原 Token，否则找 active tokens并优先controlled；该处没有相同hidden过滤。故先只改变目标的可见性，而非同时修改Source Token、模块开关或多个规则。

AC5E `scripts/ac5e-systemRules.mjs:38–40` 也有附近目标的 includeHidden 过滤，但没有本轮调用证据指向它；Midi 的确切过滤已足以解释当前现象。上游 v14 分支已前进到其他版本周期，不能把当前分支源码当作14.0.11；以安装 bundle/map 为准。

## 一手材料、反证与限制

- [Midi issue #446](https://gitlab.com/tposney/midi-qol/-/issues/446)：作者报告模板看似选中了目标，最终没有有效目标，并报告停用其他模块仍复现。原文支持区分“显示选中”和“实际workflow目标”；它是旧版锥形/方形模板案例，没有证明本轮隐藏目标或同版缺陷。跟帖未完整取得，notes API提取失败，不补造解决结论。
- [Midi issue #401](https://gitlab.com/tposney/midi-qol/-/issues/401)：旧Core0.8.7/0.8.8、系统1.3.5/1.3.6、Midi0.8.25的伤害报告，版本差距过大，不用作当前修复依据。
- [维护者 MR !121](https://gitlab.com/tposney/midi-qol/-/merge_requests/121)：v11时期的undefined ID修复涉及ATV cover Map/coverValue，路径不同，不能直接解释本次数据库异常。
- [上游源文件入口](https://gitlab.com/tposney/midi-qol/-/blob/v14/src/module/utils.ts)仅作导航；本地精确代码决定本轮条件。

这些材料没有建立同版缺陷或通用修复共识。改变本轮判断的证据来自安装代码中的明确hidden过滤，外部报告只是校准选中回执与实际目标之间的证据边界。

## 待判断本地化与复查

待判断本地化：无新增模块候选，不迁移或修改Midi/AC5E功能。本项目可在用户说明中准确提示当前组合需要有效且可目标化的目标，不为外部模块自动禁用校验。

复查步骤：核对实际bundle版本/hash → 保留完整Actor/Activity和失败原件 → 只改变任务目标hidden状态 → 记录原生伤害与Token/世界Actor资源 → 仅在同一异常仍复现时取得实际数据库documentName/ID及新的调用证据。新版本、其他模块组合和生产另验；通过的原生导入与Utility结果不因这层调查被撤销。
