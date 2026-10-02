import { describe, expect, test } from 'bun:test';
import {
  createDamageProof,
  midiItemCardDamageMatches,
  parseDamageProof,
  recoverDamageProofUpdate,
  validateDamageProof,
  type DamageProof,
  type DamageProofEvidence,
} from '../src/adapters/damage-proof';

function proof(overrides: Partial<DamageProof> = {}): DamageProof {
  return {
    schemaVersion: 1,
    attackId: 'attack-1',
    attackMessageId: 'attack-message-1',
    damageMessageId: 'damage-message-1',
    actorUuid: 'Actor.attacker',
    targetActorUuid: 'Actor.target',
    requesterId: 'user-1',
    before: { hp: 20, tempHp: 5 },
    after: { hp: 17, tempHp: 0 },
    nonce: 'nonce-1',
    ...overrides,
  };
}

function messages(overrides: Partial<DamageProofEvidence['messages']> = {}): DamageProofEvidence['messages'] {
  return {
    attackMessage: {
      id: 'attack-message-1',
      uuid: 'ChatMessage.attack-message-1',
      flags: { dnd5e: { actorUuid: 'Actor.attacker' }, 'fvtt-weapon-mastery-properties': { attackId: 'attack-1' }, targets: ['Actor.target'] },
      author: { id: 'user-1' },
    },
    damageMessage: {
      id: 'damage-message-1',
      uuid: 'ChatMessage.damage-message-1',
      flags: { dnd5e: { originatingMessage: 'attack-message-1', targets: ['Actor.target'] } },
    },
    ...overrides,
  };
}

function evidence(overrides: Partial<DamageProofEvidence> = {}): DamageProofEvidence {
  return {
    updateActor: {
      actorUuid: 'Actor.target',
      changed: { system: { attributes: { hp: { value: 17, temp: 0 } } } },
      after: { hp: 17, tempHp: 0 },
    },
    messages: messages(),
    ...overrides,
  };
}

