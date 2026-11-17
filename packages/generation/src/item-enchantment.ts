import { ENCHANTED_WEAPON_RARITY, type ItemEnchantmentData } from '@fvtt-json-generator/models/item';
import { createStableDocumentId } from './stableId';

const WEAPON_CATEGORIES = ['simpleM', 'simpleR', 'martialM', 'martialR'];
const ARMOR_CATEGORIES = ['light', 'medium', 'heavy'];
const DAMAGE_NAMES: Record<string, string> = {
  acid: '强酸', bludgeoning: '钝击', cold: '寒冷', fire: '火焰', force: '力场',
  lightning: '闪电', necrotic: '黯蚀', piercing: '穿刺', poison: '毒素', psychic: '心灵',
  radiant: '光耀', slashing: '挥砍', thunder: '雷鸣',
};

type EnchantmentChange = { key: string; type: 'add' | 'override' | 'upgrade'; value: string | number };

export function enchantmentTargets(template: ItemEnchantmentData) {
  const weapon = template.kind === 'enchant-weapon-bonus';
  return { type: weapon ? 'weapon' : 'equipment', categories: weapon ? WEAPON_CATEGORIES : ARMOR_CATEGORIES,
    allowMagical: false, properties: [] };
}

export function projectItemEnchantment(item: {
  name: string;
  system: Record<string, any>;
  effects?: any[];
  flags?: Record<string, any>;
}, template: ItemEnchantmentData): void {
  const scope = { name: item.name, kind: template.kind };
  const idFor = (part: string) => createStableDocumentId({ ...scope, part });
  const makeEffect = (id: string, name: string, changes: EnchantmentChange[]) => ({
    _id: id, name, type: 'enchantment', disabled: true, transfer: false,
    system: { magical: true, changes }, statuses: [],
  });
  const profiles = [];
  const riderIds: string[] = [];
  item.effects ??= [];
  item.system.type = { value: '', baseItem: '' };
  if (!item.system.properties.includes('mgc')) item.system.properties.push('mgc');
  if (template.kind === 'enchant-weapon-bonus') {
    item.system.rarity = '';
    item.system.attunement = '';
    for (const bonus of template.bonuses) {
      const id = idFor(`weapon+${bonus}`);
      item.effects.push(makeEffect(id, `武器 +${bonus} Weapon +${bonus}`, [
        { key: 'name', type: 'override', value: `{} +${bonus}` },
        { key: 'system.magicalBonus', type: 'upgrade', value: bonus },
        { key: 'system.rarities', type: 'override', value: ENCHANTED_WEAPON_RARITY[bonus] },
        { key: 'system.properties', type: 'add', value: 'mgc' },
      ]));
      profiles.push({ _id: id, level: { min: null, max: null }, riders: { activity: [], effect: [], item: [] } });
    }
  } else {
    for (const type of template.damageTypes) {
      const name = `${DAMAGE_NAMES[type]}抗性 ${type[0]!.toUpperCase() + type.slice(1)} Resistance`;
      const id = idFor(`armor-${type}`);
      const riderId = idFor(`rider-${type}`);
      item.effects.push(makeEffect(id, name, [
        { key: 'name', type: 'override', value: `{} · ${name}` },
        { key: 'system.rarities', type: 'override', value: 'rare' },
        { key: 'system.attunement', type: 'override', value: 'required' },
        { key: 'system.properties', type: 'add', value: 'mgc' },
      ]), {
        _id: riderId, name, type: 'base', disabled: false, transfer: true, statuses: [],
        system: { magical: true, changes: [{ key: 'system.traits.dr.value', type: 'add', value: type }] },
      });
      riderIds.push(riderId);
      profiles.push({ _id: id, level: { min: null, max: null }, riders: { activity: [], effect: [riderId], item: [] } });
    }
    // These are cloned to the base armor only as riders of the selected profile.
    item.flags ??= {};
    item.flags.dnd5e = { ...item.flags.dnd5e, riders: { effect: riderIds } };
  }
  const activityId = idFor('enchant');
  item.system.activities[activityId] = {
    _id: activityId, type: 'enchant', name: '选择附魔变体 Choose Enchantment',
    activation: { type: '', value: null, override: false, condition: '' },
    duration: { units: 'inst', concentration: false, override: false },
    consumption: { spellSlot: false, targets: [], scaling: { allowed: false, max: '' } },
    uses: { max: '', spent: 0, recovery: [] },
    enchant: { self: false }, restrictions: enchantmentTargets(template), effects: profiles,
    appliedEffects: profiles.map(profile => profile._id),
  };
}
