import { expect, test } from 'bun:test';
import { sourceMentionsDisplayName } from '@fvtt-json-generator/models/display-name';

test('bilingual display names match their explicit Chinese or English source identity', () => {
  expect(sourceMentionsDisplayName('施法：每天一次施放火球术。', '施法 Spellcasting')).toBe(true);
  expect(sourceMentionsDisplayName('Spellcasting: Fireball once per day.', '施法 Spellcasting')).toBe(true);
  expect(sourceMentionsDisplayName('多重攻击：进行两次攻击。', '多重攻击 (Multiattack)')).toBe(true);
  expect(sourceMentionsDisplayName('生命值40，速度30尺。', '施法 Spellcasting')).toBe(false);
});
