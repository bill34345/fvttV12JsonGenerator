# FVTT Trigger Engine

`fvtt-trigger-engine` 是 Foundry VTT 14.364 / dnd5e 5.3.3 的通用触发器基础模块。它监听 Actor 文档更新、Combat 回合开始和 Combat 回合结束，按世界设置中的定义调用宏，并向其他模块公开稳定的事件订阅接口。

这个模块不拥有任何具体状态规则。Bleeding、Burning、Frozen 等状态由独立的 `fvtt-custom-conditions` 模块管理；Trigger Engine 只负责事件、active GM 单执行者、Actor 队列、重复保护、因果链和宏调用。

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

回合结算等待 Foundry 原生 `combatTurnChange`，即核心回合与效果生命周期完成之后；不使用定时器猜测完成时间。快速切换回合时，同一次转换的结束、开始事件会一起按序入队。新建或导入 Actor 会建立更新前快照，便于消费者识别第一次 HP 变化。

当前开发 E2E 环境为 `F:\FoundryLab\foundry-v14\data\server-mirror`，世界 `fvtt-v14-module-matrix`，`127.0.0.1:30001`。管理器创建/编辑/启停、真实 Actor 更新与 Combat 事件，以及两个临时 GM 同时在线和 active GM 切换后的单次执行已有实测证据。该环境按用户要求常驻至关机，测试任务只清理自己的对象，不启停 Foundry。未对 serverNext 的 dnd5e 6.0.2 声明兼容。

当前候选使用说明与验收边界见仓库 `docs/runbooks/custom-conditions-and-trigger-engine-usage.md` 和 `docs/reviews/2026-09-21-custom-conditions-release-readiness.md`。

Trigger Manager 可从模块设置菜单或 Token 控制栏打开。状态管理器不属于本模块，应从 Custom Conditions 模块打开。

构建、测试和类型检查使用仓库根目录的 `bun run build:trigger-engine`、`bun run test:trigger-engine` 与 `bun run typecheck:foundry-modules`。
