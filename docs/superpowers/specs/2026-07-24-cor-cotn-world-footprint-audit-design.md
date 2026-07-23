# `cor-cotn` 世界体量、引用关系与章节归属审计设计

## 1. 目标

对项目本地 Foundry VTT 镜像中的 `cor-cotn` 世界进行一次完整、只读、可复核的审计，回答以下问题：

1. 世界中哪些文档和运行时内容会增加 Foundry 初始化、Chrome 内存、场景加载或长时间游玩的压力；
2. 每个 Actor、Journal 及其他可清理文档当前被什么对象引用；
3. 哪些对象没有检测到有效引用，因而可以作为删除或归档候选交给用户决定；
4. 每个对象位于什么完整文件夹路径，并可能属于哪个章节；
5. 章节内容适合制作成 Adventure、普通 Compendium，还是独立 Module；
6. 后续清理完成后，如何用同一套基线验证实际性能变化。

本次审计只生成证据、清单和建议。任何 Actor、Journal、Scene、Token、Item、Chat Message、Fog、Compendium、素材或世界设置均不得在本阶段删除或修改。

## 2. 环境和边界

- 审计对象：`.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn`
- Foundry 运行时：`14.364`
- dnd5e：`5.3.3`
- 远程 8080 和 51020 均不在本次范围内；不读取或修改生产世界。
- 静态数据库审计只能在本地 Foundry 未占用对应 LevelDB 时进行。
- 如需启动本地 Foundry 采集初始化基线，只能通过 Foundry 公共运行时读取数据；不得通过运行中的 LevelDB 目录直接写入。
- 详细世界清单可能包含玩家名、角色名和自定义内容，应保存在被 Git 忽略的 `.local/foundry-v14/evidence/` 下。
- 设计文档、实施计划和不包含大批量世界正文的摘要可以写入 `docs/`。

## 3. 已确认的初步事实

以下数字用于限定审计范围，不代表最终清理结论：

| 分类 | 当前初步结果 |
|---|---:|
| 顶层 Actor | 771 |
| Actor 内嵌 Item | 6,337 |
| Actor 内嵌 Item Effect | 1,341 |
| Actor Effect | 35 |
| Scene | 295 |
| Scene Token | 2,836 |
| 被至少一个 Scene Token 引用且仍存在的 Actor | 422 |
| 未被任何 Scene Token 引用的顶层 Actor | 349 |
| Scene Token 中出现、但 Actor 列表中已不存在的 Actor ID | 44 |
| 涉及上述缺失 Actor ID 的 Token | 533 |
| JournalEntry | 415 |
| JournalEntryPage | 734 |
| 检测到中日韩文字的 Journal | 13 |
| 未检测到中日韩文字的 Journal | 402 |
| Calendaria 专用 Journal 页面集合 | 39 |

数据库初步体量：

| 数据库 | 约占用 |
|---|---:|
| Scenes | 58.4 MB |
| Actors | 31.3 MB |
| Chat Messages | 26.3 MB |
| Fog Exploration | 18.0 MB |
| World Items | 5.9 MB |
| World Settings | 3.2 MB |
| Journals | 2.7 MB |
| Users | 2.4 MB |
| Combats | 0.4 MB |

数据库字节数不能直接等同于 Chrome 堆内存。最终报告必须分别说明磁盘体量、客户端初始化负担、活动场景 Canvas/GPU 负担和持续游玩期间的累积风险。

## 4. 审计方法选择

采用“世界体量 + 引用关系 + 章节归属”的完整审计，不采用只列 Actor/Journal 的窄审计，也不把一次浏览器性能采样当作清理结论。

完整审计由四层组成：

1. **静态体量层**：统计各世界集合、顶层文档、内嵌文档、文件夹、数据库字节和复杂度指标；
2. **引用图层**：解析结构化 ID、UUID、嵌入链接和保守的脚本字符串引用；
3. **章节归属层**：依据文件夹、名称、场景/Journal 链接、资源路径和显式章节证据归类；
4. **性能基线层**：记录清理前的本地冷启动、浏览器内存和活动场景复杂度，为清理后的同条件对比提供基线。

