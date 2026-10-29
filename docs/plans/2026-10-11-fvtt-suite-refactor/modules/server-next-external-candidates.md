# ServerNext 外部候选：逐来源登记与适配

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。此目录是多个外部候选的工作区，不是单一 Foundry 模块或商品。

## 当前事实与职责

`foundry-modules/server-next-external-candidates/` 包含 classpack、DAE、icons、item-piles、vision-macro 等不同来源。各有自己的版本、数据和依赖，没有共用 module ID/manifest。现有 package 脚本与固定测试材料入口可复用，不能把“目录整体通过”当作全部候选接受。

## 切片

1. **E1 一项一份来源记录**：列清每个子目录的来源、commit/版本、许可/分发范围、目标、具体本地差异、输入材料和实际接受；未知保持 UNKNOWN。
2. **E2 有需求才适配**：当自有模块确实依赖某外部接口，按该候选的最小真实调用和来源反证处理。没有实际问题的候选保留现状，不统一换框架或移入自有模块。
3. **E3 明确去向**：可独立维护的适配继续拥有自己的目录与证据；需要发行的真实资产/补丁先核来源和权限。合集只登记兼容说明或外部安装信息，不打包整个候选货架。

## 保护与验收

- 固定输入库、上游UUID/pack身份、原语义证据和各候选既有数据保护；不依赖已退役旧worktree或自动复制本机材料。
- 测试路径与安装路径分开；静态构建不等于当前系统、模块组合或迁移接受。
- Classpack等内容迁移逐Document类型核对；不能把Actor/Item成功外推到Journal/RollTable/Macro。
- 选择一个候选后才补其目标版本/原生调用/恢复；不默认整仓第三方矩阵或长时运行。

已有根入口：`bun run test:classpack-next`、`bun run test:legacy-next-inputs`。其他候选的安全入口从本目录 `package.json` 的对应 script 选取，执行时核对实际前置，不发明统一安装命令。本轮没有执行这些检查。

下一步：E1，只读建立候选级记录并确认哪些是新合集的实际外部依赖；不升级任何服务。

E1/E3已有逐来源登记及去向，见[外部登记](../workstreams/external-source-register.md)。未核的新分发范围保持UNKNOWN，不默认执行E2。
