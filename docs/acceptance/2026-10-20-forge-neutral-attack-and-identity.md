# Forge：Company 中立攻击、条件半伤与 Vampire 来源身份

日期：2026-10-20。工作树 `20261019-forge-ab-fixed-replies`，基线 `f637f77f28c086e34297513e5293f98b3835f2e9`。这是继[兼容续批](2026-10-20-forge-company-vampire-compatibility.md)之后的新实施记录；旧报告、首答和评分保持历史原状。任务仍是改善 Forge mod 的可靠性、速度、费用与用户干预，不以 CLI 实验替代产品接线。

## 实施结果与边界

**VERIFIED：离线正式消费链。** 先更新[当前 MD](../plans/2026-10-20-forge-ab-current-state.md)，再扩展 V2 → SourceOperation → renderer/parser → 正式 generation → verifier → encounter preparation。完整 Company 原来源配合明确的新契约回复，已走过 mod 使用的 `generateEncounterFromHumanMarkdown` 入口并准备整包；Vampire 原 Bite 完整来源切片的当前编号/完整原文名引用也通过同一入口。它们不是修补后重新计分的冻结首答，不证明新模型能稳定填写正确。

**PARTIAL：原产品总体目标。** 原始冻结 Company/Vampire 全部候选仍因来源主体/译名未绑定、目标遗漏或真实矛盾而阻断。新的提示约定已经实现，但未新增真实模型调用，因此没有新的准确率、速度或费用数据。安装、原生卡片点击、Foundry 导入与实机接受均 **NOT_EXECUTED**；未操作世界、提交、合并、push 或部署。

## Company：保留中立分类与条件半伤

旧 CLI 的未知类型会默认 `mwak`，不能作为来源事实。核对完整本地 dnd5e **5.3.3** 精确源码，原生 Attack 的缺省分类也会回填 weapon；因此新增显式 `melee/ranged` SourceOperation 契约，生成明确标记的 Utility 通用检定和独立 Damage，不借武器/法术类型取得通过。Utility 的公式、prompt/visible 等字段对照该版本 `module/data/activity/utility-data.mjs` 与 Utility 执行代码；reference manifest 校验通过。

当前范围是来源精确单模式的未分类 `Melee/Ranged Attack [Roll]:`。既有复合模式的历史兼容保持原边界，不据此宣布所有未分类语法均支持。已注明 Weapon/Spell 的来源仍按真实分类处理；把精确未分类来源伪装成 `mwak/rwak` 在共享契约层也拒绝。

- 完整 Company 的 Spindly Shred 读回为 `1d20+10` 通用检定、reach **0**，没有 native Attack 或 Weapon Item；命中后伤害仅一份 `10d8+4 slashing`。
- 两个可证明的全额/半额分支保存为一份完整基准骰式及 `damageAdjustment`：来源主体 `the company`、`source-actor-bloodied`、乘数 **0.5** 和精确引文。没有除骰子、叠加第二份伤害或删除条件。
- GM 按原文判断优势/劣势、命中、重击和半伤；不调用原生 Attack 钩子，不自动改 HP。完整 Grappled、escape DC 18 和 Bonus Action 逃脱规则保留在同一 Item。
- 独立每日次数与中立攻击/Save 跨 Item 共享池均有正例；主操作消费一次，命中伤害后续消费为零。无目标资格来源时不猜 creature；reach 0、远程长射程及来源明确 object 均独立核对。
- 闭合条件支持自身 Bloodied 的明确全额/半额对；错误因子、主体、状态、骰式、重复/缺失分支、输出伤害改输入减伤仍拒绝。不宣称任意自然语言条件倍率均支持。

实际产品 owner：`packages/models/src/sourceAttackAdjustment.ts` / `sourceOperations.ts`、`packages/intake-ai/src/category-form-v2-damage-adjustment.ts` / `category-form-v2-adapter.ts`、`packages/generation/src/gm-attack-activities.ts` / `actor.ts`、`packages/intake-ai/src/verifier.ts`。staged 的旧主解析器不能覆盖已经由来源证明的中立类型，仍须逐项核对命中值和距离。

## Vampire：来源身份绑定

恢复对象接受 `self/自身` 或当前来源已证明的原文 Actor 名称。动态恢复的动作关系在既有文本字段中使用 `[当前特性编号]` 或 `[唯一完整原文名]`；必须同时证明当前 source hash、分区、父特性和完整引文。编号过期、名字不唯一、短称/译名、其他动作、legendary 引用和修改过的分区不能借证。没有建立“吸血鬼→vampire”或“啃咬→Bite”词典，也不将冻结值改为 self。

原完整 `Bite (Bat or Vampire Form Only)` 来源切片分别以编号、完整原名的新契约回复通过实际 mod 入口。读回仍是来源武器攻击及两份真实伤害，不制造 Heal Activity；实际死灵伤害量恢复、生命上限降低、长休、死亡和 vampire spawn 规则完整交给 GM。该切片有独立来源身份，不能提升为整只 Vampire 接受。未绑定恢复对象、错误动作引用及遗漏 one creature 的负例均拒绝。

## 冻结正式链复验

最终回放：任务私有目录 `.local/forge-v2-bw-integration-20261020/formal-replay-2026-10-20T06-49-55-818Z.json`；其实现哈希清单在收尾时再次逐项核对。原冻结 **343** 文件 SHA-256 全部保持；本次回放 **0 真实 HTTP、54 fake transport**。BC 是明确标记的冻结类别首答离线合并，不是新 BW 测量。R3/R4 的编号映射只用于既有来源单元身份，不修改回复机械内容。

