# Forge 分步核验与完整 GM 手动能力

开始于 2026-10-13，继续至 2026-10-14。**当前继续修复 V5，整体 PARTIAL**；保存失败输入离线正式链已通过12例123个完整能力，正在补完整中文和新候选验收。已冻结 V4 的历史结果保留：保存失败输入正式链10例93能力，独立 SRD 巨型野猪首次完整中文和原生持久化通过，保存 Senmurv Maverick 的8个手动能力中文导入和持久化有效。V5不把这些证据冒充新候选全部验收。

历史六例完整验收 **0/6 原判不变**。V1 三个新怪物首次 0/3、V2 Kamadan 首次失败、V3 Senmurv Maverick 首次失败及 V4 Skymaster 首次失败均保留；保存回复回放和 SRD 对照不改写它们。正式验收对象为 Mirror Core 14.368 / dnd5e 5.3.3 / core，付费 AI 审核始终关闭，无提交、合并、推送。

## 实现范围

Forge 战斗包工厂启用程序持有来源单元的分步提取：基础字段独立核对后，才逐项处理完整能力。V2 基础模型仅返回八组事实，程序核实后建立来源证据；每个能力由程序持有全文，窄语法原生攻击或完整 GM 手动能力均不再调用提取模型。完整复杂能力可生成明确 GM 手动 Item，Item 与 Utility 说明保留全文；不生成自动伤害、豁免、效果、移动或资源消费。来源中的次数／恢复字段在可核实语法下保留计数，资源由 GM 操作。编号子能力保留其公共目标及选择上下文。基础头、外貌、尺寸附注、共享前言和引用定义进入可翻译简介；显示比精简介绍冗长。

已支持且来源无歧义的单段普通 Weapon／Spell Attack 才建立原生执行字段。通用 2024 Attack Roll、复杂条件及未知能力保留完整手动，不猜攻击分类。CLI／Item／Species 旧 provider 默认路径不变。

来源缺失、伪造证据、跨能力吞并、错误基础事实、未知基础枚举、手动项混入执行字段继续阻断。静态条件抗性尚无手动静态特质投影；Charon 原文的 `Attacks made without Advantage` 与 `Colossal` 仍是已知未支持边界，不计成功。

## 保存输入与独立复核

初步六例 54 个能力走通结构链后，独立审查发现基础静态事实核对不足，以及无 Traits 标题的普通特质被放进简介的两项 P1；不能把初步链通当作完整基础核验。两项已补来源独立对照与反例，名称子串身份残余也已修复。后续真实保存输入复核与最终门禁记录在本节续写。

源文、旧失败回复、原始六例收据不覆盖。付费 AI 审核保持关闭，不提交、不合并、不推送，不修改 master。新模型调用、中文草稿、GM 批准和原生导入刷新分别报告。

实施计划：[分步实施计划](../plans/2026-10-13-forge-staged-manual-implementation.md)。本地证据根 `.local/forge-staged-manual-20261013/`；基线 450 文件 SHA 清单保存于 `baseline.json`。

## V1 冻结与首次失败

V1 最终保存输入回归为五例 42 能力通过，Charon 明确拒绝；10 个正式来源／Actor verify 命令退出 0。Bun 1.3.14 下分步／手动 70、generation 287、encounter 541、raw contracts 76、facts 41、localization 44 和 coverage 17 个测试通过。Forge 模块早期整批 574 通过；随后 UI 调整后整批 565 通过、9 个下载测试失败，修复后相关下载组 13 通过；不能把分开复验写成一次最终 574 全通过。

V1 冻结清单 SHA-256 为 `9714786e04dfa05c750b33cda5e69fbceead059e9821bc3070a1d8487455071e`，ZIP 为 `0f683cb16cd881cbdd4aeceaee21e7669e3f8cb0d947d44a7e984fd9f2003319`。本轮收尾核对发现先前报告把 SHA256SUMS.txt 的哈希 `4e78847a45c6595ad026f0cb6bfa481458467781e5aa60470de048aeb8deabac` 误写成 ZIP 哈希，已据原冻结清单更正；发行原件实际无漂移。后续 V2 开工前已将该发行原件移至 `historical-artifacts/frozen-v1-release/`，不覆写冻结收据。

预先固定三份已知 PDF 第 3 页，核对截图及原始提取后提交一次。它们是已知 PDF 内的新怪物，不能算未见 PDF 泛化。首次真实业务结果如下，未重试改写：

| 怪物 | HTTP 请求 | 首次阻断 | 完整中文／原生导入 |
|---|---:|---|---|
| Mezzoloth Rune-Veteran | 8 | Spelljack 的 `Bonus Action` 不等于接口要求的 `bonus` | 未完成／未执行 |
| Baernaloth Ur-Fiend | 9 | Doom Spiral 的 `4-6` 不等于接口要求的 `[4,6]` | 未完成／未执行 |
| Ultroloth Enigmatist | 1 | 基础阶段将非连续 MOD/SAVE 行拼成引文；Telepathy 列表表示错误 | 未完成／未执行 |

三个首次业务样本为 **0/3**；18 次 HTTP 都为 200，付费 AI 审核 0。全部原始 provider 回复、阶段记录、结果和收据保存在 `fresh-v2/`。另有第一次 runner 展开类实例丢方法导致的 **零 HTTP／零模型**失败，原件在 `fresh/`；只修工具后才开始上述真实业务首次生成，不能算模型重试或生成通过。

