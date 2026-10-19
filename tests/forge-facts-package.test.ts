import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FACT_LOCALIZATION_POLICY, localizationRequest, localizationText, validateLocalizationDraft } from '@fvtt-json-generator/contracts/localization';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { actorRulePresentation } from '../packages/forge-browser-runtime/src/actorRulePresentationContext';
import { encounterFactNoteParts } from '../packages/forge-browser-runtime/src/encounterFactNotes';

// New test-authored translations; no historical provider reply or real approval.
describe('facts package notes retain complete residual rules', () => {
  const fixed = 'Use the native activities. The GM resolves manual consequences from each Item’s complete rule.';
  const cases = [
    {
      name: 'food retention across a physical line break',
      source: 'It can keep solid food\ndown only if washed down with sea water.',
      good: '该生物只有用海水送服，才能留住固体食物而不吐出。',
      bad: '它可以咽下固体食物，只要用海水送服。',
    },
    {
      name: 'necessary sea-water condition is not reversed',
      source: 'It can keep solid food down\nonly if washed down with sea water.',
      good: '该生物只有用海水送服，才能留住固体食物而不吐出。',
      bad: '该生物只有不用海水送服，才能留住固体食物而不吐出。',
    },
    {
      name: 'arithmetic formula remains one ordered unit across lines',
      source: 'The target is pushed 25 (1d10\nx 5) feet away.',
      good: '目标被推离25（1d10 × 5）尺。',
      bad: '目标被推离25（1d10 / 5）尺。',
    },
  ];
  for (const row of cases) test(row.name, () => {
    const parts = encounterFactNoteParts(`${fixed}\n${row.source}`, []);
    expect(parts).toHaveLength(2);
    expect(parts.map(part => part.source).join('\n')).toBe(`${fixed}\n${row.source}`);
    expect(parts[0]!.fixedZh).toBeDefined();
    expect(parts[1]).toEqual({ source: row.source });
    const field = localizationText('body', parts[1]!.source);
    const request = localizationRequest('test-authored-source', [field], FACT_LOCALIZATION_POLICY);
    expect(() => validateLocalizationDraft(request, { texts: [{ id: field.id, text: row.good }] })).not.toThrow();
    expect(() => validateLocalizationDraft(request, { texts: [{ id: field.id, text: row.bad }] })).toThrow();
  });
  test('unrecognized notes preserve empty lines and are never dropped', () => {
    const source = 'First instruction.\n\nA conditional rule\ncontinues here.';
    expect(encounterFactNoteParts(source, [])).toEqual([{ source }]);
  });
});


describe('internal rule presentation is not a Forge response field', () => {
  const source = ['---', 'layout: creature', 'name: Marsh Guard', 'type: aberration', 'size: Medium',
    'armor_class: 12', 'hit_points: 10', 'challenge: 1', 'speed: 30', '---', '### Actions',
    '- Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) piercing damage.',
  ].join('\n');
  test('prepare capture preserves the same public response and cannot be serialized as proof', async () => {
    const request = buildForgeActorRequest({content:source,displayName:'Marsh Guard',requestId:'facts-context-boundary',fvttVersion:'14.368',systemVersion:'5.3.3'});
    const ordinary = await convertFinalActorSource(request);
    const captured = await convertFinalActorSource(request, {captureRulePresentation:true});
    expect('result' in ordinary && ordinary.result.status).toBe('accepted');
    expect('result' in captured && captured.result.status).toBe('accepted');
    expect(JSON.parse(JSON.stringify(captured))).toEqual(JSON.parse(JSON.stringify(ordinary)));
    expect(actorRulePresentation(ordinary)).toBeUndefined();
    expect(actorRulePresentation(captured)).toBeDefined();
    expect(actorRulePresentation(JSON.parse(JSON.stringify(captured)))).toBeUndefined();
    expect(Object.keys(captured)).not.toContain('rulePresentation');
    if ('result' in captured) expect(Object.keys(captured.result)).not.toContain('rulePresentation');
  });
  test('v12 never opts into the v14 facts context', async () => {
    // Reuse the complete v12 caster fixture from forge-browser-runtime tests. The
    // minimal v14 English fixture above lacks legacy numeric senses (and is
    // rejected identically with capture on or off); that is unrelated to facts.
    const legacySource = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md','utf8')
      .replace('背景: |-', '施法:\n  - \"随意: Fireball\"\n背景: |-');
    const request = buildForgeActorRequest({content:legacySource,displayName:'Nightgaunt Caster',requestId:'facts-v12-boundary',fvttVersion:'12.331',systemVersion:'4.3.9'});
    const result = await convertFinalActorSource(request, {captureRulePresentation:true});
    expect('result' in result && result.result.status).toBe('accepted');
    expect(actorRulePresentation(result)).toBeUndefined();
  });
});
