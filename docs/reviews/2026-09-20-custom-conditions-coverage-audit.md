# Custom Conditions：R4/R6 覆盖缺口审计（2026-09-20）

本记录只审阅现有脚本与结果，未运行新E2E。不能以18个case/102个断言均执行替代每条状态规则的完整覆盖。

## 需要补测的具体差异

| 范围 | 已有证据 | 缺口与R7要求 |
| --- | --- | --- |
| Shocked | 掉武器/盾/焦点、保留护甲、允许Reaction、装备消耗Action | 仅施加Shocked时单独证明Dazed与Defenseless组合；取消装备不耗动作 |
| Addled/Clumsy/Enfeebled | 对应能力attack/check/save劣势公式 | 同Actor未受影响能力负向对照，防止过宽匹配 |
| Weakened | 真实DamageRoll的减半公式、类型/重击配置与治疗负向对照 | 武器/法术伤害真正落到目标HP，按本次骰值计算预期 |
| Frozen/Immobilized | 派生速度0；GM/paused公开API移动的失败观察 | 未暂停世界、玩家owner真实拖拽与解除后恢复；区分GM强制移动 |
| Immobilized飞行 | 初始elevation=0时未改变高度 | 不是飞行覆盖；需要高空飞行fixture并保留GM裁定坠落边界 |
| Slowed | 全速度含加值减半/移除恢复 | 只能说明派生速度，不声称网格距离强制限制已验证 |
| Helpless | 命中/未命中的critical标志 | 聊天保存roll与后续伤害重击骰链路 |
| Frozen破冰 | API的取消/成功/失败 | 实际管理面板入口和助手路由 |
| 模板/停用实例 | 导入模板、公开applyFromItem及回合结算 | 不应误影响模板持有者或停用目标防御的负向对照 |

R4单独验证Bleeding/Burning基本规则，R6的core.json组合case补导入/套用/结算，两轮合计涉及19个定义；不能称19种都做了相同深度的独立E2E。

## 已确认缺陷与误报

- Sickened同Actor普通CON check被错误施加劣势：源码条件误含check。父任务本轮已修复并先红后绿验证，26测试/108断言通过，尚未安装到Lab。
- Frozen API移动实际水平位移、Immobilized高度改变：移动路径待定位，不能从GM API直接推断玩家拖拽。
- 7个原始失败断言源于只读options.advantage/disadvantage而非真实2d20adv/dis公式，属于断言误报。后续脚本应统一读实际terms/formula并设置对照。

以上缺口均已交给原Chrome任务R7补测。Lab继续R6安装基线，以避免与父任务源码修复混用版本。无需重跑已有充分证据的项目。
