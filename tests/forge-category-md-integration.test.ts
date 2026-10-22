import { afterAll, beforeAll, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { prepareCategoryMdExtraction, runCategoryMdMonsterExtraction } from '@fvtt-json-generator/intake-ai/category-md-extraction';
import { CATEGORY_MD_LABELS, type CategoryMdBatch } from '@fvtt-json-generator/intake-ai/category-md';
import { runStagedMonsterExtraction } from '@fvtt-json-generator/intake-ai/staged-extraction';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { chain, request, requireAcceptedChain } from './helpers/forge-semantic-chain';
import sourceOperations from './fixtures/forge-common-source-operations.json';
import healingCorpus from './fixtures/forge-iterate50-round11-cases.json';
import regenerate from './fixtures/forge-regenerate-healing.json';
import healingReplies from './fixtures/forge-healing-provider-replies.json';
import damageUpgrade from './fixtures/forge-damage-upgrade.json';

// Fixed test answers are declared before either arm runs. Never manufacture B
// replies from the current A output or use the MD template itself as the answer.
const commonHeader = damageUpgrade.case.units[0]!.text;
const attackProof = 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target.';
const hitProof = 'Hit: 7 (1d8+3) piercing damage plus 3 (1d6) fire damage.';
const saveProof = 'Each creature in a 30-foot cone must make a DC 16 Intelligence or Wisdom saving throw (the target chooses).';
const saveDamage = 'A creature takes 7 (2d6) psychic damage on a failed save, or half as much damage on a successful one.';
const opAnswers: Record<string, any[]> = {
  'Barbed Spear (3/Day)': [
    { id: 'primary', name: 'Primary', type: 'attack', relationship: 'primary', attack: { type: 'mwak', toHit: 6, reach: 5 },
      damage: [{ formula: '1d8+3', type: 'piercing', relationship: 'base' }, { formula: '1d6', type: 'fire', relationship: 'additional' }],
      proof: { attack: attackProof, damage: [hitProof, hitProof] } },
    { id: 'follow-up', name: 'Constitution follow-up', type: 'save', relationship: 'follow-up',
      save: { dc: 14, abilities: ['con'], choice: 'single', outcome: 'none' }, proof: { save: 'The target must make a DC 14 Constitution saving throw.' } },
  ],
  'Memory Flare (Recharge 5-6)': [{ id: 'primary', name: 'Primary', type: 'save', relationship: 'primary',
    save: { dc: 16, abilities: ['int', 'wis'], choice: 'target', outcome: 'half' },
    damage: [{ formula: '2d6', type: 'psychic', relationship: 'base' }], aoe: { shape: 'cone', radius: 30 }, targetSpecial: 'Each creature',
    proof: { save: saveProof, damage: [saveDamage], aoe: saveProof, target: saveProof } }],
  'Dull Tap': [{ id: 'primary', name: 'Primary', type: 'attack', relationship: 'primary', attack: { type: 'mwak', toHit: 4, reach: 0 },
    damage: [{ formula: '1', type: 'bludgeoning', relationship: 'base' }],
    proof: { attack: 'Melee Weapon Attack: +4 to hit, reach 0 ft., one creature.', damage: ['Hit: 1 bludgeoning damage.'] } }],
  'Cold Touch': [
    { id: 'primary', name: 'Primary', type: 'attack', relationship: 'primary', attack: { type: 'msak', toHit: 5, reach: 5 },
      damage: [{ formula: '1d6', type: 'radiant', relationship: 'base' }],
      proof: { attack: 'Melee Spell Attack: +5 to hit, reach 5 ft., one creature.', damage: ['Hit: 3 (1d6) radiant damage.'] } },
    { id: 'conditional', name: 'Prone damage (GM)', type: 'damage', relationship: 'follow-up',
      damage: [{ formula: '2d6', type: 'cold', relationship: 'conditional' }], proof: { damage: ['If the target is prone, it takes 7 (2d6) cold damage.'] } },
  ],
};
const multiSource = commonHeader + 'Actions\n' + [sourceOperations.attack, sourceOperations.choice, sourceOperations.fixed].join('\n\n')
  + '\n\nBonus Actions\n' + sourceOperations.unrelated + '\n\nReactions\n' + sourceOperations.conditional + '\n';
const periapt: any = structuredClone(healingCorpus.cases.find(c => c.id === 'r20r-periapt-of-health'));
const cases = [
  { id: 'multi-category', source: multiSource, creature: damageUpgrade.case.creature },
  { id: 'single-heal', source: periapt.source, creature: periapt.creature },
  { id: 'two-heals', source: regenerate.case.source, creature: regenerate.case.creature },
  { id: 'damage-upgrade', source: damageUpgrade.case.source, creature: damageUpgrade.case.creature },
];
let networkAttempts = 0;
const originalFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = Object.assign(async () => {
  networkAttempts++; throw Error('Real network is forbidden in fixed-reply acceptance');
}, { preconnect: originalFetch.preconnect }); });
afterAll(() => { globalThis.fetch = originalFetch; expect(networkAttempts).toBe(0); });

