import type { EvidenceReceipt, PilotEvidence } from './evidence.ts';

type Data = Record<string, any>;
const object = (value: unknown): Data | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Data : undefined;
const list = (value: unknown): Data[] => Array.isArray(value) ? value : [];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function normalizeCleaveExport(exported: Data, input: EvidenceReceipt): ReturnType<typeof normalizeWeaponExport> {
  const evidence = input.rules?.cleave;
  const incomplete = (reason: string) => ({ input, association: { status: 'incomplete' as const, reason } });
  if (!evidence || evidence.mechanic?.childAttack !== undefined) {
    return { input, association: { status: 'unchanged' } };
  }
  const before = exported.before;
  const after = exported.after;
  const sourceUuid = `Actor.${evidence.attackerActorId}`;
  const primaryUuid = `Actor.${evidence.targetActorId}`;
  const itemUuid = `${sourceUuid}.Item.${evidence.itemId}`;
  const activityUuid = `${itemUuid}.Activity.${evidence.activityId}`;
  const secondaryUuid = after?.secondary?.actorUuid;
  if (!before || !after || typeof exported.runId !== 'string' || before.runId !== exported.runId
    || after.runId !== exported.runId || before.activeTurnKey !== after.activeTurnKey
    || evidence.activeTurnKey !== after.activeTurnKey || after.source?.actorUuid !== sourceUuid
    || before.source?.actorUuid !== sourceUuid || before.target?.actorUuid !== primaryUuid
    || after.target?.actorUuid !== primaryUuid || typeof secondaryUuid !== 'string'
    || secondaryUuid !== `Actor.${after.ledger?.actorIds?.secondary}` || secondaryUuid === primaryUuid
    || secondaryUuid === sourceUuid || before.secondary?.actorUuid !== secondaryUuid) {
    return incomplete('cleave-batch-or-actor-mismatch');
  }
  if (input.buildIdentity?.status !== 'PASS' || before.buildIdentity?.observedBuildId !== input.buildIdentity.observedBuildId
    || after.buildIdentity?.observedBuildId !== input.buildIdentity.observedBuildId) return incomplete('cleave-build-mismatch');
  const geometry = after.cleaveGeometry;
  if (!geometry || !before.cleaveGeometry || !finite(geometry.reachFeet)
    || !finite(geometry.sourceToSecondaryFeet) || !finite(geometry.primaryToSecondaryFeet)
    || JSON.stringify(geometry) !== JSON.stringify(before.cleaveGeometry)) return incomplete('cleave-geometry-missing-or-changed');
  for (const role of ['source', 'target', 'secondary']) {
    const a = before[role]?.token;
    const b = after[role]?.token;
    if (!a || !b || ['id', 'x', 'y', 'width', 'height', 'elevation'].some(key => a[key] !== b[key])) {
      return incomplete('cleave-token-moved-during-case');
    }
  }
  const ledgers = list(after.source.moduleLedger);
  const parents = ledgers.filter(entry => entry.attackId === evidence.attack?.attackId && !entry.parentAttackId);
  if (parents.length !== 1) return incomplete('cleave-parent-ledger-ambiguous');
  const parent = parents[0]!;
  const children = ledgers.filter(entry => entry.parentAttackId === parent.attackId);
  if (children.length !== 1) return incomplete('cleave-child-ledger-missing-or-ambiguous');
  const child = children[0]!;
  const sameIdentity = (entry: Data) => entry.sourceActorUuid === sourceUuid && entry.itemUuid === itemUuid
    && entry.activityUuid === activityUuid && entry.turnKey === after.activeTurnKey;
  if (!sameIdentity(parent) || !sameIdentity(child) || parent.step !== 'committed' || child.step !== 'committed'
    || parent.targetActorUuid !== primaryUuid || child.targetActorUuid !== secondaryUuid
    || child.targetTokenUuid !== after.secondary.token.uuid || child.attackId === parent.attackId
    || child.outcome !== 'hit' || child.critical !== false
    || parent.attackMessageId !== evidence.attack?.messageId
    || (parent.steps?.['dnd2024.cleave'] ?? parent.steps?.dnd2024?.cleave) !== 'settled'
    || !parent.usedRuleIds?.includes('dnd2024.cleave') || child.usedRuleIds?.length
    || ledgers.some(entry => entry.parentAttackId === child.attackId)
    || ledgers.filter(entry => entry.turnKey === parent.turnKey && entry.usedRuleIds?.includes('dnd2024.cleave')).length !== 1) {
    return incomplete('cleave-child-ledger-not-settled-or-linked');
  }
  const messages = list(exported.newMessages);
  const nativeFor = (entry: Data) => messages.filter(message => message.moduleFlags?.attackId === entry.attackId
    && message.dnd5eFlags?.roll?.type === 'attack');
  const parentRolls = nativeFor(parent);
  const childRolls = nativeFor(child);
  if (parentRolls.length !== 1 || childRolls.length !== 1) return incomplete('cleave-native-message-ambiguous');
  const parentNative = parentRolls[0]!;
  const native = childRolls[0]!;
  const validMessage = (message: Data, targetUuid: string) => message.moduleFlags?.e2eFixture?.runId === exported.runId
    && message.dnd5eFlags?.item?.uuid === itemUuid && message.dnd5eFlags?.activity?.uuid === activityUuid
    && message.dnd5eFlags?.targets?.length === 1 && message.dnd5eFlags.targets[0]?.uuid === targetUuid;
  if (parentNative.id !== parent.attackMessageId || native.id !== child.attackMessageId
    || !validMessage(parentNative, primaryUuid) || !validMessage(native, secondaryUuid)
    || (native.moduleFlags.parentAttackId !== undefined && native.moduleFlags.parentAttackId !== parent.attackId)
    || !finite(native.timestamp) || !finite(parentNative.timestamp) || native.timestamp <= parentNative.timestamp) {
    return incomplete('cleave-native-identity-mismatch');
  }
  const cards = messages.filter(message => message.id === native.moduleFlags.midiCardId);
  if (cards.length !== 1) return incomplete('cleave-midi-card-ambiguous');
  const card = cards[0]!;
  const options = card.midiFlags?.attackRoll?.options;
  if (!validMessage(card, secondaryUuid) || card.moduleFlags?.attackId !== child.attackId
    || card.moduleFlags?.parentAttackId !== parent.attackId || options?.__fvttWeaponMasteryUse !== child.attackId) {
    return incomplete('cleave-midi-card-link-missing');
  }
  const attackRolls = list(native.rolls).filter(roll => roll.type === 'attack');
  const cardAttacks = list(card.rolls).filter(roll => roll.type === 'attack');
  if (attackRolls.length !== 1 || cardAttacks.length !== 1 || !finite(attackRolls[0]!.total)
    || attackRolls[0]!.total !== cardAttacks[0]!.total || !finite(after.secondary.ac?.value)
    || attackRolls[0]!.total < after.secondary.ac.value) return incomplete('cleave-child-hit-not-proven');
  const proof = after.secondary.damageProof;
  if (!proof || proof.schemaVersion !== 1 || typeof proof.nonce !== 'string' || !proof.nonce
    || typeof child.requesterId !== 'string' || !child.requesterId
    || proof.attackId !== child.attackId || proof.attackMessageId !== native.id || proof.damageMessageId !== card.id
    || proof.actorUuid !== sourceUuid || proof.targetActorUuid !== secondaryUuid
    || proof.requesterId !== child.requesterId || child.requesterId !== parent.requesterId
    || proof.before?.hp !== before.secondary.hpValue || proof.before?.tempHp !== before.secondary.tempHp
    || proof.after?.hp !== after.secondary.hpValue || proof.after?.tempHp !== after.secondary.tempHp) {
    return incomplete('cleave-child-damage-proof-missing');
  }
  const damages = list(card.rolls).filter(roll => roll.type !== 'attack');
  if (damages.length !== 1) return incomplete('cleave-base-damage-roll-ambiguous');
  const damage = damages[0]!;
  const dice = list(damage.dice);
  const formula = typeof damage.formula === 'string' ? /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(damage.formula) : null;
  const results = dice.length === 1 ? list(dice[0]!.results).filter(result => result.active !== false) : [];
  if (!formula || dice.length !== 1 || Number(formula[2]) !== dice[0]!.faces || results.length !== Number(formula[1])
    || !results.length || results.some(result => !finite(result.result) || result.result < 1 || result.result > dice[0]!.faces)) {
    return incomplete('cleave-single-base-dice-not-proven');
  }
  const rolledDice = results.reduce((sum, result) => sum + result.result, 0);
  const flatModifier = formula[4] ? Number(formula[4]) * (formula[3] === '-' ? -1 : 1) : 0;
  const abilityModifier = after.source.abilities?.[options.ability]?.mod;
  const applied = proof.before.hp + proof.before.tempHp - proof.after.hp - proof.after.tempHp;
  if (!finite(damage.total) || damage.total !== rolledDice + flatModifier || !finite(abilityModifier)
    || before.source.abilities?.[options.ability]?.mod !== abilityModifier || !finite(applied)
    || applied !== Math.max(0, damage.total)) return incomplete('cleave-damage-readback-inconsistent');
  const childAttack = { attackId: child.attackId, parentAttackId: parent.attackId, messageId: native.id,
    targetActorId: after.secondary.actorId, outcome: 'hit' as const, damageApplied: applied,
    weaponDamage: rolledDice + Math.min(0, abilityModifier),
    withinFiveFeet: geometry.primaryToSecondaryFeet <= 5 && geometry.sourceToSecondaryFeet <= geometry.reachFeet };
  return { input: { ...input, rules: { ...input.rules, cleave: { ...evidence,
    mechanic: { ...evidence.mechanic, childAttack } } } },
    association: { status: 'derived', attackId: child.attackId, messageId: native.id, scope: 'cleave-child-attack-and-damage' } };
}

