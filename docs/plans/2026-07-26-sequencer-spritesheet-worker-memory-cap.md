# Sequencer Spritesheet Worker 内存上限修复计划

> **后续证据说明（2026-07-28）：** 本计划中的 `299,958,272 bytes/Worker` 是 WASM
> committed 地址空间口径，不是同量的当前物理 RAM。实施后的两个 Worker 区域经
> `K32QueryWorkingSetEx` 逐页检查，实际 resident 各约 `1.15 MiB`。本计划作为
> 限制虚拟提交和并发解码风险的历史实施依据保留，不再作为“释放约 1.4 GiB 物理
> 内存”的证据。

## Summary

在项目本地 Foundry v14 `server-mirror` 中，为 Sequencer 4.2.3 的 spritesheet generator 增加可重复、可回滚、版本锁定的本地补丁，将一次性创建的 WebAssembly 解码 Worker 数量上限从当前机器上的 7 个限制为 2 个。

本计划只处理已经精确归因的固定 WASM Worker 占用：

```text
当前：7 × 299,958,272 bytes
    = 2,099,707,904 bytes
    = 2002.4375 MiB

目标：2 × 299,958,272 bytes
    =   599,916,544 bytes
    =   572.1250 MiB

理论直接减少：
      1,499,791,360 bytes
    = 1430.3125 MiB
```

目标不是证明整个 FVTT renderer 的所有剩余内存都已优化，也不是本轮重构 Sequencer 的 Worker 生命周期。完成声明只覆盖：

- 本地 Sequencer 4.2.3 已受到版本锁定的 Worker 上限补丁保护；
- 运行时只出现 2 个而不是 7 个对应的 WASM 初始提交区域；
- Foundry 页面、Canvas 和现有持久化 WebM 路径通过最低限度机械冒烟；
- 自动化证明两个 Worker 以外的任务会排队并最终完成；
- 最终动画观感、复杂场景、多动画视觉一致性和长时间跑团由用户人工验证。

计划文件：

```text
docs/plans/2026-07-26-sequencer-spritesheet-worker-memory-cap.md
```

## Scope and Fixed Decisions

### 锁定环境

- Foundry VTT：14.364
- dnd5e：5.3.3
- Sequencer：4.2.3
- 本地数据根：
  `.local/foundry-v14/data/server-mirror`
- 模块根：
  `.local/foundry-v14/data/server-mirror/Data/modules/sequencer`
- 当前本地世界：`cor-cotn`
- 当前本地端口：`127.0.0.1:30001`
- 不操作生产服务器或远程 51020/8080 环境。

### 本轮固定实现

将：

```js
const workerCount = Math.max(
  Math.floor((navigator.hardwareConcurrency - 2) / 2),
  1
);
```

改为等价的压缩产物形式：

```js
const workerCount = Math.min(
  Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1),
  2
);
```

保留以下现有行为：

- WebM 首先作为普通 VideoAsset 激活；
- 只有持久化、非平铺的 `.webm` 请求后台 spritesheet；
- 最多两个转换任务并行；
- 第三个及后续任务进入现有等待队列；
- 转换成功后用 VideoSpritesheetAsset 替换原视频；
- 转换失败时继续保留原 VideoAsset；
- KTX2/IndexedDB 缓存行为不变；
- 不修改 WASM Memory Section；
- 不修改世界 Scene、Actor、Token、Region、ChatMessage 或 Sequencer persistent effect 数据。

### 明确不在本轮实现

- 不改为 1 个 Worker；
- 不实现按需扩容；
- 不实现空闲超时 `worker.terminate()`；
- 不重编译 Basis/KTX2 WASM；
- 不改变 spritesheet 缓存格式；
- 不关闭 WebM → spritesheet 功能；
- 不升级 Sequencer；
- 不把本地补丁自动套到未来版本；
- 不提交上游 issue 或 PR；
- 不做长时间跑团、完整战斗或全世界逐场景验证；
- 不由 Codex承担最终人工视觉和体验验收。

这些后续方向只能在本轮补丁和最低冒烟完成后另行立项。

## Evidence Baseline

实施前保留当前归因报告：

```text
docs/reviews/2026-07-26-fvtt-chrome-4.2gb-memory-attribution-report.md
```

当前已确认：

