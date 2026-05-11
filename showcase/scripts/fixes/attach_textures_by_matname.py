#!/usr/bin/env python3
"""
Attach textures to each GLB by matching material name to texture filename.

For each material named e.g. "BirchTree_Bark", look in the texture folder
for "BirchTree_Bark.png" (or .jpg) and embed it. Useful for packs where
material names already match texture filenames — saves us from running
Blender to extract a mapping.

Usage:
  python3 attach_textures_by_matname.py <glb_dir> <texture_dir>
"""
import json
import struct
import sys
from pathlib import Path

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

# Reuse helpers from attach_atlas_textures
sys.path.insert(0, str(Path(__file__).parent))
from attach_atlas_textures import (  # noqa: E402
    read_glb,
    write_glb,
    add_image_texture,
    normalize_name,
)


def main():
    if len(sys.argv) != 3:
        print("usage: attach_textures_by_matname.py <glb_dir> <texture_dir>")
        sys.exit(1)
    glb_dir = Path(sys.argv[1])
    tex_dir = Path(sys.argv[2])
    if not glb_dir.exists() or not tex_dir.exists():
        sys.exit("inputs not found")

    # Build normalized-name → file path
    tex_index: dict[str, Path] = {}
    for p in tex_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg"):
            tex_index[normalize_name(p.stem)] = p

    patched = skipped = 0
    for glb in sorted(glb_dir.rglob("*.glb")):
        gltf, bin_bytes = read_glb(glb)

        already = any(
            "baseColorTexture" in m.get("pbrMetallicRoughness", {})
            for m in gltf.get("materials", [])
        )
        if already:
            print(f"  skip {glb.name} (already has texture)")
            skipped += 1
            continue

        embedded: dict[Path, int] = {}
        applied = 0
        for m in gltf.get("materials", []):
            name = m.get("name", "")
            png_path = tex_index.get(normalize_name(name))
            if not png_path:
                continue
            if png_path not in embedded:
                tex_idx, bin_bytes = add_image_texture(gltf, bin_bytes, png_path)
                embedded[png_path] = tex_idx
            tex_idx = embedded[png_path]
            pbr = m.setdefault("pbrMetallicRoughness", {})
            pbr["baseColorTexture"] = {"index": tex_idx}
            pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
            pbr["metallicFactor"] = 0.0
            pbr["roughnessFactor"] = 0.9
            n_lower = name.lower()
            if any(tag in n_lower for tag in ("leaves", "leaf", "petals", "flowers", "bush")):
                m["alphaMode"] = "MASK"
                m["alphaCutoff"] = 0.5
                m["doubleSided"] = True
            applied += 1

        if not applied:
            print(f"  skip {glb.name} (no material names matched textures)")
            skipped += 1
            continue
        write_glb(glb, gltf, bin_bytes)
        print(f"  patched {glb.name} ({applied} mat, {len(embedded)} tex)")
        patched += 1

    print(f"patched {patched}, skipped {skipped}")


if __name__ == "__main__":
    main()
