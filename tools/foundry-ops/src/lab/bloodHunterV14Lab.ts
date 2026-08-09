/**
 * Blood Hunter 2024 v14 Lab acceptance contracts.
 *
 * This file is deliberately an evidence/plan boundary.  It does not start a
 * Foundry process, connect to a port, open LevelDB, mutate a world, or delete
 * test data.  Callers must supply read-only observations and the functions
 * return a fail-closed report when an observation is missing or drifted.
 */

export type JsonRecord = Record<string, unknown>;

export const BLOOD_HUNTER_V14_MODULE_ID = 'fvtt-blood-hunter-2024' as const;
export const BLOOD_HUNTER_V14_MODULE_VERSION = '1.0.0' as const;
export const BLOOD_HUNTER_V14_FOUNDRY_VERSION = '14.364' as const;
export const BLOOD_HUNTER_V14_DND5E_VERSION = '5.3.3' as const;
export const BLOOD_HUNTER_V14_MATRIX_WORLD_ID = 'fvtt-v14-module-matrix' as const;
export const BLOOD_HUNTER_V14_PORT = 30001 as const;
export const BLOOD_HUNTER_V14_EXPECTED_OWNER = 'blood-hunter-v14-lab' as const;
export const BLOOD_HUNTER_V14_SOURCE = 'BloodHunter2024' as const;
export const BLOOD_HUNTER_V14_CLASS_NAME = '血猎手' as const;
export const BLOOD_HUNTER_V14_DAWN_RITE_NAME = '破晓血仪' as const;
export const BLOOD_HUNTER_V14_DAWN_RITE_ENGLISH_NAME = 'Rite of the Dawn' as const;

// Short aliases are kept for tests and Lab callers that use the package-level
// naming convention.  They are constants, not a second compatibility surface.
export const BLOOD_HUNTER_MODULE_ID = BLOOD_HUNTER_V14_MODULE_ID;
export const BLOOD_HUNTER_MODULE_VERSION = BLOOD_HUNTER_V14_MODULE_VERSION;
export const BLOOD_HUNTER_FOUNDRY_VERSION = BLOOD_HUNTER_V14_FOUNDRY_VERSION;
export const BLOOD_HUNTER_DND5E_VERSION = BLOOD_HUNTER_V14_DND5E_VERSION;
export const BLOOD_HUNTER_MATRIX_WORLD_ID = BLOOD_HUNTER_V14_MATRIX_WORLD_ID;

export const BLOOD_HUNTER_V14_PACK_IDS = ['classes', 'subclasses', 'features'] as const;
export type BloodHunterV14PackId = typeof BLOOD_HUNTER_V14_PACK_IDS[number];

export const BLOOD_HUNTER_V14_PACK_DECLARATIONS = [
  {
    id: 'classes',
    name: 'classes',
    label: 'Classes',
    path: 'packs/classes',
    type: 'Item',
    system: 'dnd5e',
  },
  {
    id: 'subclasses',
    name: 'subclasses',
    label: 'Subclasses',
    path: 'packs/subclasses',
    type: 'Item',
    system: 'dnd5e',
  },
  {
    id: 'features',
    name: 'features',
    label: 'Features',
    path: 'packs/features',
    type: 'Item',
    system: 'dnd5e',
  },
] as const;

export const BLOOD_HUNTER_V14_SUBCLASSES = [
  { shortName: '弑灵', name: '弑灵结社', englishName: 'Order of the Ghostslayer' },
  { shortName: '渎魂', name: '渎魂结社', englishName: 'Order of the Profane Soul' },
  { shortName: '突变', name: '突变结社', englishName: 'Order of the Mutant' },
  { shortName: '化狼', name: '化狼结社', englishName: 'Order of the Lycan' },
] as const;

export const BLOOD_HUNTER_V14_CHECKPOINT_LEVELS = Array.from(
  { length: 20 },
  (_unused, index) => index + 1,
) as number[];

export const BLOOD_HUNTER_V14_CORE_DISABLED_MODULE_IDS = [
  'plutonium-cn',
  'dnd5e_classpack',
  'midi-qol',
  'dae',
] as const;

export const BLOOD_HUNTER_V14_MODDED_DISABLED_MODULE_IDS = [
  'plutonium-cn',
  'dnd5e_classpack',
] as const;

export const BLOOD_HUNTER_V14_MODDED_MODULES = [
  { id: BLOOD_HUNTER_V14_MODULE_ID, version: BLOOD_HUNTER_V14_MODULE_VERSION },
  { id: 'midi-qol', version: '14.0.11' },
  { id: 'dae', version: '14.0.12' },
] as const;

export interface BloodHunterV14Finding {
  code: string;
  path: string;
  message: string;
  severity?: 'error' | 'warning';
}

export type BloodHunterV14Status = 'pass' | 'fail' | 'blocked' | 'partial' | 'pending';

export interface BloodHunterV14PortProbe {
  port?: number;
  listening?: boolean;
  pid?: number | null;
  processId?: number | null;
  owner?: string | JsonRecord;
  process?: string | JsonRecord;
  processName?: string;
  command?: string;
  [key: string]: unknown;
}

export interface BloodHunterV14InspectionInput {
  port?: BloodHunterV14PortProbe | number;
  portProbe?: BloodHunterV14PortProbe;
  listener?: BloodHunterV14PortProbe;
  expectedOwner?: string;
  expectedPortOwner?: string;
  expectedPid?: number;
  world?: JsonRecord;
  worldId?: string;
  targetWorldId?: string;
  moduleManifest?: unknown;
  manifest?: unknown;
  packs?: unknown;
  packDeclarations?: unknown;
  matrix?: unknown;
  moduleMatrix?: unknown;
  [key: string]: unknown;
}

export interface BloodHunterV14ModuleSpec {
  id: string;
  version?: string;
}

export interface BloodHunterV14MatrixProfilePlan {
  profile: 'core' | 'modded';
  system: { id: 'dnd5e'; version: typeof BLOOD_HUNTER_V14_DND5E_VERSION };
  enabledModules: BloodHunterV14ModuleSpec[];
  disabledModules: string[];
  enabledModuleIds: string[];
  disabledModuleIds: string[];
  exactModuleSet: string[];
  writePerformed: false;
}

export interface BloodHunterV14InspectionResult {
  ok: boolean;
  status: BloodHunterV14Status;
  verdict: 'READY' | 'GATED';
  gate?: string;
  findings: BloodHunterV14Finding[];
  errors: string[];
  port: {
    expectedPort: typeof BLOOD_HUNTER_V14_PORT;
    listening: boolean;
    pid?: number;
    owner?: string;
    ownerMatches: boolean;
  };
  world: { id?: string; matchesMatrixWorld: boolean };
  manifest: { moduleId?: string; version?: string; packs: string[]; matches: boolean };
  matrix: { core: boolean; modded: boolean };
}

export interface BloodHunterV14MatrixPlanInput {
  world?: JsonRecord;
  worldId?: string;
  targetWorldId?: string;
  [key: string]: unknown;
}

export interface BloodHunterV14MatrixPlan {
  ok: boolean;
  status: BloodHunterV14Status;
  verdict: 'PLAN_ONLY' | 'BLOCKED';
  gate?: string;
  findings: BloodHunterV14Finding[];
  errors: string[];
  worldId?: string;
  targetWorldId: typeof BLOOD_HUNTER_V14_MATRIX_WORLD_ID;
  writePerformed: false;
  profiles: {
    core: BloodHunterV14MatrixProfilePlan;
    modded: BloodHunterV14MatrixProfilePlan;
  };
  core: BloodHunterV14MatrixProfilePlan;
  modded: BloodHunterV14MatrixProfilePlan;
  operations: readonly ['prepare-plan', 'no-world-write'];
}

export interface BloodHunterV14ActorExpectation {
  className?: string;
  class?: string;
  classId?: string;
  subclass?: string;
  subclassName?: string;
  subclassShortName?: string;
  subclassId?: string;
  level?: number;
  actorLevel?: number;
  checkpointLevel?: number;
  levelCheckpoints?: readonly number[];
  checkpointLevels?: readonly number[];
  checkpoints?: unknown;
  cumulativeFixedGrants?: unknown;
  fixedGrants?: unknown;
  expectedChoices?: unknown;
  requiredChoices?: unknown;
  choices?: unknown;
  preserveChoices?: boolean;
  [key: string]: unknown;
}

export interface BloodHunterV14ActorVerificationResult {
  ok: boolean;
  status: BloodHunterV14Status;
  verdict: 'PASS' | 'FAIL';
  findings: BloodHunterV14Finding[];
  errors: string[];
  metrics: {
    itemCount: number;
    bloodHunterItemCount: number;
    canonicalItemCount: number;
    duplicateCanonicalCount: number;
    activityCount: number;
    effectCount: number;
    danglingActivityEffectReferences: number;
    level?: number;
    className?: string;
    subclassShortName?: string;
    dawnRite: { itemCount: number; activityCount: number; effectCount: number };
  };
}

export interface BloodHunterV14MigrationInput {
  originalActor?: unknown;
  original?: unknown;
  before?: unknown;
  previewOriginalActor?: unknown;
  previewActor?: unknown;
  preview?: unknown;
  copySourceActor?: unknown;
  copyOriginalActor?: unknown;
  copyActor?: unknown;
  copiedActor?: unknown;
  afterCopy?: unknown;
  copy?: unknown;
  applyActor?: unknown;
  appliedActor?: unknown;
  apply?: unknown;
  rollbackActor?: unknown;
  rolledBackActor?: unknown;
  rollback?: unknown;
  [key: string]: unknown;
}

export interface BloodHunterV14MigrationVerificationResult {
  ok: boolean;
  status: BloodHunterV14Status;
  verdict: 'PASS' | 'FAIL';
  findings: BloodHunterV14Finding[];
  errors: string[];
  metrics: {
    previewOriginalUnchanged: boolean;
    copySourceUnchanged: boolean;
    originalPassive: { activities: number; effects: number };
    copyCanonicalPassive: { activities: number; effects: number };
    duplicateCanonicalCount: number;
    nonBloodHunterProjectionUnchanged: boolean;
    levelUnchanged: boolean;
    hpUnchanged: boolean;
    usesUnchanged: boolean;
    choicesUnchanged: boolean;
    ownershipUnchanged: boolean;
    rollbackRestored: boolean;
  };
}

export interface BloodHunterV14E2EManifestInput {
  runId?: string;
  run?: JsonRecord;
  actorIds?: unknown;
  tokenIds?: unknown;
  messageIds?: unknown;
  templateIds?: unknown;
  ownPids?: unknown;
  tracked?: JsonRecord;
  resources?: JsonRecord;
  matrixEvidence?: unknown;
  checkpointEvidence?: unknown;
  activityEvidence?: unknown;
  uiEvidence?: unknown;
  uiOperations?: unknown;
  runtimeEvidence?: unknown;
  runtimeOperations?: unknown;
  migrationEvidence?: unknown;
  migration?: unknown;
  exportEvidence?: unknown;
  export?: unknown;
  cleanupEvidence?: unknown;
  cleanup?: unknown;
  counterexampleEvidence?: unknown;
  counterexamples?: unknown;
  packIndexApiProbe?: unknown;
  [key: string]: unknown;
}

