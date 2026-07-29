import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { assertInsideLabRoot, type FoundryLabConfig } from "./config";

const SOURCE = "BloodHunter2024";
const CLASS_NAME = "血猎手";
export const BLOOD_HUNTER_HOMEBREW_URL =
  "https://homebrew.kiwee.top/class/SnowWolf;%20%E8%A1%80%E7%8C%8E%E6%89%8B%20(2024).json";

type JsonRecord = Record<string, any>;
type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface EnrichmentOptions {
  strict?: boolean;
}

interface ActivityOptions {
  activation?: "action" | "bonus" | "reaction" | "special";
  range?: number | "self";
  target?: "self" | "creature" | "creatureChoice";
  duration?: { value: string; units: string };
  consumption?: Array<JsonRecord>;
  uses?: JsonRecord;
  formula?: string;
  damageType?: string;
  saveAbility?: string;
  healing?: boolean;
  effects?: JsonRecord[];
  macroData?: JsonRecord;
  midiProperties?: JsonRecord;
  restrictions?: JsonRecord;
}

interface FeatureActivityDefinition {
  name: string;
  activities: JsonRecord[];
  system?: JsonRecord;
  effects?: JsonRecord[];
  flags?: JsonRecord;
}

function activityId(scope: string, name: string): string {
  return createHash("sha256").update(`${scope}\0${name}`).digest("hex").slice(0, 16);
}

function emptyTarget(kind: ActivityOptions["target"] = "creature"): JsonRecord {
  const isSelf = kind === "self";
  return {
    template: {
      count: "",
      contiguous: false,
      type: "",
      size: "",
      width: "",
      height: "",
      units: "",
    },
    affects: {
      count: kind === "creatureChoice" ? "" : "1",
      type: isSelf ? "self" : "creature",
      choice: kind === "creatureChoice",
      special: "",
    },
    prompt: !isSelf,
    override: false,
  };
}

function emptyUses(): JsonRecord {
  return { spent: 0, recovery: [], max: "" };
}

function customDamage(formula: string, type: string): JsonRecord {
  return {
    number: 0,
    denomination: 0,
    bonus: "",
    types: type ? [type] : [],
    custom: { enabled: true, formula },
    scaling: { mode: "whole", number: 1, formula: "" },
  };
}

function buildActivity(
  scope: string,
  name: string,
  type: "utility" | "damage" | "save" | "heal" | "enchant",
  chatFlavor: string,
  options: ActivityOptions = {},
): JsonRecord {
  const range = options.range === "self"
    ? { value: "", units: "self", special: "", override: false }
    : {
        value: options.range === undefined ? "" : String(options.range),
        units: options.range === undefined ? "" : "ft",
        special: "",
        override: false,
      };
  const activity: JsonRecord = {
    _id: activityId(scope, name),
    type,
    name,
    activation: {
      type: options.activation ?? "special",
      value: options.activation === "special" ? null : 1,
      condition: "",
      override: false,
    },
    consumption: {
      targets: options.consumption ?? [],
      scaling: { allowed: false, max: "" },
      spellSlot: false,
    },
    description: { chatFlavor },
    duration: {
      value: options.duration?.value ?? "",
      units: options.duration?.units ?? "inst",
      concentration: false,
      override: false,
    },
    range,
    target: emptyTarget(options.target ?? (options.range === "self" ? "self" : "creature")),
    uses: options.uses ?? emptyUses(),
    ...(options.effects ? { effects: options.effects } : {}),
    ...(options.macroData ? { macroData: options.macroData } : {}),
    ...(options.midiProperties ? { midiProperties: options.midiProperties } : {}),
  };

  if (type === "utility") {
    activity.roll = {
      formula: options.formula ?? "",
      name: "",
      prompt: false,
      visible: Boolean(options.formula),
    };
  } else if (type === "damage" || type === "save") {
    activity.damage = {
      ...(type === "damage" ? { critical: { allow: false, bonus: "" } } : { onSave: "none" }),
      parts: options.formula
        ? [customDamage(options.formula, options.damageType ?? "")]
        : [],
    };
  } else if (type === "heal") {
    activity.healing = customDamage(options.formula ?? "", "healing");
  }

  if (type === "save") {
    activity.save = {
      ability: [options.saveAbility ?? "wis"],
      dc: { calculation: "int", formula: "" },
    };
  }
  if (type === "enchant") {
    activity.enchant = { self: false };
    activity.restrictions = options.restrictions ?? {
      allowMagical: true,
      categories: [],
      properties: [],
      type: "weapon",
    };
    activity.effects ??= [];
  }

  return activity;
}

const bloodCurseConsumption = (): JsonRecord[] => [{
  type: "itemUses",
  value: "1",
  target: "blood-maledict",
  scaling: { mode: "", formula: "" },
}];

const oneLongRest = (): JsonRecord => ({
  spent: 0,
  max: "1",
  recovery: [{ period: "lr", type: "recoverAll" }],
});

const twoShortRest = (): JsonRecord => ({
  spent: 0,
  max: "2 + floor(@classes.blood-hunter.levels / 15)",
  recovery: [
    { period: "sr", type: "formula", formula: "1" },
    { period: "lr", type: "recoverAll" },
  ],
});

function curseActivity(
  name: string,
  chatFlavor: string,
  options: ActivityOptions,
  scope = "optional",
): JsonRecord {
  const type = options.saveAbility ? "save" : options.formula && options.damageType ? "damage" : "utility";
  return buildActivity(
    `${scope}:${name}`,
    name,
    type,
    chatFlavor,
    { ...options, consumption: bloodCurseConsumption() },
  );
}

