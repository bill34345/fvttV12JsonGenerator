# actor.ts Refactor Plan (C → A 两阶段)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `actor.ts` (3460行) 重构为多个职责清晰的小文件，提升可维护性。

**Architecture:** 两阶段重构——阶段C用最小改动提取private方法到utils；阶段A按职责拆分为专门模块。

**Tech Stack:** TypeScript, Bun

---

## 背景：actor.ts 当前问题

`actor.ts` 承担了太多职责：
- Actor 主体生成 orchestration
- Item/Action 创建逻辑
- 文本解析（damage/save/threshold/rule元数据）
- 条件效果生成
- 怪物特异逻辑（Serpentmaw/Swallow/Heavy Hit）
- 大量硬编码映射表

---

## 阶段 C：提取 private 方法到工具文件（低风险起步）

### 目标
保持 `ActorGenerator` 主体逻辑不变，只把 private 方法和硬编码数据迁移到专门的文件。

### 文件结构

```
src/core/generator/
├── actor.ts                    # 保留 public 方法 + generate() orchestration + 核心流程调用
├── actor-consts.ts            # 硬编码映射表（LANGUAGE_CODE_MAP, CREATURE_TYPE_VALUE_MAP 等）
├── actor-text.ts              # 文本解析方法（extractDamageParts, extractSavingThrows 等）
├── actor-effects.ts           # 效果生成方法（generateConditionEffects, createCustomEffect 等）
├── actor-item-builder.ts      # Item 创建方法（createItemFromAction, appendActionItems 等）
├── actor-special.ts           # 怪物特异逻辑（isScuttlingSerpentmaw, isSwallowLike 等）
└── actor-legacy.ts           # 未迁移的剩余 private 方法
```

### 迁移清单

**actor-consts.ts** — 以下常量迁移：
- `LANGUAGE_CODE_MAP` (line 47-103)
- `SKILL_ABILITIES` (line 105-124)
- `CREATURE_TYPE_VALUE_MAP` (line 126-141)
- `LOCAL_NAME_TRANSLATIONS` (line 143-156)
- `LOCAL_DESCRIPTION_REPLACEMENTS` (line 158-179)
- `SPELLCASTING_TERM_REPLACEMENTS` (line 181-190)

**actor-text.ts** — 以下方法迁移：
- `extractDamagePartsFromText()`
- `extractPrimaryDamagePartsFromText()`
- `mapDamageType()`
- `extractSavingThrowFromText()`
- `extractSavingThrowsWithInheritedDcFromText()`
- `extractSavingThrowsFromText()`
- `extractAreaRadiusFeet()`
- `extractNarrativeRangeFeet()`
- `extractNarrativeRangeFeetFixed()`
- `hasHalfDamageOnSave()`
- `extractThresholdEffects()`
- `extractOnHitRiders()`
- `extractOnFailedSaveRiders()`
- `normalizeAbility()`
- `extractRuleMetadata()` 及其子方法
- `extractLegendaryCostFixed()`
- `extractUsesPerLongRestFixed()`
- `extractLegendaryActionCountFromLines()`
- `extractRequiresConcentration()`
- `extractTargetCondition()`
- `extractActivationCondition()`
- `extractSemanticDescription()`
- `extractInlineFeatureLinesFromBiography()`
- `formatStructuredHtml()`
- `splitStructuredSegments()`
- `cleanDescriptionSegment()`

**actor-effects.ts** — 以下方法迁移：
- `generateConditionEffects()`
- `generateEnhancedConditionEffects()`
- `createCustomEffect()`
- `createRandomId()`
- `extractSwallowDamage()`

**actor-item-builder.ts** — 以下方法迁移：
- `createItemFromAction()`
- `appendActionItems()`
- `appendStructuredActionItems()`
- `appendSingleStructuredAction()`
- `createDailyUses()`
- `buildItemRange()`
- `resolveItemActivationCost()`
- `buildItemSectionFlags()`
- `resolveDisplaySection()`
- `resolveDisplaySectionFixed()`
- `applySpecializedActivityOverrides()` 及其子方法
- `applyHeavyHitAutomation()`
- `applyNarrativeActivityTargeting()`
- `applyRuleMetadata()`
- `applyActivityMetadata()`
- `resolveActivationType()`
- `attachSubActivities()`
- `attachEmbeddedEffects()`

