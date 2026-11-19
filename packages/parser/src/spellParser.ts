
import { JSON_SCHEMA, load } from 'js-yaml';
import {
  SPELL_ACTIVATIONS, SPELL_AREAS, SPELL_COMPONENTS, SPELL_DAMAGE_TYPES, SPELL_DURATIONS, SPELL_HEALING_TYPES,
  SPELL_RANGES, SPELL_SAVE_ABILITIES, SPELL_SCHOOLS, SPELL_TARGETS,
  type ParsedSpell, type SpellActivity, type SpellRoll,
} from '@fvtt-json-generator/models/spell';

export function parseSpellSource(content: string): ParsedSpell {
  const match = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*\r?\n([\s\S]+)$/mu.exec(content);
  if (!match || match.index !== 0) invalid('来源', '需要一份带 YAML 头和正文的 Markdown。');
  let yaml: unknown;
  try { yaml = load(match[1]!, { schema: JSON_SCHEMA }); }
  catch { invalid('YAML', 'YAML 头格式有误。'); }
  const root = fields(yaml, '来源', 'kind rules name identifier source level school activation duration range components materials target activity gm');
  if (root.kind !== 'spell' || (root.rules !== 2024 && root.rules !== '2024')) {
    invalid('kind / rules', '需要 kind: spell 和 rules: 2024。');
  }
  const identifier = requiredText(root.identifier, 'identifier');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(identifier)) invalid('identifier', '使用小写英文字母、数字和连字符。');
  const level = integer(root.level, 'level', 0, 9);
  const activation = fields(root.activation, 'activation', 'type value condition');
  const cast = choice(activation.type, SPELL_ACTIVATIONS, 'activation.type');
  const condition = optionalText(activation.condition, 'activation.condition');
  if (cast === 'reaction' && !condition) invalid('activation.condition', '反应法术需要保留来源中的触发条件。');
  const duration = fields(root.duration, 'duration', 'units value');
  const durationUnits = choice(duration.units, SPELL_DURATIONS, 'duration.units');
  const range = fields(root.range, 'range', 'units value');
  const rangeUnits = choice(range.units, SPELL_RANGES, 'range.units');
  if (!Array.isArray(root.components)) invalid('components', '请提供组件列表，可为空列表。');
  const components = root.components.map(value => choice(value, SPELL_COMPONENTS, 'components'));
  if (new Set(components).size !== components.length) invalid('components', '组件不能重复。');
  if (components.includes('concentration') && durationUnits === 'inst') invalid('duration', '专注需要非瞬时持续时间。');
  if (level === 0 && components.includes('ritual')) invalid('components', '戏法不能标为仪式。');
  const gm = optionalText(root.gm, 'gm');
  const activity = parseActivity(root.activity);
  if ((activity.type === 'utility' || (activity.type === 'save' && !activity.damage.length)) && !gm) {
    invalid('gm', '效用活动或无伤害豁免需要说明由 GM 处理的规则。');
  }

  return {
    name: requiredText(root.name, 'name'), identifier, rules: '2024', source: optionalText(root.source, 'source'),
    level, school: choice(root.school, SPELL_SCHOOLS, 'school'),
    activation: { type: cast, value: quantity(activation.value, cast === 'minute' || cast === 'hour', 'activation.value'), condition },
    duration: { units: durationUnits, value: quantity(duration.value, !['inst', 'disp', 'dstr', 'perm', 'spec'].includes(durationUnits), 'duration.value') },
    range: { units: rangeUnits, value: quantity(range.value, rangeUnits === 'ft' || rangeUnits === 'mi', 'range.value') },
    components, materials: parseMaterials(root.materials, components.includes('material')),
    target: parseTarget(root.target), activity,
    description: requiredText(match[2], '正文').replace(/\r\n/gu, '\n'), gm,
  };
}

function parseMaterials(value: unknown, hasMaterial: boolean): ParsedSpell['materials'] {
  if (!hasMaterial && value === undefined) return undefined;
  if (!hasMaterial) invalid('materials', '需要同时声明 material 组件。');
  const record = fields(value, 'materials', 'value cost consumed');
  if (record.consumed !== undefined && typeof record.consumed !== 'boolean') invalid('materials.consumed', '使用 true 或 false。');
  if (record.cost !== undefined && (typeof record.cost !== 'number' || !Number.isFinite(record.cost) || record.cost < 0)) {
    invalid('materials.cost', '请输入以 GP 为单位的非负数。');
  }
  return { value: requiredText(record.value, 'materials.value'), cost: record.cost as number | undefined, consumed: record.consumed };
}

