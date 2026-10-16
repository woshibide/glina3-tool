import test from "node:test";
import assert from "node:assert/strict";
import { createCupGeometry } from "../src/scene/cup.js";
import { LOOK, bakeSurface, closedWalk, layerWalks, mulberry32, sectionRows } from "../src/scene/surface.js";

const { sectionMm, sectionLengthMm } = createCupGeometry();
const small = { points: sectionMm, length: sectionLengthMm, columns: 64, rows: 512 };

test("closed walk ends where it starts and has unit spread", () => {
  const walk = closedWalk(mulberry32(1), 200);
  const mean = walk.reduce((a, b) => a + b, 0) / walk.length;
  const spread = Math.sqrt(walk.reduce((a, b) => a + (b - mean) ** 2, 0) / walk.length);
  assert.ok(Math.abs(mean) < 1e-9);
  assert.ok(Math.abs(spread - 1) < 1e-9);
  // The last step back to the start is no bigger than a typical step.
  const steps = walk.slice(1).map((v, i) => Math.abs(v - walk[i]));
  assert.ok(Math.abs(walk.at(-1) - walk[0]) < 4 * Math.max(...steps));
});

test("layer 0 rests flat on the bed and later layers wander", () => {
  const walks = layerWalks(mulberry32(2), 5, 32, { steps: 40, carry: 0.8 });
  assert.ok(walks.slice(0, 32).every((v) => v === 0));
  assert.ok(walks.slice(32 * 4).some((v) => v !== 0));
});

test("section rows label the underside, the inner floor, and the walls", () => {
  const rows = sectionRows(sectionMm, sectionLengthMm, 512);
  assert.equal(rows[0].face, "underside");
  assert.equal(rows.at(-1).face, "floor");
  assert.ok(rows.some((r) => r.face === "wall" && !r.inner));
  assert.ok(rows.some((r) => r.face === "wall" && r.inner));
});

test("bake is deterministic for a seed and changes with it", () => {
  const a = bakeSurface(small);
  const b = bakeSurface(small);
  const c = bakeSurface({ ...small, look: { ...LOOK, seed: LOOK.seed + 1 } });
  assert.deepEqual(a.albedo, b.albedo);
  assert.deepEqual(a.normal, b.normal);
  assert.notDeepEqual(a.albedo, c.albedo);
});

test("underside is bare clay and the glazed wall is redder in grooves than on ridges", () => {
  const { albedo, orm, columns } = bakeSurface(small);
  const rows = sectionRows(sectionMm, sectionLengthMm, small.rows);
  const pixel = (j, c = 0) => [...albedo.slice((j * columns + c) * 4, (j * columns + c) * 4 + 3)];
  const redness = ([r, g, b]) => r - (g + b) / 2;

  const underside = rows.findIndex((r) => r.face === "underside" && r.r > 10);
  assert.ok(redness(pixel(underside)) < 40, `underside ${pixel(underside)}`);
  assert.ok(orm[(underside * columns) * 4 + 1] > 200, "bare clay is rough");

  const wall = rows.map((r, j) => ({ ...r, j })).filter((r) => r.face === "wall" && !r.inner && r.y > 30 && r.y < 60);
  const values = wall.map((r) => redness(pixel(r.j)));
  assert.ok(Math.max(...values) - Math.min(...values) > 40, "grooves and ridges differ");
});
