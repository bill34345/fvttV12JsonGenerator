import {
  attachForgeSourceId,
  createForgeSourceId,
  hashSource,
  isForgeSourceId,
  readForgeSourceId,
  type ForgeSourceId,
  type JsonValue,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';

export type { ForgeSourceId } from '@fvtt-json-generator/forge-gateway-protocol';

/**
 * The first-phase creature authoring contract is intentionally small.  It is
 * a source model, not an Actor document and it carries no provider or review
 * evidence.  The rendered source is still sent through the normal parser and
 * generation workflow.
 */
export const CREATURE_BLUEPRINT_SCHEMA = 'fvtt-json-forge-creature-blueprint' as const;
export const CREATURE_BLUEPRINT_VERSION = 1 as const;
export const CREATURE_BLUEPRINT_COMMENT_PREFIX = '# forge-creature-blueprint-v1:' as const;

export const CREATURE_BLUEPRINT_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureBlueprintSize = (typeof CREATURE_BLUEPRINT_SIZES)[number];

export const CREATURE_BLUEPRINT_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;
export type CreatureBlueprintType = (typeof CREATURE_BLUEPRINT_TYPES)[number];

export const CREATURE_BLUEPRINT_ALIGNMENTS = [
  'lawful good',
  'neutral good',
  'chaotic good',
  'lawful neutral',
  'neutral',
  'unaligned',
  'chaotic neutral',
  'lawful evil',
  'neutral evil',
  'chaotic evil',
] as const;
export type CreatureBlueprintAlignment = (typeof CREATURE_BLUEPRINT_ALIGNMENTS)[number];

export const CREATURE_BLUEPRINT_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type CreatureBlueprintAbility = (typeof CREATURE_BLUEPRINT_ABILITIES)[number];

export const CREATURE_BLUEPRINT_DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type CreatureBlueprintDamageType = (typeof CREATURE_BLUEPRINT_DAMAGE_TYPES)[number];

export interface CreatureBlueprintDamage {
  formula: string;
  type: CreatureBlueprintDamageType;
}

export interface CreatureBlueprintAttack {
  type: 'attack';
  name: string;
  mode: 'melee' | 'ranged';
  hitBonus: number;
  range: number;
  damage: CreatureBlueprintDamage;
}

export interface CreatureBlueprintSave {
  type: 'save';
  name: string;
  ability: CreatureBlueprintAbility;
  dc: number;
  range: number;
  damage: CreatureBlueprintDamage;
  success: 'half' | 'none';
}

export type CreatureBlueprintComponent = CreatureBlueprintAttack | CreatureBlueprintSave;

export interface CreatureBlueprintAbilities {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface CreatureBlueprintFieldChange {
  path: string;
  before: JsonValue;
  after: JsonValue;
}

/** Immediate authoring lineage.  This records provenance, not a world backup. */
export interface CreatureBlueprintLineage {
  parentSourceId: ForgeSourceId;
  parentSourceHash: Sha256;
  changes: CreatureBlueprintFieldChange[];
}

export interface CreatureBlueprintV1 {
  schema: typeof CREATURE_BLUEPRINT_SCHEMA;
  version: typeof CREATURE_BLUEPRINT_VERSION;
  sourceId: ForgeSourceId;
  name: string;
  size: CreatureBlueprintSize;
  type: CreatureBlueprintType;
  alignment: CreatureBlueprintAlignment;
  ac: number;
  hp: number;
  speed: number;
  abilities: CreatureBlueprintAbilities;
  cr: number;
  components: CreatureBlueprintComponent[];
  lineage?: CreatureBlueprintLineage;
}

const TOP_LEVEL_KEYS = [
  'schema',
  'version',
  'sourceId',
  'name',
  'size',
  'type',
  'alignment',
  'ac',
  'hp',
  'speed',
  'abilities',
  'cr',
  'components',
  'lineage',
] as const;
const ABILITY_KEYS = [...CREATURE_BLUEPRINT_ABILITIES] as const;
const DAMAGE_KEYS = ['formula', 'type'] as const;
const ATTACK_KEYS = ['type', 'name', 'mode', 'hitBonus', 'range', 'damage'] as const;
const SAVE_KEYS = ['type', 'name', 'ability', 'dc', 'range', 'damage', 'success'] as const;
const LINEAGE_KEYS = ['parentSourceId', 'parentSourceHash', 'changes'] as const;
const CHANGE_KEYS = ['path', 'before', 'after'] as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DICE_PATTERN = /^([1-9][0-9]*)d(4|6|8|10|12|20|100)(?:([+-])(0|[1-9][0-9]*))?$/u;
const MAX_COMPONENTS = 8;
const MAX_SOURCE_UTF8_BYTES = 256 * 1024;
const MAX_NAME_LENGTH = 100;
const MAX_FIELD_CHANGE_COUNT = 32;

const CREATURE_SIZE_LABELS: Record<CreatureBlueprintSize, string> = {
  tiny: '微型',
  small: '小型',
  medium: '中型',
  large: '大型',
  huge: '巨型',
  gargantuan: '超巨型',
};
const CREATURE_TYPE_LABELS: Record<CreatureBlueprintType, string> = {
  aberration: '异怪',
  beast: '野兽',
  celestial: '天界生物',
  construct: '构装体',
  dragon: '龙',
  elemental: '元素',
  fey: '妖精',
  fiend: '邪魔',
  giant: '巨人',
  humanoid: '类人生物',
  monstrosity: '怪物',
  ooze: '泥怪',
  plant: '植物',
  undead: '亡灵',
};
const CREATURE_ALIGNMENT_LABELS: Record<CreatureBlueprintAlignment, string> = {
  'lawful good': '守序善良',
  'neutral good': '中立善良',
  'chaotic good': '混乱善良',
  'lawful neutral': '守序中立',
  neutral: '中立',
  unaligned: '无阵营',
  'chaotic neutral': '混乱中立',
  'lawful evil': '守序邪恶',
  'neutral evil': '中立邪恶',
  'chaotic evil': '混乱邪恶',
};
const CREATURE_ABILITY_LABELS: Record<CreatureBlueprintAbility, string> = {
  str: '力量',
  dex: '敏捷',
  con: '体质',
  int: '智力',
  wis: '感知',
  cha: '魅力',
};
const CREATURE_DAMAGE_LABELS: Record<CreatureBlueprintDamageType, string> = {
  acid: '强酸',
  bludgeoning: '钝击',
  cold: '寒冷',
  fire: '火焰',
  force: '力场',
  lightning: '闪电',
  necrotic: '死灵',
  piercing: '穿刺',
  poison: '毒素',
  psychic: '心灵',
  radiant: '光耀',
  slashing: '挥砍',
  thunder: '雷鸣',
};

/** Create the deterministic first-phase default Guard blueprint. */
export function createCreatureBlueprint(sourceId?: ForgeSourceId): CreatureBlueprintV1 {
  const resolvedSourceId = sourceId ?? createForgeSourceId();
  if (!isForgeSourceId(resolvedSourceId)) {
    throw new TypeError('Creature blueprint sourceId must be a canonical Forge actor source ID.');
  }

  return decodeCreatureBlueprint({
    schema: CREATURE_BLUEPRINT_SCHEMA,
    version: CREATURE_BLUEPRINT_VERSION,
    sourceId: resolvedSourceId,
    name: 'Guard',
    size: 'medium',
    type: 'humanoid',
    alignment: 'lawful neutral',
    ac: 16,
    hp: 11,
    speed: 30,
    abilities: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    cr: 0.125,
    components: [{
      type: 'attack',
      name: 'Spear',
      mode: 'melee',
      hitBonus: 3,
      range: 5,
      damage: { formula: '1d6+1', type: 'piercing' },
    }],
  });
}

/** Strictly decode a blueprint; all unknown keys and unsupported mechanics fail closed. */
export function decodeCreatureBlueprint(value: unknown): CreatureBlueprintV1 {
  const record = asPlainRecord(value, 'blueprint');
  assertKeys(record, TOP_LEVEL_KEYS, 'blueprint');

  if (record.schema !== CREATURE_BLUEPRINT_SCHEMA) {
    throw new TypeError(`blueprint.schema must be ${CREATURE_BLUEPRINT_SCHEMA}.`);
  }
  if (record.version !== CREATURE_BLUEPRINT_VERSION) {
    throw new TypeError(`blueprint.version must be ${CREATURE_BLUEPRINT_VERSION}.`);
  }

  const sourceId = decodeSourceId(record.sourceId, 'blueprint.sourceId');
  const name = decodeName(record.name, 'blueprint.name');
  const size = decodeEnum(record.size, CREATURE_BLUEPRINT_SIZES, 'blueprint.size');
  const type = decodeEnum(record.type, CREATURE_BLUEPRINT_TYPES, 'blueprint.type');
  const alignment = decodeEnum(record.alignment, CREATURE_BLUEPRINT_ALIGNMENTS, 'blueprint.alignment');
  const ac = decodeInteger(record.ac, 'blueprint.ac', 1, 100);
  const hp = decodeInteger(record.hp, 'blueprint.hp', 1, 100_000);
  const speed = decodeInteger(record.speed, 'blueprint.speed', 0, 1_000);
  const abilities = decodeAbilities(record.abilities);
  const cr = decodeChallengeRating(record.cr, 'blueprint.cr');
  const components = decodeComponents(record.components);
  const lineage = record.lineage === undefined ? undefined : decodeLineage(record.lineage);

  return {
    schema: CREATURE_BLUEPRINT_SCHEMA,
    version: CREATURE_BLUEPRINT_VERSION,
    sourceId,
    name,
    size,
    type,
    alignment,
    ac,
    hp,
    speed,
    abilities,
    cr,
    components,
    ...(lineage ? { lineage } : {}),
  };
}

/**
 * Render the blueprint to the canonical English source consumed by the
 * existing ParserFactory/workflow.  The reserved comment is deliberately one
 * JSON line so it survives Source Library rawSource persistence without
 * becoming parser-owned YAML metadata.
 */
export function renderCreatureBlueprintSource(blueprint: CreatureBlueprintV1): string {
  const decoded = decodeCreatureBlueprint(blueprint);
  const metadata = stableJsonStringify(decoded as unknown as JsonValue);
  const lines = [
    '---',
    `forge-source-id: ${decoded.sourceId}`,
    `${CREATURE_BLUEPRINT_COMMENT_PREFIX} ${metadata}`,
    `名称: ${JSON.stringify(decoded.name)}`,
    '类型: npc',
    `体型: ${JSON.stringify(CREATURE_SIZE_LABELS[decoded.size])}`,
    `生物类型: ${JSON.stringify(CREATURE_TYPE_LABELS[decoded.type])}`,
    `阵营: ${JSON.stringify(CREATURE_ALIGNMENT_LABELS[decoded.alignment])}`,
    '能力:',
    `  力量: ${decoded.abilities.str}`,
    `  敏捷: ${decoded.abilities.dex}`,
    `  体质: ${decoded.abilities.con}`,
    `  智力: ${decoded.abilities.int}`,
    `  感知: ${decoded.abilities.wis}`,
    `  魅力: ${decoded.abilities.cha}`,
    `护甲等级: ${decoded.ac}`,
    `生命值: ${decoded.hp}`,
    `速度: ${JSON.stringify(`步行 ${decoded.speed} 尺`)}`,
    `挑战等级: ${JSON.stringify(formatChallengeRating(decoded.cr))}`,
    '动作:',
    ...decoded.components.flatMap((component) => renderStructuredComponent(component)),
    '---',
    '',
  ];

  // attachForgeSourceId verifies that the identity uses the same shared Forge
  // source identity implementation as all other browser sources.  It leaves
  // this already canonical frontmatter byte-for-byte unchanged.
  return attachForgeSourceId(lines.join('\n'), decoded.sourceId).content;
}

/**
 * Parse only canonical blueprint sources.  A missing marker, invalid metadata,
 * identity mismatch, or changed body is an error rather than a best-effort
 * interpretation.  CRLF and an optional UTF-8 BOM are normalized for input.
 */
export function parseCreatureBlueprintSource(content: string): CreatureBlueprintV1 {
  if (typeof content !== 'string') {
    throw new TypeError('Creature blueprint source must be a string.');
  }
  const normalized = normalizeSource(content);
  if (new TextEncoder().encode(normalized).byteLength > MAX_SOURCE_UTF8_BYTES) {
    throw new TypeError(`Creature blueprint source must be at most ${MAX_SOURCE_UTF8_BYTES} UTF-8 bytes.`);
  }

  const frontmatter = readFrontmatter(normalized);
  const metadataLines = frontmatter.split('\n').filter((line) => line.startsWith(CREATURE_BLUEPRINT_COMMENT_PREFIX));
  if (metadataLines.length !== 1) {
    throw new TypeError('Creature blueprint source must contain exactly one reserved blueprint metadata comment.');
  }

  const jsonText = metadataLines[0]!.slice(CREATURE_BLUEPRINT_COMMENT_PREFIX.length).trim();
  if (!jsonText) throw new TypeError('Creature blueprint metadata comment is empty.');

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(jsonText) as unknown;
  } catch {
    throw new TypeError('Creature blueprint metadata comment is not valid JSON.');
  }

  const blueprint = decodeCreatureBlueprint(rawMetadata);
  const identity = readForgeSourceId(normalized);
  if (identity.status !== 'valid' || identity.sourceId !== blueprint.sourceId) {
    throw new TypeError('Creature blueprint source identity does not match its metadata.');
  }

  const canonical = normalizeSource(renderCreatureBlueprintSource(blueprint));
  if (canonical !== normalized) {
    throw new TypeError('Creature blueprint source metadata or body does not match its canonical blueprint.');
  }
  return blueprint;
}

/**
 * Derive a new authoring source while retaining only immediate parent
 * provenance.  Source identity is always distinct; the default is generated
 * by the shared Forge UUID helper.
 */
export function deriveCreatureBlueprint(
  blueprint: CreatureBlueprintV1,
  newName: string,
  newSourceId?: ForgeSourceId,
): CreatureBlueprintV1 {
  const parent = decodeCreatureBlueprint(blueprint);
  const sourceId = newSourceId ?? createForgeSourceId();
  if (!isForgeSourceId(sourceId)) {
    throw new TypeError('Derived creature blueprint sourceId must be a canonical Forge actor source ID.');
  }
  if (sourceId === parent.sourceId) {
    throw new TypeError('Derived creature blueprint must use a distinct sourceId.');
  }

  const candidate = {
    ...parent,
    sourceId,
    name: newName,
  };
  const changes = diffCreatureBlueprintFields(parent, candidate);
  return decodeCreatureBlueprint({
    ...candidate,
    lineage: {
      parentSourceId: parent.sourceId,
      parentSourceHash: hashSource(renderCreatureBlueprintSource(parent)),
      changes,
    },
  });
}

/** Compare mechanical authoring fields while excluding identity and lineage. */
export function diffCreatureBlueprintFields(
  before: CreatureBlueprintV1,
  after: CreatureBlueprintV1,
): CreatureBlueprintFieldChange[] {
  const left = decodeCreatureBlueprint(before);
  const right = decodeCreatureBlueprint(after);
  const changes: CreatureBlueprintFieldChange[] = [];
  const fields: Array<keyof CreatureBlueprintV1> = [
    'name',
    'size',
    'type',
    'alignment',
    'ac',
    'hp',
    'speed',
    'abilities',
    'cr',
    'components',
  ];
  for (const field of fields) {
    compareJsonValues(left[field] as unknown as JsonValue, right[field] as unknown as JsonValue, `/${field}`, changes);
  }
  return changes;
}

function decodeComponents(value: unknown): CreatureBlueprintComponent[] {
  if (!Array.isArray(value)) throw new TypeError('blueprint.components must be an array.');
  if (value.length > MAX_COMPONENTS) {
    throw new TypeError(`blueprint.components must contain at most ${MAX_COMPONENTS} components.`);
  }

  return value.map((entry, index) => {
    const path = `blueprint.components[${index}]`;
    const component = asPlainRecord(entry, path);
    const type = component.type;
    if (type === 'attack') {
      assertKeys(component, ATTACK_KEYS, path);
      return {
        type: 'attack' as const,
        name: decodeComponentName(component.name, `${path}.name`),
        mode: decodeEnum(component.mode, ['melee', 'ranged'] as const, `${path}.mode`),
        hitBonus: decodeInteger(component.hitBonus, `${path}.hitBonus`, -30, 30),
        range: decodeInteger(component.range, `${path}.range`, 1, 1_000),
        damage: decodeDamage(component.damage, `${path}.damage`),
      };
    }
    if (type === 'save') {
      assertKeys(component, SAVE_KEYS, path);
      return {
        type: 'save' as const,
        name: decodeComponentName(component.name, `${path}.name`),
        ability: decodeEnum(component.ability, CREATURE_BLUEPRINT_ABILITIES, `${path}.ability`),
        dc: decodeInteger(component.dc, `${path}.dc`, 1, 40),
        range: decodeInteger(component.range, `${path}.range`, 1, 1_000),
        damage: decodeDamage(component.damage, `${path}.damage`),
        success: decodeEnum(component.success, ['half', 'none'] as const, `${path}.success`),
      };
    }
    throw new TypeError(`${path}.type must be attack or save; unsupported component types are rejected.`);
  });
}

function decodeDamage(value: unknown, path: string): CreatureBlueprintDamage {
  const damage = asPlainRecord(value, path);
  assertKeys(damage, DAMAGE_KEYS, path);
  const formula = decodeDiceFormula(damage.formula, `${path}.formula`);
  const type = decodeEnum(damage.type, CREATURE_BLUEPRINT_DAMAGE_TYPES, `${path}.type`);
  return { formula, type };
}

function decodeDiceFormula(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 32 || !DICE_PATTERN.test(value)) {
    throw new TypeError(`${path} must be a bounded D&D dice formula such as 1d6+2.`);
  }
  const match = DICE_PATTERN.exec(value);
  if (!match?.[1] || !match[2]) throw new TypeError(`${path} is not a supported dice formula.`);
  const count = Number.parseInt(match[1], 10);
  const modifier = match[4] ? Number.parseInt(match[4], 10) : 0;
  if (!Number.isSafeInteger(count) || count > 100 || modifier > 100) {
    throw new TypeError(`${path} exceeds the supported dice formula bounds.`);
  }
  return value;
}

