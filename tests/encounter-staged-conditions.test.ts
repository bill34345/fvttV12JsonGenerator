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
    // Generation now keeps the unsupported repeat-save lifecycle GM-owned.
    // Recreate the invalid simultaneous-stage candidate to retain the verifier
    // regression rather than requiring generation to emit that old defect.
    item.effects.push({ _id: 'badStage00000001', statuses: ['restrained'] });
    expect(item.effects.flatMap((effect: any) => effect.statuses).sort()).toEqual(['petrified', 'restrained']);
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

  test('removes a staged feature\'s embedded effects and post-generation inferred effect refs while ordinary source remains native', async () => {
    const { source, ir } = stagedFixture();
    const stagedSource = renderEncounterActorSource(ir, [], source);
    const stagedFeatureStart = stagedSource.indexOf('名称: Staged Fright');
    const stagedFeatureEnd = stagedSource.indexOf('\n  - 名称:', stagedFeatureStart + 1);
    const stagedFeature = stagedSource.slice(stagedFeatureStart, stagedFeatureEnd >= 0 ? stagedFeatureEnd : undefined);
    expect(stagedFeature).not.toContain('内嵌效果:');
    expect(stagedFeature).not.toContain('失败效果:');
    const stagedGenerated = await convertMarkdownContentToJson({ content: stagedSource, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const stagedItem = (stagedGenerated.rawJson as any).items.find((item: any) => item.name.includes('Staged Fright'));
    expect(stagedItem.effects.filter((effect: any) => effect.statuses.some((status: string) => ['frightened', 'exhaustion'].includes(status)))).toEqual([]);
    expect(Object.values(stagedItem.system.activities).flatMap((activity: any) => activity.effects ?? [])).toEqual([]);
    expect(stagedItem.flags.fvttJsonGenerator.behaviorMechanics).toContainEqual(expect.objectContaining({
      id: 'encounter-staged-action-1', kind: 'lifecycle', coverage: 'literal', executionMode: 'gm-assisted', ruleSource: 'source-derived',
    }));
    const manualActivity = Object.values(stagedItem.system.activities).find((activity: any) => activity.flags?.fvttJsonGenerator?.behaviorOperation) as any;
    expect(manualActivity.description.chatFlavor).not.toContain('encounter-staged');
    expect(manualActivity.description.chatFlavor).toContain('GM 1：由配套宏逐项检查前后条件');

    const incompleteMarkerSource = stagedSource.replace(/\n        - .*Staged Fright.*\n---/u, '\n---');
    const incompleteGenerated = await convertMarkdownContentToJson({ content: incompleteMarkerSource, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const incompleteItem = (incompleteGenerated.rawJson as any).items.find((item: any) => item.name.includes('Staged Fright'));
    expect(incompleteItem.effects.some((effect: any) => effect.statuses.includes('frightened'))).toBe(false);
    expect(verifyMonsterIntake(source, ir, incompleteMarkerSource, incompleteGenerated.rawJson).findings).toContainEqual(expect.objectContaining({
      code: 'ACTOR_CONDITION_DRIFT', path: '/creature/actions/0/appliedConditions/1',
    }));

    const ordinary = structuredClone(ir);
    ordinary.creature.actions[0]!.appliedConditions![1]!.staged = false;
    const ordinarySource = renderEncounterActorSource(ordinary, [], source);
    const ordinaryGenerated = await convertMarkdownContentToJson({ content: ordinarySource, fvttVersion: '14', effectProfile: 'core', translationService: null });
    const ordinaryItem = (ordinaryGenerated.rawJson as any).items.find((item: any) => item.name.includes('Staged Fright'));
    expect(ordinaryItem.effects.some((effect: any) => effect.statuses.includes('frightened'))).toBe(false);
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

  test('keeps staged Actor Intake at the companion boundary and requires one macro rule plus both deterministic covers', async () => {
    const { source, quote, ir, input } = stagedFixture();
    const ai = provider();
    const analysis = analyzeBrowserActorIntakeDraft(input, ir, ai);
    expect(analysis.status).toBe('ready_to_generate');
    const generated = await generateAndReviewBrowserActorIntake(input, analysis, ai);
    expect(generated.status).toBe('needs_review');
    expect(generated.review?.verdict).toBe('accepted');
    expect(generated.finalSource).toBeTruthy();
    expect(generated.findings.filter((finding) => finding.blocking).map((finding) => finding.code)).toEqual(['ACTOR_STAGED_CONDITION_REQUIRES_COMPANION', 'ACTOR_STAGED_CONDITION_REQUIRES_COMPANION']);

    const request: EncounterAutomationRequest = { source, actors: [{ key: 'actor-1', ir, source, artifact: generated.actorProjection }] };
    const base = { version: 1 as const, name: 'Staged companion', command: "const actor = await fromUuid(forgeEncounter.actors['actor-1']); return { showPanel() {} };", notes: '', manualSteps: [] };
    expect(() => decodeEncounterAutomation({ ...base, rules: [] }, request)).toThrow('Staged condition');
    const automation = decodeEncounterAutomation({
      ...base,
      rules: [{ actorKey: 'actor-1', featureName: 'Staged Fright', section: 'action', quote: quote.quote, gmSteps: ['先确认是否已经恐慌，再按原文只结算一个分支。'] }],
    }, request);
    const rule = { ...automation.rules[0]!, mechanicId: 'encounter-rule-1' };
    const finalSource = renderEncounterActorSource(ir, [rule], source);
    const stagedRequirement = encounterStagedConditionRequirements(ir, source)[0]!;
    const command = buildEncounterMacroCommand(automation);
    const bundle: any = {
      schema: 'fvtt-json-forge-encounter', version: 1, id: 'staged-fixture', label: 'Staged fixture',
      target: { foundry: '14.364', system: 'dnd5e', systemVersion: '5.3.3', effectProfile: 'core' }, primaryActorKey: 'actor-1',
      actors: [{ key: 'actor-1', label: 'Staged fixture', source: finalSource, sourceHash: hashSource(finalSource) }],
      macros: [{ key: 'staged-control', name: automation.name, command, commandHash: hashSource(command), bindings: { 'actor-1': 'actor-1' },
        covers: [{ actorKey: 'actor-1', mechanicId: rule.mechanicId }, { actorKey: 'actor-1', mechanicId: stagedRequirement.mechanicId }], notes: '' }], assets: [],
    };
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
    expect(prepared.actors[0]!.status).toBe('needs_review');
    expect(prepared.requirements.map((requirement) => requirement.mechanicId).sort()).toEqual(['encounter-rule-1', stagedRequirement.mechanicId].sort());
    const withMutatedSource = (mutate: (value: string) => string) => {
      const candidate = structuredClone(bundle);
      candidate.actors[0].source = mutate(finalSource);
      candidate.actors[0].sourceHash = hashSource(candidate.actors[0].source);
      return candidate;
    };
    const wrongPath = withMutatedSource((value) => value.replace(
      'encounter-staged:/creature/actions/0/appliedConditions/1',
      'encounter-staged:/creature/traits/0/appliedConditions/1',
    ));
    await expect(prepareForgeEncounter(serializeForgeEncounterPackage(wrongPath))).rejects.toThrow('staged');
    const wrongCoverage = withMutatedSource((value) => value.replace(
      'encounter-staged-coverage:actor.actions',
      'encounter-staged-coverage:actor.traits',
    ));
    await expect(prepareForgeEncounter(serializeForgeEncounterPackage(wrongCoverage))).rejects.toThrow('staged');
    for (const suffix of ['not-a-number', '1/extra']) {
      const wrongCondition = withMutatedSource(value => value.replace('appliedConditions/1', `appliedConditions/${suffix}`));
      await expect(prepareForgeEncounter(serializeForgeEncounterPackage(wrongCondition))).rejects.toThrow('staged');
    }
    const sameSectionLiteral = withMutatedSource((value) => value.replace('\n行为机制:', [
      '', '  - 名称: Extra Action Literal', '    类型: save', '    描述: 目标进行一次 DC 12 感知豁免；失败时由 GM 决定未写明的后果。', '    DC: 12', '    属性: 感知', '    dcSourceKind: literal', '行为机制:',
    ].join('\n')));
    await expect(prepareForgeEncounter(serializeForgeEncounterPackage(sameSectionLiteral))).rejects.toThrow('文字保留机制');
    const otherSourceFieldLiteral = withMutatedSource((value) => value.replace('\n动作:', [
      '', '  - 名称: Extra Trait Literal', '    类型: save', '    描述: 目标进行一次 DC 12 感知豁免；失败时由 GM 决定未写明的后果。', '    DC: 12', '    属性: 感知', '    dcSourceKind: literal', '动作:',
    ].join('\n')));
    await expect(prepareForgeEncounter(serializeForgeEncounterPackage(otherSourceFieldLiteral))).rejects.toThrow('文字保留机制');
    bundle.macros[0].covers.pop();
    await expect(prepareForgeEncounter(serializeForgeEncounterPackage(bundle))).rejects.toThrow('唯一');
  });

  test('permits only the reviewed staged companion boundary through multi-Actor intake', async () => {
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
    const automationProvider: EncounterAutomationPort = {
      generate: async () => ({
        version: 1, name: 'Staged companion',
        command: "const actor = await fromUuid(forgeEncounter.actors['actor-1']); return { showPanel() {} };",
        notes: '', manualSteps: [],
        rules: [{ actorKey: 'actor-1', featureName: 'Staged Fright', section: 'action', quote: quote.quote, gmSteps: ['先确认前置恐慌状态，再按原文只结算一个分支。'] }],
      }),
      review: async () => ({ verdict: 'accepted', findings: [] }),
    };
    const result = await generateEncounterFromHumanMarkdown({ source, label: 'Staged multi-Actor fixture', provider: actorProvider, automationProvider });
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.actors[0]!.generation?.status).toBe('needs_review');
    expect(result.prepared?.requirements.map((requirement) => requirement.mechanicId)).toContain('encounter-staged-action-1');
  });
});
