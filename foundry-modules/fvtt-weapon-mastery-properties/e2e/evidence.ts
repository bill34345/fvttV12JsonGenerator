/** Pure classification of CoTN UI Activity receipts. No Foundry document access. */
export const RULES = [
  'cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex',
  'deadly', 'fatal', 'criticalBleeding',
] as const;
export type Rule = typeof RULES[number];
export type PilotRule = Rule;
export type EvidenceStatus = 'NOT_EXECUTED' | 'INCOMPLETE' | 'PRECONDITION_FAILED' | 'FAIL' | 'PASS';

export interface RuleResult {
  status: EvidenceStatus;
  reasons: string[];
  source?: 'ui-activity' | 'runtime-api';
}

export interface EnvironmentSnapshot {
  worldId?: string;
  foundryVersion?: string;
  systemId?: string;
  systemVersion?: string;
  /** The complete enabled-module ID and version set, captured from the UI in this run. */
  enabledModules?: Array<{ id: string; version: string }>;
}

export interface PilotEvidence {
  attempted?: boolean;
  source?: 'ui-activity' | 'runtime-api';
  attackerActorId?: string;
  itemId?: string;
  activityId?: string;
  targetActorId?: string;
  targetTokenId?: string;
  qualification?: {
    actorType?: 'npc' | 'character';
    selectedMasteryRuleId?: string;
    propertyRuleId?: string;
    propertyKind?: 'deadly' | 'fatal' | 'criticalBleeding';
    propertyParams?: Record<string, string | number | boolean>;
    grantMastery?: boolean;
    nativeMasteryUnlocked?: boolean;
  };
  activeTurnKey?: string;
  attack?: {
    attackId?: string;
    messageId?: string;
    timestamp?: number;
    total?: number;
    targetAc?: number;
    outcome?: 'hit' | 'miss';
    natural20?: boolean;
    natural1?: boolean;
    critical?: boolean;
  };
  /** Read back from the module's actor attack ledger, not inferred from a card. */
  sourceLedger?: {
    attackId?: string;
    outcome?: 'hit' | 'miss';
    turnKey?: string;
    damageDealt?: number;
    steps?: Record<string, string>;
  };
  damage?: {
    accepted?: boolean;
    amount?: number;
    hpBefore?: number;
    hpAfter?: number;
    tempHpBefore?: number;
    tempHpAfter?: number;
  };
  effectReadback?: {
    complete?: boolean;
    instance?: null | {
      id?: string;
      kind?: string;
      holderActorId?: string;
      sourceActorId?: string;
      targetActorId?: string;
      attackId?: string;
      attackMessageId?: string;
      createdAt?: number;
      itemUuid?: string;
    };
  };
  nextAttack?: {
    attackId?: string;
    messageId?: string;
    attackerActorId?: string;
    targetActorId?: string;
    sourceLedger?: {
      attackId?: string;
      messageId?: string;
      steps?: Record<string, string>;
      reservations?: Array<{
        kind?: string;
        actorUuid?: string;
        targetActorUuid?: string;
        ticket?: { attackId?: string; effectId?: string };
      }>;
    };
    moduleModifiers?: { advantage?: boolean };
    advantageObservation?: { source?: 'roll' | 'dialog'; advantage?: boolean; d20Count?: number; causeEffectId?: string };
    effectAfter?: { complete?: boolean; present?: boolean };
    /** Separately observed regrant after the next attack also qualifies and deals damage. */
    regrant?: Pick<PilotEvidence, 'attack' | 'damage' | 'effectReadback' | 'beforeEffectIds'>;
  };
  speed?: { before?: number; after?: number };
  push?: {
    decision?: 'selected' | 'cancelled';
    destination?: { x?: number; y?: number };
    tokenBefore?: { x?: number; y?: number };
    tokenAfter?: { x?: number; y?: number };
    geometry?: {
      attackerCenter?: { x?: number; y?: number };
      targetCenterBefore?: { x?: number; y?: number };
      targetCenterAfter?: { x?: number; y?: number };
      gridSizePixels?: number;
      gridDistanceFeet?: number;
      measuredDistanceFeet?: number;
      maxDistanceFeet?: number;
      withinScene?: boolean;
      collisionClear?: boolean;
    };
  };
  /** Effect IDs visible before this case started; an old effect cannot prove a new rule outcome. */
  beforeEffectIds?: string[];
  mechanic?: {
    childAttack?: { attackId?: string; messageId?: string; parentAttackId?: string; targetActorId?: string;
      outcome?: 'hit' | 'miss' | 'cancelled'; withinFiveFeet?: boolean; weaponDamage?: number; damageApplied?: number };
    missDamage?: { applied?: number; abilityModifier?: number; damageRollOccurred?: boolean };
    extraAttack?: { attackId?: string; messageId?: string; sameTurn?: boolean; bonusActionConsumed?: boolean; usesThisTurn?: number };
    nextAttack?: { attackId?: string; messageId?: string; disadvantage?: boolean; causeEffectId?: string; effectConsumed?: boolean };
    save?: { messageId?: string; ability?: string; dc?: number; total?: number; failed?: boolean; proneAfter?: boolean;
      proneEffectId?: string; sourceAbilityModifier?: number; sourceProficiencyBonus?: number };
    critical?: { diceBefore?: number; diceAfter?: number; extraDieFaces?: number; extraDiceCount?: number; replacementDieFaces?: number };
    bleeding?: { tickDamageApplied?: number; damageType?: string; endedAfterHealing?: boolean;
      conditionComplete?: boolean;
      condition?: null | { id?: string; conditionId?: string; sourceUuid?: string; origin?: string;
        createdAt?: number; params?: Record<string, string | number | boolean> } };
  };
}

