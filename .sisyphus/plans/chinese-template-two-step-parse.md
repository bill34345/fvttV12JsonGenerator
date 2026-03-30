# 中文模板 → FVTT JSON 两步解析实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 将中文 Markdown NPC 纯文本，通过两步解析（代码 + AI）转换为完整无数据丢失的 FVTT JSON。

**架构:**
- Step 1 (AI): 将动作/特性/附赠动作/反应/传奇动作的描述段发给 AI，输出结构化 YAML
- Step 2 (代码): 确定性解析结构化 YAML，与代码解析的基础属性合并，进入 ActorGenerator

**技术栈:** TypeScript, js-yaml, OpenAI-compatible API

---

## 词汇表

| 术语 | 含义 |
|------|------|
| `父活动` | 带 `子活动` 的父 activity（如触手-强击分支） |
| `子活动` | 父活动的条件分支（如 Bleeding Wound / Reeling Impact / Push） |
| `内嵌效果` | 写在同一 activity 描述内的效果，不生成独立 activity |
| `activation.type` | `action`/`bonus`/`reaction`/`legendary`/`special` |

---

## 文件结构

```
src/
  core/
    models/
      action.ts              # 修改: 扩展 StructuredActionData
    ingest/
      plaintext.ts            # 修改: normalizeBlock 分离基础属性和描述段
      plaintextAudit.ts       # 修改: 适配新流程
    parser/
      yaml.ts                # 修改: parseStructuredActions 新方法
      action.ts               # 不改: 保留给扁平文本备选
    generator/
      actor.ts               # 修改: appendStructuredActionItems
      activity.ts            # 不改: 复用

src/config/
  mapping.ts                   # 不改

tests/
  fixtures/
    中古模板-底栖魔鱼-完整解析.json    # 新增: 标准答案 fixture
    中古模板-蛇口蛮蟹-完整解析.json     # 新增
    中古模板-滑行血鳍-完整解析.json     # 新增
  core/
    parser/
      structuredAction.test.ts  # 新增: StructuredActionData 解析测试
    ingest/
      plaintext两步解析.test.ts    # 新增: 端到端测试
```

---

## AI 输出格式规范（所有字段必须填写）

### 概述

每个动作/特性/附赠动作/反应/传奇动作 都输出为一个 YAML 条目。

**判断规则（必须严格遵守）:**
- 有 `DC` → `类型: save`
- 无 `DC`、有 `伤害` → `类型: damage`（仅伤害）
- 无 `DC`、无 `伤害` → `类型: utility`

**activation.type 判断:**
- 特性（被动/触发） → 无 `activation.type` 或 `activation.type: special`
- 动作 → `activation.type: action`
- 附赠动作 → `activation.type: bonus`
- 反应 → `activation.type: reaction`
- 传奇动作 → `activation.type: legendary`

### 完整 YAML 结构

```yaml
特性:          # 或 动作 / 附赠动作 / 反应 / 传奇动作
  - 名称: <中文名> (<英文名>)
    类型: attack | save | damage | utility
    activation:
      type: action | bonus | reaction | legendary | special
      condition: <触发条件文字>   # 可选，如 "濒血时"
    描述: <原文描述>             # 保留原文，不转换

    # --- 攻击类 ---
    攻击类型: mwak | rwak | msak | rsak
    命中: <数字>
    范围: <文字>                 # "触及 10 尺" / "30/60 尺"
    伤害:
      - 公式: <骰子>            # "3d6+5"，永远用公式不用结果
        类型: 钝击 | 穿刺 | 心灵 | ...

    # --- 豁免类 ---
    DC: <数字>
    属性: 力量 | 敏捷 | 体质 | 智力 | 感知 | 魅力
    AoE:
      形状: 球形 | 锥形 | 线形 | 立方体 | 圆柱形 | 矩形
      范围: <数字>               # 尺

    # --- 目标 ---
    目标:
      数量: <数字> | all | <文字>  # "1" / "所有生物" / "所有非异怪生物"
      类型: creature | object
      特殊: <文字>              # "仅限被魅惑的目标" / "半径15尺范围内"

    # --- 资源 ---
    充能: [5, 6]               # [最小, 最大]，没有充能则省略
    每日: <数字>               # 每日使用次数
    需专注: true | false

    # --- 子活动（触发型）---
    子活动:
      - 名称: <子活动名>
        类型: attack | save | damage | utility
        触发: 命中后 | 失败 | 成功 | 低值 | 降至0 | 濒血 | special
        阈值: <数字>             # 可选，低值阈值

        # 子活动若为 save：
        DC: <数字>
        属性: 力量 | 敏捷 | ...
        AoE: ...
        目标: ...

        # 子活动若是伤害（无豁免）：
        伤害:
          - 公式: <骰子>
            类型: <伤害类型>

        # 内嵌效果（不生成独立子 activity）：
        内嵌效果:
          - 类型: 流血 | 疾病 | 减速 | ...
            描述: <原文>
            持续: <轮数> | 1分钟 | 专注

    # --- 效果 ---
    失败效果:
      - 公式: <骰子>           # 有伤害时
          类型: <伤害类型>
        状态: <状态名>           # 如 "中毒" / "魅惑"
        描述: <原文>            # 如 "目标被魔法魅惑并受底栖魔鱼控制"
    成功效果:
      - 描述: <文字>            # 如 "伤害减半"
        状态: <状态名>
    低值效果:
      - 阈值: <数字>            # 如 11 或 13
        描述: <原文>
        状态: <状态名>

    # --- 特殊触发 ---
    特殊效果:
      - 触发: <触发条件>
        描述: <原文>
```

