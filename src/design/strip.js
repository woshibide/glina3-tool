// The drawing strip: the outer wall unrolled into angle (x, one turn) by height (y, the drawable band).
// This is also how a clay printer makes relief: every layer pushes the wall out by angle, so a drawing
// stored here survives a different cup shape (a taller cup gets more layers, a wider one stretches).
//
// Pure and deterministic: strokes rasterize to the same binary mask in the browser and in Node.
// The mask is the production image: black (255) where the wall is raised, white (0) elsewhere.

// Stroke point units: x in 1/UNITS of a turn (unwrapped, may leave 0..UNITS while crossing the seam),
// y in 1/UNITS of the band height from its bottom.
export const UNITS = 4096;
export const MASK_COLUMNS = 1024;

// Drawable band on the outer wall, above the foot band and below the rounded rim (millimetres).
export const BAND_MM = { bottom: 10, top: 88 };

export const NIB_SHAPES = ["round", "square", "flat"];
export const NIB_SIZE_MM = { min: 2, max: 20 };
// A flat nib is a quarter as thick as it is wide, but never thinner than the smallest printable line.
const FLAT_RATIO = 0.25;

export const NIB_PRESETS = [
  { id: "fine", label: "Fine", nib: { shape: "round", size: 2, angle: 0 } },
  { id: "marker", label: "Marker", nib: { shape: "round", size: 5, angle: 0 } },
  { id: "chisel", label: "Chisel", nib: { shape: "flat", size: 8, angle: 45 } },
  { id: "block", label: "Block", nib: { shape: "square", size: 12, angle: 0 } },
];

const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export const validNib = (n) =>
  n !== null && typeof n === "object" && NIB_SHAPES.includes(n.shape) &&
  integer(n.size, NIB_SIZE_MM.min, NIB_SIZE_MM.max) && integer(n.angle, 0, 179);
export const validStroke = (s) =>
  s !== null && typeof s === "object" && typeof s.erase === "boolean" && validNib(s.nib) &&
  Array.isArray(s.points) && s.points.length >= 2 && s.points.length % 2 === 0 &&
  s.points.every((v, i) => (i % 2 ? integer(v, 0, UNITS) : integer(v, -UNITS * 64, UNITS * 64)));
export const validDesign = (d) =>
  d !== null && typeof d === "object" && Array.isArray(d.strokes) && d.strokes.every(validStroke);

// Strip size from the cup's resampled section (millimetres): the circumference at the outer wall's mean
// radius across the band, and a mask with near-square pixels.
export function createStripSpec(sectionMm) {
  let apex = 0;
  for (let k = 1; k < sectionMm.length; k++) if (sectionMm[k].y > sectionMm[apex].y) apex = k;
  const radii = sectionMm.slice(0, apex).filter((p) => p.y >= BAND_MM.bottom && p.y <= BAND_MM.top).map((p) => p.x);
  if (!radii.length) throw new Error("Cup section has no outer wall inside the drawable band.");
  const circumferenceMm = 2 * Math.PI * (radii.reduce((a, b) => a + b, 0) / radii.length);
  const heightMm = BAND_MM.top - BAND_MM.bottom;
  const columns = MASK_COLUMNS;
  const rows = Math.round((columns * heightMm) / circumferenceMm);
  return { circumferenceMm, heightMm, bottomMm: BAND_MM.bottom, topMm: BAND_MM.top, columns, rows };
}

