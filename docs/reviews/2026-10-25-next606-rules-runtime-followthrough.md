# ServerNext 6.0.6 规则与内容模块的实机接续

## 范围与证据口径

只针对本轮原 Next、Core 14.368 / dnd5e 6.0.6。Forge、Mirror、生产、Git 发布和完整角色矩阵不在本轮；已接受 TE/CC/WMP/Deck GM 等代表链不重测。实际进度仍以执行总账为准，本文件保存精确版本接口事实、已获得的行为证据与尚未完成的出口，不以 manifest 或工具测试代替实机接受。

## IFS 有 CC：实际代表链已接受

本轮首次夹具缺少旧 IFS 根 schemaVersion 和完整 injury 字段，CC 正确拒绝。`fvtt-custom-conditions/src/injury.ts` 的 readInjury 要求旧根 schemaVersion=1，并校验 episode、HP、suppression 和 transaction 等字段。问题是本轮测试输入不合法，不是产品回归。原失败保留；只修同一临时死者的受支持输入，保留 stacks2、oldMarker、nested 和 legacySibling，贡献者完整源不变。公开 beginDeathEpisode 首次成功建立状态，没有手写 fading/history/dice。

最终 IFS 脚本身份为 `a90b4a0b8d7ef81bbabc3b1a5a34b074e36f643983d314a70e49fc963faa7430`。有 CC 实际完成：

- future schema999 被拒，Actor 写入尝试数0、原 hash 不变。
- 正式贡献请求产生原生 prc 检定；实际2对DC15，GM明确裁定失败，没有为结果重掷。
- 正式最终 blind 结果为 success；DC11、0成功/1失败，history1、blind1、audit1、pending为空，旧 injury 字节保持。最终 face/total 未导出；GM recipients 由冻结的运行检查核对，历史原字段先校验再用公开 getter，不靠 getter 隐藏额外字段。
- 同一旧 ritual 卡结算按钮实际点一次后，history仍1、新消息0。未捕获 toast，不声称通知文字通过。
- 业务普通 reload 后状态 hash 保持，公开下一 episode 保留旧 history 并解除新阶段的 consumed 标志。
- 三个本例 Actor 清理，原完整 ChatMessage 集合 hash 恢复。工具跟踪 chatIds 为6，未独立采实际 delete 次数，不把简报中的5条或跟踪数直接当删除数。

主要原件位于 `.local/next606-resume-20261024/chrome-business/ifs-with-cc-r4/`：09 SHA `bf31c98d836da4ffe9c6dcc4e263da313148bc5ceadab79d4bc298d2eb7aeba8`；业务 reload 12 SHA `0788861846a09d5ff43fd2a0c2fa6bd96e7baaa399bd51fd2b48c42c46b580d3`；下一阶段13 SHA `506963b398e4cd099f7428a2364a456ffaba52cd95496af56d0ba3234f4ffdbe`；清理14 SHA `2b38a891ed2539ba51ec08c1e7a8514742b60bd47ab7f8a130546026fb235950`。无 CC 分支仍待单独执行，不推广完整复活方式、多 GM 或玩家矩阵。

## 食人魔：已获得的授予与公式类型证据

同一新角色已通过正式 Native Advancement 完成 Large 和四项零级特性授予。首次工具复合断言失败没有输出实际值；补只读诊断后实际确认：Large、prepared walk40、darkvision60、AC8、两项 active applicable Effects 和四项可关联的原生 ItemGrant。

HP 每级加值原值是字符串 `"3"`，原生确定性解算为3。旧工具直接与数字3作严格比较，因而误停。精确6.0.6来源：

- `module/data/fields/formula-field.mjs`：FormulaField 继承 StringField，效果 delta 保持字符串；确定性公式不等于准备后的所有字段都必为字符串。
- `module/data/shared/movement-field.mjs`：speeds 使用 FormulaField；`module/data/actor/templates/attributes.mjs` 的 prepareMovement 随后把实际速度解算为 number。本例 prepared walk 确实是 number40。
- `module/data/actor/character.mjs:69,254`：hp.bonuses.level 是公式，计算 HP 时调用 simplifyBonus，没有把该字段回写为 number。

