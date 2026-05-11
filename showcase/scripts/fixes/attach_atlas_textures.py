#!/usr/bin/env python3
"""
Embed texture image(s) into each GLB and wire them up as the material's
baseColorTexture. Driven by a JSON mapping produced by
extract_blend_textures.py.

JSON shape (new):
  {
    "<blend_stem>": {
      "materials": {
        "<material_name>": ["candidate1.png", "candidate2.png"]
      },
      "all": ["candidate1.png", "candidate2.png"]
    }
  }

The legacy single-list-per-blend shape ({"<stem>": [...]}) is still accepted
and applies the same texture to every material in the GLB.

Usage:
  python3 attach_atlas_textures.py <glb_dir> <texture_dir> <textures_json>

Idempotent — skips GLBs whose materials already have a baseColorTexture.
"""
import json
import re
import struct
import sys
from pathlib import Path

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


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


def add_image_texture(gltf: dict, bin_bytes: bytes, png_path: Path):
    """Append PNG/JPG to the buffer; add image+texture; return (texture_index, new_bin)."""
    png = png_path.read_bytes()
    mime = "image/jpeg" if png_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    pad = pad4(len(bin_bytes))
    img_offset = len(bin_bytes) + pad
    new_bin = bin_bytes + b"\x00" * pad + png

    buffer_views = gltf.setdefault("bufferViews", [])
    img_bv = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": img_offset, "byteLength": len(png)})
    gltf["buffers"][0]["byteLength"] = len(new_bin)

    images = gltf.setdefault("images", [])
    img_index = len(images)
    images.append({"name": png_path.stem, "mimeType": mime, "bufferView": img_bv})

    samplers = gltf.setdefault("samplers", [])
    if not samplers:
        samplers.append({})  # default linear filtering — adequate for atlases
    sampler_index = 0

    textures = gltf.setdefault("textures", [])
    tex_index = len(textures)
    textures.append({"sampler": sampler_index, "source": img_index})
    return tex_index, new_bin


def normalize_name(s: str) -> str:
    """Loose normalization for fuzzy GLB-stem / material-name lookups."""
    return "".join(ch.lower() for ch in s if ch.isalnum())


def resolve_texture(candidates: list[str], tex_index: dict[str, Path]) -> Path | None:
    """First exact-case-insensitive match for any candidate filename."""
    for c in candidates:
        hit = tex_index.get(c.lower())
        if hit:
            return hit
    return None


def attach(glb_path: Path, mat_textures: dict, fallback_candidates: list, tex_index: dict) -> str:
    """
    mat_textures: { material_name -> [candidate_filename, ...] }
    fallback_candidates: candidates to use when a material is not in mat_textures
    """
    gltf, bin_bytes = read_glb(glb_path)

    for m in gltf.get("materials", []):
        if "baseColorTexture" in m.get("pbrMetallicRoughness", {}):
            return f"  skip {glb_path.name} (already has texture)"

    # Build a normalized lookup so we can match material names that picked up
    # a Blender ".001" suffix during merge/dedup.
    norm_mat_textures = {normalize_name(k): v for k, v in mat_textures.items()}

    # Cache: png path -> texture index in this GLB (avoid embedding the same
    # image twice when it's shared across materials).
    embedded: dict[Path, int] = {}
    applied = 0

    for m in gltf.get("materials", []):
        name = m.get("name", "")
        candidates = (
            mat_textures.get(name)
            or norm_mat_textures.get(normalize_name(re.sub(r"\.\d+$", "", name)))
            or fallback_candidates
        )
        if not candidates:
            continue
        png_path = resolve_texture(candidates, tex_index)
        if not png_path:
            continue
        if png_path not in embedded:
            tex_idx, bin_bytes = add_image_texture(gltf, bin_bytes, png_path)
            embedded[png_path] = tex_idx
        else:
            tex_idx = embedded[png_path]
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorTexture"] = {"index": tex_idx}
        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
        pbr["metallicFactor"] = 0.0
        pbr["roughnessFactor"] = 0.9
        # Foliage textures use alpha cutout — without MASK + doubleSided the
        # leaves render as opaque rectangles showing the PNG background.
        n_lower = name.lower()
        if any(tag in n_lower for tag in ("leaves", "leaf", "petals", "flowers", "bush")):
            m["alphaMode"] = "MASK"
            m["alphaCutoff"] = 0.5
            m["doubleSided"] = True
        applied += 1

    if not applied:
        return f"  skip {glb_path.name} (no usable textures)"

    write_glb(glb_path, gltf, bin_bytes)
    summary = ", ".join(p.name for p in embedded)
    return f"  patched {glb_path.name} ← {summary} ({applied} mat)"


def main():
    if len(sys.argv) != 4:
        print("usage: attach_atlas_textures.py <glb_dir> <texture_dir> <textures_json>")
        sys.exit(1)

    glb_dir = Path(sys.argv[1])
    tex_dir = Path(sys.argv[2])
    tex_json = Path(sys.argv[3])
    if not glb_dir.exists() or not tex_dir.exists() or not tex_json.exists():
        sys.exit("inputs not found")

    mapping = json.loads(tex_json.read_text())
    # Normalize: tolerate both legacy {stem: [files]} and new {stem: {materials, all}}
    norm_mapping = {}
    for k, v in mapping.items():
        if isinstance(v, list):
            norm_mapping[normalize_name(k)] = {"materials": {}, "all": v}
        else:
            norm_mapping[normalize_name(k)] = v

    tex_index = {p.name.lower(): p for p in tex_dir.rglob("*") if p.is_file()}

    patched = skipped = missing = 0
    for glb in sorted(glb_dir.rglob("*.glb")):
        entry = norm_mapping.get(normalize_name(glb.stem))
        if not entry:
            print(f"  skip {glb.name} (no .blend mapping)")
            missing += 1
            continue
        result = attach(glb, entry.get("materials", {}), entry.get("all", []), tex_index)
        print(result)
        if "skip" in result:
            skipped += 1
        else:
            patched += 1

    print(f"patched {patched}, skipped {skipped}, missing {missing}")


if __name__ == "__main__":
    main()
