import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FLAG, MODULE_ID, SCHEMA_VERSION, SETTING } from "../src/constants";
import {
  configurePotion,
  confirmNaturalOne,
  gambleHitPoints,
  installHouseRulesApi,
  installHouseRulesRuntime,
  previewNaturalTwenty,
  setStealth,
} from "../src/runtime";
import { announceFirstRun, migrateWorldSchema, registerSettings } from "../src/settings";

type AnyRecord = Record<string, any>;

const globals = globalThis as AnyRecord;
const originalGlobals = new Map<string, unknown>();
let values: Map<string, unknown>;
let registrations: Array<{ key: string; data: AnyRecord }>;
let settingWrites: Array<[string, unknown]>;
let notifications: string[];
let hooks: Map<string, (...args: any[]) => unknown>;

beforeEach(() => {
  for (const key of ["game", "ui", "Hooks", "document", "fromUuid", "canvas"]) {
    originalGlobals.set(key, globals[key]);
  }
  values = new Map<string, unknown>([
    [SETTING.schemaVersion, 0],
    [SETTING.setupSeen, false],
    [SETTING.potion, true],
    [SETTING.hpGamble, true],
    [SETTING.lowAbility, true],
    [SETTING.ammo, true],
    [SETTING.stealth, true],
    [SETTING.naturalOne, true],
    [SETTING.naturalTwenty, true],
    [SETTING.lowAbilityThreshold, 4],
    [SETTING.consequenceMultiplier, 0.5],
    [SETTING.stealthRogueLevel, 7],
  ]);
  registrations = [];
  settingWrites = [];
  notifications = [];
  hooks = new Map();
  const users: AnyRecord[] & { get?: (id: string) => AnyRecord | undefined } = [
    { id: "gm", isGM: true, active: true },
    { id: "player", isGM: false, active: true },
  ];
  users.get = (id: string) => users.find((user) => user.id === id);
  globals.game = {
    version: "14.364",
    system: { id: "dnd5e", version: "5.3.3" },
    user: users[0],
    users,
    modules: new Map(),
    settings: {
      register: (_module: string, key: string, data: AnyRecord) => registrations.push({ key, data }),
      get: (_module: string, key: string) => values.get(key),
      set: async (_module: string, key: string, value: unknown) => {
        values.set(key, value);
        settingWrites.push([key, value]);
      },
    },
    i18n: { localize: (key: string) => `loc:${key}` },
    socket: { on() {}, emit() {} },
  };
  globals.ui = { notifications: {
    info: (message: string) => notifications.push(`info:${message}`),
    warn: (message: string) => notifications.push(`warn:${message}`),
    error: (message: string) => notifications.push(`error:${message}`),
  } };
  globals.Hooks = { on: (event: string, callback: (...args: any[]) => unknown) => hooks.set(event, callback) };
  globals.document = { addEventListener() {} };
  globals.canvas = { grid: { measurePath: () => ({ distance: 20 }) } };
  globals.fromUuid = async () => null;
});

afterEach(() => {
  for (const [key, value] of originalGlobals) globals[key] = value;
  originalGlobals.clear();
});

function flaggedDocument(type: string, flags: AnyRecord, activities: AnyRecord = { original: { type: "heal" } }) {
  const writes: AnyRecord[] = [];
  const flagWrites: Array<[string, unknown]> = [];
  const document: AnyRecord = {
    id: `${type}-id`, uuid: `${type}.${type}-id`, type, isOwner: true, pack: null, inCompendium: false,
    flags: { [MODULE_ID]: structuredClone(flags) }, system: { activities, damage: { base: { number: 2, denomination: 6, bonus: "1" } } },
    getFlag: (_module: string, key: string) => document.flags[MODULE_ID]?.[key],
    async setFlag(_module: string, key: string, value: unknown) { document.flags[MODULE_ID][key] = structuredClone(value); flagWrites.push([key, value]); },
    async unsetFlag(_module: string, key: string) { delete document.flags[MODULE_ID][key]; },
    async update(change: AnyRecord) { writes.push(change); if (change["system.activities"]) document.system.activities = structuredClone(change["system.activities"]); },
    toObject: () => ({ system: { activities: structuredClone(document.system.activities) } }),
  };
  return { document, writes, flagWrites };
}

