# ServerNext 玩家人物失效物品修复计划（历史批次）

> 当前执行顺序只见[迁移当前清单](./server-next-migration-handoff-20260927.md)。用户于9/29将剩余人物错误排到模块之后，并取消30分钟总时限；下文是已执行批次的原计划，不继续作为派发指令。

状态：本轮用户批准的6件修复全部PASS（数据/引用/普通窗口/重登），原7件目标为6/7，雅灵缺1原引用仍待查。27永久来源/1文件夹保留；临时Macro已删除，最终ServerNext正常关闭、23锁释放。完整346测试通过；超时与错误截图偏差已在最终报告明确记录。

## 目标和边界

在本迁移工作树，针对 ServerNext / 127.0.0.1:30002 / cor-cotn / Foundry14.368 / dnd5e6.0.2，修复五名玩家人物的7件失效物品。精确名单来自[已核实归属](../reviews/2026-09-28-server-next-startup-error-actor-attribution.md)：卡勒姆1、奥黛塔1、艾莉儿2、泽菲尔1、贝伦席拉2。旧测试副本 LN5PLqTTdx0l7o7w 只诊断并保留。所有其它人物与旧测试对象保留。本轮不安装其它包，不调整模块开关，不提交/合并/推送，不创建人物或世界备份。

## 执行顺序

1. 准备本轮专用 Foundry Macro 工具，提供检查、预览、应用、复核，默认只读。通过正常 Macro 界面载入，不写运行中 LevelDB。
2. 按精确ID用 getInvalid 获取失效物品；必要时只读正常文档接口的原始数据。记录名称、类型、失败字段、授予引用与来源标记。只导出诊断字段、差异和哈希，不导出人物全文。
3. 逐一核对原授予内容与已安装合集或已有世界独立物品。来源必须有可靠标记、唯一可解析且内容对应；不凭同名猜测、不清空授予列表、不创建替代能力。缺来源的项记录具体缺口并继续其它项。
4. 生成仅修改错误授予引用的前后对照；内存候选通过当前系统严格校验、无关字段差异检查后才可应用。保留顺序、等级、选择、原授予记录。
5. 按卡勒姆、奥黛塔、艾莉儿、泽菲尔、贝伦席拉顺序，以人物为一批（同人物两件一起验证）；写前检查原数据哈希，通过正常 updateEmbeddedDocuments 更新精确Item，保留校验和Hook，不替换人物整份items。出现意外差异、部分写入或新增错误即停止，不盲目重试。

## 验证和委派

- 局部测试覆盖可靠来源匹配、同名歧义、缺来源、资料漂移、重复运行、无关字段与越界写入拒绝。
- 实际验证：目标退出失效列表；正常角色卡能显示和打开；新引用可解析；已有能力/等级/选择/授予记录一致；人物和物品ID、物品数、HP/资源/背包/权限不变，修改时间等正常元数据单列；重登保持且无新增错误。不升级或降级玩家人物。
- Chrome 按 chrome-delegation-dev 复用独立 Luna/max 任务 01a0e69f-fac9-7931-aa4c-7771c2236ba6，回报主任务 01a0e0af-9d17-7bc3-a02a-391e051355a1。按9/29最新用户约定，父任务先完成代码、测试、服务准备，派发后仅可继续必要且不依赖结果的已授权工作；无此工作即结束，不轮询。同轮/新轮收到callback均可恢复。派发用dispatch首行，回传用callback首行和跨线程工具。
- 只读取数与应用分开派发。应用阶段只能使用父任务核定的唯一来源映射；初始版本应用入口机械锁定。工具保存并能在重载后重新打开后再继续。
- 本轮短时服务/Chrome限制30分钟，25分钟开始正常收尾；关世界、核锁释放后停止本轮所属Next进程。Mirror不动。每批保留完整工具源码，批次最终清理本轮Macro/临时对象。

## 交付

