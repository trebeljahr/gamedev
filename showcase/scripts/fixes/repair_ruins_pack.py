#!/usr/bin/env python3
"""
One-shot repair for ultimate-modular-ruins-pack-aug-2021. Restores material
state from the source .blend extraction:
  - Materials Bark / Texture_Leaves / Leaf_Texture: keep the embedded texture
    (Bark_Texture.jpg or Leaf_Texture.png) and baseColorFactor=white. Foliage
    materials also flip to alphaMode=MASK + doubleSided so PNG transparency
    cuts out instead of rendering as a solid quad.
  - Every other material: restore baseColorFactor from the materials JSON and
    strip baseColorTexture (it was the foliage texture leaking in via the
    attach_atlas_textures.py `all` fallback, since fixed).

Run after attach_atlas_textures.py to undo any over-application from earlier
runs of that script. Idempotent.

Usage:
  python3 repair_ruins_pack.py <glb_dir> <materials_json>
"""
import json
import struct
import sys
from pathlib import Path

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

FOLIAGE_TEX_MATS = {"Texture_Leaves", "Leaf_Texture"}
BARK_MATS = {"Bark"}


def pad4(n: int) -> int:
    return (4 - (n % 4)) % 4


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, total_len = struct.unpack("<III", data[:12])
    assert magic == GLB_MAGIC
    off = 12
    json_len, json_type = struct.unpack("<II", data[off:off + 8])
    assert json_type == JSON_CHUNK
    off += 8
    json_bytes = data[off:off + json_len]
    off += json_len
    bin_bytes = b""
    if off < total_len:
        bin_len, bin_type = struct.unpack("<II", data[off:off + 8])
        assert bin_type == BIN_CHUNK
        off += 8
        bin_bytes = data[off:off + bin_len]
    return json.loads(json_bytes.decode("utf-8")), bin_bytes


def write_glb(path: Path, gltf: dict, bin_bytes: bytes):
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * pad4(len(json_bytes))
    bin_padded = bin_bytes + b"\x00" * pad4(len(bin_bytes))
    total = 12 + 8 + len(json_bytes)
    if bin_padded:
        total += 8 + len(bin_padded)
    out = bytearray()
    out += struct.pack("<III", GLB_MAGIC, 2, total)
    out += struct.pack("<II", len(json_bytes), JSON_CHUNK)
    out += json_bytes
    if bin_padded:
        out += struct.pack("<II", len(bin_padded), BIN_CHUNK)
        out += bin_padded
    path.write_bytes(bytes(out))


def texture_image_name(gltf: dict, tex_index: int) -> str:
    """Return the embedded image's name (filename stem) for a texture, or ''."""
    try:
        img_src = gltf["textures"][tex_index]["source"]
        return gltf["images"][img_src].get("name", "")
    except (KeyError, IndexError):
        return ""


def find_texture_by_image_name(gltf: dict, stem: str) -> int | None:
    """Return the first texture whose source image's name == stem, or None."""
    for i, t in enumerate(gltf.get("textures", [])):
        try:
            src = t["source"]
            if gltf["images"][src].get("name") == stem:
                return i
        except (KeyError, IndexError):
            continue
    return None


def main():
    if len(sys.argv) != 3:
        print("usage: repair_ruins_pack.py <glb_dir> <materials_json>")
        sys.exit(1)
    glb_dir = Path(sys.argv[1])
    mat_json = Path(sys.argv[2])
    materials = json.loads(mat_json.read_text())

    patched = skipped = 0
    for glb in sorted(glb_dir.rglob("*.glb")):
        mat_map = materials.get(glb.stem) or {}
        gltf, bin_bytes = read_glb(glb)

        # Locate the embedded foliage textures by image-name, if present.
        bark_tex = find_texture_by_image_name(gltf, "Bark_Texture")
        leaf_tex = find_texture_by_image_name(gltf, "Leaf_Texture")

        changes = 0
        for m in gltf.get("materials", []):
            name = m.get("name", "")
            pbr = m.setdefault("pbrMetallicRoughness", {})
            if name in BARK_MATS:
                if bark_tex is not None:
                    if pbr.get("baseColorTexture", {}).get("index") != bark_tex:
                        pbr["baseColorTexture"] = {"index": bark_tex}
                        changes += 1
                    if pbr.get("baseColorFactor") != [1.0, 1.0, 1.0, 1.0]:
                        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
                        changes += 1
                    pbr.setdefault("metallicFactor", 0.0)
                    pbr.setdefault("roughnessFactor", 0.9)
                    if m.get("alphaMode") not in (None, "OPAQUE"):
                        m["alphaMode"] = "OPAQUE"
                        changes += 1
                continue
            if name in FOLIAGE_TEX_MATS:
                if leaf_tex is not None:
                    if pbr.get("baseColorTexture", {}).get("index") != leaf_tex:
                        pbr["baseColorTexture"] = {"index": leaf_tex}
                        changes += 1
                    if pbr.get("baseColorFactor") != [1.0, 1.0, 1.0, 1.0]:
                        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
                        changes += 1
                    pbr.setdefault("metallicFactor", 0.0)
                    pbr.setdefault("roughnessFactor", 0.9)
                    if m.get("alphaMode") != "MASK":
                        m["alphaMode"] = "MASK"
                        m["alphaCutoff"] = 0.5
                        changes += 1
                    if not m.get("doubleSided"):
                        m["doubleSided"] = True
                        changes += 1
                continue
            # Non-foliage material: strip any stray foliage-texture binding and
            # restore the original solid color from the .blend extraction.
            cur_tex = pbr.get("baseColorTexture", {}).get("index")
            if cur_tex is not None and cur_tex in (bark_tex, leaf_tex):
                pbr.pop("baseColorTexture", None)
                changes += 1
            info = mat_map.get(name)
            if info:
                color = info["color"]
                if pbr.get("baseColorFactor") != color:
                    pbr["baseColorFactor"] = color
                    changes += 1
                pbr.setdefault("metallicFactor", 0.0)
                pbr.setdefault("roughnessFactor", 0.9)

        if changes:
            write_glb(glb, gltf, bin_bytes)
            print(f"  repaired {glb.name} ({changes} changes)")
            patched += 1
        else:
            skipped += 1

    print(f"repaired {patched}, unchanged {skipped}")


if __name__ == "__main__":
    main()
