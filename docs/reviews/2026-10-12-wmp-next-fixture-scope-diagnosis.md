# WMP 6.0.6：夹具初始化写入边界诊断

## 当前结论

WMP W1/W2新候选已安装到本任务独占Next，原世界正常启动。第一原生批通过候选/API与11集合前置，但只执行到自有夹具初始化：User、`monks-tokenbar.movement`设置及一条聊天消息的更新被工具veto。W2预约/取消与W3真实攻击均未执行，不能宣称业务接受。旧PARTIAL原件与所有自有对象保留；恢复前先核原数据，再决定精确恢复和同夹具接续。

目标仅Core14.368/dnd5e6.0.6、owned Node34112/127.0.0.1:30002/cor-cotn。Forge占用的5.3.3 Mirror、生产、Config和LevelDB未访问或修改；未复制Lab或创建备份。

## 已有证据

- 固定候选WMP JS `67e7bee1b822010e647f7f5922f74f6d93fd60b0621a0ee6c4d177a0a2468fe1`，buildId `b10e469053e2144c1cfe71a7497d6760bf7582711dd2141f56dadc497b60f6fa`；完整包/实装/启动身份见[总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)。
- r1 dispatch `a76d06ef-b16b-4e26-b8e8-3078db73a999`，run `4c31bf83-0242-4f0f-bc4c-683fa8470788`。自有Scene/两NPC/两个Token/Club/Combat已建；`attackIds`仍为空，没有Sap或攻击。
- Setting前置为唯一TE外部事件行、6条原事件；容量检查通过。11集合基线与Settings行ID/raw指纹已保存在原Macro的本批run中，文件收据只输出哈希；不因被veto便推断所有原件一定未变。
- Saved run保留两次User更新和一次movement Setting更新；实时收据另有一条ChatMessage更新及第三次User更新。两层记录均保留，未覆盖成统一成功或删除对象。
- 原件在本任务`.local/suite-direction/next606/chrome/wmp-w1-w3-r1/`；主控已查看partial截图并核JSON。本文件不嵌入私有原件或原聊天内容。

## 精确已安装源码事实

本机`monks-tokenbar`为14.01。只读检查两份原文件：

| 文件 | SHA-256 | 已核行为 |
| --- | --- | --- |
| `monks-tokenbar.js` | `6280bc7919ca5bbec07fad5b1831d9d51a71e9fc3fc6a6c6bd3d7143ec732560` | `changeGlobalMovement`调用settings.set，再清Token Bar条目的移动标记；round1/turn0且启用change-to-combat时调用此入口；删除战斗也可能按movement-after-combat设置切换 |
| `apps/tokenbar.js` | `b07a6977e63010dd0cd18060c526816926fee3dca43c5e3beaf0cfa6b5024098` | onPersistPosition通过1000ms debounce保存当前User的position；getPos无原值时也保存默认位置 |

Core14.368的Scene.view只重绘本地canvas，activate才写Scene.active。`User.viewedScene`为运行时字段，canvas draw直接赋值；它不能独自解释此次preUpdateUser。上述Token Bar路径与观察相符，但实际User字段、调用者和ChatMessage更新来源尚未捕获，不把源码可能性当成此次归因。

## 最小后续与边界

1. 旧工具已在所有夹具API等待后、最终assertGuard处停止；没有WMP业务在途。准备新的只读诊断工具，先核原Macro源码、run、精确fixture身份及全部原文档/设置/User指纹；不重建夹具或直接清理。
2. 如需普通客户端reload解除本批临时guard，只作测试工具生命周期恢复，保留原PARTIAL和服务；随后仍用同一正式Chrome和原生Macro import执行只读审计，不以新渠道或宽泛放行取得PASS。
3. 只有原件一致且无攻击后，才可在写入全部受保护的条件下，以固定Scene.view往返采集非秘密字段路径、值hash和调用栈。不得输出原聊天内容、blind骰、凭据或其他Setting值。未知漂移停止依赖工作。
4. 实际字段/来源明确后再写精确恢复或接续方案，优先复用这批对象；任何新合同的有限结果与r1失败分开。完整原场景/设置/User/聊天读回缺失时不声明恢复。

