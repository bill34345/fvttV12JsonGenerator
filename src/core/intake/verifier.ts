import type { AbilityKey, CanonicalFeature, IntakeFinding, MonsterIntakeIR } from './types';
import { validateMonsterIntakeIR } from './validator';

export interface IntakeVerificationReport {
  schemaVersion: 1;
  status: 'accepted' | 'needs_review';
  findings: IntakeFinding[];
  projection: Record<string, unknown>;
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
  const projection = projectActor(actor, { skillKeys: Object.keys(expected.skills) });
  const add = (code: string, path: string, message: string) => findings.push({
    id: `${code.toLowerCase()}:${path}`.replace(/[^a-z0-9:/_-]+/g, '-'),
    code, path, message, blocking: true, origin: 'semantic',
  });
  const actualName = String(projection.name ?? '');
  if (!actualName.includes(expected.identity.name) || (expected.identity.englishName && !actualName.includes(expected.identity.englishName))) {
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
  compare(add, 'ACTOR_TYPE_DRIFT', '/creature/identity/creatureType', normalizeCreatureType(expected.identity.creatureType), normalizeCreatureType(projection.creatureType));
  for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as AbilityKey[]) {
    compare(add, 'ACTOR_ABILITY_DRIFT', `/creature/abilities/${ability}`, expected.abilities[ability], (projection.abilities as Record<string, unknown>)?.[ability]);
  }
  for (const [kind, value] of Object.entries(expected.attributes.movement)) {
    compare(add, 'ACTOR_MOVEMENT_DRIFT', `/creature/attributes/movement/${kind}`, value, (projection.movement as Record<string, unknown>)?.[kind]);
  }
  for (const [ability, value] of Object.entries(expected.saves)) compare(add, 'ACTOR_SAVE_DRIFT', `/creature/saves/${ability}`, value, (projection.saves as Record<string, unknown>)?.[ability]);
  for (const [skill, value] of Object.entries(expected.skills)) compare(add, 'ACTOR_SKILL_DRIFT', `/creature/skills/${skill}`, value, (projection.skills as Record<string, unknown>)?.[skill]);
  for (const skill of Object.keys(projection.skills as Record<string, unknown>)) {
    if (!(skill in expected.skills)) add('ACTOR_UNSOURCED_SKILL', `/actorProjection/skills/${skill}`, `Actor configures an unlisted skill: ${skill}.`);
  }
  compareSet(add, 'ACTOR_RESISTANCE_DRIFT', '/creature/defenses/resistances', expected.defenses.resistances, projection.resistances);
  compareSet(add, 'ACTOR_IMMUNITY_DRIFT', '/creature/defenses/immunities', expected.defenses.immunities, projection.immunities);
  compareSet(add, 'ACTOR_VULNERABILITY_DRIFT', '/creature/defenses/vulnerabilities', expected.defenses.vulnerabilities, projection.vulnerabilities);
  compareSet(add, 'ACTOR_CONDITION_IMMUNITY_DRIFT', '/creature/defenses/conditionImmunities', expected.defenses.conditionImmunities, projection.conditionImmunities);
  for (const [sense, value] of Object.entries(expected.senses)) compare(add, 'ACTOR_SENSE_DRIFT', `/creature/senses/${sense}`, value, (projection.senses as Record<string, unknown>)?.[sense]);
  compareSet(add, 'ACTOR_LANGUAGE_DRIFT', '/creature/languages/values', expected.languages.values, projection.languages);
  compare(add, 'ACTOR_LANGUAGE_NOTE_DRIFT', '/creature/languages/custom', expected.languages.custom, projection.languageCustom);
  compareFeatureSections(add, expected.traits, projection.items, 'traits');
  compareFeatureSections(add, expected.actions, projection.items, 'actions');
  compareFeatureSections(add, expected.bonusActions, projection.items, 'bonusActions');
  compareFeatureSections(add, expected.reactions, projection.items, 'reactions');
  compareFeatureSections(add, expected.legendaryActions, projection.items, 'legendaryActions');

  for (const requiredText of featureDescriptions(expected)) {
    if (!markdown.includes(requiredText)) add('MARKDOWN_DESCRIPTION_LOSS', '/markdown', `Rendered Markdown lost feature text: ${requiredText.slice(0, 80)}`);
  }
  if (markdown.includes('护甲等级: 20') && expected.attributes.ac !== 20) add('TEMPLATE_DEFAULT_LEAK', '/markdown/护甲等级', 'Rendered Markdown contains a conflicting template AC 20.');
  if (markdown.includes('生命值: 332') && expected.attributes.hp.value !== 332) add('TEMPLATE_DEFAULT_LEAK', '/markdown/生命值', 'Rendered Markdown contains a conflicting template HP 332.');