export interface BloodHunterV14E2EManifest {
  runId: string;
  verdict: 'E2E PASS' | 'PARTIAL' | 'BLOCKED';
  e2ePassEligible: boolean;
  acceptanceRule: string;
  target: {
    moduleId: typeof BLOOD_HUNTER_V14_MODULE_ID;
    moduleVersion: typeof BLOOD_HUNTER_V14_MODULE_VERSION;
    foundry: typeof BLOOD_HUNTER_V14_FOUNDRY_VERSION;
    dnd5e: typeof BLOOD_HUNTER_V14_DND5E_VERSION;
    worldId: typeof BLOOD_HUNTER_V14_MATRIX_WORLD_ID;
  };
  checkpoints: Array<{
    subclassShortName: string;
    subclassName: string;
    englishName: string;
    levels: Array<{ level: number; status: BloodHunterV14Status; evidenceId?: string }>;
  }>;
  activityFamilies: Array<{ id: string; label: string; status: BloodHunterV14Status; evidence?: unknown }>;
  counterexamples: Array<{ id: string; description: string; status: BloodHunterV14Status; evidence?: unknown }>;
  phases: {
    matrix: { status: BloodHunterV14Status; core: unknown; modded: unknown };
    uiOperations: { status: BloodHunterV14Status; evidence?: unknown };
    runtimeOperations: { status: BloodHunterV14Status; evidence?: unknown };
    migration: { status: BloodHunterV14Status; evidence?: unknown };
    export: { status: BloodHunterV14Status; evidence?: unknown };
    cleanup: { status: BloodHunterV14Status; evidence?: unknown };
  };
  packIndexApiProbe: {
    status: 'Partial';
    e2ePassEligible: false;
    evidence?: unknown;
    reason: string;
  };
  tracked: {
    actorIds: string[];
    tokenIds: string[];
    messageIds: string[];
    templateIds: string[];
    ownPids: number[];
  };
  cleanupAllowlist: {
    actorIds: string[];
    tokenIds: string[];
    messageIds: string[];
    templateIds: string[];
    stopPids: number[];
    onlyOwnPid: boolean;
    broadTargetRejected: boolean;
  };
  findings: BloodHunterV14Finding[];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function addFinding(
  findings: BloodHunterV14Finding[],
  code: string,
  path: string,
  message: string,
  severity: BloodHunterV14Finding['severity'] = 'error',
): void {
  findings.push({ code, path, message, severity });
}

function resultErrors(findings: readonly BloodHunterV14Finding[]): string[] {
  return findings.filter((finding) => finding.severity !== 'warning').map((finding) => finding.message);
}

function statusForFindings(findings: readonly BloodHunterV14Finding[], blockedCodes: readonly string[] = []): BloodHunterV14Status {
  if (findings.length === 0) return 'pass';
  if (findings.some((finding) => blockedCodes.includes(finding.code))) return 'blocked';
  return 'fail';
}

function normalizedLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[\s_:/\\().,'’'-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sameLabel(left: unknown, right: unknown): boolean {
  const a = normalizedLabel(left);
  const b = normalizedLabel(right);
  return a.length > 0 && a === b;
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }
  return String(value);
}

function valuesFromContainer(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => isRecord(entry)
    ? [{ ...entry, ...(stringValue(entry._id) ? {} : { _id: key }) }]
    : []);
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => stringsFrom(entry));
  if (isRecord(value)) return Object.entries(value).flatMap(([key, entry]) => [key, ...stringsFrom(entry)]);
  return [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort((left, right) => left.localeCompare(right, 'en'));
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((left, right) => left - right);
}

function normalizeModuleId(value: unknown): string | undefined {
  const id = stringValue(value);
  if (!id) return undefined;
  const normalized = id.trim().toLocaleLowerCase('en');
  if (normalized === 'plutonium' || normalized === 'plutonium-cn') return 'plutonium-cn';
  if (normalized === 'oldclasspack' || normalized === 'classpack') return 'dnd5e_classpack';
  if (normalized === 'midi') return 'midi-qol';
  return id;
}

function moduleEntries(value: unknown): Array<{ id: string; version?: string; enabled?: boolean }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string') {
        const [id, version] = entry.split('@', 2);
        const normalizedId = normalizeModuleId(id);
        return normalizedId ? [{ id: normalizedId, ...(version ? { version } : {}) }] : [];
      }
      if (!isRecord(entry)) return [];
      const id = normalizeModuleId(entry.id ?? entry.moduleId ?? entry.name ?? entry.key);
      if (!id) return [];
      const version = stringValue(entry.version ?? entry.moduleVersion);
      const enabled = boolValue(entry.enabled ?? entry.active ?? entry.isActive);
      return [{ id, ...(version ? { version } : {}), ...(enabled === undefined ? {} : { enabled }) }];
    });
  }
  if (!isRecord(value)) return [];
  const directId = normalizeModuleId(value.id ?? value.moduleId ?? value.name);
  if (directId) {
    const version = stringValue(value.version ?? value.moduleVersion);
    const enabled = boolValue(value.enabled ?? value.active ?? value.isActive);
    return [{ id: directId, ...(version ? { version } : {}), ...(enabled === undefined ? {} : { enabled }) }];
  }
  return Object.entries(value).flatMap(([key, raw]) => {
    const id = normalizeModuleId(key);
    if (!id) return [];
    if (typeof raw === 'string') return [{ id, version: raw }];
    if (typeof raw === 'boolean') return [{ id, enabled: raw }];
    if (isRecord(raw)) {
      const version = stringValue(raw.version ?? raw.moduleVersion);
      const enabled = boolValue(raw.enabled ?? raw.active ?? raw.isActive);
      return [{ id, ...(version ? { version } : {}), ...(enabled === undefined ? {} : { enabled }) }];
    }
    return [{ id }];
  });
}

function moduleKey(module: BloodHunterV14ModuleSpec): string {
  return `${module.id}@${module.version ?? ''}`;
}

function moduleSet(value: readonly BloodHunterV14ModuleSpec[]): string[] {
  return uniqueStrings(value.map((entry) => moduleKey(entry)));
}

function profilePlan(profile: 'core' | 'modded'): BloodHunterV14MatrixProfilePlan {
  const enabledModules: BloodHunterV14ModuleSpec[] = profile === 'core'
    ? [{ id: BLOOD_HUNTER_V14_MODULE_ID, version: BLOOD_HUNTER_V14_MODULE_VERSION }]
    : BLOOD_HUNTER_V14_MODDED_MODULES.map((entry) => ({ ...entry }));
  const disabledModules = profile === 'core'
    ? [...BLOOD_HUNTER_V14_CORE_DISABLED_MODULE_IDS]
    : [...BLOOD_HUNTER_V14_MODDED_DISABLED_MODULE_IDS];
  return {
    profile,
    system: { id: 'dnd5e', version: BLOOD_HUNTER_V14_DND5E_VERSION },
    enabledModules,
    disabledModules,
    enabledModuleIds: enabledModules.map((entry) => entry.id),
    disabledModuleIds: [...disabledModules],
    exactModuleSet: moduleSet(enabledModules),
    writePerformed: false,
  };
}

function normalizedExpectedModuleSet(profile: 'core' | 'modded'): {
  enabled: string[];
  disabled: string[];
  system: string;
} {
  const expected = profilePlan(profile);
  return {
    enabled: moduleSet(expected.enabledModules),
    disabled: uniqueStrings(expected.disabledModules),
    system: `${expected.system.id}@${expected.system.version}`,
  };
}

function matrixProfileValue(matrix: unknown, profile: 'core' | 'modded'): unknown {
  const record = asRecord(matrix);
  return record[profile] ?? asRecord(record.profiles)[profile];
}

function normalizeMatrixProfile(value: unknown): {
  system?: { id: string; version?: string };
  enabled: BloodHunterV14ModuleSpec[];
  disabled: string[];
} {
  const profile = asRecord(value);
  const rawModules = profile.modules ?? profile.moduleSet;
  const rawEnabled = profile.enabledModules ?? profile.enabled ?? profile.activeModules ?? (
    Array.isArray(rawModules) ? rawModules : undefined
  );
  const rawDisabled = profile.disabledModules ?? profile.disabled ?? profile.inactiveModules;
  let enabled = moduleEntries(rawEnabled);
  let disabled = moduleEntries(rawDisabled).map((entry) => entry.id);
  if (!rawEnabled && isRecord(rawModules)) {
    const all = moduleEntries(rawModules);
    enabled = all.filter((entry) => entry.enabled !== false).map(({ id, version }) => ({ id, ...(version ? { version } : {}) }));
    disabled = [...disabled, ...all.filter((entry) => entry.enabled === false).map((entry) => entry.id)];
  }
  const systemRecord = asRecord(profile.system);
  let systemId = stringValue(systemRecord.id ?? profile.systemId);
  let systemVersion = stringValue(systemRecord.version ?? profile.systemVersion);
  const dnd5eEntry = enabled.find((entry) => entry.id === 'dnd5e');
  if (!systemId && dnd5eEntry) systemId = 'dnd5e';
  if (!systemVersion && dnd5eEntry) systemVersion = dnd5eEntry.version;
  enabled = enabled.filter((entry) => entry.id !== 'dnd5e' && entry.enabled !== false);
  disabled = [...disabled, ...moduleEntries(profile.modulesDisabled).map((entry) => entry.id)];
  return {
    ...(systemId ? { system: { id: systemId, ...(systemVersion ? { version: systemVersion } : {}) } } : {}),
    enabled: enabled.map(({ id, version }) => ({ id, ...(version ? { version } : {}) })),
    disabled: uniqueStrings(disabled),
  };
}

function matrixMatches(value: unknown, profileName: 'core' | 'modded', findings: BloodHunterV14Finding[], path: string): boolean {
  const expected = normalizedExpectedModuleSet(profileName);
  if (value === undefined) {
    addFinding(findings, 'MATRIX_MISSING', path, `${profileName} module matrix entry is required.`);
    return false;
  }
  const actual = normalizeMatrixProfile(value);
  const actualSystem = actual.system ? `${actual.system.id}@${actual.system.version ?? ''}` : '';
  let matches = true;
  if (actualSystem !== expected.system) {
    addFinding(findings, 'MATRIX_SYSTEM_DRIFT', `${path}.system`, `${profileName} must target dnd5e@${BLOOD_HUNTER_V14_DND5E_VERSION}; observed ${actualSystem || 'missing'}.`);
    matches = false;
  }
  if (stableSerialize(moduleSet(actual.enabled)) !== stableSerialize(expected.enabled)) {
    addFinding(findings, 'MATRIX_ENABLED_MODULE_DRIFT', `${path}.enabledModules`, `${profileName} enabled module set drifted; expected ${expected.enabled.join(', ')}.`);
    matches = false;
  }
  if (stableSerialize(uniqueStrings(actual.disabled)) !== stableSerialize(expected.disabled)) {
    addFinding(findings, 'MATRIX_DISABLED_MODULE_DRIFT', `${path}.disabledModules`, `${profileName} disabled module set drifted; expected ${expected.disabled.join(', ')}.`);
    matches = false;
  }
  return matches;
}

function manifestPackEntries(manifest: JsonRecord, override: unknown): JsonRecord[] {
  const candidate = manifest.packs ?? manifest.packDeclarations ?? override;
  return valuesFromContainer(candidate);
}