## V2 离线证据与冻结前修复

V2 不再让模型填写 source／claims／coverage／能力正文或逐能力的格式值。基础模型返回八组事实，白名单形状检查与独立来源核验通过后，程序建立精确证据。能力沿完整来源单元处理，只有已支持的窄普通攻击语法才原生；其他保留完整 GM 手动 Item。程序阶段的输入／输出哈希与模型请求分开记账。

`v2-offline-r1/` 回放旧六例与 V1 三例的保存基础事实，经过当前 source 能力路径、正式 Actor、package、保存读回和完整中文请求。原八组事实只作来源绑定的离线投影，不补造模型回答、不重新调用 API：

| 输入 | 完整能力 | 离线正式链 |
|---|---:|---|
| Sea Hag Auntie | 12 | 通过 |
| Gazer | 3 | 通过，四种光线完整留在 Eye Rays 母能力内 |
| Mezzoloth Sellblade | 7 | 通过 |
| Baernaloth Keeper | 11 | 通过 |
| Ultroloth Mesmer | 9 | 通过，使用同来源更早保存 IR，未伪造最新失败的提取结果 |
| Mezzoloth Rune-Veteran | 11 | 离线通过，首次真实失败仍保留 |
| Baernaloth Ur-Fiend | 13 | 离线通过，首次真实失败仍保留 |
| Ultroloth Enigmatist | 13 | 离线通过，首次真实失败仍保留 |
| Charon | — | 条件静态抗性安全拒绝，Colossal 映射仍未支持 |

合计八例 **79 个完整能力**进入上述链，16 个正式 `verify:intake`／`verify:actor` 命令退出 0，网络／审核 0。历史完整中文仍为 `NOT_EXECUTED`，不把翻译请求当成中文完成。

V2 初步分步／手动测试 95 通过，真实 Forge 工厂最小 fake HTTP 链与 raw contracts 77 通过，packages 类型检查通过，局部 anti-overfit 三源码通过。独立审查在冻结前发现重复 Speed／HP 骰式／Size 声明冲突及条件 AC 被省略注释后放过的两类缺口；随后已补所有明确声明的冲突检查及正反例，再冻结 V2。另补明确标注合成数据的中文批准、正式重生成与读回测试，避免只有请求层证据。

## 当前本地运行与保护

原 Mirror 进程已不存在时恢复同一 `server-mirror`，当前 PID 36592，监听 `127.0.0.1:30001`；没有停止其他进程、改 Config/options、修改生产或创建另一套 Lab。Core 14.368 / dnd5e 5.3.3 / `cor-cotn` 的磁盘、HTTP 及浏览器身份均已核实。

官方 Chrome 的 evaluate 仅用于 DOM 只读，正常安装的临时 GM UI 暴露来源绑定的正式审核与只读回读；未注入页面脚本或使用原始 CDP。manifest 保持，业务 JS 前缀逐字节匹配，入口仅追加固定临时 helper import；单独记录 overlay 哈希，不能声称安装的整个 index 与发行原件相同。原世界基线为 Actor 287、Macro 94、Scene 65、Combat 10；用户原标签与其他任务标签保留。后续执行器、标签恢复、通道偏差和精确清理另见下文，原基线不改写。

开工基线中的 291 个旧本地证据文件已逐个 SHA-256 核对保持。曾在本轮早期模块测试构建时覆盖旧发行 ZIP；已从仍匹配旧冻结清单的安装文件精确重建旧 SHA，明确标为重建件，原失败来源／回复／收据均未改。证据为 `historical-artifact-reconstruction.json`，不将重建件冒充未覆盖原件。

V2 新来源曾预先固定同三份 PDF 第 4 页，冻结前不读取页文，不换页挑通过；实际三页均为署名／推广页，记 `SOURCE_SELECTION_NOT_ELIGIBLE`、模型 0，不计生成 0/3。原件和来源准备失败收据 `v2-page-selection-eligibility-failure.json` 保留。

## V3、V4 修复及保存输入回归

V2 后固定作者公开 Kamadan PDF 的第一只怪物，首次只调用一次基础模型、HTTP 200，印刷 en dash 负号未被识别而阻断 `/creature/saves`。V3 只在数值字段比较中接受 ASCII `-`、数学负号 `−`、en dash `–`，不改源文、哈希、引用坐标或错正负值拒绝。保存该回复离线回放通过，没有重提取改写首次结果。

V3 固定新 PDF 的 Senmurv Maverick 首次一次基础调用后拒绝：手动正文经旧公式格式化删除 `+`，而叙事还被当作普通 Markdown 再推断出额外 Lore Items。V4 修复这两个责任边界：

- 手动 Item、Utility 和显式来源简介采用转义后的 literal HTML，保留原始换行、正负号、括号和源文中的字面 HTML；真实标签先剥离再单次解码，防止把源文字面标签误当格式。
- Intake 生成的 YAML 带严格内部标记 `intake-biography-mode: literal-v1`；只有这个明确模式禁止把完整来源简介再推断成能力。旧未标记 Markdown 路径不变，未知模式和混合正文拒绝。
- Source、规则路径、Item/Activity 中文投影消费同一来源绑定；手动项继续禁止攻击、伤害、豁免、效果和资源消费推断。完整原文和可见 GM 边界同时保留。

