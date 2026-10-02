# WMP Vex：上游实现对照与具体修正

2026-09-29；目标 Foundry 14.364 / dnd5e 5.3.3。主控亲自读取源码；本次用于修复正在验收的 WMP，不重启整体架构审计。全部精通继续由自有 WMP/自有状态与触发模块实现，不安装外部精通模块代替交付。

## 已读取的来源与适用边界

| 来源 | 固定版本与许可 | 采用的经验 |
| --- | --- | --- |
| [Automated Conditions 5e](https://github.com/thatlonelybugbear/automated-conditions-5e/tree/bd0b6005415d2ac5c67fbb179932ffe0730fe513) | v14.533.8，bd0b6005415d2ac5c67fbb179932ffe0730fe513，MIT；恰好是 Lab 已安装版本 | 在公开攻击流程接收输入，先汇总优势/劣势，再形成对话框默认模式；保留系统攻击窗口。 |
| [w15p's Compendia](https://github.com/w15p/w15ps-compendia/blob/b9069d028529f169087805bcdb02d4c9f6ddfc9f/scripts/features/weaponMastery.js) | b9069d028529f169087805bcdb02d4c9f6ddfc9f，MIT；版本12.4.11，Foundry12/dnd5e4.1/Midi12 | Vex 是命中之后给攻击者的临时效果，匹配特定目标并有消费/回合到期条件。借鉴生命周期分层，不照搬旧 API 或依赖 DAE/Midi 执行自有功能。 |
| [Weapon Masteries 5e](https://github.com/thatlonelybugbear/wm5e/tree/a261c2e62006a478a36fb01ea6a13dfc263e81a7) | v14.533.6，a261c2e62006a478a36fb01ea6a13dfc263e81a7；dnd5e5.3.3；**公开仓库但 Early Access 许可不允许复制改写发布** | 只作行为架构对照。目标上的效果记录来源，以公开攻击/伤害 hook 驱动；不借其代码。未使用面向 dnd5e6 的最新分支作为当前版本依据。 |

低热度但直接相关的实现优先于通用热门框架；搜索时 wm5e 为2 stars/3 forks，w15p为1 star，仅作检索当日信号，不代表质量。AC5e 的选择依据是精确运行版本与同一攻击链。AnySearch 本地脚本与发布校验不一致，未执行；使用公开搜索与 Git 读取固定源码。参考 checkout 留在外部验收 evidence 目录，不复制进业务源码，不执行外部代码。

## 从源码得到的确切问题

1. **错误的窗口类型。** 锁定 dnd5e.mjs:28496 的 AttackActivity 使用 `AttackRollConfigurationDialog`，含攻击模式/弹药/精通控件。WMP 在 `rollPrepared` 提前传入通用 `D20Roll.DefaultConfigurationDialog`，覆盖系统默认。改为优先尊重传入窗口，其次公开攻击专用窗口，再兼容回退；不重造攻击 UI。
2. **优势输入太晚。** AC5e `scripts/ac5e-config-logic.mjs:443` 捕获输入优势/劣势，:565 起导入已有模式；`scripts/ac5e-runtimeLogic.mjs:497` 据此选择 `defaultButton`，渲染还会读取它。WMP 原来只在自己的 `preRollAttack` listener 加优势；若 AC5e 已先捕获，窗口默认仍可能为普通。现在在调用公开 `Activity.rollAttack` **之前**提供预约得到的优势/劣势，不修改 AC5e 的私有状态，也不把它作为依赖。既有反向修正保留，优势与劣势抵消仍由系统计算。具体实机因果还要由本轮两击验收确认。
3. **同一使用流程可被重复启动。** 原生 `Activity.use` 的 WMP 接管已经打开攻击窗口，聊天卡“攻击”还能开启另一条未携带预约身份的 roll。新增窄门禁：已有同 Activity 的预约窗口时拒绝无匹配身份的重复 roll，保留原窗口和预约；正常确认/取消仍由原流程负责。不是全局禁用聊天卡攻击。
4. **模拟顺序与系统相反。** 旧 integration fixture 先 configure 窗口，再调用 preRollAttack；锁定系统 `BasicRoll.buildConfigure` 在68396起明确先派发 hooks，再 applyKeybindings，再 configure。已纠正，增加早注册第三方 listener 捕获输入的回归；覆盖 Vex 优势、Vex+劣势抵消、Sap劣势及取消保留效果。

没有必要把整个 Vex 重写成上游依赖型宏。当前首击命中、实际扣血、同卡证明关联和生成效果已有46fa原生证据；本次集中修正下一击进入系统攻击流程的边界。过去仅看内部布尔字段或 mock 绿色，不能证明真实窗口正确。

## 验证与待判断项

- 修正后公开安全测试入口：253 pass / 0 fail / 1072 assertions；模块 typecheck PASS。
- 后续a56候选已按受保护安装流程更新到同一Lab，script仅一处文件更新；客户端读回身份与安装一致。
- 主控已亲自完成受影响原生链：首击21/伤害7/HP200→193；第二击自动优势公式，实际d20为18与8取18、总23，伤害4/HP193→189；旧效果在伤害前消费，新效果为不同实例。角色卡只启动一次，额外点击聊天Attack被拒绝且仅原窗口保留。两击均committed，已关闭case、无pending；复用同批资源。完整证据和hash在唯一主进度清单，不另建立进度台账。
- 原生自动分类仍缺Midi关联字段，原件保持INCOMPLETE；父独立核对原生usage/attack/damage同卡关系、真实骰/HP与效果实例后判断玩法PASS，不重写原件，也不为标签重跑已通过案例。
- 已通过的 Midi 主链与其他规则不全部重跑；最终按变更影响确认必要回归和恢复/清理。
- 不复制 wm5e 限制许可代码；w15p 的粗粒度 `1Attack` 不足以替代本项目目标匹配、取消不消费与 GM 权限约束。
- 新候选复查：先精确版本/许可，再同一生命周期与 hook 顺序，最后最小真实案例；不要再以“最新版”或测试数量替代兼容与玩法证据。

状态口径遵循 `../acceptance/foundry-v14-module-health.md`；源码借鉴、测试、安装、实机通过分别记录，互不替代。