## 只读Stage A实测与服务端边界

2026-10-12原独立Chrome按授权普通reload一次、导入诊断Macro后执行只读Stage A。全部设置行ID/raw指纹、TE原6事件、模块、夹具、无攻击及世界时间/暂停一致；既有Combat `8WCtc3bOyudYuHzh`完整SHA由`3c5252f73b9d8ad3518f68da420ae5a98fd2a93d5a5ee3eb14857bc5358a0530`变为`5de253dcaf1f0db4b930c7416a3f024717a125baa05550921b7024dda0507264`，当前GM User完整hash也不同。Stage B因此未执行；没有新traceGuard、场景往返、攻击或数据恢复。四个自有根、旧/诊断Macro及一条Monks roundmarker聊天仍保留，恢复状态未确认。

精确Core14.368服务端`dist/database/documents/combat.mjs`的`Combat._onCreateOperation`在创建active Combat时，经`sublevel.findUpdate`把其他active Combat写为false，并广播`_sideEffects`；该路径不走普通文档update或客户端`preUpdateCombat`。R1 initializer确实创建了active Combat，因此客户端veto不足以保护既有Combat。当前证据与active字段变化一致，但仍需仅在内存中构造有限反事实并比较完整旧hash，才能确认本次完整差异；不据源码机制直接修复数据。

User原件只保存完整hash及UI字段，未保存整块原始源。后续仅使用已有收据或精确源码支持的有限候选定位，不能把hash当作备份、无限枚举字段/坐标或覆盖未知原值。原件位于本任务`.local/suite-direction/next606/chrome/wmp-r1-diagnosis-r1/`；父已核收据并查看截图，原r1 PARTIAL继续保留。

## 服务恢复后的反事实实测

用户明确授权重新启动后，原独占Next以新PID38672/同Core14.368与606/单loopback30002/nobackups恢复。原Chrome正常Launch/GM登录各一次，复用同诊断Macro执行只读反事实；没有数据恢复或业务。原始Combat当前active=false的完整SHA仍为5de253...，仅内存设true便精确得到原3c5252...；stats字段SHA同，故本次此Combat确实只改变active。

User当前671458...与Stage A相同，两个独立“位置flag原缺省”假设都不匹配原70b2...；原因及原值继续UNKNOWN，停止进一步猜测。唯一新聊天的正确author为当前GM、roundmarker=true、完整SHA同；原诊断读旧user字段得到null不能解释为无作者。

同夹具业务接续单独保护已知当前User与原世界指纹，原R1完整恢复缺口保留；只veto两个已核位置路径的辅助保存尝试并记录，其他外来写仍fatal。没有修改产品实现、扩大版本或发布结论；真实攻击与之后的正常API恢复/清理要按各自收据判断。

该接续r2随后在W2前再次出现一条User写veto，辅助位置列表为空，实际业务未执行。旧工具未记录changed payload，阶段fixture-ready与live fatal同时存在，不能仅按阶段判成功。后续仅做User字段/形状/hash/调用栈的目标trace，所有写继续veto；先区分位置附带字段、其他模块flag与收据渲染，再决定相应修复，不重复业务或凭模块名归因。

## Native Macro Import的实接口

第一字段trace r3在组合controller resume身份断言处停止，尚未挂guard或捕获payload。Core14.368实际`client/documents/abstract/client-document.mjs:1044–1062`将原生JSON导入提交为`update(data,{diff:false,recursive:false,noHook:true})`；Base默认preserveOnImport为_id/sort/ownership/folder，Macro没有flags例外。它会替换新输入中的flags，且不会经过普通prewrite Hooks。因此不能依赖任务控制Macro自己的run flags跨重新导入保留，也不能把该guard视作原生Import权限边界。主控此前的合并假设已修正。

