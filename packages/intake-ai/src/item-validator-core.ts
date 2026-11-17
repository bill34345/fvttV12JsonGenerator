import { sha256 } from '@fvtt-json-generator/contracts';
import { itemRandomSummonRules, itemSummonBinding, itemSummonRules, readItemRandomSummon, readItemSummon, resolveFormalItemCategory } from '@fvtt-json-generator/models/item';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import { itemCategoryOnLine, type ItemCoreSpellResolver } from './item-core';
import { chargedSpellNameKey, compareChargedSpellOptions, exactChargedSpellOption, sourceChargedSpellOptions, spellCastingTiming, spellUsesCasterSaveDc, type ChargedSpellOption } from './item-charged-spell-evidence';
import { hasItemAcBonus, validateP1Ability, validateP1Item } from './item-p1-evidence';
import {
  citesContainerCapacity, sourceEnchantmentKind, timedSpeedSeconds, validateContainerEvidence, validateEnchantmentEvidence, validateSpellScrollEvidence,
} from './item-p2-evidence';
import { sourceDescribesSpellStorage, validateSpellStorageEvidence } from './item-spell-storage-evidence';
import { ITEM_ACTIVATION_TYPES, ITEM_INTAKE_RECOVERY_PERIODS } from './item-types';
import type {
  ItemDiscoveryCandidate,
  ItemIntakeAbility,
  ItemIntakeFinding,
  ItemIntakeIR,
  ItemIntakeRecoveryPeriod,
  ItemIntakeUses,
  ItemIntakeValidationResult,
} from './item-types';

type AddFinding = (
  code: string,
  path: string,
  message: string,
  origin: ItemIntakeFinding['origin'],
  evidence?: EvidenceRef[],
) => void;

const RECOVERY_WORDS: Record<ItemIntakeRecoveryPeriod, RegExp> = {
  lr: /\blong rests?\b|长休|长时间休息|長休|長時間休息/iu,
  sr: /\bshort rests?\b|短休|短时间休息|短時間休息/iu,
  dawn: /\b(?:dawn|sunrise)\b|黎明|日出|破晓|破曉/iu,
  dusk: /\b(?:dusk|sunset)\b|黄昏|黃昏|日落/iu,
  day: /\b(?:daily|each day|per day|every day|next day|new day)\b|每天|每日|每个日历日|次日/iu,
};

const RECOVERY_FORMULA = /^\d+(?:d[1-9]\d*)?(?:\s*[+-]\s*\d+)?$/iu;

