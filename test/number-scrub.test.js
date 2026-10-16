import test from "node:test";
import assert from "node:assert/strict";
import { createNumberScrubber } from "../src/lib/number-scrub.js";

function fixture(overrides = {}, normalize = (value) => value) {
  const options = { value: 10, min: -100, max: 100, step: 1, ...overrides };
  const writes = [], ends = [], captures = new Set(), listeners = new Map();
  const attributes = new Map(), rootAttributes = new Map();
  let focused = 0, selected = 0;
  const target = {
    ownerDocument: {
      documentElement: {
        setAttribute: (name, value) => rootAttributes.set(name, value),
        removeAttribute: (name) => rootAttributes.delete(name),
      },
      defaultView: {
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: (name, callback) => {
          if (listeners.get(name) === callback) listeners.delete(name);
        },
      },
    },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
    focus: () => focused++,
    select: () => selected++,
  };
  const scrubber = createNumberScrubber({
    read: () => options,
    write: (value) => {
      writes.push(value);
      options.value = normalize(value);
    },
    onEnd: (dragged) => ends.push(dragged),
  });
  function send(type, overrides = {}) {
    const event = {
      currentTarget: target, pointerId: 1, button: 0, isPrimary: true,
      clientX: 100, clientY: 100, shiftKey: false, altKey: false,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...overrides,
    };
    scrubber.events[type](event);
    return event;
  }
  function assertFinished(dragged) {
    assert.equal(scrubber.dragging, false);
    assert.equal(captures.size, 0);
    assert.equal(listeners.size, 0);
    assert.equal(attributes.size, 0);
    assert.equal(rootAttributes.size, 0);
    assert.deepEqual(ends, [dragged]);
  }
  return {
    options, writes, ends, captures, attributes, rootAttributes, listeners,
    scrubber, send, assertFinished,
    get focused() { return focused; },
    get selected() { return selected; },
  };
}

test("horizontal and vertical number dragging share direction and jitter rules", () => {
  for (const [clientX, clientY, expected, axis] of [
    [108, 99, 12, "x"], [92, 101, 8, "x"],
    [101, 92, 12, "y"], [99, 108, 8, "y"],
  ]) {
    const f = fixture();
    assert.equal(f.send("pointerdown").defaultPrevented, true);
    assert.equal(f.focused, 1);
    assert.ok(f.captures.has(1));
    f.send("pointermove", { clientX: 102, clientY: 99 });
    assert.deepEqual(f.writes, []);
    assert.equal(f.scrubber.dragging, false);
    f.send("pointermove", { clientX, clientY });
    assert.equal(f.options.value, expected);
    assert.equal(f.scrubber.dragging, true);
    assert.equal(f.attributes.get("data-scrubbing"), axis);
    assert.equal(f.rootAttributes.get("data-number-scrubbing"), axis);
    f.send("pointerup");
    f.assertFinished(true);
    assert.equal(f.selected, 0);
  }
});

test("drag direction stays on its initial axis despite later perpendicular movement", () => {
  const f = fixture();
  f.send("pointerdown");
  f.send("pointermove", { clientX: 101, clientY: 96 });
  f.send("pointermove", { clientX: 150, clientY: 92 });
  assert.equal(f.options.value, 12);
  f.send("pointerup");
  f.assertFinished(true);
});

test("a click or sub-threshold movement selects the number for typing without changing it", () => {
  for (const move of [false, true]) {
    const f = fixture();
    f.send("pointerdown");
    if (move) f.send("pointermove", { clientX: 103, clientY: 97 });
    f.send("pointerup");
    assert.equal(f.selected, 1);
    assert.deepEqual(f.writes, []);
    f.assertFinished(false);
  }
});

test("integer fields retain whole values while unrestricted decimals scrub by tenths", () => {
  const integer = fixture();
  integer.send("pointerdown");
  integer.send("pointermove", { clientX: 105 });
  integer.send("pointermove", { clientX: 107 });
  assert.deepEqual(integer.writes, [11]);
  integer.send("pointermove", { clientX: 108 });
  assert.equal(integer.options.value, 12);
  integer.scrubber.dispose();

  const decimal = fixture({ value: 0.25, step: "any" });
  decimal.send("pointerdown");
  for (let i = 1; i <= 10; i++)
    decimal.send("pointermove", { clientX: 100 + i * 4 });
  assert.deepEqual(decimal.writes, [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25]);
  decimal.scrubber.dispose();
});

test("fractional steps preserve precision through zero and scientific notation", () => {
  const f = fixture({ value: -0.0000002, step: 1e-7 });
  f.send("pointerdown");
  for (let i = 1; i <= 4; i++)
    f.send("pointermove", { clientX: 100 + i * 4 });
  assert.deepEqual(f.writes, [-1e-7, 0, 1e-7, 2e-7]);
  assert.equal(Object.is(f.writes[1], -0), false);
  f.scrubber.dispose();
});

test("Shift accelerates dragging and Alt gives finer decimal control without fractional integers", () => {
  const fast = fixture({ value: 1, step: "any" });
  fast.send("pointerdown");
  fast.send("pointermove", { clientX: 104, shiftKey: true });
  assert.equal(fast.options.value, 2);
  fast.scrubber.dispose();

  const fine = fixture({ value: 1, step: "any" });
  fine.send("pointerdown");
  fine.send("pointermove", { clientX: 104, altKey: true });
  assert.equal(fine.options.value, 1.01);
  fine.scrubber.dispose();

  const integer = fixture();
  integer.send("pointerdown");
  integer.send("pointermove", { clientX: 104, altKey: true });
  assert.deepEqual(integer.writes, []);
  integer.send("pointermove", { clientX: 140, altKey: true });
  assert.equal(integer.options.value, 11);
  integer.scrubber.dispose();
});

