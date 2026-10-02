# 武器精通与特性 / Weapon Mastery & Properties

`fvtt-weapon-mastery-properties` 是独立的武器精通与特性模块，负责 D&D 2024 官方八种精通及明确配置的家规特性。它依赖 `fvtt-custom-conditions` 管理临时效果，依赖 `fvtt-trigger-engine` 协调事件；不依赖 house-rules。

当前精确目标为 **Foundry 14.364 / dnd5e 5.3.3**。两个依赖模块须为 0.1.1 起的 0.1.x 版本，或精确 0.2.0，并通过版本 1 API 与运行时能力检查；0.2.1 及后续版本不在本次兼容门内。恢复工作只先读[唯一主进度清单](../../docs/reviews/2026-09-25-weapon-mastery-user-report.md)；当前难点见[唯一子 Plan](../../docs/plans/weapon-mastery-active-case.md)。构建、单元测试与实际玩法验收分别报告。

当前为已完成本地验收的交付候选，尚未发布。逐项玩法证据、实测构建与文档打包身份仅在主进度清单维护；本地结果不等于生产或其他版本已验收。

## 使用范围

- 官方精通：Cleave、Graze、Nick、Push、Sap、Slow、Topple、Vex。
- 首批家规：Deadly（重击额外骰）、Fatal（只在重击时更换武器基础骰面并加骰）、重击流血。
- 官方预设与复制后的自定义变体有不同规则 ID；效果来源、目标关系、叠加和消耗规则分别记录。
- 既有武器默认不启用，不根据武器名称、描述或图标猜测规则。NPC 的掌握资格由 GM 或明确来源授予。

## 开发与验收

### 游戏内复测工具（仅主持人）

本开发版包含复测工具，不需要浏览器打开本地 JavaScript 文件，也不需要反复修改初始化宏。

1. 在模块设置中启用 `Weapon Mastery GM E2E harness (development only)`，然后点 Token 工具栏的试管按钮。
2. 选择当前测试环境，核对并勾选确认。先运行 `Scan official dnd5e weapons`，再运行 `Create / resume batch`。已有批次直接从下拉框恢复。
3. 运行 `Prepare task scene and Combat`，工具会激活任务场景并建立或恢复关联的战斗。需要手工准备时，`Register current Combat (manual setup)` 只接纳属于该场景且只包含任务棋子的战斗。
4. 选择规则，运行 `Reset case`，用 `Open task attacker sheet` 打开攻击者，再运行 `Record UI start`，按平时的方法使用武器攻击及应用伤害；重新打开工具，运行 `Export receipt` 下载本次结果。
5. 同一批次保留角色和场景。修复代码更新模块后，保存旧结果，勾选已保存结果，再运行 `Accept updated build (keep fixtures)`；随后复位受影响的规则并重测。
6. 全部完成后，恢复原场景及战斗，填入批次名称，运行 `Cleanup exact batch`。保存清理结果后才运行 `Finalize ledger`。测试源码和下载的结果长期保留。

工具只操作带本批归属标记的对象。为减少等待，擦伤测试使用很难命中的目标；重击测试把任务武器的重击门槛调低，并记录该设置，仍执行真实攻击和伤害。普通武器不会被改动。重击测试不等于证明每次普通攻击都会重击。`Run public Activity API` 的结果与真实界面操作分开标记；原 Midi Apply 故障仍从实际聊天卡按钮复验。

Cleave 复测使用大型、2×2 格的任务攻击者和两个不重叠的中型目标，使真实 5 尺武器在当前世界测距规则下也能触及两者；切换其他用例时恢复中型、1×1 格。面板在攻击前显示 `cleaveGeometry`，用实际网格测距检查次目标到主目标和攻击者的距离；超距或无法测量时阻止启动。不会扩大武器触及范围或修改世界的对角线规则。

工具是否可用与各项玩法是否通过，见当日[使用与完成情况](../../docs/reviews/2026-09-25-weapon-mastery-user-report.md)，不以出现按钮或自动测试通过代替游戏结果。

在仓库根运行：

```text
bun run test:weapon-mastery-properties
bun run build:weapon-mastery-properties
bun run typecheck:foundry-modules
```

显式 build 产生固定产物和 dist/build-identity.json。install、patch、verify-artifact、verify-install 只读取并核对该产物，不会隐式重建；源码、配置、锁文件或共享契约变化后需重新 build。客户端 API 的 buildId 标识实际加载构建，完整安装树哈希和 runtimeCodeSha256 分别标识发布文件与运行脚本。

