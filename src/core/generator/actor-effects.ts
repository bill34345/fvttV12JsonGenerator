import type { Damage, ActionData } from '../parser/action';
import {
  createCustomEffect as createCustomEffectFromText,
  createRandomId as createRandomIdFromText,
  extractDamagePartsFromText,
} from './actor-text';

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  usesPerLongRest?: number;
  requiresConcentration?: boolean;
  targetCondition?: string;
};

export function extractSwallowDamage(action: GeneratedActionData): Damage | undefined {
  const attackDamages = action.attack?.damage ?? [];
  const explicitNecrotic = attackDamages.find((damage: Damage) => damage.type === 'necrotic');
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

  const extracted = extractDamagePartsFromText(desc);
  return extracted.find((damage: Damage) => damage.type === 'necrotic') ?? extracted[0];
}

export function createRandomId(): string {
  return createRandomIdFromText();
}

export function createCustomEffect(options: {
  name: string;
  img: string;
  statuses?: string[];
  changes?: Array<Record<string, unknown>>;
  duration?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}): any {
  return createCustomEffectFromText(options);
}

export function generateConditionEffects(desc: string, activities: any, actionName?: string): any[] {
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

export function generateEnhancedConditionEffects(desc: string, activities: any, actionName?: string): any[] {
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
      name: '吞咽中 (Swallowed)',
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
          'turn=start,damageRoll=4d6,damageType=necrotic,label=吞咽中 (Swallowed),saveDC=15,saveAbility=con,saveRemove=True',
      },
    });
  }

  return effects;
}
