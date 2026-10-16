import test from "node:test";
import assert from "node:assert/strict";
import { remapValue } from "../src/lib/values.js";

test("mapping preserves fractional, negative, reversed and coincident ranges and overshoot", () => {
  assert.equal(remapValue(0.5, { min: -10, max: 20.5 }), 5.25);
  assert.equal(remapValue(-0.25, { min: 20, max: 80 }), 5);
  assert.equal(remapValue(1.25, { min: 20, max: 80 }), 95);
  assert.equal(remapValue(0.25, { min: 80, max: 20 }), 65);
  assert.equal(remapValue(1.5, { min: 26, max: 26 }), 26);
});
