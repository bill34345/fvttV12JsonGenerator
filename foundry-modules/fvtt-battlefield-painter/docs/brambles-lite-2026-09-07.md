# 荆棘轻量适配候选 — 2026-09-07

最新状态：用户已认可透明、半写实手绘的阶段II，并要求阶段I按同一风格重做。本轮阶段I已改为细疏的年轻藤蔓，阶段II文件保持不变；已完成同尺度实景风格对照和来回切换检查。下文先前不透明候选属于被否决的历史记录。未提交、合并、推送或部署生产。

## 被否决候选的历史记录

### 变化

原荆棘两阶段共用同一张WebP和同一WebM，仅Tint/alpha不同。阶段I保留原蔓生素材/循环；阶段II改为独立木质密棘，静态512×512WebP，143236字节，白色Tint，alpha0.96，不增加视频解码器。显式升降阶选择目标素材；未选中格、擦除重建和历史恢复保留原来源。阻挡与移动规则保持原设计。Fire/Frost本轮未改。

## 机械验证

- 模块test:coverage：152 PASS / 0 FAIL，2384 assertions，24 files。
- 模块typecheck、build及git diff --check通过；打包校验包含新增素材。
- 构建与本地脚本SHA-256：66BF801E1F24B6051021176D98EAFB8E6B5F285D7FD739FCA626BAA6A151CC5A。
- 素材SHA-256：83FCDC308FEEC61564376C5DDF65743B8A04E4BDF40FBD8CA8886E015A6E3825。生成提示词及被拒候选见asset-provenance.md。
- 保留的轻量候选ZIP SHA-256：8D24E1F55514A2D7A5208C4A5BA5EAD018D279F8AFFC576AEA12A7D79714E38F；同名可交付物为fvtt-battlefield-painter-lite-candidate.zip，仍为0.3.0-alpha.1候选，不是正式发布。

## 真实Foundry验收

Foundry14.364/dnd5e5.3.3，server-mirror/cor-cotn，Node PID56740，loopback30001。原active场景始终k0tDQjWqrbvHbjdu。

- 方格实际画笔各画9格：18Tiles/2Regions/12Walls。432×432截图人工确认I露出地面，II为密实木质棘丛，已非仅颜色变化。重复纹样与方正边界仍明显，不宣称无缝融合。
- 中心单格升阶：8格I/10格II，中心换新WebP，Walls12→16；降阶换回brambles.webm，Walls16→12。Undo恢复II/16Walls，Redo恢复I/12Walls。
- 实际Token的terrain movement path：进入I的5英尺段cost10，普通地面同长度cost5；Token.checkCollision针对进入II返回true。是实际引擎规则检查，本轮未重复双客户端拖动测试。
- 300格II实际填充20×15：300Tiles/1Region/70Walls，地块视频纹理数0。Undo为0Tiles/0Walls且测试Token保留，Redo恢复300/70。
- 前台四倍CPU限速短时rAF采样：空场景1.8秒260帧，中位6.9ms/P957.1ms；300格1.8秒259帧，中位6.9ms/P957.1ms。不是GPU耗时、弱GPU实机或长时性能结论。最初后台标签1Hz样本作废。
- Hex rows实际画9格II/22外周Walls。中心降阶仅一格换回I，8格II不变，Walls28；Undo回9格II/22Walls。人工查看新图加载正常，兼容层仍为矩形Tile，不宣称六角贴合。

## 收尾与未执行

恢复原视图及paused=true；精确核对后通过Scene API删除yDgMMoBNxPWutiPZ（BP-BRAMBLES-FIX-20260907，300Tiles/70Walls/1Region/1Token）及7SOVvkYT0VCqUEQT（BP-BRAMBLES-FIX-20260907-Hex，9Tiles/22Walls/1Region）。未创建或修改Actor。CPU限速恢复1，测试页关闭，Lab已停止。安装无备份。