function normalizedPack(entry: JsonRecord): { id?: string; name?: string; label?: string; path?: string; type?: string; system?: string } {
  const id = stringValue(entry.id ?? entry.name ?? entry.packId);
  const name = stringValue(entry.name ?? entry.id ?? entry.packId);
  const label = stringValue(entry.label ?? entry.title);
  const path = stringValue(entry.path ?? entry.packPath);
  const type = stringValue(entry.type ?? entry.documentName);
  const system = stringValue(entry.system ?? entry.systemId);
  return { id, name, label, path, type, system };
}

function manifestMatches(manifestValue: unknown, packsOverride: unknown, findings: BloodHunterV14Finding[]): {
  matches: boolean;
  moduleId?: string;
  version?: string;
  packs: string[];
} {
  const manifest = asRecord(manifestValue);
  let matches = true;
  const moduleId = stringValue(manifest.id ?? manifest.moduleId ?? manifest.name);
  const version = stringValue(manifest.version ?? manifest.moduleVersion);
  if (moduleId !== BLOOD_HUNTER_V14_MODULE_ID) {
    addFinding(findings, 'MANIFEST_ID_DRIFT', 'moduleManifest.id', `module manifest id must be ${BLOOD_HUNTER_V14_MODULE_ID}; observed ${moduleId ?? 'missing'}.`);
    matches = false;
  }
  if (version !== BLOOD_HUNTER_V14_MODULE_VERSION) {
    addFinding(findings, 'MANIFEST_VERSION_DRIFT', 'moduleManifest.version', `module manifest version must be ${BLOOD_HUNTER_V14_MODULE_VERSION}; observed ${version ?? 'missing'}.`);
    matches = false;
  }
  const compatibility = asRecord(manifest.compatibility);
  for (const key of ['minimum', 'verified', 'maximum'] as const) {
    if (stringValue(compatibility[key]) !== BLOOD_HUNTER_V14_FOUNDRY_VERSION) {
      addFinding(findings, 'MANIFEST_FOUNDRY_DRIFT', `moduleManifest.compatibility.${key}`, `Foundry compatibility ${key} must be ${BLOOD_HUNTER_V14_FOUNDRY_VERSION}.`);
      matches = false;
    }
  }
  const relationships = asRecord(manifest.relationships);
  const systems = Array.isArray(relationships.systems) ? relationships.systems.filter(isRecord) : [];
  const dnd5eRelationship = systems.find((entry) => stringValue(entry.id) === 'dnd5e') ?? asRecord(manifest.system);
  const dnd5eCompatibility = asRecord(dnd5eRelationship.compatibility);
  const dnd5eVersion = stringValue(dnd5eRelationship.version ?? dnd5eCompatibility.verified ?? dnd5eCompatibility.maximum);
  if (stringValue(dnd5eRelationship.id) !== 'dnd5e' || dnd5eVersion !== BLOOD_HUNTER_V14_DND5E_VERSION) {
    addFinding(findings, 'MANIFEST_DND5E_DRIFT', 'moduleManifest.relationships.systems', `module manifest must declare dnd5e@${BLOOD_HUNTER_V14_DND5E_VERSION}.`);
    matches = false;
  }
  const packs = manifestPackEntries(manifest, packsOverride).map(normalizedPack);
  const packIds = packs.map((entry) => entry.id ?? '').filter(Boolean);
  if (packs.length !== BLOOD_HUNTER_V14_PACK_DECLARATIONS.length) {
    addFinding(findings, 'PACK_DECLARATION_COUNT_DRIFT', 'moduleManifest.packs', `module manifest must declare exactly ${BLOOD_HUNTER_V14_PACK_DECLARATIONS.length} packs.`);
    matches = false;
  }
  for (const expected of BLOOD_HUNTER_V14_PACK_DECLARATIONS) {
    const actual = packs.find((entry) => entry.id === expected.id);
    if (!actual) {
      addFinding(findings, 'PACK_DECLARATION_MISSING', `moduleManifest.packs.${expected.id}`, `missing Blood Hunter pack ${expected.id}.`);
      matches = false;
      continue;
    }
    for (const key of ['name', 'label', 'path', 'type', 'system'] as const) {
      if (actual[key] !== expected[key]) {
        addFinding(findings, 'PACK_DECLARATION_DRIFT', `moduleManifest.packs.${expected.id}.${key}`, `pack ${expected.id} ${key} drifted; expected ${expected[key]}.`);
        matches = false;
      }
    }
  }
  if (uniqueStrings(packIds).length !== packIds.length) {
    addFinding(findings, 'PACK_DECLARATION_DUPLICATE', 'moduleManifest.packs', 'pack declaration ids must be unique.');
    matches = false;
  }
  if (packIds.some((id) => !BLOOD_HUNTER_V14_PACK_IDS.includes(id as BloodHunterV14PackId))) {
    addFinding(findings, 'PACK_DECLARATION_EXTRA', 'moduleManifest.packs', 'module manifest contains an unexpected pack id.');
    matches = false;
  }
  return { matches, ...(moduleId ? { moduleId } : {}), ...(version ? { version } : {}), packs: uniqueStrings(packIds) };
}

function portProbe(input: BloodHunterV14InspectionInput): BloodHunterV14PortProbe {
  const candidate = input.portProbe ?? input.listener ?? input.port;
  if (typeof candidate === 'number') return { port: candidate };
  return asRecord(candidate) as BloodHunterV14PortProbe;
}

function ownerLabel(probe: BloodHunterV14PortProbe): string | undefined {
  const values = [probe.owner, probe.process, probe.processName, probe.command];
  for (const value of values) {
    const direct = stringValue(value);
    if (direct) return direct;
    const record = asRecord(value);
    const nested = stringValue(record.owner ?? record.name ?? record.command ?? record.label ?? record.id);
    if (nested) return nested;
  }
  return undefined;
}

function worldIdFrom(value: unknown): string | undefined {
  const record = asRecord(value);
  return stringValue(record.id ?? record.worldId ?? asRecord(record.world).id ?? value);
}

/** Inspect only caller-supplied observations.  It never reads the live port. */
export function inspectBloodHunterV14Lab(input: BloodHunterV14InspectionInput): BloodHunterV14InspectionResult {
  const findings: BloodHunterV14Finding[] = [];
  const probe = portProbe(input);
  const port = numberValue(probe.port) ?? BLOOD_HUNTER_V14_PORT;
  const listening = boolValue(probe.listening) ?? false;
  const pid = numberValue(probe.pid ?? probe.processId);
  const owner = ownerLabel(probe);
  const expectedOwner = stringValue(input.expectedPortOwner ?? input.expectedOwner) ?? BLOOD_HUNTER_V14_EXPECTED_OWNER;
  const ownerMatches = listening && owner !== undefined && normalizedLabel(owner) === normalizedLabel(expectedOwner);
  if (port !== BLOOD_HUNTER_V14_PORT) {
    addFinding(findings, 'PORT_NUMBER_DRIFT', 'port.port', `Blood Hunter v14 Lab expects port ${BLOOD_HUNTER_V14_PORT}; observed ${port}.`);
  }
  if (!listening) {
    addFinding(findings, 'PORT_NOT_LISTENING', 'port.listening', `port ${BLOOD_HUNTER_V14_PORT} is not listening; do not infer runtime acceptance from an absent listener.`);
  } else if (!pid || pid <= 0) {
    addFinding(findings, 'PORT_PID_MISSING', 'port.pid', `port ${BLOOD_HUNTER_V14_PORT} is listening without a verifiable PID; gate the run.`);
  } else if (!ownerMatches) {
    addFinding(
      findings,
      'PORT_OWNER_GATE',
      'port.owner',
      `GATE_PORT_OWNER_MISMATCH: port ${BLOOD_HUNTER_V14_PORT} is owned by PID ${pid} (${owner ?? 'unknown'}), not ${expectedOwner}; do not stop, reuse, connect-write, or modify that process.`,
    );
  }
  const expectedPid = numberValue(input.expectedPid);
  if (listening && expectedPid !== undefined && pid !== expectedPid) {
    addFinding(findings, 'PORT_PID_GATE', 'port.pid', `port ${BLOOD_HUNTER_V14_PORT} PID ${pid ?? 'unknown'} does not match the run-owned PID ${expectedPid}; do not stop the observed process.`);
  }

  const worldId = worldIdFrom(input.worldId ?? input.targetWorldId ?? input.world);
  const matchesMatrixWorld = worldId === BLOOD_HUNTER_V14_MATRIX_WORLD_ID;
  if (!matchesMatrixWorld) addFinding(findings, 'WORLD_ID_DRIFT', 'world.id', `inspection must target ${BLOOD_HUNTER_V14_MATRIX_WORLD_ID}; observed ${worldId ?? 'missing'}.`);

  const manifestValue = input.moduleManifest ?? input.manifest;
  if (manifestValue === undefined) addFinding(findings, 'MANIFEST_MISSING', 'moduleManifest', 'module manifest observation is required.');
  const manifest = manifestMatches(manifestValue, input.packs ?? input.packDeclarations, findings);
  const matrixValue = input.moduleMatrix ?? input.matrix;
  const coreMatrix = matrixMatches(matrixProfileValue(matrixValue, 'core'), 'core', findings, 'matrix.core');
  const moddedMatrix = matrixMatches(matrixProfileValue(matrixValue, 'modded'), 'modded', findings, 'matrix.modded');
  const status = statusForFindings(findings, ['PORT_OWNER_GATE', 'PORT_PID_GATE', 'PORT_PID_MISSING', 'PORT_NOT_LISTENING']);
  return {
    ok: findings.length === 0,
    status,
    verdict: findings.length === 0 ? 'READY' : 'GATED',
    ...(findings[0] ? { gate: findings[0].code } : {}),
    findings,
    errors: resultErrors(findings),
    port: {
      expectedPort: BLOOD_HUNTER_V14_PORT,
      listening,
      ...(pid === undefined ? {} : { pid }),
      ...(owner ? { owner } : {}),
      ownerMatches,
    },
    world: { ...(worldId ? { id: worldId } : {}), matchesMatrixWorld },
    manifest: { ...(manifest.moduleId ? { moduleId: manifest.moduleId } : {}), ...(manifest.version ? { version: manifest.version } : {}), packs: manifest.packs, matches: manifest.matches },
    matrix: { core: coreMatrix, modded: moddedMatrix },
  };
}

function matrixTargetWorldId(input: string | BloodHunterV14MatrixPlanInput): string | undefined {
  if (typeof input === 'string') return stringValue(input);
  return worldIdFrom(input.worldId ?? input.targetWorldId ?? input.world);
}

/** Build a matrix-world plan only.  This function has no write-capable branch. */
export function planBloodHunterV14MatrixWorld(input: string | BloodHunterV14MatrixPlanInput): BloodHunterV14MatrixPlan {
  const findings: BloodHunterV14Finding[] = [];
  const worldId = matrixTargetWorldId(input);
  if (worldId !== BLOOD_HUNTER_V14_MATRIX_WORLD_ID) {
    addFinding(findings, 'MATRIX_WORLD_GATE', 'world.id', `matrix plan requires exactly ${BLOOD_HUNTER_V14_MATRIX_WORLD_ID}; refusing ${worldId ?? 'missing'} (including cor-cotn).`);
  }
  const core = profilePlan('core');
  const modded = profilePlan('modded');
  const status = statusForFindings(findings, ['MATRIX_WORLD_GATE']);
  return {
    ok: findings.length === 0,
    status,
    verdict: findings.length === 0 ? 'PLAN_ONLY' : 'BLOCKED',
    ...(findings[0] ? { gate: findings[0].code } : {}),
    findings,
    errors: resultErrors(findings),
    ...(worldId ? { worldId } : {}),
    targetWorldId: BLOOD_HUNTER_V14_MATRIX_WORLD_ID,
    writePerformed: false,
    profiles: { core, modded },
    core,
    modded,
    operations: ['prepare-plan', 'no-world-write'],
  };
}

