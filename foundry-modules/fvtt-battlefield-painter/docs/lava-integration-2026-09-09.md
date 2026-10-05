# Lava 熔岩接入与验收 · 2026-09-09

范围：沿用原有未提交worktree，新增第六种效果；无commit、merge、push或生产操作。火焰、冰霜、荆棘、酸液、积水既有素材逐文件SHA-256保持不变。

## 来源与本项目行为

- [Tile Arsenal公开产品页](https://www.foundryvtt.store/products/tile-arsenal)及[阶段展示图](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-5.webp)：可见暗灰热裂岩与橙黄熔融地面两个阶段。
- 图片不能证明原版移动代价、伤害数值、自动回合触发、shader或灯光参数；这些仍未知。未使用付费包素材。
- 本项目选择：I裂岩保持静态、不发光；II熔融使用16秒内部微流动与原生Torch灯光（速度2、强度3、alpha0.18）。两阶段正常移动，无自动伤害、阻挡墙或移动Region，伤害和通行由GM裁定，阶段由GM手动切换。
- 新增PNG1254×1254 RGBA，原始文件不做后处理。轮廓随格位稳定旋转0/180度、Tile外扩15%。不增加质量/性能模式。

## 验收

| 层级 | 结果 | 证据与边界 |
| --- | --- | --- |
| 源素材/透明通道 | PASS | 两张原图人工查看，真实RGBA；alpha覆盖约77.2%和81.3%；既有素材hash不变 |
| 静态自审 | PASS | 底图合成检查单格、连片、环形留洞和拐角；成熟阶段橙红明确，允许可见格块重复，不宣称无缝 |
| 模块测试 | PASS | 195 tests，3638 assertions，31 files，0 fail；含阶段光源移除、材质恢复、错误marker拒绝 |
| 类型/构建 | PASS | 模块typecheck；31文件安装包；本地逐文件hash一致 |
| 方格正式画笔 | PASS | 两阶段9+9格，单格切换，擦除17格、撤销18、重做17 |
| 六角横列/纵列 | PASS | type2/type4各完成同一正式画笔操作链；纹理实际加载；矩形Tile适配，不是六边形裁切 |
| 原生光源/材质 | PASS | 初始熔融9材质/1灯；切换10材质/2灯；清除0材质/0灯；diagnostic=null |
| Token显示/移动 | PASS | 真实角色Token在熔岩上方显示；GM原生拖拽从(600,260)移至(900,260)，跨过熔岩。GM不是独立玩家权限证明 |
| 动态自审 | PASS | 实际前台画布498帧、17.07秒；抽查跨周期帧，轮廓稳定，无明显白闪/整体漂移；录像不作为FPS性能基准 |
| 所有权清除 | PASS | 仅清理模块文档，保留外部Tile和Token；原view/active/paused恢复，三个新测试场景删除 |
| 独立玩家客户端/生产/长时 | NOT_EXECUTED | 本次未运行，不由GM证据替代 |

本地精确环境：Foundry14.364 / dnd5e5.3.3；server-mirror / cor-cotn；端口30001；Node23916。启动07:50:50 UTC，停止不晚于08:10:33 UTC，驻留约19分43秒，25分钟保护未触发。恢复view/active=k0tDQjWqrbvHbjdu、paused=true，端口释放。

三种临时场景：u64ve5tJGCMYLuy4、p8FrcSOxG3DJ7kX2、5f5YcEzcaWDO7iUN，均已通过owner=lava-20260909身份检查删除。上轮三个owner=flooding-20260909残留场景本次已清理；这不补足Flooding尚缺的正式实机验收。

## 证据

本机证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/lava/`。

- `runtime-result.json`：16个操作快照、Token移动、清理和恢复结果。
- `lava-runtime.mp4`、`capture.json`、`frames/`：按原始时间戳编码的真实录像。
- `offline-art-review.png`、`runtime-preview.png`、`motion-review.png`、`hexrows-runtime.png`、`hexcols-runtime.png`：实际素材与画布检查。
- `module-tests.log`、`install-verification.json`、`preservation.json`、`launch.json`、`watchdog-result.json`：机械与环境证据。

限制：原版规则仍未知；连片存在重复图案；六角轮廓阶梯化。视窗1280×720低于Foundry建议高度，客户端显示尺寸警告，所测控件仍可操作；未作完整响应式布局验收。第一次后台录像没有帧，未计为成功；前台重新录制后得到上述498帧。一次场景切换后窗口实例尚未就绪，读取失败；待真实窗口出现后完成操作。一次在仓库根误启动覆盖测试，已终止，不列入模块通过证据。停止服务后浏览器错误页阻止关闭调用，未绕过其策略，服务和测试场景已清理。

## 第一阶段裂隙修订 · 2026-09-09

用户认可整体效果后要求部分热裂隙更明显。采用原创重绘版：较宽橙红主裂隙与细小支缝并存，暗色岩壳仍为主体；外轮廓和岩块布局有小幅变化。第一张编辑候选为RGB假棋盘，已拒绝，不进入模块。最终原始PNG为exec-4c240d4c-dbbf-4bd3-b72f-97152c81195c.png，1254×1254 RGBA，SHA-256 `1944f5a71ba2d0faa5b206036ced853f38803803e76d134297b7e407e008c293`，替代第一阶段旧hash `e811e4fec82b03c9dd03ab531822f6a9c00ef0f0320f5523bc3ec67252989bf5`。第二阶段和其他素材未变。

真实透明通道和100px格子底图合成自审PASS（单格、连片和留洞）；模块测试/构建另见本轮证据。此次仅替换静态图片，未重启Foundry，修订PNG的实机视觉为NOT_EXECUTED；上文实机录像展示旧第一阶段，不能作为新版画面。证据：本机visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/lava-cracks/comparison.png（左旧右新）。

### 用户美术定稿确认 · 2026-09-09

用户明确回复：“这个好多了，就用这个。那么现在熔岩的美术也确定好了。”因此第一阶段加粗主裂隙新版与第二阶段现有熔融图均列为用户已确认美术基线。此确认不改变新版第一阶段尚未重跑Foundry的验收边界，也不授权提交、发布或继续修改已定稿素材。