export function validateItemIntakeIRWithResolver(
  source: string,
  value: unknown,
  candidate: ItemDiscoveryCandidate,
  resolver: ItemCoreSpellResolver,
): ItemIntakeValidationResult {
  const findings: ItemIntakeFinding[] = [];
  const add = (
    code: string,
    path: string,
    message: string,
    origin: ItemIntakeFinding['origin'],
    evidence?: EvidenceRef[],
  ) => findings.push({
    id: `${code}:${path}`,
    code,
    path,
    message,
    blocking: true,
    origin,
    ...(evidence ? { evidence } : {}),
  });
  if (!isRecord(value)) {
    add('INVALID_IR', '/', 'Item Intake response must be a JSON object.', 'schema');
    return summarize(findings);
  }
  const ir = value as ItemIntakeIR;
  if (ir.schemaVersion !== 1) add('UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', 'schemaVersion must be 1.', 'schema');
  const expectedHash = sha256(source);
  if (ir.source?.sha256 !== expectedHash) add('SOURCE_HASH_MISMATCH', '/source/sha256', 'IR source hash does not match the submitted source.', 'evidence');
  if (ir.source?.length !== source.length) add('SOURCE_LENGTH_MISMATCH', '/source/length', 'IR source length must use UTF-16 code units.', 'evidence');
  if (!isCandidate(source, candidate)) add('INVALID_DISCOVERY_BOUNDARY', '/candidate', 'Discovery candidate does not identify one exact source slice.', 'evidence', [candidate]);

  if (!isRecord(ir.item)) {
    add('MISSING_ITEM', '/item', 'item must be an object.', 'schema');
    return summarize(findings);
  }
  if (typeof ir.item.name !== 'string' || !ir.item.name.trim()) add('MISSING_ITEM_NAME', '/item/name', 'Item name is required.', 'schema');
  if (typeof ir.item.type !== 'string' || !ir.item.type.trim()) add('MISSING_ITEM_TYPE', '/item/type', 'Item type is required.', 'schema');
  const category = typeof ir.item.type === 'string' ? resolveFormalItemCategory(ir.item.type) : undefined;
  const typeEvidence = claimEvidence(ir.claims, '/item/type');
  if (ir.item.type && !category) {
    add('UNSUPPORTED_ITEM_TYPE', '/item/type', 'Use the explicit, supported Item category from the source. Unknown types cannot be imported as loot.', 'semantic', typeEvidence);
  } else if (category && typeEvidence.length && !typeEvidence.some((ref) =>
    ref?.quote?.split(/\r?\n/u).some((line) => {
      const cited = itemCategoryOnLine(line);
      return cited?.type === category.type && cited.subtype === category.subtype;
    }))) {
    add('ITEM_TYPE_NOT_EXPLICIT', '/item/type', 'The Item category and subtype must match the quoted source category.', 'semantic', typeEvidence);
  }
  if (!Array.isArray(ir.item.abilities)) add('INVALID_ABILITIES', '/item/abilities', 'abilities must be an array.', 'schema');

  const abilityIds = new Set<string>();
  const abilities = Array.isArray(ir.item.abilities) ? ir.item.abilities : [];
  const container = abilities.find(ability => ability?.kind === 'container');
  const spellScroll = abilities.find(ability => ability?.kind === 'spell-scroll');
  const enchantment = abilities.find(ability => ability?.kind === 'enchant-weapon-bonus' || ability?.kind === 'enchant-armor-resistance');
  const itemSource = source.slice(candidate.start, candidate.end);
  const randomSummonRules = category?.subtype === 'wondrous' ? itemRandomSummonRules(itemSource) : undefined;
  if (randomSummonRules && !readItemRandomSummon(itemSource, randomSummonRules)) {
    add('ITEM_RANDOM_SUMMON_BINDINGS_REQUIRED', '/item/abilities', '请在原稿中加入可掷骰的 Foundry 合集表链接，并按骰值编号列出每个结果的 NPC Actor 链接。', 'semantic');
  } else if (randomSummonRules && (ir.item.uses || abilities.length)) {
    add('INVALID_ITEM_RANDOM_SUMMON_MECHANICS', '/item/abilities', 'The source-linked summon table supplies the activity and shared uses. Keep abilities empty and item.uses null.', 'semantic');
  }
  const summon = abilities.find(ability => ability?.kind === 'summon-creature');
  if (summon && (category?.subtype !== 'wondrous' || ir.item.uses || abilities.length !== 1)) {
    add('INVALID_ITEM_SUMMON_CATEGORY', '/item/abilities', 'A fixed figurine Summon requires a Wondrous Item with no separate usage pool or activity.', 'semantic');
  } else if (category?.subtype === 'wondrous' && itemSummonRules(itemSource)) {
    if (!itemSummonBinding(itemSource)) {
      add('ITEM_SUMMON_ACTOR_BINDING_REQUIRED', '/item/abilities', '请在原稿中加入要使用的 Foundry 合集 Actor 链接。', 'semantic');
    } else if (!summon) {
      add('MISSING_ITEM_SUMMON', '/item/abilities', 'Preserve the fixed Actor and its source range, duration and reversion cooldown.', 'semantic');
    }
  }
  const timedSpeed = abilities.find(ability => ability?.kind === 'timed-speed');
  if (timedSpeed && (category?.subtype !== 'wondrous' || ir.item.attunement !== 'required' || ir.item.uses || abilities.length !== 1)) {
    add('INVALID_TIMED_SPEED_CATEGORY', '/item/abilities', 'Timed speed requires one attuned Wondrous Item without a separate activity or charges.', 'semantic');
  } else if (!timedSpeed && category?.subtype === 'wondrous' && timedSpeedSeconds(itemSource)) {
    add('MISSING_TIMED_SPEED', '/item/abilities', 'Preserve the source speed toggle and cumulative long-rest time budget.', 'semantic');
  }
  const storage = abilities.find(ability => ability?.kind === 'spell-storage');
  if (storage && (category?.subtype !== 'ring' || ir.item.attunement !== 'required' || ir.item.uses || abilities.length !== 1)) {
    add('INVALID_SPELL_STORAGE_CATEGORY', '/item/abilities', 'Spell storage requires an attuned Ring without other activities or a shared use pool.', 'semantic');
  } else if (!storage && category?.subtype === 'ring' && sourceDescribesSpellStorage(itemSource)) {
    add('MISSING_SPELL_STORAGE', '/item/abilities', 'Preserve the ring’s storage capacity and current inventory.', 'semantic');
  }
  if (enchantment && (abilities.length !== 1 || ir.item.uses || category?.subtype
    || (enchantment.kind === 'enchant-weapon-bonus'
      ? category?.type !== 'weapon' || (ir.item.attunement != null && ir.item.attunement !== 'none') || ir.item.rarity != null
      : category?.type !== 'armor' || ir.item.attunement !== 'required'))) {
    add('INVALID_ENCHANTMENT_CATEGORY', '/item/abilities', 'A native Enchant template needs an eligible generic category, source attunement, and no other activities or resources.', 'semantic');
  } else if (!enchantment && !category?.subtype && ['weapon', 'armor'].includes(category?.type ?? '') && sourceEnchantmentKind(itemSource)) {
    add('MISSING_ENCHANTMENT_VARIANTS', '/item/abilities', 'Preserve the source choices in a native Enchant template.', 'semantic');
  }
  if (spellScroll && (category?.subtype !== 'scroll' || ir.item.uses || abilities.length !== 1
    || (ir.item.attunement != null && ir.item.attunement !== 'none'))) {
    add('INVALID_SPELL_SCROLL_CATEGORY', '/item/abilities', 'A standard Spell Scroll has no separate activity, use pool, or attunement.', 'semantic');
  }
  if (container && ((category?.type !== 'container' && category?.subtype !== 'wondrous') || ir.item.uses || abilities.length !== 1)) {
    add('INVALID_CONTAINER_CATEGORY', '/item/abilities', 'Native capacity requires a Container or Wondrous Item without any other Activities or use pool.', 'semantic');
  } else if (!container && category?.type === 'container' && citesContainerCapacity(source.slice(candidate.start, candidate.end))) {
    add('MISSING_CONTAINER_CAPACITY', '/item/abilities', 'Preserve the explicit source container capacity.', 'semantic');
  }
  const chargedOptions = sourceChargedSpellOptions(candidate);
  const expectedClaimPaths = ['/item/name', '/item/type'];
  if (ir.item.uses) {
    expectedClaimPaths.push('/item/uses/max');
    if (!Number.isInteger(ir.item.uses.max) || ir.item.uses.max < 1) {
      add('INVALID_USES_MAX', '/item/uses/max', 'Item use maximum must be a positive integer.', 'schema');
    }
    const usesEvidence = claimEvidence(ir.claims, '/item/uses/recovery', '/item/uses/max');
    validateRecovery(ir.item.uses, '/item/uses', usesEvidence, add, declaresChargePool(itemSource));
  }
  for (const [index, ability] of abilities.entries()) {
    const path = `/item/abilities/${index}`;
    validateAbility(source, candidate, ability, path, add, resolver, chargedOptions);
    if (ability?.kind === 'spell') validateSpellPool(ability, ir.item.uses, path, add);
    if (typeof ability?.id !== 'string' || !ability.id.trim()) {
      add('MISSING_ABILITY_ID', `${path}/id`, 'Ability id is required.', 'schema');
    } else if (abilityIds.has(ability.id)) {
      add('DUPLICATE_ABILITY_ID', `${path}/id`, `Duplicate ability id: ${ability.id}`, 'semantic');
    } else {
      abilityIds.add(ability.id);
      expectedClaimPaths.push(`/item/abilities/${ability.id}`);
    }
  }
  for (const [index, option] of compareChargedSpellOptions(chargedOptions, abilities).entries()) {
    const path = `/item/abilities/source-charged-spell/${option.evidence.start}/${index}`;
    if (option.problem === 'unreadable') {
      add('CHARGED_SPELL_TABLE_ROW_NEEDS_REVIEW', path,
        `「${option.name}」的法术或充能栏需要核对。`, 'coverage', [option.evidence]);
    } else if (option.problem === 'missing') {
      add('MISSING_CHARGED_SPELL_ACTIVITY', path,
        `原文明确授予「${option.name}」，基础费用 ${option.cost} 点充能，整理结果缺少对应的施法活动。`, 'coverage', [option.evidence]);
    } else {
      add('CHARGED_SPELL_COST_MISMATCH', path,
        `「${option.name}」在原文中的基础费用是 ${option.cost} 点充能，整理结果的费用不符。`, 'coverage', [option.evidence]);
    }
  }
  validateP1Item(itemSource, ir.item, category, add);

  const claims = Array.isArray(ir.claims) ? ir.claims : [];
  if (!Array.isArray(ir.claims)) add('INVALID_CLAIMS', '/claims', 'claims must be an array.', 'schema');
  for (const [index, claim] of claims.entries()) {
    if (!isRecord(claim) || typeof claim.path !== 'string' || !Array.isArray(claim.evidence) || !claim.evidence.length) {
      add('INVALID_CLAIM', `/claims/${index}`, 'Every claim requires a path and at least one exact source evidence range.', 'schema');
      continue;
    }
    validateEvidence(source, candidate, claim.evidence as EvidenceRef[], `/claims/${index}/evidence`, add);
  }
  for (const expectedPath of expectedClaimPaths) {
    if (!claims.some((claim: any) => claim?.path === expectedPath && Array.isArray(claim.evidence) && claim.evidence.length)) {
      add('MISSING_MECHANICAL_CLAIM', expectedPath, 'Every mechanical Item field must have an explicit source-backed claim.', 'evidence');
    }
  }

  const coverage = Array.isArray(ir.coverage) ? ir.coverage : [];
  if (!Array.isArray(ir.coverage)) add('INVALID_COVERAGE', '/coverage', 'coverage must be an array.', 'schema');
  for (const [index, entry] of coverage.entries()) {
    if (!isRecord(entry) || !['mechanical', 'narrative', 'ignored-with-reason'].includes(String(entry.classification))) {
      add('INVALID_COVERAGE_ENTRY', `/coverage/${index}`, 'Coverage entry requires a valid classification.', 'schema');
      continue;
    }
    validateEvidence(source, candidate, [entry as unknown as EvidenceRef], `/coverage/${index}`, add);
  }
  validateCoveragePartition(coverage as EvidenceRef[], candidate, add);

  if (!Array.isArray(ir.uncertainties)) add('INVALID_UNCERTAINTIES', '/uncertainties', 'uncertainties must be an array.', 'schema');
  for (const [index, uncertainty] of (Array.isArray(ir.uncertainties) ? ir.uncertainties : []).entries()) {
    if (uncertainty) {
      const evidence = Array.isArray(uncertainty.evidence) ? uncertainty.evidence : [];
      if (evidence.length) validateEvidence(source, candidate, evidence, `/uncertainties/${index}/evidence`, add);
      findings.push({
        id: String(uncertainty.id || `AI_UNCERTAINTY:${uncertainty.path ?? '/'}`),
        code: String(uncertainty.code || 'AI_UNCERTAINTY'),
        path: String(uncertainty.path || '/'),
        message: String(uncertainty.message || 'AI reported an unresolved Item ambiguity.'),
        blocking: uncertainty.blocking !== false,
        origin: 'semantic',
        evidence,
      });
    }
  }
  return summarize(dedupe(findings));
}

