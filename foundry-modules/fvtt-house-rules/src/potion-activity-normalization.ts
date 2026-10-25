import type { PotionActivities } from './core/potion';

type AnyRecord = Record<string, any>;

/** Project plans through the same registered Activity model that the Item uses.
 * Construction/serialization only: no createActivity, update, Hooks or persistence.
 * Normalize expected input only; normalizing actual data could erase a GM edit.
 */
export function normalizePotionActivities(
  item: AnyRecord,
  activities: PotionActivities,
  activityTypes: AnyRecord | undefined,
): AnyRecord | null {
  if (!activityTypes || typeof activityTypes !== 'object') return null;
  const normalized: AnyRecord = {};
  try {
    for (const [key, source] of Object.entries(activities)) {
      if (!Object.hasOwn(activityTypes, source.type)) return null;
      const ActivityClass = activityTypes[source.type]?.documentClass;
      if (typeof ActivityClass !== 'function') return null;
      // dnd5e 5.3.3/6.0.6 Item5e.createActivity uses this public constructor path.
      // Explicit planned IDs avoid creating a random document identity.
      const activity = new ActivityClass(structuredClone(source), { parent: item, strict: true });
      if (typeof activity?.toObject !== 'function') return null;
      const data = JSON.parse(JSON.stringify(activity.toObject(true)));
      if (!data || typeof data !== 'object' || Array.isArray(data)
        || data._id !== source._id || data.type !== source.type) return null;
      normalized[key] = data;
    }
  } catch {
    return null;
  }
  return normalized;
}
