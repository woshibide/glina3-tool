// Cup material: one MeshPhysicalMaterial fed by baked albedo, normal, and ORM maps (see surface.js).
// Photo-derived or authored maps can later go in public/maps and replace these slots.
import {
  Color, DataTexture, LinearMipmapLinearFilter, LinearSRGBColorSpace, MeshPhysicalMaterial, RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { LOOK } from "./surface.js";

// The bake is deterministic, so it runs once in a worker and every stage (preview and exports) shares it.
let surface = null;

export function loadSurface({ sectionMm, sectionLengthMm }) {
  surface ??= new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./surface.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      resolve(data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      surface = null;
      reject(new Error(`Surface bake failed: ${event.message}`));
    };
    worker.postMessage({ points: sectionMm.map(({ x, y }) => ({ x, y })), length: sectionLengthMm });
  });
  return surface;
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

// Plain clay until the baked maps arrive.
export function createCupMaterial() {
  return new MeshPhysicalMaterial({ color: new Color(LOOK.clay), roughness: LOOK.clayRoughness, metalness: 0 });
}

export function applySurface(material, { columns, rows, albedo, normal, orm }, anisotropy = 1) {
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
  material.dispose();
}
