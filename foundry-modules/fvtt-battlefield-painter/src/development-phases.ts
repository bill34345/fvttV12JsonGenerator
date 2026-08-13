export type DevelopmentPhase = "p0" | "p1";
export type DevelopmentPhaseSnapshot = Record<DevelopmentPhase, boolean>;

export const DEVELOPMENT_PHASE_CONTROLS_MUTABLE = true;

export class DevelopmentPhaseGate {
  readonly #mutable: boolean;
  readonly #phases: DevelopmentPhaseSnapshot = { p0: true, p1: true };

  constructor({
    mutable = DEVELOPMENT_PHASE_CONTROLS_MUTABLE,
  }: { mutable?: boolean } = {}) {
    this.#mutable = mutable;
  }

  isEnabled(phase: DevelopmentPhase): boolean {
    return this.#phases[phase];
  }

  snapshot(): DevelopmentPhaseSnapshot {
    return { ...this.#phases };
  }

  set(phase: DevelopmentPhase, enabled: boolean): DevelopmentPhaseSnapshot {
    if (!this.#mutable) {
      throw new Error("Development phase controls are disabled in a release build");
    }
    if (phase === "p0" && !enabled && this.#phases.p1) {
      throw new Error("P0 cannot be disabled while P1 is enabled");
    }
    this.#phases[phase] = enabled;
    return this.snapshot();
  }
}
