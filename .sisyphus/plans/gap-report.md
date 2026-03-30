# Gap Report: Source Markdown vs Generated JSON

**Generated:** 2026-03-29  
**Source File:** `obsidian/dnd数据转fvttjson/input/开发用数据.md` (649 lines)  
**Output Directory:** `obsidian/dnd数据转fvttjson/output/`  
**Pipeline Run:** Without `--enable-ai-normalize` (due to hang issue)

---

## Executive Summary

Comparison of 10 creatures against source markdown reveals **multiple categories of data loss and incorrect parsing**. The most critical issues are:

1. **Senses parsing is broken** - Blind sight and Darkvision are being swapped or incorrectly assigned
2. **Complex abilities with nested effects are missing** - Many special abilities don't appear in output
3. **HP ranges (e.g., "135-150") are converted to single values** instead of formulas
4. **Initiative values in output don't match source**

---

## Detailed Gap Analysis by Creature

### 1. 蛇口蛮蟹 (Scuttling Serpentmaw)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| Initiative | +5 | +3 | WRONG |
| Skills | Stealth +5 | `value: 1` (proficient) | PARTIAL - proficient but passive bonus missing |
| Traits in Biography | Pack Tactics, Brittle Shell | Only Pack Tactics | MISSING |
| Special Traits | Multiple venom types with complex rules | Only described in text, not parsed | PARSE FAILURE |

**Items Missing from Output:**
- 毒液咬击 (Venomous Bite) - The venom sub-abilities (盐水电击, 针刺噬咬, 吸血噬咬) are described but not properly structured as separate activities

---

### 2. 滑行血鳍 (Slithering Bloodfin)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| HP | 135-150 (range) | 143 (single value) | WRONG - range lost |
| Initiative | +6 | +4 | WRONG |
| Saves | 敏捷 +6 | dex.proficient: 1 | PARTIAL - proficient yes, but save bonus calculation unclear |
| Condition Immunities | 中毒 (Poisoned) | `ci: ["poisoned"]` | OK |
| Senses | 盲视 100 尺 | blindsight: 100 | OK |

**Items Missing from Output:**
- **死亡爆裂 (Death Burst)** - The corruption save for Ruidium is mentioned in text but not parsed as a separate activity
- **吞咽 (Swallow)** - Missing entirely despite being in source (附赠动作 section)
  - Source says: "目标立刻受到 14（`4d6`）点死灵伤害，之后还会再次受到同样伤害"
  - Output: No Swallow item found

**Description Issues:**
- 扭滑 (Wriggly) - Missing from biography
- 死亡爆裂 description in biography contains corruption save but no separate activity parsed

---

### 3. 底栖魔鱼衍体 (Aboleth Spawn)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| Senses | 盲视 60 尺 | blindsight: 0, darkvision: 60 | WRONG - REVERSED |
| Skills | 察觉 +7 | prc.value: 2, bonuses.passive: "+6" | PARTIAL |
| Traits | Sense Magic, Brittle Mind, Frenzied Impulse | All listed in biography | PARTIAL |

**Critical Bug:**
```
Source: "**感官 (Senses)**：黑暗视觉 (Darkvision) 60 尺，被动察觉 (Passive Perception) 17"
Output: darkvision: 60, blindsight: 0
```

The parser incorrectly assigned darkvision from a different creature's Senses line, and set blindsight to 0.

**Items Missing from Output:**
- **狂乱冲动 (Frenzied Impulse)** - Listed in biography but not as separate item
- **脆弱心智 (Brittle Mind)** - Listed in biography but not as separate item with AC change effect
- **心灵探究 (Mind Delve)** - MISSING from Actions section entirely

---

### 4. 底栖魔鱼"阿利克辛" (Alyxian Aboleth)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| STR | 21 (+5) | value: 21 | OK |
| Saves | CON +10, INT +9, WIS +7 | No saves in output | MISSING |
| Legendary Actions | 3 actions described | 0 legendary actions | MISSING |

