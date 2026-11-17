import { DND5E_V14_SYSTEM_VERSION } from '@fvtt-json-generator/contracts/target';
import type { MonsterIntakeConfig } from './config';
import type { HttpClient } from './http';
import { sourceChargedSpellOptions } from './item-charged-spell-evidence';
import { MonsterIntakeProviderError, parseStrictJson, type IntakeProviderAuditEvent } from './provider';
import {
  IntakeTransportError,
  requestIntakeProvider,
  type IntakeRequestWaitPolicy,
  type IntakeProviderActivity,
  type IntakeTransportOptions,
} from './transport';
import { ITEM_ACTIVATION_TYPES, ITEM_DAMAGE_TYPES, ITEM_INTAKE_RECOVERY_PERIODS, ITEM_MOVEMENT_TYPES, ITEM_ROLL_ABILITIES } from './item-types';
import type {
  ItemAiReviewResult,
  ItemDiscoveryRequest,
  ItemDiscoveryResult,
  ItemExtractionRequest,
  ItemIntakeAiProvider,
  ItemIntakeIR,
  ItemRepairRequest,
  ItemReviewRequest,
} from './item-types';

export const ITEM_INTAKE_PROMPT_VERSIONS = {
  discover: 'item-intake-discover-v3',
  extract: 'item-intake-extract-v14',
  review: 'item-intake-review-v5',
  repair: 'item-intake-repair-v13',
} as const;

type ItemIntakeStage = keyof typeof ITEM_INTAKE_PROMPT_VERSIONS;

const EVIDENCE_REF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['start', 'end', 'quote'],
  properties: {
    start: { type: 'integer' },
    end: { type: 'integer' },
    quote: { type: 'string' },
  },
};

const EVIDENCE_ARRAY_SCHEMA = {
  type: 'array',
  items: EVIDENCE_REF_SCHEMA,
};

const ITEM_STRING = { type: 'string' };
const ITEM_INTEGER = { type: 'integer' };
const ITEM_ACTIVATION = { type: 'string', enum: ITEM_ACTIVATION_TYPES };
const ITEM_ROLL_ABILITY = { type: 'string', enum: ITEM_ROLL_ABILITIES };
const ITEM_DAMAGE_TYPE = { type: 'string', enum: ITEM_DAMAGE_TYPES };

function closedItemObject(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

function nullableItemField(schema: unknown) {
  return { anyOf: [schema, { type: 'null' }] };
}

function itemAbilitySchema(kind: string, properties: Record<string, unknown>) {
  return closedItemObject({ id: ITEM_STRING, kind: { type: 'string', enum: [kind] }, ...properties, evidence: EVIDENCE_ARRAY_SCHEMA });
}

const ITEM_ACTIVITY_NAME = { name: nullableItemField(ITEM_STRING), englishName: nullableItemField(ITEM_STRING) };
const ITEM_DAMAGE = { type: 'array', items: closedItemObject({
  formula: ITEM_STRING,
  type: ITEM_DAMAGE_TYPE,
  scaling: nullableItemField(closedItemObject({ mode: { type: 'string', enum: ['whole', 'half'] }, number: ITEM_INTEGER })),
}) };
const ITEM_TARGET = {
  type: { type: 'string', enum: ['creature', 'self'] }, count: ITEM_INTEGER, special: nullableItemField(ITEM_STRING),
};
const ITEM_RANGE = nullableItemField(closedItemObject({ value: ITEM_INTEGER, units: { type: 'string', enum: ['ft', 'self'] } }));
const ITEM_DURATION = nullableItemField(closedItemObject({
  value: ITEM_INTEGER, units: { type: 'string', enum: ['round', 'minute', 'hour'] }, concentration: { type: 'boolean' },
}));
const ITEM_WEIGHT = nullableItemField(closedItemObject({
  value: { type: 'number' }, units: { type: 'string', enum: ['lb', 'kg'] },
}));

const ITEM_USES_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['max', 'recovery'],
      properties: {
        max: { type: 'integer', minimum: 1 },
        recovery: {
          type: 'array',
          items: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['period', 'type'],
                properties: {
                  period: { type: 'string', enum: ITEM_INTAKE_RECOVERY_PERIODS },
                  type: { type: 'string', enum: ['recoverAll'] },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['period', 'type', 'formula'],
                properties: {
                  period: { type: 'string', enum: ITEM_INTAKE_RECOVERY_PERIODS },
                  type: { type: 'string', enum: ['formula'] },
                  formula: { type: 'string' },
                },
              },
            ],
          },
        },
      },
    },
    { type: 'null' },
  ],
};

