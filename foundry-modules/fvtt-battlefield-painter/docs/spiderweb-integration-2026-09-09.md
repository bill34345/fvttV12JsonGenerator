# Spiderweb蛛网接入与验收 · 2026-09-09

本轮新增第八种效果蛛网，沿用当前未提交worktree。前七组已获用户确认；蛛网3图仅代理自审通过。全部32个既有素材文件hash不变。无提交、合并、推送或生产写入。

## 参考与行为

[公开产品页](https://www.foundryvtt.store/products/tile-arsenal)与[目录图](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-3.webp)包含Spiderweb；目录没有标注它有多个阶段。本项目据此采用单阶段，而不强行套两阶段。原版束缚、豁免、移动成本及具体实现没有充分公开证据，仍未知。

本项目：3张原创静态蛛网（完整偏心网、扇形网、交叠残网），每个新格随机选择，保存staticVariant=0/1/2。后续刷新、擦除重建和历史恢复保持选图。无光、声音、墙、减速Region或自动状态；束缚与减速由GM裁定。静态地图元素不额外制作动态。

目录阶段类型改为非空可变长度，控制器按当前效果阶段数校验；切换到单阶段时夹到stageIndex=0，并退出无效advance模式。所有卡片预览按自身阶段数夹取，避免其他效果处于II时访问蛛网不存在的II；单阶段只显示“单阶段 蛛网”并禁用阶段切换。服务对单阶段advance直接不做修改，保留原文档。

新增静态变体字段独立于已确认的bloodVariant，保留血迹字段、随机和旧场景语义。旧七种仍各两阶段。没有新增质量模式。

## 验收

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 3张原创素材 | PASS | 1254×1254真实RGBA，inspect_asset检查；原图与真实alpha底图叠合查看 |
| 静态自审 | PASS | 三种网形能区分；网丝间底图可见；单格、连片、环形留洞、拐角检查，无雾状整片覆盖 |
| 测试 | PASS | 214 tests、3914 assertions、33 files、0 fail，含单阶段预览/选择、no-op advance、随机保持、错误编号/所有权拒绝 |
| 类型/构建 | PASS | 模块typecheck；40个分发文件；安装逐文件hash一致 |
| 原双阶段兼容 | PASS（样本） | 正式画笔绘制3格阶段II血迹成功，再选蛛网自动回0；未对所有旧效果重新做全套实机 |
| 单阶段UI | PASS | 单一阶段按钮、caption单阶段、advanceDisabled=true、stageIndex=0 |
| 方格随机绘制/刷新 | PASS | 正式画笔24格，3素材实际各8格，页面reload后重新打开测试场景，编号/路径/旋转逐格一致；分布只是本次随机结果 |
| 方格擦除/历史 | PASS | 擦除23、undo24、redo23，邻格不变，恢复精确原选图 |
| 两种六角格 | PASS | type2/type4各18格，擦除17与undo18保持原图，type4 redo17；原生静态材质/纹理加载正确 |
| Token显示/GM移动 | PASS | 真实角色Token在网丝上方，从(600,200)原生拖拽到(900,200) |
| 所有权清除 | PASS | 模块地形清除，保留外部Tile和Token |
| 清理/恢复 | PASS | 3个测试场景删除、原view/active/paused恢复，标签关闭、端口释放 |
| 动态 | NOT_APPLICABLE | 静态效果 |
| 独立玩家/生产/长时 | NOT_EXECUTED | GM拖拽不代表独立玩家权限证明，无性能基准结论 |

本地Foundry14.364 / dnd5e5.3.3；server-mirror/cor-cotn；Node37404，30001。10:54:01 UTC启动；清理结果11:18:48 UTC已保存；25分钟保护于11:19:02 UTC停止自有进程。之后CLI确认停止，未拼接新运行。view/active=k0tDQjWqrbvHbjdu、paused=true已恢复。

测试场景TRsouxyOWeuXSlLB、EdyMq0Ce4mHoIWAl、D6SFCzK2X74VCTaP均经owner=spiderweb-20260909、非active检查后删除；未直接改世界数据库或原Actor。

## 证据与限制

本机证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/spiderweb/`。

runtime-result.json含12个画笔快照、单阶段UI、移动、清除和恢复结果，已逐项比较。square/hexrows/hexcols-runtime.png和runtime-preview.png为实机；candidate-review.png与offline-art-review.png为原始透明叠合检查；3份asset检查、tests.log、build.log、preservation.json、install-verification.json、launch.json、watchdog-result.json及final-verification.json记录机械和环境证据。

随机允许重复；六角格仍用矩形Tile适配，网丝不会按相邻地形做真正拓扑连接。1280×720有Foundry建议高度警告，所测控件经滚动可操作。单阶段规则属于本项目选择，不声称完整复刻原版。新增3图为代理自审，等待用户反馈，不称用户已确认。Flooding和新版Lava第一阶段的既有实机缺口保持不变。
