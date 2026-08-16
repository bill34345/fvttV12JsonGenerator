import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyCriticalConfiguredRolls } from "../src/runtime";

type AnyRecord = Record<string, any>;

class MockDie {
  number: number;
  faces: number;
  method: string;
  modifiers: string[];
  options: AnyRecord;
  results: AnyRecord[] = [];
  _evaluated = false;

  constructor({ number, faces, method = "random", modifiers = [], options = {} }: AnyRecord) {
    this.number = number;
    this.faces = faces;
    this.method = method;
    this.modifiers = modifiers;
    this.options = options;
  }
}

class MockOperatorTerm {
  operator: string;

  constructor({ operator }: AnyRecord) {
    this.operator = operator;
  }
}

function damageRoll(terms: AnyRecord[], isCritical = true): AnyRecord {
  return {
    terms,
    isCritical,
    _evaluated: false,
    resetCount: 0,
    resetFormula() { this.resetCount += 1; }
  };
}

function attackMessage(result = 20): AnyRecord {
  return {
    flags: { dnd5e: { roll: { type: "attack" } } },
    rolls: [{ terms: [{ faces: 20, results: [{ result, active: true }] }] }]
  };
}

function damageConfig(actionType: string, rolls: AnyRecord[], itemType = "spell"): AnyRecord {
  return {
    subject: {
      type: "attack",
      actionType,
      item: { type: itemType }
    },
    rolls,
    event: {
      target: {
        closest: () => ({ dataset: { messageId: "attack-message" } })
      }
    }
  };
}

const globals = globalThis as AnyRecord;
let previousGame: unknown;
let previousFoundry: unknown;

beforeEach(() => {
  previousGame = globals.game;
  previousFoundry = globals.foundry;
  globals.foundry = { dice: { terms: { Die: MockDie, OperatorTerm: MockOperatorTerm } } };
  globals.game = {
    version: "14.364",
    system: { id: "dnd5e", version: "5.3.3" },
    settings: { get: (_module: string, key: string) => key === "featureNaturalTwenty" },
    modules: new Map(),
    messages: new Map([["attack-message", attackMessage()]])
  };
});

afterEach(() => {
  globals.game = previousGame;
  globals.foundry = previousFoundry;
});

describe("critical configured damage integration", () => {
  test("keeps every weapon critical die and maximizes only the first die of the unique base roll", () => {
    const untouchedRoll = damageRoll([new MockDie({ number: 2, faces: 4 })]);
    const rider = new MockDie({ number: 2, faces: 6, options: { flavor: "fire" } });
    const baseRoll = damageRoll([
      new MockDie({ number: 2, faces: 8, options: { baseNumber: 1, critical: true } }),
      new MockOperatorTerm({ operator: "+" }),
      rider
    ]);
    const message: AnyRecord = {};

    expect(applyCriticalConfiguredRolls(
      [untouchedRoll, baseRoll],
      damageConfig("mwak", [{ base: false }, { base: true }], "weapon"),
      message
    )).toBeTrue();

    expect(untouchedRoll.resetCount).toBe(0);
    expect(baseRoll.terms).toHaveLength(5);
    expect(baseRoll.terms[0]).toMatchObject({ number: 1, faces: 8, modifiers: ["min8"] });
    expect(baseRoll.terms[1]).toMatchObject({ operator: "+" });
    expect(baseRoll.terms[2]).toMatchObject({ number: 1, faces: 8, modifiers: [] });
    expect(baseRoll.terms[4]).toBe(rider);
    expect(baseRoll.isCritical).toBeTrue();
    expect(message.data.flags["fvtt-house-rules"].criticalFirstDieApplied).toBeTrue();
  });

  test("applies to an explicitly critical roll even when the attack die is not natural 20", () => {
    globals.game.messages.set("attack-message", attackMessage(19));
    const baseRoll = damageRoll([new MockDie({ number: 2, faces: 8 })]);

    expect(applyCriticalConfiguredRolls(
      [baseRoll],
      damageConfig("mwak", [{ base: true }], "weapon")
    )).toBeTrue();
    expect(baseRoll.terms[0]).toMatchObject({ number: 1, faces: 8, modifiers: ["min8"] });
    expect(baseRoll.terms[2]).toMatchObject({ number: 1, faces: 8, modifiers: [] });
  });

  test("applies to the first damage roll of melee and ranged spell attacks", () => {
    for (const actionType of ["msak", "rsak"]) {
      const riderRoll = damageRoll([new MockDie({ number: 2, faces: 4 })]);
      const spellRoll = damageRoll([new MockDie({
        number: 4,
        faces: 6,
        modifiers: ["cs>=5"],
        options: { baseNumber: 2, critical: true, flavor: "force" }
      })]);

      expect(applyCriticalConfiguredRolls(
        [spellRoll, riderRoll],
        damageConfig(actionType, [{}, {}])
      )).toBeTrue();
      expect(spellRoll.terms[0]).toMatchObject({ number: 1, faces: 6, modifiers: ["cs>=5", "min6"] });
      expect(spellRoll.terms[2]).toMatchObject({ number: 3, faces: 6, modifiers: ["cs>=5"] });
      expect(spellRoll.terms[0].options).toMatchObject({ critical: true, flavor: "force" });
      expect(riderRoll.terms).toHaveLength(1);
      expect(riderRoll.terms[0]).toMatchObject({ number: 2, faces: 4, modifiers: [] });
    }
  });

  test("fails closed for save activities, non-critical damage, and evaluated rolls", () => {
    const cases: Array<{ config: AnyRecord; roll: AnyRecord; setup?: () => void }> = [
      {
        config: damageConfig("save", [{}]),
        roll: damageRoll([new MockDie({ number: 2, faces: 8 })])
      },
      {
        config: damageConfig("rsak", [{}]),
        roll: damageRoll([new MockDie({ number: 2, faces: 8 })], false)
      },
      {
        config: damageConfig("rsak", [{}]),
        roll: Object.assign(damageRoll([new MockDie({ number: 2, faces: 8 })]), { _evaluated: true })
      }
    ];

    for (const entry of cases) {
      globals.game.messages.set("attack-message", attackMessage());
      entry.setup?.();
      const originalTerms = [...entry.roll.terms];
      expect(applyCriticalConfiguredRolls([entry.roll], entry.config)).toBeFalse();
      expect(entry.roll.terms).toEqual(originalTerms);
      expect(entry.roll.resetCount).toBe(0);
    }
  });

  test("restores the original term when formula recompilation fails", () => {
    const original = new MockDie({ number: 2, faces: 10 });
    const roll = damageRoll([original]);
    roll.resetFormula = () => { throw new Error("fixture reset failure"); };

    expect(applyCriticalConfiguredRolls(
      [roll],
      damageConfig("rsak", [{}])
    )).toBeFalse();
    expect(roll.terms).toEqual([original]);
  });
});
