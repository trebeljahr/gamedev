# Sound Library Organization

Sound folders use three organization types:

## User Collections

These are curated folders assembled for game-dev use. They are not artist packs.

- `sounds/ambience/**`
- `sounds/animals/**`
- `sounds/cinematic/**`
- `sounds/combat/**`
- `sounds/misc/**`
- `sounds/movement/**`
- `sounds/negatives/**`
- `sounds/player-noises/**`
- `sounds/positives/**`

Treat each file as mixed-source. Resolve provenance through `metadata.json` source mappings before shipping.

## Creator Packs

These folders preserve a creator/source pack boundary.

- `sounds/kenney/<pack>/**`
- `sounds/movement/<freesound-pack-id>__<author>__<pack>/**`

Use the folder's bundled license/readme when present, then verify source terms for commercial release.

## Source Patterns

These are lookup rules, not playable packs.

- `sounds/**/{numeric-id}__{username}__*.{mp3,wav,flac,ogg,m4a}` maps to Freesound IDs.
- `sounds/**/freesound_community-*.mp3` maps to Pixabay's Freesound Community uploads.
- `sounds/**/{name}-{id}.mp3` maps to Pixabay IDs.

The media catalog renders these separately from user collections and creator packs.