export type CleanupKind = 'scene' | 'actor' | 'item' | 'token' | 'combat' | 'macro' | 'chatMessage' | 'activeEffect';
export interface CleanupEntry {
  kind: CleanupKind;
  id: string;
  /** Exact fixture run that created this object, e.g. WMP-E2E-72C5627E. */
  fixtureId: string;
  /** Expected role and actual flag values read before deleting this exact ID. */
  role: string;
  ownerMarker: { runId: string; role: string };
  /** A readback after cleanup verified this exact ID is absent. */
  absentAfterCleanup?: boolean;
}
export interface CleanupLedger {
  fixtureId: string;
  entries: CleanupEntry[];
  expectedChatMessageIds: string[];
  skippedIds: string[];
  combatUsed: boolean;
  registeredCombatId?: string;
  originalActiveCombatRestored: boolean;
  /** The task-owned audit message intentionally persists after cleanup. */
  retainedLedger?: {
    id: string;
    ownerMarker: { runId: string; role: 'ledger' };
    status: 'cleaned' | 'cleanup-incomplete';
    presentAfterCleanup: boolean;
    externalReceiptSaved?: boolean;
    finalized?: boolean;
    absentAfterFinalization?: boolean;
  };
}

export interface EvidenceReceipt {
  environment?: { expected?: EnvironmentSnapshot; observed?: EnvironmentSnapshot };
  buildIdentity?: {
    status?: 'PASS' | 'INCOMPLETE' | 'MISMATCH';
    expectedBuildId?: string | null;
    observedBuildId?: string | null;
    settings?: Array<{ namespace: string; key: string; expected: unknown; observed: unknown }>;
  };
  rules?: Partial<Record<PilotRule, PilotEvidence>>;
  cleanup?: CleanupLedger;
}

export interface EvidenceManifest {
  environment: RuleResult;
  rules: Record<Rule, RuleResult>;
  cleanup: RuleResult;
}

