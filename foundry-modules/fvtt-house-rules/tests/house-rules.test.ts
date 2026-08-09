import { describe, expect, test } from "bun:test";
import { isAuthority, selectAuthority } from "../src/core/authority";
import { MODULE_ID } from "../src/constants";
import { confirmAmmoRecovery, createAmmoShot, extractAmmoSnapshotFromChatFlags, recordAmmoShot, recoveredTier } from "../src/core/ammo";
import { hpGambleLockId, lowAbilityReminder, resolveHitPointGamble } from "../src/core/hp-gamble";
import { emptyLedger, isTransactionProcessed, ledgerStorageKey, recordTransaction, transactionId } from "../src/core/ledger";
import {
  classifyAttack,
  chooseNaturalOneConsequence,
  naturalOnePool,
  nextWeaponPenalty,
  repairedWeaponPenalty,
  retainedNatural,
  splitConfiguredCriticalFirstDiceTerm,
  transformNaturalTwentyBaseDamageFormula,
  transformNaturalTwentyBaseDamageRoll,
  transformNaturalTwentyBaseWeaponDamage,
  transformNaturalTwentyBaseWeaponRoll
} from "../src/core/natural-roll";
import { buildPotionActivities, maximumHealingFormula } from "../src/core/potion";
import { advanceStealthMovement, endStealthForDash, stealthSpeedLimit } from "../src/core/stealth";
import { inspectMidiAdapter } from "../src/midi-adapter";
import { __testing } from "../src/runtime";
import { explicitTierThreeAmmo, healingPotionDice, retainedAdvantageTwenty } from "./fixtures";

describe("authority and idempotency", () => {
  test("chooses the same active GM on every client", () => {
    const users = [
      { id: "gm-z", active: true, isGM: true },
      { id: "player", active: true, isGM: false },
      { id: "gm-a", active: true, isGM: true },
      { id: "gm-offline", active: false, isGM: true }
    ];
    expect(selectAuthority(users)?.id).toBe("gm-a");
    expect(isAuthority("gm-a", users)).toBe(true);
    expect(isAuthority("gm-z", users)).toBe(false);
  });

  test("records a transaction once and uses only stable non-dice identity", () => {
    expect(transactionId("ammo", "Actor.A", "Item.B", "Message.C")).toBe("ammo:Actor.A:Item.B:Message.C");
    expect(transactionId("ammo", "", "Item.B")).toBeNull();
    const first = recordTransaction(emptyLedger(), "event-1", "ammo-fired", 100);
    const duplicate = recordTransaction(first.ledger, "event-1", "ammo-fired", 101);
    expect(first.applied).toBe(true);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.ledger.processed["event-1"]?.at).toBe(100);
  });

  test("escapes dotted Foundry UUIDs without changing duplicate detection", () => {
    const id = "nat1:Actor.hero.Activity.attack.Message.chat";
    const first = recordTransaction(emptyLedger(), id, "nat1", 100);
    const duplicate = recordTransaction(first.ledger, id, "nat1", 101);
    expect(ledgerStorageKey(id)).toBe("nat1:Actor%2Ehero%2EActivity%2Eattack%2EMessage%2Echat");
    expect(isTransactionProcessed(first.ledger, id)).toBe(true);
    expect(duplicate.applied).toBe(false);
  });
});

