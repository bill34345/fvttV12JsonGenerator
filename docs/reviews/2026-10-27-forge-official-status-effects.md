# Forge 官方状态 Effect 与 Activity 关联源码复核

日期：2026-10-27。范围：当前 Forge worktree `20261019-forge-ab-fixed-replies`，基线提交 `0da71b24086722660c4b67e88dbffeb5bfc8faa7` 及本轮开始时的未提交改动；固定上游 Aioros、AI Monster Importer 与本机锁定 dnd5e 5.3.3 源码。本文是源码研究和实施依据，不是功能已完成或运行时已通过的记录。

本轮只拥有本文档；没有修改产品、测试、模型回复或世界数据，没有模型请求、测试执行、浏览器操作、Foundry 操作、提交、合并或推送。此前固定源码证据按其不可变提交复用。以下本地行号指本次读取的实现位置，实施后以函数和最终 diff 为准。

## 结论与本轮目标

攻击命中或豁免失败附加的官方状态，应生成 Item 内的 `transfer:false` Active Effect，并在对应 Activity 的 `effects` 中引用它。DM 可以使用 dnd5e 自带聊天卡片逐个选择 Effect 并应用到选定目标，不需要手工新建 Effect。创建模板、提供应用按钮与实现完整触发/解除自动化是三件事；复杂期限、HP 降到 0 的前提、逃脱和后续豁免不能成为删除模板的理由，也不能被伪装成普通命中就自动应用。

现有共用生成器已经有 Effect 构造、图标、稳定 ID、持续时间和关联代码。应复用这些实现并修正作用范围，不另建状态框架，不增加外部模块依赖。

## 锁定 dnd5e 5.3.3 的实际行为

本机源码：`F:/FoundryLab/reference-cache/dnd5e/5.3.3/repo`；只读 `git rev-parse HEAD` 为 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，与 tracked reference manifest 一致。

| 事项 | 精确源码 | 可据此得出的结论 |
| --- | --- | --- |
| Activity 引用同 Item 的 Effect | `module/data/activity/fields/applied-effect-field.mjs:6-32`：`_id` 是 DocumentId，`effect` getter 读取 `item.effects.get(this._id)` | 不需要另建世界 Effect；Item 内模板加 Activity 引用即可。 |
| 豁免失败关联 | `module/data/activity/save-data.mjs:20-29`、`_types.mjs:148-150`：Save 的 AppliedEffectField 额外定义 `onSave`；含义是成功豁免时是否仍应用 | 失败附加状态使用 `{_id, onSave:false}`；Attack 的基础字段不带 `onSave`，不能把这个字段写到所有类型上。 |
| Activity 当前可用 Effects | `module/data/activity/base-activity.mjs:135-139`：从关联 Effect 按等级限制过滤；`module/documents/activity/mixin.mjs:718-721` 写入聊天消息 Effects | 引用必须指向实际存在的 Item Effect；HP0 等规则不是这里内建的触发条件。 |
| 聊天卡片显示 | `templates/chat/usage-card.hbs:4-9` 渲染 `effect-application`；`module/applications/components/effect-application.mjs:118-138` 为每个 Effect 创建独立 Apply 按钮 | 多个 Effect 可以逐项点击；不要求先去编辑器新建它们。 |
| 选择目标并应用 | `effect-application.mjs:228-239` 只处理已勾选的目标；`:182-219` 将模板复制成目标 Actor 上的非 transfer Effect，并记录 origin/dependentOn | 这是 DM 的手动应用入口；单纯把模板关联到 Activity 并不实现任意来源条件的自动判定。 |
| 编辑器中的选择 | `module/applications/activity/activity-sheet.mjs:266-285` 读取 Item Effects 和已关联 ID | 所生成的模板也是原生活动编辑器可以选择的对象。 |