const ITEM_IR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'source', 'item', 'claims', 'coverage', 'uncertainties'],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['sha256', 'length'],
      properties: {
        sha256: { type: 'string' },
        length: { type: 'integer' },
      },
    },
    item: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'englishName', 'type', 'rarity', 'attunement', 'stages', 'uses', 'abilities'],
      properties: {
        name: { type: 'string' },
        englishName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        type: { type: 'string' },
        rarity: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        attunement: { anyOf: [{ type: 'string', enum: ['required', 'optional', 'none'] }, { type: 'null' }] },
        stages: {
          anyOf: [
            {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'evidence'],
                properties: {
                  name: { type: 'string' },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
            },
            { type: 'null' },
          ],
        },
        uses: ITEM_USES_SCHEMA,
        abilities: {
          type: 'array',
          items: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'kind', 'value', 'evidence'],
                properties: {
                  id: { type: 'string' },
                  kind: { type: 'string', enum: ['passive-ac'] },
                  value: { type: 'integer' },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'kind', 'activation', 'consumption', 'bright', 'dim', 'extinguish', 'evidence'],
                properties: {
                  id: { type: 'string' },
                  kind: { type: 'string', enum: ['light'] },
                  activation: { type: 'string', enum: ['action', 'bonus', 'reaction', 'free'] },
                  consumption: { type: 'integer', enum: [0] },
                  bright: { type: 'number', minimum: 0 },
                  dim: { type: 'number', minimum: 0 },
                  extinguish: { type: 'string', enum: ['disable-effect'] },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'kind', 'activation', 'consumption', 'activityUses', 'level', 'saveDc', 'maxCharges', 'activationOverride', 'spell', 'evidence'],
                properties: {
                  id: { type: 'string' },
                  kind: { type: 'string', enum: ['spell'] },
                  activation: { type: 'string', enum: ['action', 'bonus', 'reaction', 'free'] },
                  consumption: { type: 'integer', minimum: 0 },
                  activityUses: ITEM_USES_SCHEMA,
                  level: { anyOf: [{ type: 'integer', minimum: 0, maximum: 9 }, { type: 'null' }] },
                  saveDc: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
                  maxCharges: { anyOf: [{ type: 'integer', minimum: 2 }, { type: 'null' }] },
                  activationOverride: { anyOf: [{ type: 'boolean', enum: [true] }, { type: 'null' }] },
                  spell: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['identifier', 'name'],
                    properties: {
                      identifier: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  evidence: EVIDENCE_ARRAY_SCHEMA,
                },
              },
              itemAbilitySchema('passive-save', { value: ITEM_INTEGER }),
              itemAbilitySchema('passive-resistance', { damageType: ITEM_DAMAGE_TYPE }),
              itemAbilitySchema('passive-movement', { movement: { type: 'string', enum: ITEM_MOVEMENT_TYPES }, value: ITEM_INTEGER }),
              itemAbilitySchema('weapon-bonus', { baseItem: ITEM_STRING, value: ITEM_INTEGER }),
              itemAbilitySchema('enchant-weapon-bonus', { bonuses: { type: 'array', items: { type: 'integer', enum: [1, 2, 3] } } }),
              itemAbilitySchema('enchant-armor-resistance', { damageTypes: { type: 'array', items: ITEM_DAMAGE_TYPE } }),
              itemAbilitySchema('spell-scroll', {
                level: nullableItemField(ITEM_INTEGER),
                spell: nullableItemField(closedItemObject({ identifier: ITEM_STRING, name: ITEM_STRING })),
              }),
              itemAbilitySchema('spell-storage', {
                capacity: { type: 'integer', enum: [5] },
                foundLevels: { type: 'string', enum: ['1d6-1'] },
                spells: { type: 'array', items: closedItemObject({
                  spell: closedItemObject({ identifier: ITEM_STRING, name: ITEM_STRING }),
                  level: ITEM_INTEGER, ability: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
                  saveDc: ITEM_INTEGER, attackBonus: ITEM_INTEGER,
                }) },
              }),
              itemAbilitySchema('timed-speed', { seconds: ITEM_INTEGER }),
              itemAbilitySchema('summon-creature', {
                actorName: { type: 'string' }, actorUuid: { type: 'string' },
                rangeFeet: ITEM_INTEGER, durationHours: ITEM_INTEGER, cooldownDays: ITEM_INTEGER,
              }),
              itemAbilitySchema('container', {
                count: nullableItemField(ITEM_INTEGER),
                weight: ITEM_WEIGHT,
                volume: nullableItemField(closedItemObject({
                  value: { type: 'number' }, units: { type: 'string', enum: ['cubicFoot', 'liter'] },
                })),
                itemWeight: ITEM_WEIGHT,
                weightlessContents: { type: 'boolean' },
              }),
              itemAbilitySchema('heal', {
                ...ITEM_ACTIVITY_NAME,
                activation: { type: 'string', enum: ['action', 'bonus'] },
                formula: ITEM_STRING,
                target: { type: 'string', enum: ['self', 'creature'] },
                range: nullableItemField(ITEM_INTEGER),
                consumption: { type: 'integer', enum: [1] },
              }),
              itemAbilitySchema('attack', {
                ...ITEM_ACTIVITY_NAME, activation: ITEM_ACTIVATION,
                attackType: { type: 'string', enum: ['mwak', 'rwak', 'msak', 'rsak'] },
                ability: nullableItemField(ITEM_ROLL_ABILITY), toHit: nullableItemField(ITEM_INTEGER),
                range: ITEM_STRING, target: nullableItemField(closedItemObject(ITEM_TARGET)), damage: ITEM_DAMAGE,
              }),
              itemAbilitySchema('save', {
                ...ITEM_ACTIVITY_NAME, activation: ITEM_ACTIVATION, ability: ITEM_ROLL_ABILITY, dc: ITEM_INTEGER,
                outcome: { type: 'string', enum: ['none', 'half', 'full'] }, consumption: ITEM_INTEGER,
                scaleMax: nullableItemField(ITEM_INTEGER), damage: ITEM_DAMAGE,
                range: ITEM_RANGE, target: nullableItemField(closedItemObject(ITEM_TARGET)), duration: ITEM_DURATION,
              }),
              itemAbilitySchema('utility', {
                ...ITEM_ACTIVITY_NAME, activation: ITEM_ACTIVATION, consumption: ITEM_INTEGER,
                trigger: nullableItemField(ITEM_STRING), range: ITEM_RANGE, duration: ITEM_DURATION,
                target: nullableItemField(closedItemObject({ ...ITEM_TARGET, template: nullableItemField(closedItemObject({
                  type: { type: 'string', enum: ['radius', 'sphere'] }, size: ITEM_INTEGER, units: { type: 'string', enum: ['ft'] },
                })) })),
              }),
            ],
          },
        },
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'valueKind', 'value', 'evidence'],
        properties: {
          path: { type: 'string' },
          valueKind: { type: 'string', enum: ['explicit', 'preserved-literal', 'user-confirmed'] },
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' },
            ],
          },
          evidence: EVIDENCE_ARRAY_SCHEMA,
        },
      },
    },
    coverage: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['start', 'end', 'quote', 'classification', 'claimPaths', 'reason'],
        properties: {
          start: { type: 'integer' },
          end: { type: 'integer' },
          quote: { type: 'string' },
          classification: { type: 'string', enum: ['mechanical', 'narrative', 'ignored-with-reason'] },
          claimPaths: { type: 'array', items: { type: 'string' } },
          reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    uncertainties: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'code', 'path', 'message', 'blocking', 'evidence', 'candidates'],
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          path: { type: 'string' },
          message: { type: 'string' },
          blocking: { type: 'boolean' },
          evidence: EVIDENCE_ARRAY_SCHEMA,
          candidates: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        },
      },
    },
  },
};

