import {displayName} from '@fvtt-json-generator/models/display-name';
import yaml from 'js-yaml';
import { projectedConditionStatusId, readConditionInstance } from '@fvtt-json-generator/contracts/conditions';
import { readEncounterRuleMarker } from '@fvtt-json-generator/contracts/encounter-rules';
import {
  findForbiddenTargetWorldIdentifiers,
  hashManifest,
  RESOLVER_MODULE_ID,
  validatePortableSpellManifest,
  type PortableSpellManifest,
} from '@fvtt-json-generator/spell-manifest-contracts';
import type {
  AbilityKey,
  CanonicalFeature,
  IntakeFinding,
  MonsterIntakeIR,
  PortableSpellResolutionStatus,
} from './types';
import { renderPreparedSpellcastingProfile } from './renderer';
import { formatMixedRuleHtml } from '@fvtt-json-generator/generation/actor-text';
import { sourceConditionLifecycle, isGeneratedConditionId } from '@fvtt-json-generator/generation/actor-effects';
import { validateMonsterIntakeIR } from './validator';
import { hasManualForcedMovementMechanic, manualForcedMovementRequirements } from './manual-forced-movement';
import { completeSourceFeatureEvidence, sourceFeatureLegendaryCost, sourceRuleText } from './source-completeness';
import {sourceStatHeader} from './staged-source';
import {sourceSenseQualifier} from './staged-source-facts';
import {headerPresentation} from './header-presentation';
import {sourceAttackDamageModes,sourceFeatureResources,sourceOperationTargetType,sourceOperationSelfTarget,sourceOperationSelfArea} from '@fvtt-json-generator/models/source-operations';

export interface IntakeVerificationReport {
  schemaVersion: 1;
  status: 'accepted' | 'needs_review';
  findings: IntakeFinding[];
  projection: Record<string, unknown>;
  spellResolution: PortableSpellResolutionStatus;
}

export function verifyMonsterIntake(
  source: string,
  ir: MonsterIntakeIR,
  markdown: string,
  actor: unknown,
  coverageRange?: { start: number; end: number },
): IntakeVerificationReport {
  const findings = [...validateMonsterIntakeIR(source, ir, { coverageRange }).findings];
  const expected = ir.creature;
  const projection = projectActor(actor, {
    skillKeys: Object.keys(expected.skills).map(normalizeSkillKey),
    saveKeys: Object.keys(expected.saves),
    includeInitiative: expected.attributes.initiative != null,
  });
  const expectedSkillKeys = new Set(Object.keys(expected.skills).map(normalizeSkillKey));
  const add = (code: string, path: string, message: string) => findings.push({
    id: `${code.toLowerCase()}:${path}`.replace(/[^a-z0-9:/_-]+/g, '-'),
    code, path, message, blocking: true, origin: 'semantic',
  });
  try {
    const scope=coverageRange??{start:0,end:source.length};
    const header=sourceStatHeader({source,sourceSha256:ir.source.sha256,candidate:{id:'sense-qualifier',label:expected.identity.name,...scope,quote:source.slice(scope.start,scope.end)}});
    const rule=sourceSenseQualifier(header.quote);
    if(rule){
      const visible=(value:string)=>sourceRuleText(headerPresentation(value));
      const texts=[expected.biography??'',...featureDescriptions(expected)];
      if(!texts.some(value=>visible(value).includes(visible(rule.quote))))add('SOURCE_SENSE_QUALIFIER_OMITTED','/creature/senses','The complete sense restriction must remain visible for GM adjudication; it is not an unconditional Blinded effect.');
      const emitted=[String(projection.biography??''),...(Array.isArray(asRecord(actor).items)?asRecord(actor).items as unknown[]:[]).map(item=>String(asRecord(asRecord(asRecord(item).system).description).value??''))];
      if(!emitted.some(value=>visible(value).includes(visible(rule.quote))))add('ACTOR_SENSE_QUALIFIER_LOSS','/creature/senses','The final Actor lost the complete source sense restriction.');
    }
  }catch{/* Header/hash failures already remain blocking in the validator. */}
  const actualName = String(projection.name ?? '');
  const foldedName = actualName.toLowerCase();
  if (!foldedName.includes(expected.identity.name.toLowerCase()) || (expected.identity.englishName && !foldedName.includes(expected.identity.englishName.toLowerCase()))) {
    add('ACTOR_NAME_DRIFT', '/creature/identity/name', `Expected actor name to preserve ${expected.identity.name}${expected.identity.englishName ? ` / ${expected.identity.englishName}` : ''}, got ${actualName}.`);
  }
  compare(add, 'ACTOR_AC_DRIFT', '/creature/attributes/ac', expected.attributes.ac, projection.ac);
  compare(add, 'ACTOR_HP_DRIFT', '/creature/attributes/hp/value', expected.attributes.hp.value, projection.hp);
  compare(add, 'ACTOR_HP_FORMULA_DRIFT', '/creature/attributes/hp/formula', compact(expected.attributes.hp.formula), compact(projection.hpFormula));
  compare(add, 'ACTOR_CR_DRIFT', '/creature/attributes/cr', expected.attributes.cr, projection.cr);
  compare(add, 'ACTOR_XP_DRIFT', '/creature/attributes/xp', expected.attributes.xp, projection.xp);
  compare(add, 'ACTOR_PB_DRIFT', '/creature/attributes/proficiencyBonus', expected.attributes.proficiencyBonus, projection.proficiencyBonus);
  compare(add, 'ACTOR_INITIATIVE_DRIFT', '/creature/attributes/initiative', expected.attributes.initiative, projection.initiative);
  compare(add, 'ACTOR_SIZE_DRIFT', '/creature/identity/size', expected.identity.size, projection.size);
  compare(add,'ACTOR_SWARM_SIZE_DRIFT','/creature/identity/swarmSize',expected.identity.swarmSize,projection.swarmSize);
  if(expected.identity.swarmSize===undefined&&projection.swarmSize!==undefined)add('ACTOR_SWARM_SIZE_DRIFT','/creature/identity/swarmSize','An ordinary creature cannot acquire a swarm member size without source evidence.');
  if(expected.legendary)compare(add,'ACTOR_LEGENDARY_BUDGET_DRIFT','/creature/legendary/max',expected.legendary.max,
    numeric(asRecord(asRecord(asRecord(asRecord(actor).system).resources).legact).max));
  compare(add, 'ACTOR_TYPE_DRIFT', '/creature/identity/creatureType', normalizeCreatureTypeFixed(expected.identity.creatureType), normalizeCreatureTypeFixed(projection.creatureType));
  compare(add, 'ACTOR_CREATURE_TYPE_CUSTOM_DRIFT', '/creature/identity/creatureTypeCustom', compact(expected.identity.creatureTypeCustom), compact(projection.creatureTypeCustom));
  for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as AbilityKey[]) {
    compare(add, 'ACTOR_ABILITY_DRIFT', `/creature/abilities/${ability}`, expected.abilities[ability], (projection.abilities as Record<string, unknown>)?.[ability]);
  }
  for (const [kind, value] of Object.entries(expected.attributes.movement)) {
    compare(add, 'ACTOR_MOVEMENT_DRIFT', `/creature/attributes/movement/${kind}`, value, (projection.movement as Record<string, unknown>)?.[kind]);
  }
  for (const [ability, value] of Object.entries(expected.saves)) compare(add, 'ACTOR_SAVE_DRIFT', `/creature/saves/${ability}`, value, (projection.saves as Record<string, unknown>)?.[ability]);
  for (const [skill, value] of Object.entries(expected.skills)) {
    const canonicalSkill = normalizeSkillKey(skill);
    compare(add, 'ACTOR_SKILL_DRIFT', `/creature/skills/${skill}`, value, (projection.skills as Record<string, unknown>)?.[canonicalSkill]);
  }
  for (const skill of Object.keys(projection.skills as Record<string, unknown>)) {
    if (!expectedSkillKeys.has(skill)) add('ACTOR_UNSOURCED_SKILL', `/actorProjection/skills/${skill}`, `Actor configures an unlisted skill: ${skill}.`);
  }
  compareSet(add, 'ACTOR_RESISTANCE_DRIFT', '/creature/defenses/resistances', expected.defenses.resistances, projection.resistances);
  compareSet(add, 'ACTOR_IMMUNITY_DRIFT', '/creature/defenses/immunities', expected.defenses.immunities, projection.immunities);
  compareSet(add, 'ACTOR_VULNERABILITY_DRIFT', '/creature/defenses/vulnerabilities', expected.defenses.vulnerabilities, projection.vulnerabilities);
  compareSet(add, 'ACTOR_CONDITION_IMMUNITY_DRIFT', '/creature/defenses/conditionImmunities', expected.defenses.conditionImmunities, projection.conditionImmunities, normalizeCondition);
  for (const [sense, value] of Object.entries(expected.senses)) compare(add, 'ACTOR_SENSE_DRIFT', `/creature/senses/${sense}`, value, (projection.senses as Record<string, unknown>)?.[sense]);
  compareSet(add, 'ACTOR_LANGUAGE_DRIFT', '/creature/languages/values', expected.languages.values, projection.languages, normalizeLanguageFixed);
  compare(add, 'ACTOR_LANGUAGE_NOTE_DRIFT', '/creature/languages/custom', expected.languages.custom, projection.languageCustom);
  const featureContext={source,ir,range:coverageRange,isV14:/^14(?:\.|$)/u.test(String(asRecord(asRecord(actor)._stats).coreVersion??''))};
  compareFeatureSections(add, expected.traits, projection.items, 'traits',featureContext);
  compareFeatureSections(add, expected.actions, projection.items, 'actions',featureContext);
  compareFeatureSections(add, expected.bonusActions, projection.items, 'bonusActions',featureContext);
  compareFeatureSections(add, expected.reactions, projection.items, 'reactions',featureContext);
  compareFeatureSections(add, expected.legendaryActions, projection.items, 'legendaryActions',featureContext);
  compareFeatureSections(add, expected.mythicActions ?? [], projection.items, 'mythicActions',featureContext);
  for (const requirement of manualForcedMovementRequirements(ir, source)) {
    const featureIndex = Number(requirement.claimPath.split('/').at(-1));
    const sourceSection = requirement.claimPath.split('/')[2]!;
    const feature = (expected as any)[sourceSection][featureIndex] as CanonicalFeature;
    const rawItems = asRecord(actor).items;
    const items = Array.isArray(rawItems) ? rawItems.map(asRecord).filter(item => featureNamesMatch(item, feature)) : [];
    const manual = items.length === 1 && hasManualForcedMovementMechanic(items[0]!, requirement);
    add(manual ? 'ACTOR_FORCED_MOVEMENT_REQUIRES_GM' : 'ACTOR_FORCED_MOVEMENT_UNBOUND', requirement.claimPath,
      manual ? `${requirement.featureName} keeps its native Save and complete failed-save push for GM handling; token movement is not automatic.`
        : `${requirement.featureName} requires a complete source-bound GM rule for its failed-save push.`);
  }

  const spellResolution = verifyPortableSpellResolution(source, ir, markdown, actor, add, () => findings.length);
  // YAML may quote CRLF-containing strings with escaped newlines. Inspect the
  // decoded description, while retaining the exact source evidence separately.
  const decodedDescriptions:string[]=[];
  const frontmatter=markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if(frontmatter){try{
    const document=asRecord(yaml.load(frontmatter[1]!));
    for(const section of ['特性','动作','附赠动作','反应','传奇动作','神话动作']){
      for(const entry of Array.isArray(document[section])?document[section] as unknown[]:[]){
        const description=asRecord(entry)['描述'];if(typeof description==='string')decodedDescriptions.push(description);
      }
    }
  }catch{/* Invalid YAML is rejected by the formal parser. */}}
  for (const requiredText of featureDescriptions(expected)) {
    if (!compact(markdown)?.includes(compact(requiredText) ?? '')
      &&!decodedDescriptions.some(text=>sourceRuleText(text).includes(sourceRuleText(requiredText)))) add('MARKDOWN_DESCRIPTION_LOSS', '/markdown', `Rendered Markdown lost feature text: ${requiredText.slice(0, 80)}`);
  }
  if (expected.attributes.acNote?.trim() && !markdown.includes(expected.attributes.acNote.trim())) {
    add('MARKDOWN_AC_NOTE_LOSS', '/markdown/护甲等级', `Rendered Markdown lost conditional AC text: ${expected.attributes.acNote}`);
  }
  if (markdown.includes('护甲等级: 20') && expected.attributes.ac !== 20) add('TEMPLATE_DEFAULT_LEAK', '/markdown/护甲等级', 'Rendered Markdown contains a conflicting template AC 20.');
  if (markdown.includes('生命值: 332') && expected.attributes.hp.value !== 332) add('TEMPLATE_DEFAULT_LEAK', '/markdown/生命值', 'Rendered Markdown contains a conflicting template HP 332.');

  const deduped = dedupe(findings);
  return {
    schemaVersion: 1,
    status: deduped.some((finding) => finding.blocking) ? 'needs_review' : 'accepted',
    findings: deduped,
    projection,
    spellResolution,
  };
}

