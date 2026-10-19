# Forge 三个阻断的限定修复与复测

用户授权仅修正前次三来源测量发现的反应伤害投影、内部规则 ID 中文化、DM 缩写三个阻断，不放宽校验、不扩机制，复测原三个来源并更新手册。沿用既有工作树；付费 AI 审核默认关闭，没有新增提交、合并或推送 master。

当前结论以文末“最终冻结版同源复测”和“最终原生验收与恢复”为准：完整中文候选首成 **0/3 → 2/3**，两例成功均无 IR 修复；海妖婆因遗漏两段来源定义仍被严格阻断。最终两份新鲜候选及一份明确标记的Sea续跑候选导入/刷新/清理均通过，不能把续跑通过算成第三例首次成功。下文首版测量和失败保留为历史证据。

## 原因与最小修复

1. Faldric 的正式 Actor 并未丢伤害：反应 feat 的原生 Attack Activity 已有 `1d8 + @mod`、明确 `attack.ability=dex`。Intake verifier 直接把变量字符串与原文 `1d8+3` 比较，造成假漂移。先修只读投影，按每个 Activity 自己的明确属性和 Actor 有限分数还原精确 `@mod`。不执行任意算式，未绑定、错误属性、错骰和自定义表达式继续由严格比较阻断。后续原生读回暴露长射程的载体问题，最终生成器投影修正及其边界另记于文末。
2. 海妖婆包级 notes 的 `see rule id ...` 被原样交翻译，模型保留内部 ID 后触发中文残留检查。新显示请求按当前固定配置的精确 ID 和 Actor 绑定，改为对应 Item 标题引用；跨 Actor 同名时带包内 Actor 标签。未知 ID、缺 Actor、真正无法唯一绑定或标签冲突阻断，原包/config/结构化 ID 不改。旧已批准包按原 requestHash 读回；新显示请求有新 hash，不复用旧失败字段的批准。
3. 小法妖原文的“由DM决定”被原样保留，触发中文残留检查。仅在既有数字/HTML/链接保护之后，将正文传输的独立 DM 规范为 GM；原始 LocalizationRequest、ID、hash、数字和结构化链接不变。没有给 validator 添加 DM 或英文 ID 白名单。

版本依据：实际安装 dnd5e 5.3.3 的编译 source map 中 `module/documents/activity/mixin.mjs:1191` 明确从该 Activity 的 `this.ability` 取得 `rollData.mod`；`module/data/activity/attack-data.mjs` 保留原生伤害 `@mod`。source map SHA `146bdf5ca764df2db6520b0f81e9fcea40278cd53325fd8fcbfb0f0bd0b049b1`；项目已有 generation verifier 也要求非 flat 的 v14 武器攻击采用 weapon base 或动态 `@mod` part。没有引入新系统接口或升级版本。

## 局部与整合证据

实际保存的 Faldric IR fixture 经 renderer→正式 workflow→严格 source verifier 复现 `ACTOR_DAMAGE_FORMULA_DRIFT`，修前 4 fail/2 pass，修后通过。正例覆盖 +3、-1、0 属性加值；反例覆盖缺分数、未知属性、非平凡变量、错骰、错属性、自定义表达式。补充 Activity 使用自己的属性，没有借用首活动属性，投影不修改输入对象。

译文两阻断先 RED 后 GREEN；原包序列化/结构化 ID/旧批准 requestHash 兼容、实际 DM 正文和受保护 `@UUID` 都有回归。独立审查发现跨 Actor 同名能力误拦截，修后新增实际反例复验通过，旧同 Actor 歧义负例保留。两组回归已纳入原 `test:fvtt-json-forge` 入口，不增加测试平台。

首版冻结时受影响 Forge/Intake/中文整合 **813 pass / 0 fail / 5372 断言 / 46 文件**；全仓类型、package 类型、Forge 构建通过；架构检查 **1309 模块/3094 依赖** 无违规，局部 anti-overfit **23 来源** 通过。既有本地化组 36 pass/288 断言。最终构建检查见文末；不执行全仓 CI、生产或长时验收。

## 首版三来源新鲜复测（历史）

已复用原测量器和相同三个未修改来源，每例从原文独立运行一次，不使用旧 IR、翻译草稿或人工修正。对照前次 `final`，固定 DeepSeek/deepseek-flash/openai-chat/json_object/low、中文、deferred。记录实际 HTTP（含自动修复、翻译）与耗时，全部 paid-review 接口设为禁止调用。完整候选经 parent 和独立 worker 对照原始来源后计首次成功；自动修复单列，无人工续跑冒充首成。

