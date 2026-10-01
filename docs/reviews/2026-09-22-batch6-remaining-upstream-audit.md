# Batch 6 剩余模块官方上游审计（2026-09-22）

> 审计时间：2026-09-22 14:31:31（Asia/Shanghai）
> 目标环境：Foundry VTT 14.368，dnd5e 6.0.2
> 范围：只读官方 manifest、官方 release 资产、官方 changelog/source；未安装、未覆盖 server-next、未修改世界或服务。
> 原审计入口：F:/FoundryLab/foundry-v14/evidence/server-next-migration/batch6-official-latest-audit.json。

## 2026-10-01 整理说明：原审计与后续进展分开

下文版本、“latest”“未安装”和复查清单都描述 2026-09-22 采集时点，不是当前服务状态。本次仅整理既有来源，没有联网刷新版本或连接运行中的 Foundry。

- 后续 [9/23 Batch 6 记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-23-batch6-migration-refresh.md)已记录 AC5e 14.603.2 安装并被客户端识别；在那个检查时点仍未启用、玩法待验收。因此下方“先决定是否安装”的旧步骤不应原样重复，也不能升级为 AC5e 玩法 PASS。
- 同一后续记录包含 Tidy 限定 UI 验收，以及 DAE `isDamaged` 在实际 HP 应用前过期的失败。不能把 DAE／Tidy 一概写成“从未验收”，也不能把一个限定通过扩成所有交互通过。
- 后续资料仍属于原迁移工作树，未被本次复制或整合。迁移过程与证据边界见已提交的[ServerNext 过程审计](2026-09-29-workflow-audit-evidence/servernext-process.md)。
- Token Action HUD adapter 和 Plutonium CN 的旧 HOLD 是当时版本声明，不是永久不支持的结论；未来获准处理它们时复查精确版本。英文上游替代的中文影响仍须单独判断。

## 分层结论

以下为 2026-09-22 快照。

### 已由官方声明支持目标

- **DAE 14.0.14**：官方 v14 manifest 仍为当前版本。Foundry 声明范围为 14.365–14.999（verified 14.367）；manifest 没有 dnd5e system relationship，但 Changelog.md 的 14.0.14 条目明确针对 dnd5e 6.0 的 special duration、rider conditions、_prepareDuration、per-change conditions、system.rolls.attack|damage.*.bonus 路径和过期 effect 删除行为。依赖仍为 lib-wrapper 与 socketlib。
- **Tidy 5e Sheets 14.1.2**：官方 latest 仍为 v14.1.2。Foundry minimum=14、verified=14；dnd5e minimum=6.0.0、verified=6.0.0、maximum=6.0.x。目标 dnd5e 6.0.2 在声明范围内，manifest 无硬依赖。
- **Automated Conditions 5e 14.603.2**：官方 latest 已从原目标安装的 14.533.19.2 变更为 v14.603.2。Foundry minimum=14.367、verified=14.368、maximum=14；dnd5e minimum=6.0.0、verified=6.0.3、maximum=6.1。目标 Foundry 14.368/dnd5e 6.0.2 完整落在声明范围内。官方 changelog 的 14.603.2 条目明确写明更新 dnd5e v6，包括 chat message、activity use、target storage 和 Active Effect workflows。
- **Plutonium（上游替代）2.19.4.v14**：TheGiddyLimit 官方上游 v14 manifest 已声明 Foundry 14–14.999（verified 14.368），dnd5e 5.3.0–6.0.999（verified 6.0.3）；官方 changelog 明确写有 dnd5e 6.0.x 支持，以及 advancement UUID/importer 相关 6.0.x 修复。它的 module id 是 plutonium，不是中文 fork 的 plutonium-cn，不能直接当作中文模块的无缝升级。

### 仍有明确官方兼容阻碍

- **Token Action HUD D&D 5e 2.1.0**：官方 latest 仍为 2.1.0，Foundry minimum=13.351、verified=14.360，但 dnd5e 仅声明 5.1.0–5.99（verified 5.3.1）。目标 dnd5e 6.0.2 不在声明范围内。其 core 依赖要求 token-action-hud-core >=2.0.11、verified 2.1.0、maximum 2.1.99；core 本身已有 2.1.1，但 core 更新不能替 adapter 获得 dnd5e 6.x 支持。不能通过改 manifest 最大版本把它判为兼容。
- **Plutonium CN 2.15.6**：中文 fork 官方 latest 仍为 v2.15.6，Foundry 14–14.999（verified 14.363），dnd5e 5.3.0–5.3.999（verified 5.3.2）。它仍不声明 dnd5e 6.x。可复查的具体替代是上游 module id plutonium 2.19.4.v14；是否接受失去中文 fork 的本地化、以及是否有可审计的中文翻译层，必须单独决策和验收。

### 运行时证据边界

