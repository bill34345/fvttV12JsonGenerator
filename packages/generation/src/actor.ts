import { displayName } from '@fvtt-json-generator/models/display-name';
import {isSourceCandidateReview,sourceOperationTargetType,sourceOperationTargetCount,sourceOperationSelfTarget,sourceOperationSelfArea,isNeutralSourceAttack,sourceActorNameMatches} from '@fvtt-json-generator/models/source-operations';
import {generateGmAttackActivities,sourceAttackActivityRange} from './gm-attack-activities';
import {applySourceAttackDamageModes} from './source-attack-modes';
import { ActionParser } from '@fvtt-json-generator/parser/action';
import { isConditionId, projectedConditionStatusId } from '@fvtt-json-generator/contracts/conditions';
import type { ActionData, Damage, StructuredActionData, SourceRuleFact } from '@fvtt-json-generator/models/action';
import { EnglishActionParser } from '@fvtt-json-generator/parser/english-action';
import type { ParserRoute } from '@fvtt-json-generator/parser/types';
import { ActivityGenerator, type ActivityGenerationContext } from './activity';
import { conditionalAttackSaveTrigger, normalizedSourceDamageParts } from './save-outcome';
import type { AttackAbility } from './attack-ability';
import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import { composeSourceTextPresentation, decodeSourceTextPresentation } from '@fvtt-json-generator/models/source-text-presentation';
import {SOURCE_NATIVE_FAILURE_LABELS} from '@fvtt-json-generator/models/source-rule-facts';
import { spellsMapper } from './spellsMapper';
import { i18n } from '@fvtt-json-generator/parser/i18n';
import { EffectProfileApplier, type EffectProfile } from './effectProfileApplier';
import {
  ActorSpellManifestError,
  assertNoOrphanedSpellcastingFeatureLinks,
  assertPortableActorHasNoTargetWorldIdentifiers,
  assertSpellManifestTarget,
  buildActorSpellManifest,
  markSpellcastingFeatureItem,
} from './actor-spell-manifest';
import {
  buildHeavyHitAutomationSpec,
  buildHeavyHitMacroCommand,
} from './heavyHitAutomation';
import {
  extractDamagePartsFromText,
  extractPrimaryDamagePartsFromText,
  extractSavingThrowFromText,
  extractSavingThrowsWithInheritedDcFromText,
  extractSavingThrowsFromText,
  extractAreaRadiusFeet,
  extractNarrativeRangeFeet,
  extractNarrativeRangeFeetFixed,
  extractNarrativePlacementRangeFeet,
  hasHalfDamageOnSave,
  extractThresholdEffects,
  extractOnHitRiders,
  extractOnFailedSaveRiders,
  extractGenericRiderRules,
  normalizeAbility,
  extractLegendaryCostFixed,
  extractUsesPerLongRestFixed,
  extractLegendaryActionCountFromLines,
  extractRequiresConcentration,
  extractTargetCondition,
  extractSemanticDescription,
  extractInlineFeatureLinesFromBiography,
  formatLiteralHtml,
  formatManualRuleHtml,
  formatMixedRuleHtml,
  formatStructuredHtml,
  splitStructuredSegments,
  cleanDescriptionSegment,
  parseLocalizedAttackLine,
  splitBilingualName,
  extractDelimitedSegment,
  createCustomEffect,
  createRandomId,
} from './actor-text';
import {
  generateConditionEffects,
  generateEnhancedConditionEffects,
  extractExplicitlyInflictedStatuses,
  createCustomEffect as createCustomEffectExt,
  createRandomId as createRandomIdExt,
  extractSwallowDamage as extractSwallowDamageExt,
  statusIconPath,
  suppressEncounterStagedInferredEffects,
  enforceCoreConditionLifecycles,
  simpleConditionDuration,
} from './actor-effects';
import { buildBleedingFlag, extractBleedingSpec, hasDelayedBleedingFormula } from './bleeding';
import {
  createDailyUses as createDailyUsesExt,
  resolveItemActivationCost as resolveItemActivationCostExt,
  buildItemRange as buildItemRangeExt,
  mapTriggerType as mapTriggerTypeExt,
  resolveDisplaySection as resolveDisplaySectionExt,
  resolveDisplaySectionFixed as resolveDisplaySectionFixedExt,
  buildItemSectionFlags as buildItemSectionFlagsExt,
  structuredActionToActivityData as structuredActionToActivityDataExt,
  attachSubActivities as attachSubActivitiesExt,
  attachEmbeddedEffects as attachEmbeddedEffectsExt,
  normalizeEmbeddedEffectStatus,
  resolveActivationType as resolveActivationTypeExt,
} from './actor-item-builder';
import {
  hasSwallowLikeText as hasSwallowLikeTextExt,
  isDeathTriggeredSaveTrait as isDeathTriggeredSaveTraitExt,
  isStatusRemovalUtility as isStatusRemovalUtilityExt,
} from './actor-special';
import { extractCompoundRiderMechanics, type ExtractedRider, type HitDiceOutcome } from './mechanicsExtraction';
import { extractSourceDerivedAcEffect } from './acEffectExtraction';
import {
  buildHitDiceOutcomeAutomationSpec,
  buildHitDiceOutcomeMacroCommand,
  type HitDiceOutcomeActivityIds,
} from './hitDiceOutcomeAutomation';
import {
  extractSpellNames as extractSpellNamesExt,
  extractSpellcastingLines as extractSpellcastingLinesExt,
  createSpellcastingDescriptionItem as createSpellcastingDescriptionItemExt,
  appendLegacySpellItems as appendLegacySpellItemsExt,
} from './actor-legacy';
import {
  assertEffectProfileForTarget,
  getFoundryTarget,
  type FvttTargetVersion,
} from './target';
import { ActorLocalizer, type TranslationServiceLike } from './actor-localizer';
import { applyActorTargetMetadata, normalizeTargetUses } from './actor-target-metadata';
import {
  loadOptionalGoldenMaster,
  resolveGenerationResources,
  type GenerationResources,
} from './resources';
import { createStableDocumentId } from './stableId';
import {nativeAreaShape} from '@fvtt-json-generator/models/source-operations';
import { applyActorResourceSemantics } from './actor-resource-semantics';
import { applyActorBehaviorSemantics } from './actor-behavior-semantics';
import type { GenerationIconResolver } from './ports';
import { projectWeaponProperties } from './weapon-properties';
import { createRulePresentationPlan, type ConsumedRuleAction, type RulePresentationPlan } from './rule-presentation';
import type {GenerationDiagnostic} from '@fvtt-json-generator/contracts/diagnostics';

const generationIssues=new WeakMap<object,GenerationDiagnostic[]>();
export function actorGenerationDiagnostics(actor:object):GenerationDiagnostic[]{return generationIssues.get(actor)??[];}
function recordProjectionIssue(actor:any,path:string,value:unknown,error:unknown):void {
  const message=error instanceof Error?error.message:String(error);
  generationIssues.set(actor,[...actorGenerationDiagnostics(actor),{code:'FIELD_PROJECTION_INCOMPLETE',severity:'warning',stage:'semantic',path:'actor',message:path+': '+message}]);
}

export type { TranslationServiceLike } from './actor-localizer';

export interface ActorGeneratorOptions {
  /** Forge displays review findings in its UI, outside the portable document. */
  reviewDelivery?: 'document' | 'external';
  translationService?: TranslationServiceLike | null;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  resources?: GenerationResources;
  iconResolver?: GenerationIconResolver;
  /** Internal Forge v14 capture. No plan is serialized into the Actor. */
  onRulePresentationPlan?: (plan: RulePresentationPlan) => void;
  rulePresentationSource?: string;
  rulePresentationActorNormalizer?: (actor: any) => any;
}

interface GenerateOptions {
  resetDefaults?: boolean;
  spellcastingMode?: 'legacy' | 'description';
  route?: ParserRoute;
}

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  activationCost?: number;
  usesPerLongRest?: number;
  restRecharge?: 'sr' | 'lr';
  requiresConcentration?: boolean;
  targetCondition?: string;
};

const LANGUAGE_CODE_MAP: Record<string, string> = {
  // 中文 → Foundry VTT dnd5e code
  '通用语': 'common',
  '通用': 'common',
  '龙语': 'draconic',
  '精灵语': 'elvish',
  '精灵': 'elvish',
  '矮人语': 'dwarvish',
  '矮人': 'dwarvish',
  '巨人语': 'giant',
  '巨人': 'giant',
  '地精语': 'goblin',
  '地精': 'goblin',
  '兽人语': 'orc',
  '兽人': 'orc',
  '深渊语': 'deep',
  '深渊': 'deep',
  '炼狱语': 'infernal',
  '炼狱': 'infernal',
  '天界语': 'celestial',
  '天界': 'celestial',
  '木族语': 'sylvan',
  '木族': 'sylvan',
  '地下通用语': 'undercommon',
  '水族语': 'aquan',
  '水族': 'aquan',
  '风族语': 'auran',
  '风族': 'auran',
  '火族语': 'ignan',
  '火族': 'ignan',
  '土族语': 'terran',
  '土族': 'terran',
  '狗头人语': 'draconic',
  '地底侏儒语': 'gnomish',
  '半身人语': 'halfling',
  '半身人': 'halfling',
  '恐爪怪语': 'deep',
  '泛语言': 'all',
  '无': '',
  // 英文 → Foundry code (pass-through)
  'common': 'common',
  'abyssal': 'abyssal',
  'aarakocra': 'aarakocra',
  'cant': 'cant',
  'druidic': 'druidic',
  'gith': 'gith',
  'gnoll': 'gnoll',
  'sign': 'sign',
  'gnomish': 'gnomish',
  'halfling': 'halfling',
  'primordial': 'primordial',
  'draconic': 'draconic',
  'elvish': 'elvish',
  'dwarvish': 'dwarvish',
  'giant': 'giant',
  'goblin': 'goblin',
  'orc': 'orc',
  'deep': 'deep',
  'infernal': 'infernal',
  'celestial': 'celestial',
  'sylvan': 'sylvan',
  'undercommon': 'undercommon',
  'aquan': 'aquan',
  'auran': 'auran',
  'ignan': 'ignan',
  'terran': 'terran',
};

const V14_LANGUAGE_ALIASES: Record<string, string> = {
  深渊语: 'abyssal', 深渊: 'abyssal', 深渊魔语: 'abyssal', 深渊魔: 'abyssal',
  深语: 'deep', 侏儒语: 'gnomish', 原初语: 'primordial',
  通用手语: 'sign', 手语: 'sign', 盗贼黑话: 'cant', 德鲁伊语: 'druidic',
  吉斯语: 'gith', 豺狼人语: 'gnoll', 鸟人语: 'aarakocra',
  'deep speech': 'deep', dwarven: 'dwarvish',
};

const SKILL_ABILITIES: Record<string, string> = {
  acr: 'dex',
  ani: 'wis',
  arc: 'int',
  ath: 'str',
  dec: 'cha',
  his: 'int',
  ins: 'wis',
  itm: 'cha',
  inv: 'int',
  med: 'wis',
  nat: 'int',
  prc: 'wis',
  prf: 'cha',
  per: 'cha',
  rel: 'int',
  slt: 'dex',
  ste: 'dex',
  sur: 'wis',
};

const CREATURE_TYPE_VALUE_MAP: Record<string, string> = {
  异怪: 'aberration',
  野兽: 'beast',
  天界生物: 'celestial',
  构装体: 'construct',
  构装生物: 'construct',
  龙: 'dragon',
  元素: 'elemental',
  元素生物: 'elemental',
  精类: 'fey',
  妖精: 'fey',
  邪魔: 'fiend',
  巨人: 'giant',
  类人生物: 'humanoid',
  怪物: 'monstrosity',
  怪兽: 'monstrosity',
  软泥怪: 'ooze',
  泥怪: 'ooze',
  植物: 'plant',
  亡灵: 'undead',
};

export class ActorGenerator {
  private readonly reviewDelivery: 'document' | 'external';
  private actionParser = new ActionParser();
  private englishActionParser = new EnglishActionParser();
  private activityGenerator: ActivityGenerator;
  private goldenMaster: any;
  private translationService?: TranslationServiceLike;
  private fvttVersion: FvttTargetVersion;
  private effectProfile: EffectProfile;
  private route: ParserRoute = 'chinese';
  private effectProfileApplier = new EffectProfileApplier();
  private iconResolver?: GenerationIconResolver;
  private onRulePresentationPlan?: (plan: RulePresentationPlan) => void;
  private rulePresentationSource?: string;
  private rulePresentationActorNormalizer?: (actor: any) => any;
  private consumedRuleActions: ConsumedRuleAction[] = [];
  private biographyRuleFacts: SourceRuleFact[] = [];
  private deferRulePresentation = false;

  constructor(options: ActorGeneratorOptions = {}) {
    this.reviewDelivery = options.reviewDelivery ?? 'document';
    this.translationService = options.translationService ?? undefined;
    this.fvttVersion = options.fvttVersion ?? '12';
    this.activityGenerator = new ActivityGenerator({ fvttVersion: this.fvttVersion });
    this.effectProfile = options.effectProfile ?? 'core';
    this.iconResolver = options.iconResolver;
    this.onRulePresentationPlan = options.onRulePresentationPlan;
    this.rulePresentationSource = options.rulePresentationSource;
    this.rulePresentationActorNormalizer = options.rulePresentationActorNormalizer;
    assertEffectProfileForTarget(this.fvttVersion, this.effectProfile);
    const resources = resolveGenerationResources(options.resources);
    this.goldenMaster = loadOptionalGoldenMaster(resources);
  }

  public async generateForRoute(parsed: ParsedNPC, route: ParserRoute): Promise<any> {
    this.deferRulePresentation = true;
    let actor: any;
    try {
      actor = this.generate(parsed, {
        resetDefaults: route === 'english',
        spellcastingMode: route === 'english' ? 'description' : 'legacy',
        route,
      });
    } finally {
      this.deferRulePresentation = false;
    }
    if (route !== 'english') {
      this.emitRulePresentation(actor);
      return actor;
    }

    try {
      actor = await new ActorLocalizer({
        translationService: this.translationService,
        route,
      }).localize(actor);
    } catch (error) {
      recordProjectionIssue(actor, 'localization', null, error);
    }
    this.emitRulePresentation(actor);
    return actor;
  }

