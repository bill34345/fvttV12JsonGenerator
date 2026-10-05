# 原生冰霜集成：速度3定稿

状态：用户已确认两阶段美术及静态实机，最后明确指定反光速度3、不再要求确认；本轮已完成集成、机械检查及限定本地功能/视觉验收。稳定性能比较未得出结论，生产及长时验收未执行。没有commit/merge/push或生产部署授权。

## 对应已确认来源

- `frost-native-grains.png`：原Stage I-v2，SHA-256 934802B2DE9058DB8BF0639F4BA5C58FCFE43C203BD006BEA29EB976CC160DF5。
- `frost-native-ice.png`：已确认Stage II，SHA-256 9BF90A0246DCA2985B950CDDF09D1FB3CDE8559B2CEF4A3CDA879A1E0925F708。
- 均原字节1254×1254 RGBA。阶段I用冰面alpha0.20作底，再叠原霜粒alpha1；阶段II冰面alpha1。40%尺寸扩展，0/180度交错，与此前静态实机一致。
- 冷色原生Torch：color #9bdcff，speed3，intensity6，bright1/dim8，attenuation0.65、luminosity0.1、coloration100、walls=true；阶段I/II光源alpha0.06/0.18。速度3是用户最后定稿，其他参数保留。

## 实现边界

新地形使用 `frost-static-v2`，base/detail都属于模块所有Tile。只由base格位重建逻辑单元，detail不重复计入Region或Light；所有权清除和历史则包括全部层。阶段I两Tile/格、阶段II一Tile/格，均一Light/格与原始格子移动区域。阶段切换和失败恢复保持层配对及稳定排序。新地形无视频纹理，旧Frost世界文档不自动迁移。

## 机械检查

181测试通过、0失败，28文件8101断言；模块typecheck通过。包含批准图的完整SHA/尺寸/颜色类型、双层视觉与单一逻辑区域、速度3、稳定重建、非法layer/跨配置标记拒绝、跨笔画失败恢复，以及旧film marker兼容测试。运行结果将在直接验收后更新。

## 本地运行结果

精确环境：Foundry14.364/dnd5e5.3.3，server-mirror/cor-cotn，127.0.0.1:30001；GM Chrome与独立SY玩家IAB。23个安装文件全部SHA-256匹配，仅main.js、README与新增两PNG变化，没有备份。

| 门禁 | 结果与直接证据 |
| --- | --- |
| 方格正式绘制 | PASS：实际填充拖拽I九格生成18Tile/9Light，II九格生成9Tile/9Light，共27Tile/18Light/2Region；无video元素，旧Frost renderer格数与mesh为0 |
| 单格阶段与双层 | PASS：只切换8:4后27Tile降至26，目标只留alpha1的冰面base，其他格图片/alpha/rotation/sort逐格不变 |
| 历史与擦除 | PASS：撤销恢复中心base+detail，重做移除detail；擦除薄霜中心同时移除两层及一盏灯，27Tile/18Light变25/17，洞口截图已查看 |
| 玩家显示与拖拽 | PASS：27张原生纹理已加载；SY实际拖拽Token从140,490到210,490，运动记录method=dragging/state=completed，5ft距离/10ft消耗；Token在霜粒上方可见 |
| 移动与清除边界 | PASS：方格I/II均5ft消耗10ft、普通地面5ft；清除后同路径恢复5ft，并保留非模块Tile和测试Token |
| HexRows(type2) | PASS：九格18Tile/9Light，中心5:5变II后17Tile，擦除16Tile/8Light，撤销17/9；GM使用实际Token的原生地形路径测量为冰霜5ft→10ft、普通地面5ft→5ft |
| HexCols(type4) | PASS：同样18/9→17/9→16/8→撤销17/9；原生Token路径测量同样5ft→10ft与普通5ft→5ft |
| 300格操作 | PASS：I为600个模块Tile、300Light、1Region；整片切II后300Tile/300Light、无detail残留；撤销恢复600/300，重做及清除成功 |

两个六角格的截图已查看，仍属于矩形素材在Hex包围框上的兼容视觉。Hex移动消耗是GM端原生Token路径测量，未额外做独立玩家Hex拖拽；不把它写成已完成该项人机操作。

首轮玩家拖拽没有产生位置变化；检查后确认图层/所有权/暂停状态正常，在重新激活Token图层并按渲染帧完成拖拽后，最终运动记录确认成功。未把第一次无效操作算作通过，最终证据使用player-movement-final.json与player-token-final.png。

性能边界：空场景一次renderer.postrender采样仅21帧/约2.958s；300格的2.2s采样遇到CDP求值超时。随后轻量读回两个客户端均有601张已加载Tile（含保留样本），阶段切换、撤销重做和清除正常。此轮不足以作稳定FPS比较，不把采样超时推断为模块崩溃或已证明某个硬件瓶颈，也不引用旧Fire性能数字充当新Frost证明。弱GPU/稳定性能比较/长时运行保持未验收。

## 动态与产物

integrated-frost-speed3.mp4是正式模块绘制的两阶段实机6秒并排视频。原生screencast分别188帧/6.20431s、185帧/6.20468s，按原始时间戳编码30fps，仅裁切与加标签，无后期加减速或光效。连续样本图及I/II、洞口、Token与两种Hex截图均已查看。

最终main.js SHA-256：`2F871905E2F8C52F8F665528CF88580E3AB2CA433907D7C9B47E9B25A3905D0C`。

ZIP SHA-256：`CC001B1BF0BB8A86B86CD6159F2DDC165B00DDF8650780957C2DE3341E83745C`。候选包保留为 `fvtt-battlefield-painter-fire-frost-candidate.zip`，包含既有火焰、荆棘及本轮冰霜；之前轻量包与火焰候选包保持不变。

## 收尾

测试Scene：OKAlvKXVXBEaLrfH(Square)、YcQnwK3rX6dKMiMh(HexRows)、ykI1OrMYNchqpxOV(HexCols)，均按ID/名称/任务标记核对后删除，确认不存在。测试Token3个均为现有玩家Actor的非关联副本，没有修改Actor。原active/view k0tDQjWqrbvHbjdu和paused=true恢复，Chrome651327061与玩家IAB2关闭、临时视口重置；Node41996核对精确路径与loopback端口后停止，进程不存在且30001无监听。

捕获的模块错误日志只有既有Fire/Frost独立旧渲染层在Hex上停用的Square-only诊断，新原生路径本身已在Hex验证；不声称全环境零日志。root master仍clean，源码留在本任务独立worktree，未提交、合并、推送或生产部署。旧世界数据没有自动迁移。
