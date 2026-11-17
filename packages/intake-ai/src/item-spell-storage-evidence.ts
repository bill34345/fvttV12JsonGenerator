import { readItemSpellStorage, type StoredItemSpell } from '@fvtt-json-generator/models/item';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { ItemCoreSpellResolver } from './item-core';
import type { ItemIntakeFinding } from './item-types';

const CAPACITY = /\b(?:store|hold)\s+up\s+to\s+5\s+levels?\s+worth of spells\b|(?:最多|至多|上限|不超[过過])[^。\n]{0,14}[5五]\s*(?:个|個)?\s*(?:法术|法術)?\s*[环環](?:阶|階)?/iu;
const FOUND = /\bwhen (?:first )?found\b|(?:发现|發現|找到)(?:(?:这枚|這枚|该|該)?戒指)?[时時]/iu;
const ORIGINAL = /\boriginal caster\b|原(?:本|先)?施法者/iu;
const RELEASE = /\b(?:no longer stored|freeing (?:up )?space|(?:spell|it) is removed after (?:it is used|casting))\b|不再[储儲]存|[释釋]放(?:相[应應]的?)?容量|腾出(?:相[应應]的?)?容量/iu;
const CURRENT_ENTRY = /^(?:[-*+]|\d+[.)])?\s*(?:当前储有|當前儲有|当前存有|现存法术|現存法術|已[储儲]存|currently (?:stores|holds|contains|stored)|stored spell\s*[:：])/iu;
const ABILITY: Record<StoredItemSpell['ability'], string> = {
  str: 'strength|力量', dex: 'dexterity|敏捷', con: 'constitution|体质|體質',
  int: 'intelligence|智力', wis: 'wisdom|感知', cha: 'charisma|魅力',
};
type Add = (code: string, path: string, message: string, origin: ItemIntakeFinding['origin'], evidence?: EvidenceRef[]) => void;

const normalize = (text: string) => text.normalize('NFKC').replace(/[−–]/gu, '-');
const explicitEntries = (text: string) => text.split(/\r?\n/u).map(line => line.trim().replace(/^\*{2,3}/u, ''))
  .filter(line => CURRENT_ENTRY.test(line));

export function sourceDescribesSpellStorage(source: string): boolean {
  const text = normalize(source);
  return CAPACITY.test(text) && FOUND.test(text) && ORIGINAL.test(text) && /1d6\s*-\s*1/iu.test(text);
}

export function validateSpellStorageEvidence(
  ability: Record<string, unknown>, path: string, evidence: EvidenceRef[], source: string, resolver: ItemCoreSpellResolver, add: Add,
): void {
  const storage = readItemSpellStorage(ability);
  if (!storage) {
    add('INVALID_SPELL_STORAGE', path, 'Spell storage needs complete original caster values and at most five stored slot levels.', 'semantic', evidence);
    return;
  }
  const quote = normalize(evidence.map(ref => ref?.quote ?? '').join('\n'));
  if (!sourceDescribesSpellStorage(quote)) {
    add('SPELL_STORAGE_RULES_NOT_EXPLICIT', path, 'Cite the total five-level capacity, discovery formula and original caster rule.', 'semantic', evidence);
  }
  if (!RELEASE.test(normalize(source))) {
    add('SPELL_STORAGE_RELEASE_NOT_PRESERVED', path, 'Preserve the source clause that releasing a stored spell removes it and frees capacity.', 'semantic', evidence);
  }
  const entries = explicitEntries(normalize(source));
  if (entries.length !== storage.spells.length) {
    add('SPELL_STORAGE_INVENTORY_MISMATCH', path, 'Preserve every explicitly stated current entry, and leave unspecified contents empty.', 'semantic', evidence);
  }
  const available = [...entries];
  for (const [index, entry] of storage.spells.entries()) {
    const spell = resolver.resolveSpell(entry.spell.identifier, entry.spell.name);
    if (spell?.level === undefined || spell.level < 1 || spell.level > entry.level) {
      add('UNRESOLVED_STORED_SPELL', `${path}/spells/${index}`, 'Resolve one 2024 leveled spell at the stated slot level or above its base level.', 'semantic', evidence);
      continue;
    }
    const match = available.findIndex((line) => matchStoredSpellLine(line, entry) && quote.includes(line));
    if (match < 0) add('STORED_SPELL_VALUES_NOT_EXPLICIT', `${path}/spells/${index}`,
      'Cite one explicit inventory entry giving the spell, expended slot level, original ability, save DC and attack bonus.', 'semantic', evidence);
    else available.splice(match, 1);
  }
}

function matchStoredSpellLine(line: string, entry: StoredItemSpell): boolean {
  const level = new RegExp(`(?:^|[^0-9])${entry.level}(?:st|nd|rd|th)?\\s*(?:环|環|[- ]level)|\\blevel\\s+${entry.level}(?!\\d)`, 'iu');
  const save = new RegExp(`\\bDC\\s*[:=]?\\s*${entry.saveDc}(?!\\d)`, 'iu');
  const attack = new RegExp(`(?:spell attack(?: bonus)?|(?:法术|法術)?攻[击擊](?:加值)?|命中(?:加值)?)\\s*[:=]?\\s*${entry.attackBonus >= 0 ? '\\+?' : '-'}\\s*${Math.abs(entry.attackBonus)}(?!\\d)`, 'iu');
  const ability = new RegExp(`\\b${entry.ability}\\b|${ABILITY[entry.ability]}`, 'iu');
  return line.toLowerCase().includes(entry.spell.name.toLowerCase()) && level.test(line) && save.test(line)
    && attack.test(line) && ability.test(line);
}
