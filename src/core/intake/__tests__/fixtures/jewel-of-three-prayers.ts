import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { ItemDiscoveryCandidate, ItemIntakeIR } from '@fvtt-json-generator/intake-ai/item-types';

export const JEWEL_OF_THREE_PRAYERS_SOURCE = readFileSync(
  resolve('src/core/intake/__tests__/fixtures/jewel-of-three-prayers.raw.txt'),
  'utf-8',
);

function evidence(quote: string): EvidenceRef {
  const start = JEWEL_OF_THREE_PRAYERS_SOURCE.indexOf(quote);
  if (start < 0) throw new Error(`Fixture quote not found: ${quote}`);
  return { start, end: start + quote.length, quote };
}

export function jewelCandidate(): ItemDiscoveryCandidate {
  return {
    id: 'jewel-of-three-prayers',
    label: '三祷之坠',
    start: 0,
    end: JEWEL_OF_THREE_PRAYERS_SOURCE.length,
    quote: JEWEL_OF_THREE_PRAYERS_SOURCE,
  };
}

export function buildJewelOfThreePrayersIr(): ItemIntakeIR {
  const name = evidence('三祷之坠');
  const type = evidence('奇物，传说（需同调）');
  const ac = evidence('佩戴者的 AC +1。');
  const light = evidence('当佩戴或手握这件坠饰时，你可以以一个动作令它发出 15 尺半径的明亮光照和在此之外 15 尺的微光光照。光照会持续到你将其熄灭（无需动作）。');
  const uses = evidence('这件饰物具有 **3** 发充能，并且在每天黎明恢复所有被消耗的充能。');
  const invisibility = evidence('消耗 1 发充能施展 隐形术 invisibility。');
  return {
    schemaVersion: 1,
    source: {
      sha256: createHash('sha256').update(JEWEL_OF_THREE_PRAYERS_SOURCE).digest('hex'),
      length: JEWEL_OF_THREE_PRAYERS_SOURCE.length,
    },
    item: {
      name: '三祷之坠',
      englishName: 'Jewel of Three Prayers',
      type: '奇物',
      rarity: '传说',
      attunement: 'required',
      stages: [{ name: 'Dormant', evidence: [evidence('在休眠态Dormant状态下')] }],
      uses: { max: 3, recovery: [{ period: 'dawn', type: 'recoverAll' }] },
      abilities: [
        { id: 'ac-bonus', kind: 'passive-ac', value: 1, evidence: [ac] },
        { id: 'light', kind: 'light', activation: 'action', consumption: 0, bright: 15, dim: 30, extinguish: 'disable-effect', evidence: [light] },
        { id: 'invisibility', kind: 'spell', activation: 'action', consumption: 1, spell: { identifier: 'invisibility', name: 'Invisibility' }, evidence: [invisibility] },
      ],
    },
    claims: [
      { path: '/item/name', valueKind: 'explicit', value: '三祷之坠', evidence: [name] },
      { path: '/item/type', valueKind: 'explicit', value: '奇物', evidence: [type] },
      { path: '/item/uses/max', valueKind: 'explicit', value: 3, evidence: [uses] },
      { path: '/item/abilities/ac-bonus', valueKind: 'explicit', value: 1, evidence: [ac] },
      { path: '/item/abilities/light', valueKind: 'explicit', value: { bright: 15, dim: 30 }, evidence: [light] },
      { path: '/item/abilities/invisibility', valueKind: 'explicit', value: 'invisibility', evidence: [invisibility] },
    ],
    coverage: [{ ...jewelCandidate(), classification: 'narrative', claimPaths: ['/item/name', '/item/type', '/item/uses/max', '/item/abilities/ac-bonus', '/item/abilities/light', '/item/abilities/invisibility'] }],
    uncertainties: [],
  };
}