  public generate(parsed: ParsedNPC, options: GenerateOptions = {}): any {
    this.consumedRuleActions = [];
    this.biographyRuleFacts = (parsed.biographyRuleFacts ?? []).filter(fact => parsed.biographyMode !== 'literal' || fact.kind === 'food-retention');
    this.route = options.route ?? 'chinese';
    // Clone Base
    const actor = this.goldenMaster 
      ? JSON.parse(JSON.stringify(this.goldenMaster)) 
      : this.createBaseActor();

    this.resetTokenDefaults(actor);

    this.resetActorDefaults(actor);
    if(parsed.candidateReview){
      if(this.reviewDelivery==='document'){
        actor.flags??={};actor.flags.fvttJsonGenerator??={};
        actor.flags.fvttJsonGenerator.candidateReview=structuredClone(parsed.candidateReview);
      }
    }

    // Patch Core Fields
    // The Actor title is already rendered. Parentheses present in that source
    // title belong to its name; only explicit aliases are joined by renderers.
    actor.name = parsed.name || actor.name;
    if (typeof parsed.img === 'string' && parsed.img.trim()) {
      actor.img = parsed.img.trim();
    }
    if (actor.prototypeToken && typeof actor.prototypeToken === 'object') {
      actor.prototypeToken.name = actor.name;
      if (
        typeof parsed.tokenImg === 'string' &&
        parsed.tokenImg.trim() &&
        actor.prototypeToken.texture &&
        typeof actor.prototypeToken.texture === 'object'
      ) {
        actor.prototypeToken.texture.src = parsed.tokenImg.trim();
      }
    }
    // actor.type is fixed "npc"

    // Patch Abilities
    if (parsed.abilities) {
      for (const [key, val] of Object.entries(parsed.abilities)) {
        if (actor.system.abilities[key]) {
          actor.system.abilities[key].value = val;
        }
      }
    }

    // Patch Attributes
    if (parsed.attributes) {
      if (parsed.attributes.hp) {
        actor.system.attributes.hp.value = parsed.attributes.hp.value;
        actor.system.attributes.hp.max = parsed.attributes.hp.max;
        actor.system.attributes.hp.formula = parsed.attributes.hp.formula || '';
      }
      if (parsed.attributes.ac) {
        actor.system.attributes.ac.flat = parsed.attributes.ac.value;
        actor.system.attributes.ac.calc = parsed.attributes.ac.calc;
      }
      if (parsed.attributes.init !== undefined) {
        const dexScore = typeof parsed.abilities?.dex === 'number' ? parsed.abilities.dex : 10;
        const dexModifier = Math.floor((dexScore - 10) / 2);
        actor.system.attributes.init = { bonus: parsed.attributes.init - dexModifier };
      }
      if (parsed.attributes.movement) {
        actor.system.attributes.movement = {
          walk: parsed.attributes.movement.walk ?? null,
          fly: parsed.attributes.movement.fly ?? null,
          swim: parsed.attributes.movement.swim ?? null,
          climb: parsed.attributes.movement.climb ?? null,
          burrow: parsed.attributes.movement.burrow ?? null,
          hover: parsed.attributes.movement.hover ?? false,
          units: parsed.attributes.movement.units ?? 'ft'
        };
      }
      if (parsed.attributes.legact) {
        this.setResourceCounter(actor.system.resources.legact, parsed.attributes.legact.value, parsed.attributes.legact.max);
      }
      if (parsed.attributes.legres) {
        this.setResourceCounter(actor.system.resources.legres, parsed.attributes.legres.value, parsed.attributes.legres.max);
      }
      if (typeof parsed.attributes.prof === 'number' && Number.isFinite(parsed.attributes.prof)) {
        actor.system.attributes.prof = parsed.attributes.prof;
      }
      if (parsed.attributes.spellcasting) {
        actor.system.attributes.spellcasting = parsed.attributes.spellcasting;
      }
    }

    if (typeof parsed.details.spellLevel === 'number' && Number.isInteger(parsed.details.spellLevel)) {
      actor.system.details.spellLevel = parsed.details.spellLevel;
    }
    if(parsed.sourceLegendaryLedger){
      const ledger=parsed.sourceLegendaryLedger;
      this.setResourceCounter(actor.system.resources.legact,ledger.max,ledger.max);
      const resistance=parsed.attributes?.legres?.max;
      const conflict=resistance!==undefined&&ledger.resistanceMax!==undefined&&resistance!==ledger.resistanceMax;
      const boundedResistance=(resistance??ledger.resistanceMax)===undefined||ledger.resistanceLairMax!==undefined&&!conflict;
      actor.system.resources.lair={...actor.system.resources.lair,value:boundedResistance,inside:false};
      if(ledger.resistanceMax!==undefined&&!conflict)this.setResourceCounter(actor.system.resources.legres,ledger.resistanceMax,ledger.resistanceMax);
      if(!boundedResistance)recordProjectionIssue(actor,'legendary/lair',ledger,'巢穴额外次数由GM按原始记录处理；原生开关未增加未声明的抗性次数。');
      actor.flags.fvttJsonGenerator??={};
      actor.flags.fvttJsonGenerator.sourceLegendaryLedger={version:1,...structuredClone(ledger)};
    }
    if (parsed.spellSlots) {
      for (const [level, value] of Object.entries(parsed.spellSlots)) {
        const slot = actor.system.spells?.[`spell${level}`];
        if (slot && typeof value === 'number') {
          slot.value = value;
          slot.override = null;
        }
      }
    }

    if (this.shouldDeriveLegendaryActions(actor.system.resources.legact) && Array.isArray(parsed.legendary_actions)) {
      const legendaryCount = this.extractLegendaryActionCountFromLines(parsed.legendary_actions);
      if (legendaryCount) {
        this.setResourceCounter(actor.system.resources.legact, legendaryCount, legendaryCount);
      }
    }

    // Patch Details
    if (parsed.details) {
      if (parsed.details.cr !== undefined) actor.system.details.cr = parsed.details.cr;
      if (parsed.details.xp !== undefined) {
        if (!actor.system.details.xp) actor.system.details.xp = {};
        actor.system.details.xp.value = parsed.details.xp;
      }
      if (parsed.details.alignment) actor.system.details.alignment = parsed.details.alignment;
      if (parsed.details.creatureType) {
        if (!actor.system.details.type) actor.system.details.type = {};
        actor.system.details.type.value = CREATURE_TYPE_VALUE_MAP[parsed.details.creatureType] || parsed.details.creatureType;
      }
      if (parsed.details.creatureTypeCustom) {
        if (!actor.system.details.type) actor.system.details.type = {};
        actor.system.details.type.custom = parsed.details.creatureTypeCustom;
      }
      if (parsed.details.creatureTypeSubtype) {
        actor.system.details.type.subtype = parsed.details.creatureTypeSubtype;
      }
      if(parsed.details.swarmSize){
        actor.system.details.type??={};
        actor.system.details.type.swarm=({tiny:'tiny',small:'sm',medium:'med',large:'lg',huge:'huge',gargantuan:'grg'} as const)[parsed.details.swarmSize];
      }
      if (parsed.details.biography) actor.system.details.biography.value = parsed.details.biography;
      
      actor.system.details.habitat = { value: [], custom: "" };
      actor.system.details.treasure = { value: [] };
    }

    // Patch Lair Initiative
    if (parsed.lairInitiative !== undefined) {
      if (!actor.system.resources) actor.system.resources = {};
      if (!actor.system.resources.lair) actor.system.resources.lair = {};
      actor.system.resources.lair.value = true;
      actor.system.resources.lair.initiative = parsed.lairInitiative;
    }

    // Patch Traits
    if (parsed.traits) {
      if (parsed.traits.size) actor.system.traits.size = parsed.traits.size;
      const bypasses = parsed.traits.bypasses || [];
      actor.system.traits.dr = { value: parsed.traits.dr || [], custom: '', bypasses };
      actor.system.traits.di = { value: parsed.traits.di || [], custom: '', bypasses };
      actor.system.traits.ci = { value: parsed.traits.ci || [], custom: '' };
      actor.system.traits.dv = { value: parsed.traits.dv || [], custom: parsed.traits.dvCustom ?? '', bypasses };
      if (parsed.traits.dm) actor.system.traits.dm = parsed.traits.dm;
      actor.system.traits.languages = {
        // schema-derived: dnd5e 5.3.3 prepareLanguages recognizes the special ALL key.
        value: (parsed.traits.languages || []).map((lang: string) => {
          // schema-derived: v14 language labels use case-sensitive system keys; normalize known English aliases only.
          const v14Alias = this.isV14() ? V14_LANGUAGE_ALIASES[lang.toLowerCase()] : undefined;
          const code = v14Alias || LANGUAGE_CODE_MAP[lang] || (this.isV14() ? LANGUAGE_CODE_MAP[lang.toLowerCase()] : undefined) || lang;
          return this.isV14() && /^all$/iu.test(code) ? 'ALL' : code;
        }).filter((lang: string) => lang !== ''),
        custom: parsed.traits.languagesCustom || '',
      };
      
      if (parsed.traits.senses) {
        actor.system.attributes.senses = this.buildSenses(parsed.traits.senses);
      }
    }

    // Patch Skills
    if (parsed.skills) {
      // Map "ste": 1 -> system.skills.ste.value = 1
      for (const [key, val] of Object.entries(parsed.skills)) {
        if (!actor.system.skills[key]) {
          actor.system.skills[key] = {
            value: 0,
            ability: SKILL_ABILITIES[key] || 'int',
            bonuses: { check: "", passive: "" }
          };
        }
        actor.system.skills[key].value = val;
      }
    }

    if (parsed.skillBonuses) {
      for (const [key, bonus] of Object.entries(parsed.skillBonuses)) {
        if (actor.system.skills[key]) {
          actor.system.skills[key].bonuses.check = this.formatSignedBonus(bonus);
        }
      }
    }

    // Patch Saves
    if (parsed.saves) {
      for (const key of parsed.saves) {
        if (actor.system.abilities[key]) {
          actor.system.abilities[key].proficient = 1;
        }
      }
    }

    if (parsed.saveBonuses) {
      for (const [key, bonus] of Object.entries(parsed.saveBonuses)) {
        if (actor.system.abilities[key]) {
          actor.system.abilities[key].bonuses.save = this.formatSignedBonus(bonus);
        }
      }
    }

    if (parsed.skillPassives) {
      for (const [key, targetPassive] of Object.entries(parsed.skillPassives)) {
        if (!actor.system.skills[key] || !Number.isFinite(targetPassive)) {
          continue;
        }

        const expectedPassive = this.computeExpectedPassive(actor, key);
        const delta = Number(targetPassive) - expectedPassive;
        if (delta !== 0) {
          actor.system.skills[key].bonuses.passive = this.formatSignedBonus(delta);
        }
      }
    }

    // Generate Items (Actions)
    const newItems: any[] = [];

    const extracted = parsed.biographyMode === 'literal'
      ? { biography: actor.system?.details?.biography?.value ?? '', features: [] }
      : this.extractInlineFeatureLinesFromBiography(actor.system?.details?.biography?.value);
    actor.system.details.biography.value = parsed.biographyMode === 'literal'
      ? formatLiteralHtml(extracted.biography)
      : this.formatStructuredHtml(extracted.biography);
    if (parsed.biographyPresentation) {
      const presentation = decodeSourceTextPresentation(parsed.biographyPresentation);
      if (parsed.biographyMode !== 'literal' || composeSourceTextPresentation(presentation) !== extracted.biography) {
        recordProjectionIssue(actor,'biographyPresentation',parsed.biographyPresentation,'传记展示记录与当前正文不同；正文保留。');
      }
      actor.flags ??= {};
      actor.flags.fvttJsonGenerator ??= {};
      actor.flags.fvttJsonGenerator.biographyPresentation = presentation;
    }
    this.appendActionItems(newItems, extracted.features, 'passive');

    const activityContext = this.createActivityGenerationContext(parsed);

    if (parsed.structuredActions) {
      this.appendStructuredActionItems(newItems, parsed.structuredActions, activityContext);
    } else {
      this.appendActionItems(newItems, parsed.actions, 'action', activityContext);
      this.appendActionItems(newItems, parsed.bonus_actions, 'bonus', activityContext);
      this.appendActionItems(newItems, parsed.reactions, 'reaction', activityContext);
      this.appendActionItems(newItems, parsed.legendary_actions, 'legendary', activityContext);
      this.appendActionItems(newItems, parsed.lair_actions, 'lair', activityContext);
    }

    // Regional Effects
    if (parsed.regional_effects) {
      for (const effect of parsed.regional_effects) {
        let name = 'Regional Effect';
        let desc = '';
        if (typeof effect === 'string') {
           const match = effect.match(/^(.+?):(.+)$/);
           if (match?.[1] && match[2]) {
             name = match[1].trim();
             desc = match[2].trim();
           } else {
             desc = effect;
           }
        } else if (typeof effect === 'object' && effect !== null) {
          const key = Object.keys(effect)[0];
          const val = Object.values(effect)[0] as string;
          if (key) {
            name = key;
            desc = val;
          }
        }
        
        const section = this.route === 'chinese' ? '巢穴效应' : 'Regional Effects';
        newItems.push({
          name: name,
          type: 'feat',
          img: 'icons/svg/mystery-man.svg',
          system: {
            description: { value: `<p>${desc}</p>`, chat: '' },
            type: { value: 'monster', subtype: 'regional' },
            source: { custom: 'Imported' },
            activation: { type: '', cost: null },
            activities: {}
          },
          flags: {
            "tidy5e-sheet": { section: section, actionSection: section }
          }
        });
      }
    }

    // Spellcasting
    if (parsed.spellcasting && !parsed.spellManifest) {
      if (options.spellcastingMode === 'description') {
        const lines = this.extractSpellcastingLines(parsed.spellcasting);
        if (lines.length > 0) {
          newItems.push(this.createSpellcastingDescriptionItem(lines));
        }
      } else {
        this.appendLegacySpellItems(newItems, parsed.spellcasting);
      }
    }

    actor.items = newItems;
    try{applyActorResourceSemantics(actor, parsed.resourceSemantics, this.fvttVersion);}catch(error){recordProjectionIssue(actor,'resources',parsed.resourceSemantics,error);}
    try{applyActorBehaviorSemantics(actor, parsed.behaviorSemantics, this.fvttVersion);}catch(error){recordProjectionIssue(actor,'behavior',parsed.behaviorSemantics,error);}
    suppressEncounterStagedInferredEffects(actor);
    if (parsed.spellManifest) {
      try{buildActorSpellManifest(actor, parsed.spellManifest, this.fvttVersion);}catch(error){recordProjectionIssue(actor,'spellManifest',parsed.spellManifest,error);}
    } else {
      try{assertNoOrphanedSpellcastingFeatureLinks(actor);}catch(error){recordProjectionIssue(actor,'spellManifest',parsed.spellManifest,error);}
    }
    this.applyTemporaryOverrideTargetEffects(actor);
    if (this.isV14() && this.effectProfile === 'core') enforceCoreConditionLifecycles(actor, new Map(this.consumedRuleActions.map(entry => [entry.itemIndex, entry.sourceStructured?.describe ?? entry.action.desc ?? ''])));
    this.effectProfileApplier.apply(actor, this.effectProfile);

    this.applyTokenSize(actor);
    applyActorTargetMetadata(actor, this.fvttVersion);
    try{this.iconResolver?.resolveActor(actor);}catch(error){recordProjectionIssue(actor,'icons',null,error);}
    try{assertPortableActorHasNoTargetWorldIdentifiers(actor);}catch(error){recordProjectionIssue(actor,'spellManifest',parsed.spellManifest,error);}

    if (!this.deferRulePresentation) this.emitRulePresentation(actor);
    return actor;
  }

  private emitRulePresentation(actor: any): void {
    if (this.fvttVersion !== '14' || !this.onRulePresentationPlan || !this.rulePresentationSource) return;
    try{this.onRulePresentationPlan(createRulePresentationPlan({
      sourceActor: actor,
      sourceIdentity: this.rulePresentationSource,
      consumedActions: this.consumedRuleActions,
      biographyFacts: this.biographyRuleFacts,
      actorNormalizer: this.rulePresentationActorNormalizer,
    }));}catch(error){recordProjectionIssue(actor,'rulePresentation',null,error);}
  }

  private applyTokenSize(actor: any): void {
    if (!actor.prototypeToken || typeof actor.prototypeToken !== 'object') return;

    const size = actor.system?.traits?.size || 'med';
    let dim = 1;
    if (size === 'tiny') dim = 0.5;
    else if (size === 'sm' || size === 'med') dim = 1;
    else if (size === 'lg') dim = 2;
    else if (size === 'huge') dim = 3;
    else if (size === 'grg') dim = 4;

    actor.prototypeToken.width = dim;
    actor.prototypeToken.height = dim;
    this.applyTokenSenses(actor);
  }

  private applyTokenSenses(actor: any): void {
    const token = actor.prototypeToken;
    const senses = actor.system?.attributes?.senses;
    if (!token || typeof token !== 'object' || !senses || typeof senses !== 'object') {
      return;
    }

    const numericSenses = {
      darkvision: Number(senses.darkvision ?? 0),
      blindsight: Number(senses.blindsight ?? 0),
      tremorsense: Number(senses.tremorsense ?? 0),
      truesight: Number(senses.truesight ?? 0),
    };

    const detectionModes: Array<{ id: string; enabled: boolean; range: number }> = [];
    if (numericSenses.blindsight > 0) {
      detectionModes.push({ id: 'blindsight', enabled: true, range: numericSenses.blindsight });
    }
    if (numericSenses.tremorsense > 0) {
      detectionModes.push({ id: 'tremorsense', enabled: true, range: numericSenses.tremorsense });
    }

    token.detectionModes = detectionModes;

    const sightRange = Math.max(
      numericSenses.darkvision,
      numericSenses.blindsight,
      numericSenses.truesight,
      0,
    );
    if (token.sight && typeof token.sight === 'object') {
      token.sight.enabled = sightRange > 0;
      token.sight.range = sightRange;
    }
  }

  private applyTemporaryOverrideTargetEffects(actor: any): void {
    const items = Array.isArray(actor?.items) ? actor.items : [];
    for (const item of items) {
      const overrides = this.asRiderArray(item?.flags?.fvttJsonGenerator?.rules?.temporaryOverrides);
      if (overrides.length === 0) {
        continue;
      }

      for (const override of overrides) {
        const targetAbility = typeof override.targetAbility === 'string' ? override.targetAbility : '';
        if (!targetAbility) {
          continue;
        }

        const targetItem = this.findItemByAbilityLabel(items, targetAbility);
        if (!targetItem || !Array.isArray(targetItem.effects) || targetItem.effects.length === 0) {
          continue;
        }

        const clonedEffects = targetItem.effects.map((effect: any) => this.cloneTemporaryOverrideEffect(effect, targetAbility));
        item.effects = [...(item.effects ?? []), ...clonedEffects];
        this.attachTemporaryOverrideEffectsToSaveActivities(item, clonedEffects);
      }
    }
  }

  private findItemByAbilityLabel(items: any[], label: string): any | undefined {
    const normalizedLabel = this.normalizeRuleLookupText(label);
    if (!normalizedLabel) {
      return undefined;
    }

    return items.find((item) => this.normalizeRuleLookupText(String(item?.name ?? '')).includes(normalizedLabel));
  }

