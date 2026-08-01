# 整改与执行状态索引

本目录记录“还有什么没有完成、为什么没有完成、下一步需要什么证据”。它不是用户教程，也不是完成项目的展示页。

## 两本权威总账

- [项目整改总账](2026-07-15-project-hardening/EXECPLAN.md)：功能缺陷、真实验收状态和长期 finding 的权威来源；
- [架构重整执行总账](2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md)：本次功能分类和目录重整实际完成到哪里。

目录迁移不能自动关闭原有功能问题。比如 Session Monitor 的四小时真实跑团验收、Spell Resolver 的在线恢复、世界资产登录后检查，仍以项目整改总账为准。

## 项目整改里程碑

`2026-07-15-project-hardening/milestones/` 按主题保存较长的专项计划和验收记录，主要包括：

- 类型安全、CI、覆盖率和仓库工件边界；
- Web 部署和产品支持声明；
- 爬虫、Intake、Actor/Item 生成正确性；
- Blood Hunter 和 Classpack；
- Session Monitor；
- Actor 资源、行为关系、生命周期、事件频率和范围语义。

查当前状态时先看 `EXECPLAN.md` 的 finding 表，再进入对应 milestone；不要从某一份旧 milestone 的局部“完成”推断整个功能已经完成。

## 与其他文档的关系

- 当前架构：[项目架构总览](../architecture/README.md)
- 已作出的决定：[架构决策](../decisions/README.md)
- 实际支持边界：[验收与支持状态](../acceptance/README.md)
- 可执行操作步骤：[操作手册](../runbooks/README.md)
- 不再活跃的历史文档：[归档说明](../archive/README.md)
