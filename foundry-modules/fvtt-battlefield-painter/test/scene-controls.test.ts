import { describe, expect, test } from "bun:test";

import { addPainterSceneControl } from "../src/scene-controls";

describe("scene controls", () => {
  test("adds a GM-only button to the Tiles control group", () => {
    const controls = { tiles: { tools: {} as Record<string, unknown> } };
    const open = () => undefined;

    expect(addPainterSceneControl(controls, true, open)).toBe(true);
    expect(controls.tiles.tools["fvtt-battlefield-painter"]).toMatchObject({
      name: "fvtt-battlefield-painter",
      button: true,
      icon: "fa-solid fa-fire-flame-curved",
      onChange: open,
    });
  });

  test("does not expose mutation controls to non-GM users", () => {
    const controls = { tiles: { tools: {} as Record<string, unknown> } };

    expect(addPainterSceneControl(controls, false, () => undefined)).toBe(false);
    expect(controls.tiles.tools).toEqual({});
  });
});
