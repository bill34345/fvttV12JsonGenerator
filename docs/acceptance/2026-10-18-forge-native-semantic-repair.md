# 原生替换伤害、两用武器和虫群身份修复

日期：2026-10-18。候选：`codex/20261006-111625-bettermonsters-eye-deep-sample`，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。

**状态：代码修复和本地来源链验证通过；未安装，Foundry 实机验收未完成。** 本文不能作为已发布或任意自然语言均支持的证明。

## 1. 问题的原因是什么

1. 分步入口的快速解析只识别前一组伤害，并把它视为无条件 base。后续正确提案把普通／替换伤害分别保留为带条件操作，却被要求继续等于旧 base 关系，误报“漏伤害”。现在仍核对每个明确数字和伤害类型，但关系以完整子句的独立证明为准。
2. 以前的通用输出是一个 Attack 加两个独立 Damage。用户确认应优先使用原生交互后，现在从已经验证的来源操作派生互斥 Attack 选择；明确单双手替换则使用原生 Weapon/Versatile。源 IR 保留完整操作、原文、证据和关系，不依靠动作名字猜数值。
3. 旧模型没有独立虫群个体体型；头部检查只认识普通体型＋类型，renderer/parser/generator/verifier 也缺少原生 `type.swarm` 通道。现在整体体型、个体体型和生物类型分别贯通。

## 2. 证据是什么

### 来源与外部反证

