import { asArray, asRecord } from './internals';
import { refreshNativeBloodHunterItemLogicalHash } from './item-hash';
import type { NativeBloodHunterPackage } from './types';

/** Project the locked 5.3.3 Advancement content to the 6.0.2 stored shape without rekeying grants. */
export function projectDnd6Advancements(pkg: Omit<NativeBloodHunterPackage, 'logicalHash'>): void {
  for (const item of [...pkg.classes, ...pkg.subclasses, ...pkg.features]) {
    const advancements = Object.values(asRecord(item.system.advancement)).map(asRecord);
    for (const advancement of advancements) {
      advancement.name = advancement.title;
      delete advancement.title;
      if (advancement.icon !== undefined) {
        advancement.img = advancement.icon;
        delete advancement.icon;
      }
      if (advancement.type === 'ItemChoice') {
        const configuration = asRecord(advancement.configuration);
        configuration.pool = asArray<string>(configuration.pool).map((uuid) => ({ uuid }));
      }
    }
    if (advancements.length > 0) refreshNativeBloodHunterItemLogicalHash(item);
  }
}