test("both limits clamp overshoot and respond immediately when the pointer reverses", () => {
  for (const [value, edge, beyond, reverse, expected] of [
    [9, 10, 180, 176, 9], [1, 0, 20, 24, 1],
  ]) {
    const f = fixture({ value, min: 0, max: 10 });
    f.send("pointerdown");
    f.send("pointermove", { clientX: beyond });
    assert.equal(f.options.value, edge);
    f.send("pointermove", { clientX: reverse });
    assert.equal(f.options.value, expected);
    f.scrubber.dispose();
  }
});

test("numeric-string integer steps stay whole during Alt dragging", () => {
  const f = fixture({ step: "1" });
  f.send("pointerdown");
  f.send("pointermove", { clientX: 104, altKey: true });
  assert.deepEqual(f.writes, []);
  f.send("pointermove", { clientX: 140, altKey: true });
  assert.equal(f.options.value, 11);
  assert.ok(f.writes.every(Number.isInteger));
  f.send("pointerup");
  f.assertFinished(true);
});

test("parent constraints rebase the drag so reversing uses the accepted value", () => {
  for (const [beyond, requested, accepted, reverse, expected] of [
    [180, 30, 12, 176, 11], [20, -10, 8, 24, 9],
  ]) {
    const f = fixture({}, (value) => Math.max(8, Math.min(12, value)));
    f.send("pointerdown");
    f.send("pointermove", { clientX: beyond });
    assert.deepEqual(f.writes, [requested]);
    assert.equal(f.options.value, accepted);
    f.send("pointermove", { clientX: reverse });
    assert.equal(f.options.value, expected);
    assert.deepEqual(f.writes, [requested, expected]);
    f.send("pointerup");
    f.assertFinished(true);
  }
});

test("Alt preserves an explicit fractional step instead of emitting native-invalid values", () => {
  const f = fixture({ value: 1, step: 0.1 });
  f.send("pointerdown");
  f.send("pointermove", { clientX: 104, altKey: true });
  assert.deepEqual(f.writes, []);
  f.send("pointermove", { clientX: 140, altKey: true });
  assert.deepEqual(f.writes, [1.1]);
  f.send("pointerup");
  f.assertFinished(true);
});

test("disabled, non-primary, right-click, and unavailable values do not start a gesture", () => {
  for (const [options, event] of [
    [{ disabled: true }, {}], [{ value: null }, {}],
    [{ value: NaN }, {}], [{ value: Infinity }, {}],
    [{}, { isPrimary: false }], [{}, { button: 2 }],
  ]) {
    const f = fixture(options);
    assert.equal(f.send("pointerdown", event).defaultPrevented, false);
    f.send("pointermove", { clientX: 140 });
    f.send("pointerup");
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.ends, []);
    assert.equal(f.focused, 0);
    assert.equal(f.captures.size, 0);
    assert.equal(f.listeners.size, 0);
  }
});

test("other pointers cannot move, finish, or replace a captured gesture", () => {
  const f = fixture();
  f.send("pointerdown");
  f.send("pointerdown", { pointerId: 2 });
  f.send("pointermove", { pointerId: 2, clientX: 140 });
  f.send("pointerup", { pointerId: 2 });
  f.send("pointercancel", { pointerId: 2 });
  assert.deepEqual(f.writes, []);
  assert.ok(f.captures.has(1));
  assert.equal(f.focused, 1);
  f.send("pointermove", { clientX: 104 });
  assert.equal(f.options.value, 11);
  f.send("pointerup");
  f.assertFinished(true);
});

test("pointer cancellation and capture loss clean up once and retain the last live value", () => {
  for (const interruption of ["pointercancel", "lostpointercapture", "blur"]) {
    const f = fixture();
    f.send("pointerdown");
    f.send("pointermove", { clientX: 104 });
    if (interruption === "lostpointercapture") f.captures.delete(1);
    f.send(interruption);
    f.send("pointerup");
    f.send("pointermove", { clientX: 140 });
    assert.equal(f.options.value, 11);
    assert.equal(f.selected, 0);
    f.assertFinished(true);
  }
});

test("Escape, window blur, and disposal end gestures without leaking listeners or capture", () => {
  for (const interruption of ["escape", "window", "dispose"]) {
    const f = fixture();
    f.send("pointerdown");
    f.send("pointermove", { clientX: 104 });
    if (interruption === "escape") {
      assert.equal(f.send("keydown", { key: "ArrowUp" }).defaultPrevented, false);
      assert.equal(f.scrubber.dragging, true);
      assert.equal(f.send("keydown", { key: "Escape" }).defaultPrevented, true);
    } else if (interruption === "window") f.listeners.get("blur")();
    else f.scrubber.dispose();
    f.scrubber.dispose();
    f.send("lostpointercapture");
    f.assertFinished(true);
    assert.equal(f.options.value, 11);
  }
});

test("disabling a field during a drag stops further writes and cleans up", () => {
  const f = fixture();
  f.send("pointerdown");
  f.send("pointermove", { clientX: 104 });
  f.options.disabled = true;
  f.send("pointermove", { clientX: 140 });
  assert.deepEqual(f.writes, [11]);
  f.assertFinished(true);
});
