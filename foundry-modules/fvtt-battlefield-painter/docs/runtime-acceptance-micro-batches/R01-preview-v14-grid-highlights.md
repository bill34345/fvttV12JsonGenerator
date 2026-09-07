# R01：修复后 Foundry v14 网格预览

本批只验证修复后的鼠标预览和预览/提交一致性，不重跑 B11、B12 或 SQ-011，不清理其他批次 fixture。

## 前置

- 使用精确 Foundry `14.364` / dnd5e `5.3.3`、全新 Square、Hex Rows、Hex Columns 场景。
- GM 使用命令行 Chrome，玩家使用独立 Codex in-app Browser；两端身份和权限先用可见 UI 确认。
- 每个场景使用新的 `BP-ACCEPT-20260815-R01-<HHmmss>-` 前缀；保存 GM 文档/API、玩家截图、两端 console/network 和 server log 新区段。

## Case

1. 半径 0—4 各选至少三个位置，验证 hover 高亮存在、位置和颜色正确；记录 `canvas.interface.grid` 高亮层名称及位置集合。
2. 覆盖 pointer leave、deactivate、ApplicationV2 close；确认高亮清空且普通 Foundry 控制恢复。
3. 半径 4 在释放前确认显示 81 格，再释放并确认 committed offset 集合与预览集合完全相同。
4. 直线覆盖两个方向；填充覆盖四个 endpoint 方向。分别保存预览 offset、`canvas.grid.getDirectPath`/核心邻接期望和最终文档 offset。
5. 三类网格都执行至少一组 free、line、fill；玩家端不得出现 Painter 控件或可触发绘制的 pointer 事件。

## 通过门槛

- 三种网格都出现真实预览；无“能落笔但无预览”的状态。
- 预览、核心期望和最终提交集合逐项相等。
- 缺失高亮 API 的兼容 fixture 能在激活前拒绝挂载 listeners，并给出一次 GM 错误提示。
- SQ-004 只有在生命周期和三类网格全部通过后升级；SQ-005/006/007 只补充预览/提交相等证据，不改写旧失败记录。

## 停止条件

任何网格的高亮位置、数量或提交集合不一致，或出现跨客户端异常，立即冻结证据并停止本批。

## 运行结果 — 2026-08-16

**PASS。** 在 Foundry 14.364 / dnd5e 5.3.3、命令行 Chrome GM 与独立 in-app Browser 玩家上完成。Square 半径 4 预览与提交均为 81 格；Hex Rows、Hex Columns 半径 4 均为 61 格。Square 的双向直线和四个填充端点方向，以及 Rows/Columns 的直线与填充补测，预览 offset 集合均与最终 owned Tile cellKey 相等。三种网格均验证了 pointer leave、停用和窗口关闭后的高亮清空；玩家同步后 `isGM=false` 且无 Painter 控件。临时场景均已通过 Foundry Document API 删除，原 B12 场景已恢复。
