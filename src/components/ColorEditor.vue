<!-- Collapsed color trigger opens a native popover containing the HSV picker. SV plane uses arrows (Shift: 10); hue and alpha use native sliders. Values commit on blur/Enter; Escape restores. -->
<style scoped>
.trigger-hidden {
  margin-top: 0;
}
.picker-trigger {
  width: 100%;
  justify-content: flex-start;
  padding: 8px;
  gap: 12px;
}
.trigger-swatch {
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 3px;
  overflow: hidden;
}
.trigger-swatch span {
  display: block;
  width: 100%;
  height: 100%;
}
.picker-trigger code {
  font-size: 12px;
}
.picker-panel {
  width: min(540px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--overlay-bg, var(--paper));
  color: var(--ink);
  box-shadow: 0 12px 48px var(--shadow-color, color-mix(in srgb, var(--ink) 15%, transparent));
}
.picker-heading {
  cursor: move;
  touch-action: none;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.picker-heading button {
  padding: 4px 10px;
}

.color-editor {
  margin-top: 16px;
}
.color-surfaces {
  display: grid;
  grid-template-columns: 1fr 1fr 28px;
  gap: 12px;
  align-items: stretch;
}
.current-color {
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.current-color span {
  display: block;
  width: 100%;
  height: 100%;
}
.sv-plane {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  touch-action: none;
  cursor: crosshair;
}
.sv-marker {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-handle-inner);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--color-handle-outer);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.alpha-track {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
}
.alpha-track::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, transparent, var(--color));
}
.alpha-slider {
  position: absolute;
  inset: 0;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 100%;
  height: 100%;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: ns-resize;
}
.hue-slider {
  display: block;
  width: 100%;
  height: 16px;
  margin: 12px 0 16px;
  appearance: none;
  border-radius: 8px;
  background: linear-gradient(
    to right,
    #f00,
    #ff0,
    #0f0,
    #0ff,
    #00f,
    #f0f,
    #f00
  );
  cursor: ew-resize;
}
.hue-slider::-webkit-slider-thumb,
.alpha-slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 20px;
  border: 2px solid var(--color-handle-inner);
  border-radius: 4px;
  background: transparent;
  box-shadow: 0 0 0 1px var(--color-handle-outer);
}
.alpha-slider::-webkit-slider-thumb {
  width: 28px;
  height: 8px;
}
.hue-slider::-moz-range-thumb,
.alpha-slider::-moz-range-thumb {
  width: 10px;
  height: 18px;
  border: 2px solid var(--color-handle-inner);
  border-radius: 4px;
  background: transparent;
  box-shadow: 0 0 0 1px var(--color-handle-outer);
}
.alpha-slider::-moz-range-thumb {
  width: 24px;
  height: 6px;
}
.value-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--line);
  padding: 6px 0;
}
.value-row label {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.value-row input {
  font:
    12px ui-monospace,
    monospace;
  font-variant-numeric: tabular-nums;
  border-color: transparent;
  background: transparent;
  padding: 6px;
}
.value-row input:hover {
  background: var(--surface);
}
.copy-button {
  padding: 0;
  border-color: transparent;
}
.feedback {
  font-size: 12px;
  margin: 4px 0 0;
}
</style>

<template>
  <div class="color-editor" :class="{ 'trigger-hidden': hideTrigger }">
    <button
      v-if="!hideTrigger"
      class="picker-trigger"
      @click="open"
      aria-label="Open color picker"
    >
      <span class="trigger-swatch checker"
        ><span :style="{ background: rgba(model) }"></span
      ></span>
      <code>{{ hexAlpha(model) }}</code>
    </button>
    <div
      ref="panel"
      :id="id + '-picker'"
      popover
      class="picker-panel"
      :style="
        panelPosition
          ? {
              margin: 0,
              inset: 'auto',
              left: panelPosition.x + 'px',
              top: panelPosition.y + 'px',
            }
          : undefined
      "
      role="dialog"
      aria-label="Color picker"
    >
      <div
        class="picker-heading"
        @pointerdown="startPanelDrag"
        @pointermove="movePanel"
        @pointerup="endPanelDrag"
        @pointercancel="endPanelDrag"
        @lostpointercapture="endPanelDrag"
      >
        <strong>Color</strong
        ><button @click="panel.hidePopover()">Close</button>
      </div>
      <div class="color-surfaces">
        <div
          class="current-color checker"
          role="img"
          :aria-label="'Current color ' + hexAlpha(model)"
        >
          <span :style="{ background: rgba(model) }"></span>
        </div>
        <button
          class="sv-plane"
          aria-label="Saturation and brightness"
          :aria-description="`Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%. Use left and right for saturation, up and down for brightness.`"
          :style="{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`,
          }"
          @pointerdown="start"
          @pointermove="drag"
          @pointerup="stop"
          @pointercancel="stop"
          @lostpointercapture="stop"
          @keydown="nudge"
        >
          <span
            class="sv-marker"
            :style="{ left: hsv.s + '%', top: 100 - hsv.v + '%' }"
          ></span>
        </button>
        <div class="alpha-track checker" :style="{ '--color': model.hex }">
          <input
            class="alpha-slider"
            type="range"
            aria-label="Opacity"
            aria-orientation="vertical"
            min="0"
            max="100"
            step="1"
            :value="model.alpha * 100"
            @input="
              model = { ...model, alpha: Number($event.target.value) / 100 }
            "
          />
        </div>
      </div>
      <input
        class="hue-slider"
        type="range"
        aria-label="Hue"
        min="0"
        max="360"
        step="1"
        :value="hsv.h"
        @input="setHsv({ h: Number($event.target.value) })"
      />
      <details class="exact-values">
      <summary>Exact values</summary>
      <div class="exact-values-content">
      <div v-for="format in formats" :key="format" class="value-row">
        <label :for="id + format">{{ format }}</label>
        <input
          :id="id + format"
          :name="format"
          autocomplete="off"
          spellcheck="false"
          :value="editing === format ? draft : values[format]"
          :aria-invalid="errorFormat === format"
          :aria-describedby="
            errorFormat === format ? id + 'feedback' : undefined
          "
          @focus="
            editing = format;
            draft = values[format];
          "
          @input="draft = $event.target.value"
          @blur="commit(format)"
          @keydown.enter="$event.target.blur()"
          @keydown.esc="
            editing = null;
            errorFormat = '';
            $event.target.blur();
          "
        />
        <button
          class="copy-button"
          :aria-label="'Copy ' + format"
          @click="copy(format)"
        >
          <Icon name="copy" />
        </button>
      </div>
      <p v-if="message" :id="id + 'feedback'" class="feedback" role="status">
        {{ message }}
      </p>
      </div>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, useId, onMounted, onUnmounted } from "vue";
