# 可移植法术清单契约规则

## 这个功能是做什么的

本目录定义生成器与目标世界 Monster Spell Resolver 之间的纯数据契约：结构、哈希、来源信息和禁止携带的目标世界标识符。

## 不可违反的规则

- 契约必须保持可移植，不得携带目标世界 Actor、Item、Compendium、Activity 或其他世界专属 ID。
- 项目生成阶段的法术解析状态只能是 portable `pending`；manifest 必须保留逐 ref 的来源证据、使用方式与限制，但不得预先写入候选世界、解析结果、缓存 Spell 或 hydration 产物。
- schema、validator、hash 和 unknown-property 检查必须保持确定性，不能依赖 Foundry 全局对象、DOM、网络或本地世界。
- 新字段必须明确可选/必需、版本兼容和旧 consumer 行为；不能只改 producer 或只改 resolver。
- 验证通过只证明 portable/static manifest 契约合法和 source evidence 可核对；不证明目标世界一定有匹配法术、不证明 hydration 成功，也不证明原生施法运行时可用。

## 修改入口与验证

- 公共出口：`packages/spell-manifest-contracts/src/index.ts`。
- `bun run typecheck:packages`
- `bun test packages/spell-manifest-contracts/src/__tests__/contract.test.ts --max-concurrency 4`
- 同时运行受影响的 generator manifest 测试和 `bun run test:spell-resolver`。

## 完成标准

- producer、contract 和 consumer 对同一版本/字段达成一致。
- 目标世界标识符禁入和未知字段拒绝仍有效。
- 至少一个真实生成 manifest 和一个非法/旧 manifest 被检查；契约测试不能代替 Foundry 运行时验收。
- 报告必须把 portable/static、目标世界 hydration 与实际 native cast runtime 分为三个层级，不能相互替代。
