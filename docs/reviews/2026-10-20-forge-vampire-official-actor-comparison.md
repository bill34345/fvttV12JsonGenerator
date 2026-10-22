# Forge Vampire 与本地官方 Actor 对照

日期：2026-10-20。用户要求对照 Monster Manual 合集中的官方 Vampire。本轮只读比较本地合集、当前正式产物及上批刷新后的原生文档，不修补 Actor、不改变来源、冻结回复或校验，也不新增真实模型调用。工作树沿用 `20261019-forge-ab-fixed-replies`。

## 结论与对照身份

**VERIFIED：已找到用户指定的官方模块条目，同时发现它与本轮输入不同版。** 本机 `dnd-monster-manual` 1.3.0 的 `dnd-monster-manual.actors / mmVampire0000000` 标记 `MM 2024`、`rules=2024`；本轮完整 Vampire 来源是 SRD5.1 / 2014，源 SHA `df2887243768f2b0949098e86289f67cdae94fd945450f6e21f4674177677611`，原来源路径和上批收据保持。

因此先按要求读取 MM 条目，再补系统自带 `dnd5e.monsters / DDO9lDCDtNHkfShP`（SRD5.1、`rules=2014`）作同版控制。后者不替代用户指定合集；它用于区分版本差异和生成投影差距。

| 项目 | Monster Manual 当前本地条目 | 同版 SRD 官方条目 / 本轮 Forge |
| --- | --- | --- |
| HP | 195，23d8+92 | 均144，17d8+68 |
| 速度 | 步行40、攀爬40尺 | 均步行30尺；Spider Climb另有规则 |
| Bite | CON17 Save；1d4+4穿刺及3d8黯蚀 | 2014为+9 Attack；1d6+4穿刺及3d6黯蚀 |
| Charm | 带recharge5的附赠动作Cast，关联Charm Person | 2014为动作、30尺、WIS17的怪物能力 |
| 能力组织 | Grave Strike、Shape-Shift、Beguile、Deathless Strike及关联Spell/Summon等 | 2014有Shapechanger、Regeneration、Children of the Night、Move/Unarmed/Bite等 |

这些新版数值和能力变化不能直接记为 Forge 的错误，尤其不能把2014 Bite改成CON Save，或凭新版条目给旧来源新增法术/召唤。当前MM Actor共13个Item，SRD和Forge各15个；Item个数不能作为能力完整性结论，SRD含传奇说明Item，而Forge另有完整限定抗性GM Item。

## 同版比较：一致的部分

六属性18/18/18/17/15/18、AC数值16、HP144、步行30尺、CR13、DEX/WIS/CHA熟练豁免及Perception/Stealth熟练均核对一致。步行数据存在官方字符串`"30"`和生成数字`30`的表示差异，比较只将这个已知数值表示归一；AC的`natural`与`flat`配置未宣称对所有后续修改等价。

2014 Bite的攻击、两类伤害、5尺及完整受者资格在Forge保留；官方通过Weapon base加Activity附伤表达，Forge通过明确固定命中及Activity damage parts表达，不要求JSON结构逐字相等。来源的14个原能力仍有落点，动态恢复、HP-max、长休、死亡和衍体规则没有删掉。

**这只证明对应来源和字段的有界一致，不代表已达到官方所有原生功能。** 上批正常导入、实际攻击/伤害与刷新证据仍有效；下列差距不能再用这些已通过的证据覆盖。

## 新确认的差距

| 项目 | 同版官方数据 | 当前 Forge 正式产物及上批原生读回 | 判断 |
| --- | --- | --- | --- |
| Charm动作时机 | Save的activation为`action`；UI显示动作、30尺、24小时、WIS17 | IR.activationType为`action`，但唯一Save的SourceOP.relationship为`follow-up`，最终及持久化activation为`special` | 明确的来源动作投影差异；完整正文不能代替正确动作字段 |
| Bite数量 | `affects.count="1"`，同时保留完整`special`资格 | count为空，完整资格在special；填写表中的1未丢，但未落到原生数量 | 原生字段缺口；不能宣称已有数量1配置或验证执行 |
| 传奇动作 | 预算3；Move/Unarmed/Bite费用1/1/2，Activity配置attribute消费`resources.legact.value`的1/1/2 | 预算及费用标签一致，但原生Activity的consumption.targets全空 | 计数和标签保留，不等于接通原生扣次 |
| 传奇抗性、夜之子 | Actor.legres最大3并绑定消费；Children Item最大1、绑定itemUses消费 | Actor.legres最大0；Legendary Resistance在Item记3/day、Children记1/day，两个Utility均无消费绑定 | 有手动记录，缺原生资源连接；不能把数量字段通过写成消费功能通过 |
| 固定再生 | 独立`heal`、self、`turnStart`、固定20；完整条件仍在正文 | 完整Regeneration原文保留，但只有Utility | 固定治疗按钮差距；与Bite按实际黯蚀量恢复的动态关系分开处理 |

