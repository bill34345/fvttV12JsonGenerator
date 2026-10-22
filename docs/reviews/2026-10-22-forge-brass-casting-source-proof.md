# 黄铜龙通用判定与独立每日Cast：来源／接口依据

本批使用同一worktree及已有2024冻结回复，新增真实模型调用0；不升级系统、Core或其他实例。

## 固定版本接口事实

- [dnd5e release-5.3.3](https://github.com/foundryvtt/dnd5e/releases/tag/release-5.3.3)对应提交`965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，与本地reference cache一致。运行中Mirror仍为Core14.368／dnd5e5.3.3，固定资料校验通过。
- 同提交`module/documents/activity/cast.mjs`的`CastActivity.use()`通过所绑定的缓存Spell调用原生`spell.use()`，而不是使用同名Utility替代。该文件SHA256为`bb553020ee547a1f544f4871122544b6b28e43bc3574d49dab490f0cc61dff6d`。
- 同提交`packs/_source/monsterfeatures24/actions/spiritual-weapon.yml`本身使用bonus Cast及独立Item每日2次，说明这一运行时载体已有正式接口；本项目仍须从本次生物来源产生manifest，不能照抄该世界／合集ID或其额外环阶／法术位配置。
- 2024 Spell `packs/_source/spells24/2nd-level/spiritual-weapon.yml`为2环、bonus、60尺、1分钟、V／S／Concentration，并含Summon Activity。SHA256为`6c84e3d71b35ee6bee30ab4215307efa3e338b844f2e707935b5f0bee439bc29`。生物来源没有指定施法环阶，portable ref不得捏造castingLevel；实际解析后以唯一2024 Spell为准。Cast连接、次数消费与缓存读回是本批关卡，完整召唤物移动／攻击／持续伤害不由此自动接受。
- 既有Resolver的`useParentItemPool`已支持一个innate ref消耗父Item次数，拒绝共享／缺失／非法配额。不应为某个法术名增加Resolver特判；生成阶段提供同源WIS、DC12、+4、bonus、2/day及无组件豁免即可进入现有链。

## 本地反证与修复方向

- N2原句为“casts the Spiritual Weapon spell … using the same spellcasting ability as Spellcasting”。锁定Bun的单变量检查：原文、不带换行的原文、仅去掉the均解析失败；仅去掉the及spell包装后，保留原换行仍可解析。因此不能将此具体失败归因换行。新增语法应识别确定的单法术名称包装，保留原始UTF16位置，并继续拒绝泛称、未知触发、其他施法者及错次数。
- “same spellcasting ability”只绑定同源施法属性与对应数值profile，不能借用父条目的组件豁免；“uses Spellcasting to cast”才引用完整父施法能力。两条路径必须分别验证。
- 黄铜龙的六项旧误判已被严格分支复现；解除父属性误判后，还暴露出At Will行内Shapechange括号含逗号被普通split拆散的问题。正确方向是通用括号平衡分词、保留完整受限Shapechange为GM条目，同时让同行已支持的其他法术维持原生授予；不得整行吞掉或删掉限制换取通过。
- 原“目标1无来源所以AI捏造”解释已撤回。[官方SRD5.2.1第256页Attack Notation](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf#page=256)是默认单目标的规则依据，显式目标数量仍优先。不创建伪造的one target原文或证据片段。
- 候选审核元数据是非执行数据，不能一方面保存它，另一方面因它存在而追加“未知可执行字段”的假诊断；仍须验证封闭结构、保留原始问题，并独立拒绝错误攻击／伤害／施法值。

## 一手来源与边界

本批优先沿用已验证的同源引用和Resolver接口，外部搜索未找到比本次固定回复／正式5.3.3源码更直接的同条件修复报告，不据社区搜索片段归因或新增 workaround。官方release的[#6986](https://github.com/foundryvtt/dnd5e/issues/6986)记录另一个原生feature授予Spell改用Cast的维护问题，只用于接口方向对照；不是本次修复已通过的证据。

## 待判断本地化与复查

没有新外部模块／待本地化候选。后续复查只对实际生成的portable manifest、唯一2024候选、父次数及Cast／缓存读回进行；hydration、实际Cast、完整召唤结算和生产四层不互相替代。实施进度及唯一下一步见[当前交接入口](../plans/2026-10-20-forge-ab-current-state.md)。

## 实施后的反证与结果

独立审查复现并修复了三项放宽风险：父子同为外部主体、未知后句成分例外、单法术局部DC／命中被借作共享profile。最后一项包含换行改空格／Tab后仍应相同的反例；精确局部原文存在也不能证明它属于父级介绍区。全部窄复审通过，53专项、1235共用来源回归及原回复正式链通过；新旧Actor hash保持，保护498原件未变。用户将Mirror启动问题交其他thread并要求本thread不再启动，真实Cast保持NOT_EXECUTED，完整结果见[本批验收](../acceptance/2026-10-22-forge-brass-and-spiritual-cast.md)。
