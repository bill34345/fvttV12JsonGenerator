# 怪物法术解析器

这是安装进 Foundry Virtual Tabletop（Foundry VTT）的浏览器模块。它读取本项目生成 Actor 携带的可移植法术清单，在目标世界已启用的 dnd5e 法术资料包中寻找匹配法术，并以 Actor 为单位执行全有或全无的安全解析。

## 目录归属

- `src/`：浏览器运行源码、`module.json`、语言文件、样式、模板和模块测试。
- `build.ts`：构建可安装目录和 ZIP。
- `lab.ts`、`labCli.ts`、`labConfig.ts`：只负责配置后的本地 Foundry Lab 构建、安装、校验、卸载和一次性测试世界准备。
- `dist/`：可重建的本地构建产物，不提交 Git。

旧目录 `src/foundry/monster-spell-resolver/` 和旧构建、安装脚本已经退役；本目录是唯一实现位置。

## 常用命令

在仓库根目录运行：

```powershell
bun run test:spell-resolver
bun run typecheck:foundry-modules
bun run build:spell-resolver
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
```

构建产物位于 `foundry-modules/monster-spell-resolver/dist/`。本地安装目标由 `FVTT_OPS_LAB_ROOT` 精确解析；当前机器的持久测试环境是 `F:\FoundryLab\foundry-v14`。

## 支持与安全边界

- 锁定 Foundry VTT `14.364` 与 dnd5e `5.3.3`。
- 本地安装和短时验证只针对配置后的 F 盘测试环境；完成 server-mirror 的 PID、端口、路径和运行者预检后可自主执行，被其他参与者占用时等待。
- 唯一生产环境是远程服务器 8080 Foundry；只读 inventory/acquire 可在保留 CLI guard 和目标核对的前提下自主执行，生产安装或 Actor hydration 等写入必须再次取得明确授权。
- 构建、单元测试和安装 hash 一致只能证明机械正确；目标世界中的实际解析行为仍需单独做运行时语义验收。
