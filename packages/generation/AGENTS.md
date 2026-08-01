# Foundry JSON 生成规则

## 这个功能是做什么的

本目录把中立 Actor/Item 模型投影为指定 Foundry VTT 与 dnd5e 版本的 JSON，包括 Activities、effects、resources、稳定 ID、法术 manifest 和目标版本校验。

## 防止为单一样例写死

- 每个新推导规则必须归类为 `schema-derived`、`source-derived`、`corpus-derived` 或用户批准并在调用处记录的 `explicit-exception`。
- 不得从动作名本身推断伤害、DC、豁免属性、AC、次数、恢复、条件、临时生命或 module flags。
- 不得增加针对某个怪物、某个动作或某个 Item 名称的机制分支。
- 多个原生公式都可能匹配时，使用有文档的稳定顺序；无法安全决定时保留来源字面值，不添加只让当前样例通过的语义过滤。

## 测试要求

- 新生成规则至少检查三个正例、一个接近反例，以及一个不相关 Actor/Item 不变检查。
- 结构变化必须断言完整生成 JSON 形状，而不只是内部 helper 返回值。
- 目标版本相关行为必须对照锁定的 Foundry/dnd5e/module 资料；不能用 v12 结果证明 v14。
- `src/core/generator` 是兼容层；新生成实现属于本 package，不得在旧路径重新建立第二套 owner。

## 验证

- `bun run typecheck:packages`
- `bun test src/core/generation/__tests__ src/core/generator/__tests__ --max-concurrency 4`
- `bun run audit:anti-overfit`
- Actor 输出变化：经正式 CLI/workflow 重新生成，运行 `bun run verify:actor <source.md> <output.json>`，并按 `docs/generated-actor-verification.md` 对照源 Markdown。

## 完成标准

- 机械检查通过，规则具有正反例泛化证据。
- 真实生成 JSON 的数值、活动、效果和来源限定均与输入及目标版本相符。
- 只有结构验证和语义验收都完成时，才能声明生成器修改完成。
