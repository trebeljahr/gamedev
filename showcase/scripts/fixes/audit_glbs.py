#!/usr/bin/env python3
"""
Walk every GLB under glb-optimized/ and report which ones likely have broken
materials. Two failure modes we've seen:

  1. Every material is the default grey (baseColorFactor ≈ [0.8, 0.8, 0.8])
     and there are no textures — the export dropped per-material colors.
  2. Meshes carry UVs but the GLB has no embedded texture images — the
     export dropped the texture binding for what was meant to be a color
     atlas.

A pack is flagged as broken when *every* sampled GLB in it looks broken
(so we don't false-positive on packs that have a mix of textured and
intentionally-flat materials).
"""
import struct
import json
import sys
from pathlib import Path

GLB_ROOT = Path("/Users/rico/projects/3d-assets/glb-optimized")

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A


def read_gltf_json(path: Path):
    with open(path, "rb") as f:
        data = f.read(64 * 1024)  # JSON chunk is small for these models
    magic, version, total = struct.unpack("<III", data[:12])
    if magic != GLB_MAGIC:
        return None
    json_len, json_type = struct.unpack("<II", data[12:20])
    if json_type != JSON_CHUNK:
        return None
    if len(data) < 20 + json_len:
        with open(path, "rb") as f:
            data = f.read(20 + json_len)
    return json.loads(data[20:20 + json_len].decode("utf-8"))


def analyze(path: Path) -> dict:
    g = read_gltf_json(path)
    if g is None:
        return {"error": "not a GLB"}
    mats = g.get("materials", [])
    n_textures = len(g.get("textures", []))
    n_images = len(g.get("images", []))
    has_uv = False
    for mesh in g.get("meshes", []):
        for p in mesh.get("primitives", []):
            if "TEXCOORD_0" in p.get("attributes", {}):
                has_uv = True
    colors = []
    has_color_tex = False
    for m in mats:
        pbr = m.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr:
            has_color_tex = True
        colors.append(tuple(round(c, 2) for c in pbr.get("baseColorFactor", [0.8, 0.8, 0.8, 1.0])))
    # All grey & no textures?
    default_grey = all(c == (0.8, 0.8, 0.8, 1.0) for c in colors) if colors else True
    return {
        "n_materials": len(mats),
        "n_textures": n_textures,
        "n_images": n_images,
        "has_color_tex": has_color_tex,
        "has_uv": has_uv,
        "all_grey": default_grey,
        "unique_colors": len(set(colors)),
    }


def main():
    bad_packs = []
    for vendor in sorted(p for p in GLB_ROOT.iterdir() if p.is_dir()):
        for pack in sorted(p for p in vendor.iterdir() if p.is_dir()):
            glbs = sorted(pack.rglob("*.glb"))
            if not glbs:
                continue
            grey_count = 0
            uv_no_tex_count = 0
            healthy_count = 0
            samples = glbs[:30]  # cap per pack
            for g in samples:
                info = analyze(g)
                if "error" in info:
                    continue
                # Has at least one image OR varied colors → healthy
                if info["n_images"] > 0 or info["unique_colors"] > 1:
                    healthy_count += 1
                elif info["has_uv"] and info["n_images"] == 0:
                    uv_no_tex_count += 1
                elif info["all_grey"]:
                    grey_count += 1
                else:
                    healthy_count += 1
            total = len(samples)
            if healthy_count >= max(1, total // 4):
                continue  # at least 25% healthy — pack as a whole is fine
            mode = "uv_no_tex" if uv_no_tex_count >= grey_count else "all_grey"
            bad_packs.append({
                "id": f"{vendor.name}/{pack.name}",
                "mode": mode,
                "total": len(glbs),
                "sampled": total,
                "grey": grey_count,
                "uv_no_tex": uv_no_tex_count,
            })

    if not bad_packs:
        print("no broken packs found")
        return
    print(f"{len(bad_packs)} potentially broken pack(s):")
    for p in bad_packs:
        print(f"  [{p['mode']:>10}]  {p['id']:60}  {p['total']} files (sampled {p['sampled']}, grey={p['grey']}, uv_no_tex={p['uv_no_tex']})")


if __name__ == "__main__":
    main()