逐件说明原物品、错误、最小修复和重登结果，更新交接报告。只有7件全部通过才关闭玩家物品修复；其它项精确列出待补来源/阻碍。旧测试副本、Pixi、404与14个缺包继续单列。随后才推进自定义状态和触发器源码衔接。

## 实施记录

- 工具源码位于 `tools/foundry-ops/src/player-item-repair/`：纯修复逻辑、运行面板、初始为空的审查映射、构建器及测试。该工具仅用于本轮诊断/修复，不注册模块或公共API。
- `bun run test:foundry-ops`：323 pass / 0 fail，包含本轮14项来源、边界、漂移、纯差异及检查版运行测试。`bun run typecheck:tools` 通过；JS检查面板另通过实际打包与无世界数据的执行测试。
- 构建产物：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\player-item-repair-20260928\repair-macro.json` 和 `repair-macro.js`；命令体SHA-256 `f18880cdfd187b63d3d21c757583d99effd0efbc02147ee6c4820218f384dfa2`。初始 `approval.actors=[]`，即使直接触发apply处理函数也拒绝玩家资料写入。
- 先派发一次只读取数，取得8件（含保留样本）的必要诊断字段后由父任务审查。未知/付费源包不自动打开；来源不明的项保持阻塞。后续应用版需另填精确来源、内容核对证据和前置哈希，再重新测试构建。
- 第1轮结果已回写[实施记录](../reviews/2026-09-28-server-next-player-item-repair.md)：34个旧授予引用，标准来源链接0；保留Macro ID `iVGta3mQEvac49mo`。第2版增加有界Plutonium/本团来源标记、内容哈希与世界独立物品的精确标记匹配，仍锁定应用，不输出描述全文。`bun run test:foundry-ops` 325 pass / 0 fail（本轮16项），检查版无玩家写入的模拟执行测试通过。
- 第2版产物同证据目录 `repair-macro-v2.json` / `.js`，命令体SHA-256 `00bab76abaa4b90323b0f56dfa4ebffb206af7b2a6b4cea620868e12f0a00f8a`。只更新同一个本轮Macro；原始取数回执按原样保存，保留v1原始构建证据。
- 第2轮13分51秒正常完成，发现实际来源namespace是 `plutonium-cn`，v2只读英文namespace的遗漏已修复；不能沿用v2“没有结构化来源”作为世界资料结论。v3同时显式读取CN与Scene Packer标记，保留英文冲突而不覆盖；17项本轮测试、运维合计326项通过。新产物 `repair-macro-v3.json` / `.js`，命令体SHA-256 `2d99b267f122efd3055647d67f451729f2142cbd3b5936960c07eb21495cf608`，仍只读且应用锁定。
- 9/29回传实测收到正确nonce；旧守卫同轮误拦截已记录，当前用户约定和本机实现改为无状态提醒，6项聚焦行为检查通过。恢复物品工作后，确认仅换已有来源链接无法闭合当前7件；27条新来源+1文件夹的具体草案已获用户明确批准，准备按下述应用版执行，尚无运行时写入。


## 9月29日新增来源授权与应用版准备

用户明确回复“允许新增来源条目（推荐）”，批准在 Next 新建 27 条世界独立 Item 来源和 1 个 Item 文件夹，用现有玩家能力的内容修复 4 名人物的 6 件失效条目。雅灵及旧测试副本保持只读；原物品、已有能力、资源、等级、选择和授予记录保持。新增条目是供 ItemGrant 使用的运行来源，不是备份或虚构新能力。它们在完成后保留；只有本轮工具 Macro 需要清理。

应用版 `v4b-authorized-library` 使用草案中的 27 个稳定ID，文件夹 ID `317b0435a52ac904`；`approval.mjs` 固定原 Actor/Item/被引用能力哈希。先在内存严格验证所有新来源和六件目标，再要求同一会话执行可见预览后才能应用。新来源仅变更独立文档元数据，移除旧 Actor 授予绑定 flags，保留其他 flags/机制内容；空 identifier 使用 `legacy-grant-<新ID>`，避免 dnd5e 创建时从中文名生成不合法标识符。创建后比对完整文档（单列新建统计元数据），全部27条可解析并一致才写人物。

正常 Folder/Item.createDocuments 与 Actor.updateEmbeddedDocuments 保留 Hooks 和校验。依序更新卡勒姆、奥黛塔、艾莉儿、贝伦席拉；每名写前重新核哈希，写后核完整原始数据。Foundry 14.368 ServerDocument 的正常 coreVersion/systemId/systemVersion 更新明确纳入预期、在回执保存前后统计字段，不放宽能力或来源标记对比。部分创建/写入、意外 Hook 变化、已有回执未完成均停止，不盲目重跑或自动删除已经创建的数据。

针对性测试新增8项，涵盖新来源内容保持、授权边界、必须预览、重复执行与重登复核、来源部分创建、Hook 意外变更和同时编辑。`bun run test:foundry-ops` 334 pass / 0 fail（本轮25项）；`bun run typecheck:tools` PASS。模拟测试不替代 Chrome 真实写入及人物卡验收。应用前仍0/7修复，玩家写入0。

应用候选产物：证据目录 `repair-macro-v4b.json` / `.js`，命令体 SHA-256 `3d5576cb19431930b273ddd1b62ff3d595208de41ec4c7fc10fcee09a7854134`（47536字符）。执行合同 `chrome-contract-v4b.md`，准备启动回执 `service-library-v4b.json`。此前v4只是未执行的构建产物；实际派发只用v4b。


## 9月29日 v4b 实际预览与 v5 校验修正

独立 Luna 通过正常 Macro UI 保存并逐字核验 v4b（47536字符/既定SHA），首次 Preview 返回 `Source changed since approval`。未 Apply，来源/文件夹创建0、玩家写入0，六件实际验收未执行；不得计作修复。完整报告见外部证据 `library-chrome-v4b-report.md` / `library-chrome-v4b-receipt.json` / `library-preview-v4b.json`。报告没有具体对象上下文，不能据此断言哪一份数据变了。

执行器正常 Settings→Return to Setup，API inactive、23/23锁释放后停止本轮PID2692；服务10:24:28—10:43:29，约19分01秒。回传实际到达父线程，证明本轮跨线程完成回执已正常工作。Macro `iVGta3mQEvac49mo` 保留供下一版使用。

v5修正两个工具问题：错误必须列出具体Actor/Item或引用UUID、原审批hash与当前hash；不再把整个人物自几轮前检查以来完全不变作为来源审批条件。六个目标Item和27个被引用能力继续严格核原审批指纹（没有修改任何审批hash），即使同名内容变化也停止。人物其他数据及两名只读对象在本次预览采集即时基线，Apply再次生成同一完整预览指纹，写每名人物前核此基线，写后核仅改授予链接及预期统计元数据的完整结果。正常的预览前玩家变化会保留；预览后变化仍拒绝写入。历史整人物指纹是否相同单列展示，不伪称已查明v4b漂移字段。

新增测试证明：预览前无关HP/权限变化保留；目标或来源变化仍按原审批拒绝并指明对象；预览后目标人物或只读人物变化均在写入前拒绝。模拟检查不替代下一次真实运行。若再次失败，执行器保存上下文并追加一次既有“检查”只读取数，供父任务定位，不重试应用。

v5测试：`bun run test:foundry-ops` 337 pass/0 fail（本轮28项）。首次回归发现检查模式mock未提供folders集合，已补齐测试环境，实际源码无该缺项。产物 `repair-macro-v5.json` / `.js`，48823字符，SHA-256 `f0c22aa7f669cf1a3c544b05de4d9427e161fb9adb1c69d6f575c7d3a0a09150`。Chrome合同 `chrome-contract-v5.md`。


## v5 精确阻塞与 v6 单项基线复审

v5通过正常UI保存原Macro（48823字符/既定SHA）；Preview准确指出艾莉儿海精灵 Item `Oqs0HDVs0QOmvzb9` 整体hash不符：原 `5a3c4e63bd999b5b8e447ffaa5da47cf89d8142b6e9c62873d9ef6bd6a0f9458`，当前 `1bd64537011c53ea52e4d0f157866d8f3bc15533956e7ddc51822e5728df623e`。仍未Apply/未创建任何来源或文件夹，保持玩家写入0。按合同追加一次只读检查，精确UI回执 `library-drift-inspection-v5.json`（150942字符，SHA256 `630bcb689123a2fd91c63bdda720f46940d45fbdbd329da2dd8966ba2098bda1`）；已正常关世界、核23锁并停止PID50820，跨线程回传成功。

父任务将v3与v5诊断逐对象比对：仅海精灵整体Item指纹与对应Actor指纹不同；六件目标的全部已记录诊断内容逐字段相同（除这一整体hash），包括精确完整ItemGrant配置/顺序/等级/选择/value记录、来源标记、类型/名称；27个来源能力完整hash全部与原审批一致。雅灵及保留测试对象整体hash不变。此结果不能推断“原Item完全没变”：旧记录没保存全部父Item数据或逐字段hash，无法从现有证据还原其他字段的具体差异。

据已授权的最小引用修复范围，对当前海精灵的9条授予重新审查：它们及被引用能力明确未变，修复仍只替换已知无效UUID，严格保留当前Item及Actor全部其他字段。因此仅该Item审批hash更新为当前已读值，保存previousBeforeHash和复审证据引用；不放宽任何后续漂移门禁。审查回执 `sea-elf-baseline-review-v6.json` 保留所有6件对比、27来源确认及证据文件hash。没有新增能力、清空配置、恢复旧字段或扩大人物写入范围。

v6仅更换这一审查数据与build标识，沿用已经通过337项测试的v5执行逻辑；逐项审批数据检查和打包通过，未无理由重复全套测试。产物 `repair-macro-v6.json` / `.js`，49075字符，SHA-256 `d4def301eee6b93712f7084c3886010e68bc8fc9d48867f0d220197aead1c8c6`。后续仍须实际Preview、Apply、人物卡与重登验证，当前修复0/7。


## v6重复漂移、父任务关服与窄化诊断

v6海精灵hash再次变为 `693f346bf7781bea388ad8a37c50efb987fa60419917104ed8388ed1e05c6ec8`，表明单纯把审批值刷新到上轮结果不能解决每次载入的变化。仍未Apply，玩家/来源/文件夹写入0。执行器及时回传正常关服失败，父任务使用官方Chrome新页面正常GM登录、关闭翻译欢迎框后点击Settings→Return to Setup成功。`parent-shutdown-v6.json`证明API inactive、23锁释放、PID8664退出/30002空；完成11:23:54，总864秒（14分24秒），未超30分钟。截图 `parent-shutdown-v6.png`。这次回传及时且到达正确父线程，未重现此前失联。

停止后以普通文件读取解析精确Actor库SST（未打开LevelDB引擎、未复制/备份/修改世界），取得海精灵及其Swim Speed效果的必要结构与文件hash，见 `sea-elf-stored-shape.json`。该效果ID `SIoBMgJ64YgbJ1eS` 的唯一 `system.changes[0]` 没有 `_id`；其key为 `system.attributes.movement.swim`、type override、value `@attributes.movement.walk`、priority4、phase initial。已对照实际安装dnd5e.mjs第7254行及精确6.0.2源码 `module/data/abstract/active-effect-data-model.mjs`：该字段定义 `_id` 的缺省值为 `foundry.utils.randomID()`。这给出明确的自动生成ID候选原因，但还需实时逐字段证据确认其是唯一变化。

v7因此严格只读，只采海精灵字段/叶子hash与该效果的必要数据，两次正常重登录比较；临时比较hash仅去掉这一个候选ID，没有放宽应用校验，也没有修改审批hash或效果数据。测试验证ID变化可定位到具体叶子、机械字段变化不会被掩盖、原对象不变/无写入入口。运维338项测试通过；仅4133字符的诊断Macro SHA256 `933ea777cf73734d93f44a0b46be281e5338a1c1f0dbee6723013a279a345597`。先闭合变化原因，再准备实际应用版，避免再次盲目刷新指纹。


## v7实时证据闭合与v8最小校验修正

两次正常GM登录各采265条海精灵叶子指纹，差异仅 `effects.0.system.changes.0._id`；去除该临时字段后的hash均为 `361dc1858af5f64e17c89063f68b5b5cc444b312dea92c5b101fdd5b86d692b6`。这与磁盘缺失ID、精确系统随机缺省定义形成完整证据链。v7未写玩家/来源，约10分25秒内正常关闭PID27644/23锁释放。报告 `sea-elf-drift-v7-report.md`。

v8仅对精确海精灵Item+Swim Speed Effect+唯一change的16位临时ID作比较归一化；不忽略任何其他字段、Actor/Item/Effect文档ID或其他效果的changeID。新审批固定上述跨登录稳定hash。Preview/Apply/Verify显式记录该比较例外和临时ID前后值。回归证明能力值/效果ID/物品ID/新增change任何变化仍失败，原数据不被归一化函数修改。

本轮30项相关测试PASS、打包PASS；两次完整 `test:foundry-ops` 均在后续无关worldAuditSnapshot native数据库测试后Bun1.3.8发生相同地址0x220崩溃，全套状态为INCOMPLETE，未伪报339全过，也未修改/升级运行时或反复继续尝试。此前全套338项通过仅是v7历史证据。v8产物50502字符，SHA256 `b614a0a20796407d92a3849173463ff28517320bccda2a8aed82180932c39e99`。

v7结果落盘后没有正确回传：只读线程记录显示其在报告之后发生contextCompaction，随后转去处理旧PID35180关闭记录，final回答旧任务，未发送v7结果。父任务因用户询问主动取回并核对两份原始样本，不能当作自动回传成功。下一轮用外部current-chrome-dispatch.json固定唯一当前批次/服务/回传对象；压缩恢复先重读当前合同，报告保存后的下一项协调动作必须发送回执，不再先做历史检查。当前玩家修复仍0/7，实际应用/重登待v8。


## v8已创建来源后的停止与v9审核恢复

v8 Preview首次完整通过27来源/4人物/6物品检查。用户授权的Apply点击一次，新建文件夹和27条来源后因来源hash不符在CREATE_SOURCES停止，尚未进入任何Actor更新。四个Actor actualHash均与beforeHash一致，两个保护对象UNCHANGED；未重试、删除或改写来源。执行器本次正确发送跨线程回执；正常UI退出后API inactive、23锁释放，停止本轮PID36636，12:31:35核服务关闭。原Macro及其halted回执保留。

停止状态普通SST文件解析（无数据库引擎/副本/世界写入）证明：27/27持久化文档hash与v8实际UI回执一致；唯一差异都是新增 `ownership.FccwB5HfAhy1F49a=3`（创建者GM所有者），把这一新增权限去掉后的hash逐一精确等于原预览expectedHash。没有任何内容/来源标记/效果/资源差异。证据 `source-creation-storage-audit-v8.json`。这证明来源完整有效，错误在预期模型漏算创建者权限，不需要清理或重建来源。

v9先验证原halted v8 Macro回执/CREATE_SOURCES阶段、四人物仍PENDING且beforeHash匹配、27来源及文件夹库存完整、文件夹批次标记、原特性hash以及所有实际来源hash。恢复分支不调用任何来源/文件夹创建、更新、删除API，只复用通过校验的现有来源。新预览显式sourceAction=REUSE_27_REVIEWED_EXISTING_SOURCES_NO_CREATION；再次预览/写前校验通过才继续原六件Item的正常updateEmbeddedDocuments。前次回执指纹保存到recoveryFrom，所有玩家校验继续有效。

相关32项测试PASS，包含完整恢复后重登复核/重复运行无副本，以及源内容/人物/缺失来源/错误回执拒绝。全套安全包装仍在后续worldAuditSnapshot原生数据库收尾时Bun崩溃，未报全套通过。v9构建60477字符，SHA256 `0ae66c563da207c7b75e7553823e9c78f29b5a87c95c42e79016795dbb28712a`。Macro更新只能替换command并保存，保留v8 flags回执，不能导入整份Macro覆盖状态。当前来源27+文件夹1已实际创建，玩家修复仍0/7，待v9实际写入与重登。


## v9回包错误的持久化复核与v10处理

v9 Preview通过来源复用，27来源/文件夹/库存PASS。Apply在UPDATE_ACTOR:D90ARiSHc6gQix80报 `Cannot read properties of undefined (reading '_source')` 并停止。**纠正先前只依据客户端回执的判断：卡勒姆血猎手7条引用已实际写入磁盘；另外5件仍为旧引用。** `player-write-storage-audit-v9.json` 是停服后普通SST文件读取证据，未打开数据库引擎或修改世界。客户端缓存的actualHash=beforeHash不能证明服务器未写入。

精确14.368源码 `client/data/client-backend.mjs`：第228行更新前get使用invalid:true，正常发送并写入服务器；第300行附近处理返回结果时get未使用invalid:true，第307行读取doc._source失败。后续客户端更新与postUpdate处理尚未完成，故缓存陈旧。原API流程的预更新和服务器写入已发生，不能盲目重跑。完整持久化Actor数据及UI状态仍需重登验证，不能只用7条UUID已写判整个人物验收完成。

v10 Preview先用v9预期完整Actor hash核卡勒姆，并验证Item已正常载入；相符则只读接受已持久化结果、跳过再次写入。其余三人物五件仍核原审批和即时基线。正常getInvalid取得的临时原文档通过公开EmbeddedCollection.set(id,doc,{modifySource:false})暂存到当前客户端集合，让标准回包处理可找到它；此操作不改_source数组、不清invalid标记、不跳过验证/Hooks、不删建物品。正常updateEmbeddedDocuments完成数据更新；失败后只清理仍失效的临时缓存句柄，不删除/回滚任何源数据，并标明需重登确定持久化状态。API行为依据 `common/abstract/embedded-collection.mjs` 第245—265、305—313行。

完整 `bun run test:foundry-ops` 本次345pass/0fail（36项本轮相关测试），包括原数据保持、正常回包查找与Hook流程、失败不回滚数据、恢复时卡勒姆不重复写入。此前Bun native崩溃历史保留，本轮完整通过，不需要扩大修复范围处理Bun。构建v10为63138字符，SHA256 `14d16d72fe2f9979f3f93b8ee80a03fb4ed0404cf17bf5011320c48c71d364db`。

当前：27来源已核验；1件引用写入已持久化但完整验收未完成，另外5件待写；雅灵继续排除。只有六件均完成完整数据/UI/重登核验才能报告6/7，原7/7总体仍未完成。Macro保留v9halted回执，只改command载入恢复版。


## v10奥黛塔已保存与v11失效标记同步

v10 Preview证明重登后卡勒姆完整Actor等于原expectedHash且物品正常，未重写卡勒姆。奥黛塔正常API更新完成，客户端完整Actor已等于expectedHash，但旧invalidDocumentIds仍包含目标，工具因此以“Player Item remains invalid”停止。停服只读SST核验 `player-write-storage-audit-v10.json` 确认牧师6条引用也已持久化；艾莉儿/贝伦席拉4件仍未写。原任务Macro回执从SST独立读取为 `stored-macro-receipt-v10.json`，明确卡勒姆已验证、其余回执仍PENDING；不凭推测放宽恢复状态。服务正常关闭PID52236/23锁释放。

14.368 EmbeddedCollection._set/initialize会更新有效文档但不清除历史invalidDocumentIds。v11仅在正常API回包完成、完整Actor等于预期、独立新建内存Item严格校验通过、缓存Item重新validate通过且其完整内容与预期一致后，删除该Item的过时invalid Set标记。这是客户端状态同步，sourceWrites0；未校验文档/内容有差异/缺少实例都保持失败和原标记，不是清标记绕过数据校验。每Item markerChecks记录独立校验/内容一致/是否清除旧标记，重登后仍须再次验证有效性。

下一轮先完整只读确认卡勒姆与奥黛塔已写结果，不再写二者；仅更新艾莉儿和贝伦席拉各2件，并对六件一起进行普通人物卡与重登验收。完整346测试PASS/0fail（37项相关）；新增fixture模拟真实核心“写入成功但旧Set未清”行为，验证仅有效且精确匹配的Item可清标记。v11构建64578字符，SHA256 `d1f7e1fe1111f0fbaa712e70a72fcb8b6671905838397dd21515b7935e8890d1`。当前两件引用已持久化，但六件整体验收仍未完成，雅灵待查。


## v11数据通过、收尾恢复与UI证据纠正

父任务已读取并核验 `library-relogin-v11.json`：四人物完整hash等于expected，六物品有效，物品总数分别32/51/36/47保持；27来源全部PASS，folder/inventory PASS，雅灵和旧样本完整hash UNCHANGED。数据修复及重新登录层为6/7 PASS，未进行升级/降级或能力使用。

执行器关服失败且超时，父任务重新正常登录，核DOM data-entry-id=iVGta3mQEvac49mo后通过UI删除本轮临时Macro，目录精确名称计数0；随后正常Settings→Return to Setup，APIinactive/23锁释放后停止PID43736。最终14:16:22核关闭，实际2555秒=42分35秒，超过30分钟755秒=12分35秒。此流程偏差明确保留，不以验收数据PASS掩盖。27永久来源/文件夹保留；证据 `parent-shutdown-v11.json` / `.png`。

执行器“各100条样本error0”不是全部错误消失。父任务另一次新GM登录捕获到原旧样本identifier错误1、雅灵引用错误1、Pixi栈溢出2；六个修复Item错误0。返回Setup另见语言回退及受保护模块签名错误，分列且不归入本轮修复完成。原始限定错误片段/分类在 `parent-relogin-errors-v11.json`；404和14缺包仍未解决。

**UI证据父审纠正**：血猎手和牧师前景Item sheet截图通过；海精灵只有人物Details图、前邪教徒命名截图实际也是人物Details、法师命名截图实际为贝伦席拉人物卡（其后是前邪教徒背景窗口），沃什塔克特工专图不存在。执行器关于“全部六个UI打开”的总结不足以覆盖这些证据问题，也将四个人物误写为六张人物卡。见 `parent-v11-evidence-review.json`。数据PASS保留；四个清晰Item窗口证据需补齐，不重跑数据写入、重登Macro或完整测试。v12只读UI批次仅补艾莉儿/贝伦席拉四件前景截图，10分钟开始关服，不能为补图越过时限。


## 最终收口

六件数据、引用、正常UI与重登全部通过；雅灵保留待查，原目标6/7。v12前三张补图父审通过，最后沃什塔克特工图仍不符，已由父任务完成精准UI核验并保存正确前景图。最终服务正常关闭、23锁释放、Macro已删除，所有永久来源与既有测试对象保留。最终逐件结果、证据白名单及时间/错误边界见[最终结果](../reviews/2026-09-29-server-next-player-item-repair-result.md)。
