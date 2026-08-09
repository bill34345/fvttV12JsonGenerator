import { asRecord, clone, normalizeName, sha256, stringValue } from './internals';
import type {
  BloodHunterSourceIdentity,
  ExistingFoundryItemLike,
  MigrationMergePolicy,
  NativeBloodHunterMigrationAction,
  NativeBloodHunterMigrationPlan,
  NativeBloodHunterPackage,
  NativeItemSource,
} from './types';

export const BLOOD_HUNTER_MERGE_POLICY: MigrationMergePolicy = {
  preservePaths: [
    'system.uses.spent',
    'system.activities.*.uses.spent',
    'system.levels',
    'system.advancement.*.value',
    'flags.* (except flags.fvttJsonGenerator.bloodHunter2024)',
    'non-Blood-Hunter projection fields supplied by the destination Actor/module builder',
  ],
  replacePaths: [
    'name',
    'type',
    'system.activities',
    'system.advancement',
    'effects',
    'flags.fvttJsonGenerator.bloodHunter2024',
  ],
};

/**
 * Produce a deterministic, side-effect-free migration plan. It never calls Foundry APIs and does
 * not mutate either the package or the supplied existing item array.
 */
export function planNativeBloodHunterMigration(
  nativePackage: NativeBloodHunterPackage,
  existingItems: readonly ExistingFoundryItemLike[],
): NativeBloodHunterMigrationPlan {
  const targets = [...nativePackage.classes, ...nativePackage.subclasses, ...nativePackage.features]
    .sort((left, right) => left._id.localeCompare(right._id, 'en'));
  const actions: NativeBloodHunterMigrationAction[] = [];
  const flaggedByTarget = new Map<string, ExistingFoundryItemLike[]>();
  const unflagged: ExistingFoundryItemLike[] = [];
  for (const item of existingItems) {
    const canonicalId = canonicalIdForExisting(item);
    if (canonicalId) {
      const items = flaggedByTarget.get(canonicalId) ?? [];
      items.push(item);
      flaggedByTarget.set(canonicalId, items);
    } else {
      unflagged.push(item);
    }
  }
  const legacyMatches = new Map<string, ExistingFoundryItemLike[]>();
  const ambiguousLegacy: Array<{ item: ExistingFoundryItemLike; candidates: NativeItemSource[] }> = [];
  for (const item of unflagged) {
    const identity = legacyIdentityFor(item);
    if (!identity) continue;
    const candidates = targets.filter((target) => targetIdentities(nativePackage, target).some((candidate) => sameIdentity(candidate, identity)));
    if (candidates.length !== 1) {
      if (candidates.length > 1) ambiguousLegacy.push({ item, candidates });
      continue;
    }
    const targetId = candidates[0]!._id;
    const items = legacyMatches.get(targetId) ?? [];
    items.push(item);
    legacyMatches.set(targetId, items);
  }
  for (const target of targets) {
    const flagged = flaggedByTarget.get(target._id) ?? [];
    const legacy = legacyMatches.get(target._id) ?? [];
    const candidates = [...flagged, ...legacy];
    if (flagged.length > 1 || candidates.length > 1) {
      actions.push(action('conflict', target, candidates, '多个现有 Item 指向同一 canonical document；迁移不能猜测保留哪个。'));
      continue;
    }
    if (candidates.length === 0) {
      actions.push(action('add', target, [], '未找到 canonical flag 或严格 legacy composite match。'));
      continue;
    }
    const current = candidates[0]!;
    if (currentLogicalHash(current) === targetLogicalHash(target)) actions.push(action('keep', target, [current], 'canonical 内容与目标一致；仅保留运行时投影。'));
    else actions.push(action('update', target, [current], flagged.length === 1 ? 'canonical flag 已识别，但编译内容已漂移。' : '严格 source/class/subclass/level/name legacy match 需要升级为 canonical document。'));
  }
  for (const { item, candidates } of ambiguousLegacy) {
    const target = [...candidates].sort((left, right) => left._id.localeCompare(right._id, 'en'))[0]!;
    actions.push({
      action: 'conflict',
      canonicalId: 'legacy-name-ambiguity',
      targetItem: clone(target),
      existingItemIds: [item._id],
      reason: '旧 Item 名称复合匹配命中多个 canonical documents；名称歧义必须人工处理。',
      mergePolicy: clone(BLOOD_HUNTER_MERGE_POLICY),
    });
  }
  return { moduleId: nativePackage.moduleId, version: nativePackage.version, actions, mergePolicy: clone(BLOOD_HUNTER_MERGE_POLICY) };
}