V4 `v4-offline-r1/audited-receipt.json` 是最终保存输入回归口径：

| 保存输入组 | 正式链通过 | 完整能力 |
|---|---:|---:|
| 历史五例：Sea Hag、Gazer、Mezzoloth、Baernaloth、Ultroloth | 5 | 42 |
| V1 三个首次失败怪物 | 3 | 37 |
| Kamadan 保存基础回复 | 1 | 6 |
| Senmurv Maverick 保存基础回复 | 1 | 8 |
| Charon | 安全拒绝 | 不计 |

合计 **10 例、93 个完整能力**，精确 Item 数与完整来源能力数一致，无叙事产生的额外 Item。每例经过来源→保存事实→当前分步提取→正式 Actor→package→保存读回→完整中文请求；20 个 `verify:intake`／`verify:actor` 命令退出 0，网络和付费审核均 0。完整中文请求只证明可翻译范围，不等于历史中文完成。

原 `v4-offline-r1/receipt.json` 曾因审计 helper 未解码转义实体，把 Baernaloth/Ultroloth 的中文请求判为正文缺失。正式生成及 verifier 已通过；只修请求审计层，并用已保存产物复核，未重跑生成或 API。原收据保留，`audited-receipt.json` 说明两行的更正，不能把工具误报当产品失败，也不能悄悄覆盖原判。

V4 局部验证：分步／手动 122 测试、636 断言；generation 287 测试、1308 断言；parser 125 测试、415 断言通过。packages 类型检查、Intake 最终类型检查、六来源局部 anti-overfit 通过；独立审查复核 literal 标签、单次实体解码、LF/CRLF/CR、未知标记及混合正文拒绝，无剩余实质发现。手册人工核对 7 个受影响主题，生成页面后 `handbook:check` 33 项通过。没有把分开的旧模块检查宣称成一次最终全仓 CI。

## V4 冻结及首次结果

冻结清单 `candidate-freeze-v4.json` 含 337 个源码、模板、目录、构建、正式发行及手册文件，SHA-256 **`19ce9f1effaa8eb5898cffd8221d50ed82ab83180e8758f2262b4f8b336ef2ed`**。V4 新请求、翻译与原生验收期间未改这些产品文件；原 V1/V2/V3 冻结收据和发行原件分别保存。正常安装的临时验收 UI 单独绑定 `native-tool-freeze-v4.json`，不冒充发行代码。

| 版本／来源 | 首次真实请求 | 完整中文首次 | 结果与边界 |
|---|---:|---|---|
| V2 Kamadan，新公开 PDF | 1，HTTP 200 | 未进入 | en dash 负号误拦，首次 0/1 保留 |
| V3 Senmurv Maverick，新公开 PDF | 1，HTTP 200 | 未进入 | `ACTOR_MANUAL_RULE_LOSS`；V4 只回放保存输入，首次 0/1 保留 |
| V4 Senmurv Skymaster，同 PDF 第二只怪物 | 1，HTTP 200 | 未进入 | `ACTOR_SENSE_DRIFT Expected 20, got 21`，首次 0/1；不改原文、不重提取、不导入 |
| V4 SRD Giant Boar，另行预先固定的官方来源对照 | 5，HTTP 200 | 完整草稿通过 | discover 1 + base 1 + translate 3；repair 0、review 0，首次 1/1，后续原生见下文 |

SRD 对照在读取官方 PDF 内容前已固定，使用同一个 V4 冻结和模型配置，没有换版本／模型来获得通过；它是单独的来源对照，不能代替 Better Monsters 新 PDF 的首次失败。Skymaster 原文 Passive Perception 20 与当前投影 21 的差异未解决，不能据此断言作者写错，也不能把原文改成 21 凑通过。

保存输入中文另记：Senmurv 首次翻译 3 次 HTTP 200，0 新提取／0 审核；主任务完整核对后，用正式正文修订 API 对 Scent of Evil 的 Item/Utility 两处同义语法作本地修改，保留 500 尺、邪恶阵营、嗅觉等事实，模型 0，原草稿不覆盖。Kamadan 保存输入的中文首次 2 次 HTTP 200 后因简介残留 `XP` 被确定性完成门拒绝；原失败回复和最新草稿保留，当前没有把它记为完整中文或原生通过。

## 原生证据与审核结果

用户后续明确选择 **GPT-6 Luna / max 独立任务**。执行器 thread `01a13871-5d83-7930-8c21-1810f9d250a1`，真实 turn_context 已核为 model=gpt-6-luna、effort=max、never、danger-full-access。主任务负责源码与结果审核，没有继续操作 Chrome。浏览器创建／标签丢失／恢复的实际操作另有收据，用户旧 Foundry 页 `651344772` 及 Tripo／其他用户页未动。

正常安装的 helper 只把来源绑定的**未批准**草稿交给生产审核应用；测试 GM 在正常 UI 完成中文批准，再单独确认导入。没有手写或补丁修改最终 Actor，memory-only recovery 不覆盖既有 IndexedDB；原生阶段模型／付费审核均 0。

