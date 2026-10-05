# Vision 5e / Item Macro 精确候选证据（2026-09-29）

本页是来源与实现证据，不保存另一份总状态。当前进度仍只在[迁移清单](../plan/server-next-migration-handoff-20260927.md)。目标Foundry14.368/dnd5e6.0.2；本文所记阶段未安装这两个候选。

## 上游固定与差异

- [Vision5e v3.2.2](https://github.com/dev7355608/vision-5e/releases/tag/v3.2.2)：完整release正文为Fixed #192，发布2026-08-06，commit `0876fbb32eb43bd4562683d80dedfdd9fb62fbcf`；正式ZIP SHA-256 `c7a9bac2d6b0791fe777fde5a56f76cf0f43f543f78e721dd0dfec8966003058`。已有Foundry14分支未否认；系统manifest仍verified5.3.3。
- [Item Macro v3.0.1](https://github.com/Foundry-Workshop/Item-Macro/releases/tag/v3.0.1)：正式release正文为空，发布2025-07-10，commit `035ade6a94a6b2e433b1a1f64432af3d6b87434a`；正式ZIP SHA-256 `1b14538a7e809ce97e395616bfb069609c3833053dd1b07f16f6c2c912724714`，真实ID为`itemacro`。24个mjs逐文件证明正式ZIP与固定tag代码相同。
- 两者MIT许可保留。[upstream-lock.json](../../foundry-modules/server-next-external-candidates/vision-macro/upstream-lock.json)存完整来源、固定commit及资产hash。没有重做全套Issue调查；以本日已有专题证据为起点刷新精确发行资产。

## 目标源码与已复现缺口

Vision的`actor.mjs`已有5.3+ `senses.ranges`读取；本机精确6.0.2 `dnd5e.mjs:7739`及`:84239`仍使用这些字段，Item validProperties/Set、ActiveEffect system.magical和14代类扩展路径已有对应实现。相关离线读取检查通过，未凭版本号重写。

实际缺口：`isPoisonousAttack`把`activity.damage.critical`当字符串；目标`:20939`定义为含`bonus`的SchemaField，`:21217`实际读取critical.bonus。以`{critical:{bonus:"1d6[poison]"}}`复现旧代码false；本地修复优先读`.bonus`，保留旧字符串fallback，测试变true且火焰反例false。仅此一处功能补丁，不声称旧版Issue已在Next复现。

Item Macro已有`preUseActivity`和续用代码。本机6.0.2 `dnd5e.mjs:17633`同步Hooks.call，false取消；既有模块正确同步返回false，并在宏返回true后设置skipItemMacro续用。离线证明同一activity/config被续用一次，skip防递归有效；没有无根据重写这条流程。

实际复现两处问题：

1. `ItemMacroConfig._onExecute`传入裸event，而`ItemMacro.#getEvent`读取scope.event，导致手动按钮事件丢失。改为等待`executeMacro({event})`，没有全局window.event fallback。
2. 保存后赋值`this.object=newMacro`，没有更新V14 DocumentSheetV2实际绑定的只读document引用（本机`client/applications/api/document-sheet.mjs:90`）。原回归sheet.document.command仍old；改为对现有合成document调用updateSource(newMacro.toObject())，保持文档引用并同步表单内容。持久化仍走item.setMacro。

## 候选与证据层级

候选分别为 **vision-5e3.2.2+servernext.1**、**itemacro3.0.1+servernext.1**。Local标题/版本明确，移除官方manifest/download自动更新链接，保留原作者与许可及原verified声明，不以改兼容字段冒充目标适配。

Vision按固定package-lock依赖及上游Rollup构建；Item Macro按固定源码及正式包目录组织打包，逐个mjs与修复源核对。声明资源、打包manifest一致性及9项针对检查通过（源码读取/实际Macro执行作用域/同步Hook续用/Token固定ID/异步活动完成等待）。安装器verify-only通过；没有对运行中Next写包。

[candidate-inventory.json](../../foundry-modules/server-next-external-candidates/vision-macro/candidate-inventory.json)存逐文件hash。候选ZIP分别为`228e237a24d1ea9d003cbc324bb3ca46c6c22c1c9096cb4d3782439cf3a7c901`和`56c4148e69e750beafe5e768d8bd8cd681379cbcdcf18ee25941432bc81a5b80`。

## 已准备的限定运行验收

[NEXT-VM-20260929-03契约](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/vision-macro-20260929/current-chrome-dispatch.json>)目前仅PREPARED_NOT_DISPATCHED，不与正在运行的Item Piles恢复抢占Chrome或服务。

同一组临时对象完成：真实Item Macro界面编辑/保存/手动执行；显式event/位置参数API；原生utility activity真实postUse续用；感官60→90→60传播；实际魔法/毒素状态；一次玩家登录检查黑暗中30ft可见、80ft不可见及重载。所有脚本、正常UI导入文件、初始化/读回/清理均已预制；不交给执行器临时开发。清理只涉及本批两个Actor及其具名物品/效果、一个Scene/三Token、一个Folder/User/Controls Macro，并恢复原active/viewed scene、pause和defaultmacro。

以上不是运行或全功能证明：完整Vision墙体/特殊感官/多语言识别、Item Macro其它系统/全部旧宏配方未承诺。原Pixi/CustomCSS/旧人物错误按阶段留证，不能因名字未匹配就判无关；新引入错误仍为本批失败。
