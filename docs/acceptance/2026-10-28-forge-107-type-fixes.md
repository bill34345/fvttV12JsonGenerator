# Forge 107 条既有类型错误修复与验证

日期：2026-10-28。状态：107条类型错误修复完成，根类型检查0错误；局部行为检查发现的22项既有失败另列，未扩大修复生产实现。

用户原话：

> 行，按报告顺序修这107条

其后用户提醒：

> 刚才codex断了，你注意下子任务可能并没有真正处理完全

范围按[根因报告](../reviews/2026-10-28-forge-107-type-errors-root-cause.md)和[修复计划](../plans/2026-10-28-forge-107-type-error-fixes.md)。沿用原worktree，HEAD仍为 `5dc5702767bbcb0818a05a02e45c925289e66758`。没有提交、合并或推送，没有新增生成／复核／纠错／翻译模型请求，没有操作Foundry或重装模块。

## 完成结果

按报告先修契约，再修共享helper／入口，最后整理固定数据。31个原报错文件均保持原功能测试目标；生成器、prompt内容、配置接口、tsconfig及冻结fixture没有新增修改。

| 根因 | 原错误数 | 修复 |
|---|---:|---|
| R01 provider配置 | 22 | 明确api-key；缺reviewModel的调用填原fixture model，保留原缺省回退的元数据行为；原先显式值不改 |
| R02 禁网fetch形状 | 6 | fetch与preconnect均明确拒绝真实网络；同类已有double cast及helper原生preconnect转发一并在测试边界收紧 |
| R03 版本断言与历史锁 | 3 | 两当前测试对照v52；历史实时诊断仍精确锁v39，不因类型修复解锁请求 |
| R04 契约假设 | 8 | prompt已知分类与内部unclassified分开；proof逐形状核来源；finding准备完整evidence投影；伤害反例补base关系 |
| R05 品牌／unknown | 9 | 固定sourceId走公共工厂；hash仍逐字完整比较；未知Actor在测试边界收窄后核完整内容 |
| R06 存在性 | 26 | 固定键记录准确构造，必需成员明确断言存在，可选报告按公开语义处理；不靠可选链吞缺失 |
| R07 数据推断 | 10 | tuple／as const、readonly复制及准确fixture行类型；保留故意破坏值与完整相等断言 |
| R08 helper类型 | 20 | provider、翻译服务与进度端口提供上下文；拆开压缩声明，使用真实返回类型；没有新增any或改业务策略 |
| R09 图标API层 | 3 | workflow使用iconOptions；直接ActorGenerator移除不被读取的顶层iconMode，保持已有图标责任边界 |

根 `bun run typecheck:all` 使用Bun1.3.14，最终退出码0。完整根tsconfig仍包含tests／diagnostics，strict和noUncheckedIndexedAccess保持。首次整合余3条broad-rule声明错误，修正后根检查通过；最终收据 `types-final-result.json` 明确记录退出码，不以“子代理编辑完成”或仅有启动行的日志作通过证据。

v52的prompt测试起初仍用空creature回执，先于版本断言被拒；改用已有有效fixture，并核对当前可缺省容器、空账本和官方状态模板三段实际规则后更新过期内容断言。生产prompt未改，旧失败日志保留。

## 局部行为检查

