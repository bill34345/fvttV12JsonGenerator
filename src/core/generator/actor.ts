import { existsSync, readFileSync } from 'node:fs';
import { ActionParser } from '../parser/action';
import type { ActionData } from '../parser/action';
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

interface TranslationServiceLike {
  translate(text: string, context?: TranslationContext): Promise<{ text: string } | string>;
}

interface ActorGeneratorOptions {
  translationService?: TranslationServiceLike | null;
  fvttVersion?: '12' | '13';
}

interface GenerateOptions {
  resetDefaults?: boolean;
  spellcastingMode?: 'legacy' | 'description';
}

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

  constructor(options: ActorGeneratorOptions = {}) {
    this.translationService =
      options.translationService === undefined
        ? this.createDefaultTranslationService()
        : options.translationService ?? undefined;
    this.fvttVersion = options.fvttVersion ?? '12';
    this.loadGoldenMaster();
  }

  public async generateForRoute(parsed: ParsedNPC, route: ParserRoute): Promise<any> {
    const actor = this.generate(parsed, {
      resetDefaults: route === 'english',
      spellcastingMode: route === 'english' ? 'description' : 'legacy',
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
        actor.system.attributes.init = { bonus: parsed.attributes.init };
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
        actor.system.details.type.value = parsed.details.creatureType;
      }
      if (parsed.details.biography) actor.system.details.biography.value = parsed.details.biography;
      
      actor.system.details.habitat = { value: [], custom: "" };
      actor.system.details.treasure = { value: [] };
    }

    // Patch Traits
    if (parsed.traits) {
      if (parsed.traits.size) actor.system.traits.size = parsed.traits.size;
      actor.system.traits.dr = { value: parsed.traits.dr || [], custom: '', bypasses: [] };
      actor.system.traits.di = { value: parsed.traits.di || [], custom: '', bypasses: [] };
      actor.system.traits.ci = { value: parsed.traits.ci || [], custom: '' };
      actor.system.traits.dv = { value: parsed.traits.dv || [], custom: '', bypasses: [] };
      if (parsed.traits.dm) actor.system.traits.dm = parsed.traits.dm;
      actor.system.traits.languages = { value: parsed.traits.languages || [], custom: '' };
      
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
        if (actor.system.skills[key]) {
          actor.system.skills[key].value = val;
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

    // Generate Items (Actions)
    const newItems: any[] = [];

    const extracted = this.extractInlineFeatureLinesFromBiography(actor.system?.details?.biography?.value);
    actor.system.details.biography.value = extracted.biography;
    this.appendActionItems(newItems, extracted.features, 'passive');

    this.appendActionItems(newItems, parsed.actions, 'action');
    this.appendActionItems(newItems, parsed.bonus_actions, 'bonus');
    this.appendActionItems(newItems, parsed.reactions, 'reaction');
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
        
        newItems.push({
          name: name,
          type: 'feat',
          img: 'icons/svg/mystery-man.svg',
          system: {
            description: { value: `<p>${desc}</p>`, chat: '' },
            type: { value: 'monster', subtype: 'regional' },
            activation: { type: '', cost: null }
          },
          flags: {
            "tidy5e-sheet": { section: "巢穴效应", actionSection: "巢穴效应" }
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
    activationType: 'action' | 'bonus' | 'reaction' | 'lair' | '' | 'passive',
  ): void {
    for (const line of this.collectActionLines(source)) {
      const actionData = this.parseActionLine(line);
      if (!actionData) {
        continue;
      }

      const isPassive = activationType === 'passive';
      const activities = isPassive ? {} : this.activityGenerator.generate(actionData);
      
      const item = this.createItemFromAction(actionData, activities, isPassive ? '' : activationType);
      items.push(item);
    }
  }

  private extractInlineFeatureLinesFromBiography(biography: unknown): { biography: string; features: string[] } {
    if (typeof biography !== 'string' || !biography.trim()) {
      return { biography: '', features: [] };
    }

    const blocks = biography
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);

    const keepBlocks: string[] = [];
    const features: string[] = [];

    for (const block of blocks) {
      const compact = block.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      const match = compact.match(/^\*{2,3}\s*([^*]+?)\s*\*{2,3}\s*(.*)$/);
      if (!match?.[1]) {
        keepBlocks.push(block);
        continue;
      }

      const title = match[1].trim().replace(/[.\s]+$/g, '');
      const desc = match[2]?.trim() ?? '';
      if (!title || !desc) {
        keepBlocks.push(block);
        continue;
      }

      features.push(`${title}: ${desc}`);
    }

    return {
      biography: keepBlocks.join('\n\n').trim(),
      features,
    };
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
    action: ActionData,
    activities: any,
    activationType: 'action' | 'bonus' | 'reaction' | 'lair' | '' = 'action',
  ): any {
    const metadata = action as ActionData & { legendaryCost?: number };
    const resolvedActivationType = this.resolveActivationType(action, activationType);

    const passiveTraits = ['两栖', '感知魔法', '反魔场光环', 'Amphibious', 'Sense Magic', 'Antimagic Aura'];
    const isPassive = passiveTraits.some(t => action.name.includes(t));
    const isNonWeaponActivation = activationType === 'bonus' || activationType === 'reaction';
    const isWeapon = !!action.attack && !isNonWeaponActivation && !isPassive;

    const itemName = action.englishName
      ? `${action.name} (${action.englishName})`
      : action.name;

    const item = {
      name: itemName,
      type: isWeapon ? 'weapon' : 'feat',
      img: isWeapon ? 'icons/svg/sword.svg' : 'icons/svg/mystery-man.svg',
      system: {
        description: { value: `<p>${action.desc || ''}</p>`, chat: '' },
        source: { custom: 'Imported' },
        activation: { 
          type: resolvedActivationType, 
          cost: resolvedActivationType ? (metadata.legendaryCost ?? 1) : null, 
          condition: '' 
        },
        activities: activities,
        ...(isWeapon ? {
          type: { value: 'natural', classification: 'weapon' },
          equipped: true
        } : {
          type: { value: 'monster', subtype: '' }
        })
      },
      effects: this.generateConditionEffects(action.desc || '', activities, action.name)
    };

    this.applyActivityActivationByVersion(item.system.activities, resolvedActivationType, metadata.legendaryCost ?? 1);
    return item;
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

  private applyActivityActivationByVersion(
    activities: Record<string, any>,
    activationType: 'action' | 'bonus' | 'reaction' | 'lair' | '',
    cost: number,
  ): void {
    if (this.fvttVersion !== '13' || !activities || typeof activities !== 'object') {
      return;
    }

    const value = activationType ? cost : null;
    for (const activity of Object.values(activities)) {
      if (!activity || typeof activity !== 'object') {
        continue;
      }

      activity.activation = {
        type: activationType,
        value,
        condition: '',
      };
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

  private parseActionLine(line: string): ActionData | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const englishFirst = this.isLikelyEnglishAction(trimmed);
    const primary = englishFirst ? this.englishActionParser.parse(trimmed) : this.actionParser.parse(trimmed);
    if (primary) {
      return primary;
    }

    const secondary = englishFirst ? this.actionParser.parse(trimmed) : this.englishActionParser.parse(trimmed);
    if (secondary) {
      return secondary;
    }

    const split = trimmed.match(/^(.+?)\.\s+(.+)$/) ?? trimmed.match(/^(.+?):\s+(.+)$/);
    if (split?.[1] && split[2]) {
      return {
        name: split[1].trim(),
        type: 'utility',
        desc: split[2].trim(),
      };
    }

    return {
      name: trimmed,
      type: 'utility',
      desc: trimmed,
    };
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
