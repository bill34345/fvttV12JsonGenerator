# Generated Actor / Item Verification

## Actor delivery and verification results

Actor产物存在与检查通过分别记录。生物AI入口只有在AI没有正常返回时才允许本次整只无产物；可读回答的格式、字段、引文、内部IR／协议及检查问题只影响对应字段或操作的表达。完整可读Markdown回答沿同一入口复用已有文本转换；原始输入、AI全文及规范源分别保留。不得删除已有能力，或用整项／整只说明文字代替已有攻击、伤害、豁免、法术和次数。

下文的来源比较与验收标准用于判断正确性，不控制已有Actor的查看、下载或正常采用。已有Actor在验证、图标、摘要、报告、恢复记录或响应附带数据失败时仍交付，并明确列出尚未完成或不一致之处。正式登记、真实GM权限、文档归属及覆盖冲突只约束对应写入；独立Item／Species保持自身契约。46项历史整改见[原执行记录](acceptance/2026-10-27-forge-generation-delivery-remediation.md)，其后代码复审确认的10类缺陷及2项边界补修见[2026-10-28验收](acceptance/2026-10-28-forge-preservation-fixes.md)。历史PASS不能代替后续发现的保留缺口。

本轮核对须逐一检查完整操作、法术引用、共享资源的实际消费方以及父子／替代分支的效果链接，不能只数Actor或Effect对象。怪物附带引文缺省、模式冲突或内部编号修复不应删除已有机械数据；坏列表成员与坏宏独立报告。原样冻结回复、单变量派生反例和机制构造反例分别标明，不能将派生规则归给官方来源。

世界读回覆盖原生资源、di/dr/ci、movement、portable manifest、Item说明及Effect期限／启停／生命周期。只对HTMLField按HTML片段规范表示比较，并忽略显式override=false的Activity范围冗余值；父Item范围、纯文本及其他机械差异仍检查。Resolver拥有的合法缓存和Cast新增不算生成内容丢失。sourceId／sourceHash校验在共用Actor世界写入边界执行；无效身份仍可查看候选，但不能借此覆盖世界文档。

官方状态须同时核对施加主体、否定和阶段。“盟友未失能”等优势前提不生成目标状态；“目标同时目盲与耳聋”等真实并列结果均保留。无伤害攻击的GM状态模板可关联该攻击本身的检定，不能虚构Damage，也不能把相邻Save或其他操作的效果移来。吐出、从尸体逃出等真实后续事件的状态使用独立“退出时状态 Exit Conditions”GM活动，保留完整条件，不混入初始吞入效果，不额外消耗主能力次数。逃脱DC、逃脱检定、否定退出及Until／除非结束边界不是新的施加事件；这些规则仍由GM按原文裁定，不承诺自动监听或执行。

旧平铺临时生命消费者仅在完整来源明确证明自身受者时补齐self；目标或盟友的代词回指不能变成自身，明确已有受者不覆盖。真正未知受者继续保留Heal、原文及GM确认提示。精确引文已成功定位且仅修正旧坐标／引文时保留原答和整理历史，不再冒报FIELD_PROJECTION_INCOMPLETE；未定位、坏记录及真实不支持内容仍逐项提示。五类修复的冻结对照、独立审查与未验证层级见[本轮验收](acceptance/2026-10-29-forge-five-mechanism-fixes.md)。

引文整理成功后保留的合法空问题历史，不表示还有待核对问题。原提案与旧坐标仍在分析IR中；纯历史不写入规范机械来源、角色审阅flags或待审提示。顶层、能力及施法组共用此含义，document与external交付一致。真正坏的审阅记录或手动计数在解析入口保留原值并列出具体问题，不取消已有Actor；合法手动次数、恢复说明及消费保持。24项旧失败的逐项修复与验证边界见[2026-10-29修复验收](acceptance/2026-10-29-forge-24-failure-fixes.md)。

## Source-backed replacement damage and swarm identity

For v14 / dnd5e 5.3.3 source-operation abilities, independently check each exclusive Attack choice. A clearly printed replacement can produce ordinary/replacement Attack options in one Item; the GM selects one. Preserve the exact condition and its owner (attacker versus target), both printed formulas, shared unconditional damage, target, range, activation and the same single resource cost. Do not infer a half-dice formula or automatic HP threshold. A separately qualified extra damage roll stays a GM Damage operation. Ambiguous third alternatives and inseparable multipart rules keep their complete GM operations.