## 5. “使用中”和“未使用”的定义

“未使用”不能只等同于“没有出现在地图上”。每个对象按以下状态分类：

- `used-structured`：被明确结构化字段引用，例如 Scene Token 的 `actorId`、User 的 `character`、Scene Note 的 Journal 引用或 RollTable 的文档结果；
- `used-uuid`：在 Journal、描述、宏或其他文本中出现有效 UUID/文档链接；
- `possible-script-reference`：只在 Macro 或模块配置的脚本文本/字符串中检测到 ID、UUID 或名称引用，无法静态证明实际执行；
- `player-protected`：被用户绑定、玩家拥有或属于当前玩家角色；
- `chapter-shared`：跨多个章节被引用；
- `broken-reference-target`：引用指向已经不存在的对象；
- `no-detected-reference`：在本次覆盖的结构化和文本引用源中没有检测到引用；
- `manual-review-required`：存在重名、模块自定义页面、无法解析的字段或其他不确定性。

只有 `no-detected-reference` 才能进入删除候选表，但报告必须明确：脚本按名称查找、运行时动态生成和第三方模块私有序列化可能无法由静态扫描完全证明。因此最终删除决定始终属于用户。

## 6. 引用图覆盖范围

引用扫描至少覆盖：

- Scene → Token → Actor；
- Scene → Note → JournalEntry/JournalEntryPage；
- Scene 内嵌 Token Delta、Item 和 Effect；
- User → Character；
- JournalEntry/Page 正文中的 `@UUID`、文档链接和显式 ID；
- Macro 命令文本中的 UUID、文档 ID及可疑名称引用；
- RollTable Result → Actor、Item、Journal、Scene、Compendium 文档；
- 世界级 Item、Actor 内嵌 Item 和 Effect 的来源、目标及 UUID；
- Combat → Scene、Combatant → Actor/Token；
- Playlist、PlaylistSound 与 Scene 的关联；
- Folder → 子 Folder 和文档；
- Adventure/Compendium 中记录的源文档与导入关系；
- 已知模块字段中的文档引用，特别是任务、日历、动画、Levels、Monk、MIDI-QOL、DAE 和 Sequencer 相关状态；
- 世界 Settings 中能够安全识别的文档 ID/UUID，未知模块私有字段只记录，不擅自解释。

报告必须区分“已验证结构化引用”和“字符串层面的可能引用”，不得把模糊字符串命中作为确定使用，也不得把没有字符串命中作为绝对安全。

## 7. Actor 审计

Actor 明细每行至少包含：

- Actor ID、名称、类型；
- 完整文件夹路径；
- 所有 Scene 引用、Token 数量和场景名称；
- 是否被 User 绑定及所有权情况；
- Journal、Macro、RollTable、Item、Combat 和模块字段引用；
- 内嵌 Item、Effect 数量；
- 来源 Compendium、创建/修改时间和可用的来源元数据；
- 重名数量和疑似重复组；
- 章节归属；
- 引用状态、建议状态、风险说明；
- 用户决策栏。

当前 349 个无 Scene 引用 Actor 必须全部进入明细，但不能在尚未完成其他引用扫描前统称为“可删除”。

“凯瑟琳”等 Character 必须显示完整文件夹路径，不得只显示 Folder ID。缺失文件夹或悬空 Folder ID 必须显式标记。

## 8. 悬空 Token 与缺失 Actor 审计

44 个缺失 Actor ID 和涉及的 533 个 Token 单独成表，至少包含：

- 缺失 Actor ID；
- Token ID、Token 名称、所在 Scene ID/名称；
- `actorLink`；
- Token Delta 是否存在及其结构状态；
- 是否能在本地运行时打开 Token/Actor Sheet；
- 是否可能通过 Adventure/Compendium 重新导入恢复；
- 建议状态和用户决定栏。