- Chrome renderer 私有提交约 4.06 GiB；
- 七个独立 `MEM_PRIVATE + MEM_COMMIT + PAGE_READWRITE` 区域；
- 每个区域均为 299,958,272 bytes；
- 七个合计 2002.4375 MiB；
- `navigator.hardwareConcurrency = 16`；
- Sequencer 公式计算出 7 个 Worker；
- Worker 内嵌 WASM Memory Section 初始值为 4,577 pages；
- `4,577 × 65,536 = 299,958,272 bytes`。

补丁后的主要验收信号不是 Chrome 总内存显示值，而是同一 renderer 中精确尺寸为 299,958,272 bytes 的私有提交区域数量从 7 降为 2。

## Architecture and Deliverables

### 1. 可重复补丁器

新增：

```text
scripts/foundry-lab/patchSequencerSpritesheetWorkers.ts
```

公开接口建议：

```ts
export interface SequencerWorkerPatchResult {
  source: string;
  changed: boolean;
}

export function patchSequencerSpritesheetWorkerSource(
  source: string,
): SequencerWorkerPatchResult;

export async function patchSequencerSpritesheetWorkerFile(
  moduleFile: string,
): Promise<SequencerWorkerPatchResult>;

export async function patchSequencerSpritesheetWorkerInstall(
  config: FoundryLabConfig,
  options: { apply: boolean; restore?: boolean },
): Promise<{
  apply: boolean;
  restore: boolean;
  changed: boolean;
  version: string;
  moduleFile: string;
  backupFile: string;
  beforeSha256: string;
  afterSha256: string;
}>;
```

补丁器必须：

1. 通过 `createLabConfig()` 获取路径。
2. 使用 `assertInsideLabRoot()` 拒绝 `.local/foundry-v14` 之外的目标。
3. 读取并验证 `module.json`。
4. 要求 `manifest.id === "sequencer"`。
5. 要求 `manifest.version === "4.2.3"`。
6. 在 `dist` 中匹配且只匹配一个 `SpritesheetGenerator-*.js`。
7. 要求上游 Worker 公式恰好出现一次。
8. 使用明确 sentinel 标记本地补丁。
9. 默认 dry-run，只报告将发生的变化。
10. `--apply` 时先保存相邻原版备份。
11. 通过临时文件和原子重命名替换目标文件。
12. 再次运行时返回 `changed: false`，不得重复套补丁。
13. 模块版本、文件名、目标公式或命中次数变化时失败关闭。
14. 返回补丁前后 SHA-256，供证据记录。

建议 sentinel：

```text
SEQUENCER_SPRITESHEET_WORKER_CAP_2_LOCAL_PATCH
```

建议备份：

```text
SpritesheetGenerator-<hash>.js.upstream-4.2.3.bak
```

备份已经存在时不得覆盖；必须验证其内容仍符合未补丁的 4.2.3 源码形状。

### 2. 显式回滚

同一补丁器提供只针对上述备份的 restore 路径。

建议命令：

```powershell
bun run foundry:lab patch-sequencer-spritesheet-workers --restore
bun run foundry:lab patch-sequencer-spritesheet-workers --restore --apply
```

回滚必须：

- 默认 dry-run；
- 只接受准确的 4.2.3 备份；
- 恢复前验证当前文件带本补丁 sentinel；
- 恢复后计算 SHA-256；
- 不删除备份；
- 不触碰其他 Sequencer 文件。

### 3. CLI 接入

修改：

```text
scripts/foundry-lab/cli.ts
```

增加命令：

```powershell
bun run foundry:lab patch-sequencer-spritesheet-workers
bun run foundry:lab patch-sequencer-spritesheet-workers --apply
bun run foundry:lab patch-sequencer-spritesheet-workers --restore
bun run foundry:lab patch-sequencer-spritesheet-workers --restore --apply
```

CLI 输出机器可读 JSON，不以日志文本作为唯一证据。

### 4. 自动化测试

新增：

```text
scripts/foundry-lab/__tests__/patchSequencerSpritesheetWorkers.test.ts
```

夹具使用最小化的上游源码片段，不复制整个第三方 bundle。

测试必须覆盖：

1. 将原始公式改为上限 2。
2. 保留最低值 1。
3. 16 逻辑线程时结果为 2。
4. 4 逻辑线程时结果为 1。
5. 2 逻辑线程时结果为 1。
6. 补丁只命中一次。
7. 第二次应用保持幂等。
8. 缺失目标公式时失败。
9. 目标公式出现多次时失败。
10. 未知 Sequencer 版本时失败。
11. 找不到 bundle 时失败。
12. 同时找到多个 bundle 时失败。
13. dry-run 不写磁盘。
14. apply 保存原版备份。
15. 已存在备份不被覆盖。
16. restore 恢复原始内容。
17. restore 拒绝没有 sentinel 的未知当前文件。
18. 临时文件写入完成后原子替换。
19. 三个任务、两个模拟 Worker 时，前两个获得 Worker，第三个等待。
20. 一个 Worker 完成后，第三个任务被放行且最终完成。
21. 任一模拟任务失败后，Worker 仍回到可用队列，不造成后续任务永久等待。

