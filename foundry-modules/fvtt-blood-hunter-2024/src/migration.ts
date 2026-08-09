import type {
  ActorLike,
  ActorMigrationPlan,
  ConflictDecision,
  JsonObject,
  MigrationAction,
  MigrationConflict,
  MigrationContract,
  ProjectionValidation,
  RuntimeDocument,
  RuntimeIdentity,
} from './contracts.ts';

const SOURCE = 'BloodHunter2024';
const CONFLICT_PATHS = ['system.description', 'system.activities', 'effects'] as const;

type ExistingItem = RuntimeDocument & { legacyIdentity?: JsonObject };

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function asRecord(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as JsonObject).sort().map((key) => [key, canonicalize((value as JsonObject)[key])]));
}

export function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '-');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metadata(item: ExistingItem | RuntimeDocument): JsonObject {
  return asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).bloodHunter2024);
}

function targetIdentity(item: RuntimeDocument): RuntimeIdentity | undefined {
  const identity = asRecord(metadata(item).sourceIdentity);
  const source = stringValue(identity.source);
  const normalizedName = stringValue(identity.normalizedName);
  if (!source || !normalizedName) return undefined;
  return {
    source,
    group: stringValue(identity.group),
    className: stringValue(identity.className),
    subclassShortName: stringValue(identity.subclassShortName),
    level: numberValue(identity.level),
    normalizedName,
  };
}

function canonicalIdForExisting(item: ExistingItem): string | undefined {
  return stringValue(metadata(item).canonicalId);
}

export function legacyIdentityForExisting(item: ExistingItem): RuntimeIdentity | undefined {
  const explicit = asRecord(item.legacyIdentity);
  const plutonium = asRecord(asRecord(item.flags).plutonium);
  const raw = Object.keys(explicit).length > 0 ? explicit : plutonium;
  const source = stringValue(raw.source) ?? stringValue(asRecord(asRecord(item.system).source).custom);
  if (source !== SOURCE) return undefined;
  const name = stringValue(raw.name) ?? stringValue(item.name);
  if (!name) return undefined;
  return {
    source,
    group: stringValue(raw.group) ?? 'optionalfeature',
    className: stringValue(raw.className),
    subclassShortName: stringValue(raw.subclassShortName),
    level: numberValue(raw.level),
    normalizedName: normalizeName(name),
  };
}

function sameIdentity(left: RuntimeIdentity, right: RuntimeIdentity): boolean {
  return left.source === right.source
    && left.className === right.className
    && left.subclassShortName === right.subclassShortName
    && left.level === right.level
    && left.normalizedName === right.normalizedName;
}

function itemIsBloodHunter(item: ExistingItem, targetIds: ReadonlySet<string>): boolean {
  const canonicalId = canonicalIdForExisting(item);
  return (canonicalId !== undefined && targetIds.has(canonicalId)) || legacyIdentityForExisting(item)?.source === SOURCE;
}

function currentLogicalHash(item: ExistingItem): string | undefined {
  return stringValue(metadata(item).logicalHash);
}

function targetLogicalHash(item: RuntimeDocument): string | undefined {
  return stringValue(metadata(item).logicalHash);
}

function comparableItem(item: Pick<ExistingItem, 'name' | 'type' | 'system' | 'effects'>): JsonObject {
  const next = clone({ name: item.name, type: item.type, system: item.system ?? {}, effects: item.effects ?? [] });
  const system = asRecord(next.system);
  const uses = asRecord(system.uses);
  delete uses.spent;
  delete system.levels;
  for (const activity of Object.values(asRecord(system.activities))) {
    const activityUses = asRecord(asRecord(activity).uses);
    delete activityUses.spent;
  }
  for (const advancement of Object.values(asRecord(system.advancement))) delete asRecord(advancement).value;
  return next;
}

function logicalEqual(existing: ExistingItem, target: RuntimeDocument): boolean {
  const existingHash = currentLogicalHash(existing);
  const targetHash = targetLogicalHash(target);
  if (existingHash && targetHash) return existingHash === targetHash;
  return canonicalJson(comparableItem(existing)) === canonicalJson(comparableItem(target));
}