| 案例 | 原生导入与规则 | 持久化证据 | 图标 |
|---|---|---|---|
| 新 SRD 巨型野猪 | Actor `26f8afd9d6c28e7a`；3 Items：冲锋、坚毅完整手动 Utility，獠牙原生 attack；Actor/Item effects 0，宏新增 0 | 同页一次 reload，完整 documents、规则、中文、图标路径及 Actor ID 与刷新前完全一致 | 四种唯一资源都加载；Charge 奔跑图较合适，Relentless Item 为精确条目匹配，Utility 传送门与獠牙通用近战仍较弱 |
| 保存输入 Senmurv Maverick | Actor `fd962e33fca378b1`；8 完整手动 Items/Utility，无 Lore 多余 Item；effects 0、消费 targets 空、宏新增 0 | 一次 reload 的摘要保留；该页随后消失，官方 Chrome 新建必要自有页后只恢复身份，取得同 Actor 的完整原样文档，与刷新前完全一致；未再 reload、批准或导入 | 16 路径中 15 content-approx、13 低置信度、0 type-default；3 个唯一资源均加载，多个传送门图语义较弱，**语义 PARTIAL** |

主任务 `native-v4/luna-independent/parent-native-audit-r2.json` 对批准包重新走正式投影，与原始 native documents 比较：中文和每个完整 manualRule/sourceLogicalPath 一致，10 个手动能力全部无 attack/save/damage/effects/资源消费；巨型野猪獠牙 +5、触及 5 尺、2d6+3 挥砍正确。两例完整文档跨持久化完全一致。源投影与 `toObject()` 的 22/26 处表示差异逐项记录：数值 FormulaField 字符串、XP/熟练派生、法术等级迁移、Item parent reach、运行时元数据和 Token 展示默认值；未解释的生物规则差异为 0，不以直接整 JSON 相等掩盖 schema 默认值。

原生视觉已核对实际角色卡、手动正文和 Utility：手动能力保留明显 GM 边界；Actor portrait/Token art 均为系统默认 NPC 图，独立于 Item.img/Activity.img，不算已配怪物立绘。A 的 `native-actor-sheet.png` 截图早于卡面显示，不能单用该图作卡面证明；同批 `native-charge-item-sheet.png` 和后续 Item/Utility 截图包含正确原生卡及完整规则，可复用，不重做业务。

**证据与流程偏差：** Senmurv 刷新后“下载当前回读”未触发 download event，原失败和摘要保留。后续只用官方 DOM 只读取 helper textarea，原字符串保存为 `new-client-persisted-readback-full.json`，124878 字节，SHA-256 `0e783035123e50a14e33f75d94618c085ef686874d05c1f5a51fad8b4ca01a0f`；这是新客户端持久化读回，不冒充原刷新那一刻的原始下载。审计还发现执行器北京时间 12:02–12:16 混用 `mcp__cua_repl`，包括 B 的首次 reload；原 batch 声称全程 official 不准确，原件保留并新增 `browser-channel-correction-receipt.json` 修正。后续新客户端完整读回、原生手动能力视觉及收尾实际使用官方 Chrome。该偏差不抹掉已有正确业务数据，但不得把 B 记成“全程符合官方通道的一次首次验收”。

## 收尾与未完成

主任务已审阅两例完整来源、中文、原生文档及持久化，之后通过 helper 精确清理这两个 ID/hash 绑定的唯一 Actor，宏删除 0。`final-restored-world-baseline.json` 和原始完整基线由主任务重新逐字段比较（仅排除记录时间），Actors287、Macros94、Scenes65、Combats10、worldTime21085811、paused=true、活动场景及所有原始ID/名称/Forge flags/空输入字段均一致。证据为 `native-closeout-parent-approval.json`；自有页651344849已实际关闭，原用户页651344772和其他标签保留。

收尾截图仍显示“巨型野猪 Giant Boar”侧栏文字，截图无法确定该残留标签的ID或来源；不得宣称视觉目录已经完全干净。权威完整Actor集合不含被清理的 `26f8afd9d6c28e7a` 或 `fd962e33fca378b1`，且与原287 Actor集合一致。保留截图和执行器更正，未为消除标签再开页、再删对象或改写通过的ID证据。

临时 helper 已经绝对路径和SHA守卫核对后以普通单文件删除；安装 index恢复为冻结V4的精确字节。`native-v4-final-install-receipt.json` 证明16个正式文件磁盘与HTTP SHA全部匹配冻结发行，helper HTTP404，manifest未变。Mirror PID36592继续拥有127.0.0.1:30001，进程停止0，无生产写入。

`final-evidence-preservation-v4.json` 证明291个开工前本地证据仍与基线逐SHA一致，V4的337冻结文件无漂移；`historical-release-preservation-v4.json` 证明V1/V2/V3保存的9个发行文件分别匹配原冻结清单。HEAD仍为 `f79c25fbac747a7e08f98c48779f052c3db68599`，索引为空；既有dirty工作保留，无提交/合并/推送。最终源码测试复用上面的有效冻结前门禁；原生阶段只新增完整数据与运行时核验，不重跑无变化的全仓矩阵。

仍未完成：Charon 的条件静态抗性与 Colossal 映射；Skymaster 被动感知20/21投影差异；Kamadan 中文 `XP` 残留；多个能力图标的语义匹配。历史六例没有重新做首次生成／完整中文／原生六例验收，不宣传 6/6。当前进展证明完整复杂能力可作为安全 GM 手动能力进入中文 Actor，并有新官方来源首次成功与保存复杂来源原生持久化证据；不证明任意 PDF、任意基础表达或全部图标已支持。

