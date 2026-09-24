import {
  CONDITION_DEFINITIONS,
  CUSTOM_CONDITION_IDS,
  type ConditionDefinition,
  type ConditionId,
  type ConditionInstance,
} from '@fvtt-json-generator/contracts/conditions';
import { MODULE_ID } from './constants.ts';

const ENGLISH_DESCRIPTIONS: Readonly<Record<ConditionId, string>> = {
  addled: 'Intelligence, Wisdom, and Charisma attack rolls, ability checks, and saving throws have disadvantage.',
  bewildered: 'You cannot cast spells except cantrips with a casting time of 1 Action.',
  bleeding: 'By default, at the end of your turn, you lose X hit points; only the highest value is retained for one target.',
  burning: 'By default, at the end of your turn, you take damage from the specified formula and damage type; only the highest value is retained for one target.',
  clumsy: 'Dexterity attack rolls, ability checks, and saving throws have disadvantage.',
  dazed: 'On your turn, choose one: move, take an Action, or take a Bonus Action.',
  defenseless: 'Attack rolls against you have advantage.',
  distracted: 'You cannot take a Reaction.',
  enfeebled: 'Strength attack rolls, ability checks, and saving throws have disadvantage.',
  frozen: "Your Speed becomes 0, and you cannot benefit from any bonus to your Speed. If you are flying, you fall.\n\nAttack rolls against you have advantage.\n\nWhen you are attacked with a weapon that deals bludgeoning damage, any hit against you is a Critical Hit.\n\nYou or another creature can spend 1 Action to make a Strength (Athletics) check against the condition's listed DC to end it.\n\nIt also ends once you have taken the condition's listed cumulative bludgeoning or fire damage threshold (20 by default).",
  helpless: 'Any attack that hits you is a Critical Hit.',
  immobilized: 'Your Speed becomes 0, and you cannot benefit from any bonus to your Speed. A flying target falls.',
  jinxed: 'Whenever you make an attack roll or saving throw, roll X and subtract the result from the roll.',
  shocked: 'On your turn, choose one: move, take an Action, or take a Bonus Action.\n\nAttack rolls against you have advantage.\n\nYou immediately drop held items. Picking up, drawing, or stowing an item requires 1 Action.',
  sickened: 'Constitution saving throws have disadvantage.',
  slowed: 'Your Speed is halved.',
  staggered: 'On your turn, you can make at most one weapon or unarmed attack.',
  valor: 'Whenever you make an attack roll or saving throw, roll X and add the result to the roll.',
  weakened: 'The total damage from a weapon attack or spell is halved, rounding the result down.',
};

// Earlier releases stored definition text on ActiveEffects. Recognize only those exact defaults;
// source- or user-authored descriptions must continue to display unchanged.
const LEGACY_DESCRIPTIONS: Partial<Record<ConditionId, readonly string[]>> = {
  dazed: [
    '自己的回合中只能在移动和执行 Action 之间选择一个，且不能执行 Bonus Action。',
    '自己的回合中只能在移动和执行动作之间选择一个，且不能执行附赠动作。',
    'On your turn, choose between moving and taking an Action, and you cannot take a Bonus Action.',
  ],
  frozen: [
    '同时获得 Immobilized 与 Defenseless；对使用钝击伤害武器的攻击还视为 Helpless。',
    '同时获得定身与无防备；对使用钝击伤害武器的攻击还视为无助。',
    'You also have Immobilized and Defenseless; attacks using weapons that deal bludgeoning damage also treat you as Helpless.',
    '速度变为 0，且不能受益于任何速度加值。飞行中的目标会坠落。\n\n针对你的攻击检定具有优势。\n\n使用造成钝击伤害的武器攻击你时，任何命中都视为重击。\n\n目标或另一生物可用 1 个动作进行力量（运动）检定，通过该状态标注的 DC 后解除；累计受到该状态指定阈值（默认 20 点）的钝击或火焰伤害也会解除。',
    "Your Speed becomes 0, and you cannot benefit from any bonus to your Speed. If you are flying, you fall.\n\nAttack rolls against you have advantage.\n\nWhen you are attacked with a weapon that deals bludgeoning damage, any hit against you is a Critical Hit.\n\nYou or another creature can spend 1 Action to make a Strength (Athletics) check against the condition's listed DC to end it. It also ends once you have taken the condition's listed cumulative bludgeoning or fire damage threshold (20 by default).",
  ],
  shocked: [
    '自己的回合中只能在移动和执行 Action 之间选择一个，且不能执行 Bonus Action。针对你的攻击检定具有优势。立刻掉落手中物品；拿取、拔出或收起物品均需 1 Action。',
    '自己的回合中只能在移动和执行动作之间选择一个，且不能执行附赠动作。\n\n针对你的攻击检定具有优势。\n\n立刻掉落手中物品；拿取、拔出或收起物品都需要 1 个动作。',
    'On your turn, choose between moving and taking an Action; you cannot take a Bonus Action.\n\nAttack rolls against you have advantage.\n\nYou immediately drop held items. Picking up, drawing, or stowing an item requires 1 Action.',
    '同时视为 Dazed 与 Defenseless，并立刻掉落手中物品。拿取或拔出物品需要 1 Action。',
    '同时视为恍惚与无防备，并立刻掉落手中物品。拿取或拔出物品需要 1 个动作。',
    'You also count as Dazed and Defenseless, and immediately drop held items. Picking up or drawing an item requires 1 Action.',
  ],
  staggered: ['自己的回合内最多只能进行一次 weapon attack。', '自己的回合内最多只能进行一次武器攻击。', 'On your turn, you can make at most one weapon attack.'],
  valor: ['将条件指定的骰加入攻击检定与豁免检定。', "Add the condition's specified die to attack rolls and saving throws."],
  weakened: ['武器攻击与法术造成的伤害减半。', 'Damage from weapon attacks and spells is halved.'],
};