import Icon from "./Icon.vue";
import { clamp, rgba, hexAlpha } from "../lib/values.js";
import { rgb, toHsv, fromHsv, hsl, parseColor } from "../lib/color.js";
const model = defineModel({ type: Object, required: true });
defineProps({ hideTrigger: Boolean });
const panel = ref(null);
const panelPosition = ref(null);
let panelDrag = null;
function open() {
  panelPosition.value = null;
  panel.value.showPopover();
}
defineExpose({ open });
function constrainPanel(x, y) {
  const box = panel.value.getBoundingClientRect();
  panelPosition.value = {
    x: clamp(x, 8, Math.max(8, window.innerWidth - box.width - 8)),
    y: clamp(y, 8, Math.max(8, window.innerHeight - box.height - 8)),
  };
}
function startPanelDrag(event) {
  if (event.button !== 0 || event.target.closest("button") || panelDrag) return;
  event.preventDefault();
  const box = panel.value.getBoundingClientRect();
  panelDrag = {
    id: event.pointerId,
    x: event.clientX - box.left,
    y: event.clientY - box.top,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function movePanel(event) {
  if (!panelDrag || panelDrag.id !== event.pointerId) return;
  constrainPanel(event.clientX - panelDrag.x, event.clientY - panelDrag.y);
}
function endPanelDrag(event) {
  if (!panelDrag || panelDrag.id !== event.pointerId) return;
  panelDrag = null;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function resizePanel() {
  if (panelPosition.value && panel.value.matches(":popover-open"))
    constrainPanel(panelPosition.value.x, panelPosition.value.y);
}
onMounted(() => window.addEventListener("resize", resizePanel));
onUnmounted(() => window.removeEventListener("resize", resizePanel));
const id = useId(),
  formats = ["HSL", "RGBA", "HEX"];
const hsv = ref(toHsv(model.value.hex)),
  editing = ref(null),
  draft = ref(""),
  errorFormat = ref(""),
  message = ref("");
const values = computed(() => {
  const [h, s, l] = hsl(model.value.hex);
  return {
    HSL: `hsl(${h}, ${s}%, ${l}%)`,
    RGBA: `rgba(${rgb(model.value.hex).join(", ")}, ${+model.value.alpha.toFixed(3)})`,
    HEX: hexAlpha(model.value),
  };
});
watch(
  () => model.value.hex,
  (hex) => {
    if (hex !== fromHsv(hsv.value.h, hsv.value.s, hsv.value.v))
      hsv.value = toHsv(hex, hsv.value.h);
  },
);
function setHsv(patch) {
  hsv.value = { ...hsv.value, ...patch };
  model.value = {
    ...model.value,
    hex: fromHsv(hsv.value.h, hsv.value.s, hsv.value.v),
  };
}
let pointer = null;
function start(event) {
  if (event.button !== 0 || pointer !== null) return;
  event.preventDefault();
  event.currentTarget.focus();
  pointer = event.pointerId;
  event.currentTarget.setPointerCapture(pointer);
  drag(event);
}
function drag(event) {
  if (pointer !== event.pointerId) return;
  const box = event.currentTarget.getBoundingClientRect();
  setHsv({
    s: clamp(((event.clientX - box.left) / box.width) * 100, 0, 100),
    v: clamp(100 - ((event.clientY - box.top) / box.height) * 100, 0, 100),
  });
}
function stop(event) {
  if (pointer !== event.pointerId) return;
  pointer = null;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function nudge(event) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  setHsv({
    s: clamp(
      hsv.value.s +
        (event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0),
      0,
      100,
    ),
    v: clamp(
      hsv.value.v +
        (event.key === "ArrowDown"
          ? -step
          : event.key === "ArrowUp"
            ? step
            : 0),
      0,
      100,
    ),
  });
}
function commit(format) {
  if (editing.value !== format) return;
  const next = parseColor(format, draft.value, model.value);
  if (next) {
    model.value = next;
    editing.value = null;
    errorFormat.value = "";
    message.value = "";
  } else {
    errorFormat.value = format;
    message.value =
      "Enter " +
      {
        HSL: "hsl(180, 50%, 50%).",
        RGBA: "rgba(0, 128, 255, 0.5).",
        HEX: "#RRGGBB or #RRGGBBAA.",
      }[format];
  }
}
async function copy(format) {
  try {
    await navigator.clipboard.writeText(values.value[format]);
    message.value = format + " copied.";
  } catch {
    message.value = "Copy unavailable. Select the value and copy it manually.";
  }
}
</script>
