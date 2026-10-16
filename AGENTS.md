# GLINA³ cup tool

Three.js reimplementation of GLINA³'s "Made After Demand" cup preview.
Visitors draw on a 3D-printed ceramic cup and see it as relief in glaze, then order it.
It will live on the client's website (Kirby CMS with Vue), on laptops, tablets, and phones.

## Context

- `ref/cups_photos/` holds reference photos of a real cup: extruded clay layer lines (about 1 mm pitch), a waisted body with a foot band, vertical relief ribs that also show on the inside, a glossy orange-red glaze that thins on raised edges, and an unglazed base with a printed spiral.
- `../../0_input/MADE_AFTER_DEMAND.html` is the client's own prototype.
  It fakes the cup in Canvas2D and has the product logic (image, drawing, and text layers turned into a relief heightmap; small/large sizes; pink and denim glazes).
  Treat it as a feature reference only, not as code to port.
- The current phase is the interaction prototype: drawing, baking, sharing, and a mocked order.
  The visual design is deliberately quiet and Wikipedia-like until the website design exists.

## Git

- `main` is the tool as it will ship on the website, in the middle of a strip-down and revamp to fit the site.
  The website repository (`woshibide/glina3-web`) includes this repository as the `tool/` submodule and tracks `main`.
- `ux-research` parks the interaction prototype as it was before the revamp (commit `aac9252`).
  Do not merge it back; cherry-pick single ideas from it when needed.
- Push here first, then move the pin in the website: `git submodule update --remote tool` in `../www`.

## Run

```bash
npm install
npm run start              # http://127.0.0.1:5173, hot reload; add ?debug for the side panels
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
- `src/scene/surface.worker.js`: runs the bake (about 2 s on a laptop) off the main thread and reports progress.
- `src/scene/materials.js`: bakes in a worker and applies the maps to the cup's `MeshPhysicalMaterial`, extended in the shader with the drawn relief (vertex displacement plus bent normals) and the toon look (`uToon` fades 0..1).
- `src/scene/stage.js`: renderer, lighting, camera, `render(view)`, `setRelief`, `setSurface`, `setFrame` (fits the cup beside floating panels), and `frontU` (which part of the strip faces the camera).
  The page owns one stage; every export builds its own from a frozen snapshot.
- `src/design/strip.js`: the drawing strip (outer wall unrolled: angle by height), nibs and presets, the binary mask rasterizer, and `layerRelief` (one relief row per printed layer).
  Pure and tested; the mask is the production image (black raised, white flat).
- `src/design/codec.js`: design to share-link text (varints, deflate, base64url) and back, with clear errors for damaged links.
- `src/composables/useDesign.js`: strokes with undo, redo, and clear; the live mask during a stroke.
- `src/App.vue`: the flow, the render loop, saved state, sharing, keyboard shortcuts, and debug exports.
- `src/components/DrawBar.vue`, `StripCanvas.vue`, `OrderDialog.vue`, `DebugPanels.vue`: the floating bar (invite, drawing panel, baking progress, ready card), the strip, the mocked order, and the `?debug` panels.
- `src/ui.css`: the public look (Wikimedia Codex colours and type over Baza's tokens).
- Other files in `src/components`, `src/lib`, `src/composables`, and `src/styles.css`: controls and helpers ported from the Baza skill (`~/.claude/skills/baza`); keep their look and behaviour, and keep `THIRD_PARTY_NOTICES.txt` for the Lucide icons.
- `public/maps/`: place authored or photo-derived maps here (served at `maps/...`).
- `ref/`: reference material; `ref/cup-texture.JPG` is the close-up of glaze pooling in the layer grooves.

## Conventions

- Units are metres in the scene; profile constants in `cup.js` are millimetres.
- `render(view)` draws only from the values it is given (rotation, tilt, toon), so the live view and exports match.
  Do not read wall-clock time or unseeded randomness inside it.
- Saved state lives under the versioned `glina:tool:v1` localStorage key (drawing, tools, auto-rotate, debug settings); add a validator for every new key and bump the version on incompatible changes.
  The step is not saved: a reload starts at the look step with the saved drawing baked.
- Exports (debug only): PNG, MP4 (H.264), and WebM (VP9/VP8) via Mediabunny, rendered offline at pixel ratio 1.
- Laptops, tablets, and phones are all in scope; touch is a first-class input.

## Flow

1. Look: the baked cup turns slowly and follows the mouse, or the phone's tilt on Android.
2. Explore (after a click or tap on the cup): auto-rotation stops, drag orbits, scroll or pinch zooms; a button turns auto-rotation back on; the floating bar invites drawing.
3. Draw: the bar opens into tools and the strip, and the cup eases into the toon look.
   The strip's centre is the side of the cup facing the camera; phones show half a turn so lines are not too small.
   Tools: brush and eraser, each with its own nib (preset or adjusted: round, square, or flat; 2 to 20 mm; angle), and smoothing.
   Undo and redo by button or Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z; Clear is undoable.
   Text, image, and shape are shown as coming soon with a newsletter link.
4. Bake: the full glaze bake runs in a worker with progress on the bar, then the cup eases back to the real look.
5. Ready: "takes about 4 weeks", Order (mock-up, €60, one cup per design), Share (the whole design in the link), Edit drawing.

`?debug` adds a left panel (jump to a step, load a sample drawing, bake, download the production image, exports) and a right inspector (render, view, and design readouts).
The same is on `window.glina` for agents: `mode`, `strokes`, `stats`, `setMode()`, `load()`, `bake()`, `mask()`, `shareLink()`.

## Decisions to revisit

- Relief mode: only raised relief exists (black pushes the wall out).
  We need to check later with the printer and glaze whether carved relief (black pushes in, glaze pools in the lines) prints and reads better, and whether to offer both.
- Share links carry the whole design in the query string (about 250 characters for a few strokes, a few kilobytes for a busy drawing; the app warns above 8000).
  When this moves into Kirby, a backend can store designs and hand out short unique links instead.
- Payment: Revolut Business, a fixed €60 for one cup with one design, no basket.
  The browser cannot prove a payment happened, so the real flow is: Kirby creates a Revolut checkout for the design, Revolut confirms the payment to Kirby (webhook), and only then does Kirby accept the design for production.
  Until then Order is a mock-up and nothing is sent anywhere.
- Placeholders in `App.vue`: `PRICE_EUR`, `PRODUCTION_WEEKS` (4), and `NEWSLETTER_URL` (`#newsletter`).
- The production image is the strip mask at 1024 x 350 px (about 4.5 px per mm); check what resolution and format the printer's slicer needs.
- iOS only reports tilt after a permission prompt on a tap, which already ends the look step, so the tilt effect is Android-only for now.
- The cup shape is fixed; a bézier profile editor is parked ("coming soon"). The strip is stored in angle by height, so drawings survive a shape change.
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

1. Tune `LOOK` against the photos; consider look-dev controls in the panel if tuning in code gets slow.
2. Higher bake resolution for close-ups (rows are about 8 px per mm now).
3. Product sizes and glazes (pink, denim) from the client prototype: each glaze is a `glaze` colour plus `glazeOpacity`.
