import test from "node:test";
import assert from "node:assert/strict";
import { bakeSize, tiltFrom } from "../src/background.js";

test("bake size follows the screen and stays in texture limits", () => {
  assert.deepEqual(bakeSize(400), { columns: 1024, rows: 1024 });
  const laptop = bakeSize(1800);
  assert.ok(laptop.columns >= 2304 && laptop.rows >= 2304, JSON.stringify(laptop));
  assert.equal(laptop.columns % 256, 0);
  assert.deepEqual(bakeSize(10000), { columns: 4096, rows: 4096 });
  assert.deepEqual(bakeSize(10000, 2048), { columns: 2048, rows: 2048 });
});

test("tilt maps an upright phone to -1..1 and ignores sideways screens", () => {
  assert.deepEqual(tiltFrom({ beta: 45, gamma: 0 }), { x: 0, y: 0 });
  assert.deepEqual(tiltFrom({ beta: 90, gamma: -60 }), { x: -1, y: 1 });
  assert.equal(tiltFrom({ beta: 45, gamma: 0 }, 90), null);
  assert.equal(tiltFrom({ beta: null, gamma: null }), null);
});