function cleanOperations(operations: readonly any[]): any[] {
  return operations.map(value => {
    const op = structuredClone(value);
    delete op.sourceText; delete op.evidence; delete op.condition; delete op.failureStatuses; delete op.proof.upgrade;
    for (const part of op.damage ?? []) delete part.condition;
    return op;
  });
}
function answers(c: typeof cases[number], name: string): Record<string, any> {
  if (c.id === 'multi-category') return opAnswers[name] ? { sourceOperations: structuredClone(opAnswers[name]) } : {};
  if (c.id === 'single-heal') return { ...structuredClone(periapt.features[0].legacy), uses: structuredClone(periapt.features[0].uses) };
  if (c.id === 'two-heals') {
    const ops = cleanOperations(healingReplies.ordinaryRegenerateRepairedIr.creature.traits[0]!.sourceOperations);
    // This fixed reply includes the standalone printed title, unlike the
    // historical ordinary reply's separate name/body presentation.
    ops[0].proof.healing = 'Regenerate\n' + ops[0].proof.healing;
    return { sourceOperations: ops };
  }
  const feature = damageUpgrade.case.features.find(f => f.name === name)!;
  return feature.operations.length ? { sourceOperations: cleanOperations(feature.operations) } : {};
}
function mdReply(c: typeof cases[number], batch: CategoryMdBatch) {
  const rows = batch.units.map(unit => {
    const facts = answers(c, unit.name), row: Record<string, unknown> = {
      名称: unit.name, 类型: 'utility', 描述: unit.quote, 执行模式: Object.keys(facts).length ? 'native-with-gm' : 'gm-manual',
    };
    if (facts.sourceOperations) row.sourceOperations = facts.sourceOperations;
    if (facts.healing) {
      row.类型 = 'heal'; row.治疗 = { 公式: facts.healing.formula, 类型: facts.healing.type, target: facts.healing.target };
      row.激活 = 'action'; row.使用次数 = facts.uses;
    }
    if (unit.name === 'Barbed Spear (3/Day)') row.使用次数 = { max: 3, period: 'day' };
    if (unit.name === 'Memory Flare (Recharge 5-6)') row.充能 = '5-6';
    return row;
  });
  return { schemaVersion: 1, category: batch.category, unitIds: batch.units.map(unit => unit.id),
    markdown: yaml.dump({ [CATEGORY_MD_LABELS[batch.category]]: rows }, { lineWidth: -1, noRefs: true }) };
}
function baseFacts(c: typeof cases[number]) { return { schemaVersion: 1, creature: structuredClone(c.creature), uncertainties: [] }; }

