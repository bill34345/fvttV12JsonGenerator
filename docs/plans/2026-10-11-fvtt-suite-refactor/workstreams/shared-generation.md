# 共享生成核心与便携契约

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)。本工作流支撑多个模块，不单独包装成一个要求用户安装的“大核心 mod”。

## 当前归属与目标

`packages/contracts`、models、parser、generation、workflows、intake-ai、forge-browser-runtime、forge-gateway-protocol、spell-manifest-contracts 等已有公共包。`packages/generation/src/actor.ts` 与parser的大文件是职责核对线索，行数不证明必须重写。Node/Python/抓取/图片资产适配不因为有package就可进入Foundry浏览器。

目标是正式来源链由CLI、Web、Forge复用，生成规则只有一个owner，目标版本投影与语义校验可以独立验证。Resolver消费便携法术契约，不依赖Forge模块启用。

## 切片

1. **K1 真实调用与owner图**：固定CLI/Web/Forge、Species/BloodHunter和Resolver实际消费入口；识别 `src/` 兼容路径与真实共享 `src/core/spell-resolution` 归属，不在兼容层新增实现。
2. **K2 一个投影家族**：选择Actor基础/资源/活动或Item一个实际混合职责，把来源模型、纯投影、验证和IO分开；保留公开入口，先以现有来源Characterization证明结构和值不漂移。
3. **K3 目标版本适配**：5.3.3固定，6.x projector单独核源和语义；browser-safe契约不导入Node或具体应用。只在有两个真实不同Adapter时抽象，避免通用版本DSL。
4. **K4 默认值与旧兼容**：列清省略版本的CLI/workflow调用方，独立实施V14默认及提示迁移；通过后再提出精确V12退役清单。此切片不删除旧实现或手工修改最终JSON。

## 接口与身份

保留来源→CLI/Web/Forge入口→workflow→parser/generation→verifier；accepted/needs_review/failed 和 source/hash/decision 追溯继续严格。便携spellManifest在目标世界解析，不能把目的世界UUID提前固定到Actor来源。已有package导出、sourceId/Document ID和语义状态ID不随目录调整变化。

## 验证与受影响消费者

- parser缺陷保留真实fixture；结构改动使用 `assertEqualStructure()` 或更严格比较，值级规则和来源语义分别核对。
- 共享接口改动只补实际消费者：至少正式生成一份受影响Actor/Item，并按对应CLI/Web/Forge边界验证；Species/BloodHunter/Resolver按依赖影响选择。
- 执行局部anti-overfit，最终JSON仍正式重新生成；旧语义PASS只有相关绑定未变时复用。

已有入口：`bun run test:structured-action-targets`、`bun run test:forge-blueprint`、`bun run typecheck:packages`、`bun run smoke:actor:offline`、`bun run architecture:verify`。来源检查使用 `bun run verify:actor <真实来源.md> <本轮正式输出.json>`；不要把示例占位符直接执行。全CI在实际整合边界运行，本轮规划未执行。

下一步：K1；先与Forge当前工作准确接续，再选择真实投影家族，不以拆文件为完成标准。

K1当前基线调用及K4省略版本清单已核，见[source-boundary-audit](source-boundary-audit.md)。Forge正在工作的实际成果尚未交接，因此K2–K4不在旧树上抢先改动。
