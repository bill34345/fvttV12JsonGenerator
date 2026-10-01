# ServerNext 食人魔来源逐项核对（2026-09-25）

## 结论与边界

**来源语义人工核对与正式审查均通过，新目标包已构建、验证；ServerNext 游戏内验收未执行。**本次核对现有 `input/species/ogre.md` 与项目正式流程生成的 Foundry `14.368` / dnd5e `6.0.2` / Core / 2024 文件。没有手写或修补正式 JSON、改动世界数据。旧版 `14.364` / dnd5e `5.3.3` 的接受记录没有跨目标复用。

| 证据 | 值 |
|---|---|
| 来源 Markdown | `obsidian/dnd数据转fvttjson/input/species/ogre.md` |
| Markdown SHA-256 | `7243c8e4470efa2830d40c1e0e29b64155f6e8f7066d0121c387891f9871dfb7` |
| 保留的原始资料 SHA-256 | `6b2374257353ee7d013d826c31ef57b9aca6c5a15677356a228ed12b1bd76d94` |
| 新目标正式文件 logical hash | `ce06c1c503b2c0e69416414449467655e0299a9c27ccecbfbe9a85e67d7aad41` |
| 新目标正式接受记录 | `accepted-ledger.json` schema 2，run `species-20260925132446-5bf870e5`，目标 `14.368/core/2024` |
| 保留的旧版接受记录 | run `species-20260813002011-221e40df`，目标 `14/core/2024` |
| 新目标模块 ZIP SHA-256 | `967f3326d056c2dce1d538be207dee253c2e4e5b3b27980427e300c072849291` |

## 原文与新目标投影

| 原文要求 | 新目标正式文件 | 本次判断 |
|---|---|---|
| 食人魔；巨人；大型，约 10–12 尺；步行 40 尺；黑暗视觉 60 尺 | `race` 名称“食人魔（Ogre）”，`type=giant`、`subtype=Ogre`，等级 0 的 `Size=lg`，`movement.speeds.walk=40`，`senses.ranges.darkvision=60` | 对应。原始资料拼写 `Orge` 的既有规范名为 Ogre，沿用旧接受稿；没有新创作。 |
| 巨武器的四条规则：加大伤害骰、投掷拆骰与 20/60 尺、力量豁免及推 5 尺、攻击物件或建筑物双倍伤害 | 等级 0 的“巨武器使用”完整描述；`gm-assisted`，没有 Activity、Effect 或武器数据写入 | 对应。骰子换算、目标体型、豁免和推离均由主持人按原文判断；没有把原文“已记在武器内”解释成额外自动推击。 |
| 身强力壮：解除受擒的属性检定优势 | 等级 0 的描述性特性，没有 Activity 或 Effect | 对应。没有扩大为所有属性检定优势，也没有自动解除受擒。 |
| 5 级起，若脱困检定原本耗动作，可改为附赠动作；2 次，长休恢复 | 等级 5 的单独特性，`utility` 为附赠动作、每次消耗 1 个本特性次数、最多 2 次、长休全部恢复；聊天说明手动完成原本的属性检定并保留优势 | 对应。没有预设力量、敏捷或技能；没有自动解除状态。 |
| 生命值上限初始 +3，此后每升一级再 +3 | 等级 0 的“食人魔刚毅”转移性 Effect：`system.attributes.hp.bonuses.level` 加 3 | 对应目标系统的每级生命值加值模型；实际角色生命值仍需游戏内核。 |
| AC −2；倒地后花费全部速度站起来 | 等级 0 的“食人魔笨拙”：转移性 Effect 在 `system.attributes.ac.bonus` 加 −2；站起移动为 `gm-assisted` 描述 | 对应。没有自动处理倒地或移动。实际 AC 仍需游戏内核。 |

生成文件含 **1 个种族、5 个特性**。种族的等级 0 赠予指向 4 个特性，等级 5 赠予指向第 5 个，全部使用本模块 `features` 图鉴的稳定 Item ID；每个特性只赠予一次。唯一 Activity 属于“附赠动作脱困”；只有生命值与护甲两项有 Effect；主持人判断的两处行为没有伪造自动效果。来源没有声明属性增长、语言、触及、负重、抗性、额外武器熟练或大型生物附加收益，正式文件也没有添加。

新目标形状使用 dnd5e 6 的 `movement.speeds.*`、`senses.ranges.*`、升级记录 `name`、Activity `effects` 与 Effect `system.changes`。两条加值变化使用稳定 ID、`type=add`、`phase=initial`；没有使用旧版 Effect 字段。正式文件校验 `ok=true`、`findings=[]`。

## 实际执行

