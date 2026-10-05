# 已确认的三组默认美术

用户已确认火焰、冰霜、荆棘三组美术，并授权直接作为默认处理、取消低性能模式。本次沿用同一任务的独立worktree；未获commit/merge/push或生产部署授权。

## 当前实现

- 火焰继续使用批准A/B/C三图及Torch速度10、幅度8、alpha0.25。
- 冰霜继续使用批准霜粒与冰面：I为20%冰面底层叠霜粒，II为冰面；反光速度3不变。
- 荆棘采用2026-09-09批准的两张1254×1254原始RGBA PNG，alpha1、白色Tint、35%视觉扩展、稳定格位旋转。新文档标记为brambles-static-v2；I移动消耗2倍，II增加只阻挡移动的边界Wall。
- 面板和Foundry设置不再提供轻量、连生预览或连生微动。连生渲染实现已退出运行入口，原生Tile不会因旧客户端选项而被隐藏。
- 旧无标记地形及旧Fire/Frost效果保留既有来源和读取兼容，不自动重写世界数据。

## 机械检查

PASS：模块173测试、0失败、3330次断言（27个测试文件）；模块及全部Foundry模块类型检查通过，构建与ZIP确定性检查通过，git diff --check通过。两张荆棘PNG的完整SHA-256、1254×1254和RGBA类型均与已确认来源一致，既有火焰及冰霜素材哈希测试继续通过。

覆盖了默认三种美术不受内部P2开关影响、稳定旋转/排序、阶段切换、中心擦除的区域/墙体孔洞、所有权标记拒绝、旧设置不再读取，以及构建包中没有brambleRenderMode和BrambleEffectRenderer入口。删除的是本任务之前创建、尚未提交的连生预览源码及对应测试，未删除既有世界文档或用户文件。

## 本地Foundry运行

精确环境为Foundry14.364/dnd5e5.3.3，server-mirror/cor-cotn，127.0.0.1:30001。GM在IAB，独立SY玩家在Chrome。安装25文件全部哈希匹配；变化只有main.js、README、模板与两张新增PNG，没有备份。

| 门禁 | 结果与证据 |
| --- | --- |
| 三组默认素材 | PASS：正式画笔生成54个模块Tile，7种批准PNG全部加载；27盏灯、6个Region、16段墙，video为0。加入清除保护样本后，GM和玩家均55张已加载Tile |
| 火焰/冰霜参数 | PASS：9盏火光均Torch10/8/alpha0.25；薄霜与厚冰各9盏反光均Torch3/6，alpha0.06/0.18。薄霜base0.2/detail1，厚冰alpha1 |
| 荆棘默认显示 | PASS：两阶段18张原生Tile全部加载，alpha1、白色Tint。计划尺寸94.5px被Foundry整数化为95px，逻辑格仍为70px；无自定义荆棘mesh、无客户端显示选项 |
| 方格阶段/擦除/历史 | PASS：仅4:3从I转II，其他17格图片、alpha、旋转、sort和阶段不变。中心4:9擦除后17Tile/20Wall，洞口截图已查看；撤销18/16，重做17/20，再撤销恢复 |
| 地形与阻挡 | PASS：真实Token的原生地形路径中，Fire、Frost I/II、Brambles I的5ft距离均消耗10ft，普通地面5ft；成熟荆棘穿越路径被原生墙体约束截断 |
| 玩家默认效果 | PASS：SY非GM、canMutate=false，55张Tile已加载，7种素材显示正常、无视频、旧显示选项未注册，拥有的测试Token可见。未把此项写作实际玩家拖拽验收 |
| HexRows/HexCols | PASS：两种六角格均由正式画笔绘制9张I，中心5:5转II后6段墙；擦除8张/0墙，撤销9张/6墙。9纹理均加载，原生路径5ft消耗10ft，II边界阻挡为true |
| 清除保护 | PASS：清除103个模块文档后模块所有文档为0，非模块Tile与测试Token保留；同一路径恢复5ft消耗5ft |

六角格仍是矩形贴图在原生格子包围框内的兼容显示，不宣称无缝六角裁边。单格95px与轻微外扩属于美术显示，不放大移动Region或墙体范围。

GM筛选到4条既有Fire/Frost旧独立效果层的Square-only诊断，发生于两次Hex视图；新原生荆棘路径没有报错。不把这些历史兼容层诊断描述成全环境零错误。此次没有执行新的300格性能比较、弱GPU、实际玩家拖拽、跨客户端并发写入或长时稳定性验收。

## 视觉证据与收尾

直接截图已逐张查看：all-default-effects.png、brambles-hole.png、player-defaults.png、hex-rows.png、hex-cols.png。背景位于Foundry v14的Level；初始测试夹具误写旧Scene.background导致灰底，查阅锁定14.364源码后修正测试Level，最终截图均为正确背景。IAB普通截图接口出现缩放/黑边，改用同一浏览器的原生Page.captureScreenshot取得1280×720画面；Chrome最初截图滞后，激活该测试页后重拍，未采用遮挡画面。

实机JSON和PNG位于本任务外部default-art-integration-v1目录；安装前后清单和哈希位于F:/FoundryLab/foundry-v14/evidence/server-mirror/bp-default-art-integration-20260909。

三个测试Scene：eNCWcETIQHXDAs2j、e7os0FUOIi3jd3jT、8jbEIYD2UHord3ad，均按ID、名称、任务owner标记及非active状态核对后删除。测试Token三个均来自既有Actor的非关联Token，没有修改Actor。两客户端均恢复原view/active k0tDQjWqrbvHbjdu及paused=true；测试浏览器页关闭。仅停止本次拥有的Node46260，最终进程不存在、30001监听数为0。

main.js SHA-256：3F31B3E0AE7A4AAF67AACAA618DF710A21CB62CC426789219FD888DD134F74AC。最终ZIP SHA-256：30F33D368EFFBFF27D76E51AE6153748480307C1CCBE10C955E5EB595CEA9AFB。实机结束后的README文字收尾只更新README，运行代码未变，最终25个安装文件再次全部匹配。

源码仍留在本任务独立worktree，master保持原基线；未commit、merge、push或部署生产。历史素材继续保留以读取旧世界，新的默认路径只使用已确认的三组美术。
