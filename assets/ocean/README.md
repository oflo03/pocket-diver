# Ocean decoration sources

Both packs are CC0 (public domain): free for commercial use, no attribution required.

| File | Pack | Author | Source |
|---|---|---|---|
| tileset_waterworld.png | Waterworld Tileset 16x16 | coem | https://opengameart.org/node/72774 |
| corals.png | 2D Pixelart corals | pezleha | https://opengameart.org/node/144612 |

The game uses pieces cut from these (reeds, grass tufts, stones, ruin pillars and slabs, a carved tablet, corals and
hue-shifted coral variants), packed into `public/deco/sheet.png` with positions in `src/deco-sheet.json`.
Kelp, starfish, shells, anemones, tube worms, glowing life, rock texture, bubbles, marine snow and light shafts are
drawn in code (`src/decor.js`).

## Terrain

| File | Pack | Author | Source |
|---|---|---|---|
| ../underwater-diving/ (tiles.png and more) | Underwater Diving Pack | ansimuz (Luis Zuno) | https://opengameart.org/node/73303 (CC0) |

`tiles.png` is recoloured per zone into `public/terrain/rock-1..3.png` and drawn by `src/terrain.js`.

Hatch dressing (totems, ruined arch, chain) is cut from the same pack's `props.png` / `tiles.png` into
`public/terrain/props-1..3.png` (recoloured per zone), positions in `src/terrain-props.json`.
