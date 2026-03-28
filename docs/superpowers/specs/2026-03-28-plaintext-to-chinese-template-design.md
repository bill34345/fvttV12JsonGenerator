# PlainText → Chinese Template Workflow Design

**Date**: 2026-03-28
**Status**: Approved
**Version**: 1.0

## 1. Overview

**Goal**: Optimize `PlainTextIngestionWorkflow` to convert bilingual plain-text creature format into fully structured Chinese template format, ready for downstream Chinese template parser → FVTT JSON generation.

**Scope**: 
- Input: Bilingual plain-text creature markdown (MCDM/Foundry style)
- Output: Structured Chinese template markdown with YAML frontmatter
- AI normalization: Direct output to Chinese template format (not English intermediate)
- Audit: Auto-generate detailed audit reports

---

## 2. Design Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | AI Normalization | Direct output to Chinese template format |
| 2 | Structuring Granularity | Complete (all fields including consumption, target.affects, etc.) |
| 3 | Special Conditions | Split fields: `充能`, `每日`, `传奇消耗` |
| 4 | Middle Folder | `middle/` for human review |
| 5 | Audit | Auto-trigger, detailed report |
| 6 | Audit Report Location | `audits/YYYY-MM-DD-<slug>.md` |
| 7 | CLI Output | Verbose (detailed per-item results) |
| 8 | Auto-fix | Report only, no auto-fix |

---

## 3. Chinese Template Action Format

### 3.1 Full Format Specification

```yaml
动作:
  - 名称: <string>
    类型: attack|save|utility  # action type
    攻击类型: mwak|rwak|msak|rsak  # only for attack type
    命中: <string>                # e.g., "+8"
    范围: <string>                # e.g., "触及10尺", "射程30/120尺"
    伤害:
      - 公式: <string>           # e.g., "2d8+5"
        类型: 钝击|穿刺|挥砍|...   # damage type
    目标:
      数量: <string>              # e.g., "1"
      类型: creature|object|space
      特殊: <string>             # target.affects.special
    充能:
      最小: <number>            # e.g., 5
      最大: <number>            # e.g., 6
    每日: <number>              # 0 = no daily limit
    需专注: <boolean>
    传奇消耗: <number>         # 0 = no legendary action cost
    描述: <string>              # fallback for unstructured content

附赠动作:
  - <same structure as 动作>

反应:
  - <same structure as 动作>

传奇动作:
  - <same structure as 动作>
    激活类型: legendary|action|bonus|reaction|minute|hour|day
```

### 3.2 Field Mapping to FVTT JSON

| Chinese Template Field | FVTT JSON Path |
|----------------------|----------------|
| `类型: attack` | `activities[id].type = 'attack'` |
| `攻击类型: mwak` | `activities[id].attack.type.value = 'mwak'` |
| `命中: +8` | `activities[id].attack.bonus = '+8'` |
| `范围: 触及10尺` | `activities[id].range.reach = 10` |
| `伤害[].公式` | `activities[id].damage.parts[n].number/denomination/bonus` |
| `伤害[].类型` | `activities[id].damage.parts[n].types[n]` |
| `目标.数量/类型/特殊` | `activities[id].target.affects.count/type/special` |
| `充能.最小/最大` | `activities[id].uses.recovery[0].formula = '5'` |
| `每日: N` | `activities[id].uses.recovery[0].period = 'day'` |
| `需专注: true` | `activities[id].duration.concentration = true` |
| `传奇消耗: N` | `activities[id].activation.type = 'legendary', .value = N` |

### 3.3 Uses & Recovery Structure

**Recharge (充能 5-6)**:
```javascript
{
  uses: {
    spent: 0,
    max: "1",
    recovery: [{ period: "recharge", type: "recoverAll", formula: "5" }]
  }
}
```

**Daily (1/日)**:
```javascript
{
  uses: {
    spent: 0,
    max: "1", 
    recovery: [{ period: "day", type: "recoverAll" }]
  }
}
```

**Legendary Action Cost (消耗 2 动作)**:
```javascript
{
  activation: {
    type: "legendary",
    value: 2,
    condition: ""
  }
}
```

---

## 4. Multiattack Handling

Each sub-attack becomes an independent action entry:

```yaml
动作:
  - 名称: 多重攻击
    类型: utility
    描述: "该虚寂者进行一次钩握螯和一次粉碎螯攻击"

  - 名称: 钩握螯
    类型: attack
    攻击类型: mwak
    命中: +8
    范围: 触及10尺
    伤害:
      - 公式: 2d8+5
        类型: 钝击
    目标:
      数量: 1
      类型: creature
```

---

## 5. Special Condition Handling

| Condition Type | Handling |
|---------------|----------|
| 需专注 / Concentration | Write to `描述` (future: structured field) |
| 仅限濒血时 / Bloodied Only | Write to `描述` (future: separate activity) |
| 仅限被魅惑的目标 | Write to `目标.特殊` |
| 1/日 / Daily | Use `每日: N` field |
| 充能 X-Y / Recharge | Use `充能: {最小: X, 最大: Y}` field |
| 消耗 N 动作 / Cost N | Use `传奇消耗: N` field |

---

## 6. Component Architecture

```
src/
├── core/
│   ├── ingest/
│   │   ├── plaintext.ts                    # PlainTextIngestionWorkflow
│   │   └── plaintextAudit.ts               # NEW: PlainTextAuditWorkflow
│   └── workflow/
│       └── plainTextActor.ts               # PlainTextActorWorkflow (unchanged)
```

