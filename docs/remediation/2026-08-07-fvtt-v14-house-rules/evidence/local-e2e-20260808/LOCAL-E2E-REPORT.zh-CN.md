# Foundry VTT v14 村规模块本地验收报告

- 日期：2026-08-08（Asia/Shanghai）
- 目标：Foundry VTT `14.364`、dnd5e `5.3.3`
- Lab：`F:\FoundryLab\foundry-v14` 的 `data\server-mirror`
- 世界：`fvtt-v14-module-matrix`
- 范围：本地矩阵世界、临时 Actor/Item/Token/Combat/Message/User；未连接生产 8080

## 结论摘要

两个模块的模块级测试、类型检查、构建和原有本地 Foundry 真实语义回放均通过。追加复测还修复并验证了 v14 原生攻击钩子的异步弹药时序和 `Roll.id` 缺失兼容；最后一轮新增的并发认领锁路径尚未重新开启浏览器回放。根仓库的 `bun run test` 和完整 `bun run ci:verify` 没有在 15 分钟内结束，因此不能将仓库级门禁写成完全通过；超时进程树已按精确 PID 清理。

本地语义结论：在锁定版本和本地矩阵中，原有浏览器已覆盖的伤势、消逝的灵魂、N1/N20、药水、弹药、隐匿、生命骰赌博、低属性提醒，以及 core/MIDI-QOL/DAE/Tidy 组合路径符合实施计划；最新服务端唯一 `_id` 认领锁的双 GM 竞争路径仍待浏览器重放。生产安装和真实跑团长期验收仍未执行。

## 机械验证

> 重要验证边界：下面的浏览器语义回放是在最后一轮并发认领加固之前完成的。随后新增的 Foundry 服务端唯一 `_id` GM whisper ChatMessage 锁、跨客户端认领失败闭锁和 token 回读已经通过源码检查、模块测试、构建与类型检查，但本轮没有重新开启浏览器，因此不能把这条新增锁路径写成新的浏览器 E2E 通过。原有 happy-path 证据仍然有效；最新锁路径的真实多客户端重放仍是剩余工作。

| 命令 | 结果 | 备注 |
|---|---|---|
| `bun run typecheck:foundry-modules` | PASS | 两个新模块与现有 Foundry 模块均通过 |
| `bun run agents:check` | PASS | 19 个必需文件、根路由和指令链有效 |
| `bun run typecheck:production` | PASS | 修复 `natural-roll.ts` 的严格索引后通过 |
| `bun run typecheck:all` | PASS | 包括测试源码的严格检查 |
| house rules `bun run test` | PASS | 23 pass / 0 fail / 109 expect calls；包含 Activity/Item/完整弹药快照反例 |
| injury/Fading `bun run test` | PASS | 41 pass / 0 fail / 106 expect calls；包含 Socket fail-closed、原生 rest 消息、稳定复活事务 ID、当前死亡消费标记、持久进行中锁、Foundry 唯一锁 ID 和仪式清理反例 |
| 两模块 `typecheck` | PASS | 当前源码和测试通过 |
| 两模块 `build` | PASS | 生成发布目录和 ZIP |
| house rules `verify:artifact` | PASS | 6 个确定性 ZIP 条目 |
| injury `verify-install` | PASS | 本地 Lab 安装目标和版本可识别；该命令自身标记 `runtimeVerified=false` |
| `git diff --check` | PASS（仅警告） | 只有既有 LF/CRLF 工作区警告，没有空白错误 |
| `bun run test` | TIMEOUT | 15 分钟内未结束；Bun 测试进程约 1.3 GB 内存，已停止精确测试树，不能记为通过 |
| `bun run ci:verify` | PARTIAL / TIMEOUT | 环境、隔离、AGENTS、生产/全量/包/应用/Foundry/tool 类型检查、架构和 Session Monitor 构建均通过；第一次覆盖率 CLI 有瞬时 `spawnSync bun ETIMEDOUT`，单测重跑 2/2 通过；第二次 CI 在 `test:coverage -> test:cli` 的 plaintext 子进程超过 15 分钟，已停止精确 CI 树 |

## 本地 Foundry 真实语义验收

### 伤势

- 正 HP → 0 HP → 正 HP 只增加一层；重复 HP 更新没有重复叠加。
- 稳定在 0 HP、临时 HP、Actor 导入/模块重载和单独降低最大 HP 不会创建或清除错误伤势。
- 三层伤势再次倒地时，GM 选择前没有预写三次死亡失败，也没有自动写入 Dead。
- 伤势投影可见为 `Injury (1)`；删除/重建投影仍以 Actor flags 为事实来源。
- 双 GM 同时触发和玩家治疗路径均只产生一次 episode/一次伤势。
- 无活动 GM 时玩家 HP 变化没有写入长期伤势状态；恢复 GM 后状态一致。

### 消逝的灵魂

- 普通仪式创建 dnd5e 原生贡献请求；玩家能看到并投掷贡献卡，GM 才能看到/处理最终 resolve 卡。
- 普通成功：最终无调整 d20 以原生 blind GM Roll 投出；玩家看不到最终骰、原始值或审计摘要中的原始值；历史增加一次。
- 快速复活失败：永久 DC 惩罚增加 1，并锁定当前死亡 episode 的快速复活路径。
- 后续长仪式失败：常规复活锁定；重复 resolve 不会重复写历史。
- 已锁定状态下最终机会在开始事务时即消耗；重复点击不能产生第二次机会；成功保留 `finalChanceUsed` 和常规锁，并增加一次成功回归历史。
- 成功复活不会猜测或替代法术的 HP 恢复；通过公开 `withInjurySuppressed` 包裹 HP 恢复时不会错误叠加伤势。