本地安装使用受保护的 Lab 安装器，先检查实际进程、端口、数据目录和共享服务使用情况。安装文件一致不等于世界已加载或效果已通过实测。批次复用与混合验收见 [CoTN runbook](../../docs/runbooks/weapon-mastery-cotn-e2e.md)，通用短模板见 [模块开发与验收](../../docs/runbooks/custom-module-development.md)。

## 原生数据与自动化

配置使用 `flags.fvtt-weapon-mastery-properties.weapon`，由共享契约严格校验；官方精通仍保留 `system.mastery`。角色的武器熟练和精通资格分别处理。

Deadly 的额外重击骰可以写入原生攻击 Activity 的 `damage.critical.bonus`。精确 Fatal、临时优势/劣势、到期和消费依赖运行模块；不能通过永久改大基础骰冒充 Fatal。流血采用本项目自定义状态的规则，不代表移植 PF2e 整套持续伤害体系。

Cleave/Nick 需要真实额外攻击额度验收；Sap/Vex 需要取消、多客户端及来源关系验收；Push 需要真实合法位移验收。仅出现聊天提醒或测试绿色不代表这些行为已通过。Midi 启用时若武器模块没有匹配到本次攻击的有效预检，候选实现会阻止该次掷骰并提示错误；应核查工作流与任务台账后重新发起，不能再由武器模块另开一次原生掷骰。

在候选实现中，Cleave 命中后由 GM 选择合法第二目标，随后进行独立攻击和伤害；第二次伤害不加正的攻击属性调整值，负值保留。Nick 使用已有 Light 额外攻击，不生成第三次攻击；首把 Light 武器不必配置本模块。Midi 的快速攻击仍显示一次确认对话框，以便核实最终的 offhand/精通选择，并让取消操作释放尚未开始的一次性效果。

Slow、Vex 等需要实际伤害的规则，在玩家自行应用伤害时等待活动 GM 核对来源消息和 Actor 更新；若多个攻击无法唯一关联，保留待 GM 复核，不猜测伤害属于哪次攻击。针对锁定的 Midi 14.0.11，支持带准确来源卡片的卡片内 Apply，并再次核对攻击、目标与 HP／临时 HP 变化；没有来源卡片的右键应用路径继续失败关闭。已保存真实 SY 玩家攻击及应用伤害、在线 GM 结算 Slow 的证据；Vex 的 Midi 与原生两击、消费/再授予和相关生命周期证据分别记录。代表性跨客户端实测与自动化权限/并发检查不冒称全部玩家、角色、棋子组合均做过手工测试。

## 从正式来源生成

独立 Item 的 YAML frontmatter 使用 `原生精通`（或 `native-mastery`）指定官方精通 ID，并以 `weapon-properties` 保存版本化武器配置。Actor 的结构化动作也可以带 `weapon-properties`/`weaponProperties` 配置。配置必须明确提供参数，不能仅凭正文里出现 Deadly/Fatal 名称启用效果。

完整来源样例见 [Item 长矛](../../tests/fixtures/weapon-mastery-spear.md) 和 [Actor 武器动作](../../tests/fixtures/weapon-mastery-actor.md)。在仓库根运行正式 CLI：

对来源给出的固定伤害，生成器只保留一份活动伤害，不再叠加同一武器基础伤害或额外推断属性加值；活动同时记录基础骰来源，供 Fatal 等规则精确处理。能够从来源明确推导原生属性攻击的武器继续使用原生基础伤害。导入后手改活动伤害可能使来源绑定失效，此时自动处理会拒绝猜测；应更新来源并重新生成、导入。

```text
bun run src/index.ts tests/fixtures/weapon-mastery-spear.md --fvtt-version 14 --effect-profile core --icon-mode off --output .local/weapon-properties-evidence/spear-core.json
bun run src/index.ts tests/fixtures/weapon-mastery-actor.md --fvtt-version 14 --effect-profile modded-v14 --icon-mode off --output .local/weapon-properties-evidence/textual-actor.json
bun run verify:actor tests/fixtures/weapon-mastery-actor.md .local/weapon-properties-evidence/textual-actor.json
```

先准备本任务自己的输出目录。`verify:actor` 只验证 Actor；独立 Item 使用正式 workflow 内的值级 verifier，再逐项对照来源。`core` 不写武器模块启用 flags：Deadly 投影为原生 Activity 额外骰，Fatal/重击流血保留说明并标记需要复核。`modded-v14` 才输出本模块的版本化启用配置。Web AI Item Intake 仍限制 v14/core。
