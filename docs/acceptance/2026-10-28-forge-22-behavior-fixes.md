# Forge 22 项行为失败续修与验收

日期：2026-10-28。实施依据：[修复计划](../plans/2026-10-28-forge-22-behavior-fixes.md)、[逐项复审](../reviews/2026-10-28-forge-22-behavior-failures-review.md)、[消融实验](../reviews/2026-10-28-forge-22-plan-ablation.md)。

## 结果与限制

原 B01–B22 已逐项闭合：22 个原失败测试均实际通过对应修复后的检查，四个窄组共 55 个不同测试名通过。产品改动按机制覆盖缺字段、不同表示与配套失败；没有改冻结原答或手修最终 Actor JSON。独立审查发现的 3 项 P2 均补修并经同一审查者复核关闭。

根 `typecheck:all` 退出 0，架构检查、10 个受影响生产源码的局部 anti-overfit 及 Forge 构建通过。三个受影响的前轮保留能力回归组通过。**这些结果不表示全仓 CI 通过。** 较宽入口另暴露 10 个范围外既有行为断言失败，已确认修改前同样失败，原件保留；其产品含义尚未逐项复审，不能一概视为无害旧测试。

Mirror `14.368 / dnd5e 5.3.3` 经 Forge 普通上传、预览、GM 确认实际导入 5 个 Actor、1 个有效宏，刷新后配置保持。5 个 Actor 的完整保存产物哈希刷新前后相同。任务 Actor、包宏及唯一观察器均精确清理，原世界七类集合、时间、暂停及活动场景恢复。没有投骰、Use/Cast/Apply、自动扣费或治疗结算验收。

原样缺传奇台账仍为 0 次，保留能力并明确提示；本轮没有把它自动修成 3 次。缺治疗目标保留 Heal 和完整正文，使用待 GM 确认的目标/范围；这不等于未知目标规则已能自动执行。明确字段继续保留。

本轮新增发现、生成、AI 内容复核、纠错、翻译服务请求均为 0；无提交、合并或推送。既有 12 类修复、107 条类型修复及全部冻结证据保留。

## 工作树与证据

