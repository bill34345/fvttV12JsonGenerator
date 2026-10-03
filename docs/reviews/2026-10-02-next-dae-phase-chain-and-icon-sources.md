# ServerNext 五项收尾：DAE阶段链候选与图标来源

日期：2026-10-02。用户最新明确要求先处理五组剩余工作，非付费模块以没有新增报错为验收，不追加所有玩法；付费包不由本任务验证，原未启用项确认后排除，六个暂停项目保持暂停。当前总状态只在[唯一总表](../plan/server-next-migration-handoff-20260927.md)维护。

## DAE当前候选

官方公开v14 manifest本轮仍为14.0.14。固定下载资产 `https://gitlab.com/tposney/dae/-/raw/v14/package/dae-v14.0.14.zip` SHA-256 `82118247402d56da085144db0cd96cb6d61a79e2c88a72218111705ce2cc37de`；其中module/dae.js与Next原安装文件逐字节相同，SHA `140e7714e8bb9f324ec95d9be67e9742907744663fdb40555a89394041294527`。作者v14 package.json仍写14.0.5，不将该源码元数据当发行资产版本；manifest及ZIP为本候选输入。作者[许可证](https://gitlab.com/tposney/dae/-/raw/v14/LICENSE)为MIT，分发候选包含原版权／许可。

最小修补保留DAE有效阶段选择：错误阶段仍在原检查处返回false；匹配阶段继续调用wrapped原生方法，传入同一replacementData，只把原生phase比较与change的存储phase对齐。没有修改change.phase、Actor来源、Core或dnd5e prototype。由原生方法继续做effect suppression／change conditions并设置applied。候选不是仅手动把applied改为true来隐藏错误。

9项源码契约检查执行精确Core14.368／dnd5e6.0.5方法体，覆盖+1标记、false条件、效果抑制、错误阶段、legacy derived-key阶段修正、phaseStamped选择、明确非默认phase、skipConditions及disabled/ATL原路径。源输入从不可改写的原发行ZIP读取，安装后不会把修补再套到已修文件；不复制Core源码进仓库，不操作世界或LevelDB。安全入口 `bun run --cwd foundry-modules/server-next-external-candidates test:dae`，9 PASS。首次代码检查与后来修正不可变fixture读取后的检查分别有记录，非重复累加测试数。

代码位于[DAE候选说明](../../foundry-modules/server-next-external-candidates/dae/README.md)。candidate使用版本 `14.0.14+servernext.1`、本地标题和来源metadata，移除官方自动更新URL，保留作者／来源字段。原release ZIP保留作构建输入，不是安装或世界备份。

## 安装、服务与当前接受层

本轮开始实际发现Next已停：30002无listener／无server-next Node，旧39528作废；没有假设是谁停止。已确认目录无链接、原脚本指纹匹配、停服后仅写DAE的module/dae.js与module.json并新增LICENSE，before/after文件清单只有这3项差异，删除0／备份0／世界写入0。私有安装收据在F:/FoundryLab/foundry-v14/evidence/server-next-migration/five-items-closeout-20261002-84f0a5d9/dae-install-receipt.json。

现存旧launcher明确绑定6.0.2，不拿来启动6.0.5，也未放宽共用工具。父按既有授权恢复同一F盘server-next，核16个现存LOCK可独占只读打开（旧23只是旧快照，不清锁），固定Node24.17.0／Core14.368／cor-cotn／loopback／noBackups。新PID50480，owner Administrator，正常status active／14.368／6.0.5。[官方公开发布页](https://github.com/foundryvtt/dnd5e/releases)仍标6.0.5 Latest；匿名API限流与gh配置账号403后仅用公开页面读取，不改凭据或换账号。

共用工具新文件合同527b03de-42c2-4861-b585-40d08891d6e7完成prepare→ready→execute→collect→resume，收据82ffecf9-9510-4002-a48c-2a7e9849102b为PASS／COMPLETE／NOT_REQUIRED、自动父审PENDING。只证明三文件／冻结探针身份及syntax，不代替新客户端接受。

运行65d2894d-b2f2-4ddd-99cd-5e9b83de3377/revision1暴露父检查器两处错误：重复拼已规范化modules前缀导致假404；NPC构造后再次prepareData触发MovementField._shim不可重定义walk。旧flat计算还会把flat作为override，因此不是检查+1的正确夹具。真实原件完整保存、一次执行、出生Macro清理及90 ID一致；不算模块故障，不重放r1。Core14.368 styles schema为src，现有资源直接解析；dnd5e6.0.5使用自然AC calcs及flat来源，只构造一次。

修正后新文件合同8a45e8e3-1ff1-4f26-85fd-63fbfc50d77e／收据35e68913-63c9-4a9d-878c-b1f12826279c闭环；运行revision2只补受影响检查。实机无效果baselineAC10、+1效果AC11／bonus1／applied=true／disabled=false／suppressed=false，Actor总数294保持。94active中28个启用付费包排除，66个非付费模块162个声明脚本／样式全部HTTP成功，无失败／未知入口，console新增0，仅2个既有validation错误。保存／重开冻结4263字节SHA一致，wx一次执行、完整90 Macro IDs前后相同、owned页缺席及服务保留。r1完整图标73引用／11路径与Settings／Manage Modules基础UI证据复用。父核native原件、资源逐行和清理；不把执行器PASS字样当唯一依据。原件在同一F盘证据根runtime-inspection-r2。原火巨人UI状态最后观察仍待图片修复批次，不提前声称UI问题闭合。

## 图标精确来源与替代边界

只读研究未访问Mirror、LevelDB或付费内容，未安装／运行暂停Plutonium。Next没有旧Plutonium素材，已授权cache/packages/plutonium-cn/2.15.6为空，因此无法与旧SVG做字节等价证明。仅取得两个官方同名、白色透明版候选：

| 旧文件名 | 官方直接SVG | 当前SHA-256／许可 |
|---|---|---|
| sword-brandish.svg | [Game-icons SVG](https://game-icons.net/icons/ffffff/transparent/1x1/delapouite/sword-brandish.svg) | 1303字节；ee6a40a96201b5da73adc0eeba41f2dcc19116cc918ff85147bae5cdd970d409；Delapouite／CC BY3.0。 |
| mighty-force.svg | [Game-icons SVG](https://game-icons.net/icons/ffffff/transparent/1x1/delapouite/mighty-force.svg) | 969字节；a6dc062b3ebdf093e2e647d5b33214a12e97352cc197a07ad36ebf782ccaddbe；Delapouite／CC BY3.0。 |
| skills.svg | 精确原件未找到 | 不猜许可证或宣称恢复原图；可按实际引用语义使用Core内置icons/svg/d20.svg或book.svg的明确替代，不复制／再分发Core素材。 |

两图作者／许可来源分别为[剑图页面](https://game-icons.net/1x1/delapouite/sword-brandish.html)、[力量图页面](https://game-icons.net/1x1/delapouite/mighty-force.html)。本地下载哈希与研究原件一致；已在独立Data/assets/server-next-migration-icons安装两个SVG与许可，目录实际无reparse，3项新文件wx创建，无覆盖／备份／世界写入。不是Plutonium目录或模块，不改变模块开关。

完整11路径替代：battle-gear→Core item-bag；phb-cleric→holy-shield；phb-wizard→book；family-tree（Swim Speed引用）→waterfall；farmer（背景／特性引用）→mystery-man；laurels（血猎手）→skull；skills→d20；fairy-wand→lightning；mailed-fist→fire；mighty-force与sword-brandish→独立同名SVG。明确为缺失图的可用替代，不宣称原职业插画／原SVG复原。所有Core图片只引用原URL，不复制分发。

修复源在[icons说明](../../foundry-modules/server-next-external-candidates/icons/README.md)：全量目标ID/name/旧img先核、11目的资源字节先核，正常文档API仅img更新，完整owner来源diff只允许精确图片与受限版本／修改metadata叶子，不忽略全部stats／flags／system。保留测试Actor拒绝，世界Actor/Item完整ID保持，失败保存partial不整批重放。正常重载另用只读Macro核73引用，两个明确图片实例作UI观察；实际行为／清理仍待callback。

图标文件合同9f485714-c852-4215-920a-9e5ab303756b为最初文件检查；后按Core明确managed metadata约束修正候选，290e7280-e048-445e-8f81-af3eaa15b864仅prepare未execute，保留其状态。最后含只读重载源码的新合同39e8f9b0-bae2-4cd3-9c57-cc5fbd66c4a8完成闭环，收据2433ae43-cfdb-43da-8ff3-4edbb220e839。运行图片合同a083a6f0-1d4c-49c4-a9c8-b9376103675d/revision1才是实际世界写入出口；文件通过不提前接受图片修复。

图片运行r1在保存门发现编辑器去掉源码末尾单一LF，实际22973字节与冻结22974字节只有这1字节差异；没有领取执行，没有世界写入，90 Macro数组保持且页清理。父精确读取已保存command确认saved+LF=source，r2单独冻结无末尾LF的修复22973／只读23621字节，逻辑不变，严格哈希继续保持。新文件合同0c44a419-4f45-4477-9ff4-866f2ce32e4c／收据5b497872-1da5-4e66-94bb-a75db4539f1c闭环；运行r2只执行原未执行切片。不得把保存门阻塞写成图片已修，也不得盲重放任何已写操作。

不查付费合集或演示付费内容；精确范围走正常文档API，未明引用不盲改。安装独立素材不恢复暂停模块；非付费模块的启动／声明资源和必要基础界面检查不扩大为全玩法或付费包验证。

## 图片接受与DAE目标文字纠正

图片revision2父审接受73个世界引用／33个owner／11目的资源；native-repair完整来源差异仅73img及明确的coreVersion14.368／modifiedTime／lastModifiedBy叶子，其他规则字段差异0。正常GM重载后73matched，Actor294／WorldItem206完整ID数组保持；两图currentSrc为独立assets、complete／natural150×150且父实际查看截图显示。两个出生Macro oM0yfjzM4QPhFRbM／SeG7bXxX1c8gyBQg精确删除、实际90 ID数组保持、owned页651337961缺席，服务50480保留。两旧validation类型不算修复消失；native重载后logs返回0只作为该次读取，不扩为全世界零错。父逐项接受在icon-repair-r2/parent-final-acceptance.json。

合同写错DAE附加目标：CCQeulSS5VGkOP2y／yY23mBjn0wsSE16h真实为世界剑客Swashbuckler、AC17、来源+2、applied=true，非火巨人。执行器按准确ID观察，未改数值或寻找替代角色，图标目标不受影响。Effects AX有Change Active，父所看effect-ui.png仍折叠，不能把它充当原火巨人展开change视觉。原火巨人准确UUID／effect由先前accepted原件找回，另派9c73ca68-cf2b-4d8e-9b6d-d9c930f874ab的准确只读收尾，不重复enable/disable对照、不写数据、不重放图片。77b81b7b-758d-4ea4-88c1-11424a424af7文件合同闭环只证明新2484字节冻结源，原目标实际接受待其回执。

准确原目标回执已接受：Compendium.5e-dlc-monster.modengken-duoyuanguaiwu.Actor.0NvFibF8HEHoRR10／WhNngS9xnhhHeTRv，实际name火巨人无畏者、AC21、+1、applied=true、disabled/suppressed=false；sourceSHA仍b858246f87b6908e6149369c691eb53bdfb60add7decd1dd62d1884929fc7b5e，pack锁true。DOM／AX有Change Active，父图像核原角色和AC21；内部文字未露出，视觉INCOMPLETE保留，不继续无变化补图。出生Macro／实际90 IDs／owned页／服务恢复全部通过，新增非validation错误0。parent-final-acceptance在dae-original-target-r1。

另有真实新图片缺口：该原pack Effect仅1个旧mighty-force.svg，世界73处修复没有覆盖它。另冻结普通单图任务c4b711ec-c4df-4561-8aa9-06e98c16af72：只正常Compendium配置临时解锁、该Effect img更新、finally精确恢复原pack配置，完整source差异仅img及受限修改metadata；正常重载另只读写后hash／原AC21与+1／applied及单图UI。源syntax／hash已核，未开发共享工具适配器；旧资产file receipt仅复用未变资产证据，不冒称覆盖新JS。本操作结果尚待callback，未遍历pack或测试37个官方付费包。

单图回执已父审接受：effects.0.img及effects.0._stats.modifiedTime是完整来源的仅2处差异；unexpected=[]、configRestored=true／packLocked=true、278完整index IDs一致。写后SHA17a27a4bdbe3e96b5a53f1991a32be35da1f5b0baa810f41191cd989a106434a与正常reload只读相同，AC21／+1／applied保持。父实际看effect-ui.png，原火巨人与新力量图可见；图片complete、natural150×150。两个出生Macro清理、原90 IDs一致、owned页缺席、service50480继续，无新增非旧validation错误。parent-final-acceptance在dlc-one-icon-r1。总74处只是世界73+已确认合集1，不宣称全pack图片普查。

## 源码整合前的边界检查

本轮源码准备补必要integration门，未提交／合并／push。Foundry Ops类型检查、Midi工具类型检查、隔离Foundry Ops397项／0失败通过；测试所有可写根在随机CI沙箱，未操作持久Lab或生产。

首次architecture:verify失败：968个报错、33234模块／55300依赖，绝大多数来自已在.gitignore明确登记的上游sources/upstream/dist及嵌套node_modules；另有旧recover-blood-hunter脚本直连包私有source.ts的真实边界问题。没有改／删除原上游目录，也未放宽本项目循环或生产到测试规则。扫描排除仅匹配嵌套依赖及这个候选目录已声明的固定输入／构建输出，DAE／icons／实际owned适配代码仍在范围。

Blood Hunter新增公开source-metadata入口，仅导出原3个只读源身份／元数据函数，不导出compiler／迁移／写入。旧恢复脚本改用此公开契约，架构例外仅限该确切caller到此确切facade；其余Foundry Ops规则保持禁止。初次使用裸包名的局部测试失败，本树没有该workspace包链接；改用项目现有的相对公开入口方式绑定当前checkout，未安装依赖或修改主树。3项scope／越界／公开表面检查与包20项既有源码回归通过，包类型通过。行为算法、正式生成结果及既有修复数据未变；没有执行这个会读取历史Mirror来源的恢复脚本。

最终architecture:verify退出0，1092模块／2442依赖，无违规／循环；不是用旧master CI代替新组合检查。agents:check32层级PASS；卫生脚本1649tracked路径PASS，另用原检查器对tracked+全部非忽略新交付路径集合预审，索引不变。全仓覆盖率／完整ci:verify本轮未重跑，源码正式发布仍须明确授权及其实际integration流程；相关检查不扩大已接受Foundry玩法。
