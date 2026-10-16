<!-- The floating bar at the bottom centre. One element that changes with the step:
     invite to draw -> drawing panel (tools + strip) -> baking progress -> ready-to-make summary. -->
<template>
  <div class="dock" :class="{ wide: mode === 'draw' }">
    <Transition name="swap" mode="out-in">
      <div v-if="mode === 'baking'" key="baking" class="card pill baking" role="status">
        <svg class="progress" aria-hidden="true">
          <rect x="1" y="1" rx="2" pathLength="1" :style="{ strokeDashoffset: 1 - (progress ?? 0) }" />
        </svg>
        <span>Baking the glaze… {{ Math.round((progress ?? 0) * 100) }}%</span>
        <button class="quiet" @click="$emit('cancel')">Cancel</button>
      </div>

      <section v-else-if="mode === 'draw'" key="draw" class="card panel" aria-label="Drawing">
        <div class="toolbar">
          <div class="segmented tools" role="radiogroup" aria-label="Tool">
            <label v-for="tool in TOOLS" :key="tool.id"
              ><input v-model="settings.tool" type="radio" name="tool" :value="tool.id" /><span
                ><Icon :name="tool.icon" />{{ tool.label }}</span
              ></label
            >
          </div>
          <div class="segmented nibs" role="radiogroup" :aria-label="`${currentToolLabel} nib`">
            <label v-for="preset in NIB_PRESETS" :key="preset.id" :title="nibTitle(preset.nib)"
              ><input
                type="radio"
                :name="`nib-${settings.tool}`"
                :checked="sameNib(nib, preset.nib)"
                @change="settings[settings.tool] = { ...preset.nib }"
              /><span
                ><svg class="glyph" viewBox="-11 -11 22 22" aria-hidden="true"><path :d="glyph(preset.nib)" /></svg
                ><span class="label">{{ preset.label }}</span></span
              ></label
            >
          </div>
          <button class="quiet adjust" :aria-expanded="adjusting" aria-controls="nib-tray" @click="adjusting = !adjusting">
            <Icon name="sliders" /><span class="label">Adjust nib</span>
          </button>
          <span class="spacer" />
          <div class="edit">
          <button class="quiet icon" :disabled="!design.canUndo.value" aria-label="Undo" title="Undo (⌘Z)" @click="design.undo()">
            <Icon name="undo" />
          </button>
          <button class="quiet icon" :disabled="!design.canRedo.value" aria-label="Redo" title="Redo (⇧⌘Z)" @click="design.redo()">
            <Icon name="redo" />
          </button>
          <button class="quiet" :disabled="!design.strokes.value.length" @click="design.clear()">
            <Icon name="trash" /><span class="label">Clear</span>
          </button>
          <button class="quiet icon" aria-label="Close drawing" title="Close drawing" @click="$emit('close')">
            <Icon name="x" />
          </button>
          </div>
        </div>

        <div v-if="adjusting" id="nib-tray" class="tray">
          <fieldset>
            <legend>Shape</legend>
            <div class="segmented">
              <label v-for="shape in NIB_SHAPES" :key="shape"
                ><input
                  type="radio"
                  :name="`shape-${settings.tool}`"
                  :checked="nib.shape === shape"
                  @change="setNib({ shape })"
                /><span>{{ shape[0].toUpperCase() + shape.slice(1) }}</span></label
              >
            </div>
          </fieldset>
          <SliderControl
            :model-value="nib.size"
            label="Size (mm)"
            :min="NIB_SIZE_MM.min"
            :max="NIB_SIZE_MM.max"
            @update:model-value="setNib({ size: $event })"
          />
          <SliderControl
            :model-value="nib.angle"
            label="Angle (°)"
            :min="0"
            :max="179"
            :disabled="nib.shape === 'round'"
            @update:model-value="setNib({ angle: $event })"
          />
          <SliderControl v-model="settings.smoothing" label="Smoothing" :min="0" :max="10" />
        </div>

        <StripCanvas
          :design="design"
          :spec="spec"
          :front="front"
          :span="span"
          :nib="nib"
          :erase="settings.tool === 'eraser'"
          :smoothing="settings.smoothing"
        />

        <div class="footer">
          <div class="soon">
            <button
              v-for="item in SOON"
              :key="item.id"
              class="quiet"
              :aria-expanded="soon === item.id"
              aria-controls="soon-note"
              @click="soon = soon === item.id ? null : item.id"
            >
              {{ item.label }}<span class="badge">Soon</span>
            </button>
          </div>
          <span class="spacer" />
          <p class="notice" role="status">{{ notice }}</p>
          <button class="primary bake" :disabled="!dirty" @click="$emit('bake')"><Icon name="flame" />Bake</button>
        </div>
        <p v-if="soon" id="soon-note" class="soon-note">
          {{ SOON.find((item) => item.id === soon).text }}
          <a :href="newsletterUrl">Sign up for the newsletter</a> to hear when it’s ready.
        </p>
      </section>

      <section v-else-if="design.strokes.value.length && !dirty" key="ready" class="card ready" aria-label="Your cup">
        <h2 class="serif">Your cup is ready to make</h2>
        <p>We print, glaze, and fire it to order. That takes about {{ weeks }} weeks.</p>
        <div class="actions">
          <button class="primary" @click="$emit('order')">Order for €{{ price }}</button>
          <button @click="$emit('share')"><Icon name="share" />Share</button>
          <button class="quiet" @click="$emit('open')"><Icon name="pencil" />Edit drawing</button>
        </div>
        <p class="notice" role="status">{{ notice }}</p>
      </section>

      <div v-else-if="dirty" key="unbaked" class="card pill">
        <span>Bake your drawing to see it in glaze.</span>
        <button class="quiet" @click="$emit('open')"><Icon name="pencil" />Edit</button>
        <button class="primary" @click="$emit('bake')"><Icon name="flame" />Bake</button>
      </div>

      <div v-else key="invite" class="invite">
        <button class="primary" @click="$emit('open')"><Icon name="pencil" />Draw on your cup</button>
        <p class="notice" role="status">{{ notice }}</p>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import SliderControl from "./SliderControl.vue";
