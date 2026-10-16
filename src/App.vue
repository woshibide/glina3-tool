<!-- Cup designer: the full-window scene with floating controls on top.
     Steps: look (the cup turns, follows the pointer or the phone's tilt) -> explore (drag to orbit, scroll
     or pinch to zoom) -> draw (toon look, drawing strip) -> bake (full glaze, progress) -> ready to make.
     ?debug adds the Baza side panels: global settings on the left, live inspector on the right. -->
<template>
  <div
    class="glina baza-theme"
    data-ui-theme="light"
    :class="{ debug }"
    :style="{ '--inset-left': `${insets.left}px`, '--inset-right': `${insets.right}px` }"
  >
    <canvas
      ref="canvas"
      class="scene"
      :class="{ ready, explorable: mode !== 'look' }"
      aria-label="Your cup in 3D. Drag to turn it; scroll or pinch to zoom."
      @pointerdown="explore"
    />
    <p class="brand serif">GLINA³</p>
    <p v-if="!ready" class="loading" role="status">Preparing the glaze…</p>
    <div v-else-if="mode === 'look'" class="hint">
      <p v-if="notice" role="status">{{ notice }}</p>
      <button class="quiet" @click="explore">{{ coarse ? "Tap" : "Click" }} the cup to explore it</button>
    </div>
    <button
      v-if="mode !== 'look'"
      class="spin icon"
      :aria-pressed="state.autorotate"
      :aria-label="state.autorotate ? 'Stop turning the cup' : 'Turn the cup automatically'"
      :title="state.autorotate ? 'Stop turning' : 'Turn automatically'"
      @click="state.autorotate = !state.autorotate"
    >
      <Icon name="rotate" />
    </button>

    <div v-if="ready && mode !== 'look'" ref="dock" class="dock-anchor">
      <DrawBar
        v-model:settings="state.tools"
        :mode="mode"
        :design="design"
        :spec="spec"
        :front="front"
        :span="span"
        :dirty="dirty"
        :progress="bakeProgress"
        :notice="notice"
        :weeks="PRODUCTION_WEEKS"
        :price="PRICE_EUR"
        :newsletter-url="NEWSLETTER_URL"
        @open="openDrawing"
        @close="mode = 'explore'"
        @bake="bake({ interactive: true })"
        @cancel="bakeController?.abort()"
        @order="order.open()"
        @share="share"
      />
    </div>
    <OrderDialog ref="order" :weeks="PRODUCTION_WEEKS" :price="PRICE_EUR" />

    <DebugPanels
      v-if="debug"
      v-model:settings="state.debug"
      :stats="stats"
      :spec-size="`${spec.columns} × ${spec.rows} px, ${(spec.columns / spec.circumferenceMm).toFixed(1)} px per mm`"
      :mode="mode"
      :exporting="exporting"
      :export-status="exportStatus"
      :export-progress="exportProgress"
      @mode="setMode"
      @bake="bake({ interactive: true })"
      @sample="design.load(sampleStrokes())"
      @production="downloadProduction"
      @export="runExport"
      @cancel-export="exportController?.abort()"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Icon from "./components/Icon.vue";
import DrawBar from "./components/DrawBar.vue";
import OrderDialog from "./components/OrderDialog.vue";
import DebugPanels from "./components/DebugPanels.vue";
import { useSavedState } from "./composables/useSavedState.js";
import { useDesign } from "./composables/useDesign.js";
import { cupSectionMm } from "./scene/cup.js";
import { LOOK } from "./scene/surface.js";
import { DEFAULT_CAMERA, createStage } from "./scene/stage.js";
import { bakeInWorker } from "./scene/materials.js";
import {
  NIB_PRESETS, UNITS, createStripSpec, layerRelief, rasterizeDesign, validDesign, validNib,
} from "./design/strip.js";
import { decodeDesign, encodeDesign } from "./design/codec.js";
import { FORMATS, MAX_DURATION, MAX_EDGE, download, exportCanvas, exportFilename, outputSize } from "./lib/export.js";
import { finite } from "./lib/values.js";

// Product placeholders until the shop exists.
const PRICE_EUR = 60;
const PRODUCTION_WEEKS = 4;
const NEWSLETTER_URL = "#newsletter";
const TURN_SECONDS = 24;
// Share links above this many characters may be cut off by some chat apps.
const LONG_LINK = 8000;