Charm的链路已在现有源码定位：`packages/intake-ai/src/category-form-v2-adapter.ts:279`把含条件的Save即使是首个操作也标成follow-up；`packages/generation/src/actor.ts:1027`将follow-up改为special。此处“目标能看到吸血鬼”是主Save的适用资格，不足以证明它是另一个主操作的后续。新明确契约的填写表没有要求把Charm改成后续；问题来自当前适配/投影语义，需要通用反例，而不是按Vampire名称特判。

其余资源/再生差距也不是丢失原文：当前GM-manual契约主动限制执行。官方实现说明应进一步区分“GM判断并执行复杂效果”与“GM确认后记录已知资源／点击固定数值按钮”，不能因为特殊后果留GM就一并清空普通资源或操作，也不能给全部手动项盲目添加消费。

## 应继续保留的边界

- 同版官方Bite也没有独立Heal或HP-max减损Effect；本次数据没有证明它自动计算实际黯蚀恢复量、处理长休/死亡/衍体生命周期。Forge不制造假Heal的判断仍成立，不能把“官方”推定为全自动。
- 2014官方的传奇Unarmed/Bite本身也是Utility，并非直接复制Attack。应补可证明的资源绑定，而不是顺带新增自动串攻击。
- 官方把物理抗性与`mgc` bypass放入traits；Forge原生只保留necrotic，完整非魔法物理抗性另交GM。规则保留与原生结算是不同层，不能直接复制一组bypass后就假定全部限定准确。
- 2024条目确有Grappled Effect、Escape Check、衍体/蝙蝠Summon等原生实现，值得作为接口参照；不是2014源规则可以直接照搬的完整替代品。

## 证据方式与工具限制

目标是唯一Mirror `http://127.0.0.1:30001` / `cor-cotn` / Core14.368 / dnd5e5.3.3。普通MCP只读发现并读取两个确切合集Actor；官方Chrome同任务执行器实际Sol/medium、never、danger-full-access，只打开锁定合集及其卡片，不解锁、不保存、不使用能力。当前本机存在中文化层，数据和截图是本地官方模块条目的当前呈现，不声称是未修改的官方原始发布字节。

MCP的`fullData`也不是未经处理的完整原始JSON。实装bridge的`dist/data-access.js:3113`附近全局过滤名为`save`的字段，后续serializer同样过滤save对象；不能把返回里缺少save属性判为官方没有配置。MM Bite的CON17及同版Charm的WIS17由正常只读UI另外核对。锁定合集的活动配置按钮禁用，本次未解锁；没有执行官方攻击、治疗、扣次或运行时效果，不以字段绑定宣称已实测消费。

私有证据在 `.local/forge-vampire-official-comparison-20261020/`：

- `monster-manual-vampire-readonly.json`、`srd2014-vampire-readonly.json`：正常MCP返回的脱敏快照，保留工具限制。
- `comparison-facts.json`：字段比较、已知数值表示归一及发现；28个上批产品/检查实现hash保持。
- `mm2024-bite-source-localized.jpg`、`mm2024-vampire-resources-localized.jpg`、`srd2014-charm-source-localized.jpg`与UI文本：只读卡片证据。
- `chrome-readonly-final-receipt.json`：执行配置、URL、版本、操作与归还边界。
- `world-character-index-after-readonly.json`、`scene-after-readonly.json`：318 Actor目录与原基线逐ID/名称/类型相等，原7Token及场景完整JSON相等。

本轮未修改产品源码、未创建世界文档，未重跑已通过业务或模型实验；仅关闭本轮任务tab651347747，共享PID30932继续运行。上批收据是当时快照，不覆盖；当前MD新增对照结果后使用本轮新收据记录新文档hash。

## 建议的后续次序

先修Charm主操作/后续语义和原文可证明的单目标数量，并让同一来源语义守卫覆盖适配、生成及最终读回；再把明确传奇/每日资源接到原生消费，保留复杂后果GM判断；最后补固定20再生的GM确认按钮，不增加自动回合触发或猜测条件成立。每项都应从正式来源链产生Actor、保留篡改反例并窄验收实际行为。这个顺序依据同版差距，不是照抄新版MM，也不改变原冻结回复的真实错误阻断。本次请求的只读比较已完成，这些实现尚未执行。

待判断本地化：无新增模块候选或迁移决定；这里只借鉴已安装官方模块的可证明数据接口，不引入第三方自动化。新候选/新版本复查时先固定规则版本和精确条目，再分别核对字段、来源及实际行为，不能沿用本次未执行的官方消费结论。
