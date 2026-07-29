# Sequencer Spritesheet Worker 内存上限实施报告

- 实施时间：2026-07-27 00:08（Asia/Shanghai）
- 目标：项目本地 Foundry VTT 14.364 `server-mirror`
- 世界：`cor-cotn`
- 模块：Sequencer 4.2.3
- 计划：`docs/plans/2026-07-26-sequencer-spritesheet-worker-memory-cap.md`
- 生产环境：未访问、未修改

## 当前结论

本轮已经完成补丁器、显式回滚器、CLI 接入、自动化验证和项目本地安装：

- Sequencer 4.2.3 的 spritesheet generator 公式已从七个 eager Worker 的机器计算式改为上限两个；
- 原版 bundle 已相邻备份，补丁和备份哈希均已闭合；
- 项目本地 30001 已通过受限生命周期命令重启；
- 重启后 30001 只监听 `127.0.0.1`，`/join` 和补丁后的 bundle 均返回 HTTP 200；
- HTTP 实际提供的 bundle 唯一包含补丁 sentinel 和上限公式，其 SHA-256 与磁盘补丁文件一致；
- apply/restore、排队释放和失败后 Worker 归还均有自动化覆盖。

但本轮**不能声明运行时 Worker 内存上限已完成验收**。重启后，Codex in-app Browser 和现有 Chrome 标签页都停在本地 Foundry 加入页，要求选择用户并输入密码。未授权读取密码存储、猜密码或绕过 world 数据库，因此无法进入 `/game`、初始化 Canvas、实际加载 Sequencer 模块、触发持久化 WebM，或对对应 renderer 运行 `VirtualQueryEx`。

当前准确状态是：

> 本地 Sequencer 4.2.3 Worker 上限补丁已写入、可回滚并通过代码/磁盘/HTTP 机械验证；真实 `/game` 触发和两块 WASM 区域证据因缺少已认证 GM 会话而阻塞。

## 代码与工具交付

新增：

```text
scripts/foundry-lab/patchSequencerSpritesheetWorkers.ts
scripts/foundry-lab/__tests__/patchSequencerSpritesheetWorkers.test.ts
```

修改：

```text
scripts/foundry-lab/cli.ts
```

CLI 命令：

```powershell
bun run foundry:lab patch-sequencer-spritesheet-workers
bun run foundry:lab patch-sequencer-spritesheet-workers --apply
bun run foundry:lab patch-sequencer-spritesheet-workers --restore
bun run foundry:lab patch-sequencer-spritesheet-workers --restore --apply
```

补丁器执行以下 fail-closed gate：

- 目标必须位于项目本地 `.local/foundry-v14`；
- `module.json` 必须为 `sequencer` 4.2.3；
- `dist` 中必须且只能有一个 `SpritesheetGenerator-*.js`；
- 未补丁公式必须唯一命中；
- 已补丁文件必须唯一包含 sentinel 和目标公式；
- 备份必须仍符合未补丁 4.2.3 源码形状；
- 备份使用 exclusive copy，不覆盖既有文件；
- 写入前再次比较当前文件 SHA-256，拒绝并发变化；
- 临时文件写完后替换目标，失败时清理临时文件；
- restore 只接受带本补丁 sentinel 的当前文件和已验证的原版备份。

## 哈希与安装证据

目标 bundle：

```text
I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\data\server-mirror\Data\modules\sequencer\dist\SpritesheetGenerator-Dw7_9Yk1.js
```

相邻备份：

```text
I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\data\server-mirror\Data\modules\sequencer\dist\SpritesheetGenerator-Dw7_9Yk1.js.upstream-4.2.3.bak
```

| 对象 | SHA-256 |
| --- | --- |
| 原版 / backup | `8F907DBBFC0611D3EBC2D1456C118A74041A7492753AFDE5EA96F303D77CFB68` |
| 补丁版 | `08540669C22A5DE4986F515716E9BECB3BC1833A04C5E0832E6F11CB8B7799B0` |

apply 后复核：

- sentinel：1 次；
- `Math.min(..., 2)` 公式：1 次；
- backup SHA-256 等于 apply 前 SHA-256；
- 当前 bundle SHA-256 等于工具报告的 after SHA-256；
- `.codex-patch.tmp`：不存在；
- restore dry-run 报告 before 为补丁哈希、after 为原版哈希；
- 本轮没有执行真实 restore，补丁仍保留在本地安装中。