const CLASS_DEFINITIONS: FeatureActivityDefinition[] = [
  {
    name: "鲜血秘法",
    system: {
      identifier: "blood-maledict",
      uses: {
        spent: 0,
        max: "@scale.blood-hunter.blood-curse-uses",
        recovery: [{ period: "sr", type: "recoverAll" }],
      },
    },
    activities: [],
  },
  {
    name: "猩红仪式",
    activities: [],
  },
  {
    name: "惩戒烙印",
    system: {
      uses: {
        spent: 0,
        max: "2",
        recovery: [
          { period: "sr", type: "formula", formula: "1" },
          { period: "lr", type: "recoverAll" },
        ],
      },
    },
    activities: [
      buildActivity(
        "class:惩戒烙印",
        "施加惩戒烙印",
        "utility",
        "用已激活猩红仪式的武器造成伤害时施加烙印；方向感知、反噬伤害与死亡收益按原文人工结算。",
        {
          activation: "special",
          target: "creature",
          consumption: [{
            type: "itemUses",
            target: "",
            value: "1",
            scaling: { mode: "", formula: "" },
          }],
        },
      ),
    ],
  },
  {
    name: "阴暗灵卜",
    activities: [
      buildActivity(
        "class:阴暗灵卜",
        "附赠动作施放鉴定术",
        "utility",
        "以附赠动作施放鉴定术，并获得该特性列出的额外生物信息；也可改为消耗一次鲜血秘法使用次数。",
        {
          activation: "bonus",
          target: "creature",
          uses: {
            spent: 0,
            max: "2",
            recovery: [{ period: "lr", type: "recoverAll" }],
          },
        },
      ),
    ],
  },
  {
    name: "黑暗增幅",
    activities: [],
    effects: [{
      foundryId: activityId("class:黑暗增幅:effect", "黑暗增幅"),
      name: "黑暗增幅",
      type: "base",
      disabled: false,
      transfer: true,
      changes: [
        { key: "system.attributes.movement.walk", mode: "ADD", value: "10" },
        ...["str", "dex", "con"].map((ability) => ({
          key: `system.abilities.${ability}.bonuses.save`,
          mode: "ADD",
          value: "max(1, @abilities.int.mod)",
        })),
      ],
      flags: { fvttJsonGenerator: { automation: "automatic" } },
    }],
  },
  {
    name: "强化惩戒烙印",
    activities: [
      buildActivity(
        "class:强化惩戒烙印",
        "强化烙印：腐败",
        "damage",
        "仅在被烙印目标以休息以外的方式恢复生命值时结算2d6暗蚀伤害。",
        { activation: "special", target: "creature", formula: "2d6", damageType: "necrotic" },
      ),
      buildActivity(
        "class:强化惩戒烙印",
        "强化烙印：束缚",
        "damage",
        "仅在被烙印目标尝试传送或离开当前位面时结算4d6心灵伤害；阻止移动的感知豁免由玩家确认。",
        { activation: "special", target: "creature", formula: "4d6", damageType: "psychic" },
      ),
    ],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "刚毅灵魂",
    activities: [],
    effects: [{
      foundryId: activityId("class:刚毅灵魂:effect", "刚毅灵魂"),
      name: "刚毅灵魂",
      type: "base",
      disabled: false,
      transfer: true,
      changes: [
        { key: "system.traits.ci.value", mode: "ADD", value: "charmed" },
        { key: "system.traits.ci.value", mode: "ADD", value: "frightened" },
      ],
      flags: { fvttJsonGenerator: { automation: "automatic" } },
    }],
  },
  {
    name: "诅咒烙印",
    activities: [buildActivity(
      "class:诅咒烙印",
      "烙印免失血增幅",
      "utility",
      "每个惩戒烙印一次，对被烙印目标增幅血咒时免除生命值损失；仍需掷血法骰并获得首次增幅临时生命值。请在对应增幅血咒前使用。",
      { activation: "special", target: "creature", formula: "@scale.blood-hunter.hemocraft" },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "胸有成竹",
    activities: [buildActivity(
      "class:胸有成竹",
      "血法骰：掷两次取一",
      "utility",
      "当血猎手特性要求掷一枚血法骰时，掷两次并选择其中一个结果；本辅助 Activity 不自动猜测要替换的工作流。",
      {
        activation: "special",
        range: "self",
        target: "self",
        formula: "@scale.blood-hunter.hemocraft + @scale.blood-hunter.hemocraft",
      },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
];

const SUBCLASS_DEFINITIONS: FeatureActivityDefinition[] = [
  {
    name: "诅咒专家",
    activities: [buildActivity(
      "subclass:弑灵:诅咒专家",
      "连续施加两个血咒",
      "utility",
      "以一个附赠动作或反应依次使用两个血咒；请分别使用两个血咒 Activity，使每个血咒各消耗一次鲜血秘法。",
      { activation: "special", range: "self", target: "self" },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "升腾走",
    activities: [
      buildActivity(
        "subclass:弑灵:升腾走",
        "升腾走",
        "utility",
        "回合开始时步入位面帷幕，持续1分钟；穿越物体及结束位置伤害按原文处理。",
        {
          activation: "special",
          range: "self",
          target: "self",
          duration: { value: "1", units: "minute" },
          uses: twoShortRest(),
        },
      ),
    ],
  },
  {
    name: "驱魔血咒",
    activities: [
      curseActivity(
        "驱魔血咒",
        "以附赠动作结束30尺内目标的魅惑、恐慌或附身；增幅反噬另用下方 Activity。",
        { activation: "bonus", range: 30, target: "creature" },
        "subclass:弑灵",
      ),
      buildActivity(
        "subclass:弑灵:驱魔血咒",
        "增幅：驱魔反噬",
        "save",
        "控制或附身目标的生物承受3d6心灵伤害并进行感知豁免；失败则震慑至你的下回合结束。",
        {
          activation: "special",
          range: 30,
          target: "creature",
          saveAbility: "wis",
          formula: "3d6",
          damageType: "psychic",
        },
      ),
    ],
  },
  {
    name: "血仪重生",
    activities: [
      buildActivity(
        "subclass:弑灵:血仪重生",
        "血仪重生",
        "utility",
        "生命值降为0但未立即死亡时结束所有激活的猩红仪式，改为降至1点生命值。",
        { activation: "special", range: "self", target: "self" },
      ),
    ],
  },
  {
    name: "分离烙印",
    activities: [buildActivity(
      "subclass:弑灵:分离烙印",
      "分离烙印：额外血仪骰",
      "damage",
      "仅当你以激活血仪的武器命中被你惩戒烙印的目标时使用；额外造成一枚血法骰且伤害类型必须与当前血仪一致。",
      {
        activation: "special",
        target: "creature",
        formula: "@scale.blood-hunter.hemocraft",
      },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "异界同调",
    activities: [
      buildActivity(
        "subclass:渎魂:异界同调",
        "同调：恢复生命",
        "heal",
        "消耗一次鲜血秘法使用次数，使60尺内一个生物恢复一枚鲜血秘法骰加智力调整值（至少1）的生命值。",
        {
          activation: "bonus",
          range: 60,
          target: "creature",
          formula: "max(1, @scale.blood-hunter.hemocraft + @abilities.int.mod)",
          consumption: bloodCurseConsumption(),
        },
      ),
      buildActivity(
        "subclass:渎魂:异界同调",
        "同调：获得飞行速度",
        "utility",
        "消耗一次鲜血秘法使用次数，获得30尺飞行速度，持续等同智力调整值（至少1）的回合。",
        {
          activation: "bonus",
          range: "self",
          target: "self",
          consumption: bloodCurseConsumption(),
        },
      ),
    ],
  },
  {
    name: "异界奥秘",
    activities: [
      buildActivity(
        "subclass:渎魂:异界奥秘",
        "无须法术位施放同调法术",
        "utility",
        "施放当前异界同调所准备的法术一次，无须法术位；具体法术由当前同调选择决定。",
        { activation: "action", uses: oneLongRest() },
      ),
    ],
  },
  {
    name: "神秘狂乱",
    activities: [buildActivity(
      "subclass:渎魂:神秘狂乱",
      "以戏法替代一次攻击",
      "utility",
      "执行攻击动作时，以施法时间为一个动作的魔契师戏法替代其中一次攻击；请随后使用实际嵌入的戏法。",
      { activation: "special", range: "self", target: "self" },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "痂痕烙印",
    activities: [buildActivity(
      "subclass:渎魂:痂痕烙印",
      "痂痕烙印：法术豁免劣势",
      "utility",
      "被你惩戒烙印的目标对抗你的契约魔法法术时，其豁免具有劣势；只有满足来源与烙印条件时使用。",
      { activation: "special", target: "creature" },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "异界恢复力",
    activities: [buildActivity(
      "subclass:渎魂:异界恢复力",
      "同步最后激活血仪抗性",
      "utility",
      "获得对最后激活血仪伤害类型的抗性；若当前没有激活血仪则不应用，多个血仪时只保留最后一个类型。",
      { activation: "special", range: "self", target: "self" },
    )],
    flags: { fvttJsonGenerator: { automation: "assisted" } },
  },
  {
    name: "诡秘奥秘",
    activities: [
      buildActivity(
        "subclass:渎魂:诡秘奥秘",
        "无须法术位施放奥秘法术",
        "utility",
        "施放当前异界同调所准备的高阶法术一次，无须法术位；具体法术由当前同调选择决定。",
        { activation: "action", uses: oneLongRest() },
      ),
    ],
  },
  {
    name: "噬魂血咒",
    activities: [
      curseActivity(
        "噬魂血咒",
        "30尺内合格生物生命值降为0时，以反应吸收生命能量；优势、抗性及增幅恢复法术位按原文处理。",
        { activation: "reaction", range: 30, target: "creature" },
        "subclass:渎魂",
      ),
    ],
  },
  {
    name: "诱变技艺",
    activities: [
      buildActivity(
        "subclass:突变:诱变技艺",
        "饮用已配制的诱变剂",
        "utility",
        "以附赠动作消耗一瓶已配制诱变剂；并行数量、替换和休息结束规则按原文处理。",
        { activation: "bonus", range: "self", target: "self" },
      ),
    ],
  },
  {
    name: "炼金代谢",
    activities: [],
    effects: [{
      foundryId: activityId("subclass:突变:炼金代谢:effect", "炼金代谢"),
      name: "炼金代谢",
      type: "base",
      disabled: false,
      transfer: true,
      changes: [
        { key: "system.traits.dr.value", mode: "ADD", value: "poison" },
        { key: "flags.midi-qol.advantage.save.con", mode: "OVERRIDE", value: "true" },
      ],
      flags: { fvttJsonGenerator: { automation: "automatic", condition: "againstPoisoned" } },
    }],
  },
  {
    name: "腐蚀血咒",
    activities: [
      curseActivity(
        "腐蚀血咒",
        "以附赠动作使30尺内目标中毒；目标每回合结束进行体质豁免，成功时结束诅咒。增幅时还会造成4d6暗蚀伤害。",
        {
          activation: "bonus",
          range: 30,
          target: "creature",
          saveAbility: "con",
          formula: "4d6",
          damageType: "necrotic",
        },
        "subclass:突变",
      ),
    ],
  },
  {
    name: "公理烙印",
    activities: [
      buildActivity(
        "subclass:突变:公理烙印",
        "公理烙印：显露真实形态",
        "save",
        "被烙印生物处于其他形态或尝试改变形态时进行感知豁免；失败则恢复真实形态并震慑至你的下回合结束。",
        {
          activation: "special",
          target: "creature",
          saveAbility: "wis",
        },
      ),
    ],
  },
  {
    name: "高等突变",
    activities: [
      buildActivity(
        "subclass:突变:高等突变",
        "高等突变",
        "utility",
        "回合开始时结束一个当前诱变剂，并立即让一个已知配方的诱变剂生效。",
        {
          activation: "special",
          range: "self",
          target: "self",
          uses: {
            spent: 0,
            max: "max(1, @abilities.int.mod)",
            recovery: [{ period: "lr", type: "recoverAll" }],
          },
        },
      ),
    ],
  },
  ...buildLycanDefinitions(),
];

// anti-overfit: allow explicit-exception - source-proven AC bonus in the user-owned BloodHunter2024 Lycan feature.
function lycanHybridArmorBonus(): string {
  return "1";
}

function buildLycanDefinitions(): FeatureActivityDefinition[] {
  const hybridEffectId = activityId("subclass:化狼:混种变形:effect", "混种形态");
  const hybridEffect = {
    foundryId: hybridEffectId,
    name: "混种形态",
    type: "base",
    disabled: true,
    transfer: false,
    duration: { seconds: 3600 },
    changes: [
      { key: "flags.midi-qol.advantage.check.str", mode: "OVERRIDE", value: "true" },
      { key: "flags.midi-qol.advantage.save.str", mode: "OVERRIDE", value: "true" },
      { key: "system.attributes.ac.bonus", mode: "ADD", value: lycanHybridArmorBonus() },
      {
        key: "system.bonuses.mwak.damage",
        mode: "ADD",
        value: "1 + floor(@classes.blood-hunter.levels / 11)",
      },
    ],
    flags: {
      dae: { specialDuration: ["shortRest"] },
      fvttJsonGenerator: {
        bloodHunterLycanHybrid: true,
        assistedRiders: ["predatoryStrikes", "nonSilverPhysicalResistance", "bloodlust"],
      },
    },
  };
  const stalkerEffectId = activityId("subclass:化狼:追猎造诣:effect", "追猎造诣");
  const advancedEffectId = activityId("subclass:化狼:高等变形:effect", "狼化再生");
  return [
    {
      name: "混种变形",
      system: {
        uses: {
          spent: 0,
          max: "1 + floor(@classes.blood-hunter.levels / 11)",
          recovery: [{ period: "sr", type: "recoverAll" }],
        },
      },
      activities: [
        buildActivity(
          "subclass:化狼:混种变形",
          "进入混种形态",
          "utility",
          "进入混种形态并施加可靠的力量、AC与近战伤害效果；掠食打击、非银武器抗性和浴血嗜血使用明确的辅助提示，不自动猜测武器或最近生物。",
          {
            activation: "bonus",
            range: "self",
            target: "self",
            duration: { value: "1", units: "hour" },
            effects: [{ foundryId: hybridEffectId }],
          },
        ),
        buildActivity(
          "subclass:化狼:混种变形",
          "掠食打击",
          "damage",
          "以敏捷或力量进行徒手攻击；当前先掷1d6，11级后请在配置中改为1d8。攻击属性、攻击目标和血仪应用由玩家确认。",
          {
            activation: "action",
            range: 5,
            target: "creature",
            formula: "1d6",
            damageType: "slashing",
          },
        ),
      ],
      effects: [hybridEffect],
    },
    {
      name: "追猎造诣",
      activities: [],
      effects: [{
        foundryId: stalkerEffectId,
        name: "追猎造诣",
        type: "base",
        disabled: false,
        transfer: true,
        changes: [{ key: "system.attributes.movement.walk", mode: "ADD", value: "10" }],
        flags: { fvttJsonGenerator: { assistedRiders: ["jumpDistance", "hybridUnarmedAttackBonus"] } },
      }],
    },
    {
      name: "高等变形",
      activities: [buildActivity(
        "subclass:化狼:高等变形",
        "狼化再生",
        "heal",
        "浴血、至少1点生命值且在回合开始时使用；若条件不成立请勿结算。",
        {
          activation: "special",
          range: "self",
          target: "self",
          formula: "max(1, 1 + @abilities.con.mod)",
        },
      )],
      effects: [{
        foundryId: advancedEffectId,
        name: "狼化再生：提示",
        type: "base",
        disabled: false,
        transfer: true,
        changes: [],
        flags: { fvttJsonGenerator: { controlled: true, trigger: "turnStartBloodied" } },
      }],
    },
    {
      name: "饕餮烙印",
      activities: [buildActivity(
        "subclass:化狼:饕餮烙印",
        "饕餮烙印：攻击优势",
        "utility",
        "仅当你处于混种形态并攻击由你施加惩戒烙印的目标时使用攻击优势。",
        { activation: "special", target: "creature" },
      )],
    },
    { name: "怒号血咒", activities: [] },
    {
      name: "变形精通",
      activities: [buildActivity(
        "subclass:化狼:变形精通",
        "无限混种变形",
        "utility",
        "18级后混种形态不再消耗次数，并在嗜血豁免时具有优势。",
        { activation: "bonus", range: "self", target: "self" },
      )],
    },
  ];
}

const BLOOD_CURSES: Record<string, ActivityOptions & { chat: string }> = {
  "焦虑血咒": { activation: "bonus", range: 30, target: "creature", saveAbility: "wis", chat: "目标进行感知豁免；失败则恐慌至你的下回合结束。增幅造成的下一次感知豁免劣势按原文处理。" },
  "捆缚血咒": { activation: "bonus", range: 30, target: "creature", saveAbility: "str", chat: "大型或更小目标进行力量豁免；失败则速度降至0且不能使用反应。增幅持续与重复豁免按原文处理。" },
  "胀痛血咒": { activation: "bonus", range: 30, target: "creature", chat: "目标的力量与敏捷检定具有劣势，多次攻击会承受鲜血秘法骰暗蚀伤害；增幅持续与体质豁免按原文处理。" },
  "腐蚀血咒": { activation: "bonus", range: 30, target: "creature", saveAbility: "con", chat: "目标中毒并在回合结束进行体质豁免；增幅在施加及失败豁免时造成4d6暗蚀伤害。" },
  "驱魔血咒": { activation: "bonus", range: 30, target: "creature", chat: "结束目标的魅惑、恐慌或附身；增幅的控制者豁免与伤害按原文处理。" },
  "暴露诅咒": { activation: "reaction", range: 30, target: "creature", chat: "目标受到攻击或法术伤害时，以反应暂时移除对应伤害抗性；增幅的免疫转抗性按原文处理。" },
  "盲目血咒": { activation: "reaction", range: 30, target: "creature", formula: "@scale.blood-hunter.hemocraft", chat: "目标命中时，以反应投掷鲜血秘法骰并从攻击检定中减去；增幅影响该生物本回合后续攻击。" },
  "傀儡血咒": { activation: "reaction", range: 30, target: "creature", chat: "目标生命值降至0时，以反应迫使其立即进行一次武器攻击；增幅移动与攻击加值按原文处理。" },
  "怒号血咒": { activation: "action", range: 30, target: "creatureChoice", saveAbility: "wis", chat: "30尺光环内可听见你的生物进行感知豁免；失败则恐慌，差5或更多时同时震慑。可排除可见生物。" },
  "印记血咒": { activation: "bonus", range: 30, target: "creature", chat: "标记目标至你的下回合开始；匹配激活血仪伤害类型的额外鲜血秘法骰伤害按原文触发。" },
  "乱心血咒": { activation: "bonus", range: 30, target: "creature", chat: "目标下一次维持专注的体质豁免具有劣势；增幅影响持续时间内的所有此类豁免。" },
  "同苦血咒": { activation: "reaction", range: 30, target: "creature", chat: "你或盟友受伤时，以反应令另一目标承受同类型的一半伤害；增幅改为全额并将免疫视为抗性。" },
  "鲁莽血咒": { activation: "bonus", range: 30, target: "creature", chat: "目标至你的下回合结束不能撤离或回避；增幅期间AC降低2。" },
  "噬魂血咒": { activation: "reaction", range: 30, target: "creature", chat: "合格目标生命值降至0时，以反应获得攻击优势与全伤害抗性；增幅恢复契约法术位并受长休限制。" },
};

const RITE_DAMAGE_TYPES: Record<string, string> = {
  "烈焰血仪": "fire",
  "冻结血仪": "cold",
  "风暴血仪": "lightning",
  "死亡血仪": "necrotic",
  "神谕血仪": "psychic",
  "轰鸣血仪": "thunder",
  "破晓血仪": "radiant",
};

const CONTROLLED_CURSES = new Set([
  "胀痛血咒",
  "驱魔血咒",
  "暴露诅咒",
  "盲目血咒",
  "傀儡血咒",
  "印记血咒",
  "同苦血咒",
  "噬魂血咒",
]);

function triggeredActivity(activity: JsonRecord, targetId: string): JsonRecord {
  activity.midiProperties = {
    triggeredActivityId: targetId,
    triggeredActivityConditionText: "",
    triggeredActivityTargets: "self",
    triggeredActivityRollAs: "self",
    triggeredActivityConsume: false,
    triggeredActivityConfigure: false,
  };
  return activity;
}

function directLossMacro(activityIdValue: string, firstAmplification: boolean): string {
  const markerBlock = firstAmplification
    ? [
        "const marker = actor.effects.find(effect => effect.flags?.fvttJsonGenerator?.bloodMaledictAmplifiedSinceRest);",
        "if (!marker) {",
        '  await actor.update({"system.attributes.hp.temp": Math.max(Number(hp.temp ?? 0), loss)});',
        "  await actor.createEmbeddedDocuments(\"ActiveEffect\", [{",
        '    name: "血咒增幅：首次增幅", type: "base", transfer: false,',
        '    flags: {dae: {specialDuration: ["shortRest"]}, fvttJsonGenerator: {bloodMaledictAmplifiedSinceRest: true}}',
        "  }]);",
        "}",
      ]
    : [];
  return [
    `if (workflow?.activity?.id !== ${JSON.stringify(activityIdValue)}) return;`,
    "const loss = Number(workflow.damageRolls?.[0]?.total ?? workflow.damageRoll?.total ?? 0);",
    'if (!Number.isFinite(loss) || loss <= 0) return ui.notifications.warn("未取得有效的血法骰结果；请人工结算生命值损失。");',
    'if (!actor?.system?.attributes?.hp) return ui.notifications.warn("未取得失血 Actor；请人工结算生命值损失。");',
    'if (!workflow.damageItem) return ui.notifications.warn("MIDI 未提供可清零的伤害应用上下文；为避免双重扣血，请人工结算生命值损失。");',
    "const hp = actor.system.attributes.hp;",
    'await actor.update({"system.attributes.hp.value": Math.max(0, Number(hp.value) - loss)});',
    "workflow.damageItem.hpDamage = 0;",
    "workflow.damageItem.tempDamage = 0;",
    "workflow.damageItem.totalDamage = 0;",
    ...markerBlock,
  ].join("\n");
}

function buildLossActivity(
  scope: string,
  name: "激活失血" | "增幅失血",
  firstAmplification: boolean,
): JsonRecord {
  const id = activityId(scope, name);
  return buildActivity(
    scope,
    name,
    "damage",
    firstAmplification
      ? "投掷一枚血法骰并直接减少等量当前生命值；不经过伤害抗性、免疫或临时生命值。每次短休或长休后的第一次增幅获得等量临时生命值。"
      : "投掷一枚血法骰并直接减少等量当前生命值；不经过伤害抗性、免疫或临时生命值。",
    {
      activation: "special",
      range: "self",
      target: "self",
      formula: "@scale.blood-hunter.hemocraft",
      macroData: {
        name,
        command: directLossMacro(id, firstAmplification),
      },
    },
  );
}

function riteLifecycleMacro(activityIdValue: string, riteName: string): string {
  return [
    `if (workflow?.activity?.id !== ${JSON.stringify(activityIdValue)}) return;`,
    "globalThis.__fvttJsonGeneratorBloodHunterRites ??= { applications: new Map(), restHook: null };",
    "const registry = globalThis.__fvttJsonGeneratorBloodHunterRites;",
    "const originActivityUuid = workflow.activity.uuid;",
    "if (!registry.applications.has(originActivityUuid)) {",
    '  const hookId = Hooks.on("dnd5e.applyEnchantment", async (enchantedItem, currentEffect, context) => {',
    "    if (context?.activity?.uuid !== originActivityUuid) return;",
    "    const conflicts = enchantedItem.effects.filter(candidate => candidate.id !== currentEffect.id && candidate.flags?.fvttJsonGenerator?.bloodHunterRite);",
    '    if (conflicts.length) await enchantedItem.deleteEmbeddedDocuments("ActiveEffect", conflicts.map(candidate => candidate.id));',
    `    ui.notifications.info(${JSON.stringify(`${riteName}已附加；同一武器上的旧血仪已移除。`)});`,
    "  });",
    "  registry.applications.set(originActivityUuid, hookId);",
    "}",
    "if (!registry.restHook) {",
    '  registry.restHook = Hooks.on("dnd5e.restCompleted", async restingActor => {',
    "    for (const ownedItem of restingActor.items) {",
    "      const riteEffectIds = ownedItem.effects.filter(candidate => candidate.flags?.fvttJsonGenerator?.bloodHunterRite).map(candidate => candidate.id);",
    '      if (riteEffectIds.length) await ownedItem.deleteEmbeddedDocuments("ActiveEffect", riteEffectIds);',
    "    }",
    "  });",
    "}",
  ].join("\n");
}

function buildRiteSideData(feature: JsonRecord, damageType: string): JsonRecord {
  const scope = `optional:${feature.name}`;
  const effectId = activityId(`${scope}:effect`, "血仪附魔");
  const loss = buildLossActivity(`${scope}:loss`, "激活失血", false);
  const enchant = triggeredActivity(buildActivity(
    `${scope}:enchant`,
    `激活${feature.name}`,
    "enchant",
    feature.name === "破晓血仪"
      ? "将武器拖入聊天卡以附加破晓血仪。基础光耀伤害自动应用；20尺明亮光照、黯蚀抗性和对不死生物的额外血法骰请按原文确认，当前不会自动猜测持握状态或目标类型。"
      : `将武器拖入聊天卡以附加${feature.name}；使用后只结算一次激活失血。`,
    {
      activation: "bonus",
      range: "self",
      target: "self",
      effects: [{ foundryId: effectId }],
      restrictions: {
        allowMagical: true,
        categories: [],
        properties: [],
        type: "weapon",
      },
      macroData: { name: `${feature.name}：生命周期`, command: "" },
    },
  ), loss._id);
  enchant.macroData.command = riteLifecycleMacro(enchant._id, feature.name);
  const effect = {
    foundryId: effectId,
    name: feature.name,
    type: "enchantment",
    disabled: true,
    transfer: false,
    changes: [
      {
        key: "system.damage.parts",
        mode: "ADD",
        value: JSON.stringify([["@scale.blood-hunter.crimson-rite", damageType]]),
      },
    ],
    flags: {
      dae: { specialDuration: ["shortRest"] },
      fvttJsonGenerator: {
        bloodHunterRite: true,
        riteName: feature.name,
        manualRiders: feature.name === "破晓血仪"
          ? ["removeResistanceWhenNotHeld", "confirmUndeadTarget"]
          : [],
      },
    },
  };
  const dawnResistanceEffectId = activityId(
    `${scope}:effect`,
    "破晓血仪：持握黯蚀抗性（辅助）",
  );
  const dawnActivities = feature.name === "破晓血仪"
    ? [
        buildActivity(
          `${scope}:dawn-resistance`,
          "破晓血仪：持握黯蚀抗性（辅助）",
          "utility",
          "仅在持握附有破晓血仪的武器时使用。获得黯蚀抗性；不再持握或主动解除血仪时，请手动移除此效果。",
          {
            activation: "special",
            range: "self",
            target: "self",
            effects: [{ foundryId: dawnResistanceEffectId }],
          },
        ),
        buildActivity(
          `${scope}:dawn-light`,
          "破晓血仪：20尺明亮光照（提示）",
          "utility",
          "持握附有破晓血仪的武器时，该武器散发20尺明亮光照。当前锁定模组没有可靠的“随附魔武器持握状态同步 Token 光照”契约，请按此提示手动设置或清除光照。",
          { activation: "special", range: "self", target: "self" },
        ),
        buildActivity(
          `${scope}:dawn-undead`,
          "破晓血仪：对不死生物额外伤害",
          "damage",
          "仅在附有破晓血仪的武器命中不死生物时使用；额外造成一枚血法骰的光耀伤害。",
          {
            activation: "special",
            target: "creature",
            formula: "@scale.blood-hunter.hemocraft",
            damageType: "radiant",
          },
        ),
      ]
    : [];
  const dawnEffects = feature.name === "破晓血仪"
    ? [{
        foundryId: dawnResistanceEffectId,
        name: "破晓血仪：持握黯蚀抗性（辅助）",
        type: "base",
        disabled: true,
        transfer: false,
        changes: [{
          key: "system.traits.dr.value",
          mode: "ADD",
          value: "necrotic",
        }],
        flags: {
          dae: { specialDuration: ["shortRest"] },
          fvttJsonGenerator: {
            automation: "assisted",
            removeWhenRiteWeaponNotHeld: true,
          },
        },
      }]
    : [];
  return {
    source: feature.source,
    name: feature.name,
    activities: [enchant, loss, ...dawnActivities],
    effects: [effect, ...dawnEffects],
    flags: {
      "midi-qol": {
        onUseMacroName: [
          `[postActiveEffects]ActivityMacro-${enchant._id}`,
          `[preDamageApplication]ActivityMacro-${loss._id}`,
        ].join(","),
      },
    },
  };
}

function amplifiedOptions(name: string, options: ActivityOptions): ActivityOptions {
  if (name === "腐蚀血咒") {
    return { ...options, formula: "4d6", damageType: "necrotic" };
  }
  if (name === "驱魔血咒") {
    return {
      ...options,
      saveAbility: "wis",
      formula: "3d6",
      damageType: "psychic",
    };
  }
  if (name === "怒号血咒") return { ...options, activation: "bonus" };
  return { ...options };
}

function controlledCurseMacro(activityIdValue: string, curseName: string): string {
  return [
    `if (workflow?.activity?.id !== ${JSON.stringify(activityIdValue)}) return;`,
    "await ChatMessage.create({",
    "  speaker: ChatMessage.getSpeaker({actor}),",
    `  content: ${JSON.stringify(`<p><strong>${curseName}（增幅）</strong>需要当前触发伤害、武器或目标上下文。当前实现不会自动猜测；请按特性原文选择并人工结算动态部分。</p>`)}`,
    "});",
  ].join("\n");
}

function curseEffect(
  scope: string,
  suffix: string,
  data: {
    name: string;
    statuses?: string[];
    changes?: JsonRecord[];
    duration?: JsonRecord;
    specialDuration?: string[];
  },
): JsonRecord {
  return {
    foundryId: activityId(`${scope}:effect`, suffix),
    name: data.name,
    type: "base",
    disabled: true,
    transfer: false,
    statuses: data.statuses ?? [],
    changes: data.changes ?? [],
    duration: {
      ...(data.duration ?? {}),
      ...(!data.duration?.seconds ? { expiry: "sourceEnd" } : {}),
    },
    flags: { dae: { specialDuration: data.specialDuration ?? [] } },
  };
}

function buildCurseSideData(
  feature: JsonRecord,
  scopePrefix = "optional",
): JsonRecord {
  const spec = BLOOD_CURSES[feature.name]!;
  const { chat, ...normalOptions } = spec;
  const scope = `${scopePrefix}:${feature.name}`;
  const effects: JsonRecord[] = [];
  let normalEffect: JsonRecord | undefined;
  let amplifiedEffect: JsonRecord | undefined;
  if (feature.name === "焦虑血咒") {
    normalEffect = curseEffect(scope, "normal", { name: "焦虑血咒：恐慌", statuses: ["frightened"], changes: [] });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅焦虑血咒：恐慌",
      statuses: ["frightened"],
      changes: [{
        key: "flags.midi-qol.disadvantage.save.wis",
        mode: "OVERRIDE",
        value: "true",
      }],
      specialDuration: ["isSave.wis"],
    });
  } else if (feature.name === "捆缚血咒") {
    const changes = [
      ...["walk", "fly", "swim", "climb", "burrow"].map((movement) => ({
        key: `system.attributes.movement.${movement}`,
        mode: "OVERRIDE",
        value: "0",
      })),
      {
        key: "flags.midi-qol.actions.reaction",
        mode: "OVERRIDE",
        value: "true",
      },
    ];
    normalEffect = curseEffect(scope, "normal", {
      name: "捆缚血咒：束缚",
      changes,
    });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅捆缚血咒：束缚",
      changes,
      duration: { seconds: 60 },
      specialDuration: [],
    });
  } else if (feature.name === "胀痛血咒") {
    const changes = ["str", "dex"].map((ability) => ({
      key: `flags.midi-qol.disadvantage.check.${ability}`,
      mode: "OVERRIDE",
      value: "true",
    }));
    normalEffect = curseEffect(scope, "normal", {
      name: "胀痛血咒：检定劣势",
      changes,
    });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅胀痛血咒：检定劣势",
      changes,
      duration: { seconds: 60 },
      specialDuration: [],
    });
  } else if (feature.name === "腐蚀血咒") {
    normalEffect = curseEffect(scope, "normal", { name: "腐蚀血咒：中毒", statuses: ["poisoned"], changes: [] });
    amplifiedEffect = curseEffect(scope, "amplified", { name: "增幅腐蚀血咒：中毒", statuses: ["poisoned"], changes: [] });
  } else if (feature.name === "怒号血咒") {
    normalEffect = curseEffect(scope, "normal", {
      name: "怒号血咒：恐慌",
      statuses: ["frightened"],
      changes: [],
    });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅怒号血咒：恐慌",
      statuses: ["frightened"],
      changes: [],
    });
  } else if (feature.name === "乱心血咒") {
    const changes = [{
      key: "flags.midi-qol.disadvantage.concentration",
      mode: "OVERRIDE",
      value: "true",
    }];
    normalEffect = curseEffect(scope, "normal", {
      name: "乱心血咒：专注劣势",
      changes,
      specialDuration: ["isSave.con"],
    });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅乱心血咒：专注劣势",
      changes,
    });
  } else if (feature.name === "印记血咒") {
    normalEffect = curseEffect(scope, "normal", {
      name: "印记血咒：施法者血仪标记",
      changes: [{
        key: "flags.fvttJsonGenerator.bloodCurseMark",
        mode: "OVERRIDE",
        value: "source-only",
      }],
    });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅印记血咒：全攻击者血仪标记",
      changes: [{
        key: "flags.fvttJsonGenerator.bloodCurseMark",
        mode: "OVERRIDE",
        value: "all-attackers",
      }],
    });
  } else if (feature.name === "噬魂血咒") {
    const changes = [
      { key: "flags.midi-qol.advantage.attack.all", mode: "OVERRIDE", value: "true" },
      { key: "system.traits.dr.value", mode: "ADD", value: "ALL" },
    ];
    normalEffect = curseEffect(scope, "normal", {
      name: "噬魂血咒：生命能量",
      changes,
    });
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅噬魂血咒：生命能量",
      changes,
    });
  } else if (feature.name === "鲁莽血咒") {
    amplifiedEffect = curseEffect(scope, "amplified", {
      name: "增幅鲁莽血咒：AC-2",
      statuses: [],
      changes: [{ key: "system.attributes.ac.bonus", mode: "ADD", value: "-2" }],
    });
  }
  for (const effect of [normalEffect, amplifiedEffect]) if (effect) effects.push(effect);

  const normalActivityOptions = feature.name === "腐蚀血咒"
    ? { ...normalOptions, saveAbility: undefined }
    : normalOptions;
  const normal = curseActivity(feature.name, chat, {
    ...normalActivityOptions,
    effects: normalEffect ? [{ foundryId: normalEffect.foundryId }] : undefined,
  }, scopePrefix);
  const loss = buildLossActivity(`${scope}:loss`, "增幅失血", true);
  const controlled = CONTROLLED_CURSES.has(feature.name);
  const amplifiedName = `增幅：${feature.name}`;
  const amplified = triggeredActivity(curseActivity(
    amplifiedName,
    controlled
      ? `${chat} 此效果需要当前触发事件的动态上下文，自动流程不会自动猜测；宏会发送明确的人工结算提示。`
      : `${chat} 使用本 Activity 结算增幅版本，并自动触发增幅失血。`,
    {
      ...amplifiedOptions(feature.name, normalActivityOptions),
      effects: amplifiedEffect ? [{ foundryId: amplifiedEffect.foundryId }] : undefined,
      macroData: controlled
        ? {
            name: amplifiedName,
            command: controlledCurseMacro(
              activityId(`${scopePrefix}:${amplifiedName}`, amplifiedName),
              feature.name,
            ),
          }
        : undefined,
    },
    scopePrefix,
  ), loss._id);
  const macroCalls = [
    ...(controlled ? [`[postActiveEffects]ActivityMacro-${amplified._id}`] : []),
    `[preDamageApplication]ActivityMacro-${loss._id}`,
  ];
  return {
    ...matchingFields(feature),
    activities: [normal, amplified, loss],
    ...(effects.length ? { effects } : {}),
    flags: {
      "midi-qol": { onUseMacroName: macroCalls.join(",") },
    },
  };
}

