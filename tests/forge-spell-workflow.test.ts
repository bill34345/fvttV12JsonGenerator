
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { generateSpellArtifact } from '@fvtt-json-generator/forge-browser-runtime/spell';

const readSpell = (name: string) => readFileSync('tests/fixtures/forge-spells/' + name + '.md', 'utf8');

test('2024 Fireball preserves its actual save, half damage, scaling, spell slot and spherical target', async () => {
  const content = readSpell('fireball');
  const result = await generateSpellArtifact(content);
  expect(await generateSpellArtifact('\uFEFF' + content.replace(/\r?\n/gu, '\r\n'))).toEqual(await generateSpellArtifact(content.replace(/\r\n/gu, '\n')));
  expect(result.verification).toMatchObject({
    status: 'needs_review', diagnostics: [{ code: 'GEN_SPELL_GM_REVIEW' }],
  });
  expect(result.item).toMatchObject({
    name: '火球术 Fireball', type: 'spell', effects: [],
    img: 'icons/magic/fire/barrier-shield-explosion-yellow.webp',
    _stats: { coreVersion: '14.370', systemId: 'dnd5e', systemVersion: '6.0.6' },
    system: {
      level: 3, method: 'spell', prepared: 0, school: 'evo', source: { rules: '2024', custom: 'SRD 5.2.1' },
      activation: { type: 'action', condition: '', value: null }, duration: { units: 'inst', value: '' },
      range: { units: 'ft', value: '150' }, properties: ['vocal', 'somatic', 'material'],
      materials: { value: '一小团蝙蝠粪和硫磺', cost: 0, consumed: false },
      target: { affects: { type: 'creature' }, template: { type: 'sphere', units: 'ft', size: '20' } },
    },
  });
  const entries = Object.entries(result.item.system.activities);
  expect(entries).toHaveLength(1);
  const [id, activity] = entries[0]!;
  expect(activity).toEqual({
    _id: id, type: 'save', img: 'icons/magic/fire/orb-vortex.webp', activation: { override: false }, duration: { override: false },
    range: { override: false }, target: { override: false, prompt: true }, effects: [],
    consumption: { spellSlot: true, targets: [], scaling: { allowed: false } },
    save: { ability: ['dex'], dc: { calculation: 'spellcasting', formula: '' } },
    damage: { onSave: 'half', parts: [{
      types: ['fire'], number: 8, denomination: 6, bonus: '', custom: { enabled: false },
      scaling: { mode: 'whole', number: 1 },
    }] },
  });
  expect((await generateSpellArtifact(content.replace('name: 火球术 Fireball', 'name: 火球术'))).item.img).toBe(result.item.img!);
  expect(result.item.system.description.value).toContain('易燃物开始燃烧');
  expect(result.item.system.description.value).toContain('<h3>GM 裁定</h3>');
});

test('2024 Fire Bolt uses a caster attack and cantrip growth without charging a slot', async () => {
  const result = await generateSpellArtifact(readSpell('fire-bolt'));
  expect(result.item.img).toBe('icons/magic/fire/projectile-fireball-orange-green.webp');
  expect(result.item.system).toMatchObject({ identifier: 'fire-bolt', level: 0, prepared: 2,
    range: { value: '120', units: 'ft' }, target: { affects: { type: 'creatureOrObject', count: '1' } } });
  expect(Object.values(result.item.system.activities)).toMatchObject([{
    type: 'attack', attack: { ability: '', flat: false, type: { value: 'ranged', classification: 'spell' } },
    damage: { includeBase: false, parts: [{ number: 1, denomination: 10, types: ['fire'], scaling: { mode: 'whole', number: 1 } }] },
    consumption: { spellSlot: false, targets: [] },
  }]);
});

test('the parser refuses legacy sources, unknown effects and unsupported roll shapes', async () => {
  const source = readSpell('fireball');
  for (const [from, to, path] of [
    ['rules: 2024', 'rules: 2014', 'rules'],
    ['rules: 2024', 'rules: 2024\nflags: {midi-qol: {}}', 'flags'],
    ['size: 20', 'size: 20, width: 15', 'target.template.width'],
    ['onSave: half', 'onSave: automatic-death', 'activity.onSave'],
    ['dice: 8d6', 'dice: 8d6+2', 'activity.damage.0.dice'],
  ]) {
    await expect(generateSpellArtifact(source.replace(from!, to!))).rejects.toThrow(path!);
  }
});

test('the verifier catches a native projection losing spell-only system fields', async () => {
  const content = readSpell('fireball');
  const { verification } = await generateSpellArtifact(content);
  const result = await generateSpellArtifact(content, {
    target: verification.target,
    project(_kind, document) {
      document.system.activation.condition = 'a different trigger';
      document.system.target.template.size = '30';
      document.system.materials.value = '';
      return document;
    },
  });
  expect(result.verification.status).toBe('failed');
  expect(result.verification.diagnostics.map(entry => entry.path)).toContain('spell/system/activation/condition');
  expect(result.verification.diagnostics.map(entry => entry.path)).toContain('spell/system/target/template/size');
  expect(result.verification.diagnostics.map(entry => entry.path)).toContain('spell/system/materials/value');
});

test('a ritual utility keeps concentration and authored GM notes without implying automated detection', async () => {
  const spell = [
    '---', 'kind: spell', 'rules: 2024', 'name: Detect Magic', 'identifier: detect-magic', 'level: 1', 'school: div',
    'activation: {type: action}', 'duration: {units: minute, value: 10}', 'range: {units: self}',
    'components: [vocal, somatic, concentration, ritual]', 'target: {type: self}', 'activity: {type: utility}',
    'gm: Reveal auras within the limits specified by the rules.', '---',
    'For the duration, sense magical effects within 30 feet. Barriers can block this sense.',
    '<script>alert(1)</script>',
  ].join('\n');
  const result = await generateSpellArtifact(spell);
  expect(result.verification.status).toBe('needs_review');
  expect(result.item.effects).toEqual([]);
  expect(result.item.system).toMatchObject({ duration: { value: '10', units: 'minute' }, range: { units: 'self' },
    properties: ['vocal', 'somatic', 'concentration', 'ritual'] });
  expect(Object.values(result.item.system.activities)).toMatchObject([{ type: 'utility', target: { prompt: false } }]);
  expect(result.item.system.description.value).toContain('&lt;script&gt;');
  expect(result.item.system.description.value).not.toContain('<script>');
  await expect(generateSpellArtifact(spell.replace(/^gm:.*\n/mu, ''))).rejects.toThrow('gm');
});
