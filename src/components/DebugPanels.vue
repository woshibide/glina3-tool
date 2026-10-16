<!-- ?debug side panels, laid out as a Baza workspace: global settings and actions on the left, a live
     inspector of the scene and design on the right. The same values are on window.glina for agents. -->
<template>
  <button
    v-if="!settings.left"
    class="panel-toggle left"
    aria-label="Show debug settings"
    title="Show debug settings"
    @click="settings.left = true"
  >
    <Icon name="sliders" />
  </button>
  <aside v-else class="panel card left" aria-label="Debug settings">
    <header class="panel-header">
      <h2>Debug</h2>
      <button class="quiet icon" aria-label="Hide debug settings" title="Hide debug settings" @click="settings.left = false">
        <Icon name="panel-close" />
      </button>
    </header>
    <div class="panel-body">
      <details class="group" open>
        <summary>Flow</summary>
        <div class="segmented">
          <label v-for="step in STEPS" :key="step.id"
            ><input type="radio" name="debug-mode" :value="step.id" :checked="mode === step.id" :disabled="mode === 'baking'" @change="$emit('mode', step.id)" /><span
              ><Icon name="check" class="selection-check" />{{ step.label }}</span
            ></label
          >
        </div>
        <p class="note">Current step: {{ mode }}.</p>
      </details>
      <details class="group" open>
        <summary>Design</summary>
        <div class="actions">
          <button @click="$emit('sample')">Load sample</button>
          <button :disabled="mode === 'baking'" @click="$emit('bake')"><Icon name="flame" />Bake</button>
        </div>
        <div class="actions">
          <button @click="$emit('production')"><Icon name="download" />Production PNG</button>
        </div>
        <p class="note">The production image is the drawing strip, black on white: {{ specSize }}.</p>
      </details>
      <details class="group" open>
        <summary>Export</summary>
        <fieldset :disabled="exporting">
          <legend>Format</legend>
          <div class="segmented">
            <label v-for="(label, format) in FORMATS" :key="format"
              ><input v-model="settings.export.format" type="radio" name="debug-format" :value="format" /><span
                ><Icon name="check" class="selection-check" />{{ label }}</span
              ></label
            >
          </div>
          <div class="stack">
            <SliderControl v-model="settings.export.longEdge" label="Long edge (px)" :min="16" :max="MAX_EDGE" :step="2" />
            <template v-if="settings.export.format !== 'png'">
              <SliderControl v-model="settings.export.fps" label="Frame rate (fps)" :min="1" :max="120" />
              <SliderControl v-model="settings.export.duration" label="One turn (s)" :min="1" :max="MAX_DURATION" :step="0.5" />
            </template>
            <label v-else class="inline"
              ><input v-model="settings.export.transparent" type="checkbox" name="debug-transparent" />Transparent background</label
            >
          </div>
        </fieldset>
        <p class="note">Renders the window's aspect ratio from the current view; video turns the cup once.</p>
        <div class="actions">
          <button class="primary" :disabled="exporting" @click="$emit('export')">
            <Icon name="download" />Export {{ FORMATS[settings.export.format] }}
          </button>
          <button v-if="exporting" @click="$emit('cancel-export')"><Icon name="x" />Cancel</button>
        </div>
        <progress v-if="exportProgress" :value="exportProgress.done" :max="exportProgress.total" aria-label="Export progress" />
        <p class="note" role="status">{{ exportStatus }}</p>
      </details>
    </div>
  </aside>

  <button
    v-if="!settings.right"
    class="panel-toggle right"
    aria-label="Show inspector"
    title="Show inspector"
    @click="settings.right = true"
  >
    <Icon name="sliders" />
  </button>
  <aside v-else class="panel card right" aria-label="Inspector">
    <header class="panel-header">
      <h2>Inspector</h2>
      <button class="quiet icon" aria-label="Hide inspector" title="Hide inspector" @click="settings.right = false">
        <Icon name="panel-right-close" />
      </button>
    </header>
    <div class="panel-body">
      <dl v-for="group in groups" :key="group.title" class="readouts">
        <dt class="group-title">{{ group.title }}</dt>
        <template v-for="[label, value] in group.rows" :key="label">
          <dt>{{ label }}</dt>
          <dd :class="{ error: label === 'Last error' && value }">{{ value === "" ? "–" : value }}</dd>
        </template>
      </dl>
      <p class="note">Console: <code>window.glina</code> has mode, strokes, stats, setMode(), load(), bake(), mask(), shareLink().</p>
    </div>
  </aside>
