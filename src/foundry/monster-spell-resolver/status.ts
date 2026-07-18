import { RESOLVER_MODULE_ID } from '../../core/spell-resolution';

export const RESOLVER_STATUS_VALUES = [
  'pending',
  'resolving',
  'needs_review',
  'hydrated',
  'stale',
  'incompatible',
  'failed',
  'failed-recovery-required',
] as const;

export type ResolverStatus = typeof RESOLVER_STATUS_VALUES[number];

export interface ResolverStatusContext {
  active?: boolean;
  ephemeral?: ResolverStatus;
}

export function isResolverStatus(value: unknown): value is ResolverStatus {
  return typeof value === 'string' && (RESOLVER_STATUS_VALUES as readonly string[]).includes(value);
}

/** Resolving is intentionally derived from memory so Task 7 snapshots the true pre-write status. */
export function readResolverStatus(actor: any, context: ResolverStatusContext = {}): ResolverStatus {
  if (context.active) return 'resolving';
  if (isResolverStatus(context.ephemeral)) return context.ephemeral;
  const stored = actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.status;
  return isResolverStatus(stored) ? stored : 'pending';
}

export function resolverStatusLabel(status: ResolverStatus): string {
  return `FVTTJSONSPELL.Status.${status}`;
}
