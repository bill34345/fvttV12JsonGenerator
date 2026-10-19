import type { V14IconOverrideFile } from './types';

export function overrideSelectorKey(selector: V14IconOverrideFile['entries'][number]['selector']): string {
  return [
    normalizeSelectorValue(selector.itemType),
    selector.actorEnglishName ? `actor-en:${normalizeSelectorValue(selector.actorEnglishName)}` : '',
    selector.actorName ? `actor:${normalizeSelectorValue(selector.actorName)}` : '',
    selector.englishName ? `en:${normalizeSelectorValue(selector.englishName)}` : '',
    selector.name ? `name:${normalizeSelectorValue(selector.name)}` : '',
  ].filter(Boolean).join('|');
}

function normalizeSelectorValue(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}
