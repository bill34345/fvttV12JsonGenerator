import { expect, spyOn, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { splitStagedMonsterSource } from '@fvtt-json-generator/intake-ai/staged-source';
import { assembleStagedMonsterIntake, validateStagedBaseFacts } from '@fvtt-json-generator/intake-ai/staged-extraction';
import { decodeCategoryFormV2 } from '../packages/intake-ai/src/category-form-v2';
import { adaptCategoryFormV2, completeCategoryFormV2, completeCategoryFormSpellcasting } from '../packages/intake-ai/src/category-form-v2-adapter';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { analyzeBrowserActorSourceWithAi, generateBrowserActorIntakeCandidate } from '@fvtt-json-generator/forge-browser-runtime/ai';
import frozen from './fixtures/forge-2024-pilot-frozen-boundaries.json';

function savedGreen() {
  const saved = frozen.cases.find(row => row.id === 'P3')!;
  if (typeof saved.wholeReply !== 'string' || hashSource(saved.source) !== saved.sourceSha256
    || hashSource(saved.baseReply) !== saved.baseReplySha256 || hashSource(saved.wholeReply) !== saved.wholeReplySha256) {
    throw Error('Frozen Green Dragon input changed.');
  }
  const source = saved.source;
  const plan = splitStagedMonsterSource({ source, sourceSha256: hashSource(source),
    candidate: { id: 'P3', label: 'Adult Green Dragon', start: 0, end: source.length, quote: source } });
  const base = validateStagedBaseFacts(plan, JSON.parse(saved.baseReply));
  const decoded = decodeCategoryFormV2(JSON.parse(saved.wholeReply), plan);
  const assembled = assembleStagedMonsterIntake(plan, base, adaptCategoryFormV2(plan, base, decoded), { sourceProvenSelfArea: true });
  return { saved, plan, decoded, assembled };
}

test('legacy resource migration retains the frozen V2 declared base3/lair4 capacity without changing its inputs', () => {
  const data = savedGreen(), before = JSON.stringify(data);
  const result = completeCategoryFormSpellcasting(data.plan, data.assembled, data.decoded);
  expect(result.creature.legendary?.resistanceMax).toBe(3);
  expect(result.creature.legendary?.resistanceLairMax).toBe(4);
  expect(JSON.stringify(data)).toBe(before);
});

test('legacy resource migration links the declared native counter, ledger and resistance Activity in the full formal Actor', async () => {
  const data = savedGreen(), result = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
  const beforeMarkdown = renderMonsterIntakeMarkdown(data.assembled), markdown = renderMonsterIntakeMarkdown(result);
  const convert = async (content: string) => {
    const clock = spyOn(Date, 'now').mockReturnValue(1_792_900_000_000);
    try { return await convertMarkdownContentToJson({ content, fvttVersion: '14', effectProfile: 'core', iconOptions: { mode: 'off' }, translationService: null }); }
    finally { clock.mockRestore(); }
  };
  const before = (await convert(beforeMarkdown)).rawJson as any, actor = (await convert(markdown)).rawJson as any;
  expect(actor.system.resources.legres).toEqual({ max: 3, spent: 0 });
  expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toMatchObject({ resistanceMax: 3, resistanceLairMax: 4 });
  expect(verifyMonsterIntake(data.saved.source, result, markdown, actor).findings).toEqual([]);
  const unchanged = structuredClone(actor);
  unchanged.system.resources.legres.max = before.system.resources.legres.max;
  delete unchanged.flags.fvttJsonGenerator.sourceLegendaryLedger.resistanceMax;
  delete unchanged.flags.fvttJsonGenerator.sourceLegendaryLedger.resistanceLairMax;
  const resistance=unchanged.items.find((item:any)=>item.system.identifier==='legendary-resistance');
  expect(resistance.system.uses).toEqual({spent:0,max:'',recovery:[]});delete resistance.system.identifier;delete resistance.system.uses;
  for(const activity of Object.values<any>(resistance.system.activities)){expect(activity.consumption.targets).toEqual([{type:'attribute',target:'resources.legres.value',value:'1',scaling:{mode:'',formula:''}}]);delete activity.consumption;}
  expect(unchanged).toEqual(before);
  const lost = structuredClone(actor); lost.system.resources.legres.max = 0;
  expect(verifyMonsterIntake(data.saved.source, result, markdown, lost).findings.map(issue => issue.code)).toContain('ACTOR_LEGENDARY_RESISTANCE_DRIFT');
});

test('legacy resource migration never obtains a missing lair count from the trait title or original source', () => {
  const data = savedGreen(), row = data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!;
  row.恢复方式 = '每天';
  const before = JSON.stringify(data), result = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
  expect(result.creature.legendary?.resistanceMax).toBeUndefined();
  expect(result.creature.legendary?.resistanceLairMax).toBeUndefined();
  expect(result.uncertainties).toContainEqual(expect.objectContaining({
    code: 'V2_LEGENDARY_RESISTANCE_REEXTRACTION_REQUIRED', blocking: true,
  }));
  expect(JSON.stringify(data)).toBe(before);
});

test('legacy resource migration uses the filled capacity slots rather than numbers in the title or prose', () => {
  const data = savedGreen(), row = data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!;
  // Isolated migration control: the upstream legacy source-audit adapter has
  // separate tests. This completion reads declarations, never the title's 3/4.
  row.使用次数 = 2; row.恢复方式 = 'daily (3/day in lair)';
  const result = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
  expect(result.creature.legendary).toMatchObject({ resistanceMax: 2, resistanceLairMax: 3 });
});

test('legacy resource migration rejects another unit identity and never overwrites conflicting explicit capacities', () => {
  for (const mutate of [
    (data: ReturnType<typeof savedGreen>) => { data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!.编号 = 'another-unit'; },
    (data: ReturnType<typeof savedGreen>) => { data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!.source = 'Another source.'; },
    (data: ReturnType<typeof savedGreen>) => { data.assembled.creature.legendary!.resistanceMax = 2; data.assembled.creature.legendary!.resistanceLairMax = 3; },
  ]) {
    const data = savedGreen(); mutate(data); const before = JSON.stringify(data);
    expect(() => completeCategoryFormV2(data.plan, data.assembled, data.decoded)).toThrow();
    expect(JSON.stringify(data)).toBe(before);
  }
});

test('legacy resource migration is idempotent and does not turn an unrelated daily trait into an Actor resistance', () => {
  const data = savedGreen(), once = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
  expect(completeCategoryFormV2(data.plan, once, data.decoded)).toEqual(once);
  data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!.名称 = 'Daily Guard';
  const result = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
  expect(result.creature.legendary?.resistanceMax).toBeUndefined();
  expect(result.creature.legendary?.resistanceLairMax).toBeUndefined();
});

test('legacy resource migration retains the existing finite recovery separators without deriving either count', () => {
  for (const recovery of ['daily;4/day in lair', 'daily, in lair 4 times per day', '每天;巢穴内每天4次', '每日，在巢穴中每日4次']) {
    const data = savedGreen(), row = data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!;
    row.恢复方式 = recovery;
    const result = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
    expect(result.creature.legendary, recovery).toMatchObject({ resistanceMax: 3, resistanceLairMax: 4 });
  }
});

test('legacy resource migration preserves an ambiguous counter as a visible usable candidate without extra model calls', async () => {
  const data = savedGreen(), row = data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!;
  row.恢复方式 = '每天';
  const ir = completeCategoryFormV2(data.plan, data.assembled, data.decoded), calls = { extract: 0, other: 0 };
  const unexpected = async () => { calls.other++; throw Error('No discovery, review or repair allowed.'); };
  const provider = { providerName: 'legacy-resource-control', extractionModel: 'frozen-reply', reviewModel: 'disabled',
    discover: unexpected, extract: async () => { calls.extract++; return structuredClone(ir); }, review: unexpected, repair: unexpected };
  const input = { source: data.saved.source, sourceName: 'Frozen 2024 Green Dragon', displayName: 'Adult Green Dragon',
    requestId: 'legacy-resource-control', fvttVersion: '14.364', systemVersion: '5.3.3', sourceScope: 'single' as const };
  const analysis = await analyzeBrowserActorSourceWithAi(input, provider);
  const result = await generateBrowserActorIntakeCandidate(input, analysis, provider);
  expect(result.candidateAvailable).toBe(true);
  expect(result.candidateResponse && 'result' in result.candidateResponse && result.candidateResponse.result.artifact).toBeTruthy();
  expect(result.findings).toContainEqual(expect.objectContaining({ code: 'V2_LEGENDARY_RESISTANCE_REEXTRACTION_REQUIRED', blocking: true }));
  expect(result.intakeVerificationStatus).toBe('needs_review');
  expect(calls).toEqual({ extract: 1, other: 0 });
});

test('legacy resource migration does not select one of multiple resistance rows', () => {
  const data = savedGreen(), row = data.decoded.rows.find(row => row.名称.startsWith('Legendary Resistance'))!;
  data.decoded.rows.push(structuredClone(row));
  const result = completeCategoryFormV2(data.plan, data.assembled, data.decoded);
  expect(result.creature.legendary?.resistanceMax).toBeUndefined();
  expect(result.uncertainties).toContainEqual(expect.objectContaining({ code: 'V2_LEGENDARY_RESISTANCE_REEXTRACTION_REQUIRED' }));
});