function decodeAbilities(value: unknown): CreatureBlueprintAbilities {
  const abilities = asPlainRecord(value, 'blueprint.abilities');
  assertKeys(abilities, ABILITY_KEYS, 'blueprint.abilities');
  return {
    str: decodeInteger(abilities.str, 'blueprint.abilities.str', 1, 30),
    dex: decodeInteger(abilities.dex, 'blueprint.abilities.dex', 1, 30),
    con: decodeInteger(abilities.con, 'blueprint.abilities.con', 1, 30),
    int: decodeInteger(abilities.int, 'blueprint.abilities.int', 1, 30),
    wis: decodeInteger(abilities.wis, 'blueprint.abilities.wis', 1, 30),
    cha: decodeInteger(abilities.cha, 'blueprint.abilities.cha', 1, 30),
  };
}

function decodeLineage(value: unknown): CreatureBlueprintLineage {
  const lineage = asPlainRecord(value, 'blueprint.lineage');
  assertKeys(lineage, LINEAGE_KEYS, 'blueprint.lineage');
  const parentSourceId = decodeSourceId(lineage.parentSourceId, 'blueprint.lineage.parentSourceId');
  const parentSourceHash = decodeHash(lineage.parentSourceHash, 'blueprint.lineage.parentSourceHash');
  if (!Array.isArray(lineage.changes) || lineage.changes.length > MAX_FIELD_CHANGE_COUNT) {
    throw new TypeError(`blueprint.lineage.changes must contain at most ${MAX_FIELD_CHANGE_COUNT} entries.`);
  }
  const changes = lineage.changes.map((entry, index) => {
    const path = `blueprint.lineage.changes[${index}]`;
    const change = asPlainRecord(entry, path);
    assertKeys(change, CHANGE_KEYS, path);
    if (typeof change.path !== 'string' || !isAllowedChangePath(change.path)) {
      throw new TypeError(`${path}.path must name a supported creature authoring field.`);
    }
    return {
      path: change.path,
      before: decodeJsonValue(change.before, `${path}.before`),
      after: decodeJsonValue(change.after, `${path}.after`),
    };
  });
  return { parentSourceId, parentSourceHash, changes };
}