读取修复仅做原生确定性公式解算：先替换引用，拒绝 missing/未知引用，先确认 isDeterministic 再严格同步求值，不能掷随机项、发 Chat 或写 Actor 来凑预期。实际诊断原件 `species-r5/04-readonly-species-diagnostic.json` SHA `7cec3402dea43499523e252a06fabc059e39d6952e7d4de51d10260cec75c7ff`；源码更新05 SHA `c17ff5eade5a419fab062bef28f601dc8f3becfcfc68c13889ff6ed7ce1f4159` 独立证实 Actor 前后完整源相同、ownership/run/baseline 保持。

同一诊断还确认本轮通用夹具带着 source hp.max20。CharacterData 把非 null 的 hp.max 作为手动上限覆盖；只有 null 才计算 Class HitPoints Advancement 和每级 bonus。`HitPointsAdvancement.apply` 仅增加当前 HP，不清除该覆盖。因此后续应使用原生 HP 配置清除本例临时覆盖，再让正式升级计算结果；不能直接写15或55。本轮尚未完成职业、等级、两次消耗/第三次拒绝、长休与重载，不能把上述物种基础读回写成整个 Species 接受。

另一个必须区分的依赖是官方6.0.6 `packs/_source/classes24/barbarian/class-features/fast-movement.yml`：5级授予 Fast Movement，包含 transfer active Effect，步速加10。后续应核物种基速40与原生职业加值后的总速，不应继续把所有等级总速固定为40。此处是来源事实和后续检查选择，实际5级结果仍待采集。

R7-r2 实际基础读回06已通过来源证明，原生角色卡也已显示 AC8、Large、速度40和黑暗视觉60。随后原生 HPConfig 一次清空 Maximum Override 并离焦后，08 仍为 source.hp.max20；同期工具拒绝了一次准确 User Fcc 的 `flags.dnd5e` 写入。历史记录只有路径，没有 payload 或 recursive 选项，因此保留为未知尝试，不能追认为同值写。`primary-sheet-mixin.changeMode` 提交的是 Actor 表单；`base-actor-sheet.#saveSheetSize` 才写账号窗口尺寸，现有时序不足以定位触发者。原 Actor/run 与拒绝记录保留，职业尚未添加，只继续诊断提交与工具拦截层，不重做四项物种授予。