function verifyPortableSpellResolution(
  source: string,
  ir: MonsterIntakeIR,
  markdown: string,
  actor: unknown,
  add: (code: string, path: string, message: string) => void,
  findingCount: () => number,
): PortableSpellResolutionStatus {
  const expectedManifest = extractRenderedSpellManifest(markdown);
  const required = Boolean(ir.creature.spellcasting?.some(group=>group.usageGroups.some(usage=>usage.spellRefs.length)));
  if (!required) return { required: false, status: 'not-required', spellCount: 0 };

  const actorRoot = asRecord(actor);
  const resolver = asRecord(asRecord(actorRoot.flags)[RESOLVER_MODULE_ID]);
  const actualManifest = resolver.spellManifest;
  const spellCount = ir.creature.spellcasting!
    .flatMap((group) => group.usageGroups)
    .reduce((count, group) => count + group.spellRefs.length, 0);
  const findingStart = findingCount();

  let expectedPrepared: ReturnType<typeof renderPreparedSpellcastingProfile>;
  try {
    expectedPrepared = renderPreparedSpellcastingProfile(ir.creature);
  } catch (error) {
    add(
      'CONFLICTING_PREPARED_SPELLCASTING_PROFILE',
      '/creature/spellcasting',
      error instanceof Error ? error.message : 'Prepared spellcasting groups cannot share one Actor profile.',
    );
  }
  if (expectedPrepared) {
    const actorSystem = asRecord(actorRoot.system);
    const attributes = asRecord(actorSystem.attributes);
    const details = asRecord(actorSystem.details);
    const spells = asRecord(actorSystem.spells);
    if (attributes.spellcasting !== expectedPrepared.ability) {
      add(
        'PREPARED_SPELLCASTING_ABILITY_DRIFT',
        '/actor/system/attributes/spellcasting',
        `Prepared spellcasting ability must remain ${expectedPrepared.ability}.`,
      );
    }
    if (details.spellLevel !== expectedPrepared.casterLevel) {
      add(
        'PREPARED_SPELLCASTER_LEVEL_DRIFT',
        '/actor/system/details/spellLevel',
        `Prepared spellcaster level must remain ${expectedPrepared.casterLevel}.`,
      );
    }
    for (const [level, value] of Object.entries(expectedPrepared.slots)) {
      const slot = asRecord(spells[`spell${level}`]);
      if (slot.value !== value) {
        add(
          'PREPARED_SPELL_SLOT_DRIFT',
          `/actor/system/spells/spell${level}/value`,
          `Prepared level-${level} spell slots must remain ${value}.`,
        );
      }
    }
  }

  if (!expectedManifest) {
    add('RENDERED_SPELL_MANIFEST_MISSING', '/markdown', 'Rendered caster Markdown is missing its portable spell manifest.');
  }

  const validated = validatePortableSpellManifest(actualManifest, source);
  if (!validated.ok) {
    for (const finding of validated.findings) {
      add(finding.code, `/actor/flags/${RESOLVER_MODULE_ID}/spellManifest${finding.path === '/' ? '' : finding.path}`, finding.message);
    }
  }

  if (expectedManifest && !canonicalEqual(actualManifest, expectedManifest)) {
    add(
      'PORTABLE_SPELL_MANIFEST_DRIFT',
      `/actor/flags/${RESOLVER_MODULE_ID}/spellManifest`,
      'Portable Actor spell manifest differs from the source-derived rendered manifest.',
    );
  }

  for (const forbidden of findForbiddenTargetWorldIdentifiers(actor)) {
    add(forbidden.code, forbidden.path, `Portable Actor contains a destination-world document identifier: ${forbidden.match}.`);
  }

  const items = Array.isArray(actorRoot.items) ? actorRoot.items : [];
  for(const group of ir.creature.spellcasting??[]){
    if(!group.usageGroups.length||!group.activationType)continue;
    const feature=items.find((item:any)=>item.flags?.[RESOLVER_MODULE_ID]?.groupId===group.groupId);
    if(feature?.flags?.fvttJsonGenerator?.spellcastingActivationType!==group.activationType)add('SPELL_ACTIVATION_DRIFT','/actor/items','Explicit source casting timing must survive into the generated feature marker.');
  }
  for(const group of ir.creature.spellcasting??[]){
    const shared=group.usageGroups.find(usage=>usage.usage==='daily-shared');
    if(shared?.usage!=='daily-shared')continue;
    const feature=items.find((item:any)=>item.flags?.[RESOLVER_MODULE_ID]?.groupId===group.groupId);
    const uses=feature?.system?.uses;
    if(String(uses?.max)!==String(shared.count)||uses?.spent!==0||!uses?.recovery?.some((r:any)=>r.period==='day'&&r.type==='recoverAll'))add('SHARED_SPELL_POOL_DRIFT','/actor/items','Shared spell feature uses must preserve the exact source count and daily recovery.');
  }
  items.forEach((item, index) => {
    const itemRecord = asRecord(item);
    if (itemRecord.type === 'spell') {
      add('PORTABLE_ACTOR_EMBEDDED_SPELL', `/actor/items/${index}`, 'Portable caster Actors must not contain embedded placeholder or resolved Spells.');
    }
    for (const [activityKey, activity] of Object.entries(asRecord(asRecord(itemRecord.system).activities))) {
      const activityRecord = asRecord(activity);
      if (activityRecord.type === 'cast') {
        add(
          'PORTABLE_ACTOR_CAST_ACTIVITY',
          `/actor/items/${index}/system/activities/${activityKey}`,
          'Portable caster Actors must not contain pre-runtime Cast Activities.',
        );
      }
      const activityFlags = asRecord(asRecord(activityRecord.flags)[RESOLVER_MODULE_ID]);
      if (activityFlags.managed === true || activityFlags.documentType === 'activity') {
        add(
          'PORTABLE_ACTOR_MANAGED_ACTIVITY',
          `/actor/items/${index}/system/activities/${activityKey}`,
          'Portable caster Actors must not contain resolver-managed Activities before target-world hydration.',
        );
      }
    }
  });

  const groups = expectedManifest?.spellcastingGroups ?? (validated.ok ? validated.value.spellcastingGroups : []);
  for (const [groupIndex, group] of groups.entries()) {
    const flagged = items.flatMap((item, itemIndex) => {
      const flags = asRecord(asRecord(asRecord(item).flags)[RESOLVER_MODULE_ID]);
      return flags.featureItemKey === group.featureItemKey && flags.groupId === group.groupId
        ? [{ item, itemIndex }]
        : [];
    });
    const expectedGroup = ir.creature.spellcasting?.[groupIndex];
    const sourceAssociated = expectedGroup ? items.flatMap((item, itemIndex) => {
      const itemRecord = asRecord(item);
      return isGeneratedSpellcastingSourceFeature(itemRecord, group.featureItemKey, group.groupId)
        ? [{ item, itemIndex }]
        : [];
    }) : [];
    if (sourceAssociated.length > 1) {
      add(
        'SPELL_FEATURE_LINK_DUPLICATE',
        `/actor/flags/${RESOLVER_MODULE_ID}/spellManifest/spellcastingGroups/${groupIndex}/featureItemKey`,
        `Spellcasting group ${group.groupId} has ${sourceAssociated.length} generated source features.`,
      );
    }
    const linked = flagged.filter(({ item, itemIndex }) => {
      const itemRecord = asRecord(item);
      if (itemRecord.type !== 'feat') {
        add(
          'SPELL_FEATURE_LINK_WRONG_TYPE',
          `/actor/items/${itemIndex}/type`,
          `Spellcasting group ${group.groupId} may only link to its generated feat Item.`,
        );
        return false;
      }
      if (!expectedGroup || !matchesGeneratedSpellcastingFeature(itemRecord, expectedGroup)) {
        add(
          'SPELL_FEATURE_LINK_IDENTITY_MISMATCH',
          `/actor/items/${itemIndex}`,
          `Linked feat does not preserve the generated spellcasting feature identity for group ${group.groupId}.`,
        );
        return false;
      }
      return true;
    });
    if (linked.length === 0) {
      add(
        'SPELL_FEATURE_LINK_MISSING',
        `/actor/flags/${RESOLVER_MODULE_ID}/spellManifest/spellcastingGroups/${groupIndex}/featureItemKey`,
        `No generated feature is linked to spellcasting group ${group.groupId}.`,
      );
    } else if (linked.length !== 1) {
      add(
        'SPELL_FEATURE_LINK_DUPLICATE',
        `/actor/flags/${RESOLVER_MODULE_ID}/spellManifest/spellcastingGroups/${groupIndex}/featureItemKey`,
        `Spellcasting group ${group.groupId} is linked to ${linked.length} generated features.`,
      );
    }
  }

  const resolution = asRecord(resolver.spellResolution);
  if (resolution.status !== 'pending') {
    add(
      resolution.status === 'hydrated' ? 'PREMATURE_SPELL_HYDRATION' : 'INVALID_PORTABLE_SPELL_RESOLUTION_STATUS',
      `/actor/flags/${RESOLVER_MODULE_ID}/spellResolution/status`,
      'Project generation may only emit pending spell resolution; hydration belongs to the destination-world module.',
    );
  }
  if (validated.ok) {
    const expectedHash = hashManifest(validated.value);
    if (resolution.manifestHash !== expectedHash) {
      add(
        'SPELL_MANIFEST_HASH_MISMATCH',
        `/actor/flags/${RESOLVER_MODULE_ID}/spellResolution/manifestHash`,
        'Portable Actor spellResolution.manifestHash does not match its exact manifest.',
      );
    }
  }

  const failed = findingCount() > findingStart;
  return {
    required: true,
    status: failed ? 'failed' : 'pending',
    ...(typeof asRecord(actualManifest).manifestId === 'string' ? { manifestId: String(asRecord(actualManifest).manifestId) } : {}),
    spellCount,
  };
}

function extractRenderedSpellManifest(markdown: string): PortableSpellManifest | undefined {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) return undefined;
  const firstClosing = normalized.indexOf('\n---\n', 4);
  const end = firstClosing >= 0
    ? firstClosing
    : normalized.endsWith('\n---') ? normalized.length - '\n---'.length : -1;
  if (end <= 3) return undefined;
  const root = asRecord(yaml.load(normalized.slice(4, end)));
  const candidate = Object.values(root).find((value) => {
    const record = asRecord(value);
    return record.schemaVersion === 1 && record.rulesPreference === '2024' && Array.isArray(record.spellcastingGroups);
  });
  return candidate as PortableSpellManifest | undefined;
}

