# FVTT Custom Conditions

这是一个面向 Foundry VTT 14.364 / dnd5e 5.3.3 的自定义状态模块。它依赖 `fvtt-trigger-engine` 提供的通用 Actor 更新、回合开始和回合结束事件。

模块内置 Monsters of Drakkenheim 条件目录中的 19 个状态。Bloodied 使用 dnd5e 原生能力；Drakkenheim Madness 与 Contamination 本期不加入目录。

每个状态由固定 Definition 和 Actor 上的 Condition Instance 组成。Bleeding、Burning、Frozen、Jinxed、Valor 的骰式或 DC 属于实例参数，所以同一个状态可以在不同生物上使用不同数值。参数保存在 ActiveEffect 的 `flags.fvtt-custom-conditions.condition` 中，物品上的效果是模板，施加到目标后会生成新的实例 ID。

GM 可以通过模块设置菜单或 Token 控制栏打开管理器。选中或标记 Token 后，在面板中选择状态并填写 JSON 参数即可施加、编辑、停用和解除。日常调整骰式、伤害类型、DC 和结束说明不需要修改代码。

流血的基本参数示例：

```json
{
  "formula": "2d6",
  "mode": "hpLoss",
  "damageType": "",
  "timing": "turnEnd",
  "stacking": "highest",
  "endOnHealing": true,
  "endCondition": "恢复任意生命值后结束。"
}
```

流血与燃烧默认在自身回合结束时结算。相同 Actor 上同名状态只采用一个较高值，不因怪物、Item 或来源地址不同而分别扣血。Burning 的不同伤害类型也一起比较，采用胜出者的骰式和伤害类型。比较使用骰式的平均值，平手保留现有效果；不会先掷骰再选，也不会根据目标的抗性改变强度排序。已存在的旧多实例数据在结算前也需选出唯一有效值。

怪物特性中的数值是参数来源，例如 `Bleeding 4d4` 或 `Burning 2d6 Fire`。Generator 将其写入攻击 Item 的模板，施加时复制到目标，不能从 CR 或普通命中伤害猜出状态数值。来源没有写明的参数应由 GM 补齐。

强度比较支持普通骰式相加、加减常数及乘除常数，例如 `4d4+2`、`(2d6+3)/2`。随机分母等无法确定排序的表达式会提示错误并保留现有效果，需 GM 改为可比较的骰式。

回合结算由 active GM 执行，并以实例 ID 与 Combat 回合键做重复保护。治疗会解除设置了 `endOnHealing` 的实例。距离、环境和坠落落点需要 GM 结合地图裁定。

Frozen 的已启用实例提供“破冰（动作）”按钮，按实例 `escapeDC` 进行力量（运动）检定。默认由被冻结的目标检定；标记目标后另选中一名生物，可让该生物协助。GM 先确认协助者能够接触目标。取消检定不算尝试，完成检定后无论成败都花费动作，成功才解除 Frozen。

Bewildered 只限制施法，不禁止普通攻击和其他非施法动作。Staggered 按实际完成的武器攻击计数，武器上的辅助 Activity 不算攻击。Shocked 不额外禁止 Reaction；禁止 Reaction 的状态是 Distracted。

Immobilized 与 Frozen 会拦截拖拽、方向键等自主移动，也会拦截非 GM 通过 Token HUD 或配置进行的位置变更。GM 的坐标编辑及 API 强制位移保留用于推拉、传送和坠落裁定；这些重定位不消耗 Dazed 的自主移动选择。停用或解除状态后恢复自主移动。

E2E 默认使用 `F:\FoundryLab\foundry-v14\data\server-mirror` 中的 `fvtt-v14-module-matrix` 世界，地址 `127.0.0.1:30001`。状态核心规则、来源生成模板、真实结算与解除、页面重载后不重复扣血、Sickened/取消攻击/自主移动修复均已有对应路径的实测证据。键盘长按受当前浏览器工具能力限制，未完成该输入路径验收；鼠标拖拽与玩家 HUD 高度编辑有独立证据。当前结论见仓库 `docs/reviews/2026-09-21-custom-conditions-release-readiness.md`，日常操作见 `docs/runbooks/custom-conditions-and-trigger-engine-usage.md`。

构建、测试和类型检查使用仓库根目录的 `bun run build:custom-conditions`、`bun run test:custom-conditions` 与 `bun run typecheck:foundry-modules`。
