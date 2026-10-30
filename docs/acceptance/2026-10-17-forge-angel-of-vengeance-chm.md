# 复仇天使：同 CHM 新来源的正式生成和原生验收

本轮复仇天使用例通过正式来源核对、实际导入、普通攻击／伤害、两种目标豁免、范围、资源消耗、真实法术与重载验收。首次并未直接成功：新来源暴露的共用入口缺口已保存失败、补回归并修复。没有按死亡天使或复仇天使名称分支生成规则，没有手改最终 Actor JSON，也没有提交、合并或推送。

## 来源和适用边界

- 同一 CHM：`H:\Download\DND五版不全书26.08.06之颤栗吧，血族降临！.chm`，SHA-256 `6df351581640de743c64a1c557d577930257bf7c7a89980363cc5ce2e7fa529e`。
- 页：`其他\beyond drops\26.6\复仇天使.htm`，原始 GBK HTML SHA-256 `005037332bdeb76d8566e5e46776265bc5cfe7cb490dc35065484cb4f3bf196b`。
- 转为 Markdown 时只保留排版和表格边界，每个原始文本节点恰好一次；内容按忽略排版符号／空白的比较完全一致。提交 LF 来源 SHA-256 `3e1e5024a1a2a0d94a173981d2a9c9e2c7efcb2260fb22d816d494b6db4ee6de`。
- 该怪的圆环命中后擒抱，逃脱 DC15 是检定；它没有“同一攻击 Item 后接二次 Save”。不瞑之眼是另一个行动，只允许一名被本天使擒抱的生物作 CHA15 Save。本次不能替代另一个新怪的同 Item 二次 Save 实机证明，原死亡天使证据继续保留。
- 目标为原 `server-mirror/cor-cotn`，`127.0.0.1:30001`，Core14.368/dnd5e5.3.3，GM；PID61824，Administrator，F盘原dataPath。没有另建实例或重启常驻服务。

## 正常 DeepSeek 和正式链路

证据根为 `.local/forge-vengeance-chm-20261017/`。第一次真实模型回复将“全部”正确提成all，但静态表缺少该中文别名而阻断；第二次模型将custom心灵感应译成英语，被原文核对拒绝。两份回复／原始HTTP响应／失败报告原样保留。

复用第一次实际回复的离线诊断发现：单一法术的“1/日”未接入；无空格中英分区标题被独立validator拒绝；中文Save／充能语法及带条件状态的普通攻击会退化。修复均在共用语法和来源核对入口，数字来自原文，未按怪物名称、ID、固定DC或固定骰式判断。custom语言提示升级v4，要求逐字保留原文及单位。

最终 `normal-deepseek-run-3/` 重新正常调用当前 `createEncounterIntakeProviders → generateEncounterFromHumanMarkdown`：实际1次HTTP、0repair、ready_for_gm_review，一只Actor、零宏。原文、实际回复、IR、rendered Markdown、正式Actor与source package同源，`verify-intake.txt` 和 `verify-actor.txt` 通过。生成调用的是正常生产函数及既有DeepSeek配置；没有声称在浏览器资料输入框点AI生成。本地GM预览／确认导入和后续操作则在真实Chrome页面执行。

独立Luna/medium复查补出两项反例，先红灯再修复：逗号／句号后的条件额外伤害不可无条件加入；首个At Will前的Shared授予不可跳过。明确下一句0HP独立Save仍保留此前额外伤害。最后用同一run3实际请求与回复零HTTP重放，IR和完整正式Actor均逐字段相同，见 `final-source-parity.json`，所以复用已完成的该卡原生操作，没有为报告或反例修复重投。

## 实际新卡和操作

新Actor：`cbb11e70a61fef12`，显示名 `复仇天使 Angel of Vengeance`。AC18、HP130、20d10+20、CR9、XP5000、PB4、先攻+7、六项属性20/16/12/16/12/14、CON Save+5、运动+9、光耀免疫、真视120和被动察觉11逐项核对。