const ITEM_INTAKE_JSON_SCHEMAS: Record<ItemIntakeStage, Record<string, unknown>> = {
  discover: {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'candidates'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'start', 'end', 'quote'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            start: { type: 'integer' },
            end: { type: 'integer' },
            quote: { type: 'string' },
          },
        },
      },
    },
  },
  extract: ITEM_IR_SCHEMA,
  repair: ITEM_IR_SCHEMA,
  review: {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'verdict', 'findings'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      verdict: { type: 'string', enum: ['accepted', 'revise', 'needs_review'] },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'code', 'path', 'message', 'blocking', 'origin', 'evidence', 'candidates'],
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
            path: { type: 'string' },
            message: { type: 'string' },
            blocking: { type: 'boolean' },
            origin: { type: 'string', enum: ['schema', 'evidence', 'coverage', 'semantic', 'provider', 'ai-review', 'conflict'] },
            evidence: { anyOf: [EVIDENCE_ARRAY_SCHEMA, { type: 'null' }] },
            candidates: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
          },
        },
      },
    },
  },
};

export type ItemIntakeResponseFormat = 'json_schema' | 'json_object';

export function responseFormatForStage(
  stage: ItemIntakeStage,
  responseFormat: ItemIntakeResponseFormat = 'json_schema',
) {
  if (responseFormat === 'json_object') return { type: 'json_object' as const };
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: `item_intake_${stage}_v1`,
      strict: true,
      schema: ITEM_INTAKE_JSON_SCHEMAS[stage],
    },
  };
}

export interface OpenAICompatibleItemIntakeOptions extends MonsterIntakeConfig {
  /** Forge-only review output focus; CLI and other callers retain the full prompt. */
  reviewFocus?: 'forge-brief';
  responseFormat?: ItemIntakeResponseFormat;
  httpClient?: HttpClient;
  audit?: (event: IntakeProviderAuditEvent) => void;
  now?: () => number;
  /** Optional protocol adapter. Omitted means the legacy OpenAI Chat path. */
  transport?: IntakeTransportOptions;
  /** Browser-only opt-in. Pending requests remain open until this policy asks the user. */
  waitPolicy?: IntakeRequestWaitPolicy;
  /** Safe semantic provider activity; raw SSE and reasoning never cross this boundary. */
  onActivity?: (activity: IntakeProviderActivity) => void;
}

