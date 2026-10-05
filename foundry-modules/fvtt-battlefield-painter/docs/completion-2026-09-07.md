# Battlefield Painter 实战可用性整改

最新2026-09-08：冰霜两阶段素材、20%薄冰叠层与静态实机均已确认，反光按用户指定速度3完成原生模块集成。限定功能/视觉验收及300格操作通过，稳定性能比较仍未得出结论，见[原生冰霜记录](frost-native-integration-2026-09-08.md)。后文Frost尚待重制等表述保留为此前批次状态。

2026-09-08最新：用户确认A/B/C-v2火焰、美术拼接、Torch速度10/幅度8，并授权集成。新原生火焰已完成限定本地集成验收，见[原生火焰记录](fire-native-integration-2026-09-08.md)。下文关于旧视频Fire被否决的结论仍是历史事实，不代表新原生候选失败；Frost重制仍未完成。

最新后续：用户已确认同一手绘风格的轻量荆棘I/II，独立包已保留。2026-09-08新增客户端可切换的荆棘连生/微动小样，限定方格实机与机械检查通过，美术反馈待收取。当前事实见[连生预览记录](brambles-connected-2026-09-08.md)与[荆棘轻量版记录](brambles-lite-2026-09-07.md)；下文被否决素材、测试数字及包hash按各自历史批次理解。

状态：用户看过实景截图后认可当前版本可以保留，作为轻量效果基线；同时要求参考 Tile Arsenal 的效果发展高画质方向。原Fire“最终美术PASS”的过度判断仍撤回，泛光形态、方正边缘和重复纹样是已知限制。功能修复与限定本地操作验收成立；荆棘画质切换已实现，低配实机性能和完整高画质效果尚未验收。仍为alpha，未发布；下文历史运行事实保留。

## 本次目标与边界

用户授权处理模块至可用。工作范围包括源码修复、必要的本地构建与短时 Foundry 14.364 / dnd5e 5.3.3 集成验收。正式提交、合并、推送及生产部署仍按项目发布授权执行。保留已认可的 B14 Frost 视觉和音频退役决定，不把取消的扩展 E2E 恢复成门槛。

完成要求：绘制与预览范围一致；局部修改范围可预测；撤销恢复和清除保护非模块文档；玩家显示和移动/障碍规则与地形一致；火焰连续、自然、棋子可读；大面积操作后界面与玩家移动仍可用。机械检查与真实 Canvas 结论分别记录。

## 基线

- 从 master `3d7c332a21880b7b786ccc1315aadb710317cf50` 建立独立 worktree，主树 clean。
- 旧 Battlefield Painter 工作树的模块目录与本次 master 对比无差异。
- 本地安装版本 `0.3.0-alpha.1`，dnd5e `5.3.3`；尚未证明已安装脚本等同当前源码。
- 本次开始时未发现本地 Foundry Node 进程或 30001 监听；随后准备启动短时基线检查。

## 已确认问题与修复

### BP-FIX-001：Hex Fire 错误使用只支持 Square 的隐藏效果层

`TerrainService.paintCells` 原来只对 Frost 检查 Square，Fire 在 Hex 也标记 `fire-field-v1`。`buildScenePlan` 会把这种 Tile 的 alpha 设为 0，而 Fire renderer 拒绝非 Square。这是明确的源码分流错误。

- 回归测试：P2 Hex Fire/Frost 绘制、阶段切换、擦除后的存留格使用可见兼容媒体，不携带 Square 专属标记。
- 修复前：Fire 测试失败，Frost 通过。
- 修复：Fire 标记同样要求 `isSquareGrid`。
- 修复后：聚焦 13 tests PASS；模块 141 tests PASS；typecheck PASS；build PASS。
- 语义范围：离线检查已核对存留 Tile alpha、媒体与标记；真实 Hex Canvas 仍 NOT_EXECUTED。未自动迁移已存在的错误标记文档。

## 待完成

1. 对齐本地安装文件、构建文件与真实加载版本；记录 hash。
2. 检查当前 Fire 实景，定位素材、布局、循环或渲染根因；完成 B13 最小布局与双端证据。
3. 根据实际操作验收处理阶段作用范围、预览一致性与恢复行为。
4. 补足与本次改动相关的玩家规则和大面积交互证据。
5. 汇总当前支持范围及未执行层级，完成必要机械门禁。

浏览器工具：本机 gstack browse 缺少 `server.ts` 无法启动，已改用现有 CUA 浏览器控制。该工具错误不属于模块问题。

## 本地运行新增发现

