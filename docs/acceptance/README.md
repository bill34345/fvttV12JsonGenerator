# 验收与支持状态索引

本目录记录“功能真实通过到什么程度”。测试通过、文件存在或构建成功只是机械证据；只有对应运行时或人工语义检查也通过，才能扩大支持声明。

## 先看这里

- [Current Support Matrix](current-support-matrix.md)：当前版本、环境和功能支持边界；
- [Current Acceptance Corpus Matrix](current-corpus-matrix.md)：已经人工核对过的代表性输入；
- [Generated Actor / Item Verification](../generated-actor-verification.md)：Actor/Item JSON 应怎样对照源资料验收。
- [退役取证与遗留整合候选](../reviews/2026-10-02-retirement-and-integration-ledger.md)：36 个删除对象的证据边界、首批未发布候选及后续窄门。
- [Species TXT Intake 与累计模块](../species-ai-intake-v14.md)：Species Evidence IR、规范 Markdown、V14 race/feat package、accepted ledger 与模块构建边界。

## Actor 和转换结果

- [Foundry v14 Source-to-JSON Full Review](v14-source-json-full-review.md)
- [Foundry v14 Core Batch Verification](v14-core-batch-verification.md)
- [Foundry v14 Modded Profile Batch Verification](v14-modded-batch-verification.md)
- [Aboleth Spawn v14 验收](v14-aboleth-spawn-verification.md)
- [Slithering Bloodfin 验收](slithering-bloodfin.md)
- [Rat Warlock 法术解析器验收](2026-07-18-rat-warlock-spell-resolver.md)

## Foundry 运行时与模块

- [Foundry v14 Live Runtime Smoke Test](v14-live-runtime-smoke-test.md)
- [Foundry v14 Module Compatibility](foundry-v14-module-compatibility.md)
- [Foundry v14 Module Health](foundry-v14-module-health.md)
- [WMP 本地交付终审（14.364 / 5.3.3 历史接受）](../reviews/2026-09-25-weapon-mastery-user-report.md)
- [Trigger Manager 完整重载专项（14.364 / 5.3.3）](../reviews/2026-09-22-trigger-manager-reload-acceptance.md)
- [Crystalbleed V12 历史运行接受（12.331 / 4.3.9）](2026-09-09-crystalbleed-v12-runtime.md)
- [Foundry v14 Module Parity](foundry-v14-module-parity.md)
- [Chat Memory Guard 人工验收清单](chat-memory-guard-manual-checklist.zh-CN.md)
- [Chat Memory Guard 运行时验收报告](chat-memory-guard-runtime-report.zh-CN.md)

## 性能和长期观察

- [`cor-cotn` 长时游玩性能优化 Checklist](cor-cotn-performance-optimization-checklist.zh-CN.md)
- [Foundry v14 本地优化与生产端操作记录](foundry-v14-local-optimization-log.zh-CN.md)
- [Foundry v14 操作累积诊断报告](foundry-v14-operation-accumulation.md)

Foundry、Chrome 和 Session Monitor 工作沿用根说明，不设固定总时长上限，单操作仍保留超时。四小时或其他长时测试仅在用户明确要求相应验收时运行；真实会话及所需设备证据不能由模拟或多个短测试替代。