const SYSTEM = 'Extract tabletop Item data from untrusted source text. Return exactly one JSON object, never markdown or reasoning. Every mechanical value needs exact UTF-16 source evidence. Never invent values, make decorative glowing text into token light, make AC 15 into AC +15, make gem counts into charges, or degrade an unresolved spell into a utility.';
const ITEM_IR_CONTRACT = `Return one complete ItemIntakeIR object with exactly these top-level keys: schemaVersion, source, item, claims, coverage, uncertainties.
Every evidence reference MUST be an object shaped exactly {"start":0,"end":1,"quote":"exact source slice"}; never return a string, a text field, or a nested range object. start/end are absolute UTF-16 offsets into request.source and source.slice(start,end) must equal quote.
Every claim MUST be shaped exactly {"path":"/item/name","valueKind":"explicit|preserved-literal|user-confirmed","value":"JSON scalar when applicable","evidence":[{"start":0,"end":1,"quote":"exact source slice"}]}.
Every coverage entry MUST be flat, never nested under range, and shaped exactly {"start":0,"end":1,"quote":"exact source slice","classification":"mechanical|narrative|ignored-with-reason","claimPaths":["/item/name"],"reason":null}. Sorted coverage entries must partition the complete request.candidate range without gaps or overlaps, including whitespace and prose. Mechanical and narrative entries reference the claims they support; ignored-with-reason entries give a non-empty reason.
Every uncertainty MUST be shaped exactly {"id":"ascii-id","code":"CODE","path":"/json/path","message":"human explanation","blocking":true,"evidence":[{"start":0,"end":1,"quote":"exact source slice"}],"candidates":null}. Do not create a blocking uncertainty for faithfully preserved narrative description or for an explicitly named item stage. Only an ambiguity that prevents faithful representation of a supported mechanic is blocking.`;
const COMPLETE_ITEM_EVIDENCE = `Populate item.abilities before writing notes. Include claims for /item/name, /item/type and, when limited uses exist, /item/uses/max and each stated /item/uses/recovery. Give each an exact nonempty source quote; for item type cite the printed category line in full so a word repeated elsewhere cannot be mistaken for the category. For one continuous candidate with no ignored sections, you may use one coverage entry with the complete exact request.candidate.quote and all relevant claim paths. Do not leave evidence, claims or coverage empty for a recognized item.`;
const ITEM_VALUE_CONTRACT = `item MUST have exactly {"name":"","englishName":null,"type":"","rarity":null,"attunement":null,"stages":null,"uses":null,"abilities":[]}.
englishName and rarity are string or null. attunement is exactly "required", "optional", "none", or null; translate explicit source wording into that enum. stages is null or an array of exactly {"name":"source stage label","evidence":[EvidenceRef]}.
Preserve a source item category such as Ring or 戒指 as item.type. Use uses:null for items without limited uses. A limited item has uses:{"max":1,"recovery":[{"period":"lr","type":"recoverAll"}]}. Use lr for Long Rest/长休, sr for Short Rest/短休, dawn for dawn/黎明, dusk for dusk/黄昏, and day only for a daily limit without a specified rest or dawn/dusk. “Cannot use again until the next Long Rest” is one use with lr recovery, not an ambiguity. An item with limited uses and no recovery has an empty recovery array. For explicit numeric or dice-based recovery, use {"period":"dawn","type":"formula","formula":"1d6 + 1"} with the exact formula from the source. Never invent a recovery period or turn dice recovery into recoverAll. Quote only the clause for each automatic Item pool recovery in a claim at /item/uses/recovery. The long-rest limit of another property, recovery of a spell slot, and a die result that may restore charges are separate rules. For a spell, set consumption to the explicit cost, 1 for a single use, or 0 for at-will without a cost. If the text specifies that just this Cast has its own limit instead of drawing from the Item's charges, use activityUses:{"max":1,"recovery":[{"period":"lr","type":"recoverAll"}]}; keep Item uses and Cast uses separate. A previously supported single limited Cast can use the Item pool when nothing in the source distinguishes multiple pools. Quote this Cast’s rule, not another activity's usage or recovery. Set level and saveDc only for an explicit level and fixed save DC stated by the source. For an explicit one extra charge per level, preserve the stated base consumption and quote the same spell's cost, increment, and cap. maxCharges is the total charge cap, not a spell level. If the source states a maximum spell level and a verified spell supplies the base level, the program can derive the corresponding total cap. Never assume the base price is one. Set activationOverride to true only if source explicitly gives a different casting time than the locked spell. Use null for any absent optional spell field. Special consequences such as destruction on a last-charge roll and wearer/attunement eligibility are GM rules: preserve the literal wording and add a nonblocking uncertainty if the base cost can still execute correctly. Make uncertainty blocking if it changes whether a cost, roll or spell can execute correctly. Never silently drop or approximate a rule.
abilities is always an array, never an object or keyed map. Every ability has id, kind, and evidence:[EvidenceRef]. Include all keys declared by the chosen schema. Use null for optional facts only. Do not send raw Foundry keys, UUIDs, effects, flags, macros, or scripts.
passive-ac and passive-save take value. Use passive-save for explicit bonuses to all saving throws, never a specific save. passive-resistance takes damageType for continuous resistance to one explicit damage type. passive-movement takes movement (walk, fly, swim, climb, burrow) and value for an explicitly added speed in feet. Ordinary worn or held requirements keep the native equipped/attunement gate. For other eligibility such as wearing no armor, specific effects/creatures, or an ongoing on/off or timed rule without a faithful native operation, preserve the source and flag a GM note. Do not turn a conditional advantage, replacement speed, resistance or AC into an unconditional modifier. weapon-bonus uses baseItem (the explicit mundane weapon identifier) and value only when the same bonus applies to weapon attack and damage rolls. The bonus alone is not an extra attack.
light takes activation (action, bonus, reaction, free), consumption 0, bright, dim, extinguish "disable-effect". spell takes activation, consumption, activityUses, level, saveDc, maxCharges, activationOverride, and spell:{identifier,name}.
container takes count, weight, volume, itemWeight and weightlessContents. Use it for a Container or Wondrous Item with explicit storage limits or weight-independent contents; retain the original category in item.type. A capacity counts stored objects, weight (lb or kg) or volume (cubicFoot or liter). Express concurrent limits together; keep outer or internal dimensions, load capacity, and the container's own weight separate. itemWeight is the stated weight of the container itself. Include the exact numbers, units, and any statement that contents do not add weight in evidence. Use null for an unstated limit or own weight, false for unstated weightlessness. Keep uses:null and provide no Activities for this native Container. Retain retrieval actions, time/air, hazards and other unsupported rules in the source and GM notes.
spell-scroll takes level (explicit 0 through 9, or null if unstated) and spell:{identifier,name} (or null for a generic leveled Spell Scroll). Use it only for the standard Spell Scroll, and cite the actual spell bound to the scroll, never a spell merely mentioned among examples. Use the source category wording and keep uses:null; the scroll's default single-use destruction, fixed DC, and spell attack bonus come from the locked standard. Do not emit a separate spell ability for the same scroll. Preserve class eligibility, checks for casting a higher-level spell, interruptions, and copying in the source and GM notes.
spell-storage is for the 2024 Rare attuned ring that stores a total of 5 spell levels, not 5 charges. Use capacity:5, foundLevels:"1d6-1", and spells:[] when no actual inventory is stated, including when the description says the GM determines what is found. Each explicitly currently stored spell needs {spell:{identifier,name},level,ability,saveDc,attackBonus} from its own quoted entry: level of the slot actually used, the original caster's ability abbreviation, and original save DC and signed attack bonus. Preserve each copy separately, including duplicates. Cite the overall capacity, discovery formula and original caster rules, and quote every stated current entry with all its values. Do not roll, invent entries or compute missing caster values. Keep item.uses:null; no separate spell abilities for this mechanic. Record missing stats for an explicit stored spell as a blocking uncertainty, and leave the manual casting-into-the-ring rule in the source.
timed-speed is for an attuned Wondrous Item whose bonus action doubles all existing Speed, repeating the trigger can stop the effect, and the source gives a cumulative time budget that fully returns when a Long Rest is completed. Give seconds (10 minutes = 600). Quote the start, stop, speed, cumulative amount and Long Rest exactly. Keep item.uses:null and do not add a separate Utility or passive-speed ability. Restricted opportunity attack disadvantage stays in the source; report it as a nonblocking GM note, not a global modifier.
summon-creature is for a Wondrous Item that uses a Magic action to become one named creature in an unoccupied space, lasts a stated number of hours, and becomes a figurine again before a stated cooldown in days. Copy actorUuid and actorName exactly from the one source @UUID[...]{...} Actor link. State rangeFeet, durationHours and cooldownDays from the rules, with exact evidence. Never invent an Actor link or use a spell. If no explicit link is present, this needs a GM binding. Keep item.uses:null and use only this ability.
For a Wondrous Item that throws an object within a stated range, rolls one die for a creature that vanishes at next dawn or at 0 HP, and has a shared number of draws until next dawn, keep item.abilities:[] and item.uses:null. The generator reads that pool and the numbered NPC Actor links plus standalone rollable @Embed Compendium RollTable reference directly from the preserved source. Do not approximate it as a fixed figurine, spell, or Utility. Preserve all rules and table rows in source coverage.
For a template applying to any simple or martial weapon with the standard Uncommon (+1), Rare (+2), Very Rare (+3) tiers, use one enchant-weapon-bonus with bonuses:[1,2,3] or the explicitly listed subset. The item rarity is null; quote the category, all rarity/tier pairs, and the clause giving bonuses to both weapon attack and damage rolls. A fixed bonus for a specific base weapon still uses weapon-bonus.
For rare light/medium/heavy armor requiring attunement with one damage resistance selected by the GM, use one enchant-armor-resistance with damageTypes listing all source options in source order. Cite the category, rarity and attunement, the wearing/choice rule, and the full list or table. Keep type as stated, uses:null, and no separate passive-resistance abilities for the options. Do not pick an option by default. Both templates use Foundry's native variant selection when the GM applies them to a base Item.
heal is a one-bottle potion use: name, englishName, activation (action or bonus), formula (exact basic dice or fixed amount), target (self or creature), range (feet for creature, null for self), consumption 1. If the same use can heal the drinker or be administered to one nearby creature, use target "creature" and the exact stated range, and quote both options. This mechanically represents one selected recipient, self included. One consumed bottle is the native potion lifecycle. Do not put the per-bottle limit into shared item uses, and do not equate item quantity with uses. Keep the facts about drinking and administration as source text.
attack uses name, englishName, activation, attackType (mwak, rwak, msak, rsak), ability, toHit, exact range text, target, damage. If source requests the wielder’s Strength and proficiency, use ability "str" and toHit:null. A source-stated fixed total uses toHit and ability:null. Do not invent fixed to-hit from a character calculation. If a shield bash is one swing of the Attack action, use action and quote that clause. Write a known source ability modifier in a damage formula as @mod; keep the ability used by the roll explicit. Attack never applies push or size-dependent prone automatically.
save uses name, englishName, activation, ability, dc, outcome (none, half, full save damage), consumption, scaleMax, damage, range, target, duration. utility uses name, englishName, activation, consumption, trigger, range, duration, target. Positive consumption needs its own cited Item uses; when the source explicitly says a feature cannot be used until next dawn, use consumption 1 and puts max 1 with dawn recoverAll on the item if there is no other pool. Encode native duration, concentration and originating area only if explicit. Preserve exact trigger as trigger (null without source trigger). Preserve forced movement, exclusion, prevention and other unsupported riders verbatim and as distinct nonblocking GM notes if the basic roll/activation can still run correctly. Never create an unconditional effect for such a rider.
For attack and save, damage is an array of {formula,type,scaling}; scaling is null unless damage grows explicitly per extra charge (then {mode:"whole" or "half",number:<dice per added charge>}). Range is {value,units:"ft" or "self"} or null, except attack range is original text. Duration is {value,units:"round" or "minute" or "hour",concentration} or null. Target is {type:"creature" or "self",count,special} or null. Utility target additionally has template:null or {type:"radius" or "sphere",size,units:"ft"} when specifically stated. Use null for absent special wording. Set scaleMax only for explicit charge scaling with a supported total cap.
Required mechanical claim paths use stable ability ids, not array indexes: /item/name, /item/type, /item/uses/max when present, and /item/abilities/<ability.id> for every ability. Quotes should cover each mechanic's complete rule and its source conditions.`;
const CHARGED_SPELL_CONTRACT = `Before drafting item.abilities, inventory every spell the item explicitly lets its wearer cast across all named sections, inline lists, bullet lists and spell-cost tables. Emit one kind:"spell" ability with a distinct ID and its exact consumption for each granted casting option. A charge pool alone models none of its casts. Read parenthesized costs, the charge-cost column and explicit shared prices; never use one spell's cost or the recovery amount for another spell. For each ability, give an exact spell-and-cost quote, plus a separate exact quote for any shared casting rule that governs it. If request.chargedSpellOptions is present, it lists source-located name/cost pairs that must each be represented, or have a blocking uncertainty if unresolved. Scan the source for other grants too. Keep any corruption, side effect or special wearer requirement in separate notes; those rules do not turn supported casts into prose-only entries. Learning a cantrip, spell examples, and spells used by somebody else are not Item casts.`;
const ITEM_SPELL_CATALOG_CONTRACT = `For a matching request.spellCatalog entry, use its exact identifier, name and activation. If the source changes the casting time for this spell, cite that clause and use activationOverride:true. Otherwise use activationOverride:null, not false, and inherit the base level by setting level:null unless the source explicitly states a casting level. The program derives a charged upcast cap from the verified base level and the quoted row. A valid older spell is still valid. verifiedDamageVariant is a fixed damage type already checked and bound by Forge, including a dedicated copy when needed. Keep its Cast with the exact quoted price and do not report that matching variant unresolved. Report only an unverified variant with its own spell path and exact source row. Every complete spell row still needs its Cast.`;
const PROMPTS = {
  discover: `${SYSTEM}\nFind every distinct Item boundary. Return {"schemaVersion":1,"candidates":[{"id":"ascii-id","label":"item name","start":0,"end":1,"quote":"exact source slice"}]}. Offsets are absolute UTF-16 source offsets. Include the complete prose, final lifecycle sentence and any following table of results or Foundry references that belong to the Item. A single untitled Item still has one candidate. Candidates cannot overlap.`,
  extract: `${SYSTEM}\n${CHARGED_SPELL_CONTRACT}\n${ITEM_SPELL_CATALOG_CONTRACT}\n${ITEM_IR_CONTRACT}\n${ITEM_VALUE_CONTRACT}\n${COMPLETE_ITEM_EVIDENCE}\nSet schemaVersion to 1. Copy request.sourceSha256 exactly into source.sha256 and use request.source.length in UTF-16 code units for source.length. dim is the outer edge: 15 bright plus another 15 dim means bright 15/dim 30. No-action extinguishing does not change lighting activation. A spell must be uniquely resolved by canonical dnd5e identifier and English name or become a blocking uncertainty. Use verified catalog activation when the item's grant does not change it. Invisibility from the locked dnd5e ${DND5E_V14_SYSTEM_VERSION} catalog has activation "action".`,
  review: `${SYSTEM}\nAudit source, Item IR, Markdown, deterministic findings and V14 JSON. Return {"schemaVersion":1,"verdict":"accepted|revise|needs_review","findings":[]}. Every finding MUST be an object shaped exactly {"id":"ascii-id","code":"CODE","path":"/json/path","message":"human explanation","blocking":true,"origin":"ai-review","evidence":null,"candidates":null}; never return a finding as a string. Use findings:[] for accepted. Accept light only as a zero-cost action Utility applying a non-transfer token-light Effect with bright 15 and outer dim edge 30 when the source says 15 bright plus another 15 outside dim. Accept a charged spell only as Cast with spellSlot false and exactly one source-matching target: activityUses for its own independent pool or itemUses for shared charges. Review the pool capacity and recovery, stated level, fixed spell challenge save DC, explicit activation override and total scaling cap against the quotes; at-will has zero targets. Do not request automation for faithfully retained special consequences or eligibility conditions outside those native fields. For dnd5e ${DND5E_V14_SYSTEM_VERSION}, the authoritative generated AC +1 representation is a base Effect with transfer true and a system.changes entry with a generator-owned _id and fields {"key":"system.attributes.ac.bonus","type":"add","value":1,"phase":"initial"}; do not demand system.attributes.ac.formula or report this locked representation as incorrect. A source type of 奇物 is explicit and may map to the dnd5e equipment Item type through the deterministic parser; do not report that supported category mapping as TYPE_NOT_EXPLICIT. The V14 generator's quantity, weight, price, SRD metadata, empty fields, IDs, and other schema scaffolding are generator-owned defaults, not extracted source mechanics; do not report NON_SOURCE_MECHANICAL_DEFAULTS for them. A canonical English spell display name may be normalized from a uniquely resolved locked dnd5e ${DND5E_V14_SYSTEM_VERSION} spell even if the source uses a lowercase identifier. When the source says to cast a uniquely resolved spell but does not repeat casting time, the locked spell catalog supplies activation (for Invisibility, action); do not report UNSUPPORTED_ACTIVATION for that derived value.`,
  repair: `${SYSTEM}\n${CHARGED_SPELL_CONTRACT}\n${ITEM_SPELL_CATALOG_CONTRACT}\n${ITEM_IR_CONTRACT}\n${ITEM_VALUE_CONTRACT}\n${COMPLETE_ITEM_EVIDENCE}\nReturn a complete corrected ItemIntakeIR schemaVersion 1, not a patch. Correct every deterministic finding using the exact schema above and only source-supported values. Copy request.ir.source unchanged when it matches request.source. Preserve all supported mechanics; do not erase mechanics to pass. Use the locked dnd5e ${DND5E_V14_SYSTEM_VERSION} spell activation when a uniquely resolved spell's casting time is omitted from source; Invisibility is an action. Retain genuinely unresolved mechanics as blocking uncertainties.`,
} as const;

