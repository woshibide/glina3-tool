import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLimit,
  validLimits,
  effectiveLimits,
  displayLimits,
  moveInterval,
  clampToLimits,
} from "../src/lib/numeric-limits.js";

test("zero remains a bound; only the -0 sentinel clears a bound and survives JSON", () => {
  const limits = { min: -10, max: 100 };
  assert.deepEqual(parseLimit("0", "min", limits).value, { min: 0, max: 100 });
  const cleared = parseLimit("−0", "min", limits).value;
  assert.deepEqual(JSON.parse(JSON.stringify(cleared)), {
    min: null,
    max: 100,
  });
  assert.equal(effectiveLimits(cleared).min, Number.MIN_SAFE_INTEGER);
  assert.equal(effectiveLimits(cleared, 0).min, 0);
});

test("limits reject invalid drafts, crossing, unsafe numbers, and domain violations", () => {
  for (const text of ["", "-", "Infinity", "NaN", "1e100", "4px"])
    assert.ok(parseLimit(text, "min", { min: 0, max: 100 }).error, text);
  assert.ok(parseLimit("101", "min", { min: 0, max: 100 }).error);
  assert.ok(
    parseLimit("1.5", "min", { min: 0, max: 100 }, { integer: true }).error,
  );
  assert.ok(
    parseLimit("-1", "min", { min: 0, max: 100 }, { hardMin: 0 }).error,
  );
  assert.ok(
    parseLimit("101", "max", { min: 0, max: 100 }, { hardMax: 100 }).error,
  );
  assert.equal(parseLimit("0.25", "min", { min: 0, max: 100 }).value.min, 0.25);
  assert.ok(validLimits({ min: 2, max: 2 }));
  assert.equal(validLimits({ min: 0.5, max: 10 }, { integer: true }), false);
});

test("interval moves preserve width and enforce editable limits without crossing", () => {
  const bounds = { min: -200, max: 400 };
  const interval = { min: -50, max: 150 };
  assert.deepEqual(moveInterval(interval, "band", 1000, bounds), {
    min: 200,
    max: 400,
  });
  assert.deepEqual(moveInterval(interval, "band", -1000, bounds), {
    min: -200,
    max: 0,
  });
  assert.deepEqual(moveInterval(interval, "min", 1000, bounds), {
    min: 150,
    max: 150,
  });
  assert.deepEqual(moveInterval(interval, "max", -1000, bounds), {
    min: -50,
    max: -50,
  });
  const unbounded = effectiveLimits({ min: null, max: null });
  assert.deepEqual(moveInterval(interval, "band", -500, unbounded), {
    min: -550,
    max: -350,
  });
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(interval).map(([k, v]) => [
        k,
        clampToLimits(v, { min: 500, max: 1000 }),
      ]),
    ),
    { min: 500, max: 500 },
  );
});

test("unbounded and coincident tracks have a finite nonzero display span", () => {
  for (const [limits, values] of [
    [{ min: null, max: null }, [-500, 400]],
    [{ min: 500, max: null }, [500, 600]],
    [{ min: null, max: -100 }, [-300, -100]],
    [{ min: 20, max: 20 }, [20, 20]],
  ]) {
    const scale = displayLimits(limits, values);
    assert.ok(Number.isFinite(scale.min) && Number.isFinite(scale.max));
    assert.ok(scale.max > scale.min);
    assert.ok(
      values.every((value) => value >= scale.min && value <= scale.max),
    );
  }
});