An explicitly two-handed damage replacement uses a native Weapon with Versatile: source base/versatile damage on the Item and one native Attack, retaining fixed printed attack/damage totals. Standard weapon identifiers may be reused; their library statistics must not replace a monster's printed dice, totals or riders. Melee/thrown source modes retain their own range and thrown uses base damage. Two-Handed alone does not imply Versatile. Verify a negative damage formula by changing the executing custom formula, not an ignored numeric field.

The optional Markdown key `集群个体体型` carries individual swarm size independently of overall `体型` and `生物类型`. Check final `system.traits.size`, `system.details.type.value`, `system.details.type.swarm` and token dimensions independently. Ordinary creatures must not inherit a swarm field from a template. Report conflicting source declarations while retaining the Actor and all supplied size information. These local source/output checks do not replace native import, roll-dialog or UI acceptance, and do not automatically migrate existing Actors.

## Required Source-To-JSON Checks

For each generated Actor JSON, manually compare the generated output against the source markdown:

- Identity: name, bilingual name handling, creature type, size, and alignment.
- Language and source fidelity: a single-language source remains in its source language, while existing bilingual text keeps its original correspondence; translation is not a prerequisite for acceptance.
- Core stats: AC, HP, hit dice, speeds, abilities, saves, and skills.
- For NPC HP, compare both the printed average/current and maximum (`system.attributes.hp.value` / `max`) and the optional dice formula (`system.attributes.hp.formula`). For example, the Intake table `| **HP&#x20;**&#x37;（3d4） |` means 7 / 7 / `3d4`; numeric HTML entities and fullwidth parentheses are presentation only. Keep raw evidence coordinates unchanged, do not roll or recompute the printed average, and do not infer a formula when absent or borrow attack/healing dice.
- Traits: senses, languages, damage resistances, damage immunities, damage vulnerabilities, and condition immunities.
- For a historical staged Forge source, qualified stat-header defenses and non-native conditions retain their complete GM rules. Do not make any member of a qualified comma clause unconditional. The approved Colossal presentation uses the native maximum gargantuan while retaining the exact source label, dimensions and explicit GM size adjudication; unknown sizes retain their source value and a local mapping finding without canceling the Actor.
- Verify printed passive Perception after including the native Perception passive bonus. A skill total alone cannot reproduce every source-explicit passive score.
- The explicit literal biography mode prevents extra Items and executable inference. Its closed food-retention display fact still supplies the same verified sea-water requirement and no-vomiting meaning to formal Chinese; other prose remains a source comparison boundary.
- On v14, known English language labels such as `Aquan`, `AURAN`, or `DrAcOnIc` map to the system's lowercase codes. Compare the visible language list as well as JSON values: dnd5e 5.3.3 omits unknown code casing from its labels. Similar unknown phrases remain literal and require review; legacy target behavior is unchanged.
- Actions: action count, action names, attack bonuses, reach or range, damage formulas, damage types, and descriptions.
- Saves and effects: DCs, save abilities, success and failure behavior, conditions, durations, and repeated-save rules.
- For a source-bound multi-operation feature, compare each operation with its own complete source clause. Attack totals, DC/ability pairs, damage/type pairs and success damage cannot be borrowed from another operation. Verify that the complete parent rule and shared context survive, every explicit basic operation is represented once, and conditional/replacement damage is a separately identified GM operation rather than unconditional attack damage. A follow-up Save must remain independently clickable, retain its source condition, and never consume the parent resource again. Target-choice Save abilities must remain a real choice; an AND requirement cannot become OR.
- A supported two-event healing parent must retain both Heal operations in one Item: the initial printed formula and the same recipient's later turn-based formula. Compare each healing kind, single-recipient qualification and complete event proof. The follow-up is a GM-triggered special Activity with no repeated resource cost; full duration, initial casting instructions and remaining consequences stay in source text. Do not merge formulas, default a touched target to self, infer 5 feet from Touch, or treat roll helpers as automatic healing/expiry or a granted Spell. Extra source-explicit operations must not be hidden behind this bounded two-Heal contract.
- Compare the final Activity's range and template separately. An area placed at a visible point 120 feet away must retain that placement range; its own radius does not make the range self or become the Actor's range. A source-centred area without a placement distance remains self. Target eligibility negation does not negate an otherwise explicit Attack. Ability abbreviations must be whole tokens: the consequence verb in "saving throw or contract a disease" is not a second Constitution choice.
- Legendary, reaction, and bonus actions: count, cost, activation type, and descriptions.
- If a Monster reply omits a healing recipient, retain the Heal and source text while reporting the missing target. The native Activity uses an unspecified-count `any` target and a special GM-confirmed range, not a source-confirmed self-only target. Check the actual target, range and GM note together; `target.prompt` controls measured templates and does not promise a recipient dialog or automatic adjudication. Explicit recipients must remain unchanged.
- Legendary actions without an explicit budget retain their abilities and zero native capacity with a non-blocking configuration finding. An explicit zero remains zero; an explicit base-zero/lair-one ledger retains both values and its recovery rule. Do not infer three uses from prose, or treat a diagnostic as proof that the original action is usable. Legendary activation already consumes its native action resource in dnd5e 5.3.3, so a second target for the same pool must not be added.
- A source-explicit shared legendary-action budget must match the Actor's native resource maximum, even when its complete actions are GM manual. Conditional/unknown budgets remain literal GM context; manual Activities still have no automatic consumption. Do not repeat the same source preamble in biography when retaining the counter metadata.
- Spellcasting: spell list, spell save DC, spell attack bonus, preparation or innate-casting rules, and linked UUIDs where expected.
- For English casting prose, independently introduced creatures that appear, emerge, or are summoned/created remain separate source entities. A later cast by the same definite noun phrase does not grant that creature's spells to the carrier. Inspect every list: an earlier external or negative list must not hide a later genuine own grant. These bounded source checks do not replace full ownership or translation review; ambiguous casting remains unresolved.
- Automation: activities, active effects, flags, module-specific fields, and effect-profile behavior.
- Description fidelity: important source text is preserved or intentionally transformed.
- Chinese body localization may omit encoded apostrophes only when every such source entity is grammatical punctuation between Latin letters, outside HTML attributes and document enrichers. This permits possessive/contraction wording to become idiomatic Chinese; quoted/literal entities, other markup, numeric values and dice stay protected, and original source/IR/manualRule text remains exact.
- Source coverage: every mechanically relevant source markdown section is represented or intentionally excluded.
- Source section presence uses the same complete-heading rule as source partitioning. A wrapped prose line beginning with "actions at the start..." is not an Actions section; a genuine English, Chinese or Markdown Actions heading still requires its source-backed feature collection.
- AI Intake also checks strong ability headings, source-declared spell levels, and complete referenced-definition bodies, including later exceptions. A coverage label of narrative/ignored is not proof that the rule reached the generated descriptions. These finite checks do not replace the comparison above.
- When an exported NPC omits a prepared proficiency value, verify skills, saves, passive scores and attack bonuses using the same CR/level-derived proficiency as the generator; an absent prepared field is not a proficiency bonus of zero.
- No false effects: prerequisite-only text does not create on-hit effects unless the source explicitly applies that effect.
- Configured WMP weapons on v14: literal source damage must not also include the Item base. Check `damage.includeBase=false` and the matching `flags.fvttJsonGenerator.weaponPropertyBase` binding for that primary part. A native inferred weapon retains `includeBase=true` and its Item base. Roundtrip-test both paths; a valid JSON shape alone does not prove Fatal can identify the base die or that damage is not duplicated.
- Output provenance: final JSON came from the project CLI or workflow, not manual construction or repair.

