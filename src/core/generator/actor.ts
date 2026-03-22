import { existsSync, readFileSync } from 'node:fs';
import { ActionParser } from '../parser/action';
import type { ActionData, Damage } from '../parser/action';
import { EnglishActionParser } from '../parser/englishAction';
import type { ParserRoute } from '../parser/types';
import {
  FileTranslationCache,
  OpenAICompatibleTranslator,
  TranslationService,
  createTranslationConfigFromEnv,
} from '../translation';
import type { TranslationContext } from '../translation';
import { ActivityGenerator } from './activity';
import type { ParsedNPC } from '../../config/mapping';
import { spellsMapper } from '../mapper/spells';
import { i18n } from '../mapper/i18n';
import { EffectProfileApplier, type EffectProfile } from './effectProfileApplier';
import {
  buildHeavyHitAutomationSpec,
  buildHeavyHitMacroCommand,
} from './heavyHitAutomation';

interface TranslationServiceLike {
  translate(text: string, context?: TranslationContext): Promise<{ text: string } | string>;
}

interface ActorGeneratorOptions {
  translationService?: TranslationServiceLike | null;
  fvttVersion?: '12' | '13';
  effectProfile?: EffectProfile;
}

interface GenerateOptions {
  resetDefaults?: boolean;
  spellcastingMode?: 'legacy' | 'description';
  route?: ParserRoute;
}

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  usesPerLongRest?: number;
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
  龙: 'dragon',
  元素: 'elemental',
  精类: 'fey',
  邪魔: 'fiend',
  巨人: 'giant',
  类人生物: 'humanoid',
  怪物: 'monstrosity',
  软泥怪: 'ooze',
  植物: 'plant',
  亡灵: 'undead',
};

const LOCAL_NAME_TRANSLATIONS: Record<string, string> = {
  'adult red dragon': '成年红龙',
  bite: '啮咬',
  dagger: '匕首',
  claw: '爪击',
  tail: '尾击',
  'tail attack': '尾击',
  multiattack: '多重攻击',
  'frightful presence': '骇人威仪',
  'fire breath': '火焰吐息',
  detect: '侦测',
  'wing attack': '振翅',
  spellcasting: '施法',
};

const LOCAL_DESCRIPTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Melee or Ranged Weapon Attack/gi, '近战或远程武器攻击'],
  [/Melee Weapon Attack/gi, '近战武器攻击'],
  [/Ranged Weapon Attack/gi, '远程武器攻击'],
  [/Hit:/gi, '命中：'],
  [/to hit/gi, '命中'],
  [/reach/gi, '触及'],
  [/range/gi, '射程'],
  [/one target/gi, '一个目标'],
  [/piercing damage/gi, '穿刺伤害'],
  [/slashing damage/gi, '挥砍伤害'],
  [/bludgeoning damage/gi, '钝击伤害'],
  [/fire damage/gi, '火焰伤害'],
  [/plus/gi, '外加'],
  [/Dexterity saving throw/gi, '敏捷豁免检定'],
  [/Constitution saving throw/gi, '体质豁免检定'],
  [/Wisdom saving throw/gi, '感知豁免检定'],
  [/Charisma saving throw/gi, '魅力豁免检定'],
  [/half as much damage/gi, '伤害减半'],
  [/The dragon makes/gi, '该龙进行'],
  [/Wisdom \(Perception\) check/gi, '感知（察觉）检定'],
];

const SPELLCASTING_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bspellcasting ability\b/gi, '施法属性spellcasting ability'],
  [/\bspell save DC\b/gi, '法术豁免DCspell save DC'],
  [/\bspell attacks?\b/gi, '法术攻击spell attack'],
  [/\bspellcaster\b/gi, '施法者spellcaster'],
  [/^Spellcasting\b/i, '施法Spellcasting'],
  [/\bCantrips\b/gi, '戏法Cantrips'],
  [/\bat will\b/gi, '随意at will'],
  [/\bslots\b/gi, '法术位slots'],
];

export class ActorGenerator {
  private actionParser = new ActionParser();
  private englishActionParser = new EnglishActionParser();
  private activityGenerator = new ActivityGenerator();
  private goldenMaster: any;
  private translationService?: TranslationServiceLike;
  private fvttVersion: '12' | '13';
  private effectProfile: EffectProfile;
  private route: ParserRoute = 'chinese';
  private effectProfileApplier = new EffectProfileApplier();

  constructor(options: ActorGeneratorOptions = {}) {
    this.translationService =
      options.translationService === undefined
        ? this.createDefaultTranslationService()
        : options.translationService ?? undefined;
    this.fvttVersion = options.fvttVersion ?? '12';
    this.effectProfile = options.effectProfile ?? 'core';
    this.loadGoldenMaster();
  }

  public async generateForRoute(parsed: ParsedNPC, route: ParserRoute): Promise<any> {
    const actor = this.generate(parsed, {
      resetDefaults: route === 'english',
      spellcastingMode: route === 'english' ? 'description' : 'legacy',
      route,
    });
    if (route !== 'english') {
      return actor;
    }

    return this.localizeEnglishActor(actor);
  }

  private loadGoldenMaster() {
    try {
      const path = 'data/golden-master.json';
      if (existsSync(path)) {
        this.goldenMaster = JSON.parse(readFileSync(path, 'utf-8'));
      }
    } catch {
      console.warn('Warning: Golden Master not loaded');
    }
  }

  public generate(parsed: ParsedNPC, options: GenerateOptions = {}): any {
    this.route = options.route ?? 'chinese';
    // Clone Base
    const actor = this.goldenMaster 
      ? JSON.parse(JSON.stringify(this.goldenMaster)) 
      : this.createBaseActor();

    this.resetTokenDefaults(actor);

    this.resetActorDefaults(actor);

    // Patch Core Fields
    actor.name = parsed.name || actor.name;
    if (actor.prototypeToken && typeof actor.prototypeToken === 'object') {
      actor.prototypeToken.name = actor.name;
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
        actor.system.resources.legact.value = parsed.attributes.legact.value;
        actor.system.resources.legact.max = parsed.attributes.legact.max;
      }
    }