async function runA(c: typeof cases[number], mutate?: (facts: any, name: string) => void) {
  const calls: string[] = [];
  const result = await chain(c, async () => ({ ir: await runStagedMonsterExtraction(request(c.source), async call => {
    calls.push(call.stage); await call.onAttempt(1);
    if (call.stage === 'base') return baseFacts(c);
    if (call.stage === 'source') throw Error('Fixture must use the common deterministic partition');
    const name = String(call.payload.name), facts = answers(c, name);
    mutate?.(facts, name);
    return { schemaVersion: 1, unitId: call.unitId, mode: Object.keys(facts).length ? 'native-with-gm' : 'manual', facts };
  }, { baseMode: 'facts', featureMode: 'auto' }), calls }));
  return { ...result, observedCalls: calls };
}
async function runB(c: typeof cases[number], mutate?: (reply: any, batch: CategoryMdBatch) => void) {
  const calls: string[] = [], replies: any[] = [];
  const result = await chain(c, async () => {
    const output = await runCategoryMdMonsterExtraction({ request: request(c.source), baseFacts: baseFacts(c), call: async batch => {
      calls.push(batch.category); const reply = mdReply(c, batch); mutate?.(reply, batch); replies.push(structuredClone(reply)); return reply;
    } });
    return { ir: output.ir, calls };
  });
  return { ...result, observedCalls: calls, replies };
}

function saveEvidence(id: string, a: any, b: any, batches: CategoryMdBatch[]) {
  if (!process.env.FORGE_CATEGORY_MD_EVIDENCE_DIR) return;
  const root = resolve(process.env.FORGE_CATEGORY_MD_EVIDENCE_DIR), allowed = resolve('.local/forge-ab-fixed-replies');
  if (root !== allowed) throw Error('Evidence must stay in this task-local directory');
  const folder = resolve(root, id);
  if (!folder.startsWith(root + sep)) throw Error('Invalid evidence case');
  mkdirSync(folder, { recursive: true });
  writeFileSync(resolve(folder, 'source.md'), cases.find(c => c.id === id)!.source);
  writeFileSync(resolve(folder, 'base-facts.json'), JSON.stringify(baseFacts(cases.find(c => c.id === id)!), null, 2));
  for (const batch of batches) {
    writeFileSync(resolve(folder, `B-${batch.category}-template.md`), batch.template);
    writeFileSync(resolve(folder, `B-${batch.category}-request.json`), JSON.stringify(batch, null, 2));
  }
  for (const [arm, result] of [['A', a], ['B', b]] as const) {
    writeFileSync(resolve(folder, `${arm}-result.json`), JSON.stringify(result, null, 2));
    writeFileSync(resolve(folder, `${arm}-ir.json`), JSON.stringify(result.ir, null, 2));
    writeFileSync(resolve(folder, `${arm}-rendered.md`), result.markdown);
    writeFileSync(resolve(folder, `${arm}-actor.json`), JSON.stringify(result.actor, null, 2));
    if (arm === 'B') for (const reply of result.replies) writeFileSync(resolve(folder, `B-${reply.category}-filled.md`), reply.markdown);
  }
}

