# 2026-07-31 架构工具与调用边界基线

## 范围

本基线覆盖 `src/`、`scripts/` 和 `tests/` 的静态依赖、循环依赖、未使用入口与已建立的 application facade。它不扫描
`.local/`、`references/`、Obsidian 内容、生成物或第三方缓存，也不把静态分析结果当作删除授权。

## 锁定工具

| 工具 | 版本 | 正式入口 |
|---|---:|---|
| Bun | 1.3.8 | 项目脚本运行时 |
| dependency-cruiser | 18.1.0 | `bun run architecture:deps` |
| Knip | 6.29.0 | `bun run architecture:cycles` / `bun run architecture:unused` |
| domhandler | 6.0.1 | 直接生产依赖 |

当前机器的 Node 25.4.0 不在 dependency-cruiser 18.1.0 的支持范围内，因此依赖检查显式通过
`bunx --bun depcruise` 运行。Windows 上直接执行 `knip-bun.exe` 会留下不退出的 Bun 子进程；正式脚本改为
`bun node_modules/knip/bin/knip-bun.js`，并验证命令结束后没有遗留 Knip 进程。

## 强制边界

`.dependency-cruiser.cjs` 当前阻止：

- 任意循环依赖；
- `src/core` 反向依赖 Web、Foundry、tools 或 scripts；
- Web 与 Foundry/runtime/operator 层相互穿透；
- crawler core 依赖主 CLI；
- 生产代码依赖测试实现；
- 单文件转换调用方绕过 `src/core/application/conversion.ts`；
- CLI、Web、Foundry 与 operator tools 直接依赖 workflow/Intake orchestration 内部实现；
- delivery/operator 层直接依赖 generator 内部文件。

monster spell resolver 对 intake/parser 私有实现的既有依赖仍保留为 warning debt；它没有被本阶段伪装成已关闭。

## 2026-07-31 结果

### Stage 1

- dependency-cruiser：360 modules / 842 dependencies，0 violations；
- Knip cycles：0；
- 删除 3 个已确认循环：
  - spell resolution types 与 intake types；
  - token review 与 contact sheet；
  - Foundry adapter 与 settings app；
- 将 Actor verifier 实现移入 core，`src/tools/actorVerification.ts` 保留 CLI/兼容转发；
- 删除确认无任何静态或动态调用方的 `src/core/generator/actor-consts.ts`；
- 删除 root `index.ts` 的 Hello World 假入口；
- 删除未使用的 `marked` 与未直接使用的 `bun-types`，补齐直接使用的 `domhandler`。

### Stage 2

- dependency-cruiser：366 modules / 854 dependencies，0 violations；
- Knip cycles：0；
- 7 个生产调用方全部改经 conversion facade；
- collection、sync、Web job、AI Intake 与 plaintext pipeline 改经 application use-case facade；
- delivery/operator 层直接导入 generator 内部文件：0；
- 直接生产导入 `singleFileConversion.ts`：仅 facade 自身；
- Knip 高置信结果：
  - unused files：0；
  - unused dependencies：0；
  - unused devDependencies：0；
  - unlisted dependencies：0；
  - unresolved imports：0；
  - unused exports：37；
  - unused exported types：46。

最后两项维持 report-only。它们包含公共 API、动态入口和未来 package contract 候选，未因静态报告批量删除。

### Stage 3A：contracts workspace package

- `@fvtt-json-generator/contracts` 成为第一个物理 workspace package；
- package 自身只包含类型契约，不依赖 `src/`、`scripts/`、`apps/` 或其他实现 package；
- 生产代码直接导入 package exports，旧 `src/core/contracts/*` 仅作为兼容 adapter；
- dependency-cruiser 扫描范围增加 `packages/`，并阻止 package 反向依赖和旧路径回流；
- Knip 覆盖 workspace package entry/project，unused files/dependencies/devDependencies/unlisted/unresolved 均为 0；
- workspace install、冻结 lockfile、package-local typecheck 与根级类型检查均通过。

### Stage 3B1：parser kernel workspace package

- `@fvtt-json-generator/parser` 首批包含 action/English action/structured action、normalize、i18n 与 action IR；
- 高层 YAML/router/item parser 保留原位，避免同一提交混入 spell-manifest、mapping 与 item model 迁移；
- package 不依赖 `src/`、`scripts/`、`apps/` 或其他实现 package；
- 生产代码直接导入 package exports，旧路径由测试覆盖的 compatibility adapter 提供；
- `opencc-js` 由实际消费它的 parser package 声明，根 package 不再伪装成直接消费者；
- i18n 为保持现有行为仍从仓库 `data/cn.json` 读取定义；这属于 Stage 5 data-root 债务，
  所以当前 package 只宣称代码依赖独立，不宣称可脱离仓库发布；
- 迁移检查暴露并修复 anti-overfit 的 workspace 漏扫：`src`、`packages`、`scripts` 的 tracked、
  untracked 与 diff sources 现在都进入审计。

### Stage 3B2：spell-manifest contracts workspace package

- portable manifest schema/types/validation/forbidden-target-identifier 从 resolver runtime 中分离；
- package 只依赖共享 contracts，不依赖 parser、Intake、generator 或 Foundry runtime；
- 通用 SHA-256 下沉到 contracts，Session Monitor 不再借道 spell-resolution；
- YAML parser、Intake 和 generator 使用 package contract，旧路径只做兼容；
- 迁移顺序从计划末尾提前，是由高层 parser 的真实依赖方向决定，不改变产品支持声明。
- 为规避 Bun 1.3.8 在 test runner 内嵌 bundler 读取共享 workspace 源时的已知
  `Unexpected reading file` 类问题，resolver browser bundle 在受控子进程执行；
  输出目录、静态文件、禁入文本扫描与确定性 ZIP 验收保持不变。