| 功能 | 真实操作和结果 |
| --- | --- |
| 圆环 | 卡面+9、触及10尺、2d8+5钝击。普通投掷消息`lgYQSuRRHFExlHpH`：攻击1d20+5+4，普通伤害2d8+5。没有强制骰值。 |
| 不瞑之眼 | 原生CHA15 Save，8d6心灵、成功半伤；消息`RKWDfDmuQ471l28R`。只选本轮靶`7SklwgiZQZbI4STa`，该靶实际投出CHA Save，消息`xFeM4U6QCGObIJkv`。 |
| 天谴之锥 | 原生WIS15 Save、4d8光耀、成功半伤；消息`7i4onSSEOjlUSZEn`。正常使用能力、确认消耗、在本轮拥有的测试场景正常放置锥形，并投普通伤害。本轮靶实际WIS Save消息`SAWxDbkoCOmJtCE0`。 |
| 范围 | 实际Region`zZjpPFdgwRAC2Mjt`，shape=cone，原生dimensions.size=90，origin指向新卡天谴之锥活动。模板自动重选曾列入旧Token，未对旧卡投骰或应用伤害；重选本轮靶后完成Save。敌我资格仍由GM判断。 |
| 充能 | 天谴之锥从spent0/max1正常消耗为spent1/max1，recovery=recharge、阈值5；没有直接改计数器，没有反复掷充能直到成功。 |
| 三项真实法术 | 3/3水合，来源为真实PHB Spell；原生Cast使用INT、DC15、免V/S/M。易容／生物定位随意，位面转移1/day。 |
| 每日次数 | 正常从施法主Item选择位面转移、确认施法，消息`pjCeo2F1KC42cXEb`，独立activity uses变为spent1/max1、day恢复；两项随意法术次数保持不变。 |
| 实际24小时效果 | 正常选择易容术的来源法术Utility，再点击“应用动态效果”，消息`beA0R9s4xXaYaN0F`。新卡实际乔装效果`EIsw5VXV1aHODP8e`为86400秒，origin指向本卡匹配法术cache的原生效果。普通重载和纯业务重载读回仍为86400秒。未等24小时验证自然到期。 |

圆环本次实际命中，中型靶符合原文体型条件，GM按规则裁定擒抱成立。不瞑之眼的合法目标按此GM前提选择；没有声称引擎自动验证擒抱关系。目标HP仍40，没有点击伤害应用来重测Foundry的命中／扣血算法。

## 可做部分与GM部分

可做的攻击、Save、伤害、半伤、锥形模板和资源均保留为正常原生活动。体型上限、圆环最多五个擒抱、受擒／束缚及逃脱、眼的擒抱关系、锥形的敌我选择与“失能至目标下回合末”，仍保留完整GM规则；本轮没有准确的来源生命周期实现，因此未生成永久失能冒充该期限已实现。魔法抗性、多重攻击仍为完整GM能力。

此用例证明共用中文来源入口能处理第二只不同属性、DC、攻击和资源的怪物，不能推出任意怪物／所有句式都通过。独立复查另登记一个未处理的英文条件额外伤害句号尾缀静态风险，属于未修改的英文分支，尚无本轮实证反例；不纳入此CHM中文用例的通过结论。报告在 `independent-review.md`，不把未知写成PASS。

## 防回退、保存和收尾

最终检查：216项分段提取／来源用例、90项基础操作、18项完整来源与workflow用例通过，共324项；typecheck:all通过；5个受改业务源码局部anti-overfit通过。新增来源fixture使用真实第一次模型回复，独立1/day正例与多个法术共享负例分开。导入模块／Resolver未改Hook或版本接口，依赖图节点和边不变，复用此前有效架构检查。手册人工核对受影响四项，补支持范围，重生成HTML，33项handbook:check通过。

重载后的实际新卡fingerprint为 `07cf9f03e655acabd09e07476949c70ee29c69ad55cbb1e32fda372a9321c733`。303张既有Actor与94个Macro指纹无变化；worldTime仍21085811，全局activeScene仍`EBJYd289N5uyTmlC`。旧卡、失败原件、本轮新卡与靶均保留。

最后只按绝对路径和SHA移除本轮两个拥有的验收文件，Forge恢复精确16文件，Resolver9文件保持；未删除世界文档或备份。最终Forge index磁盘／HTTP SHA-256 `7b3a97fb179a9d1891731b4a6a495f25614f51abfd3bddc37b1e862359e0cce5`。纯业务重载后验收入口不存在，卡面攻击、两个Save与真实施法入口仍在。效果编辑器字段读取为86400秒，未提交修改；该次截图因窗口折叠没拍到字段，原失败截图保留并标为非功能证据，不以截图文件存在冒充视觉通过。

关键证据：`native/actual-operations.json`、`native/post-reload.json`、`native/pure-business-ui.json`、`native/pure-business-restoration.json`，各附官方工具原件定位、SHA或完整安装清单。下图均为纯业务重载后的原始截图字节。

![复仇天使卡面](../../.local/forge-vengeance-chm-20261017/native/pure-card.jpg)

![三项真实法术入口](../../.local/forge-vengeance-chm-20261017/native/pure-casts.jpg)
