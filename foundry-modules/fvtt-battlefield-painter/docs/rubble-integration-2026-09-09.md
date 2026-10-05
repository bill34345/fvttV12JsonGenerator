# 碎石 Debris (Stone) — 2026-09-09

用户确认整张放大的蛛网后授权继续下一项。当前新增第九种效果：碎石；前八种保持用户已确认基线。当前结果为核心行为与视觉通过，原生Token拖拽未通过，不宣称完整运行矩阵完成。

## 参考和本项目规格

本轮用AnySearch重读[Tile Arsenal官方商店](https://www.foundryvtt.store/products/tile-arsenal)，并用浏览器查看[公开36项目录](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-3.webp)。Debris (Stone)显示为单阶段散落石块，带Region图标。公开画面不能证明具体移动倍率或内部算法。

本项目选择单阶段、3张原创透明碎石图，逐格随机选择并保存staticVariant。每格一个原生Tile；本轮不增加shader、ticker、光、墙、声音或伤害。由原生Region将步行困难度设为2；飞行、游泳、掘地保持1，衍生移动方式由Foundry本身计算。该倍率与动作范围是本项目设计，不冒充付费模块配置。

使用灰白石灰岩、棱角石块、薄板和细碎瓦砾，保留透明地面与不规则外缘。美术已由代理在330px和100px格子合成、方格和六角实景下自审，尚无用户对本组素材的确认。3图覆盖alpha约27.5%、21.9%、38.4%；均RGBA1254×1254。全部35个旧素材保持不变。

## 检查结果

证据根：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/rubble`。

| 门禁 | 结果 |
| --- | --- |
| 模块测试 | PASS：224 tests / 4079 expects / 35 files；随机保存、失败恢复、所有权、单阶段和动作限定回归 |
| 类型与构建 | PASS：typecheck、build；测试fixture构造器可选参数的类型错误已修复 |
| 方格正式画笔 | PASS：30Tiles、1Region，三种图数量7/13/10；修订版仅walk=2，其余独立动作=1 |
| 擦除/历史 | PASS：擦除两格剩28Tiles和28个移动多边形；undo/redo精确保持图案与区域 |
| 实际页面刷新 | PASS：28格所有图案、位置、旗标和Region快照精确保持 |
| 原生地形路径成本 | PASS：5ft距离在碎石内walk消耗10ft；普通地面、孔洞和fly均5ft；使用createTerrainMovementPath后measureMovementPath |
| 两种六角格 | PASS：各20Tiles+1Region，擦除后19Tiles+19个六顶点多边形；横列额外验证undo精确恢复 |
| 所有权清除 | PASS：正式清除后模块audit全部归零，测试用非模块Tile和Region均保留 |
| Token显示 | PASS：实际Actor的非关联Token显示在碎石上方，HP保持8 |
| 原生拖拽 | NOT_PASSED：尝试被角色快捷栏遮挡，最终位置未改变；未把地形路径计算冒充成功拖拽 |
| 独立玩家、弱GPU/大面积/长时、生产 | NOT_EXECUTED |

## 发现和修正

最初通用移动工厂将所有独立动作设为2，实机读取发现fly/swim/burrow也受影响；已增加可选动作限定，碎石只传walk，其他效果保持原工厂行为。重新测试、构建并刷新后正式重绘，核对walk=2和其他=1。

第一次测量只调用measureMovementPath，没有加入地形路径，输出成本5并不能测试Region。按本机14.364源码核对公开接口后，改用createTerrainMovementPath提供地形数据，再测量得到10/5对照。一次擦除快照读在异步重建中间，随后等待完整操作并重做undo/redo，最终快照一致。

## 环境收尾

Foundry14.364/dnd5e5.3.3；本地server-mirror，30001。

Node30748于12:30:38 UTC启动，25分钟保护于12:55:40 UTC停止。此时核心检查已完成，但场景尚未清理。随后只做一次3分钟保护的清理启动：Node44780于12:59:48启动，13:02:19清理全部3个场景及其Token/测试外来对象，原view/active `k0tDQjWqrbvHbjdu` 与paused=true恢复，随即停止。累计运行少于30分钟，没有在清理启动中继续验收。

没有提交、合并、推送、生产写入或修改前八种效果素材。剩余原生拖拽验证需未来单独受限运行，不自动再启动或拼接测试。
