import type { ItemType } from '@fvtt-json-generator/models/item';

export function mapSourceItemTypeToFoundry(type: ItemType): string {
  if (type === 'ammunition' || type === 'consumable') return 'consumable';
  if (type === 'armor' || type === 'rod' || type === 'wand') return 'equipment';
  if (type === 'staff') return 'weapon';
  return type;
}
