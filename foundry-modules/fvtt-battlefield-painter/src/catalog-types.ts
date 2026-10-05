export type AdditionalTerrainId =
  | "earthquake" | "forceBarrier" | "grease" | "haze" | "deadlyHaze" | "hole"
  | "holyLight" | "lightningField" | "magicCircle" | "magicLight" | "magicPlatform"
  | "mold" | "moss" | "pillar" | "portal" | "rift"
  | "rune1" | "rune2" | "rune3" | "rune4" | "runes"
  | "sand" | "smoke" | "spikes" | "unholyLight" | "wildMagic"
  | "ruidiumVeinsSweep" | "ruidiumVeinsFan" | "ruidiumCrystalCrescent"
  | "ruidiumCrystalCross" | "ruidiumClusterThree" | "ruidiumClusterFive";

export type TerrainConfigurationId = "fire" | "frost" | "brambles" | "acid" | "flooding" | "lava" | "blood" | "spiderweb" | "rubble" | "wood" | AdditionalTerrainId;

export interface TerrainLight {
  color: string;
  dim: number;
  bright: number;
  alpha: number;
  attenuation?: number;
  luminosity?: number;
  coloration?: number;
  animation: {
    type: string;
    speed: number;
    intensity: number;
  };
}

export interface TerrainStageMedia {
  staticTexture: string;
  animatedTexture: string;
  /** Static texture used by an independent P2 runtime effect Tile. */
  effectBaseTexture?: string;
  /** Independent world-space runtime effect media. */
  fieldTexture?: string;
}

export interface TerrainStage {
  label: string;
  description: string;
  texture: string;
  /** Static artwork choices; persisted per cell, or once per whole spiderweb stroke. */
  textureVariants?: readonly string[];
  media: TerrainStageMedia;
  tint: string;
  alpha: number;
  light?: TerrainLight;
  createsWalls?: boolean;
  wallRestrictions?: { move: number; sight: number; light: number; sound: number };
}

export interface TerrainConfiguration {
  id: TerrainConfigurationId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  movementMultiplier: number;
  movementActions?: readonly string[];
  placement?: "cell" | "sheet";
  stages: readonly [TerrainStage, ...TerrainStage[]];
}
