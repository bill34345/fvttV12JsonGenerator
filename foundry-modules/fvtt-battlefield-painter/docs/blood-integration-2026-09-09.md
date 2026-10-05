# Blood血迹接入与验收 · 2026-09-09

本轮只新增第七种效果Blood，沿用既有未提交worktree并保留所有成果。火焰、冰霜、荆棘、酸液、积水、熔岩六组已由用户确认；血迹为代理自审通过，尚不称用户确认。无commit/merge/push或生产写入。

## 来源与实现选择

[产品页](https://www.foundryvtt.store/products/tile-arsenal)、[公开目录](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-3.webp)及[阶段图](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-5.webp)确认Blood有两阶段，画面为不同密度的血迹。原版自动伤害、状态、移动和内部实现仍未知；不从图片推断规则，未使用付费包素材。原产品当前要求14.365不代表本项目升级，本轮仍在锁定14.364/5.3.3验证。

本项目I“飞溅”是稀疏血点和小片飞溅；II“血斑”是较密血斑与短拖痕。两阶段为原生静态Tile，无光、音频、Region或Wall，不改变HP、状态、移动，不与第三方自动血迹联动。沿用稳定格位旋转0/180度和15%外扩，无新增动效和画质模式。

## 验收

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 原始PNG与透明通道 | PASS | 两张1254×1254 RGBA，真实透明间隙，原图未后处理 |
| 静态自审 | PASS | 100px格子下单格、连片、环形留洞、拐角；阶段差异明确，底图可见，无黑底/棋盘；仍存在重复形状 |
| 模块测试 | PASS | 200 tests、3728 assertions、32 files、0 fail，含marker负例、历史和清除 |
| 类型和构建 | PASS | 模块typecheck，33分发文件，安装逐文件hash核对 |
| 方格正式画笔 | PASS | I/II各9格，单格切换后8/10，擦除17、撤销18、重做17 |
| 六角横列/纵列 | PASS | type2/type4分别完成同一正式画笔操作链，纹理实际加载；矩形贴图适配，不是六角裁切 |
| 静态材质与副作用 | PASS | nativeStatic=true，液体材质挂载0，Light/Region/Wall/Sound均0 |
| Token显示和GM拖拽 | PASS | 真实角色Token在血迹上方；从(600,200)到(900,200)穿过血迹 |
| 所有权清除 | PASS | 保留外部Tile及Token，仅清除模块地形 |
| 七效果面板所测操作 | PASS | 七个入口存在，血迹/阶段/绘制/擦除/历史/清除均实际操作；720px视窗使用滚动，未作完整响应式验收 |
| 场景/进程清理 | PASS | 原view/active/paused恢复，三个临时场景删除，标签关闭，Lab停止 |
| 动态 | NOT_APPLICABLE | 静态效果没有额外动画 |
| 独立玩家客户端/生产/长时 | NOT_EXECUTED | GM操作不替代独立玩家权限证明，没有性能基准结论 |

环境：Foundry14.364 / dnd5e5.3.3；server-mirror / cor-cotn；Node4936；30001。08:49:51 UTC启动，09:10:27 UTC前停止，约20分36秒，未到25分钟保护。view/active=k0tDQjWqrbvHbjdu、paused=true已恢复，端口释放。

测试场景0eiUgwqOzoJ9DT46、52E0bgMUvr8xf4AK、Ugui0tamv9T4UW2x均核对owner=blood-20260909且非active后删除。未修改原Actor或直接操作世界数据库。

## 证据与边界

本机目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/blood/`。

`runtime-result.json`包含16操作快照及移动/清理结果，已逐项核对阶段和格数。`square-runtime.png`、`hexrows-runtime.png`、`hexcols-runtime.png`、`panel-runtime.png`和`runtime-preview.png`为原生视窗截图；`offline-art-review.png`为底图合成自审。`tests.log`、`build.log`、`install-verification.json`、`preservation.json`、`launch.json`、`watchdog-result.json`和`final-verification.json`为机械和环境证据。

模拟1600×1000时截图拼接失真，已清除模拟设置，恢复原生1280×720并重拍；不使用失真图验收。原生视窗有Foundry建议高度警告，所测操作完成，面板可滚动。欢迎/日历弹窗仅关闭UI，未修改设置。六角格仍使用矩形素材，可见重复，不宣称无缝或每格随机变体。

Flooding正式实机与新版Lava阶段I未重跑实机视觉的缺口仍保留，不能由本次Blood验收补足。
