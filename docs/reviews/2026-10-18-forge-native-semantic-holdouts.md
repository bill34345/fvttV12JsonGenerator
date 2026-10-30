# 原生替换伤害修复的外部反证与后续样本

日期：2026-10-18。本轮读取官方规则、精确 dnd5e 5.3.3 pack／代码及原始故障帖，形成 **48 项规则／边界目标**。它们不是 48 只全新真实怪物：有实际不同机制、有规则组合，也有从明确规则推出的阈值反例。当前落地另有 56 个合成攻击案例（28 类结构交替使用两个基础生物），以及虫群身份、限定附伤和旧格式回归；逐项结果见本轮验收记录，不能把本清单一律标成实机通过。

## 改变了哪些判断

- Blood Hawk 在**目标**半血时增伤，虫群在**自身**半血时减伤；Ravens 还会换骰面，并非一律骰数除二。因此生成两项来源明确的攻击选择，由 GM 按全文选择，不增加 HP 监控或自动计算。
- Azer 两种握法都带额外火伤；Gladiator 的 Brute 已计入 Spear 的双倍骰；Druid 另有 Shillelagh 第三分支。因此只复用原生武器模式和标识，固定命中、骰数、加值、附伤继续来自输入。不能复制标准库数字后再重复叠加 trait。
- 官方虫群包含 Large Bats 和 undead Crawling Claws。因此整体体型、个体体型、类型各自独立，不固定成 med/beast/tiny。
- 原始历史 issue [dnd5e #599](https://github.com/foundryvtt/dnd5e/issues/599) 曾报告 Giant Scorpion 的毒伤被放入 Versatile 及错误加能力修正；这是 2020／0.95 的历史反证线索，不证明 5.3.3 仍有该 bug。它推动了本轮“基础与附伤分开、固定总值不再次加能力”的检查。

## 版本与来源

官方固定提交：`965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，dnd5e **5.3.3**。本地共享 reference cache 已校验，2024 pack 只借交互结构或作为不同版本反例，不能替换输入的 2014 规则和数字。

- **R65 / R96 / R98 / R265 / R389 / R390 / R399 / R400**：[SRD 5.1 PDF](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf)，物理页码；逐栏取证。分别为武器属性、当前/最大 HP、临时 HP、Azer、虫群、Gladiator/Druid/Guard/Knight。PDF SHA-256：`2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0`。
- **N-Swarm**：[官方 2024 虫群目录](https://github.com/foundryvtt/dnd5e/tree/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/actors24/swarm)，含 Bats、Insects、Ravens、Rats、Piranhas、Venomous Snakes、Crawling Claws。
- **N-Hawk**：[Blood Hawk](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/actors24/beast/blood-hawk.yml)。
- **N-Boar / N-Berserker**：[Boar](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/actors24/beast/boar.yml)、[Berserker](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/actors24/humanoid/berserker.yml)。
- **N-Glossary**：[规则术语 Bloodied](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/content24/appendices/rules-glossary.yml)。
- **N-Weapon / N-Attack**：[Weapon 模式](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/item/weapon.mjs)、[Attack 伤害处理](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/activity/attack-data.mjs)。
- **N-Items**：[2014 原生武器目录](https://github.com/foundryvtt/dnd5e/tree/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/items/weapon)。
- **N-Type**：[CreatureTypeField](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/data/shared/creature-type-field.mjs)。
- **I76 / I106**：[导入器虫群原始报告](https://github.com/jbhaywood/5e-statblock-importer/issues/76)、[能力体型污染原始报告](https://github.com/jbhaywood/5e-statblock-importer/issues/106)。这是同类故障线索；原帖关闭或所称修复版本不代表本项目已支持。

## 48 项目标

“本轮覆盖”指离线来源/输出或错误提案检查；全部仍缺本轮真实 Foundry 操作验收。H02–H05 的数值是规则推导，不伪装成原版怪物原数值；程序不做 HP 自动判定，所以这些项目只约束条件字面、主体和边界，不能称自动计算已验收。

| ID | 来源 | 必须保住的规则或反例 |
|---|---|---|
| H01 | R389 | 一个 Bites 下普通／半血两项完整 Attack；只选一项，伤害不相加 |
| H02 | R389、N-Glossary | half or fewer 包含相等；合成 max22/current11 属半血 |
| H03 | 同上 | max22/current12 属普通分支，不能改阈值 |
| H04 | R96 | 奇数最大 HP 的半数不能擅自四舍五入；max21 的 10/11 不同 |
| H05 | R98 | 临时 HP 与当前 HP 分开；不能把两者相加后判断半血 |
| H06 | R389 | reach0 与虫群占据空间限制保留，不能套默认5ft |
| H07 | R390 毒蛇 | 物理伤害换骰，后续毒素伤害不跟着换 |
| H08 | 同上 | 毒素 Save 成功减半不应连穿刺伤害也减半 |
| H09 | N-Swarm Ravens | 1d6→1d4 是换骰面，不能用骰数除二推导 |
| H10 | N-Hawk | 目标 Bloodied 才增伤，不能改为攻击者血量条件 |
| H11 | R390 Quippers | 目标未满血的优势与自身半血伤害是两个条件 |
| H12 | N-Boar | Bloodied 只给优势时不新增换伤害模式 |
| H13 | N-Berserker | 优势涉及攻击和豁免，不能变成伤害替换 |
| H14 | R390、N-Swarm | 同名2014/2024来源的骰数不同，按输入版本 |
| H15 | N-Swarm Ravens | 普通分支 not Bloodied 与半血分支互斥，不颠倒条件 |
| H16 | N-Swarm Claws | 换黯蚀伤害，同时保留目标体型限定的倒地后果 |
| W01 | R399–400 Guard | 原生 Spear 单双手模式，1d6+1／1d8+1，一次命中 |
| W02 | 同上跨页 | 跨行续句仍归 Spear，不移到下一个 Knight |
| W03 | R399 Gladiator | 2d6+4／2d8+4 不降为武器库1d6／1d8 |
| W04 | 同页 Brute | 已包含在攻击内的额外一骰不重复加 |
| W05 | 同页 Spear | 固定命中+7不按标准武器或能力重算 |
| W06 | R265 Azer | 两用只换基础钝击，类型仍正确 |
| W07 | 同条 | 两种握法都保留共同的1d6火伤 |
| W08 | Heated Weapons | trait 中已经 included 的火伤不重复添加 |
| W09 | R399 Druid | Shillelagh 命中+4与普通+2不混为全局；高级分支保持GM |
| W10 | 同条 | 单手、双手、Shillelagh 三种伤害不能硬并为两用 |
| W11 | Guard | 近战5与投掷20/60；投掷用基础伤害，不用双手骰 |
| W12 | Gladiator | reach与range的 and/or 均保留各距离 |
| W13 | N-Items Spear/Trident | ver+thr可共存，类别与武器标识各自正确 |
| W14 | N-Items Pike | two不等于ver；长柄矛类不能自动当Spear |
| W15 | R400 Greatsword | 必须双手不应额外生成单手或升级骰 |
| W16 | R65、N-Items Lance | 非骑乘需要双手但不换骰，5ft内劣势仍保留 |
| W17 | N-Items Javelin | thrown不代表ver，30/120不改成20/60 |
| W18 | N-Items Dagger | finesse/light/thrown不代表可重算来源固定总值 |
| W19 | N-Weapon/N-Attack | 原生versatile空/0可有系统回退，不能输出1d0；输入明确公式应显式保存 |
| W20 | I599 | 附加毒伤不能塞进Versatile，也不能再加能力修正 |
| S01 | R389、I76 | 整体med、type beast、成员tiny、token1×1分别核对 |
| S02 | N-Swarm Bats | 整体Large、成员Tiny、token2×2，不能写死Medium |
| S03 | N-Swarm Claws | 类型undead，不能写死beast |
| S04 | N-Items/官方单只Bat | 单只Tiny生物不能凭空变虫群 |
| S05 | R389 Swarm trait | 可通过Tiny开口的正文不能覆盖整体体型 |
| S06 | N-Swarm Claws | 目标Medium-or-smaller限制不能覆盖虫群身份 |
| S07 | I106 | Action里Large-or-smaller不成为Actor体型 |
| S08 | I106 Shapechange | 可选外观体型不覆盖静态基础身份 |
| S09 | R389 | beasts→beast归一，同时保存swarm字段 |
| S10 | N-Type | 整体／成员字段互换或漏掉任一都应发现 |
| S11 | R389 Swarm | 禁止恢复HP和获得tempHP两项都保留，不新建禁治疗hook |
| S12 | N-Type、I76 | 虫群身份不自动授权整套抗性、免疫和治疗限制 |

## 当前边界与后续查证

本轮将明确两分支、固定数字、主体/条件、独立限定附伤、原生字段与旧格式作为代码修复；没有实现自动阈值计算、完整 Shillelagh 状态机、全部武器库存水合或通用触发图。保留 GM 操作不等于已自动执行。后续优先把尚未落地的完整第三分支、多种法术变体和不同版本武器属性组合取成有边界的来源案例，继续同时检查正确结果和错误提案，不以固定“24项通过”作为停止标准。

待判断本地化／外部工具：无。本轮复用 dnd5e 原生字段与模式，不安装新模块或额外 AI 审核工具。

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