function withChargedSpellOptions(request: ItemExtractionRequest | ItemRepairRequest) {
  const chargedSpellOptions = sourceChargedSpellOptions(request.candidate);
  return chargedSpellOptions.length ? { ...request, chargedSpellOptions } : request;
}

export class OpenAICompatibleItemIntakeProvider implements ItemIntakeAiProvider {
  readonly providerName = 'openai-compatible-item-intake';
  readonly extractionModel: string;
  readonly reviewModel: string;
  private readonly httpClient: HttpClient;
  private readonly now: () => number;

  constructor(private readonly options: OpenAICompatibleItemIntakeOptions) {
    const requiresApiKey = options.transport?.authScheme !== 'none';
    if ((requiresApiKey && !options.apiKey) || !options.baseUrl || !options.model) throw new MonsterIntakeProviderError('configuration', 'AI Item Intake requires a configured shared Intake provider.');
    this.extractionModel = options.model;
    this.reviewModel = options.reviewModel || options.model;
    this.httpClient = options.httpClient ?? defaultHttpClient;
    this.now = options.now ?? Date.now;
  }

  discover(request: ItemDiscoveryRequest): Promise<ItemDiscoveryResult> { return this.call('discover', this.extractionModel, request) as Promise<ItemDiscoveryResult>; }
  extract(request: ItemExtractionRequest): Promise<ItemIntakeIR> {
    return this.call('extract', this.extractionModel, withChargedSpellOptions(request)) as Promise<ItemIntakeIR>;
  }
  review(request: ItemReviewRequest): Promise<ItemAiReviewResult> { return this.call('review', this.reviewModel, request) as Promise<ItemAiReviewResult>; }
  repair(request: ItemRepairRequest): Promise<ItemIntakeIR> {
    return this.call('repair', this.extractionModel, withChargedSpellOptions(request)) as Promise<ItemIntakeIR>;
  }

