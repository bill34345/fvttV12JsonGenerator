# Forge 本地提交、主线整合与 worktree 盘点

2026-10-30。用户原话：“我说的收尾是把这个分支该commit的commit，然后合并到master。之后看下还有哪些跟这个forge相关的worktree，他们要怎么清理”。初轮授权为本地提交与合并，以及清理评估；当时没有 push 或删除 worktree 的授权。后续明确删除授权及已执行结果见文末“同日最终接续”，其余较早段落保留各自时点。

## 提交与整合范围

沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支 `codex/20261019-forge-ab-fixed-replies`。

- 收尾前 topic HEAD 为 `5dc5702767bbcb0818a05a02e45c925289e66758`；149项未提交文件分为106项实现/对应测试与43项文档/完整提示词/手册。
- `c74b3f61` 提交保留机制、原生资源、类型/语言投影、接收和交付、完整IR提示词及对应回归。
- `36fd0a0a` 提交按时间保留的验收/失败、完整提取V54与显式纠错V44改稿、README和同步手册。
- 合并前 master 为 `68c522274f670bc3ab71f87d31c1de6219ffb0db`，双方分叉29/40项提交。先在 topic 吸收已提交 master，再从主工作区执行 fast-forward；不重写旧提交，不从其他 worktree 移动 master。
- 原始回复、旧错误产物、历史失败与限定成功层级均保留。完整提示词在 `docs/reviews/2026-10-29-forge-extract-v54.txt` 与 `2026-10-29-forge-repair-v44.txt`。

## 冲突处理与实际发现

1. 保留主线独立巢穴动作的位置修复，以及 Forge 的完整正文、语言、资源及能力保留逻辑。
2. Resolver 同时保留精确 `ForcedReplacement` 预写入恢复能力和提交后核验，以及 topic 的完整缓存维护、5.3.3 Effect origin 有界补偿和业务字段检查。事务反例覆盖保存 veto/no-op、旧flags精确恢复与错误补偿残差。
3. Custom Conditions 合并 `configuredConditions` 与主线 `capabilities`、`whenIdle` API，保留6.x版本门和5.3.3可选AC5e组合；不扩大空闲等待接口的职责。
4. 依赖同时保留 parse5 和主线 suite-handbook。模块说明随主线新的单一来源路径维护，Resolver新增说明合入本模块 `docs/manual.json`；根AGENTS、离线HTML均从源重新生成。
5. 生成器初次整合检查为270 pass／17 fail。逐项保留日志：主要是旧测试仍要求整只抛错、未知语言进入不可见原生列表，以及一个使用 `as any` 丢失必填属性的测试输入。修正测试后继续检查实际行为，未移除严格解析器对非法契约的拒绝断言；另外断言入口保留原字段、具体问题与已有Actor内容。
6. 上述核查发现两个真实漏报：英文翻译后的世界专属引用，以及无对应manifest组的多余来源键。恢复具体诊断，仍保留Actor、正文和可用施法组，不抛错取消整只。新增说明不代表异常清单已可在目标世界水合。最终生成组287 pass／0 fail／1367断言。

## 本次整合检查

| 检查 | 实际结果 |
|---|---|
| 冻结十答公共入口与完整Actor比较 | 十份IR、十份完整Actor均与类型修复后的最终基线严格相等，无字段排除；0网络、0真实模型请求 |
| `test:spell-resolver` | 547 pass／0 fail／2774断言 |
| `test:custom-conditions` | 203 pass／0 fail／1623断言 |
| `test:generation` | 最终287 pass／0 fail／1367断言，原失败与中间定位日志保留 |
| `test:forge-creature-type` | 16 pass／0 fail／96断言 |
| `test:forge-native-resource-language` | 43 pass／0 fail／181断言 |
| `typecheck:packages`、`typecheck:foundry-modules`、`typecheck:all` | 通过，保留测试与诊断源码范围 |
| Forge browser build／deterministic release package | 最终3 pass／0 fail／15断言；旧ZIP白名单漏列第三方许可证的失败已保留，新增精确许可字节检查 |
| `agents:check`、`handbook:check` | 34项指令层检查及38项完整手册同步通过 |
| `architecture:verify` | 1668模块／4782依赖，依赖边界及cycles检查通过 |
| 局部 `audit:anti-overfit` | 10份来源通过 |
| `bun install --frozen-lockfile` | 543包／460安装检查通过，无依赖变化 |

