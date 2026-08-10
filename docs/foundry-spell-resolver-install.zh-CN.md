# Foundry 目标世界法术解析器安装与使用

本模块把项目生成的便携施法者 Actor，在目标 Foundry 世界中水合为真正的 dnd5e Cast Activity 和缓存 Spell。它不会把官方法术正文或本地 Compendium UUID 复制到项目清单中。

## 支持边界

- Foundry VTT：仅 `14.364`
- dnd5e：仅 `5.3.3`
- 解析对象：带有效 `fvtt-json-generator-spell-resolver.spellManifest` 的 Actor
- 来源：当前世界全部已启用、GM 可读取的 Item Compendium
- 规则：精确 2024 优先；只有没有同键 2024 候选项时才允许唯一 2014 回退
- 不支持：Foundry v12 解析器、OCR/PDF Intake、生产世界自动安装、全世界批量迁移

源码、模块清单、构建器和本地安装生命周期的唯一维护位置是 `foundry-modules/monster-spell-resolver/`；旧 `src/foundry/monster-spell-resolver/` 和旧专用脚本已经退役。构建产物位于该模块自己的 `dist/`，F 盘只保存安装后的本地测试副本，不是源码。

项目清单只保存来源可证明的法术身份、用法和限制，不保存目标世界 UUID 或官方规则正文。最终 Spell 内容来自目标世界已经合法安装并启用的内容包。

## 项目维护者：构建和本地安装

在仓库根目录运行：

```powershell
bun run foundry:lab spell-resolver build
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
```

`build` 生成确定性模块目录和 ZIP；`install --apply` 只允许写入项目本地 `server-mirror` 的精确模块目录，并为原安装保留可恢复备份；`verify-install` 只证明安装字节与当前构建一致，不证明模块已经运行。

为隔离验收世界启用模块：

```powershell
bun run foundry:lab spell-resolver prepare-world --world=fvtt-v14-module-matrix --apply
bun run foundry:lab launch server-mirror
```

不要把这组命令改指向生产数据目录。生产内容包 inventory/acquire 等只读操作可按 Foundry Ops 的目标核对、`--apply`、`--allow-production-read` 和外部配置门禁自主执行；生产安装、世界迁移、Actor hydration 或其他写入必须再次取得明确授权并独立验收。

## 普通 GM 使用流程

1. 通过项目 CLI 或 AI Intake 生成 Foundry v14/core Actor JSON。
2. 确认生成 Actor 的解析状态为 `pending`，没有嵌入 Spell、resolver 管理的 Cast Activity 或目标 Compendium UUID。
3. 在目标世界启用本模块及需要参与解析的内容包。
4. 使用 Foundry 原生 Actor JSON 导入功能导入 Actor。
5. 打开 Actor。正常情况下模块会预检完整清单，并在全部法术可确定后一次性水合。
6. 使用 Actor 标题栏的 GM 控件查看状态、解析报告、来源或重新解析。
7. 状态变为“已水合”后，实际使用攻击、豁免和效用法术，并检查有限次数和无限次数行为。

水合是 Actor 级全有或全无事务。任何一个法术缺失、歧义、事实冲突、来源索引阻断或人工冲突未决定时，都不会写入部分法术。

## 来源索引和优先级

模块不使用固定的官方包白名单。它读取所有已启用、当前 GM 可读且文档类型为 Item 的 Compendium，再根据实际索引行的 `type: spell` 建立候选集。包名、出版商或 `options` 提示只用于展示，不作为信任条件。

匹配顺序：

1. 精确规范化 identifier、英文名或来源明确提供的 alias；
2. 检查来源提供的 level、school、source book 等事实，不允许冲突候选项通过；
3. 在事实一致的候选项中优先 2024；
4. 只有完全不存在同键 2024 候选项时，才考虑唯一 2014 候选项；
5. 剩余歧义、近似匹配或元数据缺失必须人工检查。

可在“游戏设置 → 模组设置 → 目标世界法术解析器”中查看已索引包、合集、规则世代计数和诊断。内容包启用状态或版本变化后，先点击“重建来源索引”，再重新解析 Actor。

## 人工修改与检查

重新解析发现 resolver 管理内容被人工修改时，必须明确选择：

- **保留人工修改**：仅在当前管理结构仍完整有效时保留，并把该引用标为受保护；
- **用生成内容覆盖**：用当前确定性计划恢复 resolver 内容；
- **取消**：不修改 Actor；
- 关闭对话框或按 Esc：与取消完全相同。

如果当前 Activity/缓存 Spell 配对已经破损，不能用“保留”掩盖结构错误。查看报告并修复或选择覆盖。

## 状态和诊断

- `pending`：便携清单存在，尚未成功水合；
- `resolving`：当前客户端正在处理；
- `needs_review`：存在缺失、歧义、冲突或人工决定；
- `hydrated`：全部配对写入并通过写后校验；
- `stale`：来源包、候选元数据或配置已变化；
- `incompatible`：Foundry/dnd5e 版本不匹配；
- `failed`：事务失败但已完成补偿；
- `failed-recovery-required`：补偿也未完全恢复，必须按残差报告人工恢复。

Actor 标题栏提供“查看解析报告”“查看来源”“撤销上次水合”和“导出诊断报告”。诊断报告会保留哈希、文档残差路径和恢复信息，但不会导出本机文件路径或完整付费法术正文。

## 更新与卸载

更新前停止本地世界，然后重新构建、安装并验证：

```powershell
bun run foundry:lab spell-resolver build
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
```

卸载本地镜像模块：

```powershell
bun run foundry:lab spell-resolver uninstall --apply
```

已水合 Actor 的缓存 Spell 是普通嵌入 dnd5e Spell。禁用或卸载 resolver 不应删除它们；但必须在目标世界实际打开并施放代表性 Spell 后，才能把“禁用后仍可使用”记录为通过。

## 三层验收

1. **便携 Actor 层**：检查来源证据、`pending`、无占位法术和无目标 UUID。
2. **目标世界报告层**：检查来源索引、2024/2014 决策、Activity/缓存 Spell 配对、原子写入和非干扰。
3. **原生使用层**：实际施放攻击、豁免和效用法术，检查 DC/命中、次数、目标、组件和禁用模块后的可用性。

三层不能相互替代。详细清单见 [`generated-actor-verification.md`](generated-actor-verification.md)。
