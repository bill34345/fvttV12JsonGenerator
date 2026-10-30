import { describe, expect, test } from 'bun:test';
import { analyzeBrowserActorIntakeDraft, repairBrowserActorIntake } from '@fvtt-json-generator/forge-browser-runtime/ai';
import type { MonsterIntakeAiProvider, MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { compileEncounterSelection } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { auditMonsterIntakeSource } from '@fvtt-json-generator/intake-ai/validator';
import { normalizeMonsterSourceFacts } from '@fvtt-json-generator/intake-ai/source-facts';
import { MonsterIntakeProviderError } from '@fvtt-json-generator/intake-ai/provider';
import {bindSourceOperations,sourceOperationClauses} from '@fvtt-json-generator/models/source-operations';
import captured from './fixtures/forge-target-choice-intake.json';
import freshCaptured from './fixtures/forge-target-choice-fresh-intake.json';
import combinedCaptured from './fixtures/forge-target-choice-combined-intake.json';

const noModel = async (): Promise<never> => { throw new Error('target-choice replay must not call a model'); };
const provider: MonsterIntakeAiProvider = {
  providerName: 'captured-offline', extractionModel: 'disabled', reviewModel: 'disabled',
  discover: noModel, extract: noModel, repair: noModel, review: noModel,
};
const original = captured.ir as MonsterIntakeIR;
const freshOriginal = freshCaptured.ir as unknown as MonsterIntakeIR;
const combinedOriginal = combinedCaptured.ir as unknown as MonsterIntakeIR;
function analyzeDefault(ir: MonsterIntakeIR = structuredClone(original), source = captured.source) {
  return analyzeBrowserActorIntakeDraft({ source, sourceName: 'Captured target choice', requestId: 'target-choice-replay',
    fvttVersion: '14.364', systemVersion: '5.3.3' }, ir, provider);
}

function auditSource(ir:MonsterIntakeIR=structuredClone(original),source=captured.source){
  const normalized=structuredClone(ir);
  normalizeMonsterSourceFacts(normalized,source,{start:0,end:source.length});
  const audit=auditMonsterIntakeSource(source,normalized);
  return {...audit,ir:normalized};
}

// Test-authored typed re-extraction for the explicit offline audit. Saved
// proposals stay unchanged; the default draft never derives these operations.
function reextractChoice(ir:MonsterIntakeIR,source=captured.source):MonsterIntakeIR{
  const next=structuredClone(ir),feature=next.creature.actions[3]!,span=next.coverage.find(entry=>entry.claimPaths.includes('/creature/actions/3'))!,parent=source.slice(span.start,span.end).trim(),clauses=sourceOperationClauses(parent),radius=Number(/(\d+)-\s*foot Emanation/iu.exec(parent)![1]);
  feature.description=parent;feature.evidence=[{start:span.start,end:span.end,quote:source.slice(span.start,span.end)}];feature.executionMode='native-with-gm';feature.activityType='utility';feature.nativeRuleText=parent;feature.manualRemainder=parent;
  feature.sourceOperations=bindSourceOperations(parent,[{id:'choice',name:'Target choice Save',type:'save',relationship:'primary',save:{dc:15,abilities:['int','wis'],choice:'target',outcome:'none'},aoe:{shape:'radius',radius},proof:{save:clauses.find(clause=>clause.includes('DC 15'))!,aoe:clauses.find(clause=>clause.includes('Emanation'))!}}],span.start+span.quote.indexOf(parent));
  delete feature.save;delete feature.aoe;delete feature.appliedConditions;return next;
}
function auditRestored(ir:MonsterIntakeIR,source=captured.source){return auditSource(reextractChoice(ir,source),source);}

// Change the source and every exact evidence offset together, so negative cases
// test the actual rule boundary rather than merely failing a stale source hash.
function sourceVariant(from: string, to: string, base = original) {
  const source = captured.source.replaceAll(from, to);
  const starts: number[] = [];
  for (let at = captured.source.indexOf(from); at >= 0; at = captured.source.indexOf(from, at + from.length)) starts.push(at);
  const shift = (offset: number) => offset + starts.filter(start => start + from.length <= offset).length * (to.length - from.length);
  const visit = (value: any): any => {
    if (typeof value === 'string') return value.replaceAll(from, to);
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    if (typeof value.start === 'number' && typeof value.end === 'number' && typeof value.quote === 'string') {
      next.start = shift(value.start);
      next.end = shift(value.end);
      expect(source.slice(next.start as number, next.end as number)).toBe(next.quote);
    }
    return next;
  };
  const ir = visit(base) as MonsterIntakeIR;
  ir.source = { sha256: hashSource(source), length: source.length };
  return { ir, source };
}

function expectBlocked(ir: MonsterIntakeIR, source = captured.source) {
  const result = auditSource(ir, source);
  expect(result.blocking.length).toBeGreaterThan(0);
  expect(result.findings.some(finding => finding.blocking && finding.path.startsWith('/creature/actions/3'))).toBe(true);
}

describe('explicit offline target-choice source audit and typed re-extraction', () => {
  test('the default draft keeps every captured Save profile and model uncertainty without deriving target choices',()=>{
    for(const ir of [original,freshOriginal,combinedOriginal]){
      const before=structuredClone(ir),result=analyzeDefault(ir);
      expect(result.ir!.creature.actions[3]!.save).toEqual(before.creature.actions[3]!.save);
      expect(result.ir!.creature.actions[3]!.sourceOperations).toBeUndefined();
      expect(result.ir!.uncertainties.slice(0,before.uncertainties.length)).toEqual(before.uncertainties);
      expect(result.ir!.uncertainties.slice(before.uncertainties.length).every(finding=>finding.code==='FIELD_PROJECTION_INCOMPLETE'&&finding.blocking===false&&['/creature/identity/alignment','/creature/identity/creatureTypeCustom'].includes(finding.path))).toBe(true);
      expect(result.findings).toContainEqual(expect.objectContaining({code:'INVALID_STRUCTURE',path:'/creature/actions/4/appliedConditions/0/statuses/0'}));
      expect(result.calls).toEqual({discovery:0,extraction:0,repair:0,review:0});
      expect(ir).toEqual(before);
    }
  });
  test('explicit audit diagnoses combined ability text and validates a separate typed re-extraction', () => {
    const before = structuredClone(combinedOriginal);
    expect(auditMonsterIntakeSource(combinedCaptured.source, combinedOriginal).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_FEATURE_SAVE_ABILITY', path: '/creature/actions/3/save/ability',
    }));
    expect(auditSource(combinedOriginal).blocking.length).toBeGreaterThan(0);
    const restored=reextractChoice(combinedOriginal),result = auditSource(restored);
    expect(result.blocking).toEqual([]);
    const expected = structuredClone(restored.creature);
    // The existing definition-restoration step still runs on this raw extraction.
    expected.biography = `${expected.biography}\n\n${captured.source.split('## Referenced definitions from the same PDF\n\n')[1]!.trim()}`;
    expect(result.ir!.creature).toEqual(expected);
    expect(result.ir!.claims.filter(claim => claim.path === '/creature/actions/3'))
      .toEqual(combinedOriginal.claims.filter(claim => claim.path === '/creature/actions/3'));
    expect(result.ir!.coverage.slice(0, combinedOriginal.coverage.length)).toEqual(combinedOriginal.coverage);
    expect(result.ir!.coverage.slice(combinedOriginal.coverage.length)).toHaveLength(2);
    for (const definition of result.ir!.coverage.slice(combinedOriginal.coverage.length)) {
      expect(definition.claimPaths).toEqual(['/creature/biography']);
      expect(definition.classification).toBe('mechanical');
      expect(captured.source.slice(definition.start, definition.end)).toBe(definition.quote);
    }
    expect(combinedOriginal).toEqual(before);
    expect(auditSource(result.ir!).ir).toEqual(result.ir);
  });
  test('boundary whitespace alone does not change the proven complete source span', () => {
    const ir = structuredClone(freshOriginal);
    const coverage = ir.coverage.find(entry => entry.claimPaths.includes('/creature/actions/3'))!;
    coverage.end++; coverage.quote = captured.source.slice(coverage.start, coverage.end);
    expect(coverage.quote.endsWith('\n')).toBe(true);
    expect(auditRestored(ir).blocking).toEqual([]);
  });
  test('only source-present numeric unit line joins are equivalent, with any distance', () => {
    const joined = structuredClone(freshOriginal);
    joined.creature.actions[3]!.description = joined.creature.actions[3]!.description.replace(/15-\s+foot/u, '15-foot');
    expect(auditRestored(joined).blocking).toEqual([]);
    const changed = sourceVariant('15-', '25-', joined);
    expect(auditRestored(changed.ir, changed.source).blocking).toEqual([]);
    const wrong = structuredClone(joined);
    wrong.creature.actions[3]!.description = wrong.creature.actions[3]!.description.replace('15-foot', '150-foot');
    expectBlocked(wrong);
  });
  test('combined ability text still requires typed re-extraction of only the two source-proved choices', () => {
    for (const ability of ['intelligence or wisdom', 'Wisdom or Intelligence']) {
      const ir = structuredClone(freshOriginal); (ir.creature.actions[3]!.save as any).ability = ability;
      expect(auditSource(ir).blocking.length).toBeGreaterThan(0);expect(auditRestored(ir).blocking).toEqual([]);
    }
    for (const ability of ['intelligence and wisdom', 'intelligence or charisma', 'wis', 'intelligence or wisdom or charisma']) {
      const ir = structuredClone(combinedOriginal); (ir.creature.actions[3]!.save as any).ability = ability;
      expectBlocked(ir);
    }
  });
  test('combined shape cannot hide missing words, changed chooser, DC, negation or field conflicts', () => {
    const missing = structuredClone(combinedOriginal);
    missing.creature.actions[3]!.description = missing.creature.actions[3]!.description.replace(' (Save Ends at end of turn).', '.');
    expectBlocked(missing);
    for (const replacement of ['', '(Caster’s Choice) DC 15.', '(Target’s Choice) DC 15. The GM chooses Wisdom instead.',
      '(Target’s Choice) DC 15. This is not the target’s choice.']) {
      const data = sourceVariant('(Target’s Choice) DC 15.', replacement, combinedOriginal);
      expectBlocked(data.ir, data.source);
    }
    const wrongDc = structuredClone(combinedOriginal); wrongDc.creature.actions[3]!.save!.dc = 16;
    expectBlocked(wrongDc);
    const conflict = structuredClone(combinedOriginal);
    conflict.claims.push({path: '/creature/actions/3/save/ability', value: 'wis', valueKind: 'explicit', confidence: 'high',
      evidence: structuredClone(conflict.claims.find(claim => claim.path === '/creature/actions/3')!.evidence)});
    expectBlocked(conflict);
    expect(auditSource(conflict).ir!.creature.actions[3]!.save).toEqual(conflict.creature.actions[3]!.save);
  });
  test('boundary equivalence does not accept clipped, cross-feature or fabricated evidence', () => {
    for (const mode of ['clipped', 'next-feature', 'fabricated']) {
      const ir = structuredClone(combinedOriginal);
      const coverage = ir.coverage.find(entry => entry.claimPaths.includes('/creature/actions/3'))!;
      if (mode === 'clipped') coverage.end -= 12;
      if (mode === 'next-feature') coverage.end += 30;
      coverage.quote = captured.source.slice(coverage.start, coverage.end);
      if (mode === 'fabricated') coverage.quote = coverage.quote.replace('Wisdom', 'Charisma');
      expectBlocked(ir);
    }
  });
  test('repair failure readback preserves only safe schema diagnostics, with one bounded attempt', async () => {
    for (const path of ['/operations', '/secret-value']) {
      const ir = structuredClone(combinedOriginal); ir.creature.actions[3]!.save!.dc = 16;
      let repairs = 0;
      const result = await repairBrowserActorIntake({source: captured.source, sourceName: 'Safe diagnostic',
        requestId: 'safe-diagnostic', fvttVersion: '14.364', systemVersion: '5.3.3'}, analyzeDefault(ir), {
        ...provider, repair: async () => { repairs++; throw new MonsterIntakeProviderError('invalid_response', 'secret-value', {
          diagnostic: {stage: 'repair-envelope', path, expected: 'array<=64', actual: 'string'},
        }); },
      });
      expect(result.status).toBe('needs_review');
      expect(result.ir).toEqual(analyzeDefault(ir).ir);
      expect(repairs).toBe(1);
      const finding = result.findings.find(entry => entry.code === 'REPAIR_INVALID_RESPONSE')!;
      expect(finding.blocking).toBe(true);
      if (path === '/operations') expect(finding.message).toContain('repair-envelope at /operations; expected array<=64; got string');
      else expect(finding.message).toBe('AI provider returned an invalid schema response.');
      expect(JSON.stringify(result)).not.toContain('secret-value');
    }
  });
  test('explicit re-extraction validates target-selected INT/WIS operations without rewriting the captured proposal', () => {
    const before = structuredClone(original);
    expect(auditSource(original).blocking.length).toBeGreaterThan(0);const restored=reextractChoice(original),result = auditSource(restored);
    expect(result.findings.filter(finding => finding.blocking)).toEqual([]);
    expect(result.blocking).toEqual([]);
    const expected = structuredClone(restored.creature);
    expect(result.ir?.creature).toEqual(expected);
    expect(result.ir?.claims).toEqual(original.claims);
    expect(result.ir?.coverage).toEqual(original.coverage);
    expect(original).toEqual(before);
    expect(result.ir?.uncertainties[0]?.code).toBe('SOURCE_VERIFIED_TARGET_CHOICE_MANUAL');
    expect(auditSource(result.ir!).ir).toEqual(result.ir);
  });

  test('fresh missing-ability Save is rejected by IR validation before projection', () => {
    expect(auditMonsterIntakeSource(freshCaptured.source, freshOriginal).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_FEATURE_SAVE_ABILITY', path: '/creature/actions/3/save/ability',
    }));
  });
  test('native Save schema rejects missing, invalid or multiple abilities and missing DC', () => {
    for (const ability of [undefined, null, '', 'undefined', 'wisdom', ['int', 'wis']]) {
      const ir = structuredClone(freshOriginal);
      (ir.creature.actions[3]!.save as any).ability = ability;
      expect(auditMonsterIntakeSource(captured.source, ir).blocking).toContainEqual(expect.objectContaining({
        code: 'INVALID_FEATURE_SAVE_ABILITY', path: '/creature/actions/3/save/ability',
      }));
    }
    const missing = structuredClone(freshOriginal); delete missing.creature.actions[3]!.save;
    expect(auditMonsterIntakeSource(captured.source, missing).blocking).toContainEqual(expect.objectContaining({ code: 'INVALID_FEATURE_SAVE' }));
    const dc = structuredClone(freshOriginal); (dc.creature.actions[3]!.save as any).dc = undefined;
    expect(auditMonsterIntakeSource(captured.source, dc).blocking).toContainEqual(expect.objectContaining({ code: 'INVALID_FEATURE_SAVE_DC' }));
  });
  test('explicit offline restoration binds the fresh choice shape to its exact source and claims', () => {
    const before = structuredClone(freshOriginal);
    const restored=reextractChoice(freshOriginal,freshCaptured.source),result = auditSource(restored, freshCaptured.source);
    expect(result.blocking).toEqual([]);
    expect(result.ir!.creature.actions[3]!.activityType).toBe('utility');
    expect(result.ir!.creature.actions[3]!.save).toBeUndefined();
    expect(result.ir!.creature.actions[3]!.description).toBe(restored.creature.actions[3]!.description);expect(result.ir!.creature.actions[3]!.sourceOperations![0]!.save!.abilities).toEqual(['int','wis']);
    expect(result.ir!.claims).toEqual(freshOriginal.claims);
    expect(result.ir!.coverage).toEqual(freshOriginal.coverage);
    expect(freshOriginal).toEqual(before);
    expect(auditSource(result.ir!).ir).toEqual(result.ir);
  });
  test('source decision is independent of the model error code or its absence', () => {
    const changed = structuredClone(original);
    changed.uncertainties[0]!.code = 'ANOTHER_MODEL_DIAGNOSTIC';
    expect(auditSource(changed).blocking.length).toBeGreaterThan(0);expect(auditRestored(changed).blocking).toEqual([]);
    const absent = structuredClone(original); absent.uncertainties = [];
    expect(auditSource(absent).ir!.creature.actions[3]!.activityType).toBe('utility');
  });
  test('fresh shape with missing selector or conflicting source stays blocked', () => {
    for (const to of ['(Caster’s Choice) DC 15.', '(Target’s Choice) DC 15. The GM chooses Wisdom instead.']) {
      const data = sourceVariant('(Target’s Choice) DC 15.', to, freshOriginal);
      expectBlocked(data.ir, data.source);
    }
  });
  test('fresh shape cannot choose one native ability or a different DC for the target', () => {
    const fixed = structuredClone(freshOriginal);
    fixed.creature.actions[3]!.save!.ability = 'wis';
    expectBlocked(fixed);
    const wrongDc = structuredClone(freshOriginal); wrongDc.creature.actions[3]!.save!.dc = 16;
    expectBlocked(wrongDc);
  });
  test('fresh shape with incomplete body or conflicting field claims is never normalized away', () => {
    const incomplete = structuredClone(freshOriginal);
    incomplete.creature.actions[3]!.description = incomplete.creature.actions[3]!.description.replace(' (Save Ends at end of turn).', '.');
    expectBlocked(incomplete);
    const conflict = structuredClone(freshOriginal);
    conflict.claims.push({ path: '/creature/actions/3/save/ability', valueKind: 'explicit', confidence: 'high', value: 'wis',
      evidence: structuredClone(conflict.claims.find(claim => claim.path === '/creature/actions/3')!.evidence) });
    expectBlocked(conflict);
    expect(auditSource(conflict).ir!.creature.actions[3]!.save).toEqual(conflict.creature.actions[3]!.save);
  });
  test('an ordinary source-explicit single-ability Save stays native', () => {
    const data = sourceVariant('Intelligence or Wisdom Saving Throw:\n(Target’s Choice) DC 15.', 'Wisdom Saving Throw: DC 15.', freshOriginal);
    data.ir.creature.actions[3]!.save!.ability = 'wis';
    const result = auditSource(data.ir, data.source);
    expect(result.blocking).toEqual([]);
    expect(result.ir!.creature.actions[3]!.activityType).toBe('save');
    expect(result.ir!.creature.actions[3]!.save).toEqual(data.ir.creature.actions[3]!.save);
  });

  test('missing target-choice words in the actual source remain blocked', () => {
    const { ir, source } = sourceVariant('(Target’s Choice) ', '');
    expectBlocked(ir, source);
  });
  test('missing DC in the source remains blocked', () => {
    const { ir, source } = sourceVariant('(Target’s Choice) DC 15.', '(Target’s Choice).');
    expectBlocked(ir, source);
  });
  test('a saved resolution cannot bypass revalidation after source truncation or conflict', () => {
    const resolved = auditSource().ir!.uncertainties[0]!;
    for (const replacement of ['', '(Target’s Choice) DC 15. The GM chooses Wisdom instead.']) {
      const { ir, source } = sourceVariant('(Target’s Choice) DC 15.', replacement);
      ir.creature.actions[3]!.activityType = 'utility';
      ir.uncertainties[0]!.code = resolved.code;
      ir.uncertainties[0]!.blocking = false;
      expectBlocked(ir, source);
    }
  });
  test('source with an explicit conflicting selector remains blocked', () => {
    const { ir, source } = sourceVariant('(Target’s Choice) DC 15.', '(Target’s Choice) DC 15. The GM chooses Wisdom instead.');
    expectBlocked(ir, source);
  });
  test('missing consequence text in the IR cannot pass as a complete rule', () => {
    const ir = structuredClone(original);
    ir.creature.actions[3]!.description = ir.creature.actions[3]!.description.replace(' (Save Ends at end of turn).', '.');
    expectBlocked(ir);
  });
  test('clipped feature evidence cannot hide the missing consequence', () => {
    const ir = structuredClone(original), feature = ir.creature.actions[3]!;
    const cut = feature.description.indexOf(' (Save Ends');
    feature.description = feature.description.slice(0, cut);
    const ref = feature.evidence![0]!;
    ref.end = ref.start + `${feature.name}. ${feature.description}`.length;
    ref.quote = captured.source.slice(ref.start, ref.end);
    expectBlocked(ir);
  });
  test('a conflicting structured Save is never silently discarded', () => {
    const ir = structuredClone(original);
    ir.creature.actions[3]!.save = { ability: 'wis', dc: 15 };
    expectBlocked(ir);
  });
  test('unrelated real conflict remains blocking', () => {
    const ir = structuredClone(original);
    ir.uncertainties.push({ ...structuredClone(ir.uncertainties[0]!), id: 'real-conflict', code: 'CONFLICTING_DC', message: 'Two source DCs conflict.' });
    expectBlocked(ir);
    expect(auditSource(ir).findings.some(finding => finding.code === 'CONFLICTING_DC' && finding.blocking)).toBe(true);
  });
  test('wrong uncertainty evidence or candidates do not receive the resolution', () => {
    const ir = structuredClone(original);
    ir.uncertainties[0]!.evidence[0]!.start++;
    expectBlocked(ir);
    const wrong = structuredClone(original);
    wrong.uncertainties[0]!.candidates = ['int', 'cha'];
    expectBlocked(wrong);
  });
  test('renamed feature and PDF line wrapping preserve the source-bound choice', () => {
    const renamed = sourceVariant('Seed Terror', 'Fading Mirage');
    expect(auditRestored(renamed.ir, renamed.source).blocking).toEqual([]);
    const wrapped = sourceVariant('Intelligence or Wisdom Saving Throw:\n(Target’s Choice)', 'Intelligence or Wisdom Saving Throw: (Target’s Choice)');
    expect(auditRestored(wrapped.ir, wrapped.source).blocking).toEqual([]);
  });
  for (const [label, ir, parentHash] of [['old', original, captured.resultSha256], ['fresh', freshOriginal, freshCaptured.resultSha256],
    ['combined', combinedOriginal, combinedCaptured.extractedIrSha256]] as const) {
  test(`formal encounter retains ${label} source-bound choice Save with unresolved companion findings`, async () => {
    expect(auditSource(ir).blocking.length).toBeGreaterThan(0);const restored=reextractChoice(ir);
    let configurationReplays = 0;
    // Bind the fixture's existing source-proved rules to the actual captured
    // names. Neither captured IR nor source is edited; no model is called.
    const featureSections = { trait: ir.creature.traits, action: ir.creature.actions,
      bonus: ir.creature.bonusActions, reaction: ir.creature.reactions, legendary: ir.creature.legendaryActions };
    const selection = { ...captured.cachedConfiguration.selection, rules: captured.cachedConfiguration.selection.rules.map(rule => {
      const candidates = featureSections[rule.section as keyof typeof featureSections].filter(feature => feature.name === rule.featureName || feature.englishName === rule.featureName);
      expect(candidates).toHaveLength(1);
      return { ...rule, featureName: candidates[0]!.name };
    }) };
    const result = await generateEncounterFromHumanMarkdown({ source: captured.source, label: 'Target choice replay',
      provider, reviewPolicy: 'deferred', draftParentHash: hashSource(JSON.stringify({historicalParent:parentHash,ir:restored})),
      drafts: [{ key: 'actor-1', source: captured.source, ir: restored }],
      automationProvider: { generate: async request => { configurationReplays++; return compileEncounterSelection(selection, request); }, review: noModel },
    });
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.generationRoute).toBe('actors-only');
    expect(result.report.findings.join(' ')).toContain('检查结论未提升为通过');
    expect(result.report.actors[0]!.generation!.findings).toContainEqual(expect.objectContaining({code:'INVALID_STRUCTURE',path:'/creature/actions/4/appliedConditions/0/statuses/0'}));
    expect(result.report.actors[0]!.generation!.findings).toContainEqual(expect.objectContaining({code:'GEN_SAVE_OUTCOME_MISMATCH'}));
    expect(result.report.actors[0]!.generation!.formalStatus).toBe('failed');
    expect(configurationReplays).toBe(0);
    expect(result.report.actors[0]?.analysis.calls).toEqual({ discovery: 0, extraction: 0, review: 0, repair: 0 });
    const items = result.prepared!.actors[0]!.artifact.items as Array<any>;
    const item = items.find(item => item.name === original.creature.actions[3]!.name);
    expect(item.effects).toHaveLength(1);
    expect(item.effects[0].statuses).toEqual(['frightened']);
    expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({version:1,mode:'gm'});
    const activities = Object.values(item.system.activities) as Array<any>;
    expect(activities.length).toBeGreaterThan(0);
    const saves=activities.filter(activity=>activity.type==='save');expect(saves).toHaveLength(1);expect(saves[0].save).toMatchObject({ability:['int','wis'],dc:{formula:'15'}});expect(activities.flatMap(activity=>activity.effects??[]).every(effect=>effect._id===item.effects[0]._id)).toBe(true);expect(activities.filter(activity=>activity.type!=='save').every(activity=>activity.type==='utility')).toBe(true);
    // Manual display now uses the complete source rule, rather than a second
    // model-authored paraphrase; its chooser, DC and lifecycle must remain.
    expect(activities.some(activity => /Intelligence or Wisdom Saving Throw/iu.test(activity.description.chatFlavor)
      && /Target['’]s Choice/iu.test(activity.description.chatFlavor)
      && /DC 15/iu.test(activity.description.chatFlavor)
      && /1 minute/iu.test(activity.description.chatFlavor)
      && /end of turn/iu.test(activity.description.chatFlavor))).toBe(true);
    expect(activities.some(activity => activity.description.chatFlavor.includes('GM'))).toBe(true);
    expect(result.prepared!.macros).toEqual([]);
    expect(result.report.automationReview).toEqual({status:'not_requested'});
    const findings=result.prepared!.reviewFindings;
    if(!findings)throw new Error('Expected retained candidate review findings.');
    expect(findings.join(' ')).toContain('GEN_SAVE_OUTCOME_MISMATCH');
  });
  }
});