队列测试用于证明“限制转换并发”不会把第三个及后续任务静默丢弃；它不代替浏览器中的动画视觉验收。

### 5. 证据输出

实施时新增或更新：

```text
docs/reviews/2026-07-26-sequencer-spritesheet-worker-memory-cap-report.md
docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md
docs/remediation/2026-07-15-project-hardening/EXECPLAN.md
```

报告至少记录：

- 原版和补丁版 SHA-256；
- 模块 ID、版本和目标 bundle；
- dry-run 结果；
- apply 结果；
- 专项测试结果；
- 重启后的监听器、HTTP 和世界状态；
- WASM 区域数量和合计；
- renderer 私有内存快照；
- 最低冒烟结果；
- 是否回滚；
- 明确列出的用户人工验收待办。

ExecPlan 只记录本任务的进度、发现、决定、证据路径和未完成人工事项；不得把用户待验收项目标成 Codex 已完成。

## Implementation Sequence

### Task 1：锁定上游形状和失败条件

文件：

```text
scripts/foundry-lab/__tests__/patchSequencerSpritesheetWorkers.test.ts
scripts/foundry-lab/patchSequencerSpritesheetWorkers.ts
```

步骤：

1. 从当前 4.2.3 source map 提取最小 Worker constructor 夹具。
2. 写失败测试，要求公式上限为 2。
3. 写版本、命中次数、bundle 唯一性和路径边界失败测试。
4. 运行专项测试，确认修改前失败。
5. 实现最小源码转换函数。
6. 再运行专项测试。

本任务不得读取或修改世界 LevelDB。

### Task 2：实现 dry-run、apply、backup 和 restore

文件：

```text
scripts/foundry-lab/patchSequencerSpritesheetWorkers.ts
scripts/foundry-lab/__tests__/patchSequencerSpritesheetWorkers.test.ts
```

步骤：

1. 复用 `FoundryLabConfig` 和 `assertInsideLabRoot()`。
2. 锁定 `sequencer` 4.2.3。
3. 唯一定位 bundle。
4. 实现 SHA-256。
5. 实现 dry-run。
6. 实现相邻备份。
7. 实现原子写入。
8. 实现显式 restore。
9. 对临时目录夹具完成 apply/restore 往返测试。

### Task 3：接入 Foundry Lab CLI

文件：

```text
scripts/foundry-lab/cli.ts
```

步骤：

1. 添加 patch 命令。
2. 解析 `--apply` 和 `--restore`。
3. 输出包含 hashes、changed、apply、restore、version 和路径的 JSON。
4. dry-run 当前真实安装，确认目标唯一且版本匹配。
5. 此阶段仍不修改真实模块文件。

### Task 4：机械验证

命令：

```powershell
bun test scripts/foundry-lab/__tests__/patchSequencerSpritesheetWorkers.test.ts
bun test scripts/foundry-lab/__tests__ --max-concurrency 4
bun run typecheck:all
bun run foundry:lab patch-sequencer-spritesheet-workers
```

必须检查：

- 所有专项测试通过；
- Foundry Lab 测试没有回归；
- TypeScript 通过；
- dry-run 报告 `sequencer 4.2.3`；
- dry-run 的目标文件与当前实际加载 bundle 一致；
- dry-run 不产生 `.bak` 或 `.tmp`；
- `git diff --check` 通过；
- 只包含本计划授权的源文件和文档变化。

本任务是 Foundry 本地补丁工具，不涉及 Actor JSON，不运行生成 Actor 工作流或反过拟合审计。

### Task 5：应用本地补丁

前置条件：

- 用户已批准执行本计划；
- 确认另一个 thread 没有正在依赖 30001 完成中的测试；
- 重新确认目标监听器、PID、命令行和 dataPath；
- 明确目标是项目本地 `server-mirror`，不是生产服务器。

命令：

```powershell
bun run foundry:lab patch-sequencer-spritesheet-workers --apply
```

应用后立即验证：