**Items Missing from Output:**
- **传奇动作 (Legendary Actions)** - Entire section missing
  - 精神迷雾 (Mental Fog)
  - 魂缚互换 (Soulbound Swap)
  - 迫使 (Compel) - from legendary actions

---

### 5. 腐化巨鲨 (Corrupted Giant Shark)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| HP | 126 | value: 126 | OK |
| AC | 13 (Natural Armor) | calc: "natural", flat: 13 | OK |
| Regeneration | "若未受光耀伤害且未被重击，回合开始恢复10点" | MISSING | CRITICAL |

**Items Missing from Output:**
- **再生 (Regeneration)** - Not parsed as an effect
- **血之狂暴 (Blood Frenzy)** - Missing
- **心灵漩涡 (Psychic Maelstrom)** - Missing
- **电击敏感 (Electrosensitive)** - Missing
- **嗅觉过敏 (Hyperosmia)** - Missing with snout targeting rule

---

### 6. 噬光鮟鱇 (Light Devourer)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| HP | 160-200 | value: 160 | WRONG - should be formula |
| Initiative | +8 | +4 | WRONG |
| Radiant/Lurking states | Multiple states with different abilities | No state tracking | MISSING |

**Items Missing from Output:**
- **光芒吸收 (Light Absorption)** - Passive area effect missing
- **深渊潜伏者 (Lurker in the Depths)** - Missing
- **辐射 (Radiating) vs 潜伏 (Lurking)** - State-based ability differences not tracked
- **熄灯 (Lights Out)** - Reaction ability missing

---

### 7. 死亡之拥 (Death's Embrace)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| STR | 23 (+6) | value: 22 | WRONG |
| CON | 19 (+4) | value: 18 | WRONG |
| Saves | STR +11, WIS +4 | No saves | MISSING |
| Damage Immunities | 毒素 (Poison) | MISSING | CRITICAL |

**Items Missing from Output:**
- **剧毒钟罩 (Toxifying Bell)** - Critical area effect missing
- **石化触须 (Petrifying Tendrils)** - CRITICAL ability missing (HD loss mechanics)
- **无骨 (Boneless)** - Missing
- **散射魔法 (Scatter Magic)** - Reaction missing
- **毒液休克 (Venoshock)** - Missing

**HP is wrong:** Source says 210, output shows different value.

---

### 8. 月蚀矿腐化虚寂者 (Ruidium Corrupted Chuul Nullifier)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| Initiative | +6 | +4 | WRONG |
| Saves | CON +6, WIS +4 | MISSING | MISSING |
| Senses | Darkvision 60 尺 | blindsight: 0, darkvision: 60 | WRONG |

**Items Missing from Output:**
- **两栖 (Amphibious)** - Missing
- **感知魔法 (Sense Magic)** - Missing
- **月蚀脆壳 (Brittle Ruidium Shell)** - Missing AC reduction
- **虚寂力场 (Nullifying Field)** - CRITICAL anti-magic field missing
- **月蚀矿腐化 (Ruidium Corruption)** - Save mechanics missing

**Actions Missing:**
- **触须 (Tentacles)** - Missing
- **反魔法场瞬激 (Antimagic Pulse)** - Missing

---

### 9. 月蚀矿腐化尖啸者 (Ruidium Corrupted Chuul Screecher)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| Initiative | +2 | +3 | WRONG |
| HP | 127 | value: 127 | OK |
| Saves | CON +6, WIS +4 | MISSING | MISSING |

**Items Missing from Output:**
- **两栖 (Amphibious)** - Missing
- **感知魔法 (Sense Magic)** - Missing
- **濒血谐振 (Bloodied Crescendo)** - Missing
- **月蚀矿腐化 (Ruidium Corruption)** - Missing

**Actions Missing:**
- **触须 (Tentacles)** - Missing
- **月蚀尖啸 (Ruidium Screech)** - MISSING (Recharge 5-6 ability)

---

### 10. 月蚀矿腐化孵育者 (Ruidium Corrupted Chuul Incubator)