## V5 已记录故障修复与当前门禁

本节继续原始目标；上一节“仍未完成”是V4收尾时的真实状态。开工保留1358个旧证据文件的SHA清单，V4三个发行原件移至既有历史目录防止正常build覆盖；不停止Mirror，不提交/合并/推送。

- Skymaster生成器本来已写 `skills.prc.bonuses.passive=-1`。dnd5e5.3.3真实源码会将它计入被动察觉，Intake核验器漏算造成20/21误拦。修核验投影，原文20及技能+11不变。
- Charon条件抗性、非原生Diseased和批准的Colossal用完整来源静态头生成3个手动Item，原生抗性只保留明确的Necrotic；标准伤害免疫和状态免疫仍独立核对。Colossal原文/45尺、最大原生grg及明确GM尺寸提示同时保留。其他未知尺寸和基础冲突继续阻断。
- 静态头手动能力有独立来源边界证明，不能只凭whole-header引文通过。缺头Item、删文或假原生字段仍拒绝。Baernaloth及V1另一例的非原生头状态也得到完整手动Item；不靠怪物名字分支。
- Kamadan复用保存的20个完整译文，由公共本地校验规范有来源支持的XP标签。0重新提取/0重译Actor，1次HTTP200只完成尚未翻译过的战斗包名称。完整草稿待原生审核。
- Skymaster保存输入首次中文3次HTTP200完整草稿通过，0提取/0修复/0审核。Charon保存输入首次中文3次HTTP200后因模型把Restrained译为受擒被拦；全文核对另发现Treasure Wind未持握/未同调的逻辑关系错误。原件与失败保留，来源对照本地纠正3个正文槽，0Actor重译；1次HTTP200仅完成包名称。中文标签保留Colossal原词，不把原生尺寸或GM提示误标成Colossal。
- 图标只读取完整来源规则，移除GM操作提示对分类的影响；来源感官、爪击、飞行分别用已锁目录中的视觉类别。完整mechanics/source marker保持，近似项不宣称精确美术通过。

当前离线来源→八组保存事实→当前分步处理→完整Actor→战斗包→读回→完整中文请求为12/12，118个来源命名能力和5个手动静态头，共123项，网络/付费审核0。`v5-remaining/offline-r2/receipt.json`是该轮原件；后续图标增量须以最终受影响复验收据为准。这里仍不把“完整中文请求”当“已完成译文”。原六例第一次完整验收0/6不改写。

复验依据：新被动修正、条件静态头、XP/尺寸标签和来源图标影响对应投影及完成门，增加这些局部正负例与真实失败输入回放。原生门前跑正式verify、局部anti-overfit、类型、构建与手册；已通过且未受后续变化影响的共同门禁复用。误用 `bun run test` 曾使参数未传入安全包装而启动更大测试，已停止，原日志保留；正确使用项目安全的分步测试入口，未把中断套件说成通过。

## V6 原生前补齐共享传奇预算

V5冻结333文件，SHA `82aa52f0ac7439d183e1e8fb0efacc21eb341da261f3f4fb19106add75b4a5f4`，未提交新样本模型请求。选定旧作者PDF第5页实际为版权页，第6页也是版权页，记 `SOURCE_SELECTION_NOT_ELIGIBLE`、模型0；原选择保留，改用独立索引确认完整来源，不在同PDF继续猜页码。它不是一次怪物生成0/1，也不改原始历史失败。

原生前读回现有正式Actor发现Skymaster与Charon的共享传奇资源最大值均为0，而来源明确是two/three。保留V5发行三个原件后，在完整能力处理步骤从不可变legendary context提取闭合标准预算，写入带原始引文的IR元数据与角色计数器。条件预算仍完整保留，不猜一个无条件值；手动能力不增加自动消费。核验器同时检查来源预算是否遗漏与Actor最大值漂移，简介不重复共享前言。

V6对应保存输入回放 `v5-remaining/offline-r5` 仍12例123能力全部通过，24个正式verify退出0、网络/付费审核0；实际Skymaster最大值2、Charon3。8份77能力的旧未批准中文按每个文本id/kind/source完全一致重新绑定当前事实与包身份，原模型译文不覆盖、不重新发送，`chinese-v6/receipt.json`通过。这不是继承旧GM批准。剩余层为最终冻结、独立完整新样本首次生成及GPT-6 Luna原生审核/导入/刷新与恢复。

V6最终冻结333文件，SHA `918cd33ef289f268396062e06f6c25b2d5121c252d29d468ecc6095517de39d8`。最终聚焦175测试923断言、encounter含parser547测试2408断言、全仓类型、6源码局部anti-overfit、手册33项均通过；generation287/1308、facts41/1445、raw契约77/1696及architecture无依赖违规按不受后续影响的边界复用。中断或不存在的测试命令原日志保留，不计PASS。

## V6 新官方复杂来源首次与原生派发