  private async call(stage: keyof typeof PROMPTS, model: string, payload: unknown): Promise<unknown> {
    const timeoutMs = stage === 'repair' ? this.options.repairTimeoutMs : this.options.timeoutMs;
    const deadline = this.now() + timeoutMs;
    const maxAttempts = this.options.waitPolicy ? 1 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const started = this.now();
      try {
        const result = await this.callOnce(stage, model, payload, Math.max(1, deadline - this.now()), attempt);
        validateResponse(stage, result);
        this.options.audit?.({ provider: this.providerName, model, promptVersion: ITEM_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt });
        return result;
      } catch (error) {
        const normalized = error instanceof MonsterIntakeProviderError ? error : new MonsterIntakeProviderError('network', 'AI Item Intake request failed.', { retryable: true });
        this.options.audit?.({ provider: this.providerName, model, promptVersion: ITEM_INTAKE_PROMPT_VERSIONS[stage], durationMs: this.now() - started, attempt, errorCode: normalized.code });
        if (!normalized.retryable || attempt === maxAttempts || this.now() >= deadline) throw normalized;
      }
    }
    throw new MonsterIntakeProviderError('network', 'AI Item Intake request failed.');
  }

  private async callOnce(stage: keyof typeof PROMPTS, model: string, payload: unknown, timeoutMs: number, attempt: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = this.options.waitPolicy
      ? undefined
      : setTimeout(() => controller.abort(new DOMException('Configured request deadline exceeded.', 'TimeoutError')), timeoutMs);
    try {
      const configuredStructuredOutput = this.options.transport?.structuredOutput;
      const responseFormat = configuredStructuredOutput?.mode === 'json_schema' && !configuredStructuredOutput.schema
        ? { ...configuredStructuredOutput, name: configuredStructuredOutput.name ?? `item_intake_${stage}_v1`, schema: ITEM_INTAKE_JSON_SCHEMAS[stage] }
        : configuredStructuredOutput ?? (
        this.options.responseFormat === 'json_object'
          ? { mode: 'json_object' as const }
          : {
            mode: 'json_schema' as const,
            name: `item_intake_${stage}_v1`,
            schema: ITEM_INTAKE_JSON_SCHEMAS[stage],
          }
      );
      const result = await requestIntakeProvider({
        ...(this.options.transport ?? {}),
        baseUrl: this.options.baseUrl,
        apiKey: this.options.apiKey,
        model,
        reasoning: this.options.transport?.reasoning ?? this.options.reasoningEffort,
        structuredOutput: responseFormat,
        systemPrompt: `${PROMPTS[stage]}${stage === 'review' && this.options.reviewFocus === 'forge-brief' ? '\nForge self-check with the selected generation model: report only concrete source-backed mechanical mismatches, missing rules, wrong numbers, limits, or effects. Keep each finding short. Do not suggest style edits, speculate about external rules, or restate correct fields. The GM makes the final acceptance decision.' : ''}${attempt > 1 ? '\nRetry: return a complete schema-valid object with exact evidence.' : ''}`,
        userContent: JSON.stringify(payload),
        httpClient: this.httpClient,
        signal: controller.signal,
        waitPolicy: this.options.waitPolicy,
        onActivity: this.options.onActivity,
      });
      return parseStrictJson(result.content);
    } catch (error) {
      if (error instanceof MonsterIntakeProviderError) throw error;
      if (error instanceof IntakeTransportError) {
        throw new MonsterIntakeProviderError(error.code, error.message, {
          retryable: error.retryable,
          status: error.status,
        });
      }
      if (error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))) throw new MonsterIntakeProviderError('timeout', 'AI Item Intake request timed out.', { retryable: true });
      throw new MonsterIntakeProviderError('network', 'AI Item Intake network request failed.', { retryable: true });
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

