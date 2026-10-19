import { describe, expect, test } from 'bun:test';
import captured from './fixtures/forge-gazer-forced-movement-intake.json';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { compileEncounterSelection, renderEncounterActorSource, manualForcedMovementRequirements } from '@fvtt-json-generator/intake-ai/encounter-automation';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { normalizeMonsterSourceFacts } from '@fvtt-json-generator/intake-ai/source-facts';

const original = captured.ir as MonsterIntakeIR;
function selection(source: string, ir: MonsterIntakeIR): any {
  const feature = ir.creature.actions[4]!;
  const quote = ir.claims.find(claim => claim.path === '/creature/actions/4')!.evidence[0]!.quote;
  return { version: 2, name: 'Source push adjudication', notes: 'GM resolves forced movement from the source after the native save.',
    manualSteps: ['GM manually moves the failed target; there is no automatic movement.'], legendaryRecovery: [],
    rules: [{ id: 'push', kind: 'gm-manual', actorKey: 'actor-1', featureName: feature.name, section: 'action', quote,
      parameters: {}, gmSteps: ['Roll the native saving throw for the target.', `On failure GM manually applies the complete source rule: ${feature.description}`] }] };
}
async function generate(ir = structuredClone(original), source = captured.source, editSelection?: (value: any) => void) {
  let automationCalls = 0, reviewCalls = 0;
  const forbidden = async (): Promise<never> => { reviewCalls++; throw new Error('Paid review and extraction must remain off in this saved-input regression.'); };
  const result = await generateEncounterFromHumanMarkdown({ source, label: 'Saved Gazer push regression', reviewPolicy: 'deferred',
    outputLanguage: 'source', drafts: [{ key: 'actor-1', source, ir }], draftParentHash: captured.provenance.resultSha256,
    provider: { providerName: 'saved-regression', extractionModel: 'offline', reviewModel: 'disabled', discover: forbidden, extract: forbidden, repair: async () => ir, review: forbidden },
    automationProvider: { generate: async request => { automationCalls++; const value = selection(source, ir); editSelection?.(value); return compileEncounterSelection(value, request); }, review: forbidden } });
  return { ...result, automationCalls, reviewCalls };
}

