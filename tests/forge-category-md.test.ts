import { expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { prepareCategoryMdBatches, decodeCategoryMdReply, extractCategoryMd, categoryMdFeatureProposal, type CategoryMdUnit, type CategoryMdBatch } from '../packages/intake-ai/src/category-md';

const texts = ['Bite. Hit: 7 (2d6) piercing damage.', 'Claw. Hit: 3 (1d6) slashing damage.', 'Dash. Move up to your Speed.', 'Ward. The target gains +2 AC.'];
const source = texts.join('\n');
const units: CategoryMdUnit[] = texts.map((quote, index) => ({ id: `unit-${index}`, name: quote.split('.')[0]!,
  section: index < 2 ? 'action' : index === 2 ? 'bonus' : 'reaction',
  start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote, context: [] }));
const batches = () => prepareCategoryMdBatches({ source, units, mechanicsInstructions: 'Use the selected candidate mechanics contract.' });
const response = (batch: CategoryMdBatch) => ({ schemaVersion: 1, category: batch.category,
  unitIds: batch.units.map(unit => unit.id), markdown: batch.template });

test('whole-category requests include all abilities and shared inventory without filled mechanics answers', () => {
  const plan = batches();
  expect(plan.map(batch => batch.category)).toEqual(['action', 'bonus', 'reaction']);
  expect(plan[0]!.units.map(unit => unit.name)).toEqual(['Bite', 'Claw']);
  expect(plan.every(batch => batch.sourceInventory.length === 4)).toBe(true);
  expect(plan[0]!.template).not.toContain('sourceOperations:');
  expect(plan[0]!.prompt).toContain('manual template is not permission');
});

test('source ownership rejects altered quotes, duplicate identities and invalid ranges before any request', () => {
  for (const bad of [
    [{ ...units[0]!, quote: 'Changed source' }],
    [units[0]!, units[0]!],
    [{ ...units[0]!, start: -1 }],
    [{ ...units[0]!, context: ['invented rule'] }],
  ]) expect(() => prepareCategoryMdBatches({ source, units: bad, mechanicsInstructions: 'contract' })).toThrow('SOURCE_UNIT_IDENTITY');
});

test('MD decoding consumes the returned YAML and retains its actual executable fields', () => {
  const batch = batches()[0]!, reply = response(batch);
  const parsed: any = yaml.load(reply.markdown);
  parsed.动作[0].sourceOperations = [{ id: 'attack', type: 'attack', attack: { toHit: 5 } }];
  reply.markdown = yaml.dump(parsed);
  expect((decodeCategoryMdReply(batch, reply)[0]!.fields.sourceOperations as any[])[0].attack.toHit).toBe(5);
});

test('MD adapter forwards the returned operations and uses without filling source facts', () => {
  const unit = units[0]!, fields = { 名称: unit.name, 描述: unit.quote, 类型: 'utility', 执行模式: 'native-with-gm',
    sourceOperations: [{ id: 'attack', type: 'attack', attack: { toHit: 5 } }], 使用次数: { max: 2, period: 'day' } };
  const result = categoryMdFeatureProposal({ unit, fields });
  expect(result).toEqual({ schemaVersion: 1, unitId: unit.id, mode: 'native-with-gm',
    facts: { sourceOperations: fields.sourceOperations, uses: fields.使用次数 } });
  (result.facts.sourceOperations as any[])[0].attack.toHit = 99;
  expect(fields.sourceOperations[0]!.attack.toHit).toBe(5);
  expect(categoryMdFeatureProposal({ unit, fields: { 名称: unit.name, 描述: unit.quote, 类型: 'utility', 执行模式: 'gm-manual' } }).facts).toEqual({});
});

test('carrier does not silently ignore unknown executable fields or mix manual and operations', () => {
  const unit = units[0]!, base = { 名称: unit.name, 描述: unit.quote, 类型: 'utility', 执行模式: 'gm-manual' };
  for (const fields of [{ ...base, damage: '99d6' }, { ...base, sourceOperations: [] },
    { ...base, sourceOperations: [{ id: 'attack' }] }, { ...base, 执行模式: 'accepted' }])
    expect(() => categoryMdFeatureProposal({ unit, fields })).toThrow();
});

test('changed number in original description, omitted/duplicated/reordered IDs and wrong category fail', () => {
  const batch = batches()[0]!;
  for (const mutate of [
    (r: any) => { r.markdown = r.markdown.replace('2d6', '9d6'); },
    (r: any) => { r.unitIds.pop(); },
    (r: any) => { r.unitIds[1] = r.unitIds[0]; },
    (r: any) => { r.unitIds.reverse(); },
    (r: any) => { r.category = 'bonus'; },
    (r: any) => { r.markdown = r.markdown.replace('动作:', '反应:'); },
  ]) {
    const reply = response(batch); mutate(reply);
    expect(() => decodeCategoryMdReply(batch, reply)).toThrow();
  }
});

test('unknown categories, missing rows, duplicate YAML keys and source evidence overrides fail', () => {
  const batch = batches()[0]!;
  for (const markdown of [
    response(batch).markdown + '\n反应: []',
    '动作: []',
    '动作: []\n动作: []',
    response(batch).markdown.replace('    类型:', '    evidence: []\n    类型:'),
  ]) expect(() => decodeCategoryMdReply(batch, { ...response(batch), markdown })).toThrow();
});

test('a valid MD envelope is not semantic acceptance: shared consumer can reject missing operations', async () => {
  let assembled = false, calls = 0;
  await expect(extractCategoryMd({ batches: batches(), call: async batch => { calls++; return response(batch); },
    acceptFeature: () => { throw new Error('UNRESTORED_BASIC_OPERATION'); },
    assemble: () => { assembled = true; return {}; },
  })).rejects.toThrow('UNRESTORED_BASIC_OPERATION');
  expect(assembled).toBe(false); expect(calls).toBe(1);
});

test('provider failure is not retried and never reaches assembly', async () => {
  let calls = 0;
  await expect(extractCategoryMd({ batches: batches(), call: async () => { calls++; throw new Error('fixture transport failure'); },
    acceptFeature: item => item.fields, assemble: () => { throw new Error('must not assemble'); },
  })).rejects.toThrow('fixture transport failure');
  expect(calls).toBe(1);
});

test('successful categories use the same supplied consumer then assemble by source-owned ID', async () => {
  const seen: string[] = [];
  const result = await extractCategoryMd({ batches: batches(), call: async batch => response(batch),
    acceptFeature: item => { seen.push(item.unit.id); return item.fields; }, assemble: all => [...all.keys()],
  });
  expect(result).toEqual({ result: units.map(unit => unit.id), categoryCalls: 3, featureCount: 4 });
  expect(seen).toEqual(units.map(unit => unit.id));
});

test('cancellation and mixed-source/duplicate batches fail without new calls', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const options = { call: async (batch: CategoryMdBatch) => { calls++; return response(batch); }, acceptFeature: (item: any) => item.fields, assemble: () => ({}) };
  await expect(extractCategoryMd({ ...options, batches: batches(), signal: controller.signal })).rejects.toThrow();
  const plan = batches();
  await expect(extractCategoryMd({ ...options, batches: [plan[0]!, plan[0]!] })).rejects.toThrow('BATCH_IDENTITY');
  await expect(extractCategoryMd({ ...options, batches: [plan[0]!, { ...plan[1]!, sourceHash: 'other' }] })).rejects.toThrow('BATCH_IDENTITY');
  expect(calls).toBe(0);
});

test('dropping an entire category is rejected before any request, not hidden by assembly', async () => {
  let calls = 0;
  await expect(extractCategoryMd({ batches: batches().slice(0, 1),
    call: async batch => { calls++; return response(batch); }, acceptFeature: item => item.fields, assemble: () => ({}),
  })).rejects.toThrow('MISSING_CATEGORY');
  expect(calls).toBe(0);
});

test('line-ending representation is tolerated while rule symbols stay protected', () => {
  const batch = batches()[0]!, reply = response(batch);
  expect(decodeCategoryMdReply(batch, { ...reply, markdown: reply.markdown.replace(/\n/g, '\r\n') })).toHaveLength(2);
  expect(() => decodeCategoryMdReply(batch, { ...reply, markdown: reply.markdown.replace('(2d6)', '(2d6+1)') })).toThrow('MD_SOURCE_IDENTITY');
});
