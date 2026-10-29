import yaml from 'js-yaml';
import { nativeAreaShape } from '@fvtt-json-generator/models/source-operations';
import { renderMonsterFeatureName, renderMonsterIntakeMarkdown } from './renderer';
import { sourceRuleText } from './source-completeness';
import {legendaryResistanceBinding} from './native-resources';
import type { CanonicalFeature, MonsterIntakeIR } from './types';

type FindingWriter = (code: string, path: string, message: string) => void;
const sections = ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions', 'mythicActions'] as const;
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const records = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.map(record) : [];
const periodKey = { day: 'day', longRest: 'lr', shortRest: 'sr', dawn: 'dawn' } as const;
const visible = (value: string) => sourceRuleText(value).replace(/\s+/gu, '');
const deferredDamage = (part: NonNullable<CanonicalFeature['damage']>[number]) => !['base', 'additional'].includes(part.relationship) || Boolean(part.condition);

export function hasLiteralDamageHelpers(feature: CanonicalFeature): boolean {
  return !feature.executionMode && Boolean(feature.damage?.some(deferredDamage));
}

export function isLiteralDamageHelperOnly(feature: CanonicalFeature): boolean {
  return hasLiteralDamageHelpers(feature) && !feature.attack && !feature.save && feature.activityType === 'damage'
    && !feature.damage!.some(part => ['base', 'additional'].includes(part.relationship)) && !feature.uses && !feature.recharge;
}

/** Checks only the AI-authored contract and its projections. There is
 * deliberately no raw-source parameter or source-content inference here. */
