# Forge 引用定义保留与海鬼婆续跑验收

用户在核对CR7海鬼婆的剩余问题后授权继续处理。本轮先修“引用定义已提供，却没有进入人物卡”的问题；实测触发的标题、换行和包级显示衔接一并限定修复，没有新增战斗机制、放宽validator或开启付费AI审核。沿用原工作树，未提交/合并/push，master不动。

当前状态：本轮限定的来源保留、正式生成、本地中文核源、必要检查、原生导入/刷新/精确清理和修正后的包级说明显示均完成并核证。原生批次发现的说明矛盾经本地编辑修正，整份Actor及宏命令/绑定不变，复用原生接受并仅补正常预览。本轮唯一新鲜提交的开发快照仍失败，最终候选复用同源草稿并有人工正文修正，不能计首次成功或宣称一次生成已稳定。

## 修复与反证

- 来源事实整理复用既有严格完整性检查，只把精确候选范围内、明确引用定义的完整原文附入传记并记录来源证据/coverage。已有完整能力说明不重复，范围截断末块不自动补写，未知机制/错误身份/冲突claim/无效证据继续阻断。Browser和CLI共用；没有新增Item或自动效果，也不因引用定义再发模型请求。
- 同一英文原名及其括号限定别名共用一个完整标题，YAML与GM载体绑定使用同一格式；保持限定和正文，普通双语不变，不同身份仍拒绝。三个不同名字/限定的真实正式生成先红后绿，不改精确findItem规则。
- 明确普通/首次失败的正向状况，允许PDF单行换行；句末、空段、否定/免疫、仅失败差值/第二次失败及未明确成功分支继续literal审阅。LF/CRLF正式Actor形状正例、近似反例通过。实际反证为Sargassum Grasp的DEX15分支，保留原门禁，不忽略literal-save。
- 包级显示请求把已声明角色编号换成唯一角色名称，将已识别固定配置字段改成普通文字。原包/command/ID/数字参数不改，未知角色引用继续阻断。旧raw和旧rule-title-only已批请求各按原hash读回；旧显示字段亦按对应身份选择，没有把新字段绑定到旧批准。

原始Sea失败IR回放稳定返回两个SOURCE_DEFINITION_OMITTED，修后0模型转ready_to_generate。中英文、多段例外、scope、幂等、输入不变及原缺失负例均留回归。所有生产逻辑均按来源/格式处理，没有海鬼婆或其能力名分支。

## 同一来源的真实调用记录

固定原来源SHA `0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1`、4314 UTF-16字符；DeepSeek/deepseek-flash/openai-chat/json_object/low、中文、deferred，与前轮设置一致。没有保存凭据、完整HTTP请求/原始响应或推理文本。

| 阶段 | 时间 / 实际HTTP | 结果及边界 |
| --- | --- | --- |
| 前轮最终新鲜提交 | 91秒 / 2 | 漏两定义，失败；原件保持 |
| 本轮唯一新鲜提交（开发快照） | 137秒 / 2 | 两定义已保留，能力限定别名嵌套导致正式绑定失败；首次失败保持 |
| 对本次IR作明确来源反馈 | 34秒 / 1 | 缺属性的原生save被移除，但模型仍将目标自选INT/WIS标blocking uncertainty；保持needs_review，不强填属性/清标记 |
| 原始遗漏定义IR的修复验证 | 31秒 / 1 | 不重提取/修复，实际固定配置提案完成；PDF换行导致literal-save，原门禁阻断并保留 |
| 同IR/实际配置提案重新验证及中文 | 238秒 / 6 | 不重提取/修复/生成控制配置；正式英文候选完成，Actor中文有效，包级内部字段残留被阻断 |
| 包级显示投影后的续译 | 46秒 / 2 | Actor译文复用，只译改变的包级字段，完整中文草稿通过 |

