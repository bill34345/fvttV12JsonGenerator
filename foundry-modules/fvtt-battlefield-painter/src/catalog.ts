import { ADDITIONAL_TERRAINS } from "./catalog-additions";
import type { TerrainConfigurationId, TerrainConfiguration, TerrainStage, TerrainStageMedia, TerrainLight } from "./catalog-types";
export type { TerrainConfigurationId, TerrainConfiguration, TerrainStage, TerrainStageMedia, TerrainLight } from "./catalog-types";

const ASSET_ROOT = "modules/fvtt-battlefield-painter/assets/terrain";

/** Approved static artwork and native lighting; legacy field media below remain loadable. */
export const FIRE_STATIC_PROFILE = {
  textures: ["fire-native-a.png", "fire-native-b.png", "fire-native-c.png"].map(name => `${ASSET_ROOT}/${name}`),
  visualScale: 1.4,
  light: {
    color: "#ff5018", alpha: 0.25, bright: 3, dim: 12,
    attenuation: 0.65, luminosity: 0.2, coloration: 100,
    animation: { type: "torch", speed: 10, intensity: 8 },
  } satisfies TerrainLight,
} as const;

/** User-approved thin-film layering and slower native ice reflections. */
export const FROST_STATIC_PROFILE = {
  iceTexture: `${ASSET_ROOT}/frost-native-ice.png`,
  grainsTexture: `${ASSET_ROOT}/frost-native-grains.png`,
  visualScale: 1.4,
  thinFilmAlpha: 0.2,
  lightAlpha: [0.06, 0.18],
  light: {
    color: "#9bdcff", bright: 1, dim: 8,
    attenuation: 0.65, luminosity: 0.1, coloration: 100,
    animation: { type: "torch", speed: 3, intensity: 6 },
  },
} as const;

/** The two bramble images approved on 2026-09-09, used by every new paint stroke. */
export const BRAMBLE_STATIC_PROFILE = {
  // Persisted indices 0/1 remain dense branches / wall; early roots use index 2.
  textures: ["brambles-native-stage-i.png", "brambles-native-stage-ii.png", "brambles-native-roots.png"].map(name => `${ASSET_ROOT}/${name}`),
  visualScale: 1.35,
} as const;

