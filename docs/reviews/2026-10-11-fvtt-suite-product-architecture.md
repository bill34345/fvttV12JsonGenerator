# FVTT 工具合集：产品方向与架构判断

日期：2026-10-11。审计起点：已提交 `master` / `3734eb2`。本轮在独立 sibling worktree 实施可逆的名称与手册改进；没有提交、合并、推送或发布授权。

当前结论：架构判断与本轮源码/手册候选已完成；局部机械检查通过，Web 表头及浏览器标题已获正常 Chrome 接受。离线手册正常浏览器/窄屏检查受 file URL 策略拒绝而未执行；Forge 新标题实机检查按用户的环境占用保护延期。候选仍为未提交、未集成状态，不声明整项运行验收或商业发行完成。

用户随后明确统一手册将集成到FVTT，并要求由主控负责总计划与逐模块子计划。后续设计入口为[工具合集渐进重构总计划](../plans/2026-10-11-fvtt-suite-refactor/PLAN.md)，当前进度在其独立总账；本审计保留前轮判断与接受记录。

## 判断

建议保留单仓库，渐进重构为一个品牌下的独立 Foundry 模块合集。5.3.3 与 6.x 是同一产品的两条适配线；不因此复制成两个项目，也不从头重写 master。仓库名称可以在产品名确定、发布地址迁移准备完成后修改；先改用户可见名称，不改持久身份。

这与 [ADR-0001](../decisions/0001-modular-monolith-before-repository-splits.md) 和 [ADR-0003](../decisions/0003-foundry-modules-release-boundaries.md) 一致。此文是本轮建议与执行记录，不把新的收费模式、品牌名或完整重构标为用户已批准。

## 当前源码提供的证据

| 观察 | 证据 | 对决策的意义 |
| --- | --- | --- |
| 已有 Bun workspace 和单向依赖约束 | 根 `package.json`；`.dependency-cruiser.cjs`；14 个 `packages/` package | 共享逻辑已有归属，可以在现有结构上改进 |
| Forge 复用正式生成链 | `packages/forge-browser-runtime/package.json`、`packages/workflows/package.json` | 拆仓前须先解决这些真实依赖；复制整份实现会造成双重维护 |
| 浏览器模块与本机工具分开 | `foundry-modules/AGENTS.md`、`apps/`、`tools/` | 用户功能适合模块化，本机进程、凭据与运维能力仍需要独立执行位置 |
| 系统差异已实际存在 | CC `runtime-compatibility.ts`；WMP `adapters/dependencies.ts`；Deck `dnd5e-adapter.ts` | 适配点应靠近相应功能；不要仅按系统主版本复制整个产品 |
| 版本支持没有全覆盖 | [支持矩阵](../acceptance/current-support-matrix.md)；Forge 5.3.3 门；Next 6.0.5 限定接受 | 同一仓库可支持两条线，但每项功能仍要独立声明和验收 |
| 耦合热点值得定向处理 | generation `actor.ts` 3,454 行；Forge `intakeApplication.ts` 3,090 行；Web `App.tsx` 3,008 行；WMP `runtime.ts` 2,375 行 | 行数只是定位线索，不能单独证明缺陷；下一步沿用户流程和状态所有权分解，而非机械拆文件 |
| 架构旧总账的标题状态与内部完成记录矛盾 | 2026-07-31 ledger 顶部仍为 `in_progress`，阶段 0–7 及 2026-08-01 收尾已为 completed | 本轮校正文档现况，不重新执行旧重组或改写历史验收 |

这些是当前 checkout 的静态证据。历史运行证据仍按其原日期、版本和案例使用；本轮没有盘点在线世界、升级系统或执行全模块实机矩阵。

## 三种方案比较

| 方案 | 得到什么 | 主要代价 | 建议 |
| --- | --- | --- | --- |
| 从头重写 master | 可以重新设计所有层次 | 同时丢失现有行为基线，来源语义、运行适配和发布全部需要重新证明 | 不采用；AI 编写本身不是重写理由 |
| 按 5.3.3 / 6.x 拆两个项目 | 两边可以独立改动 | 共享解析、生成、UI、安全修复和手册需要同步；跨线差异难追踪 | 不采用 |
| 单仓库、共享核心、局部版本适配、独立模块发布 | 共同修复一次，按模块验收和升级；用户仍可购买整个合集 | 需要维护清晰的发布清单和兼容矩阵 | 推荐 |