function matchingFields(feature: JsonRecord): JsonRecord {
  const keys = [
    "classSource",
    "className",
    "subclassSource",
    "subclassShortName",
    "level",
    "source",
    "name",
  ];
  return Object.fromEntries(keys.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]));
}

const MUTAGEN_CHANGES: Record<string, JsonRecord[]> = {
  "升腾": [{ key: "system.attributes.movement.fly", mode: "OVERRIDE", value: "30" }],
  "幻惑": [{ key: "flags.midi-qol.advantage.check.cha", mode: "OVERRIDE", value: "true" }],
  "迅捷": [
    { key: "system.abilities.dex.value", mode: "ADD", value: "3 + floor(@classes.blood-hunter.levels / 15)" },
    { key: "system.abilities.dex.max", mode: "ADD", value: "3 + floor(@classes.blood-hunter.levels / 15)" },
  ],
  "精通": [{ key: "flags.midi-qol.advantage.check.int", mode: "OVERRIDE", value: "true" }],
  "残虐": [],
  "回声定位": [{ key: "system.attributes.senses.ranges.blindsight", mode: "ADD", value: "30" }],
  "余烬": [{ key: "system.traits.dr.value", mode: "ADD", value: "fire" }],
  "凛冽": [{ key: "system.traits.dr.value", mode: "ADD", value: "cold" }],
  "不穿": [{ key: "system.traits.dr.value", mode: "ADD", value: "piercing" }],
  "灵活移动": [
    { key: "system.traits.ci.value", mode: "ADD", value: "grappled" },
    { key: "system.traits.ci.value", mode: "ADD", value: "restrained" },
  ],
  "夜视": [{ key: "system.attributes.senses.ranges.darkvision", mode: "ADD", value: "60" }],
  "洞察者": [{ key: "flags.midi-qol.advantage.check.wis", mode: "OVERRIDE", value: "true" }],
  "潜能": [
    { key: "system.abilities.str.value", mode: "ADD", value: "3 + floor(@classes.blood-hunter.levels / 15)" },
    { key: "system.abilities.str.max", mode: "ADD", value: "3 + floor(@classes.blood-hunter.levels / 15)" },
  ],
  "精准": [{
    key: "flags.dnd5e.weaponCriticalThreshold",
    mode: "OVERRIDE",
    value: "19 - floor(@classes.blood-hunter.levels / 15)",
  }],
  "急速": [{ key: "system.attributes.movement.walk", mode: "ADD", value: "10 + 5 * floor(@classes.blood-hunter.levels / 15)" }],
  "化学试剂": [],
  "再生": [],
  "睿智": [
    { key: "system.abilities.int.value", mode: "ADD", value: "3 + floor(@classes.blood-hunter.levels / 15)" },
    { key: "system.abilities.int.max", mode: "ADD", value: "3 + floor(@classes.blood-hunter.levels / 15)" },
  ],
  "庇护": [{ key: "system.traits.dr.value", mode: "ADD", value: "slashing" }],
  "不破": [{ key: "system.traits.dr.value", mode: "ADD", value: "bludgeoning" }],
  "红莲": [],
};

