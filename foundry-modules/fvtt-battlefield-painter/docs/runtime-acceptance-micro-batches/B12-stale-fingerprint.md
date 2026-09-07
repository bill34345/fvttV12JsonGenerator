# B12 — 真实过期 fingerprint 拒绝

只关闭 `P2-009`；不要重跑已经 PASS 的 clear/undo/redo/reload。创建 `BP-ACCEPT-20260815-B12-<HHmmss>-Square`，含 owned docs 和 foreign 五类文档。

1. GM 打开 DialogV2 clear preview，保存显示 counts 和 fingerprint 对应的 owned IDs。
2. 对话框保持打开时，不需要第二 GM：通过同一个已授权 GM 页面的公开模块 API或公开 Scene Document API创建一笔新的模块 owned 文档/绘制操作。Modal 阻止鼠标不等于阻止同页脚本；不得修改 LevelDB、CONFIG 或内部私有状态。
3. 点击旧对话框“清除”，必须被 stale fingerprint 拒绝并提示重新预览；保存拒绝消息、操作前后 owned/foreign IDs，证明没有删除。
4. 打开新 preview，仅证明新 fingerprint/计数更新后取消；不要再次执行完整 clear 回归。

证据前缀 `BP-E2E-B12-*`。若公开 API 在 modal 开启时不可调用，保存精确异常后标 BLOCKED，不要声称需要第二 GM，除非已证明同页公开 API路径确实不可用。批末停下。
