# Foundry Ops（Foundry 运维工具）

这个目录是项目内所有 Foundry 本地测试、离线世界检查和生产只读盘点的统一边界。它不是生成角色 JSON 的功能，也不是 Foundry 浏览器模块。

## 这个目录现在包含什么

以前，相关工具散落在 `scripts/foundry-lab` 和 `src/tools`，仅看命令名很难判断它会不会写文件、会不会连接生产服务器。现在它们已经收进一个产品目录，并共用一个入口：

```powershell
bun run foundry:ops --help
bun run foundry:ops catalog
```

`catalog` 会用中文列出每条命令的目标和最大权限：

- `read-only`：只读取目标；生产读取无需逐次对话授权，但仍须通过目标核对、外部配置、`--apply` 和 `--allow-production-read`；
- `local-mutation`：会在本机生成报告、缓存、快照，或修改明确的本地测试镜像；
- `production-mutation`：会安装、重启、hydrate、迁移或以其他方式写入生产环境。统一 CLI 故意不提供这种入口，只能走另行批准的操作手册，并在写入前再次取得明确授权。

“生产迁移”相关的两个现有脚本只处理离线世界副本，因此被正确归类为“修改本地”；它们不会直接修改线上服务器。

目录中的模块可以这样理解：

| 模块 | 用途 |
|---|---|
| `src/cli.ts`、`src/routing.ts`、`src/commandCatalog.ts` | 统一命令入口、命令分类和权限检查 |
| `src/config.ts` | 本地路径、生产连接配置和防止路径逃逸的安全检查 |
| `src/process.ts` | 启动外部程序，并从命令、输出和错误中隐藏敏感值 |
| `src/acceptance/` | 文件侧验收合同、预检、一次执行、收据读回和恢复提示；模块玩法由各消费者另行判断 |
| `src/asset-inventory/`、`src/assetInventory.ts`、`src/localScope.ts` | 只读扫描本地 Foundry 资产，并登记整个 `.local` 顶层的所有权、隐私排除和待判断项 |
| `src/lab/` | 本地 Foundry 实验环境、模组获取、诊断、补丁、启动和停止工具 |
| `src/world-audit/`、`src/worldFootprintAudit.ts` | 对停止状态的本地世界建立只读快照并生成隐私安全的审计报告 |
| `src/production-migration/`、两个 `productionMigration*.ts` | 比较三个本地世界副本并构建离线迁移候选；不会连接或修改生产服务器 |

`spell-resolver` 命令仍经过 Foundry Ops 的统一权限入口，但浏览器源码、构建、本地安装生命周期和测试均由 `foundry-modules/monster-spell-resolver/` 自己维护；Foundry Ops 只负责把命令路由给该模块，不拥有解析器实现。

## 共用验收工具：文件侧第一版

本版用于已审核、已授权的本地文件检查，复用上述命令分类、路径保护和子进程入口。请求中声明 `local-file-checks` 不会授予新权限，也不会把被执行命令变成沙箱；命令不得启动服务、操作浏览器或读写 Foundry 世界。生产连接环境变量不会传给这些检查。

准备一个请求 JSON，字段见 [请求示例](../../docs/templates/development-feedback-request.example.json)。`workspaceRoot` 必须是实际 Git worktree 根，`candidatePaths` 和 `argv[0]` 必须是存在的绝对文件路径；`argv` 是参数数组，不经过 shell 拼接。填写目标、验收含义、case 名称、授权来源、预检和一次正式检查。工具自动生成 run／dispatch／receipt ID，读取分支、HEAD、指令基线提交、适用 AGENTS 和候选／执行程序的 SHA-256。

```powershell
bun run foundry:ops acceptance prepare --input="I:\实际工作树\.local\request.json"
bun run foundry:ops acceptance ready --contract="<prepare 返回的 contractAbsolutePath>"
bun run foundry:ops acceptance execute --contract="<同一合同绝对路径>"
bun run foundry:ops acceptance collect --contract="<同一合同绝对路径>" --receipt="<合同同目录的 receipt.json>"
bun run foundry:ops acceptance resume --contract="<同一合同绝对路径>"
```

