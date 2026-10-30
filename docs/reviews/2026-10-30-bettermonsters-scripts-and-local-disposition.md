# BetterMonsters：诊断源码与 .local 保留、删除建议

2026-10-30。用户原话：“那就先把82份文档归档到master，物品和种族那两行改动先别合。再核对4个诊断脚本和.local，给我具体的保留、删除清单，先不删BetterMonsters这个worktree。”

82份原文已在 `4e9e624e603c2f57a44a25eac3c1214e1f4fbf90` 归档并合入本地master，35验收/17计划/30调研，共678037字节，全部Git blob与源文件hash一致。14份CRLF与2份末尾空行原文保持；140个本地链接中86个在归档处可定位，54个通过[归档索引](2026-10-30-bettermonsters-archive-index.md)定位到原工作树现存证据。旧日期、失败、停止/权限及未实施范围保持。本轮不把旧计划当作当前指令。

以下均为**具体处置建议，未执行删除**。源根为 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample`。物品/种族provider的两行改动保持未提交、未合入；四个诊断脚本也没有合入或运行。源码、原答、失败、ZIP与世界均未修改，没有新增模型请求、Foundry/浏览器操作或push。

## 四个诊断脚本

| 原目录 `tests/diagnostics/` 下的文件 | 判断 | 具体理由 |
|---|---|---|
| `forge-broad-rule-audit.ts`，208行/23434字节 | 保留原位 | 208行独立规则、错误提案及正确对照完整输出比较；不是共享helper的单纯副本。保留为历史显式诊断源码，未证明可直接用于当前政策。 |
| `forge-native-mode-audit.ts`，25行/2731字节 | 可列入删除候选 | 25行正式链导出器，无独立机械断言；三个代表用例由主线native attack modes测试覆盖，原160条离线链报告及源/IR/Actor导出仍在.local保留。 |
| `forge-weird-semantics-audit.ts`，186行/20151字节 | 保留原位 | 186行，除重复假provider链外还有条件伤害、时机、替换、状态边界及错误值/漏文探针。未证明独立检查已全被主线覆盖，保留其诊断定义，暂不并入当前CI。 |
| `forge-weird-statblock-audit.ts`，156行/16192字节 | 保留原位 | 156行，包含特殊属性块/OCR/来源头、能力库存及漏文变异的完整报告逻辑；主线已有对应回归，但未证明该历史诊断定义整体冗余，保留原源码。 |

三个“保留”指保留诊断定义和历史来源，不等于它们已经适配当前生成保留政策或可以直接接进CI。两个旧weird脚本的假provider/组装链与现有helper重复，但还有独立的语义判断、错误提案及漏文探针；本次没有充分证据把整份源码判废，也不因其曾有失败就删去检查。

建议删除的native-mode脚本只做现有fixture的公共链回放和文件导出。主线[原生攻击模式回归](../../tests/forge-native-attack-modes.test.ts)覆盖其三个代表用例；原 `.local/forge-native-semantic-repair-20261018/final-matrix/` 的160条历史离线链结果，以及spear/half-hp/swarm三套source/IR/MD/Actor仍保留。本轮仅核对现有源码和实际保存件，不把旧160/160追认为今天重新运行通过。

四文件的绝对路径、大小、SHA-256与理由另见证据根的 `diagnostic-script-dispositions.json`。不在本次文档提交中混入脚本迁移、重构或超时修复。

## .local 全部文件的处置

已逐文件清点并计算SHA-256：**16848个文件，3198685307字节，约2.98GiB**。建议保留 **16536份，2853788008字节，约2.66GiB**；删除候选 **312份，344897299字节，约328.92MiB**。

| 删除候选类别 | 文件数 | 字节数 | 判定依据与实际损失 |
|---|---:|---:|---|
| 旧Bun安装与下载包 | 2 | 136846953 | 现存Lab Bun 1.3.14 exe已读回同字节；旧zip仅含该exe。exe有现存同字节副本，zip作为安装缓存舍弃，不声称保留zip自身原字节。 |
| 隔离试验scratch编译缓存 | 7 | 73769318 | 仅7个 `.debug.pile` 缓存；保留候选module、authority、原输入和各组报告。不是整棵隔离试验目录可删。 |
| 已有ZIP内同字节的解包副本 | 77 | 28999978 | 77个成员全部从现存保留ZIP直接读取并核对hash。删除后旧解包目录不能直接运行，历史复验须先从指定ZIP恢复对应文件。 |
| 重复编译bundle | 19 | 91327739 | 19个副本逐项读回另一份现存保留文件，同SHA-256；清单保证保留位置本身不在删除候选中。 |
| 已归档调研对应的外部抓取 | 46 | 6228211 | 46个公开工具README/issue/源码/仓库清单抓取；报告、来源URL/版本manifest保留。明确舍弃历史抓取字节，不伪称可再次下载同字节。 |
| 旧进度输入JSON | 161 | 7725100 | 161个已读为task-progress输入的旧JSON，仅hash、进度项和证据指针结构，不是模型答复/Actor文件。原始对话goal/transcript状态快照不按此规则处理。建议舍弃这些旧进度输入本身，引用对象各自独立处置。 |

外部抓取范围为 `forge-comparable-importers-20261013` 中24个上游文件/页面、`forge-timeout-research-20261015` 中7份原始公开资料、`forge-pdf-research-20261017` 中15个外部文件/库存。保留各组自己的研究manifest、下载来源记录、结论和本地读取器故障输入/输出。这里按材料的剩余用途判断，不以“唯一副本”要求永远保留公开网页抓取，也不把用于Actor核源的D&D原文/PDF一起判废。

其余保留对象包括：真实及固定注入的原始回复、来源文本/原页、IR/Actor、首次失败与后续结果、卡面/配置截图、独立语义诊断数据、不同版本冻结ZIP、不能以现存同字节资料替代的候选/执行源码。它们并不全是真实模型答复；合成反例与真实首答的历史标签保持。

具体例子：`forge-damage-upgrade-real-ai-20261019/ordinary/reply-01.json`、`forge-staged-manual-20261013/saved-r8/`、`forge-rounds50-20261018/round-*/first/artifacts.json`、`forge-staged-manual-20261013/historical-artifacts/`均保留。隔离试验使用真实Neogi首答与原文，故其authority、报告和不同候选module也保留，只建议清除scratch编译缓存。

## 精确逐文件清单

每条记录都有绝对路径、相对路径、大小、原SHA-256、处置、理由；重复副本另有现存保留位置/hash，ZIP另记成员与保留archive的hash。清单不以通配符授权整个目录删除。

- [保留清单，16536行](H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-bettermonsters-archive-and-disposition-20261030/local-retain.csv)
- [删除候选清单，312行](H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-bettermonsters-archive-and-disposition-20261030/local-delete-candidates.csv)
- [四个诊断脚本清单](H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-bettermonsters-archive-and-disposition-20261030/diagnostic-script-dispositions.json)

本仓库内另有[摘要与99个顶层文件组统计](2026-10-30-bettermonsters-disposition-summary.json)。完整清单是本地证据元数据，没有把原回复、PDF、候选源码或配置复制进仓库，也没有创建备份。

## 已核实范围与执行边界

- 16848文件全量SHA-256、文件名/大小库存；1347份保留/冻结/基线/manifest类JSON可解析并用于识别精确引用，不能仅按目录名判断缓存。
- 1份旧 `forge-fresh-cloaker-20261016/install-receipt.json` 是截断的非完整JSON，原件保留，不把它解析为成功证明，也不为“修报告”重写历史文件。
- 81份现存ZIP均可读取；解包副本77项和直接文件副本19项已独立读回核对，没有为凑保留位置新建副本。
- 保留清单中5840份属于被引用/冻结对象；对外部研究抓取与旧进度输入作了明确的低价值舍弃判断，不把所有manifest提及都当永久保留要求。
- 本轮没有执行四脚本、重跑历史功能矩阵或新模型；不是16848份内容逐一重做机械/语义验收，也没有宣称保留的旧脚本全部兼容当前主线。
- 当前没有实施清理或测文件独占锁；未来若批准删除，需在具体文件上重核路径、hash、保留副本和使用者，再按精确清单操作。部分旧解包路径将失效，已在副本理由中明示；不可直接整目录删除，更不删除BetterMonsters worktree。

本轮归档/报告不改变用户生成入口、输入/输出、版本、操作步骤或安全限制。Ruler检查复用本轮未变化的规则源结果；手册保留38项完整覆盖，按本次文档合并流程核对。原件与基线的最终读回、提交和合并日志在同一证据根。