复用[精确原生功能核对](../reviews/2026-10-18-forge-native-versatile-and-swarm.md)，并独立扩大到[48 项规则与边界目标](../reviews/2026-10-18-forge-native-semantic-holdouts.md)。依据为 SRD 5.1／2014 原文、dnd5e 5.3.3 固定提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449` 的代码与官方包，以及历史原始报告。2024 包只作结构或不同版本反例；输入数字始终来自本次来源。

本轮独立检查确实找到并修掉额外风险，而非只认可最初方案：

- 条件附伤被错误合并成两个模式共同的必定伤害。现在检查每个伤害 atom 自己的完整限定，独立句和前置/后置重击条件也不能绕过；不确定时保留 GM 操作，多 part 无法安全拆分时取消整个合并。
- 中文两行具有相同整体体型／类型、不同个体体型时，旧去重隐藏了冲突。现在保留独立声明，正确报告 `SOURCE_CONFLICTING_STATIC_FACT`。
- 普通 Actor 凭空带入虫群字段原先未被最终 verifier 发现，已补显式无来源拒绝。
- 同句里两个合法数字被放入错误的普通／替换关系，不能只凭“数字都在原文里”接受。明确 `Hit: A, or B if ...` 的默认分支与替换分支现在分别核对；“条件分支在前、otherwise 在后”仍有正确对照。
- 旧 YAML `size: Medium construct` 与引号变体发生过回归，已恢复，不降低原断言；普通生物缺阵营仍按原契约拒绝。新缺失补值只允许唯一明确的虫群头部事实。

### 扩大的实际测试

- 新增 `tests/fixtures/forge-native-attack-cases.json`：**56 个案例，28 类结构交替使用两个基础生物**，含条件主体、换骰面、换伤害类型、独立句、固定命中、多骰、负加值、近战/投掷、共享无条件附伤、独立 Save、Recharge 和第三分支反例。这些是明确来源的合成变体，不是56只未经修改的真实怪物。
- 上一轮24项研究案例全部重放：正确结果从44/48提高为 **48/48**。半血和双手误拦、虫群头部拒绝均已解除。
- 新56项与旧24项共 **80 个来源案例 × 两入口 = 160 条正式离线链** 全部 accepted，产物完整保存在 `.local/forge-native-semantic-repair-20261018/closed-matrix/`。这不测真实模型的首次输出概率。
- 另有虫群37项及后续冲突／YAML样例、条件附伤22项、数字互换及原生导入读回 mutation；测试数与来源数分开，重叠组不相加。
- 对其余21个旧语义案例的两个入口，直接对比已保存的完整 Actor system/items/effects/token/name，共42项；唯一结构差异是普通生物现在显式保留原生空 `type.swarm: ""`，此前为缺失。数值、操作、效果与token结构均无其他变化。严格字节/结构相等的首份0/42记录和逐字段解释均保留，没有把差异隐藏或重跑旧生成制造一致。

正式路径始终是固定假 provider／分步提案 → 同来源 IR → validator → renderer → public workflow/parser/generation → verifier。没有手修最终 JSON。负例包含错误命中、删条件、互换分支、原生伤害相加、删改 Versatile 数据、错整体/成员体型、模板残留、来源冲突和导入后丢字段；均先有可通过的正确对照。

### 最终检查记录

所有接受检查使用 **Bun 1.3.14+0d9b296af**，并让安全包装器子进程继承同一进程 PATH。终端默认1.3.8的早期结果只作开发探针，失败原件保留；没有安装/下载运行时或修改全局 PATH。

| 检查 | 实际结果／证据 |
|---|---|
| `test:forge-native-basics` | **703 pass / 0 fail**，含来源操作、两个新攻击测试文件及已有 Forge runtime/Midi 导入检查；`native-branch-closed.log` |
| `test:forge-statblock-semantics` | **225 pass / 0 fail**；`statblock-pinned-identity-repair-1.log` |
| `test:forge-staged-manual` | **264 pass / 0 fail**；`staged-pinned-identity-repair-3.log` |
| `test:parser-focused` | **135 pass / 0 fail**；`parser-pinned-final.log` |
| `test:generation` | **287 pass / 0 fail**；`generation-pinned-final.log` |
| `typecheck:all`、`typecheck:packages` | 最终结果见本批 final-receipt；没有因类型失败省略检查 |
| `audit:anti-overfit` | 105 sources checked，PASS |
| `architecture:verify` | 1420 modules，未发现依赖违规或循环；新增跨模块测试导入已核对 |
| 浏览器 bundle / forbidden-import scan | PASS；`browser-closed-receipt.json`，仅编译，不是安装或运行验收 |
| 正式 CLI | Spear、半血＋毒素 Save、虫群三条保存链分别通过 `verify:intake` 与 `verify:actor`，共6项；保留精确来源 SHA及日志 |
| 手册 | 9个受影响条目人工核对并生成根HTML；保留既有33项覆盖与所有watch，最终check PASS |

早期 `probe-integration` 仍按“一个Attack＋两个Damage”的旧期望报 mismatch，原件不改。用户确认新的表示后，持久测试独立核对两个互斥 Attack／一个原生 Weapon 的完整字段，未通过修改旧失败文件制造绿色。

### 尚未取得的证据

`mcp__foundry_mirror__get_world_info` 返回：

```text
Unable to connect to Foundry MCP backend after 40 attempts:
connect ECONNREFUSED 127.0.0.1:31414
```

调用没有成功连接世界。当前工具清单没有项目要求的官方 Chrome 操作能力，未切换到通用 CUA／私接 CDP 绕过。没有世界写入、服务启停或候选安装。**正常客户端导入、实际单/双手/投掷掷骰、两种攻击选项和虫群角色卡显示仍待实机验收。** 模拟导入/readback检查与浏览器编译不能代替它。

## 3. 解决方案是怎样的

- **互斥替换：**同一 Item 保留普通／替代两个 Attack，每项的命中、伤害、目标、距离、资源成本和完整条件都与来源绑定。GM只选一个。目标半血和自身半血不混淆，不做骰数除二或 HP 自动监视。
- **两用武器：**原生 Weapon、`ver`、Item base/versatile 两组明确公式和一个原生 Attack。标准标识可以复用；怪物多骰、固定加值和附伤不从库重算。近投模式只在来源明确时提供；投掷使用基础伤害。未知武器分类保留为空，不猜简单/军用熟练。固定来源使用原生 no-ability 模式，避免再加 STR/DEX；这一交互仍须实机确认。
- **虫群：**头部证据 → `identity.swarmSize` → MD `集群个体体型` → parser独立字段 → 原生 `details.type.swarm` → Intake/workflow/browser摘要和导入读回。整体体型仍决定token尺寸；普通模板明确清空残留。
- **Foundry 衔接：**沿用原有 core/Midi 精确版本适配与创建/复用规则，增强 readback 对整体体型和新原生武器 Item damage/properties/type 的检查；不迁移或覆盖既有 Actor。

本轮新增检查进入已有局部安全测试组，没有新全局hook或额外AI全量复审。没有提交、合并、push、安装或生产写入。旧失败、旧24/37来源fixture和此前验收记录保持原样，完整改动范围与哈希见本批 final-receipt。