function matchesGeneratedSpellcastingFeature(
  item: Record<string, unknown>,
  group: NonNullable<MonsterIntakeIR['creature']['spellcasting']>[number],
): boolean {
  const name = String(item.name ?? '');
  if (!name.includes(group.featureName)) return false;
  if (group.featureEnglishName && !name.includes(group.featureEnglishName)) return false;

  const system = asRecord(item.system);
  const descriptions = [String(asRecord(system.description).value ?? '')];
  for (const activity of Object.values(asRecord(system.activities))) {
    const activityRecord = asRecord(activity);
    const description = asRecord(activityRecord.description);
    descriptions.push(String(description.chatFlavor ?? description.value ?? ''));
  }
  const expected = compact(group.description);
  if(group.manualGrants?.length){
    const manual=asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).manualRule);
    const remainder=group.manualGrants.map(ref=>ref.quote).join('\n');
    const primary=group.usageGroups.flatMap(usage=>usage.evidence.map(ref=>ref.quote)).join('\n');
    if(manual.mode==='native-with-gm'&&manual.sourceText===group.description&&manual.manualRemainder===remainder&&manual.nativeRuleText===primary){
      return descriptions.some(description=>compact(stripHtml(description))===compact(stripHtml(formatMixedRuleHtml(group.description,false,Array.isArray(manual.operations)?manual.operations:[]))));
    }
  }
  return Boolean(expected && descriptions.some((description) => compact(stripHtml(description)) === expected));
}

function isGeneratedSpellcastingSourceFeature(
  item: Record<string, unknown>,
  featureItemKey: string,
  groupId: string,
): boolean {
  if (item.type !== 'feat') return false;
  const flags = asRecord(item.flags);
  const generatorFlags = asRecord(flags.fvttJsonGenerator);
  const resolverFlags = asRecord(flags[RESOLVER_MODULE_ID]);
  return generatorFlags.spellcastingFeatureKey === featureItemKey
    || (resolverFlags.featureItemKey === featureItemKey && resolverFlags.groupId === groupId);
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
}

export function renderIntakeVerificationMarkdown(report: IntakeVerificationReport): string {
  const lines = [
    '# AI 怪物 Intake 确定性核对',
    '',
    `状态：${report.status === 'accepted' ? '通过' : '需要复核'}`,
    `阻断问题：${report.findings.filter((finding) => finding.blocking).length}`,
    '',
  ];
  if (report.spellResolution.required) {
    const spellText = report.spellResolution.status === 'pending'
      ? `法术：已整理 ${report.spellResolution.spellCount} 项；目标世界解析待完成`
      : `法术：${report.spellResolution.spellCount} 项；目标世界解析状态 ${report.spellResolution.status}`;
    lines.splice(lines.length - 1, 0, spellText);
  }
  if (report.findings.length === 0) lines.push('未发现确定性漂移。');
  else for (const finding of report.findings) lines.push(`- [${finding.code}] ${finding.path}：${finding.message}`);
  return `${lines.join('\n')}\n`;
}

export function projectActor(actor: unknown, options: { skillKeys?: string[]; saveKeys?: string[]; includeInitiative?: boolean } = {}): Record<string, unknown> {
  const root = asRecord(actor);
  const system = asRecord(root.system);
  const attrs = asRecord(system.attributes);
  const details = asRecord(system.details);
  const abilities = asRecord(system.abilities);
  const movement = asRecord(attrs.movement);
  const ac = asRecord(attrs.ac);
  const hp = asRecord(attrs.hp);
  const projectedAbilities: Record<string, unknown> = {};
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) projectedAbilities[key] = asRecord(abilities[key]).value;
  const traits = asRecord(system.traits);
  // dnd5e NPC proficiency is derived data and may be absent from exported
  // source JSON. Match the existing ActorGenerator/passive calculation.
  const derivedProf=Math.floor((Math.max(numeric(details.cr),numeric(details.level),1)+7)/4);
  const prof = attrs.prof==null?derivedProf:numeric(attrs.prof);
  const abilityValues = Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, numeric(asRecord(abilities[key]).value)]));
  // Variable damage may only use an explicitly supplied, finite Actor score.
  // The zero fallback used by other aggregate checks is not an ability binding.
  const damageAbilities = Object.fromEntries(Object.keys(projectedAbilities).flatMap((key) => {
    const value = asRecord(abilities[key]).value;
    return typeof value === 'number' && Number.isFinite(value) ? [[key, value]] : [];
  }));
  const allSaves = Object.fromEntries(Object.entries(abilityValues).map(([key, score]) => {
    const ability = asRecord(abilities[key]);
    return [key, abilityMod(score) + numeric(ability.proficient) * prof + numeric(asRecord(ability.bonuses).save)];
  }));
  const requestedSaveKeys = options.saveKeys === undefined ? undefined : new Set(options.saveKeys);
  const saves = Object.fromEntries(Object.entries(allSaves).filter(([key]) => requestedSaveKeys === undefined || requestedSaveKeys.has(key)));
  const skillSystem = asRecord(system.skills);
  const skills: Record<string, number> = {};
  const allSkillTotals: Record<string, number> = {};
  const requestedSkillKeys = new Set(options.skillKeys ?? []);
  for (const [canonical, key] of Object.entries(SKILL_KEYS)) {
    const skill = asRecord(skillSystem[key]);
    const ability = String(skill.ability ?? SKILL_ABILITIES[key] ?? 'int');
    const checkBonus = asRecord(skill.bonuses).check;
    const total = abilityMod(abilityValues[ability]) + numeric(skill.value) * prof + numeric(checkBonus);
    allSkillTotals[canonical] = total;
    const configured = numeric(skill.value) !== 0 || (checkBonus !== undefined && checkBonus !== null && String(checkBonus).trim() !== '');
    if (requestedSkillKeys.has(canonical) || configured) skills[canonical] = total;
  }
  const items = Array.isArray(root.items) ? root.items.map((value) => projectItem(value, abilityValues, prof, damageAbilities)) : [];
  const sensesRoot = asRecord(attrs.senses);
  const senseRanges = Object.keys(asRecord(sensesRoot.ranges)).length > 0 ? asRecord(sensesRoot.ranges) : sensesRoot;
  const languages = asRecord(traits.languages);
  return {
    name: root.name,
    ac: ac.flat ?? ac.value,
    hp: hp.value,
    hpFormula: hp.formula,
    cr: details.cr,
    xp: asRecord(details.xp).value,
    proficiencyBonus: prof,
    initiative: options.includeInitiative === false ? undefined : abilityMod(abilityValues.dex) + numeric(asRecord(attrs.init).bonus),
    size: normalizeSize(traits.size),
    creatureType: asRecord(details.type).value,
    swarmSize:asRecord(details.type).swarm?normalizeSize(asRecord(details.type).swarm):undefined,
    creatureTypeCustom: asRecord(details.type).custom,
    abilities: projectedAbilities,
    saves,
    skills,
    movement: {
      ...Object.fromEntries(['walk', 'climb', 'fly', 'swim', 'burrow'].map((key) => [key, movement[key]])),
      hover: movement.hover,
    },
    resistances: arrayValues(asRecord(traits.dr).value),
    immunities: arrayValues(asRecord(traits.di).value),
    vulnerabilities: arrayValues(asRecord(traits.dv).value),
    conditionImmunities: arrayValues(asRecord(traits.ci).value),
    senses: {
      darkvision: numericSense(senseRanges.darkvision),
      blindsight: numericSense(senseRanges.blindsight),
      tremorsense: numericSense(senseRanges.tremorsense),
      truesight: numericSense(senseRanges.truesight),
      // schema-derived: dnd5e 5.3.3 CreatureTemplate.prepareSkill adds the
      // passive FormulaField after the ordinary skill total. ActorGenerator
      // uses this field to preserve a source-explicit passive score.
      passivePerception: 10 + (allSkillTotals.perception ?? 0)
        + numeric(asRecord(asRecord(skillSystem.prc).bonuses).passive),
      ...(sensesRoot.special ? { special: sensesRoot.special } : {}),
    },
    languages: arrayValues(languages.value),
    languageCustom: languages.custom || undefined,
    biography: stripHtml(String(asRecord(details.biography).value ?? '')),
    items,
  };
}