本轮共 **12次Forge模型HTTP**：提取1、修复2、固定配置1、翻译8；付费AI审核0，不含Codex开发调用。没有覆盖任何失败或以续跑/人工修正抵充首次成功。各阶段停止位置不同，也没有最终冻结版再抽一次完整提取，因此不能给出最终版首次成功率或普遍提速结论。证据目录 `.local/forge-reference-definitions-20261012/` 的fresh/continued/proof/validated/translation-continuation独立保留，汇总见comparison.json。

## 原始来源语义核对

最终测试候选12主体Item，两个引用定义完整保留在传记；它们不作为两个新增能力重复创建。AC15、HP151、CR7及原数值保持。核对以下限定：鬼婆债务的欠债前提/任意距离感知/每日一次重掷采用第二结果；海渴症海水送服才能不吐；Seed Terror由目标选INT/WIS、DC15及回合末成功解除；Steal Passion专注豁免和三种分支；Bilebrine5环/充能5-6/两5d8/成功半伤害/仅此次伤害致0HP感染；Sargassum水下目标、DEX15、逃脱15、下回合末及必须拖动15尺；Death Glare前提、WIS15和差值5追加降0HP；Courage30尺触发、反应、2d8黯蚀。

人工核源仍发现“keep food down→咽下”、不同海渴症译名、Death Glare模型总结额外instead、Sargassum把必然拖动写成“可以”，以及一处截断摘要。通过已有reviseForgeEncounterLocalizationBody修正10个正文显示槽，0模型；原始PDF优先于模型总结，数字/标记/来源请求和能力绑定保持。原模型草稿与修正记录都保留。这没有实现通用自然语言译义保证，GM复核仍必要；当前新鲜IR的目标自选豁免表示与blocking uncertainty也仍是明确剩余项。

公开prepare/测试GM确认生成最终包，package/file SHA `b764b1cfad9643e0c5fade36eb52024b43939dd98911d5179ccbaca348de5d02`，sourcePackageHash `45baec545b86d8243b7ea171e63470152bdc8cc0cab155027fecd6357d40c817`。没有手补最终Actor JSON，测试确认不冒充人类批准。正式CLI来源→Actor verifier通过，warnings与sourceIntegrityErrors为空。source-review.json中收据GBK读取错误仅修UTF-8序列化，已通过的语义断言不丢失，不重演模型/原生操作。

## 检查、安装与浏览器边界

受影响整合 **842 pass / 0 fail / 5670断言 / 47文件**；生成器安全回归 **286 pass /1293断言**；V12静态门禁及治理 **19 pass/145断言**，不声称V12运行通过。package与全仓类型、构建通过；架构1309模块/3101依赖无违规；anti-overfit26来源通过。旧Curse形状比较因内容图标随不同正文变化而失败，明确只规范展示img，DC/Activity/Effect及其他完整机械结构仍比较；不改图标匹配。新测试readonly fixture的类型失败只改为不可变构造，9个相关回归及类型复验通过；没有重跑无失效理由的全仓CI或战斗矩阵。

Lab旧PID6156已退出、30001无监听，首次安装守卫在任何写入前停止。按既有本地启动权限启动同一Mirror，新PID37608/Administrator/127.0.0.1:30001/Core14.368/dnd5e5.3.3/cor-cotn/noBackups；没有新Lab、升级、备份、停止或重启。服务保留常驻，启动CLI会话33504保留。两次开发/最终安装各只写scripts/index.js，各有独立收据；最终JS SHA `c019f1efaa1acbbbd61f1a8a86d889d321e791b87fa4f96efd5e4acd03f8b744`，16 candidate/installed/HTTP一致。

最终Chrome批次 `forge-reference-definitions-native-20261012` 已回传：实际6.1-sol/medium/danger-full-access与目标/JS一致。旧tab不在库存，同官方会话新建owned tab651343842、保护五个其他页面。一次正常导入创建Actor.073645de90dd0d94及Macro.314b8061e4b9f83a，完整status/alerts无错；一次刷新后同Actor/Macro和12 Item ID、传记全文、五组代表参数、Sargassum/Death原生GM指引保持。父控复核公开artifact逐字段等于期望、实际文本/ID读回及三张可读代表图，原生范围VERIFIED。

