# 自然 20 `minX` 扩展本地 Foundry 验收报告

- 日期：2026-08-09（Asia/Shanghai）
- 目标：Foundry VTT `14.364`、dnd5e `5.3.3`
- Lab：`F:\FoundryLab\foundry-v14\data\server-mirror`
- 世界：`fvtt-v14-module-matrix`
- 模块：`fvtt-house-rules` `0.1.0`
- 范围：本地 Lab；未连接或修改生产 8080

## 结论

自然 20 扩展在锁定的真实 Foundry/dnd5e 运行时中通过。模块保留 dnd5e 已扩展的完整重击骰池，只把第一伤害部分的首颗真实 `Die` 拆成 `1dXminX`；武器攻击与远程法术攻击路径均观察到“原始骰面低于最大值，但计入值为最大值”。额外伤害部分继续按 dnd5e 原生重击，未获得 `minX`。

本轮真实运行验证使用临时 Foundry 脚本宏强制创建自然 20 攻击来源，并在真实 `CONFIG.Dice.DamageRoll`、真实 `foundry.dice.terms.Die` 和已注册的 `dnd5e.postDamageRollConfiguration` Hook 中回放。它验证了模块 Hook 与实际骰子求值，不等同于对每一种角色卡或第三方 Activity 点击流程逐一回放；未知 Activity 结构仍按设计失败关闭。

## 机械验证

| 检查 | 结果 |
|---|---|
| `fvtt-house-rules` `bun run test` | PASS：30 pass / 0 fail / 167 expect |
| `fvtt-house-rules` `bun run typecheck` | PASS |
| `fvtt-house-rules` `bun run build` | PASS |
| `fvtt-house-rules` `bun run verify:artifact` | PASS：6 个确定性 ZIP 条目 |
| 根 `bun run typecheck:foundry-modules` | PASS |
| 本地模块安装保护与 `verify:local-lab` | PASS |
| Lab HTTP | PASS：`http://127.0.0.1:30001/` 返回 200 |

## 真实运行观察

### 武器攻击：`mwak`、基础 `1d8 + 3`

- dnd5e 原生重击先生成两颗 d8。
- 模块处理后公式：`1d8min8 + 1d8 + 3`。
- 骰子总数：2 颗 d8，没有减少。
- 首颗原始骰面：5。
- 首颗计入值：8。
- 本次总伤：16。
- 独立 rider：原生 `2d6`；2 颗骰均保留，未出现 `minX`。
- 模块消息配置标记 `naturalTwentyApplied=true`。

### 命中类法术：`rsak`、第一伤害部分 `2d6`

- dnd5e 原生重击先生成四颗 d6。
- 模块处理后公式：`1d6min6 + 3d6`。
- 骰子总数：4 颗 d6，没有减少。
- 首颗原始骰面：1。
- 首颗计入值：6。
- 本次总伤：14。
- 独立 rider：原生 `2d4`；2 颗骰均保留，未出现 `minX`。
- 模块消息配置标记 `naturalTwentyApplied=true`。

### 失败关闭

fixture 覆盖并通过：只有豁免而没有攻击检定的 Activity、非自然 20、非重击伤害、已求值 Roll、多个/缺失武器 base part、已有 `min/max` 和无法确认的骰子结构都不会被模块改写。

## 安装、恢复与清理

- 旧 Lab 模块移到可恢复备份：`F:\FoundryLab\foundry-v14\evidence\manual-verification\module-backup-20260809-natural20-minx`。
- 新构建安装到精确目标：`F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules\fvtt-house-rules`。
- 原受保护停止命令因缺失 `server.pid` 拒绝执行；随后只停止了已核对命令行、可执行文件、dataPath 和端口均属于该 Lab 的 PID `52940`。重启后 PID 为 `48020`。
- 临时宏 `[TEMP] Natural20 minX E2E`、强制攻击来源和结果 ChatMessage 已删除。
- `featureNaturalTwenty` 已恢复为测试前的关闭状态。
- `Step2 Sheet PC` 的 Longsword 已恢复为 `Not Equipped`。
- 本地服务继续运行并把 `http://127.0.0.1:30001/game` 页面交还用户。

## 验收边界

- 本地锁定版本的真实 Roll/Hook 语义通过。
- 本轮没有连接或安装到生产 8080。
- 本轮没有重新执行全仓 `bun run test` 或 `bun run ci:verify`；旧计划记录的全仓超时仍不能写成通过。
- 未覆盖所有自定义 Activity、第三方角色卡和长期真实跑团；这些不确定结构继续失败关闭。
