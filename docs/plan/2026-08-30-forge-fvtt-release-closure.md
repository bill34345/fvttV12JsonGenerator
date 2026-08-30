# Forge A–E Unified Release Closure

- 日期：2026-08-30
- 状态：active，发行写操作待一次统一授权
- 产品基线：`codex/forge-fvtt-product@925377eb97d53c5995718be8a90b96a497fac9e5`
- Closure WorkTree：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260830-211947-forge-release-closure`
- Closure branch：`codex/20260830-211947-forge-release-closure`

## 目标与非目标

本计划把 Forge A–E 作为一个产品收口：统一 README、support matrix、安装与使用文档，建立可复现的 Foundry module ZIP，在干净本地 Lab 从 ZIP 安装并做真实启动/UI smoke，最后形成版本、tag、release notes、产品分支与 `master` 落地证据。它不开发 Task F，不扩大 Provider、runtime、生产或后台 owner 支持边界。

## 完成标准

1. 根 README、模块指南、support matrix 和 release notes 对 A–E 功能、exact target、accepted-only、client-local storage、页面关闭行为和未验收层级表达一致。
2. `module.json`、package、构建常量、ZIP、manifest asset、下载 URL 和 tag 全部为 `0.1.0` / `fvtt-json-forge-v0.1.0`。
3. 两次 fresh release build 的 ZIP 字节与 SHA-256 相同；archive 精确包含六个 module 文件，根级 `module.json` 与独立 manifest asset 字节一致，checksum 文件可验证。
4. 唯一 `server-mirror` 空闲且身份核对通过后，从 ZIP 对 exact module 目录做无备份 clean install；在 `fvtt-v14-module-matrix` 以 Foundry `14.364` / dnd5e `5.3.3` 启动，真实 GM 页面确认模块 active、三个菜单存在且三个页面可打开；manifest/runtime 注册与 focused tests 共同确认 GM-only gate 没有被弱化。smoke 不调用 Provider、不写世界 Document、不接触生产/LevelDB。该世界没有可直接登录的非 GM 用户，因此本轮不把非 GM 真实登录写成已执行。
5. Forge focused/release tests、packages/module typecheck、architecture、build、`git diff --check` 和适用全仓门禁运行并如实分层报告；继承失败不能掩盖。
6. commit/push/merge/tag/GitHub Release 前提交一次精确清单，列出 commit 意图、分支/SHA、master dirty overlap 证明、tag、release assets/hashes、release notes、命令顺序与停止条件；只有用户统一授权后连续执行。

## 版本与发布身份

- Module version：`0.1.0`。A–E 已形成可用产品，但 exact-target、GM-only、生产未验收和后台 owner 非范围使 `1.0.0` 过度承诺。
- Tag：`fvtt-json-forge-v0.1.0`，使用模块命名空间避免单仓库其他 module release 冲突。
- Release assets：`fvtt-json-forge-0.1.0.zip`、`fvtt-json-forge-module.json`、`SHA256SUMS.txt`。
- Manifest URL：稳定 raw `master` 路径；download URL：精确版本 tag asset。禁止使用仓库全局 `releases/latest`，因为它可能指向其他 module。

## 发布顺序

1. Closure topic 完成文档、release builder/test、Lab smoke 和最终复核。
2. 用户一次授权后提交 closure topic；重新核对远端仍分别是已审计的 product/master 基线，然后把同一 closure SHA 以普通 fast-forward push 直接落到远端 `codex/forge-fvtt-product`。Git 若判定 non-fast-forward 则停止，不重写历史。
3. 把同一 closure SHA 以普通 fast-forward push 直接落到远端 `master`；不进入或移动旧产品 WorkTree 的本地分支引用，也不在 dirty 主工作区切换、merge 或更新本地 `master`，从而保持用户文件与旧 Task WorkTree 原样。发布后本地引用落后远端是刻意的保护结果，不自行“同步”或清理。
4. 在同一 closure SHA 创建 annotated tag `fvtt-json-forge-v0.1.0` 并 push；从 tag fresh build/verify release assets，先创建 draft GitHub Release 并上传三项资产。
5. 核对 draft 资产后先 publish Release，使版本化 download URL 可达；再 fast-forward push 同一 SHA 到远端 `master`，最后核对 tag、release target、asset 名称/大小/SHA-256、raw manifest/download HTTP 可达性和两个远端分支 SHA。这样 `master` 首次公开安装 manifest 时，其下载资产已经可用。

## 权限与停止条件

- 当前允许本 closure WorkTree 修改、构建、测试和本地 Lab clean install smoke；不允许 commit、merge、push、tag 或公开 Release。
- 不操作生产、LevelDB、旧 Task WorkTree、旧浏览器现场或主工作区用户文件；不 stash/reset/自动清理。
- 发现主工作区 overlap、远端漂移、Lab 被其他参与者占用、ZIP/manifest/hash 不一致、runtime/UI smoke 不符合文档，或高影响复核未通过时停止并提交最小修复范围。

## 本轮验收证据

- 发行 ZIP：`fvtt-json-forge-0.1.0.zip`，SHA-256 `08a477c5b6abb16c5073019227fe30d35f49f2b4e53e90f4026a85ec70044550`；独立 manifest SHA-256 `02d87a36d5856f283fbafdfe8cbf6fa44bcf803a9c43d89a89745f612350b880`。
- archive 精确六个文件；两次 fresh build 字节一致；ZIP 内 manifest 与独立 manifest asset 字节一致。
- 本地 Lab 从 ZIP clean install 后，Foundry `14.364` / dnd5e `5.3.3` 识别 `FVTT JSON Forge 0.1.0`；在专用 matrix 世界启用并重载后，`FVTT JSON Forge [3]`、Forge Actor、Forge Item、Forge Intake 均可见且页面可打开。
- 人工查看 Intake 界面确认只读 bundle、Managed Source Library、Collection/ZIP/Queue、accepted-only 审阅创建区及页面关闭语义与文档一致；Forge 相关浏览器 warning/error 为 0。既有 Calendaria Journal 类型错误与本模块无关，作为 Lab 基线噪声单独保留。
- smoke 后受管 Lab 已停止，PID 与 30001 监听均消失；无 Provider 调用、无世界 Document 创建、无生产或 LevelDB 操作。
- 全仓测试最初如实复现产品基线的两条陈旧断言：Protective Field closed summary 误把 `override:false` 的 range 当作有效 native range，v14 Item AC 误期待 Actor-oriented formula。未修改 CRITICAL-impact 的生产生成器；改为对照来源、strict projection、锁定 dnd5e 5.3.3 Item 契约和既有 Shield runtime 证据校正测试，并把 Item browser runtime 加入 focused suite。最终 focused 为 `191 pass / 0 fail / 1986 expect()`，全仓为 `2325 pass / 0 fail / 12375 expect()`。
- 独立发布复核把继承的 `foundry-modules/fvtt-selected-token-sync/AGENTS.md` 显式清单缺口判为公开发行 P2。Closure 仅把这个已经 tracked 的 AGENTS 文件登记进全局治理清单，不修改其 owner 或运行逻辑；对应单测 `11/11`、`agents:generate` 与 `agents:check` 均通过，根 AGENTS 无生成漂移。
- 该修正让 `ci:verify` 越过环境、隔离、AGENTS 和全部 TypeScript 门禁，并暴露 7 个 Forge 测试文件的既有静态类型漂移；逐项对照当前生产契约后仅修正 test fixture/narrowing，针对性 `typecheck:all` 与 `97/97` 测试通过，没有修改生产 Forge 行为。
- 完整 CI 仍**不是绿色**：aggregate wrapper 的 Knip cycle 步骤持续高 CPU 20 分钟未返回，已在 30 分钟硬边界前终止；独立 coverage 主组 `2311 pass / 0 fail / 14 filtered`，但 production lines `78.27%`、functions `75.65%`，低于 `84%`/`85%` 门槛；独立串行 CLI 聚合也在 `tests/cli-item-intake.test.ts` 持续高 CPU 15 分钟未返回。anti-overfit `414` sources、hygiene `1262` paths、locked reference、Web build 和 offline Actor smoke 独立通过。公开发行若不先补齐覆盖率与性能门禁，必须由用户对这组精确失败作显式 waiver；普通发布授权不自动包含 waiver。