function conflictsFor(existing: ExistingItem, target: RuntimeDocument, flagged: boolean): MigrationConflict[] {
  if (!flagged || logicalEqual(existing, target)) return [];
  const conflicts: MigrationConflict[] = [];
  for (const path of CONFLICT_PATHS) {
    const current = path === 'system.description'
      ? asRecord(existing.system).description
      : path === 'system.activities'
        ? asRecord(existing.system).activities
        : existing.effects;
    const incoming = path === 'system.description'
      ? asRecord(target.system).description
      : path === 'system.activities'
        ? asRecord(target.system).activities
        : target.effects;
    if (canonicalJson(current) !== canonicalJson(incoming)) {
      conflicts.push({
        itemId: existing._id,
        canonicalId: target._id,
        path,
        current: clone(current),
        incoming: clone(incoming),
        reason: '已带 canonical flag 的 Item 在 Activity、Effect 或说明上与新契约不同；必须逐项选择 Keep/Overwrite/Cancel。',
      });
    }
  }
  return conflicts;
}

function conflictAction(target: RuntimeDocument, existing: ExistingItem[], reason: string, legacy: boolean, conflicts: MigrationConflict[] = []): MigrationAction {
  return {
    action: 'conflict',
    canonicalId: target._id,
    targetItem: clone(target),
    existingItemIds: existing.map((item) => item._id).sort(),
    reason,
    legacy,
    conflicts,
  };
}

export function planActorMigration(actor: ActorLike, contract: MigrationContract): ActorMigrationPlan {
  const items = asArray<ExistingItem>(actor.items);
  const targets = [...contract.documents].sort((left, right) => left._id.localeCompare(right._id, 'en'));
  const targetIds = new Set(targets.map((target) => target._id));
  const flaggedByTarget = new Map<string, ExistingItem[]>();
  const legacyItems: ExistingItem[] = [];
  const matchedIds = new Set<string>();

  for (const item of items) {
    const canonicalId = canonicalIdForExisting(item);
    if (canonicalId && targetIds.has(canonicalId)) {
      const candidates = flaggedByTarget.get(canonicalId) ?? [];
      candidates.push(item);
      flaggedByTarget.set(canonicalId, candidates);
      matchedIds.add(item._id);
    } else if (!canonicalId) {
      const identity = legacyIdentityForExisting(item);
      if (identity) {
        legacyItems.push(item);
        matchedIds.add(item._id);
      }
    }
  }

  const legacyByTarget = new Map<string, ExistingItem[]>();
  const ambiguousLegacy: Array<{ item: ExistingItem; candidates: RuntimeDocument[] }> = [];
  for (const item of legacyItems) {
    const identity = legacyIdentityForExisting(item);
    if (!identity) continue;
    const candidates = targets.filter((target) => {
      const candidateIdentity = targetIdentity(target);
      return candidateIdentity ? sameIdentity(candidateIdentity, identity) : false;
    });
    if (candidates.length !== 1) {
      if (candidates.length > 1) ambiguousLegacy.push({ item, candidates });
      continue;
    }
    const targetId = candidates[0]!._id;
    const existing = legacyByTarget.get(targetId) ?? [];
    existing.push(item);
    legacyByTarget.set(targetId, existing);
  }

  const fixedIds = new Set(contract.fixedGrantDocumentIds);
  const actions: MigrationAction[] = [];
  const allConflicts: MigrationConflict[] = [];
  for (const target of targets) {
    const flagged = flaggedByTarget.get(target._id) ?? [];
    const legacy = legacyByTarget.get(target._id) ?? [];
    const candidates = [...flagged, ...legacy];
    if (flagged.length > 1 || candidates.length > 1) {
      const action = conflictAction(target, candidates, '多个现有 Item 指向同一个 canonical document；歧义必须停止。', false);
      actions.push(action);
      continue;
    }
    if (candidates.length === 0) {
      actions.push({
        action: fixedIds.has(target._id) ? 'add' : 'skip',
        canonicalId: target._id,
        targetItem: clone(target),
        existingItemIds: [],
        reason: fixedIds.has(target._id) ? '只补充编译契约明确固定授予的 Item。' : '没有唯一 flags/legacy composite match；非固定选项不自动添加。',
        legacy: false,
        conflicts: [],
      });
      continue;
    }
    const existing = candidates[0]!;
    const conflicts = conflictsFor(existing, target, flagged.length === 1);
    if (conflicts.length > 0) allConflicts.push(...conflicts);
    actions.push({
      action: conflicts.length > 0 ? 'conflict' : logicalEqual(existing, target) ? 'keep' : 'update',
      canonicalId: target._id,
      targetItem: clone(target),
      existingItemIds: [existing._id],
      reason: flagged.length === 1
        ? 'flags.fvttJsonGenerator.bloodHunter2024 优先识别唯一 canonical document。'
        : 'legacy 仅在 source/class/subclass/level/normalized name 全部严格匹配时识别。',
      legacy: flagged.length === 0,
      conflicts,
    });
  }

  for (const ambiguous of ambiguousLegacy) {
    const target = [...ambiguous.candidates].sort((left, right) => left._id.localeCompare(right._id, 'en'))[0]!;
    const conflict: MigrationConflict = {
      itemId: ambiguous.item._id,
      canonicalId: 'legacy-name-ambiguity',
      path: 'system.description',
      current: clone(ambiguous.item),
      incoming: clone(target),
      reason: 'legacy composite match 命中多个 canonical documents；名称歧义必须人工停止。',
    };
    allConflicts.push(conflict);
    actions.push(conflictAction(target, [ambiguous.item], conflict.reason, true, [conflict]));
  }

  return {
    actorId: stringValue(actor._id) ?? stringValue(actor.id) ?? '',
    actorName: stringValue(actor.name) ?? '',
    actorSnapshot: canonicalJson(actor),
    eligible: matchedIds.size > 0,
    matchedBloodHunterItemIds: [...matchedIds].sort(),
    actions,
    conflicts: allConflicts,
  };
}

