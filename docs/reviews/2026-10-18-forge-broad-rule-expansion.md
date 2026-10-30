# Forge 继续扩样：规则归属、前提、分支与次数

日期：2026-10-18。状态：**本轮调研和诊断完成；确认 3 类共性缺陷，另有 1 类表示缺口。本轮没有修改产品实现。**

## 1. 问题的原因是什么

这次新增 **63 个来源案例、76 个能力单元，覆盖 9 类规则关系**。案例使用合成基础属性和有出处的规则结构，不是 63 个真实怪物，也不是 63 个互不相关的 bug。没有通过换名字、重复属性种子来增加本轮案例数。

目前最有依据的结论是：问题仍然集中在**数字、状态和动作属于谁，以及什么句子真正授予可执行能力**。继续给半血机制增加几个近义句，不能解决这几类问题。

| 优先级 | 已观察到的问题 | 当前代码能够解释的原因 | 实际影响及限制 |
|---|---|---|---|
| P0 | 三种原文没有每日次数的能力，普通入口接受额外的 `uses={max:6,period:day}` | `validator.ts` 的 GM-manual 白名单允许 uses/recharge，但这条分支没有像 sourceOperations 一样对照来源资源。`verifier.ts` 的 GM 分支核对正文、Utility 与非执行性后提前结束，没有补查凭空计数。 | 最终三个 Item 确实出现每日 6 次计数。其 Utility **没有 consumption**；不能据此宣称已证明“每天六次会强制卡住”或 hook 会阻断工作。 |
| P1 | 触须、受控锁链有自己的 AC20，本体 AC15 正确仍被拒 | `validateExplicitAcConflicts()` 对整个候选扫描所有 AC 数字，把不同对象的 AC 当成同一本体的冲突声明。 | Roper、Chain Devil 两个案例 × 两入口均拒绝。官方原能力段落也可复现。 |
| P1 | 隐形的结束条件、别人施法后储存法术，被要求填写施法资料 | `sourceSingleSpellAction()` 把结束条件中的 `casts a spell` 识别成法术名 `a spell`，把储法原文里穿戴者的施法识别成 `the spell on the guardian`。调用者据此进入必须有结构化施法资料的路线。 | 两个案例 × 两入口均被拒；官方原文段落复现，已有函数直接读回支持此根因。不是实际缺少一个已命名、由本生物获得的法术。 |
| P2 | “使用以下一种吐息”，后接两个具名段落、共享一次充能，当前 alternative 提案被拒 | `sourceAlternativeChoice()` 只接受新句开头 Or/Alternatively，或同一句中的豁免选择；没有把前面的“以下一种”与随后具名子段落绑定。 | 普通、分步入口都得到 `relationship/unproven-alternative`。这是本次表示尝试的支持缺口；没有证明所有可能表示都失败，也没有验证共享充能的原生连线。 |

对应代码：

- `packages/intake-ai/src/validator.ts`：GM-manual 字段边界与 `validateExplicitAcConflicts()`。
- `packages/intake-ai/src/verifier.ts`：GM-manual 分支的计数核对缺口。
- `packages/models/src/sourceRuleFacts.ts`：`sourceSingleSpellAction()`。
- `packages/models/src/sourceOperations.ts`：`sourceAlternativeChoice()`。
- `packages/intake-ai/src/staged-feature-mechanics.ts`：sourceOperations 已有来源资源比对，可作为后续修复的复用点。

## 2. 证据是什么

### 外部原文与同类故障

规则判据是 [Wizards 官方 SRD 5.1](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf)，属于 **2014 规则**。物理 PDF 页码逐栏核对；没有用 2024 数值替代。已存在的原始 PDF SHA-256 为 `2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0`。本轮新增分栏证据为 `.local/forge-broad-rule-expansion-20261018/srd-new-columns.json` 和 `srd-holdout-columns.json`，共 31 页。

