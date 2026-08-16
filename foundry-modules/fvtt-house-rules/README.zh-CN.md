# 本团村规（`fvtt-house-rules`）

这是一个独立的 Foundry VTT 模块，严格锁定 Foundry VTT `14.364` 和 dnd5e `5.3.3`。它不依赖 `fvtt-injury-fading-spirits`，也不导入项目其他模块的私有实现。

## 语言

模块跟随 Foundry 世界的核心语言设置：核心语言为 `zh-CN`，或使用 Foundry 中文翻译包的 `cn` 时使用 `lang/zh-CN.json`，核心语言为 `en` 时使用 `lang/en.json`。治疗药水 Activity 名称、自然 1/20 卡片、隐匿提醒和所有可配置设置均通过这套语言包显示；切换语言后请重新加载世界。

本模块是“明确配置、GM 确认”的辅助工具，而不是替 GM 作裁定。所有会修改长期数据的功能默认关闭；GM 在 Foundry 的“配置设置”中按需启用。版本不精确、来源不唯一、缺少显式标签、没有活动 GM 或对象不允许修改时，模块会失败关闭。

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

运行时 API 位于 `game.fvttHouseRules`，只在锁定版本和活动 GM 存在时允许修改。API 是有意保守的 GM 入口；玩家 socket payload 不会被直接写入世界。

| 规则 | 已实现的模块边界 |
|---|---|
| HR-02 药水 | `potion.configure(item, "preview" | "apply" | "restore")`。`apply` 保存可恢复快照并生成三个 dnd5e `heal` Activity：附赠动作自饮、动作自饮且仅治疗骰最大化、动作喂服他人。固定调整值保留。Compendium 物品拒绝直接修改。 |
| HR-02 生命骰 | `hitPoints.gamble(actor, classItem, level)` 调用原生 `actor.rollClassHitPoints` 和 `HitPointsAdvancement.apply`。第一级不介入；第一次掷出 1 才重掷一次，第二次无论结果都接受；锁为 Actor + Class + Level。 |
| HR-02 低属性 | 选中 Token 时仅作上下文提醒；`lowAbility.reminder(actor)` 也可供 GM 面板调用。它绝不扫描世界或修改 Actor。 |
| HR-03 弹药 | 原生 `dnd5e.rollAttackV2` 的 `ammoUpdate` 产生事务；自动删除时以 dnd5e `flags.dnd5e.roll.ammunitionData` 作为聊天快照回退。`ammo.recover(actor, shotId)` 需要 GM 明确确认，重复确认无效。 |
| HR-03 隐匿 | `stealth.set(actor, state)` 建立显式状态；`stealth.previewMove` 只警告不回滚移动。正常半速、专精减 10 尺、游荡者总等级 7+ 或 GM override 全速；`stealth.dash(actor)` 结束隐匿，`ignoreNextMovement` 可用于传送/GM 调整。非战斗使用 `nonCombatSuggestion`。 |
| HR-04 自然 1 | 保留的自然 1 只创建 GM 后果请求，确认前零副作用。模块按当前确实可用的候选等权随机：近战反击、符合条件的队友误伤、武器损坏、法术自爆，及可选的精确 RollTable。近战队友必须相邻；远程/法术可选路径外队友。GM 确认伤害后调用原生 `Actor.applyDamage`，世界倍率 `0.5`/`1`、抗性和免疫继续由 dnd5e 处理；不投命中、不消耗反应或原 Activity。`repairWeapon` 可修复损坏。 |
| HR-04 重击首骰最大化 | 只要武器攻击或攻击检定法术的伤害 Roll 被 dnd5e 标记为重击（包括手动点重击），不要求自然 20；模块先按 dnd5e 原生规则保留完整重击骰池，再把第一伤害部分的第一颗骰拆成 `1dXminX`，因此原始骰面仍会投出而最终按满值结算：`1d8` 重击显示为 `1d8min8 + 1d8`，`2d6` 重击显示为 `1d6min6 + 3d6`。其他骰、其他伤害部分和 rider 继续使用原生重击；目标伤害部分不唯一或骰子结构无法安全识别时失败关闭。自然 20 仍会生成原有 GM 提示卡。 |