### N1/N20

- core 原生攻击路径：N20 的 longsword 基础伤害实测为 `8 + 1d8 + 3`；`2d6` 基础 part 实测为 `6 + 3d6 + 3`，额外 rider 未被取满。
- N1 只生成 GM 后果卡；未确认前没有伤害、反击、武器损坏或反应副作用。
- GM 确认队友误伤、武器损坏、半伤/全伤和修复路径均通过；武器惩罚可累计并能修复。
- MIDI-QOL `14.0.11` + DAE `14.0.12` 路径通过：N20 实际伤害只出一条；N1 第一次确认成功、第二次确认失败，实际只出一条非 Activity 伤害消息，反应被抑制。
- PC 与 NPC 共用自然骰入口；MIDI 对话框由 GM 完成原生 Critical Hit 确认后才继续。

### 药水、弹药、隐匿、生命骰和低属性

- 结构化治疗药水配置出三种原生 Activity：附赠动作自饮、动作自饮取满治疗骰、动作喂服他人；固定调整值保留；恢复快照可回滚。
- 生命骰赌博首次 1 只重投一次，第二次即使仍为 1 也接受；结果写入原生 Advancement，重复点击不重复写入。
- `+3 → +2 → +1 → +0` 单发找回账本通过；剩余整堆不降级；Combat 删除不丢账；重复找回只成功一次。含点号的 Foundry UUID/事件 ID 使用安全存储键后仍能正确去重。
- 追加 v14 原生攻击复测：非销毁弹药实际由 dnd5e 消费 `2 → 1` 后写入一发 `+3 → 待找回 +2`；自动销毁弹药在带有 dnd5e 正常 `roll.ammunitionData` 的攻击消息链路中被删除，并写入且只写入一发 `+3 → 待找回 +2`。复测确认 `rollAttackV2` 必须同步捕获消费前快照/数量，`postRollAttack` 在序列化 Roll 没有 `id` 时使用原生 ChatMessage ID。
- 隐匿普通角色、专精、游荡者 7 级/GM 全速、Dash、传送忽略和超速仅警告不回滚 Token 均通过；真实 v14 Token 更新使用实际 `changes.x/y`。
- 属性值 4 的选中 Token 收到低属性上下文提醒；公开 API 返回对应属性；Actor 数据没有被模块自动修改或全世界扫描。

### 多客户端、第三方和界面

- 矩阵组合覆盖：仅 injury/Fading、仅 house rules、两模块同时、两模块 + MIDI-QOL/DAE。
- 覆盖单 GM + 玩家、双 GM、无活动 GM、GM 恢复/切换；唯一写入者按活动 GM ID 稳定选择。
- 原生角色卡路径通过。
- 启用本地已有 Tidy 5e Sheets `13.5.0`（声明兼容 Foundry 14）后，Actor sheet 构造器为 `Tidy5eCharacterSheetQuadrone`；Effects 页可见 `Injury (1)`，模块没有依赖 sheet 私有实现。
- 浏览器控制台未观察到由本轮两个模块引入的运行时错误；唯一 error 是内置 Browser 的视口低于 Foundry 建议的 `1024×768`（当前 `1280×720`），与模块无关；Chrome 插件不可用时使用了内置 Browser。

## 清理与恢复

- 追加复测前发现上一轮清理记录有误：矩阵世界仍残留旧的临时 Actor，且含有无效的 v14 Activity ID `hrPotionQuick`。已停止模块后用 core-only Foundry 公共 API 清除这些明确的旧临时对象，再重新安装模块复测；这一修正没有覆盖或重置其他世界数据。
- 追加复测创建的 `[E2E] Ammo Security Retest` Actor 及其 10 条关联 ChatMessage 已删除；最终矩阵世界核对为 8 个 Actor、56 条 ChatMessage、仅 `Gamemaster` 用户，未再发现 `[E2E]` Actor/Message。原有场景和原有 Combat 本体保留。
- 关闭本轮全部 house-rules 功能开关；恢复低属性阈值 `4`、N1 伤害倍率 `0.5`、隐匿游荡者等级 `7`、其他后果表为空。
- 恢复矩阵世界模块开关：house rules、injury/Fading、DAE、Blood Hunter、lib-wrapper、socketlib 保持基线；MIDI-QOL 与 Tidy 关闭。
- 停止本地 Foundry Lab；确认没有 `F:\FoundryLab\foundry-v14\*` 进程。
- 恢复 `F:\FoundryLab\foundry-v14\data\server-mirror\Config\options.json`；与备份 `options.before.json` SHA-256 均为 `49F52FD27AD44CDFB2FAC141A753ABE7F02BFF363AFB5814A270813769F9DD15`。
- 未删除本地模块发布目录或历史备份，便于后续继续验收；未触碰生产目录。

## 尚未完成的验收

- `bun run test` 的全仓 15 分钟超时需要后续单独定位测试发现/资源问题后再关闭。
- `bun run ci:verify` 尚未完整结束；当前只证明到 `test:coverage -> test:cli` 进入并发生超时，不能记为 CI PASS。
- 未安装或修改远程生产 Foundry 8080。
- 未进行真实跑团中的长期积累、升级/迁移和断线恢复观察。
- 本地短时 E2E 不能证明所有第三方模块组合或所有自定义 Activity 公式都支持；未知结构仍按失败关闭。