每一步必须检查退出码和 JSON，成功后才继续。`prepare` 保存合同并做文件序列化读回；首个预检失败后停止余下检查并退出 1。`expectJsonOk:true` 的预检还要求一个 `ok:true` JSON。`ready` 再核对实际路径、分支、HEAD、候选、指令与执行程序；失败退出 2，不能派发。主宿主接入时应使用 `dispatchPrepared()`，它把检查和领取放在调用派发回调之前；本版没有自动发送聊天消息的命令。

`execute` 原子领取一次 dispatch，运行合同中的检查并保存原始 stdout／stderr／退出码与 `receipt.json`。退出 0 只说明保存成功；行为结论由 `collect` 给出。超时或调用失败也保存收据；已领取的操作不能直接再执行。`resume` 提示检查现存状态，或读回已有收据，不自动重放、不重建 fixture。单个检查必须显式设置 1–120000 毫秒的超时；当前进程入口管理直接子进程，检查命令不得留下后台子进程或服务。

`collect` 验证同一 worktree／run／dispatch／revision／case、合同指纹及原始文件指纹，拒绝旧收据、错路径和被改写的原件。摘要写入 `summary.<receiptId>.json`，重复收集读回同一结果，不覆盖不同摘要。`json-ok` adapter 只判断合同明确要求的本地 JSON 检查：`ok:true` 且退出 0 为 PASS，`ok:false` 为 FAIL，空输出、只有 PASS 标签或不支持的输出为 INCOMPLETE。`manual` 保留原件并返回 INCOMPLETE，交给独立审查。

摘要把 `behavior`、`evidence`、`cleanup` 和 `parentReview` 分开。本版不创建 Foundry 对象，因此 cleanup 是 `NOT_REQUIRED`；parentReview 一直是 `PENDING`，自动分类不能代替父审。收集退出码为 PASS=0、FAIL=1、INCOMPLETE／身份拒绝=2。`resume` 的退出码只表示状态读取结果，不是新的语义验收。

所有产物只新建在目标 worktree 的 `.local/development-feedback/<runId>/`，不修改既有证据。候选、HEAD 或指令发生变化后准备新合同。下述第二消费者已提供离线来源与参考数据 adapter，以及明确恢复后的专属运行合同／服务核对；自动推断影响范围、通用回调调度和对象清理自动化仍属后续。完整任务合同模板用于计划这些边界，不能把文件检查 PASS 升级为玩法通过。

安全回归入口：`bun run test:acceptance-tools`。流程依据：[开发反馈闭环](../../docs/runbooks/development-feedback-loop.md)；进度：[试点计划](../../docs/plans/2026-09-29-development-feedback-pilot.md)。

### 本批验证选择

复杂批次可在 `prepare` 请求中加入可选 `validationSelection`，见[带选择约束的请求](../../docs/templates/development-feedback-selected-request.example.json)。每行只填 `id`、`layer`（`behavior`／`evidence`／`restoration`）、`decision`（`reuse`／`check`／`defer`）、理由和相关 `context`。同一行为的导出、恢复可分行；不将整体收据失败翻译成全部业务失败。旧请求不带新字段时仍兼容，原身份、预检和一次领取保护继续有效。

- `reuse`：`previous` 指向[分项证据绑定记录](../../docs/templates/development-validation-evidence.example.json)的绝对路径与 SHA-256。记录含同一 case／层级、独立审查的 outcome、旧 context 和原件引用。工具读回记录及原件，要求 PASS 和上下文逐键一致，拒绝缺件、字节变化、错 case／层级、失败分项或未知适用性。旧原件格式不统一时新增小型绑定记录引用它们，保留原始 FAIL／PENDING；不能伪写原件为 PASS。
- `check`：新场景写具体理由；引用旧场景时还须 `invalidation`，含 kind、理由和可读的差异／故障／要求记录。kind 为 `behavior-change`、`interface-change`、`new-failure`、`insufficient-evidence`、`required-integration`、`unknown-impact`、`tool-repair` 或 `restoration-gap`。旧证明不可读时只能用明确的 `insufficient-evidence` 选择窄补测；不能复用为 PASS。单纯工具／恢复缺口不能作为已过业务层的失效理由。
- `defer`：列明本轮不做的原因；不执行，也不升级为已接受。若全批只有复用／不做项，准备和派发会拒绝新增执行，不运行前置命令。