本审计只证明上游版本、manifest 声明和源码/changelog 事实。它没有证明 DAE、Tidy、AC5e 在当前世界的浏览器操作、角色卡、Activity、条件自动化或 Midi-QOL 交互已经 PASS。已有 9 月 18 日 server smoke 证据继续保留，但不能替代这些功能验收。

## 官方版本与依赖矩阵

| 模块 | 当前官方版本 | Foundry 声明 | dnd5e 声明 | 依赖/关系 | 对目标结论 |
|---|---:|---|---|---|---|
| DAE | 14.0.14 | 14.365–14.999，verified 14.367 | manifest 未列 system；14.0.14 changelog 明确 dnd5e 6.0 行为 | lib-wrapper、socketlib | 声明/源码层可继续功能验收 |
| Tidy 5e Sheets | 14.1.2 | min 14，verified 14 | 6.0.0–6.0.x，verified 6.0.0 | 无硬依赖 | 声明层支持 6.0.2 |
| Automated Conditions 5e | 14.603.2 | 14.367–14，verified 14.368 | 6.0.0–6.1，verified 6.0.3 | 无 manifest 硬依赖；源码检测 Midi-QOL ready | 应更新候选，需先完成旧版本运行时基线 |
| Token Action HUD D&D5e | 2.1.0 | min 13.351，verified 14.360 | 5.1.0–5.99，verified 5.3.1 | token-action-hud-core 2.0.11–2.1.99 | dnd6 HOLD |
| Token Action HUD Core | 2.1.1 | min 13.351，verified 14.360 | 不限定 system | socketlib；color-picker optional | core 单独更新不能解除 adapter HOLD |
| Plutonium CN | 2.15.6 | 14–14.999，verified 14.363 | 5.3.0–5.3.999，verified 5.3.2 | lib-wrapper >=1.13.0.0 | dnd6 HOLD |
| Plutonium（上游替代） | 2.19.4.v14 | 14–14.999，verified 14.368 | 5.3.0–6.0.999，verified 6.0.3 | lib-wrapper >=1.13.0.0 | 技术兼容候选；中文本地化未证明 |

依赖当前官方 manifest 也已保存：lib-wrapper 1.13.5.1（verified Foundry 14）、socketlib 1.1.3（verified Foundry 14）。

## AC5e 14.533.19.2 → 14.603.2 对账

### 官方新包取得与安全核验

下载源：

- Manifest：<https://github.com/thatlonelybugbear/automated-conditions-5e/releases/latest/download/module.json>
- Release ZIP：<https://github.com/thatlonelybugbear/automated-conditions-5e/releases/download/v14.603.2/module.zip>
- Changelog：<https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/Changelog.md>

证据目录：

F:/FoundryLab/foundry-v14/evidence/server-next-migration/batch6AF-upstream-audit-20260922/

证据：

- ZIP 长度：402,785 bytes。
- ZIP SHA-256：F9EBC1202DCA7E47E1CB8B06850B0E2522E2AB287BC336041D92679F4CC5B02A。
- ZIP 共 74 个 entry；逐项检查没有绝对路径、驱动器路径、.. 路径、symlink 或 reparse 标志。
- 原 14.533.19.2 包与新包均为 74 个 entry；entry 名称集合无新增或删除，34 个 entry 的长度发生变化，主要是 scripts/、styles/ac5e.css、语言文件、Changelog.md 和 module.json。
- 原目标中的 scripts/ac5e-main.mjs 与本地已下载官方 14.533.19.2 ZIP 中相同 entry 的 SHA-256 均为 D4C3B264B145DB6F6BAB223726388A5235EC48DB4A27F3F11465EFDE83380D6C。因此目前看到的 AC5E_LOCAL_BUILD_ID='v14.360.15042026' 是上游包自带内容，不能据此推断有本地源码适配或篡改。

### Manifest 资源入口与依赖变化

14.533.19.2 与 14.603.2 的资源入口没有结构变化：

- esmodules 仍只有 scripts/ac5e-main.mjs；
- styles 仍为 styles/ac5e.css；
- languages、hotReload 的 css/hbs/json 扩展和 lang/styles/templates 路径不变；
- 两个版本都没有 packs；
- 两个版本都没有 manifest requires 或 conflicts；
- 变化的是版本、Foundry compatibility、dnd5e compatibility 和 release download URL。

最新 ac5e-main.mjs 仍以：

game.modules?.get(Constants.MODULE_ID)?.version ?? 'unknown'

读取模块版本，并以同一值输出 AC5E LOADED 日志。这个值来自 Foundry 已加载的 module registry；它不是运行中动态重新解析 module.json 的机制。最新 main 文件长度为 14,595 bytes，并仍包含 AC5E_LOCAL_BUILD_ID = 'v14.360.15042026'。

### 迁移和在线更新风险