固定官方SRD5.1的Roper为独立复杂新样本；前一次BM版权页选择不合格不是怪物生成，不改它或历史首次原件。按完整命名资料块索引到PDF342页右栏至343页左栏，恢复六属性列的明确label/value阅读顺序，全部7项能力文字保持；原PDF/列原文/裁片/源文本单独保存。Python写出CRLF而预记LF哈希导致runner在首次请求前安全拒绝；仅校正元数据为保存原文字节的实际SHA，原文不改，原预检失败保留，模型0。

之后Roper首次真实公共生成链5次HTTP200：discover1、base1、translate3；plannedExtraction1/retry0/repair0/review0、priorIR=false、priorTranslations=false、outerRetries0，ready_for_gm_review、完整中文草稿有且findings空。7能力中6完整GM手动，Bite原生mwak+7/reach5/4d8+4 piercing；原文六触须上限、AC20/HP10/两免疫、替换与扯断、受擒/束缚/STR劣势和每个目标25尺拖拽均完整。主任务对照PDF裁片与来源/完整中文核对，通过公共draft与preview，不授予GM批准。该新官方来源不替代BM首次0/6。

9例84能力的当前未批准fixtures与对应完整身份封存于`native-identities-v6.json`，包含8保存输入77能力及Roper7能力。现有Mirror PID36592路径/监听重新核对；16正式文件正常安装，磁盘/HTTP逐SHA匹配；另正常加载只读/正式恢复辅助UI，helper独立冻结，世界写入0、服务停止0。原生由现有GPT-6 Luna/max独立任务执行，主任务没有操作Chrome。派发要求正常GM中文核对批准、单次导入、整批一次reload、完整原始文档读回及图标/实际derived被动20和传奇2/3检查，保留Actor/tab待父审计后再精确清理。此时原生为NOT_EXECUTED，不能宣称修复目标已全部闭合。

## V6 首批原生真实结果与三个缺口

官方Chrome独立任务真实turn_context=gpt-6-luna/max/never/danger-full-access。首批只导入6个Actor：Gazer、Mezzoloth、Charon、Ultroloth、Skymaster、Roper，共54个能力/53手动/1原生攻击；原9个候选中另外3个没有导入。一次正常reload的完整原始读回730675字符，SHA `977764c08d61558623a6f1e59f8f9bd0f43554a2abfa8fa3203885b97b85e1df`，六例与刷新前/各自首次导入原始文档逐JSON完全一致。世界287→293 Actors，精确只增加六个记录ID；原Actor及flags、94Macros及flags、65Scenes、10Combats、worldTime/paused/scene由父任务完整比较一致。

主任务 `parent-native-audit-v6-r2.json` 从每例实际已批准snapshot重新走正式公共prepare，核对package id/hash和生产ActorSemantics，完整manualRule源文/路径、中文和零执行/零effects均通过，未解释数据差异0。原r1审计工具遗漏最低PB2（Gazer为分数CR）及Foundry将正文`&#39;`正规化为字面撇号的表示等价；只补审计层，原r1保留，没有重新生成、导入或reload来刷通过。Source marker保持原始字节，其他markup不扩放。实际prepared Skymaster Perception11/passive20/legendary2，Charonpassive13/legendary3；角色卡截图显示正确2/3预算和最大原生超巨型，原文/中文Colossal与GM提示完整。Roper的原生Bite和6完整GM规则已经持久化，图片资源加载；三个触须相关图片为通用近战fallback，不能称精确美术。

原首批receipt的Sea Hag原因需要结合父任务更正：root级`sea-hag-auntie-review.json`实际存在；同批审核DOM第578行**完整合成中文**包含“该生物只有用海水送服，才能留住固体食物而不吐出”。执行器只看剩余可编辑prose片段而误认为缺文，并在汇总漏读root级记录。原review/receipt均保留，新增`sea-hag-review-parent-correction.json`；真实Actor仍未创建，需要回到同一正常UI补正确审核与首次导入，不能仅靠更正报告说原生通过。

另两例是实际译义错误。Kamadan的Lethargy Breath将跨`br`的Save Ends at end of turn译为“在回合结束时结束豁免”，缺重复与成功结束含义；Baernaloth Deranging Touch将同一0HP受害者译成“被其影响的生物”，且三处免疫头将Poison伤害误为中毒。通过现有生产`reviseForgeEncounterLocalizationBody`作2+5个明确本地修订，数值/骰式/markup/术语/来源身份和原始manualRule再次核对保持，无模型/付费审核，不改最终Actor。新未批准fixture放`native-review-corrections/`；原草稿和原生拒绝均保留，尚需正常GM重新审核后首次导入。

冻结333个产品文件逐SHA仍一致。本次只是来源对照的允许本地译文修订与实际证据层更正，不改版本、不重跑原已通过的六例。下一批只补这三个固定例的真实导入和持久化，并保留已通过六例与现场，全部父审计后再按实际id/hash精确清理。

## 最后一例正文语法清理与兼容边界

补充批已正常批准/导入Sea Hag和Kamadan两个Actor，原始读回分别168590字节、SHA `eb9d72e322e782b5554f8e699e6642fa69c669f98521c7c2f9b98f99ec75a0aa`，111959字节、SHA `5819e3bbf32e6f05369f1d12976640e88c2c4ddbd59ec76b9bab4a8786a086ed`。实际完整原生简介和能力正文证明海水食物规则、XP1100与两处每回合末再次豁免/成功结束。295 Actor只较首批增加两个新ID，宏94，无模型/付费审核/重新生成。因为最后Baernaloth尚未批准，补充整批读回/reload暂未执行，不能提前推广为9例持久化通过。

