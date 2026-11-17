import type { ItemSpellStorageData } from '@fvtt-json-generator/models/item';
import { resolveLockedDnd5eV14Spell } from './v14SpellCatalog';
import { createStableDocumentId } from './stableId';

export function resolveStoredItemSpells(storage: ItemSpellStorageData) {
  return storage.spells.map(entry => {
    const spell = resolveLockedDnd5eV14Spell(entry.spell.identifier, entry.spell.name);
    if (spell?.level === undefined || spell.level < 1 || entry.level < spell.level) {
      throw new Error(`Unable to resolve stored spell "${entry.spell.name}" at level ${entry.level}.`);
    }
    return { ...entry, spell };
  });
}

export function projectItemSpellStorage(item: {
  name: string;
  system: Record<string, any>;
  flags?: Record<string, any>;
}, storage: ItemSpellStorageData): void {
  item.flags ??= {};
  (item.flags.fvttJsonGenerator ??= {}).spellStorage = { capacity: storage.capacity, foundLevels: storage.foundLevels };
  for (const [index, entry] of resolveStoredItemSpells(storage).entries()) {
    const id = createStableDocumentId({ item: item.name, kind: 'stored-spell', index, spell: entry.spell.uuid });
    item.system.activities[id] = {
      _id: id, type: 'cast', name: entry.spell.name,
      activation: {
        type: entry.spell.castingTime?.type ?? '', value: entry.spell.castingTime?.value ?? null, override: false,
      },
      spell: {
        uuid: entry.spell.uuid, level: entry.level, ability: entry.ability,
        challenge: { override: true, attack: String(entry.attackBonus), save: String(entry.saveDc) },
        properties: ['vocal', 'somatic', 'material'],
      },
      uses: { max: '1', spent: 0, recovery: [] },
      consumption: {
        targets: [{ type: 'activityUses', target: '', value: '1', scaling: { mode: '', formula: '' } }],
        spellSlot: false, scaling: { allowed: false, max: '' },
      },
    };
  }
  item.system.description.value += '<p>GM 在活动页逐条管理储存的法术。按实际消耗的法术位环阶计容量，记录原施法属性、豁免 DC 和法术攻击加值。法术用尽后可移除对应活动以整理库存。存入施法、容量不足和依赖原施法属性调整值的结算按原规则裁定。</p>';
}