describe("house-rules runtime and settings integration", () => {
  test("registers settings and lets only the deterministic active GM migrate and announce", async () => {
    registerSettings();
    expect(registrations.map((entry) => entry.key)).toEqual([
      SETTING.schemaVersion, SETTING.setupSeen, SETTING.potion, SETTING.hpGamble, SETTING.lowAbility,
      SETTING.ammo, SETTING.stealth, SETTING.naturalOne, SETTING.naturalTwenty,
      SETTING.lowAbilityThreshold, SETTING.consequenceMultiplier, SETTING.consequenceOtherTable, SETTING.stealthRogueLevel,
    ]);
    expect(await migrateWorldSchema()).toBeTrue();
    expect(settingWrites).toContainEqual([SETTING.schemaVersion, SCHEMA_VERSION]);
    await announceFirstRun();
    expect(notifications).toContain("info:loc:FVTT_HOUSE_RULES.FirstRun");
    expect(settingWrites).toContainEqual([SETTING.setupSeen, true]);

    globals.game.user = globals.game.users[1];
    expect(await migrateWorldSchema()).toBeFalse();
    const count = settingWrites.length;
    await announceFirstRun();
    expect(settingWrites).toHaveLength(count);
  });

  test("previews, applies, and restores only explicitly tagged healing potions", async () => {
    const { document: potion, writes } = flaggedDocument("consumable", {
      [FLAG.potion]: { healing: true, dice: { number: 2, denomination: 4, bonus: "2" } },
    });
    const preview = await configurePotion(potion, "preview");
    expect(Object.keys(preview!.activities)).toEqual(["hrPotionQuick", "hrPotionMax", "hrPotionFeed"]);
    expect(await configurePotion(potion, "apply")).toMatchObject({ applied: true });
    expect(potion.flags[MODULE_ID][FLAG.potionSnapshot]).toMatchObject({ schema: 1 });
    expect(writes.at(-1)!["system.activities"].hrPotionMax.healing.custom.formula).toBe("8 + 2");
    expect(await configurePotion(potion, "restore")).toEqual({ restored: true });
    expect(potion.system.activities).toEqual({ original: { type: "heal" } });

    const { document: untagged } = flaggedDocument("consumable", {});
    expect(await configurePotion(untagged, "apply")).toBeNull();
  });

  test("rerolls a one once, persists the accepted class HP, and rejects a replay", async () => {
    const { document: actor, flagWrites } = flaggedDocument("character", {});
    actor.id = "actor";
    const totals = [1, 7];
    actor.rollClassHitPoints = async () => ({ total: totals.shift() });
    const applications: unknown[] = [];
    const classItem = {
      id: "fighter", type: "class", actor,
      advancement: { byType: { HitPoints: [{ apply: async (...args: unknown[]) => applications.push(args) }] } },
    };
    expect(await gambleHitPoints(actor, classItem, 2)).toMatchObject({ accepted: 7, rerolled: true });
    expect(applications).toEqual([[2, { 2: 7 }]]);
    expect(flagWrites.at(-1)?.[0]).toBe(FLAG.hpGamble);
    expect(await gambleHitPoints(actor, classItem, 2)).toBeNull();
    expect(await gambleHitPoints(actor, classItem, 1)).toEqual({ reason: "level-one" });
  });

  test("installs the locked runtime/API and enforces setup and stealth authority", async () => {
    installHouseRulesRuntime();
    expect([...hooks.keys()]).toEqual(expect.arrayContaining([
      "dnd5e.rollAttackV2", "dnd5e.postRollAttack", "createChatMessage", "preUpdateToken", "updateToken",
    ]));
    installHouseRulesApi();
    expect(globals.game.fvttHouseRules.runtime.locked()).toBeTrue();
    expect(globals.game.fvttHouseRules.setup.features()[SETTING.stealth]).toBeTrue();
    expect(await globals.game.fvttHouseRules.setup.setFeature(SETTING.stealth, false)).toBeTrue();
    expect(values.get(SETTING.stealth)).toBeFalse();
    expect(await globals.game.fvttHouseRules.setup.setFeature("unknown", true)).toBeFalse();
    values.set(SETTING.stealth, true);

    const { document: actor } = flaggedDocument("character", {});
    actor.id = "actor";
    const stealth = await setStealth(actor, { enabled: true, expertise: true, rogueTotalLevel: 3, movedFeet: 0 });
    expect(stealth).toMatchObject({ enabled: true, expertise: true, rogueTotalLevel: 3 });
    expect(globals.game.fvttHouseRules.stealth.nonCombatSuggestion(actor, 30)).toBe(20);
    expect(globals.game.fvttHouseRules.stealth.previewMove(stealth, 30, 21, "combat:1:0")).toMatchObject({
      warning: true,
      limit: 20,
      state: { turnKey: "combat:1:0", movedFeet: 21 },
    });
    expect(globals.game.fvttHouseRules.lowAbility.reminder({ system: { abilities: { str: { value: 3 }, dex: { value: 10 } } } })).toEqual(["str"]);
    expect(await globals.game.fvttHouseRules.stealth.dash(actor)).toMatchObject({ enabled: false });
    expect(previewNaturalTwenty({ type: "weapon", system: { damage: { base: { number: 2, denomination: 6, bonus: "1" } } } })).toBe("1d6min6 + 3d6 + 1");

    globals.game.user = globals.game.users[1];
    expect(await globals.game.fvttHouseRules.setup.setFeature(SETTING.stealth, true)).toBeFalse();
    expect(await setStealth(actor, { enabled: false })).toBeNull();
  });

  test("records a validated natural-one dismissal exactly once", async () => {
    const { document: actor } = flaggedDocument("character", { [FLAG.ledger]: { schema: 1, processed: {} } });
    actor.id = "actor";
    const activity = { uuid: "Actor.actor.Activity.attack", actor, type: "attack", getActionType: () => "mwak" };
    const documents = new Map<string, AnyRecord>([[actor.uuid, actor], [activity.uuid, activity]]);
    globals.fromUuid = async (uuid: string) => documents.get(uuid) ?? null;
    const request = { kind: "nat1" as const, actorUuid: actor.uuid, activityUuid: activity.uuid, messageId: "message", attackClass: "melee" as const, consequence: "weapon" as const };
    expect(await confirmNaturalOne(request, { kind: "dismiss" })).toBeTrue();
    expect(await confirmNaturalOne(request, { kind: "dismiss" })).toBeFalse();
    expect(actor.flags[MODULE_ID][FLAG.ledger].processed).toHaveProperty("nat1-confirm:character%2Echaracter-id:message");
  });

  test("fails closed for an unsupported runtime and malformed public API inputs", async () => {
    globals.game.version = "14.365";
    installHouseRulesRuntime();
    expect(notifications).toContain("error:loc:FVTT_HOUSE_RULES.UnsupportedRuntime");

    const { document: potion } = flaggedDocument("consumable", {
      [FLAG.potion]: { healing: true, dice: { number: 0, denomination: 4 } },
    });
    expect(await configurePotion(potion, "preview")).toBeNull();
    const { document: actor } = flaggedDocument("character", {});
    expect(await setStealth(actor, { enabled: true, rogueTotalLevel: -1, movedFeet: 0 })).toBeNull();
    expect(previewNaturalTwenty({ type: "weapon", system: { damage: { base: { number: 1, denomination: 8 } } } })).toBeNull();
  });
});
