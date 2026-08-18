export interface SiteAiQuotaConfig {
  perSessionDaily: number;
  perIpDaily: number;
  globalDaily: number;
  perSessionConcurrent: number;
  globalConcurrent: number;
}

export interface SiteAiQuotaLease {
  release(): void;
}

export class SiteAiQuota {
  private day = '';
  private globalDaily = 0;
  private globalConcurrent = 0;
  private readonly sessionDaily = new Map<string, number>();
  private readonly ipDaily = new Map<string, number>();
  private readonly sessionConcurrent = new Map<string, number>();

  constructor(private readonly config: SiteAiQuotaConfig, private readonly now: () => number = Date.now) {}

  acquire(sessionId: string, ip: string): SiteAiQuotaLease {
    this.rotateDay();
    const concurrent = this.sessionConcurrent.get(sessionId) ?? 0;
    if (concurrent >= this.config.perSessionConcurrent || this.globalConcurrent >= this.config.globalConcurrent) {
      throw new Error('Site AI concurrent quota exceeded.');
    }
    if ((this.sessionDaily.get(sessionId) ?? 0) >= this.config.perSessionDaily) {
      throw new Error('Site AI session quota exceeded.');
    }
    if ((this.ipDaily.get(ip) ?? 0) >= this.config.perIpDaily) {
      throw new Error('Site AI IP quota exceeded.');
    }
    if (this.globalDaily >= this.config.globalDaily) {
      throw new Error('Site AI global quota exceeded.');
    }

    this.sessionDaily.set(sessionId, (this.sessionDaily.get(sessionId) ?? 0) + 1);
    this.ipDaily.set(ip, (this.ipDaily.get(ip) ?? 0) + 1);
    this.globalDaily += 1;
    this.sessionConcurrent.set(sessionId, concurrent + 1);
    this.globalConcurrent += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const next = Math.max(0, (this.sessionConcurrent.get(sessionId) ?? 1) - 1);
        if (next === 0) this.sessionConcurrent.delete(sessionId);
        else this.sessionConcurrent.set(sessionId, next);
        this.globalConcurrent = Math.max(0, this.globalConcurrent - 1);
      },
    };
  }

  snapshot(sessionId: string, ip: string) {
    this.rotateDay();
    return {
      day: this.day,
      sessionRemaining: Math.max(0, this.config.perSessionDaily - (this.sessionDaily.get(sessionId) ?? 0)),
      ipRemaining: Math.max(0, this.config.perIpDaily - (this.ipDaily.get(ip) ?? 0)),
      globalRemaining: Math.max(0, this.config.globalDaily - this.globalDaily),
    };
  }

  private rotateDay(): void {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day === this.day) return;
    this.day = day;
    this.globalDaily = 0;
    this.sessionDaily.clear();
    this.ipDaily.clear();
  }
}
