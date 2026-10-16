// Cup material: one MeshPhysicalMaterial fed by baked albedo, normal, and ORM maps (see surface.js),
// extended with two things the drawing needs:
// - Relief: the per-layer drawing (design/strip.js layerRelief) pushes the wall out in the vertex shader,
//   with normals bent to match, so the silhouette and shading follow the drawing live.
// - Toon: a flat, banded look for drawing mode; uToon (0..1) fades between the baked and toon looks.
import {
  ClampToEdgeWrapping, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, LinearSRGBColorSpace,
  MeshPhysicalMaterial, RedFormat, RepeatWrapping, SRGBColorSpace, Vector3,
} from "three";
import { LOOK } from "./surface.js";

// Toon palette in sRGB, used as is (no colour management): glaze, raised clay, recessed glaze inside.
const srgb = (hex) => new Vector3(...[16, 8, 0].map((shift) => ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255));
export const TOON = { glaze: "#cf4a2a", clay: "#f2dcc3", deep: "#9e2c15", light: [0.35, 0.65, 0.7] };

// Bake in a worker: resolves with the maps, reports progress (0..1), and stops when signal aborts.
// columns, rows: bake resolution (bakeSurface's defaults when left out).
export function bakeInWorker({ sectionMm, sectionLengthMm }, relief, { columns, rows, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Bake canceled.", "AbortError"));
    // Vite finds and bundles workers by this `new Worker(new URL(...))` pattern; the local Worker starts it.
    const Worker = SameOriginWorker;
    const worker = new Worker(new URL("./surface.worker.js", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      reject(new DOMException("Bake canceled.", "AbortError"));
    };
    signal?.addEventListener("abort", stop, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) return onProgress?.(data.progress);
      signal?.removeEventListener("abort", stop);
      worker.terminate();
      resolve(data.bake);
    };
    worker.onerror = (event) => {
      signal?.removeEventListener("abort", stop);
      worker.terminate();
      reject(new Error(`Surface bake failed: ${event.message}`));
    };
    worker.postMessage({
      points: sectionMm.map(({ x, y }) => ({ x, y })),
      length: sectionLengthMm,
      columns,
      rows,
      relief: relief && { data: relief.data, columns: relief.columns, layers: relief.layers, layerMm: relief.layerMm },
    });
  });
}

// Browsers start workers only from the page's own origin. On the website's dev server the page comes from Kirby
// and the modules from Vite on another port, so a same-origin blob imports the worker module instead.
function SameOriginWorker(url, options) {
  if (new URL(url, location.href).origin === location.origin) return new globalThis.Worker(url, options);
  const shim = URL.createObjectURL(new Blob([`import ${JSON.stringify(String(url))};`], { type: "text/javascript" }));
  const worker = new globalThis.Worker(shim, options);
  const revoke = () => URL.revokeObjectURL(shim);
  worker.addEventListener("message", revoke, { once: true });
  worker.addEventListener("error", revoke, { once: true });
  return worker;
}

function texture(data, columns, rows, colorSpace, anisotropy) {
  const map = new DataTexture(data, columns, rows);
  map.colorSpace = colorSpace;
  map.wrapS = RepeatWrapping;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = anisotropy;
  map.needsUpdate = true;
  return map;
}

export function createReliefTexture(columns, layers) {
  const map = new DataTexture(new Uint8Array(columns * layers), columns, layers, RedFormat);
  map.wrapS = RepeatWrapping;
  map.wrapT = ClampToEdgeWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearFilter;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  return map;
}

const VERTEX_HEAD = /* glsl */ `
attribute vec2 aRelief;
uniform sampler2D uRelief;
uniform float uReliefMm;
uniform float uLayerMm;
uniform float uLayers;
uniform float uReliefColumns;
varying float vRelief;
varying float vSide;
varying float vCupY;
float reliefAt(float u, float layer) {
  if (layer < 0.0 || layer >= uLayers) return 0.0;
  return texture(uRelief, vec2(u, (layer + 0.5) / uLayers)).r;
}
`;

// Normal of a surface of revolution pushed out by d(around, up): n - side * grad(d), in object space.
const VERTEX_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
float cupYMm = position.y * 1000.0;
float layer = floor(cupYMm / uLayerMm);
float reliefHere = reliefAt(aRelief.x, layer);
float radiusMm = max(1.0, length(position.xz) * 1000.0);
float du = 1.0 / uReliefColumns;
float slopeAround = (reliefAt(aRelief.x + du, layer) - reliefAt(aRelief.x - du, layer)) * uReliefMm
  / (2.0 * du * 6.28318530718 * radiusMm);