function actorRecord(snapshot: unknown): JsonRecord {
  const value = asRecord(snapshot);
  const nested = value.actor ?? value.snapshot;
  return isRecord(nested) && (nested.items !== undefined || nested.system !== undefined || nested._id !== undefined)
    ? nested
    : value;
}

function actorItems(actor: JsonRecord): JsonRecord[] {
  return valuesFromContainer(actor.items ?? actor.embeddedItems ?? asRecord(actor.actor).items);
}

function metadataForItem(item: JsonRecord): JsonRecord | undefined {
  const flags = asRecord(item.flags);
  const generator = asRecord(flags.fvttJsonGenerator);
  const metadata = generator.bloodHunter2024 ?? flags.bloodHunter2024 ?? flags.bloodHunterV14;
  return isRecord(metadata) ? metadata : undefined;
}

function sourceIdentityForItem(item: JsonRecord, metadata = metadataForItem(item)): JsonRecord {
  const explicit = asRecord(metadata?.sourceIdentity);
  const legacy = asRecord(item.legacyIdentity);
  const systemSource = asRecord(asRecord(item.system).source);
  return {
    ...explicit,
    ...legacy,
    ...(stringValue(explicit.source ?? legacy.source ?? systemSource.custom) ? { source: explicit.source ?? legacy.source ?? systemSource.custom } : {}),
    ...(stringValue(explicit.normalizedName ?? legacy.normalizedName ?? item.name) ? { normalizedName: explicit.normalizedName ?? legacy.normalizedName ?? item.name } : {}),
  };
}

function isBloodHunterItem(item: JsonRecord): boolean {
  const metadata = metadataForItem(item);
  const identity = sourceIdentityForItem(item, metadata);
  const source = stringValue(identity.source) ?? stringValue(asRecord(asRecord(item.system).source).custom);
  return metadata !== undefined || source === BLOOD_HUNTER_V14_SOURCE;
}

function itemCanonicalId(item: JsonRecord): string | undefined {
  const metadata = metadataForItem(item);
  return stringValue(metadata?.canonicalId ?? (metadata ? item._id : undefined));
}

function itemSubclassShortName(item: JsonRecord): string | undefined {
  const identity = sourceIdentityForItem(item);
  return stringValue(identity.subclassShortName ?? item.subclassShortName);
}

function subclassKey(value: unknown): string | undefined {
  const label = normalizedLabel(value);
  if (!label) return undefined;
  if (label.includes('ghostslayer') || label.includes('弑灵')) return 'ghostslayer';
  if (label.includes('profane-soul') || label.includes('渎魂')) return 'profane-soul';
  if (label.includes('mutant') || label.includes('突变')) return 'mutant';
  if (label.includes('lycan') || label.includes('化狼')) return 'lycan';
  return undefined;
}

function classNameForItem(item: JsonRecord): string | undefined {
  const identity = sourceIdentityForItem(item);
  return stringValue(identity.className ?? item.className ?? item.name);
}

function isDawnRite(item: JsonRecord): boolean {
  const metadata = metadataForItem(item);
  const identity = sourceIdentityForItem(item, metadata);
  const values = [item.name, item.englishName, item.ENG_name, identity.normalizedName, metadata?.sourceKey];
  return values.some((value) => {
    const label = normalizedLabel(value);
    return label === normalizedLabel(BLOOD_HUNTER_V14_DAWN_RITE_NAME)
      || label === normalizedLabel(BLOOD_HUNTER_V14_DAWN_RITE_ENGLISH_NAME)
      || label.includes('rite-of-the-dawn')
      || label.includes('dawn-rite');
  });
}

function extractLevel(actor: JsonRecord): number | undefined {
  const system = asRecord(actor.system);
  const details = asRecord(system.details);
  const candidates = [
    actor.level,
    actor.actorLevel,
    system.level,
    system.levels,
    details.level,
    details.levels,
  ];
  return candidates.map(numberValue).find((value): value is number => value !== undefined);
}

function expectedLevel(expectation: BloodHunterV14ActorExpectation): number | undefined {
  return [expectation.level, expectation.actorLevel, expectation.checkpointLevel]
    .map(numberValue)
    .find((value): value is number => value !== undefined);
}

function expectedClass(expectation: BloodHunterV14ActorExpectation): string | undefined {
  return stringValue(expectation.className ?? expectation.class ?? expectation.classId);
}

function expectedSubclass(expectation: BloodHunterV14ActorExpectation): string | undefined {
  return stringValue(expectation.subclassShortName ?? expectation.subclassName ?? expectation.subclass ?? expectation.subclassId);
}

function actualSubclassItems(items: readonly JsonRecord[]): JsonRecord[] {
  return items.filter((item) => {
    const metadata = metadataForItem(item);
    const identity = sourceIdentityForItem(item, metadata);
    return item.type === 'subclass' || identity.group === 'subclass';
  });
}

function embeddedEntries(item: JsonRecord, key: string): JsonRecord[] {
  const system = asRecord(item.system);
  return valuesFromContainer(system[key] ?? item[key]);
}

function effectId(effect: JsonRecord): string | undefined {
  return stringValue(effect._id ?? effect.id);
}

function activityEffectReferences(activity: JsonRecord): Array<{ id?: string; invalidLegacy: boolean }> {
  const raw = activity.effects;
  if (raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      if (typeof entry === 'string') return { id: entry, invalidLegacy: false };
      const reference = asRecord(entry);
      return { id: effectId(reference), invalidLegacy: reference.foundryId !== undefined };
    });
  }
  if (isRecord(raw)) {
    return Object.entries(raw).map(([key, entry]) => {
      if (typeof entry === 'string') return { id: entry, invalidLegacy: false };
      const reference = asRecord(entry);
      return { id: effectId(reference) ?? key, invalidLegacy: reference.foundryId !== undefined };
    });
  }
  return [{ invalidLegacy: true }];
}

function inspectItemReferences(item: JsonRecord, findings: BloodHunterV14Finding[], path: string): {
  activities: JsonRecord[];
  effects: JsonRecord[];
  dangling: number;
} {
  const activities = embeddedEntries(item, 'activities');
  const effects = valuesFromContainer(item.effects);
  const effectIds = new Set<string>();
  let dangling = 0;
  for (const [index, effect] of effects.entries()) {
    const id = effectId(effect);
    if (!id) {
      addFinding(findings, 'EFFECT_ID_MISSING', `${path}.effects.${index}`, 'every top-level Effect must have a resolvable _id.');
      dangling += 1;
      continue;
    }
    if (effectIds.has(id)) {
      addFinding(findings, 'DUPLICATE_EFFECT_ID', `${path}.effects.${index}`, `duplicate Effect id ${id}.`);
      dangling += 1;
    }
    effectIds.add(id);
  }
  const activityIds = new Set<string>();
  for (const [index, activity] of activities.entries()) {
    const id = stringValue(activity._id ?? activity.id);
    if (!id) {
      addFinding(findings, 'ACTIVITY_ID_MISSING', `${path}.activities.${index}`, 'every Activity must have a resolvable _id.');
      dangling += 1;
    } else if (activityIds.has(id)) {
      addFinding(findings, 'DUPLICATE_ACTIVITY_ID', `${path}.activities.${index}`, `duplicate Activity id ${id}.`);
      dangling += 1;
    }
    if (id) activityIds.add(id);
    for (const [referenceIndex, reference] of activityEffectReferences(activity).entries()) {
      if (!reference.id || reference.invalidLegacy || !effectIds.has(reference.id)) {
        addFinding(findings, 'DANGLING_ACTIVITY_EFFECT_REFERENCE', `${path}.activities.${index}.effects.${referenceIndex}`, `Activity ${id ?? index} references an unresolved Effect ${reference.id ?? 'missing'}; foundryId side-data references are not accepted.`);
        dangling += 1;
      }
    }
  }
  return { activities, effects, dangling };
}

function canonicalItemFindings(items: readonly JsonRecord[], findings: BloodHunterV14Finding[]): {
  canonicalItems: JsonRecord[];
  duplicateCount: number;
} {
  const canonicalItems: JsonRecord[] = [];
  const ids = new Map<string, number>();
  const sourceKeys = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    if (!isBloodHunterItem(item)) continue;
    const metadata = metadataForItem(item);
    if (!metadata) {
      addFinding(findings, 'CANONICAL_FLAG_MISSING', `items.${index}.flags`, 'Blood Hunter Items must carry flags.fvttJsonGenerator.bloodHunter2024.');
      continue;
    }
    canonicalItems.push(item);
    const itemId = stringValue(item._id);
    const canonicalId = itemCanonicalId(item);
    if (!itemId || !canonicalId || canonicalId !== itemId) {
      addFinding(findings, 'CANONICAL_ID_MISMATCH', `items.${index}.flags.fvttJsonGenerator.bloodHunter2024.canonicalId`, `canonicalId must equal Item _id (${itemId ?? 'missing'}).`);
    }
    if (stringValue(metadata.moduleVersion) !== BLOOD_HUNTER_V14_MODULE_VERSION) {
      addFinding(findings, 'CANONICAL_VERSION_MISMATCH', `items.${index}.flags.fvttJsonGenerator.bloodHunter2024.moduleVersion`, `canonical metadata must target module version ${BLOOD_HUNTER_V14_MODULE_VERSION}.`);
    }
    if (!stringValue(metadata.sourceKey) || !isRecord(metadata.sourceIdentity) || !stringValue(metadata.automation)) {
      addFinding(findings, 'CANONICAL_METADATA_INCOMPLETE', `items.${index}.flags.fvttJsonGenerator.bloodHunter2024`, 'canonical metadata requires sourceKey, sourceIdentity, and automation.');
    }
    if (canonicalId) ids.set(canonicalId, (ids.get(canonicalId) ?? 0) + 1);
    const sourceKey = stringValue(metadata.sourceKey);
    if (sourceKey) sourceKeys.set(sourceKey, (sourceKeys.get(sourceKey) ?? 0) + 1);
  }
  let duplicateCount = 0;
  for (const [id, count] of ids) {
    if (count > 1) {
      duplicateCount += count - 1;
      addFinding(findings, 'DUPLICATE_CANONICAL_ITEM', 'items', `canonical Item ${id} occurs ${count} times; duplicate canonical count must be 0.`);
    }
  }
  for (const [sourceKey, count] of sourceKeys) {
    if (count > 1) {
      duplicateCount += count - 1;
      addFinding(findings, 'DUPLICATE_CANONICAL_SOURCE_KEY', 'items', `canonical sourceKey ${sourceKey} occurs ${count} times.`);
    }
  }
  return { canonicalItems, duplicateCount };
}

function itemIdentityLevel(item: JsonRecord): number | undefined {
  const identity = sourceIdentityForItem(item);
  return numberValue(identity.level ?? item.level);
}

interface GrantEvidence {
  id?: string;
  name?: string;
  level?: number;
  mode?: string;
}

