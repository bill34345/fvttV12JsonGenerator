import { describe, expect, test } from "bun:test";

import {
  createLegacySoundPreview,
  deleteLegacySounds,
  isLegacySoundPreviewCurrent,
  ownedLegacySoundIds,
  type LegacySoundPreview,
} from "../src/legacy-sounds";

const owned = (id: string) => ({
  id,
  flags: {
    "fvtt-battlefield-painter": {
      bundleId: `bundle-${id}`,
      configurationId: "fire",
      stageIndex: 0,
      role: "terrain-sound",
    },
  },
});

describe("legacy Battlefield Painter sounds", () => {
  test("indexes only owned legacy AmbientSound documents", () => {
    const scene = {
      sounds: [owned("sound-b"), { id: "foreign", flags: { other: {} } }, owned("sound-a")],
    };

    expect(ownedLegacySoundIds(scene)).toEqual(["sound-a", "sound-b"]);
    expect(createLegacySoundPreview(scene)).toMatchObject({
      soundIds: ["sound-a", "sound-b"],
      fingerprint: '["sound-a","sound-b"]',
      requiresConfirmation: true,
    });
  });

  test("rejects stale confirmation and deletes only listed owned sounds", async () => {
    const calls: Array<[string, string[]]> = [];
    const scene: any = {
      sounds: [owned("sound-a"), { id: "foreign", flags: { other: {} } }],
      async deleteEmbeddedDocuments(name: string, ids: string[]) {
        calls.push([name, ids]);
        scene.sounds = scene.sounds.filter(({ id }: any) => !ids.includes(id));
      },
    };
    const preview = createLegacySoundPreview(scene);
    expect(isLegacySoundPreviewCurrent(scene, preview)).toBe(true);
    scene.sounds.push(owned("sound-b"));
    expect(isLegacySoundPreviewCurrent(scene, preview)).toBe(false);
    await expect(deleteLegacySounds(scene, preview)).rejects.toThrow("stale");

    const current = createLegacySoundPreview(scene);
    await deleteLegacySounds(scene, current);
    expect(calls).toEqual([["AmbientSound", ["sound-a", "sound-b"]]]);
    expect(scene.sounds.map(({ id }: any) => id)).toEqual(["foreign"]);
  });

  test("deletes the freshly revalidated owned IDs instead of trusting a mutable preview", async () => {
    const calls: string[][] = [];
    const scene: any = {
      sounds: [owned("sound-a"), { id: "foreign", flags: { other: {} } }],
      async deleteEmbeddedDocuments(_name: string, ids: string[]) {
        calls.push(ids);
        scene.sounds = scene.sounds.filter(({ id }: any) => !ids.includes(id));
      },
    };
    const current = createLegacySoundPreview(scene);
    const forged = {
      ...current,
      soundIds: ["foreign"],
    } as unknown as LegacySoundPreview;

    await deleteLegacySounds(scene, forged);

    expect(calls).toEqual([["sound-a"]]);
    expect(scene.sounds.map(({ id }: any) => id)).toEqual(["foreign"]);
  });
});