同步读取了 Foundry dnd5e **5.3.3 固定提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`** 的官方原文，包括 [Grasping Tendrils](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsterfeatures/grasping-tendrils.yml)、[Spell Storing](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsterfeatures/spell-storing.yml)、[Gibbering](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsterfeatures/gibbering.yml)。研究执行器另读取了该提交中的 20 个相关 feature/monster 原文；这些浏览返回留在会话中，根任务为上述三个关键条目另保存了提取文件。

不能把官方 pack 当作规则原文的自动替代品。本次比对发现：generic Gibbering 的一个分支把不行动的对象写成 monster，PDF p314 右栏写的是受影响 creature；Adult Bronze Dragon pack 的 Lightning Breath 写 120×10 ft，PDF p294 右栏是 90×5 ft。本轮后者以 PDF 为模板，伤害与 DC 使用明确标记的合成数值。这里只记录具体文本差异，未据此批量更改官方资料。

还读了同类工具的原始故障报告 [Fantasy Statblocks #476](https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/issues/476)。报告者提供导入前后材料，称非 SRD 自制生物出现 AC 留空、施法丢失及伤害骰改变；后续用户提供了复现与不同护甲字段的分析。帖中版本为 Obsidian 1.7.7 / 插件 4.8.1，**不是本项目版本，也没有证明本项目与其根因相同**。它支持“不能只测已知 SRD 名单、要看字段转换和完整原文”的验证方向；没有拿外部帖代替本地复现，也没有安装该插件。保存于 `original-issue-476.md`。

AnySearch 初始三条定向检索、原始 issue 与固定提交文本提取均成功。官方 PDF 的本次 `web.open` 超时，故复用已下载、哈希相同的官方文件逐栏核对；没有把失败检索算成来源。大型 Tarrasque YAML 提取超过工具上限，研究执行器改读其独立 feature 与 PDF，未重复重试整文件。调研是定向规则采样，不是外部模块热度排行。待判断安装／本地化工具：**无**。

### 这次覆盖哪些关系

| 关系 | 案例数 | 本轮新例子 |
|---|---:|---|
| 对象与使用资格 | 14 | 已恐惧才可死亡凝视；触须有独立 AC/HP；尾巴自动命中仅限自己擒抱的目标 |
| 数值计算与归属 | 13 | 最大 HP 和当前 HP；力量减值骰不是伤害骰；伤害向上取整转给另一生物 |
| 选择与先后依赖 | 8 | 先命中才追加攻击；成功但拒绝位移仍按失败；随机行为表 |
| 次数、容量与共享 | 7 | 当前头数、同时触须上限、三次咆哮依序改变、两种吐息共充能 |
| 引用其他能力 | 6 | 多攻引用当前头数；触须→拉回→咬；替换其中一次攻击；已计入的额外骰 |
| 阶段和回合时机 | 4 | 疾病延迟生效、持续伤害、火伤劣势结束时机、噩梦持续一小时 |
| 结束和重投规则 | 4 | 跨位面结束；歌声维持与伤害来源例外；隐形终止；复起可被阻止 |
| 否定、例外与逻辑连接 | 4 | 两种感官都失效才失去感知；只拒绝特定预言；骰面≤5并非失败5点 |
| 环境与位面范围 | 3 | 限水下接触；同位面追踪；非魔法且未经加工的土石 |

### 执行方法与结果

复用原开发副本 `20261006-111625-bettermonsters-eye-deep-sample`。使用固定 Bun **1.3.14+0d9b296af**，正式生成参数为 **v14 / core / icon off**，目标约定 Foundry 14.364 / dnd5e 5.3.3。

每个案例都走普通完整提案、分步 auto 两入口。输入模型回复和分段是固定离线提案，但其后经过真实的来源绑定 → validator → renderer → 公开 workflow → parser/generation → verifier。最终 Actor 没有手写或修改。独立断言同时查看来源正文、基础属性、能力清单、证据坐标、实际攻击/豁免/伤害数据、错误附加状态和资源。

**最终矩阵 360 项：126 项正确对照，234 项错误／漏文对照。**

| 类型 | 数量 | 意义 |
|---|---:|---|
| 正确对照通过 | 116 | 58 个案例在两个入口均通过；可能是完整 GM 规则或原生检定＋GM 后续 |
| 正确来源的当前表示被拒 | 10 | 上述 5 个案例 × 两入口；不能当作成功生成 |
| 错误／漏文提案被业务检查拒绝 | 197 | 正确对照先通过，且有明确业务 findings 或错误码；不是意外异常 |
| 错误提案下结果仍正确 | 10 | 来源快速路径可能未请求该错误提案；不宣称 AI 错误被修复 |
| 错误提案被放行 | 3 | 三项凭空每日六次的计数进入最终 Item |
| 负例拒绝但无法证明防护有效 | 24 | 对应正确来源的对照未通过，故不计入已防住 |

负例细分：126 项删条件／翻关系，100 项结构化错值，8 项把附肢数据错填成本体。没有把这些次数称为独立怪物数量。

最终输出是 `.local/forge-broad-rule-expansion-20261018/final-matrix/report.json` 和 `artifacts.json`。诊断退出 **1 / GAPS_FOUND**，这是发现问题的证据，不是全通过。`bun run typecheck:all` 最终通过。

显式复验命令（使用新的输出目录，脚本排他写入，保留旧失败）：

```powershell
# 本机已有的 CI 固定运行时；只影响当前进程与子进程。
$env:PATH='C:/Users/Administrator/AppData/Local/Temp/bun-node-0d9b296af;'+$env:PATH
bun tests/diagnostics/forge-broad-rule-audit.ts .local/forge-broad-rule-expansion-20261018/new-run
```

脚本不会进入默认 CI 或 hook。没有为本轮新增每次工作的强制检查，也没有每次生成再调用一个 AI 的流程。

### 排除测试构造问题与保留失败

早期 `probe-1`、`root-42`、`root-42-valid-proposals`、`broad-63` 和 `complex-proposals-2` 均保留。部分初始提案只交了正文，没有交现有契约要求的基础 Attack/Save；这些不是产品故障。普通原生武器的伤害可能位于 Item base，由 activity.includeBase 加一次属性修正；诊断已按该现有格式核对，没有把空 damage.parts 误认作漏伤害。

三次咆哮最初错误声明为任选 alternative；旋风最初的碰撞顺序与豁免后半伤害绑定提案也不合适。改为**完整原文＋独立 GM 触发的后续豁免和伤害**后，两者均通过。伤害由 GM 按正文决定和减半，不能称为自动依序咆哮、自动碰撞、自动减半或自动维护共享次数。

Nightmare Haunting 的普通提案有来源支持的每日一次计数，分步路径保留完整每日一次文字但没有原生计数。在本轮允许完整 GM 处理的边界下通过，**不声称两入口均配置了原生计数**；旧 mismatch 证据保留。共享次数／充能的原生连线尚未被本轮完整证明。

吐息与官方锁链标题含资源后缀，早期分步假模型按短名查找而返回 HarnessUnknownFeature；修正测试名称绑定后才形成最终产品拒绝证据。`literal-source-readback.json` 的锁链分步项也是这一测试错误；其余七项仍有效，仅补跑实际缺失的一项，保存在 `literal-chain-staged-retry.json`，没有重跑已有效的七项。

原文复验还直接读回了函数结果：隐形原段落的伪法术名是 `a spell`；储法原段落的伪法术名是 `the spell on the guardian`。因此施法误路由不是仅从错误提示猜测。

### 63 项可追溯案例

以下“通过”均指本轮离线链和声明的 GM 边界；不意味着高级规则自动执行。表内每个 ID 的完整 source、证据和产物在 corpus／final-matrix 中。

| ID | 新规则／断言 | SRD5.1 物理页与能力 | 最终正确对照 |
|---|---|---|---|
| telepathy-dual-condition | 读心同时要求交流和看得见 | 261 left, Aboleth Probing Telepathy | 两入口通过 |
| contact-aura-underwater | 触碰光环限水下和近距离命中 | 261 left, Aboleth Mucous Cloud | 两入口通过 |
| disease-delayed-phase | 疾病先延迟后改变治疗和解除条件 | 261 left, Aboleth Tentacle | 两入口通过 |
| charm-lifetime-distance | 魅惑跨位面终止和两种重投时机 | 261 right, Aboleth Enslave | 两入口通过 |
| flying-weapon-not-owner-speed | 飞剑的移动不能填进生物飞行速度 | 263 left, Solar Flying Sword | 两入口通过 |
| external-caster-dynamic-dc | 反魔法中的难度取自施法者 | 263 right-264 left, Animated Armor Antimagic Susceptibility | 两入口通过 |
| grappler-damage-share | 擒抱时自身受伤才分给被擒抱者 | 264 right, Rug Damage Transfer | 两入口通过 |
| smother-target-turn-delay | 命中无立即伤害而在目标回合持续伤害 | 264 right, Rug Smother | 两入口通过 |
| max-hp-not-current-hp | 攻击后减少生命上限并非又扣一次当前血量 | 316 left, Clay Golem Slam | 两入口通过 |
| berserk-nearest-random | 狂暴含自身体力门槛随机骰与最近对象 | 316 left, Clay Golem Berserk | 两入口通过 |
| creator-calming-check | 创造者花动作检定而非生物自行豁免 | 316 right, Flesh Golem Berserk | 两入口通过 |
| fire-aversion-until-next-end | 火焰后的劣势到自身下回合结束 | 316 right, Flesh Golem Aversion of Fire | 两入口通过 |
| damage-absorption-derived-heal | 吸收伤害后的回血数量取决于被免除的伤害 | 317 left, Iron Golem Fire Absorption | 两入口通过 |
| slow-exclusive-action-choice | 迟缓后动作与附赠动作二选一 | 317 right, Stone Golem Slow | 两入口通过 |
| charge-distance-hit-same-turn | 冲锋须直线移动后同回合命中才能触发 | 318 left, Gorgon Trampling Charge | 两入口通过 |
| multiattack-hit-conditional | 先命中才能对同一目标追加攻击 | 318 left-right, Grick Multiattack | 两入口通过 |
| blind-senses-conjunctive-loss | 只有聋且不能嗅闻才失去特殊感知 | 319 left, Grimlock Blind Senses | 两入口通过 |
| mimicry-opposed-check-not-save | 识破模仿声音是观察者洞悉检定 | 319 left, Green Hag Mimicry | 两入口通过 |
| illusion-touch-versus-visual | 实物触碰与视觉检定采用不同识破方式 | 319 right, Green Hag Illusory Appearance | 两入口通过 |
| weapon-corrosion-cumulative | 金属武器命中后累积减伤而非降低怪物属性 | 338 right, Gray Ooze Corrode Metal | 两入口通过 |
| armor-corrosion-current-offered-ac | 护甲累积减值达到AC阈值才损毁 | 338 right, Gray Ooze Pseudopod | 两入口通过 |
| engulf-success-optional-failure | 豁免成功但拒绝位移仍按失败处理 | 338 left, Gelatinous Cube Engulf | 两入口通过 |
| engulf-mixed-capacity | 吞容上限按体型分组而非动作次数 | 337 right-338 left, Gelatinous Cube Ooze Cube | 两入口通过；假计数漏检 |
| strength-drain-not-extra-damage | 减力量的骰不应变成额外伤害 | 345 left, Shadow Strength Drain | 两入口通过 |
| bound-damage-round-up | 护符主人受伤转一半向上取整给守卫 | 345 right, Shield Guardian Bound | 两入口通过 |
| stored-spell-replace-original-caster | 储法消耗旧法术且沿用原施法者参数 | 345 right, Shield Guardian Spell Storing | 两入口拒绝当前表示 |
| roar-ordinal-shared-sequence | 三次咆哮是共用次数依序换结果 | 347 right-348 left, Androsphinx Roar | 两入口通过 |
| divination-refusal-polarity | 只有拒绝的预言法术才免疫 | 347 right, Androsphinx Inscrutable | 两入口通过 |
| flat-roll-threshold-not-margin | 骰面结果低于等于5不同于失败5点 | 349 left, Sprite Shortbow | 两入口通过 |
| creature-type-automatic-save-failure | 特定生物类型自动失败而非免疫 | 349 left, Sprite Heart Sight | 两入口通过 |
| blood-loss-not-typed-damage | 附着后不攻击而按自身回合失去HP | 349 left, Stirge Blood Drain | 两入口通过 |
| invisibility-break-and-concentration | 隐形遇攻击施法或失专注终止 | 349 left, Sprite Invisibility | 两入口拒绝当前表示 |
| charm-one-target-replacement | 新魅惑成功会结束旧目标魅惑 | 349 right, Succubus Charm | 两入口通过 |
| bite-dependent-target-owner | 咬目标必须自愿或被自身擒抱等 | 354 right, Vampire Spawn Bite | 两入口通过 |
| grapple-instead-of-hit-damage | 爪击可用擒抱替代伤害而非同时 | 354 left, Vampire Spawn Claws | 两入口通过 |
| rising-undead-exceptions-and-cap | 死者延迟复起但复活毁尸可阻止且控数有限 | 354 right-355 left, Wight Life Drain | 两入口通过 |
| consume-zero-alive-conditional-heal | 零HP仍活着才可收割且死后才回血 | 355 left, Will-o-Wisp Consume Life | 两入口通过 |
| incorporeal-self-penalty | 穿墙代价是自身回合结束在物体内才受伤 | 355 left, Will-o-Wisp Incorporeal Movement | 两入口通过 |
| multiattack-melee-ranged-counts | 近战三次与远程两次互斥且引用不同攻击 | 397 left, Bandit Captain Multiattack | 两入口通过 |
| reckless-two-opposite-owners | 自身优势到本回合而被打优势到下回合 | 397 right, Berserker Reckless | 两入口通过 |
| included-dice-not-double-counted | 特性写已计入攻击不可再叠一遍伤害骰 | 399 right, Gladiator Brute; p263 Angelic Weapons | 两入口通过 |
| life-drain-substitute-one-attack | 多攻可把其中一次近战换成吸命而非追加 | 354 right-355 left, Wight Multiattack | 两入口通过 |
| hydra-head-count-state | 头数阈值按同回合累计且再生头不受初始数上限 | 323 left, Hydra Multiple Heads | 两入口通过；假计数漏检 |
| hydra-opportunity-only-reactions | 额外反应仅可用于借机攻击 | 323 left, Hydra Reactive Heads | 两入口通过；假计数漏检 |
| hydra-variable-multiattack | 多攻次数引用当前头数而非固定五次 | 323 right, Hydra Multiattack | 两入口通过 |
| roper-independent-appendage-hp | 触须各有AC与HP且打断不伤本体 | 342 right, Roper Grasping Tendrils | 两入口拒绝当前表示 |
| roper-ordered-multiattack-reference | 四触须再拉回再咬并绑定自身擒抱目标 | 343 left, Roper Multiattack and Reel | 两入口通过 |
| harpy-song-upkeep-and-exceptions | 歌声需维持且危险地形和非自身伤害允许重投 | 321 right, Harpy Luring Song | 两入口通过 |
| sea-hag-frightened-prerequisite | 恐惧是目标前提而非失败后新加状态 | 320 right, Sea Hag Death Glare | 两入口通过 |
| tarrasque-reflect-eligible-spells | 反射限定三类法术且需随机6才反弹 | 350 left, Tarrasque Reflective Carapace | 两入口通过 |
| siege-object-only-double | 双倍伤害只针对物件与建筑 | 350 left, Tarrasque Siege Monster | 两入口通过 |
| salamander-passive-touch-retaliation | 被别人近距离命中或触碰才返伤 | 344 left, Salamander Heated Body | 两入口通过 |
| salamander-tail-bound-target-autohit | 自动命中限已被该尾巴擒抱的目标 | 344 left, Salamander Tail | 两入口通过 |
| night-hag-duration-plane-protection | 噩梦跨位面持续一小时后减生命上限 | 320 left, Night Hag Nightmare Haunting | 两入口通过 |
| doppelganger-barriers-target-only-advantage | 读心厚度按材质计且优势仅针对所读目标 | 280 left, Doppelganger Read Thoughts | 两入口通过 |
| invisible-stalker-plane-limited-quarry | 追踪猎物限同位面且另知道召唤者位置 | 323 right, Invisible Stalker Faultless Tracker | 两入口通过 |
| chain-devil-controlled-object-actions | 受控物件独立数据且擒抱中不能攻击 | 275 right, Chain Devil Animate Chains | 两入口拒绝当前表示 |
| bearded-devil-stacking-infernal-wound | 伤口累积失HP无伤害类型且医药是检定 | 274 right-275 left, Bearded Devil Glaive | 两入口通过 |
| couatl-limited-mind-information-immunity | 防止读心定位不等于心灵伤害与状态免疫 | 269 right, Couatl Shielded Mind | 两入口通过 |
| gibbering-random-behavior-table | 行为表d8不是伤害骰且行为属于受影响者 | 314 right, Gibbering Mouther Gibbering | 两入口通过 |
| xorn-unworked-nonmagical-earth-only | 土行同时要求非魔法与未经加工并不留隧道 | 356 right, Xorn Earth Glide | 两入口通过 |
| air-elemental-collateral-different-save-target | 第一目标力量与撞到的第二目标敏捷豁免分属不同人 | 306 left, Air Elemental Whirlwind | 两入口通过 |
| bronze-breath-exclusive-shared-recharge | 两种喷吐互斥共充能且只有一种造成伤害 | 294 right, Adult Bronze Dragon Breath Weapons | 两入口拒绝当前表示 |

## 3. 解决方案是怎样的

这轮授权目标是继续找样本并验证，因此**修复建议与已修复结果分开**：本轮新增 corpus、显式诊断和报告，没有改产品代码。建议按以下共同边界修，避免每种怪物另写补丁。

1. **先补来源不明的可执行数字。** 把 sourceOperations 已有的资源来源比较复用到 GM-manual 等所有能写入计数的路线；既查最大次数，也查恢复方式。原文只有头数、容量或反应限制，就保留文字，不推断每日次数。未知高级规则仍可保留完整 GM 处理；错误模型提案应进入现有修正／复核路线，不新增全局 hook。反例同时包括凭空计数、正确每日次数、短休恢复及容量数字。
2. **再修数字与施法声明的归属。** 基础 AC 从已证明的本体头部读取；附肢、物件、临时状态中的值保留在各自能力。仍要拒绝真正冲突的本体声明，不能简单删掉 AC 冲突检查。施法只认来源实际授予的、归属明确的能力；终止条件和别人施法的引用不能触发要求本体补施法属性。保留真实法术组必须结构化的检查。
3. **最后补具名选择的范围绑定。** “以下一种”应绑定其所属子段落，并证明互斥与共享充能；不能看到任意一个 Or 就放行，也不能把互斥选项误写成连续发生。若只能完整 GM 处理，应明确显示这一边界，不生成看似有各自独立充能的两个能力。

每项修复都可以用本轮不同机制一起回归：触须和锁链共同检验归属；隐形和储法共同检验声明与引用；九头蛇、虫容和额外反应共同检验容量／次数。无需为这轮引入新的自动化框架、付费模型审核或外部模块。

后续扩样优先搜能区分这些共同判断的反例，而非继续增加同一种写法。新增候选进入同一 opt-in corpus：先确认来源、给合法提案、确认正确对照可用，再测错误。外部故障的关闭状态或官方 JSON 的存在都不能替代本项目验收。

## 边界与交付

已验证：63 个来源案例的固定提案、两入口、公开生成链、正文和受影响数据对照，保存全部失败与实际产物。代码复核独立确认三项假计数实际写入，及 AC 冲突的具体来源位置。

未验证：真实 AI 的首轮整理成功率、任意语言与说法、真实 Foundry 导入／操作／刷新、复杂规则自动执行。**前轮真实 Foundry 运行验收仍待可用连接，本轮没有把它标为完成。**

本轮只新增三份仓库文件：本报告、`tests/fixtures/forge-broad-rule-research-cases.json`、`tests/diagnostics/forge-broad-rule-audit.ts`。它们不改变用户入口、支持版本、操作或安全限制，既有手册 watch/说明未改；因此不触发手册重建。产品实现未变，复用已有回归，不重复整仓 CI、anti-overfit 或旧运行时矩阵。本轮开始时的全部 372 个 dirty/untracked 文件及前轮 33 个候选文件，最终哈希保持一致，详见 final-receipt。

无真实模型调用、模块安装、世界写入、服务重启、hook 配置、提交、合并或推送。

## SRD attribution

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