When the source entered through document extraction, plaintext ingestion, or AI Intake, also trace the exact source identity through its source-scoped evidence/run artifacts, evidence IR where applicable, rendered Markdown, portable manifest evidence where applicable, and final JSON. Confirm that page/coordinate/language/confidence/line-order evidence for documents, and per-entity/aggregate equivalence for plaintext collections, were not replaced by an unrelated source or run.

For each generated standalone Item, also compare:

- Identity and category: bilingual name, source category, normalized Foundry document type, rarity, attunement, weight, price, and equipment subtype.
- Activities: inspect each `system.activities` entry for activation, target/range, consumption, uses/recovery, save/attack/damage, and its actual source-derived stage membership.
- Effects: every structured embedded effect exists once, has a unique ID, and is referenced only by the Activities that apply it; check each Activity-to-Effect linkage rather than only counting effects.
- Profile isolation: `core` contains no MIDI-QOL, DAE, Times Up, or Item Macro fields; a modded profile uses only the locked target-version contract.
- Stage provenance: names, requirements, uses, and mechanics come from structured source data. A literal-only stage must remain `needs_review`.
- Complex-rule boundary: if the locked target cannot express the source rule natively, the result must say `gm-assisted` or `external-rule` with preserved source text. Static JSON, a utility-shaped placeholder, or a passing verifier is not native automation acceptance.

## Shared Verification Results

本节中来源语义核对与旧诊断用于人工比较或显式离线检查，不重新接回默认生物生成链。下述“拒绝”仅表示该局部投影未被证明正确，不拥有整只Actor或已有文件的否决权；保留所有已给数据、完整规则及其他基本操作，不要求修到零问题才能取回产物。

