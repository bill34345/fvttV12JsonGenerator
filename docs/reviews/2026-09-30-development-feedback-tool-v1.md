# 开发反馈工具第一版：验收记录

日期：2026-09-30。目标：先独立整合已准备规范，再交付可复用的最小文件侧验收能力。用户授权本任务 commit／合并到 master，暂不 push；未授权整合其他业务树或操作生产。

## 基线与归属

起点 master 和审计树均为 `e8604d64e48b354b2954210f2959ce8cf734ecc9`。master 有 5 个既有未提交路径且索引为空，规范没有与其重叠。WMP 树有 161 个 dirty 路径，ServerNext 树有 368 个；二者在 package、手册及部分 Ops 入口与本次新工具有未来整合重叠，但这些未提交实现不进入本增量。

本任务唯一写入树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20260930-104207-development-feedback`，分支 `codex/20260930-104207-development-feedback`。从已提交 master 建立，按明确清单导入获准的规范及被引用审计依据；原审计树保持原状。规范独立提交 `2bcf169d60e8acfc3d5a304125f7b7b60db06147` 已在主区 fast-forward 整合。工具建立在该提交之后，保留其历史审计口径。

## 实现与已有能力

入口、格式与退出码：[Foundry Ops 说明](../../tools/foundry-ops/README.zh-CN.md#共用验收工具文件侧第一版)、[文件侧请求](../templates/development-feedback-request.example.json)。共用已有的权限目录、路由、路径／junction 检查和 `runCommand()`。子进程入口只增加显式环境与可观察 timeout 字段，既有默认行为和脱敏仍通过回归。

- prepare 固定绝对路径、分支、HEAD、指令基线提交、适用 AGENTS／runbook 与候选／执行程序指纹；生成 run／dispatch ID，不手填机器字段。文件 JSON 写入后实际读回。
- 预检按依赖顺序执行，首个失败后停止后续检查。`dispatchPrepared()` 在核对与原子领取后才调用宿主回调；失败时派发调用次数为 0。
- execute 只运行合同内已审核的本地文件检查。领取记录、原始 stdout／stderr／退出码、收据均只新建；领取之后无法自动重放。超时和调用失败保留结果，resume 提示读现存状态。
- collect 绑定 run／dispatch／revision／case、合同与原始文件指纹；拒绝错 worktree、旧收据和变更原件。重复收集保持同一摘要，不覆盖其他内容。
- `json-ok` 只对明确的本地 JSON 检查判定；`manual` 保留人工语义出口。行为、证据、清理与父审分开，工具的 `parentReview:PENDING` 不能充当主控接受。本记录另行保存主控复核。

本版的合同是文件侧子集；完整任务模板仍描述后续 runtime、fixture、callback 等字段。没有浏览器 harness 重构、WMP 规则判定、世界写入、通用 DSL 或调度服务。

Foundry Ops 局部 AGENTS 与 README 的旧 30 分钟限制已对齐新根规范，同时保留单操作超时、真实会话证据与长时验收授权边界。Session Monitor 自己的专项会话接受规则未在本次工具范围中重写。

## 首批负例与检查

历史来源映射：[WMP 取证](2026-09-29-workflow-audit-evidence/wmp-process.md)中的 M:6015→M:6020（语法 exit 1 后仍派发）、M:6183／E:25898（派发缺绝对路径、查到 master），以及[试点 C 清单](../plans/2026-09-29-development-feedback-pilot.md#阶段-c随当前增量选择旧失败不设跨项目总门槛)。测试使用脱敏的故障形态和明确来源映射，未把完整历史会话或旧世界搬入 fixture，也不声称重放了旧战斗。

| 边界 | 实际结果 |
| --- | --- |
| 真实 `node --check` 语法失败，后续成功检查存在 | 首个失败停止；后续检查不执行，派发调用次数 0，领取文件不存在。 |
| exit 0 但结构化结果 false／空 | 预检拒绝，不能派发。 |
| 相对／逃逸／错误 worktree／junction 路径 | 写入前拒绝；同一 Windows 8.3 短路径与长路径经物理规范化可正确匹配。 |
| 候选、指令、分支或合同字节变化 | 回调前拒绝。 |
| 原件、revision、case、dispatch 或合同指纹不匹配；另一 run 收据 | 不生成通过结论。 |
| 空输出、只有 PASS 标签或无自动语义 adapter | 保留 INCOMPLETE，不提升为行为通过。 |
| 声明的本地 JSON 检查实际 `ok:false` | behavior FAIL、证据 COMPLETE、退出 1。 |
| 一次执行、重复收集与断在派发后的恢复 | 一次领取；摘要幂等；缺收据恢复到 INSPECT，不自动执行。 |
| 真实直接子进程超时 | 记录 timedOut，结束子进程，保存原件；再次执行被拒绝。 |

`bun run test:acceptance-tools`：**40 pass / 0 fail / 275 assertions**，包含权限／路由、既有脱敏、Windows 环境变量大小写下的生产设置排除和实际 CLI 子进程。`typecheck:tools`、`architecture:verify`、`test-isolation:check` 通过。没有运行无关全仓玩法矩阵或长测。

初次回归暴露 Windows TEMP 的 `ADMINI~1` 与 Git 的长路径差异；读取实际返回后复用物理路径解析修正。测试移除自有 junction 时 Bun `rmSync` 返回 EFAULT，随机 fixture 在结束时已清理；后续使用准确的 unlink API 移除自有 link，最终回归通过，没有强制删除或修改属性。工具测试目录均为随机临时根，未触及持久 Lab。

## 第一个实际消费者与父审

实际消费者为本次项目规范交付的既有 `runAgentsInstructionsCheck()`，使用其现有完整校验（Ruler 生成幂等、32 个必需文件、根一致、路由与指令链），没有另造一个容易通过的判定器。预检使用已授权的 tools typecheck；正式操作返回一个 JSON 并退出，收据、分类与恢复各走真实 CLI。

| 字段 | 原件 |
| --- | --- |
| worktree／候选 HEAD／instructionBaseline | 本任务树／`2bcf169d60e8acfc3d5a304125f7b7b60db06147`；实现处于待提交状态，具体文件 SHA 保存在合同。 |
| runId | `8fdb46c4-6fc5-4da4-871d-e251495cafff` |
| dispatchId | `953d0e93-bdd7-441a-af74-0eaaf798fbe7` |
| receiptId | `fd42d46c-b3d4-403b-a19b-bf754901fbfc` |
| 原始 JSON SHA-256 | `5116dc364385243e1bf2015266f927e708354d7a19190218c5cad645c5d2e2bd` |
| 独立读回 | 原件 stdout 的 `ok:true`、errors 空、requiredFileCount 32；原始文件哈希与收据一致。 |
| 自动摘要 | behavior PASS、evidence COMPLETE、cleanup NOT_REQUIRED、parentReview PENDING。 |
| resume | REVIEW；不会再次执行原检查。 |

原件目录为本任务树下 `.local/development-feedback/8fdb46c4-6fc5-4da4-871d-e251495cafff/`，请求和 CLI 输出位于 `.local/development-feedback-pilot/`。原件不提交，保持原始字节。主控复核只读核对检查器及实际原件，将文件侧结果接受为本版消费者证据；不改写自动摘要的待父审标签。局部说明修正后，前一合同实际以 instruction changed 拒绝；上述最终合同重新固定身份并完成受影响的同一链。前一原件仍保留，没有重写历史。提交改变 HEAD 后旧合同会正确拒绝作为当前操作合同；历史证据仍可只读复核。

## 交付边界与后续

工具说明、手册条目、人工 review 与生成的根 HTML 随工具一起整合。规范提交前后 handbook 检查已通过；工具提交前及合并后再按当前内容检查。最终主区 SHA、dirty 基线对账和实际整合结果由本任务最终回执及本任务树 `.local/development-feedback-pilot/closure.json` 记录；本记录保留测试时点身份。

阶段 A、首批 B／C 与首个文件侧 D 链成立。第二个不同消费者尚未验证；真实模块／迁移语义、Chrome 显示／导出、跨客户端、回调送达及去重、fixture 清理仍是后续，不能用本版结果关闭这些门禁。没有父子任务成本比较、三个匹配任务样本或提速百分比。本轮未委派、未启动／重启 Foundry、未连接生产、未 push，也未清理未推送的 worktree。
