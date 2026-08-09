export interface HealingDice {
  number: number;
  denomination: number;
  bonus?: string;
}

export interface PotionActivity {
  _id: string;
  type: "heal";
  name: string;
  activation: { type: "action" | "bonus"; value: number | null; override: boolean; condition: string };
  consumption: { targets: Array<unknown>; scaling: { allowed: false; max: string }; spellSlot: boolean };
  description: { chatFlavor: string };
  duration: { concentration: false; value: string; units: string; special: string; override: boolean };
  effects: Array<unknown>;
  range: { value?: string; units: string; special: string; override: boolean };
  target: {
    template: { count: string; contiguous: false; type: string; size: string; width: string; height: string; units: string };
    affects: { count: string; type: "self" | "creature"; choice: boolean; special: string };
    prompt: true;
    override: boolean;
  };
  uses: { spent: number; recovery: Array<unknown>; max: string };
  healing: {
    number: number | null;
    denomination: number | null;
    bonus: string;
    types: string[];
    custom: { enabled: boolean; formula: string };
  };
  flags: { "fvtt-house-rules": { generatedPotionActivity: true; mode: "quick" | "max" | "feed" } };
}

export interface PotionActivities {
  [id: string]: PotionActivity;
}

export function normalizeHealingDice(input: HealingDice): HealingDice | null {
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 100) return null;
  if (!Number.isInteger(input.denomination) || input.denomination < 2 || input.denomination > 1000) return null;
  const bonus = input.bonus?.trim() ?? "";
  if (bonus.length > 200 || /[<>;]/.test(bonus)) return null;
  return { number: input.number, denomination: input.denomination, bonus };
}

export function maximumHealingFormula(input: HealingDice): string | null {
  const dice = normalizeHealingDice(input);
  if (!dice) return null;
  const maximum = dice.number * dice.denomination;
  return dice.bonus ? `${maximum} + ${dice.bonus}` : String(maximum);
}

function activity(
  id: string,
  name: string,
  mode: "quick" | "max" | "feed",
  activation: "action" | "bonus",
  target: "self" | "creature",
  dice: HealingDice
): PotionActivity {
  const normalized = normalizeHealingDice(dice);
  if (!normalized) throw new Error("Invalid structured healing dice");
  const maximum = maximumHealingFormula(normalized)!;
  const isMaximum = mode === "max";
  return {
    _id: id,
    type: "heal",
    name,
    activation: { type: activation, value: 1, override: true, condition: "" },
    consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: false },
    description: { chatFlavor: "" },
    duration: { concentration: false, value: "", units: "inst", special: "", override: false },
    effects: [],
    range: target === "self"
      ? { units: "self", special: "", override: true }
      : { value: "5", units: "ft", special: "", override: true },
    target: {
      template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
      affects: { count: target === "creature" ? "1" : "", type: target, choice: target === "creature", special: "" },
      prompt: true,
      override: true
    },
    uses: { spent: 0, recovery: [], max: "" },
    healing: isMaximum
      ? { number: null, denomination: null, bonus: "", types: ["healing"], custom: { enabled: true, formula: maximum } }
      : {
          number: normalized.number,
          denomination: normalized.denomination,
          bonus: normalized.bonus ?? "",
          types: ["healing"],
          custom: { enabled: false, formula: "" }
        },
    flags: { "fvtt-house-rules": { generatedPotionActivity: true, mode } }
  };
}

/** Builds exactly the three requested native dnd5e Heal activities, without inferring an item name. */
export function buildPotionActivities(dice: HealingDice, labels = {
  quick: "Quick Drink",
  max: "Careful Drink",
  feed: "Administer Potion"
}): PotionActivities | null {
  if (!normalizeHealingDice(dice)) return null;
  return {
    hrPotionQuick: activity("hrPotionQ0000001", labels.quick, "quick", "bonus", "self", dice),
    hrPotionMax: activity("hrPotionM0000001", labels.max, "max", "action", "self", dice),
    hrPotionFeed: activity("hrPotionF0000001", labels.feed, "feed", "action", "creature", dice)
  };
}

export function potionSnapshot(activities: unknown): { schema: 1; activities: unknown } {
  return { schema: 1, activities: structuredClone(activities) };
}
