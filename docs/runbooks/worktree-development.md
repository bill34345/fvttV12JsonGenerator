# 短寿命 Worktree 开发与发布

本手册适用于所有会修改本仓库文件的任务。只读审计可以留在主工作区；开发、生成、测试和 topic commit 必须在独立 worktree 中完成。

## 1. 建立可靠基线

在主仓库只读检查：

```powershell
git status --short --branch
git worktree list --porcelain
git rev-parse --verify master
```

先判断任务是否依赖主工作区未提交成果：

- 不依赖：从当前已提交 `master` 创建 worktree。
- 依赖：停止并向用户说明重叠文件；等待用户决定如何把成果整理为已提交基线。不得自动 stash、自动提交、复制整棵脏工作区或从旧 `HEAD` 假装获得最新实现。

## 2. 创建唯一 worktree

`<task-slug>` 使用简短的小写 ASCII 与连字符；时间戳防止复用未知分支或路径。

```powershell
$repo = (git rev-parse --show-toplevel).Trim()
$parent = Split-Path -Parent $repo
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$taskSlug = '<task-slug>'
$name = "$stamp-$taskSlug"
$worktreeRoot = Join-Path $parent 'fvttV12JsonGenerator-worktrees'
$worktreePath = Join-Path $worktreeRoot $name
$branch = "codex/$name"

if (-not (Test-Path -LiteralPath $worktreeRoot)) {
  New-Item -ItemType Directory -Path $worktreeRoot | Out-Null
}
git worktree add -b $branch $worktreePath master
```

创建后确认 `git -C $worktreePath status --short --branch` 只显示新 topic 分支。修改任何子目录前，在新 worktree 中读取根及最近的局部 `AGENTS.md`。

## 3. 开发和验证

- 只在 topic worktree 修改、生成和测试。
- 只暂存任务范围内路径；不使用 broad staging。
- 记录相关 focused checks、完整门禁和人工语义样本。机械绿色不能替代真实验收。
- 用户尚未授权发布时，不 commit、merge 或 push。

## 4. 一次发布授权后的顺序

获得一次明确的 commit/merge/push 授权后：

1. 在 topic worktree 按意图 commit。
2. 获取最新 `master` 状态；若 topic 已落后，在 topic worktree 吸收 `master`、解决冲突并重跑相关验证。
3. 在主工作区记录基线：

   ```powershell
   git status --porcelain=v1 -uall
   git diff --binary
   git diff --cached --binary
   git diff --name-only master...<topic-branch>
   ```

4. 主索引非空、topic 改动与既有 tracked/untracked 路径重叠，或无法证明 merge 后原基线不变时，停止并报告；不得 stash、自动提交用户改动或在另一 worktree 背后移动 `master` ref。
5. 安全时在主工作区执行 fast-forward：`git merge --ff-only <topic-branch>`。若不能 fast-forward，回到 topic worktree 完成受控整合和重验，不在脏主树即兴 merge。
6. 重新采集主工作区 status/diff/untracked，证明发布前用户基线逐字节保持不变。
7. `git push origin master` 后比较 `master`、`origin/master` 与预期 commit。

`<topic-branch>` 是本任务创建的完整 `codex/<timestamp>-<task-slug>` 名称，不得用模糊分支名替代。

## 5. 清理

只有同时满足以下条件才可清理：topic 已集成并按授权推送；worktree clean；路径和分支确为本任务创建；没有其他参与者使用。

```powershell
git worktree list --porcelain
git -C <worktree-path> status --short --branch
git worktree remove <worktree-path>
git branch -d <topic-branch>
git worktree prune --dry-run
```

`<worktree-path>` 是第 2 节得到的精确绝对 `$worktreePath`；`<topic-branch>` 是同一节得到的 `$branch`。尖括号只是说明占位符，执行前必须换成该任务的真实值。

若 `git worktree remove` 拒绝，停止并报告精确对象和原因；不得强制删除目录、不得改用 `Remove-Item -Force`。
