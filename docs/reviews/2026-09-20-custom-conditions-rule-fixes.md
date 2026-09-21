# Custom Conditions 规则修复与验证边界

用户要求：先修正规则并完成离线检查，本轮不执行新的浏览器 E2E。工作区继续使用 `20260916-154837-trigger-engine`，不建立另一个功能 worktree。

## 测试环境说明

历史浏览器 E2E 的目标是 **server-mirror**，不是 server-next：

| 项目 | 值 |
| --- | --- |
| 数据目录 | `F:\FoundryLab\foundry-v14\data\server-mirror` |
| 世界 | `fvtt-v14-module-matrix` |
| 地址 | `http://127.0.0.1:30001/` |
| Foundry | `14.364` |
| dnd5e | `5.3.3` |
| 原场景 | `Task8 Bleed Arena` |

依据：`tools/foundry-ops/src/config.ts` 的 serverMirror profile、两个模块安装器的精确 server-mirror 路径，以及 F 盘 `custom-conditions-e2e` 历史报告。本机存在 `server-next` 目录，但上述证据不指向该目录。

## 验收口径

- Bleeding 和 Burning 都采用跨来源的唯一较高值；不同 Burning 伤害类型参与同一比较，胜出者携带其骰式、伤害类型和来源。按线性骰式平均值比较，平手保留现有值。
- 状态参数取自来源特性，不能将相邻即时命中伤害、另一状态或无关回合描述混入模板。原文本明确写叠加时，与本次用户指定的最高值规则冲突应作为已授权的规则覆盖记录。
- Bewildered 只限制施法；Staggered 只统计武器攻击；速度状态需覆盖 dnd5e 全速度类型及加值；Frozen 需提供 Athletics 解除入口。
- 行动记录和伤害解除必须考虑玩家端发起的文档操作。地图距离和坠落落点由 GM 裁定，不猜测地面高度。
- 历史事件调度通过、生命周期通过及测试夹具错误均不能替代本修复版的玩法验收。

## 本轮运行边界

不启动 Foundry 或 Chrome，不安装修复版到 Lab，不访问生产，不 commit、merge 或 push。离线测试、类型检查、构建和生成器来源核对的最终结果在本轮完成时补记。浏览器 E2E 保持 `NOT_EXECUTED`。

## 生成器来源核对

样本通过正式 CLI/workflow 生成到 `.pui/custom-conditions-rule-validation`，未手改最终 JSON。父任务另用 `--fvtt-version 14 --effect-profile core --icon-mode off` 生成 `core.json`，`verify:actor` 返回 `warnings=[]`、`sourceIntegrityErrors=[]`。两个 Item 的 Activity 都引用各自的 Condition 模板。

| 来源 | 即时攻击伤害 | 模板核对 |
| --- | --- | --- |
| Bleeding Bite | `2d8+3` 挥砍，命中 +4、触及 5 ft | `Bleeding 4d4`、hpLoss、turnEnd、highest、template=true |
| Cinder Bite | `2d6+1` 寒冷，命中 +4、触及 5 ft | `Burning 2d6 Fire`、来源明确 turnStart、highest、template=true |

核心 HP 22、生命骰 `4d8+4`、AC 13、步行 30 ft、CR 1 与来源一致。状态参数没有借用命中伤害，Bleeding 没有误带挥砍类型，Burning 没有误带寒冷类型。完整来源和生成过程记录在该目录 `report.md`；辅助验证的 modded-v14 两个 CLI 入口也分别通过 verifier。该核对属于离线生成语义，不是 Foundry 导入或 gameplay E2E。

## 已落地的运行时修复

- Bleeding/Burning：施加、编辑、重新启用及结算时统一采用最高值。旧多实例在结算前折叠，未知强度拒绝替换并保留现状；失败创建不提前删除旧效果。
- Bewildered：只限制施法。Dazed：原生移动与已完成 Action 互斥。Staggered：只记完成的武器攻击，取消或 Utility 不计数。
- Shocked：保留 Reaction；卸下手持武器/盾/施法器具，不卸穿戴护甲；物品操作成功后才记 Action。
- 速度：接入 dnd5e 原生 noMovement/halfMovement，覆盖全部速度与加值，并移除旧 walk-only 修改以防二次减速。坠落落点、接触范围由 GM 裁定，不自动猜高度。
- Frozen：成功应用的火焰/钝击伤害累积并在阈值处解除，支持 Actor owner 客户端。面板/API 提供力量（运动）破冰；取消不花 Action，完成失败仍花 Action；检定窗口期间变更回合/可用动作/效果身份/DC 时不错误解除。
- Helpless：按攻击保存的目标/AC、实际命中结果在聊天卡创建前写入重击；Frozen 只针对当前攻击的钝击伤害。Weakened 在最终伤害配置后减半，保留伤害类型和暴击配置并排除治疗。
- 多客户端：回合记录保存在 Actor flags，标准文档同步后合并当前回合已消耗记录，避免 GM 本地缓存遮蔽玩家结果。该设计没有跨客户端原子锁，同时操作的竞态仍需后续真实 E2E。
- Trigger Engine：撤掉无证据需要的定时回合兜底，等待 Foundry 原生生命周期；同次转换的 end/start 一起入队；补新建/导入 Actor、场景 Token Actor 的快照，修正首次治疗识别和 turnEnd Macro 的事件类型。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| Trigger Engine 回归 | PASS，29 项 |
| Custom Conditions 回归（含面板接口与最高值边界） | PASS，25 项 / 101 断言 |
| 生成器定向回归 | PASS，40 项 / 225 断言 |
| typecheck:foundry-modules / typecheck:packages | PASS |
| architecture:verify | PASS |
| audit:anti-overfit | PASS，9 个来源 |
| 两模块 build | PASS，仅生成 worktree 内 dist 包 |
| handbook:build / handbook:check | PASS，28 项工具 |
| 全仓安全测试 `bun run test` | 2823 pass / 5 timeout；未将该整次运行记为全绿 |
| 五项超时的独立复跑 | PASS：Forge release 1、Selected Token Sync 10、Open Session Deck 50 项；未修改这些模块源码 |
| 浏览器 E2E、模块安装、生产部署 | NOT_EXECUTED |

本轮 ZIP SHA-256：

- Trigger Engine：`28BAD6E08FE2A237B3CDC3F076BA9C9626FCD089A97E8D58665E0D4DEF7DF1D0`
- Custom Conditions：`D68CC313C94D0A07F1D585C08B1B4764E63BF069A716FE63B891833DE0F8A5FE`

只读复核 `30001` 无监听。本轮未启动 Foundry，也没有使用 `server-next`。

全仓测试日志：`.pui/rule-fixes-full-test.log`。五项失败均为打包检查超时（60 秒、5 秒、15 秒），独立使用各模块的正式测试入口复跑通过；保留超时事实，不把这次单独复跑描述成原全仓运行全绿。测试过程中先前发现的生成器串值回归与旧状态断言已修正，整合后的全仓运行未再出现这些语义失败。
