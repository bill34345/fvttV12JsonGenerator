/** Exact saved2024 sources: Green replies use current production adapters;
 * Brass uses the unchanged real v48 full-IR reply from the same frozen source.
 * No network, final Actor editing, or replacement of the original evidence. */
import { readFileSync } from 'node:fs';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { splitStagedMonsterSource } from '@fvtt-json-generator/intake-ai/staged-source';
import { validateStagedBaseFacts, assembleStagedMonsterIntake } from '@fvtt-json-generator/intake-ai/staged-extraction';
import { decodeCategoryFormV2 } from '../../packages/intake-ai/src/category-form-v2';
import { adaptCategoryFormV2, completeCategoryFormSpellcasting } from '../../packages/intake-ai/src/category-form-v2-adapter';
import frozen from './forge-2024-pilot-frozen-boundaries.json';
import currentBrass from './forge-2024-brass-dragon-full-ir-v48.json';

export function officialDragonSeeds() {
  const saved = frozen.cases.find(row => row.id === 'P3')!;
  if (typeof saved.wholeReply !== 'string') throw Error('Frozen Green Dragon whole reply is missing.');
  if (hashSource(saved.source) !== saved.sourceSha256 || hashSource(saved.baseReply) !== saved.baseReplySha256
    || hashSource(saved.wholeReply) !== saved.wholeReplySha256) throw Error('Frozen Green Dragon input changed.');
  const source = saved.source;
  const plan = splitStagedMonsterSource({ source, sourceSha256: hashSource(source), candidate: { id: 'P3', label: 'Adult Green Dragon', start: 0, end: source.length, quote: source } });
  const base = validateStagedBaseFacts(plan, JSON.parse(saved.baseReply));
  const form = decodeCategoryFormV2(JSON.parse(saved.wholeReply), plan);
  const ir = completeCategoryFormSpellcasting(plan, assembleStagedMonsterIntake(plan, base, adaptCategoryFormV2(plan, base, form)), form);
  if (hashSource(currentBrass.source) !== currentBrass.sourceSha256 || hashSource(currentBrass.rawReply) !== currentBrass.rawReplySha256
    || hashSource(JSON.stringify(currentBrass.ir)) !== currentBrass.irSha256 || currentBrass.ir.source.sha256 !== currentBrass.sourceSha256) {
    throw Error('Recorded Brass Dragon source, reply or IR changed.');
  }
  const rawBrass = JSON.parse(currentBrass.rawReply);
  if (rawBrass.creature.legendary.resistanceMax !== 3 || rawBrass.creature.legendary.resistanceLairMax !== 4) throw Error('Recorded AI reply omitted the native resistance capacities.');
  return [
    { id: 'green', name: 'Adult Green Dragon', source, sourceHash: hashSource(source), ir,
      expected: { ac: 19, hp: 207, cr: 15, ability: 'cha' as const, dc: 17, legendary: 'Mind Invasion', spell: 'mind-spike', spellName: 'Mind Spike', level: 3 } },
    { id: 'brass', name: 'Adult Brass Dragon', source: currentBrass.source, sourceHash: currentBrass.sourceSha256,
      ir: structuredClone(currentBrass.ir) as MonsterIntakeIR,
      expected: { ac: 18, hp: 172, cr: 13, ability: 'cha' as const, dc: 16, legendary: 'Blazing Light', spell: 'scorching-ray', spellName: 'Scorching Ray', level: 2 } },
  ];
}

/** Historical protocol diagnostics retain their exact old intermediate data.
 * These private experiments are separate from the current full-IR rules gate. */
export function legacyOfficialDragonSeeds() {
  const seeds = officialDragonSeeds();
  const brass = JSON.parse(readFileSync('.local/forge-runtime-followup-20261022/qa-runtime-seed-b87a1f.json', 'utf8')).N3;
  const originalBrass = readFileSync('.local/forge-new-three-paired-20261022/N3/source.md', 'utf8');
  if (brass.source !== originalBrass || hashSource(brass.source) !== brass.sourceHash) throw Error('Frozen legacy Brass Dragon input changed.');
  return seeds.map(seed => seed.id === 'brass' ? { ...seed, source: brass.source as string, sourceHash: brass.sourceHash as string, ir: brass.ir } : seed);
}
