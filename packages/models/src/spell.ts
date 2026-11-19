
export const SPELL_SCHOOLS = ['abj', 'con', 'div', 'enc', 'evo', 'ill', 'nec', 'trs'] as const;
export const SPELL_COMPONENTS = ['vocal', 'somatic', 'material', 'ritual', 'concentration'] as const;
export const SPELL_ACTIVATIONS = ['action', 'bonus', 'reaction', 'minute', 'hour'] as const;
export const SPELL_DURATIONS = ['inst', 'round', 'minute', 'hour', 'day', 'disp', 'dstr', 'perm', 'spec'] as const;
export const SPELL_RANGES = ['self', 'touch', 'ft', 'mi', 'spec', 'any'] as const;
export const SPELL_TARGETS = ['self', 'creature', 'willing', 'ally', 'enemy', 'object', 'creatureOrObject', 'space', 'any'] as const;
export const SPELL_AREAS = ['cone', 'cube', 'cylinder', 'line', 'radius', 'sphere'] as const;
export const SPELL_SAVE_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export const SPELL_DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing',
  'poison', 'psychic', 'radiant', 'slashing', 'thunder',
] as const;
export const SPELL_HEALING_TYPES = ['healing', 'temphp'] as const;

export interface SpellRoll {
  dice: { count: number; faces: number };
  bonus?: number | '@mod';
  scaling?: number;
}

export type SpellDamage = SpellRoll & { type: typeof SPELL_DAMAGE_TYPES[number] };
export type SpellActivity =
  | { type: 'attack'; attack: 'melee' | 'ranged'; damage: SpellDamage[] }
  | { type: 'save'; save: typeof SPELL_SAVE_ABILITIES[number]; onSave: 'half' | 'none' | 'full'; damage: SpellDamage[] }
  | { type: 'damage'; damage: SpellDamage[] }
  | { type: 'heal'; healing: SpellRoll & { type: typeof SPELL_HEALING_TYPES[number] } }
  | { type: 'utility' };

export interface ParsedSpell {
  name: string;
  identifier: string;
  rules: '2024';
  source?: string;
  level: number;
  school: typeof SPELL_SCHOOLS[number];
  activation: { type: typeof SPELL_ACTIVATIONS[number]; value?: number; condition?: string };
  duration: { units: typeof SPELL_DURATIONS[number]; value?: number };
  range: { units: typeof SPELL_RANGES[number]; value?: number };
  components: (typeof SPELL_COMPONENTS[number])[];
  materials?: { value: string; cost?: number; consumed?: boolean };
  target: {
    type: typeof SPELL_TARGETS[number];
    count?: number;
    special?: string;
    template?: { type: typeof SPELL_AREAS[number]; size: number; width?: number; height?: number };
  };
  activity: SpellActivity;
  description: string;
  gm?: string;
}
