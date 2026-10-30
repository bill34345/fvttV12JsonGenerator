import { expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { renderMonsterIntakeMarkdown } from '../renderer';
import type { MonsterIntakeIR } from '../types';
import { verifyMonsterIntake } from '../verifier';

for (const entry of [
  { label: 'Chinese parser alias', values: ['深潜语'], custom: undefined, native: ['deep'], note: '' },
  { label: 'English native aliases', values: ['Deep Speech', 'dwarven'], custom: undefined, native: ['deep', 'dwarvish'], note: '' },
  { label: 'native alias and literal custom language', values: ['深潜语', 'Elder Cant'], custom: 'Understands commands', native: ['deep'], note: 'Elder Cant; Understands commands' },
  { label: 'ordinary language and literal custom language', values: ['common', 'Elder Cant'], custom: undefined, native: ['common'], note: 'Elder Cant' },
]) test(`language projection agrees with generation for ${entry.label}`, async () => {
  const source = 'Language Probe';
  const ir: MonsterIntakeIR = {
    schemaVersion: 1,
    source: { sha256: sha256(source), length: source.length },
    creature: {
      identity: { name: source, size: 'medium', creatureType: 'construct' },
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      attributes: { ac: 10, hp: { value: 1 }, movement: { walk: 30 }, cr: 0 },
      saves: {}, skills: {}, senses: { passivePerception: 10 },
      defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] },
      languages: { values: entry.values, ...(entry.custom === undefined ? {} : { custom: entry.custom }) },
      traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
    },
    claims: [], coverage: [], uncertainties: [],
  };
  const markdown = renderMonsterIntakeMarkdown(ir);
  const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
  const actor = generated.rawJson as any;
  expect(actor.system.traits.languages).toEqual({ value: entry.native, custom: entry.note });
  const before = structuredClone({ ir, actor });
  expect(verifyMonsterIntake(source, ir, markdown, actor).findings).toEqual([]);
  expect({ ir, actor }).toEqual(before);

  actor.system.traits.languages.value = [];
  expect(verifyMonsterIntake(source, ir, markdown, actor).findings.map(finding => finding.code)).toContain('ACTOR_LANGUAGE_DRIFT');
  if (entry.note) {
    actor.system.traits.languages.custom = entry.note.toLowerCase();
    expect(verifyMonsterIntake(source, ir, markdown, actor).findings.map(finding => finding.code)).toContain('ACTOR_LANGUAGE_NOTE_DRIFT');
  }
});
