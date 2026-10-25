# Blood Hunter：内容包与显式迁移分工

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。BH1既有契约已核，BH2只读手改识别已修；BH3待明确无备份迁移方式。

## 目标与当前事实

让职业/子职/特性内容构建与Actor迁移有独立出口；内容包更新不自动改写已有角色。

- owner：[foundry-modules/fvtt-blood-hunter-2024/](../../../../foundry-modules/fvtt-blood-hunter-2024/)。
- 稳定 runtime ID：`fvtt-blood-hunter-2024`；默认阶段：P5，来源/分发及迁移模式明确后。
- 当前1.0.0；基础manifest为14.364/5.3.3，ServerNext目标构建沿用14.368/6.0.2内容身份并可到6.0.5上限。Midi/DAE只推荐；四子职Core/Modded真实矩阵仍有缺口。旧copy-first/备份迁移与当前无备份规则存在冲突，本计划不调用旧apply。
- 关键归属：`build.ts`、`src/migration.ts`、`packages/blood-hunter-v14/src/index.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### BH1 来源与内容构建

将来源身份、纯投影与pack输出分开，固定公开package入口；核对每个授予/特性来源，不复制另一份子职业务。

### BH2 只读迁移Preview

从Actor内容识别与差异说明开始，保护spent uses、advancement、手改和非BloodHunter数据；不因重构执行copy/backup/apply。

### BH3 迁移模式与目标接受

只有明确不创建备份的产品迁移方案和数据授权后才实现/执行写入。各子职及Core/Modded按实际改动补接受，Next合集读取与完整玩法分开。

## 必须保护

三个pack名和Document UUID、identity ledger、`flags.fvttJsonGenerator.bloodHunter2024`、已嵌入Actor的Item快照及所有用户进度。

## 本模块最小真实接受

- 内容包artifact与来源/授予一致，错误/陈旧来源不能发行；原有pack与UUID稳定。
- Preview零世界写入，并能准确报告手改/歧义/不匹配；不自动扫描迁移全部Actor。
- 将来获准的迁移只改明确目标并读回；保护既有等级、uses、advancement和无关字段。

## 已有检查入口与下一步

- `bun run test:blood-hunter-v14`
- `bun run build:blood-hunter-v14`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

下一切片：BH1与只读BH2设计；内容发布许可和旧备份迁移冲突未解决前不执行相应写入或发行。 未达到该模块真实出口前不进入发行清单。


本轮证据见[内容边界](../../../reviews/2026-10-12-content-module-boundaries.md)；下一步按总账保留原生及发行出口，不重复已通过的局部检查。
