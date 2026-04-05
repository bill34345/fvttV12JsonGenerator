## plaintext-skill-fix Notepad

### Session Context
- Goal: Fix plaintext.ts skill parsing to match yaml.ts inferSkillProficiency behavior
- Tasks 1-4 sequential: 1 (helpers) → 2 (parseSkillsLine) → 3 (skillPassives) → 4 (test fix)
- CRITICAL: Do NOT modify yaml.ts or actor.ts

### Key Data Flow
```
extractFrontmatter() parses prelude lines sequentially:
  1. parseAbilityScores() → frontmatter['能力'] = { str, dex, ... }
  2. parseChallengeLine() → frontmatter['挑战等级'] = CR (number|string)
  3. parseSkillsLine() → frontmatter['技能'] = { prc: rawModifier, ... } ← BROKEN
  4. parseSensesLine() → senses['被动察觉'] = passivePerception

The issue: parseSkillsLine stores raw modifier (e.g., 4) instead of proficiency scalar (1).
```

### Helper Functions (added at lines 866-913)
- abilityModifier(score) → Math.floor((score-10)/2)
- SKILL_ABILITY_MAP → skill key → ability abbrev
- getSkillAbility(skillKey) → ability abbrev
- getProficiencyBonus(cr) → 0/2/3/4/5/6
- inferSkillProficiency(skillKey, modifier, baseMod, profBonus) → { level, delta }
- expectedSkillModifier(skillKey, level, baseMod, profBonus) → number

### How yaml.ts Does It (reference for Task 2)
- parseSkills stores { prc: level } (proficiency scalar) in result.skills
- Also stores { prc: delta } in result.skillBonuses
- Then compute passive = 10 + baseMod + level*profBonus + delta → stored in result.skillPassives

### Frontmatter Data Available During Skill Parsing
- frontmatter['能力']: { str, dex, con, int, wis, cha } (ability scores)
- frontmatter['挑战等级']: CR (number|string)
- frontmatter['技能']: { prc: rawModifier, ... } (what we're fixing)
- senses: { '被动察觉': passivePerception }

### SKILL_LABEL_MAP in plaintext.ts
Already exists — maps Chinese/English skill names to keys like 'prc', 'ste', etc.

### Test Fixture: Slithering Bloodfin
- WIS=10, CR=9, prof=4
- Skills: 察觉 +4, 隐匿 +10
- Expected: prc.value=1 (proficient), bonuses.passive='' (no extra bonus)

### Scope Guardrails
- plaintext.ts ONLY
- yaml.ts: DO NOT TOUCH
- actor.ts: DO NOT TOUCH
- fixture files: DO NOT TOUCH
- test assertions (other than line 174): DO NOT TOUCH