Monster Intake 的基础数字必须独立于后续能力分段核对。清楚的表格、链接显示文字、引用符及 PDF 连字按排版等价读取，证据仍用原文坐标；URL 数字与 OCR 模糊字符不能证明数值。无法确认或与来源冲突时，只保留当前候选待核对。可从同一头部补回明确缺失的先攻和语言附注；未打印 PB 时可用已核实 CR 的既有原生派生值，不允许任意猜填。感官范围限制同时核对 IR 和最终 Actor 可见正文。`bun run test:forge-statblock-semantics` 保留正确格式与错填对照；测试不代替真实模型、导入及运行验收。

基础 AC 的冲突只比较本体头部的声明；触须、受控锁链等物件在能力正文中写自己的 AC，不等于本体出现第二个 AC。手动规则若保留原生次数，仍须由本能力证明次数和恢复方式，不能借用目标的额度、容量、头数或时长；嵌套句中“让目标每天使用三次”也不是来源生物每天三次。完整 GM 规则可以不建立自动计数器；没有依据的计数不能进入最终 Item。

资源或形态后缀被整理到独立字段后，用同一个精确来源标题继续核对基础操作和恢复；不取消既有 Utility 次数按钮。环境接触、投掷碰撞等可以先发生条件伤害，随后才有另一对象的豁免；每个伤害必须证明自己的触发条件，完整原文、先后顺序和归属仍须独立检查。没有条件的普通伤害动作不能靠自报“后续”变成无动作消耗的按钮。“以下一种：首选项。”与冒号后的独立选项同样需要明确作用范围，否定引导和共同延迟结果不算互斥主选项。

提到某法术的效果、隐形的施法结束条件、代词指向的未指定法术，以及“从屏障外施放的法术”等被动描述，不自动授予本体具名施法。实际具名授予仍按正式法术清单核对。“以下一种”的具名子选项须证明属于同一选择范围及同一充能；后续回合才发生的共同豁免保留为 GM 后续项，不当作另一个主动作再扣充能。扩样验收同时保留正确、漏文与错值对照；旧例通过后再首测独立新来源，不能把固定回复离线通过称为真实模型或实机全部通过。

标准英文攻击头中，唯一默认命中加值紧接一个仅改变命中值的括号条件时，分别核对相邻的默认primary与条件alternative、原样条件和相同触及／射程／目标。漏掉任一命中值、无条件套用条件值、插入另一攻击或在括号中另改距离／目标仍拒绝。两个命中按钮与普通／双手／魔法的独立GM伤害按钮不自动配对，也不硬并成Versatile。

来源主体明确且同句she/her或he/him回指一致时才可证明自身距离；其他实体的距离不能借用。Each/Every/Any creature within N feet of本体的隐含半径与分步推导保持一致，外部闪光等中心仍不能变成本体范围。带真实独立Variant标题行的完整GM侧栏保留所有分支，不能合并各变体属性；标题中的Types不是Type标签。显式GM／SourceOP载体不会因条件表中的临时生命值被额外注入平面治疗；真实基础操作仍逐项核对。

All supported entry points run the same canonical generation pipeline. Record the following verification results alongside the generated artifact:

- Every canonical attack, damage, save outcome, activation, use, effect, range, and stage is projected once or explicitly marked `literal-only`/`unsupported`.
- Activity/Effect IDs are stable, 16 characters, unique within their document, and map keys equal Activity `_id` values.
- Program-owned IDs and document skeletons are constructed once; duplicate source IDs and other local issues retain the original data and a specific finding. Dangling Effect references, lost mechanics, save-outcome drift, invalid target fields, or profile leakage must be reported without removing unrelated operations or the Actor artifact.
- An Actor with `needs_review` or `failed` findings remains available as a file and in partial collection exports. Standalone Item output and formal promotion keep their separate contract.
- Never hand-edit rendered Markdown or final JSON to falsify a passed check. Preserve the original status, source and candidate; GM adoption is a separate decision and does not change the verification verdict.

在 v14/core 的 `SourceOperation.aoe` 中，`radius` 仍表示该形状的长度或半径；可选 `width` 仅用于 `line`，可选 `height` 仅用于 `cylinder`。分别对照同一完整来源、IR、Markdown 和最终 `Activity.target.template` 的 `size/width/height`，并将远程 `range` 单独核对。来源唯一证明当前区域的宽或高时可以补齐缺失字段，不能覆盖显式错值；系统默认的 5 尺不是来源证明。旧 `rectangle` 别名只有来源明确为正方形时才输出原生 `square`；本轮没有增加真实长方形支持。原生高度字段是元数据，不能据此宣称三维模板、空间命中或自动裁定已经运行通过。

