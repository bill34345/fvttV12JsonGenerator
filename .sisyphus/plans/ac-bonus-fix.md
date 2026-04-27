# AC Bonus 处理修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复三祷之坠等物品的 AC 加值处理——从 Activity 改为 Active Effect

**Architecture:** 
- 当解析到 `passiveEffect.type === 'acBonus'` 时，不再生成 Activity
- 改为在物品的 `effects` 数组中生成 Active Effect
- Active Effect 目标路径: `system.attributes.ac.bonus`，模式: Add

**Tech Stack:** TypeScript, Bun, FVTT dnd5e system

---

## 问题分析

### 当前错误行为
```typescript
// activity.ts line 188-205
} else if (action.type === 'effect' && action.passiveEffect) {
  activities[id] = {
    _id: id,
    type: 'utility',
    activation: { type: 'passive', ... },  // ❌ 错误：AC bonus 不应该是 activity
```

### 正确行为 (根据 FVTT dnd5e)
AC 加值应该通过 Active Effect 应用：
```json
{
  "_id": "generated-id",
  "name": "AC +1 加值",
  "type": "passive",
  "origin": "Item.uuid",
  "changes": [{
    "key": "system.attributes.ac.bonus",
    "mode": "Add",
    "value": "+1"
  }],
  "disabled": false
}
```

---

## 修改范围

### 需要修改的文件
1. **`src/core/generator/activity.ts`** - 主要修改：当 `passiveEffect.type === 'acBonus'` 时，生成 Active Effect 数据而不是 Activity
2. **`src/core/generator/item-generator.ts`** - 需要将 effects 数组中的 acBonus 分离出来，应用到 item.effects
3. **`src/core/models/action.ts`** - 可能需要扩展 passiveEffect 类型定义（如果需要）

### 验证文件
- `src/core/parser/__tests__/item-parser.test.ts` - 确认解析不受影响
- `src/core/generator/__tests__/item-generator.test.ts` - 确认生成结果
- 端到端测试：三祷之坠 JSON 重新生成后验证

---

## 不应修改的范围（鲁棒性保护）
- 其他 passive effect 类型（水下呼吸、游泳速度）暂时不变，只修复 acBonus
- parseBulletEffect 逻辑不变
- 其他 activity 类型（attack, save, cast, use）不变

---

## 任务分解

### Task 1: 理解现有 effects 处理流程

**Files:**
- Modify: `src/core/generator/item-generator.ts:1-50`
- Modify: `src/core/generator/item-generator.ts:190-210`

- [x] **Step 1: 读取 item-generator.ts 的 generate() 方法流程**

读取 `item-generator.ts` 行 1-50 和 190-210，理解：
- item.effects 数组在哪里初始化
- structuredActions.effects 如何传递和生成
- 最终 item document 的 effects 字段结构

```typescript
// 预期结构
item.effects = [
  {
    _id: "effect-id",
    name: "AC +1 加值",
    type: "passive",
    origin: "Item.uuid-of-this-item",
    changes: [{ key: "system.attributes.ac.bonus", mode: "Add", value: "+1" }],
    disabled: false
  }
]
```

- [x] **Step 2: 读取 ActivityGenerator.generate() 中 effect 处理**

读取 `activity.ts` 行 188-205，理解当前 effect 如何生成 activity

- [x] **Step 3: 确认 item document effects 的正确结构**

查看 `references/` 目录下的参考文件，找一个包含 Active Effect 的物品 JSON

Run: `grep -r "system.attributes.ac.bonus" references/`

---

### Task 2: 修改 ActivityGenerator 分离 acBonus effects

**Files:**
- Modify: `src/core/generator/activity.ts:188-211`

- [x] **Step 1: 添加新方法 generatePassiveEffect()**

在 `ActivityGenerator` 类中添加新方法，专门处理 passive effects：