const result = (status: EvidenceStatus, ...reasons: string[]): RuleResult => ({ status, reasons });
const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function environmentResult(input?: EvidenceReceipt['environment'], buildIdentity?: EvidenceReceipt['buildIdentity']): RuleResult {
  const expected = input?.expected;
  const observed = input?.observed;
  if (!expected || !observed) return result('INCOMPLETE', 'environment-snapshot-missing');
  for (const field of ['worldId', 'foundryVersion', 'systemId', 'systemVersion'] as const) {
    if (!present(expected[field]) || !present(observed[field])) return result('INCOMPLETE', `environment-${field}-missing`);
  }
  if (!Array.isArray(expected.enabledModules) || !Array.isArray(observed.enabledModules)
    || expected.enabledModules.length === 0 || observed.enabledModules.length === 0
    || [...expected.enabledModules, ...observed.enabledModules].some(module => !present(module?.id) || !present(module?.version))) {
    return result('INCOMPLETE', 'enabled-module-set-missing');
  }
  if (new Set(expected.enabledModules.map(module => module.id)).size !== expected.enabledModules.length
    || new Set(observed.enabledModules.map(module => module.id)).size !== observed.enabledModules.length) {
    return result('INCOMPLETE', 'enabled-module-set-duplicate');
  }
  if (expected.worldId !== 'cor-cotn' || expected.foundryVersion !== '14.364'
    || expected.systemId !== 'dnd5e' || expected.systemVersion !== '5.3.3') {
    return result('PRECONDITION_FAILED', 'unsupported-baseline');
  }
  for (const id of ['fvtt-weapon-mastery-properties', 'fvtt-custom-conditions', 'fvtt-trigger-engine']) {
    if (!expected.enabledModules.some(module => module.id === id)
      || !observed.enabledModules.some(module => module.id === id)) {
      return result('PRECONDITION_FAILED', `required-module-disabled:${id}`);
    }
  }
  if (expected.worldId !== observed.worldId || expected.foundryVersion !== observed.foundryVersion
    || expected.systemId !== observed.systemId || expected.systemVersion !== observed.systemVersion) {
    return result('PRECONDITION_FAILED', 'environment-identity-mismatch');
  }
  if (expected.enabledModules.length !== observed.enabledModules.length
    || expected.enabledModules.some(module => !observed.enabledModules!.some(other => other.id === module.id && other.version === module.version))) {
    return result('PRECONDITION_FAILED', 'enabled-module-set-mismatch');
  }
  if (!buildIdentity || !present(buildIdentity.expectedBuildId) || !present(buildIdentity.observedBuildId))
    return result('INCOMPLETE', 'build-identity-missing');
  if (buildIdentity.status === 'INCOMPLETE') return result('INCOMPLETE', 'build-identity-incomplete');
  if (buildIdentity.status !== 'PASS' || buildIdentity.expectedBuildId !== buildIdentity.observedBuildId)
    return result('PRECONDITION_FAILED', 'build-identity-mismatch');
  if (buildIdentity.settings?.some(entry => JSON.stringify(entry.expected) !== JSON.stringify(entry.observed)))
    return result('PRECONDITION_FAILED', 'settings-profile-mismatch');
  return result('PASS');
}

function common(rule: PilotRule, evidence: PilotEvidence | undefined, environment: RuleResult): RuleResult | null {
  if (!evidence || evidence.attempted !== true) return result('NOT_EXECUTED', 'ui-activity-not-attempted');
  if (environment.status !== 'PASS') return result(environment.status, ...environment.reasons);
  if (evidence.source !== 'ui-activity' && evidence.source !== 'runtime-api') return result('INCOMPLETE', 'activity-source-proof-missing');
  for (const field of ['attackerActorId', 'itemId', 'activityId', 'targetActorId', 'targetTokenId'] as const) {
    if (!present(evidence[field])) return result('INCOMPLETE', `${field}-missing`);
  }
  const qualification = evidence.qualification;
  if (!qualification || !present(qualification.actorType) || typeof qualification.grantMastery !== 'boolean'
    || typeof qualification.nativeMasteryUnlocked !== 'boolean') {
    return result('INCOMPLETE', 'mastery-qualification-missing');
  }
  if (['deadly', 'fatal', 'criticalBleeding'].includes(rule)) {
    if (!present(qualification.propertyRuleId) || qualification.propertyKind !== rule || !qualification.propertyParams
      || qualification.propertyRuleId.startsWith('dnd2024.')) return result('PRECONDITION_FAILED', 'wrong-property-configured');
  } else if (qualification.selectedMasteryRuleId !== `dnd2024.${rule}`) {
    return result('PRECONDITION_FAILED', 'wrong-mastery-selected');
  }
  if (qualification.actorType === 'npc' && qualification.nativeMasteryUnlocked) {
    return result('INCOMPLETE', 'npc-native-mastery-contradiction');
  }
  if (!['deadly', 'fatal', 'criticalBleeding'].includes(rule) && !qualification.grantMastery && !qualification.nativeMasteryUnlocked) {
    return result('PRECONDITION_FAILED', 'mastery-not-unlocked');
  }
  if ((rule === 'vex' || rule === 'slow') && !present(evidence.activeTurnKey)) {
    return result('INCOMPLETE', 'active-turn-missing');
  }
  const attack = evidence.attack;
  if (!attack || !present(attack.attackId) || !present(attack.messageId)
    || !finite(attack.total) || !finite(attack.targetAc) || !attack.outcome) {
    return result('INCOMPLETE', 'attack-total-ac-or-message-missing');
  }
  if (attack.outcome === 'miss' && rule !== 'graze') return result('PRECONDITION_FAILED', 'attack-did-not-hit');
  if (rule === 'graze' && attack.outcome !== 'miss') return result('PRECONDITION_FAILED', 'graze-requires-miss');
  if (attack.outcome === 'hit' && attack.total < attack.targetAc && attack.natural20 !== true) {
    return result('INCOMPLETE', 'hit-total-below-ac-without-natural-20');
  }
  const ledger = evidence.sourceLedger;
  if (rule === 'vex' || rule === 'slow') {
    const damage = evidence.damage;
    if (!damage || typeof damage.accepted !== 'boolean' || !finite(damage.amount)
      || !finite(damage.hpBefore) || !finite(damage.hpAfter)
      || !finite(damage.tempHpBefore) || !finite(damage.tempHpAfter)) {
      return result('INCOMPLETE', 'accepted-damage-and-hp-readback-missing');
    }
    if (!damage.accepted || damage.amount <= 0
      || damage.hpAfter + damage.tempHpAfter >= damage.hpBefore + damage.tempHpBefore) {
      return result('PRECONDITION_FAILED', 'positive-applied-damage-not-proven');
    }
  }
  return null;
}

