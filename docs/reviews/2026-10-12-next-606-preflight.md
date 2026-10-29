# ServerNext 6.0.6 升级前只读核查

日期：2026-10-12。本记录起于Core14.368/dnd5e6.0.5 Next的只读调查，后续限定前置维护见本文末和[总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)。当前loopback30002/PID34112停在Setup，原cor-cotn哈希基线保留；系统与14模块尚未更新。未访问Forge的5.3.3 Mirror，旧PASS保持旧目标。

## 官方版本与真实实装

[官方release-6.0.6](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.6)于2026-10-06发布，为当前非draft、非prerelease的最新稳定6.x。固定tag提交`87e94dbd9f930135e0694cd7e7d49f210603cd2c`，6.0.5基点为`3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`。[官方比较](https://github.com/foundryvtt/dnd5e/compare/release-6.0.5...release-6.0.6)为16个提交/16文件；system.json的Core最低14.367未变，当前14.368满足。Next本机system.json与正常status接口均为6.0.5。

已核干净6.0.5引用、官方origin和精确tag，复用Git对象取得新的版本化6.0.6源码；旧6.0.5 HEAD保持`3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`，新HEAD为上述6.0.6提交。tracked reference清单与current-6 manifest已指向新资料，`bun run references verify`两条线通过，manifest解析值与精确源码一致（格式字节不同）。这只更新开发资料，Next系统与Core没有更新。Context7本轮resolve返回`TypeError: fetch failed`，导航不可用，接口事实改由精确本地tag源码核对。

## 启用全集和版本门

H4/r1新客户端实录为108项/100 active，完整ID记录为本任务next606/live-inventory-h4.json。逐一读取Next的100份manifest和121个声明入口：文件/ID全部存在，Core声明与九条有版本界限的硬依赖边未发现阻塞。之后没有切换启用配置；安装/升级边界仍须新的读回。

以下15个已勾选模块将系统maximum写为6.0.5：house-rules、selected-token-sync、weapon-mastery-properties、injury-fading-spirits、blood-hunter-2024、custom-conditions、babele-rolltable-embed-translation、battlefield-painter、chat-memory-guard、dnd5e_classpack、json-generator-spell-resolver、session-monitor、homebrew-species、open-session-deck、trigger-engine（完整runtime ID以本机manifest为准）。[Foundry包管理说明](https://foundryvtt.com/article/package-management/)和[manifest迁移说明](https://foundryvtt.com/article/manifest-migration-guide/)说明兼容上限是强制边界；不能仅升级系统再假定原组合仍可用，实际加载/启用仍须读回。

其中村规、WMP、IFS、CC、Painter、Resolver、Deck、TE及Classpack迁移入口另有精确代码门，不能只改manifest。WMP非6.0.5分支会转而与5.3.3比对；需保留旧目标分支并依据新tag审定。其余六项主要为manifest或构建/工具边界，静态未发现同样的精确加载拒绝，不等于新版本行为通过。

## 来源变化与最小反证

差异涉及Actor Effect/旧力竭迁移、unlinked Token Actor delta、攻击标签公式、Activity消耗配置、附魔空操作、Token坠落判断及advancement选择/恢复。[原始问题7561](https://github.com/foundryvtt/dnd5e/issues/7561)记录6.0.5迁移旧力竭等级异常；6.0.6新增迁移逻辑不能证明已写入旧世界的数据会自行恢复。

接续先取得最新客户端inventory，再按固定tag核九类代码门/15声明和受影响窄验收；静态与安全测试后才处理Next系统更新。正常升级前保留必要身份/语义字段证据，遵守无备份、不直接编辑LevelDB、不升级Core/Mirror/生产。升级后分别读回模块加载、实际发生的载入/迁移及受影响行为，不重放未受影响全矩阵，不放宽声明来消除报错。

精确6.0.6的`system.json.flags.needsMigrationVersion`仍为6.0.0。[启动迁移入口](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/dnd5e.mjs#L657-L671)读取`systemMigrationVersion || world.flags.dnd5e.version`，不需要跨过该迁移门时直接返回；如果Next实际记录已是6.0.5，普通补丁升级不会自动调用`migrateWorld()`。新的[ActiveEffect migrateData](https://github.com/foundryvtt/dnd5e/blob/87e94dbd9f930135e0694cd7e7d49f210603cd2c/module/documents/active-effect.mjs#L316-L323)仅将仍带finite旧`flags.dnd5e.exhaustionLevel`的exhaustion源转为system.level。当前迁移版本/旧字段保留情况尚待客户端读回；已有错误数据的恢复不属于自动升级承诺，也不手动强跑整世界迁移来扩大本轮范围。

H4只依赖Core的静态交付可独立准备；任何依赖新系统行为的接受必须先解决上述前置。新本地化候选无新增；本记录只调查版本/已有组合，不把外部候选或Classpack版权提升为可售资产。

## 全集代码门复核

独立只读检查以这100个active ID为范围，扫描各包496个JS/MJS文件，包含声明入口和本包导入文件，排除packs、node_modules、source map及media；用rg的--no-ignore复核后计数相同。分类为9个无声明脚本的内容包、44个未检出所查版本文本信号的脚本包、47个有版本信号的包。后者含11个自有/受控owner和36个外部包。文本扫描不能排除动态构造的版本门，未命中不等于兼容PASS。

36个外部命中包为：3ds-atlas、auraeffects、autoanimations、automated-conditions-5e、calendaria、dae、dfreds-convenient-effects、dnd-adventures-faerun、dnd-dungeon-masters-guide、dnd-forge-artificer、dnd-heroes-faerun、dnd-monster-manual、dnd-players-handbook、dnd-tashas-cauldron、dnd5e-animations、item-piles、itemacro、itempilesdnd5e、kp-prepared-expanded、lib-wrapper、mcdm-class-bundle、mcdm-flee-mortals-where-evil-lives、midi-qol、monks-active-tiles、monks-tokenbar、multiple-document-selection、quick-insert、sequencer、shards-and-traditions、share-media、simplecover5e、the-folk-from-harrowthorpe、tidy5e-sheet、tile-arsenal、token-action-hud-core和vision-5e。

按本次可定位静态证据，新增外部硬版本阻塞为0。Midi local.10的过旧版本拒绝及major6/>5.2.99分支、DAE的>5.99.99回合到期分支、AC5e/AA的6.x分支均使605/606同路。DFreds使用>=6.0.0的分级力竭迁移，实际完成标记尚待读取；本地lib-dfreds-migrations源码将迁移key数组注册在world设置namespace `lib-dfreds-migrations` / key `dfreds-convenient-effects`，应包含 `2026-09-15-migrate-leveled-exhaustion`。Tasha4.0.0入口及7个导入文件未定位系统门，ready比较其自身版本；启用表无独立Premades包。Vision、SimpleCover、Itemacro、Monk's Active Tiles、Calendaria阈值也未改变605/606分支；Tidy的6.0.x声明及大型bundle没有定位版本拒绝，表单行为仍UNKNOWN。

Item Piles保留既有限制：本机itempilesdnd5e的attunement/递归嵌套转移修正、item-piles的Item ID/容器父ID重映射都只在精确6.0.2执行，605与606同走旧路径。这不是606新增停用门。注册循环最后提供5.0.0 profile，但实际有效profile可能受缓存或后续注册影响，未作运行结论。后续要接受其功能，应在受控对象检查嵌套转移、attunement及Item ID保真，不顺带修改第三方补丁。

## 已准备的限定候选

以下都是源码/构建层证据，旧目标运行记录保持原目标。所有清单仅调整maximum，verified、module ID/版本及公开持久身份保留；精确代码门同时增加14.368/6.0.6，未来6.0.7和交叉Core仍拒绝。

| Owner | 局部检查与实际产物 | 运行/内容边界 |
| --- | --- | --- |
| TE / CC / WMP / IFS | 分别45、176、258、57项通过，各自type/build；WMP artifact通过 | TE的HP watcher忽略新lastMovedToken flag；CC/TE ABI与WMP依赖能力不变，真实攻击/消费/状态待验 |
| House Rules / Selected Token Sync / Painter / Resolver | 分别62、21、321、345项通过；House另1项、Resolver另35项定向复验；type/build及ZIP/manifest字节对照通过 | 可选House模块版本槽仍null；Painter falling/Region、Resolver consume({message})及玩法未接受 |
| Chat Guard / Babele / Monitor | 分别29、8、23项局部非浏览器检查；type/build/ZIP读回通过 | Monitor旧全脚本误启合成页headless Chrome的偏差保留；当前23项排除该用例，非正式Chrome E2E |
| Deck | 76项/529断言、type/build通过；已安装候选，系统仍605 | 原生605/606力竭效果路径同路；606业务仍待验 |
| Species | 606候选真实build/verify通过，1 species/5 features/6 UUID，logical hash 56259032a319d4fe062d29a3dfa4a128b8087502507b125fd993d40c9186dd8f | 来源投影/verified仍602；Next只装manifest，保留已有迁移packs |
| Blood Hunter | manifest投影契约9项/222断言、type通过；已核owned marker及before SHA | 锁定源只在受保护Mirror资产中，未读取/重编译；只更新Next manifest，不改packs/scripts |
| Classpack | load-only投影3项/16断言，核原manifest/runtime/baseline与tracked composed runtime hash | 只扩大加载maximum；preflight/migrate/confirmRecovery仍在606数据访问前拒绝，readonly inventory语义保留，无迁移 |

上述14目标现已在Next正常关闭世界及精确维护门通过后更新，115文件与完整目标树对账通过。11个runtime包从真实ZIP和dist逐文件安装，三个内容目标各只改module.json；未清目录、备份或改现有内容包packs。运行系统此时仍6.0.5，606功能尚未接受。单纯系统补丁更新不授权强跑world或Classpack迁移。

Core14.368客户端源码已核 `game.data.options.noBackups`：普通system migration且无Core migration时直接允许启动而不创建backup；backup管理按钮和createBackup选择受同选项控制。当前Node命令行含--noBackups，维护仍需正常UI读回；若出现强制backup或Admin Password门则保留具体阻塞，不使用其他通道绕过。

首次真实维护预检暴露工具假设错误：该字段在当前世界客户端不可用，v1因此在十集合GET和自有baseline写入前阻断，没有关闭世界。源码的相关判定位于Setup视图，不能要求世界视图必须暴露同一server选项。恢复保留world字段unavailable事实，基线仍只读及hash-only；真正安装前再核同PID --noBackups、正常Setup完整菜单中备份控件的实际状态与对应精确源码。不是将未知值改写为true，也没有为消除阻断修改服务器或换执行通道。

## 无备份参数的实际失败与修复前置

v2真实读回完成十集合10/10、100 active、迁移版本6.0.2≥needs6.0.0，DFreds指定迁移key已完成；exhaustion遍历完整，共9个候选effect、6个finite旧flag、实际606迁移门eligible为0，不能把这6个旧flag声称会自动修复。GET期间文档/setting事件均0，observer/setter已恢复，hash-only基线留在精确自有Macro。随后正常ReturnSetup成功、Node15696仍运行；实际完整菜单含Manage Backups，原UI guard失败，未安装/升级。

根因已由精确本机14.368纯函数复现：dist/init.mjs的parseArgs保留参数大小写，dist/core/config.mjs的initialize只消费`e.nobackups`并映射为配置`noBackups`。当前服务和共用launcher把配置字段名误用为`--noBackups`，因此该命令参数没有启用无备份模式。之前“进程含该字符串”只证明传参，不能证明生效；原失败记录和参数不改写。

共用launcher已修正为仅输出一个`--nobackups`，兼容规范化旧大写写法、保留其他equals参数，拒绝显式禁用或冲突参数；固定Bun1.3.14安全foundry-lab入口176项/1091断言、工具类型通过。实际服务随后正常重启至新PID34112并完成Setup复验，备份菜单/输入均0；源码通过与真实菜单证据分别保留，详见下段。

公开资料作交叉线索：[官方11.314发布说明](https://foundryvtt.com/releases/11.314)明确使用全小写参数隐藏备份菜单；[官方问题12771](https://github.com/foundryvtt/foundryvtt/issues/12771)记录11.315/12.343在更新页另一个Snapshot按钮仍可用，已在V13里关闭，不能当作本机14.368的同一故障。[原始用户讨论](https://www.reddit.com/r/FoundryVTT/comments/16w1rwc/so_version_11311_recently_dropped_with_builtin/)记录早期版本配置字段/控制台开关与UI不一致；本轮不采用其中的控制台注入建议。AnySearch检索成功、两篇正文提取失败，已回退官方原文及原始讨论；本机判断以精确代码、纯parser反证和真实菜单为依据。

修复限定本任务拥有的Next服务：先核已正常关闭世界、精确PID/创建时间/数据根/单loopback监听和原生SIGINT退出处理；只向含该Node与一次性helper的独立控制台发一次正常CTRL_C。无法证明唯一成员、无法正常退出、原生锁未释放或启动未回Setup时停下，不强制结束/删除锁。新启动沿用原app/data和30002，只纠正小写参数；已证实不存在的requested-world标记用于进入Setup，不创建新世界。保留已有Macro/hash基线和原失败，PID变化另记并重绑后续候选预览，不复用旧进程READY。

实际维护已恢复至Setup：原15696正常退出且原生锁释放，helper控制事件后的中断只补启动步骤，当前同owner PID34112在同数据根/loopback30002、Core14.368/系统6.0.5，参数为正确小写。没有备份、Config编辑、强制结束、锁删除、系统/模块升级或世界启动。完整14目标before哈希预览已取得（3个内容模块3329/18/30文件保留）。原Chrome修订3真实完整菜单仅viewWarnings/configure/update，backup控件0、createBackup输入0，新服务身份/监听和inactive均匹配；UI门PASS。旧会话落到/no页面后正常reload仍如此，执行器沿原生GoBack链接返回/setup，没有猜路径或换执行通道；原世界字段unavailable与原失败保留。

## 原生606下载中断及限定读回

14模块更新完成后，原Chrome执行器只使用Setup/Game Systems的dnd5e updatePackage一次，进度3%→27%，服务器于本机2026-10-12 05:09:33记录download failed: terminated。实际URL经过既有公共下载代理`fvtt-download-cdn.aivu.top`，不声称直接取得官方完整ZIP。原生下载失败后未调用替代安装器、重试、世界启动、POST、强制迁移或更改服务器。Node34112/Setup inactive、磁盘manifest 605保留。

父用升级前已核的官方605完整证明独立复查1,340个非packs程序文件，全部同SHA；这证明该读取范围保留，不能扩大为packs/世界全数据不变。精确Core的download先于installer，文件流错误会清理本次临时归档；默认系统下载归档当前位置不存在，未猜测或读取其他tempDir/Config。HTTP helper的30秒计时只涵盖取得Response，随后即清除，故不能把此terminated直接归因为该30秒门。

当前14.368既有package.mjs补丁SHA `761f6f8101aed2cbc506cf12112d71307b1900de98cf3acbbae9af88c574d794`，注释绑定MIT项目commit `5dae4a6870927b6da2e8b8c51803c253eabffd7f`；仅公共GitHub/GitLab下载路由，默认代理由`FVTT_PACKAGE_PROXY_URL`选择。没有修改该Core文件或服务环境。[代理owner源码](https://github.com/kagangtuya-star/foundryvtt-packages-proxy)公开了这类下载代理及大文件转发结构，但当前服务部署配置/上游失败原因尚未证明，不能据README推断本次中断位置。

初始实用研究同时检查[原始V12用户案例](https://www.reddit.com/r/FoundryVTT/comments/1hgaytk/error_installing_pretty_much_anything/)：用户报告GitHub包失败而GitLab包可装，另有参与者声称更新Node解决其类似问题；原帖的错误是null id，版本/Node/症状均与本机24.17/14.368/terminated不同，没有证明相同根因。本轮不照搬Node升级/重启建议。AnySearch检索成功，两篇正文提取失败，按既有授权回退原始网页。后续仅用官方小API和实际代理短Range作诊断，保存HTTP/错误链；原生失败与直连官方参考ZIP失败分开记录。

## 已完成的原生更新与剩余范围

同一既有代理的11次精确Range请求补全官方606归档，完整SHA、manifest SHA及全档CRC通过；随后仅一轮原生Setup恢复更新成功，原世界正常启动，实际客户端14.368/606及100active已读回。1,340个实装非pack程序文件与官方完整发行物一致。唯一POST中10集合916原文档无差异，DFreds/systemMigrationVersion/exhaustion事实及world/systemFlags相同。Core正常启动日志包含package/system version迁移，不能把客户端跳过dnd5e migrateWorld称为没有任何迁移。

非敏感world settings总指纹发生变化，当前1556记录只有945个不同key、611个重复key；旧基线没有逐行身份或前值。只读诊断的8个有源码依据的有限模拟均不匹配，报告UNKNOWN，且keyed map会合并同名行，不能冒称完整逐行表。完整hash-only旧基线另存5,123,150B且由父重算SHA验证；没有自动去重/还原设置。启动的一个既有Actor/Item identifier错误缺少605同错误实测，回归性质UNKNOWN，未修改既有Actor。以上缺口与后续新对象验收分开记录。

Deck D3首个真实输入检查点失败：输入DOM property13而server HP20/原生伤害调用0；同一个自有NPC的exhaustion从准备3变1。现有TE定义0，两个Deck将写setting各唯一行，旧工具/fixture保留。精确actor.mjs的首次exhaustion Effect创建有异步legacy字段同步到1，构成准备竞态的源码解释；UI change是否实际送达尚未证明，不能合并为产品回归。后继只补原生准备同步和输入事件证据，不升级其他对象或重放系统维护。