    if ((!actor.system.resources.legact?.max || !actor.system.resources.legact?.value) && Array.isArray(parsed.legendary_actions)) {
      const legendaryCount = this.extractLegendaryActionCountFromLines(parsed.legendary_actions);
      if (legendaryCount) {
        actor.system.resources.legact.value = legendaryCount;
        actor.system.resources.legact.max = legendaryCount;
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
      actor.system.traits.dv = { value: parsed.traits.dv || [], custom: '', bypasses };
      if (parsed.traits.dm) actor.system.traits.dm = parsed.traits.dm;
      actor.system.traits.languages = { value: (parsed.traits.languages || []).map((lang: string) => LANGUAGE_CODE_MAP[lang] || lang).filter((lang: string) => lang !== ''), custom: '' };
      
      if (parsed.traits.senses) {
        actor.system.attributes.senses = {
          darkvision: parsed.traits.senses.darkvision ?? 0,
          blindsight: parsed.traits.senses.blindsight ?? 0,
          tremorsense: parsed.traits.senses.tremorsense ?? 0,
          truesight: parsed.traits.senses.truesight ?? 0,
          special: parsed.traits.senses.special || "",
          units: "ft"
        };
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

    const extracted = this.extractInlineFeatureLinesFromBiography(actor.system?.details?.biography?.value);
    actor.system.details.biography.value = this.formatStructuredHtml(extracted.biography);
    this.appendActionItems(newItems, extracted.features, 'passive');

    this.appendActionItems(newItems, parsed.actions, 'action');
    this.appendActionItems(newItems, parsed.bonus_actions, 'bonus');
    this.appendActionItems(newItems, parsed.reactions, 'reaction');
    this.appendActionItems(newItems, parsed.legendary_actions, 'legendary');
    this.appendActionItems(newItems, parsed.lair_actions, 'lair');

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
    if (parsed.spellcasting) {
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
    this.effectProfileApplier.apply(actor, this.effectProfile);

    this.applyTokenSize(actor);

    return actor;
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

  private extractSpellNames(spellcasting: ParsedNPC['spellcasting']): string[] {
    const entries: string[] = [];
    if (Array.isArray(spellcasting)) {
      entries.push(...spellcasting.filter((line): line is string => typeof line === 'string'));
    } else if (spellcasting && typeof spellcasting === 'object') {
      entries.push(...Object.keys(spellcasting));
    }

    const names: string[] = [];
    for (const entry of entries) {
      const cleaned = entry
        .replace(/<[^>]*>/g, '')
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .trim();

      if (!cleaned) {
        continue;
      }

      const split = cleaned.split(':');
      if (split.length > 1) {
        const list = split.slice(1).join(':');
        for (const rawName of list.split(',')) {
          const spellName = rawName.trim().replace(/[.;]$/g, '');
          if (spellName) {
            names.push(spellName);
          }
        }
        continue;
      }

      if (!/[.!?]/.test(cleaned) && cleaned.length <= 64) {
        names.push(cleaned.replace(/[.;]$/g, ''));
      }
    }

    return Array.from(new Set(names));
  }

  private resetActorDefaults(actor: any): void {
    this.resetTokenDefaults(actor);

    // Clean template pollution from golden-master.json
    // flags: remove all template flags (babele, mcdm-flee-mortals, exportSource etc.)
    actor.flags = {};
    // _stats: only keep core/system version info, remove user-specific fields
    actor._stats = {
      coreVersion: actor._stats?.coreVersion || '12.331',
      systemId: actor._stats?.systemId || 'dnd5e',
      systemVersion: actor._stats?.systemVersion || '4.3.9',
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
        resources.legact.value = 0;
        resources.legact.max = 0;
      }
      if (resources.legres && typeof resources.legres === 'object') {
        resources.legres.value = 0;
        resources.legres.max = 0;
      }
      if (resources.lair && typeof resources.lair === 'object') {
        resources.lair.value = false;
        resources.lair.initiative = null;
        resources.lair.inside = false;
      }
    }

    if (actor.system?.attributes) {
      actor.system.attributes.movement = {
        walk: null, fly: null, swim: null, climb: null, burrow: null, hover: false
      };
      actor.system.attributes.senses = {
        darkvision: null, blindsight: null, tremorsense: null, truesight: null, special: ''
      };
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
      const activities = isPassive
        ? this.activityGenerator.generate({
            name: actionData.name,
            englishName: actionData.englishName,
            type: 'utility',
            desc: actionData.desc,
          })
        : this.activityGenerator.generate(actionData);
      
      const item = this.createItemFromAction(actionData, activities, isPassive ? '' : activationType);
      items.push(item);
    }
  }

  private extractInlineFeatureLinesFromBiography(biography: unknown): { biography: string; features: string[] } {
    if (typeof biography !== 'string' || !biography.trim()) {
      return { biography: '', features: [] };
    }

    const lines = biography
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const features: string[] = [];
    const remaining: string[] = [];
    let currentFeature: string | null = null;

    const flushCurrentFeature = () => {
      if (!currentFeature) {
        return;
      }
      features.push(currentFeature);
      currentFeature = null;
    };

    const markdownFeaturePattern = /^\*{2,3}\s*([^*]+?)\s*\*{2,3}\s*[\u3002\uFF1A.:\s]+\s*(.+)$/;
    const plainFeaturePattern = /^([^\u3002\uFF1A:.]+(?:\s*\([^)]*\))?)\s*[\u3002\uFF1A:]\s*(.+)$/;

    for (const line of lines) {
      const normalized = line.replace(/^[-*+]\s*/, '').trim();

      const markdownMatch = normalized.match(markdownFeaturePattern);
      if (markdownMatch?.[1] && markdownMatch[2]) {
        flushCurrentFeature();
        currentFeature = `${markdownMatch[1].trim().replace(/[.\s]+$/g, '')}: ${markdownMatch[2].trim()}`;
        continue;
      }

      const plainMatch = normalized.match(plainFeaturePattern);
      if (plainMatch?.[1] && plainMatch[2] && /\([A-Za-z][^)]*\)/.test(plainMatch[1])) {
        flushCurrentFeature();
        currentFeature = `${plainMatch[1].trim().replace(/[.\s]+$/g, '')}: ${plainMatch[2].trim()}`;
        continue;
      }

      if (currentFeature) {
        currentFeature = `${currentFeature} ${normalized}`;
        continue;
      }

      remaining.push(line);
    }

    flushCurrentFeature();

    return {
      biography: this.route === 'english' ? remaining.join('\n').trim() : biography.trim(),
      features,
    };
  }

  private formatStructuredHtml(raw: unknown): string {
    if (typeof raw !== 'string') {
      return '';
    }

    const normalized = raw
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!normalized) {
      return '';
    }

    const lineSegments = normalized
      .split(/\n+/)
      .map((segment) => this.cleanDescriptionSegment(segment))
      .filter(Boolean);

    if (lineSegments.length > 1) {
      return `<ul>${lineSegments.map((segment) => `<li>${segment}</li>`).join('')}</ul>`;
    }

    const segments = this.splitStructuredSegments(lineSegments[0] ?? '');
    if (segments.length <= 1) {
      return `<ul><li>${segments[0] ?? normalized}</li></ul>`;
    }

    const [lead, ...rest] = segments;
    return `<p>${lead}</p><ul>${rest.map((segment) => `<li>${segment}</li>`).join('')}</ul>`;
  }

