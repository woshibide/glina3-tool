import test from "node:test";
import assert from "node:assert/strict";
import { createCupGeometry } from "../src/scene/cup.js";
import { LOOK, bakeSurface, sectionRows } from "../src/scene/surface.js";
import {
  NIB_PRESETS, UNITS, createStripSpec, layerRelief, rasterizeDesign, validDesign, validNib,
} from "../src/design/strip.js";
import { decodeDesign, encodeDesign, packDesign, unpackDesign } from "../src/design/codec.js";

const { sectionMm, sectionLengthMm } = createCupGeometry();
const spec = createStripSpec(sectionMm);
const nib = (shape, size, angle = 0) => ({ shape, size, angle });
// A horizontal line across the middle of the band, a quarter turn long.
const line = (n, from = 0.25, to = 0.5, erase = false) => ({
  erase,
  nib: n,
  points: [Math.round(from * UNITS), UNITS / 2, Math.round(to * UNITS), UNITS / 2],
});
const inked = (mask) => mask.reduce((sum, v) => sum + (v ? 1 : 0), 0);

test("strip spec fits the outer wall with near-square pixels", () => {
  assert.equal(spec.columns, 1024);
  assert.ok(spec.circumferenceMm > 210 && spec.circumferenceMm < 250, `${spec.circumferenceMm}`);
  const pixelX = spec.circumferenceMm / spec.columns;
  const pixelY = spec.heightMm / spec.rows;
  assert.ok(Math.abs(pixelX / pixelY - 1) < 0.01);
});

test("a stroke covers its swept nib area and the eraser removes it", () => {
  const stroke = line(nib("round", 4));
  const mask = rasterizeDesign({ strokes: [stroke] }, spec);
  const lengthMm = 0.25 * spec.circumferenceMm;
  const expected = (lengthMm * 4 + Math.PI * 4) / ((spec.circumferenceMm / spec.columns) * (spec.heightMm / spec.rows));
  assert.ok(Math.abs(inked(mask) / expected - 1) < 0.06, `${inked(mask)} vs ${expected}`);
  assert.ok(mask.every((v) => v === 0 || v === 255), "mask is binary");
  const erased = rasterizeDesign({ strokes: [stroke, line(nib("square", 20), 0.2, 0.55, true)] }, spec);
  assert.equal(inked(erased), 0);
});

test("strokes wrap across the seam of the cup", () => {
  const mask = rasterizeDesign({ strokes: [line(nib("round", 6), 0.95, 1.05)] }, spec);
  const row = Math.floor(spec.rows / 2) * spec.columns;
  assert.equal(mask[row], 255);
  assert.equal(mask[row + spec.columns - 1], 255);
  assert.equal(mask[row + Math.floor(spec.columns / 2)], 0);
});

test("a flat nib is thin across its angle", () => {
  const dab = (angle) => rasterizeDesign({ strokes: [{ erase: false, nib: nib("flat", 16, angle), points: [UNITS / 2, UNITS / 2] }] }, spec);
  const horizontal = dab(0);
  const rows = new Set();
  const columns = new Set();
  horizontal.forEach((v, i) => v && (rows.add(Math.floor(i / spec.columns)), columns.add(i % spec.columns)));
  assert.ok(columns.size > 3 * rows.size, `${columns.size} x ${rows.size}`);
  assert.ok(Math.abs(inked(dab(90)) / inked(horizontal) - 1) < 0.1);
});

test("layer relief samples each printed layer and stays zero outside the band", () => {
  const mask = rasterizeDesign({ strokes: [line(nib("square", 20), 0, 1)] }, spec);
  const relief = layerRelief(mask, spec, { layerMm: LOOK.layerMm, topMm: 92 });
  const layerAt = (y) => Math.floor(y / LOOK.layerMm);
  const middle = (spec.bottomMm + spec.topMm) / 2;
  assert.equal(relief.data[layerAt(middle) * relief.columns + 100], 255);
  assert.equal(relief.data[layerAt(5) * relief.columns + 100], 0);
  assert.equal(relief.data[layerAt(91) * relief.columns + 100], 0);
});

test("glaze pools at the foot of raised relief and thins on its edge", () => {
  const strokes = [line(nib("square", 12), 0.3, 0.7)];
  const mask = rasterizeDesign({ strokes }, spec);
  const relief = layerRelief(mask, spec, { layerMm: LOOK.layerMm, topMm: 92 });
  const small = { points: sectionMm, length: sectionLengthMm, columns: 512, rows: 1024 };
  const plain = bakeSurface(small);
  const drawn = bakeSurface({ ...small, relief });
  const rows = sectionRows(sectionMm, sectionLengthMm, small.rows);
  // Outer wall row at the shape's middle height, columns before, at, and inside its left edge.
  const middle = (spec.bottomMm + spec.topMm) / 2;
  const j = rows.findIndex((r) => r.face === "wall" && !r.inner && r.y >= middle);
  const red = (bake, c) => {
    const i = (j * small.columns + c) * 4;
    return bake.albedo[i] - (bake.albedo[i + 1] + bake.albedo[i + 2]) / 2;
  };
  // The shape's left edge: the stroke starts at 0.3 of a turn, minus half the 12 mm nib.
  const edge = Math.round((0.3 - 6 / spec.circumferenceMm) * small.columns);
  assert.equal(red(plain, 50), red(drawn, 50), "far from the shape nothing changes");
  const foot = Math.max(...[-4, -3, -2, -1].map((d) => red(drawn, edge + d) - red(plain, edge + d)));
  const top = Math.min(...[0, 1, 2, 3].map((d) => red(drawn, edge + d) - red(plain, edge + d)));
  assert.ok(foot > 0, `foot ${foot}`);
  assert.ok(top < 0, `edge ${top}`);
});

test("design round-trips through bytes and the share link", async () => {
  const design = {
    strokes: [
      ...NIB_PRESETS.map(({ nib: n }, i) => line(n, 0.1 * i, 0.1 * i + 0.07)),
      { erase: true, nib: nib("round", 9), points: [-30, 0, 4200, 4096, 4100, 10] },
    ],
  };
  assert.ok(validDesign(design));
  assert.deepEqual(unpackDesign(packDesign(design)), design);
  const text = await encodeDesign(design);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeDesign(text), design);
  await assert.rejects(decodeDesign("not*valid"), /invalid characters/);
  await assert.rejects(decodeDesign(text.slice(0, -4)), /damaged|cut short|trailing/);
});

test("validators reject out-of-range nibs and points", () => {
  assert.ok(validNib(nib("round", 2)));
  assert.ok(!validNib(nib("round", 1)));
  assert.ok(!validNib(nib("round", 21)));
  assert.ok(!validNib(nib("star", 5)));
  assert.ok(!validDesign({ strokes: [{ erase: false, nib: nib("round", 4), points: [0, UNITS + 1] }] }));
});