### 关键规则

1. **伤害永远用公式**：原文 `14（4d6）点心灵伤害` → `公式: 4d6`，不是 `14`
2. **DC 14 无伤害 = 纯豁免**：如恶毒黏液、Death Burst，类型 `save`，无 `伤害` 字段
3. **命中后带 DC**：拆成 `子活动`，父活动无 DC
4. **condition 文字保留**：原文 `濒血时`、`每日 1 次` 保留在 `activation.condition`
5. **流血/减益作为内嵌效果**：不生成独立 activity
6. **多重攻击**：`类型: utility`，`描述` 列出触发了哪些动作

### 完整输出示例（底栖魔鱼）

```yaml
特性:
  - 名称: 探测心灵感应
    类型: utility
    描述: 若一个生物通过心灵感应与底栖魔鱼交流，且底栖魔鱼能看见该生物，底栖魔鱼即可获知该生物最深层的渴望。

  - 名称: 恶毒黏液
    类型: save
    activation:
      type: special
    DC: 14
    属性: 力量
    目标:
      数量: 所有非异怪生物
      类型: creature
      特殊: 底栖魔鱼周围半径10尺区域内
    描述: 受此黏液影响的生物若尝试在回合内进行除第一次以外的攻击，需进行一次DC14力量豁免检定，豁免失败则该次攻击失效。

  - 名称: 夺心者韧性
    类型: utility
    每日: 3
    描述: 若底栖魔鱼豁免失败，它可以选择直接豁免成功。当它使用此特性时，每个被底栖魔鱼支配的生物都可以进行一次具有优势的DC19感知豁免检定，成功则摆脱控制。

动作:
  - 名称: 多重攻击
    类型: utility
    activation:
      type: action
    描述: 底栖魔鱼进行三次触手攻击；它可以将其中一次替换为使用支配或迫使。

  - 名称: 迫使
    类型: utility
    activation:
      type: action
    描述: 一个被底栖魔鱼魅惑的生物对底栖魔鱼指定的一个生物进行一次武器攻击或施放一个戏法。

  - 名称: 触手
    类型: attack
    activation:
      type: action
    攻击类型: mwak
    命中: 10
    范围: 触及 10 尺
    伤害:
      - 公式: 3d6+5
        类型: 钝击
    目标:
      数量: 1
      类型: creature
    子活动:
      - 名称: 触手-疾病
        类型: save
        触发: 命中后
        DC: 16
        属性: 体质
        目标:
          数量: 1
          类型: creature
          特殊: 被命中的目标
        失败效果:
          - 状态: 疾病
            描述: 染病生物只能在水中呼吸，且在水外无法恢复生命值。1分钟后，皮肤变得黏滑半透明。
        低值效果:
          - 阈值: 11
            描述: 在接下来的1分钟内，目标对下一次受到的钝击伤害具有易伤。
            状态: 易伤
            伤害类型: 钝击

  - 名称: 支配
    类型: save
    activation:
      type: action
    DC: 18
    属性: 感知
    范围: 60 尺/视线内
    目标:
      数量: 1
      类型: creature
    需专注: true
    失败效果:
      - 状态: 魅惑
        描述: 目标被魔法魅惑并受底栖魔鱼控制。每当被魅惑的目标受到伤害时，可重复该豁免。
    低值效果:
      - 阈值: 13
        描述: 目标陷入恍惚，直到其下回合结束。
        状态: 恍惚

  - 名称: 奴役
    类型: save
    activation:
      type: action
    充能: [5, 6]
    DC: 17
    属性: 感知
    目标:
      数量: 1
      类型: creature
      特殊: 仅限被魅惑的目标
    失败效果:
      - 公式: 15d10
        类型: 心灵
    成功效果:
      - 描述: 伤害减半
    特殊效果:
      - 触发: 降至0
        描述: 目标恢复98点生命值，并且底栖魔鱼不再需要专注即可维持对其的支配。

  - 名称: 触手旋风
    类型: save
    activation:
      type: action
    充能: [5, 6]
    DC: 17
    属性: 敏捷
    AoE:
      形状: 球形
      范围: 15
    目标:
      数量: 所有生物
      类型: creature
      特殊: 半径15尺范围内
    失败效果:
      - 公式: 10d6
        类型: 钝击
      - 描述: 被推开 20 尺
    成功效果:
      - 描述: 伤害减半，且不会被推开。

附赠动作:
  # （当前测试数据无附赠动作）

反应:
  # （当前测试数据无反应）

传奇动作:
  - 名称: 精神迷雾
    类型: save
    activation:
      type: legendary
      condition: 消耗 2 动作
    DC: 17
    属性: 智力
    范围: 120 尺内
    目标:
      数量: 1
      类型: creature
    失败效果:
      - 公式: 4d6
        类型: 心灵
      - 描述: 在其于底栖魔鱼下个回合结束前进行的下一次豁免检定中减去1d6。
    成功效果:
      - 描述: 无效果

  - 名称: 魂缚互换
    类型: utility
    activation:
      type: legendary
      condition: 消耗 2 动作
    描述: 底栖魔鱼和至多一个被其魅惑的生物进行传送，互换位置。

  - 名称: 迫使
    类型: utility
    activation:
      type: legendary
      condition: 消耗 1 动作
    描述: 底栖魔鱼使用其迫使能力。
```

