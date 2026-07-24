# cor-cotn 世界体量与引用审计

日期：2026-07-24
目标：Foundry VTT `14.364`、dnd5e `5.3.3`、本地世界 `cor-cotn`

## 结论

静态审计和最终 Excel 决策工作簿已通过机械验证与人工语义抽样。性能基线严格记录为 `partial`：磁盘层已测量，初始化、Canvas/GPU 与持续运行三层因规定的 in-app Browser 不可用而明确阻塞。它不是清理执行，也不是完整运行时性能证明。

最重要的结论是：

1. 771 个 Actor 中有 349 个没有有效 Scene Token，但完整引用扫描后只有 2 个仍是 `no-detected-reference` 候选；“不在地图上”与“没有检测到任何引用”差异很大。
2. 检测到 533 个 Token 指向缺失 Actor，涉及 104 个 Scene 和 44 个缺失 Actor ID；这是当前最高优先级的完整性风险。
3. 415 个 JournalEntry 包含 734 个 Page。正文分类得到 20 个 mixed 页面、306 个 Latin-only 页面和 408 个 no-text 页面；不能把后两类统称为“英文正文”。
4. 世界级静态引用还指向 2,289 个在复制世界中缺失的 world-local 素材；另有 1,188 个现存、未检测到引用的 world-local 素材候选。素材清理主要影响磁盘和传输，不能直接等同于降低浏览器堆内存。
5. 最终 Excel 工作簿已完成并绑定当前证据；性能基线只完成磁盘层，因此本报告不声明浏览器冷启动、Canvas/GPU 或持续运行内存已经测量。

本次没有删除、归档、迁移或修改任何世界文档、资产、Setting、用户记录或 Compendium。

## 安全边界

- 原世界在审计前已停止：项目本地端口无监听，未发现指向 exact `server-mirror` 的 Foundry 进程。
- CLI 持有原世界全部集合的 `LOCK` 文件，只复制快照；ClassicLevel 仅打开经过哈希验证的快照。
- 原世界复制前后树哈希一致。
- 第一次临时运行因监听到 `::` 而被主动拒绝；仅停止该次自有 PID，并从原世界重新创建内容一致副本。验收运行只监听 `127.0.0.1:30002`，结束后自有 PID 已停止且端口已释放。
- 原世界树和 `options.json` 在临时运行前后哈希不变；临时运行没有修改原世界、认证、用户或密码。
- manifest 最后发布，列出的 7 个证据文件全部通过独立 SHA-256 复核。
- `remoteAccessed=false`；没有访问远程 `8080`、`51020` 或其他生产实例。
- 玩家姓名、Journal 正文、Macro 源码、密码、认证字段和秘密未进入本 tracked 报告。

详细对象 ID、字段路径和样本哈希只保存在 ignored local evidence。

## 世界体量

完整复制世界树为 1,824,483,516 bytes。主要 LevelDB 集合如下：

| 集合 | 顶层文档 | 内嵌文档 | 数据库 bytes |
| --- | ---: | ---: | ---: |
| Actors | 771 | 7,713 | 15,875,230 |
| Scenes | 295 | 52,367 | 29,901,821 |
| World Items | 1,430 | 462 | 5,852,876 |
| Journals | 415 | 734 | 1,373,148 |
| Chat Messages | 335 | 0 | 26,268,717 |
| Fog Exploration | 401 | 0 | 18,008,803 |
| Settings | 1,576 | 0 | 3,204,159 |
| Users | 7 | 0 | 1,587,101 |
| Combats | 19 | 91 | 428,086 |
| RollTables | 12 | 118 | 23,465 |
| Macros | 89 | 0 | 21,320 |

Actor 内嵌项进一步分为：

- Actor Items：6,337；
- Actor Item Effects：1,341；
- Actor Effects：35。

Scene 内嵌项包括：

- Tokens：2,836；
- Walls：32,993；
- Lights：3,367；
- Drawings：1,049；
- Tiles：281；
- Regions：45；
- Templates：37；
- Notes：2；
- Sounds：3。

其中 2,835 个 Token 能归入有效 Scene，1 个 Token 是显式报告的 orphan embedded record。Actors 和 Scenes 还存在少量其他 orphan embedded children；这些属于结构完整性风险，不能用父数组为空掩盖。

## Actor 引用与候选