r3b读取未修改的原R1 Macro和持久Actor/TE/HP/效果作为只读身份依据，收据显式列controller resume是否存在；不编造原状态或恢复值。实际User字段仍须后续原生trace提供，初始化失败和静态测试不能替代这个证据。前后完整hash读回继续判定是否发生持久变化。

## r3b实际字段与后续限定修正

r3b已成功执行，resumePresent=false；一次owned视图/控制/目标操作后记录当前GM的TAH isUnlocked=false请求，实际stack包含TAH Utils.setUserFlag。已装TAH Core2.1.2的min JS SHA为5f5dd9389f3592b691c7db46cae3243762c5600b606377153b5f39d5bf030670，正常setter将该偏好交给User.setFlag。另有Monks位置left/top数字0请求但没有Monks caller帧，以及FogExploration0OFf1sfmPyv7t7rZ更新；Fog内容和归属没有由该trace导出。受检11集合/Settings/User/time前后完整指纹相同，业务/恢复未执行。

后续r4只将exact当前GM/TAH false偏好、已核位置请求以及经GET确认scene/user/level的exact Fog保存请求分类为辅助防写，仍全部veto；其他写仍fatal，不扩展落地权限。Fog Core正常保存字段为explored/timestamp，bitmap只在内存hash，不导出。实际scope不符则在业务前停止。旧R1 User原像UNKNOWN和旧R2未捕获payload保持，不用当前复现倒推历史归因。

## r4首次真实业务与终态证据缺口

r4在原生业务前确认Fog0OFf1sfmPyv7t7rZ为当前GM/自有Scene6HxmXLY8bVtvvxwT/defaultLevel0000，完整hash为7b2bd37284dd195c5955734462516c80c53f5f47b8ea3e6e0864da4ccbb15b9b。W2真实public Sap预约、未开始cancel、duplicate cancel及释放通过，TE原6事件后只追加两条。W3真实攻击一次total9、目标AC1，真实伤害骰2、原生Apply一次；工具在settledW3已返回之后的消息骰断言失败，HP/Slow/账本终值尚无导出，W3暂记PARTIAL，duplicate/reload/cleanup未执行。

私有断言只接受ledger所指消息上带options.midi-qol.rollType=attack的唯一骰。原生本轮另有usage和attack两个消息ID，需读实际原件的类型、关联、骰选项及持久终态才能判断是否为证据工具过窄；不从UI掷骰或函数已返回直接推广W3接受，也不重打已命中的攻击。

新veto包含当前User的monks-little-details.sidebar-tab及Journal LWolxYDoLmHssiNE的sequencer effects/sounds键；后者实际stack定位sequencer.js:9700。精确已装Sequencer4.2.3 JS SHA为bd007dc2367ae9442e45c22e0f6340373642c8ddbd6c0ff41d4c58347b6f8031：其批量持久效果setter会写Journal，并在Core14使用ForcedDeletion运算符清键。Monks Little Details源码SHA为5c29e6e6604fd4b8ed68c2486a7e95b2d0368e2f6e4a37fc8499f27b26387e54，changeSidebarTab hook保存tabName；本次User stack没有模块帧，因此只把源码与实际字段/操作关联列明，不倒推旧User差异。两请求均未放行，原件继续保留。

下一步只读工具复用controller及仍活跃的R4缓存，先经既有精确Macro intent保存原task flags，避免Native Import替换flags丢失终态，再输出安全handoff、原生卡最小关联/骰选项、HP/效果/账本和保护指纹。11项私有源绑定/防玩法入口/保存意图/卡片归属/blind最小化检查通过；不替代真实终态接受。实际运行回传后再决定duplicate、重载和精确正常API恢复，不扩展Journal写权限。

## 已有攻击只读终态的实际结论