这类问题不得与“未使用 Actor”合并。它们代表场景引用完整性风险，可能比删除冗余 Actor 更优先。

## 9. Journal 审计

Journal 明细按 JournalEntry 和 Page 两层输出，至少包含：

- JournalEntry/Page ID、名称和完整文件夹路径；
- Page 类型；
- 文本、图片、PDF、视频或模块自定义页面分类；
- `CJK-present`、`Latin-only`、`mixed`、`no-text` 等可复核语言标签；
- Calendaria、Simple Quest 或其他模块所有权；
- Scene Note、Journal 链接、Macro、任务和模块字段引用；
- 章节归属；
- 删除、归档和模块禁用风险；
- 用户决定栏。

“未检测到 CJK”不得直接写成“确定为英文”。空页面、纯图片、代码、其他拉丁字母语言和模块数据必须单独分类。

由于当前已确认存在 13 个含 CJK 的 Journal，“如果不存在非英文 Journal 就删除全部英文 Journal”的前提不成立。402 个未检测到 CJK 的 Journal 仍需逐项审计。

## 10. 其他有删除或归档意义的分类

完整审计还应覆盖：

### 10.1 Scene

不替用户删除地图，但输出每个 Scene 的：

- 完整文件夹路径和章节归属；
- Token、墙、灯光、瓦片、绘图、区域、模板、音效、Note 数量；
- Token 内嵌 Item/Effect 数量；
- 背景图、前景图、视频和音频资源；
- 估算的初始化、活动 Canvas 和 GPU 风险；
- 是否适合进入某章 Adventure；
- 跨章节引用和缺失引用。

### 10.2 Chat Messages

统计消息数量、时间范围、体量、嵌入 roll/workflow 数据以及可能的模块持久状态。报告删除旧聊天记录的收益和会丢失的游戏记录，但本阶段不删除。

### 10.3 Fog Exploration

按用户和 Scene 统计体量，说明重置后会丢失玩家探索历史。Fog 只能作为单独、高风险的用户决策项。

### 10.4 World Items、RollTables、Macros、Playlists、Combats 和 Cards

分别统计顶层文档、引用、文件夹、章节归属和无引用候选。Macros 与 RollTables 即使体量很小，也必须作为引用源参与 Actor/Journal 删除判定。

### 10.5 Folders

解析所有完整路径、空文件夹、悬空父文件夹和文档指向缺失 Folder 的情况。Folder 本身不作为主要性能收益来源。

### 10.6 World Settings 与模块

统计体量异常的 Setting、启用模块数量、已知预加载资源、Hooks、持续效果和模块持久状态。未知设置只报告键名、大小和所属模块，不直接删除或改写。

### 10.7 静态素材

建立“被引用、可能被字符串引用、未检测到引用”的素材清单。静态素材清理主要用于磁盘和网络管理，不得默认宣称能降低 Foundry JavaScript 堆内存。

### 10.8 Compendium 与 Adventure

盘点世界级 packs、文档类型、条目数量、引用关系和现有 Adventure。特别检查现有 `Adventure-BxzlyiYWyXYyz9XI` 是否可以作为章节打包样本。

## 11. 章节归属

每个可归类对象赋予以下之一：

- 明确章节；
- 多章节共享；
- 世界公共内容；
- 玩家内容；
- 测试/临时内容；
- 无法归类。

章节归属证据按可靠度排序：

1. 明确章节 Folder 或对象名称；
2. Scene 与 Journal 的显式链接；
3. Actor 在章节 Scene 中的实际引用；
4. 素材路径和命名；
5. 文本内容或近似名称推断。

只有前三类证据可以作为高置信归属。后两类必须标记为推测并交给用户复核。

## 12. 章节打包方案评估

报告比较以下三种方式：

1. **每章一个 Adventure**：适合同时保存 Scene、Actor、Journal、Playlist、RollTable 等关联文档，并在导入时由用户确认；
2. **按文档类型拆分普通 Compendium**：适合公共 Actor、Item、宏或资料库，但完整章节需要多次导入，跨文档引用更脆弱；
3. **每章一个独立 Module**：适合长期分发和版本管理，制作、维护和升级成本最高。

