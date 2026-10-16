import test from "node:test";
import assert from "node:assert/strict";
import { exportFilename, frameSchedule, outputSize, validateExport } from "../src/lib/export.js";

test("output size keeps the aspect on the long edge with even dimensions", () => {
  assert.deepEqual(outputSize({ width: 1920, height: 1080 }, 1920), { width: 1920, height: 1080 });
  assert.deepEqual(outputSize({ width: 1080, height: 1920 }, 1280), { width: 720, height: 1280 });
  assert.deepEqual(outputSize({ width: 1, height: 1 }, 999), { width: 1000, height: 1000 });
  assert.deepEqual(outputSize({ width: 1920, height: 1080 }, 2), { width: 2, height: 2 });
});

test("frame schedule has no duplicate endpoint and clips the last frame", () => {
  const exact = frameSchedule(4, 30);
  assert.equal(exact.length, 120);
  assert.equal(exact.at(-1).time, 119 / 30);
  const fractional = frameSchedule(1, 29.97);
  assert.equal(fractional.length, 30);
  assert.ok(fractional.at(-1).duration < 1 / 29.97);
  const total = fractional.reduce((sum, frame) => sum + frame.duration, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.equal(frameSchedule(0.001, 30).length, 1);
});

test("export settings are validated at the exporter boundary", () => {
  const video = { format: "mp4", width: 1920, height: 1080, fps: 30, duration: 4 };
  assert.doesNotThrow(() => validateExport(video));
  assert.doesNotThrow(() => validateExport({ ...video, format: "png", width: 1919 }));
  assert.throws(() => validateExport({ ...video, format: "gif" }), /Unknown format/);
  assert.throws(() => validateExport({ ...video, width: 1919 }), /even/);
  assert.throws(() => validateExport({ ...video, width: 8192 }), /between 2 and 4096/);
  assert.throws(() => validateExport({ ...video, fps: 0 }), /FPS/);
  assert.throws(() => validateExport({ ...video, duration: 121 }), /Duration/);
  assert.throws(() => validateExport({ ...video, duration: NaN }), /Duration/);
});

test("filenames name the sketch, size, rate, and time", () => {
  const date = new Date(2026, 9, 9, 8, 5, 3);
  assert.equal(
    exportFilename("baza demo", { format: "mp4", width: 1920, height: 1080, fps: 29.97 }, date),
    "baza-demo-1920x1080-29.97fps-20261009-080503.mp4",
  );
  assert.equal(
    exportFilename("hello", { format: "png", width: 2, height: 2, fps: 30 }, date),
    "hello-2x2-20261009-080503.png",
  );
});