function projectItem(value: unknown, abilities: Record<string, number>, prof: number, damageAbilities: Record<string, number>): Record<string, unknown> {
  const item = asRecord(value);
  const itemFlags = asRecord(item.flags);
  const tidyFlags = asRecord(itemFlags['tidy5e-sheet']);
  const system = asRecord(item.system);
  const activation = asRecord(system.activation);
  const description = asRecord(system.description);
  const activities = asRecord(system.activities);
  const projectedActivities = Object.values(activities).map(asRecord);
  const firstActivity = asRecord(projectedActivities[0]);
  const activityActivation = asRecord(firstActivity.activation);
  const activityDescription = asRecord(firstActivity.description);
  const attack = asRecord(firstActivity.attack);
  const activityRange=asRecord(firstActivity.range),itemRange=asRecord(system.range);
  // Unmigrated exports may still carry an explicit legacy Activity reach.
  // Retain it while filling fields inherited from the Item in native mode.
  const range=activityRange.override===false&&Object.keys(itemRange).length
    ?{...itemRange,...activityRange,reach:activityRange.reach??itemRange.reach,value:activityRange.value??itemRange.value,long:activityRange.long??itemRange.long}
    :Object.keys(activityRange).length?activityRange:itemRange;
  const save = asRecord(firstActivity.save);
  const saveDc = asRecord(save.dc);
  const damageBase = asRecord(asRecord(system.damage).base);
  const activityDamage = asRecord(firstActivity.damage);
  const activityDamageParts = Array.isArray(activityDamage.parts) ? activityDamage.parts : [];
  const activityDamageBase = asRecord(activityDamageParts[0]);
  const usesNativeBase = activityDamage.includeBase === true
    && Boolean(damageBase.number && damageBase.denomination);
  const projectedDamage = usesNativeBase
    ? damageBase
    : activityDamageBase.number && activityDamageBase.denomination ? activityDamageBase : {};
  const attackAbility = Object.keys(attack).length > 0 ? String(attack.ability ?? '') : '';
  const damageFormula = usesNativeBase
    ? nativeBaseDamageFormula(damageBase, attackAbility, damageAbilities)
    : damageFormulaFromActivityPart(projectedDamage, firstActivity, damageAbilities);
  const additionalDamageFormulas = (usesNativeBase ? activityDamageParts : activityDamageParts.slice(1))
    .map((part) => asRecord(part))
    .filter((part) => Boolean(part?.number && part?.denomination))
    .map((part) => damageFormulaFromActivityPart(part, firstActivity, damageAbilities));
  const supplementalDamageParts = projectedActivities.slice(1)
    .flatMap((activity) => {
      const damage = asRecord(activity.damage);
      return Array.isArray(damage.parts) ? damage.parts.map(asRecord) : [];
    });
  const supplementalDamageFormulas = projectedActivities.slice(1).flatMap((activity) => {
    const parts = asRecord(activity.damage).parts;
    return (Array.isArray(parts) ? parts.map(asRecord) : [])
      .filter((part) => Boolean(part.number && part.denomination))
      .map((part) => damageFormulaFromActivityPart(part, activity, damageAbilities));
  });
  const hasAttack = Object.keys(attack).length > 0;
  const toHit = !hasAttack ? undefined
    : attack.flat === true ? numericOrUndefined(attack.bonus)
      : attackAbility ? abilityMod(abilities[attackAbility]) + prof + numeric(attack.bonus)
        : numericOrUndefined(attack.bonus);
  const damageTypes = [...new Set([
    ...arrayValues(projectedDamage.types),
    ...(usesNativeBase ? activityDamageParts : activityDamageParts.slice(1)).flatMap((part) => arrayValues(asRecord(part)?.types)),
    ...supplementalDamageParts.flatMap((part) => arrayValues(part.types)),
  ])];
  const activityDetails = projectedActivities.map((activity) => {
    const activityDamage = asRecord(activity.damage);
    const parts = Array.isArray(activityDamage.parts) ? activityDamage.parts.map(asRecord) : [];
    return {
      name: activity.name,
      type: activity.type,
      activation: asRecord(activity.activation).type,
      condition: asRecord(activity.activation).condition,
      description: stripHtml(String(asRecord(activity.description).chatFlavor ?? '')),
      consumption: asRecord(activity.consumption),
      uses:asRecord(activity.uses),
      areaTemplate: asRecord(asRecord(activity.target).template),
      range: asRecord(activity.range),
      attackMode: asRecord(asRecord(activity.attack).type).value,
      attackData:asRecord(activity.attack),
      sourceOperation:asRecord(asRecord(asRecord(activity.flags).fvttJsonGenerator).sourceOperation),
      onSave:activityDamage.onSave,
      includeBase:activityDamage.includeBase,
      targetSpecial:asRecord(asRecord(activity.target).affects).special,
      targetAffects:asRecord(asRecord(activity.target).affects),
      targetPrompt:asRecord(activity.target).prompt,
      healing:{formula:damageFormulaFromActivityPart(asRecord(activity.healing),activity,damageAbilities),types:arrayValues(asRecord(activity.healing).types)},
      damageParts:parts.map(part=>({formula:damageFormulaFromActivityPart(part,activity,damageAbilities),types:arrayValues(part.types)})),
      effectLinks: Array.isArray(activity.effects)?activity.effects.length:0,
      effectIds:Array.isArray(activity.effects)?activity.effects.map(link=>asRecord(link)._id):[],
      effectLinksData:Array.isArray(activity.effects)?activity.effects.map(link=>asRecord(link)):[],
      saveData:asRecord(activity.save),
      damageFormulas: parts
        .filter((part) => Boolean(part.number && part.denomination))
        .map((part) => damageFormulaFromActivityPart(part, activity, damageAbilities)),
      damageTypes: [...new Set(parts.flatMap((part) => arrayValues(part.types)))],
    };
  });
  const effects = Array.isArray(item.effects) ? item.effects.flatMap(projectConditionEffectStatuses) : [];
  const rawBehaviorMechanics = asRecord(itemFlags.fvttJsonGenerator).behaviorMechanics;
  const behaviorMechanics = Array.isArray(rawBehaviorMechanics)
    ? rawBehaviorMechanics.map(asRecord)
    : [];
  return {
    name: item.name,
    sourceFeatureId:asRecord(itemFlags.fvttJsonGenerator).sourceFeatureId,
    id:item._id,
    type: item.type,
    section: tidyFlags.section ?? tidyFlags.actionSection,
    activation: activation.type ?? activityActivation.type,
    activationValue: activation.value ?? activityActivation.value,
    description: stripHtml(String(activityDescription.chatFlavor ?? description.value ?? '')),
    attackType: asRecord(attack.type).value==='melee'?(asRecord(attack.type).classification==='spell'?'msak':'mwak')
      :asRecord(attack.type).value==='ranged'?(asRecord(attack.type).classification==='spell'?'rsak':'rwak'):asRecord(attack.type).value,
    toHit,
    reach: range.reach,
    range: range.value,
    targetSpecial: asRecord(asRecord(firstActivity.target).affects).special,
    longRange: range.long,
    damageFormula,
    ...(damageFormula || additionalDamageFormulas.length > 0 || supplementalDamageFormulas.length > 0
      ? { damageFormulas: [damageFormula, ...additionalDamageFormulas, ...supplementalDamageFormulas].filter((value): value is string => Boolean(value)) }
      : {}),
    damageTypes,
    activities: activityDetails,
    saveDc: numericOrUndefined(saveDc.value ?? saveDc.formula),
    saveAbilities: arrayValues(save.ability),
    statuses: effects,
    behaviorMechanics,
    manualRule: asRecord(itemFlags.fvttJsonGenerator).manualRule,
    nativeWeapon:{properties:arrayValues(system.properties),type:asRecord(system.type),range:asRecord(system.range),damage:asRecord(system.damage)},
    effectCount: Array.isArray(item.effects)?item.effects.length:0,
    effectDefinitions:Array.isArray(item.effects)?item.effects.map(effect=>({_id:asRecord(effect)._id,statuses:arrayValues(asRecord(effect).statuses),duration:asRecord(asRecord(effect).duration)})):[],
    conditionLifecycle:asRecord(itemFlags.fvttJsonGenerator).conditionLifecycle,
    manualExecutable: (Array.isArray(item.effects) && item.effects.length > 0)
      || Object.values(activities).map(asRecord).some(activity=>activity.type!=='utility' || activity.attack || activity.save || activity.damage
        || Array.isArray(activity.effects)&&activity.effects.length>0
        || ((targets:unknown)=>Array.isArray(targets)&&targets.length>0)(asRecord(activity.consumption).targets)),
    uses: projectItemUses(asRecord(system.uses)),
    useRecovery: Array.isArray(asRecord(system.uses).recovery)?asRecord(system.uses).recovery:[],
  };
}

function projectConditionEffectStatuses(value: unknown): string[] {
  const effect = asRecord(value);
  const statuses = arrayValues(effect.statuses);
  const condition = readConditionInstance(effect);
  if (effect.disabled === true || !condition?.enabled || condition.template !== true) return statuses;

  const contractStatusId = projectedConditionStatusId(condition.conditionId);
  return statuses.map((status) => status === contractStatusId ? condition.conditionId : status);
}

function nativeBaseDamageFormula(
  damageBase: Record<string, unknown>,
  attackAbility: string,
  abilities: Record<string, number>,
): string | undefined {
  const custom = asRecord(damageBase.custom);
  if (custom.enabled === true) return undefined;
  const base = damageFormulaFromPart({ ...damageBase, bonus: '' });
  if (!base) return undefined;
  const bonus = parseStrictDamageBonus(damageBase.bonus);
  if (bonus === undefined) return undefined;
  if (!Object.hasOwn(abilities, attackAbility) || !Number.isFinite(abilities[attackAbility])) return undefined;
  return appendNumericDamageBonus(base, abilityMod(abilities[attackAbility]) + bonus);
}

function damageFormulaFromPart(part: Record<string, unknown>): string | undefined {
  if (!part.number || !part.denomination) return undefined;
  const base = `${part.number}d${part.denomination}`;
  const bonus = String(part.bonus ?? '').trim();
  return bonus ? `${base}${/^[+-]/.test(bonus) ? bonus : `+${bonus}`}` : base;
}

function damageFormulaFromActivityPart(
  part: Record<string, unknown>, activity: Record<string, unknown>, abilities: Record<string, number>,
): string | undefined {
  const custom=asRecord(part.custom);
  if(custom.enabled===true&&typeof custom.formula==='string'&&/^\d+(?:d\d+(?:\s*[+-]\s*\d+)?)?$/iu.test(custom.formula))return custom.formula;
  const attack = asRecord(activity.attack);
  // Schema-derived: the existing v14 generator uses an explicit @mod part for
  // native weapon attacks carried by a feat (e.g. reactions/bonus actions).
  // Resolve only that exact variable with this activity's bound ability; custom
  // expressions and unbound variables stay literal and fail the strict IR check.
  if (String(part.bonus ?? '').trim() === '@mod' && activity.type === 'attack'
    && attack.flat === false && asRecord(part.custom).enabled !== true) {
    const resolved = nativeBaseDamageFormula({ ...part, bonus: '' }, String(attack.ability ?? ''), abilities);
    if (resolved !== undefined) return resolved;
  }
  return damageFormulaFromPart(part);
}

function appendNumericDamageBonus(base: string, bonus: number): string {
  return bonus === 0 ? base : `${base}${bonus > 0 ? '+' : ''}${bonus}`;
}

function parseStrictDamageBonus(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  const text = String(value).trim();
  return /^[+-]?\d+$/u.test(text) ? Number.parseInt(text, 10) : undefined;
}

function projectItemUses(value: Record<string, unknown>): { max: number | undefined; recovery: string[] } {
  const max = numericOrUndefined(value.max);
  const recovery = Array.isArray(value.recovery)
    ? value.recovery.map(asRecord).map((entry) => String(entry.period ?? '')).filter(Boolean)
    : [];
  return { max, recovery };
}

