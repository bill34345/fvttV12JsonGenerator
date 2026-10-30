# ServerNext 历史回归测试输入

迁移实现已经在主线。历史 Midi 6.0.2/local.9、DAE 与外部候选的离线测试还需要固定来源文件；现在把这些材料作为主工作区的本地测试输入保存，不再靠保留旧迁移 worktree 来运行测试。

## 保存内容与身份

`tools/legacy-next-inputs/manifest.json` 列出 170 个输入文件的相对路径、大小和 SHA-256，总计 220,267,059 字节（约 210 MiB），另保留 Midi 固定提交的 Git 对象和原始索引。内容包括实际被测试读取的 Midi 源文件、TypeScript 5.7.3 编译器、dnd5e 6.0.2 分发源码、DAE 14.0.14 原包、Classpack 4.3.4 原包及两个离线合集、对照分析数据，以及外部模块的少量固定源文件。

原包、第三方源码、合集和私有分析数据保存在忽略的 `.local/legacy-next-test-inputs/data/`，不提交到仓库。清单、准备工具、定位器和说明随主线管理。只读取清单内的文件，不复制整棵旧工作树、世界、凭据、上传配置或历史操作日志。LevelDB 的数字命名 `.log` 是数据库状态文件，保留；`LOG`、`LOG.old`、`lost/` 与上传临时配置排除。

Midi 输入保留锁定提交 `4338eeab85041cd71b76ede36818e2265cbf06ae` 的对象及索引，未使用的上游工作文件以 skip-worktree 标记省略。实际测试仍能比较原始 Git blob、五个预期修改路径、源码 SHA 和当前 checkout 的补丁。不会复制来源仓库的远端配置、凭据或历史日志。

## 一次准备

在要接收输入的项目 checkout 根目录执行。来源必须是已经持有清单全部输入、身份匹配的绝对 Git checkout 路径；下面占位符需换成实际路径。

```powershell
bun run legacy-next-inputs:prepare -- --source-root '<含已核对输入的checkout绝对路径>'
bun run legacy-next-inputs:prepare -- --source-root '<含已核对输入的checkout绝对路径>' --apply
bun run legacy-next-inputs:prepare -- --check
```

第一条只读取和校验，返回计划；`--apply` 才在目标的 `.local/legacy-next-test-inputs/` 创建独立输入。写前验证全部来源哈希和 Git 身份，写后重新读回，全部一致才产生 `ready.json`。来源不会被修改。`--target-root '<接收checkout绝对路径>'` 可以显式指定接收目录。

准备器拒绝覆盖已有输入库。失败后保留来源和不带 ready 标记的部分目标，报告具体错误；不要强制删除或用已有 ready 标记掩盖失败。完整输入库可用 `--check` 校验，它不再读取旧来源。

## 当前 checkout 与新 worktree 使用

定位顺序是：非空的显式 `FVTT_LEGACY_NEXT_INPUT_ROOT` → 当前 checkout 的已准备库 → 同一 Git 仓库主 checkout 的已准备库 → 当前 checkout 原有缓存路径。环境变量为空时按默认查找。主工作区准备一次后，新建 sibling worktree 可以共享它，无须重新导入或指向旧迁移树。清单失配、不完整 ready 或目录链接越出保存 checkout 时停止，不能静默跳过。

验证默认路线时先清除当前进程的历史覆盖，再运行当前候选测试：

```powershell
$env:FVTT_LEGACY_NEXT_INPUT_ROOT = $null
bun run test:legacy-next-inputs
bun run midi-qol:test
bun run test:classpack-next
bun run --cwd foundry-modules/server-next-external-candidates test
bun run --cwd foundry-modules/server-next-external-candidates test:dae
bun run --cwd foundry-modules/server-next-external-candidates test:dae-compendium-status
bun run --cwd foundry-modules/server-next-external-candidates test:item-piles
bun run --cwd foundry-modules/server-next-external-candidates test:vision-macro
bun run legacy-next-inputs:prepare -- --check
```

显式输入根仍用于经过核对的专项来源复用；它是包含原相对路径的根目录，准备库对应的是 `.local/legacy-next-test-inputs/data/`。测试实现、锁定文件、补丁和 Classpack 身份报告始终从当前 checkout 读取；不会从输入库导入旧的项目实现。

## 验收范围

这些检查证明材料完整、历史来源回归可运行。Classpack 的两个数据库查询先复制所需 pack 到本次随机临时测试目录，再打开和关闭它；原始 pack 的文件清单与字节需保持一致。当前 ClassicLevel 的 `readOnly` 参数不足以防止打开时轮换内部文件，所以不直接打开输入库中的数据库。

这些入口不安装模块、不启停服务、不打开运行中世界，也不重新声明现行版本的玩法接受。

这次只消除旧迁移树依赖。现有测试仍读取本机 `F:\FoundryLab` 的固定 Core/Node、系统方法、TCoE 对照来源与部分已保存接受收据；没有把这些依赖搬入输入库。全新机器或公共克隆仍须取得合法来源和相应参考环境，不能把本机通过称为通用自包含测试。历史固定版本不替代现行系统，旧 PASS 也不推广到新版本。

## 本地检查清单与严格历史源码门

2026-10-30 已按用户要求关闭 GitHub 自动 CI 并移除专用配置。本地综合检查和严格历史源码门继续保留。需要原包、合集、私有分析数据或本机固定 Core/Node 的原有测试，仍由 `src/tools/ciSourceContracts.ts` 明确登记；混合文件按准确命名区分来源用例与普通用例。

```powershell
bun run test:local-source-contracts
```

这个入口运行当前 checkout 的原有真实测试，不替换其来源哈希、版本、断言或失败条件。来源缺失、身份不符或测试失败都会非零退出；结果记录在 `coverage/local-source-contracts.json`。在已准备输入库的 checkout 执行 `legacy-next-inputs:prepare -- --check`；从 sibling worktree 核对共享库时，使用 `--target-root '<已准备库所在checkout的绝对路径>'`，测试定位器仍自动读取同仓库主 checkout 的材料。

未设置 profile 时，既有 `ci:verify`／完整覆盖率入口继续执行完整本地测试库存。需要单独检查可移植范围时，可在当前进程设置 `FVTT_CI_TEST_PROFILE=portable` 后运行 `bun run ci:verify`，随后清除该临时覆盖。这个变量只选择测试清单，不启动 GitHub 工作流。参考缓存仍按既有入口准备，bootstrap 与消费测试读取同一 `FVTT_REFERENCE_CACHE_ROOT`。

显式选择 portable 时，覆盖率清单将独立历史源码组标为 `NOT_EXECUTED` 并给出本地命令，不能据此声称完整本地回归通过。本地历史回归通过和真实 Foundry 接受分别记录。原始第三方材料和私有输入继续保留在 Git 外，覆盖率门槛、来源身份和失败条件保持。
