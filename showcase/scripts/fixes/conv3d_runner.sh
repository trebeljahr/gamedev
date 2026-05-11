#!/bin/bash
# Re-convert every broken Quaternius pack with the fixed conv3d.
# Output goes to glb-optimized-v2/ for review before promotion.
set -e

CONV3D="node /Users/rico/projects/conv3d/dist/conv3d.js"
SRC_BASE="/Users/rico/projects/3d-assets/models/quaternius"
OUT_BASE="/Users/rico/projects/3d-assets/glb-optimized-v2/quaternius"
DATA_DIR="/Users/rico/projects/3d-assets/showcase/scripts/fixes/data"
LOG="/tmp/conv3d_run_$(date +%s).log"
echo "logging to $LOG"

run_pack() {
  local pack="$1" inner="$2" fbx_sub="$3" tex_sub="$4" colors_json="$5"
  local fbx="$SRC_BASE/$pack/extracted/$inner/$fbx_sub"
  local out="$OUT_BASE/$pack"
  mkdir -p "$out"
  echo "===== $pack =====" | tee -a "$LOG"

  local args=(bulk "$fbx" -m FBX --optimize --no-tsx --flat -o "$out" -y --overwrite=replace)
  [ -n "$tex_sub" ] && args+=(--textures-dir "$SRC_BASE/$pack/extracted/$inner/$tex_sub")
  [ -n "$colors_json" ] && args+=(--material-colors "$DATA_DIR/$colors_json")

  $CONV3D "${args[@]}" 2>&1 | tee -a "$LOG" | grep -E "✨|🚨|Error|seeded|recovered|applied|hinted" || true
}

# Atlas-missing packs (some also benefit from material colors)
run_pack buildings-pack-aug-2017            "Buildings pack - Aug 2017"            FBX Textures           buildings-pack-aug-2017_materials.json
run_pack junk-food-pack-apr-2017            "Junk Food Pack - Apr 2017"            FBX Blender/Textures   ""
run_pack man-animated-oct-2017              "Man Animated - Oct 2017"              FBX Blend/Textures     ""
run_pack textured-fantasy-nature-mar-2017   "Textured Fantasy Nature - Mar 2017"   FBX Blends/Textures    ""
run_pack textured-stylized-trees-may-2020   "Textured Stylized Trees - May 2020"   FBX Textures           ""
run_pack ultimate-stylized-nature-may-2022  "Ultimate Stylized Nature - May 2022"  FBX Textures           ""
run_pack ultimate-textured-building-pack-dec-2019  "Ultimate Textured Building Pack - Dec 2019"  "Models with Materials/FBX"  "Textured Models/Textures"  ""
run_pack woman-animated-dec-2017            "Woman Animated - Dec 2017"            FBX Blends             ""
run_pack zombie-by-quaternius               "Zombie by @Quaternius"                FBX Blends             ""

# All-grey packs: per-material colors from .blend extraction
run_pack animated-fps-guns-jun-2018         "Animated FPS Guns - Jun 2018"         FBX ""                 animated-fps-guns-jun-2018_materials.json
run_pack furniture-pack-oct-2017            "Furniture Pack - Oct 2017"            FBX ""                 furniture-pack-oct-2017_materials.json
run_pack modular-medieval-buildings-jul-2017 "Modular Medieval Buildings - Jul 2017" FBX ""                modular-medieval-buildings-jul-2017_materials.json
run_pack public-transport-pack-feb-2017     "Public Transport Pack - Feb 2017"     FBX Blends             public-transport-pack-feb-2017_materials.json
run_pack rpg-asset-pack-may-2017            "RPG Asset Pack - May 2017"            FBX Blends/Textures    rpg-asset-pack-may-2017_materials.json

echo "done. log: $LOG"