### Stage 3B3a：models workspace package

- `@fvtt-json-generator/models` 取得 action/item/resource/behavior 中间模型所有权；
- parser 依赖 models，models 不反向依赖 parser、generation 或任何交付/runtime/operator 层；
- 原 `src/core/models/*` 与 parser action-model subpath 保留兼容 adapter，并有类型契约测试；
- 生产代码直接导入 models package，dependency-cruiser 阻止回流兼容路径；
- 这一步先关闭高层 parser 的真实依赖闭包，只迁移类型所有权，不改解析或生成算法。

### Stage 3B3b：high-level actor parser

- YAML、English bestiary、route factory、field mapping 与 resource/behavior semantics 已进入 parser package；
- package 显式拥有 `js-yaml`、models 与 spell-manifest contracts 依赖；
- production 只通过 package exports 使用 actor parser，旧源路径由兼容测试锁定；
- item parser 仍留在原位，作为下一个独立迁移和语义验收单元；
- `data/cn.json` 仍是 Stage 5 data-root 债务，因此尚不宣称 parser 可脱离仓库发布。

### Stage 3B3c：item parser

- ItemParser、item route 与 strategy 已进入 parser package；
- workflow 通过 package exports 调用，旧路径仅保留兼容；
- 迁移后 Knip 保持 0 cycles 与 0 unused files/dependencies；
- 一次完整 CI 中 Knip 子进程发生未稳定复现的高 CPU；standalone 与第二次完整 CI 均通过，
  因此记录为工具进程偶发而非静默忽略。

## 正式机械验证

`bun run ci:verify` 在 Stage 2 当前树上通过：

- 1,579 tests / 0 failed；
- 7,465 expectations；
- 150 test files；
- production lines 38,515 / 45,080（85.44%）；
- production functions 3,857 / 4,376（88.14%）；
- anti-overfit：204 sources；
- hygiene：1,905 tracked paths；
- dnd5e 5.3.3 reference：ok；
- Web production build：通过；
- offline Actor smoke：White Tusk Shaman，6 个来源 Item，0 verifier warnings，0 network calls。

## 语义验收边界

架构工具只证明调用方向和静态事实。Stage 2 另外通过项目 CLI 重新生成并人工核对：

- 中文 YAML Actor：Slithering Bloodfin；
- 英文 bestiary Actor：White Tusk Shaman；
- portable spell manifest Actor：Warlock of the Rat God；
- Item：Shield of the Cavalier；
- GoddessFantasy fixture record → plaintext → Actor；
- AI Intake accepted/pending-resolution 边界；
- Web upload → registered download JSON。

这些检查没有升级 Foundry 真实运行时、生产环境、在线 hydration 或当前 support matrix 的声明。

Stage 3A 另用项目 CLI 重新生成 Slithering Bloodfin v14/core Actor：

- canonical verifier：0 warnings；
- 姓名、类型、AC、HP、CR、感官、9 个 Item 及其 activities/effects 保持；
- 与 Stage 2 产物仅有 Effect `_id` 和生成时间差异；去除这些运行时身份后完整语义投影相等。

因此，本阶段证明 contracts 物理迁移没有改变该真实 Actor 的生成语义；它不证明后续 parser、
generation、application package 已迁移，也不构成 Foundry runtime 或生产验收。

Stage 3B1 再次生成同一 Slithering Bloodfin v14/core Actor；verifier 0 warnings，且排除重新生成的
Effect `_id` 和时间戳后与 Stage 3A 完整语义相等。专项 parser/acceptance 测试 86/86 通过。
这一证据只接受 parser kernel 迁移；高层 parser 仍待后续独立迁移和验收。

Stage 3B2 重新生成 Warlock of the Rat God v14/core Actor；verifier 0 warnings，manifest 保留
1 group / 10 refs / 原 source SHA-256，状态仍为 `pending`，且没有 embedded Spell 或 Cast Activity。
排除运行时生成身份后与 Stage 2 产物完整语义相等；这仍不构成 target-world hydration 验收。

Stage 3B3a 再次生成 Slithering Bloodfin v14/core Actor；verifier 0 warnings，人工核对核心身份、数值、
感官与 9 个来源 Item。排除 `_id` 和时间戳后与 parser-kernel 检查点完整语义相等；该证据只接受
models 所有权迁移，高层 parser 尚待独立迁移。

Stage 3B3b 分别通过项目 CLI 重生成中文 YAML 的 Slithering Bloodfin 与英文 bestiary 的
White Tusk Shaman v14/core Actor；两个 verifier 均为 0 warnings，人工核对核心数值、感官和
9/6 个来源 Item。排除运行时身份后均与各自基线完整语义相等；该证据不覆盖 item parser。

Stage 3B3c 通过项目 CLI 从 `input/items/骑士之盾.md` 重生成 v14/core Item。人工核对名称、类型、
稀有度、同调、AC、Forceful Bash、Protective Field 与 prone effect；新旧唯一原始差异是 Effect
`origin` 内嵌随机 Item `_id`，排除随机身份及派生 origin 后与 Stage 2 完整语义相等。
