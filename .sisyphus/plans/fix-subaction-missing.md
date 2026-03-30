# Plan: Fix Missing subActions in StructuredActionData Generation

## TL;DR

> **Bug**: 3 subActions 缺失 (触手-疾病, 针刺噬咬, 流血创口) 因为 `structuredActionToActivityData` 没有处理 `type === 'damage'` 的情况和缺少 `failEffects` 时的 damage 设置。

> **Fix**: 在 `structuredActionToActivityData` 中添加对 `action.type === 'damage'` 的处理，以及对纯 damage 类型 subActions 的 fallback 处理。

---

## Context

### Root Cause Analysis

`structuredActionToActivityData` 方法 (actor.ts:787-831) 处理三种 action 类型：

| Type | 处理方式 | 状态 |
|------|---------|------|
| `attack` | 设置 `base.attack` + `base.attack.damage` | ✅ 有 |
| `save` (有 DC) | 设置 `base.save` | ✅ 有 |
| `damage` | **无处理** | ❌ 缺失 |

**缺失的 3 个 subActions**：

| subAction | type | 数据 |
|-----------|------|------|
| 触手-疾病 | save | DC 16, ability con, trigger '命中后' |
| 针刺噬咬 | damage | damage 1d6, trigger 'special' |
| 流血创口 | damage | damage 1d6, trigger '强击' |

其中 `触手-疾病` 是 `save` 类型，应该被 line 807 处理，但因为没有 `failEffects`，所以 `base.damage` 不会被设置。

`针刺噬咬` 和 `流血创口` 是 `damage` 类型，**完全没有处理**！

### 代码位置

- **Bug 位置**: `src/core/generator/actor.ts` lines 787-831
- **相关方法**: `structuredActionToActivityData()`

---

## Work Objectives

### Must Have
- [ ] 修复 `structuredActionToActivityData` 对 `action.type === 'damage'` 的处理
- [ ] 确保 `触手-疾病` (save with no failEffects) 正确生成
- [ ] 确保 `针刺噬咬` 和 `流血创口` (damage type) 正确生成

### Must NOT Have
- [ ] 不能破坏已有的 subActions (盐水电击, 震荡冲击, 击退, 吸血噬咬等)
- [ ] 不能改变已有的 activity 生成逻辑

---

## Verification Strategy

> **QA Scenarios**:

```
Scenario: 触手-疾病 subAction 生成
  Tool: Bash (node)
  Steps:
    1. 运行: node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('obsidian/dnd数据转fvttjson/output/alyxian-aboleth__底栖魔鱼阿利克辛.json','utf-8')); const t=o.items.find(i=>i.name.includes('Tentacle')); console.log('Activities:', Object.entries(t.system.activities).map(([k,v])=>k+':'+v.type+(v.save?' DC:'+v.save.dc:'')).join(', '))"
  Expected: 包含 "save" type 的 activity, DC 16
  Evidence: .sisyphus/evidence/fix-tentacle-disease.md

Scenario: 针刺噬咬 subAction 生成
  Tool: Bash (node)
  Steps:
    1. 运行: node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('obsidian/dnd数据转fvttjson/output/scuttling-serpentmaw__蛇口蛮蟹.json','utf-8')); const v=o.items.find(i=>i.name.includes('Venomous')); console.log('Activities:', Object.entries(v.system.activities).map(([k,a])=>k+':'+a.type+(a.damage?.parts?' dmg:'+a.damage.parts.map(p=>p.number+'d'+p.denomination).join(','):'')).join(', '))"
  Expected: 包含 "damage" type 的 activity, 1d6
  Evidence: .sisyphus/evidence/fix-needling-bite.md

Scenario: 流血创口 subAction 生成
  Tool: Bash (node)
  Steps:
    1. 运行: node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json','utf-8')); const t=o.items.find(i=>i.name.includes('Tail')); console.log('Activities:', Object.entries(t.system.activities).map(([k,a])=>k+':'+a.type+(a.damage?.parts?' dmg:'+a.damage.parts.map(p=>p.number+'d'+p.denomination).join(','):'')).join(', '))"
  Expected: 包含 "damage" type 的 activity, 1d6
  Evidence: .sisyphus/evidence/fix-bleeding-wound.md

Scenario: 已有的 subActions 未被破坏
  Tool: Bash (node)
  Steps:
    1. 验证盐水电击: node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('obsidian/dnd数据转fvttjson/output/scuttling-serpentmaw__蛇口蛮蟹.json','utf-8')); const v=o.items.find(i=>i.name.includes('Venomous')); const sa=Object.values(v.system.activities).find(a=>a.save?.dc===14); console.log('盐水电击 DC14:', sa?'found':'MISSING')"
    2. 验证震荡冲击: node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json','utf-8')); const t=o.items.find(i=>i.name.includes('Tail')); const sa=Object.values(t.system.activities).find(a=>a.save?.dc===15); console.log('震荡冲击 DC15:', sa?'found':'MISSING')"
    3. 验证击退: node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json','utf-8')); const t=o.items.find(i=>i.name.includes('Tail')); const sa=Object.values(t.system.activities).find(a=>a.type==='utility'); console.log('击退 utility:', sa?'found':'MISSING')"
  Expected: 所有 3 个都 found
  Evidence: .sisyphus/evidence/fix-no-regression.md
```

---

## Execution Strategy

### Wave 1: 修复代码

**Task 1: 修复 `structuredActionToActivityData`**

修改 `src/core/generator/actor.ts` 中的 `structuredActionToActivityData` 方法:

1. 在 `action.type === 'attack'` 分支后添加 `action.type === 'damage'` 分支
2. 对于 `action.type === 'damage'`:
   - 设置 `base.type = 'damage'`
   - 如果有 `action.damage`，设置 `base.damage = action.damage`
   - 如果有 `action.failEffects`，处理 failEffects
   - 如果有 `action.successEffects`，处理 successEffects
3. 对于 `action.type === 'save'` 但没有 `failEffects` 的情况，不需要额外处理（save 已经正确设置）

**参考修复代码** (添加到 line 805 后):

```typescript
if (action.type === 'damage') {
  base.type = 'damage';
  if (action.damage && action.damage.length > 0) {
    base.damage = action.damage.map(d => ({ formula: d.formula, type: d.type }));
  }
  if (action.failEffects && action.failEffects.length > 0) {
    const failEffect = action.failEffects[0];
    if (failEffect.formula) {
      base.damage = base.damage || [];
      base.damage.push({ formula: failEffect.formula, type: failEffect.type || 'damage' });
    }
  }
  if (action.successEffects && action.successEffects.length > 0) {
    const successEffect = action.successEffects[0];
    if (successEffect.formula) {
      base.damage = base.damage || [];
      base.damage.push({ formula: successEffect.formula, type: successEffect.type || 'damage' });
    }
  }
}
```

---

## Commit Strategy

- **1 commit** 包含代码修复和验证

---

## Success Criteria

- [ ] 触手-疾病 (DC 16 CON save) 在输出 JSON 中存在
- [ ] 针刺噬咬 (1d6 穿刺 damage) 在输出 JSON 中存在
- [ ] 流血创口 (1d6 流血 damage) 在输出 JSON 中存在
- [ ] 已有的 subActions (盐水电击, 震荡冲击, 击退, 吸血噬咬) 未被破坏
- [ ] `bun test` 全部通过
- [ ] TypeScript 编译无错误