describe('source-bound failed-save forced movement', () => {
  test('complete exact rule body without title or numbering remains a valid final source binding', async () => {
    const result = await generate(structuredClone(original), captured.source, value => {
      value.rules[0].quote = value.rules[0].quote.replace(/^4\. Force Ray\. /u, '');
    });
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.prepared).toBeDefined();
    expect(result.reviewCalls).toBe(0);
  });
  test('saved Gazer IR reaches GM preparation while preserving the native STR/DC12 save', async () => {
    const before = structuredClone(original);
    const plain = await convertMarkdownContentToJson({ content: renderEncounterActorSource(original, [], captured.source), fvttVersion: '14', effectProfile: 'core', translationService: null });
    expect(plain.verification?.mechanicsCoverage.some(entry => entry.kind === 'save' && entry.status === 'literal-only')).toBe(true);
    const result = await generate();
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.prepared).toBeDefined();
    expect(result.automationCalls).toBe(1);
    expect(result.reviewCalls).toBe(0);
    expect(original).toEqual(before);
    const actor: any = result.prepared!.actors[0]!.artifact;
    const normalizedBaseline=structuredClone(original);
    normalizeMonsterSourceFacts(normalizedBaseline,captured.source,{start:0,end:captured.source.length});
    const baseline = await convertFinalActorSource(buildForgeActorRequest({content:renderEncounterActorSource(normalizedBaseline, [], captured.source),displayName:'Gazer',requestId:'forced-movement-baseline',fvttVersion:'14.364',systemVersion:'5.3.3'}));
    if (!('result' in baseline) || !('artifact' in baseline.result)) throw new Error('Formal baseline failed.');
    const plainActor: any = baseline.result.artifact;
    const item = actor.items.find((item: any) => item.name === 'Force Ray');
    const oldItem = plainActor.items.find((item: any) => item.name === 'Force Ray');
    expect(actor.items.filter((item: any) => item.name !== 'Force Ray')).toEqual(plainActor.items.filter((item: any) => item.name !== 'Force Ray'));
    const native = Object.values(item.system.activities).filter((activity: any) => activity.type === 'save') as any[];
    const oldNative: any = Object.values(oldItem.system.activities)[0];
    // The normalized save outcome participates in its stable ID. Compare the
    // entire activity with that one deterministic identity difference explicit.
    expect(native).toEqual([{...oldNative,_id:native[0]._id}]);
    expect(native[0]._id).toMatch(/^[a-z0-9]{16}$/u);
    expect(native[0].save).toEqual({ability:['str'],dc:{calculation:'',formula:'12'}});
    expect(item.effects).toEqual([]);
    const manual = Object.values(item.system.activities).filter((activity: any) => activity.flags?.fvttJsonGenerator?.behaviorOperation) as any[];
    expect(manual).toHaveLength(1);
    expect(manual[0].flags.fvttJsonGenerator.behaviorOperation.kind).toBe('manual');
    expect(manual[0].effects ?? []).toEqual([]);
    expect(manual[0].description.chatFlavor.replace(/\s+/gu, ' ')).toContain(selection(captured.source, original).rules[0].quote.replace(/\s+/gu, ' '));
    // Full Item shape: explicit identity changes and the declared manual
    // behavior/utility activity are the only differences.
    const restored = structuredClone(item);
    delete restored.system.activities[manual[0]._id];
    delete restored.system.activities[native[0]._id];
    restored.system.activities[oldNative._id] = {...native[0],_id:oldNative._id};
    delete restored.flags.fvttJsonGenerator.behaviorMechanics;
    expect(restored).toEqual({...oldItem,_id:item._id});
    expect(item._id).toMatch(/^[a-z0-9]{16}$/u);
    expect(result.report.actors[0]!.generation!.findings.map(finding => finding.code)).toEqual(['ACTOR_FORCED_MOVEMENT_REQUIRES_GM']);
    const bundle: any = structuredClone(result.prepared!.bundle);
    bundle.macros[0].covers = [];
    await expect(prepareForgeEncounter(serializeForgeEncounterPackage(bundle))).rejects.toThrow('唯一配套宏');
    const damaged = structuredClone(actor);
    const damagedItem = damaged.items.find((item: any) => item.name === 'Force Ray');
    damagedItem.system.activities[manual[0]._id].description.chatFlavor = 'GM resolves the push.';
    const findings = verifyMonsterIntake(captured.source, original, result.prepared!.bundle.actors[0]!.source, damaged).findings;
    expect(findings.some(finding => finding.code === 'ACTOR_FORCED_MOVEMENT_UNBOUND')).toBe(true);
  });

  test.each([
    ['fixed-distance creature, DC-first Dexterity save', 'The creature must make a DC 14 Dexterity saving throw. FAILURE: The creature is pushed 10 feet away from the source.', 14, 'dex', 'Repelling Burst'],
    ['wrapped save header and rolled distance', 'The target must make a\nSTRENGTH SAVING THROW: DC 12.\nFAILURE: The target is pushed 20 (2d4 x 5) feet away from the gazer.', 12, 'str', 'Gust'],
  ])('%s stays native plus manual without a creature/feature-name exception', async (_label, description, dc, ability, name) => {
    const data = variant(description, Number(dc), String(ability), String(name));
    const result = await generate(data.ir, data.source);
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.automationCalls).toBe(1);
    expect(result.reviewCalls).toBe(0);
    const item: any = (result.prepared!.actors[0]!.artifact.items as any[]).find(item => item.name === name);
    const native = Object.values(item.system.activities).filter((activity: any) => activity.type === 'save') as any[];
    expect(native).toHaveLength(1);
    expect(native[0].save).toEqual({ability:[ability],dc:{calculation:'',formula:String(dc)}});
    expect(native[0].description.chatFlavor.replace(/\s+/gu, ' ')).toBe(String(description).replace(/\s+/gu, ' '));
    expect(item.effects).toEqual([]);
  });

  test('truncated, conflicting, negative and conditional source never enters the new manual handoff', async () => {
    for (const description of [
      original.creature.actions[4]!.description.replace(' feet away from the gazer', ''),
      original.creature.actions[4]!.description.replace('FAILURE:', 'FAILURE BY 5 OR MORE:'),
      original.creature.actions[4]!.description.replace('is pushed', 'is not pushed'),
      original.creature.actions[4]!.description.replace('away from', 'toward'),
      original.creature.actions[4]!.description.replace('the gazer.', 'the gazer but only if it chooses.'),
      original.creature.actions[4]!.description + ' SUCCESS: The target is pulled 5 feet.',
    ]) {
      const data = variant(description);
      expect(manualForcedMovementRequirements(data.ir, data.source)).toEqual([]);
      const result = await generate(data.ir, data.source);
      expect(result.prepared).toBeUndefined();
      expect(result.report.status).toBe('needs_review');
      expect(result.automationCalls).toBe(0);
    }
    for (const edit of [
      (ir: MonsterIntakeIR) => { ir.creature.actions[4]!.save!.dc = 13; },
      (ir: MonsterIntakeIR) => { ir.creature.actions[4]!.save!.ability = 'wis'; },
      (ir: MonsterIntakeIR) => { ir.claims = ir.claims.filter(claim => claim.path !== '/creature/actions/4'); },
      (ir: MonsterIntakeIR) => { ir.claims.push({path:'/creature/actions/4/save/dc',valueKind:'explicit',confidence:'high',value:13,evidence:structuredClone(ir.claims.find(claim => claim.path === '/creature/actions/4')!.evidence)}); },
      (ir: MonsterIntakeIR) => { ir.creature.actions[4]!.description = ir.creature.actions[4]!.description.replace(' (1d10 x 5)', ''); },
    ]) {
      const ir = structuredClone(original); edit(ir);
      expect(manualForcedMovementRequirements(ir, captured.source)).toEqual([]);
      const result = await generate(ir);
      expect(result.prepared).toBeUndefined();
      expect(result.report.status).toBe('needs_review');
      expect(result.automationCalls).toBe(0);
    }
  });

  test('missing, partial, wrong carrier and non-manual final rules remain blocked', async () => {
    for (const edit of [
      (value: any) => { value.rules = []; },
      (value: any) => { value.rules[0].quote = 'FAILURE: The target is\npushed 25 (1d10 x 5) feet away from the gazer.'; },
      (value: any) => { value.rules[0].actorKey = 'actor-2'; },
      (value: any) => { value.rules[0].featureName = 'Fear Ray'; },
      (value: any) => { value.rules[0].kind = 'save-failure-effect'; value.rules[0].parameters = {effect:'blinded',expiry:'next-source-turn-start',minFailureMargin:1,removeOnDamage:false}; },
    ]) {
      const result = await generate(structuredClone(original), captured.source, edit);
      expect(result.prepared).toBeUndefined();
      expect(result.report.status).not.toBe('ready_for_gm_review');
      expect(result.automationCalls).toBe(1);
      expect(result.reviewCalls).toBe(0);
    }
  });
});

function variant(description: string, dc = 12, ability = 'str', name = 'Force Ray') {
  const ir = structuredClone(original);
  const ref = ir.claims.find(claim => claim.path === '/creature/actions/4')!.evidence[0]!;
  const oldStart = ref.start, oldEnd = ref.end, quote = `4. ${name}. ${description}`;
  const source = captured.source.slice(0, oldStart) + quote + captured.source.slice(oldEnd);
  const delta = quote.length - (oldEnd - oldStart);
  const walk = (value: any): void => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.start === 'number' && typeof value.end === 'number' && typeof value.quote === 'string') {
      if (value.start >= oldEnd) value.start += delta;
      if (value.end >= oldEnd) value.end += delta;
      value.quote = source.slice(value.start, value.end);
    }
    for (const child of Object.values(value)) walk(child);
  };
  walk(ir);
  const feature = ir.creature.actions[4]!;
  feature.name = name; feature.englishName = name; feature.description = description;
  feature.save = {dc,ability:ability as any};
  ir.claims.find(claim => claim.path === '/creature/actions/4')!.value = structuredClone(feature);
  ir.source.sha256 = hashSource(source);
  ir.source.length = source.length;
  return {ir,source};
}
