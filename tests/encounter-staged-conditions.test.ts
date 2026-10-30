import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildEncounterMacroCommand, decodeEncounterAutomation, encounterStagedConditionRequirements, renderEncounterActorSource,
  type EncounterAutomationRequest,
} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {
  analyzeBrowserActorIntakeDraft, generateAndReviewBrowserActorIntake,
  type BrowserActorIntakeInput,
} from '@fvtt-json-generator/forge-browser-runtime/ai';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { generateEncounterFromHumanMarkdown, type EncounterAutomationPort } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { convertMarkdownContentToJson } from '../src/core/workflow/singleFileConversion';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { suppressEncounterStagedInferredEffects } from '@fvtt-json-generator/generation/actor-effects';
import { LURKER_SOURCE, buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';
import { RAT_WARLOCK_SOURCE, buildRatWarlockIr } from '../src/core/intake/__tests__/fixtures/rat-warlock';
import type { MonsterIntakeAiProvider } from '@fvtt-json-generator/intake-ai/types';

const STAGED_TEXT = '**Staged Fright。** 目标进行一次 DC 13 感知豁免。失败时首次陷入恐慌（Frightened）；若目标已经恐慌，则改为获得 1 级力竭。成功时无效果。';

function stagedFixture() {
  const source = `${LURKER_SOURCE}\n\n${STAGED_TEXT}`;
  const quote = { start: source.lastIndexOf(STAGED_TEXT), end: source.length, quote: STAGED_TEXT };
  const ir = buildValidLurkerIr();
  ir.source = { sha256: hashSource(source), length: source.length };
  ir.coverage.push({ ...quote, classification: 'mechanical', claimPaths: ['/creature/actions/0'] });
  ir.creature.actions[0] = {
    name: 'Staged Fright', englishName: 'Staged Fright', description: STAGED_TEXT, activityType: 'save',
    save: { dc: 13, ability: 'wis' }, evidence: [quote],
    appliedConditions: [
      { statuses: ['frightened'], condition: '首次失败时陷入恐慌（Frightened）' },
      { statuses: ['exhaustion'], condition: '若目标已经恐慌，则改为获得 1 级力竭', staged: true },
    ],
  };
  const input: BrowserActorIntakeInput = {
    source, sourceName: 'Staged fixture', displayName: 'Staged fixture', requestId: 'encounter-staged-fixture',
    fvttVersion: '14.364', systemVersion: '5.3.3',
    renderMarkdown: (candidate) => renderEncounterActorSource(candidate, [], source),
  };
  return { source, quote, ir, input };
}

function provider(): MonsterIntakeAiProvider {
  return {
    providerName: 'staged-fixture', extractionModel: 'fixture', reviewModel: 'fixture',
    discover: async () => { throw new Error('not used'); },
    extract: async () => { throw new Error('not used'); },
    repair: async () => { throw new Error('not used'); },
    review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
  };
}

describe('encounter staged condition companion boundary', () => {
  test('rejects simultaneous native stages when each IR branch contains just one status', async () => {
    const text = 'Stone Stages. The target makes a DC 13 Dexterity save. First Failure: Restrained. At the end of its next turn it repeats the save. Second Failure: Petrified.';
    const source = `${LURKER_SOURCE}\n\n${text}`;
    const quote = { start: source.lastIndexOf(text), end: source.length, quote: text };
    const ir = buildValidLurkerIr();
    ir.source = { sha256: hashSource(source), length: source.length };
    ir.coverage.push({ ...quote, classification: 'mechanical', claimPaths: ['/creature/actions/0'] });
    ir.creature.actions[0] = {
      name: 'Stone Stages', description: text, activityType: 'save', save: { dc: 13, ability: 'dex' }, evidence: [quote],
      appliedConditions: [
        { statuses: ['restrained'], condition: 'First Failure' },
        { statuses: ['petrified'], condition: 'Second Failure', staged: true },
      ],
    };
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const item = (generated.rawJson as any).items.find((entry: any) => entry.name === 'Stone Stages');
    expect(item.effects.flatMap((effect:any)=>effect.statuses).sort()).toEqual(['incapacitated','petrified','restrained']);
    expect(item.effects.every((effect:any)=>effect.flags.fvttJsonGenerator.conditionLifecycle.mode==='gm')).toBe(true);
    const retained=verifyMonsterIntake(source,ir,markdown,generated.rawJson);
    expect(retained.findings.filter(finding=>finding.code==='STAGED_CONDITIONS_SIMULTANEOUS')).toEqual([]);
    // Recreate automatic simultaneous branches; optional GM templates above do
    // not execute both outcomes and must remain available.
    item.effects=[{_id:'badStage00000001',statuses:['restrained']},{_id:'badStage00000002',statuses:['petrified']}];
    const report = verifyMonsterIntake(source, ir, markdown, generated.rawJson);

    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'STAGED_CONDITIONS_SIMULTANEOUS', path: '/creature/actions/0/appliedConditions', blocking: true,
    }));
    expect(report.status).toBe('needs_review');

    const ordinary = structuredClone(ir);
    ordinary.creature.actions[0]!.appliedConditions![1]!.staged = false;
    const ordinaryMarkdown = renderMonsterIntakeMarkdown(ordinary);
    const ordinaryGenerated = await convertMarkdownContentToJson({ content: ordinaryMarkdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    expect(verifyMonsterIntake(source, ordinary, ordinaryMarkdown, ordinaryGenerated.rawJson).findings.filter(finding => finding.code === 'STAGED_CONDITIONS_SIMULTANEOUS')).toEqual([]);
  });

  test('keeps staged GM templates and manual rules while suppressing only plain inferred effect refs', async () => {
    const { source, ir } = stagedFixture();
    const stagedSource = renderEncounterActorSource(ir, [], source);
    const stagedFeatureStart = stagedSource.indexOf('名称: Staged Fright');
    const stagedFeatureEnd = stagedSource.indexOf('\n  - 名称:', stagedFeatureStart + 1);
    const stagedFeature = stagedSource.slice(stagedFeatureStart, stagedFeatureEnd >= 0 ? stagedFeatureEnd : undefined);
    expect(stagedFeature).not.toContain('内嵌效果:');
    expect(stagedFeature).not.toContain('失败效果:');
    const stagedGenerated = await convertMarkdownContentToJson({ content: stagedSource, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const stagedItem = (stagedGenerated.rawJson as any).items.find((item: any) => item.name.includes('Staged Fright'));
    expect(stagedItem.effects).toHaveLength(1);
    expect(stagedItem.effects[0].statuses).toEqual(['frightened']);
    expect(stagedItem.effects[0].flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({version:1,mode:'gm'});
    expect(stagedItem.effects[0].description).toContain('此模板可选应用');
    expect(stagedItem.effects.flatMap((effect:any)=>effect.statuses)).not.toContain('exhaustion');
    expect(Object.values(stagedItem.system.activities).flatMap((activity:any)=>activity.effects??[]).every((effect:any)=>effect._id===stagedItem.effects[0]._id)).toBe(true);
    expect(stagedItem.flags.fvttJsonGenerator.behaviorMechanics).toContainEqual(expect.objectContaining({
      id: 'encounter-staged-action-1', kind: 'lifecycle', coverage: 'literal', executionMode: 'gm-assisted', ruleSource: 'source-derived',
    }));
    const manualActivity = Object.values(stagedItem.system.activities).find((activity: any) => activity.flags?.fvttJsonGenerator?.behaviorOperation) as any;
    expect(manualActivity.description.chatFlavor).not.toContain('encounter-staged');
    expect(manualActivity.description.chatFlavor).toContain('GM 1：由GM按原文裁定并应用／结束特殊结果；控制入口只展示规则，不自动执行这些效果。');

    const inferredCandidate=structuredClone(stagedGenerated.rawJson) as any;
    const inferredItem=inferredCandidate.items.find((item:any)=>item.name.includes('Staged Fright'));
    const inferredId='plainFear0000001';
    inferredItem.effects.push({_id:inferredId,statuses:['frightened'],disabled:false,changes:[],description:''});
    const inferredSave=Object.values(inferredItem.system.activities).find((activity:any)=>activity.type==='save') as any;
    inferredSave.effects??=[];inferredSave.effects.push({_id:inferredId});
    suppressEncounterStagedInferredEffects(inferredCandidate);
    expect(inferredItem.effects).toEqual(stagedItem.effects);
    expect(Object.values(inferredItem.system.activities).flatMap((activity:any)=>activity.effects??[]).some((effect:any)=>effect._id===inferredId)).toBe(false);

    const incompleteMarkerSource = stagedSource.replace(/\n        - .*Staged Fright.*\n---/u, '\n---');
    const incompleteGenerated = await convertMarkdownContentToJson({ content: incompleteMarkerSource, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const incompleteItem = (incompleteGenerated.rawJson as any).items.find((item: any) => item.name.includes('Staged Fright'));
    expect(incompleteItem.effects.some((effect:any)=>effect.statuses.includes('frightened')&&effect.flags.fvttJsonGenerator.conditionLifecycle.mode==='gm')).toBe(true);
    expect(verifyMonsterIntake(source, ir, incompleteMarkerSource, incompleteGenerated.rawJson).findings).toContainEqual(expect.objectContaining({
      code: 'ACTOR_CONDITION_DRIFT', path: '/creature/actions/0/appliedConditions/1',
    }));

    const ordinary = structuredClone(ir);
    ordinary.creature.actions[0]!.appliedConditions![1]!.staged = false;
    const ordinarySource = renderEncounterActorSource(ordinary, [], source);
    const ordinaryGenerated = await convertMarkdownContentToJson({ content: ordinarySource, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const ordinaryItem = (ordinaryGenerated.rawJson as any).items.find((item: any) => item.name.includes('Staged Fright'));
    expect(ordinaryItem.effects.some((effect:any)=>effect.statuses.includes('frightened')&&effect.flags.fvttJsonGenerator.conditionLifecycle.mode==='gm')).toBe(true);
    expect(ordinaryItem.flags.fvttJsonGenerator.conditionLifecycle.statuses).toContain('frightened');
    const carrierMismatch = structuredClone(ordinaryGenerated.rawJson) as any;
    const mismatchItem = carrierMismatch.items.find((item: any) => item.name.includes('Staged Fright'));
    const mismatchedMarker = structuredClone(stagedItem.flags.fvttJsonGenerator.behaviorMechanics[0]);
    mismatchedMarker.carrier.name = 'Other carrier';
    mismatchItem.flags.fvttJsonGenerator = { behaviorMechanics: [mismatchedMarker] };
    mismatchItem.effects.push({ _id: 'plainFear0000001', statuses: ['frightened'], disabled: false, changes: [], description: '' });
    suppressEncounterStagedInferredEffects(carrierMismatch);
    expect(mismatchItem.effects.some((effect: any) => effect.statuses.includes('frightened'))).toBe(true);
  });

  test('retains both staged Actor candidates and GM requirements when projection findings prevent controller generation', async () => {
    const { source: stagedSource, quote, ir: stagedIr } = stagedFixture();
    const source = `${stagedSource}${RAT_WARLOCK_SOURCE}`;
    const actorProvider: MonsterIntakeAiProvider = {
      ...provider(),
      discover: async () => ({ schemaVersion: 1, candidates: [
        { id: 'staged', label: 'Staged fixture', start: 0, end: stagedSource.length, quote: stagedSource },
        { id: 'rat', label: 'Rat fixture', start: stagedSource.length, end: source.length, quote: RAT_WARLOCK_SOURCE },
      ] }),
      extract: async (request) => request.source === stagedSource ? stagedIr : buildRatWarlockIr(),
    };
    let automationCalls=0,reviewCalls=0;
    const automationProvider: EncounterAutomationPort = {
      generate: async () => {automationCalls++;return ({
        version: 1, name: 'Staged companion',
        command: "const actor = await fromUuid(forgeEncounter.actors['actor-1']); return { showPanel() {} };",
        notes: '', manualSteps: [],
        rules: [{ actorKey: 'actor-1', featureName: 'Staged Fright', section: 'action', quote: quote.quote, gmSteps: ['先确认前置恐慌状态，再按原文只结算一个分支。'] }],
      });},
      review: async () => {reviewCalls++;return ({ verdict: 'accepted', findings: [] });},
    };
    const result = await generateEncounterFromHumanMarkdown({ source, label: 'Staged multi-Actor fixture', provider: actorProvider, automationProvider });
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.actors[0]!.generation?.status).toBe('ready_for_gm_review');
    expect(result.report.actors[0]!.generation?.formalStatus).toBe('needs_review');
    expect(result.report.generationRoute).toBe('actors-only');
    expect(result.prepared?.actors).toHaveLength(2);
    expect(result.prepared?.macros).toEqual([]);
    expect(result.report.actors[0]!.generation?.findings).toContainEqual(expect.objectContaining({code:'MARKDOWN_IR_PROJECTION_DRIFT'}));
    expect(automationCalls).toBe(0);expect(reviewCalls).toBe(0);
    expect(result.prepared?.requirements.map((requirement) => requirement.mechanicId)).toContain('encounter-staged-action-1');
  });
});
