import { LEGACY_BROWSER_SPELLS, type BrowserLegacySpell } from '../browser-legacy-spell-data';

export interface SpellInfo extends BrowserLegacySpell {}

export class SpellsMapper {
  private readonly spells = new Map<string, SpellInfo>();
  private readonly spellsLower = new Map<string, SpellInfo>();

  public constructor(entries: readonly SpellInfo[] = LEGACY_BROWSER_SPELLS) {
    for (const entry of entries) {
      this.spells.set(entry.name, entry);
      this.spellsLower.set(entry.name.toLowerCase(), entry);
    }
  }

  public get(name: string): SpellInfo | undefined {
    const normalized = name.trim();
    return this.spells.get(normalized) ?? this.spellsLower.get(normalized.toLowerCase());
  }
}

export const spellsMapper = new SpellsMapper();
