import {
  logicalSpellRefKey,
  hashManagedProjection,
  RESOLVER_MODULE_ID,
  sha256,
  type PortableSpellRef,
  type PortableSpellcastingGroup,
  type PreservedSpellRestriction,
} from '../../core/spell-resolution';

const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;
const COMPENDIUM_SPELL_UUID = /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16}$/;

export interface ResolverGeneratedIdentity {
  manifestId: string;
  groupId: string;
  refId: string;
  featureId: string;
}

export interface ResolverManagedIdentity extends ResolverGeneratedIdentity {
  logicalRefKey: string;
  selectedUuid: string;
  activityId: string;
}

export interface ResolverManagedFlags extends ResolverManagedIdentity {
  managed: true;
  documentType: 'activity' | 'spell';
  transactionId?: string;
  generatedContentHash?: string;
  protected?: true;
}

export interface NativeCastActivitySource {
  _id: string;
  type: 'cast';
  name: string;
  consumption: {
    spellSlot: false;
    targets: Array<{ type: 'activityUses'; value: '1' }>;
  };
  uses?: {
    spent: 0;
    max: '1';
    recovery: [{ period: 'day'; type: 'recoverAll' }];
  };
  target?: {
    override: true;
    prompt: false;
    affects: { type: 'self'; choice: false };
  };
  spell: {
    uuid: string;
    ability?: PortableSpellcastingGroup['ability'];
    challenge: { override: boolean; attack?: string; save?: string };
    properties: string[];
    spellbook: true;
  };
  flags: Record<string, unknown> & {
    [RESOLVER_MODULE_ID]: ResolverManagedFlags;
  };
}

export interface LiteralRestrictionReport {
  manifestId: string;
  groupId: string;
  refId: string;
  kind: PreservedSpellRestriction['kind'];
  text: string;
  value?: string | number | boolean;
  status: 'literal-unsupported';
}

export interface BuildCastActivitySourceInput {
  manifestId: string;
  featureId: string;
  group: PortableSpellcastingGroup;
  ref: PortableSpellRef;
  selectedUuid: string;
}

export interface BuiltCastActivitySource {
  activity: NativeCastActivitySource;
  identity: ResolverManagedIdentity;
  literalRestrictions: LiteralRestrictionReport[];
}

/**
 * Schema-derived Foundry Document IDs. Display names are deliberately absent
 * from the identity tuple so localization and user-facing renames are inert.
 */
export function generatedResolverDocumentId(identity: ResolverGeneratedIdentity, kind: 'activity' | 'spell'): string {
  assertNonEmpty(identity.manifestId, 'manifestId');
  assertNonEmpty(identity.groupId, 'groupId');
  assertNonEmpty(identity.refId, 'refId');
  if (!FOUNDRY_ID.test(identity.featureId)) {
    throw new TypeError('featureId must satisfy Foundry\'s 16-character alphanumeric Document ID contract.');
  }
  return sha256(JSON.stringify([
    'fvtt-json-generator-spell-resolver-v1', kind,
    identity.manifestId, identity.groupId, identity.refId, identity.featureId,
  ])).slice(0, 16);
}

/**
 * Build the raw dnd5e 5.3.3 Cast Activity source. challenge attack/save stay
 * strings here; Foundry NumberField normalizes them only on the prepared model.
 */
