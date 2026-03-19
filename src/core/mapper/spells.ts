import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export interface SpellInfo {
  uuid: string;
  name: string;
  sourceId: string;
}

export class SpellsMapper {
  private spells: Map<string, SpellInfo> = new Map();
  private spellsLower: Map<string, SpellInfo> = new Map();
  private loaded = false;

  constructor() {
    this.loadSpells();
  }

  private generateId(seed: string): string {
    // Generate deterministic 16-char ID from seed string
    const hash = createHash('md5').update(seed).digest('hex');
    // Take first 16 chars, ensure casing mix to look like Foundry ID (optional, but hex is fine)
    return hash.substring(0, 16);
  }

  private loadSpells() {
    if (this.loaded) return;
    
    const path = join(process.cwd(), 'data', 'spells.ldb');
    if (!existsSync(path)) {
      console.warn(`Warning: spells.ldb not found at ${path}`);
      return;
    }

    try {
      const buffer = readFileSync(path);
      const marker = Buffer.from('!items!');
      let offset = 0;

      while (offset < buffer.length) {
        const markerIndex = buffer.indexOf(marker, offset);
        if (markerIndex === -1) break;

        // 1. Extract Key (Fallback info)
        let keyEnd = markerIndex + marker.length;
        while (keyEnd < buffer.length) {
           const byte = buffer[keyEnd];
           // Stop at non-printable chars (likely length prefixes or compression headers)
           if (byte === undefined || byte < 33 || byte > 126) break;
           keyEnd++;
        }
        const key = buffer.subarray(markerIndex + marker.length, keyEnd).toString('utf-8');

        // 2. Try to parse JSON (Best effort)
        let jsonStart = -1;
        const searchLimit = Math.min(buffer.length, keyEnd + 200);
        
        for (let i = keyEnd; i < searchLimit; i++) {
          if (buffer[i] === 123) { // '{'
            jsonStart = i;
            break;
          }
        }

        let spellInfo: SpellInfo | null = null;

        if (jsonStart !== -1) {
          // Brace counting
          let depth = 0;
          let jsonEnd = -1;
          const maxJsonLen = 100 * 1024;
          const endSearch = Math.min(buffer.length, jsonStart + maxJsonLen);

          for (let i = jsonStart; i < endSearch; i++) {
            if (buffer[i] === 123) depth++;
            else if (buffer[i] === 125) depth--;

            if (depth === 0) {
              jsonEnd = i + 1;
              break;
            }
          }

          if (jsonEnd !== -1) {
            try {
              const jsonStr = buffer.subarray(jsonStart, jsonEnd).toString('utf-8');
              const data = JSON.parse(jsonStr);
              if (data.name) {
                const uuid = data._id || this.generateId(data.name);
                spellInfo = {
                  uuid,
                  name: data.name,
                  sourceId: `Compendium.dnd5e.spells.Item.${uuid}`
                };
              }
            } catch (e) {
              // Ignore compression artifacts
            }
            offset = jsonEnd;
          } else {
            offset = keyEnd; // Move past key if JSON logic failed
          }
        } else {
          offset = keyEnd;
        }

        // 3. Fallback: Use Key if JSON failed
        if (!spellInfo && key && key.length > 3) {
          // Try to clean up key: "phbsplFireball00" -> "Fireball"
          // Heuristic: Remove common prefixes
          let cleanName = key;
          cleanName = cleanName.replace(/^phbspl/, '').replace(/^phb/, '');
          cleanName = cleanName.replace(/\d+$/, ''); // Remove trailing digits
          
          const uuid = this.generateId(key);
          spellInfo = {
            uuid,
            name: cleanName,
            sourceId: `Compendium.dnd5e.spells.Item.${uuid}`
          };
        }

        if (spellInfo) {
          this.spells.set(spellInfo.name, spellInfo);
          this.spellsLower.set(spellInfo.name.toLowerCase(), spellInfo);
          // Also index by key if it differs?
          // For now just name.
        }
      }
      this.loaded = true;
      console.log(`Loaded ${this.spells.size} spells from spells.ldb`);
    } catch (error) {
      console.error('Error loading spells.ldb:', error);
    }
  }

  public get(name: string): SpellInfo | undefined {
    const normalized = name.trim();
    return this.spells.get(normalized) ?? this.spellsLower.get(normalized.toLowerCase());
  }
}

export const spellsMapper = new SpellsMapper();