| 原来源 | 修复前耗时 / HTTP | 修复后耗时 / HTTP | 本次新鲜结果 |
| --- | --- | --- | --- |
| Sea Hag Auntie CR7 及引用定义 | 493 秒 / 9 | 43 秒 / 1 | `ANALYSIS_INVALID_RESPONSE`，上游提取返回未过现有 schema，未进入 IR/翻译，首次失败保留 |
| Faldric the Archer | 29 秒 / 1 | 84 秒 / 4 | 完整中文候选待 GM；无 IR 修复，5 能力及反应伤害/范围/技能/豁免核源通过，0 Macro |
| Gremishka 小法妖 | 89 秒 / 4 | 73 秒 / 5 | 经 1 次自动 IR 修复后完整中文候选待 GM；5 能力/个体集群限制等核源通过，0 Macro |

首轮完整中文候选成功率 **0/3 → 2/3**。口径为一次原文提交内，来源/正式生成/中文校验及语义核对通过且无需人工修正；现有自动 IR 修复仍计入此次提交并单独列出。若另要求不发生 IR 修复，完整成功为 **0/3 → 1/3**。仅 3 个样本，不能推广为一般成功率。

耗时终点不同：Faldric 现在完成了之前未进入的中文翻译；小法妖现在翻译完成；海妖婆本次更早 schema 失败。因此不能以其 43 秒早失败或全批总和宣称整体提速。三个原阻断的确定性回归均通过，但本次海妖婆的新鲜成功率仍为失败，未修改 schema 或扩展上游提取机制。

新证据任务目录 `.local/forge-three-blockers-20261012/fresh/`；前次 `.local/forge-first-pass-20261011/final/` 与开发/续跑证据保持，不覆盖。请求元数据和数值 usage 记录可复核，不保存凭据、完整 HTTP 请求/原始响应或推理文本。

海妖婆另用前次同 hash、已正式校验的候选及其有效 Actor 译文，只重译变更后的包级显示请求：**2 HTTP / 29 秒**，0 提取/控制配置请求、0 付费审核。5 个引用均正确显示中文能力标题，结构化 ID 保持；Actor111字段原样复用。该补测证明原 ID 阻断已解除，不计入 fresh 首成。

补测核源发现旧 Actor 的 GM 总结与 PDF 有矛盾：“GM 为每个目标决定”与原文“目标选择”冲突。没有扩大产品机制，只经已有 `reviseForgeEncounterLocalizationBody` 按 PDF 修正复合指引及单独步骤两个显示槽，再公开 prepare/批准测试流程生成候选，0 模型调用；修正来源与字段 ID 留存。此人工修正不计入新鲜成功，也不能把旧总结误当来源权威。Merthirst 当前完整原文正确译成海水送服才能不吐食物，没有复用此前 R4 的“咽下”误译。

## 首版本地安装与运行边界（历史）

已安装同一 Lab，Core14.368/dnd5e5.3.3/cor-cotn/PID6156/127.0.0.1:30001。只替换 `scripts/index.js`，16 文件 candidate/installed/HTTP hash 一致；新 JS SHA `aa200428480b17d6995546fa7276a374dc3712a32a12f8a230f5733c30e10d76`。没有服务操作或备份。三候选的 canonical 来源→Actor verifier 均通过，原始来源语义另核。

原 Chrome 执行器已收到一次受影响读回批次：新 Faldric 的正常导入/原生反应公式，以及 Sea 续包的新中文规则引用及目标自选指引，随后一次刷新与精确清理。均通过公开工作流形成明确的自动化测试批准包，不声称人类已审核或本轮中文批准按钮已测试。**该批浏览器结果待回传**，不能提前记为运行通过。

新 Grem 的整个批准包 SHA 仍为 `bb5f8c17218241c96a0c7677651364642024e5a73b870518698eecb38aefc8cb`，parent 逐字段对比当前 Actor 与前批公开 UI artifact 完全相同；相关导入/刷新逻辑未改变，复用该精确包/产物的旧运行证据。本轮真实模型/DM规范与核源是新执行，复用不冒充模型首成。Grem 仍需 GM 手动处理形态、浴血骰、同调、治疗变形；Faldric 可见性/相邻格触发、敏锐视觉和多重攻击不声称自动化。

