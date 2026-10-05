# Acid 单效果交付 — 2026-09-09

本页记录静态版本的首次交付。用户接受后追加的默认轻微液面动效见[后续动效记录](acid-motion-2026-09-09.md)；以下静态批次证据保留原范围。

## 参考核对与选择

本次由用户授权在既有 dirty worktree `20260907-142913-battlefield-painter-finish` 接续；保留原三组默认美术与既有未提交成果。采用 battlefield-effect-workflow，自行制作、审核和验收。未提交、合并、推送或生产部署。

2026-09-09 用 AnySearch 重新读取[官方商店](https://www.foundryvtt.store/products/tile-arsenal)，再用浏览器查看[36项公开目录](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-3.webp)与[阶段对照](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-5.webp)。本次没有获取或导入付费素材、代码或内部配置。

公开目录可辨认的配置如下；此表是公开图中的目录，并非已安装产品清单：

| 行 | 配置 |
| --- | --- |
| 1 | Acid、Blood、Debris (Stone)、Debris (Wood)、Earthquake、Fire、Flooding、Force Barrier、Frost |
| 2 | Grease、Haze、Haze (Deadly)、Hole、Holy Light、Lava、Lightning Field、Magic Circle、Magic Light |
| 3 | Magic Platform、Mold、Moss、Overgrowth、Pillar、Portal、Rift、Rune 1、Rune 2 |
| 4 | Rune 3、Rune 4、Runes、Sand、Smoke、Spiderweb、Spikes、Unholy Light、Wild Magic |

现有模块仅有 Fire、Frost、Brambles 三种主题配置；Brambles 对应 Overgrowth 主题，当前两阶段不等于完整复制其三阶段。Acid 此前没有实现。选择它的依据是官方文字明确提到酸液由 puddle 变为 pool，目录标示两阶段，阶段图能看到零散绿色液体与连续池面；可复用当前两阶段契约而无需新渲染框架。Flooding、Force Barrier、Magic Platform、Lava 等本次均未开发。

官方当前商店标示 minimum 14.365；本项目是独立实现，继续锁定自身 Foundry 14.364 / dnd5e 5.3.3，没有安装官方模块或升级环境。

## 效果规格与证据边界

| 项目 | 本次决定 |
| --- | --- |
| 阶段 I | 酸洼：零散液体，保留较多地面信息 |
| 阶段 II | 酸池：连续、较厚的黄绿/橄榄绿黏液池面 |
| 原生文档 | 每逻辑格一张 Tile，alpha 1、白色 Tint、15%视觉尺寸外扩，稳定0/180度旋转与格位排序 |
| 标记 | acid-static-v1；仅在 acid 配置上有效，不能带 Frost detail 层 |
| 移动/阻挡 | 本项目选择正常移动，不生成 Region 或 Wall；未将其描述为官方原规则 |
| 伤害/照明/声音 | GM自行裁定伤害；不自动扣血，不生成 Light/Sound |
| 动态 | 本轮选择静态液面，不新增视频或自定义渲染器；没有动画效果验收声明 |
| 未知 | 官方自动伤害、移动参数、灯光参数、动画算法及素材内部制作方式未确认 |

## 美术与自审

使用内置 imagegen 原创生成，未手工修补最终PNG。第一阶段原图1254×1254 RGBA，alpha coverage约42.34%；第二阶段最终原图同尺寸RGBA，coverage约81.44%。完整提示词、文件哈希与拒绝候选见 asset-provenance.md 末尾。

第二阶段第一次编辑返回RGB并画入棋盘，inspect_asset.py明确拒绝。改为全新透明生成后通过真实alpha检查；失败候选未打包。机械通过后查看原图，并在同一真实沙地地图用正式画笔检查两阶段、单格、九格连片、局部变阶段、L形、相邻独立笔画与擦孔。

自审结论：绿色湿润流纹与气泡能读作酸液；I/II覆盖差异清楚；Token位于材质上方；没有假棋盘、黑底或中心洞被覆盖。保留明显格位重复及矩形兼容边缘的限制，不声称无缝或拓扑拼接。素材颜色较鲜明，在当前明亮沙地图上可辨认；未做额外暗图/弱GPU比较。

四种地形的面板改为2×2紧凑卡片，并解除Foundry原生按钮固定高度造成的名称/说明裁切；卡片包含完整说明tooltip。既有三组素材和模式决定保持不变。

## 验证

| 门禁 | 结果 | 直接证据 |
| --- | --- | --- |
| 素材机械检查 | PASS | asset-i.json、asset-ii.json；RGBA、真实alpha、尺寸与SHA-256；RGB候选曾被拒绝 |
| 模块检查 | PASS | 179测试、0失败、3425断言；模块typecheck、所有Foundry模块typecheck、build与确定性ZIP检查、diff检查 |
| 运行身份 | PASS | Foundry14.364/dnd5e5.3.3，server-mirror/cor-cotn，loopback30001；27文件构建/安装哈希核对 |
| 正式画笔方格 | PASS | 通过面板和浏览器鼠标输入绘制9格I+9格II；18纹理加载；实际115×115px/100px逻辑格 |
| 形态与阶段 | PASS | 增加单格与L形共22格；仅3:3变II，原其余17格src/rotation/sort/stage不变；square-stages.png、square-final.png |
| 擦除与历史 | PASS | 3:8擦除变21格且洞口露地；撤销22格并恢复II纹理，重做21格；square-hole/undo/redo.json |
| 正常移动 | PASS | 真实Token原生测量：酸洼、酸池、普通地面均5ft距离/5ft消耗，无Region/Wall/Light；square-movement.json |
| 独立玩家 | PASS | Chrome SY非GM，canMutate=false，21纹理加载；真实鼠标拖拽(800,200)→(900,200)，dragging/completed，5ft/5ft、HP8→8；player-movement.json、player-final.png |
| Hex Rows / Cols | PASS | 两者正式绘制9格I、中心4:4转II、擦除8格、撤销9格/中心II；全部纹理加载；原生Token路径均5ft/5ft；两组hex JSON与PNG |
| 清除保护/同步 | PASS | 正式清除21个模块Tile，模块文档归零，非模块Tile和2个测试Token保留；GM与SY一致；clear-protection.json、player-clear.json |
| 收尾 | PASS | 三个owner标记临时Scene清理；双方恢复原active/view k0tDQjWqrbvHbjdu、paused=true；本次Node47036停止，30001释放 |
| 生产/长时/弱GPU | NOT_EXECUTED | 未授权生产写入；未进行压力、弱GPU、长时稳定性测试 |

两种Hex仍使用矩形纹理包围框：Rows 115×133px，Cols 133×115px。没有专用六角边缘素材，也没有独立玩家Hex拖拽结论。每个Hex样本为8格I+1格II，未做大块成熟酸池的Hex专项无缝验收。

日志保留4条旧Fire/Frost独立层的Square-only错误（两次进入Hex）。酸液路径未发现错误；不将此结果描述为全环境零错误。Chrome第一次后台截图超时，激活测试页后重拍；玩家初始设置窗口关闭后才进行拖拽，没有把遮挡截图或路径测量冒充真实拖拽。

本次运行约14分钟，进程11:48启动、12:02停止，没有拼接长时验收。

## 文件与证据

外部证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/acid`。原场景内容和世界Actor均未直接改写；4个Token是临时Scene内的非关联副本。active/view/暂停状态已恢复，没有创建备份。

本轮修改集中于 catalog、scene-plan、terrain-service、所有权校验、面板、打包列表、相关测试和本文档；所有变更留在指定worktree，最终哈希见该目录 final-verification.json。当前交接见 CONTINUATION.md。