describe('damage proof', () => {
  test('recovers recursive Foundry flag diffs, including when the source UUID is present', () => {
    const stored = proof({ before: { hp: 191, tempHp: 0 }, after: { hp: 184, tempHp: 0 } });
    const delta = { attackId: stored.attackId, nonce: stored.nonce,
      before: { hp: 191 }, after: { hp: 184 } };
    expect(recoverDamageProofUpdate(delta, stored)).toEqual(stored);
    expect(recoverDamageProofUpdate({ ...delta, actorUuid: stored.actorUuid }, stored)).toEqual(stored);
    expect(delta).toEqual({ attackId: stored.attackId, nonce: stored.nonce, before: { hp: 191 }, after: { hp: 184 } });
  });

  test.each([
    { nonce: 'stale-nonce' },
    { attackId: 'another-attack' },
    { actorUuid: 'Actor.someone-else' },
    { before: { hp: 999 } },
    { after: { tempHp: 1 } },
    { before: { unexpected: 1 } },
    { before: null },
    { unexpected: true },
  ])('rejects a partial proof with mismatching or unknown fields: %j', fields => {
    const stored = proof();
    expect(recoverDamageProofUpdate({ attackId: stored.attackId, nonce: stored.nonce, ...fields }, stored)).toBeUndefined();
  });

  test('a stored flag without a fresh attack identity and nonce cannot recover a proof', () => {
    expect(recoverDamageProofUpdate({}, proof())).toBeUndefined();
    expect(recoverDamageProofUpdate({ attackId: 'attack-1' }, proof())).toBeUndefined();
    expect(recoverDamageProofUpdate({ attackId: 'attack-1', nonce: 'nonce-1' }, null)).toBeUndefined();
  });

  test('accepts the observed Midi 14.0.11 type-0 item card only with matching rolls and target HP record', () => {
    const attack = { total: 18, formula: '2d20adv + 3', options: {
      __fvttWeaponMasteryUse: 'attack-1', 'midi-qol': { rollType: 'attack' }, rollType: 'attack' } };
    const midiAttack = { ...attack, formula: '1d20adv + 3' };
    const damage = { total: 8, formula: '1d6 + 2', options: { type: 'lightning', rollType: 'damage' } };
    const entry = { actorUuid: 'Actor.target', targetUuid: 'Scene.one.Token.target', isHit: true, wasHit: true,
      oldHP: 20, newHP: 12, oldTempHP: 0, newTempHP: 0, hpDamage: 8, tempDamage: 0,
      calcDamageOptions: { midi: { applyDamage: true, isHit: true, sourceActorUuid: 'Actor.attacker',
        targetUuid: 'Scene.one.Token.target' } } };
    const card = { id: 'card', author: { id: 'user-1' },
      flags: { dnd5e: { activity: { uuid: 'Activity.one' }, item: { uuid: 'Actor.attacker.Item.one' } },
        'midi-qol': { type: 0, sourceActorUuid: 'Actor.attacker', hitTargetUuids: ['Scene.one.Token.target'],
          attackRoll: midiAttack, damageRolls: [damage], damageList: [entry] } },
      rolls: [attack, damage] };
    const target = { actorUuid: 'Actor.target', tokenUuid: 'Scene.one.Token.target',
      before: { hp: 20, tempHp: 0 }, after: { hp: 12, tempHp: 0 } };
    expect(midiItemCardDamageMatches(card, target)).toBe(true);
    const linkedAttack = { id: 'attack-message-1', author: { id: 'user-1' }, flags: {
      dnd5e: { activity: { uuid: 'Activity.one' }, item: { uuid: 'Actor.attacker.Item.one' },
        roll: { type: 'attack' }, targets: [{ uuid: 'Actor.target' }] },
      'fvtt-weapon-mastery-properties': { attackId: 'attack-1', midiCardId: 'card' },
    } };
    const linked = { attackMessage: linkedAttack, damageMessage: card, attackId: 'attack-1',
      actorUuid: 'Actor.attacker', requesterId: 'user-1', targetActorUuid: 'Actor.target',
      midiSameCard: { version: '14.0.11', activityUuid: 'Activity.one', itemUuid: 'Actor.attacker.Item.one',
        targetTokenUuid: 'Scene.one.Token.target', linkedAttackCount: 1 } };
    const targetProof = proof({ attackMessageId: 'attack-message-1', damageMessageId: 'card',
      before: { hp: 20, tempHp: 0 }, after: { hp: 12, tempHp: 0 } });
    expect(validateDamageProof(targetProof, evidence({ messages: linked,
      updateActor: { actorUuid: 'Actor.target', changed: { 'system.attributes.hp.value': 12 }, after: { hp: 12, tempHp: 0 } } })).ok).toBe(true);
    for (const invalid of [
      { ...card, flags: { ...card.flags, 'midi-qol': { ...card.flags['midi-qol'], hitTargetUuids: ['Scene.one.Token.target', 'Scene.one.Token.other'] } } },
      { ...card, flags: { ...card.flags, 'midi-qol': { ...card.flags['midi-qol'], sourceActorUuid: 'Actor.other' } } },
      { ...card, flags: { ...card.flags, 'midi-qol': { ...card.flags['midi-qol'], damageList: [{ ...entry, oldHP: 19 }] } } },
      { ...card, rolls: [attack] },
      { ...card, rolls: [attack, { ...damage, total: 7 }] },
    ]) expect(midiItemCardDamageMatches(invalid, target)).toBe(false);
    expect(midiItemCardDamageMatches(card, { ...target,
      before: { hp: 12, tempHp: 0 }, after: { hp: 20, tempHp: 0 } })).toBe(false);
  });

  test('accepts only an exact Midi 14.0.11 attack-and-damage card for the same message ID', () => {
    const same = proof({ attackMessageId: 'card', damageMessageId: 'card' });
    const card = {
      id: 'card', author: { id: 'user-1' },
      flags: {
        dnd5e: { actorUuid: 'Actor.attacker', activity: { uuid: 'Activity.one' }, item: { uuid: 'Actor.attacker.Item.one' } },
        'fvtt-weapon-mastery-properties': { attackId: 'attack-1' },
        'midi-qol': { type: 4, sourceActorUuid: 'Actor.attacker', hitTargetUuids: ['Scene.one.Token.target'] },
      },
      rolls: [
        { options: { 'midi-qol': { rollType: 'attack' } } },
        { options: { 'midi-qol': { rollType: 'defaultDamage' } } },
      ],
    };
    const links = {
      attackMessage: card, damageMessage: card,
      attackId: 'attack-1', actorUuid: 'Actor.attacker', requesterId: 'user-1', targetActorUuid: 'Actor.target',
      midiSameCard: { version: '14.0.11', activityUuid: 'Activity.one', itemUuid: 'Actor.attacker.Item.one', targetTokenUuid: 'Scene.one.Token.target' },
    };
    expect(createDamageProof(same)).toMatchObject({ ok: false, reason: 'invalid-proof-state' });
    expect(validateDamageProof(same, evidence({ messages: links }))).toMatchObject({ ok: true, actualDamage: 8 });
    for (const tampered of [
      { ...card, flags: { ...card.flags, 'midi-qol': { ...card.flags['midi-qol'], sourceActorUuid: 'Actor.other' } } },
      { ...card, flags: { ...card.flags, 'midi-qol': { ...card.flags['midi-qol'], hitTargetUuids: ['Scene.one.Token.other'] } } },
      { ...card, flags: { ...card.flags, 'midi-qol': { ...card.flags['midi-qol'], hitTargetUuids: ['Scene.one.Token.target', 'Scene.one.Token.other'] } } },
      { ...card, rolls: card.rolls.slice(0, 1) },
    ]) {
      expect(validateDamageProof(same, evidence({ messages: { ...links, attackMessage: tampered, damageMessage: tampered } })).ok).toBe(false);
    }
    expect(validateDamageProof(same, evidence({ messages: { ...links, midiSameCard: { ...links.midiSameCard, version: '14.0.12' } } })).ok).toBe(false);
    expect(validateDamageProof(same, evidence({ messages: { ...links, damageMessage: { ...card, id: 'other-card' } } })).ok).toBe(false);
    const linkedAttack = {
      id: 'attack-message-1', author: { id: 'user-1' },
      flags: {
        dnd5e: { actorUuid: 'Actor.attacker', activity: { uuid: 'Activity.one' },
          item: { uuid: 'Actor.attacker.Item.one' }, roll: { type: 'attack' }, targets: [{ actorUuid: 'Actor.target' }] },
        'fvtt-weapon-mastery-properties': { attackId: 'attack-1', midiCardId: 'card' },
      },
    };
    const linked = {
      ...links, attackMessage: linkedAttack,
      midiSameCard: { ...links.midiSameCard, linkedAttackCount: 1 },
    };
    expect(validateDamageProof(proof({ damageMessageId: 'card' }), evidence({ messages: linked }))).toMatchObject({ ok: true, actualDamage: 8 });
    expect(validateDamageProof(proof({ damageMessageId: 'card' }), evidence({ messages: {
      ...linked, midiSameCard: { ...linked.midiSameCard, linkedAttackCount: 2 },
    } })).ok).toBe(false);
    expect(validateDamageProof(proof({ damageMessageId: 'card' }), evidence({ messages: {
      ...linked, attackMessage: { ...linkedAttack, flags: { ...linkedAttack.flags,
        'fvtt-weapon-mastery-properties': { attackId: 'attack-1', midiCardId: 'other-card' } } },
    } })).ok).toBe(false);
  });
  test('derives actual damage from HP and temp HP after a monotonic update', () => {
    const result = createDamageProof(proof());
    expect(result).toMatchObject({ ok: true, actualDamage: 8, hpDamage: 3, tempHpDamage: 5 });
  });

  test('requires a positive damage delta and rejects healing or ambiguous state', () => {
    expect(createDamageProof(proof({ after: { hp: 20, tempHp: 5 } }))).toMatchObject({ ok: false, reason: 'non-positive-actual-damage' });
    expect(createDamageProof(proof({ after: { hp: 21, tempHp: 5 } }))).toMatchObject({ ok: false, reason: 'state-increased' });
    expect(createDamageProof(proof({ after: { hp: 19, tempHp: 6 } }))).toMatchObject({ ok: false, reason: 'state-increased' });
  });

  test('rejects unknown schema fields and oversized identifiers', () => {
    expect(parseDamageProof({ ...proof(), forgedDamage: 99 })).toMatchObject({ ok: false, reason: 'invalid-proof-schema' });
    expect(parseDamageProof({ ...proof(), attackId: 'x'.repeat(257) })).toMatchObject({ ok: false, reason: 'invalid-proof-identifier' });
    expect(parseDamageProof({ ...proof(), before: { hp: 20, tempHp: 5, extra: 1 } })).toMatchObject({ ok: false, reason: 'invalid-proof-state' });
  });

  test('accepts nested or flattened updateActor HP changes after all message links match', () => {
    expect(validateDamageProof(proof(), evidence()).ok).toBe(true);
    const flattened = evidence({
      updateActor: {
        actorUuid: 'Actor.target',
        changed: { 'system.attributes.hp.value': 17, 'system.attributes.hp.temp': 0 },
        after: { hp: 17, tempHp: 0 },
      },
    });
    expect(validateDamageProof(proof(), flattened)).toMatchObject({ ok: true, actualDamage: 8 });
  });

  test('can read the post-update state from the Actor document when after is omitted', () => {
    const actualActor = { uuid: 'Actor.target', system: { attributes: { hp: { value: 17, temp: 0 } } } };
    const actual = evidence({ updateActor: {
      actor: actualActor,
      changed: { 'system.attributes.hp.value': 17, 'system.attributes.hp.temp': 0 },
    } });
    expect(validateDamageProof(proof(), actual)).toMatchObject({ ok: true, actualDamage: 8 });
  });

  test('requires changed HP fields to agree with the post-update Actor state', () => {
    expect(validateDamageProof(proof(), evidence({ updateActor: { actorUuid: 'Actor.target', after: { hp: 17, tempHp: 0 }, changed: {} } }))).toMatchObject({ ok: false, reason: 'missing-hp-update' });
    expect(validateDamageProof(proof(), evidence({ updateActor: { actorUuid: 'Actor.target', after: { hp: 17, tempHp: 0 }, changed: { 'system.attributes.hp.value': 16 } } }))).toMatchObject({ ok: false, reason: 'hp-update-mismatch' });
    expect(validateDamageProof(proof(), evidence({ updateActor: { actorUuid: 'Actor.other', after: { hp: 17, tempHp: 0 }, changed: { 'system.attributes.hp.value': 17 } } }))).toMatchObject({ ok: false, reason: 'update-actor-target-mismatch' });
    expect(validateDamageProof(proof(), evidence({ updateActor: { actorUuid: 'Actor.target', after: { hp: 16, tempHp: 0 }, changed: { 'system.attributes.hp.value': 16 } } }))).toMatchObject({ ok: false, reason: 'updated-state-mismatch' });
    expect(validateDamageProof(proof(), evidence({ updateActor: { actorUuid: 'Actor.target', after: { hp: 17, tempHp: 0 }, changed: { 'system.attributes.hp.value': '17', 'system.attributes.hp.temp': 0 } } }))).toMatchObject({ ok: false, reason: 'invalid-hp-update' });
  });

  test('requires distinct attack and damage messages linked through originatingMessage', () => {
    expect(validateDamageProof(proof(), evidence({ messages: messages({ damageMessage: { id: 'damage-message-1', flags: { dnd5e: { originatingMessage: 'other-attack', targets: ['Actor.target'] } } } }) }))).toMatchObject({ ok: false, reason: 'damage-link-mismatch' });
    expect(validateDamageProof(proof(), evidence({ messages: messages({ attackMessage: { id: 'other-attack', flags: { 'fvtt-weapon-mastery-properties': { attackId: 'attack-1' } }, author: { id: 'user-1' } } }) }))).toMatchObject({ ok: false, reason: 'attack-message-mismatch' });
    expect(validateDamageProof(proof({ attackMessageId: 'same', damageMessageId: 'same' }), evidence())).toMatchObject({ ok: false, reason: 'invalid-proof-state' });
  });

  test('fails closed for missing, conflicting, or mismatched target/requester evidence', () => {
    expect(validateDamageProof(proof(), evidence({ messages: {
      attackMessage: { id: 'attack-message-1', flags: { dnd5e: { actorUuid: 'Actor.attacker' }, 'fvtt-weapon-mastery-properties': { attackId: 'attack-1' } }, author: { id: 'user-1' } },
      damageMessage: { id: 'damage-message-1', flags: { dnd5e: { originatingMessage: 'attack-message-1' } } },
    } }))).toMatchObject({ ok: false, reason: 'missing-message-target' });
    expect(validateDamageProof(proof(), evidence({ messages: messages({ attackMessage: { id: 'attack-message-1', flags: { dnd5e: { actorUuid: 'Actor.attacker' }, 'fvtt-weapon-mastery-properties': { attackId: 'attack-1', targets: ['Actor.one', 'Actor.two'] } }, author: { id: 'user-1' } } }) }))).toMatchObject({ ok: false, reason: 'ambiguous-message-target' });
    expect(validateDamageProof(proof(), evidence({ messages: messages({ requesterId: 'user-2' }) }))).toMatchObject({ ok: false, reason: 'message-requester-mismatch' });
    expect(validateDamageProof(proof(), evidence({ messages: messages({ damageMessage: { id: 'damage-message-1', flags: { dnd5e: { originatingMessage: 'attack-message-1' } } } }) }))).toMatchObject({ ok: false, reason: 'missing-message-target' });
  });

  test('allows the runtime to supply normalized target and requester links when message fields are version-dependent', () => {
    const normalized = evidence({
      messages: {
        attackMessage: { id: 'attack-message-1', flags: { dnd5e: { actorUuid: 'Actor.attacker' }, 'fvtt-weapon-mastery-properties': { attackId: 'attack-1' } } },
        damageMessage: { id: 'damage-message-1', flags: { dnd5e: { originatingMessage: 'attack-message-1' } } },
        actorUuid: 'Actor.attacker',
        targetActorUuid: 'Actor.target',
        requesterId: 'user-1',
      },
    });
    expect(validateDamageProof(proof(), normalized)).toMatchObject({ ok: true, actualDamage: 8 });
  });

  test.each(['native-type', 'legacy-flag'])('accepts a verified same-usage three-message chain with %s', (representation) => {
    const usage = {
      id: 'usage-message', author: { id: 'user-1' }, ...(representation === 'native-type' ? { type: 'usage' } : {}),
      flags: {
        dnd5e: { ...(representation === 'legacy-flag' ? { messageType: 'usage' } : {}), activity: { uuid: 'Activity.one' }, item: { uuid: 'Actor.attacker.Item.one' } },
        'fvtt-weapon-mastery-properties': { attackId: 'attack-1' },
      },
    };
    const attack = {
      id: 'attack-message-1', author: { id: 'user-1' },
      flags: {
        dnd5e: { actorUuid: 'Actor.attacker', originatingMessage: usage.id,
          activity: { uuid: 'Activity.one' }, item: { uuid: 'Actor.attacker.Item.one' }, targets: [{ actorUuid: 'Actor.target' }] },
        'fvtt-weapon-mastery-properties': { attackId: 'attack-1' },
      },
    };
    const damage = { id: 'damage-message-1', flags: { dnd5e: { originatingMessage: usage.id, targets: [{ actorUuid: 'Actor.target' }] } } };
    const linked = evidence({ messages: { attackMessage: attack, damageMessage: damage, usageMessage: usage } });
    expect(validateDamageProof(proof(), linked)).toMatchObject({ ok: true, actualDamage: 8 });
    expect(validateDamageProof(proof(), evidence({ messages: { attackMessage: attack, damageMessage: damage } }))).toMatchObject({ ok: false, reason: 'damage-link-mismatch' });
    const wrongUsage = { ...usage, flags: { ...usage.flags, 'fvtt-weapon-mastery-properties': { attackId: 'other-attack' } } };
    expect(validateDamageProof(proof(), evidence({ messages: { attackMessage: attack, damageMessage: damage, usageMessage: wrongUsage } }))).toMatchObject({ ok: false, reason: 'damage-link-mismatch' });
    const otherUsage = { ...usage, id: 'second-cancelled-usage' };
    const wrongCardDamage = { ...damage, flags: { dnd5e: { ...damage.flags.dnd5e, originatingMessage: otherUsage.id } } };
    expect(validateDamageProof(proof(), evidence({ messages: { attackMessage: attack,
      damageMessage: wrongCardDamage, usageMessage: otherUsage } }))).toMatchObject({ ok: false, reason: 'damage-link-mismatch' });
    const notUsage = { ...usage, type: 'roll', flags: { ...usage.flags, dnd5e: { ...usage.flags.dnd5e, messageType: 'roll' } } };
    expect(validateDamageProof(proof(), evidence({ messages: { attackMessage: attack,
      damageMessage: damage, usageMessage: notUsage } }))).toMatchObject({ ok: false, reason: 'damage-link-mismatch' });
    const conflicting = { ...usage, type: 'usage', flags: { ...usage.flags, dnd5e: { ...usage.flags.dnd5e, messageType: 'roll' } } };
    expect(validateDamageProof(proof(), evidence({ messages: { attackMessage: attack,
      damageMessage: damage, usageMessage: conflicting } }))).toMatchObject({ ok: false, reason: 'damage-link-mismatch' });
  });
});
