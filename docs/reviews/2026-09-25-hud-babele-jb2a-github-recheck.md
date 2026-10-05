# HUD、中文 Babele 补丁与 JB2A 公开来源复核（2026-09-25 晚间）

## 结论先行

用户质疑“官方不支持”后，重新直读作者 GitHub 正式发布页、正式发布清单、当前源码与合入记录，并对照 ServerNext 本机已装清单。目标仍是 Foundry 14.368／dnd5e 6.0.2；下表是**当时只读复核**，当时未下载、安装、启用、测试或改动付费文件。后来用户单独授权中文包和 JB2A 的试装与实测，结果见下文；不要把表中早先的“暂缓/只记录”当成现在状态。**此前把“没有正式发布支持”说成“作者明确不支持”过于武断。**

| 对象 | 今天直接看到的作者信息 | 准确结论与处置 |
|---|---|---|
| Token Action HUD D&D5e | [最新正式发布 2.1.0](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/latest)的文字说 dnd5e 5.1+；但[该版本源码清单](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/blob/2.1.0/module.json)及正式下载清单都把 dnd5e 上限写成 5.99。Foundry 官方说明 `maximum` 是新版不得使用的边界。[作者已于 9 月 22 日合入 D&D 6 改动](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/pull/169)，[当前 main 清单](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/blob/main/module.json)已写 dnd5e verified6.0.3／maximum6.99；但最新正式发布仍是旧 2.1.0。另一个[6.x 提议](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/pull/170)已关闭、未合入。 | **作者正在正式源码中支持 6；现有正式安装包仍不能在 dnd5e 6.0.2 下正常启用。**状态改写为“已合入、待正式发布”，不再说“作者不支持”。依本次仅取最新正式版本的规则，暂不安装尚未发布的源码。 |
| Token Action HUD Core | [最新正式发布 2.1.1](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/latest)明确增加 Foundry V14 支持；[该版清单](https://github.com/Larkinabout/fvtt-token-action-hud-core/blob/2.1.1/module.json)写 minimum13.351／verified14.360、无上限和 dnd5e 版本限制，必需 socketlib，color-picker 可选。 | **Core 本身支持 V14，不能叫“不支持”。**它是配套底座；D&D5e 的正式安装包仍卡在旧系统上限，所以两件套没有一起迁入。目标14.368没有由 `verified14.360` 单独证明逐补丁验证。 |
| D&D 简体中文 Babele 补丁 | 作者 GitHub 的[当前正式下载清单](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/download/latest/module.json)为 1.0.164、minimum12／verified13，**没有 maximum**，依赖 Babele，未列 dnd5e 上限；[仓库说明](https://github.com/feederze/dnd-simplified-chinese-babele-patch)说翻译可随版本更新，但没有具体确认 Foundry14.368／dnd5e6.0.2。GitHub 仓库里的 `main` 清单仍是 `1.0.0` 占位，不能替代 1.0.164 正式下载清单。 | **不能说它“不支持”或“装不上”V14；只能说作者尚未明确验证目标组合。**按用户的明确支持门槛维持暂缓。已装的通用 Babele 2.9.1 与这个未装的 D&D 中文补丁是两件不同的东西。 |
| JB2A - Patreon Complete Collection | ServerNext 本机付费包 0.8.7 清单只写 minimum10／verified13，**没有 maximum**、没有 dnd5e 版本限制。作者的[公开免费版当前清单](https://github.com/Jules-Bens-Aa/JB2A_DnD5e/blob/main/module.json)已写 verified14；[公开补丁说明](https://jules-bens-aa.github.io/jb2a-wiki/patchnotes/)已有 0.9.3，并把 0.8.7 记在 2026 年 1 月。免费版的声明和公开补丁号都不能证明本机**付费版 0.8.7** 已为 Foundry14.368／dnd5e6.0.2 验证。 | **不能断言付费 0.8.7 不支持，也不能保证它支持目标。**版本较旧，精确目标兼容仍未知。遵用户“37 付费只记录”规则，不下载、更新、试玩或改开关。 |

[Foundry 官方模块清单说明](https://foundryvtt.com/article/module-development/)区分 `verified` 与 `maximum`：前者是作者确认到的版本，后者是明确上限。这是上述“明确不兼容”与“未验证”两种说法的依据。

## 同日晚间新授权与再次核对

- 用户随后明确要求安装全部中文翻译包、验证实际显示，并验证本机 JB2A 付费动画包。D&D 简体中文 Babele 补丁现已取作者正式1.0.164包安装并启用，重载后开关仍开启；整个人物卡的中文覆盖只有部分通过，不能把“没写最高版本”冒充作者已明确验证目标。其他中文包、Ravenloft本地译包和一段JB2A动画的实际结果见[安装与界面复核](./2026-09-25-server-next-translation-install.md)。JB2A本机0.8.7原已开启，一段火球动画预览实际播出约5秒；没有下载或更新任何付费文件，不能推断全部动画可用。
- 约22时再次读取作者[Core正式2.1.1发布页](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/tag/2.1.1)、[正式清单](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/download/2.1.1/module.json)和[仓库使用说明](https://github.com/Larkinabout/fvtt-token-action-hud-core)：Core自身最低Foundry13.351、verified14.360、无最高版本与D&D系统限制，必需socketlib、可选color-picker；目标已装socketlib v1.1.4，但Core目录不存在。作者明确说Core须搭配相应游戏系统包，而[D&D5e正式2.1.0清单](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/download/2.1.0/module.json)仍把D&D最高版本写5.99。因此Core自身支持Foundry14，但此时单装不会得到可用动作栏，两件保持暂缓。没有下载、安装或启用Core。

## 待判断本地化与新候选复查

- HUD D&D5e：作者已合入 D&D 6 改动，但未正式发布。待作者推出新正式版时，先核发行页、发布包清单、D&D 系统范围及 Core 依赖；若明确覆盖当前目标，再只做版本、安装与启用读回。Core 可随合格适配器一同处理，不为一个不能工作的快捷栏单独改变世界。
- 中文 Babele 补丁：用户已单独授权本地试装，现为正式1.0.164文件已装且世界启用，中文覆盖部分通过；后续只对实际遗漏做定点调查。作者仍未明确验证目标组合，不改变这个来源层级。
- JB2A Patreon：按用户新授权，原有0.8.7一段火球动画预览通过，不下载或更新付费文件。免费版变化不能替代付费版清单，一段预览也不能替代全部效果验收。
- 新候选仍按“作者正式发布 → 清单的目标范围和依赖 → 已装版本 → 本次权限”顺序复查，不把开发分支、宣传语或别的包的通过当成该包正式支持。热门 HUD 与 JB2A 只作为这次具体质疑的对照，不额外扩展迁移对象。
