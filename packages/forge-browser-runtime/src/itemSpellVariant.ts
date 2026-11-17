import { hashArtifact, type ForgeItemSpellVariant, type JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';
import type { ItemSpellBinding } from '@fvtt-json-generator/models/action';
import type { NativeDocumentProjection } from './nativeTarget';

const DAMAGE_LABELS: Record<string, [string, string]> = {
  acid: ['强酸', '強酸'], bludgeoning: ['钝击', '鈍擊'], cold: ['寒冷', '冰冷'],
  fire: ['火焰', '火焰'], force: ['力场', '力場'], lightning: ['闪电', '閃電'],
  necrotic: ['黯蚀', '黯蝕'], piercing: ['穿刺', '穿刺'], poison: ['毒素', '毒素'],
  psychic: ['心灵', '心靈'], radiant: ['光耀', '光耀'], slashing: ['挥砍', '揮砍'],
  thunder: ['雷鸣', '雷鳴'],
};

export function itemSpellVariantDamageType(annotation: string): string | undefined {
  const label = /^(?:改为|改為)?\s*([\p{Script=Han}]+)伤害版本$/u.exec(annotation)?.[1]
    ?? /^(?:改为|改為)?\s*([\p{Script=Han}]+)傷害版本$/u.exec(annotation)?.[1];
  const english = /^([a-z]+)\s+damage\s+version$/iu.exec(annotation)?.[1]?.toLowerCase();
  return label ? Object.keys(DAMAGE_LABELS).find(type => DAMAGE_LABELS[type]!.includes(label))
    : english && Object.hasOwn(DAMAGE_LABELS, english) ? english : undefined;
}

export function summarizeItemSpellSource(uuid: string, document: unknown): ItemSpellBinding | undefined {
  const source = record(document);
  if (source.type !== 'spell') return undefined;
  const system = record(source.system);
  const activities = Object.values<Record<string, any>>(system.activities ?? {});
  const castingTime = activities.find(activity => activity.activation?.type)?.activation;
  if (typeof source.name !== 'string' || typeof system.identifier !== 'string' || !Number.isInteger(system.level)
    || system.level < 0 || system.level > 9 || !['action', 'bonus', 'reaction', 'free'].includes(castingTime?.type)) return undefined;
  const damageTypes = [...new Set<string>(activities.flatMap(activity =>
    damageParts(activity).flatMap(part => part.types ?? [])))].sort();
  return {
    uuid, name: source.name, identifier: system.identifier, level: system.level, rules: system.source?.rules ?? '',
    castingTime: { type: castingTime.type, value: castingTime.value ?? null }, damageTypes,
  };
}

export async function buildItemSpellVariant(
  projection: NativeDocumentProjection,
  identity: Pick<ForgeItemSpellVariant, 'id' | 'baseUuid' | 'damageType'> & { name?: string },
): Promise<{ plan: ForgeItemSpellVariant; artifact: JsonObject; binding: ItemSpellBinding } | undefined> {
  const { id, baseUuid, damageType } = identity;
  if (!Object.hasOwn(DAMAGE_LABELS, damageType)) return undefined;
  const original = await projection.readItemSpellSource?.(baseUuid);
  const base = summarizeItemSpellSource(baseUuid, original);
  if (!base || base.damageTypes.length !== 1 || !Object.hasOwn(DAMAGE_LABELS, base.damageTypes[0]!)
    || !record(original).system?.description?.value?.trim()) return undefined;
  const oldType = base.damageTypes[0]!;
  const spell = structuredClone(record(original));
  spell._id = id;
  spell.name = identity.name ?? base.name;
  spell.folder = null;
  spell.sort = 0;
  spell.ownership = { default: 0 };
  spell._stats = { compendiumSource: baseUuid };
  const nativeFlags = record(spell.flags?.dnd5e);
  const { cachedFor, sourceId, advancementOrigin, ...remainingFlags } = nativeFlags;
  spell.flags = { dnd5e: remainingFlags };
  const affected = Object.values<Record<string, any>>(spell.system.activities ?? {});
  for (const activity of affected) {
    delete activity.macroData;
    delete activity.midiProperties;
    delete activity.useConditionText;
    delete activity.effectConditionText;
    delete activity.otherActivityId;
    activity.flags = { dnd5e: record(activity.flags?.dnd5e) };
    if (activity.description) updateDescription(activity.description, oldType, damageType);
    for (const part of damageParts(activity)) {
      if (!part.types?.includes(oldType)) continue;
      part.types = [damageType];
      if (part.custom?.enabled) {
        part.custom.formula = replaceDamageText(part.custom.formula, oldType, damageType);
      }
    }
  }
  for (const effect of spell.effects ?? []) {
    if ([...(effect.changes ?? []), ...(effect.system?.changes ?? [])].some(change => /^(?:macro\.|flags\.(?!dnd5e\.))/iu.test(change.key))) return undefined;
    effect.flags = { dnd5e: record(effect.flags?.dnd5e) };
    effect._stats = {};
  }
  updateDescription(spell.system.description, oldType, damageType);
  // The pinned native Save migration converts a legacy single ability to an array.
  for (const activity of affected) {
    if (typeof activity.save?.ability === 'string') activity.save.ability = activity.save.ability ? [activity.save.ability] : [];
  }
  const artifact = await projection.project('Item', spell);
  const binding = summarizeItemSpellSource(`Item.${id}`, artifact);
  if (!binding || artifact._id !== id || binding.rules !== base.rules || binding.level !== base.level
    || binding.identifier !== base.identifier || binding.damageTypes.length !== 1 || binding.damageTypes[0] !== damageType) return undefined;
  return {
    binding, artifact,
    plan: { id, baseUuid, name: binding.name, rules: binding.rules, level: binding.level, damageType,
      configHash: hashItemSpellVariantConfig(artifact) },
  };
}

export function hashItemSpellVariantConfig(value: unknown) {
  const { _id, type, img, name, system, effects = [], flags = {} } = record(value);
  return hashArtifact(JSON.parse(JSON.stringify({
    _id, type, img, name, system, flags,
    effects: effects.map(({ _stats, ...effect }: Record<string, unknown>) => effect),
  })));
}

function updateDescription(description: any, from: string, to: string): void {
  if (!description) return;
  for (const key of ['value', 'chat', 'chatFlavor']) {
    if (typeof description[key] === 'string') description[key] = replaceDamageText(description[key], from, to);
  }
}

function replaceDamageText(value: string, from: string, to: string): string {
  const caseMatch = (match: string, next: string) => /^[A-Z]/u.test(match) ? next[0]!.toUpperCase() + next.slice(1) : next;
  let text = value.replace(new RegExp(`\\b${from}(?=\\s+damage\\b)`, 'giu'), match => caseMatch(match, to))
    .replace(new RegExp(`(\\btype=|\\[)${from}(?=[\\s\\]])`, 'giu'), (_, prefix) => prefix + to);
  for (const [index, label] of DAMAGE_LABELS[from]!.entries()) {
    text = text.replace(new RegExp(`${label}(?=伤害|傷害)`, 'gu'), DAMAGE_LABELS[to]![index]!);
  }
  return text;
}

function damageParts(activity: Record<string, any>): Record<string, any>[] {
  const damage = activity.damage;
  return [...(damage?.parts ?? []), ...(damage?.base ? [damage.base] : [])];
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
