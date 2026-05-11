#!/usr/bin/env python3
"""
Extract per-material baseColorFactor from a directory of OBJ .mtl files into
the same JSON shape that extract_blend_materials.py / apply_blend_colors.py
already use.

Use this for Quaternius 2017-2019-era packs that ship .mtl sidecars next to
the .obj files. The .mtl Kd lines preserve the per-material diffuse colors
that the FBX2glTF v0.9.7 conversion dropped, and reading them takes a
fraction of the time Blender headless would.

Same output format as extract_blend_materials.py, so it plumbs straight into
apply_blend_colors.py or conv3d's --material-colors flag.

Usage:
  python3 extract_mtl_colors.py <mtl_dir> <out_json>
"""
import json
import sys
from pathlib import Path


def parse_mtl(path: Path) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    current: str | None = None
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("newmtl"):
            parts = line.split(None, 1)
            current = parts[1] if len(parts) > 1 else None
            continue
        if current and line.startswith("Kd"):
            parts = line.split()
            if len(parts) >= 4:
                try:
                    out[current] = [float(parts[1]), float(parts[2]), float(parts[3]), 1.0]
                except ValueError:
                    pass
    return out


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract_mtl_colors.py <mtl_dir> <out_json>")
        return 1
    mtl_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    if not mtl_dir.exists():
        print(f"not found: {mtl_dir}")
        return 1
    result: dict[str, dict[str, dict[str, object]]] = {}
    for mtl in sorted(mtl_dir.glob("*.mtl")):
        mats = parse_mtl(mtl)
        if not mats:
            continue
        result[mtl.stem] = {
            name: {"color": rgba, "source": "mtl_kd"} for name, rgba in mats.items()
        }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path} ({len(result)} stems)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
