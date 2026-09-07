# B01 — Square 精确画笔边界

只关闭 `SQ-004`、`SQ-005`、`SQ-006`、`SQ-007`、`SQ-018`。创建 `BP-ACCEPT-20260815-B01-<HHmmss>-Square`，不重测已经 PASS 的 erase/stage/foreign-clear。

1. Preview：free 模式分别选 radius 0、1、2、3、4；每档记录至少三个指针位置的预览 cell 集合，移出 canvas、关闭面板后分别证明预览消失。
2. Duplicate：radius 0 同一格画两次；radius 4 做一次完全重叠和一次部分重叠。每步比较预览唯一 offsets、提交后 owned offsets、status skipped 数，不只比较文档总数。
3. Line：选定 A/B 两点，分别 A→B、B→A。通过 Foundry `canvas.grid.getDirectPath` 取期望序列，保存排序前路径和排序后 cell 集合；preview 与 committed 必须分别相等。
4. Fill：固定同一矩形的四种端点方向；每次保存 preview offsets 和 committed offsets，证明 inclusive 区域相等。
5. Redo：完成一笔 paint，undo，再做不同位置的新 paint；证明 redo 按钮禁用且调用 redo 不改变 audit/offsets。

每一步保存 GM 视图和 Document/API JSON；玩家只确认没有 Painter 控件。任一子项失败先冻结 `BP-E2E-B01-*`，本批停止且不改源码。全部五项闭环后更新对应 Case ID 为 PASS并停下。
