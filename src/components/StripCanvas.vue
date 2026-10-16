<!-- The drawing strip: the cup's outer wall unrolled, black on white like the production image.
     Its centre is the side of the cup facing the camera; it scrolls (and wraps) as the cup turns.
     Pointer, pen, and finger draw; only the primary pointer draws, so a second finger never scribbles. -->
<template>
  <div ref="box" class="strip" :style="{ aspectRatio: `${(span * spec.circumferenceMm) / spec.heightMm}` }">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="`Drawing strip: the cup's outer wall, unrolled. ${strokeCount} strokes. Draw with a mouse, pen, or finger.`"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @pointerleave="hover = null"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { UNITS, nibPolygon } from "../design/strip.js";

const props = defineProps({
  design: { type: Object, required: true },
  spec: { type: Object, required: true },
  front: { type: Number, required: true }, // turn fraction facing the camera
  span: { type: Number, required: true }, // turn fraction visible across the strip
  nib: { type: Object, required: true },
  erase: Boolean,
  smoothing: { type: Number, required: true }, // 0..10
});

const box = ref(null);
const canvas = ref(null);
const hover = ref(null);
const strokeCount = computed(() => props.design.strokes.value.length);
let context = null;
let image = null;
let pixels = null;
let width = 0;
let height = 0;
let request = 0;

const ink = [32, 33, 34];
function paintMask() {
  const mask = props.design.mask();
  const data = pixels.data;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 0 : 1;
    data[i * 4] = v ? 255 : ink[0];
    data[i * 4 + 1] = v ? 255 : ink[1];
    data[i * 4 + 2] = v ? 255 : ink[2];
    data[i * 4 + 3] = 255;
  }
  image.getContext("2d").putImageData(pixels, 0, 0);
}

const left = () => props.front - props.span / 2;

function draw() {
  request = 0;
  if (!context || !width) return;
  const dpr = window.devicePixelRatio || 1;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = true;
  const turn = width / props.span;
  const start = left();
  for (let k = Math.floor(start) - 1; k <= Math.ceil(start + props.span); k++) {
    context.drawImage(image, (k - start) * turn, 0, turn, height);
  }
  // Ticks every eighth of a turn, longer at the front.
  context.fillStyle = "#72777d";
  for (let k = Math.ceil(start * 8); k <= Math.floor((start + props.span) * 8); k++) {
    const x = Math.round((k / 8 - start) * turn) + 0.5;
    const isFront = Math.abs(k / 8 - props.front) < 1e-6;
    const length = isFront ? 10 : 5;
    context.fillRect(x - 0.5, 0, 1, length);
    context.fillRect(x - 0.5, height - length, 1, length);
  }
  if (hover.value) {
    const scaleX = turn / props.spec.circumferenceMm;
    const scaleY = height / props.spec.heightMm;
    const outline = nibPolygon(props.nib);
    context.beginPath();
    outline.forEach(([x, y], i) => context[i ? "lineTo" : "moveTo"](hover.value.x + x * scaleX, hover.value.y - y * scaleY));
    context.closePath();
    context.lineWidth = 1;
    context.strokeStyle = props.erase ? "#d33" : "#36c";
    context.stroke();
  }
}
const schedule = () => {
  if (!request) request = requestAnimationFrame(draw);
};

function resize() {
  const rect = box.value.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.value.width = Math.max(1, Math.round(width * dpr));
  canvas.value.height = Math.max(1, Math.round(height * dpr));
  schedule();
}

// Pointer position in stroke units: x unwrapped around the turn, y up from the band's bottom.
function toUnits(event) {
  const rect = canvas.value.getBoundingClientRect();
  const u = left() + ((event.clientX - rect.left) / rect.width) * props.span;
  const v = 1 - (event.clientY - rect.top) / rect.height;
  return { x: u * UNITS, y: Math.max(0, Math.min(UNITS, v * UNITS)) };
}

let pointer = null;
let smoothed = null;
let stored = null;
function down(event) {
  if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
  event.preventDefault();
  // Capture keeps the stroke going outside the strip; a pointer the browser no longer tracks cannot be captured.
  try {
    canvas.value.setPointerCapture(event.pointerId);
  } catch {
    // The stroke still works while the pointer stays on the strip.
  }
  pointer = event.pointerId;
  const at = toUnits(event);
  const x = ((Math.round(at.x) % UNITS) + UNITS) % UNITS;
  smoothed = { x, y: at.y };
  stored = { x, y: Math.round(at.y) };
  props.design.begin(stored.x, stored.y, { nib: props.nib, erase: props.erase });
}
function move(event) {
  const rect = canvas.value.getBoundingClientRect();
  if (event.pointerType !== "touch") hover.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  schedule();
  if (event.pointerId !== pointer) return;
  // Smoothing 0 follows the pointer exactly; 10 trails it heavily, steadying shaky lines.
  const follow = 1 - props.smoothing * 0.085;
  // Coalesced samples keep fast strokes smooth; synthetic events report none.
  const samples = event.getCoalescedEvents?.() ?? [];
  for (const sample of samples.length ? samples : [event]) {
    const at = toUnits(sample);
    let x = at.x;
    while (x - smoothed.x > UNITS / 2) x -= UNITS;
    while (smoothed.x - x > UNITS / 2) x += UNITS;
    smoothed = { x: smoothed.x + (x - smoothed.x) * follow, y: smoothed.y + (at.y - smoothed.y) * follow };
    const dx = ((smoothed.x - stored.x) / UNITS) * props.spec.columns;
    const dy = ((smoothed.y - stored.y) / UNITS) * props.spec.rows;
    if (Math.hypot(dx, dy) < 0.75) continue;
    stored = { x: Math.round(smoothed.x), y: Math.round(smoothed.y) };
    props.design.extend(stored.x, stored.y);
  }
}
function up(event) {
  if (event.pointerId !== pointer) return;
  pointer = null;
  props.design.end();
}

watch(() => props.design.revision.value, () => {
  if (image) paintMask();
  schedule();
});
watch(() => [props.front, props.span, props.nib, props.erase], schedule, { deep: true });

let observer = null;
onMounted(() => {
  context = canvas.value.getContext("2d");
  image = document.createElement("canvas");
  image.width = props.spec.columns;
  image.height = props.spec.rows;
  pixels = new ImageData(props.spec.columns, props.spec.rows);
  paintMask();
  observer = new ResizeObserver(resize);
  observer.observe(box.value);
  resize();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(request);
  if (pointer !== null) props.design.end();
});
</script>

<style scoped>
.strip {
  position: relative;
  width: 100%;
  background: #fff;
  outline: 1px solid var(--line);
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
}
</style>