function settled(_rule: PilotRule, _evidence: PilotEvidence): RuleResult { return result('PASS'); }

function effect(rule: 'vex' | 'slow' | 'sap', evidence: PilotEvidence): RuleResult | null {
  const readback = evidence.effectReadback;
  if (readback?.complete !== true || readback.instance === undefined) {
    return result('INCOMPLETE', 'effect-instance-readback-missing');
  }
  const instance = readback.instance;
  if (instance === null) return result('FAIL', 'effect-instance-absent');
  if (!present(instance.id) || !present(instance.kind) || !present(instance.holderActorId)
    || !present(instance.sourceActorId) || !present(instance.targetActorId)) {
    return result('INCOMPLETE', 'effect-instance-identity-missing');
  }
  if (instance.kind !== rule || instance.sourceActorId !== evidence.attackerActorId
    || instance.targetActorId !== evidence.targetActorId
    || instance.holderActorId !== (rule === 'vex' ? evidence.attackerActorId : evidence.targetActorId)) {
    return result('FAIL', 'effect-instance-identity-wrong');
  }
  if (!Array.isArray(evidence.beforeEffectIds) || !finite(instance.createdAt)
    || !finite(evidence.attack?.timestamp) || instance.createdAt < evidence.attack.timestamp
    || instance.itemUuid !== `Actor.${evidence.attackerActorId}.Item.${evidence.itemId}`
    || evidence.beforeEffectIds.includes(instance.id!)) {
    return result('INCOMPLETE', 'fresh-effect-causation-not-proven');
  }
  return null;
}

