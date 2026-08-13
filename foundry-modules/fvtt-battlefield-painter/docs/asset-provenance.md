# P0 Original Asset Provenance

All six terrain overlays in `assets/terrain/` were generated specifically for this personal module with OpenAI image generation on 2026-08-13. No Tile Arsenal product image, texture, configuration file, or paid asset was used as source input or reference image.

## Processing mode

- Generation mode: text-to-image, one asset per prompt, 1:1 raster composition.
- Fire and frost used a flat green chroma-key background. Brambles requested flat magenta; the generator returned native-transparent PNGs, which were handled by the same alpha-processing script using corner auto-key detection.
- Processing command family: `remove_chroma_key.py --auto-key corners --soft-matte --spill-cleanup`.
- Final format: transparent WebP, 1254 × 1254 pixels.
- Visual and mechanical checks: all six outputs were inspected; all contain transparent pixels and an alpha-capable WebP chunk; each file is below 1 MB.
- Original generated PNGs remain in the Codex generated-image cache. Only processed WebP deliverables are shipped in the module.

## Prompts

### `fire-embers.webp`

> Create one original top-down hand-painted VTT terrain overlay asset for a single grid cell: FIRE EMBERS, stage 1. Scattered glowing coals, small orange flame tongues, charred cracked earth fragments, readable silhouette from directly overhead, painterly fantasy tabletop style, detailed but not photorealistic, centered with comfortable empty margin, no border, no grid, no tile frame, no text, no symbols, no watermark, no smoke or translucent haze. The subject must be fully isolated on a perfectly flat uniform chroma-key green background #00FF00 with no gradient, no shadows on the background, and no green anywhere in the terrain artwork. Square 1:1 composition.

### `fire-blaze.webp`

> Create one original top-down hand-painted VTT terrain overlay asset for a single grid cell: ROARING FIRE, stage 2. Dense curling orange and yellow flames emerging from blackened coals and cracked scorched ground, strong readable overhead silhouette, painterly fantasy tabletop style, detailed but not photorealistic, centered with comfortable empty margin, no border, no grid, no tile frame, no text, no symbols, no watermark, no smoke or translucent haze. The subject must be fully isolated on a perfectly flat uniform chroma-key green background #00FF00 with no gradient, no shadows on the background, and no green anywhere in the terrain artwork. Square 1:1 composition.

### `frost-rime.webp`

> Create one original top-down hand-painted VTT terrain overlay asset for a single grid cell: THIN RIME FROST, stage 1. Delicate pale-blue branching ice veins, a few small crystalline shards, irregular frozen patches with a clean readable silhouette from directly overhead, painterly fantasy tabletop style, detailed but not photorealistic, centered with comfortable empty margin, no border, no grid, no tile frame, no text, no symbols, no watermark, no fog or translucent haze. The subject must be fully isolated on a perfectly flat uniform chroma-key green background #00FF00 with no gradient, no shadows on the background, and no green anywhere in the ice artwork. Square 1:1 composition.

### `frost-deep.webp`

> Create one original top-down hand-painted VTT terrain overlay asset for a single grid cell: DEEP ARCANE FROST, stage 2. A dense irregular plate of luminous cyan and white ice with jagged crystal clusters and branching cracks, strong readable overhead silhouette, painterly fantasy tabletop style, detailed but not photorealistic, centered with comfortable empty margin, no border, no grid, no tile frame, no text, no symbols, no watermark, no fog or translucent haze. The subject must be fully isolated on a perfectly flat uniform chroma-key green background #00FF00 with no gradient, no shadows on the background, and no green anywhere in the ice artwork. Square 1:1 composition.

### `brambles-creeping.webp`

> Create one original top-down hand-painted VTT terrain overlay asset for a single grid cell: CREEPING BRAMBLES, stage 1. Several winding brown thorn vines with sparse olive and forest-green leaves, low to the ground, irregular connected silhouette viewed directly overhead, painterly fantasy tabletop style, detailed but not photorealistic, centered with comfortable empty margin, no border, no grid, no tile frame, no text, no symbols, no watermark, no haze. The subject must be fully isolated on a perfectly flat uniform chroma-key magenta background #FF00FF with no gradient, no shadows on the background, and no magenta or purple anywhere in the bramble artwork. Square 1:1 composition.

### `brambles-thicket.webp`

> Create one original top-down hand-painted VTT terrain overlay asset for a single grid cell: DENSE THORN THICKET, stage 2. A thick tangled ring and crisscross mass of dark brown thorn branches with clustered deep-green leaves and sharp pale thorns, formidable wall-like density, strong irregular silhouette viewed directly overhead, painterly fantasy tabletop style, detailed but not photorealistic, centered with comfortable empty margin, no border, no grid, no tile frame, no text, no symbols, no watermark, no haze. The subject must be fully isolated on a perfectly flat uniform chroma-key magenta background #FF00FF with no gradient, no shadows on the background, and no magenta or purple anywhere in the bramble artwork. Square 1:1 composition.

## P2 generated media

The P2 loops are generated from the six module-local WebP illustrations by `scripts/generate-media.html` with fixed seeds, then finalized by `scripts/generate-media.mjs` using `ffmpeg-static@5.2.0`. No third-party or Tile Arsenal media is used.

The generated files are 512x512 VP9 WebM loops with `ALPHA_MODE=1`, a real WebP-derived alpha plane, 24 FPS, and four seconds, plus 48 kHz mono OGG/Opus ambience loops of approximately 20 seconds. When checking alpha with FFmpeg, use the `libvpx-vp9` decoder explicitly; the native decoder can report the color plane as `yuv420p` while discarding WebM alpha.

| Asset | SHA-256 |
| --- | --- |
| `assets/audio/brambles.ogg` | `B203AB4519938680E0797E56A6CE97660471A0CE5CE2CB3E7114A97C34751380B` |
| `assets/audio/fire.ogg` | `81FCD4047BFD49C781C93E9E1827C9C6005BA325ADCE7AB5151E940A3DD14D24` |
| `assets/audio/frost.ogg` | `D197FFE8025F9D4C2B218DAA2BB812C523A909A256E696AFE1DB1EF9421974A8` |
| `assets/terrain/brambles-creeping.webm` | `BBC50607533A465E4A236FCE35FB68A25709209ED39367304E68A0EF2B022A81` |
| `assets/terrain/brambles-thicket.webm` | `B4CE014D3F03B8DFBF71E4852AFFEF67FBFEC9DD542544F5531B79E4275A2A0D` |
| `assets/terrain/fire-blaze.webm` | `BACDCF6AA258BA54D8E7778D373556F16FD9FEC5E4328DC94AEB3869B6DE96F7` |
| `assets/terrain/fire-embers.webm` | `9A94C2BACCB77F3DEC82494F9BB8A5599E1CB496D0136BB1ADA392AE84CBBBFD` |
| `assets/terrain/frost-deep.webm` | `6AE0230C4B741DEA767110D5A1532D09A1A349488317E26580E9B22A7AF932BE` |
| `assets/terrain/frost-rime.webm` | `B8E1D778CAED588FA035D079D348636F811F2BADE373D99CB20BEB2D7965E6B5` |