function parseTarget(value: unknown): ParsedSpell['target'] {
  const record = fields(value, 'target', 'type count special template');
  const type = choice(record.type, SPELL_TARGETS, 'target.type');
  const count = record.count === undefined ? undefined : integer(record.count, 'target.count');
  const special = optionalText(record.special, 'target.special');
  if (type === 'self' && count !== undefined) invalid('target.count', 'self 无需数量。');
  if (record.template === undefined) return { type, count, special };
  const area = fields(record.template, 'target.template', 'type size width height');
  const shape = choice(area.type, SPELL_AREAS, 'target.template.type');
  return {
    type, count, special,
    template: {
      type: shape, size: integer(area.size, 'target.template.size'),
      width: quantity(area.width, shape === 'line', 'target.template.width'),
      height: quantity(area.height, shape === 'cylinder', 'target.template.height'),
    },
  };
}

function parseActivity(value: unknown): SpellActivity {
  const record = fields(value, 'activity', 'type attack save onSave damage healing');
  const type = choice(record.type, ['attack', 'save', 'damage', 'heal', 'utility'] as const, 'activity.type');
  const allowed = { attack: 'attack damage', save: 'save onSave damage', damage: 'damage', heal: 'healing', utility: '' };
  fields(record, 'activity', 'type ' + allowed[type]);
  if (type === 'utility') return { type };
  if (type === 'heal') {
    const healing = fields(record.healing, 'activity.healing', 'dice bonus scaling type');
    return { type, healing: { ...parseRoll(healing, 'activity.healing'), type: choice(healing.type, SPELL_HEALING_TYPES, 'activity.healing.type') } };
  }
  if (record.damage === undefined && type === 'save' && record.onSave === 'none') {
    return { type, save: choice(record.save, SPELL_SAVE_ABILITIES, 'activity.save'), onSave: 'none', damage: [] };
  }
  if (!Array.isArray(record.damage) || !record.damage.length) invalid('activity.damage', '至少需要一项伤害。');
  const damage = record.damage.map((entry, index) => {
    const path = 'activity.damage.' + index;
    const part = fields(entry, path, 'dice bonus scaling type');
    return { ...parseRoll(part, path), type: choice(part.type, SPELL_DAMAGE_TYPES, path + '.type') };
  });
  if (type === 'attack') return { type, attack: choice(record.attack, ['melee', 'ranged'] as const, 'activity.attack'), damage };
  if (type === 'save') {
    return { type, damage, save: choice(record.save, SPELL_SAVE_ABILITIES, 'activity.save'),
      onSave: choice(record.onSave, ['half', 'none', 'full'] as const, 'activity.onSave') };
  }
  return { type, damage };
}

function parseRoll(record: Record<string, unknown>, path: string): SpellRoll {
  const match = /^([1-9]\d*)d(4|6|8|10|12|20|100)$/u.exec(requiredText(record.dice, path + '.dice'));
  if (!match) invalid(path + '.dice', '使用 NdM 骰式，例如 2d8。');
  const bonus = record.bonus === '@mod' || record.bonus === undefined ? record.bonus
    : integer(record.bonus, path + '.bonus', Number.MIN_SAFE_INTEGER);
  const scaling = record.scaling === undefined ? undefined : integer(record.scaling, path + '.scaling');
  return { dice: { count: integer(Number(match[1]), path + '.dice'), faces: Number(match[2]) }, bonus, scaling };
}

function invalid(path: string, message: string): never {
  throw new Error(path + ' · ' + message);
}

function fields(value: unknown, path: string, allowed: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, '需要具名字段。');
  const keys = allowed.split(' ');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) invalid(path + '.' + key, '当前法术契约不支持此字段。');
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(path, '需要非空文字。');
  return value.trim();
}

function optionalText(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, path);
}

function choice<const T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid(path, '可选值为 ' + options.join('、') + '。');
  return value as T;
}

function integer(value: unknown, path: string, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    invalid(path, '需要 ' + min + ' 至 ' + max + ' 的整数。');
  }
  return value;
}

function quantity(value: unknown, required: boolean, path: string): number | undefined {
  if (required) return integer(value, path);
  if (value !== undefined) invalid(path, '当前类型无需数值。');
  return undefined;
}