固定官方源码链接：[AppliedEffectField](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/activity/fields/applied-effect-field.mjs#L6-L32)、[Save schema](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/activity/save-data.mjs#L20-L29)、[原生应用控件](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/applications/components/effect-application.mjs#L118-L138)。本轮没有进行真实点击验收；以上是精确版本静态证据。

## 旧 CLI 共用代码中可直接复用的实现

旧 CLI 与 Forge 已使用同一 `packages/generation` owner；所谓复用应落实在当前 owner，不在旧 `src/` 兼容层再写一份。

| 已有实现 | 本次读取位置 | 复用方式与边界 |
| --- | --- | --- |
| `generateEnhancedConditionEffects` | `packages/generation/src/actor-effects.ts:487-656`，当前普通动作调用在 `actor.ts:1639-1641` | 复用稳定 ID、双语名、`type:'base'`、`statuses`、`transfer:false`、图标和非 transfer 模板形状。不要照搬它对每个 Activity 一律添加同一 Effect 的循环；本轮必须按命中/失败/后续分支关联。 |
| `statusIconPath` | `actor-effects.ts:206-212` | 官方状态使用系统现有图标路径，不需要另取图或新模块。 |
| `simpleConditionDuration` | `actor-effects.ts:18-24` | 已明确的纯数值轮/分钟/小时/天可写 `rounds` 或 `seconds`。无明确期限保持空时钟；“直到挣脱”“下回合结束”“再次豁免成功结束”保留原文，不编造倒计时。 |
| `attachEmbeddedEffects` | `actor-item-builder.ts:296-417`，持续时间构造在 `:419-430` | 复用嵌入 Effect 的构造、来源描述、已有同状态对象复用及关联格式。`:404-415` 当前给全部 Activity 关联；应按明确的承载 Activity 使用，不能把HP0失败状态连到初始攻击。 |
| 已有 SourceOperation 失败状态模板 | `actor.ts:1185-1190` | 当前已创建 `statuses:[status]` 与来源描述，并加 `{_id,onSave:false}`。可提炼为本轮有复用价值的共享状态模板构造；不能继续仅允许无期限、无条件状态。 |
| 已有平铺 `nativeFailureStatuses` | `actor.ts:1251-1253` | 构造形状可复用；目前取第一个 Activity，应明确选 Save，避免把失败状态错连到 Attack。 |
| 已有 GM 后续 Save | `actor.ts:1279-1294` | `gmTriggeredSave` 生成独立 Save；`activation.condition`、range、target special 保留触发前提，自己的失败 Effect 只连接该 Save。可复用这一模式保留后续依赖。 |
| `conditionalAttackSaveTrigger` | `save-outcome.ts:55-65`；`actor.ts:1386-1412` 分离延迟状态 | 已有一条明确的英文 2024 HP0后置豁免识别。复用其已验证模式和删除错误 Attack 关联的目的；不把它声称为所有语言/任意HP0语法覆盖。已有 `saveCondition` 或 SourceOperation 条件直接使用，不应再靠宽泛状态词猜触发。 |
| `buildConditionTemplateFlag` | `actor-effects.ts:349-353` | 这是项目自定义条件实例标记。普通官方状态只需原生 `statuses`，不应为它们新增自定义条件模块依赖。 |

## 当前会让官方状态没有可选模板的处理

这些是本次读取时的现状；实施者应将行为改成保留模板、保存限定并关联正确 Activity。

1. `packages/models/src/sourceInput.ts:96-99`：非 Save 的 `failureStatuses` 被移到 retained 字段后删除。攻击与伤害确实保住了，但DM仍要手建状态；新目标要求把已声明的命中状态转换成模板和对应链接，不能仅留说明。
2. `packages/models/src/sourceRuleFacts.ts:11-58` 的 `sourceFailedSaveStatuses`：只允许直接、无条件、无期限的失败状态；`for`、`until`、repeat等会返回空列表。这种“不给模板”的条件必须与“不能自动管理期限”拆开。状态模板仍生成，结束条件保留给DM。
3. `actor.ts:1065-1074`：literal 输入中带 `escapeDc`、`staged`、`condition` 或非数值期限的状态被排除在 nativeEffects 之外；`:1113-1124` 只记 ledger 和说明。新目标应保留这些状态模板；限定文字必须进入模板描述和对应活动，分支不能互相绕过。
4. `actor-effects.ts:97-134` 的 `enforceCoreConditionLifecycles`：将复杂生命周期状态从 Effects 与 Activity.links 中移除，换成GM文字。这个后处理不能再删除可选模板；应保留模板并标明原生时钟没有实现的部分。共享 Effect 的不同期限可拆成独立来源/分支模板，不能再因此抛出全局失败。
5. `verification.ts:529-554`：当前把复杂生命周期正确结果定义成“ledger齐全且不存在对应原生状态Effect”。本轮需要同步为检查模板存在、关联存在且正确、来源限定与期限未丢；否则正确交付的模板会再次被判错。
6. `extractExplicitlyInflictedStatuses` 在 `actor-effects.ts:220-223` 对分阶段豁免直接返回空数组。这能避免把后续石化误当首次失败，但不应导致各阶段都没有模板。应该让每个阶段保留各自模板/后续活动或清楚的DM应用入口。

不应删除识别免疫、已有状态、解除状态与受影响对象的语义区分。例如“对中毒免疫”不能生成使目标中毒的模板；HP0后续失败不能成为普通攻击命中状态。这些限制约束的是模板的含义和关联，不是整只Actor能否交付。

## 固定上游 Aioros 可采用的状态构造

已实际读取固定提交 `98f5bd9bf3a18b3cb50429f1bef6b735de32271e`。该提交模块版本2.4.0，manifest verified Foundry14.368 / dnd5e6.0.5；本项目5.3.3字段仍以上方本机锁定源码为准。

- `scripts/sbiParser.js:732-745` 同时提取 `attack.condition` 与 `save.condition`。说明攻击直接附状态可以正常表达，无需本项目“状态只能在Save上”限制。
- `scripts/sbiActor.js:335-349` 构造 `transfer:false`、`type:'base'`、`statuses:[condition]` 的嵌入 Effect。
- `:380-382` 为攻击关联 `{_id}`；`:392-394` 为豁免关联 `{_id,onSave:false}`。这部分字段及作用域可以直接适配到现有 owner。
- 它没有据此实现复杂期限、HP0前提、再次豁免、依赖另一个状态的全部生命周期。它还用 `attack.condition || save.condition` 选一个条件，不能原样拿来覆盖同Item多个不同结果分支。

固定链接：[解析](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiParser.js#L732-L745)、[构造与关联](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiActor.js#L335-L399)、[manifest](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/module.json)。

此前实际读取的[用户issue65](https://github.com/Aioros/5e-statblock-importer/issues/65)要求未解析内容可见、原始statblock保留，当前原始记录为open且无评论；它不是这些复杂机制已经自动化的证据。

## AI Monster Importer 的边界

固定提交 `7381ed0c34a63020cb870be93d041435e7ab12d1`，模块1.0.9，verified Foundry11.313 / dnd5e2.1.5，maximum Core12。

其 `Foundry5eItemFormatter.ts:203-205` 的 `effects` getter 直接返回 `[]`；`Parsed5eItemParser.ts:90,120,160` 也以空Effects覆盖。它对本轮官方状态模板/Activity链接没有可直接复用的实现，不能把其普通伤害数组能力泛化为状态自动化。它的旧输出结构也不能原样用于5.3.3。

固定链接：[空Effects getter](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/foundry-parsing/Foundry5eItemFormatter.ts#L203-L205)、[固定manifest](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module.json)。

两个上游都是MIT；复制实质代码时保留对应版权与许可：[Aioros LICENSE](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/LICENSE)、[AI Importer LICENSE](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/LICENSE)。

## 实施后的各类状态应怎样交付

| 来源情形 | 模板与链接 | 期限、触发和后续处理 |
| --- | --- | --- |
| 命中附加一个官方状态 | 生成非transfer模板，仅连对应Attack；链接没有onSave字段 | DM点该模板应用；明确期限用既有数值转换，无期限不补时钟。 |
| 豁免失败附加官方状态 | 生成模板，仅连对应Save，`onSave:false` | 保留DC、属性和失败文字；不能连到成功分支或其他攻击。 |
| 命中后独立豁免失败附状态 | Attack保留伤害；独立Save拥有状态模板链接 | Save的触发条件及来源全文保留，DM决定何时使用。 |
| 本次伤害降到0HP后才豁免，失败附状态 | 该状态只连后置Save；初始Attack不连此状态 | HP0条件写到活动条件/目标特殊说明和模板描述，不自动判目标当前HP，也不因条件复杂删模板。 |
| “持续1分钟，回合结束可再次豁免” | 模板仍有明确最大时长；对应Save/Attack能选择应用 | 再次豁免与提前结束保留在Effect描述/活动文字中，不声称数值时钟已经实现重复检定。 |
| “直到挣脱／源状态结束／受到伤害” | 模板仍生成和关联；未有明确数值时钟留空 | 完整结束依赖留在模板描述与来源记录，DM应用和解除。 |
| 第二次失败才石化／HP0触发死亡等 | 每一来源结果保留可选择模板，连所属后续分支；不把后阶段结果混到第一次应用 | 既有后续按钮/GM活动可以复用；必须保留首次与后续区别。 |
| 免疫、解除或仅提到状态 | 不误造“施加该状态”的模板 | 保留其真正规则，不能因为同一词出现就把它当命中结果。 |

官方状态覆盖还需注意 Exhaustion。当前 `NativeFailureStatus` 与 `sourceInput`白名单包含 `dead`，却遗漏`exhaustion`；5.3.3官方 `module/config.mjs:3672-3677` 明确有Exhaustion、6级及2024版减值。不能无声过滤，但它的级数/增减语义不能用一个无级数字符串冒充完成；本轮实现若未覆盖级数，应明确保留该缺口与原始数值，不影响其他状态模板和Actor交付。[固定官方配置](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/config.mjs#L3672-L3677)。

## 证据与复查范围

本轮证据root约定为 `H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-official-status-effects-20261027`；本文没有创建第二份源码缓存或备份。已有固定上游内容来自上一轮同会话GitHub原文读取；本轮读取了当前本地实现和精确5.3.3源码。

待判断本地化清单：无新增外部模块。本轮只复用现有模块已核源码机制，不安装Aioros或AI Importer。

新候选复查步骤：本轮没有新候选。若后续必须借助其他模块管理重复豁免、HP0触发或依赖解除，应单独核其锁定版本、来源规则与运行行为；不把额外模块设为提供基本官方状态模板的前提。

实施后的最小语义核对应覆盖：普通命中状态、失败状态、带持续/重复豁免状态、HP0后续Save状态，以及一项免疫/解除近反例。检查模板实际存在、Activity引用正确、onSave字段归属、原文限定未丢、明确数值期限与来源一致；本研究没有执行这些检查，也不将静态源码结论称为运行时验收。
