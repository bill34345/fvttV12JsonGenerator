# 外部付费 Foundry 模块评估与引入候选

- 记录日期：2026-09-22
- 评估目标环境：Foundry `14.364` / dnd5e `5.3.3`（原调研锁定）；server-next 迁移目标 Foundry `14.368` / dnd5e `6.0.2` 仍 `IN_PROGRESS`
- 原调研载体：worktree `20260922-102836-paid-module-evaluation`；当时记录的“未提交、未合并、未发布”只描述原调研状态
- 本文件中"本地化"指**纳入本项目本地 Foundry Lab 并通过离线验收**（含必要的中文本地化工作），与商业发行无关

## 2026-10-01 整理说明与后续记录

本文件保留 9/22 调研快照；价格、热度、版本、“已装/未装”和未勾选待办不代表今天的情况。本次只整理既有文档，没有重新联网调研、安装模块或验收玩法。

- **武器精通方向已校正**：最终由自有 mod 实现八种精通及已约定额外特性，上游只作参考。旧“装 wm5e、官方八种不自建”是代理误解，按[ADR-0006](../decisions/0006-weapon-mastery-scope.md)和[交付审计](2026-09-28-custom-module-delivery-adversarial-audit.md)修正；不是用户改变了目标。
- **掩护采购理由已校正**：`levelsautocover` 有 Midi-QOL 正式集成，不能再把“必然抢层”当拒绝理由。原 no-buy 保留为当时选择；中文覆盖也不足以单独构成订阅理由，详见[掩护调研与后续对账](2026-09-22-cover-automation-module-research.md)。
- **Vision5e 有后续限定验收**：Next 上 Vision5e＋Item Macro 的选定运行链已接受，见[第一版验收状态](2026-10-01-development-feedback-v1-verification-status.md)。这不自动改写 Mirror 健康矩阵，也不代表全光照、全感官或其他版本已验收；旧 A/B 待办不应整项重复执行。
- 其他采购、安装和旧待办仍需按精确目标对账；本次不把它们转成新的执行授权。

## 记录目的与复用方式

这份文件是可反复复查的决策记录 + 待办清单，不是一次性结论。下次再问"还有什么值得引入的付费模块"时：

