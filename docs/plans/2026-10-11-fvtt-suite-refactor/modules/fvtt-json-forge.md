# Forge：制作流程与状态所有权

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。本页定义未来切片，本轮未实施。

## 目标与当前事实

在保持单一操作台与正式来源链的前提下，收敛输入模式、草稿、异步任务、审核候选和世界创建的状态所有权。不是重新制作已完成的统一 UI。

- owner：[foundry-modules/fvtt-json-forge/](../../../../foundry-modules/fvtt-json-forge/)。
- 稳定 runtime ID：`fvtt-json-forge`；默认阶段：P4，正在进行的 Forge 成果接续后。
- 当前0.5.0，正式目标为精确14.364/14.368 + dnd5e5.3.3。共享 browser-runtime/protocol 包，没有 Resolver/Painter 的模块硬依赖。0.5.0 已有有界本地操作台接受，真实 Provider、战斗包启动与压力范围分别保留。另一个 Forge 工作树正在使用 Mirror。
- 关键归属：`src/workspaceApplication.ts`、`src/intakeApplication.ts`、`src/runtime.ts`、`src/encounterRuntime.ts`；公开包 `packages/forge-browser-runtime/` 与 `packages/forge-gateway-protocol/`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### J0 接续真实候选

先确认 Forge 正在进行的工作、其已提交身份与交接；未提交成果需要 owner/用户决定整合。不用本轮 master 或复制文件覆盖其候选。

### J1 输入与异步状态

沿模式切换/草稿/取消/重绘/迟到结果收敛状态机；App 只持有 UI 与用例状态，生成和审核规则继续在正式包内。

### J2 审核与创建事务

accepted 候选的 source/hash/connection/target 资格与 Actor/Item 类型适配明确分开；创建仍一次提交完整产物并读回。

### J3 帮助与版本接续

接通统一帮助并迁入 owner 内容；6.x 生成作为另一个明确来源/投影切片，不能因其他模块支持6就顺带放行。

## 必须保护

Actor/Item sourceId 派生 Document ID、战斗包 kind/key ID、worldId:userId 草稿库身份、旧公开 API、来源与审核绑定、客户端 Provider 设置及零秘密输出。

## 本模块最小真实接受

- 切换模式、取消、重绘与迟到结果不恢复失效 accepted 候选；各模式草稿独立。
- Actor/Item 类型不混用，复用/派生身份正确；提交与读回期间不能产生重复写入。
- 关闭/重开和同源重复使用保持预期；不调用真实 Provider，除非当前实施范围已明确授权。

## 已有检查入口与下一步

- `bun run test:fvtt-json-forge`
- `bun run test:forge-blueprint`
- `bun run build:fvtt-json-forge`
- `bun run verify-release:fvtt-json-forge`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

下一切片：J0；当前只能完善计划/阅读已提交源码，等待 Forge owner 可交接的基线与窗口。 任何数据迁移或功能扩展另写具体范围；未达到该模块真实出口前不进入发行清单。