function grantEvidenceFrom(value: unknown): GrantEvidence[] {
  if (Array.isArray(value)) {
    return value.flatMap<GrantEvidence>((entry: unknown): GrantEvidence[] => {
      if (typeof entry === 'string') return [{ name: entry }];
      if (typeof entry === 'number') return [{ level: entry }];
      if (!isRecord(entry)) return [];
      return [{
        id: stringValue(entry.id ?? entry._id ?? entry.canonicalId ?? entry.targetDocumentId),
        name: stringValue(entry.name ?? entry.title ?? entry.label),
        level: numberValue(entry.level),
        mode: stringValue(entry.mode ?? entry.type),
      }];
    });
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, entry]) => {
      if (typeof entry === 'number') return [{ name: key, level: entry }];
      if (typeof entry === 'string') return [{ name: entry, level: numberValue(key) }];
      if (isRecord(entry)) return grantEvidenceFrom([{ ...entry, name: entry.name ?? key }]);
      return [];
    });
  }
  return [];
}

function collectGrantEvidence(actor: JsonRecord, canonicalItems: readonly JsonRecord[]): GrantEvidence[] {
  const explicit = actor.grants ?? actor.fixedGrants ?? asRecord(actor.system).grants ?? asRecord(actor.system).fixedGrants;
  if (explicit !== undefined) return grantEvidenceFrom(explicit);
  const graph = actor.grantGraph ?? asRecord(actor.system).grantGraph;
  if (graph !== undefined) {
    const byId = new Map(canonicalItems.map((item) => [stringValue(item._id), item]));
    return grantEvidenceFrom(graph).flatMap((entry) => {
      const target = entry.id ? byId.get(entry.id) : undefined;
      const targetName = target ? stringValue(target.name) : undefined;
      return [{ ...entry, ...(targetName ? { name: targetName } : {}) }];
    });
  }
  return canonicalItems.flatMap((item) => {
    const identity = sourceIdentityForItem(item);
    const group = stringValue(identity.group);
    if (group !== 'classFeature' && group !== 'subclassFeature') return [];
    const level = itemIdentityLevel(item);
    return [{ id: itemCanonicalId(item), name: stringValue(item.name), ...(level === undefined ? {} : { level }), mode: 'grant' }];
  });
}

function currentGrantEvidence(actor: JsonRecord, canonicalItems: readonly JsonRecord[], level: number | undefined): GrantEvidence[] {
  return collectGrantEvidence(actor, canonicalItems).filter((entry) => entry.level === undefined || level === undefined || entry.level <= level);
}

function choiceEvidence(actor: JsonRecord): { tokens: string[]; byKey: Map<string, string[]> } {
  const tokens: string[] = [];
  const byKey = new Map<string, string[]>();
  const addValue = (key: string, value: unknown): void => {
    const values = stringsFrom(value);
    tokens.push(...values);
    if (key) byKey.set(normalizedLabel(key), uniqueStrings([...(byKey.get(normalizedLabel(key)) ?? []), ...values]));
  };
  const sources = [actor.choices, actor.choiceSelections, actor.preservedChoices, asRecord(actor.system).choices];
  for (const source of sources) {
    if (Array.isArray(source)) source.forEach((entry) => addValue('', entry));
    else if (isRecord(source)) Object.entries(source).forEach(([key, value]) => addValue(key, value));
  }
  const advancement = asRecord(asRecord(actor.system).advancement);
  for (const [key, raw] of Object.entries(advancement)) {
    const entry = asRecord(raw);
    if (stringValue(entry.type) !== 'ItemChoice' && entry.value === undefined && entry.selected === undefined && entry.selection === undefined) continue;
    addValue(stringValue(entry.title ?? entry.name ?? key) ?? key, entry.value ?? entry.selected ?? entry.selection ?? entry.choices);
  }
  return { tokens: uniqueStrings(tokens), byKey };
}

function expectationChoiceValues(expectation: BloodHunterV14ActorExpectation): unknown {
  return expectation.requiredChoices ?? expectation.expectedChoices ?? expectation.choices;
}

function verifyChoiceExpectation(actor: JsonRecord, expectation: BloodHunterV14ActorExpectation, findings: BloodHunterV14Finding[]): boolean {
  const expected = expectationChoiceValues(expectation);
  const evidence = choiceEvidence(actor);
  if (expected === undefined && expectation.preserveChoices !== true) return true;
  if (evidence.tokens.length === 0) {
    addFinding(findings, 'CHOICES_NOT_RETAINED', 'system.advancement', 'expected retained choice selections, but no choice evidence was present.');
    return false;
  }
  if (expected === undefined) return true;
  let matches = true;
  if (Array.isArray(expected)) {
    for (const value of expected) {
      const text = stringValue(value);
      if (text && !evidence.tokens.some((token) => sameLabel(token, text))) {
        addFinding(findings, 'CHOICE_SELECTION_MISSING', 'choices', `retained choice ${text} is missing.`);
        matches = false;
      }
    }
  } else if (isRecord(expected)) {
    for (const [key, value] of Object.entries(expected)) {
      const expectedValues = stringsFrom(value);
      const actualValues = evidence.byKey.get(normalizedLabel(key)) ?? [];
      if (expectedValues.length > 0 && !expectedValues.every((entry) => actualValues.some((actual) => sameLabel(actual, entry)) || evidence.tokens.some((actual) => sameLabel(actual, entry)))) {
        addFinding(findings, 'CHOICE_SELECTION_MISSING', `choices.${key}`, `retained selections for ${key} are incomplete.`);
        matches = false;
      } else if (expectedValues.length === 0 && !evidence.byKey.has(normalizedLabel(key)) && !evidence.tokens.some((entry) => sameLabel(entry, key))) {
        addFinding(findings, 'CHOICE_SELECTION_MISSING', `choices.${key}`, `retained choice key ${key} is missing.`);
        matches = false;
      }
    }
  } else {
    const expectedValues = stringsFrom(expected);
    if (!expectedValues.every((entry) => evidence.tokens.some((actual) => sameLabel(actual, entry)))) {
      addFinding(findings, 'CHOICE_SELECTION_MISSING', 'choices', 'one or more expected retained choices are missing.');
      matches = false;
    }
  }
  return matches;
}

function checkpointNumbers(expectation: BloodHunterV14ActorExpectation): number[] {
  const direct = expectation.levelCheckpoints ?? expectation.checkpointLevels;
  if (Array.isArray(direct)) return uniqueNumbers(direct.map(numberValue).filter((value): value is number => value !== undefined));
  if (Array.isArray(expectation.checkpoints)) {
    return uniqueNumbers(expectation.checkpoints.flatMap((value) => {
      if (typeof value === 'number') return [value];
      return [numberValue(asRecord(value).level)].filter((entry): entry is number => entry !== undefined);
    }));
  }
  if (isRecord(expectation.checkpoints)) return uniqueNumbers(Object.keys(expectation.checkpoints).map(numberValue).filter((value): value is number => value !== undefined));
  return [];
}

function fixedGrantExpectationAt(expectation: BloodHunterV14ActorExpectation, level: number): unknown {
  const cumulative = expectation.cumulativeFixedGrants;
  if (isRecord(cumulative)) return cumulative[String(level)] ?? cumulative[level];
  if (Array.isArray(cumulative)) {
    const checkpoint = cumulative.find((value) => isRecord(value) && numberValue(value.level) === level);
    return checkpoint;
  }
  if (isRecord(expectation.checkpoints)) {
    const checkpoint = asRecord(expectation.checkpoints[String(level)] ?? expectation.checkpoints[level]);
    return checkpoint.fixedGrants ?? checkpoint.cumulativeFixedGrants;
  }
  if (Array.isArray(expectation.checkpoints)) {
    const checkpoint = expectation.checkpoints.find((value) => isRecord(value) && numberValue(value.level) === level);
    const record = asRecord(checkpoint);
    return record.fixedGrants ?? record.cumulativeFixedGrants;
  }
  return undefined;
}

function verifyFixedGrants(actor: JsonRecord, canonicalItems: readonly JsonRecord[], expectation: BloodHunterV14ActorExpectation, level: number | undefined, findings: BloodHunterV14Finding[]): void {
  const checkpoints = checkpointNumbers(expectation);
  const explicitCumulative = expectation.cumulativeFixedGrants !== undefined || expectation.fixedGrants !== undefined || expectation.checkpoints !== undefined;
  if (!explicitCumulative) return;
  if (level === undefined) {
    addFinding(findings, 'LEVEL_MISSING', 'system.details.level', 'fixed-grant checkpoint verification requires an Actor level.');
    return;
  }
  const levels = checkpoints.length > 0 ? checkpoints : [level];
  const grants = currentGrantEvidence(actor, canonicalItems, level);
  for (const checkpoint of levels.filter((entry) => entry <= level)) {
    const expected = fixedGrantExpectationAt(expectation, checkpoint);
    if (expected === undefined) continue;
    const actual = currentGrantEvidence(actor, canonicalItems, checkpoint);
    if (typeof expected === 'number') {
      if (actual.length !== expected) addFinding(findings, 'FIXED_GRANT_COUNT_MISMATCH', `grants.${checkpoint}`, `cumulative fixed grant count at level ${checkpoint} must be ${expected}; observed ${actual.length}.`);
      continue;
    }
    const expectedRecord = asRecord(expected);
    const expectedCount = numberValue(expectedRecord.count ?? expectedRecord.total);
    if (expectedCount !== undefined && actual.length !== expectedCount) addFinding(findings, 'FIXED_GRANT_COUNT_MISMATCH', `grants.${checkpoint}`, `cumulative fixed grant count at level ${checkpoint} must be ${expectedCount}; observed ${actual.length}.`);
    const expectedNames = stringsFrom(expectedRecord.names ?? expectedRecord.ids ?? (Array.isArray(expected) ? expected : expected));
    for (const name of expectedNames) {
      if (!actual.some((entry) => sameLabel(entry.name ?? entry.id, name))) addFinding(findings, 'FIXED_GRANT_MISSING', `grants.${checkpoint}`, `cumulative fixed grant ${name} is missing at level ${checkpoint}.`);
    }
  }
  if (Array.isArray(expectation.fixedGrants)) {
    for (const entry of expectation.fixedGrants) {
      const record = asRecord(entry);
      const grantLevel = numberValue(record.level);
      if (grantLevel !== undefined && grantLevel > level) continue;
      const wanted = stringValue(record.id ?? record.canonicalId ?? record.name ?? record.title);
      if (wanted && !grants.some((grant) => sameLabel(grant.id ?? grant.name, wanted))) addFinding(findings, 'FIXED_GRANT_MISSING', 'fixedGrants', `fixed grant ${wanted} is missing.`);
    }
  }
}