function claimEvidence(claims: ItemIntakeIR['claims'], ...paths: string[]): EvidenceRef[] {
  return Array.isArray(claims) ? claims.flatMap((claim) =>
    paths.includes(claim?.path) && Array.isArray(claim?.evidence) ? claim.evidence : []) : [];
}

function validateRecovery(uses: ItemIntakeUses, poolPath: string, evidence: EvidenceRef[], add: AddFinding, sharedCharges = false): void {
  const path = `${poolPath}/recovery`;
  const clauses = evidence.flatMap((ref) => typeof ref?.quote === 'string' ? ref.quote.split(/[。.!?；;\n]+/u) : [])
    .filter(clause => !sharedCharges || restoresItemChargePool(clause));
  if (!Array.isArray(uses.recovery)) {
    add('INVALID_USES_RECOVERY', path, 'Item recovery must be an array.', 'schema');
    return;
  }
  const periods = new Set<ItemIntakeRecoveryPeriod>();
  for (const [index, entry] of uses.recovery.entries()) {
    const entryPath = `${path}/${index}`;
    if (!entry || !ITEM_INTAKE_RECOVERY_PERIODS.includes(entry.period)
      || (entry.type !== 'recoverAll' && entry.type !== 'formula')
      || (entry.type === 'recoverAll' && 'formula' in entry && entry.formula != null)
      || (entry.type === 'formula' && (typeof entry.formula !== 'string' || !RECOVERY_FORMULA.test(entry.formula.trim())))) {
      add('INVALID_USES_RECOVERY', entryPath, 'Item recovery requires a supported period and either recoverAll or a numeric/dice formula.', 'schema');
      continue;
    }
    if (periods.has(entry.period)) {
      add('DUPLICATE_USES_RECOVERY', entryPath, 'A recovery period cannot be applied twice to the same Item pool.', 'semantic');
    }
    periods.add(entry.period);
    const matchingClauses = clauses.filter((clause) => recoveryPeriodInClause(clause, entry.period));
    if (!matchingClauses.length) {
      add('USES_RECOVERY_PERIOD_NOT_EXPLICIT', entryPath, 'The Item recovery period must match an explicit source recovery quote.', 'semantic', evidence);
    } else if (entry.type === 'formula') {
      const formula = entry.formula.toLowerCase().replace(/\s/g, '');
      if (!matchingClauses.some((clause) =>
        [...clause.matchAll(/\d+d[1-9]\d*(?:\s*[+-]\s*\d+)?|(?<![\w+-])\d+(?![\wd])/giu)]
          .some(([term]) => term.toLowerCase().replace(/\s/g, '') === formula))) {
        add('USES_RECOVERY_FORMULA_NOT_EXPLICIT', entryPath, 'Recovery must preserve the numeric amount or dice formula in the source quote.', 'semantic', evidence);
      }
    } else if (matchingClauses.some((clause) => /\d+d[1-9]\d*/iu.test(clause))) {
      add('USES_DICE_RECOVERY_AS_FULL', entryPath, 'Dice-based recovery cannot be replaced with full recovery.', 'semantic', evidence);
    } else if (matchingClauses.some((clause) => hasPartialNumericRecovery(clause, uses.max))) {
      add('USES_NUMERIC_RECOVERY_AS_FULL', entryPath, 'A stated partial recovery amount cannot be replaced with full recovery.', 'semantic', evidence);
    }
  }
  for (const period of ITEM_INTAKE_RECOVERY_PERIODS) {
    if (!periods.has(period) && clauses.some((clause) => recoveryPeriodInClause(clause, period))) {
      add('USES_RECOVERY_OMITTED', path, `The Item uses claim includes a ${period} recovery rule that must be preserved.`, 'semantic', evidence);
    }
  }
}

