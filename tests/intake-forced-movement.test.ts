import { describe, expect, test } from 'bun:test';
import captured from './fixtures/forge-gazer-forced-movement-intake.json';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { compileEncounterSelectionSourceAudit as compileEncounterSelection, renderEncounterActorSource, manualForcedMovementRequirements } from '@fvtt-json-generator/intake-ai/encounter-automation';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows';
import { auditMonsterIntakeSourceProjection as verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';

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
    const value=selection(captured.source,original);value.rules[0].quote=value.rules[0].quote.replace(/^4\. Force Ray\. /u,'');
    const compiled=compileEncounterSelection(value,{source:captured.source,actors:[{key:'actor-1',source:captured.source,ir:structuredClone(original),artifact:result.prepared!.actors[0]!.artifact}]});
    expect(compiled.rules[0]!.quote).toBe(value.rules[0].quote);
    expect(compiled.rules[0]!.gmSteps.join(' ')).toContain('25 (1d10 x 5) feet away');
  });
  test('saved Gazer IR retains the native STR/DC12 save and complete manual rule without an automatic compiler call', async () => {
    const before=structuredClone(original),result=await generate();
    expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared).toBeDefined();
    expect(result.automationCalls).toBe(0);expect(result.reviewCalls).toBe(0);expect(original).toEqual(before);
    const actor:any=result.prepared!.actors[0]!.artifact,item=actor.items.find((item:any)=>item.name==='Force Ray');
    const native=Object.values<any>(item.system.activities).filter(activity=>activity.type==='save');
    expect(native).toHaveLength(1);expect(native[0].save).toEqual({ability:['str'],dc:{calculation:'',formula:'12'}});
    expect(item.system.description.value.replace(/\s+/gu,' ')).toContain(original.creature.actions[4]!.description.replace(/\s+/gu,' '));
    expect(result.prepared!.macros).toEqual([]);expect(result.report.actors[0]!.generation!.candidateAvailable).toBe(true);
    const request={source:captured.source,actors:[{key:'actor-1',source:captured.source,ir:structuredClone(original),artifact:actor}]};
    const compiled=compileEncounterSelection(selection(captured.source,original),request);
    expect(compiled.selection!.rules[0]!.kind).toBe('gm-manual');expect(compiled.rules[0]!.quote).toContain('25 (1d10 x 5) feet away');
    const prepared=await convertMarkdownContentToJson({content:renderEncounterActorSource(original,compiled.rules.map((rule,index)=>({...rule,mechanicId:`manual-${index+1}`})),captured.source),fvttVersion:'14',effectProfile:'core',translationService:null});
    const explicit:any=(prepared.rawJson as any).items.find((entry:any)=>entry.name==='Force Ray');
    const helpers=Object.values<any>(explicit.system.activities).filter(activity=>activity.flags?.fvttJsonGenerator?.behaviorOperation);
    expect(helpers).toHaveLength(1);expect(helpers[0].effects??[]).toEqual([]);
    expect(helpers[0].description.chatFlavor.replace(/\s+/gu,' ')).toContain(compiled.rules[0]!.quote.replace(/\s+/gu,' '));
    const damaged=structuredClone(prepared.rawJson) as any;const changed=damaged.items.find((entry:any)=>entry.name==='Force Ray');
    changed.system.activities[helpers[0]._id].description.chatFlavor='GM resolves the push.';
    expect(verifyMonsterIntake(captured.source,original,renderEncounterActorSource(original,compiled.rules.map((rule,index)=>({...rule,mechanicId:`manual-${index+1}`})),captured.source),damaged).findings)
      .toContainEqual(expect.objectContaining({code:'ACTOR_FORCED_MOVEMENT_UNBOUND'}));
  });

  test.each([
    ['fixed-distance creature, DC-first Dexterity save', 'The creature must make a DC 14 Dexterity saving throw. FAILURE: The creature is pushed 10 feet away from the source.', 14, 'dex', 'Repelling Burst'],
    ['wrapped save header and rolled distance', 'The target must make a\nSTRENGTH SAVING THROW: DC 12.\nFAILURE: The target is pushed 20 (2d4 x 5) feet away from the gazer.', 12, 'str', 'Gust'],
  ])('%s stays native plus manual without a creature/feature-name exception', async (_label, description, dc, ability, name) => {
    const data = variant(description, Number(dc), String(ability), String(name));
    const result = await generate(data.ir, data.source);
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.automationCalls).toBe(0);
    expect(result.reviewCalls).toBe(0);
    const item: any = (result.prepared!.actors[0]!.artifact.items as any[]).find(item => item.name === name);
    const native = Object.values(item.system.activities).filter((activity: any) => activity.type === 'save') as any[];
    expect(native).toHaveLength(1);
    expect(native[0].save).toEqual({ability:[ability],dc:{calculation:'',formula:String(dc)}});
    expect(native[0].description.chatFlavor.replace(/<[^>]*>/gu,' ').replace(/\s+/gu, ' ').trim()).toBe(String(description).replace(/\s+/gu, ' '));
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
      expect(result.prepared).toBeDefined();
      expect(result.prepared!.macros).toEqual([]);
      expect(result.report.actors[0]!.generation!.candidateAvailable).toBe(true);
      expect(result.report.status).toBe('ready_for_gm_review');
      expect(result.report.findings.length).toBeGreaterThan(0);
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
      expect(result.prepared).toBeDefined();
      expect(result.prepared!.macros).toEqual([]);
      expect(result.report.actors[0]!.generation!.candidateAvailable).toBe(true);
      expect(result.report.status).toBe('ready_for_gm_review');
      expect(result.report.findings.length).toBeGreaterThan(0);
      expect(result.automationCalls).toBe(0);
    }
  });

  test('missing final rules remain unmet and incompatible rules are rejected without losing the Actor', async () => {
    for (const edit of [
      (value: any) => { value.rules = []; },
      (value: any) => { value.rules[0].quote = 'FAILURE: The target is\npushed 25 (1d10 x 5) feet away from the gazer.'; },
      (value: any) => { value.rules[0].actorKey = 'actor-2'; },
      (value: any) => { value.rules[0].featureName = 'Fear Ray'; },
      (value: any) => { value.rules[0].kind = 'save-failure-effect'; value.rules[0].parameters = {effect:'blinded',expiry:'next-source-turn-start',minFailureMargin:1,removeOnDamage:false}; },
    ]) {
      const value=selection(captured.source,original);edit(value);
      const plain=await convertMarkdownContentToJson({content:renderEncounterActorSource(original,[],captured.source),fvttVersion:'14',effectProfile:'core',translationService:null});
      const compile=()=>compileEncounterSelection(value,{source:captured.source,actors:[{key:'actor-1',source:captured.source,ir:structuredClone(original),artifact:plain.rawJson}]});
      if(value.rules.length===0){expect(compile().rules).toEqual([]);expect(manualForcedMovementRequirements(original,captured.source)).toHaveLength(1);}
      else expect(compile).toThrow();
      const result = await generate(structuredClone(original), captured.source, edit);
      expect(result.prepared).toBeDefined();
      expect(result.prepared!.macros).toEqual([]);
      expect(result.report.actors[0]!.generation!.candidateAvailable).toBe(true);
      expect(result.report.status).toBe('ready_for_gm_review');
      expect(result.automationCalls).toBe(0);
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
