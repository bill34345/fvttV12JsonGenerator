import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { YamlParser } from '@fvtt-json-generator/parser';
import { i18n } from '@fvtt-json-generator/parser/i18n';
import { i18n as browserI18n } from '../packages/forge-browser-runtime/src/adapters/i18n';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';

// Test-authored source/IR and Actor configuration; never a historical acceptance claim.
// The 13 entries are the source-derived DAMAGE_ZH vocabulary in the renderer.
const vocabulary = [
  ['acid', '强酸'], ['bludgeoning', '钝击'], ['cold', '冷冻'], ['fire', '火焰'],
  ['force', '力场'], ['lightning', '闪电'], ['necrotic', '黯蚀'], ['piercing', '穿刺'],
  ['poison', '毒素'], ['psychic', '心灵'], ['radiant', '光耀'], ['slashing', '挥砍'], ['thunder', '雷鸣'],
] as const;
type Defense = 'resistances' | 'immunities' | 'vulnerabilities';
const defenses = [['resistances', '伤害抗性', 'dr'], ['immunities', '伤害免疫', 'di'], ['vulnerabilities', '伤害易伤', 'dv']] as const;
function fixture(defense: Defense, values: string[]): MonsterIntakeIR {
  return { schemaVersion: 1, source: { sha256: '1'.repeat(64), length: 1 }, claims: [], coverage: [], uncertainties: [],
    creature: { identity: { name: 'Test-authored damage vocabulary Actor', size: 'medium', creatureType: 'humanoid' },
      abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
      attributes: { ac: 12, hp: { value: 30 }, movement: { walk: 30 }, cr: 1, proficiencyBonus: 2 },
      saves: {}, skills: {}, senses: {}, languages: { values: ['common'] },
      defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [], [defense]: values },
      traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
    } };
}
async function workflow(source: string, version: '12' | '14' = '14') {
  const output = await convertMarkdownContentToJson({ content: source, fvttVersion: version, effectProfile: 'core',
    translationService: null, iconOptions: { mode: 'off' } });
  expect(output.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return output.rawJson as any;
}
function stable(actor: any): any {
  const normalized = structuredClone(actor);
  normalized._stats.createdTime = 0; normalized._stats.modifiedTime = 0;
  return normalized;
}

describe('renderer damage vocabulary connects to native Actor defenses', () => {
  test.each(defenses)('all 13 renderer types survive %s through parser and formal workflow', async (field, chinese, native) => {
    const codes = vocabulary.map(([code]) => code);
    const source = renderMonsterIntakeMarkdown(fixture(field, codes));
    expect((yaml.load(source.slice(4, source.lastIndexOf('---'))) as any)[chinese]).toEqual(vocabulary.map(([, label]) => label));
    for (const newline of ['\n', '\r\n']) {
      const rendered = source.replaceAll('\n', newline);
      const parsed = new YamlParser().parse(rendered);
      expect(parsed.traits[native]).toEqual(codes);
      const actor = await workflow(rendered);
      expect(actor.system.traits[native]).toEqual({ value: codes, bypasses: [], custom: '' });
      const nativeSource = { ...(yaml.load(source.slice(4, source.lastIndexOf('---'))) as Record<string, unknown>), [chinese]: codes };
      const baseline = await workflow(`---\n${yaml.dump(nativeSource, { lineWidth: -1 })}---\n`);
      expect(stable(actor)).toEqual(stable(baseline));
    }
  });
  test.each(defenses)('old and traditional aliases remain exact %s values on both supported targets', async (field, _chinese, native) => {
    const aliases = ['寒冷', '暗蚀', '死灵', '冷冻', '黯蚀', '冷凍', '黯蝕'];
    const codes = ['cold', 'necrotic', 'necrotic', 'cold', 'necrotic', 'cold', 'necrotic'];
    const source = renderMonsterIntakeMarkdown(fixture(field, aliases));
    expect(new YamlParser().parse(source).traits[native]).toEqual(codes);
    for (const version of ['12', '14'] as const) {
      const actor = await workflow(source, version);
      expect(actor.system.traits[native].value).toEqual(codes);
    }
  });
  test.each(defenses)('unknown similar phrases stay literal in %s and preserve unrelated Actor fields', async (field, _chinese, native) => {
    const unknown = ['冷冻气息', '黯蚀能量', '强烈寒冷', '死灵系法术', '冷冻／火焰', '非黯蚀', 'Cold weather'];
    const source = renderMonsterIntakeMarkdown(fixture(field, unknown));
    expect(new YamlParser().parse(source).traits[native]).toEqual(unknown);
    const actor = await workflow(source);
    expect(actor.system.traits[native].value).toEqual(unknown);
    for (const value of unknown) expect(i18n.getKey(value)).toBeUndefined();
    actor.system.traits[native].value = [];
    const baseline = await workflow(renderMonsterIntakeMarkdown(fixture(field, [])));
    expect(stable(actor)).toEqual(stable(baseline));
  });
  test('known exact synonyms map without changing an unrelated ability key', () => {
    expect(i18n.getKey(' 冷冻 ')).toBe('DND5E.DamageCold');
    expect(i18n.getKey('黯蚀')).toBe('DND5E.DamageNecrotic');
    expect(i18n.getKey('寒冷')).toBe('DND5E.DamageCold');
    expect(i18n.getKey('暗蚀')).toBe('DND5E.DamageNecrotic');
    expect(i18n.getKey('死灵')).toBe('DND5E.DamageNecrotic');
    expect(i18n.getKey('力量')).toBe('DND5E.AbilityStr');
  });
  test('the actual browser-bundle adapter and Node parser agree on every renderer type and exact/unknown alias',()=>{
    for(const label of [...vocabulary.map(([,label])=>label),'寒冷','暗蚀','死灵','冷凍','黯蝕','力量',
      '冷冻气息','黯蚀能量','强烈寒冷','死灵系法术','冷冻／火焰','非黯蚀','Cold weather'])
      expect(browserI18n.getKey(label)).toBe(i18n.getKey(label));
  });
});
