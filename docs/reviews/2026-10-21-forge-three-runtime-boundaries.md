# Forge三项剩余实机问题：固定版本与一手线索

状态：三项原因已定位，限定实机、业务重载及精确最终清理已通过，具体层级以接受记录为准。目标仅本地Mirror Core14.368/dnd5e5.3.3/Midi14.0.11；2024规则，0新生成模型调用。

## 已核实来源

- 安装中的dnd5e/dnd5e.mjs 56965-56985及64649-64669：剩余次数UI使用data-name=system.uses.value，正常change处理器转换为持久化system.uses.spent。templates/inventory/columns/uses.hbs的input无name，不能只按普通form提交推断保存。
- 前批business-final-before-reload.json中的2024Geas原生cache：唯一dnd5eactivity000 Save带WIS豁免/魅惑及5d10 psychic；完整描述要求While Charmed且违令、一日最多一次。安装Midi getAutoRollDamage以GM的gmAutoDamage=always决定自动伤害，禁Other不足以隔离同一Save的damage。
- 安装Midi14.0.11 WorkflowState_AwaitTemplate在needTemplate且没有文档时Suspend。前批主动取消模板的等待符合前置条件，尚未证明正常放置/显示缺陷。

## 有范围的一手检索及反证

通过AnySearch检索github.com/foundryvtt/dnd5e/issues limited uses/spent/NPC、tposney/midi-qol Geas/AwaitTemplate及相应GitLab，未找到可比同版本同指纹原始issue。候选[独立伤害使用者问题](https://www.reddit.com/r/FoundryVTT/comments/177vfyo/dnd5e_help_midi_qol_how_roll_damage_without/)和[旧版本次数同步问题](https://www.reddit.com/r/FoundryVTT/comments/l3cwik/5e_macro_help_syncing_limited_use_valuesmax_to/)提取均仅返回Prove your humanity，原件保留本批.local；没有可读原文，不推断用户成功或采用旧宏/旧字段。

这些检索没有改变固定源码结论，不能证明当前是普遍上游bug，也不能用摘要替代实机。待判断本地化：仅核实当前owned缓存兼容与原生表单交互，不引入外部模块。

## 最小反证检查和适配边界

- Misty：一次正常UI剩余3→2，观察写入UUID/field/真实change、世界Actor和未链接Token数据，再重开/整页重载；若原生正常保存，不添加产品修复。
- Noxious：同一冻结包，任务自有空Scene实际20ft球落点，核对Save/2d6、同卡数字及一次传奇消费；不自动处理AC-2/冷却。
- Geas：owned缓存仅在完整已知来源条件与准确Save/damage结构成立时分离5d10，原Save/effect/DC/identity和全文保留，独立GM伤害不自动串起/不再扣Cast池。Keep、Overwrite、读回及回滚继续严格；未知结构不按名字放行，compendium与最终JSON不改。

继续执行、证据与剩余边界见[当前MD](../plans/2026-10-20-forge-ab-current-state.md)。

## 最终定位与范围

Misty正常真实change已证明持久化，旧定位器无change不构成产品写后覆盖证据；没有因此改监听器。Noxious正常放模板后同卡显示5，未将两次独立Save19/20或Completed/suspended标签冒充完整自动结算。

Geas的提前伤害来自官方2024的混合Save结构与本地Midi自动伤害组合。owned缓存分离后出现两次真实Apply失败，已保留。新增GM活动的condition在原生内存中为own undefined、JSON落盘省略，比较器空字符串假设因此漏在离线复验中；live元数据与pure helper同路径复现。现在写完整来源rule到原生Trigger说明，不增Midi自动条件，严格缺失/改文检查不变。回滚origin仅按精确归属和完整Effect业务补偿；原生已证实恢复。剩余时间差仅排_stats三项审计字段，其他完整业务/来源/版本仍校验。

最终ff0b候选503项通过、原生正常维护成功。普通施法没有伤害配置或5d10，只扣一次每日次数；Guard唯一Save自然1失败，GM通过原卡应用30天源Charm后，明确裁定违令和当日首次，再主动掷独立5d10=31，不重复扣次、不ApplyHP。原cache/Cast/source/源Effect保留，三World/三synthetic角色完整重载相等。GM活动特殊范围；聊天底部仍是法术本体的60尺摘要，未测远距伤害；30天自然到期也未等待。另观察到一次音效资源加载失败，单独文件明确为原工具回执转录而非新取证，不为此重放业务或扩大音效模块修复。

这些证据确认了本地具体交互与缓存适配问题。没有找到可读对口的一手issue，不宣称外部社区已验证同一修复。不引入外部模块。后续新候选仍须按相同精确版本、完整来源、写后读回与GM条件边界复查，不复用本轮作为任意来源保证。
