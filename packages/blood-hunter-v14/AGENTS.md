# Blood Hunter v14 package

本包只负责把锁定的 `BloodHunter2024` enriched source 编译成 Foundry VTT
14.364 / dnd5e 5.3.3 所需的原生文档契约，并生成**纯**迁移计划。

- 修改入口是 `src/index.ts` 公开的 compiler、validator 与 migration planner；不得在此包启动 Foundry、访问 World/LevelDB 或执行任何写入迁移。
- 输入身份、22/30/42 形状、四个子职和 side-data 关联必须 fail closed。外部规则只可用稳定 reference key 表达，不能猜测世界 UUID。
- 运行 `bun test` 与 `bun run typecheck`（均在本目录）验证。测试必须检查编译后的语义边界，而不只检查对象可解析。
