# B09 — Hex Rows 统一 P2

> **SUPERSEDED — 不再作为当前验收批次执行。** 本文件保留历史 Hex Rows P2 组合步骤；当前动画、聚类灯光、零新声音和零 Battlefield Painter 音频请求由 R02 统一验收。不得重新验证 OGG 或 sound cluster。

本批只完成 `P2-011` 的 Hex Rows 子结果。创建 `BP-ACCEPT-20260815-B09-<HHmmss>-HexRows`，完整组合下实际绘制 fire/frost/brambles 两阶段。

逐项证明：六种 Tile 在玩家端可见且 WebM 帧推进；三种 OGG 产生对应 AmbientSound；fire lights 和 sound clusters 的 membership 每组不超过 16 cells；同一输入重建结果稳定；clear preview 只统计 owned docs；clear 后本批 foreign Tile/Region/Light/Sound/Wall 存活。Hex geometry 已有 PASS，本批不重跑六顶点与共享边详证。

保存玩家可见截图/短录屏、GM 文档 JSON、network/console/server 区段，前缀 `BP-E2E-B09-*`。不要在本批测试过期 fingerprint 或完整 undo/redo。完成后只将 Hex Rows P2 子结果写 PASS，`P2-011` 总体仍 PARTIAL，立即停下。