function vexNextAttack(evidence: PilotEvidence): RuleResult {
  const next = evidence.nextAttack;
  const first = evidence.attack!;
  const effectId = evidence.effectReadback!.instance!.id!;
  if (!next || !present(next.attackId) || !present(next.messageId)
    || !present(next.attackerActorId) || !present(next.targetActorId)) {
    return result('INCOMPLETE', 'next-attack-identity-missing');
  }
  if (next.attackId === first.attackId || next.messageId === first.messageId) {
    return result('INCOMPLETE', 'next-attack-not-distinct');
  }
  if (next.attackerActorId !== evidence.attackerActorId || next.targetActorId !== evidence.targetActorId) {
    return result('PRECONDITION_FAILED', 'next-attack-target-mismatch');
  }
  const ledger = next.sourceLedger;
  // Runtime reservations are useful diagnostics; the observed roll must carry the external effect ID.
  if (typeof next.moduleModifiers?.advantage !== 'boolean'
    || typeof next.advantageObservation?.advantage !== 'boolean'
    || !['roll', 'dialog'].includes(next.advantageObservation.source ?? '')) {
    return result('INCOMPLETE', 'module-and-observed-advantage-missing');
  }
  if (next.advantageObservation.source === 'roll'
    && (!Number.isInteger(next.advantageObservation.d20Count) || next.advantageObservation.d20Count! < 1)) {
    return result('INCOMPLETE', 'advantage-dice-count-missing');
  }
  if (!next.moduleModifiers.advantage || !next.advantageObservation.advantage
    || (next.advantageObservation.source === 'roll' && next.advantageObservation.d20Count! < 2)) {
    return result('FAIL', 'vex-advantage-not-observed');
  }
  if (next.advantageObservation.causeEffectId !== effectId) return result('INCOMPLETE', 'vex-advantage-causation-not-proven');
  if (next.effectAfter?.complete !== true || typeof next.effectAfter.present !== 'boolean') {
    return result('INCOMPLETE', 'vex-consumption-readback-missing');
  }
  if (next.effectAfter.present) return result('FAIL', 'vex-not-consumed-after-next-attack');
  if (next.regrant) {
    const repeated: PilotEvidence = { ...evidence, ...next.regrant, damage: next.regrant.damage,
      effectReadback: next.regrant.effectReadback, nextAttack: undefined };
    const issue = common('vex', repeated, result('PASS')) ?? effect('vex', repeated);
    if (issue) return { ...issue, reasons: issue.reasons.map(reason => `vex-regrant-${reason}`) };
  }
  return settled('vex', evidence);
}

function pushGeometry(evidence: PilotEvidence): RuleResult | null {
  const push = evidence.push!;
  const geometry = push.geometry;
  const coordinates = [geometry?.attackerCenter?.x, geometry?.attackerCenter?.y,
    geometry?.targetCenterBefore?.x, geometry?.targetCenterBefore?.y,
    geometry?.targetCenterAfter?.x, geometry?.targetCenterAfter?.y,
    geometry?.gridSizePixels, geometry?.gridDistanceFeet,
    geometry?.measuredDistanceFeet, geometry?.maxDistanceFeet];
  if (!coordinates.every(finite) || typeof geometry?.withinScene !== 'boolean'
    || typeof geometry.collisionClear !== 'boolean') {
    return result('INCOMPLETE', 'push-geometry-proof-missing');
  }
  const source = geometry.attackerCenter!;
  const before = geometry.targetCenterBefore!;
  const after = geometry.targetCenterAfter!;
  const moveX = after.x! - before.x!;
  const moveY = after.y! - before.y!;
  const awayX = before.x! - source.x!;
  const awayY = before.y! - source.y!;
  const cross = Math.abs(awayX * moveY - awayY * moveX);
  const dot = awayX * moveX + awayY * moveY;
  const moveLength = Math.hypot(moveX, moveY);
  const awayLength = Math.hypot(awayX, awayY);
  const impliedGridFeet = Math.max(Math.abs(moveX), Math.abs(moveY)) / geometry.gridSizePixels! * geometry.gridDistanceFeet!;
  if (geometry.gridSizePixels! <= 0 || geometry.gridDistanceFeet! <= 0
    || geometry.maxDistanceFeet !== 10 || geometry.measuredDistanceFeet! <= 0
    || geometry.measuredDistanceFeet! > 10 + 1e-6 || impliedGridFeet > 10 + 1e-6
    || moveLength < 1e-6 || awayLength < 1e-6
    || cross > Math.max(1, awayLength * moveLength) * 1e-6 || dot < -1e-6
    || Math.abs(moveX - (push.tokenAfter!.x! - push.tokenBefore!.x!)) > 1e-6
    || Math.abs(moveY - (push.tokenAfter!.y! - push.tokenBefore!.y!)) > 1e-6
    || !geometry.withinScene || !geometry.collisionClear) {
    return result('FAIL', 'push-destination-not-legal');
  }
  return null;
}

