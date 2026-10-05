# 已确认原生火焰的模块集成

状态：本轮原生火焰的机械检查、来源核对和限定本地集成验收PASS。用户已确认三张美术A/B/C-v2、静态拼接和Torch幅度8/alpha0.25/速度10；授权进入模块集成，并明确两个逻辑阶段暂时共用这套效果。本轮未获commit/merge/push或生产部署授权。此PASS不覆盖Frost重制、弱GPU或长时实战。

## 实现边界

- 新绘制Fire（P0/P2、方格及Hex）写入独立 `fire-static-v2` 标记。原生Tile使用三张批准PNG原字节，512×512、alpha1、白色Tint、格位确定的变体和90度旋转、宽高为格子包围框1.4倍；Token/移动几何不扩大。
- 每格一盏AmbientLight，walls=true，Torch speed10/intensity8，color #ff5018、alpha0.25、bright3、dim12、attenuation0.65、luminosity0.2、coloration100。参数来自本项目用户确认的小样，不宣称是Tile Arsenal内部参数。
- 图片选择、旋转和叠放顺序由格位决定，独立笔画、擦除重建、阶段拆分及撤销重做不重新随机打乱幸存格。
- 不创建新视频纹理或音源。旧 `fire-field-v1` 继续兼容；旧Fire视频按需加载，最后一个旧标记移除时释放。既有无标记场景不自动迁移。
- 两阶段共用确认的视觉和光照；移动消耗仍为2倍，Fire不创建Wall。冰霜和荆棘既有行为保留。

## 自动检查

173个测试通过、0失败（27文件、7967次断言）；模块typecheck通过。增加批准PNG的SHA-256/尺寸/颜色类型校验、实际计划参数、稳定重建、跨配置标记拒绝及旧视频按需加载/释放测试。最终build与本地安装身份在运行验收后记录。

## 本地实机

Foundry14.364/dnd5e5.3.3，server-mirror/cor-cotn，loopback30001。GM Chrome与独立SY玩家IAB；安装21个文件全部SHA-256匹配，只有main.js/README及三张新PNG发生变化（最后面板缩略图与文字同步另记）。

| 门禁 | 结果与直接证据 |
| --- | --- |
| Square正式画笔 | PASS：真实填充拖拽生成9个98×98 Tile、9盏正确参数光源、1 Region；三图均ImageBitmap且无video元素，旧Fire mesh为0 |
| 单格阶段 | PASS：只有中心8:4进入阶段II，其余8格不变；三图、旋转、sort与阶段前逐格相同 |
| 擦除/历史 | PASS：中心Tile与Light同时移除，洞口保留；撤销恢复9Tile/9Light及中心阶段II，重做恢复8/8 |
| 玩家显示与移动 | PASS：独立SY客户端9纹理可见且已加载，原生Token拖拽最终读回从140,490到210,490；Token在火焰上方可见；实际dnd5e地形移动路径5ft消耗10ft，普通地面5ft |
| 清除与边界 | PASS：清除9格及后来300格均移除模块文档，保留非模块Tile与测试Token；清除后同路径5ft消耗5ft |
| HexRows(type2) | PASS：正式画笔9Tile/9Light，单独5:5切阶段；擦除8/8、撤销9/9；截图查看仍为矩形素材兼容视觉 |
| HexCols(type4) | PASS：同样9/9、单格5:5切阶段、擦除8/8、撤销9/9；截图已查看 |
| 25/100/300格 | PASS（本机短时）：正式画笔分别生成25/100/300灯，无视频，300格撤销/重做成功；不代表弱显卡或长时接受 |

两种Hex本轮只重新验证绘制/阶段/擦除/撤销与可见效果，没有新增Hex玩家移动成本实测，既有Region生成几何不变；不把Square移动证据当成新的Hex移动证明。

性能：SY可见且聚焦的1600×1000视口，每段约2.2s，rAF中位6.5ms、p95约6.6–6.7ms（0/25/100/300）。0/25首组镜头与100/300不同，故另以同一全场镜头补测实际renderer.postrender：基线127帧/2.2005s，300格128帧/2.2021s，300个光源全部active。rAF不等于GPU耗时；单次ticker.FPS读值也不作为稳定帧率结论。

真实截图：square-integrated.png、square-hole.png、player-token.png、hex-rows-visual.png、hex-cols-visual.png；已逐张查看。动态图使用integrated-clean原生screencast，184帧/6.1895s，保留时间戳、未后期加速。最初integrated录制受面板位置干扰，不作为最终交付。阶段操作初次被面板遮挡、Hex首次被日历挡住、玩家初次处于暂停/登录弹窗，均在检查界面后消除阻挡并重做；未把这些无效操作当成已通过。

测试Scene bSToZx6q2Z8I5cRw/q1EQ4r4pAqmnptn1/U5V3rdMEENxzPu8p均按ID/名称/任务标记核对后删除，原active/view k0tDQjWqrbvHbjdu与paused=true恢复。没有修改Actor；测试Token使用现有玩家拥有Actor的非关联副本。Chrome651326961与玩家IAB1关闭，临时视口重置。Node16476核对精确路径与loopback端口后停止；没有备份或生产操作。

## 限制

最终面板/打包检查：缩略图改为批准A图、管理区文字改为“地形效果与照明”后，再运行173测试/0失败、typecheck/build。最后安装21文件全部匹配；最终main.js SHA-256为 `322AAF706790B126280A4E4EA490DB2432A61C5850D2B7B571773E373DE0F62D`，ZIP为 `7A82D35840DFB144DE1EC1FDE93C54BED3AE26D056C220B36AE15F233830E8CC`。

最终包再次实机启动：Scene oChWfUDetqOfFYSC / BP-FIRE-FINAL-20260908，正式填充生成300Tile/300Light/1Region，所有纹理有效、视频0、旧Fire mesh0；DOM确认面板加载 `fire-native-a.png`，全景和中央截图已查看，仍保留黄白火芯与橙色纹理。该窗口筛选到的模块错误日志为0。Scene已删除、原active/view/paused恢复，Chrome651326977关闭，Node38668停止。最终两处界面修改未改变此前验证的地形/光照实现。

可留存候选包：`fvtt-battlefield-painter-fire-native-candidate.zip`，与dist ZIP字节一致。原轻量候选包保持不变。根master仍clean，所有源码修改留在本任务既有独立worktree，未提交、合并或推送。

两阶段共用同一确认视觉；六角格没有独立六角裁边；不自动迁移旧世界火焰。更大面积、弱GPU、不同地图/照明环境、长时运行与跨客户端并发编辑未执行。保留既有轻量版文件；本轮仅提供可用集成候选，不代表正式发布。