// Nib outline in millimetres around its centre, y up, angle in degrees counter-clockwise.
export function nibPolygon({ shape, size, angle }) {
  let points;
  if (shape === "round") {
    points = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return [(Math.cos(a) * size) / 2, (Math.sin(a) * size) / 2];
    });
  } else {
    const w = size / 2;
    const h = shape === "flat" ? Math.max(NIB_SIZE_MM.min, size * FLAT_RATIO) / 2 : w;
    points = [[-w, -h], [w, -h], [w, h], [-w, h]];
  }
  const a = (angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

// Convex hull (monotone chain), counter-clockwise.
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Fill a convex polygon (mask pixels) with value; columns wrap around the cup, rows clip.
function fillConvex(mask, columns, rows, polygon, value) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const [, y] of polygon) {
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const first = Math.max(0, Math.ceil(top - 0.5));
  const last = Math.min(rows - 1, Math.floor(bottom - 0.5));
  for (let row = first; row <= last; row++) {
    const yc = row + 0.5;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i];
      const [x1, y1] = polygon[(i + 1) % polygon.length];
      if ((y0 <= yc && y1 >= yc) || (y1 <= yc && y0 >= yc)) {
        const x = y0 === y1 ? null : x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0);
        for (const v of x === null ? [x0, x1] : [x]) {
          left = Math.min(left, v);
          right = Math.max(right, v);
        }
      }
    }
    const from = Math.ceil(left - 0.5);
    const to = Math.floor(right - 0.5);
    if (to < from) continue;
    const line = row * columns;
    if (to - from + 1 >= columns) {
      mask.fill(value, line, line + columns);
      continue;
    }
    for (let x = from; x <= to; x++) mask[line + (((x % columns) + columns) % columns)] = value;
  }
}

// Stroke point (units) to mask pixel coordinates; y grows downwards from the band top.
const toPixel = (spec, x, y) => [(x / UNITS) * spec.columns, (1 - y / UNITS) * spec.rows];

// Rasterize one segment of a stroke (from point index i - 1 to i), or its first dab when i is 0:
// the nib swept along a straight segment is the convex hull of the nib at both ends.
export function rasterizeSegment(mask, spec, stroke, i) {
  const scaleX = spec.columns / spec.circumferenceMm;
  const scaleY = spec.rows / spec.heightMm;
  const nib = nibPolygon(stroke.nib).map(([x, y]) => [x * scaleX, -y * scaleY]);
  const at = (k) => toPixel(spec, stroke.points[k * 2], stroke.points[k * 2 + 1]);
  const ends = i === 0 ? [at(0)] : [at(i - 1), at(i)];
  const polygon = hull(ends.flatMap(([cx, cy]) => nib.map(([x, y]) => [cx + x, cy + y])));
  fillConvex(mask, spec.columns, spec.rows, polygon, stroke.erase ? 0 : 255);
}

export function rasterizeStroke(mask, spec, stroke) {
  const count = stroke.points.length / 2;
  for (let i = 0; i < count; i++) rasterizeSegment(mask, spec, stroke, i);
}

export function rasterizeDesign(design, spec) {
  const mask = new Uint8Array(spec.columns * spec.rows);
  for (const stroke of design.strokes) rasterizeStroke(mask, spec, stroke);
  return mask;
}

// Per-layer relief for the printer: each layer takes the mask row at its centre height, softened around
// the cup like an extruded path. Returns 0..255 values, columns x layers, layer 0 resting on the bed.
// Shared by the live shader and the bake, so the drawing view and the baked cup agree.
export function layerRelief(mask, spec, { layerMm, topMm, softMm = 0.5 }) {
  const layers = Math.ceil(topMm / layerMm) + 1;
  const { columns, rows } = spec;
  const out = new Uint8Array(columns * layers);
  const radius = Math.max(1, Math.round((softMm * columns) / spec.circumferenceMm));
  const line = new Float32Array(columns);
  const blurred = new Float32Array(columns);
  for (let l = 0; l < layers; l++) {
    const y = (l + 0.5) * layerMm;
    if (y < spec.bottomMm || y > spec.topMm) continue;
    const row = Math.min(rows - 1, Math.floor(((spec.topMm - y) / spec.heightMm) * rows));
    for (let c = 0; c < columns; c++) line[c] = mask[row * columns + c];
    // Two box passes approximate a soft, rounded edge.
    for (let pass = 0; pass < 2; pass++) {
      const source = pass ? blurred.slice() : line;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[(k + columns) % columns];
      for (let c = 0; c < columns; c++) {
        blurred[c] = sum / (2 * radius + 1);
        sum += source[(c + radius + 1) % columns] - source[(c - radius + columns) % columns];
      }
    }
    for (let c = 0; c < columns; c++) out[l * columns + c] = Math.round(blurred[c]);
  }
  return { data: out, columns, layers, layerMm };
}
