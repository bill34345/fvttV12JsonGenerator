# 共用验收指南接续纠错与小任务复用

日期：2026-09-30。结论：文档范围接受；允许本任务提交并合并 master，暂不 push。

## 实际问题与修正

master 的试点计划和限定实机记录已确认 Vision5e + Item Macro 的行为、恢复和精确清理完成，但开发反馈指南仍写“完整第二消费者 D 仍等获准的实机链路”，Ops 说明还把离线准备时“没有实机读回”写成当前状态。这会让接手者误以为应重放已闭合批次。

本次更新指南和 Ops 说明的完成记录引用；手册增加接续前读当前状态与独立验收记录的步骤。共用收据的 INCOMPLETE／PENDING 保留自动层边界，独立父审可以接受已经核对的限定结果，原件不改写。离线 NONE 和其他批次的暂停保持原范围。运行代码与界面交互没有修改。

本机 PowerShell 7.6.5 的实际往返还显示：子命令 JSON 与 $LASTEXITCODE 都是2，默认外层进程报告1；显式传递原生值后外层也是2。Ops 说明补充退出码传递和 JSON 状态核对，避免误判业务 FAIL。

## 来源、归属与实际流程

起点 master 为 `e5c3dd66e9632ee45cfda2e9deb8cb4a80df0c4b`，指令基线自动取得 `425e3880adab0b3b87dd11c75bd33c0132eef679`。修改树为 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260930-222439-feedback-handoff`，分支 `codex/20260930-222439-feedback-handoff`。主区索引为空，原5个 dirty 路径与任务增量无交集；原审计、ServerNext、WMP 树分别12／368／161个 dirty 路径，保持既有归属，不导入它们的未提交成果。

直接读取 F 盘已完成批次的 `parent-final-review.json` 与当前交接：父审 ACCEPTED_LIMITED_SCOPE，恢复／清理／Macro闭合 PASS，根对象和辅助宏残留为空，阶段 PARENT_ACCEPTED_CLOSED。该原件绑定收据 `5065ee6e-e95a-478b-9c94-3401ce54dfec`，未改写或重演旧实机链。

复用现有文件侧工具和 `manual` adapter，完成 prepare → ready → 一次 handbook:check → collect → resume。最终 run 为 `b8173146-60b9-4602-ab9a-47cc25f3d1e3`，dispatch 为 `954adfbc-a855-44b4-af85-a614f4b49d81`，收据为 `7dbd509a-cd9c-4e7b-9707-2975e369e665`。自动层保持 INCOMPLETE／COMPLETE／NOT_REQUIRED／PENDING；resume 回到 REVIEW 并指向同一收据。独立文义、原件和生成内容核对另存 `.local/feedback-handoff/parent-review.json`，结论 ACCEPTED_DOCUMENTATION_SCOPE。

## 检查与测量

- 实际 handbook:check 输出 PASS，28项来源、命令、指纹与生成页面一致。作者只核对受影响的 foundry-ops 条目，再生成根HTML；新增步骤及退出码说明已从生成内容读回。
- 16个候选／指令／执行程序／只读来源身份独立复算均一致；原始检查退出0，stdout指纹与收据一致。指南新链接存在，过时“等待实机”与“当前没有读回”的状态已消除。
- `bun run agents:generate` 与 `bun run agents:check` 通过，32个必需文件。仅说明修改，按根规范不跑无关类型／全仓／玩法／长时检查。
- 未执行新的 Foundry 或 Chrome 操作。HTML读取核对仅证明生成内容，未补做浏览器渲染；此前已记录的 file URL 政策拒绝不重试。

首次测量UTC `2026-09-30T14:23:22Z` 至文档父审 `2026-09-30T14:38:44.8862728Z` 为 922.886 秒；此前选题过程未计入，主动工作／等待没有分别归账。依赖安装819包用18.40秒。

准备／调用脚本纠错4次：JavaScript模板字符串冲突、快照输出截断、PowerShell外层退出码断言、CRLF结尾断言。分别修正输入、输出范围和读取方式，未发生无新证据的同路重试；没有人类介入、业务返工或fixture重建。共准备2个合同、执行2次文档检查：第二次对应退出码说明的新修改，第一份合同和收据仍保留。正式玩法重放为0。

## 后续边界

这是一件实际需要的文档接续修正，证明现有工具可复用并保留人工出口；不计作第三项复杂度相近的业务集成。三任务比较、token归账和提速结论仍未完成。下一件已授权业务小任务继续复用已有能力，仅补它实际需要的接口；其他迁移批次不由本文恢复。