function mergeFlags(existing: ExistingItem, target: RuntimeDocument): JsonObject {
  const current = asRecord(existing.flags);
  const incoming = asRecord(target.flags);
  const currentGenerator = asRecord(current.fvttJsonGenerator);
  const incomingGenerator = asRecord(incoming.fvttJsonGenerator);
  const mergedGenerator = { ...clone(currentGenerator), ...clone(incomingGenerator), bloodHunter2024: clone(asRecord(incomingGenerator.bloodHunter2024)) };
  return { ...clone(current), ...clone(incoming), fvttJsonGenerator: mergedGenerator };
}

function mergeAdvancementValues(incoming: JsonObject, current: JsonObject): JsonObject {
  const result = clone(incoming);
  for (const [id, advancement] of Object.entries(result)) {
    const existing = asRecord(current[id]);
    if ('value' in existing) asRecord(advancement).value = clone(existing.value);
  }
  return result;
}

function mergeActivitySpent(incoming: JsonObject, current: JsonObject): JsonObject {
  const result = clone(incoming);
  for (const [id, activity] of Object.entries(result)) {
    const existingUses = asRecord(asRecord(current[id]).uses);
    if ('spent' in existingUses) asRecord(asRecord(activity).uses).spent = clone(existingUses.spent);
  }
  return result;
}

function applyConflictDecision(value: unknown, existing: unknown, conflict: MigrationConflict, decisions: Record<string, ConflictDecision>): unknown {
  const decision = decisions[`${conflict.itemId}:${conflict.path}`];
  if (!decision || decision === 'Cancel') throw new Error(`Migration conflict requires explicit ${conflict.path} decision for ${conflict.itemId}.`);
  return decision === 'Keep' ? clone(existing) : clone(value);
}

