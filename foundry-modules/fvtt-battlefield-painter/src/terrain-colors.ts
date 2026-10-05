/** Original is always available; these twelve choices preserve luminance and transparent edges. */
export const TERRAIN_COLORS = [
  { id: "original", label: "原色", hex: "#ffffff" },
  { id: "red", label: "红", hex: "#ed4949" }, { id: "orange", label: "橙", hex: "#ef913e" },
  { id: "gold", label: "金", hex: "#ebc65b" }, { id: "lime", label: "黄绿", hex: "#b4d94d" },
  { id: "green", label: "绿", hex: "#59be80" }, { id: "teal", label: "青绿", hex: "#4eb8ab" },
  { id: "cyan", label: "青", hex: "#63cce3" }, { id: "blue", label: "蓝", hex: "#689bef" },
  { id: "violet", label: "紫", hex: "#9a7fdf" }, { id: "magenta", label: "品红", hex: "#d376c5" },
  { id: "pink", label: "粉", hex: "#e9a8c0" }, { id: "white", label: "白", hex: "#e6e8ec" },
] as const;
export type TerrainColorId = typeof TERRAIN_COLORS[number]["id"];
const supported = new Set(["fire", "haze", "deadlyHaze", "lightningField", "magicCircle", "magicLight", "portal", "rune1", "rune2", "rune3", "rune4", "runes", "smoke"]);
export const supportsTerrainColor = (id: string): boolean => supported.has(id);
export const terrainColor = (id?: string) => TERRAIN_COLORS.find(color => color.id === id) ?? TERRAIN_COLORS[0];
export const COLOR_FRAGMENT = `
  uniform vec3 terrainColor;
  uniform float terrainColorEnabled;
  vec4 recolorTerrain(vec4 pixel) {
    if (terrainColorEnabled < 0.5 || pixel.a < 0.0001) return pixel;
    vec3 rgb = pixel.rgb / pixel.a;
    // Saturated fire often has R=1 across both dark-red body and bright-yellow core.
    // Channel maximum flattens that structure; luminance retains the source's tonal range.
    float level = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float highlight = smoothstep(0.65, 1.0, min(rgb.r, min(rgb.g, rgb.b)));
    return vec4(mix(terrainColor * level, vec3(level), highlight) * pixel.a, pixel.a);
  }
`;