- `bun run test:homebrew-species`：**41 通过、0 失败**。含目标投影、错误字段拒绝、正式账本隔离、两次确定性候选构建与校验的测试。
- `bun run src/index.ts --intake-species obsidian/dnd数据转fvttjson/input/species/ogre.md --vault obsidian/dnd数据转fvttjson --fvtt-version 14.368 --effect-profile core --dry-run`：**通过**，识别 1 个种族，预计 1 次审查调用；未调用外部提供方，未创建运行记录或正式文件。
- 即时调用项目 `compileSpeciesMarkdown(..., {fvttVersion: '14.368'})` 和 `validateNativeSpeciesPackage(...)`：**通过**；逐项人工核对上表。正式审查后又确认生成文件与同 Markdown 重新投影完全一致，旧版与新版种族、特性 ID 完全一致。

## 正式审查、构建与剩余门禁

用户明确授权对这一份来源、这一目标进行正式外部审查。首次命令运行 ID `species-20260925132011-0941545b`，状态 **failed**。CLI 显示 `SPECIES_PROCESSING_FAILED: AI Species Intake network request failed.`；审查阶段计数为 1，内部传输自动尝试 2 次，两次均记录 `network` 错误。该运行没有模型回答，也没有 `ai-review.json`，没有推广正式文件。

只读故障核查发现本机 `127.0.0.1:8787` 兼容桥没有运行。桥恢复后，父任务确认健康检查成功、模型可见，才重新运行相同命令。新运行 `species-20260925132446-5bf870e5` 状态 **succeeded**，实际模型审查 `accepted`、问题 0、确定性报告 `accepted`、问题 0；审查第 1 次网络调用成功，没有修复调用。来源哈希与人工预览一致。

```powershell
bun run src/index.ts --intake-species obsidian/dnd数据转fvttjson/input/species/ogre.md --vault obsidian/dnd数据转fvttjson --fvtt-version 14.368 --effect-profile core
```

正式流程自动生成 `input/species/v14-368/ogre.md`、`output/species/v14-368/ogre.json` 和 schema-v2 `accepted-ledger.json` 的独立 `14.368/core/2024` 条目，同时保留旧 `14/core/2024` 条目。新 Markdown 与已接受旧 Markdown 字节相同；正式 JSON 与重新投影完全一致；账本、JSON、审查报告的来源和 logical hash 一致。

从仓库根目录执行 `bun run build:homebrew-species --fvtt-version 14.368` 与 `bun run verify:homebrew-species --fvtt-version 14.368` 均通过。生成 `dist/v14-368-candidate/module` 和 ZIP：1 个种族、5 个特性、6 个稳定 UUID，模块 aggregate logical hash `56259032a319d4fe062d29a3dfa4a128b8087502507b125fd993d40c9186dd8f`；ZIP SHA-256 见上。manifest 精确绑定 Foundry `14.368` / dnd5e `6.0.2`，identity 保留 `static-candidate`。模块目录内的 `bun run build:v14-368-candidate` 因相对 vault 路径从该目录解析而失败；根目录包装入口成功，没有修改构建实现或正式文件绕过流程。

**此处是9月25日安装前的待验计划，结果已于9月26日补在下文。**先在确认目标服务和世界可安全停启后单独安装候选，再检查原生添加种族、等级 0/5 特性、生命值和护甲实际计算、次数消费与长休恢复、重开读回；只测迁移受影响的行为并清理临时角色。构建验证不能代替这些游戏内结果。现有 Mirror 安装器拒绝 `static-candidate`，不可用它安装 ServerNext 候选。

## 9月26日 ServerNext 游戏内结果

专用测试人物`CodexTemp-Species-20260925-2148`先前正常加入食人魔，人物显示大型、40尺步行、60尺黑暗视觉、四项0级特性、AC8；升到1级后生命值15/15，整页重载仍一致。独立Full Access浏览器任务本轮只在这名测试人物上走D&D原生角色卡升级，从野蛮人1升到5级；三级狂战士分支、Intimidation熟练、四级属性提升、Warhammer掌握及固定生命值均是测试构筑选择，不代表玩家人物决定。曾误开未完成的6级向导，按界面放弃且未提交6级。

达到5级后第五项“身强力壮：附赠动作脱困”自动出现；原2/2次，使用一次后1/2，正常长休后恢复2/2，整页重载仍显示2/2。人物最后为野蛮人5级、力量12、生命值55，保留供复查；未动其他人物。使用时游戏提示没有场景Token，检定结果可能不准，所以本轮只将**特性授予、次数消耗、长休恢复和保存读回**判为PASS；实际脱困的属性选择/优势和状态解除没有验，也不是此特性所承诺的自动行为。任务结束时原服务/世界/目标版本仍正常且0人在线；之后原服务进程意外消失，主任务在23世界锁释放后按原参数恢复服务，详情见[最新迁移交接报告](../../../docs/plan/server-next-migration-handoff-20260927.md)。
