export interface InspectorUses {
  readonly value: number;
  readonly max: number;
  readonly depleted: boolean;
}

export interface InspectorResource {
  readonly key: string;
  readonly name: string;
  readonly labelKey?: string;
  readonly uses?: InspectorUses;
  readonly quantity?: Readonly<{ value: number; depleted: boolean }>;
  readonly recharge?: number;
}

export interface InspectorSlot extends InspectorUses {
  readonly key: string;
  readonly level: number;
  readonly pact: boolean;
}

export interface InspectorReadouts {
  readonly passives: Readonly<{ perception: number | null; insight: number | null; investigation: number | null }>;
  readonly slots: readonly InspectorSlot[];
  readonly abilities: readonly InspectorResource[];
  readonly inventory: readonly InspectorResource[];
}

interface ActivityInput {
  id: string;
  uuid: string;
  name: string;
  uses?: InspectorUses;
  recharge?: number;
}

interface ItemInput {
  id: string;
  name: string;
  physical: boolean;
  consumable: boolean;
  cachedFor: string;
  uses?: InspectorUses;
  quantity?: Readonly<{ value: number; depleted: boolean }>;
  recharge?: number;
  activities: ActivityInput[];
}

export function projectInspectorReadouts(actor: any): InspectorReadouts {
  const system = actor.system ?? {};
  const items = collectionValues(actor.items).map(normalizeItem);
  const abilities = actorResources(system.resources);
  const inventory: InspectorResource[] = [];

  for (const item of items) {
    if (isCachedActivityCopy(item, items)) continue;
    const target = item.physical ? inventory : abilities;
    if (item.uses || item.consumable && item.quantity || item.physical && item.quantity && item.activities.some((activity) => activity.uses)) {
      target.push({ key: `item:${item.id}`, name: item.name, uses: item.uses,
        quantity: item.physical ? item.quantity : undefined, recharge: item.recharge });
    }
    // An activity without its own prepared pool shares its parent's pool; it is not another resource.
    for (const activity of item.activities) {
      if (!activity.uses) continue;
      target.push({ key: `activity:${item.id}:${activity.id}`,
        name: activity.name && activity.name !== item.name ? `${item.name} · ${activity.name}` : item.name,
        uses: activity.uses, recharge: activity.recharge });
    }
  }

  return {
    passives: {
      perception: preparedNumber(system.skills?.prc?.passive),
      insight: preparedNumber(system.skills?.ins?.passive),
      investigation: preparedNumber(system.skills?.inv?.passive),
    },
    slots: spellSlots(system.spells), abilities, inventory,
  };
}

function normalizeItem(item: any, index: number): ItemInput {
  const system = item.system ?? {};
  const quantity = preparedNumber(system.quantity);
  return {
    id: String(item.id ?? item._id ?? index), name: String(item.name ?? ''),
    physical: ['equipment', 'weapon', 'tool', 'loot', 'container', 'backpack', 'consumable'].includes(item.type),
    consumable: item.type === 'consumable', cachedFor: String(item.flags?.dnd5e?.cachedFor ?? ''),
    uses: usesCounter(system.uses),
    quantity: quantity !== null && quantity >= 0 ? { value: quantity, depleted: quantity === 0 } : undefined,
    recharge: rechargeThreshold(system.uses),
    activities: collectionValues(system.activities).map((activity, activityIndex) => ({
      id: String(activity.id ?? activity._id ?? activityIndex), uuid: String(activity.uuid ?? ''),
      name: String(activity.name ?? ''), uses: usesCounter(activity.uses), recharge: rechargeThreshold(activity.uses),
    })),
  };
}

function spellSlots(spells: any): InspectorSlot[] {
  const slots: InspectorSlot[] = [];
  for (let level = 1; level <= 9; level += 1) {
    const key = `spell${level}`, uses = usesCounter(spells?.[key]);
    if (uses) slots.push({ key, level, pact: false, ...uses });
  }
  const pact = usesCounter(spells?.pact), level = preparedNumber(spells?.pact?.level);
  if (pact && level !== null && level > 0) slots.push({ key: 'pact', level, pact: true, ...pact });
  return slots;
}

function actorResources(resources: any): InspectorResource[] {
  const result: InspectorResource[] = [];
  const labels = {
    primary: 'DND5E.ResourcePrimary', secondary: 'DND5E.ResourceSecondary', tertiary: 'DND5E.ResourceTertiary',
    legact: 'DND5E.LegendaryAction.LabelPl', legres: 'DND5E.LegendaryResistance.LabelPl',
  };
  for (const [key, labelKey] of Object.entries(labels)) {
    const resource = resources?.[key], uses = usesCounter(resource);
    if (!uses) continue;
    const name = String(resource.label ?? '').trim();
    result.push({ key: `actor:${key}`, name, labelKey: name ? undefined : labelKey, uses });
  }
  return result;
}

function usesCounter(uses: any): InspectorUses | undefined {
  const max = preparedNumber(uses?.max), value = preparedNumber(uses?.value);
  if (max === null || max <= 0 || value === null || value < 0) return undefined;
  return { value, max, depleted: value === 0 };
}

function rechargeThreshold(uses: any): number | undefined {
  const recovery = collectionValues(uses?.recovery).find((entry) => entry.period === 'recharge');
  const formula = String(recovery?.formula ?? '');
  return /^[1-6]$/.test(formula) ? Number(formula) : undefined;
}

function isCachedActivityCopy(item: ItemInput, items: readonly ItemInput[]): boolean {
  if (!item.cachedFor) return false;
  return items.some((owner) => owner.activities.some((activity) =>
    item.cachedFor === activity.uuid && activity.uuid !== ''
      || item.cachedFor.endsWith(`.Item.${owner.id}.Activity.${activity.id}`)));
}

function preparedNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collectionValues(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === 'function') return [...value.values()];
  return Object.values(value);
}