- 本任务启动 server-mirror PID 17016，实际 Node/app/dataPath/world/loopback30001 核对一致。GM Chrome 与独立 IAB 玩家 SY 已登录（SY isGM=false、canMutate=false）。原 active Scene `k0tDQjWqrbvHbjdu` 保持；新建本任务 Scene `uxUhrMnL61MyRRVF` / `BP-FIX-20260907-1440-Square`，只在新场景绘制。
- Fire cold-load 报 PIXI `_onPlayStart` / `_onCanPlay` 递归溢出。精确 14.364 自带 pixi.js 源码证明两函数在 invalid + playing 状态互相调用；Fire 改为禁止 DOM/PIXI 自动播放、canplay 初始化完成后单次启动。新增冷加载/重复ready/teardown测试。
- 实际 UI fill 得到9 Tiles/1 Region/1 Light，但 Fire diagnostics 为0 emitters/0 vertices。Fire 错用 i=x、j=y；精确 `common/grid/square.mjs` 明确 i=row/y、j=column/x。新增rows5..7、cols16..18样本修复前0 emitters、修复后36；修正生产逻辑及错误的旧 fake grid。
- 三修复后完整143 tests PASS、typecheck PASS、build PASS。
- 本地旧 Frost 为旧素材+2.10 shader；源码为已认可最终素材+1.0。只换JS方案经独立复核否决，改为配对更新四项 README、Frost两素材、main.js。受控脚本精确限制四项差异、拒绝链接、前后逐文件hash校验，不删除、不备份；最终15文件校验一致，清单未变。记录 `F:/FoundryLab/foundry-v14/evidence/server-mirror/bp-fix-20260907/install-before.json` 与 `install-after.json`。首次脚本差异集合断言因PowerShell属性比较写法失败，发生在写入前；修正为两个属性值比较后执行通过。
- 本地更新执行门禁独立复核 PASS；整体真实验收尚未完成。

## 首轮结束时的真实验收结论

| 项目 | 结果 | 实际证据 |
| --- | --- | --- |
| Fire cold-load 递归 | PASS（本轮双客户端） | 更新后 GM/玩家错误日志无新错误；视频 readyState=4、paused=false |
| Square 9格 Fire 几何恢复 | PASS（本轮双客户端） | 真正UI拖动画出9 Tiles/1 Region/1 Light；更新后9格/36 emitter/1 mesh，两端一致 |
| Hex Fire可见性 | NOT_EXECUTED（真实Canvas） | 仅离线绘制/阶段/擦除回归通过 |
| Frost配对加载 | PASS（局部） | 两端32格、I=12/II=20、1film/1mist、52 emitter、mediaLoaded=true、lastError=null；GM截图冰膜与Token可读。未重复用户取消的矩阵 |
| Fire最终视觉 | FAIL | 修复坐标后仍出现三行墙纸；随后增加同阶段union裁剪、连续UV、世界坐标确定性抖动与旋转。新候选两端9格/36 emitter/400顶点/200三角形/1 mesh，横排重复改善，但人工观察仍有明显拼贴轮廓，不能验收为成熟连续火焰 |
| 操作完整闭环、大面积性能 | NOT_EXECUTED | 本次只完成实际9格fill及上述基线检查，没有把旧证据升级为当前通过 |
| 生产、发布、长时实战 | NOT_EXECUTED | 无生产操作、无commit/merge/push |

当前机械证据：143 tests / 0 fail / 2344 assertions；模块typecheck、build、全Foundry模块typecheck与diff whitespace检查通过。第二次候选同步仅替换main.js，15文件逐一hash一致；证据位于 `F:/FoundryLab/foundry-v14/evidence/server-mirror/bp-fix-20260907-visual/`。独立复核仅放行本地更新，不能替代视觉判断。

结束处理：恢复active Scene `k0tDQjWqrbvHbjdu`，按精确ID与名字删除本任务新建Scene `uxUhrMnL61MyRRVF`及其测试嵌入文档；未修改原Frost场景文档。模块启用状态保持原true，两张测试浏览器页关闭，玩家临时视口覆盖清除。`foundry:lab stop server-mirror`返回stopped=true；本轮不通过重启拼接绕过30分钟运行限制。

下一步最小工作：解决当前Fire素材轮廓在铺地场景中的拼贴感，保留已修复的媒体就绪与坐标路径；再检查Stage II、L形/缺口/跨笔画、Token可读性及循环。随后闭合Hex实际可见性、操作范围和性能。当前局部阶段切换仍为原笔画bundle语义，尚未改成选中格语义。

## 第二轮（用户已授权累计超过30分钟）

本轮继续使用同一worktree。本地启动PID47828、loopback30001，版本/路径/世界不变。新Square场景 `qI0D0B04bQQO33xS`，原active Scene及paused=true作为结束恢复基线。

### 新增实现

