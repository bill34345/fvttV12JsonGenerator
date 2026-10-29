# Chat Memory Guard：页面会话缓存与渲染策略

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。G1/G2缓存与生命周期修复、G3同源帮助已实施，模块48项/298断言通过；包尚未安装，真实窗口/聊天/长时出口保持待验。

## 目标与当前事实

保持聊天渲染、头像媒体和页面会话缓存的职责明确，改善可解释的诊断和关闭行为；不把客户端裁剪变成服务器历史清理。

- owner：[foundry-modules/chat-memory-guard/](../../../../foundry-modules/chat-memory-guard/)。
- 稳定 runtime ID：`chat-memory-guard`；默认阶段：P5，可独立推进。
- 当前1.1.0，基础manifest指向Core14.368/dnd5e6.0.2–6.0.6，verified仍6.0.2，无Foundry模块硬依赖。随包帮助编入公共suite-handbook纯渲染源码。历史Next记录不代表新候选全部裁剪/设置/媒体或长会话接受；5.3.3目标按原来源保留。
- 关键归属：`src/runtime.ts`、`src/chat-window.ts`、`src/avatar-policy.ts`、`src/thumbnail-cache.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### G1 缓存生命周期

先核对现有thumbnail-cache是否已经清晰；固定页面会话归属、容量、释放和失效 Interface，只有发现混合职责才继续提取。

### G2 用户设置与渲染

将世界默认/浏览器覆盖、卡片窗口与头像策略分开；关闭/重开/重载不会重复监听或保留无界缓存。

### G3 帮助与可观测范围

说明设置影响的实际对象与可恢复阅读方式，公开诊断只显示本模块必要数据；按声明检查裁剪与禁用。

## 必须保护

module ID、现有世界默认/浏览器覆盖语义、会话缓存生命周期和真实聊天历史；不新增删除ChatMessage的权限或动作。

## 本模块最小真实接受

- 达到阈值后仅改变渲染/缓存，历史仍保留；关闭功能不继续裁剪。
- 头像策略、反复开关、重绘与重载无重复Hook或持续增长的本模块缓存。
- 设置和公开统计匹配实际行为；短案例不宣称长会话性能或根因已证明。

## 已有检查入口与下一步

- `bun run test:chat-memory-guard`
- `bun run build:chat-memory-guard`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

实现和原反例见[生命周期与帮助记录](../../../reviews/2026-10-12-chat-memory-guard-lifecycle.md)。独立审阅发现的设置变化期间旧裁剪批次P2已修正；worldDefaults/clientSettings、世界聊天历史、模块ID与只读诊断出口保留。下一步为包/手册收尾和后续可安全使用浏览器时的真实短案例；不以源码或短时检查承诺长会话性能，未达到真实出口前不进入发行清单。