function verifyClassAndSubclass(actor: JsonRecord, items: readonly JsonRecord[], expectation: BloodHunterV14ActorExpectation, findings: BloodHunterV14Finding[]): { className?: string; subclassShortName?: string; subclassKey?: string } {
  const classItems = items.filter((item) => {
    const identity = sourceIdentityForItem(item);
    return isBloodHunterItem(item) && (item.type === 'class' || identity.group === 'class');
  });
  if (classItems.length === 0) addFinding(findings, 'CLASS_MISSING', 'items', 'Blood Hunter class Item is missing.');
  const className = stringValue(classItems[0]?.name ?? classNameForItem(classItems[0] ?? {}));
  const wantedClass = expectedClass(expectation);
  if (wantedClass && !classItems.some((item) => sameLabel(item.name, wantedClass) || sameLabel(classNameForItem(item), wantedClass))) {
    addFinding(findings, 'CLASS_MISMATCH', 'items', `expected Blood Hunter class ${wantedClass}.`);
  }
  const subclassItems = actualSubclassItems(items.filter(isBloodHunterItem));
  if (subclassItems.length === 0) addFinding(findings, 'SUBCLASS_MISSING', 'items', 'selected Blood Hunter subclass Item is missing.');
  const subclassValue = stringValue(itemSubclassShortName(subclassItems[0] ?? {}) ?? subclassItems[0]?.name);
  const selectedKey = subclassKey(subclassValue);
  const wantedSubclass = expectedSubclass(expectation);
  const wantedKey = subclassKey(wantedSubclass);
  if (wantedSubclass && !subclassItems.some((item) => {
    const value = itemSubclassShortName(item) ?? item.name;
    return sameLabel(value, wantedSubclass) || subclassKey(value) === wantedKey || sameLabel(item.name, wantedSubclass);
  })) {
    addFinding(findings, 'SUBCLASS_MISMATCH', 'items', `expected Blood Hunter subclass ${wantedSubclass}.`);
  }
  if (subclassItems.length > 1 && new Set(subclassItems.map((item) => subclassKey(itemSubclassShortName(item) ?? item.name)).filter(Boolean)).size > 1) {
    addFinding(findings, 'MULTIPLE_SUBCLASSES', 'items', 'Actor contains more than one distinct Blood Hunter subclass.');
  }
  const expectedSelectedKey = wantedKey ?? selectedKey;
  for (const [index, item] of items.entries()) {
    if (!isBloodHunterItem(item)) continue;
    const marker = subclassKey(itemSubclassShortName(item));
    if (marker && expectedSelectedKey && marker !== expectedSelectedKey) addFinding(findings, 'WRONG_SUBCLASS_PRESENT', `items.${index}`, `Item belongs to subclass ${marker}, not the selected subclass ${expectedSelectedKey}.`);
  }
  const directSubclass = stringValue(actor.subclass ?? actor.subclassShortName);
  if (directSubclass && expectedSelectedKey && subclassKey(directSubclass) !== expectedSelectedKey) addFinding(findings, 'ACTOR_SUBCLASS_MISMATCH', 'subclass', `Actor subclass ${directSubclass} does not match ${expectedSubclass(expectation) ?? expectedSelectedKey}.`);
  return { ...(className ? { className } : {}), ...(subclassValue ? { subclassShortName: subclassValue } : {}), ...(selectedKey ? { subclassKey: selectedKey } : {}) };
}

/** Verify an exported Actor snapshot without making any Foundry/runtime calls. */
export function verifyBloodHunterActorSnapshot(
  snapshot: unknown,
  expectation: BloodHunterV14ActorExpectation = {},
): BloodHunterV14ActorVerificationResult {
  const findings: BloodHunterV14Finding[] = [];
  const actor = actorRecord(snapshot);
  const items = actorItems(actor);
  if (items.length === 0) addFinding(findings, 'ACTOR_ITEMS_MISSING', 'items', 'Actor snapshot must contain embedded Items.');
  const canonical = canonicalItemFindings(items, findings);
  const identity = verifyClassAndSubclass(actor, items, expectation, findings);
  const level = extractLevel(actor);
  const wantedLevel = expectedLevel(expectation);
  if (wantedLevel !== undefined && level !== wantedLevel) addFinding(findings, 'LEVEL_MISMATCH', 'system.details.level', `Actor level must be ${wantedLevel}; observed ${level ?? 'missing'}.`);
  const checkpoints = checkpointNumbers(expectation);
  if (level !== undefined && checkpoints.length > 0 && !checkpoints.includes(level)) addFinding(findings, 'LEVEL_CHECKPOINT_MISMATCH', 'system.details.level', `Actor level ${level} is not one of the requested checkpoints ${checkpoints.join(', ')}.`);
  if (wantedLevel !== undefined && level === undefined) addFinding(findings, 'LEVEL_MISSING', 'system.details.level', 'Actor level is required for checkpoint verification.');
  verifyFixedGrants(actor, canonical.canonicalItems, expectation, level, findings);
  verifyChoiceExpectation(actor, expectation, findings);
  let activityCount = 0;
  let effectCount = 0;
  let dangling = 0;
  const itemReferenceMetrics = new Map<JsonRecord, { activities: number; effects: number }>();
  for (const [index, item] of items.entries()) {
    const inspected = inspectItemReferences(item, findings, `items.${index}`);
    activityCount += inspected.activities.length;
    effectCount += inspected.effects.length;
    dangling += inspected.dangling;
    itemReferenceMetrics.set(item, { activities: inspected.activities.length, effects: inspected.effects.length });
  }
  const dawnItems = items.filter(isDawnRite);
  const dawnMetrics: { itemCount: number; activityCount: number; effectCount: number } = dawnItems.reduce<{ itemCount: number; activityCount: number; effectCount: number }>((total, item) => {
    const metrics = itemReferenceMetrics.get(item) ?? { activities: 0, effects: 0 };
    return { itemCount: total.itemCount + 1, activityCount: total.activityCount + metrics.activities, effectCount: total.effectCount + metrics.effects };
  }, { itemCount: 0, activityCount: 0, effectCount: 0 });
  const ghostslayerSelected = identity.subclassKey === 'ghostslayer' || subclassKey(expectedSubclass(expectation)) === 'ghostslayer';
  const dawnExpected = (level ?? wantedLevel ?? 0) >= 3 && ghostslayerSelected;
  if (dawnExpected) {
    if (dawnItems.length !== 1) addFinding(findings, 'DAWN_RITE_MISSING_OR_DUPLICATE', 'items', `Ghostslayer level ${level ?? wantedLevel} must contain exactly one canonical ${BLOOD_HUNTER_V14_DAWN_RITE_ENGLISH_NAME} Item.`);
    if (dawnMetrics.activityCount !== 5 || dawnMetrics.effectCount !== 2) addFinding(findings, 'DAWN_RITE_SHAPE_MISMATCH', 'items', `Ghostslayer level ${level ?? wantedLevel} ${BLOOD_HUNTER_V14_DAWN_RITE_NAME} must have exactly 5 Activities and 2 Effects; observed ${dawnMetrics.activityCount}/${dawnMetrics.effectCount}.`);
  } else if (dawnItems.length > 0) {
    addFinding(findings, 'UNEXPECTED_DAWN_RITE', 'items', `${BLOOD_HUNTER_V14_DAWN_RITE_NAME} is only valid for Ghostslayer at level 3 or higher.`);
  }
  const status = findings.length === 0 ? 'pass' : 'fail';
  return {
    ok: findings.length === 0,
    status,
    verdict: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
    errors: resultErrors(findings),
    metrics: {
      itemCount: items.length,
      bloodHunterItemCount: items.filter(isBloodHunterItem).length,
      canonicalItemCount: canonical.canonicalItems.length,
      duplicateCanonicalCount: canonical.duplicateCount,
      activityCount,
      effectCount,
      danglingActivityEffectReferences: dangling,
      ...(level === undefined ? {} : { level }),
      ...(identity.className ? { className: identity.className } : {}),
      ...(identity.subclassShortName ? { subclassShortName: identity.subclassShortName } : {}),
      dawnRite: dawnMetrics,
    },
  };
}

export const verifyBloodHunterV14ActorSnapshot = verifyBloodHunterActorSnapshot;

function phaseActor(value: unknown, keys: readonly string[] = ['actor', 'snapshot', 'destinationActor']): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (isRecord(candidate) && (candidate.items !== undefined || candidate.system !== undefined || candidate._id !== undefined)) return actorRecord(candidate);
  }
  if (value.items !== undefined || value.system !== undefined || value._id !== undefined) return actorRecord(value);
  return undefined;
}

function originalPhaseActor(input: BloodHunterV14MigrationInput): JsonRecord | undefined {
  return phaseActor(input.originalActor ?? input.original ?? input.before);
}

function previewOriginalPhaseActor(input: BloodHunterV14MigrationInput): JsonRecord | undefined {
  const preview = asRecord(input.preview);
  return phaseActor(input.previewOriginalActor ?? input.previewActor)
    ?? phaseActor(preview.originalActor ?? preview.sourceActor ?? preview.actor, ['actor', 'snapshot']);
}

function copySourcePhaseActor(input: BloodHunterV14MigrationInput): JsonRecord | undefined {
  const copy = asRecord(input.copy);
  return phaseActor(input.copySourceActor ?? input.copyOriginalActor)
    ?? phaseActor(copy.originalActor ?? copy.sourceActor ?? copy.before, ['actor', 'snapshot']);
}

function copiedPhaseActor(input: BloodHunterV14MigrationInput): JsonRecord | undefined {
  const copy = asRecord(input.copy);
  return phaseActor(input.copyActor ?? input.copiedActor ?? input.afterCopy)
    ?? phaseActor(copy.destinationActor ?? copy.actor ?? copy.snapshot, ['actor', 'snapshot']);
}

function optionalPhaseActor(value: unknown): JsonRecord | undefined {
  return phaseActor(value);
}

function dawnCounts(actor: JsonRecord | undefined): { activities: number; effects: number } {
  const item = actorItems(actor ?? {}).find(isDawnRite);
  if (!item) return { activities: 0, effects: 0 };
  return { activities: embeddedEntries(item, 'activities').length, effects: valuesFromContainer(item.effects).length };
}