新版荆棘密度、尖刺和整体观感待用户最终确认。低配物理电脑/弱GPU、高画质档及切换界面、生产、长期会话、>300格、根CI、正式发布均为NOT_EXECUTED。四倍CPU模拟只提供限定证据。按用户指定两步顺序推进。


## 后续修复：真实透明、半写实手绘棘藤

该轮候选ZIP替换了被否决的整块底图版本，SHA-256为31BB42F29909926140C06BBF7602FA8889F36B8E37D9C0C688C847A27B9F8957；此hash现也属于历史记录，最新包见下节。

不透明写实候选已撤回。本轮替换为具有粗藤、大尖刺和可见笔触的手绘素材；I阶段及其他地形不变。512×512 lossless WebP354494 bytes，SHA-256032EC169B044EA56AC6B0CB3FC1B365D5012062F1B55916B8C7F3D547DE4CAEC。262144像素中101772像素完全透明，实际地图能从空隙透出。不是降低整张图片透明度掩盖底图。

机械检查：152PASS/0FAIL，2395assertions；原素材检查已扩展到阶段II，要求真实alpha、完全透明像素、尺寸及边缘范围，防止再次引入不透明整块图。build与最终安装16文件对账通过。未修改运行时代码，所以沿用前轮类型检查；未重复300格性能与移动规则测试，不将历史模拟改写为本轮实测。

真实Foundry14.364/dnd5e5.3.3：方格实际画笔各画9格，两阶段同尺度432×432截图。18Tiles/2Regions/12Walls；阶段II真实加载512×512WebP，video=false。人工检查：无不透明底板，地图纹理清楚透出；II的粗藤和大尖刺区别于I的细藤网络。新图比旧图明显更有手绘笔触。格缝、周期重复仍是已知限制，最终风格由用户看图确认。

本轮Node57980、SceneFwPTieIDMy9zwaAF（BP-BRAMBLES-PAINTED-20260907）已核对身份后停止/删除；恢复原视图k0tDQjWqrbvHbjdu及paused=true，active场景未变。未创建Actor/Token。无生产操作、无提交发布。


## 当前修订：统一蔓生与棘墙风格

当前保留的轻量候选ZIP SHA-256：D677899180C2BB09E00FFB0E2CF893D3F971241EA630D58B8CBFB6805432363F。安装目标17文件与构建逐一匹配。

阶段II保持已认可文件不变；阶段I新增brambles-stage-i.webp，半写实手绘、细藤、小刺和更多空隙。两阶段均为512×512静态WebP，新绘荆棘不再使用旧循环。原循环仍为既有场景兼容文件，未自动迁移旧世界。

- 机械：152PASS/0FAIL，2409assertions，24files；typecheck/build/diff检查通过。两阶段都纳入真实alpha与尺寸检查，并检查显式legacyTexture仍能保留。阶段I173008 bytes，SHA-256FD5EBB00985489F44C1C945D3600BB65F54F4D1808154CC47D70AF0F2CBC7EB0；主脚本EE5AC01C772BDF8B760FEF16F32A07066988E1381882C28C8CA6EE2375D6CD4A。
- 人工：实际3×3同尺度截图对照，色系/笔触同属一套；I更细疏、尖刺更小，II粗壮密集、大刺明显。两者透明空隙都露出底图。仍可见格缝与周期重复。
- 本地Foundry14.364/dnd5e5.3.3：各画9格，18Tiles/2Regions/12Walls，两种source分别为stage-i.webp/stage-ii.webp，视频纹理数0。中心单格I→II，正确换II图且Walls16；II→I正确回新I图且Walls12，没有回到旧绿色素材。
- 本轮未重复弱机模拟/300格/六角格/双客户端移动检查；先前记录保留其原范围，不升级为当前素材的专项验收。
- Scene sByCn4eHzaBTklrt（BP-BRAMBLES-MATCHED-20260907）结束时18Tiles/12Walls/3Regions，已精确核对后删除；恢复原active/view k0tDQjWqrbvHbjdu与paused=true。Node57988已停止，测试浏览器页关闭。无Actor/Token创建。
