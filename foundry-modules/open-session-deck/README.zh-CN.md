# Open Session Deck / 开放式跑团副屏

Open Session Deck 是一个仅供 GM 使用的 Foundry VTT 队伍与遭遇工作台。它可以保留在 Foundry 主窗口内，也可以弹到第二块显示器。副屏由 GM 已登录的浏览器会话直接渲染，不加载第二个 Foundry 客户端、Canvas、登录页或模块 socket。

## 精确支持范围

- Foundry VTT `14.364`
- dnd5e `5.3.3`

其他版本和系统会 fail-closed。Daggerheart 计划在后续版本接入，v0.1 不声明支持。

## 功能

- 主 Foundry 面板与同会话浏览器副屏共享状态
- 由一个世界级 Actor 文件夹定义队伍，可选择包含子文件夹；临时同行 NPC 只需移入队伍文件夹
- 直接查看和编辑当前/基础最大/最大修正/有效最大/临时 HP、AC 修正、激励、力竭、状态、专注与死亡豁免
- 独立批量工作区只处理 HP 与状态，并明确选择目标、全部添加或全部移除
- 队伍成员在遭遇区显示紧凑占位；NPC 使用完整操作卡
- 编辑和交换小数先攻，单独或批量为缺少先攻的 NPC 私密投掷，并由 GM 控制玩家可见性
- 玩家官方 Combat Tracker 在第一轮逐步揭示友方先攻；敌对单位默认隐藏
- 显示当前遭遇、切换上一/下一回合，并在主画布定位 Token
- 简体中文与英文界面

玩家先攻隐藏属于普通界面呈现，不宣称能对检查客户端文档数据的对抗性玩家保密。模块不提供独立玩家面板、行动自动化、第二张地图、AI 功能或自定义网络协议。

## 开发验证

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

构建和安装 hash 只能证明机械结果；真实完成还需要在精确版本的 Foundry 中使用 GM 与玩家客户端验收。

模块采用 MIT License，不再分发 dnd5e 或 Daggerheart 的图片、Logo 或规则文本。
