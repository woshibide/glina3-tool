// One self-contained renderer + scene + camera. The page owns one stage; each export builds its own
// from a frozen snapshot, so exporting never resizes or advances the live view.
// render(view) draws from explicit values only (rotation, tilt, toon, relief), so preview and export agree.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Group, Mesh, PerspectiveCamera, PMREMGenerator, Scene,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createCupGeometry } from "./cup.js";
import { applySurface, createCupMaterial, createReliefTexture, disposeMaterial } from "./materials.js";
import { LOOK } from "./surface.js";
import { createStripSpec } from "../design/strip.js";

export const FIELD_OF_VIEW = 30;
// Camera and orbit target in metres, framing the 90 mm cup from slightly above.
export const DEFAULT_CAMERA = { position: [0.15, 0.2, 0.3], target: [0, 0.042, 0] };
// The cup tilts around its middle, not its foot.
const PIVOT_M = 0.045;

export function createStage(canvas, { preserveDrawingBuffer = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.8;

  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(0.3, 0.5, 0.4);
  scene.add(key);

  const { geometry, sectionMm, sectionLengthMm } = createCupGeometry();
  const strip = createStripSpec(sectionMm);
  const topMm = Math.max(...sectionMm.map((p) => p.y));
  const layers = Math.ceil(topMm / LOOK.layerMm) + 1;
  const reliefTexture = createReliefTexture(strip.columns, layers);
  const material = createCupMaterial(reliefTexture);
  const uniforms = material.userData.uniforms;
  const cup = new Mesh(geometry, material);
  cup.position.y = -PIVOT_M;
  const spin = new Group();
  spin.add(cup);
  const tilt = new Group();
  tilt.position.y = PIVOT_M;
  tilt.add(spin);
  scene.add(tilt);

  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 10);
  const background = new Color();
  const size = { width: 1, height: 1 };

  function setSize(width, height, pixelRatio = 1) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    size.width = width;
    size.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setCamera({ position, target }) {
    camera.position.fromArray(position);
    camera.lookAt(...target);
  }

  // Fits the picture into the part of the window that floating panels leave free: moves it right and up
  // (same units as setSize) and scales it (zoom below 1 shows more).
  function setFrame({ right = 0, up = 0, zoom = 1 }) {
    camera.zoom = zoom;
    if (Math.abs(right) < 0.5 && Math.abs(up) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, -right, up, size.width, size.height);
    camera.updateProjectionMatrix();
  }

  // view: { background: { hex, alpha }, rotation (radians around the cup's axis),
  //         tilt: [x, z] radians, toon: 0..1 }.
  function render(view, { transparent = false } = {}) {
    background.set(view.background.hex);
    renderer.setClearColor(background, transparent ? 0 : view.background.alpha);
    spin.rotation.y = view.rotation ?? 0;
    tilt.rotation.set(view.tilt?.[0] ?? 0, 0, view.tilt?.[1] ?? 0);
    uniforms.uToon.value = view.toon ?? 0;
    renderer.render(scene, camera);
  }

  // surface: baked maps from bakeInWorker().
  function setSurface(surface) {
    applySurface(material, surface, renderer.capabilities.getMaxAnisotropy());
  }

  // relief: layerRelief() output for this cup's strip.
  function setRelief(relief) {
    if (relief.columns !== strip.columns || relief.layers !== layers) {
      throw new Error(`Relief is ${relief.columns} x ${relief.layers}, the cup needs ${strip.columns} x ${layers}.`);
    }
    reliefTexture.image.data.set(relief.data);
    reliefTexture.needsUpdate = true;
  }

  // Fraction of a turn (strip x) that currently faces the camera.
  const local = new Vector3();
  function frontU() {
    cup.updateWorldMatrix(true, false);
    cup.worldToLocal(local.copy(camera.position));
    return (((Math.atan2(local.x, local.z) / (Math.PI * 2)) % 1) + 1) % 1;
  }

  function dispose() {
    geometry.dispose();
    disposeMaterial(material);
    environment.dispose();
    renderer.dispose();
  }

  return {
    renderer, camera, strip, layers, section: { sectionMm, sectionLengthMm },
    setSize, setCamera, setFrame, setSurface, setRelief, frontU, render, dispose,
  };
}