整合生成了新的组合，因此补上述相关检查；不重跑已通过的Mirror业务链，不将旧runtime接受自动推广给新组合。本次未安装整合构建、未新增Foundry/浏览器验收、未运行完整全仓CI，不声称所有历史测试绿色。旧provider与protocol失败保持各自记录。手册保留完整watch覆盖，逐项人工核对受影响说明后重新生成；合并前后均执行 `handbook:check`，最终结果保存在本次证据目录。

## 主工作区内容与配置规则

主工作区合并前 tracked工作区及索引均为空；42份原untracked文件逐项记录SHA-256，包括 `.omo`、三个既有输入及 `.worktreeinclude`。只允许 `.worktreeinclude` 成为tracked这一项状态变化，保留全部原文件字节，其余原untracked内容保持原状态；不stash、不自动提交其他内容。

用户问：“这个应该被git追踪吗？你评估下”。本次判断为应跟踪 `.worktreeinclude`：它只包含 `.codex/config.toml` 这一共享路径规则，不含真正配置、密钥或机器绝对路径。主区与topic的19字节完全相同，SHA-256为 `d9ac0c7bc6c3441638c2240ffc057dc34776cb22407856276e1a4346dd747a2d`；真正的 `.codex/config.toml` 继续由 `.gitignore` 忽略。旧提交 `adbbac53131a070ca578195b53b6ba49f1d0c9fb` 已解释该意图。[官方文档](https://learn.chatgpt.com/docs/environments/git-worktrees)说明该文件用于本机Codex管理的worktree携带指定ignored文件；“应入Git”是本次项目判断，并非官方强制要求。未复制配置，也未创建新worktree。

## 六个 Forge 相关 worktree 的处置建议

以下目录均在 `I:/OpenCode/fvttV12JsonGenerator-worktrees/`。表中数量为本次只读盘点时的实际Git状态；ignored范围仍有未逐文件核对的内容，不能称为可删除缓存。

| 目录 | 独有内容与状态 | 建议 |
|---|---|---|
| `20261019-forge-ab-fixed-replies` | 本次集成分支；有 `.local` 原始来源/回复/失败、audits、构建及依赖 | 保留。即使本地master已合并，也尚未推送，ignored证据和使用者未完成清理门禁 |
| `20261006-111625-bettermonsters-eye-deep-sample` | 4项提交已在本任务历史；2 tracked修改，87 untracked，其中86项文件尚无本次目标对应文件；`.local`有可靠性研究原件 | 保留。先分别评估Item/Species timeout补丁、82份历史文档及4个诊断源码；不能只看提交已集成 |
| `20261012-132706-forge-failure-review` | HEAD为master既有祖先；6 untracked含5份独有失败/可靠性文档，另有ignored | 研究归档候选，但原件保留位置尚未逐项读回，当前不删 |
| `20261016-104511-forge-intent-and-research` | 同一既有祖先；3 untracked含2份独有提案/研究，另有ignored | 研究归档候选；文档只表示当时提案，不当成已实现成果；当前不删 |
| `20261019-202102-forge-extraction-research` | 同一既有祖先；3 untracked含2份独有提取/A-B研究，另有ignored | 研究归档候选；当时未执行的A/B不改写为已验；当前不删 |
| `20261019-205102-forge-category-md-adapter` | 2 tracked包配置修改，4 untracked含适配器、测试与计划；旧v1适配器与当前v5不同，测试字节相同不证明整个目录冗余 | 保留。先做v1→v5语义差异及独有计划评估，再决定哪些内容应归档 |

`foundry-mcp-repair`、`foundry-mcp-readiness-review`、快捷键审计及Dream-Bane Nergaliid目录分别属于其他任务，不纳入Forge清理。

后续清理顺序建议：先处理三个纯研究目录的独有文档与ignored原件，再审BetterMonsters和category适配器中的独有代码。已有提交可达只证明Git内容保留；tracked dirty、untracked及ignored均须逐项确认外部现存保留位置或可重建理由。按worktree runbook，实际移除还要求精确对象授权、已集成且按授权推送、目录干净、无内容未知项和无人使用。此处只评估，不推送、不删目录或分支、不为清理制作备份。

本次证据根为 `H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-closeout-merge-20261030/`：基线、精确暂存清单、提交/整合/失败与最终检查日志、十答完整对照、worktree盘点以及最终主区/旧证据保护读回分别保存。不以Git收尾替代未执行的功能验收。


## 同日接续：九份历史文档归档与三个研究目录清单

用户原话：“好，先把这9份文档纳入主线，核对三个纯研究 worktree 的 .local，再给我具体的可删除清单。”本次仅归档、核对和提出精确删除候选；未推送、未移动或删除原文件/worktree/分支。以下结果更新前面初轮盘点中三个研究目录的保留判断，其余目录不变。

九份文档已在 `f27897c2f7069e2625c153db44376c006892846b` 保留原路径、原日期及原文全部字节；合并后可由本地master读回。该提交仅新增历史资料与两条精确路径的Git字节保留属性：一份CRLF原稿及一份末尾空行原稿不被自动正规化。不修改产品、提示词或历史验收结论。其“当前”“尚未实施”“停止”等表述属于各自原日期，不能取代[唯一当前状态](../plans/2026-10-20-forge-ab-current-state.md)，也不自动重启旧计划。逐文件大小/hash/原路径/处置见[完整机器可读清单](../reviews/2026-10-30-forge-research-worktree-retirement.json)。

### 历史研究索引

| 原研究目录 | 原文与当前关系 |
|---|---|
| failure-review | [任务减负](../reviews/2026-10-12-forge-ai-task-simplification.md)、[10月13日状态报告](../reviews/2026-10-12-forge-current-status.md)、[反复失败复盘](../reviews/2026-10-12-forge-repeated-failure-analysis.md)、[可靠性方向](../reviews/2026-10-13-forge-reliability-direction.md)、[系统性诊断](../reviews/2026-10-13-forge-systemic-failure-diagnosis.md)。保留当时的实际失败和研究；不把旧分步处理路线恢复为当前默认流程，不把过去“未修”自动视作今天仍存在。 |
| intent-and-research | [产品目标与实现参照](../reviews/2026-10-16-forge-intent-regression-and-implementation-references.md)、[基础能力恢复方案](../plans/2026-10-16-forge-native-basics-recovery.md)。研究与方案本身归档，不等于其逐项实施/验收完成；当前基础能力和GM边界以当前状态及其实际收据为准。 |
| extraction-research | [提取方式比较](../reviews/2026-10-19-forge-extraction-granularity-comparison.md)、[最小A/B方案](../plans/2026-10-19-forge-minimal-ab-plan.md)。两份原文在10月19日的“未执行”状态保持；之后各批A/B和最终完整IR流程分别记录，不能把后续实现倒写为旧研究当时已有的直接实验。 |

9份原文的68个本地文件链接在本次时点均可定位；若将来退役failure-review，`2026-10-12-forge-current-status.md` 中指回该旧目录的绝对链接，应通过本索引转到主线同名 `docs/reviews/2026-10-12-forge-repeated-failure-analysis.md`。原始文档不为清理而改写。BetterMonsters原证据/旧源码引用仍依赖其现存目录，未将它纳入本次退役建议。

### `.local` 的8个文件与具体处置

三目录均没有tracked修改，原HEAD `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281` 已是master祖先。23个untracked/ignored文件全部按路径、大小和SHA-256清点；其中9份文档已归档，3个include与3个本地config均读回主区同字节现存版本。配置仅核hash，未复制内容入库。

| `.local` 文件（相对对应worktree根） | 大小/类型 | 内容处置建议 |
|---|---|---|
| intent-and-research / `.local/forge-intent-checkpoint.json` | 3079字节，旧任务状态 | 可作为明确删除候选：旧意图/权限边界、状态、文档hash，所引原文已归档；删除会舍弃这份旧JSON本身，不声称可重建 |
| intent-and-research / `.local/forge-repair-plan-checkpoint.json` | 4038字节，旧任务状态 | 同上，旧“等待修改授权”属于当时任务，不能重启或阻止当前已授权归档 |
| extraction-research / `.local/forge-extraction-research-checkpoint.json` | 2733字节，旧任务状态 | 可作为明确删除候选：研究已完成/实验未执行的旧进度与文档hash；所引原文已归档 |
| extraction-research / `.local/forge-minimal-ab-plan-checkpoint.json` | 2554字节，旧任务状态 | 同上；原实验范围与调用预算仍保留在历史方案，不因此授权新实验 |
| failure-review / `.local/forge-reliability-research-20261013/5e-importer.md` | 9378字节，网页摘录 | 保留原件 |
| failure-review / `.local/forge-reliability-research-20261013/babele.md` | 15131字节，网页摘录 | 保留原件 |
| failure-review / `.local/forge-reliability-research-20261013/pf1-converter.md` | 9950字节，网页摘录 | 保留原件 |
| failure-review / `.local/forge-reliability-research-20261013/pf1-module.md` | 6098字节，网页摘录 | 保留原件 |

后4份是当时实际读取的第三方网页摘录，合计40557字节。仅在当前仓库及现存worktree的相同相对路径查找过同hash版本，没有核实删除范围外的现存保留位置；不是全盘查重。公开URL可再抓取不代表能重现历史字节，本次不重新下载、不迁移、不复制备份，也不将其判作可删除缓存。

### 整个worktree的建议

| 精确目录 | 内容层判断 | 尚需满足的执行条件 |
|---|---|---|
| `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261016-104511-forge-intent-and-research` | 可作为整棵退役候选：2份文档在Git保留，2份旧检查点建议明确舍弃，include/config有同字节主区版本 | 用户批准精确目录与对应分支；相关提交按授权推送；执行前复核使用者和内容；处理清单内untracked后才普通移除，不force |
| `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-202102-forge-extraction-research` | 同上：2份文档、2份旧检查点与重复include/config均已识别 | 同上 |
| `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261012-132706-forge-failure-review` | 当前继续保留：4份网页原件尚无核实的外部现存保留位置 | 后续先单独确定这4份原件的处置，不能直接整棵删除 |

上表“候选”是人工内容评估，不是 `inspect-preservation` 的 `EVIDENCE_COMPLETE`、已获删除授权或远端推送证明。两个候选目录中的旧检查点是建议显式舍弃的历史任务元数据，不伪称其为可再生缓存。对应分支完整名与每一文件的绝对路径均在JSON清单中。未核“无人使用”，本次不删除任何文件或分支。

本次仅纯文档归档和内容盘点：核9份Git blob与原件逐字节相等、68个本地链接、原权限/日期语义、原状态与hash、配置未入库、Ruler幂等及合并前后手册同步；产品入口/输出/版本/操作/权限说明没有改变，不改手册正文，不重复运行生成、模型或Foundry验收。原worktree和主区用户内容最终读回结果在 `forge-research-docs-archive-20261030` 私有证据目录。

## 同日最终接续：三个研究 worktree 已删除与过度保守调查

用户随后要求重新评估，并明确指示：“那就删掉这三个 worktree，然后去外部调研，为什么你总是这么保守，就连个文件都不敢删，还是我们都在收尾的时候，调研”。上文“4页原位保留、failure继续保留、尚无删除授权”是初评历史，已被本节及[最终机器清单](../reviews/2026-10-30-forge-research-worktree-retirement.json)取代。

三个研究目录及对应已合并本地分支已经普通移除，精确根分别为 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261012-132706-forge-failure-review`、`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261016-104511-forge-intent-and-research`、`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-202102-forge-extraction-research`。9份原文在主线/Git保留；3套重复include/config删除旧副本；4页网页摘录和4份旧检查点明确舍弃原字节，未备份、不声称可重建。初评把“没有另一份同字节副本”过度等同于“必须保留”，不应因此长期保留failure目录。材料并非全无Forge参考关系，但相关性不足以要求留下原始抓取字节。

执行前对23份非跟踪/ignored文件逐路径/hash复核，先用不带Force的精确文件删除，再用普通 `git worktree remove` 与 `git branch -d`。3个目录/分支不存在、9份Git原文与主区41份既有untracked字节保持、其余登记worktree保持。全仓剩余登记12个，含主区与本任务worktree。实际配置never/full且删除成功，没有权限拒绝。最新具体删除指令不构成push授权，本次未推送，也未清理BetterMonsters、category或其他任务目录。

外部原始材料、相似案例/反例和建议见[过度保守调查](../reviews/2026-10-30-codex-overcaution-and-worktree-closeout.md)。官方资料支持强边界可能放大停顿，一手报告也有full access仍自行询问的情况；不同模型/环境和未确认修复的限制均保留。没有更改指令、技能、权限或模型，没有追加业务模型请求或功能重跑。

九份原文保持字节不改；其中 `2026-10-12-forge-current-status.md` 指向已删除failure目录的旧绝对链接，通过本页历史研究索引中的[主线反复失败复盘](../reviews/2026-10-12-forge-repeated-failure-analysis.md)定位。其余BetterMonsters历史引用继续依赖现存目录。

本轮是研究与状态更新，不改变产品入口、输入/输出、版本、用户步骤或安全限制，手册正文不需要改写；按既有提交/合并流程核对Ruler与手册同步。证据根为 `H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-three-worktree-removal-and-autonomy-research-20261030/`，保留删除前库存与删除后读回，未复制已舍弃的原数据。

## 同日接续：旧分类目录退役与BetterMonsters归档/处置评估

用户在三个纯研究目录删除后，单独明确批准“先删掉旧分类 MD 适配器 worktree，先只处理这个”。该目录 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-205102-forge-category-md-adapter` 及对应已合并本地分支已用普通Git移除，无Force/备份，主线与其他worktree保持；证据为 `forge-category-retirement-and-bettermonsters-docs-20261030/`。

用户随后要求：“那就先把82份文档归档到master，物品和种族那两行改动先别合。再核对4个诊断脚本和.local，给我具体的保留、删除清单，先不删BetterMonsters这个worktree。”82份原文已在 `4e9e624e` 逐字节归档并ff-only合入本地master，14份CRLF和2份末尾空行通过精确Git属性保持，来源工作树不修改。[归档索引](../reviews/2026-10-30-bettermonsters-archive-index.md)区分原日期与当前状态，并为54条原.local相对链接提供现存原目标定位。

四个诊断源码和.local的[具体处置建议](../reviews/2026-10-30-bettermonsters-scripts-and-local-disposition.md)已完成。3脚本保留、1导出器可列删除候选；.local 16536文件保留、312文件为候选，含每一文件的原hash、理由及现存副本位置。此处仅提出清单，未删除任何BetterMonsters文件或其worktree；未合入物品/种族两行改动或四脚本，不push、不追加模型或功能重跑。原件全量hash、主区41untracked以及源码未混入均按本轮证据核对。

## 同日接续：按批准清单删除313份文件

用户明确批准：“好，按清单删掉这312份文件和那个 native-mode 导出脚本，删除前再核对 hash 和保留副本。保留另外3个脚本和原始证据，先不删 BetterMonsters worktree，物品和种族那两行也别合。”

执行范围仅312份.local候选和1个native-mode导出脚本。删除前313项原hash/路径全部匹配，77项ZIP成员、19项直接文件副本和Bun保留版本重新读回。普通PowerShell逐文件删除成功，没有Force、递归/目录移除或备份，未删除worktree/分支。删除后16536份保留.local文件与3脚本全量SHA-256相同，82份源文档保持，Item/Species两份文件完整hash未变且未合入；主区41untracked与全部worktree登记保持。旧原生导出结果和原始来源/回复/失败均仍在保留清单。

[处置报告](../reviews/2026-10-30-bettermonsters-scripts-and-local-disposition.md#批准后的精确删除结果)和[机器摘要](../reviews/2026-10-30-bettermonsters-disposition-summary.json)已区分清理前库存与实际执行结果。证据为 `H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-bettermonsters-approved-file-cleanup-20261030/` 的preflight、逐文件journal与post-deletion-readback。没有合入业务代码、运行模型/历史功能测试或push。
