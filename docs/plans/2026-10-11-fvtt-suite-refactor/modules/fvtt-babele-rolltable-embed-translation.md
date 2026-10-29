# Babele Embed Translation：结果匹配与显示

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。B1/B2源码已实施，B3手册已归到owner；新候选原生接受仍待完成。

## 目标与当前事实

使来源表结果匹配、翻译选择、显示和wrapper生命周期清楚，保护原始TableResult和链接身份。

- owner：[foundry-modules/fvtt-babele-rolltable-embed-translation/](../../../../foundry-modules/fvtt-babele-rolltable-embed-translation/)。
- 稳定 runtime ID：`fvtt-babele-rolltable-embed-translation`；默认阶段：P5，依赖版本核对后。
- 当前0.2.1；硬依赖Babele2.9.1、libWrapper1.13.5.1，当前manifest为Core14.368/dnd5e6.0.2–6.0.6。矩阵已有25/5行嵌入与UUID切片；局部README/AGENT旧待验文字需核对，不能重放完整表库。
- 关键归属：`src/index.ts` 中wrapper、按 `_id` 再 `range` 的匹配/渲染；模块 README 与 manifest。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### B1 匹配与渲染分开

将TableResult的确定性匹配作为小Interface，返回来源身份与匹配结果；wrapper只取得输入并呈现，不改表数据。

### B2 wrapper生命周期

明确安装/禁用/重载的注册、卸载和依赖前置；不patch原型绕开已有公共包装机制。

### B3 帮助与版本证据

核对已记录的表/UUID切片与过期局部文字；说明未匹配如何保留原文和链接，不把部分翻译称全表库本地化。

## 必须保护

TableResult `_id`、`range`、`documentUuid`、原始内容链接和合法富文本；来源/翻译文本不写回用户表。

## 本模块最小真实接受

- 同ID、range回退、未匹配及不唯一候选不会把其他行的翻译错误贴上。
- 真实嵌入表行数/顺序/链接身份保持，翻译与对应来源逐行对齐。
- 缺少依赖或禁用后不遗留重复wrapper；本轮只接受改变的匹配/显示路径。

## 已有检查入口与下一步

- `bun run test:fvtt-babele-rolltable-embed-translation`
- `bun run build:fvtt-babele-rolltable-embed-translation`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

本地检查：原4个反例已复现并修正，14项/37断言及类型通过。匹配纯接口在 `src/result-matching.ts`，wrapper保留显示与缓存生命周期；详见[本轮记录](../../../reviews/2026-10-12-babele-identity-and-rendering.md)。下一出口为6.0.6原生行/UUID对照，不重放无关完整表库。 未达到该模块真实出口前不进入发行清单。
