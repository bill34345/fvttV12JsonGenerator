# Item Piles 首次本地适配证据（2026-09-29）

本页保存具体来源、缺陷和候选证据；当前进度只在[唯一清单](../plan/server-next-migration-handoff-20260927.md)。目标精确为Foundry14.368/dnd5e6.0.2，无全功能兼容声明。

## 固定来源与候选变化

- 官方基础包[3.3.4](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/releases/tag/3.3.4)，commit `85ab971406623fb1c5d01eb1f093fe4855ede6e4`，正式ZIP SHA-256 `e2531f17e361a43dcccd721ab70123c63bc349c80976420f38113c9ea0ceac63`。完整release正文已读取。
- 官方D&D适配包[1.1.0](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/releases/tag/1.1.0)，正式ID **itempilesdnd5e**，正式ZIP SHA-256 `6f7cc3335ab6ee9a9c8b5e7b25564bfb616562db3a9ffe31dc828021a660ca56`。tag树只有manifest/README/LICENSE；实际可读适配代码取自固定正式ZIP的`dist/module.js`，没有把tag manifest1.0.0误判为发行错版。
- 依赖socketlib v1.1.4、lib-wrapper1.13.5.1已安装，逐文件等于固定正式ZIP。没有为此覆盖依赖。
- 原准备采用正式基础3.3.4+本地适配包；容器ID回归证明基础层还有断链后，首轮构建改为 **item-piles3.3.4+servernext.1 + itempilesdnd5e1.1.0+servernext.1**。下述真实注册时序失败又将适配包修为local2，基础local1保持。每次变化有具体证据，不回到已排除方案，不冒充官方原包。两仓MIT许可均保留。

## 三个具体缺陷与失败证据

1. 适配包`VERSIONS["5.0.0"]`展开baseConfig，恢复了使用`Math.min(CONFIG.DND5E.attunementTypes.REQUIRED, ...)`的旧数值型转换。目标系统`dnd5e.mjs:29211`为字符串attunement，`:50594`枚举键为required/optional。原包回归实际得到`NaN`，预期`required`。修复在精确6.0.2注册中复用上游4.0.0已有的字符串转换，保留attunement并重置持有人attuned/equipped。
2. 同一适配分支的容器TRANSFER返回新数组；基础`src/API/private-api.js`的`_transferItems`和`_dropItems`都忽略返回值，只继续用传入数组。原包回归列表只有bag，缺pouch/rope/gem。修复修改调用方实际数组，保留原物品文档内容并去重遍历后代。
3. 基础`src/helpers/utilities.js:ensureValidIds`只记录根与直接子项，嵌套pouch没有建立供gem查询的父ID映射。实际回归gem.container为`""`，预期pouch的新ID。仅对`dnd5e / 6.0.2`使用两遍映射：先分配全部新ID，再恢复父引用；其他系统/版本走原路径。保留父本来为空的值，不忽略flags/effects。

目标系统精确已安装源码另外确认：`:29474`container为idOnly，quantity/price字段仍有效；`:9250`currency为五种标量映射；`:29959`容器数据持有独立currency；`:29601`仍有rarity读取器。因此没有凭版本号重写货币/售价字段。组折扣、完整商店/交易/金库及法术卷轴不在本批证明范围。

## 构建与限定验收

源码/固定资产锁/最小补丁在[候选目录](../../foundry-modules/server-next-external-candidates/item-piles)。基础用固定package-lock执行npm ci及上游Vite生产构建，331模块，构建通过；保留上游Svelte可访问性/未用CSS、Sass和browserslist警告，没有修改无关UI。六项离线测试通过，覆盖实际重建基础bundle和适配包、payload保持、容器/货币、工具误目标拒绝及started操作不重放。安装器`--verify-only`通过，未提前修改运行中的Next。

本批[契约](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929/current-chrome-dispatch.json>)要求：先正常Return to Setup，再按活进程身份安装/恢复；真实UI领取一个Loose物品；模块公开API分别转移同调物品、3gp2sp、嵌套容器；核数量/货币守恒和完整物品差异，重登持久化。API不冒充UI。比较只放行已知新ID和精确_stats时间/修改者字段，以及本操作预期数量/持有人状态/父容器映射；任何其他flags/effects/权限差异都保留为失败证据。成功后仅清理本批两人物、一个文件夹、嵌入物品及Controls Macro；若部分失败则保留给父任务诊断，不盲重放。

## 首轮运行发现与工具v2恢复依据

两包安装、开关与重登已执行；真实UI领取Loose一件（Source4/Receiver1）及3gp2sp转移（7gp3sp/4gp2sp，总1150cp）成立。刀和袋子的Macro调用使用公开文档列出的string-ID形式，但基础`API/api.js:1535`对原始itemData调用`getProperty(..., "flags.item-piles.item")`；精确Foundry14.368 `common/utils/helpers.mjs:824`执行`key in object`，遇字符串在socket派发前即抛TypeError。使用对象`{_id,quantity}`可通过同一实际mapper；离线回归证明失败时socket调用0次、对象形式1次。本次更改测试工具参数，不重新打包或重启候选；公开string-ID形式的上游缺陷仍记录为范围限制。

