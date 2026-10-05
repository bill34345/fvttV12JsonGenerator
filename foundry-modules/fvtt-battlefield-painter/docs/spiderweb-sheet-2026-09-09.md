# 蛛网整张放大修订

用户指出大面积蛛网应该仍为同一张图，只是放大。此前逐格随机重复的机械检查不代表该视觉目标成立，撤回旧版视觉完成结论。

## 本次行为

- 每笔绘制一个原生 Tile，随机选择一次 A/B/C 原创图片，整图覆盖笔画的边界范围。另起笔画是另一张独立网；大面积可用填充笔刷。
- 保存 `spiderweb-sheet-v1`、`sheetCells`、`sheetFrame` 与 `staticVariant`。擦除移除选中格位，但保留原始图片范围；不会缩小、移动或重新抽图。
- 原生 Tile mesh 使用静态 alpha mask，根据真实方格/六角顶点裁切覆盖区。保留原生深度、遮挡与色调程序；每笔一个 mask，无额外 ticker。mask 最长边上限2048像素。
- 原来的 `spiderweb-static-v1` 逐格数据仍可读取和擦除，不自动迁移。其他七种效果行为及全部35个素材不变。
- 仍是单阶段视觉标记，不自动应用束缚、减速、伤害、灯光或墙。

## 检查与实机证据

证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/spiderweb-sheet`。

| 检查 | 结果与样本 |
| --- | --- |
| 模块测试 | PASS：217 tests，3942 expect，34 files；覆盖整张范围、边界擦除、占位、随机持久化、旧格式、异常元数据、材质复用与释放 |
| 类型与构建 | PASS：`bun run typecheck`、`bun run build` |
| 方格完整形态 | PASS：正式填充画笔5×6共30格生成一个600×500 Tile，显示完整大网，`square-full.png` |
| 孔洞和边缘擦除 | PASS：中间擦除后29格；再擦一列后24格，原frame保持；`square-hole.png`、`before-reload.json` |
| 历史与占用 | PASS：撤销/重做快照精确相同；覆盖已有格位不创建重复图块 |
| 实际页面刷新 | PASS：reload后选图、范围、格位与材质快照精确相同；`reload.json` |
| 两种六角格 | PASS：每种正式画笔30格仅一个Tile，擦除变29格并保持图框；横列额外检查撤销；`hexrows-hole.png`、`hexcols-hole.png`、`hex-results.json` |
| Token | PASS：GM原生拖拽从200,200到600,200，HP保持8；无Region/Wall；等待移动动画完成后读取最终位置 |
| 清除及资源释放 | PASS：正式清除后唯一非模块Tile保留，蛛网材质归零；切换场景与最终恢复后也归零 |

Foundry14.364 / dnd5e5.3.3 / PIXI7.4.3，本地server-mirror，30001。刷新期间一次CDP等待超时，随后读取证实切场景完成；翻译包弹窗曾挡住一次六角擦除，关闭弹窗后重做并读取29格，未将被挡操作记为通过。

Node56040于11:52:07 UTC启动，11:59:32 UTC临时Scene/Token全部清理，原view/active `k0tDQjWqrbvHbjdu` 与paused=true恢复；随后Lab正常停止，保护程序记录提前结束。没有生产写入、提交、合并或推送。

## 尚未执行的层级

NOT_EXECUTED：独立玩家客户端、超大面积/弱GPU性能、长时稳定性、生产部署。静态mask会增加每笔一个材质绘制，不能据30格样本推断大规模性能。三张原创图未重新生成，视觉自审针对本次整张缩放和裁切。