**actor-special.ts** — 以下方法迁移：
- `isScuttlingSerpentmawVenomAction()`
- `isTriggeredAcUtility()`
- `appendSerpentmawVenomActivities()`
- `applyTriggeredAcEffect()`
- `extractDelimitedSegment()`
- `isSwallowLikeAction()`
- `isDeathTriggeredSaveTrait()`
- `isStatusRemovalUtility()`
- `buildHeavyHitBranchActions()`
- `extractHeavyHitBranchSegments()`

**actor-legacy.ts** — 剩余未分类方法：
- `extractSpellNames()`
- `appendLegacySpellItems()`
- `createSpellcastingDescriptionItem()`
- `extractSpellcastingLines()`

---

### Task 1: 创建 actor-consts.ts

**Files:**
- Create: `src/core/generator/actor-consts.ts`

- [x] **Step 1: 创建文件并迁移常量**

```typescript
// src/core/generator/actor-consts.ts

export const LANGUAGE_CODE_MAP: Record<string, string> = {
  '通用语': 'common',
  '通用': 'common',
  '龙语': 'draconic',
  // ... 完整迁移
};

export const SKILL_ABILITIES: Record<string, string> = {
  acr: 'dex',
  ani: 'wis',
  // ... 完整迁移
};

export const CREATURE_TYPE_VALUE_MAP: Record<string, string> = {
  异怪: 'aberration',
  野兽: 'beast',
  // ... 完整迁移
};

export const LOCAL_NAME_TRANSLATIONS: Record<string, string> = {
  'adult red dragon': '成年红龙',
  // ... 完整迁移
};

export const LOCAL_DESCRIPTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Melee or Ranged Weapon Attack/gi, '近战或远程武器攻击'],
  // ... 完整迁移
];

export const SPELLCASTING_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bspellcasting ability\b/gi, '施法属性spellcasting ability'],
  // ... 完整迁移
];
```

- [ ] **Step 2: 在 actor.ts 顶部添加 import**

```typescript
import {
  LANGUAGE_CODE_MAP,
  SKILL_ABILITIES,
  CREATURE_TYPE_VALUE_MAP,
  LOCAL_NAME_TRANSLATIONS,
  LOCAL_DESCRIPTION_REPLACEMENTS,
  SPELLCASTING_TERM_REPLACEMENTS,
} from './actor-consts';
```

- [ ] **Step 3: 验证编译**

Run: `bun build src/core/generator/actor.ts --no-outdir 2>&1 | head -20`
Expected: 无 import 错误

- [ ] **Step 4: Commit**

```bash
git add src/core/generator/actor-consts.ts src/core/generator/actor.ts
git commit -m "refactor: extract hardcoded maps to actor-consts.ts"
```

---

### Task 2: 创建 actor-text.ts

**Files:**
- Create: `src/core/generator/actor-text.ts`
- Modify: `src/core/generator/actor.ts`

- [ ] **Step 1: 创建文件并迁移文本解析方法**