function mutagenLimitMacro(activityIdValue: string, mutagenName: string): string {
  return [
    `if (workflow?.activity?.id !== ${JSON.stringify(activityIdValue)}) return;`,
    "const active = actor.effects.filter(effect => effect.flags?.fvttJsonGenerator?.bloodHunterMutagen && !effect.disabled);",
    "const level = Number(actor.classes?.['blood-hunter']?.system?.levels ?? actor.system?.details?.level ?? 0);",
    "const limit = level >= 15 ? 3 : level >= 7 ? 2 : 1;",
    "if (active.length <= limit) return;",
    `await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: ${JSON.stringify(`<p><strong>${mutagenName}</strong>已生效，但当前诱变剂数量超过等级上限。请选择并移除一个旧诱变剂；自动流程不会猜测你的选择。</p>`)}});`,
  ].join("\n");
}

function buildMutagenSideData(feature: JsonRecord): JsonRecord {
  const changes = MUTAGEN_CHANGES[feature.name] ?? [];
  const scope = `optional:${feature.name}`;
  const effectId = activityId(`${scope}:effect`, "诱变剂效果");
  const activity = buildActivity(
    scope,
    `饮用诱变剂：${feature.name}`,
    "utility",
    `以附赠动作饮用已配制的“${feature.name}”诱变剂。可靠字段自动生效；需要攻击、法术或选择上下文的部分会保留明确提示。`,
    {
      activation: "bonus",
      range: "self",
      target: "self",
      effects: [{ foundryId: effectId }],
    },
  );
  activity.macroData = {
    name: `${feature.name}：诱变剂上限`,
    command: mutagenLimitMacro(activity._id, feature.name),
  };
  return {
    source: feature.source,
    name: feature.name,
    activities: [activity],
    effects: [{
      foundryId: effectId,
      name: `诱变剂：${feature.name}`,
      type: "base",
      disabled: true,
      transfer: false,
      changes,
      flags: {
        dae: { specialDuration: ["shortRest"] },
        fvttJsonGenerator: {
          bloodHunterMutagen: true,
          mutagenName: feature.name,
          automation: changes.length ? "automatic" : "assisted",
        },
      },
    }],
    flags: {
      "midi-qol": { onUseMacroName: `[postActiveEffects]ActivityMacro-${activity._id}` },
    },
  };
}