新旧 scripts/ac5e-migrations.mjs entry SHA-256 相同，且仍使用：

- migration point 14.533.6.2；
- settings.migrated 判断；
- 当当前值不等于该 point 且用户为 active GM 时，遍历 game.actors、game.items 的 Active Effects；
- 对旧 range subkey 调用 effect.update({ 'system.changes': changes }, { render: false })；
- 最后写入 lastMigratedPoint。

因此，是否会在下一次 ready 改动世界效果，取决于当前世界真实的 AC5e lastMigratedPoint setting 值，不能只看新版本号。升级前应先只读采集该值和受影响 effect 数量；如果值不是 14.533.6.2，必须把这次迁移视为有世界写入的维护动作。

虽然 manifest 的 hotReload flag 列出 css/hbs/json，AC5e 的可执行入口是 esmodule。运行中的已 import JavaScript 不会因为磁盘 ZIP 替换而自动重新执行；game.modules.get(...).version 也不会由新 module.json 自动变更。因此仅覆盖 server-next 模块目录不能作为“无重启完成升级”的证据。应在维护窗口按正常安装/加载路径处理，并重新做启动与功能验收。此次只下载了新 ZIP，未覆盖目标目录。

## 与 Midi-QOL local.7 的关系

- DAE manifest 只硬依赖 lib-wrapper/socketlib，没有对 Midi-QOL 的 manifest 依赖；其 dnd5e 6.0 release notes 针对 Active Effects 和 roll bonus 路径，仍需与当前 Midi-QOL local.7 的效果/roll 流程做实际回归。
- AC5e manifest 没有 Midi-QOL hard dependency，但 14.533.19.2/14.603.2 的 main 逻辑都会在检测到 midi-qol 时等待 midi-qol.midiReady 后再完成 AC5e setup；这说明存在显式交互入口，不能仅以“两个模块都启动”判定兼容。
- Tidy5e、Token Action HUD 和 Plutonium 的 manifest 没有声明 Midi-QOL 依赖；它们与 local.7 的交互仍属于功能验收范围，不由本次上游 manifest 研究证明。

## 待判断本地化/复查清单

原清单，按页首后续记录对账，不直接重复执行。

1. DAE：复用已安装 14.0.14，完成 dnd5e 6.0.2 下 Active Effect duration/bonus selector 和 Midi local.7 交互的浏览器功能验收。
2. Tidy5e：复用已安装 14.1.2，完成角色卡、Activity/Item 编辑与 Midi local.7 的实际操作验收。
3. AC5e：先对旧 14.533.19.2 采集当前世界的 lastMigratedPoint、settings 和 effect 数量，再决定是否安装官方 14.603.2；安装后重新验证 dnd5e v6 condition/roll/activity/Active Effect 及 Midi local.7 交互。不能在线替换 esmodule 充当升级。
4. Token Action HUD D&D5e：继续 HOLD；定期复查官方 adapter manifest/release 是否出现 dnd5e 6.x 声明。core 2.1.1 可单独记录，但不改变 adapter HOLD。
5. Plutonium CN：继续 HOLD；若选择技术替代，单独评估并安装上游 plutonium 2.19.4.v14，另行验证中文翻译和既有中文工作流，不把替代模块自动归入 plutonium-cn。

## 官方来源和原始证据

原始 manifest、依赖 manifest、AC5e 新 ZIP、AC5e/DAE/Plutonium changelog 已保存于：

F:/FoundryLab/foundry-v14/evidence/server-next-migration/batch6AF-upstream-audit-20260922/

官方来源：

- DAE manifest：<https://gitlab.com/tposney/dae/-/raw/v14/package/module.json>
- DAE changelog：<https://gitlab.com/tposney/dae/-/raw/v14/Changelog.md>
- Tidy manifest：<https://github.com/kgar/foundry-vtt-tidy-5e-sheets/releases/latest/download/module.json>
- Tidy repository/readme：<https://github.com/kgar/foundry-vtt-tidy-5e-sheets>
- AC5e manifest：<https://github.com/thatlonelybugbear/automated-conditions-5e/releases/latest/download/module.json>
- AC5e changelog：<https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/Changelog.md>
- Token Action HUD D&D5e manifest：<https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/latest/download/module.json>
- Token Action HUD Core manifest：<https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/latest/download/module.json>
- Plutonium CN manifest：<https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases/latest/download/module-foundry14.json>
- Plutonium 上游 manifest：<https://github.com/TheGiddyLimit/plutonium-next/releases/latest/download/module.json>
- Plutonium 上游 changelog：<https://raw.githubusercontent.com/TheGiddyLimit/plutonium-next/master/CHANGELOG.md>
- lib-wrapper manifest：<https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json>
- socketlib manifest：<https://raw.githubusercontent.com/manuelVo/foundryvtt-socketlib/develop/module.json>