- 工作树：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261019-forge-ab-fixed-replies`。
- 分支：`codex/20261019-forge-ab-fixed-replies`；HEAD 保持 `5dc5702767bbcb0818a05a02e45c925289e66758`。
- 证据根：`H:\CodexData\visualizations\2026\10\28\01a18034-1e26-7870-8d8b-041ab59fa313\forge-22-behavior-fixes`，下文缩写为 `E/`。
- 开工登记 2715 个既有仓库文件、672 个受保护前序证据文件；没有源码副本、文件切换或备份目录。
- 逐项原测试名与最终日志对应：`E/case-closure.json`。最终修改范围、原件保持及 Git 状态：`E/final-validation.json`。

## 逐机制实施

| 原编号 | 实际变化与验证 |
| --- | --- |
| B01 | fresh 回复的伪造历史先清除，再执行程序补齐；有/无伪造记录 × 有/无省略字段四组均正确，原答不变；真实补齐记录经正式候选序列化和恢复保留 |
| B02–B09 | 复用现有离线 staged 格式转换，将完整 IR 送入当前公开 factory 和正式 workflow，不重建旧 provider；中性攻击、明确半伤、同池消费、Vampire ID/名称、自身目标、无虚构 Heal 均保留；四项缺目标/身份反例真正生成保留操作和伤害的 Actor，并明确 needs_review |
| B10 | 逐宏隔离本地化失败并传播 finding；包级核对失败保留 Actor，不准备未经核对的宏；翻译记录缺失/被丢弃但已有中文保存产物时，按实际 Item 名称唯一绑定及同一 256 字符上限检查；主名和 gm-activity-lock 额外名均覆盖，原宏记录保留 |
| B11 | 支持的 stunned 保留在自身操作字段，正式生成真实 Effect 及 Activity 链接；不要求它退成正文。未知/局部字段问题仍单独处理 |
| B12、B14、B19 | 来源语义负例改用既有显式离线 source audit，默认 binder 继续负责绑定及候选保留；攻击模式、created-entity 条件和 Cylinder 各维度的原断言保留 |
| B13 | 保留旧 Brass 快照与哈希，明确新增 Sleep Breath 两个 GM 模板及链接；验证阶段条件、状态、600 秒时长、原活动归属；只剔除这两处增量的历史视图仍严格匹配旧完整哈希，当前完整 Actor 匹配新版哈希 |
| B15、B16 | 当前完整输入提供明确目标正控，原样缺目标另测。缺目标在 flat、SourceOP、混合载体均留问题与原缺字段事实，实际 Heal 使用 any、数量未定、spec 范围及 GM 说明；明确 self/creature/any 保持，verifier 继续检出目标/范围/公式漂移 |
| B17、B18 | 默认结构校验与显式来源审计分测；DC 99 仍被来源审计检出；未知 review 字段仍由 INVALID_STRUCTURE 和准确路径检出，没有执行注入字段 |
| B20–B22 | 三份原样缺台账保留 0 次及传奇操作，并给 LEGENDARY_BUDGET_UNSPECIFIED；完整结构正控保留基础 3/巢穴 4；明确 0 单列提示，基础 0/巢穴 1 与恢复规则也贯通 parser 和 Actor，未重复配置同池 consumption |

Company 原测试中后置的旧 Midi 整卡 throw 预期，也按当前已存在的局部保留契约核对：具体警告、完整活动和声明字段保留、安全隔离不变。真正伤害值被改成 99 的 verifier 反例仍检出，未为旧测试恢复整卡拒绝。

Brass 旧哈希为 `64f9db3b1f98a83a2b8b79836084b588befb6c6623f23614d1c51b09cc03367e`，当前官方效果版为 `7c9f0548c4762cebd3eea2d1a12bcd10927f72c489d4408318d939bcee209255`。用于断言的历史视图只是测试内副本，不作为生成或交付产物。

## 独立审查与补修

独立只读审查 `/root/review22_independent` 先报告问题，实际补修后再次读取代码与反例日志复核，最终没有新的实质发现。父代理落盘的转录收据为 `E/review-independent.json`，不把该文件说成审查者写入或执行的测试。

| 审查发现 | 修复与证据 |
| --- | --- |
| P2：入口接受基础 0/巢穴 1，parser 仍要求基础正数而丢台账 | 仅专用传奇台账的基础值改为非负整数，巢穴仍正数；`healing-resource-zero-lair-red.log` → `healing-resource-all-representations-final.log`，另核 LF/CRLF、恢复 marker 与非法巢穴近反例 |
| P2：SourceOP 和混合载体绕过缺目标提示，补出 any 或 creature/1 | 入口用既有 candidateReview 保留缺目标事实，混合 fallback 移除无依据的单生物数量；同源 flat/SourceOP/mixed 正式链及明确 any/self 控制通过。失败原件 `healing-resource-sourceop-red.log`、`healing-resource-mixed-red-r2.log` 保留 |
| P2：保存中文 Actor 的缺记录分支漏 256 上限 | 正常投影与保存产物分支共用长度检查；主名及额外名 256 通过、261 仅排除对应宏，完整 Actor/原宏记录保持；`macros-limit-red.log` → `macros-seven-final.log` |

审查没有找到“已有来源证明自身、但旧消费者没填 target”导致 CLI/v12/独立 Item 新回归的具体证据；不以泛化担忧追加问题，也不把这个局部核查扩大为那些入口的全量运行时接受。

## 实际检查

| 检查 | 最终结果与日志 |
| --- | --- |
| `test:forge-behavior-fixtures` | 5 pass / 0 fail / 83 expect，`fixtures-after-review.log` |
| `test:forge-behavior-contracts` | 13 pass / 0 fail / 398 expect，`contracts-r4.log` |
| `test:forge-healing-resource-boundary` | 30 pass / 0 fail / 174 expect，另含原 Node assert，`healing-resource-all-representations-final.log` |
| `test:forge-behavior-macros` 对应窄组 | 7 pass / 0 fail / 72 expect，`macros-seven-final.log`；使用同一 hermetic 包装、真实仓库 cwd 和禁网 preload |
| 根类型 | `types-final-r2.log`，exit 0；首次 7 条本轮新类型错误及原日志保留，已按真实类型/存在性修正，没有 any/ts-ignore 或缩小范围 |
| 架构 | `architecture-final.log`，exit 0 |
| 局部 anti-overfit | `anti-overfit-final.log`，10 个实际受影响生产源码通过 |
| 前轮 content / generation / delivery 保留回归 | 分别 17/122、10/310、17/151，均 0 fail；`forge-preservation-*-integration.log` |
| Forge 正式构建 | `build-final-r2.log`，成功；生产擦除式类型修正前后运行 bundle 完全同字节 |

没有在每个修正后重复已通过矩阵：补元数据品牌和存在性类型时只复验根类型；生成器/入口/台账/宏行为实际变化后才补对应小组。前轮稳定的 Resolver、官方状态施加、其他世界与长时证据没有重跑。当前 10 源码 anti-overfit 与三组保留回归对应共享入口的真实修改，不是全仓 CI。

## 10 个额外既有失败

首次较宽入口发现 7 个 empty-fields/vulnerability 断言、2 个 Unicorn/Spirit Naga 原回复等价断言和 1 个普通 stale-localization 断言失败。它们不在原 B01–B22 中，本轮没有顺带修改这些断言。

- 前九项通过只在内存逆转 B01 的 provider 改动做定点对照；读取的 provider 字节哈希与开工基线严格相同，九个失败名完全复现。没有切换磁盘文件、建源码副本或重复已过样本。
- stale-localization 在宏改动前后均为 needs_review、`LOCALIZATION_PROJECTION_INCOMPLETE`，原语言完整 Actor 哈希同为 `d0f8eedbb8f2285a969b4f084893a472daf92209e451165ba98952fb3aea980b`。
- 清单、原始日志和比较见 `E/additional-failures.json`、`root-extra-baseline.log`、`root-extra-baseline-source.json`、`macros-result.json`。

这里确认的是“修改前也失败”，尚未判断这十项是否全部只需更新测试。它们仍是范围外待复审结果，不用窄组绿色掩盖。

## Mirror 实际配置与持久化

目标为 `http://127.0.0.1:30001`、`F:\FoundryLab\foundry-v14\data\server-mirror`、`cor-cotn`。现有 readiness 工具在确认 Mirror 已停止后启动既有实例；原生 MCP 实际读回世界身份、Core `14.368`、dnd5e `5.3.3` 及既有 NPC。Next 保持 `30002 / PID 62924`，未操作。