const params = new URLSearchParams(location.search);
const debug = params.has("debug");
const coarse = matchMedia("(pointer: coarse)").matches;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const section = cupSectionMm();
const spec = createStripSpec(section.sectionMm);
const reliefOptions = { layerMm: LOOK.layerMm, topMm: Math.max(...section.sectionMm.map((p) => p.y)) };

const preset = (id) => ({ ...NIB_PRESETS.find((p) => p.id === id).nib });
const { state } = useSavedState(
  "glina:tool:v1",
  {
    strokes: [],
    tools: { tool: "brush", brush: preset("marker"), eraser: preset("block"), smoothing: 4 },
    autorotate: false,
    debug: {
      left: true,
      right: true,
      export: { format: "png", longEdge: 1920, fps: 30, duration: 8, transparent: false },
    },
  },
  {
    strokes: (v) => validDesign({ strokes: v }),
    tools: (v) =>
      v !== null && typeof v === "object" && ["brush", "eraser"].includes(v.tool) && validNib(v.brush) &&
      validNib(v.eraser) && Number.isInteger(v.smoothing) && finite(v.smoothing, 0, 10),
    autorotate: (v) => typeof v === "boolean",
    debug: (v) =>
      v !== null && typeof v === "object" && typeof v.left === "boolean" && typeof v.right === "boolean" &&
      v.export !== null && typeof v.export === "object" && Object.hasOwn(FORMATS, v.export.format) &&
      Number.isInteger(v.export.longEdge) && finite(v.export.longEdge, 16, MAX_EDGE) &&
      finite(v.export.fps, 1, 120) && finite(v.export.duration, 0.5, MAX_DURATION) &&
      typeof v.export.transparent === "boolean",
  },
);

const design = useDesign(spec, state.value.strokes);
watch(design.strokes, (strokes) => (state.value.strokes = strokes));

// Flow. Mode is transient: a reload starts with the look step and the saved drawing baked.
const mode = ref("look");
const ready = ref(false);
const baked = shallowRef(undefined);
const dirty = computed(() => ready.value && design.strokes.value !== baked.value);
const bakeProgress = ref(null);
const bakeController = shallowRef(null);

const notice = ref("");
let noticeTimer = 0;
function showNotice(text) {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = ""), 6000);
}

function explore() {
  if (mode.value === "look") mode.value = "explore";
}
function openDrawing() {
  state.value.autorotate = false;
  mode.value = "draw";
}
function setMode(next) {
  if (next === "draw") openDrawing();
  else mode.value = next;
}

let stage = null;
let controls = null;
let surface = null;
let relief = null;

// interactive: the visitor pressed Bake (progress, then the ready step); otherwise it's the page load.
async function bake({ interactive }) {
  bakeController.value?.abort();
  const controller = new AbortController();
  bakeController.value = controller;
  const strokes = design.strokes.value;
  const started = performance.now();
  const source = layerRelief(rasterizeDesign({ strokes }, spec), spec, reliefOptions);
  if (interactive) {
    mode.value = "baking";
    bakeProgress.value = 0;
  }
  try {
    surface = await bakeInWorker(section, source, {
      signal: controller.signal,
      onProgress: (value) => (bakeProgress.value = value),
    });
    stage?.setSurface(surface);
    baked.value = strokes;
    ready.value = true;
    stats.bakeMs = Math.round(performance.now() - started);
    needsRender = true;
    if (interactive) mode.value = "explore";
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      stats.error = error.message;
      showNotice(`Baking failed: ${error.message}`);
    }
    if (interactive) mode.value = "draw";
  } finally {
    if (bakeController.value === controller) bakeController.value = null;
    bakeProgress.value = null;
  }
}

async function start() {
  const linked = params.get("design");
  if (linked !== null) {
    try {
      const shared = await decodeDesign(linked);
      design.load(shared.strokes);
      showNotice("Opened a shared design.");
    } catch (error) {
      showNotice(error.message);
    }
    // The link has done its job; later edits should not look like the shared design.
    const url = new URL(location.href);
    url.searchParams.delete("design");
    history.replaceState(null, "", url);
  }
  await bake({ interactive: false });
}

async function shareLink() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("design", await encodeDesign({ strokes: design.strokes.value }));
  return url.toString();
}
async function share() {
  try {
    const link = await shareLink();
    const size = `${Math.ceil(link.length / 1000)} KB`;
    if (navigator.share && coarse) await navigator.share({ title: "My GLINA³ cup", url: link });
    else await navigator.clipboard.writeText(link);
    const done = navigator.share && coarse ? "Link shared." : "Link copied.";
    showNotice(link.length > LONG_LINK ? `${done} It's long (${size}), so some chat apps may cut it off.` : done);
  } catch (error) {
    if (error.name !== "AbortError") showNotice(`Couldn't share the link: ${error.message}`);
  }
}