const defaultHttpClient: HttpClient = (url, init) => fetch(url, init as RequestInit);

function validateResponse(stage: keyof typeof PROMPTS, value: unknown): void {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (!record || record.schemaVersion !== 1) throw new MonsterIntakeProviderError('invalid_response', `${stage} response schemaVersion must be 1.`, { retryable: true });
  if (stage === 'discover' && !Array.isArray(record.candidates)) throw new MonsterIntakeProviderError('invalid_response', 'Item discovery candidates must be an array.');
  if ((stage === 'extract' || stage === 'repair') && (!record.item || !Array.isArray(record.claims) || !Array.isArray(record.coverage) || !Array.isArray(record.uncertainties))) throw new MonsterIntakeProviderError('invalid_response', `${stage} response is not a complete ItemIntakeIR.`, { retryable: true });
  if (stage === 'review') {
    if (!['accepted', 'revise', 'needs_review'].includes(String(record.verdict)) || !Array.isArray(record.findings)) {
      throw new MonsterIntakeProviderError('invalid_response', 'Item review response requires a valid verdict and findings.', { retryable: true });
    }
    const origins = new Set(['schema', 'evidence', 'coverage', 'semantic', 'provider', 'ai-review', 'conflict']);
    for (const entry of record.findings) {
      const finding = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry as Record<string, unknown>
        : undefined;
      if (
        !finding
        || typeof finding.id !== 'string'
        || typeof finding.code !== 'string'
        || typeof finding.path !== 'string'
        || typeof finding.message !== 'string'
        || typeof finding.blocking !== 'boolean'
        || typeof finding.origin !== 'string'
        || !origins.has(finding.origin)
        || (finding.evidence !== undefined && finding.evidence !== null && !Array.isArray(finding.evidence))
        || (finding.candidates !== undefined && finding.candidates !== null && !Array.isArray(finding.candidates))
      ) {
        throw new MonsterIntakeProviderError('invalid_response', 'Item review findings must use the complete structured finding schema.', { retryable: true });
      }
    }
  }
}