- Fire采用SCREEN发光混合与亮度alpha，消除黑色剪纸边缘；阶段II按双倍lobe密度归一发光强度，避免大片纯白。仍使用原Style A/B视频，没有新建/重制素材。
- Fire时钟使用真实ticker.elapsedMS/deltaMS，修复PIXI7数字回调被误当ticker对象时按固定60fps计时导致的慢放/反复seek。
- 阶段切换现在只影响选中格；将一次动作所有受影响bundle预构建、统一替换，删除和创建失败均在恢复边界内。保留已有媒体标记、Region/Wall/所有权。
- 提交笔画时冻结格位/地形/阶段/Scene，防止排队期间后一笔覆盖前一笔；切Scene/丢失GM权限时阻止尚未执行的写入。
- history在失败mutation后恢复；undo/redo失败恢复原状态，内容发生外部漂移时拒绝覆盖；核心_stats不参与地形指纹。
- 重开同一Painter面板重新绑定状态订阅，避免后续绘制结束后撤销/状态控件不更新。

### 已取得真实证据（持续补充）

- UI单格阶段切换：原9格中只有6:17变为II，另外8格仍I；GM与SY玩家一致。
- UI擦除中心：8格、中心不存在；截图缺口保留地图，没有火焰填充。撤销恢复9格且中心仍II；重做又为8格，玩家同步；再次撤销成功。
- 通过真实浏览器Input指针事件绘制另一块StageII 3x3；总18格，112 emitter、1mesh，GM/玩家可重建。
- 创建本任务Token `OgliexKF0WeEe3Je`，使用已有玩家拥有的Actor产生非链接Token，不修改原Actor；普通玩家isOwner=true，真实拖动由(1190,700)到(1260,700)成功；截图证明Token位于火焰上方。
- 玩家Token按核心createTerrainMovementPath→measureMovementPath测量：火场distance=5/cost=10，普通地面distance=5/cost=5。直接measure未经地形处理的裸路径不构成地形规则验证，已纠正测量方法。
- 本任务foreign Tile `bd9N0R0lq7XsePQM`用于后续clear保护检查。
- 机械检查目前至少151 tests/2378 assertions通过；之后新增面板重开测试也通过，最终汇总另记。

## 最终验收（2026-09-07）

| 层级/项目 | 结果 | 最终证据与范围 |
| --- | --- | --- |
| 模块机械检查 | PASS | 152 tests、0 fail、2380 assertions；模块typecheck/build；全Foundry模块typecheck |
| Square预览→提交 | PASS | 按住未提交时已有文档仍9格；高亮明确为1120/1190/1260 × 630/700/770九个位置。松开后新增9:16至11:18的9格，已有9格保留 |
| Fire连续视觉 | FAIL（放大截图复查后撤回PASS） | 真实地图查看I/II、混合阶段、中心缺口、跨两个旧bundle擦出的L形、Token层级及平移缩放。去除了横排火墙和黑色拼贴边缘，地图与棋子仍可读，空格未被火焰填充 |
| Fire循环 | PASS（限定观察） | I连续约9.028秒/218解码帧/2次循环；II约9.008秒/216帧/2次循环。无暂停或media错误。边界平均像素差I=2.394、II=4.898，均不高于普通帧P95(I=3.397、II=6.111)。统计只是人工视觉检查的补充 |
| 单格阶段/擦除/撤销重做 | PASS | 九格仅中心切到II；擦除中心→8格；撤销→9格且原阶段恢复；重做→8格；跨bundle擦4格形成L形，再撤销恢复。双端读回一致 |
| Hex Rows/Columns兼容功能 | PASS | grid=2和4各绘制9格，玩家实际画面可见；alpha=0.88且无Square field marker。Rows单格切II得到alpha=0.94，擦除和撤销恢复成功。Hex不宣称连续视觉与Square同质 |
| 地形规则 | PASS | 普通玩家核心地形路径测量：Fire/Frost均distance5/cost10，普通地面distance5/cost5。玩家实际拖动穿过Fire成功。Columns单格成熟Brambles创建6面move=20墙，核心路径blocked=true，实际拖动停在(575,334)，未到请求目标(606.218,315) |
| 清除与规则恢复 | PASS | 先清除27个文档，后清除300格对应322个文档；两次均保留foreign Tile和Token。清除后owned=0、distance5/cost5。300格undo/redo后仍1mesh、2个共享视频 |
| 面板重开 | PASS | 关闭解除输入；重新打开同一面板后新绘制2格Frost，完成状态自动更新，撤销按钮可用 |
| 权限/音频 | PASS（所测路径） | SY isGM=false、canMutate=false、无Painter窗口或写API；各新测试Scene sounds=0。末次完整CDP请求窗口未截断，捕获Fire阶段I/II及Frost mist媒体，无本模块音频请求 |
| 错误恢复 | PASS（单元故障注入及代码语义复核） | 跨两bundle创建/删除失败、后一个计划验证失败、失败clear/redo、stale undo、排队笔画覆盖及切Scene取消均有回归；没有在持久Lab注入破坏性服务故障 |
| 生产/正式发布/长时实战 | NOT_EXECUTED | 未运行根CI发布闭环，alpha阶段开关未锁定；未commit/merge/push；未接触生产。无长时内存/soak结论 |