  const deduped = dedupe(findings);
  return { schemaVersion: 1, status: deduped.some((finding) => finding.blocking) ? 'needs_review' : 'accepted', findings: deduped, projection };
}

export function renderIntakeVerificationMarkdown(report: IntakeVerificationReport): string {
  const lines = [
    '# AI 怪物 Intake 确定性核对',
    '',
    `状态：${report.status === 'accepted' ? '通过' : '需要复核'}`,
    `阻断问题：${report.findings.filter((finding) => finding.blocking).length}`,
    '',
  ];
  if (report.findings.length === 0) lines.push('未发现确定性漂移。');
  else for (const finding of report.findings) lines.push(`- [${finding.code}] ${finding.path}：${finding.message}`);
  return `${lines.join('\n')}\n`;
}

export function projectActor(actor: unknown, options: { skillKeys?: string[] } = {}): Record<string, unknown> {
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
  const prof = numeric(attrs.prof);
  const abilityValues = Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, numeric(asRecord(abilities[key]).value)]));
  const saves = Object.fromEntries(Object.entries(abilityValues).map(([key, score]) => {
    const ability = asRecord(abilities[key]);
    return [key, abilityMod(score) + numeric(ability.proficient) * prof + numeric(asRecord(ability.bonuses).save)];
  }));
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
  const items = Array.isArray(root.items) ? root.items.map((value) => projectItem(value, abilityValues, prof)) : [];
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
    initiative: abilityMod(abilityValues.dex) + numeric(asRecord(attrs.init).bonus),
    size: normalizeSize(traits.size),
    creatureType: asRecord(details.type).value,
    abilities: projectedAbilities,
    saves,
    skills,
    movement: Object.fromEntries(['walk', 'climb', 'fly', 'swim', 'burrow'].map((key) => [key, movement[key]])),
    resistances: arrayValues(asRecord(traits.dr).value),
    immunities: arrayValues(asRecord(traits.di).value),
    vulnerabilities: arrayValues(asRecord(traits.dv).value),
    conditionImmunities: arrayValues(asRecord(traits.ci).value),
    senses: {
      darkvision: numericSense(senseRanges.darkvision),
      blindsight: numericSense(senseRanges.blindsight),
      tremorsense: numericSense(senseRanges.tremorsense),
      truesight: numericSense(senseRanges.truesight),
      passivePerception: 10 + (allSkillTotals.perception ?? 0),
      special: sensesRoot.special || null,
    },
    languages: arrayValues(languages.value),
    languageCustom: languages.custom || undefined,
    items,
  };
}

function projectItem(value: unknown, abilities: Record<string, number>, prof: number): Record<string, unknown> {
  const item = asRecord(value);
  const system = asRecord(item.system);
  const activation = asRecord(system.activation);
  const description = asRecord(system.description);
  const activities = asRecord(system.activities);
  const firstActivity = asRecord(Object.values(activities)[0]);
  const activityActivation = asRecord(firstActivity.activation);
  const activityDescription = asRecord(firstActivity.description);
  const attack = asRecord(firstActivity.attack);
  const range = Object.keys(asRecord(firstActivity.range)).length > 0 ? asRecord(firstActivity.range) : asRecord(system.range);
  const save = asRecord(firstActivity.save);
  const saveDc = asRecord(save.dc);
  const damageBase = asRecord(asRecord(system.damage).base);
  const attackAbility = Object.keys(attack).length > 0 ? String(attack.ability ?? '') : '';
  const damageFormula = damageBase.number && damageBase.denomination
    ? `${damageBase.number}d${damageBase.denomination}${abilityMod(abilities[attackAbility]) ? `+${abilityMod(abilities[attackAbility])}` : ''}`
    : undefined;
  const effects = Array.isArray(item.effects) ? item.effects.flatMap((effect) => arrayValues(asRecord(effect).statuses)) : [];
  return {
    name: item.name,
    type: item.type,
    activation: activation.type ?? activityActivation.type,
    description: stripHtml(String(description.value ?? activityDescription.chatFlavor ?? '')),
    attackType: asRecord(attack.type).value,
    toHit: attackAbility ? abilityMod(abilities[attackAbility]) + prof + numeric(attack.bonus) : undefined,
    reach: range.reach,
    range: range.value,
    damageFormula,
    damageTypes: arrayValues(damageBase.types),
    saveDc: numericOrUndefined(saveDc.value ?? saveDc.formula),
    saveAbilities: arrayValues(save.ability),
    statuses: effects,
  };
}

