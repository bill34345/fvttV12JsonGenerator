# 荆棘连生预览验收记录

状态：方格连生小样已实现；限定机械与实机语义检查通过。用户对本轮小样的美术反馈尚待收取。完整高画质Fire/Frost尚未重制，不以本记录宣称整体完成。用户已确认的轻量版保留为独立ZIP。

## 目标与实现

用户希望藤蔓看起来沿地图自然连接，保留已认可的半写实手绘质感与透明空隙，减少逐格贴图感。实现采用原创枝条纹理、确定性的局部曲线路径、相邻格共享端口、粗细与末端收尖；I细疏、II更粗且尖刺明显。局部冗余连接可在保留绕行连接时省去，减轻规则网格感。远处不相关格不因局部擦除而重新随机生成。

新增 `bramble-network.ts`、`bramble-effect-renderer.ts`、`bramble-render-mode.ts`，在bootstrap与画笔面板接入。默认客户端setting为lite，connected为静态连生，animated在端点固定的前提下对枝条中段施加轻微摆动。主干和贴地阴影共2个Mesh；不增加逐格视频。使用Foundry PrimaryCanvasContainer，保持Token与视野遮挡关系。

切换画质不改Tile/Region/Wall内容；原生轻量Tile只在替代层成功准备后隐藏。加载、几何或GPU link检查失败时恢复原生显示；离开画布、切回lite也恢复。hidden、alpha=0、非0 elevation、其他场景层不纳入替代层。1000格为回退上限，不是性能保证。

## 机械验证

- `bun run test:battlefield-painter`：168 PASS、0 FAIL，7316 assertions、26 files。使用根目录安全包装器。
- 模组typecheck/build通过；最终文档构建后再核对安装文件和ZIP哈希。
- 新增拓扑测试覆盖方格/六角邻接、孔洞、连通性、局部稳定性、不同阶段与几何；renderer测试覆盖生命周期、客户端切换、可见性、层过滤、延迟加载与GPU失败回退。
- 新枝条为1024×128透明WebP，172454 bytes，SHA-256 `C8785F5E8CDFD52C8B67147F6EF9BAD1893C675778FCBDD5102F4A7FC49DAE7E`。轻量I/II素材未修改。

## 实机语义验收

环境：本地Foundry14.364 / dnd5e5.3.3、server-mirror / cor-cotn、loopback30001。Chrome GM与独立IAB SY玩家。测试只在本任务Scene `pnPLl677Jn8DR1gV` / `BP-CONNECTED-20260907-Square`，测试Token为非链接副本，没有修改Actor。

| 检查 | 结果与证据 |
| --- | --- |
| 轻量保留与切换 | PASS：切换前后Tile/Region/Wall序列化相同；lite恢复原图、0个连生Mesh、0个隐藏Tile |
| 单格、两格、L形、环形、3×3 | PASS：逐张查看实际截图；枝条跨格连续，环中空白保留，I与II粗细可辨 |
| 中心格切换 | PASS：只修改选中格的逻辑阶段与形态；未选中格保留。34格/33连接；墙60→64，撤销恢复 |
| 擦除中心格 | PASS：34→33格、33→31连接，空洞可见；远处环形截图像素相同；撤销恢复原34格和原3×3截图 |
| 清空 | PASS：34 Tiles、11 Regions、60 Walls清除，测试Token保留；连生Mesh与隐藏Tile归零 |
| 玩家与遮挡 | PASS：SY无绘制权限，可独立选择画质；Token在藤蔓上方。开启tokenVision后，未探索远处藤蔓区域全黑，无视野泄漏 |
| 隐藏与透明度 | PASS：hidden或alpha=0的单格不被替代层复活；恢复后再次纳入 |
| 高度与层 | PASS：elevation10保留原生；明确分配33格下层/1格上层时，GM上层显示1格、玩家下层显示33格。原生levels=[]为所有层，未误当下层 |
| 300格微动 | PASS：实际拖拽填充20×15，300 Tiles、1 Region、70 Walls；451连接、1421枝段、57386顶点、2 Mesh，无renderer错误 |
| 大面积撤销/重做 | PASS：撤销0 Tile/0 Wall/1 Token；重做300 Tile/70 Wall/1 Token，2 Mesh、300格恢复 |
| 真实微动 | PASS（幅度轻微）：7.45秒实机采样60帧，shader时间跨过一完整约6.98秒周期。手工查看4时刻截图，变化局限枝条，连接端点未断，地图稳定 |

