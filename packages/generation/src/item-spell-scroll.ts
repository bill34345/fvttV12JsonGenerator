import { DND5E_V14_SPELL_SCROLL_LEVELS } from '@fvtt-json-generator/contracts/target';
import type { ItemSpellScrollData } from '@fvtt-json-generator/models/item';
import { resolveLockedDnd5eV14Spell } from './v14SpellCatalog';

export function resolveStandardSpellScroll(scroll: ItemSpellScrollData) {
  const spell = scroll.spell ? resolveLockedDnd5eV14Spell(scroll.spell.identifier, scroll.spell.name) : undefined;
  if (scroll.spell && (!spell || spell.level === undefined || (scroll.level !== undefined && spell.level !== scroll.level))) {
    throw new Error('The scroll must bind one locked 2024 spell at its base level.');
  }
  const level = spell?.level ?? scroll.level;
  const row = level === undefined ? undefined : DND5E_V14_SPELL_SCROLL_LEVELS[level];
  if (!row || level === undefined) throw new Error('A standard Spell Scroll needs a supported level.');
  const [dc, attack, rarity] = row;
  return { level, dc, attack, rarity, spell };
}
