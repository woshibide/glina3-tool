// Cup body as one lathe surface: base underside, outer wall, rounded rim, inner wall, inner floor.
// Units are metres. Dimensions are read off the reference photos in ref/cups_photos.
import { LatheGeometry, SplineCurve, Vector2 } from "three";

// Outer wall silhouette as (radius, height) in millimetres, bottom to top.
// Foot band, small lip, lower bulge, waist, flared rim.
export const PROFILE_MM = [
  [35.5, 0],
  [36.0, 3],
  [36.0, 8],
  [37.5, 9.5],
  [39.0, 22],
  [34.5, 45],
  [35.5, 70],
  [37.5, 90],
];
export const WALL_MM = 3.5;
export const FLOOR_MM = 5;

// Profile sample spacing; v texture coordinates follow arc length at this resolution.
const SPACING_MM = 0.5;
const SEGMENTS = 256;

// Resample a polyline at an even arc-length spacing so lathe rows are evenly spaced.
export function resample(points, spacing) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths.at(-1);
  const count = Math.max(2, Math.round(total / spacing) + 1);
  const out = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1)) * total;
    while (segment < points.length - 1 && lengths[segment] < at) segment++;
    const span = lengths[segment] - lengths[segment - 1] || 1;
    out.push(points[segment - 1].clone().lerp(points[segment], (at - lengths[segment - 1]) / span));
  }
  return { points: out, length: total };
}

// Closed cross-section from the axis under the base, round the wall, back to the axis at the inner floor.
export function cupSection({ profile = PROFILE_MM, wall = WALL_MM, floor = FLOOR_MM } = {}) {
  const outer = new SplineCurve(profile.map(([r, y]) => new Vector2(r, y))).getSpacedPoints(400);
  const height = outer.at(-1).y;
  const rimCenter = new Vector2(outer.at(-1).x - wall / 2, height);
  const rim = [];
  for (let i = 1; i < 16; i++) {
    const a = (i / 16) * Math.PI;
    rim.push(new Vector2(rimCenter.x + Math.cos(a) * (wall / 2), height + Math.sin(a) * (wall / 2)));
  }
  const inner = outer
    .filter((p) => p.y >= floor)
    .reverse()
    .map((p) => new Vector2(p.x - wall, p.y));
  return [
    new Vector2(0, 0),
    ...outer,
    ...rim,
    ...inner,
    new Vector2(inner.at(-1).x, floor),
    new Vector2(0, floor),
  ];
}

// Lathe geometry in metres. uv.x runs around the cup, uv.y along the section's arc length.
// Also returns the resampled section in millimetres and its length, which the surface bake follows.
// Tangents let normal maps keep their physical scale on every part of the section.
export function createCupGeometry(options) {
  const { points, length } = resample(cupSection(options), SPACING_MM);
  const geometry = new LatheGeometry(points.map((p) => p.clone().multiplyScalar(0.001)), SEGMENTS);
  geometry.computeTangents();
  return { geometry, sectionMm: points, sectionLengthMm: length };
}
