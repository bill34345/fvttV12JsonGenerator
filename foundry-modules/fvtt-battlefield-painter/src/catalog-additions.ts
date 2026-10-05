import type { TerrainConfiguration, TerrainLight, AdditionalTerrainId } from "./catalog-types";
export type { AdditionalTerrainId } from "./catalog-types";

interface Definition {
  id: AdditionalTerrainId;
  label: string;
  stages: readonly [string, ...string[]];
  description: string;
  placement?: "cell" | "sheet";
  walk?: boolean;
  color?: string;
  walls?: "movement" | "solid";
}

const definitions: readonly Definition[] = [
  { id: "earthquake", label: "地裂", stages: ["裂地"], walk: true, description: "裂纹覆盖地面；步行消耗翻倍，倒地由GM裁定。" },
  { id: "forceBarrier", label: "力场屏障", stages: ["屏障"], color: "#68c9ef", walls: "movement", description: "蓝色力场；外周阻止移动，保留视线。" },
  { id: "grease", label: "油脂", stages: ["油滴", "油池"], walk: true, description: "油滴汇成油池；步行消耗翻倍，滑倒由GM裁定。" },
  { id: "haze", label: "薄雾", stages: ["雾气"], description: "轻薄雾气覆盖；不自动改变视线或移动。" },
  { id: "deadlyHaze", label: "毒雾", stages: ["毒云"], description: "紫色毒云；毒性、伤害与视线由GM裁定。" },
  { id: "hole", label: "坑洞", stages: ["塌陷", "深坑"], description: "塌陷变为深坑；不自动坠落或改变楼层。" },
  { id: "holyLight", label: "圣光", stages: ["圣辉"], color: "#ffda79", description: "金色圣辉与柔光；不自动治疗。" },
  { id: "lightningField", label: "雷电区域", stages: ["电弧"], color: "#8cd8ff", description: "蓝白电弧与柔光；伤害由GM裁定。" },
  { id: "magicCircle", label: "魔法阵", stages: ["法阵"], color: "#ffd06d", description: "完整魔法阵随笔画范围放大；不自动施法。" },
  { id: "magicLight", label: "魔法光", stages: ["光球"], color: "#64baff", description: "蓝色魔法光晕照亮周围。" },
  { id: "magicPlatform", label: "魔法平台", stages: ["完整", "破裂"], color: "#63c9df", description: "透明平台与破裂形态；不创建可站立楼层。" },
  { id: "mold", label: "霉菌", stages: ["菌膜", "菌斑", "孢子"], placement: "cell", description: "菌膜逐渐长出菌斑和孢子；接触效果由GM裁定。" },
  { id: "moss", label: "苔藓", stages: ["苔毯"], description: "柔软绿色苔藓覆盖地面；正常移动。" },
  { id: "pillar", label: "石柱", stages: ["柱体"], placement: "cell", walls: "solid", description: "实心石柱；每格柱体外周阻挡移动与视线。" },
  { id: "portal", label: "传送门", stages: ["门环"], color: "#b784ed", description: "紫色门环与柔光；不自动传送。" },
  { id: "rift", label: "裂隙", stages: ["微隙", "裂口", "失稳"], color: "#6389ff", description: "星界裂隙逐渐扩张；传送与伤害由GM裁定。" },
  { id: "rune1", label: "符文一", stages: ["角印"], color: "#ffc35e", description: "原创角形符印与金光；整张随范围放大。" },
  { id: "rune2", label: "符文二", stages: ["旋印"], color: "#83d66c", description: "原创旋形符印与绿光；整张随范围放大。" },
  { id: "rune3", label: "符文三", stages: ["交印"], color: "#70b7ed", description: "原创交叉符印与蓝光；整张随范围放大。" },
  { id: "rune4", label: "符文四", stages: ["钩印"], color: "#ed7767", description: "原创钩形符印与红光；整张随范围放大。" },
  { id: "runes", label: "组合符文", stages: ["角印", "旋印", "交印", "钩印"], color: "#ffc35e", description: "手动轮换四种完整符印；不自动触发法术。" },
  { id: "sand", label: "沙地", stages: ["流沙纹"], walk: true, description: "起伏细沙覆盖；步行消耗翻倍，不自动下陷。" },
  { id: "smoke", label: "浓烟", stages: ["烟团"], description: "灰色浓烟覆盖；遮蔽与伤害由GM裁定。" },
  { id: "spikes", label: "地刺", stages: ["尖刺"], placement: "cell", walk: true, description: "散布尖刺；步行消耗翻倍，伤害由GM裁定。" },
  { id: "unholyLight", label: "邪光", stages: ["邪辉"], color: "#d06be9", description: "紫色邪异光辉；不自动伤害或施加状态。" },
  { id: "wildMagic", label: "狂野魔法", stages: ["魔涌"], color: "#b18bdc", description: "多色魔法流与柔光；不自动掷表或施法。" },
  { id: "ruidiumVeinsSweep", label: "月蚀脉络·延伸", stages: ["分叉延伸"], description: "完整月蚀脉络随绘制范围铺展；不自动腐化、伤害或减速。" },
  { id: "ruidiumVeinsFan", label: "月蚀脉络·铺展", stages: ["扇形铺展"], description: "扇形月蚀脉络覆盖；不自动腐化、伤害或减速。" },
  { id: "ruidiumCrystalCrescent", label: "月蚀晶体·环抱", stages: ["环抱脉络"], description: "单晶体与环抱脉络；保留视线和正常移动，腐化由GM裁定。" },
  { id: "ruidiumCrystalCross", label: "月蚀晶体·交叉", stages: ["交叉脉络"], description: "单晶体与交叉脉络；保留视线和正常移动，腐化由GM裁定。" },
  { id: "ruidiumClusterThree", label: "月蚀晶簇·三簇", stages: ["三晶体簇"], description: "三晶体共生簇与流束；不自动建立墙体、伤害或腐化。" },
  { id: "ruidiumClusterFive", label: "月蚀晶簇·五簇", stages: ["五晶体簇"], description: "五晶体共生簇与独立分流脉络；不自动建立墙体、伤害或腐化。" },
];

