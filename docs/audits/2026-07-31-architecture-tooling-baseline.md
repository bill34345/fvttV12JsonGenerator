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