```typescript
/**
 * 生成 Passive Effect (如 AC 加值) 的 Active Effect 数据
 * @returns Active Effect 数据对象，或 undefined 如果不是 acBonus 类型
 */
public generatePassiveEffect(action: ActionData): Record<string, any> | undefined {
  if (action.type !== 'effect' || !action.passiveEffect) {
    return undefined;
  }
  
  if (action.passiveEffect.type === 'acBonus') {
    const id = this.generateId();
    return {
      _id: id,
      name: action.name || `AC +${action.passiveEffect.value} 加值`,
      type: 'passive',
      origin: '', // 会在 item-generator 中设置
      changes: [{
        key: 'system.attributes.ac.bonus',
        mode: 'Add',
        value: `+${action.passiveEffect.value}`
      }],
      disabled: false,
      duration: { startTime: 0, seconds: 0, combat: null, rounds: 0, turns: 0, startRound: 0, startTurn: 0 },
      transfer: false
    };
  }
  
  // 其他 passive effects (water breathing, etc.) 暂时返回 undefined，沿用现有逻辑
  return undefined;
}
```

- [x] **Step 2: 修改 generate() 方法中 effect 分支**

修改 `activity.ts` 行 188-205：

```typescript
// 原来：
} else if (action.type === 'effect' && action.passiveEffect) {
  activities[id] = { /* 生成 utility activity */ };
}

// 改为：
} else if (action.type === 'effect' && action.passiveEffect) {
  // acBonus 类型现在由 generatePassiveEffect() 处理，这里跳过
  // 保持原逻辑用于其他 passive effects (向后兼容)
  if (action.passiveEffect.type === 'acBonus') {
    // 不生成 activity，由 caller 处理
  } else {
    activities[id] = { /* 保持原有 utility activity 生成逻辑 */ };
  }
}
```

注意：这个分支现在应该让 acBonus 跳过，不生成 activity。实际的 activity 生成逻辑可以通过在 caller 层面处理。

- [ ] **Step 3: 验证 TypeScript 编译无错误**

Run: `bun tsc --noEmit src/core/generator/activity.ts`

Expected: 无错误

---

### Task 3: 修改 ItemGenerator 集成 Passive Effects

**Files:**
- Modify: `src/core/generator/item-generator.ts:380-400`

- [x] **Step 1: 修改 generateStructuredActivities() 分离 acBonus effects**

读取 `item-generator.ts` 行 344-402

```typescript
private generateStructuredActivities(
  item: ItemDocument,
  structuredActions: {
    attacks?: any[];
    saves?: any[];
    utilities?: any[];
    casts?: any[];
    effects?: any[];
    uses?: any[];
    spells?: any[];
  }
): void {
  if (!item.system) {
    item.system = {};
  }
  if (!item.system.activities) {
    item.system.activities = {};
  }
  // 初始化 effects 数组
  item.effects = [];

  let activitySortOrder = 100000;

  // 处理 activities
  const processActions = (actions: any[] | undefined) => {
    if (!actions) return;
    for (const action of actions) {
      // 检查是否是 acBonus 类型的 passive effect
      const passiveEffect = this.activityGenerator.generatePassiveEffect(action);
      if (passiveEffect) {
        // 作为 Active Effect 添加
        passiveEffect.origin = item.uuid;
        item.effects.push(passiveEffect);
      } else {
        // 作为 Activity 添加
        const activities = this.activityGenerator.generate(action);
        for (const [id, activity] of Object.entries(activities)) {
          item.system.activities[id] = {
            ...activity,
            sort: activitySortOrder,
          };
          activitySortOrder += 100000;
        }
      }
    }
  };

  processActions(structuredActions.attacks);
  processActions(structuredActions.saves);
  processActions(structuredActions.utilities);
  processActions(structuredActions.casts);
  processActions(structuredActions.effects);  // 现在会在内部过滤 acBonus
  processActions(structuredActions.uses);
  processActions(structuredActions.spells);
}
```

- [ ] **Step 2: 确保 item.effects 初始化**

检查 item document 模板是否已经有 `effects: []` 初始化，如果没有则添加

Run: `grep -n "effects:" src/core/generator/item-generator.ts | head -5`

