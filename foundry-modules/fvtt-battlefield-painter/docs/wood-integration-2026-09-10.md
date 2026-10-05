# 木质残骸 Debris (Wood) — 2026-09-10

用户确认碎石后授权继续下一项。新增第十种效果：单阶段木质残骸；前九种用户已确认基线及其素材不变。本组美术与行为仅代理自审，等待用户反馈。

## 参考与本项目行为

沿用本会话已核对的[Tile Arsenal公开目录](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-3.webp)：Debris (Wood)显示散落木板、单阶段及Region图标。没有获取付费素材或内部配置。

本项目独立生成3张透明图片：短断板、交错长木条、稀疏木块与碎片。每个新格随机一次并保存staticVariant，使用wood-static-v1标记；每格一个原生Tile。原生Region使步行困难度为2，飞行、游泳、掘地为1；衍生动作仍由Foundry处理。没有自动伤害、墙、光、声音或新增shader/ticker。倍率及动作范围是本项目选择，不冒充第三方内部规则。

三张图均RGBA1254×1254，alpha覆盖约41.9%、35.8%、24.4%。单格100px与混铺、孔洞、方格和Hex实际画面通过代理自审。Hex使用矩形透明图片兼容，移动区域则采用准确六角顶点；不宣称贴图无缝或专用六角裁切。

## 验收

证据根：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/wood`。

| 检查 | 结果 |
| --- | --- |
| 模块测试 | PASS：231 tests / 4216 expects / 36 files，含随机保持、失败恢复、动作限定、所有权与素材哈希 |
| 类型及构建 | PASS：typecheck、build、diff检查；一次独立构建进程持续占用CPU未产出，核对本任务PID后停止，仅重试构建即正常完成，根因未确定 |
| 方格正式画笔 | PASS：30Tiles+1Region，三种变体各10；从双阶段II切换后回到单阶段0，切换阶段按钮禁用 |
| 擦除与历史 | PASS：擦除两格后28Tiles+28个移动多边形；undo/redo快照精确一致 |
| 页面刷新 | PASS：重新加载后图片、位置、旗标和Region精确保持 |
| 原生地形路径成本 | PASS：5ft路径在木残骸中步行成本10ft；飞行、普通地面和擦除孔洞均5ft |
| 原生GM拖拽 | PASS：从Token下缘避开角色快捷栏，200,200拖到500,200，HP保持8；实际终点和截图均记录 |
| 两种六角格 | PASS：各20Tiles+1Region，擦除后19Tiles+19个六顶点多边形；横列额外验证undo精确恢复 |
| 清除保护 | PASS：正式清除后模块audit归零，非模块Tile与Region保留 |
| 独立玩家、弱GPU/大面积性能、长时、生产 | NOT_EXECUTED |

图像见offline-art-review.png、square-full.png、square-token.png、hexrows-hole.png、hexcols-hole.png；完整数据见before-reload.json和runtime-result.json。此次Token拖拽通过不自动填补此前碎石拖拽记录的证据缺口。

## 环境收尾

Foundry14.364/dnd5e5.3.3，本地server-mirror，30001。Node39008于2026-09-09 15:59:36 UTC启动；16:17:07 UTC清理全部3个临时Scene及其Token和测试外来对象，恢复原view/active `k0tDQjWqrbvHbjdu`、paused=true，随后正常停止。运行少于20分钟；未重新启动拼接验收。中文本地日期在本轮跨入9月10日。

全部38个既有素材不变；本次增加3图，安装共46文件。没有提交、合并、推送或生产写入。
