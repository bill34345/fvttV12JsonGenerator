# Forge Company / Vampire 兼容续批

日期：2026-10-20。工作树：`20261019-forge-ab-fixed-replies`。目标仍是 Forge mod 的可靠性、速度、费用与减少用户往返。本批完成可由现有来源证明的适配与离线正式链验证，**原完整 Company / Vampire 均未接受，Forge 产品实机验收未完成**。

## 旧 CLI 与目标平台事实

| 项目 | 实际旧行为与消费者 | 本批判断 |
| --- | --- | --- |
| 未标分类攻击 | `packages/parser/src/structuredAction.ts` 的 `normalizeAttackType` 对未知类型默认 `mwak`；`tests/fixtures/forge-company-first-ui-recovery.json` 已保存这种 Company 结果 | 不是来源对武器分类的证明，不继承默认。源码缓存 dnd5e 5.3.3 的 `attack-data.mjs` 还会把空分类补成 weapon，因此置空也不能保留中立含义 |
| Bloodied 减半 | 旧 Company 原生基准伤害是 `10d8+4`，Bloodied、Grappled、逃脱附赠动作保留完整人工规则；没有第二个自动半伤攻击 | 不能用除骰子、固定平均值或另加伤害活动替代；本批非单位伤害倍率仍阻断，未宣布原生半伤能力完成 |
| 动态治疗 | 旧 parser 的治疗消费者需要固定公式；`sourceAttackDamageModes` 处理明确替代骰式，不能表达实际已受伤害量 | 复用原生攻击/伤害加完整 GM 规则边界；不发明治疗骰式、生命上限或恢复效果 |
| 目标、豁免、区域 | 旧 structured target、Save 结果、旧 staged 源文消费者已有目标/范围/减半处理 | 修适配器与共享来源绑定，继续原有正式生成和验证，不另造 Actor JSON |
| 引用 | 旧 `subActions` 不等于 staged 传奇引用已继承完整攻击活动 | 没有完整攻击原文的传奇 Bite 不凭名称借治疗关系；原答向该引用擅加治疗仍拒绝 |

精确本地参考已通过 `bun run references verify dnd5e-5.3.3`。没有使用“最新版本”猜测运行行为。

## 实施

- 复合攻击目标从完整 reach/range 后的目标槽读取，保留 willing / grappled / incapacitated / restrained 的完整来源选项。缺失资格、把或改成且仍拒绝。
- 豁免可绑定紧邻前句由同一来源角色明确指定的目标；后句的可见性条件继续保留 GM 前提。共享 binder 独立拒绝中间插句或换主体，不能借其他句的目标。
- `forcing each creature ...` 可证明受影响集合。Clouds 在同句明确从来源角色发出时，`of it` 才可证明 Self；外来发射物、雕像和远程落点不能沿用。模板的 0 距离只在这一证明成立时解释为 Self，不补数字。
- Save 成功结果的“半伤害”与已有 half consumer 等价。攻击的非单位倍率没有一起放宽。
- 动态治疗增加闭合来源关系绑定：唯一相邻 typed 实际伤害、同量关系、来源恢复者、对象与条件须同时匹配。正例保留原生攻击/伤害与完整 HP-max/治疗/长休/死亡原文，不创建 Heal、自动治疗或 HP-max 效果。只写未绑定中文角色名或未知动作译名时继续拒绝。
- 不同特性的适配错误汇总到受限 code/path 诊断，不返回部分 Monster IR。新增只读 inspection 使用同一适配器，成功单特性仍需经过组装、遗漏检查及完整来源验证。
- 独立审查发现量词可能借其他集合补证，已修正为：只有明确肯定施加该 Save、并逐字匹配当前已填目标的量词句才可补足。null、单一目标、不同集合和否定句反例均拒绝。

## 冻结回复完整候选

最终证据：`.local/forge-v2-bw-integration-20261020/formal-replay-2026-10-20T05-55-29-891Z.json`。原 343 个冻结文件 SHA-256 全部不变；本次 54 个本地 fake transport，0 个真实模型 HTTP，零 repair。BC 是冻结分类首答的显式离线合并，不是新 BW 质量/性能实验。

| 来源 | BC | BW | 结论 |
| --- | --- | --- | --- |
| R1 野猪 | 3/3 ready_for_gm_review | 3/3 ready_for_gm_review | 既有 6 份完整候选保持，均 prepared |
| R2 Company | 0/3，全部阻断 | 0/3，全部阻断 | 未标武器/法术分类；另有真实目标遗漏或未满足严格目标/形状绑定 |
| R3 红龙 | 0/3 | 3/3 ready_for_gm_review | 与上批相同，BW 3 份 prepared |
| R4 Vampire | 0/3，全部阻断 | 0/3，全部阻断 | BC 第2份、BW全部3份缺生物目标；治疗译名/动作关系等尚不能证明 |