### 短时交互测量

相同Square场景每次从0个owned地形开始，通过真实浏览器指针完整fill。端到端耗时包含控制与状态等待，并非纯数据库耗时。玩家浏览器为1280×900，帧间隔采样为每档约3秒的requestAnimationFrame回调；这是浏览器调度/响应观察，不是GPU渲染耗时，也不是30秒性能门禁或长时实战。

| 格数 | 绘制端到端 | rAF中位/P95 | 采样帧数 | emitter/顶点/mesh |
| --- | --- | --- | --- | --- |
| 空场 | — | 7.5 / 7.6 ms | 403 | 0 / 0 / 0 |
| 25（II） | 1.795 s | 7.5 / 7.6 ms | 402 | 200 / 2444 / 1 |
| 100（II） | 1.999 s | 8.0 / 8.1 ms | 381 | 800 / 10824 / 1 |
| 300（II） | 1.916 s | 7.5 / 7.6 ms | 403 | 2400 / 33640 / 1 |

各档之后均实际操作阶段控件、平移/缩放、玩家移动和撤销。TokenDocument.move的完成返回早于本地文档同步，已通过后续读回核对落点，未单凭completed=true判定成功。300格最终requestedX=1190、读回x=1190/y=700；重做回300格时仍是1mesh/2视频，没有因该操作重复创建renderer媒体。

### 保留边界

- 六角格采用原Tile兼容视觉；没有改造成连续发光火场，矩形素材外观限制保留。
- 不自动迁移旧世界中已写入的错误效果标记；本次修复新绘制路径。
- 实测至300格；超过此规模、更多机器、长时内存与跨客户端同时写入未验证。optimistic历史保护不等于分布式锁。
- 最近日志只有Hex触发的Square专用Fire/Frost renderer禁用诊断，没有新增意外的模块异常。调试探针曾误用核心/系统API签名，均已纠正，未当作模块缺陷。

### 清理与复核

恢复原active Scene `k0tDQjWqrbvHbjdu` 和paused=true，Frost仍32格（I12/II20）、1film/1mist、52 emitter、mediaLoaded=true、lastError=null；模块启用状态保持原true。按精确ID/名称删除本任务3个Scene，共38 Tiles（含本任务foreign样本）、6 Regions、5 Lights、6 Walls、2 Tokens；无新Actor需要删除。两张测试浏览器页关闭，IAB临时视口已reset，PID47828的Lab已停止。

同一个sol_reviewer完成本地更新边界与新增事务代码的只读复核，先提出REVISE、修正后PASS；没有替代父代理的人工画面判断。模型/推理档位运行元数据不可用（OBSERVED_METADATA_UNAVAILABLE）；reviewer会话具有unrestricted filesystem权限，仅行为上保持只读，不声称硬隔离。详细安装前后15文件SHA-256清单位于本地evidence的bp-fix-20260907系列目录，没有创建备份。

最终browser entry SHA-256：`EF932B74930108EDE03D755376CEDA972EBB4378CFB327BF0E16802223E3ADEB`。

最终ZIP SHA-256：`ACDEEE14790F19CE868C6450A31DCAB88EDE7E971CA7F48902508BF865289BA0`。包位于模块 `dist/fvtt-battlefield-painter.zip`；最终只同步了README文案，已验收JS未再次变化，15个安装文件仍与构建对应。


## 用户要求图片后的视觉复查

已导出当前安装版本在真实Foundry中的四张3×3格截图，未经美化。Fire的横排火墙与黑边有所改善，但仍偏发光雾状覆盖，外边界过硬；此前将其评为最终视觉PASS过于乐观，现撤回。Frost仍是先前认可的素材与样式，不过放大可见格子接缝和纹样重复，不再笼统宣称画面没有问题。功能、坐标、权限、移动规则、历史保护和性能证据不因此作废。最小后续范围是Fire可辨认火舌/火芯及边缘表达，避免靠降低透明度掩盖拼接；Frost风格是否进一步改变由用户看图决定。

截图位于本任务私有visualizations/battlefield-painter-review目录，不提交世界画面到仓库。此次展示没有修改渲染代码或素材。