---

## TODOs

---

### Task 1: 扩展 StructuredActionData 接口

**Files:**
- Modify: `src/core/models/action.ts`

- [x] **Step 1: 读取现有 action.ts 接口定义**

```bash
cat src/core/models/action.ts
```

- [x] **Step 2: 添加完整 StructuredActionData 接口**

在 `action.ts` 末尾追加：

```typescript
// ===== Structured Action Data (for AI-normalized YAML parsing) =====

export type ActivityActivationType = 'action' | 'bonus' | 'reaction' | 'legendary' | 'special';
export type ActivityType = 'attack' | 'save' | 'damage' | 'utility';
export type AoeShape = '球形' | '锥形' | '线形' | '立方体' | '圆柱形' | '矩形';
export type TriggerType = '命中后' | '失败' | '成功' | '低值' | '降至0' | '濒血' | 'special';
export type SaveAbility = '力量' | '敏捷' | '体质' | '智力' | '感知' | '魅力' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface DamagePart {
  formula: string;       // e.g. "3d6+5", "4d6", "15d10"
  type: string;          // e.g. "钝击", "穿刺", "心灵"
}

export interface AoeTemplate {
  shape: AoeShape;
  range: number;         // in feet
  width?: number;       // for line/cube
  height?: number;
}

export interface ActionTarget {
  count: number | 'all' | string;  // number, "all", or descriptive text like "所有非异怪生物"
  type: 'creature' | 'object';
  special?: string;     // e.g. "仅限被魅惑的目标", "半径15尺范围内"
}

export interface SaveEffect {
  formula?: string;     // e.g. "15d10"
  type?: string;        // damage type
  state?: string;       // condition name, e.g. "中毒", "魅惑", "恍惚"
  describe?: string;    // description text
}

export interface SubAction {
  name: string;
  type: ActivityType;
  trigger: TriggerType;
  threshold?: number;   // for 低值
  
  // If save:
  DC?: number;
  ability?: SaveAbility;
  aoe?: AoeTemplate;
  target?: ActionTarget;
  damage?: DamagePart[];
  
  // If damage only (no save):
  damage?: DamagePart[];
  
  // Embedded effects (not separate activity):
  embeddedEffects?: EmbeddedEffect[];
  
  describe?: string;   // original description
}

export interface EmbeddedEffect {
  type: string;         // "流血", "疾病", "减速", etc.
  describe: string;
  duration?: string;   // "1分钟", "直到下回合结束", etc.
  damageType?: string;  // for 易伤
  damageFormula?: string; // for 易伤
}

export interface SpecialEffect {
  trigger: '降至0' | '濒血' | string;
  describe: string;
}

export interface StructuredActionData {
  name: string;
  englishName?: string;
  type: ActivityType;
  
  // Activation
  activation?: {
    type: ActivityActivationType;
    condition?: string;  // e.g. "消耗 2 动作", "濒血时"
  };
  
  // Attack fields
  attackType?: 'mwak' | 'rwak' | 'msak' | 'rsak';
  toHit?: number;
  range?: string;
  damage?: DamagePart[];
  
  // Save fields
  DC?: number;
  ability?: SaveAbility;
  aoe?: AoeTemplate;
  
  // Target
  target?: ActionTarget;
  
  // Resource
  recharge?: [number, number];  // [min, max]
  perLongRest?: number;         // 每日使用次数
  concentration?: boolean;
  
  // Description (original text, preserved for fallback)
  describe?: string;
  
  // Effects
  failEffects?: SaveEffect[];
  successEffects?: SaveEffect[];
  lowValueThreshold?: number;    // 11 or 13
  lowValueEffects?: SaveEffect[];
  specialEffects?: SpecialEffect[];
  
  // Sub-activities (for triggered branches)
  subActions?: SubAction[];
  
  // Embedded effects (not separate activities)
  embeddedEffects?: EmbeddedEffect[];
}
```

- [x] **Step 3: 验证编译**

