const shortWindowMs = 60_000;
const defaultShortLimit = 10;

const shortRequests = new Map<string, number[]>();

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'local';
}

export function checkShortRateLimit(ip: string, limit = defaultShortLimit): boolean {
  const now = Date.now();
  const recent = (shortRequests.get(ip) ?? []).filter((at) => now - at < shortWindowMs);
  if (recent.length >= limit) {
    shortRequests.set(ip, recent);
    return false;
  }

  recent.push(now);
  shortRequests.set(ip, recent);
  return true;
}

export function resetRateLimitForTests(): void {
  shortRequests.clear();
}