针对这次 HP 表单现象另做一次有界 AnySearch 混合检索，查询包含 dnd5e6、Maximum Override、blank not saving 及官方仓库实现。出现一个相似的旧版手输 HP 报告 [Issue regarding Character/Actor Hit Points](https://www.reddit.com/r/FoundryVTT/comments/1idvvp0/issue_regarding_characteractor_hit_points_dd_5e/)，但原文检索只返回站点验证页，无法核实条件、尝试和结果；其余结果没有可比的精确版本复现。故本轮没有可据以采用的社区修复，不把摘要当成原因或共识。搜索及读取原件分别保存于本轮 `task-progress/hp-ui-search-raw.txt`、`hp-ui-firsthand-raw.txt`，后续以精确本机源码和一次有区分力的表单/请求读回定位，不反复试同一清空动作。

只读诊断10确认当前账号的业务字段、其他受保护 flags、CalB均保持；唯一最近角色偏好有本例准确写后归属，最终仍须恢复。随后11实际表单观察证明 fill空+Tab 只产生模拟 input，没有 change 或 Actor提交。Core `FormDataExtended` 行200把空数字转换为null，ApplicationV2收到change才触发表单提交；HPConfig行114–120调整current HP后调用super且没有return/await，不能用UI返回当作服务器完成。关闭未提交表单并重新打开原生20后，12的唯一真实Ctrl+A/Backspace/Tab捕获可信input/change、Actor pre/post与服务器source maxnull/value0，清除手动覆盖已完成。原无职业角色按系统得到0/0，同Actor的CC/IFS episode事件原样保留，未修改产品或手写预期HP。

这次诊断另捕到新的普通空 `flags.dnd5e` 请求，recursive=true、diff=true，无operator/noHook，且当前namespace已存在；它为一个窄工具门提供真实输入，不足以推定旧08未知请求内容。未来诊断请求始终被拒，旧记录不清空。主要原件为 `species-r5/10-r8-readonly-preflight.json`、11与12；12 SHA `b2cd3b825aa882d2f87f637f1155a3ad4161f9648e095ddfb22efc515266d68f`。物种职业、等级、特性消耗、长休和普通重载仍待，不能把这次提交定位记作整个模块PASS。

## Species 业务已接受，清理遇到独立索引元数据门

后续16–23已真实完成：野蛮人1级HP15/步速40，5级HP55/步速50；AC8、Large、黑暗视觉60，物种5级脱困授予与官方FastMovement的准确来源/added/origin关系通过。脱困两次2→1→0，第三次原生资源门拒绝且聊天、实际效果和授予读回均同；一次长休恢复2，22完整ModuleConfiguration/Context/Fog同原，23普通重载的关键语义与21完全相同。已看原生角色卡与第三次拒绝图。ASI专长已授予，但属性分配未出现，六属性仍10，未宣称其加值生效；未采升级前后的完整Actor字节等同，只接受实际语义、来源和资源读回。父审原件 `parent-business-acceptance.json` 保持冻结。

24清理在删除前的前置门停止：新增准确 Setting `NATaNYoEyEfeyVdJ` / `fvtt-json-generator-spell-resolver.indexMetadata` 拒绝，原请求payload未保存。源码 `monster-spell-resolver/src/foundry-adapter.ts:98–109` 唯一写点位于索引重建，ready和公开Rebuild入口均可到达；Actor创建/升级/使用/休息/删除不调用此重建。索引是异步读取可读Item compendium的spell metadata，故ready请求可能晚到，但不能据时序断定旧24的调用来源或值。

五字段是包/pack清单、sourceInventoryHash、candidateMetadataHash及candidateCount，不含Actor/User/凭据或法术正文；输入变化可能使Resolver选择或缓存过期，不能把它列入UI豁免。诊断也不在metadata hash内，所以同值不能独立证明运行健康。25原生证实Actor和两chat仍在、未见额外文档/Setting差异，当前准确NAT raw SHA `db912373ae8dca492001c5b4c8183eb39ddc4c825f9f867bfbb3379194ff76cc` 同原baseline，API兼容/canMutate=true/diagnostics为空、1919候选，公开索引五字段同原生Setting。25还原生取得R9已持久的独立证明/33观察记录和一条正常空User请求记录；此前的持久化与正常接线证据缺口由此补齐。

26只调用一次正式公开Rebuild并继续veto准确Setting请求，实际proposed/current/baseline原串完全相同；无captureError或post事件，API另核仍健康。27停止观察，2个事件完整，Actor和chat全源相对25保持。27 SHA `ae9bb0deb7992d5ae2eddd2ad4423a73092918765e4a28537c518d789d3af318`。这只支持未来严格同raw更新的窄工具门与当前状态证明，旧24仍为未知已拒请求，不追认为同值；清理尚未完成，不重测已接受业务。

有界AnySearch检索只发现不同故障 [Foundry issue14657](https://github.com/foundryvtt/foundryvtt/issues/14657)：`modifyBatch` 绕过Setting验证，而正常 `game.settings.set` 拒绝非法值。已读原文；它不解释本次同值请求被测试Hook阻挡，也不支持更换API避过门。未采纳该路线。搜索/原文分别留在 `task-progress/resolver-metadata-search-raw.txt` 和 `resolver-metadata-firsthand-raw.txt`；本次结论以精确模块源码和25–27实际原件为准。

## 长休与全局配置原像

Core14.368 `ModuleManagement` 按标题排序checkbox，再将表单对象交给 `game.settings.set` 重新序列化，因此正常UI恢复相同启用清单不保证原始键顺序或 inactive false/缺席字节。精确 Core `JSONField` 的 trim=false，合法JSON字符串在_cast中原样保留；若UI恢复后只有这些已知差异，可通过准确 Setting 文档的正式 update 保留已采原raw，而非重新序列化对象。该记录形成时回退尚未安装或执行，后续实际结果见末节：审阅包 `module-configuration-raw-restore/artifact-r2/helper-r5-patch.json` SHA `f1c187088beb06fe1fd44765a9ebfb6437aff1155345866bc69dfb0cb8deaf5d`，command `1c5f2ad1e23785d2445357b53486f6c596721c5d0302bae22d8924316285d30b`。

该候选已独立静态复核：只绑定原helper、Qrz唯一行、Fcc和不可变原收据，完整113项id/version/active及原Context/Fog通过后才准一次必要恢复；未知ID、重复键、活动/版本变化拒绝，尝试标记先保存且失败不重写。自然重载后核配置/Context还会保存自有helper进度，不能笼统称为只读操作，须等保护此helper的用例全部闭合。当前Species仍保护旧helper，故本轮没有提前安装。Role工具保持原冻结版本，Resolver仅因确有原生角色卡链而接已观察的空偏好窄门；这些准备不代表新的实机接受。

精确6.0.6 `module/documents/actor/actor.mjs` 的 longRest(config) 保留传入选项。Species 当前 character 调用 dialog/chat/advanceTime/advanceBastionTurn 四 false，关闭系统的配置窗口、总结、2405的时间推进和2420–2421的设施推进。group rest 有独立 calendarConfig 覆写路径，本例不是 group；外部 Hooks 仍可影响行为，所以源事实不能代替实际长休前后 Context/Chat 读回。

Core14.368 `client/game.mjs:1291` 将 core.moduleConfiguration 注册为公开 world TypedObject(Boolean)；ModuleManagement 提交整个 checkbox 对象，还会移除不存在的模块键。仅 active 清单相同不能证明原 raw 的 false/缺席、顺序或空白保持。实装 WMP requires CC+TE，IFS 没有 CC requires；无 CC 测试须按正常 UI 依赖顺序处理 WMP，保留 TE 和其他模块。

本轮已经原生采到准确配置原像，未切开关：row `Qrz1rbARmAKNYYgo`，raw SHA `71c567043ca7ebdc9d528c2c859f650bd970004e117de2ee837333b18adced29`，113模块/101 active，与 IFS 开测前保存值逐项相同。`module-configuration-r3/02-original-and-context-r4.json` SHA `98bbdc82ec34d0a030eab3eea881ab4e2898fcaaf7ade3f1dc38a4f30eaf440a`。

Rules 原清理报告没比较/导出 after time/scene，故另以这个已需的入口补读 Context；实际 time21085409/pausedtrue/activeScene 与 IFS 原像一致，view/Level/control/targets/pan/Fog 与 Painter14已恢复原像逐项一致，没有重跑行为或重写时间。初版 Core 工具漏 binding.userId 的失败发生在 captureIssued/唯一自身 flag 写之前；修绑定后才首次保存，旧失败原件保留。该工具只有自身 receipt flag 写，不能自动切换/恢复模块。

## 保持的未知与复查步骤

旧 TokenSync Calendar A 只有 hash，后续均以已准确采集 B 作各自前像，不重判旧 REVIEW。新 B raw 允许一次来源约束的离线反证：仅已读坐标/源码默认坐标/固定 zone 枚举共21项，无匹配，停止扩大几何猜测；报告 SHA `917f6bc90013903611f6743f2d554dae8d81eafb0e2c65b7a59644698087b8ff`。用户随后明确答复：“本轮纯界面偏好可保留当前值，记录缺口并继续（侧栏、窗口尺寸、日历位置）”。据原问题约定，后续仍先采原值并尽量恢复，角色数据和功能设置不在此范围；当前B是获准保留，不是旧A已恢复。原题和答复保存在task-progress/user-ui-decision-20261025.json。

BH 本轮只验新角色/职业授予，旧角色保留只读 Preview；实际 Preview 代码不会写 Actor、复制或下载 backup，但迁移计划仍依据6.0.2合同，没有独立6.0.6迁移语义保证，不推广为旧角色迁移支持。

后续新候选先核实际 source/pack/版本与本轮身份；只复查受改动影响的字段或依赖。新增 Source/schema 差异先分清真实产品偏差、夹具初始条件与观测器读取错误，再补缺失的真实 Native Flow；保持原失败和已通过独立证据。没有待引入/本地化外部候选，也不据本记录扩大商业发行或完整等级矩阵。

## 血猎手四支新角色：读取层纠正与实际重载接受

四支同一批新角色通过原生Advancement到3级。首次06失败来自读取器将prepared SubclassValueData.document与字符串ID比较。精确6.0.6 LocalDocumentField默认idOnly=false，prepared值是当前Actor的BaseItem实例，toObject才回ID；实际MidiItem仍继承BaseItem。R14保留对象身份/归属/集合关系及raw ID与源UUID双检查，先记录再断言，四个实际关联均通过，没有重建或重新授予。

下一次10的焦虑血咒logicalHash差异来自预期层：canonical-package是投影前文档，build.ts先用projectRuntimeDocuments投影v14 Effect再刷新logicalHash，已发布pack与migration-contract均使用投影后值。固定Bun1.3.14只调用纯导出，82份运行文档及来源/版本/UUID/合同逐一一致，canonical序列化SHA `ceef1e3aeb68721bec6765f9f17a0cb0e2987d03f9556d4160e87697dcaa2394`。未运行构建或修改pack/Actor；R15只将读取器预期换为真实生产投影，原canonical和失败报告保留。

实际14聚合为PASS_BOUNDED_NEW_ACTORS，41条模块来源观察的marker/advancement差异均为空，另4条官方Archery来源单列。突变14 Items/12 links、四配方；弑灵11/9；化狼10/8、number scale1；渎魂10/8、四scale 1/2/1/2。四支class3/HP22、Con/Dex10，父已查看实际原生卡。渎魂来源Intelligence/GM辅助配置、progression=none/ability为空，未宣称自动法术/契术位或特性实战效果。

仅普通重载一次后，Chrome DOM运输暂时失效；保留原页和角色，读取官方组件文档，同一Tab screenshot/AX成功后唯一小DOM探针恢复，未重复重载或Join。18精确身份通过；19完整聚合SHA `56871dd407676e84d5eade3f0f40958bfe5c34069c7fe713b1f6c46bece0c5ab` 的最新完整report与14逐项相同，原run/四IDs、blocked为空、Resolver健康均保持。新角色/职业授予与重载代表链已接受，准确清理和末读仍待；不推广旧角色迁移、全等级、所有特性实战或生产。

后续BH20准确清理、21原Core配置及完整Context末读均通过，限定角色链闭合；Rules Macro暂保留到NoCC结束，未以旧角色迁移或所有特性游戏性替代该范围。

## IFS 无 CC 与原模块组合恢复已闭合

同一Core helper在无活动业务case时迁移R5，父核两字段以外的完整native source、flags、ownership和原receipt不变。正常UI停WMP时出现可选CC/TE停用提示；取消可选停用、保留TE，再单独关CC。保存重载后的113个id/version相同，仅CC与WMP从true到false，99active，IFS/TE仍启用，完整Context/Fog保持。该实际依赖过程没有停额外模块。

NoCC新run698d6523实际完成direct IFS future999零Actor写拒绝；正式贡献prc12/DC15由GM判失败，正式最终blind只一次，安全历史success/DC11/0成功1失败，history/blind/audit各1、pending为空、legacy injury保持。同一旧卡一次点击后history仍1、新消息0，普通重载完整安全resolution与之前逐项相同，下一episode保留history。12清理恢复NoCC基线的文档/Setting/modules/User8/Cal，13Context同原；14ack后仍在99组合最终删除Rules，15原生缺席及恢复读回通过。无最终blind面值/总值导出，未采toast不声称文字提示。

验收工具额外完整state.run归档仅点一次，官方下载事件15秒超时，精确预期Windows下载文件不存在；完整归档未取得。01–15必要安全行为、原baseline签名和原生末读均保存，下载运输缺口没有被改判为成功，也没有因此重建工具或重跑业务。

之后正常UI启用CC、WMP并重载，113/101启用组合和完整Context均同原。05实际guard表明只有6个原来缺席的inactive模块键被显式补false以及序列化差异，原有键/值全部相同。06仅一次准确Setting.value恢复原raw SHA71c567，随后07真实自然重载的row/raw、完整id/version/active、Context/Fog与不可变receipt全等，source1c5保持，进度verified-after-natural-reload。父独立对原/当前结构逐项比对并确认实际timeOrigin改变。

后续Resolver新baseline采用更宽的secretKey过滤；1571条可比较Setting四元组与NoCC前原1665条按同过滤投影后完全相同，包含Core配置与功能性indexMetadata；另94条因名称中token段而未采集。这是证据范围差异，不是服务器删除或94值已比较的证据，不宣称全库原值相等，也没有为凑指纹放宽过滤。原模块组合恢复出口已闭合，其余Resolver与Role实际行为仍待。

## Resolver 代表链已接受与 Role 原生集合读取事实

Resolver后续实际十条严格来源/缓存/Cast关系、一次迷踪步资源0→1及准确缓存卡、一次Undo与普通reload均通过。界面使用当前已装组合的NPCActorSheet和正常“Midi Use”消费窗口，不推广纯Core无Midi或真实传送落点。重载后pending/0Spell/0managedCast、undoSnapshot字段缺席、portablemanifest不变；09清理、10取证Macro原生缺席末读通过。父比原/末11集合指纹列表、1571条过滤范围内Setting四元组完全一致，User业务/非敏感flags/8已知UI与Cal/time/pause/Fog通过，只有正常审计变化。完整原件在resolver-r4目录，不将该切片扩大到所有法术/活动、其他角色或生产。

Role工具随后只读preflight在无run/fixture时失败。精确Core14.368 `client/game.mjs:629` 使用Collection创建game.modules；`common/utils/collection.mjs:14–15` 的默认iterator返回values。旧工具把每个Module值按`[, module]`解构，故出现不可迭代错误；这不证明Deck、TokenSync或Painter的角色行为失败。新r5仅改为显式values并保留完整id/version/active投影、排序和哈希；真实Core类的最小反例复现旧错、新表达式得到原预期完整hash，逆差异可逐字回旧command。Reader、权限、八叶/Cal保护不变，原失败与旧r4工件保留。新实际preflight与角色链仍待，不把单组离线检查当运行通过。

## Role 已通过片与被取消的外围 HUD 请求

R5实际preflight已通过；一次临时生命0→1期间四个输入真实disabled/busy，原HP20保持；自有stale目标删除后原生fromUuid不解析、Deck行消失。主机在14:54重启导致旧进程/页面上下文失效；同一data/app/Node/6.0.6及8入口SHA确认后正常恢复原Next，保留同一Role case与已过片，没有重建用户或角色。后续一条原生HUD中毒命令在同GM两个客户端的两个不同Actor上均读回poisoned；第二页已关闭。Player片尚未开始。

进入Player前，Role工具将所有被取消User请求一概当成未审失败，停在外围Token Action HUD模式字段。精确实装`token-action-hud-core`2.1.2的`dist/token-action-hud-core.min.mjs` SHA `5f5dd9389f3592b691c7db46cae3243762c5600b606377153b5f39d5bf030670`，get/set isUnlocked经用户flag控制个人HUD编辑、拖动与点击编辑模式。该模式变化没有被纳入用户的纯窗口保留许可；本轮仍取消其写请求。25实际User保护范围/Cal同原，但旧请求值没有采集，始终为UNKNOWN_NOT_NOOP。

26/27保存了打开编辑器额外触发的被取消请求，包含208个具体窗口宽高路径及历史null键。原始记录全部保留。R3默认只读列有限可审的旧源码记录，父控审阅本次完整snapshot/control SHA后，才一次更新同一取证Macro；未来MLD请求仍阻断，未来单HUD路径也必须是R6钩子明确取消且同case/Fcc的记录。既有User写门、User/flags/Cal比较与原baseline均保持，不能以分类代替真实数据相等。

27实际七条完整前缀及控制SHA c70c1918已独立重算；28原生更新后，原baseline/Actor IDs/results、七条raw记录、其他flags/ownership和fixture hashes均逐项相同，User保护范围通过。保护间隙只暂停准确旧User hooks并如实记录，待普通reload恢复新保护；未重放GM/第二客户端行为。该工具修复与已经获得的产品行为证据分别保留，Player/最终清理尚待实际结果。

后续31真实reload恢复R6保护。34–45实际TempPlayer已完成Deck四公开GM-only拒绝/工具栏缺席、TokenSync可见fallback帮助、Painter无写能力及工具栏缺席、Observer Token无HUD且不可update；返回原GM后工具内部完整native Actor hash比较同原，User/Cal/七raw取消记录均保持。compact读回没有导出前后Actor hash值，不声称父独立重算。产品代表链已接受并冻结；旧实装帮助bundle文字尚未同步工作树文档，不能据文档完成宣称已部署。

47准确清理只剩一条新增ChatMessage AXTzGaG9uqVGBelQ，其他本例User/Actor/Scene/Folder/Reader均已删除、恢复门通过。原件保持REVIEW_REQUIRED；48准确DOM row不存在，作者未知，未读正文/骰子、未删消息。日志时间与实装3ds-atlas更新通知实现提示一个可检验候选，但不构成归属证明。只新增精确native Chat index元数据检查：若作者/唯一收件人均为已删除TempPlayer且speaker/时间吻合才进入原hash核对及一次准确删除；否则停止对应删除，不能靠时序推测或重跑测试消除差异。Role最终恢复及全工具终结仍待，Inspector pending件仍未安装。

49进一步取得安全native服务日志窗：17:15:53向准确TempUser发送World数据、17:16:06创建准确消息、17:19:14该User退出；17:23:48其User文档删除。实际Windows时区China Standard Time/+08/无夏令时，UTC窗09:15:53–09:19:14，epoch1792919753000–1792919954000；证据SHA `e32c1ffa84e24f2d2df2c91d7deb1ea27e6ab0195a3d94aab33a279940dd67b5`。未将本机文件mtime冒充原生登录时间。独立源码又发现Atlas通知入口ye()先要求game.user.isGM，因此“TempPlayer自己的Atlas通知”解释受到反证，不能据时间直接接受，实际author/whisper元数据仍是必需下一步。

54准确native元数据实际alias为Dice So Nice!，Atlas假设已否证；作者和唯一收件人均本轮TempUser2q，timestamp1792919766986、style0/blindfalse、说话者无Actor/Token/Scene关联，处49原生日志窗。实装dice-so-nice6.3.1/main.js SHA3d21ae43的唯一whisper创建点_welcomeMessage符合该欢迎私信结构，没有Atlas式GM门；未读正文，不能把“符合”写成完整正文归因。父审55依据准确临时作者/唯一临时收件人与生命周期接受本轮清理归属，不扩大到真实用户消息。A原件保留Atlas条件false和零文档写，B仅可在重核准确metadata/原47整行SHA后删该ID一次，仍待实际删除及Role原生末读。

56/57实际已按上述精确条件只删一次，原生准确消息缺席；B仅归属确认后的完整行内存hash，不导出或语义检查正文。58独立末读与28原baseline相比，11类文档指纹数组完全相同，Setting1682行只有两项auditHash变化，799安全值hash与883仅身份覆盖不变；User受保护tuple/flags/UI和CalB、模块、active/viewScene/control/targets/time/pause均同原。父59完成结构深比接受。原58仍为REVIEW，原因只剩两条准确R6取消的source-edit208路径记录，原七日志保持、实际User相等；不改日志、prefix或伪造原工具PASS。Role工具、末批Inspector和手册最终收尾继续单独执行，产品链保持冻结。

## 原生工具终态与记录格式的实际反证

Role63只停本例两个准确User handle，65经正常UI删除后native `_id`缺席；原run与REVIEW未改。旧Inspector66保留Main原命令28/run94及Cal准确身份，随后真实绑定的末批A证明原92宏全源hash与native原7User IDs，唯一剩余工具集合可核。Core最后发现唯一缩放微差，未更改其比较结果或跳过门。经精确Core resize/缩小键源码、官方可选viewport接口及实际键绑定查验后，临时原尺寸下真实PageDown一次再reset；14完整Context/Fog/配置/模块全等，15通过自身门自删。没有借视图问题重跑已通过功能。

原Inspector B的16失败来自辅助工具记录格式，不是角色或模块行为：User调用标记仍false。19实际native旧intent中，dotted路径已展开、7个`-=`键被处理掉。精确Core `common/abstract/document.mjs:974` 的setFlag直接交update；`common/data/fields.mjs:1904` 的ObjectField递归展开，1937附近的更新合并应用DataFieldOperators。完整原生形状由实际Core字段与merge内存反例复现；新的opaque JSON字符串/path-value编码通过同一实现保留。reader-r1的div呈现错误亦保留，r2只改容器补采，没有伪造未显示的值。

恢复没有删除或覆盖旧intent，也没有重置原一次门。新marker固定旧native SHA93418与原immutable身份7556，绑定16“User调用未发”及19实际flag；当前21先重核原92/7User/Cal/其他User范围和完整UI候选，23才首次发原已授权精确User更新。25最后自删且同闭包原生终态通过：所有Task宏缺席、原92宏完整行hash及原7User IDs相同、完整安全MLD namespace为原4eb，删除后无持久化/User写。父26独立结构复核接受，原失败与raw47/58/16均保留，不以新结果篡改旧记录。

本轮模块代表链、测试对象和工具、已采纯UI恢复均已闭合。旧House账号分项原像缺失、Calendar旧A和额外IFS完整归档未取得继续按原决定／事实披露；CalB是保留而非旧A恢复，不声称完整pre-task User或全部Setting值相等。当前仍未覆盖的全目录／全等级／全法术、更多玩家写入／多GM、长时及生产是独立范围，不能据本轮结果推广。手册同步以最终实际来源审阅、生成和一致性结果为准。