/** Variant 0 keeps existing scenes on their original artwork. */
export const BLOOD_STATIC_PROFILE = {
  textures: [
    ["blood-native-stage-i.png", "blood-native-stage-i-b.png", "blood-native-stage-i-c.png"],
    ["blood-native-stage-ii.png", "blood-native-stage-ii-b.png", "blood-native-stage-ii-c.png"],
  ].map(stage => stage.map(name => `${ASSET_ROOT}/${name}`)),
} as const;

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
        texture: `${ASSET_ROOT}/fire.webp`,
        media: {
          staticTexture: `${ASSET_ROOT}/fire.webp`,
          animatedTexture: `${ASSET_ROOT}/fire.webm`,
          fieldTexture: `${ASSET_ROOT}/fire-stage-i.webm`,
        },
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
        texture: `${ASSET_ROOT}/fire.webp`,
        media: {
          staticTexture: `${ASSET_ROOT}/fire.webp`,
          animatedTexture: `${ASSET_ROOT}/fire.webm`,
          fieldTexture: `${ASSET_ROOT}/fire-stage-ii.webm`,
        },
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
        texture: `${ASSET_ROOT}/frost.webp`,
        media: {
          staticTexture: `${ASSET_ROOT}/frost.webp`,
          animatedTexture: `${ASSET_ROOT}/frost.webm`,
          effectBaseTexture: `${ASSET_ROOT}/frost-film-v1.webp`,
        },
        tint: "#8ce8ff",
        alpha: 0.82,
        createsWalls: false,
      },
      {
        label: "寒封",
        description: "厚重的冰晶覆盖整个区域。",
        texture: `${ASSET_ROOT}/frost.webp`,
        media: {
          staticTexture: `${ASSET_ROOT}/frost.webp`,
          animatedTexture: `${ASSET_ROOT}/frost.webm`,
          effectBaseTexture: `${ASSET_ROOT}/frost-film-v1.webp`,
          fieldTexture: `${ASSET_ROOT}/frost-mist-v1.webm`,
        },
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
        texture: `${ASSET_ROOT}/brambles-stage-i.webp`,
        media: {
          staticTexture: `${ASSET_ROOT}/brambles-stage-i.webp`,
          animatedTexture: `${ASSET_ROOT}/brambles-stage-i.webp`,
        },
        tint: "#ffffff",
        alpha: 0.9,
        createsWalls: false,
      },
      {
        label: "棘墙",
        description: "密实枝条竖起不可穿越的边界。",
        texture: `${ASSET_ROOT}/brambles-stage-ii.webp`,
        media: {
          staticTexture: `${ASSET_ROOT}/brambles-stage-ii.webp`,
          // Mature thorns convey height through artwork, without another video decoder.
          animatedTexture: `${ASSET_ROOT}/brambles-stage-ii.webp`,
        },
        tint: "#ffffff",
        alpha: 0.96,
        createsWalls: true,
      },
      {
        label: "疏根", description: "稀疏细根贴地蔓延，正常移动；继续生长形成密枝和棘墙。",
        texture: `${ASSET_ROOT}/brambles-native-roots.png`,
        media: { staticTexture: `${ASSET_ROOT}/brambles-native-roots.png`, animatedTexture: `${ASSET_ROOT}/brambles-native-roots.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false,
      },
    ],
  },
  acid: {
    id: "acid", label: "酸液地带", shortLabel: "酸液",
    description: "零散酸液汇成酸池；仅标示危险，伤害由GM裁定，移动消耗正常。",
    accent: "#b4c631", movementMultiplier: 1,
    stages: [
      { label: "酸洼", description: "零散酸液附着地面；不自动伤害或减速。",
        texture: `${ASSET_ROOT}/acid-native-stage-i.png`,
        media: { staticTexture: `${ASSET_ROOT}/acid-native-stage-i.png`, animatedTexture: `${ASSET_ROOT}/acid-native-stage-i.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
      { label: "酸池", description: "酸液汇成连续池面；不自动伤害或阻挡。",
        texture: `${ASSET_ROOT}/acid-native-stage-ii.png`,
        media: { staticTexture: `${ASSET_ROOT}/acid-native-stage-ii.png`, animatedTexture: `${ASSET_ROOT}/acid-native-stage-ii.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
    ],
  },
  flooding: {
    id: "flooding", label: "漫水地带", shortLabel: "积水",
    description: "水洼逐渐汇成水面；正常移动，水深与游泳由GM裁定。",
    accent: "#68b8c9", movementMultiplier: 1,
    stages: [
      { label: "水洼", description: "零散浅水洼；不自动减速或改变移动方式。",
        texture: `${ASSET_ROOT}/flooding-native-stage-i.png`,
        media: { staticTexture: `${ASSET_ROOT}/flooding-native-stage-i.png`, animatedTexture: `${ASSET_ROOT}/flooding-native-stage-i.png` },
        tint: "#ffffff", alpha: 0.9, createsWalls: false },
      { label: "漫水", description: "连续水面覆盖地面；水深与游泳由GM裁定。",
        texture: `${ASSET_ROOT}/flooding-native-stage-ii.png`,
        media: { staticTexture: `${ASSET_ROOT}/flooding-native-stage-ii.png`, animatedTexture: `${ASSET_ROOT}/flooding-native-stage-ii.png` },
        tint: "#ffffff", alpha: 0.9, createsWalls: false },
    ],
  },
  lava: {
    id: "lava", label: "熔岩地带", shortLabel: "熔岩",
    description: "裂岩转为熔融地面；手动切换阶段，伤害与通行由GM裁定。",
    accent: "#f57722", movementMultiplier: 1,
    stages: [
      { label: "裂岩", description: "暗色岩壳下透出热裂缝；不自动结算伤害。",
        texture: `${ASSET_ROOT}/lava-native-stage-i.png`,
        media: { staticTexture: `${ASSET_ROOT}/lava-native-stage-i.png`, animatedTexture: `${ASSET_ROOT}/lava-native-stage-i.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
      { label: "熔融", description: "橙红熔岩缓慢涌动并发光；伤害与通行由GM裁定。",
        texture: `${ASSET_ROOT}/lava-native-stage-ii.png`,
        media: { staticTexture: `${ASSET_ROOT}/lava-native-stage-ii.png`, animatedTexture: `${ASSET_ROOT}/lava-native-stage-ii.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false,
        light: { color: "#ff6418", alpha: 0.18, bright: 2, dim: 8,
          attenuation: 0.65, luminosity: 0.15, coloration: 100,
          animation: { type: "torch", speed: 2, intensity: 3 } } },
    ],
  },

  blood: {
    id: "blood", label: "血迹地带", shortLabel: "血迹",
    description: "每阶段3种图案，绘制时随机选择；只作地面痕迹。",
    accent: "#9b2831", movementMultiplier: 1,
    stages: [
      { label: "飞溅", description: "稀疏血点与小片飞溅，保留大部分地面。",
        texture: `${ASSET_ROOT}/blood-native-stage-i.png`,
        media: { staticTexture: `${ASSET_ROOT}/blood-native-stage-i.png`, animatedTexture: `${ASSET_ROOT}/blood-native-stage-i.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
      { label: "血斑", description: "较密集的血斑和短拖痕；不自动流血或减速。",
        texture: `${ASSET_ROOT}/blood-native-stage-ii.png`,
        media: { staticTexture: `${ASSET_ROOT}/blood-native-stage-ii.png`, animatedTexture: `${ASSET_ROOT}/blood-native-stage-ii.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
    ],
  },

  spiderweb: {
    id: "spiderweb", label: "蛛网地带", shortLabel: "蛛网",
    description: "每笔一张完整蛛网，随范围放大；3种图随机，束缚与减速由GM裁定。",
    accent: "#d3cec0", movementMultiplier: 1,
    stages: [
      { label: "蛛网", description: "静态网丝覆盖地面；不自动束缚或减速。",
        texture: `${ASSET_ROOT}/spiderweb-native-a.png`,
        textureVariants: ["a", "b", "c"].map(v => `${ASSET_ROOT}/spiderweb-native-${v}.png`),
        media: { staticTexture: `${ASSET_ROOT}/spiderweb-native-a.png`, animatedTexture: `${ASSET_ROOT}/spiderweb-native-a.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
    ],
  },

  rubble: {
    id: "rubble", label: "碎石地带", shortLabel: "碎石",
    description: "3种碎石逐格随机；步行消耗翻倍，不影响飞行。",
    accent: "#b4aea0", movementMultiplier: 2,
    stages: [
      { label: "瓦砾", description: "坍塌的石块与碎片；增加移动消耗，不遮挡视线或封路。",
        texture: `${ASSET_ROOT}/rubble-native-a.png`,
        textureVariants: ["a", "b", "c"].map(v => `${ASSET_ROOT}/rubble-native-${v}.png`),
        media: { staticTexture: `${ASSET_ROOT}/rubble-native-a.png`, animatedTexture: `${ASSET_ROOT}/rubble-native-a.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
    ],
  },

  wood: {
    id: "wood", label: "木质残骸", shortLabel: "碎木",
    description: "3种断木逐格随机；步行消耗翻倍，不影响飞行。",
    accent: "#b78b52", movementMultiplier: 2,
    stages: [
      { label: "残骸", description: "散落的断木与碎板；增加步行消耗，不遮挡视线或封路。",
        texture: `${ASSET_ROOT}/wood-native-a.png`,
        textureVariants: ["a", "b", "c"].map(v => `${ASSET_ROOT}/wood-native-${v}.png`),
        media: { staticTexture: `${ASSET_ROOT}/wood-native-a.png`, animatedTexture: `${ASSET_ROOT}/wood-native-a.png` },
        tint: "#ffffff", alpha: 1, createsWalls: false },
    ],
  },

  ...ADDITIONAL_TERRAINS,

};

export const getTerrainConfiguration = (
  id: TerrainConfigurationId,
): TerrainConfiguration => TERRAIN_CONFIGURATIONS[id];