从 actor.ts 迁移以下方法到新文件：
- `extractDamagePartsFromText()` (line ~2780)
- `extractPrimaryDamagePartsFromText()` (line ~2795)
- `mapDamageType()` (line ~2801)
- `extractSavingThrowFromText()` (line ~2832)
- `extractSavingThrowsWithInheritedDcFromText()` (line ~2836)
- `extractSavingThrowsFromText()` (line ~2866)
- `extractAreaRadiusFeet()` (line ~2890)
- `extractNarrativeRangeFeet()` (line ~2908)
- `extractNarrativeRangeFeetFixed()` (line ~2932)
- `hasHalfDamageOnSave()` (line ~2958)
- `extractThresholdEffects()` (line ~2962)
- `extractOnHitRiders()` (line ~2988)
- `extractOnFailedSaveRiders()` (line ~3011)
- `normalizeAbility()` (line ~3034)
- `extractLegendaryCostFixed()` (line ~3036)
- `extractUsesPerLongRestFixed()` (line ~3313)
- `extractLegendaryActionCountFromLines()` (line ~3296)
- `extractRequiresConcentration()` (line ~3269)
- `extractTargetCondition()` (line ~3273)
- `extractActivationCondition()` (line ~3336)
- `extractSemanticDescription()` (line ~3344)
- `extractInlineFeatureLinesFromBiography()` (line ~2881)
- `formatStructuredHtml()` (line ~2938)
- `splitStructuredSegments()` (line ~2969)
- `cleanDescriptionSegment()` (line ~2980)
- `parseLocalizedAttackLine()` (line ~2732)
- `splitBilingualName()` (line ~2772)

新文件格式：
```typescript
// src/core/generator/actor-text.ts
import { i18n } from '../mapper/i18n';
import type { Damage } from '../parser/action';

export function extractDamagePartsFromText(text: string): Damage[] {
  // ... 迁移代码
}
// ... 其他方法
```

- [ ] **Step 2: 添加 import 到 actor.ts**

```typescript
import {
  extractDamagePartsFromText,
  extractPrimaryDamagePartsFromText,
  mapDamageType,
  extractSavingThrowFromText,
  // ... 其他方法
} from './actor-text';
```

- [ ] **Step 3: 验证编译**

