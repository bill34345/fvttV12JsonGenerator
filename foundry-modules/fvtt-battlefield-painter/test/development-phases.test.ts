import { describe, expect, test } from "bun:test";

import {
  DEVELOPMENT_PHASE_CONTROLS_MUTABLE,
  DevelopmentPhaseGate,
} from "../src/development-phases";

describe("DevelopmentPhaseGate", () => {
  test("starts with P0 and P1 enabled in alpha development", () => {
    expect(DEVELOPMENT_PHASE_CONTROLS_MUTABLE).toBe(true);
    expect(new DevelopmentPhaseGate().snapshot()).toEqual({ p0: true, p1: true });
  });

  test("allows the internal P1 phase to be disabled during alpha diagnosis", () => {
    const phases = new DevelopmentPhaseGate();
    phases.set("p1", false);
    expect(phases.isEnabled("p1")).toBe(false);
  });

  test("locks phase controls in a release build", () => {
    const phases = new DevelopmentPhaseGate({ mutable: false });
    expect(() => phases.set("p1", false)).toThrow("release build");
    expect(phases.snapshot()).toEqual({ p0: true, p1: true });
  });
});