  private splitStructuredSegments(raw: string): string[] {
    return raw
      .replace(
        /\s+(?=(?:命中|豁免失败|豁免成功|强击|Bleed|Dazed|流血创口|震荡冲击|击退|Heavy Hit|Hit:|Failure:|Success:)[：:（(]?)/g,
        '\n',
      )
      .split(/\n+/)
      .map((segment) => this.cleanDescriptionSegment(segment))
      .filter(Boolean);
  }

  private cleanDescriptionSegment(segment: string): string {
    return segment
      .replace(/\s+/g, ' ')
      .replace(/^\s*[-*+]\s*/, '')
      .trim();
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
          lines.push(`${key}: ${String(value)}`);
        }
      }
    }

    return lines;
  }

  private appendLegacySpellItems(items: any[], spellcasting: ParsedNPC['spellcasting']): void {
    const spellcastingItem = {
      name: '施法',
      type: 'feat',
      img: 'icons/svg/d20-highlight.svg',
      system: {
        description: { value: '<p>The creature is a spellcaster.</p>', chat: '' },
        type: { value: 'monster', subtype: 'spellcasting' },
        activities: {} as Record<string, any>,
      },
    };

    const spells = this.extractSpellNames(spellcasting);

    let hasLinkedSpells = false;
    for (const spellName of spells) {
      const info = spellsMapper.get(spellName);
      if (info) {
        const act = this.activityGenerator.generateCast(info.uuid);
        Object.assign(spellcastingItem.system.activities, act);
        hasLinkedSpells = true;
      } else if (spellName) {
        items.push({
          name: spellName,
          type: 'spell',
          img: 'icons/svg/mystery-man.svg',
          system: {
            preparation: { mode: 'innate' },
            level: 0,
          },
        });
      }
    }

    if (hasLinkedSpells) {
      items.push(spellcastingItem);
    }
  }

  private createSpellcastingDescriptionItem(lines: string[]): any {
    const description = lines
      .map((line) => line.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean)
      .join('\n');

    return {
      name: 'Spellcasting',
      type: 'feat',
      img: 'icons/svg/d20-highlight.svg',
      system: {
        description: { value: `<p>${description.replace(/\n/g, '<br>')}</p>`, chat: '' },
        source: { custom: 'Imported' },
        activation: { type: '', cost: null },
        activities: {},
        type: { value: 'monster', subtype: 'spellcasting' },
      },
    };
  }

  private extractSpellcastingLines(spellcasting: ParsedNPC['spellcasting']): string[] {
    if (Array.isArray(spellcasting)) {
      return spellcasting.filter((line): line is string => typeof line === 'string').map((line) => line.trim()).filter(Boolean);
    }

    if (spellcasting && typeof spellcasting === 'object') {
      return Object.entries(spellcasting)
        .map(([key, value]) => `${key}: ${String(value)}`.trim())
        .filter(Boolean);
    }

    return [];
  }

  private createItemFromAction(
    action: GeneratedActionData,
    activities: any,
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' = 'action',
  ): any {
    const resolvedActivationType =
      activationType === ''
        ? this.inferPassiveActivationType(action)
        : activationType === 'legendary'
          ? 'legendary'
          : this.resolveActivationType(action, activationType);

    const passiveTraits = ['两栖', '感知魔法', '反魔场光环', 'Amphibious', 'Sense Magic', 'Antimagic Aura'];
    const isPassive = activationType === '' || passiveTraits.some(t => action.name.includes(t));
    const isNonWeaponActivation = activationType === 'bonus' || activationType === 'reaction';
    const isWeapon = !!action.attack && !isNonWeaponActivation && !isPassive;
    const activationCondition = this.extractActivationCondition(action.desc ?? '');

    let itemName = action.englishName
      ? `${action.name} (${action.englishName})`
      : action.name || '';

    let uses = null;
    const usesMatch = itemName.match(/\s*\[(\d+)\/(?:日|Day)\]/);
    if (usesMatch && usesMatch[1]) {
      const n = parseInt(usesMatch[1], 10);
      uses = this.createDailyUses(n);
      itemName = itemName.replace(/\s*\[\d+\/(?:日|Day)\]/, '').trim();
    }
    const itemUses = !uses && action.usesPerLongRest !== undefined ? this.createDailyUses(action.usesPerLongRest) : uses;

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
        } : {
          type: { value: 'monster', subtype: activationType === 'lair' ? 'lair' : activationType === 'legendary' ? 'legendary' : '' }
        })
      },
      effects: [] as any[],
      flags: this.buildItemSectionFlags(activationType === 'legendary' ? 'legendary' : resolvedActivationType, isPassive),
    };

    this.appendSupplementalActivities(item.system.activities, action);
    item.effects = resolvedActivationType ? this.generateEnhancedConditionEffects(action.desc || '', item.system.activities, itemName) : [];
    this.applySpecializedActivityOverrides(item, action);
    this.applyActivityMetadata(
      item.system.activities,
      resolvedActivationType,
      activationCondition,
      item.system.uses,
      resolvedActivationType === 'legendary' ? (action.legendaryCost ?? 1) : null,
    );
    this.applyNarrativeActivityTargeting(item, action);
    this.applyHeavyHitAutomation(item, action);
    this.applyRuleMetadata(item, action);
    return item;
  }

  private resolveItemActivationCost(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    legendaryCost?: number,
  ): number | null {
    if (!activationType || activationType === 'special') {
      return null;
    }

    return legendaryCost ?? 1;
  }

  private buildItemRange(action: GeneratedActionData): Record<string, number | string | null> {
    if (action.attack?.type === 'mwak') {
      return {
        value: null,
        long: null,
        reach: this.parseNumericDistance(action.attack.reach ?? action.attack.range) ?? 5,
        units: 'ft',
      };
    }

    const [value, long] = this.parseAttackRange(action.attack?.range);
    return {
      value,
      long,
      reach: null,
      units: 'ft',
    };
  }

  private resolveDisplaySectionFixed(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    isPassive: boolean,
  ): string {
    if (activationType === 'legendary') {
      return 'Legendary Actions';
    }
    return this.resolveDisplaySection(activationType, isPassive);
  }

  private buildItemSectionFlags(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    isPassive: boolean,
  ): Record<string, any> {
    const section = this.resolveDisplaySectionFixed(activationType, isPassive);
    return {
      'tidy5e-sheet': {
        section,
        actionSection: section,
      },
      fvttJsonGenerator: {
        effectHints: {},
      },
    };
  }

  private resolveDisplaySection(
    activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
    isPassive: boolean,
  ): string {
    const localized = this.route === 'chinese';
    if (isPassive || activationType === '' || activationType === 'special') {
      return localized ? '特性' : 'Traits';
    }

    if (activationType === 'bonus') {
      return localized ? '附赠动作' : 'Bonus Actions';
    }

    if (activationType === 'reaction') {
      return localized ? '反应' : 'Reactions';
    }

    if (activationType === 'lair') {
      return localized ? '巢穴效应' : 'Regional Effects';
    }

    return localized ? '动作' : 'Actions';
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
    return /(?:\u9700\u4e13\u6ce8|concentration)/i.test(text);
  }

  private extractTargetCondition(text: string): string | undefined {
    if (
      /(?:\u4ec5\u9650\u88ab\u9b45\u60d1\u7684\u76ee\u6807|charmed target only)/i.test(text) ||
      /^(?:[^.。]*?)(?:\u88ab.*?\u9b45\u60d1|\u88ab\u9b45\u60d1).*?(?:\u76ee\u6807|\u751f\u7269)/i.test(text) ||
      /^(?:[^.。]*?)\bcharmed\b.*?(?:target|creature)/i.test(text)
    ) {
      return 'charmed';
    }

    return undefined;
  }

  private extractLegendaryCostFixed(text: string): number | undefined {
    const match =
      text.match(/(?:\u6d88\u8017|Cost(?:s)?)\s*(\d+)\s*(?:\u52a8\u4f5c|Actions?)?/i) ??
      text.match(/Costs?\s*(\d+)\s*Actions?/i);
    if (!match?.[1]) {
      return undefined;
    }

    return Number.parseInt(match[1], 10);
  }

  private extractLegendaryActionCountFromLines(lines: string[]): number | undefined {
    for (const line of lines) {
      const normalized =
        typeof line === 'string'
          ? line.replace(/\s+/g, ' ').trim()
          : JSON.stringify(line).replace(/\s+/g, ' ').trim();
      const match =
        normalized.match(/(\d+)\s*(?:\u6b21|\u4e2a)?\s*\u4f20\u5947\u52a8\u4f5c/i) ??
        normalized.match(/(\d+)\s+legendary\s+actions?/i);
      if (match?.[1]) {
        return Number.parseInt(match[1], 10);
      }
    }

    return undefined;
  }

  private extractUsesPerLongRestFixed(text: string): number | undefined {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const dailyMatch =
      normalized.match(/(?:\u6bcf\u65e5|daily)\s*(\d+)\s*(?:\u6b21|uses?)?/i) ??
      normalized.match(/(\d+)\s*(?:\u6b21)?\s*\/\s*(?:\u65e5|day)/i) ??
      normalized.match(/\[(\d+)\s*\/\s*(?:\u65e5|day)\]/i);
    if (!dailyMatch?.[1]) {
      return undefined;
    }

    return Number.parseInt(dailyMatch[1], 10);
  }

  private createDailyUses(value: number): Record<string, unknown> {
    return {
      spent: 0,
      value,
      max: value,
      per: 'day',
      recovery: [{ period: 'day', type: 'recoverAll' }],
    };
  }

  private extractActivationCondition(desc: string): string {
    if (/(?:濒血|bloodied)/i.test(desc)) {
      return 'bloodied';
    }

    return '';
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

    if (this.isSwallowLikeAction(action)) {
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
        };
        Object.assign(activities, generated);
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
      const range = this.extractNarrativeRangeFeetFixed(action.desc ?? '');
      if (range) {
        for (const activity of activities.filter((candidate) => candidate?.type === 'save')) {
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

    if (this.hasHalfDamageOnSave(text)) {
      rules.halfDamageOnSave = true;
    }

    const thresholdEffects = this.extractThresholdEffects(text);
    if (thresholdEffects.length > 0) {
      rules.thresholdEffects = thresholdEffects;
    }

    const onHitRiders = this.extractOnHitRiders(text);
    if (onHitRiders.length > 0) {
      rules.onHitRiders = onHitRiders;
    }

    const onFailedSave = this.extractOnFailedSaveRiders(text);
    if (onFailedSave.length > 0) {
      rules.onFailedSave = onFailedSave;
    }

    const allyEscapeSave = this.extractAllyEscapeSave(text);
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
    const dropsToZero = /\b0\b|\bzero\b|\u964d\u81f3\s*0/i.test(text);
    if (!dropsToZero) {
      return null;
    }

    const formulas = [...text.matchAll(/(\d+d\d+)/gi)].map((match) => match[1]);
    const healFormula = formulas[0]
      ?? (action.damage?.[0]?.dice && action.damage?.[0]?.die ? `${action.damage[0].dice}d${action.damage[0].die}` : undefined);
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
      .filter((entry): entry is { key: string; label: string; pattern: RegExp; index: number } => Boolean(entry))
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
    const patterns = [
      /(\d+)\s*(?:feet|foot|ft)\s*radius/i,
      /radius\s+of\s+(\d+)\s*(?:feet|foot|ft)/i,
      /(\d+)\s*尺半径/i,
      /半径\s*(\d+)\s*尺/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return Number.parseInt(match[1], 10);
      }
    }

    return null;
  }

  private extractNarrativeRangeFeet(text: string): number | null {
    const matches: number[] = [];
    const patterns = [
      /within\s+(\d+)\s*(?:feet|foot|ft)/gi,
      /(\d+)\s*(?:feet|foot|ft)\s+within/gi,
      /(\d+)\s*尺内/g,
      /(\d+)\s*尺范围内/g,
    ];

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) {
          matches.push(Number.parseInt(match[1], 10));
        }
      }
    }

    if (matches.length === 0) {
      return null;
    }

    return Math.max(...matches);
  }

  private extractNarrativeRangeFeetFixed(text: string): number | null {
    const base = this.extractNarrativeRangeFeet(text);
    const extraPatterns = [
      /range\s+(\d+)\s*(?:feet|foot|ft)/gi,
      /\u5c04\u7a0b\s*(\d+)\s*\u5c3a/g,
    ];
    const matches: number[] = [];
    if (base !== null) {
      matches.push(base);
    }

    for (const pattern of extraPatterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) {
          matches.push(Number.parseInt(match[1], 10));
        }
      }
    }

    if (matches.length === 0) {
      return null;
    }

    return Math.max(...matches);
  }

  private hasHalfDamageOnSave(text: string): boolean {
    return /(?:half\s+as\s+much\s+damage|half\s+damage|\u4f24\u5bb3\u51cf\u534a)/i.test(text);
  }

  private extractThresholdEffects(text: string): Array<Record<string, unknown>> {
    const results: Array<Record<string, unknown>> = [];
    for (const match of text.matchAll(/(?:\u82e5.*?(?:save|豁免).*?(\d+)\s*(?:or lower|\u6216\u66f4\u4f4e)[^.:：]*[:：]\s*([^。]+))/giu)) {
      const maxSaveTotal = match[1] ? Number.parseInt(match[1], 10) : null;
      const clause = match[2]?.trim() ?? '';
      if (!maxSaveTotal || !clause) {
        continue;
      }

      if (/\bdazed\b|\u604d\u60da/i.test(clause)) {
        results.push({ maxSaveTotal, statuses: ['dazed'] });
        continue;
      }

      if (/\bvulnerability\b|\u6613\u4f24/i.test(clause)) {
        results.push({
          maxSaveTotal,
          kind: 'vulnerability',
          damageType: /\bbludgeoning\b|\u949d\u51fb/i.test(clause) ? 'bludgeoning' : undefined,
        });
      }
    }

    return results;
  }

  private extractOnHitRiders(text: string): Array<Record<string, unknown>> {
    const results: Array<Record<string, unknown>> = [];
    const saveMatch =
      text.match(/DC\s*(\d+)[^()]{0,20}\((Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\)/i) ??
      text.match(/DC\s*(\d+)[^\u4e00-\u9fff]{0,10}(\u529b\u91cf|\u654f\u6377|\u4f53\u8d28|\u667a\u529b|\u611f\u77e5|\u9b45\u529b)/i);

    if (/\bdisease\b|\u75be\u75c5/i.test(text)) {
      results.push({
        kind: 'disease',
        ...(saveMatch?.[1] ? { saveDc: Number.parseInt(saveMatch[1], 10) } : {}),
        ...(saveMatch?.[2] ? { saveAbility: this.normalizeAbility(saveMatch[2]) } : {}),
      });
    }

    for (const effect of this.extractThresholdEffects(text)) {
      if (effect.kind === 'vulnerability') {
        results.push(effect);
      }
    }

    return results;
  }

  private extractOnFailedSaveRiders(text: string): Array<Record<string, unknown>> {
    const results: Array<Record<string, unknown>> = [];
    const pushMatch = text.match(/(?:push(?:ed)?|推开)\s*(\d+)\s*(?:feet|foot|ft|\u5c3a)/i);
    if (pushMatch?.[1]) {
      results.push({
        kind: 'push',
        distance: Number.parseInt(pushMatch[1], 10),
        units: 'ft',
      });
    }

    const savePenaltyMatch =
      text.match(/(?:next\s+saving\s+throw[^.]*?subtract\s*`?(\d+d\d+)`?|豁免检定[^。]*?减去\s*`?(\d+d\d+)`?)/i);
    const dice = savePenaltyMatch?.[1] ?? savePenaltyMatch?.[2];
    if (dice) {
      results.push({
        kind: 'savePenalty',
        dice: dice.replace(/\s+/g, ''),
      });
    }
    return results;
  }

  private normalizeAbility(raw: string): string {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'constitution' || normalized === '\u4f53\u8d28') return 'con';
    if (normalized === 'strength' || normalized === '\u529b\u91cf') return 'str';
    if (normalized === 'dexterity' || normalized === '\u654f\u6377') return 'dex';
    if (normalized === 'intelligence' || normalized === '\u667a\u529b') return 'int';
    if (normalized === 'wisdom' || normalized === '\u611f\u77e5') return 'wis';
    if (normalized === 'charisma' || normalized === '\u9b45\u529b') return 'cha';
    return normalized.slice(0, 3);
  }

  private applySpecializedActivityOverrides(item: any, action: GeneratedActionData): void {
    const activityEntries = Object.entries(item?.system?.activities ?? {}) as Array<[string, any]>;
    if (activityEntries.length === 0) {
      return;
    }

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

    if (this.isSwallowLikeAction(action)) {
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
      item.effects = (item.effects ?? []).filter((effect: any) => {
        const statuses = effect?.statuses ?? [];
        return !statuses.some((status: string) => thresholdStatuses.includes(status));
      });

      for (const [, activity] of activityEntries) {
        activity.effects = (activity.effects ?? []).filter((ref: any) => {
          const effect = (item.effects ?? []).find((candidate: any) => candidate._id === ref?._id);
          if (!effect) {
            return false;
          }
          const statuses = effect?.statuses ?? [];
          return !statuses.some((status: string) => thresholdStatuses.includes(status));
        });
      }
    }
  }

  private isSwallowLikeAction(action: GeneratedActionData): boolean {
    const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
    return /(?:Swallow|吞咽|吞下|被吞下)/i.test(text);
  }

  private isDeathTriggeredSaveTrait(action: GeneratedActionData): boolean {
    if (action.attack) {
      return false;
    }

    const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
    return /(?:Death Burst|\u6b7b\u4ea1\u7206\u88c2|\u6b7b\u4ea1\u65f6|when .* dies|when .* die)/i.test(text)
      && this.extractSavingThrowsWithInheritedDcFromText(text).length > 0;
  }

  private isStatusRemovalUtility(action: GeneratedActionData): boolean {
    if (action.attack || action.save) {
      return false;
    }

    const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
    const mentionsStatus = /(?:grappled|restrained|poisoned|blinded|paralyzed|dazed|被擒抱|受限|中毒|目盲|麻痹|恍惚)/i.test(text);
    const indicatesRemoval = /(?:escape|end|remove|摆脱|结束|脱离|结束自身)/i.test(text);
    return mentionsStatus && indicatesRemoval;
  }

  private extractSwallowDamage(action: GeneratedActionData): Damage | undefined {
    const attackDamages = action.attack?.damage ?? [];
    const explicitNecrotic = attackDamages.find((damage) => damage.type === 'necrotic');
    if (explicitNecrotic) {
      return explicitNecrotic;
    }

    const desc = action.desc ?? '';
    const englishNecrotic = desc.match(/\b(\d+d\d+(?:\s*[+\-]\s*\d+)?)\s*\)?\s*necrotic\s+damage/i);
    if (englishNecrotic?.[1]) {
      return {
        formula: englishNecrotic[1].replace(/\s+/g, ''),
        type: 'necrotic',
      };
    }

    const extracted = this.extractDamagePartsFromText(desc);
    return extracted.find((damage) => damage.type === 'necrotic') ?? extracted[0];
  }

  private generateConditionEffects(desc: string, activities: any, actionName?: string): any[] {
    const effects: any[] = [];
    if (!desc) return effects;

    const conditionMap: Record<string, { en: string; enLabel: string }> = {
      '中毒':     { en: 'poisoned',   enLabel: 'Poisoned' },
      '麻痹':     { en: 'paralyzed',  enLabel: 'Paralyzed' },
      '眩晕':     { en: 'stunned',    enLabel: 'Stunned' },
      '魅惑':     { en: 'charmed',    enLabel: 'Charmed' },
      '恐慌':     { en: 'frightened', enLabel: 'Frightened' },
      '倒地':     { en: 'prone',      enLabel: 'Prone' },
      '束缚':     { en: 'restrained', enLabel: 'Restrained' },
      '目盲':     { en: 'blinded',    enLabel: 'Blinded' },
      '耳聋':     { en: 'deafened',   enLabel: 'Deafened' },
      '隐形':     { en: 'invisible',  enLabel: 'Invisible' },
      '石化':     { en: 'petrified',  enLabel: 'Petrified' },
      '力竭':     { en: 'exhaustion', enLabel: 'Exhaustion' },
      '昏迷':     { en: 'unconscious',enLabel: 'Unconscious' },
      '擒抱':     { en: 'grappled',   enLabel: 'Grappled' },
      '恍惚':     { en: 'dazed',      enLabel: 'Dazed' },
      '流血':     { en: 'bleeding',   enLabel: 'Bleeding' }
    };

    const generateId = () => {
      const chars = 'abcdef0123456789';
      let res = '';
      for (let i = 0; i < 16; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };

    const buildOverTime = (cn: string): Record<string, string> => {
      if (cn === '流血') {
        if (actionName && (actionName.includes('吞咽') || actionName.includes('Swallow'))) {
          return { 'midi-qol.OverTime': 'turn=start,damageRoll=4d6,damageType=necrotic,label=吞咽死灵伤害 (Swallow Necrotic),saveDC=15,saveAbility=con,saveRemove=True' };
        }
        return { 'midi-qol.OverTime': 'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)' };
      }
      return {};
    };

    const isSwallow = actionName && (
      actionName.includes('吞咽') || actionName.includes('Swallow')
    );

    for (const [cn, info] of Object.entries(conditionMap)) {
      if (desc.includes(cn) || desc.toLowerCase().includes(info.en)) {
        if (isSwallow && cn === '擒抱') continue;
        const flags = buildOverTime(cn);
        effects.push({
          _id: generateId(),
          name: `${cn} (${info.enLabel})`,
          type: 'base',
          system: {},
          changes: [],
          disabled: false,
          duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
          description: '',
          origin: null,
          tint: '#ffffff',
          transfer: false,
          statuses: [info.en],
          flags
        });
      }
    }
    
    if (effects.length > 0 && activities && typeof activities === 'object') {
      for (const activity of Object.values(activities) as any[]) {
        if (activity && typeof activity === 'object') {
          if (!activity.effects) activity.effects = [];
          for (const effect of effects) {
            activity.effects.push({ _id: effect._id });
          }
        }
      }
    }

    if (isSwallow) {
      effects.push({
        _id: generateId(),
        name: '吞咽中 (Swallowed)',
        type: 'base',
        system: {},
        changes: [],
        disabled: false,
        duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
        description: '',
        origin: null,
        tint: '#8800ff',
        transfer: false,
        statuses: [],
        flags: { 'midi-qol.OverTime': 'turn=start,damageRoll=4d6,damageType=necrotic,label=吞咽中 (Swallowed),saveDC=15,saveAbility=con,saveRemove=True' }
      });
    }

    return effects;
  }

  private generateEnhancedConditionEffects(desc: string, activities: any, actionName?: string): any[] {
    const effects: any[] = [];
    if (!desc) return effects;

    const generateId = () => {
      const chars = 'abcdef0123456789';
      let res = '';
      for (let i = 0; i < 16; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };

    const isSwallow = Boolean(actionName && /Swallow|吞咽/.test(actionName));
    const conditionEntries = [
      { cn: '中毒', en: 'poisoned', label: 'Poisoned' },
      { cn: '麻痹', en: 'paralyzed', label: 'Paralyzed' },
      { cn: '震慑', en: 'stunned', label: 'Stunned' },
      { cn: '魅惑', en: 'charmed', label: 'Charmed' },
      { cn: '恐慌', en: 'frightened', label: 'Frightened' },
      { cn: '倒地', en: 'prone', label: 'Prone' },
      { cn: '受限', en: 'restrained', label: 'Restrained' },
      { cn: '目盲', en: 'blinded', label: 'Blinded' },
      { cn: '耳聋', en: 'deafened', label: 'Deafened' },
      { cn: '隐形', en: 'invisible', label: 'Invisible' },
      { cn: '石化', en: 'petrified', label: 'Petrified' },
      { cn: '力竭', en: 'exhaustion', label: 'Exhaustion' },
      { cn: '昏迷', en: 'unconscious', label: 'Unconscious' },
      { cn: '被擒抱', en: 'grappled', label: 'Grappled' },
      { cn: '恍惚', en: 'dazed', label: 'Dazed' },
      { cn: '流血', en: 'bleeding', label: 'Bleeding' },
    ] as const;

    const iconForStatus = (status: string) => `systems/dnd5e/icons/svg/statuses/${status}.svg`;
    const buildOverTime = (status: string) => {
      if (status !== 'bleeding') {
        return {};
      }
      if (isSwallow) {
        return {
          'midi-qol.OverTime':
            'turn=start,damageRoll=4d6,damageType=necrotic,label=吞咽死灵伤害 (Swallow Necrotic),saveDC=15,saveAbility=con,saveRemove=True',
        };
      }
      return { 'midi-qol.OverTime': 'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)' };
    };

    for (const entry of conditionEntries) {
      if (!(desc.includes(entry.cn) || desc.toLowerCase().includes(entry.en))) {
        continue;
      }
      if (isSwallow && (entry.en === 'grappled' || entry.en === 'prone')) {
        continue;
      }

      effects.push({
        _id: generateId(),
        name: `${entry.cn} (${entry.label})`,
        type: 'base',
        system: {},
        changes: [],
        disabled: false,
        duration: {
          startTime: null,
          seconds: null,
          combat: null,
          rounds: null,
          turns: null,
          startRound: null,
          startTurn: null,
        },
        description: '',
        origin: null,
        tint: '#ffffff',
        transfer: false,
        img: iconForStatus(entry.en),
        statuses: [entry.en],
        flags: buildOverTime(entry.en),
      });
    }

    if (effects.length > 0 && activities && typeof activities === 'object') {
      for (const activity of Object.values(activities) as any[]) {
        if (activity && typeof activity === 'object') {
          if (!activity.effects) activity.effects = [];
          for (const effect of effects) {
            activity.effects.push({ _id: effect._id });
          }
        }
      }
    }

    if (isSwallow) {
      effects.push({
        _id: generateId(),
        name: '鍚炲捊涓?(Swallowed)',
        type: 'base',
        system: {},
        changes: [],
        disabled: false,
        duration: {
          startTime: null,
          seconds: null,
          combat: null,
          rounds: null,
          turns: null,
          startRound: null,
          startTurn: null,
        },
        description: '',
        origin: null,
        tint: '#8800ff',
        transfer: false,
        img: iconForStatus('restrained'),
        statuses: [],
        flags: {
          'midi-qol.OverTime':
            'turn=start,damageRoll=4d6,damageType=necrotic,label=鍚炲捊涓?(Swallowed),saveDC=15,saveAbility=con,saveRemove=True',
        },
      });
    }

    return effects;
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

      activity.activation = {
        type: activationType,
        value: activationValue,
        override: false,
        condition,
      };

      if (uses && index === 0 && !activity.consumption) {
        activity.consumption = {
          scaling: { allowed: false },
          spellSlot: true,
          targets: [
            {
              type: 'itemUses',
              value: '1',
              target: '',
              scaling: {},
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
    const text = `${action.name} ${action.desc ?? ''}`.toLowerCase();
    if (/\bbonus action\b/.test(text) || /as a bonus action/.test(text)) {
      return 'bonus';
    }
    if (/\breaction\b/.test(text) || /as a reaction/.test(text)) {
      return 'reaction';
    }
    return fallback;
  }

  private parseLocalizedAttackLine(line: string): ActionData | null {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (!match?.[1] || !match[2]) {
      return null;
    }

    const header = match[1].trim();
    const desc = match[2].trim();
    const attackPrefixMatch = desc.match(/^(近战或远程武器攻击|近战武器攻击|远程武器攻击|近战法术攻击|远程法术攻击)[:：]/);
    if (!attackPrefixMatch?.[1]) {
      return null;
    }

    const toHitMatch = desc.match(/命中\s*\+?\s*(\d+)/);
    if (!toHitMatch?.[1]) {
      return null;
    }

    const reachMatch = desc.match(/触及\s*(\d+)\s*尺/);
    const rangeMatch = desc.match(/射程\s*(\d+)(?:\s*\/\s*(\d+))?\s*尺/);
    const damage = this.extractPrimaryDamagePartsFromText(desc);

    const { name, englishName } = this.splitBilingualName(header);
    const isRanged = attackPrefixMatch[1].includes('远程') && !attackPrefixMatch[1].includes('近战或远程');

    return {
      name,
      englishName,
      type: 'attack',
      desc,
      attack: {
        type: isRanged ? 'rwak' : 'mwak',
        toHit: Number.parseInt(toHitMatch[1], 10),
        range: rangeMatch?.[1] ? `${rangeMatch[1]}${rangeMatch[2] ? `/${rangeMatch[2]}` : ''}` : (reachMatch?.[1] ?? '5'),
        ...(reachMatch?.[1] ? { reach: reachMatch[1] } : {}),
        damage,
      },
    };
  }

  private splitBilingualName(raw: string): { name: string; englishName?: string } {
    const match = raw.match(/^(.+?)\s*\(\s*([A-Za-z][A-Za-z0-9\s&:'-]+?)\s*\)\s*$/);
    if (match?.[1] && match[2]) {
      return { name: match[1].trim(), englishName: match[2].trim() };
    }
    return { name: raw.trim() };
  }

  private extractDamagePartsFromText(text: string): Damage[] {
    const formulaMatches = [...text.matchAll(/`?(\d+d\d+(?:\s*[+\-]\s*\d+)?)`?/gi)];
    if (formulaMatches.length === 0) {
      return [];
    }

    const typeMatches = [...text.matchAll(/点([一-龥]{2,4})伤害/g)];
    const fallbackType = this.mapDamageType(typeMatches[0]?.[1] ?? '');

    return formulaMatches.map((match, index) => ({
      formula: match[1].replace(/\s+/g, ''),
      type: this.mapDamageType(typeMatches[index]?.[1] ?? '') || fallbackType || 'bludgeoning',
    }));
  }

  private extractPrimaryDamagePartsFromText(text: string): Damage[] {
    const hitClause = text.match(/命中[：:]\s*([^。]+(?:点[一-龥]{2,4}伤害)?[^。]*)/);
    const primaryText = hitClause?.[1]?.trim() ? hitClause[1].trim() : text;
    return this.extractDamagePartsFromText(primaryText);
  }

  private mapDamageType(raw: string): string {
    const cleaned = raw.trim();
    if (!cleaned) {
      return '';
    }

    const key = i18n.getKey(cleaned);
    if (!key) {
      return '';
    }

    return key.replace('DND5E.Damage', '').toLowerCase();
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
    return this.extractSavingThrowsWithInheritedDcFromText(text)[0] ?? this.extractSavingThrowsFromText(text)[0];
  }

  private extractSavingThrowsWithInheritedDcFromText(text: string): Array<NonNullable<ActionData['save']>> {
    const saves: Array<NonNullable<ActionData['save']>> = [];
    const abilityRegex =
      /[^()\n]{0,24}\((Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\)\s*(?:\u8c41\u514d(?:\u68c0\u5b9a)?|saving throw)?/gi;

    let inheritedDc: number | undefined;
    for (const match of text.matchAll(abilityRegex)) {
      const rawAbility = match[1];
      const matchIndex = match.index ?? 0;
      const lookbehind = text.slice(Math.max(0, matchIndex - 40), matchIndex + match[0].length);
      const rawDc = lookbehind.match(/DC\s*(\d+)/i)?.[1];
      if (rawDc) {
        inheritedDc = Number.parseInt(rawDc, 10);
      }
      if (!rawAbility || inheritedDc === undefined) {
        continue;
      }

      const ability = rawAbility.toLowerCase().slice(0, 3);
      const previous = saves[saves.length - 1];
      if (previous?.ability === ability && previous.dc === inheritedDc) {
        continue;
      }

      saves.push({ dc: inheritedDc, ability });
    }

    return saves;
  }

  private extractSavingThrowsFromText(text: string): Array<NonNullable<ActionData['save']>> {
    const abilityMap: Record<string, string> = {
      力量: 'str',
      Strength: 'str',
      敏捷: 'dex',
      Dexterity: 'dex',
      体质: 'con',
      Constitution: 'con',
      智力: 'int',
      Intelligence: 'int',
      感知: 'wis',
      Wisdom: 'wis',
      魅力: 'cha',
      Charisma: 'cha',
    };

    const saves: Array<NonNullable<ActionData['save']>> = [];
    let inheritedDc: number | undefined;
    const regex =
      /(?:(?:DC\s*(\d+)\s*(?:的)?\s*)?(力量|敏捷|体质|智力|感知|魅力|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\s*\([A-Za-z]+\))?\s*(?:豁免(?:检定)?|saving throw))/gi;

    for (const match of text.matchAll(regex)) {
      const rawDc = match[1];
      const rawAbility = match[2];
      if (!rawAbility) {
        continue;
      }

      if (rawDc) {
        inheritedDc = Number.parseInt(rawDc, 10);
      }

      if (inheritedDc === undefined) {
        continue;
      }

      const ability = abilityMap[rawAbility];
      if (!ability) {
        continue;
      }

      const previous = saves[saves.length - 1];
      if (previous && previous.ability === ability && previous.dc === inheritedDc) {
        continue;
      }

      saves.push({
        dc: inheritedDc,
        ability,
      });
    }

    return saves;
  }

  private parseActionLine(line: string): GeneratedActionData | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = this.normalizeActionHeaderDelimiter(trimmed);
    const candidate = normalized !== trimmed ? normalized : trimmed;

    const directAttack = this.parseLocalizedAttackLine(candidate);
    if (directAttack) {
      return this.enrichGeneratedAction(directAttack, trimmed);
    }

    const englishFirst = this.isLikelyEnglishAction(candidate);
    const primary = englishFirst ? this.englishActionParser.parse(candidate) : this.actionParser.parse(candidate);
    if (primary) {
      return this.enrichGeneratedAction(primary, trimmed);
    }

    const secondary = englishFirst ? this.actionParser.parse(candidate) : this.englishActionParser.parse(candidate);
    if (secondary) {
      return this.enrichGeneratedAction(secondary, trimmed);
    }

    const split =
      normalized.match(/^(.+?)\.\s+(.+)$/) ??
      normalized.match(/^(.+?):\s+(.+)$/) ??
      normalized.match(/^(.+?)[。.:：]\s*(.+)$/);
    if (split?.[1] && split[2]) {
      return this.enrichGeneratedAction({
        name: split[1].trim(),
        type: 'utility',
        desc: split[2].trim(),
      }, trimmed);
    }

    return this.enrichGeneratedAction({
      name: trimmed,
      type: 'utility',
      desc: trimmed,
    }, trimmed);
  }

  private enrichGeneratedAction(action: ActionData, rawLine: string): GeneratedActionData {
    const derived = { ...action } as GeneratedActionData;
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
    if (bilingual?.[1] && bilingual[2]) {
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
    const match = line.match(/^(.+?[\)])\s*[。.:：]\s*(\S.*)$/);
    if (!match?.[1] || !match[2]) {
      return line;
    }

    const [, namePart, bodyPart] = match;
    return `${namePart.trim()}: ${bodyPart.trim()}`;
  }

  private isLikelyEnglishAction(line: string): boolean {
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

  private createDefaultTranslationService(): TranslationService | undefined {
    const config = createTranslationConfigFromEnv();
    if (!config.apiKey) {
      return undefined;
    }

    const translator = new OpenAICompatibleTranslator({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });

    return new TranslationService({
      translator,
      cache: new FileTranslationCache(config.cacheFilePath),
      providerName: 'openai-compatible',
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }

  private async localizeEnglishActor(actor: any): Promise<any> {
    actor.name = await this.translateBilingualName(actor.name, 'actor.name');
    if (actor.prototypeToken && typeof actor.prototypeToken === 'object') {
      actor.prototypeToken.name = actor.name;
    }

    for (const item of actor.items ?? []) {
      if (!this.isImportedActionItem(item)) {
        continue;
      }

      item.name = await this.translateBilingualName(item.name, 'item.name');

      if (this.isSpellcastingItem(item)) {
        item.system.description.value = await this.localizeSpellcastingDescription(item);
        continue;
      }

      const description = this.extractDescriptionText(item);
      if (!description) {
        continue;
      }

      const translatedDescription = await this.translateText(description, {
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        namespace: 'item.description',
      });
      item.system.description.value = `<p>${translatedDescription}</p>`;
    }

    return actor;
  }

  private async localizeSpellcastingDescription(item: any): Promise<string> {
    const lines = this.extractDescriptionLines(item);
    if (lines.length === 0) {
      return '<p></p>';
    }

    const localizedLines: string[] = [];
    for (const rawLine of lines) {
      let line = rawLine;
      for (const [pattern, replacement] of SPELLCASTING_TERM_REPLACEMENTS) {
        line = line.replace(pattern, replacement);
      }

      const split = line.split(':');
      if (split.length > 1) {
        const head = split[0]?.trim() ?? '';
        const list = split.slice(1).join(':');
        const names = list
          .split(',')
          .map((name) => name.trim().replace(/[.;]$/g, ''))
          .filter(Boolean);

        if (names.length > 0) {
          const localizedNames = await Promise.all(
            names.map((name) => this.translateBilingualName(name, 'item.spellName')),
          );
          localizedLines.push(`${head}: ${localizedNames.join(', ')}`);
          continue;
        }
      }

      localizedLines.push(line);
    }

    return `<p>${localizedLines.join('<br>')}</p>`;
  }

  private async translateBilingualName(value: unknown, namespace: string): Promise<string> {
    const source = typeof value === 'string' ? value.trim() : '';
    if (!source) {
      return '';
    }

    if (!/[A-Za-z]/.test(source) || /[\u4e00-\u9fff]/.test(source)) {
      return source;
    }

    if (!this.translationService) {
      const localTranslation = this.translateLocalName(source);
      if (!localTranslation) {
        return source;
      }

      return this.formatBilingualName(source, localTranslation);
    }

    const translated = await this.translateText(source, {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace,
    });

    return this.formatBilingualName(source, translated);
  }

  private formatBilingualName(source: string, translated: string): string {
    const normalizedSource = source.trim();
    const normalizedTranslated = translated.trim();

    if (!normalizedSource || !normalizedTranslated) {
      return normalizedSource;
    }

    if (normalizedTranslated.toLowerCase() === normalizedSource.toLowerCase()) {
      return normalizedSource;
    }

    if (normalizedTranslated.includes(normalizedSource)) {
      return normalizedTranslated;
    }

    if (!/[\u4e00-\u9fff]/.test(normalizedTranslated)) {
      return normalizedSource;
    }

    return `${normalizedTranslated}${normalizedSource}`;
  }

  private async translateText(text: string, context: TranslationContext): Promise<string> {
    const source = text.trim();
    if (!source) {
      return source;
    }

    if (!this.translationService) {
      return this.translateLocalText(source, context);
    }

    try {
      const result = await this.translationService.translate(source, context);
      if (typeof result === 'string') {
        return result.trim() || source;
      }

      if (result && typeof result.text === 'string') {
        return result.text.trim() || source;
      }
    } catch {
      return source;
    }

    return source;
  }

  private translateLocalName(value: string): string | undefined {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ');

    return LOCAL_NAME_TRANSLATIONS[normalized as keyof typeof LOCAL_NAME_TRANSLATIONS];
  }

  private translateLocalText(source: string, context: TranslationContext): string {
    if (context.namespace !== 'item.description') {
      return source;
    }

    let translated = source;
    for (const [pattern, replacement] of LOCAL_DESCRIPTION_REPLACEMENTS) {
      translated = translated.replace(pattern, replacement);
    }

    return translated;
  }

  private isImportedActionItem(item: any): boolean {
    return item?.system?.source?.custom === 'Imported';
  }

  private isSpellcastingItem(item: any): boolean {
    return item?.system?.type?.subtype === 'spellcasting';
  }

  private extractDescriptionText(item: any): string {
    const raw = item?.system?.description?.value;
    if (typeof raw !== 'string') {
      return '';
    }

    const stripped = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped;
  }

  private extractDescriptionLines(item: any): string[] {
    const raw = item?.system?.description?.value;
    if (typeof raw !== 'string') {
      return [];
    }

    return raw
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
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
    const profBonus = Number(actor.system?.attributes?.prof ?? 0);
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
