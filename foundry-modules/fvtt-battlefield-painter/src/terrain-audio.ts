import type { TerrainConfigurationId } from "./catalog";
const root = "modules/fvtt-battlefield-painter/assets/audio";
/** New opt-in native ambience. Rift and Wild Magic deliberately remain excluded. */
export const TERRAIN_AUDIO: Partial<Record<TerrainConfigurationId, { path: string; volume: number }>> = {
  acid: { path: `${root}/acid-loop.ogg`, volume: 0.40 },
  fire: { path: `${root}/fire-loop.ogg`, volume: 0.80 },
  forceBarrier: { path: `${root}/energy-loop.ogg`, volume: 0.10 },
  holyLight: { path: `${root}/chime-loop.ogg`, volume: 0.30 },
  lava: { path: `${root}/lava-loop.ogg`, volume: 0.80 },
  lightningField: { path: `${root}/energy-loop.ogg`, volume: 0.10 },
  magicCircle: { path: `${root}/magic-circle-loop.ogg`, volume: 0.25 },
  portal: { path: `${root}/energy-loop.ogg`, volume: 0.10 },
  unholyLight: { path: `${root}/drone-loop.ogg`, volume: 0.70 },
};
