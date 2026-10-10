# FVTT JSON Forge 0.5.1（固定效果与GM能力控制候选）

Forge GM 工作台与生物蓝图已整合为同一模块：GM 从生物或物品目录进入，在一个窗口中切换输入方式、生成预览、审核并确认创建。生物支持手工蓝图、标准资料与 AI 整理；物品保留标准资料与 AI 整理。连接配置独立共享，战斗包有明确的专用入口。

战斗包现有显式中文模式：后续生成的生物与能力名称采用“中文名 English Name”，中英文以空格分隔；已有受审中文包继续按包内记录的名称格式读取。描述和GM步骤只显示中文，英文来源在同一审核页按需展开。可在生成前选择卡片语言，或对已预览的英文包点击“翻译为中文并核对含义”。默认仍保留来源语言。中文候选通过数值、术语和独立含义审阅后才重走共享workflow；改名同步绑定原生能力与固定控制配置，保持全部规则身份和GM边界。操作、术语依据、失败恢复和CLI入口见[中文卡片说明](../../tools/forge-encounter/README.md#中文卡片与术语核对)，当前接受范围见[首期记录](../../docs/reviews/2026-10-07-forge-translation-terminology.md)。

点击“下载来源与审核记录”后，同窗显示当前候选的“下载审核文件”链接；浏览器未自动开始下载时可直接点击该链接。文件准备完成的提示不代表浏览器已经保存成功。更换来源、语言或包文件、重新生成／预览／翻译以及关闭窗口会撤销旧链接，避免误取上一个候选的审核记录。

本轮精确支持目标为 Foundry `14.364` 或 `14.368` / dnd5e `5.3.3` / `core` / icon off。只有当前 GM、当前来源和当前目标的正式 accepted 候选才能创建。0.5.1 是尚未远端发布的本地候选；统一组合的历史验收与剩余范围见[当前整合计划](../../docs/plans/2026-10-05-forge-unified-workbench.md)，旧版本的接受不自动推广。

2026-10-05已在Mirror `14.368 / 5.3.3`完成统一窗口、宽窄预览、蓝图草稿/派生/复用、标准Actor/Item创建回读、共享连接设置与战斗包新入口的本地验收。测试对象和审计宏已精确清理，原世界集合及视图保持。此次没有调用真实Provider，也没有重跑原生战斗或启动战斗包；这些范围不由本轮界面验收推广。

> English summary: A single GM workspace combines versioned creature blueprints, structured sources, reviewed AI Intake, readable artifact previews and explicit Actor/Item creation. Encounter import and startup remain separate reviewed actions. Exact runtime pairs are Foundry 14.364 or 14.368 with dnd5e 5.3.3.

## 安装

### Foundry Setup 安装

本次0.5.1候选尚未发布，先使用下一节的本地ZIP方式。下面的Setup链接只有在本增量正式发布后才能取得新功能；旧0.1.0发行包不包含战斗包入口。

在 Foundry 的 Setup 页面打开 **Add-on Modules → Install Module**，把下面的 manifest URL 粘贴到 **Manifest URL**：

```text
https://raw.githubusercontent.com/bill34345/fvttV12JsonGenerator/master/foundry-modules/fvtt-json-forge/src/module.json
```

安装后进入目标世界的 **Manage Modules**，启用 **FVTT JSON Forge**，再刷新世界。

### ZIP 手工安装

使用本次本地构建的 `foundry-modules/fvtt-json-forge/dist/release/fvtt-json-forge-0.5.1.zip` 和同目录 `SHA256SUMS.txt`，先核对 SHA-256；不假设尚未发布的GitHub Release已经存在。停止 Foundry 后，把 ZIP 解压为：

```text
<Foundry Data>/Data/modules/fvtt-json-forge/module.json
<Foundry Data>/Data/modules/fvtt-json-forge/scripts/index.js
...
```

ZIP 内是 module 根内容，不能再多套一层版本目录。不要覆盖身份不明的同名目录；升级前先确认旧目录确实是本模块。此仓库的运维规则不创建备份，失败时停止并核对目标。

## 目录入口与输入方式

在 Actor 目录点击 **Forge 生物**，在 Item 目录点击 **Forge 物品**。同一目录重复打开会聚焦已有窗口。模块设置只保留 **Forge · AI 连接**；不在设置中执行日常生成。

工作台右上角的 **图解手册** 打开模块内置的只读手册，可离线阅读并下载 PDF、原始 MD 和已审战斗包。十页手册前六步以 Grandmother Sea Hag 为例，用原 PDF 页、实拍界面与红框说明入口、中文选择、核对、导入与试用；后四步用两只练习怪物演示通用命中状态、再次豁免和解除。海鬼婆与练习示例分别提供原文和已审包。打开手册保留当前模式和草稿，不创建世界文档。已有中文战斗包只需预览并由 GM 核对导入；重新生成时须明确选择“中文正文 · 名称保留英文”。

- **手工蓝图（生物）**：左侧加载或新建蓝图，中间填写基础数据、六属性及攻击/豁免组件，右侧持续展示草稿预览。按“生成并验证”产生正式候选后，再确认创建。预览为 2024 资料块顺序，未知的先攻、豁免总值、XP/PB 不猜填；最终派生数值以原生角色卡为准。
- **标准资料**：粘贴规范来源，或读取 Markdown/TXT；编辑文本后生成和核对正式预览，无需 AI。
- **AI 整理**：在独立连接设置中完成配置和连接测试，再粘贴/读取原始资料，按“分析资料→生成并审核→确认创建”推进。Actor 仍保留无需 AI 的纯文本审阅子模式。

三种输入方式保留各自草稿，不把复杂来源自动转换成简化蓝图。切换后旧候选失效，需要重新生成或审核；切换模式不写入世界。创建进入提交/回读区间时锁住导航和关闭，结束后显示完成结果并可直接打开卡片。

蓝图库保存在当前浏览器、世界与 GM scope 下。保存/重开仅恢复可编辑来源，不恢复旧 accepted response。派生变体使用新 sourceId，并记录父来源 hash 及字段差异，创建新 Actor 而不覆盖父角色。蓝图仅支持当前有界攻击与豁免组件，最多八个；不承诺完整施法、传奇、巢穴或自动 CR 平衡。

旧公开 `openForgeActor`、`openForgeItem`、`openForgeIntake` 仍可调用，分别进入同一工作台的标准生物、标准物品和 AI 整理视图。标准资料、蓝图仍走来源→workflow→parser/generation→verifier，不能手改最终 JSON 绕过验证。

原单Actor/Item入口遇到`needs_review`、`failed`、`rejected`、多candidate、多artifact、过期snapshot、权限或版本变化时保持零世界写入。战斗包使用独立审核路径：只有明确的GM辅助、外部规则或文字保留行为具有唯一绑定宏，才能进入包级GM确认；未知错误仍拒绝。模块没有“忽略并继续”按钮，也不会把历史review bundle当成可创建response。

## Provider 与凭据

预览已有战斗包不调用 Provider。人类 MD 入口由 AI 提取生物与固定能力配置，工具生成控制入口；AI 不编写宏代码。本地 Intake 默认使用 DS API 的 deepseek-flash（DeepSeek V4.1 Flash），提取与审核均使用同一模型，默认低推理档；非本地连接继续保留用户明确选择。

AI 模式必须先选择 Provider、协议和精确 model ID，并完成当前连接/结构化输出测试。界面提供 OpenAI、Anthropic、Gemini、DeepSeek、xAI、Mistral、OpenRouter、Qwen、Kimi、GLM 与 Custom presets；preset 只代表连接配置，不代表每个 provider/model 都有同等语义验收。

当前人类 MD 样例已由 deepseek-flash 完成提取、规则选择与独立审核，生成两 Actor 和固定控制入口。来源与静态审核通过不代表场景运行通过；实际本地验收另行记录。其他组合需单独验证。

固定齐射的恍惚使用 Foundry 原生状态身份，避免状态同步模块把同一效果再补成第二份。已有其他来源的启用状态不由本控制器接管或提前结束；本控制器创建的状态按记录的目标回合到期处理。此兼容修复的实际 Chrome 复验尚未完成。

Actor 蓝图保留来源固定 HP 和生命骰公式；场上未链接 NPC Token 是否重掷 HP 遵从 dnd5e 世界设置，固定控制器不覆盖该设置。

API Key 默认只存在当前页面内存。只有显式勾选持久化时才会写入当前浏览器的 local storage；它不会进入世界 Document、Chat、review bundle、Collection/ZIP、日志或 Forge response。浏览器存储不是加密保险箱；推荐保持持久化关闭，并在结束后使用清除 Key 操作。

## Review、Library 与恢复

- **Review Bundle**：导入后只显示严格解码的历史记录。历史 `accepted` 仍不可直接创建；“以当前来源开启新 attempt”会生成新的 identity、snapshot、calls 和 review。
- **Managed Source Library**：来源与安全 review 保存在当前浏览器、当前 `worldId:userId` scope 的 IndexedDB。它不写世界 settings/flags，不自动 Analyze，也不保存完整 artifact/response。
- **Portable export/import**：Library、Collection、标准 ZIP 和 Queue 都有 strict decoder、identity/hash/size/path/CRC 门禁；导出不含 Key、完整 endpoint、provider raw payload 或世界数据。

## Collection 与 Batch Queue

Forge Intake 可以导入 mixed Actor/Item Collection JSON 或标准 ZIP。每项拥有独立 source、kind/mode、identity、attempt、status 和 review；输入顺序保留，单项失败不会让其他项升级为 accepted。

Runner 固定 concurrency `1`，只有 GM 显式点击才运行。刷新或关闭页面时，`running` / `applying` 项变为 `interrupted`，不会自动重发可能计费的 Provider 请求。跨会话恢复的历史 accepted review 不含完整 response，必须显式 fresh run 后才能重新进入 apply manifest。

批量 Apply 只接受当前页面仍持有完整 accepted response 的项目。确认框会列出 immutable manifest、Document ID、source/artifact hash 和 target；Actor 与 Item 继续走各自 adapter。多 Document 操作不是原子事务，部分成功/失败会逐项报告，不会伪装为全成功或回滚已完成的其他 Document。

## 明确限制

### 角色、召唤物与配套宏整包导入

在 **Forge 生物 → 战斗包** 打开专用入口：

1. 选择`fvtt-json-forge-encounter` v1 JSON，或仅包含`encounter.json`的标准ZIP。此前普通龙兽交付ZIP、Review Bundle和Batch Collection不是这个格式。
2. 点击“预览战斗包”。模块在当前浏览器通过正式workflow重新生成每个Actor，显示基础属性、来源、生成数据、宏代码、图片绑定和具体GM操作规则。这个步骤不会调用AI、创建文档或运行宏。
3. 核对内容后勾选确认，再点击“一起导入角色与宏”。相同且未改变的文档会复用；同一包身份的不同内容、已有文档改变或ID冲突会阻止覆盖。
4. 导入后在“已导入的战斗控制”里查看宏，点击“启动战斗控制”。固定配置首次启用后会在刷新时重验并恢复；控制面板“停用自动化”会持久停用，关闭面板不等于停用。旧式专用宏仍需手动重新启动。

Macro创建与执行是两个动作。脚本仍在GM客户端权限下运行；导入包不能自行宣称代码可信。启动前重新核对命令hash、绑定Actor的身份与其应有的机制标记；被替换、删掉机制或代码改变的内容需要重新审阅。不要修改hash或flags来绕过检查。

0.5.1候选增加有界“豁免失败状态与期限”：原生Blinded到来源下回合开始、CC Slowed到目标下回合结束、原生Paralyzed到来源下回合结束或实际受伤，以及失败差值至少5时成组施加CC Enfeebled／Clumsy到恢复任意HP。Slowed与后者需要启用Custom Conditions；不是任意状态或任意期限解析器。GM选择合法目标，范围Save Activity一次使用后逐目标结算。未通过豁免与伤害真实结算验收之前，不把候选代码或静态绑定称为实机通过。

来源明确的Eyestalks使用“眼梗能力控制”：先在战斗控制浮窗选择场上来源Token，再选择能力；GM确认Bloodied与重击后点击“禁用”，使用前守卫阻止对应原生Activity。“明确恢复”需要GM主动操作。来源证明的列表支持1至20项；“全部能力与状态”可在同一页展开。非链接Token各自保存状态，链接Token共享世界Actor状态。来源没有恢复规则，不随治疗、长休或Purge恢复；模块不自动识别重击。Magic Resistance、Purge下一次攻击窗口与Abyssal Mirage仍需GM按原文操作，不能以本批状态期限能力代替。

同一来源下的“GM裁定”选择绑定Item后点击“查看规则”，只打开原生Item说明。没有场景来源Token时可以查看绑定世界Actor的规则，不能更改能力可用性。长来源名会完整换行显示，重名Token另以ID区分；禁用／恢复后浮窗保留当前选择，错误就地显示。窗口底部只保留“停用自动化”和“关闭”，默认按钮设为关闭，聚焦关闭按钮后可用回车触发。

说明性特性遵从目标版本官方dnd5e的处理范围。精确5.3.3官方2014／2024的Multiattack仅提供utility Activity，Magic Resistance仅保留说明，两者没有执行效果；本工具同样保留原文和正常操作，不额外自动判定攻击组合或魔法来源，也不把没有自动效果当作生成失败。Purge、Mirage等复杂裁定默认保留原生活动／资源与GM步骤，只有官方同类执行能力或用户另行明确要求才扩展自动化。来源保真、活动／资源和导入仍须核对；已经实现的状态效果继续按真实施加、解除与生命周期验收。

2026-10-06已用Better Monsters的Eye of the Deep来源，在Mirror14.368／5.3.3的原模组组合中验证Gaze范围独立豁免、Glacial减速与目标期限、Paroxysm来源期限及实际受伤解除，以及Rend差值至少5、力量／敏捷检定／豁免／攻击劣势、两来源成组与任意1HP恢复解除。Rend带效果重载后的首次治疗也通过。CC攻击适配绑定0.2.0候选与AC5e14.533.8；实际优势抵消案例同时含可见性来源，不宣称隔离的可见性验收。

真实GM面板已验证单Token单光线禁用、原生调用零结算、重载保留、满HP不自动恢复及明确恢复后重新使用。停用自动化停止后续处理，已有状态与禁用保留；重载不会自动启用已停用的控制器，禁用光线仍被拦截。需要继续自动结算时，从原战斗控制入口重新启动。测试中的Bloodied与重击骰是GM辅助前置，未把全掩护下的骰式称为实际命中／自动重击检测。玩家权限、远端伤害及最后世界恢复另按独立接受记录判断。

同批真实SY玩家与GM双客户端已验证：非OWNER伤害更新及玩家启停控制器被拒绝；获得OWNER后的两次原生伤害均由GM清理对应麻痹组，第二次只传变化字段仍有效；临时HP吸收及零HP正伤害也能解除麻痹。零HP分支保留原生bloodied／dead，不等同于健康目标。玩家原生调用被禁用光线时，资源、HP、效果与消息保持。外来原生状态保留、多来源麻痹的显式回合边界、GM停用效果与手动删除后的重载也已有范围证据；queued新旧竞争、链接Token、长休／Purge和全部19状态组合未在本批逐项实机验证。

本批测试对象、控制／玩家／审计宏和116个测试消息／通知已精确清理，最后审计宏删除后独立读回九类集合：原成员、设置和视图恢复；一个旧战斗的修改时间在原生恢复路径中变化，已保留并记录，未伪造stats。原服务常驻且禁止备份。样本、原始失败与范围证据见[特殊机制接受记录](../../docs/reviews/2026-10-06-forge-special-mechanics-routing.md)，不推广为生产或全部规则组合接受。

明确的GM辅助/外部规则只在新整包路径中进入显式审核，且必须各自关联一份有正确Actor绑定的宏。原有单Actor/Item accepted-only路径不变；失败来源、未知诊断或缺失覆盖不能借宏包绕过。

多文档导入不保证跨浏览器原子事务。普通失败清理本次新建文档并检查结果；无法清理时列出准确UUID。既有文档不会被覆盖。已上传的内容寻址图片可能保留供重试，图片不同则拒绝覆盖。已在游戏中改变过的角色再次导入可能报告冲突，这是避免覆盖当前状态的预期行为。

样本制作：在仓库运行`bun run tools/forge-encounter/build-example.ts`，产生`crystalbleed.forge-encounter.json`和`crystalbleed.forge-encounter.zip`。包携带来源和绑定宏；Actor JSON由接收端正式生成。样本宏使用`forgeEncounter.actors.dragon`与`forgeEncounter.actors.crystal`，不会按同名任意选择世界角色。

晶血样本的专用宏 2.1.2 读取正式生成的恍惚效果和自定义条件标记，并保留目标下一个回合结束的期限。启用 Custom Conditions 时应用其独立恍惚状态，并遵守既有恍惚免疫；未启用时以具名效果表示，行动选择仍由 GM 裁定。样本需要单独启动，刷新后重新启动；其修复版本须按具体候选完成导入、绑定和效果结算验收。

人类 MD 路径支持 1 至 6 种生物、最多 24000 字符。AI 提取并审核生物数据，再选择已实现的固定能力、参数或来源完整的GM裁定；工具校验并编译控制入口，AI 不写 JavaScript。明确启用的固定配置会在刷新时重验身份后恢复，停用按钮持久生效。GM裁定只提供绑定原生Item的规则查看入口，不自动施加状态或消耗资源；攻击、豁免和伤害仍用原生活动。阶段或条件标记必须完整关联唯一控制入口；单Actor普通导入门禁不放宽。完整步骤见[原始MD战斗包指南](../../tools/forge-encounter/README.md)。

本次未发布0.5.1候选的后续迭代允许GM禁用／明确恢复来源证明的1至20个Save Item，包括连续编号的十条眼射线；只按名称找到世界物品不构成来源证明。Bloodied、实际重击、选择及恢复仍由GM确认。CR13 Beholder Eye Tyrant的真实AI来源审阅、能力选择及整包独立审阅已通过，配置为一项麻痹自动化、十射线控制及14项GM裁定；实机结果与精确候选哈希在[第二来源记录](../../docs/reviews/2026-10-07-beholder-eye-tyrant-reuse-test.md)另行记录。不同源码哈希的0.5.1候选不共用运行通过结论。

该CR13来源已完成本批Mirror14.368／5.3.3限定接受：原生训练豁免及十项DC16、麻痹期限／受伤解除、单来源禁用／重载保留／明确恢复，以及新版单来源面板展开和窄窗均有证据。Petrification／Charm／Eye Rays及第二来源的原生Item查看实测没有状态／HP／资源／消息副作用；复杂规则仍由GM按原文处理，120ft与可见性也由GM核对。长GM步骤在原生活动配置的单行字段中完整保留，本轮未重做其编辑器。

本批自有测试对象和有直接归属的消息已清理，最后Audit删除后独立读回完整九集合。五条旧回合提示缺直接Combat归属而保留；一个原Combat的native修改时间变化，完整内容／active已恢复。采集的设置和原视图保持，服务常驻，无备份或生产操作；详情见上述第二来源记录。

前后条件分支使用仅限Encounter的明确GM/配套宏机制：不同时应用互斥的原生效果，完整来源留在能力说明中。该角色的单独状态保持needs_review，必须由来源审阅接受其保留方式，并由正确绑定的唯一宏承担该机制，才可进入包级确认；其他文字或未知机制仍被拒绝。

### 战斗包任务恢复与规则审核

战斗包任务在当前浏览器按世界和 GM 保存来源、显示名称、卡片语言及可复用草稿。请求失败、取消或刷新后，重新打开“Forge 生物 → 战斗包”查看恢复提示；由 GM 显式继续。恢复不会自动联网、导入或启用控制器，API Key 仍默认只在当前页面内存中，刷新后需要重新输入。浏览器存储不可用或被清除时不能保证恢复；审核记录下载仍用于保留来源与诊断。

有 IR 草稿时使用“继续任务”，有已生成候选时使用“重新预览保存的候选”。尚未生成的输入也会保存。需要丢弃时点击“清除本地战斗包任务”，只清当前世界与 GM 的这份记录；不会清来源库、队列或连接设置。两个窗口同时操作时，旧窗口不能覆盖新进度；出现冲突提示后关闭旧窗口、重新打开当前任务，不反复保存旧页。

审核记录和已准备的战斗包可显式查看、复制完整 JSON。浏览器没有开始下载时，可在只读文本区核对内容并保存为对应 JSON 文件；剪贴板不可用时仍可选择文本手动复制。审核记录与原下载使用同一序列化，战斗包 JSON 是现有正式导入格式；复制只保存工具结果，不手改最终 Actor 数据。换源、重新生成或清除会撤销旧文本；查看和复制不请求 AI、不创建文档或执行宏。

续跑复用同一来源的 IR 提案，重新校验并独立审核，不继承历史 accepted 状态。来源、目标版本或组合状态目录变化时，按界面提示重新生成；不要修改报告、指纹或最终 JSON 来强行续接。关闭窗口会取消当前请求并保留已收到的有效草稿；尚未收到完整结果的阶段仍需重做。界面显示当前生物、实际阶段及重试范围，不承诺取消后供应商已经停止计算。

直接生成中文时若翻译或含义审核失败，已通过审核的原语言候选保留并明确标注；可继续翻译，但不能把原语言包当作中文完成。恢复后的包仍须重新正式预览并由 GM 确认导入，首次启用仍是另一个明确动作。

继续翻译只修正与同一来源绑定且未通过的段落，有效候选仍参与完整独立复核；确定性数字／术语错误会保留到审核记录。不要手改候选或最终 Actor JSON 来凑通过。中文候选的卡片 GM 步骤复用同包已批准译文；未找到对应译文时明确标注来源语言，原句与逐项证据始终保留原文。

审核页按能力对照原文、解析参数和自动／GM 处理范围。命中状态列出施加、期限、再次豁免、时机、可选性及成功解除的来源证据；GM 规则保留完整原文和额外限定。旧包或仅上传 ZIP 缺少逐项证据时明确显示缺失，不能把参数摘要当作来源证明。完整来源、JSON 与控制配置仍可展开核对。

本阶段实现和限定实测记录见[恢复与审核执行记录](../../docs/plans/2026-10-10-forge-encounter-recovery.md)。

### 其他边界

- 只支持精确 Foundry `14.364` 或 `14.368` / dnd5e `5.3.3` / `core`；manifest 中间区间不代表其他 Core 配对可用。
- 只允许 GM；不是玩家 JSON 导入工具。
- 不是任意文本、任意模型、任意 Actor/Item 都能 accepted 的保证。
- 不支持 OCR/PDF/图片 Intake、update/overwrite、按名称合并、embedded Item 产品入口或跨 Document 原子事务。
- 页面关闭后不会继续 AI/HTTP。真正后台执行需要另行设计 Companion/Gateway、认证与 Key custody。
- 本地 Lab PASS 不代表生产、任意模块组合或四小时真实桌面会话 PASS。

当前分层证据见 [support matrix](../../docs/acceptance/current-support-matrix.md)，A–E 实施与边界见 [产品计划](../../docs/plan/2026-08-21-forge-fvtt-module-product-execution-plan.md)、[Task D](../../docs/plan/2026-08-24-forge-fvtt-intake-task-d-plan.md) 与 [Task E](../../docs/plan/2026-08-30-forge-fvtt-task-e-plan.md)。

## 维护者构建

```powershell
bun install --frozen-lockfile
bun run test:fvtt-json-forge
bun run test:reviewed-localization
bun run release:fvtt-json-forge
bun run verify-release:fvtt-json-forge
```

发行输出位于 `foundry-modules/fvtt-json-forge/dist/release/`：

- `fvtt-json-forge-0.5.1.zip`
- `fvtt-json-forge-module.json`
- `SHA256SUMS.txt`

构建器固定 ZIP 排序与时间戳；两次 fresh build 必须产生相同 ZIP SHA-256，并验证 archive、独立 manifest、package version 和下载 URL 一致。


## 历史验收与通用性边界（2026-09-15）

人类 MD 是可复用的输入模板，生物名称不决定执行分支。自动化使用已实现的固定能力库；其具体形态、模板和操作顺序见[战斗包指南](../../tools/forge-encounter/README.md#人类-md-模板与当前能力范围)。任意新机制不能仅凭填写模板获得自动化支持。

本地专项已验证守护真实伤害阈值、混合伤害合计、临时 HP，以及原生拒绝次数耗尽后的削弱。重复腐化证据保留 PARTIAL，用户决定待独立状态设计后再处理；不宣称每次失败增加一级已严格实测。Dazed修复专项与FVTT页面完整AI生成链尚未复验。当前可提交并合并的0.3.0候选未发布远端，合并不代表生产部署。

## 通用命中状态与再次豁免

本地候选使用同一条参数规则处理 dnd5e5.3.3 的全部14种普通原生状况：目盲 Blinded、魅惑 Charmed、耳聋 Deafened、恐慌 Frightened、受擒 Grappled、失能 Incapacitated、隐形 Invisible、麻痹 Paralyzed、石化 Petrified、中毒 Poisoned、倒地 Prone、束缚 Restrained、震慑 Stunned、昏迷 Unconscious。攻击确认命中后施加原文状态，持续指定分钟或轮数，目标每回合结束时再次豁免，成功只解除该来源效果。状态、属性、DC、时长以及“可以/必须豁免”从完整来源核对，不按怪物名称猜测；状态名称、识别及预览来自同一目录。

来源可以使用含义明确的中英文同义表达、不同语序和中文/英文数字，不要求整句套固定模板。AI先整理成上述已支持规则，工具再核对原文引用、状态和数值，独立审核核对施加对象、时机、可以/必须、成功解除及完整原文中的限制。预览仍须由GM核对。含糊的指代、缺失的参数、否定或额外环境/解除分支不会因为“意思接近”而自动套用；应保留原文交GM处理。既有已审包继续读取，新包的来源审核记录包含逐项原文依据。此增量的实测状态见[同义句验收记录](../../docs/plans/2026-10-10-forge-lifecycle-language.md)。

全部14种状况的正式来源编译、投影、执行器及主控制器已获聚焦回归；具体实机样例与候选脚本身份以[执行记录](../../docs/plans/2026-10-09-forge-generic-status-lifecycle.md)为准，不将目录覆盖算作逐项实机接受。既有 Mirror14.368/dnd5e5.3.3 双样例已通过真实浏览器 AI/中文审核、导入回读、Midi14.0.11 命中/未命中、跳过/取消/失败/成功、重载及恐慌两轮到期。分钟到期由世界时间测试覆盖，验收没有推进含既有效果的世界时钟。

1. 在“战斗包”读取完整原文，生成并审核。原文应明确命中后效果、持续时间、每回合末的豁免属性/DC与成功解除；缺失参数时先核来源，不能凭空补值。
2. 预览应出现“命中状态与再次豁免”，并用中文列出状态、期限和豁免参数。核对后导入，再明确启动战斗控制；仅导入不会执行规则。
3. 由当前活动 GM 使用场景中唯一的来源 Token，先标记一个目标，再正常点击原生攻击。模块核对该次消息和 AC 快照，只有命中才施加状态；未命中、取消、免疫不施加。没有明确目标时仍正常攻击，提示 GM 手动处理状态。
4. 目标回合结束后，根据来源选择是否进行再次豁免。可选豁免能跳过；确认后打开原生掷骰窗口，关闭或豁免失败时保持状态，成功时只清理本来源。不同来源独立计时；同一来源再次命中会刷新该来源期限。
5. 分钟读取 Foundry 世界时间，不是现实钟表。轮数在原战斗内按起始轮/回合位置到期；原战斗结束或删除后按保存的世界时间期限处理。停用控制器会停止自动处理，已有状态需 GM 处理或重新启用控制器。

Forge 的原生状态显示效果名称带有 `Forge`，便于在角色卡“效果”页识别。外部法术已有同名状态时，保留它的效果与期限，Forge独立保存自己的显示效果和来源声明；外部状态到期不会提前清除本来源。自动豁免和到期按来源解除；GM手工移除Forge显示效果会清除对应的Forge声明，原生HUD可能先处理外部状态。

系统附带的状况按原生工厂保留。例如昏迷、震慑、石化、麻痹的失能来自主效果；昏迷产生的倒地是系统独立后果，解除昏迷不会自动站起。Forge 的定时倒地使用独立文档身份，不能占用或误删该系统后果。力竭的层数、HUD伪状态和未配置的自定义状态需要各自准确的定义/参数，不把它们当作相似的开关状况。来源对象、视线、挣脱动作等额外机制也须符合已实现能力，否则完整保留GM步骤。

## 配置新状态并连接怪物能力

启用配套 Custom Conditions 后，战斗包页显示“可连接的自定义状态”。点击“配置自定义状态”，新建一项，填写“中文 English”显示名称、说明和怪物原文中的准确中英文名称。选择已有机制并填写参数：可以组合19种已有自定义规则、14种普通原生状态，以及固定尺数的移动减速；无需写JSON、宏或效果字段。保存后回到Forge点击“刷新状态目录”。

例如配置“霜蚀 Frostbite”，原文名称分别填“霜蚀”和“Frostbite”，机制选移动速度降低10尺与笨拙。再读取怪物MD/TXT，原文写明命中后陷入Frostbite、持续1分钟、目标回合末可进行DC10体质豁免、成功解除。点击“AI生成并审核战斗包”，核对预览中的状态名称、组合机制、时长和豁免参数，再确认导入、启动战斗控制，并正常标记目标和攻击。

状态目录保存在当前世界。Forge按稳定ID与受审定义快照连接能力；名称/别名重复或与内置状态冲突时拒绝保存。未注册名称、缺少来源参数和未支持的额外限定仍显示审阅/GM边界。定义被编辑或删除后，已有生效实例继续按原快照计时、再次豁免和解除；新施加需要重新生成并审核，不能把旧能力自动换成新含义。不同来源分别保存，解除仅清对应实例。手工在角色效果页停用或删除组合主效果，会同步处理其子效果并停止该来源的自动生命周期。

新名称、已支持机制的组合及参数变化无需每状态修改Mod代码；完全新的执行机制仍需补一次可复用实现。目录扩展、单测和精确版本实机分别记录，见[本轮进度](../../docs/plans/2026-10-10-forge-configured-conditions.md)。未知系统/模块版本、层数机制和任意脚本不因这项功能获得支持。

启用DAE14.0.12时，系统可能为状态增加额外的原生显示项；不能按效果行数判断有几个独立来源。候选会在原生独立后果确实发生时保留它，普通定时倒地仍按自身期限/豁免解除。目标只免疫倒地时，不因此撤销昏迷。需要这种联动适配但DAE版本或效果来源无法确认时，提示GM核对，保留外部效果。具体源码、回归和实机层级见[兼容记录](../../docs/reviews/2026-10-09-forge-midi-status-hit-bridge.md)。

此规则需要兼容的 Trigger Engine。当前自动命中路径限定活动 GM 的原生单目标攻击；玩家客户端攻击、多个标记目标、额外环境限定、受伤提前结束、多属性择一豁免等不在这条规则内，保留完整 GM 操作说明。普通原生攻击/伤害继续由 dnd5e 处理，AI只选择数据配置，工具生成固定入口宏。原生状态由 dnd5e 提供，本条无需新增全局自定义状态。

启用 Midi-QOL 时，候选接入精确 `14.0.11` 的已确认命中事件，并核对持久聊天卡，避免漏掉同卡攻击或重复施加。其他版本、未确认命中或其他机制替换了攻击骰时，特殊状态需 GM 核对。该桥接的[接口与接受记录](../../docs/reviews/2026-10-09-forge-midi-status-hit-bridge.md)保留首次真实失败及后续复验边界。

可使用[两只新怪物的完整练习原文](../../tests/fixtures/encounter-status-lifecycle.md)核对同一规则的目盲/恐慌、CON/WIS、DC15/13和分钟/轮变体；这是功能测试资料。
