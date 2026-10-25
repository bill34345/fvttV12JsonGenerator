# Spell Resolver：便携清单水合与所有权

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。R1静态边界已核；R2最终提交读回与精确恢复已修复，完整模块349项/1656断言通过。候选未安装，真实水合/恢复/施法仍待验。

## 目标与当前事实

把清单验证、候选解析、Actor 范围事务、所有权和补偿读回的 Interface 固定，保持原生 Cast 可用性。

- owner：[foundry-modules/monster-spell-resolver/](../../../../foundry-modules/monster-spell-resolver/)。
- 稳定 runtime ID：`fvtt-json-generator-spell-resolver`；默认阶段：P4，便携法术契约核对后；可独立于 Forge 安装。
- 当前0.1.7；目录名/手册ID为monster-spell-resolver，真实module ID不同。无模块依赖，使用 spell-manifest contracts 与 `src/core/spell-resolution` 共享逻辑。14.364/5.3.3有有界施法接受；Next6.0.5仅十法术水合、普通Undo/重载等切片。
- 关键归属：`src/transaction.ts`、`src/hydrator.ts`、`src/ownership.ts`；共享 `packages/spell-manifest-contracts/`、`src/core/spell-resolution/`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### R1 契约与候选选择

明确 portable manifest、pending/resolved 状态和本世界可读包匹配，不把目的世界 UUID 写入来源生成器。

### R2 水合事务与补偿

隔离 Actor 范围的计划/预检/应用/读回/补偿；保护非自有 Spell/Activity，重复输入复用，不做按名字盲合并。

### R3 原生施法与独立帮助

受影响的 attack/save/utility/次数/Cast 走正式系统链，模块停用后已有原生数据仍可使用；正确映射统一帮助 runtime ID。

## 必须保护

Actor spellManifest/resolution flags、feature/group/ref 身份、owned Activity ID、compendiumSource、dnd5e cachedFor 和原生 Cast 绑定。

## 本模块最小真实接受

- pending来源在合法可读目标包中一对一水合；模糊/缺失/外来候选明确保留待处理。
- 重复调用、Keep/Overwrite/Cancel 或Undo按本轮受影响范围验证；失败后只处理本次自有结果。
- 目标世界施法与模块停用后施法分别读回；5.3.3证据不能直接覆盖Next完整Cast矩阵。

## 已有检查入口与下一步

- `bun run test:spell-resolver`
- `bun run build:spell-resolver`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

R1/R2结果、精确来源、原反例与独立审阅见[提交核对记录](../../../reviews/2026-10-12-resolver-commit-readback.md)。无生成器输出、持久schema/ID或目标版本变化；源文档读回与实际持久化接受分层记录。

下一源码切片为R3帮助：正文归owner，统一手册定位使用monster-spell-resolver条目ID，保留现有runtime ID。现有GM设置窗口增加type=button帮助，合集active/ABI1不可用时打开同源只读窗口。局部检查关注GM权限重核、错误Suite零调用、正确条目、独立/重复/最小化重开，以及帮助不提交宿主设置表单、不重建来源索引或水合。R2有效事务证据复用，只跑新入口/构建/类型与手册一致性；原生Cast/停用后缓存出口在浏览器安全窗口可用后接续。未达到真实出口前不进入发行清单。