export function verifyMonsterProjectionPreservation(
  ir: MonsterIntakeIR,
  markdown: string,
  projection: Record<string, unknown>,
  add: FindingWriter,
): void {
  // Comparing decoded YAML permits equivalent quoting, whitespace and key
  // order while still checking every mechanical value against the IR render.
  // Historical review receipts are evidence, not a new review verdict.
  try {
    const expected = frontmatter(renderMonsterIntakeMarkdown(ir));
    const actual = frontmatter(markdown);
    const drift = firstDifference(canonical(expected), canonical(actual), '/markdown');
    if (drift) add('MARKDOWN_IR_PROJECTION_DRIFT', drift.path, `Rendered Markdown changed the AI IR projection: expected ${summary(drift.expected)}, got ${summary(drift.actual)}.`);
  } catch (error) {
    add('MARKDOWN_IR_PROJECTION_INVALID', '/markdown', error instanceof Error ? error.message : 'The Markdown projection cannot be decoded.');
  }

  const creature = ir.creature;
  for (const text of [creature.biography, creature.legendary?.preamble, creature.attributes.acNote]) {
    if (text?.trim() && !visible(String(projection.biography ?? '')).includes(visible(text))) {
      add('ACTOR_BIOGRAPHY_LOSS', '/creature/biography', 'The Actor biography lost text explicitly retained in the AI IR.');
    }
  }
  const items = records(projection.items);
  const nativeResistance=legendaryResistanceBinding(creature);
  for (const section of sections) for (const [index, feature] of (creature[section] ?? []).entries()) {
    const path = `/creature/${section}/${index}`;
    const name = renderMonsterFeatureName(feature);
    const matches = items.filter(item => feature.sourceFeatureId
      ? item.sourceFeatureId === feature.sourceFeatureId
      : String(item.name ?? '').toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
    if (matches.length !== 1) {
      add('ACTOR_FEATURE_IDENTITY_DRIFT', path, `Expected one Actor feature for the AI IR entry ${name}, found ${matches.length}.`);
      continue;
    }
    const found = matches[0]!;
    if (visible(feature.description) && !visible(String(found.description ?? '')).includes(visible(feature.description))) {
      add('ACTOR_DESCRIPTION_LOSS', `${path}/description`, `Actor feature lost part of the AI-authored description for ${name}.`);
    }
    if (feature.sourceFeatureId && found.name !== name) add('ACTOR_FEATURE_IDENTITY_DRIFT', path, 'The feature with this IR identity changed its rendered name.');

    // The native counter and exact attribute cost are checked by verifier.ts.
    if(nativeResistance?.feature===feature&&found.identifier==='legendary-resistance')continue;
    const pool = creature.sourceResourcePools?.find(pool => pool.members.some(member => member.collection === section && member.index === index));
    const carrier = pool?.members[0]?.featureId === feature.sourceFeatureId;
    const max = pool ? carrier ? pool.max : undefined : feature.uses?.max ?? (feature.recharge ? 1 : undefined);
    const recovery = pool ? carrier ? [{ period: periodKey[pool.period], type: 'recoverAll' }] : []
      : feature.uses ? [{ period: periodKey[feature.uses.period], type: 'recoverAll' }]
        : feature.recharge ? [{ period: 'recharge', type: 'recoverAll', formula: String(feature.recharge[0]) }] : [];
    if (record(found.uses).max !== max || !equal(found.useRecovery, recovery)) {
      add('ACTOR_RESOURCE_PROJECTION_DRIFT', path, 'Feature uses and recovery do not preserve the explicit AI IR resource contract.');
    }
    // Source-operation and mixed-mode activities have dedicated detailed
    // comparisons in verifier.ts. Ordinary activities need the same exact
    // IR-owned area, success outcome and optional resource checks.
    if (!feature.sourceOperations && !feature.executionMode) verifyOrdinaryActivity(feature, found, path, add);
  }
  for (const [index, group] of (creature.spellcasting ?? []).entries()) {
    const found = items.find(item => String(item.name ?? '').includes(group.featureName)
      && (!group.featureEnglishName || String(item.name ?? '').includes(group.featureEnglishName)));
    if (!found || !visible(String(found.description ?? '')).includes(visible(group.description))) {
      add('ACTOR_SPELLCASTING_DESCRIPTION_LOSS', `/creature/spellcasting/${index}/description`, 'The linked spellcasting Item lost AI-authored rule text.');
    }
  }
}

function verifyOrdinaryActivity(feature: CanonicalFeature, found: Record<string, any>, path: string, add: FindingWriter): void {
  const allActivities = records(found.activities);
  const activities = hasLiteralDamageHelpers(feature)
    ? verifyLiteralDamageHelpers(feature, found, allActivities, path, add) : allActivities;
  if (feature.aoe) {
    const expectedShape = nativeAreaShape(feature.aoe.shape, feature.aoe.radius, feature.nativeRuleText ?? feature.description);
    if (!activities.some(activity => {
      const area = record(activity.areaTemplate);
      return area.type === (expectedShape === 'rectangle' ? 'square' : expectedShape) && Number(area.size) === feature.aoe!.radius && area.units === 'ft';
    })) add('ACTOR_AREA_PROJECTION_DRIFT', `${path}/aoe`, 'The native area lost the IR shape, size or units.');
  }
  if (feature.save?.outcome !== undefined && (feature.damage?.length ?? 0) > 0
    && !activities.some(activity => activity.type === 'save' && activity.onSave === feature.save!.outcome)) {
    add('ACTOR_SAVE_OUTCOME_DRIFT', `${path}/save/outcome`, 'The Save Activity lost the success outcome explicitly selected in the AI IR.');
  }
  if (feature.uses || feature.recharge) {
    if (activities.some(activity => {
      const costs = records(record(activity.consumption).targets);
      return costs.length !== 1 || costs[0]!.type !== 'itemUses' || costs[0]!.target !== '' || String(costs[0]!.value) !== '1';
    })) add('ACTOR_RESOURCE_CONSUMPTION_DRIFT', `${path}/uses`, 'Activity consumption no longer uses the feature pool exactly once.');
  }
}

function verifyLiteralDamageHelpers(feature: CanonicalFeature, found: Record<string, any>, activities: Record<string, any>[], path: string, add: FindingWriter): Record<string, any>[] {
  const parts = feature.damage!;
  const marker = record(found.literalMechanics);
  const normalizePart = (part: unknown) => {
    const value = record(part);
    return { ...value, formula: String(value.formula ?? '').replace(/\s+/gu, ''), ...(value.condition === undefined ? {} : { condition: String(value.condition).trim() }) };
  };
  if (marker.version !== 1 || !Array.isArray(marker.sourceDamageParts)
    || !equal(marker.sourceDamageParts.map(normalizePart), parts.map(normalizePart))) {
    add('ACTOR_DAMAGE_IR_LEDGER_DRIFT', `${path}/damage`, 'The stored damage ledger must preserve every explicit AI formula, relationship and condition.');
  }
  const helpers = activities.filter(activity => Object.keys(record(activity.literalDamage)).length > 0);
  const primary = activities.filter(activity => !helpers.includes(activity));
  const deferred = parts.flatMap((part, index) => deferredDamage(part) ? [{ part, index }] : []);
  const ordinary = parts.filter(part => !deferredDamage(part));
  const expectedPrimaryCount = isLiteralDamageHelperOnly(feature) ? 0 : 1;
  if (primary.length !== expectedPrimaryCount || helpers.length !== deferred.length) {
    add('ACTOR_DAMAGE_ACTIVITY_COUNT_DRIFT', `${path}/damage`, 'Each conditional or replacement part needs exactly one separate GM damage roll, in addition to its declared primary operation.');
  }
  const damageView = (part: NonNullable<CanonicalFeature['damage']>[number]) => ({ formula: part.formula.replace(/\s+/gu, ''), types: part.types ?? [part.type] });
  const actualParts = (value: unknown) => records(value).map(part => ({ formula: String(part.formula ?? '').replace(/\s+/gu, ''), types: part.types }));
  if (primary.some(activity => !equal(actualParts(activity.effectiveDamageParts), ordinary.map(damageView)))) {
    add('ACTOR_PRIMARY_DAMAGE_DRIFT', `${path}/damage`, 'The primary roll must contain exactly the unconditional AI damage parts, with no conditional or replacement part applied automatically.');
  }
  for (const { part, index } of deferred) {
    const matches = helpers.filter(activity => record(activity.literalDamage).partIndex === index);
    const helper = matches[0], ledger = record(helper?.literalDamage), at = `${path}/damage/${index}`;
    if (matches.length !== 1 || ledger.version !== 1 || !equal(normalizePart(ledger.part), normalizePart(part))) {
      add('ACTOR_DAMAGE_HELPER_IDENTITY_DRIFT', at, 'The GM damage helper lost its exact AI damage-part identity or relationship.');
      if (!helper) continue;
    }
    if (helper!.type !== 'damage' || helper!.name !== `${part.relationship === 'replacement' ? 'GM替代伤害' : 'GM条件伤害'} ${index + 1}`
      || helper!.activation !== 'special' || helper!.activationValue !== null || helper!.activationOverride !== true || helper!.condition !== (part.condition?.trim() ?? '')
      || !visible(String(helper!.description ?? '')).includes(visible(feature.description))) {
      add('ACTOR_DAMAGE_HELPER_BOUNDARY_DRIFT', at, 'The helper must remain a separately triggered GM roll with the complete AI condition and description.');
    }
    if (!equal(actualParts(helper!.effectiveDamageParts), [damageView(part)]) || helper!.includeBase !== undefined
      || Object.keys(record(helper!.attackData)).length || Object.keys(record(helper!.saveData)).length || Object.keys(record(helper!.rollData)).length || Number(helper!.effectLinks) !== 0) {
      add('ACTOR_DAMAGE_HELPER_ROLL_DRIFT', at, 'The helper must roll exactly its own AI damage formula and type choices, without an extra base roll, Attack, Save or Effect.');
    }
    const consumption = record(helper!.consumption), scaling = record(consumption.scaling), uses = record(helper!.uses);
    if (!Array.isArray(consumption.targets) || consumption.targets.length !== 0 || consumption.spellSlot !== false || scaling.allowed !== false || scaling.max !== ''
      || ![undefined, null, ''].includes(uses.max) || ![undefined, 0].includes(uses.spent) || records(uses.recovery).length) {
      add('ACTOR_DAMAGE_HELPER_RESOURCE_DRIFT', at, 'A GM conditional or replacement damage helper cannot consume the primary resource again, add a spell-slot cost or create an independent pool.');
    }
    if (primary.length && (!equal(helper!.range, primary[0]!.range) || !equal(helper!.targetAffects, primary[0]!.targetAffects))
      || !primary.length && feature.range !== undefined && (Number(record(helper!.range).value) !== feature.range || record(helper!.range).units !== 'ft')) {
      add('ACTOR_DAMAGE_HELPER_TARGET_DRIFT', at, 'The damage helper must preserve its explicit inherited range and target rather than introducing a different recipient.');
    }
  }
  return primary;
}

function frontmatter(markdown: string): unknown {
  const match = markdown.replace(/\r\n?/gu, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/u);
  if (!match) throw new Error('Missing YAML frontmatter in the Markdown projection.');
  const document = yaml.load(match[1]!);
  // Forge adds a storage identity after rendering, and may retain an older
  // review receipt. Neither is an AI-authored mechanical field to regenerate.
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    const root = document as Record<string, unknown>;
    delete root['forge-source-id'];
    delete root['intake-candidate-review'];
    // Earlier Markdown carries the same parent pool solely in its portable
    // manifest. Fill only an absent redundant display field in this comparison
    // view; an explicitly different value still remains a projection drift.
    const groups = records(record(root['法术清单']).spellcastingGroups);
    for (const section of ['特性', '动作', '附赠动作', '反应', '传奇动作', '神话动作']) for (const feature of records(root[section])) {
      if (feature['使用次数'] !== undefined || typeof feature.spellcastingFeatureKey !== 'string') continue;
      const group = groups.find(group => group.featureItemKey === feature.spellcastingFeatureKey);
      const uses = records(group?.spellRefs).map(ref => record(ref.uses)).filter(use => use.shared === true && use.recovery === 'day');
      if (uses.length && uses.every(use => Number.isSafeInteger(use.value) && use.value > 0 && use.value === uses[0]!.value)) feature['使用次数'] = { max: uses[0]!.value, period: 'day' };
    }
  }
  return document;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function canonical(value: unknown): unknown {
  return Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'candidateReview' && key !== 'literalMechanics')
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value;
}

function firstDifference(expected: unknown, actual: unknown, path: string): { path: string; expected: unknown; actual: unknown } | undefined {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && Array.isArray(expected) === Array.isArray(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const escaped = key.replace(/~/gu, '~0').replace(/\//gu, '~1');
      const difference = firstDifference((expected as any)[key], (actual as any)[key], `${path}/${escaped}`);
      if (difference) return difference;
    }
  }
  return { path, expected, actual };
}

function summary(value: unknown): string { return (JSON.stringify(value) ?? 'undefined').slice(0, 160); }
