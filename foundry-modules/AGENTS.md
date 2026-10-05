# Foundry 浏览器模块规则

## 这层目录是做什么的

`foundry-modules/` 保存安装进 Foundry VTT 的独立发布单元。每个模块拥有自己的 manifest、版本、构建、测试、安装保护、README 和运行时验收边界。

## 公共边界

- 模块之间不得导入彼此的私有实现；共享内容必须是明确、最小、browser-safe 的契约。
- Foundry browser runtime 不得导入 Node、Bun、Windows、SSH、CLI server 或 generator 私有实现。
- `src/module.json`、构建后的 manifest、package version 和发布 ZIP 必须一致。
- 构建、安装、启停和短时测试配置后的 `F:\FoundryLab\foundry-v14` 可自主进行，但只属于本地 v14 集成测试，不是生产部署。先核对 server-mirror 的 PID、端口、路径和运行者；被其他参与者占用时等待，不停止、不复制另一套 Lab。唯一生产环境是远程服务器 8080 Foundry；安装器只允许精确本地 mirror，并保留 owned-module 与链接/根目录防护。
- Foundry/dnd5e/module API 行为必须对照锁定版本资料和目标 runtime 验证，不得凭记忆或最新版文档推断。
- 不得通过直接编辑世界 LevelDB、修改 compendium 或 patch Foundry/dnd5e prototype 来绕过正式模块行为。

## 验证

- 局部实现先运行受影响的模块测试；模块整合时执行 `bun run typecheck:foundry-modules`、模块 test/build 及 manifest/archive 一致性检查。已通过且相关输入未变的整合结果可以复用，命令清单不是每次编辑都重复的流水线。
- UI、Hook、设置或运行时接口变化时补对应的本地 Foundry 行为检查；规则组合优先由局部测试或真实 API 检查覆盖，UI保留独特交互和角色边界。文档、导出器或恢复器修复只验证受影响层，不能撤销独立有效的业务结果；确实缺失的证据仍须补齐。
- 公共验收工具没有本模块 adapter 时，可用模块现有安全入口或小型专用检查保存原件及语义判断，不以扩建公共平台为开工前置。生产、授权和明确支持范围的门禁仍按根规则执行。

## 完成标准

- 源码、manifest、版本、构建产物和安装目标一致。
- 自动测试通过且目标 Foundry runtime 中的真实行为符合模块目标。
- 本地 smoke、生产接受和长时接受必须分开报告，不能互相替代。
