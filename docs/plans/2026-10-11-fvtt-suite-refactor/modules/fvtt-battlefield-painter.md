# Battlefield Painter：一次笔划的计划与事务

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。P1既有边界已核，P2事务已实施；P3真实出口待可用窗口。

## 目标与当前事实

让地形方案、视觉/规则输出、Scene 事务和对象所有权可以分别理解，保持一个用户笔划可读回、可明确撤销。已有特效不整批重做。

- owner：[foundry-modules/fvtt-battlefield-painter/](../../../../foundry-modules/fvtt-battlefield-painter/)。
- 稳定 runtime ID：`fvtt-battlefield-painter`；默认阶段：P5，独立功能可推进。
- 当前0.3.0-alpha.2；manifest范围较宽，代码按精确组合门控。无模块硬依赖，Tile Arsenal保持独立；当前源码没有Forge/Resolver模块调用链。Next6.0.5现有接受仅两格Square Fire动画/Region/light及重载切片。
- 关键归属：`src/scene-plan.ts`、`src/scene-transaction.ts`、`src/scene-ownership.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### P1 一个笔划的规划 Interface

选一个已知效果和网格形状，明确纯计划输入与 Tile/Region/Light 等输出；几何和规则断言属于模块，不搬进通用接受平台。

### P2 所有权与事务

区分自有/外来场景对象，隔离计划、预检、提交、读回及撤销；只有被本次计划和flags唯一识别的对象可处理。

### P3 单效果真实接受与帮助

在实际容器/Canvas检查宽窄面板和可见效果；只复验修改的效果/形状/规则链，迁入对应帮助与限制。

## 必须保护

`flags.fvtt-battlefield-painter` 的 ownership/bundle 身份及 Tiles/Regions/Lights/Sounds/Walls 关联；场景内外来对象和用户既有视图/设置。

## 本模块最小真实接受

- 一笔划生成正确对象与可见动画/形状，重载后仍在；没有意外重生成整场景。
- 撤销/重做只操作本次自有对象；失败/部分创建按明确事务出口读回，不扫目录猜归属。
- 非GM、错误版本或缺少必需能力不写Scene；原外来对象/已有状态恢复。

## 已有检查入口与下一步

- `bun run test:battlefield-painter`
- `bun run build:battlefield-painter`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

P1不做无必要重写；P2最终332项/6096断言、类型/build及独立复核通过，详见[本轮事务记录](../../../reviews/2026-10-12-painter-scene-transaction.md)。下一步P3原生Scene/可见效果/失败出口，保留既有美术，不新增Forge依赖。 未达到该模块真实出口前不进入发行清单。
