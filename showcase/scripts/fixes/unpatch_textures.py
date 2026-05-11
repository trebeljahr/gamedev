#!/usr/bin/env python3
"""
Strip embedded images/textures/samplers from each GLB in a pack so the
texture-attach scripts can be re-run from a clean slate.

Assumes the original pack had no embedded images. Use only on packs whose
GLBs we previously patched and where you want to redo the texture binding.

Usage:
  python3 unpatch_textures.py <glb_dir>
"""
import json
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
    magic, _, total = struct.unpack("<III", data[:12])
    assert magic == GLB_MAGIC
    off = 12
    json_len, json_type = struct.unpack("<II", data[off:off + 8])
    assert json_type == JSON_CHUNK
    off += 8
    json_bytes = data[off:off + json_len]
    off += json_len
    bin_bytes = b""
    if off < total:
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


def main():
    if len(sys.argv) != 2:
        print("usage: unpatch_textures.py <glb_dir>")
        sys.exit(1)
    glb_dir = Path(sys.argv[1])

    cleaned = 0
    for glb in sorted(glb_dir.rglob("*.glb")):
        gltf, bin_bytes = read_glb(glb)
        images = gltf.get("images", [])
        if not images:
            continue

        # Find the lowest byteOffset among image bufferViews — that's where
        # our appended data starts. Drop those bufferViews and truncate.
        image_bvs = {img.get("bufferView") for img in images if "bufferView" in img}
        bvs = gltf.get("bufferViews", [])
        cut_offset = min((bvs[i]["byteOffset"] for i in image_bvs if i is not None and i < len(bvs)), default=None)
        if cut_offset is None:
            continue

        # Remove image bufferViews
        keep_bvs = [bv for i, bv in enumerate(bvs) if i not in image_bvs]
        # Index remap — but we only modify materials.baseColorTexture refs;
        # accessors keep their bufferView indices among the kept ones, which
        # are all at indices < len(keep_bvs) because images were appended last.
        gltf["bufferViews"] = keep_bvs

        # Clear image/texture/sampler refs we added
        gltf.pop("images", None)
        gltf.pop("textures", None)
        # Only drop samplers if there were any (we may have added a default).
        # Safer to keep existing — but if attach script added one and there
        # were none before, leaving an empty samplers list is harmless.
        if "samplers" in gltf and len(gltf["samplers"]) == 1 and not gltf["samplers"][0]:
            gltf.pop("samplers", None)

        # Reset material color refs
        for m in gltf.get("materials", []):
            pbr = m.get("pbrMetallicRoughness", {})
            pbr.pop("baseColorTexture", None)

        # Truncate buffer
        new_bin = bin_bytes[:cut_offset]
        # Strip trailing alignment zero-padding from before our appended data
        while new_bin.endswith(b"\x00") and len(new_bin) % 4 == 0 and (len(bin_bytes) - len(new_bin)) < 4:
            break  # already aligned
        gltf["buffers"][0]["byteLength"] = len(new_bin)
        write_glb(glb, gltf, new_bin)
        cleaned += 1
        print(f"  cleaned {glb.name}")

    print(f"cleaned {cleaned} GLB(s)")


if __name__ == "__main__":
    main()