Baernaloth原有2+5项修订全已正确，但7个显示字段强留9个英文所有格/缩写撇号实体。原正式UI显示的是HTML源串，不是引号之外新增实际英文规则；撇号在中文中仍多余。纯本地清理属于原修复授权，但公共修订API真实拒绝删除，报“改变数字、骰式或标记”；旧门把实体中的39同时当数字/标记。先保存零世界写入复现，再保留V6三个发行原件。

窄校验修复只允许正文来源中全部撇号实体都位于英文单词字母之间且不在HTML属性/富集引用时，在中文省略这些语法标点。其他实体、真实引号、HTML、属性/链接、数字/骰式不放宽，旧保留撇号的已批准包仍可读取。新公共API清理7字段9实体，先前2+5修正、全部12能力与原始manualRule字节保持，0模型/付费审核，未批准新fixture位于`apostrophe-cleanup/native-fixture.json`。聚焦182测试/938断言及既有reviewed-localization44/329通过；八个已经导入Actor的实际批准包在新校验下重新公共prepare并通过生产ActorSemantics与native package hash绑定，世界写入0。因此保留这八例业务证据，最后只补Baernaloth导入及所需真实刷新，不重新生成/导入旧八例。

校验补证说明：上一轮typecheck:all日志无错误，但退出状态收据在回传中未保留且原会话已关闭；本次仅补这一退出状态。生成事实、能力和前八例原生数据未改变，旧整链/实机证据按真实兼容检查复用；不重新跑模型或整批生成。

V7窄修补已构建冻结335文件，冻结SHA d3dbb8f3ffa65d5eb2b174b6456a3f3d718a94fa6713edc79f2786c8287474d5；与V6只有正文语法校验、对应测试/手册和重新构建发行物变化。12例123能力/24正式verify、V6新Roper首轮和前八个实际批准包证据继续按身份兼容复用，没有新模型或首次生成。typecheck:all补退出证据0，4项手册人工复核、build/check33项通过。核对同一Mirror PID36592/loopback30001/持久cor-cotn后，先保护V6发行原件并逐SHA检查旧16业务文件与helper，再安装当前16文件及V7 helper；磁盘/HTTP17项一致，世界写入和进程停止0。客户端需一次正常刷新加载V7，最后导入Baernaloth后再一次补充持久化刷新，两者分别记录，不将构建激活刷新算首次生成重试。剩余等待最后正常GM批准/首次导入、九例完整回读父审计及精确恢复，不能提前宣布整体完成。

## V7最后首次导入与工具层剩余缺口

最后Baernaloth通过真实正式GM批准/单独确认只导入一次，Actor `0823b5cb57d40487`，世界296Actor/94Macro，唯一新增该Actor。完整即时回读191506字节SHA `f7c3a73b8ef33bcb492ec54cc1cde657fc445bde569362fe5604f1136f0e2f49`、UI批准包与40字段/two translation hash已保留。父任务从三例实际已批准snapshot走公共prepare+ActorSemantics，Sea12/Kamadan6/Baer12全部GM手动，完整manualRule原文、中文、零错误执行/零effects/包hash匹配，未解释数据差异0；prepared passive14/16/19。原六例证据继续有效，九例共84项能力/83手动/1原生攻击已有正常导入和即时源/中文证据。最终九例补充持久化仍待验收。

V7激活前后八个原生全文逐JSON一致；所有世界基线按稳定document ID核对一致。最初父审计把Actor collection枚举次序变动报成数据变化，原失败与辨别结果已保存，只修审计表示层，Item/Activity内部顺序仍严格相等，不重放已通过浏览器。九例batch页面已生成但整串回传200000字符截断，随后下载等待超时丢失控制绑定，补充reload未执行。原故障保留；恢复误选服务端入口触发node:process禁止，已核对当前官方客户端入口和文档，向同一Luna接受派发标准初始化与60000字符DOM分段读回；不改变组件、权限或控制通道。所有Actor/helper/tab保留，父任务等正规连接恢复、完整读回与最后刷新后继续审计和精确恢复。图标近似和默认NPC portrait/Token仍独立，资源加载不等于精确美术。

## 九例完整持久化父审计通过，精确收尾待回传

官方Chrome恢复同Browser3/tab651345209，原现存textarea通过19段DOM只读提取，未重复batch或下载；完成一次补充持久化正常刷新。完整前/后原始UTF-8字节为1141762/1141525，SHA分别`d558240022a6a821a3d5290c1c2280725728f42f8404477c5a0683fef5ac788e`/`2afb16ac7a62370ce43df833fcc51c2fb9bad442b0dfa080656f5fa1d20b2bb6`。父审计对九例每份全部Actor/Item/Activity/flags/derived逐JSON及各自首次原生readback完全一致，从实际GM批准package公共重生成验证完整来源/中文与零错误执行，84能力/83手动/1原生攻击，未解释差异0；原287Actor/Forge flags、94Macro/flags、65Scene/10Combat及时间暂停场景按ID完全保持，仅9个已记录owned Actor新增。所有资源可加载，近似图标与默认立绘仍不升级为精确美术。