</template>

<script setup>
import { computed } from "vue";
import Icon from "./Icon.vue";
import SliderControl from "./SliderControl.vue";
import { FORMATS, MAX_DURATION, MAX_EDGE } from "../lib/export.js";

const settings = defineModel("settings", { type: Object, required: true });
const props = defineProps({
  stats: { type: Object, required: true },
  mode: { type: String, required: true },
  exporting: Boolean,
  exportStatus: { type: String, default: "" },
  exportProgress: { type: Object, default: null },
  specSize: { type: String, required: true },
});
defineEmits(["mode", "bake", "sample", "production", "export", "cancel-export"]);

const STEPS = [
  { id: "look", label: "Look" },
  { id: "explore", label: "Explore" },
  { id: "draw", label: "Draw" },
];
const groups = computed(() => {
  const s = props.stats;
  return [
    { title: "Render", rows: [["Frames drawn per second", s.fps], ["Frame time (ms)", s.frameMs], ["Draw calls", s.calls], ["Triangles", s.triangles.toLocaleString("en")], ["Textures", s.textures], ["Geometries", s.geometries], ["Pixel ratio", s.pixelRatio], ["Canvas (px)", s.canvas]] },
    { title: "View", rows: [["Camera (m)", s.camera], ["Cup rotation (°)", s.rotation], ["Strip front (turn)", s.front], ["Toon", s.toon], ["Shift (px)", s.shift]] },
    { title: "Design", rows: [["Strokes", s.strokes], ["Points", s.points], ["Share link (chars)", s.linkChars.toLocaleString("en")], ["Last bake (ms)", s.bakeMs], ["Last error", s.error]] },
  ];
});
</script>

<style scoped>
.panel {
  position: absolute;
  top: var(--gutter);
  bottom: var(--gutter);
  display: flex;
  flex-direction: column;
  z-index: 3;
}
.panel.left { left: var(--gutter); width: 340px; }
.panel.right { right: var(--gutter); width: 320px; }
.panel-toggle {
  position: absolute;
  top: var(--gutter);
  width: 40px;
  height: 40px;
  padding: 0;
  background: var(--paper);
  box-shadow: var(--shadow);
  z-index: 3;
}
.panel-toggle.left { left: var(--gutter); }
.panel-toggle.right { right: var(--gutter); }
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--line-subtle);
}
.panel-header h2 { margin: 0; font-size: 14px; font-weight: 700; }
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 16px;
}
.group { padding: 4px 0 14px; border-bottom: 1px solid var(--line-subtle); }
.group:last-child { border-bottom: 0; }
.group > summary { cursor: pointer; padding: 10px 0; font-weight: 700; }
.stack { display: grid; gap: 12px; margin-top: 12px; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
.actions button { flex: 1; }
.note { margin: 10px 0 0; font-size: 12px; color: var(--muted); }
progress { width: 100%; margin-top: 10px; accent-color: var(--accent); }
.readouts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 12px 0 0;
  font-size: 12px;
}
.readouts .group-title { grid-column: 1 / -1; margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--ink); }
.readouts dt { color: var(--muted); }
.readouts dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.readouts dd.error { color: var(--danger); text-align: left; }
code { font-size: 12px; }
</style>
