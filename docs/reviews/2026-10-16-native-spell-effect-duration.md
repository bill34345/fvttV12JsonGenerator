# 原生法术持续时间与实际效果持续时间

本轮 Mirror 固定 Core14.368 / dnd5e5.3.3。正常 Forge 导入的新死亡天使已完成六条实际法术匹配与原生缓存归属；完整260591字符读回 SHA-256 `795fee85450f217e5edf8ece7fbe0b9dc0eaa9705e951ed3ea376da56954eb6a` 保留。旧300 Actor /94 Macro指纹、worldTime和全局activeScene均不变。此证据只证明水合，不替代施法。

Chrome实际点击易容术的普通Midi Utility，再点击聊天卡“Apply Dynamic Effects”，卡面24小时而应用的“乔装”只有1小时。因此24小时变体的实机验收失败，不能把卡面参数正确当作修好。该卡、已应用效果、截图及原始数据保留；独立攻击、Save、次数与重载另验。

## 精确来源与接口事实

- `bun run references verify`：5.3.3与既有6.x缓存校验通过；本轮实现依据仅5.3.3。精确源码位于配置缓存`dnd5e/5.3.3/repo`，并对照已安装`dnd5e.mjs`。
- 官方 [release-5.3.3 CastActivity](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/cast.mjs) 的 `getCachedSpellData()`先复制源Spell全部效果，再附加Cast附魔；`getSpellChanges()`覆盖`system.duration`，没有同步修改复制来的base ActiveEffect duration。
- 同tag的 [AppliedEffectField](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/data/activity/fields/applied-effect-field.mjs) 用明确`_id`引用Item效果，不能根据效果中文名称猜绑定。
- 已安装Midi的普通应用流程读取来源效果文档进行应用。完整读回中，易容术缓存原始Spell时长1hour，引用base效果`duration.value=3600/units=seconds`，Cast覆盖24hour；另一个Check Activity没有effects引用。这与实际1小时结果一致。没有修改Midi或dnd5e原型、Compendium或已应用效果来伪造通过。

## 修复范围与反证

原生创建/getter的完整投影与归属校验先保持；解析器只在严格拥有的缓存完成最后合并后投影来源持续时间。仅当效果由该源法术Activity明确引用、type=base、transfer=false、固定秒数等于原法术完整时长时，才把秒数改为来源Cast覆盖值。效果正文、expiry、其它规则和引用保持。独立短时效果、未引用效果、附魔、transfer、round/turn或无期限效果不被猜测转换，Keep保留人工内容。

通过公开Actor.updateEmbeddedDocuments更新owned Spell的effects及同次完整内容hash；重读完整投影，再进入既有事务验证。原生journal保留原始投影；受管后记录本次明确计划的完整新投影，兼容公共写入在提交前/后拒绝回执。只有严格拥有的缓存可按原始或完整计划状态回退，未拥有缓存的收养仍只允许原始getter投影；未知或外来变更继续拒绝。

新增聚焦检查针对实际1小时→24小时字段、不同期限/未引用/transfer等反例、Keep/Overwrite、后续失败及提交前后拒绝的完整回退。早期新增测试首先因fixture遗漏来源evidence被拒，补齐fixture后又抓到native journal仍按1小时比较的回退问题，原始失败日志均保留。最终检查与真实24小时效果复验尚待完成；不推广到未实测的6.x或其它效果组合。

## 当前离线检查

`native-duration-resolver-r4.txt`：386通过、0失败；`native-duration-types-r2.txt`、`native-duration-build-r2.txt`、`native-duration-architecture.txt`通过。`native-effect-duration-pair-replay-r2.json`直接使用两份已保存原始native数据，严格保留expiry/正文/其它效果，仅关联效果duration.value从3600变86400。第一版replay报告的字段标签有多余`_duration`，原件保留，r2改正标签并在更严格expiry检查后复验。没有新增模型或浏览器调用。

代码尚未安装；已有浏览器批次继续独立攻击/Save/每日次数及重载，另一个Luna/medium任务只读复查时长与事务边界。两者回传后再决定窄安装与实际应用效果复验，不把386项通过升级为原生24小时已通过。

## 独立复查后的收紧

Luna/medium只读复查指出同秒数不证明语义继承，以及整组effects写回可能覆盖并发GM编辑。候选因此改成已复核来源语义表：精确PHB2024 DisguiseSelf UUID、canonical identifier和appearance effect ID；仍须满足原法术Activity引用、base/nontransfer、固定秒数相等。其它同秒数linked效果不变，并将原时限限定加到GM literalRestrictions报告，保留匹配与原生Cast可做部分，不冒充效果期限已实现。新增同Spell同秒数但独立linked效果及未知来源反例。该表是来源法术语义适配，未按死亡天使名称、Actor ID或模型输出补丁处理；新来源必须另作语义复核。

写入改为owned Spell公开`updateEmbeddedDocuments(ActiveEffect)`，负载仅effect ID和duration.value；不会提交整组effects。最终完整投影核对和hash收尾保持。并发另一效果编辑反例证明该编辑保留，最终投影拒绝，未被数组覆盖。新390项全部通过，typecheck与串行build通过；架构import图未变化，复用已通过的该图检查。实际原始数据r3回放只改3600→86400且无未确认继承。公共定点更新仍须实际Apply/重载验证，故未安装进行中的客户端。

## 2026-10-17 原生验收补记

以上“未安装／未执行”是当时状态，原记录保留。最终候选现已在同一 Mirror Core14.368/dnd5e5.3.3 正常导入新身份卡 `cbd29d4ce116bdc4`，6/6真实Cast水合，已复核的易容术base效果为86400秒。父控亲自从角色卡施法选择器选择易容术，再选择来源法术自身的Midi Utility，正常点击聊天卡“应用动态效果”；实际Actor效果 `JAhYeNO3DbSinh38` 的duration.value=86400、units=seconds、expiry=turnStart，来源指向该卡owned cache原生效果，没有直接写入目标结果。

普通重载后实际效果、缓存及6/6状态保留。随后只移除本轮两个已核对哈希的验收文件并恢复Forge纯业务index，再次正常重载，原生效果编辑器仍显示86400秒；只读查看，未提交更改。受保护302Actor／94Macro指纹无变化，worldTime及全局activeScene不变。该实际24小时参数与普通Apply路径通过，不表示已经真实等待24小时到期，也不推广至未复核的其他效果或6.x。

完整结果和证据索引见[最终本地验收](../acceptance/2026-10-17-forge-legacy-restoration-native.md)。旧1小时失败卡及其原始读回、第一次缓存失败原件均保留。
