# Painter 收尾：本地集成范围（2026-10-05）

**范围已核清，用户随后已授权本地 master 集成。** 本文把本轮 Painter 成果、Mirror 14.368 兼容补丁、共用工具和已经进入主线的改动分开；下面的数量、HEAD 与首次收尾结果是授权前快照，继续作为文件范围依据。

## 本地集成授权与验证依据

用户2026-10-05明确要求“那合并到master吧”。按本文范围完成必要的 topic 提交、吸收 master `cdf387a`、冲突核对及本地 master fast-forward；不扩大到远端 push、Forge 0.4.0 蓝图业务源、安装/服务或工作树清理。Forge 的兼容补丁可以入主线，主线产品版本仍是 0.3.0，已有 Mirror 0.4.0 安装保持。

新增验证缺口仅是 **Painter/Mirror 候选与主线 validation-selection 的最终代码组合**，因此在吸收主线后执行必要的集成 CI，并完成指令生成/一致性、合并前后手册检查。旧实机行为按相同产品/客户端/目标证据复用，不因 Git HEAD 变化重跑。最终动作、提交身份、检查和停止状态见[本地集成结果](H:/CodexData/visualizations/2026/10/03/01a1010c-9d38-7421-9098-596a96bc261a/painter-master-integration-final-20261005.json)；该记录在最终 master 读回后保存。

实际集成门禁另暴露一份既有API测试的等待窗口问题：`apps/web/src/server/__tests__/api.test.ts` 中两个真实抓取案例等待终态由约1.5秒改为10秒，保持各案30秒总期限和其他案例原等待窗口。旧成功记录1534ms已贴近原界限，本轮1681ms失败后模拟站点被提前关闭并导致后续连接拒绝。该单文件是完成本次必需门禁的测试修复，计入最终集成清单；Web产品代码、抓取能力和授权没有变化，原231路径清单仍作为业务范围历史快照。

最终完整CI r3退出0：覆盖率3558 pass/1 skip/0 fail，369文件；全量anti-overfit、仓库卫生、精确参考验证、Web构建及Actor离线烟测也通过。CLI局部24/0与API局部40/0保留，r1/r2失败日志没有覆盖。CI之后只同步完成说明和手册，产品/测试实现不再改变；合并前手册及范围检查和合并后master读回仍按最终记录执行。

## 当前身份与完整清单

- 唯一业务树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-165821-foundry365-painter`；分支 `codex/20261003-165821-foundry365-painter`；HEAD `ec08352906172bbdf05f8cb573194c41761b36f0`。
- 主工作区：`I:/OpenCode/fvttV12JsonGenerator`；master `cdf387a89af91a3525c7af857298760638434379`；此次核查时 clean。该提交已经包含共用 validation-selection 的 17 文件集成，未包含本轮 Painter 业务。
- 收尾整理前有 **230 个改动路径：78 tracked、152 untracked；30 个文件已有暂存内容**。这不是 230 个新功能，也不是 230 个都待原样覆盖主线。
- 每个路径的状态、大小和 SHA-256 已保存到 [整理前文件清单](H:/CodexData/visualizations/2026/10/03/01a1010c-9d38-7421-9098-596a96bc261a/local-integration-scope-before-20261005.json)。本次新增的范围说明与最终核对见同目录 `local-integration-scope-final-20261005.json`；前一份记录中的四个 `unclassified` 路径在本次核查后明确归入下表的 Painter 工作流。

| 文件归属 | 整理前数量 | 本轮集成内容与边界 |
|---|---:|---|
| Painter 模块 | 174 | 42 项候选、阶段/颜色/Region/历史、坐标与媒体修复、七条音频、素材来源、测试和已完成验收记录。收尾再新增本文 1 个文件。 |
| Painter 工作流 | 4 | `.agents/skills/battlefield-effect-workflow/` 的说明、配置、验收参考和素材检查脚本，随 Painter 保留。 |
| Forge 兼容补丁 | 10 | 对本树 Forge 0.3.0 的精确 Core 版本检查、产物目标绑定、manifest/build 检查及回归测试；不接收另一棵树的 0.4.0 蓝图业务。 |
| Forge 共用包与示例 | 3 | `batchQueue.ts`、`encounter-automation.ts`、晶血战斗控制示例，只增加 14.368/5.3.3 这一配对。 |
| 其他模块的 Mirror 兼容 | 25 | CC 7、House Rules 4、IFS 2、TE 1、WMP 5、Resolver 3、Open Session Deck 3；这些是原升级任务的必要兼容补丁，并非 Painter 私有实现。 |
| Lab 与 CI 支持 | 8 | Mirror 配置/启动/进程保护和 Forge 受限构建辅助共 7 文件；coverage 总进程期限调整 1 文件。 |
| 升级 review 与手册 | 5 | 升级 review 1 文件、手册数据/核对记录/生成 HTML 4 文件。共享手册按条目合并，再生成 HTML。 |
| 主线已经包含 | 1 | `tools/foundry-ops/src/acceptance/inspection.test.ts` 与当前 master 相同；无需重复集成。 |

Painter 的 174 文件中含 82 素材、35 文档、29 测试及其余源码/构建/界面文件。音频目录有 7 OGG、4 WAV 和 1 署名文件；WAV 是保留的创作来源，现有构建器会复制 assets，不能在收尾中擅自删掉。付费 Tile Arsenal 原版独立安装，不属于本树文件清单。

## Forge：兼容补丁与 0.4.0 业务的边界

此次只读核查确认：**主线和 Painter 工作树的 Forge manifest 都仍是 0.3.0，Mirror 实际安装版是 0.4.0**。0.4.0 蓝图、可读预览和相关生成能力的来源仍在 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260922-135223-creature-authoring-research`；那棵树自身有未提交成果，本次没有修改或代为集成。

