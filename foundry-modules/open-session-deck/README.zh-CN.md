# Open Session Deck / 开放式跑团副屏

Open Session Deck 是一个仅供 GM 使用的 Foundry VTT 队伍与遭遇工作台。它可以保留在 Foundry 主窗口内，也可以弹到第二块显示器。副屏由 GM 已登录的浏览器会话直接渲染，不加载第二个 Foundry 客户端、Canvas、登录页或模块 socket。

## 精确支持范围

- Foundry VTT `14.364`
- dnd5e `5.3.3`

其他版本和系统会 fail-closed。Daggerheart 计划在后续版本接入，v0.1 不声明支持。

## 功能

- 主 Foundry 面板与同会话浏览器副屏共享状态
- 自动发现玩家角色，并允许 GM 在世界范围固定或隐藏 Actor
- 使用 dnd5e 原生规则处理伤害、治疗、临时 HP、灵感、力竭和状态
- 显示当前遭遇、切换上一/下一回合，并在主画布定位 Token
- 简体中文与英文界面

v0.1 不提供玩家面板、掷骰/行动自动化、第二张地图、AI 功能或自定义网络协议。

## 开发验证

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

构建和安装 hash 只能证明机械结果；真实完成还需要在精确版本的 Foundry 中使用 GM 与玩家客户端验收。

模块采用 MIT License，不再分发 dnd5e 或 Daggerheart 的图片、Logo 或规则文本。
