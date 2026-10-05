import { FIRE_STATIC_PROFILE } from "./catalog";
import type { GridOffset } from "./geometry";

export const FIRE_STATIC_VISUAL_EFFECT = "fire-static-v2" as const;
const modulo = (n: number, base: number): number => ((n % base) + base) % base;

/** Cell coordinates, never stroke or document IDs, determine the restored appearance. */
export function fireStaticAppearance({ i, j }: GridOffset): { texture: string; rotation: number } {
  const variant = modulo(j - i + 1, 3);
  const hash = Math.imul(i, 73856093) ^ Math.imul(j, 19349663);
  return { texture: FIRE_STATIC_PROFILE.textures[variant]!, rotation: (hash >>> 0) % 4 * 90 };
}