- bundle 存在 sentinel；
- Worker 公式上限为 2；
- 备份存在；
- 备份 SHA-256 等于 apply 前 SHA-256；
- 当前文件 SHA-256 等于工具报告值；
- 不存在残留 `.codex-patch.tmp`。

如果 30001 正在运行，磁盘补丁不会被描述为已经生效；必须重启或完整重新加载客户端后才能进入运行时验证。

### Task 6：重启和基础启动检查

只操作项目本地 30001。

步骤：

1. 使用现有 Foundry Lab 生命周期命令安全停止 `server-mirror`。
2. 再次核对没有触碰生产监听器。
3. 启动 `server-mirror`。
4. 验证 30001 正在监听。
5. 验证 HTTP 响应。
6. 验证选择的世界仍为 `cor-cotn`。
7. 打开或重新加载本地 `/game`。
8. 验证 Sequencer 4.2.3 active。
9. 验证浏览器实际加载的 bundle 包含补丁 sentinel。

启动成功只是机械前置条件，不单独构成修复完成。

## Codex Minimum Smoke Test

用户明确免除 Codex 的最终人工视觉和体验验收。Codex 只执行以下最低冒烟，不扩展为完整 QA：

1. 等待 `/game` 完成初始化，确认 Canvas ready。
2. 使用当前已有的持久化、非平铺 WebM 路径触发 spritesheet generator；不创建新的永久世界对象。
3. 确认页面没有出现新的 uncaught exception、unhandled rejection 或 Sequencer fatal error。
4. 确认 renderer 进程仍存活且页面可以响应一次只读 runtime probe。
5. 使用 `VirtualQueryEx` 枚举 renderer 私有提交区域。
6. 精确统计大小为 299,958,272 bytes 的独立私有提交区域。
7. 要求区域数量为 2，不得为 0、1 或大于 2。
8. 要求这两块合计为 599,916,544 bytes / 572.125 MiB。
9. 记录 renderer `PrivateMemorySize64`、Working Set 和 V8 heap，只作为辅助指标，不要求整个 renderer 达到固定总量。
10. 读取 Sequencer 当前运行对象或缓存状态，确认至少一个目标 WebM 请求没有停在永久 pending 状态。
11. 保持页面 30 秒，确认没有新增 fatal error，随后结束冒烟。

最低冒烟明确不要求：

- Codex主观判断动画是否“好看”；
- Codex逐个确认所有动画帧；
- Codex同时制造五个永久特效；
- Codex跑完整战斗；
- Codex长时间重复切图；
- Codex证明所有 JB2A 素材兼容；
- Codex证明两个 Worker 的生成速度满足用户体验。

如果当前世界没有安全、现成且可触发的持久 WebM，Codex不得为了完成冒烟而写入永久 world effect，也不得把仅有模块加载和内存结构检查报告成“最低冒烟通过”。此时将最低冒烟明确标记为 blocked，记录“缺少无写入触发夹具”，并停在未完成状态；由用户触发现有动画，或另行授权一个可回滚的临时触发夹具后，才能继续完成本节。用户被免除的是由 Codex执行最终视觉/体验验收，不是触发链路的最低机械验证。

## Acceptance Boundaries

### Codex 完成门槛：机械验证

- 补丁器和回滚器专项测试通过；
- Foundry Lab 回归测试通过；
- TypeScript 通过；
- dry-run、apply 和哈希证据完整；
- 真实加载 bundle 带 sentinel；
- 运行时恰好出现两个 299,958,272-byte WASM 区域；
- 两块合计 572.125 MiB；
- 相比七 Worker 基线，已确认的固定 WASM 提交减少 1430.3125 MiB；
- 页面、Canvas 和 renderer 在最低冒烟期间存活；
- 最低冒烟没有新的 Sequencer fatal error；
- 备份和 restore 路径通过自动化往返测试；
- 报告明确写出人工验收仍待用户执行。

满足以上条件后，只能声明：

> 本地 Sequencer 4.2.3 Worker 上限补丁已机械生效，已确认的 WASM 固定提交从七份降为两份，最低启动和触发冒烟通过。

不得声明：

> 所有动画已经完整验收，或者 FVTT 的全部内存问题已经修复。

### 用户人工验收：不阻塞 Codex 交付

由用户在方便时确认：

- 同一场景多个动画是否同时正确显示；
- 未缓存素材首次进入时是否有可感知延迟；
- 第三个及后续 WebM 排队期间是否仍自然播放；
- spritesheet 替换时是否出现跳帧、黑帧或闪烁；
- Scene 切走再返回后的动画恢复；
- 复杂 JB2A、Automated Animations 和 Sequencer 组合；
- 真实战斗及长时间跑团的稳定性；
- 两个 Worker 是否提供可接受的速度与内存平衡。

