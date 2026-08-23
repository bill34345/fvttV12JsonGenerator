import { LOCKED_DND5E_V14_SPELLS, type LockedBrowserSpell } from '../browser-v14-spell-data';

export interface LockedDnd5eV14Spell {
  identifier: string;
  name: string;
  uuid: string;
}

export type LockedDnd5eV14Activation = 'action' | 'bonus' | 'reaction' | 'free';

const BY_IDENTIFIER = new Map<string, LockedBrowserSpell[]>();
const BY_NAME = new Map<string, LockedBrowserSpell[]>();
const ACTIVATION_BY_UUID = new Map<string, LockedDnd5eV14Activation>();

for (const spell of LOCKED_DND5E_V14_SPELLS) {
  add(BY_IDENTIFIER, spell.identifier, spell);
  add(BY_NAME, spell.name, spell);
  if (spell.activation) ACTIVATION_BY_UUID.set(spell.uuid, spell.activation);
}

export function resolveLockedDnd5eV14Spell(
  identifier: string,
  name: string,
  _environment?: Readonly<Record<string, string | undefined>>,
): LockedDnd5eV14Spell | undefined {
  const identifiers = BY_IDENTIFIER.get(normalize(identifier)) ?? [];
  const names = BY_NAME.get(normalize(name)) ?? [];
  if (identifiers.length !== 1 || names.length !== 1) return undefined;
  const left = identifiers[0]!;
  const right = names[0]!;
  return left.uuid === right.uuid ? { identifier: left.identifier, name: left.name, uuid: left.uuid } : undefined;
}

export function resolveLockedDnd5eV14SpellActivation(
  identifier: string,
  name: string,
  environment?: Readonly<Record<string, string | undefined>>,
): LockedDnd5eV14Activation | undefined {
  const spell = resolveLockedDnd5eV14Spell(identifier, name, environment);
  return spell ? ACTIVATION_BY_UUID.get(spell.uuid) : undefined;
}

function add(map: Map<string, LockedBrowserSpell[]>, key: string, spell: LockedBrowserSpell): void {
  const normalized = normalize(key);
  const entries = map.get(normalized) ?? [];
  entries.push(spell);
  map.set(normalized, entries);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
