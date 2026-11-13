import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import { spellsMapper } from './spellsMapper';
import { ActivityGenerator } from './activity';
import type { FvttTargetVersion } from './target';
import { displayNameIdentityCandidates } from '@fvtt-json-generator/models/display-name';
import { resolveLockedDnd5eV14SpellByName } from './v14SpellCatalog';
import { renderFoundryItemDescriptionHtml } from './item-description';

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
  options: { spellcastingAbility?: string } = {},
): void {
  if (fvttVersion === '14') {
    appendV14Spellcasting(items, spellcasting, activityGenerator, options.spellcastingAbility);
    return;
  }
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
        system: { preparation: { mode: 'innate' }, level: 0 },
      });
    }
  }

  if (hasLinkedSpells) {
    items.push(spellcastingItem);
  }
}

function appendV14Spellcasting(items: any[], spellcasting: ParsedNPC['spellcasting'], generator: ActivityGenerator, ability?: string): void {
  const lines = extractSpellcastingLines(spellcasting);
  const normalizedLines = lines.map(line => line.replaceAll('：', ':').replaceAll('，', ','));
  const names = extractSpellNames(normalizedLines);
  const dailyUses = extractDailySpellUses(spellcasting);
  const dailyRows = normalizedLines.flatMap(line => {
    const match = line.match(/^\s*(\d+)\s*(?:次)?\s*\/\s*(?:每日|日|day)(\s*each)?\s*:/i);
    return match ? [{ names: extractSpellNames([line]), each: Boolean(match[2]) }] : [];
  });
  const pending: Array<{ name: string; reason: string; castingTime?: { type: string; value: number | null } }> = [];
  const item = createSpellcastingDescriptionItem(lines);
  item.name = '施法 Spellcasting';
  item.system.description.value = renderFoundryItemDescriptionHtml(lines.join('\n'));
  item.flags = { fvttJsonGenerator: { sourceSpellcasting: lines, pendingSpells: pending } };

  for (const name of names) {
    const candidates = displayNameIdentityCandidates(name).filter(candidate => /^[A-Za-z]/u.test(candidate));
    const matches = candidates.map(candidate => resolveLockedDnd5eV14SpellByName(candidate)).filter(spell => spell !== undefined);
    const unique = [...new Map(matches.map(spell => [spell.uuid, spell])).values()];
    const spell = unique.length === 1 ? unique[0] : undefined;
    const maximum = dailyUses.get(name.toLowerCase());
    const limitRows = dailyRows.filter(row => row.names.includes(name));
    const atWill = normalizedLines.some(line => /^\s*(?:随意|at[- ]will|cantrips?\s*\(at[- ]will\))\s*:/iu.test(line)
      && extractSpellNames([line]).includes(name));
    const reasons = [
      ...(!spell ? ['没有唯一的 dnd5e 6／2024 法术目录匹配'] : []),
      ...(spell && spell.level === undefined ? ['目录未提供法术等级'] : []),
      ...(spell && !spell.activation ? [spell.castingTime
        ? `该法术的施法时间为 ${spell.castingTime.value ?? ''} ${spell.castingTime.type}，当前自动施法尚不支持此施法时间`
        : '目录未提供施法时间'] : []),
      ...(!ability ? ['来源没有提供可用的施法属性'] : []),
      ...(maximum === undefined && !atWill ? ['来源没有明确随意施法或每日次数，未自动赋予无限次数'] : []),
      ...(maximum !== undefined && atWill ? ['同一法术同时出现在随意与每日次数行中，未合并这两种使用方式'] : []),
      ...(limitRows.some(row => row.names.length > 1 && !row.each) ? ['多法术每日次数行没有明确每种各自的次数，未拆成独立次数池'] : []),
      ...(limitRows.length > 1 ? ['同名法术存在多个每日次数行，未覆盖或合并这些限制'] : []),
    ];
    if (reasons.length) { pending.push({ name, reason: reasons.join('；'), ...(spell?.castingTime ? { castingTime: spell.castingTime } : {}) }); continue; }
    const activities = generator.generateCast(spell!.uuid);
    const cast = Object.values<any>(activities)[0];
    cast.name = name;
    cast.spell = { ...cast.spell, ability, level: spell!.level, spellbook: false };
    cast.activation = { type: spell!.activation, value: spell!.castingTime?.value ?? null, override: false };
    cast.uses = { spent: 0, max: maximum === undefined ? '' : String(maximum), recovery: maximum === undefined ? [] : [{ period: 'day', type: 'recoverAll' }] };
    cast.consumption = { targets: maximum === undefined ? [] : [{ type: 'activityUses', target: '', value: '1', scaling: { mode: '', formula: '' } }], spellSlot: false, scaling: { allowed: false, max: '' } };
    ActivityGenerator.mergeUnique(item.system.activities, activities);
  }
  if (!names.length) pending.push({ name: '施法 Spellcasting', reason: '无法从旧格式中确定独立法术条目；完整原文已保留' });
  if (pending.length) item.system.description.value += renderFoundryItemDescriptionHtml('待GM按原文处理：\n' + pending.map(entry => `${entry.name}：${entry.reason}`).join('\n'));
  items.push(item);
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