```bash
bun run tsc --noEmit src/core/models/action.ts
```
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add src/core/models/action.ts
git commit -m "feat(models): add StructuredActionData interface for AI-normalized YAML"
```

---

### Task 2: 扩展 YamlParser — 新增 parseStructuredActions

**Files:**
- Modify: `src/core/parser/yaml.ts`
- Create: `src/core/parser/structuredAction.ts` (新文件)
- Create: `tests/core/parser/structuredAction.test.ts`

- [x] **Step 1: 创建 structuredAction.ts 解析器**

Create `src/core/parser/structuredAction.ts`:

```typescript
import type { StructuredActionData, DamagePart, AoeTemplate, ActionTarget, SaveEffect, SubAction, EmbeddedEffect, SpecialEffect, ActivityActivationType } from '../models/action';

const ABILITY_MAP: Record<string, string> = {
  '力量': 'str', '敏捷': 'dex', '体质': 'con',
  '智力': 'int', '感知': 'wis', '魅力': 'cha',
  'str': 'str', 'dex': 'dex', 'con': 'con',
  'int': 'int', 'wis': 'wis', 'cha': 'cha',
};

const AOE_SHAPE_MAP: Record<string, string> = {
  '球形': 'sphere', '锥形': 'cone', '线形': 'line',
  '立方体': 'cube', '圆柱形': 'cylinder', '矩形': 'rect',
};

export class StructuredActionParser {
  
  /**
   * Parse the AI-output YAML sections into StructuredActionData arrays.
   * Called AFTER the base YAML frontmatter has been parsed by YamlParser.
   * The AI outputs YAML with keys: 特性, 动作, 附赠动作, 反应, 传奇动作
   */
  public parseStructuredSection(section: any, sectionName: string): StructuredActionData[] {
    if (!section || !Array.isArray(section)) {
      return [];
    }
    
    return section.map((entry: any) => this.parseActionEntry(entry, sectionName));
  }
  
  private parseActionEntry(entry: any, sectionName: string): StructuredActionData {
    if (typeof entry === 'string') {
      // Fallback: plain string -> utility
      return { name: entry, type: 'utility', describe: entry };
    }
    
    const name = entry['名称'] ?? entry['name'] ?? '';
    const type = entry['类型'] ?? 'utility';
    const describe = entry['描述'] ?? entry['describe'] ?? '';
    
    // Parse activation type from section name
    const activationType = this.inferActivationType(sectionName, entry);
    
    // Parse sub-actions before flattening entry
    const subActions = this.parseSubActions(entry['子活动']);
    
    // Parse embedded effects
    const embeddedEffects = this.parseEmbeddedEffects(entry['内嵌效果']);
    
    // Build base action
    const action: StructuredActionData = {
      name: this.extractName(name),
      englishName: this.extractEnglishName(name),
      type: this.normalizeType(type),
      activation: activationType ? { type: activationType, condition: entry['activation']?.['condition'] } : undefined,
      describe,
    };
    
    // Attack fields
    if (action.type === 'attack' || entry['攻击类型']) {
      const attackType = entry['攻击类型'] ?? entry['attackType'] ?? '';
      action.attackType = this.normalizeAttackType(attackType);
      action.toHit = this.parseNumber(entry['命中'] ?? entry['toHit']);
      action.range = entry['范围'] ?? entry['range'];
      action.damage = this.parseDamageParts(entry['伤害'] ?? entry['damage']);
    }
    
    // Save fields
    if (action.type === 'save' || entry['DC']) {
      action.DC = this.parseNumber(entry['DC']);
      action.ability = this.normalizeAbility(entry['属性'] ?? entry['ability']);
      action.aoe = this.parseAoe(entry['AoE'] ?? entry['aoe']);
    }
    
    // Target
    if (entry['目标'] || entry['target']) {
      action.target = this.parseTarget(entry['目标'] ?? entry['target']);
    }
    
    // Resource
    if (entry['充能'] || entry['recharge']) {
      const r = entry['充能'] ?? entry['recharge'];
      if (Array.isArray(r) && r.length === 2) {
        action.recharge = [this.parseNumber(r[0]), this.parseNumber(r[1])];
      }
    }
    if (entry['每日'] ?? entry['perLongRest']) {
      action.perLongRest = this.parseNumber(entry['每日'] ?? entry['perLongRest']);
    }
    if (entry['需专注'] ?? entry['concentration']) {
      action.concentration = Boolean(entry['需专注'] ?? entry['concentration']);
    }
    
    // Effects
    action.failEffects = this.parseSaveEffects(entry['失败效果'] ?? entry['failEffects']);
    action.successEffects = this.parseSaveEffects(entry['成功效果'] ?? entry['successEffects']);
    
    if (entry['低值阈值'] ?? entry['lowValueThreshold']) {
      action.lowValueThreshold = this.parseNumber(entry['低值阈值'] ?? entry['lowValueThreshold']);
    }
    if (entry['低值效果'] ?? entry['lowValueEffects']) {
      action.lowValueEffects = this.parseSaveEffects(entry['低值效果'] ?? entry['lowValueEffects']);
    }
    if (entry['特殊效果'] ?? entry['specialEffects']) {
      action.specialEffects = this.parseSpecialEffects(entry['特殊效果'] ?? entry['specialEffects']);
    }
    
    // Sub-actions and embedded effects
    if (subActions.length > 0) {
      action.subActions = subActions;
    }
    if (embeddedEffects.length > 0) {
      action.embeddedEffects = embeddedEffects;
    }
    
    return action;
  }
  
