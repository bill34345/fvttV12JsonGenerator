# B90 — 最终门禁，不允许清理

前提：R01、R02 和 B00–B12 中仍适用的历史/功能状态已有最终状态。B08 音频录制已退役，不再作为前提。缺任一当前适用结果时立即停，列出缺项，不得用本批替代。

1. 命令行 Chrome GM 与内置 Browser 玩家分别刷新；验证 Foundry/module 生命周期、Scene 切换、canvas teardown 无 Battlefield Painter error，关闭 `ENV-005`。重新抽样玩家权限拒绝、移动成本、成熟荆棘碰撞、一个 WebM、火光、零新 owned AmbientSound、零 Battlefield Painter 音频请求、erase/stage/undo/redo/reload、foreign survival、stale fingerprint 和 legacy cleanup。
2. 执行模块 test:coverage/typecheck/build；根 agents:generate、agents:check、typecheck:foundry-modules、ci:verify、git diff --check、Git/凭据/用户数据检查。保留仓库 coverage 失败明细；不得修改其他 package。
3. 将 `REC-006`、`P2-012` 明确写为 `PARTIAL — RELEASE GATE`；Alpha setter 保留。音频退役不需要用户听音结论。仓库 coverage 未解决时也不得宣称完整机械 PASS。
4. 更新 49 个 Case ID 和总表，列明每批证据、旧失败、修复和当前风险。

本批绝对禁止禁用模块、删除 fixture、停止 Lab或执行 B99。即使结论 PARTIAL/BLOCKED，也保留现场给 Sol/用户检查，然后停下。