手册补充“核对规则引用与角色称呼”，6 个 stale 条目逐项人工核对后 review/build/check，33 项通过。没有缩小 watch。既有手册 file: 浏览器策略拒绝保留 NOT_EXECUTED，不另起托管服务或换通道重试。旧图标/战斗和无变化机制不重演。

## 原生读回反证与最终投影修复

上述首测的 2/3 仅为候选层结果，不能代表原生可导入率。首次浏览器批次 Faldric 导入实际在 `$.items[4].activities[0].value.range.long` 阻断，产品自动回滚，目录287/94集合逐项恢复；Sea未执行。执行器先误以目录无增量代表尚未提交，又点一次按钮；2次按钮动作已记录，但内部尝试/创建次数及UUID未暴露，保持UNKNOWN，不编造“仅一次”。收据 SHA `0173bd6d9ef7ffc00d1847cfbe7faa10441965b09a8d3de28a6c7280dbce3401`，耗时396秒；没有模型、战斗或服务操作。旧失败与公开产物保留。

5.3.3实际schema确认 Activity RangeField 不含 long/reach，weapon显示与原生参数从父Item range读取。旧反应使用feat，没有可保存长射程的父武器字段。新增schema-derived最小投影：仅v14、反应或bonus、非被动、已有原生基础伤害且既有范围解析有明确长射程的攻击使用weapon载体；原激活/分区/次数/数值/效果保持，伤害通过Item base加一次绑定属性，没有重复@mod。近战、旧版本、flat及未支持的复杂范围不被新增分支放行。严格readback未修改。

三个输入形态（实际结构化Faldric IR、结构化远程bonus、英文reaction）模拟RangeField丢弃未支持字段，修前3例均复现相同错误路径，修后通过；错误父长射程仍拒绝。补充近战、旧版本、flat等负例与原伤害/属性漂移检查。独立审核未发现新增实质问题。最终受影响整合 **817 pass/5389断言/46文件**，生成器安全回归 **286 pass/1293断言/28文件**，package/全仓类型、build、23来源anti-overfit通过，架构1309模块/3095依赖无违规。

新JS已核16文件安装/HTTP一致，SHA `8691dec758d09d3e546fd3e485d993034533a91497afa0b650743933a785cf8a`，仍仅JS变更，无服务操作。由于最终原生投影改变了受支持产物，重新冻结后同三个原文各一次独立测量，原首测结果保留为候选阶段记录，不沿用先前2/3当最终可用结论、不反复挑样直到成功。

## 最终冻结版同源复测

最终实测使用上述新JS对应源码、相同三个原始来源及完全相同模型/协议/low/中文/deferred设置，每个来源独立提交一次；未使用缓存、旧IR或人工改稿。原始来源SHA与前次final逐项相同。新证据为 `.local/forge-three-blockers-20261012/fresh-final/`，汇总另存 `final-comparison.json`；没有覆盖首版fresh和前次final。

| 原来源 | 修复前耗时 / HTTP | 最终版耗时 / HTTP | 最终版结果 |
| --- | --- | --- | --- |
| Sea Hag Auntie CR7 及引用定义 | 493 秒 / 9 | 91 秒 / 2 | 提取后自动修复1次，仍漏 Hag Debts、Merthirst 完整原文落点；`SOURCE_DEFINITION_OMITTED` 阻断，未生成中文候选 |
| Faldric the Archer | 29 秒 / 1 | 57 秒 / 4 | 1次提取、3次翻译，无IR修复，完整中文候选；5 Items/0 Macro，来源核对通过 |
| Gremishka 小法妖 | 89 秒 / 4 | 100 秒 / 4 | 1次提取、3次翻译，无IR修复，完整中文候选；5 Items/0 Macro，来源核对通过 |

完整中文候选首成 **0/3 → 2/3**；另要求无IR修复时也为 **0/3 → 2/3**。Sea新鲜提交仍失败，不以旧候选续跑、人工正文修正或浏览器测试包抵充。该来源完整性失败超出本次三个阻断的修复范围，保留原校验，不增加新提取机制或继续抽样直到通过。三例样本不能推算一般成功率。

时间和HTTP终点仍不同：旧Faldric在生成校验停止，新Faldric完成中文；旧Grem未完成中文，新Grem完成中文；Sea新旧都失败，停止层不同。因此不能宣称端到端普遍提速。最终批实际10次Forge模型HTTP，0付费AI审核；本轮含首版10次、Sea定点续译2次、最终版10次，共22次Forge模型HTTP，不含Codex开发/代理调用，全部付费审核0。失败与额外开发测量没有从成本记录中删掉。