精确清本批1Actor/1Macro各一次，两ID缺席，本次真实Actor287/Macro94完整集合恢复。清包前核b764包hash，清任务、Guard16/11/30/CR1/8、空来源、十设置无Key恢复，服务/tab保留。本批模型/翻译/审核/Key/活动/roll/战斗/时钟/控制器/服务操作0。北京时间2026-10-12 11:45:53至12:04:13，1100秒是UI验收与恢复开销，不并入生成耗时。收据SHA `9e213b2447e2fd8318419459398d1e2f66bf805d28671567ebf1199c18cd9cb2`，旧发现与原件保留，未改成全范围PASS。

## 包级说明发现与限定修正

原生验收发现包级note说Seed Terror和Steal Passion“仅暴露一个通用活动”，实际Steal Passion有CHA15 Save及两个Utility。该说明还把本包未匹配的复杂组合误写成恐慌/束缚/震慑等状态不在目录内。Actor数值/活动正确，说明需要按实际产物修正。

只修同一包级正文槽：Seed区域/目标自选及结果GM处理，Steal保留原生豁免、特殊后果GM处理；状态列表保留，说明本包复杂组合交GM。首次编辑删掉状态列表被既有术语保护拒绝，保留列表后通过；没有放宽任何保护。公开prepare/本地修正/测试批准生成新包 `1c7dbf13ea8c127a38eaeffc4bd536dbb6567808294ace978bc4a3a1daca99b0`，sourcePackageHash仍45baec...c817，0模型。

新旧整份Actor逐字段相等，artifactHash均 `c366378318ab53b619769b000dff88e1b851d892ec86168f69bf2efa038c57d2`；宏名称、command/hash、bindings、covers亦逐字段相等。旧b764包及原生证据不覆盖；新产物和组件复用证明在`.local/forge-reference-definitions-20261012/package-note-correction/`。没有源码/构建/数值/机制改变，原导入/刷新/清理证据按这些精确组件复用。

补读回 `forge-reference-definitions-note-preview-20261012` 已完成并经父控复核。正常UI导出新包SHA精确匹配1c7dbf...99b0，公开Actor逐字段等于新本地产物及前批Actor，规范hash仍c366...c57d2；正常UI固定command及宏名称/hash/bindings/covers逐项相等。新句实际可见，旧onlyUtility及“不在目录”句消失，四状态名称保留；完整notes文本与可读截图已检查。

本批0导入/世界文档创建删除/刷新/AI/翻译/审核/Key/探测/活动/战斗/时钟/控制器/服务操作。清预览前再核新hash，当前任务清空、Guard/空来源/十设置无Key保持，Actor287/Macro94完整集合不变，服务与tab651343842保留。北京时间2026-10-12 12:13:41至12:17:33，231秒为纯显示验收/恢复，不并入生成耗时。收据SHA `6e371028d35926fe9a67f7e914bf2365eb7a52b023af829ba98e734efc9bb010`，父控公开产物/组件/全文/状态/截图核证通过；没有重复原生导入来验证一条说明。

本轮技术交付与限定验收已完成；当前可用海鬼婆为同源续跑并经核源的候选。全新提取对目标自选豁免的表示仍可能阻断、自然语言译义仍须GM核对，两者未被绿色测试或续跑掩盖。原始失败、旧有发现和全部12次模型请求保留；付费AI审核默认关闭。主区与任务分支未提交/合并/push，手册与功能改动均留在当前工作树。

手册更新传记查看、精确标题/角色显示及PDF换行范围，相关条目人工核对后生成根工具手册.html，最终33项check通过；没有缩小watch。既有手册file:策略拒绝继续NOT_EXECUTED，不另起服务或换通道。当前唯一进度入口见[计划最新续记](../plans/2026-10-11-forge-first-pass-optimization.md)。