describe("HR-02 potion, hit points, and reminder", () => {
  test("creates three native heal activities and maximizes dice but not a fixed modifier", () => {
    const activities = buildPotionActivities(healingPotionDice);
    expect(activities).not.toBeNull();
    expect(Object.keys(activities!)).toEqual(["hrPotionQuick", "hrPotionMax", "hrPotionFeed"]);
    const quick = activities!.hrPotionQuick!;
    const maximum = activities!.hrPotionMax!;
    const feed = activities!.hrPotionFeed!;
    expect(quick.type).toBe("heal");
    expect(quick.activation.type).toBe("bonus");
    expect(maximum.healing.custom).toEqual({ enabled: true, formula: "8 + 2" });
    expect(feed.target.affects.type).toBe("creature");
    expect(Object.values(activities!).every((activity) => /^[A-Za-z0-9]{16}$/.test(activity._id))).toBe(true);
    expect(maximumHealingFormula({ number: 2, denomination: 4, bonus: "@mod" })).toBe("8 + @mod");
  });

  test("rejects malformed structured potion data rather than guessing from a name", () => {
    expect(buildPotionActivities({ number: 0, denomination: 4 })).toBeNull();
    expect(buildPotionActivities({ number: 2, denomination: 4, bonus: "<script>" })).toBeNull();
  });

  test("leaves first class level native and rerolls only a first 1", () => {
    expect(resolveHitPointGamble({ actorId: "a", classId: "c", level: 1, firstRoll: 1 })).toMatchObject({
      accepted: null,
      rerolled: false,
      reason: "level-one"
    });
    expect(resolveHitPointGamble({ actorId: "a", classId: "c", level: 2, firstRoll: 6 })).toMatchObject({
      accepted: 6,
      rerolled: false
    });
    expect(resolveHitPointGamble({ actorId: "a", classId: "c", level: 2, firstRoll: 1, reroll: 1 })).toMatchObject({
      accepted: 1,
      rerolled: true
    });
    expect(hpGambleLockId("a", "c", 2)).toBe("hp:a:c:2");
    expect(hpGambleLockId("a", "c", 0)).toBeNull();
  });

  test("is a contextual reminder only", () => {
    expect(lowAbilityReminder({ str: { value: 4 }, dex: { value: 5 }, wis: { value: 3 } })).toEqual(["str", "wis"]);
    expect(lowAbilityReminder(undefined)).toEqual([]);
  });
});

describe("HR-03 ammunition and stealth", () => {
  const snapshot = explicitTierThreeAmmo;

  test("records only one fired round and tiers +3 -> +2 -> +1 -> +0", () => {
    expect(recoveredTier(3)).toBe(2);
    expect(recoveredTier(2)).toBe(1);
    expect(recoveredTier(1)).toBe(0);
    expect(recoveredTier(0)).toBe(0);
    const shot = createAmmoShot("message-1", "actor-1", "ammo-1", 3, snapshot, 1)!;
    const first = recordAmmoShot(undefined, undefined, shot);
    const duplicate = recordAmmoShot(first.ammoLedger, first.transactionLedger, shot);
    expect(first.applied).toBe(true);
    expect(first.ammoLedger.shots[shot.id]?.recoveredTier).toBe(2);
    expect(duplicate.applied).toBe(false);
  });

  test("requires GM-confirmed recovery and reads native deleted-ammo snapshot path", () => {
    const shot = createAmmoShot("message-2", "actor-1", "ammo-1", 1, snapshot, 1)!;
    const stored = recordAmmoShot(undefined, undefined, shot);
    const recovered = confirmAmmoRecovery(stored.ammoLedger, shot.id);
    const repeated = confirmAmmoRecovery(recovered.ammoLedger, shot.id);
    expect(recovered.applied).toBe(true);
    expect(recovered.shot?.recoveredTier).toBe(0);
    expect(repeated.applied).toBe(false);
    expect(extractAmmoSnapshotFromChatFlags({ dnd5e: { roll: { ammunitionData: snapshot } } })).toEqual(snapshot);
    expect(extractAmmoSnapshotFromChatFlags({ dnd5e: { roll: {} } })).toBeNull();
  });

  test("keeps dotted ammo shot IDs directly addressable", () => {
    const shot = createAmmoShot("Message.A", "Actor.A", "Ammo.A", 3, snapshot, 1)!;
    const stored = recordAmmoShot(undefined, undefined, shot);
    expect(stored.applied).toBe(true);
    expect(confirmAmmoRecovery(stored.ammoLedger, shot.id).applied).toBe(true);
  });

  test("warns only for explicit stealth movement limits", () => {
    const base = { enabled: true, expertise: false, rogueTotalLevel: 0, gmFullSpeedOverride: false, ignoreNextMovement: false, movedFeet: 0 };
    expect(stealthSpeedLimit(30, base)).toBe(15);
    expect(stealthSpeedLimit(30, { ...base, expertise: true })).toBe(20);
    expect(stealthSpeedLimit(30, { ...base, rogueTotalLevel: 7 })).toBe(30);
    const first = advanceStealthMovement(base, 30, 10, "combat:1:1");
    const second = advanceStealthMovement(first.state, 30, 6, "combat:1:1");
    expect(first.warning).toBe(false);
    expect(second.warning).toBe(true);
    const ignored = advanceStealthMovement({ ...base, ignoreNextMovement: true }, 30, 100, "combat:1:1");
    expect(ignored.warning).toBe(false);
    expect(ignored.state.ignoreNextMovement).toBe(false);
    expect(endStealthForDash(base).enabled).toBe(false);
  });
});

