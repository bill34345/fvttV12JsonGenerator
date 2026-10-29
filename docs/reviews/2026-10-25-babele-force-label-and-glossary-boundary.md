# 水晶浩劫 force 显示来源与 AI 术语表边界

核对日期：2026-10-25。范围：独立 Babele 维护项目当前水晶浩劫怪物、法术译文，第三干净环境的安装文件，以及精确 dnd5e 6.0.6 源码。本文只记录本次只读调查；没有修改译文、模块、系统或服务，没有进入浏览器、重启、安装或部署。

## 1. 问题的原因是什么

当前材料证明，本批存在两种不同来源的显示文字：译文 JSON 里保存的中文正文，以及 dnd5e 根据伤害类型自动生成的界面文字。前者已经把伤害类型 force 写成“力场”；后者读取系统本地化标签。第三环境的核心中文模块 `foundry_chn` 没有提供 dnd5e 的这项标签。

这不是只有源码支持的猜测：已有缚晶魔原生界面记录在 `2d8` 旁显示 `Force`，同一份记录的正文则显示“点力场伤害”。不过，用户本次举例所指的具体页面、条目和位置尚未提供，本调查不能把历史记录中的位置认定为用户当前看到的位置。

从 CHM 整理术语表可约束后续 AI 翻译正文使用“力场”，但术语表文件本身不会被 Foundry 当成系统本地化资源加载。对系统生成的 `Force` 标签，还需单独处理系统本地化的加载与精确版本适配。机械数据里的 `force` 必须保留。

## 2. 证据是什么

### 精确对象与版本

- 维护工作树：`I:/OpenCode/fvtt-babele-zh-maintenance-worktrees/20261025-next-acceptance`，分支 `codex/20261025-next-acceptance`，HEAD `46f30f9a633f1dfee1809b65986c812a9e3e41e2`。本次读取时 `git status --short` 为空。
- 当前维护上游：中文 Babele 补丁 `1.0.194`，锁定 ZIP SHA-256 `abe1c245469b4a0f7dc9427c59ace8dbc1adcd92d9ba84891006112c6c1f9dcf`；水晶浩劫来源 `1.0.1`。
- 精确系统源码：`F:/FoundryLab/reference-cache/dnd5e/6.0.6/repo`，tag `release-6.0.6`，commit `87e94dbd9f930135e0694cd7e7d49f210603cd2c`；本次读取时 Git 状态为空，origin 为 `https://github.com/foundryvtt/dnd5e.git`。
- 第三环境安装系统清单 `F:/FoundryLab/foundry-v14/data/babele-clean-v14/Data/systems/dnd5e/system.json` 报告版本 `6.0.6`。安装版是构建后的 bundle，不能与源码仓库的散文件按整文件相等比较；下文另核对了实际 bundle 的对应代码。
- 第三环境模块目录现有 5 个模块：Babele `2.9.1`、水晶浩劫 `1.0.1`、中文 Babele 补丁 `1.0.194`、`foundry_chn` `14.365`、libWrapper `1.13.5.1`。这是文件清单核对，没有重新获取运行中的启用状态。

### 当前译文正文与安装文件

本次用 JSON 解析递归检查所有字符串值，按大小写不敏感的英文完整词 `force` 搜索，并分别检查字段名为 `description`、`text`、`value` 的字符串；另外统计“力场”和 `[[/damage`。

| 译文 | 条目数 | 含英文 force 的字符串字段 | 正文字段含英文 force | 含“力场”的字符串字段 | 含 `[[/damage` 的字段 |
|---|---:|---:|---:|---:|---:|
| 怪物 | 16 | 4 | 0 | 26 | 19 |
| 法术 | 21 | 0 | 0 | 6 | 0 |

怪物中保留的 4 处全部是名称：

- `entries.JA9jbSDbHeQ4NqPB.items.phbsplWallofForc.name`：`力场墙 Wall of Force`，译文第 487 行。
- `entries.gfB5hDh1oTueJzut.items.q0I99j97ZD9SrbFR.activities.9pVeuZnAsSK7uGsD.name`：`力场墙 Wall Of Force`，第 832 行。
- `entries.gfB5hDh1oTueJzut.items.XVnY58FBqIyfGT0m.name`：`力场墙 Wall of Force`，第 1095 行。
- `entries.kXTyz3gc8P7TEMgn.items.fJYjJy0R4H1bhuZq.name`：`力场墙 Wall of Force`，第 1529 行。

它们符合已确认的 `中文 English` 名称规范，不能当成漏译批量删去英文。

两份维护文件与第三环境安装译文的 SHA-256 分别完全相同：