  private inferActivationType(sectionName: string, entry: any): ActivityActivationType | null {
    const cond = entry['activation']?.['condition'] ?? '';
    if (sectionName === '特性') return 'special';
    if (sectionName === '动作') return 'action';
    if (sectionName === '附赠动作') return 'bonus';
    if (sectionName === '反应') return 'reaction';
    if (sectionName === '传奇动作') return 'legendary';
    return null;
  }
  
  private extractName(fullName: string): string {
    // "触手 (Tentacle)" -> "触手"
    // "探测心灵感应 (Probing Telepathy)" -> "探测心灵感应"
    const match = fullName.match(/^(.+?)\s*\(/);
    return match ? match[1].trim() : fullName.trim();
  }
  
  private extractEnglishName(fullName: string): string | undefined {
    // "触手 (Tentacle)" -> "Tentacle"
    const match = fullName.match(/\(([^)]+)\)\s*$/);
    return match ? match[1].trim() : undefined;
  }
  
  private normalizeType(t: string): StructuredActionData['type'] {
    const m = t?.toLowerCase();
    if (m === 'attack') return 'attack';
    if (m === 'save') return 'save';
    if (m === 'damage') return 'damage';
    return 'utility';
  }
  
  private normalizeAttackType(t: string): StructuredActionData['attackType'] {
    const m = t?.toLowerCase();
    if (m === 'mwak' || m?.includes('近战武器')) return 'mwak';
    if (m === 'rwak' || m?.includes('远程武器')) return 'rwak';
    if (m === 'msak' || m?.includes('近战法术')) return 'msak';
    if (m === 'rsak' || m?.includes('远程法术')) return 'rsak';
    return 'mwak'; // default
  }
  
  private normalizeAbility(a: string): StructuredActionData['ability'] {
    if (!a) return undefined;
    return ABILITY_MAP[a] ?? a;
  }
  
  private parseNumber(v: any): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v.replace(/[^\d-]/g, ''), 10) || 0;
    return 0;
  }
  
  private parseDamageParts(parts: any): DamagePart[] | undefined {
    if (!parts || !Array.isArray(parts)) return undefined;
    return parts.map((p: any) => ({
      formula: typeof p === 'string' ? p : (p['公式'] ?? p['formula'] ?? ''),
      type: typeof p === 'string' ? '' : (p['类型'] ?? p['type'] ?? ''),
    }));
  }
  
  private parseAoe(aoe: any): AoeTemplate | undefined {
    if (!aoe) return undefined;
    const shape = aoe['形状'] ?? aoe['shape'] ?? '';
    const range = this.parseNumber(aoe['范围'] ?? aoe['range']);
    if (!shape || !range) return undefined;
    return {
      shape: AOE_SHAPE_MAP[shape] ?? shape,
      range,
      width: this.parseNumber(aoe['width']),
      height: this.parseNumber(aoe['height']),
    };
  }
  
  private parseTarget(target: any): ActionTarget | undefined {
    if (!target) return undefined;
    const count = target['数量'] ?? target['count'] ?? 1;
    const type = target['类型'] ?? target['type'] ?? 'creature';
    const special = target['特殊'] ?? target['special'];
    return {
      count: count === '所有生物' || count === 'all' ? 'all' :
             count === '所有非异怪生物' ? count : this.parseNumber(count),
      type,
      special,
    };
  }
  
  private parseSaveEffects(effects: any): SaveEffect[] | undefined {
    if (!effects || !Array.isArray(effects)) return undefined;
    return effects.map((e: any) => ({
      formula: e['公式'] ?? e['formula'],
      type: e['类型'] ?? e['type'],
      state: e['状态'] ?? e['state'],
      describe: e['描述'] ?? e['describe'] ?? e['描述'],
    }));
  }
  
  private parseSpecialEffects(effects: any): SpecialEffect[] | undefined {
    if (!effects || !Array.isArray(effects)) return undefined;
    return effects.map((e: any) => ({
      trigger: e['触发'] ?? e['trigger'] ?? '',
      describe: e['描述'] ?? e['describe'] ?? '',
    }));
  }
  
  private parseSubActions(sub: any): SubAction[] {
    if (!sub || !Array.isArray(sub)) return [];
    return sub.map((s: any) => ({
      name: s['名称'] ?? s['name'] ?? '',
      type: this.normalizeType(s['类型'] ?? s['type'] ?? 'utility'),
      trigger: s['触发'] ?? s['trigger'] ?? 'special',
      threshold: s['阈值'] ?? s['threshold'],
      DC: s['DC'] ? this.parseNumber(s['DC']) : undefined,
      ability: s['属性'] ? this.normalizeAbility(s['属性']) : undefined,
      damage: this.parseDamageParts(s['伤害'] ?? s['damage']),
      describe: s['描述'] ?? s['describe'] ?? '',
    }));
  }
  
  private parseEmbeddedEffects(emb: any): EmbeddedEffect[] {
    if (!emb || !Array.isArray(emb)) return [];
    return emb.map((e: any) => ({
      type: e['类型'] ?? e['type'] ?? '',
      describe: e['描述'] ?? e['describe'] ?? '',
      duration: e['持续'] ?? e['duration'],
      damageType: e['伤害类型'] ?? e['damageType'],
      damageFormula: e['伤害公式'] ?? e['damageFormula'],
    }));
  }
}
```

- [x] **Step 2: 在 yaml.ts 中新增 parseStructuredActions 方法**

在 `YamlParser` 类中新增方法，在 `traverse()` 处理完 `items` 路径的字段后，额外解析 `特性`, `动作`, `附赠动作`, `反应`, `传奇动作` 字段：

在 `yaml.ts` 的 `applyField()` 方法中（约第 173-198 行），在 `if (internalKey === 'actions')` 分支处添加：

```typescript
// Also handle AI-structured sections (特性/动作/附赠动作/反应/传奇动作)
if (['特性', '动作', '附赠动作', '反应', '传奇动作'].includes(internalKey)) {
  const structuredParser = new StructuredActionParser();
  const sectionMap: Record<string, string> = {
    '特性': '特性',
    '动作': '动作',
    '附赠动作': '附赠动作',
    '反应': '反应',
    '传奇动作': '传奇动作',
  };
  const mapped = sectionMap[internalKey];
  if (mapped) {
    result.structuredActions = result.structuredActions ?? {};
    (result.structuredActions as any)[mapped] = structuredParser.parseStructuredSection(processedValue, internalKey);
  }
}
```

同时在 `ParsedNPC` 接口（`config/mapping.ts`）中新增：

```typescript
structuredActions?: {
  特性?: StructuredActionData[];
  动作?: StructuredActionData[];
  附赠动作?: StructuredActionData[];
  反应?: StructuredActionData[];
  传奇动作?: StructuredActionData[];
};
```

- [x] **Step 3: 写测试 structuredAction.test.ts**

```typescript
// tests/core/parser/structuredAction.test.ts
import { describe, it, expect } from 'bun:test';
import { StructuredActionParser } from '../../../src/core/parser/structuredAction';

