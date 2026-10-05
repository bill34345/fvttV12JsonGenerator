import { BRAMBLE_STATIC_PROFILE } from "./catalog";
import { MODULE_ID } from "./constants";
import type { GridOffset } from "./geometry";
import { terrainDocumentFlag } from "./terrain-document";

export const BRAMBLE_STATIC_VISUAL_EFFECT = "brambles-static-v2" as const;
const rotations = [0, 90, 180, 270, 180, 90, 90, 0, 270] as const;
const modulo = (n: number): number => ((n % 3) + 3) % 3;

/** Stable cell-based placement preserves survivors when a stroke is split or erased. */
export function brambleStaticAppearance({ i, j }: GridOffset, stageIndex: number) {
  const texture = BRAMBLE_STATIC_PROFILE.textures[stageIndex];
  if (!texture) throw new Error("Unknown bramble stage");
  return { texture, rotation: rotations[modulo(i) * 3 + modulo(j)]! };
}

/** Native Tiles need no extra mesh, animation ticker or client rendering preference. */
export function auditNativeBrambles(root: any = globalThis) {
  const tiles = [...(root.canvas?.scene?.tiles ?? [])].filter(
    tile => terrainDocumentFlag(tile)?.configurationId === "brambles",
  );
  const native = tiles.filter(tile => tile.flags[MODULE_ID].visualEffect === BRAMBLE_STATIC_VISUAL_EFFECT);
  return {
    mode: "native" as const,
    sceneId: root.canvas?.scene?.id ?? null,
    cells: native.length,
    loadedTiles: native.filter(tile => tile.object?.mesh?.texture?.valid === true).length,
    legacyTiles: tiles.length - native.length,
    mounted: false,
    meshCount: 0,
    lastError: null,
  };
}
