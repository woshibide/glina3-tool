<!-- Cup look-development workspace.
     Left: composition, scene, interface, and export settings. Center: the WebGL preview at the export aspect ratio.
     No timeline or inspector yet; the preview fills the center. -->
<template>
  <div class="baza-theme workspace" :data-ui-theme="appearance.theme" :class="{ 'panel-open': state.panelOpen }">
    <div class="main">
      <main ref="stageBox" class="stage" aria-label="Composition preview">
        <div
          class="frame"
          :class="{ checker: state.background.alpha < 1 }"
          :style="{ width: `${frame.width}px`, height: `${frame.height}px` }"
        >
          <canvas ref="canvas" aria-label="Ceramic cup preview; drag to orbit, scroll to zoom" />
        </div>
      </main>
    </div>

    <button
      v-if="!state.panelOpen"
      class="panel-toggle floating"
      aria-label="Show controls"
      title="Show controls"
      @click="state.panelOpen = true"
    >
      <Icon name="sliders" />
    </button>
    <aside v-else class="sidebar floating" aria-label="Controls">
      <header class="sidebar-header">
        <h1>GLINA³ / Cup</h1>
        <button class="icon-button" aria-label="Hide controls" title="Hide controls" @click="state.panelOpen = false">
          <Icon name="panel-close" />
        </button>
      </header>
      <div class="sidebar-body">
        <fieldset :disabled="exporting">
          <details class="group" open>
            <summary>Composition</summary>
            <fieldset>
              <legend>Aspect ratio</legend>
              <div class="segmented">
                <label v-for="(ratio, id) in ASPECTS" :key="id"
                  ><input v-model="state.aspect" type="radio" name="aspect" :value="id" /><span
                    ><Icon name="check" class="selection-check" />{{ id }}</span
                  ></label
                >
              </div>
            </fieldset>
          </details>
          <details class="group" open>
            <summary>Scene</summary>
            <div class="color-row">
              <span class="color-label">Background</span>
              <ColorEditor v-model="state.background" />
            </div>
            <div class="stack">
              <NumberField
                v-model="state.turntable"
                v-model:limits="state.turntableLimits"
                label="Turntable (s per turn)"
                :min="1"
                :max="MAX_DURATION"
                :step="0.1"
              />
            </div>
            <div class="actions">
              <button :aria-pressed="playback.playing" @click="playback.toggle()">
                <Icon :name="playback.playing ? 'pause' : 'play'" />{{ playback.playing ? "Pause" : "Spin" }}
              </button>
              <button @click="resetView"><Icon name="reset" />Reset view</button>
            </div>
            <p class="note">Drag the preview to orbit, right-drag to pan, scroll to zoom.</p>
          </details>
          <details class="group" open>
            <summary>Interface</summary>
            <fieldset>
              <legend>Theme</legend>
              <div class="segmented">
                <label v-for="theme in ['light', 'dark']" :key="theme"
                  ><input v-model="appearance.theme" type="radio" name="theme" :value="theme" /><span
                    ><Icon name="check" class="selection-check" />{{ theme[0].toUpperCase() + theme.slice(1) }}</span
                  ></label
                >
              </div>
            </fieldset>
            <p class="note">{{ status }}</p>
          </details>
          <details class="group" open>
            <summary>Export</summary>
            <fieldset>
              <legend>Format</legend>
              <div class="segmented">
                <label v-for="(label, format) in FORMATS" :key="format"
                  ><input v-model="state.export.format" type="radio" name="export-format" :value="format" /><span
                    ><Icon name="check" class="selection-check" />{{ label }}</span
                  ></label
                >
              </div>
            </fieldset>
            <div class="stack">
              <NumberField v-model="state.export.longEdge" label="Long edge (px)" :min="16" :max="MAX_EDGE" :step="2" />
              <NumberField
                v-if="state.export.format !== 'png'"
                v-model="state.export.fps"
                label="Frame rate (fps)"
                :min="1"
                :max="120"
                :step="0.01"
              />
              <label v-else class="inline"
                ><input v-model="state.export.transparent" type="checkbox" name="transparent" />Transparent background</label
              >
            </div>
            <output class="readout">
              {{ output.width }} × {{ output.height }} px<template v-if="state.export.format !== 'png'">
                · {{ state.turntable.toFixed(2) }} s · {{ frameSchedule(state.turntable, state.export.fps).length }} frames</template
              >
            </output>
            <p class="note">
              {{ state.export.format === "png"
                ? "PNG renders the current view and turntable position."
                : "Video renders one full turn from the current view; background opacity is flattened." }}
            </p>
          </details>
        </fieldset>
        <div class="export-actions">
          <button class="primary" :disabled="exporting" @click="runExport">
            <Icon name="download" />Export {{ FORMATS[state.export.format] }}
          </button>
          <button v-if="exporting" @click="controller?.abort()"><Icon name="x" />Cancel</button>
        </div>
        <progress v-if="progress" :value="progress.done" :max="progress.total" aria-label="Export progress" />
        <p class="status" role="status">{{ exportStatus }}</p>
      </div>
    </aside>

    <p class="desktop-only">This app is meant for desktop. Open it on a larger screen.</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Icon from "./components/Icon.vue";
