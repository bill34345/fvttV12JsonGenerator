import { MAX_LEDGER_ENTRIES } from "../constants";

export interface LedgerEntry {
  kind: string;
  at: number;
}

export interface TransactionLedger {
  schema: 1;
  processed: Record<string, LedgerEntry>;
}

export function emptyLedger(): TransactionLedger {
  return { schema: 1, processed: {} };
}

/**
 * Foundry document updates treat dots in object keys as paths. Persisted
 * transaction keys therefore escape dots while the public transaction ID
 * remains human-readable and stable.
 */
export function ledgerStorageKey(transactionId: string): string {
  return transactionId.replaceAll(".", "%2E");
}

export function isTransactionProcessed(ledger: TransactionLedger | undefined, transactionId: string): boolean {
  const key = ledgerStorageKey(transactionId);
  return Boolean(ledger?.processed[key] ?? ledger?.processed[transactionId]);
}

/** Adds an event exactly once and evicts the oldest bounded entries deterministically. */
export function recordTransaction(
  prior: TransactionLedger | undefined,
  transactionId: string,
  kind: string,
  at: number,
  maximum = MAX_LEDGER_ENTRIES
): { applied: boolean; ledger: TransactionLedger } {
  const ledger = prior ? structuredClone(prior) : emptyLedger();
  const key = ledgerStorageKey(transactionId);
  if (ledger.processed[key] || ledger.processed[transactionId]) return { applied: false, ledger };
  ledger.processed[key] = { kind, at };
  const entries = Object.entries(ledger.processed)
    .sort(([leftId, left], [rightId, right]) => left.at - right.at || leftId.localeCompare(rightId));
  while (entries.length > maximum) {
    const [id] = entries.shift()!;
    delete ledger.processed[id];
  }
  return { applied: true, ledger };
}

/** Stable IDs must be derived only from document/event identity, never dice values. */
export function transactionId(...parts: Array<string | number | undefined | null>): string | null {
  if (parts.some((part) => part === undefined || part === null || String(part).trim() === "")) return null;
  return parts.map((part) => String(part)).join(":");
}