只有出现独立团队、独立权限、完全不同生命周期，且某功能能够从 fresh clone 独立构建/验证时，再考虑拆仓。商业套餐、安装模块和 Git 仓库不必一一对应。

## 合集应该包含什么

建议产品对外呈现为“一个工具合集，按需启用模块”，不要把所有功能绑成必须同时启用的大模块。新增一个轻量的合集入口可以导航、展示已安装模块和兼容状态；核心功能继续由现有模块拥有。只有真实硬依赖才进入 `relationships.requires`，不因购买合集而要求启用全部功能。Foundry 的 [模块文档](https://foundryvtt.com/article/module-development/)提供独立 manifest 与依赖关系机制；它不是支付或商业授权系统。

| 功能层 | 建议交付形式 | 当前限制 |
| --- | --- | --- |
| Forge、生物/物品编辑、跑团面板、战场工具、状态/房规 | Foundry 模块；共用品牌与用户手册 | 首批只选有明确目标版本和用户流程的功能；当前部分行为仅限定接受 |
| 重复使用的解析、生成、规则契约 | 仓库内共享 package，按需要构建进模块 | 不强制为每个 package 增加用户需要安装的运行库 |
| AI 接入、OCR、需要本机进程的转换 | Foundry 内的用户入口，加可选本机 Companion 或明确的服务接口 | 浏览器能力与密钥保管不能由“打包为 mod”自动解决；现有本机路径保留 |
| Foundry Ops、安装/维护脚本、测试材料和 reference cache | 开发与维护工具 | 不进入用户合集，不向客户分发机器路径、私有材料或运维权限 |
| 职业/种族资料、第三方补丁、图像/音频素材 | 单独核对来源和可分发范围后决定 | 本轮没有完成逐资产许可盘点；目录存在不等于可随商业包分发 |

仓库有 17 个 `foundry-modules/` owner 目录，其中包括 `midi-qol` 与 `server-next-external-candidates` 这样的本地适配/候选区域，不能把目录数当作可销售模块数。

## 两条系统线与 V12

- 主平台定位采用 Foundry V14；5.x 固定 dnd5e 5.3.3，6.x 按[既有流程](../runbooks/dnd5e-version-following.md)跟随官方稳定版本。
- 当前记录中的主要精确组合为 14.364/5.3.3、Mirror 14.368/5.3.3、Next 14.368/6.0.5。它们是已记录的支持/接受目标，不是本轮在线状态或“最新官方版本”查询结果。
- 6.x 适配尚不能等同于整个生成器、所有模块或所有玩法均支持 6.x。Forge 的现行正式生成目标仍是 5.3.3；兼容性按功能和精确版本说明。
- 建议后续新增能力优先面向 V14 与 6.x，5.3.3 保持维护线；最终顺序取决于首批收费功能。V12 降为历史兼容范围，逐项退役。
- 将 CLI 默认由 V12 改为 V14 是一项真实行为变更，须单独核对脚本调用方、fixture 和用户流程；本轮仅明确说明现况，不修改默认值、不删除兼容实现。

## 品牌与身份

建议采用不包含 V12 和 JSON 限定的合集名称。工作候选为“FVTT GM 工具集 / FVTT GM Suite”；只是命名方向，未核商标、重名或域名，不作已确定品牌。

迁移顺序：用户可见名称和说明 → 品牌定稿 → 仓库/包发布地址迁移 → 安装与升级链验收。已有 module ID、flags namespace、settings key、Compendium UUID、source identity 必须继续稳定。根 package 名、目录名和仓库名不应与一轮界面更名一起盲目替换。

Forge 的 manifest/download 指向现有 GitHub 仓库。Foundry [官方模块文档](https://foundryvtt.com/article/module-development/)要求更新 manifest 地址保持稳定，因此正式迁移前应准备旧地址用户的更新路径；此文不保证任何外部重定向永久有效。

## 低价合集与发布条件

合集定价不要求技术上只有一个 ZIP。建议先按“全部自有工具的使用权 + 明确的维护周期”设计套餐，避免在未有成本数据时承诺终身更新或无限 AI。AI 可由用户自行配置 Provider/Key，或另设明确额度；本机 Companion 是否面向普通客户可维护也需要验收。收费周期、价格和托管渠道仍由用户决定。

Foundry 的 [Premium Content 说明](https://foundryvtt.com/article/premium-content/)描述了官方 Marketplace、外部激活码及 Patreon 关联安装。它证明这些发行渠道存在，不证明本项目已经获得发行接入资格；本轮没有创建商品、收费账户、授权服务或上传内容。

与“全部由 AI 开发”直接相关的是 [Foundry AI Content Policy](https://foundryvtt.com/article/ai-policy/)（页面注明修订于 2026-03-18）：官方 listing/Marketplace 允许 AI 辅助软件开发，但作者必须亲自理解、解释、修改和维护所提交的代码；代码之外的预制文字、媒体和营销材料有不同规则，运行时按用户请求生成内容另有规定。不能把“代码允许 AI 辅助”推广为整个资料/素材合集自动符合官方发行政策。自行发行与官方渠道范围不同，仍需核对适用开发许可。

建议把首批功能做成用户能说清楚、维护者能解释的纵向切片，并保留设计与迭代记录。现有 root 没有统一 LICENSE；workspace `package.json` 也未声明统一 license。这是发行条款待决定的信号，不是对每项第三方来源作出侵权或可商用结论。应按实际 release 文件白名单清点，不分发整仓库。

## 分阶段实施

1. **本轮**：将现行界面和用法中的“工作台”更名为“操作台”；改善离线手册入口、版本说明、长页面导航和查找；校正架构概览旧状态。保留代码标识和全部历史验收记录。
2. **产品边界确定后**：确定合集品牌、首批 3–5 个用户功能、5.3.3/6.x 的逐功能矩阵、收费周期和 AI 成本归属；这一步先于全仓改名。
3. **渐进重构**：先整理 Forge 的输入/审核/创建状态与 Web 页面职责；只在两条线确实变化的地方建立版本适配。共享契约不得导入具体模块私有实现。每个切片保持正式来源链与既有真实行为。
4. **发行候选**：逐模块构建、版本与依赖清单、文件白名单、双语说明、升级/禁用/卸载路径、精确目标的正常客户端接受；内容许可与官方渠道规则另行核对。
5. **取得发布授权后**：再提交/集成、迁移发布地址、创建商品或部署服务。此阶段没有因本轮研究而自动获准。

## 本轮验证选择与记录

- 基线 `handbook:check`：PASS，34 项；确认本轮之前手册与来源同步。
- 架构判断使用现有 `architecture:verify` 检查依赖和循环；它不证明全部功能可用或可销售。
- 更名只改变可见文字与相应已有断言；检查 Forge 相关测试、Web/模块类型和构建，不重放未改变的来源生成、玩法或生产矩阵。
- 手册新增版本选择条目；页面改善搜索排序、正文定位和键盘跳转。现有手册测试入口补充实际 DOM 行为，检查导航保持条目地址、搜索相关性和安全文本处理。
- `handbook:status` 定位本轮受影响条目，人工对照后记录 review、生成 HTML 并再次 `handbook:check`；不缩小 watch，不刷新未核对项。
- 实际 file URL 的桌面/窄屏、主题、搜索、返回与复制，以及 Forge 窗口标题，需依项目 Chrome 路由补正常客户端证据。DOM/构建不能替代这层；完成前保留待验状态。
- 全仓 CI 留到实际整合边界；本轮没有 commit/merge/push 授权，不把全部 CI 作为每次文案修改的默认后续。

验证结果在本节续记；本轮候选不改变现有运行时支持矩阵。

### 已执行的局部证据

- `bun install --frozen-lockfile`：Bun 1.3.8，819 packages，321.53 秒，exit 0；锁文件没有修改。
- `architecture:verify`：exit 0，1,243 modules / 2,831 dependencies / 0 violations，cycles 检查通过。不是全仓代码逐行审查。
- Forge Intake + unified workspace 两个现有测试文件：67 pass / 0 fail / 492 assertions，包含实际模板挂载、模式草稿、失效和提交锁；未改变的生成/玩法不重放。
- `typecheck:apps`、`web:build`、`build:fvtt-json-forge`：exit 0。Forge 构建为本轮 worktree 候选，没有安装或升级在线世界。
- 手册 DOM 新测试首轮发现复制测试仅等待单个 Promise 微任务，未等跨 realm 的异步点击处理完成；属于测试等待层。改为等待下一事件循环后，`handbook:test` 17/17 PASS，复制实现未改。保留首轮日志，不宣称首轮成功。
- 新增 DOM 测试也会被既有 Bun/CI 入口收集，因此再运行安全 `handbook:test:bun` 检查运行器兼容；这是本轮新增测试带来的证据缺口。
- 新版版本条目给出可执行 CLI 示例，因此用现有 `cli:help` 核对参数；没有生成用户数据。
- 本轮 UI 完成后运行一次设计静态检测；布局和真实客户端仍待浏览器证据。

### 浏览器授权与占用边界

用户已选择新建独立 GPT-6.1 Sol / medium Chrome 执行聊天，并授权自动回传父聊天。随后用户明确说明 Forge worktree 正在使用 5.3.3 Server Mirror，要求本轮 E2E 不打扰它。因此浏览器批次只覆盖本轮离线手册与独立 loopback 端口的 Web 操作台；禁止访问 Foundry、安装候选、重载客户端、启停服务或修改世界。Forge 的正常客户端更名检查延期到已确认的空闲安装窗口，当前源码/模板回归保留。

本轮只读本机进程/监听清单曾看到 Mirror PID 41904 / 127.0.0.1:30001；未访问其 API 或页面，未写入或重启。进程号仅作该时点记录。

后续读取运维规则确认仓库 CI 锁定 Bun 1.3.14。本轮此前的本地局部测试实际使用 PATH 中的 1.3.8，结果保留，不冒充锁定 CI。真正整合前应使命令与子进程使用 1.3.14 并完成对应整合门禁；本轮尚未取得提交/合并授权。

### 本轮候选与交接

- Node 与安全 Bun 入口的手册检查均为 17 pass / 0 fail；Web 与 Foundry modules 类型检查通过，Web 与 Forge 构建通过，设计静态检测 `[]`。正常客户端与静态检测不是同一层证据。
- 人工核对本轮受影响的 13 项，保留所有原 watch；`handbook:build` 与 `handbook:check` PASS，35 项。新版本示例已对照实际 `cli:help` 改为来源位置参数及 `-o`。
- Chrome 执行聊天 `01a129cb-499f-7080-92d4-1f3ec433a168`，合同 `SUITE-UI-20261011-01` / revision 1；父回传目标 `01a129b6-4b84-7eb3-9d3a-952c9aaf0c4f`。配置与实际浏览器能力由执行器先核实，不能用本段派发记录作 PASS。
- Web 验收服务只绑定 `127.0.0.1:18743`，本轮 launcher PID 12660 / listener PID 56632，进程父子身份和 HTTP 200 已核对；初次 HTTP 探测早于启动完成，随后由进程/日志确认 ready 后成功读回。执行器仅获准结束这两个身份核实后的自有进程，Mirror 完全排除。
- 手册候选 SHA-256：`A543E218E6DDDE24F07DC88439E362CA3B0ABE78AAF3FD2680C8B6E64F3C5015`。浏览器原始证据保存在该 worktree 的 `.local/suite-direction/chrome/`；收到回调后再审图、填写实际接受或修复真实失败。
- 当前未完成：正常 Chrome 页面接受与证据复核；Forge 更名的实机检查受用户占用保护延期；品牌/收费及下一轮结构重构待产品决策，提交/合并/发布未执行。

### Chrome revision 1 回调与修正选择

已收到执行聊天的实际跨聊天回调，父读取原始 receipt/configuration/capabilities/cleanup 并审查 `web-desktop.png`。实际配置为 gpt-6.1-sol / medium、approval `never`、sandbox `danger-full-access`，官方 Chrome 最小往返通过。

- Web 表头“Actor / Item 操作台”、实际加载的 `index-BjSBmv_L.js`、桌面正常渲染和所捕获 warn/error 为空通过。自有 tab 关闭，仅本轮 Web 的 56632/12660 停止，18743 无监听；Foundry 未访问或操作。
- 离线手册的精确 file URL 被连接器 URL 策略拒绝，理由为只允许 HTTP/HTTPS；手册 SHA-256 与合同一致。手册搜索、导航、主题、复制与窄屏的正常 Chrome 层全部为 NOT_EXECUTED。禁止用 HTTP 托管、换通道或重打包绕过这次拒绝；已有 DOM/离线构建证据保留，不能改成视觉 PASS。
- 回调发现 Web 浏览器标签仍为 `fvttV12Json Workbench`。这是本轮名称调整遗漏；将根 Web `index.html` 的 title 改为 `FVTT 操作台`，并把真实入口加入现有 Web 手册条目的 watch，避免以后标题变化漏掉核对。
- 复验只选择 Web build、构建 HTML 标题、Web 条目的 review/build/check，以及同一 Chrome 执行器读取新页面 title/表头与清理。App 脚本、生成链和 Forge 未变，复用先前相关检查；不重试被拒绝的手册 file URL，不重放完整 Web 流程或业务矩阵。

revision 2 的 Web build 与手册 review/build/check 已通过。JS bundle 仍为 `index-BjSBmv_L.js`，SHA-256 `1193F8507C2F674757E9536E14E866EB02733804E6211D51E3E480FF4EEC798C`，与首轮实际客户端一致；新 Web HTML SHA-256 为 `7C7CD5110040833245A4A1A706563611CD590E425C692DEA22D96A0FF197FD60`。手册仅因 Web 核对记录/指纹更新重生成，当前 SHA-256 为 `9D9D9C347021309CC038787FCF84BEC3DC7731C91385D1B250C214167FF13709`；不复用旧哈希绑定作为新手册视觉接受。

已按既有授权向同一执行聊天派发 revision 2，仅检查 HTTP 页面的 title/表头和结束自有服务。r2 launcher 54532 / listener 64776 的父子身份、127.0.0.1:18743、HTTP 200 与响应 title 已核对。原手册策略拒绝和 Forge 占用排除持续有效；等待实际回传后更新最终状态。

### 最终父审阅（2026-10-11）

revision 2 实际回调已收到。父读取 `receipt-r2.json`、`page-readback-r2.json` 和 `cleanup-r2.json`，重新核对本地 Web HTML/脚本/手册 SHA-256，独立检查本轮 Web 两 PID 均不存在且 18743 无监听。

| 层级 | 结果 | 证据与范围 |
| --- | --- | --- |
| 架构判断 | 完成 | 推荐单仓库、渐进重构、独立模块发布；品牌、首批套餐和后续实施仍待用户决策 |
| Web 更名 | PASS，本轮窄范围 | 真实 Chrome `document.title = FVTT 操作台`、表头 `Actor / Item 操作台`，正确 JS asset 绑定；首轮桌面截图复用，未重放生成业务 |
| 手册源码/机械行为 | PASS，局部 | Node 与安全 Bun 入口各 17/17、35 项 build/check、相关人工核对；Bun 实际版本仍按上文记录，不冒充 1.3.14 整合 CI |
| 手册 Chrome/视觉 | NOT_EXECUTED | 原 file URL 策略拒绝保留；没有托管、重打包或切换通道绕过，不用 DOM 测试替代视觉接受 |
| Forge 更名 | 源码/模板与局部回归通过；实机延期 | 67 tests / 492 assertions 证据保留；没有安装候选，没有访问正在使用的 Mirror |
| 本轮 Web 资源结束 | PASS | 两轮均仅结束精确自有 Web 进程；r2 父独立读回 54532/64776 均不存在、18743 无监听，执行器自有 tab 已关闭 |
| Git 与发行 | 未执行 | master 仍为 `3734eb2`，既有 `.omo/` 保持；没有 commit、merge、push、仓库改名、商品或生产操作 |

原始证据保留在 `.local/suite-direction/chrome/`，父裁决为 `parent-review.json`。最后仅更新这份报告与本地裁决，未改变受测实现或手册内容，因此复用已通过的类型、架构、模块、Web 构建和手册检查，不再重跑。