  private normalizeRuleLookupText(value: string): string {
    return value
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[\s·:：,，。._-]+/g, '');
  }

  private cloneTemporaryOverrideEffect(effect: any, targetAbility: string): any {
    const clone = JSON.parse(JSON.stringify(effect));
    clone._id = this.createRandomId();
    clone.flags = {
      ...(clone.flags ?? {}),
      fvttJsonGenerator: {
        ...(clone.flags?.fvttJsonGenerator ?? {}),
        temporaryOverrideSource: {
          targetAbility,
        },
      },
    };
    return clone;
  }

  private attachTemporaryOverrideEffectsToSaveActivities(item: any, effects: any[]): void {
    const refs = effects.map((effect) => ({ _id: effect._id }));
    for (const activity of Object.values(item?.system?.activities ?? {}) as any[]) {
      if (activity?.type !== 'save') {
        continue;
      }
      if (!activity.flags?.fvttJsonGenerator?.temporaryOverride) {
        continue;
      }
      activity.effects = [...(activity.effects ?? []), ...refs];
    }
  }

  private extractSpellNames(spellcasting: ParsedNPC['spellcasting']): string[] {
    return extractSpellNamesExt(spellcasting);
  }

  private resetActorDefaults(actor: any): void {
    this.resetTokenDefaults(actor);

    // Clean template pollution from golden-master.json
    // flags: remove all template flags (babele, mcdm-flee-mortals, exportSource etc.)
    actor.flags = {};
    // _stats: only keep core/system version info, remove user-specific fields
    actor._stats = {
      coreVersion: this.targetStats().coreVersion,
      systemId: this.targetStats().systemId,
      systemVersion: this.targetStats().systemVersion,
      createdTime: Date.now(),
      modifiedTime: Date.now(),
    };
    // folder: clear template folder reference
    actor.folder = null;
    // effects: clear template effects
    if (Array.isArray(actor.effects)) actor.effects.length = 0;

    const details = actor.system?.details;
    if (details) {
      if (details.biography && typeof details.biography === 'object') {
        details.biography.value = '';
      }
      details.alignment = '';
      if (details.type && typeof details.type === 'object') {
        details.type.value = '';
        details.type.custom = '';
        details.type.swarm = '';
      }
      details.cr = 0;
      if (details.xp && typeof details.xp === 'object') {
        details.xp.value = 0;
      }
      details.habitat = { value: [], custom: '' };
      details.treasure = { value: [] };
    }

    const resources = actor.system?.resources;
    if (resources) {
      if (resources.legact && typeof resources.legact === 'object') {
        this.setResourceCounter(resources.legact, 0, 0);
      }
      if (resources.legres && typeof resources.legres === 'object') {
        this.setResourceCounter(resources.legres, 0, 0);
      }
      if (resources.lair && typeof resources.lair === 'object') {
        resources.lair.value = false;
        resources.lair.initiative = null;
        resources.lair.inside = false;
      }
    }

    if (actor.system?.attributes) {
      if (actor.system.attributes.init && typeof actor.system.attributes.init === 'object') {
        actor.system.attributes.init.bonus = '';
      }
      actor.system.attributes.movement = {
        walk: null, fly: null, swim: null, climb: null, burrow: null, hover: false
      };
      actor.system.attributes.senses = this.emptySenses();
    }

    const traits = actor.system?.traits;
    if (traits) {
      traits.size = 'med';
      traits.di = { value: [], custom: '', bypasses: [] };
      traits.dr = { value: [], custom: '', bypasses: [] };
      traits.dv = { value: [], custom: '', bypasses: [] };
      traits.dm = { amount: {}, bypasses: [] };
      traits.ci = { value: [], custom: '' };
      traits.languages = { value: [] };
    }

    const abilities = actor.system?.abilities;
    if (abilities && typeof abilities === 'object') {
      for (const ability of Object.values(abilities) as any[]) {
        if (ability && typeof ability === 'object') {
          ability.value = 10;
          ability.proficient = 0;
        }
      }
    }

    const skills = actor.system?.skills;
    if (skills && typeof skills === 'object') {
      for (const skill of Object.values(skills) as any[]) {
        if (skill && typeof skill === 'object') {
          skill.value = 0;
        }
      }
    }

    const spells = actor.system?.spells;
    if (spells && typeof spells === 'object') {
      for (const spellLvl of Object.values(spells) as any[]) {
        if (spellLvl && typeof spellLvl === 'object') {
          spellLvl.value = 0;
          spellLvl.override = null;
        }
      }
    }
    if (actor.system?.attributes) {
      actor.system.attributes.spellcasting = '';
      if (actor.system.details) {
        actor.system.details.spellLevel = 0;
      }
    }
  }

  private resetTokenDefaults(actor: any): void {
    actor.img = '';

    if (actor.prototypeToken && typeof actor.prototypeToken === 'object') {
      actor.prototypeToken.name = '';
      actor.prototypeToken.width = 1;
      actor.prototypeToken.height = 1;

      if (actor.prototypeToken.texture && typeof actor.prototypeToken.texture === 'object') {
        actor.prototypeToken.texture.src = '';
        actor.prototypeToken.texture.scaleX = 1;
        actor.prototypeToken.texture.scaleY = 1;
      }
    }
  }

  private appendActionItems(
    items: any[],
    source: unknown,
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'passive',
    activityContext: ActivityGenerationContext = {},
  ): void {
    for (const line of this.collectActionLines(source)) {
      if (activationType === 'legendary' && this.isLegendaryActionIntro(line)) {
        continue;
      }
      const actionData = this.parseActionLine(line);
      if (!actionData) {
        continue;
      }

      const isPassive = activationType === 'passive';
      const activities = this.activityGenerator.generate(actionData, activityContext);
      
      const item = this.createItemFromAction(actionData, activities, isPassive ? '' : activationType);
      this.consumedRuleActions.push({
        logicalPath: 'legacy/' + activationType + '/' + items.length,
        itemIndex: items.length, action: actionData,
      });
      items.push(item);
    }
  }

  private appendStructuredActionItems(
    items: any[],
    structured: ParsedNPC['structuredActions'],
    activityContext: ActivityGenerationContext,
  ): void {
    if (!structured) return;

    const sectionMap: Array<{
      key: keyof NonNullable<ParsedNPC['structuredActions']>;
      activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'passive';
      sectionOverride?: string;
    }> = [
      { key: '特性', activationType: 'passive' },
      { key: '动作', activationType: 'action' },
      { key: '附赠动作', activationType: 'bonus' },
      { key: '反应', activationType: 'reaction' },
      { key: '传奇动作', activationType: 'legendary' },
      { key: '神话动作', activationType: 'legendary', sectionOverride: '神话动作' },
    ];

    for (const { key, activationType, sectionOverride } of sectionMap) {
      const actions = structured[key];
      if (!actions || !Array.isArray(actions)) continue;

      for (const [index, action] of actions.entries()) {
        const itemStart=items.length;
        this.appendSingleStructuredAction(
          items,
          action,
          activationType,
          activityContext,
          `structuredActions/${key}/${index}/${action.name}`,
          sectionOverride,
        );
        if(action.candidateReview){
          for(const item of this.reviewDelivery==='document'?items.slice(itemStart):[]){
            item.flags??={};item.flags.fvttJsonGenerator??={};
            item.flags.fvttJsonGenerator.candidateReview=structuredClone(action.candidateReview);
            item.system.description.value='<p><strong>待审候选：规则检查未通过，请对照完整原文核对后决定使用。</strong></p>'+item.system.description.value;
          }
          const item=items[itemStart];
          if(action.sourceOperations&&action.candidateCounters?.length===1){
            const counter=action.candidateCounters[0]!;item.system.uses={spent:0,max:String(counter.max),recovery:[]};
            for(const activity of Object.values(item.system.activities) as any[]){
              if(activity.flags?.fvttJsonGenerator?.sourceOperation?.relationship!=='follow-up')activity.consumption={targets:[{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}],spellSlot:false,scaling:{allowed:false,max:''}};
            }
            item.system.description.value+='<p>'+formatLiteralHtml('次数恢复由GM按原文手动处理：'+(counter.recovery??'原回复未给恢复方式'))+'</p>';
          }else for(const[index,counter]of(action.candidateCounters??[]).entries()){
            const activities=this.activityGenerator.generate({name:counter.name+'（GM次数，手动恢复）',type:'utility',desc:'',logicalPath:`candidate-counter/structuredActions/${key}/${action.name}/${index}`},{});
            for(const activity of Object.values(activities) as any[]){
              activity.name=counter.name+'（GM次数，手动恢复）';activity.activation={type:'',value:null,override:false,condition:''};
              activity.uses={spent:0,max:String(counter.max),recovery:[]};
              activity.consumption={targets:[{type:'activityUses',value:'1'}],spellSlot:false,scaling:{allowed:false,max:''}};
              activity.effects=[];activity.description={chatFlavor:formatLiteralHtml('此按钮只记录GM使用次数，不施法或结算特殊规则。恢复由GM依完整原文手动处理：'+(counter.recovery??'原回复未给恢复方式')+'\n'+(action.describe??''))};
              item.system.activities[activity._id]=activity;
            }
          }
        }
        if(action.sourceFeatureId){
          const item=items[itemStart];item.flags??={};item.flags.fvttJsonGenerator??={};item.flags.fvttJsonGenerator.sourceFeatureId=action.sourceFeatureId;
        }
      }
    }
  }

  private appendSingleStructuredAction(
    items: any[],
    action: StructuredActionData,
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'passive',
    activityContext: ActivityGenerationContext,
    logicalPath: string,
    sectionOverride?: string,
  ): void {
    if(action.executionMode==='gm-manual'&&(action.attackType||action.DC!==undefined||action.damage?.length||action.healing))action={...action,executionMode:'native-with-gm',nativeRuleText:action.describe??'',manualRemainder:action.describe??''};
    if (action.literalMechanics && !action.executionMode) {
      // explicit-exception: canonical Intake owns its typed mechanics. Hide
      // prose (including nested effect prose) from every legacy fallback.
      const embedded = action.embeddedEffects ?? [];
      const statusOf = (effect: typeof embedded[number]) => normalizeEmbeddedEffectStatus(effect.type) ?? effect.type;
      const manualStatuses = new Set(embedded.filter(effect => effect.escapeDc !== undefined || effect.staged === true
        || Boolean(effect.condition?.trim()) || Boolean(effect.duration?.trim() && !simpleConditionDuration(effect.duration))).map(statusOf));
      // If two explicit branches share a status, a conditional branch cannot
      // be bypassed by a second unconditional Effect of the same status.
      const manualEffects = embedded.filter(effect => manualStatuses.has(statusOf(effect)));
      const nativeEffects = embedded.filter(effect => !manualStatuses.has(statusOf(effect)));
      const safe: StructuredActionData = {
        ...action, literalMechanics: undefined, name: '', englishName: undefined,
        describe: '', nativeRuleText: undefined, manualRemainder: undefined, sourceRuleFacts: [],
        embeddedEffects: nativeEffects.map(effect => ({ ...effect, describe: '' })),
        failEffects: action.failEffects?.map(effect => ({ ...effect, describe: undefined })),
        successEffects: action.successEffects?.map(effect => ({ ...effect, describe: undefined })),
        subActions: action.subActions?.map(sub => ({ ...sub, describe: '' })),
      };
      this.appendSingleStructuredAction(items, safe, activationType, activityContext, logicalPath, sectionOverride);
      const item = items.at(-1)!;
      item.name = displayName(action.name, action.englishName);
      item.system.description = { value: formatLiteralHtml(action.describe ?? ''), chat: '' };
      for (const activity of Object.values(item.system.activities ?? {}) as any[]) {
        if (!activity.name) activity.name = item.name;
        activity.description = { chatFlavor: formatLiteralHtml(action.describe ?? '') };
      }
      for (const [index, effect] of nativeEffects.entries()) {
        if (item.effects[index]) item.effects[index].description = effect.describe;
      }
      const conditionalParts = (action.sourceDamageParts ?? []).flatMap((part, index) =>
        (part.relationship === 'base' || part.relationship === 'additional') && !part.condition ? [] : [{ part, index }]);
      const base = Object.values(item.system.activities ?? {})[0] as any;
      if (conditionalParts.length && action.type === 'damage' && !action.damage?.length && !action.uses && !action.recharge && action.perLongRest === undefined) item.system.activities = {};
      for (const { part, index } of conditionalParts) {
        // The explicit relationship chooses a separate GM roll. It never
        // changes the primary roll, spends its resource again or reads prose.
        const generated = this.activityGenerator.generate({ name: '', type: 'damage', desc: '', logicalPath: `${logicalPath}/literal-damage/${index}`,
          damage: [{ formula: part.formula, type: part.type, ...(part.types ? { types: part.types } : {}) }] }, {});
        const helper = Object.values(generated)[0] as any;
        helper.name = `${part.relationship === 'replacement' ? 'GM替代伤害' : 'GM条件伤害'} ${index + 1}`;
        helper.activation = { type: 'special', value: null, override: true, condition: part.condition ?? '' };
        helper.consumption = { targets: [], spellSlot: false, scaling: { allowed: false, max: '' } };
        helper.effects = [];
        if (base?.range) helper.range = structuredClone(base.range);
        if (base?.target) helper.target = structuredClone(base.target);
        helper.description = { chatFlavor: formatLiteralHtml([part.condition, action.describe].filter(Boolean).join('\n\n')) };
        helper.flags = { fvttJsonGenerator: { literalDamage: { version: 1, partIndex: index, part: structuredClone(part) } } };
        item.system.activities[helper._id] = helper;
      }
      item.flags ??= {}; item.flags.fvttJsonGenerator ??= {};
      item.flags.fvttJsonGenerator.literalMechanics = { version: 1, description: action.describe ?? '', logicalPath,
        ...(action.sourceDamageParts ? { sourceDamageParts: structuredClone(action.sourceDamageParts) } : {}) };
      if (manualEffects.length) {
        const labels = [...manualStatuses].map(status => Object.hasOwn(SOURCE_NATIVE_FAILURE_LABELS,status)
          ? `${SOURCE_NATIVE_FAILURE_LABELS[status as keyof typeof SOURCE_NATIVE_FAILURE_LABELS]} ${status}` : status);
        const note = formatLiteralHtml(`GM：${labels.join('、')}的适用条件、期限、逃脱与解除依完整原文手动处理；这些状态不会由活动自动施加。`);
        item.flags.fvttJsonGenerator.conditionLifecycle = { version: 1, mode: 'gm', sourceText: action.describe ?? '',
          statuses: [...manualStatuses], conditions: manualEffects.map(effect => ({ status: statusOf(effect),
            ...(effect.condition !== undefined ? { condition: effect.condition } : {}),
            ...(effect.escapeDc !== undefined ? { escapeDc: effect.escapeDc } : {}),
            ...(effect.duration !== undefined ? { duration: effect.duration } : {}),
            ...(effect.staged !== undefined ? { staged: effect.staged } : {}) })) };
        item.system.description.value += note;
        for (const activity of Object.values(item.system.activities ?? {}) as any[]) activity.description.chatFlavor += note;
      }
      // Retain the sanitized consumed record: later lifecycle and presentation
      // passes must not turn the restored display prose back into mechanics.
      return;
    }
    if(action.sourceOperations){
      const originals=structuredClone(action.sourceOperations),operationIds=new Set(originals.map(op=>op.id));
      const uniqueOperationId=(base:string)=>{let id=base,index=1;while(operationIds.has(id))id=base+'-'+(++index);operationIds.add(id);return id;};
      const operations=originals.flatMap(op=>{
        if(op.type!=='attack'&&op.type!=='save')return[op];
        const parts=op.damage??[],deferred=parts.flatMap((part,index)=>part.relationship==='conditional'||part.relationship==='replacement'||part.condition?[{part,index}]:[]);
        if(!deferred.length)return[op];
        const ordinary=parts.filter(part=>!deferred.some(entry=>entry.part===part));
        return[{...op,damage:ordinary.length?ordinary:undefined},...deferred.map(({part,index})=>({
          id:uniqueOperationId(op.id+'-damage-'+(index+1)),name:op.name+'（GM'+(part.relationship==='replacement'?'替代':'条件')+'伤害 '+(index+1)+'）',
          type:'damage' as const,relationship:part.relationship==='replacement'?'alternative' as const:'follow-up' as const,
          condition:part.condition??op.condition??'GM依完整原文选择此伤害',sourceText:op.sourceText,damage:[part],
          proof:{damage:typeof op.proof.damage?.[index]==='string'?[op.proof.damage[index]!]:[]},
          ...(op.range!==undefined?{range:op.range}:op.attack?.range!==undefined?{range:op.attack.range}:op.attack?.reach!==undefined?{range:op.attack.reach}:{}),
          ...(op.targetSpecial?{targetSpecial:op.targetSpecial}:{}),...(op.aoe?{aoe:op.aoe}:{}),
        }))];
      });
      const source=action.describe??'';
      const extra=(type:'attack'|'save'|'damage'|'heal',fields:Record<string,unknown>)=>operations.push({id:uniqueOperationId('flat-'+type),name:action.name,type,relationship:operations.length?'follow-up':'primary',sourceText:source,proof:{},...fields} as typeof operations[number]);
      if(action.attackType&&action.toHit!==undefined&&!operations.some(op=>op.attack&&op.attack.type===action.attackType&&op.attack.toHit===action.toHit))extra('attack',{attack:{type:action.attackType,toHit:action.toHit},damage:action.damage??[]});
      if(action.DC!==undefined&&action.ability&&!operations.some(op=>op.save&&op.save.dc===action.DC&&op.save.abilities.some(ability=>ability===action.ability)))extra('save',{save:{dc:action.DC,abilities:[action.ability],choice:'single',outcome:action.saveOutcome??'none'}});
      if(action.healing&&!operations.some(op=>JSON.stringify(op.healing)===JSON.stringify(action.healing)))extra('heal',{healing:{...action.healing,target:action.healing.target??{type:'creature',count:1,special:''}}});
      const additional=(action.damage??[]).filter(part=>!operations.some(op=>op.damage?.some(existing=>existing.formula===part.formula&&existing.type===part.type)));
      if(additional.length)extra('damage',{damage:additional.map(part=>({...part,relationship:'additional'}))});
      // Build the existing resource/section carrier without feeding any rule
      // prose into legacy inference. Each child is an explicit clickable roll.
      const safe:StructuredActionData={...action,sourceOperations:undefined,sourceContext:undefined,executionMode:undefined,nativeRuleText:undefined,manualRemainder:undefined,describe:'',sourceRuleFacts:[]};
      this.appendSingleStructuredAction(items,safe,activationType,activityContext,logicalPath,sectionOverride);
      const item=items.at(-1)!,base=Object.values(item.system.activities)[0] as any;
      item.system.activities={};item.effects=[];
      const operationKinds=[...new Set(operations.flatMap(op=>[op.type,...(op.damage?.length?['damage']:[])]))];
      if(action.uses||action.recharge)operationKinds.push('resource');
      const sourceText=action.describe??'',contextText=(action.sourceContext??[]).join('\n');
      for(const op of operations){
        if(op.damageAdjustment&&!sourceActorNameMatches(op.damageAdjustment.actor,activityContext.sourceActorName)){item.system.description.value+='\nGM伤害调整：'+JSON.stringify(op.damageAdjustment);delete op.damageAdjustment;}
        const neutral=isNeutralSourceAttack(op),recipientType=sourceOperationTargetType(sourceText,op)??(neutral?'any':'creature');
        const damage=(op.damage??[]).map(part=>({formula:part.formula,type:part.type,...(part.types?{types:part.types}:{})}));
        const range=op.attack?.range!==undefined?`${op.attack.range}${op.attack.longRange?'/'+op.attack.longRange:''} ft.`:op.attack?.reach!==undefined?`reach ${op.attack.reach} ft.`:'';
        const data:ActionData={name:op.name,type:op.type,logicalPath:logicalPath+'/source-operation/'+op.id,desc:'',damage,
          ...(op.healing?{healing:op.healing}:{}),
          ...(op.attack&&!neutral?{attack:{...op.attack,type:op.attack.type as NonNullable<ActionData['attack']>['type'],range,reach:op.attack.reach===undefined?undefined:String(op.attack.reach),damage}}:{}),
          ...(op.save?{save:{dc:op.save.dc,ability:op.save.abilities[0]!,dcSourceKind:'literal',outcome:op.save.outcome}}:{})};
        // Literal printed values must not be reinterpreted as ability-derived
        // bonuses. They have already passed their own source proof.
        const activities=neutral?generateGmAttackActivities(op,logicalPath+'/source-operation/'+op.id,part=>this.activityGenerator.formatDamage(part)):this.activityGenerator.generate(data,{});
        for(const activity of Object.values(activities) as any[]){
          const role=neutral?activity.flags.fvttJsonGenerator.sourceOperation.role:undefined;
          const attackMode=neutral?activity.flags.fvttJsonGenerator.sourceOperation.attackMode:undefined;
          const followUp=op.relationship==='follow-up'||role==='damage';
          const modeLabel=attackMode==='melee'?'近战':attackMode==='ranged'?`远程 ${op.attack!.range}${op.attack!.longRange!==undefined?'/'+op.attack!.longRange:''} 尺`:'';
          activity.name=op.name+(neutral?(role==='damage'?'（命中后伤害）':`（${modeLabel?modeLabel+' · ':''}GM攻击检定）`):'');
          const condition=[contextText,op.condition,sourceText].filter(Boolean).join('\n');
          activity.activation=followUp?{type:'special',value:null,override:true,condition}:{...base.activation,condition};
          activity.consumption=followUp?{targets:[],spellSlot:false,scaling:{allowed:false,max:''}}:structuredClone(base.consumption??{targets:[],spellSlot:false,scaling:{allowed:false,max:''}});
          if((action.uses||action.recharge)&&!followUp)activity.consumption={targets:[{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}],spellSlot:false,scaling:{allowed:false,max:''}};
          activity.effects=[];
          if(op.proof.upgrade)activity.target={override:true,prompt:true,template:{type:'',size:'',units:'ft'},affects:{count:'1',type:'creature',choice:false,special:op.proof.damage![0]}};
          for(const status of op.failureStatuses??[]){
            const id=createStableDocumentId({kind:'effect',path:logicalPath+'/source-operation/'+op.id+'/'+status});
            item.effects.push({_id:id,name:SOURCE_NATIVE_FAILURE_LABELS[status],type:'base',img:`systems/dnd5e/icons/svg/statuses/${status}.svg`,transfer:false,disabled:false,statuses:[status],changes:[],duration:{},description:op.sourceText});
            activity.effects.push({_id:id,onSave:false});
          }
          if(op.save)activity.save.ability=[...op.save.abilities];
          // Schema-derived: dnd5e 5.3.3 defines includeBase only on Attack.
          // Save/Damage roll their explicit parts; unsupported fields are
          // discarded by the native DataModel and cannot be emitted here.
          if(activity.damage&&op.type==='attack'&&!neutral)activity.damage.includeBase=false;
          if(op.range!==undefined)activity.range={override:true,value:op.range,units:'ft',special:''};
          if(op.aoe){
            // schema-derived: 5.3.3 names the square template square; explicit
            // line width/cylinder height must override its default 5 feet.
            const shape=nativeAreaShape(op.aoe.shape,op.aoe.radius,op.proof.aoe??'');
            activity.target={override:true,prompt:true,template:{type:shape==='rectangle'?'square':shape,size:String(op.aoe.radius),...(op.aoe.width!==undefined?{width:String(op.aoe.width)}:{}),...(op.aoe.height!==undefined?{height:String(op.aoe.height)}:{}),units:'ft'},affects:{count:'',type:recipientType,choice:false,special:op.targetSpecial??''}};
          }
          // RangeField defaults to Self in 5.3.3, even for Save/Damage.
          // Only a source-proven recipient or area origin may retain Self;
          // an unknown or external location stays an explicit GM range.
          if(!op.attack&&op.range===undefined){
            const self=sourceOperationSelfTarget(sourceText,op)||sourceOperationSelfArea(sourceText,op,activityContext.sourceActorName);
            activity.range={override:true,units:self?'self':'spec',special:self?'':'GM 按原文目标或效应位置确定范围。'};
          }
          if(op.healing){
            // An explicit AI distance also applies to Heal/temporary HP. Only
            // an omitted distance uses the typed self/manual default.
            if(op.range===undefined)activity.range={override:true,units:op.healing.target.type==='self'?'self':'spec',special:op.healing.target.type==='self'?'':'GM 按原文目标或效应位置确定范围。'};
            activity.target.override=true;
          }
          if(neutral)activity.target={override:true,prompt:true,template:{type:'',units:'ft'},affects:{count:'',type:recipientType,choice:false,special:op.targetSpecial??''}};
          if(op.targetSpecial){activity.target??={override:true,prompt:true,template:{type:'',units:'ft'},affects:{count:'',type:recipientType,choice:false,special:''}};activity.target.affects.type=recipientType;activity.target.affects.special=op.targetSpecial;activity.target.override=true;}
          if(!op.healing&&!op.proof.upgrade&&activity.target?.affects)activity.target.affects.count=sourceOperationTargetCount(sourceText,op)??'';
          if(op.attack){
            if(!neutral)activity.attack.type.value=op.attack.type.startsWith('r')?'ranged':'melee';
            activity.range=sourceAttackActivityRange(op.attack,attackMode);
          }
          const boundary=neutral?'GM辅助攻击：分类未注明；通用检定不使用武器/法术攻击钩子。优势、劣势、命中与暴击由GM按原文处理。':'';
          const adjustment=op.damageAdjustment?'来源角色处于Bloodied时，本次造成的伤害减半。只掷骰一次，由GM结算；不自动改变生命值。':'';
          activity.description={chatFlavor:formatMixedRuleHtml([boundary,adjustment,contextText,sourceText].filter(Boolean).join('\n\n'),false,operationKinds)};
          activity.flags={fvttJsonGenerator:{sourceLogicalPath:logicalPath+'/source-operation/'+op.id,sourceOperation:{id:op.id,relationship:followUp?'follow-up':op.relationship,sourceText:op.sourceText,
            ...(neutral?{role,...(attackMode?{attackMode}:{}),attackClassification:'unspecified',attackKind:op.attack!.type}:{}),...(op.damageAdjustment?{damageAdjustment:structuredClone(op.damageAdjustment)}:{})}}};
          item.system.activities[activity._id]=activity;
          if(!neutral&&op.attack?.reach!==undefined&&op.attack.range!==undefined&&op.attack.type.startsWith('m')){
            activity.name=op.name+' (近战)';activity.range={override:true,units:'ft',value:op.attack.reach,special:''};
            const ranged=structuredClone(activity);ranged._id=createStableDocumentId({kind:'activity',path:logicalPath+'/source-operation/'+op.id+'/ranged'});
            ranged.name=op.name+' (远程)';ranged.attack.type.value='ranged';ranged.range=sourceAttackActivityRange(op.attack,'ranged');
            item.system.activities[ranged._id]=ranged;
          }
        }
      }
      applySourceAttackDamageModes(item,sourceText,operations,action.name,logicalPath,part=>this.activityGenerator.formatDamage(part));
      item.system.description={value:formatMixedRuleHtml([contextText,sourceText].filter(Boolean).join('\n\n'),true,operationKinds),chat:''};
      item.flags.fvttJsonGenerator.manualRule={version:1,mode:'native-with-gm',sourceText,nativeRuleText:action.nativeRuleText,manualRemainder:action.manualRemainder,operations:operationKinds,sourceOperations:operations,sourceContext:action.sourceContext??[],logicalPath};
      const consumed=this.consumedRuleActions.at(-1);if(consumed)consumed.sourceStructured=action;
      return;
    }
    if(action.executionMode==='native-with-gm'){
      const sourceText=action.describe??'';
      // Typed primary mechanics do not require the program to parse either
      // the full description or the AI's native-rule presentation text.
      const safe={...action,literalMechanics:true as const,executionMode:undefined,nativeRuleText:undefined,manualRemainder:undefined,spellUseRecords:undefined,gmTriggeredSave:undefined,nativeFailureStatuses:undefined,describe:'',sourceRuleFacts:[]};
      this.appendSingleStructuredAction(items,safe,activationType,activityContext,logicalPath,sectionOverride);
      const item=items.at(-1)!;
      if(action.nativeFailureStatuses){
        const activity=Object.values(item.system.activities)[0] as any;activity.effects=[];
        for(const status of action.nativeFailureStatuses){const id=createStableDocumentId({kind:'effect',path:logicalPath+'/failure/'+status});item.effects.push({_id:id,name:SOURCE_NATIVE_FAILURE_LABELS[status],type:'base',img:`systems/dnd5e/icons/svg/statuses/${status}.svg`,transfer:false,disabled:false,statuses:[status],changes:[],duration:{},description:sourceText});activity.effects.push({_id:id,onSave:false});}
      }
      // The existing common attack contract carries both source distances.
      // When they are explicitly rendered as alternatives, expose two modes
      // on the same Item; neither a thrown property nor a second attack use is
      // inferred. Differently-valued attack profiles remain unsupported.
      const dual=(action.attackType==='mwak'||action.attackType==='msak')&&action.range?.match(/^触及\s*(\d+)\s*尺或射程\s*(\d+)(?:\/(\d+))?\s*尺$/u);
      if(dual&&Object.values(item.system.activities).some((activity:any)=>activity.type==='attack')){
        const primary=Object.values(item.system.activities).find((activity:any)=>activity.type==='attack') as any;
        item.system.range={value:Number(dual[2]),long:dual[3]?Number(dual[3]):null,reach:Number(dual[1]),units:'ft'};
        primary.name='近战';primary.attack.type.value='melee';primary.range={override:false,units:'ft',special:''};
        const ranged=structuredClone(primary);ranged._id=createStableDocumentId({kind:'activity',path:logicalPath+'/ranged-mode'});ranged.name='远程';ranged.attack.type.value='ranged';ranged.range={override:true,value:Number(dual[2]),units:'ft',special:''};
        item.system.activities[ranged._id]=ranged;
      }
      if(action.spellUseRecords){
        const existing=Object.values(item.system.activities) as any[];
        const base=existing.find(activity=>activity.type==='utility')??Object.values(this.activityGenerator.generate({name:action.name,type:'utility',desc:'',logicalPath:logicalPath+'/gm-spell-use'},{}))[0];
        if(existing.length===1&&existing[0].type==='utility'){item.system.activities={};delete item.system.uses;}
        for(const [index,record] of action.spellUseRecords.entries()){
          const activity=structuredClone(base);activity._id=createStableDocumentId({kind:'activity',path:logicalPath+'/gm-spell-use/'+index});
          activity.name=`GM施法记录：${record.name}（${record.max}/日）`;
          activity.uses={spent:0,max:String(record.max),recovery:[{period:'day',type:'recoverAll'}]};
          activity.consumption={targets:[{type:'activityUses',target:'',value:'1',scaling:{mode:'',formula:''}}],scaling:{allowed:false,max:''},spellSlot:false};
          item.system.activities[activity._id]=activity;
        }
      }
      if(action.gmTriggeredSave){
        const save=action.gmTriggeredSave;
        const abilities={str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
        const generated=this.activityGenerator.generate({name:`GM触发 ${abilities[save.ability]}豁免`,type:'save',logicalPath:logicalPath+'/gm-save',desc:'',save:{dc:save.dc,ability:save.ability,dcSourceKind:'literal',outcome:'none'}},{});
        const activity=Object.values(generated)[0] as any;
        activity.activation={type:'special',value:null,override:true,condition:save.trigger};
        activity.consumption={targets:[],spellSlot:false,scaling:{allowed:false,max:''}};
        activity.range={override:true,units:'spec',special:save.trigger};
        activity.target={override:true,prompt:true,template:{type:'',units:'ft'},affects:{count:'1',type:'creature',choice:false,special:save.trigger}};
        activity.effects=[];
        for(const status of save.failureStatuses){
          const id=createStableDocumentId({kind:'effect',path:logicalPath+'/gm-save/'+status});
          item.effects.push({_id:id,name:SOURCE_NATIVE_FAILURE_LABELS[status],type:'base',img:`systems/dnd5e/icons/svg/statuses/${status}.svg`,transfer:false,disabled:false,statuses:[status],changes:[],duration:{},description:save.sourceText});
          activity.effects.push({_id:id,onSave:false});
        }
        item.system.activities[activity._id]=activity;
      }
      const operations=[action.type==='attack'?'attack':'',action.DC!==undefined||action.gmTriggeredSave?'save':'',action.damage?.length?'damage':'',action.uses||action.recharge||action.spellUseRecords?'resource':'',action.aoe?'area':''].filter(Boolean);
      item.system.description={value:formatMixedRuleHtml(sourceText,true,operations),chat:''};
      for(const activity of Object.values(item.system.activities) as any[])activity.description={chatFlavor:formatMixedRuleHtml(sourceText,false,operations)};
      item.flags.fvttJsonGenerator.manualRule={version:1,mode:'native-with-gm',sourceText,nativeRuleText:action.nativeRuleText,manualRemainder:action.manualRemainder,operations,logicalPath};
      const consumed=this.consumedRuleActions.at(-1);if(consumed)consumed.sourceStructured={...safe,literalMechanics:undefined};
      return;
    }
    if (action.executionMode === 'gm-manual') {
      // Source-derived explicit boundary: the complete rule is readable, but
      // its prose never enters native damage/save/effect inference.
      const activation = action.activation?.explicit ? action.activation.type : activationType === 'passive' ? '' : activationType;
      const cost = activation === 'legendary' ? action.legendaryCost ?? 1 : activation && activation !== 'special' ? 1 : null;
      const activities = this.activityGenerator.generate({name:action.name,type:'utility',desc:'',logicalPath}, {});
      for (const activity of Object.values(activities) as any[]) {
        activity.activation = {type:activation,value:cost,override:false,condition:action.activation?.condition ?? ''};
        activity.description = {chatFlavor:formatManualRuleHtml(action.describe??'', false)};
      }
      const item:any = {
        name:displayName(action.name, action.englishName),
        type:'feat',img:'icons/svg/mystery-man.svg',
        system:{description:{value:formatManualRuleHtml(action.describe??'', true),chat:''},
          source:{custom:'Imported'},type:{value:'monster',subtype:activation==='legendary'?'legendary':''},
          activation:{type:activation,cost,condition:action.activation?.condition ?? ''},activities},
        effects:[],flags:this.buildItemSectionFlags(activation,activation==='',sectionOverride),
      };
      item.flags.fvttJsonGenerator.manualRule={version:1,mode:'gm-manual',sourceText:action.describe,logicalPath};
      if (action.uses) {
        const periods={day:'day',longRest:'lr',shortRest:'sr',dawn:'dawn'};
        item.system.uses={spent:0,max:String(action.uses.max),recovery:[{period:periods[action.uses.period],type:'recoverAll'}]};
      } else if (action.recharge) {
        item.system.uses={spent:0,max:'1',recovery:[{period:'recharge',type:'recoverAll',formula:String(action.recharge[0])}]};
      }
      items.push(item);
      return;
    }
    const effectiveActivationType = action.activation?.explicit ? action.activation.type : activationType;
    const activityData = {
      ...this.structuredActionToActivityData(action),
      logicalPath,
    };
    if (this.isV14() && action.sourceDamageParts) {
      const unconditional = normalizedSourceDamageParts(activityData)!
        .filter(part => (part.relationship === 'base' || part.relationship === 'additional') && !part.condition)
        .map(part => ({ formula: part.formula, type: part.type, ...(part.types ? { types: part.types } : {}) }));
      if (activityData.attack) activityData.attack.damage = unconditional;
      else activityData.damage = unconditional;
    }
    const activities = this.activityGenerator.generate(activityData, {
      ...activityContext,
      weaponConfiguration: action.weaponConfiguration ?? activityContext.weaponConfiguration,
    });
    const displaySection = sectionOverride ?? this.resolveDisplaySectionFixed(
      activationType === 'passive' ? '' : activationType,
      activationType === 'passive',
    );
    const item = this.createItemFromAction(
      { ...activityData, name: action.name, englishName: action.englishName, type: action.type, desc: action.describe,
        usesPerLongRest: action.perLongRest } as any,
      activities,
      effectiveActivationType === 'passive' ? '' : effectiveActivationType,
      displaySection,
    );

    const activationCost = effectiveActivationType === 'legendary'
      ? action.activation?.cost
        ?? action.legendaryCost
        ?? extractLegendaryCostFixed([action.name, action.englishName, action.describe].filter(Boolean).join(' '))
        ?? 1
      : action.activation?.cost ?? null;
    for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
      activity.activation = {
        type: effectiveActivationType === 'passive' ? '' : effectiveActivationType,
        value: activationCost,
        override: false,
        condition: action.activation?.condition ?? '',
      };
    }

    if(action.type==='attack'&&action.DC!==undefined&&action.ability){
      const saves=this.activityGenerator.generate({name:action.name+'（GM豁免）',type:'save',desc:'',logicalPath:logicalPath+'/explicit-save',save:{dc:action.DC,ability:action.ability,dcSourceKind:'literal',outcome:'none'}},{});
      for(const activity of Object.values(saves) as any[]){activity.name=action.name+'（GM豁免）';activity.activation={type:'special',value:null,override:true,condition:action.saveCondition??action.describe??''};activity.consumption={targets:[],spellSlot:false,scaling:{allowed:false,max:''}};activity.description={chatFlavor:formatLiteralHtml(action.describe??'')};item.system.activities[activity._id]=activity;}
    }

    if (action.subActions && action.subActions.length > 0) {
      this.attachSubActivities(item, action.subActions);
    }

    if (action.embeddedEffects && action.embeddedEffects.length > 0) {
      this.attachEmbeddedEffects(item, action.embeddedEffects);
    }
    const conditionalSaveTrigger = this.isV14() ? conditionalAttackSaveTrigger(action) : undefined;
    if (conditionalSaveTrigger) {
      // Source-derived: the proven 0HP save and its ordinary Failure clause
      // identify delayed effects even when redundant structured fields are absent.
      const source = String(action.describe ?? '').replace(/\s+/gu, ' ');
      const triggerStart = source.indexOf(conditionalSaveTrigger);
      const failure = /\bFailure\s*:\s*([\s\S]*?)(?=\bSuccess\s*:|$)/iu.exec(source.slice(triggerStart))?.[1]?.trim() ?? '';
      const projectStatus = (status: string) => isConditionId(status) ? projectedConditionStatusId(status) : status;
      const delayed = new Set(extractExplicitlyInflictedStatuses(failure).map(projectStatus));
      const immediate = new Set(extractExplicitlyInflictedStatuses(source.slice(0, triggerStart)).map(projectStatus));
      const ids = new Set<string>();
      for (const effect of item.effects as any[]) {
        const statuses = Array.isArray(effect.statuses) ? effect.statuses as string[] : [];
        if (statuses.some(status => delayed.has(status))) {
          if (statuses.some(status => immediate.has(status) || !delayed.has(status))) {
            action.describe=(action.describe??'')+'\nGM：命中与延迟状态分别依原文处理。';
          }
          ids.add(effect._id);
        } else if (effect.name?.replace(/\s+/gu, ' ').trim() === failure
          || effect.flags?.fvttJsonGenerator?.sourceDerivedEmbeddedEffect
            && effect.description?.replace(/\s+/gu, ' ').trim() === failure) {
          ids.add(effect._id);
        }
      }
      for (const activity of Object.values(item.system.activities) as any[]) {
        if (activity.type === 'attack' && activity.effects) activity.effects = activity.effects.filter((link: any) => !ids.has(link._id));
      }
    }

    if (action.recharge) {
      item.system.uses = {
        spent: 0,
        max: '1',
        recovery: [{ period: 'recharge', type: 'recoverAll', formula: String(action.recharge[0]) }],
      };
      // Source-authored recharge must consume the same Item use that recovers.
      const primaryActivity = Object.values(item.system.activities ?? {})[0] as any;
      if (primaryActivity) {
        primaryActivity.consumption = {
          scaling: { allowed: false, max: '' },
          spellSlot: false,
          targets: [{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }],
        };
      }
    }

    if (action.concentration) {
      item.system.concentration = true;
    }

    if (action.perLongRest) {
      item.system.uses = {
        spent: 0,
        max: String(action.perLongRest),
        recovery: [{ period: 'lr', type: 'recoverAll' }],
      };
    }
    if(action.uses){
      // Source-derived: daily, rest and dawn recovery are distinct contracts.
      const periods={day:'day',longRest:'lr',shortRest:'sr',dawn:'dawn'};
      item.system.uses={spent:0,max:String(action.uses.max),recovery:[{period:periods[action.uses.period],type:'recoverAll'}]};
      const primary=Object.values(item.system.activities??{})[0] as any;
      if(primary){
        primary.consumption??={scaling:{allowed:false,max:''},spellSlot:false,targets:[]};
        primary.consumption.targets??=[];
        if(!primary.consumption.targets.some((t:any)=>t.type==='itemUses'&&t.target===''))primary.consumption.targets.push({type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}});
      }
    }

    if (action.spellcastingFeatureKey) {
      // Keep the original source action while the manifest is pending. It is
      // labelled as a rule reader; hydration adds actual owned Casts with
      // their spell data and consumption, never Utility spell-use counters.
      for(const activity of Object.values(item.system.activities) as any[]){
        activity.name='规则说明';
        // This reader does not perform the spell. Only hydrated owned Casts
        // consume the source cooldown or native legendary activation cost.
        activity.activation={type:'',value:null,override:false,condition:''};
        activity.consumption={targets:[],spellSlot:false,scaling:{allowed:false,max:''}};
        activity.effects=[];
        // Schema-derived: native StringField trims outer whitespace. Emit
        // complete literal HTML, like the Item description, before readback.
        activity.description={chatFlavor:formatLiteralHtml(action.describe??'')};
      }
      item.effects=[];
      item.system.description={value:formatLiteralHtml(action.describe??''),chat:''};
      markSpellcastingFeatureItem(item, action.spellcastingFeatureKey,action.activation?.explicit?action.activation.type:undefined,activationCost??undefined);
    }

    this.consumedRuleActions.push({ logicalPath, itemIndex: items.length,
      action: activityData as ActionData, sourceStructured: action });
    items.push(item);
  }

  private structuredActionToActivityData(action: StructuredActionData): any {
    return structuredActionToActivityDataExt(action);
  }

  private attachSubActivities(item: any, subActions: StructuredActionData['subActions']): void {
    attachSubActivitiesExt(item, subActions, this.activityGenerator);
  }

  private attachEmbeddedEffects(item: any, embeddedEffects: StructuredActionData['embeddedEffects']): void {
    attachEmbeddedEffectsExt(item, embeddedEffects);
  }

  private mapTriggerType(trigger: string): string {
    return mapTriggerTypeExt(trigger);
  }

  private extractInlineFeatureLinesFromBiography(biography: unknown): { biography: string; features: string[] } {
    return extractInlineFeatureLinesFromBiography(biography, this.route);
  }

  private formatStructuredHtml(raw: unknown): string {
    return formatStructuredHtml(raw);
  }

  private splitStructuredSegments(raw: string): string[] {
    return splitStructuredSegments(raw);
  }

  private cleanDescriptionSegment(segment: string): string {
    return cleanDescriptionSegment(segment);
  }

  private collectActionLines(source: unknown): string[] {
    if (!Array.isArray(source)) {
      return [];
    }

    const lines: string[] = [];
    for (const entry of source) {
      if (typeof entry === 'string') {
        const line = entry.trim();
        if (line) {
          lines.push(line);
        }
        continue;
      }

      if (entry && typeof entry === 'object') {
        const key = Object.keys(entry)[0];
        const value = Object.values(entry)[0];
        if (typeof key === 'string' && value !== undefined) {
          lines.push(`${key}: ${this.serializeActionValue(value)}`);
        }
      }
    }

    return lines;
  }

  private serializeActionValue(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.serializeActionValue(entry)).join(', ')}]`;
    }
    if (value && typeof value === 'object') {
      return `{ ${Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => `${key}: ${this.serializeActionValue(entry)}`)
        .join(', ')} }`;
    }
    return String(value);
  }

  private appendLegacySpellItems(items: any[], spellcasting: ParsedNPC['spellcasting']): void {
    appendLegacySpellItemsExt(items, spellcasting, this.activityGenerator, this.fvttVersion);
  }

  private createSpellcastingDescriptionItem(lines: string[]): any {
    return createSpellcastingDescriptionItemExt(lines);
  }

  private extractSpellcastingLines(spellcasting: ParsedNPC['spellcasting']): string[] {
    return extractSpellcastingLinesExt(spellcasting);
  }

  private createItemFromAction(
    action: GeneratedActionData,
    activities: any,
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | 'special' | '' = 'action',
    sectionOverride?: string,
  ): any {
    const resolvedActivationType =
      activationType === ''
        ? this.inferPassiveActivationType(action)
        : activationType === 'legendary'
          ? 'legendary'
          : activationType === 'special'
            ? 'special'
            : this.resolveActivationType(action, activationType);

    const passiveTraits = ['两栖', '感知魔法', '反魔场光环', 'Amphibious', 'Sense Magic', 'Antimagic Aura'];
    const isPassive = activationType === '' || passiveTraits.some(t => action.name.includes(t));
    const isNonWeaponActivation = activationType === 'bonus' || activationType === 'reaction';
    // Schema-derived: dnd5e 5.3.3 Activity RangeField has no long range. A
    // native ability-based attack needs the weapon parent to retain that value,
    // even when its source activation is a reaction or bonus action. Its native
    // base damage already supplies the supported weapon representation.
    const nativeLongRange = this.fvttVersion === '14' && !!action.attack && !isPassive
      && isNonWeaponActivation && Boolean(this.extractNativeBaseDamage(activities))
      && Number(this.buildItemRange(action).long) > 0;
    const isWeapon = !!action.attack && ((!isNonWeaponActivation && !isPassive)
      || Boolean(action.weaponConfiguration || action.nativeMastery) || nativeLongRange);
    const semanticDesc = this.extractSemanticDescription(action);
    const activationCondition = this.extractActivationCondition(semanticDesc);

    let itemName = displayName(action.name || '', action.englishName);

    let uses = null;
    const usesMatch = itemName.match(/\s*\[(\d+)\/(?:日|Day)\]/);
    if (usesMatch && usesMatch[1]) {
      const n = parseInt(usesMatch[1], 10);
      uses = this.createDailyUses(n);
      itemName = itemName.replace(/\s*\[\d+\/(?:日|Day)\]/, '').trim();
    }
    const itemUses = action.restRecharge
      ? { spent: 0, max: '1', recovery: [{ period: action.restRecharge, type: 'recoverAll' }] }
      : !uses && action.usesPerLongRest !== undefined ? this.createDailyUses(action.usesPerLongRest) : uses;
    if (this.fvttVersion === '14' && !isWeapon) {
      this.restoreNativeBaseDamageAsDynamicActivity(activities);
    }
    const nativeBaseDamage = isWeapon ? this.extractNativeBaseDamage(activities) : null;

    const item = {
      name: itemName,
      type: isWeapon ? 'weapon' : 'feat',
      img: isWeapon ? 'icons/svg/sword.svg' : 'icons/svg/mystery-man.svg',
      system: {
        description: { value: this.formatStructuredHtml(action.desc || ''), chat: '' },
        source: { custom: 'Imported' },
        activation: { 
          type: resolvedActivationType, 
          cost: this.resolveItemActivationCost(resolvedActivationType, action.legendaryCost),
          condition: activationCondition,
        },
        activities: activities,
        ...(itemUses ? { uses: itemUses } : {}),
        ...(isWeapon ? {
          type: { value: 'natural', classification: 'weapon' },
          equipped: true,
          range: this.buildItemRange(action),
          ...(nativeBaseDamage ? { damage: { base: nativeBaseDamage } } : {}),
        } : {
          type: { value: 'monster', subtype: activationType === 'lair' ? 'lair' : activationType === 'legendary' ? 'legendary' : '' }
        })
      },
      effects: [] as any[],
      flags: this.buildItemSectionFlags(activationType === 'legendary' ? 'legendary' : resolvedActivationType, isPassive, sectionOverride),
    };

    this.removeNativeBaseDamageFlags(item.system.activities);
    this.appendSupplementalActivities(item.system.activities, action);
    item.effects = resolvedActivationType
      ? this.generateEnhancedConditionEffects(semanticDesc, item.system.activities, itemName)
      : [];
    this.removeDelayedBleedingDamageParts(item.system.activities, semanticDesc);
    this.applySpecializedActivityOverrides(item, action);
    this.applyActivityMetadata(
      item.system.activities,
      resolvedActivationType,
      activationCondition,
      item.system.uses,
      resolvedActivationType === 'legendary'
        ? action.legendaryCost ?? 1
        : action.activationCost ?? null,
    );
    this.applyNarrativeActivityTargeting(item, action);
    this.applyHeavyHitAutomation(item, action);
    this.applyRuleMetadata(item, action);
    if (isWeapon || action.weaponConfiguration || action.nativeMastery) {
      projectWeaponProperties(item, {
        configuration: action.weaponConfiguration,
        nativeMastery: action.nativeMastery,
        sourceLogicalPath: action.logicalPath,
        effectProfile: this.effectProfile,
        targetVersion: this.fvttVersion,
      });
    }
    return item;
  }

  private resolveItemActivationCost(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    legendaryCost?: number,
  ): number | null {
    return resolveItemActivationCostExt(activationType, legendaryCost);
  }

  private createActivityGenerationContext(parsed: ParsedNPC): ActivityGenerationContext {
    const proficiencyBonus = this.getParsedProficiencyBonus(parsed);
    const spellcastingAbility = this.extractSpellcastingAbility(parsed.spellcasting);
    return {
      abilities: parsed.abilities,
      ...(proficiencyBonus !== undefined ? { proficiencyBonus } : {}),
      ...(spellcastingAbility ? { spellcastingAbility } : {}),
      // Source-derived Intake totals remain literal; the synthetic or real
      // Actor's matching scores cannot prove an unstated attack ability.
      // Unmarked CLI input retains its existing native inference policy.
      preferNativeWeaponRolls: parsed.biographyMode !== 'literal',
      sourceActorName: parsed.name,
    };
  }

  private extractSpellcastingAbility(spellcasting: ParsedNPC['spellcasting']): AttackAbility | undefined {
    const lines = this.extractSpellcastingLines(spellcasting);
    const text = lines.join(' ');
    const englishMatch = text.match(/spellcasting ability is\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i);
    if (englishMatch?.[1]) {
      return this.mapAbilityWord(englishMatch[1]);
    }
    const chineseMatch = text.match(/施法属性(?:为|是|：|:)?\s*(力量|敏捷|体质|智力|感知|魅力)/);
    if (chineseMatch?.[1]) {
      return this.mapAbilityWord(chineseMatch[1]);
    }
    return undefined;
  }

  private mapAbilityWord(word: string): AttackAbility | undefined {
    const normalized = word.trim().toLowerCase();
    const map: Record<string, AttackAbility> = {
      strength: 'str',
      dexterity: 'dex',
      constitution: 'con',
      intelligence: 'int',
      wisdom: 'wis',
      charisma: 'cha',
      力量: 'str',
      敏捷: 'dex',
      体质: 'con',
      智力: 'int',
      感知: 'wis',
      魅力: 'cha',
    };
    return map[normalized] ?? map[word.trim()];
  }

  private getParsedProficiencyBonus(parsed: ParsedNPC): number | undefined {
    if (typeof parsed.attributes?.prof === 'number' && Number.isFinite(parsed.attributes.prof)) {
      return parsed.attributes.prof;
    }
    const cr = parsed.details?.cr;
    if (typeof cr !== 'number' || !Number.isFinite(cr)) {
      return undefined;
    }
    if (cr >= 17) return 6;
    if (cr >= 13) return 5;
    if (cr >= 9) return 4;
    if (cr >= 5) return 3;
    return 2;
  }

  private extractNativeBaseDamage(activities: Record<string, any>): any | null {
    for (const activity of Object.values(activities ?? {}) as any[]) {
      const baseDamage = activity?.flags?.fvttJsonGenerator?.nativeWeaponRoll?.baseDamage;
      if (baseDamage) {
        return baseDamage;
      }
    }
    return null;
  }

  private restoreNativeBaseDamageAsDynamicActivity(activities: Record<string, any>): void {
    for (const activity of Object.values(activities ?? {}) as any[]) {
      const nativeWeaponRoll = activity?.flags?.fvttJsonGenerator?.nativeWeaponRoll;
      const baseDamage = nativeWeaponRoll?.baseDamage;
      if (activity?.type !== 'attack' || !baseDamage) {
        continue;
      }

      activity.damage = {
        ...(activity.damage ?? {}),
        parts: [
          { ...baseDamage, bonus: '@mod' },
          ...(Array.isArray(activity.damage?.parts) ? activity.damage.parts : []),
        ],
        includeBase: false,
      };
    }
  }

  private removeNativeBaseDamageFlags(activities: Record<string, any>): void {
    for (const activity of Object.values(activities ?? {}) as any[]) {
      const generatorFlags = activity?.flags?.fvttJsonGenerator;
      if (!generatorFlags?.nativeWeaponRoll) {
        continue;
      }
      delete generatorFlags.nativeWeaponRoll;
      if (Object.keys(generatorFlags).length === 0) {
        delete activity.flags.fvttJsonGenerator;
      }
      if (activity.flags && Object.keys(activity.flags).length === 0) {
        delete activity.flags;
      }
    }
  }

  private buildItemRange(action: GeneratedActionData): Record<string, number | string | null> {
    return buildItemRangeExt(action);
  }

  private resolveDisplaySectionFixed(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    isPassive: boolean,
  ): string {
    return resolveDisplaySectionFixedExt(activationType, isPassive, this.route);
  }

  private buildItemSectionFlags(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    isPassive: boolean,
    sectionOverride?: string,
  ): Record<string, any> {
    return buildItemSectionFlagsExt(activationType, isPassive, this.route, sectionOverride);
  }

  private resolveDisplaySection(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    isPassive: boolean,
  ): string {
    return resolveDisplaySectionExt(activationType, isPassive, this.route);
  }

  private inferPassiveActivationType(action: ActionData): 'bonus' | 'reaction' | 'special' | '' {
    const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
    if (/\bbonus action\b|\u9644\u8d60\u52a8\u4f5c/i.test(text)) {
      return 'bonus';
    }

    if (/\breaction\b|\u4f5c\u4e3a\u53cd\u5e94|\u8fdb\u884c\u53cd\u5e94|\u53cd\u5e94\u65f6/i.test(text)) {
      return 'reaction';
    }

    if (/(wriggly|death burst|\u626d\u6ed1|\u6b7b\u4ea1\u7206\u88c2)/i.test(text)) {
      return 'special';
    }

    if (/(?:\u53ef\u4ee5|\u6b7b\u4ea1\u65f6|\u8c41\u514d|\u4f24\u5bb3|damage|saving throw)/i.test(text)) {
      return 'special';
    }

    return '';
  }

  private isLegendaryActionIntro(line: string): boolean {
    const normalized = line.replace(/\s+/g, ' ').trim();
    return /(?:can take\s+\d+\s+legendary actions?|\d+\s*(?:次|个)?\s*传奇动作)/i.test(normalized);
  }

  private extractRequiresConcentration(text: string): boolean {
    return extractRequiresConcentration(text);
  }

  private extractTargetCondition(text: string): string | undefined {
    return extractTargetCondition(text);
  }

  private extractLegendaryCostFixed(text: string): number | undefined {
    return extractLegendaryCostFixed(text);
  }

  private extractLegendaryActionCountFromLines(lines: string[]): number | undefined {
    return extractLegendaryActionCountFromLines(lines);
  }

  private extractUsesPerLongRestFixed(text: string): number | undefined {
    return extractUsesPerLongRestFixed(text);
  }

  private createDailyUses(value: number): Record<string, unknown> {
    const uses = createDailyUsesExt(value);
    return normalizeTargetUses(uses, this.fvttVersion);
  }

  private extractActivationCondition(desc: string): string {
    if (/(?:濒血|bloodied)/i.test(desc)) {
      return 'bloodied';
    }

    return '';
  }

  private extractSemanticDescription(action: GeneratedActionData): string {
    return extractSemanticDescription(action);
  }

  private appendSupplementalActivities(activities: Record<string, any>, action: GeneratedActionData): void {
    if (this.isDeathTriggeredSaveTrait(action)) {
      const saves = this.extractSavingThrowsWithInheritedDcFromText(action.desc ?? '');
      if (saves.length > 0) {
        const primaryDamage = this.extractDamagePartsFromText(action.desc ?? '').slice(0, 1);
        for (const key of Object.keys(activities)) {
          delete activities[key];
        }

        saves.forEach((save, index) => {
          Object.assign(
            activities,
            this.activityGenerator.generate({
              name: `${action.name} Save ${index + 1}`,
              type: 'save',
              desc: action.desc,
              save,
              ...(index === 0 && primaryDamage.length > 0 ? { damage: primaryDamage } : {}),
            }),
          );
        });
      }
      return;
    }

    if (this.hasSwallowLikeText(action)) {
      const damage = this.extractSwallowDamage(action);
      const save = this.extractSavingThrowFromText(action.desc ?? '');

      if (damage) {
        Object.assign(
          activities,
          this.activityGenerator.generate({
            name: `${action.name} Damage`,
            type: 'utility',
            desc: action.desc,
            damage: [damage],
          }),
        );
      }

      if (save) {
        Object.assign(
          activities,
          this.activityGenerator.generate({
            name: `${action.name} Save`,
            type: 'save',
            desc: action.desc,
            save,
          }),
        );
      }
      return;
    }

    this.appendGenericRiderActivities(activities, action);

    if (!action.attack || !action.desc || !/(?:强击|Heavy Hit)/i.test(action.desc)) {
      return;
    }

    const heavyHitBranches = this.buildHeavyHitBranchActions(action);
    if (heavyHitBranches.length > 0) {
      for (const branch of heavyHitBranches) {
        const generated = this.activityGenerator.generate(branch.action);
        const branchEntry = Object.entries(generated)[0];
        if (!branchEntry) {
          continue;
        }

        const [, branchActivity] = branchEntry;
        const flags = (branchActivity.flags ??= {});
        flags.fvttJsonGenerator = {
          ...(flags.fvttJsonGenerator ?? {}),
          heavyHitBranch: {
            key: branch.key,
            label: branch.label,
            kind: branch.kind,
          },
          ...(branch.key === 'bleeding-wound'
            ? (() => {
              const bleedingSpec = extractBleedingSpec(branch.action.desc ?? '');
              return bleedingSpec ? { bleeding: bleedingSpec } : {};
            })()
            : {}),
        };
        ActivityGenerator.mergeUnique(activities, generated);
      }
      return;
    }

    const save = this.extractSavingThrowFromText(action.desc);
    if (save) {
      Object.assign(
        activities,
        this.activityGenerator.generate({
          name: `${action.name} Save`,
          type: 'save',
          desc: action.desc,
          save,
        }),
      );
    }
  }

  private appendGenericRiderActivities(activities: Record<string, any>, action: GeneratedActionData): void {
    const text = [action.name, action.englishName, action.desc].filter(Boolean).join('\n');
    const rules = this.extractGenericRiderRules(text);
    if (!rules) {
      return;
    }

    this.appendConditionalDamageAttackActivities(activities, action, this.asRiderArray(rules.conditionalDamage));
    const temporaryOverrides = this.asRiderArray(rules.temporaryOverrides);
    this.removeTemporaryOverrideDamageActivities(activities, temporaryOverrides);
    this.appendTemporaryOverrideSaveActivities(activities, action, temporaryOverrides);
  }

  private removeTemporaryOverrideDamageActivities(
    activities: Record<string, any>,
    riders: Array<Record<string, unknown>>,
  ): void {
    if (riders.length === 0) {
      return;
    }

    const formulas = new Set(
      riders
        .map((rider) => this.normalizeNestedRiderDamage(rider.damage)?.formula)
        .filter((formula): formula is string => Boolean(formula)),
    );
    if (formulas.size === 0) {
      return;
    }

    for (const [id, activity] of Object.entries(activities) as Array<[string, any]>) {
      if (activity?.type !== 'damage') {
        continue;
      }
      const activityFormula = this.formatActivityDamagePartFormula(activity.damage?.parts?.[0]);
      if (activityFormula && formulas.has(activityFormula)) {
        delete activities[id];
      }
    }
  }

  private appendConditionalDamageAttackActivities(
    activities: Record<string, any>,
    action: GeneratedActionData,
    riders: Array<Record<string, unknown>>,
  ): void {
    if (!action.attack || riders.length === 0) {
      return;
    }

    for (const rider of riders) {
      const damage = this.normalizeRiderDamage(rider, action.attack.damage[0]?.type ?? '');
      if (!damage) {
        continue;
      }

      const generated = this.activityGenerator.generate({
        ...action,
        name: `${action.name} Conditional Damage`,
        englishName: action.englishName ? `${action.englishName} Conditional Damage` : undefined,
        desc: String(rider.sourceText ?? action.desc ?? ''),
        attack: {
          ...action.attack,
          damage: [damage],
          versatile: undefined,
        },
      });
      this.attachGeneratedActivityFlag(generated, 'conditionalDamage', {
        ...rider,
        baseAction: action.name,
      });
      ActivityGenerator.mergeUnique(activities, generated);
    }
  }

  private appendTemporaryOverrideSaveActivities(
    activities: Record<string, any>,
    action: GeneratedActionData,
    riders: Array<Record<string, unknown>>,
  ): void {
    if (riders.length === 0) {
      return;
    }

    for (const rider of riders) {
      const saveDc = typeof rider.saveDc === 'number' ? rider.saveDc : null;
      const damage = this.normalizeNestedRiderDamage(rider.damage);
      const ability = this.inferTemporaryOverrideSaveAbility(rider, action);
      if (!saveDc || !ability) {
        continue;
      }

      const generated = this.activityGenerator.generate({
        name: `${action.name} Temporary Override`,
        englishName: action.englishName ? `${action.englishName} Temporary Override` : undefined,
        type: 'save',
        desc: String(rider.sourceText ?? action.desc ?? ''),
        save: {
          dc: saveDc,
          ability,
        },
        ...(damage ? { damage: [damage] } : {}),
      });
      this.attachGeneratedActivityFlag(generated, 'temporaryOverride', {
        ...rider,
        baseAction: action.name,
      });
      ActivityGenerator.mergeUnique(activities, generated);
    }
  }

  private attachGeneratedActivityFlag(
    generated: Record<string, any>,
    key: string,
    value: Record<string, unknown>,
  ): void {
    for (const activity of Object.values(generated) as any[]) {
      const flags = (activity.flags ??= {});
      flags.fvttJsonGenerator = {
        ...(flags.fvttJsonGenerator ?? {}),
        [key]: value,
      };
    }
  }

  private asRiderArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object');
  }

  private normalizeRiderDamage(rider: Record<string, unknown>, fallbackType: string): Damage | null {
    const formula = typeof rider.formula === 'string' ? rider.formula.replace(/\s+/g, '') : '';
    if (!formula) {
      return null;
    }

    return {
      formula,
      type: typeof rider.damageType === 'string' && rider.damageType ? rider.damageType : fallbackType || 'bludgeoning',
    };
  }

  private normalizeNestedRiderDamage(value: unknown): Damage | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const damage = value as Record<string, unknown>;
    const formula = typeof damage.formula === 'string' ? damage.formula.replace(/\s+/g, '') : '';
    if (!formula) {
      return null;
    }

    return {
      formula,
      type: typeof damage.type === 'string' && damage.type ? damage.type : 'bludgeoning',
    };
  }

  private formatActivityDamagePartFormula(part: any): string | null {
    if (!part || typeof part !== 'object') {
      return null;
    }
    const number = typeof part.number === 'number' ? part.number : null;
    const denomination = typeof part.denomination === 'number' ? part.denomination : null;
    if (!number || !denomination) {
      return null;
    }
    const bonus = typeof part.bonus === 'string' && part.bonus.trim() ? part.bonus.trim().replace(/\s+/g, '') : '';
    return `${number}d${denomination}${bonus ? (bonus.startsWith('+') || bonus.startsWith('-') ? bonus : `+${bonus}`) : ''}`;
  }

  private inferTemporaryOverrideSaveAbility(
    rider: Record<string, unknown>,
    action: GeneratedActionData,
  ): NonNullable<ActionData['save']>['ability'] | null {
    const explicitSave = this.extractSavingThrowFromText(action.desc ?? '');
    if (explicitSave?.ability) {
      return explicitSave.ability;
    }

    const label = [rider.targetAbility, rider.sourceText, action.desc].filter(Boolean).join(' ');
    if (/(?:strength|\bstr\b|\u529b\u91cf)/i.test(label)) return 'str';
    if (/(?:dexterity|\bdex\b|\u654f\u6377)/i.test(label)) return 'dex';
    if (/(?:constitution|\bcon\b|\u4f53\u8d28)/i.test(label)) return 'con';
    if (/(?:intelligence|\bint\b|\u667a\u529b)/i.test(label)) return 'int';
    if (/(?:charisma|\bcha\b|\u9b45\u529b)/i.test(label)) return 'cha';
    if (/(?:wisdom|\bwis\b|\u611f\u77e5)/i.test(label)) return 'wis';

    return null;
  }

  private applyHeavyHitAutomation(item: any, action: GeneratedActionData): void {
    if (!action.attack || !/(?:寮哄嚮|Heavy Hit)/i.test(action.desc ?? '')) {
      return;
    }

    const activityEntries = Object.entries(item?.system?.activities ?? {}) as Array<[string, any]>;
    const attackEntry = activityEntries.find(([, activity]) => activity?.type === 'attack');
    if (!attackEntry) {
      return;
    }

    const branchEntries = activityEntries.filter(([, activity]) => activity?.flags?.fvttJsonGenerator?.heavyHitBranch);
    if (branchEntries.length === 0) {
      return;
    }

    const spec = buildHeavyHitAutomationSpec(
      branchEntries.map(([activityId, activity]) => ({
        activityId,
        label: activity?.flags?.fvttJsonGenerator?.heavyHitBranch?.label ?? activity?.name ?? activityId,
        kind: activity?.flags?.fvttJsonGenerator?.heavyHitBranch?.kind ?? activity?.type ?? 'utility',
      })),
    );

    const [, attackActivity] = attackEntry;
    attackActivity.midiProperties = {
      ...(attackActivity.midiProperties ?? {}),
      identifier: 'heavy-hit-primary',
      otherActivityCompatible: true,
    };
    attackActivity.macroData = {
      ...(attackActivity.macroData ?? {}),
      name: 'Heavy Hit',
      command: buildHeavyHitMacroCommand(spec),
    };

    branchEntries.forEach(([activityId, activity], index) => {
      activity.activation = {
        ...(activity.activation ?? {}),
        type: 'special',
        value: null,
        override: false,
      };
      activity.midiProperties = {
        ...(activity.midiProperties ?? {}),
        identifier: `heavy-hit-branch-${index + 1}`,
        otherActivityCompatible: true,
        automationOnly: true,
      };
      activity.consumption = {
        scaling: { allowed: false, max: '' },
        spellSlot: false,
        targets: [],
      };
      const branchFlags = (activity.flags ??= {});
      branchFlags.fvttJsonGenerator = {
        ...(branchFlags.fvttJsonGenerator ?? {}),
        heavyHitBranchActivityId: activityId,
      };
    });

    const itemFlags = (item.flags ??= {});
    itemFlags.fvttJsonGenerator = {
      ...(itemFlags.fvttJsonGenerator ?? {}),
      heavyHit: spec,
    };
  }

  private applyNarrativeActivityTargeting(item: any, action: GeneratedActionData): void {
    const activities = Object.values(item?.system?.activities ?? {}) as any[];
    if (activities.length === 0) {
      return;
    }

    const radius = this.extractAreaRadiusFeet(action.desc ?? '');
    if (radius) {
      for (const activity of activities.filter((candidate) => candidate?.type === 'save')) {
        if (!activity.target) {
          activity.target = this.createAreaTarget('sphere', radius);
        }
      }
    }

    if (!action.attack) {
      const saveActivities = activities.filter((candidate) => candidate?.type === 'save');
      const hasTemplate = saveActivities.some((activity) => (
        typeof activity.target?.template?.type === 'string'
        && activity.target.template.type.trim().length > 0
      ));
      const range = hasTemplate
        ? this.extractNarrativePlacementRangeFeet(action.desc ?? '')
        : this.extractNarrativeRangeFeetFixed(action.desc ?? '');
      if (range) {
        for (const activity of saveActivities) {
          if (!activity.range) {
            activity.range = this.createDistanceRange(range);
          }
        }
      }
    }
  }

  private applyRuleMetadata(item: any, action: GeneratedActionData): void {
    const rules = this.extractRuleMetadata(action);
    if (!rules) {
      return;
    }

    const flags = (item.flags ??= {});
    flags.fvttJsonGenerator = {
      ...(flags.fvttJsonGenerator ?? {}),
      rules: {
        ...(flags.fvttJsonGenerator?.rules ?? {}),
        ...rules,
      },
    };
    this.applyCustomOnHitRiderEffects(item, rules);
    this.removeConditionGatedEffects(item, rules);
    this.removeConditionalDamagePrerequisiteEffects(item, rules);
    this.applySummonActivityMetadata(item, rules);
  }

  private removeDelayedBleedingDamageParts(activities: Record<string, any>, text: string): void {
    const bleedingSpec = extractBleedingSpec(text);
    if (!bleedingSpec || !hasDelayedBleedingFormula(text, bleedingSpec.formula)) {
      return;
    }

    for (const activity of Object.values(activities ?? {}) as any[]) {
      const parts = activity?.damage?.parts;
      if (!Array.isArray(parts)) continue;
      const index = parts.findIndex((part: any) => this.formatActivityDamagePartFormula(part) === bleedingSpec.formula);
      if (index >= 0) parts.splice(index, 1);
    }
  }

  private applySummonActivityMetadata(item: any, rules: Record<string, unknown>): void {
    const summons = this.asRiderArray(rules.summons);
    if (summons.length === 0) {
      return;
    }

    const [primarySummon] = summons;
    if (!primarySummon) {
      return;
    }
    const countFormula = typeof primarySummon.countFormula === 'string'
      ? primarySummon.countFormula.replace(/\s+/g, '')
      : '';
    if (!countFormula) {
      return;
    }

    const activities = Object.values(item?.system?.activities ?? {}) as any[];
    const utilityActivities = activities.filter((activity) => activity?.type === 'utility');
    const targets = utilityActivities.length > 0 ? utilityActivities : activities;

    for (const activity of targets) {
      const flags = (activity.flags ??= {});
      flags.fvttJsonGenerator = {
        ...(flags.fvttJsonGenerator ?? {}),
        summon: {
          ...primarySummon,
          countFormula,
        },
      };
      activity.roll = {
        ...(activity.roll ?? {}),
        name: typeof activity.roll?.name === 'string' && activity.roll.name ? activity.roll.name : 'Summon Count',
        formula: countFormula,
        prompt: Boolean(activity.roll?.prompt ?? false),
        visible: Boolean(activity.roll?.visible ?? false),
      };
      delete activity.rolls;
    }
  }

  private applyCustomOnHitRiderEffects(item: any, rules: Record<string, unknown>): void {
    const customRiders = this.asRiderArray(rules.onHitRiders).filter((rider) => rider.kind === 'customEffect');
    if (customRiders.length === 0) {
      return;
    }

    const savePenalties = this.asRiderArray(rules.savePenalties);
    item.effects = item.effects ?? [];

    for (const rider of customRiders) {
      const label = typeof rider.label === 'string' && rider.label.trim() ? rider.label.trim() : 'Custom Effect';
      const effect = this.createCustomEffect({
        name: label,
        img: this.iconForCustomEffectLabel(label),
        statuses: [],
        flags: {
          fvttJsonGenerator: {
            kind: 'onHitCustomEffect',
            rider,
            ...(savePenalties.length > 0 ? { savePenalties } : {}),
          },
        },
      });
      item.effects.push(effect);
      this.attachEffectToAttackActivities(item, effect._id);
    }
  }

  private iconForCustomEffectLabel(label: string): string {
    if (/(?:bleed|bleeding|blood|wound|流血|血|伤口|傷口)/i.test(label)) {
      return statusIconPath('bleeding');
    }
    if (/(?:dazed|恍惚|眩晕|眩暈)/i.test(label)) {
      return statusIconPath('dazed');
    }
    return 'icons/svg/aura.svg';
  }

  private attachEffectToAttackActivities(item: any, effectId: string): void {
    const activities = Object.values(item?.system?.activities ?? {}) as any[];
    const attackActivities = activities.filter((activity) => activity?.type === 'attack');
    const targets = attackActivities.length > 0 ? attackActivities : activities;
    for (const activity of targets) {
      activity.effects = [...(activity.effects ?? []), { _id: effectId }];
    }
  }

  private removeConditionGatedEffects(item: any, rules: Record<string, unknown>): void {
    const gated = Array.isArray(rules.conditionGatedStatuses) ? rules.conditionGatedStatuses : [];
    if (gated.length === 0) {
      return;
    }

    const gatedStatuses = new Set<string>();
    for (const rider of gated as Array<Record<string, unknown>>) {
      for (const status of Array.isArray(rider.statuses) ? rider.statuses : []) {
        if (typeof status === 'string') {
          gatedStatuses.add(status);
        }
      }
      for (const condition of Array.isArray(rider.targetConditions) ? rider.targetConditions : []) {
        if (condition === 'grappled' || condition === 'restrained' || condition === 'prone') {
          gatedStatuses.add(condition);
        }
      }
    }

    if (gatedStatuses.size === 0) {
      return;
    }

    item.effects = (item.effects ?? []).filter((effect: any) => {
      const statuses = Array.isArray(effect?.statuses) ? effect.statuses : [];
      return !statuses.some((status: string) => gatedStatuses.has(status));
    });

    const remainingIds = new Set((item.effects ?? []).map((effect: any) => effect?._id));
    for (const activity of Object.values(item?.system?.activities ?? {}) as any[]) {
      activity.effects = (activity.effects ?? []).filter((ref: any) => remainingIds.has(ref?._id));
    }
  }

  private removeConditionalDamagePrerequisiteEffects(item: any, rules: Record<string, unknown>): void {
    const conditionalDamage = this.asRiderArray(rules.conditionalDamage);
    if (conditionalDamage.length === 0) {
      return;
    }

    const inflictedStatuses = new Set<string>();
    for (const rider of this.asRiderArray(rules.onHitRiders)) {
      for (const status of Array.isArray(rider.statuses) ? rider.statuses : []) {
        if (typeof status === 'string') {
          inflictedStatuses.add(status);
        }
      }
    }

    const prerequisiteStatuses = new Set<string>();
    for (const rider of conditionalDamage) {
      for (const condition of Array.isArray(rider.targetConditions) ? rider.targetConditions : []) {
        if (
          typeof condition === 'string' &&
          ['grappled', 'restrained', 'prone', 'frightened', 'stunned', 'dazed'].includes(condition) &&
          !inflictedStatuses.has(condition)
        ) {
          prerequisiteStatuses.add(condition);
        }
      }
    }

    if (prerequisiteStatuses.size === 0) {
      return;
    }

    item.effects = (item.effects ?? []).filter((effect: any) => {
      const statuses = Array.isArray(effect?.statuses) ? effect.statuses : [];
      return !statuses.some((status: string) => prerequisiteStatuses.has(status));
    });

    const remainingIds = new Set((item.effects ?? []).map((effect: any) => effect?._id));
    for (const activity of Object.values(item?.system?.activities ?? {}) as any[]) {
      activity.effects = (activity.effects ?? []).filter((ref: any) => remainingIds.has(ref?._id));
    }
  }

  private extractRuleMetadata(action: GeneratedActionData): Record<string, unknown> | null {
    const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
    const rules: Record<string, unknown> = {};

    if (action.requiresConcentration) {
      rules.requiresConcentration = true;
    }

    if (action.targetCondition) {
      rules.targetCondition = action.targetCondition;
    }

    if (this.hasHalfDamageOnSave(action.desc ?? '')) {
      rules.halfDamageOnSave = true;
    }

    const thresholdEffects = this.extractThresholdEffects(text);
    if (thresholdEffects.length > 0) {
      rules.thresholdEffects = thresholdEffects;
    }

    // Source-derived: an independently used save feature has no attack hit event.
    const onHitRiders = action.type === 'attack' ? this.extractOnHitRiders(text) : [];
    if (onHitRiders.length > 0) {
      rules.onHitRiders = onHitRiders;
    }

    const onFailedSave = this.extractOnFailedSaveRiders(text);
    if (onFailedSave.length > 0) {
      rules.onFailedSave = onFailedSave;
    }

    const genericRiderRules = this.extractGenericRiderRules(text);
    if (genericRiderRules) {
      for (const [key, value] of Object.entries(genericRiderRules)) {
        if (Array.isArray(value) && Array.isArray(rules[key])) {
          rules[key] = [...(rules[key] as unknown[]), ...value];
          continue;
        }
        rules[key] = value;
      }
    }

    const allyEscapeSave = this.extractAllyEscapeSave(action.desc ?? '');
    if (allyEscapeSave) {
      rules.allyEscapeSave = allyEscapeSave;
    }

    const aura = this.extractAuraMetadata(text);
    if (aura) {
      rules.aura = aura;
    }

    const onRepeatedAttack = this.extractRepeatedAttackMetadata(text);
    if (onRepeatedAttack) {
      rules.onRepeatedAttack = onRepeatedAttack;
    }

    if (this.extractGrantsControlOnFail(text)) {
      rules.grantsControlOnFail = true;
    }

    if (this.extractRepeatSaveOnDamage(text)) {
      rules.repeatSaveOnDamage = true;
    }

    const onDropToZero = this.extractOnDropToZeroMetadata(action, text);
    if (onDropToZero) {
      rules.onDropToZero = onDropToZero;
    }

    const onUse = this.extractOnUseMetadata(action, text);
    if (onUse) {
      rules.onUse = onUse;
    }

    return Object.keys(rules).length > 0 ? rules : null;
  }

  private extractAllyEscapeSave(text: string): Record<string, unknown> | null {
    if (!/\bDominated\b|\u652f\u914d/i.test(text) || !/\bAdvantage\b|\u4f18\u52bf/i.test(text)) {
      return null;
    }

    if (!/(?:摆脱|结束|解除).{0,12}(?:控制|支配)|(?:end|escape|break).{0,24}(?:control|dominat)/iu.test(text)) return null;

    const saveMatch =
      text.match(/DC\s*(\d+)[^()]{0,20}\((Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\)/i) ??
      text.match(/DC\s*(\d+)[^\u4e00-\u9fff]{0,10}(\u529b\u91cf|\u654f\u6377|\u4f53\u8d28|\u667a\u529b|\u611f\u77e5|\u9b45\u529b)/i);
    if (!saveMatch?.[1] || !saveMatch[2]) {
      return null;
    }

    return {
      targetCondition: 'dominated',
      saveAbility: this.normalizeAbility(saveMatch[2]),
      saveDc: Number.parseInt(saveMatch[1], 10),
      advantage: true,
    };
  }

  private extractAuraMetadata(text: string): Record<string, unknown> | null {
    if (!/\bDifficult Terrain\b|\u56f0\u96be\u5730\u5f62/i.test(text)) {
      return null;
    }

    const radius = this.extractAreaRadiusFeet(text);
    if (!radius) {
      return null;
    }

    return {
      radius,
      units: 'ft',
      terrain: 'difficult',
    };
  }

  private extractRepeatedAttackMetadata(text: string): Record<string, unknown> | null {
    const referencesRepeatedAttack =
      /\bfirst\b.*\battack\b|\battack\b.*\bfirst\b|\u7b2c\u4e00\u6b21.*\u653b\u51fb|\u653b\u51fb.*\u7b2c\u4e00\u6b21|Vicious Mucous/i.test(text);
    const attackFailure =
      /\battack\s+fails?\b|\u653b\u51fb\u5931\u6548|\u653b\u51fb\u5931\u8d25|\u5931\u6548|\u5931\u6548/i.test(text);
    const saveMatch =
      text.match(/DC\s*(\d+)[^()]{0,20}\((Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\)/i) ??
      text.match(/DC\s*(\d+)[^\u4e00-\u9fff]{0,10}(\u529b\u91cf|\u654f\u6377|\u4f53\u8d28|\u667a\u529b|\u611f\u77e5|\u9b45\u529b)/i);

    if (!saveMatch?.[1] || !saveMatch[2]) {
      return null;
    }

    if (!referencesRepeatedAttack && !attackFailure) {
      return null;
    }

    return {
      saveAbility: this.normalizeAbility(saveMatch[2]),
      saveDc: Number.parseInt(saveMatch[1], 10),
      failure: 'attackFails',
    };
  }

  private extractGrantsControlOnFail(text: string): boolean {
    return /\bCharmed\b.*(?:control|controlled)|(?:control|controlled).*\bCharmed\b|\u9b45\u60d1.*\u63a7\u5236|\u63a7\u5236.*\u9b45\u60d1/i
      .test(text);
  }

  private extractRepeatSaveOnDamage(text: string): boolean {
    return /(?:repeat|retry).{0,40}save.{0,40}damage|damage.{0,40}(?:repeat|retry).{0,40}save|\u53d7\u5230.{0,20}\u4f24\u5bb3.{0,20}\u91cd\u590d.{0,20}\u8c41\u514d|鍙楀埌.{0,20}浼ゅ.{0,20}閲嶅.{0,20}璞佸厤/i
      .test(text);
  }

  private extractOnDropToZeroMetadata(
    action: GeneratedActionData,
    text: string,
  ): Record<string, unknown> | null {
    // Source-derived: only an explicit HP recovery in the same drop-to-zero
    // consequence can supply this rule. Earlier dice may describe damage.
    const source = action.desc ?? text;
    const dropToZero = /(?:hit points?|生命值|hp)[^。.;]{0,24}(?:降至|降到|to)\s*0|(?:reduces?|reduced|drop(?:s|ped)?)[^。.;]{0,20}to\s*0(?:\s+(?:hit\s+points?|hp))?/giu;
    const recoverEnglish = /\b(?:regains?|recovers?|restores?|heals?)\s+(?:\d+\s*[(（]\s*)?`?(\d+d\d+(?:\s*[+-]\s*\d+)?)`?\s*[)）]?\s*(?:hit\s+points?|hp)\b/giu;
    const recoverChinese = /(?:恢复|回复|回復|治愈|治癒)\s*(?:\d+\s*[(（]\s*)?`?(\d+d\d+(?:\s*[+-]\s*\d+)?)`?\s*[)）]?\s*点?(?:生命值|hp)/giu;
    const laterTurn = /(?:\b(?:at|on)\s+(?:the\s+)?(?:start|beginning|end)\s+of\b[^,;。]*\bturn\b|\bnext\s+turn\b|(?:下|下一|每)回合.{0,8}(?:开始|结束))/iu;
    let healFormula: string | undefined;
    for (const drop of source.matchAll(dropToZero)) {
      const consequence = source.slice(drop.index! + drop[0].length).split(/[。.;!?！？]/u, 1)[0] ?? '';
      const recoveries = [...consequence.matchAll(recoverEnglish), ...consequence.matchAll(recoverChinese)]
        .sort((a, b) => a.index! - b.index!);
      for (const recovery of recoveries) {
        const beforeRecovery = consequence.slice(0, recovery.index);
        const afterRecovery = consequence.slice(recovery.index! + recovery[0].length).split(/[,，]/u, 1)[0] ?? '';
        if (laterTurn.test(beforeRecovery) || laterTurn.test(afterRecovery)) continue;
        if (/(?:\b(?:cannot|can't|does\s+not|do\s+not|doesn't|not|never|unable\s+to)|(?:不能|无法|不会|未能|禁止))\s*$/iu.test(beforeRecovery)) continue;
        healFormula = recovery[1];
        break;
      }
      if (healFormula) break;
    }
    if (!healFormula) {
      return null;
    }

    const maintainWithoutConcentration = /without\s+concentration|\u4e0d\u518d\u9700\u8981\u4e13\u6ce8|\u7ef4\u6301.{0,20}\u63a7\u5236|涓嶅啀闇€瑕佷笓娉|缁存寔.{0,20}鏀厤/i
      .test(text);

    return {
      healFormula,
      maintainWithoutConcentration,
    };
  }

  private extractOnUseMetadata(
    action: GeneratedActionData,
    text: string,
  ): Record<string, unknown> | null {
    const englishName = action.englishName ?? '';
    const isSwap = /\bswap\b/i.test(englishName) || /\bswap\b/i.test(text);
    const isTeleport = /\bteleport/i.test(text) || /\u4f20\u9001|浼犻€?/i.test(text);
    if (!isSwap && !isTeleport) {
      return null;
    }

    if (isSwap) {
      return {
        kind: 'teleportSwap',
        maxTargets: 1,
      };
    }

    return null;
  }

  private buildHeavyHitBranchActions(
    action: GeneratedActionData,
  ): Array<{ key: string; label: string; kind: 'damage' | 'save' | 'utility'; action: GeneratedActionData }> {
    const text = action.desc ?? '';
    const primaryDamageType = action.attack?.damage?.[0]?.type
      || this.extractPrimaryDamagePartsFromText(text)[0]?.type
      || 'bludgeoning';
    const segments = this.extractHeavyHitBranchSegments(text);
    const branches: Array<{ key: string; label: string; kind: 'damage' | 'save' | 'utility'; action: GeneratedActionData }> = [];

    for (const segment of segments) {
      const save = this.extractSavingThrowFromText(segment.text);
      let damageParts = this.extractDamagePartsFromText(segment.text).map((damage) => ({
        ...damage,
        type: damage.type || primaryDamageType,
      }));
      const bleedingSpec = extractBleedingSpec(segment.text);
      if (segment.key === 'bleeding-wound' && bleedingSpec) {
        // The branch creates a reusable turn-start wound. Its delayed die is
        // not an immediate damage Activity.
        damageParts = [];
      }
      if (segment.key === 'bleeding-wound' && damageParts.length > 1) {
        damageParts = damageParts.slice(0, 1);
      }

      if (save) {
        branches.push({
          key: segment.key,
          label: segment.label,
          kind: 'save',
          action: {
            name: `${action.name} ${segment.label}`,
            englishName: segment.label,
            type: 'save',
            desc: segment.text,
            save,
            ...(damageParts.length > 0 ? { damage: damageParts } : {}),
          },
        });
        continue;
      }

      if (damageParts.length > 0) {
        branches.push({
          key: segment.key,
          label: segment.label,
          kind: 'damage',
          action: {
            name: `${action.name} ${segment.label}`,
            englishName: segment.label,
            type: 'utility',
            desc: segment.text,
            damage: damageParts,
          },
        });
        continue;
      }

      branches.push({
        key: segment.key,
        label: segment.label,
        kind: 'utility',
        action: {
          name: `${action.name} ${segment.label}`,
          englishName: segment.label,
          type: 'utility',
          desc: segment.text,
        },
      });
    }

    return branches;
  }

  private extractHeavyHitBranchSegments(text: string): Array<{ key: string; label: string; text: string }> {
    const heavyHitStart = text.search(/(?:寮哄嚮|Heavy Hit)/i);
    if (heavyHitStart === -1) {
      return [];
    }

    const heavyHitText = text.slice(heavyHitStart);
    const markers = [
      { key: 'bleeding-wound', label: 'Bleeding Wound', pattern: /Bleeding Wound|Bleed/i },
      { key: 'reeling-impact', label: 'Reeling Impact', pattern: /Reeling Impact|Dazed/i },
      { key: 'push', label: 'Push', pattern: /\bPush\b/i },
    ] as const;

    const occurrences = markers
      .map((marker) => {
        const index = heavyHitText.search(marker.pattern);
        return index >= 0 ? { ...marker, index } : null;
      })
      .filter((entry) => entry !== null)
      .sort((left, right) => left.index - right.index);

    return occurrences.map((entry, index) => {
      const next = occurrences[index + 1];
      const slice = heavyHitText.slice(entry.index, next?.index ?? undefined).trim();
      return {
        key: entry.key,
        label: entry.label,
        text: slice,
      };
    });
  }

  private createAreaTarget(type: string, size: number): Record<string, unknown> {
    return {
      override: false,
      prompt: true,
      template: {
        count: '',
        contiguous: false,
        type,
        size: String(size),
        width: '',
        height: '',
        units: 'ft',
      },
      affects: {
        count: '',
        type: '',
        choice: false,
        special: '',
      },
    };
  }

  private createDistanceRange(value: number): Record<string, unknown> {
    return {
      override: false,
      value,
      long: null,
      reach: null,
      units: 'ft',
      special: '',
    };
  }

  private extractAreaRadiusFeet(text: string): number | null {
    return extractAreaRadiusFeet(text);
  }

  private extractNarrativeRangeFeet(text: string): number | null {
    return extractNarrativeRangeFeet(text);
  }

  private extractNarrativeRangeFeetFixed(text: string): number | null {
    return extractNarrativeRangeFeetFixed(text);
  }

  private extractNarrativePlacementRangeFeet(text: string): number | null {
    return extractNarrativePlacementRangeFeet(text);
  }

  private hasHalfDamageOnSave(text: string): boolean {
    return hasHalfDamageOnSave(text);
  }

  private extractThresholdEffects(text: string): Array<Record<string, unknown>> {
    return extractThresholdEffects(text);
  }

  private extractOnHitRiders(text: string): Array<Record<string, unknown>> {
    return extractOnHitRiders(text);
  }

  private extractOnFailedSaveRiders(text: string): Array<Record<string, unknown>> {
    return extractOnFailedSaveRiders(text);
  }

  private extractGenericRiderRules(text: string): Record<string, unknown> | null {
    return extractGenericRiderRules(text);
  }

  private normalizeAbility(raw: string): string {
    return normalizeAbility(raw);
  }

  private applySpecializedActivityOverrides(item: any, action: GeneratedActionData): void {
    const activityEntries = Object.entries(item?.system?.activities ?? {}) as Array<[string, any]>;
    if (activityEntries.length === 0) {
      return;
    }

    this.appendCompoundRiderActivities(item, action);
    this.applyParsedAcEffect(item, action);

    for (const [, activity] of activityEntries) {
      const parts = activity?.damage?.parts;
      if (!Array.isArray(parts) || parts.length < 2) {
        continue;
      }
      const hasHealingNarrative = /(?:regain|restore|heals?|恢复生命值|恢复)/i.test(action.desc ?? '');
      if (!hasHealingNarrative) {
        continue;
      }
      const serialized = parts.map((part: any) => JSON.stringify(part));
      if (serialized.every((value) => value === serialized[0])) {
        activity.damage.parts = [parts[0]];
      }
    }

    const savePenaltyNarrative = /(?:next\s+saving\s+throw[^.]*?subtract|豁免检定[^。]*?减去)/i.test(action.desc ?? '');
    if (savePenaltyNarrative) {
      for (const [, activity] of activityEntries) {
        const parts = activity?.damage?.parts;
        if (Array.isArray(parts) && parts.length > 1) {
          activity.damage.parts = [parts[0]];
        }
      }
    }

    if (action.targetCondition) {
      item.effects = (item.effects ?? []).filter((effect: any) => !(effect?.statuses ?? []).includes(action.targetCondition));
      const allowedIds = new Set((item.effects ?? []).map((effect: any) => effect?._id));
      for (const [, activity] of activityEntries) {
        activity.effects = (activity.effects ?? []).filter((ref: any) => allowedIds.has(ref?._id));
      }
    }

    if (this.isStatusRemovalUtility(action)) {
      item.effects = [];
      for (const [, activity] of activityEntries) {
        activity.effects = [];
      }
      return;
    }

    if (this.hasSwallowLikeText(action)) {
      item.effects = (item.effects ?? []).filter((effect: any) => {
        const statuses = effect?.statuses ?? [];
        return statuses.includes('blinded') || statuses.includes('restrained');
      });

      const attackActivity = activityEntries.find(([, activity]) => activity?.type === 'attack')?.[1];
      const damageActivity = activityEntries.find(([, activity]) => activity?.type === 'damage')?.[1];
      const saveActivity = activityEntries.find(([, activity]) => activity?.type === 'save')?.[1];
      const refs = (item.effects ?? []).map((effect: any) => ({ _id: effect._id }));

      if (attackActivity) {
        attackActivity.effects = refs;
      }
      if (damageActivity) {
        damageActivity.effects = [];
      }
      if (saveActivity) {
        saveActivity.effects = [];
      }
      return;
    }

    if (/(?:强击|Heavy Hit)/i.test(action.desc ?? '')) {
      item.effects = [];
      for (const [, activity] of activityEntries) {
        activity.effects = [];
      }
      const bleedingBranch = activityEntries.find(([, activity]) =>
        activity?.flags?.fvttJsonGenerator?.heavyHitBranch?.key === 'bleeding-wound',
      );
      const bleedingSpec = bleedingBranch?.[1]?.flags?.fvttJsonGenerator?.bleeding;
      if (bleedingBranch && bleedingSpec) {
        const effect = this.createCustomEffect({
          name: '流血 Bleeding',
          img: statusIconPath('bleeding'),
          statuses: [projectedConditionStatusId('bleeding')],
          showIcon: 2,
          description: bleedingSpec.endCondition,
          flags: buildBleedingFlag(bleedingSpec),
        });
        item.effects.push(effect);
        bleedingBranch[1].effects = [{ _id: effect._id }];
      }
      return;
    }

    if (this.isDeathTriggeredSaveTrait(action)) {
      item.effects = (item.effects ?? []).filter((effect: any) => (effect?.statuses ?? []).includes('poisoned'));
      const saveActivities = activityEntries
        .map(([, activity]) => activity)
        .filter((activity) => activity?.type === 'save');
      const refs = (item.effects ?? []).map((effect: any) => ({ _id: effect._id }));

      if (saveActivities[0]) {
        saveActivities[0].effects = refs;
      }
      for (const activity of saveActivities.slice(1)) {
        activity.effects = [];
      }
    }

    const thresholdStatuses = this.extractThresholdEffects(action.desc ?? '')
      .flatMap((entry) => Array.isArray(entry.statuses) ? entry.statuses : [])
      .filter((status): status is string => typeof status === 'string');
    if (thresholdStatuses.length > 0) {
      // Threshold metadata keeps semantic IDs for source fidelity. Generated
      // effects use projected IDs, so compare both forms when deduplicating.
      const thresholdStatusIds = new Set(thresholdStatuses.flatMap((status) =>
        isConditionId(status) ? [status, projectedConditionStatusId(status)] : [status],
      ));
      item.effects = (item.effects ?? []).filter((effect: any) => {
        const statuses = effect?.statuses ?? [];
        return !statuses.some((status: string) => thresholdStatusIds.has(status));
      });

      for (const [, activity] of activityEntries) {
        activity.effects = (activity.effects ?? []).filter((ref: any) => {
          const effect = (item.effects ?? []).find((candidate: any) => candidate._id === ref?._id);
          if (!effect) {
            return false;
          }
          const statuses = effect?.statuses ?? [];
          return !statuses.some((status: string) => thresholdStatusIds.has(status));
        });
      }
    }
  }

  private appendCompoundRiderActivities(item: any, action: GeneratedActionData): void {
    const activities = item?.system?.activities;
    if (!activities || typeof activities !== 'object') {
      return;
    }

    const extraction = extractCompoundRiderMechanics(String(action.desc ?? ''), {
      baseDamage: action.attack?.damage?.[0],
    });
    if (extraction.riders.length === 0) {
      return;
    }

    const existingRiders = Object.values(activities).filter((activity: any) =>
      activity?.flags?.fvttJsonGenerator?.compoundRider,
    );
    if (existingRiders.length > 0) {
      return;
    }

    for (const segment of extraction.riders) {
      const damage = segment.damage;
      const save = segment.save ? { dc: segment.save.dc, ability: segment.save.ability } : undefined;
      const effect = this.createSegmentEffect(segment.text);
      const metadata = segment.metadata;

      if (!save && damage.length === 0 && segment.outcomes.length === 0) {
        continue;
      }

      const generated = this.activityGenerator.generate({
        name: segment.name,
        englishName: segment.englishName,
        type: save ? 'save' : 'utility',
        desc: segment.text,
        ...(save ? { save } : {}),
        ...(damage.length > 0 ? { damage } : {}),
      });

      for (const activity of Object.values(generated) as any[]) {
        if (extraction.dailyUsePerRider) {
          activity.uses = this.createDailyUses(1);
        }
        activity.flags = {
          ...(activity.flags ?? {}),
          fvttJsonGenerator: {
            ...(activity.flags?.fvttJsonGenerator ?? {}),
            compoundRider: segment.key,
            ...(extraction.bloodiedTargetSaveDisadvantage ? { bloodiedTargetSaveDisadvantage: true } : {}),
            fieldEvidence: {
              segment: segment.evidence,
              ...(segment.save ? { save: segment.save.evidence } : {}),
            },
            ...metadata,
          },
        };
        ActivityGenerator.mergeUnique(activities, { [activity._id]: activity });
      }

      if (effect) {
        item.effects = item.effects ?? [];
        item.effects.push(effect);
        const targetActivity = Object.values(generated)[0] as any;
        targetActivity.effects = [{ _id: effect._id }];
      }

      const primaryActivity = Object.values(generated)[0] as any;
      if (primaryActivity && segment.outcomes.length > 0) {
        const outcomeActivityIds = this.appendHitDiceOutcomeActivities(activities, segment);
        const spec = buildHitDiceOutcomeAutomationSpec(segment, {
          primaryActivityId: primaryActivity._id,
          ...outcomeActivityIds,
        });

        primaryActivity.midiProperties = {
          ...(primaryActivity.midiProperties ?? {}),
          identifier: `hit-dice-outcome-${segment.key}-primary`,
          otherActivityCompatible: true,
        };
        primaryActivity.macroData = {
          ...(primaryActivity.macroData ?? {}),
          name: 'Hit Dice Outcome',
          command: buildHitDiceOutcomeMacroCommand(spec),
        };
        primaryActivity.flags = {
          ...(primaryActivity.flags ?? {}),
          fvttJsonGenerator: {
            ...(primaryActivity.flags?.fvttJsonGenerator ?? {}),
            hitDiceOutcome: spec,
            outcomes: segment.outcomes,
          },
        };

        item.flags = {
          ...(item.flags ?? {}),
          fvttJsonGenerator: {
            ...(item.flags?.fvttJsonGenerator ?? {}),
            hitDiceOutcome: {
              specs: [...(item.flags?.fvttJsonGenerator?.hitDiceOutcome?.specs ?? []), spec],
            },
          },
        };
      }
    }
  }

  private appendHitDiceOutcomeActivities(
    activities: Record<string, any>,
    segment: ExtractedRider,
  ): Omit<HitDiceOutcomeActivityIds, 'primaryActivityId'> {
    const activityIds: Omit<HitDiceOutcomeActivityIds, 'primaryActivityId'> = {};
    const hitDiceChange = segment.outcomes.find((outcome) => outcome.kind === 'hitDiceChange');
    if (hitDiceChange) {
      const activity = this.createHitDiceOutcomeUtilityActivity(
        hitDiceChange.direction === 'gain' ? 'Gain Hit Die' : 'Lose Hit Die',
        segment,
        hitDiceChange,
      );
      ActivityGenerator.mergeUnique(activities, { [activity._id]: activity });
      activityIds.loseHitDieActivityId = activity._id;
    }

    const tempHp = segment.outcomes.find((outcome) => outcome.kind === 'tempHp');
    if (tempHp) {
      const activity = this.createHitDiceOutcomeTempHpActivity(segment, tempHp);
      ActivityGenerator.mergeUnique(activities, { [activity._id]: activity });
      activityIds.tempHpActivityId = activity._id;
    }

    const followupSave = segment.outcomes.find((outcome) => outcome.kind === 'followupSave');
    if (followupSave) {
      const activity = this.createHitDiceOutcomeUtilityActivity(`${followupSave.label} Save`, segment, followupSave);
      ActivityGenerator.mergeUnique(activities, { [activity._id]: activity });
      activityIds.followupSaveActivityId = activity._id;
    }

    return activityIds;
  }

  private createHitDiceOutcomeUtilityActivity(
    name: string,
    segment: ExtractedRider,
    outcome: HitDiceOutcome,
  ): any {
    const id = createStableDocumentId({
      path: 'hitDiceOutcome',
      segment: segment.key,
      name,
      outcome,
    });
    return {
      _id: id,
      name,
      type: 'utility',
      activation: {
        type: 'special',
        value: null,
        override: false,
      },
      consumption: {
        scaling: { allowed: false, max: '' },
        spellSlot: false,
        targets: [],
      },
      duration: {
        units: 'inst',
        concentration: false,
        override: false,
      },
      range: { override: false },
      target: this.buildHitDiceOutcomeTarget(outcome),
      uses: { spent: 0, recovery: [], max: '' },
      midiProperties: {
        identifier: `hit-dice-outcome-${segment.key}-${outcome.kind}`,
        automationOnly: true,
        otherActivityCompatible: true,
      },
      flags: this.buildHitDiceOutcomeActivityFlags(segment, outcome),
    };
  }

  private createHitDiceOutcomeTempHpActivity(
    segment: ExtractedRider,
    outcome: Extract<HitDiceOutcome, { kind: 'tempHp' }>,
  ): any {
    const id = createStableDocumentId({
      path: 'hitDiceOutcome/tempHp',
      segment: segment.key,
      outcome,
    });
    return {
      _id: id,
      name: 'Gain Temporary HP',
      type: 'heal',
      activation: {
        type: 'special',
        value: null,
        override: false,
      },
      consumption: {
        scaling: { allowed: false, max: '' },
        spellSlot: false,
        targets: [],
      },
      duration: {
        units: 'inst',
        concentration: false,
        override: false,
      },
      range: { units: 'self', special: '', override: false },
      target: {
        template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: '' },
        affects: { count: '', type: 'self', choice: false, special: '' },
        prompt: true,
        override: false,
      },
      healing: {
        number: null,
        denomination: null,
        bonus: String(outcome.amount),
        types: ['temphp'],
        custom: { enabled: false, formula: '' },
        scaling: { mode: 'whole', number: 1, formula: '' },
      },
      uses: { spent: 0, recovery: [], max: '' },
      midiProperties: {
        identifier: `hit-dice-outcome-${segment.key}-temp-hp`,
        automationOnly: true,
        otherActivityCompatible: true,
      },
      flags: this.buildHitDiceOutcomeActivityFlags(segment, outcome),
    };
  }

  private buildHitDiceOutcomeTarget(outcome: HitDiceOutcome): Record<string, unknown> {
    const targetType = outcome.target === 'self' ? 'self' : '';
    return {
      template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: '' },
      affects: { count: '', type: targetType, choice: false, special: '' },
      prompt: true,
      override: false,
    };
  }

  private buildHitDiceOutcomeActivityFlags(segment: ExtractedRider, outcome: HitDiceOutcome): Record<string, unknown> {
    return {
      fvttJsonGenerator: {
        compoundRider: segment.key,
        hitDiceOutcomeActivity: {
          kind: outcome.kind,
          evidence: outcome.evidence,
        },
        fieldEvidence: {
          segment: segment.evidence,
          outcome: outcome.evidence,
        },
      },
    };
  }

  private createSegmentEffect(text: string): any | null {
    if (/(?:中毒|Poisoned)/i.test(text)) {
      return this.createCustomEffect({
        name: '中毒 Poisoned',
        statuses: ['poisoned'],
        img: statusIconPath('poisoned'),
      });
    }

    if (/(?:流血|Bleeding|Bleed)/i.test(text)) {
      const bleedingSpec = extractBleedingSpec(text);
      return this.createCustomEffect({
        name: '流血 Bleeding',
        statuses: [projectedConditionStatusId('bleeding')],
        img: statusIconPath('bleeding'),
        showIcon: 2,
        ...(bleedingSpec ? {
          description: bleedingSpec.endCondition,
          flags: buildBleedingFlag(bleedingSpec),
        } : {}),
      });
    }

    return null;
  }

  private applyParsedAcEffect(item: any, action: GeneratedActionData): void {
    const activities = Object.values(item?.system?.activities ?? {}) as any[];
    if (activities.length === 0) {
      return;
    }

    const sourceText = action.desc ?? '';
    const parsed = extractSourceDerivedAcEffect(sourceText);
    if (!parsed) {
      return;
    }
    const duration = this.extractEffectDuration(sourceText);

    const existing = (item.effects ?? []).find((effect: any) =>
      effect?.flags?.fvttJsonGenerator?.sourceDerivedAcEffect,
    );
    if (existing) {
      return;
    }

    const effect = this.createCustomEffect({
      name: displayName(action.name, action.englishName),
      img: parsed.kind === 'flat'
        ? 'systems/dnd5e/icons/svg/statuses/downgrade.svg'
        : 'systems/dnd5e/icons/svg/statuses/shield.svg',
      changes: [
        {
          key: parsed.kind === 'flat'
            ? 'system.attributes.ac.flat'
            : this.isV14() ? 'system.attributes.ac.formula' : 'system.attributes.ac.bonus',
          mode: parsed.kind === 'flat' ? 5 : 2,
          value: String(parsed.value),
          priority: null,
        },
      ],
      ...(duration ? { duration } : {}),
      flags: {
        fvttJsonGenerator: {
          sourceDerivedAcEffect: true,
          sourceText: parsed.sourceText,
        },
      },
    });

    item.effects = [...(item.effects ?? []), effect];
    const firstActivity = activities[0];
    firstActivity.effects = [...(firstActivity.effects ?? []), { _id: effect._id }];
  }

  private extractEffectDuration(text: string): Record<string, unknown> | undefined {
    if (/直到其?下一回合开始|until (?:the )?(?:start of|beginning of) (?:its|their|your) next turn/i.test(text)) {
      return {
        startTime: null,
        seconds: null,
        combat: null,
        rounds: 1,
        turns: 0,
        startRound: null,
        startTurn: null,
      };
    }

    if (/直到其?下一回合结束|until (?:the )?end of (?:its|their|your) next turn/i.test(text)) {
      return {
        startTime: null,
        seconds: null,
        combat: null,
        rounds: 1,
        turns: 1,
        startRound: null,
        startTurn: null,
      };
    }

    const rounds = text.match(/(?:持续\s*)?(\d+)\s*(?:轮|rounds?)/i)?.[1];
    if (rounds) {
      return {
        startTime: null,
        seconds: null,
        combat: null,
        rounds: Number.parseInt(rounds, 10),
        turns: 0,
        startRound: null,
        startTurn: null,
      };
    }

    return undefined;
  }

  private extractDelimitedSegment(text: string, startPattern: RegExp, endPatterns: RegExp[]): string {
    return extractDelimitedSegment(text, startPattern, endPatterns);
  }

  private createCustomEffect(options: {
    name: string;
    img: string;
    statuses?: string[];
    changes?: Array<Record<string, unknown>>;
    duration?: Record<string, unknown>;
    description?: string;
    showIcon?: number;
    flags?: Record<string, unknown>;
  }): any {
    const effect = createCustomEffectExt(options);
    effect._stats = {
      coreVersion: this.targetStats().coreVersion,
      systemId: this.targetStats().systemId,
      systemVersion: this.targetStats().systemVersion,
      createdTime: null,
      modifiedTime: null,
    };
    return effect;
  }

  private createRandomId(): string {
    return createRandomIdExt();
  }

  private hasSwallowLikeText(action: GeneratedActionData): boolean {
    return hasSwallowLikeTextExt(action);
  }

  private isDeathTriggeredSaveTrait(action: GeneratedActionData): boolean {
    return isDeathTriggeredSaveTraitExt(action);
  }

  private isStatusRemovalUtility(action: GeneratedActionData): boolean {
    return isStatusRemovalUtilityExt(action);
  }

  private extractSwallowDamage(action: GeneratedActionData): Damage | undefined {
    return extractSwallowDamageExt(action);
  }

  private generateConditionEffects(desc: string, activities: any, actionName?: string): any[] {
    return generateConditionEffects(desc, activities, actionName);
  }

  private generateEnhancedConditionEffects(desc: string, activities: any, actionName?: string): any[] {
    return generateEnhancedConditionEffects(desc, activities, actionName, undefined, this.isV14());
  }

  private applyActivityMetadata(
    activities: Record<string, any>,
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    condition: string,
    uses?: Record<string, any> | null,
    activationValue: number | null = null,
  ): void {
    if (!activities || typeof activities !== 'object') {
      return;
    }

    const orderedActivities = Object.values(activities);
    for (const [index, activity] of orderedActivities.entries()) {
      if (!activity || typeof activity !== 'object') {
        continue;
      }
      if (activity.flags?.fvttJsonGenerator?.hitDiceOutcomeActivity) {
        continue;
      }

      activity.activation = {
        type: activationType,
        value: activationValue,
        override: false,
        condition,
      };

      if (uses && index === 0 && !activity.consumption) {
        activity.consumption = {
          scaling: { allowed: false, max: '' },
          spellSlot: false,
          targets: [
            {
              type: 'itemUses',
              value: '1',
              target: '',
              scaling: { mode: '', formula: '' },
            },
          ],
        };
      }
    }
  }

  private resolveActivationType(
    action: ActionData,
    fallback: 'action' | 'bonus' | 'reaction' | 'lair' | '',
  ): 'action' | 'bonus' | 'reaction' | 'lair' | '' {
    return resolveActivationTypeExt(action, fallback);
  }

  private parseLocalizedAttackLine(line: string): ActionData | null {
    return parseLocalizedAttackLine(line, this.splitHeadlineAndBody.bind(this));
  }

  private splitBilingualName(raw: string): { name: string; englishName?: string } {
    return splitBilingualName(raw);
  }

  private extractDamagePartsFromText(text: string): Damage[] {
    return extractDamagePartsFromText(text);
  }

  private extractPrimaryDamagePartsFromText(text: string): Damage[] {
    return extractPrimaryDamagePartsFromText(text);
  }

  private parseAttackRange(range: string | undefined): [number | null, number | null] {
    const match = range?.match(/(\d+)(?:\s*\/\s*(\d+))?/);
    if (!match?.[1]) {
      return [null, null];
    }

    return [
      Number.parseInt(match[1], 10),
      match[2] ? Number.parseInt(match[2], 10) : null,
    ];
  }

  private parseNumericDistance(value: string | undefined): number | null {
    const match = value?.match(/(\d+)/);
    return match?.[1] ? Number.parseInt(match[1], 10) : null;
  }

  private extractSavingThrowFromText(text: string): ActionData['save'] | undefined {
    return extractSavingThrowFromText(text);
  }

  private extractSavingThrowsWithInheritedDcFromText(text: string): Array<NonNullable<ActionData['save']>> {
    return extractSavingThrowsWithInheritedDcFromText(text);
  }

  private extractSavingThrowsFromText(text: string): Array<NonNullable<ActionData['save']>> {
    return extractSavingThrowsFromText(text);
  }

  private parseActionLine(line: string): GeneratedActionData | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = this.normalizeActionHeaderDelimiter(trimmed);
    const candidate = normalized !== trimmed ? normalized : trimmed;
    const headlineSplit =
      /[\r\n]/.test(candidate) || /[\u4e00-\u9fff]/.test(candidate)
        ? this.splitHeadlineAndBody(candidate)
        : null;
    const parsingCandidate = headlineSplit
      ? `${headlineSplit.header}: ${headlineSplit.body.replace(/\n+/g, ' ')}`
      : candidate;

    const directAttack = this.parseLocalizedAttackLine(parsingCandidate);
    if (directAttack) {
      if (headlineSplit?.body) {
        directAttack.desc = headlineSplit.body;
      }
      return this.enrichGeneratedAction(directAttack, trimmed);
    }

    const englishFirst = this.prefersEnglishParser(parsingCandidate);
    const primary = englishFirst ? this.englishActionParser.parse(parsingCandidate) : this.actionParser.parse(parsingCandidate);
    if (primary) {
      if (headlineSplit?.body) {
        primary.desc = headlineSplit.body;
      }
      this.upgradeExplicitSaveAction(primary);
      return this.enrichGeneratedAction(primary, trimmed);
    }

    const secondary = englishFirst ? this.actionParser.parse(parsingCandidate) : this.englishActionParser.parse(parsingCandidate);
    if (secondary) {
      if (headlineSplit?.body) {
        secondary.desc = headlineSplit.body;
      }
      this.upgradeExplicitSaveAction(secondary);
      return this.enrichGeneratedAction(secondary, trimmed);
    }

    const split =
      (headlineSplit ? [headlineSplit.raw, headlineSplit.header, headlineSplit.body] : null) ??
      normalized.match(/^(.+?)\.\s+(.+)$/) ??
      normalized.match(/^(.+?):\s+(.+)$/) ??
      normalized.match(/^(.+?)[。.:：]\s*(.+)$/);
    if (split?.[1] && split[2]) {
      const desc = split[2].trim();
      const save = this.extractSavingThrowFromText(desc);
      if (save) {
        return this.enrichGeneratedAction({
          name: split[1].trim(),
          type: 'save',
          desc,
          save,
        }, trimmed);
      }

      return this.enrichGeneratedAction({
        name: split[1].trim(),
        type: 'utility',
        desc,
      }, trimmed);
    }

    return this.enrichGeneratedAction({
      name: trimmed,
      type: 'utility',
      desc: trimmed,
    }, trimmed);
  }

  private upgradeExplicitSaveAction(action: ActionData): void {
    if ((action.type === 'attack' || action.save) || !action.desc) {
      return;
    }

    const save = this.extractSavingThrowFromText(action.desc);
    if (!save) {
      return;
    }

    action.type = 'save';
    action.save = save;
  }

  private splitHeadlineAndBody(text: string): { raw: string; header: string; body: string } | null {
    const normalized = text.replace(/\r\n/g, '\n');
    const [firstLine, ...restLines] = normalized.split('\n');
    const first = firstLine?.trim() ?? '';
    if (!first) {
      return null;
    }

    const match =
      first.match(/^(.+?\))[\u3002\uFF1A.:]\s*(.*)$/) ??
      first.match(/^([^.\u3002:\uFF1A]+)[\u3002\uFF1A.:]\s*(.*)$/);
    if (!match?.[1]) {
      return null;
    }

    const body = [match[2]?.trim() ?? '', restLines.join('\n').trim()]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!body) {
      return null;
    }

    return {
      raw: match[0],
      header: match[1].trim(),
      body,
    };
  }

  private enrichGeneratedAction(action: ActionData, rawLine: string): GeneratedActionData {
    const derived = { ...action } as GeneratedActionData;
    // source-derived; schema-derived: dnd5e 5.3.3 UsesField supports a single sr/lr recharge.
    const rest = rawLine.match(/\(\s*Recharges?\s+after\s+(?:a\s+)?(Short\s+or\s+Long|Short|Long)\s+Rest\s*\)/i);
    if (rest?.[1]) {
      derived.restRecharge = /^short/i.test(rest[1]) ? 'sr' : 'lr';
      derived.desc = `${rest[0].replace(/\s+/g, ' ')}. ${derived.desc ?? ''}`;
    }
    const header = this.extractActionHeaderMetadata(derived.name, derived.englishName);

    derived.name = header.name;
    if (header.englishName !== undefined) {
      derived.englishName = header.englishName;
    }
    if (!derived.recharge && header.recharge) {
      derived.recharge = header.recharge;
    }
    if (header.legendaryCost !== undefined) {
      derived.legendaryCost = header.legendaryCost;
      derived.activationCost = header.legendaryCost;
    }
    if (derived.legendaryCost === undefined) {
      const fixedLegendaryCost = this.extractLegendaryCostFixed(rawLine);
      if (fixedLegendaryCost !== undefined) {
        derived.legendaryCost = fixedLegendaryCost;
      }
    }

    const usesPerLongRest = this.extractUsesPerLongRestFixed(
      `${derived.name} ${derived.englishName ?? ''} ${derived.desc ?? ''} ${rawLine}`,
    );
    if (usesPerLongRest !== undefined) {
      derived.usesPerLongRest = usesPerLongRest;
    }

    derived.requiresConcentration = this.extractRequiresConcentration(`${rawLine} ${derived.desc ?? ''}`);
    derived.targetCondition = this.extractTargetCondition(`${rawLine} ${derived.desc ?? ''}`);

    return derived;
  }

  private extractActionHeaderMetadata(
    name: string,
    englishName?: string,
  ): {
    name: string;
    englishName?: string;
    recharge?: ActionData['recharge'];
    legendaryCost?: number;
  } {
    const out: {
      name: string;
      englishName?: string;
      recharge?: ActionData['recharge'];
      legendaryCost?: number;
    } = {
      name: name.trim(),
      ...(englishName !== undefined ? { englishName } : {}),
    };

    const applyQualifier = (segment: string) => {
      const normalized = segment.replace(/\s+/g, ' ').trim();
      const rechargeMatch = normalized.match(/(?:^|[\s/])(?:充能|Recharge)\s*(\d+)(?:\s*[–-]\s*\d+)?$/i);
      if (rechargeMatch?.[1]) {
        out.recharge = {
          value: Number.parseInt(rechargeMatch[1], 10),
          charged: true,
        };
      }

      const costMatch =
        normalized.match(/(?:^|[\s/])(?:消耗|Cost(?:s)?)(?:\s+Actions?)?\s*(\d+)$/i) ??
        normalized.match(/Costs?\s*(\d+)\s*Actions?/i);
      if (costMatch?.[1]) {
        out.legendaryCost = Number.parseInt(costMatch[1], 10);
      }
    };

    const applyQualifierFixed = (segment: string) => {
      const normalized = segment.replace(/\s+/g, ' ').trim();
      const rechargeMatch = normalized.match(/(?:^|[\s/])(?:\u5145\u80fd|Recharge)\s*(\d+)(?:\s*[-\u2013\u2014\u2015\u2212~]\s*\d+)?$/i);
      if (rechargeMatch?.[1]) {
        out.recharge = {
          value: Number.parseInt(rechargeMatch[1], 10),
          charged: true,
        };
      }

      const costMatch =
        normalized.match(/(?:^|[\s/])(?:\u6d88\u8017|Cost(?:s)?)(?:\s+Actions?)?\s*(\d+)$/i) ??
        normalized.match(/Costs?\s*(\d+)\s*Actions?/i);
      if (costMatch?.[1]) {
        out.legendaryCost = Number.parseInt(costMatch[1], 10);
      }
    };

    const bilingual = out.name.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (bilingual?.[1] && bilingual[2] && /\p{Script=Han}/u.test(bilingual[1])) {
      const chineseName = bilingual[1].trim();
      const segments = bilingual[2]
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);

      let extractedEnglish = out.englishName;
      const qualifiers: string[] = [];
      for (const segment of segments) {
        if (!extractedEnglish && /[A-Za-z]/.test(segment) && !/(?:cost|recharge|bloodied|free action|level spell)/i.test(segment)) {
          extractedEnglish = segment;
          continue;
        }
        qualifiers.push(segment);
      }

      for (const qualifier of qualifiers) {
        applyQualifier(qualifier);
        applyQualifierFixed(qualifier);
      }

      out.name = chineseName;
      if (extractedEnglish) {
        out.englishName = extractedEnglish;
      } else {
        delete out.englishName;
      }

      return out;
    }

    applyQualifier(out.name);
    out.name = out.name
      .replace(/[\[(]\s*Recharge\s*\d+(?:\s*[–-]\s*\d+)?\s*[\])]/gi, '')
      .replace(/[\[(]\s*充能\s*\d+(?:\s*[–-]\s*\d+)?\s*[\])]/g, '')
      .replace(/[\[(]\s*Costs?\s*\d+\s*Actions?\s*[\])]/gi, '')
      .replace(/[\[(]\s*(?:消耗|Cost(?:s)?)\s*\d+(?:\s*\/\s*Cost\s*\d+)?\s*[\])]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[，,]\s*$/g, '');
    return out;
  }

  private extractUsesPerLongRest(text: string): number | undefined {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const dailyMatch =
      normalized.match(/每日\s*(\d+)\s*次/) ??
      normalized.match(/(\d+)\s*次\s*\/\s*日/) ??
      normalized.match(/\[(\d+)\s*\/\s*(?:日|Day)\]/i) ??
      normalized.match(/\b(\d+)\s*\/\s*day\b/i);
    if (!dailyMatch?.[1]) {
      return undefined;
    }

    return Number.parseInt(dailyMatch[1], 10);
  }

  private normalizeActionHeaderDelimiter(line: string): string {
    if (!/[\u4e00-\u9fff]/.test(line)) {
      return line;
    }

    const match = line.match(/^(.+?[\)])\s*[。.:：]\s*(\S.*)$/);
    if (!match?.[1] || !match[2]) {
      return line;
    }

    const [, namePart, bodyPart] = match;
    return `${namePart.trim()}: ${bodyPart.trim()}`;
  }

  private prefersEnglishParser(line: string): boolean {
    const hasLatin = /[A-Za-z]/.test(line);
    if (!hasLatin) {
      return false;
    }

    const hasCjk = /[\u4e00-\u9fff]/.test(line);
    if (!hasCjk) {
      return true;
    }

    return /(weapon attack|saving throw|recharge|costs?\s+\d+\s+actions?|\+\d+\s+to\s+hit)/i.test(line);
  }

  private formatSignedBonus(value: number): string {
    if (!Number.isFinite(value) || value === 0) {
      return '';
    }

    return value > 0 ? `+${value}` : `${value}`;
  }

  private computeExpectedPassive(actor: any, skillKey: string): number {
    const skill = actor.system?.skills?.[skillKey];
    if (!skill) {
      return 10;
    }

    const abilityKey = skill.ability || SKILL_ABILITIES[skillKey] || 'wis';
    const abilityScore = Number(actor.system?.abilities?.[abilityKey]?.value ?? 10);
    const baseMod = Math.floor((abilityScore - 10) / 2);
    // schema-derived: dnd5e NPC prepares proficiency from max(CR, level, 1).
    // It is derived data and may be absent from an exported source document.
    const derivedProf = Math.floor((Math.max(Number(actor.system?.details?.cr ?? 0), Number(actor.system?.details?.level ?? 0), 1) + 7) / 4);
    const profBonus = Number(actor.system?.attributes?.prof ?? derivedProf);
    const skillValue = Number(skill.value ?? 0);
    const checkBonus = this.parseSignedBonus(skill.bonuses?.check);

    return 10 + baseMod + skillValue * profBonus + checkBonus;
  }

  private parseSignedBonus(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== 'string') {
      return 0;
    }

    const match = value.trim().match(/^([+-]?\d+)$/);
    return match?.[1] ? Number.parseInt(match[1], 10) : 0;
  }

  private setResourceCounter(resource: any, value: number, max: number): void {
    if (!resource || typeof resource !== 'object') return;
    if (this.isV14()) {
      delete resource.value;
      resource.max = max;
      resource.spent = Math.max(0, max - value);
      return;
    }
    resource.value = value;
    resource.max = max;
  }

  private shouldDeriveLegendaryActions(resource: any): boolean {
    if (!resource || typeof resource !== 'object') return true;
    if (this.isV14()) {
      return !resource.max || resource.spent === undefined;
    }
    return !resource.max || !resource.value;
  }

  private buildSenses(senses: NonNullable<ParsedNPC['traits']>['senses']): Record<string, unknown> {
    if (this.isV14()) {
      return {
        ranges: {
          darkvision: senses?.darkvision ?? 0,
          blindsight: senses?.blindsight ?? 0,
          tremorsense: senses?.tremorsense ?? 0,
          truesight: senses?.truesight ?? 0,
        },
        special: senses?.special || '',
        units: 'ft',
      };
    }

    return {
      darkvision: senses?.darkvision ?? 0,
      blindsight: senses?.blindsight ?? 0,
      tremorsense: senses?.tremorsense ?? 0,
      truesight: senses?.truesight ?? 0,
      special: senses?.special || '',
      units: 'ft',
    };
  }

  private emptySenses(): Record<string, unknown> {
    if (this.isV14()) {
      return {
        ranges: {
          darkvision: 0,
          blindsight: 0,
          tremorsense: 0,
          truesight: 0,
        },
        special: '',
      };
    }

    return {
      darkvision: null,
      blindsight: null,
      tremorsense: null,
      truesight: null,
      special: '',
    };
  }

  private targetStats(): ReturnType<typeof getFoundryTarget>['stats'] {
    return getFoundryTarget(this.fvttVersion).stats;
  }

  private isV14(): boolean {
    return this.fvttVersion === '14';
  }

  private createBaseActor() {
    // Minimal fallback if no GM
    return {
      name: 'New NPC',
      type: 'npc',
      system: {
        abilities: { str: { value: 10 }, dex: { value: 10 }, con: { value: 10 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } },
        attributes: { hp: { value: 10, max: 10 }, ac: { flat: 10, calc: 'flat' }, movement: {}, init: { bonus: 0 } },
        details: { cr: 0, xp: { value: 0 }, biography: { value: '' } },
        traits: { dr: { value: [] }, di: { value: [] }, ci: { value: [] }, languages: { value: [] }, senses: {} },
        skills: { ste: { value: 0 }, prc: { value: 0 } } // Mock common skills
      },
      items: []
    };
  }
}