父审计最初误将identity附带fixture/fullRules metadata当source tuple，原失败/诊断保留；只改审计按caseId/sourcePackageId/sourcePreparedHash严格比较，Actor全文仍精确。335冻结产品文件及1358旧证据、V4/V5/V6九个发行原件再逐SHA一致；Git HEAD保持f79c25fbac747a7e08f98c48779f052c3db68599，index为空。Python普通Win32路径对一个266字符旧artifact读失败，Bun原生读取同一实际文件及原SHA证明未删改；未恢复/改名/跳过。旧BM首次0/6和历次首次失败仍原样保留，后续保存链/中文本地修订/原生成功分开，不重分类。

九个具体Actor的id/packageId/packageHash及fixture绝对路径已形成父审计whitelist，交同一Luna只做精确临时对象清理；之后父逐SHA恢复最新冻结业务index、移除两自有helper，并补最终UI/基线核对。服务不停止，无模型/付费审核、无提交合并推送。收尾回传前不标整体完成。

## 九个自有Actor清理和业务文件恢复已核对

Luna逐Actor核对完整当前文档、唯一id/packageId/packageHash和fixture SHA后才通过正常Document API清理；九份删除回执分别仅含预期Actor且remainingMatching=0。父任务独立读取所有原始回执，最终full baseline与原287Actor/94Macro/65Scene/10Combat、全部Forge flags、时间暂停当前场景及Forge输入按ID一致；9case owned documents=0。Gazer中间汇总误读验证对象形状的原失败保留，仅修汇总，不重做删除。父权威清理audit使用实际绝对路径/raw hashes，不依赖子收据中遗漏baernaloths层的旧relative evidence links；有效删除/验收证据保持。

父任务再核同一PID36592与loopback30001/持久cor-cotn，恢复已冻结V7业务index SHA `ed80bfc2ce7409d52b9ff9a39ef6e43a3384f091772f2022a79bd76e78775dd7`，只按精确路径及SHA移除两个本批自有V6/V7 helper文件，无Force/递归/数据库编辑/备份。16正常业务文件磁盘及HTTP字节全部与冻结一致，两helper磁盘不存在且HTTP404；世界写入和停止进程0。剩余只需同一Luna一次正常客户端刷新确认helper已消失、正常Forge入口可用并关闭本任务owned tab，当前已接受派发，未提前标完成。

## 最终结论：本轮授权的本地修复与收尾完成

主权威收据：`.local/forge-staged-manual-20261013/v5-remaining/final-closure-receipt-v7.json`。真实最后客户端正常刷新一次，V6/V7辅助按钮/dialog/picker均为0；正常“Forge 生物”入口可用，打开并关闭“Forge · 生物工作台”，未生成、审核、导入或改设置；仅owned tab651345209关闭且随后清单无该ID。父任务核对最后DOM/截图/receipt SHA并实际查看截图。侧栏仅暴露23个可见Actor，不能据DOM冒充完整287；完整世界恢复以之前原始baseline及父审计为准，恢复静态文件和最后界面操作无世界写入。16业务文件磁盘/HTTP冻结字节恢复、2自有helper移除/404及常驻PID36592保持。

原始生成流程拆分已在正式入口实施：程序保有来源和完整能力，基础八组事实先核验，完整能力单独逐项处理；安全普通攻击原生，其余完整GM手动，Actor和正式中文共享核实事实。记录的passive/预算、Colossal、条件抗性/非原生状态、字面传记、海水食物留存、XP中文、0HP受害者/再次豁免/毒素与中毒、正文语法标点故障均已由来源和实际原生结果核实。离线保存来源→Actor完整链12/12、123能力、24正式verify；完整中文与正常批准/导入/最终刷新9/9、84能力/83手动/1原生攻击。冻结后独立SRD Roper首次真实5HTTP请求完成完整中文，retry/repair/付费审核0，其证据在不改来源/机制的V7窄修补下按实际批准包兼容复用。没有将12例source链全部说成12例完整中文或原生，也没有将9例导入成功说成9例新样本首轮成功。

182/938聚焦、44/329既有中文校验、typecheck全部退出0，4项手册人工复核与33项build/check通过；已有受影响generation/parser/facts/raw/类型/依赖和anti-overfit证据按真实不变边界复用。335冻结产品文件、1358旧证据和V4/V5/V6九个发行原件逐SHA保持。旧BM首轮0/6及其他首次失败不改写，部分能力图标近似/回退、Actor/Token系统默认图仍独立记录；未宣称任意PDF首轮成功或生产验收。代码只在用户指定dirty工作树，HEAD未动、index为空，不提交合并推送；付费AI审核仍关闭。目标条目与精确恢复条目均已闭合，未留已授权工作待用户确认。

## 后续全新样本揭示的剩余缺口（2026-10-15）

用户随后要求一个此前未处理过的生物。冻结V7的Archivist Grim真实首次测试0/1：发现阶段因模型起点偏一字符及引文空白差异被拒绝，基础、能力、正式中文和导入尚未执行。详见[新样本验收记录](2026-10-15-forge-unseen-archivist-grim.md)。以上12例离线链、9例中文及原生证据继续有效，但它们不能支持“全新、来源完整的生物已普遍能首次生成”的结论；目前仍有发现阶段缺口。保留新失败原件，不改冻结版本或重试凑通过。