function upsertSideData(
  existing: JsonRecord[] | undefined,
  generated: JsonRecord[],
): JsonRecord[] {
  const generatedKeys = new Set(generated.map((entry) => JSON.stringify(matchingFields(entry))));
  return [
    ...(existing ?? []).filter((entry) => !generatedKeys.has(JSON.stringify(matchingFields(entry)))),
    ...generated,
  ];
}

function buildSideData(
  features: JsonRecord[],
  definitions: FeatureActivityDefinition[],
): JsonRecord[] {
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  return features.flatMap((feature) => {
    const definition = byName.get(feature.name);
    if (!definition) return [];
    if (BLOOD_CURSES[feature.name]) {
      return [buildCurseSideData(
        feature,
        `subclass:${feature.subclassShortName ?? "blood-hunter"}`,
      )];
    }
    return [{
      ...matchingFields(feature),
      ...(definition.system ? { system: definition.system } : {}),
      activities: definition.activities,
      ...(definition.effects ? { effects: definition.effects } : {}),
      ...(definition.flags ? { flags: definition.flags } : {}),
    }];
  });
}

function buildOptionalSideData(features: JsonRecord[]): JsonRecord[] {
  return features.flatMap((feature) => {
    const featureTypes = new Set(feature.featureType ?? []);

    if (featureTypes.has("BC") && BLOOD_CURSES[feature.name]) {
      return [buildCurseSideData(feature)];
    } else if (featureTypes.has("CR") && RITE_DAMAGE_TYPES[feature.name]) {
      return [buildRiteSideData(feature, RITE_DAMAGE_TYPES[feature.name]!)];
    } else if (featureTypes.has("MTGN")) {
      return [buildMutagenSideData(feature)];
    } else if (feature.name === "诱变武者") {
      return [{
        source: feature.source,
        name: feature.name,
        activities: [buildActivity(
          "optional:诱变武者",
          "饮用诱变剂",
          "utility",
          "以附赠动作饮用由诱变武者战斗风格配制的诱变剂。",
          { activation: "bonus", range: "self", target: "self" },
        )],
      }];
    }

    return [];
  });
}