1. 先读[第 4 节分层结论](#4-分层结论)和[第 5 节待办清单](#5-待办清单)，避免重复调研；
2. 再按[第 6 节复查清单](#6-复查清单每个新候选都要走这-8-步)对**新**候选逐条核实，通过后更新本文件对应层级；
3. 采购决定只在新候选清完第 6 节全部步骤之后做出。

评估背景：本项目自研 `fvtt-custom-conditions` + `fvtt-trigger-engine` + 生成器管线，`core` profile 生成的 JSON 不依赖任何第三方模块（[README.md](../../README.md)）。因此**"模块本身好不好"不是判据，"它的 ROI 能否覆盖本项目的验收成本"才是**。

---

## 1. 结论摘要（2026-09-22 快照）

| 层级 | 数量 | 结论 |
| --- | --- | --- |
| A. 零成本，只差验收 | 约 20 个 | **ROI 最高的一块**：已装/已免费持有但状态还是 `Untested` |
| B. 值得付费引入 | 4 个 | 填补文档承认的真实空白；建议等 server-next 版本定型后再采购 |
| C. 小成本试错 / 观察 | 3 个 | 功能独特但热度或维护风险偏高 |
| D. 不建议 | 若干类 | 与自有模块重叠、与 Midi-QOL/DAE 抢层、已死/已退役、需云/密钥、与版本锁冲突 |

一句话结论：**在花钱引入新付费模块之前，你们手里已经有一批免费或已付费的模块连本地验收都没做**——`server-mirror` 118 个模块里只有个位数不是 `Untested`（[foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md)）。先让已花的钱产生验收价值。

---

## 2. 必须先记住的三个事实校正

这三个是调研中核实出来的，与常见误解不同；不记住会重复付错钱：

| 误解 | 事实 |
| --- | --- |
| "The League of Extraordinary Foundry VTT Developers" 是售卖模块的 Patreon | 它是**免费开发者社区**（Discord + GitHub org，Foundry 员工 Cody Swendrowi 2021 年创立），无付费层级、不出售模块。组织内唯一 verified Foundry 14 的模块是 `scene-packer`（免费） |
| Better Roofs / Levels / Enhanced Terrain Layer 属于该 League | 分属不同作者且**全部免费**：Better Roofs 与 Levels 都是 TheRipper93 的免费模块 |
| Monk 有付费模块线；"Monk's Enhanced Environments" 存在 | **Monk 全系免费**（GPLv3 + Commons Clause，Patreon CA$5 是可选赞助）；Enhanced Environments 不存在 |

两个直接后果：

1. 你们 Lab 里的 `monks-*` 九个模块**已经是免费持有**，缺的只是验收。
2. **`levels` 已于 2026-04 退役**（功能被 Foundry 原生 Scene Levels 取代），生产侧也早已按原生 Scene Levels 关闭（[foundry-v14-local-optimization-log.zh-CN.md:32](../acceptance/foundry-v14-local-optimization-log.zh-CN.md)）。**这块不要再投入任何成本。**

---

## 3. 筛选标准（由本项目自身约束反推）

R1 **版本咬合**：manifest `minimum`/`verified`/`maximum` 与 `systems.dnd5e` 范围必须覆盖锁定目标。`maximum: 14` 的模块在升 v15 时直接拒绝加载；`minimum ≥ 14.365` 的模块（如 Tile Arsenal `14.365+`）装不上锁定的 14.364。
R2 **离线可验收**：安装时联网可接受（Patreon CDN 在赞助墙后），**运行期必须完全本地**。需要 The Forge / 云服务 / API key 的模块（如 Archive of Voices Pro 需自备 ElevenLabs key）一律排除。
R3 **签名保护可验性**：受保护包若在本地 Lab 被拒载（参照 `mcdm-flee-mortals-where-evil-lives` 2.0.1 "signature is invalid → authorization-environment untestable, do not bypass protection"，见 [foundry-v14-module-parity.md](../acceptance/foundry-v14-module-parity.md)），**不得当作已验收**，应降级或排除。
R4 **生成内容可移植**：生成的 Actor/Item JSON 永远不得需要某个模块才能工作（`core` profile 原则）。只增强 GM/玩家桌面体验的模块不受此限。
R5 **重叠度**：与自有模块（custom-conditions / trigger-engine / open-session-deck / forge-encounter）重叠，或与 Midi-QOL/DAE 抢同一层（situational bonus 字段、Active Effect、模板目标选择）的，拒绝或推迟。
R6 **验收成本**：每个新模块要付本地 E2E + 健康矩阵状态行 + handbook 条目/review/重生成 HTML + 双语文案。空白必须是项目文档承认的真实缺口才值得。
R7 **热度与维护**：中等热度（约 300–1,000 patrons），2025–2026 持续维护，距最近发布不超过 6 个月。
R8 **中文本地化成本**：en-only 意味着 lang 文件 + handbook 双语文案全是自己的工作量。免费本地化层 `ripper-mod-localizations` 只覆盖 TheRipper93 的 59 个模块 ID，且 README 明说社区+机翻、不保证母语审校（见第 6 节核实方式）。

---

## 4. 分层结论

以下保留原调研快照；武器精通与掩护按页首纠错。

### 4.1 A 层：零成本，只差验收（优先级最高）

| 模块 | 来源 | 填补的空白 | 备注 |
| --- | --- | --- | --- |
| `monks-tokenbar` | 已装，免费 | 玩家令牌条 / 请求骰 / XP 分配 | 全系唯一带 dnd5e 专用分支；官方简体中文 86%；已对 dnd5e 6.x 删除的 `disableExperienceTracking` 做版本守护；已知 `Assign XP, D&D 5E` bug 未关，**无 DMG p.82 遭遇乘数，XP 总数不是规则正确值** |
| `monks-combat-details` | 已装，免费 | 回合/轮次信息 | 14.03（2026-08）是 Combat 三件套中维护最及时的；已知"友方 NPC 被算作敌对影响 CR"未解决 → **不得作为 CR 依据** |
| `monks-scene-navigation` | 已装，免费 | 场景/层级导航 | Levels 退役后，它是原生 Scene Levels 的主要 UI 增强；14.368 改了 Level 默认顶部高程需回归；中文仅 51% |
| `monks-enhanced-journal` / `wall-enhancement` / `common-display` / `alwayshp` | 已装，免费 | 期刊/商店/任务、墙体编辑、共享视图、HP 显示 | Enhanced Journal 14.01（2026-09-14）最新；中文覆盖差（zh-tw 37% / 无） |
| `betterroofs` | **未装，已免费** | 屋顶/多层地图 | TheRipper93 2026-04 转免费；正对真实痛点，最便宜的一块 |
| `canvas3d-premium`（3D Canvas Advanced Tools） | **未装，已免费** | 地形/环境/镜头过场 | 已转免费；与 3D Canvas 免费主模块绑定 |
| `epic-rolls-5e`、`hover-distance`、`depth-blur`、`inactive-tokens`、`media-optimizer` | **未装，已免费** | 大成功骰、距离测量、景深、非活动 token、媒体优化 | 同批转免费，按需取 |
| `scene-packer`（League org） | 已装，免费 | 场景/冒险打包 | 唯一 verified Foundry 14 的 League 模块，与 JSON 生成器管线可能咬合 |
| `item-piles` / `itempilesdnd5e` | 已装，免费 | 掉落物/容器/商人 | 与 `swipe-vtt` 存在 `_onClickLeft2` libWrapper 重叠风险，需 A/B（[foundry-v14-module-compatibility.md:202](../acceptance/foundry-v14-module-compatibility.md)） |
| `jb2a_patreon` | 已装，**已付费** | 模板/特效 | 已花钱但 `Untested` |
| `fxmaster` / `psfx` / `dnd5e-animations` / `share-media` | 已装，免费 | 氛围特效栈 | 三选一定责，避免叠加；全部 `Untested` |
| `vision-5e` | 已装，免费 | 光照/视野 | `Untested`，只做过 A/B |
| `monks-active-tiles` | 已装，免费 | tile/region 交互触发 | 注意：MATT 对 v12+ 原生 Regions 集成为 0（源码 `region` 出现 0 次，两个相关 FR 未实现）——这既是选型边界，也是自研 trigger-engine 的机会 |
| `automated-conditions-5e` / `automated-evocations` / `auraeffects` / `tagger` / `tokenmagic` / `tile-scroll` / `z-scatter` / `scaleGrid` | 已装，免费 | 条件/光环/标记/特效 | 全部 `Untested`；作为自有条件系统的对照基准有价值 |
| `ripper-mod-localizations` | 免费模块 | TheRipper93 全系 59 个模块的中文层 | manifest：`https://github.com/theripper93/ripper-mod-localizations/releases/latest/download/module.json`；**机翻+无母语审校，装后要逐条抽查** |

**A 层中明确不再投入**：`levels`（已退役）、`monks-combat-marker`（停留 v12）、`monks-chat-timer`（依赖 2023 年停更的 `_chatcommands`）、`monks-little-details`（2026-09-11 未解决的 `[V14][dnd5e] Cannot create Effects or Enchantments` bug，正踩自定义条件系统语义域，**最该缓装**）。

### 4.2 B 层：值得付费引入（4 个）

**B1. Crafting Console（MetaMorphic Digital Studio，买断 US$9.99）— 首选**
- 功能：完整合成系统，Recipe 物品类型、tag-based 组件、配方登记表跨 compendium 聚合。
- 契合点：本项目"合成/downtime"是完全空白区。
- 兼容证据（manifest 实测）：`{minimum:"13.351", verified:"14"}`，`systems.dnd5e {minimum:"5.3.3"}`，`requires: []`。
- 优势：**买断制、无订阅、无 Forge 依赖**，最适合离线 Lab 验收。
- 代价：无中文。

**B2. Enhanced Inventory（The Final Artificer，€6.5/月，793 patrons）**
- 功能：把背包页换成空间网格——物品有真实宽高、容器子网格、盔甲口袋、超容物品移出负重计算。
- 契合点："掉落物/负重"是文档承认的完全空白（自有 14 个模块无一覆盖，生成侧也明确不添加来源未声明的负重）。
- 兼容证据：官方页明写 **"dnd5e (Tested on 5.3.3)"**（已亲自核实），`13+ (Verified 14)`，2026-09-21 更新。
- 代价/风险：整页替换背包 UI，与其它 grid-inventory 类互斥；与 `tidy5e-sheet` 共存未验证；无中文。

**B3. Mindful Encounters（3 Death Saves，CA$5.5 档，399 patrons）**
- 功能：把地城探索从先攻里拆出来——每 token 移动预算，全员 Done 后世界时钟跳一格"地城回合"。
- 契合点：目前唯一专为 Foundry v14 写的探索回合制；与 `forge-encounter` 的固定能力库是相邻层，不重叠。
- 兼容证据：`14+ (Verified 14.367)`，与 14.368 咬合最好；2026-09-18 前后更新。
- 附加价值：同档一次拿到 Tenacity / Minstrel / Peddler / Bondsmith，只需其中一个也划得来。

**B4. TheRipper93 premium（€10/月）— 有条件**
- 发布者是最主流大户（约 18.5k patrons），按"避开大热"原则本应排除；**原调研把 zh-hans 覆盖作为候选理由**；中文层本身不能证明功能可用，也不足以单独支持订阅。掩护类已有其他中文来源，见[掩护调研](2026-09-22-cover-automation-module-research.md)。
- 若重视中文桌面，取 `mastercrafted`（合成）、`token-notes`、`gatherer`、`dynamic-soundscapes`、`progress-tracker`。
- `combat-tracker-dock` / `party-monitor-dock` 与自有 `open-session-deck` 重叠，不取。

### 4.3 C 层：小成本试错 / 观察

**C1. Weapon Mastery Effects Reminder（FutureHax，$3/月起，74 patrons）— 已判定不 buy**
2024 武器精通效果的付费模块（Sap/Slow/Vex 挂 AE、Graze 伤害、Cleave/Nick 额外攻击、命中门控），Forge 标记 `premium: protected`，入口是 Patreon early access 帖；`13 - 14 (Verified 14)`，明写 dnd5e only，仅英语，v1.3.2，2026-08-18 首次发布，Forge 安装记录 0。
- 设计取向：**不自动结算**。它把掌握面板注入发起的骰卡（或跟发一张独立卡），用原生 Apply/Effects 托盘执行，命中/未命中只做门控。
- 2026-09-22 复核修正：原文"唯一实现 2024 武器精通"**只对付费模块成立**。免费替代品 `wm5e` 在原补录前未被本文件评估（“零命中”是当时扫描，不是当前仓库状态），见下方 C1-附。
- 项目选择：**不 buy，保留自有实现方向**。下方免费替代调研提供参考，不代表改装 wm5e 就完成交付；当前方向见 [ADR-0006](../decisions/0006-weapon-mastery-scope.md)。

### C1-附：免费替代 `wm5e` 与版本咬合（2026-09-22 补录）

| 项 | `wm5e`（Automated Masteries 5e，thatlonelybugbear） |
| --- | --- |
| 价格 | **免费开源**（GitHub + Forge，无 premium 标记） |
| 覆盖 | 官方 8 种全实现，且**默认可自动结算**：Graze 未命中即触发、Push/Sap/Topple 命中即挂、Cleave/Slow/Vex 走伤害阶段；另有命中门控、Shift+左键绕过、NPC 开关、自定义武器 key → compendium UUID 映射 |
| 硬依赖 | `automated-conditions-5e`（同一作者，manifest `requires` 写死） |
| 热度 | GitHub 43 个 release 累计下载 153,992；Forge 安装份额 **0.4339**（同期 `dae` 34.15 / `midi-qol` 28.39 / `automated-conditions-5e` 3.22）→ **小众模块，不能假设用户已装** |
| 版本 | `v14.533.6`：Foundry ≥14（verified 14.365）、dnd5e 5.3.0–6.0.0（verified **5.3.3**）、requires AC5E ≥14.533.1 |

**版本咬合**：本地 Lab 已装的 `automated-conditions-5e 14.533.7.2` manifest 写着 minimum 14 / **verified 14.364** / dnd5e 5.3.0–6.0 / **verified 5.3.3**，与本文件锁定的 `14.364 + 5.3.3` 逐字命中。这只说明原目标下有安装候选，不能证明玩法可用或准确估算验收成本，也不改变本项目自有实现方向。

**两条必须一起记住的校正：**

1. "依赖第三方违反 core profile 原则"**用错了地方**。D 层最后一条禁的是"生成内容必须带某模块 flag 才能生效"；`wm5e` 读的是官方原生 `system.mastery` / `system.traits.weaponProf.mastery`，生成物零改动即可被驱动。该原则不反对 `wm5e`，也不反对 FutureHax。
2. `wm5e` **写不进 v12**（最低 Foundry 13 / dnd5e 5.1.0），而 v12 是本仓库 README 的默认目标，且 dnd5e 4.3.9 的攻击卡不显示掌握名。这只能说明该第三方候选不覆盖原 v12 目标；本项目支持状态需另查当前矩阵和业务验收，不能据此宣布全部精通自动化零覆盖。

**C2. Archive Creature Brewer（Shadowdrake Creations，$4.25/月起，494 patrons）**
Foundry 原生怪物编辑器，分步工作流 + 实时 statblock 预览，Feature/spell 库覆盖 SRD 2014 + 2024，产物存为 blueprint 可导出 actor。
- 定位问题：它是"手工编内容"，与本项目"来源证据管线"是竞争关系；只适合当 homebrew 内容的手工校对工具。低优先。

**C3. Peddler（3 Death Saves，CA$5.5 档）**
把购物变成互动遭遇：对话树、砍价、库存、补货 schedule。只有你们确定要做"互动交易遭遇"才值。

### 4.4 D 层：不建议（含原因分类）

| 模块 / 类别 | 原因 |
| --- | --- |
| DFreds Status Effects / Triggers 作为运行时依赖 | 与自有 trigger-engine + custom-conditions 三重重叠；与 Midi-QOL/DAE 同层胶水，同装会重复触发。免费版 Convenient Effects 只配作 A/B 基准 |
| Monk's Little Details | 2026-09-11 未解决的 `[V14][dnd5e] Cannot create Effects or Enchantments` bug，正踩条件系统语义域 |
| Situational Shortcuts / Volumetric Templates（TheRipper93） | 原调研记录的 situational bonus／模板选择重叠风险；需要具体接口与运行证据，不能仅凭同层就宣布冲突 |
| Automatic Cover Calculator（`levelsautocover`） | 保留原 no-buy，但撤回“与 Midi-QOL 必然抢层”理由；它有正式集成，免费候选已满足当时重点需求。额外能力与版本边界见[掩护调研](2026-09-22-cover-automation-module-research.md) |
| Enhanced Terrain Layer（IronMonk v10.09，2023-05） | 已死；改用核心 Regions（v12+）+ movement cost 行为 |
| Monk's Combat Marker / Chat Timer | 停留 v12 / 依赖停更库 |
| `combat-tracker-dock` / `party-monitor-dock` / Archive GM Drawer | 与自有 `open-session-deck` 重叠 |
| 需云/API key 的（Archive of Voices Pro 等） | 违反离线 Lab |
| `maximum: 14` 或 `minimum ≥ 14.365` 的模块 | 与当前版本锁冲突，升级/降级时直接拒载 |
| 任何需要生成内容带其 flag 才能生效的模块 | 违反 `core` profile 可移植性原则（[README.md](../../README.md)） |

---

## 5. 待办清单

以下是原待办；执行前对账，不是本轮新任务。

> 状态口径与 [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md) 一致：只有跑过本地 E2E 且人工核对过语义，才能把 `Untested` 改掉。

### 5.1 立即可做（零成本，本地 Lab `fvtt-v14-module-matrix`）

- [ ] `monks-tokenbar` 单独装 + dnd5e 请求骰/XP 边界 A/B；记录"无遭遇乘数"边界
- [ ] `monks-combat-details` 验收；在矩阵里标注"友方 CR bug → 不作 CR 依据"
- [ ] `monks-scene-navigation` 验收；含 14.368 Level 默认高程变更回归
- [ ] `betterroofs` 新装验收（免费，补屋顶/多层地图）
- [ ] `canvas3d-premium` 新装验收（免费）
- [ ] `scene-packer` 与 JSON 生成器管线咬合验证
- [ ] `item-piles` + `itempilesdnd5e` 与 `swipe-vtt` 的 `_onClickLeft2` 重叠 A/B
- [ ] `fxmaster` / `psfx` / `dnd5e-animations` 氛围栈三选一定责，避免叠加
- [ ] `vision-5e` 原光照/视野 A/B：Next 已有后续限定验收，见上方整理说明；只核仍缺的目标或行为，不重跑已成立的运行链
- [ ] `monks-active-tiles` 验收；记录"对原生 Regions 集成为 0"作为自研 trigger-engine 的机会证据
- [ ] `ripper-mod-localizations` 安装 + 抽查 zh 字符串质量（母语者核对前不得声称中文可用）
- [ ] `jb2a_patreon` 补验收（已付费未验收是纯浪费）

### 5.2 等版本定型后再决定（付费）

- [ ] 待 server-next 目标（Foundry `14.368` + dnd5e `6.0.x`）定型后，再评估 B1 Crafting Console / B2 Enhanced Inventory / B3 Mindful Encounters——**现在采购等于每个模块验收两次**
- [ ] 定型后按第 6 节重跑 B 层候选的版本与 dnd5e 证据（dnd5e 6.0.3 已于 2026-09-17 发布，要求 Foundry 14.367+）

### 5.3 需用户决策

- [x] 武器精通实现归属：**已明确八种精通及已约定额外特性由自有 mod 实现，上游只作参考**，见 [ADR-0006](../decisions/0006-weapon-mastery-scope.md)。勾选表示方向已定，不表示全部功能已完成或已进入 master；不再重新询问 buy vs build。
- [ ] 是否订阅 TheRipper93 premium：仅当有已确认的独特功能需求时再决定；zh-hans 覆盖不能单独作为理由
- [ ] 若引入 en-only 模块，是否由本项目承担其 zh lang 与 handbook 双语文案

---

## 6. 复查清单：每个新候选都要走这 8 步

1. **版本**：读目标 release 的 manifest，记录 `minimum`/`verified`/`maximum` 与 `systems.dnd5e` 范围；`maximum` 低于目标版本或 `minimum` 高于锁定版本 → 直接拒。
2. **新鲜度**：GitHub Releases / 包页最近发布时间；超过 6 个月未更 → 降为观察。
3. **dnd5e 证据**：官方页 Compatibility 是否写明 tested on `5.3.3`+ / `6.x`；没有 → 按 `Untested` 口径记录，**不得凭"应该支持"放行**。
4. **热度**：Patreon patron 数或安装量；约 300–1,000 视为中等热度，>2,000 需说明独特价值才列入。
5. **冲突面**：`relationships` 声明；是否碰 dnd5e situational bonus / Active Effect / 模板目标选择（Midi-QOL/DAE 领地）；是否与自有模块重叠。
6. **中文**：查本地化仓是否存在对应条目（2026-09-22 实测命令）：
   ```bash
   curl -s "https://api.github.com/repos/theripper93/ripper-mod-localizations/contents/translations/<module-id>" \
     | grep -o '"name": "zh-hans.json"'
   ```
   不存在 → 把自行翻译成本计入决策。
7. **签名/授权**：确认本地 Lab 能否离线加载受保护包；不能 → 不得当作已验收（不得绕过保护）。
8. **记录**：通过后写入 [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md) 状态行、更新 handbook，并回填本文件对应层级与待办勾选。

---

## 7. 数据来源与可信度

| 来源 | 用途 |
| --- | --- |
| `foundryvtt.com` 包页（逐个模块 Compatibility / Purchase / 描述段） | 版本声明、dnd5e tested 版本、获取方式 |
| Patreon 公开 campaign API | 档位价格与 patron 数（热度主信号） |
| 各模块 GitHub Releases 与 `module.json` | 版本、发布日期、`min/verified/maximum`、`systems.dnd5e`、`languages` |
| dnd5e `release-6.0.3` 源码（`settings.mjs`/`migration.mjs`/`actor/data/...`） | 6.x 兼容性实证（`disableExperienceTracking` 已删除、`details.xp.value` 保留、无遭遇乘数逻辑） |
| `github.com/theripper93/ripper-mod-localizations` | 免费中文层覆盖范围（59 个模块，`zh-hans.json` 实测存在） |

**本人亲自复核过的两条**：TheRipper93 翻译仓的 zh-hans 覆盖（GitHub API 逐目录确认）；Enhanced Inventory 官方页 "dnd5e (Tested on 5.3.3)" 声明。其余为调研代理从一手来源抓取，尚未逐条复核。

**局限**：调研环境无法访问 Reddit / DuckDuckGo / Brave 等社区源，冲突判断主要依据模块自身文档声明；patron 数与价格随时间变化，采购前按第 6 节重核。

---

## 8. 交叉引用

- [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md)：模块状态矩阵（本文件的待办状态口径）
- [foundry-v14-module-compatibility.md](../acceptance/foundry-v14-module-compatibility.md)：共存的已知冲突
- [foundry-v14-module-parity.md](../acceptance/foundry-v14-module-parity.md)：exact-version 与受保护包口径
- [current-support-matrix.md](../acceptance/current-support-matrix.md)：当前支持边界
- [worktree-development.md](../runbooks/worktree-development.md)：本记录的载体与发布流程
- [handbook-maintenance.md](../runbooks/handbook-maintenance.md)：新模块进入手册的门禁
- [2026-09-18-custom-conditions-trigger-engine-replan.md](../plans/2026-09-18-custom-conditions-trigger-engine-replan.md)：自有条件/触发引擎的边界（判断重叠度的依据）
- [fvtt-custom-conditions/README.zh-CN.md](../../foundry-modules/fvtt-custom-conditions/README.zh-CN.md) 与 [fvtt-trigger-engine/README.zh-CN.md](../../foundry-modules/fvtt-trigger-engine/README.zh-CN.md)：两个自研模块的当前能力与边界