const runeColors = ["#ffc35e", "#83d66c", "#70b7ed", "#ed7767"];
const light = (color: string): TerrainLight => ({
  color, bright: 1, dim: 5, alpha: 0.13, attenuation: 0.65, luminosity: 0.1,
  coloration: 100, animation: { type: "pulse", speed: 1, intensity: 2 },
});

export const ADDITIONAL_TERRAINS = Object.fromEntries(definitions.map(definition => {
  const { id, label, description, walk, color, walls } = definition;
  return [id, {
    id, label, shortLabel: label, description, accent: color ?? "#a5aa89",
    placement: definition.placement ?? "sheet", movementMultiplier: walk ? 2 : 1,
    movementActions: walk ? ["walk"] : undefined,
    stages: definition.stages.map((stageLabel, index) => {
      const sourceId = id === "runes" ? `rune${index + 1}` : id;
      const sourceStage = id === "runes" ? 1 : index + 1;
      const texture = `modules/fvtt-battlefield-painter/assets/terrain/${sourceId}-stage-${sourceStage}.png`;
      return {
        label: stageLabel, description, texture, textureVariants: [texture],
        media: { staticTexture: texture, animatedTexture: texture }, tint: "#ffffff", alpha: 1,
        ...(color ? { light: light(id === "runes" ? runeColors[index]! : color) } : {}),
        createsWalls: Boolean(walls),
        ...(walls === "solid" ? { wallRestrictions: { move: 20, sight: 20, light: 20, sound: 0 } } : {}),
      };
    }) as unknown as TerrainConfiguration["stages"],
  } satisfies TerrainConfiguration];
})) as Record<AdditionalTerrainId, TerrainConfiguration>;

export const ADDITIONAL_ASSET_FILES = [...new Set(Object.values(ADDITIONAL_TERRAINS)
  .flatMap(configuration => configuration.stages.map(stage => stage.texture.split("/").at(-1)!)))];