function addBloodCurseScale(foundryClasses: JsonRecord[]): void {
  const bloodHunter = foundryClasses.find((entry) =>
    entry.name === CLASS_NAME && entry.source === SOURCE
  );
  if (!bloodHunter) throw new Error("Blood Hunter foundryClass entry is missing");
  bloodHunter.advancement ??= [];
  if (bloodHunter.advancement.some((entry: JsonRecord) =>
    entry.configuration?.identifier === "blood-curse-uses"
  )) return;
  bloodHunter.advancement.push({
    type: "ScaleValue",
    configuration: {
      identifier: "blood-curse-uses",
      type: "number",
      scale: {
        "1": { value: 2 },
        "6": { value: 3 },
        "13": { value: 4 },
        "17": { value: 5 },
      },
    },
    title: "鲜血秘法使用次数",
  });
}

const NATIVE_CLASS_FEATURES = new Set([
  "武器精通",
  "战斗风格",
  "血猎手子职",
  "属性值提升",
  "额外攻击",
  "子职特性",
  "传奇恩惠",
]);

const NATIVE_SUBCLASS_FEATURES = new Set([
  "弑灵结社",
  "渎魂结社",
  "突变结社",
  "化狼结社",
  "契约魔法",
  "诱变剂",
]);

function findCoverageSideData(
  source: JsonRecord,
  group: "classFeature" | "subclassFeature" | "optionalfeature",
  feature: JsonRecord,
): JsonRecord | undefined {
  const sideKey = group === "classFeature"
    ? "foundryClassFeature"
    : group === "subclassFeature"
    ? "foundrySubclassFeature"
    : "foundryOptionalfeature";
  return (source[sideKey] ?? []).find((entry: JsonRecord) =>
    entry.name === feature.name &&
    (group !== "subclassFeature" ||
      entry.subclassShortName === feature.subclassShortName) &&
    (entry.level === undefined || feature.level === undefined || entry.level === feature.level)
  );
}