## 自动化与机械验证

| 检查 | 结果 |
| --- | --- |
| 专项测试 | 13 pass / 0 fail / 42 assertions |
| Foundry Lab 回归 | 185 pass / 0 fail / 1114 assertions |
| `bun run typecheck:all` | 通过 |
| `git diff --check` | 通过；只有已有行尾转换 warning |
| 真实安装 dry-run | 通过，版本/唯一 bundle/源码形状命中 |
| dry-run 无写入 | 未产生 backup 或 tmp |
| apply | 通过，哈希和 sentinel 闭合 |
| restore dry-run | 通过，未修改当前补丁 |

专项测试覆盖：

- 16 线程得到 2、4/2 线程得到 1；
- 最低值 1 和上限 2 同时保留；
- 公式缺失、多次命中、未知版本、零/多 bundle 失败关闭；
- dry-run、apply、非覆盖备份、幂等、restore 往返；
- 未带 sentinel 的当前文件和未知备份被拒绝；
- 临时文件替换后无残留；
- 两 Worker 下第三个任务等待并在 Worker 释放后完成；
- 模拟任务失败后 Worker 仍归还队列，后续任务不永久等待。

## 重启与 HTTP 证据

重启前 PID 为 `48108`；通过 Foundry Lab `stop server-mirror` 停止后确认 30001 不再监听，再用 `launch server-mirror` 启动。

重启后：

- PID：`43672`；
- executable：项目本地 Node 24.17.0；
- app：项目本地 Foundry 14.364 `main.js`；
- dataPath：项目本地 `.local/foundry-v14/data/server-mirror`；
- listener：`127.0.0.1:30001`；
- options world：`cor-cotn`；
- `/join`：HTTP 200，标题“溟渊的呼唤”；
- `/modules/sequencer/dist/SpritesheetGenerator-Dw7_9Yk1.js`：HTTP 200；
- HTTP bundle sentinel：1；
- HTTP bundle patched formula：1；
- HTTP bundle SHA-256：`08540669C22A5DE4986F515716E9BECB3BC1833A04C5E0832E6F11CB8B7799B0`。

这证明服务器正在提供补丁文件，但加入页没有加载世界模块；它不等同于浏览器已在 `/game` 实例化两个 Worker。

## 未完成的运行时验收

由于缺少已认证 GM 会话，以下项目没有执行，不能标记为通过：

- `/game` 完整初始化和 Canvas ready；
- Sequencer 4.2.3 active；
- 浏览器模块加载记录实际命中补丁 bundle；
- 使用现有持久化、非平铺 WebM 触发 spritesheet generator；
- 目标请求不永久 pending；
- 30 秒无新增 fatal error；
- renderer `VirtualQueryEx` 区域枚举；
- 恰好两个 299,958,272-byte 私有提交区域；
- 两块合计 599,916,544 bytes / 572.125 MiB；
- renderer PrivateMemorySize64、Working Set 和 V8 heap 辅助快照。

因此，理论减少量仍只是由已验证公式和既有七 Worker 基线推导：

```text
5 × 299,958,272 = 1,499,791,360 bytes
                  = 1430.3125 MiB
```

它尚未被本轮真实 renderer 快照确认。

## 下一步与人工验收

恢复验收所需的最小外部动作：

1. 用户在保留的本地 Chrome Foundry 加入页中登录 GM；
2. 告知 Codex 已进入 `/game`；
3. Codex只读确认 Canvas、Sequencer、实际 bundle 和 renderer；
4. 使用现有安全 WebM 触发完成最低冒烟与 `VirtualQueryEx` 计数；
5. 若区域数量不是 2、出现 fatal error 或任务永久 pending，按计划立即停止本地 30001 并执行已验证的 restore。

即使最低冒烟通过，以下仍由用户人工验收：多动画视觉一致性、首次转换延迟、第三个及后续 WebM 排队体验、切场景恢复、复杂 JB2A/Automated Animations/Sequencer 组合、真实战斗和长时间跑团稳定性。