Run: `bun build src/core/generator/actor.ts --no-outdir 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 4: 运行测试**

Run: `bun test src/core/generator/__tests__/actor.test.ts 2>&1 | tail -10`
Expected: 现有测试仍然通过

- [ ] **Step 5: Commit**

```bash
git add src/core/generator/actor-text.ts src/core/generator/actor.ts
git commit -m "refactor: extract text parsing methods to actor-text.ts"
```

---

### Task 3: 创建 actor-effects.ts

**Files:**
- Create: `src/core/generator/actor-effects.ts`
- Modify: `src/core/generator/actor.ts`

- [ ] **Step 1: 迁移效果生成方法**

迁移：
- `generateConditionEffects()` (line ~2452)
- `generateEnhancedConditionEffects()` (line ~2552)
- `createCustomEffect()` (line ~2363)
- `createRandomId()` (line ~2397)
- `extractSwallowDamage()` (line ~2432)

- [ ] **Step 2: 添加 import 并验证编译**

- [ ] **Step 3: 运行测试确认功能不变**

- [ ] **Step 4: Commit**

---

### Task 4: 创建 actor-item-builder.ts

**Files:**
- Create: `src/core/generator/actor-item-builder.ts`
- Modify: `src/core/generator/actor.ts`

- [ ] **Step 1: 迁移 Item 创建方法**

迁移：
- `createItemFromAction()` (line ~1087)
- `appendActionItems()` (line ~707)
- `appendStructuredActionItems()` (line ~736)
- `appendSingleStructuredAction()` (line ~757)
- `createDailyUses()` (line ~3326)
- `buildItemRange()` (line ~1174)
- `resolveItemActivationCost()` (line ~1163)
- `buildItemSectionFlags()` (line ~1203)
- `resolveDisplaySection()` (line ~1219)
- `resolveDisplaySectionFixed()` (line ~1193)
- `applySpecializedActivityOverrides()` (line ~2045)
- `applyHeavyHitAutomation()` (line ~1459)
- `applyNarrativeActivityTargeting()` (line ~1527)
- `applyRuleMetadata()` (line ~1554)
- `applyActivityMetadata()` (line ~2677)
- `resolveActivationType()` (line ~2718)
- `attachSubActivities()` (line ~837)
- `attachEmbeddedEffects()` (line ~864)
- `structuredActionToActivityData()` (line ~790)

注意：这些方法依赖 `this.activityGenerator`，需要通过参数传入或作为类成员保留。

- [ ] **Step 2: 添加 import 并验证编译**

- [ ] **Step 3: 运行测试确认功能不变**

- [ ] **Step 4: Commit**

---

### Task 5: 创建 actor-special.ts

**Files:**
- Create: `src/core/generator/actor-special.ts`
- Modify: `src/core/generator/actor.ts`

- [ ] **Step 1: 迁移怪物特异逻辑**

迁移：
- `isScuttlingSerpentmawVenomAction()` (line ~2168)
- `isTriggeredAcUtility()` (line ~2173)
- `appendSerpentmawVenomActivities()` (line ~2178)
- `applyTriggeredAcEffect()` (line ~2288)
- `extractDelimitedSegment()` (line ~2348)
- `isSwallowLikeAction()` (line ~2406)
- `isDeathTriggeredSaveTrait()` (line ~2411)
- `isStatusRemovalUtility()` (line ~2421)
- `buildHeavyHitBranchActions()` (line ~1756)
- `extractHeavyHitBranchSegments()` (line ~1825)

- [ ] **Step 2: 添加 import 并验证编译**

- [ ] **Step 3: 运行测试确认功能不变**

- [ ] **Step 4: Commit**

---

### Task 6: 创建 actor-legacy.ts

**Files:**
- Create: `src/core/generator/actor-legacy.ts`
- Modify: `src/core/generator/actor.ts`

- [ ] **Step 1: 迁移剩余方法**

迁移：
- `extractSpellNames()` (line ~2541)
- `appendLegacySpellItems()` (line ~3014)
- `createSpellcastingDescriptionItem()` (line ~3053)
- `extractSpellcastingLines()` (line ~3073)

- [ ] **Step 2: 添加 import 并验证编译**

- [ ] **Step 3: 运行完整测试套件**

Run: `bun test 2>&1 | tail -5`
Expected: 所有测试通过（与重构前相同的失败数量，无新增）

- [ ] **Step 4: Commit**

```bash
git add src/core/generator/actor-legacy.ts src/core/generator/actor.ts
git commit -m "refactor: extract legacy spell methods to actor-legacy.ts - Phase C complete"
```

---

## 阶段 C 验收

阶段 C 完成后，`actor.ts` 应该：
- 只保留 public 方法（`generate()`, `generateForRoute()`, `loadGoldenMaster()`）
- private 方法全部迁移到专门文件
- 所有功能测试通过
- 无新增编译错误

**阶段 C 总结文件：**

```
src/core/generator/
├── actor.ts              # ~300行 - public + orchestration
├── actor-consts.ts       # ~200行 - 硬编码映射表
├── actor-text.ts         # ~600行 - 文本解析
├── actor-effects.ts      # ~300行 - 效果生成
├── actor-item-builder.ts # ~500行 - Item 创建
├── actor-special.ts      # ~300行 - 怪物特异逻辑
├── actor-legacy.ts      # ~200行 - 施法相关
└── (其他文件不变)
```

---

## 阶段 A：按职责彻底拆分（可选深化）

阶段 C 完成后，如果 `actor.ts` 仍然过大，可以继续：

### 方案 A1：转换为模块化类

将 `ActorGenerator` 拆分为多个协作的类：

```
ActorGenerator ( orchestration + public API )
  └─> ItemBuilder ( item 创建 )
  └─> EffectsProcessor ( 效果处理 )
  └─> TextAnalyzer ( 文本解析 )
  └─> SpecialLogicHandler ( 怪物特异逻辑 )
```

### 方案 A2：转换为策略模式

将 item 生成逻辑抽象为可注入的策略：

```
ActorGenerator
  └─> ItemGenerationStrategy ( interface )
       ├─> ChineseItemStrategy
       └─> EnglishItemStrategy
```

---

## 最终验收

- [ ] `actor.ts` 行数 < 400 行
- [ ] 每个工具文件 < 600 行
- [ ] 所有现有测试通过
- [ ] `bun build src/index.ts` 无错误
- [ ] E2E 测试仍然通过