const ENGLISH_LABELS: Readonly<Record<ConditionId, string>> = Object.freeze(
  Object.fromEntries(CUSTOM_CONDITION_IDS.map((id) => [id, CONDITION_DEFINITIONS[id].label])) as Record<ConditionId, string>,
);

const CHINESE_LABELS: Readonly<Record<ConditionId, string>> = {
  addled: '心智混乱',
  bewildered: '迷乱',
  bleeding: '流血',
  burning: '灼烧',
  clumsy: '笨拙',
  dazed: '恍惚',
  defenseless: '无防备',
  distracted: '分心',
  enfeebled: '衰弱',
  frozen: '冻结',
  helpless: '无助',
  immobilized: '定身',
  jinxed: '厄运',
  shocked: '震愕',
  sickened: '病弱',
  slowed: '减速',
  staggered: '踉跄',
  valor: '英勇',
  weakened: '虚弱',
};

export function conditionIconPath(conditionId: ConditionId): string {
  return `modules/${MODULE_ID}/icons/${conditionId}.svg`;
}

export function conditionNameKey(conditionId: ConditionId): string {
  return `FVTTCONDITIONS.Condition.${conditionId}.Name`;
}

export function conditionDescriptionKey(conditionId: ConditionId): string {
  return `FVTTCONDITIONS.Condition.${conditionId}.Description`;
}

export function localizedConditionLabel(conditionId: ConditionId, globals: any = globalThis): string {
  return localize(globals, conditionNameKey(conditionId), ENGLISH_LABELS[conditionId]!);
}

export function localizedConditionStatusLabel(conditionId: ConditionId, globals: any = globalThis): string {
  if (conditionId === 'dazed' || conditionId === 'burning') {
    return localize(
      globals,
      `FVTTCONDITIONS.Condition.${conditionId}.StatusName`,
      localizedConditionLabel(conditionId, globals),
    );
  }
  return localizedConditionLabel(conditionId, globals);
}

export function localizedConditionDescription(conditionId: ConditionId, globals: any = globalThis): string {
  return localize(globals, conditionDescriptionKey(conditionId), ENGLISH_DESCRIPTIONS[conditionId]!);
}

export function localizedConditionDefinition(definition: ConditionDefinition, globals: any = globalThis): ConditionDefinition {
  return {
    ...definition,
    label: localizedConditionLabel(definition.id, globals),
    description: localizedConditionDescription(definition.id, globals),
    icon: conditionIconPath(definition.id),
  };
}

export function localizedConditionDefinitions(globals: any = globalThis): ConditionDefinition[] {
  return Object.values(CONDITION_DEFINITIONS).map((definition) => localizedConditionDefinition(definition, globals));
}

export function displayConditionName(effect: any, instance: ConditionInstance, globals: any = globalThis): string {
  const raw = String(effect?.name ?? '');
  return isDefaultConditionName(raw, instance.conditionId, globals)
    ? localizedConditionLabel(instance.conditionId, globals)
    : raw;
}

export function displayConditionDescription(effect: any, instance: ConditionInstance, globals: any = globalThis): string {
  const raw = String(effect?.description ?? '');
  return isDefaultConditionDescription(raw, instance.conditionId, globals)
    ? localizedConditionDescription(instance.conditionId, globals)
    : raw;
}

/** Return an explicit name only when it belongs to the user/source. */
export function conditionNameOverride(effect: any, conditionId: ConditionId, globals: any = globalThis): string | undefined {
  const raw = String(effect?.name ?? '');
  return isDefaultConditionName(raw, conditionId, globals) ? undefined : raw;
}

export function isDefaultConditionName(value: string, conditionId: ConditionId, globals: any = globalThis): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  return [
    ENGLISH_LABELS[conditionId],
    CHINESE_LABELS[conditionId],
    ...(conditionId === 'burning' ? ['燃烧'] : []),
    ...(conditionId === 'shocked' ? ['电击'] : []),
    localizedConditionLabel(conditionId, globals),
    conditionNameKey(conditionId),
  ].includes(candidate);
}

export function isDefaultConditionDescription(value: string, conditionId: ConditionId, globals: any = globalThis): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  return [
    CONDITION_DEFINITIONS[conditionId].description,
    ...(LEGACY_DESCRIPTIONS[conditionId] ?? []),
    ENGLISH_DESCRIPTIONS[conditionId],
    localizedConditionDescription(conditionId, globals),
    conditionDescriptionKey(conditionId),
  ].includes(candidate);
}

export function localize(globals: any, key: string, fallback: string): string {
  const localizeFn = globals?.game?.i18n?.localize;
  if (typeof localizeFn !== 'function') return fallback;
  try {
    const value = localizeFn.call(globals.game.i18n, key);
    if (typeof value !== 'string' || !value.trim() || value === key) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] ?? character));
}

export const englishConditionDescriptions = ENGLISH_DESCRIPTIONS;