function decodeJsonValue(value: unknown, path: string, depth = 0, stack = new Set<object>()): JsonValue {
  if (depth > 8) throw new TypeError(`${path} is too deeply nested.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    if (typeof value === 'string' && (value.length > 512 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))) {
      throw new TypeError(`${path} contains unsafe text.`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must be a finite JSON number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) throw new TypeError(`${path} array is too large.`);
    if (stack.has(value)) throw new TypeError(`${path} must not be cyclic.`);
    stack.add(value);
    const result = value.map((entry, index) => decodeJsonValue(entry, `${path}[${index}]`, depth + 1, stack));
    stack.delete(value);
    return result;
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new TypeError(`${path} must be JSON data.`);
  }
  const record = asPlainRecord(value, path);
  if (Object.keys(record).length > 32) throw new TypeError(`${path} object is too large.`);
  if (stack.has(record)) throw new TypeError(`${path} must not be cyclic.`);
  stack.add(record);
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(record).sort()) {
    if (
      key.length > 64
      || /[\u0000-\u001f\u007f]/u.test(key)
      || key === '__proto__'
      || key === 'constructor'
      || key === 'prototype'
    ) throw new TypeError(`${path} has an unsafe key.`);
    result[key] = decodeJsonValue(record[key], `${path}.${key}`, depth + 1, stack);
  }
  stack.delete(record);
  return result;
}

function decodeName(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > MAX_NAME_LENGTH) {
    throw new TypeError(`${path} must be a trimmed non-empty name of at most ${MAX_NAME_LENGTH} characters.`);
  }
  if (/\r|\n|[\u2028\u2029]/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${path} must be a single-line safe name.`);
  }
  return value;
}