Painter 树内的 10 文件只承担以下兼容工作：

1. `src/mirror-core-compatibility.ts`、`src/runtime.ts`：允许精确 14.364 或 14.368，系统仍要求 dnd5e 5.3.3；Actor 响应目标必须等于当前真实 Core。
2. `src/itemRuntime.ts`：创建 Item 前同样校验响应的目标与真实运行环境；不能把 364 的结果放到 368，或反向混用。
3. `src/itemApplication.ts`、`src/intakeApplication.ts`：候选/导入审阅的 Core 版本检查按这两个精确版本判断，保留 accepted-only、GM、来源和产物身份门禁。
4. `src/encounterAutomationRuntime.ts`：既有固定自动化增加精确 368/5.3.3 配对。
5. `src/module.json`、`build.ts`：maximum 到 14.368，verified 仍是 14.364；声明区间不表示 365/366/367 都通过运行时版本门。
6. `tests/runtime.test.ts`：正式 368 来源生成和匹配环境创建正例，以及两方向跨 Core 创建拒绝、零创建副作用。
7. `AGENTS.md`：记录本次 Mirror 配对的局部约定，不授予发布或扩大验收范围。

此前安装到 Mirror 的方式是**从准确的 Forge 0.4.0 原来源构建受限产物**。`tools/foundry-ops/src/lab/mirrorForgeOverlay.ts` 仅改五份 Forge runtime/Application 源和两份共用 package 源，额外使用精确 Core helper；输出只含 `scripts/index.js` 与 `module.json`。未知源形状或源/安装身份不匹配会拒绝；辅助函数本身不安装。

这七份原来源 SHA-256 在本次只读核查仍与原 receipt 相等。Mirror 当前 JS SHA-256 为 `12a8fe3f79ac3494ace3b2ed84bde21c547ae7d26eaff30362b122f6ae9963e2`，与原受限构建和安装 receipt 一致；manifest 仍为 0.4.0、maximum 14.368。原构建 receipt 的 `installed:false` 表示构建阶段，随后 `core368-install-receipt.json` 才记录两文件实际安装，不能混淆。

**后续集成规则：**本轮可以交付这组兼容补丁，但它不包含完整 Forge 0.4.0 产品源码。若只将本轮补丁并入当前主线，仓库 Forge 仍是 0.3.0，普通 Forge build 不能用来覆盖已有 Mirror 0.4.0。要形成统一的 0.4.0 源码/普通构建，需先按原 Forge 任务的范围完成其业务源集成，再将上述兼容改动按语义接上；版本、模板、样式、蓝图编辑器、预览和生成包的变化由该任务负责。本轮不取用旧整文件覆盖新版，也不把受限安装收据当成 0.4.0 已经进了主线。

## 共用包：仅两个运行版本检查与一个示例

