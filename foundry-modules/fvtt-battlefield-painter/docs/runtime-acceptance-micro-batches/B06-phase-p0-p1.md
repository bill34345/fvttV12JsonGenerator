# B06 — P0 与 P0+P1 必须实际绘制

只关闭 `P2-002`、`P2-003`。创建 `BP-ACCEPT-20260815-B06-<HHmmss>-Square`；两个组合之间清除本批模块文档，但不得删除 foreign fixture。

1. 设置 P0：fire/frost/brambles 每种都实际绘制 stage I 和 stage II。保存 Tile src 为静态 WebP、fire light、AmbientSound=0；面板只允许 free、radius 0、无 preview/history/P1 控件。玩家保存可见静态结果。
2. 设置 P0+P1：实际完成 radius、line、fill、preview、erase、stage、undo、redo，不只截图控件。保存每一步 offsets/history/audit，玩家保存可见变化。
3. 两组合都由 GM API 读取当前 phase state，并由玩家证明无变更入口。结束时恢复完整 Alpha 组合，但不要执行 P2。

证据前缀 `BP-E2E-B06-*`。任何“控件正确但未实际绘制”的结果只能是 PARTIAL。失败冻结后停，不修改源码。
