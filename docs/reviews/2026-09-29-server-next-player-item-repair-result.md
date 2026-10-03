# ServerNext 玩家物品修复最终结果（2026-09-29）

## 结论

**本轮新增来源授权范围：6件全部PASS。原始7件总目标：6/7，雅灵1件仍待查，不能标记全部完成。**

目标固定 ServerNext / 127.0.0.1:30002 / cor-cotn / Foundry14.368 / dnd5e6.0.2。六件通过持久化、完整人物数据对比、27条引用解析、普通物品窗口及正常重登检查。临时Macro已删除，服务已正常关闭；保留27条永久来源与文件夹。没有提交、合并或推送。

## 逐件结果

所有已修复条目的共同错误：ItemGrant配置引用了Actor内嵌Item，而dnd5e6.0.2该字段只接受合法独立来源。按用户新增来源授权，来源内容取自人物原有能力，替换配置中的27个UUID；保留原Item/能力ID、等级、选择、授予记录及其余人物数据。

| 人物 | 原条目 | 坏引用数 / 本次修改 | 重登 | 普通窗口 |
|---|---|---|---|---|
| 卡勒姆·维雷 | 血猎手 | 7条内嵌引用→已核验世界来源 | PASS | PASS |
| 奥黛塔.米兰德拉 | 牧师 | 6条内嵌引用→已核验世界来源 | PASS | PASS |
| 斯兰沃德·S·艾莉儿 | 海精灵 | 9条内嵌引用→已核验世界来源 | PASS | PASS |
| 斯兰沃德·S·艾莉儿 | 前邪教徒 | 1条内嵌引用→已核验世界来源 | PASS | PASS |
| 贝伦席拉·冯·卡尔斯卡特 | 法师 | 3条内嵌引用→已核验世界来源 | PASS | PASS |
| 贝伦席拉·冯·卡尔斯卡特 | 沃什塔克特工 | 1条内嵌引用→已核验世界来源 | PASS | PASS |
| 泽菲尔·艾什伍德 | 雅灵 | 7条旧引用保持；其中1个原能力对象缺失 | 未修复 | 未纳入本轮修复 |

逐项Actor/Item ID、所有旧→新UUID、完整人物校验值、截图路径和SHA-256见[最终机器回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/player-item-repair-final-receipt-20260929.json>)。

## 保持不变与证据

- 四名人物物品总数：卡勒姆32、奥黛塔51、艾莉儿36、贝伦席拉47；Actor/Item/已有能力ID以及HP、资源、背包、权限等原始数据保持。对比仅允许核定UUID修改、明确的系统写入统计元数据，以及海精灵Swim Speed中一个已由磁盘源码+两次登录证明自动生成的内部change ID。
- 27来源逐项可解析、类型与内容验证通过；只新增27个来源和1文件夹，没有替代或移动人物原有能力。创建者GM owner=3是实际创建流程字段，已逐条核对，不是放宽所有权限检查。
- [重登完整回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/library-relogin-v11.json>)四Actor/27来源/inventory/folder/保护对象全部PASS；未通过真实升级或降级来测试。
- 旧测试副本LN5PLqTTdx0l7o7w及雅灵Actor完整hash保持，均未修。
- `bun run test:foundry-ops` 最终346pass/0fail（37项本轮相关回归）。历史Bun native崩溃记录保留，最终完整运行已通过。

## UI证据父审

不按执行器PASS标签或文件名自动结案。父任务实际查看了最终有效图：

- 卡勒姆·维雷 / 血猎手：[窗口截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/library-item-callum-blood-hunter-v11.jpg>)。
- 奥黛塔.米兰德拉 / 牧师：[窗口截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/library-item-odetta-cleric-v11.jpg>)。
- 斯兰沃德·S·艾莉儿 / 海精灵：[窗口截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/ui-v12-sea-elf.jpg>)。
- 斯兰沃德·S·艾莉儿 / 前邪教徒：[窗口截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/ui-v12-ex-cultist.jpg>)。
- 贝伦席拉·冯·卡尔斯卡特 / 法师：[窗口截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/ui-v12-wizard.jpg>)。
- 贝伦席拉·冯·卡尔斯卡特 / 沃什塔克特工：[窗口截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/parent-ui-volstrucker-final.png>)。

v11的部分命名截图没有显示对应Item前景窗口，v12最后一张沃什塔克特工图仍为人物卡+法师旧窗口。最终只采用上述白名单。最后一件由父任务按chrome-delegation-dev困难步骤接管：通过DOM核Actor entryId和物品data-item-id，单击正常人物卡背景条目，AX明确出现`ItemSheet5e-Actor-mPCqZoTgUrq2E4FL-Item-SK5GP9LvoSDk0BIB`及“沃什塔克特工 / Background”，实际核图后接受。旧错图保留为过程证据，不列为验收通过图。

## 收尾、错误和限制

- 临时Macro iVGta3mQEvac49mo已通过正常UI删除；代码、测试、诊断与证据文件保留。永久来源/文件夹不清理，所有既有测试对象保留。
- 最后一次父任务只读验收用5分16秒；正常Return to Setup触发关闭、APIinactive、23锁独占后停止精确PID59804，端口30002空闲。见[最终收尾回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/parent-final-ui-receipt.json>)。
- v11共42分35秒，超30分钟12分35秒，是明确流程偏差；v12共15分29秒，未超硬上限但错过8/10分钟软目标。不能因数据PASS抹去这些偏差。
- 六修复Item的初始化错误在父任务新登录错误采集中为0；仍有雅灵1、旧测试副本1、Pixi2。执行器各100条日志样本error0不代表全部旧错误消失。见[父任务错误分类](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/parent-relogin-errors-v11.json>)。
- Setup阶段另见语言回退、受保护模块签名错误；404/缺失图标与14缺包未处理，不计为已解决。
- 雅灵缺失原引用为`Actor.MkOcySfY7k3A1AAl.Item.oFrdemKo1y1Hcrx0`；不猜造能力、不清空配置。后续先追溯这一来源缺口。自定义状态与触发器源码衔接仍单列下一阶段，没有混入本轮写入。

详细实施/失败恢复历史见[实施记录](./2026-09-28-server-next-player-item-repair.md)，回传遗漏与纠正见[回传恢复](./2026-09-29-server-next-callback-recovery.md)。
