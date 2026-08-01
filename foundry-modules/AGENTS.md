# Foundry 浏览器模块规则

## 这层目录是做什么的

`foundry-modules/` 保存安装进 Foundry VTT 的独立发布单元。每个模块拥有自己的 manifest、版本、构建、测试、安装保护、README 和运行时验收边界。

## 公共边界

- 模块之间不得导入彼此的私有实现；共享内容必须是明确、最小、browser-safe 的契约。
- Foundry browser runtime 不得导入 Node、Bun、Windows、SSH、CLI server 或 generator 私有实现。
- `src/module.json`、构建后的 manifest、package version 和发布 ZIP 必须一致。
- 构建和安装到 `F:\FoundryLab\foundry-v14` 只属于本地 v14 集成测试，不是生产部署。唯一生产环境是远程服务器 8080 Foundry；安装器只允许精确的、配置后的本地测试 mirror，并保留 owned-module 与链接/根目录防护。
- Foundry/dnd5e/module API 行为必须对照锁定版本资料和目标 runtime 验证，不得凭记忆或最新版文档推断。
- 不得通过直接编辑世界 LevelDB、修改 compendium 或 patch Foundry/dnd5e prototype 来绕过正式模块行为。

## 验证

- `bun run typecheck:foundry-modules`
- 运行模块自己的 test、build 和 manifest/archive 一致性检查。
- 对 UI、Hook、设置和运行时行为做项目本地 Foundry smoke；生产和长时验收按根安全边界单独授权。

## 完成标准

- 源码、manifest、版本、构建产物和安装目标一致。
- 自动测试通过且目标 Foundry runtime 中的真实行为符合模块目标。
- 本地 smoke、生产接受和长时接受必须分开报告，不能互相替代。
