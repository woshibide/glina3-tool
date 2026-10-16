# GLINA³ cup tool

Three.js reimplementation of GLINA³'s "Made After Demand" cup preview.
The end goal: visitors draw on a 3D-printed ceramic cup, see it as relief in glaze, and order it.
On `main` today it is only the baked cup turning behind the website's coming-soon notice (Kirby CMS), on laptops, tablets, and phones.

## Context

- `ref/cups_photos/` holds reference photos of a real cup: extruded clay layer lines (about 1 mm pitch), a waisted body with a foot band, vertical relief ribs that also show on the inside, a glossy orange-red glaze that thins on raised edges, and an unglazed base with a printed spiral.
- `../../0_input/MADE_AFTER_DEMAND.html` is the client's own prototype.
  It fakes the cup in Canvas2D and has the product logic (image, drawing, and text layers turned into a relief heightmap; small/large sizes; pink and denim glazes).
  Treat it as a feature reference only, not as code to port.
- On `main`, the tool is stripped down to the background cup: no steps, no controls, no drawing UI.
  The full interaction prototype (drawing, baking, sharing, a mocked order, debug panels and exports) is parked on `ux-research`, with its product decisions (share links, payment, production image) in that branch's `AGENTS.md`.

## Git

- `main` is the tool as it will ship on the website, in the middle of a strip-down and revamp to fit the site.
  The website repository (`woshibide/glina3-web`) includes this repository as the `tool/` submodule and tracks `main`.
- `ux-research` parks the interaction prototype as it was before the revamp (commit `aac9252`).
  Do not merge it back; cherry-pick single ideas from it when needed.
- This folder (`2_development/tool`) is the checkout for editing the tool.
  `../www/tool` is the website's submodule copy at a pinned commit (detached HEAD); do not edit there.
- Push here first, then move the pin on the website's `develop` branch: `git submodule update --remote tool` in `../www`, then commit `tool`.
  The full workflow, both repositories' branches, and the clone steps are in `../www/README.md` ("Repositories and Git").
- The website's dev server also uses port 5173; when both run, start this one with `npm run start -- --port 4173`.

## Run

```bash
npm install
npm run start              # http://127.0.0.1:5173, the background cup on its own, hot reload
npm run start -- --port 4173
npm test                   # node --test, pure logic only
npm run build
npm run maps -- <folder>  # write the baked maps as PNG (see ../../1_research/3d)
```

## Layout

- `src/background.js`: the package entry (`"exports"` in `package.json`).
  `mountCup(canvas, { onReady })` bakes the cup in a worker, turns it, and returns `stop()`.
  The website imports it as the npm workspace package `glina-cup-tool` (see `../www/src/coming-soon.js`).
- `src/main.js` and `index.html`: the standalone preview, mounted the same way the website does it.
- `src/scene/cup.js`: cup body as one lathe section (base, outer wall, rounded rim, inner wall, floor), in metres.
  The profile is resampled by arc length, so `uv.y` follows the surface evenly and maps can repeat at a physical pitch.
- `src/scene/surface.js`: the procedural surface model, baked into albedo, normal, and ORM data in the lathe's uv space.
  All look parameters live in its `LOOK` object (layer pitch, random-walk wobble, glaze pooling, colours, roughness).
  It is pure and seeded, so it is unit-tested in Node and identical in every browser.
- `src/scene/surface.worker.js`: runs the bake off the main thread.
- `src/scene/materials.js`: bakes in a worker and applies the maps to the cup's `MeshPhysicalMaterial`, extended in the shader with drawn relief and a toon look (both idle on `main`, kept for the drawing to come back).
  `SameOriginWorker` starts the worker from a same-origin blob when the module comes from another origin, which is the case on the website's dev server (Kirby on :8000, Vite on :5173).
- `src/scene/stage.js`: renderer, lighting, camera, `render(view)`, `setSurface`, `setRelief`, `setFrame`.
- `src/design/strip.js`: the drawing strip spec, mask rasterizer, and `layerRelief`; the stage still sizes its relief texture from it.
- `public/maps/`: place authored or photo-derived maps here (served at `maps/...`).
- `ref/`: reference material; `ref/cup-texture.JPG` is the close-up of glaze pooling in the layer grooves.

## Conventions

- Units are metres in the scene; profile constants in `cup.js` are millimetres.
- `render(view)` draws only from the values it is given (rotation, tilt, toon), so every frame is reproducible.
  Do not read wall-clock time or unseeded randomness inside it.
- No framework in the tool: plain modules, so any page (Kirby template, Vue, or none) can mount it.
- Laptops, tablets, and phones are all in scope; touch is a first-class input.

## Background cup

- The cup turns once every 24 s and leans towards the mouse; on phones it follows the tilt.
  With reduced motion it stands still.
- The canvas takes no pointer input, so the page above it stays usable; the page sizes it with CSS and fades it in on `onReady`.
- Bake resolution follows the screen (`bakeSize`): about one texel per device pixel on the cup, 1024 to 4096 per side, so about 3072 x 3328 on a 2x laptop.
  The bake takes about 4 s there; it runs once, at mount.
- On narrow screens the camera zooms out (`FIT_ASPECT`) so the cup keeps clear of the sides.
- Android reports tilt right away.
  iOS asks for permission first, and only from a tap, so the first tap on the page outside links and controls asks; until then the cup only turns.
  Sideways screens ignore tilt.

## Decisions to revisit

- Relief mode: only raised relief exists (black pushes the wall out).
  We need to check later with the printer and glaze whether carved relief (black pushes in, glaze pools in the lines) prints and reads better, and whether to offer both.
- Bake on the device versus shipped maps: baking costs a few seconds of CPU but no download; the same maps as files would be about 14 MB of PNG at 2048 x 2048.
- The cup shape is fixed; a bézier profile editor is parked. The strip is stored in angle by height, so drawings survive a shape change.
- Glaze around drawn relief is tuned lightly (`reliefPool`, `reliefThin` in `LOOK`); compare with a printed sample when one exists.

## Surface model

The glaze is modelled as a translucent layer of varying thickness over the clay.
- Clay height: layers sit at fixed printer heights; each layer boundary wanders around the cup as a closed random walk that partly inherits the wander of the layer below.
- Flat faces (underside, inner floor) show the printed spiral instead of layers.
- Glaze thickness pools in grooves and concave corners, thins on ridges and convex edges (rim, foot ledge), varies with simplex noise and faint downward runs, is thicker inside, and is zero on the underside.
- Colour moves from clay towards the glaze's own deep colour as thickness grows, so ridges show the clay and grooves turn deep red.
- The glazed surface height is clay height plus glaze thickness, so pooled glaze softens the grooves in the normal map.
- The inside loses ambient light with depth (AO), since it sees little of the room.

## Next steps for the look

1. Tune `LOOK` against the photos; consider look-dev controls if tuning in code gets slow.
2. Product sizes and glazes (pink, denim) from the client prototype: each glaze is a `glaze` colour plus `glazeOpacity`.