| 完整来源 | BC | BW |
| --- | --- | --- |
| R1 Giant Boar | 3/3 ready_for_gm_review + prepared | 3/3 ready_for_gm_review + prepared |
| R2 Company | 0/3，全部阻断 | 0/3，全部阻断 |
| R3 Adult Red Dragon | 0/3，全部阻断 | 3/3 ready_for_gm_review + prepared |
| R4 Vampire | 0/3，全部阻断 | 0/3，全部阻断 |

9 份接受的完整候选均通过最终伤害篡改拒绝。另有 **15** 份明确标记新来源身份的冻结单特性切片：Weaverot Volley 5、Toxic Emission 4、Charm 6；全部正式生成、prepared，且 Save DC 篡改拒绝。它们保持能力层计数，不计整只怪接受。

新中立/倍率实现使 Company 不再仅报“不支持分类/倍率”，但冻结的未绑定条件主体、来源缺定义与真实语义冲突仍失败。BC R2 第二份明确暴露 `V2_DAMAGE_ADJUSTMENT_DIRECTION_CONFLICT`，拒绝将造成伤害误写为受到伤害；BW R2 第二份 Weaverot/Toxic 的真实集合目标遗漏继续 `V2_TARGET_OMITTED`。Vampire 未绑定译名仍待审，BW 第2/3份目标遗漏与“啃咬”引用继续拒绝；BW 第1份在较早治疗主体失败处停止，未到达的后项不计通过。历史来源语义评审确认的 BW 三份/BC 第二份 one creature 遗漏仍保留原结论。

历史首答评审 **BC 9/12、BW 6/12**，窄格式规范化 **9/12、8/12** 不改；这些与正式链 9/24 是不同判定层。没有以删字段、放宽来源校验或把失败切片排出分母提升评分。

## 回归、反证与已知失败

新增检查对应中立契约、条件关系、跨包消费者、资源消费、当前身份及最终投影；共享来源分类变化才触发 native 整合组，文档更新不驱动业务重跑。

| 检查 | 实际结果 |
| --- | --- |
| `bun run test:forge-v2-bw` | 62 pass / 0 fail，497 断言；包括完整 Company、Bite 编号/原名、新契约和负例 |
| 受影响既有组 | 308 pass / 3 skip / 0 fail，1686 断言 |
| bundle / release archive | 3 pass / 0 fail，14 断言 |
| `typecheck:packages` / `typecheck:foundry-modules` | PASS |
| `architecture:verify` | PASS；1476 modules / 3911 dependencies，无依赖违规或环 |
| 14 个改动生产源码局部 anti-overfit | PASS |
| `references verify dnd5e-5.3.3` | PASS |
| 手册人工 review / build / check | 33 项 PASS；生成 HTML 内新能力、限制与引用已读回 |
| `test:forge-native-basics` | 1225 pass / **5 fail**，7988 断言；保留原有 external-area 失败，不能称全绿 |
| `typecheck:all` | **FAIL：21 条既有诊断**；去除行列号后与上批两文件诊断多重集一致，新增为 0 |

最终产物反例包含公式 +99、半伤元数据篡改/删除、重复伤害、法位/scaling、模板/目标数/override/分类；中立攻击混入 AoE/save/heal 等未知组合也拒绝。审查发现的 sourceText 非字符串异常、共享 OP 伪装分类绕过、最终投影消费/模板遗漏均已修复并保留反例。独立源码复审无新增 P1/P2；执行证据来自以上实际检查。

共享分类严格化曾新增拒绝 10 项旧测试输入：原来源未写 Weapon，测试却写 mwak。原四份历史语料 JSON 不改，新增原输入必须拒绝断言；另建明确的新中立契约变体，只改类型，恢复类型后与原全部结构相等，继续检验数字、条件、资源与正式生成。Taloned Paws 同样保留旧分类拒绝、完整 LF/CRLF 原文和篡改检查。Solar 旧复合模式保持原范围。不能把这些新变体记作原模型首答通过。

原 5 项失败是 external area placement、Conjure Celestial、existing external-area 正/反例、Cloudkill；上批只读 HEAD 加载已证明同样失败，证据保留在 `compatibility-area-head.log`。本轮 native 仍显式失败。原独立 v12 renderer/verifier 夹具失败也未修复/未提升为通过。初次 architecture 与 bundle 并行时遇到临时 dist 的 ENOENT，bundle 的有效 3 pass 保留；bundle 完成后单独顺序补跑 architecture 通过。

本轮曾发现 3 条新增测试类型错误，已修正 verifier 参数及 proof 字符串收窄；最终 all-types 与旧 21 条完全一致。最后仅改变测试调用/断言与说明，产品实现未变，冻结回放哈希继续有效。当前 MD、两个 README、手册条目与生成 HTML 同步；人工 review/build/check 的最终结果及原 dirty/冻结保护核对写入新的 `neutral-final-receipt.json`，不覆盖上批收据。

## 下一验收边界

本次授权的离线实施已完成；仍需用将来明确授权的新真实回复衡量稳定身份/self 提示能否减少干预，并在授权的 Foundry 目标中验证实际点击、卡片、消费和导入读回。当前不以历史性能优势宣称新版本提速/省费，也不修补冻结错误冒充完整 Company/Vampire 通过。