function compareFeatureSections(
  add: (code: string, path: string, message: string) => void,
  expected: CanonicalFeature[],
  actorItems: unknown,
  section: string,
  context:{source:string;ir:MonsterIntakeIR;range?:{start:number;end:number};isV14:boolean},
): void {
  const items = Array.isArray(actorItems) ? actorItems.map(asRecord) : [];
  const sectionActivation = section === 'actions' ? 'action'
    : section === 'bonusActions' ? 'bonus'
      : section === 'reactions' ? 'reaction'
        : section === 'legendaryActions' ? 'legendary'
          : section === 'mythicActions' ? 'legendary'
          : undefined;
  for (const [index, feature] of expected.entries()) {
    const expectedActivation = feature.activationType ?? sectionActivation;
    const expectedItemActivation=feature.sourceOperations?.[0]?.relationship==='follow-up'?'special':expectedActivation;
    const named = items.filter((item) => featureNamesMatch(item, feature));
    const found = named.find((item) => !expectedItemActivation || item.activation === expectedItemActivation) ?? named[0];
    if (!found) {
      add('ACTOR_FEATURE_MISSING', `/creature/${section}/${index}`, `Actor is missing separate feature: ${feature.name}`);
      continue;
    }
    if (expectedItemActivation && found.activation !== expectedItemActivation) {
      const path = feature.activationType
        ? `/creature/${section}/${index}/activationType`
        : `/creature/${section}/${index}`;
      add('ACTOR_ACTIVATION_DRIFT', path, `${feature.name} activation is ${String(found.activation)}, expected ${expectedItemActivation}.`);
    }
    const description = String(found.description ?? '');
    const path=`/creature/${section}/${index}`;
    const sharedPool=context.ir.creature.sourceResourcePools?.find(pool=>pool.members.some(member=>member.collection===section&&member.index===index));
    const sharedCarrier=sharedPool?items.find(item=>item.sourceFeatureId===sharedPool.members[0]!.featureId):undefined;
    const isSharedCarrier=sharedPool?.members[0]?.featureId===feature.sourceFeatureId;
    const resourceTarget=sharedPool?String(sharedCarrier?.id??''):'';
    const complete=context.isV14&&completeSourceFeatureEvidence(context.source,context.ir,feature,path,context.range);
    const fullLiteral=Boolean(complete&&sourceRuleText(description).includes(sourceRuleText(feature.description)));
    if(feature.executionMode==='gm-manual'){
      const marker=asRecord(found.manualRule);
      // Literal rules escape source HTML as visible text. Do not strip decoded
      // source tags or Markdown signs: their removal is a real loss of prose.
      const literalText=(value:string)=>value.replace(/\s+/gu,' ').trim();
      const manualLiteral=Boolean(complete&&literalText(description).includes(literalText(feature.description)));
      if(!manualLiteral || marker.version!==1 || marker.mode!=='gm-manual'
        ||marker.sourceText!==feature.description)
        add('ACTOR_MANUAL_RULE_LOSS',path,'Manual Item must preserve the complete source rule and its source identity.');
      if(found.manualExecutable || (Array.isArray(found.activities)?found.activities:[]).length!==1)
        add('ACTOR_MANUAL_RULE_EXECUTION_DRIFT',path,'Manual Item must have one non-executing Utility and zero automatic effects, rolls or resource consumption.');
      const declared=sourceFeatureResources(feature.name,feature.description,context.ir.creature.identity.name),uses=asRecord(found.uses);
      if(declared.legendaryCost===undefined)declared.legendaryCost=sourceFeatureLegendaryCost(context.source,context.ir,feature,path,context.range);
      if(['uses','recharge','legendaryCost'].some(key=>feature[key as keyof CanonicalFeature]!==undefined&&JSON.stringify(feature[key as keyof CanonicalFeature])!==JSON.stringify(declared[key as keyof typeof declared])))
        add('ACTOR_MANUAL_RESOURCE_SOURCE_CONFLICT',path,'Manual counters must be proved by the owning source feature, not merely copied from the IR.');
      const expectedMax=feature.uses?.max??(feature.recharge?1:undefined),recovery=feature.uses?[{period:({day:'day',longRest:'lr',shortRest:'sr',dawn:'dawn'} as const)[feature.uses.period],type:'recoverAll'}]:feature.recharge?[{period:'recharge',type:'recoverAll',formula:String(feature.recharge[0])}]:[];
      if(uses.max!==expectedMax||JSON.stringify(found.useRecovery)!==JSON.stringify(recovery))
        add('ACTOR_MANUAL_RESOURCE_DRIFT',path,'Manual maximum and recovery must match the source-proven optional counter; no additional native counter may appear.');
      if(feature.legendaryCost!==undefined)compare(add,'ACTOR_LEGENDARY_COST_DRIFT',path+'/legendaryCost',feature.legendaryCost,found.activationValue);
      continue;
    }
    if(feature.sourceOperations){
      const marker=asRecord(found.manualRule),activities=Array.isArray(found.activities)?found.activities.map(asRecord):[];
      const contexts=feature.sourceContext??[];
      if(!complete||!fullLiteral||marker.mode!=='native-with-gm'||marker.sourceText!==feature.description||JSON.stringify(marker.sourceOperations)!==JSON.stringify(feature.sourceOperations)||JSON.stringify(marker.sourceContext)!==JSON.stringify(contexts)||contexts.some(context=>!sourceRuleText(description).includes(sourceRuleText(context))))add('ACTOR_SOURCE_OPERATION_RULE_LOSS',path,'Source operations must retain complete rules, shared conditions and their exact source identity.');
      const expectedEffectCount=feature.sourceOperations.reduce((count,op)=>count+(op.failureStatuses?.length??0),0);
      const modes=sourceAttackDamageModes(feature.description,feature.sourceOperations,feature.name);
      type ViewOp=NonNullable<CanonicalFeature['sourceOperations']>[number]&{damageMode?:string;nameSuffix?:string};
      const viewOps:ViewOp[]=feature.sourceOperations.filter(op=>!modes?.absorbedIds.includes(op.id)).flatMap(op=>{
        if(!modes||op.id!==modes.attackId)return[op];
        return modes.kind==='versatile'?[{...op,damage:modes.shared,damageMode:'versatile'}]:[
          {...op,damage:[modes.ordinary,...modes.shared],damageMode:'ordinary',nameSuffix:'（普通伤害）'},
          {...op,damage:[modes.alternative,...modes.shared],damageMode:'alternative',nameSuffix:'（替代伤害）'},
        ];
      });
      const dual=(op:ViewOp)=>Boolean(!(modes?.kind==='versatile'&&op.id===modes.attackId)&&op.attack?.reach!==undefined&&op.attack.range!==undefined&&op.attack.type.startsWith('m'));
      if(activities.length!==viewOps.reduce((count,op)=>count+(dual(op)?2:1),0)||found.effectCount!==expectedEffectCount)add('ACTOR_SOURCE_OPERATION_COUNT_DRIFT',path,'Only source-proven operations and mutually exclusive attack modes may execute.');
      if(modes?.kind==='versatile'){
        const native=asRecord(found.nativeWeapon),damage=asRecord(native.damage),weaponType=asRecord(native.type),range=asRecord(native.range),op=feature.sourceOperations.find(op=>op.id===modes.attackId)!;
        const partMatches=(value:unknown,expected:typeof modes.ordinary)=>{const part=asRecord(value);return compact(damageFormulaFromActivityPart(part,{attack:{ability:'none'}},{}))===compact(expected.formula)&&JSON.stringify(arrayValues(part.types))===JSON.stringify(expected.types??[expected.type]);};
        if(found.type!=='weapon'||!arrayValues(native.properties).includes('ver')||weaponType.baseItem!==modes.weapon.baseItem||weaponType.value!==modes.weapon.category||!partMatches(damage.base,modes.ordinary)||!partMatches(damage.versatile,modes.alternative))add('ACTOR_NATIVE_VERSATILE_DRIFT',path,'The native weapon identity, property and both source damage formulas must be retained.');
        if(range.value!==(op.attack!.range??null)||range.long!==(op.attack!.longRange??null)||range.reach!==(op.attack!.reach??null)||arrayValues(native.properties).includes('thr')!==(op.attack!.range!==undefined))add('ACTOR_NATIVE_WEAPON_RANGE_DRIFT',path,'Native weapon melee/thrown modes must use only the source-proven distances.');
      }
      for(const op of viewOps){
        const nativeVersatile=modes?.kind==='versatile'&&op.id===modes.attackId;
        const matches=activities.filter(activity=>asRecord(activity.sourceOperation).id===op.id&&asRecord(activity.sourceOperation).damageMode===op.damageMode),activity=matches[0]??{};
        const condition=[contexts.join('\n'),op.condition,feature.description].filter(Boolean).join('\n');
        if(matches.length!==(dual(op)?2:1)||activity.type!==op.type||activity.name!==(dual(op)?op.name+' (近战)':op.name)+(op.nameSuffix??'')||activity.condition!==condition||activity.activation!==(op.relationship==='follow-up'?'special':expectedActivation??''))add('ACTOR_SOURCE_OPERATION_IDENTITY_DRIFT',path+'/sourceOperations/'+op.id,'Operation identity, type, source condition or GM timing changed.');
        if(op.attack){
          const attack=asRecord(activity.attackData),type=asRecord(attack.type),range=asRecord(activity.range);
          if(attack.flat!==true||Number(attack.bonus)!==op.attack.toHit||type.value!==(nativeVersatile&&op.attack.range!==undefined?'':op.attack.type.startsWith('r')?'ranged':'melee')||type.classification!==(op.attack.type.endsWith('sak')?'spell':'weapon')||(nativeVersatile?attack.ability!=='none'||range.override!==false:Number(range.value)!==(dual(op)?op.attack.reach:op.attack.range??op.attack.reach??0))||range.units!=='ft')add('ACTOR_SOURCE_OPERATION_ATTACK_DRIFT',path+'/sourceOperations/'+op.id,'The printed attack total, mode and distance must be literal.');
          if(dual(op)){
            const ranged=matches[1]!,rangedAttack=asRecord(ranged.attackData),rangedRange=asRecord(ranged.range);
            if(ranged.name!==op.name+' (远程)'+(op.nameSuffix??'')||asRecord(rangedAttack.type).value!=='ranged'||rangedAttack.flat!==true||Number(rangedAttack.bonus)!==op.attack.toHit||Number(rangedRange.value)!==op.attack.range||(op.attack.longRange!==undefined&&Number(rangedRange.long)!==op.attack.longRange)||JSON.stringify(ranged.damageParts)!==JSON.stringify(activity.damageParts)||JSON.stringify(ranged.consumption)!==JSON.stringify(activity.consumption)||ranged.condition!==condition)add('ACTOR_SOURCE_OPERATION_ATTACK_MODE_DRIFT',path+'/sourceOperations/'+op.id,'Melee and ranged modes must share their printed attack/damage and pool, with their own source distances.');
          }
        }
        if(op.save){
          const save=asRecord(activity.saveData),dc=asRecord(save.dc);
          if(Number(dc.formula)!==op.save.dc||JSON.stringify(arrayValues(save.ability))!==JSON.stringify(op.save.abilities)||activity.onSave!==(op.damage?.length?op.save.outcome:'none'))add('ACTOR_SOURCE_OPERATION_SAVE_DRIFT',path+'/sourceOperations/'+op.id,'Save DC, all target-choice abilities and success damage must match source.');
        }
        if(op.healing){
          const heal=asRecord(activity.healing),target=asRecord(activity.targetAffects),expected=op.healing;
          if(compact(String(heal.formula??''))!==compact(expected.formula)||JSON.stringify(arrayValues(heal.types))!==JSON.stringify([expected.type])
            ||target.type!==expected.target.type||String(target.count)!=='1'||target.special!==expected.target.special||activity.targetPrompt!==(expected.target.type==='creature'))
            add('ACTOR_SOURCE_OPERATION_HEALING_DRIFT',path+'/sourceOperations/'+op.id,'Each healing event must retain its own exact formula, kind and source-qualified recipient.');
        }
        const links=arrayValues(activity.effectIds),definitions=Array.isArray(found.effectDefinitions)?found.effectDefinitions.map(asRecord):[],statuses=op.failureStatuses??[];
        if(links.length!==statuses.length||statuses.some(status=>!definitions.some(effect=>links.includes(String(effect._id))&&JSON.stringify(arrayValues(effect.statuses))===JSON.stringify([status])))||(Array.isArray(activity.effectLinksData)?activity.effectLinksData:[]).some(link=>asRecord(link).onSave!==false))add('ACTOR_SOURCE_OPERATION_STATUS_DRIFT',path+'/sourceOperations/'+op.id,'Only this Save may reference its exact source-verified ordinary failure status.');
        const parts=Array.isArray(activity.damageParts)?activity.damageParts.map(asRecord):[];
        const baseFieldValid=matches.length>0&&matches.every(entry=>op.type==='attack'?entry.includeBase===Boolean(nativeVersatile):entry.includeBase===undefined);
        if(parts.length!==(op.damage?.length??0)||!baseFieldValid||parts.some((part,index)=>compact(String(part.formula??''))!==compact(op.damage![index]!.formula)||JSON.stringify(arrayValues(part.types))!==JSON.stringify(op.damage![index]!.types??[op.damage![index]!.type])))add('ACTOR_SOURCE_OPERATION_DAMAGE_DRIFT',path+'/sourceOperations/'+op.id,'Each operation must retain its own complete damage parts and type choices. Attack must explicitly exclude Item base damage; Save/Damage cannot contain a non-native includeBase field.');
        const operationRange=asRecord(activity.range);
        if(op.range!==undefined&&(Number(operationRange.value)!==op.range||operationRange.units!=='ft'))add('ACTOR_SOURCE_OPERATION_RANGE_DRIFT',path+'/sourceOperations/'+op.id,'Source placement distance and self origin must remain distinct.');
        if(!op.attack&&op.range===undefined){
          const self=op.healing?op.healing.target.type==='self':sourceOperationSelfTarget(feature.description,op)||sourceOperationSelfArea(feature.description,op,displayName(context.ir.creature.identity.name,context.ir.creature.identity.englishName));
          // Old source-proven Self may rely on RangeField's native default.
          // Account for Item inheritance before accepting that compatibility.
          const itemRange=asRecord(asRecord(found.nativeWeapon).range),effective=operationRange.override!==true&&Object.keys(itemRange).length?itemRange:operationRange;
          const valid=self?(effective.units??'self')==='self':operationRange.override===true&&operationRange.units==='spec'
            &&operationRange.special==='GM 按原文目标或效应位置确定范围。'&&[undefined,null,''].includes(operationRange.value as any);
          if(!valid)add('ACTOR_SOURCE_OPERATION_RANGE_DRIFT',path+'/sourceOperations/'+op.id,'Only a source-proven Self may use the native Self default; unknown or external range needs the explicit GM range.');
        }
        if(op.aoe){
          const area=asRecord(activity.areaTemplate),dimension=(key:'width'|'height',expected:number|undefined)=>expected!==undefined?!(typeof area[key]==='number'||typeof area[key]==='string')||Number(area[key])!==expected:![undefined,'',5,'5'].includes(area[key] as any);
          if(area.type!==(op.aoe.shape==='rectangle'?'square':op.aoe.shape)||Number(area.size)!==op.aoe.radius||area.units!=='ft'||op.aoe.shape==='line'&&dimension('width',op.aoe.width)||op.aoe.shape==='cylinder'&&dimension('height',op.aoe.height))add('ACTOR_SOURCE_OPERATION_AREA_DRIFT',path+'/sourceOperations/'+op.id,'Native area shape, size, explicit width/height or units changed.');
        }
        if(op.proof.upgrade&&(asRecord(activity.targetAffects).type!=='creature'||String(asRecord(activity.targetAffects).count)!=='1'||activity.targetSpecial!==op.proof.damage![0]))add('ACTOR_SOURCE_OPERATION_TARGET_DRIFT',path+'/sourceOperations/'+op.id,'Upgraded damage must retain the one creature hit under the complete original trigger.');
        if(op.targetSpecial!==undefined&&(activity.targetSpecial!==op.targetSpecial||asRecord(activity.targetAffects).type!==(sourceOperationTargetType(feature.description,op)??'creature')))add('ACTOR_SOURCE_OPERATION_TARGET_DRIFT',path+'/sourceOperations/'+op.id,'Source target restrictions or explicit recipient kind changed.');
        const costs=asRecord(activity.consumption).targets,expectedCost=op.relationship!=='follow-up'&&Boolean(feature.uses||feature.recharge);
        if(!Array.isArray(costs)||costs.length!==(expectedCost?1:0)||expectedCost&&(asRecord(costs[0]).type!=='itemUses'||asRecord(costs[0]).target!==resourceTarget||String(asRecord(costs[0]).value)!=='1'))add('ACTOR_SOURCE_OPERATION_RESOURCE_DRIFT',path+'/sourceOperations/'+op.id,'A follow-up cannot consume again; source alternatives share exactly one feature pool.');
      }
      const expectedMax=sharedPool?(isSharedCarrier?sharedPool.max:undefined):feature.uses?.max??(feature.recharge?1:undefined),uses=asRecord(found.uses);
      const expectedRecovery=sharedPool?(isSharedCarrier?[{period:({day:'day',longRest:'lr',shortRest:'sr',dawn:'dawn'} as const)[sharedPool.period],type:'recoverAll'}]:[]):feature.uses?[{period:({day:'day',longRest:'lr',shortRest:'sr',dawn:'dawn'} as const)[feature.uses.period],type:'recoverAll'}]:feature.recharge?[{period:'recharge',type:'recoverAll',formula:String(feature.recharge[0])}]:[];
      if(uses.max!==expectedMax||JSON.stringify(found.useRecovery)!==JSON.stringify(expectedRecovery))add('ACTOR_SOURCE_OPERATION_POOL_DRIFT',path,'Shared feature maximum and recovery must remain source-bound.');
      continue;
    }
    if(feature.executionMode==='native-with-gm'){
      const marker=asRecord(found.manualRule);
      const literal=(value:string)=>value.replace(/\s+/gu,' ').trim();
      const operations=[feature.attack?'attack':'',feature.save||feature.gmTriggeredSave?'save':'',feature.damage?.length?'damage':'',feature.uses||feature.recharge||feature.spellUseRecords?'resource':'',feature.aoe?'area':''].filter(Boolean);
      if(!complete||!literal(description).includes(literal(feature.description))||marker.mode!=='native-with-gm'||marker.sourceText!==feature.description||marker.nativeRuleText!==feature.nativeRuleText||marker.manualRemainder!==feature.manualRemainder)
        add('ACTOR_MIXED_RULE_LOSS',path,'Mixed operations must retain the complete rule, primary facts and explicit GM remainder.');
      if(JSON.stringify(arrayValues(marker.operations))!==JSON.stringify(operations))add('ACTOR_MIXED_OPERATION_LABEL_DRIFT',path,'The displayed native-operation boundary must match the source-declared operations.');
      const activities=Array.isArray(found.activities)?found.activities.map(asRecord):[];
      const records=(value:unknown)=>Array.isArray(value)?value.map(asRecord):[];
      const dual=Boolean(feature.attack?.reach&&feature.attack.range&&/^(?:mwak|msak)$/u.test(feature.attack.type));
      const primary=feature.gmTriggeredSave?activities.filter(a=>a.type!=='save'):activities;
      const expectedEffects=feature.gmTriggeredSave?.failureStatuses.length??feature.nativeFailureStatuses?.length??0;
      if(found.effectCount!==expectedEffects||activities.length!==(feature.spellUseRecords?.length??((dual?2:1)+(feature.gmTriggeredSave?1:0)))||primary.some(a=>a.type!==(feature.activityType??'utility')))
        add('ACTOR_MIXED_RULE_EXECUTION_DRIFT',path,'Only the verified primary operation and its source-declared attack modes may execute.');
      if(dual){
        const modes=primary.map(a=>a.attackMode).sort();
        const ranged=activities.find(a=>a.attackMode==='ranged'),range=asRecord(ranged?.range);
        if(JSON.stringify(modes)!==JSON.stringify(['melee','ranged'])||range.override!==true||Number(range.value)!==feature.attack!.range||range.units!=='ft')
          add('ACTOR_MIXED_ATTACK_MODE_DRIFT',path+'/attack','Melee and ranged choices must preserve the common printed attack and distinct source distances.');
      }
      for(const damage of feature.damage??[])if(damage.types){
        for(const activity of primary){
          const parts=records(activity.damageParts).filter(p=>compact(String(p.formula??''))===compact(damage.formula));
          if(parts.length!==1||JSON.stringify(arrayValues(parts[0]!.types))!==JSON.stringify(damage.types))
            add('ACTOR_MIXED_DAMAGE_CHOICE_DRIFT',path+'/damage','Each attack mode must retain one damage roll with the exact exclusive type choices.');
        }
      }
      if(feature.gmTriggeredSave){
        const expected=feature.gmTriggeredSave,saves=activities.filter(a=>a.type==='save'),save=saves[0],data=asRecord(save?.saveData),dc=asRecord(data.dc);
        const definitions=records(found.effectDefinitions),links=arrayValues(save?.effectIds);
        if(saves.length!==1||Number(dc.formula)!==expected.dc||JSON.stringify(arrayValues(data.ability))!==JSON.stringify([expected.ability])||save?.activation!=='special'||save?.condition!==expected.trigger
          ||primary.some(a=>Number(a.effectLinks)>0)||links.length!==expectedEffects||records(save?.effectLinksData).some(link=>link.onSave!==false)||definitions.some(e=>!links.includes(String(e._id))||JSON.stringify(arrayValues(e.statuses))!==JSON.stringify(expected.failureStatuses)))
          add('ACTOR_GM_TRIGGERED_SAVE_DRIFT',path+'/gmTriggeredSave','Separate GM-triggered Save must retain its literal DC/ability/trigger and native failed-save statuses, never linked to the attack.');
      }
      if(feature.nativeFailureStatuses){
        const definitions=records(found.effectDefinitions),links=arrayValues(activities[0]?.effectIds);
        if(links.length!==expectedEffects||records(activities[0]?.effectLinksData).some(link=>link.onSave!==false)||definitions.some(e=>!links.includes(String(e._id))||!arrayValues(e.statuses).every(status=>feature.nativeFailureStatuses!.includes(status as any))))add('ACTOR_NATIVE_FAILURE_STATUS_DRIFT',path+'/nativeFailureStatuses','Source-explicit native failed-save statuses must remain bound to their Save.');
      }
      if(feature.aoe){
        const area=asRecord(activities[0]?.areaTemplate),range=asRecord(activities[0]?.range);
        if(area.type!==feature.aoe.shape||Number(area.size)!==feature.aoe.radius||area.units!=='ft'
          ||feature.aoe.shape==='radius'&&range.units!=='self')
          add('ACTOR_MIXED_AREA_DRIFT',path+'/aoe','The native area shape, size, units and self origin must match the source-declared primary operation.');
      }
      const maximum=sharedPool?(isSharedCarrier?sharedPool.max:undefined):feature.uses?.max??(feature.recharge?1:undefined);
      const period=sharedPool?(isSharedCarrier?({day:'day',shortRest:'sr',longRest:'lr',dawn:'dawn'} as const)[sharedPool.period]:undefined):feature.uses?({day:'day',shortRest:'sr',longRest:'lr',dawn:'dawn'} as const)[feature.uses.period]:feature.recharge?'recharge':undefined;
      const uses=asRecord(found.uses),recovery=records(found.useRecovery);
      const correctRecovery=period?recovery.length===1&&recovery[0]!.period===period&&recovery[0]!.type==='recoverAll'
        &&(!feature.recharge||String(recovery[0]!.formula)===String(feature.recharge[0])):recovery.length===0;
      const wrongConsumption=activities.some((activity,index)=>{
        const costs=records(asRecord(activity.consumption).targets),record=feature.spellUseRecords?.[index];
        if(feature.gmTriggeredSave&&activity.type==='save')return costs.length!==0;
        if(record){
          const expectedName=`GM施法记录：${record.name}（${record.max}/日）`,ownUses=asRecord(activity.uses),ownRecovery=records(ownUses.recovery);
          return activity.name!==expectedName||String(ownUses.max)!==String(record.max)||ownRecovery.length!==1||ownRecovery[0]?.period!=='day'||ownRecovery[0]?.type!=='recoverAll'
            ||costs.length!==1||costs[0]?.type!=='activityUses'||costs[0]?.target!==''||String(costs[0]?.value)!=='1'||asRecord(activity.consumption).spellSlot!==false;
        }
        return maximum===undefined&&!sharedPool?costs.length!==0:costs.length!==1||costs[0]!.type!=='itemUses'||costs[0]!.target!==resourceTarget||String(costs[0]!.value)!=='1';
      });
      if(uses.max!==maximum||!correctRecovery||wrongConsumption
        ||activities.some(activity=>Number(activity.effectLinks)>0&&!((feature.gmTriggeredSave||feature.nativeFailureStatuses)&&activity.type==='save')))
        add('ACTOR_MIXED_RESOURCE_DRIFT',path,'Mixed activity consumption, recovery and effect links must exactly match the source-declared primary operation.');
    }
    const significant = sourceRuleText(feature.description).replace(/\s+/g, '').slice(0, 24);
    if (significant && !sourceRuleText(description).replace(/\s+/g, '').includes(significant)) {
      add('ACTOR_DESCRIPTION_LOSS', `/creature/${section}/${index}/description`, `Actor feature lost source description for ${feature.name}.`);
    }
    if(feature.healing){
      const activities=Array.isArray(found.activities)?found.activities.map(asRecord):[],heals=activities.filter(activity=>activity.type==='heal'),heal=heals[0];
      const part=asRecord(heal?.healing),recipient=feature.healing.target,affects=asRecord(heal?.targetAffects),range=asRecord(heal?.range);
      const compact=(value:unknown)=>String(value??'').replace(/\s+/gu,'');
      if(heals.length!==1||compact(part.formula)!==compact(feature.healing.formula)||JSON.stringify(arrayValues(part.types))!==JSON.stringify([feature.healing.type]))
        add('ACTOR_HEALING_DRIFT',path+'/healing','The native Heal must retain its one source-proven healing formula and Hit Point kind.');
      const creatureRangeMatches=feature.range!==undefined?range.units==='ft'&&Number(range.value)===feature.range&&String(range.special??'')===''
        :range.units==='spec'&&range.special===recipient?.special&&(range.value===undefined||range.value===null||range.value==='');
      if(affects.type!==(recipient?.type??'self')||String(affects.count)!=='1'||String(affects.special??'')!==(recipient?.special??'')
        ||recipient&&heal?.targetPrompt!==(recipient.type==='creature')
        ||recipient?.type==='creature'&&!creatureRangeMatches)
        add('ACTOR_HEALING_TARGET_DRIFT',path+'/healing/target','The native Heal must retain its source-proven recipient and complete eligibility; a missing distance cannot become a numeric or self-only range.');
    }
    if (feature.attack) {
      if (context.isV14 && (Array.isArray(found.activities) ? found.activities.map(asRecord) : []).some(activity => activity.type === 'attack'
        && (!['melee', 'ranged'].includes(String(asRecord(asRecord(activity.attackData).type).value))
          || !['weapon', 'spell'].includes(String(asRecord(asRecord(activity.attackData).type).classification))))) {
        add('ACTOR_ATTACK_NATIVE_TYPE_DRIFT', `/creature/${section}/${index}/attack/type`, 'V14 Attack Activities must use native melee/ranged plus weapon/spell; legacy actionType enums are not native Activity modes.');
      }
      compare(add, 'ACTOR_ATTACK_TYPE_DRIFT', `/creature/${section}/${index}/attack/type`, feature.attack.type, found.attackType);
      compare(add, 'ACTOR_TO_HIT_DRIFT', `/creature/${section}/${index}/attack/toHit`, feature.attack.toHit, found.toHit);
      compare(add, 'ACTOR_REACH_DRIFT', `/creature/${section}/${index}/attack/reach`, feature.attack.reach, found.reach);
      compare(add, 'ACTOR_RANGE_DRIFT', `/creature/${section}/${index}/attack/range`, feature.attack.range, found.range);
      compare(add, 'ACTOR_LONG_RANGE_DRIFT', `/creature/${section}/${index}/attack/longRange`, feature.attack.longRange, found.longRange);
    }
    if(feature.range!==undefined)compare(add,'ACTOR_RANGE_DRIFT',`/creature/${section}/${index}/range`,feature.range,numericOrUndefined(found.range));
    if(feature.targetSpecial!==undefined)compare(add,'ACTOR_TARGET_RESTRICTION_DRIFT',`/creature/${section}/${index}/targetSpecial`,feature.targetSpecial,found.targetSpecial);
    if (feature.legendaryCost !== undefined) {
      compare(add, 'ACTOR_LEGENDARY_COST_DRIFT', `/creature/${section}/${index}/legendaryCost`, feature.legendaryCost, found.activationValue);
    }
    for (const [damageIndex, damage] of (feature.damage ?? []).entries()) {
      const projectedFormulas = arrayValues(found.damageFormulas);
      const actualFormulas = projectedFormulas.length > 0 ? projectedFormulas : [String(found.damageFormula ?? '')];
      const ordinaryLabel=/^(?:Failure(?:\s*\(\s*half\s+(?:as\s+much\s+)?damage\s+on\s+(?:a\s+)?Success\s*\))?|on\s+a\s+failed\s+save)$/iu;
      const conditional=damage.relationship==='conditional'||damage.relationship==='replacement'
        ||Boolean(damage.condition&&!ordinaryLabel.test(damage.condition.trim()));
      if(conditional&&fullLiteral){
        // Preserve the full rule and a blocking GM boundary. This never grants
        // a package exception or treats a missing native field as automatic.
        const nativeFormulas=actualFormulas.map(compact).filter((formula):formula is string=>Boolean(formula));
        const allowed=(feature.damage??[]).filter(part=>part.relationship!=='conditional'&&part.relationship!=='replacement'
          &&(!part.condition||ordinaryLabel.test(part.condition.trim())));
        const native=nativeFormulas.length>allowed.length
          ||nativeFormulas.some(formula=>!allowed.some(part=>compact(part.formula)===formula))
          ||arrayValues(found.damageTypes).some(type=>!allowed.some(part=>normalizeDamageTypeFixed(part.type)===normalizeDamageTypeFixed(type)));
        add(native?'ACTOR_CONDITIONAL_DAMAGE_DRIFT':'ACTOR_CONDITIONAL_DAMAGE_REQUIRES_GM',`${path}/damage/${damageIndex}`,
          native?`${feature.name} projects conditional/replacement damage as unconditional native damage.`
            :`${feature.name} retains its complete conditional/replacement damage for GM adjudication; it is not unconditional native damage.`);
        continue;
      }
      if(damage.relationship==='replacement')continue; // Legacy behavior outside the proved v14 branch.
      if (!actualFormulas.map(compact).includes(compact(damage.formula))) {
        add('ACTOR_DAMAGE_FORMULA_DRIFT', `/creature/${section}/${index}/damage/${damageIndex}/formula`, `${feature.name} lost damage formula ${damage.formula}.`);
      }
      if (!arrayValues(found.damageTypes).map(normalizeDamageTypeFixed).includes(normalizeDamageTypeFixed(damage.type))) add('ACTOR_DAMAGE_TYPE_DRIFT', `/creature/${section}/${index}/damage/${damageIndex}/type`, `${feature.name} lost damage type ${damage.type}.`);
    }
    if (feature.save) {
      const zeroHp=/\.\s*((?:A|The) (?:creature|target) reduced to 0 Hit Points by this damage) must make a (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(\d+)\.\s*Failure:/iu.exec(sourceRuleText(feature.description));
      const abilities:Record<string,string>={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'};
      const conditional=fullLiteral&&feature.attack&&zeroHp&&Number(zeroHp[3])===feature.save.dc
        &&abilities[zeroHp[2]!.toLowerCase()]===feature.save.ability
        &&(!feature.save.condition||sourceRuleText(feature.save.condition)===zeroHp[1]);
      if(conditional){
        const native=found.saveDc!==undefined||arrayValues(found.saveAbilities).length>0
          ||(Array.isArray(found.activities)?found.activities.map(asRecord):[]).some(activity=>activity.type==='save');
        add(native?'ACTOR_CONDITIONAL_SAVE_DRIFT':'ACTOR_CONDITIONAL_SAVE_REQUIRES_GM',path+'/save',
          native?`${feature.name} incorrectly projects its post-damage0HP Save as an immediate native Save.`
            :`${feature.name} retains the complete post-damage0HP Save for GM adjudication; the initial attack does not execute it.`);
      }else{
        compare(add, 'ACTOR_SAVE_DC_DRIFT', `/creature/${section}/${index}/save/dc`, feature.save.dc, found.saveDc);
        if (!arrayValues(found.saveAbilities).includes(feature.save.ability)) add('ACTOR_SAVE_ABILITY_DRIFT', `/creature/${section}/${index}/save/ability`, `${feature.name} lost save ability ${feature.save.ability}.`);
      }
    }
    const actualStatuses = arrayValues(found.statuses).map(normalizeCondition);
    const nativeBranches = (feature.appliedConditions ?? []).filter((applied) => (
      applied.statuses.some((status) => actualStatuses.includes(normalizeCondition(status)))
    ));
    const nativeBranchStatuses = new Set(nativeBranches.flatMap((applied) => applied.statuses.map(normalizeCondition))
      .filter((status) => actualStatuses.includes(status)));
    if (nativeBranches.length > 1 && nativeBranches.some((applied) => applied.staged) && nativeBranchStatuses.size > 1) {
      add('STAGED_CONDITIONS_SIMULTANEOUS', `/creature/${section}/${index}/appliedConditions`, `${feature.name} projects distinct source stages together as native conditions.`);
    }
    for (const [conditionIndex, applied] of (feature.appliedConditions ?? []).entries()) {
      const expectedStatuses = applied.statuses.map(normalizeCondition);
      const conditionPath = `/creature/${section}/${index}/appliedConditions/${conditionIndex}`;
      // Check the complete parent, independently of the generated metadata.
      const conditionSource = completeSourceFeatureEvidence(context.source, context.ir, feature, `/creature/${section}/${index}`)?.quote ?? feature.description;
      const definitions = Array.isArray(found.effectDefinitions) ? found.effectDefinitions.map(asRecord) : [];
      const manualLifecycle = asRecord(found.conditionLifecycle);
      for (const status of expectedStatuses) {
        const lifecycle = sourceConditionLifecycle(conditionSource, status, applied.duration);
        if (!context.isV14 || isGeneratedConditionId(status)) continue;
        if (lifecycle.mode === 'gm') {
          if (actualStatuses.includes(status)) add('ACTOR_CONDITION_LIFECYCLE_DRIFT', conditionPath, 'This source status requires GM handling of its complete lifecycle and must not be an executable native Effect.');
          else if (!(hasConditionCompanionMarker(found, section, index, feature, 'manual') || hasConditionCompanionMarker(found, section, index, feature, 'staged'))
            && !(manualLifecycle.version === 1 && manualLifecycle.mode === 'gm' && arrayValues(manualLifecycle.statuses).includes(status)
              && compact(String(manualLifecycle.sourceText)) === compact(feature.description)
              && compact(description)?.includes(compact(feature.description) ?? '') && description.includes('GM'))) {
            add('ACTOR_CONDITION_BOUNDARY_DRIFT', conditionPath, 'A GM-only status must retain its complete source rule and an explicit non-automatic boundary.');
          }
        } else if (lifecycle.duration) {
          const matching = definitions.filter(effect => arrayValues(effect.statuses).map(normalizeCondition).includes(status));
          if (matching.some(effect => {
            const duration = asRecord(effect.duration);
            return duration.seconds !== (lifecycle.duration!.seconds ?? null) || duration.rounds !== (lifecycle.duration!.rounds ?? null) || duration.turns != null;
          })) add('ACTOR_CONDITION_DURATION_DRIFT', conditionPath, 'Native condition duration must exactly express the source interval; sourceDuration metadata cannot replace it.');
        }
      }
      const stagedCompanion = hasConditionCompanionMarker(found, section, index, feature,'staged');
      const manualCompanion = hasConditionCompanionMarker(found, section, index, feature,'manual');
      for (const status of expectedStatuses) if (!actualStatuses.includes(status)) {
        const path = `/creature/${section}/${index}/appliedConditions/${conditionIndex}`;
        if (context.isV14 && sourceConditionLifecycle(conditionSource, status, applied.duration).mode === 'gm'
          && manualLifecycle.version === 1 && manualLifecycle.mode === 'gm' && arrayValues(manualLifecycle.statuses).includes(status)
          && compact(String(manualLifecycle.sourceText)) === compact(feature.description) && compact(description)?.includes(compact(feature.description) ?? '') && description.includes('GM')) continue;
        if (stagedCompanion) {
          add('ACTOR_STAGED_CONDITION_REQUIRES_COMPANION', path, `${feature.name} retains a source-derived staged branch for the encounter companion; do not apply the missing condition natively.`);
        } else if(manualCompanion){
          add('ACTOR_CONDITION_REQUIRES_GM',path,`${feature.name} preserves this special consequence for explicit GM adjudication; it is not a native automatic effect.`);
        } else {
          add('ACTOR_CONDITION_DRIFT', path, `${feature.name} lost condition ${status}.`);
        }
      }
      if (applied.staged && expectedStatuses.filter((status) => actualStatuses.includes(status)).length > 1) add('STAGED_CONDITIONS_SIMULTANEOUS', `/creature/${section}/${index}/appliedConditions/${conditionIndex}`, `${feature.name} applies staged conditions simultaneously.`);
    }
  }
  const matched = expected.filter((feature) => items.some((item) => featureNamesMatch(item, feature))).length;
  if (matched < expected.length) add('ACTOR_FEATURE_COUNT_DRIFT', `/creature/${section}`, `${section} expected ${expected.length} separate entries but matched ${matched}.`);
}

function hasConditionCompanionMarker(
  item: Record<string, unknown>,
  section: string,
  featureIndex: number,
  feature: CanonicalFeature,
  mode:'staged'|'manual',
): boolean {
  const prefix=`encounter-${mode}`;
  const stagedPaths = (feature.appliedConditions ?? [])
    .map((condition, conditionIndex) => mode==='manual'||condition.staged ? `${prefix}:/creature/${section}/${featureIndex}/appliedConditions/${conditionIndex}` : undefined)
    .filter((path): path is string => Boolean(path));
  if (stagedPaths.length === 0) return false;
  const mechanics = Array.isArray(item.behaviorMechanics) ? item.behaviorMechanics.map(asRecord) : [];
  const description=compact(feature.description);
  if(!description)return false;
  const matching = mechanics.filter((mechanic) => {
    const marker=readEncounterRuleMarker(item,mechanic);
    return marker?.mode===mode&&marker.section===section&&marker.featureIndex===featureIndex
      &&mechanic.name===feature.name&&stagedPaths.every(path=>marker.paths.includes(path))
      &&(mechanic.gmSteps as string[]).some(step=>compact(step)?.includes(description));
  });
  return matching.length === 1;
}

function featureDescriptions(ir: MonsterIntakeIR['creature']): string[] {
  return [...ir.traits, ...ir.actions, ...ir.bonusActions, ...ir.reactions, ...ir.legendaryActions, ...(ir.mythicActions ?? [])].map((feature) => feature.description);
}

function featureNamesMatch(projected: Record<string, unknown>, expected: CanonicalFeature): boolean {
  const projectedName = String(projected.name ?? '');
  const usage = (value: string): string | undefined => value.normalize('NFKC')
    .match(/[\[［]\s*(\d+)\s*\/\s*(日|day)\s*[\]］]/iu)
    ?.slice(1).join('/');
  const expectedUsage = usage(expected.name);
  const projectedUsage = usage(projectedName);
  if (expectedUsage && projectedUsage && expectedUsage !== projectedUsage) return false;
  const compactName = (value: string): string => value.normalize('NFKC')
    .replace(/[\[［]\s*\d+\s*\/\s*(?:日|day)\s*[\]］]/giu, '')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('en-US');
  const normalizedProjectedName = compactName(projectedName);
  if (!normalizedProjectedName.includes(compactName(expected.name))) return false;
  if (expected.englishName && !normalizedProjectedName.includes(compactName(expected.englishName))) return false;
  if (!expectedUsage) return true;
  const [max, period = ''] = expectedUsage.split('/');
  const itemUses = asRecord(projected.uses);
  return numericOrUndefined(itemUses.max) === Number(max)
    && Array.isArray(itemUses.recovery)
    && itemUses.recovery.map(String).includes(period === 'day' || period === '日' ? 'day' : period);
}

function compare(
  add: (code: string, path: string, message: string) => void,
  code: string,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (expected === undefined || expected === null || expected === '') return;
  if (JSON.stringify(expected) !== JSON.stringify(actual)) add(code, path, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function compareSet(
  add: (code: string, path: string, message: string) => void,
  code: string,
  path: string,
  expected: string[],
  actual: unknown,
  normalize: (value: string) => string = (value) => value.toLowerCase(),
): void {
  const left = [...expected].map(normalize).sort();
  const right = arrayValues(actual).map(normalize).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) add(code, path, `Expected ${JSON.stringify(left)}, got ${JSON.stringify(right)}.`);
}

function compact(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const SKILL_KEYS: Record<string, string> = {
  deception: 'dec', intimidation: 'itm', perception: 'prc', stealth: 'ste', athletics: 'ath', acrobatics: 'acr',
  insight: 'ins', investigation: 'inv', arcana: 'arc', history: 'his', nature: 'nat', religion: 'rel', survival: 'sur',
  medicine: 'med', persuasion: 'per', performance: 'prf', 'sleight-of-hand': 'slt', animalHandling: 'ani',
};
const SKILL_ABILITIES: Record<string, string> = {
  dec: 'cha', itm: 'cha', prc: 'wis', ste: 'dex', ath: 'str', acr: 'dex', ins: 'wis', inv: 'int', arc: 'int',
  his: 'int', nat: 'int', rel: 'int', sur: 'wis', med: 'wis', per: 'cha', prf: 'cha', slt: 'dex', ani: 'wis',
};

function numeric(value: unknown): number {
  const result = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(result) ? result : 0;
}

function numericOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return numeric(value);
}

function numericSense(value: unknown): number | null {
  const result = numericOrUndefined(value);
  return result && result > 0 ? result : null;
}

function abilityMod(score: unknown): number { return Math.floor((numeric(score) - 10) / 2); }
function arrayValues(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }
function normalizeSize(value: unknown): string {
  return ({ tiny: 'tiny', sm: 'small', small: 'small', med: 'medium', medium: 'medium', lg: 'large', large: 'large', huge: 'huge', grg: 'gargantuan', gargantuan: 'gargantuan' } as Record<string, string>)[String(value).toLowerCase()] ?? String(value);
}
function normalizeCreatureType(value: unknown): string {
  return ({ 妖精: 'fey', 异怪: 'aberration', 野兽: 'beast', 天界生物: 'celestial', 构装生物: 'construct', 龙: 'dragon', 元素生物: 'elemental', 邪魔: 'fiend', 巨人: 'giant', 类人生物: 'humanoid', 怪兽: 'monstrosity', 泥怪: 'ooze', 植物: 'plant', 亡灵: 'undead' } as Record<string, string>)[String(value)] ?? String(value).toLowerCase();
}

function normalizeLanguage(value: string): string {
  return ({ 通用语: 'common', 矮人语: 'dwarvish', 精灵语: 'elvish', 巨人语: 'giant', 地精语: 'goblin' } as Record<string, string>)[value]
    ?? value.toLowerCase();
}

function normalizeDamageType(value: string): string {
  return ({ 强酸: 'acid', 钝击: 'bludgeoning', 冷冻: 'cold', 火焰: 'fire', 力场: 'force', 闪电: 'lightning', 黯蚀: 'necrotic', 穿刺: 'piercing', 毒素: 'poison', 心灵: 'psychic', 光耀: 'radiant', 挥砍: 'slashing', 雷鸣: 'thunder' } as Record<string, string>)[value]
    ?? value.toLowerCase();
}

function normalizeCreatureTypeFixed(value: unknown): string {
  const normalized = String(value).trim();
  const direct = ({
    '\u5996\u7cbe': 'fey',
    '\u5f02\u602a': 'aberration',
    '\u91ce\u517d': 'beast',
    '\u5929\u754c\u751f\u7269': 'celestial',
    '\u6784\u88c5\u751f\u7269': 'construct',
    '\u9f99': 'dragon',
    '\u5143\u7d20\u751f\u7269': 'elemental',
    '\u90aa\u9b54': 'fiend',
    '\u5de8\u4eba': 'giant',
    '\u7c7b\u4eba\u751f\u7269': 'humanoid',
    '\u602a\u517d': 'monstrosity',
    '\u53f8\u6ce5\u602a': 'ooze',
    '\u690d\u7269': 'plant',
    '\u4ea1\u7075': 'undead',
  } as Record<string, string>)[normalized];
  return direct ?? normalizeCreatureType(normalized);
}

function normalizeLanguageFixed(value: string): string {
  const normalized = value.trim();
  if(normalized.toLowerCase()==='deep speech')return'deep';
  const direct = ({
    '\u901a\u7528\u8bed': 'common',
    '\u77ee\u4eba\u8bed': 'dwarvish',
    '\u7cbe\u7075\u8bed': 'elvish',
    '\u5de8\u4eba\u8bed': 'giant',
    '\u5730\u7cbe\u8bed': 'goblin',
    '\u9f99\u8bed': 'draconic',
    '\u6df1\u6e0a\u8bed': 'deep',
    '\u6df1\u6e0a': 'deep',
  } as Record<string, string>)[normalized];
  return direct ?? normalizeLanguage(normalized);
}

function normalizeDamageTypeFixed(value: string): string {
  const normalized = value.trim();
  const direct = ({
    '\u9178': 'acid',
    '\u949d\u51fb': 'bludgeoning',
    '\u51b0\u51bb': 'cold',
    '\u706b\u7130': 'fire',
    '\u529b\u573a': 'force',
    '\u95ea\u7535': 'lightning',
    '\u6b7b\u7075': 'necrotic',
    '\u7a7f\u523a': 'piercing',
    '\u6bd2\u7d20': 'poison',
    '\u5fc3\u7075': 'psychic',
    '\u5149\u8000': 'radiant',
    '\u6325\u780d': 'slashing',
    '\u96f7\u9e23': 'thunder',
  } as Record<string, string>)[normalized];
  return direct ?? normalizeDamageType(normalized);
}

function normalizeCondition(value: string): string {
  const normalized = value.trim();
  const direct = ({
    '\u76ee\u76f2': 'blinded',
    '\u9b45\u60d1': 'charmed',
    '\u8033\u804b': 'deafened',
    '\u6050\u60e7': 'frightened',
    '\u6050\u614c': 'frightened',
    '\u53d7\u64d2': 'grappled',
    '\u5931\u80fd': 'incapacitated',
    '\u9690\u5f62': 'invisible',
    '\u9ebb\u75f9': 'paralyzed',
    '\u77f3\u5316': 'petrified',
    '\u4e2d\u6bd2': 'poisoned',
    '\u5012\u5730': 'prone',
    '\u675f\u7f1a': 'restrained',
    '\u9707\u6151': 'stunned',
    '\u660f\u8ff7': 'unconscious',
    '\u604d\u60da': 'dazed',
  } as Record<string, string>)[normalized];
  if (direct) return direct;
  const english = normalized.toLocaleLowerCase('en-US');
  if (STANDARD_CONDITIONS.has(english)) return english;
  const bilingual = normalized.match(/^(.+?)\s*[（(]\s*([a-z-]+)\s*[）)]$/iu);
  if (!bilingual) return english;
  const localized = ({
    '\u76ee\u76f2': 'blinded', '\u9b45\u60d1': 'charmed', '\u8033\u804b': 'deafened', '\u6050\u60e7': 'frightened', '\u6050\u614c': 'frightened',
    '\u53d7\u64d2': 'grappled', '\u5931\u80fd': 'incapacitated', '\u9690\u5f62': 'invisible', '\u9ebb\u75f9': 'paralyzed', '\u77f3\u5316': 'petrified',
    '\u4e2d\u6bd2': 'poisoned', '\u5012\u5730': 'prone', '\u675f\u7f1a': 'restrained', '\u9707\u6151': 'stunned', '\u660f\u8ff7': 'unconscious', '\u604d\u60da': 'dazed',
  } as Record<string, string>)[bilingual[1]!.trim()];
  const englishStatus = bilingual[2]!.toLocaleLowerCase('en-US');
  return localized && localized === englishStatus && STANDARD_CONDITIONS.has(englishStatus)
    ? localized
    : english;
}

const STANDARD_CONDITIONS = new Set([
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
  'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'dazed',
]);

function normalizeSkillKey(value: string): string {
  const normalized = value.trim();
  const direct = ({
    '\u6b3a\u77d2': 'deception',
    '\u5a01\u5413': 'intimidation',
    '\u5bdf\u89c9': 'perception',
    '\u9690\u533f': 'stealth',
    '\u8fd0\u52a8': 'athletics',
    '\u6742\u6280': 'acrobatics',
    '\u6d1e\u5bdf': 'insight',
    '\u8c03\u67e5': 'investigation',
    '\u5965\u79d8': 'arcana',
    '\u5386\u53f2': 'history',
    '\u81ea\u7136': 'nature',
    '\u5b97\u6559': 'religion',
    '\u751f\u5b58': 'survival',
    '\u533b\u7597': 'medicine',
    '\u8bf4\u670d': 'persuasion',
    '\u8868\u6f14': 'performance',
    '\u5de7\u624b': 'sleight-of-hand',
    '\u9a6f\u517d': 'animalHandling',
  } as Record<string, string>)[normalized];
  if (direct) return direct;
  return ({
    'animalhandling': 'animalHandling',
    'animal-handling': 'animalHandling',
    'sleightofhand': 'sleight-of-hand',
    'sleight-of-hand': 'sleight-of-hand',
  } as Record<string, string>)[normalized.toLowerCase()] ?? normalized.toLowerCase();
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/(?:p|li|div|h[1-6])\s*>/giu, '\n')
    .replace(/<[^>]+>/g, '')
    // Decode after stripping actual HTML, exactly once. Escaped source tags
    // remain visible prose rather than becoming markup or being stripped.
    .replace(/&(?:nbsp|amp|AMP|lt|LT|gt|GT|quot|QUOT|apos|#\d+|#[xX][\da-fA-F]+);/gu, entity => {
      const named:Record<string,string>={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
      const key=entity.slice(1,-1).toLowerCase();
      if(named[key]!==undefined)return named[key]!;
      const point=key.startsWith('#x')?Number.parseInt(key.slice(2),16):Number.parseInt(key.slice(1),10);
      // Numeric spellings of these escaped display characters are equivalent;
      // unsupported entities stay literal rather than guessing browser repair.
      return [34,38,39,60,62,160].includes(point)?String.fromCodePoint(point):entity;
    })
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{2,}/gu, '\n')
    .trim();
}

function dedupe(findings: IntakeFinding[]): IntakeFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\0${finding.path}\0${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
