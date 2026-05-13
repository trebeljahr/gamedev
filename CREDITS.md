# Asset Credits & Licensing

Quick lookup of where every asset in this folder came from and what you owe each creator. Machine-readable version lives in `metadata.json` next to this file.

> Filename patterns were used to classify most assets. When you ship something, always double-check the individual model's license on the source site — especially for Sketchfab and Freesound where each asset has its own terms.

## TL;DR by folder

| Folder | Primary source | License | Attribution? |
|---|---|---|---|
| `textures/` | [Poly Haven](https://polyhaven.com/) | CC0 | Optional |
| `3D/fbx/mixamo/` | [Mixamo](https://www.mixamo.com/) | Mixamo ToS (free, Adobe account required) | No |
| `3D/fbx/mocap-suit/`, `3D/gltf/mocap-suit/` | [CMU Mocap](http://mocap.cs.cmu.edu/) | Free | No |
| `3D/fbx/fuse-*`, `medieval-civilian-3` | [Adobe Fuse CC](https://www.adobe.com/products/fuse.html) (discontinued) | Adobe ToS | No |
| `3D/fbx/Some Animals-fbx/` | Quaternius via Poly Pizza | CC0 | Optional |
| `3D/obj/Ultimate Space Kit/`, `3D/gltf/Ultimate Space Kit/` | [Quaternius](https://quaternius.com/) | CC0 | Optional |
| `3D/glb/*-glb/` (folders) | [Poly Pizza](https://poly.pizza/) (mostly Quaternius & Kay Lousberg kits) | Mostly CC0 | Optional per-model |
| `3D/glb/animals-glb/` | Mixed (Poly Pizza CC0 + Sketchfab) | Varies | Per-model |
| `3D/glb/characters-glb/`, `enemies/`, `weapons/` | [Poly Pizza](https://poly.pizza/) | Mostly CC0 | Per-model |
| `3D/glb/<snake_case>.glb` (individual) | [Sketchfab](https://sketchfab.com/) | **Varies — check each** | Often yes |
| `3D/gltf/buster_drone/`, `mars-rover/`, `steampunk-sub/`, `triceratops/` | Sketchfab | See bundled `license.txt` | Varies |
| `3D/kenney/` (48 packs), `3D-optimized/kenney/` (Draco-compressed mirror), `2D/kenney/` (142 packs) | [Kenney](https://kenney.nl/) | CC0 | Optional |
| `sounds/**/<id>__<user>__*.mp3` | [Freesound](https://freesound.org/) | **Varies per sound** | Often yes |
| `sounds/**/freesound_community-*.mp3` | [Pixabay](https://pixabay.com/) (CC0 reuploads) | Pixabay License | No |
| `sounds/**/*-<id>.mp3` (trailing numeric id) | [Pixabay](https://pixabay.com/) | Pixabay License | No |
| `sounds/music/Ancient Winds.mp3`, `Bittersweet.mp3`, `Black Vortex.mp3`, `Clash Defiant.mp3`, `Comfortable Mystery 2.mp3`, `Corruption.mp3`, `Magic Forest.mp3`, `Midnight Tale.mp3`, `Peppers Theme.mp3`, `Stay the Course.mp3` | [Kevin MacLeod / incompetech](https://incompetech.com/) | CC-BY 4.0 | **Required** |

## Source details

### Poly Haven — `textures/`
- URL: https://polyhaven.com/
- License: CC0 1.0 — free for any use, attribution appreciated but not required.
- How to identify: filenames use `{name}_{ao|arm|diff|disp|nor_gl|rough}_{1k|2k|4k}.{jpg|png|exr}`. To find the source page, search `{name}` (e.g. `aerial_beach_01`) on polyhaven.com.
- ~239 texture files here.

### Quaternius — various kits
- URL: https://quaternius.com/
- License: CC0 1.0 — attribution not required.
- Support: https://www.patreon.com/quaternius
- Kits here believed to be by Quaternius: Ultimate Space Kit, Ultimate Modular Men/Women, Ultimate Food/Guns/Interior Props, Stylized Nature MegaKit, Animal Kit, Coral Reef Kit, Crystal Pack, Cube World Kit, Platform Kit Revamped, FPS Pack, Pirate/Survival/Race Kits, Scifi Turrets, Small Platformer Kit, Small Camping Bundle, 100 Avatars R1. The "Some Animals" FBX pack (`Chicken_001.fbx` etc.) is also Quaternius.

### Kay Lousberg (KayKit) — various kits
- URL: https://kaylousberg.com/ and https://kaylousberg.itch.io/
- License: CC0 1.0 — attribution optional.
- Kits here believed to be KayKit: City Pack, Office Pack, Pirate Kit (the KayKit one), Signs Pack, possibly Cosmetic Pack Two, Exploded Card Pack, Furniture Kit. Verify each on poly.pizza or kaylousberg.com.

### Kenney — `3D/kenney/`, `3D-optimized/kenney/`, `2D/kenney/`
- URL: https://kenney.nl/
- License: CC0 1.0 — attribution optional but appreciated ("Kenney" or "www.kenney.nl").
- Support: https://kenney.nl/donate and https://patreon.com/kenney
- Sourced by a full sweep of the [2D category](https://kenney.nl/assets/category:2D) (140 packs) plus 2 pattern texture packs, and the [3D category](https://kenney.nl/assets/category:3D) (48 packs).
- Each pack folder keeps the original `License.txt` shipped by Kenney.
- `3D-optimized/kenney/` mirrors `3D/kenney/` file-for-file, Draco-compressed via `gltf-pipeline -d` (~26% smaller whole-tree). Requires a Draco-capable loader (three.js `GLTFLoader` via `DRACOLoader`).
- Format notes: `3D/kenney/3d-road-tiles/` was converted from GLTF-only to GLB with `gltf-pipeline`. `3D/kenney/animated-characters-{protagonists,retro,survivors}/` were converted from FBX with `conv3d bulk -m FBX`; each retains its `Skins/` folder of PNG variants.
- Dedupe: `tower-defense-kit` was skipped because it already exists at `3D/glb/Kenney Tower Defense Kit-glb/`.
- Additional per-pack credits (beyond Kenney):
  - `3D/kenney/mini-arcade` — Fleur Keijsers, Guus Vermeulen
  - `3D/kenney/mini-arena` — Tony Schär
  - `3D/kenney/mini-market` — Fleur Keijsers, Guus Vermeulen
  - `3D/kenney/train-kit` — Guus Vermeulen, Tony Schär
  - `2D/kenney/monochrome-pirates` — Fleur Keijsers
  - `2D/kenney/particle-pack` — filter template credits in the pack's `License.txt`

### Poly Pizza — aggregator
- URL: https://poly.pizza/
- The `*-glb` folders and files with a dash + 8–12-character random ID (e.g. `Crystal-3saqXqoOti.glb`) came from Poly Pizza. Poly Pizza redistributes models from many creators — mostly Quaternius and Kay Lousberg (both CC0), plus others with varying terms. Always check each asset's original creator on poly.pizza.

### Mixamo — `3D/fbx/mixamo/`, `3D/glb/xbot.glb`
- URL: https://www.mixamo.com/
- License: Adobe Mixamo Terms — free for commercial use with an Adobe ID; you **cannot** redistribute the raw FBX files.
- Included characters: alien, archer, arissa, ely, eve, exo, ganfaul, heraklios, kachujin, michelle, ninja, paladin, pirate, special-ops, vanguard, wildling, x-bot, y-bot.
- Animation packs visible as subfolders (adventure, axe, longbow, magic, sword-and-shield, capoeira, strafe, etc.) correspond to Mixamo's named animation packs.

### Adobe Fuse CC — `3D/fbx/fuse-*`, `medieval-civilian-3`
- URL: https://www.adobe.com/products/fuse.html (discontinued 2020)
- Characters generated in Fuse and rigged via Mixamo. Usable in projects; do not redistribute raw files.

### CMU Motion Capture Database — `3D/fbx/mocap-suit/`, `3D/gltf/mocap-suit/`
- URL: http://mocap.cs.cmu.edu/
- License: Free for any use. Filenames use `{subject}_{trial}.{ext}` (e.g. `01_01.fbx`).

### Sketchfab — individual `.glb`, and `3D/gltf/{mars-rover, steampunk-sub, triceratops}/`
- URL: https://sketchfab.com/
- **License varies per model** — only commercially usable models should remain in this project; check each on its Sketchfab page.
- Three models here ship with their own `license.txt`:
  - **Perseverance — NASA Mars Landing 2021** by Thomas Flynn — CC0. https://sketchfab.com/3d-models/perseverance-nasa-mars-landing-2021-c1c94e1f69df45eeae4a0a1d0d27e85b
  - **Steampunk underwater explorer** by Andrius Beconis — CC-BY-4.0 (attribution required). https://sketchfab.com/3d-models/steampunk-underwater-explorer-127471a23e0f4790914b13b9052c4912
  - **Animated triceratops skeleton** by Zacxophone — CC0. https://sketchfab.com/3d-models/animated-triceratops-skeleton-06cb55f941d94dc8b95ac46f92d89e7c
- Other `snake_case_with_underscores.glb` files at the root of `3D/glb/` are Sketchfab downloads — search the filename stem on sketchfab.com to find the original page and license.

### ⚠️ Star Wars / IP-locked models
Models like `star_wars_*.glb`, `at-at.glb`, `lucrehulk.glb`, `star_destroyer.glb`, `fortnite_x_star_wars_encrypted_skin.glb`, `ready-player-one.glb`, and the `low-poly_hoth_level.glb` / `low-poly_imperial_cruiser_level.glb` / `low-poly_tatooine_level.glb` are fan-made on Sketchfab. Even if the Sketchfab license is permissive, Lucasfilm/Disney/Epic own the underlying IP. Use these only for personal/learning projects — never ship them commercially.

### Freesound — `sounds/**/<id>__<user>__*.mp3`
- URL: https://freesound.org/
- License **varies per sound** (CC0, CC-BY-4.0, CC-BY-3.0, CC Sampling Plus). Look up the sound at `https://freesound.org/s/<id>/` where `<id>` is the numeric prefix.
- Four pack folders include their own `_readme_and_license.txt`:
  - `sounds/movement/21607__ali_6868__grassy-footsteps/` — by Ali_6868, CC0
  - `sounds/movement/21608__ali_6868__gravel-footsteps/` — by Ali_6868, CC0
  - `sounds/movement/21610__ali_6868__knights-forest-footsteps/` — by Ali_6868, CC0
  - `sounds/movement/27652__falcospizaetus__steps/` — by falcospizaetus (see bundled file)

### Pixabay — `sounds/**/*-<id>.mp3`, `freesound_community-*.mp3`
- URL: https://pixabay.com/
- License: Pixabay Content License — free for commercial use, no attribution required.
- Files prefixed `freesound_community-` are Pixabay's re-host of CC0 Freesound content (still covered by the Pixabay License).

### Kevin MacLeod / incompetech — 10 music tracks in `sounds/music/`
- URL: https://incompetech.com/music/royalty-free/
- License: CC-BY 4.0 — **attribution required**.
- Tracks: `Ancient Winds.mp3`, `Bittersweet.mp3`, `Black Vortex.mp3`, `Clash Defiant.mp3`, `Comfortable Mystery 2.mp3`, `Corruption.mp3`, `Magic Forest.mp3`, `Midnight Tale.mp3`, `Peppers Theme.mp3`, `Stay the Course.mp3`.
- Standard attribution string:
  > "{Track Title}" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/

## Ready-to-paste credits block

Use this as a starting point in a game's credits screen. Tailor per-project.

```
ASSET CREDITS

3D models:
  — Quaternius (https://quaternius.com) — CC0
  — Kay Lousberg / KayKit (https://kaylousberg.com) — CC0
  — Kenney (https://kenney.nl) — CC0
    With contributions on selected packs by:
      — Fleur Keijsers
      — Guus Vermeulen
      — Tony Schär
  — Poly Pizza contributors (https://poly.pizza)
  — Individual Sketchfab authors (see per-model attribution below)

2D art:
  — Kenney (https://kenney.nl) — CC0
  — itch.io contributors (see `2D/CREDITS.md` for per-pack attribution)

Textures:
  — Poly Haven (https://polyhaven.com) — CC0

Character rigs and animation:
  — Mixamo by Adobe (https://mixamo.com)
  — CMU Graphics Lab Motion Capture Database (http://mocap.cs.cmu.edu)

Sound effects:
  — Freesound.org contributors (https://freesound.org) — per-sound licenses
  — Pixabay (https://pixabay.com) — Pixabay Content License

Music:
  — Kevin MacLeod (incompetech.com) — Licensed under CC-BY 4.0
    http://creativecommons.org/licenses/by/4.0/
    Tracks used: [list only the ones that ship]

Sketchfab per-model attribution (include only those you actually ship):
  — "Steampunk underwater explorer" by Andrius Beconis
    https://sketchfab.com/3d-models/steampunk-underwater-explorer-127471a23e0f4790914b13b9052c4912
    Licensed under CC-BY-4.0.
  — (CC0 models like Perseverance Mars rover and Triceratops skeleton need no attribution.)
```

## Verification checklist before shipping

1. Grep the filename stem on the suspected source site. If there's a `license.txt` next to the model, trust it over guesses.
2. For Sketchfab models, open the model page — the license is shown on the right sidebar.
3. For Freesound, each sound's page shows its CC license; aggregate what you actually used.
4. Drop the Kevin MacLeod attribution any time one of those 10 tracks plays.
5. Don't ship Star Wars / Fortnite / Ready Player One fan models commercially, regardless of the Sketchfab uploader's chosen license.

## Quaternius — `models/quaternius/`

72 packs by [Quaternius](https://quaternius.com/), all **CC0 1.0**. Free for any use, no attribution required (but appreciated). See `models/quaternius/LICENSE.md` for the per-pack list.

Support: https://www.patreon.com/quaternius


## KayKit (Kay Lousberg) — `models/kaykit/`

19 packs by [Kay Lousberg](https://kaylousberg.com/) ([itch.io profile](https://kaylousberg.itch.io/)), all **CC0 1.0**. Per-pack folders contain the original zip + extracted contents. See `models/kaykit/LICENSE.md`.

Support: https://www.patreon.com/kaylousberg


## Kenney — `kenney/`

205 packs by [Kenney](https://kenney.nl/), all **CC0 1.0**. Split between `kenney/2D/` (164) and `kenney/3D/` (41) by content type. Each subdir has a `_KENNEY_LICENSE.md` summary.

Support: https://patreon.com/kenney


## Music — `sounds/music/`

11 music packs and individual tracks. **License varies per pack** — verify each before commercial use.

Common patterns:
- **CC-BY 4.0** — attribution required (the Kevin MacLeod / incompetech tracks here)
- **CC0** — no requirements
- **Royalty-free / one-game licence** — usually OK for one shipped game; no redistribution

See each pack's bundled `License.txt` / `Readme` and `sounds/music/_LICENSE_README.md` for guidance.


## Vector tilesets — `vector-tilesets/`

5 vector tilesets (AI / CDR / EPS / SVG / PNG) that look like free packs from [gameart2d.com](https://www.gameart2d.com/freebies.html) (2014–2016 era). gameart2d's free terms allow personal + commercial use with attribution appreciated; redistribution of the assets themselves is not allowed. See `vector-tilesets/LICENSE.md`.


## Misc imports — `misc-imports/`

15 miscellaneous imports — Synty 3D kits ([Synty Standard licence](https://syntystudios.com/license/)), Google Fonts (OFL / Apache 2.0), small UI / SFX bundles. Each subfolder has its own `LICENSE.md` with the source and license note.

**Synty packs are not CC0.** They require a paid licence per shipped product — verify your seat / project licence before commercial use.

## itch.io 2D packs — `2D/`

Pixel art / 2D asset packs from itch.io (104 packs). See `2D/CREDITS.md` for per-pack attribution and license summaries; each pack also has a `LICENSE.md` with the exact terms.

License split:

- **31** packs are **CC0** (no attribution required). Free for any use including redistribution.
- **73** packs use custom **free-for-personal-and-commercial** terms with **no redistribution/resale** allowed; attribution appreciated but not required.

Before shipping commercial work, verify each pack's current terms against the live itch.io page — author terms can change.