这些人工项目不作为本计划 Codex 实施完成的阻塞条件，但用户发现的消失、卡死、黑帧、错误位置或不可接受延迟应作为有效缺陷进入后续修复。

## Rollback Conditions

最低冒烟出现以下任一情况时立即回滚：

- bundle 不能加载；
- Sequencer 不能激活；
- Canvas 初始化失败；
- 当前持久 WebM 请求永久 pending；
- 新增 fatal error 或 unhandled rejection；
- WASM 区域数量不是 2；
- 私有提交没有按预期减少；
- 补丁器无法证明备份与原版一致；
- 目标文件出现未知并发修改。

回滚顺序：

1. 停止本地 30001。
2. dry-run restore。
3. `--restore --apply`。
4. 验证恢复后的 SHA-256。
5. 重新启动 30001。
6. 验证官方 4.2.3 bundle 可加载。
7. 在报告和 ExecPlan 中记录失败点，不以“已恢复”冒充修复完成。

## Risks

### 首次转换变慢

七并发降为两并发后，多素材首次生成的总时间可能增加。原 VideoAsset 会先播放，因此主要风险是转换完成较晚，而不是动画数量被限制。

### 排队任务持有输入缓冲

WebM 在进入 Worker 队列前可能已经读取为 ArrayBuffer。大量未缓存素材同时出现时，排队输入仍会带来临时内存压力。本补丁只消除五份固定 WASM Worker 内存，不承诺消除所有视频缓冲。

### 模块升级覆盖补丁

Sequencer 更新或重新安装会覆盖 dist 文件。版本锁定和 source-shape gate 必须使旧补丁在新版本上失败关闭；不得自动重新应用。

### 总 renderer 内存仍可能较高

本次只精确减少约 1.397 GiB 的固定 WASM 提交。V8 heap、Chromium 原生分配池、纹理、DOM 和其他模块仍然存在，不能把补丁结果描述为整个 4.2 GB 问题全部消失。

### 当前脏工作区

当前工作区已有用户和其他 thread 的改动。实施必须以当前工作区为源事实，不创建基于旧 `HEAD` 的 worktree，不覆盖无关变化，并在最终报告中只列本计划实际修改的文件。

## Final Deliverables

- `scripts/foundry-lab/patchSequencerSpritesheetWorkers.ts`
- `scripts/foundry-lab/__tests__/patchSequencerSpritesheetWorkers.test.ts`
- `scripts/foundry-lab/cli.ts` 的受限命令接入
- 原版 4.2.3 bundle 相邻备份
- 已应用的本地 bundle 补丁
- apply/restore SHA-256 证据
- 专项测试和 Foundry Lab 回归记录
- 两 Worker `VirtualQueryEx` 运行时证据
- `docs/reviews/2026-07-26-sequencer-spritesheet-worker-memory-cap-report.md`
- `docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md` 更新
- `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md` 检查点
- 明确移交给用户的人工验收清单

## Execution Checklist

- [ ] 在 ExecPlan 建立本任务检查点和未关闭状态。
- [ ] 写失败测试锁定 4.2.3 公式和 Worker 上限。
- [ ] 实现源码补丁函数。
- [ ] 实现路径、版本、bundle 唯一性和命中次数 gate。
- [ ] 实现 dry-run。
- [ ] 实现相邻备份和原子 apply。
- [ ] 实现 dry-run restore 和 apply restore。
- [ ] 接入 Foundry Lab CLI。
- [ ] 专项测试通过。
- [ ] Foundry Lab 回归测试通过。
- [ ] TypeScript 通过。
- [ ] 真实安装 dry-run 通过且未写文件。
- [ ] 协调 30001 测试窗口。
- [ ] 应用本地补丁并记录 SHA-256。
- [ ] 重启并验证本地 30001、HTTP 和 `cor-cotn`。
- [ ] 确认浏览器实际加载补丁 bundle。
- [ ] 完成 Codex 最低冒烟。
- [ ] 确认恰好两个 299,958,272-byte WASM 区域。
- [ ] 记录 renderer 辅助指标和错误计数。
- [ ] 如失败则回滚并记录。
- [ ] 更新优化日志、报告和 ExecPlan。
- [ ] 将人工视觉、复杂场景和长时间体验验收移交用户。
