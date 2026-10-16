// Procedural surface of a glazed, clay-printed cup, baked into texture data in the lathe's uv space.
// Pure and deterministic: the same section and look always give the same pixels, in the browser or in Node.
//
// Model, in this order:
// 1. Clay height: printed layers at fixed heights (the printer's Z), with each layer boundary wandering
//    around the cup as a closed random walk that partly follows the layer below. Flat faces (underside,
//    inner floor) show the printed spiral instead.
// 2. Glaze thickness: pools in layer grooves and concave corners, thins on ridges and convex edges,
//    varies with simplex noise and downward runs, is thicker inside, and is absent on the underside.
// 3. Colour: the clay seen through a translucent glaze layer. With thickness the colour moves from the
//    clay towards the glaze's own deep colour, so thin glaze on ridges shows the clay and pooled glaze
//    in grooves turns deep and saturated.
// 4. Glaze surface height = clay height + glaze thickness, so pooled glaze softens the grooves.
//
// Rows follow the section's arc length (v), columns go around the cup (u), matching LatheGeometry.
import { Color } from "three";
import { createNoise3D } from "simplex-noise";

export const LOOK = {
  seed: 7,
  // Printed layers.
  layerMm: 1.1,
  layerReliefMm: 0.32,
  wobbleMm: 0.12, // spread of a layer line's wander, up and down
  wobbleSteps: 120, // random-walk steps per turn; fewer steps give longer waves
  wobbleCarry: 0.8, // share of the wander each layer inherits from the one below
  beadVariation: 0.3, // spread of how much each bead stands out
  // Printed spiral on flat faces.
  spiralPitchMm: 3.3,
  spiralReliefMm: 0.12,
  // Glaze thickness, in units where 1 is the nominal coat on the outer wall.
  glazeOuter: 1.0,
  glazeInner: 2.6,
  glazeFloorPool: 1.6, // extra on upward-facing inner faces
  innerShadow: 0.55, // ambient light lost at the bottom of the inside, which sees little of the room
  glazeGroove: 2.4, // pooling in a groove relative to a ridge
  glazeRidge: 0.5, // what stays on a ridge top
  glazeCornerPool: 9, // extra per unit of concave curvature (1/mm)
  glazeEdgeThin: 6, // loss per unit of convex curvature (1/mm)
  glazeNoise: 0.35,
  glazeRuns: 0.12,
  glazeFootMm: 7, // the coat thins towards the foot over this height
  glazeLineMm: 0.6, // the outer wall is wiped clean below this height
  glazeSurfaceMm: 0.11, // surface rise per unit of thickness
  // Colours (sRGB): bare clay, and glaze so thick the clay no longer shows through.
  clay: "#f0d8bd",
  glaze: "#c63c1c",
  glazeOpacity: 1.8, // how fast the glaze hides the clay per unit of thickness
  // Roughness of bare clay and of a full glaze coat.
  clayRoughness: 0.85,
  glazeRoughness: 0.3,
  grainMm: 0.012,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

// Random walk around one turn that ends where it starts (a Brownian bridge), scaled to unit spread.
export function closedWalk(random, steps) {
  const walk = new Float64Array(steps);
  let x = 0;
  for (let i = 0; i < steps; i++) walk[i] = x += gaussian(random);
  let mean = 0;
  for (let i = 0; i < steps; i++) mean += walk[i] -= (x * (i + 1)) / steps;
  mean /= steps;
  let variance = 0;
  for (let i = 0; i < steps; i++) variance += (walk[i] -= mean) ** 2;
  const scale = 1 / Math.sqrt(variance / steps || 1);
  for (let i = 0; i < steps; i++) walk[i] *= scale;
  return walk;
}

// Per-layer walks sampled at every column. Layer i's walk is carry * walk(i - 1) plus fresh wander;
// layer 0 rests flat on the print bed.
export function layerWalks(random, layers, columns, { steps, carry }) {
  const out = new Float32Array(layers * columns);
  let previous = new Float64Array(steps);
  const fresh = Math.sqrt(1 - carry * carry);
  for (let i = 1; i < layers; i++) {
    const step = closedWalk(random, steps);
    for (let k = 0; k < steps; k++) step[k] = carry * previous[k] + fresh * step[k];
    for (let c = 0; c < columns; c++) {
      const at = ((c + 0.5) / columns) * steps;
      const k = Math.floor(at);
      const f = at - k;
      out[i * columns + c] = step[k % steps] * (1 - f) + step[(k + 1) % steps] * f;
    }
    previous = step;
  }
  return out;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Rounded bead cross-section: 1 on top, 0 in the groove between beads.
const bead = (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) ** 0.6;
// Where glaze collects across one bead: 1 in the groove, 0 on the crest; wider than the groove itself.
const pool = (t) => 0.5 + 0.5 * Math.cos(2 * Math.PI * t);

// Section rows: position, outward normal, signed curvature (positive convex), and which face it is on.
export function sectionRows(points, length, rows) {
  const n = points.length;
  const tangent = (k) => {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(n - 1, k + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };
  // Curvature per point, then smoothed over about 3 mm so glaze pools in a band, not a line.
  const spacing = length / (n - 1);
  const raw = new Float64Array(n);
  for (let k = 1; k < n - 1; k++) {
    const [ax, ay] = tangent(k - 1);
    const [bx, by] = tangent(k + 1);
    raw[k] = (ax * by - ay * bx) / (2 * spacing);
  }
  const radius = Math.max(1, Math.round(1.5 / spacing));
  const curvature = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    let weight = 0;
    for (let j = -radius * 2; j <= radius * 2; j++) {
      const w = Math.exp(-0.5 * (j / radius) ** 2);
      sum += raw[Math.min(n - 1, Math.max(0, k + j))] * w;
      weight += w;
    }
    curvature[k] = sum / weight;
  }
  let apex = 0;
  for (let k = 1; k < n; k++) if (points[k].y > points[apex].y) apex = k;

  const out = [];
  for (let j = 0; j < rows; j++) {
    const at = ((j + 0.5) / rows) * (n - 1);
    const k = Math.min(n - 2, Math.floor(at));
    const f = at - k;
    const r = points[k].x * (1 - f) + points[k + 1].x * f;
    const y = points[k].y * (1 - f) + points[k + 1].y * f;
    const [tx, ty] = tangent(f < 0.5 ? k : k + 1);
    const inner = k >= apex;
    const nr = ty;
    const ny = -tx;
    const face = ny < -0.7 && !inner ? "underside" : ny > 0.7 && inner ? "floor" : "wall";
    out.push({ r, y, nr, ny, inner, face, curvature: curvature[k] * (1 - f) + curvature[k + 1] * f });
  }
  return out;
}

const toLinear = (hex) => new Color(hex);

// Bake albedo (sRGB), normal (tangent space: +x around the cup, +y along the section), and ORM
// (occlusion, roughness, metalness) as RGBA8 data of columns x rows, plus the float height field.
export function bakeSurface({ points, length, columns = 2048, rows = 2048, look = LOOK }) {
  const random = mulberry32(look.seed);
  const noise = createNoise3D(random);
  const rowsInfo = sectionRows(points, length, rows);
  const topY = Math.max(...points.map((p) => p.y));
  const layers = Math.ceil(topY / look.layerMm) + 2;
  const wander = layerWalks(random, layers, columns, { steps: look.wobbleSteps, carry: look.wobbleCarry });
  const prominence = layerWalks(random, layers, columns, { steps: look.wobbleSteps, carry: 0.5 });
  // Keep boundaries in order: a line never wanders past half the gap to its neighbours.
  const wobble = Math.min(look.wobbleMm, look.layerMm * 0.15);

  const clay = toLinear(look.clay);
  const glaze = toLinear(look.glaze);

  const size = columns * rows;
  const height = new Float32Array(size);
  const albedo = new Uint8Array(size * 4);
  const orm = new Uint8Array(size * 4);
  const cos = new Float64Array(columns);
  const sin = new Float64Array(columns);
  for (let c = 0; c < columns; c++) {
    const theta = ((c + 0.5) / columns) * Math.PI * 2;
    cos[c] = Math.cos(theta);
    sin[c] = Math.sin(theta);
  }

  for (let j = 0; j < rows; j++) {
    const { r, y, ny, inner, face, curvature } = rowsInfo[j];
    let side = inner ? look.glazeInner + look.glazeFloorPool * Math.max(0, ny) : look.glazeOuter;
    side += look.glazeCornerPool * Math.max(0, -curvature);
    side *= Math.max(0.5, 1 - look.glazeEdgeThin * Math.max(0, curvature));
    if (!inner) side *= 0.7 + 0.3 * smoothstep(0, look.glazeFootMm, y);
    const layerAt = Math.floor(y / look.layerMm);

    for (let c = 0; c < columns; c++) {
      const i = j * columns + c;
      const x = r * sin[c];
      const z = r * cos[c];

      let relief;
      let groove;
      if (face === "wall") {
        // Find the layer between the two wandering boundaries that contain this height.
        const boundary = (l) => (l <= 0 ? l * look.layerMm : l * look.layerMm + wobble * wander[Math.min(layers - 1, l) * columns + c]);
        let l = Math.max(0, layerAt);
        if (y < boundary(l)) l--;
        else if (y >= boundary(l + 1)) l++;
        const low = boundary(l);
        const t = (y - low) / (boundary(l + 1) - low);
        const p = 1 + look.beadVariation * prominence[Math.min(layers - 1, Math.max(0, l)) * columns + c];
        const b = bead(t);
        relief = look.layerReliefMm * Math.max(0.3, p) * b;
        groove = pool(t);
      } else {
        const theta = ((c + 0.5) / columns) * Math.PI * 2;
        const f = (((r / look.spiralPitchMm - theta / (Math.PI * 2)) % 1) + 1) % 1;
        const b = smoothstep(0, 0.12, Math.min(f, 1 - f));
        // The floor's spiral is mostly drowned in pooled glaze; the bare underside keeps it crisp.
        relief = look.spiralReliefMm * b * (face === "floor" ? 0.35 : 1);
        groove = 1 - b;
      }

      const grain = 0.6 * noise(x * 2.5, y * 2.5, z * 2.5) + 0.4 * noise(x * 5 + 17, y * 5, z * 5);
      let thickness = 0;
      if (face !== "underside") {
        const blotch = 0.6 * noise(x / 18, y / 18, z / 18) + 0.4 * noise(x / 6 + 31, y / 6, z / 6);
        const runs = noise(x / 2.5, y / 30, z / 2.5);
        const pooled = look.glazeRidge + (look.glazeGroove - look.glazeRidge) * groove;
        thickness = side * pooled * (1 + look.glazeNoise * blotch) * (1 + look.glazeRuns * runs);
        if (!inner) thickness *= smoothstep(look.glazeLineMm - 0.3, look.glazeLineMm + 0.3, y + 0.3 * runs);
        thickness = Math.max(0, thickness);
      }

      const cover = smoothstep(0.05, 0.9, thickness);
      height[i] = relief + look.grainMm * grain * (1 - cover) + look.glazeSurfaceMm * thickness;

      const shade = 1 - (0.03 + 0.1 * (1 - cover)) * grain - 0.15 * groove * (1 - cover);
      const through = Math.exp(-look.glazeOpacity * thickness);
      albedo[i * 4] = toSrgb8((glaze.r + (clay.r - glaze.r) * through) * shade);
      albedo[i * 4 + 1] = toSrgb8((glaze.g + (clay.g - glaze.g) * through) * shade);
      albedo[i * 4 + 2] = toSrgb8((glaze.b + (clay.b - glaze.b) * through) * shade);
      albedo[i * 4 + 3] = 255;

      let occlusion = 1 - 0.3 * groove * (1 - 0.7 * cover);
      if (inner) occlusion *= 1 - look.innerShadow * smoothstep(0, topY * 0.8, topY - y);
      const roughness = look.clayRoughness + (look.glazeRoughness - look.clayRoughness) * cover + 0.04 * grain;
      orm[i * 4] = Math.round(occlusion * 255);
      orm[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, roughness)) * 255);
      orm[i * 4 + 2] = 0;
      orm[i * 4 + 3] = 255;
    }
  }

  // height: glazed surface height in millimetres, kept for map export and future displacement.
  return { columns, rows, albedo, orm, height, normal: normalFromHeight(height, rowsInfo, columns, rows, length) };
}

function toSrgb8(linear) {
  const v = Math.min(1, Math.max(0, linear));
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
}

// Central differences with each texel's physical size: columns wrap around the cup, rows clamp.
export function normalFromHeight(height, rowsInfo, columns, rows, length) {
  const out = new Uint8Array(columns * rows * 4);
  const dy = length / rows;
  for (let j = 0; j < rows; j++) {
    const dx = Math.max(0.05, (2 * Math.PI * rowsInfo[j].r) / columns);
    const up = Math.min(rows - 1, j + 1) * columns;
    const down = Math.max(0, j - 1) * columns;
    const spanY = (Math.min(rows - 1, j + 1) - Math.max(0, j - 1)) * dy;
    for (let c = 0; c < columns; c++) {
      const i = j * columns + c;
      const gx = (height[j * columns + ((c + 1) % columns)] - height[j * columns + ((c - 1 + columns) % columns)]) / (2 * dx);
      const gy = (height[up + c] - height[down + c]) / spanY;
      const inv = 1 / Math.hypot(gx, gy, 1);
      out[i * 4] = Math.round((-gx * inv * 0.5 + 0.5) * 255);
      out[i * 4 + 1] = Math.round((-gy * inv * 0.5 + 0.5) * 255);
      out[i * 4 + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}