import NumberField from "./components/NumberField.vue";
import ColorEditor from "./components/ColorEditor.vue";
import { useSavedState } from "./composables/useSavedState.js";
import { usePlayback } from "./composables/usePlayback.js";
import { validLimits } from "./lib/numeric-limits.js";
import { clone, finite, validColor } from "./lib/values.js";
import {
  FORMATS, MAX_DURATION, MAX_EDGE, download, exportCanvas, exportFilename, frameSchedule, outputSize,
} from "./lib/export.js";
import { DEFAULT_CAMERA, createStage } from "./scene/stage.js";
import { loadSurface } from "./scene/materials.js";

const ASPECTS = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};
const point = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, -10, 10));
const { state, status } = useSavedState(
  "glina:cup:v1",
  {
    aspect: "4:5",
    background: { hex: "#efece6", alpha: 1 },
    turntable: 8,
    turntableLimits: { min: 2, max: 30 },
    camera: DEFAULT_CAMERA,
    export: { format: "mp4", longEdge: 1920, fps: 30, transparent: false },
    panelOpen: true,
  },
  {
    aspect: (v) => Object.hasOwn(ASPECTS, v),
    background: validColor,
    turntable: (v) => finite(v, 1, MAX_DURATION),
    turntableLimits: (v) => validLimits(v, { hardMin: 1, hardMax: MAX_DURATION }),
    camera: (v) => v !== null && typeof v === "object" && point(v.position) && point(v.target),
    export: (v) =>
      v !== null && typeof v === "object" && Object.hasOwn(FORMATS, v.format) && Number.isInteger(v.longEdge) &&
      finite(v.longEdge, 16, MAX_EDGE) && finite(v.fps, 1, 120) && typeof v.transparent === "boolean",
    panelOpen: (v) => typeof v === "boolean",
  },
);
// Shared key with the Baza gallery, so both open in the same theme.
const { state: appearance } = useSavedState(
  "baza:ui-appearance:v1",
  { theme: "light" },
  { theme: (value) => value === "light" || value === "dark" },
);

// One clock: the turntable loops over one turn. Time and play state are transient.
const playback = usePlayback({
  total: () => state.value.turntable,
  range: () => ({ start: 0, end: state.value.turntable, loop: true }),
  fps: () => state.value.export.fps,
});

// Preview frame: the composition's aspect ratio, uniformly fitted to the free space.
const size = computed(() => ASPECTS[state.value.aspect]);
const stageBox = ref(null);
const canvas = ref(null);
const frame = reactive({ width: 0, height: 0 });
function fitFrame() {
  if (!stageBox.value) return;
  const box = stageBox.value.getBoundingClientRect();
  const ratio = size.value.width / size.value.height;
  const width = Math.max(1, Math.min(box.width, box.height * ratio));
  frame.width = Math.floor(width);
  frame.height = Math.floor(width / ratio);
}

let preview = null;
let controls = null;
let request = 0;
let sized = "";
function draw() {
  request = 0;
  if (!preview || !frame.width) return;
  const dpr = window.devicePixelRatio || 1;
  const key = `${frame.width}x${frame.height}@${dpr}`;
  if (key !== sized) {
    preview.setSize(frame.width, frame.height, dpr);
    sized = key;
  }
  preview.render(state.value, playback.time);
}
const schedule = () => {
  if (!request) request = requestAnimationFrame(draw);
};
watch(() => playback.time, schedule);
watch(state, schedule, { deep: true });
watch(frame, schedule);
watch(size, fitFrame);
watch(() => state.value.panelOpen, () => nextTick(fitFrame));

function applyCamera(view) {
  preview.setCamera(view);
  controls.target.fromArray(view.target);
  controls.update();
}
function resetView() {
  state.value.camera = clone(DEFAULT_CAMERA);
  applyCamera(state.value.camera);
}