describe('StructuredActionParser', () => {
  const parser = new StructuredActionParser();
  
  it('parses attack with sub-action', () => {
    const input = [{
      '名称': '触手 (Tentacle)',
      '类型': 'attack',
      '攻击类型': 'mwak',
      '命中': '10',
      '范围': '触及 10 尺',
      '伤害': [{ '公式': '3d6+5', '类型': '钝击' }],
      '目标': { '数量': 1, '类型': 'creature' },
      '子活动': [{
        '名称': '触手-疾病',
        '类型': 'save',
        '触发': '命中后',
        'DC': 16,
        '属性': '体质',
        '目标': { '数量': 1, '类型': 'creature', '特殊': '被命中的目标' },
        '失败效果': [{ '状态': '疾病', '描述': '染病生物只能在水下呼吸' }],
        '低值效果': [{ '阈值': 11, '描述': '钝击易伤', '状态': '易伤' }]
      }]
    }];
    
    const result = parser.parseStructuredSection(input, '动作');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('触手');
    expect(result[0].englishName).toBe('Tentacle');
    expect(result[0].type).toBe('attack');
    expect(result[0].attackType).toBe('mwak');
    expect(result[0].toHit).toBe(10);
    expect(result[0].subActions).toHaveLength(1);
    expect(result[0].subActions![0].name).toBe('触手-疾病');
    expect(result[0].subActions![0].trigger).toBe('命中后');
    expect(result[0].subActions![0].DC).toBe(16);
    expect(result[0].subActions![0].lowValueEffects![0].threshold).toBe(11);
  });
  
  it('parses save with concentration', () => {
    const input = [{
      '名称': '支配 (Dominate)',
      '类型': 'save',
      'DC': 18,
      '属性': '感知',
      '需专注': true,
      '失败效果': [{ '状态': '魅惑', '描述': '目标被魔法魅惑并受底栖魔鱼控制' }],
      '低值效果': [{ '阈值': 13, '描述': '恍惚', '状态': '恍惚' }]
    }];
    
    const result = parser.parseStructuredSection(input, '动作');
    expect(result[0].concentration).toBe(true);
    expect(result[0].DC).toBe(18);
    expect(result[0].ability).toBe('wis');
    expect(result[0].failEffects![0].state).toBe('魅惑');
    expect(result[0].lowValueEffects![0].threshold).toBe(13);
  });
  
  it('parses legendary action with condition', () => {
    const input = [{
      '名称': '精神迷雾 (Mental Fog)',
      '类型': 'save',
      'DC': 17,
      '属性': '智力',
      '失败效果': [{ '公式': '4d6', '类型': '心灵', '描述': '下次豁免-1d6' }]
    }];
    
    const result = parser.parseStructuredSection(input, '传奇动作');
    expect(result[0].activation?.type).toBe('legendary');
    expect(result[0].failEffects![0].formula).toBe('4d6');
  });
  
  it('extracts english name from name field', () => {
    const input = [{ '名称': '探测心灵感应 (Probing Telepathy)', '类型': 'utility' }];
    const result = parser.parseStructuredSection(input, '特性');
    expect(result[0].name).toBe('探测心灵感应');
    expect(result[0].englishName).toBe('Probing Telepathy');
  });
});
```

- [x] **Step 4: 运行测试**

```bash
bun test tests/core/parser/structuredAction.test.ts
```
Expected: PASS (4 tests, 0 failures)

- [x] **Step 5: Commit**

```bash
git add src/core/parser/structuredAction.ts src/core/parser/yaml.ts tests/core/parser/structuredAction.test.ts
git commit -m "feat(parser): add StructuredActionParser for AI-normalized YAML"
```

---

### Task 3: 修改 normalizeBlock — 分离基础属性和描述段

**Files:**
- Modify: `src/core/ingest/plaintext.ts`

- [x] **Step 1: 读取现有 normalizeBlock 实现**

```bash
cat src/core/ingest/plaintext.ts | head -300
```

找到 `normalizeBlock()` 方法和 `OpenAICompatibleIngestNormalizer.normalizeBlock()` 方法。

- [x] **Step 2: 修改 normalizeBlock — 分离两段**

在 `normalizeBlock()` 方法中，将 frontmatter 基础属性和描述段分开处理：

1. frontmatter 基础属性（`名称` → `感官`）直接返回为 YAML，不发 AI
2. 描述段（`特性`/`动作`/`附赠动作`/`反应`/`传奇动作`）保留原文发给 AI

关键变更：把原来发给 AI 的完整文本，改为只发描述段（markdown body）。

```typescript
// normalizeBlock() 变更逻辑：
// 1. 分离 frontmatter（基础属性）和 body（描述段）
// 2. frontmatter 直接解析为 YAML
// 3. body 发给 AI 解析（特性/动作/附赠动作/反应/传奇动作的 markdown）
```

- [x] **Step 3: 修改 AI prompt — 让 AI 输出正确 YAML 格式**

在 `OpenAICompatibleIngestNormalizer.normalizeBlock()` 的 prompt 中，更新为输出上述规范格式（参考本 plan 的"AI 输出格式规范"章节）。

Prompt 关键要求：
- 永远用公式（如 `4d6`）而非结果（如 `14`）
- 命中后带 DC → 拆成 `子活动`
- activation.type 从 section 名称推断
- DC + 无伤害 → 类型 `save`

- [x] **Step 4: 验证端到端 — 运行开发用数据**

```bash
bun run src/index.ts --ingest-plaintext "obsidian/dnd数据转fvttjson/input/开发用数据.md" --emit-dir "obsidian/dnd数据转fvttjson/test_output" --enable-ai-normalize --dry-run
```

检查输出的中间 YAML 是否符合格式规范。

- [x] **Step 5: Commit**

```bash
git add src/core/ingest/plaintext.ts
git commit -m "feat(ingest): separate base attrs from desc for AI normalization"
```

---

### Task 4: 修改 ActorGenerator — 处理 StructuredActionData

**Files:**
- Modify: `src/core/generator/actor.ts`

- [x] **Step 1: 新增 appendStructuredActionItems 方法**

在 `ActorGenerator` 中新增方法，处理 `StructuredActionData[]` 生成 FVTT activities：

关键逻辑：
- `structuredActions['动作']` → 对应 `appendActionItems(items, structured, 'action')`
- `structuredActions['传奇动作']` → 对应 `appendActionItems(items, structured, 'legendary')`
- `structuredActions['特性']` → 作为 `feat` items，对应 `appendActionItems(items, structured, 'feat')`
- `structuredActions['附赠动作']` → activation.type 设为 `bonus`
- `structuredActions['反应']` → activation.type 设为 `reaction`

对于有 `子活动` 的 action，生成父 activity 时在 `flags.fvttJsonGenerator` 中附加 `heavyHit` 结构（参考现有 `applyHeavyHitAutomation` 的逻辑）。

- [x] **Step 2: 修改 generate 方法入口**

在 `generate()` 方法中，检测 `parsed.structuredActions` 是否存在：
- 若存在：走 `appendStructuredActionItems` 路径
- 若不存在：走原有 `collectActionLines` + `ActionParser.parse()` 路径（保持向后兼容）

```typescript
if (parsed.structuredActions) {
  this.appendStructuredActionItems(items, parsed.structuredActions);
} else {
  this.appendActionItems(items, parsed.actions ?? [], 'action');
}
```

- [x] **Step 3: 写测试**

```typescript
// tests/core/generator/structuredActionItems.test.ts
// 测试：给定 StructuredActionData，生成正确的 FVTT activity JSON
// 参考现有 activity generator 测试风格
```

- [x] **Step 4: 运行测试**

```bash
bun test tests/core/generator/structuredActionItems.test.ts
```

- [x] **Step 5: Commit**

```bash
git add src/core/generator/actor.ts tests/core/generator/structuredActionItems.test.ts
git commit -m "feat(actor): handle StructuredActionData in generator"
```

---

### Task 5: 创建端到端 Fixture 测试

**Files:**
- Create: `tests/fixtures/中模板-底栖魔鱼-完整解析.json`
- Create: `tests/fixtures/中模板-蛇口蛮蟹-完整解析.json`
- Create: `tests/fixtures/中模板-滑行血鳍-完整解析.json`

- [x] **Step 1: 生成期望的 ParsedNPC 输出**

对于每个测试生物，运行完整流程后手动验证输出 JSON，手工构建期望的 `ParsedNPC` 结构（包含 `structuredActions`）。

- [x] **Step 2: 写端到端测试**

```typescript
// tests/core/ingest/plaintext两步解析.test.ts
describe('PlainText two-step parsing', () => {
  it('完整解析底栖魔鱼', async () => {
    const source = readFileSync('obsidian/dnd数据转fvttjson/input/alyxian-aboleth__底栖魔鱼"阿利克辛".md', 'utf-8');
    const result = await workflow.ingest({ source, enableAiNormalize: true });
    // 验证 structuredActions.动作 包含 6 个条目（多重攻击/迫使/触手/支配/奴役/触手旋风）
    // 验证触手.subActions 包含 1 个子活动
    // 验证支配.concentration === true
    // ...完整验证
  });
});
```

- [x] **Step 5: Commit**

```bash
git add tests/fixtures/ tests/core/ingest/plaintext两步解析.test.ts
git commit -m "test: add fixtures and e2e tests for two-step parsing"
```

---

### Task 6: 修改 plaintextAudit.ts 适配新流程

**Files:**
- Modify: `src/core/ingest/plaintextAudit.ts`

- [x] **Step 1: 检查当前 plaintextAudit 实现**

读取 `plaintextAudit.ts`，确认 audit 报告中的字段是否需要更新（新增 `structuredActions` 相关字段）。

- [x] **Step 2: 如需要则修改**

不需要重大变更，主要确认 audit 报告仍正确反映"基础属性解析成功/失败"和"AI 描述解析成功/失败"。

- [x] **Step 3: Commit**

```bash
git add src/core/ingest/plaintextAudit.ts
git commit -m "fix(audit): adapt to two-step parsing flow"
```

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [6/6] | Must NOT Have [0/0] | Tasks [6/6] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run tsc --noEmit` + linter. Review all changed files for `as any`/`@ts-ignore`, empty catches, console.log in prod.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [34 pass/0 fail] | Files [3 clean] | VERDICT: PASS`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [5/5 pass] | Integration [5/5] | Edge Cases [10 tested] | VERDICT: PASS`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep).
  Output: `Tasks [6/6 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

- Task 1: `feat(models): add StructuredActionData interface`
- Task 2: `feat(parser): add StructuredActionParser for AI-normalized YAML`
- Task 3: `feat(ingest): separate base attrs from desc for AI normalization`
- Task 4: `feat(actor): handle StructuredActionData in generator`
- Task 5: `test: add fixtures and e2e tests for two-step parsing`
- Task 6: `fix(audit): adapt to two-step parsing flow`

---

## Success Criteria

### Verification Commands
```bash
# All TypeScript compiles
bun run tsc --noEmit

