import { describe, expect, test } from "bun:test";
// The implementation and its tests are owned by the Foundry Ops product.

import {
  enrichBloodHunterHomebrew,
  fetchBloodHunterSource,
  summarizeBloodHunterActivities,
  validateBloodHunterHomebrew,
} from "../bloodHunterHomebrew";

const sourceFixture = {
  _meta: {
    sources: [{ json: "BloodHunter2024", version: "1.1" }],
  },
  class: [{ name: "血猎手", source: "BloodHunter2024" }],
  foundryClass: [{
    name: "血猎手",
    source: "BloodHunter2024",
    advancement: [],
  }],
  classFeature: [
    { name: "鲜血秘法", className: "血猎手", classSource: "BloodHunter2024", source: "BloodHunter2024", level: 1 },
    { name: "武器精通", className: "血猎手", classSource: "BloodHunter2024", source: "BloodHunter2024", level: 1 },
    { name: "猩红仪式", className: "血猎手", classSource: "BloodHunter2024", source: "BloodHunter2024", level: 2 },
    { name: "黑暗增幅", className: "血猎手", classSource: "BloodHunter2024", source: "BloodHunter2024", level: 10 },
    { name: "刚毅灵魂", className: "血猎手", classSource: "BloodHunter2024", source: "BloodHunter2024", level: 14 },
  ],
  subclassFeature: [
    { name: "升腾走", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "弑灵", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 7 },
    { name: "驱魔血咒", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "弑灵", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 3 },
    { name: "诅咒专家", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "弑灵", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 3 },
    { name: "异界奥秘", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "渎魂", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 7 },
    { name: "噬魂血咒", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "渎魂", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 15 },
    { name: "契约魔法", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "渎魂", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 3 },
    { name: "诱变技艺", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "突变", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 3 },
    { name: "炼金代谢", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "突变", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 7 },
    { name: "公理烙印", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "突变", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 11 },
    { name: "腐蚀血咒", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "突变", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 15 },
    { name: "混种变形", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "化狼", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 3 },
    { name: "怒号血咒", className: "血猎手", classSource: "BloodHunter2024", subclassShortName: "化狼", subclassSource: "BloodHunter2024", source: "BloodHunter2024", level: 15 },
  ],
  optionalfeature: [
    ...[
      "焦虑血咒",
      "捆缚血咒",
      "胀痛血咒",
      "腐蚀血咒",
      "驱魔血咒",
      "暴露诅咒",
      "盲目血咒",
      "傀儡血咒",
      "怒号血咒",
      "印记血咒",
      "乱心血咒",
      "同苦血咒",
      "鲁莽血咒",
      "噬魂血咒",
    ].map((name) => ({ name, source: "BloodHunter2024", featureType: ["BC"] })),
    ...[
      "烈焰血仪",
      "冻结血仪",
      "风暴血仪",
      "死亡血仪",
      "神谕血仪",
      "轰鸣血仪",
      "破晓血仪",
    ].map((name) => ({ name, source: "BloodHunter2024", featureType: ["CR"] })),
    ...[
      "升腾",
      "幻惑",
      "迅捷",
      "精通",
      "残虐",
      "回声定位",
      "余烬",
      "凛冽",
      "不穿",
      "灵活移动",
      "夜视",
      "洞察者",
      "潜能",
      "精准",
      "急速",
      "化学试剂",
      "再生",
      "睿智",
      "庇护",
      "不破",
      "红莲",
    ].map((name) => ({ name, source: "BloodHunter2024", featureType: ["MTGN"] })),
  ],
};