function canonicalDuplicateCount(actor: JsonRecord): number {
  const counts = new Map<string, number>();
  for (const item of actorItems(actor)) {
    const canonicalId = itemCanonicalId(item);
    if (!canonicalId) continue;
    counts.set(canonicalId, (counts.get(canonicalId) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function nonBloodHunterProjection(actor: JsonRecord): string {
  return stableSerialize(actorItems(actor).filter((item) => !isBloodHunterItem(item)));
}

function actorLevelProjection(actor: JsonRecord): string {
  return stableSerialize(extractLevel(actor));
}

function actorHpProjection(actor: JsonRecord): string {
  const system = asRecord(actor.system);
  const attributes = asRecord(system.attributes);
  return stableSerialize(attributes.hp ?? asRecord(system.hp));
}

function actorUsesProjection(actor: JsonRecord): string {
  const system = asRecord(actor.system);
  const nonBloodHunterUses = actorItems(actor).filter((item) => !isBloodHunterItem(item)).map((item) => ({
    id: item._id,
    uses: asRecord(asRecord(item.system).uses),
    activities: embeddedEntries(item, 'activities').map((activity) => ({ _id: activity._id, uses: asRecord(activity.uses) })),
  }));
  return stableSerialize({ actorUses: system.uses, resources: system.resources, nonBloodHunterUses });
}

function actorChoicesProjection(actor: JsonRecord): string {
  return stableSerialize(choiceEvidence(actor).tokens);
}

function ownershipProjection(actor: JsonRecord): string {
  return stableSerialize({
    actor: actor.ownership ?? actor.permission,
    items: actorItems(actor).filter((item) => !isBloodHunterItem(item)).map((item) => ({ id: item._id, ownership: item.ownership ?? item.permission })),
  });
}

function compareProjection(
  original: JsonRecord,
  candidate: JsonRecord,
  findings: BloodHunterV14Finding[],
): { nonBloodHunterProjectionUnchanged: boolean; levelUnchanged: boolean; hpUnchanged: boolean; usesUnchanged: boolean; choicesUnchanged: boolean; ownershipUnchanged: boolean } {
  const projections = [
    ['nonBloodHunterProjectionUnchanged', nonBloodHunterProjection(original), nonBloodHunterProjection(candidate), 'NON_BLOOD_HUNTER_PROJECTION_CHANGED'],
    ['levelUnchanged', actorLevelProjection(original), actorLevelProjection(candidate), 'LEVEL_CHANGED_DURING_MIGRATION'],
    ['hpUnchanged', actorHpProjection(original), actorHpProjection(candidate), 'HP_CHANGED_DURING_MIGRATION'],
    ['usesUnchanged', actorUsesProjection(original), actorUsesProjection(candidate), 'USES_CHANGED_DURING_MIGRATION'],
    ['choicesUnchanged', actorChoicesProjection(original), actorChoicesProjection(candidate), 'CHOICES_CHANGED_DURING_MIGRATION'],
    ['ownershipUnchanged', ownershipProjection(original), ownershipProjection(candidate), 'OWNERSHIP_CHANGED_DURING_MIGRATION'],
  ] as const;
  const result = {
    nonBloodHunterProjectionUnchanged: true,
    levelUnchanged: true,
    hpUnchanged: true,
    usesUnchanged: true,
    choicesUnchanged: true,
    ownershipUnchanged: true,
  };
  for (const [key, before, after, code] of projections) {
    if (before !== after) {
      result[key] = false;
      addFinding(findings, code, key, `${key} must remain unchanged across the Blood Hunter migration.`);
    }
  }
  return result;
}

/** Verify preview/copy/apply/rollback evidence without writing the Actor. */
export function verifyCallumMigrationSnapshots(input: BloodHunterV14MigrationInput): BloodHunterV14MigrationVerificationResult {
  const findings: BloodHunterV14Finding[] = [];
  const original = originalPhaseActor(input);
  const previewOriginal = previewOriginalPhaseActor(input);
  const copySource = copySourcePhaseActor(input);
  const copied = copiedPhaseActor(input);
  const originalDawnItems = original ? actorItems(original).filter(isDawnRite) : [];
  const copiedDawnItems = copied ? actorItems(copied).filter(isDawnRite) : [];
  if (!original) addFinding(findings, 'ORIGINAL_ACTOR_MISSING', 'originalActor', 'original Callum Actor snapshot is required.');
  if (!previewOriginal) addFinding(findings, 'PREVIEW_ACTOR_MISSING', 'preview', 'preview-phase original Actor snapshot is required to prove no mutation.');
  if (!copySource) addFinding(findings, 'COPY_SOURCE_ACTOR_MISSING', 'copy', 'copy-phase source Actor snapshot is required to prove no mutation.');
  if (!copied) addFinding(findings, 'COPY_ACTOR_MISSING', 'copyActor', 'copy-phase destination Actor snapshot is required.');
  const originalCounts = dawnCounts(original);
  const copyCounts = dawnCounts(copied);
  if (!original || originalDawnItems.length !== 1 || originalCounts.activities !== 0 || originalCounts.effects !== 0) addFinding(findings, 'ORIGINAL_DAWN_PASSIVE_NOT_OLD', 'originalActor.items', `original must contain exactly one old ${BLOOD_HUNTER_V14_DAWN_RITE_NAME} passive with 0 Activity / 0 Effect; observed ${originalDawnItems.length} item(s), ${originalCounts.activities}/${originalCounts.effects}.`);
  if (!copied || copiedDawnItems.length !== 1 || copyCounts.activities !== 5 || copyCounts.effects !== 2) addFinding(findings, 'COPY_DAWN_PASSIVE_NOT_CANONICAL', 'copyActor.items', `copy must contain exactly one canonical ${BLOOD_HUNTER_V14_DAWN_RITE_NAME} passive with 5 Activity / 2 Effect; observed ${copiedDawnItems.length} item(s), ${copyCounts.activities}/${copyCounts.effects}.`);
  if (copied) {
    const copiedDawn = copiedDawnItems[0];
    const metadata = copiedDawn ? metadataForItem(copiedDawn) : undefined;
    if (!metadata || stringValue(metadata.moduleVersion) !== BLOOD_HUNTER_V14_MODULE_VERSION || stringValue(metadata.canonicalId) !== stringValue(copiedDawn?._id)) {
      addFinding(findings, 'COPY_DAWN_CANONICAL_FLAG_MISSING', 'copyActor.items', 'copy Dawn Rite must carry canonical Blood Hunter metadata.');
    }
    const duplicateCount = canonicalDuplicateCount(copied);
    if (duplicateCount !== 0) addFinding(findings, 'COPY_DUPLICATE_CANONICAL', 'copyActor.items', `copy contains ${duplicateCount} duplicate canonical item(s); expected 0.`);
  }
  const previewUnchanged = Boolean(original && previewOriginal && stableSerialize(original) === stableSerialize(previewOriginal));
  if (original && previewOriginal && !previewUnchanged) addFinding(findings, 'PREVIEW_MUTATED_ORIGINAL', 'preview', 'preview phase changed the original Actor snapshot.');
  const copySourceUnchanged = Boolean(original && copySource && stableSerialize(original) === stableSerialize(copySource));
  if (original && copySource && !copySourceUnchanged) addFinding(findings, 'COPY_MUTATED_SOURCE', 'copy', 'copy phase changed the source/original Actor snapshot.');
  const projections = original && copied ? compareProjection(original, copied, findings) : {
    nonBloodHunterProjectionUnchanged: false,
    levelUnchanged: false,
    hpUnchanged: false,
    usesUnchanged: false,
    choicesUnchanged: false,
    ownershipUnchanged: false,
  };
  if (original && copied && optionalPhaseActor(input.applyActor ?? input.appliedActor ?? input.apply)) {
    const applied = optionalPhaseActor(input.applyActor ?? input.appliedActor ?? input.apply)!;
    const appliedCounts = dawnCounts(applied);
    if (appliedCounts.activities !== 5 || appliedCounts.effects !== 2) addFinding(findings, 'APPLY_DAWN_PASSIVE_NOT_CANONICAL', 'apply', 'apply phase must retain canonical 5 Activity / 2 Effect Dawn Rite.');
  }
  const rollback = optionalPhaseActor(input.rollbackActor ?? input.rolledBackActor ?? input.rollback);
  let rollbackRestored = rollback === undefined ? true : Boolean(original && stableSerialize(original) === stableSerialize(rollback));
  if (rollback && !rollbackRestored) {
    rollbackRestored = false;
    addFinding(findings, 'ROLLBACK_NOT_RESTORED', 'rollback', 'rollback snapshot does not exactly restore the original Actor.');
  }
  const status = findings.length === 0 ? 'pass' : 'fail';
  return {
    ok: findings.length === 0,
    status,
    verdict: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
    errors: resultErrors(findings),
    metrics: {
      previewOriginalUnchanged: previewUnchanged,
      copySourceUnchanged,
      originalPassive: originalCounts,
      copyCanonicalPassive: copyCounts,
      duplicateCanonicalCount: copied ? canonicalDuplicateCount(copied) : 0,
      ...projections,
      rollbackRestored: rollbackRestored,
    },
  };
}

function statusFromEvidence(value: unknown): BloodHunterV14Status {
  if (value === true) return 'pass';
  if (value === false || value === undefined || value === null) return 'pending';
  if (typeof value === 'string') {
    const status = value.toLocaleLowerCase('en');
    if (['pass', 'passed', 'complete', 'completed', 'ok'].includes(status)) return 'pass';
    if (['fail', 'failed', 'error'].includes(status)) return 'fail';
    if (['blocked', 'gate'].includes(status)) return 'blocked';
    if (['partial', 'partial-pass'].includes(status)) return 'partial';
    return 'pending';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'pending';
    const statuses = value.map(statusFromEvidence);
    if (statuses.some((status) => status === 'fail' || status === 'blocked')) return 'fail';
    return statuses.every((status) => status === 'pass') ? 'pass' : 'partial';
  }
  if (isRecord(value)) {
    const direct = value.status ?? value.verdict ?? (value.ok === true ? 'pass' : value.ok === false ? 'fail' : undefined);
    if (direct !== undefined) return statusFromEvidence(direct);
    const evidence = value.evidence ?? value.records ?? value.operations;
    if (evidence !== undefined) return statusFromEvidence(evidence);
  }
  return 'pending';
}

function evidenceValue(input: BloodHunterV14E2EManifestInput, ...keys: string[]): unknown {
  for (const key of keys) if (input[key] !== undefined) return input[key];
  return undefined;
}

function idsFrom(value: unknown, kind: 'id' | 'pid' = 'id'): string[] | number[] {
  if (kind === 'pid') return uniqueNumbers(stringsFrom(value).map(numberValue).filter((entry): entry is number => entry !== undefined));
  return uniqueStrings(stringsFrom(value));
}

function trackedIds(input: BloodHunterV14E2EManifestInput): { actorIds: string[]; tokenIds: string[]; messageIds: string[]; templateIds: string[]; ownPids: number[] } {
  const tracked = asRecord(input.tracked);
  const run = asRecord(input.run);
  const resources = asRecord(input.resources);
  return {
    actorIds: idsFrom(input.actorIds ?? tracked.actorIds ?? resources.actorIds ?? run.actorIds) as string[],
    tokenIds: idsFrom(input.tokenIds ?? tracked.tokenIds ?? resources.tokenIds ?? run.tokenIds) as string[],
    messageIds: idsFrom(input.messageIds ?? tracked.messageIds ?? resources.messageIds ?? run.messageIds) as string[],
    templateIds: idsFrom(input.templateIds ?? tracked.templateIds ?? resources.templateIds ?? run.templateIds) as string[],
    ownPids: idsFrom(input.ownPids ?? tracked.ownPids ?? resources.ownPids ?? run.ownPids, 'pid') as number[],
  };
}

function evidenceByKey(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  return value[key] ?? value[key.replace(/Evidence$/, '')];
}

function checkpointEvidenceMap(value: unknown): Map<string, { status: BloodHunterV14Status; evidenceId?: string }> {
  const map = new Map<string, { status: BloodHunterV14Status; evidenceId?: string }>();
  const entries = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  for (const entry of entries) {
    const record = isRecord(entry) ? entry : {};
    const subclass = stringValue(record.subclassShortName ?? record.subclass ?? record.subclassName);
    const level = numberValue(record.level);
    if (!subclass || level === undefined) continue;
    const status = statusFromEvidence(record.status ?? record.evidence ?? record);
    const evidenceId = stringValue(record.evidenceId ?? record.id);
    map.set(`${subclassKey(subclass) ?? normalizedLabel(subclass)}:${level}`, { status, ...(evidenceId ? { evidenceId } : {}) });
  }
  return map;
}

function safeIdList(value: readonly string[], path: string, findings: BloodHunterV14Finding[]): void {
  for (const id of value) {
    if (!id || ['*', 'all', 'world', 'worlds', 'module', 'modules'].includes(normalizedLabel(id))) addFinding(findings, 'BROAD_CLEANUP_TARGET', path, `cleanup tracking must use exact document ids; rejected ${id || 'empty'} as a broad target.`);
  }
}

function subset<T>(candidate: readonly T[], allowed: readonly T[]): T[] {
  const allowedSet = new Set(allowed);
  return candidate.filter((entry) => allowedSet.has(entry));
}

const ACTIVITY_FAMILIES = [
  ['class-grants', 'class and subclass fixed-grant Activities'],
  ['blood-curses', 'Blood Curse choice Activities'],
  ['crimson-rites', 'Crimson Rite choice Activities'],
  ['mutagens', 'Mutagen choice Activities'],
  ['subclass-features', 'four-subclass feature Activities'],
  ['dawn-rite', 'Ghostslayer Rite of the Dawn 5 Activity / 2 Effect family'],
] as const;

const COUNTEREXAMPLES = [
  ['level-2-no-dawn', 'Ghostslayer level 2 must not contain Rite of the Dawn.'],
  ['wrong-subclass-no-dawn', 'A non-Ghostslayer subclass must not contain Rite of the Dawn.'],
  ['dangling-activity-effect', 'An Activity referencing a missing Effect must fail verification.'],
  ['duplicate-canonical', 'Duplicate canonical Blood Hunter Items must be zero.'],
  ['non-blood-hunter-loss', 'A migration must fail if non-Blood-Hunter content is lost.'],
] as const;

/** Create an evidence checklist; it never performs UI, runtime, export, or cleanup actions. */
export function createBloodHunterE2EManifest(input: BloodHunterV14E2EManifestInput): BloodHunterV14E2EManifest {
  const findings: BloodHunterV14Finding[] = [];
  const run = asRecord(input.run);
  const runId = stringValue(input.runId ?? run.id) ?? 'unidentified-run';
  if (runId === 'unidentified-run') addFinding(findings, 'RUN_ID_MISSING', 'runId', 'every E2E run must have a stable run id.');
  const tracked = trackedIds(input);
  safeIdList(tracked.actorIds, 'tracked.actorIds', findings);
  safeIdList(tracked.tokenIds, 'tracked.tokenIds', findings);
  safeIdList(tracked.messageIds, 'tracked.messageIds', findings);
  safeIdList(tracked.templateIds, 'tracked.templateIds', findings);
  const checkpointMap = checkpointEvidenceMap(input.checkpointEvidence);
  const checkpoints = BLOOD_HUNTER_V14_SUBCLASSES.map((subclass) => ({
    subclassShortName: subclass.shortName,
    subclassName: subclass.name,
    englishName: subclass.englishName,
    levels: BLOOD_HUNTER_V14_CHECKPOINT_LEVELS.map((level) => {
      const evidence = checkpointMap.get(`${subclassKey(subclass.shortName)}:${level}`)
        ?? checkpointMap.get(`${normalizedLabel(subclass.shortName)}:${level}`);
      return { level, status: evidence?.status ?? 'pending', ...(evidence?.evidenceId ? { evidenceId: evidence.evidenceId } : {}) };
    }),
  }));
  const activityInput = input.activityEvidence;
  const activityFamilies = ACTIVITY_FAMILIES.map(([id, label]) => {
    const evidence = isRecord(activityInput) ? activityInput[id] : undefined;
    return { id, label, status: statusFromEvidence(evidence), ...(evidence === undefined ? {} : { evidence }) };
  });
  const counterInput = input.counterexampleEvidence ?? input.counterexamples;
  const counterexamples = COUNTEREXAMPLES.map(([id, description]) => {
    const evidence = isRecord(counterInput) ? counterInput[id] : undefined;
    return { id, description, status: statusFromEvidence(evidence), ...(evidence === undefined ? {} : { evidence }) };
  });
  const matrixInput = input.matrixEvidence;
  const matrixCore = isRecord(matrixInput) ? matrixInput.core : undefined;
  const matrixModded = isRecord(matrixInput) ? matrixInput.modded : undefined;
  const matrixCoreStatus = statusFromEvidence(matrixCore);
  const matrixModdedStatus = statusFromEvidence(matrixModded);
  const matrixStatus: BloodHunterV14Status = matrixCoreStatus === 'pass' && matrixModdedStatus === 'pass' ? 'pass' : matrixCoreStatus === 'fail' || matrixModdedStatus === 'fail' ? 'fail' : matrixCoreStatus === 'blocked' || matrixModdedStatus === 'blocked' ? 'blocked' : 'pending';
  const phase = {
    matrix: { status: matrixStatus, core: matrixCore, modded: matrixModded },
    uiOperations: { status: statusFromEvidence(evidenceValue(input, 'uiEvidence', 'uiOperations')), ...(evidenceValue(input, 'uiEvidence', 'uiOperations') === undefined ? {} : { evidence: evidenceValue(input, 'uiEvidence', 'uiOperations') }) },
    runtimeOperations: { status: statusFromEvidence(evidenceValue(input, 'runtimeEvidence', 'runtimeOperations')), ...(evidenceValue(input, 'runtimeEvidence', 'runtimeOperations') === undefined ? {} : { evidence: evidenceValue(input, 'runtimeEvidence', 'runtimeOperations') }) },
    migration: { status: statusFromEvidence(evidenceValue(input, 'migrationEvidence', 'migration')), ...(evidenceValue(input, 'migrationEvidence', 'migration') === undefined ? {} : { evidence: evidenceValue(input, 'migrationEvidence', 'migration') }) },
    export: { status: statusFromEvidence(evidenceValue(input, 'exportEvidence', 'export')), ...(evidenceValue(input, 'exportEvidence', 'export') === undefined ? {} : { evidence: evidenceValue(input, 'exportEvidence', 'export') }) },
    cleanup: { status: statusFromEvidence(evidenceValue(input, 'cleanupEvidence', 'cleanup')), ...(evidenceValue(input, 'cleanupEvidence', 'cleanup') === undefined ? {} : { evidence: evidenceValue(input, 'cleanupEvidence', 'cleanup') }) },
  };
  const cleanupInput = asRecord(evidenceValue(input, 'cleanupEvidence', 'cleanup'));
  const requestedActorIds = idsFrom(cleanupInput.actorIds ?? cleanupInput.actors) as string[];
  const requestedTokenIds = idsFrom(cleanupInput.tokenIds ?? cleanupInput.tokens) as string[];
  const requestedMessageIds = idsFrom(cleanupInput.messageIds ?? cleanupInput.messages) as string[];
  const requestedTemplateIds = idsFrom(cleanupInput.templateIds ?? cleanupInput.templates) as string[];
  const requestedPids = idsFrom(cleanupInput.stopPids ?? cleanupInput.pids, 'pid') as number[];
  const broadTargetRejected = [requestedActorIds, requestedTokenIds, requestedMessageIds, requestedTemplateIds].every((ids) => ids.every((id) => !['*', 'all', 'world', 'worlds', 'module', 'modules'].includes(normalizedLabel(id))));
  const notTrackedIds = [
    ...requestedActorIds.filter((id) => !tracked.actorIds.includes(id)).map((id) => `Actor:${id}`),
    ...requestedTokenIds.filter((id) => !tracked.tokenIds.includes(id)).map((id) => `Token:${id}`),
    ...requestedMessageIds.filter((id) => !tracked.messageIds.includes(id)).map((id) => `Message:${id}`),
    ...requestedTemplateIds.filter((id) => !tracked.templateIds.includes(id)).map((id) => `Template:${id}`),
  ];
  const foreignPids = requestedPids.filter((pid) => !tracked.ownPids.includes(pid));
  if (notTrackedIds.length > 0) addFinding(findings, 'CLEANUP_ID_NOT_TRACKED', 'cleanup', `cleanup contains ids not recorded by run ${runId}: ${notTrackedIds.join(', ')}.`);
  if (foreignPids.length > 0) addFinding(findings, 'CLEANUP_FOREIGN_PID', 'cleanup.stopPids', `cleanup may stop only own PIDs; rejected ${foreignPids.join(', ')}.`);
  if (!broadTargetRejected) addFinding(findings, 'BROAD_CLEANUP_TARGET', 'cleanup', 'cleanup must use exact run-recorded IDs and never a world/module/wildcard target.');
  if (tracked.actorIds.length === 0 || tracked.tokenIds.length === 0 || tracked.messageIds.length === 0 || tracked.templateIds.length === 0 || tracked.ownPids.length === 0) {
    addFinding(findings, 'RUN_RESOURCE_TRACKING_INCOMPLETE', 'tracked', 'run must track exact Actor, Token, Message, Template IDs and at least one own PID.');
  }
  const cleanupOwnPid = foreignPids.length === 0 && tracked.ownPids.length > 0 && requestedPids.every((pid) => tracked.ownPids.includes(pid));
  const cleanupEvidenceStatus = phase.cleanup.status;
  const cleanupStatus: BloodHunterV14Status = cleanupEvidenceStatus === 'pass' && cleanupOwnPid && broadTargetRejected && notTrackedIds.length === 0 ? 'pass' : cleanupEvidenceStatus === 'fail' || foreignPids.length > 0 || notTrackedIds.length > 0 ? 'fail' : 'pending';
  phase.cleanup.status = cleanupStatus;
  const packProbeEvidence = input.packIndexApiProbe;
  const packIndexApiProbe = {
    status: 'Partial' as const,
    e2ePassEligible: false as const,
    ...(packProbeEvidence === undefined ? {} : { evidence: packProbeEvidence }),
    reason: 'Pack index/API probes can show declarations or reachability, but cannot prove UI operations, runtime operations, migration, counterexamples, export, and safe cleanup.',
  };
  const allCheckpointsPass = checkpoints.every((entry) => entry.levels.every((checkpoint) => checkpoint.status === 'pass'));
  const allActivitiesPass = activityFamilies.every((entry) => entry.status === 'pass');
  const allCounterexamplesPass = counterexamples.every((entry) => entry.status === 'pass');
  const requiredPhasesPass = Object.values(phase).every((entry) => entry.status === 'pass');
  const e2ePassEligible = allCheckpointsPass && allActivitiesPass && allCounterexamplesPass && requiredPhasesPass && cleanupStatus === 'pass' && findings.length === 0;
  const verdict: BloodHunterV14E2EManifest['verdict'] = e2ePassEligible ? 'E2E PASS' : findings.some((finding) => finding.severity !== 'warning') ? 'BLOCKED' : 'PARTIAL';
  return {
    runId,
    verdict,
    e2ePassEligible,
    acceptanceRule: 'E2E PASS requires every matrix entry, all four subclass 1→20 checkpoints, UI operations, runtime operations, migration, counterexamples, export, and safe exact-ID/own-PID cleanup. Pack index/API probe remains Partial and is never sufficient.',
    target: {
      moduleId: BLOOD_HUNTER_V14_MODULE_ID,
      moduleVersion: BLOOD_HUNTER_V14_MODULE_VERSION,
      foundry: BLOOD_HUNTER_V14_FOUNDRY_VERSION,
      dnd5e: BLOOD_HUNTER_V14_DND5E_VERSION,
      worldId: BLOOD_HUNTER_V14_MATRIX_WORLD_ID,
    },
    checkpoints,
    activityFamilies,
    counterexamples,
    phases: phase,
    packIndexApiProbe,
    tracked,
    cleanupAllowlist: {
      actorIds: subset(requestedActorIds, tracked.actorIds),
      tokenIds: subset(requestedTokenIds, tracked.tokenIds),
      messageIds: subset(requestedMessageIds, tracked.messageIds),
      templateIds: subset(requestedTemplateIds, tracked.templateIds),
      stopPids: subset(requestedPids, tracked.ownPids),
      onlyOwnPid: cleanupOwnPid,
      broadTargetRejected,
    },
    findings,
  };
}

export const createBloodHunterV14E2EManifest = createBloodHunterE2EManifest;
