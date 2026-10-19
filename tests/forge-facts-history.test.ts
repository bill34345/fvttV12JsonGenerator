import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  FACT_LOCALIZATION_POLICY, LOCALIZATION_POLICY, LOCALIZATION_TERMS,
  approveLocalizationByGm, assertReviewedLocalization, localizationHash, localizationRequest,
  localizationText, protectLocalizationText, validateLocalizationDraft, type LocalizationDraft, type LocalizationRequest,
} from '@fvtt-json-generator/contracts/localization';
import { createActorLocalizationRequest } from '@fvtt-json-generator/generation/reviewed-localization';
import {
  actorLocalizationDisplayRows, approveForgeEncounterLocalization, assertForgeEncounterLocalizationDraft,
  draftForgeEncounterLocalization,
} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { analyzeBrowserActorIntakeDraft } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { assertPreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { compileEncounterSelection } from '@fvtt-json-generator/intake-ai/encounter-automation';
import type { MonsterIntakeAiProvider, MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import {bindSourceOperations,sourceOperationClauses} from '@fvtt-json-generator/models/source-operations';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import seaOld from './fixtures/forge-target-choice-intake.json';
import seaFresh from './fixtures/forge-target-choice-fresh-intake.json';
import seaCombined from './fixtures/forge-target-choice-combined-intake.json';
import gazer from './fixtures/forge-gazer-forced-movement-intake.json';
import faldricIr from './fixtures/forge-faldric-intake.json';
import mezz from './fixtures/forge-facts-history/mezzoloth.json';
import companyFirstUi from './fixtures/forge-company-first-ui-recovery.json';
import gazerFormula from './fixtures/forge-facts-history/gazer-formula.json';
import foodFailure from './fixtures/localization-food-retention-failure.json';
import faldric from './fixtures/forge-facts-history/faldric-source.json';

const forbidden = async (): Promise<never> => {
  throw new Error('Historical regression must make zero model and paid-review calls.');
};
const provider: MonsterIntakeAiProvider = {
  providerName: 'historical-offline',
  extractionModel: 'saved-ir-no-model',
  reviewModel: 'disabled',
  discover: forbidden,
  extract: forbidden,
  repair: forbidden,
  review: forbidden,
};
interface SavedCase {
  label: string;
  source: string;
  ir: MonsterIntakeIR;
  parentHash: string;
  sourceHash: string;
  automation: 'sea-hag' | 'gazer' | 'none';
}
const saved: SavedCase[] = [
  {
    label: 'Sea Hag old target-choice',
    source: seaOld.source,
    ir: seaOld.ir as MonsterIntakeIR,
    parentHash: seaOld.resultSha256,
    sourceHash: '0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1',
    automation: 'sea-hag',
  },
  {
    label: 'Sea Hag fresh missing-ability',
    source: seaFresh.source,
    ir: seaFresh.ir as unknown as MonsterIntakeIR,
    parentHash: seaFresh.resultSha256,
    sourceHash: '0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1',
    automation: 'sea-hag',
  },
  {
    label: 'Sea Hag combined-ability',
    source: seaCombined.source,
    ir: seaCombined.ir as unknown as MonsterIntakeIR,
    parentHash: seaCombined.extractedIrSha256,
    sourceHash: '0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1',
    automation: 'sea-hag',
  },
  {
    label: 'Gazer forced movement and full formula',
    source: gazer.source,
    ir: gazer.ir as MonsterIntakeIR,
    parentHash: gazer.provenance.resultSha256,
    sourceHash: 'a9c9cfc009ee19152ab64755bbda600628eabc3add772f32ecbad05a174b9a9b',
    automation: 'gazer',
  },
  {
    label: 'Mezzoloth Shred HTML and plain source',
    source: mezz.source,
    ir: mezz.ir as MonsterIntakeIR,
    parentHash: mezz.origin.sha256,
    sourceHash: '2c93b830d3814fdc9ddd6bb255699a9bd28edbcf118bda1900fa6fa992bf0562',
    automation: 'none',
  },
  {
    label: 'Faldric damage control',
    source: faldric.source,
    ir: faldricIr as MonsterIntakeIR,
    parentHash: faldric.origin.sha256,
    sourceHash: 'bafad45419cbe42e9041be7f4919ffb3cb8eb32e9048c0472ec8927f6dbeb571',
    automation: 'none',
  },
];

function seaSelection(ir: MonsterIntakeIR): any {
  const sections = {
    trait: ir.creature.traits,
    action: ir.creature.actions,
    bonus: ir.creature.bonusActions,
    reaction: ir.creature.reactions,
    legendary: ir.creature.legendaryActions,
  };
  const original = seaOld.cachedConfiguration.selection;
  return {
    ...original,
    rules: original.rules.map(rule => {
      const section = sections[rule.section as keyof typeof sections] ?? [];
      const matched = section.filter(feature => feature.name === rule.featureName || feature.englishName === rule.featureName);
      expect(matched).toHaveLength(1);
      return { ...rule, featureName: matched[0]!.name };
    }),
  };
}
function gazerSelection(ir: MonsterIntakeIR): any {
  const feature = ir.creature.actions[4]!;
  const quote = ir.claims.find(claim => claim.path === '/creature/actions/4')?.evidence[0]?.quote;
  expect(quote).toContain('25 (1d10 x 5)');
  return {
    version: 2,
    name: 'Source push adjudication',
    notes: 'GM resolves forced movement from the source after the native save.',
    manualSteps: ['GM manually moves the failed target; there is no automatic movement.'],
    legendaryRecovery: [],
    rules: [{
      id: 'push',
      kind: 'gm-manual',
      actorKey: 'actor-1',
      featureName: feature.name,
      section: 'action',
      quote,
      parameters: {},
      gmSteps: [
        'Roll the native saving throw for the target.',
        'On failure GM manually applies the complete source rule: ' + feature.description,
      ],
    }],
  };
}
async function sourceToPrepared(entry: SavedCase) {
  const ir=structuredClone(entry.ir);
  if(entry.label.startsWith('Sea Hag')){
    // The historical IR omitted this basic target-choice Save. Keep its saved
    // bytes/hash intact and re-extract only the source-bound contract in memory
    // before exercising the unchanged translation/approval/readback assertions.
    const feature=ir.creature.actions[3]!,ref=feature.evidence?.[0]??seaOld.ir.creature.actions[3]!.evidence[0]!,parent=ref.quote,clauses=sourceOperationClauses(parent);
    feature.evidence=[ref];feature.description=parent;
    feature.sourceOperations=bindSourceOperations(parent,[{id:'target-choice',name:'Target choice Save',type:'save',relationship:'primary',save:{dc:15,abilities:['int','wis'],choice:'target',outcome:'none'},aoe:{shape:'radius',radius:15},proof:{save:clauses.find(q=>q.includes('DC 15'))!,aoe:clauses.find(q=>q.includes('Emanation'))!}}],ref.start+ref.quote.indexOf(parent));
    feature.executionMode='native-with-gm';feature.activityType='utility';feature.nativeRuleText=parent;feature.manualRemainder=parent;
    delete feature.save;delete feature.aoe;delete feature.appliedConditions;
  }
  let automationCalls = 0;
  const result = await generateEncounterFromHumanMarkdown({
    source: entry.source,
    label: entry.label,
    reviewPolicy: 'deferred',
    outputLanguage: 'source',
    drafts: [{ key: 'actor-1', source: entry.source, ir }],
    draftParentHash: hashSource(JSON.stringify(ir)),
    provider,
    automationProvider: {
      generate: async request => {
        automationCalls++;
        if (entry.automation === 'none') return forbidden();
        const selection = entry.automation === 'sea-hag'
          ? seaSelection(entry.ir) : gazerSelection(entry.ir);
        return compileEncounterSelection(selection, request);
      },
      review: forbidden,
    },
  });
  expect(result.report.status,JSON.stringify(result.report.findings)).toBe('ready_for_gm_review');
  expect(result.report.findings).toEqual([]);
  expect(result.report.actors[0]?.analysis.calls).toEqual({ discovery: 0, extraction: 0, repair: 0, review: 0 });
  expect(automationCalls).toBe(entry.automation === 'none' ? 0 : 1);
  expect(result.prepared).toBeDefined();
  assertPreparedForgeEncounter(result.prepared!);
  return result.prepared!;
}

/** Newly authored local test responses; these are not saved model translations. */
function authoredTestTranslation(request: LocalizationRequest): LocalizationDraft {
  const chineseOrdinals = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥';
  return { texts: request.texts.map((field, index) => {
    const protectedField = protectLocalizationText(field.source);
    // Test-authored prose must now preserve labelled metadata roles as well as
    // the protected values; generic filler is not a valid recharge/range label.
    let translated = protectedField.restore(protectedField.text
      .replace(/\bRecharge\b/giu,'充能').replace(/\b(?:range|reach)\b/giu,'射程')
      .replace(/\b(?:feet|ft)\b/giu,'尺').replace(/\bLevel\s*(⟦\d+⟧)\s*Spells?\b/giu,'$1环法术')
      .replace(/[A-Za-z]+/gu, '译文'));
    if (field.kind === 'title') translated = '名称' + (chineseOrdinals[index % chineseOrdinals.length] ?? '甲') + translated;
    for (const term of LOCALIZATION_TERMS) {
      if (new RegExp('\\b' + term.english + 's?\\b', 'iu').test(field.source)) translated += term.chinese;
    }
    if (/\bDazed\b/iu.test(field.source)) translated += '恍惚';
    if (/\bDominated\b/iu.test(field.source)) translated += '受支配';
    // English compound labels such as drop-to-0 denote zero, not negative zero.
    translated = translated.replace(/译文(?:-译文)+-(\d+)/gu, '译文至$1');
    return { id: field.id, text: translated };
  }) };
}
function mechanics(actor: any) {
  return {
    abilities: actor.system?.abilities,
    ac: actor.system?.attributes?.ac,
    hp: actor.system?.attributes?.hp,
    cr: actor.system?.details?.cr,
    items: (actor.items ?? []).map((item: any) => ({
      type: item.type,
      img: item.img,
      activities: Object.values(item.system?.activities ?? {}).map((activity: any) => ({
        type: activity.type, img: activity.img, attack: activity.attack,
        damage: activity.damage, save: activity.save,
      })),
      statuses: (item.effects ?? []).map((effect: any) => effect.statuses),
    })),
  };
}
function seaSourceVariant(from: string, to: string) {
  const source = seaOld.source.replaceAll(from, to);
  const starts: number[] = [];
  for (let at = seaOld.source.indexOf(from); at >= 0; at = seaOld.source.indexOf(from, at + from.length)) starts.push(at);
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
  const ir = visit(seaOld.ir) as MonsterIntakeIR;
  ir.source = { sha256: hashSource(source), length: source.length };
  return { source, ir };
}
function analyzeSea(ir: MonsterIntakeIR, source = seaOld.source) {
  return analyzeBrowserActorIntakeDraft({
    source, sourceName: 'Historical Sea Hag', requestId: 'facts-history-sea-hag',
    fvttVersion: '14.364', systemVersion: '5.3.3',
  }, ir, provider);
}
describe('saved historical facts through the formal offline source chain', () => {
  test.each(saved.filter(entry=>entry.label.startsWith('Sea Hag')))('$label historical Utility-only choice Save requires re-extraction',entry=>{
    expect(validateMonsterIntakeIR(entry.source,structuredClone(entry.ir)).blocking.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED'&&f.path==='/creature/actions/3')).toBe(true);
  });
  test('the saved normal Company Sphere is correctly described while its complete spell-ending rule stays for GM review', async () => {
    const prepared = await prepareForgeEncounter(companyFirstUi.snapshot.package);
    const actor = prepared.actors[0]!;
    const item = (actor.artifact as any).items.find((entry: any) => entry.name === 'Weaverot Volley');
    const activity: any = Object.values(item.system.activities)[0];
    expect(activity.target.template).toMatchObject({ type: 'sphere', size: 15, units: 'ft' });
    expect(activity.range).toMatchObject({ value: 60, units: 'ft' });
    expect(activity.save.dc).toMatchObject({ formula: '18', calculation: '' });
    const note = actor.rulePresentation!.uncoveredMechanics.find((entry) => entry.source.includes('Weaverot Volley'));
    expect(note).toBeDefined();
    expect(note!.summaryZh).toContain('球形区域，范围15尺');
    expect(note!.details).not.toContain('structuredActions/动作/2/Weaverot Volley/structured/aoe: sphere/15');
    expect(note!.source).toContain('SUCCESS OR FAILURE');
    expect(note!.source).toContain('Each spell of Level 2 or below');
    expect(item.effects).toEqual([]);
  });

  test.each(saved)('$label retains exact source identity', entry => {
    expect(String(hashSource(entry.source))).toBe(entry.sourceHash);
    expect(entry.ir.source.sha256).toBe(entry.sourceHash);
    expect(entry.ir.source.length).toBe(entry.source.length);
  });
  test('Mezzoloth fixture preserves both recorded Shred failures without editing the originals', () => {
    expect(mezz.recordedFailure.status).toBe('needs_review');
    expect(mezz.recordedFailure.fields.map(field => field.id)).toEqual([
      'text-afe39999667ac8a24ee2e33c',
      'text-d5b68f68d43c16f53c727533',
    ]);
    expect(mezz.recordedFailure.fields[0]?.source).toContain('<ul><li>Shred.');
    expect(mezz.recordedFailure.fields[1]?.source).toContain('or half as much if it is wearing Heavy Armor');
    expect(mezz.recordedFailure.fields.every(field => field.recordedFailedTranslation.includes('或减半 如果该生物穿着重甲'))).toBe(true);
  });
  test('saved food and Gazer failures retain their exact meaning and evidence limits', () => {
    const foodSource = foodFailure.request.texts[0]!.source;
    const foodWrong = foodFailure.draft.texts[0]!.text;
    expect(foodSource).toContain('keep solid food');
    expect(foodSource).toContain('down only if washed down with sea water');
    expect(foodWrong).toContain('咽下固体食物');
    expect(() => validateLocalizationDraft(foodFailure.request as LocalizationRequest,
      foodFailure.draft as LocalizationDraft)).toThrow('食物留存');
    expect(gazerFormula.origin.absentRejectedConfigurationPayloads).toBe('UNKNOWN');
    expect(gazerFormula.failedFields).toHaveLength(3);
    for (const field of gazerFormula.failedFields) {
      expect(field.source).toContain('25 (1d10 x 5)');
      expect(field.translation).toContain('1d10 x 5');
      expect(field.sourceFormulas).toEqual(field.translationFormulas);
      expect(field.status).toBe('REJECTED');
    }
  });
  test('INT/WIS source choices still reject missing consequence, chooser, DC and conflicting claims', () => {
    const missingConsequence = structuredClone(seaOld.ir) as MonsterIntakeIR;
    missingConsequence.creature.actions[3]!.description =
      missingConsequence.creature.actions[3]!.description.replace(' (Save Ends at end of turn).', '.');
    const variants = [
      { label: 'missing consequence', ir: missingConsequence, source: seaOld.source },
      { label: 'missing chooser', ...seaSourceVariant('(Target’s Choice) ', '') },
      { label: 'changed chooser', ...seaSourceVariant('(Target’s Choice) DC 15.', '(Caster’s Choice) DC 15.') },
      { label: 'missing source DC', ...seaSourceVariant('(Target’s Choice) DC 15.', '(Target’s Choice).') },
    ];
    const wrongDc = structuredClone(seaCombined.ir) as unknown as MonsterIntakeIR;
    wrongDc.creature.actions[3]!.save!.dc = 16;
    variants.push({ label: 'conflicting DC', source: seaOld.source, ir: wrongDc });
    const conflict = structuredClone(seaOld.ir) as MonsterIntakeIR;
    const claim = conflict.claims.find(entry => entry.path === '/creature/actions/3')!;
    conflict.claims.push({
      path: '/creature/actions/3/save/ability',
      value: 'wis',
      valueKind: 'explicit',
      confidence: 'high',
      evidence: structuredClone(claim.evidence),
    });
    variants.push({ label: 'conflicting ability claim', source: seaOld.source, ir: conflict });
    for (const entry of variants) {
      const analysis = analyzeSea(entry.ir, entry.source);
      expect(analysis.status, entry.label).toBe('needs_review');
      expect(analysis.findings.some(finding => finding.blocking), entry.label).toBe(true);
      expect(analysis.calls).toEqual({ discovery: 0, extraction: 0, repair: 0, review: 0 });
    }
  });
  test('saved Gazer and Mezzoloth sources reject changed formula, distance and armour condition in IR', () => {
    const gazerDivision = structuredClone(gazer.ir) as MonsterIntakeIR;
    gazerDivision.creature.actions[4]!.description =
      gazerDivision.creature.actions[4]!.description.replace('1d10 x 5', '1d10 / 5');
    const gazerDistance = structuredClone(gazer.ir) as MonsterIntakeIR;
    gazerDistance.creature.actions[4]!.description =
      gazerDistance.creature.actions[4]!.description.replace('pushed 25', 'pushed 20');
    const mezzNegated = structuredClone(mezz.ir) as MonsterIntakeIR;
    const shred = mezzNegated.creature.bonusActions.find(action => action.name === 'Shred')!;
    shred.description = shred.description.replace('if it is wearing Heavy Armor', 'if it is not wearing Heavy Armor');
    const mezzMissing = structuredClone(mezz.ir) as MonsterIntakeIR;
    const missingShred = mezzMissing.creature.bonusActions.find(action => action.name === 'Shred')!;
    missingShred.description = missingShred.description.replace(', or half as much if it is wearing Heavy Armor', '');
    const cases = [
      { label: 'division instead of multiplication', source: gazer.source, ir: gazerDivision },
      { label: 'pushed distance changed', source: gazer.source, ir: gazerDistance },
      { label: 'heavy armour condition negated', source: mezz.source, ir: mezzNegated },
      { label: 'heavy armour half consequence omitted', source: mezz.source, ir: mezzMissing },
    ];
    for (const entry of cases) {
      const analysis = analyzeBrowserActorIntakeDraft({
        source: entry.source, sourceName: entry.label, requestId: 'historical-conflict-replay',
        fvttVersion: '14.364', systemVersion: '5.3.3',
      }, entry.ir, provider);
      expect(analysis.status, entry.label).toBe('needs_review');
      expect(analysis.findings.some(finding => finding.blocking), entry.label).toBe(true);
      expect(analysis.calls).toEqual({ discovery: 0, extraction: 0, repair: 0, review: 0 });
    }
  });
  test('source-backed save, damage, condition and activation fields reject a one-field contradiction', () => {
    const cases: Array<{ label: string; source: string; ir: MonsterIntakeIR; change: (ir: MonsterIntakeIR) => void }> = [
      { label: 'Mezz Toxic source DC 14 versus IR 15', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[3]!.save!.dc = 15; } },
      { label: 'Mezz Toxic source CON versus IR DEX', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[3]!.save!.ability = 'dex'; } },
      { label: 'Mezz Toxic source Blinded until target next-turn end versus start', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[3]!.appliedConditions![0]!.duration = 'until the start of its next turn'; } },
      { label: 'Mezz Claws source escape DC 15 versus IR 16', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[1]!.appliedConditions![0]!.escapeDc = 16; } },
      { label: 'Mezz Barb second Necrotic damage omitted', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[2]!.damage!.splice(1, 1); } },
      { label: 'Mezz Barb second Necrotic damage duplicated', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[2]!.damage!.push(structuredClone(ir.creature.actions[2]!.damage![1]!)); } },
      { label: 'Mezz Barb second Necrotic damage type changed to Cold', source: mezz.source, ir: mezz.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[2]!.damage![1]!.type = 'Cold'; } },
      // Saved Gazer source says "the creature is Charmed and Dazed until the end of its next turn":
      // both statuses occur together, with no staged transition.
      { label: 'Gazer simultaneous Charmed and Dazed claimed staged', source: gazer.source, ir: gazer.ir as MonsterIntakeIR,
        change: ir => { ir.creature.actions[1]!.appliedConditions![0]!.staged = true; } },
      // Saved Sea Hag source title says "Death Glare (Only if Bloodied)", the opposite of this added gate.
      { label: 'Sea Death Glare source Only if Bloodied inverted', source: seaFresh.source,
        ir: seaFresh.ir as unknown as MonsterIntakeIR,
        change: ir => { ir.creature.bonusActions[2]!.activationCondition = 'Only if not Bloodied'; } },
    ];
    expect(mezz.ir.creature.actions[2]?.description)
      .toContain('Piercing plus 5 (1d10) Necrotic damage');
    expect(mezz.ir.creature.actions[2]?.damage?.[1])
      .toEqual({ formula: '1d10', type: 'Necrotic', relationship: 'additional' });    for (const entry of cases) {
      const ir = structuredClone(entry.ir);
      entry.change(ir);
      expect(ir.source).toEqual(entry.ir.source);
      for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) {
        expect((ir.creature[section] ?? []).map(feature => feature.description))
          .toEqual((entry.ir.creature[section] ?? []).map(feature => feature.description));
      }
      expect(ir.claims).toEqual(entry.ir.claims);
      expect(ir.coverage).toEqual(entry.ir.coverage);
      const analysis = analyzeBrowserActorIntakeDraft({
        source: entry.source, sourceName: entry.label, requestId: 'historical-structured-conflict',
        fvttVersion: '14.364', systemVersion: '5.3.3',
      }, ir, provider);
      expect(analysis.status, entry.label).toBe('needs_review');
      expect(analysis.findings.some(finding => finding.blocking), entry.label).toBe(true);
      expect(analysis.calls).toEqual({ discovery: 0, extraction: 0, repair: 0, review: 0 });
    }
  });
  test('a full feature quote still blocks Toxic Emission DC drift when its parent claim only quotes the title', () => {
    const source = mezz.source;
    const originalClaim = mezz.ir.claims.find(claim => claim.path === '/creature/actions/3')!;
    const full = originalClaim.evidence[0]!;
    expect({ start: full.start, end: full.end }).toEqual({ start: 1357, end: 1623 });
    expect(source.slice(full.start, full.end)).toBe(full.quote);
    const title = { start: 1357, end: 1372, quote: 'Toxic Emission.' };
    expect(source.slice(title.start, title.end)).toBe(title.quote);
    const ir = structuredClone(mezz.ir) as MonsterIntakeIR;
    ir.creature.actions[3]!.evidence = [structuredClone(full)];
    ir.claims.find(claim => claim.path === '/creature/actions/3')!.evidence = [title];
    ir.creature.actions[3]!.save!.dc = 13;
    expect(ir.creature.actions[3]!.description).toBe(mezz.ir.creature.actions[3]!.description);
    const analysis = analyzeBrowserActorIntakeDraft({
      source, sourceName: 'Toxic full feature quote with title-only parent claim',
      requestId: 'historical-feature-claim-union', fvttVersion: '14.364', systemVersion: '5.3.3',
    }, ir, provider);
    expect(analysis.status).toBe('needs_review');
    expect(analysis.findings).toContainEqual(expect.objectContaining({
      code: 'SOURCE_STRUCTURED_RULE_MISMATCH', path: '/creature/actions/3', blocking: true,
    }));
    expect(analysis.calls).toEqual({ discovery: 0, extraction: 0, repair: 0, review: 0 });
  });

  test('an exact nested damage quote does not count the same Toxic Emission 4d8 twice', () => {
    const source = mezz.source;
    const originalClaim = mezz.ir.claims.find(claim => claim.path === '/creature/actions/3')!;
    const full = originalClaim.evidence[0]!;
    const nested = { start: 1520, end: 1542, quote: '18 (4d8)\nPoison damage' };
    expect(source.slice(full.start, full.end)).toBe(full.quote);
    expect(source.slice(nested.start, nested.end)).toBe(nested.quote);
    expect(nested.start).toBeGreaterThan(full.start);
    expect(nested.end).toBeLessThan(full.end);
    const ir = structuredClone(mezz.ir) as MonsterIntakeIR;
    ir.claims.find(claim => claim.path === '/creature/actions/3')!.evidence.push(nested);
    expect(ir.creature.actions[3]!.description).toBe(mezz.ir.creature.actions[3]!.description);
    const analysis = analyzeBrowserActorIntakeDraft({
      source, sourceName: 'Toxic overlapping exact damage quote',
      requestId: 'historical-overlapping-source-span', fvttVersion: '14.364', systemVersion: '5.3.3',
    }, ir, provider);
    expect(analysis.status).toBe('ready_to_generate');
    expect(analysis.findings.filter(finding => finding.blocking)).toEqual([]);
    expect(analysis.calls).toEqual({ discovery: 0, extraction: 0, repair: 0, review: 0 });
  });  test.each(saved)('$label keeps shared facts through source, Actor, Chinese draft, approval and readback', async entry => {
    const prepared = await sourceToPrepared(entry);
    expect(prepared.bundle.actors[0]?.sourceHash).toBe(hashSource(prepared.bundle.actors[0]!.source));
    const actor = prepared.actors[0]!.artifact as any;
    const plan = prepared.actors[0]!.rulePresentation;
    expect(plan).toBeDefined();
    const fixed = plan!.fields.flatMap(field => field.segments.filter(segment => segment.kind === 'fixed'));
    if (entry.label.startsWith('Sea Hag')) {
      expect(entry.ir.creature.actions[3]?.description).toContain('15-');
      expect(entry.ir.creature.actions[3]?.description).toContain('(Target’s Choice) DC 15.');
      const choiceField = plan!.fields.find(field => /15-\s*foot Emanation/iu.test(field.source.replace(/<[^>]*>/gu, ' '))
        && field.source.includes('Target’s Choice'));
      expect(choiceField).toBeDefined();
      expect(choiceField!.segments.some(segment => segment.kind === 'fixed'
        && segment.source.includes('Target’s Choice')
        && /15\s*尺/u.test(segment.zh) && segment.zh.includes('光环')
        && /(?:区域|范围)[^。；]{0,20}(?:每个|所有)生物|(?:每个|所有)生物[^。；]{0,20}(?:区域|范围)/u.test(segment.zh)
        && segment.zh.includes('自行选择')
        && segment.zh.includes('智力') && segment.zh.includes('感知')
        && /DC\s*15/u.test(segment.zh) && segment.zh.includes('恐慌')
        && /1\s*分钟/u.test(segment.zh)
        && segment.zh.includes('回合') && segment.zh.includes('结束')
        && segment.zh.includes('再次豁免') && segment.zh.includes('成功'))).toBe(true);
      expect(entry.ir.creature.actions[5]?.description).toContain('the hag can see within 60 feet');
      expect(fixed.some(segment => segment.source.includes('the hag can see within 60 feet')
        && segment.zh.includes('看') && /60\s*尺/u.test(segment.zh))).toBe(true);
      expect(fixed.some(segment => /keep solid food\s*down only if washed down with sea water/iu.test(segment.source.replace(/<[^>]*>/gu, ' '))
        && segment.zh.includes('海水') && segment.zh.includes('不吐出'))).toBe(true);
      const seed = actor.items.find((item: any) => item.name === 'Seed Terror');
      expect(seed).toBeDefined();
      const seedActivities=Object.values(seed.system.activities) as any[],seedSaves=seedActivities.filter(activity=>activity.type==='save');expect(seedSaves).toHaveLength(1);expect(seedSaves[0].save.ability).toEqual(['int','wis']);expect(seedSaves[0].save.dc.formula).toBe('15');expect(seedActivities.filter(activity=>activity.type!=='save').every(activity=>activity.type==='utility'&&!activity.save)).toBe(true);expect(seed.effects).toEqual([]);
      const seedSourceActor = JSON.stringify(seed);
      expect(seedSourceActor).toContain('Intelligence or Wisdom Saving Throw');
      expect(seedSourceActor).toContain('(Target’s Choice) DC 15');
      expect(seedSourceActor).toContain('Frightened for 1 minute (Save Ends at end of turn).');
    } else if (entry.label.startsWith('Gazer')) {
      expect(entry.ir.creature.actions[4]?.description).toContain('pushed 25 (1d10 x 5) feet');
      expect(fixed.some(segment => segment.source.includes('pushed 25 (1d10 x 5) feet')
        && segment.zh.includes('力量') && /DC\s*12/u.test(segment.zh)
        && /推离\s*25/u.test(segment.zh)
        && segment.zh.replace(/[×*]/gu, 'x').includes('1d10 x 5')
        && !segment.zh.includes('伤害')
        && segment.executionMode === 'gm-assisted')).toBe(true);
      const force = actor.items.find((item: any) => item.name === 'Force Ray');
      expect(force).toBeDefined();
      expect(JSON.stringify(force)).toContain('25 (1d10 x 5)');
      expect(Object.values(force.system.activities).some((activity: any) =>
        activity.type === 'save' && JSON.stringify(activity.save) === '{"ability":["str"],"dc":{"calculation":"","formula":"12"}}')).toBe(true);
      expect(Object.values(force.system.activities).some((activity: any) =>
        activity.type === 'save' && !JSON.stringify(activity.damage ?? {}).includes('1d10'))).toBe(true);
    } else if (entry.label.startsWith('Mezzoloth')) {
      expect(entry.ir.creature.bonusActions.find(action => action.name === 'Shred')?.description)
        .toContain('One creature Grappled by the mezzoloth takes 9 (2d8) Slashing damage, or half as much if it is wearing Heavy Armor.');
      expect(fixed.filter(segment => segment.source.includes('One creature Grappled by the mezzoloth')
        && segment.source.includes('or half as much if it is wearing Heavy Armor')
        && /被(?:该怪物|梅佐罗斯)[^。；]{0,8}(?:擒抱|受擒)/u.test(segment.zh)
        && segment.zh.includes('2d8')
        && segment.zh.includes('穿着重甲')
        && segment.zh.includes('伤害减半')
        && !segment.zh.includes('未穿着重甲')).length).toBeGreaterThanOrEqual(2);
      expect(actor.system.traits.languages.value).toContain('abyssal');
      expect(JSON.stringify(actor)).toContain('Heavy Armor');
      expect(actor.items.some((item: any) => item.name === 'Shred')).toBe(true);
    } else {
      const action = entry.ir.creature.actions.find(candidate => candidate.name === 'Longbow')!;
      expect(action.attack).toMatchObject({ type: 'rwak', toHit: 5, range: 150, longRange: 600 });
      expect(action.damage).toEqual([{ formula: '1d8 + 3', type: 'piercing', relationship: 'base' }]);
      expect(fixed.some(segment => segment.source.includes('range 150/600 ft.')
        && segment.source.includes('1d8 + 3')
        && /150\s*\/\s*600/u.test(segment.zh) && segment.zh.includes('1d8 + 3')
        && segment.zh.includes('穿刺'))).toBe(true);
      const bow = actor.items.find((item: any) => item.name === 'Longbow');
      expect(bow).toBeDefined();
      expect(bow.system.range).toMatchObject({ value: 150, long: 600, units: 'ft' });
      expect(bow.system.damage.base).toMatchObject({ number: 1, denomination: 8, types: ['piercing'] });
      const nativeAttacks = Object.values(bow.system.activities).filter((activity: any) => activity.type === 'attack') as any[];
      expect(nativeAttacks).toHaveLength(1);
      expect(nativeAttacks[0].range).toMatchObject({ value: 150, long: 600, units: 'ft' });
      expect(nativeAttacks[0].attack.ability).toBe('dex');
      const dexterityMod = Math.floor((Number(actor.system.abilities.dex.value) - 10) / 2);
      const explicitBonus = Number(bow.system.damage.base.bonus || 0);
      expect(dexterityMod + explicitBonus).toBe(3);
    }
    const originalActor = actor;
    let translationCalls = 0;
    let reviewCalls = 0;
    const draft = await draftForgeEncounterLocalization({
      prepared,
      service: {
        model: 'new-policy-fixture-only',
        reviewModel: 'disabled',
        translate: async request => {
          translationCalls++;
          expect(request.policy).toBe(FACT_LOCALIZATION_POLICY);
          return authoredTestTranslation(request);
        },
        review: async () => { reviewCalls++; return forbidden(); },
      },
    });
    expect(translationCalls).toBeGreaterThan(0);
    expect(reviewCalls).toBe(0);
    const actorDraft = draft.actors[0]!;
    expect(actorDraft.request.policy).toBe(FACT_LOCALIZATION_POLICY);
    expect(draft.packageText.request.policy).toBe(FACT_LOCALIZATION_POLICY);
    const source = prepared.bundle.actors[0]!.source;
    const request = createActorLocalizationRequest(originalActor, source, FACT_LOCALIZATION_POLICY, plan);
    expect(localizationHash(actorDraft.request)).toBe(localizationHash(request));
    const legacy = createActorLocalizationRequest(originalActor, source, LOCALIZATION_POLICY);
    expect(localizationHash(legacy)).not.toBe(localizationHash(request));

    const freeSources = [...actorDraft.request.texts, ...draft.packageText.request.texts].map(field => field.source);
    if (entry.label.startsWith('Sea Hag')) {
      expect(freeSources.some(text => /15-\s*foot Emanation/iu.test(text.replace(/<[^>]*>/gu, ' ')))).toBe(false);
      expect(freeSources.some(text => text.includes('(Target’s Choice) DC 15.'))).toBe(false);
      expect(freeSources.some(text => text.includes('the hag can see within 60 feet'))).toBe(false);
      expect(freeSources.some(text => /keep solid food\s*down only if washed down with sea water/iu.test(text.replace(/<[^>]*>/gu, ' ')))).toBe(false);
    } else if (entry.label.startsWith('Gazer')) {
      expect(freeSources.some(text => text.includes('pushed 25 (1d10 x 5) feet'))).toBe(false);
    } else if (entry.label.startsWith('Mezzoloth')) {
      expect(freeSources.some(text => text.includes('or half as much if it is wearing Heavy Armor'))).toBe(false);
    } else {
      expect(freeSources.some(text => text.includes('Ranged Weapon Attack: +5 to hit, range 150/600 ft.'))).toBe(false);
    }
    if (!plan) throw new Error('Missing verified rule presentation plan');
    const rows = actorLocalizationDisplayRows(originalActor, source, actorDraft.draft, plan);
    expect(rows.some(row => row.fixedBlocks.length > 0)).toBe(true);
    for (const row of rows) for (const block of row.fixedBlocks) {
      expect(row.fullSource).toContain(block.source);
      expect(row.assembledZh).toContain(block.zh);
      expect(actorDraft.request.texts.some(field => field.source === block.source)).toBe(false);
      expect(block.factRefs.length).toBeGreaterThan(0);
    }
    if (entry.label.startsWith('Sea Hag')) {
      expect(rows.some(row => row.assembledZh.includes('智力') && row.assembledZh.includes('感知'))).toBe(true);
      expect(rows.some(row => row.assembledZh.includes('海水') && row.assembledZh.includes('不吐出'))).toBe(true);
    } else if (entry.label.startsWith('Gazer')) {
      expect(rows.some(row => row.assembledZh.includes('推离') && row.assembledZh.includes('12'))).toBe(true);
    } else if (entry.label.startsWith('Mezzoloth')) {
      expect(rows.filter(row => row.assembledZh.includes('重甲') && row.assembledZh.includes('减半')).length)
        .toBeGreaterThanOrEqual(2);
      for (const field of mezz.recordedFailure.fields) {
        expect(actorDraft.request.texts.some(text => text.source === field.source)).toBe(false);
      }
    } else {
      expect(rows.some(row => row.assembledZh.includes('1d8 + 3'))).toBe(true);
    }

    const savedDraft = JSON.parse(JSON.stringify(draft));
    assertForgeEncounterLocalizationDraft(prepared, savedDraft);
    const stale = structuredClone(savedDraft);
    stale.actors[0].request.sourceHash = '0'.repeat(64);
    expect(() => assertForgeEncounterLocalizationDraft(prepared, stale)).toThrow();
    const approved = await approveForgeEncounterLocalization({
      prepared, draft: savedDraft, gmId: 'offline-test-gm-not-real-approval',
    });
    expect(approved.bundle.localization?.actors[0]?.translation.policy).toBe(FACT_LOCALIZATION_POLICY);
    expect(approved.bundle.localization?.actors[0]?.translation.version).toBe(2);
    expect(mechanics(approved.actors[0]!.artifact)).toEqual(mechanics(originalActor));
    const restored = await prepareForgeEncounter(serializeForgeEncounterPackage(approved.bundle));
    expect(restored.hash).toBe(approved.hash);
    expect(mechanics(restored.actors[0]!.artifact)).toEqual(mechanics(originalActor));
    expect(reviewCalls).toBe(0);
  });
  test('a real old-policy approval cannot authorize a facts-policy request', () => {
    const field = localizationText('title', 'Guard');
    const oldRequest = localizationRequest('source-bound-fixture', [field], LOCALIZATION_POLICY);
    const factsRequest = localizationRequest('source-bound-fixture', [field], FACT_LOCALIZATION_POLICY);
    const oldApproval = approveLocalizationByGm(oldRequest, { texts: [{ id: field.id, text: '守卫' }] },
      'offline-test-gm-not-real-approval');
    expect(() => assertReviewedLocalization(factsRequest, oldApproval)).toThrow();
  });
});