export function buildCastActivitySource(input: BuildCastActivitySourceInput): BuiltCastActivitySource {
  if (!input || typeof input !== 'object') throw new TypeError('Cast Activity input is required.');
  assertNonEmpty(input.manifestId, 'manifestId');
  if (!FOUNDRY_ID.test(input.featureId)) throw new TypeError('featureId must satisfy Foundry\'s 16-character alphanumeric Document ID contract.');
  if (!COMPENDIUM_SPELL_UUID.test(input.selectedUuid)) throw new TypeError('selectedUuid must be a Compendium Spell Item UUID.');
  if (!input.group || !input.ref) throw new TypeError('Manifest group and ref are required.');
  assertNonEmpty(input.group.groupId, 'groupId');
  assertNonEmpty(input.ref.refId, 'refId');
  if (input.group.spellRefs.filter((entry) => entry.refId === input.ref.refId).length !== 1) {
    throw new TypeError('refId must identify exactly one ref in the supplied manifest group.');
  }
  if (input.ref.method !== 'at-will' && input.ref.method !== 'innate') {
    throw new TypeError(`Unsupported Cast method ${input.ref.method}; Task 7 only encodes source-evidenced innate/at-will casting.`);
  }

  const generatedIdentity: ResolverGeneratedIdentity = {
    manifestId: input.manifestId,
    groupId: input.group.groupId,
    refId: input.ref.refId,
    featureId: input.featureId,
  };
  const activityId = generatedResolverDocumentId(generatedIdentity, 'activity');
  const identity: ResolverManagedIdentity = {
    ...generatedIdentity,
    logicalRefKey: logicalSpellRefKey(input.manifestId, input.group.groupId, input.ref.refId),
    selectedUuid: input.selectedUuid,
    activityId,
  };

  const consumption: NativeCastActivitySource['consumption'] = { spellSlot: false, targets: [] };
  let uses: NativeCastActivitySource['uses'];
  if (input.ref.uses !== undefined) {
    if (input.ref.uses.value !== 1 || input.ref.uses.recovery !== 'day' || input.ref.uses.shared) {
      throw new TypeError('Task 7 supports only source-evidenced independent 1/day Activity uses.');
    }
    uses = { spent: 0, max: '1', recovery: [{ period: 'day', type: 'recoverAll' }] };
    consumption.targets = [{ type: 'activityUses', value: '1' }];
  } else if (input.ref.method !== 'at-will') {
    throw new TypeError('Innate Cast refs without an explicit supported use contract fail closed.');
  }

  const selfTarget = input.ref.restrictions.find(isExactSelfTarget);
  const literalRestrictions = input.ref.restrictions
    .filter((restriction) => restriction !== selfTarget)
    .map((restriction) => ({
      manifestId: input.manifestId,
      groupId: input.group.groupId,
      refId: input.ref.refId,
      kind: restriction.kind,
      text: restriction.text,
      ...(restriction.value === undefined ? {} : { value: restriction.value }),
      status: 'literal-unsupported' as const,
    }));

  const challenge = {
    override: input.group.attackBonus !== undefined || input.group.saveDc !== undefined,
    ...(input.group.attackBonus === undefined ? {} : { attack: String(input.group.attackBonus) }),
    ...(input.group.saveDc === undefined ? {} : { save: String(input.group.saveDc) }),
  };
  const activity: NativeCastActivitySource = {
    _id: activityId,
    type: 'cast',
    name: input.ref.englishName ?? input.ref.chineseName ?? input.ref.originalName,
    consumption,
    ...(uses === undefined ? {} : { uses }),
    ...(selfTarget === undefined ? {} : {
      target: { override: true, prompt: false, affects: { type: 'self', choice: false } },
    }),
    spell: {
      uuid: input.selectedUuid,
      ...(input.group.ability === undefined ? {} : { ability: input.group.ability }),
      challenge,
      // Cast spell.properties is the ignored-component set. [] means preserve
      // all source requirements; [material] waives only material components.
      properties: input.ref.ignoresMaterialComponents ? ['material'] : [],
      spellbook: true,
    },
    flags: {
      [RESOLVER_MODULE_ID]: {
        managed: true,
        documentType: 'activity',
        ...identity,
      },
    },
  };
  activity.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activity);
  return { activity, identity, literalRestrictions };
}

export function computeManagedSourceHash(source: unknown): string {
  return hashManagedProjection(source);
}

function isExactSelfTarget(restriction: PreservedSpellRestriction): boolean {
  if (restriction.kind !== 'target') return false;
  const candidates = [restriction.value, restriction.text]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, ' '));
  return candidates.some((value) => new Set([
    'self', 'self only', 'only self', '自身', '仅自身', '只限自身', '仅限自身',
  ]).has(value));
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string.`);
}