| 指标 | 数量 |
| --- | ---: |
| Actor 总数 | 771 |
| 有有效 Scene Token | 422 |
| 无有效 Scene Token | 349 |
| 完整扫描后 `no-detected-reference` | 2 |
| Player protected | 696 |
| Structured use | 424 |
| UUID/link use | 126 |
| Possible script reference | 73 |
| Manual review required | 14 |
| Chapter shared | 30 |

状态可以重叠，因此状态行不能相加为 Actor 总数。

真实 Journal 使用了 legacy Foundry `@Actor[ID]{label}` 链接。raw snapshot 中共有 334 次出现，去重后形成 274 条引用边；报告与 raw unique edges 一一相符，缺失和额外边均为 0。其中 158 条指向现存 Actor，116 条保留为 unresolved target。加入这些真实链接后，候选从缺陷版本的 11 个收敛为 2 个。

这 2 个候选通过了当前覆盖范围内的负向检查：没有 incoming verified edge，状态只有 `no-detected-reference`。它们仍然不是自动删除授权，因为静态扫描不能证明运行时按名称查找、第三方模块私有序列化或动态生成绝对不存在。

## Token / Actor 完整性

| 指标 | 数量 |
| --- | ---: |
| Broken Token/Actor rows | 533 |
| 缺失 Actor ID | 44 |
| 受影响 Scene | 104 |
| Linked Token | 497 |
| Unlinked Token | 36 |
| Broken rows 中的 delta Items | 106 |
| Broken rows 中的 delta Effects | 8 |

人工抽样从 snapshot 原始 Token 读取 `actorId` 和 delta structure，并与报告行逐字段核对：缺失 Actor 判定、Token/Scene 归属以及 delta 数量一致。

这些行应先由用户决定 `Restore Reference` 或 `Needs Review`，不能与 unused Actor candidate 合并处理。

## Journal、页面、语言与模块

| 分类 | 数量 |
| --- | ---: |
| JournalEntry | 415 |
| JournalEntryPage | 734 |
| mixed 页面 | 20 |
| Latin-only 页面 | 306 |
| no-text 页面 | 408 |
| text 页面 | 454 |
| image 页面 | 240 |
| video 页面 | 1 |
| Calendaria 自定义页面 | 39 |

20 个 mixed 页面分布在 4 个 JournalEntry；这些页面同时含 CJK 与 Latin 字符，所以没有被错误标成纯 CJK。另有 39 个 Calendaria 页面、2 个其他模块所有权页面和 693 个 core 页面。

人工语义抽样核对了：

- 含 CJK 的 Journal；
- mixed 页面；
- image/no-text 页面；
- Calendaria 自定义页面。

抽样读取原始 Page 但只记录内容哈希和分类布尔值；tracked 报告没有正文。

## 章节归属

章节分类共覆盖 66,639 个可分类文档或内嵌对象：

| 分类 | 数量 |
| --- | ---: |
| Explicit chapter | 560 |
| Chapter shared | 31 |
| World common | 7 |
| Player content | 696 |
| Test / temporary | 10 |
| Unclassified | 65,335 |

置信度分布为：

- high：717；
- low：124；
- none：65,798。

人工抽样分别复核了 high、low 和 chapter-shared 对象。High 只接受显式章节 Folder/名称、Scene↔Journal 结构化链接或 Actor 在已分类 Scene 中的实际使用；资源或文本推断保持 low。大量 unclassified 是结果，不应被强行按近似名称归章。

## Compendium、Adventure 与 Module

盘点得到 5 个 world pack 条目：1 个 Adventure、2 个 Item pack 和 2 个未声明物理 pack。

既有 Adventure 样本在 world manifest 中已声明且物理目录存在。Task 4 直接只读打开快照中的该 pack，记录数为 0，因此它目前只能证明载体存在，不能证明章节打包样本已经可用。

后续建议：

1. 每章一个 Adventure：适合 Scene、Actor、Journal、RollTable 等关联文档的整体存档和受控导入；
2. 普通 Compendium：适合跨章公共 Actor、Item、Macro 等，但跨类型引用更脆弱；
3. 独立 Module：适合长期分发和版本管理，维护成本最高。

在修复 broken references 并完成人工 Keep/Archive 决策前，不应自动把当前世界拆成任何一种载体。

## 素材

