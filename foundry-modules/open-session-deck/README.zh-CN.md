# Open Session Deck / 开放式跑团副屏

Open Session Deck 是一个仅供 GM 使用的 Foundry VTT 队伍与遭遇操作台。它可以保留在 Foundry 主窗口内，也可以弹到第二块显示器。副屏由 GM 已登录的浏览器会话直接渲染，不加载第二个 Foundry 客户端、Canvas、登录页或模块 socket。

## 精确支持范围

- Foundry VTT `14.364` / dnd5e `5.3.3`（已完成运行时验收）
- Foundry VTT `14.368` / dnd5e `5.3.3`（既有Mirror兼容候选，实际接受见专项记录）
- Foundry VTT `14.368` / dnd5e `6.0.2`（历史静态迁移候选，尚待世界内验收）
- Foundry VTT `14.368` / dnd5e `6.0.5`（原生力竭面板切片已验，其余命令和完整GM／玩家矩阵未验）
- Foundry VTT `14.368` / dnd5e `6.0.6`（GM-only限定链已接受：TempHP自然busy/disabled、stale目标消失、玩家入口拒绝；其余GM命令、通用stale分支和完整矩阵仍未覆盖）

其他版本、交叉组合和系统会 fail-closed。Daggerheart 计划在后续版本接入，本版不声明支持。

6.0.5 与 6.0.6 的适配路径从 dnd5e 的 `dnd5eexhaustion0` Active Effect（由 `staticID` 补齐为 16 字符的 ID）读取力竭等级，并通过原生 `toggleStatusEffect` API 调整。2026-10-01 同一自有 Actor 的6.0.5面板与原生读回通过3→4→3、普通GM重载及精确清理；6.0.6进一步接受GM TempHP自然busy/disabled、stale目标消失，以及玩家入口和权限拒绝。状态编辑仅向GM开放，玩家入口拒绝已验；通用stale分支、其余GM命令和完整矩阵仍未覆盖。角色验收环境的额外消息已准确删除并确认原生缺席，作者和唯一whisper均为本轮TempPlayer，别名Dice So Nice!，Atlas归因假设已否证并符合已实装DSN6.3.1欢迎源；native terminal 的 Task 宏、原92宏行 hash、原7 User `_id` 读回、safeMLD/尺寸/viewport/UI、Core 与 Inspector 限定恢复均已闭合，但不等于旧A或完整User/所有Setting恢复。其余命令和完整GM／玩家矩阵未由本轮接受，见[限定恢复记录](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md)。

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

## 查阅帮助

Deck面板或同会话副屏工具栏的“帮助”优先定位已启用统一手册中的Deck条目；合集未安装、停用或帮助接口不可用时，打开Deck自己的只读帮助窗口。Deck可独立使用，不需要启用合集。帮助只阅读说明，不保存偏好或执行游戏操作。

本模块与统一手册都从`docs/manual.json`取得这一条说明；中央手册目录只保留来源指针。当前0.2.0增加可选`api.openHelp()`，仍逐次检查GM。H3帮助与状态的精确接受见[执行总账](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)，不扩大其他业务命令的旧接受范围。

2026-10-12在14.368/6.0.5进一步限定接受面板/同会话副屏的实际版本配对，以及真实工具栏点击在受控设置拒绝后显示原生错误通知。通知可见性来自三个实时DOM/样式/位置样本，晚读失败及未拍到通知的截图保留原边界。此次没有禁用输入，原因提示的真实UI未执行；D3的新目标HP/力竭代表链及玩家面仍待验。

## 开发验证

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

构建和安装 hash 只能证明机械结果；真实完成还需要在精确版本的 Foundry 中使用 GM 与玩家客户端验收。

模块采用 MIT License，不再分发 dnd5e 或 Daggerheart 的图片、Logo 或规则文本。
