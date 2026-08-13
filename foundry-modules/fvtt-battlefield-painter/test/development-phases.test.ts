import { describe, expect, test } from "bun:test";

import {
  DEVELOPMENT_PHASE_CONTROLS_MUTABLE,
  DevelopmentPhaseGate,
} from "../src/development-phases";

describe("DevelopmentPhaseGate", () => {
  test("starts with P0, P1, and P2 enabled in alpha development", () => {
    expect(DEVELOPMENT_PHASE_CONTROLS_MUTABLE).toBe(true);
    expect(new DevelopmentPhaseGate().snapshot()).toEqual({
      p0: true,
      p1: true,
      p2: true,
    });
  });

  test("allows the internal P1 phase to be disabled during alpha diagnosis", () => {
    const phases = new DevelopmentPhaseGate();
    phases.set("p1", false);
    expect(phases.isEnabled("p1")).toBe(false);
    expect(phases.isEnabled("p2")).toBe(true);
  });

  test("allows P2 to be disabled independently from P1", () => {
    const phases = new DevelopmentPhaseGate();
    phases.set("p2", false);
    expect(phases.snapshot()).toEqual({ p0: true, p1: true, p2: false });
    phases.set("p2", true);
    phases.set("p1", false);
    expect(phases.snapshot()).toEqual({ p0: true, p1: false, p2: true });
  });

  test("keeps P0 enabled while P1 or P2 is enabled", () => {
    const phases = new DevelopmentPhaseGate();
    expect(() => phases.set("p0", false)).toThrow("P0 cannot be disabled");
    phases.set("p1", false);
    expect(() => phases.set("p0", false)).toThrow("P0 cannot be disabled");
    phases.set("p2", false);
    expect(phases.set("p0", false)).toEqual({
      p0: false,
      p1: false,
      p2: false,
    });
  });

  test("does not allow P1 or P2 to be enabled after P0 is disabled", () => {
    const phases = new DevelopmentPhaseGate();
    phases.set("p1", false);
    phases.set("p2", false);
    phases.set("p0", false);

    expect(() => phases.set("p1", true)).toThrow(
      "P0 must be enabled before P1 or P2 can be enabled",
    );
    expect(() => phases.set("p2", true)).toThrow(
      "P0 must be enabled before P1 or P2 can be enabled",
    );
  });

  test("locks phase controls in a release build", () => {
    const phases = new DevelopmentPhaseGate({ mutable: false });
    expect(() => phases.set("p1", false)).toThrow("release build");
    expect(phases.snapshot()).toEqual({ p0: true, p1: true, p2: true });
  });
});
