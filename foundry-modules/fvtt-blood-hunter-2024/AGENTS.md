# 血猎手 2024 模块

正式构建默认 native6；`--target=server-next` 仅作别名，legacy 构建入口已退出。内容投影身份保留 Core 14.368／dnd5e 6.0.2，主要开发目标为第二套本地 Core 14.370／dnd5e 6.0.6。Core 14／dnd5e 6 主版本范围开放不等于未来版本玩法已验。

- 模块消费 `packages/blood-hunter-v14/src/index.ts` 公开编译接口；不在浏览器重建编译器或导入 Node／Bun／LevelDB。
- 原始 bytes、canonical ID、UUID 与选择图保持来源可追溯。需要改正式内容时改编译器再重建，不手改 pack。
- 破晓附伤仅使用 CAT／CPR 的公开 API；绑定实际武器与附魔 UUID。按 Core 14 `system.changes` 创建 runtime Effect，不能用旧顶层 changes。
- 双血咒通过正常 Activity 工作流结算，各自资源一次，总共一次附赠动作或反应。引用实际角色资源 Item ID，只在本次施放的临时 Item 副本中适配。
- 不在 ready 扫描或批量修改 Actor。canonical 图标名称更新须 GM 明确指定角色并审阅差异，只写选中的 name／img。旧 Plutonium 中文分支按锁定来源的 page/source/URL hash 加 book/rules 唯一匹配，仅写 img，保留名称、机制和全部旧 flags；索引由源构建产生。完整旧迁移 UI 保持只读 Preview，不调用历史 Copy／Apply 备份路线。
- 安装仅允许配置的 `data/server-mirror` 开发环境 `development`／30001；拒绝 30004、生产、foreign same-ID、逃逸、reparse 和实际占用。复用共享停服检查；Windows 独占读确认残留LOCK未被持有，不能按文件存在／0B判断，也不删除锁文件。保留 owned/hash 保护，直接替换，不创建备份；失败停止并报告。
- Core 选择使用共享 `FVTT_OPS_DEVELOPMENT_FOUNDRY_VERSION`，默认14.370、最低14.368，app及默认classic-level路径跟随；安装时实际package.release必须与所选Core身份一致。
- 构建与测试写入随机临时目录或本目录 dist，不写真实世界数据库。Bun 使用 Foundry 独立 1.3.14；运行根 `test:blood-hunter-v14` 及本目录／编译包 typecheck。
- 说明与公开用法见 [README](README.zh-CN.md)，真实行为验收与环境维护范围以项目唯一维护记录为准。当前不把历史四个3级角色授予结果推广为全等级或旧人物迁移通过。
