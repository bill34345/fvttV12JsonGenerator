# ServerNext 自定义状态与触发器源码归属边界（2026-09-28）

## 结论

`fvtt-custom-conditions` 与必需依赖 `fvtt-trigger-engine` 目前都**没有可直接移植的精确旧版源码**进入本迁移 worktree。Server Mirror 两包实际安装版本均为 `0.1.1`，锁 Foundry 14.364 / dnd5e 5.3.3；主仓已提交 `master` 的对应源码清单仍为 `0.1.0`。不能把已提交旧版编译后命名为新版本，也不能把 Mirror 安装包本身当作新目标源码。

## 只读核对

- 迁移 worktree 的基点 `b0396c3` 早于主仓 `e8604d6`；初始连 `fvtt-custom-conditions` 目录也没有。主仓该目录已提交且无未提交改动，所以本轮曾仅将主仓已提交目录及 `packages/contracts/conditions` 契约临时放入迁移 worktree 进行构建对照。
- 主仓 `0.1.0` 源码构建成功，但 `scripts/index.js` SHA-256 为 `CAB7014EDEDA1E9148B61F141EDABC822F7021D59E494B52BDACB0442F558542`；Mirror 已装 `0.1.1` 对应文件为 `20231875BDDC73B8B759CED8D6C85AB4824C963CEB68780B32FA29A902F0A362`。版本和脚本都不同，旧源码不能代表 Mirror 当前行为。
- 唯一发现带 `0.1.1` `src/module.json` 的本地源码在 `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260922-132850-weapon-traits-research`。该工作树的 Custom Conditions 与 Trigger Engine 多个源码文件仍是未提交改动，另有未跟踪实现；其当前 `dist` 脚本哈希 `BEDBC94E68354640BCAE254F3C14FCDDD90E5F8C5EED8166A451EF10944C7CEF` 也不同于 Mirror 已装包。这里只做了只读核对，没有改动或复制那个工作树。
- 本轮临时引入迁移 worktree 的 `0.1.0` 源码、契约和构建目录均已核对归属后清理；未安装到 Next，未改 Mirror 或世界数据库。迁移 worktree 对这些路径恢复原状态。

## 下一步

先以 Mirror `0.1.1` 的精确安装文件与现有源码/证据做差异归属，确定哪个源提交或保存的构建对应旧服实际行为，再在本迁移 worktree 中建立有来源的 Foundry14.368/dnd5e6.0.2候选。先处理 Trigger Engine，因为 Custom Conditions 的 manifest 必需依赖它；最后各自执行局部检查、无备份离线安装与独立 Chrome 的关键路径验收。来源未闭合前两项保持 `HOLD_SOURCE`，不靠改版本号放行。