### 6.1 PlainTextAuditWorkflow

```typescript
interface PlainTextAuditWorkflowResult {
  sourcePath: string;
  emitDir: string;
  reportPath: string;
  creatureCount: number;
  issues: AuditIssue[];
}

interface AuditIssue {
  creature: string;
  severity: 'error' | 'warning' | 'info';
  field: string;
  originalValue: string;
  expectedValue: string;
  reason: string;
}
```

---

## 7. Audit Report Format

```markdown
# PlainText → Chinese Template Audit Report

**Date**: 2026-03-28
**Source**: 开发用数据.md
**Creatures**: 10

---

## Summary

| Severity | Count |
|----------|-------|
| Error | 5 |
| Warning | 12 |
| Info | 3 |

---

## Issues

### 🔴 Error: 蛇口蛮蟹 - 动作格式

**Field**: 动作[0]
**Original Value**: 
```
**钩握螯 (Seizing Claw)**：近战武器攻击 (Melee Weapon Attack)：命中 +8，触及 (Reach) 10 尺，单一目标 (one target)。
```
**Expected Value**:
```yaml
- 名称: 钩握螯
  类型: attack
  攻击类型: mwak
  命中: "+8"
  范围: 触及10尺
```
**Reason**: 动作格式不兼容。中文模板解析器期望 `[近战武器攻击]` 格式，但输入使用 `(Melee Weapon Attack)` 全角括号。

---

## Recommendations

1. 修改 AI normalization prompt 直接输出目标格式
2. 增强规则解析支持双语混合格式
```

---

## 8. File Naming

### 8.1 Middle Folder Output

Location: `obsidian/dnd数据转fvttjson/middle/`

Naming: `{slug}__{chinese-name}.md`

Examples:
- `scuttling-serpentmaw__蛇口蛮蟹.md`
- `ruidium-corrupted-chuul-nullifier__月蚀腐化虚寂者.md`

### 8.2 Audit Report

Location: `audits/`

Naming: `YYYY-MM-DD-{source-slug}-audit.md`

Example:
- `2026-03-28-kai-fa-yong-shu-ju-audit.md`

---

## 9. AI Normalization Prompt

```json
{
  "role": "system",
  "content": `You are a D&D 5e monster statblock normalizer. Convert bilingual creature text to structured Chinese template format.

OUTPUT FORMAT: Strict YAML with the following structure:
```yaml
名称: <bilingual name>
类型: npc
体型: <size in Chinese>
生物类型: <creature type in Chinese>
阵营: <alignment in Chinese>
能力:
  力量: <number>
  敏捷: <number>
  体质: <number>
  智力: <number>
  感知: <number>
  魅力: <number>
护甲等级: <value>
生命值: <value>
速度: <value>
感官: <object or string>
挑战等级: <number>
动作:
  - 名称: <string>
    类型: attack|save|utility
    攻击类型: mwak|rwak|msak|rsak  # only if 类型 is attack
    命中: <string>  # e.g., "+8"
    范围: <string>  # e.g., "触及10尺" or "射程30/120尺"
    伤害:
      - 公式: <string>  # e.g., "2d8+5"
        类型: 钝击|穿刺|挥砍|毒素|火焰|寒冷|闪电|雷鸣|光耀|暗蚀|力场|心灵|强酸|死灵
    目标:
      数量: <string>
      类型: creature|object|space
      特殊: <string>  # target.affects.special, can be empty
    充能:
      最小: <number>
      最大: <number>
    每日: <number>  # 0 if no daily limit
    需专注: <boolean>
    传奇消耗: <number>  # 0 if no legendary action cost
    描述: <string>  # fallback for unstructured content
```

RULES:
- 把动作格式从 \`**\*\**：近战武器攻击 (Melee Weapon Attack)：** 转换为 \`**\*\** [近战武器攻击]**：
- 把 \`**命中 (Hit)**：\` 转换为动作条目中的独立字段
- 把充能格式 \`**充能 5-6 / Recharge 5-6**\` 转换为 \`充能: {最小: 5, 最大: 6}\`
- 把每日格式 \`**1/日 / 1/day**\` 转换为 \`每日: 1\`
- 把传奇消耗格式 \`**消耗 2 动作**\` 转换为 \`传奇消耗: 2\`
- 把 "仅限被魅惑的目标" 写入 \`目标.特殊\`
- 伤害类型映射：Bludgeoning→钝击, Piercing→穿刺, Slashing→挥砍, Poison→毒素, Fire→火焰, Cold→寒冷, Lightning→闪电, Thunder→雷鸣, Radiant→光耀, Necrotic→暗蚀, Force→力场, Psychic→心灵, Acid→强酸

Return ONLY the YAML. No explanations.`
}
```

---

## 10. Backward Compatibility

- Existing `PlainTextIngestionWorkflow` behavior unchanged for non-AI path
- New AI normalization only affects `--enable-ai-normalize` flow
- Audit is auto-triggered regardless of AI normalization setting

---

## 11. Out of Scope

- Auto-fix based on audit (Phase 2)
- Chinese template parsing optimization (separate project)
- Visual companion for this design

---

## 12. Test Fixtures

Test files to validate:
- `obsidian/dnd数据转fvttjson/input/开发用数据.md` (10 creatures)
- `obsidian/dnd数据转fvttjson/input/三个Chuul（不准删除这个md）.md` (3 creatures)

Expected outcomes after implementation:
- 13 markdown files in `middle/`
- 1 audit report in `audits/`
- All actions in structured format
