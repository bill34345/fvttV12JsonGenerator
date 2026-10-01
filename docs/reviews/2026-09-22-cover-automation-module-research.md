# 掩护（Cover）自动化模块调研：Automatic Cover Calculator 与同类

- 记录日期：2026-09-22
- 评估目标环境：Foundry `14.364` / dnd5e `5.3.3`（原调研锁定）；server-next 迁移目标 Foundry `14.368` / dnd5e `6.0.x` 仍 `IN_PROGRESS`；v12 默认目标 dnd5e `4.3.9`
- 本文件中"本地化"指**纳入本项目本地 Foundry Lab 并通过离线验收**，与商业发行无关
- 触发原因：用户要求重新调研 **Automatic Cover Calculator** 及同类功能模块（付费/免费均计）。该模块在
  [2026-09-22-paid-module-evaluation.md](2026-09-22-paid-module-evaluation.md) D 层被判"不建议"，本次调研**推翻其中一条理由**，
  但**不改变 buy/no-buy 结论**——理由换了，见[第 3 节](#3-事实校正四条)。

## 2026-10-01 整理说明：旧补丁判断已有后续替代

本文件保留 9/22 调研与 9/23 补录；下方“最新版”、价格、安装状态及待办均为原时点，不能直接作为今天的执行清单。本次只核对已有文档，没有联网刷新、修改模块、运行并发测试或改变健康矩阵。

| 原记录 | 后续已有记录 | 本次处理 |
| --- | --- | --- |
| 2.2.1／2.2.2 未修复近同时掩护写入竞态，需要移植旧补丁 | [9/26 正式版与旧补丁对照](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-26-server-next-official-replacement-and-local-patches.md)记录作者 2.2.3 已按 Actor UUID 用 `Semaphore(1)` 串行处理，决定不叠加旧补丁 | 保留对旧版本的调查；撤销把“必须移植补丁到 2.2.2”当作 Next 下一步 |
| Next 尚待安装 Simple Cover | [9/27 来源与安装记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration/docs/reviews/2026-09-27-server-next-cover-token-source.md)记录作者 2.2.3 的安装、启用和客户端读回 PASS | 不再重复安装；这个 PASS 不代表全部掩护玩法、并发行为或 Midi-QOL 组合都已验收 |
| Mirror 健康矩阵仍列 2.1.3／Untested，旧补丁已有部分验收 | 原健康矩阵和 Mirror 补丁证据属于另一个目标，与 Next 安装不是同一层 | 保留“核对 Mirror 行及证据”的缺口；不能用 Next 状态覆盖 Mirror，也不改成无范围限制的 OK |

上方两个后续文件仍位于原迁移工作树，本次没有把它们整合进 master。采购选择保持原 no-buy；如以后出现付费候选独有需求，再依当次范围判断。武器精通则已有不同的产品决定：自有实现，上游参考，不能从“存在免费替代”推导实施归属。

## 记录目的与复用方式

下次再问"掩护/掩体自动化有什么模块值得装"时：

1. 先读[第 2 节结论摘要](#2-结论摘要)和[第 6 节分层结论](#6-分层结论)，避免重复调研；
2. 新候选按[第 9 节 8 步清单](#9-复查清单每个新候选都要走这-8-步)逐条核实；
3. 采购/安装决定只在新候选清完全部 8 步之后做出。

---

## 1. 一句话结论

**免费模块 `simplecover5e` 已满足本项目当时关注的主要掩护需求，因此保留原 no-buy**；这不表示付费 `levelsautocover` 没有独有能力（见 5.2／6.2）：
同样的 midi-qol 一等公民集成、本项目自己打过并发补丁并有语义验收记录、有正确术语的中文层、零采购成本。
付费模块维持 **no-buy**，但旧文档给出的"与 Midi-QOL 抢层"理由是**错的**——midi-qol 官方就集成它。

---

## 2. 结论摘要

| 模块 | 价格 | 最新版 / 日期 | 结论 |
| --- | --- | --- | --- |
| `simplecover5e`（Simple Cover 5e） | **免费 MIT** | 2.2.2 / 2026-09-10 | **首选**。已本地打补丁 + 有验收证据，但健康矩阵状态行没反映，需回填 |
| `levelsautocover`（AutoCover - Automatic Cover Calculator） | **Patreon €10/月起** | 4.0.1 / 2026-05-14 | **维持 no-buy**，理由改为"免费替代品覆盖同等价值"；已订 TheRipper93 premium 则可作 A/B 基准 |
| `tokencover`（Alternative Token Cover） | 免费 MIT | 0.10.2 / 2026-04-08 | **观察**。三种算法有独特价值，但 13 个 open issue、verified 13.351 未验证 14 |
| `simbuls-cover-calculator`（Simbul's Cover Calculator） | 免费 MIT | 2.1.1 / **2024-09-04** | **D 层**。停更 2 年，2014 规则攻击者侧罚值，不处理 Dex 豁免 |
| `aedifs-tactical-grid` | 免费 GPL-3.0 | 2026-06-23 | **暂不**。与已装 `hover-distance` / `easy-target` 功能重叠 |

---

## 3. 事实校正（四条）

这四条是本次调研核实出来的，与项目文档现状不同；不记住会重复判错。

### 3.1 模块真名是 `levelsautocover`，旧文档只记了商品名

旧文档写作"Automatic Cover Calculator（TheRipper93）"，但 Foundry 包 id 是 **`levelsautocover`**，
manifest `title` 现为 **"AutoCover - Automatic Cover Calculator"**（v2.1.0 改名，原为 "Levels - Automatic Cover Calculator"）。
只用商品名检索会漏掉它——本次第一轮 `foundryvtt.com/packages/automatic-cover-calculator` 就是 404。

manifest 实测（`https://r2.foundryvtt.com/packages-public/levelsautocover/module-4.0.1.json`）：

```json
{
  "id": "levelsautocover",
  "title": "AutoCover - Automatic Cover Calculator",
  "version": "4.0.1",
  "languages": [{ "lang": "en", "path": "lang/en.json" }],
  "compatibility": { "minimum": "14", "verified": "14", "maximum": "14" },
  "protected": true
}
```

- **`protected: true`**：Patreon 独占包，安装需订阅（theripper93 Patreon，**18,551 patrons**，
  月 pledge 合计约 US$40,397；档位 Free €0 / Supporter €10 / Early Access €12.5 / Master €20 / Creator €50）。
  changelog 明写 AutoCover 需"any tier equal to or above Tip!"，即最低 €10/月。
- **无 `systems` 声明、无 `relationships`**：全系统可用，Active Effect 仅 dnd5e。官方页描述
  "Preconfigured for dnd5e but works with all systems"。
- **仅 en 语言**，自带 `packs/autocovermacros` 宏包。
- v2.1.0 起**不再依赖 `levels`**（Levels 已于 2026-04 退役，此模块已解耦）。

### 3.2 旧文档 D 层对它的"冲突"判断是错的

旧文档 D 层原文：*"Situational Shortcuts / Volumetric Templates / Automatic Cover Calculator（TheRipper93）| 抢
Midi-QOL/DAE 已占的 situational bonus 字段与模板目标选择，冲突概率最高"*。

实测 midi-qol **v14.0.11（正是本地 Lab 已装版本）** 源码
（`gitlab.com/tposney/midi-qol`，注意 midi-qol 主仓在 GitLab，GitHub 的 `tposney/midi-qol` 已 archived 2024-02）：

- `optionalRules.coverCalculation` 的可选项里，`levelsautocover` 是**与 `none` 并列的一等公民分支**，
  且 midi-qol 自己把 AutoCover 的 `rawCover` 百分比映射成 `FULL_COVER(999)` / `THREE_QUARTERS_COVER(5)` /
  `HALF_COVER(2)`，再读 AutoCover 的 5 个设置（`tokensProvideCover`/`ignoreFriendly`/`copsesProvideCover`/
  `tokenCoverAA`/`coverRestriction`）作为计算参数；
- `optionalRules.wallsBlockRange` 也有 `levelsautocover` 分支，用于全遮蔽/视线阻挡判定；
- 集成条件是 **`game.settings.get("levelsautocover", "apiMode")` 为真**——即 AutoCover 切到 Library 模式后
  自己不挂效果，把掩护的显示与处理完全交给 midi-qol。**分层是显式声明的，不是抢层。**

DAE 侧无冲突：`gitlab.com/tposney/dae` v14.0.14 的 `module/` 下**没有任何 cover 相关文件**。

**但同一行里的另外两个模块判断仍成立**：Volumetric Templates 做 3D 模板目标选择，与 midi-qOL 的模板选择确实同层
（midi-qol 的日文本地化里明写"模板による目標選択に Volumetric Templates を用います"）；Situational Shortcuts 同理。
**建议把这一行拆开**：ACC 移出 D 层（按新理由单独处置），Volumetric Templates / Situational Shortcuts 留在 D 层。

### 3.3 dnd5e 5.x/6.x 原生就有掩护状态和算术——模块只负责"判定挂哪个状态"

这是本次调研最重要的架构事实，直接决定重叠度判断（R5）：

```js
// module/config.mjs
DND5E.statusEffects = {
  coverHalf:          { name: "EFFECT.DND5E.StatusHalfCover",          order: 2, exclusiveGroup: "cover", coverBonus: 2 },
  coverThreeQuarters: { name: "EFFECT.DND5E.StatusThreeQuartersCover", order: 3, exclusiveGroup: "cover", coverBonus: 5 },
  coverTotal:         { name: "EFFECT.DND5E.StatusTotalCover",         order: 4, exclusiveGroup: "cover" }
}

// module/documents/actor/actor.mjs
get coverBonus() {
  const { coverHalf, coverThreeQuarters } = CONFIG.DND5E.statusEffects;
  if ( this.statuses.has("coverThreeQuarters") ) return coverThreeQuarters?.coverBonus;
  else if ( this.statuses.has("coverHalf") ) return coverHalf?.coverBonus;
  return 0;
}
```

系统侧消费点（均为 master 源码实测）：

- AC 推导 `module/data/actor/templates/attributes.mjs`：`ac.cover = Math.max(ac.cover, this.parent.coverBonus)`，
  最终 `ac.value = max(ac.min, ac.base + ac.shield + ac.bonus + ac.cover)`；
- Dex 豁免推导 `module/data/actor/templates/common.mjs`：
  `const cover = id === "dex" ? Math.max(ac?.cover ?? 0, this.parent.coverBonus) : 0;`，计入 `abl.save.bonus`。

**推论**：

1. 掩护模块的职责边界是**几何判定 + 挂 dnd5e 原生状态**，+2/+5 算术在系统里。这与"自己算 bonus 塞进 roll"是两种设计，
     判断冲突面时要分清。
2. **与自有 `fvtt-custom-conditions` / `fvtt-trigger-engine` 零重叠**：simplecover5e 写的
      `dnd5ecoverHalf` / `dnd5ecoverTotal` 是 dnd5e 原生状态 id（项目本地日志里出现的
      `dnd5ecoverTotal0` / `dnd5ecoverHalf00` 是该模块自带的数字后缀生成 id），不新增自定义条件语义域。
     这正好落在旧文档 R5 允许的一侧。
3. **dnd5e `4.3.9`（v12 默认目标）没有 `coverBonus`**——实测 `4.3.9` / `4.3.0` / `3.3.1` 三个 tag 的
      `actor.mjs` 中 `coverBonus` 出现 0 次。**v12 目标上掩护自动化目前零覆盖**，与 `wm5e` 的精通自动化同构。

### 3.4 中文层：`zzz_mod_chn` 术语正确，`ripper-mod-localizations` 术语错误

两个免费中文层都覆盖掩护模块，但质量相反：

| 中文层 | 覆盖 | 术语 | 判断 |
| --- | --- | --- | --- |
| `zzz_mod_chn`（Memorize-Remix，**本地已装、健康矩阵状态 OK**） | `levelsautocover`(40 键) / `simplecover5e`(135 键) / `tokencover`(137 键) / `simbuls-cover-calculator`(192 键) **四个全有** | **正确**：全身掩护 / 半身掩护 / 四分之三掩护 / 无掩护 / 下蹲 | **本地 Lab 应使用这一层** |
| `ripper-mod-localizations`（theripper93） | `translations/levelsautocover/zh-hans.json`（40 键，与 en 同数） | **错误**：cover → "封面"（书面义）、Duck → "鸭子"（动物） | 覆盖全但**机翻未校**，正好踩中旧文档 R8 的警告 |

**结论**：本地 Lab 的中文掩护桌面走 `zzz_mod_chn`（已装、状态 OK、术语正确），
`ripper-mod-localizations` 只在它没覆盖的模块上用。旧文档把"免费 zh-hans 覆盖 TheRipper93 59 个模块"
当作订阅 TheRipper93 premium 的唯一理由——**对掩护这个具体场景该理由不成立**。

---

## 4. 项目本地已有证据（simplecover5e 不止 `Untested`）

[foundry-v14-local-optimization-log.zh-CN.md:493-529](../acceptance/foundry-v14-local-optimization-log.zh-CN.md) 记录：

- 本地 `server-mirror` 的 `simplecover5e` 已从上游 `2.2.0` 修订为 **`2.2.0-cor-cotn.1`**；
- 根因：多个攻击/豁免 Hook 并发调用 `void setCoverStatusViaGM(...)` 更新同一 Actor，
  "状态不存在 → 创建固定 id ActiveEffect"非原子，可能重复创建 `dnd5ecoverTotal0`；
- 修订：按 Actor UUID 串行执行掩护状态写入，不同 Actor 仍并行；
- 验收：10 次并发全掩护写入全部成功且只产生 1 个 `dnd5ecoverTotal0`；恢复无掩护后 AE 数回 0、
  原有 `poisonous` 保留；Node 回归 `4 pass / 0 fail`；一次正常刺剑攻击+伤害到达 `WorkflowState_Completed`；
  重载后 MIDI Workflow Map 回 0、Console error 0。

**这意味着健康矩阵里 `simplecover5e | 2.1.3 | Untested` 这一行同时错在版本和状态上**：实际运行的是
`2.2.0-cor-cotn.1`，且已有针对性语义验收（虽非完整长时会话验收）。

### 4.1 上游是否已修复该并发问题？——**没有**（2026-09-23 补录，源码级核实）

对 `2.2.0` 与 `2.2.2` 的同名文件逐字 diff：

- `scripts/cover/status.mjs`：**只改了注释、JSDoc 类型标注、`console.warn` → `log()`**；
  `_applyCoverStatus()` 函数体**逐字未变**，仍是 `if (actor.statuses.has(desiredStatusId)) return;` 之后的
  `await actor.toggleStatusEffect(...)`——check-then-act，**非原子**；
- `scripts/cover/automation.mjs`：3 个调用点仍是 **`void setCoverStatusViaGM(...)`**（发射后不管），
  与 2.2.0 完全一致（仅行号位移）。
- 2.2.1 的三个修复（黑暗光源不再挡掩护、墙视线检测不再依赖攻击者视野、跨 Level 窄条误判）与
  2.2.2 的 dnd5e 6.0.0 适配**都与此无关**。
- 上游 issue 列表无"重复 ActiveEffect / 并发"相关条目（#26 "cover applied twice" 是 midi-qol 集成下
  加值重复施加，另一回事，已关）。**该 bug 是项目自己发现的，上游大概率不知情。**

`actor.statuses` 是客户端内存 Set，只在服务端往返完成后更新；N 个并发调用会同时看到"无此状态"，
随后并发执行 `toggleStatusEffect`。dnd5e 的 `toggleStatusEffect` 会走到 Foundry 核心实现
（cover 状态不带 levels，不进 `ConditionData._applyDelta`），核心实现按状态派生 `_id` 创建 ActiveEffect
（本地日志中的 `dnd5ecoverTotal0` / 上游 README RSReforged 段中的 `dnd5ecoverHalf00` 即此形态），
第二次创建抛 `already exists within the parent collection`。dnd5e 侧还有 `exclusiveGroup: "cover"` 的
连带清理（`deleteEmbeddedDocuments` 同组其它状态），并发下会额外制造写入churn。

**当时结论（仅针对 2.2.2）：本地补丁仍需移植**；后来 2.2.3 的替代决定见页首，不把此句用于新版，不能因"上游发了新版"就丢弃。由于 2.2.2 的
`status.mjs` 与 2.2.0 语义相同，移植面很小。

---

## 5. 四个候选逐条 8 步核实

> 步骤定义见[第 9 节](#9-复查清单每个新候选都要走这-8-步)。"本地"指本地 Lab `14.364 + dnd5e 5.3.3`。

### 5.1 `simplecover5e` — Simple Cover 5e（Peterlankton / GitHub Kapuzenjoe，MIT）

| 步骤 | 结果 |
| --- | --- |
| 1 版本 | manifest 2.2.2：`minimum 14 / verified 14 / **maximum 14**`；`relationships.systems[0]` 存在但 `compatibility` 为**空对象**（未声明 dnd5e 版本范围）。README badge 写 `Dnd5e-v5.3`；**2.2.2 release note（2026-09-10）明写"Initial support for D&D System Version 6.0.0"** |
| 2 新鲜度 | 2.2.2 = 2026-09-10，仓库 push 2026-09-15。**活跃** |
| 3 dnd5e 证据 | 官方页 dnd5e 徽标 5.3 与 6.0；release note 自述 6.0.0 初始支持（适配重做的 chat message workflow、豁免掩护解析、目标 AC 显示）。**6.x 证据强于其它三个候选** |
| 4 热度 | 6 stars / 1 fork / 2 open issues；GitHub releases 累计 **128,730** 次下载（latest 的 module.json 被拉 3,975 次）。小众但真实在用 |
| 5 冲突面 | 写 **dnd5e 原生状态**（见 3.3），与自有条件系统零重叠；Midi-QOL **官方集成 v13.0.30+**；RSReforged 部分兼容（已知 chat log 关闭时副作用）；与 `wall-height` 有 V14 兼容修复史（2.1.2 修 #36） |
| 6 中文 | `zzz_mod_chn` 135 键，术语正确 |
| 7 签名/授权 | `protected` 未设置，GitHub releases 直下，**离线可装可验** |
| 8 记录 | 已有补丁+验收记录，但健康矩阵行需更新（见第 7 节待办） |

**规则实现深度**（GitHub Wiki `Cover-Rules` 实测）：

- 三段式：几何结果（`none`/`half`/`threeQuarters` → 0/2/5，`total` 奖励为 `null`）→ 可选墙视线检测提升为 total → 规则修正；
- 覆盖 2024 规则：**目标侧 +2/+5**（AC 与 Dex 豁免），多目标支持；
- DMG 视线规则：方格网选最优攻击者角→目标四个内缩角；六角 1–3 线挡→半掩护、4+→四分之三；无网格方形四角；无网格圆形 8 点周长采样（1–5→半、6+→四分之三）；
- 阻挡 token 按 **Foundry V14 原生 token depth** 当 3D 棱柱；隐藏/灵体/死亡/0 HP 生物忽略；
- **忽略掩护专长**：Sharpshooter（`rwak`）、Spell Sniper（`rsak`）、Wand of the War Mage（仅 `rsak`/`msak` 且恰好半掩护、需装备+调谐）、Sacred Flame（豁免忽略掩护）、legacy `ignoreCover` 物品属性；
- Actor flag（分 `.all`/`.attack`/`.save`，源侧 `ignoreAllCover`/`ignoreThreeQuartersCover`/`ignoreHalfCover`/`downgradeCover`，目标侧 `upgradeCover`）；
- 设置项：`losCheck`（墙视线失败→total）、`creaturesHalfCoverOnly`、`ignoreFriendly`、 prone 模式可当简化下蹲机制；
- **Library Mode API**：`api.getCover({attacker, target, scene, losCheck, activity})`，不挂 AE、不改骰——
  midi-qol 的 `simplecover5e` 分支正是走这个；
- 2.2.0 新增 **Cover Obstacle Regions**（Region Behavior 让 Region 像生物一样挡掩护线，可配 Size/Creature Type 豁免与 Interior Block Distance）——与项目关注的原生 Regions 方向一致；
- 2.2.1 修：黑暗光源不再错误挡掩护（规则上黑暗不给掩护）；墙视线检测不再依赖攻击者自身视野状态；跨 Level 窄条误判；
- 2.1.1 起 AoE 模板豁免从**模板原点**算掩护（"energy erupts from the point of origin"）。

### 5.2 `levelsautocover` — AutoCover - Automatic Cover Calculator（TheRipper93，Patreon €10/月起）

| 步骤 | 结果 |
| --- | --- |
| 1 版本 | manifest 4.0.1：`minimum 14 / verified 14 / maximum 14`；**无 `systems` 声明**；`protected: true` |
| 2 新鲜度 | 4.0.1 = **2026-05-14**（r2 manifest Last-Modified）。4.0.0 "Updated to v14"，4.0.1 "Fixed cover not calculating correctly with 3D Canvas" |
| 3 dnd5e 证据 | 官方页"Preconfigured for dnd5e but works with all systems (Active Effects dnd5e only)"——**没有 tested-on 版本声明**，按旧文档口径记 `Untested` |
| 4 热度 | 作者整体 18,551 patrons；模块本身无独立热度信号。按旧文档 R7（>2,000 需说明独特价值）属大热例外档 |
| 5 冲突面 | **与 midi-qol 是官方集成不是冲突**（见 3.2）；DAE 无关；自有模块无关 |
| 6 中文 | `zzz_mod_chn` 40 键（正确术语）；`ripper-mod-localizations` 40 键（错误术语） |
| 7 签名/授权 | `protected: true` + Patreon 墙。本地 Lab 能否加载需按 R3 实测；**在验证前不得当作已验收** |
| 8 记录 | 未通过，不入健康矩阵 |

**功能差异点（simplecover5e 没有的）**：

- 计算**精确掩护百分比**（`rawCover`），而非离散的半/四分之三；
- **Ducking（下蹲）**机制——玩家可主动蹲下降低被掩护判定高度；simplecover5e 只用 prone 模式近似；
- **败亡敌人按降低高度充当掩护**（`tokensProvideCover` 等设置）；
- 全系统可用（只显示文本，不依赖 dnd5e）；
- 精度可调（`coverRestriction`）。

**midi-qol 侧映射逻辑**（v14.0.11 实测）：`rawCover === 0` → total；`> coverDetail[1].percent` → 0；
`< coverDetail[0].percent` → +5；`< coverDetail[1].percent` → +2；`obstructingToken` 时至少 +2。

### 5.3 `tokencover` — Alternative Token Cover（caewok，MIT）

| 步骤 | 结果 |
| --- | --- |
| 1 版本 | 0.10.2：`minimum 13 / verified 13.351`，**无 maximum** |
| 2 新鲜度 | 0.10.2 = 2026-04-08；仓库 push 2026-06-19。**临界**（>5 个月） |
| 3 dnd5e 证据 | 官方页**未声明** dnd5e 兼容 |
| 4 热度 | 4 stars / 5 forks / **13 open issues** |
| 5 冲突面 | `requires: lib-wrapper + socketlib`（本地均已装）；官方推荐搭配 Alternative Token Visibility / Wall Height / Elevated Vision / Midiqol；midi-qol 有 `tokencover` 分支（读 `cover-trigger-percent-low/medium/high` 与 `midiqol-covercheck` 设置，走 `attackerToken.tokencover.coverCalc`） |
| 6 中文 | `zzz_mod_chn` 137 键 |
| 7 签名/授权 | GitHub releases 直下，离线可验 |
| 8 记录 | 未通过（新鲜度 + dnd5e 证据不足） |

**独特价值**：三种算法可选——**Points**（3D 射线采样 + 阈值百分比）、**Area2d**（俯视可见面积百分比）、
**Area3d**（3D 可见百分比，webGL 处理头顶 tile 透明度）；GM 自定义 low/medium/high 三档并各挂一个 Active Effect；
支持 stereo 双视点、point 位置在边界/中心间偏移、墙体高度与头顶 tile、趴伏 token 视高调整；
v12 起有 **Set Cover Region behavior**。

### 5.4 `simbuls-cover-calculator` — Simbul's Cover Calculator（VTT Lair，MIT）

| 步骤 | 结果 |
| --- | --- |
| 1 版本 | 2.1.1：`minimum 12 / verified 12`，无 maximum；`requires: simbuls-athenaeum ≥1.1.0` |
| 2 新鲜度 | 2.1.1 = **2024-09-04**，停更 2 年 → 按 R2 降为观察/D 层 |
| 3 dnd5e 证据 | 仅声明 dnd5e，无 tested-on 版本 |
| 4 热度 | 8 stars / 4 forks / 18 open issues |
| 5 冲突面 | midi-qol 有 `simbuls-cover-calculator` 分支（读 `globalThis.CoverCalculator.Cover()`）；依赖 `simbuls-athenaeum` |
| 6 中文 | `zzz_mod_chn` 192 键（键最多） |
| 7 签名/授权 | GitHub releases 直下 |
| 8 记录 | 不通过 |

**设计取向（2014 规则）**：DMG p.251 程序；Center Point 与 Four Corner 两种墙模式；tiles 与 tokens 也可配掩护等级；
把 **-2 / -5 / -40 罚值加到攻击者**（不是目标侧 +2/+5）；**明确不处理 Dex 豁免掩护加值**；
Sharpshooter / Spell Sniper / Wand of the Warmage 忽略掩护 trait + `helpersIgnoreCover` flag（0–3）。

---

## 6. 分层结论

### 6.1 A 层：首选（免费，只差状态回填）

**`simplecover5e`**

- 理由：免费 MIT；与 midi-qol 官方集成且本地已装版本 14.0.11 就带集成；写 dnd5e 原生状态（与自有条件系统零重叠）；
  2024 规则目标侧 +2/+5；六角/无网格/3D token depth/Region 阻挡全支持；**唯一声明 dnd5e 6.0.0 支持的候选**；
  中文层术语正确且已装；本项目已修过它的并发 bug 并有语义验收记录。
- 已付出成本：一次模块内补丁（`2.2.0-cor-cotn.1`）+ 一轮语义验收。**这是四个候选里唯一已有沉没成本且被项目验证过的。**
- 原待办对账：Mirror 健康矩阵仍需按该目标的证据核对；Next 已有作者 2.2.3 的替代及安装记录，见页首。原“移植旧补丁到 2.2.2”不再作为 Next 下一步。

### 6.2 B 层：维持 no-buy（付费）

**`levelsautocover`（Automatic Cover Calculator）**

- **不 buy，但理由必须更换**：不再是"与 Midi-QOL/DAE 抢层"（该理由已被 midi-qol v14.0.11 源码证伪），
  而是"免费 `simplecover5e` 满足当时主要需求，且已有限定本地验收"；额外能力仍需按具体需求比较。
- **已订阅 TheRipper93 premium 的情况下**（为 `mastercrafted`/`token-notes`/`gatherer` 等其它理由订阅），
  ACC 值得装来做 A/B 基准——它有三项 simplecover5e 没有的能力：精确掩护百分比、**主动下蹲**、
  **败亡敌人降高充当掩护**。其中后两项对"巨兽倒下后是否还能当掩体"这类实际桌面问题有直接价值；仅在有对应需求和安装授权时考虑。
- 采购前必须补：`protected: true` 包在本地 Lab 的加载实测（R3），以及 dnd5e 5.3.3 的 tested-on 证据（R3 第 3 步）。

### 6.3 C 层：观察

**`tokencover`（Alternative Token Cover）**——三种算法（尤其 Area3d 的 webGL 头顶 tile 透明度）在方法论上比其它候选更细，
GM 可配三档掩护+各自 AE 也更灵活。但 verified 13.351、13 个 open issue、超过 5 个月未发版。
若 simplecover5e 在某类地图（大量头顶 tile 的多层地图）上判定不准，再回来试它。

**`aedifs-tactical-grid`**——本身不是掩护计算器，是**掩护计算器的集成框架**：
`TacticalGrid.coverCalculators` 注册表目前支持 `none` / `simbuls-cover-calculator` / `levelsautocover` / `pf2e-visioner`，
外加射程高亮、拖拽/标尺/hover 距离测量、网格显隐。与本地已装 `hover-distance`（免费，TheRipper93 转免费批）和
`easy-target`（4.0，已装）功能重叠，暂不引入。

### 6.4 D 层：不建议

| 模块 | 原因 |
| --- | --- |
| `simbuls-cover-calculator` | 停更 2 年（2024-09-04）；2014 规则攻击者侧 -2/-5/-40；**不处理 Dex 豁免掩护加值**；依赖 `simbuls-athenaeum` |
| `pf2e-visioner` | PF2E 系统专用，dnd5e 场景不适用（仅作为 tactical-grid 集成生态的存在性证据） |
| Volumetric Templates / Situational Shortcuts（TheRipper93 premium） | 与 midi-qol 模板目标选择 / situational bonus 同层，**这一条原判断仍成立** |
| 任何"maximum: 14" 模块在 Foundry v15 升级路径上 | `simplecover5e` 与 `levelsautocover` **都是** `maximum: 14`；升 v15 时两者一起拒载，需提前规划 |

---

## 7. 与自有模块的咬合

| 自有模块 | 关系 |
| --- | --- |
| `fvtt-custom-conditions` / `fvtt-trigger-engine` | **零重叠**。掩护模块写 dnd5e 原生 `coverHalf`/`coverThreeQuarters`/`coverTotal` 状态（`exclusiveGroup: "cover"`），算术由 dnd5e `actor.coverBonus` 完成；不新增自定义条件语义域，不进 trigger-engine 的触发链 |
| `forge-encounter` | 相邻但不同层：遭遇生成不管几何掩护。封面/区域类 Region behavior（simplecover5e 2.2.0 的 Cover Obstacle Regions）属于场景制作，不是生成器职责 |
| `open-session-deck` | 无关 |
| JSON 生成管线（`core` profile） | **R4 满足**：掩护是运行时几何判定，无法也不应编进生成物。生成内容零改动即可被掩护模块驱动 |

**版本目标差异（必须单列）**：

| 目标 | dnd5e | 系统原生掩护算术 | 可用掩护模块 |
| --- | --- | --- | --- |
| v14 锁定（当前） | 5.3.3 | **有**（`coverBonus`） | `simplecover5e`（首选）、`tokencover`、`levelsautocover`（付费） |
| server-next | 6.0.x | **有** | `simplecover5e` 2.2.2+（唯一声明 6.0.0 支持）；其它三个候选的 6.x 证据为零 |
| v12 默认目标 | 4.3.9 | **无**（实测 0 次 `coverBonus`） | 基本零覆盖：`simplecover5e`/`levelsautocover` 4.x 均 `minimum 14`，`tokencover` `minimum 13`，仅停更的 `simbuls` `minimum 12` |

---

## 8. 待办清单

原待办与 2026-10-01 文档整理结果列在一起，不自动执行；勾选仅表示对应文档已整理，发布状态以 Git 为准。

### 8.1 立即可做（本地 Lab，零采购成本）

- [ ] **更正健康矩阵 `simplecover5e` 行**：版本 `2.1.3` → 实际 `2.2.0-cor-cotn.1`，状态 `Untested` → 反映已有并发修复与语义验收（非完整长时会话验收）
- **已被后续方案替代**：原“把 UUID 串行化补丁移植到 2.2.2，再跑 10 次回归”的建议不再用于 Next。作者 2.2.3 的源码替代与安装记录见页首；本次没有执行并发回归，不能把建议被替代记成测试通过。
- **旧建议不再直接适用**：上游 2.2.3 已有对应串行机制；不再依据旧 issue 扫描推测作者不知情。本次未联系上游。
- [ ] 确认 `zzz_mod_chn` 的掩护中文在本地 Lab 实际生效（13.93 已装；上游已到 13.99），抽查"全身掩护/半身掩护/四分之三掩护/下蹲"四个关键串
- [ ] `simplecover5e` + midi-qol 集成 A/B：midi-qol `coverCalculation = simplecover5e`（此时 simplecover5e 退化为 Library 模式，骰值由 midi-qol 算）与 `coverCalculation = none`（simplecover5e 自己挂状态）两条路径各跑一轮攻击+豁免，确认不与 Midi-QOL 的 optionalRules 重复施加 +2/+5
- [ ] 记录 `maximum: 14` 共性与 Foundry v15 升级路径的影响面

### 8.2 需用户决策

- [ ] 是否订阅 TheRipper93 premium（€10/月起）。**注意：本次调研后，"掩护中文化"不再构成订阅理由**——`zzz_mod_chn` 已覆盖且术语正确
- [ ] 若已订阅：是否装 `levelsautocover` 作 A/B 基准（价值点：精确百分比、主动下蹲、败亡敌人当掩护）
- [ ] v12 目标上掩护自动化是否要单独立项（当前零覆盖，且 dnd5e 4.3.9 无原生 `coverBonus`，需模块自行算 bonus）

### 8.3 文档修订

- [x] 2026-10-01 文档整理已拆开[付费评估](2026-09-22-paid-module-evaluation.md) D 层：`levelsautocover` 独立列出并撤回“必然抢层”理由；不改变原 no-buy。此勾选仅表示文档已改，不表示运行验收通过。
- [x] 2026-10-01 文档整理已在付费评估的整理说明、D 层和订阅待办中链接本文件；复用这里的完整调研，不再复制一份同内容章节。

---

## 9. 复查清单：每个新候选都要走这 8 步

1. **版本**：读目标 release 的 manifest，记录 `minimum`/`verified`/`maximum`、`systems`/`relationships`、`protected`。`maximum` 低于目标或 `minimum` 高于锁定 → 拒。
2. **新鲜度**：GitHub Releases / r2 manifest `Last-Modified`；超过 6 个月未更 → 降为观察。
3. **dnd5e 证据**：官方页 / release note 是否写明 tested-on 或支持 6.0.x；没有 → 按 `Untested` 记录，不得凭"应该支持"放行。
4. **热度**：stars / releases 累计下载 / Patreon patron 数。约 300–1,000 patrons 视为中等热度，>2,000 需说明独特价值。
5. **冲突面**：`relationships` 声明；是否写 dnd5e 原生状态还是自造 AE；是否与 midi-qol 的 `coverCalculation`/`wallsBlockRange` 选项重复施加；是否与自有模块重叠。
6. **中文**：先查 `zzz_mod_chn`（`fvtt mod汉化/<module-id>/cn.json`），再查 `ripper-mod-localizations/translations/<module-id>/zh-hans.json`；**两者都要抽查术语**（掩护≠封面、下蹲≠鸭子）。
   ```bash
   gh api "repos/Memorize-Remix/fvtt_mod_chn/git/trees/master?recursive=1" \
     --jq '.tree[] | select(.path | test("mod汉化/<module-id>/cn.json")) | .sha'
   ```
7. **签名/授权**：`protected: true` 的包必须实测本地 Lab 能否离线加载；不能 → 不得当作已验收，不得绕过保护。
8. **记录**：通过后写入 [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md) 状态行、更新 handbook，并回填本文件与付费模块评估文件对应层级。

---

## 10. 数据来源与可信度

| 来源 | 用途 |
| --- | --- |
| `r2.foundryvtt.com/packages-public/levelsautocover/module-4.0.1.json` | ACC 的准确 compatibility / protected / languages（**一手 manifest**） |
| GitHub Releases `module.json`（simplecover5e 2.2.2 / simbuls 2.1.1 / tokencover 0.10.2） | 三个免费候选的准确 compatibility / relationships / languages（**一手 manifest**） |
| `gitlab.com/tposney/midi-qol` v14.0.11 `src/module/utils.ts` | midi-qol 四个掩护后端的集成代码（**本地已装版本的同一份源码**） |
| `gitlab.com/tposney/dae` v14.0.14 `module/` 文件树 | DAE 无 cover 相关文件 |
| `github.com/foundryvtt/dnd5e` master + tag `4.3.9` | `DND5E.statusEffects` 掩护三项、`actor.coverBonus`、AC/Dex 豁免消费点；4.3.9 无 `coverBonus` |
| `github.com/Kapuzenjoe/simplecover5e` README + Wiki `Cover-Rules` + 2.2.0/2.2.1/2.2.2 release notes | 规则实现深度、专长/flag 处理、6.0.0 支持声明 |
| `github.com/theripper93/theripper-premium-hub` `premium-changelogs/levelsautocover.md` | ACC 版本史与 Patreon 档位要求（"any tier equal to or above Tip!"） |
| Patreon 公开 campaign API（id 6824859） | patron 数 18,551、档位与价格（Free/€10/€12.5/€20/€50） |
| `github.com/theripper93/ripper-mod-localizations` + `github.com/Memorize-Remix/fvtt_mod_chn` | 两个中文层的覆盖范围与术语质量（逐键核对） |
| 项目本地 [foundry-v14-local-optimization-log.zh-CN.md:493-529](../acceptance/foundry-v14-local-optimization-log.zh-CN.md) | simplecover5e 本地补丁与语义验收记录 |

**本人亲自复核过的**：四个模块的一手 manifest；midi-qol v14.0.11 集成代码；dnd5e `coverBonus` 三处消费点与 4.3.9 缺失；
两个中文层的键数与术语抽样；Patreon 档位。

**局限**：调研环境无法访问 Reddit / DuckDuckGo / Brave / Startpage 等社区源（WebSearch 接口返回 400、Mojeek 403、
Reddit 返回 HTML、Internet Archive 临时离线），"用户实际体验如何"这一维只能依据模块自身文档与 issue 数；
`levelsautocover` 源码在 Patreon 墙后，其内部算法细节仅能从 manifest、changelog 与 midi-qol 的调用侧推断；
`foundryvtt.com/_api/packages/get` 需授权（403），无法用官方包目录做全量枚举，覆盖度靠 GitHub 代码检索 + midi-qol/tactical-grid 的集成列表交叉补全。

---

## 11. 交叉引用

- [2026-09-22-paid-module-evaluation.md](2026-09-22-paid-module-evaluation.md)：付费模块总评估（本文件修正其 D 层一行）
- [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md)：模块状态矩阵（`simplecover5e` 行待更正）
- [foundry-v14-module-compatibility.md](../acceptance/foundry-v14-module-compatibility.md)：共存的已知冲突
- [foundry-v14-local-optimization-log.zh-CN.md](../acceptance/foundry-v14-local-optimization-log.zh-CN.md)：simplecover5e 本地补丁与验收
- [0006-weapon-mastery-scope.md](../decisions/0006-weapon-mastery-scope.md)：武器精通当前自有实现方向及旧草稿纠错；存在免费替代不等于改变功能归属
- [foundry-module-localization-policy.md](../foundry-module-localization-policy.md)：中文本地化政策（两个中文层的选用依据）
