# Custom Conditions 与 Trigger Engine 使用说明

本说明对应当前本地候选版本：Foundry14.364 / dnd5e5.3.3。当前验收结论见[候选收尾表](../reviews/2026-09-21-custom-conditions-release-readiness.md)。不代表serverNext的dnd5e6版本已兼容。

## 启用与打开

本地候选包位于 `foundry-modules/fvtt-trigger-engine/dist/fvtt-trigger-engine.zip` 和 `foundry-modules/fvtt-custom-conditions/dist/fvtt-custom-conditions.zip`。目前没有公开发布manifest地址；这些是本worktree的本地交付物。安装到其他实例前应核对版本兼容性与目标授权，不能直接覆盖正在使用的模块目录。

安装两个独立模块，在世界的模块管理中启用 Trigger Engine 和 Custom Conditions，按提示重载页面。Custom Conditions依赖Trigger Engine；核心功能不要求Midi-QOL、DAE、Times Up或Effect Macro。

以GM选中或标记目标Token，从模块设置菜单或Token控制栏打开“管理自定义状态”。存在标记目标时优先使用标记目标，否则使用选中的Token。改变目标后点击刷新，确认面板显示的Actor名称再操作。

## 手动状态和参数

选择状态，在参数JSON框中填写该状态的参数，再施加。切换到另一种状态时应按新状态填写参数，不要沿用上一种状态的无关字段。没有参数的状态使用 `{}`。

| 状态 | 最小参数示例 |
| --- | --- |
| Bleeding | `{"formula":"2d6"}` |
| Burning | `{"formula":"2d6","damageType":"fire"}` |
| Frozen | `{"escapeDC":15}` |
| Jinxed | `{"formula":"1d6"}` |
| Valor | `{"formula":"1d4"}` |

Bleeding默认在自身回合结束时失去生命值，恢复生命值后解除；Burning默认回合结束造成指定类型伤害。来源明确指定回合开始时，可在参数中加入 `"timing":"turnStart"`。结束说明只是说明文字，不会把任意自然语言自动变成触发规则。

Bleeding与Burning在同Actor上各自只保留一项较高值，按骰式期望值比较，平手保留原值。Burning不同伤害类型仍一起比较。它们不是多层相加，也不按每次随机掷骰结果临时决定强弱。

编辑：面板中点击已有实例的编辑，修改参数后保存。停用会保留实例信息但暂停作用；移除则解除实例。来源栏用于记录“这个状态从哪个能力或物品来”，不需要普通使用者手写技术地址。

Frozen实例的“破冰（动作）”按钮会进行力量（运动）检定。默认目标自救；标记被冻结目标并另选一名协助者时，可由协助者检定。GM先判断其是否能接触目标。取消不耗Action，完成失败耗Action但状态保留，成功则解除。

## 怪物生成与模板

来源必须明确给出状态参数，例如Frozen的DC、Jinxed的骰式。使用正式生成器输出Actor JSON，再通过Foundry的Import Data导入。攻击Item中的Condition效果是可施加模板，不应让持有该Item的怪物自己中状态。

模板应用使用模块公开的 `applyFromItem` 流程，将来源参数复制到目标Actor实例。已有自动化可以调用此接口；仅导入Item并不等同于每次命中都已自动完成目标选择和规则裁定。当前管理器用于直接施加/管理状态，不能把API验证描述为已经提供所有“一键命中套用”的UI。

不要手工修补最终生成JSON来补来源没写的DC或骰式。来源缺参数时先补充来源，或由GM在Foundry中手动决定实例参数。

## 通用触发器

从模块设置或Token控制栏打开Trigger Manager。当前编辑器接受JSON定义，支持Actor文档更新、Combat回合开始、Combat回合结束。可以新建、复制、编辑、启停和删除Trigger，并选择已有Macro UUID作为动作。

Trigger只由active GM执行。宏收到 `triggerContext`，可读取变更前后数据、Actor及回合信息。宏要回写同一Actor时，使用 `triggerContext.updateDocument()` 保留防递归信息。

无需为了更改现有触发条件或状态骰式重新编译模块；但首次编写全新Macro行为仍需要脚本。不要把“可在FVTT中配置”理解为“所有新规则都无需编写任何逻辑”。

## 移动与使用边界

Immobilized/Frozen限制拖拽、键盘，以及非GM通过HUD/配置进行的自主位置修改。GM坐标编辑、API位置操作保留用于强制位移/裁定，不计为Dazed的自主移动选择。键盘输入路径的当前验收缺口见候选收尾表。

飞行坠落落点、地图距离、环境解除由GM判断。原生Bloodied继续使用dnd5e/FVTT；Madness和Contamination不在本期范围。

## 本地测试环境

server-mirror入口为 `http://127.0.0.1:30001/join`，测试世界 `fvtt-v14-module-matrix`。该服务按用户要求常驻到关机，测试任务只复用；清理仅限自己的临时对象和receiver，不停止Foundry。

结束测试后恢复原场景、暂停状态及模块开关。当前测试基线为Trigger Engine启用、Custom Conditions停用；正常实际使用时必须启用Custom Conditions。serverNext30002是独立环境，不自动安装或更新。
