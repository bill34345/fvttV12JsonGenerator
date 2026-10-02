import { describe, expect, test } from 'bun:test';
import {
  classifyWeaponEvidence,
  validateCleanupLedger,
  type EvidenceReceipt,
  type PilotEvidence,
} from '../e2e/evidence.ts';

const modules = [
  { id: 'fvtt-weapon-mastery-properties', version: '0.1.0' },
  { id: 'midi-qol', version: '14.0.11' },
  { id: 'fvtt-custom-conditions', version: '0.1.1' },
  { id: 'fvtt-trigger-engine', version: '0.1.1' },
  { id: 'ac5e', version: '1.0.0' },
];
const environment = {
  expected: { worldId: 'cor-cotn', foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', enabledModules: modules },
  observed: { worldId: 'cor-cotn', foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', enabledModules: [...modules].reverse() },
};
const buildIdentity = { status: 'PASS' as const, expectedBuildId: 'build-123', observedBuildId: 'build-123', settings: [] };

function base(rule: 'vex' | 'slow' | 'push'): PilotEvidence {
  return {
    attempted: true,
    source: 'ui-activity',
    attackerActorId: 'ii1B3pHfyjtTM8dE', itemId: '6kj535Edynas8S6R', activityId: 'Activity12345678',
    targetActorId: 'em7UsOZvGx6VpbdS', targetTokenId: 'KEwLkzNwTRCMz5rd',
    qualification: { actorType: 'npc', selectedMasteryRuleId: `dnd2024.${rule}`, grantMastery: true, nativeMasteryUnlocked: false },
    activeTurnKey: 'combat:1:0',
    attack: { attackId: 'attack-1', messageId: 'Message123456789', timestamp: 100, total: 18, targetAc: 10, outcome: 'hit' },
    sourceLedger: { attackId: 'attack-1', outcome: 'hit', turnKey: 'combat:1:0', damageDealt: 7, steps: { attack: 'attack', damage: 'damage', [`dnd2024.${rule}`]: 'settled' } },
    damage: { accepted: true, amount: 7, hpBefore: 30, hpAfter: 23, tempHpBefore: 0, tempHpAfter: 0 },
    effectReadback: { complete: true, instance: {
      id: 'Effect1234567890', kind: rule,
      createdAt: 101, itemUuid: 'Actor.ii1B3pHfyjtTM8dE.Item.6kj535Edynas8S6R',
      holderActorId: rule === 'vex' ? 'ii1B3pHfyjtTM8dE' : 'em7UsOZvGx6VpbdS',
      sourceActorId: 'ii1B3pHfyjtTM8dE', targetActorId: 'em7UsOZvGx6VpbdS',
    } },
    beforeEffectIds: [],
    nextAttack: { attackId: 'attack-2', messageId: 'NextAttack123456',
      attackerActorId: 'ii1B3pHfyjtTM8dE', targetActorId: 'em7UsOZvGx6VpbdS',
      sourceLedger: { attackId: 'attack-2', messageId: 'NextAttack123456',
        steps: { attack: 'attack', committed: 'committed' },
        reservations: [{ kind: 'vex', actorUuid: 'Actor.ii1B3pHfyjtTM8dE',
          ticket: { attackId: 'attack-2', effectId: 'Effect1234567890' },
          targetActorUuid: 'Actor.em7UsOZvGx6VpbdS' }] },
      moduleModifiers: { advantage: true },
      advantageObservation: { source: 'roll', advantage: true, d20Count: 2, causeEffectId: 'Effect1234567890' },
      effectAfter: { complete: true, present: false } },
    speed: { before: 30, after: 20 },
    push: { decision: 'selected', destination: { x: 300, y: 100 }, tokenBefore: { x: 200, y: 100 }, tokenAfter: { x: 300, y: 100 },
      geometry: { attackerCenter: { x: 150, y: 150 }, targetCenterBefore: { x: 250, y: 150 },
        targetCenterAfter: { x: 350, y: 150 }, gridSizePixels: 100, gridDistanceFeet: 5,
        measuredDistanceFeet: 5, maxDistanceFeet: 10, withinScene: true, collisionClear: true } },
  };
}

function classify(rule: 'vex' | 'slow' | 'push', evidence: PilotEvidence, env = environment) {
  return classifyWeaponEvidence({ environment: env, buildIdentity, rules: { [rule]: evidence } }).rules[rule];
}

describe('CoTN weapon evidence gate', () => {
  test('only the three pilot rules have validators, and no absent scenario is passed', () => {
    const manifest = classifyWeaponEvidence({ environment, buildIdentity });
    expect(manifest.environment.status).toBe('PASS');
    expect(Object.keys(manifest.rules)).toHaveLength(11);
    expect(Object.values(manifest.rules).every(rule => rule.status === 'NOT_EXECUTED')).toBe(true);
    expect(manifest.cleanup.status).toBe('NOT_EXECUTED');
  });

  test('Vex old receipt with attack total 8 but no AC and HP proof is incomplete, not failed', () => {
    const vex = base('vex');
    vex.attack = { attackId: 'attack-1', messageId: 'Message123456789', total: 8, outcome: 'miss' };
    vex.damage = undefined;
    vex.effectReadback = undefined;
    expect(classify('vex', vex).status).toBe('INCOMPLETE');
  });

  test('Slow without NPC grant is a failed precondition, even with unchanged speed', () => {
    const slow = base('slow');
    slow.qualification!.grantMastery = false;
    slow.speed = { before: 30, after: 30 };
    expect(classify('slow', slow)).toMatchObject({ status: 'PRECONDITION_FAILED', reasons: ['mastery-not-unlocked'] });
  });

  test('Vex and Slow require the active combat turn and positive accepted damage readback', () => {
    const vex = base('vex');
    vex.activeTurnKey = undefined;
    expect(classify('vex', vex).status).toBe('INCOMPLETE');
    vex.activeTurnKey = 'combat:1:0';
    vex.damage = { accepted: true, amount: 7, hpBefore: 30 };
    expect(classify('vex', vex).status).toBe('INCOMPLETE');
    const slow = base('slow');
    slow.damage!.accepted = false;
    expect(classify('slow', slow).status).toBe('PRECONDITION_FAILED');
  });

  test('temporary HP absorption counts as positive applied damage with both HP pools read back', () => {
    const slow = base('slow');
    slow.damage = { accepted: true, amount: 5, hpBefore: 30, hpAfter: 30, tempHpBefore: 5, tempHpAfter: 0 };
    slow.sourceLedger!.damageDealt = 5;
    expect(classify('slow', slow).status).toBe('PASS');
    slow.damage.tempHpAfter = undefined;
    expect(classify('slow', slow).status).toBe('INCOMPLETE');
  });

  test('Push canceled dialog stays incomplete despite unchanged coordinates', () => {
    const push = base('push');
    push.push = { decision: 'cancelled', tokenBefore: { x: 200, y: 100 }, tokenAfter: { x: 200, y: 100 } };
    expect(classify('push', push)).toMatchObject({ status: 'INCOMPLETE', reasons: ['push-destination-cancelled'] });
  });

  test('complete positive postconditions pass for Vex, Slow, Push', () => {
    for (const rule of ['vex', 'slow', 'push'] as const) expect(classify(rule, base(rule)).status).toBe('PASS');
  });

  test('internal settlement diagnostics do not override external observations', () => {
    const vex = base('vex');
    delete vex.sourceLedger!.steps!['dnd2024.vex'];
    expect(classify('vex', vex).status).toBe('PASS');
    const slow = base('slow');
    slow.sourceLedger!.turnKey = 'combat:old:0';
    expect(classify('slow', slow).status).toBe('PASS');
  });

  test('observed missing effects, advantage, speed reduction, and selected movement are failures', () => {
    const vex = base('vex');
    vex.effectReadback = { complete: true, instance: null };
    expect(classify('vex', vex).status).toBe('FAIL');
    vex.effectReadback = base('vex').effectReadback;
    vex.nextAttack!.advantageObservation!.advantage = false;
    expect(classify('vex', vex).status).toBe('FAIL');
    const slow = base('slow');
    slow.speed!.after = 30;
    expect(classify('slow', slow).status).toBe('FAIL');
    const push = base('push');
    push.push!.tokenAfter = { x: 200, y: 100 };
    expect(classify('push', push).status).toBe('FAIL');
  });

  test('a changed module set prevents gameplay PASS without hard-coding the module count', () => {
    const changed = structuredClone(environment);
    changed.observed.enabledModules.pop();
    expect(classify('slow', base('slow'), changed).status).toBe('PRECONDITION_FAILED');
    const versionDrift = structuredClone(environment);
    versionDrift.observed.enabledModules = versionDrift.observed.enabledModules.map(module =>
      module.id === 'midi-qol' ? { ...module, version: '14.0.12' } : module);
    expect(classify('slow', base('slow'), versionDrift).status).toBe('PRECONDITION_FAILED');
    const missingDependency = structuredClone(environment);
    missingDependency.observed.enabledModules = missingDependency.observed.enabledModules.filter(module => module.id !== 'fvtt-trigger-engine');
    expect(classify('slow', base('slow'), missingDependency).reasons).toEqual(['required-module-disabled:fvtt-trigger-engine']);
    const missing = structuredClone(environment);
    missing.observed.enabledModules = [];
    expect(classify('slow', base('slow'), missing).status).toBe('INCOMPLETE');
  });

  test('a separately captured native baseline may omit Midi-QOL', () => {
    const native = structuredClone(environment);
    native.expected.enabledModules = native.expected.enabledModules.filter(module => module.id !== 'midi-qol');
    native.observed.enabledModules = native.observed.enabledModules.filter(module => module.id !== 'midi-qol');
    const slow = base('slow');
    slow.source = 'runtime-api';
    expect(classify('slow', slow, native)).toMatchObject({ status: 'PASS', source: 'runtime-api' });
  });

  test('a second Vex attack against a different target does not prove advantage', () => {
    const vex = base('vex');
    vex.nextAttack!.targetActorId = 'mgPSVbzCw1dhkZyx';
    expect(classify('vex', vex)).toMatchObject({ status: 'PRECONDITION_FAILED', reasons: ['next-attack-target-mismatch'] });
  });

  test('unrelated advantage and reused first attack cannot produce a Vex PASS', () => {
    const unrelated = base('vex');
    unrelated.nextAttack!.sourceLedger!.reservations = [];
    expect(classify('vex', unrelated).status).toBe('PASS');
    const reused = base('vex');
    reused.nextAttack!.messageId = reused.attack!.messageId;
    expect(classify('vex', reused).reasons).toEqual(['next-attack-not-distinct']);
    const wrongEffect = base('vex');
    wrongEffect.nextAttack!.sourceLedger!.reservations![0]!.ticket!.effectId = 'AnotherEffect123';
    expect(classify('vex', wrongEffect).status).toBe('PASS');
  });

  test('Vex requires module modifier, observed advantage, and effect consumption', () => {
    const vex = base('vex');
    vex.nextAttack!.moduleModifiers!.advantage = false;
    expect(classify('vex', vex).status).toBe('FAIL');
    vex.nextAttack!.moduleModifiers!.advantage = true;
    vex.nextAttack!.effectAfter = undefined;
    expect(classify('vex', vex).status).toBe('INCOMPLETE');
    vex.nextAttack!.effectAfter = { complete: true, present: true };
    expect(classify('vex', vex).status).toBe('FAIL');
  });

  test('Push rejects reverse and overrange destinations even if token moved', () => {
    const reverse = base('push');
    reverse.push!.geometry!.attackerCenter = { x: 450, y: 150 };
    expect(classify('push', reverse).reasons).toEqual(['push-destination-not-legal']);
    const overrange = base('push');
    overrange.push!.geometry!.measuredDistanceFeet = 15;
    expect(classify('push', overrange).reasons).toEqual(['push-destination-not-legal']);
  });

  test('stalled internal ledger does not hide externally proven missing effect, and old effect cannot pass', () => {
    const slow = base('slow');
    slow.sourceLedger = undefined;
    slow.effectReadback = { complete: true, instance: null };
    expect(classify('slow', slow).status).toBe('FAIL');
    slow.effectReadback = base('slow').effectReadback;
    slow.beforeEffectIds = ['Effect1234567890'];
    expect(classify('slow', slow)).toMatchObject({ status: 'INCOMPLETE', reasons: ['fresh-effect-causation-not-proven'] });
    slow.beforeEffectIds = [];
    slow.effectReadback!.instance!.createdAt = 50;
    expect(classify('slow', slow).status).toBe('INCOMPLETE');
  });

  test('all eleven rule validators consume distinct external mechanic observations', () => {
    const rules = Object.fromEntries([
      'cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex', 'deadly', 'fatal', 'criticalBleeding',
    ].map((rule) => [rule, base('push')])) as Record<string, PilotEvidence>;
    for (const [rule, evidence] of Object.entries(rules)) {
      evidence.qualification!.selectedMasteryRuleId = `dnd2024.${rule}`;
      if (['deadly', 'fatal', 'criticalBleeding'].includes(rule)) {
        evidence.qualification!.propertyRuleId = `house.${rule}`;
        evidence.qualification!.propertyKind = rule as 'deadly' | 'fatal' | 'criticalBleeding';
        evidence.qualification!.propertyParams = rule === 'deadly' ? { dice: 1, die: 10 }
          : rule === 'fatal' ? { die: 10 } : { formula: '1d6', mode: 'damage', damageType: 'slashing' };
      }
      if (rule === 'graze') { evidence.attack!.outcome = 'miss'; evidence.attack!.total = 2; }
      if (['deadly', 'fatal', 'criticalBleeding'].includes(rule)) evidence.attack!.critical = true;
      evidence.mechanic = {
        childAttack: { attackId: 'child-attack', messageId: 'ChildMessage123456', parentAttackId: 'attack-1',
          targetActorId: 'another-target', outcome: 'hit', withinFiveFeet: true, weaponDamage: 5, damageApplied: 5 },
        missDamage: { applied: 2, abilityModifier: 2, damageRollOccurred: false },
        extraAttack: { attackId: 'extra-attack', messageId: 'ExtraMessage123456', sameTurn: true,
          bonusActionConsumed: false, usesThisTurn: 1 },
        nextAttack: { attackId: 'next-attack', messageId: 'NextMessage123456', disadvantage: true,
          causeEffectId: 'Effect1234567890', effectConsumed: true },
        save: { messageId: 'SaveMessage123456', ability: 'con', dc: 14, total: 10, failed: true,
          proneAfter: true, proneEffectId: 'ProneEffect12345', sourceAbilityModifier: 3, sourceProficiencyBonus: 3 },
        critical: { diceBefore: 2, diceAfter: 3, extraDieFaces: 10, extraDiceCount: 1, replacementDieFaces: 10 },
        bleeding: { tickDamageApplied: 3, damageType: 'slashing', endedAfterHealing: true,
          condition: { id: 'BleedingEffect12', conditionId: 'bleeding', sourceUuid: 'Actor.ii1B3pHfyjtTM8dE',
            origin: 'Actor.ii1B3pHfyjtTM8dE.Item.6kj535Edynas8S6R', createdAt: 101,
            params: { formula: '1d6', mode: 'damage', damageType: 'slashing' } } },
      };
      evidence.effectReadback = { complete: true, instance: { id: 'Effect1234567890', kind: rule,
        holderActorId: 'em7UsOZvGx6VpbdS', sourceActorId: 'ii1B3pHfyjtTM8dE',
        targetActorId: 'em7UsOZvGx6VpbdS', createdAt: 101,
        itemUuid: 'Actor.ii1B3pHfyjtTM8dE.Item.6kj535Edynas8S6R' } };
      evidence.beforeEffectIds = [];
      if (rule === 'vex') {
        evidence.effectReadback.instance!.holderActorId = 'ii1B3pHfyjtTM8dE';
        evidence.nextAttack = base('vex').nextAttack;
      }
    }
    const manifest = classifyWeaponEvidence({ environment, buildIdentity, rules });
    expect(Object.entries(manifest.rules).filter(([, value]) => value.status !== 'PASS')).toEqual([]);
    rules.sap!.mechanic!.nextAttack!.disadvantage = false;
    expect(classifyWeaponEvidence({ environment, buildIdentity, rules }).rules.sap.status).toBe('FAIL');
    rules.topple!.mechanic!.save!.proneAfter = false;
    rules.topple!.mechanic!.save!.proneEffectId = undefined;
    expect(classifyWeaponEvidence({ environment, buildIdentity, rules }).rules.topple)
      .toMatchObject({ status: 'FAIL', reasons: ['topple-prone-absent'] });
    rules.criticalBleeding!.mechanic!.bleeding = { conditionComplete: true, condition: null };
    expect(classifyWeaponEvidence({ environment, buildIdentity, rules }).rules.criticalBleeding)
      .toMatchObject({ status: 'FAIL', reasons: ['bleeding-condition-absent'] });
  });

  test('raw classifier cannot pass without exact build identity', () => {
    const slow = base('slow');
    expect(classifyWeaponEvidence({ environment, rules: { slow } }).rules.slow)
      .toMatchObject({ status: 'INCOMPLETE', reasons: ['build-identity-missing'] });
    expect(classifyWeaponEvidence({ environment, buildIdentity: { ...buildIdentity, observedBuildId: 'other' }, rules: { slow } }).rules.slow)
      .toMatchObject({ status: 'PRECONDITION_FAILED', reasons: ['build-identity-mismatch'] });
  });
});

describe('task-owned exact-ID cleanup ledger', () => {
  const entry = { kind: 'actor' as const, id: 'ii1B3pHfyjtTM8dE', fixtureId: 'WMP-E2E-72C5627E',
    role: 'source', ownerMarker: { runId: 'WMP-E2E-72C5627E', role: 'source' }, absentAfterCleanup: true };
  const good = {
    fixtureId: 'WMP-E2E-72C5627E',
    entries: [entry],
    expectedChatMessageIds: [] as string[], skippedIds: [] as string[],
    combatUsed: false, originalActiveCombatRestored: true,
    retainedLedger: { id: 'Ledger1234567890', ownerMarker: { runId: 'WMP-E2E-72C5627E', role: 'ledger' as const },
      status: 'cleaned' as const, presentAfterCleanup: true,
      externalReceiptSaved: true, finalized: true, absentAfterFinalization: true },
  };
  test('accepts exact flagged IDs only after cleanup and ledger finalization readbacks', () => {
    expect(validateCleanupLedger(good).status).toBe('PASS');
    expect(validateCleanupLedger({ ...good, entries: [{ ...entry, absentAfterCleanup: false }] }).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...good, retainedLedger: { ...good.retainedLedger, status: 'cleanup-incomplete' } }).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...good, retainedLedger: { ...good.retainedLedger, finalized: false } }).reasons)
      .toEqual(['retained-task-ledger:Ledger1234567890']);
    expect(validateCleanupLedger({ ...good, expectedChatMessageIds: ['ChatMessage12345'] }).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...good, skippedIds: ['actor:ii1B3pHfyjtTM8dE'] }).status).toBe('INCOMPLETE');
  });
  test('active Combat requires exact tagged Combat deletion and prior active Combat restoration', () => {
    const combat = { kind: 'combat' as const, id: 'Combat1234567890', fixtureId: good.fixtureId,
      role: 'combat', ownerMarker: { runId: good.fixtureId, role: 'combat' }, absentAfterCleanup: true };
    const used = { ...good, combatUsed: true, registeredCombatId: combat.id };
    expect(validateCleanupLedger(used).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...used, entries: [...good.entries, combat] }).status).toBe('PASS');
    expect(validateCleanupLedger({ ...used, entries: [...good.entries, combat], originalActiveCombatRestored: false }).status).toBe('INCOMPLETE');
  });
  test('rejects wildcard, broad collection, foreign, duplicate, and unowned entries', () => {
    for (const id of ['*', 'Actor.*', 'all', 'ii1B3pHfyjtTM8d*']) {
      expect(validateCleanupLedger({ ...good, entries: [{ ...entry, id }] }).status).toBe('INCOMPLETE');
    }
    expect(validateCleanupLedger({ ...good, entries: [{ ...entry, fixtureId: 'WMP-E2E-FOREIGN' }] }).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...good, entries: [{ ...entry, ownerMarker: { runId: entry.fixtureId, role: 'target' } }] }).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...good, entries: [{ ...entry, ownerMarker: { runId: 'WMP-E2E-FOREIGN', role: 'source' } }] }).status).toBe('INCOMPLETE');
    expect(validateCleanupLedger({ ...good, entries: [entry, entry] }).status).toBe('INCOMPLETE');
  });
});