来源中已登记的独立分类标题（包括 `Hide [Action]`）须保留各自完整父规则；属性表、未知方括号标签及正文续行不能制造新能力。范围后接本体可见性等资格时，核对距离与完整限定两部分；不能把外部中心、否定距离或名称的任意前缀当作本体距离。

同源绑定的 SourceOP 明确以物体／建筑为接收者时，核对原生 `target.affects.type` 为 `object`；明确允许生物和物体时为 `creatureOrObject`，不能只看 `targetSpecial` 文字。完整资格仍保留在 `targetSpecial`，未知类别不猜并保持旧默认；这不增加目标 schema 或自动目标过滤。

手动启用的扩样诊断 `tests/diagnostics/forge-broad-rule-audit.ts` 另外核对错误提案是否真正回到同源正确结果：只有同一来源、同一提取路径的正确控制已通过，且接受后的完整 `IR.creature` 与 Actor 一致时，才记为 `SOURCE_OWNED_RESULT`；只排除 Actor 顶层 `_stats.createdTime/modifiedTime`。接受后的结构仍不同则是 `UNSAFE_ACCEPT`，不能用局部字段通过替代。这个约束仅属于 opt-in diagnostic，没有新增 hook 或生产检查。本轮文档更新不宣称界面、真实模型首次提取、所有怪物导入或全部 R7 问题已经完成。

## Version-Specific Checks

When generating for `--fvtt-version 12` or `13`, check:

- Actor, embedded Item, standalone Item, and ActiveEffect `_stats.systemVersion` are dnd5e `4.3.9`.
- Item activation lives on Activities; legacy Item-level `system.activation` is absent.
- Uses use `spent`, `max`, and `recovery`; legacy `value` and `per` are absent.
- The result passed locked 4.3.9 structural assertions. Do not report a Foundry runtime pass unless that exact artifact was imported and exercised in a separately recorded runtime.

When generating for `--fvtt-version 14`, also check:

- Actor, embedded Item, and ActiveEffect `_stats` use Foundry `14.364` and dnd5e `5.3.3`.
- NPC resources use v14/dnd5e 5.x source fields such as `max` and `spent`, not legacy `value`.
- Senses use `system.attributes.senses.ranges.<sense>` plus `special`, not direct legacy sense fields.
- Item activities carry activation data; item-level `system.activation` is not used as the v14 source of truth.
- Save activities use `save.dc.calculation` and `save.dc.formula`; `save.dc.value` is prepared by dnd5e and should not be emitted as source data.
- Uses data omits legacy `value` and `per`; generated source should use `spent`, `max`, and `recovery`.
- Spell fallback items use `method` and `prepared`, not legacy `preparation.mode`.
- Active Effect changes target schema-backed v14 fields, for example AC flat/formula fields rather than legacy AC bonus fields.
- If `--icon-mode safe` was used, every embedded/standalone Item has a catalogued Foundry core or dnd5e path, the adjacent `*.icon-review.json` records the chosen source/confidence/reasons, and fallback decisions remain explicit rather than being reported as semantic matches.
- Review representative exact mappings and all semantic mappings visually. Confirm close negatives remain on a type default or an explicit reviewed override.
- Runtime import/readback is a separate gate. State whether the exact project-local Foundry 14.364 runtime was available for this run.

When generating for `--fvtt-version 14 --effect-profile modded-v14`, also check:

- The current locked module target is MIDI-QOL `14.0.11` and DAE `14.0.12`. Reports executed against MIDI-QOL `14.0.9` remain historical evidence and do not prove the `14.0.11` runtime.
- Times Up fields or assumptions are not required for v14 output.
- Item Macro is not treated as a required dependency unless a v14-verified version is separately documented.
- `flags.midi-qol.OverTime` is emitted only when the source text explicitly provides a repeated-effect formula and damage type.
- The OverTime formula comes from the repeated-effect clause, not from an earlier hit or attack damage clause.
- Any macro-style automation remains guarded and falls back to GM manual handling when MIDI-QOL workflow context is missing.

## Portable Spellcaster Verification

For an Actor carrying `flags.fvtt-json-generator-spell-resolver.spellManifest`, verify the project artifact before importing it:

