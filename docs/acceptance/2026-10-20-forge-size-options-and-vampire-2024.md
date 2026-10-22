# Forge：2024多体型选择修复与Vampire同源续测

日期：2026-10-20。用户授权修复Medium or Small，完整保留体型选择，再用同一份2024 Vampire继续测试；正式链通过后直接实机验收，零新增真实模型调用。沿用当前worktree，不发布、升级、备份或修改世界数据库。前批[2024首跑失败](2026-10-20-forge-vampire-2024-retest.md)及其收据保持原样。

## 多体型支持：VERIFIED

原生Actor只有一个当前体型，来源可以明确允许多个选项。修复复用Canonical identity的`size`与`sourceSize`：size是来源集合中的当前值，sourceSize保存完整字面选择。facts模式按独立来源头部补入程序拥有的注记；合法普通完整IR使用同样来源校验，不要求模型逐项抄录来源证明。

独立头部识别支持英文/中文两项和多项明确选择，包括`Medium or Small`、`Tiny, Small, or Medium`、`中型或大型`及带引号结构化头。每个合法选项都可作为当前值，不固定取第一个。所有来源声明必须给出同一集合，当前值必须属于它，显式字面注记必须与完整来源相同；未知、重复、and并列、区间、矛盾声明及集合外当前值继续拒绝。正文中的变形与攻击目标尺寸不能提供基础选项，swarm成员尺寸仍与Actor整体尺寸独立；旧Colossal特批映射没有扩大到普通选项。

renderer把完整选择、当前体型和GM选择边界写入Markdown和Actor可见传记，并保存既有presentation metadata。最终verifier分别核对程序注记和实际可见文本，删除、缩短或篡改选项，或只保留metadata，都不能通过。它不自动改变体型、不新增变形效果，也不限制GM在生成后的原生卡片中自行编辑其他字段。

改动在`packages/intake-ai/src/source-size.ts`、`staged-source-facts.ts`、`staged-extraction.ts`、`provider.ts`、`renderer.ts`、`validator.ts`、`verifier.ts`，以及CanonicalMonster的字段说明。没有新增schema或依赖，没有删掉旧守卫；来源、合法选择和输出保留条件都有明确检查。新独立安全入口是`bun run test:forge-size-options`。

## 实际检查

本轮全部命令使用task-local Bun1.3.14。

| 检查 | 实际结果与边界 |
| --- | --- |
| 多体型正式链/严格反例 | 29 pass / 0 fail / 207断言；4种来源形式、9种合法当前选择到renderer/workflow/Actor，含CRLF、swarm、注记和可见字段篡改 |
| 既有staged兼容回归 | 261 pass / 3 skip / 0 fail / 1253断言；仅兼容回归，不作2024规则基准 |
| packages类型；新测试独立类型 | PASS；0新增测试诊断 |
| 局部anti-overfit | 8生产路径PASS，最终两处类型/畸形值防护再验2文件PASS |
| Forge browser build、manifest与禁止依赖检查 | PASS；只构建本地候选，未安装 |
| 独立静态审查 | 初增量及最终两处防护未发现具体P1/P2；没有替代执行证据 |
| 包整合架构门禁 | architecture:verify PASS；1483 modules、3947 dependencies，无违规及循环 |
| 手册同步与生成页面 | 7条人工review，build/check 33项PASS；生成HTML解析读回PASS |

最终防护修改了来源validator，故补一次最终同源Vampire重测。先前续测日志保留，不把重复次数充作独立样例。前批初始与局部中间失败也保留。

## 同一2024 Vampire续测：整只仍FAIL

原fixture及source均未改：fixture SHA `6242db718f8df5efa98190ff93453787881151b8f1485ef15eae76fa20e7331d`，source SHA `fa4306f92887058775d167f201e7c96e19de45f4dd545482e1917bad9a40c2b5`。Medium or Small、巢穴XP10000/11500、传奇抗性和传奇动作3/4模式等内容完整保留，没有为通过选择或编造巢穴模式。

`bun run test:forge-vampire-2024`最终仍0 pass / 1 fail，正式报告needs_review，但实际已经从前批source/base两次fake推进到source/base/whole-feature三次fake，base为SOURCE_VALIDATED，11项能力已进入整批适配。真实模型HTTP为0。现在的实际整源阻断为：

| 能力 | 实际错误 |
| --- | --- |
| Misty Escape | `V2_HEALING_TARGET_UNSUPPORTED` |
| Bite | `V2_HEALING_SOURCE_RELATION_UNSUPPORTED` |
| Charm | `V2_SPELLCASTING_COMPONENT_CONFLICT` |
| Beguile | `V2_SPELLCASTING_GRANT_UNSUPPORTED` |

这些错误现已由正式whole-feature路径返回，与此前基于未接受base支架的inspector线索分开记录。其余7项局部组装仍不能计为整只生成、最终产物或实机通过。没有把字段改成null、删除治疗/施法限制或放宽来源校验以清除错误。

本次修复和验证限于多体型；以上四处其他能力适配没有随之修改。没有正式IR、rendered Markdown、Actor或整包，故按用户指定门禁，2024 Vampire的安装、导入、活动使用、资源消费及刷新验收均NOT_EXECUTED。没有安装此次构建，也没有创建或修改世界Actor/Token/Macro/聊天；没有启动新浏览器批次或服务。既有共享Mirror保持运行。不能用体型29项通过或browser build通过宣称2024 Vampire已可用。

## 可追溯记录

- 本轮目录：`.local/forge-vampire-2024-size-fix-20261020/`；初始92项既有dirty/untracked仅存路径/hash清单，不创建副本或备份。
- worker最终结果：`size-options-worker-result.json`，SHA `5d07b9cb8fb3f7084fde3f759442e67336298f702bd341602d6e40adf8583c96`；其10路径hash和各局部检查日志保持。
- 最终Vampire收据仍写在同源重测目录：`.local/forge-vampire-2024-retest-20261020/vampire-2024-current-chain-2026-10-20T10-53-14-456Z.receipt.json`，含完整source/base/form/正式report/plan/transport/inspector，父控逐项重算hash并核对真实阶段和错误。
- 前一次续测为同目录`2026-10-20T10-49-11-265Z`前缀；最终日志为新目录`vampire-after-size-final.log`。前批首跑`2026-10-20T09-09-10-499Z`及红色结果不改。

当前MD、README、支持矩阵与手册按“多体型已修、Vampire能力阶段仍阻断”维护，不将历史2014接受提升为当前支持。最终汇总收据另存本轮目录，记录源码、检查、文档、冻结保护与未执行实机层。

最终保护核对为PRESERVATION_PASS：343份冻结文件、4份历史语料及2024 fixture保持；初始92项既有dirty/untracked中81项未变，11项仅为本轮已授权修改。worker的10项实施hash与当前一致；整源收据的16项源码hash及8项结果文件已逐项重算。共享Mirror仍为PID30932/127.0.0.1:30001；已安装脚本SHA `506845d93f353679b3612f2fa7c84a725907b116730189046db3bbc94bf2ddc9`，本次构建脚本SHA `89efe2c892eed31821a91339d09b457bc19d1669195c2a123bf2f45551ec787d`，未安装本次构建。最终汇总收据：`.local/forge-vampire-2024-size-fix-20261020/size-fix-final-receipt.json`。没有以文档收尾宣称完整产品或运行时验收完成。