import StripCanvas from "./StripCanvas.vue";
import { NIB_PRESETS, NIB_SHAPES, NIB_SIZE_MM, nibPolygon } from "../design/strip.js";

const settings = defineModel("settings", { type: Object, required: true });
defineProps({
  mode: { type: String, required: true },
  design: { type: Object, required: true },
  spec: { type: Object, required: true },
  front: { type: Number, required: true },
  span: { type: Number, required: true },
  dirty: Boolean,
  progress: { type: Number, default: null },
  notice: { type: String, default: "" },
  weeks: { type: Number, required: true },
  price: { type: Number, required: true },
  newsletterUrl: { type: String, required: true },
});
defineEmits(["open", "close", "bake", "cancel", "order", "share"]);

const TOOLS = [
  { id: "brush", label: "Brush", icon: "brush" },
  { id: "eraser", label: "Eraser", icon: "eraser" },
];
const SOON = [
  { id: "text", label: "Text", text: "Writing text on your cup is coming soon." },
  { id: "image", label: "Image", text: "Putting a photo or logo on your cup is coming soon." },
  { id: "shape", label: "Shape", text: "Changing the shape of your cup is coming soon." },
];
const adjusting = ref(false);
const soon = ref(null);

const nib = computed(() => settings.value[settings.value.tool]);
const currentToolLabel = computed(() => TOOLS.find((tool) => tool.id === settings.value.tool).label);
const setNib = (change) => (settings.value[settings.value.tool] = { ...nib.value, ...change });
const sameNib = (a, b) => a.shape === b.shape && a.size === b.size && (a.shape === "round" || a.angle === b.angle);
const nibTitle = ({ shape, size, angle }) => `${shape}, ${size} mm${shape === "round" ? "" : `, ${angle}°`}`;
// Preset glyphs at a fixed scale (20 mm fills the glyph), so presets compare by size at a glance.
function glyph(n) {
  const points = nibPolygon({ ...n, size: Math.max(n.size, 3) });
  return `M${points.map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join("L")}Z`;
}
</script>

<style scoped>
.dock {
  position: absolute;
  left: 50%;
  bottom: var(--gutter);
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100vw - var(--gutter) * 2);
  display: flex;
  justify-content: center;
  z-index: 2;
}
.dock.wide { width: min(960px, calc(100vw - var(--gutter) * 2)); }
.pill {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 14px;
}
.baking { padding-right: 6px; font-variant-numeric: tabular-nums; }
.progress {
  position: absolute;
  inset: -1px;
  width: calc(100% + 2px);
  height: calc(100% + 2px);
  overflow: visible;
  pointer-events: none;
}
.progress rect {
  width: calc(100% - 2px);
  height: calc(100% - 2px);
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-dasharray: 1;
  transition: stroke-dashoffset 160ms linear;
}
.invite {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.invite button { box-shadow: var(--shadow); min-height: 40px; padding: 6px 16px; }
.invite .notice { background: var(--paper); padding: 0 6px; }
.panel {
  container-type: inline-size;
  width: 100%;
  padding: 10px 12px 12px;
  display: grid;
  gap: 10px;
}
.toolbar,
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.spacer { flex: 1; }
.bake { margin-left: auto; }
.edit { display: flex; align-items: center; gap: 2px; }
.tools label > span,
.nibs label > span { gap: 6px; }
.glyph {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
.tray {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 10px 12px 12px;
  background: var(--surface);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius);
}
.tray legend,
.tray :deep(.field-label) {
  font-size: 12px;
  color: var(--muted);
}
.tray :deep(.field-label) { display: block; margin-bottom: 4px; }
.tray :deep(input.number-scrub) { height: 32px; text-align: center; font-variant-numeric: tabular-nums; }
.tray :deep(button) { background: var(--paper); }
.notice {
  margin: 0;
  min-height: 0;
  font-size: 13px;
  color: var(--muted);
}
.notice:empty { display: none; }
.soon { display: flex; gap: 2px; }
.soon button { font-weight: 400; color: var(--muted); }
.badge {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: var(--radius);
  background: var(--soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.soon-note {
  margin: -4px 0 0;
  font-size: 13px;
  color: var(--ink);
}
.ready {
  width: min(520px, calc(100vw - var(--gutter) * 2));
  padding: 14px 16px 16px;
}
.ready h2 { margin: 0 0 2px; font-size: 22px; line-height: 1.3; }
.ready p { margin: 0 0 12px; color: var(--ink); }
.ready .notice { margin: 10px 0 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }

.swap-enter-active,
.swap-leave-active { transition: opacity 160ms ease, transform 200ms ease; }
.swap-enter-from,
.swap-leave-to { opacity: 0; transform: translateY(8px); }

/* Icon-only when the panel is narrow; the label stays for screen readers. */
@container (max-width: 1000px) {
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
@media (max-width: 720px) {
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .nibs label > span { padding: 4px 8px; }
  .tray { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .soon button { padding: 4px 6px; }
  .pill span { font-size: 13px; }
}
</style>
