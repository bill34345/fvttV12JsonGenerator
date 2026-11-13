# 第三方补丁与本地联调

[Foundry 兼容补丁仓库](https://github.com/bill34345/foundry-compat-patches) 维护独立的源码补丁。保留生成器根目录的战斗补丁命令。先把补丁仓库检出为生成器的同级目录 foundry-compat-patches，或设置绝对路径 FVTT_PATCH_ROOT，再按补丁说明安装锁定依赖。补丁命令会从选定目录运行，不会下载、更新或安装模块。Forge 的构建和安装可以单独使用。

DAE 14.0.14 的历史补丁也由兼容补丁仓库维护。旧入口 test:dae 和 build:dae 仍可通过本目录运行，准备输入时参照补丁仓库的 DAE 说明。

历史 Item Piles、Vision／Item Macro、Droppables 与 Clocks 的源码、版本锁与旧构建入口见生成器 Git 提交 81ee47a510c7d9db33633729e196335f4f0b023d。使用时核对当时的 Core、dnd5e、上游包和实际接受范围。[迁移记录](../../docs/plan/server-next-migration-handoff-20260927.md) 保存当时的组合与验收证据。

[Classpack](classpack/README.md) 的合集内容适配和迁移、历史 Item Piles／Vision 联调夹具仍在此处。只有原组合满足的真实行为记录能用于对应版本。