短时CPU侧渲染提交计时：同场景空场与300格各约1.8秒、均54次提交；中位0.3→0.7ms，P95 0.6→1.1ms。该值不包括GPU实际完成时间，也不是显示器FPS、低配实机或长时负载结论。

## 人工判断与限制

本轮已经摆脱整张方形藤蔓图逐格覆盖，跨格连接、透明空洞和局部收口符合小样目标。仍能从大面积结构读出部分格网方向；节点交汇与枝条纹理变化可以继续丰富。微动刻意很轻，不是生长展开动画。不能宣称达到Tile Arsenal成品水准。

Hex真实运行、其他模组的复杂遮挡组合、非0高度连生、超过300格、弱GPU、长时运行、生产部署均NOT_EXECUTED。Hex几何仅有单元测试，不能当成实机通过。原有移动规则未改；此前轻量阶段阻挡/移动消耗证据仍在轻量版记录，不冒充本轮新增双客户端移动测试。

截图、视频和计时原始证据保存于本任务外部交付目录 `battlefield-painter-connected`：`square-connected.png`、`young-connected.png`、`single-connected.png`、`pair-connected.png`、`l-shape-connected.png`、`ring-connected.png`、`erase-before.png`、`erase-after.png`、`erase-undone.png`、`player-token-above.png`、`player-unseen-region.png`、`load-300.png`、`connected-motion.mp4`、`motion-frames/timing.json`、`render-samples.json`。完整路径由本次交付链接给出，不将本地地图截图打进发布包。

## 最终收尾

安装一致性、独立复核、打包哈希与本地测试现场恢复在下方补充。未获得commit、merge、push或生产写入授权。

- 最终预览ZIP：`fvtt-battlefield-painter-connected-preview.zip`，SHA-256 `01F71DDBA18AC30E92C62893ABF1A25C54737184C99F6CEB57BDCBACC8C08830`。
- 最终main.js：`08281CC051C78208846128F3DB84766A5D0FBCD620FB61BF136461BFA180E6AD`。真实实机运行与最终安装为该代码；收尾安装只更换README。18个安装文件与构建逐一哈希一致，前后清单不变，未创建备份。安装证据目录 `F:/FoundryLab/foundry-v14/evidence/server-mirror/bp-fix-20260908-brambles-connected-final`。
- 已确认轻量ZIP仍为 `D677899180C2BB09E00FFB0E2CF893D3F971241EA630D58B8CBFB6805432363F`，没有被预览包覆盖。
- 双方客户端恢复lite；原active/view场景 `k0tDQjWqrbvHbjdu`、paused=true恢复。核对ID与名称后删除本任务测试Scene（300 Tiles、1 Region、70 Walls、1测试Token），Scene不存在已读回确认。
- 本任务Lab Node PID11332已停止，PID不存在且30001无监听已确认。IAB视口已恢复，当前两张验收页已关闭；另有本任务较早失去调试连接的Chrome标签页651326677，关闭接口返回 `Debugger unattached`，未能自动关闭。未关闭用户其他标签页。
- 独立只读复核：PASS，未发现P1/P2或阻断验收缺口；复核涵盖最后GPU防护、客户端默认与世界文档边界、测试和实景证据、报告限制。请求角色为sol_reviewer；实际模型/档位未获宿主元数据证明（OBSERVED_METADATA_UNAVAILABLE），Full Access下只读为行为约束。
