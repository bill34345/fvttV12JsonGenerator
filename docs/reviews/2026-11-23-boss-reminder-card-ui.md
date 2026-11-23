# 2026-11-23 Boss 战提醒卡片调研

用户看过 0.1.0 的本地截图后说：“我觉得这个稍微有点粗糙了，并不是说不好，但是我们得去看看别人的 card 是怎么处理的，然后我们来优化一下我们的 UIUX。” 本轮依据公开操作演示和可读取的源码比较卡片内的点选体验。

| 对照 | 实际看到了什么 | 0.1.1 采用的做法 |
| --- | --- | --- |
| FutureHax Boss Effect Reminder | 作者用巫妖演示传奇动作。卡片先列剩余次数，再从 Use an Action 选项点动作。选项整行有图和名称，右侧以 1/3、2/3 等数字表示消耗。公开演示提供作者实操，付费包在本机仍为 Untested。 [发行方截图](https://downloads.r2plays.games/futurehax/boss-effect-reminder/media/hero-combined.png) · [作者演示](https://www.reddit.com/r/FoundryVTT/comments/1y2ugqi/dd5e_boss_effect_reminder_legendary_villain_and/) | 头像与剩余额度归到怪物一行，动作的消耗靠右对齐。GM 在展开的列表里直接点对应动作。 |
| Midi-QOL Reaction Dialog | 本机 14.7.0+local.1 的 ReactionDialog 以活动所属物品的图片配文字按钮，另有明确的放弃选项。源码将放弃设为默认，Enter 不会误花费反应。公开 API 说明该对话框用于反应选择。 [ReactionDialog 文档](https://github.com/tposney/midi-qol/blob/dnd6/MACROS.md#reactiondialog) | 区分执行和跳过。动作名称常显，窗口打开时无需选中任何动作。 |
| dnd5e 6.0 原生聊天卡 | 系统发布说明展示紧凑卡片和目标分组。它是本项目面对的 Foundry 界面语言。 [dnd5e 6.0 发布说明](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.0#chat-cards) | 保留原生浮窗和主题。两只怪同一时机触发时，使用分隔线和头像在一张卡上区分来源。 |

0.1.0 的实机图片显示，短按钮很容易在宽浮窗中散开，怪物名、点数和时机都混在标题里。0.1.1 将时机图标、标题和跳过排在卡首，怪物名与资源排在动作上方。待 GM 处理的动作各占一整行，动作过长时可换行。

用户进一步指出公开截图中每个动作下面的射程、目标等简要信息，并询问是否能显示。0.1.2 采用动作名下的小标签。dnd5e 6.1.1 的 Activity 最终准备步骤生成本地化的射程、持续时间、目标和区域标签。原生的单一目标栏在有区域时优先显示区域，提醒同时读取独立的影响目标标签，例如「20 尺球形」与「2 生物」。结构化目标或区域都缺失时抑制裸活动会自动带上的「自身」和「立即」。[dnd5e 6.1.1 活动准备源码](https://github.com/foundryvtt/dnd5e/blob/release-6.1.1/module/data/activity/base-activity.mjs) · [目标标签源码](https://github.com/foundryvtt/dnd5e/blob/release-6.1.1/module/data/shared/target-field.mjs)

新增本地化候选为无。FutureHax 付费包的状态沿用[付费模块复查](2026-11-23-paid-module-design-watch.md#待判断本地化)。日后评估新候选时，从发行方演示记录用几次点击找到动作、如何呈现资源和角色、如何退出，再按[付费模块复查步骤](2026-11-23-paid-module-design-watch.md#下一轮复查入口)核对版本和实际运行。
