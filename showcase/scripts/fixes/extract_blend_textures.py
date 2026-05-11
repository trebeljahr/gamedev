"""
Walk each .blend in a pack and record the texture image filename (if any)
referenced by its materials. Used to drive `attach_atlas_textures.py` for
packs whose original FBX exports dropped texture bindings.

Usage:
  blender --background --python extract_blend_textures.py -- <blend_dir> <out_json>
"""
import bpy
import json
import sys
from pathlib import Path


def texture_for(m):
    """Return candidate image filenames used by this material, in priority order."""
    if not (m.use_nodes and m.node_tree):
        return []
    for node in m.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            candidates = []
            # 1. filepath_raw — most reliable when the image is on disk
            path = node.image.filepath_raw or node.image.filepath
            if path:
                candidates.append(Path(path).name)
            # 2. the image data-block name — sometimes matches a filename
            if node.image.name and node.image.name not in candidates:
                candidates.append(node.image.name)
                # Some Blender data-blocks lose the .png suffix
                if not Path(node.image.name).suffix:
                    candidates.append(node.image.name + ".png")
            return candidates
    return []


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 2:
        print("usage: blender --background --python extract_blend_textures.py -- <blend_dir> <out_json>")
        sys.exit(1)
    blends_dir = Path(argv[0])
    out_path = Path(argv[1])

    result = {}
    for blend in sorted(blends_dir.glob("*.blend")):
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        # Per-material mapping: material name -> list of candidate texture filenames
        per_mat: dict[str, list[str]] = {}
        # Also a flat list of all unique textures, for legacy single-tex consumers
        all_textures: dict[str, None] = {}
        for m in bpy.data.materials:
            cands = texture_for(m)
            if cands:
                per_mat[m.name] = cands
                for t in cands:
                    all_textures.setdefault(t, None)
        key = blend.stem.replace(" ", "")
        result[key] = {
            "materials": per_mat,
            "all": list(all_textures.keys()),
        }
        print(f"[{key}] {len(per_mat)} materials with textures")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")


main()
