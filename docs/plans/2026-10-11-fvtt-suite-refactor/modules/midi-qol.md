# Midi-QOL：外部源码适配计划

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。这是外部适配 owner，不是新的自有可售模块。

## 当前事实与职责

`foundry-modules/midi-qol/` 保存 upstream lock、patches、CLI 与补丁契约测试，没有本项目独立的模块 manifest。当前 `upstream.lock.json` 指向历史 Core14.368/dnd5e6.0.2、`14.6.0-beta.4338eeab.local.9`；支持矩阵另记 local.10 的限定接受。两者不能混作同一候选，不能用旧 lock 生成物覆盖现有新安装。

## 切片

1. **MI1 来源与候选对齐**：分别记录上游 commit、补丁hash、目标版本、构建和实装证据；核对 local.9 与 local.10 的真实关系，原件保留。不仅修改一个版本字符串。
2. **MI2 一个补丁契约**：以现有 `patches/`、`cli.ts` 和测试为 owner，对一个实际接口差异做最小来源反证、补丁验证与调用方影响检查；WMP等只通过自己的公开Adapter消费。
3. **MI3 组合接受**：取得适用目标/服务窗口后，验证补丁所改变的一条真实请求/攻击链及相应消费者，不重跑所有上游功能；原始未接受项保持。

## 保护与验收

- 保留 upstream commit `4338eeab…`、lock与patch身份、当前 accepted 收据，区分来源下载、构建、实装和玩法。
- 不从工作树背后修改共享系统/模块，不复制脏上游树；没有维护权限不安装、不启停。
- 错误源码、重复应用、补丁不匹配和不支持版本 fail-closed；旧锁定材料只是测试输入，不能推导当前服务状态。
- 自有合集手册可以说明依赖与兼容性，但不能把第三方源码或授权当作套餐自有资产。发行范围按实际上游许可与文件白名单核对。

已有入口：`bun run midi-qol:test`、`bun run midi-qol:upstream-check`、`bun run midi-qol:build`。后两者按实际网络/构建范围授权选择，本轮未执行；安装入口不作为默认重构步骤。

下一步：MI1 只读对齐。没有明确的新兼容问题时，不为合集产品化重建或升级 Midi。

MI1本地lock六patch哈希已核；local.9/10边界见[外部登记](../workstreams/external-source-register.md)。未读取实装或重建上游。