parent和独立worker均对照原文核验最终两候选：Faldric保留DEX16、命中+5、1d8+3、反应、150/600和命中倒地；原生weapon父Item保存1d8基础伤害及长射程，Activity includeBase且不重复附加@mod。Grem保留个体/集群限定、浴血伤害、GM结束同调和魔法过敏的治疗/变形规则；这些复杂机制继续GM处理，不宣称自动化。所有三个浏览器测试候选（Sea为明确标记的续跑修正文案）另经正式CLI来源verifier通过，不能代替以上原始来源语义核对。

最终Chrome批次 `forge-three-blockers-native-range-final-20261012` 由原执行器完成，用最终Faldric、小法妖候选及Sea续跑测试包，正常导入→一次持久化刷新→精确清理。包SHA分别 `50af088508cbd1a049076315db5bdb1616c70dd128a8f92fd2618e51fc3f4d2e`、`61494f2431806b1e3c04dc086d3df819f5a0a9de982fbab9acec0326f271e49e`、`1466e0dc2610225b59b3584567301f409c441873f0d2e67131c194eabff8342c`。小法妖最终简介措辞变化使包/产物身份改变，不能沿用首版精确hash的运行证据，故本批重新导入。测试批准不冒充人类审核，仍不调用AI审核。

手册已补长射程反应/附赠攻击使用原生weapon载体的说明，激活/分区和数值不变、读回不放宽；受影响3条在核对实现和来源后重新review/build/check，最终33条通过。只有验收/进度记录在本段新增测量结论，未改手册页面交互；先前file:协议拒绝仍为NOT_EXECUTED。

## 最终原生验收与恢复

终批正常导入、一次刷新、精确清理 **PASS**。实际JS/目标与上述冻结版一致；执行器实际GPT-6.1 Sol/medium/danger-full-access。北京时间2026-10-12 01:58:52至02:20:30，批次1298秒；这是三例UI验收和恢复的时间，不并入单例模型生成耗时。本批每例只提交一次，完整status/alerts均成功，无重复导入，共新建3 Actor/1 Macro。所有公开UI Actor JSON与各自工作流localized-actor逐字段一致，测试包hash匹配。

- Faldric：原生反应行+5、1d8+3、150/600尺，触发中的能见/进入佩利顿相邻空间、命中倒地均保留；刷新后同Actor及5个Item ID、整段反应正文保持。没有伤害常数修补或忽略range.long。
- 小法妖：最终新传记刷新前后逐字一致；同5个Item ID，微型/31HP/14AC/CR2和集群、浴血、GM同调、个体1/日30尺治疗15后变形的描述保持。复杂机制仍GM处理。
- Sea续跑测试候选：同14个Item ID保持，12主体+2引用定义完整；海渴症“不吐”译义及债务定义可见。五包级规则引用显示正确中文标题，原始固定command中规则ID保留。原生手动Activity整段明确由目标自行选择智力/感知，刷新前后完全相同。该结果只证明续跑候选可导入，fresh遗漏仍失败。

按精确新ID清理3 Actor/1 Macro各一次，收据记录原Actor287/Macro94 ID集合逐项恢复、新ID全不在。清任务前核Sea包hash，随后恢复空来源/标准模式；Guard16/11/30/CR1/8、十项设置与无Key保持，其他页面/服务不动，工作tab保留。本批AI/翻译/Key设置/探测/付费审核/活动/掷骰/控制器/战斗/时钟/服务操作均0，不声称进行了战斗触发验收。

parent复核收据SHA `3bb55efc220a2aaa5ec2a1bed150b8e43cdc1d3c71632c52fbabd889a4b20b48`、三份公开产物、包身份、刷新前后Item ID/正文、五引用、恢复状态，并目视六张代表截图。首次本地核证脚本误取Faldric不存在的通用afterText字段，已改读实际reactionAfter后通过；这只是读证据修正，没有重演导入或改业务数据。详细原始收据/读回/截图及parent-review位于 `.local/forge-three-blockers-20261012/native-range-repair/browser/chrome/`。此前失败批次和手册file:拒绝不被终批覆盖。

本次限定修复、原三来源最终测量、可用候选运行验收及手册同步已完成。当前功能仍为PARTIAL：首次完整候选2/3；Sea新鲜提取的完整定义问题留作明确剩余项，不扩大本次范围。主区索引为空，master HEAD `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`、任务分支HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`未移动，未知`.omo/`保留，没有commit/merge/push。