- `spellResolution.status` is `pending`; `pending` is the correct portable-project state, not a failed hydration claim.
- Every manifest ref is backed by an exact source evidence range and retains its source usage, ability, DC, attack bonus, component waiver, and literal restrictions.
- The Actor contains no placeholder embedded Spell, resolver-managed Cast Activity, local Actor/Item UUID, or destination Compendium UUID.
- Each manifest group links to exactly one real generated source feature by stable identity rather than item order or translated display name.
- Multiple source-explicit shared daily pools require distinct group and feature identities. Every Cast in a pool must target that pool, independent pools must not share consumption, and an ambiguous grant row must remain explicit GM text instead of being dropped or assigned to a convenient pool.
- The Actor was regenerated by the CLI/workflow and checked with the Intake verifier; hand-repairing the Actor invalidates this layer.

This is the portable/static layer: it proves portability and source fidelity only. It does not prove that any destination-world Spell exists, that hydration occurred, or that any spell can be cast.

## Target-World Resolver Report Verification

After ordinary Actor import into the exact supported Foundry/dnd5e runtime, inspect the resolver report:

- The source index includes every enabled and readable Item pack, including packs without a spell-specific manifest hint.
- All refs resolve before the first write; any missing, ambiguous, contradictory, stale, or undecided manual conflict withholds the whole plan.
- A matching 2024 candidate wins; a 2014 selection is allowed only when no same-key 2024 candidate exists and is visibly reported as fallback.
- The hydrated graph contains one native Cast Activity and one native cached Spell for each ref, with exact `cachedFor`, `compendiumSource`, resolver ownership, source feature, and selected UUID linkage.
- No placeholder, duplicate cache, foreign item adoption, or unrelated Actor/item/activity/effect/flag mutation occurred.
- Manual Keep, Overwrite, Cancel, close, rollback, and recovery-required outcomes match the report and leave no hidden partial success.

This is the target-world hydration layer: it proves deterministic destination selection and document construction. It does not substitute for using the native activities.

## Live Native Spell-Use Acceptance

In the destination world, actually use representative hydrated spells:

- Run an attack workflow and confirm the native roll uses the source attack bonus.
- Run a save workflow and confirm the native card uses the source DC and ability.
- Open and cast a utility spell; verify source target restrictions such as self-only.
- Use a limited spell twice to confirm the first use spends only its own Activity and the second is blocked by native behavior.
- Use an at-will spell repeatedly and confirm no daily use is spent.
- Confirm component waivers are represented by native Cast data and literal-only restrictions remain visible without claiming unsupported automation.
- Disable the resolver after hydration and prove cached Spells still open and cast natively.

This is the native runtime layer. Portable/static verification, resolver hydration verification, and live-use acceptance are three separate gates. Passing any one of them cannot be used to claim the other two.

## v14 Batch Acceptance

For project-internal v14 core acceptance without a local Foundry runtime, run:

```powershell
bun run src/tools/v14AcceptanceSuite.ts --out-dir "obsidian/dnd数据转fvttjson/output/v14-acceptance" --report "docs/acceptance/v14-core-batch-verification.md"
```

For project-internal v14 module-profile acceptance, run:

```powershell
bun run src/tools/v14AcceptanceSuite.ts --effect-profile modded-v14 --out-dir "obsidian/dnd数据转fvttjson/output/v14-modded-acceptance" --report "docs/acceptance/v14-modded-batch-verification.md"
```

The batch suite must:

- Generate every JSON artifact through the project conversion workflow with `--fvtt-version 14` and `core` semantics.
- For the modded suite, generate every JSON artifact through the same workflow with `--fvtt-version 14 --effect-profile modded-v14`.
- Disable optional translation services so acceptance output is source-faithful and not affected by external model behavior.
- Include a local GoddessFantasy fixture pipeline sample that covers crawl -> records -> plaintext -> actor JSON.
- Record actorVerification warnings in the report instead of treating schema success as semantic success.
- Keep live Foundry v14 import as an explicit unresolved runtime check when no local Foundry v14 runtime is available.

## Completion Standard

A generated Actor JSON result is correct only when:

- The project CLI or workflow regenerated the target JSON.
- The JSON parses.
- Relevant tests passed, or known baseline failures are explicitly separated from the current change.
- The source markdown comparison above was completed.
- Any Foundry, dnd5e, or module-dependent behavior was checked against locked local references for the target version.
- Any remaining uncertainty is reported with the exact source field, generated field, and reference gap.

Forge v14 fuzzy-icon acceptance additionally requires every generated Item and Activity to select a verified content/category path (or inherit a selected parent content path), never an automatic placeholder, empty image or catalog type default. Check includeBase against the effective Activity damage and exclude sibling damage. The optional Forge iconReview reuses the v1 report: inspect reasons, alternatives and confidence; type-default means an actual default path, not a low-confidence category or inherited content selection. CLI/Web icon defaults are unchanged. Verify all selected images in the supported native client after import and refresh.


