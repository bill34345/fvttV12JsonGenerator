import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installCriticalMaxModifier } from "../src/core/critical-die";
import { applyCriticalConfiguredRolls } from "../src/runtime";

type AnyRecord = Record<string, any>;

class MockDie {
  static MODIFIERS: Record<string, unknown> = {};
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

  getTooltipData(): AnyRecord {
    return {
      rolls: this.results.map((result) => ({ result: String(result.result), classes: `die d${this.faces}` }))
    };
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
let previousHooks: unknown;

beforeEach(() => {
  previousGame = globals.game;
  previousFoundry = globals.foundry;
  previousHooks = globals.Hooks;
  MockDie.MODIFIERS = {};
  globals.foundry = { dice: { terms: { Die: MockDie, OperatorTerm: MockOperatorTerm } } };
  globals.Hooks = { on() {} };
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
  globals.Hooks = previousHooks;
});

describe("critical configured damage integration", () => {
  test("uses compatible interfaces on unknown release labels with arbitrary optional module versions", () => {
    globals.game.version = "future-core";
    globals.game.system.version = "future-system";
    globals.game.modules = new Map(["midi-qol", "dae", "dice-so-nice"].map(id => [id, { active: true, version: "unlisted" }]));
    const roll = damageRoll([new MockDie({ number: 2, faces: 8 })]);
    expect(applyCriticalConfiguredRolls([roll], damageConfig("mwak", [{ base: true }], "weapon"))).toBeTrue();
    expect(roll.terms[0]).toMatchObject({ number: 2, faces: 8, modifiers: ["critmax8"] });
  });

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
    expect(baseRoll.terms).toHaveLength(3);
    expect(baseRoll.terms[0]).toMatchObject({ number: 2, faces: 8, modifiers: ["critmax8"] });
    expect(baseRoll.terms[1]).toMatchObject({ operator: "+" });
    expect(baseRoll.terms[2]).toBe(rider);
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
    expect(baseRoll.terms[0]).toMatchObject({ number: 2, faces: 8, modifiers: ["critmax8"] });
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
      expect(spellRoll.terms[0]).toMatchObject({ number: 4, faces: 6, modifiers: ["cs>=5", "critmax6"] });
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

  test("declines ambiguous base maps and unknown evaluation/result layouts without mutating dice", () => {
    const cases = [
      { base: [{ base: false }], change: (_roll: AnyRecord) => {} },
      { base: [{ base: true }, { base: true }], change: (_roll: AnyRecord) => {} },
      { base: [{ base: true }], change: (roll: AnyRecord) => { delete roll._evaluated; } },
      { base: [{ base: true }], change: (roll: AnyRecord) => { delete roll.terms[0].results; } },
      { base: [{ base: true }], change: (roll: AnyRecord) => { roll.terms[0].results = [{ result: 3 }]; } },
    ];
    for (const entry of cases) {
      const roll = damageRoll([new MockDie({ number: 2, faces: 8 })]);
      entry.change(roll);
      const terms = [...roll.terms];
      expect(applyCriticalConfiguredRolls([roll], damageConfig("mwak", entry.base, "weapon"))).toBeFalse();
      expect(roll.terms).toEqual(terms);
      expect(roll.resetCount).toBe(0);
    }
  });

  test("does not apply twice or change a disabled feature", () => {
    const roll = damageRoll([new MockDie({ number: 2, faces: 8 })]);
    const config = damageConfig("mwak", [{ base: true }], "weapon");
    expect(applyCriticalConfiguredRolls([roll], config)).toBeTrue();
    const configured = roll.terms[0];
    expect(applyCriticalConfiguredRolls([roll], config)).toBeFalse();
    expect(roll.terms[0]).toBe(configured);
    expect(roll.resetCount).toBe(1);
    globals.game.settings.get = () => false;
    const ordinary = damageRoll([new MockDie({ number: 2, faces: 8 })]);
    expect(applyCriticalConfiguredRolls([ordinary], config)).toBeFalse();
    expect(ordinary.resetCount).toBe(0);
  });

  test("missing interfaces and an unwritable modifier registry preserve the native roll", () => {
    class FrozenDie extends MockDie { static override MODIFIERS = Object.freeze({}); }
    const roll = damageRoll([new FrozenDie({ number: 2, faces: 8 })]);
    const original = roll.terms[0];
    globals.foundry.dice.terms.Die = FrozenDie;
    expect(() => installCriticalMaxModifier(FrozenDie as any)).not.toThrow();
    expect(applyCriticalConfiguredRolls([roll], damageConfig("mwak", [{ base: true }], "weapon"))).toBeFalse();
    expect(roll.terms[0]).toBe(original);
    expect(roll.resetCount).toBe(0);
    globals.foundry.dice.terms.Die = undefined;
    expect(applyCriticalConfiguredRolls([roll], damageConfig("mwak", [{ base: true }], "weapon"))).toBeFalse();
    expect(roll.terms[0]).toBe(original);
  });

  test("the modifier changes only results[0] and leaves later raw results native", () => {
    expect(installCriticalMaxModifier(MockDie as any)).toBeTrue();
    const modifier = MockDie.MODIFIERS.critmax as ((this: AnyRecord, value: string) => unknown);
    const term = new MockDie({ number: 2, faces: 8, modifiers: ["critmax8"] });
    term.results = [{ result: 3 }, { result: 8 }];

    expect(modifier.call(term, "critmax8")).toBeUndefined();
    expect(term.results).toEqual([{ result: 3, count: 8 }, { result: 8 }]);
  });
});