**执行范围必须对应。** 启用后，每条 `preflight` 与 `operation` 必须填写 `validationCases:[{id,layer}]`；纯语法／身份准备显式填 `[]`。前置命令只能涉及选中的 check 项；正式命令覆盖集合必须恰好等于 check 集合。包含 reuse／defer、遗漏 check、重复或未知项均拒绝。已有命令若实际运行整套而无法分离，就必须换窄入口或依据具体失效理由扩大本批，不能只改声明掩盖实际全套调用。工具能比对现有入口声明的执行项，不能自动理解任意脚本内部语义、发现隐含依赖或替 host 约束回调内部代码。

`prepare` 在执行任何前置命令前检查选择及覆盖；`ready` 和 `dispatchPrepared()` 在领取前重读复用／失效证据，拒绝路径不会调用执行回调或创建领取记录。`ready` 的 `validation.check/reuse/defer` 返回实际冻结的名单。`collect`／`resume` 保持业务结果、证据完整性和恢复状态分离，不因本轮工具故障清空旧分项结论。

`prepare-batch` 可传同一字段，但该 adapter 的实际正式执行项固定为 `offline-source-readback/evidence`，不会将任意业务 check 偷换成只读来源扫描。`prepare-runtime` 可传同一字段及 `executionCases:[{id,layer}]`，后者必须等于 check 集合；`ready-runtime`／`dispatchRuntimeBatch()` 在服务探针及宿主回调之前复核。宿主按返回的 executionCases 选择实际动作；本增量不新增 runtime adapter，不恢复任何暂停业务，也不绕过已有运行权限／服务检查。

`context`、分项 outcome 和影响分析仍由 owner 对照相关代码、版本、目标和原证据建立；工具只证明声明及文件绑定一致，不能认证人工结论的语义真实性。只列相关事实，整包哈希或无关源码变化不能自动让所有旧结果失效；真实版本接口改变也不能被旧 PASS 免测。使用安全入口 `bun run test:acceptance-inspection` 聚焦三个慢 Git 用例所在文件，定稿后 `bun run test:acceptance-tools` 验证共用真实入口；不把固定单测预算、覆盖率 watchdog 或宿主输出 yield 混为同一种超时。

### 跨聊天状态与清理前内容核对

沿用项目当前任务合同与既有保留位置：`acceptance inspect-state --input=<当前任务合同绝对路径>` 核对 owner、候选、显式接续和独立父审引用；`acceptance inspect-preservation --input=<保留请求绝对路径>` 分别核对已提交、暂存区、工作区、untracked 与 ignored 内容。二者均只输出 JSON，退出 0 表示机械核对一致，缺件／失配／未知退出 2，不执行合同命令、不保存副本、不赋予接受或删除权限。