For Forge v14 facts localization, independently compare original rule facts, Actor mechanical fields, and complete fixed Chinese blocks. Shared hashes alone are insufficient evidence. Exercise source → saved IR/source verification → formal Markdown → Actor → residual-text request/local assembly → serialized draft readback → test-only approval → regeneration. A fixture GM identity is never a real approval. Legacy localization records retain their original policy and must not authorize the facts policy. Unsupported clauses remain source-complete and visibly require GM review; conditional/replacement damage must not become unconditional native damage.

When normalizing failed-save branch labels, prove the whole damage declaration and its ordering, formula, type and absence of an additional prerequisite; a locally matching damage phrase after an `If` clause is insufficient. For an attack followed by a save only after this damage reduces its target to0HP, retain that trigger and never link the delayed failed-save consequence to the initial attack. Check sparse IR, prose-inferred effects and unrelated immediate hit effects separately. Presentation HTML tags may differ without losing text; actual omitted source text must still fail.

The frozen six-PDF acceptance records each sample's single fresh submission, elapsed stages, actual provider requests, built-in repairs, semantic verdict, icons, import/refresh/readback and exact owned cleanup. A failed sample is sealed without correction or retry; other preselected samples use the unchanged freeze. Shared target, freeze or cleanup failures stop the batch. Binary PDF/ZIP integrity uses raw bytes. Only all six required outcomes passing establishes this explicitly bounded batch result.


## 原生操作与 GM 规则共存

施法须逐项对照来源限定：原文“无需任何法术成分”要求 V/S/M 都被免除，仅有 material waiver 不能接受；原文只免材料时不得扩成全免。核对完整父施法条款、每个实际授予的 portable restriction、Cast override 和 prepared 法术属性，不只查看完整描述。持续时间同样区分源法术基础值、Cast override、prepared 值、实际目标 Effect 和重载持久性，前一层通过不能替代后一层。

来源明确给出同一攻击的近战与远程模式时，核对同一 Item 的两个 Activity、共同加值／伤害、触及与远程距离。伤害类型择一须为单份骰式配可选类型，不得重复造成两份伤害。明确每项 N/日的 GM 施法记录要逐项核对 Activity uses/recovery、activityUses 自身消耗和独立计数；父 Item 不得增加共享次数。原生卡展开后应看到各项独立计数，记录活动不能伪称已经施法。法术的特殊成分、持续时间、目标与效果仍按完整来源核对；源文中的施法属性与 DC 留在 GM 说明时须明确报告，不能声称原生 Cast 已实现。

Forge v14 的混合能力必须同时核对完整中英正文与原生字段：明确的攻击加值、伤害公式与类型、豁免属性与DC、距离与效应范围、次数、消耗和恢复不能仅因后续规则复杂而丢失；条件、追加/替代/持续伤害及特殊状态不能混成无条件执行。对照来源查看角色卡及Activities、Effects、Uses/recovery与consumption，确认正常掷骰入口可用，有范围模板的能力能放出正确形状和尺寸。仅有完整文字或成功导入不能代替这些检查。命中判断、豁免结果比较与原生伤害结算由Foundry及相关模块负责，不作为本生成器的重复验收条件；若本次修改的是Forge自己实现的状态或控制器，其真实行为仍按对应规则验收。纯GM手动项仍应零执行，已有受支持规则也不能被混合标记静默降级。

明确章节后的首个独立标题行可保留为完整父规则，属性表行不能充当标题；物体破坏所需的输入伤害不建立输出伤害，Save前的触发条件仍保留，固定saving throw印刷断词不改写来源。 完整多毒物规则仍逐项核对豁免、伤害库存、初次及后续失败的归属，不因版面空格或successive词头丢掉真实规则。模板文字作为GM说明，不代表自动套用到本体。

2024式规则须区分同文多次豁免的真实出现位置，伤害与失败后果绑定对应出现；逗号列举并以or结束的伤害类型是一份骰式的选择，不是多份伤害。独立闪电束不借用前一属性的命中前提，明确放弃攻击鉴定也不能产生攻击后续。条件3/日、巢穴4/日保留完整条件；未选模式不擅自填单一上限。2024传奇共享前言只有消费与恢复主体均能由本体中英文名称或明确自身回指证明时才提供费用；固定预算可投影，条件预算仍交GM。标题括号的呈现差异不应制造缺项，但数字与恢复词仍保留核对；Node与浏览器共用同一名称存在性判断，该判断不代替上述机械字段检查。