Expected: 找到 `effects: []` 初始化在行 198 或类似位置

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `bun tsc --noEmit src/core/generator/item-generator.ts`

Expected: 无错误

---

### Task 4: 添加单元测试

**Files:**
- Create: `src/core/generator/__tests__/activity-generator.test.ts` (如果不存在)
- Modify: `src/core/generator/__tests__/item-generator.test.ts` (扩展现有测试)

- [x] **Step 1: 添加 ActivityGenerator.generatePassiveEffect() 测试**

```typescript
import { ActivityGenerator } from '../activity';

describe('ActivityGenerator.generatePassiveEffect', () => {
  const generator = new ActivityGenerator();

  it('should generate Active Effect for acBonus', () => {
    const action = {
      name: 'AC +1 加值',
      type: 'effect',
      passiveEffect: { type: 'acBonus', value: 1, description: '当佩戴这件饰物时，你的 AC 获得 +1 加值。' },
      desc: '当佩戴这件饰物时，你的 AC 获得 +1 加值。'
    };
    
    const effect = generator.generatePassiveEffect(action);
    
    expect(effect).toBeDefined();
    expect(effect?._id).toBeDefined();
    expect(effect?.name).toBe('AC +1 加值');
    expect(effect?.type).toBe('passive');
    expect(effect?.changes).toEqual([{
      key: 'system.attributes.ac.bonus',
      mode: 'Add',
      value: '+1'
    }]);
  });

  it('should return undefined for non-acBonus passive effects', () => {
    const action = {
      name: '水中呼吸',
      type: 'effect',
      passiveEffect: { type: 'senses', value: '水中呼吸', description: '你获得在水中呼吸的能力' },
      desc: '你获得在水中呼吸的能力'
    };
    
    const effect = generator.generatePassiveEffect(action);
    
    expect(effect).toBeUndefined();
  });

  it('should return undefined for non-effect actions', () => {
    const action = {
      name: 'Light',
      type: 'use',
      useAction: { consumption: 1, activation: 'free' }
    };
    
    const effect = generator.generatePassiveEffect(action);
    
    expect(effect).toBeUndefined();
  });
});
```

- [x] **Step 2: 运行测试验证**

Run: `bun test src/core/generator/__tests__/activity-generator.test.ts`

Expected: 3 tests PASS

---

### Task 5: 端到端验证 - 三祷之坠重新生成

**Files:**
- Input: `obsidian/dnd数据转fvttjson/input/items/三祷之坠.md`
- Output: `obsidian/dnd数据转fvttjson/output/items/三祷之坠.json/`

- [x] **Step 1: 重新生成三祷之坠 JSON**

Run: `bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/三祷之坠.md" -o "obsidian/dnd数据转fvttjson/output/items/三祷之坠.json"`

- [x] **Step 2: 验证 Dormant 的 effects 数组**

检查 `三祷之坠.json/三祷之坠.json` 中：
- `effects` 数组应该存在且包含 AC +1 的 Active Effect
- `activities` 数组应该只有 Light (free) 和 Invisibility (cast)，不应该有 AC +1

Expected output structure:
```json
{
  "effects": [
    {
      "name": "AC +1 加值",
      "type": "passive",
      "changes": [{ "key": "system.attributes.ac.bonus", "mode": "Add", "value": "+1" }]
    }
  ],
  "system": {
    "activities": {
      // Light 和 Invisibility 在这里
      // 不应该有 AC +1 passive activity
    }
  }
}
```

- [ ] **Step 3: 验证 Awakened 的 effects**

检查 `三祷之坠.json/三祷之坠 (Awakened).json`:
- effects 应该包含 AC +2 的 Active Effect（不是 +1）
- activities 不应该有 AC 相似的 passive activity

- [ ] **Step 4: 验证 Exalted 的 effects**

检查 `三祷之坠.json/三祷之坠 (Exalted).json`:
- effects 应该包含 AC +3 的 Active Effect

---

### Task 6: 回归测试 - 确保不破坏其他功能

