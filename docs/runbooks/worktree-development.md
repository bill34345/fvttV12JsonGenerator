# 短寿命 Worktree 开发与发布

修改仓库代码、提示词、配置、模板、测试或文档，以及相关构建、测试和 topic commit，使用独立 worktree。只读审计与仅使用现有工具的个人资料转换可以留在主工作区。

## 纯资料转换

个人资料统一保存在仓库外的固定目录 `I:\OpenCode\fvttV12JsonGenerator-data`。每只生物按名称建立子目录，保存来源和生成结果；有用的诊断也放在对应目录，不纳入 Git：

```text
I:\OpenCode\fvttV12JsonGenerator-data\
  creatures\
    <creature-slug>\
      source.md
      actor.json
```

在主工作区复用现有程序和依赖，显式指定仓库外的输入与输出。将 `<creature-slug>` 替换为本次生物名称，并先准备好来源 `source.md`：

```powershell
Set-Location 'I:\OpenCode\fvttV12JsonGenerator'
$taskData = 'I:\OpenCode\fvttV12JsonGenerator-data\creatures\<creature-slug>'
bun run src/index.ts "$taskData\source.md" -o "$taskData\actor.json" --fvtt-version 14 --effect-profile core --icon-mode off
bun run verify:actor "$taskData\source.md" "$taskData\actor.json"
```

这类任务不创建 worktree 或分支。工具原有默认路径不变；来源 → CLI/Web → workflow → parser/generation → verifier 的生成链和来源语义核对继续执行。目标版本与效果模式仍遵从任务要求。

转换中发现工具问题时，保留本地输入、产物和诊断；需要修改仓库实现时，再按下面的开发流程处理。个人转换资料不因工具修复而自动纳入 Git，回归 fixture 单独按开发范围维护。

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

- 仓库修改及其构建、测试只在 topic worktree 进行；纯资料转换按上节复用主工作区并写入仓库外目录。
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

变更用户可执行入口、输入或输出、支持版本、操作步骤或安全限制时，topic 必须包含同步更新的中文工具条目、人工核对记录与生成的根 `工具手册.html`。内部实现、测试或重构先核对这些用户信息并记录结论；既有 watch 在本次必需的手册检查或 CI 中报 stale 时，仍须人工核对受影响条目、更新 review 和页面，不要求改写正确的说明，也不缩小目录覆盖。合并前通过 `bun run handbook:check`；合并后在 master 再次运行同一检查，打开受影响条目核对本次功能。若合并引入新的实现组合，回到 topic 核对并重新生成，不在主工作区即兴修补手册。完整维护步骤见 [手册维护流程](handbook-maintenance.md)。

`<topic-branch>` 是本任务创建的完整 `codex/<timestamp>-<task-slug>` 名称，不得用模糊分支名替代。

## 5. 清理

先建立内容保留证据，再应用清理权限和归属门禁。`git status` clean 只覆盖 Git 工作状态；主线有类似实现只说明后继能力存在，两者均不能证明整棵目录的内容可删。

对精确 worktree 范围分别判断四类内容：

| 内容 | 必要证据 |
| --- | --- |
| 已提交内容 | 固定 HEAD、保留仓库／branch 或 tag／目标 commit，核实对象可读及祖先关系。保留分支只证明提交仍在，不等于已经集成或推送。 |
| tracked dirty | 暂存区与工作区分别列出路径和版本，逐项写处置、可恢复位置并读回原字节；暂存版本不能被工作区新版本替代。删除、冲突、文件模式／链接等差异另保留意图证据，未解决则保持未知。 |
| untracked | 清点精确文件；需保留的内容逐项读回外部现存位置或可达 Git 文件，不能因未跟踪就判废。 |
| ignored | 包括 `.local` 中的合同、原始收据、手工产物和输入。需保留的内容同样逐项证明；可重建缓存须明确理由，规则命中本身不是无价值证明。未清点范围保持未知。 |

复用既有资产范围盘点定位所有权，再用[保留请求示例](../templates/worktree-preservation.example.json)核对内容。`entries` 的 kind 为 `index`、`worktree`、`untracked` 或 `ignored`，路径为精确仓库相对文件名；与实时 Git 清单逐项对齐。`retain` 的 recovery 指向删除范围外已经存在的文件，或有固定 branch/tag 与 commit 的 Git 文件；工具读回源和目标 SHA-256。`regenerable` 仅接受未跟踪／ignored 文件及具体理由，这是人工声明，不是工具证明可重建。原件没有可核保留位置时保留原工作树；本项目不为凑证据自动制作副本或备份。

```powershell
bun run foundry:ops acceptance inspect-preservation --input="<保留请求绝对路径>"
```

检查直接列出 Git 暂存、工作区、untracked 和 ignored 文件，不保存内容、不执行清理。缺失、失配、未分类、输入 `unknowns` 非空或未集成提交均为 `INCOMPLETE`／退出 2；已读回且声明齐全才是 `EVIDENCE_COMPLETE`／退出 0。删除意图、冲突、链接／子模块和权限／模式变化需单独核对，此最小入口不为它们制造字节 PASS。大目录枚举失败也保留未知。`deletionAuthorized` 始终为 false，本地 ref 不是远端推送证明。检查是时点证据；执行前重核 owner、内容变化与授权。

既有历史取证沿用[退役台账](../reviews/2026-10-02-retirement-and-integration-ledger.md)的口径：50 项原版本尚未完整重建仍为未知，既不写永久丢失，也不写全部恢复；未作库存的 ignored 内容不作 PASS。

只有同时满足以下条件才可清理：已取得针对精确对象的清理授权；topic 已集成并按授权推送；worktree clean；需保留内容有独立读回证据且范围无未知项；路径和分支确为本任务创建；没有其他参与者使用。上述检查结果本身不构成清理授权。满足后才执行下面的既有流程：

```powershell
git worktree list --porcelain
git -C <worktree-path> status --short --branch
git worktree remove <worktree-path>
git branch -d <topic-branch>
git worktree prune --dry-run
```

`<worktree-path>` 是第 2 节得到的精确绝对 `$worktreePath`；`<topic-branch>` 是同一节得到的 `$branch`。尖括号只是说明占位符，执行前必须换成该任务的真实值。

若 `git worktree remove` 拒绝，停止并报告精确对象和原因；不得强制删除目录、不得改用 `Remove-Item -Force`。