默认推荐方向是：

- 每章一个 Adventure；
- 跨章节共用 Actor、Item 和其他公共内容进入独立公共 Compendium；
- 玩家角色和当前游戏状态不进入章节 Adventure；
- 最终方案必须在引用图完成后再次确认，避免同一 Actor 被多章重复导入。

本次审计只做适用性判断、章节边界和风险报告，不创建正式 Adventure 或 Compendium。

## 13. 性能基线

在不修改世界的前提下记录清理前基线：

- Foundry 服务启动时间；
- 浏览器从进入世界到可操作的时间；
- 初始化阶段主要网络响应和数据量；
- Chrome 标签页/进程内存；
- 可取得时记录 `performance.memory`；
- 活动 Scene 的 Token、墙、灯光、瓦片、纹理与动画复杂度；
- 控制台错误、重复警告和可能的持续循环；
- 初始静置后的内存；
- 在固定、短时、可复现操作后的内存变化。

本次基线用于比较冷启动和初始内存，不替代后续“玩一段时间后逐渐卡顿”的长时间性能测试。

## 14. 交付物

详细交付物保存在：

`.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/`

至少包含：

- `cor-cotn-world-audit.xlsx`：用户主要审阅表；
- `summary.md`：结论、风险、优先级和建议；
- `inventory.json`：机器可复核的完整统计；
- `references.json`：引用边及证据类型；
- `chapter-classification.json`：章节归属和置信度；
- `baseline.json`：清理前性能基线；
- `unresolved.md`：无法静态判定的对象和原因。

Excel 至少包含以下工作表：

1. `Overview`
2. `Actors`
3. `Unused Actor Candidates`
4. `Broken Token Actor Refs`
5. `Journals`
6. `Journal Pages`
7. `Scenes`
8. `World Items`
9. `Macros and Tables`
10. `Playlists and Combats`
11. `Chat and Fog`
12. `Settings and Modules`
13. `Compendiums and Adventures`
14. `Assets`
15. `Chapter Classification`
16. `User Decisions`

面向仓库的简要报告写入：

`docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md`

该摘要不得复制大批量世界正文或个人数据。

## 15. 验收标准

### 15.1 机械验证

- 所有顶层和内嵌集合计数与 LevelDB 键分类一致；
- Actor、Journal、Scene、Token、Item 等 ID 唯一性和引用边可复核；
- 文件夹路径能够从文档追溯到根；
- Excel、JSON 和 Markdown 统计互相一致；
- 每条删除候选均包含引用扫描结果和证据状态；
- 本地世界目录在审计前后的树哈希/受控元数据检查没有发现审计造成的内容修改；
- 远程实例没有被访问或修改。

### 15.2 语义验收

- 用户能从 Actor 表直接看出“对象是谁、在哪个文件夹、被哪里使用、为什么列为候选”；
- “无地图引用”与“无任何检测到的引用”严格区分；
- Journal 的语言、页面类型和模块依赖不被混为一谈；
- 章节归属给出证据和置信度，而不是只按名称猜测；
- 性能结论明确区分磁盘、初始化、活动场景和持续运行；
- 报告不会自动替用户决定删除；
- 章节打包建议能够解释 Adventure、普通 Compendium 和独立 Module 的取舍。

只有机械验证和人工语义检查都通过，才能将审计称为完成。

## 16. 审计后的决策流程

1. 用户在 Excel 的决策栏标记保留、删除、归档、恢复引用或待确认；
2. 根据用户决定生成独立的清理实施计划；
3. 清理只在本地副本上执行；
4. 清理后重新运行同一审计和冷启动基线；
5. 用户确认世界行为、章节内容和玩家数据无误后，才讨论远程应用；
6. 章节 Adventure/Compendium 的制作作为清理之后的独立实施阶段。
