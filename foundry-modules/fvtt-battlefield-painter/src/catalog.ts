export type TerrainConfigurationId = "fire" | "frost" | "brambles";

export interface TerrainLight {
  color: string;
  dim: number;
  bright: number;
  alpha: number;
  animation: {
    type: string;
    speed: number;
    intensity: number;
  };
}

export interface TerrainStage {
  label: string;
  description: string;
  texture: string;
  tint: string;
  alpha: number;
  light?: TerrainLight;
  createsWalls?: boolean;
}

export interface TerrainConfiguration {
  id: TerrainConfigurationId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  movementMultiplier: number;
  stages: readonly [TerrainStage, TerrainStage];
}

const ASSET_ROOT = "modules/fvtt-battlefield-painter/assets/terrain";

export const TERRAIN_CONFIGURATIONS: Record<
  TerrainConfigurationId,
  TerrainConfiguration
> = {
  fire: {
    id: "fire",
    label: "烈焰地带",
    shortLabel: "火焰",
    description: "跃动的炭火与火舌照亮危险区域。",
    accent: "#ff6a2a",
    movementMultiplier: 2,
    stages: [
      {
        label: "余烬",
        description: "散落的炭火开始蔓延。",
        texture: `${ASSET_ROOT}/fire-embers.webp`,
        tint: "#ffb04c",
        alpha: 0.88,
        createsWalls: false,
        light: {
          color: "#ff7a24",
          dim: 10,
          bright: 3,
          alpha: 0.2,
          animation: { type: "torch", speed: 2, intensity: 3 },
        },
      },
      {
        label: "炽燃",
        description: "火焰完全吞没这一片地面。",
        texture: `${ASSET_ROOT}/fire-blaze.webp`,
        tint: "#ff6a1a",
        alpha: 0.94,
        createsWalls: false,
        light: {
          color: "#ff5018",
          dim: 15,
          bright: 6,
          alpha: 0.32,
          animation: { type: "torch", speed: 4, intensity: 5 },
        },
      },
    ],
  },
  frost: {
    id: "frost",
    label: "霜冻地带",
    shortLabel: "冰霜",
    description: "尖锐冰晶与冻土让每一步都更加艰难。",
    accent: "#69d7ff",
    movementMultiplier: 2,
    stages: [
      {
        label: "薄霜",
        description: "冰纹沿地面迅速扩散。",
        texture: `${ASSET_ROOT}/frost-rime.webp`,
        tint: "#8ce8ff",
        alpha: 0.82,
        createsWalls: false,
      },
      {
        label: "寒封",
        description: "厚重的冰晶覆盖整个区域。",
        texture: `${ASSET_ROOT}/frost-deep.webp`,
        tint: "#4fbfff",
        alpha: 0.9,
        createsWalls: false,
      },
    ],
  },
  brambles: {
    id: "brambles",
    label: "荆棘地带",
    shortLabel: "荆棘",
    description: "纠缠的藤蔓迟滞闯入者，并在成熟后形成障碍。",
    accent: "#77b84a",
    movementMultiplier: 2,
    stages: [
      {
        label: "蔓生",
        description: "带刺藤蔓贴地扩张。",
        texture: `${ASSET_ROOT}/brambles-creeping.webp`,
        tint: "#86b95c",
        alpha: 0.9,
        createsWalls: false,
      },
      {
        label: "棘墙",
        description: "密实枝条竖起不可穿越的边界。",
        texture: `${ASSET_ROOT}/brambles-thicket.webp`,
        tint: "#56843a",
        alpha: 0.96,
        createsWalls: true,
      },
    ],
  },
};

export const getTerrainConfiguration = (
  id: TerrainConfigurationId,
): TerrainConfiguration => TERRAIN_CONFIGURATIONS[id];

