# 酸液轻微动效 — 2026-09-09

用户接受两阶段酸液外观后要求追加一点动效。本轮保留两张原始PNG、既有地形文档和玩法，仅增加原生Tile材质内部的缓慢流动与微弱反光；没有增加显示模式开关。动效由代理自审，尚无用户对本轮动态幅度的进一步反馈。

## 实现

`src/acid-motion.ts` 使用锁定Foundry14.364的 `PrimaryBaseSamplerShader` 扩展点 `_fragmentShader`，通过Tile mesh公开的 `setShaderClass` 应用。继承原生occlusion、depth和预渲染处理，没有patch原型。仅作用于有效acid/acid-static-v1文档；其他地形、Token以及第三方自定义材质保持原样。

- 周期10秒，阶段I/II的UV扰动幅度分别0.009/0.014；反光变化±2.5%。
- 位移只影响液体内部RGB，最终alpha始终来自未位移的原图，因此边缘和孔洞固定。
- 格位决定固定相位；阶段改变只更新强度，擦除和历史恢复不重排其他格。
- 使用Foundry原生渲染时钟，无额外ticker、视频、灯光或新增mesh。
- drawTile/refreshTile挂载，destroyTile与canvasTearDown释放；恢复时只替换本模块自己的材质。
- `api.auditAcidMotion()` 提供只读数量和诊断。GM与玩家均自动启用；不同客户端使用自己的渲染时钟，动画相位不作网络同步。
- 原PNG哈希、正常移动、无自动伤害及无Region/Wall/Light/Sound规则均保持不变。

精确源码依据：Foundry14.364的 `client/canvas/rendering/shaders/samplers/primary/occlusion.mjs`、`primary/primary-sprite-mesh.mjs`、`containers/elements/sprite-mesh.mjs` 和 `placeables/placeable-object.mjs`。当前实现不宣称使用Tile Arsenal的内部动画算法。

## 验证与自审

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 机械检查 | PASS | 183测试、0失败、3443断言；模块与全部Foundry模块typecheck、build、diff检查 |
| 正式方格画笔 | PASS | 18格原生Tile挂载18个AcidSamplerShader；原图加载正常，Token仍为PrimaryBaseSamplerShader且可见 |
| 连续动态 | PASS | GM原生screencast 326帧/11.187秒，覆盖一个完整10秒周期；按实际时间戳导出30fps视频，仅裁切，无加速或后加特效 |
| 视觉自审 | PASS | 连续样本中可见轻微液面起伏和反光，整体轮廓稳定；没有整层漂移或alpha呼吸。效果刻意克制，不表现喷溅或沸腾粒子 |
| 阶段/擦除/历史 | PASS | 中心I→II时phase保持2.675019、强度变0.014；18材质→擦除17→撤销18→重做17；孔洞成立 |
| 换场景 | PASS | 离开方格后空场景mountedTiles=0；没有增加额外ticker |
| Hex Rows/Cols | PASS | 两种格型各九格成熟酸池，九纹理和九材质正常；截图自审通过矩形兼容显示，不宣称六角无缝 |
| 独立玩家 | PASS | SY非GM、canMutate=false，17纹理和17动态材质；渲染时间uniform实际更新，最终画面含孔洞与正常Token层次。连续视频来自GM端 |
| 清除与所有权 | PASS | GM/玩家清除后mountedTiles=0，非模块Tile和Token保留，非模块Tile仍为原生材质 |
| 日志 | PASS（酸液路径） | 无酸液/着色器错误；保留两次Hex切换触发的4条旧Fire/Frost Square-only诊断 |
| 环境时长控制 | FAIL | 进程6460实际驻留约53.7分钟，超过项目30分钟上限；已停止并记录执行失误，不作为长时稳定性接受 |
| 收尾 | PASS | 三个本次owner临时Scene已清理；原view/active k0tDQjWqrbvHbjdu、paused=true恢复；6460不存在、30001监听为0 |
| 压力/弱GPU/长时稳定性 | NOT_EXECUTED | 未做受控压力或稳定性测量；环境驻留不能代替这些证据 |

玩家首帧是在关闭初始用户窗口后立即捕获，可能包含过渡画面，未用这对PNG的像素差值宣称动效幅度或性能。采用玩家材质/时间读回及无遮挡最终帧，GM完整录制用于动态自审。

文档收尾后的首次Bun构建持续占用CPU且未产出入口；核对进程归属后终止该构建，新进程重试约0.8秒成功。未改动源码来掩盖异常，也未确定该次Bun进程异常的根因。最终27个安装文件与成功重建逐项匹配，main.js与实机代码一致。

## 限制与交付

这是每Tile单独绘制的原生材质扩展（classPluginName=null），不再走原生Tile批处理；没有新的300格或弱GPU性能结论。贴图按格重复、Hex矩形边缘和客户端相位差仍存在。没有修改原三组默认美术，没有发布或生产部署。

证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/acid-motion`。优先查看 `acid-motion.mp4`、`motion-sequence.png`、`stage.json`、`clear.json`、`player-t1.json`、`logs.json`、`stopped.json`、`final-verification.json`。
