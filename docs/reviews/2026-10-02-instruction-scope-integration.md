# Instruction Scope 选择性整合

日期：2026-10-02。基线 master `61974058f1af4e0f70fc675a0c856cae07d99a8f`。源提案 `20260914-101915-instruction-scope`；本轮窄候选 `20261002-162723-instruction-scope-integration`。

用户先要求评估是否纳入，随后明确要求父任务在独立 Server Mirror E2E 期间处理 Instruction Scope。本轮据逐项评估落实规范增量，没有整文件覆盖旧七文件，也没有迁入旧任务的模型、版本、发布或权限配置。伤势模块与本地服务的候选字节不受这项规则修改影响。

## 采用的边界

| 范围 | 最终规范 | 保留的底线 |
| --- | --- | --- |
| 根 Ruler、handbook、worktree runbook | 入口、输入／输出、支持版本、步骤或安全限制变化时改写说明；内部改动先核对用户信息 | 已有 watch／目录覆盖不缩小；stale 的受影响条目仍人工 review、生成与检查；合并前后手册门禁保留 |
| generation 局部 AGENTS | 三个有意义正例覆盖不同来源、目标类型或逻辑分支，不复制同分支凑数 | 至少三个正例、接近反例、不相关 Actor／Item 不变检查，以及来源语义和版本门均保留 |
| ingest-documents 局部 AGENTS | 显示层修改有明确未变证据时，只核原页与受影响的可追溯字段 | 提取正文、顺序、候选或下游内容／消费行为改变或证据不足，仍执行完整来源链对照 |
| intake-ai 局部 AGENTS | 分清真实来源、dry-run、fake provider与本地只读 verifier；列出现行四输入命令和报告写入选项 | 四输入同来源／run；dry-run／fake 不证明真实模型或 accepted；已有明确授权持续有效，超范围再澄清 |
| 同日用户明确的Chrome路由 | Chrome页面测试使用当前官方Chrome连接器与拥有的tab；先核真实组件和标准连接能力 | 不因技能项未显示自动转Computer Use；独立任务不改变接口选择；URL／网站许可检查及明确拒绝保留 |

根 AGENTS 只由 `.ruler/AGENTS.md` 生成；没有手改生成根。共享 package 的归属、正式 JSON 流程、5.x／6.x 政策、用户 dirty 保护、无备份要求、生产权限和提交／合并／push 权限均未放宽。

## 手册语义核对

- Markdown生成：生成流程、三个正例与来源语义底线仍在，没有新增产品类型或目标。
- Monster／Item／Species Intake：provider、dry-run 与 accepted 的边界保留；同一会话已有授权不逐次重问。只读四输入 verifier用于既有Monster来源链，未推广为所有Item／Species通用命令。
- 文档输入：元数据显示的窄检查需要未变证据；用户实际PDF生成流程不因显示例外省略原页或来源链。
- 开发与验证：watch stale仍需review；全仓CI、真实Foundry和生产是不同接受层，规则文档修改不触发无关运行时测试。
- 人类MD／战斗包：核对现行Chrome执行角色，不把历史Luna Max名称当当前默认；Intake provider与验收操作者分开。

既有源提案与伤势候选均保持原样。检查结果记录在本轮证据目录的 `instruction-scope-checks.log`；Ruler、命令和手册生成证据不能代表代理以后永远执行正确，更不构成伤势玩法PASS。

## 当前状态

选择性规范已实现：Bun1.3.14 frozen install、Ruler生成、32文件分层／幂等检查、Monster verifier现行CLI帮助、七个受影响手册条目逐项review，以及28项手册build／check均通过；最终diff文义／作用域与引用核对及 `git diff --check` 通过。没有改变watch清单或检查器，没有新增生成／Intake运行逻辑。仅文档／指令变化，未重复类型检查、全仓测试或启动另一份Foundry。

本轮E2E按用户最新要求只在Server Mirror：14.364／5.3.3／fvtt-v14-module-matrix。ServerNext为本轮范围外，已有6.0.5候选仍不宣称真实接受。规范已纳入最终整合topic，最终组合CI3341通过／1跳过、伤势与WMP依赖代表实机／恢复均PASS；本地master整合共用[最终记录](2026-10-02-injury-condition-integration.md)，push／生产仍受实际授权边界约束。