/** Link already captured observations, without editing the export or touching Foundry.
 * Automatic association covers same-weapon Midi Vex and a single-base-roll Midi Cleave hit.
 * Other paths retain their explicit observations and existing incomplete results.
 */
export function normalizeWeaponExport(value: unknown): {
  input: EvidenceReceipt;
  association: { status: 'unchanged' | 'incomplete' | 'derived'; reason?: string; attackId?: string; messageId?: string;
    scope?: 'advantage-and-consumption' | 'advantage-consumption-and-regrant' | 'cleave-child-attack-and-damage' };
} {
  const exported = object(value) ?? {};
  const input = (object(exported.classifiedInput) ?? exported) as EvidenceReceipt;
  if (exported.scenario === 'cleave') return normalizeCleaveExport(exported, input);
  const vex = input.rules?.vex;
  const unchanged = { input, association: { status: 'unchanged' as const } };
  if (exported.scenario !== 'vex' || !vex || vex.nextAttack !== undefined) return unchanged;
  const incomplete = (reason: string) => ({ input, association: { status: 'incomplete' as const, reason } });
  const checkpoint = object(exported.vexCheckpoint);
  const preRoll = object(exported.vexPreRoll);
  const after = object(exported.after);
  const firstEffect = vex.effectReadback?.instance;
  if (!checkpoint || checkpoint.status !== 'SAVED' || !firstEffect
    || checkpoint.attackId !== vex.attack?.attackId || checkpoint.attackMessageId !== vex.attack?.messageId
    || checkpoint.effectId !== firstEffect.id || checkpoint.attackerActorId !== vex.attackerActorId
    || checkpoint.targetActorId !== vex.targetActorId) return incomplete('first-checkpoint-link-missing');
  if (!preRoll || preRoll.status !== 'READY' || preRoll.selectedMode !== 'advantage'
    || preRoll.offeredAdvantage !== true || preRoll.effectId !== firstEffect.id
    || preRoll.targetActorId !== vex.targetActorId || !finite(preRoll.recordedAt)
    || !finite(checkpoint.capturedAt) || preRoll.recordedAt < checkpoint.capturedAt) {
    return incomplete('vex-preroll-link-missing');
  }
  const sourceUuid = `Actor.${vex.attackerActorId}`;
  const targetUuid = `Actor.${vex.targetActorId}`;
  const itemUuid = `${sourceUuid}.Item.${vex.itemId}`;
  const activityUuid = `${itemUuid}.Activity.${vex.activityId}`;
  if (!after || typeof exported.runId !== 'string' || exported.before?.runId !== exported.runId
    || after.runId !== exported.runId || after.source?.actorUuid !== sourceUuid
    || after.target?.actorUuid !== targetUuid || !Array.isArray(after.source.effects)
    || after.activeTurnKey !== exported.before?.activeTurnKey) return incomplete('batch-or-readback-mismatch');
  const messages = list(exported.newMessages);
  const candidates = messages.filter(message => message.dnd5eFlags?.roll?.type === 'attack'
    && typeof message.moduleFlags?.attackId === 'string' && message.moduleFlags.attackId !== checkpoint.attackId
    && message.dnd5eFlags?.item?.uuid === itemUuid && message.dnd5eFlags?.activity?.uuid === activityUuid
    && finite(message.timestamp) && message.timestamp > preRoll.recordedAt);
  if (candidates.length !== 1) return incomplete('next-attack-missing-or-ambiguous');
  const native = candidates[0]!;
  const attackId = native.moduleFlags.attackId;
  if (native.moduleFlags.e2eFixture?.runId !== exported.runId
    || native.dnd5eFlags.targets?.length !== 1 || native.dnd5eFlags.targets[0]?.uuid !== targetUuid) {
    return incomplete('next-attack-target-or-batch-mismatch');
  }
  const ledgers = list(after.source.moduleLedger).filter(entry => entry.attackId === attackId);
  if (ledgers.length !== 1) return incomplete('next-attack-ledger-ambiguous');
  const ledger = ledgers[0]!;
  if (ledger.sourceActorUuid !== sourceUuid || ledger.targetActorUuid !== targetUuid
    || ledger.itemUuid !== itemUuid || ledger.activityUuid !== activityUuid
    || ledger.attackMessageId !== native.id || !list(ledger.reservations).some(reservation =>
      reservation.kind === 'vex' && reservation.actorUuid === sourceUuid
      && reservation.targetActorUuid === targetUuid && reservation.ticket?.attackId === attackId
      && reservation.ticket?.effectId === firstEffect.id)) return incomplete('vex-reservation-link-missing');
  const cards = messages.filter(message => message.id === native.moduleFlags.midiCardId);
  if (cards.length !== 1) return incomplete('midi-card-link-ambiguous');
  const card = cards[0]!;
  const options = card.midiFlags?.attackRoll?.options;
  if (card.moduleFlags?.e2eFixture?.runId !== exported.runId
    || card.dnd5eFlags?.item?.uuid !== itemUuid || card.dnd5eFlags?.activity?.uuid !== activityUuid
    || card.dnd5eFlags?.targets?.length !== 1 || card.dnd5eFlags.targets[0]?.uuid !== targetUuid
    || options?.__fvttWeaponMasteryUse !== attackId || typeof options.advantage !== 'boolean') {
    return incomplete('midi-roll-identity-or-mode-missing');
  }
  const rolls = list(native.rolls).filter(roll => roll.type === 'attack');
  if (rolls.length !== 1) return incomplete('next-attack-roll-ambiguous');
  const roll = rolls[0]!;
  const dice = list(roll.dice).filter(die => die.faces === 20);
  const results = dice.length === 1 ? list(dice[0]!.results) : [];
  const active = results.filter(result => result.active !== false && result.discarded !== true);
  const targetAc = vex.attack?.targetAc;
  if (!finite(roll.total) || !finite(targetAc) || active.length !== 1
    || results.some(result => !finite(result.result))) return incomplete('next-attack-dice-or-ac-missing');
  const natural = active[0]!.result;
  const hit = natural !== 1 && (natural === 20 || roll.total >= targetAc);
  const next: NonNullable<PilotEvidence['nextAttack']> = {
    attackId, messageId: native.id, attackerActorId: vex.attackerActorId, targetActorId: vex.targetActorId,
    moduleModifiers: { advantage: true },
    advantageObservation: { source: 'roll', advantage: options.advantage,
      d20Count: results.length, causeEffectId: firstEffect.id },
    effectAfter: { complete: true, present: after.source.effects.some((effect: Data) => effect.id === firstEffect.id) },
  };
  // A qualifying second hit must also regrant Vex. Missing proof stays incomplete;
  // an observed absence of the new effect after proven damage is a real failure.
  if (hit) {
    const proof = object(after.target.damageProof);
    const hp = [proof?.before?.hp, proof?.before?.tempHp, proof?.after?.hp, proof?.after?.tempHp];
    const linkedDamage = !!proof && proof.attackId === attackId && proof.attackMessageId === native.id
      && proof.damageMessageId === card.id && proof.actorUuid === sourceUuid && proof.targetActorUuid === targetUuid
      && typeof proof.nonce === 'string' && proof.requesterId === ledger.requesterId && hp.every(finite)
      && proof.before.hp === checkpoint.damage?.hpAfter && proof.before.tempHp === checkpoint.damage?.tempHpAfter
      && proof.after.hp === after.target.hpValue && proof.after.tempHp === after.target.tempHp;
    const replacements = after.source.effects.filter((effect: Data) => {
      const instance = effect.flags?.['fvtt-custom-conditions']?.weaponEffect;
      return effect.id !== firstEffect.id && effect.disabled !== true && instance?.enabled === true
        && instance.effectKind === 'vex' && instance.source?.actorUuid === sourceUuid
        && instance.source?.itemUuid === itemUuid && instance.target?.actorUuid === targetUuid;
    });
    const replacement = replacements.length === 1 ? replacements[0] : undefined;
    const instance = replacement?.flags?.['fvtt-custom-conditions']?.weaponEffect;
    next.regrant = {
      attack: { attackId, messageId: native.id, timestamp: native.timestamp, total: roll.total, targetAc,
        outcome: 'hit', natural20: natural === 20, natural1: false },
      ...(linkedDamage ? { damage: { accepted: true,
        amount: proof!.before.hp + proof!.before.tempHp - proof!.after.hp - proof!.after.tempHp,
        hpBefore: proof!.before.hp, hpAfter: proof!.after.hp,
        tempHpBefore: proof!.before.tempHp, tempHpAfter: proof!.after.tempHp } } : {}),
      beforeEffectIds: [...(vex.beforeEffectIds ?? []), firstEffect.id!],
      effectReadback: { complete: replacements.length <= 1,
        instance: instance ? { id: replacement.id, kind: 'vex', holderActorId: vex.attackerActorId,
          sourceActorId: vex.attackerActorId, targetActorId: vex.targetActorId,
          itemUuid: instance.source.itemUuid, createdAt: instance.createdAt } : null },
    };
  }
  return { input: { ...input, rules: { ...input.rules, vex: { ...vex, nextAttack: next } } },
    association: { status: 'derived', attackId, messageId: native.id,
      scope: hit ? 'advantage-consumption-and-regrant' : 'advantage-and-consumption' } };
}
