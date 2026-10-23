# v39两份新回复的Foundry真实创建验收

结论：成年绿龙和成年黄铜龙均通过普通Forge工作台、批量队列、GM确认完成首次创建及原生读回，18项已有核对通过；两张实际角色卡已查看并截图。没有业务失败，没有修改产品或数据后重跑，AI调用0。

## 输入、目标与过程

- 用户要求及完整原话保存在[当前交接入口](../plans/2026-10-20-forge-ab-current-state.md)。产品基线为`dd2fd2c7f7e55873a880e3b0dd5ed96efc88808f`，产品代码沿用`8584bc9`。
- 只使用[上一轮v39首次通过](2026-10-23-forge-ds-v39-first-pass.md)的新结果，根目录为`forge-ds-dragons-20261023-v39-firstpass-151916`；原始结果收据SHA-256为`af2b6fa7ed48b7ce08cf5022f9112194da7bc648145a6de62cd87ba317bc4d4a`。验收种子与这两份IR逐字段一致，32份该轮文件哈希保持。
- 本地Mirror `127.0.0.1:30001`、`cor-cotn`、GM；Core14.368、dnd5e5.3.3、MIDI-QOL14.0.11，常驻PID38788。没有切换世界、重启服务或操作另一个30051页面。
- 主代理使用官方Chrome连接器操作本次独立页面`651349790`。复用已有验收构建与检查，只替换任务后缀`c8971d`、输入目录和对应证据身份，不修改产品。
- Provider替身只返回上一轮的这两份新IR；工作台、正式生成、队列、IndexedDB、GM确认、Actor创建、Resolver及读回均走实际代码。本阶段discover1／extract2只是本地输入交付计数；联网AI、repair、review均0。
- 两条任务均`attempt 1`、`applied`，正式结论保持accepted。角色ID分别为绿龙`5478624e806fa8f5`、黄铜龙`a92cfa23a5d041ea`。

## 录入结果

| 项目 | 成年绿龙 | 成年黄铜龙 |
| --- | --- | --- |
| 当前／最大HP | 207／207 | 172／172 |
| 生命骰公式 | 18d12 + 90 | 15d12 + 75 |
| AC／CR | 19／15 | 18／13 |
| Items／原生施法入口 | 13／4：普通3＋传奇1 | 16／7：普通6＋传奇1 |
| 施法属性／DC | CHA／17 | CHA／16 |
| 每日施法次数 | Geas独立1次／日 | Detect Thoughts、Control Weather各自独立1次／日 |
| 传奇施法 | Mind Invasion复用Mind Spike；两个入口均三环 | Blazing Light复用Scorching Ray |
| 其余传奇动作 | Noxious Miasma、Pounce | Pounce、Scorching Sands |
| 传奇动作与抗性 | 均基础3、巢穴4；传奇动作自身回合开始恢复 | 同左 |

六个传奇动作条目均有传奇时机、费用1。两个传奇施法入口正确使用原法术、施法属性和DC；Resolver均hydrated，分别产生4／7个所属Spell缓存。普通按意愿施法未增加次数上限；三项每日法术具有独立每日恢复设置。

黄铜龙Shapechange保留完整的形态／临时HP／专注限制并交给GM，没有生成无限制的普通Cast。Sleep Breath保留再次豁免、第二次失败、10分钟及受伤／近身唤醒结束条件；复杂阶段没有被简化成永久状态。Noxious Miasma和Scorching Sands完整特殊限制保留给GM；本次没有触发这些能力。

## 证据与恢复

证据根：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-ds-v39-native-20261023-c8971d/`。

- `preflight.json`、`asset-install.json`、`seed.json`：产品、目标、工具和新输入身份；工具源码及构建产物留存。
- `after-apply.json`：从页面展示的验收JSON分段完整读取，500,694字符，包含实际角色、队列、启用模块及前后保护状态。
- `verify-native.ps1`、`semantic-readback.json`：复用18项来源／原生断言，全部通过。
- `field-readback.json`：在同一收据上补核对全部六个传奇条目、三项每日法术池和新IR身份；没有再次执行生成／创建。
- `green-native-card.png`、`brass-native-card.png`：实际原生角色卡。
- `cleanup.json`、`ui-cleanup-final.json`、`static-cleanup.json`、`browser-cleanup.json`：任务角色、宏`j3Bu0dN0S7gzcRGz`、三项QA存储、两份静态工具和任务页面已移除，原世界ID、Guard及24Token、视图／时间、原浏览器scope核对一致。

Forge安装脚本仍为`ca385cd4ba571ba1d6203ce4ec17beee57b19c72aace51fedaabc29228e6b9e2`，Resolver仍为`68f6cd75d39f6eb56e95dd57f45e46e7b4ec3b97cc9114f57d25f7fb1387d390`，常驻服务保留。准备时曾遇页面读取超时及已关闭对话框的旧按钮引用；刷新只读UI状态后继续，没有重复队列准备、生成或创建。MCP世界连接器当时未连接，实际验收使用既有Chrome入口，不调整模块或连接配置。

## 范围

本次证明这两份v39新结果能实际创建，并正确录入所要求的HP、施法及传奇动作数据。没有执行法术掷骰、伤害扣血、实际资源消费、回合推进、状态到期或生产测试，不把字段录入通过扩成完整玩法通过。

本轮只有验收记录变化，用户入口、步骤、支持范围和产品实现未变，既有手册与代码检查继续适用；不扩展测试、不改hook源码／配置、不合并或推送。