function decodeComponentName(value: unknown, path: string): string {
  const name = decodeName(value, path);
  if (/[.]\s/u.test(name)) {
    throw new TypeError(`${path} must not contain a period followed by whitespace in an action header.`);
  }
  return name;
}

function decodeChallengeRating(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 30) {
    throw new TypeError(`${path} must be a finite challenge rating from 0 through 30.`);
  }
  const isStandardFraction = value === 0.125 || value === 0.25 || value === 0.5;
  if (!isStandardFraction && !Number.isInteger(value)) {
    throw new TypeError(`${path} must be 0, 1/8, 1/4, 1/2, or a whole challenge rating.`);
  }
  return value;
}

function decodeInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${path} must be an integer from ${min} through ${max}.`);
  }
  return value;
}

function decodeSourceId(value: unknown, path: string): ForgeSourceId {
  if (!isForgeSourceId(value)) throw new TypeError(`${path} must be a canonical Forge actor source ID.`);
  return value;
}

function decodeHash(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${path} must be a lowercase SHA-256 hash.`);
  return value as Sha256;
}

function decodeEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TypeError(`${path} has an unsupported enum value.`);
  }
  return value as T;
}

function asPlainRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new TypeError(`${path} contains unknown key '${key}'.`);
  }
}

function renderStructuredComponent(component: CreatureBlueprintComponent): string[] {
  const average = averageDamage(component.damage.formula);
  const description = component.type === 'attack'
    ? `${component.mode === 'melee' ? '近战' : '远程'}武器攻击：命中 ${formatSignedBonus(component.hitBonus)}，${component.mode === 'melee' ? '触及' : '射程'} ${component.range} 尺，单一生物。命中：${average}（${component.damage.formula}）点${CREATURE_DAMAGE_LABELS[component.damage.type]}伤害。`
    : `选择一个${component.range}尺内的生物。该生物必须进行一次 DC ${component.dc} ${CREATURE_ABILITY_LABELS[component.ability]}豁免检定。豁免失败时受到 ${average}（${component.damage.formula}）点${CREATURE_DAMAGE_LABELS[component.damage.type]}伤害；${component.success === 'half' ? '豁免成功时伤害减半。' : '豁免成功时不受伤害。'}`;

  if (component.type === 'attack') {
    return [
      `  - 名称: ${JSON.stringify(component.name)}`,
      '    类型: attack',
      `    攻击类型: ${component.mode === 'melee' ? 'mwak' : 'rwak'}`,
      `    命中: ${component.hitBonus}`,
      `    范围: ${JSON.stringify(`${component.mode === 'melee' ? '触及' : '射程'} ${component.range} 尺`)}`,
      '    目标:',
      '      数量: 1',
      '      类型: creature',
      '    伤害:',
      `      - 公式: ${JSON.stringify(component.damage.formula)}`,
      `        类型: ${component.damage.type}`,
      `    描述: ${JSON.stringify(description)}`,
    ];
  }

  return [
    `  - 名称: ${JSON.stringify(component.name)}`,
    '    类型: save',
    `    DC: ${component.dc}`,
    `    属性: ${component.ability}`,
    '    DC来源: literal',
    '    目标:',
    '      数量: 1',
    '      类型: creature',
    '    伤害:',
    `      - 公式: ${JSON.stringify(component.damage.formula)}`,
    `        类型: ${component.damage.type}`,
    `    描述: ${JSON.stringify(description)}`,
  ];
}

