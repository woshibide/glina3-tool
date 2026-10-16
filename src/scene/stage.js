// One self-contained renderer + scene + camera. The preview owns one stage; each export builds its own
// from a frozen snapshot, so exporting never resizes or advances the live preview.
// render(look, time) is a pure function of saved state and time: preview and export agree.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Mesh, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createCupGeometry } from "./cup.js";
import { applySurface, createCupMaterial, disposeMaterial } from "./materials.js";

export const FIELD_OF_VIEW = 30;
// Camera and orbit target in metres, framing the 90 mm cup from slightly above.
export const DEFAULT_CAMERA = { position: [0.15, 0.2, 0.3], target: [0, 0.042, 0] };

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
  const material = createCupMaterial();
  const cup = new Mesh(geometry, material);
  scene.add(cup);

  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 10);
  const background = new Color();

  function setSize(width, height, pixelRatio = 1) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setCamera({ position, target }) {
    camera.position.fromArray(position);
    camera.lookAt(...target);
  }

  // look: { background: { hex, alpha }, turntable: seconds per turn, 0 for still }.
  function render(look, time, { transparent = false } = {}) {
    background.set(look.background.hex);
    renderer.setClearColor(background, transparent ? 0 : look.background.alpha);
    cup.rotation.y = look.turntable > 0 ? (time / look.turntable) * Math.PI * 2 : 0;
    renderer.render(scene, camera);
  }

  // surface: the baked maps from loadSurface().
  function setSurface(surface) {
    applySurface(material, surface, renderer.capabilities.getMaxAnisotropy());
  }

  function dispose() {
    geometry.dispose();
    disposeMaterial(material);
    environment.dispose();
    renderer.dispose();
  }

  return { renderer, camera, section: { sectionMm, sectionLengthMm }, setSize, setCamera, setSurface, render, dispose };
}