Forge 0.5.1 本地候选 17 个文件核对，仅替换 owned module 的 `scripts/index.js`；其 SHA-256 为 `e15017e37f01f8b0bf12269489db02ff1cb7427a27e07c7be23006e0bf35dff2`。未升级 Core、系统、其他模块或重启已有服务。安装清单及前后哈希见 `E/mirror-candidate-install.json`。

Chrome 同任务执行器 `/root/chrome_executor22` 从实际 turn_context 核对 `gpt-6.1-sol / medium / danger-full-access`，使用当前官方 Chrome 扩展的浏览器 DOM/API 表面，未改为桌面坐标、CDP 或注入执行。所有脚本均经普通 Macro UI 导入/编辑，产品数据经普通 Forge 文件入口及 GM 确认导入；观察器仅取证和精确清理，不代替产品创建。

| 样本 | 实际导入与刷新结果 |
| --- | --- |
| War Cry 原样缺目标 | Heal `any`、数量未定、`spec`、目标及范围 GM 提示；2d10+5 temphp 保留，原有 recharge 消耗保留 |
| Aboleth 明确自身 | 自身目标/范围、1d10 healing 保留；原生 MCP 另核原始 Item 的 self/count=1 |
| Kraken 原样缺台账 | 原生 legact.max=0，能力及缺台账提示保留，未声称已恢复可用 |
| Lich 明确台账 | 基础 max/value=3、巢穴开启、巢穴内 4 次说明保留；未启动控制或消耗资源 |
| 已保存中文 Actor 的坏翻译记录 | 中文 Actor 保留；坏翻译记录与旧英文名宏分别列问题；只导入实际匹配的 matching-control，旧 control 未导入、未启动 |

`configuration`、`after-refresh` 两次共 5 个 Actor 的完整保存产物哈希严格相同，唯一包宏始终为 matching-control。父代理另经原生 MCP 读取 War Cry/Psychic Drain 实际 Item 字段，核对 GM 范围及公式。证据：`mirror-runtime-before-cleanup.json`、`mirror-runtime-final.json`、`mirror-parent-readback.json`、`mirror-mcp-war-cry.json`、`mirror-mcp-aboleth.json`。

系统准备后的 self 目标数量为 null 是 non-scalar 派生表示，原始保存值仍为 1；父最初的读回断言误要求派生值也等于 1，已用原生 Item 数据补证，只修读回解释，没有重导入或改产品。

浏览器下载事件未交付取证文件时，只修观察器的只读 JSON 导出层，保留原两条记录；不重新导入、刷新或业务 capture。最终经正常只读文本框提取并存私有 JSON，原清理前文件未覆盖。截图留在该执行器的官方工具记录，不声称已有独立 PNG 文件。

## 清理与最终边界

清理前安排第三次 `before-cleanup` 读回，再按明确 packageId/记录 ID 精确删除 5 个测试 Actor 和 1 个包宏；基线已有对象未触碰。原世界 Actor/Item/Macro/Scene/Combat/Message/Folder 七类集合、时间、暂停及活动场景的整体哈希恢复：

`5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535`

`baselineEqual=true`，剩余 owned Actor/Macro 均为空；父核对最终文件的原两条记录、cfg 和 baseline 与清理前文件严格相同。之后才通过普通 UI 删除唯一观察器 `pTNws90HBaEfdFkT`，目录精确名称匹配为 0，再关闭本任务 tab；其他 Next 页面保留。

Mirror `30001 / PID 57908` 和 Next `30002 / PID 62924` 均继续监听。MCP 的 ready 结论对应验收时实际 GM 页，不把关闭该任务页后说成 Bridge 仍持续连接。没有生产操作、长时运行、战斗结算或真实模型质量验收。

手册已按本轮实际入口、输出提示与限制同步，具体 review/build/check 日志及原件保持结果见 `E/final-validation.json`。Git 尚未发布，后续提交、合并或推送仍需另行明确授权。
