import type { ParsedNPC } from '../../config/mapping';
import { spellsMapper } from '../mapper/spells';
import { ActivityGenerator } from './activity';
import type { FvttTargetVersion } from '../foundryTarget';

/**
 * Extract spell names from spellcasting data.
 */
export function extractSpellNames(spellcasting: ParsedNPC['spellcasting']): string[] {
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

/**
 * Extract spellcasting lines from spellcasting data.
 */
export function extractSpellcastingLines(spellcasting: ParsedNPC['spellcasting']): string[] {
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

/**
 * Create spellcasting description item for English bestiary mode.
 */
export function createSpellcastingDescriptionItem(lines: string[]): any {
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

/**
 * Append legacy spell items to actor.
 */
export function appendLegacySpellItems(
  items: any[],
  spellcasting: ParsedNPC['spellcasting'],
  activityGenerator: ActivityGenerator,
  fvttVersion: FvttTargetVersion = '12',
): void {
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

  const spells = extractSpellNames(spellcasting);
  const dailyUses = extractDailySpellUses(spellcasting);

  let hasLinkedSpells = false;
  for (const spellName of spells) {
    const info = spellsMapper.get(spellName);
    if (info) {
      const act = activityGenerator.generateCast(info.uuid);
      ActivityGenerator.mergeUnique(spellcastingItem.system.activities, act);
      hasLinkedSpells = true;
    } else if (spellName) {
      items.push({
        name: spellName,
        type: 'spell',
        img: 'icons/svg/mystery-man.svg',
        system: fvttVersion === '14'
          ? {
            method: 'innate',
            prepared: 1,
            level: 0,
            ...(dailyUses.has(spellName.toLowerCase()) ? {
              uses: {
                spent: 0,
                max: dailyUses.get(spellName.toLowerCase()),
                recovery: [{ period: 'day', type: 'recoverAll' }],
              },
            } : {}),
          }
          : {
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

function extractDailySpellUses(spellcasting: ParsedNPC['spellcasting']): Map<string, number> {
  const result = new Map<string, number>();
  if (!Array.isArray(spellcasting)) return result;

  for (const entry of spellcasting) {
    if (typeof entry !== 'string') continue;
    const match = entry.match(/^\s*(\d+)\s*(?:次)?\s*\/\s*(?:每日|日|day)(?:\s*each)?\s*[:：]\s*(.+)$/i);
    if (!match?.[1] || !match[2]) continue;
    const uses = Number.parseInt(match[1], 10);
    for (const rawName of match[2].split(/[,，]/)) {
      const name = rawName.trim().replace(/[.;。；]$/g, '').toLowerCase();
      if (name) result.set(name, uses);
    }
  }

  return result;
}
