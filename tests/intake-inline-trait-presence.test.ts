import { describe, expect, test } from 'bun:test';
import { validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';

const HEADER = `# Encounter notes

These are two fictional creatures for a local test.
以下是用于本地功能验收的两只虚构怪物。

## Creature One
Medium Fey, Neutral
Armor Class 15
Hit Points 90 (12d8 + 36)
Speed 30 ft.
STR 18 (+4) DEX 14 (+2) CON 16 (+3) INT 10 (+0) WIS 12 (+1) CHA 10 (+0)
Senses passive Perception 11
Languages Common
Challenge 5 (1,800 XP)
Proficiency Bonus +3`;
const ACTIONS = `Actions
Claw. Melee Weapon Attack: +7 to hit. Hit: 8 slashing damage.`;

function missingTraits(source: string): string[] {
  const ir = buildValidLurkerIr();
  ir.creature.traits = [];
  return validateMonsterIntakeIR(source, ir).findings
    .filter(finding => finding.code === 'MISSING_SOURCE_FEATURES')
    .map(finding => finding.path);
}

describe('source inline trait presence', () => {
  test('ignores a narrative preface and stat metadata before Actions', () => {
    expect(missingTraits(`${HEADER}\n${ACTIONS}`)).not.toContain('/creature/traits');
    expect(missingTraits(`${HEADER}\nChallenge 5. A normal challenge rating line.\n${ACTIONS}`)).not.toContain('/creature/traits');
    expect(missingTraits(`${HEADER}\nThis creature wanders the shore. It has no special traits.\n${ACTIONS}`)).not.toContain('/creature/traits');
  });

  test('keeps the missing-trait gate for inline English and Chinese names with same-line bodies', () => {
    for (const trait of [
      'Magic Resistance. The creature has advantage on saving throws against spells.',
      '魔法抗性。该生物对抗法术的豁免具有优势。',
    ]) {
      expect(missingTraits(`${HEADER}\n${trait}\n${ACTIONS}`)).toContain('/creature/traits');
    }
  });

  test('keeps the missing-trait gate when the body starts on the following line', () => {
    for (const trait of [
      'Magic Resistance.\nThe creature has advantage on saving throws against spells.',
      '魔法抗性。\n该生物对抗法术的豁免具有优势。',
      'Magic Resistance\nThe creature has advantage on saving throws against spells.',
      '魔法抗性\n该生物对抗法术的豁免具有优势。',
    ]) {
      expect(missingTraits(`${HEADER}\n${trait}\n${ACTIONS}`)).toContain('/creature/traits');
    }
  });

  test('an explicit Traits section still requires IR traits', () => {
    expect(missingTraits(`${HEADER}\nTraits\n${ACTIONS}`)).toContain('/creature/traits');
  });
});
