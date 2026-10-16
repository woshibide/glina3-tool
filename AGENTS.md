# GLINA³ cup tool

Three.js reimplementation of GLINA³'s "Made After Demand" cup preview.
The goal is a believable real-time render of their 3D-printed ceramic cups, so a customer's image, drawing, or text can later be previewed as relief on the cup.

## Context

- `ref/cups_photos/` holds reference photos of a real cup: extruded clay layer lines (about 1 mm pitch), a waisted body with a foot band, vertical relief ribs that also show on the inside, a glossy orange-red glaze that thins on raised edges, and an unglazed base with a printed spiral.
- `../../0_input/MADE_AFTER_DEMAND.html` is the client's own prototype.
  It fakes the cup in Canvas2D and has the product logic (image, drawing, and text layers turned into a relief heightmap; small/large sizes; pink and denim glazes).
  Treat it as a feature reference only, not as code to port.
- The current phase is look development: geometry, materials, and maps.
  The customer-facing interface comes later.

## Run

```bash
npm install
npm run start              # http://127.0.0.1:5173, hot reload
npm run start -- --port 4173
npm test                   # node --test, pure logic only
npm run build
npm run maps -- <folder>  # write the baked maps as PNG (see ../../1_research/3d)
```

## Layout

- `src/scene/cup.js`: cup body as one lathe section (base, outer wall, rounded rim, inner wall, floor), in metres.
  The profile is resampled by arc length, so `uv.y` follows the surface evenly and maps can repeat at a physical pitch.
- `src/scene/surface.js`: the procedural surface model, baked into albedo, normal, and ORM data in the lathe's uv space.
  All look parameters live in its `LOOK` object (layer pitch, random-walk wobble, glaze pooling, colours, roughness).
  It is pure and seeded, so it is unit-tested in Node and identical in preview and exports.
- `src/scene/surface.worker.js`: runs the bake (about 2 s) off the main thread.
- `src/scene/materials.js`: loads the bake once, shares it between stages, and applies it to the cup's `MeshPhysicalMaterial`.
  The cup shows plain clay until the maps arrive.
- `src/scene/stage.js`: renderer, environment lighting, camera, and `render(look, time)`.
  The preview owns one stage; every export builds its own from a frozen snapshot.
- `src/App.vue`: workspace shell (controls panel, aspect-correct preview, saved state, exports).
- `src/components`, `src/lib`, `src/composables`, `src/*.css`: controls and helpers ported from the Baza skill (`~/.claude/skills/baza`); keep their look and behaviour, and keep `THIRD_PARTY_NOTICES.txt` for the Lucide icons.
- `public/maps/`: place authored or photo-derived maps here (served at `maps/...`).
- `ref/`: reference material; `ref/cup-texture.JPG` is the close-up of glaze pooling in the layer grooves.

## Conventions

- Units are metres in the scene; profile constants in `cup.js` are millimetres.
- Rendering is a pure function of saved state and time, so preview, PNG, and video exports match.
  Do not read wall-clock time or unseeded randomness inside `render`.
- Saved state lives under the versioned `glina:cup:v1` localStorage key; add a validator for every new key and bump the version on incompatible changes.
- Exports: PNG, MP4 (H.264), and WebM (VP9/VP8) via Mediabunny, rendered offline at pixel ratio 1.
- Desktop only.

## Surface model

The glaze is modelled as a translucent layer of varying thickness over the clay.
- Clay height: layers sit at fixed printer heights; each layer boundary wanders around the cup as a closed random walk that partly inherits the wander of the layer below.
- Flat faces (underside, inner floor) show the printed spiral instead of layers.
- Glaze thickness pools in grooves and concave corners, thins on ridges and convex edges (rim, foot ledge), varies with simplex noise and faint downward runs, is thicker inside, and is zero on the underside.
- Colour moves from clay towards the glaze's own deep colour as thickness grows, so ridges show the clay and grooves turn deep red.
- The glazed surface height is clay height plus glaze thickness, so pooled glaze softens the grooves in the normal map.
- The inside loses ambient light with depth (AO), since it sees little of the room.

## Next steps for the look

1. Tune `LOOK` against the photos; consider look-dev controls in the panel if tuning in code gets slow.
2. Relief from a heightmap via displacement on the dense lathe mesh; the glaze model already pools in concave relief once relief feeds the height and curvature terms.
3. Higher bake resolution for close-ups (rows are about 8 px per mm now).
4. Product sizes and glazes (pink, denim) from the client prototype: each glaze is a `glaze` colour plus `glazeOpacity`.
