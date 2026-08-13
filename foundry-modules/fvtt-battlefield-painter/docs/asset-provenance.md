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