function declaresChargePool(source: string): boolean {
  const text = source.replace(/<[^>]*>/gu, '');
  return /\b(?:has|holds?|contains?)\s+(?:up to\s+)?\d+\s+(?:shared\s+)?charges?\b|(?:具有|擁有|拥有|共有|有)\s*\d+\s*(?:次|点|點|发|發)?\s*(?:共享|共用)?充[能電]/iu.test(text);
}

function restoresItemChargePool(clause: string): boolean {
  if (INDEPENDENT_POOL.test(clause)
    || /\b(?:if|when)\b[^,;]*(?:roll(?:ed|s)?|die result)|(?:如果|若)(?:骰值|掷出|擲出)|骰值为|骰值為/iu.test(clause)) return false;
  return /\b(?:regain|recover|recharge|restore|replenish)(?:s|ed|ing)?\s+(?:(?:all|of|the|its|up to|expended|spent|used|[\ddD]+(?:\s*[+-]\s*\d+)?)\s+)*(?:charges?|uses?)\b|(?:恢复|恢復|重获|重獲|补充|補充)(?:\s*(?:所有|全部|最多|至多|[\ddD]+(?:\s*[+-]\s*\d+)?|次|点|點|发|發|已?消耗的?|已?用掉的?|已?花[费費]的?))*\s*(?:充[能電]|使用[次]?[数數])/iu.test(clause);
}

function hasPartialNumericRecovery(clause: string, maximum: number): boolean {
  const amounts = clause.matchAll(
    /\b(?:regain|recover|recharge|restore)(?:s|ed|ing)?\s+(?:up to\s+)?(\d+)(?:\s+of(?:\s+its)?(?:\s+\d+)?)?\s+(?:(?:expended|spent|used)\s+)?(?:charges?|uses?)\b|(?:恢复|恢復|重获|重獲|补充|補充)\s*(?:最多|至多)?\s*(\d+)\s*(?:次|点|點|发|發|个|個)?\s*(?:(?:已)?(?:消耗|用掉|花费|花費)的?)?\s*(?:充能|使用次数|使用次數)/giu,
  );
  return [...amounts].some((match) => Number(match[1] ?? match[2]) < maximum);
}

