# 中文 CHM 来源与 dnd5e 5.3.3 原生活动契约

本次实际来源是本地《DND五版不全书》26.08.06，条目 `其他/beyond drops/26.6/死亡天使.htm`，CR14、AC19、HP187。原 HTML 为 GBK，转 Markdown 的可见文字保真；这是本地资料格式适配，不宣称 Forge 新增直接上传 CHM。第一次冻结 f358 正常试验在来源切分阶段报 UNLABELLED_MECHANICS，HTTP0，原结果保留。修复后的真实 DeepSeek 正常链为一次 HTTP、零修复，完成来源验证与正式生成；真实卡面验收另记，不与离线结果互相替代。

## 精确版本事实

对照锁定的官方 dnd5e 5.3.3 本地完整源码，独立 Luna/medium 任务复核了以下接口。公开上游为 [foundryvtt/dnd5e 5.3.3](https://github.com/foundryvtt/dnd5e/tree/release-5.3.3)，具体事实以本地锁定版本为准。

- `module/data/activity/attack-data.mjs` 的攻击模式与 range override 支持同一武器的 melee/ranged Activity；共同明确加值、伤害与能力属性可以复用，Item reach10/range120，远程 Activity override120。不为此虚构 thrown 属性，不根据名称猜武器规则。
- `DamagePart.types` 多类型使用原生伤害对话框的单个选择器，代表一次骰式选一种类型；两种类型不得拆成两段相加。初步研究及真实运行证据各自保留。
- `module/data/activity/base-activity.mjs:74` 的 Activity uses 使用 `UsesField`；`module/data/shared/uses-field.mjs` 接受 day/recoverAll。`module/data/activity/fields/consumption-targets-field.mjs:131` 的 activityUses 消耗当前 Activity，自身 target 留空，写回该 Activity 的 uses.spent；不会消费父 Item。逐 Activity 恢复在 `module/data/item/templates/activities.mjs:346`。
- `templates/inventory/activity.hbs` 与 `templates/inventory/columns/uses.hbs` 展开活动行显示各自 value/max。`module/data/actor/npc.mjs:855` 的 Item 摘要仅在恰有一个 Activity 时借用其 uses 标签；因此三项各自每日次数须看展开行，并在 Activity 名称写清“GM施法记录”和 N/日。

## 本地采用与边界

通用来源语法支持中文闭合粗体标题、数字粗体标签、已知中文基础枚举以及明确同值的近战／远程主攻击。来源全文中的“巨型镰刀”是背景措辞，不能覆盖锚定数据行的中型天族。条件为该次伤害致 0 HP 后发生的 CON18 保留完整 GM 后果，不创建无条件 Save 或处死／囚魂效果。

“每项 N/日”目前只投影三个独立 Utility 记录，不解析法术 UUID、不伪造 Cast。施法 WIS/DC18、易容术24小时、免材料及迷踪步免所有成分均完整保留 GM 文本。可移植法术 manifest 的默认法术无法安全表达这些来源变体，故不能将默认 Disguise Self1h 或普通 Misty Step 当作本来源已实现。

## 待判断本地化与复查

无新增外部模块候选。后续若实现原生 Cast，先补来源绑定的 activation、duration 与 V/S/M 覆盖契约，再以不同名称／数值的来源正反例和锁定系统源码验证；不能只增加怪物名称分支。若升级 dnd5e，重新核查 damage 类型选择、activityUses、NPC 活动行和恢复写回路径；本次本地结构测试不推广到其他版本。

独立报告、精确源码位置、首轮失败、离线及真实运行原件保存在任务证据根 `.local/forge-angel-of-death-chm-20261016/`，不含凭据。实际浏览器验收及恢复收尾尚待完成时不标整个来源 PASS。