| 文件 | SHA-256 |
|---|---|
| `overlays/crystal-chaos-monsters/translation.json` 与安装的 `translation/cn/crystal-chaos.crystal-chaos-monsters.json` | `befa69f47ac3b07aacd1f010c4166d57918b82ab12c0927a39564c833017316e` |
| `overlays/crystal-chaos-spells/translation.json` 与安装的 `translation/cn/crystal-chaos.crystal-chaos-spells.json` | `c7e1094f8bf85fc90e22e22ccb4bf1c507d244744f3eee3206dcee66612d9a84` |

以上证明保存的正文没有残留英文 force，不证明富文本展开后所有可见文字均为中文。例如奥术箭 Arcane Bolt 的译文第 503–508 行保存的是 `造成[[/damage average]]伤害`。这里没有写入伤害类型文字，展开时由系统生成。原始 Actor 导出 `runs/monsters-20261025/source/actors.json` 第 9664–9671 行仍把该活动的 `damage.parts[].types` 保存为 `["force"]`。

### dnd5e 6.0.6 如何取得显示文字

1. `module/config.mjs` 第 2330–2334 行定义机器键 `force`，其中 `label` 是 `DND5E.DAMAGE.Type.Force`。第 2387 行登记对 `damageTypes[].label` 的预本地化。精确来源：[config.mjs](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/config.mjs#L2330)。
2. `dnd5e.mjs` 第 545 行在 `i18nInit` 注册处理，第 582 行调用 `performPreLocalization(CONFIG.DND5E)`。`module/utils.mjs` 第 1299–1304、1340–1343 行读取登记项，把标签值交给 `_loc` 并写回配置。精确来源：[dnd5e.mjs](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/dnd5e.mjs#L545)、[utils.mjs](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/utils.mjs#L1299)。
3. 系统自带英文文件 `lang/en.json` 第 2473 行为 `"Force": "Force"`。系统清单第 625–631 行只登记英文 `lang/en.json`。精确来源：[英文标签](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/lang/en.json#L2473)、[语言清单](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/system.json#L625)。
4. 活动伤害摘要 `module/data/activity/base-activity.mjs` 第 668–703 行取得伤害骰；第 693–697 行用 `CONFIG.DND5E.damageTypes[p]?.label` 拼接伤害标签。第 702 行另保留 `damageType: types[0]`，显示标签和机械键具有不同用途。精确来源：[活动伤害摘要](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/data/activity/base-activity.mjs#L668)。
5. 富文本 `[[/damage average]]`：`module/enrichers.mjs` 第 1010–1029 行在没有显式公式时选择相关活动，从伤害骰取得公式与类型；第 1049–1055 行把类型键转换为 `CONFIG.DND5E.damageTypes[t]?.label`；第 1074 行生成最终文字。第 1057 行在 2014 规则下将类型文字转小写，因此 `Force` 和 `force` 都可能由此路径产生。第 1043–1044 行的显式自定义标签是单独分支，不能把默认标签结论推广到所有手写标签。精确来源：[enrichers.mjs](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/enrichers.mjs#L1010)。
6. `lang/en.json` 第 6686、6690 行分别用 `{average} ... {type}` 和 `{formula} {type}` 组合展开结果。这使中文说明中的伤害表达仍可能包含系统返回的英文类型。精确来源：[富文本模板](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/lang/en.json#L6686)。

第三环境实际安装的 `Data/systems/dnd5e/dnd5e.mjs` 已核对存在对应逻辑：第 52632 行是 Force 标签键，第 52688 行登记预本地化，第 96518 行执行预本地化，第 20665 行为活动伤害摘要读取标签，第 32981 行为富文本伤害读取标签。安装的英文 `lang/en.json` 第 2473 行同样为 `Force`。bundle SHA-256 为 `010222ee48222228f4e0c9173bc8be840cfa080c552319872b34b71d18fa07e4`。

### 第三环境的中文模块覆盖了什么

`F:/FoundryLab/foundry-v14/data/babele-clean-v14/Data/modules/foundry_chn/module.json` 第 3–4 行明确为核心中文翻译；第 15 行为 `coreTranslation: true`，第 16–21 行仅登记 `cn.json`，第 24 行版本为 `14.365`，清单没有 `scripts` 或 `esmodules`。对 `cn.json` 的结构化解析得到 177 个根键，所有原始文本中 `DND5E` 出现次数为 0，因此没有 `DND5E.DAMAGE.Type.Force`。该文件 SHA-256 为 `e7a037dc1274dc19502b04bb3b73b451578e393079aa5250edd322b7de614712`。

第三环境中文 Babele 补丁清单没有 `languages`；其 `scripts/init.js` 第 88–92 行调用 `game.babele.register` 注册 `translation/cn`、语言 `cn`。本次另外搜索了 Babele、水晶浩劫、中文补丁及本地适配器、libWrapper 的相关脚本，没有发现 `DND5E.DAMAGE.Type.Force`、`DND5E.DAMAGE` 或覆盖 `damageTypes.force` 的代码。模块列表和这些检查支持“当前已检查文件没有提供该系统标签中文”的判断；没有据此声称本轮读取了浏览器内存中的 i18n 字典。

### 复用的原生界面证据

证据根目录：`I:/OpenCode/fvtt-babele-zh-maintenance-worktrees/20261025-next-acceptance/runs/monsters-20261025/chrome/`。

- `native-daemon-rolltable.txt` 第 37–46 行：晶蚀涌动的活动行出现 `2d8` 和 `Force`；第 51–59 行子活动同样出现 `Force`；第 66–68 行正文显示“点力场伤害”。文件 SHA-256 为 `6f35f80146beab2f452caf8bcb5785329ef2c30729bbf6af1c9deb82d59bfa5e`。
- `native-wolf-features.txt` 第 81 行：中文攻击说明中的富文本伤害展开为 `11 (2d6 + 4) Piercing 伤害`。对应译文第 78 行保存的是 `[[/damage average]]`。文件 SHA-256 为 `19d6e8a42b7503efa9b3765f52d7da49367422117da2766ab167862daf18963d`。

这些是本次读取的既有证据，没有在本轮重新打开浏览器采集。它们直接证明当时本批界面存在英文伤害标签；不能替代用户本次所指位置的确认，也不能证明今天浏览器会话的全部界面状态。

## 3. 解决方案是怎样的

### AI 术语表可以承担的范围

- 把伤害类型语境的 `force damage` 约束为“力场伤害”，并把 `force` 在该语境下标为“力场”。保留 CHM 的具体来源位置、原文与译文，供 AI 检索和人工复查。
- 把语境写清楚，避免对 force 的其他词义一概替换。例如 `Wall of Force` 的名称仍保留“力场墙 Wall of Force”；受控双语名称中的英文属于有意保留。
- 将系统键和显示词分开记录，例如 `system_key: force`、`localization_key: DND5E.DAMAGE.Type.Force`、`preferred_zh: 力场`。这是建议的数据设计，不是用户已确认的新格式要求。
- 对后续 AI 输出检查正文漏译、术语一致性，同时把富文本标记和机械字段排除出中文替换。仅搜索 JSON 中的英文不能检查富文本最终显示；本批已有 19 个怪物字段使用 `[[/damage`。

### 系统标签的待处理项

| 项目 | 本次结论 | 后续最小核对 |
|---|---|---|
| 正文 force 术语 | 当前两份本地/安装译文的正文字段没有英文 force | 新译文按 CHM 对照表检查，并核对来源语义 |
| 系统 Force 标签 | 精确源码及历史原生界面已证实该独立显示层；当前检查的核心中文文件不含对应项 | 在用户授权的本地化范围内确定由何处加载精确 dnd5e 版本的中文 i18n 条目，再读回系统标签、活动摘要和富文本显示 |
| 用户此次所见具体 force | 未知位置，不能唯一归因 | 有实际条目/页面位置后先判断是正文、双语名称、活动摘要还是富文本展开 |
| 其他伤害类型 | 历史原生界面同时出现 Piercing | 如扩展系统本地化，逐个核对当前版本键和中文术语，避免只修 Force 后将整体界面认定为完成 |

机械类型必须保留 `force`：精确源码的 `module/config.mjs` 第 5041–5042 行用 `damageTypes` 的键建立富文本解析表，`module/enrichers.mjs` 第 1127–1129 行按此表识别类型；显示时又按同一个键索引标签。把机械键改成“力场”不会补齐缺失的本地化条目，反而会使这些既有键查找失配。本次没有修改机器键，也没有实施系统标签修复。

## 验证层级与限制

- **VERIFIED**：精确 6.0.6 tag/commit、实际安装 bundle 对应逻辑、两份译文完整字符串扫描、安装文件与维护文件哈希一致、模块清单与核心中文文件结构解析、既有原生界面 Force/Piercing 证据。
- **合理推断**：当用户所见位置属于本次已核对的活动摘要或默认 `[[/damage]]` 展开路径，且没有额外运行时覆盖时，英文 Force 来自系统标签而非 AI 正文漏译。
- **UNKNOWN**：用户当前特指的位置；本次没有读取运行中客户端的语言、`game.i18n` 或 `CONFIG.DND5E.damageTypes.force.label`。
- **NOT_EXECUTED**：本轮新浏览器验收、系统标签修复、CHM 术语抽取与术语表交付、服务/模块变更、安装部署。CHM 术语表属于主任务的其他工作，本报告只核对它与 Force 标签之间的作用边界。

本次产物是调查记录，没有改变用户操作入口、支持版本或安全限制，不触发功能手册内容修改；未运行全仓 CI 或生成器测试。