原严格比对抓到收到的Loose新增`flags.item-piles.item={}`。来源明确为基础`Transaction.prepare`（src/helpers/transaction.js:219–225及244–252）清理并写入模块flags。工具v2仅在来源该精确路径缺失、收件值为零键普通对象时放行这一新增；测试继续拒绝非空模块flags、world flags变化、effects删除或ownership变化，不忽略整个flags集合。

父对prepare和post-reload读回中的原刀、Bag、Pouch、Rope、Gem作完整文档相等核对，5/5未变，hash在`parent-recovery-readback.json`。恢复按钮只接受原记录的精确failed错误，再核源完整数据未变/目标无对应物品，使用新operation键并保留旧failed记录。货币和Loose不重做。正常UI导入小更新Macro只更新现有Controls的command，验证原flags/baseline ledger保持；不导入整份JSON覆盖现有ledger。九项针对性离线检查通过。

启动工具首轮50秒门禁超时，同一已启动PID后来就绪，执行器没有二次启动；实际运行身份由service-late-readiness与service-final-readback补证。后续启动工具会先写STARTED_NOT_YET_VERIFIED回执，默认单次就绪窗口改为180秒（可显式10–300秒），超时仍保留同进程供读回。本次只检查脚本语法，没有为验证启动工具重新启动服务。

## Revision2真实语义失败：注册时序与缓存（纠正先前验证范围）

Chrome官方入口恢复后，两次对象参数API确实执行，但旧处理器仍生效：刀转到Receiver后attunement=`"NaN"`、attuned=true；Bag/Pouch也变`"NaN"`，仅直接子项转移，Gem留在Source并指向已移走的旧Pouch。真实失败证据保存在`report-recovery-v2.json`及`bag-container-v2-readback.json`。这不是可忽略metadata，也不是API按钮没执行；之前只测试单个处理器没有覆盖注册→缓存消费，验证不充分。

调用链已查明：基础`src/module.js`在Hooks.callAll(item-piles-ready)后立即registerSystemLibwrappers；该方法读SYSTEMS.DATA。适配包async listener逐版`await addSystemIntegration`，第一次同步只注册2.4.1系统配置（内部VERSION1.0.6），其余版本在微任务后；SYSTEMS.DATA于是先缓存1.0.6，后续addSystem没有清缓存。Foundry14.368 `client/helpers/hooks.mjs:114/158`证明callAll/#call同步调用，不等待Promise。

新增回归使用实际API.addSystemIntegration、SYSTEMS注册/缓存代码和精确14.368的mergeObject/deepClone，而非只收集配置字典。local1真实复现选中`1.0.6`而非`1.0.10`。适配local2对精确6.0.2同步只注册目标配置，在任何微任务让出前完成。对已存在1.0.6–1.0.9设置采用空soft migration，仅更新systemVersion到1.0.10，避免整批默认值重置；回归执行实际checkSystem/applySoftMigration并确认只写systemVersion、保留自定义currency。

新候选 **itempilesdnd5e1.1.0+servernext.2** ZIP SHA-256 `4d63912fff59cc48182d42b4792e2408d6db32ee7b54f477a732a91a4a876d9e`；基础local1及其hash不变。更新器预检证明现有包仍等于local1，只需离线覆盖适配包module.json和dist/module.js，无删除/备份。此阶段未执行更新；12项回归通过，包括精确部分写入现场reset和失败关闭。

Revision3不是重放v2：先在原Controls记录设置/核全部7件现存Item的完整canonical SHA-256与钱包；正常Setup后更新适配。回到世界先用公开Transaction.appendItemChanges执行不commit的唯一probe，证明实际选中处理器和设置保持。再只删除4个已确认受损Receiver Item，并从既存原始baseline恢复4个Source嵌入Item及原ID；原两Actor、Gem、Loose4/1与730/420cp钱包不重建或重放。这是明确的测试状态重置，不作为转移通过证据。之后新v3 operation键重新调用真实模块转移，检查完整payload/嵌套关系并重登，成功才清理；任何漂移或部分reset均保留并回传。

## Revision3设置比较的精确修正

正常GM退出/重登后单次Return to Setup成功，适配local2已装入，基础未变。实际设置版本从1.0.8到1.0.10；比对只发现五条普通货币的secondary:false变为缺失，probe/reset/转移尚未运行。

源码证据：API/api.js的CURRENCIES getter对Helpers.getSetting返回数组直接map，执行currency.secondary=false，再deepClone返回；Helpers.getSetting直通game.settings.get，精确14.368 ClientSettings.get返回Setting.value引用。getter没有调用setSetting/save。因此被访问过的缓存会出现该标记，重登原始值可以没有。真实getter回归复现缓存变化且没有持久化写入；与实际前后快照对照只有这五个标记及预期systemVersion变化。

比较修正只作用expected副本：五个固定attribute路径system.currency.pp/gp/ep/sp/cp的secondary false↔缺失。true、数量/顺序、汇率、路径、其它设置变化仍失败；不删除整类currency字段，也不写回世界设置。14项检查通过。准备的3379字符短补丁复用既有Update3，只改Controls命令、保留baseline/flags，避免再建工具或重启。后续实际转移验收仍未据此自动算通过。