function mergeItem(existing: ExistingItem, target: RuntimeDocument, conflicts: MigrationConflict[], decisions: Record<string, ConflictDecision>): ExistingItem {
  const incoming = clone(target);
  const current = clone(existing);
  const merged: ExistingItem = { ...current, ...incoming, _id: current._id };
  const currentSystem = asRecord(current.system);
  const incomingSystem = asRecord(incoming.system);
  const system: JsonObject = { ...clone(currentSystem), ...clone(incomingSystem) };
  const incomingDescription = incomingSystem.description;
  const currentDescription = currentSystem.description;
  const incomingActivities = asRecord(incomingSystem.activities);
  const currentActivities = asRecord(currentSystem.activities);
  const incomingEffects = asArray<JsonObject>(incoming.effects);
  const currentEffects = asArray<JsonObject>(current.effects);
  const descriptionConflict = conflicts.find((conflict) => conflict.path === 'system.description');
  const activitiesConflict = conflicts.find((conflict) => conflict.path === 'system.activities');
  const effectsConflict = conflicts.find((conflict) => conflict.path === 'effects');
  system.description = descriptionConflict ? applyConflictDecision(incomingDescription, currentDescription, descriptionConflict, decisions) : clone(incomingDescription);
  system.activities = activitiesConflict
    ? applyConflictDecision(incomingActivities, currentActivities, activitiesConflict, decisions)
    : mergeActivitySpent(incomingActivities, currentActivities);
  merged.effects = effectsConflict ? asArray<JsonObject>(applyConflictDecision(incomingEffects, currentEffects, effectsConflict, decisions)) : incomingEffects;

  const currentUses = asRecord(currentSystem.uses);
  const incomingUses = asRecord(incomingSystem.uses);
  system.uses = { ...clone(currentUses), ...clone(incomingUses) };
  if ('spent' in currentUses) asRecord(system.uses).spent = clone(currentUses.spent);
  if ('levels' in currentSystem) system.levels = clone(currentSystem.levels);
  system.advancement = mergeAdvancementValues(asRecord(incomingSystem.advancement), asRecord(currentSystem.advancement));
  merged.system = system;
  merged.flags = mergeFlags(current, incoming);
  return merged;
}

export function applyActorMigrationPlan(
  actor: ActorLike,
  plan: ActorMigrationPlan,
  decisions: Record<string, ConflictDecision> = {},
): ActorLike {
  if (!plan.eligible) throw new Error('Actor is not eligible for a Blood Hunter migration.');
  if (plan.conflicts.length > 0 && plan.conflicts.some((conflict) => decisions[`${conflict.itemId}:${conflict.path}`] !== 'Keep' && decisions[`${conflict.itemId}:${conflict.path}`] !== 'Overwrite')) {
    throw new Error('Migration has unresolved conflicts; Cancel and a closed review are fail-closed.');
  }
  const result = clone(actor);
  const items = asArray<ExistingItem>(result.items);
  const indexById = new Map(items.map((item, index) => [item._id, index]));
  for (const action of plan.actions) {
    if (action.action === 'skip' || action.action === 'keep') continue;
    if (action.action === 'conflict' && action.existingItemIds.length !== 1) throw new Error(`Cannot resolve ambiguous Blood Hunter action ${action.canonicalId}.`);
    if (action.action === 'conflict' || action.action === 'update') {
      const existingId = action.existingItemIds[0];
      const index = existingId ? indexById.get(existingId) : undefined;
      if (index === undefined) throw new Error(`Migration target item disappeared: ${existingId ?? action.canonicalId}.`);
      items[index] = mergeItem(items[index]!, action.targetItem, action.conflicts, decisions);
      continue;
    }
    if (action.action === 'add') {
      if (items.some((item) => item._id === action.targetItem._id)) throw new Error(`Cannot add duplicate embedded Item id ${action.targetItem._id}.`);
      items.push(clone(action.targetItem));
    }
  }
  result.items = items;
  return result;
}

function valueAtActivity(item: ExistingItem, id: string): unknown {
  return asRecord(asRecord(asRecord(item.system).activities)[id]).uses;
}

function collectActivityReferenceFindings(item: ExistingItem, findings: Array<{ code: string; path: string; message: string }>): void {
  const effectIds = new Set(asArray<JsonObject>(item.effects).map((effect) => stringValue(effect._id)).filter((id): id is string => Boolean(id)));
  for (const [activityId, activity] of Object.entries(asRecord(asRecord(item.system).activities))) {
    for (const [index, effect] of asArray<JsonObject>(asRecord(activity).effects).entries()) {
      const effectId = stringValue(effect._id);
      if (!effectId || !effectIds.has(effectId)) findings.push({ code: 'DANGLING_ACTIVITY_EFFECT', path: `items/${item._id}/system/activities/${activityId}/effects/${index}`, message: 'Activity effect 引用必须指向同一 Item 的现有 Effect。' });
    }
  }
}