describe("HR-04 retained natural rolls", () => {
  test("classifies only dnd5e action types", () => {
    expect(classifyAttack("mwak")).toBe("melee");
    expect(classifyAttack("rwak")).toBe("ranged");
    expect(classifyAttack("msak")).toBe("spell");
    expect(classifyAttack("weapon attack")).toBeNull();
  });

  test("builds equal-weight natural-one pools only from eligible consequences", () => {
    expect(naturalOnePool("melee", "weapon", false)).toEqual(["counter", "ally", "weapon"]);
    expect(naturalOnePool("ranged", "weapon", true)).toEqual(["ally", "weapon", "other"]);
    expect(naturalOnePool("spell", "spell", false)).toEqual(["ally", "self"]);
    expect(chooseNaturalOneConsequence(["ally", "weapon", "other"], 0)).toBe("ally");
    expect(chooseNaturalOneConsequence(["ally", "weapon", "other"], 0.999)).toBe("other");
    expect(chooseNaturalOneConsequence([], 0.5)).toBeNull();
  });

  test("uses the retained die and ignores discarded advantage/disadvantage dice", () => {
    expect(retainedNatural(retainedAdvantageTwenty, 20)).toBe(true);
    expect(retainedNatural([{ faces: 20, results: [{ result: 1, discarded: true }, { result: 20, active: true }] }], 1)).toBe(false);
    expect(retainedNatural([{ faces: 20, results: [{ result: 1, active: true }] }, { faces: 20, results: [{ result: 1, active: true }] }], 1)).toBe(false);
  });

  test("uses Foundry minX for the first base die while retaining every critical die", () => {
    const oneD8 = { number: 1, denomination: 8, isBaseDamage: true };
    const twoD6 = { number: 2, denomination: 6, isBaseDamage: true };
    expect(transformNaturalTwentyBaseDamageFormula(oneD8, "1d8")).toBe("1d8min8 + 1d8");
    expect(transformNaturalTwentyBaseDamageFormula(twoD6, "2d6")).toBe("1d6min6 + 3d6");
    expect(transformNaturalTwentyBaseDamageFormula(twoD6, "2d6 + @mod")).toBe("1d6min6 + 3d6 + @mod");
    expect(transformNaturalTwentyBaseWeaponDamage({ number: 1, denomination: 8, isBaseWeaponDamage: true })).toBe("1d8min8 + 1d8");
    expect(transformNaturalTwentyBaseWeaponDamage({ number: 2, denomination: 6, bonus: "2", isBaseWeaponDamage: true })).toBe("1d6min6 + 3d6 + 2");
    expect(transformNaturalTwentyBaseWeaponDamage({ number: 1, denomination: 8, isBaseWeaponDamage: false })).toBeNull();
    expect(transformNaturalTwentyBaseWeaponDamage({ number: 1, denomination: 8, isBaseWeaponDamage: true, hasAmbiguousSource: true })).toBeNull();

    expect(transformNaturalTwentyBaseDamageRoll(
      twoD6,
      [
        { base: true, parts: ["2d6 + @mod"], options: { isCritical: false, type: "slashing" } },
        { parts: ["1d6"], options: { isCritical: true, type: "fire" } }
      ]
    )).toEqual([
      { base: true, parts: ["1d6min6 + 3d6 + @mod"], options: { isCritical: false, type: "slashing" } },
      { parts: ["1d6"], options: { isCritical: true, type: "fire" } }
    ]);

    expect(transformNaturalTwentyBaseDamageRoll(
      oneD8,
      [{ parts: ["1d8"], options: { isCritical: true } }]
    )).toBeNull();
    expect(transformNaturalTwentyBaseDamageRoll(
      oneD8,
      [{ base: true, parts: ["1d8"], options: { isCritical: true } }]
    )).toBeNull();
    expect(transformNaturalTwentyBaseDamageRoll(
      oneD8,
      [
        { base: true, parts: ["1d8"], options: { isCritical: true } },
        { base: true, parts: ["1d8"], options: { isCritical: true } }
      ]
    )).toBeNull();
    expect(transformNaturalTwentyBaseDamageFormula({ ...oneD8, hasAmbiguousSource: true }, "1d8")).toBeNull();
    expect(transformNaturalTwentyBaseDamageFormula(oneD8, "1d8min8")).toBeNull();
    expect(transformNaturalTwentyBaseDamageFormula(oneD8, "1d8 + 1d4")).toBeNull();

    const liveConfig = [{
      base: true,
      parts: ["1d8", "@mod"],
      options: { isCritical: false, type: "slashing" },
      data: { nonCloneable: () => "native helper" }
    }];
    const transformedLiveConfig = transformNaturalTwentyBaseWeaponRoll(
      { number: 1, denomination: 8, isBaseWeaponDamage: true },
      liveConfig
    );
    expect(transformedLiveConfig?.[0]?.parts).toEqual(["1d8min8 + 1d8", "@mod"]);
    expect(liveConfig[0]?.parts).toEqual(["1d8", "@mod"]);
  });

  test("splits the already-critical first DiceTerm while preserving modifier order and term options", () => {
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 2, faces: 8, modifiers: [] })).toEqual({
      first: { number: 1, faces: 8, modifiers: ["min8"] },
      remaining: { number: 1, faces: 8, modifiers: [] },
      formula: "1d8min8 + 1d8"
    });
    const configuredTerm = { number: 4, faces: 6, modifiers: new Set(["cs>=19", "ro<2"]), options: { flavor: "fire" } };
    expect(splitConfiguredCriticalFirstDiceTerm(configuredTerm)).toEqual({
      first: { number: 1, faces: 6, modifiers: ["cs>=19", "ro<2", "min6"], options: { flavor: "fire" } },
      remaining: { number: 3, faces: 6, modifiers: ["cs>=19", "ro<2"], options: { flavor: "fire" } },
      formula: "1d6cs>=19ro<2min6 + 3d6cs>=19ro<2"
    });
    const splitWithOptions = splitConfiguredCriticalFirstDiceTerm(configuredTerm)!;
    expect(splitWithOptions.first.options).toEqual({ flavor: "fire" });
    expect(splitWithOptions.remaining.options).toEqual({ flavor: "fire" });
    expect(splitWithOptions.first.options).not.toBe(configuredTerm.options);
    expect(splitWithOptions.remaining.options).not.toBe(splitWithOptions.first.options);
    expect(configuredTerm).toEqual({ number: 4, faces: 6, modifiers: new Set(["cs>=19", "ro<2"]), options: { flavor: "fire" } });
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 1, faces: 8, modifiers: [] })).toBeNull();
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 2, faces: 1, modifiers: [] })).toBeNull();
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 2, faces: 8, modifiers: ["min8"] })).toBeNull();
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 2, faces: 8, modifiers: ["max8"] })).toBeNull();
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 2, faces: 8, modifiers: "kh" })).toBeNull();
    expect(splitConfiguredCriticalFirstDiceTerm({ number: 2, faces: 8, modifiers: [], options: [] })).toBeNull();
  });

  test("makes weapon penalties cumulative and repairable", () => {
    expect(nextWeaponPenalty(undefined)).toBe(1);
    expect(nextWeaponPenalty(3)).toBe(4);
    expect(repairedWeaponPenalty(4)).toBe(3);
    expect(repairedWeaponPenalty(1, 10)).toBe(0);
    expect(nextWeaponPenalty(-1)).toBeNull();
  });
});

