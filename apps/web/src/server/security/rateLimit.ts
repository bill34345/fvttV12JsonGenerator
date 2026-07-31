import { isIP } from 'node:net';

const shortWindowMs = 60_000;
const defaultShortLimit = 10;
const defaultGlobalShortLimit = 100;

const shortRequests = new Map<string, number[]>();
let globalShortRequests: number[] = [];

export interface ClientIdentityOptions {
  remoteAddress?: string | null;
  trustedProxies?: readonly string[];
}

export interface ShortRateLimitOptions {
  clientLimit?: number;
  globalLimit?: number;
  now?: number;
}

export function getClientIp(
  request: Request,
  options: ClientIdentityOptions = {},
): string {
  const remoteAddress = normalizeIp(options.remoteAddress);
  if (!remoteAddress) return 'shared-unknown';

  const trustedProxies = new Set(
    (options.trustedProxies ?? []).map((address) => normalizeIp(address)).filter(Boolean),
  );
  if (!trustedProxies.has(remoteAddress)) return remoteAddress;

  const forwardedHeader = request.headers.get('x-forwarded-for');
  if (forwardedHeader?.trim()) {
    const forwarded = forwardedHeader.split(',').map((entry) => normalizeIp(entry));
    if (forwarded.some((entry) => !entry)) return remoteAddress;

    let current = remoteAddress;
    for (let index = forwarded.length - 1; index >= 0; index--) {
      if (!trustedProxies.has(current)) return current;
      current = forwarded[index] as string;
    }
    return current;
  }

  return normalizeIp(request.headers.get('x-real-ip')) ?? remoteAddress;
}

export function checkShortRateLimit(
  ip: string,
  options: ShortRateLimitOptions | number = {},
): boolean {
  const resolved = typeof options === 'number' ? { clientLimit: options } : options;
  const clientLimit = resolved.clientLimit ?? defaultShortLimit;
  const globalLimit = resolved.globalLimit ?? defaultGlobalShortLimit;
  const now = resolved.now ?? Date.now();
  const cutoff = now - shortWindowMs;
  pruneClientBuckets(cutoff);
  const recent = shortRequests.get(ip) ?? [];
  globalShortRequests = globalShortRequests.filter((at) => at > cutoff);

  if (recent.length >= clientLimit || globalShortRequests.length >= globalLimit) {
    return false;
  }

  recent.push(now);
  shortRequests.set(ip, recent);
  globalShortRequests.push(now);
  return true;
}

export function resetRateLimitForTests(): void {
  shortRequests.clear();
  globalShortRequests = [];
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let normalized = value.trim().replace(/^\[|\]$/g, '');
  if (normalized.toLowerCase().startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) normalized = mapped;
  }
  return isIP(normalized) === 0 ? null : normalized.toLowerCase();
}

function pruneClientBuckets(cutoff: number): void {
  for (const [identity, timestamps] of shortRequests) {
    const recent = timestamps.filter((at) => at > cutoff);
    if (recent.length === 0) shortRequests.delete(identity);
    else shortRequests.set(identity, recent);
  }
}