证据根E：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-107-type-fixes`。

新增的四个局部入口沿用 `runHermeticFoundryScript`，按本次变化选择用例，不改变原全仓入口。各组有交叠，不相加为独立测试总数。

| 检查 | 实际结果 | E中证据 |
|---|---|---|
| 契约、版本、proof与输入准备 | 82 pass，0 fail，633断言 | `contracts-final.log` |
| provider／输出边界 | 28 pass，3既有fail，298断言 | `callers-final.log` |
| 技术operation ID存在性定点补验 | 1 pass，0 fail，5断言 | `identity-final.log` |
| helper及固定规则表 | 22 pass，17既有fail，124断言 | `helpers-r1.log` |
| 数组、blueprint、持久存储fixture、状态及coverage | 8 pass，0 fail，100断言 | `fixtures-r1.log` |
| 首次过宽筛选带入的额外旧来源审核 | 2既有fail；失败记录保留，未改其断言 | `phase1-contracts-r1.log` |

行为检查没有运行旧live诊断脚本或写旧证据目录；诊断源码的改动由完整类型检查、diff和独立复审核对。已有Mirror生成／配置／刷新证据在生产未变时复用，没有重做世界测试。

## 22 项行为失败的归属

不能因为类型清零而把行为测试写成全绿。为确认本次编辑是否引入失败，先核对9个相关测试／helper在类型修改前的源码与HEAD一致：4项原字节hash相同，5项仅LF／CRLF换行不同，HEAD换行转换后的完整hash与原工作树基线精确相同，再用Bun模块加载器把这些HEAD源码读入内存。生产代码仍使用本任务当前未改变的版本；没有切换／回写源文件，没有备份或重写冻结输入。

只复验失败的22项，得到相同22项失败；加载收据逐项记录9个实际拦截模块及源码hash；换行对照另存 `baseline-source-equivalence.json`。原失败名称与基线失败名称集合完全相同，没有本轮新增失败。见 `baseline-behavior-loader-r3.json`、`baseline-behavior-r3.log`、`behavior-baseline-comparison.json`。这证明失败早于类型编辑，不证明这些失败无害，也不把它们归为已修。

| 失败组 | 数量 | 已观察事实与保留边界 |
|---|---:|---|
| Brass冻结产物hash | 1 | 当前hash与旧固定hash不同；原期望不改。需另按字段差异定位，不能重算期望掩盖 |
| 新回复的空字段整理记录 | 1 | 缺reactions被补齐后，normalizedEmptyFields未留下预期记录；既有执行顺序导致，未改产品 |
| 状态退文字旧预期 | 1 | 断言要求stunned出现在正文；当前明确操作状态保留机制不按该旧预期追加正文 |
| ordinary传奇资源 | 3 | 旧普通测试链未出现预期legact最大值；分步对照通过；真实原因和当前产品含义需另核 |
| ordinary治疗目标 | 2 | 旧普通测试链缺目标说明或目标类型不同；分步对照通过，未借类型维护改规则 |
| bind阶段的旧拒绝预期 | 3 | 旧测试要求bind直接抛出来源语义错误；当前绑定与来源审核分离，未改成伪绿 |
| Company／Vampire旧whole-form协议 | 8 | 固定回复端口、旧协议或预期不匹配；报错中的network字样由provider包装假端口异常产生，没有真实模型请求 |
| candidate review旧阻断断言 | 2 | 旧默认validator被要求返回特定阻断；本轮只记录失败，不恢复整只Actor阻断 |
| 双语运行绑定256字符 | 1 | 旧测试要求整包reject；当前局部隔离保留结果，未改产品或短截名称 |

上述是失败现象和本次范围判断，不是对22项全部作出的最终业务正确性裁决。完整失败名称附在本文件末尾，便于后续单独审阅。

## 中断恢复、独立复审与保护

Codex恢复时，原实施代理显示pending_init。父代理先中断其待运行状态，再核对实际3文件diff：修改已落盘，但没有验收日志，因此只认编辑存在。后续各实施代理列出已改与未验证项，所有类型及行为结果由父统一运行确认。

独立只读复审逐项检查本轮差异：未发现删除／缩减断言、改冻结hash、放宽strict、解除v39锁、禁网退化或生产范围漂移。复审只对代码负责，没有把其未运行的类型／测试结果认作通过；最终根执行收据补齐这一层。

保护基线登记2710个仓库文件与542份旧证据。最终核对生产实现、冻结fixture与542份旧证据不变；允许变化限于31个原报错文件、4组安全测试入口、本轮说明和手册开发条目同步。手册watch不缩减，生成HTML由原构建器产生。没有重写旧复审报告或前轮验收的历史失败。

归因辅助层的失败均保留：第一次模块加载filter过宽，返回空值导致loader报错；修正精确filter后22项已复现，但Bun测试退出未触发预期exit收据，随后只补这22项及逐模块读回。比较器最初把Bun结尾重复的失败摘要计了两次，修正为唯一测试名称比较，无需重跑行为。这些辅助问题不算产品故障或通过证据。

完整最终状态、独立复审记录、hash与手册检查在E的 `final-validation.json`、`independent-review.json` 和 `handbook-final.log`。全仓CI／覆盖率没有运行，也没有宣布全部行为测试通过。

## 保留的行为失败名称

1. empty fields and vulnerability: fresh model cannot forge program completion history while its original reply is preserved
2. explicit legacy whole-form compatibility; current full-IR controls compare projection only > Company and current full-IR replay retain neutral attack and explicit outgoing half through the formal chain
3. explicit legacy whole-form compatibility; current full-IR controls compare projection only > a neutral attack and native Save share one source pool while the damage follow-up consumes nothing
4. explicit legacy whole-form compatibility; current full-IR controls compare projection only > historical SRD 5.1 Vampire Bite uses stable id and self without a fabricated Heal
5. explicit legacy whole-form compatibility; current full-IR controls compare projection only > historical SRD 5.1 Vampire Bite uses stable name and self without a fabricated Heal
6. explicit legacy whole-form compatibility; current full-IR controls compare projection only > historical SRD 5.1 Vampire identity findings survive in a useful unaccepted candidate: missing-target
7. explicit legacy whole-form compatibility; current full-IR controls compare projection only > historical SRD 5.1 Vampire identity findings survive in a useful unaccepted candidate: unbound-owner
8. explicit legacy whole-form compatibility; current full-IR controls compare projection only > historical SRD 5.1 Vampire identity findings survive in a useful unaccepted candidate: wrong-reference
9. explicit legacy whole-form compatibility; current full-IR controls compare projection only > whole Company preserves a missing creature target finding alongside the candidate without repairing the reply
10. formal source to localized encounter > rejects a bilingual runtime binding over 256 characters during preparation, without shortening source identity [review disabled]
11. input field policy: only inert empty effect lists are omitted; local operation issues retain their fields as GM notes without rejecting other operations
12. legacy combined attack compatibility > legacy compatibility cannot conceal missing, invented or simultaneous attack modes
13. new current first replies recover through the formal workflow without model calls > existing explicit-lair Brass retains its complete formal Actor artifact
14. round six narrow proof guards > a created-entity THEN attack retains its real bonus and origin without granting an unqualified attack
15. round5 full-source healing regression r14m-srd52-aboleth-psychic-drain ordinary
16. round5 full-source healing regression r14m-srd52-frost-giant-war-cry ordinary
17. source proof and inert candidate review are independent > closed review metadata is recognized on a spell group without suppressing its actual findings
18. source proof and inert candidate review are independent > review metadata cannot smuggle unknown fields or malformed findings
19. source-bound cylinder geometry and contextual GM operations > a Cylinder radius is proven separately from its height and placement range
20. third iterative repair r12m-srd52-kraken-toxic-ink ordinary
21. third iterative repair r12m-srd52-lich-deathly-teleport ordinary
22. third iterative repair r12m-srd52-sphinx-lore-weight-years ordinary
