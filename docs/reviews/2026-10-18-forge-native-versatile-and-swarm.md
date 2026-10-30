# 半血伤害、武器两用与虫群：原生数据复核

日期：2026-10-18。范围：回答用户的三个方案问题，复核上一轮实际产物及官方精确版本。**只读检查并保存本报告，未修改生成器、测试或 Foundry 数据。**

## 结论

1. 上一轮半血案例的实际产物是同一 `Bites` 特性内一个 Attack 与两个 GM Damage，而不是两项完整 Attack。攻击命中后由 GM 二选一掷伤害，不自动判断半血。这个结果证明该通用表示没有把伤害相加，不能称为最终界面设计或 UI 已验收。官方自带的 2024 虫群内容另有“同一 Bites 武器里的普通 Attack / Bloodied Attack”原生表示；后续可优先参照这种两选一的交互，不必坚持三项通用拆分。2024 条目只作为目标版本交互/数据结构的参照，不替换 2014 来源的伤害数值或规则。
2. 普通武器的双手换骰优先用 dnd5e 原生 weapon + Versatile 机制，不应一律拆成自定义特性的 Attack + Damage。官方 2014 Spear 已有普通 1d6、双手 1d8、`ver` 属性和一个 Attack。原生 Attack Mode 在两手使用时替换基础伤害；不需要第二次攻击检定。常规系统武器可复用已有定义，但仍须核对怪物原文的固定命中、骰数、伤害加值、额外效果及 2014/2024 来源，不能把系统库默认值直接当作怪物的全部事实。
3. 虫群不应只保留自然语言说明。目标系统已有“个体体型”专用字段：整体 `system.traits.size=med`、类型 `system.details.type.value=beast`、个体 `system.details.type.swarm=tiny`。官方虫群条目正是如此，token 宽高均为 1。生成器应补来源 → 中间模型 → 既有生成流程 → verifier 的显式映射；不能只让头部通过却把 swarm 字段留空，或让 tiny 覆盖整体体型。

## 依据

### 本地实际产物

复用未改动的 `.local/forge-weird-semantics-expansion-20261018/final-matrix/artifacts.json`，筛选普通完整 IR 入口的正确对照：

| 案例 | Item | 活动 | 其他事实 |
|---|---|---|---|
| half-hp-replacement | 一个 `Bites`，type feat | Attack +4；Ordinary Damage 4d4 piercing；Conditional Damage 2d4 piercing | Attack 不带伤害；两种 Damage 为 special，无额外资源消耗；完整半血规则可见 |
| two-handed-replacement | 一个 `Longblade`，type feat | Attack +4；Ordinary Damage 1d8+2；Conditional Damage 1d10+2 | 同样是通用表示，没有使用原生 weapon/Versatile；不能据其通过证明最终呈现应当如此 |

没有开启浏览器或进行实机导入，因此本报告不声称按钮具体排列、当前角色卡皮肤、聊天卡操作或自动切换行为已经验证。

### 官方精确版本

`bun run references verify`：`dnd5e-5.3.3: ok`、`dnd5e-current-6: ok`。本报告只采用 **5.3.3**，固定提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`；6.x 缓存存在不代表本报告采用或接受 6.x 行为。

| 官方来源 | 核实的事实 |
|---|---|
| [weapon.mjs](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/item/weapon.mjs) | `attackModes` 为 Versatile 武器提供 oneHanded / twoHanded；`isVersatile` 检查 `ver`，区别于必须双手持用的 `two` |
| [attack-data.mjs](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/activity/attack-data.mjs) | `_processDamagePart` 在 Versatile＋twoHanded 时替换基础伤害；随后保留伤害类型及相应加值处理 |
| [2014 Spear](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/packs/_source/items/weapon/spear.yml) | base=1d6 piercing、versatile=1d8、properties 含 ver，一个原生 Attack；不能把 Spear、Pike、Lance 的名称/属性混为一谈 |
| [CreatureTypeField](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/shared/creature-type-field.mjs) | 生物类型结构含独立 `swarm` 字段 |
| [CreatureTypeConfig](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/applications/shared/creature-type-config.mjs) | swarmOptions 来自系统 actorSizes，官方配置界面已有个体体型选项 |
| [Actor.formatCreatureType](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/actor/actor.mjs) | 根据 type.swarm 组合本地化虫群名称，不把 tiny 写回整体 size |
| [2014 Swarm of Insects](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/packs/_source/monsters/beast/swarm-of-insects.yml) | traits.size=med、details.type.value=beast、details.type.swarm=tiny、token=1×1。旧条目中仅存有 versatile 数据不等于启用了 Versatile 攻击模式；没有据此声称能自动判断 HP |
| [2024 Swarm of Insects](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/packs/_source/actors24/swarm/swarm-of-insects.yml) | 同一 Bites weapon 有普通 Attack 和 Bloodied Attack；后者有 Bloodied 条件文字及另一组伤害。只证明官方内容采用两个选择，未证明当前客户端会自动替用户选择 |

Context7 查询 `/foundryvtt/dnd5e`，指定 release-5.3.3，返回可变 Wiki 内容；仅用于导航。随后逐项核对上述固定提交的本地源码。联网读取了官方 tag 页面及 [Attack Activity 说明](https://github.com/foundryvtt/dnd5e/wiki/Activity-Type-Attack)。AnySearch 两条查询中，武器查询返回 `Search service temporarily unavailable`，虫群查询结果较泛，未用来证明字段或行为；按项目授权直接以官方原始页面和精确源码继续核对。

本地源码 SHA-256：

| 路径（相对固定提交 repo） | SHA-256 |
|---|---|
| module/data/item/weapon.mjs | 96c3e721275a5b2b927c81aa2895b04a2ec21d80166281fde347c6eba0082031 |
| module/data/activity/attack-data.mjs | 2634a32a6c2d95ac107ed11a4d69138ff818ef9e80761bd57fd1f99680d35de2 |
| module/data/shared/creature-type-field.mjs | 046be22ecc43907d1fb0c8001a564b334d370259dd8b39efce417505d8cb7e2b |
| packs/_source/items/weapon/spear.yml | 8ebb2cb571c04b7c5edd2a5afae391f98917864b6c68d093e278684d632ce530 |
| packs/_source/monsters/beast/swarm-of-insects.yml | 50e25bc242ff3e02eae93013283ae9a5e9c1dbd69e4aaf685d4f0616f6295c6f |
| packs/_source/actors24/swarm/swarm-of-insects.yml | bd2fa65eccc8be905d3e991b080bc812e8b656fe4b435ef846f8ff2edab5fa78 |

## 对上一轮方案的修正

上一轮的测试和“分步整理误拦”结论保持有效；本次新证据改变的是后续的产品映射选择：标准双手换骰应复用原生武器，虫群应填原生 swarm 字段，半血攻击可参考官方同一条目下的两个 Attack 选项。不能把通用表示通过检查当作最合适的最终交互。

拟议后续验证应分别检查：半血两个选项各只执行一次命中且伤害互斥；标准武器单双手模式和怪物来源数字一致；虫群整体体型、个体体型、类型以及 token 均在实机读回。尚未执行这些实现或运行验收，不新增自动 HP 监视 hook。

待判断本地化/外部模块：无。原生系统已经提供相关接口，不需要为这三个问题引入新模块。