function buildFeatureCoverage(source: JsonRecord): JsonRecord {
  const entries: JsonRecord[] = [];
  for (const group of ["classFeature", "subclassFeature", "optionalfeature"] as const) {
    for (const feature of source[group] ?? []) {
      const side = findCoverageSideData(source, group, feature);
      let automation: "automatic" | "assisted" | "manual" | "native" | "missing";
      let note = "";
      if (side) {
        const declared = side.flags?.fvttJsonGenerator?.automation;
        if (["automatic", "assisted", "manual", "native"].includes(declared)) {
          automation = declared;
        } else if ((side.effects ?? []).some((effect: JsonRecord) =>
          (effect.changes?.length ?? 0) > 0 || (effect.statuses?.length ?? 0) > 0
        )) {
          automation = (side.activities?.length ?? 0) > 0 ? "assisted" : "automatic";
        } else if ((side.activities?.length ?? 0) > 0) {
          automation = "assisted";
        } else {
          automation = "native";
        }
      } else if (
        (group === "classFeature" && NATIVE_CLASS_FEATURES.has(feature.name)) ||
        (group === "subclassFeature" && NATIVE_SUBCLASS_FEATURES.has(feature.name))
      ) {
        automation = "native";
      } else if (group === "subclassFeature" && feature.name === "破晓血仪") {
        automation = "automatic";
        note = "represented by optionalfeature 破晓血仪";
      } else {
        automation = "missing";
      }
      entries.push({
        group,
        name: feature.name,
        ...(feature.level !== undefined ? { level: feature.level } : {}),
        ...(feature.subclassShortName ? { subclass: feature.subclassShortName } : {}),
        automation,
        ...(note ? { note } : {}),
      });
    }
  }
  return {
    entries,
    missing: entries.filter((entry) => entry.automation === "missing"),
    counts: Object.fromEntries(
      ["automatic", "assisted", "manual", "native", "missing"].map((automation) => [
        automation,
        entries.filter((entry) => entry.automation === automation).length,
      ]),
    ),
  };
}

function assertExpectedSource(source: JsonRecord, strict: boolean): void {
  if (!source._meta?.sources?.some((entry: JsonRecord) => entry.json === SOURCE)) {
    throw new Error(`Expected ${SOURCE} source`);
  }
  if (!strict) return;

  const counts = {
    classFeature: source.classFeature?.length ?? 0,
    subclassFeature: source.subclassFeature?.length ?? 0,
    optionalfeature: source.optionalfeature?.length ?? 0,
  };
  if (
    counts.classFeature !== 22 ||
    counts.subclassFeature !== 30 ||
    counts.optionalfeature !== 42
  ) {
    throw new Error(
      `BloodHunter2024 1.1 source shape changed: ${JSON.stringify(counts)}`,
    );
  }
  for (const name of ["弑灵", "渎魂", "突变", "化狼"]) {
    if (!source.subclass?.some((entry: JsonRecord) => entry.shortName === name)) {
      throw new Error(`Required Blood Hunter subclass is missing: ${name}`);
    }
  }
}

// anti-overfit: allow explicit-exception - user-authorized side data for the owned BloodHunter2024 homebrew source.
export function enrichBloodHunterHomebrew(
  source: JsonRecord,
  options: EnrichmentOptions = {},
): JsonRecord {
  assertExpectedSource(source, options.strict ?? true);
  const enriched = structuredClone(source);
  addBloodCurseScale(enriched.foundryClass ?? []);

  const classSideData = buildSideData(
    enriched.classFeature ?? [],
    CLASS_DEFINITIONS,
  );
  const requestedSubclasses = new Set(["弑灵", "渎魂", "突变", "化狼"]);
  const subclassSideData = buildSideData(
    (enriched.subclassFeature ?? []).filter((feature: JsonRecord) =>
      requestedSubclasses.has(feature.subclassShortName)
    ),
    SUBCLASS_DEFINITIONS,
  );
  const optionalSideData = buildOptionalSideData(enriched.optionalfeature ?? []);

  enriched.foundryClassFeature = upsertSideData(
    enriched.foundryClassFeature,
    classSideData,
  );
  enriched.foundrySubclassFeature = upsertSideData(
    enriched.foundrySubclassFeature,
    subclassSideData,
  );
  enriched.foundryOptionalfeature = upsertSideData(
    enriched.foundryOptionalfeature,
    optionalSideData,
  );
  enriched._meta ??= {};
  enriched._meta.fvttJsonGenerator = {
    activityProfile: "foundry-14.364-dnd5e-5.3.3",
    moduleVersions: {
      midiQol: "14.0.11",
      dae: "14.0.12",
      itemMacro: "3.0.1-optional-unverified-v14",
    },
    source: SOURCE,
    scope: ["class", "order-of-the-ghostslayer", "order-of-the-profane-soul", "order-of-the-mutant", "order-of-the-lycan"],
    automationBoundary: "Native Enchant/Activity/DAE states plus direct HP-loss Activity Macros; context-sensitive branches use explicit chat fallbacks and are not guessed.",
  };
  enriched._meta.fvttJsonGenerator.coverage = buildFeatureCoverage(enriched);
  return enriched;
}