字段、决定引用和旧收据继承见[状态和继承](../../docs/runbooks/development-feedback-loop.md#7-状态和继承)，保留范围、读回与清理门禁见[worktree 清理](../../docs/runbooks/worktree-development.md#5-清理)。单次执行的 `resume` 保持原收据层级；报告完成、父审、集成和发布分别判断。旧格式原件可人工只读核验，模板不构成新授权。聚焦回归已纳入现有 `test:acceptance-tools`。

上述退出码指 acceptance 子入口的原生值；本机 Bun1.3.8 的多层 `bun run` 包装可能把非零退出归一为1。PowerShell 外层脚本没有显式传递原生退出码时也可能只报告1；需要保留该值时，先保存原生命令的 `$LASTEXITCODE`，再用 `exit` 传给调用者。接续脚本必须同时检查非零退出和输出 JSON 的 `exitCode`（若有）／`layer`／`behavior`／`parentReview`，不能把外层1直接认作业务 FAIL，也不能因为原件保存成功而继续派发。INCOMPLETE／PENDING 的人工出口由独立父审另存结论。

### 第二个消费者：Vision5e + Item Macro 离线接入

`prepare-batch` 读取已有 ServerNext 批次合同，复用当前文件侧内核，自动生成本任务合同与机器字段。请求只需 `workspaceRoot`、`sourceContractPath` 和 `authority:{source,scope:"offline-batch-preparation"}`，格式见[批次请求示例](../../docs/templates/development-feedback-batch-request.example.json)。原业务树、候选、旧合同及其回调父／子 UUID 都只读；新合同不会替代原当前状态源。

```powershell
bun run foundry:ops acceptance inspect-batch --source="<旧批次合同绝对路径>"
bun run foundry:ops acceptance prepare-batch --input="<本任务请求绝对路径>"
bun run foundry:ops acceptance ready --contract="<生成的本任务合同>"
bun run foundry:ops acceptance execute --contract="<同一合同>"
bun run foundry:ops acceptance collect --contract="<同一合同>" --receipt="<同目录 receipt.json>"
bun run foundry:ops acceptance ready-batch --contract="<同一合同>"
```

`inspect-batch` 只读核对候选 ID／版本、声明资源全集及 SHA-256、ZIP 指纹、宏 JSON 的命令往返、固定目标门禁和 fixture／清理清单一致性。旧合同的“9项测试PASS”文字作为历史声明保留，不当成此次重新运行的测试结果。既有 Python 生产者的 Item Macro 哈希按 `read_text()` 规范化换行后的文本计算；工具分别校验该文本哈希与实际文件字节指纹，不能混为一个值或忽略差异。

共用合同的 `readonlySources` 支持明确选择的跨工作树文件，用绝对路径与字节指纹防止混用；不复制业务源码。业务树分支／HEAD、源合同或任一绑定文件变化时拒绝继续，重新准备合同。`ready` 的 `executionScope:local-file-checks` 只允许合同内的离线检查；`ready-batch` 报告 `dispatchable:false` 并退出 2。本增量的运行授权固定为 NONE，即使源合同以后恢复，也不自动发消息、安装、启停或执行 Chrome。

导入已有原生读回时，另存为 UTF-8 JSON，并提供独立观察的目标上下文 JSON：`origin`、`dataPath`、`world`、`foundry`、`system`、`systemVersion`。如果尚无实际上下文或读回，就保持未执行；不要用期待值制作一个“通过”样本。离线参考导入与下述明确恢复的实机收集是两个接受边界。

```powershell
bun run foundry:ops acceptance capture-receipt --contract="<合同>" --input="<已保存原生读回>" --context="<独立目标上下文>"
bun run foundry:ops acceptance import-receipt --contract="<合同>" --input="<capture 返回的 envelopePath>"
bun run foundry:ops acceptance resume --contract="<合同>"
```

capture 自动填写共用 run／dispatch／revision、源批次 ID 和两个合同指纹，保留原生字节，不要求手填已知 ID。import 拒绝错 run、revision、源合同、目标、版本、fixture 或原件哈希；重复回执保持同一 receiptId。部分文件已写但摘要未完成时，只读核对已有字节再补齐，不覆盖不同原件，也不重放业务操作。

本版导入一律为 `REFERENCE_ONLY`，成功保存后仍退出 2，整体 behavior／evidence 为 INCOMPLETE、runtime／cleanup 为 NOT_EXECUTED、父审为 PENDING。模块 adapter 可独立核对读回中 60→90→60、命令文本、单次手动／活动记录；忽略原件中的 `pass` 标签，数据判断不代表 UI、客户端加载哈希、角色／重载或完整清理已通过。完整清理还需要对象、文件夹和辅助宏缺席的独立证据，不能仅凭 phase=cleaned 接受。

消费者聚焦回归：`bun run test:acceptance-next-vm`。真实安装、Chrome、跨线程送达和业务清理在原批次明确恢复后，按其当前授权与现场证据另行执行；工具的离线成功不恢复暂停状态。

实际批次曾遇到 DAE 自动生成的标准 Condition 没有本任务标记，原 fixture 清理因此保守停止。专属纯检查 `requireNextVmCleanupOwnership()` 只有在新建 Actor 的缺席／出生证据、完整持久化集合、已归属状态输入、精确 DAE 版本、实际 `dae.autoCreated` 与其源记录、固定父／ID／状态／创建时间都匹配时，才确认这一自动后代的限定归属。它不修改或删除文档，不替未知对象补标记，不能凭名称、类、静态 ID 或 `isTemporary` 放行。手动条件、缺失标记、额外对象和身份变化均拒绝；使用 `bun run test:acceptance-cleanup` 验证这些边界及实际编译入口。`buildNextVmCleanupGuard()` 显式绑定本地导出并检查调用函数存在；编译／语法成功不能替代这个入口往返。实际恢复仍由父任务准备并审核后通过正常应用入口执行。

### 已明确恢复的 Vision5e + Item Macro 实机批次

文件侧合同继续保持运行授权 NONE。用户明确恢复原批次后，可建立单独的运行合同；目前只支持已有 ServerNext 的这两个候选，不提供通用安装器、服务启动器或浏览器调度服务。

先准备运行请求，包含 `offlineContractPath`、`authorityPath`、`executorPermissionsPath`、`serviceReceiptPath` 四个绝对路径。授权记录包含 `scope:"local-next-vm-runtime"`、`explicitUserResume:true`、实际授权引用 `source`、原 `resumeSourceDispatchId`、本轮 `parentThreadId`、原执行聊天 `childThreadId` 及该执行器的期望 `model`／`reasoningEffort`。当前项目普通 Chrome 默认为 `gpt-6.1-sol / medium`，主控配置独立记录；工具核对执行器实际上下文与该授权记录相符，不要求与主控effort相同。这是授权的记录，不是 JSON 文件自己授予权限。旧暂停合同只读保留，新回调目的地单独绑定。

执行聊天的权限收据必须来自自身实际 `turn_context`，包含 `threadId`、`model`、`reasoningEffort`、`sandboxMode`、`approvalPolicy`、`verifiedFromActualHostContext`、`actualContextPath`、`actualTurnId`。工具重新检查该精确聊天最新上下文；主控权限或提示词不能替代。服务收据包含本轮父／子 UUID、PID、完整命令行、OS owner、UTC ISO 格式 `processCreationDate` 与启动前 `mirrorBefore`。派发前再次核对 127.0.0.1:30002、既有 ServerNext 数据路径、Foundry 14.368、实际世界／系统与候选字节。失配不调用消息派发函数。

```powershell
bun run foundry:ops acceptance prepare-runtime --input="<本轮运行请求绝对路径>"
bun run foundry:ops acceptance ready-runtime --contract="<返回的运行合同>"
bun run foundry:ops acceptance claim-runtime --contract="<同一运行合同>"
```

`claim-runtime` 在再次检查后原子领取一次派发；它自身不发送消息，返回 `transport:NOT_SENT`、`runtime:NOT_EXECUTED`。获准的宿主随后用原生聊天工具派发到合同子 UUID，并保存实际运输回执。若消息失败，保留领取状态并检查，不能自动重放；再次领取会被拒绝。执行聊天在第一项 E2E 前仍需核实自己新一轮的实际配置。派发后按 chrome-delegation-dev 等结果回调，不轮询。

运行回执输入包含 `binding:{dispatchId,contractRevision,contractSha256,parentThreadId,childThreadId}`、`nativePath`、独立 `contextPath` 和非空 `evidencePaths`。使用本轮合同自动取得这些字段；原生宏仍使用旧 `sourceDispatchId`，两者分别核对。

```powershell
bun run foundry:ops acceptance collect-runtime --contract="<本轮运行合同>" --input="<已保存证据清单>"
```

工具固定原件和证据指纹、按实际数值／记录判断 API 数据观察，并幂等读回同一收据。成功收集仅为 `runtime:OBSERVED`，界面、玩家角色、刷新持久化、错误归因与完整归属清理仍需父任务查看实际证据；总体验收保持 INCOMPLETE／父审 PENDING，退出 2。截图存在、PASS 标签或 `phase:cleaned` 都不会自动变为完整接受。必要步骤完成后，由父任务另行记录语义判定及剩余范围。

### 接续时怎样读验收结果

先读任务的当前状态和对应独立验收记录，再决定是否执行下一步。共用工具保存的 INCOMPLETE／PENDING 表示还有人工语义出口，不等于实际任务一直未完成。独立父审可以接受已核对的限定行为、恢复和清理；原收据保持不变，两个层级分别留证。已经闭合的批次不重放，新候选、范围变化或实际缺陷另立任务边界。

Vision5e + Item Macro 的限定实机链已完成父审和精确清理，见 [实机闭合记录](../../docs/reviews/2026-09-30-development-feedback-next-vm-runtime.md)。这份记录证明该批次的限定接受；旧离线合同仍是 NONE，其他迁移批次仍暂停，不能由本次接受推导全部模块兼容或世界零错误。

## 本地资产只读盘点

运行：

```powershell
bun run foundry:ops assets inventory --hash-concurrency=4
```

它会读取已经注册的本地 Foundry Lab 资产，分别生成以下八类 manifest：

- Foundry 程序和 Node 运行时；
- 模块；
- 游戏系统；
- 世界；
- 备份；
- 验收、诊断和审计证据；
- 历史归档；
- 临时工作区和可重建缓存。

每个普通文件都会记录相对路径、体积、SHA-256、修改时间和文件系统访问时间。访问时间只是 Windows 文件系统提供的尽力信息，可能被延迟或关闭，不能单独证明“最后一次实际使用”。模块、系统和世界还会读取顶层 manifest 中的 ID、版本和公开来源 URL；本地文件 URL 不会写入报告。

报告默认写入忽略目录：

```text
.local/foundry-v14/inventory/asset-inventory/<timestamp>/
```

其中 `summary.md` 是短摘要，`manifest.<category>.json` 是分类型实物清单，`duplicates.json` 和 `duplicates.md` 是完整的字节级重复项报告。“理论重复体积”不是删除建议；同一文件出现在 world、backup、evidence 和 archive 中，可能分别承担运行、恢复和审计职责。

扫描器不会跟随符号链接或 Windows junction，也不会扫描凭据目录、认证 cookie 或 Foundry profile 的 `Config`。遇到未授权链接、扫描期间变化或读取失败时，报告会标记为不完整并返回非零退出码。生成报告本身是唯一写入行为；命令不会复制、移动、删除资产，也不会访问生产环境。

## `.local` 全范围登记

Stage 5A 的 hash 清单只覆盖已经确认 owner 的 Foundry Lab 资产。要检查仓库里是否又出现未登记的本地目录或文件，运行：

```powershell
bun run foundry:ops assets scope
```

该命令只枚举 `.local` 顶层，并把每一项标成：

- `已分类`：已经确认生产者、使用者、可重建性和保留级别；
- `隐私排除`：知道它是什么，但不会递归读取浏览器 profile、OAuth、cookie、桥接状态或截图内容；
- `待人工判断`：实物存在，但现有仓库证据不足以证明 owner 或 canonical copy，必须保留并等待单独决定。

报告默认写到 `.local/foundry-v14/inventory/scope-coverage/<timestamp>/`。其中“范围完整”只表示当前每个顶层条目都已登记；只要仍有“待人工判断”，所有权分类就仍然不是完整状态。无论两者为何值，报告都不构成迁移或删除授权。

## 外置迁移方案（只生成报告）

```powershell
bun run foundry:ops assets migration-plan
```

该命令读取最近一份完整资产清单，按“世界与备份 → 证据与归档 → 程序/模组/系统 → 可重建缓存”生成逐批复制、精确对账、旧路径兼容窗口、回滚和恢复抽样方案。没有选定目标目录时，报告会明确停在“等待选择目标”；即使指定了专用空目录，也只会标记“可以申请复制授权”，不会创建目标、复制、切换、移动或删除任何资产。

目标目录以后由用户单独决定：

```powershell
bun run foundry:ops assets migration-plan --target-lab-root=J:\fvtt-lab
```

报告默认写到 `FVTT_OPS_LAB_ROOT/inventory/migration-plans/<timestamp>/`。目标必须在仓库和当前实验环境之外，不能是磁盘根目录、链接/联接路径或混有其他内容的目录。选择目标不等于授权复制；实际复制、短时 Foundry 验收和旧目录退役分别需要后续授权。

## 生产只读盘点

按照 [ADR-0005](../../docs/decisions/0005-production-read-autonomy-and-write-authorization.md)，代理可以自主执行生产 inventory/acquire 等只读操作，不必先进行一轮对话确认。以下三道机械保险和目标身份核对仍然全部保留；它们用于防止误连或把计划误当执行许可，不能被命令别名或私有 handoff 绕过。

生产只读命令必须同时满足三件事：

1. 命令带 `--apply`，表示不再只是查看计划；
2. 命令带 `--allow-production-read`，表示本次明确允许连接生产服务器读取；
3. 主机、数据路径和 SSH 身份文件通过外部环境变量提供。

例如：

```powershell
$env:FVTT_OPS_PRODUCTION_SSH_TARGET = '你本机 SSH 配置中的别名'
$env:FVTT_OPS_PRODUCTION_DATA_PATH = '生产 Foundry 数据目录'
$env:FVTT_OPS_PRODUCTION_SSH_IDENTITY = '本机私钥路径'
bun run foundry:ops production inventory --apply --allow-production-read
```

仓库不再保存具体生产主机或生产数据路径。缺少配置时，命令会在建立连接前失败。

如果下一步会安装模块、重启服务、hydrate 世界内容、迁移数据、写 LevelDB 或产生任何其他生产写入，必须在第一项写入发生前停止并向用户取得明确授权。只读盘点的许可不会自动延伸为写入许可。

## 共享 Server Mirror

当前配置的本地 v14 Lab 是 `F:\FoundryLab\foundry-v14`，默认复用的数据目录是 `F:\FoundryLab\foundry-v14\data\server-mirror`。使用前核对 PID、端口、路径和运行者；若其他参与者正在使用，等待或协调释放，不擅自停止，也不复制另一整套 Lab。

- 需要现成角色、场景、物品或合集的人工/玩法语义验收，默认使用持久世界 `cor-cotn`。修改既有文档前记录原值，结束后恢复；临时对象必须可识别并清理。
- 干净隔离、模块组合、迁移/恢复、故障注入或可能污染世界的测试，使用 `fvtt-v14-module-matrix` 或测试创建的随机临时沙箱。
- 身份预检、本地模块安装、启停和短时测试无需再次询问；这些本地权限不代表生产授权。

## 本地路径配置

这些变量都是可选的；当前机器通过用户级配置指向 F 盘 Lab。未配置的其他环境仍使用代码定义的兼容默认值，不得据此重建已退役的仓库 `.local/foundry-v14`：

| 环境变量 | 用途 |
|---|---|
| `FVTT_OPS_LAB_ROOT` | 本地 Foundry 测试根目录 |
| `FVTT_OPS_EVIDENCE_ROOT` | 本地证据和报告根目录 |
| `FVTT_OPS_BACKUP_ROOT` | 本地备份根目录；默认是 `FVTT_OPS_LAB_ROOT/backups` |
| `FVTT_OPS_FOUNDRY_ZIP` | Foundry 安装包路径 |
| `FVTT_OPS_WORLD_ID` | 默认世界标识；有精确安全限制的命令仍会校验自己的固定测试世界 |
| `FVTT_REFERENCE_CACHE_ROOT` | 独立的大型参考资料缓存；默认仍为仓库内 `.local/references`，不会跟随 Foundry Lab 一起迁移 |

所有可写根目录仍经过路径逃逸、符号链接和 Windows junction 检查。配置成磁盘根目录或仓库根目录会被拒绝。

## 旧命令兼容

旧的 `bun run foundry:lab ...` 仍然可用，但 `scripts/foundry-lab/cli.ts` 现在只是一个兼容入口：它先进入 Foundry Ops 权限检查，再执行这里的正式实现。旧的实现文件也只保留简短转发层，避免已有导入路径突然失效。

`src/tools/world-audit`、`src/tools/production-migration` 和三个历史工具入口同样只保留兼容转发。正式测试已经和实现一起迁入本目录。

## 长时间验证边界

Foundry／Chrome 工作沿用根说明，不设固定总时长上限；单操作保留超时，不能用重复短测代替真实长时验收。四小时或其他长时测试只在用户明确要求相应验收时运行；真实会话仍需真实使用证据。工具回归或文件侧收据不能关闭这些门禁。
