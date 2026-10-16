import test from "node:test";
import assert from "node:assert/strict";
import { toHsv, fromHsv, parseColor } from "../src/lib/color.js";
test("HSV preserves RGB across hue sectors and grayscale", () => {
  for (const hex of ["#ff0000","#00ff00","#0000ff","#006a78","#ffffff","#000000","#808080","#1e78c8"]) {
    const {h,s,v}=toHsv(hex);
    assert.equal(fromHsv(h,s,v),hex);
  }
  assert.equal(toHsv("#000000",210).h,210);
});
test("editable color formats preserve alpha and reject invalid channels", () => {
  const previous={hex:"#006a78",alpha:0};
  assert.deepEqual(parseColor("HSL","hsl(120, 100%, 50%)",previous),{hex:"#00ff00",alpha:0});
  assert.deepEqual(parseColor("RGBA","rgba(30, 120, 200, 0.5)",previous),{hex:"#1e78c8",alpha:0.5});
  assert.equal(parseColor("RGBA","rgba(300, 0, 0, 1)",previous),null);
  assert.equal(parseColor("HSL","hsl(0, 101%, 50%)",previous),null);
  assert.equal(parseColor("HEX","#ffffff",previous).alpha,0);
});