function pilot(rule: PilotRule, evidence: PilotEvidence | undefined, environment: RuleResult): RuleResult {
  const prerequisite = common(rule, evidence, environment);
  if (prerequisite) return prerequisite;
  const checked = evidence!;
  if (rule === 'cleave') {
    const child = checked.mechanic?.childAttack;
    if (!child || !present(child.attackId) || !present(child.messageId) || !present(child.targetActorId)
      || !finite(child.damageApplied) || !finite(child.weaponDamage)
      || typeof child.withinFiveFeet !== 'boolean' || !child.outcome)
      return result('INCOMPLETE', 'cleave-child-attack-readback-missing');
    if (child.parentAttackId !== checked.attack?.attackId || child.attackId === checked.attack?.attackId
      || child.messageId === checked.attack?.messageId || child.targetActorId === checked.targetActorId) {
      return result('INCOMPLETE', 'cleave-child-causation-not-proven');
    }
    if (child.outcome !== 'hit') return result('PRECONDITION_FAILED', 'cleave-child-did-not-hit');
    return child.withinFiveFeet && child.damageApplied === Math.max(0, child.weaponDamage)
      ? result('PASS') : result('FAIL', 'cleave-child-damage-or-range-wrong');
  }
  if (rule === 'graze') {
    const miss = checked.mechanic?.missDamage;
    if (!miss || !finite(miss.applied) || !finite(miss.abilityModifier) || typeof miss.damageRollOccurred !== 'boolean')
      return result('INCOMPLETE', 'graze-miss-damage-readback-missing');
    return miss.applied === Math.max(0, miss.abilityModifier) && !miss.damageRollOccurred
      ? result('PASS') : result('FAIL', 'graze-miss-damage-wrong');
  }
  if (rule === 'nick') {
    const extra = checked.mechanic?.extraAttack;
    if (!extra || !present(extra.attackId) || !present(extra.messageId)
      || typeof extra.sameTurn !== 'boolean' || typeof extra.bonusActionConsumed !== 'boolean'
      || !finite(extra.usesThisTurn)) return result('INCOMPLETE', 'nick-extra-attack-readback-missing');
    if (extra.attackId === checked.attack?.attackId || extra.messageId === checked.attack?.messageId)
      return result('INCOMPLETE', 'nick-extra-attack-not-distinct');
    return extra.sameTurn && !extra.bonusActionConsumed && extra.usesThisTurn === 1
      ? result('PASS') : result('FAIL', 'nick-extra-attack-wrong');
  }
  if (rule === 'sap') {
    const instanceResult = effect('sap', checked);
    if (instanceResult) return instanceResult;
    const next = checked.mechanic?.nextAttack;
    if (!next || !present(next.attackId) || !present(next.messageId)
      || typeof next.disadvantage !== 'boolean' || typeof next.effectConsumed !== 'boolean')
      return result('INCOMPLETE', 'sap-next-attack-readback-missing');
    if (next.attackId === checked.attack?.attackId || next.messageId === checked.attack?.messageId
      || next.causeEffectId !== checked.effectReadback?.instance?.id)
      return result('INCOMPLETE', 'sap-next-attack-causation-not-proven');
    return next.disadvantage && next.effectConsumed ? result('PASS') : result('FAIL', 'sap-disadvantage-or-consumption-missing');
  }
  if (rule === 'topple') {
    const save = checked.mechanic?.save;
    if (!save || !present(save.messageId) || !finite(save.dc) || !finite(save.total)
      || !finite(save.sourceAbilityModifier) || !finite(save.sourceProficiencyBonus)
      || typeof save.failed !== 'boolean' || typeof save.proneAfter !== 'boolean')
      return result('INCOMPLETE', 'topple-save-readback-missing');
    if (save.ability !== 'con') return result('PRECONDITION_FAILED', 'topple-wrong-save');
    if (!save.failed) return result('PRECONDITION_FAILED', 'topple-save-succeeded');
    if (save.dc !== 8 + save.sourceAbilityModifier + save.sourceProficiencyBonus || save.total >= save.dc)
      return result('FAIL', 'topple-dc-or-save-wrong');
    if (!save.proneAfter) return result('FAIL', 'topple-prone-absent');
    if (!Array.isArray(checked.beforeEffectIds) || !present(save.proneEffectId)
      || checked.beforeEffectIds.includes(save.proneEffectId)) return result('INCOMPLETE', 'fresh-prone-status-not-proven');
    return result('PASS');
  }
  if (rule === 'deadly' || rule === 'fatal') {
    if (checked.attack?.critical !== true && checked.attack?.natural20 !== true) return result('PRECONDITION_FAILED', 'critical-hit-required');
    const critical = checked.mechanic?.critical;
    if (!critical || !finite(critical.diceBefore) || !finite(critical.diceAfter)
      || !finite(critical.extraDieFaces) || !finite(critical.extraDiceCount))
      return result('INCOMPLETE', 'critical-dice-readback-missing');
    if (rule === 'fatal' && !finite(critical.replacementDieFaces))
      return result('INCOMPLETE', 'fatal-replacement-die-readback-missing');
    return critical.diceAfter > critical.diceBefore && critical.extraDiceCount === (rule === 'deadly'
      ? checked.qualification?.propertyParams?.dice : 1)
      && critical.extraDieFaces === checked.qualification?.propertyParams?.die
      && (rule !== 'fatal' || critical.replacementDieFaces === critical.extraDieFaces)
      ? result('PASS') : result('FAIL', 'critical-dice-wrong');
  }
  if (rule === 'criticalBleeding') {
    if (checked.attack?.critical !== true && checked.attack?.natural20 !== true) return result('PRECONDITION_FAILED', 'critical-hit-required');
    const bleeding = checked.mechanic?.bleeding;
    if (bleeding?.conditionComplete === true && bleeding.condition === null)
      return result('FAIL', 'bleeding-condition-absent');
    if (!bleeding || !finite(bleeding.tickDamageApplied) || !present(bleeding.damageType)
      || typeof bleeding.endedAfterHealing !== 'boolean')
      return result('INCOMPLETE', 'bleeding-tick-and-healing-readback-missing');
    const condition = bleeding.condition;
    if (!condition || !present(condition.id) || condition.conditionId !== 'bleeding'
      || condition.sourceUuid !== `Actor.${checked.attackerActorId}`
      || !present(condition.origin) || !condition.origin.startsWith(`Actor.${checked.attackerActorId}.Item.${checked.itemId}`)
      || !finite(condition.createdAt) || !finite(checked.attack.timestamp)
      || condition.createdAt < checked.attack.timestamp || !Array.isArray(checked.beforeEffectIds)
      || checked.beforeEffectIds.includes(condition.id) || !condition.params)
      return result('INCOMPLETE', 'fresh-bleeding-condition-not-proven');
    return bleeding.tickDamageApplied > 0 && bleeding.endedAfterHealing
      && bleeding.damageType === checked.qualification?.propertyParams?.damageType
      && condition.params.formula === checked.qualification?.propertyParams?.formula
      && condition.params.mode === checked.qualification?.propertyParams?.mode
      ? result('PASS') : result('FAIL', 'bleeding-tick-or-end-wrong');
  }
  if (rule === 'vex') {
    const instanceResult = effect('vex', checked);
    if (instanceResult) return instanceResult;
    return vexNextAttack(checked);
  }
  if (rule === 'slow') {
    const instanceResult = effect('slow', checked);
    if (instanceResult) return instanceResult;
    if (!finite(checked.speed?.before) || !finite(checked.speed?.after)) {
      return result('INCOMPLETE', 'speed-before-after-missing');
    }
    return checked.speed.after === Math.max(0, checked.speed.before - 10)
      ? settled(rule, checked) : result('FAIL', 'speed-reduction-wrong');
  }
  const push = checked.push;
  if (!push?.decision) return result('INCOMPLETE', 'push-destination-decision-missing');
  if (push.decision === 'cancelled') return result('INCOMPLETE', 'push-destination-cancelled');
  const coordinates = [push.destination?.x, push.destination?.y, push.tokenBefore?.x,
    push.tokenBefore?.y, push.tokenAfter?.x, push.tokenAfter?.y];
  if (!coordinates.every(finite)) return result('INCOMPLETE', 'push-token-coordinates-missing');
  if (push.tokenBefore!.x === push.tokenAfter!.x && push.tokenBefore!.y === push.tokenAfter!.y) {
    return result('FAIL', 'push-token-did-not-move');
  }
  if (push.destination!.x !== push.tokenAfter!.x || push.destination!.y !== push.tokenAfter!.y) {
    return result('FAIL', 'push-token-did-not-reach-selected-destination');
  }
  const geometryResult = pushGeometry(checked);
  if (geometryResult) return geometryResult;
  return settled(rule, checked);
}

