# 本团村规（`fvtt-house-rules`）

## 2026-11-04版本准入调整

保留已有旧版配对；原生6路径允许Foundry Core `14.368+` 与dnd5e `6.0.6+`，分别限制在14和6主版本内。清单、构建校验与运行时判断保持一致，后续小版本无需逐项登记。此处调整版本准入；已记录的实际行为验收仍绑定原版本、角色和范围，不将未来版本标为功能通过。本轮只补版本判断及其适配分支的局部检查，不重放旧玩法验收。

这是一个独立的 Foundry VTT 模块。`0.1.4` 的重击首骰功能按当前伤害骰接口判断，不再绑定 Foundry、dnd5e、Midi-QOL、DAE 或 Dice So Nice 的精确版本号。它只处理能够明确识别、尚未投出的原生重击骰；接口或来源不符时保留原生结算。整包manifest与其他房规仍保留各自的支持范围，不据此承诺所有将来版本兼容。

既有完整运行验收针对 Foundry VTT `14.364` / dnd5e `5.3.3`；`0.1.3` 在历史 ServerNext `14.368/6.0.2` 接受药水预览、应用、手改保护、恢复和重载。`14.368/5.3.3`、`14.368/6.0.5` 与 `14.368/6.0.6` 各自的功能范围以原记录为准；606药水代表链不推广到其他玩法。`14.369/6.0.6` 的现装基线已承接，其他房规保留旧配对并采用下述主版本内准入。模块不依赖 `fvtt-injury-fading-spirits`，也不导入其他模块的私有实现。

## 语言

模块跟随 Foundry 世界的核心语言设置：核心语言为 `zh-CN`，或使用 Foundry 中文翻译包的 `cn` 时使用 `lang/zh-CN.json`，核心语言为 `en` 时使用 `lang/en.json`。治疗药水 Activity 名称、自然 1/20 卡片、隐匿提醒和所有可配置设置均通过这套语言包显示；切换语言后请重新加载世界。

本模块是“明确配置、GM 确认”的辅助工具。所有会修改长期数据的功能默认关闭；GM 在“配置设置”中按需启用。重击首骰检查接口与骰子结构；其他功能继续检查其版本准入范围、来源、显式标签、活动GM及修改权限。

## 显式标签，不猜名称

本模块绝不从中文/英文名称推断物品性质。药水和弹药必须由 GM 用结构化 flag 标记。例如，治疗药水：

```json
{
  "flags": {
    "fvtt-house-rules": {
      "potion": {
        "healing": true,
        "dice": { "number": 2, "denomination": 4, "bonus": "2" }
      }
    }
  }
}
```

弹药还必须有稳定的显式 `key`，以便找回时只与同一类明确标签弹药合并：

```json
{
  "flags": {
    "fvtt-house-rules": {
      "ammo": { "key": "arrow", "tier": 3 }
    }
  }
}
```

`tier` 只能是 `0`、`1`、`2` 或 `3`。模块只会记录原生消费后射出的单发：`+3 → +2 → +1 → +0`，不会把库存中剩余整叠弹药降级。

## 功能与使用入口

运行时 API 位于 `game.fvttHouseRules`，根据对应功能的准入和活动 GM 权限决定是否允许修改。API 是有意保守的 GM 入口；玩家 socket payload 不会被直接写入世界。

