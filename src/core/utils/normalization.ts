export function normalizeActor(actor: any): any {
  if (!actor) return actor;
  const copy = JSON.parse(JSON.stringify(actor));

  // Remove top-level volatile fields
  delete copy._id;
  delete copy.sort;
  delete copy._stats;
  delete copy.ownership;
  delete copy.folder;
  
  // Normalize items
  if (Array.isArray(copy.items)) {
    copy.items = copy.items.map((item: any) => normalizeItem(item));
    // Sort items by name to ensure consistent order for comparison?
    // Or assume order matches? 
    // Template strategy replaces items array, so order should be deterministic from input.
    // But Golden Master items might be sorted differently.
    // Let's sort by name for robust comparison.
    copy.items.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  }

  // Normalize effects
  if (Array.isArray(copy.effects)) {
    copy.effects = copy.effects.map((e: any) => normalizeItem(e));
    copy.effects.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  }

  return copy;
}

function normalizeItem(item: any): any {
  delete item._id;
  delete item.sort;
  delete item._stats;
  delete item.ownership;
  delete item.folder;
  
  // Normalize activities inside item
  if (item.system?.activities) {
    // Activities is Record<string, Activity>
    // Map to array and sort? Or keep as object but normalize values?
    // IDs are random. So we can't compare keys easily unless we map them.
    // But for comparison, we might want to check "Does it have an Attack activity?"
    // For Exact Match, we need to strip IDs from keys? 
    // Convert to array of values sorted by type/name.
    const activities = Object.values(item.system.activities).map((a: any) => {
        const ac = { ...a };
        delete ac._id;
        return ac;
    });
    // Sort by type
    activities.sort((a: any, b: any) => (a.type || '').localeCompare(b.type || ''));
    item.system.activities = activities; // Replace object with array for comparison
  }
  
  return item;
}
