import { asRecord, sha256, stringValue } from './internals';
import type { NativeItemSource } from './types';

/** Refresh the per-Item migration identity after all persisted fields are projected. */
export function refreshNativeBloodHunterItemLogicalHash(item: NativeItemSource): void {
  const metadata = asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).bloodHunter2024);
  const sourceKey = stringValue(metadata.sourceKey);
  const automation = stringValue(metadata.automation);
  if (!sourceKey || !automation) throw new Error(`Blood Hunter Item ${item._id} lacks source metadata for logical hash.`);
  metadata.logicalHash = sha256({ name: item.name, type: item.type, system: item.system, effects: item.effects, sourceKey, automation });
}