武器损坏保存原始 Activity 快照并重新投影累积的攻击与伤害减值；如果期间有其他模块改变了同一 Activity，模块拒绝覆盖，避免吞掉第三方改动。

## 安全与幂等

- 选择活动且 `id` 字典序最小的 GM 作为唯一写入者，避免不同客户端按连接顺序产生不同 authority。
- 每个持久事件都有由 document/event 身份构成的事务 ID；不含骰点。Actor flags 中的有界 ledger 会去重；自然 1 的卡片确认也只能成功一次。世界 schema 在 `ready` 时迁移到 v1；未知 Actor flag schema 不会被覆盖，而是失败关闭。
- 玩家消息只携带 UUID/Item ID/事件 ID；GM 重新解析 Actor、Activity、物品、标签与权限。任何失效或不唯一对象都拒绝。
- 原生 blind-roll 的原始值从不复制到 flags、模块消息或审计摘要。
- 模块不会 patch Foundry/dnd5e prototype、编辑 LevelDB/Compendium，或自动恢复弹药。

## 已锁定的源码依据

在配置的 reference cache 中检查了 dnd5e `5.3.3`：

- `module/documents/activity/attack.mjs`：`dnd5e.rollAttackV2` 在原生弹药写入前提供 `ammoUpdate`，自动删除时把 source 写入 `flags.dnd5e.roll.ammunitionData`。
- `module/documents/advancement/hit-points.mjs` 与 `applications/advancement/hit-points-flow.mjs`：`HitPointsAdvancement.apply(level, { [level]: value })` 是原生 HP 选择路径。
- `module/data/activity/heal-data.mjs`：治疗 Activity 是 `type: "heal"`，使用结构化 `healing` `DamageField`。

Lab 中已安装 MIDI-QOL `14.0.11` 与 DAE `14.0.12` 的发布源码。模块核对了 MIDI 对 dnd5e `preRollDamage` 的精确调用路径，并只在该精确版本组合下读取 workflow 的保留攻击骰；core 与 MIDI 共用同一个本次 roll-config 变换，不注册推测性的私有 MIDI hook。其他 MIDI/DAE 版本失败关闭。

Foundry core 源码快照只有 `14.361`，所以模块不依赖未核实的 core 私有 API；聊天卡使用 dnd5e 5.3.3 自己公开触发的 `dnd5e.renderChatMessage`。本地矩阵已经对锁定的 Foundry `14.364` / dnd5e `5.3.3` 完成安装、聊天卡、Token 移动和多客户端路径回放；具体结果见仓库的[本地 E2E 报告](../../docs/remediation/2026-08-07-fvtt-v14-house-rules/evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md)。这不等同于生产安装或真实跑团中的长期验收。

## 构建、归档与受保护 Lab 工具

在该目录执行：

```powershell
bun run typecheck
bun run test
bun run build
bun run verify:artifact
```

`build` 生成 browser-targeted `dist/scripts/module.js`，同步 manifest/语言/样式，并生成固定排序、固定时间戳的 `release/fvtt-house-rules-0.1.0.zip`。`verify:artifact` 核对 package、源 manifest、构建 manifest、必要文件和 ZIP 内容。

`install:local-lab` 与 `verify:local-lab` 仅接受精确 `FVTT_OPS_LAB_ROOT=F:\FoundryLab\foundry-v14`。安装还要求显式 `HOUSE_RULES_LOCAL_LAB_INSTALL=1`，拒绝远程/生产环境变量、链接目标和已有模块目录，且从不覆盖安装。它们只证明文件安装，不等于真实 E2E。