export const planBloodHunterV14Migration = planNativeBloodHunterMigration;

function action(actionKind: NativeBloodHunterMigrationAction['action'], target: NativeItemSource, existing: ExistingFoundryItemLike[], reason: string): NativeBloodHunterMigrationAction {
  return {
    action: actionKind,
    canonicalId: target._id,
    targetItem: clone(target),
    existingItemIds: existing.map((item) => item._id).sort(),
    reason,
    mergePolicy: clone(BLOOD_HUNTER_MERGE_POLICY),
  };
}

function canonicalIdForExisting(item: ExistingFoundryItemLike): string | undefined {
  return stringValue(asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).bloodHunter2024).canonicalId);
}

function currentLogicalHash(item: ExistingFoundryItemLike): string {
  const metadata = asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).bloodHunter2024);
  const declared = stringValue(metadata.logicalHash);
  return declared ?? sha256(comparableItem(item));
}

function targetLogicalHash(item: NativeItemSource): string {
  return stringValue(asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).bloodHunter2024).logicalHash) ?? sha256(comparableItem(item));
}

function comparableItem(item: Pick<ExistingFoundryItemLike, 'name' | 'type' | 'system' | 'effects'>): unknown {
  const next = clone({ name: item.name, type: item.type, system: item.system ?? {}, effects: item.effects ?? [] });
  const system = asRecord(next.system);
  if (asRecord(system.uses).spent !== undefined) delete asRecord(system.uses).spent;
  delete system.levels;
  for (const activity of Object.values(asRecord(system.activities))) delete asRecord(asRecord(activity).uses).spent;
  for (const advancement of Object.values(asRecord(system.advancement))) delete asRecord(advancement).value;
  return next;
}

function legacyIdentityFor(item: ExistingFoundryItemLike): BloodHunterSourceIdentity | undefined {
  const explicit = asRecord(item.legacyIdentity);
  const plutonium = asRecord(asRecord(item.flags).plutonium);
  const raw = Object.keys(explicit).length > 0 ? explicit : plutonium;
  const source = stringValue(raw.source) ?? stringValue(asRecord(item.system?.source).custom);
  if (source !== 'BloodHunter2024') return undefined;
  const name = stringValue(raw.name) ?? item.name;
  if (!stringValue(name)) return undefined;
  const level = typeof raw.level === 'number' ? raw.level : undefined;
  return {
    source,
    group: (stringValue(raw.group) as BloodHunterSourceIdentity['group']) ?? 'optionalfeature',
    className: stringValue(raw.className),
    subclassShortName: stringValue(raw.subclassShortName),
    level,
    normalizedName: normalizeName(name),
  };
}

function targetIdentities(nativePackage: NativeBloodHunterPackage, target: NativeItemSource): BloodHunterSourceIdentity[] {
  const metadata = asRecord(asRecord(asRecord(target.flags).fvttJsonGenerator).bloodHunter2024);
  const own = asRecord(metadata.sourceIdentity) as unknown as BloodHunterSourceIdentity;
  const fromLedger = nativePackage.coverageLedger
    .filter((entry) => entry.canonicalDocumentId === target._id)
    .map((entry) => entry.sourceIdentity);
  return [own, ...fromLedger].filter((identity) => stringValue(identity?.source) !== undefined);
}

function sameIdentity(left: BloodHunterSourceIdentity, right: BloodHunterSourceIdentity): boolean {
  return left.source === right.source
    && left.className === right.className
    && left.subclassShortName === right.subclassShortName
    && left.level === right.level
    && left.normalizedName === right.normalizedName;
}
