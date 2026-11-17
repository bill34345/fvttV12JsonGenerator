import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { ItemContainerData, ItemEnchantmentData, ItemSpellScrollData, ItemSpellStorageData, ItemSummonData, ItemTimedSpeedData } from '@fvtt-json-generator/models/item';
import type { IconWorkflowOptions } from '@fvtt-json-generator/workflows/icon-port';

export type ItemIntakeStatus = 'accepted' | 'needs_review' | 'failed';
export type ItemIntakeClaimKind = 'explicit' | 'preserved-literal' | 'user-confirmed';

export interface ItemIntakeClaim {
  path: string;
  valueKind: ItemIntakeClaimKind;
  evidence: EvidenceRef[];
  value?: unknown;
}

export interface ItemIntakeCoverage extends EvidenceRef {
  classification: 'mechanical' | 'narrative' | 'ignored-with-reason';
  claimPaths: string[];
  reason?: string;
}

export interface ItemIntakeUncertainty {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  evidence: EvidenceRef[];
  candidates?: unknown[];
}

export const ITEM_INTAKE_RECOVERY_PERIODS = ['lr', 'sr', 'dawn', 'dusk', 'day'] as const;

export type ItemIntakeRecoveryPeriod = typeof ITEM_INTAKE_RECOVERY_PERIODS[number];

export type ItemIntakeRecovery =
  | { period: ItemIntakeRecoveryPeriod; type: 'recoverAll' }
  | { period: ItemIntakeRecoveryPeriod; type: 'formula'; formula: string };

export interface ItemIntakeUses {
  max: number;
  recovery: ItemIntakeRecovery[];
}

export interface ItemIntakePassiveAcAbility {
  id: string;
  kind: 'passive-ac';
  value: number;
  evidence: EvidenceRef[];
}

export interface ItemIntakeLightAbility {
  id: string;
  kind: 'light';
  activation: 'action' | 'bonus' | 'reaction' | 'free';
  consumption: 0;
  bright: number;
  /** The outer dim-light edge, not a distance additional to bright light. */
  dim: number;
  extinguish: 'disable-effect';
  evidence: EvidenceRef[];
}

export interface ItemIntakeSpellAbility {
  id: string;
  kind: 'spell';
  activation: 'action' | 'bonus' | 'reaction' | 'free';
  consumption: number;
  activityUses?: ItemIntakeUses;
  level?: number;
  saveDc?: number;
  /** Total source charge cap when one added charge raises the spell by one level. */
  maxCharges?: number;
  activationOverride?: true;
  spell: {
    identifier: string;
    name: string;
  };
  evidence: EvidenceRef[];
}

export const ITEM_DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'] as const;
export const ITEM_MOVEMENT_TYPES = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const;
export const ITEM_ROLL_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export const ITEM_ACTIVATION_TYPES = ['action', 'bonus', 'reaction', 'free'] as const;

type ItemDamageType = typeof ITEM_DAMAGE_TYPES[number];
type ItemRollAbility = typeof ITEM_ROLL_ABILITIES[number];
type ItemActivationType = typeof ITEM_ACTIVATION_TYPES[number];

interface ItemIntakeNamedAbility {
  id: string;
  name?: string;
  englishName?: string;
  evidence: EvidenceRef[];
}

export interface ItemIntakeHealAbility extends ItemIntakeNamedAbility {
  kind: 'heal';
  activation: 'action' | 'bonus';
  formula: string;
  target: 'self' | 'creature';
  range?: number;
  consumption: 1;
}

export interface ItemIntakeDamage {
  formula: string;
  type: ItemDamageType;
  scaling?: { mode: 'whole' | 'half'; number: number };
}

export interface ItemIntakeTarget {
  type: 'creature' | 'self';
  count: number;
  special?: string;
}

export interface ItemIntakeAttackAbility extends ItemIntakeNamedAbility {
  kind: 'attack';
  activation: ItemActivationType;
  attackType: 'mwak' | 'rwak' | 'msak' | 'rsak';
  ability?: ItemRollAbility;
  toHit?: number;
  range: string;
  target?: ItemIntakeTarget;
  damage: ItemIntakeDamage[];
}

export interface ItemIntakeRange {
  value: number;
  units: 'ft' | 'self';
}

export interface ItemIntakeDuration {
  value: number;
  units: 'round' | 'minute' | 'hour';
  concentration: boolean;
}

export interface ItemIntakeSaveAbility extends ItemIntakeNamedAbility {
  kind: 'save';
  activation: ItemActivationType;
  ability: ItemRollAbility;
  dc: number;
  outcome: 'none' | 'half' | 'full';
  consumption: number;
  scaleMax?: number;
  damage: ItemIntakeDamage[];
  range?: ItemIntakeRange;
  target?: ItemIntakeTarget;
  duration?: ItemIntakeDuration;
}

export interface ItemIntakeUtilityAbility extends ItemIntakeNamedAbility {
  kind: 'utility';
  activation: ItemActivationType;
  consumption: number;
  trigger?: string;
  range?: ItemIntakeRange;
  duration?: ItemIntakeDuration;
  target?: ItemIntakeTarget & { template?: { type: 'radius' | 'sphere'; size: number; units: 'ft' } };
}

export type ItemIntakePassiveAbility =
  | { id: string; kind: 'passive-save'; value: number; evidence: EvidenceRef[] }
  | { id: string; kind: 'passive-resistance'; damageType: ItemDamageType; evidence: EvidenceRef[] }
  | { id: string; kind: 'passive-movement'; movement: typeof ITEM_MOVEMENT_TYPES[number]; value: number; evidence: EvidenceRef[] }
  | { id: string; kind: 'weapon-bonus'; baseItem: string; value: number; evidence: EvidenceRef[] };