| Field | Source | Output | Gap Type |
|-------|--------|--------|----------|
| Initiative | +2 | +3 | WRONG |
| Saves | CON +7 | MISSING | MISSING |
| HP | 105 | value: 105 | OK |

**Items Missing from Output:**
- **两栖 (Amphibious)** - Missing
- **感知魔法 (Sense Magic)** - Missing
- **濒血裂巢 (Bloodied Brood-Rupture)** - Missing
- **月蚀矿腐化 (Ruidium Corruption)** - Missing (DC 14)

**Actions Missing:**
- **月蚀孵巢 (Ruidium Brood Patch)** - CRITICAL area effect missing

---

## Root Cause Analysis

### 1. Senses Parsing Bug
**Symptom:** Blindsight and darkvision are swapped or incorrectly assigned  
**Likely Cause:** Parser in `src/core/parser/` is using regex that captures darkvision when it should capture blindsight, or vice versa  
**Affected Files:** Likely `src/core/parser/senses.ts` or similar

### 2. Missing Abilities/Traits
**Symptom:** Complex abilities with multiple sub-effects are not appearing in output  
**Likely Cause:** Parser may be dropping abilities that don't fit expected patterns, or YAML frontmatter parsing is failing for multi-line descriptions  
**Affected Files:** Likely `src/core/parser/action.ts` or `src/core/parser/trait.ts`

### 3. Initiative Mismatch
**Symptom:** Output initiative doesn't match source  
**Likely Cause:** Initiative bonus is being calculated incorrectly from DEX instead of using the explicit source value  
**Affected Files:** Likely `src/core/parser/attributes.ts` or similar

### 4. HP Range Handling
**Symptom:** HP ranges like "135-150" are converted to single values  
**Likely Cause:** Parser extracts first number instead of preserving range or formula  
**Affected Files:** Likely `src/core/parser/attributes.ts`

### 5. Legendary Actions Not Parsed
**Symptom:** 底栖魔鱼"阿利克辛" has 3 legendary actions but none appear in output  
**Likely Cause:** Parser doesn't recognize the "传奇动作 (Legendary Actions)" section header  
**Affected Files:** Likely `src/core/parser/action.ts`

### 6. Complex State-Based Abilities Not Tracked
**Symptom:** Creatures with state changes (辐射/潜伏, 濒血触发) lose state information  
**Likely Cause:** No mechanism to track creature state for conditional abilities  
**Affected Files:** Architecture issue in `src/core/generator/actor.ts`

---

## Recommended Fixes (Priority Order)

### P0 - Critical (Data Loss)
1. Fix senses parsing (blindsight/darkvision swap)
2. Fix HP range to formula preservation
3. Add legendary actions parsing

### P1 - High (Incorrect Values)
4. Fix initiative bonus parsing to use source value
5. Fix ability score modifiers to match source values
6. Add missing saves

### P2 - Medium (Missing Abilities)
7. Add Toxifying Bell and Petrifying Tendrils parsing
8. Add Nullifying Field (anti-magic) parsing
9. Add Swallow ability parsing
10. Add Ruidium Corruption mechanics

### P3 - Lower (Complex Features)
11. State-based ability tracking (Radiating/Lurking)
12. Multi-use/special recovery parsing
13. Proficiency bonus handling for saves

---

## Files to Examine

| File | Purpose |
|------|---------|
| `src/core/parser/senses.ts` | Senses parsing (blind sight/darkvision bug) |
| `src/core/parser/attributes.ts` | HP, initiative parsing |
| `src/core/parser/action.ts` | Actions, legendary actions parsing |
| `src/core/parser/trait.ts` | Trait parsing |
| `src/core/parser/save.ts` | Saving throws parsing |
| `src/core/generator/actor.ts` | Actor JSON generation |

---

## Verification Plan

After fixes are applied:
1. Re-run pipeline on `开发用数据.md`
2. Compare each of the 10 creatures against source
3. Verify all gaps are closed
4. Run `bun test` to ensure no regressions