function averageDamage(formula: string): number {
  const match = DICE_PATTERN.exec(formula);
  if (!match?.[1] || !match[2]) throw new TypeError('Cannot render an unsupported dice formula.');
  const count = Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const modifier = match[4] ? Number.parseInt(match[4], 10) * (match[3] === '-' ? -1 : 1) : 0;
  return Math.max(0, Math.floor(count * (sides + 1) / 2 + modifier));
}

function formatSignedBonus(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function formatChallengeRating(value: number): string {
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return String(value);
}

function readFrontmatter(content: string): string {
  const match = content.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/u);
  if (!match?.[1]) throw new TypeError('Creature blueprint source must have valid YAML frontmatter.');
  return match[1];
}

function normalizeSource(content: string): string {
  return content.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
}

function isAllowedChangePath(path: string): boolean {
  if (!/^\/[A-Za-z0-9_./-]{1,159}$/u.test(path)) return false;
  if (['/name', '/size', '/type', '/alignment', '/ac', '/hp', '/speed', '/cr', '/abilities', '/components'].includes(path)) {
    return true;
  }
  if (/^\/abilities\/(?:str|dex|con|int|wis|cha)$/u.test(path)) return true;
  return /^\/components\/(?:[0-7])(?:\/(?:type|name|mode|hitBonus|range|ability|dc|success|damage|damage\/(?:formula|type)))?$/u.test(path);
}

