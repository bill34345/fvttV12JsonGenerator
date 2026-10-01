# Foundry v14 / dnd5e 双版本线开发资料与工具路由

## 目的

本指南帮助后续 thread 按任务类型选择最短且可信的资料来源和工具。它不是一条必须逐项执行的固定流水线，也不要求每个任务同时查询所有来源。

正式生成器未指定目标时仍显式使用 Foundry `14.364` / dnd5e `5.3.3` / `core`。系统相关开发区分 5.x 固定 5.3.3 与 Next 跟随官方稳定 6.x，先按[双版本线流程](dnd5e-version-following.md)比较官方发布、本地实装和资料身份；6.x 的实际 Core／系统目标以当次核对为准，不永久卡在 6.0.2，也不把所有 6.x 宣称已支持。

选择资料时始终区分三种证据：

1. **发现与导航**：帮助找到类、Hook、源码文件或可能的实现方式。
2. **精确版本静态证据**：证明目标版本确实有该字段、签名、Hook、schema 或行为实现。
3. **真实运行时验收**：证明代码在目标 Lab 中按用户目标工作。

发现证据不能自动升级为精确版本证据；静态证据也不能自动升级为运行时验收。

## 可选资料来源

| 来源或工具 | 最适合 | 不能单独证明 |
|---|---|---|
| `references/` 与配置的共享 reference cache | 锁定 dnd5e `5.3.3` 及当前取得的稳定 `6.x` 源码／发布证据；正式生成模板仍按各自已有支持边界 | Foundry UI、Hook 或 Activity 在真实世界中已正确工作 |
| Context7 `/websites/foundryvtt_api_v14` | 快速定位 Foundry v14 `Document`、`ApplicationV2`、Hooks、Canvas 等 API | 页面对应的具体 minor build 一定是 `14.364` |
| Context7 `/foundryvtt/dnd5e` | 5.x 查询指定 `release-5.3.3`；6.x 先由官方确定稳定 tag，再带 tag 查询概念／接口 | 查询里指定版本不保证结果固定；Wiki、master、6.0.x 返回只作导航，不能当目标静态证据或最新版探测器 |
| [Foundry v14 官方 API](https://foundryvtt.com/api/v14/) | 核对 public/protected/private 边界、签名和官方说明 | 未标明 minor build 的页面等于 `14.364` 精确实现 |
| [Foundry 14.364 发布说明](https://foundryvtt.com/releases/14.364) 与本机安装源码 | 核对 `14.364` 差异、实现细节和实际可用 namespace | 模块在目标世界中的最终行为已经通过 |
| [dnd5e 官方源码](https://github.com/foundryvtt/dnd5e) 与锁定提交 | 核对 `5.3.3` Actor/Item/Activity/Hook/migration 实现 | Wiki 或新分支内容可无条件回推到 `5.3.3` |
| [dnd5e Wiki](https://github.com/foundryvtt/dnd5e/wiki) | 理解设计意图、扩展点、Hooks、Enrichers、Advancement 和 Pack 约定 | 可变 Wiki 页面是不可变版本证据 |
| [Foundry VTT 官方 CLI](https://github.com/foundryvtt/foundryvtt-cli) | package 选择、Compendium pack/unpack、内容迁移、fixture、往返验证和受控本地启动 | Actor/Item 生成正确、运行时 Hook/UI/Canvas 正确或生产写入已获授权 |
| [DFreds TypeScript 模块模板](https://github.com/DFreds/dfreds-module-template-ts) | 参考 Vite、TypeScript、类型组织、Compendium 脚本和发布自动化 | 模板依赖版本与本项目 `14.364` 完全相同，或整套结构适合当前 Bun workspace |
| [Foundry 系统 boilerplate](https://github.com/asacolips-projects/boilerplate) | 只有在开发全新 game system 时提供概念参考 | 它适合当前 dnd5e Actor/Item generator 或代表 v14 当前实践 |
| GitNexus MCP | 索引新鲜时理解跨 package 调用链、影响范围和当前 diff | 图谱比当前 Git HEAD 更新，或图谱结论等于运行时语义 |
| Foundry MCP | 连接到已核对身份的本地 Lab 后做只读检查、Document 读回和受控行为辅助 | MCP 返回 `ok` 等于语义验收，或连接目标天然是本地而非生产 |

联网搜索仍遵守全局 AnySearch 优先与显式回退规则。搜索结果用于发现候选来源；版本相关实现结论应回到上表中的精确版本来源。

## 按任务选择最短路径

### Foundry 核心 API、ApplicationV2、Document、Hooks 或 Canvas

推荐从 Context7 v14 索引快速定位名称和官方页面。实现前核对官方 v14 API 的可见性标记；涉及 `14.364` 行为、内部实现或 minor 差异时，再查本机 `14.364` 源码和发布说明。完成后按功能风险进入本地 Lab。

在尚不知道精确类名和文件路径时，不要求先扫描全部本地源码；Context7 可作为更快的入口。也不得因为 Context7 返回了代码片段，就跳过目标版本复核。

### dnd5e Actor、Item、Activity、Advancement、Hook 或迁移

优先使用版本清单指向的源码：5.x 为 `.local/references/dnd5e/5.3.3/repo`；6.x 为 `dnd5e-current-6` 对应的本次稳定版本 checkout，实际路径按 `FVTT_REFERENCE_CACHE_ROOT` 解析。Context7 和 Wiki 用于发现概念／文件；引用没有对应精确版本时，回到本地固定提交确认。资料与系统哪个较旧分别处理，不能仅凭搜索片段触发安装。

开始前运行 `bun run references verify`。新的 topic worktree 不一定包含 Git 忽略的默认 `.local/references`；此时使用已配置的 `FVTT_REFERENCE_CACHE_ROOT`，或按 `docs/REFERENCE_INDEX.md` 核对首次获取条件；已有有效缓存不走会移动旧目录的 bootstrap 更新路径。不得为了让路径出现而复制另一整套 reference cache，也不得把缺失缓存静默降级成“最新版”资料。

生成数据还必须经过项目 projector/verifier 和来源语义核对；模块行为分别在该任务确定的 5.x／6.x 目标验收；5.3.3 已有证据不自动证明升级后的 6.x。

### Parser、Intake、生成器或 verifier 新功能

核心路径仍是项目 source → IR → workflow → generation → verifier。资料源用于确认目标 schema 和运行时语义，不能替代项目正式输出路径。

只有当接受后的 Document 需要进入 Compendium、Adventure 或发布包时，才在下游评估官方 CLI。

### 新 Foundry 模块、Hook、UI 或 Canvas 功能

先读 `foundry-modules/AGENTS.md` 和目标模块的局部规则。API 导航可用 Context7；精确行为用官方 API、锁定 dnd5e 源码和本机 Foundry 源码；最终用模块 test/build 与真实 Lab 行为验收。

DFreds 模板只做选择性参考。默认复用本仓已经验证的模块 build/install/verify 边界，不整套引入另一套 npm、Jest、启动或发布结构。

### Compendium、Adventure、内容模块或批量迁移

以下任一条件成立时，应评估官方 CLI：

- 新功能生产或消费 Compendium；
- 需要 pack/unpack、Folder 保真或 Adventure 展开；
- 需要把真实 Pack 变成可版本控制 fixture；
- 需要 Document 迁移、规范化或往返比较；
- 需要受控地启动指定本地 Foundry/world。

官方 CLI 自身的工具版本不等于 Foundry target 版本。首次采用或升级 CLI 时，先核对 GitHub Release 与 npm 发布版本，在 topic worktree 中锁定精确版本，只对随机临时根或明确构建目录做 Trial。比较 Document、UUID、embedded documents、Folder、索引、逻辑 hash 和 Foundry 实际加载后，才能把它接入正式 package adapter。

官方 CLI 不得绕过项目 CLI/workflow 生成正式 Actor/Item，不得直接修改运行中的 World，也不得把 launch 成功冒充 PID、端口、dataPath、world 和 HTTP 验收。生产安装、迁移、重启或 LevelDB 写入仍需要当次明确授权。

### 全新 game system

只有用户明确要开发独立系统而不是 dnd5e 模块/内容时，才调研 system boilerplate。使用前必须重新核实模板的目标 Foundry 版本、DataModel/ApplicationV2 现代化程度和维护状态；不得从旧模板推断 v14 API。

## 本机 MCP 与代码理解工具门禁

- Context7：已知 library ID 可直接查询；未知或歧义时先 resolve。查询应包含目标版本和单一具体概念。
- GitNexus：使用前读取 repo context；索引落后 HEAD 时先决定是否在本次任务范围内刷新，未刷新则只把结果当历史导航。
- Foundry MCP：第一次调用先读取 world/version，并核对端口、app、dataPath/profile 和 world。未连接或身份不明时，不用它做验收，更不执行写入。
- GitHub MCP：适合仓库、PR、Issue、CI 和发布证据，不替代本地 checkout 的精确代码审查。

工具当前不可用时，报告精确失败与回退来源；不得为了保持工具链外观而伪装已调用或静默降低证据层级。

## 最终证据记录

版本相关实现的最终报告至少说明：

- 使用了哪些发现/导航来源；
- 最终核对的精确版本、提交、发布或本机源码；
- 做了哪些机械检查；
- 做了哪些人工/语义或真实 Lab 验收；
- Context7、Wiki、模板、CLI 或 MCP 结果中仍有哪些版本漂移或未验证边界。

只调用了发现工具而没有精确版本证据时，只能报告候选设计或待验证结论，不能声称目标版本支持。