function compareFeatureSections(
  add: (code: string, path: string, message: string) => void,
  expected: CanonicalFeature[],
  actorItems: unknown,
  section: string,
): void {
  const items = Array.isArray(actorItems) ? actorItems.map(asRecord) : [];
  const expectedActivation = section === 'actions' ? 'action'
    : section === 'bonusActions' ? 'bonus'
      : section === 'reactions' ? 'reaction'
        : section === 'legendaryActions' ? 'legendary'
          : undefined;
  for (const [index, feature] of expected.entries()) {
    const found = items.find((item) => String(item.name ?? '').includes(feature.name));
    if (!found) {
      add('ACTOR_FEATURE_MISSING', `/creature/${section}/${index}`, `Actor is missing separate feature: ${feature.name}`);
      continue;
    }
    if (expectedActivation && found.activation !== expectedActivation) {
      add('ACTOR_ACTIVATION_DRIFT', `/creature/${section}/${index}`, `${feature.name} activation is ${String(found.activation)}, expected ${expectedActivation}.`);
    }
    const description = String(found.description ?? '');
    const significant = feature.description.replace(/\s+/g, '').slice(0, 24);
    if (significant && !description.replace(/\s+/g, '').includes(significant)) {
      add('ACTOR_DESCRIPTION_LOSS', `/creature/${section}/${index}/description`, `Actor feature lost source description for ${feature.name}.`);
    }
    if (feature.attack) {
      compare(add, 'ACTOR_ATTACK_TYPE_DRIFT', `/creature/${section}/${index}/attack/type`, feature.attack.type, found.attackType);
      compare(add, 'ACTOR_TO_HIT_DRIFT', `/creature/${section}/${index}/attack/toHit`, feature.attack.toHit, found.toHit);
      compare(add, 'ACTOR_REACH_DRIFT', `/creature/${section}/${index}/attack/reach`, feature.attack.reach, found.reach);
      compare(add, 'ACTOR_RANGE_DRIFT', `/creature/${section}/${index}/attack/range`, feature.attack.range, found.range);
    }
    for (const [damageIndex, damage] of (feature.damage ?? []).entries()) {
      if (damage.relationship !== 'base') continue;
      compare(add, 'ACTOR_DAMAGE_FORMULA_DRIFT', `/creature/${section}/${index}/damage/${damageIndex}/formula`, compact(damage.formula), compact(found.damageFormula));
      if (!arrayValues(found.damageTypes).includes(damage.type)) add('ACTOR_DAMAGE_TYPE_DRIFT', `/creature/${section}/${index}/damage/${damageIndex}/type`, `${feature.name} lost damage type ${damage.type}.`);
    }
    if (feature.save) {
      compare(add, 'ACTOR_SAVE_DC_DRIFT', `/creature/${section}/${index}/save/dc`, feature.save.dc, found.saveDc);
      if (!arrayValues(found.saveAbilities).includes(feature.save.ability)) add('ACTOR_SAVE_ABILITY_DRIFT', `/creature/${section}/${index}/save/ability`, `${feature.name} lost save ability ${feature.save.ability}.`);
    }
    for (const [conditionIndex, applied] of (feature.appliedConditions ?? []).entries()) {
      const actualStatuses = arrayValues(found.statuses);
      for (const status of applied.statuses) if (!actualStatuses.includes(status)) add('ACTOR_CONDITION_DRIFT', `/creature/${section}/${index}/appliedConditions/${conditionIndex}`, `${feature.name} lost condition ${status}.`);
      if (applied.staged && applied.statuses.filter((status) => actualStatuses.includes(status)).length > 1) add('STAGED_CONDITIONS_SIMULTANEOUS', `/creature/${section}/${index}/appliedConditions/${conditionIndex}`, `${feature.name} applies staged conditions simultaneously.`);
    }
  }
  const matched = expected.filter((feature) => items.some((item) => String(item.name ?? '').includes(feature.name))).length;
  if (matched < expected.length) add('ACTOR_FEATURE_COUNT_DRIFT', `/creature/${section}`, `${section} expected ${expected.length} separate entries but matched ${matched}.`);
}

function featureDescriptions(ir: MonsterIntakeIR['creature']): string[] {
  return [...ir.traits, ...ir.actions, ...ir.bonusActions, ...ir.reactions, ...ir.legendaryActions].map((feature) => feature.description);
}

function compare(
  add: (code: string, path: string, message: string) => void,
  code: string,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (expected === undefined) return;
  if (JSON.stringify(expected) !== JSON.stringify(actual)) add(code, path, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function compareSet(
  add: (code: string, path: string, message: string) => void,
  code: string,
  path: string,
  expected: string[],
  actual: unknown,
): void {
  const left = [...expected].map((value) => value.toLowerCase()).sort();
  const right = arrayValues(actual).map((value) => value.toLowerCase()).sort();
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

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
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
