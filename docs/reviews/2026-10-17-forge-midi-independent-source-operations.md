# Forge 独立 GM 操作与 Midi Other Activity

2026-10-17。本轮共用契约修复的真实UI验收发现：同一Item内的独立条件Damage虽然使用special激活且未绑定自动触发，Midi仍可把它接为主Attack的Other Activity。不得以结构正确或按钮分开宣称GM边界已成立。

## 来源与实际失败

- Mirror：Core14.368 / dnd5e5.3.3 / Midi14.0.11，PID12252，loopback30001；没有改模块配置。
- 实际安装 `Data/modules/midi-qol/midi-qol.js` SHA256：`ca530b51fc4883067c5571f1d985931087c09bb21887f9a24c3ab95d48f3a966`。模块本地LICENSE为MIT，作者Tim Posney；[上游项目](https://gitlab.com/tposney/midi-qol)。这里只核对接口事实，不复制上游实现。
- `.local/forge-common-contract-repair-20261017/browser-native-r1/010-native-readback.json`：主Attack的`otherActivityId`为`""`，独立条件Damage的`midiProperties.otherActivityCompatible`为true。主攻击实际1d20+6得到14，随后完成基础1d8+3piercing窗口，未选择独立Cold、未设置prone，却自动弹出2d6cold窗口。执行器在Cold掷骰前停止并保留DOM/截图/读回；没有将此记为通过。
- 先前009只保存了activation card，rolls=[]；它不能证明掷骰完成，010中实际D20Roll及后续截图另行作为证据，原件不覆盖。

## 精确版本接口事实

本地README第675行说明Other Activity Compatible允许Activity被其他Activity用于额外伤害。实际JS第7232行将其默认设为true；第8830–8874行的otherActivity getter在主Activity的`otherActivityId`为空字符串时自动寻找唯一兼容的兄弟活动；第7960–7990行会调用该活动的rollDamage。主Activity显式`"none"`会提前结束选择。special激活、按钮名称中的条件、完整来源说明均没有参与该选择。

两个竞争解释已由读回和源码区分：不是模型把Cold并入主伤害——正式artifact和实际Doc的主Attack都只有1d8+3piercing；是目标世界的第三方自动链额外选择了独立Damage。它也可能选择单独的后续Save，因此不能仅保护本次Cold或某个怪物名称。

首轮公开检索包括`midi qol "otherActivityCompatible" conditional damage automatically`和`midi qol "other activity" "damage" automatic conditional issue`，找到上游字段说明及旧版发布说明，但没有找到直接匹配此复现的第一手问题报告。没有据此宣称社区共识；当前判断以本机精确版本代码与实际操作为准。

## 本项目适配与待判断项

本轮采用新Actor导入时的窄适配，portable core产物与原始来源保持；对经过来源绑定、明确由GM分别调用的sourceOperations阻止自动Other/trigger链，并在实际Doc读回中校验安全字段。单Actor、Encounter与既有Actor复用不得绕过。没有Midi时保留纯core；遇未核版本须在写入前明确停止，不能猜兼容。旧卡不自动迁移，不改世界设置、不patchMidi原型、不增加宏或通用执行器。

- [x] v36实现及日志已核：native297、Forge590、encounter620与三类types通过；portable generation及Resolver保持，adapter/reader明确有变。
- [x] r5新身份正常创建，实际Attack23/穿刺8完成后无自动Cold，主动选择独立Cold实际2d6=9；031/032原件与截图保存，045刷新后安全字段保持。
- [x] Soul实际Attack18/暗蚀5后无自动CON，主动CON/目标Save后共享池仍spent1；代表真实Blur Cast消费保持。r4完整非施法/双施法池矩阵按同一generation/Resolver字节与整张Actor全等复用，不重复关闭consume或改设置。
- [ ] 其他Midi版本先对照其精确源码与实际Doc重查getter和字段，不能沿用本版本通过结果。
- [ ] CLI/core JSON由其他工具直接导入启用Midi的世界，不经过本Forge适配时的行为，仍是独立待核范围；本轮不推广。

最终验收与原始失败是否保留，以[当前执行记录](../plans/2026-10-17-forge-common-contract-restoration.md)为准。