| 路径 | 具体变化 | 保留的限制 |
|---|---|---|
| `packages/forge-browser-runtime/src/batchQueue.ts` | 批量创建 manifest 的候选目标从仅 14.364 增加精确 14.368。 | dnd5e 5.3.3、v14/core/off、确定性 Document ID、来源/产物 hash 等门禁继续保留。 |
| `packages/intake-ai/src/encounter-automation.ts` | 生成的固定入口可在 14.364 或 14.368 启动。 | 系统仍是 dnd5e 5.3.3；GM、场景、Hooks、绑定和固定能力限制继续保留。 |
| `tools/forge-encounter/examples/crystalbleed/battle-control.mjs` | 晶血示例增加同一精确配对，并更新不兼容提示。 | GM、真实场景、既有 Actor/能力/绑定检查保持。 |

没有修改 package exports、蓝图 schema、Actor/Item 生成投影、通用版本默认值或 AI 自动化权限；这两份共用包补丁不宣称支持 dnd5e 6.x。其他模块原有 Next 精确配对保持原门禁和各自证据。Painter 浏览器模块也没有因此导入 Forge 私有实现。

## Lab/CI 支持与主线已有文件

Lab 支持范围是 `tools/foundry-ops/README.zh-CN.md`、`src/config.ts`、`src/config.test.ts`、`src/lab/launch.ts`、`src/lab/__tests__/launch.test.ts`、`src/lab/mirrorForgeOverlay.ts`、`src/lab/__tests__/mirrorForgeOverlay.test.ts`。README 中只能取本轮 Mirror 段落，保留主线共用工具的新说明。Core Test 默认仍为 14.364；只有显式选择 Mirror 14.368 才使用对应程序，未知活 PID 拒绝继续并保留记录。

`src/tools/runCoverageShards.ts` 将完整 368 文件覆盖率进程的期限从 300 秒调至 450 秒，保留单进程报告与退出检查。它属于此次完整 CI 的支撑，不是游戏规则或开放无限运行。

master 相对本树 HEAD 的 17 个路径中，只有五个与本树改动重叠：

- `tools/foundry-ops/src/acceptance/inspection.test.ts` 已完全相同，保留 master 即可。
- `tools/foundry-ops/README.zh-CN.md` 合并本轮 Mirror 说明，不覆盖主线 validation-selection 说明。
- `docs/handbook/catalog.json` 按条目合并，保留主线选择/证据门禁，再带入本轮 Mirror/兼容说明。
- `docs/handbook/reviewed.json` 在最终源码和条目组合上重新人工核对；不要直接选一侧旧指纹。
- `工具手册.html` 在最终组合上生成，不复制候选树的旧整页覆盖主线。

另十二个路径全部保留主线：`package.json`、`docs/runbooks/development-feedback-loop.md`、两个 development 模板、acceptance 下的 `cli.ts`、`external.ts`、`external.test.ts`、`model.ts`、`runtime.ts`、`workflow.ts`、`selection.ts`、`selection.test.ts`。本树缺少其中四个新文件只是基线落后，绝不是删除请求。详见外部最终清单中的每路径处置。

## 验证与明确停点

本次缺口是**文件归属、Forge 0.3/0.4 来源边界和主线重叠处置没有明确写出**。因此只补范围记录、来源/安装 hash 读回、链接和手册一致性检查；本次没有改产品代码、音频或安装。手册新增本文来源并修正 Forge 说明中仍写“仅 14.364”的旧句，人工核对 Painter/Forge 两条后重新生成。结果以最终清单记录，不扩展原运行时 PASS。

既有完整 CI r8 为 Bun 1.3.14、3547 pass / 1 skip / 0 fail、368 文件、290.69 秒；本次复用该结果，未重跑全仓 CI。Painter 代表三格型、玩家移动和声音技术结果，以及原 286 Actor / 180 Item / 65 Scene / 93 Macro 数据保持，见 [技术完成记录](completion-2026-10-05.md)。主观音色、全部 42 项/全部动作、自动拖动工具修复、深 WildMagic/Rift、长时和生产不在接受范围内。

Forge 0.4.0 的加载/可见蓝图预览与安装身份有本轮证据；本轮没有在新 Core 上执行完整蓝图 Generate/Create、全量 Actor/Item/AI/战斗自动化接受。0.3 兼容源码的机械检查和 0.4 受限 bundle 的安装/预览证据分别保留，不能相互冒充。

完成本文和手册后停止。后续发布需按实际授权处理最终组合，检查主索引/基线、Forge 产品来源和受影响的集成门禁；本次范围记录本身不触发任何操作。
