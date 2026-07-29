# 血猎手全功能运行时修复计划

## 目标

修复 Blood Hunter 2024 自制包的生成契约和自动化，使基础职业、四个结社、七种血仪、十四种血咒和二十一种诱变剂在 Foundry v14.364、dnd5e 5.3.3、MIDI-QOL 14.0.11、DAE 14.0.12 下具有明确且可验证的行为边界。

最终 JSON 必须由 `scripts/foundry-lab/bloodHunterHomebrew.ts` 的项目工作流生成；不得手改产物、卡勒姆、正式世界或线上合集包。

## 实施顺序

1. 用失败测试锁定核心契约：save Activity 保留效果引用、共享次数使用字符串 identifier、血仪使用 dnd5e 5.3.3 的 `system.damage.parts`、失血为 Damage Activity、效果使用 v14 持续时间。
2. 修复通用 Activity/Effect/消费/宏构造器和验证器。
3. 修复七种血仪的附魔、替换、休息失效和直接生命值损失。
4. 修复十四种血咒的普通、增幅、共享次数、增幅失血、状态和复杂能力的受控兜底。
5. 为基础职业、二十一种诱变剂和弑灵、渎魂、突变、化狼四个结社建立完整覆盖清单并补齐可靠自动化。
6. 通过项目工作流连续生成两次，比较稳定性，并逐项对照源文本进行语义核对。
7. 只在临时测试 Actor/武器上执行代表性 Foundry 冒烟；卡勒姆与完整游戏手感由用户人工验收。

## 核心契约

- `鲜血秘法`固定使用 `system.identifier: "blood-maledict"`；血咒通过字符串 `blood-maledict` 消耗一次 `itemUses`。
- 每个血咒固定有普通、增幅和隐藏 Damage 失血 Activity；隐藏 Activity 不重复消费。
- 失血在 MIDI `preDamageApplication` 阶段直接减少当前生命值、不动临时生命值，并清零普通伤害应用；上下文不足时失败关闭并提示人工处理。
- 每个具体血仪有 Enchant Activity、隐藏 Damage 失血 Activity 和 Enchantment Effect；额外伤害通过 `system.damage.parts` 写入所有武器攻击/伤害 Activity。
- “施法者下回合结束”使用 `duration.expiry: "sourceEnd"`；分钟/小时使用原生时长；短休/长休失效保留已验证的 `specialDuration: ["shortRest"]`。
- 复杂能力不得猜测触发伤害、控制者、武器、法术位、目标或位置；必须弹出选择或明确中止。

## 验收

- 专项测试必须拒绝旧 Utility 失血、对象形式消费目标、旧 DAE 持续时间、错误附魔路径、缺失 Effect 引用、重复 ID 和静默遗漏。
- 机器可读覆盖表必须覆盖全部源功能，并标记完整自动化、辅助自动化、明确人工处理或无需 Activity。
- Foundry Lab 导入后探针验证 identifier 重映射、Effect 引用、武器 Damage Part 和 Activity Macro 工作流字段。
- 执行专项测试、Foundry Lab、TypeScript、构建、反过拟合审计、两次稳定生成和逐项源语义核对。
- 最小冒烟覆盖普通血仪、替换/休息、普通/增幅血咒、印记、一个诱变剂、混种变形和一个复杂能力兜底。

## 2026-07-26 执行状态

- [x] 核心生成契约与错误测试已改写。
- [x] 七种血仪、十四种血咒、二十一种诱变剂和四结社均进入机器覆盖清单。
- [x] 生成物连续两次哈希一致。
- [x] identifier、Effect 引用、附魔伤害、血仪替换/休息和直接失血完成临时 Actor 运行时探针。
- [x] 专项、Foundry Lab、全仓、TypeScript、Web build 和反过拟合审计通过。
- [x] 完整语义边界记录于 `docs/reviews/2026-07-26-blood-hunter-complete-runtime-repair-report.md`。
- [ ] Plutonium 重新导入、卡勒姆迁移、完整 UI/实战语义和线上同步由用户人工验收。