float slopeUp = (reliefAt(aRelief.x, layer + 1.0) - reliefAt(aRelief.x, layer - 1.0)) * uReliefMm / (2.0 * uLayerMm);
vec3 radial = normalize(vec3(position.x + 1e-7, 0.0, position.z));
vec3 around = vec3(radial.z, 0.0, -radial.x);
objectNormal = normalize(objectNormal - aRelief.y * (slopeAround * around + vec3(0.0, slopeUp, 0.0)));
vRelief = reliefHere;
vSide = aRelief.y;
vCupY = cupYMm;
`;

const VERTEX_POSITION = /* glsl */ `
#include <begin_vertex>
transformed += radial * reliefHere * uReliefMm * 0.001;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uToon;
uniform float uLayerMm;
uniform vec3 uToonGlaze;
uniform vec3 uToonClay;
uniform vec3 uToonDeep;
uniform vec3 uToonLight;
varying float vRelief;
varying float vSide;
varying float vCupY;
`;

// Three tones from the geometric normal, flat glaze with raised drawing in clay, thin layer lines.
const FRAGMENT_TOON = /* glsl */ `
#include <dithering_fragment>
if (uToon > 0.0) {
  float lit = dot(normalize(vNormal), normalize(uToonLight));
  float edge = fwidth(lit);
  float tone = 0.8 + 0.12 * smoothstep(-0.1 - edge, -0.1 + edge, lit) + 0.08 * smoothstep(0.55 - edge, 0.55 + edge, lit);
  bool bare = vCupY < 0.6;
  vec3 base = bare || (vSide > 0.0 && vRelief > 0.5) ? uToonClay : vRelief > 0.5 ? uToonDeep : uToonGlaze;
  float bands = vCupY / uLayerMm;
  float width = fwidth(bands);
  float gap = min(fract(bands), 1.0 - fract(bands));
  float line = bare ? 0.0 : (1.0 - smoothstep(0.0, width * 1.5, gap)) * (1.0 - smoothstep(0.15, 0.45, width));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, base * tone * (1.0 - 0.16 * line), uToon);
}
`;

// Plain clay until the baked maps arrive. relief: the texture from createReliefTexture().
export function createCupMaterial(relief) {
  const material = new MeshPhysicalMaterial({ color: new Color(LOOK.clay), roughness: LOOK.clayRoughness, metalness: 0 });
  const uniforms = {
    uRelief: { value: relief },
    uReliefMm: { value: LOOK.reliefMm },
    uLayerMm: { value: LOOK.layerMm },
    uLayers: { value: relief.image.height },
    uReliefColumns: { value: relief.image.width },
    uToon: { value: 0 },
    uToonGlaze: { value: srgb(TOON.glaze) },
    uToonClay: { value: srgb(TOON.clay) },
    uToonDeep: { value: srgb(TOON.deep) },
    uToonLight: { value: new Vector3(...TOON.light) },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <beginnormal_vertex>", VERTEX_NORMAL)
      .replace("#include <begin_vertex>", VERTEX_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace("#include <dithering_fragment>", FRAGMENT_TOON);
  };
  material.customProgramCacheKey = () => "cup-relief-toon";
  return material;
}

export function applySurface(material, { columns, rows, albedo, normal, orm }, anisotropy = 1) {
  for (const key of ["map", "normalMap", "aoMap"]) material[key]?.dispose();
  const ormMap = texture(orm, columns, rows, LinearSRGBColorSpace, anisotropy);
  material.color.set(0xffffff);
  material.map = texture(albedo, columns, rows, SRGBColorSpace, anisotropy);
  material.normalMap = texture(normal, columns, rows, LinearSRGBColorSpace, anisotropy);
  material.aoMap = ormMap;
  material.roughnessMap = ormMap;
  material.roughness = 1;
  material.needsUpdate = true;
}

export function disposeMaterial(material) {
  for (const value of new Set(Object.values(material))) if (value?.isTexture) value.dispose();
  material.userData.uniforms?.uRelief.value.dispose();
  material.dispose();
}
