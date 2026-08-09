# 伤势上限与 Token HUD 追加验收

日期：2026-08-09

环境：本地 `F:\FoundryLab\foundry-v14` / `server-mirror` / `cor-cotn`

锁定版本：Foundry VTT `14.364`、dnd5e `5.3.3`
模块：`fvtt-injury-fading-spirits` `1.0.0`

## 目标

- 伤势的所有受支持入口固定为 `0–3`，不能出现第 4 层。
- 伤势加入 Token HUD 状态列表；有伤势时状态项高亮，并在 Token 左上显示带层数的图标。
- 左键逐层增加且在 3 层停止；右键逐层减少。
- Actor flag 保持权威，Active Effect 仅作显示投影。

## 机械验证

- 模块 `typecheck`：通过。
- 模块测试：`52 pass / 0 fail / 328 expect`。
- 模块构建：通过，构建树包含未激活基础图标 `icons/injury.svg` 以及 `injury-1.svg`、`injury-2.svg`、`injury-3.svg`。
- 根 `typecheck:foundry-modules`：通过。
- 根 `agents:check`：通过。
- 安装器仅写入精确 Lab 路径，安装前旧模块已备份；最终安装 hash 为 `dc2f85902627bba73c6fa1ba924caa9971b12d71f6b9dea4813ce1e95a615c91`。

## 真实 Foundry 语义验收

在 `cor-cotn` 的空白 `test` 场景中创建可追踪的临时 character Actor 与 linked Token：

1. 世界运行时报告 `Foundry 14.364`、`dnd5e 5.3.3`、模块 active；`CONFIG.statusEffects` 中存在 `fvtt-injury`，中文 HUD 名为“伤势”。
2. Token HUD 左键连续操作得到 `0 → 1 → 2 → 3 → 3`。每一步 Actor flag 与投影一致；1–3 层始终恰好一个 `fvtt-injury` Active Effect。
3. 三层投影依次使用 `injury-1.svg`、`injury-2.svg`、`injury-3.svg`，`showIcon=2`（`ALWAYS`）；HUD 条目具有 `active` 类，三层时继续左键不产生第 4 层或第二个效果。
4. 初版右键回放只发送了 `contextmenu`，独立只读复核指出 Foundry v14 核心还监听 `auxclick`，该证据因此作废。模块随后改为由 `contextmenu` 只屏蔽菜单、由捕获阶段 `auxclick` 执行一次减层并阻止核心二元 toggle。最终以完整 `contextmenu + auxclick` 序列重跑：0 层右键保持 0 且效果数为 0；3 层右键后变为 2，效果数仍为 1，两个事件均被取消。
5. 将临时 Actor 的旧数据直接构造成 4 层，再触发当前场景协调；持久 Actor flag 被活动 GM 真正写回 3，投影为三层图标。
6. 另建无模块 flag 的临时 character Actor，真实执行四次“正 HP → 0 HP → 正 HP”；观察序列为 `[1, 2, 3, 3]`。
7. 浏览器日志未发现由 `fvtt-injury-fading-spirits` 引入的 error。测试工具清理 HUD 时出现一条 Foundry `BasePlaceableHUD#clear` 弃用警告，它来自验收脚本而非模块代码。
8. 两个临时 Actor 与临时 Token 均已删除；核对 `actorRemaining=false`、`tokenRemaining=false`、HUD 已解绑。
9. 最终限定只读复核为 PASS：无 P0/P1；确认 `auxclick` P1 已关闭，完整事件序列、synthetic Actor socket 与重复投影清理回归均存在。

## 边界与未执行项

- 本轮追加验收覆盖活动 GM、linked Token、真实 HP Hook、HUD 左右键、旧 4 层归一和清理。
- 本轮没有重跑双 GM、玩家客户端 socket、unlinked synthetic Actor 或完整 Fading Spirits 仪式矩阵；这些不属于本次两个缺陷的完成证明，不能由本报告外推为新的全矩阵验收。
- 未连接或修改生产 8080；未执行真实跑团长期验收。