// Export renders a frozen snapshot on its own stage; the preview and controls stay paused until it ends.
const output = computed(() => outputSize(size.value, state.value.export.longEdge));
const exporting = ref(false);
const controller = ref(null);
const progress = ref(null);
const exportStatus = ref("");
watch(exporting, (busy) => {
  if (controls) controls.enabled = !busy;
});
const blockUnload = (event) => event.preventDefault();
async function runExport() {
  if (exporting.value) return;
  const snapshot = clone(state.value);
  const settings = { ...snapshot.export, ...output.value, duration: snapshot.turntable, time: playback.time };
  const video = settings.format !== "png";
  // Video is opaque; PNG may drop the background entirely.
  const look = video ? { ...snapshot, background: { ...snapshot.background, alpha: 1 } } : snapshot;
  const transparent = !video && settings.transparent;
  const wasPlaying = playback.playing;
  playback.playing = false;
  exporting.value = true;
  controller.value = new AbortController();
  window.addEventListener("beforeunload", blockUnload);
  try {
    exportStatus.value = "Baking surface…";
    const surface = await loadSurface(preview.section);
    exportStatus.value = video ? "Preparing encoder…" : "Rendering PNG…";
    const blob = await exportCanvas({
      settings,
      createTarget: ({ width, height }) => {
        const target = document.createElement("canvas");
        const stage = createStage(target, { preserveDrawingBuffer: true });
        stage.setSize(width, height, 1);
        stage.setCamera(snapshot.camera);
        stage.setSurface(surface);
        return { canvas: target, draw: (time) => stage.render(look, time, { transparent }), dispose: stage.dispose };
      },
      signal: controller.value.signal,
      onProgress: (step) => {
        progress.value = step;
        exportStatus.value = step.stage === "finalizing" ? "Finalizing…" : `Rendering frame ${step.done} of ${step.total}`;
      },
    });
    if (controller.value.signal.aborted) throw new DOMException("Export canceled.", "AbortError");
    download(blob, exportFilename("glina-cup", settings));
    exportStatus.value = `Saved ${FORMATS[settings.format]} · ${settings.width} × ${settings.height} px · ${Math.ceil(blob.size / 1024)} KB`;
  } catch (error) {
    exportStatus.value = error.name === "AbortError" ? "Export canceled." : `Export failed: ${error.message}`;
    if (error.name !== "AbortError") console.error(error);
  } finally {
    window.removeEventListener("beforeunload", blockUnload);
    exporting.value = false;
    controller.value = null;
    progress.value = null;
    if (wasPlaying) playback.playing = true;
  }
}

let observer = null;
onMounted(() => {
  preview = createStage(canvas.value);
  loadSurface(preview.section)
    .then((surface) => {
      preview?.setSurface(surface);
      schedule();
    })
    .catch((error) => console.error(error));
  controls = new OrbitControls(preview.camera, canvas.value);
  controls.minDistance = 0.12;
  controls.maxDistance = 1.2;
  applyCamera(state.value.camera);
  // Orbiting redraws live; the view is saved once the gesture ends.
  controls.addEventListener("change", schedule);
  controls.addEventListener("end", () => {
    state.value.camera = { position: preview.camera.position.toArray(), target: controls.target.toArray() };
  });
  observer = new ResizeObserver(fitFrame);
  observer.observe(stageBox.value);
  fitFrame();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(request);
  controls?.dispose();
  preview?.dispose();
  preview = null;
});
</script>

<style scoped>
.workspace {
  --panel-width: 340px;
  --gutter: 16px;
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: var(--ink);
  background: var(--surface);
}
.floating { box-shadow: 0 12px 40px rgb(0 0 0 / 0.18); }
/* The preview sits beside the panel or its collapsed toggle; the panel never covers it. */
.main {
  position: absolute;
  inset: 0 var(--gutter) 0 calc(40px + var(--gutter) * 2);
  display: flex;
  flex-direction: column;
  padding: var(--gutter) 0;
}
.panel-open .main { left: calc(var(--panel-width) + var(--gutter) * 2); }
.stage {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  max-width: none;
  margin: 0;
  padding: 0;
}
.frame {
  outline: 1px solid var(--line);
  --checker-light: #ffffff;
  --checker-dark: #d6d6d6;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
.panel-toggle {
  position: absolute;
  top: var(--gutter);
  left: var(--gutter);
  width: 40px;
  height: 40px;
  min-height: 0;
  padding: 0;
  background: var(--paper);
}
.sidebar {
  position: absolute;
  top: var(--gutter);
  bottom: var(--gutter);
  left: var(--gutter);
  width: var(--panel-width);
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--line);
}
.sidebar-header h1 {
  margin: 0;
  font: 500 14px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace;
  letter-spacing: 0;
}
.icon-button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border-color: transparent;
  background: transparent;
}
.sidebar-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 16px;
}
.group {
  padding: 4px 0 14px;
  border-bottom: 1px solid var(--line);
}
.group:last-child { border-bottom: 0; }
.group > summary {
  cursor: pointer;
  padding: 10px 0;
  font-size: 13px;
  font-weight: 600;
}
.group[open] > summary { margin-bottom: 4px; }
.readout { display: block; margin-top: 10px; font-size: 12px; color: var(--muted); }
.stack {
  display: grid;
  gap: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.actions button { flex: 1; }
.color-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin: 4px 0 12px;
}
.color-label { font-size: 13px; color: var(--muted); }
.color-row :deep(.color-editor) { margin-top: 0; }
.export-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.export-actions .primary {
  flex: 1;
  color: var(--paper);
  background: var(--accent);
  border-color: var(--accent);
}
.export-actions .primary:hover:not(:disabled) { background: var(--muted); }
.export-actions .primary:disabled { color: var(--_disabled-fg); background: var(--soft); }
progress { width: 100%; margin-top: 10px; accent-color: var(--accent); }
.status { min-height: 18px; margin: 8px 0 4px; font-size: 12px; }
.note { font-size: 12px; margin: 10px 0 0; }

.desktop-only { display: none; }
@media (max-width: 720px), (max-height: 480px) {
  .main, .sidebar, .panel-toggle { display: none; }
  .desktop-only {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    padding: 16px;
    text-align: center;
  }
}
</style>