function findByName(
  entries: Array<Record<string, any>>,
  name: string,
): Record<string, any> {
  const found = entries.find((entry) => entry.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

describe("Blood Hunter 2024 homebrew Activity enrichment", () => {
  test("keeps Blood Maledict and Crimson Rite as resource/rules parents without Activities", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });

    const hemocraft = findByName(enriched.foundryClassFeature, "鲜血秘法");
    expect(hemocraft.system.uses.max).toBe("@scale.blood-hunter.blood-curse-uses");
    expect(hemocraft.system.identifier).toBe("blood-maledict");
    expect(hemocraft.activities ?? []).toEqual([]);

    const rite = findByName(enriched.foundryClassFeature, "猩红仪式");
    expect(rite.activities ?? []).toEqual([]);
    expect(enriched.foundryClassFeature.some((entry: any) => entry.name === "武器精通"))
      .toBe(false);
  });

  test("automates reliable base-class passive effects", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    const augmentation = findByName(enriched.foundryClassFeature, "黑暗增幅");
    expect(augmentation.effects[0].changes).toContainEqual({
      key: "system.attributes.movement.walk",
      mode: "ADD",
      value: "10",
    });
    expect(augmentation.effects[0].changes.map((change: any) => change.key))
      .toEqual(expect.arrayContaining([
        "system.abilities.str.bonuses.save",
        "system.abilities.dex.bonuses.save",
        "system.abilities.con.bonuses.save",
      ]));

    const soul = findByName(enriched.foundryClassFeature, "刚毅灵魂");
    expect(soul.effects[0].changes).toEqual(expect.arrayContaining([
      { key: "system.traits.ci.value", mode: "ADD", value: "charmed" },
      { key: "system.traits.ci.value", mode: "ADD", value: "frightened" },
    ]));
  });

  test("builds every rite as a weapon enchantment with one triggered direct-loss roll", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    const expectedTypes: Record<string, string> = {
      烈焰血仪: "fire",
      冻结血仪: "cold",
      风暴血仪: "lightning",
      死亡血仪: "necrotic",
      神谕血仪: "psychic",
      轰鸣血仪: "thunder",
      破晓血仪: "radiant",
    };

    for (const [name, damageType] of Object.entries(expectedTypes)) {
      const rite = findByName(enriched.foundryOptionalfeature, name);
      expect(rite.activities).toHaveLength(name === "破晓血仪" ? 5 : 2);
      const enchant = rite.activities.find((activity: any) => activity.type === "enchant");
      const loss = rite.activities.find((activity: any) => activity.name === "激活失血");
      expect(enchant).toMatchObject({
        activation: { type: "bonus" },
        restrictions: { type: "weapon", allowMagical: true },
        midiProperties: {
          triggeredActivityId: loss._id,
          triggeredActivityTargets: "self",
          triggeredActivityConsume: false,
          triggeredActivityConfigure: false,
        },
      });
      expect(enchant.macroData.command)
        .not.toContain('getFlag("fvttJsonGenerator"');
      expect(enchant.macroData.command).toContain('Hooks.on("dnd5e.applyEnchantment"');
      expect(enchant.macroData.command).toContain('Hooks.on("dnd5e.restCompleted"');
      expect(loss).toMatchObject({
        type: "damage",
        target: { affects: { type: "self" } },
        damage: { parts: [{
          custom: { enabled: true, formula: "@scale.blood-hunter.hemocraft" },
          types: [],
        }] },
      });
      expect(loss.macroData.command).toContain("workflow.damageRolls");
      expect(loss.macroData.command).toContain("workflow.damageItem");
      expect(loss.macroData.command).not.toContain('getFlag("fvttJsonGenerator"');
      expect(loss.macroData.command).toContain("if (!workflow.damageItem)");
      expect(loss.macroData.command.indexOf("if (!workflow.damageItem)"))
        .toBeLessThan(loss.macroData.command.indexOf("await actor.update"));
      expect(rite.flags["midi-qol"].onUseMacroName)
        .toContain(`[postActiveEffects]ActivityMacro-${enchant._id}`);
      expect(rite.flags["midi-qol"].onUseMacroName)
        .toContain(`[preDamageApplication]ActivityMacro-${loss._id}`);

      const enchantmentEffect = rite.effects.find((effect: any) =>
        effect.type === "enchantment"
      );
      expect(enchant.effects[0].foundryId).toBe(enchantmentEffect.foundryId);
      expect(enchantmentEffect).toMatchObject({
        type: "enchantment",
        disabled: true,
        flags: {
          dae: { specialDuration: ["shortRest"] },
          fvttJsonGenerator: { bloodHunterRite: true },
        },
      });
      expect(enchantmentEffect.changes).toHaveLength(1);
      expect(enchantmentEffect.changes).toContainEqual({
        key: "system.damage.parts",
        mode: "ADD",
        value: JSON.stringify([[
          "@scale.blood-hunter.crimson-rite",
          damageType,
        ]]),
      });
    }

    const dawn = findByName(enriched.foundryOptionalfeature, "破晓血仪");
    expect(dawn.activities.map((activity: any) => activity.name)).toEqual(
      expect.arrayContaining([
        "破晓血仪：持握黯蚀抗性（辅助）",
        "破晓血仪：20尺明亮光照（提示）",
        "破晓血仪：对不死生物额外伤害",
      ]),
    );
    const dawnResistance = dawn.effects.find((effect: any) =>
      effect.name === "破晓血仪：持握黯蚀抗性（辅助）"
    );
    expect(dawnResistance.changes).toContainEqual({
      key: "system.traits.dr.value",
      mode: "ADD",
      value: "necrotic",
    });
    const undeadDamage = dawn.activities.find((activity: any) =>
      activity.name === "破晓血仪：对不死生物额外伤害"
    );
    expect(undeadDamage).toMatchObject({
      type: "damage",
      damage: { parts: [{
        custom: { enabled: true, formula: "@scale.blood-hunter.hemocraft" },
        types: ["radiant"],
      }] },
    });
  });

  test("builds normal, amplified, and triggered self-loss Activities for every Blood Curse", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    const curseNames = sourceFixture.optionalfeature
      .filter((feature) => feature.featureType.includes("BC"))
      .map((feature) => feature.name);

    for (const name of curseNames) {
      const curse = findByName(enriched.foundryOptionalfeature, name);
      expect(curse.activities).toHaveLength(3);
      const normal = curse.activities.find((activity: any) => activity.name === name);
      const amplified = curse.activities.find((activity: any) =>
        activity.name === `增幅：${name}`
      );
      const loss = curse.activities.find((activity: any) =>
        activity.name === "增幅失血"
      );

      for (const activity of [normal, amplified]) {
        expect(activity.consumption.targets).toHaveLength(1);
        expect(activity.consumption.targets[0].target).toBe("blood-maledict");
      }
      expect(normal.midiProperties?.triggeredActivityId ?? "none").toBe("none");
      expect(amplified.midiProperties).toMatchObject({
        triggeredActivityId: loss._id,
        triggeredActivityTargets: "self",
        triggeredActivityConsume: false,
        triggeredActivityConfigure: false,
      });
      expect(loss).toMatchObject({
        type: "damage",
        damage: { parts: [{
          custom: { enabled: true, formula: "@scale.blood-hunter.hemocraft" },
          types: [],
        }] },
      });
      expect(loss.consumption.targets).toEqual([]);
      expect(loss.macroData.command).toContain("血咒增幅：首次增幅");
      expect(loss.macroData.command).toContain("system.attributes.hp.temp");
      expect(loss.macroData.command).toContain('specialDuration: ["shortRest"]');
      expect(loss.macroData.command).not.toContain('getFlag("fvttJsonGenerator"');
      expect(loss.macroData.command).toContain("if (!actor?.system?.attributes?.hp)");
      expect(curse.flags["midi-qol"].onUseMacroName)
        .toContain(`[preDamageApplication]ActivityMacro-${loss._id}`);
    }
  });

  test("uses explicit controlled fallbacks for context-sensitive Blood Curses", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    for (const name of [
      "胀痛血咒",
      "驱魔血咒",
      "暴露诅咒",
      "盲目血咒",
      "傀儡血咒",
      "印记血咒",
      "同苦血咒",
      "噬魂血咒",
    ]) {
      const curse = findByName(enriched.foundryOptionalfeature, name);
      const amplified = curse.activities.find((activity: any) =>
        activity.name === `增幅：${name}`
      );
      expect(amplified.macroData.command).toContain("ChatMessage.create");
      expect(amplified.description.chatFlavor).toContain("不会自动猜测");
    }
  });

  test("keeps curse-specific amplified mechanics instead of replacing them with the generic shell", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });

    const exorcist = findByName(enriched.foundrySubclassFeature, "驱魔血咒");
    const exorcistAmplified = exorcist.activities.find((activity: any) =>
      activity.name === "增幅：驱魔血咒"
    );
    expect(exorcistAmplified).toMatchObject({
      type: "save",
      save: { ability: ["wis"] },
      damage: { parts: [{
        custom: { enabled: true, formula: "3d6" },
        types: ["psychic"],
      }] },
    });

    const mark = findByName(enriched.foundryOptionalfeature, "印记血咒");
    expect(mark.effects).toHaveLength(2);
    expect(mark.activities.find((activity: any) => activity.name === "印记血咒").effects)
      .toHaveLength(1);
    expect(mark.effects[0].changes).toContainEqual({
      key: "flags.fvttJsonGenerator.bloodCurseMark",
      mode: "OVERRIDE",
      value: "source-only",
    });
    expect(mark.effects[1].changes).toContainEqual({
      key: "flags.fvttJsonGenerator.bloodCurseMark",
      mode: "OVERRIDE",
      value: "all-attackers",
    });
  });

  test("encodes only reliable simple curse states and keeps conditional branches explicit", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });

    const binding = findByName(enriched.foundryOptionalfeature, "捆缚血咒");
    const bindingNormal = binding.effects.find((effect: any) =>
      effect.name === "捆缚血咒：束缚"
    );
    expect(bindingNormal.duration.expiry).toBe("sourceEnd");
    expect(bindingNormal.flags.dae.specialDuration).toEqual([]);
    expect(bindingNormal.changes).toContainEqual({
      key: "flags.midi-qol.actions.reaction",
      mode: "OVERRIDE",
      value: "true",
    });
    for (const movement of ["walk", "fly", "swim", "climb", "burrow"]) {
      expect(bindingNormal.changes).toContainEqual({
        key: `system.attributes.movement.${movement}`,
        mode: "OVERRIDE",
        value: "0",
      });
    }
    const bindingAmplified = binding.effects.find((effect: any) =>
      effect.name === "增幅捆缚血咒：束缚"
    );
    expect(bindingAmplified.duration.seconds).toBe(60);
    expect(bindingAmplified.flags.dae.specialDuration).toEqual([]);

    const swelling = findByName(enriched.foundryOptionalfeature, "胀痛血咒");
    const swellingNormal = swelling.effects.find((effect: any) =>
      effect.name === "胀痛血咒：检定劣势"
    );
    expect(swellingNormal.changes.map((change: any) => change.key)).toEqual([
      "flags.midi-qol.disadvantage.check.str",
      "flags.midi-qol.disadvantage.check.dex",
    ]);

    const corrosion = findByName(enriched.foundryOptionalfeature, "腐蚀血咒");
    const corrosionNormal = corrosion.activities.find((activity: any) =>
      activity.name === "腐蚀血咒"
    );
    const corrosionAmplified = corrosion.activities.find((activity: any) =>
      activity.name === "增幅：腐蚀血咒"
    );
    expect(corrosionNormal.type).toBe("utility");
    expect(corrosionNormal.effects).toHaveLength(1);
    expect(corrosionAmplified.damage.parts[0]).toMatchObject({
      types: ["necrotic"],
      custom: { enabled: true, formula: "4d6" },
    });

    const howl = findByName(enriched.foundryOptionalfeature, "怒号血咒");
    expect(howl.activities.find((activity: any) => activity.name === "怒号血咒")
      .activation.type).toBe("action");
    expect(howl.activities.find((activity: any) => activity.name === "增幅：怒号血咒")
      .activation.type).toBe("bonus");
    expect(howl.effects.some((effect: any) => effect.statuses?.includes("frightened")))
      .toBe(true);

    const unsettled = findByName(enriched.foundryOptionalfeature, "乱心血咒");
    expect(unsettled.effects[0].changes).toContainEqual({
      key: "flags.midi-qol.disadvantage.concentration",
      mode: "OVERRIDE",
      value: "true",
    });
    expect(unsettled.effects[0].flags.dae.specialDuration)
      .toEqual(["isSave.con"]);
    expect(unsettled.effects[0].duration.expiry).toBe("sourceEnd");
  });

  test("gives mutagens real rest-expiring effects instead of empty buttons", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    const mutagenNames = sourceFixture.optionalfeature
      .filter((feature) => feature.featureType.includes("MTGN"))
      .map((feature) => feature.name);
    expect(mutagenNames).toHaveLength(21);
    for (const name of mutagenNames) {
      const generated = findByName(enriched.foundryOptionalfeature, name);
      expect(generated.activities).toHaveLength(1);
      expect(generated.activities[0].effects).toHaveLength(1);
      expect(generated.effects).toHaveLength(1);
      expect(generated.effects[0].flags.dae.specialDuration).toEqual(["shortRest"]);
    }

    const mutagen = findByName(enriched.foundryOptionalfeature, "余烬");
    expect(mutagen.activities[0].activation.type).toBe("bonus");
    expect(mutagen.activities[0].description.chatFlavor).toContain("诱变剂");
    expect(mutagen.activities[0].effects).toHaveLength(1);
    expect(mutagen.activities[0].macroData.command)
      .not.toContain('getFlag("fvttJsonGenerator"');
    expect(mutagen.effects[0]).toMatchObject({
      flags: { dae: { specialDuration: ["shortRest"] } },
      changes: [{
        key: "system.traits.dr.value",
        mode: "ADD",
        value: "fire",
      }],
    });

    const precision = findByName(
      enriched.foundryOptionalfeature,
      "精准",
    );
    expect(precision.effects[0].changes).toContainEqual({
      key: "flags.dnd5e.weaponCriticalThreshold",
      mode: "OVERRIDE",
      value: "19 - floor(@classes.blood-hunter.levels / 15)",
    });
  });

  test("enriches all four subclasses and preserves only native/passive close negatives", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });

    const aetherWalk = findByName(enriched.foundrySubclassFeature, "升腾走");
    expect(aetherWalk.activities[0].uses).toMatchObject({ max: "2 + floor(@classes.blood-hunter.levels / 15)" });

    const arcanum = findByName(enriched.foundrySubclassFeature, "异界奥秘");
    expect(arcanum.activities[0]).toMatchObject({
      type: "utility",
      uses: { max: "1", recovery: [{ period: "lr", type: "recoverAll" }] },
    });

    const mutagencraft = findByName(enriched.foundrySubclassFeature, "诱变技艺");
    expect(mutagencraft.activities[0].activation.type).toBe("bonus");

    const axiomBrand = findByName(enriched.foundrySubclassFeature, "公理烙印");
    expect(axiomBrand.activities[0]).toMatchObject({
      type: "save",
      activation: { type: "special" },
      save: { ability: ["wis"], dc: { calculation: "int" } },
    });

    const lycan = findByName(enriched.foundrySubclassFeature, "混种变形");
    expect(lycan.activities.some((activity: any) => activity.name === "进入混种形态"))
      .toBe(true);

    const metabolism = findByName(enriched.foundrySubclassFeature, "炼金代谢");
    expect(metabolism.effects[0].changes).toEqual(expect.arrayContaining([
      { key: "system.traits.dr.value", mode: "ADD", value: "poison" },
      { key: "flags.midi-qol.advantage.save.con", mode: "OVERRIDE", value: "true" },
    ]));
    expect(lycan.effects.some((effect: any) => effect.name === "混种形态"))
      .toBe(true);

    for (const passive of ["契约魔法"]) {
      expect(enriched.foundrySubclassFeature.some((entry: any) => entry.name === passive))
        .toBe(false);
    }
  });

  test("adds a numeric Blood Curse use scale without mutating the source", () => {
    const before = structuredClone(sourceFixture);
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    const scale = enriched.foundryClass[0].advancement.find(
      (entry: any) => entry.configuration?.identifier === "blood-curse-uses",
    );

    expect(scale.configuration.scale).toEqual({
      "1": { value: 2 },
      "6": { value: 3 },
      "13": { value: 4 },
      "17": { value: 5 },
    });
    expect(sourceFixture).toEqual(before);
  });

  test("records the exact module contract and honest automation boundary", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    expect(enriched._meta.fvttJsonGenerator).toMatchObject({
      activityProfile: "foundry-14.364-dnd5e-5.3.3",
      moduleVersions: {
        midiQol: "14.0.11",
        dae: "14.0.12",
        itemMacro: "3.0.1-optional-unverified-v14",
      },
      scope: expect.arrayContaining(["order-of-the-lycan"]),
    });
    expect(enriched._meta.fvttJsonGenerator.automationBoundary)
      .toContain("context-sensitive");
    expect(enriched._meta.fvttJsonGenerator.coverage.missing).toEqual([]);
    expect(enriched._meta.fvttJsonGenerator.coverage.entries.every(
      (entry: any) => ["automatic", "assisted", "manual", "native"].includes(entry.automation),
    )).toBe(true);
  });

  test("produces stable IDs and a truthful summary", () => {
    const first = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    const second = enrichBloodHunterHomebrew(sourceFixture, { strict: false });

    expect(first).toEqual(second);
    expect(summarizeBloodHunterActivities(first)).toMatchObject({
      classFeatures: 4,
      subclassFeatures: 11,
      optionalFeatures: 42,
      activities: 99,
    });
  });

  test("fails closed for a different homebrew source", () => {
    expect(() => enrichBloodHunterHomebrew({
      ...sourceFixture,
      _meta: { sources: [{ json: "OtherSource", version: "1.1" }] },
    }, { strict: false })).toThrow("Expected BloodHunter2024 source");
  });

  test("retries a bounded transient source failure", async () => {
    let calls = 0;
    const fetched = await fetchBloodHunterSource(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return new Response(JSON.stringify(sourceFixture), { status: 200 });
    }, { attempts: 2, timeoutMs: 100, retryDelayMs: 0 });

    expect(calls).toBe(2);
    expect(fetched._meta.sources[0].json).toBe("BloodHunter2024");
  });

  test("validates enchantment links and catches planted invalid types, links, and duplicate IDs", () => {
    const enriched = enrichBloodHunterHomebrew(sourceFixture, { strict: false });
    expect(validateBloodHunterHomebrew(enriched)).toEqual([]);

    const flame = findByName(enriched.foundryOptionalfeature, "烈焰血仪");
    flame.activities[0].type = "invented";
    expect(validateBloodHunterHomebrew(enriched)).toContain(
      "烈焰血仪: unsupported Activity type invented",
    );

    flame.activities[0].type = "enchant";
    flame.activities[0].midiProperties.triggeredActivityId = "missing";
    expect(validateBloodHunterHomebrew(enriched)).toContain(
      "烈焰血仪: missing triggered Activity missing",
    );

    flame.activities[0].midiProperties.triggeredActivityId = flame.activities[1]._id;
    flame.activities[1]._id = flame.activities[0]._id;
    expect(validateBloodHunterHomebrew(enriched).some((finding) =>
      finding.includes("duplicate Activity ID")
    )).toBe(true);

    const curse = findByName(enriched.foundryOptionalfeature, "焦虑血咒");
    curse.activities[0].consumption.targets[0].target = {
      consumes: { name: "鲜血秘法" },
    };
    expect(validateBloodHunterHomebrew(enriched)).toContain(
      "焦虑血咒: shared resource target must be blood-maledict",
    );

    curse.effects[0].flags.dae.specialDuration = ["turnEndSource"];
    expect(validateBloodHunterHomebrew(enriched)).toContain(
      "焦虑血咒: deprecated DAE duration turnEndSource",
    );
  });
});
