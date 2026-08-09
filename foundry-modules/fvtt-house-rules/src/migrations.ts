import type { AmmoLedger } from "./core/ammo";
import type { TransactionLedger } from "./core/ledger";

/**
 * v1 has no prior released module schema. These guards are deliberately strict:
 * unknown Actor flag schemas are not replaced or "best guessed" during a write.
 */
export function isV1TransactionLedger(value: unknown): value is TransactionLedger {
  return Boolean(value && typeof value === "object" && (value as { schema?: unknown }).schema === 1
    && typeof (value as { processed?: unknown }).processed === "object");
}

export function isV1AmmoLedger(value: unknown): value is AmmoLedger {
  return Boolean(value && typeof value === "object" && (value as { schema?: unknown }).schema === 1
    && typeof (value as { shots?: unknown }).shots === "object");
}
