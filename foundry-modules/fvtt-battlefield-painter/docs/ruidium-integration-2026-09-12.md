# 月蚀矿六种素材接入

## 范围与最终行为

用户确认了清理晶面细纹后的两张单晶体、三晶体簇和新脉络布局的五晶体簇，要求加入 Foundry 选项。原先确认的两张纯脉络一并接入。2026-09-12 用户明确允许本地脚本仅做透明抠图，不再重画。

| 选项 | 配置 ID | 素材 |
| --- | --- | --- |
| 月蚀脉络·延伸 | ruidiumVeinsSweep | ruidiumVeinsSweep-stage-1.png |
| 月蚀脉络·铺展 | ruidiumVeinsFan | ruidiumVeinsFan-stage-1.png |
| 月蚀晶体·环抱 | ruidiumCrystalCrescent | ruidiumCrystalCrescent-stage-1.png |
| 月蚀晶体·交叉 | ruidiumCrystalCross | ruidiumCrystalCross-stage-1.png |
| 月蚀晶簇·三簇 | ruidiumClusterThree | ruidiumClusterThree-stage-1.png |
| 月蚀晶簇·五簇 | ruidiumClusterFive | ruidiumClusterFive-stage-1.png |

六项独立可选、单阶段、固定对应图案，不随机替换。复用完整图形铺设：每笔一张 Tile，按绘制范围放大/拉伸，局部擦除保留原始 sheetFrame。没有新增自动腐化、伤害、减速、灯光、声音或墙体。旧36种配置与素材保留。

## 素材处理

生图工具移除棋盘背景仍返回假透明，未采用该次重绘结果。最终从用户确认的原始定稿处理：三张已有 alpha 的图片保留原像素；三张 RGB 定稿按红色主体与中性棋盘背景分离 alpha。完全内部的主体 RGB 逐像素保持一致，仅边界像素去除中性背景混色。检查真实 alpha、浅色晶面、细丝和透明缝隙，并在游戏中查看六种素材。

出处/结果哈希见 [素材记录](ruidium-assets-2026-09-12.json)。原始创作与参考研究留在本任务外部视觉证据目录；未复制第三方付费素材进模块。

## 验证结果

| 层级 | 结果 | 范围 |
| --- | --- | --- |
| 模块测试 | PASS | 298 tests / 5727 expects；test:coverage --timeout 15000 |
| TypeScript | PASS | bun run typecheck |
| 构建 | PASS | bun run build；84个安装文件，含66张PNG |
| 安装哈希 | PASS | 精确本地server-mirror模块，84文件与构建一致；无删除、无备份 |
| 方格 | PASS | 6种实际UI选择、画笔填充、素材文档与显示、两格擦除、撤销重做、清除保护 |
| 六角横列 | PASS | 同上6种 |
| 六角纵列 | PASS | 同上6种 |
| 原生移动与碰撞 | PASS | 每项每格型步行/飞行正常成本，无新增移动或视线阻挡 |
| 刷新重载 | PASS | 方格五晶体簇；重载后完整Tile数据一致，sheet material重新挂载 |
| 视觉复看 | PASS | 18张实际完整笔画截图复看；无棋盘底或缺失贴图 |
| 清理和恢复 | PASS | 三个本轮临时Scene及其子对象删除；view/active与paused恢复 |
| 独立玩家、长时、大面积性能 | NOT_EXECUTED | 本次没有执行这些层级 |
| 生产 | NOT_EXECUTED | 未连接或写入生产 |

首次机械检查的两处数量断言仍是旧36选项/60PNG，更新为42/66后通过；双构建ZIP一致性检查超过默认5秒，将本次测试命令超时设为15秒，保留原断言。UI测试最初的坐标保护沿用了旧视窗高度，按当前实际视窗修正测试脚本；未修改产品以规避失败。首次刷新准备漏启画笔、没有创建对象，不计入成功；重新启用画笔并确认1个Tile后才执行有效重载验证。

## 本地运行与交付边界

锁定 Foundry14.364 / dnd5e5.3.3，dataPath=F:/FoundryLab/foundry-v14/data/server-mirror，世界cor-cotn，端口30001。运行PID17116于2026-09-12T05:02:44Z启动，05:16:26Z完成场景清理，随后停止且确认端口释放，少于25分钟。原view/active=k0tDQjWqrbvHbjdu，paused=true均恢复。

证据目录：C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/ruidium-integration。包含测试/构建日志、alpha处理结果、安装前后哈希、runtime-results.json、18张截图、reload-result.json、cleanup.json及进程保护记录。

完整图形按选区比例拉伸，不承诺任意长宽下自动保形；六角轮廓和局部擦除遵循格位裁切。刷新验证为五晶体簇代表样本，不外推独立玩家或全部持久化组合。无commit、合并、push或生产部署。
