import test from "node:test";
import assert from "node:assert/strict";
import { Vector2 } from "three";
import { FLOOR_MM, PROFILE_MM, WALL_MM, createCupGeometry, cupSection, resample } from "../src/scene/cup.js";

test("resampling spaces points evenly along the polyline and keeps its ends", () => {
  const { points, length } = resample([new Vector2(0, 0), new Vector2(3, 0), new Vector2(3, 4)], 0.5);
  assert.equal(length, 7);
  assert.equal(points.length, 15);
  assert.deepEqual(points[0].toArray(), [0, 0]);
  assert.deepEqual(points.at(-1).toArray(), [3, 4]);
  for (let i = 1; i < points.length; i++) assert.ok(Math.abs(points[i].distanceTo(points[i - 1]) - 0.5) < 1e-9);
});

test("section closes on the axis under the base and at the inner floor", () => {
  const section = cupSection();
  assert.deepEqual(section[0].toArray(), [0, 0]);
  assert.deepEqual(section.at(-1).toArray(), [0, FLOOR_MM]);
  const top = Math.max(...section.map((p) => p.y));
  assert.ok(Math.abs(top - (PROFILE_MM.at(-1)[1] + WALL_MM / 2)) < 1e-9);
  assert.ok(section.every((p) => p.x >= 0));
});

test("cup geometry is in metres with uv.y along the section", () => {
  const { geometry, sectionLengthMm } = createCupGeometry();
  geometry.computeBoundingBox();
  const { max } = geometry.boundingBox;
  assert.ok(max.y > 0.09 && max.y < 0.095);
  assert.ok(sectionLengthMm > 200 && sectionLengthMm < 300);
  const uv = geometry.getAttribute("uv");
  assert.equal(uv.getY(0), 0);
  assert.equal(uv.getY(uv.count - 1), 1);
});

test("cup geometry has finite tangents and returns its section in millimetres", () => {
  const { geometry, sectionMm } = createCupGeometry();
  const tangent = geometry.getAttribute("tangent");
  assert.ok(tangent && tangent.array.every(Number.isFinite));
  assert.ok(Math.max(...sectionMm.map((p) => p.y)) > 90);
});