后续只读工具通过R4精确Macro intent保留原run，导出了安全handoff和真实终态。目标HP200→198、walk30→20、唯一Slow来源/目标正确，w3账本committed/hit/damage2；六项保护指纹均通过。原生attack卡pMD5KZURDMwzO8WQ确为D20Roll9/options.rollType=attack，未携Midi专用标记；其system.origin和WMP midiCardId共同关联到usage gZRx9k9hCiBbJYoK，而usage有Midi attack9/defaultDamage2。旧私有断言过窄已被该实际卡片形态反证，产品无需为此修改；原PARTIAL/veto保留，不重攻或重复Apply。

父审接受该命中代表链，duplicate/普通重载/精确恢复仍待运行。下一批先核同attack重复提交零变化及持久化，再通过正常API删除精确自有夹具/卡片和恢复原Combat active；Core普通更新_stats另列审计，其他业务字段用完整旧hash反证。原Scene自有用户Fog单独保护，Scene正常删除的服务端cascade限定于自有Scene。精确TE raw恢复后普通reload，最后两证据Macro删除后再全集合GET读回。辅助Sequencer请求只允许识别exact既有Journal中自有UUID键的ForcedDeletion并继续veto，不放行原Journal写入。未知User旧原像仍不猜写。

## R5收尾中的新Setting元数据缺口

R5实际duplicate零变化及普通reload保持HP198/walk20/Slow/TE10，父已接受。三条绑定Chat和owned Combat正常删除，原Combat active恢复且仅modifiedTime更新；之后两次rowTOHsTrEEnPBKCjUg的Setting更新被veto，stack到ClientSettings.set，无模块caller。guard遗漏key，因此保留PARTIAL，只查该exact行元数据和剩余保护状态，不重放已接受业务或再次更新Combat。

Core14.368 WorldSettings按key/user共同选行，USER scope也通过世界Setting存储；同名行可能属于不同用户。只读工具输出row key/scope/user/type/注册模块及值hash、同key各行用户和hash，不输出设置值，不从计数判断异常或去重。旧baseline覆盖rowId/key/rawValue hash，元数据覆盖单列。确认实际键和保护指纹后再接三个剩余根、TE恢复及两Macro删除后的最终读回。

## R5设置归属实证与R6限定接续

元数据只读定位确认为calendaria.calendarHUDPosition，current GM的user范围行；同key六行分别属于六个不同user，原ID/key/raw值hash保持。六保护检查通过，原世界仅三自有根和已审计Combat metadata，旧部分失败保留。该结果不能倒推实际调用者栈，也不解释全部旧设置计数。

已装Cal1.4.2、MIT链接见manifest，calendaria.mjs SHAe8f5ccf548417f3e04f8e3a2b37d8107bab37dd8177a3443d61d193980148681；精确源码把该设置注册为user/configfalse/nullable对象，HUD zone/center/anchor位置调整调用settings.set。R6只将exact行/key/currentUser/value形状识别为辅助并继续veto，未来unknown Setting记录key/user避免重复元数据缺口。剩余Scene/两Actor/Fog、TE恢复和第二普通reload继续；已删Chat/Combat及active更新不重做。

该已知UI偏好原像只在测试控制Macro保留、报告去值。新客户端若guard装前仅自动改此行，所有其他Setting/原世界/module/User/Fog/time必须一致才可正常API还原该原值；任何其他漂移拒写。纯测试已证不同row/key/user/形状拒绝、真实Hook恒veto、未知漂移零update/save和报告去值；实际恢复仍待原生接受。随后删除控制Macro与临时原像并在同closure读回全集合，旧R1 User原像未知保持。

## 待判断本地化与复查

本次只诊断已安装模块的副作用，没有新增引入或本地化候选。后续候选或版本/哈希变化时，重核上表实际源码、前置身份、真实payload和原件读回，再选择对应窄验证；不由manifest声明、构建或本诊断推断整体可用。