function recoveryPeriodInClause(clause: string, period: ItemIntakeRecoveryPeriod): boolean {
  return RECOVERY_WORDS[period].test(clause)
    && !/\b(?:does not|cannot|never)\s+(?:regain|recover|recharge|restore|refresh|reset)\b|(?:不会|不能|無法|无法)(?:恢复|恢復|重获|重獲|补充|補充)/iu.test(clause)
    && (period !== 'day' || !ITEM_INTAKE_RECOVERY_PERIODS.some((specific) => specific !== 'day' && RECOVERY_WORDS[specific].test(clause)))
    && (period === 'day' || /\b(?:regain\w*|recover\w*|recharg\w*|restore\w*|refresh\w*|reset\w*|until|once)\b|恢复|恢復|重获|重獲|补充|補充|充能|再(?:次)?使用|每(?:次|日)/iu.test(clause));
}

function validateAbility(
  source: string,
  candidate: ItemDiscoveryCandidate,
  ability: ItemIntakeAbility,
  path: string,
  add: AddFinding,
  resolver: ItemCoreSpellResolver,
  chargedOptions: readonly ChargedSpellOption[],
): void {
  if (!isRecord(ability)) {
    add('INVALID_ABILITY', path, 'Ability must be an object.', 'schema');
    return;
  }
  const evidence = Array.isArray(ability.evidence) ? ability.evidence as EvidenceRef[] : [];
  if (!evidence.length) add('MISSING_ABILITY_EVIDENCE', `${path}/evidence`, 'Every Item mechanic requires an exact source evidence range.', 'evidence');
  else validateEvidence(source, candidate, evidence, `${path}/evidence`, add);
  if (ability.kind === 'passive-ac') {
    if (!Number.isInteger(ability.value) || ability.value === 0) add('INVALID_AC_BONUS', `${path}/value`, 'passive-ac value must be a non-zero integer explicitly stated by the source.', 'schema');
    const text = evidence.map((entry) => entry?.quote ?? '').join('\n');
    if (!hasItemAcBonus(text, ability.value)) {
      add('AC_BONUS_NOT_EXPLICIT', `${path}/value`, 'A passive AC modifier requires an explicit bonus to armor class.', 'semantic', evidence);
    }
    return;
  }
  if (ability.kind === 'light') {
    if (ability.activation !== 'action' && ability.activation !== 'bonus' && ability.activation !== 'reaction' && ability.activation !== 'free') add('INVALID_LIGHT_ACTIVATION', `${path}/activation`, 'Light activation is invalid.', 'schema');
    if (ability.consumption !== 0) add('LIGHT_MUST_NOT_CONSUME_USES', `${path}/consumption`, 'A light mechanic with consumption is ambiguous and must be reviewed.', 'semantic');
    if (!Number.isFinite(ability.bright) || !Number.isFinite(ability.dim) || ability.bright < 0 || ability.dim < ability.bright) add('INVALID_LIGHT_RADIUS', path, 'Light requires non-negative bright and outer dim radii with dim >= bright.', 'schema');
    if (ability.extinguish !== 'disable-effect') add('INVALID_LIGHT_EXTINGUISH', `${path}/extinguish`, 'The V14 core contract uses disable-effect to extinguish Item light.', 'schema');
    const text = evidence.map((entry) => entry.quote).join('\n');
    if (!/(?:以|用|使用|as)\s*(?:一个|an?)?\s*(?:动作|action)/iu.test(text)) {
      add('LIGHT_ACTIVATION_NOT_EXPLICIT', `${path}/activation`, 'Token light requires an explicit activation action; decorative shine is not token light.', 'semantic', evidence);
    }
    const chineseRadii = text.match(/(\d+)\s*尺[^。\n]{0,32}明亮光照[^。\n]{0,48}在此之外\s*(\d+)\s*尺[^。\n]{0,32}微光/iu);
    if (chineseRadii) {
      const bright = Number(chineseRadii[1]);
      const additionalDim = Number(chineseRadii[2]);
      if (ability.bright !== bright || ability.dim !== bright + additionalDim) {
        add('LIGHT_RADIUS_EVIDENCE_MISMATCH', path, 'Light radii do not match the source bright radius plus additional dim distance.', 'semantic', evidence);
      }
    } else if (!/(?:bright light|明亮光照)/iu.test(text) || !/(?:dim light|微光)/iu.test(text)) {
      add('LIGHT_NOT_EXPLICIT', path, 'Light requires explicit bright and dim light source wording.', 'semantic', evidence);
    }
    return;
  }
  if (ability.kind === 'spell') {
    if (!Number.isInteger(ability.consumption) || ability.consumption < 0) add('INVALID_SPELL_CONSUMPTION', `${path}/consumption`, 'Spell use consumption must be a non-negative integer.', 'schema');
    if (typeof ability.spell?.identifier !== 'string' || typeof ability.spell?.name !== 'string') {
      add('INVALID_SPELL_REFERENCE', `${path}/spell`, 'Spell requires identifier and canonical English name.', 'schema');
      return;
    }
    const text = quotedSpellText(evidence);
    const nameEvidence = chargedSpellNameKey(text);
    if (![ability.spell.identifier, ability.spell.name].some(value => value.trim() && nameEvidence.includes(chargedSpellNameKey(value)))) {
      add('SPELL_NOT_EXPLICIT', `${path}/spell`, 'Spell evidence must contain the selected spell identifier or canonical name.', 'semantic', evidence);
    }
    const resolvedSpell = resolver.resolveSpell(ability.spell.identifier, ability.spell.name);
    if (!resolvedSpell) {
      add('UNRESOLVED_SPELL', `${path}/spell`, `No available dnd5e spell matches "${ability.spell.identifier}" and its name.`, 'semantic', evidence);
    } else {
      const canonical = resolvedSpell.castingTime?.type ?? resolver.resolveActivation(ability.spell.identifier, ability.spell.name);
      validateSpellCasting(ability, path, text, candidate.quote, canonical, resolvedSpell.level, evidence, add,
        exactChargedSpellOption(chargedOptions, ability));
    }
    return;
  }
  switch (ability.kind) {
    case 'spell-scroll':
      validateSpellScrollEvidence(ability, path, evidence, source.slice(candidate.start, candidate.end), resolver, add);
      return;
    case 'spell-storage':
      validateSpellStorageEvidence({ ...ability }, path, evidence, source.slice(candidate.start, candidate.end), resolver, add);
      return;
    case 'summon-creature': {
      const text = evidence.map(ref => ref?.quote ?? '').join('\n');
      const binding = itemSummonBinding(text);
      const rules = itemSummonRules(text);
      const original = itemSummonBinding(source.slice(candidate.start, candidate.end));
      if (!readItemSummon({ ...ability }) || binding?.actorUuid !== ability.actorUuid
        || binding?.actorName !== ability.actorName || original?.actorUuid !== ability.actorUuid
        || rules?.rangeFeet !== ability.rangeFeet || rules?.durationHours !== ability.durationHours
        || rules?.cooldownDays !== ability.cooldownDays) {
        add('ITEM_SUMMON_EVIDENCE_MISMATCH', path, 'Quote one exact Actor link, short-range Magic action, duration and cooldown after reversion.', 'semantic', evidence);
      }
      return;
    }
    case 'timed-speed':
      if (!Number.isSafeInteger(ability.seconds) || ability.seconds <= 0
        || timedSpeedSeconds(evidence.map(ref => ref?.quote ?? '').join('\n')) !== ability.seconds
        || timedSpeedSeconds(source.slice(candidate.start, candidate.end)) !== ability.seconds) {
        add('TIMED_SPEED_EVIDENCE_MISMATCH', path,
          'Cite the bonus-action start, speed doubling, repeatable stop, cumulative amount and completed Long Rest recovery.', 'semantic', evidence);
      }
      return;
    case 'container':
      validateContainerEvidence(ability, path, evidence, add);
      return;
    case 'enchant-weapon-bonus': case 'enchant-armor-resistance':
      validateEnchantmentEvidence(ability, path, evidence, source.slice(candidate.start, candidate.end), add);
      return;
    case 'heal': case 'attack': case 'save': case 'utility':
    case 'passive-save': case 'passive-resistance': case 'passive-movement': case 'weapon-bonus':
      validateP1Ability(ability, path, evidence, add);
      return;
    default:
      add('UNSUPPORTED_ABILITY_KIND', `${path}/kind`, 'Unsupported Item ability kind.', 'schema');
  }
}