本批没有新增完整候选接受；此前 9 份完整产物均仍通过正式链和整包准备，篡改最终伤害均被 verifier 拒绝。原表格质量分数 BC 9/12、BW 6/12，以及窄格式规范化后的 9/12、8/12 均保持历史口径，没有被正式链数字重写。

### 被早期失败遮蔽的能力

为避免只看每只怪的第一个错误，报告保留每个完整来源特性的适配/组装结果。另对可组装的 Weaverot、Toxic 和 Charm，用**同一冻结原文与填写值**构造显式单特性来源切片：只改程序身份字段，重新计算 source hash，仍走 IR、browser runtime、encounter renderer、workflow、正式 verifier、Actor 读回和 package preparation。这是能力验证，不能提升原完整候选。

| 能力 | 冻结切片通过 | 最终 Activity 读回 |
| --- | --- | --- |
| Weaverot Volley | BC 3 + BW 2 = 5 | Dex DC18、15尺 sphere、60尺落点、4d6 piercing + 2d10 necrotic；等级2以下法术结束规则完整保留 |
| Toxic Emission | BC 3 + BW 1 = 4 | 附赠动作、Con DC17、4d8 poison、成功 half、10尺 Self radius；目盲与到下一回合结束的限制留在同一完整原文 |
| Charm | BC 3 + BW 3 = 6 | Wis DC17、30尺、one humanoid + 来源可见性资格；reciprocal visibility、重复豁免、终止和24小时规则完整保留 |

共 15 份切片到达 `ready_for_gm_review` 且 `prepared`，全部最终 Save DC 篡改被独立 verifier 拒绝。首次切片发现 Toxic 在更后的 carrier 验证仍误认为远程区域，已接回共享来源 Self 证明并实际复验，未用单层通过掩盖。

动态治疗另有独立构造来源通过实际 provider factory / browser workflow：原生攻击两种伤害仍在、完整生命上限/恢复/长休/死亡后果仍在、Heal 活动为零。这不是修改 Vampire 冻结回复后计分。

## 仍保留的阻断与缺口

1. Company `Spindly Shred` 的未知攻击分类与条件倍率仍是产品契约缺口。旧 `mwak` 默认和平台空分类回填均不足以证明规则。当前不生成这一完整候选；需要可保留中立语义的明确下游契约后才可继续，不能直接映射 weapon。
2. Company BW 第2份 Weaverot 与 Toxic 的生物集合目标缺失仍由 `V2_TARGET_OMITTED` 拒绝；BW 第1份 Toxic 写 sphere，与来源 self radius 不等价。BC 第2份特殊规则把“连队造成的伤害减半”写成“连队受到的伤害减半”，人工原文复核确认这一真实错误，保留失败；当前首个分类错误可能先于该句诊断，不能称此句已获语义通过。
3. Vampire BW 三份及 BC 第2份 Unarmed Strike 均缺 one creature；不从源文替模型补齐目标后接受。
4. Vampire 的动态恢复接收者“吸血鬼/吸血鬼自身”没有当前来源或已认可别名绑定；一些回复额外使用未绑定的“啃咬”动作译名或错误传奇引用。关系支持已实现，不把这些待证明填写值误记为支持完成。
5. 该批不是完整自然语言证明器；量词与条件支持是闭合语法，不覆盖任意释义。完整 GM 原文不能为矛盾填写值作豁免。

## 检查与边界

- `test:forge-v2-bw`：44 pass，245 assertions，0 fail；含复合目标、集合/否定反例、紧邻同主体、动态量关系与错误类型/条件/目标、诊断脱敏和正式 browser workflow。
- `test:forge-v2-bw:affected`：308 pass，3 skip，0 fail；provider/取消/错误证据、staged/encounter等受影响入口。
- `test:forge-v2-bw:bundle`：3 pass，14 assertions，0 fail；浏览器 bundle / archive 边界。
- `test:forge-native-basics`：1219 pass，5 fail。5项为外部区域复用相关用例；随后 `test:forge-v2-bw:area-baseline` 在测试进程只读加载 HEAD 的 `sourceOperations.ts` 和 `staged-feature-mechanics.ts`，同名5项同诊断失败，另2项反例通过。源码、夹具与工作树没有被覆盖。可确认这5项不由本批引入，但全组仍是 FAIL。
- packages / Foundry modules 类型检查、架构检查与9个相关源码局部 anti-overfit 通过。上一批全量 types 的21条既有诊断与 v12 独立失败记录继续保留，不宣布全仓绿色。
- 手册已同步输入/结果限制，人工 review、build、check 共33项通过；生成 HTML 已读回本批说明。全量 types 当前复验仍为原两文件21条诊断，本次文件0条。

未调用真实模型、未登录或操作 Foundry、未安装/部署、未提交/合并/push。冻结离线接受、GM 审阅、中文语义验收、导入、reload 与实机行为分层记录；本批没有取得后面这些层级的接受。