function stableJsonStringify(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stableJsonStringify(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key]!)}`).join(',')}}`;
}

function compareJsonValues(
  before: JsonValue,
  after: JsonValue,
  path: string,
  changes: CreatureBlueprintFieldChange[],
): void {
  if (stableJsonStringify(before) === stableJsonStringify(after)) return;
  if (changes.length >= MAX_FIELD_CHANGE_COUNT) throw new TypeError(`At most ${MAX_FIELD_CHANGE_COUNT} blueprint field changes are supported.`);

  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let index = 0; index < before.length; index += 1) {
      compareJsonValues(before[index]!, after[index]!, `${path}/${index}`, changes);
    }
    return;
  }
  if (isJsonObject(before) && isJsonObject(after)) {
    // Attack and save are distinct component shapes. Preserve the complete
    // old shape when replacing one with the other, so lineage remains
    // reversible without treating absent properties as authored null values.
    if (/^\/components\/[0-7]$/u.test(path) && before.type !== after.type) {
      changes.push({ path, before, after });
      return;
    }
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      if (!(key in before) || !(key in after)) {
        changes.push({ path: `${path}/${key}`, before: before[key] ?? null, after: after[key] ?? null });
      } else {
        compareJsonValues(before[key]!, after[key]!, `${path}/${key}`, changes);
      }
    }
    return;
  }
  changes.push({ path, before, after });
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