const LEVELED_CHARGE_INCREMENT = /\b(?:each|every) additional charge\b[^.]*\b(?:(?:one|1)\s+levels?|level\s+by\s+(?:one|1))\b|\b(?:(?:one|1)\s+levels?|level\s+by\s+(?:one|1))\b[^.]*\b(?:each|every) additional charge\b|每(?:多|额外|額外)(?:消耗|花费|花費|支出)\s*[1一]\s*(?:次|点|點|发|發)?\s*(?:充能|充電)[^。;；]*?(?:提高|增加|提升|升)\s*[1一]\s*[环環]/giu;
const CHARGE_CAP = /\b(?:no more than|up to|at most|maximum of)\s*(\d+)\s+charges?\b|(?:最多|至多|上限为|上限為)(?:消耗|使用|花费|花費)?\s*(\d+)\s*(?:次|点|點|发|發)?\s*充能/giu;
const EXPLICIT_CHARGE_COST = /\b(?:for|spend(?:s|ing)?|expend(?:s|ing)?|costs?)\s+(\d+|one)\s+charges?\b|(?:消耗|花费|花費)\s*(?:戒指的\s*)?(\d+|一)\s*(?:次|点|點|发|發)?\s*(?:共享|共用)?\s*充能/giu;
const EXPLICIT_SAVE_DC = /(?:\bsave\s+dc|\bdc|豁免难度|豁免難度)\s*(?:为|為|是|[:：=])?\s*(\d+)\b/giu;
const EXPLICIT_LEVEL = /\b(?:level\s*(\d+)|(\d+)(?:st|nd|rd|th)?[\s-]+level)\b|(\d+)\s*[环環]/giu;
const INDEPENDENT_POOL = /\b(?:own|independent|separate)\b[^.]*\b(?:uses?|charges?|pool)\b|\b(?:uses?|charges?)\b[^.]*\b(?:independent|separate)\b|独立.{0,10}(?:次数|使用|充能)|獨立.{0,10}(?:次數|使用|充能)/iu;
const SHARED_POOL = /\b(?:shared|from (?:the|this) item(?:'s)?)\b[^.]*\b(?:charges?|uses?|pool)\b|(?:共享|共用).{0,8}充能/iu;
const ONCE = /\b(?:once|one\s+(?:use|charge))\b|(?:仅|僅|只)?能.{0,8}(?:一次|1\s*次)|[1一]\s*(?:次)?\s*(?:使用次数|使用次數|独立次数|獨立次數)/iu;
const USES_MAX = /\b(\d+)\s+(?:uses?|charges?)\b|(\d+)\s*(?:次|点|點|发|發)\s*(?:独立|獨立)?(?:使用次数|使用次數|使用|充能)/giu;
const AT_WILL = /\bat will\b|\b(?:without expending|does not expend|doesn't expend|no)\s+(?:any )?charges\b|随意施[放展]|隨意施[放展]|不消耗.{0,5}(?:戒指|任何)充能/iu;
const CAP_PHRASE = /\b(?:no more than|up to|at most|maximum)\b|最多|至多|最高|上限/iu;

function quotedSpellText(evidence: EvidenceRef[]): string {
  return evidence.map((entry) => entry?.quote ?? '').join('\n').replace(/[*_]/g, '');
}

function quotedNumbers(text: string, pattern: RegExp): Set<number> {
  return new Set([...text.matchAll(pattern)].map((match) => {
    const term = match.slice(1).find(Boolean);
    return term === 'one' || term === '一' ? 1 : Number(term);
  }));
}

function validateSpellCasting(
  ability: Extract<ItemIntakeAbility, { kind: 'spell' }>,
  path: string,
  text: string,
  source: string,
  canonicalActivation: string | undefined,
  canonicalLevel: number | undefined,
  evidence: EvidenceRef[],
  add: AddFinding,
  chargedOption?: ChargedSpellOption,
): void {
  const { activation, activationOverride, level, saveDc, maxCharges, consumption } = ability;
  const timing = spellCastingTiming(text, chargedOption);
  const explicitActivations = timing.activations;
  const withoutIncrement = text.replace(LEVELED_CHARGE_INCREMENT, '');
  const baseClauses = withoutIncrement.split(/[。.!?；;，,\n]+/u).filter((clause) => !CAP_PHRASE.test(clause)).join('\n');
  const spellLevel = quotedNumbers(chargedOption?.scaling
    ? baseClauses.replace(/(?:至多|最多|最高)(?:升至|到|为|為)?\s*[1-9]\s*[环環]|(?:up to|max(?:imum)?)\s*(?:level\s*)?[1-9](?:st|nd|rd|th)?(?:[- ]level)?/giu, '')
    : baseClauses, EXPLICIT_LEVEL);
  if (chargedOption?.scaling && spellLevel.size === 0 && canonicalLevel !== undefined) spellLevel.add(canonicalLevel);
  const saveDcs = chargedOption && spellUsesCasterSaveDc(chargedOption, source) ? new Set<number>() : quotedNumbers(text, EXPLICIT_SAVE_DC);
  const scalingText = chargedOption?.fixedChargeCost ? chargedOption.evidence.quote : text;
  const caps = quotedNumbers(scalingText, CHARGE_CAP);
  const increment = scalingText.replace(LEVELED_CHARGE_INCREMENT, '') !== scalingText;
  if (!ITEM_ACTIVATION_TYPES.includes(activation) || (activationOverride !== undefined && activationOverride !== true)) {
    add('INVALID_SPELL_ACTIVATION', `${path}/activation`, 'Spell casting requires a supported activation and either true or no override flag.', 'schema', evidence);
  } else if (timing.unsupported || (explicitActivations.size > 0 && (explicitActivations.size !== 1 || !explicitActivations.has(activation)))
    || (activationOverride === true
      ? !canonicalActivation || activation === canonicalActivation || !explicitActivations.has(activation)
      : !canonicalActivation || activation !== canonicalActivation)) {
    add('SPELL_ACTIVATION_MISMATCH', `${path}/activation`, 'Use the locked spell activation unless an exact source quote changes the casting time.', 'semantic', evidence);
  }
  if ((level !== undefined && (!Number.isSafeInteger(level) || level < (canonicalLevel ?? 0) || level > 9
    || (!spellLevel.has(level) && (spellLevel.size > 0 || level !== canonicalLevel)) || (canonicalLevel === 0 && level !== 0))) || spellLevel.size > 1
    || (level === undefined && spellLevel.size > 0 && !spellLevel.has(canonicalLevel ?? -1))) {
    add('SPELL_LEVEL_NOT_EXPLICIT', `${path}/level`, 'Spell level must match the stated casting level and be supported by the locked spell.', 'semantic', evidence);
  }
  if ((saveDc !== undefined && (!Number.isSafeInteger(saveDc) || saveDc < 1 || !saveDcs.has(saveDc)))
    || saveDcs.size > 1 || (saveDc === undefined && saveDcs.size > 0)) {
    add('SPELL_SAVE_DC_NOT_EXPLICIT', `${path}/saveDc`, 'Preserve the fixed save DC in the spell evidence; do not derive one from the caster.', 'semantic', evidence);
  }
  const costText = chargedOption?.tableRow ? chargedOption.evidence.quote : text;
  const costs = chargedOption?.tableRow && chargedOption.cost !== undefined
    ? new Set([chargedOption.cost]) : quotedNumbers(baseClauses, EXPLICIT_CHARGE_COST);
  if ((costs.size && !costs.has(consumption)) || (!ability.activityUses && consumption > 0 && AT_WILL.test(costText))) {
    add('SPELL_COST_NOT_EXPLICIT', `${path}/consumption`, 'The base cost must agree with the exact spell quote.', 'semantic', evidence);
  }
  const tableScaling = chargedOption?.scaling;
  const scalingMismatch = tableScaling
    ? tableScaling.extraCharge !== 1 || level === undefined || level < 1 || level >= tableScaling.maxLevel
      || maxCharges !== consumption + tableScaling.maxLevel - level
    : maxCharges !== undefined
      ? !Number.isSafeInteger(maxCharges) || consumption < 1 || maxCharges <= consumption || level === undefined || level < 1
        || level + maxCharges - consumption > 9 || !increment || costs.size !== 1 || !costs.has(consumption)
        || caps.size !== 1 || !caps.has(maxCharges)
      : increment || caps.size > 0;
  if (scalingMismatch) {
    add('SPELL_SCALING_NOT_EXPLICIT', `${path}/maxCharges`, 'Scaling requires a supported base level, one charge per additional level, and the source charge or spell-level cap.', 'semantic',
      tableScaling && chargedOption ? [chargedOption.evidence, ...evidence] : evidence);
  }
}

function validateSpellPool(
  ability: Extract<ItemIntakeAbility, { kind: 'spell' }>,
  itemUses: ItemIntakeUses | undefined,
  path: string,
  add: AddFinding,
): void {
  const { consumption, activityUses, maxCharges } = ability;
  const evidence = Array.isArray(ability.evidence) ? ability.evidence : [];
  const text = quotedSpellText(evidence);
  const pool = activityUses ?? itemUses;
  const independent = INDEPENDENT_POOL.test(text);
  if (activityUses) {
    const poolPath = `${path}/activityUses`;
    const sourceMaximums = quotedNumbers(text, USES_MAX);
    if (consumption === 0 || (!independent && !ONCE.test(text))
      || (SHARED_POOL.test(text) && !independent)
      || (!sourceMaximums.has(activityUses.max) && !(activityUses.max === 1 && ONCE.test(text)))) {
      add('SPELL_ACTIVITY_POOL_NOT_EXPLICIT', poolPath, 'A Cast-only pool needs source evidence of its own limit and cannot borrow shared charges.', 'semantic', evidence);
    }
    if (!Number.isSafeInteger(activityUses.max) || activityUses.max < 1) {
      add('INVALID_USES_MAX', `${poolPath}/max`, 'Activity use maximum must be a positive integer.', 'schema', evidence);
    }
    validateRecovery(activityUses, poolPath, evidence, add);
  } else if (independent && (consumption > 0 || ONCE.test(text) || quotedNumbers(text, USES_MAX).size > 0)) {
    add('SPELL_ACTIVITY_POOL_OMITTED', `${path}/activityUses`, 'This use is independent; do not charge the shared Item pool.', 'semantic', evidence);
  }
  if (consumption > 0 && (!pool || consumption > pool.max || (maxCharges !== undefined && maxCharges > pool.max))) {
    add(activityUses ? 'SPELL_COST_OUTSIDE_ACTIVITY_POOL' : 'SPELL_COST_OUTSIDE_ITEM_POOL', `${path}/consumption`,
      'A charged Cast must have a source-matching uses pool with enough capacity for its cost and scaling cap.', 'semantic', evidence);
  }
}

function validateEvidence(
  source: string,
  candidate: ItemDiscoveryCandidate,
  refs: EvidenceRef[],
  path: string,
  add: (code: string, path: string, message: string, origin: ItemIntakeFinding['origin'], evidence?: EvidenceRef[]) => void,
): void {
  for (const [index, ref] of refs.entries()) {
    if (!ref || !Number.isInteger(ref.start) || !Number.isInteger(ref.end) || typeof ref.quote !== 'string'
      || ref.start < candidate.start || ref.end > candidate.end || ref.end <= ref.start
      || source.slice(ref.start, ref.end) !== ref.quote) {
      add('INVALID_EVIDENCE', `${path}/${index}`, 'Evidence must be an exact non-empty source slice within this item boundary.', 'evidence', [ref]);
    }
  }
}

function validateCoveragePartition(
  coverage: EvidenceRef[],
  candidate: ItemDiscoveryCandidate,
  add: (code: string, path: string, message: string, origin: ItemIntakeFinding['origin']) => void,
): void {
  const sorted = coverage.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = candidate.start;
  for (const [index, entry] of sorted.entries()) {
    if (entry.start !== cursor) {
      add('COVERAGE_GAP_OR_OVERLAP', `/coverage/${index}`, 'Coverage must partition the full item candidate range without gaps or overlaps.', 'coverage');
      return;
    }
    cursor = entry.end;
  }
  if (cursor !== candidate.end) add('COVERAGE_INCOMPLETE', '/coverage', 'Coverage must reach the end of the item candidate range.', 'coverage');
}

function isCandidate(source: string, candidate: ItemDiscoveryCandidate): boolean {
  return Number.isInteger(candidate.start) && Number.isInteger(candidate.end)
    && candidate.start >= 0 && candidate.end > candidate.start && candidate.end <= source.length
    && source.slice(candidate.start, candidate.end) === candidate.quote;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarize(findings: ItemIntakeFinding[]): ItemIntakeValidationResult {
  return { findings, blocking: findings.filter((finding) => finding.blocking), warnings: findings.filter((finding) => !finding.blocking) };
}

function dedupe(findings: ItemIntakeFinding[]): ItemIntakeFinding[] {
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}
