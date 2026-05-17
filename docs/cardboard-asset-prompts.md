# Cozy Cardboard Burrow UI Asset Prompts

Use these prompts for small reusable UI textures. Keep every asset subtle, low-contrast, and game-UI friendly. Avoid text, logos, characters, heavy dirt, high-frequency noise, and photorealistic shadows.

## 1. Cardboard Fiber Tile

Target file: `assets/textures/cardboard_fiber_tile.webp`

Prompt:
`Seamless tileable warm cardboard fiber texture for a cozy mobile browser game UI about hamsters, soft kraft paper fibers, subtle scratches, gentle uneven color, light honey brown and muted tan palette, very low contrast, no text, no objects, no hard shadows, no stains, flat diffuse material, clean game interface background, 1024x1024`

Negative prompt:
`photorealistic box, labels, text, tape, dirt, mold, watermarks, strong noise, dark stains, folds, holes, dramatic lighting`

## 2. Light Paper Grain Tile

Target file: `assets/textures/light_paper_grain_tile.webp`

Prompt:
`Seamless tileable light recycled paper texture for cozy cardboard game cards, warm cream paper, tiny fibers, very soft speckles, handmade paper feel, clean readable UI surface, low contrast, no text, no icons, no objects, no heavy shadows, 1024x1024`

Negative prompt:
`printed pattern, text, notebook lines, stains, torn paper, high noise, dark vignette, glossy surface, watermark`

## 3. Transparent Tape Strip

Target file: `assets/ui/tape_strip_clear.webp` or transparent PNG

Prompt:
`A single small strip of semi-transparent matte packing tape for cozy cardboard UI decoration, slightly yellowed translucent tape, soft uneven edges, faint fiber texture, subtle dashed cut marks on left and right edges, isolated on transparent background, no text, no logo, no object shadow, game UI asset, 512x160`

Negative prompt:
`brand logo, text, realistic hand, scissors, roll of tape, strong shadow, dirty tape, wrinkles covering the whole image, opaque sticker`

## 4. Torn Cardboard Edge

Target file: `assets/ui/torn_cardboard_edge.webp` or SVG trace

Prompt:
`Horizontal torn cardboard edge strip for a cozy hamster burrow game UI, warm kraft cardboard, irregular but soft torn edge, visible paper layers, subtle fibers, transparent background, no text, no icons, no shadow, reusable UI trim, 1024x180`

Negative prompt:
`burned edge, sharp spikes, dirty paper, newspaper print, tape, labels, photorealistic scene, strong drop shadow`

## 5. Paper Sticker Badges

Target file: `assets/ui/sticker_badges.webp` or individual transparent PNGs

Prompt:
`Set of small round paper sticker badges for cozy cardboard mobile game UI, honey yellow, moss green, cream, and muted teal variants, soft paper texture, thin brown ink outline, subtle top-left highlight, transparent background, no numbers, no text, no icons, clean vector-like raster style, 1024x1024 sprite sheet`

Negative prompt:
`letters, numbers, logo, glossy plastic, metallic shine, thick black outline, complex patterns, photorealistic sticker sheet`

## 6. Marker UI Icons Style Sheet

Target file: `assets/ui/marker_icon_style_reference.webp`

Prompt:
`Style reference sheet for simple hand-drawn marker icons on cardboard, cozy hamster burrow game UI, dark moss green and dark brown ink, icons for home burrow, hamster, map, lightning training, star gacha, backpack, shield, sword, seed, crumb, simple rounded strokes, slightly imperfect marker line, no text labels, transparent or light cardboard background, 1024x1024`

Negative prompt:
`complex illustrations, 3D icons, glossy icons, neon colors, text labels, realistic animals, logo, watermark`

## 7. Cardboard Button Panel

Target file: `assets/ui/dark_cardboard_button_panel.webp`

Prompt:
`Seamless horizontal dark cardboard button panel texture for cozy mobile game UI buttons, deep warm brown cardboard, subtle diagonal fibers, slightly compressed edge feel, matte surface, low contrast, no text, no icons, no bevel baked too strongly, no hard shadow, 1024x256`

Negative prompt:
`wood plank, leather, metal, glossy plastic, labels, screws, nails, high contrast grain, dramatic lighting`

## Export Notes

- Prefer WebP for textures, PNG only when transparency is required.
- Keep files under 250 KB when possible.
- Test all tiles at 25%, 50%, and 100% opacity over the current CSS colors.
- The CSS already works without these files; generated assets should only improve texture quality, not carry layout or text.

## Generated Batch Review

Source files in `assets/textures/1.webp` through `assets/textures/7.png` were normalized into production assets:

- `1.webp` -> superseded cardboard fiber draft
- `2.webp` -> `assets/textures/light_paper_grain_tile.webp`
- `3.webp` -> `assets/ui/tape_strip_clear.webp`
- `4.webp` -> `assets/ui/torn_cardboard_edge.webp`
- `5.png` -> `assets/ui/marker_icon_style_reference.webp`
- `6.webp` -> `assets/ui/dark_cardboard_button_panel.webp`
- `7.png` -> `assets/textures/cardboard_fiber_tile.webp` as the active cardboard UI texture

Notes:

- `1.webp` and `2.webp` are byte-identical. The light paper tile was derived from the duplicate by desaturating, brightening, and lowering contrast. `7.png` replaced the initial `1.webp` output as the better active cardboard tile.
- The generated batch does not include `assets/ui/sticker_badges.webp`.
- The numbered source files were kept unchanged as raw inputs.
