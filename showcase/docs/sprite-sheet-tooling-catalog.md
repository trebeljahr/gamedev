# Sprite Sheet Tooling Catalog

Working notes for future automated sprite-sheet cleanup/export tools.

## Asset Classes

### Uniform animation sheets

Signals:
- File or folder uses `spritesheet`, `sprite sheet`, `sheet`, `strip`, `allanim`, or `animation`.
- Path carries an action token such as `idle`, `run`, `attack`, `hurt`, `death`, `jump`.
- Optional size hints like `40x40`, `96x96`, or `200x150px` describe per-frame cell size.

Tooling implication:
- Safe to slice with fixed `cols x rows` when frame-size hints divide image dimensions.
- Preserve frame order left-to-right, then top-to-bottom.

### Variable-frame animation sheets

Signals:
- Animation path hints are present, but visible frame bands have unequal widths or heights.
- Frames are often separated by transparent gutters rather than packed into a strict grid.
- Examples include row strips where attack or death frames have wider silhouettes than idle frames.

Tooling implication:
- Do not force equal-width cells.
- Detect active row/column bands from alpha/background difference, trim each detected rect, and export explicit frame rects.
- Store frame rect metadata so downstream tools can re-pack, pad, or normalize frame origins later.

### Separate frame sequences

Signals:
- Multiple files in one pack/folder use numeric suffixes, for example `eagle-attack-1.png`, `Hurt_002.png`, or `Walk_007.png`.
- Folder names often include `Sprites`, `Frames`, `PNG`, or action subfolders.
- These are animation frames, but each file is not a sprite sheet.

Tooling implication:
- Treat each file as a frame candidate for sequence assembly, not as a sheet to slice.
- Group by design/action key before export.

### Texture atlases and tilesheets

Signals:
- Path uses `atlas`, `texture`, `tilesheet`, `tilemap`, `tileset`, `terrain`, `decoration`, `objects`, `props`, or `ground`.
- No character/action animation token is present.
- Visual layout contains many unrelated sprites or tiles.

Tooling implication:
- Do not auto-play as animation.
- Catalogue as atlas/static source art.
- Future tools should extract named/semantic regions only when metadata or a tile grid is known.

## Current Viewer Behavior

- Rejects atlas-like paths before animation.
- Uses file path hints for known cell sizes or explicit grid counts.
- Falls back to image analysis for variable rects.
- Falls back again to equal-grid slicing only when the image looks grid-like.
- Shows static preview if no reliable animation layout is found.

## Future Automation Targets

- Persist detected frame rects into generated media metadata.
- Add origin/anchor normalization so variable frames do not jitter.
- Group separate frame files into synthetic animations.
- Add atlas extraction separately from animation slicing.
- Emit quality warnings: uneven gutters, missing transparent background, inconsistent frame count, and likely atlas mislabeled as spritesheet.