| 素材状态 | 数量 |
| --- | ---: |
| 现存且被引用的 world-local 素材 | 914 |
| 被引用但在复制世界中缺失的 world-local 素材 | 2,289 |
| 现存且未检测到引用的 world-local 候选 | 1,188 |
| External module 引用 | 1,669 |
| External system 引用 | 264 |

人工抽样核对了一个现存被引用 world-local 素材、一个现存未引用候选和一个 external module 素材。External module 素材没有被误列为 world-local 删除候选。

2,289 个缺失素材引用是独立的数据质量问题；它们可能来自迁移后旧路径、已卸载模块或真正缺文件，不能直接用批量删除引用来“修复”。

## 性能基线状态

当前状态是 `partial`，没有用服务端启动成功替代浏览器层验收：

1. 磁盘层 `measured`：源树与快照均为 1,824,483,516 bytes；受 LOCK 保护、哈希核验的内容一致复制耗时 5,345.705 ms。
2. 初始化层 `blocked`：隔离副本上的 Foundry `14.364` / dnd5e `5.3.3` 已在 `127.0.0.1:30002` 返回 HTTP 200，日志显示目标临时世界完成加载；但规定的 in-app Browser 后端返回不可用且浏览器清单为空，因此没有取得浏览器导航、响应聚合、网络字节或浏览器内存字段，本层不升级为 measured。
3. Canvas/GPU 层 `blocked`：无法通过规定浏览器进入已认证活动 Scene，因此没有 Canvas/GPU 样本。
4. 持续运行层 `blocked`：无法执行固定 idle 区间与短操作序列，因此没有持续运行样本，也不作长会话结论。

没有改用其他浏览器，没有重置认证、用户或密码，也没有访问远程实例。数据库字节、文档数量、Scene 复杂度与服务端 Working Set 只能描述静态体量或服务端进程，不能替代浏览器性能结论。后续补测仍必须使用内容一致的临时世界副本，不能运行或修改原始 `cor-cotn`。

## 验收层级

机械验证通过：

- CLI 正常退出；
- manifest-last 发布；
- 7/7 数据文件 SHA-256 一致；
- 原世界复制前后树哈希一致；
- 顶层和内嵌 key 数量与真实 LevelDB namespaces 对账；
- duplicate full identities 为 0；
- `remoteAccessed=false`；
- 性能 baseline schema 验证通过，磁盘层为 measured，其他三层为 blocked；
- 最终工作簿导出后重新导入，16 个 sheet 名称与顺序一致，80,273 个详细行、16 个决策验证范围和 `Keep / Delete / Archive / Restore Reference / Needs Review` 词表均保留；
- 工作簿公式错误扫描为 0，16 个 sheet preview 全部重新生成；最终文件为 3,395,177 bytes，SHA-256 `5d4502c7956ccbe1c3947769be56fc7cb9e06fbfb51d659b388ac657a108566a`，manifest 精确绑定该文件。

人工/语义验收通过：

- Scene-referenced NPC；
- User-bound character；
- Journal legacy Actor link；
- 无 Scene 但有其他有效引用的 Actor；
- 真 `no-detected-reference` 候选；
- duplicate-name/manual-review Actor；
- CJK、mixed、image/no-text、Calendaria 页面；
- high、low、shared chapter；
- broken Token/Actor 与 delta structure；
- empty Adventure sample pack；
- referenced/unreferenced/external 三类素材；
- legacy links raw unique edges 与报告 274/274 对账；
- modern verified UUID 正向控制；
- sensitive field 和 User 非 character 引用负向控制。
- Overview 明确显示性能总体 `partial`、磁盘层 `measured`、其余三层 `blocked`、`remoteAccessed=false` 和阻塞原因；
- 16 个工作表预览已逐一生成；Overview、详细对象表和 User Decisions 保持可读，决策列仍是受控词表而不是自由清理指令。

仍未完成：

- 初始化、Canvas/GPU 与持续运行三层浏览器性能采样；
- 任何清理、修复、归档、章节打包或生产操作。

## 决策顺序

1. 先复核 533 条 broken Token/Actor rows 和 orphan embedded records；
2. 再人工检查 2 个 Actor 候选，决定 Keep、Archive、Delete 或 Needs Review；
3. 单独处理 2,289 个缺失素材引用和 1,188 个未引用素材候选；
4. 在 in-app Browser 可用时补完内容一致临时世界的三层浏览器性能采样；
5. 最后再决定章节 Adventure / Compendium / Module 的实际迁移方案。

本报告不替用户填写任何删除决定。
