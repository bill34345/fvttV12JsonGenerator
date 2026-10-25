# House Rules：每条房规的应用与恢复

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。H1/H2源码已完成，H3保留未知Midi拒绝；原生出口待验。

## 目标与当前事实

把房规选项、纯规则计算、系统/Midi Adapter和持久应用/恢复分开，保留用户手改保护。多条紧密相关房规仍属于同一模块。

- owner：[foundry-modules/fvtt-house-rules/](../../../../foundry-modules/fvtt-house-rules/)。
- 稳定 runtime ID：`fvtt-house-rules`；默认阶段：P5，可独立推进。
- 当前0.1.3；精确目标门与可选Midi/DAE适配并存。Next6.0.5现有证据仅药水手改保护/恢复；manifest的Midi推荐上限local.9与当前local.10记录不一致，需要核实，不能直接放宽。
- 关键归属：`src/runtime.ts`、`src/settings.ts`、`src/core/potion.ts`、`src/midi-adapter.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### H1 单条房规 Interface

先选择药水应用/恢复链；配置读取、规则决策与原生写入各自明确，说明值来源和失败出口。

### H2 原值与手改保护

保持本模块已有功能性snapshot/ledger，分清可由本模块恢复的值与用户后续修改；不创建文件/世界备份或复制回滚目录。

### H3 可选依赖与其他规则

把当前实际Midi版本、核心路径和不可用原因明确化；其他重击等规则另按源规则与触发边界逐项接续。

## 必须保护

`flags.fvtt-house-rules`、设置schema/version、药水Activity原值/ledger、用户后续手改和其他模块字段。

## 本模块最小真实接受

- 应用→用户手改→恢复遵守原有保护；关闭/重新启用不累加同一修改。
- 没有Midi/DAE仍保留声明允许的Core路径；未知版本不能静默调用错误Adapter。
- 受影响的一条房规在真实系统出口读回；药水证据不推广到全部重击或Midi规则。

## 已有检查入口与下一步

- `bun run test:house-rules`
- `bun run build:house-rules`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

下一切片：H1；先解释并固化当前药水状态转换，再处理确有必要的内部提取。 未达到该模块真实出口前不进入发行清单。


本轮证据见[药水事务](../../../reviews/2026-10-12-house-potion-transaction.md)；下一步按总账保留原生及发行出口，不重复已通过的局部检查。
