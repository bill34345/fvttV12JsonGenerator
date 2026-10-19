import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { YamlParser } from '@fvtt-json-generator/parser/yaml';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import fixture from './fixtures/forge-skill-total-contract.json';

type Case = typeof fixture.cases[number];
const lineEndings = ['\n', '\r\n'] as const;
const targets = ['12', '14'] as const;
const skillKeys = { athletics: 'ath', acrobatics: 'acr', arcana: 'arc', deception: 'dec', perception: 'prc', stealth: 'ste', survival: 'sur' };

function intake(sample: Case, source: string): MonsterIntakeIR {
  const evidence = { start: 0, end: source.length, quote: source };
  const paths = ['/creature/identity/name', '/creature/identity/size', '/creature/identity/creatureType', '/creature/abilities',
    '/creature/attributes/ac', '/creature/attributes/hp', '/creature/attributes/movement', '/creature/attributes/cr',
    '/creature/attributes/xp', '/creature/attributes/proficiencyBonus', '/creature/skills', '/creature/languages'];
  return {
    schemaVersion: 1, source: { sha256: hashSource(source), length: source.length },
    creature: {
      identity: { name: sample.name, size: 'medium', creatureType: 'humanoid' },
      abilities: sample.abilities,
      attributes: { ac: 12, hp: { value: 22, formula: '4d8 + 4' }, movement: { walk: 30 }, cr: sample.cr, xp: sample.xp, proficiencyBonus: sample.proficiencyBonus },
      skills: { ...fixture.skillTotals }, saves: {}, defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] },
      senses: {}, languages: { values: ['common'] }, traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
    },
    claims: paths.map(path => ({ path, valueKind: 'explicit', confidence: 'high', evidence: [{ ...evidence }] })),
    coverage: [{ ...evidence, classification: 'mechanical', claimPaths: paths }], uncertainties: [],
  };
}

describe('source skill totals have an explicit Markdown meaning distinct from legacy proficiency', () => {
  for (const sample of fixture.cases) for (const fvttVersion of targets) for (const eol of lineEndings) {
    test(`${sample.name}, PB ${sample.proficiencyBonus}, V${fvttVersion}, ${eol === '\n' ? 'LF' : 'CRLF'} preserves all seven totals through the public workflow`, async () => {
      const source = sample.source.replaceAll('\n', eol), ir = intake(sample, source);
      const markdown = renderMonsterIntakeMarkdown(ir).replaceAll('\n', eol);
      const data = yaml.load(markdown.slice(3, markdown.lastIndexOf('---'))) as any;
      expect(data.技能.奥秘).toEqual({ 总加值: 1 });
      expect(data.技能.欺瞒).toEqual({ 总加值: 2 });
      const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion, effectProfile: 'core', translationService: null });
      expect(generated.status, JSON.stringify(generated.diagnostics)).toBe('accepted');
      const report = verifyMonsterIntake(source, ir, markdown, generated.rawJson);
      expect(report.findings).toEqual([]);
      expect(report.projection.skills).toEqual(fixture.skillTotals);
      // An odd PB must not need a fractional half-proficiency correction to
      // represent an integer source total in either Foundry target.
      const actor = generated.rawJson as any;
      for (const key of Object.values(skillKeys)) {
        expect([0, 1, 2]).toContain(actor.system.skills[key].value);
        expect(Number.isInteger(Number(actor.system.skills[key].bonuses.check || 0))).toBeTrue();
      }
    });
  }

  for (const fvttVersion of targets) for (const eol of lineEndings) for (const quoted of [false, true]) {
    test(`legacy ${quoted ? 'quoted' : 'numeric'} and named proficiency remains unchanged in V${fvttVersion}, ${eol === '\n' ? 'LF' : 'CRLF'}`, async () => {
      const legacy = quoted ? fixture.legacyYaml.replace(/^( {2}[^:\n]+: )(0\.5|[012])$/gm, '$1"$2"') : fixture.legacyYaml;
      const markdown = legacy.replaceAll('\n', eol);
      const parsed = new YamlParser().parse(markdown);
      expect(parsed.skills).toEqual({ ath: 1, acr: 2, arc: 1, dec: 2, prc: 0.5, ste: 0.5, sur: 0 });
      expect(parsed.skillBonuses).toEqual({});
      const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion, effectProfile: 'core', translationService: null });
      expect(generated.status).toBe('accepted');
      const actor = generated.rawJson as any;
      for (const [key, value] of Object.entries(parsed.skills!)) expect(actor.system.skills[key].value).toBe(value);
    });
  }

  for (const [skill, label, canonical, quote] of [
    ['animalhandling', '驯兽', 'animalHandling', 'Animal Handling +2'],
    ['sleightofhand', '巧手', 'sleight-of-hand', 'Sleight of Hand +2'],
  ]) {
    test(`the existing staged spelling ${skill} retains its source total through the formal workflow`, async () => {
      const sample = fixture.cases[0]!, source = sample.source.replace('Skills Athletics', `Skills ${quote}, Athletics`), ir = intake(sample, source);
      ir.creature.skills[skill!] = 2;
      const markdown = renderMonsterIntakeMarkdown(ir), data = yaml.load(markdown.slice(3, markdown.lastIndexOf('---'))) as any;
      expect(data.技能[label!]).toEqual({ 总加值: 2 });
      const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
      const report = verifyMonsterIntake(source, ir, markdown, generated.rawJson);
      expect(report.findings).toEqual([]);
      expect((report.projection.skills as Record<string, number>)[canonical!]).toBe(2);
    });
  }

  test.each(['{总加值: "1"}', '{总加值: 1.5}', '{总加值: .inf}', '{总加值: .nan}', '{总加值: 1, 熟练: 2}', '{总加植: 1}', '{}'])('rejects an ambiguous or malformed explicit total rather than inventing half proficiency: %s', value => {
    const markdown = fixture.legacyYaml.replace('  运动: 1', `  运动: ${value}`);
    expect(() => new YamlParser().parse(markdown)).toThrow('InvalidSkillTotal');
  });

  test('a listed total cannot mask a later IR total changed without changing its source', async () => {
    const sample = fixture.cases[0]!, source = sample.source, ir = intake(sample, source);
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const wrong = structuredClone(ir); wrong.creature.skills.arcana = 9;
    expect(verifyMonsterIntake(source, wrong, markdown, generated.rawJson).findings).toContainEqual(expect.objectContaining({ code: 'ACTOR_SKILL_DRIFT', path: '/creature/skills/arcana' }));
  });
});