| 规则 | 已实现的模块边界 |
|---|---|
| HR-02 药水 | `potion.configure(item, "preview" | "apply" | "restore")`。`apply` 先保存原始活动、读回确认后生成三个 dnd5e `heal` Activity，再保存实际规范化的应用后基线：附赠动作自饮、动作自饮且仅治疗骰最大化、动作喂服他人。`restore` 仅在当前活动完整等于应用后基线时强制恢复原图；GM后来修改或增加 Activity、旧schema1快照缺少基线时失败关闭并保留快照供人工处理。固定调整值保留。Compendium 物品拒绝直接修改。 |
| HR-02 生命骰 | `hitPoints.gamble(actor, classItem, level)` 调用原生 `actor.rollClassHitPoints` 和 `HitPointsAdvancement.apply`。第一级不介入；第一次掷出 1 才重掷一次，第二次无论结果都接受；锁为 Actor + Class + Level。 |
| HR-02 低属性 | 选中 Token 时仅作上下文提醒；`lowAbility.reminder(actor)` 也可供 GM 面板调用。它绝不扫描世界或修改 Actor。 |
| HR-03 弹药 | 原生 `dnd5e.rollAttackV2` 的 `ammoUpdate` 产生事务；自动删除时，5.3.3 从 `flags.dnd5e.roll.ammunitionData`，6.0.2 与 6.0.5 从同一攻击消息的 `system.deltas.deleted` 取快照并核对弹药 ID。`ammo.recover(actor, shotId)` 需要 GM 明确确认，重复确认无效。 |
| HR-03 隐匿 | `stealth.set(actor, state)` 建立显式状态；`stealth.previewMove` 只警告不回滚移动。正常半速、专精减 10 尺、游荡者总等级 7+ 或 GM override 全速；`stealth.dash(actor)` 结束隐匿，`ignoreNextMovement` 可用于传送/GM 调整。非战斗使用 `nonCombatSuggestion`。 |
| HR-04 自然 1 | 保留的自然 1 只创建 GM 后果请求，确认前零副作用。模块按当前确实可用的候选等权随机：近战反击、符合条件的队友误伤、武器损坏、法术自爆，及可选的精确 RollTable。近战队友必须相邻；远程/法术可选路径外队友。GM 确认伤害后调用原生 `Actor.applyDamage`，世界倍率 `0.5`/`1`、抗性和免疫继续由 dnd5e 处理；不投命中、不消耗反应或原 Activity。`repairWeapon` 可修复损坏。 |
| HR-04 重击首骰最大化 | 武器攻击或攻击检定法术的伤害被dnd5e标记为重击时生效，包括手动选择“重击”，不要求自然20。保留完整原生骰池，只将指定基础伤害的第一颗骰按满值计入；真实骰面仍保留。例如原`1d8`重击仍投2颗d8，只有第一颗按8计入；原`2d6`重击仍投4颗d6，只有第一颗按6计入。其他骰与rider继续原生结算，tooltip显示真实骰面与计入值。普通伤害、豁免法术、已投完、来源不唯一或不认识的结构不修改。自然20提示卡仍按其他房规的支持范围。 |

武器损坏保存原始 Activity 快照并重新投影累积的攻击与伤害减值；如果期间有其他模块改变了同一 Activity，模块拒绝覆盖，避免吞掉第三方改动。

## 安全与幂等

- 选择活动且 `id` 字典序最小的 GM 作为唯一写入者，避免不同客户端按连接顺序产生不同 authority。
- 每个持久事件都有由 document/event 身份构成的事务 ID；不含骰点。Actor flags 中的有界 ledger 会去重；自然 1 的卡片确认也只能成功一次。世界 schema 在 `ready` 时迁移到 v1；未知 Actor flag schema 不会被覆盖，而是失败关闭。
- 玩家消息只携带 UUID/Item ID/事件 ID；GM 重新解析 Actor、Activity、物品、标签与权限。任何失效或不唯一对象都拒绝。
- 原生 blind-roll 的原始值从不复制到 flags、模块消息或审计摘要。
- 首骰功能注册自己的骰子修饰符及tooltip显示；不改写真实骰面，不编辑LevelDB/Compendium，也不自动恢复弹药。

## 已锁定的源码依据

在配置的 reference cache 中检查了 dnd5e `5.3.3`：

- `module/documents/activity/attack.mjs`：`dnd5e.rollAttackV2` 在原生弹药写入前提供 `ammoUpdate`，自动删除时把 source 写入 `flags.dnd5e.roll.ammunitionData`。
- `module/documents/advancement/hit-points.mjs` 与 `applications/advancement/hit-points-flow.mjs`：`HitPointsAdvancement.apply(level, { [level]: value })` 是原生 HP 选择路径。
- `module/data/activity/heal-data.mjs`：治疗 Activity 是 `type: "heal"`，使用结构化 `healing` `DamageField`。