const EXACT_ID = /^[A-Za-z0-9]{16}$/;
const FIXTURE_ID = /^WMP-E2E-[A-Za-z0-9_-]{6,40}$/;
const CLEANUP_KINDS = new Set<CleanupKind>(['scene', 'actor', 'item', 'token', 'combat', 'macro', 'chatMessage', 'activeEffect']);

/** Validate a proposed cleanup ledger. This function never deletes objects. */
export function validateCleanupLedger(ledger?: CleanupLedger): RuleResult {
  if (!ledger) return result('NOT_EXECUTED', 'cleanup-ledger-not-supplied');
  if (!FIXTURE_ID.test(ledger.fixtureId) || !Array.isArray(ledger.entries) || ledger.entries.length === 0
    || !Array.isArray(ledger.expectedChatMessageIds) || !Array.isArray(ledger.skippedIds)
    || typeof ledger.combatUsed !== 'boolean' || ledger.originalActiveCombatRestored !== true) {
    return result('INCOMPLETE', 'cleanup-fixture-or-entries-invalid');
  }
  const retained = ledger.retainedLedger;
  if (!retained || !EXACT_ID.test(retained.id) || retained.ownerMarker?.runId !== ledger.fixtureId
    || retained.ownerMarker.role !== 'ledger' || retained.status !== 'cleaned'
    || retained.presentAfterCleanup !== true) {
    return result('INCOMPLETE', 'retained-cleanup-ledger-readback-missing');
  }
  if (ledger.skippedIds.length > 0) return result('INCOMPLETE', 'cleanup-skipped-objects');
  if (ledger.expectedChatMessageIds.some(id => !EXACT_ID.test(id))
    || new Set(ledger.expectedChatMessageIds).size !== ledger.expectedChatMessageIds.length) {
    return result('INCOMPLETE', 'expected-chat-message-ids-invalid');
  }
  const seen = new Set<string>();
  for (const entry of ledger.entries) {
    if (!CLEANUP_KINDS.has(entry.kind) || !EXACT_ID.test(entry.id)
      || entry.id === retained.id || entry.fixtureId !== ledger.fixtureId
      || !present(entry.role) || entry.ownerMarker?.runId !== ledger.fixtureId
      || entry.ownerMarker.role !== entry.role) {
      return result('INCOMPLETE', 'cleanup-entry-not-exact-and-owned');
    }
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return result('INCOMPLETE', 'cleanup-entry-duplicate');
    seen.add(key);
  }
  if (ledger.entries.some(entry => entry.absentAfterCleanup !== true)) {
    return result('INCOMPLETE', 'cleanup-absence-readback-missing');
  }
  if (ledger.combatUsed && (!EXACT_ID.test(ledger.registeredCombatId ?? '')
    || !ledger.entries.some(entry => entry.kind === 'combat' && entry.id === ledger.registeredCombatId && entry.role === 'combat'))) {
    return result('INCOMPLETE', 'registered-combat-cleanup-proof-missing');
  }
  const chatIds = ledger.entries.filter(entry => entry.kind === 'chatMessage').map(entry => entry.id);
  if (chatIds.length !== ledger.expectedChatMessageIds.length
    || chatIds.some(id => !ledger.expectedChatMessageIds.includes(id))) {
    return result('INCOMPLETE', 'attack-chat-cleanup-proof-missing');
  }
  if (retained.finalized !== true || retained.externalReceiptSaved !== true
    || retained.absentAfterFinalization !== true) {
    return result('INCOMPLETE', `retained-task-ledger:${retained.id}`);
  }
  return result('PASS');
}

/** Classify each rule from external observed behavior; missing cases remain NOT_EXECUTED. */
export function classifyWeaponEvidence(receipt: EvidenceReceipt): EvidenceManifest {
  const environment = environmentResult(receipt.environment, receipt.buildIdentity);
  const rules = Object.fromEntries(RULES.map(rule => {
    const evidence = receipt.rules?.[rule];
    const classified = pilot(rule, evidence, environment);
    return [rule, evidence?.source ? { ...classified, source: evidence.source } : classified];
  })) as Record<Rule, RuleResult>;
  return { environment, rules, cleanup: validateCleanupLedger(receipt.cleanup) };
}
