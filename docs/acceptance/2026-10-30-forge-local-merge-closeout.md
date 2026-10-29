# Forge 本地提交、主线整合与 worktree 盘点

2026-10-30。用户原话：“我说的收尾是把这个分支该commit的commit，然后合并到master。之后看下还有哪些跟这个forge相关的worktree，他们要怎么清理”。本次授权为本地提交与合并，以及清理评估；没有 push 或删除 worktree 的授权。

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