旧Lab的Midi14.0.11／DAE14.0.12，以及历史Next的Midi local.9／DAE14.0.14／DSN6.3.1只保留其历史验收范围。0.1.4首骰不再用这些版本清单作开关；其他功能没有随之扩大支持。

对照 ServerNext 安装的 dnd5e `6.0.2` 源码：攻击消息改用 `type: "attack"` 和 `system.activity/item/ammunition/targets`，被删除弹药保存在 `system.deltas.deleted`；`rollAttackV2` / `postRollAttack` 仍分别在消费前后触发。模块对两代消息分别检查发送者所有权、speaker、Activity 与 Item 身份、弹药 ID、GM 侧库存快照和事务去重。`rollClassHitPoints` 与 `HitPointsAdvancement.apply` 在 6.0.2 中仍存在，但实际等级提升中的持久化链和所有村规语义尚未在目标世界验收。

对照固定 dnd5e `6.0.2` 与 `6.0.5` 源码，House Rules 所依赖的 `system.deltas.deleted` 仍保存删除物品的序列化文档；6.0.5 改为只在 `system.deltas.created` 保存创建物品 ID。House Rules 使用删除快照而不读取 `created`，因此该差异不改变当前恢复路径。`14.368/6.0.5` 仍需目标世界验证，旧 6.0.2 运行记录不替代它。

旧版验收所用 Foundry core 源码快照为 `14.361`，模块不依赖未核实的 core 私有 API；旧版聊天卡使用 dnd5e 5.3.3 公开触发的 `dnd5e.renderChatMessage`。本地矩阵已经对 Foundry `14.364` / dnd5e `5.3.3` 完成安装、聊天卡、Token 移动和多客户端路径回放；具体结果见仓库的[本地 E2E 报告](../../docs/remediation/2026-08-07-fvtt-v14-house-rules/evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md)。这不等同于 14.368 / 6.0.2、生产或真实跑团验收。

## 构建、归档与受保护 Lab 工具

在该目录执行：

```powershell
bun run typecheck
bun run test
bun run build
bun run verify:artifact
```

`build`生成browser-targeted `dist/scripts/module.js`，同步manifest／语言／样式，并生成固定排序及时间戳的`release/fvtt-house-rules-0.1.4.zip`。`verify:artifact`核对package、源／构建manifest、必要文件与ZIP内容。

首骰的公开Hook与实际DiceTerm能力在每次处理前检查；重复处理、非重击、已求值、基础伤害不唯一、修饰符冲突或公式重编失败时不覆盖原生结果。接口检查和原生骰回归由本模块测试覆盖。

开发者可通过根命令`bun run test:house-critical-acceptance`检查专用工具，再用`bun run prepare:house-critical-acceptance <新的仓库外绝对目录>`生成单个验收宏。它通过正常伤害对话框分别测普通、武器重击、法术攻击重击和取消；不代表完整攻击命中、Midi workflow或生产接受。

`install:local-lab` 与 `verify:local-lab` 仅接受精确 `FVTT_OPS_LAB_ROOT=F:\FoundryLab\foundry-v14`。安装还要求显式 `HOUSE_RULES_LOCAL_LAB_INSTALL=1`，拒绝远程/生产环境变量、链接目标和已有模块目录，且从不覆盖安装。它们只证明文件安装，不等于真实 E2E。

## 本地重构候选：药水事务

药水规则计划保留在纯规则层；`potion-transaction.ts` 单独处理同一 Item 的串行应用/恢复、快照和写后读回。保存期间新增或手改 Activity、失去活动GM权限、出现无法确认的系统规范化时均拒绝继续，保留恢复记录。原值与应用后基线不会吸收外来的手改。

若恢复已还原 Activity 但清除快照暂时失败，可在同一页面对同一 Item 重试；只有 UUID、完整快照和原始 Activity 均未变化时才清理剩余标记，不重复写 Activity。重新加载后或外部手改使该临时证明失效时，不自动猜测恢复。

6.0.6 的药水代表链涵盖 Apply、schema2 快照、三条 Activity、手改拒绝、Restore 和普通重载。预检使用当前注册模型构造预期数据，缺模型或异常时拒绝写入。该接受范围保留在原药水工作流。
