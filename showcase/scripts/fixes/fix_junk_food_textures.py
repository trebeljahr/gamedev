#!/usr/bin/env python3
"""
Patch junk-food-pack-apr-2017 GLBs to embed their texture atlas.

The original FBX/OBJ export from Blender 2.76 dropped the texture binding
even though the meshes carry UVs. The texture PNGs sit alongside in the
Blender/Textures folder. Here we embed the PNG into the GLB binary buffer,
wire up image/sampler/texture entries, and point each material's
baseColorTexture at it.
"""
import struct
import json
import sys
from pathlib import Path

GLB_DIR = Path("/Users/rico/projects/3d-assets/glb-optimized/quaternius/junk-food-pack-apr-2017/glb")
TEX_DIR = Path("/Users/rico/projects/3d-assets/models/quaternius/junk-food-pack-apr-2017/extracted/Junk Food Pack - Apr 2017/Blender/Textures")

# model name (without .glb) -> texture filename in TEX_DIR
TEXTURE_MAP = {
    "Burger": "BurgerTexture.png",
    "Cake": "CakeTexture.png",
    "Cookie": "CookieTexture.png",
    "Cupcake": "CupcakeTexture.png",
    "CupcakeCherry": "CupcakeTexture.png",
    "CupcakeCherry2": "CupcakeTexture.png",
    "Donut": "DonutTexture.png",
    "Donut2": "DonutTexture.png",
    "Hotdog": "HotDogTexture.png",
    "Icecream": "Icecream.png",
    "Icecream2": "Icecream.png",
    "Icecream3": "Icecream.png",
    "Milkshake": "milkshake.png",
    "Pizza": "PizzaTexture.png",
    "Soda": "SodaTexture.png",
    "SodaCan": "SodaCan.png",
}

GLB_MAGIC = 0x46546C67  # "glTF"
JSON_CHUNK = 0x4E4F534A  # "JSON"
BIN_CHUNK = 0x004E4942   # "BIN\0"


def pad4(n: int) -> int:
    return (4 - (n % 4)) % 4


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, total_len = struct.unpack("<III", data[:12])
    assert magic == GLB_MAGIC, f"not a GLB: {path}"
    assert version == 2, f"unsupported version {version}"

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
    # Pad JSON chunk with spaces (0x20) to 4-byte boundary
    json_bytes += b" " * pad4(len(json_bytes))
    # Pad BIN chunk with zeros to 4-byte boundary
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


def patch(glb_path: Path, png_path: Path) -> str:
    gltf, bin_bytes = read_glb(glb_path)
    png = png_path.read_bytes()

    # Idempotence: if any material already has a baseColorTexture, skip.
    for m in gltf.get("materials", []):
        if "baseColorTexture" in m.get("pbrMetallicRoughness", {}):
            return f"  skip {glb_path.name} (already patched)"

    # Append PNG to the binary buffer at a 4-byte aligned offset.
    pad = pad4(len(bin_bytes))
    img_offset = len(bin_bytes) + pad
    new_bin = bin_bytes + b"\x00" * pad + png

    # Add bufferView for the image bytes
    buffer_views = gltf.setdefault("bufferViews", [])
    img_bv_index = len(buffer_views)
    buffer_views.append({
        "buffer": 0,
        "byteOffset": img_offset,
        "byteLength": len(png),
    })

    # Update buffer[0].byteLength
    gltf["buffers"][0]["byteLength"] = len(new_bin)

    # Add image
    images = gltf.setdefault("images", [])
    img_index = len(images)
    images.append({
        "name": png_path.stem,
        "mimeType": "image/png",
        "bufferView": img_bv_index,
    })

    # NEAREST filter — Quaternius atlases are color palettes; linear would bleed
    samplers = gltf.setdefault("samplers", [])
    sampler_index = len(samplers)
    samplers.append({"magFilter": 9728, "minFilter": 9728})

    # Add texture
    textures = gltf.setdefault("textures", [])
    tex_index = len(textures)
    textures.append({"sampler": sampler_index, "source": img_index})

    # Point every material at the texture and reset color to white
    for m in gltf.get("materials", []):
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorTexture"] = {"index": tex_index}
        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
        # The atlas is shaded as flat color — turn off metallic so it looks right
        pbr["metallicFactor"] = 0.0
        pbr["roughnessFactor"] = 0.9

    write_glb(glb_path, gltf, new_bin)
    return f"  {glb_path.name} ← {png_path.name} ({len(png)} bytes)"


def main():
    if not GLB_DIR.exists():
        sys.exit(f"glb dir not found: {GLB_DIR}")
    if not TEX_DIR.exists():
        sys.exit(f"texture dir not found: {TEX_DIR}")

    count = 0
    for glb in sorted(GLB_DIR.glob("*.glb")):
        name = glb.stem
        tex = TEXTURE_MAP.get(name)
        if not tex:
            print(f"  skip {glb.name} (no texture mapping)")
            continue
        png = TEX_DIR / tex
        if not png.exists():
            print(f"  skip {glb.name} ({tex} missing)")
            continue
        print(patch(glb, png))
        count += 1
    print(f"patched {count} GLB(s)")


if __name__ == "__main__":
    main()