for (const c of cases) test(`A/B same formal chain: ${c.id}`, async () => {
  const a = await runA(c), b = await runB(c);
  requireAcceptedChain(a); requireAcceptedChain(b);
  const { batches, plan } = prepareCategoryMdExtraction(request(c.source), baseFacts(c));
  expect(b.observedCalls).toEqual(batches.map(batch => batch.category));
  expect(b.replies.flatMap(reply => reply.unitIds).sort()).toEqual(plan.features.map(unit => unit.id).sort());
  expect(batches.every(batch => batch.baseContext === plan.base.quote)).toBe(true);
  expect(b.ir.source).toEqual(a.ir.source);
  expect(b.actor.items.map((item: any) => item.name)).toEqual(a.actor.items.map((item: any) => item.name));
  const acts = (result: any): any[] => result.actor.items.flatMap((item: any) => Object.values<any>(item.system.activities));
  if (c.id === 'multi-category') {
    expect(batches.map(batch => batch.units.length)).toEqual([3, 1, 1]);
    const spear = b.actor.items.find((item: any) => item.name.startsWith('Barbed Spear'));
    expect(spear.system.uses.max).toBe('3');
    expect(Object.values<any>(spear.system.activities).map(activity => activity.type)).toEqual(['attack', 'save']);
    const flare = b.ir.creature.actions.find(feature => feature.name.startsWith('Memory Flare'))!;
    expect(flare.sourceOperations![0]!.save).toMatchObject({ dc: 16, abilities: ['int', 'wis'], choice: 'target', outcome: 'half' });
    expect(flare.recharge).toEqual([5, 6]);
    expect(acts(b).map(activity => activity.type)).toEqual(acts(a).map(activity => activity.type));
  }
  if (c.id === 'single-heal') {
    expect(a.observedCalls).toEqual(['base']); expect(b.observedCalls).toEqual(['trait']);
    expect(acts(b)[0].healing).toMatchObject({ number: 2, denomination: 4, bonus: '2' });
    expect(acts(b)[0].activation.type).toBe('action'); expect(acts(b)[0].target.affects.type).toBe('self');
    expect(b.actor.items[0].system.uses.recovery).toEqual([{ period: 'dawn', type: 'recoverAll' }]);
    expect(acts(b)[0].consumption.targets[0].value).toBe('1');
  }
  if (c.id === 'two-heals') {
    expect(a.observedCalls).toEqual(['base']); expect(acts(b).map(activity => activity.type)).toEqual(['heal', 'heal']);
    expect(acts(b)[0].healing).toMatchObject({ number: 4, denomination: 8, bonus: '15' });
    expect(acts(b)[1].healing.custom.formula).toBe('1');
    expect(acts(b)[1].activation.condition).toContain('at the start of each of its turns');
    expect(acts(b).every(activity => activity.target.affects.type === 'creature' && activity.consumption.targets.length === 0)).toBe(true);
  }
  if (c.id === 'damage-upgrade') {
    expect(a.observedCalls).toEqual(['base']);
    const damage = acts(b).filter(activity => activity.type === 'damage'); expect(damage).toHaveLength(1);
    expect(damage[0].damage.parts[0]).toMatchObject({ number: 2, denomination: 8, types: ['cold', 'fire', 'lightning', 'thunder'] });
    expect(damage[0].activation.condition).toContain(damageUpgrade.case.features[0]!.text);
    expect(damage[0].activation.condition).toContain(damageUpgrade.case.features[1]!.text);
  }
  // The very same verifier must reject wrong generated damage/healing on BOTH arms.
  for (const result of [a, b]) {
    const actor = structuredClone(result.actor);
    const activity = actor.items.flatMap((item: any) => Object.values<any>(item.system.activities)).find((activity: any) => activity.damage?.parts?.length || activity.healing);
    if (activity.damage?.parts?.length) activity.damage.parts[0].number = 99;
    else activity.healing.number = 99;
    expect(verifyMonsterIntake(c.source, result.ir, result.markdown, actor, request(c.source).candidate).findings.some(finding => finding.blocking)).toBe(true);
  }
  saveEvidence(c.id, a, b, batches);
});

for (const mutation of ['dc', 'damage', 'target', 'uses'] as const) test(`wrong MD fact uses A's unchanged source gate: ${mutation}`, async () => {
  const c = cases[0]!;
  const change = (facts: any, name: string) => {
    if (mutation === 'uses' && name.startsWith('Barbed Spear')) facts.uses = { max: 99, period: 'day' };
    if (!name.startsWith('Memory Flare')) return;
    if (mutation === 'dc') facts.sourceOperations[0].save.dc = 99;
    if (mutation === 'damage') facts.sourceOperations[0].damage[0].formula = '99d6';
    if (mutation === 'target') facts.sourceOperations[0].targetSpecial = 'one object';
  };
  const a = await runA(c, change), b = await runB(c, reply => {
    const parsed: any = yaml.load(reply.markdown);
    for (const row of Object.values<any[]>(parsed).flat()) {
      const facts = { sourceOperations: row.sourceOperations, uses: row.使用次数 }; change(facts, row.名称);
      if (facts.uses) row.使用次数 = facts.uses;
    }
    reply.markdown = yaml.dump(parsed);
  });
  expect(a.status).toBe('blocked'); expect(b.status).toBe('blocked');
  // A's OP proposal forbids an explicit resource field at its shape boundary;
  // B's MD permits it and checks the value against that source-owned resource.
  expect(a.code).toBe(mutation === 'uses' ? 'UNSUPPORTED_FIELD' : 'FEATURE_FACT_CONFLICT');
  expect(b.code).toBe('FEATURE_FACT_CONFLICT');
});