test("MIDI adapter is isolated to exactly 14.0.11 and tolerates matching DAE only", () => {
  expect(inspectMidiAdapter(new Map())).toEqual({ enabled: false, reason: "absent" });
  expect(inspectMidiAdapter(new Map([["midi-qol", { active: true, version: "14.0.12" }]]))).toEqual({
    enabled: false,
    reason: "unsupported-midi-version"
  });
  expect(inspectMidiAdapter(new Map([
    ["midi-qol", { active: true, version: "14.0.11" }],
    ["dae", { active: true, version: "14.0.12" }]
  ]))).toEqual({ enabled: true, reason: "ready-for-runtime-validation" });
});

function ammoRuntimeFixture({ destroy = false } = {}): { actor: any; item: any; activity: any; message: any; packet: any; restore: () => void } {
  const priorGame = (globalThis as any).game;
  const priorFromUuid = (globalThis as any).fromUuid;
  const users = new Map([
    ["gm", { id: "gm", active: true, isGM: true }],
    ["player", { id: "player", active: true, isGM: false }],
  ]);
  const userCollection: any = {
    get: (id: string) => users.get(id),
    *[Symbol.iterator]() { yield* users.values(); },
  };
  const item: any = {
    id: "ammo",
    name: "Explicit Arrow",
    type: "consumable",
    pack: null,
    inCompendium: false,
    system: { quantity: destroy ? 1 : 2, uses: { autoDestroy: destroy } },
    flags: { [MODULE_ID]: { ammo: { key: "arrow", tier: 3 } } },
    toObject() { return structuredClone({ name: this.name, type: this.type, img: "arrow.png", system: this.system, flags: this.flags }); },
    getFlag(scope: string, key: string) { return this.flags?.[scope]?.[key]; },
  };
  const actor: any = {
    id: "actor",
    uuid: "Actor.actor",
    type: "character",
    pack: null,
    inCompendium: false,
    isOwner: true,
    items: new Map([[item.id, item]]),
    flags: {},
    update: async () => undefined,
    setFlag: async (scope: string, key: string, value: unknown) => {
      actor.flags[scope] ??= {};
      actor.flags[scope][key] = structuredClone(value);
    },
    testUserPermission: (user: any) => user?.id === "player" || user?.isGM === true,
  };
  const weapon: any = { id: "weapon", uuid: "Actor.actor.Item.weapon", type: "weapon" };
  const activity: any = { id: "activity", uuid: "Actor.actor.Item.weapon.Activity.attack", type: "attack", actor, item: weapon };
  const message: any = {
    id: "message-1",
    type: "roll",
    speaker: { actor: actor.id },
    flags: {
      dnd5e: {
        messageType: "roll",
        activity: { type: "attack", id: activity.id, uuid: activity.uuid },
        item: { type: weapon.type, id: weapon.id, uuid: weapon.uuid },
        roll: { type: "attack", ammunition: "ammo" }
      }
    },
    rolls: [{ id: "roll-1" }],
    getAssociatedActor: () => actor,
    getAssociatedActivity: () => activity,
    getAssociatedItem: () => weapon,
  };
  const documents = new Map([
    [actor.uuid, actor],
    [activity.uuid, activity],
  ]);
  (globalThis as any).game = {
    version: "14.364",
    system: { id: "dnd5e", version: "5.3.3" },
    user: users.get("gm"),
    users: userCollection,
    messages: new Map([[message.id, message]]),
    settings: { get: (_scope: string, key: string) => key === "featureAmmo" },
  };
  (globalThis as any).fromUuid = async (uuid: string) => documents.get(uuid) ?? null;
  __testing.captureNativeAmmoMessage(message);
  const restore = () => {
    __testing.reset();
    (globalThis as any).game = priorGame;
    (globalThis as any).fromUuid = priorFromUuid;
  };
  return {
    actor,
    item,
    activity,
    message,
    packet: {
      type: "ammo-roll",
      eventId: "roll-1",
      messageId: message.id,
      actorUuid: actor.uuid,
      activityUuid: activity.uuid,
      ammunitionId: item.id,
      beforeQuantity: item.system.quantity,
      snapshot: item.toObject(),
    },
    restore,
  };
}

