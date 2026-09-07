# B13-art-style-square：连续火焰场真实 Canvas 验收

状态：**历史动画样片视觉复查失败已记录；当前 Style A/B runtime 候选已接入，但尚未通过 Foundry 视觉验收。本文件不是 Foundry 运行证据。**

## 目的

确认独立连续火焰场在 Foundry 方格场景中具备成熟的俯视铺地燃烧观感。Frost 已迁移到独立 B14，不与本批混合判定。

## 固定实现前提

- `assets/terrain/fire.webp`（P2 仅作隐藏逻辑/兼容纹理）、`fire-stage-i.webm`（右侧 Style B，Stage I）和 `fire-stage-ii.webm`（左侧 Style A，Stage II）；`fire.webm` 仅作为旧场景/构建 spike 资产保留，新 P2 火焰不请求它
- 火焰两个逻辑阶段共享同一个世界空间火场时钟和一个 mesh；Stage I 使用右侧 Style B 的稀疏 emitter，Stage II 使用左侧 Style A 的加密 emitter。`visualEffect: "fire-field-v1"` 只写入 P2 火焰 Tile。两个视频都是黑底样片，由 shader 做黑色抠透明，不能把 `fire.webp` 当作动画源。
- 只有 Foundry 公开网格信息明确表明当前网格为 Square 时传入 `visualBleed: 0.08`；Hex 或未知类型传入 0。
- 本批只覆盖方格视觉效果，不新增六角格专用素材。

## 执行步骤

1. 使用新的时间前缀创建 Square Scene；核对 GM=`Gamemaster [GM]`、玩家为非 GM，并记录 Foundry `14.364` / dnd5e `5.3.3`、`server-mirror`、`cor-cotn`。
2. GM 打开 Painter，选择火焰并确认 Stage I/II 控件仍存在。
3. P0 静态模式分别绘制每种地形的单格、连续横向多格、连续纵向多格和 3×3；保存 GM 文档/API 抽样、玩家截图和两端 console/network。
4. P2 动态模式重复最小样本：火焰确认 Tile 使用隐藏的 `fire.webp`、带 `fire-field-v1`、不请求 `fire.webm`，实际请求并播放 `fire-stage-i.webm` / `fire-stage-ii.webm`，并检查 `auditEffects()` 的一个 mesh、两个共享视频纹理、实际格位、emitter 数量和 ticker；确认没有新 AmbientSound、OGG 或模块音频请求。
5. 人工查看单格及 2/3 格、3×3、L 形和中心缺口：实际火焰没有明显白缝、圆形留白、“每格一个孤岛”或空格泄漏，并保持成熟的俯视铺地燃烧风格。
6. 切换阶段：火焰共享世界坐标和火场时钟；Stage I 的右侧 Style B 稀疏，Stage II 的左侧 Style A 加密且铺地更满，邻接处不得变成按 Tile 重复的墙纸；火焰光源参数仍按阶段变化，Region、`cellKey`、`offset` 和所有权 flags 不扩大。
7. 玩家端确认能看到相同 Tile 和动画，且没有 Painter 控件、写权限或额外声音请求。

## 通过标准与停止条件

通过必须同时满足自动测试、构建产物检查、GM/玩家双端事实和人工视觉判断。若素材重新出现高锐度噪点、儿童化、孤立圆形、绿色/黑色抠像边缘，或 8% 溢出覆盖邻近非同类地形、地图边界或逻辑判定，立即冻结证据并停止，不顺手增加第四张图、修改六角格、修预览/音频或重跑其他批次。

本批不重跑 B11、B12、SQ-011；它们的坐标校准、证据缺口、stale fingerprint 和旧证据结论保持独立。

## 动画样片失败记录（2026-08-18）

- **结论：失败，不得进入正式素材或 B13 通过证据。** 现有单张火焰图不是主要问题；问题出在把每格逻辑 Tile 直接当成每格视觉 Tile。
- **表现：** 1×3、3×3 和 L 形样片会重复同一张 512×512 图，像墙纸；动画只是整块内容平移，外圈静止、内圈移动，不能形成连续火舌或同一片火焰的运动。
- **根因：** 边缘平均和 8% 溢出只能消除硬缝，不能消除逐格重复，也不能让独立视频实例共享空间和时间坐标。
- **冻结范围：** `band32`/`band64` 候选不覆盖正式 `assets/terrain/fire.webp` / `fire.webm`；不继续调边缘参数或重新生图。
- **下一步边界：** 先验证相邻同类格共享一个连续视觉层（统一世界坐标、动画时间和形状 alpha mask）；Region、Wall、cellKey 和所有权仍保持逐格逻辑。未通过新的人工视觉检查前，不执行 B13 Foundry 验收。

## 当前 runtime 候选（尚未通过视觉门禁）

- `src/fire-effect-renderer.ts` 已改为单 mesh 世界坐标 emitter 场：Stage I 每格 4 个基础 emitter，Stage II 每格 8 个 emitter，按实际占用格裁剪，不使用旧 fBM 作为火焰主体。
- `fire-stage-i.webm` 是右侧 Style B；`fire-stage-ii.webm` 是左侧 Style A。每个视频包含四个变体象限，所有 emitter 共享对应阶段视频，不按 Tile、bundle 或绘制批次创建独立视频。
- 当前已完成单元测试、构建和 browser bundle 机械检查；这不等于火焰视觉通过。必须在本地 Foundry 中检查“厚实、铺满、连续、不像透明蒙层/墙纸”，失败则 B13 仍保持失败。