# All existing tests pass
bun test

# New structured action parser tests pass
bun test tests/core/parser/structuredAction.test.ts

# New generator tests pass
bun test tests/core/generator/structuredActionItems.test.ts

# E2E test passes
bun test tests/core/ingest/plaintext两步解析.test.ts

# Dry run with AI normalization
bun run src/index.ts --ingest-plaintext "obsidian/dnd数据转fvttjson/input/开发用数据.md" --emit-dir "obsidian/dnd数据转fvttjson/test_output" --enable-ai-normalize --dry-run
```

### Final Checklist
- [ ] All StructuredActionData fields parsed correctly
- [ ] 子活动 for 触手-疾病 generates correct FVTT save activity
- [ ] 支配 has concentration=true, generates correctly
- [ ] 奴役 has recharge=[5,6], generates correctly
- [ ] 触手旋风 has AoE shape=sphere, range=15
- [ ] 精神迷雾 has legendary activation, DC 17, formula 4d6 (not 14)
- [ ] 吞咽 (bonus action) generates with activation.type=bonus
- [ ] 远洋尖啸 (reaction) generates with activation.type=reaction
- [ ] 恶毒黏液 (trait/special) generates with activation.type=special, DC 14
- [ ] 蛇口蛮蟹 毒液咬击 sub-venoms parsed correctly
- [ ] 滑行血鳍 Heavy Hit 子活动 generates correctly
