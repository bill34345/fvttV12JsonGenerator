# B03 — Square 玩家移动、碰撞、火光与感知

只关闭 `SQ-010`、`SQ-011`、`SQ-012`。创建 `BP-ACCEPT-20260815-B03-<HHmmss>-Square` 和一个玩家拥有、步行速度至少 120 ft、单格 footprint 的测试 Token；场景中不得有未记录的移动墙或困难地形。

1. 建立同长度短路径：普通地面、fire Region、frost Region、stage-I bramble Region。每次从相同起点以同一 Foundry 移动方式由玩家实际拖动，保存 ruler/路径距离、token 前后坐标和 Region behavior；三种 Region 显示的测量成本必须是普通路径 ×2，且均在速度预算内。
2. 玩家跨越 stage-I bramble 必须成功；将同一原始 stroke 切到 stage II 后重复同路径，必须被成熟荆棘 Wall 阻挡，token 坐标不越墙。不要用 GM update 代替拖动。
3. 分别查看 fire stage I/II：玩家可见光照变化；GM 保存 light animation 为 torch 及关键字段。录制/截图必须显示用户可见结果。
4. 在成熟荆棘墙两侧布置 Token、火光和 AmbientSound。玩家验证视野与光线仍跨墙可见；音频先保存播放状态和位置变化，本批只判断“未被墙完全错误阻断”，主观空间音频留给 B08。GM 同时保存 Wall 的 move/sight/light/sound 字段。

若 stage-I 仍失败，先在普通地面重复同距离证明 fixture 是否健康；保存精确分歧后标 FAIL 或 BLOCKED并停，禁止改模块。证据前缀 `BP-E2E-B03-`。