export type ItemIntakeAbility =
  | ItemIntakePassiveAcAbility
  | ItemIntakePassiveAbility
  | ItemIntakeLightAbility
  | ItemIntakeSpellAbility
  | ItemIntakeHealAbility
  | ItemIntakeAttackAbility
  | ItemIntakeSaveAbility
  | ItemIntakeUtilityAbility
  | (ItemSpellScrollData & { id: string; kind: 'spell-scroll'; evidence: EvidenceRef[] })
  | (ItemContainerData & { id: string; kind: 'container'; evidence: EvidenceRef[] })
  | (ItemEnchantmentData & { id: string; evidence: EvidenceRef[] })
  | (ItemSpellStorageData & { kind: 'spell-storage'; id: string; evidence: EvidenceRef[] })
  | (ItemTimedSpeedData & { kind: 'timed-speed'; id: string; evidence: EvidenceRef[] })
  | (ItemSummonData & { kind: 'summon-creature'; id: string; evidence: EvidenceRef[] });

export interface ItemIntakeIR {
  schemaVersion: 1;
  source: { sha256: string; length: number };
  item: {
    name: string;
    englishName?: string;
    type: string;
    rarity?: string;
    attunement?: 'required' | 'optional' | 'none';
    /** Source stage labels are preserved, but Item stages still project through the existing parser. */
    stages?: Array<{ name: string; evidence: EvidenceRef[] }>;
    uses?: ItemIntakeUses;
    abilities: ItemIntakeAbility[];
  };
  claims: ItemIntakeClaim[];
  coverage: ItemIntakeCoverage[];
  uncertainties: ItemIntakeUncertainty[];
}

export interface ItemDiscoveryCandidate extends EvidenceRef {
  id: string;
  label: string;
}

export interface ItemDiscoveryRequest {
  source: string;
  sourceSha256: string;
}

export interface ItemDiscoveryResult {
  schemaVersion: 1;
  candidates: ItemDiscoveryCandidate[];
}

export interface ItemSpellCatalogHint {
  name: string;
  identifier: string;
  level: number;
  activation: string;
  verifiedDamageVariant?: string;
}

export interface ItemExtractionRequest {
  source: string;
  sourceSha256: string;
  candidate: ItemDiscoveryCandidate;
  spellCatalog?: ItemSpellCatalogHint[];
}

export interface ItemIntakeFinding {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin: 'schema' | 'evidence' | 'coverage' | 'semantic' | 'provider' | 'ai-review' | 'conflict';
  evidence?: EvidenceRef[];
  candidates?: unknown[];
}

export interface ItemIntakeValidationResult {
  findings: ItemIntakeFinding[];
  blocking: ItemIntakeFinding[];
  warnings: ItemIntakeFinding[];
}

export interface ItemReviewRequest {
  source: string;
  candidate: ItemDiscoveryCandidate;
  ir: ItemIntakeIR;
  markdown: string;
  itemProjection: unknown;
  deterministicFindings: ItemIntakeFinding[];
}

export interface ItemAiReviewResult {
  schemaVersion: 1;
  verdict: 'accepted' | 'revise' | 'needs_review';
  findings: ItemIntakeFinding[];
}

export interface ItemRepairRequest {
  source: string;
  candidate: ItemDiscoveryCandidate;
  ir: ItemIntakeIR;
  deterministicFindings: ItemIntakeFinding[];
  spellCatalog?: ItemSpellCatalogHint[];
  review?: ItemAiReviewResult;
}

export interface ItemIntakeAiProvider {
  readonly providerName: string;
  readonly extractionModel: string;
  readonly reviewModel: string;
  discover(request: ItemDiscoveryRequest): Promise<ItemDiscoveryResult>;
  extract(request: ItemExtractionRequest): Promise<ItemIntakeIR>;
  review(request: ItemReviewRequest): Promise<ItemAiReviewResult>;
  repair(request: ItemRepairRequest): Promise<ItemIntakeIR>;
}

export interface ItemIntakeOptions {
  source: string;
  sourceName: string;
  runRoot?: string;
  vaultPath?: string;
  dryRun?: boolean;
  fvttVersion?: Extract<FvttTargetVersion, '14'>;
  effectProfile?: Extract<EffectProfile, 'core'>;
  replaceConflicts?: Set<string>;
  iconOptions?: IconWorkflowOptions;
}

export interface ItemIntakeResultEntry {
  id: string;
  label: string;
  status: ItemIntakeStatus;
  bundlePath: string;
  findings: ItemIntakeFinding[];
  calls: { discovery: number; extraction: number; review: number; repair: number };
  markdownPath?: string;
  itemPath?: string;
}

export interface ItemIntakeRunResult {
  runId: string;
  sourceSha256: string;
  runPath: string;
  status: 'succeeded' | 'needs_review' | 'partial' | 'failed' | 'dry_run';
  items: ItemIntakeResultEntry[];
  discoveryCount: number;
  estimatedMaxCalls?: number;
}

export interface ItemIntakeDecisionsFile {
  runId: string;
  sourceSha256: string;
  decisions: Array<{
    issueId: string;
    action: 'set' | 'preserve-literal' | 'exclude' | 'replace';
    value?: unknown;
    note?: string;
  }>;
}