export function summarizeBloodHunterActivities(source: JsonRecord): {
  classFeatures: number;
  subclassFeatures: number;
  optionalFeatures: number;
  activities: number;
} {
  const classEntries = source.foundryClassFeature ?? [];
  const subclassEntries = source.foundrySubclassFeature ?? [];
  const optionalEntries = source.foundryOptionalfeature ?? [];
  return {
    classFeatures: classEntries.length,
    subclassFeatures: subclassEntries.length,
    optionalFeatures: optionalEntries.length,
    activities: [...classEntries, ...subclassEntries, ...optionalEntries]
      .reduce((sum, entry) => sum + (entry.activities?.length ?? 0), 0),
  };
}

export function validateBloodHunterHomebrew(source: JsonRecord): string[] {
  const findings: string[] = [];
  for (const missing of source._meta?.fvttJsonGenerator?.coverage?.missing ?? []) {
    findings.push(
      `${missing.group}:${missing.subclass ? `${missing.subclass}:` : ""}${missing.name}: missing automation classification`,
    );
  }
  const ids = new Set<string>();
  const validTypes = new Set(["utility", "damage", "save", "heal", "enchant"]);
  const validActivations = new Set(["action", "bonus", "reaction", "special"]);
  const validRecoveryPeriods = new Set(["sr", "lr"]);
  const validDamageTypes = new Set([
    "acid",
    "bludgeoning",
    "cold",
    "fire",
    "force",
    "lightning",
    "necrotic",
    "piercing",
    "poison",
    "psychic",
    "radiant",
    "slashing",
    "thunder",
    "healing",
  ]);

  const groups = [
    source.foundryClassFeature ?? [],
    source.foundrySubclassFeature ?? [],
    source.foundryOptionalfeature ?? [],
  ];
  for (const entry of groups.flat()) {
    const entryActivityIds = new Set(
      (entry.activities ?? []).map((activity: JsonRecord) => activity._id),
    );
    const entryEffectIds = new Set(
      (entry.effects ?? []).map((effect: JsonRecord) => effect.foundryId),
    );
    for (const activity of entry.activities ?? []) {
      if (!validTypes.has(activity.type)) {
        findings.push(`${entry.name}: unsupported Activity type ${activity.type}`);
      }
      if (!/^[a-f0-9]{16}$/.test(activity._id ?? "")) {
        findings.push(`${entry.name}: invalid Activity ID`);
      } else if (ids.has(activity._id)) {
        findings.push(`${entry.name}: duplicate Activity ID ${activity._id}`);
      } else {
        ids.add(activity._id);
      }
      if (!validActivations.has(activity.activation?.type)) {
        findings.push(`${entry.name}: invalid activation`);
      }
      if (!activity.description?.chatFlavor) {
        findings.push(`${entry.name}: missing source-boundary chat flavor`);
      }
      const triggeredId = activity.midiProperties?.triggeredActivityId;
      if (
        triggeredId &&
        triggeredId !== "none" &&
        !entryActivityIds.has(triggeredId)
      ) {
        findings.push(`${entry.name}: missing triggered Activity ${triggeredId}`);
      }
      for (const effect of activity.effects ?? []) {
        if (effect.foundryId && !entryEffectIds.has(effect.foundryId)) {
          findings.push(`${entry.name}: missing Activity effect ${effect.foundryId}`);
        }
      }
      for (const recovery of activity.uses?.recovery ?? []) {
        if (!validRecoveryPeriods.has(recovery.period)) {
          findings.push(`${entry.name}: invalid recovery period ${recovery.period}`);
        }
      }
      if (activity.type === "save") {
        if (!activity.save?.ability?.length || activity.save?.dc?.calculation !== "int") {
          findings.push(`${entry.name}: invalid Blood Hunter save`);
        }
      }
      const parts = activity.damage?.parts
        ?? (activity.healing ? [activity.healing] : []);
      for (const part of parts) {
        for (const damageType of part.types ?? []) {
          if (!validDamageTypes.has(damageType)) {
            findings.push(`${entry.name}: invalid damage type ${damageType}`);
          }
        }
        if (part.custom?.enabled && !part.custom.formula) {
          findings.push(`${entry.name}: empty custom roll formula`);
        }
      }
      for (const target of activity.consumption?.targets ?? []) {
        if (
          target.type === "itemUses" &&
          target.target !== "" &&
          target.target !== "blood-maledict"
        ) {
          findings.push(`${entry.name}: shared resource target must be blood-maledict`);
        }
      }
      if (activity.type === "enchant") {
        if (
          activity.restrictions?.type !== "weapon" ||
          activity.restrictions?.allowMagical !== true
        ) {
          findings.push(`${entry.name}: invalid weapon enchantment restrictions`);
        }
        if (!(activity.effects?.length > 0)) {
          findings.push(`${entry.name}: enchantment has no effect`);
        }
      }
      if (
        ["激活失血", "增幅失血"].includes(activity.name) &&
        activity.type !== "damage"
      ) {
        findings.push(`${entry.name}: direct loss must use a damage Activity`);
      }
    }
    for (const effect of entry.effects ?? []) {
      if (!/^[a-f0-9]{16}$/.test(effect.foundryId ?? "")) {
        findings.push(`${entry.name}: invalid effect ID`);
      }
      if (
        effect.type === "enchantment" &&
        !effect.flags?.dae?.specialDuration?.includes("shortRest")
      ) {
        findings.push(`${entry.name}: enchantment must expire on short rest`);
      }
      for (const duration of effect.flags?.dae?.specialDuration ?? []) {
        if (["turnStart", "turnEnd", "turnStartSource", "turnEndSource", "combatEnd"].includes(duration)) {
          findings.push(`${entry.name}: deprecated DAE duration ${duration}`);
        }
      }
      if (effect.type === "enchantment") {
        const damageChange = effect.changes?.find((change: JsonRecord) =>
          change.key === "system.damage.parts"
        );
        if (!damageChange) findings.push(`${entry.name}: enchantment missing system.damage.parts`);
        else {
          try {
            const parsed = JSON.parse(damageChange.value);
            if (!Array.isArray(parsed) || !parsed[0]?.[0] || !parsed[0]?.[1]) {
              findings.push(`${entry.name}: invalid enchantment damage part`);
            }
          } catch {
            findings.push(`${entry.name}: invalid enchantment damage part`);
          }
        }
      }
    }
  }

  for (const passive of [
    "武器精通",
    "战斗风格",
    "契约魔法",
  ]) {
    if (groups.flat().some((entry) => entry.name === passive)) {
      findings.push(`${passive}: passive/choice feature must remain Activity-free`);
    }
  }
  return findings;
}

export async function fetchBloodHunterSource(
  fetchImpl: FetchLike = fetch,
  options: {
    attempts?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
  } = {},
): Promise<JsonRecord> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retryDelayMs = options.retryDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(BLOOD_HUNTER_HOMEBREW_URL, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json() as JsonRecord;
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs > 0) {
        await Bun.sleep(retryDelayMs * attempt);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Blood Hunter homebrew fetch failed after ${attempts} attempts: ${detail}`,
  );
}

export async function buildBloodHunterHomebrew(
  config: FoundryLabConfig,
  options: { apply: boolean; sourceFile?: string },
): Promise<{
  apply: boolean;
  output: string;
  source: string;
  summary: ReturnType<typeof summarizeBloodHunterActivities>;
}> {
  let source: JsonRecord;
  let sourceLabel: string;
  if (options.sourceFile) {
    const sourceFile = resolve(options.sourceFile);
    source = JSON.parse(await readFile(sourceFile, "utf8"));
    sourceLabel = sourceFile;
  } else {
    source = await fetchBloodHunterSource();
    sourceLabel = BLOOD_HUNTER_HOMEBREW_URL;
  }

  const enriched = enrichBloodHunterHomebrew(source);
  const findings = validateBloodHunterHomebrew(enriched);
  if (findings.length) {
    throw new Error(
      `Blood Hunter Activity validation failed:\n${findings.join("\n")}`,
    );
  }
  const output = resolve(
    config.profiles.serverMirror.dataPath,
    "Data/assets/homebrew/blood-hunter-2024.activities.json",
  );
  assertInsideLabRoot(config, output);

  if (options.apply) {
    await mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.codex-build.tmp`;
    await writeFile(temporary, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
    await rename(temporary, output);
  }

  return {
    apply: options.apply,
    output,
    source: sourceLabel,
    summary: summarizeBloodHunterActivities(enriched),
  };
}
