# B99 — 仅清理和停止 Lab

只有 Sol/用户在检查 B90 报告后明确授权执行本批，Luna 才能开始。测试结果好坏不是自动清理授权。

1. 先再次证明 foreign-document disable-survival；通过 Foundry UI 禁用 Battlefield Painter，确认 GM 控件消失、玩家仍无控件。
2. 枚举所有 `BP-ACCEPT-20260815-B` fixture，逐个核对名称前缀、创建批次和 ownership。只通过 Foundry UI/公开 Document API 删除这些任务 Scene、Actor、Token及其 embedded owned/foreign fixtures；不得碰无前缀世界对象。
3. 恢复测试前启用模块集合，保留 Battlefield Painter 安装目录但禁用；记录最终安装 hash。
4. 用正式命令停止 `server-mirror`，确认任务 PID 消失、30001 无监听；只读确认 8080/51020 未被触碰。
5. 保存 `BP-E2E-B99-*` 清理清单和最终 Git 状态。不删除 worktree，不 commit、merge、push，不创建备份。

删除使用 Foundry 公开接口；若必须删除精确任务安装外的本批临时文件，仍不得使用 `Remove-Item -Force`。任何所有权不明对象立即停止并报告，不扩大删除范围。