test('B does not use manual template rows to recover missing attacks or known healing behind the model', async () => {
  for (const c of [cases[0]!, cases[1]!]) {
    const b = await runB(c, (reply, batch) => { reply.markdown = batch.template; });
    expect(b.status).toBe('blocked'); expect(b.code).toBe('UNRESTORED_BASIC_OPERATION');
  }
});

test('source identity, missing category rows and changed conditions fail without generation', async () => {
  const c = cases[0]!;
  for (const mutate of [
    (reply: any) => { reply.unitIds.pop(); },
    (reply: any) => { reply.markdown = reply.markdown.replace('DC 16', 'DC 99'); },
    (reply: any) => { const parsed: any = yaml.load(reply.markdown); Object.values<any[]>(parsed)[0]!.pop(); reply.markdown = yaml.dump(parsed); },
  ]) {
    const b = await runB(c, mutate); expect(b.status).toBe('blocked'); expect(b.actor).toBeUndefined(); expect(b.observedCalls).toHaveLength(1);
  }
});

test('invalid shared base is rejected before any B category call', async () => {
  const c = cases[0]!, facts = baseFacts(c); facts.creature.abilities.str = 99;
  let calls = 0;
  await expect(runCategoryMdMonsterExtraction({ request: request(c.source), baseFacts: facts, call: async () => { calls++; return {}; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('MD spellcasting profile goes through A spell-group validation, not a Utility placeholder', async () => {
  const quote = 'The creature casts the following spells, using Wisdom as the spellcasting ability.';
  const source = commonHeader + 'Traits\nSpellcasting. ' + quote + '\nAt Will: Light\n';
  const c = { id: 'spell-profile', source, creature: damageUpgrade.case.creature };
  const run = (ability: string) => runCategoryMdMonsterExtraction({ request: request(source), baseFacts: baseFacts(c), call: async batch => ({
    schemaVersion: 1, category: batch.category, unitIds: batch.units.map(unit => unit.id),
    markdown: yaml.dump({ 特性: batch.units.map(unit => ({ 名称: unit.name, 类型: 'utility', 描述: unit.quote,
      执行模式: 'native', 施法属性: ability, 施法属性引文: quote })) }),
  }) });
  const { ir } = await run('wis');
  expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
  expect(ir.creature.spellcasting).toHaveLength(1); expect(ir.creature.spellcasting![0]!.ability).toBe('wis');
  expect(ir.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.originalName).toBe('Light');
  expect(ir.creature.traits).toEqual([]);
  await expect(run('cha')).rejects.toThrow('UNPROVEN_STAGED_SPELLCASTING_ABILITY');
  await expect(runCategoryMdMonsterExtraction({ request: request(source), baseFacts: baseFacts(c), call: async batch => ({
    schemaVersion: 1, category: batch.category, unitIds: batch.units.map(unit => unit.id),
    markdown: yaml.dump({ 特性: batch.units.map(unit => ({ 名称: unit.name, 类型: 'utility', 描述: unit.quote,
      执行模式: 'native-with-gm', sourceOperations: opAnswers['Dull Tap'] })) }),
  }) })).rejects.toThrow('UNSUPPORTED_FIELD');
});