在v14/core怪物SourceOP路径中，分别核对区域尺寸与远程落点：aoe.width只用于Line宽度，aoe.height只用于Cylinder高度。同一完整来源唯一证明当前区域的尺寸时可补齐缺值，显式错值仍拒绝，不按来源悄悄改正。旧rectangle只在来源明确为正方形时投影原生square，真实长方形没有新增支持。原生宽/高元数据不代表三维自动执行；未给出的尺寸不猜，完整空间规则仍交GM。未知Save DC不能猜填，明确失败/成功分支中的固定伤害可保留独立GM掷骰；紧邻测量前提和表格Up/Down同一行的互斥攻击须有完整来源依据。reduce/prevent/absorb及其关系从句表示输入减伤，不能成为输出伤害；同句后续真实伤害仍独立核对。

混合能力中已证明的单次固定普通或临时生命恢复须保留原生 Heal，并核对公式、类型、接收者和完整资格。`healing.target` 为可选的 `{type: "self" | "creature", count: 1, special: string}`；旧输入省略时按自身。来源允许本体或一个具资格生物时保留该选择文字，未知距离使用特殊范围而不猜数字。按每个目标、等级、实际伤害或未知上限改变数额的句子不得截为固定恢复，完整留给 GM。静态目标资格不能凭空证明独立触发事件；真实命中、检定结果、支付资源和抵达等仍按完整来源判断。空的分区标题不强制补造特性，首分区后的反应／传奇正文不倒推为头部特性；实际前置特性仍要核对。

完整的已证明接收者若明确给出自身起算距离，沿用既有 `feature.range` 投影原生距离；没有距离时才用特殊范围。恢复按钮只执行固定数额与类型，触发前提、临时生命期限、护甲增益和其他未配置后果仍由 GM 对照完整正文处理。原生 Save 的 SourceOP `failureStatuses` 当前只承载无条件且无时限状态；不能把其他路径的简单时限支持套用到该字段，或创建无期限 Effect 冒充定时状态。

豁免属性在前一句、紧邻下一句只定义首小时、首分钟、首轮或首日 DC 时，只为已证明的首周期保留独立 GM 豁免入口，完整触发和后续递增规则仍留在正文；不能把首周期 DC 当作全程固定值。已支持的完整等级分档表仅在来源唯一的基础 Save 与伤害类型一致时复用该 Save，并将每档骰式、列头类型和同档区域尺寸绑定核对；逐枚伤害档位保留每枚的字面骰式，不把枚数或等级当成伤害。GM 按完整来源选择档位，按钮不自动读取角色等级、切换档位或计算总枚数。

Intake 只印明确命中总值和伤害总式时，保留固定数值，不能因为恰好与角色某项属性吻合就反推该攻击使用那项属性；显式攻击属性与未标记的旧 CLI 输入保持原有处理。完整旧攻击格式仍可使用，不要求新增操作标记。独立命名子能力的句点和冒号标题都划分证明归属，后一个子能力的距离不能借给前一个豁免；同一子能力内的真实相邻目标和触发说明仍可使用。

含逃脱 DC 的擒抱仍有额外结束规则，不生成普通永久效果；同一目标失败后直接死亡或跌落并倒地等已支持的无时限结果，与需要持续、重复豁免或其他结束条件的状态分开核对。唯一主动入口的固定次数可与被动收益共存，被动光环不获得该次数。显式 GM 手动项可保留 Item 计数器供手动扣减，但不自动消费；已配置原生次数的 Utility 才消费一次。外部法术位恢复仍保留完整规则，不增加法术位或施法授权。

再次豁免、成功结束，以及经过一段时间自动成功，都是失败状态的持续和结束规则；句中出现 success 不能把这些限制从失败状态中丢掉。SourceOP 的无时限失败状态不能承载这类规则，仍保留完整 GM 说明，不生成永久 Effect。真实独立英文标题可含常见小写介词等功能词；标题大小写、整词和完整物理行边界仍须成立，不能把正文续句、属性表或任意小写片段提升为新能力。

非攻击SourceOP省略数值范围时，只有来源明确证明自身受者或自身发出区域才使用Self；未知或外部位置使用特殊范围和简短GM提示。法术头部的创建距离、控制区域不自动属于后续伤害；完整事件引用与当前目标、区域仍须分别证明，不能靠按钮名称判断。固定伤害和类型选择仍保留，未知DC、变量总伤害和复杂后果交GM，不新增施法授权或自动触发。