// Scene state the loop eases towards its targets.
const view = { rotation: 0, offset: 0, tilt: [0, 0], toon: 0, shift: [0, 0], zoom: 1 };
const parallax = { x: 0, y: 0 };
const canvas = ref(null);
const dock = ref(null);
const order = ref(null);
const front = ref(0);
const span = ref(1);
const insets = reactive({ left: 0, right: 0 });
let dockHeight = 0;
let needsRender = true;
let reliefDirty = true;
let request = 0;
let last = 0;

watch(() => design.revision.value, () => (reliefDirty = true));
watch(mode, (value) => {
  if (controls) controls.enabled = value !== "look";
  needsRender = true;
});

const stats = reactive({
  fps: 0, frameMs: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, pixelRatio: 1, canvas: "",
  camera: "", rotation: 0, front: 0, toon: 0, shift: "", bakeMs: 0, strokes: 0, points: 0, linkChars: 0, error: "",
});

const approach = (current, target, factor) =>
  Math.abs(target - current) < 1e-4 ? target : current + (target - current) * factor;

let frames = 0;
let statsAt = 0;
function frame(now) {
  request = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (!stage || document.hidden) return;
  const reduce = reducedMotion.matches;
  const ease = (seconds) => (reduce ? 1 : 1 - Math.exp(-dt / seconds));
  const eased = () => [view.offset, ...view.tilt, view.toon, ...view.shift, view.zoom].join();
  const before = eased();

  if ((mode.value === "look" && !reduce) || state.value.autorotate) {
    view.rotation = (view.rotation + (dt * Math.PI * 2) / TURN_SECONDS) % (Math.PI * 2);
    needsRender = true;
  }
  const follow = mode.value === "look" && !reduce ? parallax : { x: 0, y: 0 };
  view.offset = approach(view.offset, follow.x * 0.35, ease(0.4));
  view.tilt[0] = approach(view.tilt[0], follow.y * 0.1, ease(0.4));
  view.tilt[1] = approach(view.tilt[1], -follow.x * 0.05, ease(0.4));
  view.toon = approach(view.toon, mode.value === "draw" || dirty.value ? 1 : 0, ease(0.18));
  // Keep the cup in the space the floating bar and panels leave free.
  const covered = mode.value === "look" || !ready.value ? 0 : dockHeight + 16;
  const free = Math.max(1, window.innerHeight - covered);
  view.shift[0] = approach(view.shift[0], (insets.left - insets.right) / 2, ease(0.15));
  view.shift[1] = approach(view.shift[1], covered / 2, ease(0.15));
  view.zoom = approach(view.zoom, Math.max(0.4, Math.min(1, (free / window.innerHeight) * 1.15)), ease(0.15));
  if (eased() !== before) needsRender = true;

  if (controls.update()) needsRender = true;
  if (reliefDirty) {
    relief = layerRelief(design.mask(), spec, reliefOptions);
    stage.setRelief(relief);
    reliefDirty = false;
    needsRender = true;
  }
  if (needsRender) {
    stage.setFrame({ right: view.shift[0], up: view.shift[1], zoom: view.zoom });
    stage.render({ background: { hex: "#f8f9fa", alpha: 0 }, rotation: view.rotation + view.offset, tilt: view.tilt, toon: view.toon });
    needsRender = false;
    frames++;
  }
  const facing = stage.frontU();
  if (Math.abs(facing - front.value) > 1e-4) front.value = facing;

  if (debug && now - statsAt > 250) {
    const info = stage.renderer.info;
    Object.assign(stats, {
      fps: Math.round((frames * 1000) / (now - statsAt || 1)),
      frameMs: Math.round(dt * 1000),
      calls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      pixelRatio: stage.renderer.getPixelRatio(),
      canvas: `${canvas.value.width} × ${canvas.value.height}`,
      camera: stage.camera.position.toArray().map((v) => v.toFixed(3)).join(", "),
      rotation: Number((((view.rotation + view.offset) * 180) / Math.PI).toFixed(1)),
      front: Number(front.value.toFixed(3)),
      toon: Number(view.toon.toFixed(2)),
      shift: `${view.shift.map((v) => v.toFixed(0)).join(", ")} · zoom ${view.zoom.toFixed(2)}`,
      strokes: design.strokes.value.length,
      points: design.strokes.value.reduce((sum, s) => sum + s.points.length / 2, 0),
    });
    frames = 0;
    statsAt = now;
  }
}