export function validateMigratedActorProjection(before: ActorLike, after: ActorLike, contract: MigrationContract): ProjectionValidation {
  const findings: ProjectionValidation['findings'] = [];
  if (canonicalJson(before.system ?? {}) !== canonicalJson(after.system ?? {})) findings.push({ code: 'ACTOR_SYSTEM_CHANGED', path: 'system', message: '迁移不得改变 Actor 的 HP、职业等级或其他 Actor system 字段。' });
  const beforeItems = asArray<ExistingItem>(before.items);
  const afterItems = asArray<ExistingItem>(after.items);
  const targetIds = new Set(contract.documents.map((document) => document._id));
  const beforeById = new Map(beforeItems.map((item) => [item._id, item]));
  const afterById = new Map(afterItems.map((item) => [item._id, item]));
  for (const beforeItem of beforeItems) {
    if (!itemIsBloodHunter(beforeItem, targetIds)) {
      const afterItem = afterById.get(beforeItem._id);
      if (!afterItem || canonicalJson(afterItem) !== canonicalJson(beforeItem)) findings.push({ code: 'NON_BLOOD_HUNTER_CHANGED', path: `items/${beforeItem._id}`, message: '非血猎手 Item 必须原样保留。' });
      continue;
    }
    const afterItem = afterById.get(beforeItem._id);
    if (!afterItem) continue;
    const beforeSystem = asRecord(beforeItem.system);
    const afterSystem = asRecord(afterItem.system);
    const beforeUses = asRecord(beforeSystem.uses);
    const afterUses = asRecord(afterSystem.uses);
    if ('spent' in beforeUses && afterUses.spent !== beforeUses.spent) findings.push({ code: 'USES_SPENT_CHANGED', path: `items/${beforeItem._id}/system/uses/spent`, message: '已消耗 uses 必须保留。' });
    if ('levels' in beforeSystem && canonicalJson(afterSystem.levels) !== canonicalJson(beforeSystem.levels)) findings.push({ code: 'LEVELS_CHANGED', path: `items/${beforeItem._id}/system/levels`, message: '职业等级必须保留。' });
    for (const [activityId, activity] of Object.entries(asRecord(beforeSystem.activities))) {
      const beforeSpent = asRecord(asRecord(activity).uses).spent;
      const afterActivityUses = asRecord(asRecord(asRecord(afterSystem.activities)[activityId]).uses);
      if (beforeSpent !== undefined && afterActivityUses.spent !== beforeSpent) findings.push({ code: 'ACTIVITY_SPENT_CHANGED', path: `items/${beforeItem._id}/system/activities/${activityId}/uses/spent`, message: 'Activity 已消耗 uses 必须保留。' });
      const beforeActivity = valueAtActivity(beforeItem, activityId);
      const afterActivity = valueAtActivity(afterItem, activityId);
      if (beforeActivity && afterActivity && asRecord(beforeActivity).spent !== undefined && asRecord(afterActivity).spent !== asRecord(beforeActivity).spent) findings.push({ code: 'ACTIVITY_SELECTION_CHANGED', path: `items/${beforeItem._id}/system/activities/${activityId}`, message: 'Activity 运行时选择/消耗状态必须保留。' });
    }
    for (const [advancementId, advancement] of Object.entries(asRecord(beforeSystem.advancement))) {
      const afterAdvancement = asRecord(asRecord(afterSystem.advancement)[advancementId]);
      if ('value' in asRecord(advancement) && canonicalJson(afterAdvancement.value) !== canonicalJson(asRecord(advancement).value)) findings.push({ code: 'ADVANCEMENT_SELECTION_CHANGED', path: `items/${beforeItem._id}/system/advancement/${advancementId}/value`, message: '已选 advancement 选项必须保留。' });
    }
  }
  const canonicalCounts = new Map<string, number>();
  for (const item of afterItems) {
    const canonicalId = canonicalIdForExisting(item);
    if (canonicalId) canonicalCounts.set(canonicalId, (canonicalCounts.get(canonicalId) ?? 0) + 1);
    collectActivityReferenceFindings(item, findings);
  }
  for (const [canonicalId, count] of canonicalCounts) if (count > 1) findings.push({ code: 'DUPLICATE_CANONICAL_ITEM', path: `items/${canonicalId}`, message: '一个 canonical document 不得在 Actor 中重复。' });
  if (afterItems.length < beforeItems.length) findings.push({ code: 'ITEM_DELETED', path: 'items', message: '迁移不得按名称批量删除 Item。' });
  return { ok: findings.length === 0, findings };
}
