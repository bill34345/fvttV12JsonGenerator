# Blood Hunter 编译包

本包负责把锁定的 2024 BloodHunter enriched source 编译为原生文档，并提供纯迁移计划。正式构建默认 native6，内容投影身份为 Core 14.368／dnd5e 6.0.2；主要实际开发环境为 Core 14.370／dnd5e 6.0.6。历史 5.3.3 对象重载用于对照回归，不作为正式构建入口。

- 修改源头并重新编译；保留原始 source SHA、canonical ID 和 UUID，不手改最终 pack。
- 不在本包启动 Foundry、访问 World／LevelDB 或执行角色写入。
- 保留输入身份、22／30／42 源形状、四子职、side-data 和外部引用检查。显示名称与图标独立于身份。
- 运行本目录 `bun run test`、`bun run typecheck`；模块的正常施放与资源行为另在对应 runtime 验证。
