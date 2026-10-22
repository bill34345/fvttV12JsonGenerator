# 2024 Vampire：原文、官方 Actor 与四项阻断的修复方案

日期：2026-10-20。本次用户要求先对照同一份2024 Vampire原文和官方Actor，再给出方案。本轮只读核对源码和已采集资料，写入本记录；没有修改产品、测试契约、来源、冻结回复或最终JSON，没有执行模型调用、安装或世界写入。

后续方案修正：用户指出旧CLI应只处理可处理内容。经同一2024 Misty局部实际workflow确认，旧格式可以完整描述+Utility接受，无Heal；因此下文第1项中“先证明Misty治疗对象”的要求不再作为整只生成前置。优先复用明确gm-manual边界，原生操作才要求对应机制证明，且不能用手动标签掩盖真实遗漏。详见[旧CLI手动边界核对](2026-10-20-forge-misty-escape-legacy-manual-boundary.md)。其余能力仍需按可执行部分和完整限制分别核对，不能推导四错误全部可以放行。本文件原方案保留以追溯调整依据。

## 对照身份与证据限制

- 正式文本仍为 `tests/fixtures/forge-vampire-2024-srd521.json` 内完整Vampire，source SHA `fa4306f92887058775d167f201e7c96e19de45f4dd545482e1917bad9a40c2b5`，fixture SHA `6242db718f8df5efa98190ff93453787881151b8f1485ef15eae76fa20e7331d`。来源是官方SRD5.2.1第335–336页，2024规则；不换2014输入。
- 原生实现参照仍为Monster Manual 1.3.0的 `dnd-monster-manual.actors/mmVampire0000000`，MM2024。复读前批 `official-actor-sanitized-mcp.json` 的 `fullData.items`，结合11项能力和2项关联法术的卡片采集。摘要 `items` 中的空activities不代表原生没有活动。
- 本次Mirror MCP `get_world_info` 返回module not connected；未尝试启动、重启或改用其他实例。以下官方字段结论来自前批同一Actor的已保存快照，不是本轮重新采集的实时状态或运行验证。MCP过滤所有save键，Bite CON17、两个法术WIS17由前批正常UI证据补足；没有将工具缺字段当作官方错误。
- dnd5e5.3.3源码固定提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，本轮 `bun run references verify` 通过。规则年份与软件版本分别核对。本次未开发系统新接口或查询“最新版本”。
- 前批正式链最终收据为 `.local/forge-vampire-2024-retest-20261020/vampire-2024-current-chain-2026-10-20T10-53-14-456Z.receipt.json`。体型base已SOURCE_VALIDATED，11项已进入whole-feature，但四项错误阻断，仍无完整IR/Actor/整包。

## 原文与官方实现逐项对照

| 项目 | 同一2024原文 | 指定官方Actor快照 | 当前Forge缺口 |
| --- | --- | --- | --- |
| Misty Escape | 回到休眠地后恢复吸血鬼形态，麻痹至恢复任意HP；在那里停留1小时后恢复1HP。此前还有0HP、迷雾形态、2小时及毁灭条件 | self Utility“Paralyzed”关联麻痹Effect，完整条件在描述；没有Heal活动或自动1小时恢复 | `literalFixedHealing`在逗号后得到`and it`，只接受裸`it`或明确主体，触发目标不支持 |
| Bite | CON17；5尺内一个自愿或Grappled/Incapacitated/Restrained生物；失败1d4+4穿刺、3d8黯蚀。上限减少量与恢复量都等于目标本次实际黯蚀伤害，另有Humanoid/降至0/埋葬/次日日落衍体条件 | Save/action、count=1及完整special、两类伤害、onSave=none；另有手动衍体Summon。没有动态Heal或上限降低Effect | 动态绑定只识别`is reduced`且伤害前件只识别Hit或target takes；2024的`decreases`和Failure均未进入支持语法 |
| Charm | bonus、Recharge5–6、施展Charm Person、CHA施法DC17、免全部成分、持续24小时；Bite自愿受者、Bite伤害不终止、结束后不知情 | Feature uses max=1/recharge5；bonus Cast消耗该Item的一次，关联PHB2024 Charm Person；Cast免V/S/M，法术缓存有24小时/bonus/CHA覆盖 | 组件范围识别将有效整句视为歧义；后续还有施法与次数/恢复互斥、持续时间语法和专属例外传递问题 |
| Beguile | legendary、施展Command、CHA施法DC17、免全部成分，直到自身下一回合开始前不能再次使用；传奇前言每次消耗1，预算3或巢穴4 | legendary=1 Cast关联PHB2024 Command，免V/S/M及CHA覆盖；显式consumption.targets为空，未见本能力独立冷却计数 | staged及Canonical施法只接trait/action/bonus/reaction，renderer/generation/resolver同样未完整接legendary；改一处枚举不能接通消费和限制 |

