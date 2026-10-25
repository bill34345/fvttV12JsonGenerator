# FVTT Trigger Engine

`fvtt-trigger-engine` 在 Foundry VTT 14.364 / dnd5e 5.3.3 与 Mirror 14.368 / 5.3.3 运行，新增 Foundry 14.368 / dnd5e 6.0.5 精确候选。它监听 Actor 文档更新、Combat 回合开始和回合结束，按世界设置中的定义调用宏，并向其他模块公开事件订阅接口；6.0.5 已通过四模块迁移所需的限定事件、回合、防重复和真实 HP 联动验收。

自有 Next 的 14.368 / 6.0.6 已接受本模块正常首次保存、管理器显示、单 GM 的禁用／不匹配零动作与匹配一次、在途退订、普通客户端重载及精确清理。初始无持久 Setting 行是正常默认值，首次保存才创建；这不承诺跨客户端原子保存。另已接受 Custom Conditions 的 HP／伤势消费代表链；WMP 外部攻击事件、多 GM 和完整 Combat 分支仍待各自验收。该版 Token 移动会新增 `flags.dnd5e.lastMovedToken` Actor 更新；只监视 HP 的触发器不会因此执行。

这个模块不拥有任何具体状态规则。Bleeding、Burning、Frozen 和伤势由独立的 `fvtt-custom-conditions` 模块管理；Trigger Engine 只负责事件、active GM 单执行者、Actor 队列、重复保护、因果链和宏调用。Actor 事件额外携带原生更新 Hook 时捕获的 `capturedModifiedTime`，供订阅者与 before/after HP 一起形成可持久去重的事务身份；旧订阅接口与 WMP external API 不变。

已保存的触发定义无法安全改写时，当前 active GM 会看到警告。管理器保存失败时显示原因并保留输入。若世界设置中的触发定义含未来 schema、无效条目或未知字段，仍可读取可识别的有效定义，但编辑会被拒绝，原设置保持原样供核对。同一客户端的定义改动按顺序保存；Foundry 设置接口没有跨客户端或直接设置写入的原子比较机制，不能据此声称全局互斥。

Actor 事件的 `before`／`after` 继续保留持久源数据。自动计算最大 HP 的角色，其源 `hp.max` 可以为 `null`；HP 消费者应使用同步捕获的 `preparedHp.before`／`preparedHp.after` 数值，不能把源 `null` 转成 0。物品和效果使最大 HP 重算后，引擎刷新这份独立快照；排队期间不改读后来发生的状态。

## 触发器定义

触发器包含 `id`、`name`、`enabled`、`event`、`conditions` 和 `actions`。支持的事件包括：

- `documentUpdate` / `Actor`，需要 `watchedPaths`；
- `combatTurnStart` / `Actor`；
- `combatTurnEnd` / `Actor`。

条件操作数可以读取更新前后的快照或 JSON 字面量，操作符为 `eq`、`ne`、`gt`、`gte`、`lt`、`lte`。宏按定义顺序串行执行，并收到 `triggerContext`。

```js
const api = game.modules.get('fvtt-trigger-engine').api;
const unsubscribe = api.subscribe(async (context) => {
  if (context.event.type === 'combatTurnEnd') {
    // 由其他模块消费通用事件
  }
});

await api.create({
  id: 'low-hp',
  name: 'Low HP',
  enabled: true,
  event: { type: 'documentUpdate', documentType: 'Actor', watchedPaths: ['system.attributes.hp.value'] },
  conditions: null,
  actions: [{ type: 'macro', macroUuid: 'Macro.example' }],
});
```

只有当前 active GM 执行事件订阅者和宏。相同 Actor 的更新按观察顺序排队。宏应使用 `triggerContext.updateDocument()` 回写当前 Actor，让因果链能够阻止递归循环。

调用 `subscribe` 或 `subscribeExternal` 返回的退订函数后，尚未开始的回调会被跳过，包括已经进入当前交付队列的回调。已经开始执行的回调仍由调用者负责完成，退订不会撤销它产生的副作用。

等待订阅者、回合回调或宏解析期间若 active GM 改变，旧客户端停止后续分发和宏动作；`triggerContext.updateDocument()` 也会重新验权。已经开始执行的用户宏无法被引擎中断，宏内直接调用文档写入仍须自行检查当前权限。此修复已有定点回归，ServerNext 的双 GM 实机接受仍待完成。

回合结算等待 Foundry 原生 `combatTurnChange`，即核心回合与效果生命周期完成之后；不使用定时器猜测完成时间。快速切换回合时，同一次转换的结束、开始事件会一起按序入队。新建或导入 Actor 会建立更新前快照，便于消费者识别第一次 HP 变化。

历史 5.3.3 运行证据来自 `server-mirror` 的模块矩阵世界：管理器创建/编辑/启停、真实 Actor/Combat 事件，以及两个临时 GM 和 active GM 切换后的单次执行。该实例目前由 Forge 工作占用，本轮不访问或启停。当前重构只使用自有 `F:\FoundryLab\foundry-v14\data\server-next` / `127.0.0.1:30002`，精确 14.368/6.0.6；T1/T2 源码、构建、实装和业务接受分开记录。未对历史 serverNext/dnd5e 6.0.2 声明兼容。

当前候选使用说明与验收边界见仓库 `docs/runbooks/custom-conditions-and-trigger-engine-usage.md` 和 `docs/reviews/2026-09-21-custom-conditions-release-readiness.md`。

Trigger Manager 可从模块设置菜单或 Token 控制栏打开。状态管理器不属于本模块，应从 Custom Conditions 模块打开。

构建、测试和类型检查使用仓库根目录的 `bun run build:trigger-engine`、`bun run test:trigger-engine` 与 `bun run typecheck:foundry-modules`。