function resize() {
  if (!stage) return;
  // Phones show half a turn of the strip so lines are not too small to draw.
  span.value = window.innerWidth < 640 ? 0.5 : 1;
  stage.setSize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
  needsRender = true;
}

function pointerParallax(event) {
  if (event.pointerType !== "mouse") return;
  parallax.x = (event.clientX / window.innerWidth) * 2 - 1;
  parallax.y = (event.clientY / window.innerHeight) * 2 - 1;
}
// Android reports tilt without asking; iOS asks for permission on a tap, by which time the look step is over.
function tiltParallax(event) {
  if (event.gamma === null || event.beta === null) return;
  parallax.x = Math.max(-1, Math.min(1, event.gamma / 30));
  parallax.y = Math.max(-1, Math.min(1, (event.beta - 45) / 30));
}

function keys(event) {
  if (mode.value !== "draw" || event.target.closest?.("input, select, textarea")) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "z") {
    event.preventDefault();
    if (event.shiftKey) design.redo();
    else design.undo();
  } else if (event.ctrlKey && key === "y") {
    event.preventDefault();
    design.redo();
  }
}

// Debug: production image, sample drawing, exports, and a console API for people and agents.
function downloadProduction() {
  const mask = design.mask();
  const target = document.createElement("canvas");
  target.width = spec.columns;
  target.height = spec.rows;
  const context = target.getContext("2d");
  const image = context.createImageData(spec.columns, spec.rows);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 0 : 255;
    image.data.set([v, v, v, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  target.toBlob((blob) => download(blob, "glina-design-production.png"), "image/png");
}

function sampleStrokes() {
  const wave = [];
  for (let i = 0; i <= 96; i++) wave.push(Math.round((i / 96) * UNITS), Math.round(UNITS * (0.62 + 0.18 * Math.sin((i / 96) * Math.PI * 6))));
  const zigzag = [];
  for (let i = 0; i <= 12; i++) zigzag.push(Math.round(UNITS * (0.4 + i * 0.016)), Math.round(UNITS * (i % 2 ? 0.18 : 0.38)));
  return [
    { erase: false, nib: preset("marker"), points: wave },
    { erase: false, nib: preset("chisel"), points: zigzag },
    { erase: false, nib: preset("block"), points: [Math.round(UNITS * 0.05), Math.round(UNITS * 0.25)] },
  ];
}

const exporting = ref(false);
const exportStatus = ref("");
const exportProgress = ref(null);
const exportController = shallowRef(null);
async function runExport() {
  if (exporting.value || !surface) return;
  const options = state.value.debug.export;
  const size = outputSize({ width: window.innerWidth, height: window.innerHeight }, options.longEdge);
  const settings = { ...options, ...size, time: 0 };
  const video = settings.format !== "png";
  const snapshot = { rotation: view.rotation + view.offset, tilt: [...view.tilt], toon: view.toon };
  const camera = { position: stage.camera.position.toArray(), target: controls.target.toArray() };
  const reliefCopy = { ...relief, data: relief.data.slice() };
  exporting.value = true;
  exportController.value = new AbortController();
  try {
    exportStatus.value = video ? "Preparing encoder…" : "Rendering PNG…";
    const blob = await exportCanvas({
      settings,
      signal: exportController.value.signal,
      createTarget: ({ width, height }) => {
        const target = document.createElement("canvas");
        const exportStage = createStage(target, { preserveDrawingBuffer: true });
        exportStage.setSize(width, height, 1);
        exportStage.setCamera(camera);
        exportStage.setSurface(surface);
        exportStage.setRelief(reliefCopy);
        // Video turns the cup once over the duration, starting from the current view.
        const draw = (time) =>
          exportStage.render(
            {
              background: { hex: "#f8f9fa", alpha: 1 },
              rotation: snapshot.rotation + (video ? (time / settings.duration) * Math.PI * 2 : 0),
              tilt: snapshot.tilt,
              toon: snapshot.toon,
            },
            { transparent: !video && settings.transparent },
          );
        return { canvas: target, draw, dispose: exportStage.dispose };
      },
      onProgress: (step) => {
        exportProgress.value = step;
        exportStatus.value = step.stage === "finalizing" ? "Finalizing…" : `Rendering frame ${step.done} of ${step.total}`;
      },
    });
    download(blob, exportFilename("glina-cup", settings));
    exportStatus.value = `Saved ${FORMATS[settings.format]} · ${settings.width} × ${settings.height} px · ${Math.ceil(blob.size / 1024)} KB`;
  } catch (error) {
    exportStatus.value = error.name === "AbortError" ? "Export canceled." : `Export failed: ${error.message}`;
    if (error.name !== "AbortError") console.error(error);
  } finally {
    exporting.value = false;
    exportController.value = null;
    exportProgress.value = null;
  }
}

watch(
  () => [state.value.debug.left, state.value.debug.right],
  ([left, right]) => {
    insets.left = debug && left ? 340 + 16 : debug ? 56 : 0;
    insets.right = debug && right ? 320 + 16 : debug ? 56 : 0;
  },
  { immediate: true },
);
if (debug) {
  watch(() => design.revision.value, async () => (stats.linkChars = (await shareLink()).length), { immediate: true });
  window.glina = {
    get mode() { return mode.value; },
    get strokes() { return design.strokes.value; },
    get stats() { return { ...stats }; },
    setMode,
    load: (strokes) => design.load(strokes),
    bake: () => bake({ interactive: true }),
    mask: () => design.mask(),
    spec,
    shareLink,
  };
}

let dockObserver = null;
watch(dock, (element) => {
  dockObserver?.disconnect();
  dockHeight = 0;
  if (!element) return;
  dockObserver = new ResizeObserver(() => (dockHeight = element.firstElementChild?.offsetHeight ?? 0));
  dockObserver.observe(element);
  if (element.firstElementChild) dockObserver.observe(element.firstElementChild);
});

onMounted(() => {
  stage = createStage(canvas.value);
  if (surface) stage.setSurface(surface);
  controls = new OrbitControls(stage.camera, canvas.value);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.14;
  controls.maxDistance = 0.9;
  controls.enabled = false;
  stage.setCamera(DEFAULT_CAMERA);
  controls.target.fromArray(DEFAULT_CAMERA.target);
  controls.update();
  controls.addEventListener("change", () => (needsRender = true));
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", pointerParallax);
  window.addEventListener("deviceorientation", tiltParallax);
  window.addEventListener("keydown", keys);
  request = requestAnimationFrame(frame);
  start();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(request);
  bakeController.value?.abort();
  dockObserver?.disconnect();
  window.removeEventListener("resize", resize);
  window.removeEventListener("pointermove", pointerParallax);
  window.removeEventListener("deviceorientation", tiltParallax);
  window.removeEventListener("keydown", keys);
  controls?.dispose();
  stage?.dispose();
  stage = null;
});
</script>

<style>
html,
body {
  height: 100%;
  overflow: hidden;
  background: #f8f9fa;
}
</style>

<style scoped>
.glina {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--surface);
}
.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  opacity: 0;
  cursor: pointer;
  transition: opacity 700ms ease;
}
.scene.ready { opacity: 1; }
.scene.explorable { cursor: grab; }
.scene.explorable:active { cursor: grabbing; }
.brand {
  position: absolute;
  top: 12px;
  left: calc(var(--inset-left) + var(--gutter));
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
  color: var(--ink);
  pointer-events: none;
}
.loading,
.hint {
  position: absolute;
  left: calc((100vw + var(--inset-left) - var(--inset-right)) / 2);
  transform: translateX(-50%);
  margin: 0;
  color: var(--muted);
  white-space: nowrap;
}
.loading { top: 50%; }
.hint {
  bottom: calc(var(--gutter) + 8px);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hint p { margin: 0; color: var(--ink); }
.hint button { font-weight: 400; color: var(--muted); }
.spin {
  position: absolute;
  top: var(--gutter);
  right: calc(var(--inset-right) + var(--gutter));
  background: var(--paper);
  box-shadow: var(--shadow);
}
.dock-anchor {
  position: absolute;
  left: var(--inset-left);
  right: var(--inset-right);
  bottom: 0;
  height: 0;
}
.dock-anchor :deep(.dock) {
  max-width: calc(100vw - var(--inset-left) - var(--inset-right) - var(--gutter) * 2);
}
.dock-anchor :deep(.dock.wide) {
  width: min(960px, calc(100vw - var(--inset-left) - var(--inset-right) - var(--gutter) * 2));
}
</style>