官方Cast的 `spell.properties=[vocal,somatic,material]` 是要忽略的成分集合。5.3.3 `module/documents/activity/cast.mjs:getSpellChanges()`逐项生成移除属性的变化，不能误读为仍要求全部成分。`spell.ability=cha`是施法属性；Charm Person/Command本身仍要求目标作WIS豁免，不把它们改成CHA豁免。

官方Misty Escape和Bite的复杂后果并非全自动。快照里存在Paralyzed按钮、衍体Summon，不证明自动判断时间、死亡、埋葬、实际伤害或HP上限。本次方案不从这些按钮推导未经证明的自动化。

## 原因与实施方案

### 1. 先补来源绑定：Misty Escape与Bite

Misty Escape支持有明确同主体证据的并列恢复句。不是全局删除`and`或把所有`it`当self：必须在完整能力中证明主体连续，排除另一个生物、目标及竞争指代，同时证明固定1HP和原文1小时/休眠地条件。保留完整规则作为GM操作边界；不生成无条件Heal、自动计时或错误的回合恢复。官方Paralyzed可作为后续明确GM按钮参照，但不是本次消除来源错误的必要条件。

Bite在共用动态关系owner中增加2024完整语义：Failure分支的唯一黯蚀伤害事件 → 同一目标HP上限减少 → 同一吸血鬼恢复同量实际伤害。`decreases`仅在这个受限关系内成为等价表达。原文换页断行不改变取证跨度。绑定当前能力ID/原文名、同一目标和同一伤害类型；拒绝错误引用、穿刺/总伤害代替黯蚀、打印骰式代替实际伤害、额外治疗事件及歧义前件。

产物应保留原生CON17 Save、count1与全部资格、失败伤害/成功无伤，以及完整GM后果。动态恢复、HP上限和衍体时序暂留GM，不制造固定3d8治疗或补入2014长休条文。

### 2. 共用“能力施法”的使用约束贯通：Charm与Beguile

复用并补全现有Canonical施法、portable manifest和resolver，不复制官方Actor作为输出，不建Vampire名称特判。施法授予本身、动作时机、能力资源、组件/持续时间覆盖、后果例外分别有来源证据，但必须由同一能力身份绑定。

- Charm保留Feature的1次Recharge5–6资源，Cast引用并只消费这一池一次；不把单法术的内部授予`at-will`错误呈现为可以绕过Recharge无限施放，也不复制成独立每日法术次数。
- Beguile的legendary时机及cost1贯通staged → Canonical → renderer → 生成标记 → manifest/resolver/hydrator → 实际Cast及缓存。只改staged白名单不足：`actor-spell-manifest.ts`和resolver的输入类型/守卫也只有三种普通时机。
- 组件只绑定该施法句：免全部成分落实V/S/M；普通仅免材料仍只免M。独立提取CHA、DC17、24小时，不把明确持续时间和后续后果全部吞成“歧义”，也不借其他能力的豁免。
- Charm的24小时是Cast原生覆盖；自愿Bite受者、Bite伤害不终止及结束后不知情等例外必须在能力及实际施法卡可见。通用PHB法术默认文字不能掩盖这些修改，也不全局修改合集法术。尚不能安全执行的例外明确由GM处理。
- Beguile“直到自身下一回合开始”的限制独立于传奇总池，不能改写成每日1次、一般1/turn或忽略。来源限制的保留、GM确认边界和任何原生执行分别验收；未支持的限制不能被改成空值。

