#!/usr/bin/env python3
"""
Apply a materials JSON (from extract_blend_materials.py) to every GLB in a
pack, replacing baseColorFactor where the material name matches.

Usage:
  python3 apply_blend_colors.py <glb_dir> <materials_json>

Idempotent — running twice produces the same result.
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


def find_color(name: str, mat_map: dict) -> list | None:
    """Try exact match, then fall back to bare name (without .NNN suffix)."""
    info = mat_map.get(name)
    if info:
        return info["color"]
    bare = re.sub(r"\.\d+$", "", name)
    # Try any entry whose bare name matches
    for k, v in mat_map.items():
        if re.sub(r"\.\d+$", "", k) == bare:
            return v["color"]
    return None


def main():
    if len(sys.argv) != 3:
        print("usage: apply_blend_colors.py <glb_dir> <materials_json>")
        sys.exit(1)

    glb_dir = Path(sys.argv[1])
    mat_json = Path(sys.argv[2])
    if not glb_dir.exists() or not mat_json.exists():
        sys.exit("inputs not found")

    materials = json.loads(mat_json.read_text())

    patched = 0
    skipped = 0
    for glb in sorted(glb_dir.rglob("*.glb")):
        mat_map = materials.get(glb.stem)
        if not mat_map:
            print(f"  skip {glb.name} (no .blend entry)")
            skipped += 1
            continue

        gltf, bin_bytes = read_glb(glb)

        # Are any materials carrying real (non-default) colors already?
        # The exporter writes 0.8000…11920929 (float32 round-trip of 0.8),
        # so compare with a tolerance rather than against exact 0.8.
        def is_default_grey(c):
            return (
                len(c) >= 3
                and all(abs(x - 0.8) < 1e-4 for x in c[:3])
                and (len(c) < 4 or abs(c[3] - 1.0) < 1e-4)
            )
        already_has_colors = any(
            not is_default_grey(
                m.get("pbrMetallicRoughness", {}).get("baseColorFactor", [0.8, 0.8, 0.8, 1.0])
            )
            for m in gltf.get("materials", [])
        )
        if already_has_colors:
            print(f"  skip {glb.name} (already patched)")
            skipped += 1
            continue

        changes = 0
        for m in gltf.get("materials", []):
            color = find_color(m.get("name", ""), mat_map)
            if color is None:
                continue
            pbr = m.setdefault("pbrMetallicRoughness", {})
            pbr["baseColorFactor"] = color
            pbr.setdefault("metallicFactor", 0.0)
            pbr.setdefault("roughnessFactor", 0.9)
            changes += 1

        if changes:
            write_glb(glb, gltf, bin_bytes)
            print(f"  patched {glb.name} ({changes} materials)")
            patched += 1
        else:
            print(f"  skip {glb.name} (no name matches)")
            skipped += 1

    print(f"patched {patched}, skipped {skipped}")


if __name__ == "__main__":
    main()