describe("runtime ammunition trust and fallback", () => {
  test("queues a post-consumption commit that arrives before asynchronous staging", async () => {
    const fixture = ammoRuntimeFixture();
    try {
      fixture.item.system.quantity = 2;
      fixture.packet.beforeQuantity = 2;
      fixture.packet.snapshot = fixture.item.toObject();
      fixture.item.system.quantity = 1;
      const commit = { ...fixture.packet, type: "ammo-commit" as const };
      expect(await __testing.commitAmmoPacket(commit, "player")).toBe(false);
      expect(await __testing.stageAmmoPacket(fixture.packet, "player")).toBe(true);
      expect(Object.keys(fixture.actor.flags[MODULE_ID].ammoLedger.shots)).toHaveLength(1);
    } finally {
      fixture.restore();
    }
  });

  test("accepts the v14 native message id when the serialized Roll has no id", async () => {
    const fixture = ammoRuntimeFixture();
    try {
      fixture.message.rolls = [{}];
      const packet = { ...fixture.packet, eventId: fixture.message.id };
      expect(await __testing.stageAmmoPacket(packet, "player")).toBe(true);
      fixture.item.system.quantity = 1;
      expect(await __testing.commitAmmoPacket({ ...packet, type: "ammo-commit" }, "player")).toBe(true);
      expect(Object.keys(fixture.actor.flags[MODULE_ID].ammoLedger.shots)).toHaveLength(1);
    } finally {
      fixture.restore();
    }
  });

  test("stages a native message, refuses unconsumed commit, then records exactly once after quantity changes", async () => {
    const fixture = ammoRuntimeFixture();
    try {
      expect(await __testing.stageAmmoPacket(fixture.packet, "player")).toBe(true);
      expect(Object.keys(fixture.actor.flags[MODULE_ID]?.ammoLedger?.shots ?? {})).toHaveLength(0);
      expect(await __testing.commitAmmoPacket({ ...fixture.packet, type: "ammo-commit" }, "player")).toBe(false);
      expect(Object.keys(fixture.actor.flags[MODULE_ID]?.ammoLedger?.shots ?? {})).toHaveLength(0);
      fixture.item.system.quantity = 1;
      expect(await __testing.commitAmmoPacket({ ...fixture.packet, type: "ammo-commit" }, "player")).toBe(true);
      expect(Object.keys(fixture.actor.flags[MODULE_ID].ammoLedger.shots)).toHaveLength(1);
      expect(Object.keys(fixture.actor.flags[MODULE_ID].ledger.processed)).toHaveLength(1);
      expect(await __testing.commitAmmoPacket({ ...fixture.packet, type: "ammo-commit" }, "player")).toBe(false);
    } finally {
      fixture.restore();
    }
  });

  test("rejects a forged roll id, an untrusted sender, and ambiguous deleted-ammo fallback", async () => {
    const fixture = ammoRuntimeFixture({ destroy: true });
    try {
      expect(await __testing.stageAmmoPacket({ ...fixture.packet, eventId: "forged" }, "player")).toBe(false);
      const associatedActivity = fixture.message.getAssociatedActivity;
      fixture.message.getAssociatedActivity = () => ({ ...fixture.activity, id: "other", uuid: "Actor.actor.Item.other.Activity.attack" });
      expect(await __testing.stageAmmoPacket(fixture.packet, "player")).toBe(false);
      fixture.message.getAssociatedActivity = associatedActivity;
      const associatedItem = fixture.message.getAssociatedItem;
      fixture.message.getAssociatedItem = () => ({ id: "other", uuid: "Actor.actor.Item.other", type: "weapon" });
      expect(await __testing.stageAmmoPacket(fixture.packet, "player")).toBe(false);
      fixture.message.getAssociatedItem = associatedItem;
      expect(await __testing.stageAmmoPacket(fixture.packet, "unknown")).toBe(false);
      expect(await __testing.stageAmmoPacket(fixture.packet, "player")).toBe(true);
      fixture.message.flags.dnd5e.roll.ammunitionData = fixture.item.toObject();
      expect(await __testing.commitAmmoPacket({ ...fixture.packet, type: "ammo-commit" }, "player")).toBe(false);
      fixture.message.rolls.push({ id: "roll-2" });
      const second = { ...fixture.packet, eventId: "roll-2" };
      expect(await __testing.stageAmmoPacket(second, "player")).toBe(true);
      expect(await __testing.commitAmmoPacket({ ...second, type: "ammo-commit" }, "player")).toBe(false);
      fixture.item = null;
      fixture.actor.items.delete("ammo");
      await __testing.processDeletedAmmoFallback(fixture.message);
      expect(Object.keys(fixture.actor.flags[MODULE_ID]?.ammoLedger?.shots ?? {})).toHaveLength(0);
    } finally {
      fixture.restore();
    }
  });

  test("does not trust client snapshot system facts or autoDestroy", async () => {
    const fixture = ammoRuntimeFixture();
    try {
      const forgedQuantity = { ...fixture.packet, beforeQuantity: 3, snapshot: structuredClone(fixture.packet.snapshot) };
      forgedQuantity.snapshot.system.quantity = 3;
      expect(await __testing.stageAmmoPacket(forgedQuantity, "player")).toBe(false);
      const forgedAutoDestroy = { ...fixture.packet, snapshot: structuredClone(fixture.packet.snapshot) };
      forgedAutoDestroy.snapshot.system.uses.autoDestroy = true;
      expect(await __testing.stageAmmoPacket(forgedAutoDestroy, "player")).toBe(false);
      expect(Object.keys(fixture.actor.flags[MODULE_ID]?.ammoLedger?.shots ?? {})).toHaveLength(0);
    } finally {
      fixture.restore();
    }
  });

  test("uses the exact attack message for deleted-ammo recovery", async () => {
    const fixture = ammoRuntimeFixture({ destroy: true });
    try {
      expect(await __testing.stageAmmoPacket(fixture.packet, "player")).toBe(true);
      fixture.message.flags.dnd5e.roll.ammunitionData = fixture.item.toObject();
      expect(await __testing.commitAmmoPacket({ ...fixture.packet, type: "ammo-commit" }, "player")).toBe(false);
      fixture.actor.items.delete("ammo");
      await __testing.processDeletedAmmoFallback(fixture.message);
      expect(Object.keys(fixture.actor.flags[MODULE_ID].ammoLedger.shots)).toHaveLength(1);
      await __testing.processDeletedAmmoFallback(fixture.message);
      expect(Object.keys(fixture.actor.flags[MODULE_ID].ammoLedger.shots)).toHaveLength(1);
    } finally {
      fixture.restore();
    }
  });
});
