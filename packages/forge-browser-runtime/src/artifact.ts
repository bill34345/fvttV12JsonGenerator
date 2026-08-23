import {
  hashArtifact,
  type JsonObject,
  type JsonValue,
} from '@fvtt-json-generator/forge-gateway-protocol';

/**
 * Projects a generated Actor into the deterministic Forge wire artifact.
 *
 * The formal Node workflow intentionally records generation timestamps and a
 * few embedded ActiveEffect IDs are allocated randomly. Those values are not
 * source semantics, but including them in the Forge artifact would make a
 * second conversion of the same final source look like a conflicting Actor.
 * This projection is Forge-only so existing CLI/Web output remains unchanged.
 */
export function normalizeForgeActorArtifact(value: unknown): JsonObject {
  const actor = cloneJsonObject(value);
  normalizeStats(actor);

  const replacements = collectEffectIdReplacements(actor);
  replaceGeneratedEffectIds(actor, replacements);
  return actor;
}

function cloneJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) throw new TypeError('Generated Actor artifact must be a JSON object.');
  return cloneJsonValue(value, '$') as JsonObject;
}

function cloneJsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Generated Actor contains a non-finite number at ${path}.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => cloneJsonValue(entry, `${path}/${index}`));
  if (!isRecord(value)) throw new TypeError(`Generated Actor contains a non-JSON value at ${path}.`);

  const output = Object.create(null) as JsonObject;
  for (const key of Object.keys(value)) {
    output[key] = cloneJsonValue(value[key], `${path}/${key}`);
  }
  return output;
}

function normalizeStats(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const entry of value) normalizeStats(entry);
    return;
  }
  if (!isJsonObject(value)) return;

  const stats = value._stats;
  if (isJsonObject(stats)) {
    if (Object.prototype.hasOwnProperty.call(stats, 'createdTime')) stats.createdTime = null;
    if (Object.prototype.hasOwnProperty.call(stats, 'modifiedTime')) stats.modifiedTime = null;
  }
  for (const entry of Object.values(value)) normalizeStats(entry);
}

function collectEffectIdReplacements(actor: JsonObject): ReadonlyMap<string, string> {
  const replacements = new Map<string, string>();
  const allocated = new Map<string, string>();
  const effectGroups: Array<{ scope: string; effects: JsonValue | undefined }> = [
    { scope: 'actor', effects: actor.effects },
  ];
  if (Array.isArray(actor.items)) {
    for (const [itemIndex, item] of actor.items.entries()) {
      if (!isJsonObject(item)) continue;
      const itemIdentity = typeof item._id === 'string' ? item._id : String(itemIndex);
      effectGroups.push({ scope: `item:${itemIdentity}`, effects: item.effects });
    }
  }

  for (const group of effectGroups) {
    if (!Array.isArray(group.effects)) continue;
    for (const [effectIndex, effect] of group.effects.entries()) {
      if (!isJsonObject(effect) || typeof effect._id !== 'string' || effect._id.length === 0) continue;
      const oldId = effect._id;
      const seedEffect = cloneForEffectSeed(effect, oldId);
      const newId = hashArtifact({
        scope: `${group.scope}:effect:${effectIndex}`,
        effect: seedEffect,
      }).slice(0, 16);
      const priorReplacement = replacements.get(oldId);
      if (priorReplacement !== undefined && priorReplacement !== newId) {
        throw new TypeError(`Generated Actor reuses ActiveEffect ID "${oldId}" for different effects.`);
      }
      const priorOwner = allocated.get(newId);
      const owner = `${group.scope}:effect:${effectIndex}`;
      if (priorOwner !== undefined && priorOwner !== owner) {
        throw new TypeError(`Deterministic Forge ActiveEffect ID collision between ${priorOwner} and ${owner}.`);
      }
      replacements.set(oldId, newId);
      allocated.set(newId, owner);
    }
  }
  return replacements;
}

function cloneForEffectSeed(value: JsonValue, oldId: string): JsonValue {
  if (value === oldId) return '<forge-effect-id>';
  if (Array.isArray(value)) return value.map((entry) => cloneForEffectSeed(entry, oldId));
  if (!isJsonObject(value)) return value;
  const output = Object.create(null) as JsonObject;
  for (const [key, entry] of Object.entries(value)) {
    output[key] = key === '_id' ? '<forge-effect-id>' : cloneForEffectSeed(entry, oldId);
  }
  return output;
}

function replaceGeneratedEffectIds(value: JsonValue, replacements: ReadonlyMap<string, string>): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index]!;
      if (typeof entry === 'string' && replacements.has(entry)) value[index] = replacements.get(entry)!;
      else replaceGeneratedEffectIds(entry, replacements);
    }
    return;
  }
  if (!isJsonObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && replacements.has(entry)) value[key] = replacements.get(entry)!;
    else replaceGeneratedEffectIds(entry, replacements);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