**Files:**
- 测试目录: `src/core/`

- [x] **Step 1: 运行所有 item 相关测试**

Run: `bun test src/core/parser/__tests__/item-parser.test.ts src/core/generator/__tests__/item-generator.test.ts`

Expected: 所有测试 PASS (32 + 41 = 73 tests)

- [x] **Step 2: 运行完整测试套件**

Run: `bun test 2>&1 | tail -20`

Expected: 只有 pre-existing 失败（13个，与本次修改无关），无新增失败

---

### Task 7: 验证其他 passive effect 类型不受影响

**Files:**
- Input: `obsidian/dnd数据转fvttjson/input/items/三祷之坠.md`

- [x] **Step 1: 验证水中呼吸效果**

检查 Exalted 版本中：
- "水中呼吸" 能力是否仍然存在
- 是否在正确的位置（effects 还是 activities）

根据调研，"水中呼吸" 应该也是 passive effect，可能也需要改为 Active Effect。但这是**本次范围之外**的修改。

Current behavior for water breathing: 会生成 utility activity with passive activation

- [x] **Step 2: 确认水中呼吸行为未变**

如果需要验证水中呼吸在 generated JSON 中的位置，执行：

```bash
grep -A5 "水中呼吸" "obsidian/dnd数据转fvttjson/output/items/三祷之坠.json/三祷之坠 (Exalted).json"
```

Expected: 仍然以 utility activity 形式存在（因为本次只修复 acBonus）

---

## 提交策略

- **Commit 1**: "fix(activity): separate acBonus passive effects into Active Effects"

  Files: `src/core/generator/activity.ts`, `src/core/generator/item-generator.ts`
  
- **Commit 2**: "test(activity): add generatePassiveEffect unit tests"

  Files: `src/core/generator/__tests__/activity-generator.test.ts`

- **Commit 3**: "test(e2e): verify 三祷之坠 AC bonus handling"

  Files: 更新测试或添加注释

---

## 成功标准

1. ✅ 三祷之坠 Dormant 的 `effects` 数组包含 AC +1 Active Effect
2. ✅ 三祷之坠 Dormant 的 `activities` 数组**不包含** AC +1 passive activity
3. ⚠️ Awakened 和 Exalted 显示 AC +1 而非 +2/+3（**预存在的多阶段解析限制**，非本次修复范围）
4. ✅ 所有 item-parser 测试通过（32个）
5. ✅ 所有 item-generator 测试通过（41个）
6. ✅ 无新增测试失败
7. ✅ 水中呼吸等其他 passive effect 类型保持 utility activity（未受影响）

---

## 风险缓解

| 风险 | 缓解 |
|------|------|
| 修改影响其他 passive effect 类型 | 只对 `passiveEffect.type === 'acBonus'` 做特殊处理，其他类型走原逻辑 |
| FVTT 导入后 Active Effect 不生效 | 验证 Active Effect 结构符合 dnd5e 规范，参考 references/ 中现有物品 |
| 测试覆盖不足 | 添加专门的 generatePassiveEffect 单元测试 |

---

## 后续优化（范围外）

- 水中呼吸、游泳速度等 passive effects 是否也应该改为 Active Effect？
- Passive effects 的 description 是否应该保留在 item description 中？
- **多阶段物品的 AC 值解析**：当前所有阶段使用相同的 Dormant 文本，需要阶段感知解析

这些可以后续讨论。

---

## 额外修复（实施中发现）

在实施过程中发现 `parseBulletEffect` 的正则表达式有 bug：

**Bug**: `/AC\s*\+\s*(\d+)|获得\s*\+\s*(\d)\s*加值.*AC/` 无法匹配 "你的 AC 获得 +1 加值"

**原因**: 正则期望 AC 在 "获得 +N 加值" 之后，但实际文本是 AC 在前

**修复**: `/(?:AC\s*)?获得\s*\+\s*(\d+)\s*加值|AC\s*\+\s*(\d+)/`

**文件**: `src/core/parser/item-parser.ts:683`