### 3. 同时检查已被首错遮住的资源与下游

四个错误码消失不是整只通过。当前还可从代码直接确认：施法适配拒绝resource组合；renderer不渲染legendary casting group；生成标记/resolver拒绝legendary；resolver只对严格持续时间短语作覆盖，而填表为`duration is 24 hours`。这些应在同一契约实施时处理，不能逐次删输入追下一个错误。

巢穴模式不必另造一套数值算法。5.3.3 `npc.mjs:prepareBaseData()`已有lair.value/inside驱动的传奇抗性/动作+1及CR经验值变化，匹配本源3/4和10000/11500；官方快照也是base3、lair.value=true、inside=false。方案是证明来源符合这一具体关系后保留完整两套规则，用原生巢穴开关表达当前模式，并分别读回内外结果。不能固定写4后又加1，也不能泛化到任意条件资源。

传奇Cast显式targets为空不等于没有扣次。5.3.3 `config.mjs`的legendary.consume和Activity mixin `_prepareUsageUpdates()`会按activation.value扣legact，且对显式相同attribute消费做去重。因此优先沿原生legendary=1路径，并验证实际只扣1，不能再叠加另一层自制扣次。普通Item Recharge则仍需要精确itemUses绑定。

另有必须保留的版本边界：同源写自身回合开始恢复传奇次数，而5.3.3 `npc.mjs:recoverCombatUses()`在turnEnd恢复。不能将它们宣称相同；实现时先用同一目标的最小回合边界检查确认差异，再确定仅对本模块管理资源生效的适配或明确GM管理方式。未证明准确时不宣布自动时序验收通过，不全局改系统或其他Actor。Beguile自身冷却同样不能用总池恢复代替。

## 验收与次序

1. 先完成两个治疗来源绑定的正反例；复用同一源与同一独立正确填写契约。冻结首答有真实遗漏的继续阻断。
2. 再做Charm/Beguile共用能力施法契约，联动全部消费者；核对组件、时机、资源、持续时间和可见例外，而非只将四项错误改绿。
3. 重跑同一2024完整源正式入口，逐项对照全部11能力、两关联法术、Medium/Small、巢穴3/4和XP两模式。仍有遗漏或冲突则保留needs_review，无效产物不得导入。
4. 正式产物及来源验收通过后，才正常导入本地候选，实际使用Bite、Charm、Beguile，检查Recharge只扣一次、传奇只扣1、冷却/回合恢复、法术缓存和刷新持久化；正常清理任务对象，保持共享服务及原场景。

本轮没有执行以上新实现或运行验收。现有多体型PASS和原四错误FAIL继续有效；不新增真实模型调用。Mirror未连接是本轮重新采集的工具限制，不改变已有来源证据或授权，也不借此修复服务。

## 定位与后续复查

当前源码入口：`category-form-v2-adapter.ts:literalFixedHealing/spellcasting`、`category-form-v2-healing.ts:sourceRelation`、`staged-spellcasting.ts:sourceGroupComponentClause/stagedSpellcastingGroups`、CanonicalMonster施法组、renderer的castingFeatures/manifest、`generation/actor-spell-manifest.ts`、`monster-spell-resolver/src/cast-activity.ts`及hydrator。接口改动须按实际消费者补反例；不是新增一层绕过现有守卫。

没有外部模块引入或待判断本地化候选。官方Actor只作已有原生表达参照；新版本复查需重新核对精确条目、组件忽略语义、传奇自动扣次、巢穴派生及回合恢复，不能将本记录静态结论当作新版运行PASS。
